import type { AuthConfig, HttpMethod } from '@api-sentinel/shared';

/**
 * AuthConfig is a discriminated union defined in the shared contract:
 * the `type` field decides which other fields exist, so TypeScript rejects
 * impossible states such as a `password` on a bearer configuration.
 */
export type { AuthConfig };
export type AuthType = AuthConfig['type'];

/** One row of the query-parameter or header table. */
export interface KeyValueRow {
  /** Stable identity for React list keys; never sent anywhere. */
  id: string;
  key: string;
  value: string;
  /** Disabled rows stay in the table but are not sent. */
  enabled: boolean;
}

export interface RequestOptions {
  timeoutMs: number;
  followRedirects: boolean;
}

/** Everything the user has typed into the Request Builder (UI state). */
export interface RequestDraft {
  method: HttpMethod;
  url: string;
  queryParams: KeyValueRow[];
  headers: KeyValueRow[];
  auth: AuthConfig;
  /** Raw JSON text exactly as typed; validated before sending. */
  body: string;
  options: RequestOptions;
}

export type KeyValueListName = 'queryParams' | 'headers';
