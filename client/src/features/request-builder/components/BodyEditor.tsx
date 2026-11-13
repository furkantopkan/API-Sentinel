import type { HttpMethod } from '@api-sentinel/shared';
import { formatJsonBody, validateJsonBody } from '../lib/validateJsonBody';
import { Button } from '../../../components/Button';

const METHODS_WITHOUT_BODY: ReadonlySet<HttpMethod> = new Set(['GET', 'DELETE']);

interface BodyEditorProps {
  body: string;
  method: HttpMethod;
  /** True when the Content-Type header declares a form: the body is sent as typed. */
  form?: boolean;
  /** The declared Content-Type of a body sent as typed. */
  contentType?: string;
  onChange: (body: string) => void;
}

export function BodyEditor({ body, method, form = false, contentType, onChange }: BodyEditorProps) {
  // Cheap enough to run on every render; no need to store it in state.
  const validation = form
    ? ({ ok: true, empty: body.trim() === '' } as const)
    : validateJsonBody(body);

  const handleFormat = () => {
    const formatted = formatJsonBody(body);
    if (formatted !== null) onChange(formatted);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          {!form
            ? 'JSON body'
            : contentType === undefined || /x-www-form-urlencoded/i.test(contentType)
              ? 'Form body (x-www-form-urlencoded)'
              : `Body sent as typed (${contentType})`}
        </span>
        {!form && (
          <Button onClick={handleFormat} disabled={!validation.ok || validation.empty}>
            Format
          </Button>
        )}
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
        placeholder={form ? 'name=Ada&role=qa' : '{\n  "name": "Ada"\n}'}
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
      {!form && (
        <p className="text-xs text-slate-500">
          To send a form instead, add the header Content-Type: application/x-www-form-urlencoded.
        </p>
      )}
    </div>
  );
}
