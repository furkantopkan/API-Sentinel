import { describe, expect, it } from 'vitest';
import { buildFinalUrl, type QueryParamInput } from './buildFinalUrl';

function row(key: string, value: string, enabled = true): QueryParamInput {
  return { key, value, enabled };
}

describe('buildFinalUrl', () => {
  it('returns the URL unchanged when there are no params', () => {
    expect(buildFinalUrl('https://api.example.com/users', [])).toEqual({
      ok: true,
      url: 'https://api.example.com/users',
    });
  });

  // API-003: query parameters are appended and encoded correctly
  it('appends enabled params and encodes spaces and special characters', () => {
    const result = buildFinalUrl('https://api.example.com/echo', [
      row('page', '2'),
      row('q', 'a b&c=d'),
    ]);

    expect(result).toEqual({
      ok: true,
      url: 'https://api.example.com/echo?page=2&q=a+b%26c%3Dd',
    });
  });

  // API-019: disabled params are not sent
  it('skips disabled params', () => {
    const result = buildFinalUrl('https://x.io/', [row('a', '1', false), row('b', '2')]);

    expect(result).toEqual({ ok: true, url: 'https://x.io/?b=2' });
  });

  it('skips rows whose key is empty or only whitespace', () => {
    const result = buildFinalUrl('https://x.io/', [row('', 'v'), row('   ', 'v')]);

    expect(result).toEqual({ ok: true, url: 'https://x.io/' });
  });

  it('trims the key but keeps the value exactly as typed', () => {
    const result = buildFinalUrl('https://x.io/', [row('  name ', ' Ada ')]);

    expect(result).toEqual({ ok: true, url: 'https://x.io/?name=+Ada+' });
  });

  it('keeps params already in the typed URL and appends table params after them', () => {
    expect(buildFinalUrl('https://x.io/?a=1', [row('b', '2')])).toEqual({
      ok: true,
      url: 'https://x.io/?a=1&b=2',
    });
  });

  it('allows duplicate keys (e.g. ?tag=a&tag=b)', () => {
    expect(buildFinalUrl('https://x.io/', [row('tag', 'a'), row('tag', 'b')])).toEqual({
      ok: true,
      url: 'https://x.io/?tag=a&tag=b',
    });
  });

  it('trims surrounding whitespace from the URL', () => {
    expect(buildFinalUrl('   https://x.io/   ', [])).toEqual({ ok: true, url: 'https://x.io/' });
  });

  it('accepts plain http as well as https', () => {
    expect(buildFinalUrl('http://x.io/', [])).toEqual({ ok: true, url: 'http://x.io/' });
  });

  // API-005: invalid URLs are rejected with a readable message
  it.each([
    ['', 'Enter a request URL.'],
    ['   ', 'Enter a request URL.'],
    ['htp//abc', 'Invalid URL'],
    ['api.example.com/users', 'Invalid URL'],
    ['/relative/path', 'Invalid URL'],
  ])('rejects %j', (input, expectedMessage) => {
    const result = buildFinalUrl(input, []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(expectedMessage);
  });

  // SEC-009 (client side): only http/https may be used
  it.each(['ftp://x.io/file', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,hi'])(
    'rejects the unsupported protocol in %j',
    (input) => {
      const result = buildFinalUrl(input, []);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toContain('Unsupported protocol');
    },
  );
});
