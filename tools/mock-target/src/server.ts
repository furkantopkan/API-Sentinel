import { createMockTargetApp } from './app';

const port = Number(process.env.MOCK_PORT ?? 4010);
const host = '127.0.0.1';

createMockTargetApp().listen(port, host, (error?: Error) => {
  if (error) {
    console.error(`[mock-target] Failed to start: ${error.message}`);
    process.exit(1);
  }
  console.log(`[mock-target] Listening on http://localhost:${port}  (endpoint list: GET /)`);
  console.log(`[mock-target] Allow it in .env with: SSRF_ALLOWLIST=localhost:${port}`);
});
