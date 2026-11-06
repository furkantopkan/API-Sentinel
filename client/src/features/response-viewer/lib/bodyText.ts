import type { ResponseBody } from '@api-sentinel/shared';

/**
 * The text shown (and copied) for a response body, or null when there is none.
 * JSON is re-indented with 2 spaces for readability (AC-06).
 */
export function bodyText(body: ResponseBody): string | null {
  switch (body.kind) {
    case 'json':
      try {
        return JSON.stringify(JSON.parse(body.text), null, 2);
      } catch {
        return body.text;
      }
    case 'text':
      return body.text;
    case 'empty':
    case 'binary':
      return null;
  }
}
