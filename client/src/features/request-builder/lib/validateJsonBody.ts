export type JsonBodyValidation =
  { ok: true; empty: boolean } | { ok: false; message: string; line?: number; column?: number };

/** Converts a 0-based character offset into 1-based line and column numbers. */
function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  const lastLine = lines.at(-1) ?? '';
  return { line: lines.length, column: lastLine.length + 1 };
}

/**
 * Extracts the error location from a JSON.parse error message.
 * Browsers word it differently:
 *   Chrome/Edge: "... at position 7 (line 1 column 8)"
 *   Firefox:     "... at line 1 column 8 of the JSON data"
 */
function findErrorLocation(
  text: string,
  message: string,
): { line: number; column: number } | undefined {
  const lineColumn = /line (\d+) column (\d+)/i.exec(message);
  if (lineColumn?.[1] && lineColumn[2]) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  }
  const position = /position (\d+)/i.exec(message);
  if (position?.[1]) {
    return offsetToLineColumn(text, Number(position[1]));
  }
  return undefined;
}

/**
 * Checks whether the request body is valid JSON.
 * An empty (or whitespace-only) body is valid: it simply means "no body".
 */
export function validateJsonBody(text: string): JsonBodyValidation {
  if (text.trim() === '') {
    return { ok: true, empty: true };
  }

  try {
    JSON.parse(text);
    return { ok: true, empty: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    const location = findErrorLocation(text, message);
    return location ? { ok: false, message, ...location } : { ok: false, message };
  }
}

/** Pretty-prints valid JSON with 2-space indentation; returns null if invalid. */
export function formatJsonBody(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}
