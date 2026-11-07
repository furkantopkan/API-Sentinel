import type { Collection, HttpMethod } from '@api-sentinel/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/Button';
import type { CollectionsState } from '../hooks/useCollections';

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-700',
  POST: 'text-amber-700',
  PUT: 'text-sky-700',
  PATCH: 'text-violet-700',
  DELETE: 'text-red-700',
};

interface CollectionsSidebarProps {
  state: CollectionsState;
  activeRequestId: string | null;
  /** All actions resolve to an error message, or null on success. */
  onCreate: (name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => Promise<string | null>;
  onDelete: (collection: Collection) => Promise<string | null>;
  onOpenRequest: (id: string) => Promise<string | null>;
  onDeleteRequest: (id: string, name: string) => Promise<string | null>;
  onNewRequest: () => void;
}

/** Small inline form used for "new collection" and "rename". */
function NameForm({
  label,
  initial = '',
  onSubmit,
  onCancel,
}: {
  label: string;
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() !== '') onSubmit(name.trim());
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        aria-label={label}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        maxLength={200}
        autoFocus
        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <Button type="submit" disabled={name.trim() === ''}>
        OK
      </Button>
      <Button variant="ghost" danger onClick={onCancel} aria-label="Cancel">
        ✕
      </Button>
    </form>
  );
}

/** Left panel: collections with their saved requests. */
export function CollectionsSidebar(props: CollectionsSidebarProps) {
  const { state, activeRequestId } = props;
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Runs an action and shows its error message, if any.
  const run = async (action: Promise<string | null>) => setError(await action);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <aside
      aria-label="Collections"
      className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-200 bg-white px-3 py-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Collections
        </h2>
        <Button variant="ghost" onClick={() => setCreating(true)}>
          + New
        </Button>
      </div>

      <Button onClick={props.onNewRequest} className="w-full">
        New request
      </Button>

      {creating && (
        <NameForm
          label="New collection name"
          onCancel={() => setCreating(false)}
          onSubmit={(name) => {
            setCreating(false);
            void run(props.onCreate(name));
          }}
        />
      )}

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      )}

      {state.status === 'loading' && <p className="text-xs text-slate-400">Loading…</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-xs text-red-700">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.collections.length === 0 && !creating && (
        <p className="text-xs text-slate-400">
          No collections yet. Create one with “+ New”, then save requests into it.
        </p>
      )}

      {state.status === 'ready' && (
        <ul aria-label="Collection list" className="space-y-1">
          {state.collections.map((collection) => {
            const open = !collapsed.has(collection.id);
            return (
              <li key={collection.id} aria-label={`Collection ${collection.name}`}>
                {renamingId === collection.id ? (
                  <NameForm
                    label={`Rename collection ${collection.name}`}
                    initial={collection.name}
                    onCancel={() => setRenamingId(null)}
                    onSubmit={(name) => {
                      setRenamingId(null);
                      void run(props.onRename(collection.id, name));
                    }}
                  />
                ) : (
                  <div className="group flex items-center gap-1 rounded-md hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() => toggle(collection.id)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left text-sm font-medium text-slate-700"
                    >
                      <span className="w-3 text-xs text-slate-400">{open ? '▾' : '▸'}</span>
                      <span className="truncate">{collection.name}</span>
                      <span className="text-xs font-normal text-slate-400">
                        {collection.requests.length}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      onClick={() => setRenamingId(collection.id)}
                      aria-label={`Rename collection ${collection.name}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      ✎
                    </Button>
                    <Button
                      variant="ghost"
                      danger
                      onClick={() => void run(props.onDelete(collection))}
                      aria-label={`Delete collection ${collection.name}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      ✕
                    </Button>
                  </div>
                )}

                {open && (
                  <ul className="ml-4 space-y-0.5 border-l border-slate-100 pl-1">
                    {collection.requests.length === 0 && (
                      <li className="px-2 py-1 text-xs text-slate-400">Empty</li>
                    )}
                    {collection.requests.map((saved) => {
                      const active = saved.id === activeRequestId;
                      return (
                        <li key={saved.id} className="group flex items-center">
                          <button
                            type="button"
                            onClick={() => void run(props.onOpenRequest(saved.id))}
                            aria-current={active ? 'true' : undefined}
                            title={saved.url}
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                              active
                                ? 'bg-indigo-50 text-indigo-900'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`w-11 shrink-0 font-mono text-[10px] font-semibold ${METHOD_COLORS[saved.method]}`}
                            >
                              {saved.method}
                            </span>
                            <span className="truncate">{saved.name}</span>
                          </button>
                          <Button
                            variant="ghost"
                            danger
                            onClick={() => void run(props.onDeleteRequest(saved.id, saved.name))}
                            aria-label={`Delete request ${saved.name}`}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            ✕
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
