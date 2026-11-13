export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'api-sentinel.theme';

/** The user's own choice wins; without one, the operating system's setting is used. */
export function initialTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

// localStorage can throw (private mode, blocked site data); the theme is only a convenience.
export function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered: the next visit starts from the system setting again.
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * The colours themselves live in index.css, keyed on this attribute.
 * color-scheme makes the browser draw scrollbars and form controls to match.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/** The theme applied to the page (by main.tsx at start-up). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
