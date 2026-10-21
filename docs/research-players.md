# Lion Hawk: players, local players and controllers research (2026-10-21)

Research on local multiplayer mixed with online play: several players on one page, each with their own controller, keyboard or touch, while that page is also a peer in an online room. Section 1 states what Lion Hawk has today. Sections 2 to 5 cover how Unreal, Unity, Godot and the browser model players and devices. Section 6 maps that onto Lion Hawk. Nothing is built yet.

Sources are linked at the end. **(summary)** marks a claim that rests on a search-result summary rather than a full read. **(unverified)** marks prior knowledge I could not confirm from a primary source in this pass. Epic's API reference pages render with script and mostly could not be read, so more of the Unreal section carries these marks than I would like.

## 1. Lion Hawk today

- **One peer is one player.** The host binds a transport peer to a player number with `net.player(peer, n)`, 2..`maxSender`; the host is always 1 (`src/sim/net/install.js:196-213`). `net.self` is one number.
- **Owner-authority entities are keyed by player.** An owner kind's `owner` must equal its `netId`, and a peer may spawn only the owner entity whose `netId === self` (`install.js:233-235`). So each player has at most one entity per owner kind.
- **Frames are checked against the one binding.** The host drops a frame unless `players.get(d.from) === f.sender` (`install.js:254`). A peer sends one frame per send tick with `sender = self`.
- **Input is one snapshot.** `bindGamepad` merges every pad into one source layer (`src/view/gamepad.js:17-38`). It never reads `Gamepad.index` or `id`. `input.apply` copies the snapshot into "the local player's actor" as `e.input` ([I-4]). The game picks that entity.
- **Rates are per peer** ([N-3]: "rates per peer per 1 s window").

## 2. Unreal Engine

### 2.1 The cast

- **GameMode** runs only on the server. It is created on level load and spawns players when they join. **GameState** is created by the GameMode and replicates game-wide data to every client. **PlayerState** is created per player on join and replicates per-player data to every client. All three are from [Gameplay Framework].
- **PlayerController** is "used by human players to control pawns". It is non-physical and processes input ([Gameplay Framework]). It exists on the server and on the owning client only. By default it is relevant only to its owner ([Owning connection]).
- **Pawn** is the physical body in the world, and **Character** is a Pawn with movement built in. A controller **possesses** a pawn, which makes it the pawn's owner. That ownership lasts only while the pawn is possessed ([Owning connection]). `AAIController` possesses pawns in the same way, so the same pawn code runs for human and AI players (unverified).
- **ULocalPlayer** is one human on this machine. It is created by `UGameInstance::CreateLocalPlayer` and holds the controller id and platform user for that human, its viewport, and its PlayerController on this machine. It is not replicated (unverified; the API page did not render). Enhanced Input hangs its per-player state off it: mapping contexts are added "to a local player through its Enhanced Input Local Player Subsystem", with priorities to resolve conflicts ([Enhanced Input]).
- **GameState's `PlayerArray`** lists every PlayerState. It is the replicated roster that clients read (unverified).

So Unreal splits a player into three parts. The **local player** is a machine-local seat with devices and a viewport. The **controller** carries intent and input, and lives on the server plus the owner. The **player state** is the replicated identity and score that everyone sees. The pawn is separate again, and can be swapped by possession.

### 2.2 Ownership and net roles

- "The owning connection of an actor is the connection associated with the actor's owning player controller." You find it by walking the owner chain to the outermost owner ([Owning connection]).
- On a client, its own possessed pawn is an **autonomous proxy**: it is locally predicted and sends moves to the server. Everyone else's pawns are **simulated proxies**. The server is the **authority** (unverified; the role page did not render). `IsLocallyControlled` is the per-pawn test for "this is mine here" ([Networking overview]).

### 2.3 Several local players on one connection (online split-screen)

- A client with extra local players asks the server to add each one. The server makes a **`UChildConnection`** for each: "a secondary split screen connection that reroutes calls to the parent connection". The parent lists them in `Children` ("child connections for secondary viewports"). `CreateChild` assigns each child "a new NetPlayerIndex", and `CloseAndRemoveChild` drops one child without closing the parent or its siblings ([UChildConnection], [Children]) (summary).
- Each child gets its own PlayerController and PlayerState on the server. So every couch player is a full player to the rest of the game (unverified).
- **On the wire it is one connection.** Children reroute through the parent, so they share its socket and its bandwidth (`NetSpeed` is a per-connection setting). Actor replication runs once per parent connection, counting the children's viewers for relevancy (unverified beyond the "reroutes calls" text).
- Forum reports show the rough edges: secondary players must be created by the server, and child connections in seamless travel had a "ConnectionIdentifier always 0" problem in 2026 ([Online split-screen forums]) (summary, anecdotal).

