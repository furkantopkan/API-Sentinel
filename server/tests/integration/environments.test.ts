import { createMockTargetApp } from '@api-sentinel/mock-target';
import {
  apiErrorResponseSchema,
  environmentListResponseSchema,
  environmentResponseSchema,
  executeResultSchema,
} from '@api-sentinel/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { openDatabase } from '../../src/db/database';
import { AppError } from '../../src/errors/AppError';
import type { RequestEngine } from '../../src/services/request-engine/requestEngine';

// Real app, in-memory SQLite and the local mock target (no internet).

const SECRET = 'S3CRET-VALUE-123';
let target: Server;
let port: number;
let base: string;
let app: ReturnType<typeof createApp>;
let logs: string[];

function buildApp(engine?: RequestEngine) {
  const config = loadConfig({});
  return createApp(
    {
      ...config,
      dbPath: ':memory:',
      requestEngine: { ...config.requestEngine, allowlist: new Set([`127.0.0.1:${port}`]) },
    },
    { db: openDatabase(':memory:'), aiClient: null, engine, engineLogger: (l) => logs.push(l) },
  );
}

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
  logs = [];
  app = buildApp();
});

interface VariableBody {
  id?: string;
  key: string;
  value?: string;
  isSecret?: boolean;
  enabled?: boolean;
}

const withDefaults = (variables: VariableBody[]) =>
  variables.map((v) => ({ isSecret: false, enabled: true, ...v }));

async function createEnv(variables: VariableBody[], name = 'Local') {
  const response = await request(app)
    .post('/api/environments')
    .send({ name, variables: withDefaults(variables) });
  expect(response.status).toBe(201);
  return environmentResponseSchema.parse(response.body).environment;
}

const STANDARD: VariableBody[] = [
  { key: 'baseUrl', value: '' },
  { key: 'token', value: SECRET, isSecret: true },
];

const standardEnv = () =>
  createEnv(STANDARD.map((v) => (v.key === 'baseUrl' ? { ...v, value: base } : v)));

function executeBody(overrides: Record<string, unknown>) {
  return {
    method: 'GET',
    url: `${base}/json`,
    queryParams: [],
    headers: [],
    auth: { type: 'none' },
    body: '',
    options: { followRedirects: true },
    ...overrides,
  };
}

async function execute(overrides: Record<string, unknown>) {
  return request(app).post('/api/requests/execute').send(executeBody(overrides));
}

async function executeOk(overrides: Record<string, unknown>) {
  const response = await execute(overrides);
  expect(response.status).toBe(200);
  const result = executeResultSchema.parse(response.body);
  if (!result.ok) throw new Error('expected success');
  return result.response;
}

const errorOf = (body: unknown) => apiErrorResponseSchema.parse(body).error;

function echoOf(response: Awaited<ReturnType<typeof executeOk>>) {
  if (response.body.kind !== 'json') throw new Error('expected JSON');
  return JSON.parse(response.body.text) as {
    method: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: string;
  };
}

describe('environments API', () => {
  it('never returns a secret value, only that one exists', async () => {
    const created = await createEnv(STANDARD);
    const listed = await request(app).get('/api/environments');

    expect(created.variables[1]).toMatchObject({ key: 'token', value: '', hasValue: true });
    expect(environmentListResponseSchema.parse(listed.body).environments).toHaveLength(1);
    expect(JSON.stringify([created, listed.body])).not.toContain(SECRET);
  });

  it('returns non-secret values and keeps the variable order', async () => {
    const created = await createEnv([
      { key: 'z', value: '1' },
      { key: 'a', value: '2' },
    ]);

    expect(created.variables.map((v) => [v.key, v.value])).toEqual([
      ['z', '1'],
      ['a', '2'],
    ]);
  });

  it.each([
    ['empty name', { name: ' ', variables: [] }],
    [
      'bad variable name',
      { name: 'x', variables: withDefaults([{ key: 'has space', value: '' }]) },
    ],
    ['name with braces', { name: 'x', variables: withDefaults([{ key: '{{a}}', value: '' }]) }],
    [
      'duplicate names',
      {
        name: 'x',
        variables: withDefaults([
          { key: 'a', value: '1' },
          { key: 'a', value: '2' },
        ]),
      },
    ],
  ])('rejects %s', async (_what, body) => {
    const response = await request(app).post('/api/environments').send(body);

    expect(response.status).toBe(400);
    expect(errorOf(response.body).code).toBe('VALIDATION_ERROR');
  });

  it('deletes an environment', async () => {
    const environment = await createEnv([]);

    expect((await request(app).delete(`/api/environments/${environment.id}`)).status).toBe(200);
    expect(
      environmentListResponseSchema.parse((await request(app).get('/api/environments')).body)
        .environments,
    ).toEqual([]);
  });

  it.each([
    ['delete', '/api/environments/not-a-uuid'],
    ['delete', `/api/environments/${crypto.randomUUID()}`],
  ] as const)('%s %s → 404', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(404);
  });
});

