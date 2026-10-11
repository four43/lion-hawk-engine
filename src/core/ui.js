// U-1: scenes declare their controls; the browser renders them as real buttons with data-testid="<scene>.<id>",
// and headless tests tap them through this registry (T-5).
export function createUi({ onAction }) {
  const controls = new Map();
  const add = (scene, role, spec) => {
    const id = `${scene}.${spec.id}`;
    if (controls.has(id)) throw new Error(`ui: duplicate control '${id}'`);
    controls.set(id, { ...spec, id, scene, role });
  };
  return {
    builder: scene => ({ button: spec => add(scene, 'button', spec), toggle: spec => add(scene, 'switch', spec) }),
    clear(scene) { for (const [id, c] of controls) if (c.scene === scene) controls.delete(id); },
    tree: ctx => [...controls.values()].map(c => {
      const o = { id: c.id, scene: c.scene, role: c.role, label: c.label, enabled: c.when ? !!c.when(ctx) : true };
      if (c.role === 'switch') o.pressed = !!c.get(ctx);
      return o;
    }),
    tap(id, ctx) {
      const c = controls.get(id);
      if (!c) throw new Error(`ui: no control '${id}'`);
      if (c.when && !c.when(ctx)) throw new Error(`ui: control '${id}' is disabled`);
      if (c.role === 'switch') c.set(!c.get(ctx), ctx);
      else if (typeof c.action === 'function') c.action(ctx);
      else onAction(c.action);
    },
  };
}
