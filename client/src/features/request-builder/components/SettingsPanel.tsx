import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS } from '../lib/validateDraft';
import type { RequestOptions } from '../types';

interface SettingsPanelProps {
  options: RequestOptions;
  onChange: (patch: Partial<RequestOptions>) => void;
}

export function SettingsPanel({ options, onChange }: SettingsPanelProps) {
  return (
    <div className="max-w-xl space-y-4">
      <label className="block text-xs font-medium text-slate-600">
        Timeout (ms)
        <input
          type="number"
          min={MIN_TIMEOUT_MS}
          max={MAX_TIMEOUT_MS}
          step={500}
          value={Number.isNaN(options.timeoutMs) ? '' : options.timeoutMs}
          // valueAsNumber is NaN for an empty field; validateDraft reports it on Send.
          onChange={(event) => onChange({ timeoutMs: event.target.valueAsNumber })}
          className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm"
        />
        <span className="mt-1 block font-normal text-slate-400">
          {MIN_TIMEOUT_MS}–{MAX_TIMEOUT_MS} ms. The whole exchange, including redirects, must finish
          in this time.
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={options.followRedirects}
          onChange={(event) => onChange({ followRedirects: event.target.checked })}
          className="h-4 w-4 accent-indigo-600"
        />
        Follow redirects (up to the server limit, every hop is security-checked)
      </label>
    </div>
  );
}
