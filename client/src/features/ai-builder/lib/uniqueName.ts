/**
 * A name no collection or environment has yet: "Flow", then "Flow (2)", "Flow (3)"...
 * The new environment gets the same name as its collection, and two
 * environments with one name cannot be told apart in the selector.
 */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.trim().toLowerCase()));
  const base = name.trim();
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}
