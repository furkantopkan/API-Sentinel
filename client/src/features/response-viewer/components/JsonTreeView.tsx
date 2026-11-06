import { formatJsonPath, type PathSegment } from '@api-sentinel/shared';
import { useState } from 'react';
import { CopyButton } from '../../../components/CopyButton';
import {
  childEntries,
  isUnsafeInteger,
  jsonTypeOf,
  previewValue,
  type JsonType,
} from '../lib/jsonTypes';

/**
 * Large responses: children are only rendered when their parent is expanded,
 * and at most PAGE_SIZE at a time ("Show more"). A 10 000-item array therefore
 * costs 100 rows, not 10 000.
 */
export const PAGE_SIZE = 100;
/** Levels open on first render: root and its direct children. */
const DEFAULT_EXPAND_DEPTH = 2;
/** "Expand all" still stops somewhere, so a pathological document cannot freeze the page. */
const EXPAND_ALL_DEPTH = 20;
const MAX_INLINE_STRING = 200;

const TYPE_STYLES: Record<JsonType, string> = {
  object: 'bg-slate-100 text-slate-600',
  array: 'bg-slate-100 text-slate-600',
  string: 'bg-emerald-50 text-emerald-700',
  number: 'bg-sky-50 text-sky-700',
  boolean: 'bg-violet-50 text-violet-700',
  null: 'bg-amber-50 text-amber-700',
};

const VALUE_STYLES: Record<JsonType, string> = {
  object: 'text-slate-400',
  array: 'text-slate-400',
  string: 'text-emerald-700',
  number: 'text-sky-700',
  boolean: 'text-violet-700',
  null: 'text-amber-700',
};

function TypeBadge({ type }: { type: JsonType }) {
  return (
    <span className={`rounded px-1 py-px font-sans text-[10px] font-medium ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  );
}

interface NodeProps {
  name: PathSegment | null; // null = root
  value: unknown;
  path: PathSegment[];
  depth: number;
  expandDepth: number;
  selectedPath: string | null;
  onSelect: (path: PathSegment[], value: unknown) => void;
}

function JsonNode({ name, value, path, depth, expandDepth, selectedPath, onSelect }: NodeProps) {
  const type = jsonTypeOf(value);
  const isContainer = type === 'object' || type === 'array';
  const children = isContainer ? childEntries(value) : [];
  const [expanded, setExpanded] = useState(depth < expandDepth);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const pathText = formatJsonPath(path);
  const isSelected = selectedPath === pathText;

  const label =
    name === null ? '(root)' : typeof name === 'number' ? String(name) : JSON.stringify(name);
  const inline =
    type === 'string' && (value as string).length > MAX_INLINE_STRING
      ? previewValue(value, MAX_INLINE_STRING)
      : previewValue(value, Number.POSITIVE_INFINITY);

  return (
    <li
      role="treeitem"
      aria-expanded={isContainer && children.length > 0 ? expanded : undefined}
      aria-selected={isSelected}
      aria-label={name === null ? 'root' : String(name)}
    >
      <div
        className={`flex items-start gap-1 rounded px-1 ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
      >
        {isContainer && children.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
            className="w-4 shrink-0 text-slate-400 hover:text-slate-700"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(path, value)}
          className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-left"
          title={pathText === '' ? '(root)' : pathText}
        >
          <span className={typeof name === 'number' ? 'text-slate-400' : 'text-slate-800'}>
            {label}
          </span>
          <span className="text-slate-400">:</span>
          {/* Text content, rendered by React (escaped), never as HTML */}
          <span className={`break-all ${VALUE_STYLES[type]}`}>
            {isContainer && expanded && children.length > 0 ? '' : inline}
          </span>
          <TypeBadge type={type} />
          {isUnsafeInteger(value) && (
            <span className="font-sans text-[10px] text-red-600" title="Precision lost when parsed">
              ⚠ precision
            </span>
          )}
        </button>
      </div>

      {isContainer && expanded && children.length > 0 && (
        <ul role="group" className="ml-3 border-l border-slate-100 pl-2">
          {children.slice(0, visibleCount).map(([key, child]) => (
            <JsonNode
              key={key}
              name={key}
              value={child}
              path={[...path, key]}
              depth={depth + 1}
              expandDepth={expandDepth}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
          {children.length > visibleCount && (
            <li>
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="ml-5 font-sans text-xs font-medium text-indigo-700 hover:underline"
              >
                Show more ({children.length - visibleCount} remaining)
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

interface Selection {
  path: PathSegment[];
  value: unknown;
}

function FieldDetails({ selection }: { selection: Selection }) {
  const path = formatJsonPath(selection.path);
  const type = jsonTypeOf(selection.value);
  const valueText = JSON.stringify(selection.value, null, 2);

  let size: string | null = null;
  if (type === 'array') size = `${(selection.value as unknown[]).length} items`;
  if (type === 'object') size = `${Object.keys(selection.value as object).length} keys`;
  if (type === 'string') size = `${(selection.value as string).length} characters`;

  return (
    <div
      aria-label="Selected field"
      className="space-y-1.5 rounded-md border border-slate-200 bg-white p-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500">Path</span>
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono break-all text-slate-800">
          {path === '' ? '(root)' : path}
        </code>
        {path !== '' && <CopyButton text={path} label="Copy path" />}
        <CopyButton text={valueText} label="Copy value" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
        <span>
          Type <TypeBadge type={type} />
        </span>
        {size !== null && <span>Size {size}</span>}
      </div>
      {isUnsafeInteger(selection.value) && (
        <p className="text-red-700">
          This integer is larger than 2^53. JavaScript cannot store it exactly, so the shown value
          may differ from the raw response. Check the Raw view.
        </p>
      )}
    </div>
  );
}

/**
 * Collapsible JSON tree with type badges. Clicking a field shows its path
 * (e.g. `data.items[0].id`, the format assertions will use) and details.
 */
export function JsonTreeView({ data }: { data: unknown }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  // Changing `version` remounts the tree, so every node re-reads expandDepth.
  const [expand, setExpand] = useState({ depth: DEFAULT_EXPAND_DEPTH, version: 0 });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setExpand((e) => ({ depth: EXPAND_ALL_DEPTH, version: e.version + 1 }))}
          className="text-xs font-medium text-indigo-700 hover:underline"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setExpand((e) => ({ depth: 1, version: e.version + 1 }))}
          className="text-xs font-medium text-indigo-700 hover:underline"
        >
          Collapse all
        </button>
      </div>

      {selection ? (
        <FieldDetails selection={selection} />
      ) : (
        <p className="text-xs text-slate-400">Click a field to see its path and type.</p>
      )}

      <ul
        key={expand.version}
        role="tree"
        aria-label="JSON tree"
        className="max-h-[32rem] overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs leading-relaxed"
      >
        <JsonNode
          name={null}
          value={data}
          path={[]}
          depth={0}
          expandDepth={expand.depth}
          selectedPath={selection ? formatJsonPath(selection.path) : null}
          onSelect={(path, value) => setSelection({ path, value })}
        />
      </ul>
    </div>
  );
}
