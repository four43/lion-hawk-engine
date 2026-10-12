import test from 'node:test';
import assert from 'node:assert/strict';
import { F, checkSchema, wireCodec, defineGame, axis, button, actions } from '../src/index.sim.js';

const IDS = F.list(F.uint(2, 0xfffe), 16), PAINT = F.obj({ body: F.oneOf(['red', 'blue']), trim: F.oneOf(['red', 'blue']) });
const TABLE = { hello: { v: F.uint(1, 3, 3), paint: PAINT }, claim: { ids: IDS }, help: { id: F.id() }, regrow: {} };

test('2f: checkSchema accepts good data, drops unknown keys and refuses the rest (N-3)', () => {
  assert.deepEqual(checkSchema(TABLE.claim, { ids: [3, 4], extra: 1 }), { ids: [3, 4] });
  assert.deepEqual(checkSchema(TABLE.help, { id: null }), { id: null });
  for (const bad of [{ ids: [1.5] }, { ids: [-1] }, { ids: 'a' }, {}, { ids: Array.from({ length: 17 }, (_, i) => i) }]) assert.equal(checkSchema(TABLE.claim, bad), null, JSON.stringify(bad));
  assert.equal(checkSchema(TABLE.hello, { v: 2, paint: { body: 'red', trim: 'red' } }), null);
  assert.equal(checkSchema(TABLE.hello, { v: 3, paint: { body: 'green', trim: 'red' } }), null);
  assert.equal(checkSchema(TABLE.hello, { v: 3, paint: { body: 'red', trim: 'blue' }, farm: undefined }) !== null, true);
});
test('2f: checkSchema covers every field type, two-sided (N-3, #3)', () => {
  const S = { b: F.bool(), x: F.fixed(-1, 1, 0.01), a: F.angle(), q: F.quat(), i: F.id(), act: F.actions(actions({ steer: axis(), horn: button() })) };
  const ok = { b: true, x: 1, a: 7, q: { x: 0, y: 0, z: 0, w: 1 }, i: 0xfffe, act: { steer: -1, horn: false } };
  assert.deepEqual(checkSchema(S, ok), ok);
  for (const [k, v] of [['b', 1], ['x', 1.01], ['x', -1.01], ['x', NaN], ['a', Infinity], ['q', { x: 0, y: 0, z: 0 }], ['i', 0xffff], ['i', -1], ['act', { steer: 1.5, horn: false }], ['act', { steer: 0, horn: 1 }]])
    assert.equal(checkSchema(S, { ...ok, [k]: v }), null, `${k} ${v}`);
  for (const d of [null, [], 'x', 3]) assert.equal(checkSchema(S, d), null);
  const copy = checkSchema(TABLE.claim, { ids: [1] }); const src = { ids: [1] }; assert.notEqual(checkSchema(TABLE.claim, src).ids, src.ids, 'a copy');
  assert.deepEqual(copy, { ids: [1] });
  assert.deepEqual(checkSchema({ l: F.list(F.bool(), 3, 1) }, { l: [] }), null, 'list min');
});
test('2f: the json and binary wire codecs round-trip a table and drop bad wires (#91)', () => {
  for (const codec of ['json', 'binary']) {
    const w = wireCodec(TABLE, { codec });
    for (const [tag, data] of [['hello', { v: 3, paint: { body: 'blue', trim: 'red' } }], ['claim', { ids: [1, 2, 3] }], ['help', { id: 7 }], ['regrow', {}]]) {
      const wire = w.encode(tag, data); if (codec === 'json') assert.deepEqual(wire, { t: tag, ...data }); else assert.ok(wire instanceof ArrayBuffer);
      assert.deepEqual(w.decode(wire), { tag, data }, `${codec} ${tag}`);
    }
    assert.equal(w.decode(codec === 'json' ? { t: 'nope' } : new ArrayBuffer(2)), null);
    assert.throws(() => w.encode('claim', { ids: [-1] }), /wire: 'claim' does not match its schema/);
  }
});
test('2f: the binary codec drops truncated, padded and out-of-range wires; json drops bad fields', () => {
  const w = wireCodec(TABLE, { codec: 'binary' }), good = new Uint8Array(w.encode('claim', { ids: [1, 2] }));
  assert.deepEqual([...good.slice(0, 3)], [0x20, 1, 2], '[0x20, tag index, list count, ...]');
  const ab = a => new Uint8Array(a).buffer;
  for (const bad of [ab(good.slice(0, -1)), ab([...good, 0]), ab([0x20, 4]), ab([0x21, 3]), ab([0x20, 0, 2, 0]), ab([0x20, 0, 3, 7]), ab([0x20, 1, 17]), { t: 'claim', ids: [1] }, null])
    assert.equal(w.decode(bad), null);
  assert.deepEqual(w.decode(ab([0x20, 3])), { tag: 'regrow', data: {} });
  const j = wireCodec(TABLE);
  for (const bad of [{ t: 'claim', ids: [1.5] }, { t: 'help' }, null, [], new ArrayBuffer(3), { t: 'toString' }]) assert.equal(j.decode(bad), null);
  assert.deepEqual(j.decode({ t: 'help', id: null, from: 'x' }), { tag: 'help', data: { id: null } }, 'unknown keys dropped');
  assert.throws(() => j.encode('nope', {}), /wire: unknown tag 'nope'/);
  assert.throws(() => wireCodec(TABLE, { codec: 'xml' }), /codec must be 'json' or 'binary'/);
  assert.throws(() => wireCodec({ a: { t: F.bool() } }), /may not declare 't'/);
  assert.throws(() => wireCodec({ a: { x: 3 } }), /wire.a.x is not an F field/);
});
test('2f: defineGame checks the net config: every wire tag names a schema\'d command', () => {
  assert.throws(() => defineGame({ id: 'n', start: 's', scenes: { s: {} }, net: { kinds: [], maxSender: 4, rates: { host: { reliable: 60, fast: 60 }, guest: { reliable: 60, fast: 120 } }, wire: { toHost: { claim: 'host.claim' }, toGuest: {} }, codec: 'json' } }), /net.wire.toHost.claim: 'host.claim' is not a command with a schema/);
});
test('2f: defineGame fills the net defaults and refuses bad limits', () => {
  const net = { kinds: [], maxSender: 4, rates: { host: { reliable: 60, fast: 60 }, guest: { reliable: 60, fast: 120 } }, wire: { toHost: { claim: 'host.claim' }, toGuest: { hi: 'guest.hi' } } };
  const commands = { 'host.claim': { schema: TABLE.claim, handler() {} }, 'guest.hi': { schema: TABLE.hello, handler() {} }, plain() {} };
  const g = defineGame({ id: 'n', start: 's', scenes: { s: {} }, commands, net });
  assert.equal(g.net.maxJson, 2048); assert.equal(g.net.maxFrame, 16384); assert.equal(g.net.codec, 'json');
  assert.equal(g.schemas['host.claim'], TABLE.claim); assert.equal(typeof g.commands['host.claim'], 'function'); assert.equal(g.commands.plain, commands.plain);
  for (const [patch, re] of [[{ maxSender: 0 }, /net.maxSender/], [{ maxSender: 256 }, /net.maxSender/], [{ maxJson: 0 }, /net.maxJson/], [{ codec: 'xml' }, /net.codec/],
    [{ rates: { host: { reliable: 60, fast: 0 }, guest: { reliable: 1, fast: 1 } } }, /net.rates.host.fast/], [{ rates: { host: { reliable: 1, fast: 1, reliableFrames: -1 }, guest: { reliable: 1, fast: 1 } } }, /net.rates.host.reliableFrames/],
    [{ rates: { host: { reliable: 1, fast: 1 } } }, /net.rates.guest/], [{ wire: { toHost: {} } }, /net.wire.toGuest/], [{ kinds: 'x' }, /net.kinds/]])
    assert.throws(() => defineGame({ id: 'n', start: 's', scenes: { s: {} }, commands, net: { ...net, ...patch } }), re);
  for (const [c, re] of [[{ handler() {} }, /commands.x.schema must be an object/], [{ schema: {} }, /commands.x must be a function or/], [{ schema: { a: 1 }, handler() {} }, /commands.x.schema.a is not an F field/]])
    assert.throws(() => defineGame({ id: 'r', start: 's', scenes: { s: {} }, commands: { x: c } }), re);
  for (const k of ['at', 'reliable']) assert.throws(() => defineGame({ id: 'r', start: 's', scenes: { s: {} }, commands: { x: { schema: { [k]: F.bool() }, handler() {} } } }), new RegExp(`may not declare reserved key '${k}'`));
});
test('2f: binary round-trips id: null and a fixed/bool mix (fixed quantised); undefined in a required field is refused', () => {
  const T = { help: { id: F.id() }, mix: { on: F.bool(), x: F.fixed(-1, 1, 0.01), off: F.bool(), y: F.fixed(0, 10, 0.5) } };
  const w = wireCodec(T, { codec: 'binary' });
  assert.deepEqual(w.decode(w.encode('help', { id: null })), { tag: 'help', data: { id: null } });
  const got = w.decode(w.encode('mix', { on: true, x: -0.333, off: false, y: 7.4 })).data;
  assert.deepEqual([got.on, got.off], [true, false]);
  assert.ok(Math.abs(got.x - -0.333) <= 0.005 + 1e-9 && Math.abs(got.y - 7.4) <= 0.25 + 1e-9, JSON.stringify(got));
  assert.deepEqual(w.decode(w.encode('mix', got)).data, got, 'a quantised value round-trips exactly');
  assert.equal(checkSchema(TABLE.claim, { ids: undefined }), null);
  assert.equal(checkSchema(T.mix, { on: undefined, x: 0, off: false, y: 0 }), null);
});
