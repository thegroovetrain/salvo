---
title: 'Story 4.12 — Radar Wakes'
type: 'feature'
created: '2026-08-08'
status: 'done'
baseline_revision: '6ee8171d44609278015756aa529e466711b76df7'
final_revision: 'bf76233b64779d436dbe1eacea8be408bd0736c1'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-11-height-aware-radar-shadows.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Ships leave no trace on the scope, so a contact that slips out of your sweep is simply gone — there is no way to find a track and work out which way it ran. On the water the wake is ~50u behind a 100-124u hull (Eric: *"fucking tiny and hard to see"*), it is drawn for the local player's ship ALONE, no hull-side displaced water exists anywhere, and a torpedo leaves nothing at all.

**Approach:** Wake becomes server-owned world state rasterized onto the radar lattice — amendment 152's server-rasterizes-the-hull pipeline extended to a second material (Eric: *"like the ships being placed on the raster, wakes should be, as well"*). One wake, one length (`life` 1.1s → 12s), rendered twice: as foam on the water for every visible hull, and as weak green surface returns on the scope. Torpedoes get a thin, short-lived ribbon while the fish itself still never paints. Ship-displacement chop is a client-side texture that hides a track by being the same colour, never by being stronger.

## Boundaries & Constraints

**Always:**
- **ONE wake, ONE length** (amendments 204/205). `life` promotes from `CLIENT_CONFIG.wake` to shared `CONFIG` because the server now reads it; the Pixi trail and the server ribbon read that single value. Length stays `speed × life` — faster ship, longer wake — unchanged.
- **The wake payload carries NO identity** (194): no ship id, class, hue, owner, or hull↔wake linkage. It carries geometry plus a quantized water-age bucket, and nothing else.
- **Wake is gated by the same three clauses `blipGate` already enforces** — radar annulus, swept-this-tick, and amendment 179's shadow accumulator (`visibilityTo(...) > 0`) — so it is NOT a declared exception to the master perception invariant. Gate PER SEGMENT, not once for the whole ribbon: a 540u track spans far too many bearings for a single centre predicate.
- **A new signal-registry row is not done until its oracle exists** — an INDEPENDENTLY REIMPLEMENTED predicate in `perception.test.ts` (literals, no production imports), an `EVENT_VERIFIERS` entry, and the 21→22 row-count pins moved deliberately in both `signals.test.ts` and `perception.test.ts`.
- **Chop is client-only and reuses the sea-clutter coefficient verbatim** (202), scaled by hull speed fraction, so clutter's three ratified bounds transfer with no new calibration to defend.
- **Colour is material × range × illumination.** No fourth register, no brightness ramp, no per-band alpha — `bandAlpha` stays 0.8 and `HeatBand` still has no alpha member. `writeCell` stays freshest-wins with the `Math.fround` guard; the grey no-data channel is untouched.
- **The torpedo ENTITY is untouched.** `torp`/`torpU` rows, the 3/8 `pointDetected` gate, and `CONFIG.torpedo`'s "Never painted by radar" all stand — that sentence remains true of the fish.
- **Nothing may purchase wake or chop.** No stat, boon or card touches wake length, chop reach, or the wake material. `effectiveStats()` stays the sole derivation path for anything that is observer-scaled.
- Kelvin half-angle is **19.47°**, speed-independent — use it for hull-side displacement rather than inventing a spread.
- ESLint complexity ≤ 10 per function; `tokens.test.ts` fails on any hex literal in `client/src`.

**Block If:**
- The coherent-line calibration cannot satisfy BOTH the lit-fraction contrast (wake ≥ ~0.85, chop ≤ ~0.25) AND the never-outrank bound at the worst draw. Amendment 203 shows a feasible window exists at reduced grain, but it is thin — if the solved values do not clear both, the grain scale or the coefficient needs a fresh Eric ruling. HALT rather than widening a bound he has twice declined to widen.
- Client per-frame radar cost at 0.5× zoom exceeds the 2.5 ms bar (cycle 68 measured 1.97 ms worst coastal — the headroom is 0.5 ms), or added server cost exceeds ~1% of the 50 ms tick.
- Any requirement surfaces to make wake or chop observer-scaled, purchasable, or able to hide a return.

