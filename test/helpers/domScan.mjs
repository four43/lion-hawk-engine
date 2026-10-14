// The domAsserts guard's scanner (#103, G-E2): finds assert equality calls whose first two arguments look like DOM node
// expressions, so a failing diff can never inspect a whole happy-dom window. It is a heuristic with known limits:
// - a node held in a plain variable (`const b = q(d, 'x'); assert.equal(b, c)`) is not seen: compare nodes with same();
// - string and template literals are skipped whole, so an expression inside a template's ${…} is not scanned;
// - only the first two arguments are checked (the message argument never holds a node).
export const EQUALITY = /assert\.(?:notDeepStrictEqual|notDeepEqual|notStrictEqual|notEqual|deepStrictEqual|deepEqual|strictEqual|equal)\(/g;
export const NODE = /(?:\bq|querySelector|closest|getElementById)\([^()]*\)$|children\[[^\]]*\]$|(?:activeElement|parentNode|parentElement|firstChild|firstElementChild)$/;
// the index of the quote that closes the string or template literal opened at src[i] (escapes honoured)
const skipString = (src, i) => {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === quote) return j; }
  return src.length;
};
// the first two top-level arguments of the call whose '(' is at src[at]
export function callArgs(src, at) {
  const out = []; let depth = 0, start = at + 1;
  for (let i = at + 1; i < src.length && out.length < 2; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(src, i); continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth-- === 0) { out.push(src.slice(start, i)); break; } }
    else if (ch === ',' && depth === 0) { out.push(src.slice(start, i)); start = i + 1; }
  }
  return out.map(s => s.trim());
}
// 'file:line' for every equality call in src with a node-like argument
export function nodeEqualities(src, file = '') {
  const bad = [];
  for (const m of src.matchAll(EQUALITY)) {
    const at = m.index + m[0].length - 1;
    if (callArgs(src, at).some(a => NODE.test(a))) bad.push(`${file}:${src.slice(0, at).split('\n').length}`);
  }
  return bad;
}
