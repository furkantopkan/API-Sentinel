import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from './formatBytes';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024 - 1, '1024.0 KB'],
    [1024 * 1024, '1.00 MB'],
    [5_242_880, '5.00 MB'],
  ])('%i bytes → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 ms'],
    [849.6, '850 ms'],
    [999, '999 ms'],
    [1000, '1.00 s'],
    [2345, '2.35 s'],
  ])('%d ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