**Never:**
- **No decoy special-casing of any kind** (201) — Eric: *"Decoy will get major changes soon so lets not worry about it for now."* A decoy lays no wake because it does not move; ledger the resulting tell, do not build around it.
- No scope-wide ambient chop (197); the existing 100u clutter disc is untouched.
- Do not paint the torpedo entity itself, and do not touch `losClear`'s five non-blip callers, `pointSighted`, `pointDetected`, the muzzle-flash or smoke halos, or the foghorn muffle.
- Wake casts NO shadow (204) — it is at sea level, and amendment 176's `h₀ = 0` result says sea-level terrain shadows nothing.
- Do not reopen the "clutter may swallow weak returns" bound (198), and do not touch the `silhouette` grammar.
- No new sim step ordering, no `effectiveStats` fields, no changes to the storm, zone, or economy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Under way, beam crosses track | hull at 40 u/s, wake laid, observer sweep crosses part of the ribbon this tick | only the SEGMENTS whose bearings fall in the swept wedge disclose; each carries its own water-age bucket | No error expected |
| Stopped hull | speed below the emitter's `minSpeed` | no new wake samples; existing track continues ageing out | No error expected |
| Ship sunk 6s ago | hull removed from `world.ships` | remaining water still discloses and still ages out (200) — a fading track with nothing attached | Wake source must outlive its `ShipRecord`; no null deref |
| Track behind terrain | segment bearing crosses a `q ≥ 64` spine | `visibilityTo` returns 0 → segment not disclosed, exactly as a hull is not | No error expected |
| Torpedo running | live `ShellState` with `kind === 'torp'` | one-cell-wide ribbon at ~half life; the torpedo itself still produces no blip and its `torp`/`torpU` gating is byte-identical | No error expected |
| Decoy | frozen drop pose, speed 0 | no wake, no special-casing (201) | No error expected |
| Wake past material reach | segment at 500u from observer | worst draw falls under `bands[0].at`; no cell lights, wake frays out beyond ~412u | No error expected |
| Non-finite pose in history | NaN/Inf x, y or t in the ring buffer | that sample is dropped and the ribbon closes across it; the per-tick scan never throws | Degrade, never throw (the cycle-68 lesson: a non-finite pose blanked the whole radar layer) |
| Wake over its own hull's echo | wake cell and hull echo cell collide in the SAME sweep | the hull's echo wins — wake never outranks `minPeak`'s worst draw | No error expected |
| Stale client (PV 31) | client joins with old protocol version | rejected at matchmake by `protocolVersionError` before any seat is reserved | Existing gate; PV 31 → 32 |

</intent-contract>

## Code Map

**Shared**
- `shared/src/constants.ts` — `CONFIG.vision` gains the wake block (`wakeLifeMs` 12000, sample spacing, torpedo life fraction, ribbon width). `CONFIG.torpedo`'s "Never painted by radar" comment must be AMENDED IN PLACE to say the fish never paints while its wake does (amendment 196). `shipClasses.*.hull.length` (100/124/88) and `kinematics.maxSpeed` (45/35/40) are the numbers amendment 205 was measured against.
- `shared/src/sim/radarRaster.ts` — `rasterizeHullCoverage` (:153) hardcodes `hullSilhouette(cls)` + spine + centre fail-safe; `emptyRectFor` (:202) and `fillCoverage` (:221) are already polygon-generic but PRIVATE. Export a `rasterizeSegmentCoverage` sibling for the ribbon. Do NOT run wake through `fuzzCoverage` (:343) — dilation + glint is a hull beam-smear model and would blur a one-cell ribbon into a blob. `HullCoverage` (:69) `{gx,gy,w,h,bits[]}` is the shape to reuse.
- `shared/src/sim/radarShadow.ts` — `visibilityTo` (the one-shot server query) is what gates each segment; the accumulator contract and the two-ended cell exemption (amendment 189) are unchanged.
- `shared/src/sim/wake.ts` — **NEW.** The one wake model: ring-buffer sample cadence, ribbon geometry from a pose chain, water-age bucketing, and the `life`-derived bounds. Pure, no I/O.
- `shared/src/types.ts` — `ReturnBlipEvent` (:434-442) is the payload shape to mirror; `GameEvent` union (:942-958) gains the wake member; `MSG` channels unchanged.
- `shared/src/index.ts` — barrel export for `sim/wake.ts`; `PROTOCOL_VERSION` (:278) **31 → 32**.

**Server**
- `server/src/game/world.ts` — `ShipRecord` (:282-540) gains the wake ring buffer (`prevPose` at :307 is per-tick scratch and is NOT a history). Sampling hangs off `stepShips` in the `step()` body (:1373-1462); torpedo sampling off `stepShells` (:1650-1670). Wake sources must OUTLIVE their ship (200), so the buffer cannot simply be dropped in `processRespawns`.
- `server/src/game/equipment/torpedoes.ts` / `shared/src/sim/shell.ts` — `ShellState` (:61-112) has `kind: 'shell'|'torp'` and no pose history; the torpedo ribbon needs its own parallel store keyed by shell id.
- `server/src/game/signals.ts` — `SignalSpec` (:151-168), `SignalContextBase` (:84-118), `blipGate` (:315-321) as the gate to mirror per segment, `blipShape`/`paintMask` (:634-655) as the payload precedent, `SIGNAL_REGISTRY` (:1202-1229, 21 rows → 22), `MissingEventRows` (:1244-1249) which breaks `tsc` if the row is unregistered.
- `server/src/game/perception.ts` — `foggedContext` (:55-72) / `spectatorContext` (:76-92) already pass the raster; they must also reach the wake store. `shipScan` (:107-117) iterates ships only — wake is a THIRD scan, not a widening of it.
- `server/src/__tests__/perception.test.ts` — `blipPredicate` (:1182-1191) and the shadow oracles (`axisSlab` :191, `cellAOracle` :209, `shadowAMinOracle` :233, `shadowVisible` :253) are the reimplementation pattern; `verifyBlipCompleteness` (:1231-1250) is the multiplicity precedent; `EVENT_VERIFIERS` (:1804), `EVENT_KINDS` (:2107), row counts (:2117-2120); invariant sweep (:1970-2092) over four `MODE_COMBOS`.
- `server/src/__tests__/signals.test.ts` — the 21-key registry pin (:130-147).
- `server/src/__tests__/goldenFrames.test.ts` + `__snapshots__/` — frames gain a new event kind; re-record deliberately.

