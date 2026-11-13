import { createMockTargetApp } from '@api-sentinel/mock-target';
import {
  apiErrorResponseSchema,
  runListResponseSchema,
  runResponseSchema,
  type Run,
} from '@api-sentinel/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig, type AppConfig } from '../../src/config/env';
import { openDatabase, type Database } from '../../src/db/database';
import { createCollectionRepository } from '../../src/repositories/collectionRepository';
import { createEnvironmentRepository } from '../../src/repositories/environmentRepository';
import { createRunRepository } from '../../src/repositories/runRepository';
import { createCollectionService } from '../../src/services/collectionService';
import { createEnvironmentService } from '../../src/services/environmentService';
import { createExecutionService } from '../../src/services/executionService';
import { createRequestEngine } from '../../src/services/request-engine/requestEngine';
import { createRunService } from '../../src/services/runService';

// Real app, in-memory SQLite and the local mock target (no internet).

const SECRET = 'RUN-SECRET-VALUE-1';
let target: Server;
let port: number;
let base: string;
let db: Database;
let config: AppConfig;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  target = createServer(createMockTargetApp());
  await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
  port = (target.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => target.close(resolve));
});

beforeEach(() => {
  db = openDatabase(':memory:');
  const loaded = loadConfig({});
  config = {
    ...loaded,
    dbPath: ':memory:',
    requestEngine: { ...loaded.requestEngine, allowlist: new Set([`127.0.0.1:${port}`]) },
  };
  app = createApp(config, { db, aiClient: null, engineLogger: () => undefined });
});

const STATUS_200 = {
  id: 'a1',
  enabled: true,
  kind: 'status',
  target: '',
  operator: 'equals',
  expected: '200',
};

const httpRequest = (url: string, extra: Record<string, unknown> = {}) => ({
  method: 'GET',
  url,
  queryParams: [],
  headers: [],
  auth: { type: 'none' },
  body: '',
  options: { followRedirects: true },
  ...extra,
});

interface Item {
  name: string;
  url: string;
  assertions?: unknown[];
  extra?: Record<string, unknown>;
}

async function createCollection(items: Item[], name = 'Suite') {
  const created = await request(app).post('/api/collections').send({ name });
  const id = (created.body as { collection: { id: string } }).collection.id;
  for (const item of items) {
    const response = await request(app)
      .post('/api/saved-requests')
      .send({
        collectionId: id,
        name: item.name,
        request: httpRequest(item.url, item.extra),
        assertions: item.assertions ?? [STATUS_200],
      });
    expect(response.status).toBe(201);
  }
  return id;
}

async function createEnvironment() {
  const response = await request(app)
    .post('/api/environments')
    .send({
      name: 'Staging',
      variables: [
        { key: 'baseUrl', value: base, isSecret: false, enabled: true },
        { key: 'token', value: SECRET, isSecret: true, enabled: true },
      ],
    });
  return (response.body as { environment: { id: string } }).environment.id;
}

async function startRun(collectionId: string, environmentId?: string): Promise<Run> {
  const response = await request(app)
    .post(`/api/collections/${collectionId}/runs`)
    .send({ environmentId });
  expect(response.status).toBe(201);
  return runResponseSchema.parse(response.body).run;
}

const errorOf = (body: unknown) => apiErrorResponseSchema.parse(body).error;

const MIXED: Item[] = [
  { name: 'C blocked', url: 'http://10.0.0.1/' },
  { name: 'A ok', url: '' },
  { name: 'B fails', url: '' },
];
const mixed = (): Item[] =>
  MIXED.map((item) => {
    if (item.name === 'A ok') return { ...item, url: `${base}/status/200` };
    if (item.name === 'B fails') return { ...item, url: `${base}/status/500` };
    return item;
  });

