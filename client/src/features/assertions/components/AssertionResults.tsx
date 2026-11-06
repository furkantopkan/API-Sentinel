import type { AssertionResult } from '@api-sentinel/shared';
import { summarizeResults } from '../lib/summarizeResults';
import { OutcomeBadge } from './OutcomeBadge';

/** "Tests" tab of the response: one row per assertion with expected vs actual. */
export function AssertionResults({ results }: { results: readonly AssertionResult[] }) {
  if (results.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        No enabled assertions. Add them in the request's Assertions tab.
      </p>
    );
  }
  const { total, passed, failed, errors } = summarizeResults(results);
  const allPassed = passed === total;

  return (
    <div className="space-y-2">
      <p
        aria-label="Assertion summary"
        className={`rounded-md px-2 py-1 text-sm font-medium ${
          allPassed ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
        }`}
      >
        {passed} of {total} passed
        {failed > 0 && ` · ${failed} failed`}
        {errors > 0 && ` · ${errors} invalid`}
      </p>
      <table className="w-full text-left text-xs" aria-label="Assertion results">
        <thead className="text-slate-500">
          <tr className="border-b border-slate-200">
            <th className="w-16 py-1.5 font-medium">Result</th>
            <th className="py-1.5 font-medium">Check</th>
            <th className="py-1.5 font-medium">Expected</th>
            <th className="py-1.5 font-medium">Actual</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.assertionId} className="border-b border-slate-100 align-top">
              <td className="py-1.5">
                <OutcomeBadge outcome={result.outcome} />
              </td>
              <td className="py-1.5 pr-2">
                <p className="font-mono break-all text-slate-800">{result.name}</p>
                <p className="text-slate-500">{result.message}</p>
              </td>
              <td className="py-1.5 pr-2 font-mono break-all text-slate-700">{result.expected}</td>
              <td className="py-1.5 font-mono break-all text-slate-700">{result.actual}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
