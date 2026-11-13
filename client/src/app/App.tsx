import {
  assertionSchema,
  evaluateAssertions,
  type Assertion,
  type ExecuteRequest,
  type SuggestedAssertion,
} from '@api-sentinel/shared';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { BackendStatusBadge } from '../components/BackendStatusBadge';
import { ThemeToggle } from '../features/theme/components/ThemeToggle';
import { Tabs } from '../components/Tabs';
import { AiPanel } from '../features/ai-assistant/components/AiPanel';
import { useAiAssistant } from '../features/ai-assistant/hooks/useAiAssistant';
import { AssertionEditor } from '../features/assertions/components/AssertionEditor';
import {
  assertionForField,
  assertionsReducer,
  newAssertion,
} from '../features/assertions/state/assertionsReducer';
import { CollectionBuilder } from '../features/ai-builder/components/CollectionBuilder';
import { CollectionsSidebar } from '../features/collections/components/CollectionsSidebar';
import { SaveBar } from '../features/collections/components/SaveBar';
import { useCollectionActions } from '../features/collections/hooks/useCollectionActions';
import { useCollections } from '../features/collections/hooks/useCollections';
import { useWorkspace } from '../features/collections/hooks/useWorkspace';
import { EnvironmentSelector } from '../features/environments/components/EnvironmentSelector';
import { useEnvironments } from '../features/environments/hooks/useEnvironments';
import { editorVariablesFor } from '../features/environments/lib/variableLookups';
import { RequestBuilder } from '../features/request-builder/components/RequestBuilder';
import { TestRunsView } from '../features/runs/components/TestRunsView';
import { useRuns } from '../features/runs/hooks/useRuns';
import { fromExecuteRequest } from '../features/request-builder/lib/fromExecuteRequest';
import { toExecuteRequest } from '../features/request-builder/lib/toExecuteRequest';
import {
  initialRequestDraft,
  requestDraftReducer,
} from '../features/request-builder/state/requestDraftReducer';
import { ResponseViewer } from '../features/response-viewer/components/ResponseViewer';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useSendRequest } from '../hooks/useSendRequest';

