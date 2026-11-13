import { describe, expect, it } from 'vitest';
import { MAX_RECORDED_ENTRIES, MAX_RESPONSE_SAMPLE } from '../schemas/builder';
import { isAnalyticsUrl, isBotSensorBody, isUserAction, keepActions, parseHar } from './parseHar';

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
  it('uses only the user actions, but counts everything that was found', () => {
    const result = parseHar(
      har(
        { ...entry('https://a.test/cart/add', { method: 'POST' }), _trigger: 'user' },
        { ...entry('https://a.test/recently-viewed', { method: 'POST' }), _trigger: 'page' },
        entry('https://a.test/plain'),
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => [e.url, e.trigger])).toEqual([
      ['https://a.test/cart/add', 'user'],
    ]);
    expect(result.found).toBe(3);
  });

  it('tells actions apart by who caused them', () => {
    const recorded = (trigger: 'user' | 'page') => ({
      method: 'GET' as const,
      responseContentType: 'application/json',
      responseSample: '{}',
      trigger,
    });
    expect(isUserAction(recorded('user'))).toBe(true);
    expect(isUserAction({ ...recorded('page'), method: 'POST' })).toBe(false);
  });

  // Without the cart id the site fetched by itself, "add to cart" could not run.
  it('also uses a request of the site when a later action needs a value from it', () => {
    const result = parseHar(
      har(
        { ...entry('https://a.test/cart', { text: '{"cartId":"c-123456"}' }), _trigger: 'page' },
        { ...entry('https://a.test/ads', { text: '{"slot":"banner-1"}' }), _trigger: 'page' },
        {
          ...entry('https://a.test/cart/c-123456/items', { method: 'POST', body: '{"id":7}' }),
          _trigger: 'user',
        },
        {
          ...entry('https://a.test/later', { text: '{"token":"t-999999"}' }),
          _trigger: 'page',
        },
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => [e.index, e.url])).toEqual([
      [0, 'https://a.test/cart'],
      [1, 'https://a.test/cart/c-123456/items'],
    ]);
  });

  it('finds a needed value in a later header or body too, but not short values', () => {
    const result = parseHar(
      har(
        {
          ...entry('https://a.test/token', { text: '{"token":"tok-abcdef","n":1}' }),
          _trigger: 'page',
        },
        { ...entry('https://a.test/size', { text: '{"n":1}' }), _trigger: 'page' },
        {
          ...entry('https://a.test/me?n=1', { headers: [['Authorization', 'Bearer tok-abcdef']] }),
          _trigger: 'user',
        },
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.url)).toEqual([
      'https://a.test/token',
      'https://a.test/me?n=1',
    ]);
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

// On a real shop the draft filled with ad and tracking calls made right after each click.
describe('parseHar and other sites', () => {
  const page = entry('https://www.shop.com.tr/', {
    type: 'document',
    mime: 'text/html',
    text: '<p>x</p>',
  });
  const urls = (...more: unknown[]) => parsedEntries(page, ...more).map((e) => e.url);

  it('leaves out ad and tracking services, also when they answer JSON', () => {
    expect(
      urls(
        entry('https://www.google.com/ccm/collect?en=page_view', {
          method: 'POST',
          mime: 'text/plain',
          text: '',
        }),
        entry('https://bzr.openai.com/v1/sdk/events', { method: 'POST' }),
        entry('https://cdn.vendor.net/pixel-config.json'),
      ),
    ).toEqual(['https://www.shop.com.tr/']);
  });

  it('keeps JSON reads from a public API, and the other parts of the same site', () => {
    expect(
      urls(entry('https://api.github.com/users/octocat'), entry('https://img.shop.com.tr/list')),
    ).toEqual([
      'https://www.shop.com.tr/',
      'https://api.github.com/users/octocat',
      'https://img.shop.com.tr/list',
    ]);
  });

  it("never counts a change sent to another site as the user's", () => {
    const result = parseHar(
      har(
        { ...page, _trigger: 'user' },
        {
          ...entry('https://api.partner.com/orders', { method: 'POST' }),
          _trigger: 'user',
        },
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.url)).toEqual(['https://www.shop.com.tr/']);
    expect(result.found).toBe(2);
  });

  it('treats a shop under a country code as one site, but not two shops', () => {
    expect(
      urls(
        entry('https://other.com.tr/x', { method: 'POST', mime: 'text/html', text: '<p>ok</p>' }),
      ),
    ).toEqual(['https://www.shop.com.tr/']);
  });
});

describe('parseHar and subdomains of the site', () => {
  it('keeps a change sent to another part of the same site', () => {
    const entries = parsedEntries(
      entry('https://www.shop.com.tr/', { type: 'document', mime: 'text/html', text: '<p>x</p>' }),
      entry('https://cart.shop.com.tr/add', {
        method: 'POST',
        mime: 'text/html',
        text: '<p>ok</p>',
      }),
    );
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.shop.com.tr/',
      'https://cart.shop.com.tr/add',
    ]);
  });
});

