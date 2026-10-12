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

  const owned = new WeakMap(); // managed element (created or adopted) -> control id: only these are ever tapped (#18)
  const fail = err => { if (!/is disabled|is covered/.test(String(err?.message))) errors?.push({ type: 'error', message: String(err?.message ?? err), stack: err?.stack }); }; // disabled/covered: the DOM already says so
  const ownerOf = t => { for (let n = t; n; n = n.parentNode) { const id = owned.get(n); if (id !== undefined) return { el: n, id }; } };
  const onClick = e => {
    const o = ownerOf(e.target); if (!o || o.el.tagName !== 'BUTTON') return;
    try { engine.ui.tap(o.id); } catch (err) { fail(err); }
    sync(); onTap?.();
  };
  const commit = (o, c) => { // at most once per distinct value
    if (!c || o.el.value === c.last) return;
    c.last = o.el.value;
    try { engine.ui.fill(o.id, o.el.value); } catch (err) { fail(err); }
    c.value = undefined; sync(); onTap?.(); // re-sync: the game may have normalised or refused the text
  };
  const onChange = e => { const o = ownerOf(e.target); if (o?.el.tagName === 'INPUT') commit(o, buttons.get(o.id)); };
  const onKey = e => {
    if (e.key !== 'Enter') return; const o = ownerOf(e.target); if (o?.el.tagName !== 'INPUT') return;
    const c = buttons.get(o.id); commit(o, c); o.el.blur?.(); e.preventDefault?.();
  };
  document.addEventListener('click', onClick); document.addEventListener('change', onChange); document.addEventListener('keydown', onKey);
  const slotFor = (id, role) => {
    const tag = role === 'textbox' ? 'INPUT' : 'BUTTON';
    for (const el of document.querySelectorAll(`[data-lh-slot="${id.replace(/["\\]/g, '\\$&')}"]`)) if (el.tagName === tag && !owned.has(el)) return el;
  };
  const release = (id, b) => { owned.delete(b.el); if (b.adopted) { b.el.removeAttribute('data-testid'); b.el.disabled = true; } else b.el.remove(); };

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
          let el = slotFor(c.id, c.role); const adopted = !!el;
          if (!el) { el = document.createElement(c.role === 'textbox' ? 'input' : 'button'); el.setAttribute('type', c.role === 'textbox' ? 'text' : 'button'); }
          el.setAttribute('data-testid', c.id); owned.set(el, c.id);
          buttons.set(c.id, b = { el, adopted, label: undefined, enabled: undefined, pressed: undefined, value: undefined, last: undefined });
        }
        if (b.label !== c.label) { b.label = c.label; if (!b.adopted) c.role === 'textbox' ? b.el.setAttribute('aria-label', c.label) : (b.el.textContent = c.label); }
        if (c.role === 'textbox' && b.value !== c.value && document.activeElement !== b.el) { b.value = c.value; b.last = c.value; if (b.el.value !== c.value) b.el.value = c.value; }
        if (b.enabled !== c.enabled) { b.enabled = c.enabled; b.el.disabled = !c.enabled; }
        const pressed = c.role === 'switch' || c.role === 'choice' ? !!c.pressed : undefined;
        if (b.pressed !== pressed) { b.pressed = pressed; pressed === undefined ? b.el.removeAttribute('aria-pressed') : b.el.setAttribute('aria-pressed', String(pressed)); }
        if (!b.adopted) place(box.el, b.el, i);
      }
    }
    for (const [id, b] of buttons) if (!liveIds.has(id)) { release(id, b); buttons.delete(id); }
    for (const [name, box] of boxes) if (!live.has(name)) { box.el.remove(); boxes.delete(name); }
    setHtml('data-lh-scene', stack[0] ?? '');
    setHtml('data-lh-overlays', stack.slice(1).join(' '));
  }
  return { sync, dispose() { document.removeEventListener('click', onClick); document.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); for (const [id, b] of buttons) release(id, b); root_.remove(); boxes.clear(); buttons.clear(); for (const k of ['data-lh-scene', 'data-lh-overlays', 'data-lh-settled']) html.removeAttribute(k); attrs.clear(); } };
}
