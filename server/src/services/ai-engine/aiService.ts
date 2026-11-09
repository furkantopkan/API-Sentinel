import {
  analysisOutputSchema,
  collectionDraftOutputSchema,
  type BuildCollectionRequest,
  type CollectionDraft,
  assertionSchema,
  testCasesOutputSchema,
  type AiMeta,
  type AiStatus,
  type AnalysisOutput,
  type SuggestedAssertion,
  type TestCasesOutput,
  type generateTestCasesRequestSchema,
  type analyzeResponseRequestSchema,
} from '@api-sentinel/shared';
import { ZodError, type z } from 'zod';
import type { AiConfig } from '../../config/env';
import { AppError } from '../../errors/AppError';
import type { AiClient } from './aiClient';
import {
  ANALYSIS_SYSTEM_PROMPT,
  BUILD_COLLECTION_SYSTEM_PROMPT,
  fitRecording,
  formatRecording,
  TEST_CASES_SYSTEM_PROMPT,
  formatDescription,
  formatRequest,
  formatResponse,
} from './prompts';
import type { RateLimiter } from './rateLimiter';
import { checkDraft } from './collectionDraft';
import { redactBody, redactHeaders, redactRequest, redactResponse, redactUrl } from './redact';

type TestCasesInput = z.output<typeof generateTestCasesRequestSchema>;
type AnalysisInput = z.output<typeof analyzeResponseRequestSchema>;

/** Upper limits on what we pass on to the UI, whatever the model returns. */
export const AI_LIMITS = { testCases: 15, observations: 20, assertionsPerItem: 8 } as const;

export interface AiService {
  status(): AiStatus;
  generateTestCases(
    input: TestCasesInput,
    signal?: AbortSignal,
  ): Promise<AiResult<TestCasesOutput>>;
  analyzeResponse(input: AnalysisInput, signal?: AbortSignal): Promise<AiResult<AnalysisOutput>>;
  buildCollection(
    input: BuildCollectionRequest,
    signal?: AbortSignal,
  ): Promise<AiResult<CollectionDraft>>;
}

export interface AiResult<T> {
  result: T;
  meta: AiMeta;
}

/**
 * Keeps only suggested assertions that our engine can actually run
 * (right operator for the kind, empty target where required). The model is
 * told the rules, but its output is never trusted blindly.
 */
export function filterAssertions(
  suggestions: readonly SuggestedAssertion[],
  max: number,
): { kept: SuggestedAssertion[]; dropped: number } {
  const valid = suggestions.filter(
    (s) => assertionSchema.safeParse({ ...s, id: 'check', enabled: true }).success,
  );
  const kept = valid.slice(0, max);
  return { kept, dropped: suggestions.length - kept.length };
}

