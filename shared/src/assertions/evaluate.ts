import { parseJsonPath, resolveJsonPath } from '../json/jsonPath';
import { readJsonBody } from '../json/readJsonBody';
import type { ExecutedResponse } from '../schemas/execute';
import {
  operatorNeedsExpected,
  type Assertion,
  type AssertionOperator,
  type AssertionOutcome,
  type AssertionResult,
} from './schema';
import {
  JSON_TYPE_NAMES,
  deepEqual,
  describeValue,
  interpretExpected,
  isUnsafeNumber,
  jsonTypeName,
  parseNumber,
  type JsonTypeName,
} from './values';

/**
 * Assertion engine: compares a response against a list of assertions.
 *
 * Pure and deterministic: no network, no clock, no eval. The same function
 * runs in the browser (instant results while editing) and can run on the
 * server (collection runs, Phase 6).
 */

export const OPERATOR_LABELS: Record<AssertionOperator, string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  lessThan: 'is less than',
  greaterThan: 'is greater than',
  exists: 'exists',
  notExists: 'does not exist',
  contains: 'contains',
  notContains: 'does not contain',
  isNull: 'is null',
  isNotNull: 'is not null',
  isType: 'is of type',
};

const SUBJECT_LABELS = {
  status: 'Status code',
  responseTime: 'Response time',
  body: 'Body',
} as const;

/** "data.total equals 2", "Header content-type contains json", "Status code equals 200" */
export function assertionName(assertion: Assertion): string {
  let subject: string;
  if (assertion.kind === 'header') subject = `Header ${assertion.target.trim() || '(no name)'}`;
  else if (assertion.kind === 'jsonPath') subject = assertion.target.trim() || '(root)';
  else subject = SUBJECT_LABELS[assertion.kind];

  const operator = OPERATOR_LABELS[assertion.operator];
  if (!operatorNeedsExpected(assertion.operator)) return `${subject} ${operator}`;
  const unit = assertion.kind === 'responseTime' ? ' ms' : '';
  return `${subject} ${operator} ${assertion.expected.trim()}${unit}`;
}

interface Verdict {
  outcome: AssertionOutcome;
  actual: string;
  message: string;
  expected?: string;
}

const pass = (actual: string, message: string): Verdict => ({ outcome: 'pass', actual, message });
const fail = (actual: string, message: string): Verdict => ({ outcome: 'fail', actual, message });
const invalid = (message: string, actual = '–'): Verdict => ({ outcome: 'error', actual, message });

function compareNumbers(
  operator: AssertionOperator,
  actual: number,
  expectedText: string,
  unit: string,
): Verdict {
  const expected = parseNumber(expectedText);
  const shown = `${actual}${unit}`;
  if (expected === undefined) {
    return invalid(`Expected value "${expectedText}" is not a number.`, shown);
  }
  let ok: boolean;
  switch (operator) {
    case 'equals':
      ok = actual === expected;
      break;
    case 'notEquals':
      ok = actual !== expected;
      break;
    case 'lessThan':
      ok = actual < expected;
      break;
    case 'greaterThan':
      ok = actual > expected;
      break;
    default:
      return invalid(`Operator "${operator}" cannot compare numbers.`, shown);
  }
  // State what is actually true: "200 equals 200" / "200 does not equal 201".
  const [whenTrue, whenFalse] = NUMBER_PHRASES[operator];
  const message = `${shown} ${ok ? whenTrue : whenFalse} ${expected}${unit}.`;
  return ok ? pass(shown, message) : fail(shown, message);
}

/** [phrase when the check holds, phrase when it does not] */
const NUMBER_PHRASES: Record<
  'equals' | 'notEquals' | 'lessThan' | 'greaterThan',
  [string, string]
> = {
  equals: ['equals', 'does not equal'],
  notEquals: ['does not equal', 'equals'],
  lessThan: ['is less than', 'is not less than'],
  greaterThan: ['is greater than', 'is not greater than'],
};

function headerValue(response: ExecutedResponse, name: string): string | undefined {
  const lower = name.toLowerCase();
  const values = response.headers.filter(([key]) => key.toLowerCase() === lower).map(([, v]) => v);
  return values.length > 0 ? values.join(', ') : undefined;
}

