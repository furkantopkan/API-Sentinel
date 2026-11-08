import type { Database } from '../db/database';

/** A variable as stored, including the real value of secrets. Server-only. */
export interface StoredVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  enabled: boolean;
}

export interface StoredEnvironment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  variables: StoredVariable[];
}

type Row = Record<string, unknown>;

const toVariable = (row: Row): StoredVariable => ({
  id: String(row.id),
  key: String(row.key),
  value: String(row.value),
  isSecret: row.is_secret === 1,
  enabled: row.enabled === 1,
});

/** All SQL for environments. Prepared statements only (see collectionRepository). */
export function createEnvironmentRepository(db: Database) {
  const statements = {
    list: db.prepare(
      'SELECT id, name, created_at, updated_at FROM environments ORDER BY name COLLATE NOCASE, created_at',
    ),
    get: db.prepare('SELECT id, name, created_at, updated_at FROM environments WHERE id = ?'),
    variablesOf: db.prepare(
      'SELECT * FROM environment_variables WHERE environment_id = ? ORDER BY sort_order',
    ),
    insert: db.prepare(
      'INSERT INTO environments (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    ),
    update: db.prepare('UPDATE environments SET name = ?, updated_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM environments WHERE id = ?'),
    clearVariables: db.prepare('DELETE FROM environment_variables WHERE environment_id = ?'),
    insertVariable: db.prepare(
      `INSERT INTO environment_variables
        (id, environment_id, key, value, is_secret, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
  };

  const toEnvironment = (row: Row): StoredEnvironment => ({
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    variables: statements.variablesOf.all(String(row.id)).map(toVariable),
  });

  function replaceVariables(environmentId: string, variables: readonly StoredVariable[]) {
    statements.clearVariables.run(environmentId);
    variables.forEach((variable, index) => {
      statements.insertVariable.run(
        variable.id,
        environmentId,
        variable.key,
        variable.value,
        variable.isSecret ? 1 : 0,
        variable.enabled ? 1 : 0,
        index,
      );
    });
  }

  /** Name and variables change together or not at all. */
  function inTransaction(work: () => void) {
    db.exec('BEGIN');
    try {
      work();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    list: (): StoredEnvironment[] => statements.list.all().map(toEnvironment),

    get(id: string): StoredEnvironment | undefined {
      const row = statements.get.get(id);
      return row && toEnvironment(row);
    },

    insert(id: string, name: string, variables: readonly StoredVariable[], now: string): void {
      inTransaction(() => {
        statements.insert.run(id, name, now, now);
        replaceVariables(id, variables);
      });
    },

    update(id: string, name: string, variables: readonly StoredVariable[], now: string): void {
      inTransaction(() => {
        statements.update.run(name, now, id);
        replaceVariables(id, variables);
      });
    },

    remove: (id: string): boolean => Number(statements.remove.run(id).changes) > 0,
  };
}

export type EnvironmentRepository = ReturnType<typeof createEnvironmentRepository>;
