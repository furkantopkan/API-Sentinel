import type { Environment } from '@api-sentinel/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/Button';
import type { Environments } from '../hooks/useEnvironments';
import { toRows, toVariableInputs, withSecretFlag, type VariableRow } from '../lib/variableRows';

const field = 'rounded-md border border-slate-300 px-2 py-1 text-xs';

interface EditorProps {
  /** undefined = a new environment. */
  environment: Environment | undefined;
  environments: Environments;
  onSaved: (environment: Environment) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function EnvironmentEditor({
  environment,
  environments,
  onSaved,
  onDeleted,
  onDirtyChange,
}: EditorProps) {
  const [name, setName] = useState(environment?.name ?? '');
  const [rows, setRows] = useState<VariableRow[]>(() => toRows(environment));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const updateRow = (rowId: string, change: (row: VariableRow) => VariableRow) =>
    setRows((list) => list.map((row) => (row.rowId === rowId ? change(row) : row)));

  const addRow = () =>
    setRows((list) => [
      ...list,
      {
        rowId: crypto.randomUUID(),
        key: '',
        value: '',
        isSecret: false,
        enabled: true,
        hasStoredSecret: false,
      },
    ]);

  // Any difference from what was loaded counts as unsaved.
  const dirty =
    name !== (environment?.name ?? '') ||
    JSON.stringify(toVariableInputs(rows)) !==
      JSON.stringify(toVariableInputs(toRows(environment)));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await environments.save(environment?.id ?? null, {
      name,
      variables: toVariableInputs(rows),
    });
    setBusy(false);
    if (result.ok) {
      setError(null);
      onSaved(result.environment);
    } else {
      setError(result.message);
    }
  };

  const remove = async () => {
    if (!environment) return;
    if (!window.confirm(`Delete environment "${environment.name}"? This cannot be undone.`)) return;
    const message = await environments.remove(environment.id);
    if (message === null) onDeleted();
    else setError(message);
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex min-w-0 flex-1 flex-col gap-3">
      <label className="block text-xs font-medium text-slate-600">
        Environment name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder="e.g. Staging"
          className={`${field} mt-1 block w-full`}
        />
      </label>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {rows.length === 0 && (
          <p className="text-xs text-slate-400">
            No variables yet. Use them in a request as {'{{name}}'}.
          </p>
        )}
        {rows.map((row, index) => {
          const n = index + 1;
          return (
            <div key={row.rowId} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => updateRow(row.rowId, (r) => ({ ...r, enabled: e.target.checked }))}
                aria-label={`Enable variable ${n}`}
                className="h-4 w-4 accent-indigo-600"
              />
              <input
                value={row.key}
                onChange={(e) => updateRow(row.rowId, (r) => ({ ...r, key: e.target.value }))}
                aria-label={`Variable ${n} name`}
                placeholder="baseUrl"
                spellCheck={false}
                className={`${field} w-40 font-mono`}
              />
              <input
                // Secrets stay masked while typing; stored ones are never sent to the browser.
                type={row.isSecret ? 'password' : 'text'}
                value={row.value}
                onChange={(e) => updateRow(row.rowId, (r) => ({ ...r, value: e.target.value }))}
                aria-label={`Variable ${n} value`}
                placeholder={row.hasStoredSecret ? 'Saved (leave blank to keep)' : 'value'}
                autoComplete="off"
                spellCheck={false}
                className={`${field} min-w-0 flex-1 font-mono`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={row.isSecret}
                  onChange={(e) => updateRow(row.rowId, (r) => withSecretFlag(r, e.target.checked))}
                  aria-label={`Variable ${n} is secret`}
                  className="h-4 w-4 accent-indigo-600"
                />
                Secret
              </label>
              <Button
                variant="ghost"
                danger
                size="md"
                onClick={() => setRows((list) => list.filter((r) => r.rowId !== row.rowId))}
                aria-label={`Remove variable ${n}`}
              >
                ✕
              </Button>
            </div>
          );
        })}
        <Button variant="ghost" size="md" onClick={addRow}>
          + Add variable
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-slate-200 pt-3">
        {environment ? (
          <Button variant="ghost" danger onClick={() => void remove()}>
            Delete environment
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" size="md" disabled={busy || !dirty}>
          Save environment
        </Button>
      </div>
    </form>
  );
}

interface ManagerProps {
  environments: Environments;
  onClose: () => void;
}

/** Dialog for creating and editing environments and their variables. */
export function EnvironmentManager({ environments, onClose }: ManagerProps) {
  const list = environments.environments;
  // undefined = "new environment" form.
  const [activeId, setActiveId] = useState<string | undefined>(list[0]?.id);
  // Bumped after a save so the editor reloads server state (e.g. blanks typed secrets).
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);

  const active = list.find((environment) => environment.id === activeId);

  const canLeave = () =>
    !dirty || window.confirm('This environment has unsaved changes. Discard them?');

  const switchTo = (id: string | undefined) => {
    if (!canLeave()) return;
    setDirty(false);
    setActiveId(id);
    setVersion((v) => v + 1);
  };

  const close = () => {
    if (canLeave()) onClose();
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage environments"
        onKeyDown={(e) => e.key === 'Escape' && close()}
        className="flex h-[32rem] w-full max-w-3xl flex-col gap-3 rounded-lg bg-white p-4 shadow-xl"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Environments</h2>
          <Button variant="ghost" danger size="md" onClick={close} aria-label="Close">
            ✕
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 gap-4">
          <nav aria-label="Environment list" className="flex w-44 shrink-0 flex-col gap-1">
            <Button onClick={() => switchTo(undefined)}>+ New environment</Button>
            {list.map((environment) => (
              <button
                key={environment.id}
                type="button"
                aria-current={environment.id === activeId ? 'true' : undefined}
                onClick={() => switchTo(environment.id)}
                className={`truncate rounded-md px-2 py-1 text-left text-xs ${
                  environment.id === activeId
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {environment.name}
              </button>
            ))}
          </nav>

          <EnvironmentEditor
            key={`${activeId ?? 'new'}-${version}`}
            environment={active}
            environments={environments}
            onDirtyChange={setDirty}
            onSaved={(saved) => {
              setDirty(false);
              setActiveId(saved.id);
              setVersion((v) => v + 1);
            }}
            onDeleted={() => {
              setDirty(false);
              setActiveId(undefined);
              setVersion((v) => v + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
