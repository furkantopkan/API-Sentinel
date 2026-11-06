import { z } from 'zod';
import { apiErrorResponseSchema } from './apiError';
import { httpMethodSchema } from './http';

/**
 * Contract of `POST /api/requests/execute`.
 * The client sends an ExecuteRequest; the server answers with an ExecuteResult:
 * either `{ ok: true, response }` (the target answered — even with 404 or 500)
 * or `{ ok: false, error }` (we could not get an answer: invalid input,
 * blocked target, DNS failure, timeout, ...).
 */

// ---------- Request ----------

export const keyValueSchema = z.object({
  key: z.string().max(1024),
  value: z.string().max(8192),
  enabled: z.boolean(),
});

export const authConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string().max(8192) }),
  z.object({
    type: z.literal('basic'),
    username: z.string().max(1024),
    password: z.string().max(1024),
  }),
]);

export type AuthConfig = z.infer<typeof authConfigSchema>;

export const requestOptionsSchema = z.object({
  /**
   * Optional: the server falls back to REQUEST_TIMEOUT_DEFAULT_MS.
   * The upper bound is enforced by the server configuration (REQUEST_TIMEOUT_MAX_MS).
   */
  timeoutMs: z.number().int().positive().optional(),
  followRedirects: z.boolean(),
});

export const executeRequestSchema = z.object({
  method: httpMethodSchema,
  url: z.string().max(8192),
  queryParams: z.array(keyValueSchema).max(200),
  headers: z.array(keyValueSchema).max(200),
  auth: authConfigSchema,
  /** Raw JSON text; empty string means "no body". */
  body: z.string(),
  options: requestOptionsSchema,
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

// ---------- Response ----------

export const responseBodySchema = z.discriminatedUnion('kind', [
  /** Valid JSON. `text` is the raw text; the client formats it for display. */
  z.object({ kind: z.literal('json'), text: z.string() }),
  /** Text; `malformedJson` is true when the server claimed JSON but sent invalid JSON. */
  z.object({ kind: z.literal('text'), text: z.string(), malformedJson: z.boolean() }),
  z.object({ kind: z.literal('empty') }),
  /** Not valid UTF-8 text (image, archive, ...). Content is not transferred. */
  z.object({ kind: z.literal('binary') }),
]);

export type ResponseBody = z.infer<typeof responseBodySchema>;

export const executedResponseSchema = z.object({
  status: z.number().int(),
  statusText: z.string(),
  /** Pairs instead of an object: a header like set-cookie may appear several times. */
  headers: z.array(z.tuple([z.string(), z.string()])),
  body: responseBodySchema,
  /** Size of the (decompressed) body in bytes. */
  sizeBytes: z.number().int().nonnegative(),
  /** Total time including redirects and reading the body. */
  durationMs: z.number().nonnegative(),
  finalUrl: z.string(),
  redirects: z.array(z.object({ status: z.number().int(), location: z.string() })),
});

export type ExecutedResponse = z.infer<typeof executedResponseSchema>;

export const executeSuccessResponseSchema = z.object({
  ok: z.literal(true),
  response: executedResponseSchema,
});

export const executeResultSchema = z.discriminatedUnion('ok', [
  executeSuccessResponseSchema,
  apiErrorResponseSchema,
]);

export type ExecuteResult = z.infer<typeof executeResultSchema>;
