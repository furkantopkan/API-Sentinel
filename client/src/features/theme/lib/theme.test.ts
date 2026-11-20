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

// Private windows and blocked site data make localStorage throw; the theme still works.
describe('theme storage when the browser refuses it', () => {
  it('reads nothing and does not throw', async () => {
    const { readStoredTheme, storeTheme } = await import('./theme');
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const original = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: blocked },
      configurable: true,
    });
    try {
      expect(readStoredTheme()).toBeNull();
      expect(() => storeTheme('dark')).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'window', { value: original, configurable: true });
    }
  });
});
