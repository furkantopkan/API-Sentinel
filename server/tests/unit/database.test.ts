import { describe, expect, it } from 'vitest';
import { migrate, openDatabase } from '../../src/db/database';
import { MIGRATIONS, type Migration } from '../../src/db/migrations';

const tableNames = (db: ReturnType<typeof openDatabase>) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name));

describe('openDatabase', () => {
  it('applies every migration to a new database', () => {
    const db = openDatabase(':memory:');

    expect(tableNames(db)).toEqual(
      expect.arrayContaining(['collections', 'saved_requests', 'schema_migrations']),
    );
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(
      MIGRATIONS.length,
    );
  });

  // Off by default in SQLite; without it ON DELETE CASCADE silently does nothing.
  it('enables foreign keys', () => {
    expect(openDatabase(':memory:').prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
  });
});

describe('migrate', () => {
  const create = (id: number, table: string): Migration => ({
    id,
    name: table,
    sql: `CREATE TABLE ${table} (id INTEGER);`,
  });

  it('runs pending migrations in id order, each exactly once', () => {
    const db = openDatabase(':memory:', []);

    expect(migrate(db, [create(2, 'b'), create(1, 'a')])).toEqual([1, 2]);
    expect(migrate(db, [create(2, 'b'), create(1, 'a'), create(3, 'c')])).toEqual([3]);
    expect(migrate(db, [create(1, 'a')])).toEqual([]);
  });

  it('rolls a failing migration back completely and names it in the error', () => {
    const db = openDatabase(':memory:', []);
    const broken: Migration = {
      id: 1,
      name: 'broken step',
      sql: 'CREATE TABLE half_done (id INTEGER); THIS IS NOT SQL;',
    };

    expect(() => migrate(db, [broken])).toThrow(/Migration 1 \(broken step\) failed/);
    expect(tableNames(db)).not.toContain('half_done');
    expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBe(0);
  });
});

describe('migration 5: the environment of a collection', () => {
  it('links collections made until now to the (oldest) environment of the same name', () => {
    const db = openDatabase(
      ':memory:',
      MIGRATIONS.filter((m) => m.id < 5),
    );
    const env = (id: string, name: string, at: string) =>
      db
        .prepare('INSERT INTO environments (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(id, name, at, at);
    const collection = (id: string, name: string) =>
      db
        .prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(id, name, '2026-01-01', '2026-01-01');
    env('e-new', 'Shop Flow', '2026-02-01');
    env('e-old', 'Shop Flow', '2026-01-01');
    collection('c-shop', 'Shop Flow');
    collection('c-other', 'Hand made');

    migrate(db, MIGRATIONS);

    const linked = db.prepare('SELECT id, environment_id FROM collections ORDER BY id').all();
    expect(linked.map((row) => [row.id, row.environment_id])).toEqual([
      ['c-other', null],
      ['c-shop', 'e-old'],
    ]);
    // Deleting the environment leaves the collection, unlinked.
    db.prepare('DELETE FROM environments WHERE id = ?').run('e-old');
    expect(db.prepare("SELECT environment_id FROM collections WHERE id = 'c-shop'").get()).toEqual(
      expect.objectContaining({ environment_id: null }),
    );
  });
});
