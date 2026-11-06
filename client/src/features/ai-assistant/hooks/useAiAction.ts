import type { ApiErrorBody, ApiErrorResponse } from '@api-sentinel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../../services/apiClient';

export type AiActionState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiErrorBody | { code: 'BACKEND_UNREACHABLE'; message: string } };

/**
 * Lifecycle of one AI action (idle → loading → success | error), like
 * useSendRequest. Running it again or unmounting aborts the previous call,
 * so a slow old answer never replaces a newer one.
 */
export function useAiAction<T extends { ok: true }>(
  action: (signal: AbortSignal) => Promise<T | ApiErrorResponse>,
  /** Called once with a successful result (e.g. to copy it into editable state). */
  onSuccess?: (data: T) => void,
) {
  const [state, setState] = useState<AiActionState<T>>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading' });
    try {
      const result = await action(controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        onSuccess?.(result);
        setState({ status: 'success', data: result });
      } else {
        setState({ status: 'error', error: result.error });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({
        status: 'error',
        error: {
          code: 'BACKEND_UNREACHABLE',
          message: error instanceof ApiClientError ? error.message : 'Unexpected client error.',
        },
      });
    }
  }, [action, onSuccess]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: 'idle' });
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, run, cancel, setState };
}
