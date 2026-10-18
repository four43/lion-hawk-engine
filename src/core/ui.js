// U-1: scenes declare their controls; the browser renders them as real buttons with data-testid="<scene>.<id>",
// and headless tests tap them through this registry (T-5).
export function createUi({ onAction, coveredBy = () => undefined, isAction = () => true, ctxOf = () => undefined }) {
  let viewCtx, shownN = 0; // view()'s ctx while controls.forEach(viewOne) runs (one callback, made once: no per-call closure)
  const viewOne = c => {
    const ctx = viewCtx, o = c.out ??= { id: c.id, scene: c.scene, role: c.role, label: '', enabled: true, pressed: undefined, group: c.role === 'choice' ? c.group : undefined, progress: undefined, value: undefined };
    o.label = c.label; o.enabled = c.when ? !!c.when(ctx, ctxOf(c.scene)) : true;
    if (c.role === 'switch') o.pressed = !!c.get(ctx, ctxOf(c.scene));
    else if (c.role === 'choice') o.pressed = c.get(ctx, ctxOf(c.scene)) === c.value;
    else if (c.role === 'hold') { o.pressed = c.pressed; o.progress = Math.min(1, c.held / c.seconds); }
    else if (c.role === 'textbox') o.value = String(c.get(ctx, ctxOf(c.scene)) ?? '');
    shown[shownN++] = o;
  };
  const controls = new Map(), active = [], snap = [], shown = []; // active: the pressed holds; snap: advance()'s reused copy (no per-step allocation); shown: view()'s
  const add = (scene, role, spec) => {
    const id = `${scene}.${spec.id}`;
    if (controls.has(id)) throw new Error(`ui: duplicate control '${id}'`);
    const c = { ...spec, id, scene, role }; if (role === 'hold') Object.assign(c, { held: 0, pressed: false, fired: false, t0: 0 });
    controls.set(id, c);
  };
  const usable = (id, ctx) => {
    const c = controls.get(id);
    if (!c) throw new Error(`ui: no control '${id}'`);
    const by = coveredBy(c.scene); if (by) throw new Error(`ui: control '${id}' is covered by '${by}'`);
    if (c.when && !c.when(ctx, ctxOf(c.scene))) throw new Error(`ui: control '${id}' is disabled`);
    return c;
  };
  return {
    builder: scene => ({
      button: spec => add(scene, 'button', spec), toggle: spec => add(scene, 'switch', spec),
      // #18: one control per option, id <scene>.<id>.<value>; set() gets the option's original value
      choice: spec => { for (const o of spec.options) add(scene, 'choice', { id: `${spec.id}.${String(o.value)}`, label: o.label, value: o.value, group: `${scene}.${spec.id}`, get: spec.get, set: spec.set, when: spec.when }); },
      field: spec => add(scene, 'textbox', spec),
      // #9: hold-to-fire on engine time; `action` is an action name (pressed that step) or fn(engine, ctx)
      // #83: wall: true counts engine.time.wall from the press instead (slow frames that maxCatchUp caps do not stretch it)
      hold: spec => {
        if (!(spec.seconds > 0)) throw new Error(`ui: hold '${spec.id}' needs seconds > 0`);
        if (typeof spec.action !== 'function' && !isAction(spec.action)) throw new Error(`ui: hold '${spec.id}' action must be a function or a known action name`);
        add(scene, 'hold', spec);
      },
    }),
    clear(scene) {
      for (const [id, c] of controls) if (c.scene === scene) { controls.delete(id); if (c.pressed) { c.pressed = false; active.splice(active.indexOf(c), 1); } }
    },
    // the same as tree(), into one reused object per control and one reused array: valid until the next view() (the DOM
    // UI reads it every frame; R-8). Keys tree() leaves out for a role are undefined here.
    view(ctx) {
      shownN = 0; viewCtx = ctx; controls.forEach(viewOne); viewCtx = undefined;
      if (shown.length !== shownN) shown.length = shownN; // by index, not length = 0 then push: V8 drops the backing store at length 0
      return shown;
    },
    tree: ctx => [...controls.values()].map(c => {
      const o = { id: c.id, scene: c.scene, role: c.role, label: c.label, enabled: c.when ? !!c.when(ctx, ctxOf(c.scene)) : true };
      if (c.role === 'switch') o.pressed = !!c.get(ctx, ctxOf(c.scene));
      else if (c.role === 'choice') { o.pressed = c.get(ctx, ctxOf(c.scene)) === c.value; o.group = c.group; }
      else if (c.role === 'hold') { o.pressed = c.pressed; o.progress = Math.min(1, c.held / c.seconds); }
      else if (c.role === 'textbox') o.value = String(c.get(ctx, ctxOf(c.scene)) ?? '');
      return o;
    }),
    fill(id, text, ctx) {
      const c = usable(id, ctx);
      if (c.role !== 'textbox') throw new Error(`ui: control '${id}' is not a field`);
      c.set(String(text), ctx, ctxOf(c.scene));
    },
    enabled(id, ctx) { // [#45] never throws: missing, covered or `when` false -> false
      const c = controls.get(id);
      return !!c && !coveredBy(c.scene) && !(c.when && !c.when(ctx, ctxOf(c.scene)));
    },
    press(id, ctx) {
      const c = usable(id, ctx);
      if (c.role !== 'hold') throw new Error(`ui: control '${id}' is not a hold`);
      if (c.pressed) return;
      c.pressed = true; c.held = 0; c.fired = false; if (c.wall) c.t0 = ctx.time.wall; active.push(c);
    },
    release(id) {
      const c = controls.get(id); if (!c?.pressed) return;
      c.pressed = false; c.held = 0; c.fired = false; active.splice(active.indexOf(c), 1);
    },
    // each step (lh.ui): pressed holds gain dt and fire once; one that vanished, got covered or disabled is cancelled
    // Iterates a snapshot: an action may release or clear other holds (splicing `active`) without a hold being advanced twice or skipped.
    advance(dt, ctx) {
      snap.length = 0; for (let i = 0; i < active.length; i++) snap.push(active[i]);
      for (let i = snap.length - 1; i >= 0; i--) {
        const c = snap[i]; if (!c.pressed) continue;
        if (controls.get(c.id) !== c || coveredBy(c.scene) || (c.when && !c.when(ctx, ctxOf(c.scene)))) { c.pressed = false; c.held = 0; c.fired = false; const k = active.indexOf(c); if (k >= 0) active.splice(k, 1); continue; }
        if (c.wall) c.held = (ctx.time.wall - c.t0) / 1000; else c.held += dt;
        if (!c.fired && c.held >= c.seconds - 1e-9) { c.fired = true; if (typeof c.action === 'function') c.action(ctx, ctxOf(c.scene)); else onAction(c.action); }
      }
    },
    tap(id, ctx) {
      const c = usable(id, ctx);
      if (c.role === 'textbox') throw new Error(`ui: control '${id}' is a field: use fill`);
      if (c.role === 'hold') throw new Error(`ui: control '${id}' is a hold: use press`);
      if (c.role === 'choice') c.set(c.value, ctx, ctxOf(c.scene));
      else if (c.role === 'switch') c.set(!c.get(ctx, ctxOf(c.scene)), ctx, ctxOf(c.scene));
      else if (typeof c.action === 'function') c.action(ctx, ctxOf(c.scene));
      else onAction(c.action);
    },
  };
}