describe('running a collection', () => {
  it('runs every request in name order and classifies the outcomes', async () => {
    const run = await startRun(await createCollection(mixed()));

    expect(run).toMatchObject({
      collectionName: 'Suite',
      environmentName: null,
      total: 3,
      passed: 1,
      failed: 1,
      errors: 1,
    });
    expect(run.results.map((r) => [r.name, r.outcome])).toEqual([
      ['A ok', 'pass'],
      ['B fails', 'fail'],
      ['C blocked', 'error'],
    ]);
  });

  it('records status, assertions and, on failure, the error code and message', async () => {
    const run = await startRun(await createCollection(mixed()));
    const [ok, failed, blocked] = run.results;

    expect(ok).toMatchObject({ status: 200, statusText: 'OK', errorCode: null });
    expect(failed?.assertions[0]).toMatchObject({
      outcome: 'fail',
      message: '500 does not equal 200.',
    });
    expect(blocked).toMatchObject({ status: null, errorCode: 'BLOCKED_TARGET', assertions: [] });
    expect(blocked?.errorMessage).toContain('10.0.0.1');
  });

  it("reports a refusal by the site's bot protection as an error that says so", async () => {
    const run = await startRun(
      await createCollection([
        { name: 'Page', url: `${base}/bot-blocked` },
        { name: 'Own 403', url: `${base}/status/403` },
      ]),
    );
    const [own, page] = run.results; // runs in name order

    expect(page).toMatchObject({ outcome: 'error', status: 403, errorCode: 'BLOCKED_BY_SITE' });
    expect(page?.errorMessage).toContain('proxy-reason: blocked malicious bot');
    expect(page?.assertions[0]).toMatchObject({ outcome: 'fail' });
    // An API's own 403 is a normal failed check.
    expect(own).toMatchObject({ outcome: 'fail', errorCode: null, errorMessage: null });
    expect(run).toMatchObject({ failed: 1, errors: 1 });
  });

  it('counts a request without assertions as passed when a response arrives', async () => {
    const run = await startRun(
      await createCollection([{ name: 'x', url: `${base}/json`, assertions: [] }]),
    );

    expect(run.results[0]).toMatchObject({ outcome: 'pass', assertions: [] });
  });

  it('marks a request with an invalid assertion as failed, not passed', async () => {
    const run = await startRun(
      await createCollection([
        {
          name: 'x',
          url: `${base}/json`,
          assertions: [{ ...STATUS_200, expected: 'abc' }],
        },
      ]),
    );

    expect(run.results[0]?.outcome).toBe('fail');
    expect(run.results[0]?.assertions[0]?.outcome).toBe('error');
  });

  it('refuses an empty collection', async () => {
    const id = await createCollection([]);
    const response = await request(app).post(`/api/collections/${id}/runs`).send({});

    expect(response.status).toBe(400);
    expect(errorOf(response.body).message).toContain('no saved requests');
  });

  it.each([
    ['unknown collection', () => crypto.randomUUID(), {}],
    ['malformed collection id', () => 'not-a-uuid', {}],
  ])('returns 404 for %s', async (_what, id, body) => {
    const response = await request(app).post(`/api/collections/${id()}/runs`).send(body);

    expect(response.status).toBe(404);
  });

  it('returns 404 for an unknown environment and stores nothing', async () => {
    const id = await createCollection([{ name: 'x', url: `${base}/json` }]);
    const response = await request(app)
      .post(`/api/collections/${id}/runs`)
      .send({ environmentId: crypto.randomUUID() });

    expect(response.status).toBe(404);
    expect(runListResponseSchema.parse((await request(app).get('/api/runs')).body).runs).toEqual(
      [],
    );
  });

  it('still applies the SSRF guard to values from variables', async () => {
    const created = await request(app)
      .post('/api/environments')
      .send({
        name: 'Evil',
        variables: [
          { key: 'target', value: 'http://169.254.169.254/', isSecret: false, enabled: true },
        ],
      });
    const environmentId = (created.body as { environment: { id: string } }).environment.id;
    const run = await startRun(
      await createCollection([{ name: 'x', url: '{{target}}' }]),
      environmentId,
    );

    expect(run.results[0]).toMatchObject({ outcome: 'error', errorCode: 'BLOCKED_TARGET' });
  });
});

describe('variables and secrets in runs', () => {
  it('resolves variables, keeps the placeholder form and names the environment', async () => {
    const environmentId = await createEnvironment();
    const run = await startRun(
      await createCollection([{ name: 'x', url: '{{baseUrl}}/status/200' }]),
      environmentId,
    );

    expect(run.environmentName).toBe('Staging');
    expect(run.results[0]).toMatchObject({ outcome: 'pass', url: '{{baseUrl}}/status/200' });
  });

  it('reports an undefined variable as an error for that request only', async () => {
    const run = await startRun(
      await createCollection([
        { name: 'a', url: '{{baseUrl}}/json' },
        { name: 'b', url: `${base}/status/200` },
      ]),
    );

    expect(run.results.map((r) => r.outcome)).toEqual(['error', 'pass']);
    expect(run.results[0]).toMatchObject({ errorCode: 'UNKNOWN_VARIABLE' });
  });

  it('never stores a secret, even when the target echoes it', async () => {
    const environmentId = await createEnvironment();
    const run = await startRun(
      await createCollection([
        {
          name: 'echo',
          url: '{{baseUrl}}/echo',
          extra: {
            headers: [{ key: 'X-Token', value: '{{token}}', enabled: true }],
            queryParams: [{ key: 'key', value: '{{token}}', enabled: true }],
          },
          assertions: [
            {
              id: 'a',
              enabled: true,
              kind: 'jsonPath',
              target: 'headers["x-token"]',
              operator: 'exists',
              expected: '',
            },
          ],
        },
      ]),
      environmentId,
    );
    const stored = db.prepare('SELECT * FROM test_runs').all();

    expect(run.results[0]?.assertions[0]?.actual).toContain('[secret]');
    expect(JSON.stringify(stored)).not.toContain(SECRET);

    for (const format of ['html', 'json']) {
      const report = await request(app).get(`/api/runs/${run.id}/report?format=${format}`);
      expect(report.text).not.toContain(SECRET);
    }
  });

  it('does not store response bodies', async () => {
    const run = await startRun(await createCollection([{ name: 'x', url: `${base}/json` }]));
    const stored = db.prepare('SELECT results_json FROM test_runs WHERE id = ?').get(run.id);

    expect(JSON.stringify(stored)).not.toContain('Ada Lovelace');
  });
});

