import { z } from 'zod';

/**
 * Assertion model (FR-04). One assertion = one check on a response:
 *   kind      what is checked         (status, response time, header, body, JSON path)
 *   target    header name / JSON path (empty for the other kinds)
 *   operator  how it is compared      (equals, contains, exists, …)
 *   expected  the expected value as typed by the user (interpreted at evaluation)
 *
 * `expected` is kept as raw text on purpose: the UI edits text, storage
 * (Phase 6) keeps what the user typed, and evaluation reports a clear
 * `error` outcome if the text does not fit the operator (e.g. "abc" for "less than").
 */

export const ASSERTION_OPERATORS = {
  status: ['equals', 'notEquals', 'lessThan', 'greaterThan'],
  responseTime: ['lessThan', 'greaterThan'],
  header: ['exists', 'notExists', 'equals', 'contains'],
  body: ['contains', 'notContains'],
  jsonPath: [
    'exists',
    'notExists',
    'equals',
    'notEquals',
    'isNull',
    'isNotNull',
    'isType',
    'contains',
    'greaterThan',
    'lessThan',
  ],
} as const;

export type AssertionKind = keyof typeof ASSERTION_OPERATORS;
export type AssertionOperator = (typeof ASSERTION_OPERATORS)[AssertionKind][number];

export const ASSERTION_KINDS = Object.keys(ASSERTION_OPERATORS) as AssertionKind[];

/** Operators that compare against nothing: the expected field is ignored. */
const NO_EXPECTED: ReadonlySet<AssertionOperator> = new Set([
  'exists',
  'notExists',
  'isNull',
  'isNotNull',
]);

export function operatorNeedsExpected(operator: AssertionOperator): boolean {
  return !NO_EXPECTED.has(operator);
}

/** Kinds whose `target` is required (header name or JSON path). */
export function kindHasTarget(kind: AssertionKind): boolean {
  return kind === 'header' || kind === 'jsonPath';
}

export const MAX_ASSERTIONS = 50;

const common = {
  id: z.string().min(1).max(100),
  enabled: z.boolean(),
  expected: z.string().max(10_000),
};

export const assertionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...common,
    kind: z.literal('status'),
    target: z.literal(''),
    operator: z.enum(ASSERTION_OPERATORS.status),
  }),
  z.object({
    ...common,
    kind: z.literal('responseTime'),
    target: z.literal(''),
    operator: z.enum(ASSERTION_OPERATORS.responseTime),
  }),
  z.object({
    ...common,
    kind: z.literal('header'),
    target: z.string().max(1024),
    operator: z.enum(ASSERTION_OPERATORS.header),
  }),
  z.object({
    ...common,
    kind: z.literal('body'),
    target: z.literal(''),
    operator: z.enum(ASSERTION_OPERATORS.body),
  }),
  z.object({
    ...common,
    kind: z.literal('jsonPath'),
    // An empty path means the whole body (the root value).
    target: z.string().max(2048),
    operator: z.enum(ASSERTION_OPERATORS.jsonPath),
  }),
]);

export const assertionListSchema = z.array(assertionSchema).max(MAX_ASSERTIONS);

export type Assertion = z.infer<typeof assertionSchema>;

export type AssertionOutcome = 'pass' | 'fail' | 'error';

export interface AssertionResult {
  assertionId: string;
  /** Human-readable check, e.g. `data.total equals 2`. */
  name: string;
  outcome: AssertionOutcome;
  expected: string;
  actual: string;
  /** Why it passed / failed, or what is wrong with the assertion itself. */
  message: string;
}
