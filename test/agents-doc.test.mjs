// test/agents-doc.test.mjs: docs/agents.md ships to the games as their index of the engine, so its links must land on a
// real file and heading, and each name in a table row's Use column must be exported by the row's Import entry point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docPath = process.env.LH_AGENTS_DOC ?? `${root}docs/agents.md`; // LH_AGENTS_DOC: red proof on a scratch copy
const doc = readFileSync(docPath, 'utf8');
const pkg = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

// GitHub's heading anchor: lower case, punctuation dropped, spaces to hyphens.
const slug = h => h.trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-');
const anchors = file => new Set([...readFileSync(file, 'utf8').matchAll(/^#{1,6} (.+)$/gm)].map(m => slug(m[1])));

// Names a module exports, following `export *` and counting `export { a as b }` as b.
function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^export (?:async )?(?:function\*?|const|let|class) ([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export \{([^}]*)\}/gm))
    for (const part of m[1].split(',').map(s => s.trim()).filter(Boolean)) names.add(part.split(/\s+as\s+/).pop());
  for (const m of src.matchAll(/^export \* from '([^']+)'/gm)) for (const n of exportsOf(resolve(dirname(file), m[1]), seen)) names.add(n);
  return names;
}

function entryFile(spec) {
  const sub = `.${spec.slice('lion-hawk'.length)}`;
  for (const [key, target] of Object.entries(pkg.exports)) {
    const re = new RegExp(`^${key.replace(/[.]/g, '\\.').replace('*', '([^/]+)')}$`);
    const m = sub.match(re);
    if (m) return `${root}${target.replace('*', m[1] ?? '').slice(2)}`;
  }
  return null;
}

const rows = doc.split('\n').filter(l => /^\| [^-|]/.test(l) && !/^\| I want to/.test(l))
  .map(l => l.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim()));

test('every link in docs/agents.md lands on a file, and on a heading when it names one', () => {
  const bad = [];
  for (const [, href] of doc.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^https?:/.test(href)) continue;
    const [path, hash] = href.split('#');
    const file = resolve(dirname(docPath), path);
    if (!existsSync(file)) bad.push(`${href}: no file`);
    else if (hash && !anchors(file).has(hash)) bad.push(`${href}: no heading`);
  }
  assert.deepEqual(bad, []);
});

test('each name in a row\'s Use column is exported by its Import entry point', () => {
  const bad = [];
  let checked = 0;
  for (const cells of rows) {
    const spec = cells[1]?.match(/^`(lion-hawk\/[^`]+)`$/)?.[1];
    if (!spec) continue;
    const file = entryFile(spec);
    if (!file || !existsSync(file)) { bad.push(`${spec}: not a package export`); continue; }
    const names = exportsOf(file);
    for (const [, code] of cells[2].matchAll(/`([^`]+)`/g)) {
      const name = code.match(/^([\w$]+)(?:\(|$)/)?.[1];
      if (!name) continue; // engine.go, world.spawn, h.fork: members, not exports
      checked++;
      if (!names.has(name)) bad.push(`${spec} does not export ${name}`);
    }
  }
  assert.ok(checked >= 60, `only ${checked} names checked: did the table format change?`);
  assert.deepEqual(bad, []);
});