### 2.4 Devices and users

- `IPlatformInputDeviceMapper` maps each **`FInputDeviceId`** (one physical device, which "should be globally unique") to an **`FPlatformUserId`** (a person) ([IPlatformInputDeviceMapper]).
  - It has queries per user (`GetAllInputDevicesForUser`, `GetAllConnectedInputDevicesForUser`, `GetPrimaryInputDeviceForUser`).
  - It has an **unpaired user** for devices that belong to nobody yet (`GetUserForUnpairedInputDevices`, `IsInputDeviceMappedToUnpairedUser`).
  - `GetPlatformUserForNewlyConnectedDevice` picks the owner of a newly connected pad.
  - `OnInputDeviceConnectionChange` fires on disconnect and reconnect, and `OnInputDevicePairingChange` when a device changes owner.
  - `RemapControllerIdToPlatformUserAndDevice` bridges to the old integer `ControllerId`.
- Mappings survive a disconnect. `GetAllInputDevicesForUser` returns devices "regardless of connection state". A pad that drops out stays that user's pad, and comes back to that user.

### 2.5 Identity and rejoin

- Each PlayerState carries a `UniqueId` (`FUniqueNetIdRepl`) from the online subsystem (unverified).
- When a player logs out, `AGameMode::AddInactivePlayer` moves the PlayerState to an inactive list, which is kept for `InactivePlayerStateLifeSpan`. When a controller logs in, `FindInactivePlayer` tries to match it to an inactive PlayerState. On a match, `OverridePlayerState` copies the old values in ([AGameMode], [APlayerState]) (summary). The match is on `UniqueId`, with a saved network address as the fallback in some versions (unverified).
- Seamless travel keeps all PlayerControllers that have a valid PlayerState on the server, and local PlayerControllers on both sides ([Travelling]).

### 2.6 Force feedback

- "Force Feedback is implemented in the base `PlayerController` class." `ClientPlayForceFeedback` takes an effect asset whose channels drive the left/right large/small motors from curves. "The force feedback will be replicated to the owning client if called on the server". A `Tag` replaces a running effect with the same tag ([Force feedback]).
- `SetHapticsByValue` sets frequency and amplitude on one hand directly. `SetDisableHaptics` mutes the controller, for example during a level load ([SetHapticsByValue], [SetDisableHaptics]) (summary).
- Force Feedback Components give positional rumble with attenuation, and can be spawned attached or at a location ([Force feedback]).
- UE5 trigger effects (DualSense resistance, feedback and vibration) are device properties applied through the Input Device Subsystem, with per-device override data ([InputDeviceTriggerFeedbackProperty]) (summary). Haptics are local: a server effect is a client RPC to the owner, and the owner's controller plays it on that player's devices.

## 3. Unity

- **PlayerInput** is one player. "Each `PlayerInput` corresponds to one" **`InputUser`**. Two PlayerInputs don't share devices unless you pair them by hand with `InputUser.PerformPairingWithDevice` ([PlayerInput]).
- A PlayerInput enables only the **control schemes** that match its paired devices ([PlayerInput]). This is how one keyboard can be split between two players (WASD and arrows as two schemes).
- **PlayerInputManager** joins players. Its join behaviours are:
  - `JoinPlayersWhenButtonIsPressed`: a press on a device paired to nobody joins a new player with that device.
  - `JoinPlayersWhenJoinActionIsTriggered`: the same, but only for a named join action.
  - `JoinPlayersManually`: the game calls `JoinPlayer` itself.

  It can cap the player count, split the screen per player camera, and send `PlayerJoined` and `PlayerLeft` ([PlayerInputManager]).
- **Device loss.** A paired device that disconnects stays tracked by its InputUser. The system "automatically re-pairs the Device if it becomes available again". PlayerInput reports this as `onDeviceLost` and `onDeviceRegained`, and `InputUser.onChange` reports every change ([User management], [PlayerInput]).
- **Haptics are per device.** `Gamepad` implements `IDualMotorRumble.SetMotorSpeeds(low, high)`, with pause, resume and reset per device or global. Rumble and light-bar commands sent in quick succession may be dropped ([Gamepad]).
- **Netcode for GameObjects** is per client. Each NetworkObject is owned by the server or one client id (`SpawnWithOwnership(clientId)`, `ChangeOwnership`, `RemoveOwnership`), and PlayerObjects optionally tie one object to a client ([NetworkObject]). Local players are not part of the model: a community example links PlayerInputManager players to network players itself ([MixedMultiplayerExample]) (summary).
- **Netcode for Entities assumes one player per client.** Unity's own *Survival Kids* split-screen work had to add "a virtual input player that nobody can see". It bundles every local player's input, and the bundle "has to be sent up as one" per client per frame ([Survival Kids]). This is the cost of a net layer whose identity unit is the connection.