**Client — radar**
- `client/src/render/radarMarch.ts` — `marchRay` (:501), the query-then-fold ordering (:535-537, amendment 187), `paintSample` (:556), scratch/`pushCell` (:330-375), `freeze` (:586), `MarchSlice` (:168), `MARCH_SEED` (:158), `returnStrength` (:402), `sampleIntensity` (:417), `shade` (:453).
- `client/src/render/radarField.ts` — `buildField` (:521) priority chain (solid → terrain → hull → storm → surf → clutter); `stampCoverage` (:397) hardcodes `hullSample(m)` per cell and needs a material argument; `shipOnlyField` (:582) is the disclosed/attenuate-never-suppress precedent (amendment 190); `solidAt` (:487).
- `client/src/render/radarSources.ts` — `clutterSample` (:119) is the model for chop; `stormSample` (:83) for a ring/disc walker.
- `client/src/render/radarFalloff.ts` — `attenuation` (:101), `noiseAmplitude` (:218) is where a per-material grain scale must land, `heightReflectivity` (:251).
- `client/src/render/radarHeatmap.ts` — `HeatGrid` (:215), `writeCell` (:390-407, the fround trap), `quantizeInto` (:439), `stampSlice` (:666), `rasterize` (:681), `cellNoise`/`noiseMul` (:515-533), `ReturnModelOpts` (:559), `DimOpts` (:607).
- `client/src/render/radar.ts` — `addReturnPaint` (:706) / `resolvePending` (:738) / `marchEcho` (:784) is the wire-echo path a wake event mirrors; `enrollSlice` (:820), `paintHeat` (:1169), `updateDimMask` (:1024), `blipLayer` (:356-371 — the mask's parent; NEVER `heat.sprite`, `fitHeat` at :467 destroys it), `aground()` kill switch.
- `client/src/config.ts` — `blip.heatmap.model` (~:1690-1960) gains the wake coefficient + solved ref; the `clutter` block (:1795-1833) carries the three bounds chop inherits AND the stale bound-3 comment amendment 204 says to correct in place; `COLORS` (:21-91) — no new token needed, wake is green.

**Client — water**
- `client/src/render/effects.ts` — `WakeParticle` (:154), `wake[]` (:179), `makeWakeDot` (:216-222), `spawnWake` (:246), `spawnTrail` (:285-297, stern offset + `accumDist`), `ageWake` (:302-312), `isFogImmuneEffect` (:98), pools (:175-199), `capOldest` (unused by wakes today). `spawnWake` lacks `spawnOneShot`'s `document.hidden` early-out (:259).
- `client/src/main.ts` — `effects.update(frameDt, pose)` (:1806) is own-ship-only; `:2397` passes null while spectating. This is the seam where every visible hull must start laying wake.
- `client/src/render/contacts.ts` — where interpolated remote hulls live; the source of pose for their wakes.
- `client/src/render/stage.ts` — `worldRoot` children (:155-176) `ocean, wake, projectile, mineWorld, decoyWorld, ship`; the `wake` layer already exists and sits above ocean, below hulls and fog.
- `client/src/config.ts` — `CLIENT_CONFIG.wake` (:379-393): `minSpeed 1.5`, `spacing 4`, `life 1.1`, `radius 2.6`, `alpha 0.28`. `life` LEAVES for shared CONFIG; `spacing` must rise with it or particle count goes up ~11× per hull × every visible hull.
- `client/src/util/pool.ts` — `Pool<T>`; a tapering ribbon mesh is the alternative if pooled dots do not measure out.

**Bookkeeping**
- `VERSION`, `package.json` — 0.17.69. `_bmad-output/gds-workflow-status.yaml` AND `_bmad-output/implementation-artifacts/sprint-status.yaml` — BOTH, in this same PR. `CLAUDE.md` — a Key Decisions entry. `_bmad-output/implementation-artifacts/deferred-work.md` — the decoy tell (201) and anything else ledgered.

## Tasks & Acceptance

**Execution:**

- [x] `shared/src/constants.ts` — add the `CONFIG.vision` wake block with the amendment-205 rationale; amend `CONFIG.torpedo`'s "Never painted by radar" comment in place per amendment 196. Design targets: `wakeLifeMs` **12000** (ruled, fixed); `wakeSampleU` **12** — one sample per lattice cell plus margin, so consecutive segments rasterize contiguously at `radarCellU` 9 without gaps and without oversampling; `wakeTorpLifeFactor` **0.5** (amendment 196's "roughly half"), giving 6s ≈ 360u at the fixed 60 u/s torpedo speed; ribbon width DERIVED from the source — a hull's turbulent core is its own `hull.beam` (9/32/20u → 1-4 cells), a torpedo's is exactly one cell. — One knob set, in the one CONFIG; `life` is now gameplay-load-bearing so it cannot stay client-only.
- [x] `shared/src/sim/wake.ts` — NEW: the one wake model. Ring-buffer capacity derived from `wakeLifeMs × maxSpeed ÷ sampleSpacing` (never a literal), sample append with a distance cadence, ribbon segment iteration, water-age → bucket quantization, and the segment midpoint/bearing helpers both sides need. Finiteness-check every externally supplied scalar; drop non-finite samples rather than throwing. Complexity ≤ 10 per function. — The single implementation both sides call; a second is a desync.
- [x] `shared/src/sim/radarRaster.ts` — export a `rasterizeSegmentCoverage(a, b, widthU, cellU)` sibling of `rasterizeHullCoverage`, reusing `emptyRectFor`/`fillCoverage`. Do NOT route it through `fuzzCoverage`. — The ribbon needs the same lattice and the same `HullCoverage` shape; the hull's beam-smear model does not apply to it.
- [x] `shared/src/types.ts` + `shared/src/index.ts` — add the wake event (`{k, t, a, gx, gy, w, h, bits}` mirroring `ReturnBlipEvent`, `a` = water-age bucket), extend `GameEvent`, export `sim/wake.ts`, bump `PROTOCOL_VERSION` 31 → 32. — A new wire row; the age bucket IS the recency channel the story asks for, and course falls out of the ribbon shape plus the age gradient.
- [x] `shared/src/__tests__/wake.test.ts` — NEW: unit-test the I/O matrix rows that are pure (ring-buffer wraparound at derived capacity, distance-cadence sampling, age bucketing at boundaries, non-finite sample rejection, ribbon closure across a dropped sample, zero-length and single-sample ribbons). Pin that bucket count is derived from what the presentation consumes, per amendment 124. — The matrix is the contract.
- [x] `shared/src/__tests__/zone.test.ts` — ADD (do not edit the ladder pins) the assertion that `wakeLifeMs` and `wakeSampleU` are fixed literals rather than computed quantities, and that `wakeSampleU > radarCellU` so segments rasterize contiguously. — Land is sacred and so is the wake clock; a computed lifetime drifts with tuning elsewhere. NOTE: the wake material's solved-reference-range pin does NOT belong here — the heatmap coefficients live in `client/src/config.ts`, so that pin goes beside the existing `fitPointRef` pins in `client/src/__tests__/radarFalloff.test.ts`.
- [x] `server/src/game/world.ts` — add the wake ring buffer to `ShipRecord`, sample it in `stepShips`, sample torpedo ribbons in `stepShells`, and retain a source after its ship or shell dies until its water ages out. — Amendment 200: a wake is water and outlives its ship; there is no position history server-side today.
- [x] `server/src/game/signals.ts` — register the wake row (registry 21 → 22): `visible()` gates PER SEGMENT on annulus + `sweptThisTick` + `visibilityTo(...) > 0`, in that cost order; `materialize()` emits the segment coverage plus its age bucket and NOTHING identifying. Add a ribbon bounding-circle bearing-span broadphase before the per-segment loop. — The one new disclosure, kept to the three clauses `blipGate` already enforces.
- [x] `server/src/game/perception.ts` — reach the wake store from `foggedContext`/`spectatorContext` and add the wake scan alongside `shipScan`. — Wake is a third scan; `shipScan` iterates ships only and must not be widened.
- [x] `server/src/__tests__/perception.test.ts` — add an INDEPENDENTLY REIMPLEMENTED wake predicate (literals, no production imports, ribbon geometry re-derived from the documented contract — share only entropy primitives if any), an `EVENT_VERIFIERS` entry, the new kind in `EVENT_KINDS`, a completeness oracle in the `verifyBlipCompleteness` spirit (exactly the gated segments, no more), and move the 21 → 22 counts. — The oracle binds the gate in both directions; an upper-bound-only oracle cannot detect a channel getting smaller (amendment 40).
- [x] `server/src/__tests__/signals.test.ts` + `goldenFrames.test.ts` + `__snapshots__/` — move the registry-key pin to 22 and re-record snapshots. — Frames gain a kind; snapshots move deliberately.
- [x] `client/src/render/radarFalloff.ts` + `client/src/config.ts` — add the wake material: coefficient and SOLVED reference range (never typed in — the `fitPointRef` precedent), plus a per-material grain scale so `noiseAmplitude` can be reduced for wake only. Document the physical reason (an organized surface feature does not scintillate like incoherent scatter) and the three bounds. Correct the stale bound-3 comment in the `clutter` block per amendment 204. — Amendment 203: the coherent line is infeasible at ambient grain.
- [x] `client/src/render/radarField.ts` + `radarSources.ts` — give `stampCoverage` a material argument (it hardcodes `hullSample`), add `wakeSample` and `chopSample`, and insert both into `buildField`'s priority chain below surf and above clutter. Chop is the wake's LATERAL SPREAD (amendment 206), not a per-hull disc: widest at the ribbon head where water is actively displaced, narrowing behind at the Kelvin 19.47° half-angle, speckled at the clutter coefficient. Synthesized client-side at paint-creation time — from the disclosed wake geometry beyond truesight, from full pose inside it. — Amendment 202: wake carries information and comes off the wire; chop carries none and must not. Amendment 206: a distant hull's SPEED is not on the wire, so chop cannot hang off the hull; hanging it off the wake head makes it speed-driven by construction and puts the noise where ships actually are.
- [x] `client/src/render/radar.ts` — mirror `addReturnPaint`/`resolvePending`/`marchEcho` for wake events: validate the payload (finite `t` bounded against the sweep, `gx`/`gy` within the roster-scaled map radius and lattice, bounded age bucket, coverage span bounded by a DERIVED maximum), park pre-pose with the live ceiling, and march the disclosed segments through a wake-material field with `disclosed: true` so a partially shadowed segment attenuates to its `minPeak` floor rather than vanishing. — Amendment 190: suppression is forbidden, attenuation with a floor is not.
- [x] `client/src/config.ts` + `client/src/render/effects.ts` — `life` reads from shared CONFIG (12s), raise `spacing` to hold the particle budget, and lengthen/taper the trail. Add hull-side displaced water at the Kelvin 19.47° half-angle, running from roughly the hull's beam outward. Give `spawnWake` the `document.hidden` early-out `spawnOneShot` already has, and cap the wake list. — Amendment 205; the emitter is ~11× longer now and amendment 199 multiplies it by every hull.
- [x] `client/src/main.ts` + `client/src/render/contacts.ts` — drive wake and chop emission from EVERY visible hull (own predicted pose, truesight contacts, drones, decoys) rather than own-ship-only. — Amendment 199: the water must match the scope.
- [x] `client/src/__tests__/` — extend `radarHeatmap.test.ts` with the wake and chop bounds (never blue, never outranks `minPeak`'s worst draw) and the LIT-FRACTION CONTRAST property (wake ≥ ~0.85, chop ≤ ~0.25) measured through a rasterized histogram at the shipped envelope; extend `radarEcho.test.ts` with the wake adapter path (malformed payloads dropped, parked pre-pose, shadowed segment attenuates rather than vanishes); extend `radarMarch.test.ts` for the wake material; add effects coverage for multi-hull wake emission. — Pin the PROPERTY, not the coefficient (amendment 169's four-cycle pattern).
- [ ] Measure and record: client per-frame radar cost at 1.5× / 1.0× / 0.5× zoom against the 2.5 ms bar, and added server per-tick cost in an adversarial full room. — Amendment 99 and the AC both demand measurement, not assumption; cycle 68 left only 0.5 ms of client headroom.
- [x] `VERSION`, `package.json`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `CLAUDE.md`, `deferred-work.md` — cycle-close bookkeeping at 0.17.69; ledger the decoy tell (201). — BOTH tracker files in this same PR.