function evaluateHeader(assertion: Assertion, response: ExecutedResponse): Verdict {
  const name = assertion.target.trim();
  if (name === '') return invalid('Enter a header name.');
  const value = headerValue(response, name);
  const actual = value === undefined ? '(not present)' : value;

  switch (assertion.operator) {
    case 'exists':
      return value !== undefined
        ? pass(actual, `Header "${name}" is present.`)
        : fail(actual, `Header "${name}" is missing.`);
    case 'notExists':
      return value === undefined
        ? pass(actual, `Header "${name}" is not present.`)
        : fail(actual, `Header "${name}" is present but should not be.`);
    case 'equals':
      if (value === undefined) return fail(actual, `Header "${name}" is missing.`);
      // Header names are case-insensitive; values are compared exactly.
      return value === assertion.expected
        ? pass(actual, 'Values are identical.')
        : fail(actual, `Expected "${assertion.expected}" but got "${value}".`);
    case 'contains':
      if (value === undefined) return fail(actual, `Header "${name}" is missing.`);
      return value.includes(assertion.expected)
        ? pass(actual, `Value contains "${assertion.expected}".`)
        : fail(actual, `Value does not contain "${assertion.expected}".`);
    default:
      return invalid(`Operator "${assertion.operator}" is not supported for headers.`);
  }
}

function bodyAsText(response: ExecutedResponse): string | undefined {
  switch (response.body.kind) {
    case 'json':
    case 'text':
      return response.body.text;
    case 'empty':
      return '';
    case 'binary':
      return undefined;
  }
}

function evaluateBody(assertion: Assertion, response: ExecutedResponse): Verdict {
  const text = bodyAsText(response);
  if (text === undefined) return invalid('The body is binary; text checks are not possible.');
  if (assertion.expected === '') return invalid('Enter the text to look for.');
  const actual = `${text.length} characters`;
  const found = text.includes(assertion.expected);
  if (assertion.operator === 'contains') {
    return found
      ? pass(actual, `Body contains "${assertion.expected}".`)
      : fail(actual, `Body does not contain "${assertion.expected}".`);
  }
  return found
    ? fail(actual, `Body contains "${assertion.expected}" but should not.`)
    : pass(actual, `Body does not contain "${assertion.expected}".`);
}

/** Parsed JSON body, computed once per evaluation. */
type ParsedBody = { ok: true; value: unknown } | { ok: false; reason: string };

function parseBody(response: ExecutedResponse): ParsedBody {
  return readJsonBody(response);
}

const PRECISION_NOTE =
  ' Note: a number beyond 2^53 is involved; JavaScript may have rounded it, so the comparison can be imprecise.';

