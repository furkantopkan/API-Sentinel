import { healthResponseSchema, type HealthResponse } from '@api-sentinel/shared';

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
