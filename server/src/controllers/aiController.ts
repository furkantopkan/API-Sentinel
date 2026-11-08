import {
  analyzeResponseRequestSchema,
  buildCollectionRequestSchema,
  generateTestCasesRequestSchema,
} from '@api-sentinel/shared';
import type { Request, RequestHandler, Response } from 'express';
import type { AiService } from '../services/ai-engine/aiService';
import { parseBody } from '../validators/parseBody';

/** Aborts the AI call when our client goes away, so we stop paying for it. */
function abortOnClose(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}

export function createAiControllers(ai: AiService) {
  const status: RequestHandler = (_req, res) => {
    res.json({ ok: true, status: ai.status() });
  };

  const testCases: RequestHandler = async (req: Request, res: Response) => {
    const input = parseBody(generateTestCasesRequestSchema, req.body);
    const signal = abortOnClose(res);
    try {
      res.json({ ok: true, ...(await ai.generateTestCases(input, signal)) });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  };

  const analyze: RequestHandler = async (req: Request, res: Response) => {
    const input = parseBody(analyzeResponseRequestSchema, req.body);
    const signal = abortOnClose(res);
    try {
      res.json({ ok: true, ...(await ai.analyzeResponse(input, signal)) });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  };

  const buildCollection: RequestHandler = async (req: Request, res: Response) => {
    const input = parseBody(buildCollectionRequestSchema, req.body);
    const signal = abortOnClose(res);
    try {
      res.json({ ok: true, ...(await ai.buildCollection(input, signal)) });
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  };

  return { status, testCases, analyze, buildCollection };
}
