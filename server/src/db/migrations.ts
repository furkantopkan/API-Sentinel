/**
 * Database migrations: numbered, append-only SQL steps.
 *
 * Each step runs exactly once per database (tracked in `schema_migrations`).
 * Never edit a step that has shipped - add a new one instead, so every
 * existing database file can be brought to the same schema.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'collections and saved requests',
    sql: `
      CREATE TABLE collections (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- request_json / assertions_json hold the shared Zod shapes; they are
      -- validated again whenever a row is read.
      CREATE TABLE saved_requests (
        id              TEXT PRIMARY KEY,
        collection_id   TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        method          TEXT NOT NULL,
        url             TEXT NOT NULL,
        request_json    TEXT NOT NULL,
        assertions_json TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE INDEX saved_requests_collection ON saved_requests(collection_id);
    `,
  },
  {
    id: 2,
    name: 'environments and variables',
    sql: `
      CREATE TABLE environments (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE environment_variables (
        id             TEXT PRIMARY KEY,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        key            TEXT NOT NULL,
        value          TEXT NOT NULL,
        is_secret      INTEGER NOT NULL,
        enabled        INTEGER NOT NULL,
        sort_order     INTEGER NOT NULL,
        UNIQUE (environment_id, key)
      );
    `,
  },
  {
    id: 3,
    name: 'test runs',
    sql: `
      -- Names are copied so history stays readable after a collection is deleted.
      -- results_json holds outcomes only: response bodies are never stored.
      CREATE TABLE test_runs (
        id               TEXT PRIMARY KEY,
        collection_id    TEXT REFERENCES collections(id) ON DELETE SET NULL,
        collection_name  TEXT NOT NULL,
        environment_name TEXT,
        started_at       TEXT NOT NULL,
        duration_ms      INTEGER NOT NULL,
        total            INTEGER NOT NULL,
        passed           INTEGER NOT NULL,
        failed           INTEGER NOT NULL,
        errors           INTEGER NOT NULL,
        results_json     TEXT NOT NULL
      );

      CREATE INDEX test_runs_collection ON test_runs(collection_id, started_at);
    `,
  },
  {
    id: 4,
    name: 'request order and value captures',
    sql: `
      ALTER TABLE saved_requests ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE saved_requests ADD COLUMN captures_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
];