describe('parseHar and values passed between requests of the site', () => {
  it('does not keep a site request whose value only another site request uses', () => {
    const result = parseHar(
      har(
        { ...entry('https://a.test/session', { text: '{"sid":"s-777777"}' }), _trigger: 'page' },
        { ...entry('https://a.test/recommend?sid=s-777777'), _trigger: 'page' },
        { ...entry('https://a.test/cart/add', { method: 'POST' }), _trigger: 'user' },
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.url)).toEqual(['https://a.test/cart/add']);
  });
});

// Seen on a real shop: Google Analytics sent through the shop's own address filled the draft.
describe('isAnalyticsUrl', () => {
  it.each([
    'https://www.hepsiburada.com/metrics/gs/measurement/conversion?random=1&cv=11&tid=G-44CSPTX731&gtm=45g9',
    'https://www.hepsiburada.com/metrics/ga/g/c?v=2&tid=G-44CSPTX731&gtm=45g92e',
    'https://www.hepsiburada.com/metrics/gs/ccm/collect?rcb=6&frm=0&tid=AW-866272902',
    'https://shop.test/g/collect?v=2&tid=G-ABC',
    'https://shop.test/api/x?gtm=45g9',
  ])('recognises %s', (url) => {
    expect(isAnalyticsUrl(url)).toBe(true);
  });

  it.each([
    'https://shop.test/collections/summer',
    'https://www.kitapyurdu.com/index.php?route=checkout/cart/add',
    'https://api.github.com/users/octocat',
    'https://shop.test/api/products?tid=123',
    'https://checkout.hepsiburada.com/api/basket/items',
  ])('leaves %s alone', (url) => {
    expect(isAnalyticsUrl(url)).toBe(false);
  });

  it('is applied to the site itself, not only to other sites', () => {
    const entries = parsedEntries(
      entry('https://www.shop.com/', { type: 'document', mime: 'text/html', text: '<p>x</p>' }),
      {
        ...entry('https://www.shop.com/metrics/ga/g/c?tid=G-1', {
          method: 'POST',
          mime: 'text/plain',
          text: '',
        }),
        _trigger: 'user',
      },
      { ...entry('https://www.shop.com/basket/add', { method: 'POST' }), _trigger: 'user' },
    );
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.shop.com/',
      'https://www.shop.com/basket/add',
    ]);
  });
});

describe('keepActions with more user actions than the limit', () => {
  const action = (index: number, method: string, mime = 'application/json') => ({
    index,
    method: method as 'GET',
    url: `https://a.test/${String(index)}`,
    status: 200,
    requestHeaders: [],
    requestBody: '',
    responseContentType: mime,
    responseSample: mime === 'text/html' ? 'Page' : '{}',
    trigger: 'user' as const,
  });

  // The "remove from cart" at the end was lost when the limit was full.
  it('gives up reads after a click first, then pages, and keeps the changes', () => {
    const entries = [
      action(0, 'GET', 'text/html'),
      action(1, 'GET'),
      action(2, 'GET'),
      action(3, 'POST'),
      action(4, 'GET', 'text/html'),
      action(5, 'DELETE'),
    ];
    expect(keepActions(entries, 4).map((e) => e.url)).toEqual([
      'https://a.test/0',
      'https://a.test/3',
      'https://a.test/4',
      'https://a.test/5',
    ]);
    expect(keepActions(entries, 2).map((e) => e.url)).toEqual([
      'https://a.test/3',
      'https://a.test/5',
    ]);
  });
});

describe('parseHar and a page redrawing itself after a click', () => {
  it("does not count recommendations, SEO texts or dictionaries as the user's", () => {
    const result = parseHar(
      har(
        { ...entry('https://shop.test/api/basket/item/1', { method: 'DELETE' }), _trigger: 'user' },
        { ...entry('https://reco.shop.test/recommendation?type=cart'), _trigger: 'user' },
        { ...entry('https://shop.test/api/v1/onlySeo', { method: 'POST' }), _trigger: 'user' },
        { ...entry('https://shop.test/api/v1/dictionary/98'), _trigger: 'user' },
        { ...entry('https://shop.test/api/products?brand=lenovo'), _trigger: 'user' },
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.url)).toEqual([
      'https://shop.test/api/basket/item/1',
      'https://shop.test/api/products?brand=lenovo',
    ]);
  });
});

