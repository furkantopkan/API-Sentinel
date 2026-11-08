import { environmentInputSchema } from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import type { EnvironmentService } from '../services/environmentService';
import { idParam } from '../validators/idParam';
import { parseBody } from '../validators/parseBody';

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
