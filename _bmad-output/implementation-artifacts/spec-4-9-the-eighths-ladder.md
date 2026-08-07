---
title: 'Story 4.9 — The Eighths Ladder'
type: 'feature'
created: '2026-08-06'
status: 'in-progress'
baseline_revision: 'c7c58033fd01cee16013aefeb401aa88ab325bfe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Every sensor boundary in the game is its own unrelated number, so "how far can I see that" has five answers and no captain can hold them in their head. Eric ratified one ruler — INTEL RANGE, divided into eighths — and two of its rungs disagree with the shipped constants.

**Approach:** Make every sensor boundary a named eighth of intel range, all SIGHT-anchored exactly as `radar = SIGHT * 2` already is; move muzzle-flash carry from 6/8 to 5/8 (which drags wounded-smoke reach with it, deliberately); give mines and torpedoes their own 3/8 detect gate instead of the truesight gate they share with six unrelated disclosures; and rebase the foghorn's volume tiers onto the ladder as eight regions of the listener's intel range.

## Boundaries & Constraints

**Always:**
- Every rung is a `SIGHT` multiple in `CONFIG.vision`. 8/8 = `SIGHT * 2` (radar), 7/8 = `SIGHT * 1.75`, 5/8 = `SIGHT * 1.25`, 4/8 = `SIGHT` (sight), 3/8 = `SIGHT * 0.75`. No rung is an independent literal; no consumer re-derives a boundary ad hoc.
- Detect resolves per observer as `0.75 × sightOf(me, now)` — dazzle-scaled, boon-widened, island LOS applied (amendment 121). The base rung and the runtime factor must be pinned to each other by test so they cannot drift.
- Detect lands as a NEW parameterized gate. `pointSighted` keeps its exact current behavior for its other six consumers (decoys, booms, bursts, sunk-witness, spawns, shells). **Shells do not move.**
- The foghorn band is which eighth of the LISTENER's `stats.radarRange` the honker sits in; gain is `1.0 / 1.0 / 1.0 / 1.0 / 0.875 / 0.75 / 0.625 / 0.5` for bands 1-8. Blocked LOS resolves to `max(5, band + 2)`, silent above 8 — exactly ONE `losClear()` call and ONE set of bounds in the row (amendments 54, 122).
- Island LOS applies to every gate this story touches, unchanged (2026-08-02 ruling).
- `PROTOCOL_VERSION` bumps 29 → 30.

**Block If:**
- Holding the ladder would require changing `CONFIG.vision.sight` or `CONFIG.vision.radar`, or any damage/reload/hp/xp/catalog value.
- The foghorn rebase cannot preserve BOTH anchors (full volume through truesight, 50% at the radar edge) without a further ruling.
- A rung's derivation turns out to be consumed somewhere that makes `detect < sight < muzzleFlash < radar` unholdable.

