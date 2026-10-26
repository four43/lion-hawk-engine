# Engine sound synthesis: implementation spec

Background for kit-vehicle's powertrain and engine sound ([H-6], [H-7] in spec.md). The code is the truth for what ships; this is the reference model it was ported from.

This document specifies the procedural engine sound system prototyped in **Engine sound lab** (https://claude.ai/artifact/YExDAzhgtv84uxFhNi4kwV). It is written so the system can be reimplemented in a game engine without the prototype at hand.

Where this text and the reference source in the appendices disagree, the source is authoritative. Every constant below was copied from it.

## 1. Overview

The system has two halves that run at different rates:

```
 game / physics thread (60–240 Hz)                 audio thread (sample rate, e.g. 48 kHz)
 ┌──────────────────────────────┐   param frame   ┌────────────────────────────────────────────┐
 │ engine state model           │ ──────────────▶ │ synthesizer                                 │
 │  rpm, manifold pressure,     │  ~20 numbers,   │  crank phase → firing pulses → exhaust      │
 │  fuel cut, limiter, turbo,   │  every frame    │  waveguide → muffler → saturation           │
 │  starter, blow-off events    │                 │  + intake, mechanical, starter, turbo layers│
 └──────────────────────────────┘                 │  → listening position mix → stereo out      │
                                                  └────────────────────────────────────────────┘
```

No samples are used. Everything is generated from the parameter frame.

The guiding idea: engine sound is a train of exhaust pressure pulses, one per cylinder firing, shaped by the exhaust system. The firing order and bank layout give each engine its character; the air charge in each cylinder sets how hard each pulse hits.

### 1.1 The audio "load" axis is air charge

Acoustically, load means how much air is in each cylinder: manifold absolute pressure (MAP), the quantity an ECU calls calculated load. Throttle opening, rpm and boost determine it. External resistance (hills, a dyno brake, gearing) only changes how fast rpm moves for a given throttle. The synthesizer therefore takes `charge` (MAP in bar absolute) as its load input, and the engine model in section 3 shows how to derive it.

## 2. Interface

### 2.1 Parameter frame

Send one frame per game/physics frame. All continuous values are smoothed on the audio thread (section 4.2), so a 60 Hz update rate is enough. Missing fields keep their previous value.

| Field | Type / range | Meaning | Source in the reference model |
|---|---|---|---|
| `rpm` | ≥ 0 | Crankshaft speed | `st.rpm` |
| `charge` | ≈ 0.18 – 2.6 bar abs | Manifold absolute pressure; 1.0 = atmosphere, > 1 = boost | `st.map` |
| `throttle` | 0 – 1 | Driver throttle (excludes idle air) | driver input, forced 0 during shifts |
| `fuelCut` | 0 / 1 | 1 = no combustion this frame (fuel cut on overrun, engine not running, cranking) | `(running && !fuelCut) ? 0 : 1` |
| `limiter` | 0 / 1 | Rev limiter active (spark cut on most cycles) | `st.limiter` |
| `popWin` | 0 – 1 | Afterfire window; set to 1 when fuel cut begins above 2500 rpm, decays to 0 over 1.8 s | `st.popWin` |
| `pops` | 0 / 1 | Enables afterfire pops and crackle (default **0**) | user setting |
| `turbo` | 0 / 1 | Turbocharger fitted | user setting |
| `shaft` | 0 – 1 | Normalized turbo shaft speed | `st.shaft` |
| `boostN` | 0 – ~1.1 | Boost in bar gauge ÷ 1.5 | `st.boost / 1.5` |
| `wg` | 0 – 1 | Wastegate opening | `st.wg` |
| `bovId` | integer | Increment to fire one blow-off / flutter event | counter |
| `bovAmp` | 0.2 – 1.3 | Event strength: `clamp(boost/1.2, 0.2, 1.3)` | set with `bovId` |
| `bovMode` | 0 / 1 | 1 = blow-off valve vents, 0 = compressor flutter (no valve) | user setting |
| `mic` | 0 / 1 / 2 | Listening position: behind the car, engine bay, cabin | camera |
| `vol` | 0 – 1 | Master volume (default 0.6) | user setting |
| `pipe` | 0.6 – 4.2 m | Exhaust pipe length | preset / user |
| `muffler` | 0 / 1 / 2 | Stock, sport, straight pipe (default 1) | user setting |
| `on` | 0 / 1 | Output enabled: `rpm > 25 or starter`; fades over 150 ms | derived |
| `starter` | 0 / 1 | Starter motor engaged | ignition sequence |
| `mixEx`, `mixOv`, `mixIn`, `mixTu`, `mixMe`, `mixSt` | linear gain 0 – 4 | Mixer for the current listening position: exhaust, coast, intake, turbo, engine body, starter | section 6 |

### 2.2 Engine configuration message

Sent once when the engine changes: `{ type: 'engine', angles, banks, header, pulseDeg, gain, stereo }`.

| Field | Meaning |
|---|---|
| `angles[c]` | Firing angle of cylinder c in degrees over the 720° four-stroke cycle, in firing order |
| `banks[c]` | Which exhaust path (0 or 1) cylinder c feeds |
| `header[c]` | Extra delay in milliseconds before cylinder c's pulse reaches the collector (unequal-length headers) |
| `pulseDeg` | Exhaust pulse duration in crank degrees (about the exhaust valve open period) |
| `gain` | Per-engine loudness trim |
| `stereo` | 1 = route bank 0 left and bank 1 right (V engines with separate exits); 0 = sum both banks to center |

### 2.3 Engine presets

| Preset | angles (°) | banks | header (ms) | stereo | idle | redline | limiter | peak torque (N·m @ rpm) | inertia (kg·m²) | pipe (m) | pulseDeg | gain |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Inline-4 | 0,180,360,540 | 0,1,0,1 | 0 | 0 | 850 | 7000 | 7200 | 210 @ 4800 | 0.13 | 2.1 | 230 | 1.00 |
| Flat-4, unequal headers | 0,180,360,540 | 0,1,0,1 | 0,2.6,0,2.6 | 0 | 800 | 6800 | 7000 | 250 @ 4200 | 0.14 | 2.3 | 240 | 1.05 |
| Inline-6 | 0,120,…,600 | 0,1,0,1,0,1 | 0 | 0 | 750 | 7000 | 7200 | 340 @ 4600 | 0.18 | 2.5 | 235 | 0.95 |
| V8 crossplane | 0,90,…,630 | 0,1,0,0,1,0,1,1 | 0 | 1 | 650 | 6500 | 6700 | 530 @ 4400 | 0.24 | 2.7 | 240 | 1.15 |
| V8 flatplane | 0,90,…,630 | 0,1,0,1,0,1,0,1 | 0 | 1 | 900 | 8500 | 8700 | 440 @ 6200 | 0.16 | 1.9 | 225 | 1.00 |
| V12 | 0,60,…,660 | alternating 0,1 | 0 | 1 | 800 | 9000 | 9200 | 620 @ 6800 | 0.22 | 2.2 | 220 | 0.85 |
| 45° V-twin | 0,405 | 0,1 | 0,0.4 | 0 | 900 | 5500 | 5700 | 150 @ 3200 | 0.10 | 1.4 | 210 | 1.45 |

The crossplane V8's bank pattern L R L L R L R R gives each bank uneven 90/180/270° gaps, which is the burble. The flat-4's 2.6 ms header delay on every other cylinder bunches pulses into pairs, which is the rumble. To add an engine, you only need its firing angles, bank routing and, if relevant, header delays.

## 3. Engine state model (reference)

This is the model the prototype uses to produce the parameter frame. In a game you will usually have your own drivetrain. Keep sections 3.1–3.4 anyway: they turn throttle and rpm into the `charge`, `fuelCut`, `limiter` and turbo values the synthesizer depends on. Run at a fixed substep of 2 ms or less.

### 3.1 Manifold pressure

```
idleAir  = running ? clamp(0.05 + (idle - rpm) * 0.00015, 0, 0.14) : 0
thrEff   = max(throttle, idleAir)
area     = 0.012 + thrEff^1.6
ratio    = clamp(area / sqrt(area² + (6.5e-5 · rpm)²), 0.18, 1)
mapTarget = (1 + boost) · ratio                       // bar abs
map     += (mapTarget - map) · min(1, dt / 0.060)     // 60 ms manifold fill
```

This gives about 0.35 bar at idle, about 0.18 bar on a closed throttle at high rpm, and 0.9–1.0 bar at full throttle (more with boost).

### 3.2 Fuel cut, limiter, afterfire window

- Fuel cut starts when `throttle < 0.02` and `rpm > idle + 500`. If it starts above 2500 rpm, set `popWin = 1`.
- Fuel cut ends when `throttle ≥ 0.03` or `rpm < idle + 250`.
- Limiter turns on above `limiter` rpm and off below `limiter - 250` (hysteresis makes it bounce).
- `popWin` is forced to 0 while `throttle > 0.05`, otherwise it decays by `dt / 1.8`.

### 3.3 Torque, friction, starter

```
comb   = running && !fuelCut
Tcurve = torque · clamp(1 - 1.3 · ((rpm - peakRpm) / redline)², 0.35, 1)
Tind   = comb ? Tcurve · max(0, (map - 0.15) / 0.85) · (limiter ? 0.15 : 1) : 0
Tfric  = rpm > 1 ? torque · (0.04 + 0.08 · rpm/redline) + torque · 0.15 · max(0, 1 - map) · min(1, rpm/1000) : 0
Tstart = starter ? torque · 0.6 · max(0, 1 - rpm/320) : 0
rpm   += (Tind + Tstart - Tfric - Tload) / inertia · (60 / 2π) · dt
```

Ignition sequence: pressing start sets `starter = 1` and a crank timer. The engine counts as `running` once the timer passes 0.55 s with rpm above 150. The starter releases once running and rpm exceeds 0.7 × idle, or after 4 s. A running engine stalls if rpm falls below 220 without the starter.

### 3.4 Turbocharger

```
flow   = (rpm/redline) · map · (comb ? 1 : 0.3) · (1.35 - 0.5 · size)       // size 0 = small/quick, 1 = large/laggy
comp   = 1.35 · maxBoost · shaft²                                            // compressor pressure, bar gauge
wg     = clamp((comp - maxBoost) / (0.35 · maxBoost), 0, 1)
target = clamp((1.25 · flow)^1.4, 0, 1) · (1 - 0.45 · wg)
tau    = target > shaft ? 0.35 + 1.8·size : 1.0 + 1.5·size                  // halve tau while fluttering
shaft += (target - shaft) · min(1, dt / tau)

if thrEff > 0.12: boost → min(comp, maxBoost) with tau 0.12 s
else:             boost → 0 with tau 0.06 s (BOV venting), 0.5 s (fluttering) or 0.35 s (otherwise)
```

The feedback through `map` gives a realistic spool knee. Blow-off detection: keep `thrSlow` (throttle smoothed with a 0.2 s time constant). When `thrSlow - thrEff > 0.3` and `boost > 0.15` and a 0.6 s cooldown has expired, increment `bovId`, set `bovAmp = clamp(boost/1.2, 0.2, 1.3)` and `bovMode`, and mark venting for 0.4 s. Without a turbo, shaft and boost decay to 0 (time constants 1.2 s and 0.2 s).

### 3.5 Load modes in the prototype

These exist only to exercise the sound; replace them with your vehicle physics.

- **Free rev (brake dyno):** `Tload = load · torque · 1.1 · clamp((rpm - 0.9·idle) / 2500, 0, 1)`. Torque grows with speed like an eddy-current brake, so it cannot stall the engine at idle.
- **Dyno hold:** rpm is driven to the target with a 0.3 s time constant.
- **Drive:** six-speed car with gears 3.5, 2.1, 1.45, 1.1, 0.88, 0.72, final drive 3.9, wheel radius 0.32 m, Crr 0.013, CdA 0.68 m², mass `clamp(3.2·torque + 350, 600, 1750)` kg, grade up to 12%, braking 8 m/s². Shifts open the clutch for 0.28 s with throttle forced to 0, which naturally triggers the blow-off valve. An automatic clutch slips (0.6 N·m per rpm when launching, 2.0 otherwise, capped at 1.6 × peak torque) and locks when slip falls below 120 rpm.

## 4. Synthesizer

### 4.1 Conventions

- Sample rate `sr` (the prototype runs at the device rate, usually 48 kHz). All time constants below are in seconds and must be converted with `sr`.
- Processing runs in blocks of 64 samples. Filter coefficients that depend on state are recomputed at the start of each block.
- `U` is a uniform random number in [-1, 1); `U01` is uniform in [0, 1). One white sample `nz` is drawn per sample and shared by several layers, as in the reference; other draws are independent.
- **Biquads** use the RBJ cookbook forms, Direct Form I, normalized by `a0`. `LP(f, Q)` is low-pass; `BP(f, Q)` is band-pass with constant 0 dB peak gain (`b0 = α, b2 = -α`); `PEAK(f, Q, dB)` is a peaking EQ. Frequencies are clamped to [10 Hz, 0.45·sr].
- **One-pole smoothing** toward a target with time constant τ: `k = 1 - exp(-1 / (sr·τ))`, `y += (target - y)·k`.
- **Exponential decay** with time constant τ: multiply by `exp(-1 / (sr·τ))` per sample.

### 4.2 Parameter smoothing (per sample)

| Smoothed value | Target | τ |
|---|---|---|
| rpm, charge, throttle, shaft, boostN, wg | frame values | 12 ms |
| output gate `onG` | `on` | 150 ms |
| starter gate `stG` | `starter` | 30 ms |
| cranking depth `crankD` | `starter ? 0.38 · clamp(1 - rpm/520, 0, 1) : 0` | 30 ms |

Everything below uses the smoothed values.

### 4.3 Crank phase and firing

The cycle phase `φ` runs from 0 to 1 over 720°. Firing angles are normalized to `a_c = (angle mod 720) / 720`.

Cranking modulation: while `crankD > 1e-4`, each cylinder approaching compression top dead center loads the starter.

```
load = min(1, Σ_c exp(-(wrap(φ - (a_c - 0.03)) / 0.065)²))      // wrap() into [-0.5, 0.5); peak 21.6° before TDC, width ≈ 47°
spd  = rpm · (1 - crankD · load)                                 // instantaneous crank speed
```

Otherwise `load = 0` and `spd = rpm`.

Advance `φ += spd / 120 / sr`. Fire cylinder c when `φ` crosses `a_c`: if the phase wrapped this sample, fire every `a_c > φ_prev`, subtract 1, then fire every `a_c ≤ φ`; otherwise fire every `a_c` with `φ_prev < a_c ≤ φ` (only while rpm > 1).

### 4.4 Pulse events

Per-cylinder static variation, computed once per engine from deterministic hashes (`frac(x) = x - floor(x)`, n = cylinder count, i = 0-based index):

```
cylVar[i] = 1 + 0.16 · (frac(sin((i+1)·12.9898 + n·78.233) · 43758.5453) - 0.5)
durVar[i] = 1 + 0.12 · (frac(sin((i+1)·39.346 + n·11.135) · 24634.6345) - 0.5)
```

When cylinder c fires:

1. `amp = charge^0.75 · cylVar[c]`, then `amp *= 1 + cv·U` with `cv = 0.05 + 0.25·max(0, 1 - charge)` (combustion variability grows at light load).
2. The cycle burns unless `fuelCut > 0.5`. If the limiter is on, a burning cycle is cut with probability 0.65.
3. If it does not burn:
   - cranking (`starter`): `amp *= 0.55`, and trigger the block thump: `thump = max(thump, 0.7 + 0.3·U01)`;
   - else if fuel cut (coasting): `amp = 0.65 · (0.24 + 0.3·min(1, rpm/6000)) · cylVar[c] · (0.9 + 0.2·U01) · mixOv`. The pistons still pump a full cylinder of air, so this does not depend on charge;
   - else (limiter cut): `amp *= 0.2`;
   - afterfire: with probability `limiter ? 0.3 : 0.2·popWin`, if `pops` and `on`, the pulse becomes a pop with `amp = 0.7 + 1.3·U01`.
4. Take the first free voice from a pool of 48 (drop the event if none is free) and set:

| Voice field | Value |
|---|---|
| `dur` (samples) | `max(24, pulseDeg · durVar[c] / (6 · max(60, rpm)) · sr)`, halved for pops |
| `a` (rise as fraction of dur) | `clamp(0.0016·sr / dur, 0.04, 0.3)`: about a 1.6 ms rise |
| `amp` | `amp · gain` |
| `bank` | `banks[c]` |
| `delay` (samples) | `floor(header[c]·0.001·sr + U01·0.00012·sr)`: header delay plus up to 0.12 ms timing jitter |
| `rasp` | pops: 1.4; otherwise `0.7 · min(1, (rpm/6000) · charge)^0.7` |

5. Pops also arm the crackle on their bank: `crack[bank] = max(crack[bank], 0.5 + 0.7·U01)`.
6. Every event arms the valvetrain tick: `clk = 1`, `clkA = 0.6 + 0.4·U01`.

### 4.5 Pulse voices (per sample)

For each active voice: wait out `delay`; then with `x = t / dur` (end the voice at x ≥ 1) and `u = x / a`:

```
y  = u · e^(1-u) · (1 - x)           // peaks at 1 when x = a, decays to 0 at x = 1
s  = amp · y
p[bank]  += s                        // pressure into the exhaust
n[bank]  += s · rasp                 // turbulence envelope (section 4.7, step 4)
t++
```

Afterfire crackle per bank, while `crack > 1e-3`: add `0.5·crack·U`, plus with probability 0.006 a spike of ±2.2·crack; then decay `crack` with τ = 40 ms.

### 4.6 Block-rate coefficients

| Filter | Setting |
|---|---|
| muffler cutoff `mufCut` | `[1300, 3200, 7000][muffler] · (1 - 0.35·turbo)` Hz |
| brightness `bright` | `[0.15, 0.5, 1.0][muffler] · (1 - 0.4·turbo)` |
| muffler stage 1, each bank | `LP(mufCut, 0.65)` |
| muffler stage 2, each bank | `LP(1.6·mufCut, 0.6)` |
| chamber resonance, each bank | `PEAK(210 / max(0.6, pipe) · (bank ? 0.96 : 1), 1.4, [5, 3.5, 2][muffler] dB)` |
| intake resonance | `BP(120 + 0.025·rpm, 2.5)` |
| intake roar | `BP(650 + 0.08·rpm, 1.1)` |
| turbo whoosh | `BP(1800 + 2800·shaft, 0.9)` |
| wastegate hiss | `BP(2600, 0.7)` |
| blow-off | valve: `BP(900 + 3000·e^(-5·bovT), 1.2)`; flutter: `BP(1250 + 300·e^(-3·bovT), 1.4)` |
| cabin | `LP(750, 0.75)` per channel when the cabin position is active |
| mic low-pass coefficient | `1 - exp(-2π · exLP / sr)` |
| waveguide targets | `N_0 = 2·pipe/480·sr`, `N_1 = 2·pipe·1.035/480·sr` samples (480 m/s ≈ speed of sound in hot exhaust gas) |

Fixed filters, set once: valve tick `BP(2900, 9)` and `BP(4700, 7)`; throttle hiss `BP(2200, 1.2)`; starter growl `LP(650, 0.9)`; gear mesh `LP(1600, 0.8)`; brush noise `BP(1900, 1.3)`; solenoid clunk `BP(850, 2.2)`.

### 4.7 Exhaust chain (per bank, per sample)

1. **DC block:** `y0 = p - p_prev + 0.997 · y0_prev`.
2. **Brightness:** `y = y0 + 6 · bright · (y0 - y0_prev)`.
3. **Pipe waveguide.** A delay line (16384 samples, power-of-two mask) holds the pipe's round trip. Smooth the length `N += (N_target - N) · 0.0005`. Read at `write - N` with linear interpolation, low-pass the reflection `loop += (read - loop) · 0.42`, and apply an inverting, lossy open-end reflection: `y = y - 0.5 · loop`. Write `y` at the write head. Both banks share one write index, advanced once per sample.
4. **Flow turbulence**, added after the pipe so it cannot ring the pipe's fixed resonances:
   ```
   env += (n[bank] - env) · 0.02
   lp  += (U - lp) · 0.2            // ≈ 1.7 kHz
   hp  += (lp - hp) · 0.035         // ≈ 270 Hz
   y   += (lp - hp) · env · 1.6
   ```
5. **Muffler:** stage 1 low-pass, stage 2 low-pass, chamber peak.
6. **Saturation:** `y = tanh(0.45 · drive · y)` with `drive = 1.1 + 1.4 · min(1.6, charge)`; harder at full throttle and under boost.
7. **Mic low-pass:** one-pole at the listening position's `exLP`. The result is `e0` or `e1`.

### 4.8 Intake (per sample)

```
id     = (p0 + p1) - dc;   dc += id · 0.002            // crude high-pass of the pulse sum
ienv  += (|id| - ienv) · 0.01
intake = BP_res(id) · (0.25 + 0.75·throttle) · 0.8
       + BP_roar(nz) · ienv · throttle · min(1, rpm/3500) · 2.2
       + BP_hiss(U) · max(0, 1 - charge) · (1 - throttle) · min(1, rpm/5000) · 0.12 · mixOv   // closed-throttle hiss
```

### 4.9 Mechanical (per sample)

```
// valvetrain tick: short noise burst ringing two metallic modes, fading under combustion noise
ex    = nz · clk · clkA;   clk *= 0.96
mech  = (BP_2900(ex) + 0.6 · BP_4700(ex)) · 0.2 / (1 + rpm/2500)

// engine body: rotating-mass rumble and timing-drive whir, present whenever the engine turns
rn    = min(1.4, rpm/6000)
chPh += rpm/60 · 21 / sr                       // 21-tooth crank sprocket mesh
mlp  += (nz - mlp) · 0.08                      // ≈ 600 Hz low-pass noise
mech += (1.6·mlp + 0.12·sin(2π·chPh)) · rn^1.3 · 0.35
```

### 4.10 Starter (per sample)

On the rising edge of `starter`, set `clunk = 1`.

While `stG > 1e-3`:

```
free  = clamp((380 - rpm) / 80, 0, 1)          // overrunning clutch: drops away once the engine outruns it
ld    = load                                    // from 4.3
arPh += min(spd, 330)/60 · 11 / sr              // armature turns ~11× crank
growl = LP_650( tanh(3·sin(2π·arPh)) + 0.6·saw(frac(2·arPh)) + 0.25·nz )     // saw(x) = 2x - 1
mshF += (min(rpm, 330) · (1 - 0.3·crankD·ld) / 60 · 120 - mshF) · 0.002     // 120-tooth ring gear, gently pitch-bent
stPh += mshF / sr
mesh  = LP_1600(saw(stPh))
comm  = BP_1900(U)
strt  = (0.11·growl·(0.12 + 1.1·ld) + 0.028·mesh·(0.6 + 0.4·ld) + 0.04·comm·(0.4 + 0.6·ld)) · stG · free
```

The low growl that swells and drops in pitch on each compression is the "lug"; keep the mesh tone quiet and only gently bent, or it turns into a wheeze. Then add the one-shots:

```
if clunk > 1e-3: strt += BP_850(nz)·clunk·0.6 + sin(40·clunk)·clunk·0.15;  clunk decays with τ = 14 ms
if thump > 1e-3: thPh += 34/sr; strt += sin(2π·thPh)·thump·0.22;            thump decays with τ = 60 ms
else thPh = 0
```

### 4.11 Turbo (per sample)

```
if turbo:
  whPh += (380 + 4400·shaft) / sr
  tur  = (sin(2π·whPh) + 0.3·sin(4π·whPh + 0.7)) · shaft² · (0.2 + 0.8·min(1, throttle)) · 0.09     // whine
       + BP_whoosh(nz) · shaft · (0.15 + boostN) · 0.22                                            // whoosh
       + BP_wg(U) · wg · 0.12                                                                      // wastegate

// blow-off / flutter event, played even if turbo was just switched off
on bovId change: bovT = 0, bovA = bovAmp, mode = bovMode, flPh = 0
while bovT < 2.5 s:
  att = min(1, bovT / 0.004)
  valve:   tur += BP_bov(U) · bovA · att · e^(-bovT/0.28) · 0.9
  flutter: f = 24 · (1 - 0.45·min(1, bovT));  flPh += f/sr;  sn = sin(2π·flPh)
           env = bovA · att · e^(-bovT/0.45)
           tur += BP_bov(U) · env · (0.5 + 0.5·tanh(5·sn)) · 1.1 + sn · env · 0.08
  bovT += 1/sr
```

### 4.12 Listening position, mix and output

Built-in balance per position (`MIC` table):

| Position | exh | int | tur | mech | st | exLP (Hz) | cabin LP |
|---|---|---|---|---|---|---|---|
| 0 Behind the car | 1.00 | 0.22 | 0.50 | 0.30 | 0.45 | 16000 | no |
| 1 Engine bay | 0.32 | 1.00 | 1.15 | 0.75 | 1.00 | 1700 | no |
| 2 In the cabin | 0.80 | 0.50 | 0.35 | 0.30 | 0.50 | 16000 | yes |

```
center = intake·int·mixIn + mech·mech·mixMe + tur·tur·mixTu + strt·st·mixSt
exG    = exh · mixEx
stereo engines: L = (0.82·e0 + 0.30·e1)·exG + center;   R = (0.82·e1 + 0.30·e0)·exG + center
mono engines:   L = R = 0.62·(e0 + e1)·exG + center
cabin:          L = 1.5·LP_cab(L);  R = 1.5·LP_cab(R)
out = tanh(x · vol · onG · 1.2)
```

The coast gain `mixOv` is applied earlier, inside the fuel-cut pulse amplitude (4.4) and the throttle hiss (4.8), so it only affects the coasting sound.

## 5. Tuned mix defaults

Values in dB on top of the position's built-in balance. Convert with `gain = 10^(dB/20)` (the prototype rounds to 0.01); `null` would mean muted.

```json
{
  "behind":    { "exhaust": 4.1, "coast": 4.1, "intake": 2.7, "turbo": 0,   "engineBody": -8.2,  "starter": 0 },
  "engineBay": { "exhaust": 6.4, "coast": 7.5, "intake": 0,   "turbo": 3.4, "engineBody": -4.7,  "starter": 8.7 },
  "cabin":     { "exhaust": 6.9, "coast": 9.5, "intake": 3,   "turbo": 9.5, "engineBody": -13.6, "starter": 0 }
}
```

Mapping to frame fields: exhaust → `mixEx`, coast → `mixOv`, intake → `mixIn`, turbo → `mixTu`, engineBody → `mixMe`, starter → `mixSt`.

The engine-bay starter value was tuned before the starter was rebuilt (section 4.10) and may now be too loud.

Other defaults: Inline-4, sport muffler, 2.1 m pipe, turbo off, max boost 1.0 bar, turbo size 0.4, blow-off valve on, pops off, behind the car, volume 0.6.

## 6. Integration notes

**Threading.** Run the synthesizer on the audio thread and post parameter frames to it. In a browser use an AudioWorklet (Appendix C shows the wrapper the prototype uses, with a ScriptProcessor fallback). In native engines, put it behind a lock-free queue or atomics; the frame is small enough to copy whole.

**Cost.** One instance rendered offline in Node/V8 at 48 kHz took roughly 40–120 ms per 2 s of audio after warm-up, about 2–6% of one core. Cost scales with active pulse voices, so high-rpm V12s are the most expensive. For several AI cars, run cheaper instances: fewer voices, or skip the starter and turbo layers when they are inactive.

**Listening position.** Pick `mic` from the camera: chase cameras use 0, hood or bonnet cameras use 1, cockpit uses 2. Crossfade two instances, or interpolate the `MIC` row values yourself, if the camera moves between positions continuously. Distance, Doppler and reverb belong after this module, in your spatial audio.

**Porting.** Any uniform RNG works. Float32 is sufficient throughout. In C, C++ or Rust, enable flush-to-zero or add a tiny offset to the long-decaying envelopes and filter states to avoid denormal slowdowns. The `tanh` calls can use a fast rational approximation.

**What the game must provide.** The minimum useful frame is `rpm`, `charge`, `throttle`, `fuelCut` and `limiter`. Derive `charge` with section 3.1 even if your physics has its own torque model, because it is what makes the sound respond to load. Turbo fields, starter, `bovId` and `popWin` are optional layers.

**Natural extensions** (from the NEODRIVE write-up): gearbox whine pitched by wheel speed rather than engine rpm, with slow amplitude modulation; a brief decaying pitch wobble on clutch engagement for driveline flex; a low-pass on the exhaust when the camera faces the front of the car.

## 7. Verification targets

Use these as regression checks after porting. They were measured offline with the Inline-4, sport muffler, 2.1 m pipe, turbo off and **all mixer gains at 0 dB**. Levels are A-weighted and relative to full throttle at 4000 rpm in the same position.

| Condition | Behind | Engine bay | Cabin |
|---|---|---|---|
| Idle (≈ 850 rpm, charge 0.34) | −17.3 dB | −25.2 dB | −17.1 dB |
| Coasting, 2000 rpm | −18.9 dB | −17.6 dB | −19.6 dB |
| Coasting, 4000 rpm | −12.0 dB | −10.0 dB | −13.8 dB |
| Coasting, 6000 rpm | −8.2 dB | −6.0 dB | −10.8 dB |

- **Cranking (285 rpm):** the loudness envelope pulses at about 9 Hz (the compression rate for four cylinders) and most energy sits below 150 Hz. Cranking is about 7.6 dB above idle in the engine bay and about 6.7 dB below idle behind the car (mix at 0 dB).
- **Engine catching:** the starter fades out as rpm passes 300–380 rpm, with no upward pitch sweep.
- **Stability:** no NaN or infinite output across all presets, all listening positions, idle, full throttle, boost, coasting and limiter.
- **Absence checks:** at idle there should be no fixed-pitch buzz from the pipe modes, and no broadband tick above 4 kHz in the engine bay. These were the two most audible bugs during tuning.

## 8. Known limitations

- The pulse shape and pipe model are deliberately simple. They capture character and response, but sound more synthetic than good recordings. If you need more realism, keep this interface and replace sections 4.4–4.7 with clips baked from a full simulator, crossfaded by rpm and charge.
- Tire, wind and gearbox sounds are not included.
- Wheelspin is not modeled in drive mode, so first-gear rpm rise is optimistic for high-torque engines.
- Two exhaust paths only. Engines with more than two separate exits are summed into two.

## References

- sevencrane, *How To Make Car Sound* (NEODRIVE devlog): sample-based rpm × throttle crossfading, gearbox noise, driveline flex. https://sevencrane.itch.io/neodrive/devlog/1322297/how-to-make-car-sound
- Ange Yaghi, *engine-sim*: physics-based engine simulator with an exhaust-impulse-response audio pipeline. https://github.com/ange-yaghi/engine-sim
- Doerfler and Wyse, *Physics-Informed Neural Engine Sound Modeling with Differentiable Pulse-Train Synthesis* (2026): pulse trains aligned to firing patterns through Karplus–Strong exhaust resonators. https://arxiv.org/html/2603.09391

## Appendix A: synthesizer reference source

Self-contained JavaScript class. `render(L, R, n)` fills `n` samples of left and right output (pass `R = null` for mono). `setParams(frame)` merges a parameter frame; `setParams({type: 'engine', ...})` loads an engine configuration.

```js
class EngineDSP {
  static MIC = [
    {exh:1.0, int:0.22, tur:0.5,  mech:0.3,  st:0.45, exLP:16000, cab:0},
    {exh:0.32,int:1.0,  tur:1.15, mech:0.75, st:1.0,  exLP:1700,  cab:0},
    {exh:0.8, int:0.5,  tur:0.35, mech:0.3,  st:0.5,  exLP:16000, cab:1}
  ];
  static bq(){ return {b0:1,b1:0,b2:0,a1:0,a2:0,x1:0,x2:0,y1:0,y2:0}; }
  static set(f,type,freq,Q,sr,gainDb){
    const w=2*Math.PI*Math.min(Math.max(freq,10),sr*0.45)/sr, c=Math.cos(w), s=Math.sin(w), al=s/(2*Q);
    let b0,b1,b2,a0,a1,a2;
    if(type===0){ b0=(1-c)/2; b1=1-c; b2=(1-c)/2; a0=1+al; a1=-2*c; a2=1-al; }
    else if(type===1){ b0=al; b1=0; b2=-al; a0=1+al; a1=-2*c; a2=1-al; }
    else { const A=Math.pow(10,(gainDb||0)/40); b0=1+al*A; b1=-2*c; b2=1-al*A; a0=1+al/A; a1=-2*c; a2=1-al/A; }
    f.b0=b0/a0; f.b1=b1/a0; f.b2=b2/a0; f.a1=a1/a0; f.a2=a2/a0;
  }
  static run(f,x){ const y=f.b0*x+f.b1*f.x1+f.b2*f.x2-f.a1*f.y1-f.a2*f.y2; f.x2=f.x1; f.x1=x; f.y2=f.y1; f.y1=y; return y; }

  constructor(sr){
    this.sr=sr;
    this.t={rpm:0,charge:0.3,throttle:0,fuelCut:1,limiter:0,popWin:0,pops:1,turbo:0,shaft:0,boostN:0,wg:0,
            bovId:0,bovAmp:0,bovMode:1,mic:0,vol:0.6,pipe:2.1,muffler:1,on:0,starter:0,
            mixEx:1,mixOv:1,mixIn:1,mixTu:1,mixMe:1,mixSt:1};
    this.rpm=0; this.charge=0.3; this.thr=0; this.shaft=0; this.boostN=0; this.wg=0; this.onG=0;
    this.phase=0;
    this.voices=[]; for(let i=0;i<48;i++) this.voices.push({on:false,t:0,dur:1,a:0.1,amp:0,bank:0,delay:0,rasp:0});
    this.dl=[new Float32Array(16384),new Float32Array(16384)]; this.dw=0;
    this.N=[420,435]; this.loop=[0,0]; this.dcx=[0,0]; this.dcy=[0,0]; this.px=[0,0]; this.exLP=[0,0];
    const B=EngineDSP.bq;
    this.muf=[B(),B()]; this.muf2=[B(),B()]; this.body=[B(),B()]; this.cab=[B(),B()];
    this.crack=[0,0]; this.rEnv=[0,0]; this.rLP=[0,0]; this.rHP=[0,0];
    this.inRes=B(); this.inNz=B(); this.inEnv=0; this.inDc=0;
    this.whPh=0; this.whoosh=B(); this.wgF=B(); this.bovF=B(); this.bovT=9; this.bovA=0; this.bovMode=1; this.lastBov=0; this.flPh=0;
    this.clk=0; this.clkA=0; this.nPrev=0; this.stPh=0;
    this.stG=0; this.crankD=0; this.load=0; this.lastSt=0; this.clunk=0; this.thump=0; this.thPh=0; this.arPh=0; this.mshF=0;
    this.arLP=B(); EngineDSP.set(this.arLP,0,650,0.9,sr);
    this.hiss=B(); EngineDSP.set(this.hiss,1,2200,1.2,sr); this.mLP=0; this.chPh=0;
    this.stLP=B(); this.stBP=B(); this.ckBP=B(); EngineDSP.set(this.stLP,0,1600,0.8,sr); EngineDSP.set(this.stBP,1,1900,1.3,sr); EngineDSP.set(this.ckBP,1,850,2.2,sr);
    this.tk1=B(); this.tk2=B(); EngineDSP.set(this.tk1,1,2900,9,sr); EngineDSP.set(this.tk2,1,4700,7,sr);
    this.setEngine({angles:[0,180,360,540],banks:[0,1,0,1],header:[0,0,0,0],pulseDeg:230,gain:1,stereo:0});
  }
  setParams(m){ if(m && m.type==='engine') this.setEngine(m); else Object.assign(this.t,m); }
  setEngine(e){
    const nc=e.angles.length, cylVar=[], durVar=[];
    for(let i=0;i<nc;i++){
      const h=Math.sin((i+1)*12.9898+nc*78.233)*43758.5453, r=h-Math.floor(h);
      const h2=Math.sin((i+1)*39.346+nc*11.135)*24634.6345, r2=h2-Math.floor(h2);
      cylVar.push(1+0.16*(r-0.5)); durVar.push(1+0.12*(r2-0.5));
    }
    this.engine={angles:e.angles.map(a=>((a%720)+720)%720/720), banks:e.banks.slice(), header:e.header.slice(),
                 pulseDeg:e.pulseDeg, gain:e.gain, stereo:e.stereo, cylVar, durVar};
  }
  fire(c){
    const T=this.t, E=this.engine, sr=this.sr, rpm=Math.max(60,this.rpm);
    let amp=Math.pow(this.charge,0.75)*E.cylVar[c];
    const cv=0.05+0.25*Math.max(0,1-this.charge);
    amp*=1+cv*(Math.random()*2-1);
    let pop=false, burned=!(T.fuelCut>0.5);
    if(burned && T.limiter && Math.random()<0.65) burned=false;
    if(!burned){
      if(T.starter) amp*=0.55;
      else if(T.fuelCut>0.5) amp=(0.65)*(0.24+0.3*Math.min(1,this.rpm/6000))*E.cylVar[c]*(0.9+0.2*Math.random())*T.mixOv; // fuel cut: no combustion, but each piston still pumps a cylinder of air out
      else amp*=0.2;
      if(T.starter) this.thump=Math.max(this.thump,0.7+0.3*Math.random());
      const pp=T.limiter?0.3:0.2*T.popWin;
      if(T.pops && T.on && Math.random()<pp){ pop=true; amp=0.7+Math.random()*1.3; }
    }
    let v=null; const vs=this.voices; for(let i=0;i<vs.length;i++){ if(!vs[i].on){ v=vs[i]; break; } }
    if(!v) return;
    const dur=Math.max(24,E.pulseDeg*E.durVar[c]/(6*rpm)*sr*(pop?0.5:1));
    v.on=true; v.t=0; v.dur=dur; v.a=Math.min(0.3,Math.max(0.04,(0.0016*sr)/dur));
    v.amp=amp*E.gain; v.bank=E.banks[c];
    v.delay=Math.floor(E.header[c]*0.001*sr+Math.random()*0.00012*sr);
    v.rasp=pop?1.4:0.7*Math.pow(Math.min(1,(this.rpm/6000)*this.charge),0.7);
    if(pop) this.crack[v.bank]=Math.max(this.crack[v.bank],0.5+0.7*Math.random());
    this.clk=1; this.clkA=0.6+0.4*Math.random();
  }
  render(L,R,n){
    const sr=this.sr, T=this.t, run=EngineDSP.run, set=EngineDSP.set;
    const kSt=1-Math.exp(-1/(sr*0.03)), ckD=Math.exp(-1/(sr*0.014)), thD=Math.exp(-1/(sr*0.06)), k=1-Math.exp(-1/(sr*0.012)), kOn=1-Math.exp(-1/(sr*0.15)), cDecay=Math.exp(-1/(sr*0.04));
    for(let off=0;off<n;off+=64){
      const m=Math.min(64,n-off), E=this.engine;
      const turb=T.turbo?1:0, mi=T.muffler|0;
      const mufCut=[1300,3200,7000][mi]*(1-0.35*turb);
      const bright=[0.15,0.5,1.0][mi]*(1-0.4*turb);
      for(let b=0;b<2;b++){
        set(this.muf[b],0,mufCut,0.65,sr);
        set(this.muf2[b],0,mufCut*1.6,0.6,sr);
        set(this.body[b],2,210/Math.max(0.6,T.pipe)*(b?0.96:1),1.4,sr,[5,3.5,2][mi]);
      }
      set(this.inRes,1,120+this.rpm*0.025,2.5,sr);
      set(this.inNz,1,650+this.rpm*0.08,1.1,sr);
      set(this.whoosh,1,1800+2800*this.shaft,0.9,sr);
      set(this.wgF,1,2600,0.7,sr);
      if(this.bovMode) set(this.bovF,1,900+3000*Math.exp(-this.bovT*5),1.2,sr);
      else set(this.bovF,1,1250+300*Math.exp(-this.bovT*3),1.4,sr);
      const mic=EngineDSP.MIC[T.mic|0]||EngineDSP.MIC[0];
      const exA=1-Math.exp(-2*Math.PI*mic.exLP/sr);
      if(mic.cab){ set(this.cab[0],0,750,0.75,sr); set(this.cab[1],0,750,0.75,sr); }
      const nT0=2*T.pipe/480*sr, nT1=2*T.pipe*1.035/480*sr;
      const ang=E.angles, nc=ang.length;
      for(let i=0;i<m;i++){
        this.rpm+=(T.rpm-this.rpm)*k; this.charge+=(T.charge-this.charge)*k; this.thr+=(T.throttle-this.thr)*k;
        this.shaft+=(T.shaft-this.shaft)*k; this.boostN+=(T.boostN-this.boostN)*k; this.wg+=(T.wg-this.wg)*k;
        this.onG+=((T.on?1:0)-this.onG)*kOn;
        const rpm=this.rpm;
        // crank phase over the 720° cycle; fire pulses on crossing
        // cranking: each compression stroke loads the starter, slowing the crank just before TDC, then the trapped air pushes it on
        const stOn=T.starter?1:0; this.stG+=(stOn-this.stG)*kSt;
        if(stOn&&!this.lastSt) this.clunk=1;
        this.lastSt=stOn;
        this.crankD+=((stOn?0.38*Math.max(0,Math.min(1,1-rpm/520)):0)-this.crankD)*kSt;
        let spd=rpm;
        if(this.crankD>1e-4){ let sum=0;
          for(let c=0;c<nc;c++){ let d=this.phase-(ang[c]-0.03); d-=Math.round(d); const q=d/0.065; sum+=Math.exp(-q*q); }
          this.load=Math.min(1,sum); spd=rpm*(1-this.crankD*this.load);
        } else this.load=0;
        const prev=this.phase; let ph=prev+spd/120/sr;
        if(ph>=1){ for(let c=0;c<nc;c++) if(ang[c]>prev) this.fire(c); ph-=1; for(let c=0;c<nc;c++) if(ang[c]<=ph) this.fire(c); }
        else if(rpm>1){ for(let c=0;c<nc;c++){ const a=ang[c]; if(a>prev&&a<=ph) this.fire(c); } }
        this.phase=ph;
        // pulse voices
        let p0=0,p1=0,n0=0,n1=0; const vs=this.voices;
        for(let j=0;j<vs.length;j++){ const v=vs[j]; if(!v.on) continue;
          if(v.delay>0){ v.delay--; continue; }
          const x=v.t/v.dur; if(x>=1){ v.on=false; continue; }
          const u=x/v.a, y=u*Math.exp(1-u)*(1-x);
          const s=v.amp*y, ns=s*v.rasp;
          if(v.bank){ p1+=s; n1+=ns; } else { p0+=s; n0+=ns; }
          v.t++;
        }
        // afterfire crackle
        for(let b=0;b<2;b++){ const c=this.crack[b]; if(c>1e-3){
          let s=(Math.random()*2-1)*c*0.5; if(Math.random()<0.006) s+=(Math.random()<0.5?-1:1)*c*2.2;
          if(b) p1+=s; else p0+=s; this.crack[b]*=cDecay; } }
        const pin=p0+p1;
        // exhaust chain per bank
        let e0=0,e1=0; const drv=1.1+1.4*Math.min(1.6,this.charge);
        for(let b=0;b<2;b++){
          const x=b?p1:p0;
          const y0=x-this.dcx[b]+0.997*this.dcy[b]; this.dcx[b]=x; this.dcy[b]=y0;
          const d=y0-this.px[b]; this.px[b]=y0;
          let y=y0+bright*6*d;
          this.N[b]+=((b?nT1:nT0)-this.N[b])*0.0005;
          const dlb=this.dl[b], ri=this.dw-this.N[b], i0=Math.floor(ri), fr=ri-i0;
          const r0=dlb[i0&16383], r1=dlb[(i0+1)&16383];
          this.loop[b]+=(r0+(r1-r0)*fr-this.loop[b])*0.42;
          y=y-0.5*this.loop[b];
          dlb[this.dw]=y;
          // flow turbulence: band-limited (~270 Hz–1.7 kHz), envelope-smoothed, added after the pipe so it can’t ring the pipe modes
          this.rEnv[b]+=((b?n1:n0)-this.rEnv[b])*0.02;
          const wn=Math.random()*2-1; this.rLP[b]+=(wn-this.rLP[b])*0.2; this.rHP[b]+=(this.rLP[b]-this.rHP[b])*0.035;
          y+=(this.rLP[b]-this.rHP[b])*this.rEnv[b]*1.6;
          y=run(this.muf[b],y); y=run(this.muf2[b],y); y=run(this.body[b],y);
          y=Math.tanh(y*0.45*drv);
          this.exLP[b]+=(y-this.exLP[b])*exA;
          if(b) e1=this.exLP[b]; else e0=this.exLP[b];
        }
        this.dw=(this.dw+1)&16383;
        // intake
        const id=pin-this.inDc; this.inDc+=id*0.002;
        this.inEnv+=(Math.abs(id)-this.inEnv)*0.01;
        const nz=Math.random()*2-1;
        let intake=run(this.inRes,id)*(0.25+0.75*this.thr)*0.8;
        intake+=run(this.inNz,nz)*this.inEnv*this.thr*Math.min(1,rpm/3500)*2.2;
        // closed-throttle hiss: air rushing past the throttle plate into manifold vacuum
        intake+=run(this.hiss,Math.random()*2-1)*Math.max(0,1-this.charge)*(1-this.thr)*Math.min(1,rpm/5000)*0.12*T.mixOv;
        // mechanical + starter
        // valvetrain tick: a short noise burst ringing two metallic resonances, varied per event, fading under combustion noise as rpm rises
        const tex=nz*this.clk*this.clkA; this.clk*=0.96;
        let mech=(run(this.tk1,tex)+0.6*run(this.tk2,tex))*0.2/(1+rpm/2500);
        // engine body: rotating-mass rumble and timing-drive whir that are there whenever the engine spins, fuel or not
        const rn=Math.min(1.4,rpm/6000); this.chPh+=rpm/60*21/sr; if(this.chPh>1) this.chPh-=1;
        this.mLP+=(nz-this.mLP)*0.08;
        mech+=(this.mLP*1.6+Math.sin(2*Math.PI*this.chPh)*0.12)*Math.pow(rn,1.3)*0.35;
        let strt=0;
        if(this.stG>1e-3){
          // overrunning clutch: once the engine outruns the starter, the starter drops away instead of chasing rpm
          const free=Math.max(0,Math.min(1,(380-rpm)/80)), ld=this.load;
          // the "lug": the motor growls at its own rotation rate (~11x crank), louder and lower each time a cylinder compresses
          this.arPh+=Math.min(spd,330)/60*11/sr; if(this.arPh>1) this.arPh-=1;
          const s1=Math.sin(2*Math.PI*this.arPh);
          const growl=run(this.arLP,Math.tanh(3*s1)+0.6*(2*((this.arPh*2)%1)-1)+0.25*nz);
          // ring-gear mesh: quiet, and only gently pitch-bent so it can't swoop into a wheeze
          this.mshF+=(Math.min(rpm,330)*(1-0.3*this.crankD*ld)/60*120-this.mshF)*0.002;
          this.stPh+=this.mshF/sr; if(this.stPh>1) this.stPh-=1;
          const mesh=run(this.stLP,2*this.stPh-1);
          const comm=run(this.stBP,Math.random()*2-1);
          strt+=(growl*0.11*(0.12+1.1*ld)+mesh*0.028*(0.6+0.4*ld)+comm*0.04*(0.4+0.6*ld))*this.stG*free;
        }
        if(this.clunk>1e-3){ strt+=run(this.ckBP,nz)*this.clunk*0.6+Math.sin(this.clunk*40)*this.clunk*0.15; this.clunk*=ckD; }
        if(this.thump>1e-3){ this.thPh+=34/sr; strt+=Math.sin(2*Math.PI*this.thPh)*this.thump*0.22; this.thump*=thD; } else this.thPh=0;
        // turbo
        let tur=0;
        if(turb){ const sh=this.shaft;
          this.whPh+=(380+4400*sh)/sr; if(this.whPh>1) this.whPh-=1;
          const w=Math.sin(2*Math.PI*this.whPh)+0.3*Math.sin(4*Math.PI*this.whPh+0.7);
          tur+=w*sh*sh*(0.2+0.8*Math.min(1,this.thr))*0.09;
          tur+=run(this.whoosh,nz)*sh*(0.15+this.boostN)*0.22;
          tur+=run(this.wgF,Math.random()*2-1)*this.wg*0.12;
        }
        if(T.bovId!==this.lastBov){ this.lastBov=T.bovId; this.bovT=0; this.bovA=T.bovAmp; this.bovMode=T.bovMode; this.flPh=0; }
        if(this.bovT<2.5){ const t=this.bovT, att=Math.min(1,t/0.004);
          if(this.bovMode){ tur+=run(this.bovF,Math.random()*2-1)*this.bovA*att*Math.exp(-t/0.28)*0.9; }
          else { const f=24*(1-0.45*Math.min(1,t)); this.flPh+=f/sr; if(this.flPh>1) this.flPh-=1;
            const sn=Math.sin(2*Math.PI*this.flPh), am=0.5+0.5*Math.tanh(5*sn), env=this.bovA*att*Math.exp(-t/0.45);
            tur+=run(this.bovF,Math.random()*2-1)*env*am*1.1+sn*env*0.08; }
          this.bovT+=1/sr; }
        // mix
        const center=intake*mic.int*T.mixIn+mech*mic.mech*T.mixMe+tur*mic.tur*T.mixTu+strt*mic.st*T.mixSt;
        const exG=mic.exh*T.mixEx; let l,r;
        if(E.stereo){ l=(e0*0.82+e1*0.3)*exG+center; r=(e1*0.82+e0*0.3)*exG+center; }
        else { const e=(e0+e1)*0.62*exG; l=e+center; r=e+center; }
        if(mic.cab){ l=run(this.cab[0],l)*1.5; r=run(this.cab[1],r)*1.5; }
        const g=T.vol*this.onG*1.2;
        l=Math.tanh(l*g); r=Math.tanh(r*g);
        if(R){ L[off+i]=l; R[off+i]=r; } else L[off+i]=(l+r)*0.5;
      }
    }
  }
}
```

## Appendix B: engine state model reference source

Presets and the vehicle used by drive mode:

```js
const ENGINES = {
  i4:    {name:'Inline-4',      sub:'Even 180° firing',       angles:[0,180,360,540], banks:[0,1,0,1], header:[0,0,0,0], stereo:0,
          idle:850, redline:7000, limiter:7200, torque:210, peakRpm:4800, inertia:0.13, pipe:2.1, pulseDeg:230, gain:1.0},
  flat4: {name:'Flat-4',        sub:'Unequal headers',        angles:[0,180,360,540], banks:[0,1,0,1], header:[0,2.6,0,2.6], stereo:0,
          idle:800, redline:6800, limiter:7000, torque:250, peakRpm:4200, inertia:0.14, pipe:2.3, pulseDeg:240, gain:1.05},
  i6:    {name:'Inline-6',      sub:'Even 120° firing',       angles:[0,120,240,360,480,600], banks:[0,1,0,1,0,1], header:[0,0,0,0,0,0], stereo:0,
          idle:750, redline:7000, limiter:7200, torque:340, peakRpm:4600, inertia:0.18, pipe:2.5, pulseDeg:235, gain:0.95},
  v8x:   {name:'V8 crossplane', sub:'Uneven per bank',        angles:[0,90,180,270,360,450,540,630], banks:[0,1,0,0,1,0,1,1], header:[0,0,0,0,0,0,0,0], stereo:1,
          idle:650, redline:6500, limiter:6700, torque:530, peakRpm:4400, inertia:0.24, pipe:2.7, pulseDeg:240, gain:1.15},
  v8f:   {name:'V8 flatplane',  sub:'Even per bank',          angles:[0,90,180,270,360,450,540,630], banks:[0,1,0,1,0,1,0,1], header:[0,0,0,0,0,0,0,0], stereo:1,
          idle:900, redline:8500, limiter:8700, torque:440, peakRpm:6200, inertia:0.16, pipe:1.9, pulseDeg:225, gain:1.0},
  v12:   {name:'V12',           sub:'Even 60° firing',        angles:[0,60,120,180,240,300,360,420,480,540,600,660], banks:[0,1,0,1,0,1,0,1,0,1,0,1], header:Array(12).fill(0), stereo:1,
          idle:800, redline:9000, limiter:9200, torque:620, peakRpm:6800, inertia:0.22, pipe:2.2, pulseDeg:220, gain:0.85},
  vtwin: {name:'45° V-twin',    sub:'Fires at 0° and 405°',   angles:[0,405], banks:[0,1], header:[0,0.4], stereo:0,
          idle:900, redline:5500, limiter:5700, torque:150, peakRpm:3200, inertia:0.10, pipe:1.4, pulseDeg:210, gain:1.45}
};
const CAR={mass:1200, r:0.32, final:3.9, gears:[3.5,2.1,1.45,1.1,0.88,0.72], crr:0.013, cda:0.68};
// drive mode sets the car's mass from the engine when the preset changes:
// CAR.mass = clamp(E.torque * 3.2 + 350, 600, 1750);
```

Physics step. `S` holds user inputs (`thrHold`, `pedal`, `key` are throttle sources; `mode`, `load`, `rpmTarget`, `turbo`, `maxBoost`, `tsize`, `bov`), `st` holds engine state, and `E` is the active preset. The prototype calls `step(dt)` in 2 ms substeps every animation frame.

```js
// ---------- physics ----------
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const RPM_PER_RAD=60/(2*Math.PI);
function mapRatio(area,rpm){ return clamp(area/Math.sqrt(area*area+(6.5e-5*rpm)**2),0.18,1); }
function torqueCurve(rpm){ const d=(rpm-E.peakRpm)/E.redline; return E.torque*clamp(1-1.3*d*d,0.35,1); }
function scaleMax(){ return Math.ceil((E.limiter+600)/1000)*1000; }

function step(dt){
  const driverThr=Math.max(S.thrHold,S.pedal,S.key);
  let thr=driverThr;
  if(S.mode==='drive'&&st.shiftT>0) thr=0;
  // starter / ignition
  if(st.starter){ st.crankT+=dt; if(st.crankT>0.55&&st.rpm>150) st.running=true; if(st.running&&st.rpm>E.idle*0.7) st.starter=false; if(st.crankT>4) st.starter=false; }
  // idle air control
  const idleAir=st.running?clamp(0.05+(E.idle-st.rpm)*0.00015,0,0.14):0;
  const thrEff=Math.max(thr,idleAir); st.thrEff=thr;
  const area=0.012+Math.pow(thrEff,1.6);
  const pUp=1+st.boost;
  const mapT=pUp*mapRatio(area,Math.max(st.rpm,1));
  st.map+=(mapT-st.map)*Math.min(1,dt/0.06);
  // fuel cut and limiter
  if(st.running){
    if(thr<0.02&&st.rpm>E.idle+500){ if(!st.fuelCut&&st.rpm>2500) st.popWin=1; st.fuelCut=true; }
    if(thr>=0.03||st.rpm<E.idle+250) st.fuelCut=false;
    if(st.rpm>E.limiter) st.limiter=true; else if(st.rpm<E.limiter-250) st.limiter=false;
  } else { st.fuelCut=false; st.limiter=false; }
  if(thr>0.05) st.popWin=0; else st.popWin=Math.max(0,st.popWin-dt/1.8);
  const comb=st.running&&!st.fuelCut;
  const Tind=comb?torqueCurve(st.rpm)*Math.max(0,(st.map-0.15)/0.85)*(st.limiter?0.15:1):0;
  const lowR=Math.min(1,st.rpm/1000);
  const Tfric=st.rpm>1?E.torque*(0.04+0.08*st.rpm/E.redline)+E.torque*0.15*Math.max(0,1-st.map)*lowR:0;
  const Tstart=st.starter?E.torque*0.6*Math.max(0,1-st.rpm/320):0;
  st.tq=Tind-Tfric;
  // turbo
  if(S.turbo){
    const flow=(st.rpm/E.redline)*st.map*(comb?1:0.3)*(1.35-0.5*S.tsize);
    const comp=1.35*S.maxBoost*st.shaft*st.shaft;
    st.wg=clamp((comp-S.maxBoost)/(0.35*S.maxBoost),0,1);
    const target=clamp(Math.pow(flow*1.25,1.4),0,1)*(1-0.45*st.wg);
    let tau=target>st.shaft?0.35+1.8*S.tsize:1.0+1.5*S.tsize;
    if(st.bovVent>0&&!S.bov&&target<st.shaft) tau*=0.5;
    st.shaft+=(target-st.shaft)*Math.min(1,dt/tau);
    let bT,bTau;
    if(thrEff>0.12){ bT=Math.min(comp,S.maxBoost); bTau=0.12; }
    else { bT=0; bTau=st.bovVent>0?(S.bov?0.06:0.5):0.35; }
    st.boost+=(bT-st.boost)*Math.min(1,dt/bTau);
    // blow-off detection: throttle snapped shut with boost in the pipes
    st.thrSlow+=(thrEff-st.thrSlow)*Math.min(1,dt/0.2);
    st.bovCool-=dt; st.bovVent-=dt;
    if(st.thrSlow-thrEff>0.3&&st.boost>0.15&&st.bovCool<=0){
      st.bovId++; st.bovAmp=clamp(st.boost/1.2,0.2,1.3); st.bovMode=S.bov?1:0; st.bovCool=0.6; st.bovVent=0.4; st.lastBovT=performance.now();
    }
  } else { st.shaft+=(0-st.shaft)*Math.min(1,dt/1.2); st.boost+=(0-st.boost)*Math.min(1,dt/0.2); st.wg=0; st.thrSlow=thrEff; }
  // dynamics
  if(S.mode==='dyno'){
    if(st.running){ const tgt=clamp(S.rpmTarget,E.idle,E.limiter-100); st.rpm+=(tgt-st.rpm)*Math.min(1,dt/0.3); st.absorb=Math.max(0,Tind-Tfric); }
    else st.rpm=Math.max(0,st.rpm+(Tstart-Tfric)/E.inertia*RPM_PER_RAD*dt);
  } else if(S.mode==='free'){
    const Tload=S.load*E.torque*1.1*clamp((st.rpm-E.idle*0.9)/2500,0,1);
    st.absorb=Tload;
    st.rpm=Math.max(0,st.rpm+(Tind+Tstart-Tfric-Tload)/E.inertia*RPM_PER_RAD*dt);
  } else {
    const G=CAR.gears[st.gear-1]*CAR.final, v=st.speed;
    const grade=S.load*0.12;
    let Fres=CAR.mass*9.81*(CAR.crr*(v>0.05?1:0)+grade)+0.5*1.2*CAR.cda*v*v;
    const Fbrake=st.brake*CAR.mass*8;
    const engFromWheel=v/CAR.r*RPM_PER_RAD*G;
    if(st.shiftT>0){
      st.shiftT-=dt; st.lock=false;
      st.rpm=Math.max(0,st.rpm+(Tind+Tstart-Tfric)/E.inertia*RPM_PER_RAD*dt);
      st.speed=Math.max(0,v+(-Fres-(v>0?Fbrake:0))/CAR.mass*dt);
    } else if(st.lock){
      const Jeq=E.inertia+CAR.mass*CAR.r*CAR.r/(G*G);
      const Tnet=Tind+Tstart-Tfric-(Fres+(v>0?Fbrake:0))*CAR.r/G;
      st.rpm=Math.max(0,st.rpm+Tnet/Jeq*RPM_PER_RAD*dt);
      st.speed=st.rpm/RPM_PER_RAD/G*CAR.r;
      if(st.rpm<E.idle*0.8) st.lock=false;
    } else {
      const slip=st.rpm-engFromWheel;
      const launching=engFromWheel<E.idle;
      const engage=launching?clamp((st.rpm-E.idle*0.9)/600,0,1):1;
      const Tc=clamp(slip*(launching?0.6:2.0),-E.torque*1.6,E.torque*1.6)*engage;
      st.rpm=Math.max(0,st.rpm+(Tind+Tstart-Tfric-Tc)/E.inertia*RPM_PER_RAD*dt);
      let a=(Tc*G/CAR.r-Fres)/CAR.mass-(v>0?Fbrake/CAR.mass:0);
      st.speed=Math.max(0,v+a*dt);
      if(Math.abs(slip)<120&&engFromWheel>E.idle*0.85){ st.lock=true; st.rpm=engFromWheel; }
    }
    st.absorb=0;
  }
  // stall
  if(st.running&&st.rpm<220&&!st.starter){ st.running=false; st.stalled=true; }
}
```

Mix defaults as stored in the prototype (order: behind, engine bay, cabin):

```js
// default mix, in dB on top of each listening position’s built-in balance (behind, engine bay, cabin)
const MIX_DEFAULT_DB=[
  {ex:4.1, ov:4.1, in:2.7, tu:0,   me:-8.2,  st:0},
  {ex:6.4, ov:7.5, in:0,   tu:3.4, me:-4.7,  st:8.7},
  {ex:6.9, ov:9.5, in:3,   tu:9.5, me:-13.6, st:0}
];
const dbToGain=d=>d===null?0:Math.round(Math.pow(10,d/20)*100)/100;
const defaultMix=i=>Object.fromEntries(Object.entries(MIX_DEFAULT_DB[i]).map(([k,d])=>[k,dbToGain(d)]));
```

## Appendix C: browser audio wiring

How the prototype hosts the synthesizer in an AudioWorklet (falling back to a ScriptProcessor) and builds the parameter frame each animation frame:

```js
async function initAudio(){
  if(audio.ctx){ if(audio.ctx.state!=='running') await audio.ctx.resume(); return; }
  const AC=window.AudioContext||window.webkitAudioContext;
  const ctx=new AC({latencyHint:'interactive'});
  const an=ctx.createAnalyser(); an.fftSize=2048; an.smoothingTimeConstant=0.55;
  an.connect(ctx.destination);
  let node;
  try{
    if(!ctx.audioWorklet) throw new Error('no worklet');
    const src=EngineDSP.toString()+
      "\nclass EngineProc extends AudioWorkletProcessor{constructor(){super();this.d=new EngineDSP(sampleRate);this.port.onmessage=e=>this.d.setParams(e.data);}process(i,o){const out=o[0];this.d.render(out[0],out[1]||null,out[0].length);return true;}}\nregisterProcessor('engine-dsp',EngineProc);";
    const url=URL.createObjectURL(new Blob([src],{type:'application/javascript'}));
    await ctx.audioWorklet.addModule(url);
    node=new AudioWorkletNode(ctx,'engine-dsp',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    audio.send=m=>node.port.postMessage(m); audio.mode='worklet';
  }catch(err){
    const dsp=new EngineDSP(ctx.sampleRate);
    node=ctx.createScriptProcessor(1024,1,2);
    node.onaudioprocess=ev=>{ const ob=ev.outputBuffer; dsp.render(ob.getChannelData(0),ob.getChannelData(1),ob.length); };
    audio.send=m=>dsp.setParams(m); audio.mode='script';
  }
  node.connect(an);
  audio.ctx=ctx; audio.analyser=an;
  sendEngine();
  if(ctx.state!=='running') await ctx.resume();
}
function sendEngine(){ if(audio.send) audio.send({type:'engine',angles:E.angles,banks:E.banks,header:E.header,pulseDeg:E.pulseDeg,gain:E.gain,stereo:E.stereo}); }
function sendParams(){
  if(!audio.send) return;
  audio.send({ rpm:st.rpm, charge:st.map, throttle:st.thrEff, fuelCut:(st.running&&!st.fuelCut)?0:1, limiter:st.limiter?1:0,
    popWin:st.popWin, pops:S.pops?1:0, turbo:S.turbo?1:0, shaft:st.shaft, boostN:st.boost/1.5, wg:st.wg,
    bovId:st.bovId, bovAmp:st.bovAmp, bovMode:st.bovMode, mic:S.mic, vol:S.vol, pipe:S.pipe, muffler:S.muffler,
    on:(st.rpm>25||st.starter)?1:0, starter:st.starter?1:0,
    mixEx:S.mix.ex, mixOv:S.mix.ov, mixIn:S.mix.in, mixTu:S.mix.tu, mixMe:S.mix.me, mixSt:S.mix.st });
}
```
