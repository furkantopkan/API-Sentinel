import { apiErrorResponseSchema } from '@api-sentinel/shared';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/AppError';
import { errorHandler } from '../../src/middleware/errorHandler';

/**
 * The real app has no route that crashes, so this test builds a tiny Express
 * app with deliberately failing routes and the real errorHandler.
 */
function buildAppWithFailingRoutes() {
  const app = express();

  app.get('/app-error', () => {
    throw new AppError('TIMEOUT', 'Target did not respond in time.', 504, { timeoutMs: 15000 });
  });

  app.get('/sync-crash', () => {
    throw new Error('db connection failed: password=SECRET789');
  });

  // Express 5 forwards rejected promises from async handlers to the error handler.
  app.get('/async-crash', async () => {
    await Promise.resolve();
    throw new Error('async failure with token=SECRET000');
  });

  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  const app = buildAppWithFailingRoutes();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns an AppError into its code, status, message and details', async () => {
    const response = await request(app).get('/app-error');

    expect(response.status).toBe(504);
    expect(apiErrorResponseSchema.parse(response.body)).toEqual({
      ok: false,
      error: {
        code: 'TIMEOUT',
        message: 'Target did not respond in time.',
        details: { timeoutMs: 15000 },
      },
    });
  });

  it.each(['/sync-crash', '/async-crash'])(
    'returns a generic 500 for an unexpected error in %s and hides internal details',
    async (path) => {
      // Silence and capture the server log for this test.
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await request(app).get(path);

      expect(response.status).toBe(500);
      expect(apiErrorResponseSchema.parse(response.body).error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/SECRET|password|token/);
      // The details are not lost: they go to the server log.
      expect(logSpy).toHaveBeenCalledOnce();
    },
  );
});
