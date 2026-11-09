import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import type { AiClient, AiCompletion } from './aiClient';

/**
 * Local AI through Ollama: free, no key, and nothing leaves this computer.
 * Uses Ollama's native API, because only that one can set the context size:
 * with the default, a long recording would be cut off silently.
 */
export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Room for a full recording (about 40 entries) plus the answer, in tokens. */
const CONTEXT_TOKENS = 16_384;

/**
 * Without a limit a model that starts repeating itself writes until the timeout
 * (seen: 10 455 tokens in 4.5 minutes). The longest valid answer measured was 2 180.
 */
const MAX_ANSWER_TOKENS = 4096;

const chatResponseSchema = z.object({
  message: z.object({ content: z.string() }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

type ChatResponse = z.infer<typeof chatResponseSchema>;

function jsonSchemaFor(schema: z.ZodType<unknown>): Record<string, unknown> {
  const jsonSchema = { ...z.toJSONSchema(schema) } as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

const invalidOutput = () =>
  new AppError('AI_INVALID_OUTPUT', 'The AI answer did not match the expected format.', 502);

export function createOllamaClient(options: OllamaOptions): AiClient {
  const { baseUrl, model, timeoutMs, fetchImpl = fetch } = options;

  return {
    model,
    isMock: false,
    async complete<T>({ system, prompt, schema, signal }: AiCompletion<T>): Promise<T> {
      // Shared by both attempts, so a retry cannot extend the time limit.
      const timeout = AbortSignal.timeout(timeoutMs);

      const chat = async (): Promise<ChatResponse> => {
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              stream: false,
              // Measured on a real recording: 79 s with reasoning, 15 s without. The answer
              // is a fixed JSON format that we validate anyway.
              think: false,
              format: jsonSchemaFor(schema),
              options: { num_ctx: CONTEXT_TOKENS, num_predict: MAX_ANSWER_TOKENS },
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt },
              ],
            }),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          });
        } catch (error) {
          if (signal?.aborted) throw error; // cancelled by the caller
          if (timeout.aborted) {
            throw new AppError('AI_TIMEOUT', 'The local AI model did not answer in time.', 504);
          }
          throw new AppError(
            'AI_UNAVAILABLE',
            'Could not reach Ollama. Install it from ollama.com and make sure it is running.',
            502,
          );
        }

        if (response.status === 404) {
          throw new AppError(
            'AI_UNAVAILABLE',
            `The model "${model}" is not installed. Run: ollama pull ${model}`,
            502,
          );
        }
        if (!response.ok) {
          throw new AppError('AI_UNAVAILABLE', 'The local AI model could not answer.', 502);
        }

        const parsed = chatResponseSchema.safeParse(await response.json().catch(() => null));
        if (!parsed.success) throw invalidOutput();
        return parsed.data;
      };

      const wasCutOff = (answer: ChatResponse): boolean => {
        if (answer.done_reason !== 'length') return false;
        // Sizes only: the answer can quote recorded traffic, so it never goes in a log.
        console.warn(
          `[ai] answer cut off: prompt ${answer.prompt_eval_count ?? '?'} tokens, answer ${answer.eval_count ?? '?'} tokens`,
        );
        return true;
      };

      // Runaway answers are occasional, so a second attempt usually finishes normally.
      let answer = await chat();
      if (wasCutOff(answer)) answer = await chat();
      if (wasCutOff(answer)) {
        throw new AppError(
          'AI_INVALID_OUTPUT',
          'The AI could not finish its answer. Try again, or record a shorter flow.',
          502,
        );
      }

      let json: unknown;
      try {
        json = JSON.parse(answer.message.content);
      } catch {
        throw invalidOutput();
      }
      // A ZodError here becomes AI_INVALID_OUTPUT in the AI service.
      return schema.parse(json);
    },
  };
}
