import {
  collectionResponseSchema,
  finishRecordingResponseSchema,
  recordingStatusResponseSchema,
  savedRequestResponseSchema,
  type CollectionDraftOutput,
  type HarEntry,
  type RecordedEntry,
} from '@api-sentinel/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { AppConfig } from '../../src/config/env';
import { AppError } from '../../src/errors/AppError';
import type { AiClient, AiCompletion } from '../../src/services/ai-engine/aiClient';
import type { RecordingBrowser } from '../../src/services/recorder/recordingBrowser';

// The model and the browser are fakes: no window, no network, no cost.

function config(host = '127.0.0.1'): AppConfig {
  return {
    port: 0,
    host,
    requestBodyLimit: '1mb',
    version: '9.9.9-test',
    requestEngine: {
      allowlist: new Set(['localhost:4010']),
      defaultTimeoutMs: 1000,
      maxTimeoutMs: 2000,
      maxResponseBytes: 1024,
      maxRedirects: 1,
      userAgent: 'test',
    },
    ai: {
      mode: 'anthropic',
      apiKey: 'unused',
      model: 'fake',
      effort: 'medium',
      timeoutMs: 1000,
      ratePerMinute: 100,
    },
    dbPath: ':memory:',
  };
}

const TRAFFIC: HarEntry[] = [
  {
    _resourceType: 'fetch',
    request: { method: 'GET', url: 'http://localhost:4010/json', headers: [] },
    response: { status: 200, content: { mimeType: 'application/json', text: '{"a":1}' } },
  },
];

function fakeBrowser() {
  const opened: string[] = [];
  const browser: RecordingBrowser = {
    open(url) {
      opened.push(url);
      return Promise.resolve({
        captured: () => TRAFFIC.length,
        close: () => Promise.resolve(TRAFFIC),
      });
    },
  };
  return { browser, opened };
}

function appWith(options: { host?: string; answer?: CollectionDraftOutput; fail?: AppError } = {}) {
  const prompts: string[] = [];
  const requests: AiCompletion<unknown>[] = [];
  const aiClient: AiClient = {
    model: 'fake-model',
    isMock: false,
    complete<T>(req: AiCompletion<T>): Promise<T> {
      prompts.push(`${req.system}\n${req.prompt}`);
      requests.push(req);
      if (options.fail) return Promise.reject(options.fail);
      return Promise.resolve(req.schema.parse(options.answer));
    },
  };
  const { browser, opened } = fakeBrowser();
  const app = createApp(config(options.host), {
    aiClient,
    aiLogger: () => undefined,
    engineLogger: () => undefined,
    recordingBrowser: browser,
  });
  return { app, prompts, opened, requests };
}

