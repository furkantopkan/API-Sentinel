import {
  executeResultSchema,
  healthResponseSchema,
  type ExecuteRequest,
  type ExecuteResult,
  type HealthResponse,
} from '@api-sentinel/shared';

/**
 * The ONLY place in the client that talks to our backend.
 * Components and hooks call these functions instead of using fetch directly,
 * so URLs, error handling and response validation live in one place.
 */

const API_BASE_URL = '/api';

/** Health checks should be quick; a hanging backend counts as offline. */
const HEALTH_TIMEOUT_MS = 5000;

export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const timeoutSignal = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
  const response = await fetch(`${API_BASE_URL}/health`, {
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  });

  if (!response.ok) {
    throw new ApiClientError(`Health check failed with HTTP ${response.status}`);
  }

  // Never trust the shape of data coming over the network: validate it
  // with the same schema the server uses to build the response.
  const json: unknown = await response.json();
  return healthResponseSchema.parse(json);
}

/**
 * Asks our backend to send the request to the target API.
 *
 * Resolves with `{ ok: true, response }` or `{ ok: false, error }` — both are
 * normal results (a 404 from the target is a successful execution!).
 * Throws ApiClientError only when our backend itself cannot be reached or
 * answers with something that is not part of the contract.
 */
export async function executeRequest(
  request: ExecuteRequest,
  signal?: AbortSignal,
): Promise<ExecuteResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/requests/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled by the user: let the caller decide
    throw new ApiClientError('Could not reach the API Sentinel backend.');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    // e.g. the Vite proxy answers 502 with an empty body when the backend is down
    throw new ApiClientError(
      `The API Sentinel backend is not reachable (HTTP ${response.status}). Is the server running?`,
    );
  }

  const result = executeResultSchema.safeParse(json);
  if (!result.success) {
    throw new ApiClientError('The backend answered in an unexpected format.');
  }
  return result.data;
}