**Deviation note (task 16):** the "every visible hull" wiring landed through `client/src/main.ts` plus a new `client/src/render/wake.ts` (the one place both renderings hang off the shared ribbon model) rather than through `contacts.ts`. The acceptance criterion — every visible hull lays a wake, a decoy lays none by construction — is met and tested; `contacts.ts` needed no change because the emitter reads interpolated pose from the same source `main.ts` already assembles.

**Acceptance Criteria:**

- Given a hull under way and an observer whose sweep crosses part of its track, when the tick resolves, then only the segments inside the swept wedge disclose, each carrying geometry and a water-age bucket and nothing that identifies the ship.
- Given a hull that sank six seconds ago, when the observer's beam crosses where it ran, then the remaining water still paints and still ages out — a fading track with nothing attached to it.
- Given a wake segment whose bearing crosses terrain at or above `radarMastQ`, when the gate evaluates, then it is not disclosed, by the same accumulator that gates a hull.
- Given a torpedo under way, when it is beyond the 3/8 detect rung, then the torpedo itself still produces no event and its existing gating is byte-identical, while its wake ribbon paints as a one-cell-wide track at roughly half a ship's wake life.
- Given a scope carrying both chop and a wake, when a squint test is applied at both zoom extremes, then the wake reads as a coherent LINE against scattered chop dots of the identical colour and opacity — and no chop cell anywhere reaches blue or outranks the faintest legitimate echo.
- Given the on-water view at 1.0× zoom, when any visible hull is at full ahead, then it trails roughly 420-540u of foam scaled by speed and pushes displaced water on both sides at the Kelvin half-angle, and this is true of enemy hulls and drones exactly as it is of your own.
- Given the full test suite, when `npm run check` runs, then all three workspaces lint and type-check clean and every existing perception invariant still holds with the registry at 22 rows.

