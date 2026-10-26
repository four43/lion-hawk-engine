// kit-vehicle (sim half, design §7.3): two backends on a World entity with the same wheel specs and contact readback;
// their controls differ (raycast: steer, engine, brake, slip, side; tire: steer, engine and brake as torques). 'raycast' (the default) is Rapier's ray-cast vehicle controller (L-1: car.controller is the real one).
// 'tire' (design §3.5): the kit casts each wheel's ray, runs its spring and damper, and steps the tire model
// (./tire.js, Magic Formula from the ground's tire block) and the wheel's spin `substeps` times per step. The kit owns the wiring: wheels from body-space points or sockets, per-wheel controls, one update per
// step before 'lh.physics.step', and contact readback. Tuning stays game-side: a game system before VEHICLE_SYSTEM calls
// car.set(); one after it (and before 'lh.physics.step') may read car.wheels and add its own impulses.
// Sim-pure (L-3): Rapier is world.rapier, never an import.

import { tireStep, surfaceOf, DEFAULT_SURFACE } from './tire.js';
export { createPowertrain, ENGINE_PRESETS } from './powertrain.js';

export const VEHICLE_SYSTEM = 'lh.kit.vehicle';
const CARS = new WeakMap();    // World → its vehicles, updated in creation order
const ENGINES = new WeakSet(); // engines that already run VEHICLE_SYSTEM
const AXIS = { x: 0, z: 2 };
// engine force > 0 drives the chassis forward with these axles (checked on Rapier 0.21.0)
const AXLE = { x: { x: 0, y: 0, z: 1 }, z: { x: -1, y: 0, z: 0 } };
const DOWN = { x: 0, y: -1, z: 0 };
const C = 5; // controls per wheel: steer, engine, brake, slip, side

const fail = m => { throw new Error(`vehicle: ${m}`); };
const label = e => e?.model ?? ((e?.tags && [...e.tags].join(',')) || `entity ${e?.id}`);
const xyz = p => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x, y: p.y, z: p.z });
// A named wheel's part pose for view sync (3g Task 13b, 3c partXf), in the chassis frame: the hub (connection point moved
// `suspension` down the ray), steered about +y, then rolled about the axle by -rotation (a forward roll moves the bottom back).
function partPose(o, at, w, rot, axle) {
  o.p.x = at.x; o.p.y = at.y - w.suspension; o.p.z = at.z;
  const sy = Math.sin(w.steering / 2), cy = Math.cos(w.steering / 2), sr = Math.sin(-rot / 2), bw = Math.cos(-rot / 2);
  const bx = axle.x * sr, bz = axle.z * sr; // the axle has no y
  o.q.x = cy * bx + sy * bz; o.q.y = sy * bw; o.q.z = cy * bz - sy * bx; o.q.w = cy * bw;
}

function install(engine) {
  if (ENGINES.has(engine)) return;
  ENGINES.add(engine);
  engine.system(VEHICLE_SYSTEM, (en, dt) => {
    const w = en.world, list = w && CARS.get(w);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i].update(dt);
  }, { stage: 'physics.world', before: ['lh.physics.step'] });
}

// rayGroups → a Rapier InteractionGroups u32, or undefined (no group filter). member [] means every group: a ray with
// no membership would hit nothing. That reading is for this ray filter ONLY: colliders follow 3c, where an explicit
// member [] means none, so [] never reaches world.groups.mask. An omitted member or filter means every group (3c).
function rayMask(world, rg) {
  if (rg === undefined) return undefined;
  const { member, filter } = rg;
  for (const n of (member ?? []).concat(filter ?? [])) if (n === 'mask' || !Object.hasOwn(world.groups, n)) fail(`rayGroups names undeclared group '${n}'`);
  return world.groups.mask(member?.length ? member : undefined, filter) >>> 0;
}

