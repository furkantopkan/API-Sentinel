import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/AppError';
import { buildOutgoingHeaders } from '../../src/services/request-engine/headerPolicy';

const options = { hasBody: false, userAgent: 'API-Sentinel/test' };
const row = (key: string, value: string, enabled = true) => ({ key, value, enabled });

/** Runs fn and returns the AppError code it threw (or undefined if it did not throw). */
function errorCodeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return undefined;
}

describe('buildOutgoingHeaders', () => {
  it('adds safe defaults when the user sets nothing', () => {
    expect(buildOutgoingHeaders([], { type: 'none' }, options)).toEqual({
      accept: '*/*',
      'user-agent': 'API-Sentinel/test',
      'accept-encoding': 'gzip, deflate, br',
    });
  });

  it('adds a JSON content-type only when there is a body', () => {
    const headers = buildOutgoingHeaders([], { type: 'none' }, { ...options, hasBody: true });

    expect(headers['content-type']).toBe('application/json');
  });

  it('keeps user values instead of the defaults (names are lower-cased)', () => {
    const headers = buildOutgoingHeaders(
      [row('Accept', 'text/plain'), row('Content-Type', 'text/csv')],
      { type: 'none' },
      { ...options, hasBody: true },
    );

    expect(headers.accept).toBe('text/plain');
    expect(headers['content-type']).toBe('text/csv');
  });

  it('skips disabled rows and rows without a name', () => {
    const headers = buildOutgoingHeaders(
      [row('X-Off', '1', false), row('  ', 'orphan')],
      { type: 'none' },
      options,
    );

    expect(headers).not.toHaveProperty('x-off');
    expect(Object.values(headers)).not.toContain('orphan');
  });

  it('API-004: combines repeated headers with ", "', () => {
    const headers = buildOutgoingHeaders(
      [row('X-Tag', 'a'), row('x-tag', 'b')],
      { type: 'none' },
      options,
    );

    expect(headers['x-tag']).toBe('a, b');
  });

  it.each(['Host', 'content-length', 'Transfer-Encoding', 'Connection', 'Expect'])(
    'SEC-010: rejects the managed header %s with FORBIDDEN_HEADER',
    (name) => {
      const code = errorCodeOf(() =>
        buildOutgoingHeaders([row(name, 'x')], { type: 'none' }, options),
      );
      expect(code).toBe('FORBIDDEN_HEADER');
    },
  );

  it.each(['Bad Name', 'x:y', 'ünicode', '(x)'])('rejects the invalid header name %j', (name) => {
    const code = errorCodeOf(() =>
      buildOutgoingHeaders([row(name, 'x')], { type: 'none' }, options),
    );
    expect(code).toBe('VALIDATION_ERROR');
  });

  // Header injection: a CR/LF in the value would start a new, attacker-chosen header.
  it.each(['a\r\nX-Injected: 1', 'a\nb', 'a\0b'])(
    'SEC-010: rejects header values with line breaks or NUL (%j)',
    (value) => {
      const code = errorCodeOf(() =>
        buildOutgoingHeaders([row('X-A', value)], { type: 'none' }, options),
      );
      expect(code).toBe('VALIDATION_ERROR');
    },
  );

  it('adds the Authorization header from the Auth tab', () => {
    const headers = buildOutgoingHeaders([], { type: 'bearer', token: 'abc' }, options);

    expect(headers.authorization).toBe('Bearer abc');
  });

  it('refuses Authorization from both the Auth tab and a header row', () => {
    const code = errorCodeOf(() =>
      buildOutgoingHeaders(
        [row('Authorization', 'Bearer x')],
        { type: 'bearer', token: 'y' },
        options,
      ),
    );
    expect(code).toBe('VALIDATION_ERROR');
  });
});
