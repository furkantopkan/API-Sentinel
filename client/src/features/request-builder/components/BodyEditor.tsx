import type { HttpMethod } from '@api-sentinel/shared';
import { formatJsonBody, validateJsonBody } from '../lib/validateJsonBody';

const METHODS_WITHOUT_BODY: ReadonlySet<HttpMethod> = new Set(['GET', 'DELETE']);

interface BodyEditorProps {
  body: string;
  method: HttpMethod;
  onChange: (body: string) => void;
}

export function BodyEditor({ body, method, onChange }: BodyEditorProps) {
  // Cheap enough to run on every render; no need to store it in state.
  const validation = validateJsonBody(body);

  const handleFormat = () => {
    const formatted = formatJsonBody(body);
    if (formatted !== null) onChange(formatted);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">JSON body</span>
        <button
          type="button"
          onClick={handleFormat}
          disabled={!validation.ok || validation.empty}
          className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          Format
        </button>
      </div>

      {METHODS_WITHOUT_BODY.has(method) && body.trim() !== '' && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
          Many servers ignore the body of {method} requests.
        </p>
      )}

      <textarea
        aria-label="Request body"
        value={body}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'{\n  "name": "Ada"\n}'}
        spellCheck={false}
        rows={10}
        aria-invalid={!validation.ok}
        className={`w-full resize-y rounded-md border px-3 py-2 font-mono text-sm ${
          validation.ok ? 'border-slate-300' : 'border-red-400 bg-red-50/40'
        }`}
      />

      {!validation.ok && (
        <p role="alert" className="text-xs text-red-700">
          Invalid JSON
          {validation.line !== undefined &&
            ` at line ${validation.line}, column ${validation.column}`}
          : {validation.message}
        </p>
      )}
    </div>
  );
}
