import { z } from 'zod';
import {
  ASSERTION_KINDS,
  ASSERTION_OPERATORS,
  type AssertionKind,
  type AssertionOperator,
} from '../assertions/schema';
import { httpMethodSchema } from './http';

/**
 * Contract of the AI features (Phase 5).
 *
 * Inputs: a summary of the request and (optionally) the response the user is
 * looking at. Outputs: what the model must return - validated twice: by the
 * API (structured outputs) and again by our server with these Zod schemas.
 */

const headerPairs = z.array(z.tuple([z.string().max(1024), z.string().max(8192)])).max(200);

/** Bodies above this size are cut by the client before sending (our API limit is 1 MB). */
export const AI_MAX_BODY_CHARS = 50_000;

export const aiRequestContextSchema = z.object({
  method: httpMethodSchema,
  url: z.string().max(8192),
  headers: headerPairs,
  /** Only the type is shared, never the token or password. */
  authType: z.enum(['none', 'bearer', 'basic']),
  body: z.string().max(AI_MAX_BODY_CHARS),
});

export const aiResponseContextSchema = z.object({
  status: z.number().int(),
  statusText: z.string().max(200),
  headers: headerPairs,
  bodyKind: z.enum(['json', 'text', 'empty', 'binary']),
  body: z.string().max(AI_MAX_BODY_CHARS),
  /** True when the client cut the body to AI_MAX_BODY_CHARS. */
  bodyTruncated: z.boolean(),
  durationMs: z.number().nonnegative(),
});

export const generateTestCasesRequestSchema = z.object({
  request: aiRequestContextSchema,
  response: aiResponseContextSchema.optional(),
  /** Optional endpoint description written by the user (FR-05). */
  description: z.string().max(4000).default(''),
});

export const analyzeResponseRequestSchema = z.object({
  request: aiRequestContextSchema,
  response: aiResponseContextSchema,
  description: z.string().max(4000).default(''),
});

export type AiRequestContext = z.infer<typeof aiRequestContextSchema>;
export type AiResponseContext = z.infer<typeof aiResponseContextSchema>;
export type GenerateTestCasesRequest = z.input<typeof generateTestCasesRequestSchema>;
export type AnalyzeResponseRequest = z.input<typeof analyzeResponseRequestSchema>;

// ---------------------------------------------------------------------------
// Model output. Kept flat and simple (strings, enums, arrays) so it maps to a
// JSON schema the API can enforce. Business rules (e.g. which operator fits
// which kind) are checked afterwards by our server.

const ALL_OPERATORS = [...new Set(Object.values(ASSERTION_OPERATORS).flat())] as [
  AssertionOperator,
  ...AssertionOperator[],
];

export const suggestedAssertionSchema = z.object({
  kind: z.enum(ASSERTION_KINDS as [AssertionKind, ...AssertionKind[]]),
  target: z.string(),
  operator: z.enum(ALL_OPERATORS),
  expected: z.string(),
});

export const TEST_CASE_CATEGORIES = [
  'positive',
  'negative',
  'boundary',
  'security',
  'performance',
] as const;

export const testCaseSchema = z.object({
  title: z.string(),
  category: z.enum(TEST_CASE_CATEGORIES),
  priority: z.enum(['high', 'medium', 'low']),
  description: z.string(),
  steps: z.array(z.string()),
  expectedResult: z.string(),
  assertions: z.array(suggestedAssertionSchema),
});

export const testCasesOutputSchema = z.object({ testCases: z.array(testCaseSchema) });

export const analysisOutputSchema = z.object({
  summary: z.string(),
  observations: z.array(
    z.object({
      severity: z.enum(['info', 'warning', 'issue']),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  assertions: z.array(suggestedAssertionSchema),
});

export type SuggestedAssertion = z.infer<typeof suggestedAssertionSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type TestCasesOutput = z.infer<typeof testCasesOutputSchema>;
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

// ---------------------------------------------------------------------------
// Our API's responses.

export const aiMetaSchema = z.object({
  model: z.string(),
  /** True when the server runs the built-in mock instead of a real model. */
  mock: z.boolean(),
  /** Suggested assertions removed because they were invalid (e.g. wrong operator). */
  droppedAssertions: z.number().int().nonnegative(),
  /** Items removed because the output exceeded our limits. */
  droppedItems: z.number().int().nonnegative(),
});

export const aiStatusResponseSchema = z.object({
  ok: z.literal(true),
  status: z.object({
    mode: z.enum(['off', 'mock', 'anthropic', 'ollama']),
    model: z.string().nullable(),
  }),
});

export const testCasesResponseSchema = z.object({
  ok: z.literal(true),
  result: testCasesOutputSchema,
  meta: aiMetaSchema,
});

export const analysisResponseSchema = z.object({
  ok: z.literal(true),
  result: analysisOutputSchema,
  meta: aiMetaSchema,
});

export type AiMeta = z.infer<typeof aiMetaSchema>;
export type AiStatus = z.infer<typeof aiStatusResponseSchema>['status'];
export type TestCasesResponse = z.infer<typeof testCasesResponseSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
