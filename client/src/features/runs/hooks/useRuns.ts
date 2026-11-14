import type { Collection, Run, RunSummary } from '@api-sentinel/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { runsApi } from '../../../services/apiClient';
import { unwrap } from '../../collections/hooks/useCollections';

/** Running a collection, the run history, and comparing two runs. */
export function useRuns(environmentId: string | undefined) {
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [compareBase, setCompareBase] = useState<Run | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const result = await unwrap(runsApi.list());
    if (result.ok) setHistory(result.data.runs);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void unwrap(runsApi.list(controller.signal)).then((result) => {
      if (!controller.signal.aborted && result.ok) setHistory(result.data.runs);
    });
    return () => controller.abort();
  }, []);

  const start = useCallback(
    async (collection: Collection) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRunning(collection.name);
      setError(null);
      const result = await unwrap(
        runsApi.start(
          collection.id,
          // A collection with its own environment always runs with it.
          collection.environmentId ?? environmentId,
          controller.signal,
        ),
      );
      if (controller.signal.aborted) return; // cancel() already cleaned up
      setRunning(null);
      if (result.ok) {
        setSelected(result.data.run);
        setCompareBase(null);
        await refresh();
      } else {
        setError(result.message);
      }
    },
    [environmentId, refresh],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRunning(null);
  }, []);

  const open = useCallback(async (id: string) => {
    setError(null);
    const result = await unwrap(runsApi.get(id));
    if (result.ok) {
      setSelected(result.data.run);
      setCompareBase(null);
    } else {
      setError(result.message);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const result = await unwrap(runsApi.remove(id));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSelected((current) => (current?.id === id ? null : current));
      setCompareBase((current) => (current?.id === id ? null : current));
      await refresh();
    },
    [refresh],
  );

  const compareWith = useCallback(async (id: string | null) => {
    if (id === null) {
      setCompareBase(null);
      return;
    }
    const result = await unwrap(runsApi.get(id));
    if (result.ok) setCompareBase(result.data.run);
    else setError(result.message);
  }, []);

  return {
    history,
    selected,
    compareBase,
    running,
    error,
    start,
    cancel,
    open,
    remove,
    compareWith,
  };
}

export type Runs = ReturnType<typeof useRuns>;
