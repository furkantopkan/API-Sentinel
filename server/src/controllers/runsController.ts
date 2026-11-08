import { startRunSchema } from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { reportFileName, renderRunHtml, renderRunJson } from '../services/runReport';
import type { RunService } from '../services/runService';
import { idParam } from '../validators/idParam';
import { parseBody } from '../validators/parseBody';

export function createRunsControllers(service: RunService) {
  const start: RequestHandler = async (req, res) => {
    const collectionId = idParam(req);
    const { environmentId } = parseBody(startRunSchema, req.body);

    // Closing the page or pressing Cancel stops the run.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    try {
      const run = await service.start(collectionId, environmentId, abort.signal);
      res.status(201).json({ ok: true, run });
    } catch (error) {
      if (abort.signal.aborted) return; // nobody is listening any more
      throw error;
    }
  };

  const list: RequestHandler = (_req, res) => {
    res.json({ ok: true, runs: service.list() });
  };

  const get: RequestHandler = (req, res) => {
    res.json({ ok: true, run: service.get(idParam(req)) });
  };

  const remove: RequestHandler = (req, res) => {
    service.remove(idParam(req));
    res.json({ ok: true, deleted: true });
  };

  const report: RequestHandler = (req, res) => {
    const run = service.get(idParam(req));
    const format = req.query.format;
    if (format !== 'json' && format !== 'html') {
      throw new AppError('VALIDATION_ERROR', 'format must be "json" or "html".', 400);
    }
    // Always a download, and scripts are forbidden even if escaping ever failed.
    res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(run, format)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (format === 'json') {
      res.type('application/json').send(renderRunJson(run));
    } else {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      res.type('text/html').send(renderRunHtml(run));
    }
  };

  return { start, list, get, remove, report };
}
