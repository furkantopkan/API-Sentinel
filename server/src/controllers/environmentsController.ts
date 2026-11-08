import { environmentInputSchema } from '@api-sentinel/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import type { EnvironmentService } from '../services/environmentService';
import { parseBody } from '../validators/parseBody';

const idSchema = z.uuid();

function idParam(req: Request): string {
  const result = idSchema.safeParse(req.params.id);
  if (!result.success) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return result.data;
}

export function createEnvironmentsControllers(service: EnvironmentService) {
  const list: RequestHandler = (_req, res) => {
    res.json({ ok: true, environments: service.list() });
  };
  const create: RequestHandler = (req, res) => {
    const input = parseBody(environmentInputSchema, req.body);
    res.status(201).json({ ok: true, environment: service.create(input) });
  };
  const update: RequestHandler = (req, res) => {
    const id = idParam(req);
    const input = parseBody(environmentInputSchema, req.body);
    res.json({ ok: true, environment: service.update(id, input) });
  };
  const remove: RequestHandler = (req, res) => {
    service.remove(idParam(req));
    res.json({ ok: true, deleted: true });
  };
  return { list, create, update, remove };
}
