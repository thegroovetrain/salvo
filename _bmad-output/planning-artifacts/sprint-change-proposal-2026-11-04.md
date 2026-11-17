# Sprint Change Proposal — 2026-11-04: The first-minute objective became the whole ocean — Epic 10 re-cut around the beacons / battleships / index slice

**Status:** APPROVED by Eric 2026-11-04 (gds-correct-course, batch mode — nine structural rulings by AskUserQuestion this session plus two added in chat while the edits were applied (the 10.4 design sitting; Story 10.13 The Sound Pass); every design clause below is Eric's ruling from the 2026-11-03 brainstorm, the 2026-11-03 forge, or this session; a clause with no ruling behind it is marked `[unruled]` or `[reading]`)
**Trigger:** Eric, 2026-11-04, invoking the correct-course on Epic 10: *"the brainstorm for the first minute objective obviously became much, much bigger. Time to work literally all of it into the plan."* The forge's sequencing lock (2026-11-03, after close): *"the beacons-first 10.8 is withdrawn. The WHOLE slice (beacons, airdrops, index model, four battleships, kit retire, bots) goes to gds-correct-course NOW as one piece."*
**Author:** Developer agent with Eric
**Sources of record:** `_bmad-output/brainstorming-session-2026-11-03.md` (70 ideas, numbered `#N` below), `_bmad-output/forge/beacons-battleships-index/forged-idea.md` + `.memlog.md` (the HARDENED locks, cited as "forge")
**Renumbered the same day (Eric, after the merge of PR #315):** the story numbers below are the FINAL ones — done work first in the order it was done, then the live stories in build order, the cancelled pair at the tail. Old → new: 10.1 → 10.1, 10.9 → 10.2, 10.10 → 10.3, 10.11 → 10.4, 10.12 → 10.5, 10.13 → 10.6, 10.4 → 10.7, 10.2 → 10.8, 10.14 → 10.9, 10.3 → 10.10, 10.6 → 10.11, 10.15 → 10.12, 10.16 → 10.13, 10.8 → 10.14, 10.5 → 10.15 (cancelled), 10.7 → 10.16 (cancelled). PR #315 landed the old numbers; the renumbering PR corrected every Epic 10 artifact.
**Predecessors:** `sprint-change-proposal-2026-10-25.md` (the roadmap rebuilt; Epic 10 The Playtest Pass), `sprint-change-proposal-2026-10-27.md` (Story 10.2 inserted)

---

## 1. Issue Summary

**Problem statement.** Story 10.8's design sitting (2026-10-25 ruling: *"a design sitting before any story"*) was meant to fill one slot: something to sail toward in the first minute. The sitting and the forge that followed produced an interlocked rework of the ship, the ocean and the kit instead. Six premises came out of the forge with Eric's own rulings on each:

1. **Drones are retired.** Eric's symptom, verbatim gist: they work as built; *"a lot of ships, can't tell player from drone (intentional, but the map feels busy), still having to hunt them, and they do NOT draw players into conflict with each other effectively."* Radio beacons are the hypothesis tested against that. Drones may return as beacon GUARDS if beacons alone are good but boring.
2. **Radio beacons at 8/4/2 per ring cycle, the pot SPLITS** among every hull in range (forge overturns #12 full rate). King-of-the-hill rejected. Fewer beacons (6/4/2) tabled.
3. **The index stat model:** every hull 1000 HP shown as 0–100 %; every stat an index around 100 with Bismarck as the 100 ship; costs accepted — *"we'll rescale everything."* Ramming mass = Armor. The HUD shows whole-number percent only.
4. **Four battleships replace the three classes** — Yamato, Bismarck, HMS Warspite, USS Iowa; the fast-and-fragile verb is gone on purpose; RUDDER is a new index stat.
5. **156 airdrops stay, +1..+5, as flavor:** litter on purpose, never a route.
6. **The kit is retired** — too many buttons, not broken; healing stays scarce (Hull Repair on a LONG cooldown is the one heal; passive healing dies).

**What it collides with.** Epic 10 as written (2026-10-25 / 10-27). Stories 10.1 and 10.2 (BUILT, cycles 207–210, PRs #309–#312) are undone by the kit retire. 10.15 and 10.16 are deck-gun stories and the deck-gun pick is tabled. 10.7's offer law names "1× Consumable", a type that stops existing. 10.8 is the empty slot. 10.10, 10.11 and 10.14 survive. Epics 11–13 are untouched in content and number.

**Issue type.** Strategic re-plan from the stakeholder (a new design of the ship, the ocean and the kit, discovered inside a design sitting). Not a technical limitation, not a misunderstanding, not a failed approach — the forge records that drones and the kit *work*; they are replaced for a design reason Eric named.

**Evidence (what the code says today, verified this session).**
- `shared/src/constants.ts`: `SHIP_CLASS_IDS = ['torpedoBoat', 'battleship', 'mineLayer']` (SPEEDBOAT / DREADNOUGHT / REPEATER) at 300 / 350 / 300 hp; `CONFIG.fleet.composition { large 1, medium 2, small 3 }` and `xp.droneTierLevels` pay drone kills in levels; `CONFIG.zone.beatMs` 60000 with a four-beat ring group (clear → reserved SUPPLY slot → reveal → close), full closure 12:00 — beat 2 is the empty slot the beacon surfaces into. `PROTOCOL_VERSION` 94, `VERSION` 0.19.4.
- The slice reaches ~12,600 lines: `server/src/game/ai/*` (15 files), `shared/src/sim/stats.ts` (868, the one fold), `catalog.ts` (1,111), `effects.ts` (354), `client/src/ui/classSelect.ts` (1,058, the class cards + DECK GUN chips + the 10.1 CONSUMABLES row), `server/src/game/drones.ts`, `decoys.ts` (the 10.2 buoy store).
- The HULL POINTS ladder (+50 maxHp per card), the PASSIVE HEALING ladder and the 2 %/s out-of-combat regen, the SHIELD BLOCK channel, the deck-gun lines (CANNON / MACHINE GUN / FLAK, five tiers each) and the ten consumable lines on keys 1–4 are all live and all named dead or tabled by the forge.
- The 9.5 ramming law reads mass from `effectiveStats().maxHp` (verified by the forge, constants.ts:2180); under flat 1000 HP every hull weighs the same — hence "mass = Armor".
- The 9.9 Armor Piercing gate nets victim Armor minus attacker Power, so an average pair (100 vs 100) sits at today's base; the index model does not halve the ARMOR card (forge: Cloud's crack dissolved).

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| **Epic 10 The Playtest Pass** | **RE-CUT around the slice** (Eric 2026-11-04, AskUserQuestion: *"Re-cut Epic 10 around it"*). Keeps its name and its surviving stories; the slice's stories are 10.3–10.9, 10.12 and 10.13 (final numbers after the same-day renumbering); 10.15 and 10.16 are CANCELLED; 10.1 and 10.2 carry dated RETIRED-BY notes (built, then undone by 10.5); 10.7 is re-cut; 10.14 widens. |
| Epic 11 The Ledger | Unchanged in content and number. `MatchRecord` will carry whatever the slice adds (hull, Shift pick, equipment slots, index stats at end, beacon XP, airdrops taken) before the store exists — no schema churn later. |
| Epic 12 The Front Door | Unchanged. |
| Epic 13 The Account | Unchanged in number. 13.4 The Ship Screen and 13.6 Tokens, XP and Unlocks inherit four hulls + a Shift pick + equipment lines instead of three classes + a gun pick + consumables; no text change now, 13.11 reconciles. |

**Sequence (Eric 2026-11-04, AskUserQuestion): the 2026-10-25 order HOLDS — 10 (with the slice) → 11 → 12 → 13.** Rejected: the Front Door or the Ledger jumping ahead.

**Release posture (Eric 2026-11-04, AskUserQuestion): ONE UNIT.** Each slice story lands on `development` as its own PR and build cycle; **production receives nothing until the whole slice has had its staging pass** — the Epic 8 + 9 *"go big or go home"* posture. Rejected: release per story. The version number at that production release is Eric's call then, not this proposal's.

### Story impact — Epic 10 after this proposal

Build order (Eric 2026-11-04, AskUserQuestion: *"Yes, that order"*): **10.3 → 10.4 → 10.5 → 10.6 → 10.7 → 10.8 → 10.9 → 10.10 → 10.11 → 10.12 → 10.13 → 10.14.** Rejected: beacons first on today's classes; hulls before the index.

| # | Story | Status after this proposal |
|---|---|---|
| 10.1 | Four Configurable Consumable Slots | BUILT (cycle 207). **Dated note: RETIRED when 10.5 lands** — the CONSUMABLES row, picker, kit and keys 1–4 go. History stands. |
| 10.2 | The Flash Shell and the Four Buoys | BUILT (cycles 208–210). **Dated note: RETIRED when 10.5 lands** — the four buoys are TABLED (#62: maybe later as random map spawns); FLASH SHELLS survives as a special-shell option keeping amendment 5's whiteout; SUPERCAVITATING TORPEDO survives as a torpedo option (#61). |
| **10.3** | **The Index Model** (floor, A) | NEW. 1000 HP, every stat an index, RUDDER, HULL POINTS + passive healing dead, ramming mass = Armor, HUD 0–100 %. |
| **10.4** | **The Four Battleships** (B) — DESIGN SITTING FIRST (ruling 10) | NEW. Yamato / Bismarck / Warspite / Iowa replace the three classes; turret layouts, per-turret cooldowns, fore/aft arcs, arc-click-reload, uniform secondaries on right click; the deck-gun pick is tabled; Shift is the pre-queue pick. |
| **10.5** | **The Kit Retire and the Three Equipment Slots** (C) | NEW. Consumables dropped; HULL REPAIR (C) and SMOKE (V) universal cooldowns; torpedo / mine / special-shell slots on Q / E / R, ready-and-click; buoys, shield, decoy tabled. |
| **10.6** | **The Catalog Under the Index** (D) | NEW. +20 flat index cards; equipment lines fill and tier the three slots; HULL POINTS / PASSIVE HEALING / deck-gun / consumable lines leave the deal; Power-on-equipment and Armor-against-equipment as a TEST BOTH dial. |
| 10.7 | Offer Composition | **RE-CUT** (Eric 2026-11-04): **Ship / Equipment / wildcard / wildcard**, type-first, exhausted types fall back exactly as his 2026-10-25 example. Built straight after 10.6. |
| **10.8** | **The Radio Beacons** (E) — replaces the empty slot heading, as the 2026-10-25 ruling said it would | NEW. 8/4/2, global from the cycle's 0:00, surfaces at 1:00, 500 u, 2 levels/min fresh ticking to zero at 3:00, pot splits, placed by the fleet-spawn rule, no guards, no outer ring; **drones retired here**. |
| **10.9** | **Airdrops** (F) | NEW. 2 per minute remaining to 12:00 (156), +1..+5 of a random index stat, sail-over, permanent, radar-painted by imprint, storm-destroyed, wreckage leaves a bundle; flavor, never a route. |
| 10.10 | The Battle UI — XP Seen, the Offer in the Corner | Survives as written; its corner cards show the 10.7 slot kinds (Ship / Equipment / wildcard). |
| 10.15 | Flak Takes No Range Dropoff | **CANCELLED** (Eric 2026-11-04) — the deck-gun pick is tabled (#25); the per-gun attenuation idea is recorded as tabled with the guns. |
| 10.11 | Bots Fill the Standard Queue at 1:00 | Survives as written. |
| 10.16 | The Machine Gun — Steepest Dropoff, High Explosive | **CANCELLED** (Eric 2026-11-04) — same reason; HE-on-a-ladder recorded as tabled with the guns. |
| **10.13** | **The Sound Pass** | NEW (Eric 2026-11-04: *"a sound design pass needs to happen, too. I want engine sounds and more realistic sounds overall."*). Synthesis only, made realistic (the GDD's tones-only rule stands); engine sounds per hull, realistic cues for guns / secondaries / equipment / hits / beacons / airdrops; every cue auditioned by Eric before commit. Lands after 10.12, before 10.14. |
| **10.12** | **Bot Posture Under the Four Hulls** | NEW (Eric 2026-11-04: *"bots sail in every story + one posture story at the end"*). Every slice story keeps bots functional on what it changes (smokes stay green); this story tunes arcs, per-turret rhythm, secondaries, mine sweeping, beacon farming and contest, airdrop pickup, equipment use, Hull Repair timing, Shift pick. |
| 10.14 | How-to-Play and Record | Survives, **widened**: the four hulls, the index model and the percent bar, turrets / arcs / secondaries, the three equipment slots and keys Q / E / R / C / V, HULL REPAIR and SMOKE as cooldowns, the beacons, the airdrops, the retirements (classes, deck guns, consumables, buoys, drones, passive healing, HULL POINTS, SHIELD BLOCK); the GDD mechanics stamps for everything this slice supersedes. |

Design numbers are settled **at each story's spec step with Eric via AskUserQuestion**, never by the spec author (standing, amendment 1(m)). Every number in the brainstorm's ship table and the beacon / airdrop rates is a placeholder for Eric's harness session (brainstorm Open Thread 4).

### Artifact conflicts

| Artifact | Conflict | Change (this PR) |
|---|---|---|
| `epics.md` | Epic 10 list entry and intro describe the 2026-10-25 shape; 10.8 is the empty slot; 10.7 names "1× Consumable"; 10.15 / 10.16 live; 10.1 / 10.2 read as current; 10.14's list is the old one; no slice stories | Epic 10 list entry + intro gain a dated paragraph; 10.1 and 10.2 gain dated RETIRED-BY notes; 10.8 heading and body REPLACED by The Radio Beacons; 10.7 gains the re-cut law with a dated note; 10.15 / 10.16 headings marked CANCELLED with the reason; 10.14 AC widened; the seven slice stories added in the house shape with the build-order note (renumbered the same day) |
| `gdd.md` Development Epics | E10 row describes the 2026-10-25 shape | Dated clause appended to the E10 row. **Mechanics sections (Ship classes, Weapon Systems, Consumables, Flat damage model, Enemy Design / drones, Economy) are NOT rewritten here** — dated supersession stamps land at 10.14 (the amendment-89(k) pattern). Success-metric line "All three classes see real pick rates" is stamped at 10.14 too (four hulls). |
| `catalog-v3.md` | 29 lines / 114 cards; deck guns, consumables, HULL POINTS, PASSIVE HEALING | Untouched now; dated addendum at 10.14 (10.6 writes the new catalog) |
| `DESIGN.md` / `EXPERIENCE.md` | class cards ×3, DECK GUN chips, consumable strip, 10.1 CONSUMABLES row, buoy glyph family, HP bar as hp | Untouched now; each slice story re-cuts its surface with a RENDERED candidate shown to Eric first and stamps the rows it changes (standing rule) |
| `game-architecture.md` | three classes, the drone fleet, the consumable pool | Untouched now; dated notices owed to 10.14 (10.8's beacon transport reading below is confirmed there) |
| `sprint-status.yaml` | `epic-10` block = the 2026-10-25 / 10-27 shape; `10-1` says review (PR #309 merged 2026-10-28); `10-8-the-first-minute-objective` | One-line stamps: `epic-10` re-cut; `10-1` → done + RETIRED-BY note; `10-2` RETIRED-BY note; `10-8` key → `10-8-the-radio-beacons` (was `10-8-the-first-minute-objective`); `10-7` note; `10-15` / `10-16` → cancelled; `10-14` note; `10-3` … `10-12` added as backlog |
| `gds-workflow-status.yaml` | `correct-course` line, `next_expected`, `last_updated` | One-line stamps |
| `epic-10-context-amendments.md` | amendments 1–5 | Amendment 6 = this proposal's rulings (every lock of the forge restated as a numbered sub-clause so a story author never has to read the memlog) |
| `deferred-work.md` | nothing owed by this slice yet | Append-only: ONE dated entry — 10.1 / 10.2 undone by 10.5 (the built surfaces whose retirement 10.5 owns), the four open threads carried out of the brainstorm (radar noise without drones; Power / Armor on equipment; buoys as map spawns; the number placeholders) with their owning stories; the "Eric's call" list lines that now have a home |
| Identity-fork forge (`forge/identity-fork/forged-idea.md`) | lock 1 "classes MUST differ", lock 6 noise principle, lock 7 "a battleship paints bigger" | Not edited (forge records are sealed). Honored or superseded as follows: lock 1 by layout identity (forge 2026-11-03: *lasting identity = layout only*); lock 6 by the drone retirement; lock 7 is MOOT (all four hulls are battleships) — recorded in amendment 6 |
| Code | none | docs only; no version bump, no PV bump, no cycle |

### Technical impact

None in this PR. Downstream, per story (the implementer's map, not rulings):

- **10.3** rewrites the stat shape in `CONFIG.shipClasses` and `effectiveStats()` (the one fold, both sides); every weapon damage becomes a share of 1000; Reload becomes a multiplicative law; the HP bar and every hp readout become percent; the ramming mass term changes; HULL POINTS / PASSIVE HEALING / regen removed. `PROTOCOL_VERSION` bumps (the client reads the stat block). Today's three classes are expressed as index offsets as a SCAFFOLD so the game plays between 10.3 and 10.4 `[reading]`.
- **10.4** replaces the class table with four hulls; new per-turret cooldown state and per-turret arcs in shared sim (prediction must match: turret state rides the own-ship frame); a second weapon (secondaries) on right click; the DECK GUN pick leaves the seat and the Shift pick takes it (join options + sanitizer); class-select re-cut (rendered candidate first); bots aim and fire through arcs at minimum. PV bumps. Radar imprint per hull (`silhouette.ts`) re-cut for four battleships.
- **10.5** removes the consumable system (kit, keys 1–4, belt, picker, `ai/consumables` weights), adds two universal cooldowns and three equipment slots with the ready-and-click state machine in `game/inputs.ts`; FLASH SHELLS keeps amendment 5's whiteout as a special-shell option; buoy store retired (code kept or deleted is the implementer's call — the catalog ids leave the deal). PV bumps.
- **10.6** rewrites `catalog.ts` lines and `sim/draw.ts` pools; 10.7 then rewrites the composition plan. PV bumps (catalog content is wire contract).
- **10.8** adds a world object (beacons) and removes one (drones, `drones.ts`, fleet waves, `droneTierLevels`, the fleet smokes re-scripted); beacons pay XP per tick through the existing XP path; **transport — RULED by Eric 2026-11-04 (AskUserQuestion: *"Like the zone rings, via the schema"*; rejected: a seventh perception exception; deciding at the spec step):** beacons are GLOBAL world facts by design (*"every captain hears the beacon at the cycle's 0:00"*, #9) and travel like the revealed zone rings — through the Colyseus schema, NOT through per-client frames — so the per-ship perception invariants and the SIX exceptions are untouched; `game-architecture.md`'s "the schema syncs only the roster, the revealed zone rings, matchPhase and bountyId" gains "and the live beacons" with a dated notice at 10.14.
- **10.9** adds a second world object (airdrops) seen through ordinary perception (sight for the glyph, radar imprint for the blip) — no exception; pickup is a collision event through the existing own-ship channel.
- **10.12** is server-only (`server/src/game/ai/`), bots still may not import `world.js`.
- **10.10 / 10.11 / 10.14** as already planned.

## 3. Recommended Approach

**Direct adjustment, large.** Epic 10 is re-cut in place: seven stories added, two cancelled, one replaced in its slot, one re-cut, two built stories marked retired-by. No rollback — nothing built is reverted by this proposal; 10.5 retires the 10.1 / 10.2 surfaces as a forward change when it lands. MVP: the GDD's goals stand (one ship per player, last hull floating wins, two-tier fog, the shrinking storm); Pillar 3's "the promise" is kept by layout identity. Effort: Low for this proposal (docs); the slice is the largest build since Epic 8 and is Eric-paced. Risk: Medium — the index model touches every damage number at once (mitigated by landing it FIRST as a floor with the three classes scaffolded onto it, so every later story is measured on the new ruler); the release posture (one unit) keeps production on 0.19.4 until the slice is whole.

Rollback and MVP review were evaluated and rejected: nothing shipped needs reverting, and the goals stand.

## 4. Decisions ruled by Eric in this proposal (2026-11-04, AskUserQuestion)

1. **Batch review** of the edits.
2. **Epic shape: re-cut Epic 10 around the slice** — the slice replaces 10.8 and takes 10.3+; invalidated stories cancelled with dated notes; 10.10 / 10.11 / 10.14 keep their numbers; Epics 11–13 unchanged. Rejected: a new Epic 11 after Epic 10 (shifting the Ledger / Front Door / Account right); closing Epic 10 now.
3. **10.15 and 10.16 CANCELLED**; the ideas (per-gun attenuation, High Explosive on a ladder) are tabled with the deck guns. Rejected: re-aiming them at the new weapons; keeping them in the backlog.
4. **Release posture: one unit** — every story its own PR / cycle on `development`; production gets nothing until the whole slice has had its staging pass. Rejected: release per story.
5. **10.7 Offer Composition re-cut: Ship / Equipment / wildcard / wildcard** — two guaranteed kinds (ship index cards; equipment cards = fills and tier-ups of the torpedo / mine / special-shell slots) and two wildcards rolled type-first; an exhausted type falls back to the others as Eric's 2026-10-25 example shows. Rejected: Ship / Equipment / Equipment-or-Ship / wildcard; deciding at the catalog story's spec step.
6. **Epic order holds: the slice first**, then the Ledger, the Front Door, the Account. Rejected: the Front Door jumping ahead; the Ledger jumping ahead.
7. **Bots: sail in every story + one posture story at the end (10.12).** Rejected: one bot story built last with bots left minimal; bots fully owned per story with no closing story.
8. **Build order: 10.3 → 10.4 → 10.5 → 10.6 → 10.7 → 10.8 → 10.9 → 10.10 → 10.11 → 10.12 → 10.13 → 10.14.** Rejected: beacons first on today's classes; hulls before the index.
9. **Beacon transport: like the zone rings, via the Colyseus schema** — beacons are global world facts, so the six perception exceptions stay six and the per-ship invariants are untouched; `game-architecture.md`'s schema sentence gains "and the live beacons" with a dated notice at 10.14. Rejected: inside per-client frames as a seventh exception; deciding at 10.8's spec step.
11. **Story 10.13 The Sound Pass is ADDED** (Eric 2026-11-04, chat: *"a sound design pass needs to happen, too. I want engine sounds and more realistic sounds overall."*; AskUserQuestion): **synthesis only, made realistic** — the GDD's "WebAudio tones only, no sound files" stands and the pass pushes synthesis toward realistic engines, guns, water and hits (rejected: recorded samples; deciding at the spec step); **lands after 10.12, before 10.14** (rejected: right after 10.4; last after 10.14); every cue is auditioned by Eric on an artifact page from the real audio modules before commit.
10. **Story 10.4 needs a DESIGN SITTING FIRST** (Eric 2026-11-04, in chat while the edits were being applied: *"The transition to historical ships also will require a design session as these are being modeled on real-world historical battleships, so they need accurate topdown profiles, as well as accurate deck gun placements and arcs."*): before 10.4's create-story, a sitting with Eric produces each ship's top-down hull profile at the game's scale, its turret positions and the per-turret arcs from real naval drawings, rendered as an artifact for his yes; the output is the spec input for the hull sprites, the radar silhouettes (`silhouette.ts`) and the arc tables. It may run while 10.3 is built.

**Carried from the brainstorm and the forge (Eric's, 2026-11-03; restated in amendment 6, never re-asked):** the six premise rulings in §1; lasting identity = layout only, stats are a head start; secondaries uniform; rhythm is the player's; mines hurt by secondaries only; right click = secondaries OR cancel a readied Q / E / R, a readied torpedo blocks secondaries; cards +20 flat, not ship-flavored; cards are the only way to fill a slot; any ship may take any Shift from boost / hunker / instant reload; Intel = sweep RPM (100 = 15 RPM, linear); Range IS an index; beacons global from 0:00, surface at 1:00, 500 u, 2 levels/min fresh ticking to zero at 3:00, no outer ring, farming not loud, placed by the fleet-spawn rule, the standoff stands; airdrops 156 / +1..+5 / uncapped / permanent / sail-over / storm-destroyed / wreckage bundle / biased away from beacons / radar-painted by imprint; no turret hit zones; no aircraft; HUD percent only; ramming mass = Armor.

**Open threads carried (owned, not deferred as gaps):** radar noise without drones → tested on 10.8's staging (#65); Power on equipment / Armor against equipment → a TEST BOTH dial in 10.6, decided on staging (#52 / #53); buoys as random map spawns → tabled, no story (#62); the airdrop glyph needing sight while radar gives only "a crate" → `[unruled]`, 10.9's spec step; FOULING SHELL's fate (a special-shell option is the reading) and which mine kinds survive → 10.6's spec step; what a drone drops between 10.5 and 10.8 (consumables are gone, drones are not yet) → `[reading: drones pay XP only in that window]`, 10.5's spec step.

## 5. Implementation Handoff

**Scope: Major** (an epic re-cut with seven new stories; no code in this PR; the design is complete in the brainstorm + forge and needs no further sitting).

| Who | Does |
|---|---|
| This run (docs PR) | The artifact edits in §2, this file, `epic-10-context-amendments.md` #6, the ledger entry, both tracker stamps; ONE PR to `development`; **never merged without Eric's say-so** |
| Eric | Approves this proposal; merges the PR; rules every number at each spec step; runs his harness session for the ship table and the beacon / airdrop rates when 10.3 / 10.4 / 10.8 are created |
| `gds-create-story` 10-3 | First: The Index Model |
| The 10.4 design sitting (with Eric; may run beside 10.3) | Top-down profiles, turret placements and arcs of the four ships from real drawings, rendered for his yes — the spec input of 10.4 |
| then 10-4, 10-5, 10-6, 10-7, 10-8, 10-9, 10-10, 10-11, 10-12, 10-13, 10-14 | In that order; each via `/gds-dev-story` + `/orchestrate` per Eric's standing instruction |
| `gds-sprint-planning` | NOT re-run — the tracker is edited in place here (checklist 6.4) |

**Success criteria.** `epics.md` carries the re-cut Epic 10 (10.1–10.16 with the statuses above); `sprint-status.yaml` matches it row for row; amendment 6 holds every ruling and every forge lock; `npm run check` green (docs only); both trackers diffed against PR #314's file list to prove the stamp rule held; Eric approves.

---
*Approval:* Eric, 2026-11-04 — "Yes, approved" (AskUserQuestion, after the batch summary in chat; the nine §4 rulings by AskUserQuestion the same session).
