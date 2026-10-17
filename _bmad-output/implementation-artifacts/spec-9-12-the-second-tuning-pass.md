---
title: 'Story 9.12: The Second Tuning Pass'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: '42b5067a'
final_revision: 'a980405e (PR #291 to development, 2026-10-17)'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/forge/weapon-balance-math/forged-idea.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-11-alerts-on-the-water-and-one-row.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The game is too killy for the ~50 %-per-ring attrition target; the deck guns ran 2.4 → 13.5 sustained DPS across the tiers with no reload or Armor Piercing help, the 9.8 experiment (cannon 12–18, flak 20–52) did not fix that, and pickups were not the core of killing (Eric 2026-10-14, epic-9 amendment 155; forge 2026-10-16).

**Approach:** Build EXACTLY the numbers of Eric's forge session `_bmad-output/forge/weapon-balance-math/forged-idea.md` (every weapon's own ladder reaches ×2 its Tier I output at Tier V with the derived −5 %/tier reload counted inside; deck guns are steady pressure, pickups are alpha), plus the one new sim rule the forge locked — range attenuation on the three deck guns — and the mine rulings taken at this spec step. No bot-sim run this cycle: the ledger is the paper math and the 8-of-16-dead-per-cycle check is Eric's on staging.

## Eric's rulings for this story (2026-10-16, AskUserQuestion at the dev-auto spec step — recorded as epic-9 amendment 184; the forge locks are amendment 185)

- (a) **Scope:** the forge output only. HULL / ARMOR / passive healing / HULL REPAIR / shield, storm, rings: untouched.
- (b) **Attenuation distance:** launch point → impact point (the distance the shell actually flew), against the firer's effective gun range (`rangeU` of the row) AT FIRE TIME. Kiting or closing after the shot changes nothing. (Rejected: firer's position at impact; click distance with the MG exempt.)
- (c) **Attenuation arithmetic:** the whole blow is multiplied by the attenuation factor (flak: and by the rim falloff), floored ONCE to a whole number with a floor of 1, then handed to the armor gate exactly as today. The 6 / 4 hp bodyblock `contactDamage` of cannon/flak is NOT attenuated. (Rejected: round-to-nearest; attenuating the bodyblock.)
- (d) **Odd steps:** heavy torpedo, naval mine and captive mine ladders 90 → 135 are authored +11 / +11 / +11 / +12 → 90, 101, 112, 123, 135.
- (e) **No sim this cycle:** staging is the check; the ledger is the paper math.
- (f) **Dial home:** ONE shared block `CONFIG.gunAttenuation = { fullFrac: 0.5, minFactor: 0.8 }` read by all three deck guns.
- (g) **Order:** 9.12 builds now, before 9.13 (bots keep the 9.8 stopgap bands and pick the new ladders up from the catalog).
- (h) **Models:** as `/orchestrate` says — Opus builds, Sonnet re-pins, Fable hunters + Codex `gpt-5.6-sol` at the gate.
- (i) **Mines (verbatim):** *"We will attenuate the mine landings too. We'll also use the shell's entire blast radius for damage calculation against mines (so flak goes back to being able to clear a few, and maybe cannon too to some extent since its 2 shells)."* Then, confirmed: **the cursor clause (amendment 202, "I have to click on the mine") RETIRES** — every mine whose 10 u marker touches the blast (centre within `burstRadius + hitRadiusU` of the burst point) takes the shell's attenuated damage; the machine gun (no blast) keeps "within 10 u of where the shell arrived". Supersedes amendment 200's "a burst that merely covers a mine does nothing" and 202's cursor test.

## The numbers (forge locks, amendment 185 — built literally)

