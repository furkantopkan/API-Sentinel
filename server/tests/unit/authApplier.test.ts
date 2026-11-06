import type { AuthConfig } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/AppError';
import { authorizationHeaderFor } from '../../src/services/request-engine/authApplier';

describe('authorizationHeaderFor', () => {
  it('returns undefined for "No Auth"', () => {
    expect(authorizationHeaderFor({ type: 'none' })).toBeUndefined();
  });

  it('builds a Bearer header and trims the token', () => {
    expect(authorizationHeaderFor({ type: 'bearer', token: '  abc.def  ' })).toBe('Bearer abc.def');
  });

  it('builds a Basic header from "user:password" in Base64', () => {
    // "qa:secret" → cWE6c2VjcmV0
    expect(authorizationHeaderFor({ type: 'basic', username: 'qa', password: 'secret' })).toBe(
      'Basic cWE6c2VjcmV0',
    );
  });

  it('encodes non-ASCII credentials as UTF-8', () => {
    const header = authorizationHeaderFor({ type: 'basic', username: 'şule', password: 'ğ' });
    const decoded = Buffer.from(header?.replace('Basic ', '') ?? '', 'base64').toString('utf8');

    expect(decoded).toBe('şule:ğ');
  });

  it('allows a colon in the password (only the first colon separates)', () => {
    expect(() =>
      authorizationHeaderFor({ type: 'basic', username: 'qa', password: 'a:b' }),
    ).not.toThrow();
  });

  const invalid: [AuthConfig, string][] = [
    [{ type: 'bearer', token: '   ' }, 'empty token'],
    [{ type: 'bearer', token: 'abc\r\nX-Evil: 1' }, 'token with a line break'],
    [{ type: 'basic', username: 'a:b', password: 'x' }, 'username with a colon'],
  ];

  it.each(invalid)('rejects %j (%s) without leaking the secret', (auth) => {
    let caught: unknown;
    try {
      authorizationHeaderFor(auth);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe('VALIDATION_ERROR');
    expect((caught as AppError).message).not.toContain('X-Evil');
  });
});
