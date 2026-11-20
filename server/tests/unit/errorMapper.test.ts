import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/AppError';
import { mapRequestError } from '../../src/services/request-engine/errorMapper';
import { BlockedTargetError } from '../../src/services/request-engine/ssrfGuard';

function withCode(code: string): Error {
  return Object.assign(new Error(`low-level ${code}`), { code });
}

describe('mapRequestError', () => {
  it.each([
    ['ENOTFOUND', 'DNS_ERROR', 502],
    ['EAI_AGAIN', 'DNS_ERROR', 502],
    ['ECONNREFUSED', 'CONNECTION_ERROR', 502],
    ['ECONNRESET', 'CONNECTION_ERROR', 502],
    ['UND_ERR_SOCKET', 'CONNECTION_ERROR', 502],
    ['EHOSTUNREACH', 'CONNECTION_ERROR', 502],
    ['ETIMEDOUT', 'TIMEOUT', 504],
    ['UND_ERR_CONNECT_TIMEOUT', 'TIMEOUT', 504],
    ['UND_ERR_HEADERS_TIMEOUT', 'TIMEOUT', 504],
    ['UND_ERR_INVALID_ARG', 'VALIDATION_ERROR', 400],
    ['CERT_HAS_EXPIRED', 'CONNECTION_ERROR', 502],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'CONNECTION_ERROR', 502],
    ['Z_DATA_ERROR', 'CONNECTION_ERROR', 502],
  ])('API-013, 014: maps %s to %s (%i)', (lowLevel, code, status) => {
    const mapped = mapRequestError(withCode(lowLevel), 'api.example.com');

    expect(mapped?.code).toBe(code);
    expect(mapped?.httpStatus).toBe(status);
  });

  it('maps a BlockedTargetError to BLOCKED_TARGET 403 with host and IP', () => {
    const mapped = mapRequestError(new BlockedTargetError('evil.test', '10.0.0.1'), 'evil.test');

    expect(mapped?.code).toBe('BLOCKED_TARGET');
    expect(mapped?.httpStatus).toBe(403);
    expect(mapped?.message).toContain('evil.test → 10.0.0.1');
  });

  it('finds the real cause inside wrapped errors (error.cause)', () => {
    const wrapped = new TypeError('fetch failed', {
      cause: new Error('connect failed', { cause: withCode('ECONNREFUSED') }),
    });

    expect(mapRequestError(wrapped, 'h')?.code).toBe('CONNECTION_ERROR');
  });

  it('returns an AppError unchanged', () => {
    const original = new AppError('TOO_MANY_REDIRECTS', 'x', 502);

    expect(mapRequestError(original, 'h')).toBe(original);
  });

  it('mentions only the host in messages', () => {
    expect(mapRequestError(withCode('ECONNREFUSED'), 'api.example.com:8080')?.message).toBe(
      'Connection refused by api.example.com:8080.',
    );
  });

  it('returns undefined for unknown errors (they become INTERNAL_ERROR)', () => {
    expect(mapRequestError(new Error('???'), 'h')).toBeUndefined();
    expect(mapRequestError(withCode('ESOMETHING'), 'h')).toBeUndefined();
    expect(mapRequestError('a string', 'h')).toBeUndefined();
  });
});
