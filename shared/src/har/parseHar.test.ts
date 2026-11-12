import { describe, expect, it } from 'vitest';
import { MAX_RECORDED_ENTRIES, MAX_RESPONSE_SAMPLE } from '../schemas/builder';
import { isUserAction, keepActions, parseHar } from './parseHar';

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

  it('keeps JSON API traffic and pages, numbered from zero, and leaves out scripts', () => {
    const entries = parsedEntries(
      entry('https://a.test/page', {
        mime: 'text/html',
        type: 'document',
        text: '<html><head><title>Shop</title><script>var x = 1;</script></head><body><h1>Books</h1></body></html>',
      }),
      entry('https://a.test/app.js', { mime: 'text/javascript', type: 'script' }),
      entry('https://a.test/users', { method: 'post', body: '{"n":1}' }),
    );
    expect(entries).toEqual([
      {
        index: 0,
        method: 'GET',
        url: 'https://a.test/page',
        status: 200,
        requestHeaders: [],
        requestBody: '',
        responseContentType: 'text/html',
        responseSample: 'Shop\nBooks',
      },
      {
        index: 1,
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

  // Seen on a real shop: "add to cart" answered JSON labelled as text/html.
  it('keeps JSON that the server labelled as something else', () => {
    const [first] = parsedEntries(
      entry('https://a.test/cart/add', {
        method: 'POST',
        mime: 'text/html; charset=utf-8',
        text: '{"msg":"<a href=\\"/b\\">Book</a> added","count":1}',
      }),
    );
    // The markup inside it must stay: it is JSON, not a page.
    expect(first?.responseSample).toBe('{"msg":"<a href=\\"/b\\">Book</a> added","count":1}');
  });

  it('keeps a change whatever it answers, but not a read that is not JSON', () => {
    const entries = parsedEntries(
      entry('https://a.test/cart/remove', { method: 'POST', mime: 'text/html', text: '<p>ok</p>' }),
      entry('https://a.test/widget', { mime: 'text/html', text: '<p>ad</p>' }),
      entry('https://a.test/cart/fail', {
        method: 'POST',
        mime: 'text/html',
        status: 500,
        text: '<p>error</p>',
      }),
    );
    expect(entries.map((e) => e.url)).toEqual(['https://a.test/cart/remove']);
    expect(entries[0]?.responseSample).toBe('ok');
  });

  it('keeps only loaded pages of the site the recording started on', () => {
    const page = (url: string, status = 200) =>
      entry(url, { mime: 'text/html', type: 'document', status, text: '<p>x</p>' });
    const entries = parsedEntries(
      page('https://shop.test/'),
      page('https://ads.test/frame'),
      page('https://shop.test/old', 302),
      page('https://shop.test/cart'),
    );
    expect(entries.map((e) => e.url)).toEqual(['https://shop.test/', 'https://shop.test/cart']);
  });

  it('turns a multipart form into a urlencoded form the request builder can send', () => {
    const body =
      '--XY\r\nContent-Disposition: form-data; name="product_id"\r\n\r\n674543\r\n--XY\r\nContent-Disposition: form-data; name="note"\r\n\r\na b&c\r\n--XY--\r\n';
    const [first] = parsedEntries(
      entry('https://a.test/cart/add', {
        method: 'POST',
        body,
        headers: [['Content-Type', 'multipart/form-data; boundary=XY']],
      }),
    );
    expect(first?.requestBody).toBe('product_id=674543&note=a+b%26c');
    expect(first?.requestHeaders).toEqual([['Content-Type', 'application/x-www-form-urlencoded']]);
  });

  it('leaves out analytics beacons on the site itself', () => {
    expect(
      parsedEntries(entry('https://a.test/cdn-cgi/rum?', { method: 'POST', mime: 'text/plain' })),
    ).toEqual([]);
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

describe('keepActions', () => {
  const at = (index: number, method: string, mime = 'application/json') => ({
    index,
    method: method as 'GET',
    url: `https://a.test/${String(index)}`,
    status: 200,
    requestHeaders: [],
    requestBody: '',
    responseContentType: mime,
    responseSample: mime === 'text/html' ? 'Page' : '{}',
  });

  it('keeps every page and change and fills the rest with the earliest background reads', () => {
    const entries = [
      at(0, 'GET'),
      at(1, 'GET'),
      at(2, 'GET', 'text/html'),
      at(3, 'GET'),
      at(4, 'POST'),
    ];
    expect(keepActions(entries, 3).map((e) => e.url)).toEqual([
      'https://a.test/0',
      'https://a.test/2',
      'https://a.test/4',
    ]);
    expect(keepActions(entries, 3).map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it('treats JSON labelled as HTML as a background read, not a page', () => {
    expect(isUserAction({ ...at(0, 'GET', 'text/html'), responseSample: '{"a":1}' })).toBe(false);
    expect(isUserAction(at(0, 'DELETE'))).toBe(true);
  });
});

describe('parseHar with more requests than the limit', () => {
  it('keeps the last thing the user did', () => {
    const reads = Array.from({ length: MAX_RECORDED_ENTRIES + 5 }, (_, i) =>
      entry(`https://a.test/read/${String(i)}`),
    );
    const remove = entry('https://a.test/cart/remove', {
      method: 'POST',
      mime: 'text/html',
      text: '<p>removed</p>',
    });
    const result = parseHar(har(...reads, remove));
    if (!result.ok) throw new Error(result.error);
    expect(result.entries).toHaveLength(MAX_RECORDED_ENTRIES);
    expect(result.found).toBe(MAX_RECORDED_ENTRIES + 6);
    expect(result.entries.at(-1)?.url).toBe('https://a.test/cart/remove');
  });
});

describe('parseHar with what the recorder saw', () => {
  it('keeps who caused each request, and uses it to tell actions apart', () => {
    const result = parseHar(
      har(
        { ...entry('https://a.test/cart/add', { method: 'POST' }), _trigger: 'user' },
        { ...entry('https://a.test/recently-viewed', { method: 'POST' }), _trigger: 'page' },
        entry('https://a.test/plain'),
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.trigger)).toEqual(['user', 'page', undefined]);
    expect(result.entries.map(isUserAction)).toEqual([true, false, false]);
  });

  it('keeps a classic form sent as a page load, also when it redirects', () => {
    const entries = parsedEntries(
      entry('https://a.test/login', {
        method: 'POST',
        type: 'document',
        mime: 'text/html',
        status: 302,
        text: '',
      }),
      entry('https://a.test/old', { type: 'document', mime: 'text/html', status: 302, text: '' }),
    );
    expect(entries.map((e) => `${e.method} ${e.url}`)).toEqual(['POST https://a.test/login']);
  });
});
