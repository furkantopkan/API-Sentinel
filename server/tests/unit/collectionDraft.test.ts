import type {
  CollectionDraftOutput,
  RecordedEntry,
  SuggestedAssertion,
} from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { checkDraft, visiblePartOf } from '../../src/services/ai-engine/collectionDraft';
import {
  MAX_RECORDING_CHARS,
  fitRecording,
  endpointOf,
  formatRecording,
} from '../../src/services/ai-engine/prompts';

function recorded(index: number, url: string, responseSample = '{"id":1}'): RecordedEntry {
  return {
    index,
    method: 'GET',
    url,
    status: 200,
    requestHeaders: [],
    requestBody: '',
    responseContentType: 'application/json',
    responseSample,
  };
}

type Step = CollectionDraftOutput['steps'][number];

function step(sourceIndex: number, url: string, extra: Partial<Step> = {}): Step {
  return {
    sourceIndex,
    name: 'Step',
    url,
    headers: [],
    body: '',
    assertions: [],
    captures: [],
    ...extra,
  };
}

function output(steps: Step[], variables: CollectionDraftOutput['variables'] = []) {
  return { collectionName: 'Flow', steps, variables, notes: [] };
}

const BASE = { key: 'baseUrl', value: 'https://a.test', secret: false };
const ENTRIES = [recorded(0, 'https://a.test/users'), recorded(1, 'https://a.test/orders')];
const check = (
  draft: CollectionDraftOutput,
  entries = ENTRIES,
  samples = new Map<number, string>(),
) => checkDraft(draft, entries, samples);

const jsonPath = (target: string): SuggestedAssertion => ({
  kind: 'jsonPath',
  target,
  operator: 'exists',
  expected: '',
});

describe('checkDraft: every step must come from the recording', () => {
  it('keeps a traceable step and takes the method from the recording', () => {
    const { draft, droppedSteps } = check(output([step(0, '{{baseUrl}}/users')], [BASE]));
    expect(droppedSteps).toBe(0);
    expect(draft.steps[0]).toMatchObject({ method: 'GET', url: '{{baseUrl}}/users' });
  });

  it('drops a step that points at no recorded request', () => {
    const { draft, droppedSteps } = check(output([step(9, '{{baseUrl}}/users')], [BASE]));
    expect(draft.steps).toEqual([]);
    expect(droppedSteps).toBe(1);
  });

  it('drops a step moved to another server', () => {
    const { draft } = check(output([step(0, 'https://evil.test/users')]));
    expect(draft.steps).toEqual([]);
  });

  it('drops a step whose variable is never defined', () => {
    expect(check(output([step(0, '{{nope}}/users')])).draft.steps).toEqual([]);
  });

  it('drops a step that copied a masked value', () => {
    const headers = [{ key: 'Authorization', value: 'Bearer [REDACTED]' }];
    expect(check(output([step(0, 'https://a.test/users', { headers })])).draft.steps).toEqual([]);
  });

  it('removes headers the server would refuse', () => {
    const headers = [
      { key: 'Host', value: 'x' },
      { key: 'X-Tenant', value: 'acme' },
    ];
    const { draft } = check(output([step(0, 'https://a.test/users', { headers })]));
    expect(draft.steps[0]?.headers).toEqual([{ key: 'X-Tenant', value: 'acme' }]);
  });

  it('never keeps a value for a secret variable', () => {
    const variables = [
      { key: 'apiToken', value: 'guessed', secret: true },
      { key: 'copied', value: 'x[REDACTED]', secret: false },
    ];
    expect(check(output([], variables)).draft.variables).toEqual([
      { key: 'apiToken', value: '', secret: true },
      { key: 'copied', value: '', secret: true },
    ]);
  });
});

