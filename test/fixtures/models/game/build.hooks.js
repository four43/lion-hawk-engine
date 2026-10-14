// Fixture build hooks (B-2): beforePage records the context; page fills <!--HOOK--> as Tractor's voice embedding does.
import { existsSync } from 'node:fs';
let seen = null;
export default {
  beforePage(ctx) { seen = { e2e: ctx.e2e, version: ctx.version, engine: ctx.engine, out: typeof ctx.out === 'string' && existsSync(ctx.out) ? 'set' : null }; },
  page(html, ctx) { return html.replace('<!--HOOK-->', `window.__HOOK__=${JSON.stringify(seen)};`); },
};
