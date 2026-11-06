import { describe, expect, it } from 'vitest';
import type { ExecutedResponse } from '../schemas/execute';
import { assertionName, evaluateAssertions } from './evaluate';
import type { Assertion, AssertionResult } from './schema';

const BODY = {
  data: {
    items: [
      { id: 1, name: 'Keyboard', price: 49.9, inStock: true, tags: ['usb', 'black'] },
      { id: 2, name: 'Mouse', price: 19.5, inStock: false, tags: [] },
    ],
    total: 2,
    nextPage: null,
  },
  meta: { 'first name': 'Ada' },
};

function response(overrides: Partial<ExecutedResponse> = {}): ExecutedResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: [
      ['Content-Type', 'application/json; charset=utf-8'],
      ['X-Rate', '10'],
    ],
    body: { kind: 'json', text: JSON.stringify(BODY) },
    sizeBytes: 100,
    durationMs: 120,
    finalUrl: 'http://example.com/',
    redirects: [],
    ...overrides,
  };
}

let nextId = 0;
function make(
  partial: Omit<Assertion, 'id' | 'enabled' | 'expected' | 'target'> & Partial<Assertion>,
): Assertion {
  return { id: `a${++nextId}`, enabled: true, target: '', expected: '', ...partial };
}

function run(assertion: Assertion, res = response()): AssertionResult {
  const [result] = evaluateAssertions([assertion], res);
  if (!result) throw new Error('no result');
  return result;
}

const outcome = (assertion: Assertion, res?: ExecutedResponse) => run(assertion, res).outcome;

describe('status code', () => {
  it.each([
    ['equals', '200', 'pass'],
    ['equals', '201', 'fail'],
    ['equals', ' 200 ', 'pass'], // surrounding spaces are ignored
    ['notEquals', '500', 'pass'],
    ['notEquals', '200', 'fail'],
    ['lessThan', '300', 'pass'],
    ['lessThan', '200', 'fail'], // boundary: 200 is not < 200
    ['greaterThan', '199', 'pass'],
    ['greaterThan', '200', 'fail'],
    ['equals', 'abc', 'error'],
    ['equals', '', 'error'],
  ] as const)('%s %j → %s', (operator, expected, result) => {
    expect(outcome(make({ kind: 'status', operator, expected }))).toBe(result);
  });

  // The message states what is actually true, in plain English.
  it.each([
    ['equals', '200', '200 equals 200.'],
    ['equals', '201', '200 does not equal 201.'],
    ['notEquals', '500', '200 does not equal 500.'],
    ['notEquals', '200', '200 equals 200.'],
    ['lessThan', '200', '200 is not less than 200.'],
    ['greaterThan', '100', '200 is greater than 100.'],
  ] as const)('%s %s explains: %s', (operator, expected, message) => {
    expect(run(make({ kind: 'status', operator, expected })).message).toBe(message);
  });
});

describe('response time', () => {
  it.each([
    ['lessThan', '1000', 'pass'],
    ['lessThan', '120', 'fail'],
    ['greaterThan', '100', 'pass'],
    ['lessThan', 'fast', 'error'],
  ] as const)('%s %j ms → %s', (operator, expected, result) => {
    expect(outcome(make({ kind: 'responseTime', operator, expected }))).toBe(result);
  });

  it('shows the unit in expected and actual', () => {
    const result = run(make({ kind: 'responseTime', operator: 'lessThan', expected: '1000' }));

    expect(result).toMatchObject({ expected: '1000 ms', actual: '120 ms' });
  });
});

describe('header', () => {
  it.each([
    ['content-type', 'exists', '', 'pass'],
    ['CONTENT-TYPE', 'exists', '', 'pass'], // names are case-insensitive
    ['X-Missing', 'exists', '', 'fail'],
    ['X-Missing', 'notExists', '', 'pass'],
    ['X-Rate', 'notExists', '', 'fail'],
    ['X-Rate', 'equals', '10', 'pass'],
    ['X-Rate', 'equals', '10 ', 'fail'], // values are compared exactly
    ['X-Missing', 'equals', '10', 'fail'],
    ['content-type', 'contains', 'json', 'pass'],
    ['content-type', 'contains', 'xml', 'fail'],
    ['', 'exists', '', 'error'],
  ] as const)('%s %s %j → %s', (target, operator, expected, result) => {
    expect(outcome(make({ kind: 'header', target, operator, expected }))).toBe(result);
  });

  it('joins repeated headers like the response viewer does', () => {
    const res = response({
      headers: [
        ['Set-Cookie', 'a=1'],
        ['set-cookie', 'b=2'],
      ],
    });

    expect(
      run(make({ kind: 'header', target: 'set-cookie', operator: 'exists' }), res).actual,
    ).toBe('a=1, b=2');
  });
});

