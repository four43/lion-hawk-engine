# Discrepancies

Places where docs disagree with the code at commit `7224d6b` (F02 and F07: `4cd5a94`). The code is the source of truth. Each entry gives evidence on both sides. Each spec lists the same items under "Open questions and discrepancies".

## F02 Definitions and kits ([defs-and-kits.md](../defs-and-kits.md))

- docs/design.md 7.3 sketches the vehicle input as { throttle, brake, steer, handbrake, gear? } and the per-wheel output with slip. The kit takes per-wheel controls through car.set and reports kappa and alpha on the tire backend. Evidence: `docs/design.md:356-357`, `src/kits/vehicle/sim.js:165`, `src/kits/vehicle/sim.js:180`

## F03 Simulation world, physics and fields ([sim-world-physics.md](../sim-world-physics.md))

- docs/spec.md M-14 says fields allocate nothing. The fields reuse their own objects and arrays. Only the Rapier getter vectors (translation, rotation, linvel, angvel, parent) are fresh in each step. Evidence: `docs/spec.md:181`, `src/sim/fields/index.js:93-94`, `src/sim/fields/index.js:139-145`, `src/sim/fields/index.js:149`, `src/sim/fields/index.js:178`

## F08 Test helpers ([testing.md](../testing.md))

- docs/research-testing.md proposes replay.run(file), fuzz, a flow DSL, toMatchGolden and tap(label). testing/ exports none of the first four, and the driver tap takes a test id. The document says its section is a proposal and that docs/spec.md holds the adopted version. Evidence: `docs/research-testing.md:123`, `docs/research-testing.md:139-140`, `docs/research-testing.md:154`, `docs/research-testing.md:157`, `testing/index.js:2-10`, `testing/playwright.js:231-232`