describe('checkDraft: captures', () => {
  const capture = { variable: 'userId', path: 'id', secret: false };

  it('allows a later step to use a captured value', () => {
    const { draft } = check(
      output([
        step(0, 'https://a.test/users', { captures: [capture] }),
        step(1, 'https://a.test/orders?user={{userId}}'),
      ]),
    );
    expect(draft.steps).toHaveLength(2);
    expect(draft.steps[0]?.captures).toEqual([capture]);
  });

  it('does not allow a step to use a value captured after it', () => {
    const { draft } = check(
      output([
        step(1, 'https://a.test/orders?user={{userId}}'),
        step(0, 'https://a.test/users', { captures: [capture] }),
      ]),
    );
    expect(draft.steps.map((s) => s.sourceIndex)).toEqual([0]);
  });

  // A failing capture fails its step, so one nobody reads can only do harm.
  it('removes a capture that no later step uses', () => {
    const { draft } = check(
      output([
        step(0, 'https://a.test/users', { captures: [capture] }),
        step(1, 'https://a.test/orders'),
      ]),
    );
    expect(draft.steps[0]?.captures).toEqual([]);
  });

  it('keeps a capture used only in a header or body', () => {
    const { draft } = check(
      output([
        step(0, 'https://a.test/users', {
          captures: [capture, { variable: 'cart', path: 'cart', secret: false }],
        }),
        step(1, 'https://a.test/orders', {
          headers: [{ key: 'X-User', value: '{{userId}}' }],
          body: '{"cart":"{{cart}}"}',
        }),
      ]),
    );
    expect(draft.steps[0]?.captures.map((c) => c.variable)).toEqual(['userId', 'cart']);
  });
});

describe('checkDraft: assertions match what the response can satisfy', () => {
  const arrayEntry = [recorded(0, 'https://a.test/list', '[{"name":"x"}]')];

  it('starts a path with an index when the recorded response is an array', () => {
    const assertions = [jsonPath('name'), jsonPath('[1].name'), jsonPath('')];
    const { draft } = check(output([step(0, 'https://a.test/list', { assertions })]), arrayEntry);
    expect(draft.steps[0]?.assertions.map((a) => a.target)).toEqual(['[0].name', '[1].name', '']);
  });

  it('leaves paths alone when the recorded response is an object', () => {
    const assertions = [jsonPath('name')];
    const { draft } = check(output([step(0, 'https://a.test/users', { assertions })]));
    expect(draft.steps[0]?.assertions[0]?.target).toBe('name');
  });

  // Seen on the real shop: [0].count for {"success":"…","count":1}.
  it('removes an index the model put in front of a path into an object', () => {
    const cart = [recorded(0, 'https://a.test/cart', '{"success":"added","count":1}')];
    const assertions = [jsonPath('[0].count'), jsonPath('[0]success'), jsonPath('[0].missing')];
    const { draft } = check(output([step(0, 'https://a.test/cart', { assertions })]), cart);
    expect(draft.steps[0]?.assertions.map((a) => a.target)).toEqual([
      'count',
      'success',
      '[0].missing',
    ]);
  });

  it('removes it as well when the object sample was cut off', () => {
    const cut = [recorded(0, 'https://a.test/cart', '{"count":1,"items":[{"na')];
    const assertions = [jsonPath('[0].count')];
    const { draft } = check(output([step(0, 'https://a.test/cart', { assertions })]), cut);
    expect(draft.steps[0]?.assertions[0]?.target).toBe('count');
  });

  // A check that fails on the recorded answer would fail on every run.
  it('drops assertions the recorded response does not satisfy', () => {
    const sample = '{"success":"<a href=\\"/b/7\\">Book</a> added","count":1}';
    const cart = [recorded(0, 'https://a.test/cart', sample)];
    const equals = (target: string, expected: string): SuggestedAssertion => ({
      kind: 'jsonPath',
      target,
      operator: 'equals',
      expected,
    });
    const status = (expected: string): SuggestedAssertion => ({
      kind: 'status',
      target: '',
      operator: 'equals',
      expected,
    });
    const assertions = [
      equals('success', '"Book added"'),
      equals('count', '1'),
      jsonPath('title'),
      status('201'),
      status('200'),
      equals('count', '{{expected}}'),
      { kind: 'responseTime', target: '', operator: 'lessThan', expected: '500' } as const,
    ];
    const { draft, droppedAssertions } = check(
      output([step(0, 'https://a.test/cart', { assertions })]),
      cart,
      new Map([[0, sample]]),
    );
    expect(draft.steps[0]?.assertions.map((a) => `${a.kind} ${a.target} ${a.expected}`)).toEqual([
      'jsonPath count 1',
      'status  200',
      'jsonPath count {{expected}}',
      'responseTime  500',
    ]);
    expect(droppedAssertions).toBe(3);
  });

  it('keeps a path that is right as written', () => {
    const nested = [recorded(0, 'https://a.test/x', '{"data":{"banners":[{"id":1}]}}')];
    const assertions = [jsonPath('data.banners[0].id')];
    const { draft } = check(output([step(0, 'https://a.test/x', { assertions })]), nested);
    expect(draft.steps[0]?.assertions[0]?.target).toBe('data.banners[0].id');
  });

  it('applies the same correction to captures', () => {
    const { draft } = check(
      output([
        step(0, 'https://a.test/list', {
          captures: [{ variable: 'first', path: 'name', secret: false }],
        }),
        step(0, 'https://a.test/list?n={{first}}'),
      ]),
      arrayEntry,
    );
    expect(draft.steps[0]?.captures[0]?.path).toBe('[0].name');
  });

  it('drops body text that the recorded response never contained', () => {
    const body = (expected: string): SuggestedAssertion => ({
      kind: 'body',
      target: '',
      operator: 'contains',
      expected,
    });
    const { draft, droppedAssertions } = check(
      output([
        step(0, 'https://a.test/users', { assertions: [body('"id":1'), body('{"id": 1}')] }),
      ]),
      ENTRIES,
      new Map([[0, '{"id":1}']]),
    );
    expect(draft.steps[0]?.assertions.map((a) => a.expected)).toEqual(['"id":1']);
    expect(droppedAssertions).toBe(1);
  });

  it('removes assertions our engine cannot run', () => {
    const invalid: SuggestedAssertion = {
      kind: 'status',
      target: '',
      operator: 'isNull',
      expected: '',
    };
    const { draft, droppedAssertions } = check(
      output([step(0, 'https://a.test/users', { assertions: [invalid] })]),
    );
    expect(draft.steps[0]?.assertions).toEqual([]);
    expect(droppedAssertions).toBe(1);
  });
});

