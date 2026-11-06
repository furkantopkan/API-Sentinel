import {
  AI_MAX_BODY_CHARS,
  aiRequestContextSchema,
  aiResponseContextSchema,
  type ExecuteRequest,
  type ExecutedResponse,
} from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { toAiRequestContext, toAiResponseContext } from './buildAiContext';

const request: ExecuteRequest = {
  method: 'POST',
  url: 'https://x.io/users',
  queryParams: [
    { key: 'page', value: '2', enabled: true },
    { key: 'off', value: 'x', enabled: false },
  ],
  headers: [
    { key: 'X-Trace', value: '1', enabled: true },
    { key: 'X-Off', value: '2', enabled: false },
    { key: '  ', value: 'orphan', enabled: true },
  ],
  auth: { type: 'bearer', token: 'AUTH-TAB-SECRET' },
  body: '{"a":1}',
  options: { followRedirects: true },
};

const response: ExecutedResponse = {
  status: 200,
  statusText: 'OK',
  headers: [['content-type', 'application/json']],
  body: { kind: 'json', text: '{"ok":true}' },
  sizeBytes: 11,
  durationMs: 7,
  finalUrl: 'https://x.io/users',
  redirects: [],
};

describe('toAiRequestContext', () => {
  it('uses the final URL and only enabled, named headers', () => {
    expect(toAiRequestContext(request)).toEqual({
      method: 'POST',
      url: 'https://x.io/users?page=2',
      headers: [['X-Trace', '1']],
      authType: 'bearer',
      body: '{"a":1}',
    });
  });

  it('never includes the Auth tab token or password, only the type', () => {
    expect(JSON.stringify(toAiRequestContext(request))).not.toContain('AUTH-TAB-SECRET');
  });

  it('produces input the server schema accepts', () => {
    expect(aiRequestContextSchema.safeParse(toAiRequestContext(request)).success).toBe(true);
  });
});

describe('toAiResponseContext', () => {
  it('copies status, headers, body and duration', () => {
    expect(toAiResponseContext(response)).toEqual({
      status: 200,
      statusText: 'OK',
      headers: [['content-type', 'application/json']],
      bodyKind: 'json',
      body: '{"ok":true}',
      bodyTruncated: false,
      durationMs: 7,
    });
  });

  it('truncates long bodies and says so', () => {
    const big = {
      ...response,
      body: {
        kind: 'text' as const,
        text: 'x'.repeat(AI_MAX_BODY_CHARS + 10),
        malformedJson: false,
      },
    };
    const context = toAiResponseContext(big);

    expect(context.body).toHaveLength(AI_MAX_BODY_CHARS);
    expect(context.bodyTruncated).toBe(true);
    expect(aiResponseContextSchema.safeParse(context).success).toBe(true);
  });

  it('sends no body text for binary and empty bodies', () => {
    expect(toAiResponseContext({ ...response, body: { kind: 'binary' } }).body).toBe('');
    expect(toAiResponseContext({ ...response, body: { kind: 'empty' } }).body).toBe('');
  });
});
