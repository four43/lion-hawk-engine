# Lion Hawk: controller menu navigation research (2026-10-18)

Research on making every menu in Rally, Pig Pens and Tractor Pickup usable with a game controller, as an engine feature. Section 1 surveys the code today. Sections 2 and 3 cover how established engines and frameworks do it. Sections 4 and 5 give options and questions for the user. Nothing is built yet.

Sources are linked next to each claim. **(summary)** marks a claim that rests on a search-result summary rather than a full read. **(unverified)** marks prior knowledge I could not confirm from a primary source in this pass.

## 1. What the games and engine have today

### 1.1 Engine (lion-hawk 0.11.1)

Line references in `src/core/ui.js`, `src/view/uiDom.js` and `src/view/boot.js` are to HEAD (9f24ac0). While this was written, uncommitted work in the working tree was changing those files: an allocation-free `ui.view()` and a `uiDom` rework. Re-check the line numbers once that work lands.

- **Scope rule.** The spec puts "an engine-built UI toolkit" out of scope: games use HTML overlays plus the §5.4 helpers (`docs/spec.md:47`). A navigation feature has to work on game markup, not replace it.
- **The control registry is the right anchor.**
  - Scenes declare `ui.button / toggle / choice / field / hold` (`spec.md` [U-1], `src/core/ui.js:18-31`).
  - The browser renders them as real `<button>`/`<input>` elements, or adopts game markup marked `data-lh-slot` (`src/view/uiDom.js:56-111`). Each gets `data-testid="<scene>.<id>"`, plus `disabled` and `aria-pressed`.
  - `ui.tree()` lists every control with its role, `enabled`, `pressed` and `group` (`core/ui.js:35-42`), and it works headless. It holds no geometry.
- **Activation already goes through the registry.**
  - A DOM `click` on an owned button calls `engine.ui.tap(id)` (`uiDom.js:16-20`). Taps from outside the sim are recorded as `['tap', id]` ops ([T-9], `spec.md:487`).
  - Holds press on pointerdown or on Space/Enter while focused, and release on lift (`uiDom.js:33-51`).
  - So a controller "Submit" that clicks the focused element, or presses and releases a hold, is replayable for free.
- **Focus support is minimal.**
  - `view.focus(testid)` focuses a control once it exists and is enabled, unless the player already moved focus. It gives up after 5 refreshes (`spec.md:341`, `src/view/boot.js:44-56`).
  - There is no focus movement, no focus scope, and no restore on close. Field note #113 is still open: focus is lost when an adopted element is swapped (`docs/field-notes.md:764-768`).
  - Field notes #9 and #18 list "keyboard/gamepad focus and activation of UI buttons" as **still open** (`field-notes.md:24`, `:227`).
