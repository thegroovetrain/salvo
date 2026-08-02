# Epic 3 Context: The Ring

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 3 gives a match its designed pacing arc. The prototype's single continuous shrink is replaced by a phased storm: three ring groups of roughly four minutes each, every group running the same internal minute rhythm — clear seas, a reserved (parked) supply-drop slot, next ring revealed, ring closes — reaching full closure around 12:00 and a final ring locked to two truesight diameters. That endgame ring is the pillar this epic exists to deliver: combat is forced, but the ring is still wide enough that radar earns its keep and no range class gets a free win. Alongside the timeline lands the presentation that makes it legible — ring reveal and storm rendering on the water, the in-storm feedback, and the one restrained top-center line that carries match state. Matches must reach results inside about 15:00 without ever devolving into mutual avoidance.

## Stories

- Story 3.1: Phased Zone Timeline
- Story 3.2: Ring Reveal & Storm Rendering
- Story 3.3: BR Chrome Bar
- Story 3.4: The Endgame Guarantee

## Requirements & Constraints

- **Ring rhythm.** Three ring groups of ~4 minutes, each running the four-beat minute rhythm; three escalating cycles then the endgame. Minute 2's supply-drop slot is structural only — the mechanic is wholly parked and gets **zero HUD footprint**; do not surface it anywhere.
- **Pacing contract.** Full closure at ~12:00; the match then continues until a winner emerges, with start-to-results landing inside ~15:00. No stalemate loop at the final ring.
- **The storm damages only.** Reference 4 hp/s. It must never blind, degrade, or occlude any sensor tier — truesight, radar, and the later listening ring all keep working inside the storm.
- **Endgame Guarantee.** Final ring diameter = 2 × the standard truesight diameter, *derived* from the truesight tunable, never an independent constant — retuning truesight must move the endgame automatically. At the final ring, radar range still exceeds the ring (blips stay meaningful) and truesight from the ring center must not cover the whole ring (no hull is auto-visible across it).
- **All values are design targets.** The ~4 min groups, ~12:00 closure, and 4 hp/s are declared handwaves; the *shape* is the commitment. Every gameplay-authoritative number lives in shared CONFIG.
- **Evidence, not vibes.** Match-length and no-stalemate claims must come from seeded, reproducible batch-sim runs over the real sim, not from feel.
- **Determinism.** Ring state is computed identically on both sides from the match clock — no zone geometry travels as authority. Seeded RNG only; no wall-clock or `Math.random` in sim code.
- **Accessibility floor binds the presentation.** The in-storm vignette pulse caps at 1.1 Hz; the final-10s ring pulse runs at exactly 1 Hz; opacity-breathing, never strobing; ≤ 3 flashes/s per screen region; every state meaning dual-coded (never color alone); audio cues carry visual twins.

## Technical Decisions

- **The timeline is pure shared sim.** The phased ring math replaces the existing single-shrink zone module and stays side-effect free, with both server and client deriving current ring, next ring, phase, and closure countdown from the same clock value. Existing zone tests are updated, not bypassed.
- **The endgame constant is derived, not written.** Wire the final ring to the truesight tunable so the relationship survives future tuning; a hard-coded radius is a defect here.
- **The batch-sim harness is the epic's measuring instrument.** It already supports zone parameter sweeps and produces seeded, byte-identical reruns — use it for match-length distributions and endgame-conclusion proof rather than adding new tooling.
- **Harness fidelity caveat.** The v1 harness pilots are omniscient and near-optimal at gunnery, so its match lengths are *lower bounds* and its kill rates *upper bounds* on human play. Read the numbers as a floor for pacing, and don't over-fit tuning to them.
- **Ring presentation goes through the existing render layering.** Zone/ring drawing belongs on the world/chart side of the fog composite; the chrome bar belongs in the HUD register. Camera zoom is a viewport choice only — fog stays server-authoritative, so the ring must stay readable at any zoom without becoming an information exploit.
- **Chrome bar must survive the death lifecycle.** It is part of the ratified survivor set that persists through the omniscient reveal (which is wired fully in a later epic) — build it so it doesn't die with the hull.
- **Standing engineering laws apply:** authoritative 20 Hz tick with client prediction, everything spatial leaving the server through the perception boundary, zero Colyseus imports in world/match logic, cyclomatic complexity ≤ 10, full check green as the ship gate, and the reference frame budget (sim ≤ 3 ms, render ≤ 10 ms, ≥ 3.6 ms headroom).

## UX & Interaction Patterns

