/**
 * Cookies carried from one request of a collection run to the next, the way a
 * browser keeps a shop's cart or a login session. Lives only during the run:
 * nothing is written to disk.
 *
 * Deliberately simpler (and stricter) than a browser: a cookie goes back only
 * to the exact host that set it (no sharing with subdomains, Domain and Path
 * are ignored), and a Secure cookie only over https.
 */

const MAX_COOKIES_PER_HOST = 50;
const MAX_VALUE_LENGTH = 4096;

interface StoredCookie {
  value: string;
  secure: boolean;
  /** Epoch milliseconds; undefined means "until the run ends". */
  expiresAt: number | undefined;
}

export interface CookieJar {
  /** The Cookie header for a request to this URL, if any cookie applies. */
  headerFor(url: string): string | undefined;
  /** Reads the Set-Cookie headers of a response from this URL. */
  store(url: string, headers: readonly [string, string][]): void;
  /** Every value currently held, so results can mask them. */
  values(): string[];
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** When the cookie stops being valid: null means it was deleted, undefined means no limit. */
function expiryOf(attributes: string[], now: number): number | null | undefined {
  for (const attribute of attributes) {
    const [rawName = '', ...rest] = attribute.split('=');
    const name = rawName.trim().toLowerCase();
    const value = rest.join('=').trim();
    // Max-Age wins over Expires, as in browsers.
    if (name === 'max-age' && /^-?\d+$/.test(value)) {
      const seconds = Number(value);
      return seconds <= 0 ? null : now + seconds * 1000;
    }
  }
  for (const attribute of attributes) {
    const [rawName = '', ...rest] = attribute.split('=');
    if (rawName.trim().toLowerCase() !== 'expires') continue;
    const time = Date.parse(rest.join('=').trim());
    if (!Number.isNaN(time)) return time <= now ? null : time;
  }
  return undefined;
}

export function createCookieJar(now: () => number = Date.now): CookieJar {
  const byHost = new Map<string, Map<string, StoredCookie>>();

  const live = (host: string): Map<string, StoredCookie> | undefined => {
    const cookies = byHost.get(host);
    if (!cookies) return undefined;
    for (const [name, cookie] of cookies) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now()) cookies.delete(name);
    }
    return cookies;
  };

  return {
    headerFor(url) {
      const target = parseUrl(url);
      if (!target) return undefined;
      const pairs = [...(live(target.host) ?? [])]
        .filter(([, cookie]) => !cookie.secure || target.protocol === 'https:')
        .map(([name, cookie]) => `${name}=${cookie.value}`);
      return pairs.length > 0 ? pairs.join('; ') : undefined;
    },

    store(url, headers) {
      const source = parseUrl(url);
      if (!source) return;
      for (const [header, line] of headers) {
        if (header.toLowerCase() !== 'set-cookie') continue;
        const [pair = '', ...attributes] = line.split(';');
        const separator = pair.indexOf('=');
        if (separator <= 0) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        // A value with these characters would break the Cookie header we build.
        if (name === '' || value.length > MAX_VALUE_LENGTH || /[;\r\n\0]/.test(name + value)) {
          continue;
        }

        const cookies = live(source.host) ?? new Map<string, StoredCookie>();
        byHost.set(source.host, cookies);
        const expiresAt = expiryOf(attributes, now());
        if (expiresAt === null) {
          cookies.delete(name);
          continue;
        }
        if (!cookies.has(name) && cookies.size >= MAX_COOKIES_PER_HOST) continue;
        const secure = attributes.some((a) => a.trim().toLowerCase() === 'secure');
        cookies.set(name, { value, secure, expiresAt });
      }
    },

    values() {
      return [...byHost.values()].flatMap((cookies) => [...cookies.values()].map((c) => c.value));
    },
  };
}
