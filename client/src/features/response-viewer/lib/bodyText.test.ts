import { describe, expect, it } from 'vitest';
import { bodyText, parseJsonBody } from './bodyText';

describe('parseJsonBody', () => {
  it('parses valid JSON and marks it exact', () => {
    expect(parseJsonBody('{"a":[1,2]}')).toEqual({ value: { a: [1, 2] }, exact: true });
  });

  it('marks documents with integers beyond 2^53 as not exact', () => {
    expect(parseJsonBody('{"id":12345678901234567890}')?.exact).toBe(false);
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonBody('{"a":')).toBeNull();
  });
});

describe('bodyText', () => {
  it('re-indents JSON with two spaces', () => {
    expect(bodyText({ kind: 'json', text: '{"a":1}' })).toBe('{\n  "a": 1\n}');
  });

  // Re-formatting would turn ...890 into ...000: the user must see what the server sent.
  it('keeps the original text when re-formatting would change big integers', () => {
    const text = '{"id": 12345678901234567890}';

    expect(bodyText({ kind: 'json', text })).toBe(text);
  });

  it('returns text bodies unchanged and null for empty or binary bodies', () => {
    expect(bodyText({ kind: 'text', text: '<b>x</b>', malformedJson: false })).toBe('<b>x</b>');
    expect(bodyText({ kind: 'empty' })).toBeNull();
    expect(bodyText({ kind: 'binary' })).toBeNull();
  });
});
