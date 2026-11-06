import type { ResponseBody } from '@api-sentinel/shared';
import { isUnsafeInteger } from './jsonTypes';

/**
 * Parses a JSON body once. `exact` is false when re-serialising would change
 * the document, i.e. it contains integers beyond ±2^53 that JS cannot store.
 */
export function parseJsonBody(text: string): { value: unknown; exact: boolean } | null {
  let exact = true;
  try {
    const value: unknown = JSON.parse(text, (_key, v: unknown) => {
      if (isUnsafeInteger(v)) exact = false;
      return v;
    });
    return { value, exact };
  } catch {
    return null;
  }
}

/**
 * The text shown (and copied) for a response body, or null when there is none.
 * JSON is re-indented with 2 spaces for readability (AC-06) — unless that would
 * silently change big numbers; then the original text is kept as received.
 */
export function bodyText(body: ResponseBody): string | null {
  switch (body.kind) {
    case 'json': {
      const parsed = parseJsonBody(body.text);
      if (parsed === null || !parsed.exact) return body.text;
      return JSON.stringify(parsed.value, null, 2);
    }
    case 'text':
      return body.text;
    case 'empty':
    case 'binary':
      return null;
  }
}