- **Storm color.** The storm renders in the violet family: fill at the storm token, on-water edge stroke and readout text at the brighter storm-readout value — the fill alone measures 2.87:1 and fails the 3:1 graphics threshold, so the edge must carry the legibility.
- **Purple exclusivity is superseded.** The older "purple appears nowhere else, ever" rule was retired by an Eric ruling in the Epic 2 retro: accent reuse of storm purple by other systems is explicitly fine. The binding requirement for the rendering story is **ring-edge legibility** — current ring vs. next ring vs. fog vs. blips, at any zoom. Author the story from that, not the stale clause.
- **Edge treatment is an open decision with a candidate.** A dashed stroke at readout brightness is the standing candidate (the dash is the non-color channel). This must be resolved *with Eric* during the rendering story — it closes a named open UX question.
- **Ring reveal is planning pressure.** The upcoming ring must render distinctly from the current ring edge, and both must be visible through fog at any camera zoom. Zooming out to read the ring is a designed affordance, not a workaround.
- **In-storm state.** Purple vignette pulse plus an "IN STORM" line.
- **Attention priority.** Ring countdown pulse and the in-storm vignette sit in the match-state tier: they animate unless a threat-tier channel is active, in which case they hold steady at the lit keyframe rather than competing.
- **Chrome bar composition.** One restrained mono row, top-center, reading afloat count, own kills, an up-counting match timer, and the ring-closing countdown. Numbers in tabular phosphor, labels muted; the readout counts down each closure, pulses amber in the final 10 s, and reflects the current phase in the mocks' voice during reveal beats.

## Cross-Story Dependencies

- **3.1 is the spine.** The phase state, ring geometry, and closure countdown it exposes are exactly what 3.2 renders, 3.3 reads, and 3.4 constrains — land it first.
- **3.4 constrains 3.1.** The endgame diameter is the timeline's terminal value; the two stories must agree on where that number comes from.
- **3.2 carries a design gate.** The edge treatment (and, with it, the ring-legibility sign-off) needs Eric before the story can close.
- **Inbound from Epic 2.** The batch-sim harness and its zone sweep support come from Epic 2's final story. Epic 2 also routed a deferred finding here: the intended per-match boon-pick band was arithmetically unreachable at current match lengths, and its re-evaluation is gated on this epic's real ~12-minute ring shape. Do not chase that number with economy dials before the timeline lands.
- **Outbound to Epic 5.** The chrome bar's persistence through the omniscient reveal is completed there; build the survivor behavior in, verify it there.
- **Outbound to Epic 6.** Roster-scaled map sizing must keep this timeline coherent while closing to the same endgame diameter — keep the ring math parameterized by map radius rather than assuming a fixed ocean.

## Ratified Amendments (durable — survives recompiles)

See `epic-3-context-amendments.md`. In force at compile time:

1. **2026-08-01 (Eric, Epic 2 retro, Ruling 2):** Story 3.2's "purple appears nowhere else in the game" AC clause is superseded — storm-purple exclusivity is dead; accent reuse elsewhere is fine; the binding 3.2 requirement is ring-edge legibility (current ring vs next ring vs fog vs blips, at any zoom).
2. **2026-08-01 (Eric, Epic 2 retro, Action #3 + amendment-55 checkpoint ratification):** Story 3.1's spec must carry: picks-band shortfall ownership (12–20 picks/match is unreachable at current match lengths; match length — not XP dials — is the fix, and no XP dial may chase the band before 3.1 lands); the harness-lengths-are-lower-bounds caveat (omniscient pilots — a timeline tuned to ~12:00 in the harness may run longer for humans); the `endedBy` split in evidence reads; and a post-landing baseline rerun confirming match length and picks-band reachability.
3. **2026-08-01 (Eric, 3-1 pre-implementation round 1):** Rings are offset-center (seeded, deterministically derived from the map seed, each next ring contained in the current); the final ring radius is 2 × truesight radius (660u) derived from CONFIG.vision.sight; intermediate radii step down geometrically (per-group CONFIG-tunable fractions); the evidence campaign adds a pacifist-pilot (no-hunt) harness control to prove the ~12:00 bound.
4. **2026-08-01 (Eric, 3-1 pre-implementation round 2):** The map bump lands in 3.1 — production map radius target ~2400u, match fill target ~20 ships, exact values ratified at a mid-run evidence checkpoint; the design equation is the closing-rate criterion (worst-case offset escape per close ≈ 80% of a battleship-minute, 2100u); CONFIG expression of the bigger map is implementer-drafted. "20 teams of 1–3" squads are ledgered for Epic 6, not built here.
