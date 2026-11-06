import { executeRequestSchema } from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import type { RequestEngine } from '../services/request-engine/requestEngine';
import { parseBody } from '../validators/parseBody';

/**
 * `POST /api/requests/execute`
 * Thin HTTP layer: validate input, call the engine, send the result.
 * Errors are thrown and handled by the central errorHandler.
 */
export function createExecuteController(engine: RequestEngine): RequestHandler {
  return async (req, res) => {
    const request = parseBody(executeRequestSchema, req.body);

    // If our client goes away (tab closed, Cancel pressed), stop the outbound request too.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    try {
      const response = await engine.execute(request, abort.signal);
      res.json({ ok: true, response });
    } catch (error) {
      if (abort.signal.aborted) return; // nobody is listening any more
      throw error;
    }
  };
}
