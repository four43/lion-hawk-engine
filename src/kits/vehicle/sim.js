// kit-vehicle (sim half, design §7.3): Rapier's ray-cast vehicle controller on a World entity (L-1: car.controller is
// the real one). The kit owns the wiring: wheels from body-space points or sockets, per-wheel controls, one update per
// step before 'lh.physics.step', and contact readback. Tuning stays game-side: a game system before VEHICLE_SYSTEM calls
// car.set(); one after it (and before 'lh.physics.step') may read car.wheels and add its own impulses.
// Sim-pure (L-3): Rapier is world.rapier, never an import.

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
  const { wheels: specs, rayGroups, forward = 'x', terrain = null, tyre = 'rubber', grip = false } = opts;
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
      }
    },
  };
  let list = CARS.get(world);
  if (!list) CARS.set(world, list = []);
  list.push(car);
  install(engine);
  return car;
}
