import { describe, expect, it } from 'vitest';
import { findErrorLocation, formatJsonBody, validateJsonBody } from './validateJsonBody';

describe('validateJsonBody', () => {
  it.each(['', '   ', '\n\t'])('treats %j as a valid empty body', (text) => {
    expect(validateJsonBody(text)).toEqual({ ok: true, empty: true });
  });

  it.each([
    '{"name":"Ada"}',
    '[1, 2, 3]',
    '"text"',
    '42',
    'true',
    'null',
    '{\n  "a": {"b": []}\n}',
  ])('accepts valid JSON %j', (text) => {
    expect(validateJsonBody(text)).toEqual({ ok: true, empty: false });
  });

  // API-006: invalid JSON is detected before sending
  it('rejects a trailing comma and reports line 1, column 8', () => {
    const result = validateJsonBody('{"a":1,}');

    expect(result).toMatchObject({ ok: false, line: 1, column: 8 });
  });

  it('reports the correct line and column for an error on a later line', () => {
    const result = validateJsonBody('{\n  "a": 1,\n}');

    expect(result).toMatchObject({ ok: false, line: 3, column: 1 });
  });

  it.each(["{'a': 1}", '{a: 1}', '{"a": 1', 'undefined', '{"a": 01}'])('rejects %j', (text) => {
    expect(validateJsonBody(text).ok).toBe(false);
  });

  it('still reports the error when the engine gives no location', () => {
    // V8 omits the position for some errors, e.g. a missing value.
    const result = validateJsonBody('{"b": }');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message.length).toBeGreaterThan(0);
  });
});

describe('findErrorLocation', () => {
  it('reads "line X column Y" (Chrome and Firefox wording)', () => {
    expect(
      findErrorLocation(
        '',
        'JSON.parse: expected property name at line 2 column 5 of the JSON data',
      ),
    ).toEqual({ line: 2, column: 5 });
  });

  it('converts a 0-based "position N" into 1-based line and column', () => {
    // position 4 is the "c" on the second line of "ab\ncd"
    expect(findErrorLocation('ab\ncd', 'Unexpected token at position 4')).toEqual({
      line: 2,
      column: 2,
    });
  });

  it('returns undefined when the message has no location', () => {
    expect(findErrorLocation('{}', 'Unexpected end of input')).toBeUndefined();
  });
});

describe('formatJsonBody', () => {
  it('pretty-prints valid JSON with 2-space indentation', () => {
    expect(formatJsonBody('{"name":"Ada","tags":["qa"]}')).toBe(
      '{\n  "name": "Ada",\n  "tags": [\n    "qa"\n  ]\n}',
    );
  });

  it('returns null for invalid JSON', () => {
    expect(formatJsonBody('{"a":')).toBeNull();
  });
});
