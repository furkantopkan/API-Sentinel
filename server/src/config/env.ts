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
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  REQUEST_BODY_LIMIT: z
    .string()
    .trim()
    .regex(/^\d+(b|kb|mb)$/i, 'must look like "1mb", "500kb" or "1024b"')
    .default('1mb'),
});

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  /** Max size of JSON bodies our own API accepts (express.json limit). */
  readonly requestBodyLimit: string;
  readonly version: string;
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
    throw new ConfigError(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }

  return {
    port: result.data.PORT,
    host: result.data.HOST,
    requestBodyLimit: result.data.REQUEST_BODY_LIMIT,
    version: packageJson.version,
  };
}
