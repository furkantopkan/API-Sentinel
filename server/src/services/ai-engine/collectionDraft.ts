import {
  VARIABLE_NAME,
  assertionSchema,
  evaluateAssertions,
  isUserAction,
  parseJsonPath,
  resolveJsonPath,
  resolveText,
  type ExecutedResponse,
  type Capture,
  type CollectionDraft,
  type CollectionDraftOutput,
  type RecordedEntry,
  type SuggestedAssertion,
  type VariableLookup,
} from '@api-sentinel/shared';
import { FORBIDDEN_HEADERS } from '../request-engine/headerPolicy';
import { PROMPT_BODY_CHARS } from './prompts';
import { REDACTED } from './redact';

const MAX_ASSERTIONS_PER_STEP = 8;

function validAssertions(suggestions: readonly SuggestedAssertion[]): SuggestedAssertion[] {
  return suggestions
    .filter((s) => assertionSchema.safeParse({ ...s, id: 'check', enabled: true }).success)
    .slice(0, MAX_ASSERTIONS_PER_STEP);
}

function validCaptures(captures: CollectionDraftOutput['steps'][number]['captures']): Capture[] {
  return captures.filter(
    (capture) => VARIABLE_NAME.test(capture.variable) && parseJsonPath(capture.path).ok,
  );
}

function foundIn(document: unknown, path: string): boolean {
  const parsed = parseJsonPath(path);
  return parsed.ok && resolveJsonPath(document, parsed.segments).found;
}

/**
 * Models mix up the shape of a response: "name" for an array ([0].name is
 * meant) or "[0].count" for an object (count is meant). The recording shows
 * what was meant. When the whole sample is there, the path is checked against
 * it; a sample that was cut off only tells whether the root is an array.
 */
function pathForResponse(path: string, sample: string): string {
  if (path === '') return path;
  const trimmed = sample.trimStart();
  const rootIsArray = trimmed.startsWith('[');
  const withIndex = path.startsWith('[') ? path : `[0].${path}`;
  const withoutIndex = path.replace(/^\[\d+\]\.?/, '');

  let document: unknown;
  try {
    document = JSON.parse(sample) as unknown;
  } catch {
    if (rootIsArray) return withIndex;
    return trimmed.startsWith('{') && withoutIndex !== '' ? withoutIndex : path;
  }
  for (const candidate of [path, rootIsArray ? withIndex : withoutIndex]) {
    if (candidate !== '' && foundIn(document, candidate)) return candidate;
  }
  return path;
}

