import type { Run, RunOutcome, RunRequestResult } from '../schemas/runs';

/**
 * regression: passed before, does not pass now
 * fixed:      did not pass before, passes now
 * changed:    same outcome, but the status code or an assertion result differs
 * added / removed: only in one of the two runs
 * same:       nothing relevant changed (timing alone does not count)
 */
export type RunChange = 'regression' | 'fixed' | 'changed' | 'added' | 'removed' | 'same';

export interface RunComparisonEntry {
  name: string;
  change: RunChange;
  baseOutcome: RunOutcome | null;
  targetOutcome: RunOutcome | null;
  baseStatus: number | null;
  targetStatus: number | null;
  baseDurationMs: number | null;
  targetDurationMs: number | null;
  /** Assertions whose outcome differs, by name. */
  assertionChanges: { name: string; base: string | null; target: string | null }[];
}

export interface RunComparison {
  entries: RunComparisonEntry[];
  counts: Record<RunChange, number>;
}

const ORDER: Record<RunChange, number> = {
  regression: 0,
  fixed: 1,
  changed: 2,
  added: 3,
  removed: 4,
  same: 5,
};

function assertionChanges(
  base: RunRequestResult | undefined,
  target: RunRequestResult | undefined,
) {
  const before = new Map(base?.assertions.map((a) => [a.name, a.outcome]));
  const after = new Map(target?.assertions.map((a) => [a.name, a.outcome]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((name) => before.get(name) !== after.get(name))
    .map((name) => ({ name, base: before.get(name) ?? null, target: after.get(name) ?? null }));
}

function classify(
  base: RunRequestResult | undefined,
  target: RunRequestResult | undefined,
  changedAssertions: number,
): RunChange {
  if (!base) return 'added';
  if (!target) return 'removed';
  if (base.outcome === 'pass' && target.outcome !== 'pass') return 'regression';
  if (base.outcome !== 'pass' && target.outcome === 'pass') return 'fixed';
  return base.outcome !== target.outcome || base.status !== target.status || changedAssertions > 0
    ? 'changed'
    : 'same';
}

/**
 * Compares two runs request by request (matched by saved request id, so a
 * renamed request is still the same request). Most important changes first.
 */
export function compareRuns(base: Run, target: Run): RunComparison {
  const baseById = new Map(base.results.map((r) => [r.savedRequestId, r]));
  const targetById = new Map(target.results.map((r) => [r.savedRequestId, r]));

  const entries = [...new Set([...baseById.keys(), ...targetById.keys()])].map((id) => {
    const before = baseById.get(id);
    const after = targetById.get(id);
    const changes = assertionChanges(before, after);
    return {
      name: after?.name ?? before?.name ?? id,
      change: classify(before, after, changes.length),
      baseOutcome: before?.outcome ?? null,
      targetOutcome: after?.outcome ?? null,
      baseStatus: before?.status ?? null,
      targetStatus: after?.status ?? null,
      baseDurationMs: before?.durationMs ?? null,
      targetDurationMs: after?.durationMs ?? null,
      assertionChanges: changes,
    };
  });
  entries.sort((a, b) => ORDER[a.change] - ORDER[b.change] || a.name.localeCompare(b.name));

  const counts: Record<RunChange, number> = {
    regression: 0,
    fixed: 0,
    changed: 0,
    added: 0,
    removed: 0,
    same: 0,
  };
  for (const entry of entries) counts[entry.change]++;
  return { entries, counts };
}
