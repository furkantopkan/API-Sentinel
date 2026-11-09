import type { AiMeta, AiStatus, ExecuteRequest, SuggestedAssertion } from '@api-sentinel/shared';
import { useEffect, useState } from 'react';
import { Button } from '../../../components/Button';
import { CopyButton } from '../../../components/CopyButton';
import { fetchAiStatus } from '../../../services/apiClient';
import type { AiActionState } from '../hooks/useAiAction';
import type { AiAssistant } from '../hooks/useAiAssistant';
import { toAiRequestContext } from '../lib/buildAiContext';
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
  /** State from useAiAssistant (kept in App, so it survives tab switches). */
  assistant: AiAssistant;
  onAddAssertion: (suggestion: SuggestedAssertion) => void;
  isAdded: (suggestion: SuggestedAssertion) => boolean;
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
export function AiPanel({ request, assistant, onAddAssertion, isAdded }: AiPanelProps) {
  // Only the availability check lives here: it is cheap to repeat when the tab opens.
  const [aiStatus, setAiStatus] = useState<AiStatus | 'loading' | 'unreachable'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetchAiStatus(controller.signal).then(setAiStatus, () => {
      if (!controller.signal.aborted) setAiStatus('unreachable');
    });
    return () => controller.abort();
  }, []);

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
          Set <code>AI_MODE=auto</code> in <code>.env</code> and restart. AI runs locally and for
          free with Ollama. Everything else in API Sentinel works without AI.
        </p>
      </div>
    );
  }

  const { testCases, analysis } = assistant;
  const generating = assistant.generateState.status === 'loading';
  const analyzing = assistant.analyzeState.status === 'loading';
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
          value={assistant.description}
          onChange={(e) => assistant.setDescription(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="e.g. Returns the current user's profile. Requires a valid token."
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-normal"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={() => void assistant.runGenerate()}
          disabled={generating || analyzing}
        >
          {generating ? 'Generating…' : 'Generate test cases'}
        </Button>
        <Button
          size="md"
          onClick={() => void assistant.runAnalyze()}
          disabled={generating || analyzing}
        >
          {analyzing ? 'Analyzing…' : 'Analyze response'}
        </Button>
        {(generating || analyzing) && (
          <Button variant="ghost" size="md" onClick={assistant.cancel}>
            Cancel
          </Button>
        )}
      </div>

      <ActionError state={assistant.analyzeState} />
      {analysis && (
        <section aria-label="Response analysis" className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Analysis</h3>
          <p className="text-sm text-slate-700">{analysis.result.summary}</p>
          <ul className="space-y-1">
            {analysis.result.observations.map((o, i) => (
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
            suggestions={analysis.result.assertions}
            isAdded={isAdded}
            onAdd={onAddAssertion}
          />
          <MetaNote meta={analysis.meta} />
        </section>
      )}

      <ActionError state={assistant.generateState} />
      {testCases && (
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
              onChange={(updated) => assistant.updateTestCase(id, updated)}
              onRemove={() => assistant.removeTestCase(id)}
              onAddAssertion={onAddAssertion}
              isAdded={isAdded}
            />
          ))}
          {assistant.testCasesMeta && <MetaNote meta={assistant.testCasesMeta} />}
        </section>
      )}
    </div>
  );
}
