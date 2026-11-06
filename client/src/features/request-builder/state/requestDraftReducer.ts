import type { HttpMethod } from '@api-sentinel/shared';
import type {
  AuthConfig,
  KeyValueListName,
  KeyValueRow,
  RequestDraft,
  RequestOptions,
} from '../types';

/** Matches the server default (REQUEST_TIMEOUT_DEFAULT_MS). */
export const DEFAULT_TIMEOUT_MS = 15_000;

export const initialRequestDraft: RequestDraft = {
  method: 'GET',
  url: '',
  queryParams: [],
  headers: [],
  auth: { type: 'none' },
  body: '',
  options: { timeoutMs: DEFAULT_TIMEOUT_MS, followRedirects: true },
};

/** Every change the UI can make to the draft is one of these actions. */
export type RequestDraftAction =
  | { type: 'setMethod'; method: HttpMethod }
  | { type: 'setUrl'; url: string }
  // The id is created by the caller, not here, so the reducer stays pure
  // (same input → same output, which makes it trivial to unit test).
  | { type: 'addRow'; list: KeyValueListName; id: string }
  | {
      type: 'updateRow';
      list: KeyValueListName;
      id: string;
      patch: Partial<Pick<KeyValueRow, 'key' | 'value' | 'enabled'>>;
    }
  | { type: 'removeRow'; list: KeyValueListName; id: string }
  | { type: 'setAuth'; auth: AuthConfig }
  | { type: 'setBody'; body: string }
  | { type: 'setOptions'; patch: Partial<RequestOptions> };

/**
 * Pure function: takes the current draft and an action, returns a NEW draft.
 * It never mutates `state` and has no side effects (no fetch, no random ids,
 * no console). React calls it via useReducer.
 */
export function requestDraftReducer(state: RequestDraft, action: RequestDraftAction): RequestDraft {
  switch (action.type) {
    case 'setMethod':
      return { ...state, method: action.method };

    case 'setUrl':
      return { ...state, url: action.url };

    case 'addRow':
      return {
        ...state,
        [action.list]: [
          ...state[action.list],
          { id: action.id, key: '', value: '', enabled: true },
        ],
      };

    case 'updateRow':
      return {
        ...state,
        [action.list]: state[action.list].map((row) =>
          row.id === action.id ? { ...row, ...action.patch } : row,
        ),
      };

    case 'removeRow':
      return {
        ...state,
        [action.list]: state[action.list].filter((row) => row.id !== action.id),
      };

    case 'setAuth':
      return { ...state, auth: action.auth };

    case 'setBody':
      return { ...state, body: action.body };

    case 'setOptions':
      return { ...state, options: { ...state.options, ...action.patch } };
  }
}
