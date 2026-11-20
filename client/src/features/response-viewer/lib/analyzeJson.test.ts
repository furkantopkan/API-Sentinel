import { describe, expect, it } from 'vitest';
import { analyzeJson, formatJsonSummary } from './analyzeJson';

describe('analyzeJson', () => {
  it('AN-02: counts every value, the depth and the types', () => {
    const summary = analyzeJson({ a: [1, 'x', null], b: { c: true } });

    expect(summary).toEqual({
      totalValues: 7, // root, a, 1, 'x', null, b, true
      maxDepth: 2,
      typeCounts: { object: 2, array: 1, string: 1, number: 1, boolean: 1, null: 1 },
      unsafeIntegers: 0,
    });
  });

  it('treats a primitive root as one value at depth 0', () => {
    expect(analyzeJson('text')).toMatchObject({ totalValues: 1, maxDepth: 0 });
  });

  it('counts integers beyond 2^53', () => {
    expect(analyzeJson([2 ** 53, 2 ** 53 - 1, 1e20]).unsafeIntegers).toBe(2);
  });

  it('handles very deep documents without a stack overflow', () => {
    let deep: unknown = 0;
    for (let i = 0; i < 100_000; i++) deep = [deep];

    expect(analyzeJson(deep).maxDepth).toBe(100_000);
  });
});

describe('formatJsonSummary', () => {
  it('uses singular and plural forms and leaves out types with zero', () => {
    expect(formatJsonSummary(analyzeJson({ a: null, b: [1, 2] }))).toBe(
      '5 values · depth 2 · 1 object, 1 array, 2 numbers, 1 null',
    );
  });

  it('groups thousands', () => {
    const summary = analyzeJson(Array.from({ length: 1500 }, () => true));

    expect(formatJsonSummary(summary)).toBe('1,501 values · depth 1 · 1 array, 1,500 booleans');
  });
});
