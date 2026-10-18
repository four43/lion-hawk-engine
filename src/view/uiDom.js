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
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i]; if (r.type === 'attributes') return true;
      for (let j = 0; j < r.addedNodes.length; j++) { const n = r.addedNodes[j]; if (n.nodeType === 1 && (n.hasAttribute('data-lh-slot') || n.querySelector('[data-lh-slot]'))) return true; }
    }
    return false;
  };
  let dirty = false;
  const mo = win?.MutationObserver ? new win.MutationObserver(rs => { if (slotted(rs)) dirty = true; }) : null;
  mo?.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lh-slot'] });

  // R-8: a sync allocates nothing once its elements exist: reused name lists, the engine's reused control view, and a
  // generation mark instead of live sets
  const names = [], stack = []; let gen = 0, overlaysKey = null, overlaysSeen = [];
  const dropButton = (b, id) => { if (b.gen !== gen) { release(id, b); buttons.delete(id); } };
  const dropBox = (box, name) => { if (box.gen !== gen) { box.el.remove(); boxes.delete(name); } };
  function sync() {
    const scan = dirty || (mo !== null && slotted(mo.takeRecords())); dirty = false; gen++;
    // written by index and trimmed only when the count changes: length = 0 then push would drop and regrow the backing store
    const sv = engine.scene; let n = 0; if (sv.name !== undefined) stack[n++] = sv.name; for (let i = 0; i < sv.overlays.length; i++) stack[n++] = sv.overlays[i];
    if (stack.length !== n) stack.length = n;
    const tree = engine.ui.view(); let m = 0; for (let i = 0; i < n; i++) names[m++] = stack[i]; // the stack's scenes first, then any other with controls
    for (let i = 0; i < tree.length; i++) { const sc = tree[i].scene; let seen = false; for (let j = 0; j < m && !seen; j++) seen = names[j] === sc; if (!seen) names[m++] = sc; }
    if (names.length !== m) names.length = m;
    for (let si = 0; si < names.length; si++) {
      const name = names[si], overlay = si > 0 && stack.includes(name);
      let box = boxes.get(name);
      if (!box) {
        const el = document.createElement('div'); el.setAttribute('data-lh-ui', name);
        if (overlay) el.setAttribute('data-lh-overlay', name);
        boxes.set(name, box = { el, overlay, gen: 0 });
      } else if (box.overlay !== overlay) { overlay ? box.el.setAttribute('data-lh-overlay', name) : box.el.removeAttribute('data-lh-overlay'); box.overlay = overlay; }
      box.gen = gen; place(root_, box.el, si);
      let i = -1;
      for (let ti = 0; ti < tree.length; ti++) {
        const c = tree[ti]; if (c.scene !== name) continue; i++;
        let b = buttons.get(c.id), el;
        // G-E2: an engine-made control moves onto a slot that has since appeared; an adopted element that left the
        // document is replaced by a new slot or, failing that, an engine-made control (a control never goes without one)
        if (b && (b.adopted ? !b.el.isConnected : scan && (el = slotFor(c.id, c.role)))) { release(c.id, b); b = undefined; }
        if (!b) {
          el ??= slotFor(c.id, c.role); const adopted = !!el;
          if (!el) { el = document.createElement(c.role === 'textbox' ? 'input' : 'button'); el.setAttribute('type', c.role === 'textbox' ? 'text' : 'button'); }
          el.setAttribute('data-testid', c.id); owned.set(el, c.id);
          buttons.set(c.id, b = { el, adopted, hold: c.role === 'hold', prog: undefined, down: undefined, label: undefined, enabled: undefined, pressed: undefined, value: undefined, last: undefined, gen: 0 });
        }
        b.gen = gen;
        if (b.label !== c.label) { b.label = c.label; if (!b.adopted) c.role === 'textbox' ? b.el.setAttribute('aria-label', c.label) : (b.el.textContent = c.label); }
        if (c.role === 'textbox' && b.value !== c.value && document.activeElement !== b.el) { b.value = c.value; b.last = c.value; if (b.el.value !== c.value) b.el.value = c.value; }
        if (b.enabled !== c.enabled) { b.enabled = c.enabled; b.el.disabled = !c.enabled; }
        const pressed = c.role === 'switch' || c.role === 'choice' ? !!c.pressed : undefined;
        if (b.pressed !== pressed) { b.pressed = pressed; pressed === undefined ? b.el.removeAttribute('aria-pressed') : b.el.setAttribute('aria-pressed', String(pressed)); }
        if (b.hold) {
          const p = Math.round(c.progress * 1000); if (b.prog !== p) { b.prog = p; b.el.style.setProperty('--lh-progress', String(p / 1000)); } // thousandths: an integer, so the compare boxes nothing
          if (b.down !== c.pressed) { b.down = c.pressed; c.pressed ? b.el.setAttribute('data-lh-down', '') : b.el.removeAttribute('data-lh-down'); }
        }
        if (!b.adopted) place(box.el, b.el, i);
      }
    }
    buttons.forEach(dropButton); boxes.forEach(dropBox); // Map.forEach with callbacks made once: no iterator or entry arrays
    setHtml('data-lh-scene', stack[0] ?? '');
    let same = overlaysKey !== null && overlaysSeen.length === Math.max(0, stack.length - 1); // stack[1..], joined only when it changes
    for (let i = 1; same && i < stack.length; i++) same = overlaysSeen[i - 1] === stack[i];
    if (!same) { overlaysSeen = stack.slice(1); overlaysKey = overlaysSeen.join(' '); }
    setHtml('data-lh-overlays', overlaysKey);
  }
  return { sync, adopt() { dirty = true; sync(); }, dispose() { mo?.disconnect(); document.removeEventListener('click', onClick); document.removeEventListener('change', onChange); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('pointerdown', onDown); document.removeEventListener('contextmenu', onMenu); for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) document.removeEventListener(n, onUp); win?.removeEventListener('blur', releaseAll); win?.removeEventListener('pagehide', releaseAll); document.removeEventListener('visibilitychange', onHide); for (const [id, b] of buttons) release(id, b); root_.remove(); boxes.clear(); buttons.clear(); for (const k of ['data-lh-scene', 'data-lh-overlays', 'data-lh-settled']) html.removeAttribute(k); attrs.clear(); } };
}
