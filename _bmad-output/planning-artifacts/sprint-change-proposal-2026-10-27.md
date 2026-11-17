# Sprint Change Proposal — 2026-10-27: The Flash Shell returns and the Buoy splits in four — Story 10.9 beside the four configurable slots

**Status:** APPROVED by Eric 2026-10-27 (gds-correct-course, batch mode — Eric's brief in the invocation, structural rulings by AskUserQuestion, the four buoy effects described by him in chat and read back)
**Trigger:** Eric, 2026-10-27, invoking the correct-course on Epic 10: *"along with the move to four configurable slots, I'd like to go ahead and add back in some more choices for what to take into battle with you. Right now there are six choices, of which the player picks four. Lets add back in the Flash Shell. Lets also split the Buoy into Four varieties... Radar, Healing, Shield, and Speed. All of them will have the same 50 HP stats and will soak up torpedoes/attract homing torpedoes as a preference over ships, but each of them has a different special area effect, which I will describe. We'll also need to amend the ship loadout modal so that the player can make these choices outside of the game."*
**Author:** Developer agent with Eric (every design clause is Eric's ruling or his verbatim words from this session; a clause with no ruling behind it is marked `[unruled]`)
**Predecessor:** `sprint-change-proposal-2026-10-25.md` (the roadmap rebuilt; Story 10.1 Four Configurable Consumable Slots)

---

## 1. Issue Summary

**Problem statement.** Story 10.1 lets a captain choose four consumables from the catalog before sailing. The catalog holds six live consumable lines (HULL REPAIR, SHIELD BLOCK, MULTI-SPECTRAL COUNTERMEASURE, FOULING SHELL, DECOY BUOY, SUPERCAVITATING TORPEDO) plus the DEPTH CHARGE stub; a pick of four from six is a thin choice. Eric wants the choice widened at the same time the slots land: the FLASH SHELLS consumable comes back (it was replaced by the FOULING SHELL on 2026-10-11, epic-9 amendment 24), and the one DECOY BUOY becomes four buoys — RADAR, HEALING, SHIELD, SPEED — each the same 50 hp torpedo sponge with its own area effect. Ten lines, pick four. The port screen where the choice is made must exist for that to be possible.

**Issue type.** New requirement from the stakeholder (content widening), discovered at the start of Epic 10 before any story was created. Not a technical limitation, not a misunderstanding, not a failed approach.

**Evidence (what the record and the code say today, verified this session).**
- `shared/src/sim/effects.ts` `CONSUMABLE_IDS` = hullRepair, shieldBlock, countermeasure, decoyBuoy, depthCharge (stub, never dealt), supercavTorpedo, foulingShell. Six live lines on keys 1–6 (`CONSUMABLE_KEY_ORDER`, `shared/src/sim/loadout.ts`); `SLOT_COUNT` 11.
- FLASH SHELLS: no live code remains. `foulingShell` took its `LINE_IDS` seat and key 4 (catalog.ts, Story 9.4); `CONFIG.flashShells` and the `dazzledUntil` channel retired at PV 78. Its design of record is epic-8 amendment 132: *"a one-time r150 u burst; every non-friendly hull caught inside sees only 1/8 of its intel range for 10 s"* — click-aimed to the radar rung, zero damage, never stacks, radar untouched, the victim keeps the DAZZLED tell.
- DECOY BUOY (`server/src/game/decoys.ts`, `CONFIG.decoyBuoy = { hp 50, sizeU 12 }`): stationary, no tick, no lifetime, no sweep; dropped in the mine's rear sector; paints on radar as an anonymous 12 u square; the owner alone sees its hp arc; persists when its owner sinks; the owner's own ordnance never damages it. **Homing torpedoes have NO preference for it today** — `acquireNearest` (`shared/src/sim/shell.ts`) locks the nearest target in `homingAcquireRange` (120 u), hull or enemy decoy alike. Eric's "attract homing torpedoes as a preference over ships" is therefore a NEW rule, not a carry-over.
- **The port LOADOUT screen is NOT built.** Story 10.1's AC opens *"Given the shipped LOADOUT screen (amendment 96)"*; no such screen exists. What exists is the class-select layer (`client/src/ui/classSelect.ts`): three class cards, a read-only SPECIAL row, the DECK GUN chip row (CANNON · MACHINE GUN · FLAK), the color hoist; persisted in localStorage (`hullcracker.class`, `hullcracker.gun`, name, color pref) and carried to the server as join options (`client/src/net/connection.ts` `joinOptions`), sanitized fail-open in `server/src/rooms/roomOptions.ts`. Amendment 96's KEY · VALUE rows with picker modals are specified (DESIGN.md `loadout-row` / `picker-modal` / `picker-card`, `mockups/loadout-1.html`) and assigned to Story 13.4 (The Account). The 10.1 clause was a drafting error in the 2026-10-25 proposal; this proposal corrects it.
- The cancelled lines: epic-9 amendment 21 (Eric 2026-10-11): *"Speed Boost and Healing Buoy will not be being added, after all."* The Healing Buoy of `sprint-change-proposal-2026-10-06.md` was neutral (healed the enemy too) and shootable like a mine; today's rulings replace that design entirely, they do not revive it.
- `PROTOCOL_VERSION` is 91. Catalog content is wire contract; any slot or key change bumps it (PV 75 precedent for SLOT_COUNT 9 → 11).

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| **Epic 10 The Playtest Pass** | Gains **Story 10.9 The Flash Shell and the Four Buoys**, built immediately after 10.1 (Eric 2026-10-27, AskUserQuestion: *one new story right after 10.1*, numbered 10.9 so 10.2–10.8 keep their numbers). Story 10.1's text is corrected (the LOADOUT screen is built by 10.1, not inherited) and its picker lists ten lines once 10.9 lands. Story 10.8 owes How-to-Play entries for the five new lines. Build order: **10.1 → 10.9 → 10.2 → … → 10.8**. |
| Epic 11 The Ledger | None. `MatchRecord` carries the consumable loadout from 10.1 (already planned); the new line ids are just more ids. |
| Epic 12 The Front Door | None. |
| Epic 13 The Account | 13.4 The Ship Screen inherits a LOADOUT screen that 10.1 has already started (SHIP · SPECIAL · DECK GUN · COLOR rows + CONSUMABLES); 13.6's unlock surfaces list ten consumable lines instead of six. No text change now; 13.11 reconciles. |

No epic is invalidated, none re-ordered.

### Story impact

| # | Story | Change |
|---|---|---|
| 10.1 | Four Configurable Consumable Slots | **Corrected:** the "shipped LOADOUT screen" clause → 10.1 BUILDS the CONSUMABLES row and its picker on the port screen (promoting the class-select layer to amendment 96's LOADOUT grammar as far as that row needs — the layout is a rendered candidate shown to Eric first, standing rule); the picker lists every non-stub consumable line of the catalog (six at 10.1, ten after 10.9), each line at most once `[unruled]`; everything else stands. |
| **10.9** | **The Flash Shell and the Four Buoys** (NEW) | Catalog: `flashShells` returns as a consumable line beside `foulingShell`; `decoyBuoy` is RETIRED and replaced by `radarBuoy`, `healingBuoy`, `shieldBuoy`, `speedBuoy`. Rules in §4. |
| 10.8 | How-to-Play and Record | Owes entries for FLASH SHELLS (returned) and the four buoys, and the DECOY BUOY retirement; catalog-v3 / GDD dated stamps. |
| 10.4 | Offer Composition | No change; the consumable pool is the captain's four whatever the lines are. |
| 13.4 / 13.6 | The Account | No text change; noted above. |

### Artifact conflicts

| Artifact | Conflict | Change (this PR) |
|---|---|---|
| `epics.md` | 10.1 AC "shipped LOADOUT screen"; no 10.9; 10.8's list; the Epic 10 list entry and intro | 10.1 corrected with a dated note; Story 10.9 added after 10.8 with its build-order note; 10.8 AC gains the five lines; list entry + intro gain a dated sentence |
| `gdd.md` Development Epics | E10 row lists eight items | Dated clause appended to the E10 row; mechanics sections (Consumables v3, the DECOY BUOY bullet, the Radar Buoy DELETED bullet) are NOT rewritten — stamped at 10.8 (the amendment-89(k) pattern) |
| `catalog-v3.md` | R36 DECOY BUOY; "RADAR BUOY is gone entirely" (R1) | Untouched now; dated addendum at 10.8 |
| `DESIGN.md` / `EXPERIENCE.md` | consumable-strip "1–6 fixed per kind"; loadout-row "not built — Story 13.4" | Untouched now; 10.1 re-cuts the strip and the loadout row with its rendered candidates and stamps them |
| `sprint-status.yaml` | no 10-9 row | `10-9-the-flash-shell-and-the-four-buoys: backlog` added; one-line stamp on `epic-10` |
| `gds-workflow-status.yaml` | `correct-course`, `next_expected` | One-line stamps |
| `epic-10-context-amendments.md` | amendment 1 only | Amendment 2 = this proposal's rulings |
| `deferred-work.md` | nothing owed | Untouched |
| Code | none | docs only; no version bump, no PV bump, no cycle |

### Technical impact

None in this PR. Downstream (10.9): five catalog lines → PV bump (catalog content is wire contract); a buoy gains a tick (lifetime 60 s, effect radius 750 u) where today's decoy has none — `decoys.ts` becomes a buoy store with a kind; the RADAR BUOY's sweep is a second observer source for its owner inside `perception.observe()` / `signals.ts` (the anti-cheat chokepoint; islands shadow it like every sensor — Eric 2026-08-02; paints reach the owner only; the SIX exceptions stay six); the HEALING, SHIELD and SPEED effects are owner-only hull state that must flow through `effectiveStats()` for speed and through the existing hull/shield channels for the other two so prediction matches; the homing preference is a change to `acquireNearest` in shared sim; `OwnShip` gains whatever the HUD needs to show buoy shield and buoy speed (PV bump). Bot tactics (`ai/consumables.ts`) gain the five lines by the 8-20 rule. The 10.1 LOADOUT work is client chrome (DOM) plus a join-option field and its sanitizer.

## 3. Recommended Approach

**Direct adjustment.** One story added to Epic 10, one story corrected, no rollback, MVP unchanged. Effort: Low for this proposal (docs); 10.9 is a medium build (five lines, one new sensor source, three hull effects). Risk: Low–Medium — the radar buoy touches perception, which is the one place a mistake leaks information; the invariant suite guards it. Rollback and MVP review were evaluated and rejected: nothing shipped needs reverting, and the GDD's goals stand.

## 4. Decisions ruled by Eric in this proposal (2026-10-27)

**By AskUserQuestion:**
1. **Batch review** of the edits.
2. **The FLASH SHELLS that returns is the old one as it was** (epic-8 amendments 129–137 / 132: click-aimed to the radar rung, zero damage, one r150 u burst, every non-friendly hull inside sees 1/8 of its intel range for 10 s, never stacks, radar untouched, DAZZLED tell). It returns **beside** the FOULING SHELL, which stays. Numbers re-confirmed at the 10.9 spec step.
3. **The plain DECOY BUOY is GONE — the four replace it.** Every buoy is the 50 hp torpedo sponge plus its own effect. The consumable list becomes ten: HULL REPAIR · SHIELD BLOCK · MULTI-SPECTRAL COUNTERMEASURE · FOULING SHELL · FLASH SHELLS · SUPERCAVITATING TORPEDO · RADAR BUOY · HEALING BUOY · SHIELD BUOY · SPEED BUOY (DEPTH CHARGE stays a stub).
4. **One new story right after 10.1**, numbered 10.9; 10.1 keeps the slot mechanism and the LOADOUT consumables row; the picker lists whatever the catalog holds.

**In chat, Eric's words (verbatim):**
> *"Radar buoy is just like the previous one, but in this case it grants 750 units of radar at your intel speed RPM for 1 minute. In fact all of these buoys will have a 750 unit range and a 1:00 timer before they expire. | The Healing buoy grants +2% missing hp passive healing to friendly ships in its radius, which is uninterruptible even when you are hit, but otherwise stacks on top of your built-in passive heal (which IS interruptible on hit). | The shield buoy provides +1% maximum health worth of shield per second to friendly ships in its radius. … | The speed buoy raises the max speed of all friendly ships in radius by 25%, scaling back down to 0% over 15s after leaving the radius (or the effect ends)."*

> and, correcting the shield and speed tails: *"Friendly ships gain the shield per second while in the radius, which lasts for 15 seconds after leaving the effect radius, and then ticks down to 0 temporary HP over another 15 seconds. And lets do that for speed... it lasts 15s after and then ticks down to 0 bonus speed over 15s."*

**The buoy rules of record (read back to Eric 2026-10-27; the shield and speed tails corrected by him, the rest not contradicted):**
5. **Every buoy:** 50 hp; dropped astern in the mine's rear sector like today's decoy; paints on radar as today's decoy; the owner's own ordnance never damages it; it persists when its owner sinks `[reading — today's decoy rule]`; **effect radius 750 u; expires 1:00 after it is dropped**; one stock per card, cap 5 per kind; it soaks torpedoes (any torpedo that runs into it detonates there) and **homing torpedoes prefer a buoy over a ship** when both are acquirable — NEW (today nearest wins); the exact preference law (always the buoy when any is in acquire range `[reading]`) is confirmed at the spec step.
6. **RADAR BUOY:** *"just like the previous one"* — a second radar for its OWNER for 1:00: its own rotating sweep centered on the buoy, **750 u** range, turning at the RPM the owner's intel ladder gives the owner's own sweep; paints go into the owner's radar picture only; islands shadow it like every sensor (Eric 2026-08-02).
7. **HEALING BUOY:** a friendly ship inside 750 u heals **2 % of its MISSING hp per second**; this heal is **never interrupted by being hit**; it **stacks on top of** the built-in passive heal (which still pauses on hit as today).
8. **SHIELD BUOY:** every second a friendly ship is inside 750 u it gains **shield worth 1 % of its max hp**; after the ship leaves the radius (or the buoy expires) the accumulated shield **holds for 15 s, then ticks down to zero over another 15 s**. Damage eats shield before hull (the SHIELD BLOCK law). Whether the buoy shield has a cap, and how it orders with a SHIELD BLOCK's 100 hp, `[unruled]`.
9. **SPEED BUOY:** a friendly ship inside 750 u has its **max speed raised 25 %**; after leaving (or the buoy expiring) the bonus **holds for 15 s, then ramps down to zero over 15 s**. Stacks with the Speedboat's Shift boost `[reading — the cancelled Speed Boost's ruling; confirm at spec]`.
10. **"Friendly ships" = the owner's own ship** — there are no teams; every other hull gets nothing from an enemy's buoy `[reading, not contradicted]`.
11. **Numbers beyond the ones above** (the flash's 150 u / 10 s / 1/8 re-confirmation; whether two buoys of one kind stack their effects; bot weights; the default four for a fresh browser) are Eric's at the 10.9 / 10.1 spec steps via AskUserQuestion; the spec author marks them `[unruled]`.

**Recorded, not ruled:** Story 10.2's design sitting may make "supply buoys" a map object; that is a different thing from these consumable buoys and is not pre-empted here.

## 5. Implementation Handoff

**Scope: Moderate** (backlog change — one story added, one corrected; no code).

| Who | Does |
|---|---|
| This run (docs PR) | The artifact edits in §2, this file, `epic-10-context-amendments.md` #2, both tracker stamps; ONE PR to `development`; **never merged without Eric's say-so** |
| Eric | Approves this proposal; merges the PR; rules the `[unruled]` points at each spec step |
| `gds-create-story` 10-1 | First (now including the LOADOUT consumables row build, candidates rendered first) |
| `gds-create-story` 10-9 | Second, straight after 10.1 lands |
| `gds-create-story` 10-8 | Owes the five lines' How-to-Play entries and the dated GDD / catalog-v3 / DESIGN.md stamps |

**Success criteria.** `epics.md` carries Story 10.9 and the corrected 10.1; `sprint-status.yaml` has the 10-9 row; amendment 2 holds every ruling above; `npm run check` green (docs only); both trackers diffed against PR #307's file list; Eric approves.

---
*Approval:* Eric, 2026-10-27 — "Yes, approved" (AskUserQuestion, after the batch summary in chat; the eleven §4 rulings by AskUserQuestion and chat the same session).
