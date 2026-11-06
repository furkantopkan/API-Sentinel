import {
  createMockTargetApp,
  MOCK_BASIC_USER,
  MOCK_BEARER_TOKEN,
  SAMPLE_JSON,
} from '@api-sentinel/mock-target';
import type { ExecuteRequest } from '@api-sentinel/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RequestEngineConfig } from '../../src/config/env';
import { AppError } from '../../src/errors/AppError';
import {
  createRequestEngine,
  type RequestEngine,
} from '../../src/services/request-engine/requestEngine';

// The engine sends REAL HTTP requests to the local mock target (no internet).
// The mock listens on a random free port; only that exact host:port is allowlisted.

let mockServer: Server;
let base: string; // e.g. http://127.0.0.1:53211
let closedPort: number; // a port where nothing listens
let engine: RequestEngine;
let strictEngine: RequestEngine; // empty allowlist: the mock counts as "private"
const logLines: string[] = [];

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function engineConfig(allowlist: string[]): RequestEngineConfig {
  return {
    allowlist: new Set(allowlist),
    defaultTimeoutMs: 5000,
    maxTimeoutMs: 10_000,
    maxResponseBytes: 64 * 1024,
    maxRedirects: 5,
    userAgent: 'API-Sentinel/test',
  };
}

function req(overrides: Partial<ExecuteRequest> & { url: string }): ExecuteRequest {
  return {
    method: 'GET',
    queryParams: [],
    headers: [],
    auth: { type: 'none' },
    body: '',
    options: { followRedirects: true },
    ...overrides,
  };
}

/** Awaits the promise and returns the AppError code it rejected with. */
async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : `NOT_APP_ERROR: ${String(error)}`;
  }
  return 'DID_NOT_THROW';
}

beforeAll(async () => {
  mockServer = createServer(createMockTargetApp());
  const port = await listen(mockServer);
  base = `http://127.0.0.1:${port}`;

  const probe = createServer();
  closedPort = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));

  engine = createRequestEngine(
    engineConfig([`127.0.0.1:${port}`, `localhost:${port}`, `127.0.0.1:${closedPort}`]),
    (line) => logLines.push(line),
  );
  strictEngine = createRequestEngine(engineConfig([]), () => undefined);
});

afterAll(async () => {
  await Promise.all([engine.close(), strictEngine.close()]);
  await new Promise((resolve) => mockServer.close(resolve));
});

describe('successful requests', () => {
  it('GET returns status, headers, JSON body, size and duration', async () => {
    const response = await engine.execute(req({ url: `${base}/json` }));

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.body.kind).toBe('json');
    expect(JSON.parse(response.body.kind === 'json' ? response.body.text : '')).toEqual(
      SAMPLE_JSON,
    );
    expect(response.sizeBytes).toBeGreaterThan(0);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(response.headers.some(([name]) => name.toLowerCase() === 'content-type')).toBe(true);
  });

  it('POST sends query params, headers and the JSON body', async () => {
    const response = await engine.execute(
      req({
        method: 'POST',
        url: `${base}/echo`,
        queryParams: [
          { key: 'page', value: '2', enabled: true },
          { key: 'q', value: 'a b', enabled: true },
          { key: 'off', value: 'x', enabled: false },
        ],
        headers: [{ key: 'X-Trace', value: '123', enabled: true }],
        body: '{"name":"Ada"}',
      }),
    );
    const echo = JSON.parse(response.body.kind === 'json' ? response.body.text : '{}') as {
      method: string;
      query: Record<string, string>;
      headers: Record<string, string>;
      body: string;
    };

    expect(echo.method).toBe('POST');
    expect(echo.query).toEqual({ page: '2', q: 'a b' });
    expect(echo.headers['x-trace']).toBe('123');
    expect(echo.headers['content-type']).toBe('application/json');
    expect(echo.headers['user-agent']).toBe('API-Sentinel/test');
    expect(echo.body).toBe('{"name":"Ada"}');
  });

  it.each([
    [{ type: 'bearer', token: MOCK_BEARER_TOKEN }, '/auth/bearer', 200],
    [{ type: 'bearer', token: 'wrong' }, '/auth/bearer', 401],
    [{ type: 'basic', ...MOCK_BASIC_USER }, '/auth/basic', 200],
  ] as const)('auth %j on %s → %i', async (auth, path, status) => {
    const response = await engine.execute(req({ url: `${base}${path}`, auth }));

    expect(response.status).toBe(status);
  });

  it.each([404, 500, 503])(
    'returns target status %i as a normal response (not an error)',
    async (code) => {
      const response = await engine.execute(req({ url: `${base}/status/${code}` }));

      expect(response.status).toBe(code);
    },
  );

  it.each([
    ['/empty', 'empty'],
    ['/text', 'text'],
    ['/html', 'text'],
    ['/malformed-json', 'text'],
    ['/binary', 'binary'],
    ['/gzip', 'json'],
  ])('classifies %s as %s', async (path, kind) => {
    const response = await engine.execute(req({ url: `${base}${path}` }));

    expect(response.body.kind).toBe(kind);
  });

  it('decompresses gzip and reports the decoded size', async () => {
    const response = await engine.execute(req({ url: `${base}/gzip` }));
    const text = response.body.kind === 'json' ? response.body.text : '';

    expect(JSON.parse(text)).toMatchObject({ compressed: true });
    expect(response.sizeBytes).toBe(Buffer.byteLength(text));
  });

  it('keeps repeated response headers (two set-cookie entries)', async () => {
    const response = await engine.execute(req({ url: `${base}/headers` }));
    const cookies = response.headers.filter(([name]) => name.toLowerCase() === 'set-cookie');

    expect(cookies).toHaveLength(2);
  });
});

