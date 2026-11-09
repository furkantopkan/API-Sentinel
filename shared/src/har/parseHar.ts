import { z } from 'zod';
import {
  MAX_RECORDED_BODY,
  MAX_RECORDED_ENTRIES,
  MAX_RESPONSE_SAMPLE,
  type RecordedEntry,
} from '../schemas/builder';
import { HTTP_METHODS, type HttpMethod } from '../schemas/http';

/**
 * Reads a HAR file (the network log browsers can export) and keeps only the
 * API traffic: no images, scripts or HTML, no duplicates. Runs in the browser,
 * so the full recording, which may be large and sensitive, never leaves it.
 */

const nameValue = z.object({ name: z.string(), value: z.string() });

const harSchema = z.object({
  log: z.object({
    entries: z.array(
      z.object({
        _resourceType: z.string().optional(),
        request: z.object({
          method: z.string(),
          url: z.string(),
          headers: z.array(nameValue),
          postData: z.object({ text: z.string().optional() }).optional(),
        }),
        response: z.object({
          status: z.number(),
          content: z.object({
            mimeType: z.string().optional(),
            text: z.string().optional(),
            encoding: z.string().optional(),
          }),
        }),
      }),
    ),
  }),
});

/** One network exchange, as in a HAR file. The live recorder produces the same shape. */
export type HarEntry = z.infer<typeof harSchema>['log']['entries'][number];

/** Error reporting and analytics: never part of a flow, and they use up the entry limit. */
const TELEMETRY_URL =
  /\/api\/\d+\/(envelope|store)\/|\/\/([^/]*\.)?(sentry\.io|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|doubleclick\.net|hotjar\.(com|io)|clarity\.ms|segment\.(io|com)|mixpanel\.com|amplitude\.com|nr-data\.net|datadoghq\.(com|eu))\//i;

/** Added by the browser or tied to its session; a saved request must not depend on them. */
const DROPPED_HEADERS = new Set([
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'content-length',
  'cookie',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'priority',
  'referer',
  'te',
  'user-agent',
]);

export type ParseHarResult =
  { ok: true; entries: RecordedEntry[]; found: number } | { ok: false; error: string };

function keepHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return !lower.startsWith(':') && !lower.startsWith('sec-') && !DROPPED_HEADERS.has(lower);
}

const isMethod = (method: string): method is HttpMethod =>
  (HTTP_METHODS as readonly string[]).includes(method);

function isHttp(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseHar(json: unknown): ParseHarResult {
  const parsed = harSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'This file is not a valid HAR recording.' };

  const seen = new Set<string>();
  const entries: RecordedEntry[] = [];

  for (const entry of parsed.data.log.entries) {
    const { request, response, _resourceType: resourceType } = entry;
    const mime = response.content.mimeType ?? '';
    const method = request.method.toUpperCase();
    // Chrome labels entries; other browsers do not, so the content type decides too.
    const browserSaysApi =
      resourceType === undefined || resourceType === 'xhr' || resourceType === 'fetch';
    const noContentWrite = method !== 'GET' && mime === '' && response.status < 400;

    if (
      !isMethod(method) ||
      !isHttp(request.url) ||
      TELEMETRY_URL.test(request.url) ||
      request.url.length > 8192 ||
      response.status <= 0 ||
      !browserSaysApi ||
      !(mime.toLowerCase().includes('json') || noContentWrite)
    ) {
      continue;
    }

    const key = `${method} ${request.url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const text = response.content.encoding === 'base64' ? '' : (response.content.text ?? '');
    entries.push({
      index: entries.length,
      method,
      url: request.url,
      status: Math.trunc(response.status),
      requestHeaders: request.headers
        .filter((header) => keepHeader(header.name))
        .slice(0, 50)
        .map((header): [string, string] => [
          header.name.slice(0, 1024),
          header.value.slice(0, 8192),
        ]),
      requestBody: (request.postData?.text ?? '').slice(0, MAX_RECORDED_BODY),
      responseContentType: mime.slice(0, 200),
      responseSample: text.slice(0, MAX_RESPONSE_SAMPLE),
    });
  }

  return { ok: true, entries: entries.slice(0, MAX_RECORDED_ENTRIES), found: entries.length };
}
