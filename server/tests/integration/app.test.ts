import {
  apiErrorResponseSchema,
  executeResultSchema,
  healthResponseSchema,
} from '@api-sentinel/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { AppConfig } from '../../src/config/env';

// Supertest drives the Express app in memory: no port is opened, so tests are
// fast and never collide with a running dev server.

const testConfig: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  requestBodyLimit: '1kb', // small limit so the "too large" case is cheap to trigger
  version: '9.9.9-test',
  requestEngine: {
    allowlist: new Set(),
    defaultTimeoutMs: 5000,
    maxTimeoutMs: 10_000,
    maxResponseBytes: 1024 * 1024,
    maxRedirects: 5,
    userAgent: 'API-Sentinel/test',
  },
  ai: {
    mode: 'off',
    apiKey: '',
    model: 'test-model',
    effort: 'medium',
    timeoutMs: 1000,
    ratePerMinute: 5,
  },
  dbPath: ':memory:',
};

const app = createApp(testConfig, { engineLogger: () => undefined });

describe('GET /api/health', () => {
  it('returns 200 with a body matching the shared health schema', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    const body = healthResponseSchema.parse(response.body);
    expect(body).toMatchObject({ status: 'ok', version: '9.9.9-test' });
  });

  it('does not advertise the framework (no X-Powered-By header)', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('returns 404 NOT_FOUND in the standard error shape', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    const body = apiErrorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('GET /api/does-not-exist');
  });

  it('does not echo query-string values (they may contain secrets)', async () => {
    const response = await request(app).get('/api/nope?token=SECRET123');

    expect(JSON.stringify(response.body)).not.toContain('SECRET123');
  });
});

describe('POST /api/requests/execute', () => {
  const valid = {
    method: 'GET',
    url: 'http://127.0.0.1/',
    queryParams: [],
    headers: [],
    auth: { type: 'none' },
    body: '',
    options: { followRedirects: true },
  };

  it('returns 400 VALIDATION_ERROR with issue paths but without the submitted values', async () => {
    const response = await request(app)
      .post('/api/requests/execute')
      .send({ ...valid, method: 'TRACE', auth: { type: 'bearer', token: 123 }, url: 'SECRET-URL' });

    expect(response.status).toBe(400);
    const body = apiErrorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body.error.details)).toContain('method');
    expect(JSON.stringify(response.body)).not.toContain('SECRET-URL');
  });

  it('returns 403 BLOCKED_TARGET for a loopback target (SSRF guard is wired in)', async () => {
    const response = await request(app).post('/api/requests/execute').send(valid);

    expect(response.status).toBe(403);
    expect(executeResultSchema.parse(response.body)).toMatchObject({
      ok: false,
      error: { code: 'BLOCKED_TARGET' },
    });
  });
});

describe('request body handling', () => {
  it('returns 400 VALIDATION_ERROR for malformed JSON without echoing the body', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"password":"SECRET456",');

    expect(response.status).toBe(400);
    const body = apiErrorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('SECRET456');
  });

  it('SEC-012: returns 413 PAYLOAD_TOO_LARGE when the body exceeds the configured limit', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send({ data: 'a'.repeat(2048) }); // 2 KB > 1 KB limit

    expect(response.status).toBe(413);
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('security headers', () => {
  it('forbids framing and limits what a page may load', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("script-src 'self'");
  });
});

// Any web page can make the browser POST to this local app; the browser names the page in Origin.
describe('changes from another web site (CSRF)', () => {
  const finish = (origin?: string) => {
    const call = request(app).post('/api/collections').send({ name: 'From somewhere' });
    return origin === undefined ? call : call.set('Origin', origin);
  };

  it('refuses a change sent by another site', async () => {
    const response = await finish('https://evil.example').expect(403);
    expect((response.body as { error: { code: string } }).error.code).toBe('FORBIDDEN_ORIGIN');
    await finish('null').expect(403);
  });

  it('accepts changes from this app, and from tools that send no Origin', async () => {
    await finish('http://localhost:5173').expect(201);
    await finish('http://127.0.0.1:3000').expect(201);
    await finish('http://[::1]:3000').expect(201);
    await finish().expect(201);
  });

  it('lets another site read nothing new: reads are left to the browser (no CORS headers)', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// DNS rebinding: a page reaches the local API under its own host name.
describe('a request addressed to another host name', () => {
  it('is not found when the server listens on this machine only', async () => {
    await request(app).get('/api/health').set('Host', 'evil.example').expect(404);
    await request(app).get('/api/health').set('Host', 'localhost:3001').expect(200);
  });

  it('is served when the server was deliberately opened to the network', async () => {
    const open = createApp({ ...testConfig, host: '0.0.0.0' }, { engineLogger: () => undefined });
    await request(open).get('/api/health').set('Host', 'my-pc.lan:3001').expect(200);
  });
});
