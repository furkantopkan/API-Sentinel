import { MAX_ASSERTIONS, assertionSchema, type Assertion } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { assertionForField, assertionsReducer, newAssertion } from './assertionsReducer';

describe('newAssertion', () => {
  it.each([
    ['status', 'equals', '200'],
    ['responseTime', 'lessThan', '1000'],
    ['header', 'exists', ''],
    ['body', 'contains', ''],
    ['jsonPath', 'exists', ''],
  ] as const)('creates a valid %s assertion (%s %j)', (kind, operator, expected) => {
    const assertion = newAssertion('x', kind);

    expect(assertion).toMatchObject({ kind, operator, expected, target: '', enabled: true });
    expect(assertionSchema.safeParse(assertion).success).toBe(true);
  });
});

describe('assertionForField', () => {
  it.each([
    [2, 'equals', '2'],
    ['Ada', 'equals', '"Ada"'], // stays a string, even if it looks like a number
    ['42', 'equals', '"42"'],
    [null, 'equals', 'null'],
    [true, 'equals', 'true'],
    [[1], 'isType', 'array'],
    [{ a: 1 }, 'isType', 'object'],
  ])('value %j → %s %s', (value, operator, expected) => {
    const assertion = assertionForField('x', 'data.v', value);

    expect(assertion).toMatchObject({ kind: 'jsonPath', target: 'data.v', operator, expected });
    expect(assertionSchema.safeParse(assertion).success).toBe(true);
  });
});

describe('assertionsReducer', () => {
  const a = newAssertion('a');
  const b = newAssertion('b', 'jsonPath');

  it('add appends a new assertion', () => {
    expect(assertionsReducer([a], { type: 'add', assertion: b })).toEqual([a, b]);
  });

  it(`add is ignored once ${MAX_ASSERTIONS} assertions exist`, () => {
    const full = Array.from({ length: MAX_ASSERTIONS }, (_, i) => newAssertion(`id${i}`));

    expect(assertionsReducer(full, { type: 'add', assertion: a })).toBe(full);
  });

  it('update changes only the targeted assertion', () => {
    const next = assertionsReducer([a, b], {
      type: 'update',
      id: 'b',
      patch: { target: 'data.total', operator: 'equals', expected: '2' },
    });

    expect(next[0]).toBe(a);
    expect(next[1]).toMatchObject({ target: 'data.total', operator: 'equals', expected: '2' });
  });

  it('update ignores an operator that does not belong to the kind', () => {
    const next = assertionsReducer([a], { type: 'update', id: 'a', patch: { operator: 'isNull' } });

    expect(next[0]?.operator).toBe('equals');
    expect(assertionSchema.safeParse(next[0]).success).toBe(true);
  });

  it('changeKind resets operator, target and expected to the new kind defaults', () => {
    const edited: Assertion = {
      ...b,
      target: 'x.y',
      operator: 'equals',
      expected: '5',
      enabled: false,
    };
    const [next] = assertionsReducer([edited], { type: 'changeKind', id: 'b', kind: 'status' });

    expect(next).toEqual({ ...newAssertion('b', 'status'), enabled: false });
  });

  it('changeKind to the same kind keeps the assertion', () => {
    const list = [b];

    expect(assertionsReducer(list, { type: 'changeKind', id: 'b', kind: 'jsonPath' })[0]).toBe(b);
  });

  it('remove deletes only the targeted assertion', () => {
    expect(assertionsReducer([a, b], { type: 'remove', id: 'a' })).toEqual([b]);
  });

  it('never mutates the previous state', () => {
    const state = [a, b];
    const snapshot = structuredClone(state);

    assertionsReducer(state, { type: 'update', id: 'a', patch: { expected: '500' } });
    assertionsReducer(state, { type: 'changeKind', id: 'b', kind: 'body' });
    assertionsReducer(state, { type: 'remove', id: 'a' });

    expect(state).toEqual(snapshot);
  });
});
