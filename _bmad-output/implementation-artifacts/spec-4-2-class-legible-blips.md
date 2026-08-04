---
title: 'Story 4.2 — Class-Legible Blips'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_revision: '1514b6ea3ed9deb1c4442be9b9c51a5345d079c0'
final_revision: '24e0068daa6ef31bfe5080934e6aa5bef676af1f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A radar paint is an anonymous 16-unit dot: `BlipEvent` carries `{k,id,x,y,t}` and the
renderer throws `id` away, so a sweep tells you *something is there* and nothing else — no class, no
course, no speed. FR14 requires a paint to be a deduction input.

**Approach:** Grow the blip wire shape by `cls`/`heading`/`speed` (PROTOCOL_VERSION 19 → 20) and
render each paint as the ship's TRUE-SCALE hull silhouette at its true position and heading — the
same shared `hullSilhouette()` polygon the hull renderer and the server hit-tests already use —
outlined in a non-scaling 1px hairline, tinted with the owner's luminance-floored personal hue, with
an ARPA-style arrowhead vector whose length is proportional to speed. Paints persist three sweeps
(live + 2 decaying ghosts) so a contact leaves a plottable track.

## Boundaries & Constraints

**Always:**
- Blip production stays inside the existing registry row. `blipGate` (annulus ∧ swept-this-tick ∧
  LOS) is UNCHANGED — this story changes the blip's *payload and presentation*, never who gets one.
- New fields are APPENDED after `t` in `blipShape()` (msgpack key-insertion-order law,
  `server/src/game/signals.ts:20-27`), and use `Contact`'s existing names: `cls`, `heading`, `speed`.
- `blipOrder()` keeps sorting on `(x, y, t, id)` only. New fields must NOT enter the sort key —
  `id` already breaks every tie, and a field that differed between genuine and decoy paints would
  become a sort-position de-anonymizer.
- The decoy lie goes through the SAME `blipShape()` call as a genuine paint, producing a
  field-for-field identical payload with plausible values. Wire-indistinguishability is a payload
  law, not a behavior law.
- Only `state.speed` (the raw scalar) may ride the wire. No derived speed cap, max-speed fraction,
  or boosted flag — those leak build state (`types.ts:188-242` self/victim-private construction).
- Drone-ness stays client-derived from the roster sentinel (`REGATTA_NO_HUE`), exactly as
  `client/src/main.ts:750-752` already does.

**Block If:**
- Making the decoy indistinguishable would require reading the owner's LIVE kinematics (ruled out —
  see R5), or the frozen-snapshot approach turns out to need a new `Decoy` field the owner does not
  have at drop time.
- Total live blips at the raised cap measurably breach the render budget (≤10 ms) in a full match.

**Never:**
- Do NOT add a per-class pixel-size table, floor-clamping, or the 3×-deep Mine Layer blip notch.
  Superseded by R1 — true-scale silhouettes make all three unnecessary.
