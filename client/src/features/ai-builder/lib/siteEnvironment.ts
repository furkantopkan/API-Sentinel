import {
  siteOfUrl,
  type CollectionDraft,
  type EnvironmentVariable,
  type VariableInput,
} from '@api-sentinel/shared';

/**
 * One environment per site: every flow recorded on hepsiburada.com shares the
 * environment "hepsiburada.com". The site comes from the draft's baseUrl, or
 * from its first absolute address.
 */
export function siteEnvironmentName(draft: CollectionDraft): string | null {
  const baseUrl = draft.variables.find((variable) => variable.key === 'baseUrl')?.value;
  const firstUrl = draft.steps.map((step) => step.url).find((url) => /^https?:\/\//i.test(url));
  for (const url of [baseUrl, firstUrl]) {
    if (url) {
      const site = siteOfUrl(url);
      if (site) return site;
    }
  }
  return null;
}

const placeholder = (key: string) =>
  new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'g');

function renamed(draft: CollectionDraft, from: string, to: string): CollectionDraft {
  const swap = (text: string) => text.replace(placeholder(from), `{{${to}}}`);
  return {
    ...draft,
    variables: draft.variables.map((v) => (v.key === from ? { ...v, key: to } : v)),
    steps: draft.steps.map((step) => ({
      ...step,
      url: swap(step.url),
      body: swap(step.body),
      headers: step.headers.map((header) => ({ ...header, value: swap(header.value) })),
    })),
  };
}

/**
 * The site's environment with the draft's variables added, and the draft to
 * save with it. A variable the environment already has with the same value
 * (baseUrl) or as a secret is shared; one with another value gets a name of
 * its own (key_2), so the collections already using the old one keep working.
 * Existing variables are sent back by id without the value of secrets, which
 * keeps the stored secret: values the user filled in are never lost.
 */
export function mergeIntoEnvironment(
  existing: readonly EnvironmentVariable[],
  draft: CollectionDraft,
): { variables: VariableInput[]; draft: CollectionDraft } {
  const variables: VariableInput[] = existing.map((v) => ({
    id: v.id,
    key: v.key,
    isSecret: v.isSecret,
    enabled: v.enabled,
    ...(v.isSecret ? {} : { value: v.value }),
  }));
  const taken = new Set([...existing.map((v) => v.key), ...draft.variables.map((v) => v.key)]);
  let result = draft;
  for (const variable of draft.variables) {
    const old = existing.find((v) => v.key === variable.key);
    const shared =
      old !== undefined &&
      old.isSecret === variable.secret &&
      (variable.secret || old.value === variable.value);
    if (shared) continue;
    let key = variable.key;
    if (old !== undefined) {
      let n = 2;
      while (taken.has(`${variable.key}_${n}`)) n++;
      key = `${variable.key}_${n}`;
      taken.add(key);
      result = renamed(result, variable.key, key);
    }
    variables.push({ key, value: variable.value, isSecret: variable.secret, enabled: true });
  }
  return { variables, draft: result };
}
