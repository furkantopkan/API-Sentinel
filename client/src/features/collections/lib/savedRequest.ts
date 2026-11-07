import type { Assertion, ExecuteRequest } from '@api-sentinel/shared';

/**
 * JSON with object keys sorted, so two objects with the same content always
 * give the same text, whatever order their keys were created in (objects
 * parsed by the server's Zod schemas and objects built in the UI differ).
 * Array order is kept: it matters (e.g. assertion order).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/**
 * A stable text form of "what would be saved". Equal snapshots mean no
 * unsaved changes. UI-only data (row ids) is not part of an ExecuteRequest.
 */
export function snapshotOf(request: ExecuteRequest, assertions: readonly Assertion[]): string {
  return stableStringify({ request, assertions });
}

/** The saved request currently open in the editor (null = a new, unsaved request). */
export interface OpenRequest {
  id: string;
  name: string;
  collectionId: string;
  /** snapshotOf(...) at the last load or save. */
  snapshot: string;
}

export function isDirty(
  open: OpenRequest | null,
  request: ExecuteRequest,
  assertions: readonly Assertion[],
): boolean {
  return open !== null && open.snapshot !== snapshotOf(request, assertions);
}
