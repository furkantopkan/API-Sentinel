import type { AuthConfig, RequestDraft } from '../types';

const MASK = '***';
const SENSITIVE_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie', 'x-api-key']);

function maskIfSet(value: string): string {
  return value === '' ? '' : MASK;
}

function maskAuth(auth: AuthConfig): AuthConfig {
  switch (auth.type) {
    case 'none':
      return auth;
    case 'bearer':
      return { ...auth, token: maskIfSet(auth.token) };
    case 'basic':
      return { ...auth, password: maskIfSet(auth.password) };
  }
}

/**
 * Returns a copy of the draft that is safe to print (e.g. to the console):
 * tokens, passwords and sensitive header values are replaced with "***".
 */
export function maskDraftSecrets(draft: RequestDraft): RequestDraft {
  return {
    ...draft,
    auth: maskAuth(draft.auth),
    headers: draft.headers.map((header) =>
      SENSITIVE_HEADERS.has(header.key.trim().toLowerCase())
        ? { ...header, value: maskIfSet(header.value) }
        : header,
    ),
  };
}
