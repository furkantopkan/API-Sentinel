import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, type Migration } from './migrations';

/**
 * Opens the SQLite database (Node's built-in `node:sqlite`, no extra package)
 * and brings its schema up to date.
 *
 * `node:sqlite` is synchronous: each query blocks for microseconds on a local
 * file, which is fine for a single-user local app and keeps the code simple.
 */
export function openDatabase(path: string, migrations: readonly Migration[] = MIGRATIONS) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // SQLite leaves foreign keys off by default; ON DELETE CASCADE needs them.
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db, migrations);
  return db;
}

export type Database = DatabaseSync;

/** Applies pending migrations in order, each inside a transaction. */
export function migrate(db: DatabaseSync, migrations: readonly Migration[]): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`);
  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => Number(row.id)),
  );

  const ran: number[] = [];
  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      ran.push(migration.id);
    } catch (error) {
      // A half-applied migration would leave the schema in an unknown state.
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.id} (${migration.name}) failed`, { cause: error });
    }
  }
  return ran;
}
