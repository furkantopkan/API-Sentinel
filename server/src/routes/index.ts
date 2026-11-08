import { Router } from 'express';
import type { AppConfig } from '../config/env';
import { createAiControllers } from '../controllers/aiController';
import { createCollectionsControllers } from '../controllers/collectionsController';
import { createEnvironmentsControllers } from '../controllers/environmentsController';
import { createExecuteController } from '../controllers/executeController';
import { createRunsControllers } from '../controllers/runsController';
import { createHealthController } from '../controllers/healthController';
import type { AiService } from '../services/ai-engine/aiService';
import type { CollectionService } from '../services/collectionService';
import type { EnvironmentService } from '../services/environmentService';
import type { ExecutionService } from '../services/executionService';
import type { RunService } from '../services/runService';

export interface RouterServices {
  execution: ExecutionService;
  ai: AiService;
  collections: CollectionService;
  environments: EnvironmentService;
  runs: RunService;
}

/** All routes under `/api`. Maps URLs to controllers; contains no logic itself. */
export function createApiRouter(config: AppConfig, services: RouterServices): Router {
  const router = Router();
  const ai = createAiControllers(services.ai);
  const collections = createCollectionsControllers(services.collections);
  const environments = createEnvironmentsControllers(services.environments);
  const runs = createRunsControllers(services.runs);

  router.get('/health', createHealthController(config.version));
  router.post('/requests/execute', createExecuteController(services.execution));

  router.get('/ai/status', ai.status);
  router.post('/ai/test-cases', ai.testCases);
  router.post('/ai/analyze', ai.analyze);

  router.get('/collections', collections.list);
  router.post('/collections', collections.create);
  router.patch('/collections/:id', collections.rename);
  router.delete('/collections/:id', collections.remove);
  router.post('/saved-requests', collections.createRequest);
  router.get('/saved-requests/:id', collections.getRequest);
  router.put('/saved-requests/:id', collections.updateRequest);
  router.patch('/saved-requests/:id', collections.renameRequest);
  router.delete('/saved-requests/:id', collections.removeRequest);

  router.get('/environments', environments.list);
  router.post('/environments', environments.create);
  router.put('/environments/:id', environments.update);
  router.delete('/environments/:id', environments.remove);

  router.post('/collections/:id/runs', runs.start);
  router.get('/runs', runs.list);
  router.get('/runs/:id', runs.get);
  router.delete('/runs/:id', runs.remove);
  router.get('/runs/:id/report', runs.report);

  return router;
}