**Never:**
- Never narrow `pointSighted` itself, and never move shells, decoy buoys, booms, bursts, sunk-witness or spawns off truesight.
- Never branch on the 7/8 rung in any radar paint path — it is Story 4.10's calibration target, and `if (d > farRadar)` violates amendment 105 (amendment 123).
- Never add a per-weapon `detectRange` stat, touch the `intelRadar` boon, or build any parking-lot card (amendments 112, 117, 119).
- Never introduce a fourth vision constant for wounded smoke — its reach IS `muzzleFlash` and moves with it (amendment 42).
- No new radar rendering, return model, shadow, or wake work — those are 4.10/4.11/4.12.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enemy mine at the new boundary | Undazzled observer, mine at 247.5u, LOS clear | Visible (inclusive); invisible at 247.5u + 0.01 | No error expected |
| Dazzled mine detection | Observer dazzled, mine at 200u | Invisible — detect is `0.75 × 165` = 123.75u | No error expected |
| Boon-widened detection | `intelTruesight` stacked, mine at 280u | Visible — detect scales with the widened sight | No error expected |
| Torpedo reveal | Torpedo closing head-on, LOS clear | First revealed at 247.5u (~4.1s at 60 u/s), not 330u | No error expected |
| Shell reveal unchanged | Gun shell inbound, LOS clear | Still first revealed at the truesight boundary | No error expected |
| Homing torpedo updates | Revealed homing torpedo drifts past detect | `torpU` corrections stop at the detect boundary, matching first reveal | No error expected |
| Mine boom without the mine | Mine detonates at 300u, never detected | The boom/burst IS seen; the mine never was | No error expected |
| Owner and lit-zone paths | Own mine anywhere; enemy mine inside an owned lit zone | Both still visible — the OR-paths are untouched | No error expected |
| Muzzle flash / smoke reach | Shooter or hurt hull at 450u, LOS clear | No `mz`, no `sm` — halo is now 412.5u | No error expected |
| Honk at truesight edge | Honker at 330u (band 4), LOS clear | Band 4 → 100% gain | No error expected |
| Honk at the radar edge | Honker at 660u (band 8), LOS clear | Band 8 → 50% gain; beyond 660u no event at all | No error expected |
| Honk blocked inside the plateau | Honker at 100u (band 2), island between | Resolves to band 5 → 87.5% — a rock always costs reach | No error expected |
| Honk blocked at the outer band | Honker at band 7 or 8, island between | `band + 2 > 8` → no event emitted | No error expected |
| Dazzled listener | Listener dazzled, honker at 600u | Band unchanged — bands ride intel range, so dazzle cannot deafen | No error expected |
| Stale client | Old bundle joins after deploy | Rejected at matchmake by the PV gate, never misrenders | `protocolVersionError` refresh message |

</intent-contract>

## Code Map