describe('/api/recordings', () => {
  it('runs a whole recording', async () => {
    const { app, opened } = appWith();
    const started = await request(app)
      .post('/api/recordings')
      .send({ url: 'http://localhost:4010/' })
      .expect(201);
    expect(recordingStatusResponseSchema.parse(started.body).status.active).toBe(true);
    expect(opened).toEqual(['http://localhost:4010/']);

    const status = await request(app).get('/api/recordings/current').expect(200);
    expect(recordingStatusResponseSchema.parse(status.body).status.captured).toBe(1);

    const finished = await request(app).post('/api/recordings/current/finish').send({}).expect(200);
    expect(finishRecordingResponseSchema.parse(finished.body).entries).toHaveLength(1);
  });

  it('answers 409 for a second recording', async () => {
    const { app } = appWith();
    await request(app).post('/api/recordings').send({ url: 'http://localhost:4010/' }).expect(201);
    const second = await request(app)
      .post('/api/recordings')
      .send({ url: 'http://localhost:4010/' })
      .expect(409);
    expect((second.body as { error: { code: string } }).error.code).toBe('RECORDING_ACTIVE');
  });

  it('cancels', async () => {
    const { app } = appWith();
    await request(app).post('/api/recordings').send({ url: 'http://localhost:4010/' }).expect(201);
    await request(app).delete('/api/recordings/current').expect(200);
    await request(app).post('/api/recordings/current/finish').send({}).expect(404);
  });

  it.each(['file:///c:/windows', 'javascript:alert(1)', 'not a url'])('rejects %s', async (url) => {
    const { app, opened } = appWith();
    await request(app).post('/api/recordings').send({ url }).expect(400);
    expect(opened).toEqual([]);
  });

  it('refuses a private address', async () => {
    const { app, opened } = appWith();
    const answer = await request(app)
      .post('/api/recordings')
      .send({ url: 'http://192.168.1.1/' })
      .expect(400);
    expect((answer.body as { error: { code: string } }).error.code).toBe('BLOCKED_TARGET');
    expect(opened).toEqual([]);
  });

  // DNS rebinding: the page reaches us under its own host name.
  it('ignores requests addressed to another host name', async () => {
    const { app, opened } = appWith();
    await request(app)
      .post('/api/recordings')
      .set('Host', 'evil.example')
      .send({ url: 'http://localhost:4010/' })
      .expect(404);
    expect(opened).toEqual([]);
  });

  // Another website can send text/plain without a CORS preflight, but not JSON.
  it('does not accept a start or finish that is not JSON', async () => {
    const { app, opened } = appWith();
    await request(app)
      .post('/api/recordings')
      .set('Content-Type', 'text/plain')
      .send('{"url":"http://localhost:4010/"}')
      .expect(400);
    expect(opened).toEqual([]);
    await request(app)
      .post('/api/recordings/current/finish')
      .set('Content-Type', 'text/plain')
      .send('{}')
      .expect(400);
  });

  it('is off when the server is reachable from other computers', async () => {
    const { app, opened } = appWith({ host: '0.0.0.0' });
    const status = await request(app).get('/api/recordings/current').expect(200);
    expect(recordingStatusResponseSchema.parse(status.body).status.available).toBe(false);
    await request(app).post('/api/recordings').send({ url: 'http://localhost:4010/' }).expect(503);
    expect(opened).toEqual([]);
  });
});

