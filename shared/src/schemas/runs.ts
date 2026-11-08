import { z } from 'zod';
import { httpMethodSchema } from './http';

/**
 * Collection runs (Phase 6.3). A run stores outcomes only: status, timing and
 * assertion results. Response bodies are never kept, and URLs stay in their
 * `{{variable}}` form, so a run or report cannot contain a secret value.
 */

export const assertionResultSchema = z.object({
  assertionId: z.string(),
  name: z.string(),
  outcome: z.enum(['pass', 'fail', 'error']),
  expected: z.string(),
  actual: z.string(),
  message: z.string(),
});

/**
 * pass:  a response arrived and every assertion passed (or there are none)
 * fail:  a response arrived but an assertion did not pass
 * error: no response (blocked, timeout, undefined variable, ...)
 */
export const RUN_OUTCOMES = ['pass', 'fail', 'error'] as const;

export const runRequestResultSchema = z.object({
  savedRequestId: z.string(),
  name: z.string(),
  method: httpMethodSchema,
  url: z.string(),
  outcome: z.enum(RUN_OUTCOMES),
  status: z.number().int().nullable(),
  statusText: z.string(),
  durationMs: z.number().nonnegative().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  assertions: z.array(assertionResultSchema),
});

export const runSummarySchema = z.object({
  id: z.uuid(),
  collectionId: z.uuid().nullable(),
  collectionName: z.string(),
  environmentName: z.string().nullable(),
  startedAt: z.string(),
  durationMs: z.number().nonnegative(),
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

export const runSchema = runSummarySchema.extend({ results: z.array(runRequestResultSchema) });

export const startRunSchema = z.object({ environmentId: z.uuid().optional() });

export const runResponseSchema = z.object({ ok: z.literal(true), run: runSchema });
export const runListResponseSchema = z.object({
  ok: z.literal(true),
  runs: z.array(runSummarySchema),
});

export type RunOutcome = (typeof RUN_OUTCOMES)[number];
export type RunRequestResult = z.infer<typeof runRequestResultSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type Run = z.infer<typeof runSchema>;
export type RunResponse = z.infer<typeof runResponseSchema>;
export type RunListResponse = z.infer<typeof runListResponseSchema>;
