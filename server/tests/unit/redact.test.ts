import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  redactBody,
  redactHeaders,
  redactRequest,
  redactResponse,
  redactUrl,
} from '../../src/services/ai-engine/redact';

describe('redactHeaders', () => {
  it.each([
    'Authorization',
    'proxy-authorization',
    'Cookie',
    'Set-Cookie',
    'X-API-Key',
    'x-auth-token',
    'X-Session-Id',
    'X-Signature-Token',
  ])('masks %s', (name) => {
    expect(redactHeaders([[name, 'secret-value']])).toEqual([[name, REDACTED]]);
  });

  it.each(['Content-Type', 'Accept', 'X-Request-Id', 'Cache-Control'])('keeps %s', (name) => {
    expect(redactHeaders([[name, 'value']])).toEqual([[name, 'value']]);
  });
});

describe('redactUrl', () => {
  it('masks secret-looking query parameters and keeps the others', () => {
    const url = redactUrl(
      'https://api.example.com/users?page=2&api_key=K1&token=T1&access_token=A1',
    );
    const params = new URL(url).searchParams;

    expect(params.get('page')).toBe('2');
    expect(params.get('api_key')).toBe(REDACTED);
    expect(params.get('token')).toBe(REDACTED);
    expect(params.get('access_token')).toBe(REDACTED);
    expect(url).not.toMatch(/K1|T1|A1/);
  });

  it('masks credentials in the URL itself', () => {
    expect(redactUrl('https://user:pa55@example.com/')).toBe(
      'https://REDACTED:REDACTED@example.com/',
    );
  });

  it('returns invalid URLs unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

describe('redactBody', () => {
  it('masks secret-looking keys at any depth of a JSON body', () => {
    const body = JSON.stringify({
      user: 'ada',
      password: 'P1',
      nested: { apiKey: 'K1', items: [{ refresh_token: 'R1', name: 'ok' }] },
    });
    const redacted = JSON.parse(redactBody(body)) as Record<string, unknown>;

    expect(redacted).toEqual({
      user: 'ada',
      password: REDACTED,
      nested: { apiKey: REDACTED, items: [{ refresh_token: REDACTED, name: 'ok' }] },
    });
  });

  it('keeps an object under a secret-looking key and redacts inside it', () => {
    const redacted = JSON.parse(redactBody('{"auth":{"type":"bearer","token":"T1"}}')) as unknown;

    expect(redacted).toEqual({ auth: { type: 'bearer', token: REDACTED } });
  });

  it('masks Bearer/Basic credentials in plain text bodies', () => {
    expect(redactBody('Authorization: Bearer abcdefgh12345678')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
  });

  // Re-serialising would round 12345678901234567890 and mislead the model.
  it('keeps JSON with big integers as text, still masking secret keys', () => {
    const body = '{"id": 12345678901234567890, "token": "T1"}';
    const redacted = redactBody(body);

    expect(redacted).toContain('12345678901234567890');
    expect(redacted).not.toContain('T1');
  });
});

describe('redactRequest / redactResponse', () => {
  it('never lets a known secret through', () => {
    const request = redactRequest({
      method: 'POST',
      url: 'https://x.io/login?api_key=QUERY-SECRET',
      headers: [['Authorization', 'Bearer HEADER-SECRET']],
      authType: 'bearer',
      body: '{"password":"BODY-SECRET"}',
    });
    const response = redactResponse({
      status: 200,
      statusText: 'OK',
      headers: [['Set-Cookie', 'session=COOKIE-SECRET']],
      bodyKind: 'json',
      body: '{"access_token":"TOKEN-SECRET"}',
      bodyTruncated: false,
      durationMs: 1,
    });

    expect(JSON.stringify([request, response])).not.toMatch(/SECRET/);
  });

  it('drops binary bodies', () => {
    const response = redactResponse({
      status: 200,
      statusText: 'OK',
      headers: [],
      bodyKind: 'binary',
      body: 'whatever',
      bodyTruncated: false,
      durationMs: 1,
    });

    expect(response.body).toBe('');
  });
});

describe('redactBody with a form body', () => {
  it('masks secret-looking fields and keeps the others exactly', () => {
    expect(redactBody('email=ada%40x.test&password=P%40ss1&remember=1')).toBe(
      `email=ada%40x.test&password=${REDACTED}&remember=1`,
    );
    expect(redactBody('csrf_token=T1&product_id=7')).toBe(`csrf_token=${REDACTED}&product_id=7`);
  });

  it('judges an encoded field name by what it means', () => {
    expect(redactBody('user%5Bpassword%5D=P1')).toBe(`user%5Bpassword%5D=${REDACTED}`);
  });
});

// Seen on a shop: a "withcredentials: true" header became a secret variable to fill in.
describe('a switch is not a secret, whatever its name', () => {
  it('keeps true/false/0/1 values under secret-looking names', () => {
    expect(
      redactHeaders([
        ['withcredentials', 'true'],
        ['x-auth-required', '0'],
        ['x-auth-token', 'true'],
        ['session-id', 'abc123'],
      ]),
    ).toEqual([
      ['withcredentials', 'true'],
      ['x-auth-required', '0'],
      ['x-auth-token', REDACTED],
      ['session-id', REDACTED],
    ]);
    expect(redactUrl('https://a.test/?auth=false&token=t-1')).toBe(
      `https://a.test/?auth=false&token=${encodeURIComponent(REDACTED)}`,
    );
    expect(JSON.parse(redactBody('{"rememberSession":true,"sessionId":"s-1"}'))).toEqual({
      rememberSession: true,
      sessionId: REDACTED,
    });
    expect(redactBody('withCredentials=true&password=hunter2')).toBe(
      `withCredentials=true&password=${REDACTED}`,
    );
  });
});
