import type { ResponseBody } from '@api-sentinel/shared';
import { useMemo, useState } from 'react';
import { CopyButton } from '../../../components/CopyButton';
import { analyzeJson, formatJsonSummary, type JsonSummary } from '../lib/analyzeJson';
import { bodyText, parseJsonBody } from '../lib/bodyText';
import { formatBytes } from '../lib/formatBytes';
import { JsonTreeView } from './JsonTreeView';
import { Button } from '../../../components/Button';

/** Rendering megabytes of text at once freezes the page (NFR-04); show a preview first. */
const PREVIEW_CHARS = 200_000;

type ViewMode = 'tree' | 'raw';

interface ResponseBodyViewProps {
  body: ResponseBody;
  sizeBytes: number;
  onAddAssertion?: (path: string, value: unknown) => void;
}

function JsonSummaryLine({ summary }: { summary: JsonSummary }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-500" aria-label="JSON summary">
        {formatJsonSummary(summary)}
      </p>
      {summary.unsafeIntegers > 0 && (
        <p role="note" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
          {summary.unsafeIntegers} integer{summary.unsafeIntegers > 1 ? 's are' : ' is'} larger than
          2^53 and cannot be represented exactly in JavaScript. The tree shows rounded values; the
          Raw view shows the response exactly as received.
        </p>
      )}
    </div>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div role="group" aria-label="Body view" className="flex rounded-md border border-slate-200">
      {(['tree', 'raw'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={`px-2 py-0.5 text-xs font-medium ${
            mode === option ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {option === 'tree' ? 'Tree' : 'Raw'}
        </button>
      ))}
    </div>
  );
}

export function ResponseBodyView({ body, sizeBytes, onAddAssertion }: ResponseBodyViewProps) {
  const text = useMemo(() => bodyText(body), [body]);
  // Parse and analyse once per response, not on every render.
  const json = useMemo(() => {
    if (body.kind !== 'json') return null;
    const parsed = parseJsonBody(body.text);
    return parsed && { value: parsed.value, summary: analyzeJson(parsed.value) };
  }, [body]);
  const [showFull, setShowFull] = useState(false);
  const [mode, setMode] = useState<ViewMode>('tree');

  if (body.kind === 'empty') {
    return (
      <p className="py-6 text-center text-sm text-slate-400">No content in the response body.</p>
    );
  }
  if (body.kind === 'binary' || text === null) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Binary content ({formatBytes(sizeBytes)}) is not displayed.
      </p>
    );
  }

  const showTree = json !== null && mode === 'tree';
  const isTruncated = !showFull && text.length > PREVIEW_CHARS;
  const visible = isTruncated ? text.slice(0, PREVIEW_CHARS) : text;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {json !== null ? (
          <ViewToggle mode={mode} onChange={setMode} />
        ) : (
          <span className="text-xs text-slate-400">Text</span>
        )}
        <CopyButton text={text} label="Copy body" />
      </div>

      {json !== null && <JsonSummaryLine summary={json.summary} />}

      {body.kind === 'text' && body.malformedJson && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
          The server declared JSON (Content-Type) but the body is not valid JSON. Shown as text.
        </p>
      )}

      {showTree ? (
        <JsonTreeView data={json.value} onAddAssertion={onAddAssertion} />
      ) : (
        <>
          {/* Rendered as text by React (escaped), so HTML or scripts are never executed. */}
          <pre className="max-h-[32rem] overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-slate-800">
            {visible}
          </pre>

          {isTruncated && (
            <Button variant="ghost" onClick={() => setShowFull(true)}>
              Showing the first {PREVIEW_CHARS.toLocaleString()} characters — show all (
              {formatBytes(sizeBytes)})
            </Button>
          )}
        </>
      )}
    </div>
  );
}
