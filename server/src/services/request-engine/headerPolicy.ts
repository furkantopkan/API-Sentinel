import type { AuthConfig } from '@api-sentinel/shared';
import { AppError } from '../../errors/AppError';
import { authorizationHeaderFor } from './authApplier';

/**
 * Headers the user may not set: they describe the connection or message framing
 * and are managed by the HTTP client. Letting users set them enables request
 * smuggling or routing tricks (e.g. a fake Host header).
 */
export const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'proxy-connection',
  'expect',
]);

/** RFC 9110 "token": the characters allowed in a header name. */
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
/** CR/LF would let a value start a new header line (header injection). */
const LINE_BREAK_OR_NUL = /[\r\n\0]/;

interface HeaderRow {
  key: string;
  value: string;
  enabled: boolean;
}

export interface OutgoingHeaderOptions {
  hasBody: boolean;
  userAgent: string;
}

/**
 * Validates the user's header rows and builds the final header object
 * (lower-case names). Adds Authorization, a JSON Content-Type when there is a
 * body, and default Accept / User-Agent / Accept-Encoding unless the user set them.
 */
export function buildOutgoingHeaders(
  rows: readonly HeaderRow[],
  auth: AuthConfig,
  options: OutgoingHeaderOptions,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const row of rows) {
    const name = row.key.trim();
    if (!row.enabled || name === '') continue;

    if (!HEADER_NAME.test(name)) {
      throw new AppError('VALIDATION_ERROR', `Invalid header name "${name}".`, 400);
    }
    const lowerName = name.toLowerCase();
    if (FORBIDDEN_HEADERS.has(lowerName)) {
      throw new AppError(
        'FORBIDDEN_HEADER',
        `Header "${name}" is managed automatically and cannot be set.`,
        400,
      );
    }
    if (LINE_BREAK_OR_NUL.test(row.value)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Header "${name}" contains line breaks or NUL characters.`,
        400,
      );
    }
    // Repeated headers are combined with ", " (allowed by RFC 9110).
    const existing = headers[lowerName];
    headers[lowerName] = existing === undefined ? row.value : `${existing}, ${row.value}`;
  }

  const authorization = authorizationHeaderFor(auth);
  if (authorization !== undefined) {
    if (headers.authorization !== undefined) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Authorization is set both in the Auth tab and as a header. Use only one.',
        400,
      );
    }
    headers.authorization = authorization;
  }

  if (options.hasBody) headers['content-type'] ??= 'application/json';
  headers.accept ??= '*/*';
  headers['user-agent'] ??= options.userAgent;
  headers['accept-encoding'] ??= 'gzip, deflate, br';

  return headers;
}
