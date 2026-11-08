import {
  createSecretMasker,
  resolveRequest,
  type ExecuteRequest,
  type ExecutedResponse,
  type VariableLookup,
} from '@api-sentinel/shared';
import { AppError } from '../errors/AppError';
import type { EnvironmentService } from './environmentService';
import type { RequestEngine } from './request-engine/requestEngine';

export type Mask = (text: string) => string;

/** Variables and secret masking for one execution (a single send or a whole run). */
export interface ExecutionContext {
  lookup: VariableLookup;
  mask: Mask;
  hasEnvironment: boolean;
}

/** Replaces `{{variables}}`; an unresolved one stops the request before it is sent. */
function resolveOrThrow(request: ExecuteRequest, context: ExecutionContext): ExecuteRequest {
  const { request: resolved, unknown } = resolveRequest(request, context.lookup);
  if (unknown.length > 0) {
    const names = unknown.map((name) => `{{${name}}}`).join(', ');
    throw new AppError(
      'UNKNOWN_VARIABLE',
      context.hasEnvironment
        ? `Not defined in the selected environment: ${names}.`
        : `Select an environment to use variables: ${names}.`,
      400,
      { variables: unknown },
    );
  }
  return resolved;
}

/** The target may echo a secret back (URL, headers, body); it must not be shown or stored. */
function maskResponse(response: ExecutedResponse, mask: Mask): ExecutedResponse {
  const { body } = response;
  return {
    ...response,
    finalUrl: mask(response.finalUrl),
    redirects: response.redirects.map((r) => ({ ...r, location: mask(r.location) })),
    headers: response.headers.map(([name, value]) => [name, mask(value)]),
    body: body.kind === 'json' || body.kind === 'text' ? { ...body, text: mask(body.text) } : body,
  };
}

/** The one path every outgoing request takes: variables → engine → masking. */
export function createExecutionService(engine: RequestEngine, environments: EnvironmentService) {
  return {
    context(environmentId: string | undefined): ExecutionContext {
      if (environmentId === undefined) {
        return { lookup: () => undefined, mask: (text) => text, hasEnvironment: false };
      }
      const { lookup, secrets } = environments.resolver(environmentId);
      return { lookup, mask: createSecretMasker(secrets), hasEnvironment: true };
    },

    async execute(
      request: ExecuteRequest,
      context: ExecutionContext,
      signal?: AbortSignal,
    ): Promise<ExecutedResponse> {
      const resolved = resolveOrThrow(request, context);
      try {
        const response = await engine.execute(resolved, signal, context.mask);
        return maskResponse(response, context.mask);
      } catch (error) {
        // Error messages can mention the host or a header name, which may hold a secret.
        if (error instanceof AppError) {
          throw new AppError(
            error.code,
            context.mask(error.message),
            error.httpStatus,
            error.details,
          );
        }
        throw error;
      }
    },
  };
}

export type ExecutionService = ReturnType<typeof createExecutionService>;
