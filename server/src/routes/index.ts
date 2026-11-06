import { Router } from 'express';
import type { AppConfig } from '../config/env';
import { createAiControllers } from '../controllers/aiController';
import { createExecuteController } from '../controllers/executeController';
import { createHealthController } from '../controllers/healthController';
import type { AiService } from '../services/ai-engine/aiService';
import type { RequestEngine } from '../services/request-engine/requestEngine';

/** All routes under `/api`. Maps URLs to controllers; contains no logic itself. */
export function createApiRouter(config: AppConfig, engine: RequestEngine, ai: AiService): Router {
  const router = Router();
  const aiControllers = createAiControllers(ai);

  router.get('/health', createHealthController(config.version));
  router.post('/requests/execute', createExecuteController(engine));
  router.get('/ai/status', aiControllers.status);
  router.post('/ai/test-cases', aiControllers.testCases);
  router.post('/ai/analyze', aiControllers.analyze);

  return router;
}
