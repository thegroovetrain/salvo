---
title: 'Story 8.13: Catalog v3 — Torpedoes and Mines'
type: 'feature'
created: '2026-09-19'
status: 'done'
review_loop_iteration: 0
baseline_revision: 'ab4f198'
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The Torpedo Boat and Mine Layer default decks deal lines whose mechanisms do not exist: `lightTorpedo` and `captiveMines` are catalog stubs, every equipment line's tiers II–V are empty, the captive path still reads the naval row everywhere, and a straight-running torpedo that leaves an observer's detect ring is never revealed again. Eric's 2026-09-19 rulings (amendments 74–84) also re-cut the story: the Supercavitating Torpedo is a belt CONSUMABLE, ACOUSTIC HOMING and the FOULING MINES add-on are removed (homing becomes a tier stat on light/heavy torpedoes and on the captive fish; FOULING MINES becomes its own equipment line), and DEPTH CHARGE joins as a stub consumable so the Mine Layer's deck still sums to 40.

**Approach:** Author tiers II–V for LIGHT TORPEDO, HEAVY TORPEDO, NAVAL MINES, CAPTIVE MINES and FOULING MINES from catalog-v3 §4 as amended (stat adds/mults on whitelisted paths; the −5 % reload step stays tier-derived; the captive trigger step is tier-derived); promote their rows out of `STUB_ROWS` into `CONFIG`; move `supercavTorpedo` to the consumable id space and `foulingMines` into the equipment id space; build a shared `torpedoCore.ts` that spawns every torpedo (three ids, one `torp` wire kind) and per-line server modules; key every mine reader off the mine's own kind; put the kind on the wire for own mines only; replace the permanent once-only ballistic mark with a per-gate mark that clears on exit so re-entry re-reveals; ship minimal bot tactics; prove the two decks end to end in the weapons smoke; bump `PROTOCOL_VERSION` 55 → 56 once.

## Boundaries & Constraints

**Always:**
- `CONFIG` + `CATALOG` are the single sources; `effectiveStats` is the only path from cards to numbers; damage stays whole (amendment 39); integer stats floor once (`EQUIPMENT_INT_FIELDS`).
- Both sides run the same sim: torpedo steering (`steerHoming`), arcs (`arcs.ts`), the stat fold and the mine ring derivation live in `shared/`.
- Everything spatial leaves through `frames.ts` from `perception.observe()`; the re-reveal is a change to the gate's memory, not a new channel; the six-exception invariant is untouched; the reveal shape is `{k,id,x,y,vx,vy,t}` and gains no field.
- No friendly fire: an owner's own fish never damages the owner (the light torpedo at 45 u/s is slower than every hull — allowed, FR53).
- Ids are locked (amendment 7 as amended by 80/83): `LINE_IDS` = the 29 with `acousticHoming` → `depthCharge`; no other id changes.
- `npm run check` green; complexity ≤ 10; no in-game copy beyond the ratified words (`SUPERCAV TORPEDO`, `DEPTH CHARGE`, `FOULING MINES` and the existing stat labels; a fouling card's rows use the mines' existing label set plus `Slow`).

**Block If:**
- Any AC/catalog number is missing and not covered by amendments 74–84 (do not invent; HALT).
- The re-reveal rule cannot be expressed without a seventh perception exception or a new wire field.
- The four-line legality rule would be needed for any default deck (it must not: every default deck has exactly three equipment lines).

