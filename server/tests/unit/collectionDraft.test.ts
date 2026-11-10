import type {
  CollectionDraftOutput,
  RecordedEntry,
  SuggestedAssertion,
} from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { checkDraft } from '../../src/services/ai-engine/collectionDraft';
import { MAX_RECORDING_CHARS, fitRecording } from '../../src/services/ai-engine/prompts';

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

  it('does not touch a recording that fits', () => {
    const entries = [sized(0, 3000), sized(1, 10)];
    expect(fitRecording(entries)).toEqual({ entries, omitted: 0 });
  });

  it('shortens large responses and leaves small ones whole', () => {
    const entries = [sized(0, 50), ...Array.from({ length: 39 }, (_, i) => sized(i + 1, 3000))];
    const fitted = fitRecording(entries);
    expect(fitted.omitted).toBe(0);
    expect(fitted.entries[0]?.responseSample).toHaveLength(50);
    expect(fitted.entries[1]?.responseSample.length).toBeLessThan(3000);
    expect(size(fitted.entries)).toBeLessThanOrEqual(MAX_RECORDING_CHARS);
  });

  it('leaves out the last requests when even short responses do not fit', () => {
    const headers: [string, string][] = [['X-Long', 'v'.repeat(4000)]];
    const entries = Array.from({ length: 12 }, (_, i) => ({
      ...sized(i, 3000),
      requestHeaders: headers,
    }));
    const fitted = fitRecording(entries);
    expect(fitted.omitted).toBeGreaterThan(0);
    expect(fitted.entries.length + fitted.omitted).toBe(12);
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