describe('secret lifecycle', () => {
  const update = (id: string, variables: VariableBody[]) =>
    request(app)
      .put(`/api/environments/${id}`)
      .send({ name: 'Local', variables: withDefaults(variables) });

  it('keeps the stored secret when no new value is sent', async () => {
    const environment = await standardEnv();
    const tokenId = environment.variables[1]?.id;

    await update(environment.id, [
      { key: 'baseUrl', value: base },
      { id: tokenId, key: 'token', isSecret: true },
    ]);
    const response = await executeOk({
      url: `{{baseUrl}}/auth/bearer`,
      auth: { type: 'bearer', token: '{{token}}' },
      environmentId: environment.id,
    });

    // Sends the stored secret: the mock only checks equality with its own token.
    expect(response.status).toBe(401);
    expect(logs.join('\n')).not.toContain(SECRET);
  });

  it('replaces a secret when a new value is sent', async () => {
    const environment = await standardEnv();
    await update(environment.id, [
      { key: 'baseUrl', value: base },
      { id: environment.variables[1]?.id, key: 'token', value: 'test-token', isSecret: true },
    ]);

    const response = await executeOk({
      url: '{{baseUrl}}/auth/bearer',
      auth: { type: 'bearer', token: '{{token}}' },
      environmentId: environment.id,
    });

    expect(response.status).toBe(200);
  });

  // Otherwise un-ticking "secret" would be a way to read it.
  it('clears the value when a secret is turned into a normal variable', async () => {
    const environment = await standardEnv();

    const response = await update(environment.id, [
      { key: 'baseUrl', value: base },
      { id: environment.variables[1]?.id, key: 'token', isSecret: false },
    ]);

    expect(environmentResponseSchema.parse(response.body).environment.variables[1]).toMatchObject({
      value: '',
      hasValue: false,
    });
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
  });

  it("does not let a variable claim another variable's secret by id", async () => {
    const first = await standardEnv();
    const second = await createEnv([], 'Other');

    const response = await update(second.id, [
      { id: first.variables[1]?.id, key: 'stolen', isSecret: true },
    ]);
    const environment = environmentResponseSchema.parse(response.body).environment;

    expect(environment.variables[0]).toMatchObject({ hasValue: false });
  });
});