**Never:**
- Re-author the five ladders or the deck-gun family (amendment 73); touch missiles/machine gun/flak/monitor (8.14), shield/chaff/decoy (8.15), smoke (8.16), How-to-Play (8.20), results (8.19).
- Add a max range to any torpedo; put speed, range or weapon id on a ballistic reveal; let observers other than the owner receive a mine's kind.
- Delete a test silently; suppress a lint rule; edit `CLAUDE.md`, `catalog-v3.md` or the GDD (rulings live in the amendments; a doc-sync is ledgered).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Light torpedo at tier I | 1 `lightTorpedo` card, click at 90° starboard | one fish from the starboard beam toward the click, 45 u/s, 40 dmg, straight (turnRate 0, no `torpU`, no die distance), reload 25 s × cooldownScale | click at 0°/180° (dead zones) → `out-of-arc` denial |
| Light torpedo at tier V | 5 cards | 60 dmg, 55 u/s, 3 tubes (floor of 1 + 0.5×4), reload 20 s, turnRate 0.5 rad/s, acquire 120 u, dies at 1300 u; `torpU` corrections flow | none |
| Heavy torpedo ladder | k cards (1..5) | dmg 50+5(k−1); speed 65+2.5(k−1); tubes floor(1+0.5(k−1)) = 1,1,2,2,3; reload 30 s × (1−0.05(k−1)); turnRate 0.125(k−1) | none |
| Supercav consumable | belt slot stocked ×n, digit primes, click inside bow ±15° | one fish 195 u/s, 50 dmg, straight-runner, `n−1`, one copy leaves `cards`, slot clears at 0; no reload timer ever | click outside ±15° → `out-of-arc`, nothing spent; refit window open → suspended |
| Supercav in the pool | pool roll | `supercavTorpedo` is a candidate line (cap 5 within the pool); `depthCharge` stub copies may roll but are never dealt | none |
| Naval mine ladder | k cards | dmg 55+5(k−1); blast 48×1.1^(k−1); trigger = 2/3 blast; pool 2+(k−1); reload 15 s step; never fouls | none |
| Captive mine ladder | k cards | trigger 144×1.1^(k−1) (210.8 at V), blast fixed 32; fish dmg 55+5(k−1) at that blast; held floor(1+0.5(k−1)) = 1,1,2,2,3; reload 20 s step; fish turnRate 0.075(k−1) after the lead launch | never self-detonated: excluded from burst/chain as today |
| Fouling mine ladder | k cards | dmg 10 fixed; blast 72×1.1^(k−1), trigger 2/3; pool 2+(k−1); reload 15 s step; victim slow factor 0.75−0.05(k−1) for 5 s, refresh-not-stack (a later fouling overwrites factor and clock) | victim-private wire, as today |
| Own rings by kind | owner lays naval + captive + fouling | each own `MineView` carries its kind; rings drawn per mine (captive: trip ring; others: blast + trigger) | observer frames carry no kind field (invariant-pinned) |
| Straight fish re-entry | fish revealed at detect ring, observer backs off (fish outside), then closes again | mark cleared on the out tick; re-entry emits a fresh `torp` reveal with current pos/vel; client re-anchors the culled track | a fish that never leaves the gate is revealed exactly once (byte-identical to today) |
| Shell re-entry | same for `shell` kind at the sight ring | same rule (one mechanism) | none |
| Deck legality | TB and ML default decks | TB: 30 + light 3 + heavy 3 + machineGun 3 + supercav 1 = 40, three equipment lines; ML: 30 + naval 3 + captive 3 + flak 3 + depthCharge 1 = 40, three equipment lines; `maxEquipmentLines` stays 3 | a deck naming `acousticHoming` is `unowned` |
| Bots | bot fitted with light torpedo / captive mines / fouling mines / supercav stock | fires each through the interim tactic rows; never fires an empty slot | none |

</intent-contract>

## Code Map

