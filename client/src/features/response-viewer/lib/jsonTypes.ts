/** The six JSON data types, as a QA engineer reads them in a response. */
export type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

/** typeof says "object" for arrays and null; this tells the six JSON types apart. */
export function jsonTypeOf(value: unknown): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'object';
  }
}

/** Child entries of a container as [key, value]; empty for primitives. */
export function childEntries(value: unknown): [string | number, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [index, item]);
  if (typeof value === 'object' && value !== null) return Object.entries(value);
  return [];
}

/**
 * JSON numbers are parsed into JS doubles: integers beyond ±2^53 lose digits
 * (12345678901234567890 → 12345678901234567000). Worth a warning in a test tool.
 */
export function isUnsafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value);
}

/** Short one-line preview: `{3 keys}`, `[5 items]`, `"text"`, `42`, `null`. */
export function previewValue(value: unknown, maxLength = 80): string {
  const type = jsonTypeOf(value);
  if (type === 'array') {
    const n = (value as unknown[]).length;
    return `[${n} item${n === 1 ? '' : 's'}]`;
  }
  if (type === 'object') {
    const n = Object.keys(value as object).length;
    return `{${n} key${n === 1 ? '' : 's'}}`;
  }
  const text = JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
