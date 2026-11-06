import type { ApiErrorBody, ExecuteRequest, ExecutedResponse } from '@api-sentinel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, executeRequest } from '../services/apiClient';

/** Errors shown in the Response Viewer: backend error codes + one client-only code. */
export type SendError = ApiErrorBody | { code: 'BACKEND_UNREACHABLE'; message: string };

export type SendState =
  | { status: 'idle' }
  | { status: 'loading' }
  /** `id` increases with every send, so the UI can tell two responses apart. */
  | { status: 'success'; response: ExecutedResponse; id: number }
  | { status: 'error'; error: SendError }
  | { status: 'cancelled' };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Owns the lifecycle of one "Send": idle → loading → success | error | cancelled.
 * Starting a new send or cancelling aborts the previous request, so a slow old
 * response can never overwrite a newer one.
 */
export function useSendRequest() {
  const [state, setState] = useState<SendState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const sendCountRef = useRef(0);

  const send = useCallback(async (request: ExecuteRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = ++sendCountRef.current;
    setState({ status: 'loading' });

    try {
      const result = await executeRequest(request, controller.signal);
      if (controller.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'success', response: result.response, id }
          : { status: 'error', error: result.error },
      );
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setState({
        status: 'error',
        error: {
          code: 'BACKEND_UNREACHABLE',
          message: error instanceof ApiClientError ? error.message : 'Unexpected client error.',
        },
      });
    }
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: 'cancelled' });
  }, []);

  // Abort a running request when the component unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, send, cancel };
}