| Row | Today | Built |
|---|---|---|
| Cannon `CONFIG.gun.damage` | 12; rungs +3 at III and V (12/12/15/15/18); barrels 1 +1 at II and IV; turret at III | **8**; rungs **+2 / +1 / +1 / +1** (8/10/11/12/13); **barrels FIXED 2** (`CONFIG.gun.barrels`, no barrel rungs); turret (`maxAmmo +1`) at III kept; range steps kept; reload 5.0 → 4.0 s derived |
| Machine gun | mag 12 +4/rung, rate 300 −50/rung, dmg 5 +1 at II and IV, reload 12 000 | mag **12/15/18/20/23** (+3/+3/+2/+3), rate **300/275/250/225/200** (−25/rung), dmg **5 flat** (no damage rungs), `reloadMs` **12 500** (→ 10.0 s at V derived) |
| Flak | dmg 20 +8/rung; turrets +1 at II and IV (1,2,2,3,3); `edgeFalloff: 10` (D − 10 at the rim) | dmg **16 +2/rung** (16/18/20/22/24); turret +1 at **II only** (1,2,2,2,2); **`rimFactor: 0.5`** — the rim deals HALF the centre damage, proportional by the nearest outline point (replaces `edgeFalloff`); blast 50 u fixed; reload 3.5 → 2.8 s derived |
| Attenuation (NEW) | — | `CONFIG.gunAttenuation = { fullFrac: 0.5, minFactor: 0.8 }`: factor 1 while flown ≤ 50 % of the firer's `rangeU` at fire time, linear to 0.8 at 100 %, clamped at 0.8 beyond (a lit-zone-lifted shot) |
| Light torpedo | dmg 40 +5; tubes +0.5/rung (1,1,2,2,3) | dmg **80 +10** (→ 120); tubes +0.5 on the rungs to **II and III only** (1,1,2,2,2); speed +2.5 and homing +0.125 steps unchanged; reload unchanged |
| Heavy torpedo (`CONFIG.torpedo`) | dmg 50 +5; tubes 1,1,2,2,3 | dmg **90 +11/+11/+11/+12** (→ 135); tubes 1,1,2,2,2; speed/homing/reload unchanged |
| Naval mines (`CONFIG.mine`) | dmg 55 +5; held 2 +1 | dmg **90 +11/+11/+11/+12**; held 2 → 6 unchanged; blast ×1.1 unchanged |
| Captive mines | dmg 55 +5; held +0.5/rung (1,1,2,2,3) | dmg **90 +11/+11/+11/+12**; held +0.5 on the rungs to **II and III only** (1,1,2,2,2); homing step unchanged |
| Supercav torpedo | 85 | **150** |
| Broadside, star shells, phosphor, fouling shell/mine, bodyblock 6 / 4, every range, every reload base but the MG's | unchanged | unchanged |

Paper outcomes (the ledger): cannon DPS 3.2 → 6.5, MG 3.73 → 7.88, flak 4.57 → 8.57 (two barrels / one magazine / two turrets), all ×2 ± 6 %; max torpedo salvo 240 (360 with Armor Piercing V); naval-mine pool 6 × 135.

## Boundaries & Constraints