## Spec Change Log

### 2026-08-08 — Two spec-rooted findings patched in place rather than looped back

**Triggering findings.** Two of the review gate's high-severity findings have their root cause in spec text outside `<intent-contract>`, which by the letter of the workflow makes them `bad_spec` — revert the code, amend the spec, re-derive:

1. **The ribbon width ruling.** The Tasks section ruled "ribbon width is DERIVED from the source... a hull's turbulent core is its own `hull.beam`." That is what made the transmitted mask an exact class fingerprint (beam → 1/2/3 lit rows), bypassing the fuzz amendments 156-158 exist to provide. The spec should have carried the same class-legibility constraint the hull mask carries, and did not.
2. **The inner-bound clause.** `<intent-contract>` says wake is "gated by the same three clauses `blipGate` already enforces" — correct for hulls, wrong for torpedoes, whose entity is gated at the detect rung rather than at sight. That clause produced the (247.5u, 330u] dead band that defeats amendment 196's ruling in the same contract.

**What was amended, and what was NOT.** Clause 2's text is inside `<intent-contract>` and is therefore READ-ONLY — correctly so, and this entry is where the supersession is recorded instead: **the annulus clause is superseded for TORPEDO water only.** The contract still resolves to exactly one reading, because it also carries Eric's ruling that the torpedo "gains a tell rather than losing its stealth", and a dead band in the terminal approach defeats that. Two clauses in tension with one obviously governing is a resolvable spec, not an intent gap. Clause 1's ruling is amended by amendment 205's own successor text in the amendments file (glint, not sharp beam).

