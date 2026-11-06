import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests: a real browser drives the real app.
 *
 * Playwright starts three servers on dedicated ports (so a running
 * `npm run dev` on 3001/5173 is never touched) and stops them afterwards:
 *   mock target 4998  ←  backend 3998  ←  Vite UI 5998 (proxy /api → 3998)
 * Variables set here win over values in .env (Node never overrides them).
 */
const MOCK_PORT = 4998;
const API_PORT = 3998;
const UI_PORT = 5998;

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: true, // a forgotten test.only must fail the run
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${UI_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start --workspace=@api-sentinel/mock-target',
      url: `http://127.0.0.1:${MOCK_PORT}/`,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
      cwd: '..',
    },
    {
      command: 'npm run start --workspace=@api-sentinel/server',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      // AI_MODE=mock: AI screens run on fixed example answers (no key, no cost, no network).
      env: { PORT: String(API_PORT), SSRF_ALLOWLIST: `localhost:${MOCK_PORT}`, AI_MODE: 'mock' },
      reuseExistingServer: false,
      cwd: '..',
    },
    {
      command: `npm run dev --workspace=@api-sentinel/client -- --port ${UI_PORT}`,
      url: `http://127.0.0.1:${UI_PORT}/`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      cwd: '..',
    },
  ],
});

export { MOCK_PORT };
