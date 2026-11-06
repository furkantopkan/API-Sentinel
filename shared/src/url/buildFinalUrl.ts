/** Minimal shape of a query-parameter row (client rows also carry an `id`). */
export interface QueryParamInput {
  key: string;
  value: string;
  enabled: boolean;
}

export type BuildFinalUrlResult = { ok: true; url: string } | { ok: false; error: string };

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Combines the typed URL with the enabled query-parameter rows.
 * Used by the client (live preview, validation) AND the server (the URL that is
 * actually requested), so both sides always agree on the final URL.
 *
 * - Rows that are disabled or have an empty key are skipped.
 * - Values are encoded by URLSearchParams (e.g. "a b" → "a+b", "&" → "%26").
 * - Parameters already present in the typed URL are kept; table rows are appended.
 */
export function buildFinalUrl(
  rawUrl: string,
  params: readonly QueryParamInput[],
): BuildFinalUrlResult {
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
