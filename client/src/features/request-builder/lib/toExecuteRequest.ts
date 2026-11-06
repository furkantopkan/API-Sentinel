import type { ExecuteRequest } from '@api-sentinel/shared';
import type { KeyValueRow, RequestDraft } from '../types';

function stripId({ key, value, enabled }: KeyValueRow) {
  return { key, value, enabled };
}

/**
 * Converts the UI draft into the wire format of POST /api/requests/execute.
 * UI-only data (row ids) is removed. The URL is sent as typed; the server
 * builds the final URL with the same shared `buildFinalUrl` function.
 */
export function toExecuteRequest(draft: RequestDraft): ExecuteRequest {
  return {
    method: draft.method,
    url: draft.url,
    queryParams: draft.queryParams.map(stripId),
    headers: draft.headers.map(stripId),
    auth: draft.auth,
    body: draft.body,
    options: { ...draft.options },
  };
}
