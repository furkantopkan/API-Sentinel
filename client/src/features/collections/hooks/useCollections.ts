import type { ApiErrorResponse, Collection, CollectionListResponse } from '@api-sentinel/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, collectionsApi } from '../../../services/apiClient';

export type CollectionsState =
  | { status: 'loading' }
  | { status: 'ready'; collections: Collection[] }
  | { status: 'error'; message: string };

/** Turns an API result into data or a user-facing error message. */
export async function unwrap<T extends { ok: true }>(
  call: Promise<T | ApiErrorResponse>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const result = await call;
    return result.ok ? { ok: true, data: result } : { ok: false, message: result.error.message };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApiClientError ? error.message : 'Unexpected client error.',
    };
  }
}

function toState(
  result: Awaited<ReturnType<typeof unwrap<CollectionListResponse>>>,
): CollectionsState {
  return result.ok
    ? { status: 'ready', collections: result.data.collections }
    : { status: 'error', message: result.message };
}

/**
 * The collection tree shown in the sidebar. After every change the list is
 * re-fetched from the server: simple, and the server stays the single
 * source of truth (no client-side copy that could drift).
 */
export function useCollections() {
  const [state, setState] = useState<CollectionsState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    setState(toState(await unwrap(collectionsApi.list())));
  }, []);

  // First load when the app starts.
  useEffect(() => {
    const controller = new AbortController();
    void unwrap(collectionsApi.list(controller.signal)).then((result) => {
      if (!controller.signal.aborted) setState(toState(result));
    });
    return () => controller.abort();
  }, []);

  return { state, refresh };
}