describe('POST /api/ai/build-collection', () => {
  const entry: RecordedEntry = {
    index: 0,
    method: 'GET',
    url: 'https://a.test/me?api_key=QUERY-SECRET',
    status: 200,
    requestHeaders: [['Authorization', 'Bearer HEADER-SECRET']],
    requestBody: '',
    responseContentType: 'application/json',
    responseSample: '{"token":"BODY-SECRET","id":1}',
  };
  const step = {
    sourceIndex: 0,
    name: 'Me',
    url: '{{baseUrl}}/me',
    headers: [],
    body: '',
    assertions: [],
    captures: [],
  };
  const answer: CollectionDraftOutput = {
    collectionName: 'Flow',
    steps: [step, { ...step, url: 'https://evil.test/me' }],
    variables: [{ key: 'baseUrl', value: 'https://a.test', secret: false }],
    notes: [],
  };

  it('masks secrets before the model sees them and removes invented steps', async () => {
    const { app, prompts } = appWith({ answer });
    const response = await request(app)
      .post('/api/ai/build-collection')
      .send({ goal: 'Check my profile', entries: [entry] })
      .expect(200);

    expect(prompts[0]).toContain('Check my profile');
    for (const secret of ['QUERY-SECRET', 'HEADER-SECRET', 'BODY-SECRET']) {
      expect(prompts[0]).not.toContain(secret);
    }
    const body = response.body as {
      result: { steps: unknown[] };
      meta: { droppedItems: number };
    };
    expect(body.result.steps).toHaveLength(1);
    expect(body.meta.droppedItems).toBe(1);
  });

  it('tells the user when a long recording was reduced', async () => {
    const { app } = appWith({ answer });
    const long = Array.from({ length: 12 }, (_, index) => ({
      ...entry,
      index,
      requestHeaders: [['X-Long', 'v'.repeat(4000)]],
    }));
    const response = await request(app)
      .post('/api/ai/build-collection')
      .send({ goal: 'Check', entries: long })
      .expect(200);
    const { notes } = (response.body as { result: { notes: string[] } }).result;
    expect(notes[0]).toMatch(
      /\d+ background request\(s\) the page made by itself were not sent to it: GET \//,
    );
  });

  // The user should get a usable flow even when the local model fails.
  it.each(['AI_TIMEOUT', 'AI_INVALID_OUTPUT', 'AI_UNAVAILABLE'] as const)(
    'builds the draft from the recording when the AI fails with %s',
    async (code) => {
      const { app, requests } = appWith({ fail: new AppError(code, 'It failed.', 502) });
      const page: RecordedEntry = {
        ...entry,
        index: 1,
        url: 'https://a.test/cart',
        responseContentType: 'text/html',
        responseSample: 'My cart',
      };
      const change: RecordedEntry = {
        ...entry,
        index: 2,
        method: 'POST',
        url: 'https://a.test/cart/add',
      };
      const response = await request(app)
        .post('/api/ai/build-collection')
        .send({ goal: 'Check', entries: [entry, page, change] })
        .expect(200);
      const { result } = response.body as { result: { steps: { url: string }[]; notes: string[] } };
      expect(result.steps.map((s) => s.url)).toEqual(['{{baseUrl}}/cart', '{{baseUrl}}/cart/add']);
      expect(result.notes[0]).toMatch(
        /^The AI could not finish \(It failed\.\) This draft was built straight from your recording/,
      );
      expect(requests[0]?.retryCutOff).toBe(false);
    },
  );

  it('still reports other errors, such as a rate limit', async () => {
    const { app } = appWith({ fail: new AppError('RATE_LIMITED', 'Slow down.', 429) });
    await request(app)
      .post('/api/ai/build-collection')
      .send({ goal: 'Check', entries: [entry] })
      .expect(429);
  });

  it('needs a goal and at least one request', async () => {
    const { app } = appWith({ answer });
    await request(app)
      .post('/api/ai/build-collection')
      .send({ goal: ' ', entries: [entry] })
      .expect(400);
    await request(app)
      .post('/api/ai/build-collection')
      .send({ goal: 'x', entries: [] })
      .expect(400);
  });
});

describe('POST /api/collections/import', () => {
  const requestFor = (name: string, url: string) => ({
    name,
    request: {
      method: 'GET',
      url,
      queryParams: [],
      headers: [],
      auth: { type: 'none' },
      body: '',
      options: { followRedirects: true },
    },
    assertions: [],
    captures: [],
  });

  it('saves the requests in order, with their captures', async () => {
    const { app } = appWith();
    const first = {
      ...requestFor('First', 'https://a.test/1'),
      captures: [{ variable: 'id', path: 'id', secret: false }],
    };
    const created = await request(app)
      .post('/api/collections/import')
      .send({ name: 'Imported', requests: [first, requestFor('Second', 'https://a.test/2')] })
      .expect(201);
    const { collection } = collectionResponseSchema.parse(created.body);
    expect(collection.requests.map((r) => r.name)).toEqual(['First', 'Second']);

    const saved = await request(app)
      .get(`/api/saved-requests/${collection.requests[0]?.id ?? ''}`)
      .expect(200);
    expect(savedRequestResponseSchema.parse(saved.body).savedRequest.captures).toEqual(
      first.captures,
    );
  });

  it('saves nothing when one request is invalid', async () => {
    const { app } = appWith();
    await request(app)
      .post('/api/collections/import')
      .send({
        name: 'Broken',
        requests: [requestFor('Ok', 'https://a.test/1'), { name: 'Bad' }],
      })
      .expect(400);
    const list = await request(app).get('/api/collections').expect(200);
    expect((list.body as { collections: unknown[] }).collections).toEqual([]);
  });
});
