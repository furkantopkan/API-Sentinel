import {
  apiErrorResponseSchema,
  collectionListResponseSchema,
  collectionResponseSchema,
  savedRequestResponseSchema,
} from '@api-sentinel/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { openDatabase, type Database } from '../../src/db/database';

// Real Express app + real SQLite in memory: a fresh, empty database per test.

let db: Database;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp(
    { ...loadConfig({}), dbPath: ':memory:' },
    { db, engineLogger: () => undefined, aiClient: null },
  );
});

const REQUEST = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [{ key: 'page', value: '1', enabled: true }],
  headers: [{ key: 'X-Trace', value: '1', enabled: false }],
  auth: { type: 'bearer', token: 'stored-token' },
  body: '{"a":1}',
  options: { timeoutMs: 5000, followRedirects: false },
};
const ASSERTIONS = [
  { id: 'a1', enabled: true, kind: 'status', target: '', operator: 'equals', expected: '200' },
];

async function newCollection(name = 'Users') {
  const response = await request(app).post('/api/collections').send({ name });
  return collectionResponseSchema.parse(response.body).collection;
}

async function newRequest(collectionId: string, name = 'Create user') {
  const response = await request(app)
    .post('/api/saved-requests')
    .send({ collectionId, name, request: REQUEST, assertions: ASSERTIONS });
  return savedRequestResponseSchema.parse(response.body).savedRequest;
}

const list = async () =>
  collectionListResponseSchema.parse((await request(app).get('/api/collections')).body).collections;

const errorCode = (body: unknown) => apiErrorResponseSchema.parse(body).error.code;

describe('collections', () => {
  it('starts empty', async () => {
    expect(await list()).toEqual([]);
  });

  it('creates a collection, trimming the name', async () => {
    const response = await request(app).post('/api/collections').send({ name: '  Users API ' });

    expect(response.status).toBe(201);
    expect(collectionResponseSchema.parse(response.body).collection).toMatchObject({
      name: 'Users API',
      requests: [],
    });
  });

  it.each([[{ name: '' }], [{ name: '   ' }], [{ name: 'x'.repeat(201) }], [{}]])(
    'rejects invalid input %j',
    async (body) => {
      const response = await request(app).post('/api/collections').send(body);

      expect(response.status).toBe(400);
      expect(errorCode(response.body)).toBe('VALIDATION_ERROR');
    },
  );

  it('lists collections alphabetically, ignoring case', async () => {
    await newCollection('beta');
    await newCollection('Alpha');
    await newCollection('Gamma');

    expect((await list()).map((c) => c.name)).toEqual(['Alpha', 'beta', 'Gamma']);
  });

  it('renames a collection and keeps its requests', async () => {
    const collection = await newCollection();
    await newRequest(collection.id);

    const response = await request(app)
      .patch(`/api/collections/${collection.id}`)
      .send({ name: 'Renamed' });

    expect(collectionResponseSchema.parse(response.body).collection).toMatchObject({
      name: 'Renamed',
      requests: [{ name: 'Create user' }],
    });
  });

  it('deleting a collection deletes its saved requests (cascade)', async () => {
    const collection = await newCollection();
    const saved = await newRequest(collection.id);

    expect((await request(app).delete(`/api/collections/${collection.id}`)).status).toBe(200);

    expect(await list()).toEqual([]);
    expect((await request(app).get(`/api/saved-requests/${saved.id}`)).status).toBe(404);
  });

  // Prepared statements: this text must be stored literally, not executed.
  it('stores SQL-looking names as plain text', async () => {
    const name = "x'); DROP TABLE collections; --";
    await newCollection(name);

    expect((await list()).map((c) => c.name)).toEqual([name]);
  });
});

