/** Helpers for comparing and describing JSON values. All pure functions. */

export type JsonTypeName = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export const JSON_TYPE_NAMES: readonly JsonTypeName[] = [
  'object',
  'array',
  'string',
  'number',
  'boolean',
  'null',
];

export function jsonTypeName(value: unknown): JsonTypeName {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'object';
}

/**
 * Structural equality for parsed JSON: same type, same values, same keys
 * (key order does not matter, array order does). `1` and `"1"` are NOT equal.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const typeA = jsonTypeName(a);
  if (typeA !== jsonTypeName(b)) return false;

  if (typeA === 'array') {
    const left = a as unknown[];
    const right = b as unknown[];
    return left.length === right.length && left.every((item, i) => deepEqual(item, right[i]));
  }
  if (typeA === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && deepEqual(left[key], right[key]))
    );
  }
  return false; // different primitives (=== already covered equal ones)
}

/**
 * Reads the expected value the user typed:
 *   `42` → 42, `true` → true, `null` → null, `"42"` → "42", `[1,2]` → [1,2]
 *   anything that is not valid JSON → the text itself (`Ada` → "Ada")
 * So `Ada` and `"Ada"` mean the same, but `42` (number) differs from `"42"` (string).
 */
export function interpretExpected(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}

/** Parses a number typed by the user; undefined if it is not a finite number. */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

const MAX_DESCRIPTION = 200;

/** `"Ada" (string)`, `42 (number)`, `{2 keys} (object)` — for result messages. */
export function describeValue(value: unknown): string {
  const type = jsonTypeName(value);
  let text: string;
  if (type === 'object') {
    const n = Object.keys(value as object).length;
    text = n <= 3 ? JSON.stringify(value) : `{${n} keys}`;
  } else if (type === 'array') {
    const n = (value as unknown[]).length;
    text = n <= 5 ? JSON.stringify(value) : `[${n} items]`;
  } else {
    text = JSON.stringify(value);
  }
  if (text.length > MAX_DESCRIPTION) text = `${text.slice(0, MAX_DESCRIPTION - 1)}…`;
  return `${text} (${type})`;
}

export function isUnsafeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value);
}
