import {
  describeValue,
  parseJsonPath,
  readJsonBody,
  resolveJsonPath,
  type AssertionResult,
  type Capture,
  type ExecutedResponse,
} from '@api-sentinel/shared';

/** Values carried from one request of a run to the next. Lives only during the run. */
export interface FlowState {
  values: Map<string, string>;
  secrets: string[];
}

const parsedBody = (response: ExecutedResponse) => readJsonBody(response);

/**
 * Reads the captures of one request from its response into `flow`. Each one
 * is reported like an assertion: a failed capture would otherwise surface
 * only later, as a confusing "undefined variable" on another request.
 * A secret value is never put in a result.
 */
export function applyCaptures(
  captures: readonly Capture[],
  response: ExecutedResponse,
  flow: FlowState,
): { results: AssertionResult[]; newSecrets: string[] } {
  const body = parsedBody(response);
  const newSecrets: string[] = [];

  const results = captures.map((capture): AssertionResult => {
    const base = {
      assertionId: `capture:${capture.variable}`,
      name: `Capture {{${capture.variable}}} from ${capture.path || '(root)'}`,
      expected: 'a text, number or boolean value',
    };
    const failed = (actual: string, message: string): AssertionResult => ({
      ...base,
      outcome: 'fail',
      actual,
      message,
    });

    if (!body.ok) return failed('–', 'The response body is not JSON.');
    const path = parseJsonPath(capture.path);
    if (!path.ok) return failed('–', `Invalid path: ${path.error}`);
    const found = resolveJsonPath(body.value, path.segments);
    if (!found.found) return failed('(not found)', 'The field does not exist.');
    const value = found.value;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return failed(
        capture.secret ? '[secret]' : describeValue(value),
        'Only single values can be captured.',
      );
    }

    const text = String(value);
    flow.values.set(capture.variable, text);
    if (capture.secret) {
      flow.secrets.push(text);
      newSecrets.push(text);
    }
    return {
      ...base,
      outcome: 'pass',
      actual: capture.secret ? '[secret]' : describeValue(value),
      message: `Available to later requests as {{${capture.variable}}}.`,
    };
  });

  return { results, newSecrets };
}
