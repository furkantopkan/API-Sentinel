import { useState } from 'react';
import { Button } from '../../../components/Button';
import { applyTheme, currentTheme, storeTheme, type Theme } from '../lib/theme';

/** Switches between light and dark; main.tsx applies the starting theme before the first render. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const dark = theme === 'dark';

  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark';
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  };

  return (
    <Button aria-label="Dark mode" aria-pressed={dark} onClick={toggle}>
      {dark ? '☀ Light' : '☾ Dark'}
    </Button>
  );
}
