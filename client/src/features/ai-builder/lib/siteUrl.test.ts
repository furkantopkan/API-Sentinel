import { describe, expect, it } from 'vitest';
import { normalizeSiteUrl } from './siteUrl';

describe('normalizeSiteUrl', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  www.example.com/shop ', 'https://www.example.com/shop'],
    ['localhost:4010/page', 'https://localhost:4010/page'],
    ['https://example.com', 'https://example.com'],
    ['HTTP://example.com', 'HTTP://example.com'],
    ['', ''],
    ['   ', ''],
  ])('%s becomes %s', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
  });

  // A scheme is left for the server to refuse, instead of being hidden behind https://.
  it('does not disguise another scheme', () => {
    expect(normalizeSiteUrl('file:///c:/x')).toBe('file:///c:/x');
  });
});
