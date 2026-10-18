# Sprint Change Proposal — 2026-10-06: Epic 9 "Tune and Clean" inserted before The Account

**Status:** APPROVED by Eric 2026-10-06 (gds-correct-course, incremental mode)
**Trigger:** Epic 8 retrospective, 2026-10-06 (`epic-8-retro-2026-10-06.md` §6, action item 1; epic-8 amendment 243)
**Author:** Developer agent with Eric (every design clause below is Eric's ruling from this session; nothing is invented here)
**Predecessors:** `sprint-change-proposal-2026-07-19.md`, `-2026-08-18.md`, `-2026-09-21.md`

---

## 1. Issue Summary

**Problem statement.** Epic 8 (The Pool) closed accepted at 0.18.33, in production since 2026-10-02. At the retro Eric ruled: *"I think we are going to insert a new epic before adding accounts to zero in on a few things and clean up the tests so that they are purposeful."* The things to zero in on are game balance and features: *"The TTK is still far too short, and it can be difficult to escape from combat. I also want to add some more consumables and more ways to heal."*

**Discovery.** Eric playing the staging and production builds through Epic 8's twelve interstitial cycles; the three review hunters flagging the same vacuous-test shape six times (word-police test, fogSmoke tautology, 160-tick leader pin, geometry-as-perf pins, smoke fixtures, phantom height raster); spec 8-16's "2,000 fuzz worlds" being 20.

**Evidence.** `epic-8-retro-2026-10-06.md` §3 (Challenges) and §6; epic-8 amendments 211, 176, 223f, 224f, 231l; `batch-sim-evidence-2026-10-01.md` §5 (Eric: gun balance by math, sim for attrition and class share only); the twelve "follow-up review recommended" flags with no follow-up run; matchSmoke / weaponsSmoke flake history (8-1/8-2/8-3, 8-14, 8-16, 8-17, 8-18).

**Issue type.** New requirement from the stakeholder (balance + two to three new consumables) plus a quality fix (test debt) — not a misunderstanding, not a technical limitation, not a pivot.

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| Epic 8 The Pool | CLOSED 2026-10-06; untouched. |
| **New Epic 9** | Inserted. Working label "Tune and Clean" (Eric: the name is irrelevant). Eight stories, build order below. |
| Epic 9 The Account → **Epic 10** | Renumbered only. Ten live stories 9.1–9.11 (9.5 deleted) become 10.1–10.11 (10.5 deleted) with their text unchanged; 10.11 Design & Doc Reconciliation widens from "Epics 8–9" to "Epics 8–10" so Epic 9's rulings are written back by the same story. Every known gate recorded for The Account stands (anonymous-play-on-production is Eric's open question; drizzle-kit pin; undesigned 10.4 / 10.9; `[DRAFT]` prices; AccountWriter queue; PII scrubbing). |

**Dependencies.** The new consumables (Speed Boost, Healing Buoy, optional Depth Charge) are catalog lines; The Account's unlock surfaces (10.6: lines whole, guns, hulls) absorb them with no story change. The Account's LOADOUT screen (10.4) lists lines from the catalog, so it needs no edit either.

**Resequencing.** 8 → 9 (Tune and Clean) → 10 (The Account). Eric's order inside Epic 9: balance and features FIRST, then the test audit and the fixes (*"The tuning pass and new stuff are going to happen before the test audit and other fixes."*).

### Story impact — Epic 9 stories (Eric-ruled 2026-10-06)

