// M-5 (overview §4.5): after each step, contact-force events become `contact` and collision events on sensors become
// `sensor`. Order: every contact in Rapier's drain order, then every sensor event in Rapier's drain order; both are
// deterministic. The drain callbacks are made once per World, so a step with no events allocates nothing here.
// a/b/sensor/other are entity ids, or null for a raw collider the World does not own.
export function createEventDrain({ emit, hz, entityOf, materialOf }) {
  let rw = null;
  const S = { found: false, x: 0, y: 0, z: 0 }, P = { x: 0, y: 0, z: 0 }, A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 }; // Rapier's getters fill these
  const idOf = h => entityOf(h)?.id ?? null;
  const onManifold = m => {
    if (S.found || m.numSolverContacts() === 0) return;
    const p = m.solverContactPoint(0, P);
    S.x = p.x; S.y = p.y; S.z = p.z; S.found = true;
  };
  const onForce = ev => {
    const h1 = ev.collider1(), h2 = ev.collider2(), c1 = rw.getCollider(h1), c2 = rw.getCollider(h2);
    S.found = false; S.x = 0; S.y = 0; S.z = 0;
    if (c1 && c2) {
      rw.contactPair(c1, c2, onManifold);
      if (!S.found) { // no solver contact this step: the midpoint of the two bodies (or bodiless colliders)
        const a = (c1.parent() ?? c1).translation(A), b = (c2.parent() ?? c2).translation(B);
        S.x = (a.x + b.x) / 2; S.y = (a.y + b.y) / 2; S.z = (a.z + b.z) / 2;
      }
    }
    emit('contact', { a: idOf(h1), b: idOf(h2), materials: [materialOf(h1) ?? null, materialOf(h2) ?? null], impulse: ev.totalForceMagnitude() / hz, point: [S.x, S.y, S.z] });
  };
  const onCollision = (h1, h2, started) => {
    if (rw.getCollider(h1)?.isSensor()) emit('sensor', { sensor: idOf(h1), other: idOf(h2), on: started });
    else if (rw.getCollider(h2)?.isSensor()) emit('sensor', { sensor: idOf(h2), other: idOf(h1), on: started });
  };
  return (world, queue) => {
    rw = world;
    try { queue.drainContactForceEvents(onForce); queue.drainCollisionEvents(onCollision); } finally { rw = null; }
  };
}
