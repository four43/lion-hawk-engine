#!/usr/bin/env node
// lion-hawk CLI entry (B-1). See tools/cli.js.
import { main } from '../tools/cli.js';

const code = await main(process.argv.slice(2));
if (code !== null) process.exitCode = code;
