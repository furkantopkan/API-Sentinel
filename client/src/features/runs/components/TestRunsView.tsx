import { compareRuns, type Run, type RunChange, type RunRequestResult } from '@api-sentinel/shared';
import { Button } from '../../../components/Button';
import { buttonClassName } from '../../../components/buttonStyles';
import { reportUrl } from '../../../services/apiClient';
import { AssertionResults } from '../../assertions/components/AssertionResults';
import { OutcomeBadge } from '../../assertions/components/OutcomeBadge';
import type { Runs } from '../hooks/useRuns';

const CHANGE_LABELS: Record<RunChange, string> = {
  regression: 'Regression',
  fixed: 'Fixed',
  changed: 'Changed',
  added: 'New',
  removed: 'Removed',
  same: 'Same',
};

const CHANGE_STYLES: Record<RunChange, string> = {
  regression: 'bg-red-100 text-red-800',
  fixed: 'bg-emerald-100 text-emerald-800',
  changed: 'bg-amber-100 text-amber-800',
  added: 'bg-sky-100 text-sky-800',
  removed: 'bg-slate-200 text-slate-700',
  same: 'bg-slate-100 text-slate-600',
};

const formatDate = (iso: string) => new Date(iso).toLocaleString();
const show = (value: string | number | null) => value ?? '–';

function ResultRow({ result }: { result: RunRequestResult }) {
  return (
    // Problems start open: that is what the reader came to see.
    <details open={result.outcome !== 'pass'} className="rounded-md border border-slate-200 p-2">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
        <OutcomeBadge outcome={result.outcome} />
        <span className="font-medium text-slate-800">{result.name}</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">
          {result.method} {result.url}
        </code>
        <span className="text-xs text-slate-500">
          {result.status === null ? result.errorCode : `${result.status} ${result.statusText}`}
          {result.durationMs !== null && ` · ${result.durationMs} ms`}
        </span>
      </summary>
      <div className="mt-2">
        {result.errorMessage !== null ? (
          <p className="text-sm text-red-800">{result.errorMessage}</p>
        ) : result.assertions.length === 0 ? (
          <p className="text-xs text-slate-400">This request has no assertions.</p>
        ) : (
          <AssertionResults results={result.assertions} />
        )}
      </div>
    </details>
  );
}

function Comparison({ base, target }: { base: Run; target: Run }) {
  const { entries, counts } = compareRuns(base, target);
  const visible = entries.filter((entry) => entry.change !== 'same');
  return (
    <section aria-label="Run comparison" className="space-y-2">
      <p className="text-sm text-slate-700">
        Compared with {formatDate(base.startedAt)}: {counts.regression} regressions, {counts.fixed}{' '}
        fixed, {counts.changed} changed, {counts.added} new, {counts.removed} removed.
      </p>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-400">No differences in outcomes.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="py-1.5 font-medium">Change</th>
              <th className="py-1.5 font-medium">Request</th>
              <th className="py-1.5 font-medium">Before</th>
              <th className="py-1.5 font-medium">Now</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry, index) => (
              // Names are not unique; the list is rebuilt whole, so the position is stable.
              <tr key={index} className="border-b border-slate-100 align-top">
                <td className="py-1.5 pr-2">
                  <span className={`rounded px-1.5 py-0.5 ${CHANGE_STYLES[entry.change]}`}>
                    {CHANGE_LABELS[entry.change]}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-slate-800">
                  {entry.name}
                  {entry.assertionChanges.map((a) => (
                    <p key={a.name} className="font-mono text-slate-500">
                      {a.name}: {show(a.base)} → {show(a.target)}
                    </p>
                  ))}
                </td>
                <td className="py-1.5 pr-2 font-mono">
                  {show(entry.baseOutcome)} / {show(entry.baseStatus)}
                </td>
                <td className="py-1.5 font-mono">
                  {show(entry.targetOutcome)} / {show(entry.targetStatus)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RunDetails({ run, runs }: { run: Run; runs: Runs }) {
  // Only older runs of the same collection make a meaningful baseline.
  const candidates = runs.history.filter(
    (other) =>
      other.id !== run.id &&
      other.collectionId === run.collectionId &&
      other.startedAt < run.startedAt,
  );

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{run.collectionName}</h2>
          <p className="text-xs text-slate-500">
            {formatDate(run.startedAt)} · {run.durationMs} ms · Environment:{' '}
            {run.environmentName ?? 'none'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={reportUrl(run.id, 'html')} download className={buttonClassName()}>
            Download HTML
          </a>
          <a href={reportUrl(run.id, 'json')} download className={buttonClassName()}>
            Download JSON
          </a>
          <Button
            variant="ghost"
            danger
            onClick={() => {
              if (window.confirm('Delete this run from the history?')) void runs.remove(run.id);
            }}
          >
            Delete
          </Button>
        </div>
      </header>

      <p
        aria-label="Run summary"
        className={`rounded-md px-2 py-1 text-sm font-medium ${
          run.passed === run.total ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
        }`}
      >
        {run.passed} of {run.total} passed
        {run.failed > 0 && ` · ${run.failed} failed`}
        {run.errors > 0 && ` · ${run.errors} error${run.errors === 1 ? '' : 's'}`}
      </p>

      {candidates.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Compare with
          <select
            aria-label="Compare with"
            value={runs.compareBase?.id ?? ''}
            onChange={(e) => void runs.compareWith(e.target.value || null)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">No comparison</option>
            {candidates.map((other) => (
              <option key={other.id} value={other.id}>
                {formatDate(other.startedAt)} ({other.passed}/{other.total})
              </option>
            ))}
          </select>
        </label>
      )}
      {runs.compareBase && <Comparison base={runs.compareBase} target={run} />}

      <div className="space-y-2">
        {run.results.map((result) => (
          <ResultRow key={result.savedRequestId} result={result} />
        ))}
      </div>
    </div>
  );
}

/** Main area of the "Test runs" view: history on the left, the selected run on the right. */
export function TestRunsView({ runs }: { runs: Runs }) {
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <nav
        aria-label="Run history"
        className="w-64 shrink-0 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2"
      >
        {runs.history.length === 0 && (
          <p className="p-2 text-xs text-slate-400">
            No runs yet. Hover over a collection on the left and press ▶.
          </p>
        )}
        {runs.history.map((summary) => (
          <button
            key={summary.id}
            type="button"
            onClick={() => void runs.open(summary.id)}
            aria-current={summary.id === runs.selected?.id ? 'true' : undefined}
            className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
              summary.id === runs.selected?.id
                ? 'bg-indigo-50 text-indigo-900'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{summary.collectionName}</span>
              <span
                className={summary.passed === summary.total ? 'text-emerald-700' : 'text-red-700'}
              >
                {summary.passed}/{summary.total}
              </span>
            </span>
            <span className="block text-slate-400">{formatDate(summary.startedAt)}</span>
          </button>
        ))}
      </nav>

      <section
        aria-label="Run details"
        className="min-w-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4"
      >
        {runs.running !== null && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600"
            />
            Running “{runs.running}”…
            <Button variant="ghost" onClick={runs.cancel}>
              Cancel
            </Button>
          </div>
        )}
        {runs.error && (
          <p role="alert" className="mb-3 rounded-md bg-red-50 px-2 py-1 text-sm text-red-800">
            {runs.error}
          </p>
        )}
        {runs.selected ? (
          <RunDetails key={runs.selected.id} run={runs.selected} runs={runs} />
        ) : (
          runs.running === null && (
            <p className="py-12 text-center text-sm text-slate-400">
              Select a run from the history, or run a collection.
            </p>
          )
        )}
      </section>
    </div>
  );
}
