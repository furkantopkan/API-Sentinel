import type { AnalysisOutput, TestCasesOutput } from '@api-sentinel/shared';
import type { AiClient, AiCompletion } from './aiClient';

/**
 * AI_MODE=mock: a deterministic stand-in for the model, so the AI screens can
 * be tried without an API key or cost. The answers are fixed examples (they
 * do not depend on the request) and the UI labels them as mock output.
 *
 * It still returns data through the same schema as the real client, so the
 * server's validation and filtering run exactly as in production.
 */

const MOCK_TEST_CASES: TestCasesOutput = {
  testCases: [
    {
      title: 'Request as sent returns 200 with a JSON body',
      category: 'positive',
      priority: 'high',
      description: 'The happy path: the request exactly as configured succeeds.',
      steps: ['Send the request unchanged.', 'Inspect status, headers and body.'],
      expectedResult: '200 OK with Content-Type application/json.',
      assertions: [
        { kind: 'status', target: '', operator: 'equals', expected: '200' },
        { kind: 'header', target: 'content-type', operator: 'contains', expected: 'json' },
        { kind: 'responseTime', target: '', operator: 'lessThan', expected: '1000' },
      ],
    },
    {
      title: 'Missing authentication is rejected',
      category: 'security',
      priority: 'high',
      description: 'Without credentials the endpoint must not return data.',
      steps: ['Set Auth to "No Auth" and remove any Authorization header.', 'Send the request.'],
      expectedResult: '401 Unauthorized (or 403) and no data in the body.',
      assertions: [{ kind: 'status', target: '', operator: 'equals', expected: '401' }],
    },
    {
      title: 'Unknown resource returns 404',
      category: 'negative',
      priority: 'medium',
      description: 'A path that does not exist should give a clear not-found error.',
      steps: ['Change the last path segment to a value that does not exist, e.g. 999999.', 'Send.'],
      expectedResult: '404 Not Found with an error message in the body.',
      assertions: [
        { kind: 'status', target: '', operator: 'equals', expected: '404' },
        { kind: 'body', target: '', operator: 'notContains', expected: 'stack' },
      ],
    },
    {
      title: 'Very long query parameter value',
      category: 'boundary',
      priority: 'low',
      description: 'Check how the API handles an unusually long input.',
      steps: ['Add a query parameter q with 5000 characters.', 'Send.'],
      expectedResult: 'A 2xx or a clear 4xx (e.g. 414/400), never a 5xx.',
      assertions: [{ kind: 'status', target: '', operator: 'lessThan', expected: '500' }],
    },
    {
      title: 'Invalid assertion example (filtered by the server)',
      category: 'negative',
      priority: 'low',
      description:
        'This mock item contains one invalid assertion on purpose, to show that the server drops it.',
      steps: ['Send the request.'],
      expectedResult: 'Only the valid assertion is offered.',
      assertions: [
        { kind: 'status', target: '', operator: 'isNull', expected: '' }, // invalid: isNull is not a status operator
        { kind: 'status', target: '', operator: 'notEquals', expected: '500' },
      ],
    },
  ],
};

const MOCK_ANALYSIS: AnalysisOutput = {
  summary:
    'Mock analysis: the response looks like a successful JSON answer. This text is a fixed example, not a real review.',
  observations: [
    {
      severity: 'info',
      title: 'JSON response',
      detail: 'The body is JSON and can be checked with JSON path assertions.',
    },
    {
      severity: 'warning',
      title: 'No Cache-Control header',
      detail: 'Responses without Cache-Control may be cached by proxies unexpectedly.',
    },
  ],
  assertions: [
    { kind: 'status', target: '', operator: 'equals', expected: '200' },
    { kind: 'header', target: 'content-type', operator: 'contains', expected: 'application/json' },
    { kind: 'jsonPath', target: '', operator: 'isType', expected: 'object' },
  ],
};

export function createMockAiClient(): AiClient {
  return {
    model: 'mock',
    isMock: true,
    complete<T>({ task, schema }: AiCompletion<T>): Promise<T> {
      const output = task === 'testCases' ? MOCK_TEST_CASES : MOCK_ANALYSIS;
      return Promise.resolve(schema.parse(structuredClone(output)));
    },
  };
}
