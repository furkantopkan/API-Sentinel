import type { ResponseBody } from '@api-sentinel/shared';
import { useMemo, useState } from 'react';
import { CopyButton } from '../../../components/CopyButton';
import { bodyText } from '../lib/bodyText';
import { formatBytes } from '../lib/formatBytes';

/** Rendering megabytes of text at once freezes the page (NFR-04); show a preview first. */
const PREVIEW_CHARS = 200_000;

interface ResponseBodyViewProps {
  body: ResponseBody;
  sizeBytes: number;
}

export function ResponseBodyView({ body, sizeBytes }: ResponseBodyViewProps) {
  const text = useMemo(() => bodyText(body), [body]);
  const [showFull, setShowFull] = useState(false);

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

  const isTruncated = !showFull && text.length > PREVIEW_CHARS;
  const visible = isTruncated ? text.slice(0, PREVIEW_CHARS) : text;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          {body.kind === 'json' ? 'JSON (formatted)' : 'Text'}
        </span>
        <CopyButton text={text} label="Copy body" />
      </div>

      {body.kind === 'text' && body.malformedJson && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
          The server declared JSON (Content-Type) but the body is not valid JSON. Shown as text.
        </p>
      )}

      {/* Rendered as text by React (escaped), so HTML or scripts are never executed. */}
      <pre className="max-h-[32rem] overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-slate-800">
        {visible}
      </pre>

      {isTruncated && (
        <button
          type="button"
          onClick={() => setShowFull(true)}
          className="text-xs font-medium text-indigo-700 hover:underline"
        >
          Showing the first {PREVIEW_CHARS.toLocaleString()} characters — show all (
          {formatBytes(sizeBytes)})
        </button>
      )}
    </div>
  );
}
