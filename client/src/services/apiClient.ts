import {
  aiStatusResponseSchema,
  analysisResponseSchema,
  apiErrorResponseSchema,
  executeResultSchema,
  healthResponseSchema,
  testCasesResponseSchema,
  collectionListResponseSchema,
  collectionResponseSchema,
  deletedResponseSchema,
  savedRequestResponseSchema,
  type AiStatus,
  type CollectionListResponse,
  type CollectionResponse,
  environmentListResponseSchema,
  environmentResponseSchema,
  type DeletedResponse,
  type EnvironmentInput,
  type EnvironmentListResponse,
  type EnvironmentResponse,
  type ExecuteWithEnvironment,
  type SavedRequestInput,
  type SavedRequestResponse,
  type AnalysisResponse,
  type AnalyzeResponseRequest,
  type ApiErrorResponse,
  type ExecuteResult,
  type GenerateTestCasesRequest,
  type HealthResponse,
  type TestCasesResponse,
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
  request: ExecuteWithEnvironment,
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

/**
 * Shared POST helper for endpoints that answer with `{ ok: true, ... }` or the
 * standard error shape. Same rules as executeRequest: validated, and
 * ApiClientError only when the backend is unreachable or off-contract.
 */
/** The part of a Zod schema we need (the client has no direct zod dependency). */
interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

async function sendJson<T extends { ok: true }>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  successSchema: Schema<T>,
  signal?: AbortSignal,
): Promise<T | ApiErrorResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiClientError('Could not reach the API Sentinel backend.');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiClientError(
      `The API Sentinel backend is not reachable (HTTP ${response.status}). Is the server running?`,
    );
  }

  const success = successSchema.safeParse(json);
  if (success.success) return success.data;
  const failure = apiErrorResponseSchema.safeParse(json);
  if (failure.success) return failure.data;
  throw new ApiClientError('The backend answered in an unexpected format.');
}

export async function fetchAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  let json: unknown;
  try {
    const response = await fetch(`${API_BASE_URL}/ai/status`, { signal });
    json = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiClientError('Could not reach the API Sentinel backend.');
  }
  const result = aiStatusResponseSchema.safeParse(json);
  if (!result.success) throw new ApiClientError('The backend answered in an unexpected format.');
  return result.data.status;
}

export function generateTestCases(
  input: GenerateTestCasesRequest,
  signal?: AbortSignal,
): Promise<TestCasesResponse | ApiErrorResponse> {
  return sendJson('POST', '/ai/test-cases', input, testCasesResponseSchema, signal);
}

export function analyzeResponse(
  input: AnalyzeResponseRequest,
  signal?: AbortSignal,
): Promise<AnalysisResponse | ApiErrorResponse> {
  return sendJson('POST', '/ai/analyze', input, analysisResponseSchema, signal);
}

// --- Collections (Phase 6.1) ---------------------------------------------

type Result<T> = Promise<T | ApiErrorResponse>;

export const collectionsApi = {
  list: (signal?: AbortSignal): Result<CollectionListResponse> =>
    sendJson('GET', '/collections', undefined, collectionListResponseSchema, signal),
  create: (name: string): Result<CollectionResponse> =>
    sendJson('POST', '/collections', { name }, collectionResponseSchema),
  rename: (id: string, name: string): Result<CollectionResponse> =>
    sendJson('PATCH', `/collections/${encodeURIComponent(id)}`, { name }, collectionResponseSchema),
  remove: (id: string): Result<DeletedResponse> =>
    sendJson('DELETE', `/collections/${encodeURIComponent(id)}`, undefined, deletedResponseSchema),
  getRequest: (id: string): Result<SavedRequestResponse> =>
    sendJson(
      'GET',
      `/saved-requests/${encodeURIComponent(id)}`,
      undefined,
      savedRequestResponseSchema,
    ),
  createRequest: (input: SavedRequestInput): Result<SavedRequestResponse> =>
    sendJson('POST', '/saved-requests', input, savedRequestResponseSchema),
  updateRequest: (id: string, input: SavedRequestInput): Result<SavedRequestResponse> =>
    sendJson('PUT', `/saved-requests/${encodeURIComponent(id)}`, input, savedRequestResponseSchema),
  renameRequest: (id: string, name: string): Result<SavedRequestResponse> =>
    sendJson(
      'PATCH',
      `/saved-requests/${encodeURIComponent(id)}`,
      { name },
      savedRequestResponseSchema,
    ),
  removeRequest: (id: string): Result<DeletedResponse> =>
    sendJson(
      'DELETE',
      `/saved-requests/${encodeURIComponent(id)}`,
      undefined,
      deletedResponseSchema,
    ),
};

// --- Environments (Phase 6.2) --------------------------------------------

export const environmentsApi = {
  list: (signal?: AbortSignal): Result<EnvironmentListResponse> =>
    sendJson('GET', '/environments', undefined, environmentListResponseSchema, signal),
  create: (input: EnvironmentInput): Result<EnvironmentResponse> =>
    sendJson('POST', '/environments', input, environmentResponseSchema),
  update: (id: string, input: EnvironmentInput): Result<EnvironmentResponse> =>
    sendJson('PUT', `/environments/${encodeURIComponent(id)}`, input, environmentResponseSchema),
  remove: (id: string): Result<DeletedResponse> =>
    sendJson('DELETE', `/environments/${encodeURIComponent(id)}`, undefined, deletedResponseSchema),
};
