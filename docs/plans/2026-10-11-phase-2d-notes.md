# Phase 2d: outcome, rulings and carry-overs

**Status:** done.
- **Engine:** 0.5.1 on branch `phase-2d`.
- **Rally:** adopted the new engine features on four43 `feat/lion-hawk` (`76884ad`, `4f7f364`).
- Nothing merged, pushed (four43) or deployed.

## What landed
- **Commands and replay:**
  - `engine.command` with game-wide and scene-scoped handlers; a command sent to a scene covered by a pausing overlay is dropped (#49);
  - a replay tape that checks payloads are plain JSON while recording, and names the first step where the checksums differ;
  - `bindPointer` and `view.project`.
- **Loading protocol (S-6):**
  - `ctx.load` takes hold, frames and settle;
  - only frames drawn after the request count;
  - `onBuilt` runs with the view-half `built` hook;
  - `engine.loading` exposes `blocks`;
  - loading a scene that is already loading throws;
  - the Playwright helper waits out loads that `view.wait` holds (#50).
- **UI:** `isOpen({pending})`, `ui.enabled`/`tryTap`, UI sync before view-half enter, `view.focus`, `ui.hold`/`press`/`release`.
- **Device correctness:**
  - the latch owes every tap;
  - a second source pressing a held button causes no extra edges;
  - device dt is capped;
  - `clearDevice` drops taps it still owes;
  - `bindHold` takes `focus: false`;
  - pointer and hold fixes.
- **Tooling and policies:**
  - additive `onRender`;
  - `lion-hawk/build` dedupe plugin, proven to cut two copies of three.js down to one;
  - `policy.every` with `phase` and `key`, moved to `lion-hawk/sim`;
  - `?lh-test=render`;
  - assertions that accept selectors.
- **Tests:** engine 270.
- **Rally:** `src` went from 4323 to 4282 lines. Its workarounds are gone:
  - `openOnce`'s try/catch
  - the LOAD_HOLD counter
  - `focuser`
  - error-text matching
  - `noFocus`
  - dt caps
  - the WeakMap

  Both goldens and the 167.400 / 167.492 s run times are unchanged.

## Rulings (each with its cost if wrong)
1. **Tasks were batched by area** to limit controller context. Cost if wrong: larger review surfaces.
2. **View acks go through `engine.command`; `ctx.on` is deferred.**
3. **D1–D2:**
   - replay sets inputs each step with `set` rather than `hold`;
   - while recording, command data must be plain JSON and the logged copy is what gets delivered.
4. **D4:**
   - loads count only frames drawn after the request;
   - `onBuilt` lets the view block the load before settle is checked. This was chosen over an extra step, which would have moved Rally's stage golden.
5. **The final fix wave absorbed the next round's items** (#50, #51, re-entrant `ctx.load`, owed taps, focus warning) to avoid a separate engine round.
6. **Game order:** Pig Pens migrates next, because it fits the engine now. Tractor Pickup goes last; it needs a network command model and decisions on how farm generation loads.
7. **Field notes:** an implementer was blocked by the permission system from editing the engine's field notes. The controller wrote entries #50 and #51 itself as part of its own logging job, and told the user.

## Carry-overs
- **Final pass for Rally:**
  - restore the stage view's `built` hook, now that #50 is fixed;
  - body classes duplicate the `data-lh-*` attributes;
  - keep `s.ctx` out of serialised state.
- **Engine, later:**
  - `seconds()` in the Playwright helper does not yet wait out loads;
  - the engine's `package-lock.json` is stale;
  - minor items left in place: the `testUrl` regex, the unreachable `boxOf` message, double registration of `onRender`, `bySelector` relying on `toString`, and documenting `bindStick`'s `preventDefault`.
- **Tractor Pickup needs:**
  - network messages as game-wide commands, with time carried in the payload;
  - binary frames decoded for tapes;
  - farm rebuilds through `ctx.load` from a command handler;
  - a decision between a synchronous build and an async worker;
  - show timing in the sim, or a view-ack command;
  - a point-to-go device that turns the stick into a world-frame vector;
  - a bedtime clock command;
  - `ui.hold` for the wake button.
