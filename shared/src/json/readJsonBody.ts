import type { ExecutedResponse } from '../schemas/execute';

export type JsonBody = { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * The body as JSON for JSON paths and captures. Some servers send JSON with a
 * wrong label (text/html is common on older sites), so a text body that is a
 * JSON object or array is read too. The response viewer still shows the label.
 */
export function readJsonBody(response: ExecutedResponse): JsonBody {
  const { body } = response;
  const readable = body.kind === 'json' || (body.kind === 'text' && /^\s*[[{]/.test(body.text));
  if (!readable) {
    return { ok: false, reason: `The body is not JSON (${body.kind}).` };
  }
  try {
    return { ok: true, value: JSON.parse(body.text) as unknown };
  } catch {
    return { ok: false, reason: 'The body is not valid JSON.' };
  }
}
