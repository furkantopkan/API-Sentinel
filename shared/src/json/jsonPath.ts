/**
 * Simple JSON path notation (decision B-10): `data.items[0].id`
 *
 * - object keys that look like identifiers: `.name`   (no dot at the start)
 * - array indexes:                          `[0]`
 * - any other key (spaces, dashes, dots…):  `["first name"]` (a JSON string)
 * - the root value itself:                  `` (empty path)
 *
 * The client copies paths in this format (Phase 3); the assertion engine
 * resolves them (Phase 4). Parsing never executes anything: it is a small
 * hand-written tokenizer, and quoted keys are decoded with JSON.parse.
 */

export type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** ["data", "items", 0, "id"] → "data.items[0].id" */
export function formatJsonPath(segments: readonly PathSegment[]): string {
  let path = '';
  for (const segment of segments) {
    if (typeof segment === 'number') {
      path += `[${segment}]`;
    } else if (IDENTIFIER.test(segment)) {
      path += path === '' ? segment : `.${segment}`;
    } else {
      path += `[${JSON.stringify(segment)}]`;
    }
  }
  return path;
}

export type ParsePathResult =
  { ok: true; segments: PathSegment[] } | { ok: false; error: string; position: number };

/** "data.items[0].id" → ["data", "items", 0, "id"]; the inverse of formatJsonPath. */
export function parseJsonPath(path: string): ParsePathResult {
  const segments: PathSegment[] = [];
  let i = 0;
  const fail = (error: string): ParsePathResult => ({ ok: false, error, position: i });

  const readIdentifier = (): string | null => {
    const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(path.slice(i));
    if (!match) return null;
    i += match[0].length;
    return match[0];
  };

  // An identifier may start the path without a leading dot.
  if (path !== '' && path[0] !== '[') {
    const first = readIdentifier();
    if (first === null) return fail('Expected a property name.');
    segments.push(first);
  }

  while (i < path.length) {
    const char = path[i];
    if (char === '.') {
      i++;
      const key = readIdentifier();
      if (key === null) return fail('Expected a property name after ".".');
      segments.push(key);
    } else if (char === '[') {
      i++;
      if (path[i] === '"') {
        // Find the closing quote, skipping escaped characters.
        let end = i + 1;
        while (end < path.length && path[end] !== '"') end += path[end] === '\\' ? 2 : 1;
        if (end >= path.length) return fail('Unterminated quoted key.');
        let key: unknown;
        try {
          key = JSON.parse(path.slice(i, end + 1));
        } catch {
          return fail('Invalid quoted key.');
        }
        segments.push(key as string);
        i = end + 1;
      } else {
        const match = /^(0|[1-9]\d*)/.exec(path.slice(i));
        if (!match) return fail('Expected an array index or a quoted key.');
        segments.push(Number(match[0]));
        i += match[0].length;
      }
      if (path[i] !== ']') return fail('Expected "]".');
      i++;
    } else {
      return fail(`Unexpected character "${char}".`);
    }
  }
  return { ok: true, segments };
}

export type ResolveResult = { found: true; value: unknown } | { found: false };

/**
 * Walks `segments` into a parsed JSON value. Only own properties are read, so
 * paths like `__proto__` or `constructor` never reach the prototype chain.
 */
export function resolveJsonPath(root: unknown, segments: readonly PathSegment[]): ResolveResult {
  let current: unknown = root;
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) return { found: false };
      current = current[segment];
    } else {
      if (
        typeof current !== 'object' ||
        current === null ||
        Array.isArray(current) ||
        !Object.hasOwn(current, segment)
      ) {
        return { found: false };
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return { found: true, value: current };
}
