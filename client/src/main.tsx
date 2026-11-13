import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import {
  applyTheme,
  initialTheme,
  readStoredTheme,
  systemPrefersDark,
} from './features/theme/lib/theme';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// Before the first render, so the page never flashes in the other theme.
applyTheme(initialTheme(readStoredTheme(), systemPrefersDark()));

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