- `shared/src/sim/catalog.ts` -- `LINE_IDS` (−`acousticHoming` +`depthCharge`, still 29), `lightTorpedo`/`captiveMines` stub flags off, tiers II–V authored for light/heavy/naval/captive/fouling via `statEffect` adds/mults (`damage`, `speed`, `maxAmmo`, `blastRadius`, `homingTurnRate`, `slowFactor`); `supercavTorpedo: consumable(...)`; `foulingMines: weapon(...)`; `depthCharge: consumable(..., true)`; default decks per amendments 80/83; `DEFAULT_OWNED`
- `shared/src/sim/effects.ts` -- `CONSUMABLE_IDS` (+`supercavTorpedo`, +`depthCharge`), `EQUIPMENT_STAT_FIELDS` (light/heavy gain `homingTurnRate`; captive `damage`,`maxAmmo`,`homingTurnRate`; fouling `damage`,`maxAmmo`,`blastRadius`,`slowFactor`; supercav row removed), `DOCTRINE_MODES` (drop `homing`, `propFouling`), `EQUIPMENT_INT_FIELDS` unchanged
- `shared/src/sim/loadout.ts` -- `EquipmentId` (−`supercavTorpedo` +`foulingMines`), `EQUIPMENT_IS_WEAPON`, `CONSUMABLE_IS_WEAPON` (`supercavTorpedo: true`, `depthCharge: false`)
- `shared/src/constants.ts` -- `CONFIG.lightTorpedo`, `CONFIG.supercavTorpedo` (consumable numbers + arc), `CONFIG.captiveMines`, `CONFIG.foulingMines` (all numbers from amendments 74/77/81/82, `[DRAFT]` where ruled); `CONFIG.torpedo` keeps the heavy + shared family fields; `CONFIG.mine` loses `foulFactor`/`foulDurationMs`/`captiveTriggerFactor` to the new blocks
- `shared/src/sim/stats.ts` -- `EffectiveTorpedo.homingTurnRate` replaces `homing: boolean`; `EffectiveMine` gains `kind`-specific derivation (`deriveMineRings`: naval/fouling trigger = 2/3 blast; captive trigger = 144 × 1.1^(tier−1), blast 32), `slowFactor` on the fouling row, `homingTurnRate` on the captive row; `STUB_ROWS` loses light/captive/supercav; base rows for fouling
- `shared/src/sim/arcs.ts` -- `arcFor` widens to `SlotItemId`: `lightTorpedo` twin-sector (offset 90°, half 45°), `supercavTorpedo` sector ±15°, `foulingMines` the mine sector; `unbuiltArc` union shrinks
- `shared/src/sim/shell.ts` -- `steerHoming` unchanged; callers pass `homing` only when `homingTurnRate > 0`
- `shared/src/types.ts` -- `MineView.c?: MineKind` (present only when `own`); doc rule
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 56 with the header entry (catalog content, `MineView` shape, id moves; no new event kind; six exceptions)
- `shared/src/__tests__/` -- catalog (SHEET, stub set, 29 lines, decks), stats (rows, ladders, derivations, permutation), arcs, deckRules, loadout, barrel (whitelist absences), damageGuardrail (speed facts updated), pool
- `server/src/game/equipment/torpedoCore.ts` (NEW) -- one `launchTorpedo(ctx, row, arc, opts)` for every torpedo: arc check (sector or twin-sector side), spawn via `makeBallistic` with hull clearance, `homing` only when `row.homingTurnRate > 0`, `range` = die distance only when homing, else `Infinity`
- `server/src/game/equipment/torpedoes.ts` -- heavy + light rows over the core (light: `twinSectorArcFor`, fish toward the click)
- `server/src/game/equipment/consumables/` -- `supercavTorpedo` row (`isWeapon` true; arc + `n−1` + core launch; no reload); production registry now non-empty for it (equipment.test totality pin moves)
- `server/src/game/equipment/mines.ts` -- `MineState.kind: 'naval' | 'captive' | 'fouling'` set from the laying slot's id; rows for naval/captive/fouling over one chassis factory; `captiveTorpedo` reads the captive row (damage, blast 32, `homingTurnRate`)
- `server/src/game/world.ts` -- `mineTripRules`/`mineBlastParams`/`laysCaptiveMines`/`launchCaptiveTorpedo`/chain guards keyed by `mine.kind` + the owner's row for that kind; fouling applies `slowFactor` + 5 s (`ShipRecord.slowFactor` beside `slowedUntil`, refresh-not-stack); mine `hitTargets` row excludes captive by kind; `MineView` emit with own-only `c`
- `server/src/game/perception.ts` + `signals.ts` -- re-reveal: in `ballisticScan`, a live projectile in `seenBallistics` that fails the gate this tick is un-marked (and its `torpDirs` entry dropped); a marked projectile inside the gate stays silent; `torpU` unchanged
- `server/src/game/ai/equipment.ts` + `spending.ts` -- interim tactic rows (amendment 79); `BASE_APPETITE` rows; alias table
- `server/src/__tests__/` -- weapons, doctrines (→ per-kind), hitTargets, denials, equipment (registry totality: every non-stub `slotFill` has a row; supercav consumable row present), signals + goldenFrames (`re-reveal` sub-cases), perception invariants (kind field never on observer frames; re-reveal never outside the gate), bots
- `server/scripts/weaponsSmoke.mjs` -- phases for light torpedo (TB, `fitOverride: ['lightTorpedo']`) and captive mine (ML, `fitOverride: ['captiveMines']`) + heavy/naval as today
- `client/src/render/weaponArc.ts`, `aimPreview.ts`, `firing.ts` -- consult `arcFor(SlotItemId)`/kind, not id equality; mine range for every mine kind; supercav preview on the belt
- `client/src/render/mines.ts` -- own rings from the wire kind
- `client/src/render/projectiles.ts` + `net/roomBindings.ts` -- reveal for a known id re-anchors; own-fire art/tone by line + `homingTurnRate > 0`; `FIRE_TONE` Extract widened (no new ToneId)
- `client/src/render/equipmentInfo.ts`, `equipmentIcons.ts`, `ui/boonCopy.ts` -- names (`SUPERCAV TORPEDO`, `DEPTH CHARGE`, `FOULING MINES`), glyphs (family glyphs reused; icon pass stays ledgered), stat rows (`Slow` label for fouling), damage table
- `client/src/__tests__/` -- fitCheck (29 lines, new non-stub lines walk), refitCardFit/hotbar (exemption retired), cardStatRows, weaponArc, mines, projectiles
- `VERSION`, root `package.json` (+ lock) -- 0.18.13 (cycle 148); `CHANGELOG.md` -- `## [0.18.13] - 2026-09-19`; `_bmad-output/gds-workflow-status.yaml` + `_bmad-output/implementation-artifacts/sprint-status.yaml` -- one-line stamps; `deferred-work.md` -- `:691` RESOLVED, `:1460` checked, 8.1 name exemption RESOLVED, captive-readers entry (`:2001`) RESOLVED, new 8.13 section (catalog-v3/GDD doc-sync owed; icon pass; HEAT SEEKING open for 8.14)

