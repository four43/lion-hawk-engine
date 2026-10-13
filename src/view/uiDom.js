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
    const o = ownerOf(e.target); if (!o || o.el.tagName !== 'BUTTON' || buttons.get(o.id)?.hold) return; // a hold is pressed, not clicked (#9)
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
  // #9: holds press on pointerdown (captured) or Space/Enter and release when that pointer/key lifts
  const downs = new Map(); let keyId, keyKey; // pointerId -> control id; the control and key a Space/Enter press holds
  const holding = id => { for (const v of downs.values()) if (v === id) return true; return keyId === id; };
  const press = id => { try { engine.ui.press(id); } catch (err) { fail(err); } sync(); onTap?.(); };
  const lift = id => { engine.ui.release(id); sync(); onTap?.(); };
  const onDown = e => {
    if (e.button) return; // only the primary button (or a touch/pen contact) presses
    const o = ownerOf(e.target); if (!o || !buttons.get(o.id)?.hold) return;
    o.el.setPointerCapture?.(e.pointerId); downs.set(e.pointerId, o.id); press(o.id);
  };
  const onUp = e => { const id = downs.get(e.pointerId); if (id !== undefined) { downs.delete(e.pointerId); if (!holding(id)) lift(id); } }; // the last pointer/key on a hold lifts it
  const onMenu = e => { const o = ownerOf(e.target); if (o && buttons.get(o.id)?.hold) e.preventDefault?.(); };
  const onKeyUp = e => { if (keyId !== undefined && e.key === keyKey) { const id = keyId; keyId = keyKey = undefined; e.preventDefault?.(); if (!holding(id)) lift(id); } };
  const releaseAll = () => { const ids = new Set(downs.values()); if (keyId !== undefined) ids.add(keyId); downs.clear(); keyId = keyKey = undefined; for (const id of ids) lift(id); }; // blur / hidden: no hold may stay pressed unseen
  const onHide = () => { if (document.visibilityState === 'hidden') releaseAll(); };
  const win = document.defaultView;
  const onKey = e => {
    if (e.key === ' ' || e.key === 'Enter') {
      const o = ownerOf(e.target);
      if (o && buttons.get(o.id)?.hold) { e.preventDefault?.(); if (!e.repeat && keyId === undefined) { keyId = o.id; keyKey = e.key; press(o.id); } return; }
    }
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return; const o = ownerOf(e.target); if (o?.el.tagName !== 'INPUT') return;
    const c = buttons.get(o.id); commit(o, c); o.el.blur?.(); e.preventDefault?.();
  };
  document.addEventListener('click', onClick); document.addEventListener('change', onChange); document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp); document.addEventListener('pointerdown', onDown); document.addEventListener('contextmenu', onMenu);
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(n, onUp);
  win?.addEventListener('blur', releaseAll); win?.addEventListener('pagehide', releaseAll); document.addEventListener('visibilitychange', onHide);
  const slotFor = (id, role) => {
    const tag = role === 'textbox' ? 'INPUT' : 'BUTTON';
    for (const el of document.querySelectorAll(`[data-lh-slot="${id.replace(/["\\]/g, '\\$&')}"]`)) if (el.tagName === tag && !owned.has(el)) return el;
  };
  const release = (id, b) => { owned.delete(b.el); if (b.adopted) { b.el.removeAttribute('data-testid'); b.el.removeAttribute('aria-pressed'); b.el.disabled = true; } else b.el.remove(); };
  // G-E2 late adoption: a sync looks for slots for its engine-made controls only after a mutation that could have added
  // one (an element that is or holds a [data-lh-slot], or that attribute changing), or after adopt(). takeRecords() makes
  // markup built earlier in the same task count; with nothing changed a sync does no querying at all.
  const slotted = rs => {
    for (const r of rs) {
      if (r.type === 'attributes') return true;
      for (const n of r.addedNodes) if (n.nodeType === 1 && (n.hasAttribute('data-lh-slot') || n.querySelector('[data-lh-slot]'))) return true;
    }
    return false;
  };
  let dirty = false;
  const mo = win?.MutationObserver ? new win.MutationObserver(rs => { if (slotted(rs)) dirty = true; }) : null;
  mo?.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lh-slot'] });

  function sync() {
    const scan = dirty || (mo !== null && slotted(mo.takeRecords())); dirty = false;
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
        const c = list[i]; let b = buttons.get(c.id), el;
        // G-E2: an engine-made control moves onto a slot that has since appeared; an adopted element that left the
        // document is replaced by a new slot or, failing that, an engine-made control (a control never goes without one)
        if (b && (b.adopted ? !b.el.isConnected : scan && (el = slotFor(c.id, c.role)))) { release(c.id, b); b = undefined; }
        if (!b) {
          el ??= slotFor(c.id, c.role); const adopted = !!el;
          if (!el) { el = document.createElement(c.role === 'textbox' ? 'input' : 'button'); el.setAttribute('type', c.role === 'textbox' ? 'text' : 'button'); }
          el.setAttribute('data-testid', c.id); owned.set(el, c.id);
          buttons.set(c.id, b = { el, adopted, hold: c.role === 'hold', prog: undefined, down: undefined, label: undefined, enabled: undefined, pressed: undefined, value: undefined, last: undefined });
        }
        if (b.label !== c.label) { b.label = c.label; if (!b.adopted) c.role === 'textbox' ? b.el.setAttribute('aria-label', c.label) : (b.el.textContent = c.label); }
        if (c.role === 'textbox' && b.value !== c.value && document.activeElement !== b.el) { b.value = c.value; b.last = c.value; if (b.el.value !== c.value) b.el.value = c.value; }
        if (b.enabled !== c.enabled) { b.enabled = c.enabled; b.el.disabled = !c.enabled; }
        const pressed = c.role === 'switch' || c.role === 'choice' ? !!c.pressed : undefined;
        if (b.pressed !== pressed) { b.pressed = pressed; pressed === undefined ? b.el.removeAttribute('aria-pressed') : b.el.setAttribute('aria-pressed', String(pressed)); }
        if (b.hold) {
          const p = String(Math.round(c.progress * 1000) / 1000); if (b.prog !== p) { b.prog = p; b.el.style.setProperty('--lh-progress', p); }
          if (b.down !== c.pressed) { b.down = c.pressed; c.pressed ? b.el.setAttribute('data-lh-down', '') : b.el.removeAttribute('data-lh-down'); }
        }
        if (!b.adopted) place(box.el, b.el, i);
      }
    }
    for (const [id, b] of buttons) if (!liveIds.has(id)) { release(id, b); buttons.delete(id); }
    for (const [name, box] of boxes) if (!live.has(name)) { box.el.remove(); boxes.delete(name); }
    setHtml('data-lh-scene', stack[0] ?? '');
    setHtml('data-lh-overlays', stack.slice(1).join(' '));
  }
  return { sync, adopt() { dirty = true; sync(); }, dispose() { mo?.disconnect(); document.removeEventListener('click', onClick); document.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('pointerdown', onDown); document.removeEventListener('contextmenu', onMenu); for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) document.removeEventListener(n, onUp); win?.removeEventListener('blur', releaseAll); win?.removeEventListener('pagehide', releaseAll); document.removeEventListener('visibilitychange', onHide); for (const [id, b] of buttons) release(id, b); root_.remove(); boxes.clear(); buttons.clear(); for (const k of ['data-lh-scene', 'data-lh-overlays', 'data-lh-settled']) html.removeAttribute(k); attrs.clear(); } };
}
