// T-7: golden files. A golden stores a canonical value plus its checksum; a change fails with a readable diff
// until it is accepted with LH_BLESS=1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical, checksum, diff } from './state.js';

export function golden(file, value, { digits = 6, bless = process.env.LH_BLESS === '1', ci = !!process.env.CI } = {}) {
  const path = file instanceof URL ? fileURLToPath(file) : file;
  const sum = checksum(value, { digits }), current = JSON.parse(canonical(value, { digits }));
  const fileExists = existsSync(path);
  if (ci && !fileExists && !bless) throw new Error(`golden ${path} is missing. Run locally (or with LH_BLESS=1) to create it, then commit it.`);
  if (bless || !fileExists) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ checksum: sum, value: current }, null, 1) + '\n');
    return { written: true };
  }
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  if (stored.checksum === sum) return { written: false };
  const lines = diff(stored.value, current).slice(0, 10).map(d => `  ${d.path}: ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}`);
  throw new Error(`golden ${path} changed (${stored.checksum} → ${sum}):\n${lines.join('\n')}\nRe-run with LH_BLESS=1 to accept.`);
}
