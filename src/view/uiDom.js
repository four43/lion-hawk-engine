// U-1/U-3: renders the engine's UI registry as real <button>s. Reconciles by test id; a sync() with nothing changed
// performs no DOM writes (every written value is cached and compared first).
export function createUiDom(engine, { root, doc, onTap, errors } = {}) {
  const document = doc ?? root?.ownerDocument ?? globalThis.document;
  const host = root ?? document.body;
  const root_ = document.createElement('div'); root_.setAttribute('data-lh-ui-root', ''); host.appendChild(root_);
  const html = document.documentElement;
  const boxes = new Map(), buttons = new Map(); // scene -> {el, overlay}, id -> {el, label, enabled, pressed}
  const attrs = new Map(); // html attribute cache
  const setHtml = (k, v) => { if (attrs.get(k) !== v) { attrs.set(k, v); html.setAttribute(k, v); } };
  const place = (parent, el, i) => { if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] ?? null); };

  const onClick = e => {
    const b = e.target?.closest?.('button[data-testid]'); if (!b || !root_.contains(b)) return;
    try { engine.ui.tap(b.getAttribute('data-testid')); }
    catch (err) { if (!/is disabled|is covered/.test(String(err?.message))) errors?.push({ type: 'error', message: String(err?.message ?? err), stack: err?.stack }); } // disabled/covered: the DOM already says so
    sync(); onTap?.();
  };
  root_.addEventListener('click', onClick);

  function sync() {
    const stack = [engine.scene.name, ...engine.scene.overlays].filter(n => n !== undefined);
    const tree = engine.ui.tree(), byScene = new Map(stack.map(n => [n, []]));
    for (const c of tree) { if (!byScene.has(c.scene)) byScene.set(c.scene, []); byScene.get(c.scene).push(c); }
    const live = new Set(), liveIds = new Set(tree.map(c => c.id)), names = [...byScene.keys()];
    for (let si = 0; si < names.length; si++) {
      const name = names[si], overlay = si > 0 && stack.includes(name); live.add(name);
      let box = boxes.get(name);
      if (!box) {
        const el = document.createElement('div'); el.setAttribute('data-lh-ui', name);
        if (overlay) el.setAttribute('data-lh-overlay', name);
        boxes.set(name, box = { el, overlay });
      } else if (box.overlay !== overlay) { overlay ? box.el.setAttribute('data-lh-overlay', name) : box.el.removeAttribute('data-lh-overlay'); box.overlay = overlay; }
      place(root_, box.el, si);
      const list = byScene.get(name);
      for (let i = 0; i < list.length; i++) {
        const c = list[i]; let b = buttons.get(c.id);
        if (!b) {
          const el = document.createElement('button'); el.setAttribute('type', 'button'); el.setAttribute('data-testid', c.id);
          buttons.set(c.id, b = { el, label: undefined, enabled: undefined, pressed: undefined });
        }
        if (b.label !== c.label) { b.label = c.label; b.el.textContent = c.label; }
        if (b.enabled !== c.enabled) { b.enabled = c.enabled; b.el.disabled = !c.enabled; }
        const pressed = c.role === 'switch' ? !!c.pressed : undefined;
        if (b.pressed !== pressed) { b.pressed = pressed; pressed === undefined ? b.el.removeAttribute('aria-pressed') : b.el.setAttribute('aria-pressed', String(pressed)); }
        place(box.el, b.el, i);
      }
    }
    for (const [id, b] of buttons) if (!liveIds.has(id)) { b.el.remove(); buttons.delete(id); }
    for (const [name, box] of boxes) if (!live.has(name)) { box.el.remove(); boxes.delete(name); }
    setHtml('data-lh-scene', stack[0] ?? '');
    setHtml('data-lh-overlays', stack.slice(1).join(' '));
  }
  return { sync, dispose() { root_.removeEventListener('click', onClick); root_.remove(); boxes.clear(); buttons.clear(); for (const k of ['data-lh-scene', 'data-lh-overlays', 'data-lh-settled']) html.removeAttribute(k); attrs.clear(); } };
}