describe('parseHar and best-seller boxes after a click', () => {
  it("does not count them as the user's", () => {
    const result = parseHar(
      har(
        { ...entry('https://shop.test/api/basket/item/1', { method: 'DELETE' }), _trigger: 'user' },
        { ...entry('https://shop.test/api/v1/product/top-selling?size=4'), _trigger: 'user' },
      ),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.entries.map((e) => e.url)).toEqual(['https://shop.test/api/basket/item/1']);
  });
});

// Seen on a real shop: accepting cookies started ad services, which answered
// JSON within the click's window; the user then changed the quantity twice.
describe('parseHar with what the user clicked', () => {
  const page = {
    ...entry('https://www.shop.com.tr/', { type: 'document', mime: 'text/html', text: '<p>x</p>' }),
    _trigger: 'user',
  };
  const mine = (url: string, options: Options = {}, action?: string) => ({
    ...entry(url, options),
    _trigger: 'user',
    ...(action === undefined ? {} : { _action: action }),
  });

  it("leaves out another site's reads after a click unless a later step needs their value", () => {
    const entries = parsedEntries(
      page,
      mine('https://gum.criteo.com/sid/json', { text: '{"sid":"zzz"}' }, 'Click "Accept"'),
      mine('https://ads.example.net/config', { text: '{"cfg":"ok"}' }),
      mine('https://api.partner.com/token', { text: '{"token":"tok-123456"}' }),
      mine('https://www.shop.com.tr/api/cart', { method: 'POST', body: '{"t":"tok-123456"}' }),
    );
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.shop.com.tr/',
      'https://api.partner.com/token',
      'https://www.shop.com.tr/api/cart',
    ]);
    expect(entries[1]?.trigger).toBe('page');
  });

  it('keeps a change made twice to the same address, but a read only once', () => {
    const entries = parsedEntries(
      page,
      mine('https://www.shop.com.tr/api/basket/item/9', { method: 'PATCH', body: '{"q":2}' }),
      mine('https://www.shop.com.tr/api/basket/item/9', { method: 'PATCH', body: '{"q":1}' }),
      mine('https://www.shop.com.tr/api/basket'),
      mine('https://www.shop.com.tr/api/basket'),
    );
    expect(entries.map((e) => `${e.method} ${e.requestBody}`)).toEqual([
      'GET ',
      'PATCH {"q":2}',
      'PATCH {"q":1}',
      'GET ',
    ]);
  });

  it("keeps what the user clicked on the user's own requests only", () => {
    const entries = parsedEntries(
      { ...page, _action: 'Click "Home"' },
      // Sent by the page, but kept: the change below uses its value.
      {
        ...entry('https://www.shop.com.tr/api/session', { text: '{"sid":"s-777777"}' }),
        _trigger: 'page',
        _action: 'Click "Home"',
      },
      mine(
        'https://www.shop.com.tr/api/basket',
        { method: 'PUT', body: '{"sid":"s-777777"}' },
        'Click "Sepete ekle"',
      ),
    );
    expect(entries.map((e) => e.action)).toEqual([
      'Click "Home"',
      undefined,
      'Click "Sepete ekle"',
    ]);
  });
});

// Seen on a real shop (Akamai): after every click, a POST to a random address of the site itself.
describe('parseHar and bot protection sensors', () => {
  it('leaves out a sensor report, known only by its body', () => {
    const entries = parsedEntries(
      entry('https://www.shop.com.tr/', { type: 'document', mime: 'text/html', text: '<p>x</p>' }),
      entry('https://www.shop.com.tr/X1ewx77xw93/ru3cck/EmQxAg', {
        method: 'POST',
        body: '{"sensor_data":"3;0;1;0;3159619"}',
        status: 201,
      }),
      entry('https://www.shop.com.tr/api/basket', { method: 'POST', body: '{"sku":"7"}' }),
    );
    expect(entries.map((e) => e.url)).toEqual([
      'https://www.shop.com.tr/',
      'https://www.shop.com.tr/api/basket',
    ]);
  });

  it('is not fooled by a body that only mentions the word', () => {
    expect(isBotSensorBody('{"sensor_data":"x"}')).toBe(true);
    expect(isBotSensorBody('{"note":"sensor_data"}')).toBe(false);
    expect(isBotSensorBody('')).toBe(false);
  });
});
