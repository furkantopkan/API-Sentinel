import { describe, expect, it } from 'vitest';
import { assertionListSchema, assertionSchema, MAX_ASSERTIONS } from './schema';
import { deepEqual, describeValue, interpretExpected, parseNumber } from './values';

describe('interpretExpected', () => {
  it.each([
    ['42', 42],
    ['  42  ', 42],
    ['"42"', '42'],
    ['true', true],
    ['null', null],
    ['[1,"a"]', [1, 'a']],
    ['{"a":1}', { a: 1 }],
    ['Ada', 'Ada'], // not JSON → the text itself
    ['Ada Lovelace', 'Ada Lovelace'],
    ['{broken', '{broken'],
    ['', ''],
  ])('%j → %j', (text, value) => {
    expect(interpretExpected(text)).toEqual(value);
  });
});

describe('deepEqual', () => {
  it.each([
    [1, 1, true],
    [1, '1', false],
    [null, null, true],
    [null, {}, false],
    [[], {}, false],
    [[1, [2]], [1, [2]], true],
    [[1, 2], [2, 1], false],
    [{ a: 1, b: 2 }, { b: 2, a: 1 }, true], // key order does not matter
    [{ a: 1 }, { a: 1, b: undefined }, false],
    [{ a: { b: [1] } }, { a: { b: [1] } }, true],
    [{ a: 1 }, { b: 1 }, false],
  ])('%j vs %j → %s', (a, b, equal) => {
    expect(deepEqual(a, b)).toBe(equal);
  });
});

describe('parseNumber', () => {
  it.each([
    ['10', 10],
    [' 4.5 ', 4.5],
    ['-3', -3],
    ['1e3', 1000],
    ['', undefined],
    ['abc', undefined],
    ['Infinity', undefined],
    ['10ms', undefined],
  ])('%j → %j', (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });
});

describe('describeValue', () => {
  it.each([
    ['Ada', '"Ada" (string)'],
    [2, '2 (number)'],
    [null, 'null (null)'],
    [[1, 2], '[1,2] (array)'],
    [[1, 2, 3, 4, 5, 6], '[6 items] (array)'],
    [{ a: 1, b: 2, c: 3, d: 4 }, '{4 keys} (object)'],
  ])('%j → %s', (value, text) => {
    expect(describeValue(value)).toBe(text);
  });

  it('truncates very long values', () => {
    expect(describeValue('x'.repeat(500)).length).toBeLessThan(220);
  });
});

describe('assertionSchema', () => {
  const valid = {
    id: 'a1',
    enabled: true,
    kind: 'jsonPath',
    target: 'data.id',
    operator: 'equals',
    expected: '1',
  };

  it('accepts a valid assertion', () => {
    expect(assertionSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    [{ ...valid, kind: 'status', operator: 'isNull' }, 'operator of another kind'],
    [{ ...valid, kind: 'status', target: 'x' }, 'target on a kind without target'],
    [{ ...valid, kind: 'sql' }, 'unknown kind'],
    [{ ...valid, id: '' }, 'empty id'],
    [{ ...valid, expected: 'x'.repeat(10_001) }, 'expected too long'],
  ])('rejects %j (%s)', (input) => {
    expect(assertionSchema.safeParse(input).success).toBe(false);
  });

  it(`limits a list to ${MAX_ASSERTIONS} assertions`, () => {
    const list = Array.from({ length: MAX_ASSERTIONS + 1 }, (_, i) => ({ ...valid, id: `a${i}` }));

    expect(assertionListSchema.safeParse(list).success).toBe(false);
    expect(assertionListSchema.safeParse(list.slice(1)).success).toBe(true);
  });
});