export function App() {
  const health = useBackendHealth();
  // The send state lives here because both the builder (Send/Cancel button)
  // and the viewer (response, error, loading) need it.
  const { state, send, cancel } = useSendRequest();
  // The editor content lives here so saved requests can be loaded into it.
  const [draft, dispatchDraft] = useReducer(requestDraftReducer, initialRequestDraft);
  const currentRequest = useMemo(() => toExecuteRequest(draft), [draft]);
  // Assertions are edited in the builder and their results shown in the viewer.
  const [assertions, dispatchAssertions] = useReducer(assertionsReducer, []);

  // --- Environments (Phase 6.2) ---
  const environments = useEnvironments();
  const editorVariables = useMemo(
    () => editorVariablesFor(environments.selected),
    [environments.selected],
  );

  // --- Test runs (Phase 6.3) ---
  const [view, setView] = useState<'requests' | 'runs'>('requests');
  const [building, setBuilding] = useState(false);
  const runs = useRuns(environments.selected?.id);

  // --- Collections (Phase 6.1) ---
  const collections = useCollections();
  const refreshCollections = collections.refresh; // stable (useCallback inside the hook)
  const loadIntoEditor = useCallback((request: ExecuteRequest | null, saved: Assertion[]) => {
    dispatchDraft({
      type: 'load',
      draft: request ? fromExecuteRequest(request, () => crypto.randomUUID()) : initialRequestDraft,
    });
    dispatchAssertions({ type: 'replaceAll', assertions: saved });
  }, []);
  const confirmDiscard = useCallback(
    () => window.confirm('This request has unsaved changes. Discard them?'),
    [],
  );
  const workspace = useWorkspace({
    request: currentRequest,
    assertions,
    loadIntoEditor,
    refreshCollections,
    confirmDiscard,
  });
  const collectionActions = useCollectionActions(refreshCollections, workspace, (message) =>
    window.confirm(message),
  );
  const collectionList = collections.state.status === 'ready' ? collections.state.collections : [];

  // Closing or reloading the tab with unsaved changes asks the browser to confirm.
  useEffect(() => {
    if (!workspace.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [workspace.dirty]);
  // The request that produced the current response (the AI needs both).
  const [lastRequest, setLastRequest] = useState<ExecuteRequest | null>(null);

  /** A suggestion counts as added when an assertion with the same check exists. */
  const isAdded = (s: SuggestedAssertion) =>
    assertions.some(
      (a) =>
        a.kind === s.kind &&
        a.target === s.target &&
        a.operator === s.operator &&
        a.expected === s.expected,
    );

  /** AI suggestions are re-validated before they become real assertions. */
  const addSuggestion = (suggestion: SuggestedAssertion) => {
    const parsed = assertionSchema.safeParse({
      ...suggestion,
      id: crypto.randomUUID(),
      enabled: true,
    });
    if (parsed.success && !isAdded(suggestion)) {
      dispatchAssertions({ type: 'add', assertion: parsed.data });
    }
  };

  // Derived, never stored: re-evaluated whenever the response or an assertion changes,
  // so editing an assertion updates its PASS/FAIL immediately without re-sending.
  const response = state.status === 'success' ? state.response : null;
  const results = useMemo(
    () => (response ? evaluateAssertions(assertions, response) : null),
    [assertions, response],
  );
  // AI state lives here, above the response tabs, so switching tabs does not clear it.
  const assistant = useAiAssistant(
    lastRequest,
    response,
    state.status === 'success' ? state.id : null,
  );

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">API Sentinel</h1>
        <div className="flex items-center gap-4">
          <EnvironmentSelector environments={environments} />
          <BackendStatusBadge health={health} />
          <ThemeToggle />
        </div>
      </header>

      {building && (
        <CollectionBuilder
          environments={environments}
          collectionNames={
            collections.state.status === 'ready'
              ? collections.state.collections.map((c) => c.name)
              : []
          }
          onClose={() => setBuilding(false)}
          onCreated={() => {
            setBuilding(false);
            void refreshCollections();
          }}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <CollectionsSidebar
          state={collections.state}
          activeRequestId={workspace.open?.id ?? null}
          onCreate={collectionActions.create}
          onRename={collectionActions.rename}
          onDelete={collectionActions.remove}
          onOpenRequest={(id) => {
            setView('requests');
            return workspace.openRequest(id);
          }}
          onRun={(collection) => {
            setView('runs');
            void runs.start(collection);
          }}
          onRenameRequest={collectionActions.renameRequest}
          onDeleteRequest={collectionActions.removeRequest}
          onBuildWithAi={() => setBuilding(true)}
          onNewRequest={() => {
            setView('requests');
            workspace.newRequest();
          }}
        />
        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <Tabs
            tabs={[
              { id: 'requests', label: 'Requests' },
              { id: 'runs', label: 'Test runs' },
            ]}
            activeId={view}
            onChange={setView}
            ariaLabel="Views"
          />
          {view === 'runs' && <TestRunsView runs={runs} />}
          {/* Hidden, not removed: the editor keeps its tabs and response while viewing runs. */}
          <div className={view === 'requests' ? 'flex flex-1 flex-col gap-4' : 'hidden'}>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <RequestBuilder
                draft={draft}
                dispatch={dispatchDraft}
                variables={editorVariables}
                toolbar={
                  <SaveBar
                    open={workspace.open}
                    dirty={workspace.dirty}
                    collections={collectionList}
                    onSave={workspace.save}
                    onSaveAs={workspace.saveAs}
                  />
                }
                onSend={(request) => {
                  setLastRequest(request);
                  // Placeholders are resolved on the server, which holds the secret values.
                  void send({ ...request, environmentId: environments.selected?.id });
                }}
                onCancel={cancel}
                isSending={state.status === 'loading'}
                assertionsTab={{
                  count: assertions.filter((a) => a.enabled).length,
                  content: (
                    <AssertionEditor
                      assertions={assertions}
                      results={results}
                      onAdd={() =>
                        dispatchAssertions({
                          type: 'add',
                          assertion: newAssertion(crypto.randomUUID()),
                        })
                      }
                      onUpdate={(id, patch) => dispatchAssertions({ type: 'update', id, patch })}
                      onChangeKind={(id, kind) =>
                        dispatchAssertions({ type: 'changeKind', id, kind })
                      }
                      onRemove={(id) => dispatchAssertions({ type: 'remove', id })}
                    />
                  ),
                }}
              />
            </div>
            <div className="flex-1 rounded-lg border border-slate-200 bg-white p-4">
              <ResponseViewer
                state={state}
                assertionResults={results ?? []}
                onAddAssertion={(path, value) =>
                  dispatchAssertions({
                    type: 'add',
                    assertion: assertionForField(crypto.randomUUID(), path, value),
                  })
                }
                aiTab={
                  response &&
                  lastRequest && (
                    <AiPanel
                      request={lastRequest}
                      assistant={assistant}
                      onAddAssertion={addSuggestion}
                      isAdded={isAdded}
                    />
                  )
                }
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
