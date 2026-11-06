import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };

/** `.env` lives in the project root, three levels above this file. */
const ROOT_ENV_FILE = resolve(import.meta.dirname, '../../../.env');

/**
 * Loads the project-root `.env` file into `process.env` if it exists.
 * Uses Node's built-in loader, so the `dotenv` package is not needed.
 */
export function loadEnvFile(path: string = ROOT_ENV_FILE): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

/**
 * Environment variables are always strings. This schema converts them to the
 * right types and rejects invalid values. Only variables used by the current
 * phase are listed; unknown keys are ignored.
 */
/** One allowlist entry: `host:port`, e.g. `localhost:4010` or `[::1]:4010`. */
const ALLOWLIST_ENTRY = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+):(\d{1,5})$/i;

/** Parses "a:1, b:2" into a set of lower-case entries; returns null if any entry is invalid. */
export function parseAllowlist(raw: string): Set<string> | null {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
  const valid = entries.every((entry) => {
    const match = ALLOWLIST_ENTRY.exec(entry);
    const port = Number(match?.[2]);
    return match !== null && port >= 1 && port <= 65535;
  });
  return valid ? new Set(entries) : null;
}

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    REQUEST_BODY_LIMIT: z
      .string()
      .trim()
      .regex(/^\d+(b|kb|mb)$/i, 'must look like "1mb", "500kb" or "1024b"')
      .default('1mb'),
    REQUEST_TIMEOUT_DEFAULT_MS: positiveInt(15_000),
    REQUEST_TIMEOUT_MAX_MS: positiveInt(60_000),
    RESPONSE_MAX_BYTES: positiveInt(5 * 1024 * 1024),
    MAX_REDIRECTS: z.coerce.number().int().min(0).max(20).default(5),
    SSRF_ALLOWLIST: z
      .string()
      .default('')
      .refine((raw) => parseAllowlist(raw) !== null, {
        message: 'must be a comma-separated list of host:port entries, e.g. "localhost:4010"',
      }),
  })
  .refine((env) => env.REQUEST_TIMEOUT_DEFAULT_MS <= env.REQUEST_TIMEOUT_MAX_MS, {
    message: 'must not be greater than REQUEST_TIMEOUT_MAX_MS',
    path: ['REQUEST_TIMEOUT_DEFAULT_MS'],
  });

/** Settings of the outbound request engine (Phase 2). */
export interface RequestEngineConfig {
  /** `host:port` entries that bypass the private-address block (see SSRF docs). */
  readonly allowlist: ReadonlySet<string>;
  readonly defaultTimeoutMs: number;
  readonly maxTimeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxRedirects: number;
  readonly userAgent: string;
}

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  /** Max size of JSON bodies our own API accepts (express.json limit). */
  readonly requestBodyLimit: string;
  readonly version: string;
  readonly requestEngine: RequestEngineConfig;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Validates environment variables and builds the app configuration.
 * Fails fast: an invalid value stops the server at startup instead of
 * causing a confusing error later at runtime.
 *
 * `env` is a parameter (not read directly) so tests can pass their own values.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new ConfigError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  const parsed = result.data;
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    requestBodyLimit: parsed.REQUEST_BODY_LIMIT,
    version: packageJson.version,
    requestEngine: {
      allowlist: parseAllowlist(parsed.SSRF_ALLOWLIST) ?? new Set(),
      defaultTimeoutMs: parsed.REQUEST_TIMEOUT_DEFAULT_MS,
      maxTimeoutMs: parsed.REQUEST_TIMEOUT_MAX_MS,
      maxResponseBytes: parsed.RESPONSE_MAX_BYTES,
      maxRedirects: parsed.MAX_REDIRECTS,
      userAgent: `API-Sentinel/${packageJson.version}`,
    },
  };
}
