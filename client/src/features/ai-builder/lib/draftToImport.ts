import {
  assertionSchema,
  type Assertion,
  type CollectionDraft,
  type CollectionDraftStep,
  type CollectionImport,
} from '@api-sentinel/shared';

/** Reads and changes: writes can alter real data, so they start unselected. */
export function isReadOnly(step: CollectionDraftStep): boolean {
  return step.method === 'GET';
}

function toAssertions(step: CollectionDraftStep, stepNumber: number): Assertion[] {
  return step.assertions.flatMap((suggestion, index) => {
    const parsed = assertionSchema.safeParse({
      ...suggestion,
      id: `step${stepNumber}-a${index + 1}`,
      enabled: true,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

/** The selected steps of a reviewed draft, ready to be saved as a collection, in order. */
export function draftToImport(
  draft: CollectionDraft,
  name: string,
  selected: ReadonlySet<number>,
): CollectionImport {
  const steps = draft.steps.filter((_, index) => selected.has(index));
  return {
    name,
    requests: steps.map((step, index) => ({
      name: step.name.trim().slice(0, 200) || `Step ${index + 1}`,
      request: {
        method: step.method,
        url: step.url,
        queryParams: [],
        headers: step.headers.map((header) => ({ ...header, enabled: true })),
        auth: { type: 'none' },
        body: step.body,
        options: { followRedirects: true },
      },
      assertions: toAssertions(step, index + 1),
      captures: step.captures,
    })),
  };
}

/** Variables used by a later step but captured by a step the user left out. */
export function missingCaptures(draft: CollectionDraft, selected: ReadonlySet<number>): string[] {
  const defined = new Set(draft.variables.map((variable) => variable.key));
  const missing = new Set<string>();
  draft.steps.forEach((step, index) => {
    if (selected.has(index)) {
      const text = [step.url, step.body, ...step.headers.map((h) => h.value)].join(' ');
      for (const match of text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g)) {
        const name = match[1];
        if (name !== undefined && !defined.has(name)) missing.add(name);
      }
      step.captures.forEach((capture) => defined.add(capture.variable));
    }
  });
  return [...missing];
}