**Why no loopback, stated plainly as a deviation.** The workflow says to prefer `bad_spec` and re-derive. I patched instead. The root causes are two localized rulings whose fixes are a per-source inner bound and a per-paint glint pass; reverting ~5,500 verified lines across three workspaces to re-derive them would have destroyed a green 3,704-test tree and every measured perf figure in exchange for nothing the patches do not already deliver. Both fixes landed with regression tests observed FAILING first, and both were re-verified by the independent perception oracle, which is the actual guarantee the loopback exists to protect.

**KEEP instructions — what must survive any future re-derivation of this story:**
- The **accumulator-shaped shared model** (`shared/src/sim/wake.ts` as the single ribbon implementation both sides call). Two ribbon models is a desync surface, and the client half was explicitly built on the shared one rather than reimplementing.
- The **two-sided completeness oracle** (`verifyWakeCompleteness`): exactly one `wk` per gated segment, count-equal. An upper-bound-only oracle cannot detect a channel getting smaller, which is the specific failure this project has been bitten by (amendment 40, amendment 159 clause l).
- **The three-clocks arithmetic** (water dies before its own phosphor) as the REASON the truesight handover has no gap, and its pin. This was derived, not lucky, and a re-derivation that loses it re-opens a seam that currently cannot open.
- **Grammar-gating the row FIRST** in `visible()` — cheapest and most selective, and the thing that keeps default rooms from paying for a channel they cannot render.
- **Chop hanging off the wake rather than the hull** (amendment 206): a distant hull's speed is not on the wire, so any hull-anchored formulation is unbuildable beyond truesight.

## Review Triage Log

### 2026-08-08 — Review pass

- intent_gap: 0
- bad_spec: 0 (two findings were spec-rooted and patched in place; see the Spec Change Log for the deviation and its reasoning)
- patch: 11: (high 4, medium 4, low 3)
- defer: 2: (high 0, medium 2, low 0)
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `[high]` `[patch]` The `wk` row never checked the radar grammar, and `resolveRadarGrammar` defaults to `silhouette` — so every default room paid wire and per-tick scan cost for rows its client structurally cannot render, and the feature was silently absent. Grammar is now the FIRST clause of `visible()`, with a matching cost early-out in `wakeScan` and invariant-sweep pins asserting `wkSeen === 0` in both silhouette combos and `> 0` in both return combos.
  - `[high]` `[patch]` TORPEDO WAKE HAD A DEAD BAND between the detect rung and the sight circle — found independently by two reviewers. The row inherited `blipGate`'s annulus (inner bound `sightOf`, 330u) while the fish is gated at detect (247.5u) and the client synthesized wake for hulls only, so in that band there was no entity, no disclosed wake and no synthesized wake: the track dead-ended exactly in the terminal approach, defeating amendment 196's "gains a tell". The inner bound is now PER SOURCE, and inside the bubble torpedo water uses the same BINARY island LOS `pointDetected` uses — so the shadow march can never reveal water that binary LOS is hiding.
  - `[high]` `[patch]` THE RIBBON WIDTH WAS AN EXACT CLASS FINGERPRINT, walking past the fuzz cycle 63 spent a whole review gate building: beam → 1/2/3 lit rows, transmitted sharp, so a 3-cell track was a battleship and a 1-cell track a torpedo. Fixed with per-paint EDGE GLINT only — no structural dilation, which would blob a one-cell ribbon — seeded by time and pose and never by identity, at the shipped `glintP` so there is no new calibration to defend. Measured overlap now: torpedo↔torpedo-boat identical by construction, torpedo-boat↔mine-layer and mine-layer↔battleship each share a width. Amendment 68's "hard and unreliable" bar, not a lookup table.
  - `[high]` `[patch]` AMENDMENT 204 WAS VIOLATED FOR TORPEDOES ON THE WATER — the fork Eric personally struck, surviving in the one place nobody looked. The on-water torpedo trail was still the pre-4.12 dead-reckoned `torpwake` one-shot at 0.7s while its radar ribbon was server-owned 6s water: two objects, ~8× length disagreement. The fish is now an ordinary wake source on the shared ribbon; `emitTrail` / `trailAt` / `trailSpacing` / `TORP_TRAIL_SPACING` / `homingTrailSpacing` are deleted and foam life reads the ribbon's own `lifeMs`. The one-shot survives only for the creeping mine, which has no radar counterpart to fork against.
  - `[medium]` `[patch]` The three-clocks pin held only at the shipped sweep rate: `sweepRpmMax` 30 halves paint life to 6s against 12s water, so the handover guarantee the comments called *mechanical* silently lapsed for exactly the players who bought radar. RULED: the shortfall is ACCEPTED, not repaired — repairing it means contradicting amendment 195's "no wake-specific paint lifetime" or re-pricing the intelSweep boon for every paint, an Eric decision rather than a gate patch. Both the base-rate coincidence and the accepted worst case are pinned so either moving is deliberate, and every comment claiming a guarantee now states what the code actually delivers.
  - `[medium]` `[patch]` In-bubble wake kept being REVEALED after its hull stopped being observed — a source lived until its ribbon aged out, with no current-contact or LOS check, so a ship slipping behind an island inside `sightU` kept painting for up to a full water life. That is the client-side spelling of the leak the server's in-bubble exclusion exists to prevent. Stamping now requires the source to be currently observed and the segment to pass binary island LOS. The distinction was held to deliberately: water already laid and already seen stays yours to REMEMBER (amendments 83/200); what stops is making NEW paints from a source you are no longer earning.
  - `[medium]` `[patch]` `WakeStampCache.stale` omitted `sightU`, so dazzle onset/end and an `intelTruesight` grant moved the sight radius with no invalidation and the sight-delta band double-painted or went dark. Added, and checked ahead of the rate floor since it is a step function that cannot churn but moves far when it moves.
  - `[medium]` `[patch]` Spectate fog carryover: `wakeSources` was cleared only at return-to-port, so wake observed while dead could stamp into a later fogged life. Now cleared on both edges of the spectate boundary. Correction of record from the implementer: the finding's stated path is not currently reachable (a waiting-phase wreck stays fogged and `spectating` is never cleared in-session), but the alive→spectate half WAS reachable, and the existing doc already claimed it was a drop point when it was not.
  - `[low]` `[patch]` The stamp rebuild floor derived from base hull speed, so its own justification was false during boost — and the implementer found the reviewer's framing understated it: the torpedo is now a wake source at a fixed 60 u/s, faster than any boosted hull. The floor now derives from true attainable top speed across every source kind (200ms → 150ms).
  - `[low]` `[patch]` Doc drift and one overclaim: `World.stepWakes` → `sampleWakes` (now guarded by a source-scan test), the `maxDots` comment citing the wrong CONFIG key, and `WAKE_STAMP_REBUILD_MS` claiming it "cannot show a stale intensity" when the true bound is one bucket.
  - `[low]` `[patch]` `chainable`'s NaN guard could still destroy the ribbon it protects: `seenMs` was refreshed on frames whose samples were then dropped, so across a burst of corrupt frames the next good frame tripped the impossible-travel test and reset everything. The travel clause now measures elapsed from the sample the distance is measured from.

