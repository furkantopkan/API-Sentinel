import {
  collectionSchema,
  savedRequestSchema,
  type Collection,
  type SavedRequest,
  type SavedRequestInput,
} from '@api-sentinel/shared';
import type { Database } from '../db/database';

/**
 * All SQL for collections and saved requests lives here (repository pattern).
 *
 * - Only prepared statements with `?` parameters: user text is never
 *   concatenated into SQL, which rules out SQL injection.
 * - Rows are validated with the shared Zod schemas on the way out, so a
 *   corrupted or outdated row fails loudly instead of reaching the UI.
 */
export function createCollectionRepository(db: Database) {
  const statements = {
    listCollections: db.prepare(
      'SELECT id, name, created_at, updated_at FROM collections ORDER BY name COLLATE NOCASE, created_at',
    ),
    getCollection: db.prepare(
      'SELECT id, name, created_at, updated_at FROM collections WHERE id = ?',
    ),
    listSummaries: db.prepare(
      'SELECT id, collection_id, name, method, url FROM saved_requests ORDER BY name COLLATE NOCASE, created_at',
    ),
    listSummariesOf: db.prepare(
      'SELECT id, collection_id, name, method, url FROM saved_requests WHERE collection_id = ? ORDER BY name COLLATE NOCASE, created_at',
    ),
    insertCollection: db.prepare(
      'INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ),
    renameCollection: db.prepare('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?'),
    deleteCollection: db.prepare('DELETE FROM collections WHERE id = ?'),
    getSavedRequest: db.prepare('SELECT * FROM saved_requests WHERE id = ?'),
    insertSavedRequest: db.prepare(
      `INSERT INTO saved_requests
        (id, collection_id, name, method, url, request_json, assertions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    updateSavedRequest: db.prepare(
      `UPDATE saved_requests
          SET collection_id = ?, name = ?, method = ?, url = ?, request_json = ?, assertions_json = ?, updated_at = ?
        WHERE id = ?`,
    ),
    renameSavedRequest: db.prepare(
      'UPDATE saved_requests SET name = ?, updated_at = ? WHERE id = ?',
    ),
    deleteSavedRequest: db.prepare('DELETE FROM saved_requests WHERE id = ?'),
  };

  type Row = Record<string, unknown>;

  const toSummary = (row: Row) => ({
    id: row.id,
    name: row.name,
    method: row.method,
    url: row.url,
  });

  const toCollection = (row: Row, requests: Row[]): Collection =>
    collectionSchema.parse({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requests: requests.map(toSummary),
    });

  const toSavedRequest = (row: Row): SavedRequest =>
    savedRequestSchema.parse({
      id: row.id,
      collectionId: row.collection_id,
      name: row.name,
      request: JSON.parse(String(row.request_json)) as unknown,
      assertions: JSON.parse(String(row.assertions_json)) as unknown,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

  const changed = (result: { changes: number | bigint }) => Number(result.changes) > 0;

  return {
    listCollections(): Collection[] {
      const byCollection = new Map<unknown, Row[]>();
      for (const row of statements.listSummaries.all()) {
        const list = byCollection.get(row.collection_id) ?? [];
        list.push(row);
        byCollection.set(row.collection_id, list);
      }
      return statements.listCollections
        .all()
        .map((row) => toCollection(row, byCollection.get(row.id) ?? []));
    },

    getCollection(id: string): Collection | undefined {
      const row = statements.getCollection.get(id);
      return row && toCollection(row, statements.listSummariesOf.all(id));
    },

    insertCollection(id: string, name: string, now: string): void {
      statements.insertCollection.run(id, name, now, now);
    },

    renameCollection(id: string, name: string, now: string): boolean {
      return changed(statements.renameCollection.run(name, now, id));
    },

    /** Deletes the collection and (ON DELETE CASCADE) all its saved requests. */
    deleteCollection(id: string): boolean {
      return changed(statements.deleteCollection.run(id));
    },

    getSavedRequest(id: string): SavedRequest | undefined {
      const row = statements.getSavedRequest.get(id);
      return row && toSavedRequest(row);
    },

    insertSavedRequest(id: string, input: SavedRequestInput, now: string): void {
      statements.insertSavedRequest.run(
        id,
        input.collectionId,
        input.name,
        input.request.method,
        input.request.url,
        JSON.stringify(input.request),
        JSON.stringify(input.assertions),
        now,
        now,
      );
    },

    updateSavedRequest(id: string, input: SavedRequestInput, now: string): boolean {
      return changed(
        statements.updateSavedRequest.run(
          input.collectionId,
          input.name,
          input.request.method,
          input.request.url,
          JSON.stringify(input.request),
          JSON.stringify(input.assertions),
          now,
          id,
        ),
      );
    },

    renameSavedRequest(id: string, name: string, now: string): boolean {
      return changed(statements.renameSavedRequest.run(name, now, id));
    },

    deleteSavedRequest(id: string): boolean {
      return changed(statements.deleteSavedRequest.run(id));
    },
  };
}

export type CollectionRepository = ReturnType<typeof createCollectionRepository>;