describe('history', () => {
  it('lists runs newest first and returns one with its results', async () => {
    const id = await createCollection([{ name: 'x', url: `${base}/json` }]);
    const first = await startRun(id);
    await new Promise((resolve) => setTimeout(resolve, 5)); // distinct timestamps
    const second = await startRun(id);

    const list = runListResponseSchema.parse((await request(app).get('/api/runs')).body).runs;
    const fetched = runResponseSchema.parse((await request(app).get(`/api/runs/${first.id}`)).body);

    expect(list.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(fetched.run).toEqual(first);
  });

  it('keeps a run readable after its collection is deleted', async () => {
    const id = await createCollection([{ name: 'x', url: `${base}/json` }], 'Gone soon');
    const run = await startRun(id);

    await request(app).delete(`/api/collections/${id}`);
    const fetched = runResponseSchema.parse((await request(app).get(`/api/runs/${run.id}`)).body);

    expect(fetched.run).toMatchObject({ collectionId: null, collectionName: 'Gone soon' });
    expect(fetched.run.results).toEqual(run.results);
  });

  it('prunes only the oldest runs of the same collection', async () => {
    const repo = createRunRepository(db);
    const a = await createCollection([{ name: 'x', url: `${base}/json` }], 'A');
    const b = await createCollection([{ name: 'x', url: `${base}/json` }], 'B');
    const oldest = await startRun(a);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newest = await startRun(a);
    const other = await startRun(b);

    repo.prune(a, 1);

    const left = repo.list(10).map((r) => r.id);
    expect(left).toContain(newest.id);
    expect(left).toContain(other.id);
    expect(left).not.toContain(oldest.id);
  });

  it('deletes a run', async () => {
    const run = await startRun(await createCollection([{ name: 'x', url: `${base}/json` }]));

    expect((await request(app).delete(`/api/runs/${run.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/runs/${run.id}`)).status).toBe(404);
  });

  it.each([
    ['get', '/api/runs/not-a-uuid'],
    ['get', `/api/runs/${crypto.randomUUID()}`],
    ['delete', `/api/runs/${crypto.randomUUID()}`],
    ['get', `/api/runs/${crypto.randomUUID()}/report?format=html`],
  ] as const)('%s %s → 404', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(404);
  });
});

describe('cancelling', () => {
  it('stops at once and stores nothing', async () => {
    const engine = createRequestEngine(config.requestEngine, () => undefined);
    const collections = createCollectionService(createCollectionRepository(db));
    const environments = createEnvironmentService(createEnvironmentRepository(db));
    const repo = createRunRepository(db);
    const service = createRunService({
      repo,
      collections,
      environments,
      execution: createExecutionService(engine, environments),
    });
    const id = await createCollection([
      { name: 'a slow', url: `${base}/delay/3000` },
      { name: 'b next', url: `${base}/json` },
    ]);
    const controller = new AbortController();
    const started = Date.now();
    const pending = service.start(id, undefined, controller.signal);
    setTimeout(() => controller.abort(), 50);

    await expect(pending).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(2000);
    expect(repo.list(10)).toEqual([]);
    await engine.close();
  });
});

