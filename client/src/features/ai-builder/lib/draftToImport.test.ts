import type { CollectionDraft, CollectionDraftStep } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { draftToImport, isReadOnly, missingCaptures } from './draftToImport';

function step(url: string, extra: Partial<CollectionDraftStep> = {}): CollectionDraftStep {
  return {
    sourceIndex: 0,
    name: 'Step',
    method: 'GET',
    url,
    headers: [],
    body: '',
    assertions: [],
    captures: [],
    ...extra,
  };
}

const draft = (steps: CollectionDraftStep[], keys: string[] = []): CollectionDraft => ({
  collectionName: 'Flow',
  steps,
  variables: keys.map((key) => ({ key, value: 'v', secret: false })),
  notes: [],
});

const capture = { variable: 'id', path: 'id', secret: false };

describe('isReadOnly', () => {
  it.each([
    ['GET', true],
    ['POST', false],
    ['DELETE', false],
  ] as const)('%s → %s', (method, expected) => {
    expect(isReadOnly(step('u', { method }))).toBe(expected);
  });
});

describe('draftToImport', () => {
  it('saves only the selected steps, renumbered and in order', () => {
    const result = draftToImport(
      draft([step('a', { name: 'A' }), step('b', { name: 'B' }), step('c', { name: 'C' })]),
      'Name',
      new Set([0, 2]),
    );
    expect(result.name).toBe('Name');
    expect(result.requests.map((r) => r.name)).toEqual(['A', 'C']);
  });

  it('gives a nameless step a usable name', () => {
    const result = draftToImport(draft([step('a', { name: '  ' })]), 'N', new Set([0]));
    expect(result.requests[0]?.name).toBe('Step 1');
  });

  it('builds a runnable request and enables its headers', () => {
    const headers = [{ key: 'X-A', value: '1' }];
    const result = draftToImport(
      draft([step('https://a.test', { headers, captures: [capture] })]),
      'N',
      new Set([0]),
    );
    expect(result.requests[0]).toMatchObject({
      request: {
        method: 'GET',
        url: 'https://a.test',
        headers: [{ key: 'X-A', value: '1', enabled: true }],
        auth: { type: 'none' },
      },
      captures: [capture],
    });
  });

  it('keeps valid assertions, with unique ids, and removes invalid ones', () => {
    const result = draftToImport(
      draft([
        step('a', {
          assertions: [
            { kind: 'status', target: '', operator: 'equals', expected: '200' },
            { kind: 'status', target: '', operator: 'isNull', expected: '' },
            { kind: 'jsonPath', target: 'id', operator: 'exists', expected: '' },
          ],
        }),
      ]),
      'N',
      new Set([0]),
    );
    const ids = result.requests[0]?.assertions.map((a) => a.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(result.requests[0]?.assertions.every((a) => a.enabled)).toBe(true);
  });
});

describe('missingCaptures', () => {
  const flow = draft(
    [step('{{baseUrl}}/users', { captures: [capture] }), step('{{baseUrl}}/orders/{{id}}')],
    ['baseUrl'],
  );

  it('is empty when every value is available', () => {
    expect(missingCaptures(flow, new Set([0, 1]))).toEqual([]);
  });

  it('names a value whose capturing step was turned off', () => {
    expect(missingCaptures(flow, new Set([1]))).toEqual(['id']);
  });

  it('looks in the body and headers too', () => {
    const steps = draft([
      step('https://a.test', {
        body: '{"a":"{{ fromBody }}"}',
        headers: [{ key: 'X', value: '{{fromHeader}}' }],
      }),
    ]);
    expect(missingCaptures(steps, new Set([0]))).toEqual(['fromBody', 'fromHeader']);
  });
});
