---
title: 'Story 2.6: XP Tick & Kill Bonuses'
type: 'feature'
created: '2026-07-30'
status: 'in-review'
baseline_revision: '7529784'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Progression is kill-banked only (`grantPoint` fires solely from `sinkShip`, world.ts:570-576): a captain who never lands a kill never grows — the opposite of the ratified economy shape (passive tick = the anti-snowball floor, the Rat Covenant's price). There is no XP/level concept anywhere (no CONFIG, no wire fields, no HUD satellites — 2.2 only reserved the 16px gutter), and drones bank unbounded invisible offer arrays.

**Approach:** Make level-ups the ONLY banking trigger. Server-authoritative integer-ms XP accumulator on `ShipRecord` (`xpMs`, `level`): passive accrual `+dtMs` per tick while match-active AND alive AND human (amendment 34); a kill adds `levelMs × value` — human victim = 1 full level, drone victim = its size tier ¼/⅓/½ (amendment 31); fractions always carry (amendment 32). Each threshold crossing calls the existing `grantPoint` (offer roll + `pt` event unchanged — `pts === offers.length` invariant intact). Wire: self-private `you.lvl` + `you.xp`, PV 13→14, new `CONFIG.xp` block. Client: the real economy satellites in the reserved gutter (3px XP rail + LV tag, level chip with breathing glow, "LEVEL UP — TAB TO REFIT" cue line) replacing the bottom-right amber PTS readout (amendment 33).

## Boundaries & Constraints

**Always:**

- **CONFIG is the shape (story AC):** new `CONFIG.xp = { levelMs: 60000, killLevels: 1, droneTierLevels: { small: 0.25, medium: 1/3, large: 0.5 } }` (names indicative; values are declared handwaves — 2.10 tunes them). Tier fractions ARE the PvE CONFIG hooks; Epic 5 fleets reuse them. Damage grants ZERO XP — no damage-XP path may exist.
- **Integer-ms accumulator, no float drift:** `xpMs += dtMs` per tick; kill adds `round(levelMs × value)`; bank loop `while (xpMs >= levelMs) { xpMs -= levelMs; level += 1; grantPoint(ship) }`. 1200 ticks × 50ms = exactly one level. Multiple crossings in one grant bank multiple levels.
- **Gating (amendment 34):** passive accrual runs only when the match phase is `active` (a new `xpEnabled` policy flag mirroring `damageEnabled` plumbing, match.ts:281-285 — World stays Colyseus-free and phase-blind) AND the ship is alive AND `!isDrone`. Kill-credit XP is NOT alive-gated (a shell in flight after the killer's elimination still credits — preserves the pinned "dead killer still banks" behavior, upgrades.test.ts:80-166). Drones NEVER accrue XP or offers (guard in the credit path — the ratified bugfix).
- **XP tick gets an explicit, documented position in the step order** (end of step, after `processRespawns`, before event swap — world.ts:719-765 comment updated).
- **Lifecycle:** `redeployShip` wipes `xpMs`/`level` to 0 (with upgrades/offers/boons, world.ts:518-547); `respawn` preserves them (world.ts:1404-1430). Storm/self/unattributed sinks grant nothing (sinkShip `by` semantics unchanged).
- **Wire (self-private):** `OwnShip.lvl: number` (int, levels completed) + `OwnShip.xp: number` (0..1 fraction `xpMs/levelMs`) ride `you` and NOTHING else — extend the types.ts anti-cheat comment; frames.ts copies both; spectator/contact/results planes untouched. No new event kind — `pt` IS the level-up event (perception EVENT_KINDS lists unchanged). PV 13→14 with the index.ts changelog convention (new fields + `CONFIG.xp` in the welcome snapshot).
- **Client satellites (amendments 27, 33; epic UX):** new `client/src/render/xpRail.ts` owning the reserved gutter (`hotbarLayout().gutterX`, x∈[28,44), render-only — `slotAtPoint` stays water, hotbar.test.ts:260-290 pins hold): 3px rail per the rail idiom tokens (config.ts:501-512 — dim phosphor track, bottom-up fill, soft glow; HP rail alone is 6px), LV tag, level chip showing banked count (`you.pts`), hidden at zero; chip breathing glow 2.4s cycle decaying to static after ~10s unspent, re-arming on a new bank or refit-window open (TAB per amendment 1), obeying `settings.motionIntensity` and the 1.1 Hz pulse cap; "LEVEL UP — TAB TO REFIT" cue line appears with the chip. Dual-coded (never color alone); all chip/tag text ≥ the ratified micro-type sizes (amendment 15), phosphor-not-grey (amendment 16).
- **HUD handoff (amendment 33):** delete `pointsLine`/`ptsLabel` (hud.ts:176-180, 394, 588-599) and its `vitalsLayout` slot; toast copy becomes `▲ LEVEL UP — TAB TO REFIT` (`pointToastLine`, upgradeToast.ts:37-40); `point` tone reused unchanged on `pt`.
- **Client stability pins:** `ownStatsChanged` keeps ignoring pts/offer AND the new xp/lvl deltas (no effectiveStats/fog recompute on fill — upgrades.test.ts:76 extended); the spend-latch `offerSignature` (main.ts:169-176) stays keyed on pts+offer only (passive fill must not clear an in-flight latch); satellites hidden while spectating/dead (`you` absent).
- Cross-cutting: complexity ≤ 10; shared pure; World/Match zero Colyseus imports; seeded RNG only (`upgradeRng` remains the one offer stream); `npm run check` green; no VERSION bump.

**Block If:**
- XP/level/bank state would need to appear on contacts, blips, spectator frames, results, or the public roster schema — information discipline says self-private only.
- The economy shape needs values or mechanics beyond the four recorded rulings (e.g. XP for assists/damage, bank caps, level-scaled costs) — design questions for Eric.

**Never:**
- No offer-shape change (offers stay legacy 3-card `rollOffer` until 2.7 rolls 4 boons). No refit-window/spend changes. No boon grants. No PvE fleets (tiers are CONFIG + drone consumers only). No XP prediction on the client (server-authoritative; client renders `you.xp`/`you.lvl` verbatim). No design-doc edits. Drone kill-feed/results crediting (kills count) unchanged — only the XP value differs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Passive level | active phase, alive human, 1200 ticks × 50ms | exactly one bank at tick 1200: `lvl` +1, `pts` +1, offer rolled, `pt` event | — |
| Kill (human victim) | killer XP at 0.4 progress | +1.0 level: bank immediately, fraction 0.4 preserved | — |
| Kill (drone) | victim `cls: 'medium'` | +⅓ level (`xpMs += 20000`); banks only on threshold | — |
| Double crossing | 0.9 progress + human kill + passive | banks 1, remainder carries; two banks only if ≥ 2.0 total | — |
| Storm / self / unattributed sink | `by` undefined or === victim | zero XP, no bank | Silent |
| Dead killer credit | killer eliminated, shell lands | kill XP still credits and can bank (spend-while-dead unchanged) | — |
| Drone accrual | drone alive through active phase; drone "kills" | drone `xpMs`/`offers` stay empty — never accrues | — |
| Ready room | waiting/countdown ticks | zero passive accrual; rail renders empty | — |
| Match start | countdown→active redeploy | `xpMs`/`lvl` wiped with upgrades/offers/boons | — |
| Winner at finish | phase `finished` | accrual stops (`xpEnabled` false) | — |
| Privacy | enemy/spectator frames | `lvl`/`xp` never leave `you`; invariant suites green | — |
| Chip states | pts 0 → 1 → unspent 10s → new bank | hidden → breathing 2.4s → static → re-arms; cue line with chip | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- NEW `CONFIG.xp` block (levelMs, killLevels, droneTierLevels keyed by drone hull id)
- `shared/src/types.ts` -- `OwnShip.lvl` + `OwnShip.xp` + anti-cheat comment extension
- `shared/src/index.ts` -- PV 13→14 + changelog line
- `server/src/game/world.ts` -- `ShipRecord.xpMs`/`level` (init 0); `grantXp(ship, levels)` bank loop calling existing `grantPoint`; kill-credit swap in `sinkShip` (tier resolver on victim `isDrone`+`cls`); passive tick step (explicit position, `xpEnabled` gate); drone guard; redeploy wipe / respawn preserve; `xpEnabled` field
- `server/src/game/match.ts` -- `applyPolicy` sets `xpEnabled = phase === 'active'` via the existing policy hook plumbing
- `server/src/game/frames.ts` -- copy `lvl`/`xp` onto `you`
- `client/src/render/xpRail.ts` -- NEW: rail + LV tag + chip + cue line in the gutter; breathing/decay/re-arm state; motion/pulse-cap compliance
- `client/src/render/hud.ts` -- delete pointsLine/ptsLabel + vitalsLayout `pts` slot (storm line reflows)
- `client/src/main.ts` -- feed xpRail from `you`; refit-open re-arm signal; wire into render loop
- `client/src/ui/upgradeToast.ts` -- `pointToastLine` → `▲ LEVEL UP — TAB TO REFIT`
- Tests: `server/src/__tests__/upgrades.test.ts` (earn path rework: passive/kill/tier/carry/drone-guard/gating/lifecycle), `world.test.ts` or new `xp.test.ts` (step-order determinism, exact 1200-tick bank), `match.test.ts` (+xpEnabled policy), `frames.test.ts` + `goldenFrames.test.ts` (you shape + snapshot regen; EXPECTED_CHANNELS unchanged), `spectator.test.ts`/`perception.test.ts` (privacy pins extended to lvl/xp), shared `constants`/`barrel.test.ts` (CONFIG.xp + PV 14), client `hud.test.ts` (pointsLine removal, layout), NEW `xpRail.test.ts` (chip states, re-arm, hidden-at-zero, layout inside gutter), `upgrades.test.ts` (recompute-gate ignores xp/lvl; toast copy), `hotbar.test.ts` pins stay green
- Bookkeeping: `sprint-status.yaml` (2-6 → done at end), `_bmad-output/gds-workflow-status.yaml` (next_expected + last_updated), amendments 31–34 (already recorded)

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` + `types.ts` + `index.ts` -- CONFIG.xp, wire fields, PV 14 -- economy shape + contract
- [x] `server/src/game/world.ts` + `match.ts` -- accumulator, grantXp, kill-credit swap, passive step, xpEnabled, drone guard, lifecycle -- amendments 31/32/34
- [x] `server/src/game/frames.ts` -- self-private copy -- information discipline
- [x] `client/src/render/xpRail.ts` (NEW) + `hud.ts` + `main.ts` + `ui/upgradeToast.ts` -- satellites in, PTS line out, toast copy -- amendments 27/33
- [x] Server/shared/client test suites incl. full I/O matrix -- pins reworked deliberately, none deleted silently
- [x] Bookkeeping files -- per-PR protocol (sprint-status 2-6 done, gds-workflow-status advanced, deferred-work entry)
- [x] `npm run check` -- full gate green (1829 -> 1882 -> 1894 after the review patch round)

**Acceptance Criteria:**
- Given a live active match, when 60 seconds pass with no kills, then every alive human banks exactly one level (offer rolled, `pt` fired) and drones bank nothing.
- Given a killer at partial progress, when they sink a human (drone), then exactly `1` (`¼/⅓/½` by size) levels' worth of XP lands with the fraction carried — never snapped, never lost.
- Given any frame to any observer, then `lvl`/`xp`/`pts`/`offer` appear on `you` exclusively (perception + spectator + goldenFrames suites green with PV = 14).
- Given a bank, when the client renders, then the rail wraps, the LV tag increments, the chip appears breathing (2.4s, decaying to static ~10s, re-arming on new bank or TAB refit open, hidden at zero), the cue line shows "LEVEL UP — TAB TO REFIT", the toast fires once — and the bottom-right PTS readout no longer exists.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass.

## Spec Change Log

## Review Triage Log

### 2026-07-30 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 1, low 5)
- defer: 1: (low 1)
- reject: 2: (low 2)
- addressed_findings:
  - `[medium]` `[patch]` Spend-latch early release (Codex, orchestrator-CONFIRMED against the code): the latch cleared on ANY pts/offer signature change, so a passive bank landing mid-flight (pts+1, front offer unchanged — banks append to the back) re-enabled the modal while a spend was still in flight, re-opening the exact double-spend-against-shifted-FIFO hazard the latch exists to prevent (routine under 2.6's timed banking; kill-only before). Fixed with a ratified predicate extracted as a pure helper (`spendLatchReleased`): release on you-gone, pts DROP, FRONT-offer change, or timeout — a bank now HOLDS the latch; degraded edge (simultaneous bank cancels the drop + identically-rolled next offer → holds till the 1.5s timeout) documented as fail-safe. 7 regression tests; the hold-through-bank test shown to fail under the old semantics.
  - `[low]` `[patch]` Non-finite XP guard (both Fable hunters independently): `grantXp(NaN)` passed the `<= 0` guard and poisoned `xpMs` forever (Infinity would spin the bank loop). Both entry points now fail closed on `!Number.isFinite`; regression test proven to fail without the guard.
  - `[low]` `[patch]` Transient pose-gap hide re-armed a decayed chip (both Fable hunters independently): the P-toggle forceSnap branch called the full `hide()`, resetting chip state so the next frame re-armed a fresh 10s breathing window — an unintended fourth re-arm trigger. New state-preserving `hideTransient()` used in the pose-gap branch only; death/spectate keep the full reset (next life cold, ratified).
  - `[low]` `[patch]` Chip label overflow (both hunters): `▲12` overflowed the fixed 22px chip square; counts above 9 now render `▲9+`.
  - `[low]` `[patch]` Refit-modal title vocabulary (Blind Hunter): `SPEND UPGRADE POINT — N BANKED` contradicted amendment 33 one keypress after the "LEVEL UP — TAB TO REFIT" cue; now `SPEND LEVEL — ×N` with a pin test.
  - `[low]` `[patch]` Comment accuracy (Blind Hunter): the kill-credit comment claimed a phase-edge shell still pays — unproducible (damage gates off at the same applyPolicy seam); reworded to the real dead-killer-in-active rationale, matching test title updated.
  - Deferred: dead-killer level-up toast advertises TAB while spectating, where the reward is unspendable (pre-existing shape; 2.7 owns the spend surface) → deferred-work.md 2026-07-30.
  - Rejected: xp wire-precision quantization (wire is msgpack float64 — quantizing saves nothing; client already quantizes for render); Codex's first-active-tick under-award (traced: activation wipes progression at the boundary and accrual over active time is exact — independently verified by the Edge Case Hunter).

## Design Notes

- `grantPoint` survives as the single bank primitive (offer roll + `pt` event + `pts === offers.length`); `grantXp` is the only caller besides tests. 2.7 then swaps `rollOffer` internals without touching the earn path — the cheapest seam, confirmed by investigation.
- `xpEnabled` mirrors `damageEnabled` exactly so World stays phase-blind; ready-room kills are impossible anyway (damage off), so the flag only gates the passive tick in practice.
- Drone tier rides the victim's existing `cls` hull id (`small`/`medium`/`large`, round-robined at fill, ArenaRoom.ts:401) — no new drone state.
- Chip/tag/cue exact strings and micro-layout are draft placeholder copy under the standing draft-copy rule (amendment 13) — canon later; the satellites' geometry must stay inside the reserved gutter so the hud.test.ts no-overlap budget and hotbar water-pins hold.
- Rail wrap on bank: fill simply drops to the new fraction; the chip pulse + toast + tone carry the moment (any extra one-shot flash must respect ≤80ms + motionIntensity; optional, not required).

## Auto Run Result

**Status:** done — implemented, Eric-ruled pre-implementation (amendments 31–34 via AskUserQuestion), adversarially reviewed (2 Fable hunters + Codex cross-model), 6 patches applied, gate green.

**Summary:** Level-ups are now the only banking trigger. Server: an integer-ms XP accumulator on `ShipRecord` (`xpMs`/`level`) accrues `+dtMs` per 50ms tick while the match is active AND the ship is alive AND human (new `xpEnabled` policy flag set by Match on the same seam as `damageEnabled`; explicit step-order position after `processRespawns`); a kill adds `round(levelMs × value)` through `grantXp` — 1 full level for a human victim, the victim drone's size tier (droneSmall ¼ / droneMedium ⅓ / droneLarge ½, `CONFIG.xp.droneTierLevels`, the PvE tier hooks' first real consumer) otherwise — with fractions always carried and every threshold crossing banking through the unchanged `grantPoint` (`pts === offers.length` intact, offers stay legacy 3-card until 2.7). Drones never accrue (the ratified bugfix — the guard sits in the credit path itself). Redeploy wipes `xpMs`/`level`; respawn preserves. Wire: self-private `you.lvl` + `you.xp` (0..1), PV 13→14, `CONFIG.xp` rides the welcome snapshot. Client: new `render/xpRail.ts` satellites in the gutter 2.2 reserved — 3px rail on the HP-rail idiom, LV tag, amber `▲n` chip (breathing 2.4s → static after 10s, re-arming on new bank or TAB refit open, hidden at zero, motion-scaled under the 1.1 Hz cap), "LEVEL UP — TAB TO REFIT" cue line — while the bottom-right amber PTS readout is deleted (IN STORM reflows into its slot) and the toast becomes "▲ LEVEL UP — TAB TO REFIT". Tests 1829 → 1894.

**Files changed:** shared — constants.ts (CONFIG.xp), types.ts (OwnShip.lvl/xp + anti-cheat comment), index.ts (PV 14 + changelog). server — game/world.ts (xpMs/level, xpEnabled, grantXp/addXpMs with non-finite guards, killXpLevels tier resolver, tickXp step, lifecycle semantics, comment accuracy), game/match.ts (applyPolicy xpEnabled), game/frames.ts (lvl/xp on `you`); NEW __tests__/xp.test.ts (23), upgrades/match/frames/denials/perception/spectator suites extended, goldenFrames regenerated (audited delta: `you` gains exactly `lvl`/`xp` as last keys; spectator rows unchanged). client — NEW render/xpRail.ts (+ hideTransient), render/hud.ts (PTS readout deleted, storm reflow), config.ts (xpRail block, ptsAbove retired), main.ts (satellite feed, TAB re-arm, latch rewiring), ui/upgradeMenu.ts (spendLatchReleased pure predicate + SPEND LEVEL — ×N title), ui/upgradeToast.ts (LEVEL UP copy); NEW __tests__/xpRail.test.ts (31), upgradeMenu/hud/upgrades suites extended. Bookkeeping — sprint-status 2-6 done, gds-workflow-status advanced (next_expected → create-story 2-7), deferred-work entry, amendments 31–34 recorded durably pre-implementation.

**Review breakdown:** 6 patches (0 high, 1 medium, 5 low), 1 deferred, 2 rejected, 0 intent gaps, 0 bad-spec loopbacks. The medium (spend-latch early release on a mid-flight bank) was Codex's find, orchestrator-confirmed against the code before patching; the non-finite guard, chip overflow, and pose-gap re-arm were each flagged independently by both Fable hunters; Codex's other finding (first-active-tick under-award) was adjudicated wrong (activation wipes at the boundary; accrual over active time is exact) and rejected. Every behavioral patch carries a regression test proven to fail without the fix.

**Verification:** `npm run check` run independently by the orchestrator after implementation AND after the patch round — lint 0 errors (2 pre-existing warnings), shared 313 / server 702 / client 879 = 1894 green. Implementation and patch diffs hand-reviewed hunk-by-hunk (accumulator + bank loop, tier resolver off the victim's hull id, policy-at-construction, frames self-private copy, latch predicate, hud deletion).

**Residual risks / notes for Eric:** (1) XP values are declared handwaves — 2.10's batch-sim tuning pass owns the retune; the shape (flat cost, ~1/min floor, kill carry, drone tiers) is what's committed. (2) A dead killer still banks (ratified) but the level-up toast points at a spend surface that's hidden while spectating — ledgered for 2.7's spend-UX story. (3) The interim refit modal now says "SPEND LEVEL — ×N" and offers are still the legacy 3-card upgrades until 2.7/2.8 — a deliberate half-generation state. (4) The latch now HOLDS through a mid-flight bank (fail-safe: worst degraded case is a ≤1.5s modal lockout when a spend and a bank land the same instant with an identically-rolled next offer — vanishingly rare, and strictly better than the mis-spend it replaces).

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all workspace tests green (baseline 1829, target higher with new suites)
- `npm test -w server` -- expected: reworked earn-path suite + xp determinism + regenerated goldenFrames pass
- `npm test -w client` -- expected: xpRail suite + hud/toast reworks pass
- `npm test -w shared` -- expected: CONFIG.xp + PV 14 pins pass
