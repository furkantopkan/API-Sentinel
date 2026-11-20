import { z } from 'zod';

/**
 * Every error code our backend can return.
 * See docs/architecture.md §5.1 for the meaning and HTTP status of each code.
 * Codes for later steps are listed already so the contract is defined in one place.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_URL',
  'INVALID_JSON_BODY',
  'FORBIDDEN_HEADER',
  'BLOCKED_TARGET',
  'DNS_ERROR',
  'CONNECTION_ERROR',
  'TOO_MANY_REDIRECTS',
  'RESPONSE_TOO_LARGE',
  'TIMEOUT',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  // Phase 5 – AI features
  'RATE_LIMITED',
  'AI_NOT_CONFIGURED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_UNAVAILABLE',
  'AI_REFUSED',
  'AI_INVALID_OUTPUT',
  // Phase 6.2 – environments
  'UNKNOWN_VARIABLE',
  // Phase 7 – flow recording
  'RECORDING_ACTIVE',
  'RECORDER_UNAVAILABLE',
  // A site's bot protection refused the request (see server/src/services/botBlock.ts).
  'BLOCKED_BY_SITE',
  // Phase 8 – a change sent by another web site (cross-site request forgery).
  'FORBIDDEN_ORIGIN',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Body of every error response returned by our backend. */
export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ApiErrorBody = ApiErrorResponse['error'];
