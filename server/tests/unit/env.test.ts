import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env';

// loadConfig takes the environment as a parameter, so each test can pass its
// own values without touching the real process.env.

describe('loadConfig', () => {
  it('uses safe defaults when no variables are set', () => {
    const config = loadConfig({});

    expect(config).toMatchObject({ port: 3001, host: '127.0.0.1', requestBodyLimit: '1mb' });
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('converts PORT from string to number', () => {
    expect(loadConfig({ PORT: '4000' }).port).toBe(4000);
  });

  it('ignores variables it does not know about', () => {
    expect(() => loadConfig({ SOMETHING_ELSE: 'x', ANTHROPIC_API_KEY: 'secret' })).not.toThrow();
  });

  it.each([
    ['abc', 'not a number'],
    ['0', 'below the valid range'],
    ['70000', 'above the valid range'],
    ['30.5', 'not an integer'],
    ['', 'empty'],
  ])('rejects PORT=%j (%s)', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError);
  });

  it('names the invalid variable in the error message', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it.each(['1mb', '500kb', '1024b', '2MB'])('accepts REQUEST_BODY_LIMIT=%j', (limit) => {
    expect(loadConfig({ REQUEST_BODY_LIMIT: limit }).requestBodyLimit).toBe(limit);
  });

  it.each(['huge', '1gb', '-1mb', 'mb'])('rejects REQUEST_BODY_LIMIT=%j', (limit) => {
    expect(() => loadConfig({ REQUEST_BODY_LIMIT: limit })).toThrow(/REQUEST_BODY_LIMIT/);
  });

  it('parses SSRF_ALLOWLIST into lower-case host:port entries', () => {
    const config = loadConfig({ SSRF_ALLOWLIST: ' LocalHost:4010 , [::1]:8080 ,' });

    expect([...config.requestEngine.allowlist]).toEqual(['localhost:4010', '[::1]:8080']);
  });

  it('defaults to an empty allowlist (everything private is blocked)', () => {
    expect(loadConfig({}).requestEngine.allowlist.size).toBe(0);
  });

  it.each(['localhost', 'localhost:0', 'localhost:70000', 'http://localhost:4010', '*:80'])(
    'rejects SSRF_ALLOWLIST=%j',
    (raw) => {
      expect(() => loadConfig({ SSRF_ALLOWLIST: raw })).toThrow(/SSRF_ALLOWLIST/);
    },
  );

  it('rejects a default timeout above the maximum', () => {
    expect(() =>
      loadConfig({ REQUEST_TIMEOUT_DEFAULT_MS: '9000', REQUEST_TIMEOUT_MAX_MS: '5000' }),
    ).toThrow(/REQUEST_TIMEOUT_DEFAULT_MS/);
  });

  it('reports every invalid variable at once', () => {
    let message = '';
    try {
      loadConfig({ PORT: '70000', REQUEST_BODY_LIMIT: 'huge' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('PORT');
    expect(message).toContain('REQUEST_BODY_LIMIT');
  });
});
