import type { RecordedEntry } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { recordingSummary } from './recordingSummary';

const entry = (index: number, trigger?: 'user' | 'page'): RecordedEntry => ({
  index,
  method: 'GET',
  url: `https://a.test/${String(index)}`,
  status: 200,
  requestHeaders: [],
  requestBody: '',
  responseContentType: 'application/json',
  responseSample: '{}',
  ...(trigger === undefined ? {} : { trigger }),
});

describe('recordingSummary', () => {
  // A shop sent 111 requests for a few clicks: the count must be the user's.
  it('counts the user actions, not everything the site sent', () => {
    const entries = [entry(0, 'user'), entry(1, 'user'), entry(2, 'page'), entry(3, 'user')];
    expect(recordingSummary(entries, 111)).toBe(
      '3 requests from your actions, plus 1 request the site sent that they need. 107 other requests the site sent by itself will not be used.',
    );
    expect(recordingSummary([entry(0, 'user')], 1)).toBe('1 request from your actions.');
  });

  it('keeps the plain count for a HAR file', () => {
    expect(recordingSummary([entry(0), entry(1)], 2)).toBe('2 requests found.');
    expect(recordingSummary([entry(0)], 50)).toBe('50 requests found; the first 1 will be used.');
  });
});