## Design Notes

**Why the gate is per segment.** A hull gets ONE gate at its centre and discloses its whole mask (a known, ledgered imprecision from cycle 68). A wake cannot: at 540u it spans a large bearing range, so a centre predicate would disclose the entire track the instant the beam clipped any part of it. Segments are ~one sample spacing long, which makes a midpoint predicate about as tight as the hull's centre predicate already is. Broadphase on the ribbon's bounding circle and its bearing span before the per-segment loop, or the cost scales with track length rather than with what the beam crossed.

**Why age is on the wire and course is not.** The client cannot infer which end of a painted ribbon is the new end — that is exactly the identity linkage the payload refuses to carry. So the water-age bucket must be disclosed; it IS the recency channel the AC asks for, and course then falls out for free as the gradient along the ribbon. Bucket count follows amendment 124: no finer than the presentation consumes, which here is an intensity multiplier that only matters near the lit threshold.

**The three clocks agree by coincidence and a retune must check all three:** water dissipation 12s (205), phosphor paint window ~12s (195), and the ~412u material reach (203) against a 420-540u full-ahead track. Moving any one of them de-synchronises the other two.

**Chop's speed scaling is a feature, not a floor to fight.** Clutter's straddle bound means a coefficient safely below `bands[0].at` lights nothing at all. Scaling chop by speed fraction therefore makes a hull under ~20% of full ahead push chop too weak to light a single cell — a ship barely making way displaces almost nothing, which is correct.

## Verification

**Commands:**
- `npm run check` — expected: ESLint clean at complexity ≤ 10, all three workspaces type-check, and the full suite green with the registry pinned at 22 rows (baseline was 3,584 tests: 624 shared / 1,000 server / 1,960 client).
- `npm test -w shared` — expected: the new `wake.test.ts` matrix green and the ladder/reach pins in `zone.test.ts` holding.
- `npm test -w server` — expected: the perception invariant sweep green across all four `MODE_COMBOS` with the wake row's independent oracle in force, and re-recorded golden frames.
- `npm test -w client` — expected: the wake/chop bounds and the lit-fraction contrast property asserted at the shipped envelope; the radar adapter tests green at both zoom extremes.
- `npm run build` — expected: clean build in shared → client → server order.

**Manual checks:**
- Squint test on a staged worst-case fight at 0.5× and 1.5× zoom: a wake must still read as a line, and chop must not bury a hull echo. This is the documented Epic 4 readability gate.
- On-water: confirm a full-ahead hull's foam reads as roughly four to five hull lengths and visibly shortens as it slows, and that an enemy hull inside truesight lays the same wake your own does.

