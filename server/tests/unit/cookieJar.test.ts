import { describe, expect, it } from 'vitest';
import { createCookieJar } from '../../src/services/cookieJar';

const setCookie = (...lines: string[]): [string, string][] => lines.map((l) => ['Set-Cookie', l]);

describe('cookieJar', () => {
  it('sends cookies back to the host that set them', () => {
    const jar = createCookieJar();
    jar.store('https://shop.test/a', setCookie('sid=abc; Path=/; HttpOnly', 'lang=tr'));
    expect(jar.headerFor('https://shop.test/cart?x=1')).toBe('sid=abc; lang=tr');
  });

  it('never sends them to another host, not even a subdomain or another port', () => {
    const jar = createCookieJar();
    jar.store('https://shop.test/', setCookie('sid=abc; Domain=shop.test'));
    expect(jar.headerFor('https://evil.test/')).toBeUndefined();
    expect(jar.headerFor('https://api.shop.test/')).toBeUndefined();
    expect(jar.headerFor('https://shop.test:8443/')).toBeUndefined();
  });

  it('replaces a cookie with the same name and deletes one that expired', () => {
    let now = 1_000_000;
    const jar = createCookieJar(() => now);
    jar.store('https://shop.test/', setCookie('sid=old', 'a=1; Max-Age=10', 'b=2'));
    jar.store('https://shop.test/', setCookie('sid=new', 'b=; Max-Age=0'));
    expect(jar.headerFor('https://shop.test/')).toBe('sid=new; a=1');
    now += 11_000;
    expect(jar.headerFor('https://shop.test/')).toBe('sid=new');
    jar.store('https://shop.test/', setCookie('sid=x; Expires=Thu, 01 Jan 1970 00:00:00 GMT'));
    expect(jar.headerFor('https://shop.test/')).toBeUndefined();
  });

  it('sends a Secure cookie only over https', () => {
    const jar = createCookieJar();
    jar.store('http://shop.test/', setCookie('sid=abc; Secure'));
    expect(jar.headerFor('http://shop.test/')).toBeUndefined();
    expect(jar.headerFor('https://shop.test/')).toBe('sid=abc');
  });

  it('ignores other headers and malformed or oversized cookies', () => {
    const jar = createCookieJar();
    jar.store('https://shop.test/', [
      ['X-Set-Cookie', 'a=1'],
      ['set-cookie', 'novalue'],
      ['set-cookie', '=x'],
      ['set-cookie', `big=${'x'.repeat(5000)}`],
      ['set-cookie', 'ok=1'],
    ]);
    expect(jar.headerFor('https://shop.test/')).toBe('ok=1');
    expect(jar.values()).toEqual(['1']);
  });

  it('keeps at most 50 cookies per host', () => {
    const jar = createCookieJar();
    jar.store('https://shop.test/', setCookie(...Array.from({ length: 60 }, (_, i) => `c${i}=v`)));
    expect(jar.values()).toHaveLength(50);
  });
});
