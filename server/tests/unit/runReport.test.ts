import type { Run } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRunHtml, reportFileName } from '../../src/services/runReport';

const run: Run = {
  id: '11111111-1111-4111-8111-111111111111',
  collectionId: null,
  collectionName: 'Users API',
  environmentName: null,
  startedAt: '2026-11-08T10:20:30.000Z',
  durationMs: 12,
  total: 1,
  passed: 0,
  failed: 0,
  errors: 1,
  results: [
    {
      savedRequestId: 'r1',
      name: 'Blocked',
      method: 'GET',
      url: 'http://10.0.0.1/?a=1&b=2',
      outcome: 'error',
      status: null,
      statusText: '',
      durationMs: null,
      errorCode: 'BLOCKED_TARGET',
      errorMessage: 'Blocked "here".',
      assertions: [],
    },
  ],
};

describe('escapeHtml', () => {
  it.each([
    ['<script>', '&lt;script&gt;'],
    ['a & b', 'a &amp; b'],
    ['"double"', '&quot;double&quot;'],
    ["'single'", '&#39;single&#39;'],
    ['&lt;', '&amp;lt;'], // already-escaped text is shown as typed
    [42, '42'],
    [null, ''],
  ])('%j → %j', (input, output) => {
    expect(escapeHtml(input)).toBe(output);
  });
});

describe('renderRunHtml', () => {
  it('shows the summary, the error and "none" for a missing environment', () => {
    const html = renderRunHtml(run);

    expect(html).toContain('<strong>0 passed</strong>, 0 failed, 1 errors, 1 total');
    expect(html).toContain('BLOCKED_TARGET: Blocked &quot;here&quot;.');
    expect(html).toContain('Environment: none');
    expect(html).toContain('http://10.0.0.1/?a=1&amp;b=2');
  });

  it('contains no scripts or external resources', () => {
    const html = renderRunHtml(run);

    expect(html).not.toMatch(/<script|src=|href=/i);
  });
});

describe('reportFileName', () => {
  it('builds a readable name with the date and time', () => {
    expect(reportFileName(run, 'html')).toBe('users-api-2026-11-08-10-20-30.html');
  });

  // The name goes into a response header: quotes or line breaks must not get through.
  it('reduces hostile collection names to safe characters', () => {
    const name = reportFileName(
      { ...run, collectionName: 'a"; x=1\r\nSet-Cookie: evil/../é' },
      'json',
    );

    expect(name).toMatch(/^[a-z0-9-]+\.json$/);
  });

  it('falls back to "run" when nothing usable is left', () => {
    expect(reportFileName({ ...run, collectionName: '¿¿¿' }, 'html')).toMatch(/^run-\d/);
  });
});
