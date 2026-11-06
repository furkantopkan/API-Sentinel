import { apiErrorResponseSchema, healthResponseSchema } from '@api-sentinel/shared';
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
};

const app = createApp(testConfig);

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