## Tasks & Acceptance

**Execution:**
- [x] amendments 74–87 in both homes -- done at plan time
- [x] Wave 1 `shared/` -- ids, catalog, CONFIG blocks, stats/derivations, arcs, `MineView`, PV 56, tests -- `npm run build -w shared && npm test -w shared`
- [x] Wave 2a `server/` equipment + world + bots + smokes -- `npm test -w server`
- [x] Wave 2b `server/` perception re-reveal + invariants -- `npm test -w server`
- [x] Wave 3 `client/` -- `npm test -w client`
- [x] Wave 4 docs, version, changelog, trackers, ledger -- `npm run check` exit 0
- [x] weapons smoke over a booted server (own scratch port) proving TB light torpedo + ML captive mine end to end

**Acceptance Criteria:**
- Given a Torpedo Boat and a Mine Layer sailing their default decks, when every card is taken, then every line resolves to a live weapon with the tier-V numbers in the I/O matrix and no stub is ever dealt.
- Given any legal pick order, when `effectiveStats` folds the cards, then the result is permutation-invariant and every damage value is a whole number.
- Given an observer whose gate a live projectile leaves and re-enters, when frames are built, then exactly one reveal is emitted per entry, nothing is emitted while outside, and the six-exception invariant holds.
- Given a mine, when frames are built, then only the owner's frame carries its kind.
- Given `npm run check`, then lint, tsc ×3 and every test pass; `PROTOCOL_VERSION` is 56.

