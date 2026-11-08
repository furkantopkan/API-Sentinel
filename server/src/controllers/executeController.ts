import {
  createSecretMasker,
  executeWithEnvironmentSchema,
  resolveRequest,
  type ExecuteRequest,
  type ExecutedResponse,
  type VariableLookup,
} from '@api-sentinel/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import type { EnvironmentService } from '../services/environmentService';
import type { RequestEngine } from '../services/request-engine/requestEngine';
import { parseBody } from '../validators/parseBody';

const NO_VARIABLES: VariableLookup = () => undefined;

/** Replaces `{{variables}}`; an unresolved one stops the request before it is sent. */
function resolveOrThrow(
  request: ExecuteRequest,
  lookup: VariableLookup,
  hasEnvironment: boolean,
): ExecuteRequest {
  const { request: resolved, unknown } = resolveRequest(request, lookup);
  if (unknown.length > 0) {
    const names = unknown.map((name) => `{{${name}}}`).join(', ');
    throw new AppError(
      'UNKNOWN_VARIABLE',
      hasEnvironment
        ? `Not defined in the selected environment: ${names}.`
        : `Select an environment to use variables: ${names}.`,
      400,
      { variables: unknown },
    );
  }
  return resolved;
}

/** The target may echo a secret back (URL, headers, body); the UI must not show it. */
function maskResponse(
  response: ExecutedResponse,
  mask: (text: string) => string,
): ExecutedResponse {
  const { body } = response;
  return {
    ...response,
    finalUrl: mask(response.finalUrl),
    redirects: response.redirects.map((r) => ({ ...r, location: mask(r.location) })),
    headers: response.headers.map(([name, value]) => [name, mask(value)]),
    body: body.kind === 'json' || body.kind === 'text' ? { ...body, text: mask(body.text) } : body,
  };
}

/**
 * `POST /api/requests/execute`
 * Thin HTTP layer: validate input, resolve variables, call the engine, send
 * the result. Errors are thrown and handled by the central errorHandler.
 */
export function createExecuteController(
  engine: RequestEngine,
  environments: EnvironmentService,
): RequestHandler {
  return async (req, res) => {
    const { environmentId, ...request } = parseBody(executeWithEnvironmentSchema, req.body);

    const { lookup, secrets } = environmentId
      ? environments.resolver(environmentId)
      : { lookup: NO_VARIABLES, secrets: [] };
    const mask = createSecretMasker(secrets);
    const resolved = resolveOrThrow(request, lookup, environmentId !== undefined);

    // If our client goes away (tab closed, Cancel pressed), stop the outbound request too.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    try {
      const response = await engine.execute(resolved, abort.signal, mask);
      res.json({ ok: true, response: maskResponse(response, mask) });
    } catch (error) {
      if (abort.signal.aborted) return; // nobody is listening any more
      // Error messages can mention the host or a header name, which may hold a secret.
      if (error instanceof AppError) {
        throw new AppError(error.code, mask(error.message), error.httpStatus, error.details);
      }
      throw error;
    }
  };
}
