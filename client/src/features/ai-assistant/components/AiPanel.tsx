import type {
  AiMeta,
  AiStatus,
  ExecuteRequest,
  ExecutedResponse,
  SuggestedAssertion,
  TestCase,
  TestCasesResponse,
} from '@api-sentinel/shared';
import { useCallback, useEffect, useState } from 'react';
import { CopyButton } from '../../../components/CopyButton';
import { analyzeResponse, fetchAiStatus, generateTestCases } from '../../../services/apiClient';
import { useAiAction, type AiActionState } from '../hooks/useAiAction';
import { toAiRequestContext, toAiResponseContext } from '../lib/buildAiContext';
import { testCasesToMarkdown } from '../lib/testCasesToMarkdown';
import { SuggestionList } from './SuggestionList';
import { TestCaseCard } from './TestCaseCard';

const SEVERITY_STYLES = {
  issue: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

interface AiPanelProps {
  request: ExecuteRequest;
  response: ExecutedResponse;
  onAddAssertion: (suggestion: SuggestedAssertion) => void;
}

function MetaNote({ meta }: { meta: AiMeta }) {
  return (
    <p className="text-xs text-slate-400">
      {meta.mock ? 'Mock AI (fixed example output, AI_MODE=mock)' : `Model: ${meta.model}`}
      {meta.droppedAssertions > 0 &&
        ` · ${meta.droppedAssertions} invalid suggested assertion(s) removed by the server`}
      {meta.droppedItems > 0 && ` · ${meta.droppedItems} item(s) over the limit removed`}
    </p>
  );
}

function ActionError({ state }: { state: AiActionState<unknown> }) {
  if (state.status !== 'error') return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-mono text-xs font-semibold text-red-800">{state.error.code}</p>
      <p className="text-red-900">{state.error.message}</p>
    </div>
  );
}

/**
 * AI tab of the response: test case generation and response analysis.
 * Everything here is a suggestion: nothing is added to the assertions or
 * sent anywhere else unless the user clicks.
 */
export function AiPanel({ request, response, onAddAssertion }: AiPanelProps) {
  const [aiStatus, setAiStatus] = useState<AiStatus | 'loading' | 'unreachable'>('loading');
  const [description, setDescription] = useState('');
  // Editable copy of the generated cases; ids keep each card's own state (edit mode,
  // "Added ✓") attached to the right card when another one is removed.
  const [testCases, setTestCases] = useState<{ id: string; testCase: TestCase }[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAiStatus(controller.signal).then(setAiStatus, () => {
      if (!controller.signal.aborted) setAiStatus('unreachable');
    });
    return () => controller.abort();
  }, []);

  const context = useCallback(
    () => ({
      request: toAiRequestContext(request),
      response: toAiResponseContext(response),
      description,
    }),
    [request, response, description],
  );

  const generate = useAiAction(
    useCallback((signal: AbortSignal) => generateTestCases(context(), signal), [context]),
    useCallback((data: TestCasesResponse) => {
      setTestCases(
        data.result.testCases.map((testCase) => ({ id: crypto.randomUUID(), testCase })),
      );
    }, []),
  );
  const analysis = useAiAction(
    useCallback((signal: AbortSignal) => analyzeResponse(context(), signal), [context]),
  );

  const generated = generate.state.status === 'success' ? generate.state.data : null;

  if (aiStatus === 'loading') {
    return <p className="py-6 text-center text-sm text-slate-400">Checking AI availability…</p>;
  }
  if (aiStatus === 'unreachable') {
    return <p className="py-6 text-center text-sm text-slate-400">Could not reach the backend.</p>;
  }
  if (aiStatus.mode === 'off') {
    return (
      <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-700">AI features are not configured</p>
        <p className="text-xs text-slate-500">
          Add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart the server. To try the
          screens without a key, set <code>AI_MODE=mock</code>. Everything else in API Sentinel
          works without AI.
        </p>
      </div>
    );
  }

  const busy = generate.state.status === 'loading' || analysis.state.status === 'loading';
  const endpoint = `${request.method} ${toAiRequestContext(request).url}`;

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
        AI output is a suggestion: review it before relying on it. Secrets such as tokens, cookies
        and passwords are masked before anything is sent to the AI service.
        {aiStatus.mode === 'mock' && ' Mock mode: answers are fixed examples.'}
      </p>

      <label className="block text-xs font-medium text-slate-600">
        Endpoint description (optional)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="e.g. Returns the current user's profile. Requires a valid token."
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-normal"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void generate.run()}
          disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300"
        >
          {generate.state.status === 'loading' ? 'Generating…' : 'Generate test cases'}
        </button>
        <button
          type="button"
          onClick={() => void analysis.run()}
          disabled={busy}
          className="rounded-md border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:text-slate-300"
        >
          {analysis.state.status === 'loading' ? 'Analyzing…' : 'Analyze response'}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              generate.cancel();
              analysis.cancel();
            }}
            className="text-sm text-slate-500 hover:underline"
          >
            Cancel
          </button>
        )}
      </div>

      <ActionError state={analysis.state} />
      {analysis.state.status === 'success' && (
        <section aria-label="Response analysis" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Analysis</h3>
          <p className="text-sm text-slate-700">{analysis.state.data.result.summary}</p>
          <ul className="space-y-1">
            {analysis.state.data.result.observations.map((o, i) => (
              <li
                key={i}
                className={`rounded-md border px-2 py-1 text-xs ${SEVERITY_STYLES[o.severity]}`}
              >
                <span className="font-semibold uppercase">{o.severity}</span> · {o.title}
                <p>{o.detail}</p>
              </li>
            ))}
          </ul>
          <SuggestionList
            suggestions={analysis.state.data.result.assertions}
            onAdd={onAddAssertion}
          />
          <MetaNote meta={analysis.state.data.meta} />
        </section>
      )}

      <ActionError state={generate.state} />
      {generated && testCases && (
        <section aria-label="Generated test cases" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Test cases ({testCases.length})
            </h3>
            <CopyButton
              text={testCasesToMarkdown(
                testCases.map((t) => t.testCase),
                endpoint,
              )}
              label="Copy as Markdown"
            />
          </div>
          {testCases.map(({ id, testCase }, index) => (
            <TestCaseCard
              key={id}
              index={index}
              testCase={testCase}
              onChange={(updated) =>
                setTestCases(
                  (list) => list && list.map((t) => (t.id === id ? { id, testCase: updated } : t)),
                )
              }
              onRemove={() => setTestCases((list) => list && list.filter((t) => t.id !== id))}
              onAddAssertion={onAddAssertion}
            />
          ))}
          <MetaNote meta={generated.meta} />
        </section>
      )}
    </div>
  );
}
