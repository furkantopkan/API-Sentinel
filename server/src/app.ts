import express, { type Express } from 'express';
import { resolve } from 'node:path';
import type { AppConfig } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { localHostOnly } from './middleware/localHostOnly';
import { notFoundHandler } from './middleware/notFoundHandler';
import { openDatabase, type Database } from './db/database';
import { createCollectionRepository } from './repositories/collectionRepository';
import { createEnvironmentRepository } from './repositories/environmentRepository';
import { createRunRepository } from './repositories/runRepository';
import { createApiRouter } from './routes/index';
import { createAnthropicAiClient, type AiClient } from './services/ai-engine/aiClient';
import { createAiService } from './services/ai-engine/aiService';
import { createMockAiClient } from './services/ai-engine/mockAiClient';
import { createOllamaClient } from './services/ai-engine/ollamaClient';
import { createRateLimiter } from './services/ai-engine/rateLimiter';
import { createCollectionService, type ServiceClock } from './services/collectionService';
import { createEnvironmentService } from './services/environmentService';
import { createExecutionService } from './services/executionService';
import { createRecorderService } from './services/recorder/recorderService';
import {
  createPlaywrightRecordingBrowser,
  type RecordingBrowser,
} from './services/recorder/recordingBrowser';
import { createRunService } from './services/runService';
import {
  createRequestEngine,
  type EngineLogger,
  type RequestEngine,
} from './services/request-engine/requestEngine';

export interface AppDependencies {
  /** Defaults to a real engine built from config; tests may pass their own logger. */
  engine?: RequestEngine;
  engineLogger?: EngineLogger;
  /** Overrides the AI client chosen from config (tests pass a fake). null = AI off. */
  aiClient?: AiClient | null;
  aiLogger?: (line: string) => void;
  /** Defaults to the database at config.dbPath; tests pass an in-memory one. */
  db?: Database;
  clock?: ServiceClock;
  /** Tests pass a fake, so no real browser window is opened. */
  recordingBrowser?: RecordingBrowser;
}

/** Up to 300 recorded requests of a few KB each (MAX_RECORDED_ENTRIES). */
const BUILD_COLLECTION_BODY_LIMIT = '10mb';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function aiClientFor(config: AppConfig): AiClient | null {
  switch (config.ai.mode) {
    case 'anthropic':
      return createAnthropicAiClient(config.ai);
    case 'ollama':
      return createOllamaClient({
        baseUrl: config.ai.baseUrl ?? 'http://127.0.0.1:11434',
        model: config.ai.model,
        timeoutMs: config.ai.timeoutMs,
      });
    case 'mock':
      return createMockAiClient();
    case 'off':
      return null;
  }
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
  const ai = createAiService(
    config.ai,
    deps.aiClient !== undefined ? deps.aiClient : aiClientFor(config),
    createRateLimiter(config.ai.ratePerMinute),
    deps.aiLogger ?? ((line) => console.info(line)),
  );
  const db = deps.db ?? openDatabase(config.dbPath);
  const environmentRepository = createEnvironmentRepository(db);
  const collections = createCollectionService(
    createCollectionRepository(db),
    deps.clock,
    (id) => environmentRepository.get(id) !== undefined,
  );
  const environments = createEnvironmentService(environmentRepository, deps.clock);
  const execution = createExecutionService(engine, environments);
  const runs = createRunService({
    repo: createRunRepository(db),
    collections,
    environments,
    execution,
    clock: deps.clock,
  });
  const recorder = createRecorderService(
    deps.recordingBrowser ??
      createPlaywrightRecordingBrowser({ headless: config.recorderHeadless ?? false }),
    { enabled: LOOPBACK_HOSTS.has(config.host), allowlist: config.requestEngine.allowlist },
  );
  const app = express();

  // Do not advertise the framework in an `X-Powered-By` header.
  app.disable('x-powered-by');

  if (config.serveClient) app.use(localHostOnly);

  // A long recording is sent to the AI builder in one piece; everything else keeps the normal limit.
  app.use('/api/ai/build-collection', express.json({ limit: BUILD_COLLECTION_BODY_LIMIT }));
  app.use(express.json({ limit: config.requestBodyLimit }));

  app.use(
    '/api',
    createApiRouter(config, { execution, ai, collections, environments, runs, recorder }),
  );

  if (config.serveClient) {
    app.use(express.static(resolve(import.meta.dirname, '../../client/dist')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
