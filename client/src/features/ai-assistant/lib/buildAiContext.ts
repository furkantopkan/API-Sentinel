import {
  AI_MAX_BODY_CHARS,
  buildFinalUrl,
  type AiRequestContext,
  type AiResponseContext,
  type ExecuteRequest,
  type ExecutedResponse,
} from '@api-sentinel/shared';

/**
 * Turns what the user sent and received into the compact context the AI
 * endpoints accept. Secrets are masked again on the server before anything
 * leaves for the AI provider; here we only avoid sending what is not needed
 * (the Auth tab's token/password are never included, only the auth type).
 */
export function toAiRequestContext(request: ExecuteRequest): AiRequestContext {
  const finalUrl = buildFinalUrl(request.url, request.queryParams);
  return {
    method: request.method,
    url: finalUrl.ok ? finalUrl.url : request.url,
    headers: request.headers
      .filter((row) => row.enabled && row.key.trim() !== '')
      .map((row) => [row.key.trim(), row.value]),
    authType: request.auth.type,
    body: request.body.slice(0, AI_MAX_BODY_CHARS),
  };
}

export function toAiResponseContext(response: ExecutedResponse): AiResponseContext {
  const text =
    response.body.kind === 'json' || response.body.kind === 'text' ? response.body.text : '';
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers.slice(0, 200),
    bodyKind: response.body.kind,
    body: text.slice(0, AI_MAX_BODY_CHARS),
    bodyTruncated: text.length > AI_MAX_BODY_CHARS,
    durationMs: response.durationMs,
  };
}
