import { describe, expect, it } from 'vitest';
import { MAX_RECORDED_ENTRIES, MAX_RESPONSE_SAMPLE } from '../schemas/builder';
import { parseHar } from './parseHar';

interface Options {
  method?: string;
  mime?: string;
  status?: number;
  type?: string;
  text?: string;
  encoding?: string;
  headers?: [string, string][];
  body?: string;
}

const har = (...entries: unknown[]) => ({ log: { entries } });

function entry(url: string, options: Options = {}) {
  return {
    _resourceType: options.type ?? 'fetch',
    request: {
      method: options.method ?? 'GET',
      url,
      headers: (options.headers ?? []).map(([name, value]) => ({ name, value })),
      ...(options.body === undefined ? {} : { postData: { text: options.body } }),
    },
    response: {
      status: options.status ?? 200,
      content: {
        mimeType: options.mime ?? 'application/json',
        text: options.text ?? '{"a":1}',
        ...(options.encoding === undefined ? {} : { encoding: options.encoding }),
      },
    },
  };
}

const parsedEntries = (...entries: unknown[]) => {
  const result = parseHar(har(...entries));
  if (!result.ok) throw new Error(result.error);
  return result.entries;
};

describe('parseHar', () => {
  it('rejects anything that is not a HAR recording', () => {
    expect(parseHar({ hello: 'world' })).toEqual({
      ok: false,
      error: 'This file is not a valid HAR recording.',
    });
  });

  it('keeps JSON API traffic and numbers it from zero', () => {
    const entries = parsedEntries(
      entry('https://a.test/page', { mime: 'text/html', type: 'document' }),
      entry('https://a.test/app.js', { mime: 'text/javascript', type: 'script' }),
      entry('https://a.test/users', { method: 'post', body: '{"n":1}' }),
    );
    expect(entries).toEqual([
      {
        index: 0,
        method: 'POST',
        url: 'https://a.test/users',
        status: 200,
        requestHeaders: [],
        requestBody: '{"n":1}',
        responseContentType: 'application/json',
        responseSample: '{"a":1}',
      },
    ]);
  });

  it('keeps a write that answers with no content, but not such a read', () => {
    const entries = parsedEntries(
      entry('https://a.test/orders/1', { method: 'DELETE', mime: '', status: 204, text: '' }),
      entry('https://a.test/ping', { mime: '', status: 204, text: '' }),
    );
    expect(entries.map((e) => e.method)).toEqual(['DELETE']);
  });

  it('removes repeats of the same method and URL', () => {
    const url = 'https://a.test/users';
    expect(parsedEntries(entry(url), entry(url), entry(url, { method: 'POST' }))).toHaveLength(2);
  });

  it('drops cookies and headers added by the browser, and keeps the rest', () => {
    const [first] = parsedEntries(
      entry('https://a.test/me', {
        headers: [
          ['Cookie', 'sid=1'],
          ['User-Agent', 'x'],
          ['sec-ch-ua', 'x'],
          [':authority', 'a.test'],
          ['X-Tenant', 'acme'],
        ],
      }),
    );
    expect(first?.requestHeaders).toEqual([['X-Tenant', 'acme']]);
  });

  it.each([
    'https://tracker.shop.test/api/6/envelope/?sentry_version=7',
    'https://o1.ingest.sentry.io/api/1/store/',
    'https://www.google-analytics.com/g/collect',
    'https://region1.analytics.google.com/g/collect',
    'https://stats.g.doubleclick.net/collect',
    'https://www.clarity.ms/collect',
  ])('leaves out telemetry: %s', (url) => {
    expect(parsedEntries(entry(url))).toEqual([]);
  });

  it('does not mistake an ordinary API for telemetry', () => {
    const urls = [
      'https://api.shop.test/api/6/orders/',
      'https://shop.test/segments/list',
      'https://api.github.com/users/sentry.io',
    ];
    expect(parsedEntries(...urls.map((url) => entry(url))).map((e) => e.url)).toEqual(urls);
  });

  it('ignores a response body stored as base64', () => {
    const [first] = parsedEntries(entry('https://a.test/x', { encoding: 'base64', text: 'e30=' }));
    expect(first?.responseSample).toBe('');
  });

  it('cuts long bodies and reports how many requests were found in total', () => {
    const urls = Array.from(
      { length: MAX_RECORDED_ENTRIES + 3 },
      (_, i) => `https://a.test/${String(i)}`,
    );
    const result = parseHar(
      har(...urls.map((url) => entry(url, { text: 'x'.repeat(MAX_RESPONSE_SAMPLE + 10) }))),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.found).toBe(MAX_RECORDED_ENTRIES + 3);
    expect(result.entries).toHaveLength(MAX_RECORDED_ENTRIES);
    expect(result.entries[0]?.responseSample).toHaveLength(MAX_RESPONSE_SAMPLE);
  });
});
