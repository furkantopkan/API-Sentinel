import express, { type Express } from 'express';
import type { AppConfig } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { createApiRouter } from './routes/index';

/**
 * Builds the Express application WITHOUT starting to listen on a port.
 * server.ts calls listen(); tests (Supertest) use the app directly, which is
 * faster and avoids "port already in use" problems.
 *
 * Order matters: body parser → routes → 404 → error handler.
 */
export function createApp(config: AppConfig): Express {
  const app = express();

  // Do not advertise the framework in an `X-Powered-By` header.
  app.disable('x-powered-by');

  app.use(express.json({ limit: config.requestBodyLimit }));

  app.use('/api', createApiRouter(config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