describe('body text', () => {
  it.each([
    ['contains', 'Keyboard', 'pass'],
    ['contains', 'keyboard', 'fail'], // case-sensitive
    ['notContains', 'Keyboard', 'fail'],
    ['notContains', 'Tablet', 'pass'],
    ['contains', '', 'error'],
  ] as const)('%s %j → %s', (operator, expected, result) => {
    expect(outcome(make({ kind: 'body', operator, expected }))).toBe(result);
  });

  it('works on text bodies and treats an empty body as ""', () => {
    const text = response({ body: { kind: 'text', text: 'hello', malformedJson: false } });
    const empty = response({ body: { kind: 'empty' } });

    expect(outcome(make({ kind: 'body', operator: 'contains', expected: 'ell' }), text)).toBe(
      'pass',
    );
    expect(outcome(make({ kind: 'body', operator: 'contains', expected: 'x' }), empty)).toBe(
      'fail',
    );
  });

  it('cannot check binary bodies', () => {
    const binary = response({ body: { kind: 'binary' } });

    expect(outcome(make({ kind: 'body', operator: 'contains', expected: 'x' }), binary)).toBe(
      'error',
    );
  });
});

describe('JSON path: existence and null', () => {
  it.each([
    ['data.total', 'exists', 'pass'],
    ['data.nextPage', 'exists', 'pass'], // null still exists
    ['data.missing', 'exists', 'fail'],
    ['data.items[5]', 'exists', 'fail'],
    ['data.missing', 'notExists', 'pass'],
    ['data.total', 'notExists', 'fail'],
    ['', 'exists', 'pass'], // the root
    ['data.nextPage', 'isNull', 'pass'],
    ['data.total', 'isNull', 'fail'],
    ['data.total', 'isNotNull', 'pass'],
    ['data.nextPage', 'isNotNull', 'fail'],
    ['data.missing', 'isNull', 'fail'], // missing is not null
    ['__proto__', 'exists', 'fail'], // never reaches the prototype
  ] as const)('%j %s → %s', (target, operator, result) => {
    expect(outcome(make({ kind: 'jsonPath', target, operator }))).toBe(result);
  });
});

describe('JSON path: equals / notEquals', () => {
  it.each([
    ['data.total', '2', 'pass'],
    ['data.total', '"2"', 'fail'], // number vs string
    ['data.items[0].name', 'Keyboard', 'pass'], // plain text = string
    ['data.items[0].name', '"Keyboard"', 'pass'], // quoted = same string
    ['meta["first name"]', 'Ada', 'pass'],
    ['data.items[0].price', '49.9', 'pass'],
    ['data.items[0].inStock', 'true', 'pass'],
    ['data.items[0].inStock', '"true"', 'fail'],
    ['data.nextPage', 'null', 'pass'],
    ['data.items[0].tags', '["usb","black"]', 'pass'],
    ['data.items[0].tags', '["black","usb"]', 'fail'], // array order matters
    ['meta', '{"first name":"Ada"}', 'pass'],
    ['data.missing', '1', 'fail'],
  ] as const)('%j equals %j → %s', (target, expected, result) => {
    expect(outcome(make({ kind: 'jsonPath', target, operator: 'equals', expected }))).toBe(result);
  });

  it('names the type mismatch in the message', () => {
    const result = run(
      make({ kind: 'jsonPath', target: 'data.total', operator: 'equals', expected: '"2"' }),
    );

    expect(result.message).toBe(
      'Expected "2" (string) but got 2 (number). The types differ: number vs string.',
    );
    expect(result).toMatchObject({ expected: '"2" (string)', actual: '2 (number)' });
  });

  it('notEquals passes when values differ and fails when equal', () => {
    const base = { kind: 'jsonPath', target: 'data.total', operator: 'notEquals' } as const;

    expect(outcome(make({ ...base, expected: '3' }))).toBe('pass');
    expect(outcome(make({ ...base, expected: '2' }))).toBe('fail');
  });

  it('warns that big integers may be compared imprecisely', () => {
    const res = response({ body: { kind: 'json', text: '{"id": 12345678901234567890}' } });
    const result = run(
      make({
        kind: 'jsonPath',
        target: 'id',
        operator: 'equals',
        expected: '12345678901234567000',
      }),
      res,
    );

    // JS rounds both numbers to the same double, so this "passes" — the note says why to distrust it.
    expect(result.outcome).toBe('pass');
    expect(result.message).toContain('beyond 2^53');
  });
});

