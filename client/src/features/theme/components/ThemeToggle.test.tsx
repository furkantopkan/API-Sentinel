// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
});

describe('ThemeToggle', () => {
  it('starts from the theme already on the page', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Dark mode' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('switches the page theme and remembers the choice', async () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Dark mode' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('api-sentinel.theme')).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('api-sentinel.theme')).toBe('light');
  });
});
