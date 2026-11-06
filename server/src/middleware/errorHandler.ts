import type { ErrorRequestHandler, Response } from 'express';
import type { ApiErrorBody, ApiErrorResponse } from '@api-sentinel/shared';
import { AppError } from '../errors/AppError';

/** Shape of errors thrown by express.json() (the body-parser package). */
interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string' &&
    'status' in error &&
    typeof error.status === 'number'
  );
}

function sendError(res: Response, httpStatus: number, error: ApiErrorBody): void {
  const body: ApiErrorResponse = { ok: false, error };
  res.status(httpStatus).json(body);
}

/**
 * Central error handler. Express recognizes it as an error handler because it
 * has four parameters. Every error in the app ends up here, so all error
 * responses share the same `{ ok: false, error: { code, message } }` shape.
 *
 * Express 5 also forwards errors thrown inside async handlers to this function.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // The response is already being sent; let Express close the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    sendError(res, error.httpStatus, {
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  // Errors from express.json(). They may carry the raw request body, which can
  // contain secrets, so we neither log them nor echo any part of them back.
  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      sendError(res, 413, {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the allowed size.',
      });
      return;
    }

    if (error.status >= 400 && error.status < 500) {
      sendError(res, 400, {
        code: 'VALIDATION_ERROR',
        message:
          error.type === 'entity.parse.failed'
            ? 'Request body is not valid JSON.'
            : 'Request body could not be read.',
      });
      return;
    }
  }

  // Unexpected error: full details go to the server log only.
  // The client gets a generic message so internals are not leaked.
  console.error('[server] Unexpected error:', error instanceof Error ? error.stack : String(error));
  sendError(res, 500, {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  });
};