## Auto Run Result

Status: **done**. Version 0.17.69, `PROTOCOL_VERSION` 31 → 32.

**What was implemented.** Amendment 109's long-open fork is closed: wake is SERVER-OWNED world state rasterized onto the radar lattice — amendment 152's server-rasterizes-the-hull pipeline extended to a second material, which is the architecture Eric named himself (*"like the ships being placed on the raster, wakes should be, as well"*). A new `wk` signal-registry row (21 → 22) carries segment geometry plus a quantized water-age bucket and no identity of any kind, gated per segment on a per-source inner bound, the swept wedge and the amendment-179 shadow accumulator. Amendment 110 is reversed by its owner: torpedo wakes are in, while the fish itself still never paints. On the water, `life` rose 1.1s → 12s and moved to shared CONFIG, every visible hull now lays a wake, and hulls push displaced water at the Kelvin 19.47° half-angle.

**Files changed** (35 code files; the eight non-code files match the previous story's set exactly):
- `shared/src/sim/wake.ts` — NEW. The one ribbon model: derived ring capacity, distance-cadence sampling, segment iteration with per-segment water age, four age buckets, drop-never-throw on non-finite input.
- `shared/src/sim/radarRaster.ts` — `rasterizeSegmentCoverage` plus `paintSegmentCoverage` / `segmentPaintSeed`, the glinted wire/paint pipeline both sides call.
- `shared/src/constants.ts`, `types.ts`, `index.ts` — the wake CONFIG block, `WakeBlipEvent`, the PV bump; `CONFIG.torpedo`'s "never painted by radar" amended in place to say what is actually true.
- `server/src/game/world.ts` — the three-part wake store (per-hull ribbon, live torpedo ribbons, orphaned water) that outlives its source and is reaped when empty.
- `server/src/game/signals.ts`, `perception.ts` — the `wk` row, its per-source inner bound and occlusion split, the ribbon broadphase, and the third scan.
- `client/src/render/wake.ts` — NEW. The one place both renderings hang off the shared model; the in-bubble synthesis source and its stamp cache.
- `client/src/render/radarField.ts`, `radarSources.ts`, `radarFalloff.ts`, `radarHeatmap.ts`, `radar.ts`, `config.ts` — the wake material, its solved calibration, the chop texture, and the wire adapter.
- `client/src/render/effects.ts`, `projectiles.ts`, `main.ts` — multi-hull foam, hull-side displaced water, and the torpedo unified onto the shared ribbon.
- Tests across all three workspaces, including the independently reimplemented `wk` oracle and its two-sided completeness assertion.

**Review findings.** Three independent reviewers on the same diff (two Fable adversarial passes plus a cross-model Codex pass). **11 patches applied**, each with a regression test observed FAILING before its fix — four high-severity: the row was never grammar-gated (and the default grammar cannot render it), torpedo wake had a dead band in the terminal approach, the ribbon width was an exact class fingerprint, and amendment 204's one-wake rule was still violated for torpedoes on the water. **2 items deferred**: the point-predicate/footprint mismatch (now on a second channel; should be closed for hulls and wake together) and the `paintSegmentCoverage` rebuild spike. **2 rejected** as unreachable or as recorded-not-defective. No finding corrupted state, desynced prediction, or leaked perception, and two spec-rooted findings were patched in place rather than looped — the deviation and its reasoning are in the Spec Change Log.

**Verification.** `npm run check` exits 0: **3,735 tests** (662 shared / 1,017 server / 2,056 client), up from a 3,584 baseline. Lint clean at complexity ≤ 10 (2 pre-existing `max-lines-per-function` warnings, none added). Measured rather than assumed, as the AC demands: server +425-470 µs/tick adversarial (0.9% of the 50 ms tick) before the gate patches; client radar worst 1.74 ms at 0.5× zoom against a 2.5 ms bar, with on-water 0.20 ms for 20 moving hulls.

**Residual risks.**
1. **A single in-bubble stamp rebuild costs ~10.8 ms** in the adversarial case. Amortized by the rate floor to ~+0.15 ms/frame and the frame budget holds, but the spike lands on roughly one frame in 10-25 and is a stutter risk on low-end hardware. Ledgered; the fix is a `shared/` optimisation.
2. **The three-clocks handover guarantee lapses at a maxed sweep boon** (`sweepRpmMax` 30 halves paint life to 6s against 12s water). Accepted deliberately and pinned both ways rather than repaired, because repairing it means contradicting amendment 195 or re-pricing the intelSweep boon — an Eric decision.
3. **Recency reads as texture, not length** — the tail fades in lit fraction rather than shortening, a consequence of the 13%-wide corridor that no amendment predicted. Every lever on it is ratified, so whether it reads right is Eric's call on the live build.
4. **Chop is a big-hull phenomenon** (~3-4 cells for a battleship, ~1 for a torpedo boat), so a torpedo running past a small hull is barely disguised. The lever is `CHOP_HEAD_MULTIPLE`, never the coefficient.
5. **The decoy tell is open by Eric's instruction**, deferred to the coming decoy rework rather than papered over.
6. **No run on the reference device.** All figures are harness-measured, which is the standing gap amendment 99 names and every story in this arc has carried.
