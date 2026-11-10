import { z } from 'zod';
import {
  MAX_RECORDED_BODY,
  MAX_RECORDED_ENTRIES,
  MAX_RESPONSE_SAMPLE,
  type RecordedEntry,
} from '../schemas/builder';
import { HTTP_METHODS, type HttpMethod } from '../schemas/http';
import { FORM_CONTENT_TYPE, multipartToForm } from '../body/formBody';
import { looksLikeJson, responseSampleText } from './pageText';

/**
 * Reads a HAR file (the network log browsers can export) and keeps what a
 * test flow can use, without duplicates:
 * - API calls the page made (JSON answers, also when mislabelled as text);
 * - changes the page sent (POST, PUT, PATCH, DELETE), whatever they answer;
 * - the pages the user opened on the site, as plain text.
 * Images, scripts, styles and other sites' pages are left out. Runs in the
 * browser, so the full recording, which may be large and sensitive, never leaves it.
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
  /\/api\/\d+\/(envelope|store)\/|\/cdn-cgi\/|\/\/([^/]*\.)?(sentry\.io|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|doubleclick\.net|hotjar\.(com|io)|clarity\.ms|segment\.(io|com)|mixpanel\.com|amplitude\.com|nr-data\.net|datadoghq\.(com|eu))\//i;

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

function hostOf(url: string): string | null {
  try {
    const { protocol, host } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? host : null;
  } catch {
    return null;
  }
}

type Kind = 'api' | 'write' | 'page';

/** Which of the three useful kinds an exchange is, or null to leave it out. */
function kindOf(
  method: string,
  resourceType: string | undefined,
  mime: string,
  text: string,
  status: number,
): Kind | null {
  if (resourceType === 'document') {
    // Only pages that loaded; a redirect shows up again as the page it led to.
    return method === 'GET' && status >= 200 && status < 300 && /html/i.test(mime) ? 'page' : null;
  }
  // Chrome labels entries; other browsers do not, so the content decides too.
  if (resourceType !== undefined && resourceType !== 'xhr' && resourceType !== 'fetch') {
    return null;
  }
  if (/json/i.test(mime) || looksLikeJson(text)) return 'api';
  return method !== 'GET' && status < 400 ? 'write' : null;
}

/** Multipart forms become urlencoded forms, which the request builder can send. */
function requestBodyAndHeaders(
  text: string,
  headers: [string, string][],
): { body: string; headers: [string, string][] } {
  const contentType = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? '';
  const form = /multipart\/form-data/i.test(contentType)
    ? multipartToForm(text, contentType)
    : null;
  if (form === null) return { body: text, headers };
  return {
    body: form,
    headers: headers.map(([name, value]): [string, string] =>
      name.toLowerCase() === 'content-type' ? [name, FORM_CONTENT_TYPE] : [name, value],
    ),
  };
}

export function parseHar(json: unknown): ParseHarResult {
  const parsed = harSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: 'This file is not a valid HAR recording.' };

  const seen = new Set<string>();
  const entries: RecordedEntry[] = [];
  // The site is the one of the first page: pages of other sites (ads, widgets) are not part of the flow.
  let siteHost: string | null = null;

  for (const entry of parsed.data.log.entries) {
    const { request, response, _resourceType: resourceType } = entry;
    const mime = response.content.mimeType ?? '';
    const method = request.method.toUpperCase();
    const host = hostOf(request.url);
    const text = response.content.encoding === 'base64' ? '' : (response.content.text ?? '');

    if (
      !isMethod(method) ||
      host === null ||
      TELEMETRY_URL.test(request.url) ||
      request.url.length > 8192 ||
      response.status <= 0
    ) {
      continue;
    }
    const kind = kindOf(method, resourceType, mime, text, response.status);
    if (kind === null) continue;
    if (kind === 'page') {
      siteHost ??= host;
      if (host !== siteHost) continue;
    }

    const key = `${method} ${request.url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const recorded = requestBodyAndHeaders(
      request.postData?.text ?? '',
      request.headers
        .filter((header) => keepHeader(header.name))
        .slice(0, 50)
        .map((header): [string, string] => [
          header.name.slice(0, 1024),
          header.value.slice(0, 8192),
        ]),
    );
    entries.push({
      index: entries.length,
      method,
      url: request.url,
      status: Math.trunc(response.status),
      requestHeaders: recorded.headers,
      requestBody: recorded.body.slice(0, MAX_RECORDED_BODY),
      responseContentType: mime.slice(0, 200),
      responseSample: responseSampleText(mime, text).slice(0, MAX_RESPONSE_SAMPLE),
    });
  }

  return { ok: true, entries: entries.slice(0, MAX_RECORDED_ENTRIES), found: entries.length };
}
