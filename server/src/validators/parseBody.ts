import type { z } from 'zod';
import { AppError } from '../errors/AppError';

/**
 * Validates an incoming request body with a Zod schema.
 * On failure throws VALIDATION_ERROR listing the invalid fields. Only paths and
 * messages are returned — never the submitted values, which may be secrets.
 */
export function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  body: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Request body is invalid.', 400, {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
