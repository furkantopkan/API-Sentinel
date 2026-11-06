import type { ExecutedResponse, ResponseBody } from '@api-sentinel/shared';
import { STATUS_CODES } from 'node:http';
import type { RawResponse } from './httpExecutor';

const JSON_CONTENT_TYPE = /^application\/([\w.+-]+\+)?json\b/i;

function headerValue(headers: [string, string][], name: string): string | undefined {
  return headers.find(([key]) => key.toLowerCase() === name)?.[1];
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decides how the body should be shown:
 * - empty   → no bytes
 * - binary  → bytes that are not valid UTF-8 (images, archives, ...)
 * - json    → declared as JSON (or no Content-Type) and parses as JSON
 * - text    → everything else; `malformedJson` flags "declared JSON but invalid"
 */
export function classifyBody(bytes: Buffer, contentType: string | undefined): ResponseBody {
  if (bytes.length === 0) return { kind: 'empty' };

  let text: string;
  try {
    // fatal: throw on invalid UTF-8 instead of inserting replacement characters
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { kind: 'binary' };
  }

  const declaredJson = contentType !== undefined && JSON_CONTENT_TYPE.test(contentType);
  if ((declaredJson || contentType === undefined) && isJson(text)) {
    return { kind: 'json', text };
  }
  return { kind: 'text', text, malformedJson: declaredJson };
}

export function normalizeResponse(raw: RawResponse): ExecutedResponse {
  return {
    status: raw.status,
    // HTTP/2 has no reason phrase, so use the standard text for the code.
    statusText: STATUS_CODES[raw.status] ?? '',
    headers: raw.headers,
    body: classifyBody(raw.bodyBytes, headerValue(raw.headers, 'content-type')),
    sizeBytes: raw.bodyBytes.length,
    durationMs: raw.durationMs,
    finalUrl: raw.finalUrl,
    redirects: raw.redirects,
  };
}