function sameOrigin(url: string, expected: string): boolean {
  try {
    return new URL(url).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

/** Variables a step refers to, in its URL, body or headers. */
function variablesUsedBy(step: CollectionDraft['steps'][number]): Set<string> {
  const names = new Set<string>();
  const collect: VariableLookup = (name) => {
    names.add(name);
    return 'x';
  };
  for (const text of [step.url, step.body, ...step.headers.flatMap((h) => [h.key, h.value])]) {
    resolveText(text, collect);
  }
  return names;
}

/**
 * A capture that fails marks its step as failed, so one nobody uses can only
 * do harm. Models add them often, whatever the instructions say.
 */
function withoutUnusedCaptures(steps: CollectionDraft['steps']): CollectionDraft['steps'] {
  return steps.map((step, index) => {
    const usedLater = new Set(steps.slice(index + 1).flatMap((s) => [...variablesUsedBy(s)]));
    return { ...step, captures: step.captures.filter((c) => usedLater.has(c.variable)) };
  });
}

/**
 * Models drop Content-Type with the browser headers, but without it a form
 * body would be sent as JSON and fail. The recording says what it was.
 */
function withRecordedContentType(
  headers: CollectionDraft['steps'][number]['headers'],
  body: string,
  entry: RecordedEntry,
): CollectionDraft['steps'][number]['headers'] {
  if (body.trim() === '' || headers.some((h) => h.key.toLowerCase() === 'content-type')) {
    return headers;
  }
  const recorded = entry.requestHeaders.find(([name]) => name.toLowerCase() === 'content-type');
  return recorded ? [...headers, { key: 'Content-Type', value: recorded[1] }] : headers;
}

/**
 * The complete part of a JSON document that was cut off: everything up to the
 * last finished value, with the open objects and arrays closed again.
 * Undefined when the text is not the start of a JSON object or array.
 */
export function visiblePartOf(text: string): unknown {
  if (!/^\s*[[{]/.test(text)) return undefined;
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  let cut = -1;
  let closersAtCut: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') closers.push('}');
    else if (char === '[') closers.push(']');
    else if (char === '}' || char === ']') {
      closers.pop();
      cut = i + 1;
      closersAtCut = [...closers];
    } else if (char === ',') {
      // Everything before a comma is a finished value.
      cut = i;
      closersAtCut = [...closers];
    }
  }
  if (cut < 0) return undefined;
  try {
    return JSON.parse(text.slice(0, cut) + closersAtCut.reverse().join('')) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * An assertion that fails on the very response it was written from would fail
 * on every run, so it is dropped. Only checked when the recorded JSON is
 * complete; response time and headers were not recorded, so those are kept,
 * as is anything that uses a {{variable}}.
 */
function holdsOnRecording(
  assertion: SuggestedAssertion,
  entry: RecordedEntry,
  original: string,
): boolean {
  if (assertion.kind !== 'jsonPath' && assertion.kind !== 'status') return true;
  if (`${assertion.target}${assertion.expected}`.includes('{{')) return true;
  let text = original;
  try {
    JSON.parse(original);
  } catch {
    if (assertion.kind === 'status') return assertion.expected.trim() === String(entry.status);
    // A sample cut off at the size limit: the part that is visible is checked.
    const visible = visiblePartOf(original);
    if (visible === undefined) return true;
    text = JSON.stringify(visible);
  }
  const recorded: ExecutedResponse = {
    status: entry.status,
    statusText: '',
    headers: [['content-type', entry.responseContentType]],
    body: { kind: 'json', text },
    sizeBytes: original.length,
    durationMs: 0,
    finalUrl: entry.url,
    redirects: [],
  };
  // Already validated by validAssertions; parsed again only to get the exact type.
  const parsed = assertionSchema.safeParse({ ...assertion, id: 'check', enabled: true });
  if (!parsed.success) return false;
  const [result] = evaluateAssertions([parsed.data], recorded);
  return result?.outcome === 'pass';
}

export interface CheckedDraft {
  draft: CollectionDraft;
  droppedSteps: number;
  droppedAssertions: number;
  /** User actions the AI left out (or never saw), added from the recording. */
  addedSteps: number;
  /** Steps for requests the page sent by itself, left out of the flow. */
  backgroundSteps: number;
}

type DraftStep = CollectionDraft['steps'][number];

/** Page titles come from the page source: &amp; and the like are shown as the characters they stand for. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return text.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X'))
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return named[code.toLowerCase()] ?? whole;
  });
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * What a request does, in a few words: many sites name the action in a query
 * value (index.php?route=checkout/cart/add), others in the last parts of the path.
 */
function actionOf(url: URL): string {
  const named = [...url.searchParams.values()].find((value) => /^[\w-]+(\/[\w-]+)+$/.test(value));
  if (named) return named;
  // Ids say nothing about the action and change on every run.
  const parts = url.pathname.split('/').filter((part) => part !== '' && !isIdentifier(part));
  return parts.length === 0 ? 'home page' : parts.slice(-2).join('/');
}

/** A short name for the sidebar: a page by its title, a change by its action. */
function shortName(entry: RecordedEntry, original: string): string {
  const url = new URL(entry.url);
  if (entry.method === 'GET' && /html/i.test(entry.responseContentType)) {
    const title = original.split('\n')[0]?.trim() ?? '';
    return `Open: ${clip(decodeEntities(title !== '' ? title : actionOf(url)), 60)}`;
  }
  return `${entry.method} ${clip(actionOf(url).split(REDACTED).join('…'), 60)}`;
}

/**
 * A step the user caused is named after what they clicked, in their words:
 * 'Click "Add to cart"'. When one click led to several steps, the step's own
 * name follows, so the names stay apart. Steps with nothing clicked (the
 * first page, a value passed on) keep their name.
 */
function namedAfterActions(
  steps: DraftStep[],
  entryOf: (index: number) => RecordedEntry | undefined,
): DraftStep[] {
  const actions = steps.map((step) => entryOf(step.sourceIndex)?.action);
  const count = new Map<string, number>();
  for (const action of actions) {
    if (action !== undefined) count.set(action, (count.get(action) ?? 0) + 1);
  }
  return steps.map((step, position) => {
    const action = actions[position];
    if (action === undefined) return step;
    const name = (count.get(action) ?? 0) > 1 ? `${action} – ${step.name}` : action;
    return { ...step, name: clip(name, 200) };
  });
}

/**
 * A step built straight from the recording, for a page the user opened or a
 * change they made that the AI left out. Checks only what is certain: the
 * status, and for a page its first line of text (usually the title).
 */
function stepFromRecording(
  entry: RecordedEntry,
  original: string,
  variables: Map<string, { value: string; secret: boolean }>,
): DraftStep | null {
  const secret = (name: string) => secretVariable(name, variables);

  let origin: string;
  try {
    origin = new URL(entry.url).origin;
  } catch {
    return null;
  }
  let base = [...variables].find(([, v]) => !v.secret && v.value === origin)?.[0];
  if (base === undefined && !variables.has('baseUrl')) {
    variables.set('baseUrl', { value: origin, secret: false });
    base = 'baseUrl';
  }
  const url = withSecretVariables(
    base === undefined ? entry.url : `{{${base}}}${entry.url.slice(origin.length)}`,
    secret,
  );
  const body = withSecretVariables(entry.requestBody, secret);
  const headers = withRecordedContentType([], entry.requestBody, entry).concat(
    entry.requestHeaders
      .filter(
        ([name]) =>
          name.toLowerCase() !== 'content-type' && !FORBIDDEN_HEADERS.has(name.toLowerCase()),
      )
      // Every header the page sent: APIs often need their own (client ids, tenant ids).
      .map(([name, value]) => ({
        key: name,
        value: value === REDACTED ? `{{${secret(name)}}}` : value,
      })),
  );
  if ([url, body].some((text) => text.includes(REDACTED))) return null;

  const assertions: SuggestedAssertion[] = [
    { kind: 'status', target: '', operator: 'equals', expected: String(entry.status) },
  ];
  const firstLine = original.split('\n')[0]?.trim() ?? '';
  if (entry.method === 'GET' && firstLine !== '' && firstLine.length <= 120) {
    assertions.push({ kind: 'body', target: '', operator: 'contains', expected: firstLine });
  }
  return {
    sourceIndex: entry.index,
    name: shortName(entry, original),
    method: entry.method,
    url,
    headers,
    body,
    assertions,
    captures: [],
  };
}

/** A blank secret variable the user fills in; the model never sees the value. */
function secretVariable(
  name: string,
  variables: Map<string, { value: string; secret: boolean }>,
): string {
  let key = name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=\d)/, '_') || 'secret';
  if (!VARIABLE_NAME.test(key)) key = 'secret';
  const existing = variables.get(key);
  if (existing && !existing.secret) key = `${key}_secret`;
  variables.set(key, { value: '', secret: true });
  return key;
}

/** Masked values become {{variables}}: a recorded login stays in the flow, without its password. */
function withSecretVariables(text: string, secret: (name: string) => string): string {
  const marker = REDACTED.replace(/[[\]]/g, '\\$&');
  return text
    .replace(
      new RegExp(`([?&]|^)([^=&?\\s]+)=${marker}`, 'g'),
      (_m, lead: string, name: string) => {
        let decoded = name;
        try {
          decoded = decodeURIComponent(name);
        } catch {
          // keep the name as written
        }
        return `${lead}${name}={{${secret(decoded)}}}`;
      },
    )
    .replace(
      new RegExp(`"([^"]+)"(\\s*:\\s*)"${marker}"`, 'g'),
      (_m, key: string, colon: string) => `"${key}"${colon}"{{${secret(key)}}}"`,
    );
}

/** Values that identify something and change between runs: ids, uuids, codes. Not words or small numbers. */
function isIdentifier(text: string): boolean {
  return text.length >= 6 && text.length <= 200 && /\d/.test(text) && /^[\w.:~-]+$/.test(text);
}

const IDENTIFIER_KEY = /^[A-Za-z_$][\w$]*$/;

/** Every identifier in a JSON document, with the path that reaches it. */
function identifiersIn(document: unknown): Map<string, { path: string; key: string }> {
  const found = new Map<string, { path: string; key: string }>();
  const visit = (value: unknown, path: string, key: string, depth: number) => {
    if (depth > 12 || found.size > 2000) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${String(index)}]`, key, depth + 1));
    } else if (value !== null && typeof value === 'object') {
      for (const [name, child] of Object.entries(value)) {
        const step = IDENTIFIER_KEY.test(name)
          ? `${path === '' ? '' : '.'}${name}`
          : `[${JSON.stringify(name)}]`;
        visit(child, `${path}${step}`, name, depth + 1);
      }
    } else if (
      typeof value === 'string' ||
      (typeof value === 'number' && Number.isInteger(value))
    ) {
      const text = String(value);
      // The first place wins: it is usually the main one (products[0], not a copy further down).
      if (isIdentifier(text) && !found.has(text)) found.set(text, { path, key });
    }
  };
  visit(document, '', 'value', 0);
  return found;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A later step that sends an id an earlier step received (the cart item id
 * that "add to cart" returned, used by "remove") must take it from that
 * answer on every run: the recorded id belongs to the recorded session.
 * Found by comparing the recording, not left to the model.
 */
function chainValues(
  steps: CollectionDraft['steps'],
  samples: ReadonlyMap<number, string>,
  variables: Map<string, { value: string; secret: boolean }>,
): CollectionDraft['steps'] {
  const result = steps.map((step) => ({ ...step, captures: [...step.captures] }));
  const taken = new Set([
    ...variables.keys(),
    ...steps.flatMap((s) => s.captures.map((c) => c.variable)),
  ]);
  const answers = result.map((step) => {
    const sample = samples.get(step.sourceIndex) ?? '';
    let document: unknown;
    try {
      document = JSON.parse(sample) as unknown;
    } catch {
      document = visiblePartOf(sample);
    }
    return document === undefined
      ? new Map<string, { path: string; key: string }>()
      : identifiersIn(document);
  });

  result.forEach((step, position) => {
    const texts = () => [step.url, step.body, ...step.headers.map((h) => h.value)].join('\n');
    for (let earlier = position - 1; earlier >= 0; earlier--) {
      for (const [value, where] of answers[earlier] ?? []) {
        const pattern = new RegExp(`(?<![\\w-])${escapeRegExp(value)}(?![\\w-])`, 'g');
        if (!pattern.test(texts())) continue;

        const source = result[earlier]!;
        let variable = source.captures.find((c) => c.path === where.path)?.variable;
        if (variable === undefined) {
          const base = where.key.replace(/[^\w]/g, '_').replace(/^(?=\d)/, '_') || 'value';
          // A variable the model defined with this name but no step uses can give way.
          if (variables.has(base) && !result.some((s) => usesVariable(s, base))) {
            variables.delete(base);
            taken.delete(base);
          }
          variable = base;
          for (let n = 2; taken.has(variable); n++) variable = `${base}${String(n)}`;
          taken.add(variable);
          source.captures.push({ variable, path: where.path, secret: false });
        }
        const placeholder = `{{${variable}}}`;
        const swap = (text: string) => text.replace(pattern, placeholder);
        step.url = swap(step.url);
        step.body = swap(step.body);
        step.headers = step.headers.map((h) => ({ ...h, value: swap(h.value) }));
      }
    }
  });
  return result.map((step) => ({ ...step, assertions: step.assertions.map(withoutRecordedId) }));
}

const usesVariable = (step: CollectionDraft['steps'][number], name: string) =>
  variablesUsedBy(step).has(name);

/**
 * "id equals <the recorded id>" fails on every run, as the id is new each
 * time; whether the field is there is what can be checked.
 */
function withoutRecordedId(assertion: SuggestedAssertion): SuggestedAssertion {
  if (assertion.kind !== 'jsonPath' || assertion.operator !== 'equals') return assertion;
  const expected = assertion.expected.trim().replace(/^"(.*)"$/, '$1');
  return (isIdentifier(expected) && /[A-Za-z]/.test(expected)) || /^\d{8,}$/.test(expected)
    ? { ...assertion, operator: 'exists', expected: '' }
    : assertion;
}

/**
 * Whether a body the model wrote can be sent like the recorded one: not
 * empty, and still JSON when the recorded body was JSON ({{variables}} count
 * as values, so "{{sku}}" in quotes is fine and a bare {{count}} is checked as a number).
 */
function sendable(body: string, entry: RecordedEntry): boolean {
  if (body.trim() === '') return false;
  const contentType = entry.requestHeaders.find(([name]) => name.toLowerCase() === 'content-type');
  if (contentType && !/json/i.test(contentType[1])) return true;
  try {
    JSON.parse(entry.requestBody);
  } catch {
    return true; // the recorded body was not JSON either
  }
  try {
    JSON.parse(resolveText(body, () => '1').text);
    return true;
  } catch {
    return false;
  }
}

/** Puts each added step after the last step that comes earlier in the recording. */
function insertInRecordedOrder(steps: DraftStep[], added: DraftStep): void {
  let position = 0;
  steps.forEach((step, index) => {
    if (step.sourceIndex < added.sourceIndex) position = index + 1;
  });
  steps.splice(position, 0, added);
}

/**
 * The model's answer is only a proposal. A step is kept only if it can be
 * traced to the recording and can actually run:
 * - it points at a recorded entry, and its URL stays on that entry's server,
 *   so an invented host or endpoint cannot get in;
 * - every {{variable}} is defined or captured by an EARLIER step;
 * - no masked value was copied back in.
 * Secret values are always blank: the user enters them, never the model.
 */
export function checkDraft(
  output: CollectionDraftOutput,
  entries: readonly RecordedEntry[],
  /** The response samples as recorded, before masking and reformatting. */
  originalSamples: ReadonlyMap<number, string>,
  /** The whole (masked) recording, also what was not sent to the AI. */
  recording: readonly RecordedEntry[] = entries,
): CheckedDraft {
  const entryByIndex = new Map(entries.map((entry) => [entry.index, entry]));

  const variables = new Map<string, { value: string; secret: boolean }>();
  for (const variable of output.variables) {
    if (!VARIABLE_NAME.test(variable.key) || variables.has(variable.key)) continue;
    const masked = variable.value.includes(REDACTED);
    const secret = variable.secret || masked;
    variables.set(variable.key, { value: secret ? '' : variable.value, secret });
  }

  const captured = new Set<string>();
  // Placeholders only need to resolve to something URL-safe for these checks.
  const lookup: VariableLookup = (name) => {
    if (captured.has(name)) return 'x';
    const variable = variables.get(name);
    if (!variable) return undefined;
    return variable.secret ? 'x' : variable.value;
  };

  let droppedAssertions = 0;
  const steps: CollectionDraft['steps'] = [];

  for (let step of output.steps) {
    const entry = entryByIndex.get(step.sourceIndex);
    if (!entry) continue;

    // The model saw only the start of a long body, or wrote one that cannot be
    // sent (empty, or no longer JSON): the recorded body is the sure one.
    if (
      entry.requestBody !== '' &&
      (entry.requestBody.length > PROMPT_BODY_CHARS || !sendable(step.body, entry))
    ) {
      step = {
        ...step,
        body: withSecretVariables(entry.requestBody, (name) => secretVariable(name, variables)),
      };
    }
    const headers = withRecordedContentType(
      step.headers.filter(
        (header) => header.key.trim() !== '' && !FORBIDDEN_HEADERS.has(header.key.toLowerCase()),
      ),
      step.body,
      entry,
    );
    const texts = [step.url, step.body, ...headers.flatMap((h) => [h.key, h.value])];
    if (texts.some((text) => text.includes(REDACTED))) continue;
    if (texts.some((text) => resolveText(text, lookup).unknown.length > 0)) continue;
    if (!sameOrigin(resolveText(step.url, lookup).text, entry.url)) continue;

    const original = originalSamples.get(entry.index) ?? '';
    const assertions = validAssertions(
      step.assertions
        // Text the response never contained would fail on every run.
        .filter(
          (a) =>
            !(a.kind === 'body' && a.operator === 'contains' && !original.includes(a.expected)),
        )
        .map((assertion) =>
          assertion.kind === 'jsonPath'
            ? { ...assertion, target: pathForResponse(assertion.target, entry.responseSample) }
            : assertion,
        ),
    ).filter((assertion) => holdsOnRecording(assertion, entry, original));
    droppedAssertions += step.assertions.length - assertions.length;
    const captures = validCaptures(
      step.captures.map((capture) => ({
        ...capture,
        path: pathForResponse(capture.path, entry.responseSample),
      })),
    );
    captures.forEach((capture) => captured.add(capture.variable));
    steps.push({ ...step, method: entry.method, headers, assertions, captures });
  }

  // What the user did must be in the flow, whatever the model chose.
  const covered = new Set(steps.map((step) => step.sourceIndex));
  const modelSteps = steps.length;
  for (const entry of recording) {
    if (covered.has(entry.index) || !isUserAction(entry)) continue;
    // Pages and changes are certain; which reads after a click matter is the model's call.
    if (entry.method === 'GET' && !/html/i.test(entry.responseContentType)) continue;
    const added = stepFromRecording(entry, originalSamples.get(entry.index) ?? '', variables);
    if (added) insertInRecordedOrder(steps, added);
  }

  // A request the page sent by itself belongs in the flow only to pass a
  // value on (an id, a token) to a later step. Models add them anyway.
  // Only the recorder knows this for sure: without its "trigger" (a HAR
  // file), a GET the user's click caused looks like any other.
  const recordedByIndex = new Map(recording.map((entry) => [entry.index, entry]));
  const flow = chainValues(
    withoutUnusedCaptures(steps).filter((step) => {
      const entry = recordedByIndex.get(step.sourceIndex) ?? entryByIndex.get(step.sourceIndex);
      return entry?.trigger !== 'page' || step.captures.length > 0;
    }),
    originalSamples,
    variables,
  );

  const named = namedAfterActions(
    flow,
    (index) => recordedByIndex.get(index) ?? entryByIndex.get(index),
  );

  return {
    draft: {
      collectionName: output.collectionName.trim().slice(0, 200) || 'AI collection',
      steps: named,
      // A variable no step uses (often the model's copy of a recorded id) is only clutter.
      variables: [...variables]
        .filter(([key]) => flow.some((step) => usesVariable(step, key)))
        .map(([key, variable]) => ({ key, ...variable })),
      notes: output.notes.slice(0, 20),
    },
    droppedSteps: output.steps.length - modelSteps,
    droppedAssertions,
    addedSteps: steps.length - modelSteps,
    backgroundSteps: steps.length - flow.length,
  };
}