describe('redirects', () => {
  it('follows redirects and records every hop', async () => {
    const response = await engine.execute(req({ url: `${base}/redirect/3` }));

    expect(response.status).toBe(200);
    expect(response.redirects).toHaveLength(3);
    expect(response.finalUrl).toBe(`${base}/redirect/0`);
  });

  it('returns the redirect itself when followRedirects is off', async () => {
    const response = await engine.execute(
      req({ url: `${base}/redirect/3`, options: { followRedirects: false } }),
    );

    expect(response.status).toBe(302);
    expect(response.redirects).toEqual([]);
  });

  it('stops with TOO_MANY_REDIRECTS after maxRedirects (5)', async () => {
    expect(await errorCode(engine.execute(req({ url: `${base}/redirect/7` })))).toBe(
      'TOO_MANY_REDIRECTS',
    );
  });

  it('drops the Authorization header when the redirect changes origin', async () => {
    // 127.0.0.1:port → localhost:port is a different origin (host differs).
    const target = `${base.replace('127.0.0.1', 'localhost')}/echo`;
    const response = await engine.execute(
      req({
        url: `${base}/redirect-to`,
        queryParams: [{ key: 'url', value: target, enabled: true }],
        auth: { type: 'bearer', token: 'must-not-leak' },
      }),
    );
    const echo = JSON.parse(response.body.kind === 'json' ? response.body.text : '{}') as {
      headers: Record<string, string>;
    };

    expect(response.finalUrl).toBe(target);
    expect(echo.headers.authorization).toBeUndefined();
  });
});

describe('limits and failures', () => {
  it('fails with TIMEOUT when the target is slower than timeoutMs', async () => {
    const started = Date.now();
    const code = await errorCode(
      engine.execute(
        req({ url: `${base}/delay/3000`, options: { timeoutMs: 200, followRedirects: true } }),
      ),
    );

    expect(code).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('rejects a timeout above the configured maximum before sending', async () => {
    const code = await errorCode(
      engine.execute(
        req({ url: `${base}/json`, options: { timeoutMs: 999_999, followRedirects: true } }),
      ),
    );

    expect(code).toBe('VALIDATION_ERROR');
  });

  it('fails with RESPONSE_TOO_LARGE above maxResponseBytes (64 KB here)', async () => {
    expect(await errorCode(engine.execute(req({ url: `${base}/large/100` })))).toBe(
      'RESPONSE_TOO_LARGE',
    );
  });

  it('fails with CONNECTION_ERROR when nothing listens on the port', async () => {
    expect(await errorCode(engine.execute(req({ url: `http://127.0.0.1:${closedPort}/` })))).toBe(
      'CONNECTION_ERROR',
    );
  });

  it.each([
    [req({ url: 'not a url' }), 'INVALID_URL'],
    [req({ url: 'ftp://example.com' }), 'INVALID_URL'],
    [req({ method: 'POST', url: 'http://example.com', body: '{"a":1,}' }), 'INVALID_JSON_BODY'],
    [
      req({ url: 'http://example.com', headers: [{ key: 'Host', value: 'x', enabled: true }] }),
      'FORBIDDEN_HEADER',
    ],
  ])('rejects invalid input before any network call (%#)', async (request, code) => {
    expect(await errorCode(engine.execute(request))).toBe(code);
  });

  it('aborts the outbound request when the caller cancels', async () => {
    const controller = new AbortController();
    const pending = engine.execute(req({ url: `${base}/delay/3000` }), controller.signal);
    setTimeout(() => controller.abort(), 50);

    await expect(pending).rejects.toThrow();
    expect(logLines.at(-1)).toMatch(/cancelled by client$/);
  });
});

describe('SSRF protection', () => {
  it.each([
    'http://127.0.0.1:1/',
    'http://localhost:1/', // host name → resolved → loopback
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0.0.0.0/',
  ])('blocks %s', async (url) => {
    expect(await errorCode(strictEngine.execute(req({ url })))).toBe('BLOCKED_TARGET');
  });

  it('blocks the mock itself when it is not allowlisted', async () => {
    expect(await errorCode(strictEngine.execute(req({ url: `${base}/json` })))).toBe(
      'BLOCKED_TARGET',
    );
  });

  it('re-checks redirects: an allowlisted target cannot bounce us to an internal address', async () => {
    const code = await errorCode(
      engine.execute(
        req({
          url: `${base}/redirect-to`,
          queryParams: [{ key: 'url', value: 'http://127.0.0.1:3001/api/health', enabled: true }],
        }),
      ),
    );

    expect(code).toBe('BLOCKED_TARGET');
  });

  it('never writes paths, query strings or secrets to the log', async () => {
    logLines.length = 0;
    await engine.execute(
      req({
        url: `${base}/auth/bearer`,
        queryParams: [{ key: 'api_key', value: 'QUERY-SECRET', enabled: true }],
        auth: { type: 'bearer', token: 'TOKEN-SECRET' },
      }),
    );
    const log = logLines.join('\n');

    expect(log).toMatch(/^\[engine\] GET 127\.0\.0\.1:\d+ -> 401 \(\d+ ms\)$/);
    expect(log).not.toContain('SECRET');
    expect(log).not.toContain('/auth');
  });
});
