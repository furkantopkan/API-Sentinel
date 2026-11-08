import { executeWithEnvironmentSchema } from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import type { ExecutionService } from '../services/executionService';
import { parseBody } from '../validators/parseBody';

/**
 * `POST /api/requests/execute`
 * Thin HTTP layer: validate input, call the execution service, send the result.
 * Errors are thrown and handled by the central errorHandler.
 */
export function createExecuteController(execution: ExecutionService): RequestHandler {
  return async (req, res) => {
    const { environmentId, ...request } = parseBody(executeWithEnvironmentSchema, req.body);
    const context = execution.context(environmentId);

    // If our client goes away (tab closed, Cancel pressed), stop the outbound request too.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    try {
      const response = await execution.execute(request, context, abort.signal);
      res.json({ ok: true, response });
    } catch (error) {
      if (abort.signal.aborted) return; // nobody is listening any more
      throw error;
    }
  };
}
