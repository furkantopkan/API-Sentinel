import { HTTP_METHODS, httpMethodSchema, type HttpMethod } from '@api-sentinel/shared';

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-700',
  POST: 'text-amber-700',
  PUT: 'text-sky-700',
  PATCH: 'text-violet-700',
  DELETE: 'text-red-700',
};

interface MethodSelectProps {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
}

export function MethodSelect({ value, onChange }: MethodSelectProps) {
  return (
    <select
      aria-label="HTTP method"
      value={value}
      // The DOM gives us a plain string; parse it so only real methods get through.
      onChange={(event) => onChange(httpMethodSchema.parse(event.target.value))}
      className={`rounded-l-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold focus:z-10 focus:outline-2 focus:outline-indigo-500 ${METHOD_COLORS[value]}`}
    >
      {HTTP_METHODS.map((method) => (
        <option key={method} value={method}>
          {method}
        </option>
      ))}
    </select>
  );
}
