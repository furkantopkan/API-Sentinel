// Traceability: every manual scenario in docs/test-strategy.md (API-001, CO-03…05, …)
// must be named by an automated test, or be listed as manual-only with a reason.
// Run with `npm run traceability`; exits with 1 when a scenario has neither.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** "CO-03…05", "AN-03 / 04", "RU-15, 16" -> every id they stand for. */
export function expandIds(text) {
  const ids = new Set();
  const pattern = /\b([A-Z]{2,3})-(\d{1,3})((?:\s*(?:…|\.\.\.|\/|,)\s*\d{1,3}\b)*)/g;
  for (const [, prefix, first, rest] of text.matchAll(pattern)) {
    const numbers = [Number(first)];
    for (const [, separator, n] of rest.matchAll(/(…|\.\.\.|\/|,)\s*(\d{1,3})/g)) {
      const last = numbers.at(-1);
      if (separator === '…' || separator === '...') {
        for (let i = last + 1; i <= Number(n); i++) numbers.push(i);
      } else numbers.push(Number(n));
    }
    for (const n of numbers) ids.add(`${prefix}-${String(n).padStart(first.length, '0')}`);
  }
  return ids;
}

const strategy = readFileSync(join(root, 'docs/test-strategy.md'), 'utf8');
const scenarios = new Map();
for (const line of strategy.split('\n')) {
  const cells = line.match(/^\| ([A-Z]{2,3}-[^|]+)\| ([^|]*)\|/);
  if (cells) for (const id of expandIds(cells[1])) scenarios.set(id, cells[2].trim());
}
// "**Yalnızca manuel:** CO-09 (reason) …" in the strategy.
const manualLine = strategy.split('\n').find((l) => l.startsWith('**Yalnızca manuel:**')) ?? '';
const manualOnly = expandIds(manualLine);

const testFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(test|spec)\.tsx?$/.test(name)) testFiles.push(full);
  }
};
for (const dir of ['e2e', 'server/tests', 'client/src', 'shared/src']) walk(join(root, dir));

const automated = new Map();
for (const file of testFiles) {
  for (const id of expandIds(readFileSync(file, 'utf8'))) {
    if (!automated.has(id)) automated.set(id, relative(root, file).replaceAll('\\', '/'));
  }
}

const missing = [...scenarios.keys()].filter((id) => !automated.has(id) && !manualOnly.has(id));
const groups = new Map();
for (const id of scenarios.keys()) {
  const group = id.split('-')[0];
  const g = groups.get(group) ?? { total: 0, automated: 0, manual: 0 };
  g.total++;
  if (automated.has(id)) g.automated++;
  else if (manualOnly.has(id)) g.manual++;
  groups.set(group, g);
}
for (const [group, g] of groups) {
  const manual = g.manual > 0 ? `, ${g.manual} manual-only` : '';
  console.log(`${group.padEnd(4)} ${g.automated}/${g.total} automated${manual}`);
}
const total = scenarios.size;
const done = [...scenarios.keys()].filter((id) => automated.has(id)).length;
console.log(`all  ${done}/${total} automated, ${manualOnly.size} manual-only`);
if (missing.length > 0) {
  console.error(`\nScenarios with no automated test and not marked manual-only:`);
  for (const id of missing) console.error(`  ${id}  ${scenarios.get(id)}`);
  process.exitCode = 1;
}