describe('fitRecording: a long recording must fit the model', () => {
  const sized = (index: number, chars: number) =>
    recorded(index, `https://a.test/${String(index)}`, 'x'.repeat(chars));
  const size = (entries: RecordedEntry[]) =>
    entries.reduce((sum, e) => sum + e.responseSample.length + e.url.length + 120, 0);

  const page = (index: number) => ({
    ...sized(index, 3000),
    method: 'GET' as const,
    responseContentType: 'text/html',
    responseSample: `Page ${String(index)}
${'x'.repeat(2990)}`,
  });
  const change = (index: number) => ({ ...sized(index, 3000), method: 'POST' as const });

  it('does not touch a recording that fits', () => {
    const entries = [sized(0, 3000), sized(1, 10)];
    expect(fitRecording(entries)).toEqual({ entries, omitted: [] });
  });

  it('shortens large responses first and leaves small ones whole', () => {
    const entries = [sized(0, 50), ...Array.from({ length: 30 }, (_, i) => sized(i + 1, 3000))];
    const fitted = fitRecording(entries);
    expect(fitted.omitted).toEqual([]);
    expect(fitted.entries[0]?.responseSample).toHaveLength(50);
    expect(fitted.entries[1]?.responseSample.length).toBeLessThan(3000);
    expect(size(fitted.entries)).toBeLessThanOrEqual(MAX_RECORDING_CHARS);
  });

  // Seen on a real shop: "remove from cart", the last thing the user did, was cut.
  it('gives up background reads, never the pages and changes of the user', () => {
    const headers: [string, string][] = [['X-Long', 'v'.repeat(1500)]];
    const background = Array.from({ length: 12 }, (_, i) => ({
      ...sized(i, 3000),
      requestHeaders: headers,
    }));
    const entries = [...background, page(12), change(13), page(14), change(15)];
    const fitted = fitRecording(entries);
    const kept = fitted.entries.map((e) => e.index);
    expect(kept).toEqual(expect.arrayContaining([12, 13, 14, 15]));
    expect(fitted.omitted.length).toBeGreaterThan(0);
    expect(fitted.omitted.every((e) => e.index < 12)).toBe(true);
    expect(kept.length + fitted.omitted.length).toBe(16);
    expect(size(fitted.entries)).toBeLessThanOrEqual(MAX_RECORDING_CHARS);
  });

  it('gives up repeats of an endpoint before other background reads', () => {
    const headers: [string, string][] = [['X-Long', 'v'.repeat(2500)]];
    const banner = (index: number) => ({
      ...sized(index, 3000),
      url: `https://a.test/banners?id=${String(index)}`,
      requestHeaders: headers,
    });
    const entries = [
      banner(0),
      ...Array.from({ length: 6 }, (_, i) => banner(i + 1)),
      { ...sized(7, 3000), requestHeaders: headers },
    ];
    const fitted = fitRecording(entries);
    expect(fitted.entries.map((e) => e.index)).toEqual(expect.arrayContaining([0, 7]));
  });

  // 14 banner calls made the model repeat itself until its limit on a real shop.
  it('always leaves out repeated background reads of one endpoint, but never repeated actions', () => {
    const banner = (index: number) =>
      recorded(index, `https://a.test/banners?slot=${String(index)}`, '{}');
    const post = (index: number) => ({
      ...recorded(index, 'https://a.test/cart/add', '{}'),
      method: 'POST' as const,
    });
    const fitted = fitRecording([banner(0), banner(1), banner(2), post(3), post(4)]);
    expect(fitted.entries.map((e) => e.index)).toEqual([0, 3, 4]);
    expect(fitted.omitted.map((e) => e.index)).toEqual([1, 2]);
  });

  it('as a last resort leaves out the latest actions, keeping the order', () => {
    const headers: [string, string][] = [['X-Long', 'v'.repeat(4000)]];
    const entries = Array.from({ length: 12 }, (_, i) => ({
      ...change(i),
      requestHeaders: headers,
    }));
    const fitted = fitRecording(entries);
    expect(fitted.omitted.length).toBeGreaterThan(0);
    expect(fitted.entries.map((e) => e.index)).toEqual(
      Array.from({ length: fitted.entries.length }, (_, i) => i),
    );
  });
});

