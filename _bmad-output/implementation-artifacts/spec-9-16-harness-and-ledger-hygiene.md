---
title: 'Story 9.16: Harness and Ledger Hygiene'
type: 'record-hygiene'
created: '2026-10-23'
status: 'review'
baseline_revision: '4c7b9af9'
final_revision: 'd964bb25 (code HEAD; docs commit follows; PR to development, 2026-10-23)'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/9-16-harness-and-ledger-hygiene.md'
---

# Story 9.16 — Harness and Ledger Hygiene (cycle 206, 0.18.71, PV 91 unchanged)

## Intent

Two records lied by omission: the batch-sim harness printed PASS/FAIL on two bot-quality bars Eric retired on 2026-08-27, and the deferred-work ledger carried 443 entries nobody had re-read since they were written (five epics of carried triage). A third record, the "follow-up review recommended" flag, sat on ~60 specs with zero follow-ups ever run. A fourth, the shared barrel's history, named an engine file deleted at Story 8.14. This story makes each say only what is still true, without rewriting a word of what was once true. No gameplay change; PV stays 91. Eric's eight rulings at dev-story start and the two from the triage are in epic-9 amendment 215.

## What changed

**Harness.** `botReport.ts` loses the any-kill (≥ 60 %) and storm-death-band (5–20 %) bars, their thresholds, the aggregate fields and the per-group `kill%` column; `stormDeaths` stays as the count on the `deaths:` line; four bars remain PASS/FAIL under the same heading. `botHarness.test.ts` loses the storm-band pin. `main.ts` loses a stray `return out;` from a `void` function, so `npx tsc -p server/scripts/batchsim/tsconfig.json` is clean (kept OUT of `npm run check` — Eric). `botReadoutReport.ts` comment: "six bars" → "the quality bars". Record lines appended (never rewritten) in `batch-sim-evidence-2026-09-30.md` (its question 3 answered), `balance-sim-harness-prep.md`, `epic-7-retro-2026-08-27.md` action 2 (`→ DONE`), and `.claude/skills/balance-sim/SKILL.md` (Eric's checkout; untracked).

**Ledger.** Nine Opus readers, one per line range (1–337, 338–681, 682–934, 935–1247, 1248–1568, 1569–1939, 1940–2340, 2341–2673, 2674–3167), read every entry that was OPEN or had no status line against the code and the record and returned a JSON of stamps; one script applied them bottom-up — a `status:` line INSERTED where none existed (245), the existing status value EXTENDED with the old value kept verbatim after `Was:` (201). Buckets: RESOLVED 107 · CLOSED — MOOT 48 · STANDING RECORD, NOT WORK 103 · open — Eric's call 68 · open — <owner> 120 (harness maintenance 21, 9.17 copy 14, perf on staging 10, Epic 10 8, test-gap fill 6, smoke rewrites 4, bot posture 4, the rest named files). A closing section under the ledger's own dated heading holds the counts table, the open-by-owner summary, the 68-line Eric's-call list (for one sitting — Eric ruling 7) and eight new entries: no healing-buoy / speed-boost pointer entries exist (the 2026-10-11 proposal assumed them); the flag retired; the 9.14 server and client test-gap lists re-homed; `npm audit --omit=dev` 29 production advisories (1 critical, 8 high) contradicting the Story 8.0 entry; two stale client comments; the decoy bodyblock gap. Three orchestrator stamps: the transport-coalescing entry whose 8.5 STAMPED text was a copy of its neighbour's; the Epic 4 retro's own "do this triage" meta-entry → RESOLVED; the ESLint entry's measured count.

**Flag.** Dropped as a category (Eric ruling 3): `followup_review_recommended` removed from `.claude/skills/bmad-dev-auto/spec-template.md` and the judgment + set line from `step-04-review.md` (Eric's checkout; untracked); a dated notice appended to the flag line of the 12 Epic-8 specs (8-1, 8-2, 8-4, 8-5, 8-6, 8-7, 8-13, 8-14, 8-15, 8-16, 8-19 same-line; 8-10 a new line under its findings paragraph); no frontmatter touched; the ~48 older `true` frontmatters stay as records (one ledger line). This spec carries no such key.

**Barrel and code.** `shared/src/index.ts` PV-16 history line gains `[2026-10-23, Story 9.16: sim/deck.ts and CONFIG.deck were retired at Story 8.14 (PV 57); the card engine is sim/catalog.ts + sim/effects.ts (model) and sim/offers.ts + sim/draw.ts (the draw).]`; the PV-55 line naming `sim/pool.ts` is a true past-tense record and stays. `world.ts` `fogCellEvals` comment names its live reader (`fogField.test.ts`). NEW contract test in `world.test.ts`: `game/world.ts` and `game/match.ts` import nothing from `colyseus` / `@colyseus/*` (`from`, bare `import`, `require(`, `import(` forms; non-vacuity against `rooms/ArenaRoom.ts`; mutation-checked on both files). `contactsAggro.test.ts` replaces a real `setTimeout(breakMs + 60)` with a `performance.now` spy (the driver reads it once per render; the test fails with the clock un-advanced). `batchSim.test.ts` derives the tune-family and `GUN_IDS` expectations from `isTuneKey` + CONFIG and the shared list; the old enumerated regex had silently omitted `bots.*`.

**Not built, stamped with an owner (Eric ruling 4):** the fogSmoke / combatSmoke / zoneSmoke rewrites (`open — own story: smoke rewrites`; soloSmoke and openingSmoke carry NO pilot — the 9.15 ledger entry was wrong); the ESLint un-ignore (measured on this branch: 288 test files, 123 errors — 73 no-unused-vars, 29 complexity, 21 no-restricted-syntax — 540 warnings, 0 auto-fixable); the test-gap fill (two ledger entries list every symbol).

## Rulings from the triage (Eric 2026-10-23, AskUserQuestion, before the PR)

- A DECOY BUOY that intercepts a cannon or flak shell takes the FULL burst damage, like a hull. Closes the clause epic-8 amendment 228 left "not yet asked"; the bodyblock work item may be built; the ledger entry is re-stamped RULED.
- The dependency sweep REPLACES 9.17's slot. Eric: *"We are going to move How to Play until later, I have feedback from my recent playtest that I'd like to iterate on. So, lets just replace 9.17."* This story only points the trackers at a correct-course; it does not renumber the epic.

## Review Triage Log

### 2026-10-23 — Gate (Fable hunter + Codex gpt-5.6-sol, same 309-line code diff)

Fable: BUILD-ON-IT, no CONFIRMED. One PLAUSIBLE — `botReadoutReport.ts:153` "beside the six bars" → fixed ("the quality bars"). Checked clean: no consumer of the deleted fields anywhere (server, batchsim, the balance-sim Python reads `byClass` / `endedBy` / `botsPerMatch`, never `bars`; `renderComparison` diffs match aggregates, not bot bars); the `performance.now` spy drives the real once-per-render clock, inversion impossible; the source-scan regex covers `import type`, multi-line, re-export, bare and dynamic forms and does not match the prose "Colyseus" mentions in `world.ts` / `match.ts`; production diff is comments only; `goldenFrames` byte-identical.

Codex: FIX-FIRST on one point — the derived tune-family check is partly tautological (message and `isTuneKey` both derive from `TUNE_FAMILIES`; a family silently DROPPED from the table is not caught). Fable raised the same reach limit as accepted cost. ADJUDICATED by the orchestrator: accepted. The project rule is derive-never-enumerate (Testing Rules, amendment 213); the enumerated regex it replaced broke on every family ADDED and had already drifted (it omitted `bots.*`); the set-equality half still catches a stale or typo'd family and a missing trailing dot. Codex PLAUSIBLE — regex blind spots (a comment inside an `import … from /* x */ 'colyseus'`, a computed `import(name)`) — accepted as unrealistic routes for Colyseus into the sim; recorded. Codex confirmed the other seven claims clean (no deleted-field readers, `stormDeaths` kept, spy not vacuous, GUN_IDS derivation useful, production = comments + an unused return, PV 91, batchsim tsc clean).

Agreement picture: both models flagged the derive-side tautology (accepted with reasons); Codex alone raised the regex blind spots (accepted as unrealistic); Fable alone found the stale comment (fixed).

## Verification

All on this branch, 2026-10-23, quiet MacBook after the agent waves finished.

| Check | Result |
|---|---|
| `npm run check` | exit 0 — lint 0 errors; tsc shared / server / client clean; shared 1177 / server 2789 (−1 storm-band pin, +1 source scan) / client 4050; hooks 266 |
| `npx tsc -p server/scripts/batchsim/tsconfig.json` | clean (baseline: `main.ts(228,3) TS2322`) |
| Harness dry run `--matches 1 --captains 0 --bots 4 --quiet` | QUALITY BAR prints four rows (resolution PASS, kill share FAIL on a 1-match sample, land contact PASS, levels spent PASS); `deaths: 3 = 3 by participant + … + 0 by storm` |
| Ledger diff | 446 stamps (245 insert, 201 append); 201 replaced status values, 201 preserved verbatim as `Was:` suffixes, 0 lost; 3,167 → 3,533 lines |
| Flag notices | 12 files; 11 same-line appends where the old line is a strict prefix of the new; frontmatter diff empty |
| `goldenFrames` | byte-identical (server suite; no snapshot write) |
| matchSmoke (self-boot 2599), first try | OK — `wallMs` 109319; port freed |
| weaponsSmoke (scratch server 2699, `WS_URL`), first try | OK — 215 s wall; server booted in 3 s, killed with its node child, port freed, 0 EADDRINUSE lines |

## Residual risks / open

- The ledger's 68 Eric's-call entries await his one-sitting batch; nothing in this story answers them.
- The derived tune-family test cannot catch a family dropped from `TUNE_FAMILIES` (both models). A reviewer must catch that; the trade is recorded.
- 29 production `npm audit` advisories are untouched here — the next story by Eric's word.
- The heuristic-pilot smokes (fog red on `phaseRadarBand`) remain red until their own story.
- `CLAUDE.md` still reads "frozen at `0.17.X`" (frozen file; auto-memory holds the truth); the ledger's line 3 still says entries come from "bmad-dev-auto runs".