- **Input devices.**
  - `bindGamepad` polls `getGamepads()` every frame using the standard mapping. It writes levels (axes, `pressed` booleans) into a per-source layer and merges all pads (`src/view/gamepad.js:124-158`). It produces no edges, has no repeat, and does not look at `Gamepad.id` or `mapping`. Field note #8 marks `gamepad.mapping` as open (`field-notes.md:23`).
  - The `createInput` layer turns rising edges into owed presses per step (`src/core/actions.js:22-57`).
  - `bindKeyboard` ignores keys while a text field has focus. It leaves Enter and Space on a focused `<button>` to the browser (`src/view/keyboard.js:24-29`, field note #15). Arrow keys reach the game, and nothing moves focus with them.
- **Scenes and overlays.**
  - `engine.overlay(name)` stacks scenes. Only an overlay with `pauses: true` "covers" the scenes below it: their controls become disabled and their commands are dropped (`src/core/engine.js:167-170`, `spec.md` [S-2], [I-7]).
  - A non-pausing overlay (Rally's settings over the title, every Tractor overlay) leaves the controls below it enabled. There is no "modal" or focus-scope notion apart from `pauses`.
  - `<html data-lh-overlays>` and `[data-lh-overlay=<name>]` roots exist ([U-3], `uiDom.js:85-88`, `:116-117`), so a view module can find the topmost overlay root.
- **Conventions a new feature must fit.**
  - Sim/view split [L-3]: focus geometry is view-only, and the sim never touches the DOM.
  - Flow state lives in scenes or the sim [S-4]: Back that closes an overlay is flow, so it belongs in a sim half. Focus position is presentation.
  - Controls press actions; scenes own transitions (#39, `spec.md:338`).
  - View timers run on engine or frame time, never `setTimeout` [U-5]. Devices get `update(dt, raw)` with dt capped at `maxFrame` (#44).
  - No per-frame allocation [R-8].
  - Headless tests through `lion-hawk/test`, browser tests through `lion-hawk/playwright` (§7.4–7.5). The engine's DOM tests use happy-dom (`package.json:28`), which does no layout, so spatial scoring must be a pure function over injected rects, with Playwright covering real layout.
  - Every claim gets a requirement ID in `spec.md` and a field-note number.

### 1.2 Rally

- **Menus.** Four overlays: `title`, `pause` (the only one with `pauses: true`), `results` and `settings` (`games/rally/src/game/overlays.js:12-58`). All are engine controls on adopted game markup (`index.template.html:276-327`):
  - segmented choice rows (`.seg` of `<button>`s, `ui.choice`);
  - a seed text field, a dice button, and a plain `<button type="submit">Go</button>` that is not registered;
  - footer buttons.
  - There are no `<select>`s, range sliders or checkboxes.
- **Keyboard.**
  - Esc/P map to `pause` and Enter to `confirm` (`src/devices.js:29-34`).
  - Overlay sim halves read those edges:
    - title: `confirm` drives (`overlays.js:27`);
    - pause: `pause` closes it (`:37`);
    - results: `confirm` retries (`:45`);
    - settings: `pause` closes the sheet (`:56`).
  - Focus can move only by Tab. The focus ring is `:focus-visible` CSS (`index.template.html:62`, `:157`).
- **Gamepad.**
  - `PAD` maps A to both `handbrake` and `confirm`, Start to `pause`, bumpers to shift, X to camera and Y to reset (`src/devices.js:41-45`).
  - So a pad can start a run (A on the title), pause and resume (Start), and retry (A on results). It **cannot move between options or change any setting**. B and the D-pad are unbound.
- **Initial focus.** `view.focus('pause.resume')` and `view.focus('results.retry')` (`src/game.view.js:80`, `:87`). The title sets none. On exit the title blurs the active element so Space/Enter go back to the car (`game.view.js:53`).
- **Conflict to note.** A on the title fires `confirm`, which drives. With D-pad navigation, A on a focused choice would both select it and start the run. Field note #15 already hit this with the keyboard. Input routing (§3, "Consumption") has to solve it.

### 1.3 Pig Pens

- **No overlays and no gamepad device at all** (`games/pig-pens/src/devices.js:41-50`). design.md says the same (`design.md:424`).
- **Controls.** The HUD is always on screen (`src/game/farm.js:226-233`, `template.html:110-142`):
  - the tool choice in a `<nav id="tools">` bar;
  - a night toggle and a bell button;
  - an info card's close button and a "Get out" button (both shown only in some states, through `when`).
- **Keyboard.**
  - 1–5 pick tools, B rings the bell, Esc means `back`, E gets out, H sounds the horn, WASD/arrows drive (`devices.js:34-38`).
  - Focus rings are `:focus-visible` CSS (`template.html:55`, `:69`, `:80`, `:98`).
- **Gameplay is pointer picking** (`bindPointer` on the canvas, sending rays). A controller can't play without a virtual cursor (Microsoft's "mouse mode", §2.6). This is out of scope for menu navigation, but it limits what "controller support" can mean for this game.

### 1.4 Tractor Pickup

- **Menus.** Eight non-pausing overlays: `start`, `show`, `reward`, `paint`, `book`, `parent`, `multiplayer` and `sleep` (`games/tractor-pickup/src/game/overlays.js:16-45`).
  - Their registered controls are only the go and close buttons, plus two holds: `show.skip` (1 s) and `sleep.wake` (5 s).
  - The parent menu opens through a 2 s hold on the HUD gear, `farm.parent`, as a child lock (`src/game/farm.js:186`).
- **Most of the menu is not in the registry.** `src/ui/menus.js` builds these as plain buttons with their own `click` listeners (`menus.js:63`, `:165-177`, `:208-222`):
  - paint swatches and sticker-book pages;
  - the parent menu's segmented rows (bedtime, power, voice, music) and New farm/Clear;
  - a `type="number"` seed input;
  - the multiplayer panel's buttons, a checkbox and a room-code text input.
  - So a registry-only navigator would miss most of Tractor's menus. A DOM-focus navigator would not.
- **Gamepad.**
  - The left stick drives and A is the horn (`src/devices.js:16`).
  - No overlay reads the pad, and no button closes a menu. The legacy `src/ui/input.js` pad loop is dead code apart from `HORN_SVG`.
- **Keyboard.** There is no Esc/back. Enter submits the room code (`menus.js:224`).
- **Gameplay is held during menus.** The paint and book overlays set `game.mode = 'menu'`, which holds the tractor (`overlays.js:10-14`). The stick does not drive while they are open, so reusing it for navigation would not leak into gameplay.

## 2. How engines and frameworks do it

### 2.1 Unity

- **uGUI `Selectable` navigation.**
  - Each selectable has `Navigation.Mode`: None, Horizontal, Vertical, Automatic or Explicit ([Navigation.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/UI/Core/Navigation.cs); [manual](https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-SelectableNavigation.html)). Automatic is the default, Explicit names `selectOnUp/Down/Left/Right`, and None also stops click focus.
  - `wrapAround` exists, but only applies in the Horizontal and Vertical modes.
- **Automatic scoring** ([Selectable.cs `FindSelectable`](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/UI/Core/Selectable.cs)):
  - It starts from the point on the current rect's edge in the move direction.
  - Each other interactable selectable is scored by `score = dot(dir, v) / |v|²` (line 849), where `v` runs from that edge point to the candidate's centre. Candidates behind (`dot <= 0`) are skipped.
  - The search is global: every selectable in the scene, with no container scoping.
  - With wrap on, the furthest candidate behind is picked when none lies ahead.
- **Sliders consume left/right.** The manual notes that vertical sliders can't be left with up/down, because they use those keys.
- **`EventSystem`.**
  - It holds one `currentSelectedGameObject` and an inspector-set `firstSelectedGameObject` ([EventSystem.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/EventSystem/EventSystem.cs) l.52, 91).
  - The legacy module's move dead zone is 0.6 (`DetermineMoveDirection`, [BaseInputModule.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/EventSystem/InputModules/BaseInputModule.cs) l.148-171). The dominant axis wins.
- **Input System `InputSystemUIInputModule`** ([UISupport](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/UISupport.html), [source](https://github.com/Unity-Technologies/InputSystem/blob/develop/Packages/com.unity.inputsystem/InputSystem/Runtime/Plugins/UI/InputSystemUIInputModule.cs)):
  - `move` (a Vector2 pass-through), `submit` and `cancel` are actions bound in a "UI" action map, separate from gameplay.
  - Repeat defaults are `moveRepeatDelay = 0.5 s` and `moveRepeatRate = 0.1 s` (l.947, 952). A change of direction resets the repeat count.
  - Submit and cancel fire on button **down** (the source comment explains why) and go to the selected object.
  - `deselectOnBackgroundClick` defaults to true ([API](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/api/UnityEngine.InputSystem.UI.InputSystemUIInputModule.html)).
  - `MultiplayerEventSystem.playerRoot` limits one player's navigation to a subtree. It is the closest Unity has to a focus scope.
- **UI Toolkit** ([focus order](https://docs.unity3d.com/Manual/UIE-focus-order.html)):
  - It has `focusable`, `canGrabFocus`, `tabIndex` (a negative value removes the element from the order) and `delegatesFocus` (forward focus to a child).
  - The focus ring defaults to a depth-first walk of the visual tree.
  - Navigation events (`NavigationMoveEvent`/`Submit`/`Cancel`) exist, but that page does not document them.

### 2.2 Unreal: Slate/UMG and CommonUI

- **Slate navigation.**
  - Each widget resolves a direction (`EUINavigation`) to a rule ([EUINavigationRule](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/SlateCore/EUINavigationRule)). The rules are:
    - **Escape:** keep searching automatically;
    - **Explicit:** go to a named widget;
    - **Wrap:** cycle within this container;
    - **Stop:** block the move;
    - **Custom:** a user function decides;
    - **CustomBoundary:** a user function decides only when the boundary is hit.
  - `OnNavigate` returns an `FNavigationReply`. **(summary)** for the rule semantics.
- **`FNavigationConfig`** ([API](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Slate/FNavigationConfig)):
  - The flags `bAnalogNavigation`, `bKeyNavigation` and `bTabNavigation`.
  - `AnalogNavigationHorizontal/VerticalThreshold`, `KeyEventRules` (key → direction) and `KeyActionRules` (key → Accept/Back).
  - `GetRepeatRateForPressure(pressure, repeats)`: the repeat speeds up with stick deflection and repeat count.
  - The page gives no defaults.
- **CommonUI** ([overview](https://dev.epicgames.com/documentation/unreal-engine/overview-of-advanced-multiplatform-user-interfaces-with-common-ui-for-unreal-engine), [quickstart](https://dev.epicgames.com/documentation/unreal-engine/common-ui-quickstart-guide-for-unreal-engine)):
  - **Input routing.** Each tick, input goes to the root of "the tree of nodes painted higher than any other tree", which hands it to the first leaf that can handle it. Only *activatable* widgets become input nodes. Lower layers can stay active without receiving input, so "returning focus after a popup closes is straightforward".
  - **Activatable widgets** ([UCommonActivatableWidget](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/CommonUI/UCommonActivatableWidget)):
    - `GetDesiredFocusTarget()` is the widget to focus on activation.
    - A focus-restoration target is cached when `bAutoRestoreFocus` is set.
    - `GetDesiredInputConfig()` sets the input mode (menu/game/all) while the widget is active.
    - A back handler is deactivated on the back action by default. `NativeOnHandleBackAction` and `BP_OnHandleBackAction` override that.
  - **Default actions and glyphs.**
    - Project-wide Click and Back actions come from a data table in `CommonUIInputData`.
    - Per-platform `CommonInputBaseControllerData` assets map keys to icon brushes for each input type and gamepad name.
    - A "nav bar" shows the available actions, sorted by priority.
  - **Input-method detection.** `UCommonInputSubsystem::GetCurrentInputType()` returns "the current input type based on the last input received". `OnInputMethodChanged` broadcasts changes. `CurrentInputType` is the effective type "after considering input locks and thrashing" ([API](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/CommonInput/UCommonInputSubsystem)). The input-type enum values were not listed on that page.

### 2.3 Godot (master, read 2026-10-18)

- **Focus mode.** Every `Control` can take focus. `focus_mode` is None, Click or All (labels default to None, buttons to All) ([GUI navigation](https://docs.godotengine.org/en/stable/tutorials/ui/gui_navigation.html)).
- **Initial focus.** "Any node must be focused by using code when the scene starts" (`grab_focus()`, usually deferred). Without it, keys and the pad do nothing.
- **Explicit first, then automatic.**
  - `focus_neighbor_{left,top,right,bottom}` and `focus_next/previous` (Tab) are NodePaths. An explicit neighbour that is not focusable chains on in the same direction ([control.cpp `_get_focus_neighbor`](https://github.com/godotengine/godot/blob/master/scene/gui/control.cpp) l.3413-3440).
  - With none set, the engine guesses. The setting `gui/common/auto_focus_strategy` chooses Legacy (the default) or Balloon (l.3550; [project_settings.cpp](https://github.com/godotengine/godot/blob/master/core/config/project_settings.cpp) l.1841).
  - Legacy takes the candidate whose rect has the smallest squared gap to the current rect, among candidates beyond the current edge. Balloon casts toward each candidate edge and scores `dot(dir, hit) / |hit|²`, Unity's formula applied to edges.
  - Ties go to the candidate best aligned with the direction.
  - `ScrollContainer`s scope and clip the search, and `follow_focus` scrolls the focused control into view.
- **The `ui_*` actions** ([input_map.cpp](https://github.com/godotengine/godot/blob/master/core/input/input_map.cpp) l.459-505):
  - `ui_up/down/left/right` default to the arrows, the D-pad and the left stick.
  - `ui_accept` is Enter/Space and `ui_cancel` is Esc. **No joypad button is bound to accept or cancel by default**, so games add A/B themselves.
  - The docs warn that these actions "should not be used for any gameplay code".
- **Repeat.**
  - Key events navigate on OS echo too, so keys auto-repeat.
  - Joypad *motion* navigates only on "just pressed" ([viewport.cpp](https://github.com/godotengine/godot/blob/master/scene/main/viewport.cpp) l.2365-2405). A held stick does **not** repeat; one push moves one step.
- **Focus ring and pointer.** A left click sets `hide_focus`. The next navigation input shows the focus again (`viewport.cpp` l.1964, 2450). `grab_focus(hide_focus)` can focus without showing the ring.

### 2.4 Web: spatial navigation, libraries and the Gamepad API

- **CSS Spatial Navigation Level 1** ([W3C WD, 26 Nov 2019](https://www.w3.org/TR/css-nav-1/)). The draft has been stalled since 2019. No browser ships it, and the WICG polyfill repo was archived on 2026-03-23 ([WICG/spatial-navigation](https://github.com/WICG/spatial-navigation)).
  - `spatial-navigation-contain: contain` makes a container that is searched first. Scroll containers always are.
  - `spatial-navigation-action: auto | focus | scroll` decides scroll-vs-focus: `auto` focuses a *visible* candidate, else scrolls.
  - `spatial-navigation-function: normal | grid`.
  - Events: `navbeforefocus` (cancelable, carries the target) and `navnotarget` (cancelable, fired at the edge of a container that can't move or scroll).
  - JS: `window.navigate(dir)`, `spatialNavigationSearch(dir, {candidates, container})` and `focusableAreas()`.
  - **Scoring:** `distance = euclidean + displacement − alignment − sqrt(overlap)`.
    - `displacement = (orthogonal distance + orthogonalBias) × orthogonalWeight`, where orthogonalWeight is 30 for left/right and 2 for up/down.
    - `alignment = alignBias × 5`, where alignBias is the projected overlap divided by the reference's size.
- **Norigin Spatial Navigation** ([repo](https://github.com/NoriginMedia/Norigin-Spatial-Navigation), [core source](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/blob/main/packages/core/src/SpatialNavigation.ts)). A TV-focused React library. Its model is a tree of `focusKey`s:
  - nested focusable containers (`FocusContext`);
  - `saveLastFocusedChild` (re-entering a container restores its last child) and `preferredChildFocusKey`;
  - `isFocusBoundary` and `focusBoundaryDirections` (trap focus per direction);
  - `onArrowPress` returning false to block a move;
  - `throttle` (default 0).
  - Scoring sorts siblings by `(primary × 5 + secondary + 1) / (adjacentSlice ? 5 : 1)`. A candidate in the "adjacent slice", meaning overlapping on the cross axis by more than 0.2, is favoured 5×. `distanceCalculationMethod` defaults to `'corners'` (l.65-76, 250-257, 644-651).
  - Layout comes from DOM rects, cached for 16 ms.
- **W3C Gamepad API** ([WD, 10 Jul 2025](https://www.w3.org/TR/gamepad/)):
  - Polling only. `getGamepads()` returns snapshots, and buttons and axes have **no change events**; only `gamepadconnected`/`gamepaddisconnected` exist.
  - Nothing is exposed until a "gamepad user gesture" (a button press or axis move).
  - **Standard mapping:**
    - 0–3 are the right-cluster bottom/right/left/top face buttons;
    - 4/5 are the bumpers and 6/7 the triggers;
    - 8/9 are back/select and start;
    - 10/11 are the stick presses;
    - 12–15 are D-pad up/down/left/right, and 16 is home;
    - axes 0/1 are the left stick and 2/3 the right, with −1 = left/up.
  - Indices are **positional**: on a Nintendo-layout pad, index 0 is the button labelled B. Games that follow Nintendo's "right = confirm" convention must swap 0 and 1 for those pads **(unverified for each browser and pad; `Gamepad.id` has no specified format)**.
- **`:focus-visible` and gamepads** ([Selectors 4 §9.4](https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo); [HTML `focus()`](https://html.spec.whatwg.org/multipage/interaction.html#dom-focusoptions-focusvisible)):
  - The heuristics are left to the UA. One suggestion: after script moves focus, "if the previously-focused element did not indicate focus... don't indicate focus on the newly focused element".
  - The UA does not see gamepad input as keyboard interaction, so after a mouse click, pad-driven `el.focus()` may show **no ring**.
  - `el.focus({ focusVisible: true })` forces the indication. Browser support varies **(unverified)**.
  - A robust fallback is the game's own attribute, for example `html[data-lh-input="pad"] :focus { outline… }`.

### 2.5 Apple tvOS focus engine

From [About focus interactions for Apple TV](https://developer.apple.com/documentation/uikit/about-focus-interactions-for-apple-tv), [preferredFocusEnvironments](https://developer.apple.com/documentation/uikit/uifocusenvironment/preferredfocusenvironments) and [UIFocusGuide](https://developer.apple.com/documentation/uikit/uifocusguide):

- "Only the focus engine can explicitly update focus". There is no API to set the focused item or move focus in a direction. Apps request an update, and the engine picks.
- **Preferred focus environments.** When a focus environment gains focus, it either keeps it or hands it to its preferred child. This recurses until something accepts. `preferredFocusEnvironments` is an ordered list searched recursively for "an eligible, focusable item".
- **When a move finds nothing**, focus stays put and a notification is broadcast. There is no wrap by default.
- **`UIFocusGuide`** is an invisible focusable region that redirects focus to other views. It bridges gaps that geometric search can't cross.

### 2.6 Microsoft (Windows / Xbox) and Steam

- **Gamepad as keyboard** ([Gamepad and remote interactions](https://learn.microsoft.com/en-us/windows/apps/design/input/gamepad-and-remote-interactions)):
  - D-pad and left stick act as the arrows, A as Enter/Space, and B as Esc/Back.
  - "If the B button is used to go back, then don't show a back button in the UI."
  - LB/RB move through tabs or page left/right, and LT/RT page up/down. Menu opens a context menu and View the nav pane.
- **Initial focus.** Put it on the first element the user would act on, usually top-left.
- **Focus visual.** "One focus visual should always be visible on the screen", and "there should be a focusable item onscreen at all times". The focus visual is shown by default for the gamepad but *not* the keyboard.
- **`FocusState.Programmatic`** keeps the visual in whatever state it was. This is the same idea as the `:focus-visible` script heuristic.
- **Focus engagement** (`IsFocusEngagementEnabled`). Press A to enter a control and B to leave it. It is on by default for `Slider`, so a horizontal slider doesn't trap left/right. Long lists can be skipped as a single stop.
- **Mouse mode.** A virtual cursor for UIs that XY navigation can't serve, such as maps. This relates to Pig Pens' picking.
- **XY strategies** ([Focus navigation](https://learn.microsoft.com/en-us/windows/apps/design/input/focus-navigation)):
  - **Projection** (default): the first element hit by projecting the focused edge.
  - **NavigationDirectionDistance**: the closest to the axis.
  - **RectilinearDistance**: primary + secondary taxicab distance.
  - `XYFocusKeyboardNavigation=Enabled` limits arrows to a "directional area". `TabFocusNavigation=Cycle` traps Tab in a container.
  - `XYFocusUp/Down/Left/Right` set explicit overrides. Pointing one at itself blocks that direction.
- **Xbox Accessibility Guideline 112** ([XAG 112](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112)):
  - The UI must be "fully navigable by keyboard and controller *digital* input alone".
  - Interaction should be consistent: "A" to select, "B" for back, LT/RT for pages, LB/RB for tabs.
  - Linear menus wrap last ↔ first. 2D grids should *not* wrap. Offer a setting to turn looping on or off.
  - "If focus can be moved to a UI element… focus can be moved away from that element by using the same input." Always provide a way back.
- **Steam Deck Verified** ([compat](https://partner.steamgames.com/doc/steamdeck/compat)):
  - The default controller configuration must reach all content, and the launcher must be "fully navigable with a controller".
  - "On-screen glyphs must match the inputs being used". Mouse and keyboard glyphs should not show if they aren't the active input.
  - Text entry needs an on-screen keyboard or the game's own controller-friendly entry.

## 3. Cross-cutting patterns

| Concern | Unity | Unreal / CommonUI | Godot | Web (css-nav / Norigin) | tvOS / Xbox | Common choice |
|---|---|---|---|---|---|---|
| Neighbour finding | Automatic `dot/dist²` (global), or Explicit | Escape (auto) / Explicit / Custom per direction | Explicit NodePath, else auto (gap² or "balloon") | Weighted distance within the nearest container | Geometric engine plus guides / XY strategies | **Automatic geometric by default, explicit override per direction** |
| Scope | None (global); `playerRoot` | Topmost activatable layer gets input | ScrollContainer clips; modal popups | `spatial-navigation-contain`, FocusContext, boundaries | Focus environments; directional areas | **Topmost screen/layer is a trap; containers searched first** |
| Initial focus | `firstSelectedGameObject` | `GetDesiredFocusTarget` | `grab_focus()` in `_ready` | `preferredChildFocusKey` | `preferredFocusEnvironments` | **Declared per screen, with a fallback to the first focusable** |
| Restore on back | Manual | `bAutoRestoreFocus` | Manual | `saveLastFocusedChild` | Remembered index path | **Remember the last focus per screen and restore on return** |
| Edges | `wrapAround` (linear modes) | Wrap / Stop rule | Stops (explicit neighbour to wrap) | `navnotarget`, then bubble out | Stop; XAG says wrap linear lists | **Stop by default; wrap for 1D lists (XAG)** |
| Repeat | delay 0.5 s, rate 0.1 s | Rate grows with pressure/repeats | Keys: OS echo; stick: none | `throttle` | n/a | **About 0.4–0.5 s delay, then 0.08–0.12 s** |
| Stick → direction | Dead zone 0.6, dominant axis | Thresholds per axis | Action press threshold | n/a | Stick acts as the D-pad | **Dead zone about 0.5, dominant axis, hysteresis** |
| Submit / Back | `submit`/`cancel` actions, fire on down | Click/Back data-table actions; back handler stack | `ui_accept`/`ui_cancel` (pad not bound) | Enter / app-defined | A / B; B = Back | **A submits on down; B closes the top screen** |
| Value widgets | Slider eats its axis | Custom | Slider/SpinBox handle `ui_left/right` | `spatial-navigation-action` | Focus engagement | **Left/right step the focused value; optional engage mode** |
| Scrolling | ScrollRect manual | Scroll box follows focus | `follow_focus` | `auto`: focus visible, else scroll | List skip / engagement | **`scrollIntoView({block:'nearest'})` on focus** |
| Input method | Manual | `CommonInputSubsystem` current type + event | `hide_focus` on click | `:focus-visible` heuristics | Visual on pad, not keyboard | **Track the last device; show the ring only for pad/keys** |
| Glyphs | Manual | Controller data per platform | Manual | None | Required on Deck | **Glyph set per family, switched on the last device** |
| Tabs | Manual | Bumpers routed to the tab widget | Manual | Manual | LB/RB | **LB/RB cycle a tab/choice group** |
| Leak into gameplay | Separate UI action map | Input config (menu/game) per layer | Docs: don't reuse `ui_*` | Consumed keydown | n/a | **While a menu has focus, it consumes nav/submit/back** |

Notes on the patterns that matter here:

- **Two layers of search.** Every mature system scopes first (the topmost layer, then the nearest container), then scores geometrically inside that scope. Global scoring, as in uGUI, is the known source of "focus jumped behind the dialog" bugs. A Rally example: settings is a non-pausing overlay over the title, so a global search would happily land on the title's buttons beneath it.
- **The scoring functions agree closely.** All of them reject candidates behind the edge, prefer ones aligned with the move axis, and penalise cross-axis offset. Norigin's `(5·primary + secondary)/(adjacent ? 5 : 1)` and Microsoft's Projection are the simplest to reason about and test. css-nav's formula adds overlap handling.
- **Explicit overrides are the escape hatch everywhere.** Each system has a per-direction "go here", "stop" or "custom". Few menus need them, and diagonal layouts do (Rally's footer: Settings · best · Drive).
- **Focus visibility follows the device.** Show the ring when navigation came from a pad or keys, and hide it on pointer input. Steam requires glyphs that match the active device.
- **Consumption is the real problem in browser games.** The Gamepad API has no events to stop propagating. The engine already polls the same pad for gameplay, so "menu has the pad" must be an explicit routing state. That is CommonUI's input config, or Unity's separate UI action map.

## 4. Options for lion-hawk

All three share a view-side **pad edge reader**: it polls through the same injectable `getGamepads`, turns the stick plus D-pad into directions with a dead zone and repeat on frame time (U-5, no allocation), and reads A/B/LB/RB edges. They differ in where the focus model lives and how much of CommonUI's routing they take on.

### Option A: DOM-native focus plus spatial nav (view module, "the gamepad is a keyboard")

- **What.** A new view device, `bindMenuNav(engine, opts)`.
  - Scope is the topmost open overlay root (`[data-lh-overlay]`), else the main scene's UI, else the game's `data-lh-nav-scope`.
  - Candidates are the focusable, enabled, visible elements in scope. That includes Tractor's unregistered buttons.
  - Moves are scored by a pure function `pick(fromRect, dir, rects)` (Norigin/Projection style).
  - Explicit overrides come from attributes (`data-lh-nav-left="title.drive"`, `data-lh-nav-wrap`).
  - Submit = `el.click()`, or `engine.ui.press/release` for holds. Back = click the scope's `[data-lh-back]` control, or press a game `back` action.
  - It also reads arrow keys, so the keyboard gets the same navigation.
- **Fit.**
  - View-only [L-3].
  - Activation still goes through `uiDom` → `engine.ui.tap`, so it is recorded and replayable. Focus moves are presentation and not recorded.
  - It fits "games use HTML overlays" (spec §1.3).
- **Effort.** Small to medium: a nav module of about 200 lines plus a pure scorer with fixture-rect unit tests, one Playwright test per game, and `data-lh-input` plus `focusVisible` handling.
- **Risks.**
  - There is no input consumption. Rally's A=`confirm`, Tractor's stick=drive and Pig Pens' HUD all still see the pad, so each game must unbind or gate its own bindings.
  - Back is ad hoc per game.
  - Geometry can't be tested in happy-dom (needs injected rects or Playwright).

### Option B: Registry focus graph in core (headless focus state)

- **What.** `engine.ui` gains `focused`, `nav(dir)`, `submit()` and `back()`. The order comes from declaration order or explicit `nav: { up, down, ... }` on controls, and choice groups act as rows. The DOM mirrors `focused` onto real focus. The pad and keys issue `ui.nav` ops, which are recorded.
- **Fit.**
  - Fully headless-testable and replayable, including focus.
  - It matches the registry-centric spec ([U-1], [T-5]).
- **Effort.** Medium to large. Every game must register every menu control: Tractor's paint, book, parent and multiplayer UI would have to move into `ui.*`, which conflicts with its picture-button markup (#18).
- **Risks.**
  - There is no geometry, so 2D layouts need hand-written neighbour graphs. This is the Explicit-everywhere burden that Unity and Godot exist to avoid.
  - It puts presentation state in core. That arguably breaks the spirit of [S-4] in reverse, and it adds recorded ops for something that isn't flow.

### Option C: A + a CommonUI-lite screen/layer contract (recommended)

- **What.** Option A's view module, plus a small sim-side contract on scenes:
  - **`nav` per overlay** (sim half): `{ modal: true, initial: 'pause.resume', back: e => e.close('pause') | 'actionName', input: 'menu' | 'game' | 'all' }`.
    - `modal` makes the overlay a focus trap, separate from `pauses`, which fixes Rally settings-over-title.
    - `back` is flow, so it lives in the sim [S-4]. The engine runs it on a `back` command or action, top overlay first, like CommonUI's back-handler stack.
    - `input: 'menu'` suppresses the game's own pad/key bindings while the overlay is on top. That solves Rally's A=confirm+select double-fire (#15's pad twin) and keeps a menu stick from steering.
  - **View module behaviour.**
    - Remember the last focused id per scene and restore it on return. Fall back to `initial`, then the first candidate. This replaces most `view.focus` calls and fixes #113 along the way.
    - Call `scrollIntoView({ block: 'nearest' })` on focus.
    - Left/right on a focused `choice` member moves along its group; it is plain spatial for adjacent buttons.
    - LB/RB cycle the nearest choice group or tab row.
    - Set `<html data-lh-input="pad|keys|pointer|touch">` from the last device, for the focus ring and glyphs.
  - **Glyphs.** A tiny `glyphFor(action, family)` helper. The family comes from `Gamepad.id` heuristics, defaulting to an Xbox-style layout, with a game setting for the Nintendo swap.
  - **Pads with no menu.** A HUD-only game (Pig Pens) can opt in with `nav: { scope: 'hud', enter: 'menuButton' }` (a Start/View press focuses the HUD and B leaves it), or do nothing.
- **Fit.**
  - Flow (back, modal, input mode) is sim and headless: `h.command('back')` closes the top overlay in a test.
  - Focus stays a view concern, and activation stays recorded.
  - It follows the engine's pattern of "controls press actions; scenes own transitions" (#39).
- **Effort.** Medium.
  - Engine: the nav module and scorer (A), overlay `nav` options, a back command, input-mode gating in `input.device` merges, and the `data-lh-input` attribute, plus spec IDs and tests.
  - Games: Rally removes A→`confirm` from the title path and adds B→back. Tractor gets `back` on its overlays. Pig Pens is optional.
- **Risks.**
  - Input-mode gating touches the device merge [I-1]. It needs care so held gameplay buttons release cleanly when a menu opens (the [I-3] release path).
  - Tractor's child lock (2 s hold on the gear) must stay hard for toddlers. With a pad, a hold-A on a focused gear still works, but it shouldn't be one press.
  - Text fields (Rally's seed, Tractor's room code and seed) have no controller text entry. They need skipping, or a game-side picker, or an on-screen keyboard (Steam's rule).

**Recommendation: C, built as A first.** Ship the view module with scope = topmost overlay plus the `data-lh-input` ring. That alone makes Rally's and Tractor's menus navigable and submittable. Then add the sim-side `nav` options (`modal`, `back`, `input`) as the second step, once Rally's A double-fire and Tractor's Back show exactly what routing needs. B is not worth it: it fights the "games own their markup" rule and gives up geometry.

## 5. Open questions for the user

1. **Scope of "every menu".** Does Pig Pens' always-on HUD count, entered through Start/View? Full controller play there needs a virtual cursor, which is out of scope for menus.
2. **Back button.** Is B always Back (XAG and Microsoft), and does Esc map to the same thing? In Rally, should Start keep toggling pause while B also closes pause and settings?
3. **Confirm convention.** Should the bottom face button (index 0) always confirm, or should the engine swap to "right = confirm" on Nintendo-layout pads? Detection relies on `Gamepad.id` strings, which have no spec.
4. **Wrapping.** Should linear lists wrap and 2D grids stop (XAG 112), and should there be a player setting for looping?
5. **Stick repeat.** Should a held stick or D-pad repeat (Unity-style 0.5 s / 0.1 s), or step once per push (Godot's stick behaviour)? For Tractor's very young players, one step per push may be kinder.
6. **Glyphs.** Should on-screen prompts ("A Drive", "B Back") be in scope now, or only switching the focus ring by input device?
7. **Text fields.** Should the navigator skip text inputs, or should games provide pad-friendly alternatives (dice only for the seed; a digit picker for room codes)?
8. **Input routing.** Is the CommonUI-style `input: 'menu'` gate acceptable as an engine rule? It changes [I-1] merging while an overlay is on top. The alternative is per-game unbinding.
9. **Modal vs pausing.** Should `modal` be a new overlay flag, or should every overlay be a focus trap by default? The latter changes Rally settings-over-title, which is probably the desired behaviour.
10. **Testing.** Should the geometric scorer be unit-tested on fixture rects only, or should each game add a Playwright "walk every menu with a fake pad" test (an injected `getGamepads`)?

## 6. Sources

**Unity**
- [uGUI Navigation manual](https://docs.unity3d.com/Packages/com.unity.ugui@2.0/manual/script-SelectableNavigation.html)
- [Navigation.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/UI/Core/Navigation.cs)
- [Selectable.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/UI/Core/Selectable.cs)
- [BaseInputModule.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/EventSystem/InputModules/BaseInputModule.cs)
- [EventSystem.cs](https://github.com/Unity-Technologies/uGUI/blob/u6000.0/3.0.0-exp.x/com.unity.ugui/Runtime/UGUI/EventSystem/EventSystem.cs)
- [Input System UI support](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/UISupport.html)
- [InputSystemUIInputModule API](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/api/UnityEngine.InputSystem.UI.InputSystemUIInputModule.html)
- [InputSystemUIInputModule.cs](https://github.com/Unity-Technologies/InputSystem/blob/develop/Packages/com.unity.inputsystem/InputSystem/Runtime/Plugins/UI/InputSystemUIInputModule.cs)
- [UI Toolkit focus order](https://docs.unity3d.com/Manual/UIE-focus-order.html)

**Unreal**
- [EUINavigationRule](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/SlateCore/EUINavigationRule) **(summary)**
- [FNavigationConfig](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Slate/FNavigationConfig)
- [CommonUI overview](https://dev.epicgames.com/documentation/unreal-engine/overview-of-advanced-multiplatform-user-interfaces-with-common-ui-for-unreal-engine)
- [CommonUI quickstart](https://dev.epicgames.com/documentation/unreal-engine/common-ui-quickstart-guide-for-unreal-engine)
- [UCommonActivatableWidget](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/CommonUI/UCommonActivatableWidget)
- [UCommonInputSubsystem](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/CommonInput/UCommonInputSubsystem)

**Godot**
- [GUI navigation](https://docs.godotengine.org/en/stable/tutorials/ui/gui_navigation.html)
- [control.cpp](https://github.com/godotengine/godot/blob/master/scene/gui/control.cpp)
- [viewport.cpp](https://github.com/godotengine/godot/blob/master/scene/main/viewport.cpp)
- [input_map.cpp](https://github.com/godotengine/godot/blob/master/core/input/input_map.cpp)
- [project_settings.cpp](https://github.com/godotengine/godot/blob/master/core/config/project_settings.cpp)

**Web**
- [CSS Spatial Navigation L1](https://www.w3.org/TR/css-nav-1/)
- [WICG spatial-navigation polyfill](https://github.com/WICG/spatial-navigation)
- [Norigin Spatial Navigation](https://github.com/NoriginMedia/Norigin-Spatial-Navigation) ([core source](https://github.com/NoriginMedia/Norigin-Spatial-Navigation/blob/main/packages/core/src/SpatialNavigation.ts))
- [W3C Gamepad](https://www.w3.org/TR/gamepad/)
- [Selectors 4 :focus-visible](https://drafts.csswg.org/selectors-4/#the-focus-visible-pseudo)
- [HTML focus() / FocusOptions](https://html.spec.whatwg.org/multipage/interaction.html#dom-focusoptions-focusvisible)

**Platforms**
- [Apple: focus interactions for Apple TV](https://developer.apple.com/documentation/uikit/about-focus-interactions-for-apple-tv)
- [preferredFocusEnvironments](https://developer.apple.com/documentation/uikit/uifocusenvironment/preferredfocusenvironments)
- [UIFocusGuide](https://developer.apple.com/documentation/uikit/uifocusguide)
- [Microsoft: gamepad and remote interactions](https://learn.microsoft.com/en-us/windows/apps/design/input/gamepad-and-remote-interactions)
- [Microsoft: focus navigation](https://learn.microsoft.com/en-us/windows/apps/design/input/focus-navigation)
- [Xbox Accessibility Guideline 112](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112)
- [Steam Deck compatibility](https://partner.steamgames.com/doc/steamdeck/compat)

## 7. Decisions (user, 2026-10-18)

1. **Scope:** Rally and Tractor Pickup. Pig Pens is not a gamepad game and is skipped.
2. **Back:** B and Esc are Back. Start and Esc bring up the pause menu, and close menus.
3. **No Nintendo layout** (no A/B swap).
4. **No wrapping** at list or grid edges.
5. **One step per push:** no hold-to-repeat on the D-pad or stick.
6. **Glyphs in scope,** from Kenney's CC0 Input Prompts pack (Xbox, PlayStation, Keyboard & Mouse).
7. **Text fields go on the todo list:** Rally's seed, and Tractor's seed and room code.
8. **Input gating is a per-menu option,** because a small sub-menu may not block the main input.
9. **Modal (focus trap) is a per-menu option.**
10. **Testing leans on the position logic:** the scorer gets the thorough unit tests.

The plan is `docs/plans/2026-10-18-menu-nav.md`.