describe('reports', () => {
  const XSS = '<img src=x onerror=alert(1)>';

  async function xssRun() {
    return startRun(
      await createCollection(
        [
          {
            name: `Request ${XSS}`,
            url: `${base}/html`,
            assertions: [
              {
                id: 'a',
                enabled: true,
                kind: 'body',
                target: '',
                operator: 'contains',
                expected: XSS,
              },
            ],
          },
        ],
        `Collection ${XSS}`,
      ),
    );
  }

  it('downloads HTML with every value escaped and scripts forbidden', async () => {
    const run = await xssRun();

    const response = await request(app).get(`/api/runs/${run.id}/report?format=html`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="[^"]+\.html"$/);
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.text).not.toContain('<img');
    expect(response.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('downloads the run as JSON', async () => {
    const run = await startRun(await createCollection([{ name: 'x', url: `${base}/json` }]));

    const response = await request(app).get(`/api/runs/${run.id}/report?format=json`);

    expect(response.headers['content-disposition']).toMatch(/\.json"$/);
    expect(JSON.parse(response.text)).toEqual({ generatedBy: 'API Sentinel', run });
  });

  it('rejects an unknown format', async () => {
    const run = await startRun(await createCollection([{ name: 'x', url: `${base}/json` }]));

    const response = await request(app).get(`/api/runs/${run.id}/report?format=pdf`);

    expect(response.status).toBe(400);
    expect(errorOf(response.body).code).toBe('VALIDATION_ERROR');
  });
});

// A shop that keeps its cart in a session cookie, like the real one the user tested.
describe('collection runs keep cookies between requests', () => {
  const contains = (id: string, expected: string) => ({
    id,
    enabled: true,
    kind: 'body',
    target: '',
    operator: 'contains',
    expected,
  });
  const form = {
    method: 'POST',
    headers: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }],
    body: 'product_id=7',
  };

  it('adds to the cart, sees it on the cart page and removes it again', async () => {
    const countIsOne = {
      id: 'c1',
      enabled: true,
      kind: 'jsonPath',
      target: 'count',
      operator: 'equals',
      expected: '1',
    };
    const id = await createCollection([
      {
        name: '1 Product',
        url: `${base}/shop/product/7`,
        assertions: [contains('p', 'Mock Book 7')],
      },
      {
        name: '2 Add',
        url: `${base}/shop/cart/add`,
        extra: form,
        assertions: [STATUS_200, countIsOne],
      },
      { name: '3 Cart', url: `${base}/shop/cart`, assertions: [contains('c', 'Mock Book 7')] },
      {
        name: '4 Remove',
        url: `${base}/shop/cart/remove?remove=7`,
        extra: { method: 'POST' },
        assertions: [contains('r', 'Mock Book 7 removed')],
      },
      {
        name: '5 Empty',
        url: `${base}/shop/cart`,
        assertions: [contains('e', 'Your cart is empty')],
      },
    ]);

    const run = await startRun(id);

    expect(run.results.map((r) => [r.name, r.outcome])).toEqual([
      ['1 Product', 'pass'],
      ['2 Add', 'pass'],
      ['3 Cart', 'pass'],
      ['4 Remove', 'pass'],
      ['5 Empty', 'pass'],
    ]);
  });

  it('starts every run with an empty cookie jar', async () => {
    const id = await createCollection([{ name: 'Add', url: `${base}/shop/cart/add`, extra: form }]);
    await startRun(id);
    const second = await startRun(
      await createCollection([
        {
          name: 'Cart',
          url: `${base}/shop/cart`,
          assertions: [contains('e', 'Your cart is empty')],
        },
      ]),
    );
    expect(second.results[0]?.outcome).toBe('pass');
  });

  it('never shows a session cookie in the results', async () => {
    const id = await createCollection([
      {
        name: 'Product',
        url: `${base}/shop/product/7`,
        assertions: [
          {
            id: 'h',
            enabled: true,
            kind: 'header',
            target: 'set-cookie',
            operator: 'exists',
            expected: '',
          },
        ],
      },
    ]);
    const run = await startRun(id);
    const shown = JSON.stringify(run);
    expect(run.results[0]?.assertions[0]?.outcome).toBe('pass');
    expect(shown).toContain('shop_session=');
    expect(shown).not.toMatch(/shop_session=[0-9a-f-]{36}/);
  });

  it('does not keep cookies between single requests', async () => {
    const send = (extra: Record<string, unknown>, url: string) =>
      request(app).post('/api/requests/execute').send(httpRequest(url, extra));
    await send(form, `${base}/shop/cart/add`);
    const cart = await send({}, `${base}/shop/cart`);
    expect(JSON.stringify(cart.body)).toContain('Your cart is empty');
  });
});

describe('a Cookie header written by the user', () => {
  it('is sent instead of the cookies the run collected', async () => {
    const id = await createCollection([
      { name: '1 Product', url: `${base}/shop/product/7` },
      {
        name: '2 Echo',
        url: `${base}/echo`,
        extra: { headers: [{ key: 'Cookie', value: 'mine=1', enabled: true }] },
        assertions: [
          {
            id: 'c',
            enabled: true,
            kind: 'jsonPath',
            target: 'headers.cookie',
            operator: 'equals',
            expected: '"mine=1"',
          },
        ],
      },
    ]);
    const run = await startRun(id);
    expect(run.results.map((r) => r.outcome)).toEqual(['pass', 'pass']);
  });
});
