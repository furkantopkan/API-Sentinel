import type { Environment, EnvironmentInput } from '@api-sentinel/shared';
import { useCallback, useEffect, useState } from 'react';
import { environmentsApi } from '../../../services/apiClient';
import { unwrap } from '../../collections/hooks/useCollections';

const STORAGE_KEY = 'api-sentinel.selected-environment';

/** localStorage can throw (private mode, blocked site data); selection is only a convenience. */
function readSelection(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSelection(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not remembering the selection is harmless.
  }
}

export type SaveResult = { ok: true; environment: Environment } | { ok: false; message: string };

/** The environment list and which one is selected for sending. */
export function useEnvironments() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(readSelection);

  const refresh = useCallback(async () => {
    const result = await unwrap(environmentsApi.list());
    if (result.ok) setEnvironments(result.data.environments);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void unwrap(environmentsApi.list(controller.signal)).then((result) => {
      if (!controller.signal.aborted && result.ok) setEnvironments(result.data.environments);
    });
    return () => controller.abort();
  }, []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    writeSelection(id);
  }, []);

  /** Creates (id = null) or updates an environment. */
  const save = useCallback(
    async (id: string | null, input: EnvironmentInput): Promise<SaveResult> => {
      const result = await unwrap(
        id === null ? environmentsApi.create(input) : environmentsApi.update(id, input),
      );
      if (!result.ok) return { ok: false, message: result.message };
      await refresh();
      return { ok: true, environment: result.data.environment };
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const result = await unwrap(environmentsApi.remove(id));
      if (!result.ok) return result.message;
      await refresh();
      return null;
    },
    [refresh],
  );

  // Derived: a deleted environment simply stops being "selected".
  const selected = environments.find((environment) => environment.id === selectedId);

  return { environments, selected, select, save, remove };
}

export type Environments = ReturnType<typeof useEnvironments>;
