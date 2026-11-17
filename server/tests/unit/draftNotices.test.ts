import type { RecordedEntry } from '@api-sentinel/shared';
import { describe, expect, it } from 'vitest';
import { draftNotices } from '../../src/services/ai-engine/aiService';

const read = (index: number): RecordedEntry => ({
  index,
  method: 'GET',
  url: `https://a.test/r${String(index)}?x=1`,
  status: 200,
  requestHeaders: [],
  requestBody: '',
  responseContentType: 'application/json',
  responseSample: '{}',
});

describe('draftNotices', () => {
  it('says nothing when nothing was left out or added', () => {
    expect(draftNotices([], 0)).toEqual([]);
  });

  it('names the requests left out, five at most, and counts the added steps', () => {
    const notices = draftNotices(
      Array.from({ length: 7 }, (_, i) => read(i)),
      2,
    );
    expect(notices[0]).toBe(
      'To keep the AI fast and within its limit, 7 background request(s) the page made by itself were not sent to it: GET /r0?x=1, GET /r1?x=1, GET /r2?x=1, GET /r3?x=1, GET /r4?x=1 and 2 more.',
    );
    expect(notices[1]).toMatch(/^2 step\(s\) for pages you opened or changes you made were added/);
  });
});

describe('draftNotices for requests the site sent by itself', () => {
  it('says how many were left out of the flow', () => {
    expect(draftNotices([], 0, 3)).toEqual([
      'Left out 3 step(s) for requests the site sent by itself (not your clicks), as no later step needs a value from them.',
    ]);
  });
});

describe('draftNotices about steps the AI wrote unusably', () => {
  it('says how many and what happened to them', () => {
    expect(draftNotices([], 0, 0, 2)[0]).toContain('2 step(s) the AI wrote could not be sent');
    expect(draftNotices([], 0, 0, 0)).toEqual([]);
  });
});
