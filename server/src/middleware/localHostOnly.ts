import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Accepts only requests addressed to this machine by a local name.
 * Binding to 127.0.0.1 is not enough for an always-running app: with DNS
 * rebinding a malicious web page makes the browser reach it under the page's
 * own host name, and only the Host header reveals that.
 */
export const localHostOnly: RequestHandler = (req, _res, next) => {
  const hostname = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!LOCAL_NAMES.has(hostname)) throw new AppError('NOT_FOUND', 'Not found.', 404);
  next();
};