**shared/**
- `shared/src/constants.ts:13` — `const SIGHT = 330`, the ladder's anchor.
- `shared/src/constants.ts:146-172` — `CONFIG.vision`; `muzzleFlash: SIGHT * 1.5` at `:166` is the value that moves. New rungs land here.
- `shared/src/index.ts:243` — `PROTOCOL_VERSION` 29 → **30**.
- `shared/src/types.ts` — `FoghornEvent.v` widens from a 1|2|3 tier to a 1..8 band.
- `shared/src/sim/stats.ts:197-200` — `radarRange`/`sightRange` seeding; **no change**, the foghorn reads `stats.radarRange` as-is.

**server/**
- `server/src/game/signals.ts:199-208` — `pointSighted`; **do not narrow.** The new gate is its sibling.
- `server/src/game/signals.ts:183-197` — `sightOf`, the single dazzle entry point the new gate must reuse.
- `server/src/game/signals.ts:365-381` — `mineSignal.visible`, first caller to move.
- `server/src/game/signals.ts:548-566` — `ballisticSignal(kind)`, shared by `shell` and `torp`; fork the gate on `kind` only.
- `server/src/game/signals.ts:608-629` — `torpedoUpdateSignal`, third caller to move.
- `server/src/game/signals.ts:910` / `:947` — the `mz` and `sm` halos; both read `CONFIG.vision.muzzleFlash` and need no edit, only revalidation.
- `server/src/game/signals.ts:987-1001` — `hornTierFor`, replaced by the band resolver.

**client/**
- `client/src/render/projectiles.ts:187-188`, `:285-286`, `:302-303` — `SIGHT_CULL_MARGIN` and the dead-reckoning cull; torpedoes need a detect-derived cull.
- `client/src/main.ts:1618-1619` — where `setSightRange` is plumbed.
- `client/src/config.ts:1557-1570` — `CLIENT_CONFIG.foghorn.tierGain` → an 8-entry band gain table.
- `client/src/net/roomBindings.ts:595-604` — `handleFoghorn`; band → gain lookup.
- `client/src/render/foghorn.ts` — chevron weight, currently tier-keyed.

**tests/**
- `shared/src/__tests__/zone.test.ts:69-93` — the derivation pins; `1.5` literal at `:75` must become `1.25`, plus new rungs and the full ordering.
- `shared/src/__tests__/damageBands.test.ts:44-54` — a second `1.5` literal at `:47`.
- `server/src/__tests__/perception.test.ts:1245`, `:1311`, `:1328` — the INDEPENDENT oracle deliberately hardcodes `1.5`; it must be updated by hand or the invariant suite disagrees with production between 412.5u and 495u.
- `server/src/__tests__/foghorn.test.ts:17-19`, `:239-250` — reads bounds off CONFIG so it re-aims itself, but its 400u placements sit only 12.5u under the new halo.
- `server/src/__tests__/goldenFrames.test.ts:725-754` — gunnery scenario places observers at a hardcoded 400u inside the halo; margin shrinks 95u → 12.5u.
- `server/scripts/weaponsSmoke.mjs:31`, `:92-104`, `:275` — asserts every enemy mine is first seen at `d <= SIGHT + 1`; that bar is now the detect range.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- move `muzzleFlash` to `SIGHT * 1.25`, add `detect: SIGHT * 0.75`, `detectFactor: 0.75`, and `farRadar: SIGHT * 1.75`, and write the ladder doc block naming every rung -- one ruler, expressed in the derivation style the file already uses; `farRadar` carries the loud comment that it is 4.10's calibration target and must never be branched on.
- [ ] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` to 30 -- the foghorn's `v` field changes shape and the client's torpedo cull becomes detect-derived.
- [ ] `shared/src/types.ts` -- widen `FoghornEvent.v` to the 1..8 band and document that gain is a client-side lookup, never on the wire -- the payload stays an opaque enum the listener cannot invert into a range.
- [ ] `server/src/game/signals.ts` -- add `pointDetected(me, p, islands, now)` as `pointSighted`'s sibling using `sightOf(me, now) * CONFIG.vision.detectFactor`; point `mineSignal`, `ballisticSignal`'s `torp` branch, and `torpedoUpdateSignal` at it and nothing else -- narrowing the shared helper would silently shrink six unrelated disclosures, and shells must not move.
- [ ] `server/src/game/signals.ts` -- replace `hornTierFor` with a band resolver over `me.stats.radarRange`, returning `max(5, band + 2)` when LOS is blocked and null above 8 -- the ladder makes "dazzle cannot deafen" structural, so amendment 53's clamps retire; the muffle stays one post-resolution step with one `losClear()` call.
- [ ] `client/src/config.ts` -- replace `foghorn.tierGain` with an 8-entry band gain table and re-key the chevron weights -- presentation stays client-side; the server still decides who hears what.
- [ ] `client/src/net/roomBindings.ts` + `client/src/render/foghorn.ts` -- map band → gain and band → chevron weight -- single fan-out point, unchanged in shape.
- [ ] `client/src/render/projectiles.ts` + `client/src/main.ts` -- give torpedoes a detect-derived cull radius alongside the existing sight-derived one -- otherwise the client dead-reckons an un-corrected torpedo ghost past the range the server stopped updating it.
- [ ] `shared/src/__tests__/zone.test.ts` + `shared/src/__tests__/damageBands.test.ts` -- update the `1.5` literals to `1.25`, pin every new rung's derivation, pin `detect === sight * detectFactor`, and pin the full ordering `detect < sight < muzzleFlash < farRadar < radar` -- the ladder is only real if a drift fails the build.
- [ ] `server/src/__tests__/perception.test.ts` -- update the three hardcoded `1.5` literals in the independent oracle and add a detect-range oracle for mines and torpedoes that does NOT import the production gate -- the oracle's independence is the anti-cheat guarantee; it must be re-derived, not aliased.
- [ ] `server/src/__tests__/foghorn.test.ts` -- cover all eight bands, both anchors, every blocked-LOS case including the plateau floor and the outer-band silence, and dazzle-does-not-deafen -- the band table is the story's most behavior-visible change.
- [ ] `server/src/__tests__/signals.test.ts` + `goldenFrames.test.ts` -- re-aim mine/torpedo boundary tests at the detect range, prove shells still reveal at truesight, and widen the shrunken 12.5u placement margins -- the golden scenarios pass today only by 12.5u and that is not a margin worth trusting.
- [ ] `server/scripts/weaponsSmoke.mjs` -- assert enemy mines are first seen at the detect range rather than `SIGHT` -- the live socket smoke is the one place the whole gate is exercised end to end.

**Acceptance Criteria:**
- Given `CONFIG.vision`, when the ladder lands, then every sensor boundary is a named `SIGHT` multiple on the eighths ladder and no boundary anywhere in the codebase is an independent literal.
- Given the constraint suite, when it runs, then it fails the build if any rung's derivation drifts or the ordering `detect < sight < muzzleFlash < farRadar < radar` breaks.
- Given a captain with no boons and no dazzle, when a torpedo closes head-on, then it is first revealed at 247.5u rather than 330u, while a gun shell on the same line is still first revealed at 330u.
- Given the six non-moving `pointSighted` consumers, when the detect gate lands, then decoys, booms, bursts, sunk-witness, spawns and shells reveal at byte-identical ranges to before.
- Given the perception invariant suite, when it runs, then the independent oracle agrees with production at every boundary between 247.5u and 495u, and the master invariant still holds for every other row.
- Given a honking captain and a listener with no boons, when the honker sits at truesight, then the listener hears 100%; at the radar edge 50%; and past it, no event reaches the listener at all.
- Given a dazzled listener, when a honk arrives from any range, then the band and gain are identical to the undazzled case — dazzle cannot deafen.
- Given `npm run check`, when it runs, then lint (complexity ≤ 10), all three type-checks, and the full suite pass.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why detect is a sibling gate, not a narrowed one.** `pointSighted` has nine call sites: mines, shells, torpedoes, homing-torpedo updates, decoys, booms, bursts, sunk-witness and spawns. Eric named mines and torpedoes; narrowing the shared helper would have quietly moved six other disclosures and broken the explicit "shells do not move" ruling — and `shell` and `torp` are literally the same generic row body today, so the fork has to be deliberate.

**Why the foghorn's clamps retire rather than being retuned.** Amendment 53's `max()` clamps existed because `muzzleFlash` is flat while `sightOf` is dazzle-scaled, so the three bounds were not monotone by construction. Anchoring bands on intel range — which dazzle never touches — makes "dazzle cannot deafen" true by construction instead of by defensive coding. The trade taken knowingly: hearing now widens with `intelRadar` rather than `intelTruesight`.

**Why the muffle is `max(5, band + 2)`.** Two bands is the width of one old tier, so the demotion reproduces amendment 54 at its boundaries — a honk at the truesight edge blocked by rock still lands at 75%, and the outer bands still lose the honk entirely. The floor of 5 is what keeps "a rock always costs the honker reach" true inside the 100% plateau, where a pure band shift would have cost nothing.

**The margins nobody should trust.** Two shipped scenarios place observers at a hardcoded 400u inside a 495u halo. At 412.5u they still pass — by 12.5u. Widen them rather than discovering the coincidence later.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean at complexity ≤ 10, all three type-checks pass, full suite green with the new ladder, detect-gate and band tests.
- `npm test -w shared` -- expected: every rung's derivation and the full ordering pinned and passing.
- `npm test -w server` -- expected: perception invariants hold with the independent oracle re-derived at the new boundaries; mine/torpedo boundary tests at 247.5u; shell boundary unchanged at 330u.
- `npm test -w client` -- expected: band → gain and band → chevron weight mappings pass; torpedo cull is detect-derived.
- `HC_DEV_OPTIONS=1 node server/scripts/weaponsSmoke.mjs` -- expected: no enemy mine ever first seen beyond the detect range; a PV bump must not break the join.

**Manual checks (if no CLI):**
- Two clients in one room: honk from just inside and just outside each eighth and confirm the volume steps land where the band table says, and that an island between the two always costs at least one step.
