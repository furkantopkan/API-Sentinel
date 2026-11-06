import type { KeyValueRow } from '../types';

export type BuildFinalUrlResult = { ok: true; url: string } | { ok: false; error: string };

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Combines the typed URL with the enabled query-parameter rows.
 *
 * - Rows that are disabled or have an empty key are skipped.
 * - Values are encoded by URLSearchParams (e.g. "a b" → "a+b", "&" → "%26"),
 *   so users never have to encode by hand.
 * - Parameters already present in the typed URL are kept; table rows are appended.
 */
export function buildFinalUrl(rawUrl: string, params: readonly KeyValueRow[]): BuildFinalUrlResult {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter a request URL.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: 'Invalid URL. It must be absolute, e.g. https://api.example.com/users',
    };
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    return {
      ok: false,
      error: `Unsupported protocol "${url.protocol}". Only http:// and https:// are allowed.`,
    };
  }

  for (const param of params) {
    if (param.enabled && param.key.trim() !== '') {
      url.searchParams.append(param.key.trim(), param.value);
    }
  }

  return { ok: true, url: url.toString() };
}
