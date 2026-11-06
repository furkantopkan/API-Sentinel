import { describe, expect, it } from 'vitest';
import { childEntries, isUnsafeInteger, jsonTypeOf, previewValue } from './jsonTypes';

describe('jsonTypeOf', () => {
  it.each([
    [{}, 'object'],
    [[], 'array'],
    ['', 'string'],
    [0, 'number'],
    [false, 'boolean'],
    [null, 'null'],
  ])('%j is %s', (value, type) => {
    expect(jsonTypeOf(value)).toBe(type);
  });
});

describe('childEntries', () => {
  it('returns index/value pairs for arrays', () => {
    expect(childEntries(['a', 'b'])).toEqual([
      [0, 'a'],
      [1, 'b'],
    ]);
  });

  it('returns key/value pairs for objects in insertion order', () => {
    expect(childEntries({ b: 1, a: 2 })).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it.each(['x', 1, true, null])('returns no children for %j', (value) => {
    expect(childEntries(value)).toEqual([]);
  });
});

describe('isUnsafeInteger', () => {
  it.each([
    [Number.MAX_SAFE_INTEGER, false], // 2^53 - 1: still exact
    [Number.MAX_SAFE_INTEGER + 1, true], // 2^53: first value that may be inexact
    [-Number.MAX_SAFE_INTEGER - 1, true],
    // Built from text: as a literal, ESLint (no-loss-of-precision) rightly rejects it.
    [Number('12345678901234567890'), true],
    [1.5, false],
    [1e300, true],
    ['12345678901234567890', false], // a string keeps every digit
  ])('%j → %s', (value, expected) => {
    expect(isUnsafeInteger(value)).toBe(expected);
  });
});

describe('previewValue', () => {
  it.each([
    [{ a: 1, b: 2 }, '{2 keys}'],
    [{ a: 1 }, '{1 key}'],
    [[1, 2, 3], '[3 items]'],
    [[1], '[1 item]'],
    ['hi', '"hi"'],
    [42, '42'],
    [true, 'true'],
    [null, 'null'],
  ])('%j → %s', (value, preview) => {
    expect(previewValue(value)).toBe(preview);
  });

  it('truncates long strings with an ellipsis', () => {
    const preview = previewValue('x'.repeat(100), 10);

    expect(preview).toHaveLength(10);
    expect(preview.endsWith('…')).toBe(true);
  });
});
