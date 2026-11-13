import { describe, expect, it } from 'vitest';
import { initialTheme } from './theme';

describe('initialTheme', () => {
  it("uses the user's saved choice over the system setting", () => {
    expect(initialTheme('light', true)).toBe('light');
    expect(initialTheme('dark', false)).toBe('dark');
  });

  it('follows the system setting when nothing (or nothing valid) is saved', () => {
    expect(initialTheme(null, true)).toBe('dark');
    expect(initialTheme(null, false)).toBe('light');
    expect(initialTheme('purple', true)).toBe('dark');
  });
});
