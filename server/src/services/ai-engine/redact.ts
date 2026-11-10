import type { AiRequestContext, AiResponseContext } from '@api-sentinel/shared';

/**
 * Removes secrets before anything is sent to the AI provider.
 *
 * The request/response the user is testing may contain real credentials
 * (Authorization, cookies, API keys in the query string or in JSON bodies).
 * The model does not need the values to suggest tests, so we replace them.
 */

export const REDACTED = '[REDACTED]';

const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
]);

/** Names that usually hold secrets: query parameters, JSON keys, header names. */
const SECRET_NAME =
  /(pass(word|wd)?|secret|token|api[-_]?key|apikey|auth|credential|session|private[-_]?key|signature|^sig$|^key$)/i;

export function redactHeaders(headers: readonly [string, string][]): [string, string][] {
  return headers.map(([name, value]) => [
    name,
    SECRET_HEADERS.has(name.toLowerCase()) || SECRET_NAME.test(name) ? REDACTED : value,
  ]);
}

export function redactUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw; // not a valid URL: nothing structured to redact
  }
  if (url.username || url.password) {
    url.username = url.username ? 'REDACTED' : '';
    url.password = url.password ? 'REDACTED' : '';
  }
  for (const key of [...url.searchParams.keys()]) {
    if (SECRET_NAME.test(key)) url.searchParams.set(key, REDACTED);
  }
  return url.toString();
}

/** Replaces values of secret-looking keys anywhere in a JSON document. */
function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SECRET_NAME.test(key) && child !== null && typeof child !== 'object'
          ? REDACTED
          : redactJsonValue(child),
      ]),
    );
  }
  return value;
}

/**
 * JSON bodies are redacted by key. Other text is kept as is - we cannot tell
 * secrets apart from data there - except for common "Bearer xyz" patterns.
 */
export function redactBody(body: string): string {
  let exact = true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body, (_key, value: unknown) => {
      if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
        exact = false;
      }
      return value;
    });
  } catch {
    return isForm(body) ? redactForm(body) : redactText(body);
  }
  // Re-serialising would round integers beyond 2^53 and mislead the model about
  // the data; keep such documents as text instead.
  return exact ? JSON.stringify(redactJsonValue(parsed), null, 2) : redactText(body);
}

/** name=value&name2=value2, as a login or cart form sends it. */
const isForm = (body: string): boolean => /^[^\s=&]+=[^\s]*$/.test(body.trim());

/** Rebuilt by hand: URLSearchParams would encode the marker, and the draft check looks for it as is. */
function redactForm(body: string): string {
  return body
    .trim()
    .split('&')
    .map((pair) => {
      const name = pair.split('=', 1)[0] ?? '';
      let key = name;
      try {
        key = decodeURIComponent(name.replace(/\+/g, ' '));
      } catch {
        // Not valid percent-encoding: judge the name as written.
      }
      return SECRET_NAME.test(key) ? `${name}=${REDACTED}` : pair;
    })
    .join('&');
}

function redactText(text: string): string {
  return text
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`)
    .replace(
      /("[^"]*(?:pass(?:word)?|secret|token|api[-_]?key|auth)[^"]*"\s*:\s*)"[^"]*"/gi,
      `$1"${REDACTED}"`,
    );
}

export function redactRequest(request: AiRequestContext): AiRequestContext {
  return {
    ...request,
    url: redactUrl(request.url),
    headers: redactHeaders(request.headers),
    body: request.body === '' ? '' : redactBody(request.body),
  };
}

export function redactResponse(response: AiResponseContext): AiResponseContext {
  return {
    ...response,
    headers: redactHeaders(response.headers),
    body:
      response.bodyKind === 'json' || response.bodyKind === 'text' ? redactBody(response.body) : '',
  };
}
