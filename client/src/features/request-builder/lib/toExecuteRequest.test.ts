import { executeRequestSchema } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { initialRequestDraft } from '../state/requestDraftReducer';
import type { RequestDraft } from '../types';
import { toExecuteRequest } from './toExecuteRequest';

const draft: RequestDraft = {
  ...initialRequestDraft,
  method: 'POST',
  url: 'https://x.io/users',
  queryParams: [{ id: 'p1', key: 'page', value: '2', enabled: true }],
  headers: [{ id: 'h1', key: 'X-Trace', value: '1', enabled: false }],
  auth: { type: 'bearer', token: 't' },
  body: '{"a":1}',
  options: { timeoutMs: 3000, followRedirects: false },
};

describe('toExecuteRequest', () => {
  it('removes UI-only row ids and keeps everything else', () => {
    expect(toExecuteRequest(draft)).toEqual({
      method: 'POST',
      url: 'https://x.io/users',
      queryParams: [{ key: 'page', value: '2', enabled: true }],
      headers: [{ key: 'X-Trace', value: '1', enabled: false }],
      auth: { type: 'bearer', token: 't' },
      body: '{"a":1}',
      options: { timeoutMs: 3000, followRedirects: false },
    });
  });

  // Contract test: what the client sends must pass the server's schema.
  it('produces a payload accepted by the shared executeRequestSchema', () => {
    expect(executeRequestSchema.safeParse(toExecuteRequest(draft)).success).toBe(true);
    expect(executeRequestSchema.safeParse(toExecuteRequest(initialRequestDraft)).success).toBe(
      true,
    );
  });

  it('does not share the options object with the draft', () => {
    expect(toExecuteRequest(draft).options).not.toBe(draft.options);
  });
});