export function createVehicle(world, e, opts = {}) {
  const engine = world?.engine;
  if (!engine) fail('the World has no engine (world.engine): create vehicles on a scene World');
  if (!e?.body) fail(`'${label(e)}' has no body`);
  if (!e.body.isDynamic()) fail(`'${label(e)}' needs a dynamic body`);
  const { wheels: specs, rayGroups, forward = 'x', terrain = null, tyre = 'rubber', grip = false, backend = 'raycast', substeps = 'auto' } = opts;
  if (backend !== 'raycast' && backend !== 'tire') fail("backend must be 'raycast' or 'tire'");
  if (backend === 'tire' && substeps !== 'auto' && !(Number.isInteger(substeps) && substeps >= 1 && substeps <= 64)) fail("substeps must be 'auto' or an integer in 1..64");
  if (!Array.isArray(specs) || specs.length === 0) fail(`'${label(e)}' needs at least one wheel`);
  if (!Object.hasOwn(AXIS, forward)) fail(`forward must be 'x' or 'z' (got ${forward})`);
  const reg = world.materials;
  if (!reg.has(tyre)) fail(`unknown tyre material '${tyre}'`);
  const mask = rayMask(world, rayGroups);
  const points = specs.map((s, i) => {
    const at = s.at ?? (s.socket !== undefined ? e.sockets?.[s.socket]?.p : undefined);
    if (!at) fail(s.socket !== undefined ? `wheel ${i}: socket '${s.socket}' not on '${label(e)}'` : `wheel ${i} needs at or socket`);
    if (!(s.radius > 0)) fail(`wheel ${i}: radius must be > 0 (got ${s.radius})`);
    return xyz(at);
  });
  const parts = specs.map((s, i) => {
    if (s.part === undefined) return null;
    if (typeof s.part !== 'string' || s.part === '') fail(`wheel ${i}: part must be a model part name (got ${s.part})`);
    if (specs.findIndex(t => t.part === s.part) !== i) fail(`wheel ${i}: part '${s.part}' is used twice`);
    return s.part;
  });

  if (backend === 'tire') return tireCar(world, e, { specs, points, parts, mask, forward, terrain, tyre, substeps, engine });
  const vc = world.rapier.createVehicleController(e.body);
  vc.setIndexForwardAxis = AXIS[forward]; // Rapier 0.21: a property setter with a method's name (read back as indexForwardAxis)
  const n = specs.length, ctl = new Float64Array(n * C), axle = AXLE[forward];
  const wheels = specs.map((s, i) => {
    const sus = s.suspension ?? {};
    vc.addWheel(points[i], DOWN, axle, sus.rest ?? 0.3, s.radius);
    if (sus.stiffness !== undefined) vc.setWheelSuspensionStiffness(i, sus.stiffness);
    if (sus.compression !== undefined) vc.setWheelSuspensionCompression(i, sus.compression);
    if (sus.relaxation !== undefined) vc.setWheelSuspensionRelaxation(i, sus.relaxation);
    if (sus.travel !== undefined) vc.setWheelMaxSuspensionTravel(i, sus.travel);
    if (sus.maxForce !== undefined) vc.setWheelMaxSuspensionForce(i, sus.maxForce);
    ctl[i * C + 3] = s.slip ?? vc.wheelFrictionSlip(i);          // Rapier's own defaults unless the spec sets them
    ctl[i * C + 4] = s.side ?? vc.wheelSideFrictionStiffness(i);
    return { front: !!s.front, radius: s.radius, inContact: false, point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 },
      material: null, pair: null, friction: 1, suspension: 0, steering: 0, load: 0 };
  });

  // The ground under a wheel (M-10): the terrain's materialAt at the contact point when the ray hit the terrain,
  // else the hit collider's material. The pair (tyre, ground) is the registry's cached frozen entry (D4).
  const tHandle = terrain ? terrain.entity.colliders[0].collider.handle : -1;
  const ground = (i, w) => {
    if (!w.inContact) { w.material = null; w.pair = null; w.friction = 1; return; }
    const hit = vc.wheelGroundObject(i), h = hit ? hit.handle : -1;
    const id = terrain && h === tHandle ? terrain.materialAt(w.point.x, w.point.z) : h >= 0 ? (world.materialOf(h) ?? null) : null;
    w.material = id;
    w.pair = id ? reg.pair(tyre, id) : null;
    w.friction = w.pair ? w.pair.friction : 1;
  };
  if (parts.some(p => p !== null)) world.add(e, 'partXf', parts.filter(p => p !== null)); // merges with the game's own names
  const poses = parts.map(p => (p === null ? null : e.partXf[p])); // the World's objects, written in place every step
  const car = {
    controller: vc, entity: e, wheels, tyre, removed: false,
    set(i, c) {
      if (!(i >= 0 && i < n)) fail(`wheel ${i} out of range 0..${n - 1}`);
      const k = i * C;
      if (c.steer !== undefined) ctl[k] = c.steer;
      if (c.engine !== undefined) ctl[k + 1] = c.engine;
      if (c.brake !== undefined) ctl[k + 2] = c.brake;
      if (c.slip !== undefined) ctl[k + 3] = c.slip;
      if (c.side !== undefined) ctl[k + 4] = c.side;
      return car;
    },
    // called by VEHICLE_SYSTEM once per step; games do not call it
    update(dt) {
      for (let i = 0; i < n; i++) {
        const k = i * C, g = grip ? wheels[i].friction : 1; // the last step's pair friction; x 1 keeps values bit-exact
        vc.setWheelSteering(i, ctl[k]); vc.setWheelEngineForce(i, ctl[k + 1]); vc.setWheelBrake(i, ctl[k + 2]);
        vc.setWheelFrictionSlip(i, ctl[k + 3] * g); vc.setWheelSideFrictionStiffness(i, ctl[k + 4] * g);
      }
      vc.updateVehicle(dt, undefined, mask); // the controller already leaves its own chassis out of the wheel rays
      for (let i = 0; i < n; i++) {
        const w = wheels[i];
        w.inContact = vc.wheelIsInContact(i);
        vc.wheelContactPoint(i, w.point); vc.wheelContactNormal(i, w.normal);
        w.suspension = vc.wheelSuspensionLength(i) ?? 0; w.steering = vc.wheelSteering(i) ?? 0; w.load = vc.wheelSuspensionForce(i) ?? 0;
        ground(i, w);
        if (poses[i] !== null) partPose(poses[i], points[i], w, vc.wheelRotation(i) ?? 0, axle);
      }
    },
  };
  let list = CARS.get(world);
  if (!list) CARS.set(world, list = []);
  list.push(car);
  // despawn and clear() free the controller (3c runs own() callbacks while this Rapier world is still alive)
  const rw = world.rapier;
  world.own(e, () => {
    const k = list.indexOf(car);
    if (k !== -1) list.splice(k, 1);
    if (!car.removed) { car.removed = true; rw.removeVehicleController(vc); }
  });
  install(engine);
  return car;
}