- Do NOT put ship class on the roster schema (that would reveal every player's class permanently).
- Do NOT edit `DESIGN.md` / `EXPERIENCE.md` in this cycle — the superseded blip-size block is
  ledgered for the Eric-gated 7-5 doc-sync batch.
- Do NOT change `blipGate`, the sweep window, LOS, or which entities paint. No new registry row.
- Do NOT revive the listening ring (epic-4 amendment 1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Genuine paint | Ship swept, in annulus, LOS clear | `{k,id,x,y,t,cls,heading,speed}` with the ship's live hull id, heading, signed speed | No error expected |
| Decoy paint | Buoy swept, owner not contact-visible | Same 8 fields; `cls`/`heading` frozen at drop, `speed` exactly 0 | No error expected |
| Decoy outlives owner | Owner removed, buoy alive up to 30s | Still paints from the frozen snapshot — no `ships.get(ownerId)` lookup anywhere | Never throws on a missing owner |
| Drone painted | Drone swept | `cls` is `droneSmall`/`Medium`/`Large`; client renders the legacy chevron at true drone size in drone grey | No error expected |
| Reversing ship | `state.speed < 0` | Negative speed rides the wire; vector draws ASTERN along −heading | No error expected |
| Fourth paint of one contact | 4th blip for the same `id` | Oldest of that id's track is released; exactly 3 remain | No error expected |
| Same id twice in a tick | Owner's real hull AND their decoy both swept | Both blips render; the 3-cap is shared by that id (accepted — see Design Notes) | No error expected |
| Roster miss | Blip `id` not in roster yet | Amber fallback hue (existing `FALLBACK_STYLE` grammar) | No error expected |

</intent-contract>

## Code Map

- `shared/src/types.ts:262-269` -- `BlipEvent`; append `cls`/`heading`/`speed` after `t`.
- `shared/src/index.ts:126` -- `PROTOCOL_VERSION` 19 → 20.
- `shared/src/sim/silhouette.ts` -- `hullSilhouette(hullId)`, the ONE hull-geometry source; blips reuse it verbatim.
- `server/src/game/signals.ts:234-236` -- `blipShape()`, the single construction site (called at :405 genuine, :430 decoy).
- `server/src/game/signals.ts:392-432` -- the blip registry row + `counterIntel`.
- `server/src/game/world.ts:207-213` -- `Decoy` record; gains frozen `hullId` + `heading` at drop.
- `server/src/game/perception.ts:220-225` -- `blipOrder()`; must stay `(x,y,t,id)`.
- `client/src/render/radar.ts` -- blip ingest/decay/pool; `id` currently discarded (`:151-160`).
- `client/src/render/phosphor.ts:40-48` -- `blipAlpha`/`blipTint`; life extends to 3 sweep periods.
- `client/src/render/ships.ts:100-114` -- `hullStyle`/`contactStyle`/`isDroneHull`, the hue chokepoint.
- `client/src/config.ts:1005-1015` -- `CLIENT_CONFIG.blip`; new persistence + vector knobs.
- `client/src/net/roomBindings.ts:439` -- blip dispatch into `Radar.onBlip`.
- `client/vite.config.ts:10-12` -- `define` precedent (`__APP_VERSION__`) for the Variant P flag.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/types.ts` -- append `cls: HullId`, `heading: number`, `speed: number` to `BlipEvent` with an anti-cheat comment noting these are not range-derivable -- FR14 wire shape.
- [x] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 20 -- wire-breaking change.
- [x] `server/src/game/world.ts` -- add frozen `hullId` + `heading` to the `Decoy` record, snapshotted from the owner at drop -- lets the buoy paint without a live owner lookup (survives owner death).
- [x] `server/src/game/signals.ts` -- extend `blipShape()` to take hull id + pose and emit the three new fields last; pass the ship's live values on the genuine path and the buoy's frozen snapshot (speed 0) on `counterIntel` -- one shaper, identical payload.
- [x] `client/src/render/blipMarks.ts` (new) -- PURE geometry: the arrowhead-vector polyline for a (heading, speed) pair, and the algorithmic per-hue luminance floor -- unit-testable, zero Pixi.
- [x] `client/src/render/radar.ts` -- key live blips by `id`, cap each contact's track at 3 (TTL-based), raise the global cap, and draw each paint as a `Graphics` tracing `hullSilhouette(cls)` at true world scale, rotated to heading, stroked `{width:1, pixelLine:true}` in the floored hue, plus the speed vector -- the story's render change.
- [x] `client/src/render/phosphor.ts` -- extend blip life to `CLIENT_CONFIG.blip.persistSweeps` periods and re-document the decay contract -- 3-paint persistence.
- [x] `client/src/config.ts` -- add `persistSweeps`, `ghostsPerContact`, vector length knobs, and the luminance-floor target -- tunables in the client-only home.
- [x] `client/vite.config.ts` + `client/src/config.ts` -- `__BLIP_VARIANT_P__` build define, default false -- Variant P phosphor-anonymous swap.
- [x] `server/src/__tests__/signals.test.ts`, `decoy.test.ts`, `perception.test.ts` -- update the blip key-order, `counterIntel` `toEqual`, and WIRE-INDISTINGUISHABILITY assertions for the 8-field shape; ADD a decoy-outlives-owner case -- the counter-intel law re-pinned.
- [x] `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap` -- regenerate (`vitest -u` in `server/`) and hand-inspect that ONLY blip events gained fields -- golden-frame discipline.
- [x] `shared/src/__tests__/barrel.test.ts`, `server/src/__tests__/denials.test.ts` -- update the pinned PROTOCOL_VERSION literals to 20 -- the bump's tripwires.
- [x] `client/src/__tests__/blipMarks.test.ts` (new) + `phosphor.test.ts` -- cover the vector geometry, the luminance floor across all 20 hues + 8 CVD families, and the 3-sweep decay -- new pure surface.

**Acceptance Criteria:**
- Given a swept LOS-clear ship, when a blip is built, then it carries the ship's hull id, heading and signed speed, and the perception invariant fuzz (`perception.test.ts` THE INVARIANT) still passes with the widened payload.
- Given a decoy buoy and a real ship both painted in the same frame, when their payloads are compared, then their key sets, key ORDER and value types are identical — the lie is distinguishable only by watching it fail to move.
- Given a contact painted repeatedly, when a fourth paint arrives, then exactly three blips for that contact remain on screen, the newest brightest.
- Given the camera at any zoom in 0.5×–1.5×, when blips render, then the silhouette outline stays a 1px hairline and the blip footprint equals the ship's true hull footprint.
- Given `__BLIP_VARIANT_P__` is true at build time, when blips render, then every blip is phosphor green and no personal hue appears on any blip.
- Given a client at PROTOCOL_VERSION 19, when it tries to join a v20 server, then matchmaking rejects it before a seat is reserved (existing `protocolVersionError` gate, symbol-driven).

## Spec Change Log

No bad_spec loopback occurred — the spec was not amended during review.

## Review Triage Log

### 2026-08-04 — Review pass

Gate: 2 adversarial hunters (Fable — Blind Hunter + Edge Case Hunter) in parallel, plus a
cross-model Codex review of the same diff. Verdicts: build-on-it, build-on-it, fix-first (Codex).

- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 1, low 4)
- defer: 3: (high 0, medium 0, low 3)
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` The colorblind assist's luminance floor was silently undone by decay: the
    floor is baked into the stroke color once, but `blipCool` then multiplies every channel to
    `coolFloor` (0.55), dragging a lifted cobalt/azure ghost to ~0.11 linear luminance — below even
    the BASE floor — for the last ~70% of its 12s life, i.e. defeating the assist for exactly the
    hues it exists to rescue. Added `assistCoolFloor` (0.85) and made `blipCool` take the floor as a
    parameter, so the assist cools on a shallower ramp and keeps its floor for the whole paint.
    Pinned by a new regression test verifying the darkest Regatta hue, lifted to the assist floor and
    fully cooled, still clears the base floor — confirmed RED when `assistCoolFloor` is reverted to
    `coolFloor` (Blind Hunter, single-model finding, verified against the code before fixing).
  - `[low]` `[patch]` Codex (high confidence, fix-first) claimed pooled `Graphics` are re-acquired
    carrying the previous life's decayed `alpha`/`tint`, so a fresh paint could draw dim.
    ADJUDICATED AGAINST the finding after tracing `app/loop.ts`: the render callback runs at ticker
    priority NORMAL and Pixi's own render is added at LOW, so `updateBlips` always rewrites both
    before the stage draws — unreachable today, and the Blind Hunter's independent trace agreed.
    Took the hardening anyway (reset alpha/tint on acquire) because the invariant otherwise rests on
    implicit ticker ordering that nothing in the file would notice breaking.
  - `[low]` `[patch]` The `MAX_LIVE_BLIPS` sizing comment was arithmetically impossible: it justified
    128 as "19 ships + 19 decoy buoys × 3 ≈ 114", but the per-contact cap keys on blip `id` and a
    decoy paints under its OWNER's id, so the true ceiling is 19 distinct ids × 3 = 57. Comment
    corrected to state the shared-budget mechanism (both hunters flagged this independently).
  - `[low]` `[patch]` `hullSilhouette(cls)` is a bare record lookup returning `undefined` for an
    unregistered id, which would throw inside the Colyseus message handler and take blip ingest down
    for the session. Unreachable from a conforming server (the PV-20 gate gives both sides the same
    `HullId` union), so added a fail-soft fallback rather than a validation layer.
  - `[low]` `[patch]` The `BlipEvent` anti-cheat comment overstated its guarantee ("never leaks build
    state"). Base class envelopes are public CONFIG, so a paint above a class's base `maxSpeed` does
    imply an engine boon or active boost. Softened to state the honest limit and to record that this
    extends an accepted sight-range disclosure (`Contact` already ships raw speed) outward to radar
    range rather than opening a new class of leak — what the rule buys is that the wire never states
    build state OUTRIGHT.

Rejected (noise): the decoy's `cls` always being `mineLayer` (already ratified and documented in
amendment 11 and the spec's Design Notes — not a new finding); and a "speed 0 identifies a decoy"
line of attack that the Blind Hunter itself disproved on trace (`approach()` snaps to target exactly,
so a genuinely stopped hull reports speed exactly 0 and, having no rudder authority at rest, also
holds heading and position across sweeps — the lie is behaviorally consistent, not merely
payload-consistent).

## Design Notes

**Eric rulings, 2026-08-04 (this run's pre-implementation question gate).** The governing instruction
was *"how does it work on a real radar? just do that."*

- **R1 — TRUE-SCALE silhouettes, not px miniatures.** A blip paints the hull's real outline at its
  real size and position. This SUPERSEDES DESIGN.md's ratified blip block: the per-class px table
  (BB 14 / ML 12 / TB 11), the 11px floor-clamp rule, the 3×-deep ML blip notch, and "aspect ratio
  and size do the discriminating work at blip scale". Those levers existed only to make a tiny
  symbol legible; at true scale a 124u battleship and a 100u torpedo boat are unmistakable. Eric,
  on being told this was less realistic than a symbol: *"this is still a video game?"* — and in
  fact it is CLOSER to a real return, which smears to the target's angular extent. Fixed-size
  symbology is the ARPA convention layered on top.
- **R2 — realistic behavior, ratified silhouette grammar kept.** FR14/UX-DR10's outline+heading
  reading stands; radar *practice* settles the open behavior questions below.
- **R3 — 3-paint persistence.** Long-persistence phosphor is how course and speed are actually read
  off a scope. Live paint + 2 decaying ghosts (~12s of track at 15rpm). Ghosts keep their
  silhouettes (Eric chose this over the hybrid blobs option). Free bonus: ghost SPACING encodes
  speed — a 30 u/s battleship covers ~one hull length per sweep, so its ghosts sit nose-to-tail,
  while a loitering hull's ghosts overlap into a blob.
- **R4 — ARPA speed vector**, arrowhead, length ∝ speed, clamped both ends.
- **R5 — the decoy is a radar reflector.** It reports TRUE stationary values: `speed` exactly 0,
  `heading` and `cls` frozen from the owner at drop. Real decoys are unmasked by behavior over time,
  not by payload — so the wire law holds while counterplay becomes a skill. Deliberately NOT a live
  owner read (that would leak the owner's live course/speed at a false position while they are
  fogged, and is undefined once they are dead). `cls` is always `mineLayer` in practice since only
  the ML fits a decoy buoy — inherent to the weapon, not a new disclosure.
- **R6 — drones paint their legacy chevron at true size**, all three tiers (bigger hull, bigger
  return; also already ratified as "legacy chevron + its sizes").
- **R7 — algorithmic luminance floor**, not a hand table: lift each hue's relative luminance to a
  target, preserving hue. This RESOLVES DESIGN.md's open per-hue-variant question by removing the
  table, and covers the 8 CVD families for free.
- **R8 — Variant P is a build-time define**, default Variant C.

**Non-scaling stroke.** Pixi 8 `stroke({ width: 1, pixelLine: true })` renders exactly 1 screen px
regardless of the camera transform, so no per-frame zoom recompute or redraw-on-zoom bookkeeping is
needed. Verified present in `pixi.js@^8.19`.

**Accepted consequence (ledger, do not fix here).** A decoy blip carries its OWNER's ship id, so if
the owner's real hull and their buoy are both swept in one tick, two blips share one id and share
the 3-slot track cap. Unmodified clients see two plausible tracks (correct and realistic); the
underlying same-id-twice cross-reference is a PRE-EXISTING wire tell already ledgered from Story 1.8
(`deferred-work.md:90`), not introduced here.

**Render cost.** Worst case is 19 ships + 19 buoys × 3 paints ≈ 114 live blips (vs today's 64 cap).
Each is an outline-only `Graphics` with no fill; geometry is rebuilt only on acquire, not per frame.

## Verification

**Commands:**
- `npm install` (in the worktree — it has no `node_modules`) -- expected: workspaces linked.
- `npm run lint` -- expected: clean, complexity ≤ 10 everywhere.
- `npm test -w shared` -- expected: green, PROTOCOL_VERSION pin now 20.
- `npm test -w server` -- expected: green; registry counts stay 15/15/17 (no new row); golden snapshot regenerated with blip-only field additions.
- `npm test -w client` -- expected: green, plus the new `blipMarks` and extended `phosphor` cases.
- `npm run check` -- expected: lint + type-check + all suites green; total above the 2624 baseline.

**Manual checks (if no CLI):**
- Inspect the regenerated golden snapshot diff: ONLY `blip` events may have gained `cls`/`heading`/`speed`; every other channel byte-identical.

## Auto Run Result

Status: done. Cycle 41 → VERSION 0.17.41.

**What shipped.** A radar paint stopped being an anonymous dot. `BlipEvent` now carries
`cls`/`heading`/`speed` (PROTOCOL_VERSION 19 → 20), and the client draws each paint as the ship's
TRUE-SCALE hull silhouette at its true position and heading — the same shared `hullSilhouette()`
polygon the hull renderer and the server hit-tests use — in a 1px non-scaling hairline, tinted with
the owner's algorithmically luminance-floored personal hue, with an ARPA-style arrowhead vector whose
length is proportional to speed. Paints persist three sweeps (live + 2 ghosts, capped per contact),
so a contact leaves a plottable track and ghost SPACING encodes speed the way it does on a real
scope. Drones paint their legacy chevron at true size; the decoy buoy paints a stationary Mine Layer.

**Files changed.**
- `shared/src/types.ts` — `BlipEvent` + the anti-cheat rationale for why heading/speed are not range-derivable.
- `shared/src/index.ts` — PROTOCOL_VERSION 20 with its changelog entry.
- `server/src/game/world.ts` — `Decoy` gains frozen `hullId`/`heading`, snapshotted at drop.
- `server/src/game/signals.ts` — one `blipShape()` emits the widened payload for both the genuine and the decoy path.
- `server/src/game/perception.ts` — comment only: pins why the new fields stay OUT of `blipOrder`'s sort key.
- `client/src/render/blipMarks.ts` (new) — pure speed-vector geometry + the algorithmic WCAG luminance floor.
- `client/src/render/radar.ts` — tracks keyed by id, 3-per-contact cap, silhouette + vector drawing.
- `client/src/render/phosphor.ts` — 3-sweep life, hue-preserving `blipCool` (assist-aware floor).
- `client/src/util/pool.ts` — `capOldestByKey`.
- `client/src/config.ts`, `client/vite.config.ts`, `vitest.config.ts`, `vite-env.d.ts` — tunables + the `__BLIP_VARIANT_P__` build define.
- `client/src/main.ts` — injects the roster hue resolver into `Radar`.
- Tests: `signals`/`decoy`/`perception`/`denials`/`spectator`/`barrel` updated for the 8-field shape and PV 20, golden snapshot regenerated, new `blipMarks.test.ts`, extended `phosphor.test.ts` + `pool.test.ts`.

**Review findings.** 0 intent_gap, 0 bad_spec, 5 patches applied (1 medium, 4 low), 3 deferred, 2
rejected. Detail in the Review Triage Log above. The one behavioral defect was the colorblind
assist's luminance floor being undone by the cooling ramp; it now has a regression test proven RED
without the fix. Codex's sole finding (fix-first, pooled `Graphics` stale visual state) was
adjudicated against on a trace of the ticker priority ordering, with the hardening taken anyway.

**Verification.** `npm run check` exit 0 — lint (0 errors, 2 pre-existing `max-lines-per-function`
warnings), type-check clean across all three workspaces, and 400 shared / 835 server / 1420 client =
**2655 tests** green, up from the 2624 baseline. Golden-snapshot diff hand-inspected: exactly four
blip lines gained the three fields, every other channel byte-identical. The Variant P define was
proven to reach the emitted bundle (different bundle hash, name absent from the default build).

**Residual risks.**
1. **Visual density is unmeasured.** Three true-scale outlines per contact is materially more ink
   than three dots, and no live playtest has happened. This is the epic guardrail Story 4.8's
   readability gate exists to arbitrate, and it is the single most likely thing to want tuning
   (`persistSweeps`, `paintsPerContact`, and the cooling ramp are all CONFIG knobs).
2. **Render cost is reasoned, not profiled.** Outline-only Graphics with geometry built at acquire
   rather than per frame, bounded at 128 — but no frame-budget measurement was taken on the
   reference device, which the epic asks for as effects land.
3. **The decoy is knowingly weaker.** With persistence, a stationary buoy's stacked paints unmask it
   in roughly two sweeps (~8s). Eric accepted this explicitly; it is realistic, and it converts decoy
   counterplay from "impossible" to "a skill", but it is a real nerf to Story 1.8 worth watching.
4. **`radar.ts` remains the untested Pixi adapter** by house convention — the new pure math is well
   covered, but the drawing path itself is verified by inspection, not by test.
