// L-3, T-12: sim code never touches three.js, the DOM, view modules, the wall clock or Math.random.
// A static scan: comments are blanked first (line numbers kept, string-aware), then each line is checked.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  ['three', /\bfrom\s*['"]three(\/[^'"]*)?['"]|\bimport\s*\(\s*['"]three(\/[^'"]*)?['"]|\bimport\s*['"]three(\/[^'"]*)?['"]/],
  ['view-import', /\bfrom\s*['"][^'"]*\/view(\/|\.js['"])/],
  ['window', /(^|[^\w$.])window\s*\.|\bglobalThis\s*\.\s*window\b|(^|[^\w$.])self\s*\./],
  ['document', /(^|[^\w$.])document\s*\.|\bglobalThis\s*\.\s*document\b/],
  ['wall-clock', /\bDate\.now\s*\(|\bperformance\.now\s*\(|\bnew\s+Date\s*\(|(^|[^\w$.])Date\s*\(/],
  ['math-random', /\bMath\.random\s*\(/],
];
// D9 (phase 3): engine code never imports Rapier; the game injects it. Opt-in, because a game's own entry imports it.
const RAPIER_RULE = ['rapier', /\bfrom\s*['"]@dimforge\/[^'"]*['"]|\bimport\s*\(\s*['"]@dimforge\/|\bimport\s*['"]@dimforge\//];
// Blank comments, keeping newlines so line numbers survive. String contents are kept (imports live in strings) but are
// skipped when looking for comment openers, so '/*' or 'http://x' do not hide code after them.
export function stripComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2), j = end < 0 ? src.length : end + 2;
      out += src.slice(i, j).replace(/[^\n]/g, ' '); i = j;
    } else { out += c; i++; }
  }
  return out;
}

export function scanSource(src, file, { rapier = false } = {}) {
  const out = [], seen = new Set(), add = (line, rule) => { if (!seen.has(line + rule)) { seen.add(line + rule); out.push({ file, line, rule }); } };
  const clean = stripComments(src), rules = rapier ? [...RULES, RAPIER_RULE] : RULES;
  clean.split('\n').forEach((text, i) => { for (const [rule, re] of rules) if (re.test(text)) add(i + 1, rule); });
  const dyn = rapier ? /\bimport\s*\(\s*['"](three|@dimforge\/)/g : /\bimport\s*\(\s*['"](three)/g; // the call may span lines before the specifier
  for (let m; (m = dyn.exec(clean));) add(clean.slice(0, m.index).split('\n').length, m[1] === 'three' ? 'three' : 'rapier');
  return out.sort((a, b) => a.line - b.line);
}
const walk = p => statSync(p).isDirectory() ? readdirSync(p).sort().flatMap(n => walk(join(p, n))) : /\.m?js$/.test(p) ? [p] : [];
export function scanPurity(paths, opts) {
  return paths.filter(p => existsSync(p)).flatMap(walk).flatMap(f => scanSource(readFileSync(f, 'utf8'), f, opts));
}
// The engine's sim roots (L-3): src/core, src/defs, src/sim, src/index.sim.js and each kit's sim half. `root` ends with '/'.
export function simRoots(root) {
  const kits = `${root}src/kits`;
  const kitSims = existsSync(kits) ? readdirSync(kits).sort().map(k => `${kits}/${k}/sim.js`).filter(existsSync) : [];
  return [`${root}src/core`, `${root}src/defs`, `${root}src/sim`, `${root}src/index.sim.js`, ...kitSims];
}
