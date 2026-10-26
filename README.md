# Lion Hawk

An opinionated 3D web physics engine for browser games. The stack is fixed: three.js renders, Rapier simulates, models are glTF, materials come from one registry, and online play is host-authoritative replication over WebRTC. Because none of these parts can be swapped, the engine wires them together for you, and still hands your game the real `THREE.Scene` and `RAPIER.World` ([L-1]).

Plain JavaScript ES modules. No TypeScript, no framework, no build step for the engine.

## What you get

- **A fixed-step, deterministic sim.** The engine owns the loop. Same seed and recorded input give the same checksum, so runs can be replayed, forked and compared.
- **Entities and physics.** Spawn bodies from baked model sidecars, join them, place them at sockets, react to contacts and sensors, add heightfields, wind, aero, buoyancy and magnets.
- **A material registry.** Friction, density, restitution and sound are defined once per material and drive both the physics and the shaders.
- **Input and players.** Declared actions bound to keyboard, gamepad, touch sticks, pointer and gestures; several local seats; remappable profiles; haptics; menus navigable by pad.
- **Rendering and presentation.** Render pipeline and lights, a material compiler, entity-to-three.js sync, instancing and crowds, chase/orbit/mount camera rigs, asset loading and animation tables.
- **Audio.** Buses, voices, cues, impact sounds from materials, and a DSP host for audio-thread synths.
- **Online multiplayer.** The host owns the sim and replicates snapshots to up to 8 peers, with interpolation and forecast for remote bodies. No lockstep or rollback.
- **Kits** (optional, per game): vehicle (raycast or Magic Formula tires, powertrain, engine sound), terrain, coverage (mud, dirt, snow), fx (particles, tyre marks) and glyphs (device button icons).
- **Tools.** A `lion-hawk` CLI that bakes models, serves, builds, tests and releases a game.
- **Test helpers.** Run the game headless in Node in milliseconds, assert on events and state, check determinism and purity, pin golden files, test several peers in one process, and drive the built page in Chromium.

## Install

Games install the engine at a release tag:

```sh
npm install git+ssh://git@github.com/four43/lion-hawk-engine.git#v0.14.0
npm install three@^0.186.0 @dimforge/rapier3d-compat@^0.21.0
```

three.js and Rapier are peer dependencies. `playwright-core` is an optional peer, needed only for browser tests.

## The shape of a game

```
<game>/
├── game.config.js     # id, bake, build and test settings
├── src/game.sim.js    # export default defineGame({...}): runs in Node
├── src/game.view.js   # export default defineView({...}): browser only
├── assets/  baked/    # source models, and the sidecars `lion-hawk bake` writes
└── test/
```

Every module is either **sim** or **view** ([L-3]):

- **Sim** code runs in Node. It imports `lion-hawk/sim` and `lion-hawk/kits/<kit>`, and never three.js, the DOM, `Math.random` or the wall clock. The engine never imports Rapier: the game passes its initialised module in with `defineGame({ physics: { rapier } })`.
- **View** code runs in the browser. It imports `lion-hawk/view` (which re-exports all of `lion-hawk/sim`), `lion-hawk/kits/<kit>/view` and three.js.

### A minimal game

The sim half: a title screen, a 3-2-1 countdown, then a throttle that moves `x` to 50.

```js
// src/game.sim.js
import { defineGame, actions, axis, button } from 'lion-hawk/sim';

export default defineGame({
  id: 'countdown',
  sim: { hz: 60, maxCatchUp: 3 },
  actions: actions({ throttle: axis(), pause: button() }),
  start: 'title',
  scenes: {
    title: { ui(u) { u.button({ id: 'play', label: 'Play', action: e => e.go('race') }); } },
    race: {
      enter(e, ctx) { Object.assign(ctx.state, { count: 3, t: 0, x: 0, running: false }); },
      step(e, dt, ctx) {
        const s = ctx.state;
        if (!s.running) {
          s.t += dt;
          if (s.t >= 1 - 1e-9) { s.t = 0; s.count--; e.emit('count', { n: s.count }); if (s.count === 0) s.running = true; }
          return;
        }
        if (e.input.snapshot.pause.pressed) { e.overlay('pause'); return; }
        s.x += e.input.snapshot.throttle * 10 * dt;
        if (s.x >= 50) { e.emit('finish', { x: s.x }); e.overlay('results'); }
      },
      presets: { running(e, opts, ctx) { Object.assign(ctx.state, { count: 0, running: true, x: 0 }); } },
    },
    pause: { pauses: true, ui(u) { u.button({ id: 'resume', label: 'Resume', action: e => e.close('pause') }); } },
    results: { pauses: true, ui(u) { u.button({ id: 'retry', label: 'Retry', action: e => e.go('race') }); } },
  },
  state: e => ({ x: e.scene.state.x ?? null }),
});
```

