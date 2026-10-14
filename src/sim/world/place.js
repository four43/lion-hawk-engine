// E-8 (overview §4.4): place moves an entity and its body together. It writes prev AND curr, so the view does not
// smear across the jump; a body is woken, stopped unless `keep`, given its next kinematic pose, or (fixed) has its
// colliders moved at once so queries see it before the next step. socket/xfPrev read the pool into out objects.
// Nothing here allocates unless the caller omits `out`.
import { PREV, CURR, INTERNAL, DYNAMIC, KINEMATIC, FIXED, isVec } from './pool.js';
import { rotate, qmul, qFromYaw, qnorm } from '../../core/math.js';

const NO_OPTS = Object.freeze({}), ORIGIN = Object.freeze([0, 0, 0]), ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

export function createPlacer(pool, rapier, world) {
  const P = { x: 0, y: 0, z: 0 }, Q = { x: 0, y: 0, z: 0, w: 1 }, RP = { x: 0, y: 0, z: 0 }, RQ = { x: 0, y: 0, z: 0, w: 1 };
  const L = { x: 0, y: 0, z: 0 }, T = { x: 0, y: 0, z: 0, w: 1 };
  const live = (e, what) => {
    const r = e?.[INTERNAL];
    if (!r || r.world !== world || r.dead) throw new Error(`world.${what}: not a live entity of this World`);
    if (r.slot < 0) throw new Error(`world.${what}: entity ${e.id} has no xf (spawn it with a body or xf: true)`);
    return r;
  };
  function place(e, target, opts = NO_OPTS) {
    const r = live(e, 'place'), { yaw, q, keep = false } = opts, rel = target?.rel;
    pool.read(r.slot, CURR, P, Q); // defaults: stay as it is
    if (rel !== undefined) {
      const o = live(rel, 'place'), local = target.local ?? ORIGIN;
      if (!isVec(local, 3)) throw new Error('world.place: local must be [x, y, z]');
      pool.read(o.slot, CURR, RP, RQ);
      L.x = local[0]; L.y = local[1]; L.z = local[2];
      rotate(RQ, L, P); P.x += RP.x; P.y += RP.y; P.z += RP.z;
    } else if (target?.at !== undefined) {
      if (!isVec(target.at, 3)) throw new Error('world.place: at must be [x, y, z]');
      P.x = target.at[0]; P.y = target.at[1]; P.z = target.at[2];
    } else throw new Error('world.place: target must be { at: [x, y, z] } or { rel: entity, local: [x, y, z] }');
    if (q != null) {
      if (!isVec(q, 4) || Math.hypot(q[0], q[1], q[2], q[3]) === 0) throw new Error('world.place: q must be a non-zero [x, y, z, w]');
      Q.x = q[0]; Q.y = q[1]; Q.z = q[2]; Q.w = q[3];
    } else if (yaw !== undefined) {
      if (!Number.isFinite(yaw)) throw new Error('world.place: yaw must be a finite number');
      qFromYaw(yaw, Q);
    } else if (rel !== undefined) { Q.x = 0; Q.y = 0; Q.z = 0; Q.w = 1; }
    if (rel !== undefined) qmul(RQ, Q, Q); // relative rotation: the other's, then the given one
    qnorm(Q);
    pool.write(r.slot, PREV, P, Q); pool.write(r.slot, CURR, P, Q);
    const b = e.body;
    if (b) {
      b.setTranslation(P, true); b.setRotation(Q, true);
      if (r.kind === KINEMATIC) { b.setNextKinematicTranslation(P); b.setNextKinematicRotation(Q); }
      else if (r.kind === DYNAMIC && !keep) { b.setLinvel(ZERO, true); b.setAngvel(ZERO, true); }
      else if (r.kind === FIXED) rapier()?.propagateModifiedBodyPositionsToColliders();
      r.awake = 1; // read it after the next step even if Rapier sleeps it straight away
    }
    return e;
  }
  function socket(e, name, out = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }) {
    const r = live(e, 'socket'), s = e.sockets && Object.hasOwn(e.sockets, name) ? e.sockets[name] : undefined;
    if (!s) throw new Error(`world.socket: entity ${e.id} has no socket '${name}'`);
    pool.read(r.slot, CURR, P, Q);
    L.x = s.p[0]; L.y = s.p[1]; L.z = s.p[2];
    rotate(Q, L, out.p); out.p.x += P.x; out.p.y += P.y; out.p.z += P.z;
    T.x = s.q[0]; T.y = s.q[1]; T.z = s.q[2]; T.w = s.q[3];
    qmul(Q, T, out.q);
    return out;
  }
  function xfPrev(e, out = { p: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }) {
    const r = live(e, 'xfPrev');
    pool.read(r.slot, PREV, out.p, out.q);
    return out;
  }
  return { place, socket, xfPrev };
}
