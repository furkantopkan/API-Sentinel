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

  it('returns 413 PAYLOAD_TOO_LARGE when the body exceeds the configured limit', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send({ data: 'a'.repeat(2048) }); // 2 KB > 1 KB limit

    expect(response.status).toBe(413);
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
