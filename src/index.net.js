// lion-hawk/net: transports and the port (N-1…N-4). Node and browser; not sim-pure (a port reads the injected clock, withLag a timer).
export { emitter, createMemoryHub, parseLag, withLag, roomLink } from './net/transport.js';
export { createPort } from './net/port.js';
export { bridgeTransport } from './net/bridge.js';
