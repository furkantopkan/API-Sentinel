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
  /** `label`: what the user clicked, e.g. 'Click "Add to cart"'. */
  userActed(at?: number, label?: string): void;
  navigationStarted(at?: number): void;
  /** A change on the site (POST, PUT, PATCH, DELETE) was answered. */
  changeAnswered(startedAt: number, answeredAt?: number): void;
  triggerOf(startedAt: number): Trigger;
  /** What the user did just before a request (or page) started, when the page could tell. */
  labelOf(startedAt: number): string | undefined;
}

/**
 * Besides pages, one more thing ends what a click caused: once a change it
 * sent has been answered, what follows is the page showing the result
 * (seen on a shop: after "add to cart" answered, a box loaded payment
 * options, delivery dates and offers). The change itself was sent at once.
 */
export function createActionTracker(now: () => number = Date.now): ActionTracker {
  const actions: number[] = [];
  const labels = new Map<number, string>();
  const navigations: number[] = [];
  const answers: { startedAt: number; answeredAt: number }[] = [];
  const remember = <T>(list: T[], item: T) => {
    list.push(item);
    if (list.length > MAX_EVENTS) list.shift();
  };

  return {
    userActed: (at = now(), label) => {
      remember(actions, at);
      // A submit (no text of its own) follows the click on its button: keep the click's text.
      if (label !== undefined) labels.set(at, label);
      if (labels.size > MAX_EVENTS) labels.delete(labels.keys().next().value!);
    },
    navigationStarted: (at = now()) => remember(navigations, at),
    changeAnswered: (startedAt, answeredAt = now()) => remember(answers, { startedAt, answeredAt }),
    triggerOf(startedAt) {
      const action = actions.filter((at) => at <= startedAt).at(-1);
      if (action === undefined || startedAt - action > ACTION_WINDOW_MS) return 'page';
      const newPageSince = navigations.some((at) => at > action && at < startedAt);
      const resultShown = answers.some(
        (answer) => answer.startedAt >= action && answer.answeredAt <= startedAt,
      );
      return newPageSince || resultShown ? 'page' : 'user';
    },
    labelOf(startedAt) {
      const labelled = actions.filter((at) => at <= startedAt && labels.has(at)).at(-1);
      if (labelled === undefined || startedAt - labelled > ACTION_WINDOW_MS) return undefined;
      return labels.get(labelled);
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

/** What the page reported the user clicked: page text, so only a short single line is kept. */
export function reportedLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.replace(/\s+/g, ' ').trim();
  return label === '' ? undefined : label.slice(0, MAX_LABEL);
}
const MAX_LABEL = 80;

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
  // String.raw: the backslashes of the regular expressions below reach the page as written.
  return String.raw`(() => {
  const report = (label) => {
    const send = window[${name}];
    if (typeof send === 'function') send(Date.now(), label);
  };
  const MAX = 60;
  const lineOf = (text) => (typeof text === 'string' ? text.split('\n').map((l) => l.trim()).find((l) => l !== '') : undefined);
  // The words the user saw on what they clicked: a label or title first (a product card's
  // title names the product; its text starts with whatever is on top), then the text.
  // Only numbers (a cart badge's "1") or a symbol ("+") only if nothing better.
  const textOf = (start) => {
    if (!(start instanceof Element)) return undefined;
    const el = start.closest('a,button,label,summary,select,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox]') || start;
    const own = el instanceof HTMLInputElement && el.type !== 'password' && /^(button|submit|reset)$/.test(el.type) ? el.value : undefined;
    const image = el.querySelector && el.querySelector('img[alt]');
    const alt = image ? image.alt : undefined;
    // A link around a picture is a product or category card: the picture's text names it.
    const found = (el.tagName === 'A'
      ? [el.getAttribute('aria-label'), el.getAttribute('title'), alt, lineOf(el.innerText)]
      : [el.getAttribute('aria-label'), el.getAttribute('title'), lineOf(el.innerText), own, alt])
      .map((t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : ''))
      .filter((t) => t !== '');
    const text = found.find((t) => /\p{L}/u.test(t)) || found.find((t) => /\p{N}/u.test(t)) || found[0];
    return text === undefined ? undefined : text.slice(0, MAX);
  };
  const quoted = (verb, text) => (text === undefined ? undefined : verb + ' "' + text + '"');
  window.addEventListener('click', (event) => report(quoted('Click', textOf(event.target))), true);
  window.addEventListener('submit', (event) => report(quoted('Click', textOf(event.submitter))), true);
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const field = event.target;
    // A search box: what was searched for names the step. Other fields (a login) are never read.
    const named = (text) => /search|query|^q$|(^|[^a-zçğıöşü])ara(ma)?([^a-zçğıöşü]|$)/i.test(text || '');
    const search = field instanceof HTMLInputElement && (field.type === 'search' || [field.name, field.id, field.placeholder, field.getAttribute('role')].some(named));
    report(search && field.type !== 'password' ? quoted('Search', field.value.trim().slice(0, MAX) || undefined) : undefined);
  }, true);
})();`;
}
