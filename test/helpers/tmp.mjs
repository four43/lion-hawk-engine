// Temp dirs for tests: tmp(prefix) is mkdtempSync under the OS temp dir, removed when this test file's process exits
// (node --test runs each file in its own process), so runs leave nothing behind.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const made = [];
process.on('exit', () => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
export function tmp(prefix = 'lh-') { const d = mkdtempSync(join(tmpdir(), prefix)); made.push(d); return d; }