// Without its Content-Type a form body would be sent as JSON and rejected.
describe('checkDraft: form bodies', () => {
  const form: RecordedEntry = {
    ...recorded(0, 'https://a.test/cart/add', '{"count":1}'),
    method: 'POST',
    requestHeaders: [['Content-Type', 'application/x-www-form-urlencoded']],
    requestBody: 'product_id=7',
  };

  it('adds the recorded Content-Type when the model left it out', () => {
    const { draft } = check(
      output([step(0, '{{baseUrl}}/cart/add', { body: 'product_id=7' })], [BASE]),
      [form],
    );
    expect(draft.steps[0]?.headers).toEqual([
      { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    ]);
  });

  it('keeps the header the model wrote, and adds nothing to a step without a body', () => {
    const own = [{ key: 'content-type', value: 'application/json' }];
    const { draft } = check(
      output(
        [
          step(0, '{{baseUrl}}/cart/add', { body: '{"id":7}', headers: own }),
          step(0, '{{baseUrl}}/cart/add'),
        ],
        [BASE],
      ),
      [form],
    );
    expect(draft.steps.map((s) => s.headers)).toEqual([own, []]);
  });
});

// "Remove from cart" was missing from a real draft: what the user did must always be there.
describe('checkDraft: every page and change of the user is in the flow', () => {
  const pageEntry = (index: number, path: string, text: string): RecordedEntry => ({
    ...recorded(index, `https://a.test${path}`, text),
    responseContentType: 'text/html; charset=utf-8',
  });
  const removeEntry: RecordedEntry = {
    ...recorded(3, 'https://a.test/cart/remove?id=7', ''),
    method: 'POST',
    responseContentType: 'text/html',
  };
  const recording = [
    pageEntry(0, '/product/7', 'Mock Book 7\nAdd to cart'),
    recorded(1, 'https://a.test/banners'),
    pageEntry(2, '/cart', 'My cart\nMock Book 7'),
    removeEntry,
  ];
  const samples = new Map(recording.map((e) => [e.index, e.responseSample]));

  it('adds the ones the AI left out, in recorded order, with what is certain', () => {
    const { draft, addedSteps } = checkDraft(
      output([step(2, '{{baseUrl}}/cart')], [BASE]),
      recording,
      samples,
    );
    expect(addedSteps).toBe(2);
    expect(draft.steps.map((s) => [s.sourceIndex, s.method, s.url])).toEqual([
      [0, 'GET', '{{baseUrl}}/product/7'],
      [2, 'GET', '{{baseUrl}}/cart'],
      [3, 'POST', '{{baseUrl}}/cart/remove?id=7'],
    ]);
    expect(draft.steps.map((s) => s.name)).toEqual([
      'Open: Mock Book 7',
      'Step', // written by the model
      'POST cart/remove',
    ]);
    expect(draft.steps[0]?.assertions).toEqual([
      { kind: 'status', target: '', operator: 'equals', expected: '200' },
      { kind: 'body', target: '', operator: 'contains', expected: 'Mock Book 7' },
    ]);
    expect(draft.steps[2]?.assertions).toEqual([
      { kind: 'status', target: '', operator: 'equals', expected: '200' },
    ]);
  });

  it('also adds the ones the AI never saw, and leaves background reads out', () => {
    const { draft } = checkDraft(output([], []), recording.slice(0, 2), samples, recording);
    expect(draft.steps.map((s) => s.sourceIndex)).toEqual([0, 2, 3]);
    expect(draft.variables).toEqual([{ key: 'baseUrl', value: 'https://a.test', secret: false }]);
  });

  it('turns masked values of a recorded login into blank secret variables', () => {
    const login: RecordedEntry = {
      ...recorded(0, 'https://a.test/login?token=[REDACTED]', '{"ok":true}'),
      method: 'POST',
      requestHeaders: [
        ['Content-Type', 'application/x-www-form-urlencoded'],
        ['Authorization', '[REDACTED]'],
      ],
      requestBody: 'email=ada%40x.test&password=[REDACTED]',
    };
    const json: RecordedEntry = {
      ...recorded(1, 'https://a.test/api/session', '{}'),
      method: 'POST',
      requestBody: '{\n  "user": "ada",\n  "password": "[REDACTED]"\n}',
    };
    const { draft } = checkDraft(output([], [BASE]), [login, json], new Map());
    expect(draft.steps[0]).toMatchObject({
      url: '{{baseUrl}}/login?token={{token}}',
      body: 'email=ada%40x.test&password={{password}}',
      headers: [
        { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
        { key: 'Authorization', value: '{{Authorization}}' },
      ],
    });
    expect(draft.steps[1]?.body).toBe('{\n  "user": "ada",\n  "password": "{{password}}"\n}');
    expect(draft.variables).toEqual(
      expect.arrayContaining([
        { key: 'token', value: '', secret: true },
        { key: 'password', value: '', secret: true },
        { key: 'Authorization', value: '', secret: true },
      ]),
    );
    expect(JSON.stringify(draft)).not.toContain('[REDACTED]');
  });
});

describe('visiblePartOf: a JSON sample cut off at the size limit', () => {
  it.each([
    ['{"a":1,"b":{"c":[1,2', { a: 1, b: { c: [1] } }],
    ['{"data":{"banners":[{"title":"x, y"},{"tit', { data: { banners: [{ title: 'x, y' }] } }],
    ['[{"id":1},{"id":2}', [{ id: 1 }, { id: 2 }]],
    ['{"text":"a \\" quote, still text', undefined],
    ['not json', undefined],
  ])('reads the finished part of %s', (text, expected) => {
    expect(visiblePartOf(text)).toEqual(expected);
  });

  it('drops an assertion on a field that is not in the visible part', () => {
    const sample = `{"data":{"banners":[{"title":"Sale"}${',{"title":"x"}'.repeat(400)}`;
    const cut = [recorded(0, 'https://a.test/b', sample.slice(0, 3000))];
    const assertions = [jsonPath('title'), jsonPath('data.banners[0].title')];
    const { draft } = check(
      output([step(0, 'https://a.test/b', { assertions })]),
      cut,
      new Map([[0, sample.slice(0, 3000)]]),
    );
    expect(draft.steps[0]?.assertions.map((a) => a.target)).toEqual(['data.banners[0].title']);
  });
});

// On a real shop the draft filled up with requests the site sent by itself.
describe('checkDraft: requests the site sent by itself', () => {
  const user = (entry: RecordedEntry): RecordedEntry => ({ ...entry, trigger: 'user' });
  const site = (entry: RecordedEntry): RecordedEntry => ({ ...entry, trigger: 'page' });
  const recording = [
    site(recorded(0, 'https://a.test/token', '{"token":"t1"}')),
    site({ ...recorded(1, 'https://a.test/recently-viewed', '{}'), method: 'POST' }),
    user({ ...recorded(2, 'https://a.test/cart/add', '{"count":1}'), method: 'POST' }),
  ];

  it('leaves them out, even when the model chose them', () => {
    const { draft, backgroundSteps } = check(
      output([step(1, '{{baseUrl}}/recently-viewed'), step(2, '{{baseUrl}}/cart/add')], [BASE]),
      recording,
    );
    expect(draft.steps.map((s) => s.sourceIndex)).toEqual([2]);
    expect(backgroundSteps).toBe(1);
  });

  it('keeps one that passes a value to a later step', () => {
    const capture = { variable: 'token', path: 'token', secret: true };
    const { draft } = check(
      output(
        [
          step(0, '{{baseUrl}}/token', { captures: [capture] }),
          step(2, '{{baseUrl}}/cart/add?t={{token}}'),
        ],
        [BASE],
      ),
      recording,
    );
    expect(draft.steps.map((s) => s.sourceIndex)).toEqual([0, 2]);
  });

  it('never adds them back from the recording, but adds the user actions', () => {
    const { draft, addedSteps } = check(output([], [BASE]), recording);
    expect(draft.steps.map((s) => s.sourceIndex)).toEqual([2]);
    expect(addedSteps).toBe(1);
  });
});

describe('endpointOf', () => {
  const at = (url: string) => endpointOf(recorded(0, url));
  it('treats calls that differ only in numbers as one endpoint', () => {
    expect(at('https://a.test/banners?env=20&width=380')).toBe(
      at('https://a.test/banners?env=21&width=380'),
    );
    expect(at('https://a.test/list?page=2')).toBe(at('https://a.test/list?page=3'));
  });

  // On a real shop every call goes to index.php and names its action in "route".
  it('keeps calls with different actions apart', () => {
    expect(at('https://a.test/index.php?route=cart/add')).not.toBe(
      at('https://a.test/index.php?route=banner/list'),
    );
  });
});

describe('formatRecording', () => {
  it('tells the model who caused each request, when the recorder knows it', () => {
    const text = formatRecording('Goal', [
      { ...recorded(0, 'https://a.test/a'), trigger: 'user' },
      { ...recorded(1, 'https://a.test/b'), trigger: 'page' },
      recorded(2, 'https://a.test/c'),
    ]);
    expect(text).toContain('GET https://a.test/a\nTriggered by: the user');
    expect(text).toContain('GET https://a.test/b\nTriggered by: the page by itself');
    expect(text).toContain('GET https://a.test/c\nStatus: 200');
  });
});

describe('names of steps added from the recording', () => {
  it('names a change by the action in its address', () => {
    const change: RecordedEntry = {
      ...recorded(0, 'https://a.test/index.php?route=checkout/cart/add&x=1', '{}'),
      method: 'POST',
    };
    const { draft } = checkDraft(output([], [BASE]), [change], new Map());
    expect(draft.steps[0]?.name).toBe('POST checkout/cart/add');
  });
});
