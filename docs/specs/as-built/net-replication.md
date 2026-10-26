---
id: F04
title: Networking and replication
status: as-built
source_commit: 7224d6b
paths:
  - src/net/**
  - src/sim/net/**
  - src/sim/forecast.js
  - src/sim/interp.js
  - src/sim/limits.js
  - src/sim/replica.js
  - src/sim/schema.js
generated: STE spec writer
---

# Networking and replication

## Summary
This feature joins peers in a room and shares game objects between them. The feature holds the transports, the port that binds a transport to an engine, and the peer key. The feature also holds the replica frame codec, the wire codec for commands, and the rate and warning helpers. Last, the feature holds the net part of the World. The net part sends and receives records, builds replicas, follows remote bodies, relays owner records, and runs the engine join.

## Scope
- **In scope:** the files in `src/net/**`, `src/sim/net/**`, `src/sim/forecast.js`, `src/sim/interp.js`, `src/sim/limits.js`, `src/sim/replica.js` and `src/sim/schema.js`.
- **Out of scope:** the net config check, the command outbox and the roster, which are in [core.md](core.md).
- **Out of scope:** the field and kind builders (`F`, `kind`), which are in [defs-and-kits.md](defs-and-kits.md).
- **Out of scope:** the World, physics and view sync, and the `mp()` and bridge test helpers.

## Terms
See the [glossary](_meta/glossary.md). This spec uses these glossary terms:
- **Netcode:** transport, peer, host, guest, room, memory hub, port, peer key, kind, field, authority, net id.
- **Frames:** record, replica frame, keyframe, diff, sender, tracker, store, replica.
- **Following:** remote mode, follow mode, interpolation delay, forecast, snap, nudge, send clock, relay.
- **Joining:** spawn guard, engine join, manual join, admit, refusal reason, bindings, locals, self, renumber, takeover.
- **Limits:** schema hash, wire codec, rate limit.

Other words in this spec:
- **steps per send:** `max(1, round(hz / send.hz))` for a kind.
- **owner step:** the step number of the owner's engine, which numbers each input in a driven record.
- **net part:** the controller `world.net`, made by `installNet`.

## Interfaces

### Library functions

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `emitter()` | out | `{ on(e, f), off(e, f), emit(e, ...a) }`. `emit` calls a copy of the listener set, so a listener can call `off` during `emit`. | [src/net/transport.js:6-9] <!-- C-2 --> |
| `createMemoryHub({ delay = 0, jitter = 0, loss = 0, rng = Math.random })` | out | hub with `drop`, `now`, `host()`, `join()`, `tick(t)`, `away(id)`, `back(id)`, `leave(id, reason = 'left')` | [src/net/transport.js:13; src/net/transport.js:32-45] <!-- C-3 --> |
| `hub.drop` | in | `null` by default. A test can set `(from, to, data, reliable) => true` to drop a message at send time on both channels. | [src/net/transport.js:25; src/net/transport.js:33; test/transport.test.mjs:99] <!-- C-8 --> |
| `parseLag(s)` | out | string `ms[,jitter[,loss%]]` to `{ delay, jitter, loss }`, or `null` | [src/net/transport.js:49-54; test/transport.test.mjs:43] <!-- C-14 --> |
| `withLag(net, { delay, jitter, loss }, { rng, timer, now })` | out | a copy of the transport that delays this device's sends and received messages | [src/net/transport.js:55-57; test/transport.test.mjs:49; test/transport.test.mjs:106] <!-- C-15 --> |
| `roomLink(room)` | out | a transport with `isHost`, `id` (`room.you`), `hostId`, `on`, `off`, `send`, `leave` (`room.leave()`) | [src/net/transport.js:68-69; src/net/transport.js:76-77] <!-- C-18 --> |
| `bridgeTransport({ binding = '__lhBridge', target = globalThis })` | out | a transport for a browser page whose peers live in a Node hub | [src/net/bridge.js:1-9; src/net/bridge.js:22] <!-- C-23 --> |
| `keyWords(uuid)` | out | lower-case UUID string to four uint32 words | [src/net/key.js:4-10; test/net-key.test.mjs:19] <!-- C-29 --> |
| `uuid4(crypto)` | out | UUID string | [src/net/key.js:11-18] <!-- C-31 --> |
| `peerKey({ storage, uuid })` | out | four uint32 words | [src/net/key.js:19-24] <!-- C-32 --> |
| `claimPeerKey({ storage, locks, subtle, uuid })` | out | async, four uint32 words | [src/net/key.js:42-52] <!-- C-33 --> |
| `createPort(engine, { transport, role, clock = () => performance.now(), onWarn, key = peerKey() })` | out | `{ transport, role, stats, close() }` | [src/net/port.js:11; src/net/port.js:68] <!-- C-37 --> |
| `createWarnOnce(log = console.warn)` | out | `warn(kind, e)`. The function calls `log(kind, e)` only the first time it sees a kind string. | [src/sim/limits.js:3; test/limits.test.mjs:11] <!-- C-58 --> |
| `createRate(perSec = 60)` | out | `{ allow(now) }`. A 1000 ms window starts at the first message after the last window ended. `allow` returns true for at most `perSec` messages in a window. | [src/sim/limits.js:4-8; test/limits.test.mjs:5] <!-- C-59 --> |
| `createRegistry(kinds, { maxSender = 255 })` | out | `{ list, byName, byCode, maxSender }` | [src/sim/replica.js:12-13; test/replica.test.mjs:89] <!-- C-61 --> |
| `put(c, f, val)` and `get(c, f)` | out | pack and read one field at a cursor `c = { v: DataView, o: offset }`. The binary command codec in `schema.js` shares them. | [src/sim/replica.js:16-18; src/sim/replica.js:51; src/sim/schema.js:6] <!-- C-71 --> |
| `encodeRecord(k, id, rec)` | out | one record's bytes (id, then fields) as a `Uint8Array` | [src/sim/replica.js:77-80; src/sim/replica.js:92] <!-- C-72 --> |
| `encodeFrame({ key, sender, time, groups })` | out | `ArrayBuffer`. The function writes into one shared scratch buffer of `MAX_FRAME` bytes and returns a copy. | [src/sim/replica.js:77-80; src/sim/replica.js:92] <!-- C-72 --> |
| `isFrame(buf)` | out | true only for an `ArrayBuffer` of at least 7 bytes whose first byte is `0x10` or `0x11` | [src/sim/replica.js:94] <!-- C-73 --> |
| `decodeFrame(buf, reg)` | out | `{ key, sender, time, groups: Map(kind name -> { records: Map(id -> rec), removed: [id] }) }` or `null`. The function never throws. | [src/sim/replica.js:6-7; src/sim/replica.js:95-98; src/sim/replica.js:118-119] <!-- C-74 --> |
| `createTracker(kinds)` | out | `diff(objs)`, `key(objs)` and `reset()`. The argument `objs` is `{ kindName: [[id, rec], ...] }`. | [src/sim/replica.js:121-123; src/sim/replica.js:131-153] <!-- C-80 --> |
| `createStore(kinds)` | out | `get(kind, id)`, `all(kind)`, `apply(f)`, `forget(kind, id)`, `clear()`. `apply(f)` returns `[{ kind, id, rec }]`, with `rec` null for a removal. | [src/sim/replica.js:155-158; src/sim/replica.js:163-178] <!-- C-84 --> |
| `frameToJson(f)` and `frameFromJson(j, reg)` | out | a decoded frame as plain JSON `{ key, sender, time, groups: [{ kind, records: [[id, rec]], removed }] }`, and back | [src/sim/replica.js:181-192; test/replica.test.mjs:11] <!-- C-89 --> |
| `checkFields(fields, where = 'schema')` | out | returns the field map after it checks that the map is an object of `F` fields | [src/sim/schema.js:10-20] <!-- C-91 --> |
| `checkSchema(fields, data)` | out | a checked copy of `data`, or `null` | [src/sim/schema.js:44-50; test/schema.test.mjs:8] <!-- C-92 --> |
| `wireCodec(table, { codec = 'json' })` | out | `{ codec, encode(tag, data), decode(wire) }` for a table `{ tag: fields }`. `encode` throws on a bug. `decode` returns `{ tag, data }` or `null` and never throws. | [src/sim/schema.js:52-54] <!-- C-94 --> |
| `createInterp({ size = 32 })` | out | getters `delay`, `jitter`, `offset`, `latest`, and `push`, `sample`, `sampleInto`, `reset` | [src/sim/interp.js:14-20; src/sim/interp.js:47] <!-- C-106 --> |
| `lerp`, `lerpAngle`, `lerpPose(pa, pb, k, out)` | out | `lerpAngle` goes the short way round. `lerpPose` lerps position, takes the shorter quaternion sign, lerps the quaternion and normalises it. | [src/sim/interp.js:6-13; test/interp.test.mjs:27] <!-- C-107 --> |
| `extrapolate(b, h, out)` and `newPose()` | out | `extrapolate` moves a body record `{ p, q, v, w }` on by `h` seconds. `newPose()` makes `{ p, q }` with the identity rotation. | [src/sim/forecast.js:9; src/sim/forecast.js:12-18] <!-- C-109 --> |
| `createForecast(n = 3)` | out | `{ poses, time, push(t, bodies), sample(senderNow, now), restart() }` for one remote train of `n` bodies | [src/sim/forecast.js:19-23; src/sim/forecast.js:27-32] <!-- C-110 --> |
| `createInputQueue(f, every = 1)` | out | getters `size`, `used` (the owner step last taken), `last` (the newest owner step queued), and `offer`, `take`, `clear` | [src/sim/net/remote.js:17-22; src/sim/net/remote.js:36] <!-- C-118 --> |
| `latencyMs`, `newTarget`, `project`, `poseError`, `decide`, `nudgeVelocity`, `writeKinematic`, `writePool`, `setNetFix` | out | remote-entity helpers. See Behavior, "Remote body helpers". | [src/sim/net/remote.js:39-81] <!-- C-119 C-120 C-121 C-122 C-123 C-124 --> |
| `bodyEntity(e, field)` | out | `e` for the field `'body'`, and `e[field]` (the linked entity) for any other `F.body()` field | [src/sim/net/replicate.js:8-10; test/net-record.test.mjs:15] <!-- C-125 --> |
| `zeroActions(f)` and `copyActions(f, src, out)` | out | `zeroActions` makes action values with numbers 0 and buttons false. `copyActions` copies axes as finite numbers and buttons as booleans. A missing source value becomes 0 or false. | [src/sim/net/replicate.js:11-17] <!-- C-126 --> |
| `installNet(engine)` | out | returns the net part (`world.net`). A second call returns the same one. | [src/sim/net/install.js:21-22; src/sim/net/install.js:657-659; test/net-install.test.mjs:17] <!-- C-133 --> |

### The net part (`world.net`)

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `world.net.role`, `world.net.hostId` | out | getters | [src/sim/net/install.js:431-433] <!-- C-207 --> |
| `world.net.self` | in, out | the player number of seat 0. The value is 1 on the host and 0 until a guest is welcomed. A setter serves the manual join. | [src/sim/net/install.js:48-50; src/sim/net/install.js:57-63; src/sim/net/install.js:431-442; test/net-locals.test.mjs:55] <!-- C-207 --> |
| `world.net.locals` | out | the set of this page's room numbers | [src/sim/net/install.js:48-50; src/sim/net/install.js:57-63] <!-- C-207 --> |
| `world.net.bindings` | out | the host map of player number to `{ peer, key, seat }` | [src/sim/net/install.js:48-50] <!-- C-207 --> |
| `world.net.tunables` | in, out | a live copy of each kind's `{ snapAt, nudge, smoothMs }` per engine | [src/sim/net/install.js:44-45; src/sim/net/install.js:443; test/net-driven.test.mjs:45] <!-- C-141 --> |
| `world.net.stats` | out | `{ frames, sent, dropped, unsent, spawned, despawned, respawned, kinds: { <kind>: { snaps, nudges, held } } }` | [src/sim/net/install.js:44-45; src/sim/net/install.js:443] <!-- C-141 --> |
| `world.net.player(peer, a, b)` | in | binds a transport peer's seat to a number by hand, on the host only. `player(peer, n)` is seat 0. The number 0 unbinds the seat, or all the peer's seats with the two-argument form. | [src/sim/net/install.js:444-452; test/net-locals.test.mjs:13] <!-- C-210 --> |
| `world.net.find(name, netId)` | out | the entity of that kind and net id, or `undefined`. The function checks the replicas first, then all entities with a net part. | [src/sim/net/install.js:453-459; test/net-host.test.mjs:14] <!-- C-212 --> |
| `world.net.remoteOf(e)` | out | the remote state of a replica, or `undefined` | [src/sim/net/install.js:460-467; test/net-join.test.mjs:274] <!-- C-213 --> |
| `world.net.numbersOf(peer)` | out | the peer's numbers in ascending order as a frozen array. The array stays the same object until the numbers change. The array is empty for an unknown peer and on a guest. | [src/sim/net/install.js:460-467; test/net-join.test.mjs:274] <!-- C-213 --> |
| `world.net.attach(w)` | in | sets `w.net` to the net part. The World install calls it before the scene's `enter`. | [src/sim/net/install.js:468] <!-- C-214 --> |

### Commands and handlers

| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `net.open { role, id, hostId, at, key }` | in | the port issues it when `createPort` runs. `key` is four uint32 words. | [src/net/port.js:67; test/net-key.test.mjs:108] <!-- C-53 --> |
| `net.peer { event, id, reason, at }` | in | the port issues it for each transport event | [src/net/port.js:10; src/net/port.js:47-54; test/port.test.mjs:16] <!-- C-48 --> |
| `net.frame { frame, from, at, reliable }` | in | the port issues it for each replica frame. `frame` is plain JSON. | [src/net/port.js:39-42; test/port.test.mjs:21] <!-- C-45 --> |
| `net.hello`, `net.seat`, `net.welcome`, `net.refused` | in, out | the engine join messages. The net part registers a built-in handler for each. | [src/sim/net/install.js:489-569] <!-- C-135 --> |
| `lh.net.recv` | internal | a system in stage `pre`, before `lh.scene` | [src/sim/net/install.js:587-612] <!-- C-135 --> |
| `player.refused { seat, reason, local: true }`, `player.renumbered { seat, from, to }` | out | events that the net part emits | [src/sim/net/install.js:294-305; src/sim/net/install.js:323-328; src/sim/net/install.js:558-569] <!-- C-194 C-198 C-201 C-202 C-203 --> |

## Behavior

### Transports and the memory hub
- **B-1** A transport is `{ isHost, id, hostId, send(to, data, reliable), on, off, leave }`. It emits the events `peer(id)`, `message(from, data, reliable)`, `peerAway(id)`, `peerBack(id)`, `peerLeft(id, reason)`, `hostAway()`, `hostBack()` and `closed(reason)`. [src/net/transport.js:4-5] <!-- C-1 -->
- **B-2** `hub.host()` makes the host endpoint and records its id as the hub host id. [src/net/transport.js:35-36] <!-- C-4 -->
- **B-3** `hub.join()` makes a guest endpoint. It queues a `peer` event with the guest id for the host and a `peer` event with the host id for the guest. [src/net/transport.js:35-36] <!-- C-4 -->
- **B-4** A hub send does nothing if the target endpoint is unknown, the sender is down, or the target is the sender. A guest send to any peer other than the host also does nothing. [src/net/transport.js:22] <!-- C-5 -->
- **B-5** On the fast channel (`reliable` false), the hub sends only an `ArrayBuffer`. The hub drops a JSON message sent on the fast channel, as `roomLink` does. [src/net/transport.js:23; test/transport.test.mjs:112] <!-- C-6 -->
- **B-6** The hub drops a fast-channel message when `rng()` is below `loss`. Loss never drops a reliable message. [src/net/transport.js:24; test/transport.test.mjs:27] <!-- C-7 -->
- **B-7** The hub delivers a message at `now + delay + rng() * jitter`. When `jitter` is 0, the jitter term is absent. [src/net/transport.js:26-28] <!-- C-9 -->
- **B-8** The hub never delivers a reliable message earlier than the last reliable message on the same sender-to-receiver pair. Reliable order therefore holds. [src/net/transport.js:26-28; test/transport.test.mjs:18] <!-- C-9 -->
- **B-9** The hub copies each message before delivery. An `ArrayBuffer` is copied by `slice`. Other data is copied by `JSON.parse(JSON.stringify(data))`. The receiver never shares the sender's object. [src/net/transport.js:10; src/net/transport.js:28; test/transport.test.mjs:18] <!-- C-10 -->
- **B-10** `hub.tick(t)` sets the hub clock to `t`. It sorts the queue by delivery time and then by sequence, and runs every queued item due at or before `t`. [src/net/transport.js:37] <!-- C-11 -->
- **B-11** `hub.now` returns the hub clock. The clock starts at 0. [src/net/transport.js:14; src/net/transport.js:34] <!-- C-11 -->
- **B-12** `hub.away(id)` marks an endpoint down. For the host, the hub queues `hostAway` for every guest. For a guest, the hub queues `peerAway(id)` for the host. [src/net/transport.js:38] <!-- C-12 -->
- **B-13** `hub.back(id)` marks an endpoint up and queues `hostBack` or `peerBack`. A down endpoint gets no messages. [src/net/transport.js:39; src/net/transport.js:28] <!-- C-12 -->
- **B-14** When the host calls `hub.leave`, every guest gets `closed('host_left')` and the endpoints go. [src/net/transport.js:40-44; test/transport.test.mjs:33] <!-- C-13 -->
- **B-15** When a guest calls `hub.leave`, the guest gets `closed(reason)` and the host gets `peerLeft(id, reason)`. The default reason is `'left'`. [src/net/transport.js:40-44; test/transport.test.mjs:33] <!-- C-13 -->
- **B-16** `parseLag(s)` trims the string. It accepts only a string of digits in the form `ms[,jitter[,loss%]]`. It limits `delay` to 5000, `jitter` to 2000 and loss to 50 percent. It returns loss as a fraction from 0 to 0.5. [src/net/transport.js:49-54; test/transport.test.mjs:43] <!-- C-14 -->
- **B-17** A `withLag` send drops a fast-channel message when `rng()` is below `loss`. The wrapper delays the other sends with the timer by `delay` plus jitter. [src/net/transport.js:58-59; src/net/transport.js:62] <!-- C-16 -->
- **B-18** A `withLag` reliable send is never scheduled before the last reliable send, so reliable order holds. [src/net/transport.js:58-59; src/net/transport.js:62] <!-- C-16 -->
- **B-19** `withLag` delays only the `message` event on receive. Received reliable messages keep their order. [src/net/transport.js:63-64] <!-- C-17 -->
- **B-20** `withLag` passes every other event straight to the wrapped transport. `off` removes the wrapped listener. [src/net/transport.js:63-64] <!-- C-17 -->
- **B-21** `roomLink` listens to every Peer object once. It emits `peer(id)` once for each id until that id leaves. The handshake library replaces a Peer without a `peerLeft` event. [src/net/transport.js:70-73; test/transport.test.mjs:84] <!-- C-19 -->
- **B-22** `roomLink` delivers a typed array (`Uint8Array`, `Buffer`) as an `ArrayBuffer` copy of its exact byte range. `isFrame` accepts only an `ArrayBuffer`. [src/net/transport.js:66-67; src/net/transport.js:71; test/transport.test.mjs:69] <!-- C-20 -->
- **B-23** A `roomLink` send skips a JSON message on the fast channel. A send to a peer that is unknown or not open is also skipped. [src/net/transport.js:77-78; test/transport.test.mjs:69] <!-- C-21 -->
- **B-24** If the peer send of `roomLink` throws, `roomLink` logs the error once through `createWarnOnce`. [src/net/transport.js:77-78; test/transport.test.mjs:69] <!-- C-21 -->
- **B-25** `roomLink` passes the room events `peerLeft(id, why)`, `peerAway`, `peerBack`, `hostBack`, `closed` and `hostAway` on to its listeners. After `peerLeft`, the same id can emit `peer` again. [src/net/transport.js:73-75] <!-- C-22 -->

### The Node bridge
- **B-26** Each bridge call carries a sequence number taken from `info.sent`. The number tells Node how many calls to wait for. The bridge ignores a rejected call. [src/net/bridge.js:12-13; test/bridge.test.mjs:36] <!-- C-25 -->
- **B-27** The bridge transport sends an `ArrayBuffer` as a byte array with the flag `true`. It sends other data as given, with the flag `false`. `leave()` calls the binding with `'leave'`. [src/net/bridge.js:23-27; test/bridge.test.mjs:11] <!-- C-26 -->
- **B-28** For an inbound `message` event with the bytes flag, the bridge rebuilds the byte array as an `ArrayBuffer`. The reliable flag becomes a boolean. Other events reach the listeners unchanged. [src/net/bridge.js:14-17; test/bridge-e2e.test.mjs:65] <!-- C-27 -->
- **B-29** After `bridgeTransport` returns, the bridge replays in order the events that reached the page before the transport existed. Events that arrive during the replay queue behind them. [src/net/bridge.js:18-21; src/net/bridge.js:28; test/bridge.test.mjs:18] <!-- C-28 -->

### The peer key
- **B-30** `uuid4(crypto)` uses `crypto.randomUUID` when it exists. Otherwise `uuid4` builds a version 4 UUID from `crypto.getRandomValues`. `randomUUID` exists only in secure contexts. [src/net/key.js:11-18; test/net-key.test.mjs:99] <!-- C-31 -->
- **B-31** `peerKey` reads the `sessionStorage` key `'lh.peerKey'`. If the value is missing or not a UUID, `peerKey` makes a new UUID and stores it. [src/net/key.js:4; src/net/key.js:19-24; test/net-key.test.mjs:27] <!-- C-32 -->
- **B-32** If storage throws, the peer key lasts for the page load only. `peerKey` returns `keyWords` of the key. [src/net/key.js:19-24; test/net-key.test.mjs:27] <!-- C-32 -->
- **B-33** `claimPeerKey` takes `peerKey()`. It then tries up to 3 times to claim a Web Lock for the key. If another live tab holds the lock, it makes a fresh key, stores it and tries again. [src/net/key.js:25-29; src/net/key.js:42-52; test/net-key.test.mjs:62] <!-- C-33 -->
- **B-34** The lock name is `'lh.peer.'` plus the first 16 bytes (as hex) of the SHA-256 of `'lion-hawk peer lock\0'` plus the key hex. [src/net/key.js:26-35; test/net-key.test.mjs:70] <!-- C-34 -->
- **B-35** The lock name never holds the key. `navigator.locks.query()` lists lock names to every same-origin page. [src/net/key.js:26-35; test/net-key.test.mjs:70] <!-- C-34 -->
- **B-36** `claim` requests the lock with `ifAvailable`. A granted lock is held for the page's life, because the callback's promise never resolves. [src/net/key.js:36-41; test/net-key.test.mjs:52] <!-- C-35 -->
- **B-37** If the locks API throws, the key counts as claimed. [src/net/key.js:36-41; test/net-key.test.mjs:52] <!-- C-35 -->
- **B-38** Without `navigator.locks.request` or `crypto.subtle.digest`, `claimPeerKey` returns `peerKey()` unclaimed. If the digest throws, `claimPeerKey` also returns the key unclaimed. [src/net/key.js:44; src/net/key.js:46; test/net-key.test.mjs:85; test/net-key.test.mjs:94] <!-- C-36 -->
- **B-39** If no key is given, the default `peerKey()` runs at each `createPort` call. In Node, where no `sessionStorage` exists, each call makes a new random key. (inferred) [src/net/port.js:11; src/net/key.js:19-24] <!-- C-57 -->
- **B-40** The host stores the peer key in the bindings and the inactive map only. No message or replica frame that a guest receives carries it. [src/net/key.js:1-3; src/sim/net/install.js:244; test/net-join.test.mjs:175; test/net-rejoin.test.mjs:89] <!-- C-238 -->

### The port
- **B-41** A host port decodes incoming wires with the `toHost` table and encodes outgoing wires with the `toGuest` table. A guest port does the reverse. The port uses the rate limits `cfg.rates[role]`. [src/net/port.js:19-22] <!-- C-40 -->
- **B-42** A guest port drops a message whose sender is not `transport.hostId`, with the reason `'not the host'`. The host port has no such check. [src/net/port.js:34; test/port.test.mjs:52] <!-- C-41 -->
- **B-43** The port keeps one rate set per peer id and makes it at that peer's first message. The set has a fast budget and a reliable budget. The set has a reliable-frames budget only when `limits.reliableFrames` is set. [src/net/port.js:26-30] <!-- C-42 -->
- **B-44** The port counts a message against a budget before it checks the size. A fast message uses the fast budget. [src/net/port.js:35-37; test/port.test.mjs:44] <!-- C-43 -->
- **B-45** A reliable replica frame uses the reliable-frames budget when that budget exists. Any other reliable message uses the reliable budget. A message over budget is dropped with the reason `'rate'`. [src/net/port.js:35-37; test/port.test.mjs:44] <!-- C-43 -->
- **B-46** If a message is a replica frame, the port decodes it with `decodeFrame`. A failed decode is dropped with the reason `'frame'`. [src/net/port.js:39-42; test/port.test.mjs:21] <!-- C-45 -->
- **B-47** After a successful decode, the port calls `engine.net.receive('net.frame', { frame: frameToJson(f), from, at, reliable })`. The port attaches the decoded frame under the `DECODED` symbol. [src/net/port.js:39-42; test/port.test.mjs:21] <!-- C-45 -->
- **B-48** For a message that is not a replica frame, the port decodes it with the incoming wire codec. A failed decode is dropped with the reason `'message'`. Unknown tags and data that does not match the schema fail. [src/net/port.js:44-45; test/port.test.mjs:21; test/port.test.mjs:27] <!-- C-46 -->
- **B-49** After a successful decode, the port issues the command of that tag with the data plus `from`, `at` and `reliable`. [src/net/port.js:44-45; test/port.test.mjs:21] <!-- C-46 -->
- **B-50** The port turns each transport event (`peer`, `peerLeft`, `peerAway`, `peerBack`, `hostAway`, `hostBack`, `closed`) into a `net.peer` command. The command holds `event`, `at`, an `id` for events that start with `peer`, and a `reason` string when one is given. [src/net/port.js:10; src/net/port.js:47-54; test/port.test.mjs:16] <!-- C-48 -->
- **B-51** On `peerLeft`, the port deletes that peer's rate set. A rejoin with the same id then gets a fresh budget. [src/net/port.js:52; test/port.test.mjs:63] <!-- C-49 -->
- **B-52** After each step, the port drains `engine.net`. A leave item calls `transport.leave()`. An `ArrayBuffer` goes to `transport.send` unchanged. [src/net/port.js:56-62; src/net/port.js:66; test/port.test.mjs:35] <!-- C-50 -->
- **B-53** The port encodes a JSON message with the outgoing wire codec by its `t` tag. [src/net/port.js:56-62; test/port.test.mjs:35] <!-- C-50 -->
- **B-54** If the outgoing codec cannot encode a JSON message, the port counts `stats.unsent` and warns once. If `transport.send` throws, the port does the same. The port never rethrows. [src/net/port.js:62; src/net/port.js:64] <!-- C-51 -->
- **B-55** The port sends an encoded wire on the reliable channel if the caller asked for reliable. The port also does so if the wire is not an `ArrayBuffer` (codec `'json'`). The fast channel carries only binary. [src/net/port.js:63; test/port.test.mjs:73] <!-- C-52 -->
- **B-56** `port.close()` removes every transport listener and the `onStep` drain listener. The port never steps the engine. [src/net/port.js:4; src/net/port.js:55; src/net/port.js:66; src/net/port.js:68; test/port.test.mjs:44] <!-- C-54 -->
- **B-57** The port reads every stamp (`at`) and every rate window from the injected clock. The clock defaults to `performance.now`. [src/net/port.js:3-4; src/net/port.js:33; src/net/port.js:53] <!-- C-56 -->
- **B-58** `createWarnOnce` and `createRate` read no clock of their own. `createRate` uses the `now` value passed to `allow`. [src/sim/limits.js:3-8; test/limits.test.mjs:5] <!-- C-59 -->

### The replica frame codec
- **B-59** `put` and `get` use these encodings. A `uint` is 1, 2 or 4 bytes. An `id` is a u16 with `0xffff` for null. An `enum` is the u8 index in its list. [src/sim/replica.js:21-23; test/replica.test.mjs:19] <!-- C-64 -->
- **B-60** A `fixed` is a u16 count of steps from `lo`. The encoder treats a non-finite value as 0, then clamps the value to `lo..hi`. [src/sim/replica.js:24-25; src/sim/replica.js:15] <!-- C-65 -->
- **B-61** An `angle` is a u16 fraction of 2 pi. The encoder writes a non-finite value as 0. [src/sim/replica.js:24-25; src/sim/replica.js:15] <!-- C-65 -->
- **B-62** A `quat` is four int16 values (each normalised component times 32767) in x, y, z, w order, 8 bytes in all. If the length is zero or not finite, the encoder writes the identity quaternion. [src/sim/replica.js:26-30; test/replica.test.mjs:99] <!-- C-66 -->
- **B-63** An `obj` writes one flag byte first when it has bool fields. Bit i is the i-th bool. Each non-bool field follows in key order. [src/sim/replica.js:31-42] <!-- C-67 -->
- **B-64** An `actions` field writes each axis as an int16 in map order. The encoder clamps the axis to -1..1, multiplies by 32767, and writes a non-finite axis as 0. One flag byte follows for each 8 buttons. [src/sim/replica.js:43-47; test/replica.test.mjs:27; test/replica.test.mjs:132] <!-- C-68 -->
- **B-65** A `list` writes a u8 length and then each item. [src/sim/replica.js:48] <!-- C-69 -->
- **B-66** Field decoding fails for a `uint` outside `min..max`, an `enum` index not in the list, and a `fixed` value above its count. Field decoding also fails for a `quat` whose length is outside 0.9..1.1. A flag byte with stray high bits fails, and so does a `list` length outside `min..max`. [src/sim/replica.js:54-74; test/replica.test.mjs:19; test/replica.test.mjs:132] <!-- C-70 -->
- **B-67** A decoded `quat` is renormalised. [src/sim/replica.js:59-62] <!-- C-70 -->
- **B-68** `decodeFrame` returns `null` if the buffer is not a frame or is over `MAX_FRAME` bytes. It also returns `null` if the sender is below 1 or above `reg.maxSender`. [src/sim/replica.js:99; src/sim/replica.js:102; test/replica.test.mjs:46] <!-- C-75 -->
- **B-69** `decodeFrame` returns `null` if a read goes past the end or a field is bad. [src/sim/replica.js:119; test/replica.test.mjs:46] <!-- C-75 -->
- **B-70** `decodeFrame` returns `null` if a group has an unknown kind code or if the same kind appears twice. [src/sim/replica.js:105; test/replica.test.mjs:46] <!-- C-76 -->
- **B-71** `decodeFrame` returns `null` if a host kind group comes from a sender other than 1. The check applies even when the group has no records. [src/sim/replica.js:105; test/replica.test.mjs:46] <!-- C-76 -->
- **B-72** `decodeFrame` returns `null` if a record count or a removal count is above the kind's `max`. It also returns `null` if an id is outside `idMin..idMax` or a record id appears twice in a group. [src/sim/replica.js:106-110; src/sim/replica.js:113-115] <!-- C-77 -->
- **B-73** `decodeFrame` returns `null` for a keyframe that lists removals. It also returns `null` for a frame whose bytes the groups do not use up exactly. [src/sim/replica.js:113; src/sim/replica.js:118] <!-- C-78 -->
- **B-74** `decodeFrame` does not check owner-kind ids against the sender. The host net part checks them against the frame's peer, because one frame carries every seat of a peer. [src/sim/replica.js:95-97; src/sim/net/install.js:274-287] <!-- C-79 -->
- **B-75** `diff` encodes each record and compares the bytes with the last ones. A changed or new record is in the diff that finds it and in the next `REPEAT` - 1 diffs. That makes `REPEAT` (3) diffs in all. A change smaller than a field's step is no change. [src/sim/replica.js:79; src/sim/replica.js:138-143; test/replica.test.mjs:60] <!-- C-81 -->
- **B-76** When an object is no longer in `objs`, `diff` names its id in `removed` for `REPEAT` (3) diffs. After that, `diff` forgets the object. [src/sim/replica.js:130; test/replica.test.mjs:60] <!-- C-82 -->
- **B-77** `key(objs)` puts every object of each kind in the group's records and no removals. [src/sim/replica.js:151] <!-- C-83 -->
- **B-78** The tracker reuses its group objects, record pairs and byte buffers. A result is valid only until the next `diff()` or `key()` call. [src/sim/replica.js:126-128] <!-- C-83 -->
- **B-79** The store ignores a record whose frame time is not above the stored time of that object. It also ignores a record when the kind's `newer(old, rec)` hook exists and returns false for a live old record. [src/sim/replica.js:170; test/replica.test.mjs:73] <!-- C-85 -->
- **B-80** A removal in a frame sets the stored record to `null` (a tombstone) with the frame time. The store ignores a removal whose frame time is not above the stored time. [src/sim/replica.js:171; test/replica.test.mjs:73] <!-- C-86 -->
- **B-81** The store reports a removal only if a live record existed. [src/sim/replica.js:171] <!-- C-86 -->
- **B-82** A keyframe removes each stored object that the keyframe omits. The sender must have authority over the object, and the stored time must be below the frame time. A host kind belongs to the host (sender 1). An owner kind object belongs to its last writer. [src/sim/replica.js:160-162; src/sim/replica.js:172; test/replica.test.mjs:139] <!-- C-87 -->
- **B-83** `store.forget(kind, id)` deletes the stored entry. The next object with that id is accepted whatever its sender clock. [src/sim/replica.js:164-165; src/sim/replica.js:176-177] <!-- C-88 -->
- **B-84** `store.get` returns the record or `null`. `store.all` returns a `Map` of live records. [src/sim/replica.js:164-165; src/sim/replica.js:176-177] <!-- C-88 -->
- **B-85** The port sets the decoded frame under `DECODED`, a non-enumerable key. The built-in `net.frame` handler then skips `frameFromJson`. A tape and the game see only the plain JSON form. [src/sim/replica.js:182-184; src/net/port.js:41] <!-- C-90 -->

### The wire codec for commands
- **B-86** `checkSchema` returns a checked copy or `null`. Every declared field must be present. Unknown keys are dropped. Any invalid value gives `null`. [src/sim/schema.js:44-50; test/schema.test.mjs:8] <!-- C-92 -->
- **B-87** `checkSchema` checks `bool` and `uint` values. A `bool` needs a boolean. A `uint` needs an integer in `min..max`. [src/sim/schema.js:22-43; test/schema.test.mjs:16] <!-- C-93 -->
- **B-88** `checkSchema` checks `id`, `enum`, `fixed` and `angle` values. An `id` needs `null` or an integer in 0..0xfffe. An `enum` needs a member of its list. A `fixed` needs a finite value in `lo..hi`. An `angle` needs a finite number. [src/sim/schema.js:22-43; test/schema.test.mjs:16] <!-- C-93 -->
- **B-89** `checkSchema` checks `quat`, `actions` and `list` values. A `quat` needs finite x, y, z and w. An `actions` value needs axes in -1..1 and boolean buttons. A `list` needs a length in `min..max` and valid items. [src/sim/schema.js:22-43; test/schema.test.mjs:16] <!-- C-93 -->
- **B-90** The json codec decoder returns `null` if the wire is not an object or if `t` is not a string in the table. The decoder also returns `null` if the fields fail `checkSchema`. [src/sim/schema.js:63-67; test/schema.test.mjs:38] <!-- C-97 -->
- **B-91** The binary codec decoder returns `null` if the wire is not an `ArrayBuffer` of at least 2 bytes. It also returns `null` if the first byte is not `0x20` or the tag index is out of range. [src/sim/schema.js:77-84; test/schema.test.mjs:38] <!-- C-99 -->
- **B-92** The binary codec decoder returns `null` if a field is bad or if bytes are left over. [src/sim/schema.js:77-84; test/schema.test.mjs:38] <!-- C-99 -->
- **B-93** The binary codec quantises `fixed`, `angle` and `quat` like the replica, so its round trip is lossy. The json codec is exact. [src/sim/schema.js:3-4; test/schema.test.mjs:27; test/schema.test.mjs:70] <!-- C-100 -->

### Interpolation
- **B-94** The interpolation delay is 40 + 3 times the jitter, limited to `DELAY.min` (100) and `DELAY.max` (300) ms. [src/sim/interp.js:5; src/sim/interp.js:17; test/interp.test.mjs:22] <!-- C-101 -->
- **B-95** `interp.push(senderT, arrival, frame)` returns `false` and ignores the message if `senderT` is not above the last sender time. Otherwise `push` stores the frame and returns `true`. [src/sim/interp.js:14; src/sim/interp.js:21-28; test/interp.test.mjs:14] <!-- C-102 -->
- **B-96** The interp buffer keeps at most `size` entries (default 32). It drops the oldest entry first. [src/sim/interp.js:14; src/sim/interp.js:21-28] <!-- C-102 -->
- **B-97** The clock offset (arrival minus sender time) drops to the smallest offset seen. Otherwise the offset rises by 0.2 percent of the difference per message. [src/sim/interp.js:2-4; src/sim/interp.js:23-25] <!-- C-103 -->
- **B-98** The jitter moves 10 percent of the way to the current offset error with each message. [src/sim/interp.js:2-4; src/sim/interp.js:23-25] <!-- C-103 -->
- **B-99** `interp.sample(now)` finds the sender time `now - offset - delay`. The function returns `{ a, b, k, at }` with the two frames around that time and `k` from 0 to 1. [src/sim/interp.js:29-35; test/interp.test.mjs:6] <!-- C-104 -->
- **B-100** Before the first frame, `sample` returns the first frame with `k` 0. After the last frame, `sample` holds the newest frame. When the buffer is empty, `sample` returns `null`. [src/sim/interp.js:29-35; test/interp.test.mjs:18] <!-- C-104 -->
- **B-101** `interp.sampleInto(now, out)` gives the same result as `sample` without a new object. It fills `out = { a, b, k, at }` and returns `false` while the buffer is empty. [src/sim/interp.js:36-46; test/net-interp.test.mjs:6] <!-- C-105 -->
- **B-102** `interp.reset()` clears the buffer, the offset, the jitter and the last time. The `offset` getter returns 0 before the first push. [src/sim/interp.js:17-20; src/sim/interp.js:47] <!-- C-106 -->

### Forecast
- **B-103** A forecast goes at most `FORECAST.horizon` (250 ms) past the newest record time. Then the forecast holds. [src/sim/forecast.js:25; test/forecast.test.mjs:23] <!-- C-111 -->
- **B-104** `extrapolate` moves position by the velocity and rotation by the world-frame spin. A record with no `v` or `w` holds still. [src/sim/forecast.js:12-18] <!-- C-109 -->
- **B-105** `forecast.sample` returns `false` if nothing was pushed. Otherwise it sets `poses[i]` and returns `true`. [src/sim/forecast.js:27-32] <!-- C-110 -->
- **B-106** When a new record disagrees with the old forecast, the drawn pose stays where the old forecast drew it. The difference becomes a correction. [src/sim/forecast.js:2-4; src/sim/forecast.js:34-40; test/forecast.test.mjs:15] <!-- C-112 -->
- **B-107** The correction fades by `exp(-elapsed / blend)`. The elapsed time is `now` minus the last sample time, and `blend` is `FORECAST.blend` (0.1 s). [src/sim/forecast.js:2-4; src/sim/forecast.js:34-40; test/forecast.test.mjs:15] <!-- C-112 -->
- **B-108** For the first record, after `restart()`, or when the position correction is above `FORECAST.snap` (4 m), `sample` drops the correction. It then shows the new forecast as it is. [src/sim/forecast.js:41; src/sim/forecast.js:46; test/forecast.test.mjs:15; test/forecast.test.mjs:37] <!-- C-113 -->

### Remote body helpers
- **B-109** `createInputQueue(f, every)` sets `high` to `max(QUEUE.high, every + 1)` and `keep` to `max(QUEUE.keep, every - 1)`. It sets the capacity to `max(QUEUE.cap, 2 * high)`. [src/sim/net/remote.js:15-18] <!-- C-115 -->
- **B-110** `queue.offer(batch)` takes `{ s, list }`, where `list[i]` is owner step `s - (len - 1 - i)`. It skips each step not above the last queued step. [src/sim/net/remote.js:13-14; src/sim/net/remote.js:23-30; test/net-remote.test.mjs:12] <!-- C-116 -->
- **B-111** When the queue is full, `offer` drops the oldest entry. [src/sim/net/remote.js:23-30] <!-- C-116 -->
- **B-112** `queue.take(out)` first drops to the newest `keep` entries if more than `high` wait. Then it copies the oldest input into `out` and returns `true`. [src/sim/net/remote.js:14-15; src/sim/net/remote.js:31-35; test/net-remote.test.mjs:12] <!-- C-117 -->
- **B-113** If the queue is empty, `take` leaves `out` as it is and returns `false`. [src/sim/net/remote.js:31-35; test/net-remote.test.mjs:12] <!-- C-117 -->
- **B-114** `latencyMs(offset)` is the interp offset limited to `LEAD_MS` (250) when the offset is in 0..`SHARED_MS` (1000). Otherwise `latencyMs` is 0. The two clocks are then not shared and the body record is used as it is. [src/sim/net/remote.js:10; src/sim/net/remote.js:39-41; test/net-remote.test.mjs:27] <!-- C-119 -->
- **B-115** `project(rec, latMs, t)` moves a body record on by `latMs` and keeps its velocity and spin in `t`. `newTarget()` makes such a target with `left` 0. [src/sim/net/remote.js:42-47; test/net-remote.test.mjs:31] <!-- C-120 -->
- **B-116** `poseError(p, q, t)` gives the distance `d` and the angle between the body and the target. [src/sim/net/remote.js:48-53; test/net-remote.test.mjs:37] <!-- C-121 -->
- **B-117** `decide(err, tune)` returns `'nudge'` if `d` is below `tune.snapAt` and the angle is below `MAX_ANGLE`. Otherwise it returns `'snap'`. [src/sim/net/remote.js:48-53; test/net-remote.test.mjs:37] <!-- C-121 -->
- **B-118** `nudgeVelocity(c, p, q, dt, outV, outW)` sets the velocity to the target's velocity plus the position error divided by the steps left times `dt`. The spin follows the same rule. [src/sim/net/remote.js:55-66; test/net-remote.test.mjs:43] <!-- C-122 -->
- **B-119** `nudgeVelocity` then moves the target on by `dt` and returns the steps left minus 1. The error is gone after `nudge` steps. [src/sim/net/remote.js:55-66; test/net-remote.test.mjs:43] <!-- C-122 -->
- **B-120** `writeKinematic(ent, pose)` sets the body's next kinematic translation and rotation. `writePool(ent, pose)` writes the current slot of the transform pool. [src/sim/net/remote.js:67-72; test/net-remote.test.mjs:54] <!-- C-123 -->
- **B-121** `setNetFix(ent, oldP, oldQ, newP, newQ)` stores the drawn-pose jump of a snap in `ent.netFix = { seq, dp, dq }`. `dp` is old minus new. `dq` is old times the inverse of new. [src/sim/net/remote.js:73-81; test/net-remote.test.mjs:61] <!-- C-124 -->
- **B-122** `setNetFix` adds 1 to `seq` and reuses the one object. [src/sim/net/remote.js:73-81; test/net-remote.test.mjs:61] <!-- C-124 -->

### Records
- **B-123** `newRecord(k)` makes one record object per entity. A body field gets `{ p, q, v, w }`. Other fields start `undefined`. [src/sim/net/replicate.js:18-27] <!-- C-127 -->
- **B-124** In `newRecord`, a field named `input` on a kind with an input gets `{ s: 0, list: [] }` for a driven kind. For other kinds it gets zero action values. [src/sim/net/replicate.js:18-27] <!-- C-127 -->
- **B-125** `readBody(ent, out)` reads a body from Rapier into `out`. For an entity with no body, it reads the pool pose with zero velocity and spin. [src/sim/net/replicate.js:28-38; test/net-record.test.mjs:27] <!-- C-128 -->
- **B-126** The default record (`defaultRecord`) reads each body field from its entity. It copies other fields from `e[name]`. [src/sim/net/replicate.js:39-47; test/net-record.test.mjs:15] <!-- C-130 -->
- **B-127** For the `input` field, the default record fills it from the owner's input ring for a driven kind. For other kinds, it copies `e.input`. [src/sim/net/replicate.js:39-47; test/net-record.test.mjs:15] <!-- C-130 -->
- **B-128** The default apply (`applyFields`) writes every field except body fields. It writes a field named `input` only when the kind is not driven, because the input queue plays a driven input. [src/sim/net/replicate.js:48-55; test/net-record.test.mjs:34] <!-- C-131 -->
- **B-129** `createInputRing(f, size = INPUT_BATCH)` keeps the newest `size` owner-step inputs as copies. [src/sim/net/replicate.js:56-70; test/net-record.test.mjs:43] <!-- C-132 -->
- **B-130** `ring.fill(out)` sets `out.s` to the newest step (0 when empty) and `out.list` to the stored inputs, oldest first. [src/sim/net/replicate.js:56-70; test/net-record.test.mjs:43] <!-- C-132 -->

### Installing the net part
- **B-131** `installNet` adds the built-in handlers `net.open`, `net.peer`, `net.frame`, `net.hello`, `net.seat`, `net.welcome` and `net.refused`. It adds the system `lh.net.recv` in stage `pre` before `lh.scene`, and an `onStep` send clock. [src/sim/net/install.js:2-6; src/sim/net/install.js:489-569; src/sim/net/install.js:587-612] <!-- C-135 -->
- **B-132** For each kind, the steps per send are `max(1, round(hz / send.hz))`. The steps per keyframe are `max(1, round(send.key * hz))`. [src/sim/net/install.js:35-36] <!-- C-138 -->
- **B-133** A driven kind carries `max(INPUT_BATCH, 2 * steps per send)` inputs in each record. `INPUT_BATCH` is 8. [src/sim/net/install.js:37-40; src/defs/fields.js:34; test/net-driven.test.mjs:64] <!-- C-139 -->
- **B-134** The net part sets `world.net` to the net part on every World it sees. A new World resets the per-World state. [src/sim/net/install.js:6-7; src/sim/net/install.js:79-84; src/sim/net/install.js:468; test/net-install.test.mjs:17] <!-- C-142 -->
- **B-135** If `world.clear()` gives the same World a new serial, the net part keeps its state and calls `respawnAll`. [src/sim/net/install.js:6-7; src/sim/net/install.js:79-84; test/net-install.test.mjs:17] <!-- C-142 -->
- **B-136** The net part reads only steps, `engine.time.wall` and the command `at` stamps. It reads no wall clock of its own, so each peer's tape replays alone. [src/sim/net/install.js:8; test/net-replay.test.mjs:10] <!-- C-237 -->

### Room events
- **B-137** The net part starts with the role `'solo'`. [src/sim/net/install.js:56] <!-- C-143 -->
- **B-138** `net.open` sets the role and the host id. It sets the key words from `d.key` if that is an array, and otherwise to `null`. It clears the room state. [src/sim/net/install.js:489-492] <!-- C-143 -->
- **B-139** `net.open` also sets the hello time so that a guest's first hello goes after the step. [src/sim/net/install.js:489-492] <!-- C-143 -->
- **B-140** On `net.open`, the net part despawns every replica and makes fresh per-World state. [src/sim/net/install.js:489-496; test/net-join.test.mjs:238] <!-- C-144 -->
- **B-141** On `net.open`, a host drops the room's roster entries of other players. The host makes its seat 0 player 1 and confirms every seat. A guest clears its confirmed seats and its roster. [src/sim/net/install.js:489-496; test/net-join.test.mjs:238] <!-- C-144 -->
- **B-142** On a host, `net.peer` with the event `peerAway` adds the peer id to the away set. It sets `away` on the peer's players in the roster. `peerBack` clears both. [src/sim/net/install.js:499-501; test/net-rejoin.test.mjs:10] <!-- C-145 -->
- **B-143** On `peerBack`, the host sends `net.refused { reason: 'taken' }` for each seat taken over from that peer while it was away. [src/sim/net/install.js:502; test/net-rejoin.test.mjs:99] <!-- C-146 -->
- **B-144** On a host, `net.peer` with the event `peerLeft` calls `left(peer)`. It also forgets that peer's cooldown, away flag and taken seats. [src/sim/net/install.js:504-505] <!-- C-147 -->
- **B-145** On any role, `net.peer` with the event `closed` calls `goSolo`. [src/sim/net/install.js:504-505] <!-- C-147 -->
- **B-146** `goSolo` despawns every owner-kind replica. It keeps host-kind replicas as plain local entities. [src/sim/net/install.js:417-420; test/net-owner.test.mjs:26] <!-- C-148 -->
- **B-147** `goSolo` then sets the role `'solo'` and the host id to `null`. It clears the room state and the other players' roster entries. It confirms the local seats and refreshes the locals. [src/sim/net/install.js:417-429; test/net-state.test.mjs:41] <!-- C-148 -->
- **B-148** `clearRoom` resets the bindings, the inactive map, the away set, the taken-over map, the peer numbers, the cached number arrays and the rejected set. It also resets the refused flag, the aside map, the cooldown map, the retry mask and the wait reason. [src/sim/net/install.js:421-424] <!-- C-149 -->
- **B-149** When a peer leaves with the engine join and a non-null key, the host keeps the peer's players inactive. It records `{ key, seat, since }` with the wall time and sets the roster entry inactive. Otherwise the players go. [src/sim/net/install.js:265-272; test/net-rejoin.test.mjs:21] <!-- C-182 -->
- **B-150** The host checks inactive players on every step, before the solo and self check. The host removes a player when `engine.time.wall` minus its `since` time is at least `rejoinSeconds` times 1000 ms. [src/sim/net/install.js:273; src/sim/net/install.js:615; test/net-rejoin.test.mjs:49] <!-- C-183 -->
- **B-151** When the host removes an inactive player, it removes the roster entry with the reason `'expired'`. The number is then free. [src/sim/net/install.js:273; src/sim/net/install.js:615; test/net-rejoin.test.mjs:49] <!-- C-183 -->

### Receiving replica frames
- **B-152** The `net.frame` handler drops the frame and counts `stats.dropped` if the role is solo, if `self` is 0, or if no World exists. [src/sim/net/install.js:508; test/net-host.test.mjs:55] <!-- C-150 -->
- **B-153** The `net.frame` handler also drops the frame if the host finds the frame is not from its peer. A guest drops a frame that is not from the host. A frame that cannot be rebuilt from JSON is dropped and warned once. [src/sim/net/install.js:509-510; test/net-host.test.mjs:55] <!-- C-150 -->
- **B-154** The `net.frame` handler uses the decoded frame under `DECODED`. If that is missing (a replayed tape), the handler rebuilds the frame with `frameFromJson`. [src/sim/net/install.js:509; test/net-join.test.mjs:167] <!-- C-151 -->
- **B-155** The `net.frame` handler ignores, without a count, a frame whose sender is one of this page's own numbers. [src/sim/net/install.js:511; test/net-join.test.mjs:167] <!-- C-151 -->
- **B-156** For an accepted frame, the handler counts `stats.frames` and applies the frame to the store. [src/sim/net/install.js:512-513; test/net-state.test.mjs:12] <!-- C-152 -->
- **B-157** For each change, an `lh.player` record updates the roster and a removal removes the entry. An `lh.game` record updates the game state. Other kinds go to `receive` or `removed`. [src/sim/net/install.js:514-522; test/net-state.test.mjs:12] <!-- C-152 -->
- **B-158** A guarded record is applied inside a `try`. If a game hook throws, the net part drops that record only. The other records of the frame still apply. [src/sim/net/install.js:151-153; src/sim/net/install.js:523-527; test/net-state.test.mjs:69] <!-- C-153 -->
- **B-159** When a hook throws on a guarded record, the net part warns once per sender and kind. On a host it also marks the object rejected. [src/sim/net/install.js:151-153; src/sim/net/install.js:523-527; test/net-state.test.mjs:69] <!-- C-153 -->
- **B-160** After the change loop, a host calls `keepForRelay` for the frame. [src/sim/net/install.js:528] <!-- C-154 -->
- **B-161** Every removal group of an owner kind makes the store forget that id. A later player with that number then starts a fresh clock. [src/sim/net/install.js:188-192; src/sim/net/install.js:529; test/net-tractor.test.mjs:57] <!-- C-154 -->
- **B-162** `fromPeer(peer, f)` is true only if the frame sender is a number bound to that peer. Every owner-kind record must also be a number bound to the peer. [src/sim/net/install.js:274-287; test/net-locals.test.mjs:25] <!-- C-155 -->
- **B-163** `fromPeer` is false if a removal names a number bound to another peer. A removal of a free number is ignored. [src/sim/net/install.js:274-287; test/net-locals.test.mjs:41] <!-- C-155 -->
- **B-164** `receive()` spawns a replica if the (kind, netId) pair is new. [src/sim/net/install.js:175-180] <!-- C-156 -->
- **B-165** If more than 2 send intervals passed since the last record, `receive()` first pushes the last record at one interval before the new time. An idle replica then does not slide across the idle time. [src/sim/net/install.js:175-180] <!-- C-156 -->
- **B-166** `receive()` pushes the record into the replica's interp. If the interp says the record is not newer, `receive()` stops. [src/sim/net/install.js:180-185] <!-- C-157 -->
- **B-167** Otherwise `receive()` keeps the record as `last` and pushes the bodies into the forecast if one exists. For a driven kind, it offers the input to the queue and calls `correct`. A driven or forecast replica also runs `apply` at once. [src/sim/net/install.js:180-185] <!-- C-157 -->
- **B-168** A removal record despawns the replica with its linked bodies and removes its remote state. [src/sim/net/install.js:144-150; src/sim/net/install.js:187] <!-- C-158 -->
- **B-169** Spawns and despawns that replication makes do not pass through the spawn guard. [src/sim/net/install.js:468-472] <!-- C-158 -->

### Replicas
- **B-170** `build()` makes a replica from the kind's `spawn` hook, if the kind has one. It sets `net`, `netId` and, for an owner kind, `owner`. It gives a kind with an input a zero input only if the desc has no `input`. [src/sim/net/install.js:122-136] <!-- C-159 -->
- **B-171** `build()` spawns the entity of each linked `F.body()` field and adds it to the replica. It then calls the kind's `spawned` hook. [src/sim/net/install.js:122-136] <!-- C-159 -->
- **B-172** If a hook or a spawn throws, `build()` despawns the half-built replica and rethrows. [src/sim/net/install.js:137-141] <!-- C-160 -->
- **B-173** The remote mode decides the replica body. A driven kind uses the body as given. A proxy kind gets a kinematic body, or an `xf` if it had none. [src/sim/net/install.js:87-94; test/net-host.test.mjs:25] <!-- C-161 -->
- **B-174** A view kind loses its body. Its colliders are emptied when it has a model or colliders. [src/sim/net/install.js:87-94; test/net-host.test.mjs:25] <!-- C-161 -->
- **B-175** When the desc has no position, the record's body position and rotation set it. [src/sim/net/install.js:89-91] <!-- C-162 -->
- **B-176** A record is guarded when the role is host, because every replica there is a guest's. On a guest, a record is guarded when the kind is an owner kind and the id is not 1. [src/sim/net/install.js:154-156; test/net-state.test.mjs:116] <!-- C-163 -->
- **B-177** The host's own records (host kinds, player 1) stay loud on a guest, so an error in a hook there throws. [src/sim/net/install.js:154-156; test/net-state.test.mjs:116] <!-- C-163 -->
- **B-178** On a host, a dropped record is removed from the relay map and added to the rejected set. The relay then skips it until a newer record of that object applies. [src/sim/net/install.js:153; src/sim/net/install.js:157-160; src/sim/net/install.js:197; test/net-state.test.mjs:88] <!-- C-164 -->
- **B-179** `newRemote` makes the remote state `{ kind, e, id, links, last, interp, s, applied, bad, pose, fc, queue, corr }`. `fc` is a forecast when `follow` is `'forecast'` and the kind is not driven. `queue` and `corr` exist only for a driven kind. [src/sim/net/install.js:95-100] <!-- C-165 -->
- **B-180** After `world.clear()`, `respawnAll` builds each replica again from its newest record. It uses first-spawn order, fresh entity ids and the same (kind, netId). The interp, forecast and input queue stay. [src/sim/net/install.js:105-121; test/net-owner.test.mjs:34; test/net-tractor.test.mjs:45] <!-- C-166 -->
- **B-181** If `respawnAll` cannot rebuild a guarded replica, the net part drops that replica and unrelays it. [src/sim/net/install.js:105-121] <!-- C-166 -->
- **B-182** `correct()` runs for a driven replica when a record arrives. For each body, it projects the record by the latency. Then it nudges if `decide` says so, sets `left` to `tune.nudge` and counts a nudge. [src/sim/net/install.js:163-168; test/net-driven.test.mjs:55] <!-- C-167 -->
- **B-183** When `decide` says snap, `correct` places the body at the target pose and sets its linear and angular velocity. It then calls `setNetFix` with the old and new poses, sets `left` to 0 and counts a snap. [src/sim/net/install.js:169-173; test/net-driven.test.mjs:45; test/net-driven.test.mjs:55] <!-- C-168 -->
- **B-184** Each step, `lh.net.recv` returns at once if no World exists or there are no replicas. [src/sim/net/install.js:587-589] <!-- C-169 -->
- **B-185** For a driven replica, `lh.net.recv` takes one queued input into `e.input` and holds the input when the queue is empty. It nudges each body with steps left. [src/sim/net/install.js:590-600; test/net-driven.test.mjs:11] <!-- C-169 -->
- **B-186** A nudge is held while the driven body presses against another dynamic body. The check adds 1 to `stats.kinds.<kind>.held` and does not steer. The projected target is then inside the other body. [src/sim/net/install.js:574-585; src/sim/net/install.js:596; test/net-driven.test.mjs:24] <!-- C-170 -->
- **B-187** For a forecast replica, `lh.net.recv` samples the forecast at the time `now - interp offset`. It writes each link's pose with `writeKinematic` for a body and `writePool` for a bodiless entity. [src/sim/net/install.js:573; src/sim/net/install.js:601] <!-- C-171 -->
- **B-188** For an interp replica, `lh.net.recv` samples the interp and lerps each body pose. It writes each pose with `writeKinematic` for a body and `writePool` for a bodiless entity. [src/sim/net/install.js:573; src/sim/net/install.js:586; src/sim/net/install.js:602-605; test/net-host.test.mjs:37] <!-- C-172 -->
- **B-189** An interp replica then applies the sampled record through the kind's `apply` hook, or through `applyFields` once per new record. [src/sim/net/install.js:586; src/sim/net/install.js:602-605; test/net-tractor.test.mjs:17] <!-- C-172 -->
- **B-190** If a guarded record's `apply` throws in `lh.net.recv`, the net part marks that record bad. It skips the record until a newer one is sampled, warns once and unrelays the record. [src/sim/net/install.js:606-607; test/net-state.test.mjs:69] <!-- C-173 -->
- **B-191** The kind's `record(e, rec, world, base)` hook replaces the default record, and `base` gives the default record. The `apply(e, rec, world, s)` hook replaces the default apply. The `spawn(rec, id, world)` hook makes the replica desc. [src/sim/net/install.js:73-78; src/sim/net/install.js:123; src/sim/net/install.js:161; src/sim/net/install.js:643] <!-- C-229 -->

### The host relay
- **B-192** The host keeps each guest's newest owner records by owner number, with the guest's clock. It keeps a record only if the number is bound to the sending peer and the record time is above the kept time. [src/sim/net/install.js:194-203; src/sim/net/install.js:208-216; test/net-owner.test.mjs:10] <!-- C-174 -->
- **B-193** The host keeps a removal in the same way as a record. [src/sim/net/install.js:194-203; src/sim/net/install.js:208-216] <!-- C-174 -->
- **B-194** A keyframe from a peer can omit a number of that peer, and the host can hold a record for it. Then the host keeps a removal for it. The other guests then end the object too. [src/sim/net/install.js:205-207; src/sim/net/install.js:213; test/net-locals.test.mjs:88] <!-- C-175 -->
- **B-195** On a step where a send is due, the host relays each number's kept records as frames. The frame sender is that number and the frame time is that guest's clock. The host skips the owner's peer. [src/sim/net/install.js:217-231; test/net-owner.test.mjs:10] <!-- C-176 -->
- **B-196** On a keyframe step, the host relays a keyframe. On other steps, the host relays a diff when a send is due and the record is fresh. [src/sim/net/install.js:217-231] <!-- C-176 -->
- **B-197** For a player who left, the host sends `REPEAT` (3) removal diffs. The removal time is 1 ms later than the last record's time. [src/sim/net/install.js:232-235; test/net-join.test.mjs:247] <!-- C-177 -->
- **B-198** A number given again waits until those removals are out. [src/sim/net/install.js:217; src/sim/net/install.js:220; test/net-join.test.mjs:247] <!-- C-177 -->
- **B-199** `bind(n, peer, key, seat)` records the host binding of player `n`. A reused number starts fresh, with no relay clock, no store entry and no rejected flag. A joiner gets every keyframe at once. [src/sim/net/install.js:238-253] <!-- C-178 -->
- **B-200** If a seat of a peer gets a new number, `bind` unbinds the seat's old number. `bind` adds a roster entry (`local` false) if the roster has none for the number. [src/sim/net/install.js:242-245] <!-- C-180 -->
- **B-201** `unbindNumber(n)` removes the binding and despawns the replicas of that number. The net part makes the store forget them and queues `REPEAT` removals in `W.gone`. [src/sim/net/install.js:254-262] <!-- C-181 -->
- **B-202** `unbindNumber(n)` removes the roster entry unless `keep` is set. With `keep`, the player becomes inactive. [src/sim/net/install.js:254-262] <!-- C-181 -->

### The engine join: host side
- **B-203** A guest with the engine join sends `net.hello { t: 'net.hello', key, seats, schema }` reliably to the host. [src/sim/net/install.js:307; src/sim/net/install.js:316-320; src/sim/net/install.js:613] <!-- C-184 -->
- **B-204** The guest repeats the hello every 1000 ms (`HELLO_MS`) until seat 0 is welcomed or refused. A hello sent before the channel opened is lost. [src/sim/net/install.js:307; src/sim/net/install.js:316-320; src/sim/net/install.js:613] <!-- C-184 -->
- **B-205** If `net.open` had no key, the guest does not send the hello. The net part warns once `'net: no peer key'` with the text `'net.open has no key: the engine join needs createPort({ key }) (N-18)'`. [src/sim/net/install.js:318] <!-- C-185 -->
- **B-206** The host handles `net.hello` only with the engine join and only from a port (`d.from` is a string). [src/sim/net/install.js:531-534] <!-- C-186 -->
- **B-207** The host refuses seat 0 with `'schema'` if the schema hash differs. It refuses with `'seats'` if the hello has no seat 0. [src/sim/net/install.js:531-534; test/net-join.test.mjs:129; test/net-join.test.mjs:139] <!-- C-186 -->
- **B-208** A hello from a peer that already has seat 0 bound gets a `net.welcome` with its existing numbers and binds nothing. A new seat must use `net.seat`. [src/sim/net/install.js:536-538; test/net-join.test.mjs:222] <!-- C-187 -->
- **B-209** For a new hello, the host admits the seats in ascending order. It sends `net.welcome` with the admitted seats, if any. [src/sim/net/install.js:535; src/sim/net/install.js:540-543; test/net-join.test.mjs:101] <!-- C-188 -->
- **B-210** After a refusal of seat 0, or when the last reason is `'seats'`, `'full'` or `'admit'`, the host stops admitting. One hello then gets one refusal. [src/sim/net/install.js:540-543; test/net-state.test.mjs:142] <!-- C-188 -->
- **B-211** For a guest, `admitSeat` refuses `'admit'` and warns once per peer if the game's `admit` throws or breaks its contract. It never throws out of the step. [src/sim/net/install.js:329-335; test/net-join.test.mjs:77; test/net-join.test.mjs:93] <!-- C-189 -->
- **B-212** For the host's own seat (peer `null`), `admitSeat` throws. [src/sim/net/install.js:329-335; test/net-join.test.mjs:77] <!-- C-189 -->
- **B-213** If the peer already has a number for the seat, `admit` returns that number. [src/sim/net/install.js:337] <!-- C-190 -->
- **B-214** If the key and seat match an inactive player, the player rejoins with the same number. The roster entry becomes active. [src/sim/net/install.js:339-341; test/net-rejoin.test.mjs:21] <!-- C-190 -->
- **B-215** If the key and seat match a binding of another peer, a takeover happens only when that peer is away. A live peer gets the refusal `'taken'`. [src/sim/net/install.js:342-350; test/net-rejoin.test.mjs:66] <!-- C-191 -->
- **B-216** On a takeover, the old page gets `net.refused 'taken'` now and again on `peerBack`. [src/sim/net/install.js:342-350; test/net-rejoin.test.mjs:99] <!-- C-191 -->
- **B-217** A peer that already has `maxSeats` seats gets the refusal `'seats'`. [src/sim/net/install.js:352-353; test/net-join.test.mjs:66] <!-- C-192 -->
- **B-218** Otherwise the number comes from `cfg.admit({ key, seat, peer, players })`. Without `admit`, the number is the lowest free number from 2 to `maxPlayers`. [src/sim/net/install.js:321-322; src/sim/net/install.js:354; test/net-join.test.mjs:66] <!-- C-192 -->
- **B-219** A `null` result from `admit` refuses `'full'`. A `{ refuse }` result refuses with that reason. [src/sim/net/install.js:355-358; test/net-join.test.mjs:66] <!-- C-192 -->
- **B-220** `refuse(peer, seat, reason)` returns 0 and remembers the reason. For the host's own seat (peer `null`), it emits `player.refused { seat, reason, local: true }`. [src/sim/net/install.js:323-328; test/net-join.test.mjs:208] <!-- C-194 -->
- **B-221** For a guest peer, `refuse` sends `net.refused { reason, seat }` reliably. [src/sim/net/install.js:323-328; test/net-join.test.mjs:208] <!-- C-194 -->
- **B-222** The host handles `net.seat` only with the engine join and only from a peer that has numbers. A `net.seat` less than `COOLDOWN` steps after that peer's last one is refused `'busy'` and does nothing. [src/sim/net/install.js:308-310; src/sim/net/install.js:545-549; test/net-join.test.mjs:111] <!-- C-195 -->
- **B-223** A `net.seat` join admits the seat with the key of the peer's seat 0. It sends `net.welcome` with that seat. [src/sim/net/install.js:550-555; test/net-join.test.mjs:160] <!-- C-197 -->
- **B-224** A `net.seat` leave unbinds the number of that seat. Seat 0 is the exception, because seat 0 leaves with its peer. [src/sim/net/install.js:550-555; test/net-join.test.mjs:160] <!-- C-197 -->

### The engine join: guest side and seats
- **B-225** On `net.welcome` from its host, a guest renumbers each listed seat to its room number. It adds the seat to the confirmed seats. It emits `player.renumbered` when the number differs from the one before. [src/sim/net/install.js:365-376; src/sim/net/install.js:557; test/net-join.test.mjs:15] <!-- C-198 -->
- **B-226** A seat that has left in the meantime is told to leave with `net.seat`. [src/sim/net/install.js:365-376] <!-- C-198 -->
- **B-227** After a welcome, the guest asks with `net.seat` join for each seat that is not yet confirmed. It then refreshes its locals and resends every keyframe at once. [src/sim/net/install.js:377-379; test/net-join.test.mjs:47] <!-- C-199 -->
- **B-228** On `net.refused 'busy'`, a guest does not treat the seat as refused. It records the seat and asks again after `RETRY_MS` (600 ms). [src/sim/net/install.js:381-385; src/sim/net/install.js:560; src/sim/net/install.js:614; test/net-join.test.mjs:111] <!-- C-200 -->
- **B-229** The guest retries one seat at a time. It sends `net.seat` join, or leave if the seat is gone. [src/sim/net/install.js:381-385; src/sim/net/install.js:614] <!-- C-200 -->
- **B-230** On any other `net.refused` for seat 0, the guest un-confirms seat 0. It stops sending hellos unless the reason is `'taken'`. [src/sim/net/install.js:561-568; test/net-rejoin.test.mjs:117] <!-- C-201 -->
- **B-231** The guest emits `player.refused { seat, reason, local: true }` once per wait. A repeated reason emits nothing. [src/sim/net/install.js:561-568; test/net-rejoin.test.mjs:117] <!-- C-201 -->
- **B-232** On `net.refused` for a seat above 0 that still exists, the guest drops the seat's controller and emits `player.refused`. A repeated refusal for a seat already gone emits nothing. [src/sim/net/install.js:566-568; test/net-rejoin.test.mjs:126; test/seats-net.test.mjs:32] <!-- C-202 -->
- **B-233** `renumberSeat(c, to)` moves the controller to number `to`. A seat of this page that holds `to` moves aside first to a free number. [src/sim/net/install.js:288-305; test/net-locals.test.mjs:69] <!-- C-203 -->
- **B-234** In `renumberSeat`, the roster follows unless the role is guest. The roster therefore follows in the solo role too. `player.renumbered` is emitted for each move unless the move is quiet. [src/sim/net/install.js:288-305; test/net-locals.test.mjs:69] <!-- C-203 -->
- **B-235** On `net.open` as a host, the net part makes seat 0 player 1. A seat that holds 1 moves aside first. [src/sim/net/install.js:386-388; test/net-join.test.mjs:149] <!-- C-204 -->
- **B-236** `seats.route` handles `lh.seat` when the role is not solo. A join on the host with the engine join admits the seat with `admitSeat` for the host. With the manual join, it takes the lowest free number. [src/sim/net/install.js:389-402; test/net-join.test.mjs:57] <!-- C-205 -->
- **B-237** A join on a guest takes a free local number. With the engine join and a confirmed seat 0, the guest also asks the host. [src/sim/net/install.js:389-402; test/net-join.test.mjs:57] <!-- C-205 -->
- **B-238** A seat leave ignores seat 0, because seat 0 never leaves. Otherwise `seats.route` removes the controller. [src/sim/net/install.js:403-409] <!-- C-206 -->
- **B-239** On a seat leave, the host removes the roster entry. A guest with the engine join tells the host with `net.seat` leave, only if the seat was confirmed. [src/sim/net/install.js:403-409] <!-- C-206 -->
- **B-240** The `self` setter changes a guest's seat 0 to the number `n`, or un-confirms seat 0 if `n` is 0. It then refreshes the locals and resends every keyframe. [src/sim/net/install.js:434-442; test/net-locals.test.mjs:69] <!-- C-208 -->
- **B-241** In the solo role, the `self` setter has no effect on seat 0's number. [src/sim/net/install.js:434-442] <!-- C-208 -->
- **B-242** `refreshLocals` sets the locals to the room numbers of this page's seats that are confirmed. It sets `self` to 1 on the host, or to seat 0's number if seat 0 is confirmed, and otherwise to 0. [src/sim/net/install.js:48-50; src/sim/net/install.js:57-65] <!-- C-230 -->
- **B-243** An offline `lh.seat` marks all seats confirmed. [src/sim/net/install.js:57-65] <!-- C-230 -->

### The spawn guard
- **B-244** The spawn guard `guard(op, x, value)` does nothing while the net part itself spawns or despawns a replica. [src/sim/net/install.js:468-478; test/net-guard.test.mjs:23] <!-- C-215 -->
- **B-245** For a spawn, or an add of the `net` part, the guard checks the kind. It checks that `netId` is in `idMin..idMax`. For an owner kind, it checks that `owner` equals `netId`. [src/sim/net/install.js:468-478; test/net-guard.test.mjs:23] <!-- C-215 -->
- **B-246** A guest may not spawn a host kind. When the role is not solo, a spawn of an owner kind needs a `netId` in this page's locals. [src/sim/net/install.js:479-480; test/net-guard.test.mjs:10] <!-- C-216 -->
- **B-247** The guard refuses a spawn or an add of the engine kinds `lh.player` and `lh.game`. [src/sim/net/install.js:476; test/net-state.test.mjs:36] <!-- C-216 -->

### The send clock
- **B-248** The send clock runs after every step. It sends a hello and a busy-seat retry when due, and expires inactive players. It then returns if the role is solo, `self` is 0, or no World exists. [src/sim/net/install.js:612-616] <!-- C-220 -->
- **B-249** The send clock sends the host kinds on a host. On every role, it sends the owner-kind entities whose `netId` is in this page's locals. It skips entities that are replicas. [src/sim/net/install.js:620-628] <!-- C-221 -->
- **B-250** Each step, the send clock pushes a driven entity's input into its input ring. A record then carries the inputs of the steps between sends. [src/sim/net/install.js:625-626; test/net-driven.test.mjs:11] <!-- C-222 -->
- **B-251** On a host with the engine join, the send clock also sends one `lh.player` record per roster entry and one `lh.game` record with id 0. [src/sim/net/install.js:629-633; test/net-state.test.mjs:12] <!-- C-223 -->
- **B-252** The send clock sends nothing if nobody can receive: a host with no bound peers, or a guest with no host id. [src/sim/net/install.js:635-636] <!-- C-224 -->
- **B-253** The frame time is `Math.floor(engine.time.wall)` as a uint32. [src/sim/net/install.js:635-636] <!-- C-224 -->
- **B-254** For each kind that this peer sends, a keyframe is due when the steps since the last keyframe are at least the steps per keyframe. A diff is due when the step is a multiple of the steps per send. [src/sim/net/install.js:638-648] <!-- C-225 -->
- **B-255** A due keyframe goes out even when no diff is due. [src/sim/net/install.js:638-648] <!-- C-225 -->
- **B-256** A keyframe carries every record of the kind. A diff carries only changed records and removals. [src/sim/net/install.js:646-654] <!-- C-226 -->
- **B-257** A diff is not sent if a keyframe of that kind went out in the same step, or if the diff has no change. [src/sim/net/install.js:646-654] <!-- C-226 -->
- **B-258** All keyframe groups go in one frame and all diff groups go in another. [src/sim/net/install.js:646-654] <!-- C-226 -->
- **B-259** `sendFrame` sends a keyframe on the reliable channel and a diff on the fast channel. [src/sim/net/install.js:411-416] <!-- C-227 -->
- **B-260** A host sends a frame to every bound peer except the peer for the number in `except`. A guest sends to the host. [src/sim/net/install.js:411-416] <!-- C-227 -->
- **B-261** If a frame cannot encode, `sendFrame` adds 1 to `stats.unsent`, warns once `'net: frame not sent'` and sends nothing. [src/sim/net/install.js:411-412] <!-- C-228 -->
- **B-262** If one kind's record cannot encode, only that kind's frame is lost. The warning is `"net: kind '<name>' not sent"`. The next keyframe resends the record. [src/sim/net/install.js:646-649; test/net-host.test.mjs:70] <!-- C-228 -->

## Data and state

- **The frame constants.** `FRAME` is `{ KEY: 0x10, DIFF: 0x11 }`. `MAX_FRAME` is 16384 bytes. `REPEAT` is 3. The frame header is 7 bytes. [src/sim/replica.js:8; src/sim/replica.js:10-11] <!-- C-60 -->
- **The replica frame layout.** A replica frame is little-endian. The header is the type u8 (`0x10` keyframe, `0x11` diff), the sender u8, the time u32 and the group count u8. Each group is the kind code u8 and the record count u16. Then come the records (id u16, then the kind's fields), the removal count u16 and the removed ids u16. [src/sim/replica.js:82-93] <!-- C-62 -->
- **The binary wire layout.** A binary wire is an `ArrayBuffer`. The first byte is `0x20`, the second byte is the tag index as u8 in table order, and the fields follow packed as one `F.obj`. An object level has at most 8 bools. [src/sim/schema.js:8; src/sim/schema.js:52-53; src/sim/schema.js:68-75] <!-- C-98 -->
- **The json wire layout.** A json wire is `{ t: tag, ...fields }`. [src/sim/schema.js:63-67; test/schema.test.mjs:38] <!-- C-97 -->
- **The `DECODED` key.** `DECODED` is `Symbol('lh.decodedFrame')`. [src/sim/replica.js:182-184; src/net/port.js:41] <!-- C-90 -->
- **The reserved names.** `RESERVED` is the frozen list `id`, `tags`, `model`, `colliders`, `xf`, `sockets`, `net`, `netId`, `netFix`. A kind field may not use these names. [src/sim/net/install.js:19; src/sim/net/install.js:27-28] <!-- C-136 -->
- **The remote constants.** `QUEUE` is `{ cap: 16, high: 4, keep: 2 }`. `LEAD_MS` is 250. `SHARED_MS` is 1000. `MAX_ANGLE` is pi/6 (30 degrees). [src/sim/net/remote.js:8-11] <!-- C-114 -->
- **The forecast constants.** `FORECAST` is `{ horizon: 250, blend: 0.1, snap: 4 }`. `horizon` is the most ms past the newest record that a forecast goes. `blend` is the fade time constant in seconds. `snap` is the distance in metres above which the forecast drops a correction. [src/sim/forecast.js:5] <!-- C-108 -->
- **The interp constants.** `DELAY` is `{ min: 100, max: 300 }` in ms. [src/sim/interp.js:5] <!-- C-101 -->
- **The join constants.** `COOLDOWN` is `round(0.5 * hz)` steps (0.5 s). `RETRY_MS` is 600 ms. `HELLO_MS` is 1000 ms. [src/sim/net/install.js:307; src/sim/net/install.js:310] <!-- C-196 -->
- **The per-World state.** The net part holds the store, one tracker per kind, the last keyframe step per kind, and the map from (kind, netId) to entity. The net part also holds the remote states, the own-record cache, the relay map and the list of removals to send. [src/sim/net/install.js:67-72] <!-- C-231 -->
- **The input wire form.** A driven kind sends `{ s, list }` as its `input` field. `list` holds the inputs, oldest first. A Tractor-shaped train record (two `F.body()` fields, a rider list and 8 batched inputs) is 101 bytes. [test/net-tractor.test.mjs:12] <!-- C-236 -->

## Configuration

| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `net.maxJson` | 2048 | The port drops a JSON message whose stringified length is above this value. | [src/core/engine.js:75; src/net/port.js:38] <!-- C-232 C-44 --> |
| `net.maxFrame` | 16384 | The port drops an `ArrayBuffer` message longer than this value in bytes. | [src/core/engine.js:75; src/net/port.js:38] <!-- C-232 C-44 --> |
| `net.codec` | `'json'` | The wire codec for commands. | [src/core/engine.js:75] <!-- C-232 --> |
| `net.join` | `'engine'` | `'engine'` runs the engine join. `'manual'` leaves numbering to the game. | [src/core/engine.js:75] <!-- C-232 --> |
| `net.maxSeats` | 4 | The most seats for one peer. | [src/core/engine.js:75; src/sim/net/install.js:352-353] <!-- C-232 --> |
| `net.rejoinSeconds` | 60 | How long the host holds an inactive player, in seconds. | [src/core/engine.js:75; src/sim/net/install.js:273] <!-- C-232 --> |
| `net.maxPlayers` | `net.maxSender` | The highest player number that the default admit gives. | [src/core/engine.js:86; src/sim/net/install.js:322] <!-- C-232 --> |
| `net.rates.<role>` | none | The per-peer rate limits `fast`, `reliable` and, for a host, `reliableFrames`. | [src/core/engine.js:93-96; src/net/port.js:19] <!-- C-232 --> |
| `kind.send` | `{ hz: 20, key: 2 }` | Diffs go at `hz`. A keyframe goes every `key` seconds. | [src/defs/fields.js:33] <!-- C-233 --> |
| `kind.tune` | `{ snapAt: 1.5, nudge: 6, smoothMs: 150 }` | The snap distance in metres, the nudge steps, and the fade time in ms. | [src/defs/fields.js:32] <!-- C-233 --> |
| `kind.follow` | `'interp'` | How proxy and view replicas move. | [src/defs/fields.js:47] <!-- C-233 --> |
| `kind.remote` | `'driven'` for an owner kind with an actions input and a body field, else `'proxy'` | How non-authority peers run the kind. | [src/defs/fields.js:43] <!-- C-233 --> |
| `INPUT_BATCH` | 8 | The least number of inputs in a driven record. | [src/defs/fields.js:34] <!-- C-234 --> |
| `INPUT_WIRE_MAX` | 64 | The most inputs in a driven record. | [src/defs/fields.js:35] <!-- C-234 --> |
| `lh.player` and `lh.game` kinds | host authority, remote `'view'`, `send { hz: 10, key: 2 }` | The built-in kinds of the engine join. | [src/core/players.js:32-34] <!-- C-234 --> |
| `createPort` option `clock` | `() => performance.now()` | The clock for every stamp and rate window. | [src/net/port.js:11] <!-- C-37 --> |
| `createPort` option `key` | `peerKey()` | The peer key as a UUID string or an array of four uint32 words. Any other value throws. | [src/net/port.js:11; src/net/port.js:17-18] <!-- C-37 C-39 --> |
| `createPort` option `onWarn` | `console.warn` | The log function for the once-per-kind warnings. | [src/net/port.js:23; src/sim/limits.js:3] <!-- C-55 --> |

## Errors and limits

### Errors
- `bridgeTransport` throws `"bridge: no '<binding>' binding on this page (open it with lion-hawk/playwright peers())"` if the binding is not a function or the Info object is missing. [src/net/bridge.js:9-10; test/bridge.test.mjs:30] <!-- C-24 -->
- `keyWords` throws `"net: peer key must be a UUID (got <typeof>)"` for a value that is not a UUID string. The message names the type and never the value. [src/net/key.js:7] <!-- C-30 -->
- `createPort` throws if the game has no net config, if `role` is not `'host'` or `'guest'`, or if the transport lacks `on` or `send` functions. [src/net/port.js:13-16; test/port.test.mjs:57] <!-- C-38 -->
- `createPort` also throws if `role` does not match `transport.isHost`. [src/net/port.js:16; test/port.test.mjs:57] <!-- C-38 -->
- `createPort` throws `'port: key must be a UUID or four uint32 words (N-18)'` for an array that is not four uint32 words. [src/net/port.js:17-18] <!-- C-39 -->
- A key that is not an array and not a UUID string makes `keyWords` throw `'net: peer key must be a UUID (got <typeof>)'`. [src/net/port.js:17; src/net/key.js:6-7] <!-- C-39 -->
- The port drops a message with the reason `'size'` if an `ArrayBuffer` is longer than `cfg.maxFrame` bytes. The port also drops it if the `JSON.stringify` length of other data is not at most `cfg.maxJson`. Data that cannot be stringified is dropped. [src/net/port.js:31; src/net/port.js:38; test/port.test.mjs:27] <!-- C-44 -->
- If issuing a command or `net.frame` throws, the port drops the message with the reason `'command'` and does not rethrow. [src/net/port.js:25; src/net/port.js:42] <!-- C-47 -->
- The port counts each drop in `stats.dropped` and warns once per reason with the text `'net: dropped (<reason>)'`. [src/net/port.js:23-24; src/sim/limits.js:3] <!-- C-55 -->
- `encodeFrame` throws `'too many <kind>'` if a group has more records or more removals than the kind's `max`. [src/sim/replica.js:87; test/replica.test.mjs:40] <!-- C-63 -->
- `encodeFrame` throws `'bad <kind> id <id>'` for an id that is not an integer or is outside `idMin..idMax`. It also throws when a field value is bad or the frame is over `MAX_FRAME` bytes. [src/sim/replica.js:78; test/replica.test.mjs:40] <!-- C-63 -->
- `put` throws `'bad uint <val>'`, `'bad id <val>'`, `'bad value <val>'` and `'bad list'` for a bad `uint`, `id`, `enum` and `list`. [src/sim/replica.js:21-23; src/sim/replica.js:48] <!-- C-64 C-69 -->
- `createRegistry` throws `'duplicate kind <name>'` when two kinds share a name or a code. [src/sim/replica.js:13; test/replica.test.mjs:89] <!-- C-61 -->
- `frameFromJson` throws `'frameFromJson: unknown kind <name>'` for an unknown kind. [src/sim/replica.js:188-192] <!-- C-89 -->
- `checkFields` throws `'<where> must be an object of F fields'`, `'<path> is not an F field'` and `'<path>: list length must be 0 <= min <= max <= 255'`. [src/sim/schema.js:10-20] <!-- C-91 -->
- `wireCodec` throws `"wire: codec must be 'json' or 'binary'"`, `'wire: table must be an object of schemas'` and `'wire: at most 256 tags'`. It also throws `"wire: '<tag>' may not declare 't' (the tag key)"`. [src/sim/schema.js:55-58] <!-- C-95 -->
- `encode` throws `"wire: unknown tag '<tag>'"` for a tag not in the table. It throws `"wire: '<tag>' does not match its schema"` for data that fails `checkSchema`. A binary `encode` throws `"wire: '<tag>' is over 16384 bytes"` when the data does not fit. [src/sim/schema.js:59-62; src/sim/schema.js:74] <!-- C-96 -->
- `readBody` throws `'net: an F.body() field needs an entity with a body or xf (entity <id>)'` if the entity has neither a body nor an `xf`. [src/sim/net/replicate.js:36; test/net-record.test.mjs:27] <!-- C-129 -->
- `installNet` throws `'net: installNet needs defineGame({ net })'` without the net config. It throws `'net: the engine has no builtin() seam (phase 3c)'` without `builtin()`. It throws `'net: the engine has no seats seam (local players plan 3)'` without the seats seam. [src/sim/net/install.js:24-25; src/sim/net/install.js:47] <!-- C-134 -->
- `installNet` throws `"net: kind '<name>' field '<f>' is an entity part; rename it"`, `"net: kind '<name>' field 'body' must be F.body()"` and `"net: kind '<name>' field 'owner' is the owner kind's authority; rename it"`. [src/sim/net/install.js:27-31; test/net-host.test.mjs:63] <!-- C-137 -->
- If a driven kind needs more than `INPUT_WIRE_MAX` (64) inputs, `installNet` throws `"net: kind '<name>' sends every <n> steps at <hz> Hz; a driven kind needs send.hz >= <k> (2 × steps per send <= 64 inputs)"`. [src/sim/net/install.js:41; src/defs/fields.js:35; test/net-driven.test.mjs:71] <!-- C-140 -->
- `build` throws `"net: kind '<name>' spawn() must return a desc for its F.body() field '<field>'"` when the `spawn` hook returns no desc for a linked body field. [src/sim/net/install.js:126] <!-- C-160 -->
- `shape` throws `"net: kind '<name>' is driven: spawn() must give a body"` if a driven kind's `spawn` hook returns no body. [src/sim/net/install.js:89-91] <!-- C-162 -->
- `bind` throws `'net: player <n> is already bound to <peer>'` for a number bound to another peer. It throws `"net: player <n> is this page's"` for a number held by one of this page's seats. [src/sim/net/install.js:240-241; test/net-locals.test.mjs:107] <!-- C-179 -->
- `admit` throws `"net.admit: refuse reason '<r>' is not in net.reasons"`, `'net.admit: must return a number in 2..<maxPlayers>, null or { refuse } (got <json>)'` and `'net.admit: player <n> is taken'`. [src/sim/net/install.js:357; src/sim/net/install.js:360-361] <!-- C-193 -->
- The `self` setter throws `'net: self must be a player number 0..<maxSender> (got <n>)'` for an invalid `n`. It throws `'net: the host is player 1'` if the host sets a number other than 1. [src/sim/net/install.js:435-436] <!-- C-209 -->
- `player()` throws `'net: only the host binds players'` when the role is not host. It also throws `'net: player(peer, seat, n): peer must be a transport peer id'`. [src/sim/net/install.js:445-446] <!-- C-211 -->
- `player()` throws `'net: player(peer, seat, n): seat must be an integer in 0..15 (got <seat>)'` and `'net: player number must be 2..<maxSender> (got <n>)'`. [src/sim/net/install.js:448-450] <!-- C-211 -->
- `find` throws `"net: unknown kind '<name>'"` for an unknown kind. [src/sim/net/install.js:454; test/net-host.test.mjs:14] <!-- C-212 -->
- The spawn guard throws `"net: unknown kind '<k>'"`, `"net: '<kind>' is the engine's: write engine.players or engine.gameState (N-22)"` and `"net: '<kind>' netId must be an integer in <min>..<max> (got <id>)"`. [src/sim/net/install.js:475-477] <!-- C-217 -->
- The spawn guard throws `"net: '<kind>' is an owner kind: owner must equal netId (got owner <o>, netId <n>)"`. [src/sim/net/install.js:478] <!-- C-217 -->
- The spawn guard throws `"net: a guest may not spawn '<kind>' <id>: only replication spawns host kinds (E-7)"` and `"net: player <n> may not spawn '<kind>' <id>: only its owner does (E-7)"`. The second message says `players a, b` when this page has several seats. [src/sim/net/install.js:479-480; test/net-guard.test.mjs:10] <!-- C-218 -->
- The guard throws `"net: '<kind>' <id> is replicated: only replication may despawn it (E-7)"` for a despawn on a replica made by replication. [src/sim/net/install.js:483; test/net-host.test.mjs:47] <!-- C-219 -->
- The guard throws `"net: '<kind>' <id> is replicated: only replication may change its 'net' part (E-7)"` for a remove of the `net` part on such a replica. An add of the `net` part goes through the spawn checks. [src/sim/net/install.js:473-483] <!-- C-219 -->

### Limits
- The port counts each message against a per-peer rate budget in 1000 ms windows. The limits come from `cfg.rates[role]`. [src/net/port.js:19; src/net/port.js:35-37; src/sim/limits.js:5-8] <!-- C-43 C-59 -->
- The interp buffer keeps at most 32 entries by default. The input queue holds at most `max(16, 2 * high)` entries. [src/sim/interp.js:14; src/sim/net/remote.js:18] <!-- C-102 C-115 -->
- `parseLag` limits delay to 5000 ms, jitter to 2000 ms and loss to 50 percent. [src/net/transport.js:49-54] <!-- C-14 -->
- A replica frame is at most 16384 bytes. A binary wire is at most 16384 bytes. [src/sim/replica.js:8; src/sim/schema.js:74] <!-- C-60 C-96 -->
- A wire table holds at most 256 tags. A list field holds at most 255 items. [src/sim/schema.js:16; src/sim/schema.js:57] <!-- C-91 C-95 -->

## Dependencies
- **Internal:** the net config, the command outbox, the roster, the seats seam and the built-in kinds are in [core.md](core.md). The field builders `F` and `kind`, `INPUT_BATCH`, `INPUT_WIRE_MAX`, `TUNE` and `SEND` are in [defs-and-kits.md](defs-and-kits.md). [src/sim/net/install.js:9-16; src/sim/schema.js:5] <!-- C-232 C-233 C-234 -->
- **Internal:** `src/sim/forecast.js` imports `qmul` and `rotate` from `src/core/math.js`. [src/sim/forecast.js:6-7] <!-- C-109 -->
- **External:** the Web Locks API (`navigator.locks`), `crypto.subtle`, `crypto.randomUUID`, `sessionStorage` and a handshake Room (vendored by the game). The code works without the first four. [src/net/key.js:19-52; src/net/transport.js:68-69] <!-- C-33 C-36 C-18 -->

<!-- related-specs -->
Related specs:

- Imports: [Engine core](core.md)
- Imports: [Definitions and kits](defs-and-kits.md)
- Imported by: [Engine core](core.md)
- Imported by: [Test helpers](testing.md)
- Imported by: [CLI, tools and package surface](tools-and-package.md)

## Operations
- A step of two peers that drive carts allocates under 9 KB of engine code per engine. A step of three peers in the engine-join seats room allocates under 4 KB per engine. [test/net-alloc.test.mjs:17; test/net-alloc.test.mjs:25] <!-- C-235 -->
- The port warns through `onWarn` once per reason. The net part warns once per key text, for example `'net: no peer key'`, `'net: frame not sent'` and `"net: kind '<name>' not sent"`. [src/net/port.js:23-24; src/sim/net/install.js:318; src/sim/net/install.js:411-412; src/sim/net/install.js:649] <!-- C-55 C-185 C-228 -->

## Open questions and discrepancies
- Open question: why does a bridge guest `leave` emit `closed` to itself after its endpoint leaves the hub? No source states the reason.
- Open question: why is `REPEAT` 3? Only the comment in `replica.js` says that it keeps one lost diff from hiding a change.

## Evidence index
- `src/net/transport.js`: emitter, memory hub, `parseLag`, `withLag`, `roomLink`.
- `src/net/bridge.js`: the page side of the Node bridge.
- `src/net/key.js`: the peer key and its Web Lock claim.
- `src/net/port.js`: the port that binds a transport to an engine.
- `src/sim/replica.js`: the replica frame codec, tracker and store.
- `src/sim/schema.js`: schema checks and the wire codec for commands.
- `src/sim/interp.js`, `src/sim/forecast.js`: remote body playback.
- `src/sim/limits.js`: rate limit and once-per-kind warnings.
- `src/sim/net/install.js`: the net part, the engine join, the relay and the send clock.
- `src/sim/net/remote.js`, `src/sim/net/replicate.js`: remote body helpers and default records.
