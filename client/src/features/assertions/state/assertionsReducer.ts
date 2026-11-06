import {
  ASSERTION_OPERATORS,
  MAX_ASSERTIONS,
  type Assertion,
  type AssertionKind,
  type AssertionOperator,
} from '@api-sentinel/shared';

/** Sensible starting values when a row is created or its kind changes. */
const DEFAULTS: Record<AssertionKind, { operator: AssertionOperator; expected: string }> = {
  status: { operator: 'equals', expected: '200' },
  responseTime: { operator: 'lessThan', expected: '1000' },
  header: { operator: 'exists', expected: '' },
  body: { operator: 'contains', expected: '' },
  jsonPath: { operator: 'exists', expected: '' },
};

export function newAssertion(id: string, kind: AssertionKind = 'status'): Assertion {
  return { id, enabled: true, kind, target: '', ...DEFAULTS[kind] } as Assertion;
}

/**
 * An assertion for a field picked in the JSON tree: primitives are compared
 * with `equals` (value as JSON, so 2 stays a number and "2" a string),
 * objects/arrays get a type check.
 */
export function assertionForField(id: string, path: string, value: unknown): Assertion {
  const isContainer = typeof value === 'object' && value !== null;
  return {
    id,
    enabled: true,
    kind: 'jsonPath',
    target: path,
    operator: isContainer ? 'isType' : 'equals',
    expected: isContainer ? (Array.isArray(value) ? 'array' : 'object') : JSON.stringify(value),
  };
}

export type AssertionPatch = Partial<Pick<Assertion, 'enabled' | 'target' | 'expected'>> & {
  operator?: AssertionOperator;
};

export type AssertionsAction =
  | { type: 'add'; assertion: Assertion }
  | { type: 'update'; id: string; patch: AssertionPatch }
  | { type: 'changeKind'; id: string; kind: AssertionKind }
  | { type: 'remove'; id: string };

function isOperatorOf(kind: AssertionKind, operator: AssertionOperator): boolean {
  return (ASSERTION_OPERATORS[kind] as readonly AssertionOperator[]).includes(operator);
}

/** Pure reducer for the assertion list (ids are created by the caller). */
export function assertionsReducer(state: Assertion[], action: AssertionsAction): Assertion[] {
  switch (action.type) {
    case 'add':
      return state.length >= MAX_ASSERTIONS ? state : [...state, action.assertion];

    case 'update':
      return state.map((assertion) => {
        if (assertion.id !== action.id) return assertion;
        const { operator, ...rest } = action.patch;
        // Ignore an operator that does not belong to this kind (keeps the union valid).
        const next = { ...assertion, ...rest };
        if (operator !== undefined && isOperatorOf(assertion.kind, operator)) {
          next.operator = operator;
        }
        return next as Assertion;
      });

    case 'changeKind':
      return state.map((assertion) =>
        assertion.id === action.id && assertion.kind !== action.kind
          ? { ...newAssertion(assertion.id, action.kind), enabled: assertion.enabled }
          : assertion,
      );

    case 'remove':
      return state.filter((assertion) => assertion.id !== action.id);
  }
}
