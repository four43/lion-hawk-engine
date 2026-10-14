// Task 8b (3l Integrator request 6): paint that keeps each vertex's shading, a hue-ramp paint and repaint, on one program per
// feature set. The look's oracle is Tractor Pickup 1.8's paintable (games/tractor-pickup/src/render/vehicles3d.js), copied below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, ShaderLib } from 'three';
import { defineMaterials } from '../src/defs/materials.js';
import { createMaterialCompiler } from '../src/view/materials/compiler.js';
import { patchShader } from '../src/view/materials/chunks.js';

const REG = defineMaterials({ testMud: { look: { color: '#ff0000' }, coverage: { dirt: 1 } } });
const compile = m => { const sh = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, null); return sh; };
// a strip of n vertices along z from -1 to 1 (x alternates 0, 1), grey rising 0.2 → 0.8, times scale
function strip(n, scale = 1) {
  const g = new BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = i % 2; pos[i * 3 + 2] = -1 + 2 * i / (n - 1); col.fill((0.2 + 0.6 * i / (n - 1)) * scale, i * 3, i * 3 + 3); }
  g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}
const mesh = (name, geo, p = [0, 0, 0]) => { const m = new Mesh(geo, new MeshStandardMaterial({ name })); m.name = name; m.position.fromArray(p); m.receiveShadow = true; return m; };
// a little tractor: body (paint-body, z from -1.5), fenders at z + 2 and the darker roof on them (both paint-trim), glass (testMud)
function model() {
  const root = new Group(), body = mesh('paint-body', strip(8), [0, 0, -0.5]), fenders = mesh('paint-trim', strip(6), [0, 0, 2]);
  const roof = mesh('paint-trim', strip(4, 0.5), [0, 1, 0]), glass = mesh('testMud', strip(4));
  root.add(body, fenders, glass); fenders.add(roof);
  return { root, body, fenders, roof, glass };
}
// Tractor 1.8's paintable over rows { area 1 | 2, pos (model space), col (linear) }: the paint, or the rainbow hue at z, times
// 0.25 + 0.85 × the vertex's brightness over its area's brightest, capped at 1.1
const PAINTS = { blue: '#2f6fd6', yellow: '#f2c230' };
function paintable18(rows, { body, trim }) {
  const top = [0, 0, 0], c = new Color();
  const lum = rows.map(r => Array.from({ length: r.col.length / 3 }, (_, i) => 0.3 * r.col[i * 3] + 0.6 * r.col[i * 3 + 1] + 0.1 * r.col[i * 3 + 2]));
  rows.forEach((r, j) => lum[j].forEach(l => { top[r.area] = Math.max(top[r.area], l); }));
  return rows.map((r, j) => lum[j].flatMap((l, i) => {
    const name = r.area === 1 ? body : trim, k = Math.min(1.1, 0.25 + 0.85 * l / top[r.area]);
    if (name === 'rainbow') c.setHSL(((r.pos[i * 3 + 2] + 1) * 0.5) % 1, 0.75, 0.5); else c.set(PAINTS[name]);
    return [c.r * k, c.g * k, c.b * k];
  }));
}
// chunks.js paint() for a plain mesh, in JS: the vertex stage's vLhPaint and the fragment's choice (null: mode 0, three's own colours)
const fract = x => x - Math.floor(x);
function drawn(m, a, i, out) {
  const u = compile(m).uniforms, md = u.uPaintMode.value, ax = u.uPaintAxis.value, sh = u.uPaintShade.value, k = Math.min(sh.z, sh.x + sh.y * a.getW(i));
  if (md.x > 1.5) return out.setHSL(fract(ax.x * a.getX(i) + ax.y * a.getY(i) + ax.z * a.getZ(i) + ax.w), md.y, md.z).multiplyScalar(k);
  if (md.x > 0.5) return out.copy(m.color).multiplyScalar(k);
  return null;
}

