import { describe, expect, it } from 'vitest';
import type { Run, RunRequestResult } from '../schemas/runs';
import { compareRuns } from './compareRuns';

function result(id: string, overrides: Partial<RunRequestResult> = {}): RunRequestResult {
  return {
    savedRequestId: id,
    name: id,
    method: 'GET',
    url: 'http://x.io',
    outcome: 'pass',
    status: 200,
    statusText: 'OK',
    durationMs: 10,
    errorCode: null,
    errorMessage: null,
    assertions: [],
    ...overrides,
  };
}

function run(results: RunRequestResult[]): Run {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    collectionId: null,
    collectionName: 'c',
    environmentName: null,
    startedAt: '',
    durationMs: 1,
    total: results.length,
    passed: 0,
    failed: 0,
    errors: 0,
    results,
  };
}

const assertion = (name: string, outcome: 'pass' | 'fail') => ({
  assertionId: name,
  name,
  outcome,
  expected: '',
  actual: '',
  message: '',
});

const compareOne = (before: Partial<RunRequestResult>, after: Partial<RunRequestResult>) =>
  compareRuns(run([result('a', before)]), run([result('a', after)])).entries[0];

describe('compareRuns', () => {
  it.each<[string, Partial<RunRequestResult>, Partial<RunRequestResult>, string]>([
    ['pass → fail', {}, { outcome: 'fail' }, 'regression'],
    ['pass → error', {}, { outcome: 'error', status: null }, 'regression'],
    ['fail → pass', { outcome: 'fail' }, {}, 'fixed'],
    ['error → pass', { outcome: 'error', status: null }, {}, 'fixed'],
    ['fail → error', { outcome: 'fail' }, { outcome: 'error' }, 'changed'],
    ['same outcome, other status', { status: 200 }, { status: 201 }, 'changed'],
    ['nothing changed', {}, {}, 'same'],
    ['only the timing changed', { durationMs: 5 }, { durationMs: 500 }, 'same'],
  ])('%s', (_what, before, after, change) => {
    expect(compareOne(before, after)?.change).toBe(change);
  });

  it('lists assertions whose outcome changed', () => {
    const entry = compareOne(
      { outcome: 'fail', assertions: [assertion('a', 'fail'), assertion('same', 'pass')] },
      { outcome: 'fail', assertions: [assertion('a', 'pass'), assertion('same', 'pass')] },
    );

    expect(entry?.change).toBe('changed');
    expect(entry?.assertionChanges).toEqual([{ name: 'a', base: 'fail', target: 'pass' }]);
  });

  it('reports added and removed requests', () => {
    const { entries, counts } = compareRuns(run([result('old')]), run([result('new')]));

    expect(counts).toMatchObject({ added: 1, removed: 1 });
    expect(entries.find((e) => e.name === 'new')).toMatchObject({
      change: 'added',
      baseOutcome: null,
    });
    expect(entries.find((e) => e.name === 'old')).toMatchObject({
      change: 'removed',
      targetOutcome: null,
    });
  });

  // Matching is by id, so renaming a request does not look like remove + add.
  it('follows a renamed request and shows its new name', () => {
    const { entries } = compareRuns(
      run([result('id', { name: 'Old' })]),
      run([result('id', { name: 'New', outcome: 'fail' })]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'New', change: 'regression' });
  });

  it('puts the most important changes first', () => {
    const before = run([result('a'), result('b', { outcome: 'fail' }), result('c'), result('d')]);
    const after = run([
      result('a'),
      result('b'),
      result('c', { outcome: 'fail' }),
      result('d', { status: 201 }),
    ]);

    expect(compareRuns(before, after).entries.map((e) => e.change)).toEqual([
      'regression',
      'fixed',
      'changed',
      'same',
    ]);
  });
});
