import { collectionInputSchema, savedRequestInputSchema } from '@api-sentinel/shared';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import type { CollectionService } from '../services/collectionService';
import { parseBody } from '../validators/parseBody';

const idSchema = z.uuid();

/** Route ids are user input too: a malformed id is a 404, never a database query. */
function idParam(req: Request): string {
  const result = idSchema.safeParse(req.params.id);
  if (!result.success) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return result.data;
}

/** Thin HTTP layer: validate, call the service, send the result. */
export function createCollectionsControllers(service: CollectionService) {
  const list: RequestHandler = (_req, res) => {
    res.json({ ok: true, collections: service.list() });
  };
  const create: RequestHandler = (req, res) => {
    const { name } = parseBody(collectionInputSchema, req.body);
    res.status(201).json({ ok: true, collection: service.create(name) });
  };
  const rename: RequestHandler = (req, res) => {
    const id = idParam(req);
    const { name } = parseBody(collectionInputSchema, req.body);
    res.json({ ok: true, collection: service.rename(id, name) });
  };
  const remove: RequestHandler = (req, res) => {
    service.remove(idParam(req));
    res.json({ ok: true, deleted: true });
  };

  const getRequest: RequestHandler = (req, res) => {
    res.json({ ok: true, savedRequest: service.getRequest(idParam(req)) });
  };
  const createRequest: RequestHandler = (req, res) => {
    const input = parseBody(savedRequestInputSchema, req.body);
    res.status(201).json({ ok: true, savedRequest: service.createRequest(input) });
  };
  const updateRequest: RequestHandler = (req, res) => {
    const id = idParam(req);
    const input = parseBody(savedRequestInputSchema, req.body);
    res.json({ ok: true, savedRequest: service.updateRequest(id, input) });
  };
  const removeRequest: RequestHandler = (req, res) => {
    service.removeRequest(idParam(req));
    res.json({ ok: true, deleted: true });
  };

  return { list, create, rename, remove, getRequest, createRequest, updateRequest, removeRequest };
}