**Always:**
- Every number above is Eric's and is authored LITERALLY (integer steps in the catalog; `CONFIG` literals); nothing is derived from a sim, nothing is rounded in the sim (amendment 120(a)).
- `effectiveStats()` stays the one fold; the new `barrels` base is a `CONFIG.gun` dial read by `gunRow`; PvE fleet hulls (`cls.gun` present) keep ONE barrel of 1 hp — their "shots to kill" rule (epic-7 amendment 24) is untouched; the 1..3 barrels clamp stays as a guard.
- Range attenuation is ONE pure shared function (`shared/src/sim/attenuation.ts`, no transcendentals) called ONLY from the server's two blow sites: `burstHitAmount` (cannon + flak bursts, hull and decoy victims) and the contact path for a `direct` shell (the MG's hit, whose `contactDamage` IS its damage). A non-direct interception (the 6 / 4 bodyblock) and every non-deck-gun blow (broadside, star/phosphor shells, torpedoes, mines, ram, burn) are untouched. Flow at a blow site: `raw = damage × rim(flak only) × attenuation` → `settleBlow(raw)` = 0 if raw ≤ 0 else `max(1, floor(raw + 1e-9))` → the existing `hitShip`/`armorDamage` gate (which floors again and keeps its floor of one — a no-op on a whole number).
- The shell carries its launch origin (`originX`, `originY`) and the attenuation reference (`attenRangeU` = the row's `rangeU` at fire time; 0 = no attenuation) on `ShellState`; both are SERVER-PRIVATE — the projectile wire row's field pick is unchanged and the perception invariant/golden tests prove it. Flight distance = `hypot(impact − origin)`; the reference is `rangeU`, NEVER the lit-zone-lifted reach.
- Mines: `landOnMines` tests `dist(mine, at) ≤ shell.burstRadius + CONFIG.mine.hitRadiusU` (MG: burst 0 → today's 10 u), no cursor term; the amount is the ATTENUATED whole-number blow (`settleBlow(damage × attenuation)` — no rim term, mines are not burst victims); own mines included (the standing friendly-fire exception); naval-only chain and "captive destroyed = no fish" unchanged; a shell spent on a hull never lands.
- Harness: `gunAttenuation.` is a `--tune` family with both leaves on [0, 1] (the fog-coverage / dropout-probability pattern) and `fullFrac < 1` enforced on the final values; `flak.rimFactor` on [0, 1]; `flak.edgeFalloff` is refused as retired, naming `flak.rimFactor`; `--tune gun.barrels` floor 1.
- `PROTOCOL_VERSION` 88 → 89 ONCE (catalog content + every changed `CONFIG` block is read by the client through the fold and the cards); `VERSION` / `package.json` / `package-lock.json` 0.18.61; cycle 196; both trackers one-line stamps; `CHANGELOG.md`; `docs/codebase-map.md`; amendments 184–186 in `epic-9-context-amendments.md` AND the `## Ratified Amendments` tail of `epic-9-context.md`; the paper ledger `batch-sim-evidence-2026-10-16.md` (header: no sim run this cycle, Eric 2026-10-16) beside the earlier ledgers; `goldenFrames` re-recorded ONCE with every moved channel listed in this spec's change log.
- Tests re-pin by DERIVATION (read CONFIG / the catalog through the fold), never a pasted literal, and name the contract they guard; the cannon-click ceiling, the drone shots-to-kill rule, the mine two-shot MG reading and the PV pins are re-based knowingly. New tests: the attenuation curve on synthetic inputs (≤ fullFrac → 1; at range → minFactor; beyond → clamped; rangeU 0/NaN → 1; fullFrac ≥ 1 → a step); `settleBlow`; a server blow test per gun (near full, far attenuated, floor of one on a 1 hp drone shell); flak rim-half × attenuation; mine landing by blast radius (flak clears two mines 40 u apart; cannon two shells on one mine → 16 at Tier I; MG at 10 u only; no cursor term; attenuated at max range).
- American spelling. No in-game copy added (How-to-Play `copy.ts` stays frozen until 9.17 even where a sentence goes stale; the derived tables derive). Card and tooltip rows derive from the catalog: the CANNON card loses its BARRELS row, the MG card its DAMAGE row, flak IV its TURRET row — fit tests re-pin.

**Block If:**
- A field of `ShellState` added here would reach the wire (a materializer that spreads the record) — HALT `blocked`.
- The catalog validator cannot express a rung with no damage effect where one is needed (it refuses `add: 0`; a rung must carry at least one effect — every rung here carries a range step, so this cannot trigger; if it does, HALT).
- `npm run check` cannot be made green without pinning a literal that this spec says must derive.

**Never:**
- Propose a gun number from bot-sim evidence; launch any sim; touch hull hp, Armor, heals, storm, rings, bots' posture; add a seventh perception exception; change `contactDamage` 6 / 4, any range, the broadside, star/phosphor/fouling lines; re-propose the cursor clause or the flat D − 10 rim; keep `edgeFalloff` alive under a new name; commit before `npm run check` is green; merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Attenuation inside half range | flown 400 u, rangeU 1000 | factor 1 | n/a |
| At 75 % of range | flown 750, rangeU 1000, {0.5, 0.8} | factor 0.9 (linear) | n/a |
| At / beyond range (lit-zone lift) | flown 1000 / 1300, rangeU 1000 | 0.8 / 0.8 (clamped) | n/a |
| Degenerate reference | rangeU 0 / NaN / attenRangeU 0 | factor 1 (no attenuation) | fail-open to today's blow, never a NaN |
| Bad dials | fullFrac ≥ 1 | step at range: 1 below, minFactor at/after | harness refuses; the function still answers |
| Cannon Tier I far shot | 8 × 0.8 = 6.4 | blow 6 (one floor) | n/a |
| Cannon Tier V at 50 % | 13 × 1 | 13 | n/a |
| Flak rim at max range | 16 × 0.5 × 0.8 = 6.4 | 6 | n/a |
| Flak centre inside half range | 24 × 1 × 1 | 24 | n/a |
| Drone 1 hp shell at max range | 1 × 0.8 | 1 (floor of one) | n/a |
| MG hit at 90 % of range | 5 × 0.84 = 4.2 | 4 | n/a |
| Bodyblock | cannon interceptor outside the blast, any distance | 6 (unattenuated); flak 4 | n/a |
| Mine under a flak burst | mine centre 55 u from the burst point (≤ 50 + 10) | takes `settleBlow(D × atten)`; a second mine 40 u away takes it too | consume-first re-check as today |
| Mine just outside | 61 u from the burst | untouched | n/a |
| Cannon click on a mine, Tier I, short range | two shells 12 u apart, mine on the click | both bursts within 25 u → 8 + 8 = 16 ≥ 10 → pops | n/a |
| MG on a mine | arrival within 10 u; cursor irrelevant | 5 (or 4 attenuated) | n/a |
| Tube pool at V | light/heavy torpedo, captive: 2 copies +0.5 then nothing | `maxAmmo` 1, 1, 2, 2, 2 after `floorIntegerFields` | n/a |
| Naval pool at V | +1 per rung | 6 | n/a |
| Fleet drone gun | `cls.gun` present | barrels 1, damage 1 (unchanged) | n/a |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `gun` {damage 8, NEW `barrels: 2`}; `machineGun` {reloadMs 12500}; `flak` {damage 16, `edgeFalloff` → `rimFactor: 0.5`}; NEW `gunAttenuation` {fullFrac 0.5, minFactor 0.8} with Eric's forge words; `torpedo.damage` 90; `lightTorpedo.damage` 80; `mine.damage` 90 + the `hp` doc (blast-radius landing, attenuated); `captiveMines.damage` 90; `supercavTorpedo.damage` 150; doc blocks re-cut (the 2026-10-13 experiment superseded)
- `shared/src/sim/attenuation.ts` (NEW) -- `rangeAttenuation(flownU, rangeU, cfg)`, `flakRimFactor(nearestU, burstRadius, rimFactor)`, `settleBlow(raw)`; pure, no transcendentals; exported from `shared/src/index.ts`
- `shared/src/sim/catalog.ts` -- `deckGun` rungs (damage +2/+1/+1/+1, turret at III, range; no barrel rungs); `machineGunTier(magStep)` (+3/+3/+2/+3 mag, −25 rate, range; no damage); `flak` rungs (+2 dmg; turret at II only); `lightTorpedo`/`heavyTorpedo`/`captiveMines` via `tieredWeaponSteps` (damage steps, tubes +0.5 on II/III only, speed/homing every rung); `navalMines` damage steps 11/11/11/12 via `tieredWeaponSteps`; `flakDamage(2)`; comments
- `shared/src/sim/stats.ts` -- `gunRow` barrels = `cls.gun ? 1 : CONFIG.gun.barrels`; the barrels-clamp comment
- `shared/src/sim/shell.ts` -- `ShellState` + `originX`, `originY`, `attenRangeU` (doc: server-private)
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 89 + note; export the new module
- `server/src/game/equipment/ballistics.ts` -- `BallisticParams.attenRangeU?`; `makeBallistic` stamps origin + `attenRangeU ?? 0`
- `server/src/game/equipment/guns.ts`, `machineGun.ts`, `flak.ts` -- pass `attenRangeU: row.rangeU`; `flakBurstDamage` deleted (the shared helper replaces it)
- `server/src/game/world.ts` -- `burstHitAmount` (rim × attenuation × settle), the `direct` contact blow, `landOnMines` (blast-radius reach, attenuated amount, no cursor), `onMine` doc
- `server/scripts/batchsim/overrides.ts` (+ `args.ts` help) -- `gunAttenuation.` family, [0,1] floors, `fullFrac < 1` cross-check, `flak.rimFactor` [0,1], `flak.edgeFalloff` retired-key refusal; `balanceProbe.ts` columns if they print barrels/turrets per tier
- Tests (survey of 2026-10-16; N = re-derive the number, R = keep the rule, rewrite how it is reached):
  - PV 88 → 89 pins: `shared/src/__tests__/barrel.test.ts:469`, `radarRaster.test.ts:187`; `server/src/__tests__/colyseus018.test.ts:169-170,247,248+ (88 joins the refused list),297 (future case 89 → 90),303`, `denials.test.ts:275`; `client/src/__tests__/ordnanceMasksAreServerOnly.test.ts:77,149`.
  - shared `stats.test.ts`: :101 gun row barrels (N, reads `CONFIG.gun.barrels`); :176-187 MG/flak rows (N); :556/:571 cannon tables (N); :600-642 MG tables incl. the 100 ms → 200 ms literal and 9600 → 10000 reload (N); :731 torpedo, :868 naval, :889 captive (N); :939 "pool floor 1,1,2,2,3" → cap 2 (R); :1034 halfBarrel from base 2 (R). `catalog.test.ts` :188/:373 rung authoring (N); :234 UNIFORM list loses light/heavy/naval/captive (R). `damageGuardrail.test.ts` :116-131 MG cap/flak cap (N); :219 tops; :244 cannon cap; :259 per-shell law 3×18=54 → 2×13=26 (N); :390 mine 55 (N); :540-600 PvE farm `ceil(hp / damage)` → account for barrels (R); :513 supercav < 250 holds. `barrel.test.ts` :852/:901/:919/:935 damage literals, :1235 MG block, :1240 flak block (`rimFactor`) (N). `shell.test.ts` hand-built ShellState literals compile because the new fields are OPTIONAL.
  - server `flak.test.ts` :71-73 helper, :298-376 falloff describe → proportional rim × attenuation (R), :348 "rimFactor 1 = no blow at the rim" (the `amount <= 0` guard stays reachable only by --tune); `combat.test.ts` :494-553 barrel-count cases → "barrels fixed at 2; the 1..3 clamp still guards" (R), :106-390 single-shell tier-I cases now see two shells ±6 u (count re-pins); `gunnery.test.ts` :97/:133/:181; `upgrades.test.ts` :986 MG damage rung gone, :1089-1126 flak IV pool 2, :1684-1710 shells 2/2 (N); `machineGunStream.test.ts` :126 (275 ms → 11 shells in 3 s), :328-371 12.5 s, :423-447 tier II 15/5/0.275/11.875 (N); `mineHp.test.ts` :337/:341 (MG 5 flat), :115-151 cannon-on-mine geometry (two shells, blast reach) (R); other fixtures bitten by two shells per click: `intentQueue, sinkingWindow, denials, boarding, doctrines, shift, perception, frames, reconnect, match` (verify, count re-pins only); `goldenFrames.test.ts.snap` re-recorded ONCE — injected shells (`injectShell`, `CONFIG.gun.damage`, no `attenRangeU`) move 12 → 8; real cannon fire doubles the shells in scnBurst/scnMineBurstDetonation/scnDenied/scnGunnery (900 u aim = attenuated); scnMineBlast 55 → 90; every moved channel listed in the change log.
  - batchsim `tuneFloor.test.ts:66` edgeFalloff → rimFactor (R); `catalogMetrics.ts:157 classifyShell` files a fish as captive when `damage === CONFIG.mine.damage` — with heavy = captive = 90 at every tier this is broken: classify by an explicit tag (the captive fish is launched by a mine; carry/ read its kind), never by damage (patch in W2 + test); `balanceProbe.ts:158-186` barrel block ([[1,0],[2,1],[3,4]]) → fixed 2; stale 54/12/3-barrel comments in `catalogMetrics.ts:82-88,218-224`.
  - client `cardStatRows.test.ts` :139 (`['SHELLS PER SHOT','RANGE']` → `['GUN DAMAGE','RANGE']`), :159-252, :382-466, :530-590, :720 (supercav), :791, :815-847 (N); `slotTooltip.test.ts:171`, `boonCopy.test.ts:222` RELOAD 12.0 → 12.5 s (N); `aimPreview.test.ts` :283 (four cards reach 3 → fixed 2), :214-230 single-circle assumptions under base 2 (R).
  - NEW: `shared/src/__tests__/attenuation.test.ts`; `server/src/__tests__/rangeAttenuation.test.ts` (one blow test per gun + the bodyblock + the 1 hp drone floor); `server/src/__tests__/mineBlastLanding.test.ts` (flak clears two mines 40 u apart; cannon's two bursts on one mine → 16; MG 10 u only; no cursor term; attenuated at max range); a `classifyShell` test.
- Stale comments to re-cut in the same wave: `constants.ts:230` ("3 captain gun hits (16 dmg)"), the MG/flak/torpedo/mine/captive doc blocks, `catalog.ts` headers, `effects.ts:170-173`, `stats.ts:44-47` (the barrels clamp story), `world.ts` `landOnMines` / `onMine` docs, `aim.ts` if it names the cursor rule.

## Implementer readings of record (orchestrator rulings under Eric's answers; each is his to veto on staging)

- (r1) **Distance is measured from the shell's muzzle origin** (`makeBallistic`'s `origin`, the hull-clear launch point) to the burst point / the swept-collision stop point — Eric's words were "launch point"; the few units of muzzle offset are inside the 1e-9 epsilon's spirit, never a rule.
- (r2) **The new `ShellState` fields are optional** (`originX?`, `originY?`, `attenRangeU?`): absent → factor 1 (injected test shells, broadside/star/phosphor/fouling shells, torpedoes). The gate keys on the FIELD, never on `family` (`family: 'cannon'` is shared by four non-deck-gun lines).
- (r3) **`settleBlow(0)` is 0 and "a 0-hp blow is no blow" stands** — reachable only under `--tune flak.rimFactor=1` at the exact rim; the floor of one applies to a positive raw blow.
- (r4) **The derived `SHELLS PER SHOT 2` row stays wherever a derived surface already prints the row's barrels** (slot tooltip, How-to-Play CANNON table); the refit CARD loses the row because no rung authors it. No copy added, nothing hidden.
- (r5) **Two shells per click from Tier I doubles the Hit Calls a bot's `HITS_FOR_CRIPPLED` counter sees per click** (`ai/utility.ts:179`) — accepted this cycle, Story 9.13's material (recorded in the PR and deferred-work).
- (r6) **Decoys take the rim × attenuation blow exactly as the hull they imitate.**
- (r7) **The retired `flak.edgeFalloff` harness key is refused by name** pointing at `flak.rimFactor` (the `zone.ringSteps` precedent).
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `docs/codebase-map.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml, epic-9-context-amendments.md (184–186), epic-9-context.md (tail), batch-sim-evidence-2026-10-16.md (NEW, paper ledger), deferred-work.md (if any)}`

## Tasks & Acceptance

**Execution (orchestrated per `/orchestrate`: Opus implements, Sonnet re-pins mechanical tests and records, Fable + Codex review the gate):**
- [x] W1 (Opus) `shared/` -- constants, attenuation module, catalog, stats, shell.ts fields, index.ts PV 89 + export; shared tests re-pinned by derivation + NEW `attenuation.test.ts`; `npm test -w shared` green, `npm run build -w shared` -- amendments 184–185
- [x] W2 (Opus, after W1) `server/` -- ballistics/guns/mg/flak/world, harness dials; server tests re-pinned, NEW blow + mine-landing tests, golden re-recorded once with the moved channels listed; `npm test -w server` green -- rulings (b) (c) (i)
- [x] W3 (Sonnet, after W1, parallel with W2 — disjoint files) `client/` PV pins + card/tooltip/fit re-pins; records: VERSION/package(-lock) 0.18.61, CHANGELOG, codebase-map, amendments 184–186 both homes, both trackers, the paper ledger -- ruling (e)
- [x] Gate: `npm run check` green; Fable Blind Hunter + Edge Case Hunter and Codex (`-m gpt-5.6-sol`) on the diff; CONFIRMED findings patched; commit, push, ONE PR to `development`

**Acceptance Criteria:**
- Given the catalog at Tier I–V, when `effectiveStats()` folds each gun ladder, then cannon damage/barrels/pool read 8/10/11/12/13 · 2 · 1,1,2,2,2; MG magazine/rate/damage read 12/15/18/20/23 · 300…200 · 5 · reload 12.5 → 10.0 s; flak damage/pool read 16…24 · 1,2,2,2,2; light/heavy torpedo and captive tubes read 1,1,2,2,2; torpedo damages 80…120 / 90…135; mines 90…135 with naval held 2…6; supercav 150.
- Given a deck-gun shell, when it bursts or strikes after flying `f` of the firer's `rangeU` at fire time, then the blow is `settleBlow(D × rim × atten(f))` per the matrix and the bodyblock is unchanged; nothing about origin or reference reaches a frame (perception invariants and golden pins hold).
- Given mines inside a burst's `burstRadius + 10 u`, when the shell lands, then each takes the attenuated blow with no cursor test; the MG keeps 10 u; two Tier I cannon shells on one mine pop it.
- Given `--tune gunAttenuation.fullFrac=1.2` or `flak.edgeFalloff=5`, when the harness parses, then it refuses with the dial named.
- `PROTOCOL_VERSION` 89; `npm run check` green; both trackers stamped; no in-game copy added; the forge file is the ledger's source and `batch-sim-evidence-2026-10-16.md` says no sim ran.

## Spec Change Log

- 2026-10-16 (build, waves 1–3): golden frames re-recorded ONCE for the waves — injected shells (`injectShell`, `CONFIG.gun.damage`, no `attenRangeU`) 12 → 8 and victim hp 88 → 92 in scnCombat / scnStraddleBoom / scnSpectatorBallistic; real cannon fire is two shells ±6 u in scnBurst (burst one tick later, burst+hc / burst+dmg twice, 8 + 8, hp 84; +2 frames, later indices shift), scnMineBurstDetonation (two reveals, burst/sp twice, then the mine boom), scnDenied (two reveals), scnGunnery (two reveals for shooter and o1, miss frame burst/sp twice, the shot-2 hit frame t8250 → t8300 with burst/hc twice, torp shell ids s2 → s3); scnMineBlast dmg 55 → 90, hp 195 → 160; no projectile row gained a key; six exceptions. KEEP: the `scnDenied` capture must run until both twin shells resolve (see the gate entry).
- 2026-10-17 (review gate, iteration 0): the "Always" clause inside the contract says attenuation is called from the server's "two blow sites"; the built code has THREE callers — `burstHitAmount`, the `direct` interception blow and `landOnMines` (ruling (i)) — the contract is read-only, so this entry and the codebase map carry the correction. Golden re-recorded a SECOND time at the gate for scnDenied only (+1 frame, the `denied-gun-shells-terminate` subcase) — Codex CONFIRMED the scenario had ended a tick before the twin shells resolved. KEEP: a settled 0 is no blow at BOTH blow sites; `--tune gun.barrels` integer [1, 3]; `fullFrac` refused ≥ 1 at the parse leaf; non-finite `fullFrac` fails open to 1.

## Review Triage Log

### 2026-10-17 — Review pass (Blind Hunter BUILD-ON-IT, Edge Case Hunter BUILD-ON-IT, Codex gpt-5.6-sol FIX-FIRST)
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 0, medium 3, low 8)
- defer: 2: (high 0, medium 0, low 2)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - `[medium]` `[patch]` `resolveInterception` checked `contactDamage <= 0` BEFORE attenuation, so a settled-0 direct blow reached `hitShip` (aggro + a 0 `dmg`) under `--tune gunAttenuation.minFactor=0` — guard moved after `settleBlow`, regression tests for hull and decoy (Blind Hunter CONFIRMED)
  - `[medium]` `[patch]` `--tune gun.barrels` had a floor but no ceiling or integer check while the fold clamps to 3 — refused outside the integers [1, 3] (both hunters CONFIRMED)
  - `[medium]` `[patch]` golden `scnDenied` ended a tick before the twin shells resolved, losing its burst + hc terminal frame — capture extended one tick, snapshot re-recorded, new subcase (Codex CONFIRMED; W2 had reported the lost frame)
  - `[low]` `[patch]` non-finite `gunAttenuation.fullFrac` read as 0 and attenuated from the muzzle — fails open to 1 (Edge Case Hunter CONFIRMED)
  - `[low]` `[patch]` `fullFrac ≥ 1` refused only at apply time — now also at the parse leaf ([0, 1))
  - `[low]` `[patch]` `flak.test` "0-hp is no blow" moved to a 0-damage arm that never reached the guard — retitled, plus a positive-damage `minFactor 0` case that fails without the guard (Blind Hunter + Codex)
  - `[low]` `[patch]` amendment 186 promised by both trackers did not exist — written (readings r1–r12) in both homes
  - `[low]` `[patch]` reading r5 (doubled Hit Calls per click) missing from deferred-work — entered for 9.13; the pre-existing batchsim tsconfig error entered for 9.16
  - `[low]` `[patch]` stale comments: `boonCopy.ts` barrel-alone paragraph, `catalogMetrics.ts` 20 / 6 / 15–18 numbers and the two new ledger collisions (6 → gunBodyblock, 4 → flakBodyblock) documented
  - `[low]` `[patch]` literal re-pins: flak tier-IV pool derived as `CONFIG.flak.maxAmmo + 1`; the MG reload line became a tautology and was deleted; `weapons.test` drone measured at a reachable hp (one-shot pinned)
  - `[low]` `[patch]` codebase map and this log: "two blow sites" → three
- deferred: the doubled Hit Calls per click for bots (9.13); the pre-existing `server/scripts/batchsim/tsconfig.json` error (9.16)
- rejected: `combat.test` single-barrel injection for shell-geometry cases (the production twin is pinned in `twinMount`; the geometry pins are about the shell, not the mount); `botGunnery` one-sentence note (applied as P10, otherwise moot after the guard fix); the flak rim-at-exactly-R float note (harness-only, documented in r3)

## Design Notes

- **Why the origin rides the shell and not the firer's pose:** ruling (b) — the distance FLOWN. `distLeft` already counts down from the launch range, so `flown = launchRange − distLeft` would work for bursts but not for a direct hit stopped by the swept collision mid-step; the origin point is exact for both and costs two numbers.
- **Why `settleBlow` sits in shared and the gate still floors:** one floor is the ruling; the gate's `max(1, floor(x × K/(K+E)))` on a whole input is byte-identical to today, so the firewall is untouched and the flak epsilon lives in one place.
- **Mine reach formula:** `burstRadius + hitRadiusU` is "the marker disc touches the blast" — the hull's outline-in-blast rule applied to a 10 u disc; the MG's 0 u blast reduces it to amendment 201's "on the mine".
- **Reload at V for the MG:** 12 500 × 0.80 = 10 000 exactly (`reloadTierScale`), the forge's 10.0 s.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean (W1 before W2/W3)
- `npm test -w shared` / `-w server` / `-w client` -- expected: green per wave
- `npm run lint` -- expected: zero errors (complexity ≤ 10)
- `npm run check` -- expected: green before the PR

**Manual checks:**
- Eric judges 8-of-16-dead-per-cycle on staging after the PR deploys (ruling (e)).

## Auto Run Result

Status: done
Cycle 196, 0.18.61, PV 88 → 89. Built: every forge number literally (cannon 8–13 two barrels fixed, MG 12–23 magazine / 0.30–0.20 s / 5 flat / 12.5 s, flak 16–24 half-rim two turrets, torpedoes 80→120 and 90→135, mines 90→135, supercav 150, pools capped at two), the new shared range attenuation (`sim/attenuation.ts`, `CONFIG.gunAttenuation`), the three server blow sites (bursts, the MG direct hit, the blast-radius mine landing with the cursor clause retired), harness dials and refusals, 58 test files re-pinned by derivation, three new test files, golden re-recorded twice. Review gate: Blind Hunter BUILD-ON-IT, Edge Case Hunter BUILD-ON-IT, Codex gpt-5.6-sol FIX-FIRST on one test-contract point; 11 patches applied (3 medium, 8 low), 2 deferred, 3 rejected (triage log above). `npm run check` green: shared 1155 / server 2664 / client 4131 / hooks 266. Records: amendments 184–186 in both homes, both trackers, CHANGELOG 0.18.61, codebase map, deferred-work, the paper ledger `batch-sim-evidence-2026-10-16.md` (no sim run). Residual risks: the game feel of the attenuation band and the two-shell click are Eric's staging judgments; bots see two Hit Calls per click (9.13). Branch worktree-worktree-tuning-pass-9-12; ONE PR to development, not merged.
