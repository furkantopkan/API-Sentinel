import { createApp } from './app';
import { ConfigError, loadConfig, loadEnvFile } from './config/env';

/** Entry point: load config, build the app, start listening. */
function main(): void {
  loadEnvFile();
  const config = loadConfig();
  const app = createApp(config);

  const server = app.listen(config.port, config.host, (error?: Error) => {
    if (error) {
      // e.g. EADDRINUSE when the port is already taken
      console.error(`[server] Failed to start: ${error.message}`);
      process.exit(1);
    }
    console.log(`[server] API Sentinel backend listening on http://${config.host}:${config.port}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[server] ${error.message}`);
    process.exit(1);
  }
  throw error;
}
