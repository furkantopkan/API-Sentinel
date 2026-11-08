import type { Assertion, ExecuteRequest } from '@api-sentinel/shared';
import { useCallback, useState } from 'react';
import { collectionsApi } from '../../../services/apiClient';
import { isDirty, snapshotOf, type OpenRequest } from '../lib/savedRequest';
import { unwrap } from './useCollections';

interface WorkspaceDeps {
  /** Current editor content. */
  request: ExecuteRequest;
  assertions: readonly Assertion[];
  /** Puts a stored request into the editor (draft + assertions). */
  loadIntoEditor: (request: ExecuteRequest | null, assertions: Assertion[]) => void;
  /** Re-fetches the sidebar tree after a change. */
  refreshCollections: () => Promise<void>;
  /** Asks the user before throwing away unsaved changes. */
  confirmDiscard: () => boolean;
}

/**
 * Connects the editor with saved requests: which one is open, whether it
 * has unsaved changes, and the open / save / save as / new actions.
 * Every action returns an error message (or null) for the UI to show.
 */
export function useWorkspace({
  request,
  assertions,
  loadIntoEditor,
  refreshCollections,
  confirmDiscard,
}: WorkspaceDeps) {
  const [open, setOpen] = useState<OpenRequest | null>(null);
  const dirty = isDirty(open, request, assertions);

  /** Unsaved work is only at risk when it differs from what is stored. */
  const canLeave = useCallback(() => !dirty || confirmDiscard(), [dirty, confirmDiscard]);

  const openRequest = useCallback(
    async (id: string): Promise<string | null> => {
      if (open?.id === id || !canLeave()) return null;
      const result = await unwrap(collectionsApi.getRequest(id));
      if (!result.ok) return result.message;
      const saved = result.data.savedRequest;
      loadIntoEditor(saved.request, saved.assertions);
      setOpen({
        id: saved.id,
        name: saved.name,
        collectionId: saved.collectionId,
        snapshot: snapshotOf(saved.request, saved.assertions),
      });
      return null;
    },
    [open, canLeave, loadIntoEditor],
  );

  const save = useCallback(async (): Promise<string | null> => {
    if (!open) return 'This request has not been saved yet. Use "Save as".';
    const input = {
      collectionId: open.collectionId,
      name: open.name,
      request,
      assertions: [...assertions],
    };
    const result = await unwrap(collectionsApi.updateRequest(open.id, input));
    if (!result.ok) return result.message;
    setOpen({ ...open, snapshot: snapshotOf(request, assertions) });
    await refreshCollections();
    return null;
  }, [open, request, assertions, refreshCollections]);

  const saveAs = useCallback(
    async (name: string, collectionId: string): Promise<string | null> => {
      const input = { collectionId, name, request, assertions: [...assertions] };
      const result = await unwrap(collectionsApi.createRequest(input));
      if (!result.ok) return result.message;
      const saved = result.data.savedRequest;
      setOpen({
        id: saved.id,
        name: saved.name,
        collectionId,
        snapshot: snapshotOf(request, assertions),
      });
      await refreshCollections();
      return null;
    },
    [request, assertions, refreshCollections],
  );

  const newRequest = useCallback(() => {
    if (!canLeave()) return;
    loadIntoEditor(null, []);
    setOpen(null);
  }, [canLeave, loadIntoEditor]);

  /** Called after deletions so the editor does not point at something that no longer exists. */
  const forget = useCallback((deletedIds: readonly string[]) => {
    setOpen((current) => (current && deletedIds.includes(current.id) ? null : current));
  }, []);

  /** Keeps the open request's name current; a later Save would otherwise restore the old one. */
  const renamed = useCallback((id: string, name: string) => {
    setOpen((current) => (current?.id === id ? { ...current, name } : current));
  }, []);

  return { open, dirty, openRequest, save, saveAs, newRequest, forget, renamed };
}

export type Workspace = ReturnType<typeof useWorkspace>;
