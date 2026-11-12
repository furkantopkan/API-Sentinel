import {
  MAX_RECORDED_BODY,
  MAX_RESPONSE_SAMPLE,
  responseSampleText,
  type HarEntry,
} from '@api-sentinel/shared';
import type { Request, Response } from 'playwright';
import { AppError } from '../../errors/AppError';
import { createActionTracker, reportedTime, userActionScript, type Trigger } from './userActions';

const MAX_CAPTURED = 500;
/** Name of the function the recorded page calls to report a user action. */
const ACTION_BINDING = '__apiSentinelUserAction';

/** A navigation of the main window (service worker requests have no frame). */
function isMainPage(request: Request): boolean {
  try {
    return request.isNavigationRequest() && request.frame().parentFrame() === null;
  } catch {
    return false;
  }
}
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

/** Only text is useful to the AI; images, fonts and downloads are never read. */
const TEXT_MIME = /json|html|text\/|xml|javascript/i;

/**
 * Keeps the exchange in HAR form; parseHar later applies the same rules as for
 * an imported HAR file. The body of a page is reduced to its text first, so
 * the sample shows the page's words rather than the first scripts in it.
 */
async function toHarEntry(response: Response, trigger: Trigger): Promise<HarEntry> {
  const request = response.request();
  const mime = response.headers()['content-type'] ?? '';
  const headers = await request.allHeaders();
  // A body can be gone already: the page navigated away (e.g. a "remove" that reloads the page).
  const body = TEXT_MIME.test(mime) ? await response.text().catch(() => '') : '';
  const text = responseSampleText(mime, body);
  return {
    _resourceType: request.resourceType(),
    _trigger: trigger,
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

      // Which requests the user caused: the window reports clicks, submits and Enter.
      const tracker = createActionTracker();
      const startedAt = new WeakMap<object, number>();
      await context.exposeBinding(ACTION_BINDING, (_source, at: unknown) => {
        tracker.userActed(reportedTime(at));
      });
      await context.addInitScript({ content: userActionScript(ACTION_BINDING) });
      context.on('request', (request) => {
        const at = Date.now();
        startedAt.set(request, at);
        if (isMainPage(request)) tracker.navigationStarted(at);
      });

      context.on('response', (response) => {
        const request = response.request();
        const type = request.resourceType();
        // Pages count only in the main window: frames are mostly ads and widgets.
        const page = type === 'document' && isMainPage(request);
        if ((type !== 'xhr' && type !== 'fetch' && !page) || reads.length >= MAX_CAPTURED) return;
        // A page in the main window is always one the user opened or was sent to.
        const trigger = page ? 'user' : tracker.triggerOf(startedAt.get(request) ?? Date.now());
        // Reserving the slot now keeps the arrival order, however long each body takes to read.
        const slot = results.push(null) - 1;
        reads.push(
          toHarEntry(response, trigger).then(
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
