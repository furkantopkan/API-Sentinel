import type { HttpMethod } from '@api-sentinel/shared';
import type { Readable, Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { request, type Dispatcher } from 'undici';
import { botBlockMessage } from '../botBlock';
import { createCookieJar, type CookieJar } from '../cookieJar';
import { AppError } from '../../errors/AppError';

export interface OutgoingRequest {
  method: HttpMethod;
  url: URL;
  headers: Record<string, string>;
  body: string | undefined;
  timeoutMs: number;
  followRedirects: boolean;
}

export interface ExecutorContext {
  /** Picks (and SSRF-checks) the connection pool for each hop. */
  dispatcherFor: (url: URL) => Dispatcher;
  /**
   * Cookies, as a browser keeps them: sent on every hop to the address they
   * belong to, and learned from every answer, redirects included (a login
   * often sets its session cookie on the redirect). A run passes its own jar;
   * otherwise the cookies live only as long as this one request.
   */
  cookies?: CookieJar;
  maxResponseBytes: number;
  maxRedirects: number;
  /** Aborted when our own client disconnects. */
  signal?: AbortSignal;
}

export interface RawResponse {
  status: number;
  headers: [string, string][];
  bodyBytes: Buffer;
  finalUrl: string;
  redirects: { status: number; location: string }[];
  durationMs: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Headers that must not leak to another origin after a redirect. */
const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

type HeaderValue = string | string[] | undefined;

function firstValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function flattenHeaders(headers: Record<string, HeaderValue>): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const item of value) pairs.push([name, item]);
    else if (value !== undefined) pairs.push([name, value]);
  }
  return pairs;
}

function tooLarge(maxBytes: number): AppError {
  return new AppError(
    'RESPONSE_TOO_LARGE',
    `Response body exceeds the limit of ${maxBytes} bytes.`,
    502,
    { maxBytes },
  );
}

function decoderFor(encoding: string | undefined): Transform | undefined {
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return createGunzip();
    case 'deflate':
      return createInflate();
    case 'br':
      return createBrotliDecompress();
    default:
      return undefined; // identity or unknown: keep the raw bytes
  }
}

/**
 * Reads the body as a stream and stops as soon as the limit is crossed, so a
 * huge (or endless) response never fills the server's memory. The limit is
 * applied AFTER decompression, which also stops "zip bombs".
 */
async function readBodyWithLimit(
  response: Dispatcher.ResponseData,
  maxBytes: number,
): Promise<Buffer> {
  const encoding = firstValue(response.headers['content-encoding']);
  const declaredLength = Number(firstValue(response.headers['content-length']));
  if (encoding === undefined && declaredLength > maxBytes) {
    response.body.destroy();
    throw tooLarge(maxBytes);
  }

  const decoder = decoderFor(encoding);
  let stream: Readable = response.body;
  if (decoder) {
    response.body.on('error', (error) => decoder.destroy(error));
    stream = response.body.pipe(decoder);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > maxBytes) {
      response.body.destroy();
      decoder?.destroy();
      throw tooLarge(maxBytes);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

/**
 * Sends the request with undici. Redirects are followed manually so that every
 * hop is SSRF-checked again (dispatcherFor) and credentials are dropped when
 * the origin changes. The timeout covers the whole exchange.
 */
export async function executeHttp(
  input: OutgoingRequest,
  context: ExecutorContext,
): Promise<RawResponse> {
  const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
  const startedAt = performance.now();

  let { method, body } = input;
  let url = input.url;
  const headers = { ...input.headers };
  const redirects: RawResponse['redirects'] = [];
  const jar = context.cookies ?? createCookieJar();
  // Akamai's bot protection answers a test tool by sending it back to the same address.
  let botCookie = false;

  try {
    for (let hop = 0; ; hop++) {
      // A Cookie header the user wrote wins (and is dropped when the origin changes).
      const fromJar = headers.cookie === undefined ? jar.headerFor(url.toString()) : undefined;
      const response = await request(url, {
        method,
        headers: fromJar === undefined ? headers : { ...headers, cookie: fromJar },
        body,
        signal,
        dispatcher: context.dispatcherFor(url),
      });

      const answered = flattenHeaders(response.headers);
      jar.store(url.toString(), answered);
      botCookie ||= answered.some(
        ([name, value]) => name === 'set-cookie' && /^\s*(_abck|bm_sz)=/.test(value),
      );
      const location = firstValue(response.headers.location);
      const isRedirect = REDIRECT_STATUSES.has(response.statusCode) && location !== undefined;

      if (!input.followRedirects || !isRedirect) {
        const bodyBytes = await readBodyWithLimit(response, context.maxResponseBytes);
        return {
          status: response.statusCode,
          headers: answered,
          bodyBytes,
          finalUrl: url.toString(),
          redirects,
          durationMs: Math.round(performance.now() - startedAt),
        };
      }

      await response.body.dump(); // discard the redirect page
      if (hop >= context.maxRedirects) {
        const toItself = redirects.every((r) => r.location === url.toString());
        if (toItself && botCookie) {
          throw new AppError(
            'BLOCKED_BY_SITE',
            botBlockMessage('it sends the request back to the same address, again and again'),
            502,
          );
        }
        if (toItself) {
          throw new AppError(
            'TOO_MANY_REDIRECTS',
            `The site keeps redirecting to the same address; stopped after ${context.maxRedirects} redirects.`,
            502,
            { redirects: redirects.length },
          );
        }
        throw new AppError(
          'TOO_MANY_REDIRECTS',
          `Stopped after ${context.maxRedirects} redirects.`,
          502,
          { redirects: redirects.length },
        );
      }

      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new AppError('INVALID_URL', 'The target redirected to an invalid URL.', 502);
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new AppError(
          'INVALID_URL',
          `The target redirected to an unsupported protocol "${next.protocol}".`,
          502,
        );
      }
      redirects.push({ status: response.statusCode, location: next.toString() });

      // Same rules as browsers: 303 (and 301/302 after POST) continue as GET without a body.
      if (response.statusCode === 303 || (response.statusCode <= 302 && method === 'POST')) {
        method = 'GET';
        body = undefined;
        delete headers['content-type'];
      }
      if (next.origin !== url.origin) {
        for (const name of CREDENTIAL_HEADERS) delete headers[name];
      }
      url = next;
    }
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new AppError('TIMEOUT', `Target did not respond within ${input.timeoutMs} ms.`, 504, {
        timeoutMs: input.timeoutMs,
      });
    }
    throw error;
  }
}
