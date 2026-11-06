import { buildFinalUrl } from '@api-sentinel/shared';
import type { RequestDraft } from '../types';
import { validateJsonBody } from './validateJsonBody';

/** Client-side bounds; the server enforces its own (configurable) maximum. */
export const MIN_TIMEOUT_MS = 100;
export const MAX_TIMEOUT_MS = 60_000;

export interface DraftValidationError {
  field: 'url' | 'body' | 'timeout';
  message: string;
}

export type DraftValidationResult =
  { ok: true; finalUrl: string } | { ok: false; errors: DraftValidationError[] };

/**
 * Runs all client-side checks before a request may be sent.
 * The server repeats these checks (never trust the client alone).
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

  const { timeoutMs } = draft.options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    errors.push({
      field: 'timeout',
      message: `Timeout must be a whole number between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms.`,
    });
  }

  if (errors.length > 0 || !urlResult.ok) {
    return { ok: false, errors };
  }
  return { ok: true, finalUrl: urlResult.url };
}
