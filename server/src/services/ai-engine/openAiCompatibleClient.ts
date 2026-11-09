import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import type { AiClient, AiCompletion } from './aiClient';

/**
 * Client for services that speak the common "chat completions" protocol.
 * Gemini and Ollama both offer it, so one small client (plain fetch, no extra
 * package) covers a free cloud option and a free, fully local option.
 */
export interface OpenAiCompatibleOptions {
  /** Shown in error messages, e.g. "Gemini". */
  label: string;
  baseUrl: string;
  /** Empty for local servers that need no key. */
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

/** A plain JSON schema of the expected answer; `$schema` is rejected by some services. */
function jsonSchemaFor(schema: z.ZodType<unknown>): Record<string, unknown> {
  const jsonSchema = { ...z.toJSONSchema(schema) } as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** Status codes to our error codes. Messages never contain the key or the prompt. */
function errorForStatus(status: number, label: string): AppError {
  if (status === 401 || status === 403) {
    return new AppError('AI_NOT_CONFIGURED', `${label} rejected the API key. Check .env.`, 503);
  }
  if (status === 429) {
    return new AppError(
      'AI_RATE_LIMITED',
      `${label} rate limit or free quota reached. Try again later.`,
      429,
    );
  }
  if (status === 404) {
    return new AppError(
      'AI_UNAVAILABLE',
      `${label} does not know this model (check AI_MODEL).`,
      502,
    );
  }
  if (status === 400) {
    return new AppError('AI_UNAVAILABLE', `${label} rejected the request.`, 502);
  }
  return new AppError('AI_UNAVAILABLE', `${label} is not available right now.`, 502);
}

export function createOpenAiCompatibleClient(options: OpenAiCompatibleOptions): AiClient {
  const { label, baseUrl, apiKey, model, timeoutMs, fetchImpl = fetch } = options;

  return {
    model,
    isMock: false,
    async complete<T>({ system, prompt, schema, signal }: AiCompletion<T>): Promise<T> {
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey === '' ? {} : { Authorization: `Bearer ${apiKey}` }),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'answer', schema: jsonSchemaFor(schema) },
            },
          }),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        if (signal?.aborted) throw error; // cancelled by the caller
        if (timeout.aborted) {
          throw new AppError('AI_TIMEOUT', `${label} did not answer in time.`, 504);
        }
        throw new AppError(
          'AI_UNAVAILABLE',
          `Could not reach ${label}. Is it running and reachable?`,
          502,
        );
      }

      if (!response.ok) throw errorForStatus(response.status, label);

      const parsed = completionSchema.safeParse(await response.json().catch(() => null));
      const invalid = new AppError(
        'AI_INVALID_OUTPUT',
        'The AI answer did not match the expected format.',
        502,
      );
      if (!parsed.success) throw invalid;
      const choice = parsed.data.choices[0];
      if (choice?.finish_reason === 'length') {
        throw new AppError('AI_INVALID_OUTPUT', 'The AI answer was too long and got cut off.', 502);
      }
      if (typeof choice?.message.content !== 'string') throw invalid;

      let json: unknown;
      try {
        json = JSON.parse(choice.message.content);
      } catch {
        throw invalid;
      }
      // A ZodError here becomes AI_INVALID_OUTPUT in the AI service.
      return schema.parse(json);
    },
  };
}
