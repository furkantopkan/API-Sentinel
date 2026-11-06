import type { ErrorCode } from '@api-sentinel/shared';

/**
 * An expected, user-facing error. Throw it anywhere (services, controllers,
 * middleware); the central errorHandler turns it into a standard JSON response.
 *
 * The message must be safe to show to the user: never put tokens, passwords
 * or raw request bodies in it.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
