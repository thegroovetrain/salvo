# Sprint Change Proposal — 2026-10-23: the Dependency Sweep takes 9.17; How-to-Play and Record leaves Epic 9

**Workflow:** `gds-correct-course` · **Mode:** Incremental (two AskUserQuestion rounds, every ruling Eric's) · **Author:** Claude (Developer, orchestrating) · **Decider:** Eric
**Trigger:** Eric, 2026-10-23, at the Story 9.16 pre-PR question gate, asked when he wanted the dependency sweep after the ledger triage found 29 production `npm audit` advisories: *"We are going to move How to Play until later, I have feedback from my recent playtest that I'd like to iterate on. So, lets just replace 9.17."* And at this correct-course: *"Move it out of Epic 9. We are going to course correct on Epic 10 separately and use that for feedback implementation, because I have a lot of other things we need to do."*

**Rulings taken in this run (2026-10-23, AskUserQuestion; every one is Eric's):**

1. **Mode:** Incremental.
2. **The sweep's scope:** audit fixes AND framework currency — *"Audit fixes + framework currency"*: clear the 29 production advisories and bring the frameworks to their current majors, with a full gate and a staging smoke.
3. **How-to-Play and Record leaves Epic 9.** It is NOT the epic's closer and is NOT rehomed here: a separate correct-course on Epic 10 will place it beside Eric's playtest-feedback work. Its number 9.17 is re-used by the sweep (the 2026-10-11 precedent for re-used numbers); its text stays in `epics.md` under a dated "moved" stamp as the record of what the pass owes.
4. **Order:** the dependency sweep first, as 9.17; the feedback stories come after and belong to the Epic 10 correct-course, not this one.
5. **Story 9.17 Dependency Sweep approved as drafted** (§4.1). Of the majors offered as dials, Eric picked **TypeScript 7.0** now. The author's reading, open to veto: Vite and Vitest currency were already inside the approved AC 2 and stay in; the **Node runtime major** and **express 5** remain dials at the story's spec step.
6. **Artifact edits (§4) approved as listed, riding the 9.16 branch and PR #304** (the trackers are already modified there).

---

## 1. Issue Summary

Story 9.16's ledger triage ran `npm audit --omit=dev` and found **29 advisories in production dependencies** (1 critical — `proxy-addr` IP spoofing; 9 high — `body-parser`, `path-to-regexp`, `zod`, `nanoid`, `picomatch`, `postcss`, `source-map-js`, `vite`, `@xmldom/xmldom`; 4 moderate; 15 low), where the Story 8.0 ledger entry had recorded none. `npm outdated` on the same tree shows the Colyseus family one to ten patches behind on 0.18.x, PixiJS 8.19 → 8.22, Vitest split 2.x (shared, server) / 4.x (client) with 5.x current, Vite 6 → 8, TypeScript 5.9 → 7.0, express 4 → 5, `@types/node` 22 → 26, and Node unpinned in `render.yaml`. Three of npm's offered fixes are a DOWNGRADE to `colyseus@0.15.13` (the `grant` / `request-oauth` / `uuid` chain under `@colyseus/auth`), which no sweep may take.

Eric's standing rule (auto-memory `feedback_keep_deps_current`): frameworks stay current and a major upgrade is a first work item, not a drive-by. Epic 10 (The Account) adds a database and an auth layer on top of these packages; sweeping first keeps that new code on current dependencies.

Separately, Eric has playtest feedback he wants to iterate on before the How-to-Play pass makes sense, and *"a lot of other things we need to do"* — so How-to-Play and Record moves out of Epic 9 and Epic 10 gets its own correct-course.

## 2. Impact Analysis

### Epic impact

Epic 9 keeps seventeen stories but its last one changes: **9.17 is the Dependency Sweep**; **How-to-Play and Record is moved out** (status `deferred`, number reserved as text, re-homed at the Epic 10 correct-course). Epic 9 closes after 9.17 and its retrospective. No other epic changes here; the Epic 10 re-cut is a separate run.

### Story impact

- **9.17 Dependency Sweep** *(new)*. Full text §4.1.
- **How-to-Play and Record** *(moved out)*. Text kept under a dated stamp; AC content unchanged so the Epic 10 correct-course can lift it whole. Its "Given Stories 9.1–9.15 landed" and the GDD/catalog/architecture supersession stamps it owed are carried with it — nothing else in Epic 9 picks them up.
- **9.16 Harness and Ledger Hygiene** *(in review, PR #304)*. Its trackers already point here. Its ledger entry on the 29 advisories is stamped with this proposal.
- **Epic 10 stories** *(backlog)*. Untouched here; the separate correct-course will add Eric's feedback stories and re-home How-to-Play.

### Artifact conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `planning-artifacts/epics.md` Epic 9 | 9.17 is How-to-Play and Record | new 9.17 Dependency Sweep inserted (§4.1); the old 9.17 heading stamped MOVED (§4.2); header para + dependency line dated notes (§4.3) |
| `implementation-artifacts/epic-9-context.md` | story list names How-to-Play as 9.17 | line swapped; moved story noted (§4.4) |
| `implementation-artifacts/epic-9-context-amendments.md` | — | amendment 216 appended (§4.5) |
| `implementation-artifacts/sprint-status.yaml` | `9-17-how-to-play-and-record: backlog` | → `deferred` with the ruling; `9-17-dependency-sweep: backlog` added; epic-9 line noted (§4.6) |
| `gds-workflow-status.yaml` | correct-course row | one-line stamp (§4.6) |
| GDD `gdd.md` E9 row (464) | "How-to-Play entries in Eric's copy" listed as E9 content | dated "superseded in part 2026-10-23" clause (§4.7) |
| `deferred-work.md` npm-audit entry (9.16 closing section) | status names "NEXT STORY" without a record | pointer to this proposal appended (§4.8) |
| `project-context.md` Technology Stack | names today's versions | updated BY 9.17 when the versions move, not here |
| `render.yaml` | Node unpinned | a 9.17 spec-step dial (Eric's); live deploy config — only in the PR that needs it |

### Technical impact

None until 9.17 builds. The sweep is a `package.json` / lockfile change across four workspaces plus whatever a major demands (tsconfig for TypeScript 7, Vite config for Vite 8, Vitest config unification, express 5 route re-reads if ruled in). `PROTOCOL_VERSION` does not move unless a wire type changes. Staging cannot judge performance; a perf smoke on staging follows the merge as every sweep's gate.

## 3. Recommended Approach

**Direct adjustment.** One story replaced in place, one moved out with its text intact, one epic-closing note. Effort: 9.17 is a multi-commit cycle (one major per commit, gate green after each; a failing major is reverted in full and ledgered). Risk: TypeScript 7.0's toolchain support (typescript-eslint, Vite's TS transform) is the one unknown; the story's own rule is "fall back to 5.9 latest if the gate cannot go green, and ledger why". Timeline: Epic 9 closes one story later than the sweep would have taken anyway; the How-to-Play pass is not lost, it is re-homed.

## 4. Detailed Change Proposals

### 4.1 `epics.md` — new Story 9.17 (inserted before the moved story)

```
### Story 9.17: Dependency Sweep *(inserted 2026-10-23 — `sprint-change-proposal-2026-10-23.md`; replaces How-to-Play and Record in this slot, which moves out of Epic 9; lands after 9.16 merges and closes the epic)*

As the operator of a public game,
I want every production dependency clean of known advisories and every framework on its current major,
So that Epic 10's database and auth layer is built on current code and no shipped package carries a published hole.

**Eric (2026-10-23, verbatim):** *"We are going to move How to Play until later, I have feedback from my recent playtest that I'd like to iterate on. So, lets just replace 9.17."* · scope: *"Audit fixes + framework currency"* · dial: TypeScript 7.0 in.

**Acceptance Criteria:**

**Given** `npm audit --omit=dev` at 0.18.71 reports 29 advisories (1 critical, 9 high, 4 moderate, 15 low) and `npm outdated` shows the Colyseus family behind on 0.18.x, Vitest split 2.x / 4.x, Vite 6, TypeScript 5.9, PixiJS 8.19
**When** the sweep lands
**Then** `npm audit --omit=dev` reports total 0; never by downgrading — npm's offered fix for the `grant` / `request-oauth` / `uuid` chain is `colyseus@0.15.13` and is refused; an advisory fixable only upstream is ledgered with the upstream issue link, never hidden by an audit exception
**And** frameworks are current, ONE MAJOR PER COMMIT with `npm run check` green after each: the Colyseus family to the latest 0.18.x on official modules only (core, tools, schema, sdk, auth, database, admin, monitor, playground); Vitest unified on one current major across shared, server and client; Vite current; PixiJS current 8.x; TypeScript 7.0 (the native compiler) with typescript-eslint and the Vite transform verified — falling back to the latest 5.9 if the gate cannot go green inside the cycle, with the reason ledgered; ESLint + typescript-eslint current; a major that cannot pass the gate is REVERTED IN FULL and ledgered, never shipped half-way
**And** two dials are Eric's at the spec step: whether the Node runtime moves off 22 (then `render.yaml` + `engines` pin it and `@types/node` follows — live deploy config, only in this PR) and whether express moves to 5 (route-pattern semantics change; every Express route and middleware re-read)
**And** nothing a player can feel: `PROTOCOL_VERSION` unchanged unless a wire type changes; `goldenFrames` byte-identical; both scripted smokes first-try; performance judged on staging after the merge, never locally
**And** the record: a spec with a before/after version table per workspace; one amendment; `CHANGELOG`; `project-context.md` Technology Stack updated to the new versions; the ledger's npm-audit entry stamped RESOLVED; both trackers stamped with one line each; no in-game copy; no gameplay change.
```

### 4.2 `epics.md` — the moved story's heading

OLD: `### Story 9.17: How-to-Play and Record *(was 9.8 until 2026-10-11, 9.11 until 2026-10-13, 9.12 until 2026-10-13 second, 9.13 until 2026-10-14)*`
NEW: `### Story 9.17 (MOVED OUT OF EPIC 9, 2026-10-23): How-to-Play and Record *(was 9.8 until 2026-10-11, 9.11 until 2026-10-13, 9.12 until 2026-10-13 second, 9.13 until 2026-10-14; 9.17 until 2026-10-23 — `sprint-change-proposal-2026-10-23.md`: Eric moved it out of Epic 9 ("move How to Play until later"); the number is re-used by the Dependency Sweep above; the text below is kept whole as the record of what the pass owes and is re-homed at the Epic 10 correct-course)*`
Body unchanged.

### 4.3 `epics.md` — Epic 9 header paragraph and the dependency line

Append to the header's re-cut parenthetical: `; re-cut 2026-10-23 by `sprint-change-proposal-2026-10-23.md`: 9.17 is the Dependency Sweep, How-to-Play and Record moved out of the epic to the Epic 10 correct-course`. The cross-story dependency sentence ("9.17 needs 9.1–9.16") lives only in `sprint-change-proposal-2026-10-14.md`, not in `epics.md` — nothing to annotate there; this proposal supersedes it: 9.17 needs only 9.16 merged.

### 4.4 `epic-9-context.md`

OLD: `- Story 9.17: How-to-Play and Record (was 9.12, 9.13 until 2026-10-14)`
NEW: `- Story 9.17: Dependency Sweep (inserted 2026-10-23 — `sprint-change-proposal-2026-10-23.md`; closes the epic)` + a following line `- Moved out of Epic 9 2026-10-23: How-to-Play and Record (was 9.17) → the Epic 10 correct-course, text kept in epics.md`.

### 4.5 `epic-9-context-amendments.md` — amendment 216

The three rulings of this run, the TypeScript 7 dial and the author's reading of the unpicked dials, verbatim quotes, the audit and outdated numbers.

### 4.6 Trackers

`sprint-status.yaml`: `9-17-how-to-play-and-record: deferred  # 2026-10-23 Eric: moved OUT of Epic 9 ("move How to Play until later"); re-homed at the Epic 10 correct-course; sprint-change-proposal-2026-10-23.md; number re-used by 9-17-dependency-sweep; was 9-8 …` and a new `9-17-dependency-sweep: backlog  # inserted 2026-10-23 by sprint-change-proposal-2026-10-23.md (replaces How-to-Play in the slot): 0 production audit advisories, frameworks current one major per commit, TypeScript 7.0 in; Node runtime + express 5 dials at spec; closes Epic 9`; the epic-9 line gains `; 2026-10-23 re-cut: 9-17 = Dependency Sweep, How-to-Play moved to the Epic 10 correct-course; epic closes at 9-17 + retro`. `gds-workflow-status.yaml`: `last_updated` + `next_expected` one line each.

### 4.7 GDD E9 row

Append: `*(superseded in part 2026-10-23 — `sprint-change-proposal-2026-10-23.md`, epic-9 amendment 216: the How-to-Play entries leave this epic for the Epic 10 correct-course; a DEPENDENCY SWEEP (0 production audit advisories, frameworks current, TypeScript 7.0) closes it as 9.17)*`.

### 4.8 `deferred-work.md`

The 9.16 closing-section npm-audit entry's status gains ` — sprint-change-proposal-2026-10-23.md §4.1 is the story`.

## 5. Implementation Handoff

**Scope: Moderate** (one story replaced, one moved, trackers and records re-pointed). **Route:** Developer — this run applies §4 on the 9.16 branch (PR #304); the next step after #304 merges is `gds-create-story 9-17` (the Dependency Sweep), then, separately and on Eric's call, `gds-correct-course` on Epic 10 for the playtest feedback and the How-to-Play re-home. **Success criteria:** `epics.md`, `epic-9-context.md`, both trackers, the GDD row and the ledger agree that 9.17 is the Dependency Sweep and that How-to-Play and Record is deferred to the Epic 10 correct-course; amendment 216 holds the rulings.
