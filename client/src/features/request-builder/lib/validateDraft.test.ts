import { describe, expect, it } from 'vitest';
import { initialRequestDraft } from '../state/requestDraftReducer';
import type { RequestDraft } from '../types';
import { validateDraft } from './validateDraft';

function draft(overrides: Partial<RequestDraft>): RequestDraft {
  return { ...initialRequestDraft, ...overrides };
}

describe('validateDraft', () => {
  it('passes a valid draft and returns the final URL with params', () => {
    const result = validateDraft(
      draft({
        url: 'https://x.io/users',
        queryParams: [{ id: '1', key: 'page', value: '2', enabled: true }],
        body: '{"a":1}',
      }),
    );

    expect(result).toEqual({ ok: true, finalUrl: 'https://x.io/users?page=2' });
  });

  it('passes a draft with an empty body', () => {
    expect(validateDraft(draft({ url: 'https://x.io' })).ok).toBe(true);
  });

  it('reports a URL error for an empty URL', () => {
    expect(validateDraft(draft({ url: '' }))).toEqual({
      ok: false,
      errors: [{ field: 'url', message: 'Enter a request URL.' }],
    });
  });

  it('reports a body error with its location', () => {
    expect(validateDraft(draft({ url: 'https://x.io', body: '{"a":1,}' }))).toEqual({
      ok: false,
      errors: [{ field: 'body', message: 'Body is not valid JSON (line 1, column 8).' }],
    });
  });

  it('reports URL and body errors together so the user can fix both at once', () => {
    const result = validateDraft(draft({ url: 'ftp://x.io', body: '{' }));

    expect(!result.ok && result.errors.map((error) => error.field)).toEqual(['url', 'body']);
  });

  const withTimeout = (timeoutMs: number) =>
    draft({ url: 'https://x.io', options: { timeoutMs, followRedirects: true } });

  // Boundary values: 100 and 60 000 are the first/last allowed values.
  it.each([100, 15_000, 60_000])('accepts timeout %i ms', (timeoutMs) => {
    expect(validateDraft(withTimeout(timeoutMs)).ok).toBe(true);
  });

  it.each([99, 60_001, 0, -1, 1.5, Number.NaN])('rejects timeout %d ms', (timeoutMs) => {
    const result = validateDraft(withTimeout(timeoutMs));

    expect(!result.ok && result.errors.map((error) => error.field)).toEqual(['timeout']);
  });
});