test('PAINT declares its attribute and uniforms in both stages, shades instance colours, and runs before the coverage layers', () => {
  const sh = patchShader({ vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} }, ['PAINT', 'COVERAGE']);
  assert.match(sh.vertexShader, /attribute vec4 lhPaint; uniform vec3 uPaintMode; uniform vec4 uPaintAxis; uniform vec3 uPaintShade; varying vec3 vLhPaint;/);
  assert.match(sh.vertexShader, /#ifdef USE_INSTANCING_COLOR\nvLhPaint \*= instanceColor\.rgb;\n#endif/);
  assert.match(sh.fragmentShader, /uniform vec3 uPaintMode; varying vec3 vLhPaint;/);
  const f = sh.fragmentShader, paint = f.indexOf('diffuseColor.rgb = diffuse * vLhPaint;'), dirt = f.indexOf('// dirt');
  assert.ok(paint > 0 && dirt > paint, `paint first (${paint}), then dirt on top (${dirt})`);
});

test('apply(): vertex-coloured paint slots get PAINT and lhPaint (model-space position, brightness over the slot\'s brightest in the tree)', () => {
  const mc = createMaterialCompiler(REG, { paint: { base: 'testMud' } }), { root, body, fenders, roof, glass } = model();
  mc.apply(root);
  for (const m of [body, fenders, roof]) { assert.equal(m.material.defines.PAINT, ''); assert.equal(m.material.customProgramCacheKey(), 'lh:COVERAGE+PAINT'); }
  assert.equal(glass.material.defines.PAINT, undefined); assert.equal(glass.geometry.attributes.lhPaint, undefined, 'not a paint slot');
  const a = roof.geometry.attributes.lhPaint;
  assert.deepEqual([a.getX(3), a.getY(3), a.getZ(3)], [1, 1, 3], 'roof vertex (1, 0, 1), on the fenders at z + 2, raised 1');
  assert.ok(Math.abs(a.getW(3) - 0.5) < 1e-6, `roof grey 0.4 over the trim's brightest, the fenders' 0.8: w ${a.getW(3)}`);
  assert.ok(Math.abs(fenders.geometry.attributes.lhPaint.getW(5) - 1) < 1e-6);
  assert.ok(Math.abs(body.geometry.attributes.lhPaint.getW(0) - 0.25) < 1e-6, 'the body has its own top');
  assert.deepEqual(compile(body.material).uniforms.uPaintMode.value.toArray(), [0, 0, 0], 'unpainted: mode 0, the vertex colours as authored');
  const copy = root.clone(true);
  mc.apply(copy);
  assert.equal(copy.children[1].children[0].geometry.attributes.lhPaint, a, 'written once per geometry; clones share it');
});

test('paint values: a colour (mode 1) and a hue ramp (mode 2) are uniforms of one program, cached per value', () => {
  const mc = createMaterialCompiler(REG, { paint: { base: 'testMud' } }), { root, body, fenders } = model();
  mc.apply(root, { paint: { body: '#2f6fd6', trim: { hue: {} } } });
  const b = compile(body.material).uniforms, t = compile(fenders.material).uniforms, keep = mc.get('testMud', { vertexColors: true, paint: true });
  assert.deepEqual(b.uPaintMode.value.toArray(), [1, 0, 0]); assert.ok(body.material.color.equals(new Color('#2f6fd6')));
  assert.deepEqual(t.uPaintMode.value.toArray(), [2, 0.75, 0.5]); assert.deepEqual(t.uPaintAxis.value.toArray(), [0, 0, 0.5, 0.5], 'hue = fract((z + 1) / 2)');
  assert.equal(b.uPaintShade, t.uPaintShade, 'one shade uniform per compiler'); assert.deepEqual(b.uPaintShade.value.toArray(), [0.25, 0.85, 1.1]);
  assert.notEqual(b.uPaintMode, t.uPaintMode, 'the mode is per material');
  assert.equal(keep.userData.lh.key, 'testMud|physical|0|1|0|1||COVERAGE+PAINT');
  assert.equal(new Set([keep, body.material, fenders.material].map(m => m.customProgramCacheKey())).size, 1, 'one program');
  assert.equal(fenders.material.userData.lh.key, `${keep.userData.lh.key}|paint:hue:0,0,1:-1,1:0.75,0.5`);
  assert.equal(mc.paint('testMud', { hue: {} }, { vertexColors: true }), fenders.material, 'cached per value; a hue implies paint: true');
  const own = createMaterialCompiler(REG, { paint: { base: 'testMud', shade: [0, 1, 1] } });
  assert.deepEqual(compile(own.get('testMud', { paint: true })).uniforms.uPaintShade.value.toArray(), [0, 1, 1]);
});

