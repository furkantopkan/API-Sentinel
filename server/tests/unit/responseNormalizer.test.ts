import { describe, expect, it } from 'vitest';
import {
  classifyBody,
  normalizeResponse,
} from '../../src/services/request-engine/responseNormalizer';

const utf8 = (text: string) => Buffer.from(text, 'utf8');

describe('classifyBody', () => {
  it('returns empty for zero bytes', () => {
    expect(classifyBody(Buffer.alloc(0), 'application/json')).toEqual({ kind: 'empty' });
  });

  it('returns binary for bytes that are not valid UTF-8', () => {
    expect(classifyBody(Buffer.from([0xff, 0xfe, 0x00]), 'application/octet-stream')).toEqual({
      kind: 'binary',
    });
  });

  it.each(['application/json', 'application/json; charset=utf-8', 'application/problem+json'])(
    'returns json for valid JSON declared as %s',
    (contentType) => {
      expect(classifyBody(utf8('{"a":1}'), contentType)).toEqual({ kind: 'json', text: '{"a":1}' });
    },
  );

  it('detects JSON when the server sends no Content-Type', () => {
    expect(classifyBody(utf8('[1,2]'), undefined).kind).toBe('json');
  });

  it('flags declared-but-invalid JSON as text with malformedJson', () => {
    expect(classifyBody(utf8('{"a":'), 'application/json')).toEqual({
      kind: 'text',
      text: '{"a":',
      malformedJson: true,
    });
  });

  it('keeps JSON-looking text/plain as text (the declared type wins)', () => {
    expect(classifyBody(utf8('{"a":1}'), 'text/plain')).toEqual({
      kind: 'text',
      text: '{"a":1}',
      malformedJson: false,
    });
  });

  it('returns HTML as plain text (never interpreted)', () => {
    expect(classifyBody(utf8('<script>x</script>'), 'text/html').kind).toBe('text');
  });
});

describe('normalizeResponse', () => {
  it('maps a raw response to the shared shape with the standard status text', () => {
    const result = normalizeResponse({
      status: 404,
      headers: [['Content-Type', 'application/json']],
      bodyBytes: utf8('{"error":"x"}'),
      finalUrl: 'http://example.com/',
      redirects: [],
      durationMs: 12,
    });

    expect(result).toEqual({
      status: 404,
      statusText: 'Not Found',
      headers: [['Content-Type', 'application/json']],
      body: { kind: 'json', text: '{"error":"x"}' },
      sizeBytes: 13,
      durationMs: 12,
      finalUrl: 'http://example.com/',
      redirects: [],
    });
  });

  it('uses an empty status text for unknown codes', () => {
    const result = normalizeResponse({
      status: 599,
      headers: [],
      bodyBytes: Buffer.alloc(0),
      finalUrl: 'http://example.com/',
      redirects: [],
      durationMs: 1,
    });

    expect(result.statusText).toBe('');
  });
});
