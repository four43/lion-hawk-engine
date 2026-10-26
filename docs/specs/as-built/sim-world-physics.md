---
id: F03
title: Simulation world, physics and fields
status: as-built
source_commit: 7224d6b
paths:
  - src/sim/world/**
  - src/sim/physics/**
  - src/sim/fields/**
generated: STE spec writer
---

# Simulation world, physics and fields

## Summary
The World holds the entities of one main scene and, when the game gives a Rapier module, its `RAPIER.World`. The feature has the transform pool, `place`, the Rapier wrapper, colliders, collision groups, events and heightfields. The feature also has the phase 8 fields: wind, aero, buoyancy and magnetism. Game code calls the World. The engine calls the World seat and its four systems. All code here is sim code. Rapier comes only by injection.

## Scope
- **In scope:** `src/sim/world/**`, `src/sim/physics/**` and `src/sim/fields/**`: spawn, despawn, queries, parts, joints, material swap, step pieces, digest, heightfield, audit and the fields.
- **Out of scope:** the engine, stages and events in the [core spec](core.md). Materials and sidecars in the [defs and kits spec](defs-and-kits.md). Net guards (the World only calls them). View sync.

## Terms
See the [glossary](_meta/glossary.md). In this spec, "owned free" means a function registered with `world.own`. "Sleeper" means a body spawned with `body.sleep: true`, until the first read.
- **field set** — the object that `createFields` returns: the wind, aero, buoyancy and magnet settings of one World, with its `step`, `submerged` and `dispose` methods. [src/sim/fields/index.js:171-185]
- **aero panel** — a baked sidecar entry `{ part, a, n, c }` with area, unit normal and centre in body space. [src/sim/fields/index.js:76-91]
- **planform panel** — the aero panel of a part with the largest area. A tie goes to the panel with the larger `n[1]`. [src/sim/fields/index.js:86]

## Interfaces

### World object (`createWorld(engine, opts)`)
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `spawn(desc)` | in | spawn descriptor, returns entity | [src/sim/world/world.js:101-216] <!-- C-95 --> |
| `despawn(e)` | in | entity | [src/sim/world/world.js:227-240] <!-- C-138 --> |
| `with(...parts)` | in | up to 4 part names, returns live query | [src/sim/world/world.js:268-277] <!-- C-149 C-150 C-151 --> |
| `get(id)` | in | id, returns entity or undefined | [src/sim/world/world.js:486] <!-- C-153 --> |
| `add(e, part, value)`, `remove(e, part)` | in | entity, part name | [src/sim/world/world.js:278-313] <!-- C-154 C-159 --> |
| `own(fn)`, `own(e, fn)` | in | function, returns unregister function | [src/sim/world/world.js:315-320] <!-- C-163 C-164 --> |
| `joint(a, b, desc)` | in | two entities, descriptor or `JointData`, returns Rapier joint | [src/sim/world/world.js:350-360] <!-- C-165 --> |
| `setMaterial(e, part, id)` | in | entity, part or `'*'`, material id | [src/sim/world/world.js:363-387] <!-- C-174 --> |
| `place(e, target, opts)` | in | see Behavior | [src/sim/world/place.js:19-51] <!-- C-20 --> |
| `socket(e, name, out)`, `xfPrev(e, out)`, `partXfPrev(e, name, out)` | in | `{ p, q }` out objects | [src/sim/world/place.js:52-66; src/sim/world/world.js:490-498] <!-- C-35 C-36 C-193 --> |
| `heightfield(opts)` | in | see Behavior | [src/sim/world/world.js:442-461] <!-- C-183 --> |
| `clear()`, `dispose()` | in | none | [src/sim/world/world.js:253-254] <!-- C-144 C-147 --> |
| `digest()` | out | `{ n, sum }` | [src/sim/world/world.js:427-439] <!-- C-182 --> |
| `audit()` | out | list of `{ handle, entity, friction, restitution }` | [src/sim/world/world.js:463-472] <!-- C-188 --> |
| `materialOf(handle)`, `entityOf(handle)` | in | collider handle | [src/sim/world/world.js:499-500] <!-- C-194 --> |
| `onSpawn(fn)`, `onDespawn(fn)` | in | hook `(entity, world)`, returns unregister function | [src/sim/world/world.js:502-503] <!-- C-195 --> |
| `rapier`, `disposed`, `stats`, `xf`, `seed`, `serial`, `R`, `materials`, `groups`, `engine`, `net` | out | properties | [src/sim/world/world.js:478-505] <!-- C-190 C-191 C-192 --> |
| `sys.swap`, `sys.step`, `sys.read`, `sys.events` | in | step pieces run by the systems | [src/sim/world/world.js:392-426] <!-- C-177 C-178 C-179 C-181 --> |

### Module functions
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| `installWorld(engine, { timer })` | in | returns the World seat | [src/sim/world/install.js:17-39] <!-- C-38 C-39 --> |
| `checkPhysics(p, fail)` | in | `defineGame` check | [src/sim/world/install.js:9-15] <!-- C-37 --> |
| `createPool(cap)`, `makeXf`, `deadXf`, `isVec` | in | pool functions | [src/sim/world/pool.js:11-80] <!-- C-2 C-10 C-13 C-16 --> |
| `createPlacer(pool, rapier, world)` | in | returns `{ place, socket, xfPrev }` | [src/sim/world/place.js:10-67] <!-- C-18 --> |
| `createPhysics(R, { gravity, hz, params, timer })` | in | returns `ph` with `world`, `queue`, `stats`, `step`, `free`, `recreate` | [src/sim/physics/rapier.js:67-94] <!-- C-49 --> |
| `mergeParams`, `checkRapier`, `PINNED_DEFAULTS` | in | functions and frozen object | [src/sim/physics/rapier.js:6-43] <!-- C-47 C-48 --> |
| `shapeDesc`, `materialFor`, `applyMaterial` | in | collider helpers | [src/sim/physics/colliders.js:10-51] <!-- C-58 C-65 C-66 --> |
| `createEventDrain({ emit, hz, entityOf, materialOf })` | in | returns `(world, queue)` drain function | [src/sim/physics/events.js:5-34] <!-- C-68 --> |
| `createGroups(names)`, `ALL` | in | frozen group object, constant | [src/sim/physics/groups.js:4-25] <!-- C-77 C-78 --> |
| `heightfieldDesc(R, opts)` | in | Rapier collider descriptor | [src/sim/physics/heightfield.js:5-14] <!-- C-84 --> |
| `createWind({ base, gust, zones, seed })` | in | returns a frozen object with `at(p, t, out?)`. Exported from `src/index.sim.js`. | [src/sim/fields/index.js:12; src/sim/fields/index.js:27-35; src/index.sim.js:27] <!-- C-198 --> |
| `createFields(world, { wind, aero, buoyancy, magnet, models })` | in | returns a field set `{ removed, step(dt, t), submerged(e), dispose() }` | [src/sim/fields/index.js:57; src/sim/fields/index.js:171-192] <!-- C-202 --> |
| `FIELDS_SYSTEM` | out | the string `'lh.fields'`. Exported from `src/index.sim.js`. | [src/sim/fields/index.js:40; src/index.sim.js:27] <!-- C-202 --> |

### Events out
| Interface | Direction | Format | Evidence |
| --- | --- | --- | --- |
| event `contact` | out | `{ a, b, materials: [ma, mb], impulse, point: [x, y, z] }` | [src/sim/physics/events.js:24] <!-- C-69 --> |
| event `sensor` | out | `{ sensor, other, on }` | [src/sim/physics/events.js:26-29] <!-- C-73 --> |
| systems `lh.world.swap`, `lh.physics.step`, `lh.physics.read`, `lh.physics.events` | out | engine systems | [src/sim/world/install.js:31-37] <!-- C-42 --> |
| system `lh.fields` | out | engine system in stage `pre`, added by the first `createFields` call for an engine | [src/sim/fields/index.js:39-44] <!-- C-210 --> |

## Behavior

### Spawn: input checks
- **B-1** If the descriptor has the key `id`, `sockets` or `heightfield`, `world.spawn` throws "world: '<label>' may not set '<key>' (the World does)". [src/sim/world/world.js:21; src/sim/world/world.js:103-104] <!-- C-95 -->
- **B-2** The label in spawn errors is the tags joined with ',' if `tags` is a non-empty array. Otherwise the label is the model, and otherwise it is 'entity'. [src/sim/world/world.js:27; src/sim/world/world.js:103] <!-- C-96 -->
- **B-3** If `desc.tags` is defined and is not an array, `world.spawn` throws "world: '<label>' tags must be an array". [src/sim/world/world.js:105] <!-- C-97 -->
- **B-4** If `desc.model` is not a string key of the sidecars, `world.spawn` throws "unknown model '<model>'" with the label prefix. [src/sim/world/world.js:107-109; test/world-bodies.test.mjs:91] <!-- C-98 -->
- **B-5** The collider entries of a spawn are `desc.colliders`, otherwise the sidecar colliders of the model, otherwise an empty list. Inline colliders replace the sidecar colliders. If the entries are not an array, spawn throws "world: '<label>' colliders must be an array". [src/sim/world/world.js:111-112; test/world-bodies.test.mjs:53] <!-- C-99 -->
- **B-6** The entity kind is the body type when `desc.body` is given. Without a body the kind is FIXED if there are colliders, otherwise BODILESS. [src/sim/world/world.js:119; test/world-bodies.test.mjs:64] <!-- C-101 -->
- **B-7** Spawn needs a Rapier module for any kind except BODILESS. Without one, `world.spawn` throws 'needs a body but the game has no physics.rapier'. The error has the label prefix. [src/sim/world/world.js:120; test/world-entities.test.mjs:128] <!-- C-102 -->
- **B-8** The field `desc.at` defaults to `[0, 0, 0]`. If `at` is not three finite numbers, spawn throws 'at must be [x, y, z]'. [src/sim/world/world.js:121-122] <!-- C-103 -->
- **B-9** If `desc.q` is given, spawn normalises it and uses it as the rotation. Otherwise a finite `desc.yaw` sets the rotation with `qFromYaw`. Otherwise the rotation is the identity. [src/sim/world/world.js:123-130] <!-- C-104 -->
- **B-10** A `q` that is not four finite numbers, or is all zero, throws 'q must be a non-zero [x, y, z, w]'. A `yaw` that is not finite throws 'yaw must be a finite number'. [src/sim/world/world.js:125; src/sim/world/world.js:128] <!-- C-104 -->
- **B-11** If `desc.groups` is `{ member, filter }`, the collision mask of every collider is `groups.mask(member, filter)`. Without `desc.groups` the mask is 0xffffffff. [src/sim/world/world.js:133-134; test/world-bodies.test.mjs:76] <!-- C-105 -->
- **B-12** A group error thrown by `groups.mask` becomes "world: '<label>' " plus the error text without its 'physics: ' prefix. [src/sim/world/world.js:134] <!-- C-105 -->
- **B-13** If `desc.material` is not an object, spawn throws "material must be { part: id } (use { '*': id } for every part)". [src/sim/world/world.js:135] <!-- C-106 -->
- **B-14** If `desc.contacts` is defined and `desc.contacts.min` is not a number of 0 or more, spawn throws 'contacts must be { min: impulse >= 0 }'. [src/sim/world/world.js:136] <!-- C-107 -->
- **B-15** A bad `partXf` throws 'partXf must be an array of distinct part names or { name: { p, q } | null }'. A good `partXf` is an array of distinct names or an object of `{ p, q } | null`. [src/sim/world/world.js:137-138; test/world-parts.test.mjs:51] <!-- C-108 -->
- **B-16** A bodiless entity with `partXf` and without `xf: true` throws 'partXf needs an xf (a body or xf: true)'. [src/sim/world/world.js:139; test/world-parts.test.mjs:51] <!-- C-108 -->
- **B-17** Spawn throws 'body takes mass or massProps, not both', 'body.mass needs a dynamic body' or 'body.mass must be > 0 (got <mass>)'. These errors are for bad `body.mass` values. [src/sim/world/world.js:141-146] <!-- C-109 -->
- **B-18** Bad `massProps` throw 'body.massProps must be { mass > 0, com: [x, y, z], inertia: [ix, iy, iz] }'. [src/sim/world/world.js:147] <!-- C-110 -->
- **B-19** A dynamic body with no colliders and no `massProps` throws 'a dynamic body needs colliders or massProps'. [src/sim/world/world.js:148] <!-- C-111 -->
- **B-20** For each collider entry, the part defaults to 'body'. The material id comes from `materialFor` with `desc.material`. [src/sim/world/world.js:150-151; test/world-bodies.test.mjs:53] <!-- C-112 -->
- **B-21** The material id must be a string that the registry has. Spawn throws 'collider <i> (<part>) needs a material registry: set defs.materials' or "unknown material '<id>' on collider <i> (<part>)". [src/sim/world/world.js:152-153] <!-- C-112 -->
- **B-22** The collider density comes from `registry.collider(id).density`, or is 0 when the body has `massProps`. [src/sim/world/world.js:154] <!-- C-113 -->
- **B-23** A dynamic body without `massProps` throws on a density that is not above 0. The error is "collider <i> (<part>) has zero density ('<id>') on a dynamic body without massProps". [src/sim/world/world.js:155] <!-- C-113 -->
- **B-24** The collider shape comes from `shapeDesc`. The entry fields `p` and `q` set the collider translation and rotation. A failure throws 'collider <i> (<part>): <error text>'. [src/sim/world/world.js:156-161; test/world-bodies.test.mjs:91] <!-- C-114 -->
- **B-25** When `desc.colliders` is given, `validateCollider` also checks each inline entry, with `inline: true`. The resolved material id stands in for a material that came from `desc.material`. [src/sim/world/world.js:162-164] <!-- C-115 -->
- **B-26** Every check that can fail runs before spawn makes a Rapier object or takes an id. A throwing spawn leaves nothing behind. [src/sim/world/world.js:131-132; test/world-bodies.test.mjs:91] <!-- C-119 -->
- **B-27** If `desc.net` is defined, spawn calls `world.net.guard('spawn', desc)` before it takes an id. The guard can throw. [src/sim/world/world.js:173; test/world-entities.test.mjs:107] <!-- C-120 -->

### Spawn: build
- **B-28** Each collider gets `applyMaterial` with the registry collider data and the density. Each collider also gets the collision mask. [src/sim/world/world.js:165; test/world-bodies.test.mjs:76] <!-- C-116 -->
- **B-29** If `desc.sensor` is true, each collider is a sensor with the `COLLISION_EVENTS` flag. [src/sim/world/world.js:167; test/world-bodies.test.mjs:76] <!-- C-117 -->
- **B-30** If `desc.contacts` is given, each collider gets the `CONTACT_FORCE_EVENTS` flag and the contact force threshold `min * hz`. The factor `hz` converts N·s to N. [src/sim/world/world.js:168-169; test/physics-events.test.mjs:39] <!-- C-118 -->
- **B-31** The new entity has a numeric `id` from a counter that starts at 1. The entity has a `tags` Set from `desc.tags`. [src/sim/world/world.js:59; src/sim/world/world.js:174; test/world-entities.test.mjs:9] <!-- C-121 -->
- **B-32** The entity gets the `model` field if `desc.model` is set. It gets each other desc key that is not in the World key list as a game field, as given. [src/sim/world/world.js:20; src/sim/world/world.js:175-176] <!-- C-121 -->
- **B-33** For a dynamic kind the Rapier body is dynamic. For kinematic it is position-based kinematic. For fixed it is fixed. The body starts at the position and rotation of the entity. [src/sim/world/world.js:178-181; test/world-bodies.test.mjs:64] <!-- C-122 -->
- **B-34** If `body.lock.rot` is true, the body locks all rotations. Otherwise `body.lock` `{ x, y, z }` disables the rotation on each axis that is truthy. [src/sim/world/world.js:183; test/world-bodies.test.mjs:64] <!-- C-123 -->
- **B-35** If `body.ccd` is true, the body enables CCD. The fields `body.linearDamping` and `body.angularDamping` set the damping. The field `body.canSleep` sets whether the body can sleep. [src/sim/world/world.js:184-187] <!-- C-124 -->
- **B-36** If `body.sleep` is true, the body can sleep and starts asleep. The World adds the entity to the sleepers list. [src/sim/world/world.js:188; src/sim/world/world.js:205; test/world-bodies.test.mjs:64] <!-- C-125 -->
- **B-37** The field `body.massProps` `{ mass, com, inertia }` sets the additional mass properties of the body. The collider density is then 0. [src/sim/world/world.js:154; src/sim/world/world.js:189; test/world-bodies.test.mjs:43] <!-- C-126 -->
- **B-38** The World creates the colliders in descriptor order. Each `e.colliders` entry is `{ collider, part, material }`. The World maps each collider handle to `{ e, material }`. [src/sim/world/world.js:55; src/sim/world/world.js:193-197] <!-- C-128 -->
- **B-39** After spawn creates the colliders, spawn recomputes the mass properties of the body from the colliders. A mass read right after spawn is therefore current. [src/sim/world/world.js:198; test/world-bodies.test.mjs:15] <!-- C-129 -->
- **B-40** With `body.mass`, spawn sets the mass scale `k` to the mass divided by the computed body mass. Spawn multiplies each collider density by `k` and recomputes. The centre of mass stays geometric. [src/sim/world/world.js:199-203; test/world-bodies.test.mjs:33] <!-- C-130 -->
- **B-41** Spawn gives a pool slot to each entity with a body and to each bodiless entity with `desc.xf` true. Spawn writes the start pose to prev and curr and makes `e.xf`. [src/sim/world/world.js:207-211; test/world-entities.test.mjs:62] <!-- C-132 -->
- **B-42** For an entity with a model, `e.sockets` is a frozen deep copy of the sidecar sockets, or an empty object. The World makes one copy per model id. [src/sim/world/world.js:68-72; src/sim/world/world.js:212] <!-- C-133 -->
- **B-43** `setParts` with an array of names makes each part with no initial pose. With an object it uses `{ p, q }` as the initial pose of the curr and prev halves. [src/sim/world/world.js:35-38; src/sim/world/world.js:85-98; test/world-parts.test.mjs:11] <!-- C-136 -->
- **B-44** `setParts` skips a name that `e.partXf` already has. The default part pose is the identity. [src/sim/world/world.js:89-90; test/world-parts.test.mjs:30] <!-- C-136 -->
- **B-45** Register adds the entity to the id-ordered list, the id map, the pool slot list, the bodied list and each matching query. Register then calls each `onSpawn` hook with `(entity, world)`. [src/sim/world/world.js:74-82; test/world-entities.test.mjs:101] <!-- C-134 -->
- **B-46** The World entity list keeps id order. The World takes Rapier objects in spawn order. A run therefore depends only on the sequence of World calls. [src/sim/world/world.js:1-4; src/sim/world/world.js:29-32] <!-- C-197 -->

### Despawn, clear and dispose
- **B-47** `world.despawn` does nothing for an entity that is dead, unknown or from another World. [src/sim/world/world.js:227-229; test/world-entities.test.mjs:47] <!-- C-138 -->
- **B-48** If the entity has a `net` part, despawn calls `world.net.guard('despawn', e)` first. Despawn then runs each `onDespawn` hook before it frees anything. [src/sim/world/world.js:230-231; test/world-entities.test.mjs:107] <!-- C-139 -->
- **B-49** Despawn runs the owned frees of the entity in reverse order before it removes the Rapier body. [src/sim/world/world.js:218; src/sim/world/world.js:232; test/world-step.test.mjs:143] <!-- C-140 -->
- **B-50** Despawn removes the Rapier body, which takes its colliders. For an entity with colliders and no body, such as a heightfield, despawn removes each collider. [src/sim/world/world.js:233-234; test/world-bodies.test.mjs:117] <!-- C-141 -->
- **B-51** After despawn, the entity keeps its `id`, `tags`, game fields and a frozen last pose in `e.xf`. The entity has no body and no colliders. The pool slot is freed. The counters and collider handles follow. [src/sim/world/world.js:219-226; test/world-entities.test.mjs:47] <!-- C-142 -->
- **B-52** Despawn removes the entity from the entity list, the id map, the bodied list, every query and the sleepers list. [src/sim/world/world.js:236-239; test/world-entities.test.mjs:27] <!-- C-143 -->
- **B-53** `world.clear` runs the teardown on all entities, resets the pool and restarts ids at 1. The call makes a new Rapier world and gives the World a new serial. The query arrays stay the same objects. [src/sim/world/world.js:241-253; test/world-entities.test.mjs:75; test/world-step.test.mjs:118] <!-- C-144 -->
- **B-54** The teardown for `clear` and `dispose` runs the `onDespawn` hooks and owned frees of the entities from newest to oldest. Teardown then runs the `world.own(fn)` frees in reverse order and forgets every entity. [src/sim/world/world.js:241-252; test/world-entities.test.mjs:75] <!-- C-145 -->
- **B-55** Teardown does not call `world.net.guard`. Neither `clear` nor `dispose` calls it. [src/sim/world/world.js:241-254; test/world-entities.test.mjs:107] <!-- C-146 -->
- **B-56** `world.dispose` does nothing if the World is already disposed. Otherwise `dispose` runs the teardown, frees the Rapier objects, marks the World disposed and gives the World a new serial. [src/sim/world/world.js:254; test/world-entities.test.mjs:90] <!-- C-147 -->
- **B-57** After dispose, `sys.swap`, `sys.step`, `sys.read` and `sys.events` return without effect. [src/sim/world/world.js:394; src/sim/world/world.js:405-407; src/sim/world/world.js:425; test/world-step.test.mjs:155] <!-- C-147 -->
- **B-58** A new World, `clear` and `dispose` each take the next value of one process-wide counter as the serial. Serials are therefore unique across Worlds. [src/sim/world/world.js:19; src/sim/world/world.js:253-254; src/sim/world/world.js:479; test/world-entities.test.mjs:90] <!-- C-148 -->
- **B-59** The fields `stats.bodies` and `stats.colliders` count the live Rapier bodies and colliders that the World made. [src/sim/world/world.js:204; src/sim/world/world.js:223; src/sim/world/world.js:474-477; test/world-bodies.test.mjs:117] <!-- C-131 -->

### Queries, parts and owned frees
- **B-60** `world.with()` with no arguments returns the list of all entities, in id order. [src/sim/world/world.js:268-270; test/world-entities.test.mjs:27] <!-- C-149 -->
- **B-61** `world.with(...parts)` returns the same cached array on each call. The array is live and in id order. An entity matches when each named part is not undefined. [src/sim/world/world.js:33; src/sim/world/world.js:267-277; test/world-entities.test.mjs:27] <!-- C-151 -->
- **B-62** A new query starts with the existing matching entities. Spawn adds a new matching entity at the end of the query. Despawn removes it. `add` and `remove` change membership in id order. [src/sim/world/world.js:80; src/sim/world/world.js:256-261; src/sim/world/world.js:296; src/sim/world/world.js:310] <!-- C-152 -->
- **B-63** `world.get(id)` returns the live entity with that id, or undefined. [src/sim/world/world.js:486] <!-- C-153 -->
- **B-64** `world.add` of the part `net` calls `world.net.guard('add', e, value)`. The call comes after the fixed-part and missing-value checks and before any change. [src/sim/world/world.js:282] <!-- C-155 -->
- **B-65** `world.add` of `partXf` checks the value like spawn. It adds new names and keeps the values of existing names. [src/sim/world/world.js:283-287; test/world-parts.test.mjs:30] <!-- C-156 -->
- **B-66** `world.add` of `partXf` for an entity without an xf throws "world.add: 'partXf' needs an xf (a body or xf: true)". [src/sim/world/world.js:285] <!-- C-156 -->
- **B-67** `world.add` of `xf` gives a bodiless entity a pool slot and an `e.xf`. If the entity already has a slot, the call does nothing. [src/sim/world/world.js:288-290; test/world-entities.test.mjs:62] <!-- C-157 -->
- **B-68** `world.add` of any other part sets `e[part]` to the value. If the entity already had the part, the queries do not change. `world.add` returns the entity. [src/sim/world/world.js:291-297] <!-- C-158 -->
- **B-69** If the entity lacks the part, `world.remove` returns the entity. [src/sim/world/world.js:302; test/world-entities.test.mjs:62] <!-- C-159 -->
- **B-70** `world.remove` of the part `net` calls `world.net.guard('remove', e)` only when the entity has a `net` part. The call comes before any change. [src/sim/world/world.js:303] <!-- C-160 -->
- **B-71** `world.remove` of `xf` frees the pool slot of a bodiless entity. The call throws 'world.remove: a body entity keeps its xf' for an entity with a body. [src/sim/world/world.js:304-307; test/world-entities.test.mjs:62] <!-- C-161 -->
- **B-72** `world.remove` of `xf` throws 'world.remove: entity <id> has partXf: remove partXf before xf' when the entity has `partXf`. [src/sim/world/world.js:306] <!-- C-161 -->
- **B-73** `world.remove` of `partXf` stops the swap of the part poses. `world.remove` removes the part from the entity and drops the entity from every query that names the part. [src/sim/world/world.js:309-312; test/world-parts.test.mjs:30] <!-- C-162 -->
- **B-74** `e.partXf[name]` is the curr pose `{ p, q }` of the part. Sim code writes it. The World keeps a hidden prev pose for each part. [src/sim/world/world.js:84-97; test/world-parts.test.mjs:11] <!-- C-137 -->
- **B-75** The World keeps a `rest` value for each part. The value is 2 when the part has no seed and no step has run. The value is 1 after one swap. The value is 0 when seeded or after two swaps. [src/sim/world/world.js:95-97; src/sim/world/world.js:401] <!-- C-137 -->
- **B-76** `world.partXfPrev(e, name, out)` copies the prev pose of the part into `out`, or into a new `{ p, q }` object. The call also sets `out.rest` when `out` has a `rest` field. [src/sim/world/world.js:490-498; test/world-parts.test.mjs:11] <!-- C-193 -->
- **B-77** `world.own(fn)` registers a function that `clear` and `dispose` run in reverse order before the Rapier world goes. The call returns a function that removes the registration. [src/sim/world/world.js:314-316; test/world-step.test.mjs:118] <!-- C-163 -->
- **B-78** `world.own(e, fn)` registers `fn` to run when `e` despawns, in reverse order. The call returns a function that removes the registration. [src/sim/world/world.js:315-320; test/world-bodies.test.mjs:117] <!-- C-164 -->
- **B-79** `world.onSpawn(fn)` and `world.onDespawn(fn)` add a hook called with `(entity, world)`. Each returns a function that removes the hook. Each hook sees each entity once. [src/sim/world/world.js:81; src/sim/world/world.js:502-503; test/world-entities.test.mjs:101] <!-- C-195 -->
- **B-80** `world.materialOf(handle)` returns the material id of a collider handle. `world.entityOf(handle)` returns its entity. Both return undefined for a handle that the World does not own. [src/sim/world/world.js:499-500] <!-- C-194 -->

### Joints
- **B-81** `world.joint(a, b, desc)` makes a Rapier impulse joint between two entities that have bodies. The `desc` is `{ type, a, b, axis?, limits? }` with `type` 'spherical', 'revolute', 'fixed' or 'prismatic'. The call returns the Rapier joint. [src/sim/world/world.js:322-324; src/sim/world/world.js:350-360; test/world-joints.test.mjs:25] <!-- C-165 -->
- **B-82** `desc` can also be raw Rapier `JointData`. A `desc` is raw when it is a `JointData` instance or has a numeric `jointType`. [src/sim/world/world.js:355; test/world-joints.test.mjs:74] <!-- C-166 -->
- **B-83** The anchors `a` and `b` must be `[x, y, z]` of finite numbers. Otherwise `world.joint` throws 'world.joint: anchor a must be [x, y, z] of finite numbers, got <value>' (and the same for anchor b). [src/sim/world/world.js:325-328; src/sim/world/world.js:331] <!-- C-168 -->
- **B-84** Spherical and fixed joints take no axis and no limits. The fixed joint uses identity frame rotations. [src/sim/world/world.js:332-336; test/world-joints.test.mjs:51] <!-- C-169 -->
- **B-85** Revolute and prismatic joints need a non-zero axis. The World normalises the axis. [src/sim/world/world.js:337-341; test/world-joints.test.mjs:38] <!-- C-169 -->
- **B-86** Joint limits `[lo, hi]` must be two finite numbers with `lo` not above `hi`. The limits enable the limits of the joint data. Only revolute and prismatic joints take limits. [src/sim/world/world.js:343-347; test/world-joints.test.mjs:62] <!-- C-170 -->
- **B-87** A joint is freed when either entity despawns. The free function is safe to run twice. The free function removes the joint only if it is still valid, and removes its registration from both entities. [src/sim/world/world.js:322-323; src/sim/world/world.js:356-360; test/world-joints.test.mjs:74] <!-- C-171 -->

### Material swap
- **B-88** `world.setMaterial` changes the friction and restitution of each collider on the part, or of every collider when `part` is '*'. The call updates the material id in `e.colliders` and in the handle map. The call returns the entity. [src/sim/world/world.js:362-375; src/sim/world/world.js:386; test/world-bodies.test.mjs:139] <!-- C-174 -->
- **B-89** `world.setMaterial` changes the density of a collider, scaled by the mass scale, only when the density differs and the entity has no `massProps`. The call then recomputes the mass of the body. [src/sim/world/world.js:373; src/sim/world/world.js:377-378; test/world-bodies.test.mjs:139] <!-- C-175 -->
- **B-90** For an entity with a declared `body.mass`, `world.setMaterial` solves the mass scale again over all its colliders. The body keeps its declared weight. [src/sim/world/world.js:379-384; test/world-bodies.test.mjs:139] <!-- C-176 -->

### Transform pool and xf
- **B-91** `pool.alloc` gives the lowest free pool slot. The pool slot of an entity therefore depends only on the spawn and despawn sequence. [src/sim/world/pool.js:2-3; src/sim/world/pool.js:20-30; test/world-pool.test.mjs:10] <!-- C-3 -->
- **B-92** When no pool slot is free, `pool.alloc` doubles the capacity and copies the poses. Doubling happens only inside `alloc`, at spawn. [src/sim/world/pool.js:3-4; src/sim/world/pool.js:23-26; test/world-pool.test.mjs:18] <!-- C-4 -->
- **B-93** `pool.alloc` and `pool.free` set both halves of the pool slot to the identity pose. [src/sim/world/pool.js:15; src/sim/world/pool.js:28; src/sim/world/pool.js:35; test/world-pool.test.mjs:25] <!-- C-5 -->
- **B-94** `pool.free` of a pool slot that is not in use does nothing. A freed pool slot lowers the search start, so the next `alloc` reuses it first. [src/sim/world/pool.js:31-36; test/world-pool.test.mjs:10] <!-- C-6 -->
- **B-95** `pool.reset` marks every pool slot free, sets the count to 0 and fills the buffer with 0. The fill is not the identity rotation. [src/sim/world/pool.js:37] <!-- C-7 -->
- **B-96** `pool.swap(slots)` copies curr into prev for the listed pool slots only. The swap is a copy, not a pointer flip. An entity that nothing moves therefore keeps prev equal to curr. [src/sim/world/pool.js:47-52; test/world-pool.test.mjs:31] <!-- C-8 -->
- **B-97** Writing `e.xf.p` or `e.xf.q` on an entity without a body writes the curr half of its pool slot. [src/sim/world/pool.js:66; test/world-pool.test.mjs:41] <!-- C-15 -->
- **B-98** Writing `e.xf.p` or `e.xf.q` on an entity with a body throws 'world: entity <id> has a body: move it with world.place'. [src/sim/world/pool.js:66; test/world-pool.test.mjs:41] <!-- C-14 -->

### Place, socket and xfPrev
- **B-99** `world.place` first checks that the World is not disposed. `world.place` returns the entity. [src/sim/world/world.js:61; src/sim/world/world.js:487; src/sim/world/place.js:50] <!-- C-34 -->
- **B-100** With `target.rel`, `place` sets the position to the position of `rel` plus the local vector rotated by the rotation of `rel`. The `rel` entity must be live and have an xf. [src/sim/world/place.js:22-27; test/world-place.test.mjs:37] <!-- C-21 -->
- **B-101** If `opts.q` is given, `place` uses it as the rotation. The `q` wins over `yaw`. A bad `q` throws 'world.place: q must be a non-zero [x, y, z, w]'. [src/sim/world/place.js:32-34] <!-- C-24 -->
- **B-102** If `opts.yaw` is given without `q`, `place` sets the rotation from the yaw with `qFromYaw`. A yaw that is not finite throws 'world.place: yaw must be a finite number'. [src/sim/world/place.js:35-37] <!-- C-25 -->
- **B-103** With neither `q` nor `yaw`, `place` with `at` keeps the current rotation. With `rel` it starts from the identity rotation. With `rel`, the rotation of `rel` is then composed with the given rotation. [src/sim/world/place.js:21; src/sim/world/place.js:38-39; test/world-place.test.mjs:23; test/world-place.test.mjs:37] <!-- C-26 -->
- **B-104** `place` normalises the resulting rotation. [src/sim/world/place.js:40] <!-- C-27 -->
- **B-105** `place` writes the new pose to both the prev and the curr half of the pool slot. The view therefore does not smear across the jump. [src/sim/world/place.js:1-3; src/sim/world/place.js:41; test/world-place.test.mjs:23] <!-- C-28 -->
- **B-106** For an entity with a body, `place` sets the body translation and rotation with wake-up true. [src/sim/world/place.js:43-44; test/world-place.test.mjs:49] <!-- C-29 -->
- **B-107** For a kinematic body, `place` also sets the next kinematic translation and rotation. [src/sim/world/place.js:45; test/world-place.test.mjs:65] <!-- C-30 -->
- **B-108** For a dynamic body, `place` sets linear and angular velocity to zero unless `opts.keep` is true. [src/sim/world/place.js:46; test/world-place.test.mjs:49] <!-- C-31 -->
- **B-109** For a fixed body, `place` calls `propagateModifiedBodyPositionsToColliders` on the Rapier world. Queries then see the new position before the next step. [src/sim/world/place.js:2-3; src/sim/world/place.js:47; test/world-place.test.mjs:65] <!-- C-32 -->
- **B-110** For an entity with a body, `place` marks the body as awake. The next read then copies the Rapier pose even if Rapier puts the body to sleep at once. [src/sim/world/place.js:48] <!-- C-33 -->
- **B-111** `world.socket(e, name, out)` writes the world pose of a socket into `out`. The position is the entity position plus the socket position rotated by the entity rotation. The rotation is the entity rotation times the socket rotation. [src/sim/world/place.js:52-60; test/world-place.test.mjs:76] <!-- C-35 -->
- **B-112** If `out` is omitted, `socket` makes a new `{ p, q }` object. If the entity has no own socket of that name, `socket` throws "world.socket: entity <id> has no socket '<name>'". [src/sim/world/place.js:52-54; test/world-place.test.mjs:76] <!-- C-35 -->
- **B-113** `world.xfPrev(e, out)` writes the prev pose into `out`, or into a new `{ p, q }` object if `out` is omitted. [src/sim/world/place.js:62-66; test/world-place.test.mjs:76] <!-- C-36 -->

### Seat and systems
- **B-114** `installWorld` calls `checkRapier` on `game.physics.rapier` (or null). An uninitialised Rapier therefore fails at `createEngine`. [src/sim/world/install.js:18] <!-- C-38 -->
- **B-115** `seat.open` creates a World with `createWorld(engine, { seed: engine.seed, timer })`, stores it in `seat.current`, and attaches `engine.netPart` when it exists. [src/sim/world/install.js:19-27] <!-- C-39 -->
- **B-116** If the attach throws, the seat clears, the World is disposed and the error propagates. [src/sim/world/install.js:24-25] <!-- C-39 -->
- **B-117** `seat.close` clears `seat.current` and disposes the World if there was one. [src/sim/world/install.js:28] <!-- C-40 -->
- **B-118** `seat.digest` returns the World digest only when a World exists and has more than 0 entities. Otherwise `seat.digest` returns undefined. [src/sim/world/install.js:29] <!-- C-41 -->
- **B-119** `installWorld` adds four systems that run on the current World. `lh.world.swap` runs in stage `input.apply` before `lh.ui`. `lh.physics.step`, `lh.physics.read` and `lh.physics.events` run in stage `physics.world` in that order. [src/sim/world/install.js:31; src/sim/world/install.js:35-37] <!-- C-42 -->
- **B-120** While `engine.loading.active` is true, `lh.physics.step` does not step Rapier, and the read and events systems do nothing. The swap system still runs, so prev catches up with curr. [src/sim/world/install.js:32-37; test/world-step.test.mjs:155] <!-- C-43 -->
- **B-121** `sys.swap` copies curr to prev for all live pool slots. For entities with `partXf`, `sys.swap` also copies each part pose from curr to prev. The call also moves each `rest` value from 2 to 1 and from 1 to 0. [src/sim/world/world.js:393-403; test/world-parts.test.mjs:11; test/world-step.test.mjs:13] <!-- C-177 -->
- **B-122** `sys.step` runs one Rapier step when the World has physics and is not disposed. [src/sim/world/world.js:405] <!-- C-178 -->
- **B-123** `sys.read` copies the Rapier translation and rotation of each dynamic or kinematic body to the curr half of its pool slot. The copy happens when the body is awake, or was awake at the last read. Rapier can sleep a body after it moves it. [src/sim/world/world.js:406-416; test/world-step.test.mjs:13; test/world-step.test.mjs:53] <!-- C-179 -->
- **B-124** After the body read, `sys.read` puts each sleeper back to sleep when its linear speed is under 0.2. The angular speed must also be under 0.5. `sys.read` then empties the sleepers list. [src/sim/world/world.js:417-423; test/world-step.test.mjs:38] <!-- C-180 -->
- **B-125** Rapier 0.21 wakes a body that was inserted asleep on its first step. The sleepers pass in `sys.read` corrects this. [src/sim/world/world.js:417-423; test/world-step.test.mjs:28; doc:docs/field-notes.md:170-174] <!-- C-180 -->
- **B-126** `sys.events` drains the Rapier event queue into engine events when the World has physics and is not disposed. [src/sim/world/world.js:425; test/world-step.test.mjs:65] <!-- C-181 -->
- **B-127** `world.digest()` returns `{ n, sum }`. The `n` value is the entity count. The `sum` value is an FNV-1a checksum in 8 hex digits. [src/sim/world/world.js:427-439; test/world-step.test.mjs:82] <!-- C-182 -->
- **B-128** The checksum covers each entity in id order. For each entity it covers the id and the curr pose when the entity has a pool slot. For a dynamic entity it also covers the linear and angular velocity. The checksum uses float64 bits with no rounding. [src/sim/world/world.js:40-43; src/sim/world/world.js:427-439] <!-- C-182 -->
- **B-129** A 600-step scene with contacts, sensors, sleeping posts and pool slot reuse gives the same result on every run. A tape that clears and rebuilds the World replays exactly. [test/world-replay.test.mjs:42; test/world-replay.test.mjs:57] <!-- C-196 -->

### Rapier wrapper
- **B-130** `mergeParams(params)` returns `PINNED_DEFAULTS` overlaid with `params`. It merges `softBodiesRecovery` field by field. [src/sim/physics/rapier.js:30-33; test/physics-rapier.test.mjs:27] <!-- C-47 -->
- **B-131** `createPhysics` makes a Rapier World with the gravity, sets `timestep` to `1/hz`, writes the merged params, and makes an `EventQueue` with auto-drain true. [src/sim/physics/rapier.js:86-92; test/physics-rapier.test.mjs:27] <!-- C-50 -->
- **B-132** `applyParams` writes every merged key except `softBodiesRecovery` onto `world.integrationParameters`. `applyParams` fills a fresh `softBodiesRecovery` wrapper field by field and assigns it back. [src/sim/physics/rapier.js:45-51] <!-- C-51 -->
- **B-133** `ph.step` runs the Rapier physics pipeline directly when the Rapier World has every pipeline field and `physicsPipeline.step` and `softBodies.len` are functions. The World must also have no soft bodies. Otherwise `ph.step` calls `World.step`. [src/sim/physics/rapier.js:53-65] <!-- C-52 -->
- **B-134** The direct pipeline step gives bit-identical bodies and events to `World.step`. This also holds when bodies are added and removed during the run. [test/physics-rapier.test.mjs:100] <!-- C-55 -->
- **B-135** With a timer, `ph.step` stores the last step time in `stats.stepMs` and adds it to `stats.stepMsTotal`. Without a timer, both stay 0. The timer is a diagnostic only. [src/sim/physics/rapier.js:4; src/sim/physics/rapier.js:72-78; test/physics-rapier.test.mjs:53] <!-- C-53 -->
- **B-136** `ph.free` frees the event queue and the Rapier world and can run more than once. `ph.recreate` frees the old world and makes an empty one with the same settings. [src/sim/physics/rapier.js:79-83; test/physics-rapier.test.mjs:64] <!-- C-54 -->
- **B-137** A step of 30 dynamic bodies allocates under 2 KB of JavaScript memory. [test/physics-rapier.test.mjs:90] <!-- C-56 -->
- **B-138** The World creates its physics object only when a Rapier module exists. [src/sim/world/world.js:53; src/sim/world/world.js:120] <!-- C-92 -->

### Colliders
- **B-139** `shapeDesc` makes a box from `half` `[x, y, z]`, each greater than 0. If `round` is defined, `shapeDesc` makes a rounded box. It throws 'box round must be > 0 (got <value>)' unless `round` is a finite number above 0. [src/sim/physics/colliders.js:13-16; test/physics-colliders.test.mjs:12] <!-- C-58 -->
- **B-140** `shapeDesc` makes a sphere from `r`, a capsule from `halfHeight` and `r`, and a cylinder from `halfHeight` and `r`. Each value must be a finite number greater than 0. [src/sim/physics/colliders.js:8; src/sim/physics/colliders.js:17-20] <!-- C-59 -->
- **B-141** `shapeDesc` makes a convex hull from a flat `points` list. The list needs a multiple of 3 numbers and at least 12 numbers. [src/sim/physics/colliders.js:21-25; test/physics-colliders.test.mjs:25] <!-- C-60 -->
- **B-142** `shapeDesc` makes a triangle mesh from `vertices` and `indices`. Vertices need a multiple of 3 numbers and at least 9. Indices need a multiple of 3 numbers and at least 3. [src/sim/physics/colliders.js:26-30; test/physics-colliders.test.mjs:25] <!-- C-61 -->
- **B-143** `materialFor(entry, overrides)` picks the material id for the part of the entry (default 'body'). It uses the override for the part first, then the override '*', then the material of the entry. [src/sim/physics/colliders.js:35-43; test/physics-colliders.test.mjs:34] <!-- C-65 -->
- **B-144** `applyMaterial` sets friction to the collider friction of the registry (the square root of `phys.friction`) with the Multiply combine rule. It sets restitution with the Max combine rule, and sets the given density. [src/sim/physics/colliders.js:45-51; test/physics-colliders.test.mjs:42] <!-- C-66 -->
- **B-145** Two engine colliders get the geometric mean of their material frictions and the larger restitution. [src/sim/physics/colliders.js:1-5; test/physics-colliders.test.mjs:49; test/physics-colliders.test.mjs:60] <!-- C-67 -->
- **B-146** If a raw game collider has a combine rule of higher priority (Average < Min < Multiply < Max), Rapier keeps that rule. [src/sim/physics/colliders.js:1-5] <!-- C-67 -->
- **B-147** `world.audit()` returns an empty list if there is no physics or the World is disposed. [src/sim/world/world.js:465] <!-- C-188 -->
- **B-148** Otherwise `world.audit()` lists each collider whose friction rule is not Multiply or whose restitution rule is not Max. Each item is `{ handle, entity (id or null), friction, restitution }` with rule names. [src/sim/world/world.js:462-472; test/world-step.test.mjs:165] <!-- C-188 -->

### Events
- **B-149** After each step, the event drain emits every contact event in Rapier drain order, then every sensor event in Rapier drain order. The drain reads contact-force events first and collision events second. [src/sim/physics/events.js:1-3; src/sim/physics/events.js:30-33] <!-- C-68 -->
- **B-150** A contact-force event becomes the event `contact` with data `{ a, b, materials: [ma, mb], impulse, point: [x, y, z] }`. [src/sim/physics/events.js:14-24; test/physics-events.test.mjs:24] <!-- C-69 -->
- **B-151** The `impulse` of a contact event is the total force magnitude divided by `hz`. [src/sim/physics/events.js:24; test/physics-events.test.mjs:24] <!-- C-70 -->
- **B-152** The `point` of a contact event is the first solver contact point of the pair. If the pair has no solver contact, the point is the midpoint of the two bodies, or of the collider when it has no body. If a collider is missing, the point is `[0, 0, 0]`. [src/sim/physics/events.js:9-23; test/physics-events.test.mjs:24] <!-- C-71 -->
- **B-153** In a contact event, `a` and `b` are entity ids, or null for a raw collider that the World does not own. The `materials` entry is null for such a collider. [src/sim/physics/events.js:4; src/sim/physics/events.js:8; src/sim/physics/events.js:24; test/physics-events.test.mjs:49] <!-- C-72 -->
- **B-154** A collision event on a collider that is a sensor becomes the event `sensor` with data `{ sensor, other, on }`. The `on` value is true when the contact starts. If both colliders are sensors, collider 1 is the sensor. [src/sim/physics/events.js:26-29; test/physics-events.test.mjs:58] <!-- C-73 -->
- **B-155** A collision event where neither collider is a sensor emits nothing. A contact-force event is emitted only for colliders that have the contact flag and exceed the threshold. [src/sim/physics/events.js:26-29; test/physics-events.test.mjs:39] <!-- C-74 -->
- **B-156** The drain clears its world reference after each drain, also when a callback throws. [src/sim/physics/events.js:30-33] <!-- C-75 -->
- **B-157** The World emits drained events through `engine.events.adopt` when the engine has it, and through `engine.emit` otherwise. The data object of each event is fresh. [src/sim/world/world.js:507; src/sim/physics/events.js:1-3] <!-- C-76 -->

### Collision groups
- **B-158** `createGroups(names)` accepts at most 16 names. Name `i` gets bit `1 << i`. The default list is empty. [src/sim/physics/groups.js:1-2; src/sim/physics/groups.js:6-15; test/physics-groups.test.mjs:8; test/physics-groups.test.mjs:18] <!-- C-78 -->
- **B-159** `groups.mask(member, filter)` returns `(membership bits << 16 | filter bits)` as an unsigned 32-bit number. An omitted member or filter means every group (0xffff). [src/sim/physics/groups.js:2-3; src/sim/physics/groups.js:16-17; src/sim/physics/groups.js:23; test/physics-groups.test.mjs:8; test/physics-groups.test.mjs:18] <!-- C-80 -->
- **B-160** The groups object is frozen. The groups object has one bit per name and a non-enumerable `mask` function. [src/sim/physics/groups.js:23-24] <!-- C-82 -->

### Heightfield
- **B-161** `heightfieldDesc` takes row-major heights, `heights[iz * nx + ix]` at `(x0 + ix*cell, z0 + iz*cell)`. It reorders them to column-major in a Float32Array. It passes `nz-1` rows and `nx-1` columns (subdivision counts) to Rapier. [src/sim/physics/heightfield.js:1-4; src/sim/physics/heightfield.js:9-13; test/physics-heightfield.test.mjs:8; test/physics-heightfield.test.mjs:22] <!-- C-84 -->
- **B-162** `heightfieldDesc` sets the scale to the full extent `{ x: (nx-1)*cell, y: 1, z: (nz-1)*cell }`. It sets the translation to `(x0 + sx/2, 0, z0 + sz/2)` because Rapier centres the field on its translation. [src/sim/physics/heightfield.js:5; src/sim/physics/heightfield.js:11-13; test/physics-heightfield.test.mjs:8] <!-- C-85 -->
- **B-163** When `fixInternalEdges` is true, `heightfieldDesc` passes the Rapier flag `FIX_INTERNAL_EDGES`. Otherwise it passes undefined. [src/sim/physics/heightfield.js:12; test/world-step.test.mjs:133] <!-- C-86 -->
- **B-164** `world.heightfield` makes a bodiless ground entity. The heightfield collision mask is `groups.mask(g.member, g.filter)` if `groups` is given. Otherwise it is the mask of the group 'ground' if the World declares that group, and otherwise 0xffffffff. [src/sim/world/world.js:441-451; test/world-step.test.mjs:97] <!-- C-183 C-185 -->
- **B-165** The heightfield entity has a frozen `heightfield` field `{ nx, nz, cell, x0, z0 }`. Its one collider has part 'ground', the given material and density 0. The entity has no body and no xf. [src/sim/world/world.js:454-459; test/world-step.test.mjs:97] <!-- C-186 -->
- **B-166** A heightfield counts in `stats.colliders` but not in `stats.bodies`. The World registers it like any entity, with a BODILESS record. [src/sim/world/world.js:458-459; src/sim/world/world.js:474-475] <!-- C-187 -->

### World inputs and stats
- **B-200** `createWorld(engine, opts)` needs `engine.game`. The World takes `hz` from `engine.game.sim.hz`. The World takes the physics block from `engine.game.physics`, which defaults to an empty object. [src/sim/world/world.js:47-48] <!-- C-87 -->
- **B-201** `world.stats` has the getters `entities`, `bodies`, `colliders`, `stepMs` and `stepMsTotal`. The two step values come from the physics timer. The two step values are 0 without physics or after dispose. [src/sim/world/world.js:474-477; test/world-step.test.mjs:155] <!-- C-189 -->

### Fields: wind
- **B-202** `createWind` takes `{ base, gust, zones, seed }`. The defaults are `base` `[0, 0, 0]`, `gust` null, `zones` `[]` and `seed` 1. [src/sim/fields/index.js:12; test/fields.test.mjs:36] <!-- C-198 -->
- **B-203** `wind.at(p, t, out)` writes the result into `out` and returns `out`. The default of `out` is a new `{ x, y, z }` object. [src/sim/fields/index.js:28-33] <!-- C-200 -->
- **B-204** The wind value is the `base`, plus the gust, plus the `v` of each zone box that contains `p`. The box test includes the faces. [src/sim/fields/index.js:28-33; test/fields.test.mjs:36] <!-- C-200 -->
- **B-205** A gust has `amp` (default 0), `scale` (default 20) and `period` (default 4). The gust value is `amp * (2 * noise(p.x / scale, p.z / scale, t / period) - 1)`. [src/sim/fields/index.js:15; src/sim/fields/index.js:30] <!-- C-201 -->
- **B-206** The gust value stays between `-amp` and `amp`. The gust acts along the unit vector of `base`, or along `[1, 0, 0]` when `base` is zero. [src/sim/fields/index.js:16; src/sim/fields/index.js:30-31; test/fields.test.mjs:36] <!-- C-201 -->
- **B-207** The noise is seeded value noise, so the same `seed` gives the same value. With `amp` 0 or no gust, the gust value is 0. [src/sim/fields/index.js:17-26; src/sim/fields/index.js:30; test/fields.test.mjs:36] <!-- C-201 -->

### Fields: setup and system
- **B-208** `createFields(world, opts)` accepts the options `wind`, `aero`, `buoyancy`, `magnet` and `models`. The default `wind` is a calm wind from `createWind()`. [src/sim/fields/index.js:38; src/sim/fields/index.js:55; src/sim/fields/index.js:61] <!-- C-205 -->
- **B-209** The default of `aero` is false. The default of `buoyancy` is null. The default of `magnet` is null. [src/sim/fields/index.js:61] <!-- C-205 -->
- **B-210** The sidecars are `opts.models`, otherwise `engine.game.defs.models`. The fields read their `models` field, or an empty object. [src/sim/fields/index.js:63] <!-- C-205 -->
- **B-211** The first `createFields` call for an engine adds the system `lh.fields` in the stage `pre`. Later calls for the same engine add no system. [src/sim/fields/index.js:39-44; test/fields.test.mjs:91] <!-- C-210 -->
- **B-212** Each step, `lh.fields` runs `step(dt, engine.time.sim)` of every field set of `engine.world`, in creation order. [src/sim/fields/index.js:43; src/sim/fields/index.js:187-191] <!-- C-210 -->
- **B-213** `createFields` adds the field set to the list of its World. It also registers `world.own(() => set.dispose())`. [src/sim/fields/index.js:187-191] <!-- C-211 -->
- **B-214** `set.dispose()` removes the field set from the list and sets `removed` to true. A World `clear` or `dispose` therefore removes the field set. [src/sim/fields/index.js:185; src/sim/fields/index.js:190; test/fields.test.mjs:91] <!-- C-211 -->
- **B-215** When `aero` or a fluid is set, each step visits the entities of `world.with()` in id order. [src/sim/fields/index.js:175] <!-- C-212 -->
- **B-216** The step skips an entity unless the entity has a dynamic body and a `model`. The step also skips an entity whose model has no sidecar `aero` block. [src/sim/fields/index.js:76-78; src/sim/fields/index.js:176-177] <!-- C-212 -->
- **B-217** The magnet pass runs after the aero and buoyancy pass, and only when the option `magnet` is set. [src/sim/fields/index.js:182] <!-- C-224 -->

### Fields: aero
- **B-218** The option `aero` is true or `{ plate, density }`. The `plate` factor defaults to 1.1. [src/sim/fields/index.js:64; test/fields.test.mjs:46] <!-- C-206 -->
- **B-219** The air density is `aero.density`, otherwise the fluid density of the registry material `'air'`, otherwise 1.225. [src/sim/fields/index.js:64] <!-- C-206 -->
- **B-220** The fields group the sidecar aero panels by part and cache the result for each model. [src/sim/fields/index.js:76-91] <!-- C-213 -->
- **B-221** The skin and the airfoil of a part come from the `aero` block of the material of the first collider with that part. If no collider has that part, they come from the first collider. [src/sim/fields/index.js:80-82] <!-- C-213 -->
- **B-222** The skin defaults to 0. The airfoil defaults to null. [src/sim/fields/index.js:84] <!-- C-213 -->
- **B-223** For each part, the fields keep a planform panel and an area-weighted centroid. For an area tie within 1e-9, the panel with the larger `n[1]` is the planform panel. [src/sim/fields/index.js:80-88] <!-- C-214 -->
- **B-224** For a panel, aero finds the world centre and normal. It also finds the relative wind `u`, which is the wind minus the body velocity at the centre. [src/sim/fields/index.js:102-104] <!-- C-215 -->
- **B-225** A panel gets force only when `n.u` is below 0 and `|u|^2` is at least 1e-12. [src/sim/fields/index.js:105; test/fields.test.mjs:46] <!-- C-215 -->
- **B-226** The plate force is `0.5 * rho * |u|^2 * a * plate * c^2` along `-n`. The value `c` is `-n.u / |u|`. [src/sim/fields/index.js:106-107; test/fields.test.mjs:46] <!-- C-215 -->
- **B-227** When the skin is not 0 and the flow tangent to the panel is above 1e-9, the panel also gets a skin force. The force is `0.5 * rho * |u|^2 * a * skin` along that tangent. [src/sim/fields/index.js:108] <!-- C-216 -->
- **B-228** Aero applies each force as an impulse of `force * dt` with `applyImpulseAtPoint` and wake-up true. The plate force acts at the panel centre. [src/sim/fields/index.js:93-99; src/sim/fields/index.js:109] <!-- C-217 -->
- **B-229** A part with an airfoil acts at its area-weighted centroid with the normal of its planform panel. [src/sim/fields/index.js:111-114] <!-- C-218 -->
- **B-230** If `|u|^2` is below 1e-12, a part with an airfoil gets no force and no plate forces. Otherwise `aoa` is `asin(n.u / |u|)` in degrees. [src/sim/fields/index.js:113-115; src/sim/fields/index.js:179] <!-- C-218 -->
- **B-231** When `|aoa|` is at most the airfoil `stall`, the part gets lift `q * cl(aoa)` and drag `q * cd(aoa)`. The value `q` is `0.5 * rho * |u|^2` times the planform area. [src/sim/fields/index.js:116-120; test/fields.test.mjs:54] <!-- C-219 -->
- **B-232** The lift acts along the part of the normal that is across the flow, as a unit vector. The drag acts along the flow. [src/sim/fields/index.js:118-119] <!-- C-219 -->
- **B-233** When `|aoa|` is above `stall`, each panel of the part is a plate instead. [src/sim/fields/index.js:116; src/sim/fields/index.js:179; test/fields.test.mjs:54] <!-- C-219 -->
- **B-234** The `cl` and `cd` curves are lists `[[aoa, value], ...]`. The fields read them with linear interpolation. Outside the first and last `aoa`, the value is that of the end point. [src/sim/fields/index.js:45-50; test/fields.test.mjs:54] <!-- C-220 -->

### Fields: buoyancy
- **B-235** The option `buoyancy` is `{ fluids: [{ material, level, surfaceVel, damping }] }`. The `material` defaults to `'water'` and gives the fluid density. [src/sim/fields/index.js:65-70; test/fields.test.mjs:63] <!-- C-207 -->
- **B-236** The `level` is a number or a function `(x, z, t)` that returns y. The default is 0. The `surfaceVel` is a function `(x, z, t)` with default 0. The `damping` defaults to 1. [src/sim/fields/index.js:68-70] <!-- C-207 -->
- **B-237** The gravity for buoyancy is `-gravity[1]`. The value `gravity` is `engine.game.physics.gravity`, with default `[0, -9.81, 0]`. [src/sim/fields/index.js:71] <!-- C-208 -->
- **B-238** Buoyancy runs only when the gravity value is above 0. [src/sim/fields/index.js:180] <!-- C-208 -->
- **B-239** For each fluid and each panel, buoyancy gets the world centre and `d = centre.y - level(x, z, t)`. It skips the panel when `d` is 0 or more. [src/sim/fields/index.js:122-126; test/fields.test.mjs:63] <!-- C-221 -->
- **B-240** For each other panel, buoyancy adds `d * n_y * a` to the submerged volume. It also adds the moments for the centre of buoyancy. [src/sim/fields/index.js:127-128; test/fields.test.mjs:63] <!-- C-221 -->
- **B-241** When the submerged volume `V` is at most 1e-12, the fluid gives no force. [src/sim/fields/index.js:129] <!-- C-222 -->
- **B-242** Otherwise the fluid applies an upward impulse of `force * dt` at the centre of buoyancy. The force is `rho * g * V - damping * rho * V * heave`. [src/sim/fields/index.js:130-132; test/fields.test.mjs:63] <!-- C-222 -->
- **B-243** The value `heave` is the body velocity y at the centre of buoyancy minus `surfaceVel(x, z, t)`. [src/sim/fields/index.js:131] <!-- C-222 -->
- **B-244** `submerged(e)` returns `min(1, total submerged volume / sidecar volume)` from the last step, summed over the fluids. [src/sim/fields/index.js:180; src/sim/fields/index.js:184; test/fields.test.mjs:63] <!-- C-223 -->
- **B-245** `submerged(e)` returns 0 when the sidecar volume is not above 0. It also returns 0 for an entity that no step has handled. [src/sim/fields/index.js:92; src/sim/fields/index.js:180; src/sim/fields/index.js:184] <!-- C-223 -->

### Fields: magnetism
- **B-246** The option `magnet` is `{ radius, gain, rMin, maxForce }`. The defaults are `radius` 3, `gain` 1, `rMin` 0.1 and `maxForce` 1e5. [src/sim/fields/index.js:72; test/fields.test.mjs:73] <!-- C-209 -->
- **B-247** The magnet pass lists, in World entity id order, each collider whose material has a `magnet` block with `strength` above 0 or `ferrous` above 0. [src/sim/fields/index.js:141-146] <!-- C-224 -->
- **B-248** Each candidate A with `strength` above 0 acts on each other candidate B. The World entity list gives the candidates, with no Rapier query. [src/sim/fields/index.js:136-138; src/sim/fields/index.js:147-151] <!-- C-225 -->
- **B-249** A pair of two magnets counts once. The pass skips a pair when both colliders are on the same body. [src/sim/fields/index.js:151-152; test/fields.test.mjs:85] <!-- C-225 -->
- **B-250** The pass also skips a pair when B has no `strength` and no `ferrous` value. It skips a pair when the distance between the collider positions is above `radius`. [src/sim/fields/index.js:153-155; test/fields.test.mjs:73] <!-- C-225 -->
- **B-251** The distance `r` is `max(d, rMin)`. The direction from A to B is `[0, 1, 0]` when `d` is 0. [src/sim/fields/index.js:156] <!-- C-226 -->
- **B-252** The ferrous force runs only when B has no `strength`. The force on B is `gain * A.strength * B.ferrous / r^4` toward A. [src/sim/fields/index.js:158; src/sim/fields/index.js:163; test/fields.test.mjs:73] <!-- C-226 -->
- **B-253** The dipole-dipole force runs whenever B has `strength` above 0, also when B has `ferrous`. The value `k` is `3 * gain / r^4`. [src/sim/fields/index.js:158-162; test/fields.test.mjs:85] <!-- C-226 -->
- **B-266** The moment of each collider lies along its +y axis and has the size of its `strength`. [src/sim/fields/index.js:139; src/sim/fields/index.js:159] <!-- C-226 -->
- **B-254** The pass caps the force at `maxForce`. It applies the impulse `force * dt` at the collider position of B on the body of B. [src/sim/fields/index.js:164-165; test/fields.test.mjs:73] <!-- C-227 -->
- **B-255** The pass applies the opposite impulse on the body of A. A collider with no parent body gets no impulse. [src/sim/fields/index.js:165-166] <!-- C-227 -->

### Fields: dependencies and checks
- **B-256** The fields read `world.engine`, `world.materials`, `world.with`, `world.materialOf` and `world.own`. They read the sidecar block `aero` `{ panels, volume }`. [src/sim/fields/index.js:57-70; src/sim/fields/index.js:76-91; src/sim/fields/index.js:141-146; src/sim/fields/index.js:190] <!-- C-228 -->
- **B-257** The registry blocks `aero`, `fluid` and `magnet` and the materials `'air'` and `'water'` supply the field values. [src/sim/fields/index.js:64-67; src/sim/fields/index.js:82-84; src/sim/fields/index.js:144] <!-- C-228 -->
- **B-258** A cube face-on at 10 m/s gets one plate force `0.5 * 1.225 * 100 * 1 * 1.1`. A cube that moves with the wind gets no force. [test/fields.test.mjs:46] <!-- C-229 -->
- **B-259** A half-density cube floats with half its volume under water, and `submerged(e)` is about 0.5. [test/fields.test.mjs:63] <!-- C-229 -->

## Data and state
| Item | Description | Evidence |
| --- | --- | --- |
| Transform pool | One Float64Array with `STRIDE` 14 floats per pool slot: prev pose `[px,py,pz,qx,qy,qz,qw]` at offset `PREV` 0, then curr pose at offset `CURR` 7. | [src/sim/world/pool.js:1-5] <!-- C-1 --> |
| `pool.buf` | The pool replaces `pool.buf` on growth. Readers must read `pool.buf` on each use. | [src/sim/world/pool.js:4; src/sim/world/pool.js:25] <!-- C-9 --> |
| Entity kinds | DYNAMIC 0, KINEMATIC 1, FIXED 2, BODILESS -1. | [src/sim/world/pool.js:9] <!-- C-11 --> |
| `INTERNAL` symbol | Holds per-entity World internals. The property is non-enumerable, so `Object.keys`, JSON and game code do not see it. | [src/sim/world/pool.js:6-8; src/sim/world/world.js:75] <!-- C-12 --> |
| `e.xf` | Frozen `{ p, q, slot }`. The `p` and `q` accessors read `pool.buf` on each access, on the curr half of the pool slot. | [src/sim/world/pool.js:57-71; test/world-pool.test.mjs:41] <!-- C-13 --> |
| Dead `e.xf` | After despawn, a frozen copy of the last curr pose `{ p, q }` with no pool slot. The copy does not follow the pool slot after reuse. | [src/sim/world/pool.js:73-80; test/world-pool.test.mjs:56] <!-- C-16 --> |
| `world.xf` | Frozen object with a `pool` getter that returns the current `pool.buf`, and `stride` 14. | [src/sim/world/world.js:482] <!-- C-17 --> |
| `e.body`, `e.colliders` | Non-enumerable but writable. A failing assert therefore does not walk the Rapier graph. | [src/sim/world/world.js:17-18; src/sim/world/world.js:192] <!-- C-127 --> |
| `world.R`, `rapier`, `engine`, `xf` | Non-enumerable properties of the World. | [src/sim/world/world.js:505] <!-- C-191 --> |
| Entity print form | 'Entity#<id> [<tags joined with ", ">, net:<net>#<netId>]' through the Node inspect symbol. The net suffix shows only when `e.net` is defined. The '#<netId>' part shows only when `e.netId` is defined. The separator before the net suffix shows only when the entity has tags. The World prints 'World serial <n>, <m> entities'. | [src/sim/world/world.js:16; src/sim/world/world.js:76; src/sim/world/world.js:485] <!-- C-135 --> |
| Spawn label | The tags joined with ',' for a non-empty `tags` array, else the model, else 'entity'. | [src/sim/world/world.js:27] <!-- C-96 --> |
| Groups object | Frozen. One bit per name. `ALL` is 0xffff. | [src/sim/physics/groups.js:4; src/sim/physics/groups.js:23-24] <!-- C-77 C-82 --> |

## Configuration
| Key | Default | Effect | Evidence |
| --- | --- | --- | --- |
| `opts.rapier`, else `game.physics.rapier` | null | The Rapier module. Without it the World holds bodiless entities only. | [src/sim/world/world.js:49; test/world-entities.test.mjs:128] <!-- C-88 --> |
| `opts.materials`, else `game.defs.materials` | base library | The material registry. The World builds the base library once on first need. | [src/sim/world/world.js:44-45; src/sim/world/world.js:50] <!-- C-89 --> |
| `opts.models`, else `game.defs.models` | none | The sidecars. The World reads their `models` field, or an empty object. | [src/sim/world/world.js:51] <!-- C-90 --> |
| `opts.groups`, else `game.physics.groups` | `[]` | The collision group names. | [src/sim/world/world.js:52] <!-- C-91 --> |
| `opts.gravity`, `opts.params` (else the `game.physics` values) and `opts.timer` (else null) | gravity `[0, -9.81, 0]`, timer null | Rapier gravity, integration parameters and the step timer. Only `gravity` and `params` fall back to `game.physics`. | [src/sim/world/world.js:53; src/sim/physics/rapier.js:67] <!-- C-91 C-49 --> |
| `createPhysics` `hz` | none | Step rate. The timestep is `1/hz`. The call needs `hz` above 0. | [src/sim/physics/rapier.js:67-68] <!-- C-49 --> |
| `createPool` capacity | 64 pool slots | Start capacity. The pool doubles when full. | [src/sim/world/pool.js:13-17] <!-- C-2 --> |
| `PINNED_DEFAULTS` rigid values | `lengthUnit` 1, `normalizedAllowedLinearError` f32(0.005), `normalizedPredictionDistance` f32(0.02), `numSolverIterations` 4, `numInternalPgsIterations` 1, `maxCcdSubsteps` 1 | The Rapier 0.21 integration parameters that `createPhysics` writes. | [src/sim/physics/rapier.js:5-13; test/physics-rapier.test.mjs:15] <!-- C-44 --> |
| `PINNED_DEFAULTS` soft body values | `softBodiesResweepStrain` 0.75, `softBodiesMaxExtraSubsteps` 4, `softBodiesContactStiffening` 4, `softBodiesFemLinearTolerance` f32(1e-5), `softBodiesFemMaxLinearIterations` 20, `softBodiesFemMaxDenseDofs` 600 | The pinned soft body parameters. | [src/sim/physics/rapier.js:14-18] <!-- C-45 --> |
| `PINNED_DEFAULTS.softBodiesRecovery` | 27 fields: 20 booleans and 7 numbers. The numbers are `recoveryPace` 0.5, `overlapConstraintPace` 1, `overlapKeptDepth` 0, `overlapProgressMargin` f32(0.02), `overlapSplit` 3, `overlapPatience` 240, `overlapPatchConstraints` 2. | The boolean list is in the source. | [src/sim/physics/rapier.js:19-27] <!-- C-46 --> |
| `heightfield` option `fixInternalEdges` | false | Passes the Rapier flag `FIX_INTERNAL_EDGES` when true. | [src/sim/physics/heightfield.js:5; src/sim/physics/heightfield.js:12; test/world-step.test.mjs:133] <!-- C-86 --> |
| `heightfield` options `x0`, `z0`, `tags` | 0, 0, `['heightfield']` | Origin and tags of the ground entity. | [src/sim/world/world.js:442] <!-- C-183 --> |
| `body` option keys | none | `type`, `lock`, `ccd`, `linearDamping`, `angularDamping`, `sleep`, `canSleep`, `mass`, `massProps`. Other keys throw 'body.<key> is not a body option'. A wrong type throws "body type must be 'dynamic', 'kinematic' or 'fixed' (got <type>)". A string means `{ type }`. | [src/sim/world/world.js:23-24; src/sim/world/world.js:113-118] <!-- C-100 --> |
| `place` options | `keep` false, `local` `[0, 0, 0]` | `place(e, target, opts)` takes `{ at }` or `{ rel, local }`, with `{ yaw, q, keep }`. | [src/sim/world/place.js:8; src/sim/world/place.js:19-31] <!-- C-20 --> |
| `createWind` options | `base` `[0, 0, 0]`, `gust` null, `zones` `[]`, `seed` 1 | Wind base, gust `{ amp, scale, period }`, zone boxes `{ min, max, v }` and noise seed. | [src/sim/fields/index.js:12; src/sim/fields/index.js:15] <!-- C-198 C-201 --> |
| gust `amp`, `scale`, `period` | 0, 20, 4 | Gust size, space scale and time scale. | [src/sim/fields/index.js:15] <!-- C-201 --> |
| `createFields` options | `wind` calm, `aero` false, `buoyancy` null, `magnet` null | The fields to run. The option `models` gives the sidecars. | [src/sim/fields/index.js:55; src/sim/fields/index.js:61; src/sim/fields/index.js:63] <!-- C-205 --> |
| `aero` option | `plate` 1.1, `density` from material `'air'`, else 1.225 | `aero` is true or `{ plate, density }`. | [src/sim/fields/index.js:64] <!-- C-206 --> |
| `buoyancy` option | `material` `'water'`, `level` 0, `surfaceVel` 0, `damping` 1 | `{ fluids: [{ material, level, surfaceVel, damping }] }`. | [src/sim/fields/index.js:65-70] <!-- C-207 --> |
| `magnet` option | `radius` 3, `gain` 1, `rMin` 0.1, `maxForce` 1e5 | Magnet range, scale, smallest distance and force cap. | [src/sim/fields/index.js:72] <!-- C-209 --> |

## Errors and limits
- **B-167** `world.spawn`, `clear`, `joint`, `heightfield`, `place` and the function-only form `own(fn)` throw 'world: disposed' after `dispose`. [src/sim/world/world.js:61; src/sim/world/world.js:102; src/sim/world/world.js:316; src/sim/world/world.js:253; src/sim/world/world.js:351; src/sim/world/world.js:443; test/world-entities.test.mjs:90] <!-- C-93 -->
- **B-168** `world.add`, `remove`, `own(e, fn)`, `setMaterial` and `partXfPrev` throw the not-live error for a dead entity or an entity of another World. The text is 'world.<name>: not a live entity of this World'. `world.joint` throws the same text for a live-bodied entity of another World. [src/sim/world/world.js:62-66; src/sim/world/world.js:352-353] <!-- C-94 -->
- **B-169** `world.place`, `socket` and `xfPrev` throw 'world.<name>: not a live entity of this World' for an entity that is not live here. [src/sim/world/place.js:13-15; test/world-place.test.mjs:90] <!-- C-18 -->
- **B-170** An entity with no pool slot makes `place`, `socket` and `xfPrev` throw an error. The text is 'world.<name>: entity <id> has no xf (spawn it with a body or xf: true)'. [src/sim/world/place.js:16; test/world-place.test.mjs:90] <!-- C-19 -->
- **B-171** A bad `local` makes `place` throw 'world.place: local must be [x, y, z]'. A bad `at` makes `place` throw 'world.place: at must be [x, y, z]'. [src/sim/world/place.js:24; src/sim/world/place.js:29] <!-- C-22 -->
- **B-172** If the target has neither `rel` nor `at`, `place` throws an error. The text is 'world.place: target must be { at: [x, y, z] } or { rel: entity, local: [x, y, z] }'. [src/sim/world/place.js:31; test/world-place.test.mjs:90] <!-- C-23 -->
- **B-173** `world.with` throws 'world.with: at most 4 parts' for more than 4 arguments. `world.with` throws 'world.with: parts are strings' for a part that is not a string. [src/sim/world/world.js:262-271] <!-- C-150 -->
- **B-174** `world.add` throws "world.add: '<part>' cannot be added after spawn" for `id`, `tags`, `model`, `body`, `colliders`, `sockets` and `heightfield`. [src/sim/world/world.js:22; src/sim/world/world.js:280; test/world-entities.test.mjs:62] <!-- C-154 -->
- **B-175** `world.add` throws "world.add: '<part>' needs a value" when the value is undefined. `world.add` throws a distinct error for a bad `partXf` value. [src/sim/world/world.js:281; src/sim/world/world.js:284] <!-- C-154 C-156 -->
- **B-176** `world.remove` throws "world.remove: '<part>' cannot be removed (despawn the entity)" for the fixed parts. [src/sim/world/world.js:301; test/world-entities.test.mjs:62] <!-- C-159 -->
- **B-177** `world.own(e, fn)` throws 'world.own: needs a function' if `fn` is not a function. [src/sim/world/world.js:318] <!-- C-164 -->
- **B-178** `world.joint` checks the bodies first. A dead entity has no body, so the call throws 'world.joint: both entities need a body'. The call throws 'world.joint: needs a descriptor { type, a, b, axis?, limits? } or Rapier JointData' when `desc` is not an object. [src/sim/world/world.js:352-354; test/world-joints.test.mjs:88] <!-- C-166 -->
- **B-179** `world.joint` throws 'world.joint: unknown type "<type>" (one of spherical, revolute, fixed, prismatic)' for another type. The type is shown as JSON. [src/sim/world/world.js:324; src/sim/world/world.js:330; test/world-joints.test.mjs:88] <!-- C-167 -->
- **B-180** `world.joint` throws these errors, each with the prefix 'world.joint: '. The texts are 'a <type> joint takes no axis' and 'a <type> joint takes no limits'. Other texts are 'a <type> joint needs an axis [x, y, z]' and 'axis must be non-zero'. The last text is 'limits must be [lo, hi] finite with lo <= hi, got <value>'. [src/sim/world/world.js:331-346; test/world-joints.test.mjs:88] <!-- C-169 C-170 -->
- **B-181** `world.setMaterial` throws "world.setMaterial: unknown material '<id>'" when there is no registry or the id is not a registry material. [src/sim/world/world.js:365; test/world-bodies.test.mjs:139] <!-- C-172 -->
- **B-182** `world.setMaterial` throws "world.setMaterial: entity <id> has no collider on part '<part>'" when no collider matches. [src/sim/world/world.js:376] <!-- C-172 -->
- **B-183** A dynamic entity without `massProps` and a material with density not above 0 make `world.setMaterial` throw an error. The text is "world.setMaterial: '<id>' has zero density and entity <id> is dynamic without massProps". [src/sim/world/world.js:367] <!-- C-173 -->
- **B-184** `world.partXfPrev` throws "world.partXfPrev: entity <id> has no part '<name>'" for an unknown part. [src/sim/world/world.js:497] <!-- C-193 -->
- **B-185** `world.heightfield` throws errors with the prefix "world: 'heightfield' ". The causes are tags that are not an array, no Rapier module ('needs a body but the game has no physics.rapier'), and no registry. [src/sim/world/world.js:444-447] <!-- C-184 -->
- **B-186** `world.heightfield` also throws for a material that is not a registry material ("unknown material '<id>'"), for a bad group, and for any `heightfieldDesc` error. [src/sim/world/world.js:448-453; test/physics-heightfield.test.mjs:39] <!-- C-184 -->
- **B-187** `heightfieldDesc` throws 'heightfield: nx and nz must be integers >= 2 (got <nx>, <nz>)'. It throws 'heightfield: cell must be > 0 (got <cell>)'. It throws 'heightfield: heights must hold nx*nz = <n> values (got <length>)'. [src/sim/physics/heightfield.js:6-8; test/physics-heightfield.test.mjs:39] <!-- C-83 -->
- **B-188** `shapeDesc` throws 'box half must be three sizes > 0 (got <half>)'. It throws 'hull needs at least 4 points as [x, y, z, ...] (got <n> numbers)'. It throws 'mesh needs vertices and triangle indices (got <nv> vertex numbers, <ni> indices)'. [src/sim/physics/colliders.js:14; src/sim/physics/colliders.js:23; src/sim/physics/colliders.js:28; test/physics-colliders.test.mjs:25] <!-- C-58 C-60 C-61 -->
- **B-189** The shape 'ball' throws "unknown collider shape 'ball' (use 'sphere')". Any other unknown shape throws "unknown collider shape '<shape>'". [src/sim/physics/colliders.js:18; src/sim/physics/colliders.js:31; test/physics-colliders.test.mjs:25] <!-- C-62 C-63 -->
- **B-190** A size value that is not a finite number greater than 0 throws '<what> must be > 0 (got <value>)'. An example is 'sphere r must be > 0 (got 0)'. [src/sim/physics/colliders.js:8] <!-- C-64 -->
- **B-191** `createGroups` throws 'physics: groups must be an array of names' for names that are not an array. It throws 'physics: at most 16 groups (got <n>)' for more than 16 names. [src/sim/physics/groups.js:7-8; test/physics-groups.test.mjs:23] <!-- C-79 -->
- **B-192** `createGroups` throws 'physics: group <i> must be a non-empty string', "physics: group 'mask' is reserved" and "physics: group '<n>' is declared twice". [src/sim/physics/groups.js:11-13; test/physics-groups.test.mjs:23] <!-- C-79 -->
- **B-193** `groups.mask` throws 'physics: groups.<member|filter> must be an array of names' for a value that is not an array. `groups.mask` throws "physics: group '<n>' is not declared" for an unknown name. [src/sim/physics/groups.js:18-20; test/physics-groups.test.mjs:23] <!-- C-81 -->
- **B-194** `mergeParams` throws 'physics: params.<key> is not a Rapier 0.21 integration parameter' for a key that is not in `PINNED_DEFAULTS`. [src/sim/physics/rapier.js:31; test/physics-rapier.test.mjs:48] <!-- C-47 -->
- **B-195** `checkRapier(R)` returns for null or undefined. It throws 'physics: physics.rapier must be the @dimforge/rapier3d-compat module' when `R.World` is not a function. [src/sim/physics/rapier.js:38-39; test/physics-rapier.test.mjs:76] <!-- C-48 -->
- **B-196** `checkRapier` throws 'physics: await RAPIER.init() before createEngine' when `new R.World` throws. `checkRapier` frees the test world. [src/sim/physics/rapier.js:40-42; test/physics-rapier.test.mjs:83] <!-- C-48 -->
- **B-197** `createPhysics` throws 'physics: hz must be > 0 (got <hz>)' unless `hz` is greater than 0. [src/sim/physics/rapier.js:68; test/physics-rapier.test.mjs:39] <!-- C-49 -->
- **B-198** `checkPhysics(p, fail)` fails in five cases. The cases are `physics` not an object, `gravity` not three finite numbers, `params` not an object, a `mergeParams` error and a `createGroups` error. [src/sim/world/install.js:9-14] <!-- C-37 -->
- **B-199** `checkPhysics` changes the prefix 'physics: params.' to 'physics.params.' and the prefix 'physics: ' to 'physics.groups: ' in the error texts. [src/sim/world/install.js:13-14] <!-- C-37 -->
- **B-260** `createWind` throws 'wind: base must be [x, y, z]' unless `base` is three finite numbers. [src/sim/fields/index.js:13; test/fields.test.mjs:36] <!-- C-199 -->
- **B-261** `createWind` throws 'wind: a zone is { min, max, v }, each [x, y, z]' for a bad zone. A zone is bad when its `min`, `max` or `v` is not three finite numbers. [src/sim/fields/index.js:14] <!-- C-199 -->
- **B-262** `createFields` throws "fields: the World has no engine (world.engine): create fields on a scene World" when the World has no engine. [src/sim/fields/index.js:7; src/sim/fields/index.js:58-59] <!-- C-203 -->
- **B-263** `createFields` throws "fields: unknown option '<key>' (wind, aero, buoyancy, magnet, models)" for any other option key. [src/sim/fields/index.js:55; src/sim/fields/index.js:60; test/fields.test.mjs:91] <!-- C-203 -->
- **B-264** `createFields` throws 'fields: wind must be a createWind() field' when `wind.at` is not a function. [src/sim/fields/index.js:62; test/fields.test.mjs:91] <!-- C-204 -->
- **B-265** `createFields` throws "fields: fluid material '<id>' has no fluid block" when the fluid material is missing from the registry or has no fluid block. The default fluid material is 'water'. [src/sim/fields/index.js:65-67; test/fields.test.mjs:91] <!-- C-204 -->

## Dependencies
- **Internal:** the [core spec](core.md) owns the engine, the stages, the events and `engine.netPart`. The core imports `installWorld` and `checkPhysics`. [src/sim/world/install.js:17-30] <!-- C-39 -->
- **Internal:** the [defs and kits spec](defs-and-kits.md) owns `defineMaterials`, `validateCollider` and the registry methods `has` and `collider`. The World imports `defineMaterials` and `validateCollider`. The World calls `has` and `collider` on the registry. [src/sim/world/world.js:12-13; src/sim/world/world.js:153-154] <!-- C-89 C-115 -->
- **Internal:** `world.js` imports `qFromYaw` and `qnorm` from `src/core/math.js`. `place.js` imports `rotate`, `qmul`, `qFromYaw` and `qnorm` from the same file. [src/sim/world/world.js:14; src/sim/world/place.js:6] <!-- C-24 -->
- **Internal:** the fields read the registry blocks `aero`, `fluid` and `magnet` from the [defs and kits spec](defs-and-kits.md). They also read the sidecar block `aero`. The `src/index.sim.js` file exports `createWind`, `createFields` and `FIELDS_SYSTEM`. [src/sim/fields/index.js:57-91; src/index.sim.js:27] <!-- C-228 C-198 C-202 -->
- **External:** `@dimforge/rapier3d-compat` 0.21.x, injected as `game.physics.rapier`. A test pins the 0.21.x version. [src/sim/physics/rapier.js:39; test/physics-fixtures.test.mjs:13] <!-- C-48 C-57 -->

<!-- related-specs -->
Related specs:

- Imports: [Engine core](core.md)
- Imports: [Definitions and kits](defs-and-kits.md)
- Imported by: [Engine core](core.md)
- Imported by: [CLI, tools and package surface](tools-and-package.md)

## Open questions and discrepancies
- `docs/spec.md` M-14 says the fields allocate nothing. The fields reuse their own objects and arrays. Only the Rapier getter vectors (`translation`, `rotation`, `linvel`, `angvel`, `parent`) are fresh in each step. [doc:docs/spec.md:181; src/sim/fields/index.js:93-94; src/sim/fields/index.js:139-145; src/sim/fields/index.js:149; src/sim/fields/index.js:178]
- Open question: why do the sleepers thresholds use 0.2 m/s and 0.5 rad/s? The code comment says only that they come from Rally. [src/sim/world/world.js:417-422]
- Open question: field note 124 says no test guards the read of a body that fell asleep in the step that moved it. The status is open. [doc:docs/field-notes.md:833-837]

## Evidence index
- `src/sim/world/world.js`: the World, spawn, despawn, queries, joints, material swap, step pieces, digest, heightfield, audit.
- `src/sim/world/pool.js`: the transform pool, `xf` accessors and entity kinds.
- `src/sim/world/place.js`: `place`, `socket` and `xfPrev`.
- `src/sim/world/install.js`: the World seat, the four systems and `checkPhysics`.
- `src/sim/physics/rapier.js`: pinned parameters, `checkRapier`, the step wrapper.
- `src/sim/physics/colliders.js`, `events.js`, `groups.js`, `heightfield.js`: shapes and materials, event drain, groups, heightfield layout.
- `src/sim/fields/index.js`: `createWind`, `createFields`, the `lh.fields` system, aero, buoyancy and magnetism.
- `test/fields.test.mjs`: analytic checks of wind, aero, airfoil lift, buoyancy and magnet forces.
