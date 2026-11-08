import type { Environment, VariableInput } from '@api-sentinel/shared';

/** One row of the variable table while it is being edited. */
export interface VariableRow {
  /** React key; stable while editing. */
  rowId: string;
  /** Server id; undefined for rows that have not been saved yet. */
  id?: string;
  key: string;
  /** For secrets: empty means "keep the stored value". */
  value: string;
  isSecret: boolean;
  enabled: boolean;
  /** A secret already has a stored value (the browser never sees it). */
  hasStoredSecret: boolean;
}

export function toRows(environment: Environment | undefined): VariableRow[] {
  return (environment?.variables ?? []).map((variable) => ({
    rowId: variable.id,
    id: variable.id,
    key: variable.key,
    value: variable.value,
    isSecret: variable.isSecret,
    enabled: variable.enabled,
    hasStoredSecret: variable.isSecret && variable.hasValue,
  }));
}

/** Rows without a name are ignored. A blank secret is sent without a value, keeping the stored one. */
export function toVariableInputs(rows: readonly VariableRow[]): VariableInput[] {
  return rows
    .filter((row) => row.key.trim() !== '')
    .map((row) => ({
      id: row.id,
      key: row.key.trim(),
      isSecret: row.isSecret,
      enabled: row.enabled,
      ...(row.isSecret && row.value === '' ? {} : { value: row.value }),
    }));
}

/**
 * Turning "secret" off cannot reveal the stored value, so the field is blank
 * and the user must type a new one.
 */
export function withSecretFlag(row: VariableRow, isSecret: boolean): VariableRow {
  return { ...row, isSecret, hasStoredSecret: isSecret && row.hasStoredSecret };
}