The view half draws the race and binds devices:

```js
// src/game.view.js
import { boot, defineView, bindKeyboard, bindStick } from 'lion-hawk/view';
import game from './game.sim.js';

const view = defineView({
  scenes: {
    race: {
      enter(engine, v) { v.x = v.doc.createElement('div'); v.root.appendChild(v.x); },
      frame(engine, alpha, v) { v.x.textContent = String(Math.round(engine.scene.state.x ?? 0)); },
      exit(engine, v) { v.x.remove(); },
    },
  },
});

boot(game, view, {
  devices: [
    e => bindKeyboard(e, { w: ['throttle', 1] }),
    e => bindStick(e, { root: document.body, y: ['throttle', 1] }),
  ],
});
```

And a test that runs it headless, with no browser:

```js
// test/race.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headless, policy } from 'lion-hawk/test';
import game from '../src/game.sim.js';

test('half throttle for one second moves x by 5', () => {
  const h = headless(game, { scene: 'race' });
  h.jump('race', 'running');
  h.step(60, policy.const({ throttle: 0.5 }));
  assert.ok(Math.abs(h.scene.state.x - 5) < 1e-9);
});
```

`h.jump('race', 'running')` applies the race scene's `running` preset, skipping the countdown. The engine's own version of this game is `test/fixtures/countdown.js`; the other files in `test/fixtures/` are small complete games too.

## Entry points

| Import | What it holds |
|---|---|
| `lion-hawk/sim` | `defineGame`, actions, events, `rng`, math, the world, materials, fields, interpolation |
| `lion-hawk/view` | everything in sim, plus `defineView`, `boot`, input devices, rendering, view sync, camera rigs, assets, audio |
| `lion-hawk/net` | ports, room links, peer keys, the in-memory hub and fake lag |
| `lion-hawk/kits/<kit>` and `lion-hawk/kits/<kit>/view` | the sim and view halves of a kit |
| `lion-hawk/test` | `headless`, `expectEvents`, `fixtures`, `golden`, `checks`, `invariants`, `replay`, `mp` |
| `lion-hawk/playwright` | `launch`, `openGame`, `expectGame`, `peers` for driving the built page in Chromium |
| `lion-hawk/bake`, `lion-hawk/build` | the bake and build tools as modules |

[`docs/agents.md`](docs/agents.md) is the full index: for each task it names the import, the functions to call and the spec section that says exactly what they do.

## CLI

```
lion-hawk bake    [--game <dir>] [--check] [ids...]          # models → colliders, mass, sockets, aero panels
lion-hawk dev     [--game <dir>] [--port 8740] [--host ...]  # serve the game while editing
lion-hawk build   [--game <dir>] [--out <dir>] [--mode single|shared] [--e2e]
lion-hawk test    [--game <dir>] [--visual]                  # your tests plus determinism, materials and purity checks
lion-hawk release [--game <dir>] [--bump patch|minor|major] [--out <dir>]
```

`npx lion-hawk help` prints them all.

## Documentation

The docs ship in the package, so `node_modules/lion-hawk/docs/` matches the version your game installed. `main` can be ahead of your tag; see `## Unreleased` in [`CHANGELOG.md`](CHANGELOG.md).

- [`docs/agents.md`](docs/agents.md): where each feature lives. Start here.
- [`docs/specs/as-built/`](docs/specs/as-built/README.md): what the code does now, one numbered behavior (`B-n`) per statement with `path:line` evidence.
- [`docs/spec.md`](docs/spec.md): the design decisions and the requirement IDs (`[L-3]`, `[M-14]`, …) that code, commits and the changelog cite.
- [`docs/field-notes.md`](docs/field-notes.md): problems games ran into and what the engine changed because of them.
- [`docs/design.md`](docs/design.md), `docs/research*.md`: background reasoning.
- [`CHANGELOG.md`](CHANGELOG.md): what changed in each version. Changes that break games are in bold.

## Working on the engine

```sh
npm install
npm test                               # the whole suite
node --test test/<name>.test.mjs       # one file
```

Browser tests start Chromium through `testing/playwright.js` and skip when none is found. The suite enforces:

- **Sim purity**: `src/core`, `src/defs`, `src/sim` and each kit's `sim.js` import no three.js, DOM, wall clock or view code.
- **Determinism**: the same seed and tape give the same checksum.
- **No per-step allocation** in step-stage code, held to a byte budget per step.
- **Warnings are failures**: an unexpected `console.warn` or `console.error` inside a headless call fails the test.

[`AGENTS.md`](AGENTS.md) has the full contributor rules: which doc is the truth, what to update when behavior changes, and the commit and release conventions.

## License

Private. Not licensed for use outside the project.
