import { describe, expect, it } from 'vitest';
import type { ExecutedResponse } from '../schemas/execute';
import { readJsonBody } from './readJsonBody';

const withBody = (body: ExecutedResponse['body']) => ({ body }) as ExecutedResponse;

describe('readJsonBody', () => {
  it('reads a JSON body', () => {
    expect(readJsonBody(withBody({ kind: 'json', text: '{"a":1}' }))).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it('reads an object or array that the server labelled as text', () => {
    const text = (value: string) => withBody({ kind: 'text', text: value, malformedJson: false });
    expect(readJsonBody(text(' {"count":1}'))).toEqual({ ok: true, value: { count: 1 } });
    expect(readJsonBody(text('[1]'))).toEqual({ ok: true, value: [1] });
  });

  it('does not treat plain text, a bare number or broken JSON as JSON', () => {
    const text = (value: string) => withBody({ kind: 'text', text: value, malformedJson: false });
    expect(readJsonBody(text('Hello'))).toEqual({
      ok: false,
      reason: 'The body is not JSON (text).',
    });
    expect(readJsonBody(text('42')).ok).toBe(false);
    expect(readJsonBody(text('{"a":'))).toEqual({
      ok: false,
      reason: 'The body is not valid JSON.',
    });
    expect(readJsonBody(withBody({ kind: 'empty' })).ok).toBe(false);
  });
});