describe('JSON path: type, contains, comparisons', () => {
  it.each([
    ['data.items', 'isType', 'array', 'pass'],
    ['data', 'isType', 'object', 'pass'],
    ['data.total', 'isType', 'number', 'pass'],
    ['data.total', 'isType', 'Number', 'pass'], // case-insensitive type name
    ['data.nextPage', 'isType', 'null', 'pass'],
    ['data.items[0].name', 'isType', 'number', 'fail'],
    ['data.total', 'isType', 'integer', 'error'], // not a JSON type
    ['data.items[0].name', 'contains', 'board', 'pass'],
    ['data.items[0].name', 'contains', 'Board', 'fail'],
    ['data.items[0].tags', 'contains', 'usb', 'pass'],
    ['data.items[0].tags', 'contains', 'red', 'fail'],
    ['data.items[1].tags', 'contains', 'usb', 'fail'], // empty array
    ['data.total', 'contains', '2', 'error'], // contains needs string/array
    ['data.items[0].price', 'greaterThan', '40', 'pass'],
    ['data.items[0].price', 'greaterThan', '60', 'fail'],
    ['data.items[0].price', 'lessThan', '49.9', 'fail'], // boundary
    ['data.items[0].price', 'lessThan', 'cheap', 'error'],
    ['data.items[0].name', 'greaterThan', '1', 'error'], // not a number
    ['data.missing', 'greaterThan', '1', 'fail'],
  ] as const)('%j %s %j → %s', (target, operator, expected, result) => {
    expect(outcome(make({ kind: 'jsonPath', target, operator, expected }))).toBe(result);
  });

  it('array contains compares with JSON types', () => {
    const res = response({ body: { kind: 'json', text: '{"ids":[1,2,3]}' } });
    const base = { kind: 'jsonPath', target: 'ids', operator: 'contains' } as const;

    expect(outcome(make({ ...base, expected: '2' }), res)).toBe('pass');
    expect(outcome(make({ ...base, expected: '"2"' }), res)).toBe('fail');
  });
});

describe('JSON path: invalid assertions and non-JSON bodies', () => {
  it('reports an invalid path as error with its position', () => {
    const result = run(make({ kind: 'jsonPath', target: 'data.items[', operator: 'exists' }));

    expect(result.outcome).toBe('error');
    expect(result.message).toBe(
      'Invalid path: Expected an array index or a quoted key. (at character 12).',
    );
  });

  it.each([
    [{ kind: 'text', text: 'hello', malformedJson: false }, 'The body is not JSON (text).'],
    [{ kind: 'empty' }, 'The body is not JSON (empty).'],
    [{ kind: 'binary' }, 'The body is not JSON (binary).'],
  ] as const)('reports a non-JSON body (%j) as error', (body, message) => {
    const result = run(
      make({ kind: 'jsonPath', target: 'a', operator: 'exists' }),
      response({ body }),
    );

    expect(result).toMatchObject({ outcome: 'error', message });
  });
});

describe('evaluateAssertions', () => {
  it('keeps the order, skips disabled assertions and links results by id', () => {
    const first = make({ kind: 'status', operator: 'equals', expected: '200' });
    const disabled = make({ kind: 'status', operator: 'equals', expected: '500', enabled: false });
    const last = make({ kind: 'body', operator: 'contains', expected: 'Mouse' });

    const results = evaluateAssertions([first, disabled, last], response());

    expect(results.map((r) => [r.assertionId, r.outcome])).toEqual([
      [first.id, 'pass'],
      [last.id, 'pass'],
    ]);
  });

  it('returns an empty list for no assertions', () => {
    expect(evaluateAssertions([], response())).toEqual([]);
  });

  it('is deterministic: same input, same output', () => {
    const list = [
      make({ kind: 'jsonPath', target: 'data.total', operator: 'equals', expected: '2' }),
    ];

    expect(evaluateAssertions(list, response())).toEqual(evaluateAssertions(list, response()));
  });
});

describe('assertionName', () => {
  it.each([
    [{ kind: 'status', operator: 'equals', expected: '200' }, 'Status code equals 200'],
    [
      { kind: 'responseTime', operator: 'lessThan', expected: '500' },
      'Response time is less than 500 ms',
    ],
    [{ kind: 'header', target: 'X-A', operator: 'exists' }, 'Header X-A exists'],
    [{ kind: 'header', target: '', operator: 'exists' }, 'Header (no name) exists'],
    [{ kind: 'body', operator: 'notContains', expected: 'err' }, 'Body does not contain err'],
    [{ kind: 'jsonPath', target: 'a.b', operator: 'isNull' }, 'a.b is null'],
    [
      { kind: 'jsonPath', target: '', operator: 'isType', expected: 'object' },
      '(root) is of type object',
    ],
  ] as const)('%j → %s', (partial, name) => {
    expect(assertionName(make(partial))).toBe(name);
  });
});
