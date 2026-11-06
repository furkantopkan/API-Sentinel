import { useEffect, useState } from 'react';
import { fetchHealth } from '../services/apiClient';

export type BackendHealth =
  { state: 'checking' } | { state: 'online'; version: string } | { state: 'offline' };

const DEFAULT_INTERVAL_MS = 15_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Checks the backend once on mount and then every `intervalMs`.
 * Any failure (network error, timeout, bad status, invalid body) means "offline":
 * for a status indicator that is the correct outcome, not a swallowed error.
 */
export function useBackendHealth(intervalMs: number = DEFAULT_INTERVAL_MS): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>({ state: 'checking' });

  useEffect(() => {
    let controller: AbortController | undefined;

    const check = async (): Promise<void> => {
      controller?.abort(); // cancel a previous check that is still running
      controller = new AbortController();
      try {
        const data = await fetchHealth(controller.signal);
        setHealth({ state: 'online', version: data.version });
      } catch (error) {
        // Aborted by us (unmount or newer check): not a backend failure.
        if (isAbortError(error)) return;
        setHealth({ state: 'offline' });
      }
    };

    void check();
    const intervalId = window.setInterval(() => void check(), intervalMs);

    // Cleanup runs on unmount: stop the timer and cancel any request in flight.
    return () => {
      window.clearInterval(intervalId);
      controller?.abort();
    };
  }, [intervalMs]);

  return health;
}
