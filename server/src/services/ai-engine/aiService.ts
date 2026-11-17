import {
  analysisOutputSchema,
  collectionDraftOutputSchema,
  type BuildCollectionRequest,
  type CollectionDraftOutput,
  type RecordedEntry,
  isUserAction,
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

/** When the model fails, the recording alone still gives a usable draft instead of an error. */
const FALLBACK_CODES = new Set(['AI_TIMEOUT', 'AI_INVALID_OUTPUT', 'AI_UNAVAILABLE']);

/** Tells the user, by name, what the AI did not see and what was added for it. */
export function draftNotices(
  omitted: readonly RecordedEntry[],
  addedSteps: number,
  backgroundSteps = 0,
  droppedSteps = 0,
): string[] {
  const notices: string[] = [];
  if (backgroundSteps > 0) {
    notices.push(
      `Left out ${backgroundSteps} step(s) for requests the site sent by itself (not your clicks), as no later step needs a value from them.`,
    );
  }
  const background = omitted.filter((entry) => !isUserAction(entry));
  if (background.length > 0) {
    const names = background.slice(0, 5).map((e) => {
      const url = new URL(e.url);
      const where = `${url.pathname}${url.search}`;
      return `${e.method} ${where.length > 80 ? `${where.slice(0, 79)}…` : where}`;
    });
    const more = background.length > 5 ? ` and ${background.length - 5} more` : '';
    notices.push(
      `To keep the AI fast and within its limit, ${background.length} background request(s) the page made by itself were not sent to it: ${names.join(', ')}${more}.`,
    );
  }
  if (addedSteps > 0) {
    notices.push(
      `${addedSteps} step(s) for pages you opened or changes you made were added straight from the recording, with a status check; review their assertions.`,
    );
  }
  if (droppedSteps > 0) {
    notices.push(
      `${droppedSteps} step(s) the AI wrote could not be sent as written (a variable it did not define, or a masked value). Your own requests among them were rebuilt from the recording; the others were left out.`,
    );
  }
  return notices;
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
      const masked = input.entries.map((entry) => ({
        ...entry,
        url: redactUrl(entry.url),
        requestHeaders: redactHeaders(entry.requestHeaders),
        requestBody: entry.requestBody === '' ? '' : redactBody(entry.requestBody),
        responseSample: entry.responseSample === '' ? '' : redactBody(entry.responseSample),
      }));
      const { entries, omitted } = fitRecording(masked);

      let ai: AiClient;
      let output: CollectionDraftOutput;
      let fallback: string | null = null;
      try {
        ({ ai, output } = await run('collection', (aiClient) =>
          aiClient.complete({
            task: 'collection',
            system: BUILD_COLLECTION_SYSTEM_PROMPT,
            prompt: formatRecording(input.goal, entries),
            schema: collectionDraftOutputSchema,
            signal,
            recording: entries,
            // A second attempt doubles the wait; the recording itself is the better fallback.
            retryCutOff: false,
          }),
        ));
      } catch (error) {
        const usable =
          client !== null &&
          !signal?.aborted &&
          error instanceof AppError &&
          FALLBACK_CODES.has(error.code);
        if (!usable) throw error;
        ai = client;
        output = { collectionName: 'Recorded flow', steps: [], variables: [], notes: [] };
        fallback = `The AI could not finish (${error.message}) This draft was built straight from your recording: every page you opened and every change you made, with status checks. Review it and add assertions as needed.`;
      }

      const { draft, droppedSteps, droppedAssertions, addedSteps, backgroundSteps } = checkDraft(
        output,
        entries,
        new Map(input.entries.map((entry) => [entry.index, entry.responseSample])),
        masked,
      );
      return {
        result: {
          ...draft,
          notes: fallback
            ? [fallback]
            : [...draftNotices(omitted, addedSteps, backgroundSteps, droppedSteps), ...draft.notes],
        },
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
