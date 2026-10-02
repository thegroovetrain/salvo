---
title: 'Deck gun numbers retune: machine gun, cannon and flak ladders to Eric''s 2026-10-02 tables'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_revision: '58ee5b8f'
final_revision: '9869d415'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The three deck guns' per-tier ladders do not hit Eric's DPS targets. Eric (2026-10-02, verbatim): *"new numbers for Deck Guns. Only the numbers I specify are changed. Machine Gun: Damage 5/6/6/7/7, Mag Size 12/16/20/24/28, Delay 0.3/0.25/0.2/0.15/0.1, Reload 12 at Tier I | Cannon: Damage 15/16/17/19/20, Turrets/Rounds 1/1/2/2/2, Barrels 1/2/2/3/3 || Flak: Damage 12/22/31/41/50 ... This should make the DPS pretty close for each, even when factoring the ship Reload upgrade on top of it."* Then, mid-run (verbatim): *"Also, updated flak numbers: Damage 12/22/28/38/44, Tier I Reload 3.5"*, then *"Changed mind. Flak Damage 12/20/28/36/44, Tier I Reload 3.5"* — the LAST flak message governs. Then *"Flak Turrets(Max Banked Shots) 1/2/2/3/3"* and *"Also please increase the reload time on Repeater's instant reload from 45 to 60 seconds."* Then, correcting the cannon row as first transcribed: *"Cannon numbers you are showing me are incorrect. I said 15/16/18/19/21 damage"* — then, after running his numbers again: *"Cannon Damage 16/16/18/18/21 (just ran new numbers and i like these better)"* — the cannon damage table of record is 16/16/18/18/21 (the base shell moves 15 → 16).

**Approach:** Re-author the `machineGun`, `deckGun` and `flak` ladders in `shared/src/sim/catalog.ts` with per-rung integer steps that land EXACTLY on Eric's tables (tiers I..V = 0..4 cards), move the four machine-gun base values in `CONFIG.machineGun` and the flak reload base in `CONFIG.flak`, bump `PROTOCOL_VERSION` 69 → 70 (catalog content changed), re-pin every test, comment and doc that stated the old ladders, and rewrite one How-to-Play sentence Eric ruled on. Cycle 166, version 0.18.31, epic-8 amendments 232–233.

## Boundaries & Constraints

