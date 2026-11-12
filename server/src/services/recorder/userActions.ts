/**
 * Tells the requests the user caused apart from those the page sends by
 * itself (banners, recommendations, tracking). The recording window reports
 * every click, form submit and Enter key; a request belongs to the user when
 * it starts shortly after one of them and before the next page starts
 * loading: what a new page loads by itself is background again.
 */

export type Trigger = 'user' | 'page';

/** Long enough for a click handler to send its request, short enough to leave polling out. */
export const ACTION_WINDOW_MS = 2000;
const MAX_EVENTS = 10_000;

export interface ActionTracker {
  userActed(at?: number): void;
  navigationStarted(at?: number): void;
  triggerOf(startedAt: number): Trigger;
}

export function createActionTracker(now: () => number = Date.now): ActionTracker {
  const actions: number[] = [];
  const navigations: number[] = [];
  const remember = (list: number[], at: number) => {
    list.push(at);
    if (list.length > MAX_EVENTS) list.shift();
  };

  return {
    userActed: (at = now()) => remember(actions, at),
    navigationStarted: (at = now()) => remember(navigations, at),
    triggerOf(startedAt) {
      const action = actions.filter((at) => at <= startedAt).at(-1);
      if (action === undefined || startedAt - action > ACTION_WINDOW_MS) return 'page';
      const newPageSince = navigations.some((at) => at > action && at < startedAt);
      return newPageSince ? 'page' : 'user';
    },
  };
}

/**
 * The time the page reported for a click. The page can call the function
 * itself, so anything that is not a recent time is replaced by "now".
 */
export function reportedTime(value: unknown, now: number = Date.now()): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(now - value) <= 60_000
    ? value
    : now;
}

/**
 * The script the recorded page runs to report clicks, form submits and Enter.
 * Plain text on purpose: a function would be copied with the helpers our
 * TypeScript runner adds to it, which do not exist in the page, and fail.
 * Capture phase, so the site cannot stop the report; the time sent is the
 * time of the click itself, as the report can arrive after the request the
 * click started.
 */
export function userActionScript(binding: string): string {
  const name = JSON.stringify(binding);
  return `(() => {
  const report = () => {
    const send = window[${name}];
    if (typeof send === 'function') send(Date.now());
  };
  window.addEventListener('click', report, true);
  window.addEventListener('submit', report, true);
  window.addEventListener('keydown', (event) => { if (event.key === 'Enter') report(); }, true);
})();`;
}
