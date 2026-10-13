// happy-dom window for view unit tests (no real browser); each test gets a fresh one.
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
export const dom = () => { const window = new Window({ url: 'http://localhost/' }); return { window, document: window.document }; };
// Never hand a DOM node to assert.equal/deepEqual: a failure diffs inspect(actual) and inspect(expected) at depth 1000,
// a node reaches its whole window (tens of thousands of lines) and node's line diff needs memory quadratic in that
// (G-E2: 16 GB in 10 s). Compare nodes with same(); a failure names each node by tag and test id.
const name = n => n == null ? String(n) : `<${String(n.tagName ?? n.nodeName).toLowerCase()}${n.getAttribute?.('data-testid') ? ` data-testid="${n.getAttribute('data-testid')}"` : ''}${n.getAttribute?.('data-lh-slot') ? ` data-lh-slot="${n.getAttribute('data-lh-slot')}"` : ''}>${n.isConnected === false ? ' (detached)' : ''}`;
export const same = (actual, expected, msg = 'not the same node') => { if (actual !== expected) assert.fail(`${msg}: ${name(actual)} !== ${name(expected)}`); };
