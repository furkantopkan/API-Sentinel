import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';

const idSchema = z.uuid();

/** Route ids are user input too: a malformed id is a 404, never a database query. */
export function idParam(req: Request): string {
  const result = idSchema.safeParse(req.params.id);
  if (!result.success) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return result.data;
}
