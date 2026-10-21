# Local players, controllers and player state: design (2026-10-21)

Status: draft for review. Branch `local-players` (engine, from `main` 0.12.0, d295f20).

Inputs:
- `docs/research-players.md`: how Unreal, Unity and Godot model players, and the browser Gamepad API (binding where this page agrees with its §6);
- `docs/spec.md`: binding where this page records no change. The new requirements are written into `docs/spec.md` itself (§5.5, [N-18]–[N-25], [T-22]–[T-25], [D-7]); this page explains them and orders the work;
- the brainstorm with the user on 2026-10-21 (decisions below are the user's).

How to use this page:
- **Plan writers:** one sub-plan per row of §9. Each plan cites the requirement IDs it builds.
- **Implementers:** build against `docs/spec.md`. A change to a signature or data shape there goes back through this page.

---

## 1. Goal

Several people can play on one device, each with their own controllers, and that device can be one peer in an online room with other devices. Every player has a proper identity that survives a reload or a short drop. Each player can change their own bindings. Each player's controllers are handed to the game as native browser objects, so games drive haptics (dual-rumble, trigger-rumble) themselves.

Today one page is one player: one merged input snapshot, every gamepad merged into it, one `net.self`, one player number per peer, and the game picks the entity that gets the input by hand (spec [I-4] was never built).

### 1.1 Decisions from the brainstorm

| # | Decision |
|---|---|
| B1 | Local multiplayer mixed with online play (couch + remote) is the target, not couch only. |
| B2 | Follow Unreal's player model: peer, local player, player, controller, pawn (research §6, approach A). |
| B3 | Expose native objects. The engine routes "this player's pads" and keeps rumble from outliving the page; it adds no rumble or effect abstraction. |
| B4 | A player may hold several pads (a wheel, pedals, a shifter, custom USB boxes). |
| B5 | Devices pair through a game `join` hook; a setup screen can claim and release devices by hand. |
| B6 | Inactive players are kept for 60 s by default; the game can override it. |
| B7 | Every game needs player state: the engine owns a player kind that games extend. Game-wide state gets the same treatment. |
| B8 | Bindings follow Unreal Enhanced Input: mapping contexts per local player, player-mappable bindings, per-profile overrides. Two players on one device can map differently. |
| B9 | A dev pad bench ships in the engine (`?debug=pads`). |

### 1.2 Out of scope

- Split-screen viewports and a camera per seat. The model does not need a viewport; one can be added per seat later.
- Menu focus per seat (Unreal's `MultiplayerEventSystem`). Menus stay shared.
- Built-in WebHID or WebSerial devices. The custom device kind ([C-6]) leaves room for them.
- Syncing profiles across devices or accounts.
- Haptics for remote players beyond "send your own command to their page".

---

## 2. The model

| Lion Hawk | Unreal | Half | Lives on | What it is |
|---|---|---|---|---|
| **peer** | `UNetConnection` | net | each page | One page in the room. Transport id, rate windows, one send clock. Unchanged. |
| **local player** | `ULocalPlayer` | view | this page | A seat: slot 0..k. Holds devices, the active mapping contexts and a bindings profile. `pad`/`pads` are the live native `Gamepad`s. Never replicated. |
| **player** | `APlayerState` | sim | every peer | Game-wide identity: player number plus replicated per-player state. The roster is `engine.players`. |
| **controller** | `APlayerController` / `AAIController` | sim | owning page only | One per seat (or a bot): its own input, the pawn it possesses. |
| **pawn** | `APawn` | sim | every peer | Any entity a controller possesses. It gets `e.input` each step. |
| **game rules** | `AGameMode` | sim | host only | Admission, spawning, scoring rules: game hooks and systems, never replicated. |
| **game state** | `AGameState` | sim | every peer | Session-wide facts, from the host. The engine owns the kind; games extend it. |

The split is the point (B2, B4): devices belong to a seat, a seat drives a controller, a controller possesses a pawn, and the person behind all of it is a player number with state everyone can see. Any of these can change without the others: a pad drops and comes back, a player respawns into a new pawn, a bot takes over a car, a seat swaps profiles.

### 2.1 Data flow

```
devices (pads, keys, touch, custom)
   │ bindings: the seat's mapping contexts + profile overrides   (view)
   ▼
seat input layers ──► controller.input (snapshot)                (sim, per seat)
                         │ input.apply
                         ▼
                      pawn.input ──► owner send ring ([N-13]) ──► other peers
```

Haptics go the other way, natively: the game reads `lp.pad` / `lp.pads` and calls `vibrationActuator.playEffect(...)`.

### 2.2 Where state goes

| Question | Home |
|---|---|
| Must everyone see it, and does it outlive a pawn? | **player state** (score, name, colour, ready, lap times, away) |
| Is it about the session, not a person? | **game state** (phase, clocks, round, shared world progress) |
| Does only this person on this device care? | **local**: controller, local player, saved settings (bindings, camera, haptics strength) |
| Is it a rule the host applies? | **game rules**: hooks and host systems, never replicated |
| Is it about the body in the world? | **the pawn** (pose, speed, damage), lost when the pawn is |

Worked examples, to be checked during migration:
- **Tractor:** coat, trim, barn and `join` count are player state; animals, trees and the delivery tally are game state; the train is each player's pawn.
- **Rally:** best and last lap, splits and finish position are player state; the stage phase, countdown and track seed are game state; the car is the pawn; rumble strength is a local setting.
- **Pig Pens:** single-player today. Score and pens are player state of player 1, and the farm's progress is game state, so a second seat costs no restructuring.

---

## 3. Local players and devices (view)

Requirements: [C-5]–[C-9]. Summary:

- `view.seats({ max = 4, join })` turns on seat management. Without it a page behaves as today: one seat holding every device.
- A device is `{ kind: 'pad', index, id, mapping }`, `{ kind: 'keys', scheme }`, `{ kind: 'touch' }` or a game's own kind. Each device is its own input source on its seat, so a wheel and pedals combine on one seat with the existing source merge ([I-1]).
- `join(dev)` runs on a device's first press (the browser shows no pad before a press) and returns a seat number, `'new'` or `null`. Default: `'new'` until `max`, then `null`. Keyboard and touch start on seat 0.
- `lp.claim(dev)` / `lp.release(dev)` for setup screens.
- Loss and regain: a disconnected pad marks its device `lost`; the seat keeps its player. The next unpaired pad with the same `id` that presses a button returns to that seat; otherwise a press fills the oldest lost seat. The browser cannot tell two pads of the same model apart across a reconnect (research §5); this is the best available, and the events let games show "Player 2: press a button".
- Seat join and leave are sim commands (`lh.seat`), so they are recorded and replayed, and online they ask the host for a number (§5). The view never writes the sim.

Why a hook and not a setup screen as the main path: rigs are known by `id` ahead of time, and couch players expect "press A to join". A setup screen is still possible with `claim`/`release`.

---

## 4. Controllers, input and possession (sim)

Requirements: [C-1]–[C-4], [I-4] (rewritten). Summary:

- `engine.controllers`: one controller per seat, plus bots. `engine.input` is seat 0's controller's input, so every current game, test and `set`/`hold` call is unchanged.
- `controller.possess(e)` / `unpossess()`. One controller per pawn; possessing a held pawn takes it, with events to both. A removed pawn clears `controller.pawn`, with an event.
- `input.apply` copies each controller's snapshot into its pawn's `e.input` ([I-4]). The owner send path ([N-13]) is unchanged: it already sends `e.input`.
- Bots: `engine.controller({ bot: true })`, no seat or devices, driven by `set`/`hold` ([I-6]) or a policy. Bots take no player number unless the game gives one.
- Menu gating ([U-9]) applies to every controller while a menu is up.

### 4.1 Bindings (Enhanced Input)

Requirements: [C-10]–[C-13]. Summary:

| Unreal | Lion Hawk |
|---|---|
| Input Action | the game's `actions()` (unchanged) |
| Input Mapping Context | `context(name, { pads: [{ match, bindings }], keys: { [scheme]: bindings }, touch })` declared in the view half |
| `AddMappingContext(ctx, priority)` per local player | `lp.contexts.add(name, priority)`, `remove(name)` |
| Player Mappable Key Settings | a binding marked `mappable: 'Brake'` (the name is the save key) |
| Enhanced Input User Settings, key profiles | `lp.bindings`: `map(name, device, key)`, `reset(name?)`, `profile` |
| `AsyncSaveSettings` | profiles saved in `localStorage`, keyed by profile name and device `id` |

- A profile is a name chosen in the game's UI ("Player N" by default per seat); the web has no platform users.
- Overrides are kept per device `id`, so a wheel mapping never lands on a gamepad.
- `lp.bindings.capture()` resolves with the next button or axis this seat's devices produce, for remap screens.
- Bindings are view-only. They change how devices write a seat's input, never the sim, so remapping needs no command and tapes record the resulting input.

Section 2's earlier "bindings list per device" is a context's `pads` list.

---

## 5. Network identity

Requirements: [N-18]–[N-25]. Summary:

- **Peer key.** Each tab makes a random token once (`crypto.randomUUID()`) and keeps it in `sessionStorage`: a reload keeps it, a second tab is a second peer. It goes only to the host and never into the roster. Handshake keeps its resume token in memory only (`handshake.js` `#resume`), so a reload rejoins with a new transport id; the key is what survives.
- **Engine-owned join.** `net.hello { key, seats }` → `net.welcome { players: [{ seat, number }] }`; `net.seat { op, seat }` mid-session. A host hook `admit({ key, seat, peer }) → number | null | { refuse: reason }` decides; the default takes the lowest free number and refuses past `maxPlayers` or `maxSeats` per peer (default 4). Tractor's `hello`/`welcome` and `freeNumber` retire.
- **Numbers stay the wire identity** (1..255; host seat 0 is 1). The host keeps `number → { peer, key, seat }` privately as `world.net.bindings` (replacing today's peer-to-number `world.net.players`); the roster `engine.players` holds `{ number, seat, local, away, active }` plus the game's fields.
- **Player and game state kinds.** Built-in host-authoritative kinds `lh.player` (one record per number) and `lh.game` (one record), extended by `defineGame({ player: { ...fields }, state: { ...fields } })` and read as `engine.players` and `engine.gameState` (`engine.state` is already the debug state). Their schemas join the join-time `schema` hash ([N-6]).
- **Away, leave, rejoin.** `peerAway` / `peerBack` set and clear `away` and keep everything. `peerLeft` despawns the peer's owner entities as now and moves its player records to an inactive list for `rejoinSeconds` (default 60, B6). A hello with the same key and seat gets the same number and record back; after expiry the number is freed and a reuse starts fresh, as `src/sim/net/install.js` does today.
- **Several numbers per peer.** `net.self` becomes `net.locals` (the set of this page's numbers; `self` stays as the first). The spawn guard is "netId is one of mine". The host's frame check is "every owner record belongs to a number bound to `from`". One frame per peer per send tick carries every seat's records; rate windows stay per peer ([N-3]). The host relays and clocks each record by its owner number, not by the frame's sender.
- **Going online.** Solo and host seats are numbered 1..k in seat order. A guest's seats are renumbered by `net.welcome`; `player.renumbered { from, to }` lets the game rekey pawns.

Trade-off accepted: `(key, seat)` adds a field to every join and binding. The alternative (a loopback peer per seat) reuses today's code but multiplies frames, clocks and rate windows per page, which is what Unreal's child connections avoid (research §2.3).

---

## 6. Haptics

Requirement: [C-14]. Native, per B3:

- Games use `lp.pad` (the seat's most recently used pad) and `lp.pads` (all of them), each refreshed from `getGamepads()` every frame (Chromium hands out snapshots), and call `vibrationActuator.playEffect('dual-rumble' | 'trigger-rumble', …)` and `reset()` after checking `effects`.
- The engine adds lifecycle safety only, from Rally's 2026-10-19 playtests (`games/rally/src/rumbleOut.js`):
  - on page hide, blur or a pausing overlay, each affected seat's pads get a zero effect plus `reset()`, repeated for about 1/3 s, so a late effect cannot leave a pad running;
  - a pad seen for the first time gets one reset, clearing what the previous page left playing;
  - `defineView({ haptics: { autoStop: false } })` turns it off.
- Platform facts the bench and docs state: `trigger-rumble` needs Chrome 126+; on Linux it works only over Bluetooth with Chromium's hidraw path (a pad driven by `xpad` over USB, or rewritten to another product id by xpadneo, gets body rumble only).

---

## 7. Dev pad bench: `?debug=pads`

Requirement: [D-7]. The Gamepad Bench artifact (https://claude.ai/artifact/BiA4t2q3BwpBWz4dmiDCXZ) brought into the engine as a debug overlay any game gets:

- each seat: player number, profile, devices (with `id`, `mapping`, lost state) and active contexts;
- per pad: live raw buttons and axes with peaks and press counts, stick range and drift, update rate, `effects`;
- haptics tests: trigger and body effects, patterns, live trigger-pull taps (interval, length, response curve), self-test with a pending-promise watchdog;
- a log of seat events and haptics calls.

It reads the same view state as the game, so it shows how `join` paired a rig. It does not change seats or bindings.

---

## 8. Tests

Requirements: [T-22]–[T-25]. Summary:

- `mp()` inputs take a per-seat form `{ [peer]: { 0: snap, 1: snap } }`; a bare snapshot is seat 0. Helpers to join and leave seats and to drop and rejoin a peer with the same key.
- Tapes record input per seat plus `lh.seat` commands; seatless tapes replay as seat 0.
- Playwright fake pads become many: `game.pad(index, state)`, `game.unplug(index)`, custom `id` and `mapping`, and a fake `vibrationActuator` that records `playEffect`/`reset` calls and reports `effects`.
- A headless test per state home in §2.2 for each migrated game (player state survives a respawn and a rejoin; game state reaches a late joiner).

---

## 9. Order of work

Each row is a sub-plan, built test-first, merged before the next starts (rows 1 and 4's fake-pad part may run in parallel).

| # | Sub-plan | Requirements | Depends on |
|---|---|---|---|
| 1 | Players, controllers, per-controller input, possession, bots (sim, headless) | [C-1]–[C-4], [I-4] | — |
| 2 | Seats, devices, `join`, mapping contexts, per-player bindings and profiles (view) | [C-5]–[C-13] | 1 |
| 3 | Network identity: peer key, engine join, inactive rejoin, per-record owner checks, `lh.player` / `lh.game` kinds | [N-18]–[N-25] | 1 |
| 4 | Haptics lifecycle, fake pads and actuators, `?debug=pads` | [C-14], [D-7], [T-24] | 2 |
| 5 | Migrate Tractor (join, player kind, possession, NET_VERSION 5), Rally (commit R7 first; `rumbleOut` onto `lp.pad`), Pig Pens (contexts); release | — | 1–4 |

Rally's "almost slip" brake warning in the left trigger is a Rally follow-up after row 5.

---

## 10. Open points for the plans

- **Seat 0 and keyboard schemes.** Default: the keyboard is one device (`scheme: 'all'`) on seat 0; a game that wants WASD and arrows as two seats declares two schemes in its context.
- **Touch with several seats.** One touch device per screen, on seat 0 unless claimed.
- **`lh.seat` when offline.** Applied at once locally; online it waits for `net.welcome`/`net.seat` before the controller gets its number.
- **Roster size.** `maxPlayers` defaults to the current `maxSender` (255); games set their own (Tractor 4).
