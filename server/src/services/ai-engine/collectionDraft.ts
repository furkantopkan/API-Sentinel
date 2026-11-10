import {
  VARIABLE_NAME,
  assertionSchema,
  evaluateAssertions,
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
  try {
    JSON.parse(original);
  } catch {
    return assertion.kind === 'jsonPath' || assertion.expected.trim() === String(entry.status);
  }
  const recorded: ExecutedResponse = {
    status: entry.status,
    statusText: '',
    headers: [['content-type', entry.responseContentType]],
    body: { kind: 'json', text: original },
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

  for (const step of output.steps) {
    const entry = entryByIndex.get(step.sourceIndex);
    if (!entry) continue;

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

  return {
    draft: {
      collectionName: output.collectionName.trim().slice(0, 200) || 'AI collection',
      steps: withoutUnusedCaptures(steps),
      variables: [...variables].map(([key, variable]) => ({ key, ...variable })),
      notes: output.notes.slice(0, 20),
    },
    droppedSteps: output.steps.length - steps.length,
    droppedAssertions,
  };
}
