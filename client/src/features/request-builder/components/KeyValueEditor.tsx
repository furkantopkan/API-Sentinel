import type { KeyValueRow } from '../types';

type RowPatch = Partial<Pick<KeyValueRow, 'key' | 'value' | 'enabled'>>;

interface KeyValueEditorProps {
  rows: readonly KeyValueRow[];
  onAdd: () => void;
  onUpdate: (id: string, patch: RowPatch) => void;
  onRemove: (id: string) => void;
  /** Used in labels and the empty-state text, e.g. "query parameter". */
  itemName: string;
  keyPlaceholder: string;
  valuePlaceholder: string;
}

/**
 * Reusable table for query parameters and headers.
 * It holds no state of its own: rows come in via props and every change goes
 * out via callbacks (a "controlled" component).
 */
export function KeyValueEditor({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  itemName,
  keyPlaceholder,
  valuePlaceholder,
}: KeyValueEditorProps) {
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No {itemName}s yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(event) => onUpdate(row.id, { enabled: event.target.checked })}
                aria-label={`Enable ${itemName} ${index + 1}`}
                className="h-4 w-4 accent-indigo-600"
              />
              <input
                type="text"
                value={row.key}
                onChange={(event) => onUpdate(row.id, { key: event.target.value })}
                placeholder={keyPlaceholder}
                aria-label={`${itemName} ${index + 1} key`}
                spellCheck={false}
                className={`w-1/3 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm ${row.enabled ? '' : 'text-slate-400 line-through'}`}
              />
              <input
                type="text"
                value={row.value}
                onChange={(event) => onUpdate(row.id, { value: event.target.value })}
                placeholder={valuePlaceholder}
                aria-label={`${itemName} ${index + 1} value`}
                spellCheck={false}
                className={`flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm ${row.enabled ? '' : 'text-slate-400 line-through'}`}
              />
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                aria-label={`Remove ${itemName} ${index + 1}`}
                className="rounded-md px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="rounded-md px-2 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
      >
        + Add {itemName}
      </button>
    </div>
  );
}
