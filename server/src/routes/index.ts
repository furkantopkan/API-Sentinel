import { Router } from 'express';
import type { AppConfig } from '../config/env';
import { createHealthController } from '../controllers/healthController';

/** All routes under `/api`. Maps URLs to controllers; contains no logic itself. */
export function createApiRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/health', createHealthController(config.version));

  return router;
}
