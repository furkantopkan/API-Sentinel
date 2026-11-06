import type {
  AnalysisResponse,
  ExecuteRequest,
  ExecutedResponse,
  TestCase,
  TestCasesResponse,
} from '@api-sentinel/shared';
import { useCallback, useState } from 'react';
import { analyzeResponse, generateTestCases } from '../../../services/apiClient';
import { toAiRequestContext, toAiResponseContext } from '../lib/buildAiContext';
import { useAiAction } from './useAiAction';

export interface EditableTestCase {
  /** Stable id so each card keeps its own UI state when another card is removed. */
  id: string;
  testCase: TestCase;
}

/**
 * All AI state, kept in App (above the response tabs).
 *
 * The AI tab is unmounted when another response tab is shown; state inside
 * it would be lost on every tab switch. Living here, it survives:
 * - test cases stay until the user generates new ones (they describe the endpoint);
 * - an analysis belongs to one response: it is only shown for the response
 *   it was made for (`responseId`), so a new Send hides it automatically.
 */
export function useAiAssistant(
  request: ExecuteRequest | null,
  response: ExecutedResponse | null,
  responseId: number | null,
) {
  const [description, setDescription] = useState('');
  const [testCases, setTestCases] = useState<EditableTestCase[] | null>(null);
  const [analysis, setAnalysis] = useState<{ data: AnalysisResponse; responseId: number } | null>(
    null,
  );

  const context = useCallback(() => {
    if (!request || !response) throw new Error('No response to send to the AI yet.');
    return {
      request: toAiRequestContext(request),
      response: toAiResponseContext(response),
      description,
    };
  }, [request, response, description]);

  const generate = useAiAction(
    useCallback((signal: AbortSignal) => generateTestCases(context(), signal), [context]),
    useCallback((data: TestCasesResponse) => {
      setTestCases(
        data.result.testCases.map((testCase) => ({ id: crypto.randomUUID(), testCase })),
      );
    }, []),
  );

  const analyze = useAiAction(
    useCallback((signal: AbortSignal) => analyzeResponse(context(), signal), [context]),
    useCallback(
      (data: AnalysisResponse) => {
        if (responseId !== null) setAnalysis({ data, responseId });
      },
      [responseId],
    ),
  );

  const updateTestCase = useCallback((id: string, testCase: TestCase) => {
    setTestCases((list) => list && list.map((t) => (t.id === id ? { id, testCase } : t)));
  }, []);

  const removeTestCase = useCallback((id: string) => {
    setTestCases((list) => list && list.filter((t) => t.id !== id));
  }, []);

  const generateMeta = generate.state.status === 'success' ? generate.state.data.meta : null;

  return {
    description,
    setDescription,
    testCases,
    testCasesMeta: generateMeta,
    updateTestCase,
    removeTestCase,
    generateState: generate.state,
    runGenerate: generate.run,
    // Analysis of an earlier response is hidden, not shown as if it were current.
    analysis: analysis && analysis.responseId === responseId ? analysis.data : null,
    analyzeState: analyze.state,
    runAnalyze: analyze.run,
    cancel: () => {
      generate.cancel();
      analyze.cancel();
    },
  };
}

export type AiAssistant = ReturnType<typeof useAiAssistant>;
