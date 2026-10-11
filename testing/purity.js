// L-3, T-12: sim code never touches three.js, the DOM, view modules, the wall clock or Math.random.
// A static scan: comments are blanked first (line numbers kept), then each line is checked.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  ['three', /\bfrom\s*['"]three(\/[^'"]*)?['"]|\bimport\s*\(\s*['"]three(\/[^'"]*)?['"]/],
  ['view-import', /\bfrom\s*['"][^'"]*\/view(\/|\.js['"])/],
  ['window', /(^|[^\w$.])window\s*\./],
  ['document', /(^|[^\w$.])document\s*\./],
  ['wall-clock', /\bDate\.now\s*\(|\bperformance\.now\s*\(/],
  ['math-random', /\bMath\.random\s*\(/],
];
// keep newlines so line numbers survive; strings are left alone (imports live in strings)
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

export function scanSource(src, file) {
  const out = [];
  stripComments(src).split('\n').forEach((text, i) => { for (const [rule, re] of RULES) if (re.test(text)) out.push({ file, line: i + 1, rule }); });
  return out;
}
const walk = p => statSync(p).isDirectory() ? readdirSync(p).sort().flatMap(n => walk(join(p, n))) : /\.m?js$/.test(p) ? [p] : [];
export function scanPurity(paths) {
  return paths.filter(p => existsSync(p)).flatMap(walk).flatMap(f => scanSource(readFileSync(f, 'utf8'), f));
}
