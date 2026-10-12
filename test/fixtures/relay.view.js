// Browser entry for 2f's relay game (G-E1): with ?lh-bridge=host|guest the engine is bound to the Node bridge through a
// port on the engine's own wall clock. window.bytes keeps every binary message the page received, as byte arrays;
// window.transport is the page's bridge transport.
import { boot, defineView } from '../../src/index.view.js';
import { bridgeTransport, createPort } from '../../src/index.net.js';
import relay from './relay.js';

const { engine } = boot(relay, defineView({ scenes: {} }));
const role = new URLSearchParams(location.search).get('lh-bridge');
if (role) {
  const transport = bridgeTransport();
  window.bytes = []; window.transport = transport; // tests send raw bytes through it
  transport.on('message', (from, d) => { if (d instanceof ArrayBuffer) window.bytes.push([...new Uint8Array(d)]); });
  createPort(engine, { transport, role, clock: () => engine.time.wall });
}
