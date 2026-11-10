import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { RecordedEntry } from '@api-sentinel/shared';
import type { z } from 'zod';
import type { AiConfig } from '../../config/env';
import { AppError } from '../../errors/AppError';

/**
 * The one thing the AI service needs from a model: "answer this prompt with
 * JSON matching this schema". Hiding the provider behind this interface lets
 * tests and the "mock" mode run without network, key or cost.
 */
export interface AiClient {
  readonly model: string;
  readonly isMock: boolean;
  complete<T>(request: AiCompletion<T>): Promise<T>;
}

export interface AiCompletion<T> {
  /** Which feature is asking (used by the mock and for logging). */
  task: 'testCases' | 'analysis' | 'collection';
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  /** Already-redacted recording; only the mock reads it, to answer from real entries. */
  recording?: readonly RecordedEntry[];
  /** Try again once when the answer is cut off (default). Off when the caller has a fallback. */
  retryCutOff?: boolean;
}

/**
 * Real client: Claude through the official SDK.
 *
 * - Structured outputs (`output_config.format`) make the model return JSON for
 *   our Zod schema; the SDK parses it into `parsed_output`.
 * - `fallbacks: "default"`: if a safety classifier declines, the API retries
 *   on a recommended fallback model inside the same call.
 * - The SDK's typed errors are mapped to our error codes; messages never
 *   contain the key or the prompt.
 */
export function createAnthropicAiClient(config: AiConfig): AiClient {
  const client = new Anthropic({
    apiKey: config.apiKey, // explicit: never fall back to other credentials on this machine
    timeout: config.timeoutMs,
    maxRetries: 1, // one retry on 429/5xx/network; more would multiply cost and wait time
  });

  return {
    model: config.model,
    isMock: false,
    async complete<T>({ system, prompt, schema, signal }: AiCompletion<T>): Promise<T> {
      let message;
      try {
        message = await client.beta.messages.parse(
          {
            model: config.model,
            max_tokens: 16_000,
            output_config: { effort: config.effort, format: betaZodOutputFormat(schema) },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system,
            messages: [{ role: 'user', content: prompt }],
          },
          { signal },
        );
      } catch (error) {
        throw mapAnthropicError(error);
      }

      if (message.stop_reason === 'refusal') {
        throw new AppError(
          'AI_REFUSED',
          'The AI model declined this request. Try a different description or request.',
          422,
        );
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AppError('AI_INVALID_OUTPUT', 'The AI answer was too long and got cut off.', 502);
      }
      if (message.parsed_output === null) {
        throw new AppError(
          'AI_INVALID_OUTPUT',
          'The AI answer did not match the expected format.',
          502,
        );
      }
      return message.parsed_output;
    },
  };
}

/** Most specific first; anything unknown is re-thrown and becomes INTERNAL_ERROR. */
export function mapAnthropicError(error: unknown): unknown {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return error; // caller cancelled
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError('AI_TIMEOUT', 'The AI service did not answer in time.', 504);
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AppError(
      'AI_NOT_CONFIGURED',
      'The AI service rejected the API key. Check ANTHROPIC_API_KEY in .env.',
      503,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(
      'AI_RATE_LIMITED',
      'The AI service is rate limiting requests. Try again shortly.',
      429,
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AppError(
      'AI_UNAVAILABLE',
      'The AI service rejected the request (check AI_MODEL).',
      502,
    );
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.APIError) {
    return new AppError('AI_UNAVAILABLE', 'The AI service is not reachable right now.', 502);
  }
  return error;
}