// ---- the tire backend ----
const G = 9.81;
// the tire and spin integration is explicit: stable at 1/1920 s (240 Hz x 8 substeps), so 'auto' substeps keep h there
const MAX_H = 1 / 1920;
const DRAG = { fade: 2, v: 18 }; // surface drag (grass, snow, sand): drag Fz tanh(v / 2) (1 + (v / 18)^2) against the ground speed
const UP = { x: 0, y: 1, z: 0 }, FWD = { x: { x: 1, y: 0, z: 0 }, z: { x: 0, y: 0, z: 1 } };
const v3 = () => ({ x: 0, y: 0, z: 0 });
const rot = (q, v, o) => { // o = q v q^-1
  const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  o.x = v.x + q.w * tx + q.y * tz - q.z * ty; o.y = v.y + q.w * ty + q.z * tx - q.x * tz; o.z = v.z + q.w * tz + q.x * ty - q.y * tx; return o;
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const CONTROLS = ['steer', 'engine', 'brake'];

// controls: steer (rad, + = left), engine (drive torque at the wheel, N m), brake (brake torque, N m, >= 0).
// wheel spec: at | socket, radius, front, part, suspension { rest = 0.3, stiffness, bump, rebound } (defaults from the
// chassis mass: half of rest is the static sag, damping ratio about 0.25 and rebound 1.5 x bump), inertia = 1 (kg m^2),
// apScale = 1 (peak slip angle multiplier; < 1 is a stiffer tire).
function tireCar(world, e, { specs, points, parts, mask, forward, terrain, tyre, substeps, engine }) {
  const R = world.R, rw = world.rapier, reg = world.materials, body = e.body, n = specs.length, axle = AXLE[forward];
  const mC = body.mass() / n, ctl = new Float64Array(n * 3), F0 = FWD[forward];
  const wheels = specs.map((s, i) => {
    const sus = s.suspension ?? {}, rest = sus.rest ?? 0.3;
    if (!(rest > 0)) fail(`wheel ${i}: suspension.rest must be > 0`);
    const k = sus.stiffness ?? mC * G / (0.5 * rest), bump = sus.bump ?? 0.5 * Math.sqrt(k * mC);
    for (const key of Object.keys(sus)) if (!['rest', 'stiffness', 'bump', 'rebound'].includes(key)) fail(`wheel ${i}: the tire backend's suspension has no '${key}' (rest, stiffness, bump, rebound)`);
    return { front: !!s.front, radius: s.radius, inContact: false, point: v3(), normal: { x: 0, y: 1, z: 0 }, material: null, pair: null, friction: 1,
      suspension: rest, steering: 0, load: 0, omega: 0, kappa: 0, alpha: 0, fx: 0, fy: 0, surface: DEFAULT_SURFACE,
      // internal: spring, damper, inertia, patch state, compression and the cast ray
      k, bump, rebound: sus.rebound ?? 1.5 * bump, rest, I: s.inertia ?? 1, apScale: s.apScale ?? 1, st: { dx: 0, dy: 0 }, x: 0, xPrev: 0, was: false,
      fs: 0, spin: 0, ray: new R.Ray(v3(), v3()), o: v3(), cf: v3(), cl: v3(), vx: 0, vy: 0, sfx: 0, sfy: 0 };
  });
  const tHandle = terrain ? terrain.entity.colliders[0].collider.handle : -1;
  if (parts.some(p => p !== null)) world.add(e, 'partXf', parts.filter(p => p !== null));
  const poses = parts.map(p => (p === null ? null : e.partXf[p]));
  const U = v3(), Fw = v3(), res = { fx: 0, fy: 0, rho: 0, kappa: 0, alpha: 0 }, imp = v3(), r0 = v3();
  const pointVel = (pt, p, v, av, o) => { // v + av x (pt - p)
    const rx = pt.x - p.x, ry = pt.y - p.y, rz = pt.z - p.z;
    o.x = v.x + av.y * rz - av.z * ry; o.y = v.y + av.z * rx - av.x * rz; o.z = v.z + av.x * ry - av.y * rx; return o;
  };
  const car = {
    entity: e, wheels, tyre, backend: 'tire', substeps, removed: false,
    set(i, c) {
      if (!(i >= 0 && i < n)) fail(`wheel ${i} out of range 0..${n - 1}`);
      for (const key of Object.keys(c)) if (!CONTROLS.includes(key)) fail(`the tire backend has no '${key}' control (steer, engine, brake)`);
      if (c.steer !== undefined) ctl[i * 3] = c.steer;
      if (c.engine !== undefined) ctl[i * 3 + 1] = c.engine;
      if (c.brake !== undefined) { if (!(c.brake >= 0)) fail(`wheel ${i}: brake torque must be >= 0`); ctl[i * 3 + 2] = c.brake; }
      return car;
    },
    update(dt) {
      const p = body.translation(), q = body.rotation(), v = body.linvel(), av = body.angvel();
      rot(q, UP, U); rot(q, F0, Fw);
      for (let i = 0; i < n; i++) { // rays, ground, suspension
        const w = wheels[i], o = rot(q, points[i], w.o); o.x += p.x; o.y += p.y; o.z += p.z;
        w.steering = ctl[i * 3];
        const ray = w.ray; ray.origin.x = o.x; ray.origin.y = o.y; ray.origin.z = o.z; ray.dir.x = -U.x; ray.dir.y = -U.y; ray.dir.z = -U.z;
        const maxT = w.rest + w.radius, hit = rw.castRayAndGetNormal(ray, maxT, true, undefined, mask, undefined, body);
        w.was = w.inContact;
        const t = hit ? hit.timeOfImpact : maxT;
        w.inContact = !!hit;
        w.point.x = o.x - U.x * t; w.point.y = o.y - U.y * t; w.point.z = o.z - U.z * t;
        if (hit) { w.normal.x = hit.normal.x; w.normal.y = hit.normal.y; w.normal.z = hit.normal.z; }
        w.x = hit ? w.rest - (t - w.radius) : 0; w.suspension = w.rest - w.x;
        if (!hit) { w.material = null; w.pair = null; w.friction = 1; w.surface = DEFAULT_SURFACE; w.fs = 0; w.load = 0; w.xPrev = 0; continue; }
        const h = hit.collider.handle;
        w.material = terrain && h === tHandle ? terrain.materialAt(w.point.x, w.point.z) : world.materialOf(h) ?? null;
        w.pair = w.material ? reg.pair(tyre, w.material) : null;
        w.friction = w.pair ? w.pair.friction : 1;
        w.surface = w.pair?.tire ? surfaceOf(w.pair.tire) : DEFAULT_SURFACE;
        const nu = dot(w.normal, U);
        const xd = w.was ? (w.x - w.xPrev) / dt : -dot(pointVel(w.point, p, v, av, r0), U) / Math.max(0.3, nu);
        w.xPrev = w.x;
        w.fs = Math.max(0, w.k * w.x + (xd > 0 ? w.bump : w.rebound) * xd);
        w.load = w.fs * Math.max(0, nu);
        // the contact frame: the steered heading on the ground plane (cf) and its left (cl = n x cf)
        const c = Math.cos(w.steering), sn = Math.sin(w.steering), d = dot(U, Fw); // Rodrigues: Fw about U by steer
        const hx = Fw.x * c + (U.y * Fw.z - U.z * Fw.y) * sn + U.x * d * (1 - c);
        const hy = Fw.y * c + (U.z * Fw.x - U.x * Fw.z) * sn + U.y * d * (1 - c);
        const hz = Fw.z * c + (U.x * Fw.y - U.y * Fw.x) * sn + U.z * d * (1 - c);
        const hn = hx * w.normal.x + hy * w.normal.y + hz * w.normal.z;
        let cx = hx - w.normal.x * hn, cy = hy - w.normal.y * hn, cz = hz - w.normal.z * hn; const cm = Math.hypot(cx, cy, cz) || 1;
        w.cf.x = cx / cm; w.cf.y = cy / cm; w.cf.z = cz / cm;
        const N = w.normal; w.cl.x = N.y * w.cf.z - N.z * w.cf.y; w.cl.y = N.z * w.cf.x - N.x * w.cf.z; w.cl.z = N.x * w.cf.y - N.y * w.cf.x;
        const vc = pointVel(w.point, p, v, av, r0); w.vx = dot(vc, w.cf); w.vy = dot(vc, w.cl);
      }
      const sub = substeps === 'auto' ? Math.max(1, Math.ceil(dt / MAX_H - 1e-9)) : substeps, hs = dt / sub;
      for (let i = 0; i < n; i++) { wheels[i].sfx = 0; wheels[i].sfy = 0; }
      for (let s = 0; s < sub; s++) for (let i = 0; i < n; i++) { // tires and wheel spin
        const w = wheels[i], r = w.radius;
        let fx = 0, fy = 0;
        if (w.inContact && w.load > 0) {
          const cy = 0.3 * mC / dt, cx = Math.min(cy, 0.4 * w.I / (r * r * hs));
          tireStep(res, w.st, w.omega * r - w.vx, w.vy, w.vx, w.load, w.surface, hs, cx, cy, w.apScale);
          fx = res.fx; fy = res.fy; w.kappa = res.kappa; w.alpha = res.alpha;
        } else { w.st.dx *= 0.9; w.st.dy *= 0.9; w.kappa = 0; w.alpha = 0; }
        const troll = w.inContact ? w.surface.crr * w.load * r * Math.tanh(w.omega * 2) : 0;
        const free = w.omega + (ctl[i * 3 + 1] - fx * r - troll) * hs / w.I, dB = ctl[i * 3 + 2] * hs / w.I;
        w.omega = Math.abs(free) <= dB ? 0 : free - Math.sign(free) * dB;
        w.sfx += fx; w.sfy += fy;
      }
      for (let i = 0; i < n; i++) { // forces as impulses at the contact points
        const w = wheels[i];
        w.fx = w.sfx / sub; w.fy = w.sfy / sub; w.spin += w.omega * dt;
        if (w.inContact) {
          imp.x = (U.x * w.fs + w.cf.x * w.fx + w.cl.x * w.fy) * dt; imp.y = (U.y * w.fs + w.cf.y * w.fx + w.cl.y * w.fy) * dt; imp.z = (U.z * w.fs + w.cf.z * w.fx + w.cl.z * w.fy) * dt;
          body.applyImpulseAtPoint(imp, w.point, true);
          const kd = w.surface.drag;
          if (kd && w.load > 0) {
            const vc = pointVel(w.point, p, v, av, r0), sp = Math.hypot(vc.x, vc.z);
            if (sp >= 1e-3) { const f = kd * w.load * Math.tanh(sp / DRAG.fade) * (1 + (sp / DRAG.v) ** 2) * dt / sp; imp.x = -vc.x * f; imp.y = 0; imp.z = -vc.z * f; body.applyImpulseAtPoint(imp, w.point, true); }
          }
        }
        if (poses[i] !== null) partPose(poses[i], points[i], w, w.spin, axle);
      }
    },
  };
  let list = CARS.get(world);
  if (!list) CARS.set(world, list = []);
  list.push(car);
  world.own(e, () => { const k = list.indexOf(car); if (k !== -1) list.splice(k, 1); car.removed = true; });
  install(engine);
  return car;
}
