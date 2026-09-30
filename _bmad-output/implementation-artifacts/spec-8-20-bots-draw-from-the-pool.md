---
title: 'Story 8.20: Bots Draw from the Pool'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
baseline_revision: '2c57a99'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** Bots already sit through `addShip(hull, gun)` and draw from the common pool, but they CHOOSE cards from six per-hull wish lists written in pre-pool card names (`CONFIG.bots.boonWeights`, translated on the fly in `ai/spending.ts`). Every consumable scores lowest, three personalities rank ladders above weapons, newer lines have no opinion, and a personality is locked to a hull — while Eric's ruling is that a hull is only stats plus a special and any hull can build anything.

**Approach:** Replace the wish lists with ONE build-aware points scorer (what I carry, what I lack, my hp) flavored by a per-personality build TASTE; unlock personalities from hulls; apply two firing-rule changes (boost into fights, smoke once per retreat); split the tactic tables into total, compile-checked registries; add pool-era harness readouts (measure only); run ONE ≤99-match batch and file the evidence. No wire change, no `PROTOCOL_VERSION` bump.

## Boundaries & Constraints

**Always:**
- **Eric's rulings of 2026-09-30 (this run, AskUserQuestion + chat; recorded as epic-8 amendments in the docs wave, numbered after Story 8.19's block):**
  - (R1) Scope = card choosing, firing-rule review, harness readouts, tidy-up. Hull identity is dead: a bot picks from its current build, its hp and what it lacks.
  - (R2) Bot guns stay RANDOM (amendment 109's interim is final); no `BOT_GUNS` table.
  - (R3) THE POINTS TABLE (`CONFIG.bots.cardPoints`), highest wins, ties by a seeded coin flip: any upgrade or consumable `base 2`; `+1` if it is one of the personality's favorites; upgrade matching its style `+1`; a consumable it carries none of: belt hunger `low −1 / medium 0 / high +1`; a consumable it already carries `−1`; HULL REPAIR while hurt and carrying none `+2` (belt hunger NOT applied in that case, so it is never below 4); a weapon for an empty Q/E/R slot `3.5`, a FAVORITE weapon `3.75` (favorite decides among weapons only; a two-bonus upgrade or a needed heal beats any weapon).
  - (R4) Upgrades and consumables stand on equal footing; an empty belt alone never beats a strong upgrade.
  - (R5) THE SIX TASTES (approved verbatim) — style / favorite upgrades / favorite consumables / belt hunger / favorite weapons: `raider` specialist / SPEED, its weapons / SMOKE SCREEN, CHAFF / medium / heavy + light torpedo · `duelist` specialist / its gun, TURNING, RELOAD / SHIELD BLOCK, FLASH SHELLS / low / heavy + light torpedo · `bulwark` rounded / ARMOR / HULL REPAIR, SHIELD BLOCK / high / broadside, star shells · `siege` specialist / its weapons, RADAR SWEEP / FLASH SHELLS, SUPERCAV TORPEDO / low / star shells, phosphor shells, broadside · `forager` rounded / its gun, RELOAD / HULL REPAIR, DECOY BUOY / medium / naval, captive, fouling mines · `trapper` rounded / its weapons, SPEED / SMOKE SCREEN, DECOY BUOY, CHAFF / high / naval, captive, fouling mines.
  - (R6) ANY PERSONALITY ON ANY HULL, dealt off the seeded enrollment stream. Fighting-style numbers (band, target weights, disengage/heal fractions, appetite values) are UNCHANGED.
  - (R7) BOOST is also pressed when attacking a target farther than the band's far edge; it still fires when fleeing.
  - (R8) SMOKE SCREEN is pressed ONCE per retreat — not again until the bot has left `disengage` and re-entered it.
  - (R9) Every other firing rule stands as shipped (the interim rows become the rows).
  - (R11, 2026-09-30, AskUserQuestion, recommended option) THE STYLE BONUS NEEDS AN UNEVEN BUILD: when every line in the upgradeable set U holds the same count (the flat level-zero build), no upgrade earns the style bonus — a favorite ladder scores 3 and a weapon (3.5) takes the opening pick. Rejected: leave the flat build as is (a favorite ladder at 4 opening over a weapon).
  - (R12, 2026-09-30, review gate, AskUserQuestion — SUPERSEDES R8's once-per-retreat bookkeeping) **A bot never pops a smoke while one of its own is still running — "it's bad play."** The smoke row wants iff afloat ∧ posture `disengage` ∧ no own puff can still be alive: `now ≥ smokeUntil + CONFIG.smokeScreen.lifeMs` (the last puff drops no later than the lay window's end and lives `lifeMs`). No `disengageSince` stamp, no posture-edge state; a retreat that outlives the smoke may press again once it is gone. Asked because both review hunters found the posture-flicker re-arm (storm-edge dodge, heal pop-up) under R8. Rejected: "storm dodge doesn't end a retreat" and a cool-off timer.
  - (R13, 2026-09-30, review gate, AskUserQuestion) BOOST-IN IS FOR REAL FIGHTS ONLY: the `pursue` / `engage` postures against a target beyond the band's far edge; the `farm` posture (PvE fleet hunting) never triggers it. Rejected: boosting toward any target including fleet groups.
  - (R10) Harness readouts are MEASUREMENTS — no new pass/fail threshold. ONE batch run after the changes, ≤ 99 matches; the blind-vacuum control is NOT re-run this cycle (stated in the evidence).
- **Scorer definitions (orchestrator readings of record; Eric may veto):** "its weapons" = a tier copy (2..cap) of an `equipment` line already held; "its gun" = any gun-ladder line (`deckGun`, `deckGunTurret`, `deckGunBarrel`, `machineGun`, `flak` — the draw only ever offers the mounted gun's); a ship ladder is named by its line id. STYLE reads the bot's upgradeable set `U` = the five ship ladders + the mounted gun's ladder lines + held equipment lines, each below cap, by copies held: `rounded` bonus iff the card's line holds `min(U)`, `specialist` bonus iff it holds `max(U)`. HURT = `(hp + repairHp) / maxHp < profile.healHpFrac` — the heal tactic's own read. Refused cards (`pickRefusal`) are never scored; an all-refused hand returns null (level stays banked). Spelling is American (`favorite`).
- **Tie-break:** among max-scoring indices pick uniformly off `mind.spendRng`, drawing ONLY when more than one index ties; with no rng supplied (hand-built tests) the lowest index wins. No other stream moves.
- **Hull unlock:** `CONFIG.bots.profiles` becomes the flat list of six ids; `BotProfile.hullId` is deleted from the six in-game rows; enrollment does ONE `rng.pick` over the flat list (same stream position as today). The three test-only rows stay hull-bound through a test-only hull map (the harness's `--bot-profile random*` contract is unchanged); an explicit in-game profile override never decides the hull.
- **Registries:** `ai/consumables.ts` exports `CONSUMABLE_TACTICS: Record<ConsumableId, ConsumableTactic>` (TOTAL; `depthCharge` is a never-fires row) and its appetite table; `ai/shift.ts` exports `SHIFT_TACTICS: Record<ShipClassId, EquipmentTactic>` (boost / instantReload / damageCut); `EQUIPMENT_TACTICS: Record<EquipmentId, EquipmentTactic>` is TOTAL; all deep-frozen; imports flow ONE way (shared helpers ← rows ← registry ← `tactics.ts`), no cycle. `APPETITE_FAMILY` is deleted by writing the same values explicitly per line in `profiles.ts` (behavior-identical; test rows carry `machineGun`/`flak` 2.0).
- `ai/` never imports `world.js`; `want()` draws no rng and writes nothing; ESLint complexity ≤ 10; every new number lives in `CONFIG.bots`.
- **Docs wave:** `VERSION` + root `package.json` + lock → `0.18.20` (cycle 155, assuming 8.19 lands first as 0.18.19/154 — re-check at the docs wave); `CHANGELOG.md`; ONE-LINE stamps in both trackers; amendments in both homes; `deferred-work.md` entries this story resolves marked RESOLVED and the ones it leaves open restated; `batch-sim-evidence-2026-09-30.md`.

**Block If:** any need for a number, personality, favorite or firing rule not listed above; any change that would alter what reaches a client; a harness readout that needs a new hook inside `World`.

**Never:** a `BOT_GUNS` table; pass/fail thresholds on the new readouts; the time-in-draft readout or any edit to wake/draft code (Story 8.19, in flight in another worktree); `world.ts` edits; more than one batch run or more than 99 matches; retuning any fighting-style number; How-to-Play or any client copy; a `PROTOCOL_VERSION` bump; editing `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Eric's example | `raider` (specialist), heavy torpedo at 4 copies (its highest), empty belt, slots full; hand = heavyTorpedo + smokeScreen | torpedo 2+1+1 = 4 beats smoke 2+1+0 = 3 | none |
| Weapon vs plain upgrade | any personality, one Q/E/R empty; hand = a non-favorite weapon + a no-bonus ladder | weapon (3.5) wins | none |
| Two-bonus upgrade vs favorite weapon | `siege`, slot empty; hand = starShells (favorite weapon, unheld) + radarSweep where it is `max(U)` | radarSweep 4 beats 3.75 | none |
| Favorite among weapons | `trapper`, slot empty; hand = navalMines + broadside | navalMines (3.75 vs 3.5) | none |
| Needed heal | `siege` (low hunger) at 30 % hp, no repair carried, slot empty; hand = hullRepair + a favorite weapon | hullRepair 4 beats 3.75 (hunger not applied) | none |
| Healthy, low hunger | `duelist` healthy; hand = hullRepair (none carried) + plain ladder | ladder 2 beats 1 | none |
| Already carried | `bulwark` carrying shieldBlock; hand = shieldBlock + chaff (none) | chaff 2+1 = 3 beats shieldBlock 2+1−1 = 2 | none |
| Style: rounded | `bulwark`, armor 3 copies, speed 0; hand = armor + speed | speed 3 (min of U) ties armor 3 (favorite) → seeded flip | none |
| Tie, no rng | two cards tie, `rng` undefined | lowest offer index | none |
| Flat build (R11) | `bulwark` at level 0, nothing held; hand = armor (favorite) + a non-favorite weapon | armor 2+1 = 3 (no style bonus on a flat build); weapon 3.5 wins | none |
| Uneven build | `bulwark` with one weapon held, ladders at 0; hand = armor + speed | both at min(U) = 0: armor 4, speed 3 | none |
| Tie, rng | same hand, seeded `spendRng` | one `next()` consumed, either tied index; a non-tied hand consumes none | none |
| Dead hand | every card refused | `null`, level stays banked | none |
| Hull unlock | 600 seeded enrollments with no override | all six personalities appear on all three hulls | none |
| Test row | `--bot-profile randomBattleship` | hull is battleship, spend is the uniform random pick | none |
| Boost in | TB bot, posture `pursue`, target at `band.max + 50` u, boost ready | boost pressed | none |
| Boost hold | same bot, target inside the band, posture `engage` | not pressed | none |
| Smoke once | bot enters `disengage` holding 3 smoke; 12 s pass in `disengage` | exactly one press | none |
| Smoke still running (R12) | it leaves `disengage` and re-enters 20 s after the press (puffs alive) | NO press; storm-dodge / heal flicker likewise | none |
| Smoke gone (R12) | still or again in `disengage` 36 s after the press | one more press | none |
| Smoke late stock | smoke stocked mid-retreat, none of its own running | pressed once | none |
| Boost vs fleet (R13) | TB bot in `farm` posture, fleet group at `band.max + 200` u | not pressed | none |
| Stub row | bot somehow holding `depthCharge` | tactic never wants; no throw | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.bots`: DELETE `boonWeights` + its history comment; `profiles` → flat id list; ADD `cardPoints`. Touch nothing outside the `bots` block (8.19 edits `CONFIG.wake`).
- `server/src/game/ai/types.ts` -- `BotProfileId` derivation from the flat list; `BotMind.disengageSince?`; `BotSelf` gains `readonly level` only if the scorer needs it (it should not).
- `server/src/game/ai/profiles.ts` -- drop `hullId` from in-game rows; `taste` on every row; explicit per-line appetites; test-only hull map.
- `server/src/game/ai/botDriver.ts` -- `enroll` flat pick + hull from the roll; `spendStateOf` carries `repairHp`; `releasePerLifeState` clears `disengageSince`.
- `server/src/game/ai/spending.ts` -- REWRITE: points scorer; delete `KIND_BASE`, `CATEGORY_LINES`, `LINE_ALIASES`, `HOMELESS_V2_LINES`, `boonWeightFor`.
- `server/src/game/ai/equipment.ts` -- weapon rows only + shared helpers; boost rule (R7) moves out; stale "Story 8.18/8.19 owns" comments fixed.
- `server/src/game/ai/shift.ts`, `ai/consumables.ts` -- NEW (rows listed above; smoke rule R8). A registry module assembles the total tables + `tacticFor` / `slotAppetite`.
- `server/src/game/ai/tactics.ts` -- imports; stamp `disengageSince` on the posture edge in `deliberateNow` / `decideHeld` (`:865`, `:924`); spend call sites (`:906`, `:934`).
- `server/src/__tests__/{bots,botPolicy,botTactics}.test.ts` -- key-set pin, profile/hull pins, spending block rewritten to the matrix, registry pins by new path, boost + smoke cases.
- `server/scripts/batchsim/{botMetrics,botReport,runner,main,args}.ts`, `server/scripts/batchSim.mjs` -- additive readouts in NEW functions (8.19 also edits `botMetrics`/`botReport`); dead `--deck-only --draws` usage line removed; `server/scripts/__tests__/{botHarness,tunedRandomSpend,batchSim}.test.ts`.
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-8-context.md,epic-8-context-amendments.md,deferred-work.md,batch-sim-evidence-2026-09-30.md}`.

## Tasks & Acceptance

**Execution:**
- [ ] Wave 0 (Opus, one writer — freezes the interfaces) `shared/src/constants.ts`, `ai/types.ts`, `ai/profiles.ts`, `ai/botDriver.ts`, profile blocks of `bots.test.ts` / `botPolicy.test.ts` -- flat profiles, tastes, `cardPoints`, explicit appetites, hull unlock -- `npm run build -w shared`; tsc may be red only in `spending.ts` consumers until Wave 1
- [ ] Wave 1S (Opus) `ai/spending.ts` + spending/random/8.15 blocks of `botPolicy.test.ts` -- the scorer, every scorer row of the matrix, and a seeded property test (6 personalities × 50 seeds through the real `drawOffer`) that no personality ends ten levels with zero Q/E/R weapons
- [ ] Wave 1E (Opus, parallel) `ai/equipment.ts`, NEW `ai/shift.ts`, `ai/consumables.ts`, registry module, `ai/tactics.ts`, `botTactics.test.ts` -- split, totality, R7, R8, stale comments
- [ ] Wave 1H (Opus, parallel) harness files + tests -- readouts: gun mix (count and mean placement per gun), weaponless-at-level rate, pure-gunboat rate, heal-take rate (HULL REPAIR offered vs taken), levels wasted, weapon-line spread per lobby, peak live mines; read from `world` in the collector
- [ ] Wave 2 (orchestrator) gate, review, ONE batch run `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 99`, evidence file
- [ ] Wave 3 (Sonnet) docs wave

**Acceptance Criteria:**
- Given `npm run check`, then lint, tsc ×3, all tests and the hook test pass; `npx tsc --noEmit -p server/scripts/batchsim/tsconfig.json` and the `rl` tsconfig are clean; `PROTOCOL_VERSION` is unchanged.
- Given a new `ConsumableId`, `EquipmentId` or `ShipClassId` with no bot row, then the server fails to type-check.
- Given a grep of `server/src` and `shared/src`, then `boonWeights`, `LINE_ALIASES`, `CATEGORY_LINES`, `APPETITE_FAMILY` and `hullId` on an in-game profile do not appear, and no comment defers work to "Story 8.18/8.19/8.20 owns".
- Given the batch run, then the report prints every readout above and `batch-sim-evidence-2026-09-30.md` states: balance cycle 1's class numbers are VOID, the control was not re-run (Eric, R10), and the `encounterSpan.ts` killing-blow bias.

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass 1 (Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same 5,391-line diff — verdicts: Blind Hunter build-on-it, Edge Case Hunter build-on-it, Codex fix-first on one harness item; agreement: BOTH hunters flagged the smoke re-arm on a posture flicker; Codex alone found the death-tick omission in the harness collector, confirmed by the orchestrator in the code; every anti-cheat / determinism / wire probe — tie-draw count, enrollment stream position, registry totality and import direction, `PROTOCOL_VERSION` untouched, no client read of `CONFIG.bots`, scorer arithmetic re-derived row by row — came back clean from all three)
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 2, low 5)
- defer: 0
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `[medium]` `[patch]` SMOKE re-armed on every flee-posture flicker (storm-edge dodge, heal pop-up) — one flight could spend the whole stack (both hunters, PLAUSIBLE → traced) → Eric ruling R12: never while one of its own is running; `disengageSince` and the edge stamp deleted.
  - `[medium]` `[patch]` Harness collector skipped a bot's death tick, losing a weapon fitted or a level reached on it (Codex, CONFIRMED) → sinking/sunk records keep being sampled.
  - `[low]` `[patch]` Boost-in vs `farm` posture reading (Blind Hunter) → Eric ruling R13: real fights only; pinned.
  - `[low]` `[patch]` Unsampled bot read as a pure gunboat (Blind Hunter F6 + Edge Case Hunter 3) → `finalEmpty` null until sampled.
  - `[low]` `[patch]` Level-reset on a waiting-phase redeploy dropped a second life's level samples (Blind Hunter F4, latent) → fresh series on reset.
  - `[low]` `[patch]` `SHIFT_TACTICS` hand-duplicated the hull → special mapping (Blind Hunter F8) → derived from the shared mapping.
  - `[low]` `[patch]` Runtime fail-closed skip for an unknown slot id was lost with the total registries (Edge Case Hunter 2) → restored without weakening compile-time totality.
- evidence-file caveats (not code): the heal-take denominator counts hands where HULL REPAIR was untakeable (at cap / belt full), so late-match rates under-read willingness; a level earned within one deliberation of death reads as wasted (Blind Hunter F3/F7).
- rejected: the rounded/specialist consequences of the points table (many 3-point ties for a rounded bot; a specialist stacks a favorite weapon's tiers before a second weapon) — that IS the ruled table, to be read in the evidence, not changed (Blind Hunter F5); the `slotIds`-absent test-state divergence (Edge Case Hunter 4, hand-built states only).

## Design Notes

- **Why 3.5 / 3.75 for weapons:** Eric's reading B — a new weapon is a card like any other, ahead of ordinary cards but behind a two-bonus upgrade (4) and a needed heal (≥ 4). Half-points keep the order strict without a second rule.
- **Why style reads the whole upgradeable set, not the hand:** "my lowest-tier thing" is a fact about the build; reading only the hand would call a lone mid-tier card both lowest and highest.
- **Why `disengageSince` instead of a pressed flag:** `want()` must stay write-free; `smokeUntil − layMs ≥ disengageSince` answers "pressed this retreat" from two stamps the mind already has or gets on the posture edge.
- **Why a registry module:** the total `EQUIPMENT_TACTICS` needs the shift rows while shift and belt rows need the weapon helpers; two-way imports would read a `const` row before it exists.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green
- `npm test -w server` -- expected: green
- `npx tsc --noEmit -p server/scripts/batchsim/tsconfig.json` (and `server/scripts/rl`) -- expected: clean
- `npm run check` -- expected: exit 0
