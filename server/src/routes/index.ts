import { Router } from 'express';
import type { AppConfig } from '../config/env';
import { createExecuteController } from '../controllers/executeController';
import { createHealthController } from '../controllers/healthController';
import type { RequestEngine } from '../services/request-engine/requestEngine';

/** All routes under `/api`. Maps URLs to controllers; contains no logic itself. */
export function createApiRouter(config: AppConfig, engine: RequestEngine): Router {
  const router = Router();

  router.get('/health', createHealthController(config.version));
  router.post('/requests/execute', createExecuteController(engine));

  return router;
}
