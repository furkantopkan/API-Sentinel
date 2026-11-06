import { AppError } from '../../errors/AppError';
import { BlockedTargetError } from './ssrfGuard';

const TLS_ERROR = /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_)/;

/** Low-level errors are often wrapped (error.cause); look a few levels deep. */
function* causeChain(error: unknown): Generator<unknown> {
  let current = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    yield current;
    current = current instanceof Error ? current.cause : undefined;
  }
}

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
}

/**
 * Translates network/undici/DNS errors into user-facing AppErrors.
 * Messages mention only the host, never paths, query strings or credentials.
 * Returns undefined for unknown errors (they become INTERNAL_ERROR).
 */
export function mapRequestError(error: unknown, host: string): AppError | undefined {
  for (const item of causeChain(error)) {
    if (item instanceof AppError) return item;

    if (item instanceof BlockedTargetError) {
      return new AppError(
        'BLOCKED_TARGET',
        `Requests to private, loopback or link-local addresses are blocked (${item.hostname} → ${item.address}).`,
        403,
      );
    }

    const code = codeOf(item);
    if (code === undefined) continue;

    switch (code) {
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
      case 'EAI_FAIL':
      case 'EAI_NONAME':
        return new AppError('DNS_ERROR', `Could not resolve host "${host}".`, 502);
      case 'ECONNREFUSED':
        return new AppError('CONNECTION_ERROR', `Connection refused by ${host}.`, 502);
      case 'ECONNRESET':
      case 'EPIPE':
      case 'UND_ERR_SOCKET':
        return new AppError(
          'CONNECTION_ERROR',
          `Connection to ${host} was closed unexpectedly.`,
          502,
        );
      case 'EHOSTUNREACH':
      case 'ENETUNREACH':
        return new AppError('CONNECTION_ERROR', `Host ${host} is unreachable.`, 502);
      case 'ETIMEDOUT':
      case 'UND_ERR_CONNECT_TIMEOUT':
        return new AppError('TIMEOUT', `Could not connect to ${host} in time.`, 504);
      case 'UND_ERR_HEADERS_TIMEOUT':
      case 'UND_ERR_BODY_TIMEOUT':
        return new AppError('TIMEOUT', `${host} stopped responding.`, 504);
      case 'UND_ERR_INVALID_ARG':
        return new AppError('VALIDATION_ERROR', 'The request could not be built.', 400);
    }

    if (TLS_ERROR.test(code)) {
      return new AppError(
        'CONNECTION_ERROR',
        `TLS/SSL error while connecting to ${host} (${code}).`,
        502,
      );
    }
    if (code.startsWith('Z_')) {
      return new AppError(
        'CONNECTION_ERROR',
        `Could not decode the compressed response from ${host}.`,
        502,
      );
    }
  }
  return undefined;
}
