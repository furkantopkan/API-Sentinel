import { useReducer, useState, type FormEvent } from 'react';
import { Tabs, type TabItem } from '../../../components/Tabs';
import { buildFinalUrl } from '../lib/buildFinalUrl';
import { maskDraftSecrets } from '../lib/maskDraftSecrets';
import { validateDraft } from '../lib/validateDraft';
import { initialRequestDraft, requestDraftReducer } from '../state/requestDraftReducer';
import type { KeyValueListName, KeyValueRow } from '../types';
import { AuthPanel } from './AuthPanel';
import { BodyEditor } from './BodyEditor';
import { FinalUrlPreview } from './FinalUrlPreview';
import { KeyValueEditor } from './KeyValueEditor';
import { MethodSelect } from './MethodSelect';

type RequestTabId = 'params' | 'headers' | 'auth' | 'body';

function countEnabled(rows: readonly KeyValueRow[]): number {
  return rows.filter((row) => row.enabled && row.key.trim() !== '').length;
}

export function RequestBuilder() {
  const [draft, dispatch] = useReducer(requestDraftReducer, initialRequestDraft);
  const [activeTab, setActiveTab] = useState<RequestTabId>('params');
  // Errors are only shown after the first Send attempt, then they update live.
  const [hasTriedToSend, setHasTriedToSend] = useState(false);

  // Derived values: recomputed from the draft on every render, never stored.
  const finalUrl = buildFinalUrl(draft.url, draft.queryParams);
  const validation = validateDraft(draft);
  const visibleErrors = hasTriedToSend && !validation.ok ? validation.errors : [];

  const tabs: TabItem<RequestTabId>[] = [
    { id: 'params', label: 'Params', count: countEnabled(draft.queryParams) },
    { id: 'headers', label: 'Headers', count: countEnabled(draft.headers) },
    { id: 'auth', label: 'Auth', count: draft.auth.type === 'none' ? 0 : 1 },
    { id: 'body', label: 'Body', count: draft.body.trim() === '' ? 0 : 1 },
  ];

  const handleSend = (event: FormEvent) => {
    event.preventDefault(); // stop the browser from reloading the page
    setHasTriedToSend(true);
    if (!validation.ok) return;

    // Phase 2 replaces this with a real call to POST /api/requests/execute.
    // Secrets are masked even in the console.
    console.info('[request-builder] Prepared request (sending arrives in Phase 2):', {
      finalUrl: validation.finalUrl,
      draft: maskDraftSecrets(draft),
    });
  };

  const rowHandlers = (list: KeyValueListName) => ({
    onAdd: () => dispatch({ type: 'addRow', list, id: crypto.randomUUID() }),
    onUpdate: (id: string, patch: Partial<Pick<KeyValueRow, 'key' | 'value' | 'enabled'>>) =>
      dispatch({ type: 'updateRow', list, id, patch }),
    onRemove: (id: string) => dispatch({ type: 'removeRow', list, id }),
  });

  return (
    <section aria-label="Request builder" className="space-y-3">
      <form onSubmit={handleSend} className="space-y-1.5">
        <div className="flex">
          <MethodSelect
            value={draft.method}
            onChange={(method) => dispatch({ type: 'setMethod', method })}
          />
          <input
            type="text"
            aria-label="Request URL"
            value={draft.url}
            onChange={(event) => dispatch({ type: 'setUrl', url: event.target.value })}
            placeholder="https://api.example.com/users"
            spellCheck={false}
            className="flex-1 border-y border-slate-300 px-3 py-2 font-mono text-sm focus:z-10 focus:outline-2 focus:outline-indigo-500"
          />
          <button
            type="submit"
            className="rounded-r-md bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
          >
            Send
          </button>
        </div>
        <FinalUrlPreview result={finalUrl} isUrlEmpty={draft.url.trim() === ''} />
      </form>

      {visibleErrors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          {visibleErrors.map((error) => (
            <li key={error.field} className="text-sm text-red-700">
              {error.message}
            </li>
          ))}
        </ul>
      )}

      <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} ariaLabel="Request sections" />

      <div role="tabpanel" className="pt-1">
        {activeTab === 'params' && (
          <KeyValueEditor
            rows={draft.queryParams}
            {...rowHandlers('queryParams')}
            itemName="query parameter"
            keyPlaceholder="page"
            valuePlaceholder="1"
          />
        )}
        {activeTab === 'headers' && (
          <KeyValueEditor
            rows={draft.headers}
            {...rowHandlers('headers')}
            itemName="header"
            keyPlaceholder="X-Request-Id"
            valuePlaceholder="abc-123"
          />
        )}
        {activeTab === 'auth' && (
          <AuthPanel auth={draft.auth} onChange={(auth) => dispatch({ type: 'setAuth', auth })} />
        )}
        {activeTab === 'body' && (
          <BodyEditor
            body={draft.body}
            method={draft.method}
            onChange={(body) => dispatch({ type: 'setBody', body })}
          />
        )}
      </div>
    </section>
  );
}
