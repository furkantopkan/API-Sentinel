import type { HarEntry } from '@api-sentinel/shared';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/errors/AppError';
import { createRecorderService } from '../../src/services/recorder/recorderService';
import type { RecordingBrowser } from '../../src/services/recorder/recordingBrowser';

const SITE = 'http://localhost:4010/';

function exchange(url: string): HarEntry {
  return {
    _resourceType: 'fetch',
    request: { method: 'GET', url, headers: [] },
    response: { status: 200, content: { mimeType: 'application/json', text: '{"a":1}' } },
  };
}

/** Stands in for the real browser, so no window opens during the tests. */
function fakeBrowser(traffic: HarEntry[] = [exchange('http://localhost:4010/users')]) {
  const state = { opened: [] as string[], closes: 0, userClosesWindow: () => undefined as void };
  const browser: RecordingBrowser = {
    open: vi.fn((url: string, onClosed: () => void) => {
      state.opened.push(url);
      state.userClosesWindow = onClosed;
      return Promise.resolve({
        captured: () => traffic.length,
        close: () => {
          state.closes += 1;
          return Promise.resolve(traffic);
        },
      });
    }),
  };
  return { browser, state };
}

function service(browser: RecordingBrowser, options = {}) {
  return createRecorderService(browser, {
    enabled: true,
    allowlist: new Set(['localhost:4010']),
    ...options,
  });
}

const failure = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
};

describe('recorderService', () => {
  it('reports nothing in progress at first', () => {
    expect(service(fakeBrowser().browser).status()).toEqual({
      available: true,
      active: false,
      browserOpen: false,
      captured: 0,
    });
  });

  it('records, reports progress and hands over the traffic once', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser);
    await recorder.start(SITE);
    expect(state.opened).toEqual([SITE]);
    expect(recorder.status()).toMatchObject({ active: true, browserOpen: true, captured: 1 });

    const finished = await recorder.finish();

    expect(finished.found).toBe(1);
    expect(finished.entries[0]?.url).toBe('http://localhost:4010/users');
    expect(state.closes).toBe(1);
    expect(recorder.status().active).toBe(false);
    expect((await failure(recorder.finish())).code).toBe('NOT_FOUND');
  });

  it('applies the HAR rules to live traffic', async () => {
    const { browser } = fakeBrowser([
      exchange('http://localhost:4010/users'),
      exchange('http://localhost:4010/users'),
      exchange('https://o1.ingest.sentry.io/api/1/envelope/'),
    ]);
    const recorder = service(browser);
    await recorder.start(SITE);
    expect((await recorder.finish()).entries).toHaveLength(1);
  });

  it('refuses a second recording while a window is open', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser);
    await recorder.start(SITE);
    expect((await failure(recorder.start(SITE))).code).toBe('RECORDING_ACTIVE');
    expect(state.opened).toHaveLength(1);
  });

  it('does not open two windows on a double click', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser);
    const [first, second] = await Promise.allSettled([recorder.start(SITE), recorder.start(SITE)]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(state.opened).toHaveLength(1);
  });

  it.each(['http://169.254.169.254/latest', 'http://127.0.0.1:4010/', 'http://[::1]/'])(
    'blocks a private address without opening a browser: %s',
    async (url) => {
      const { browser, state } = fakeBrowser();
      const recorder = service(browser);
      expect((await failure(recorder.start(url))).code).toBe('BLOCKED_TARGET');
      expect(state.opened).toEqual([]);
      expect(recorder.status().active).toBe(false);
    },
  );

  it('blocks localhost on a port that is not allow-listed', async () => {
    const { browser, state } = fakeBrowser();
    expect((await failure(service(browser).start('http://localhost:3000/'))).code).toBe(
      'BLOCKED_TARGET',
    );
    expect(state.opened).toEqual([]);
  });

  it('never opens a browser when the app does not run on this computer', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser, { enabled: false });
    expect(recorder.status().available).toBe(false);
    expect((await failure(recorder.start(SITE))).code).toBe('RECORDER_UNAVAILABLE');
    expect(state.opened).toEqual([]);
  });

  it('is free again after the browser fails to open', async () => {
    const { browser } = fakeBrowser();
    const failing: RecordingBrowser = {
      open: vi
        .fn((url: string, onClosed: () => void) => browser.open(url, onClosed))
        .mockRejectedValueOnce(new AppError('RECORDER_UNAVAILABLE', 'no browser', 503)),
    };
    const recorder = service(failing);
    expect((await failure(recorder.start(SITE))).code).toBe('RECORDER_UNAVAILABLE');
    expect(recorder.status().active).toBe(false);
    await expect(recorder.start(SITE)).resolves.toBeUndefined();
  });

  it('RE-02: keeps the traffic when the user closes the window', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser);
    await recorder.start(SITE);
    state.userClosesWindow();
    expect(recorder.status()).toMatchObject({ active: true, browserOpen: false });
    expect((await recorder.finish()).found).toBe(1);
  });

  it('allows a new recording over one that was closed and never collected', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser);
    await recorder.start(SITE);
    state.userClosesWindow();
    await recorder.start(SITE);
    expect(state.opened).toHaveLength(2);
    expect(recorder.status()).toMatchObject({ active: true, browserOpen: true });
  });

  it('cancels without keeping anything', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser);
    await recorder.start(SITE);
    await recorder.cancel();
    expect(state.closes).toBe(1);
    expect(recorder.status().active).toBe(false);
    expect((await failure(recorder.finish())).code).toBe('NOT_FOUND');
  });

  // Recorded traffic can hold session data, so it must not stay in memory.
  it('discards a closed recording nobody collected', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser, { abandonedAfterMs: 5 });
    await recorder.start(SITE);
    state.userClosesWindow();
    await vi.waitFor(() => {
      expect(recorder.status().active).toBe(false);
    });
    expect(state.closes).toBe(1);
  });

  it('closes a window left open for too long', async () => {
    const { browser, state } = fakeBrowser();
    const recorder = service(browser, { maxRecordingMs: 5 });
    await recorder.start(SITE);
    await vi.waitFor(() => {
      expect(recorder.status().active).toBe(false);
    });
    expect(state.closes).toBe(1);
  });
});
