import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../src/errors/AppError';
import { createOllamaClient } from '../../src/services/ai-engine/ollamaClient';

const schema = z.object({ answer: z.string() });

function client(reply: () => Promise<Response>, timeoutMs = 1000) {
  const sent: Record<string, unknown>[] = [];
  const urls: string[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    urls.push(url);
    sent.push(JSON.parse(init.body as string) as Record<string, unknown>);
    return reply();
  }) as typeof fetch;
  const ai = createOllamaClient({
    baseUrl: 'http://ollama.test/',
    model: 'test-model',
    timeoutMs,
    fetchImpl,
  });
  const ask = () => ai.complete({ task: 'analysis', system: 'S', prompt: 'P', schema });
  return { ask, sent, urls };
}

const chat = (content: string, extra: object = {}) =>
  Promise.resolve(Response.json({ message: { content }, ...extra }));

const failsWith = async (promise: Promise<unknown>, code: string) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
};

describe('createOllamaClient', () => {
  it('returns the validated answer', async () => {
    const { ask, urls } = client(() => chat('{"answer":"ok"}'));
    await expect(ask()).resolves.toEqual({ answer: 'ok' });
    expect(urls).toEqual(['http://ollama.test/api/chat']);
  });

  // Reasoning made answers about five times slower on a real recording.
  it('asks for a direct answer in the required format, with room for a recording', async () => {
    const { ask, sent } = client(() => chat('{"answer":"ok"}'));
    await ask();
    expect(sent[0]).toMatchObject({
      model: 'test-model',
      stream: false,
      think: false,
      options: { num_ctx: 16384, num_predict: 6144 },
      format: { type: 'object', required: ['answer'] },
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'P' },
      ],
    });
    expect(sent[0]?.format).not.toHaveProperty('$schema');
  });

  it('explains how to install a missing model', async () => {
    const { ask } = client(() => Promise.resolve(new Response('', { status: 404 })));
    await expect(ask()).rejects.toThrow('ollama pull test-model');
  });

  it('reports other Ollama failures as unavailable', async () => {
    const { ask } = client(() => Promise.resolve(new Response('', { status: 500 })));
    await failsWith(ask(), 'AI_UNAVAILABLE');
  });

  it('reports that Ollama is not running', async () => {
    const { ask } = client(() => Promise.reject(new TypeError('fetch failed')));
    await failsWith(ask(), 'AI_UNAVAILABLE');
  });

  it('reports a timeout when the model takes too long', async () => {
    const { ask } = client(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('aborted'));
          }, 30);
        }),
      5,
    );
    await failsWith(ask(), 'AI_TIMEOUT');
  });

  // A runaway answer must end the wait early instead of running into the timeout.
  it('tries once more when an answer is cut off', async () => {
    const replies = [
      () => chat('{"answer":"o', { done_reason: 'length', eval_count: 4096 }),
      () => chat('{"answer":"ok"}', { done_reason: 'stop' }),
    ];
    const { ask, sent } = client(() => replies[sent.length - 1]!());
    await expect(ask()).resolves.toEqual({ answer: 'ok' });
    expect(sent).toHaveLength(2);
  });

  it('gives up after a second cut-off answer and suggests what to do', async () => {
    const { ask, sent } = client(() => chat('{"answer":"o', { done_reason: 'length' }));
    await failsWith(ask(), 'AI_INVALID_OUTPUT');
    await expect(ask()).rejects.toThrow('record a shorter flow');
    expect(sent).toHaveLength(4);
  });

  it('does not try again when the caller has a fallback', async () => {
    const sent: unknown[] = [];
    const ai = createOllamaClient({
      baseUrl: 'http://ollama.test',
      model: 'm',
      timeoutMs: 1000,
      fetchImpl: ((_url: string, init: RequestInit) => {
        sent.push(init.body);
        return chat('{"answer":"o', { done_reason: 'length' });
      }) as typeof fetch,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const asking = ai.complete({
      task: 'collection',
      system: 'S',
      prompt: 'P',
      schema,
      retryCutOff: false,
    });
    await failsWith(asking, 'AI_INVALID_OUTPUT');
    expect(sent).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not log any part of a cut-off answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ask } = client(() =>
      chat('{"answer":"secret-value', { done_reason: 'length', eval_count: 4096 }),
    );
    await ask().catch(() => undefined);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.flat().join(' ')).toContain('4096');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('secret-value');
    warn.mockRestore();
  });

  it('does not retry an answer that finished normally but is not valid', async () => {
    const { ask, sent } = client(() => chat('not json', { done_reason: 'stop' }));
    await failsWith(ask(), 'AI_INVALID_OUTPUT');
    expect(sent).toHaveLength(1);
  });

  it('rejects an answer that is not JSON', async () => {
    const { ask } = client(() => chat('not json'));
    await failsWith(ask(), 'AI_INVALID_OUTPUT');
  });
});
