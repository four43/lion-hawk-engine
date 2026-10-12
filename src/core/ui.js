// U-1: scenes declare their controls; the browser renders them as real buttons with data-testid="<scene>.<id>",
// and headless tests tap them through this registry (T-5).
export function createUi({ onAction, coveredBy = () => undefined }) {
  const controls = new Map();
  const add = (scene, role, spec) => {
    const id = `${scene}.${spec.id}`;
    if (controls.has(id)) throw new Error(`ui: duplicate control '${id}'`);
    controls.set(id, { ...spec, id, scene, role });
  };
  const usable = (id, ctx) => {
    const c = controls.get(id);
    if (!c) throw new Error(`ui: no control '${id}'`);
    const by = coveredBy(c.scene); if (by) throw new Error(`ui: control '${id}' is covered by '${by}'`);
    if (c.when && !c.when(ctx)) throw new Error(`ui: control '${id}' is disabled`);
    return c;
  };
  return {
    builder: scene => ({
      button: spec => add(scene, 'button', spec), toggle: spec => add(scene, 'switch', spec),
      // #18: one control per option, id <scene>.<id>.<value>; set() gets the option's original value
      choice: spec => { for (const o of spec.options) add(scene, 'choice', { id: `${spec.id}.${String(o.value)}`, label: o.label, value: o.value, group: `${scene}.${spec.id}`, get: spec.get, set: spec.set, when: spec.when }); },
      field: spec => add(scene, 'textbox', spec),
    }),
    clear(scene) { for (const [id, c] of controls) if (c.scene === scene) controls.delete(id); },
    tree: ctx => [...controls.values()].map(c => {
      const o = { id: c.id, scene: c.scene, role: c.role, label: c.label, enabled: c.when ? !!c.when(ctx) : true };
      if (c.role === 'switch') o.pressed = !!c.get(ctx);
      else if (c.role === 'choice') { o.pressed = c.get(ctx) === c.value; o.group = c.group; }
      else if (c.role === 'textbox') o.value = String(c.get(ctx) ?? '');
      return o;
    }),
    fill(id, text, ctx) {
      const c = usable(id, ctx);
      if (c.role !== 'textbox') throw new Error(`ui: control '${id}' is not a field`);
      c.set(String(text), ctx);
    },
    tap(id, ctx) {
      const c = usable(id, ctx);
      if (c.role === 'textbox') throw new Error(`ui: control '${id}' is a field: use fill`);
      if (c.role === 'choice') c.set(c.value, ctx);
      else if (c.role === 'switch') c.set(!c.get(ctx), ctx);
      else if (typeof c.action === 'function') c.action(ctx);
      else onAction(c.action);
    },
  };
}
