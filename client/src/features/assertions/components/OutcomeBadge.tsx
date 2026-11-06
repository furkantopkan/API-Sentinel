import type { AssertionOutcome } from '@api-sentinel/shared';

const STYLES: Record<AssertionOutcome, string> = {
  pass: 'bg-emerald-100 text-emerald-800',
  fail: 'bg-red-100 text-red-800',
  error: 'bg-amber-100 text-amber-800',
};

/** PASS / FAIL / ERROR. ERROR = the assertion itself is wrong, not the API. */
export function OutcomeBadge({ outcome }: { outcome: AssertionOutcome }) {
  return (
    <span
      data-testid="assertion-outcome"
      className={`inline-block w-14 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold ${STYLES[outcome]}`}
    >
      {outcome.toUpperCase()}
    </span>
  );
}