## 4. Godot

- **Authority is per node, keyed by peer id.** "The server's ID is always 1, and clients are assigned a random positive integer" ([High-level multiplayer]). `set_multiplayer_authority(id, recursive = true)` gives a node, and by default its children, to a peer. The default is the server ([Node]).
- **There are no local players in the net layer.** Authority is a peer, so two couch players on one client are both "peer N". The game must tell them apart itself, for example by a slot number in its own state.
- **Devices are integer ids on every event.** `InputEvent.device` is the event's device id. It can be negative for virtual devices: `DEVICE_ID_EMULATION` is -1 for touch-to-mouse emulation ([InputEvent]). Actions can be bound per device, so per-player input is "filter events by device".
- `joy_connection_changed(device, connected)` signals connect and disconnect. `get_connected_joypads()` lists ids, and their order "can not be guaranteed to be the same after a project and/or the editor is restarted". `get_joy_guid` is an SDL-style model GUID, not a per-unit id, and `get_joy_info` is "always empty on Android and Web". `start_joy_vibration(device, weak, strong, duration)` rumbles one pad ([Input]).

## 5. The browser Gamepad API

- **Index.** Indices are assigned first come, first served from zero. A disconnect never renumbers the pads still connected, and "the lowest previously used index MUST be reused" ([W3C Gamepad]). So an index is stable for the life of a connection, but not across a reconnect: a re-plugged pad may land on another freed slot, and a different pad may take its old one.
- **`id` names the product, not the unit.** Serial numbers and Bluetooth addresses "MUST NOT be included" ([W3C Gamepad]). Two identical pads have the same `id`. **No browser key survives a reconnect or a reload**, so pairing a pad back to a player needs a human: press a button to claim a seat.
- **Pads appear only after a gesture.** "getGamepads() returns an empty list before a gamepad user gesture has been seen", and `gamepadconnected` waits for the same flag ([W3C Gamepad]). A pad already plugged in at load shows up when its button is pressed or an axis moves ([MDN Using the Gamepad API]). This matches Unity's "press a button to join" exactly: the first press is both the reveal and the join.
- **Snapshots versus live objects.** The spec says `getGamepads()` "returns a snapshot". Historically Chrome returned new snapshot objects each call, while Firefox updated the object from the event in place ([w3c/gamepad #10], [W3C bug 21434]). MDN's advice for all browsers is to call `getGamepads()` each frame and read the entry for a known `index`, not to keep an old reference ([MDN Using the Gamepad API]). The thing to keep per player is the **index**; the "native object" is whatever `getGamepads()[index]` returns this frame.
- **Haptics.** `gamepad.vibrationActuator` is the primary actuator. `effects` lists supported types:
  - `dual-rumble`: one motor in each handle;
  - `trigger-rumble`: adds motors in buttons 6 and 7. It is Chrome 126+, aimed at Xbox impulse triggers ([trigger-rumble intent], [caniuse trigger-rumble]).

  `playEffect(type, { duration, startDelay, strongMagnitude, weakMagnitude, leftTrigger, rightTrigger })` resolves `complete` or `preempted`, and `reset()` stops a playing effect. When the document is hidden, effects stop, and both calls reject ([W3C Gamepad]). There is no DualSense adaptive-trigger resistance on the web.

## 6. What Lion Hawk should take

The engines agree on four things:

- the connection is not the player;
- the local seat is not the replicated player;
- input and haptics belong to the controller;
- the body is possessed, not owned for life.

Unity and Godot stop at "connection = player" in their netcode, and Survival Kids shows what that costs: a hidden input bundler that every game has to invent. Unreal's split is the one to follow. Lion Hawk can skip its server-side controller objects, because a browser host has no use for them.

### 6.1 The terms

| Lion Hawk | Unreal | What it is |
|---|---|---|
| **peer** | `UNetConnection` | One page in the room. Transport peer id, rates and bandwidth ([N-3]), one send clock. Unchanged. |
| **local player** | `ULocalPlayer` | A seat on this page: slot 0..k. It owns devices (pad indices, a keyboard scheme, touch) and has its own input snapshot. It is page-local and never replicated. |
| **player** | `APlayerState` | Game-wide identity: player number 1..255 plus replicated per-player state (name, colour, score). The host assigns it and everyone sees it. The roster is `net.players`, which plays the part of `PlayerArray`. |
| **controller** | `APlayerController` | Per local player: the input snapshot, the devices it holds, haptics, and the entity it possesses. It exists only on the owning page. |
| **pawn / actor** | `APawn` | The entity with `e.input`. It changes hands by possession, not by spawning. |

The host needs no controller object for remote players. Their input already arrives as driven-actor input ([N-13]), and haptics for them are a command to the owning peer, the same shape as `ClientPlayForceFeedback` being a client RPC.

### 6.2 Identity keys

- **Key a player by (peer key, local slot).** Today it is keyed by peer alone. The host keeps `(peerKey, slot) -> player number`, so `net.player(peer, n)` becomes `net.player(peer, slot, n)`, and slot 0 keeps today's behaviour.
- **The peer key should be a stable page token, not the transport peer id, if the transport id changes on reload.** A random id would be created once and kept in `sessionStorage`, or `localStorage` for "same browser", and sent in the join hello. Whether Handshake already keeps peer ids across `peerAway`/`peerBack` decides how much of this is needed: check before building. This is the browser's stand-in for `FUniqueNetIdRepl`. There are no platform accounts to lean on.
- **Rejoin follows Unreal's inactive PlayerState.** On `peerLeft`, the host moves that peer's players to an inactive list for a set time. A join with the same `(peerKey, slot)` gets the same number and state back (`FindInactivePlayer` plus `OverridePlayerState`). Today a reused number "starts fresh" (`install.js:208-212`). That remains the expiry path.
- **Several players per peer touches the net core in three places.**
  1. `net.self` becomes the set of this page's player numbers. Keep `self` as the first one for the single-player case.
  2. The host's frame check becomes "`f`'s owner entities all belong to players bound to `d.from`".
  3. The spawn guard becomes "`netId` is one of mine".

  Keep **one frame per peer per send tick**, carrying every local player's owner entities. That is Unreal's child-connection rule (children ride the parent), and it keeps rates and bandwidth per connection, where [N-3] already puts them. Per-player rate limits are not worth it: a peer with four couch players is still one browser on one uplink.

### 6.3 Controllers and native devices

- **Pairing follows Unity's `JoinPlayersWhenButtonIsPressed` and Unreal's unpaired user.** A pad index that no seat holds is unpaired. Its first press joins a new local player, or fills a seat whose device was lost. The browser forces this anyway: a pad does not exist to the page before a press.
- **Device loss follows Unity's `onDeviceLost`/`onDeviceRegained`.** On `gamepaddisconnected` the seat keeps its player and marks the device lost. Because the index may not come back the same, the regain is "the next unpaired pad that presses a button, offered to seats with a lost device first". This is a game-visible event, so a game can show "Player 2: press a button".
- **Expose the native object, current for this frame.** The controller holds `index` and gives the game `controller.pad`, which is `getGamepads()[index]` refreshed each frame. That is the real `Gamepad`, with `id`, `mapping`, `buttons`, `axes` and `vibrationActuator`. Games call `controller.pad.vibrationActuator.playEffect('trigger-rumble', …)` directly, after checking `effects`. Do not wrap it in a rumble abstraction. The only engine value added is routing ("this player's pad") and stopping on hidden or blur, which the spec already does for effects. `controller.rumble(...)` is worth having only as a convenience that does nothing when the seat has no pad or is on keyboard or touch.
- **Keyboard and touch are devices too.** A keyboard can carry two schemes (WASD and arrows, Unity's control schemes). Touch is one seat per screen. Each scheme or touch surface is a device a seat can hold. This needs the per-source layers that `engine.input` already has to be grouped per seat instead of merged into one.
- **Input is one snapshot per local player.** `engine.input` stays as seat 0's snapshot, so single-player games don't change. `input.apply` copies each seat's snapshot into the entity its controller possesses ([I-4] generalised). Tapes ([T-9]) and `engine.input.set` need a seat argument.
- **Possession replaces "the game hand-picks the entity".** `controller.possess(e)` and `controller.unpossess()`. The possessed entity is what gets `e.input`, and is what the camera follows for that seat. A bot is a controller with no devices, the `AAIController` idea, which [I-6] `set`/`hold` already half covers.

### 6.4 Trade-offs and what does not fit

- **No hardware identity.** Every engine above can name a pad across reconnects, and the browser cannot. "Press a button to reclaim" is a UX cost the engine should make easy and visible, not hide.
- **No platform users.** `FPlatformUserId` and Unity's account pairing have no web equivalent. A seat is a slot, and identity is room-scoped unless the game adds a name or login.
- **Split-screen rendering is a separate decision.** Unreal and Unity tie local players to viewports. Lion Hawk's games mostly share one camera, so the local-player concept should not require a viewport. Allow one per seat later.
- **Rally's single-car assumptions.** Things like camera, HUD and the one `e.input` reader may need per-seat versions before couch play works there. That is game work, not engine work.
- **Haptics are best-effort.** Firefox and Safari support for `vibrationActuator` is incomplete, and only Chrome has `trigger-rumble`. Games must check `effects` and accept silence.
- **Cost of the general key.** `(peerKey, slot)` adds a field to every join and binding. The alternative, one peer per seat over a loopback transport, would reuse today's code but multiply frames, clocks and rate windows per page, which is what Unreal's child connections exist to avoid.

## 7. Sources

**Unreal**
- [Gameplay Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-framework-in-unreal-engine)
- [Owning connection: Actor Owner and Owning Connection](https://dev.epicgames.com/documentation/en-us/unreal-engine/actor-owner-and-owning-connection-in-unreal-engine)
- [Networking overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine)
- [Enhanced Input](https://dev.epicgames.com/documentation/en-us/unreal-engine/enhanced-input-in-unreal-engine)
- [UChildConnection](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UChildConnection) **(summary)**
- [UNetConnection::Children](https://docs.unrealengine.com/4.27/en-US/API/Runtime/Engine/Engine/UNetConnection/Children/index.html), [UNetConnection::CreateChild](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UNetConnection/CreateChild) **(summary)**
- [IPlatformInputDeviceMapper](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/ApplicationCore/IPlatformInputDeviceMapper)
- [AGameMode](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/AGameMode), [AGameMode::FindInactivePlayer](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/AGameMode/FindInactivePlayer), [OverridePlayerState](https://docs.unrealengine.com/4.27/en-US/API/Runtime/Engine/GameFramework/AGameMode/OverridePlayerState/index.html), [APlayerState](https://docs.unrealengine.com/4.27/en-US/API/Runtime/Engine/GameFramework/APlayerState/) **(summary)**
- [Travelling in multiplayer](https://dev.epicgames.com/documentation/en-us/unreal-engine/travelling-in-multiplayer-in-unreal-engine)
- [Force feedback](https://dev.epicgames.com/documentation/en-us/unreal-engine/force-feedback-in-unreal-engine)
- [SetHapticsByValue](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/APlayerController/SetHapticsByValue), [SetDisableHaptics](https://docs.unrealengine.com/4.27/en-US/BlueprintAPI/Game/Feedback/SetDisableHaptics/index.html) **(summary)**
- [InputDeviceTriggerFeedbackProperty](https://docs.unrealengine.com/PythonAPI/class/InputDeviceTriggerFeedbackProperty.html) **(summary)**
- [Online split-screen forums](https://forums.unrealengine.com/questions/258712/online-splitscreen.html) **(summary, anecdotal)**

**Unity**
- [PlayerInput](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/PlayerInput.html)
- [PlayerInputManager](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/PlayerInputManager.html)
- [User management](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/UserManagement.html)
- [Gamepad](https://docs.unity3d.com/Packages/com.unity.inputsystem@1.11/manual/Gamepad.html)
- [NetworkObject (NGO 2.4)](https://docs.unity3d.com/Packages/com.unity.netcode.gameobjects@2.4/manual/basics/networkobject.html)
- [Split-screen and GameShare networking in Survival Kids](https://unity.com/blog/split-screen-and-gameshare-networking-in-survival-kids)
- [MixedMultiplayerExample](https://github.com/juhenius/MixedMultiplayerExample) **(summary)**

**Godot**
- [High-level multiplayer](https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html)
- [Node](https://docs.godotengine.org/en/stable/classes/class_node.html)
- [Input](https://docs.godotengine.org/en/stable/classes/class_input.html)
- [InputEvent](https://docs.godotengine.org/en/stable/classes/class_inputevent.html)

**Web**
- [W3C Gamepad](https://w3c.github.io/gamepad/)
- [MDN Using the Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API)
- [MDN GamepadHapticActuator](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator)
- [w3c/gamepad #10](https://github.com/w3c/gamepad/issues/10), [W3C bug 21434](https://www.w3.org/Bugs/Public/show_bug.cgi?id=21434) **(summary)**
- [trigger-rumble intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/ncvmDRl0AzM/m/z4v34arEAQAJ), [caniuse trigger-rumble](https://caniuse.com/mdn-api_gamepadhapticactuator_effects_type_trigger-rumble) **(summary)**