| # | Story | Eric's ruling of record |
|---|---|---|
| 9.1 | **The Tuning Pass** (Eric steers) | *"I have my own ideas for some fixes. We simply want to have a story dedicated towards adjusting this, and I will steer it there. Hull HP is one metric to tweak, but I also want to play with the size of the map, the proportion of islands and landmasses, and perhaps even switching from one ring of 20 spawns around the outside, to one outer ring of 12 and one inner ring of 8, just to mix things up."* Escape: the main reason is **too few escape tools**. Standing: guns by Eric's math, never by sim (2026-10-02); sim is for attrition and class share only; quick runs ≤ 99 matches, never unprompted. |
| 9.2 | **Speed Boost Consumable** | *"a Speed Boost consumable to aid in getting away (probably stronger than Speedboat's boost)."* **Stacks** with the Speedboat's Shift boost — both multipliers apply at once. Numbers (factor, duration, cap) are Eric's at spec time. Bots take it by the 8-20 rule in the same story. |
| 9.3 | **Healing Buoy** | *"a Healing Buoy that grants passive healing in a radius around it to all ships in range."* **Neutral**: every hull in range heals, the enemy included. **Expires** after a set time; **shootable like a mine** (10 hp, hurt only by a deck gun shell landing on it); **visible on radar and in sight like the decoy buoy**; **dropped by a click astern like the decoy**. Radius, duration and heal rate are Eric's at spec time. Bots in the same story. |
| 9.4 | **Depth Charge** (OPTIONAL — Eric: *"Maybe we can add the Depth Charge, idk."*) | The `depthCharge` stub consumable line exists since amendment 83 (*"Depth charge will be a CONSUMABLE. not a line."*); its mechanism is undesigned and Eric's. The story opens with an AskUserQuestion design sitting; if Eric cuts it the line stays a stub for a later epic. |
| 9.5 | **Test Purposefulness Audit** | Every test names the contract of the function under test it guards, or is deleted — never vocabulary, copy strings, wall-clock timing, or geometry standing in for a perf claim (project-context.md agreement, retro action 3). Audit record with kept / deleted counts per workspace; the five reviewer-flagged tests and the word-police test; the 8-16 fuzz count corrected. |
| 9.6 | **Smoke Flakes Fixed** | matchSmoke and weaponsSmoke rewritten so the outcome never depends on bot piloting; done = three clean first-try runs (retro action 7; Epic 7 "flake is P1" agreement). |
| 9.7 | **Harness and Ledger Hygiene** | Retire the two 6-4 bot bars in `botReport.ts` (retro action 6, twice missed); deferred-work triage — every open entry re-stamped open / resolved / moot (retro action 8); the 12 "follow-up review recommended" flags run or the flag dropped from the spec template (retro action 5, Eric's call per flag); the `shared/src/index.ts` barrel comment that still says `sim/deck.ts` is the engine. |
| 9.8 | **How-to-Play and Record** | How-to-Play entries for every new item in Eric's copy (new-feature explanations go to How-to-Play only); the two How-to-Play debts already owed — private lobbies (amendment 235) and drone drops (226g); the GDD E9 row and dated supersessions for whatever 9.1 changed; both tracker stamps. |

Design numbers for 9.2 / 9.3 / 9.4 are settled **in each story's spec step with Eric via AskUserQuestion**, never by the spec author — Eric's choice this session.

### Artifact conflicts

| Artifact | Conflict | Change |
|---|---|---|
| `epics.md` | Epic List and §Epic 9 say The Account; Extension paragraph says 8 + 9 "ship as ONE unit before the traffic push" | New Epic 9 entry + section; Account → Epic 10 (10.1–10.11); dated note on the one-unit paragraph (0.18.33 shipped 2026-10-02 without accounts — Eric's call, see §4) |
| `gdd.md` Development Epics | E9 row = The Account; sequence line ends at E9; Assumptions "E9 depends on it" | New E9 row; Account row → E10; sequence → E8 → E9 → E10; Assumptions line → E10 |
| `game-architecture.md` | 28 "E9" references in the dated 2026-09-09 Account Store amendment | History stays as written; a dated renumbering notice is added beside the existing amendment notice |
| `DESIGN.md` | Forward pointers "not built — Story 9.4 / 9.6" | → 10.4 / 10.6 (live pointers to unbuilt stories) |
| `EXPERIENCE.md` | "E9 The Account" in dated v3 stamps | History; one-line note in the v4 stamp |
| `sprint-status.yaml` | `epic-9` block = The Account | New `epic-9` block (backlog, 9-1..9-8); Account block → `epic-10` with `10-N` keys; one-line stamp |
| `gds-workflow-status.yaml` | `correct-course` line, `next_expected` | One-line stamps |
| `deferred-work.md` | 215 references to Epic 9 / 9.x meaning The Account | Append-only ledger: one dated renumbering entry; old text stands |
| `epic-9-context-amendments.md` | does not exist | Created; amendment 1 = this proposal's rulings |
| GDD decision-log, catalog-v3, past proposals, epic-8 amendments | historical | untouched |
| Code | none | no code change; no version bump, no PV bump (docs only) |

### Technical impact

None in this PR. Downstream: 9.3 adds a world entity (the buoy) and new perception rows — the signal registry gets the rows, the frame invariants are EXTENDED for them, and the master invariant keeps exactly SIX exceptions (no seventh without an Eric ruling). 9.2 touches `effectiveStats()` / `boostedKinematics` only through the one fold. 9.1 may move `CONFIG` values and map-gen parameters; `PROTOCOL_VERSION` bumps only where the client reads a changed block. New card glyphs are rendered and shown to Eric before commit.

## 3. Recommended Approach

**Direct adjustment.** Add the epic, renumber The Account, no rollback, MVP unchanged. Effort: Low for this proposal (docs); the epic itself is Eric-paced. Risk: Low; the only risk is the renumbering leaving a stale "Epic 9 = Account" sentence somewhere — mitigated by the table above and by 10.11's reconciliation.

Rollback and MVP review were evaluated and rejected: nothing shipped needs reverting, and the GDD's goals are unchanged.

## 4. Decisions still Eric's in this proposal

1. The epics.md Extension paragraph ("shipped as ONE unit before the traffic push") — **RULED 2026-10-06: left standing; only the renumbering is noted.**
2. Depth Charge in Epic 9 as 9.4 (optional) — keep or cut at story time.

## 5. Implementation Handoff

**Scope: Moderate** (backlog reorganization; no code).

| Who | Does |
|---|---|
| This run (docs PR) | The artifact edits in §2, the proposal file, `epic-9-context-amendments.md` #1, both tracker stamps; ONE PR to `development`; **never merged without Eric's say-so** |
| Eric | Approves this proposal; merges the PR; rules numbers at each story's spec step |
| `gds-create-story` 9-1 | First story; Eric steers the dials live |
| `gds-sprint-planning` | NOT re-run — the sprint tracker is edited in place here (checklist 6.4) |

**Success criteria.** Every planning artifact says Epic 9 = Tune and Clean and Epic 10 = The Account; `npm run check` green (docs only); both trackers diffed against PR #257's file list to prove the stamp rule held; Eric approves.

---
*Approval:* Eric, 2026-10-06 — "Yes, approved" (AskUserQuestion, incremental review of every artifact group).
