import { describe, expect, it } from 'vitest';
import type { RequestDraft } from '../types';
import { initialRequestDraft, requestDraftReducer } from './requestDraftReducer';

function draftWithParams(): RequestDraft {
  return {
    ...initialRequestDraft,
    queryParams: [
      { id: 'p1', key: 'page', value: '1', enabled: true },
      { id: 'p2', key: 'q', value: 'abc', enabled: true },
    ],
  };
}

describe('requestDraftReducer', () => {
  it('starts as an empty GET request without auth', () => {
    expect(initialRequestDraft).toEqual({
      method: 'GET',
      url: '',
      queryParams: [],
      headers: [],
      auth: { type: 'none' },
      body: '',
      options: { timeoutMs: 15_000, followRedirects: true },
    });
  });

  it('setOptions merges the patch into the existing options', () => {
    const next = requestDraftReducer(initialRequestDraft, {
      type: 'setOptions',
      patch: { followRedirects: false },
    });

    expect(next.options).toEqual({ timeoutMs: 15_000, followRedirects: false });
  });

  it('setMethod changes only the method', () => {
    const next = requestDraftReducer(initialRequestDraft, { type: 'setMethod', method: 'POST' });

    expect(next).toEqual({ ...initialRequestDraft, method: 'POST' });
  });

  it('setUrl stores the URL exactly as typed', () => {
    const next = requestDraftReducer(initialRequestDraft, {
      type: 'setUrl',
      url: ' https://x.io ',
    });

    expect(next.url).toBe(' https://x.io ');
  });

  it('addRow appends an empty, enabled row with the given id to the chosen list', () => {
    const next = requestDraftReducer(initialRequestDraft, {
      type: 'addRow',
      list: 'headers',
      id: 'h1',
    });

    expect(next.headers).toEqual([{ id: 'h1', key: '', value: '', enabled: true }]);
    expect(next.queryParams).toEqual([]);
  });

  it('updateRow changes only the targeted row and field', () => {
    const next = requestDraftReducer(draftWithParams(), {
      type: 'updateRow',
      list: 'queryParams',
      id: 'p2',
      patch: { enabled: false },
    });

    expect(next.queryParams).toEqual([
      { id: 'p1', key: 'page', value: '1', enabled: true },
      { id: 'p2', key: 'q', value: 'abc', enabled: false },
    ]);
  });

  it('updateRow with an unknown id leaves the rows unchanged', () => {
    const state = draftWithParams();
    const next = requestDraftReducer(state, {
      type: 'updateRow',
      list: 'queryParams',
      id: 'missing',
      patch: { key: 'x' },
    });

    expect(next.queryParams).toEqual(state.queryParams);
  });

  it('removeRow removes only the targeted row', () => {
    const next = requestDraftReducer(draftWithParams(), {
      type: 'removeRow',
      list: 'queryParams',
      id: 'p1',
    });

    expect(next.queryParams.map((row) => row.id)).toEqual(['p2']);
  });

  it('setAuth replaces the auth configuration', () => {
    const next = requestDraftReducer(initialRequestDraft, {
      type: 'setAuth',
      auth: { type: 'bearer', token: 't0k3n' },
    });

    expect(next.auth).toEqual({ type: 'bearer', token: 't0k3n' });
  });

  it('setBody stores the raw body text', () => {
    const next = requestDraftReducer(initialRequestDraft, { type: 'setBody', body: '{"a":1}' });

    expect(next.body).toBe('{"a":1}');
  });

  // React relies on reducers returning NEW objects instead of mutating the old
  // state; otherwise the UI may not re-render.
  it('never mutates the previous state', () => {
    const state = draftWithParams();
    const snapshot = structuredClone(state);

    requestDraftReducer(state, { type: 'setUrl', url: 'https://changed.io' });
    requestDraftReducer(state, { type: 'addRow', list: 'queryParams', id: 'p3' });
    requestDraftReducer(state, {
      type: 'updateRow',
      list: 'queryParams',
      id: 'p1',
      patch: { value: '99' },
    });
    requestDraftReducer(state, { type: 'removeRow', list: 'queryParams', id: 'p2' });

    expect(state).toEqual(snapshot);
  });
});