function evaluateJsonPath(assertion: Assertion, body: ParsedBody): Verdict {
  const parsedPath = parseJsonPath(assertion.target.trim());
  if (!parsedPath.ok) {
    return invalid(`Invalid path: ${parsedPath.error} (at character ${parsedPath.position + 1}).`);
  }
  if (!body.ok) return invalid(body.reason);

  const resolved = resolveJsonPath(body.value, parsedPath.segments);
  const operator = assertion.operator;

  if (operator === 'exists') {
    return resolved.found
      ? pass(describeValue(resolved.value), 'The field exists.')
      : fail('(not found)', 'The field does not exist.');
  }
  if (operator === 'notExists') {
    return resolved.found
      ? fail(describeValue(resolved.value), 'The field exists but should not.')
      : pass('(not found)', 'The field does not exist.');
  }
  if (!resolved.found) return fail('(not found)', 'The field does not exist.');

  const actualValue = resolved.value;
  const actual = describeValue(actualValue);
  const note = isUnsafeNumber(actualValue) ? PRECISION_NOTE : '';

  switch (operator) {
    case 'isNull':
      return actualValue === null
        ? pass(actual, 'The value is null.')
        : fail(actual, 'The value is not null.');
    case 'isNotNull':
      return actualValue !== null
        ? pass(actual, 'The value is not null.')
        : fail(actual, 'The value is null.');

    case 'equals':
    case 'notEquals': {
      const expectedValue = interpretExpected(assertion.expected);
      const equal = deepEqual(actualValue, expectedValue);
      const expectedText = describeValue(expectedValue);
      const extra = note || (isUnsafeNumber(expectedValue) ? PRECISION_NOTE : '');
      // The most common QA mistake: same text, different type (2 vs "2").
      const typeHint =
        !equal && jsonTypeName(actualValue) !== jsonTypeName(expectedValue)
          ? ` The types differ: ${jsonTypeName(actualValue)} vs ${jsonTypeName(expectedValue)}.`
          : '';
      const ok = operator === 'equals' ? equal : !equal;
      const message =
        operator === 'equals'
          ? equal
            ? 'Values are equal.'
            : `Expected ${expectedText} but got ${actual}.${typeHint}`
          : equal
            ? `Value is ${actual}, which it should not be.`
            : 'Values differ.';
      return {
        outcome: ok ? 'pass' : 'fail',
        actual,
        message: message + extra,
        expected: expectedText,
      };
    }

    case 'isType': {
      const expectedType = assertion.expected.trim().toLowerCase();
      if (!JSON_TYPE_NAMES.includes(expectedType as JsonTypeName)) {
        return invalid(
          `Unknown type "${assertion.expected}". Use one of: ${JSON_TYPE_NAMES.join(', ')}.`,
          actual,
        );
      }
      const actualType = jsonTypeName(actualValue);
      return actualType === expectedType
        ? pass(actual, `The value is of type ${actualType}.`)
        : fail(actual, `Expected type ${expectedType} but got ${actualType}.`);
    }

    case 'contains': {
      if (typeof actualValue === 'string') {
        // Plain text is looked up as typed; a JSON string literal ("a b") is unquoted first.
        const needle = interpretExpected(assertion.expected);
        const text = typeof needle === 'string' ? needle : assertion.expected;
        return actualValue.includes(text)
          ? pass(actual, `The text contains "${text}".`)
          : fail(actual, `The text does not contain "${text}".`);
      }
      if (Array.isArray(actualValue)) {
        const needle = interpretExpected(assertion.expected);
        return actualValue.some((item) => deepEqual(item, needle))
          ? pass(actual, `The array contains ${describeValue(needle)}.`)
          : fail(actual, `The array does not contain ${describeValue(needle)}.`);
      }
      return invalid(
        `"contains" needs a string or an array, but the value is ${jsonTypeName(actualValue)}.`,
        actual,
      );
    }

    case 'greaterThan':
    case 'lessThan': {
      if (typeof actualValue !== 'number') {
        return invalid(
          `"${OPERATOR_LABELS[operator]}" needs a number, but the value is ${jsonTypeName(actualValue)}.`,
          actual,
        );
      }
      const verdict = compareNumbers(operator, actualValue, assertion.expected, '');
      return { ...verdict, actual, message: verdict.message + note };
    }

    default:
      return invalid(`Operator "${operator}" is not supported for JSON paths.`, actual);
  }
}

function expectedLabel(assertion: Assertion): string {
  if (!operatorNeedsExpected(assertion.operator)) return '–';
  const unit = assertion.kind === 'responseTime' ? ' ms' : '';
  return `${assertion.expected}${unit}`;
}

/**
 * Evaluates every enabled assertion against the response, in order.
 * Disabled assertions are skipped (no result).
 */
export function evaluateAssertions(
  assertions: readonly Assertion[],
  response: ExecutedResponse,
): AssertionResult[] {
  let body: ParsedBody | undefined; // parsed lazily, at most once
  const jsonBody = () => (body ??= parseBody(response));

  return assertions
    .filter((assertion) => assertion.enabled)
    .map((assertion) => {
      let verdict: Verdict;
      switch (assertion.kind) {
        case 'status':
          verdict = compareNumbers(assertion.operator, response.status, assertion.expected, '');
          break;
        case 'responseTime':
          verdict = compareNumbers(
            assertion.operator,
            response.durationMs,
            assertion.expected,
            ' ms',
          );
          break;
        case 'header':
          verdict = evaluateHeader(assertion, response);
          break;
        case 'body':
          verdict = evaluateBody(assertion, response);
          break;
        case 'jsonPath':
          verdict = evaluateJsonPath(assertion, jsonBody());
          break;
      }
      return {
        assertionId: assertion.id,
        name: assertionName(assertion),
        outcome: verdict.outcome,
        expected: verdict.expected ?? expectedLabel(assertion),
        actual: verdict.actual,
        message: verdict.message,
      };
    });
}
