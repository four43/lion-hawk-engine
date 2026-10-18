// I-8: the navigator's pad reader: one step per push, button edges, the family of the pad in use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPadEdges, familyOf, PAD_BUTTONS } from '../src/view/padEdges.js';

const fakePad = (id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', mapping = 'standard') => ({
  id, mapping, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});
const press = (pad, name, on = true) => { pad.buttons[PAD_BUTTONS[name]].pressed = on; pad.buttons[PAD_BUTTONS[name]].value = on ? 1 : 0; };

test('D-pad: one direction per push, none while held, again after release', () => {
  const pad = fakePad(), pe = createPadEdges({ getGamepads: () => [pad] });
  assert.equal(pe.update().dir, null);
  press(pad, 'down'); assert.equal(pe.update().dir, 'down');
  assert.equal(pe.update().dir, null); assert.equal(pe.update().dir, null); // held: no repeat (decision 5)
  press(pad, 'down', false); assert.equal(pe.update().dir, null);
  press(pad, 'down'); assert.equal(pe.update().dir, 'down');
  press(pad, 'down', false); press(pad, 'left'); assert.equal(pe.update().dir, 'left');
});

test('stick: a push past 0.5 steps once on its main axis; it re-arms only near centre', () => {
  const pad = fakePad(), pe = createPadEdges({ getGamepads: () => [pad] });
  pad.axes[0] = 0.4; assert.equal(pe.update().dir, null);              // under the fire threshold
  pad.axes[0] = 0.8; pad.axes[1] = 0.3; assert.equal(pe.update().dir, 'right');
  pad.axes[0] = 1; assert.equal(pe.update().dir, null);                // still pushed: no repeat
  pad.axes[0] = 0.35; assert.equal(pe.update().dir, null);             // eased off but not under 0.3: not re-armed
  pad.axes[0] = 0.9; assert.equal(pe.update().dir, null);
  pad.axes[0] = 0.1; pad.axes[1] = 0.1; pe.update();                    // back near centre: armed
  pad.axes[1] = -0.7; assert.equal(pe.update().dir, 'up');              // standard mapping: up is -y
  pad.axes[1] = 0; pe.update(); pad.axes[0] = -0.6; pad.axes[1] = 0.59; assert.equal(pe.update().dir, 'left'); // the larger axis wins
});

test('buttons: pressed and released edges, down while held, merged across pads', () => {
  const p1 = fakePad(), p2 = fakePad('054c-0ce6-DualSense Wireless Controller'), pe = createPadEdges({ getGamepads: () => [p1, null, p2] });
  press(p2, 'a'); let s = pe.update();
  assert.equal(s.pressed.a, true); assert.equal(s.down.a, true); assert.equal(s.any, true); assert.equal(s.active, true);
  s = pe.update(); assert.equal(s.pressed.a, false); assert.equal(s.down.a, true); assert.equal(s.active, false);
  press(p1, 'a'); s = pe.update(); assert.equal(s.pressed.a, false, 'a second pad pressing a held button adds no edge');
  press(p1, 'a', false); press(p2, 'a', false); s = pe.update(); assert.equal(s.released.a, true); assert.equal(s.down.a, false);
  press(p1, 'start'); press(p1, 'b'); s = pe.update(); assert.equal(s.pressed.start, true); assert.equal(s.pressed.b, true);
});

test('no pads: nothing happens; the family follows the pad in use', () => {
  let pads = [];
  const pe = createPadEdges({ getGamepads: () => pads });
  let s = pe.update(); assert.equal(s.any, false); assert.equal(s.dir, null); assert.equal(s.family, 'xbox');
  const ps = fakePad('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), xb = fakePad();
  pads = [xb, ps];
  press(ps, 'a'); s = pe.update(); assert.equal(s.family, 'ps');
  press(ps, 'a', false); pe.update(); press(xb, 'b'); s = pe.update(); assert.equal(s.family, 'xbox');
});

test('familyOf: vendor ids and names, standard vs generic', () => {
  assert.equal(familyOf({ id: 'DualSense Wireless Controller', mapping: 'standard' }), 'ps');
  assert.equal(familyOf({ id: '054c-05c4-Wireless Controller', mapping: '' }), 'ps');
  assert.equal(familyOf({ id: 'Steam Deck Controller (Vendor: 28de Product: 1205)', mapping: 'standard' }), 'deck');
  assert.equal(familyOf({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard' }), 'xbox');
  assert.equal(familyOf({ id: '8BitDo SN30 Pro (Vendor: 2dc8)', mapping: 'standard' }), 'xbox'); // standard layout: Xbox art
  assert.equal(familyOf({ id: 'USB Joystick (Vendor: 0079)', mapping: '' }), 'generic');
  assert.equal(familyOf(null), 'xbox');
});
