import {
  collectionImportSchema,
  collectionInputSchema,
  savedRequestInputSchema,
} from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import type { CollectionService } from '../services/collectionService';
import { idParam } from '../validators/idParam';
import { parseBody } from '../validators/parseBody';

/** Thin HTTP layer: validate, call the service, send the result. */
export function createCollectionsControllers(service: CollectionService) {
  const list: RequestHandler = (_req, res) => {
    res.json({ ok: true, collections: service.list() });
  };
  const create: RequestHandler = (req, res) => {
    const { name, environmentId } = parseBody(collectionInputSchema, req.body);
    res.status(201).json({ ok: true, collection: service.create(name, environmentId ?? null) });
  };
  const importCollection: RequestHandler = (req, res) => {
    const input = parseBody(collectionImportSchema, req.body);
    res.status(201).json({ ok: true, collection: service.importCollection(input) });
  };
  const rename: RequestHandler = (req, res) => {
    const id = idParam(req);
    const { name, environmentId } = parseBody(collectionInputSchema, req.body);
    res.json({ ok: true, collection: service.rename(id, name, environmentId) });
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
  const renameRequest: RequestHandler = (req, res) => {
    const id = idParam(req);
    const { name } = parseBody(collectionInputSchema, req.body);
    res.json({ ok: true, savedRequest: service.renameRequest(id, name) });
  };
  const removeRequest: RequestHandler = (req, res) => {
    service.removeRequest(idParam(req));
    res.json({ ok: true, deleted: true });
  };

  return {
    list,
    create,
    importCollection,
    rename,
    remove,
    getRequest,
    createRequest,
    updateRequest,
    renameRequest,
    removeRequest,
  };
}