## Spec Change Log

## Review Triage Log

### 2026-09-19 — Review pass (Blind Hunter + Edge Case Hunter on Fable, plus Codex `gpt-5.6-sol` cross-model review — verdicts: Blind build-on-it, Edge build-on-it, Codex fix-first on two client re-reveal findings; agreement: ALL THREE flagged the own-fire latch theft on a re-reveal; Blind + Edge both flagged the bot belt-shot reach skip; Codex alone found the re-anchored homing look; Edge alone found the captive fish re-acquiring a neutral drone and the no-op `ROUNDS 1 → 1` row; Blind alone found the dead fouling hit mask; every wire/gate/spend/fold attack came back clean from all three)
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 2, low 4)
- defer: 4: (high 0, medium 0, low 4)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` a re-reveal of a KNOWN projectile no longer claims the own-fire latch or replays the fire tone (Codex, Blind F1, Edge 5)
  - `[medium]` `[patch]` the captive fish locks to the hull that tripped the mine; `steerHoming` honours a pinned `targetId` (Edge 2; amendment 87a)
  - `[low]` `[patch]` a re-anchored fish takes the observable-steering classification (Codex 1)
  - `[low]` `[patch]` bot band-pull counts belt `shot` tactics; stale comment fixed (Blind F2, Edge 3)
  - `[low]` `[patch]` tier cards skip a no-op step row (`ROUNDS 1 → 1`) (Edge 1; amendment 87b)
  - `[low]` `[patch]` the mine trip scan uses each kind's own `hits` mask; `CONFIG.foulingMines.hits` is live (Blind F3)
- deferred: rim-hugging reveal chatter + per-tick gate cost (Blind F4, Edge 6); light-torpedo lead solver vs a faster target (Edge 4); `SLOW 75%` label ambiguity (Blind F7); fouling unreachable until Epic 9 (Blind F6). Recorded as-ruled: weaker later fouling overwrites (Blind F5, amendment 87d).

## Auto Run Result

Status: done (cycle 148, 0.18.13; PROTOCOL_VERSION 55 → 56; epic-8 amendments 74–87)

**Summary.** Story 8.13 landed as re-cut by Eric's 2026-09-19 rulings. Five tier ladders are authored (LIGHT/HEAVY TORPEDO, NAVAL/CAPTIVE/FOULING MINES) with homing as a tier stat (light/heavy 0 → 0.5 rad/s, captive fish 0 → 0.3); ACOUSTIC HOMING and the FOULING MINES add-on are gone; FOULING MINES is its own equipment line with [DRAFT] numbers whose tiers deepen the slow (×0.75 → ×0.55); the SUPERCAVITATING TORPEDO is a prime-and-click belt consumable named SUPERCAV TORPEDO (in the hidden pool, one copy in the Torpedo Boat deck); DEPTH CHARGE is a stub consumable and the Mine Layer's 40th card. One `torpedoCore.ts` spawns every fish; mines are per-kind server-side with the kind on the wire for own mines only (`MineView.c`); the fouled victim's per-tier slow factor rides the own-ship view (`OwnShip.slowFactor`, victim-private); the straight-runner re-reveal is FIXED by a per-visit reveal mark behind one gate predicate (six exceptions unchanged); tier cards print every authored step with a `HOMING` row (skipping no-op rows); minimal interim bot tactics; the weapons smoke gained light-torpedo and captive-mine phases and passed against a booted server.

**Files.** 100+ across `shared/` (catalog, effects, loadout, constants, stats, boons, arcs, shell, types, index, tests), `server/` (`equipment/torpedoCore.ts` NEW, `consumables/supercavTorpedo.ts` NEW, torpedoes, mines, index, consumables, world, frames, perception, signals, ai/equipment, ai/tactics, ai/spending, `scripts/weaponsSmoke.mjs`, batchsim controls, tests + golden snapshot), `client/` (weaponArc, aimPreview, firing, mines, projectiles, equipmentInfo, equipmentIcons, boonCopy, roomBindings, tones, prediction, ownFire, main, tests); `VERSION` / `package.json` / lock 0.18.13; `CHANGELOG.md`; both trackers; `deferred-work.md` (six stamps, 8.13 section, five review-gate defers); amendments 74–87 in both homes; this spec.

**Review.** Blind Hunter + Edge Case Hunter (Fable) build-on-it; Codex `gpt-5.6-sol` fix-first on two client re-reveal findings. Six patches applied, every one fail-first proven (two medium: the own-fire latch theft on a re-reveal, flagged by all three; the captive fish re-acquiring a neutral drone under tiered homing — now locked to its tripper, amendment 87a). Four defers, zero rejects.

**Follow-up review recommended:** true — the patch round touched shared sim steering (`steerHoming` locked-target branch) and the client's reveal attribution path; both are pinned but were reviewed only by their implementer.

**Verification.** `npm run check` exit 0 three times (after waves: 962/2055/3628; after the patch wave: 962/2057/3643; after review patches: shared 965 / server 2061 / client 3650, hooks 266). Weapons smoke against a server booted on a scratch port: all six phases OK (heavy torpedo kill, torpedo-never-blips, mines uncapped, ambush, light torpedo kill at 40 dmg, captive fish 55 with `c === 'captive'` on the own frame). Fail-first evidence recorded per patch in the commit messages and the Review Triage Log.

**Residual risk / for Eric.** (1) Amendment 87b skips no-op `ROUNDS 1 → 1` rows — veto if you want the half-tube step shown. (2) A weaker later fouling overwrites a stronger active slow, as amendment 81 reads literally. (3) `SLOW 75%` may read as "slows by 75 %". (4) Per-visit reveal chatter for rim-hugging projectiles is bounded but unmeasured — watch a production smoke. (5) The fouling runtime is unreachable in play until Epic 9 unlocks the line. (6) catalog-v3.md and the GDD now disagree with amendments 74/80–83 — a doc-sync pass is owed. Staging QA: TB deals LIGHT TORPEDO and one SUPERCAV TORPEDO on the belt (prime with the digit, click inside the bow cone); ML deals CAPTIVE MINES with its own dotted trip ring; a heavy at tier II visibly homes and shows `HOMING 0 → 0.125 rad/s` on its card.

## Design Notes

- **Why the re-reveal is a memory change, not a channel:** the gate already answers "is this projectile disclosable to me this tick"; making the once-only mark per-visit (clear on the first out tick) lets the existing reveal row fire again on re-entry with the same shape. The old permanent mark existed to stop re-sends while inside; that behaviour is preserved because the mark is only cleared once the projectile is outside.
- **Why the captive trigger step is derived:** trigger radii are deliberately off the stat whitelist; the tier is already on the row, so `deriveMineRings` reads it. Blast stays 32 so the fish's burst does not grow.
- **Why `CONFIG.torpedo` is not renamed:** it is read at ~40 sites; the heavy is the family's reference fish and its shared fields (hit radius, spawn clearance, homing acquire/die/update) belong to all three.
- **Fouling slow:** `slowFactor` is on the victim beside `slowedUntil`; `slowedKinematics` reads it; a later fouling overwrites both (refresh-not-stack), never multiplies.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- green after wave 1
- `npm test -w server` -- green after waves 2a/2b; `npm test -w client` after wave 3
- `npm run lint`; `npm run check` -- exit 0
- `HC_DEV_OPTIONS=1 PORT=<scratch> npm run dev -w server` + `WS_URL=ws://localhost:<scratch> node server/scripts/weaponsSmoke.mjs` -- all phases pass; kill only the booted PID

**Manual checks (if no CLI):**
- Eric on staging: TB deals LIGHT TORPEDO and one SUPERCAV TORPEDO; ML deals CAPTIVE MINES; own captive ring differs from naval; a heavy at tier II visibly homes.
