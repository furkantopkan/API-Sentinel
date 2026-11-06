import express, { type Express } from 'express';
import type { AppConfig } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { createApiRouter } from './routes/index';
import {
  createRequestEngine,
  type EngineLogger,
  type RequestEngine,
} from './services/request-engine/requestEngine';

export interface AppDependencies {
  /** Defaults to a real engine built from config; tests may pass their own logger. */
  engine?: RequestEngine;
  engineLogger?: EngineLogger;
}

/**
 * Builds the Express application WITHOUT starting to listen on a port.
 * server.ts calls listen(); tests (Supertest) use the app directly, which is
 * faster and avoids "port already in use" problems.
 *
 * Order matters: body parser → routes → 404 → error handler.
 */
export function createApp(config: AppConfig, deps: AppDependencies = {}): Express {
  const engine = deps.engine ?? createRequestEngine(config.requestEngine, deps.engineLogger);
  const app = express();

  // Do not advertise the framework in an `X-Powered-By` header.
  app.disable('x-powered-by');

  app.use(express.json({ limit: config.requestBodyLimit }));

  app.use('/api', createApiRouter(config, engine));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
