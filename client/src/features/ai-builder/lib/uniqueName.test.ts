import { describe, expect, it } from 'vitest';
import { uniqueName } from './uniqueName';

describe('uniqueName', () => {
  it('keeps a name nobody uses', () => {
    expect(uniqueName('Shop Flow', ['Other'])).toBe('Shop Flow');
  });

  it('numbers a name that is taken, ignoring case and spaces', () => {
    expect(uniqueName('Shop Flow', [' shop flow '])).toBe('Shop Flow (2)');
    expect(uniqueName('Shop Flow', ['Shop Flow', 'Shop Flow (2)'])).toBe('Shop Flow (3)');
  });
});