test('the drawn colours match Tractor 1.8\'s paintable at every paint vertex, rainbow included', () => {
  const mc = createMaterialCompiler(REG, { paint: { base: 'testMud' } }), { root, body, fenders, roof } = model();
  mc.apply(root);
  const rows = [[body, 1], [fenders, 2], [roof, 2]].map(([m, area]) => {
    const a = m.geometry.attributes.lhPaint, c = m.geometry.attributes.color, pos = [], col = [];
    for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); }
    return { m, area, pos, col };
  });
  const v = n => n === 'rainbow' ? { hue: { axis: [0, 0, 1], from: -1, to: 1, s: 0.75, l: 0.5 } } : PAINTS[n], out = new Color();
  for (const p of [{ body: 'blue', trim: 'yellow' }, { body: 'rainbow', trim: 'rainbow' }, { body: 'yellow', trim: 'blue' }]) {
    mc.repaint(root, { body: v(p.body), trim: v(p.trim) });
    const want = paintable18(rows, p);
    rows.forEach((r, j) => { for (let i = 0; i < r.pos.length / 3; i++) {
      drawn(r.m.material, r.m.geometry.attributes.lhPaint, i, out);
      ['r', 'g', 'b'].forEach((ch, k) => assert.ok(Math.abs(out[ch] - want[j][i * 3 + k]) < 1e-5, `${p.body}/${p.trim} ${r.m.name} vertex ${i} ${ch}: ${out[ch]} vs ${want[j][i * 3 + k]}`));
    } });
  }
});

test('repaint(): per-entity coverage clones repaint in place (same material, same uCoverage); shared ones swap; one program', () => {
  const mc = createMaterialCompiler(REG, { paint: { base: 'testMud' } }), { root, body, fenders } = model();
  const { uCoverage } = mc.apply(root, { coverage: true, paint: { body: '#2f6fd6' } }), own = body.material;
  assert.equal(own.userData.lhShared, false);
  assert.equal(mc.repaint(root, { body: { hue: {} }, trim: '#f2c230' }), root);
  assert.equal(body.material, own, 'in place: a holder such as coverageView keeps a valid material');
  assert.deepEqual(compile(own).uniforms.uPaintMode.value.toArray(), [2, 0.75, 0.5]);
  assert.equal(compile(own).uniforms.uCoverage.value, uCoverage, 'the entity keeps its dirt vector');
  assert.ok(fenders.material.color.equals(new Color('#f2c230')));
  mc.repaint(root, { trim: '#f2c230' });
  assert.deepEqual(compile(own).uniforms.uPaintMode.value.toArray(), [0, 0, 0], 'no value: back to the vertex colours');
  const s = model();
  mc.apply(s.root);
  const keep = s.body.material;
  mc.repaint(s.root, { body: '#2f6fd6' });
  assert.equal(s.body.material, mc.paint('testMud', '#2f6fd6', { vertexColors: true, paint: true }), 'shared: the cached paint material');
  assert.equal(new Set([own, keep, s.body.material].map(m => m.customProgramCacheKey())).size, 1);
});

test('instanced paint slots shade the instance colour (mode 1); bad values, hues without vertex colours and uncompiled trees throw', () => {
  const mc = createMaterialCompiler(REG, { paint: { base: 'testMud' } }), { root, body } = model();
  mc.apply(root, { instanced: true, paint: { body: { hue: {} } } });
  assert.equal(body.material.userData.lh.instanced, true); assert.equal(body.material.defines.PAINT, '');
  assert.deepEqual(compile(body.material).uniforms.uPaintMode.value.toArray(), [1, 0, 0], 'instanceColor is the paint; values are not per instance');
  assert.throws(() => mc.paint('testMud', { hue: { from: 1, to: 1 } }), /a paint value is a colour or \{ hue/);
  assert.throws(() => mc.paint('testMud', {}), /a paint value is a colour or \{ hue/);
  assert.throws(() => createMaterialCompiler(REG, { paint: { base: 'testMud', shade: [1, 2] } }), /paint\.shade must be \[floor, gain, max\] numbers/);
  assert.throws(() => mc.apply(new Group().add(mesh('paint-body', new BoxGeometry())), { paint: { body: { hue: {} } } }), /a hue paint needs vertex colours \(mesh 'paint-body', paint-body\)/);
  assert.throws(() => mc.repaint(model().root, { body: '#ffffff' }), /repaint\(\) needs a tree compiled by apply\(\)/);
});
