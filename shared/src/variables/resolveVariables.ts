/**
 * `{{name}}` placeholders (Phase 6.2). Pure text replacement: it runs on the
 * server for real requests and in the browser for previews and validation.
 *
 * One pass only: a value that itself contains `{{x}}` is NOT expanded again,
 * so a variable can never pull in another one by accident.
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;

export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** Returns a variable's value, or undefined if it is not defined. */
export type VariableLookup = (name: string) => string | undefined;

export interface ResolvedText {
  text: string;
  /** Names that had no value, without duplicates. */
  unknown: string[];
}

export function resolveText(text: string, lookup: VariableLookup): ResolvedText {
  const unknown = new Set<string>();
  const resolved = text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = lookup(name);
    if (value === undefined) {
      unknown.add(name);
      return placeholder;
    }
    return value;
  });
  return { text: resolved, unknown: [...unknown] };
}

interface RowLike {
  key: string;
  value: string;
  enabled: boolean;
}

type AuthLike =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string };

/** The parts of a request that may contain placeholders. */
interface RequestLike {
  url: string;
  queryParams: readonly RowLike[];
  headers: readonly RowLike[];
  auth: AuthLike;
  body: string;
}

/**
 * Resolves URL, query parameters, headers, auth and body. Disabled rows are
 * not sent, so a missing variable inside them is not an error. Extra fields
 * (e.g. UI row ids) are preserved, so drafts can use this too.
 */
export function resolveRequest<T extends RequestLike>(
  request: T,
  lookup: VariableLookup,
): { request: T; unknown: string[] } {
  const unknown = new Set<string>();
  const apply = (text: string) => {
    const result = resolveText(text, lookup);
    result.unknown.forEach((name) => unknown.add(name));
    return result.text;
  };
  const applyRows = (rows: readonly RowLike[]) =>
    rows.map((row) =>
      row.enabled ? { ...row, key: apply(row.key), value: apply(row.value) } : row,
    );

  let auth = request.auth;
  if (auth.type === 'bearer') auth = { ...auth, token: apply(auth.token) };
  if (auth.type === 'basic') {
    auth = { ...auth, username: apply(auth.username), password: apply(auth.password) };
  }

  const resolved = {
    ...request,
    url: apply(request.url),
    queryParams: applyRows(request.queryParams),
    headers: applyRows(request.headers),
    auth,
    body: apply(request.body),
  };
  // The spread keeps every field of T; only the values of known fields changed.
  return { request: resolved, unknown: [...unknown] };
}

/** Secrets shorter than this are not masked in responses: "1" would mangle everything. */
export const MIN_MASKED_SECRET_LENGTH = 4;
export const SECRET_MASK = '[secret]';

/**
 * Builds a function that hides secret values in text. Longer secrets are
 * replaced first, so one secret containing another is hidden completely.
 */
export function createSecretMasker(secrets: readonly string[]): (text: string) => string {
  const values = [...new Set(secrets)]
    .filter((secret) => secret.length >= MIN_MASKED_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length);
  if (values.length === 0) return (text) => text;
  return (text) => values.reduce((out, secret) => out.split(secret).join(SECRET_MASK), text);
}
