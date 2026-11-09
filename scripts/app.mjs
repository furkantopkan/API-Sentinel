// Runs API Sentinel as an always-available local app on http://localhost:3000.
// Usage: node scripts/app.mjs install | uninstall | start | stop | restart | status
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');
const PID_FILE = join(DATA, 'app.pid');
const LOG_FILE = join(DATA, 'app.log');
const PORT = 3000;
const URL_APP = `http://localhost:${PORT}`;
const STARTUP_FILE = join(
  process.env.APPDATA ?? '',
  'Microsoft/Windows/Start Menu/Programs/Startup/API Sentinel.cmd',
);

async function isUp() {
  try {
    return (await fetch(`${URL_APP}/api/health`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function build() {
  console.log('Building the interface...');
  execFileSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: join(ROOT, 'client'),
    stdio: 'inherit',
  });
}

async function start() {
  if (await isUp()) {
    console.log(`Already running: ${URL_APP}`);
    return;
  }
  if (!existsSync(join(ROOT, 'client/dist/index.html'))) build();
  mkdirSync(DATA, { recursive: true });
  const log = openSync(LOG_FILE, 'a');
  const child = spawn(
    process.execPath,
    [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), join(ROOT, 'server/src/server.ts')],
    {
      cwd: ROOT,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, PORT: String(PORT), SERVE_CLIENT: 'true' },
    },
  );
  writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  for (let attempt = 0; attempt < 40; attempt++) {
    if (await isUp()) {
      console.log(`Running: ${URL_APP}`);
      return;
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`The app did not start. See ${LOG_FILE}`);
}

function stop() {
  if (!existsSync(PID_FILE)) {
    console.log('Not running.');
    return;
  }
  try {
    // /T also ends the child process tsx starts.
    execFileSync('taskkill', ['/PID', readFileSync(PID_FILE, 'utf8').trim(), '/T', '/F'], {
      stdio: 'ignore',
    });
  } catch {
    // Already gone: nothing to stop.
  }
  rmSync(PID_FILE, { force: true });
  console.log('Stopped.');
}

function installStartup() {
  // Runs at Windows sign-in, for this user only; no administrator rights needed.
  writeFileSync(
    STARTUP_FILE,
    `@echo off\r\ncd /d "${ROOT}"\r\n"${process.execPath}" scripts\\app.mjs start\r\n`,
  );
  console.log('Will start automatically when you sign in to Windows.');
}

const command = process.argv[2];
switch (command) {
  case 'install':
    build();
    stop();
    await start();
    installStartup();
    break;
  case 'uninstall':
    stop();
    rmSync(STARTUP_FILE, { force: true });
    console.log('Automatic start removed. Your data in data/ was not touched.');
    break;
  case 'start':
    await start();
    break;
  case 'stop':
    stop();
    break;
  case 'restart':
    stop();
    await start();
    break;
  case 'status':
    console.log((await isUp()) ? `Running: ${URL_APP}` : 'Not running.');
    break;
  default:
    console.log('Usage: node scripts/app.mjs install|uninstall|start|stop|restart|status');
    process.exitCode = 1;
}
