import type { Collection } from '@api-sentinel/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/Button';
import type { OpenRequest } from '../lib/savedRequest';

interface SaveBarProps {
  open: OpenRequest | null;
  dirty: boolean;
  collections: readonly Collection[];
  onSave: () => Promise<string | null>;
  onSaveAs: (name: string, collectionId: string) => Promise<string | null>;
}

/**
 * Above the URL bar: which saved request is open, whether it has unsaved
 * changes, and Save / Save as. "Save as" always creates a new saved request.
 */
export function SaveBar({ open, dirty, collections, onSave, onSaveAs }: SaveBarProps) {
  const [savingAs, setSavingAs] = useState(false);
  const [name, setName] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const collectionName = collections.find((c) => c.id === open?.collectionId)?.name;
  const targetId = collectionId || collections[0]?.id || '';

  const startSaveAs = () => {
    setName(open ? `${open.name} (copy)` : '');
    setCollectionId(open?.collectionId ?? '');
    setError(null);
    setSavingAs(true);
  };

  const run = async (action: () => Promise<string | null>, onSuccess?: () => void) => {
    setBusy(true);
    const message = await action();
    setBusy(false);
    setError(message);
    if (message === null) onSuccess?.();
  };

  const submitSaveAs = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '' || targetId === '') return;
    void run(
      () => onSaveAs(name.trim(), targetId),
      () => setSavingAs(false),
    );
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span aria-label="Open request" className="min-w-0 flex-1 truncate text-slate-600">
          {open ? (
            <>
              <span className="text-slate-400">{collectionName ?? 'Collection'} / </span>
              <span className="font-medium text-slate-800">{open.name}</span>
            </>
          ) : (
            <span className="text-slate-400">Unsaved request</span>
          )}
          {dirty && (
            <span className="ml-2 text-xs text-amber-700" title="This request has unsaved changes">
              ● Unsaved changes
            </span>
          )}
        </span>
        {open && (
          <Button
            // Highlighted while there is something to save.
            variant={dirty ? 'primary' : 'secondary'}
            onClick={() => void run(onSave)}
            disabled={!dirty || busy}
          >
            Save
          </Button>
        )}
        <Button onClick={startSaveAs} disabled={busy}>
          Save as…
        </Button>
      </div>

      {savingAs && (
        <form
          onSubmit={submitSaveAs}
          aria-label="Save as"
          className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
        >
          {collections.length === 0 ? (
            <p className="text-xs text-slate-500">
              Create a collection in the left panel first (“+ New”).
            </p>
          ) : (
            <>
              <input
                aria-label="Request name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Request name"
                autoFocus
                className="min-w-40 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
              <select
                aria-label="Collection"
                value={targetId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="primary" disabled={busy || name.trim() === ''}>
                Save
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setSavingAs(false)}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
