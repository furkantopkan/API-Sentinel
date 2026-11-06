import { describe, expect, it } from 'vitest';
import { initialRequestDraft } from '../state/requestDraftReducer';
import type { RequestDraft } from '../types';
import { maskDraftSecrets } from './maskDraftSecrets';

function draft(overrides: Partial<RequestDraft>): RequestDraft {
  return { ...initialRequestDraft, url: 'https://x.io', ...overrides };
}

describe('maskDraftSecrets', () => {
  it('masks a bearer token', () => {
    const masked = maskDraftSecrets(draft({ auth: { type: 'bearer', token: 'eyJhbGci.real' } }));

    expect(masked.auth).toEqual({ type: 'bearer', token: '***' });
  });

  it('masks the basic-auth password but keeps the username for debugging', () => {
    const masked = maskDraftSecrets(
      draft({ auth: { type: 'basic', username: 'qa-user', password: 'hunter2' } }),
    );

    expect(masked.auth).toEqual({ type: 'basic', username: 'qa-user', password: '***' });
  });

  it('keeps empty secrets empty so "missing" and "set" stay distinguishable', () => {
    const masked = maskDraftSecrets(draft({ auth: { type: 'bearer', token: '' } }));

    expect(masked.auth).toEqual({ type: 'bearer', token: '' });
  });

  it.each([
    'Authorization',
    'authorization',
    ' AUTHORIZATION ',
    'Cookie',
    'X-API-Key',
    'Proxy-Authorization',
  ])('masks the value of the sensitive header %j', (key) => {
    const masked = maskDraftSecrets(
      draft({ headers: [{ id: 'h', key, value: 'secret-value', enabled: true }] }),
    );

    expect(masked.headers[0]?.value).toBe('***');
  });

  it('leaves ordinary headers untouched', () => {
    const headers = [{ id: 'h', key: 'X-Request-Id', value: 'abc-123', enabled: true }];

    expect(maskDraftSecrets(draft({ headers })).headers).toEqual(headers);
  });

  it('does not modify the original draft', () => {
    const original = draft({
      auth: { type: 'bearer', token: 'real' },
      headers: [{ id: 'h', key: 'Authorization', value: 'real', enabled: true }],
    });
    const snapshot = structuredClone(original);

    maskDraftSecrets(original);

    expect(original).toEqual(snapshot);
  });
});
