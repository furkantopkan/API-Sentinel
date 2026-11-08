import {
  VARIABLE_NAME,
  assertionSchema,
  parseJsonPath,
  resolveText,
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

function sameOrigin(url: string, expected: string): boolean {
  try {
    return new URL(url).origin === new URL(expected).origin;
  } catch {
    return false;
  }
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

    const headers = step.headers.filter(
      (header) => header.key.trim() !== '' && !FORBIDDEN_HEADERS.has(header.key.toLowerCase()),
    );
    const texts = [step.url, step.body, ...headers.flatMap((h) => [h.key, h.value])];
    if (texts.some((text) => text.includes(REDACTED))) continue;
    if (texts.some((text) => resolveText(text, lookup).unknown.length > 0)) continue;
    if (!sameOrigin(resolveText(step.url, lookup).text, entry.url)) continue;

    const assertions = validAssertions(step.assertions);
    droppedAssertions += step.assertions.length - assertions.length;
    const captures = validCaptures(step.captures);
    captures.forEach((capture) => captured.add(capture.variable));
    steps.push({ ...step, method: entry.method, headers, assertions, captures });
  }

  return {
    draft: {
      collectionName: output.collectionName.trim().slice(0, 200) || 'AI collection',
      steps,
      variables: [...variables].map(([key, variable]) => ({ key, ...variable })),
      notes: output.notes.slice(0, 20),
    },
    droppedSteps: output.steps.length - steps.length,
    droppedAssertions,
  };
}
