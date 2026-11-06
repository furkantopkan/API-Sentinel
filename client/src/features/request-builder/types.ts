import type { HttpMethod } from '@api-sentinel/shared';

/** One row of the query-parameter or header table. */
export interface KeyValueRow {
  /** Stable identity for React list keys; never sent anywhere. */
  id: string;
  key: string;
  value: string;
  /** Disabled rows stay in the table but are not sent. */
  enabled: boolean;
}

/**
 * Discriminated union: the `type` field decides which other fields exist.
 * TypeScript therefore rejects impossible states such as a `password`
 * on a bearer configuration.
 */
export type AuthConfig =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string };

export type AuthType = AuthConfig['type'];

/** Everything the user has typed into the Request Builder (UI state). */
export interface RequestDraft {
  method: HttpMethod;
  url: string;
  queryParams: KeyValueRow[];
  headers: KeyValueRow[];
  auth: AuthConfig;
  /** Raw JSON text exactly as typed; validated before sending. */
  body: string;
}

export type KeyValueListName = 'queryParams' | 'headers';
