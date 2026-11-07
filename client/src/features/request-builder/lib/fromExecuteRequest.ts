import type { ExecuteRequest } from '@api-sentinel/shared';
import { DEFAULT_TIMEOUT_MS } from '../state/requestDraftReducer';
import type { RequestDraft } from '../types';

/**
 * The inverse of toExecuteRequest: turns a stored request back into an
 * editable draft. Rows get fresh UI ids (they are never stored).
 * `newId` is a parameter so the function stays pure and testable.
 */
export function fromExecuteRequest(request: ExecuteRequest, newId: () => string): RequestDraft {
  const withIds = (rows: ExecuteRequest['headers']) => rows.map((row) => ({ id: newId(), ...row }));
  return {
    method: request.method,
    url: request.url,
    queryParams: withIds(request.queryParams),
    headers: withIds(request.headers),
    auth: request.auth,
    body: request.body,
    options: {
      timeoutMs: request.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      followRedirects: request.options.followRedirects,
    },
  };
}
