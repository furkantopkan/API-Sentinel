import { describe, expect, it } from 'vitest';
import {
  MIN_MASKED_SECRET_LENGTH,
  createSecretMasker,
  resolveRequest,
  resolveText,
  type VariableLookup,
} from './resolveVariables';

const values: Record<string, string> = { a: '1', b_2: 'two', 'x.y-z': 'dotted', empty: '' };
const lookup: VariableLookup = (name) => values[name];

describe('resolveText', () => {
  it.each([
    ['{{a}}', '1'],
    ['{{ a }}', '1'], // spaces are allowed
    ['x{{a}}y{{b_2}}z', 'x1ytwoz'],
    ['{{x.y-z}}', 'dotted'],
    ['{{empty}}', ''],
    ['no variables', 'no variables'],
    ['{single}', '{single}'],
    ['{{1bad}}', '{{1bad}}'], // not a valid name: left alone and not reported
    ['{{a b}}', '{{a b}}'],
  ])('%j → %j', (text, expected) => {
    expect(resolveText(text, lookup)).toEqual({ text: expected, unknown: [] });
  });

  it('reports each unknown name once and leaves it in place', () => {
    expect(resolveText('{{u}}/{{a}}/{{u}}/{{v}}', lookup)).toEqual({
      text: '{{u}}/1/{{u}}/{{v}}',
      unknown: ['u', 'v'],
    });
  });

  it('does not expand placeholders found inside values', () => {
    expect(resolveText('{{p}}', (name) => (name === 'p' ? '{{a}}' : '1')).text).toBe('{{a}}');
  });

  it('does not treat "$" in a value as a replacement pattern', () => {
    expect(resolveText('{{p}}', () => "$& $1 $' cost").text).toBe("$& $1 $' cost");
  });
});

describe('resolveRequest', () => {
  const base = {
    url: '{{a}}',
    queryParams: [{ id: 'row', key: '{{a}}', value: '{{b_2}}', enabled: true }],
    headers: [{ id: 'off', key: '{{gone}}', value: '{{gone}}', enabled: false }],
    auth: { type: 'bearer' as const, token: '{{a}}' },
    body: '{{b_2}}',
    extra: 'kept',
  };

  it('resolves every enabled part and keeps extra fields', () => {
    const { request, unknown } = resolveRequest(base, lookup);

    expect(request).toMatchObject({
      url: '1',
      queryParams: [{ id: 'row', key: '1', value: 'two', enabled: true }],
      auth: { type: 'bearer', token: '1' },
      body: 'two',
      extra: 'kept',
    });
    expect(unknown).toEqual([]);
  });

  it('leaves disabled rows alone and does not report them', () => {
    expect(resolveRequest(base, lookup).request.headers[0]?.value).toBe('{{gone}}');
  });

  it('resolves Basic auth and collects unknown names across all parts', () => {
    const { request, unknown } = resolveRequest(
      {
        ...base,
        url: '{{u1}}',
        body: '{{u2}}',
        auth: { type: 'basic', username: '{{a}}', password: '{{u3}}' },
      },
      lookup,
    );

    expect(request.auth).toEqual({ type: 'basic', username: '1', password: '{{u3}}' });
    expect(unknown.sort()).toEqual(['u1', 'u2', 'u3']);
  });

  it('does not change the input', () => {
    const snapshot = structuredClone(base);

    resolveRequest(base, lookup);

    expect(base).toEqual(snapshot);
  });
});

describe('createSecretMasker', () => {
  it('replaces every occurrence', () => {
    expect(createSecretMasker(['hunter2'])('a hunter2 b hunter2')).toBe('a [secret] b [secret]');
  });

  // Replacing the shorter one first would leave the rest of the longer secret visible.
  it('hides a secret that contains another one completely', () => {
    expect(createSecretMasker(['abcd', 'abcdefgh'])('abcdefgh')).toBe('[secret]');
  });

  it(`ignores values shorter than ${MIN_MASKED_SECRET_LENGTH} characters`, () => {
    expect(createSecretMasker(['abc', ''])('abc')).toBe('abc');
    expect(createSecretMasker(['abcd'])('abcd')).toBe('[secret]');
  });

  it('treats regular expression characters literally', () => {
    expect(createSecretMasker(['a.c+'])('abc a.c+')).toBe('abc [secret]');
  });

  it('returns text unchanged without secrets', () => {
    expect(createSecretMasker([])('text')).toBe('text');
  });
});
