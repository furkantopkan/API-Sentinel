import { parseHar, type FinishRecordingResponse, type RecordingStatus } from '@api-sentinel/shared';
import { AppError } from '../../errors/AppError';
import {
  BlockedTargetError,
  assertIpLiteralAllowed,
  guardedLookup,
  isAllowlisted,
} from '../request-engine/ssrfGuard';
import type { RecordingBrowser, RecordingWindow } from './recordingBrowser';

const MAX_RECORDING_MS = 30 * 60_000;
/** Recorded traffic can hold session data: do not keep it if nobody collects it. */
const ABANDONED_AFTER_MS = 5 * 60_000;

export interface RecorderOptions {
  /** Opening a browser only makes sense on the user's own machine. */
  enabled: boolean;
  allowlist: ReadonlySet<string>;
  maxRecordingMs?: number;
  abandonedAfterMs?: number;
}

interface Session {
  window: RecordingWindow | null;
  browserOpen: boolean;
  timer: NodeJS.Timeout | null;
}

/** The address the user typed gets the same check as every other user-supplied URL. */
async function assertSafeTarget(url: URL, allowlist: ReadonlySet<string>): Promise<void> {
  if (isAllowlisted(url, allowlist)) return;
  try {
    assertIpLiteralAllowed(url);
    await new Promise<void>((resolve, reject) => {
      guardedLookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true }, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  } catch (error) {
    if (error instanceof BlockedTargetError) {
      throw new AppError(
        'BLOCKED_TARGET',
        'This address points to a private network and cannot be recorded.',
        400,
      );
    }
    throw new AppError('DNS_ERROR', 'This site could not be found.', 400);
  }
}

/** One recording at a time: there is one user and one browser window to follow. */
export function createRecorderService(browser: RecordingBrowser, options: RecorderOptions) {
  const maxRecordingMs = options.maxRecordingMs ?? MAX_RECORDING_MS;
  const abandonedAfterMs = options.abandonedAfterMs ?? ABANDONED_AFTER_MS;
  let session: Session | null = null;

  const assertEnabled = () => {
    if (!options.enabled) {
      throw new AppError(
        'RECORDER_UNAVAILABLE',
        'Recording is only available when API Sentinel runs on your own computer.',
        503,
      );
    }
  };

  const release = (current: Session): void => {
    if (current.timer) clearTimeout(current.timer);
    if (session === current) session = null;
  };

  const discard = async (current: Session): Promise<void> => {
    release(current);
    await current.window?.close();
  };

  const discardLater = (current: Session, delayMs: number): void => {
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => {
      discard(current).catch((error: unknown) => {
        console.error('[recorder] cleanup failed:', error instanceof Error ? error.message : error);
      });
    }, delayMs);
    current.timer.unref();
  };

  return {
    status(): RecordingStatus {
      return {
        available: options.enabled,
        active: session !== null,
        browserOpen: session?.browserOpen ?? false,
        captured: session?.window?.captured() ?? 0,
      };
    },

    async start(url: string): Promise<void> {
      assertEnabled();
      if (session?.browserOpen) {
        throw new AppError('RECORDING_ACTIVE', 'A recording is already in progress.', 409);
      }
      if (session) await discard(session);

      // Claimed before the first await, so a double click cannot open two windows.
      const current: Session = { window: null, browserOpen: true, timer: null };
      session = current;
      try {
        await assertSafeTarget(new URL(url), options.allowlist);
        current.window = await browser.open(url, () => {
          current.browserOpen = false;
          if (session === current) discardLater(current, abandonedAfterMs);
        });
      } catch (error) {
        release(current);
        throw error;
      }
      if (session === current && current.browserOpen) discardLater(current, maxRecordingMs);
    },

    async finish(): Promise<FinishRecordingResponse> {
      assertEnabled();
      const current = session;
      if (!current?.window) throw new AppError('NOT_FOUND', 'No recording is in progress.', 404);
      release(current);

      const parsed = parseHar({ log: { entries: await current.window.close() } });
      if (!parsed.ok) throw new AppError('INTERNAL_ERROR', 'The recording could not be read.', 500);
      return { ok: true, entries: parsed.entries, found: parsed.found };
    },

    async cancel(): Promise<void> {
      assertEnabled();
      if (session) await discard(session);
    },
  };
}

export type RecorderService = ReturnType<typeof createRecorderService>;
