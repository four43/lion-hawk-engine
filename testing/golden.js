// T-7: golden files. A golden stores a canonical value plus its checksum; a change fails with a readable diff
// until it is accepted with LH_BLESS=1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, checksum, diff } from './state.js';

export function golden(file, value, { digits = 6, exact = false, bless = process.env.LH_BLESS === '1', ci = !!process.env.CI } = {}) {
  const path = file instanceof URL ? fileURLToPath(file) : file;
  const sum = checksum(value, { digits, exact }), current = JSON.parse(canonical(value, { digits, exact }));
  const fileExists = existsSync(path);
  if (ci && !fileExists && !bless) throw new Error(`golden ${path} is missing. Run locally (or with LH_BLESS=1) to create it, then commit it.`);
  if (bless || !fileExists) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(exact ? { checksum: sum, exact: true, value: current } : { checksum: sum, value: current }, null, 1) + '\n');
    return { written: true };
  }
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  if (!!stored.exact !== !!exact) throw new Error(`golden ${path}: stored exact=${!!stored.exact}, called with exact=${!!exact}`);
  if (stored.checksum === sum) return { written: false };
  const lines = diff(stored.value, current).slice(0, 10).map(d => `  ${d.path}: ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}`);
  let first = '';
  if (Array.isArray(stored.value?.trail) && Array.isArray(current?.trail)) {
    const b = current.trail;
    let k = 0;
    while (k < stored.value.trail.length && k < b.length && JSON.stringify(stored.value.trail[k]) === JSON.stringify(b[k])) k++;
    first = `first divergence: trail[${k}]\n`;
  }
  throw new Error(`golden ${path} changed (${stored.checksum} → ${sum}):\n${first}${lines.join('\n')}\nRe-run with LH_BLESS=1 to accept.`);
}
