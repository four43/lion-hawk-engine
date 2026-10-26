# Discrepancies

Places where docs disagree with the code at commit `7224d6b` (F02 and F07: `cb8b3d3`). The `docs/research-engine-sound.md` items compare the reference prototype with the port, which changed some names and constants on purpose. The code is the source of truth. Each entry gives evidence on both sides. Each spec lists the same items under "Open questions and discrepancies".

## F02 Definitions and kits ([defs-and-kits.md](../defs-and-kits.md))

- docs/design.md 7.3 sketches the vehicle input as { throttle, brake, steer, handbrake, gear? } and the per-wheel output with slip. The kit takes per-wheel controls through car.set and reports kappa and alpha on the tire backend. Evidence: `docs/design.md:356-357`, `src/kits/vehicle/sim.js:165`, `src/kits/vehicle/sim.js:180`

- `docs/research-engine-sound.md` section 3.5 says the prototype automatic clutch slips at 2.0 N m per rpm when not launching. The powertrain uses 8, and `docs/spec.md` H-6 also says 8. [docs/research-engine-sound.md:148; src/kits/vehicle/powertrain.js:93; docs/spec.md:449]
- `docs/research-engine-sound.md` section 5 names the second listening position `engineBay`. The code names it `bay` in the `mic` option and in `MIX_DB`. [docs/research-engine-sound.md:367; src/kits/vehicle/view.js:8; src/kits/vehicle/view.js:13]
- `docs/research-engine-sound.md` section 2.1 gives the default of `pops` as 0. The `EngineDSP` frame starts with `pops` 1, and `createEngineSound` sends `pops` 0 unless the `pops` option is true. [docs/research-engine-sound.md:46; src/kits/vehicle/engineDsp.js:25; src/kits/vehicle/view.js:24]
- `docs/research-engine-sound.md` section 2.2 says the engine message is sent when the engine changes. `createEngineSound` sends it once after the synth is ready and has no call that sends another. [docs/research-engine-sound.md:64; src/kits/vehicle/view.js:42]

## F03 Simulation world, physics and fields ([sim-world-physics.md](../sim-world-physics.md))

- docs/spec.md M-14 says fields allocate nothing. The fields reuse their own objects and arrays. Only the Rapier getter vectors (translation, rotation, linvel, angvel, parent) are fresh in each step. Evidence: `docs/spec.md:181`, `src/sim/fields/index.js:93-94`, `src/sim/fields/index.js:139-145`, `src/sim/fields/index.js:149`, `src/sim/fields/index.js:178`

## F08 Test helpers ([testing.md](../testing.md))

- docs/research-testing.md proposes replay.run(file), fuzz, a flow DSL, toMatchGolden and tap(label). testing/ exports none of the first four, and the driver tap takes a test id. The document says its section is a proposal and that docs/spec.md holds the adopted version. Evidence: `docs/research-testing.md:123`, `docs/research-testing.md:139-140`, `docs/research-testing.md:154`, `docs/research-testing.md:157`, `testing/index.js:2-10`, `testing/playwright.js:231-232`
