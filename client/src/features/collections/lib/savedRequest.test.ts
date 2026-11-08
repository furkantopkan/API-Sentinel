import type { Assertion, ExecuteRequest } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { fromExecuteRequest } from '../../request-builder/lib/fromExecuteRequest';
import { toExecuteRequest } from '../../request-builder/lib/toExecuteRequest';
import { isDirty, snapshotOf, stableStringify, type OpenRequest } from './savedRequest';

const request: ExecuteRequest = {
  method: 'GET',
  url: 'https://x.io',
  queryParams: [{ key: 'a', value: '1', enabled: true }],
  headers: [],
  auth: { type: 'basic', username: 'u', password: 'p' },
  body: '',
  options: { timeoutMs: 3000, followRedirects: true },
};

const assertion: Assertion = {
  id: 'a1',
  enabled: true,
  kind: 'status',
  target: '',
  operator: 'equals',
  expected: '200',
};

const opened = (snapshot: string): OpenRequest => ({
  id: 'r',
  name: 'R',
  collectionId: 'c',
  snapshot,
});

describe('stableStringify', () => {
  it('gives the same text whatever the key order, at any depth', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } })).toBe(
      stableStringify({ a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 }),
    );
  });

  it('keeps array order significant', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});

describe('isDirty', () => {
  const snapshot = snapshotOf(request, [assertion]);

  it('is false for a new request that was never saved', () => {
    expect(isDirty(null, request, [assertion])).toBe(false);
  });

  it('is false when the content equals the snapshot', () => {
    expect(isDirty(opened(snapshot), request, [assertion])).toBe(false);
  });

  // The server returns fields in schema order, the UI builds them in its own order.
  it('ignores the order of object keys', () => {
    const reordered = {
      expected: '200',
      operator: 'equals',
      target: '',
      kind: 'status',
      enabled: true,
      id: 'a1',
    };

    expect(isDirty(opened(snapshot), request, [reordered as Assertion])).toBe(false);
  });

  it.each<[string, ExecuteRequest, Assertion[]]>([
    ['url', { ...request, url: 'https://y.io' }, [assertion]],
    ['auth', { ...request, auth: { type: 'none' } }, [assertion]],
    ['options', { ...request, options: { timeoutMs: 1, followRedirects: true } }, [assertion]],
    ['assertion value', request, [{ ...assertion, expected: '201' }]],
    ['removed assertion', request, []],
  ])('is true when the %s changes', (_what, changed, assertions) => {
    expect(isDirty(opened(snapshot), changed, assertions)).toBe(true);
  });

  // Opening a saved request must not immediately look "modified".
  it('is false right after a round trip through the editor draft', () => {
    let n = 0;
    const draft = fromExecuteRequest(request, () => `row-${++n}`);

    expect(isDirty(opened(snapshot), toExecuteRequest(draft), [assertion])).toBe(false);
  });
});

describe('fromExecuteRequest', () => {
  it('gives every row a fresh UI id', () => {
    let n = 0;
    const draft = fromExecuteRequest(request, () => `row-${++n}`);

    expect(draft.queryParams).toEqual([{ id: 'row-1', key: 'a', value: '1', enabled: true }]);
  });

  it('falls back to the default timeout when none is stored', () => {
    const draft = fromExecuteRequest(
      { ...request, options: { followRedirects: false } },
      () => 'x',
    );

    expect(draft.options).toEqual({ timeoutMs: 15_000, followRedirects: false });
  });
});