export function createAiService(
  config: AiConfig,
  client: AiClient | null,
  limiter: RateLimiter,
  log: (line: string) => void,
): AiService {
  function requireClient(): AiClient {
    if (client === null) {
      throw new AppError(
        'AI_NOT_CONFIGURED',
        'AI features are off. Set AI_MODE=auto in .env (or AI_MODE=mock to try them) and restart the server.',
        503,
      );
    }
    if (!limiter.tryAcquire()) {
      const seconds = Math.ceil(limiter.retryAfterMs() / 1000);
      throw new AppError('RATE_LIMITED', `Too many AI requests. Try again in ${seconds} s.`, 429, {
        retryAfterSeconds: seconds,
      });
    }
    return client;
  }

  /** Runs one AI call with logging that contains no request or response content. */
  async function run<T>(
    task: 'testCases' | 'analysis' | 'collection',
    call: (ai: AiClient) => Promise<T>,
  ) {
    const ai = requireClient();
    const started = performance.now();
    try {
      const output = await call(ai);
      log(`[ai] ${task} -> ok (${Math.round(performance.now() - started)} ms)`);
      return { ai, output };
    } catch (caught) {
      // Output that fails our schema is the model's fault, not a server bug.
      const error =
        caught instanceof ZodError
          ? new AppError(
              'AI_INVALID_OUTPUT',
              'The AI answer did not match the expected format.',
              502,
            )
          : caught;
      log(`[ai] ${task} -> ${error instanceof AppError ? error.code : 'ERROR'}`);
      throw error;
    }
  }

  return {
    status() {
      return { mode: config.mode, model: client ? client.model : null };
    },

    async generateTestCases(input, signal) {
      const prompt = [
        'Write test cases for this endpoint.',
        formatDescription(input.description),
        formatRequest(redactRequest(input.request)),
        input.response
          ? formatResponse(redactResponse(input.response))
          : 'No response is available yet.',
      ]
        .filter((part) => part !== '')
        .join('\n\n');

      const { ai, output } = await run('testCases', (client) =>
        client.complete({
          task: 'testCases',
          system: TEST_CASES_SYSTEM_PROMPT,
          prompt,
          schema: testCasesOutputSchema,
          signal,
        }),
      );

      let droppedAssertions = 0;
      const testCases = output.testCases.slice(0, AI_LIMITS.testCases).map((testCase) => {
        const { kept, dropped } = filterAssertions(
          testCase.assertions,
          AI_LIMITS.assertionsPerItem,
        );
        droppedAssertions += dropped;
        return { ...testCase, assertions: kept };
      });
      return {
        result: { testCases },
        meta: {
          model: ai.model,
          mock: ai.isMock,
          droppedAssertions,
          droppedItems: output.testCases.length - testCases.length,
        },
      };
    },

    async buildCollection(input, signal) {
      // Masked before the model sees it; the masked form is also what the draft is checked against.
      const { entries, omitted } = fitRecording(
        input.entries.map((entry) => ({
          ...entry,
          url: redactUrl(entry.url),
          requestHeaders: redactHeaders(entry.requestHeaders),
          requestBody: entry.requestBody === '' ? '' : redactBody(entry.requestBody),
          responseSample: entry.responseSample === '' ? '' : redactBody(entry.responseSample),
        })),
      );

      const { ai, output } = await run('collection', (client) =>
        client.complete({
          task: 'collection',
          system: BUILD_COLLECTION_SYSTEM_PROMPT,
          prompt: formatRecording(input.goal, entries),
          schema: collectionDraftOutputSchema,
          signal,
          recording: entries,
        }),
      );

      const { draft, droppedSteps, droppedAssertions } = checkDraft(
        output,
        entries,
        new Map(input.entries.map((entry) => [entry.index, entry.responseSample])),
      );
      const notice = `This recording was long: its last ${omitted} request(s) were not sent to the AI.`;
      return {
        result: { ...draft, notes: omitted > 0 ? [notice, ...draft.notes] : draft.notes },
        meta: { model: ai.model, mock: ai.isMock, droppedAssertions, droppedItems: droppedSteps },
      };
    },

    async analyzeResponse(input, signal) {
      const prompt = [
        'Review this response.',
        formatDescription(input.description),
        formatRequest(redactRequest(input.request)),
        formatResponse(redactResponse(input.response)),
      ]
        .filter((part) => part !== '')
        .join('\n\n');

      const { ai, output } = await run('analysis', (client) =>
        client.complete({
          task: 'analysis',
          system: ANALYSIS_SYSTEM_PROMPT,
          prompt,
          schema: analysisOutputSchema,
          signal,
        }),
      );

      const { kept, dropped } = filterAssertions(output.assertions, AI_LIMITS.assertionsPerItem);
      const observations = output.observations.slice(0, AI_LIMITS.observations);
      return {
        result: { ...output, observations, assertions: kept },
        meta: {
          model: ai.model,
          mock: ai.isMock,
          droppedAssertions: dropped,
          droppedItems: output.observations.length - observations.length,
        },
      };
    },
  };
}
