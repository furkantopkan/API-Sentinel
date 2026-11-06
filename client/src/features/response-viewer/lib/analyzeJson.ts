import { childEntries, isUnsafeInteger, jsonTypeOf, type JsonType } from './jsonTypes';

export interface JsonSummary {
  /** Every value in the document, including the root. */
  totalValues: number;
  /** Root alone = 0, `{"a":1}` = 1. */
  maxDepth: number;
  typeCounts: Record<JsonType, number>;
  /** Paths are not stored, only how many integers lost precision when parsed. */
  unsafeIntegers: number;
}

/**
 * Walks the whole document once and counts what is inside.
 * Uses an explicit stack instead of recursion, so very deep documents cannot
 * overflow the call stack.
 */
export function analyzeJson(root: unknown): JsonSummary {
  const typeCounts: Record<JsonType, number> = {
    object: 0,
    array: 0,
    string: 0,
    number: 0,
    boolean: 0,
    null: 0,
  };
  let totalValues = 0;
  let maxDepth = 0;
  let unsafeIntegers = 0;

  const stack: [unknown, number][] = [[root, 0]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop()!;
    totalValues++;
    typeCounts[jsonTypeOf(value)]++;
    if (depth > maxDepth) maxDepth = depth;
    if (isUnsafeInteger(value)) unsafeIntegers++;
    for (const [, child] of childEntries(value)) stack.push([child, depth + 1]);
  }

  return { totalValues, maxDepth, typeCounts, unsafeIntegers };
}

const TYPE_NAMES: [JsonType, string, string][] = [
  ['object', 'object', 'objects'],
  ['array', 'array', 'arrays'],
  ['string', 'string', 'strings'],
  ['number', 'number', 'numbers'],
  ['boolean', 'boolean', 'booleans'],
  ['null', 'null', 'nulls'],
];

/** "24 values · depth 5 · 6 objects, 3 arrays, 1 null" (types with 0 are left out). */
export function formatJsonSummary(summary: JsonSummary): string {
  const plural = (n: number, one: string, many: string) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
  const types = TYPE_NAMES.filter(([type]) => summary.typeCounts[type] > 0)
    .map(([type, one, many]) => plural(summary.typeCounts[type], one, many))
    .join(', ');
  return `${plural(summary.totalValues, 'value', 'values')} · depth ${summary.maxDepth} · ${types}`;
}
