import {
  FORM_CONTENT_TYPE,
  buildFinalUrl,
  isFormBody,
  type ExecuteRequest,
  type ExecutedResponse,
} from '@api-sentinel/shared';
import type { RequestEngineConfig } from '../../config/env';
import { AppError } from '../../errors/AppError';
import { mapRequestError } from './errorMapper';
import { buildOutgoingHeaders } from './headerPolicy';
import { executeHttp } from './httpExecutor';
import { normalizeResponse } from './responseNormalizer';
import { createDispatchers, selectDispatcher } from './safeDispatcher';

export type EngineLogger = (line: string) => void;

export interface RequestEngine {
  /** `mask` hides secret values in log lines (the host could contain one). */
  execute(
    request: ExecuteRequest,
    signal?: AbortSignal,
    mask?: (text: string) => string,
  ): Promise<ExecutedResponse>;
  close(): Promise<void>;
}

const defaultLogger: EngineLogger = (line) => console.info(line);

/**
 * The request engine: turns a validated ExecuteRequest into a real HTTP call.
 *
 *   validate → build URL / headers / body → SSRF-checked send → normalize
 *
 * Express-independent: it can be unit/integration tested without HTTP routes.
 */
export function createRequestEngine(
  config: RequestEngineConfig,
  log: EngineLogger = defaultLogger,
): RequestEngine {
  const dispatchers = createDispatchers();

  async function execute(
    request: ExecuteRequest,
    signal?: AbortSignal,
    mask: (text: string) => string = (text) => text,
  ): Promise<ExecutedResponse> {
    const timeoutMs = request.options.timeoutMs ?? config.defaultTimeoutMs;
    if (timeoutMs > config.maxTimeoutMs) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Timeout must be at most ${config.maxTimeoutMs} ms.`,
        400,
        { maxTimeoutMs: config.maxTimeoutMs },
      );
    }

    const urlResult = buildFinalUrl(request.url, request.queryParams);
    if (!urlResult.ok) {
      throw new AppError('INVALID_URL', urlResult.error, 400);
    }
    const url = new URL(urlResult.url);

    // The client validates the body too; never rely on that alone.
    // A form body (declared by its Content-Type header) is sent as typed.
    const hasBody = request.body.trim() !== '';
    if (hasBody && !isFormBody(request.headers)) {
      try {
        JSON.parse(request.body);
      } catch {
        throw new AppError(
          'INVALID_JSON_BODY',
          `Request body is not valid JSON. For a form body, set the Content-Type header to ${FORM_CONTENT_TYPE}.`,
          400,
        );
      }
    }

    const headers = buildOutgoingHeaders(request.headers, request.auth, {
      hasBody,
      userAgent: config.userAgent,
    });

    // Log only method, host and outcome: never paths, query strings, headers or bodies.
    const logPrefix = mask(`[engine] ${request.method} ${url.host}`);
    try {
      const raw = await executeHttp(
        {
          method: request.method,
          url,
          headers,
          body: hasBody ? request.body : undefined,
          timeoutMs,
          followRedirects: request.options.followRedirects,
        },
        {
          dispatcherFor: (hopUrl) => selectDispatcher(hopUrl, config.allowlist, dispatchers),
          maxResponseBytes: config.maxResponseBytes,
          maxRedirects: config.maxRedirects,
          signal,
        },
      );
      const response = normalizeResponse(raw);
      log(`${logPrefix} -> ${response.status} (${response.durationMs} ms)`);
      return response;
    } catch (error) {
      if (signal?.aborted) {
        log(`${logPrefix} -> cancelled by client`);
        throw error;
      }
      const mapped = mapRequestError(error, url.host);
      log(`${logPrefix} -> ${mapped?.code ?? 'INTERNAL_ERROR'}`);
      throw mapped ?? error;
    }
  }

  async function close(): Promise<void> {
    await Promise.all([dispatchers.guarded.close(), dispatchers.trusted.close()]);
  }

  return { execute, close };
}
