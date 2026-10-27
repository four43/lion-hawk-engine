// [D-11] the control helpers a panel's mount gets as `ui`. Each adds a row to the panel body and returns the row element.
// refresh() (the host calls it after the panel's update) re-reads every row and writes only what changed, so an open
// panel whose values sit still costs no DOM work.
// digits null: integers as they are, other numbers to 2 places (table cells)
const show = (v, digits) => (typeof v === 'number' ? (!Number.isFinite(v) || (digits === null && Number.isInteger(v)) ? String(v) : v.toFixed(digits ?? 2)) : String(v ?? '–'));

export function createControls(body, { doc, report }) {
  const rows = []; // { refresh() }
  const el = (tag, attrs = {}, text) => { const e = doc.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; return e; };
  const row = (parent, label) => { const r = el('label', { 'data-lh-debug-row': '' }); r.appendChild(el('span', { 'data-lh-debug-label': '' }, label)); parent.appendChild(r); return r; };
  const guard = fn => (...a) => { try { return fn(...a); } catch (err) { report(err); } };

  function make(parent) {
    return {
      value(label, get, { digits = 2, unit = '' } = {}) {
        const r = row(parent, label), out = r.appendChild(el('span', { 'data-lh-debug-value': '' })); let last = null;
        rows.push({ refresh() { const t = show(get(), digits) + (unit ? ` ${unit}` : ''); if (t !== last) { last = t; out.textContent = t; } } });
        return r;
      },
      slider(label, obj, key, { min = 0, max = 1, step = 0.01 } = {}) {
        const r = row(parent, label);
        const input = r.appendChild(el('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'data-lh-debug-control': '' }));
        const out = r.appendChild(el('output', { 'data-lh-debug-value': '' })); let last;
        const write = v => { last = v; input.value = String(v); out.textContent = String(v); };
        input.addEventListener('input', guard(() => { const v = Number(input.value); obj[key] = v; last = v; out.textContent = input.value; }));
        write(obj[key]);
        rows.push({ refresh() { const v = obj[key]; if (v !== last) write(v); } });
        return r;
      },
      check(label, obj, key) {
        const r = row(parent, label), input = r.appendChild(el('input', { type: 'checkbox', 'data-lh-debug-control': '' })); let last;
        const write = v => { last = v; input.checked = v === true; };
        input.addEventListener('change', guard(() => { obj[key] = input.checked; last = input.checked; }));
        write(obj[key]);
        rows.push({ refresh() { const v = obj[key]; if (v !== last) write(v); } });
        return r;
      },
      button(label, fn) {
        const b = el('button', { type: 'button', 'data-lh-debug-control': '' }, label);
        b.addEventListener('click', guard(() => fn()));
        parent.appendChild(b); return b;
      },
      table(get, columns) {
        const t = el('table', { 'data-lh-debug-table': '' }), head = t.appendChild(el('tr')), cells = []; // cells[i][j]: { td, text }
        for (const c of columns) head.appendChild(el('th', {}, c));
        parent.appendChild(t);
        rows.push({ refresh() {
          const list = get() ?? [];
          while (cells.length > list.length) { cells.pop(); t.lastElementChild.remove(); }
          while (cells.length < list.length) { const tr = t.appendChild(el('tr')); cells.push(columns.map(() => ({ td: tr.appendChild(el('td')), text: null }))); }
          for (let i = 0; i < list.length; i++) for (let j = 0; j < columns.length; j++) {
            const c = cells[i][j], s = show(list[i]?.[columns[j]], null); if (s !== c.text) { c.text = s; c.td.textContent = s; }
          }
        } });
        return t;
      },
      group(title) {
        const d = el('details', { open: '', 'data-lh-debug-group': '' }); d.appendChild(el('summary', {}, title)); parent.appendChild(d);
        return make(d);
      },
    };
  }
  const ui = make(body);
  return { ui, refresh() { for (let i = 0; i < rows.length; i++) rows[i].refresh(); } };
}
