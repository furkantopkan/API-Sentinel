import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Runs when no route matched. Registered after all routes.
 * Uses `req.path` (without the query string) so query values are not echoed.
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.path}`, 404));
};
