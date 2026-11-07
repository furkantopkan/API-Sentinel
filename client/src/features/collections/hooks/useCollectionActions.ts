import type { Collection } from '@api-sentinel/shared';
import { useCallback } from 'react';
import { collectionsApi } from '../../../services/apiClient';
import { unwrap } from './useCollections';
import type { Workspace } from './useWorkspace';

/**
 * Sidebar actions: create / rename / delete collections and delete saved
 * requests. Deleting asks first, refreshes the tree, and tells the
 * workspace so the editor never points at a deleted request.
 */
export function useCollectionActions(
  refresh: () => Promise<void>,
  workspace: Workspace,
  confirm: (message: string) => boolean,
) {
  const { forget } = workspace;

  const afterChange = useCallback(
    async (result: { ok: true } | { ok: false; message: string }) => {
      if (!result.ok) return result.message;
      await refresh();
      return null;
    },
    [refresh],
  );

  return {
    create: useCallback(
      async (name: string) => afterChange(await unwrap(collectionsApi.create(name))),
      [afterChange],
    ),

    rename: useCallback(
      async (id: string, name: string) =>
        afterChange(await unwrap(collectionsApi.rename(id, name))),
      [afterChange],
    ),

    remove: useCallback(
      async (collection: Collection) => {
        const count = collection.requests.length;
        const what = count === 0 ? '' : ` and its ${count} saved request${count === 1 ? '' : 's'}`;
        if (!confirm(`Delete collection "${collection.name}"${what}? This cannot be undone.`)) {
          return null;
        }
        const result = await unwrap(collectionsApi.remove(collection.id));
        if (result.ok) forget(collection.requests.map((r) => r.id));
        return afterChange(result);
      },
      [afterChange, confirm, forget],
    ),

    removeRequest: useCallback(
      async (id: string, name: string) => {
        if (!confirm(`Delete saved request "${name}"? This cannot be undone.`)) return null;
        const result = await unwrap(collectionsApi.removeRequest(id));
        if (result.ok) forget([id]);
        return afterChange(result);
      },
      [afterChange, confirm, forget],
    ),
  };
}
