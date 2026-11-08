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
