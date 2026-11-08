import { runSchema, runSummarySchema, type Run, type RunSummary } from '@api-sentinel/shared';
import type { Database } from '../db/database';

type Row = Record<string, unknown>;

const SUMMARY_COLUMNS =
  'id, collection_id, collection_name, environment_name, started_at, duration_ms, total, passed, failed, errors';

const summaryFields = (row: Row) => ({
  id: row.id,
  collectionId: row.collection_id,
  collectionName: row.collection_name,
  environmentName: row.environment_name,
  startedAt: row.started_at,
  durationMs: row.duration_ms,
  total: row.total,
  passed: row.passed,
  failed: row.failed,
  errors: row.errors,
});

/** All SQL for test runs. Prepared statements only; rows are validated when read. */
export function createRunRepository(db: Database) {
  const statements = {
    insert: db.prepare(
      `INSERT INTO test_runs
        (id, collection_id, collection_name, environment_name, started_at, duration_ms,
         total, passed, failed, errors, results_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    list: db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM test_runs ORDER BY started_at DESC LIMIT ?`),
    get: db.prepare('SELECT * FROM test_runs WHERE id = ?'),
    remove: db.prepare('DELETE FROM test_runs WHERE id = ?'),
    prune: db.prepare(
      `DELETE FROM test_runs
        WHERE collection_id = ?
          AND id NOT IN (
            SELECT id FROM test_runs WHERE collection_id = ? ORDER BY started_at DESC LIMIT ?
          )`,
    ),
  };

  return {
    insert(run: Run): void {
      statements.insert.run(
        run.id,
        run.collectionId,
        run.collectionName,
        run.environmentName,
        run.startedAt,
        run.durationMs,
        run.total,
        run.passed,
        run.failed,
        run.errors,
        JSON.stringify(run.results),
      );
    },

    list: (limit: number): RunSummary[] =>
      statements.list.all(limit).map((row) => runSummarySchema.parse(summaryFields(row))),

    get(id: string): Run | undefined {
      const row = statements.get.get(id);
      return (
        row &&
        runSchema.parse({
          ...summaryFields(row),
          results: JSON.parse(String(row.results_json)) as unknown,
        })
      );
    },

    remove: (id: string): boolean => Number(statements.remove.run(id).changes) > 0,

    /** Keeps only the newest `keep` runs of a collection. */
    prune(collectionId: string, keep: number): void {
      statements.prune.run(collectionId, collectionId, keep);
    },
  };
}

export type RunRepository = ReturnType<typeof createRunRepository>;
