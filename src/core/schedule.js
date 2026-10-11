// R-6: the step runs named stages in a fixed order; systems inside a stage order themselves with before/after
// (the Threlte model). Unknown references are ignored so a game can name a kit's system that is not loaded.
export const STEP_STAGES = Object.freeze(['input.apply', 'pre', 'physics.world', 'post', 'events.flush']);

export function createSchedule(stages) {
  const byStage = new Map(stages.map(s => [s, []])), byName = new Map(), sorted = new Map();
  let n = 0;
  function sort(stage) {
    const list = byStage.get(stage), names = new Set(list.map(e => e.name));
    // Build dependencies (X → Y means X depends on Y)
    const deps = new Map(list.map(e => [e.name, new Set()]));
    for (const e of list) {
      for (const a of e.after) if (names.has(a)) deps.get(e.name).add(a);
      for (const b of e.before) if (names.has(b)) deps.get(b).add(e.name);
    }
    // Build must_precede: systems that each system must precede (X must precede Y if X.before has Y or Y.after has X)
    const mustPrecede = new Map(list.map(e => [e.name, new Set()]));
    for (const e of list) {
      for (const b of e.before) if (names.has(b)) mustPrecede.get(e.name).add(b);
      for (const a of e.after) if (names.has(a)) mustPrecede.get(a).add(e.name);
    }
    // Compute rank[i] = min(insertion index i, min rank of systems i must precede), to fixpoint
    const rank = new Map(list.map(e => [e.name, e.i]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of list) {
        const newRank = Math.min(e.i, ...[...mustPrecede.get(e.name)].map(n => rank.get(n)));
        if (newRank < rank.get(e.name)) { rank.set(e.name, newRank); changed = true; }
      }
    }
    // Kahn's algorithm with (rank, insertion index) tiebreaker
    const out = [], done = new Set();
    while (out.length < list.length) {
      let next = null, minRank = Infinity, minI = Infinity;
      for (const e of list) {
        if (!done.has(e.name) && [...deps.get(e.name)].every(d => done.has(d))) {
          const r = rank.get(e.name);
          if (r < minRank || (r === minRank && e.i < minI)) { next = e; minRank = r; minI = e.i; }
        }
      }
      if (!next) throw new Error(`schedule: cycle in '${stage}': ${list.filter(e => !done.has(e.name)).map(e => e.name).join(', ')}`);
      done.add(next.name); out.push(next);
    }
    return out;
  }
  const entries = stage => { if (!sorted.has(stage)) sorted.set(stage, sort(stage)); return sorted.get(stage); };
  const api = {
    add(name, fn, { stage, before = [], after = [] } = {}) {
      if (!byStage.has(stage)) throw new Error(`schedule: unknown stage '${stage}' for '${name}'`);
      if (byName.has(name)) throw new Error(`schedule: duplicate system '${name}'`);
      const e = { name, fn, stage, before: [...before], after: [...after], i: n++ };
      byName.set(name, e); byStage.get(stage).push(e); sorted.delete(stage);
      return () => { if (byName.get(name) === e) api.remove(name); }; // identity: a stale remover must not delete a re-added system
    },
    remove(name) {
      const e = byName.get(name); if (!e) return;
      byName.delete(name); const list = byStage.get(e.stage); list.splice(list.indexOf(e), 1); sorted.delete(e.stage);
    },
    order: stage => entries(stage).map(e => e.name),
    run(stage, a, b) { const list = entries(stage); for (let i = 0; i < list.length; i++) list[i].fn(a, b); },
    describe: () => Object.fromEntries([...byStage.keys()].map(s => [s, api.order(s)])),
  };
  return api;
}