describe('saved requests', () => {
  it('stores the whole request and its assertions', async () => {
    const collection = await newCollection();
    const saved = await newRequest(collection.id);

    const response = await request(app).get(`/api/saved-requests/${saved.id}`);

    expect(savedRequestResponseSchema.parse(response.body).savedRequest).toMatchObject({
      collectionId: collection.id,
      name: 'Create user',
      request: REQUEST,
      assertions: ASSERTIONS,
    });
  });

  it('appears in the collection tree as a summary without secrets', async () => {
    const collection = await newCollection();
    await newRequest(collection.id);

    const [listed] = await list();

    expect(listed?.requests).toEqual([
      expect.objectContaining({ name: 'Create user', method: 'POST', url: REQUEST.url }),
    ]);
    expect(JSON.stringify(listed)).not.toContain('stored-token');
  });

  it('PUT replaces the content and can move the request to another collection', async () => {
    const first = await newCollection('First');
    const second = await newCollection('Second');
    const saved = await newRequest(first.id);

    const response = await request(app)
      .put(`/api/saved-requests/${saved.id}`)
      .send({
        collectionId: second.id,
        name: 'Moved',
        request: { ...REQUEST, method: 'GET', url: 'https://x.io/' },
        assertions: [],
      });

    expect(savedRequestResponseSchema.parse(response.body).savedRequest).toMatchObject({
      collectionId: second.id,
      name: 'Moved',
      assertions: [],
    });
    const [listedFirst, listedSecond] = await list();
    expect(listedFirst?.requests).toEqual([]);
    expect(listedSecond?.requests[0]).toMatchObject({ method: 'GET', url: 'https://x.io/' });
  });

  it('PATCH changes only the name, leaving the stored request untouched', async () => {
    const collection = await newCollection();
    const saved = await newRequest(collection.id);

    const response = await request(app)
      .patch(`/api/saved-requests/${saved.id}`)
      .send({ name: '  New name ' });

    expect(savedRequestResponseSchema.parse(response.body).savedRequest).toMatchObject({
      name: 'New name',
      request: REQUEST,
      assertions: ASSERTIONS,
    });
    // The summary columns behind the sidebar must stay intact too.
    expect((await list())[0]?.requests).toEqual([
      { id: saved.id, name: 'New name', method: 'POST', url: REQUEST.url },
    ]);
  });

  it('rejects an empty name when renaming', async () => {
    const collection = await newCollection();
    const saved = await newRequest(collection.id);

    const response = await request(app)
      .patch(`/api/saved-requests/${saved.id}`)
      .send({ name: ' ' });

    expect(response.status).toBe(400);
    expect(errorCode(response.body)).toBe('VALIDATION_ERROR');
  });

  it('deletes a saved request', async () => {
    const collection = await newCollection();
    const saved = await newRequest(collection.id);

    expect((await request(app).delete(`/api/saved-requests/${saved.id}`)).status).toBe(200);
    expect((await list())[0]?.requests).toEqual([]);
  });

  it('rejects an invalid assertion instead of storing it', async () => {
    const collection = await newCollection();
    const response = await request(app)
      .post('/api/saved-requests')
      .send({
        collectionId: collection.id,
        name: 'x',
        request: REQUEST,
        assertions: [{ ...ASSERTIONS[0], operator: 'isNull' }],
      });

    expect(response.status).toBe(400);
  });

  it('returns 404 for a collection that does not exist', async () => {
    const response = await request(app).post('/api/saved-requests').send({
      collectionId: crypto.randomUUID(),
      name: 'x',
      request: REQUEST,
      assertions: [],
    });

    expect(response.status).toBe(404);
    expect(errorCode(response.body)).toBe('NOT_FOUND');
  });

  it.each([
    ['get', '/api/saved-requests/not-a-uuid'],
    ['delete', '/api/saved-requests/not-a-uuid'],
    ['delete', '/api/collections/not-a-uuid'],
    ['get', `/api/saved-requests/${crypto.randomUUID()}`],
    ['delete', `/api/collections/${crypto.randomUUID()}`],
  ] as const)('%s %s → 404', async (method, url) => {
    const response = await request(app)[method](url);

    expect(response.status).toBe(404);
    expect(errorCode(response.body)).toBe('NOT_FOUND');
  });

  // A damaged row must fail loudly and must not leak its content.
  it('answers 500 without leaking content when a stored row is corrupted', async () => {
    const collection = await newCollection();
    const saved = await newRequest(collection.id);
    db.prepare('UPDATE saved_requests SET request_json = ? WHERE id = ?').run(
      '{"token":"LEAK-ME"',
      saved.id,
    );

    const response = await request(app).get(`/api/saved-requests/${saved.id}`);

    expect(response.status).toBe(500);
    expect(errorCode(response.body)).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('LEAK-ME');
  });
});

describe('the environment of a collection', () => {
  const newEnvironment = async (name = 'shop.test') => {
    const response = await request(app).post('/api/environments').send({ name, variables: [] });
    return (response.body as { environment: { id: string } }).environment.id;
  };
  const importWith = (environmentId?: string) =>
    request(app)
      .post('/api/collections/import')
      .send({
        name: 'Flow',
        ...(environmentId === undefined ? {} : { environmentId }),
        requests: [{ name: 'Step', request: REQUEST, assertions: ASSERTIONS }],
      });

  it('is kept when a collection is imported with it, and is null otherwise', async () => {
    const environmentId = await newEnvironment();
    const linked = await importWith(environmentId);
    expect(linked.status).toBe(201);
    expect(collectionResponseSchema.parse(linked.body).collection.environmentId).toBe(
      environmentId,
    );
    expect((await newCollection()).environmentId).toBeNull();
  });

  it('must exist', async () => {
    const response = await importWith('00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
    expect(errorCode(response.body)).toBe('NOT_FOUND');
    expect(await list()).toEqual([]);
  });

  it('is changed or removed on rename, and kept when not mentioned', async () => {
    const environmentId = await newEnvironment();
    const { id } = await newCollection();
    const patch = (body: object) => request(app).patch(`/api/collections/${id}`).send(body);

    await patch({ name: 'Users', environmentId });
    await patch({ name: 'Users 2' });
    expect((await list())[0]).toMatchObject({ name: 'Users 2', environmentId });
    await patch({ name: 'Users 2', environmentId: null });
    expect((await list())[0]?.environmentId).toBeNull();
  });

  it('is unlinked when the environment is deleted', async () => {
    const environmentId = await newEnvironment();
    await importWith(environmentId);
    await request(app).delete(`/api/environments/${environmentId}`);
    expect((await list())[0]?.environmentId).toBeNull();
  });
});