**Always:**
- The tables are the literal spec (Eric's numbers are integers; no "rounded" or derived approximations — the R14 lesson):
  - MACHINE GUN: damage 5/6/6/7/7; magazine 12/16/20/24/28; delay 300/250/200/150/100 ms; reload 12 s at tier I, then the standing −5 %/tier `reloadTierScale` convention (12 / 11.4 / 10.8 / 10.2 / 9.6 s, then × `cooldownScale`). Per-rung steps: maxAmmo +4 ×4; rateMs −50 ×4; damage +1 on the rungs to II and IV only (the rungs to III and V author NO damage effect — the catalog validator refuses `add: 0`, and a rung with magazine + delay steps is not empty).
  - CANNON (`deckGun`): base `CONFIG.gun.damage` 15 → 16; damage 16/16/18/18/21 (steps +2 on the rung to III and +3 on the rung to V only — `cannonDamage(step)` is per-rung; the rungs to II and IV author NO damage effect, carrying the barrel step alone); maxAmmo (turrets/rounds) 1/1/2/2/2 (unchanged: +1 on the rung to III); barrels 1/2/2/3/3 (+1 on the rungs to II and IV). The existing `barrels` clamp 1..3 stands and 3 is now reachable. `CONFIG.gun.contactDamage` stays 6 (Eric changes only the numbers he names). Drone hp 45/60/75 does not move; shots to kill at tier I stay 3/4/5 by ceiling (48/64/80 ≥ hp) — the shipClasses envelope test pins that, not the exact ratio.
  - FLAK: damage 12/20/28/36/44 (a flat +8 per rung — `flakDamage()` stays a single helper at +8); reload 3.5 s at tier I (`CONFIG.flak.reloadMs` 4000 → 3500) with the derived −5 %/tier on top (3.5 / 3.325 / 3.15 / 2.975 / 2.8 s); turrets (pool, `maxAmmo`) 1/2/2/3/3 — the +1 pool steps sit on the rungs to II and IV (was III and V); 50 u blast and the fixed 4 hp `contactDamage` unchanged.
  - INSTANT RELOAD (the Repeater's class Shift): `CONFIG.instantReload.reloadMs` 45000 → 60000 (45 s at a maxed RELOAD ladder, was 33.75 s). Nothing else about the Shift moves.
  - Cannon reload base is unchanged. CONFIG moves are exactly: `machineGun.{maxAmmo 16→12, rateMs 350→300, reloadMs 10000→12000, damage 4→5}`, `flak.reloadMs 4000→3500`, `instantReload.reloadMs 45000→60000`, `gun.damage 15→16`.
- `effectiveStats()` stays the only fold; no new mechanism, no new stat field, no new copy word. `EQUIPMENT_STAT_FIELDS` / `EQUIPMENT_INT_FIELDS` unchanged.
- `PROTOCOL_VERSION` 69 → 70 with a history entry (catalog content + `CONFIG.machineGun`/`CONFIG.flak` values the client reads).
- Eric rulings of this run (AskUserQuestion 2026-10-02): (1) How-to-Play `[ DECK GUNS ]` FLAK one-liner becomes exactly *"Faster reload and a larger blast radius than the Cannon; its damage climbs steeply with tier."* (2) The maxed cannon's 3 × 21 = 63 hp click (54 at tier IV) one-clicks a 45 hp small drone again — ACCEPTED CONSEQUENCE, no number moves; the guardrail test is re-pinned to the new ceiling and the deferred-work BARREL entry is restamped.
- Consequences recorded, not changed: a tier-I machine gun pops a 10 hp mine in TWO shells (5+5), every tier in two; the gun-family "max gun-only tick" rises to 63; the bodyblock collision note in `catalogMetrics.ts` (MG 4 vs flak 4) no longer collides.
- Tests that were built on the OLD cadence's tick phase (310 ms carry-over not landing on a 50 ms tick) must be REDESIGNED to still test the carry-over mechanism (e.g. with an injected non-tick-aligned rateMs or by asserting the carried due-time arithmetic), never deleted; every re-pinned literal is derived from the new tables.
- Tests that reached "2 barrels" via 4 × deckGun now reach 3; where the test's geometry assumed the twin ±6 u tracks, either build 2 barrels from 1 × deckGun (and say so) or re-lay the geometry for 3 — keep what each test proves.
- American spelling. ESLint complexity ≤ 10. `npm run check` green. Golden frames: a cannon click on a mine still pops it (15 ≥ 10); if the snapshot changes, read why before regenerating.

**Block If:**
- Any Eric number cannot be reached exactly through `effectiveStats()` without a new mechanism — HALT and report the arithmetic.
- `botGunnery.test.ts` hit-rate bars (amendment 230(h)) fail under the new magazine/cadence and the fix would need a bot-side change — HALT; bot numbers are Eric's call.

**Never:**
- No other gun, consumable, ship or drone number moves. No HUD/tooltip/in-game copy beyond the one ruled How-to-Play sentence (the stat tables are derived and update themselves). No bot tactic change. No batch sim. Do not merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MG ladder fold | `effectiveStats` with machineGun copies 0..4 | `[maxAmmo,damage,rateMs,reloadMs]` = [12,5,300,12000] [16,6,250,11400] [20,6,200,10800] [24,7,150,10200] [28,7,100,9600] | No error expected |
| Cannon ladder fold | deckGun copies 0..4 | damage 16/16/18/18/21; maxAmmo 1/1/2/2/2; barrels 1/2/2/3/3 | No error expected |
| Flak ladder fold | flak copies 0..4 | damage 12/20/28/36/44; maxAmmo 1/2/2/3/3; reloadMs 3500/3325/3150/2975/2800; contactDamage 4 | No error expected |
| Instant Reload cooldown | Repeater, no RELOAD cards / 5 RELOAD cards | reloadMs 60000 / 45000 | No error expected |
| MG rung III card face | tier card k=1 | rows RELOAD 11.4 s>10.8 s, SHELLS 16>20, RATE 0.25 s>0.20 s — no DAMAGE row | No error expected |
| Cannon rung II card face | tier card k=0 | SHELLS PER SHOT 1>2 alone (no damage step: 16 → 16) | No error expected |
| Cannon rung III card face | k=1 | GUN DAMAGE 16>18 and ROUNDS 1>2 | No error expected |
| Cannon rung IV card face | k=2 | SHELLS PER SHOT 2>3 alone (no damage step: 18 → 18) | No error expected |
| Cannon rung V card face | k=3 | GUN DAMAGE 18>21 alone | No error expected |
| Flak rung II card face | k=0 | RELOAD 3.5 s → 3.3 s (formatter), DAMAGE 12>20, ROUNDS 1>2 | No error expected |
| Flak rung III card face | k=1 | RELOAD (formatter's rounding of 3.325 → 3.15 s), DAMAGE 20>28 — no ROUNDS row | No error expected |
| Maxed cannon click | deckGun ×4, one click on a 125 hp hull, all three shells land | 3 bursts, 63 hp total; guardrail pins 63 ≥ 45 (accepted) | No error expected |
| MG stream, 3 s hold at tier I | fresh magazine 12 | shots at 0, 0.3, …, 2.7 s = 10 shells, 2 left; then empties; swap 12 s | No error expected |
| MG on a mine, tier I | two shells land on the mine's 10 u ring | hp 10 → 5 → pops on the second | No error expected |
| How-to-Play tables | render `[ DECK GUNS ]` | derived rows show the new tables, cannon gains SHELLS PER SHOT 1/2/2/3/3 | No error expected |
| Stale-client join | client PV 69 vs server 70 | join refused by the PV gate as today | No error expected |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.machineGun` :1056-1059 (16→12, 350→300, 10000→12000, 4→5); `CONFIG.flak.reloadMs` 4000→3500; comments :996-1004 (45 hp triple-mount), :1024-1050, :1079-1092 ("+2 damage", "3.2 s at V"), :1330-1331 ("three" → two)
- `shared/src/sim/catalog.ts` -- `cannonDamage` :272 (per-rung), `flakDamage` :274 (+8), `machineGunTier` :329-337 (make damage optional), ladders :435-444 / :499-503 / :509-518; comments :10-14, :255-258, :386-392, :421-434, :491-508
- `shared/src/sim/stats.ts` -- comments :41-42, :505, :684-695 (no logic change; clamp :728 stands; floor :654 stands)
- `shared/src/sim/effects.ts` -- comments :122-131, :158-161
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 69→70 :781 + history entry near :6-25
- `server/src/game/equipment/machineGun.ts` :27, :58-61; `guns.ts` :141-142, :183-186; `flak.ts` reload comments -- comments only
- `server/scripts/batchsim/balanceProbe.ts` :157-173 (barrel probe rows: 1×deckGun→2 barrels, 4×→3 barrels, price each at its build); `catalogMetrics.ts` :69-73, :196-197 (60)
- `client/src/how-to-play/copy.ts` :131 -- the ruled FLAK sentence; `client/src/ui/boonCopy.ts` comments :340-346, :356-367, :634-636
- Tests shared: `catalog.test.ts` :146-155, :324-347; `stats.test.ts` :163-170, :367-392, :405-462; `damageGuardrail.test.ts` :116-135, :264-308; `barrel.test.ts` :403 (PV 70), :870, :1122-1129
- Tests server: `machineGunStream.test.ts` (whole file re-derived on 300/250 ms, 12/16 shells, 12 s; carry-over tests redesigned), `mineHp.test.ts` :243-258 (barrels), :284-371 (two shells), `combat.test.ts` :383-557 (barrels/geometry), `gunnery.test.ts` :133-139, `upgrades.test.ts` :977-981, :1080-1111 (flak), :1674-1690, `shift.test.ts` :152-161, :229, `flak.test.ts` :74, :91 (reload 3500)
- Tests client: `cardStatRows.test.ts` :51, :70-82, :397-450, :673-694; `boonCopy.test.ts` :198-208, :255; `slotTooltip.test.ts` :167-175; `weaponTables.test.ts` :40-48; `aimPreview.test.ts` :100-106, :269-281; fit walks run as-is
- Docs: `VERSION`/`package.json`/`package-lock.json` 0.18.31; `CHANGELOG.md` 0.18.31; both trackers (one-line stamps, cycle 166); epic-8 amendments 232 (Eric's tables + rulings) and 233 (readings/review record); GDD :144/:244/:245/:250/:260 dated stamps; catalog-v3 frontmatter `superseded_in_part_6` + R14/R20/R21/R26/R27/§4 stamps; `deferred-work.md` :1458-1461 restamp; `epic-8-context.md` Ratified Amendments section append

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts`, `shared/src/sim/catalog.ts`, `shared/src/sim/stats.ts`, `shared/src/sim/effects.ts`, `shared/src/index.ts` -- the five CONFIG moves, per-rung ladders, PV 70, comments -- the single source of the new tables
- [ ] `shared/src/__tests__/*` -- re-pin catalog/stats/guardrail/barrel to the tables; guardrail pins 60 as the accepted ceiling
- [ ] `server/src/**` comments, `server/scripts/batchsim/*` probe rows, `server/src/__tests__/*` re-pins and redesigns -- keep every mechanism test meaningful under tick-aligned cadences
- [ ] `client/src/how-to-play/copy.ts` FLAK sentence; `client/src/ui/boonCopy.ts` comments; `client/src/__tests__/*` re-pins
- [ ] Docs wave -- version, CHANGELOG, trackers, amendments 232–233, GDD/catalog-v3/deferred-work stamps, epic-8-context

**Acceptance Criteria:**
- Given `effectiveStats` for each gun at copies 0..4, when read, then every value equals the I/O matrix row exactly.
- Given the MG rungs to III and V, when their cards are printed, then no DAMAGE row appears and the catalog no-empty-rung law holds.
- Given a maxed cannon click, when all shells land on one hull, then it takes 60 and the guardrail test documents this as the accepted ceiling.
- Given the How-to-Play `[ DECK GUNS ]` section, then the FLAK line is Eric's ruled sentence and the tables show the new numbers.
- Given `npm run check`, then lint (0 errors), all type-checks, all tests and the hook test are green.

## Spec Change Log

## Review Triage Log

### 2026-10-02 — Review pass (Blind Hunter + Edge Case Hunter on Opus 5.5 at Eric's instruction — low weekly Fable credits — and Codex `gpt-5.6-sol`; all three BUILD-ON-IT, zero sim or wire defects)
- intent_gap: 0
- bad_spec: 0
- patch: 12: (high 0, medium 1, low 11)
- defer: 1: (high 0, medium 1, low 0)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Both hunters: a tier-V cannon's 3 × 21 = 63 click also one-clicks the 60 hp MEDIUM drone, which amendment 232 had not shown Eric — put to Eric before the PR (AskUserQuestion): "Accepted consequence"; recorded in amendment 234, the guardrail test now pins 63 ≥ 60 and 63 < 75
  - `[low]` `[patch]` Both hunters: flak reload tiers II and IV (3325 / 2975 ms) are not whole 50 ms ticks (from-idle reload lands 3350 / 3000 ms; the card prints 3.3 / 3.1 / 3.0 s) — put to Eric: "Accept as is"; recorded as a reading in amendment 234
  - `[low]` `[patch]` Blind Hunter: 0-byte stray `client/src/__tests__/eaponTables.test.ts` committed in wave 2 — deleted
  - `[low]` `[patch]` All three: stale ladder comments naming the superseded cannon tables / flak turret rungs / "125hp Torpedo Boat" in `shared/src/index.ts` (PV-70 history), `sim/effects.ts`, `sim/catalog.ts` (×4), `damageGuardrail.test.ts` (×2), `client/src/ui/boonCopy.ts`, `server/src/game/equipment/guns.ts` — re-worded
  - `[low]` `[patch]` Blind Hunter: amendment 233(d) arithmetic "60 (3 × 21)" → 63
  - `[low]` `[patch]` Both hunters: `catalogMetrics.ts` comments claimed the 63 click is observable — made honest (see the deferred item)
  - deferred `[medium]`: both hunters CONFIRMED the batch-sim damage ledger classifies by first match on amount against base amounts only, so laddered cannon shells (18/21) file under `other:<amount>` and `multiBarrelTicks` / `maxGunOnlyTick` / `gunClickKills` only ever see the tier-II twin (32); a tier-II flak burst (20) files under `starShells`, a tier-II/III MG shell (6) under `gunBodyblock`. Pre-existing (the metric was fully dead before this cycle), harness-only, surfaced by this cycle's comments → `deferred-work.md`
- Codex alone: no defect; flagged two of the stale comments. Nothing was flagged by one model and refuted by another.

## Auto Run Result

**Summary:** the three deck guns take Eric's 2026-10-02 tables, authored per rung so every tier lands exactly on his integers: MACHINE GUN damage 5/6/6/7/7, magazine 12/16/20/24/28, delay 0.30 → 0.10 s, 12 s base reload (−5 %/tier); CANNON base 16, damage 16/16/18/18/21 (steps only at III and V), barrels 1/2/2/3/3, rounds 1/1/2/2/2; FLAK damage 12/20/28/36/44, turrets 1/2/2/3/3, 3.5 s base reload; INSTANT RELOAD 45 → 60 s. PV 69 → 70. How-to-Play flak line rewritten to Eric's ruled sentence. Consequences accepted by Eric: a maxed cannon one-clicks small and medium drones; a tier-I MG pops a mine in two shells; flak reload tiers II/IV land a quarter-tick late from idle. Version 0.18.31, cycle 166, amendments 232–234.

**Files changed:** `shared/src/constants.ts` (CONFIG moves), `sim/catalog.ts` (per-rung ladders), `sim/stats.ts` / `sim/effects.ts` (comments), `index.ts` (PV 70); server comments (`guns.ts`, `machineGun.ts`, `flak.ts`, `instantReload.ts`, `world.ts`), `scripts/batchsim/balanceProbe.ts` + `catalogMetrics.ts`; `client/src/how-to-play/copy.ts` (flak line), `ui/boonCopy.ts` (comments); tests re-pinned across all three workspaces (machineGunStream redesigned on an injected 310 ms; mineHp two-shell; combat/gunnery/aimPreview on real barrel builds; golden snapshot: four cannon-hit amounts 15 → 16); docs: VERSION/package(.lock), CHANGELOG, both trackers, amendments 232–234, epic-8-context, GDD/catalog-v3/deferred-work stamps.

**Review:** 12 patches, 1 deferred, 0 rejected. Follow-up review: not recommended (every patch is a comment, a stray file or a doc line; the two rulings changed no number).

**Verification:** `npm run check` green on the final tree — lint 0 errors (3 pre-existing warnings), tsc ×3 clean, shared 1025 / server 2413 / client 3813, hook test green. Bot gunnery bars (amendment 230(h)) all pass under the new magazine and cadence.

**Residual risks:** the batch-sim ledger's amount-based attribution (deferred); the drone shots-to-kill test now pins by ceiling rather than exact ratio (Eric may veto, amendment 233).

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green
- `npm test -w server` then `npm test -w client` -- expected: green
- `npm run check` -- expected: green, lint 0 errors
