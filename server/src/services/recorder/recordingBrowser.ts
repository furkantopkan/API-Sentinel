import { MAX_RECORDED_BODY, MAX_RESPONSE_SAMPLE, type HarEntry } from '@api-sentinel/shared';
import type { Response } from 'playwright';
import { AppError } from '../../errors/AppError';

const MAX_CAPTURED = 500;
const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 3_000;

/** An open browser window whose API traffic is being captured. */
export interface RecordingWindow {
  captured(): number;
  /** Closes the window (safe to call twice) and returns the traffic in the order responses arrived. */
  close(): Promise<HarEntry[]>;
}

/** Hides Playwright from the service, so tests can run without opening a real browser. */
export interface RecordingBrowser {
  open(url: string, onClosed: () => void): Promise<RecordingWindow>;
}

/** Same filter as a HAR import: JSON responses, plus writes that answer with no content. */
async function toHarEntry(response: Response): Promise<HarEntry | null> {
  const request = response.request();
  const mime = response.headers()['content-type'] ?? '';
  const isJson = mime.toLowerCase().includes('json');
  if (!isJson && (request.method() === 'GET' || mime !== '')) return null;

  const headers = await request.allHeaders();
  const text = isJson ? await response.text() : '';
  return {
    _resourceType: request.resourceType(),
    request: {
      method: request.method(),
      url: request.url(),
      headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
      postData: { text: (request.postData() ?? '').slice(0, MAX_RECORDED_BODY) },
    },
    response: {
      status: response.status(),
      content: { mimeType: mime, text: text.slice(0, MAX_RESPONSE_SAMPLE) },
    },
  };
}

/**
 * Captures traffic in memory instead of using Playwright's HAR file: a file
 * would put session data on disk, and it is only written if the browser
 * closes cleanly, which is not the case when the user closes the window.
 * Each recording uses a fresh profile, so no saved login is ever exposed.
 */
export function createPlaywrightRecordingBrowser(options: { headless: boolean }): RecordingBrowser {
  return {
    async open(url, onClosed) {
      let browser;
      try {
        const { chromium } = await import('playwright');
        browser = await chromium.launch({ headless: options.headless });
      } catch (error) {
        console.error(
          '[recorder] browser launch failed:',
          error instanceof Error ? error.message : error,
        );
        throw new AppError(
          'RECORDER_UNAVAILABLE',
          'The recording browser could not be opened. Run "npx playwright install chromium" and try again.',
          503,
        );
      }

      const context = await browser.newContext({ viewport: null });
      const results: (HarEntry | null)[] = [];
      const reads: Promise<void>[] = [];
      let count = 0;

      context.on('response', (response) => {
        const type = response.request().resourceType();
        if ((type !== 'xhr' && type !== 'fetch') || reads.length >= MAX_CAPTURED) return;
        // Reserving the slot now keeps the arrival order, however long each body takes to read.
        const slot = results.push(null) - 1;
        reads.push(
          toHarEntry(response).then(
            (entry) => {
              results[slot] = entry;
              if (entry) count += 1;
            },
            // The page navigated away before the body could be read: nothing to keep.
            () => undefined,
          ),
        );
      });

      let closed = false;
      const markClosed = () => {
        if (closed) return;
        closed = true;
        onClosed();
      };
      browser.on('disconnected', markClosed);
      context.on('page', (page) =>
        page.on('close', () => {
          if (context.pages().length === 0) markClosed();
        }),
      );

      try {
        const page = await context.newPage();
        // "commit": the site answered. The user watches the rest load in the window.
        await page.goto(url, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS });
      } catch {
        await browser.close();
        throw new AppError('CONNECTION_ERROR', 'This address could not be opened.', 502);
      }

      let finished: Promise<HarEntry[]> | null = null;
      return {
        captured: () => count,
        close: () =>
          (finished ??= (async () => {
            let timer: NodeJS.Timeout | undefined;
            await Promise.race([
              Promise.allSettled(reads),
              new Promise((done) => (timer = setTimeout(done, SETTLE_TIMEOUT_MS))),
            ]);
            clearTimeout(timer);
            await browser.close();
            return results.filter((entry) => entry !== null);
          })()),
      };
    },
  };
}
