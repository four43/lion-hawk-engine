# Phase 2b: outcome, rulings and carry-overs

**Status:** done on engine branch `phase-2b` (0.3.0). Engine only; the games are untouched apart from the four43 lockfile. Not merged or pushed.

**Tests:** engine 174, including a real-Chromium e2e of about 1.1 s that was stable over 3 runs. Workspace 4, Pig Pens 2, Tractor Pickup 726.

## What landed
- **Core:**
  - `setup` and the start `enter` go through the transition queue, and the duplicate check projects the queue (2a carry-over);
  - per-source device layers: the largest |axis| wins and buttons are OR'ed;
  - scene instance ids (`scene.id`, `overlayIds`);
  - `input.kinds`;
  - `engine.render(alpha)`.
- **View** (`lion-hawk/view`):
  - `createDriver`: rAF, visibility pause and reset, manual mode, survives throws via `onError`;
  - `bindKeyboard`: ramps, text-field guard, ignores modifier chords, leaves Enter and Space on buttons alone;
  - `bindGamepad`;
  - `bindStick`: optional axes, separate `surface` and `parent`, viewport edge guard, `touch-action: none`;
  - `bindHold`: correct value for both axes and buttons;
  - `createUiDom`: its own UI root, keyed reconcile, error capture;
  - `installEngine`: the full `window.engine`;
  - `defineView` and `boot`: view halves keyed by instance id, the lh-test manual driver, a safe-area `env()` default, `?scene=`/`?args=` under lh-test, and `dispose`.
- **Testing** (`lion-hawk/playwright`):
  - presets with safe areas;
  - `launch`;
  - `openGame`, which waits for `ready` and `settled`;
  - an in-page `game` driver;
  - CDP touch;
  - assertions: `expectScene`, `expectState`, `expectTappable`, `expectFitsSafeArea`, `expectNoOverlap`.

## Rulings (each with its cost if wrong)
1. Device input is split into per-source layers. Without this, keyboard, touch and pad overwrite each other every frame.
2. happy-dom is used for view unit tests; flows are still tested headless or in Playwright. Cost: one devDependency.
3. The Playwright helpers are built on `playwright-core` with `node:test`, which matches the browser Rally already has installed. Cost: our own assertions instead of `expect` matchers.
4. Under `?lh-test` the driver starts in manual mode: devices update and frames render, but nothing steps.
5. Scene instance ids are a tiny, pure addition to the core. They let view halves notice an overlay that was closed and reopened.
6. Click errors: only "disabled" and "covered" errors are swallowed; everything else goes to `window.engine.errors`.
7. `<html>` attributes follow the plan: `data-lh-overlays` is space-separated and `data-lh-settled` is `"1"`/`"0"`.
8. `touch.end` in the Playwright helper waits 150 ms before lifting, to avoid a Chromium fling. It was stable over 4 runs. Replace it with a zero-velocity final move in 2c.

## Carry-overs to 2c (from reviews; design inputs)
- **Engine and view:**
  - `onRender` is a single slot: make it additive before games wire their own render.
  - Covered controls should be `inert`.
  - Latch button presses so presses shorter than one step aren't lost (120 Hz iPad with a 60 Hz sim).
  - Assert that `sync()` doesn't allocate (T-13-style).
  - Add `policies` and `view.project` to the hook.
  - Cap or dedupe repeated errors.
  - Add the initial `scene` event, and validate `maxFrame`.
- **Devices:**
  - per-source vector merge or a radial pair dead zone (Tractor Pickup point-to-go);
  - an x-only slider mode with per-axis clamp and a function radius (Rally steering);
  - ramp and response curves as functions (Rally keyboard and pad feel);
  - modifier bindings (Shift+R);
  - keyboard and gamepad activation of UI buttons (menus);
  - `pointerType`/`button` filters (Pig Pens mouse tools);
  - releasing shifted symbol keys by `e.code`;
  - checking `gamepad.mapping`.
- **UI:**
  - a hold-to-fire control on engine time (Tractor Pickup);
  - icon or custom-content controls (the horn SVG);
  - HUD `<output>` helpers (U-2);
  - scene-scoped devices (Pig Pens' stick only while driving).
- **Boot:** a `ready` option for async init: Rapier init, track loading.
- **Still from the 2a notes:**
  - a command/pointer input channel;
  - `ctx.on`;
  - async loading;
  - Rally's world surviving the title screen.
