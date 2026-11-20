import type { ExecutedResponse } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { responseMetadata } from './responseMetadata';

function response(overrides: Partial<ExecutedResponse> = {}): ExecutedResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: [['Content-Type', 'application/json']],
    body: { kind: 'empty' },
    sizeBytes: 10,
    durationMs: 5,
    finalUrl: 'http://example.com/',
    redirects: [],
    ...overrides,
  };
}

function valueOf(rows: ReturnType<typeof responseMetadata>, label: string): string | undefined {
  return rows.find((row) => row.label === label)?.value;
}

describe('responseMetadata', () => {
  it.each([
    [101, 'Informational'],
    [204, 'Success'],
    [304, 'Redirection'],
    [404, 'Client error'],
    [503, 'Server error'],
  ])('labels status %i as %s', (status, statusClass) => {
    expect(valueOf(responseMetadata(response({ status })), 'Status')).toContain(statusClass);
  });

  it('reads headers case-insensitively', () => {
    const rows = responseMetadata(response({ headers: [['content-TYPE', 'text/plain']] }));

    expect(valueOf(rows, 'Content-Type')).toBe('text/plain');
  });

  it('shows "(not set)" and "none" when headers are missing', () => {
    const rows = responseMetadata(response({ headers: [] }));

    expect(valueOf(rows, 'Content-Type')).toBe('(not set)');
    expect(valueOf(rows, 'Content-Encoding')).toBe('none');
  });

  it('AN-15: compares the decoded size with Content-Length for compressed bodies', () => {
    const rows = responseMetadata(
      response({
        sizeBytes: 138,
        headers: [
          ['content-encoding', 'gzip'],
          ['content-length', '131'],
        ],
      }),
    );

    expect(valueOf(rows, 'Content-Encoding')).toBe('gzip');
    expect(valueOf(rows, 'Body size')).toBe('138 bytes decoded (Content-Length on the wire: 131)');
  });

  it('shows only the size when Content-Length matches', () => {
    const rows = responseMetadata(response({ sizeBytes: 10, headers: [['content-length', '10']] }));

    expect(valueOf(rows, 'Body size')).toBe('10 bytes');
  });

  it('includes optional headers only when present', () => {
    const rows = responseMetadata(response({ headers: [['Server', 'nginx']] }));

    expect(valueOf(rows, 'Server')).toBe('nginx');
    expect(valueOf(rows, 'Cache-Control')).toBeUndefined();
  });

  it('AN-16: lists the redirect chain in order', () => {
    const rows = responseMetadata(
      response({
        redirects: [
          { status: 301, location: 'http://a/' },
          { status: 302, location: 'http://b/' },
        ],
      }),
    );

    expect(valueOf(rows, 'Redirects')).toBe('1. 301 → http://a/\n2. 302 → http://b/');
  });
});