describe('POST /api/requests/execute with variables', () => {
  it('resolves URL, query, headers, auth and body', async () => {
    const environment = await createEnv([
      { key: 'baseUrl', value: base },
      { key: 'tenant', value: 'acme' },
      { key: 'num', value: '5' },
      { key: 'token', value: 'tok-value' },
    ]);

    const echo = echoOf(
      await executeOk({
        method: 'POST',
        url: '{{baseUrl}}/echo',
        queryParams: [{ key: 'tenant', value: '{{tenant}}', enabled: true }],
        headers: [{ key: 'X-Tenant', value: '{{ tenant }}', enabled: true }],
        auth: { type: 'bearer', token: '{{token}}' },
        body: '{"id": {{num}}}',
        environmentId: environment.id,
      }),
    );

    expect(echo.query).toEqual({ tenant: 'acme' });
    expect(echo.headers['x-tenant']).toBe('acme');
    expect(echo.headers.authorization).toBe('Bearer tok-value');
    expect(echo.body).toBe('{"id": 5}');
  });

  it('does not expand placeholders inside values', async () => {
    const environment = await createEnv([
      { key: 'baseUrl', value: base },
      { key: 'a', value: '{{b}}' },
      { key: 'b', value: 'expanded' },
    ]);

    const echo = echoOf(
      await executeOk({
        url: '{{baseUrl}}/echo',
        queryParams: [{ key: 'v', value: '{{a}}', enabled: true }],
        environmentId: environment.id,
      }),
    );

    expect(echo.query.v).toBe('{{b}}');
  });

  it('asks for an environment when none is selected', async () => {
    const response = await execute({ url: '{{baseUrl}}/json' });

    expect(response.status).toBe(400);
    expect(errorOf(response.body)).toMatchObject({
      code: 'UNKNOWN_VARIABLE',
      details: { variables: ['baseUrl'] },
    });
    expect(errorOf(response.body).message).toContain('Select an environment');
    expect(logs).toEqual([]); // nothing was sent
  });

  it('reports every undefined variable once', async () => {
    const environment = await createEnv([]);
    const response = await execute({
      url: `${base}/{{a}}/{{b}}/{{a}}`,
      environmentId: environment.id,
    });

    expect(errorOf(response.body).details).toEqual({ variables: ['a', 'b'] });
    expect(logs).toEqual([]);
  });

  it('treats a disabled variable as undefined', async () => {
    const environment = await createEnv([{ key: 'baseUrl', value: base, enabled: false }]);

    const response = await execute({ url: '{{baseUrl}}/json', environmentId: environment.id });

    expect(errorOf(response.body).code).toBe('UNKNOWN_VARIABLE');
  });

  it('ignores undefined variables in disabled rows (they are not sent)', async () => {
    const response = await executeOk({
      headers: [{ key: 'X-Off', value: '{{missing}}', enabled: false }],
    });

    expect(response.status).toBe(200);
  });

  it('returns 404 for an environment that does not exist', async () => {
    const response = await execute({ environmentId: crypto.randomUUID() });

    expect(response.status).toBe(404);
    expect(errorOf(response.body).code).toBe('NOT_FOUND');
  });

  // Variables must not be a way around the SSRF guard.
  it.each(['http://169.254.169.254/', 'http://10.0.0.1/', 'http://127.0.0.1:1/'])(
    'still blocks %s when it comes from a variable',
    async (url) => {
      const environment = await createEnv([{ key: 'target', value: url }]);

      const response = await execute({ url: '{{target}}', environmentId: environment.id });

      expect(response.status).toBe(403);
      expect(errorOf(response.body).code).toBe('BLOCKED_TARGET');
    },
  );
});

describe('secret masking', () => {
  it('masks a secret echoed in the body and the final URL', async () => {
    const environment = await standardEnv();

    const response = await executeOk({
      url: '{{baseUrl}}/echo',
      queryParams: [{ key: 'key', value: '{{token}}', enabled: true }],
      headers: [{ key: 'X-Token', value: '{{token}}', enabled: true }],
      environmentId: environment.id,
    });

    expect(JSON.stringify(response)).not.toContain(SECRET);
    expect(response.finalUrl).toContain('key=[secret]');
    expect(echoOf(response).headers['x-token']).toBe('[secret]');
  });

  it('masks a secret in the redirect chain', async () => {
    const environment = await standardEnv();

    const response = await executeOk({
      url: '{{baseUrl}}/redirect-to',
      queryParams: [{ key: 'url', value: `${base}/json?key={{token}}`, enabled: true }],
      environmentId: environment.id,
    });

    expect(response.redirects).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain(SECRET);
  });

  it('does not touch responses when the secret is not in them', async () => {
    const environment = await standardEnv();

    const response = await executeOk({ url: '{{baseUrl}}/json', environmentId: environment.id });

    expect(JSON.stringify(response.body)).toContain('Ada Lovelace');
    expect(JSON.stringify(response)).not.toContain('[secret]');
  });

  it('masks a secret in the engine log line', async () => {
    const environment = await createEnv([{ key: 'host', value: '127.0.0.1', isSecret: true }]);

    await executeOk({ url: `http://{{host}}:${port}/json`, environmentId: environment.id });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^\[engine\] GET \[secret\]:\d+ -> 200/);
  });

  it('masks a secret in error messages', async () => {
    const failing: RequestEngine = {
      execute: () =>
        Promise.reject(new AppError('DNS_ERROR', `Could not resolve host "${SECRET}".`, 502)),
      close: () => Promise.resolve(),
    };
    app = buildApp(failing);
    const environment = await standardEnv();

    const response = await execute({ environmentId: environment.id });

    expect(response.status).toBe(502);
    expect(errorOf(response.body).message).toBe('Could not resolve host "[secret]".');
  });
});
