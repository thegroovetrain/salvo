# Sprint Change Proposal — 2026-11-20: the Ledger waits for accounts — 12.1 / 12.2 fold into Epic 14; Epic 12 renamed The Supply Run and closed

**Status:** DRAFT for Eric's approval (gds-correct-course, batch mode; four structural rulings by AskUserQuestion this session)
**Trigger:** Eric, 2026-11-20: `/gds-correct-course 12-1 and 12-2 will be deferred until accounts exist, as there is no point building a system that will be replaced as soon as I need actual match history.`
**Author:** Developer agent with Eric
**Predecessors:** `sprint-change-proposal-2026-10-25.md` (the Ledger inserted; Epic 14.1's store half pulled forward), `sprint-change-proposal-2026-11-08.md` (Ledger → Epic 12, text whole), `sprint-change-proposal-2026-11-18.md` (12.3 + 12.4 added; order 12.3 → 12.4 → 12.1 → 12.2)

---

## 1. Issue Summary

**Problem statement.** Epic 12 The Ledger was going to build an anonymous match-data store now: Story 12.1 would put Render Postgres behind the `AccountWriter` port, and Story 12.2 would add a readout script over it. Epic 14 The Account already plans the same store (14.1), the real writer (14.6) and the match tables with an account column (14.7). Building 12.1 first means building `matches` / `match_participants` without accounts and rebuilding them when accounts arrive. Eric's ruling: *"there is no point building a system that will be replaced as soon as I need actual match history."*

**Rulings (Eric, AskUserQuestion, 2026-11-20):**
- (a) **Fold into Epic 14.** 12.1's store work merges into 14.1 / 14.6 / 14.7, which already write match rows. 12.2's readout script becomes a new Epic 14 story, built right after 14.7. Rejected: deferred in place; cancelled outright.
- (b) **Close Epic 12 now.** Its two remaining stories (12.3, 12.4) are merged; the retro stays optional. Epic 13 The Front Door is next.
- (c) **Rename Epic 12 to "The Supply Run".**
- (d) Batch review.

**Issue type.** Strategic re-sequence by the stakeholder. No technical failure and no work lost.

**Evidence: nothing built is undone.** `server/src/game/matchRecord.ts` (the record builder) and `server/src/game/accountWriter.ts` (the port + `NullWriter`) shipped in Story 8.21 and stay exactly as they are. Neither 12.1 nor 12.2 was started (both `backlog`; no story file, no spec, no branch). `render.yaml` has no `databases:` entry. No code, no `PROTOCOL_VERSION` change, no deploy change.

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| **Epic 12** | **Renamed The Supply Run. CLOSED (done)**: 12.3 The In-Game UI Pass (PR #367) and 12.4 Airdrops and Radio Beacons (PR #368 + #370 follow-up) shipped. 12.1 and 12.2 are `cancelled`, each with a pointer to where its content now lives. The retro stays optional. |
| **Epic 13 The Front Door** | Becomes the next epic. No text change. |
| **Epic 14 The Account** | 14.1 builds the store whole again (the 2026-10-25 "Epic 12 builds the store half first" note is reversed). 14.6 and 14.7 carry the few 12.1 clauses they didn't already have. **New Story 14.12 Reading the Match Data** (12.2's text, re-pointed), built after 14.7 and before 14.8. The epic goal gains the operator's readout. |

### Story impact

**12.1's content, clause by clause. Almost all of it is already in Epic 14:**

| 12.1 clause | Where it lives now |
|---|---|
| Absence-gated on `DATABASE_URL`, starts with the writer OFF on failure, logs once | 14.1 (identical, as `account.disabled`) |
| Render Postgres per environment, `databases:` in the same PR, no disk, managed backups | 14.1 (identical) |
| `@colyseus/database`, checked-in `drizzle-kit` migrations, never `"auto"`, exact `drizzle-orm` pin | 14.1 (identical) |
| PGlite for local dev + `npm run check`; plain `npm run dev` stays OFF | 14.1 (identical) |
| FIFO, retry once, `flush()` on SIGTERM; nothing on the tick awaits it; bots + humans written alike | 14.6 (identical, plus XP in the same transaction; bots / anonymous rows `user_id = NULL`) |
| `/metrics` writeOk / writeFailed / queueDepth; `write.ok` / `write.failed` log lines under the PII rule | 14.6 (identical, `account.*` names) |
| Tables `matches` / `match_participants` / `match_hands` mirroring `MatchRecord` | 14.7 has `matches` + `match_participants` with `drawn` / `taken` and `pool` whole. **Carried as a note:** 14.7's create-story reconciles its columns against the `MatchRecord` as built (hull, Shift, index bonus, drops, hands), because its column list predates Epics 10–12 |
| No callsign stored (Eric 2026-10-25, anonymous rows) | Epic 14's "store very little" standing constraint. **Carried as a note on 14.7:** no callsign stored for an anonymous captain or a bot |
| Privacy policy: one sentence on stored match results | Epic 14 already owns the privacy paragraph (14.10). **Carried as a note:** the paragraph covers match results stored server-side |
| Staging gets its own database | 14.1 (identical) |
| `PROTOCOL_VERSION` does not bump | 14.6's existing rule |

**12.2 → new Story 14.12**, text whole except three re-points: "Given the ledger (12.1)" becomes "Given the match tables (14.1 / 14.7)"; "no admin console (that is 13.7)" becomes "(that is 14.7)", a stale number fixed; the title becomes "Reading the Match Data".

**The open epic-11 retro action item** ("AT 12-1 CREATE-STORY: refresh Epic 12 wording to the record as built … and confirm `@colyseus/database` is the current module before mounting it") is re-homed to **14.1 / 14.7 create-story**.

### Artifact conflicts

| Artifact | Change |
|---|---|
| `epics.md` | Summary list: Epic 12 renamed + one-line fold note; Epic 14 summary gains 14.12. Body: Epic 12 renamed with a 2026-11-20 note; 12.1 / 12.2 headings struck through as FOLDED with pointers, original text kept below for history (the 14.5 precedent); the 14.1 note replaced; one note each on 14.7 and 14.10; new 14.12 placed after 14.7; Epic 14 intro "Ten stories" → "Eleven stories". |
| GDD `gdd.md` | E12 row renamed The Supply Run, goal = what shipped (12.3 + 12.4), with the fold stamped; E14 row gains "Eric's readout over every match"; the "account store (v3)" paragraph's "E12 builds the store half first" sentence gets a dated supersession stamp. |
| `game-architecture.md` | One dated notice after the 2026-11-08 notice: the 2026-10-25 split is reversed; Epic 14 builds the store whole. No decision changes (D9–D18 already describe the whole store). |
| `EXPERIENCE.md` | None. Its 2026-10-25 note names the Ledger only in a numbering list that later notes already supersede. |
| `DESIGN.md` | None. |
| `render.yaml`, code | None. |
| `epic-12-context-amendments.md` | Amendment 11 appended (rulings a–d). |
| `sprint-status.yaml` | `epic-12: done` (renamed), `12-1` / `12-2: cancelled` with fold pointers, `epic-14` comment gains 14-12, new key `14-12-reading-the-match-data: backlog` after 14-7, the epic-11 action item re-homed; `last_updated` one-line stamp. |
| `gds-workflow-status.yaml` | `last_updated` + `correct-course` + `next_expected` one-line stamps. |

### Technical impact

None. No build cycle, no version bump (0.20.3 stays), PV 113 unchanged.

## 3. Recommended Approach

**Direct Adjustment.** Re-home two unbuilt stories into the epic that was always going to supersede them, and close the epic they leave. Effort: one documentation PR. Risk: low. The only risk is losing 12.1's few distinct clauses, and the table above maps each one.

**Timeline effect:** match data now arrives with accounts (Epic 14), after the Front Door (Epic 13), not before it. Until then, balance tuning keeps using the batch-sim harness, as it does today.

## 4. Detailed Change Proposals

### 4.1 `epics.md`: summary list, Epic 12 (line 664)

OLD: `### Epic 12: The Ledger *(was Epic 11 …; GDD E12)*` + the store paragraph + FRs / Standing constraints lines.

NEW (heading): `### Epic 12: The Supply Run *(renamed 2026-11-20 from The Ledger — `sprint-change-proposal-2026-11-20.md`; was Epic 11 until 2026-11-08 …; GDD E12)*`
NEW (first line of body, prepended): `**2026-11-20 — CLOSED; 12.1 / 12.2 FOLDED INTO EPIC 14** (Eric: *"no point building a system that will be replaced as soon as I need actual match history"*): the epic shipped 12.3 The In-Game UI Pass and 12.4 Airdrops and Radio Beacons; the match store is built whole by 14.1 / 14.6 / 14.7 and the readout is Story 14.12. The text below is history.` Original text kept.

### 4.2 `epics.md`: summary list, Epic 14 (line 674)

Appended to the paragraph: `*(2026-11-20 — `sprint-change-proposal-2026-11-20.md`: Epic 12's Ledger folds in — 14.1 builds the whole store again, and Story 14.12 Reading the Match Data (was 12.2) gives Eric the harness's balance readouts over every live match, built after 14.7.)*`

### 4.3 `epics.md`: body, Epic 12 (line 3046)

Heading renamed as 4.1. One prepended paragraph, the same as 4.1. Story headings:
- `### Story 12.1: ~~The Match Ledger (floor story)~~ — FOLDED INTO EPIC 14 2026-11-20` + `*(Store, writer and tables are built by 14.1 / 14.6 / 14.7; clause map in `sprint-change-proposal-2026-11-20.md` §2. Original text kept below for history.)*`
- `### Story 12.2: ~~Reading the Ledger~~ — MOVED TO STORY 14.12 2026-11-20` + `*(Text carried whole to Story 14.12 Reading the Match Data. Original kept below for history.)*`

### 4.4 `epics.md`: Story 14.1 heading note

OLD: `*(2026-10-25 note — … Epic 12 The Ledger builds the STORE half of this story first … decided at its create-story, text below left as written)*`
NEW: the old note struck through, followed by `*(2026-11-20 — `sprint-change-proposal-2026-11-20.md`: REVERSED — Epic 12 no longer builds the store (Eric); this story builds it WHOLE as written. Also at create-story: confirm `@colyseus/database` is the current module before mounting it (epic-11 retro action, re-homed from 12.1).)*`

### 4.5 `epics.md`: Story 14.7 note (appended after its heading)

`*(2026-11-20 note — `sprint-change-proposal-2026-11-20.md`: carries Epic 12.1's intent. Every finished match is written, bots and anonymous captains included (`user_id NULL`), so Eric's readout (14.12) covers all of them; no callsign is stored for an anonymous captain or a bot (Eric 2026-10-25); the table columns are reconciled at create-story against `MatchRecord` as built (hull, Shift, index bonus, drops, hands), because the list below predates Epics 10–12.)*`

### 4.6 `epics.md`: Story 14.10 note

`*(2026-11-20 note: the paragraph also states that match results (hull, placement, cards) are stored server-side, with no name attached for an anonymous captain — carried from 12.1.)*`

### 4.7 `epics.md`: NEW Story 14.12, placed after 14.7

```
### Story 14.12: Reading the Match Data *(was Story 12.2 Reading the Ledger until 2026-11-20 — `sprint-change-proposal-2026-11-20.md`; built after 14.7, before 14.8)*

As the operator (Eric),
I want the balance readouts I already know from the batch-sim harness, over the real matches in the store,
So that I tune from what people actually did.

**Acceptance Criteria:**

**Given** the match tables (14.1 / 14.7) and the harness's report modules (`server/scripts/harness/` — class share, gun × tier, placement, pool readouts, bot readouts)
**When** the readout lands
**Then** `server/scripts/ledgerReport.mjs` reads the store (`DATABASE_URL` or `HC_DEV_DB=pglite`) and renders the harness's existing shapes over live matches — win and placement share by hull and by gun, hands offered vs taken by line, consumable use, humans vs bots, match duration and end cause — filterable by game version, date range and mode; text output in the harness's register, no web UI, no admin console (that is 14.7)
**And** the report functions are pure over plain rows (unit-tested on fixtures); the script is documented beside the balance-sim how-to; nothing runs unprompted
**And** no code under `game/` changes; no PV change.
```

(The readout list, "gun × tier", "consumable use" and so on, is 12.2's text kept whole. Its refresh against the record as built belongs to 14.12's create-story, the same rule the 12.1 action item set.)

Epic 14 body intro: `Ten stories in build order` → `Eleven stories in build order (14.12 added 2026-11-20, built after 14.7)`.

### 4.8 GDD `gdd.md`

- E12 row (line 545): `| E12 *(…)* | **The Supply Run** *(was The Ledger until 2026-11-20 — `sprint-change-proposal-2026-11-20.md`; its store + readout folded into E14)* | The in-game UI pass (radar, ship visuals, zoom / panning, the HUD bar) and airdrops + supply drops (XP crates, the level stat roll, wreck crates, supply drops replace radio beacons) | Shipped 0.20.1–0.20.3 |`. Old wording struck through in the cell, the GDD's supersession style.
- E14 row (line 547): Features cell gains `; Eric's readout over every match (14.12, from E12, 2026-11-20)`.
- Line 653: append `*(Superseded 2026-11-20 — `sprint-change-proposal-2026-11-20.md`: E12 does not build the store; E14 builds it whole.)*`

### 4.9 `game-architecture.md`: new notice after the 2026-11-08 notice

`> **RE-SEQUENCE NOTICE — 2026-11-20** (`sprint-change-proposal-2026-11-20.md`). The 2026-10-25 split is REVERSED: no epic builds the store half ahead of accounts. Epic 12 (renamed The Supply Run) closed without it; the Account Store amendment below is built WHOLE by Epic 14 (14.1 store, 14.6 writer, 14.7 tables, 14.12 Eric's readout script). The `AccountWriter` port and `NullWriter` (Story 8.21) remain the seam.`

### 4.10 `epic-12-context-amendments.md`: amendment 11 (append-only)

A section `## Correct-course 2026-11-20 — the Ledger folds into Epic 14; Epic 12 renamed The Supply Run and closed (no build cycle; sprint-change-proposal-2026-11-20.md)` holding rulings (a)–(d) above verbatim, plus: "What will bite the next agent: 12.1 / 12.2 are not deferred work; do not build them. The store, writer and readout are Epic 14 (14.1 / 14.6 / 14.7 / 14.12). Never re-ask."

### 4.11 Trackers (one-line stamps only)

`sprint-status.yaml`:
- `last_updated` prepend: `2026-11-20 (correct-course: 12-1 / 12-2 folded into epic-14 [14-1/14-6/14-7 + new 14-12]; epic-12 renamed The Supply Run, CLOSED; no build cycle; epic-12 amendment 11; sprint-change-proposal-2026-11-20.md);`
- `epic-12: done  # 2026-11-20 correct-course: renamed The Supply Run, CLOSED (12-3 + 12-4 shipped; 12-1/12-2 folded into epic-14; amendment 11); was: …` (old comment kept after `was:`)
- `12-1-the-match-ledger: cancelled  # 2026-11-20 FOLDED into 14-1/14-6/14-7 (sprint-change-proposal-2026-11-20.md); was: backlog`
- `12-2-reading-the-ledger: cancelled  # 2026-11-20 MOVED to 14-12-reading-the-match-data; was: backlog`
- `epic-14` comment prepend: `2026-11-20: +14-12 reading the match data (was 12-2), store built whole by 14-1;`
- New key after 14-7: `14-12-reading-the-match-data: backlog  # was 12-2 (2026-11-20); built after 14-7, before 14-8`
- The epic-11 action item: `action` re-pointed `AT 14-1 / 14-7 CREATE-STORY: …` with `(re-homed from 12-1, 2026-11-20)`; status stays `open`.

`gds-workflow-status.yaml`: `last_updated` prepend, `correct-course` comment prepend, `next_expected: '2026-11-20 correct-course: Ledger folded into Epic 14, Epic 12 The Supply Run closed; next: Epic 13 The Front Door (13-1)'`.

## 5. Implementation Handoff

**Scope: Moderate**, a backlog reorganization with no code. It is implemented by the Developer agent in this session as one docs PR to `development` (branch `worktree-correct-course-defer-ledger`).

**Success criteria:**
- No live tracker key points at 12-1 / 12-2 as work to do; `epic-12: done`; `14-12` present.
- Every 12.1 clause is findable in 14.1 / 14.6 / 14.7 / 14.10 (the §2 map).
- The 2026-10-25 "store first" sentence is superseded in epics.md, the GDD and the architecture.
- Amendments file append-only (no deleted lines); CLAUDE.md untouched; no code diff.
- `npm run lint` unaffected (docs only).
