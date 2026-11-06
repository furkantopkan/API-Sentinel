import type { RequestDraft } from '../types';
import { buildFinalUrl } from './buildFinalUrl';
import { validateJsonBody } from './validateJsonBody';

export interface DraftValidationError {
  field: 'url' | 'body';
  message: string;
}

export type DraftValidationResult =
  { ok: true; finalUrl: string } | { ok: false; errors: DraftValidationError[] };

/**
 * Runs all client-side checks before a request may be sent.
 * The server repeats these checks in Phase 2 (never trust the client alone).
 */
export function validateDraft(draft: RequestDraft): DraftValidationResult {
  const errors: DraftValidationError[] = [];

  const urlResult = buildFinalUrl(draft.url, draft.queryParams);
  if (!urlResult.ok) {
    errors.push({ field: 'url', message: urlResult.error });
  }

  const bodyResult = validateJsonBody(draft.body);
  if (!bodyResult.ok) {
    const where = bodyResult.line ? ` (line ${bodyResult.line}, column ${bodyResult.column})` : '';
    errors.push({ field: 'body', message: `Body is not valid JSON${where}.` });
  }

  if (errors.length > 0 || !urlResult.ok) {
    return { ok: false, errors };
  }
  return { ok: true, finalUrl: urlResult.url };
}
