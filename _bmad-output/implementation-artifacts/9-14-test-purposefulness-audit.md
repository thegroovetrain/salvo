---
baseline_commit: 081f8f72
---
# Story 9.14: Test Purposefulness Audit

Status: review

<!-- Created 2026-10-22 by gds-create-story on development @ 9c1aa81c (0.18.68, PV 91). The rule this story enforces is Eric's (epic-8 amendment 243, project-context.md Testing Rules); the file lists, counts and defaults below are the story author's readings of the suite on that commit, to be re-measured by the dev agent before any row is quoted. Nothing here is a mechanic or a balance number. Open questions for Eric are collected at the end, not scattered. -->

## Story

As the next developer to change a function,
I want every test in the suite to guard a contract of the thing it tests,
so that a test fails only when the behavior it names is broken, never because a word, a copy string, a clock or a geometry constant moved.

**The rule (Eric, Epic 8 retro 2026-10-06, verbatim in epic-8 amendment 243):** *"a lot of tests that are just completely and utterly pointless… adding excessive, pointless tests like that adds technical debt, because the test might need to be changed for reasons that have nothing to do with the purpose of the function being tested."* Standing form (project-context.md → Testing Rules): **a test asserts a CONTRACT of the function under test — never vocabulary or copy strings, wall-clock timing, or geometry standing in for a perf claim. If a test cannot name the contract it would catch failing, it does not exist.**

**Eric's brief for this story (2026-10-22, at story creation, verbatim):** *"my intention here is that I noticed a few really stupid tests. I gave a hardcap of 10 cyclomatic complexity per function, so what we should have is a lot of individual functions that are very easy to test, as well as compositions made from them that are also easy to test. So, unit, integration, end-to-end, that stuff matters. What doesn't matter is shit like, 'does the word 'fish' appear in the copy?' Literally none of that matters at all and it will just create extra work (and token cost) any time the text changes. We need to pare down the tests and focus on writing sufficient USEFUL tests. My preferred coding style is functional, meaning lots of pure functions and minimal side effects. And I get sticking to that exclusively is challenging in a game, but we can still try and hit that target of easily testable pure functions, compositions, and predictable side effects."*

So the story has two halves, and the second is not optional: **pare down** (delete what guards nothing) and **end up sufficient** (every pure function has a unit test of its contract, every composition has an integration test of its contract, the socket smokes are the end-to-end layer). The complexity cap (`complexity: 10`, ESLint ERROR) is what makes this shape natural: small functions, composed. A deletion must never leave a function with no contract test at all — if the only test of `f` was a copy pin, it is REPLACED by `f`'s unit test, not merely removed.

Three rulings since the retro sharpen the rule and are binding here (epic-9 amendment 8 says this story "inherits the rule for the rest of the suite" — it named the story by its old number, 9.5):

- **No word-police tests** (epic-8 amendment 211, Eric 2026-10-01): an AC clause about words or copy is verified once by hand at landing, never pinned. `copyWords.test.ts` was deleted; it must stay deleted.
- **Ring sizes are not a test subject** (epic-9 amendment 8, Eric 2026-10-07): *"Any tests that test to make sure the ring is a certain size are fucking useless. I need to know that the function to generate them works."* A pin that only restates a CONFIG number is debt; the generating function's behavior on a SYNTHETIC input is the contract.
- **Coincidence pins are not rules** (Eric 2026-10-08, auto-memory `feedback_coincidence_pins`): a test that recorded two separately ruled numbers as equal (wake clock × speed == detect rung) is deleted the moment it fights a one-number change; never propose a follow-on CONFIG change to preserve one.

## Acceptance Criteria

1. **Every test file is read; every test names its contract or goes.** Given the suite on `development` (baseline measured 2026-10-22 at 9c1aa81c: shared 1177 · server 2793 (+ 2 skipped) · client 4170 vitest tests = 8,140, plus 266 hook assertions — the epic's "7,467 + 266 at cycle 168" is the retro-era figure), when the audit runs, then every test file in `shared/src/__tests__`, `server/src/__tests__`, `server/scripts/batchsim/__tests__`, `client/src/__tests__`, `client/src/audio/__tests__` and `.claude/hooks/protect-claude-md.test.sh` has been read in full, and each test either names the contract it guards (in its title or a one-line comment) or is deleted or rewritten to one that does.
2. **The known offenders go first, with their current status recorded.** The six the retro named (word-police · fogSmoke tautology · 160-tick leader pin · geometry-as-perf pins · smoke fixtures · phantom height raster) and the 8.16 "2,000 fuzz worlds" claim are each resolved and their disposition written in the audit record — several are already fixed or deleted by later stories (see Dev Notes § Known offenders) and are recorded as such, not re-done.
3. **The spec record is corrected.** The "2000 seeded perception fuzz worlds" wording is corrected to the shipped size in every spec that still carries it, or the count is raised on purpose — raising it is Eric's call, not the dev's (see Questions).
4. **An audit record exists.** `_bmad-output/implementation-artifacts/test-audit-<date>.md` lists per workspace (shared / server / client / hooks): tests before, kept, rewritten, deleted; every deletion with its reason class; and the pinned invariants that protect the architecture — the perception SIX-exception invariant, `applyDamage` as the only hp write, bots never importing `world.js`, map determinism, `effectiveStats()` parity, the ratified class table — named as KEPT contracts with their file paths.
5. **The suite is sufficient, not just smaller.** For every module read, the record states which layer covers it: pure functions by unit tests (shared `sim/*`, client pure helpers, server pure helpers), compositions by integration tests (`world.step`, `perception.observe` → `frames`, the client net → sim → render chain), end-to-end by the headless socket smokes (`server/scripts/*.mjs`, 9.15's). No deletion leaves a function with zero contract tests; a pure function found with no unit test is listed in the record's GAPS section (filled in this story only where a deletion created the gap — see Question 6 for the rest).
6. **No production code changes.** The diff touches only `__tests__` directories, `__snapshots__`, the hook test script, specs/ledger/trackers/CHANGELOG/VERSION. A bug a test exposes is NOT fixed in this story: it becomes a `deferred-work.md` entry, or a separate quiet fix after Eric's call. `npm run check` green; lint complexity unchanged (ESLint does not see test files — see Dev Notes); both trackers stamped with one-line stamps.

## Tasks / Subtasks

- [x] **Task 0 — Baseline and branch (AC: 1, 5).** Work on this branch (`worktree-create-story-9-14-test-audit`, cut from `development` @ 9c1aa81c) or a fresh one from `development`; `git fetch origin` first. Fresh worktree: `npm install --include=dev && npm run build -w shared`. Record the BEFORE row per workspace from a real run: `npm test -w shared`, `-w server`, `-w client` (the `Tests N passed` line), and `npm run check:hooks` (its final tally). Cycle number: next after 203 (expect 204 → `VERSION` + root `package.json` + lockfile 0.18.68 → 0.18.69; re-check `origin/development` before numbering — parallel cycles collide). `PROTOCOL_VERSION` is NOT bumped (no wire change).
- [x] **Task 1 — The known offenders (AC: 2, 3).** Verify each row of Dev Notes § Known offenders against the code, fix what is still live, record the rest as already-resolved with the commit or story that did it. Specifically: confirm `copyWords.test.ts` is absent; confirm `draft.test.ts` runs its 1500-tick stern chases; confirm `smokeScreen.test.ts` is gone (deleted by 9.3, commit 3ba8c277) so amendments 176/223(f)/224(f) have nothing left to fix; confirm the gunnery fixtures build a flat raster (231(l)); correct `spec-8-15-the-gun-pick-and-the-class-shifts.md:123` "2000 seeded perception fuzz worlds" → 20 (`server/src/__tests__/perception.test.ts:4387`) unless Eric raises the count; stamp `deferred-work.md` entry "THE PERCEPTION FUZZ RUNS 20 SEEDED WORLDS, NOT 2000" (around line 2558) RESOLVED.
- [x] **Task 2 — shared (AC: 1, 4).** 47 files. Read every file; apply the rubric (Dev Notes § The rubric). Biggest clusters: `barrel.test.ts` (~40 `CONFIG.x).toBe(literal)` lines, many with RETUNED history comments — a changelog, not a contract), `heightField.test.ts:58-69` (nine `TERRAIN_PARAMS` literals), `hullRepair.test.ts` (duplicates `barrel.test.ts:575-587`), `stats.test.ts` (12 literal pins), `arcs`, `damageGuardrail`, `slow`, `sinking`, `wake`, `catalog.test.ts:145` (`LINE_IDS.length` 26), `zone.test.ts`. Wall-clock pins: `map.test.ts:591-628` (1500 ms, re-based 250 → 500 → 1500 under contention — the deferred-work entry at ~1536 is this test) and `island.test.ts:333-354` (10k LOS sweeps < 1500 ms). KEEP and name: `map.test.ts:114/568` determinism fingerprints, `heightField.test.ts:77/94/362`, `noise.test.ts:49/86`, the `/Date\.now/`-absent source scans (`fog`, `heightField`, `noise`, `cloud`, `map` tests — they guard the zero-transcendental / zero-I/O invariant), `stats.test.ts:77/299/1223/1283` and `boons.test.ts:259/470` (`effectiveStats` identity and byte-identical folds), `shipClasses.test.ts:46/96/120` (ratified class table — KEEP by project-context.md Testing Rules, a deliberate identity pin; see rubric exception).
- [x] **Task 3 — server (AC: 1, 4).** 94 files in `src/__tests__` + 11 in `scripts/batchsim/__tests__` + one snapshot. Wall-clock pins: `machineGunFlashCost.test.ts:88-129` (< 50 ms best-of-5; failed under the 12-shard sim in 9-13's gate), `fogPerf.test.ts:88-141` (9.10 perf pin against `TICK_BUDGET_MS`), `hitTargets.test.ts:526-578` (500-live-mine NFR23 pin < 50 ms). Copy: `denials.test.ts:276-305` (~30 `protocolVersionError(N)).toMatch(/refresh/)` lines, one per historical PV — one behavior, thirty restatements), `botHarness.test.ts:555-560/626` (exact report prose and a seed-dependent `landDamage).toBe(40)`), `poolReadouts.test.ts:293`, `batchSim.test.ts:1454` (`levelCurve[1].n).toBe(200000)`). Duplicates: `PROTOCOL_VERSION).toBe(91)` at `denials.test.ts:275` and `colyseus018.test.ts:249` (and three more across workspaces — see rubric § duplicates). Skipped: `botReviewFixes.test.ts:700/712` (`it.skip` MOONRAKER / CROWSNEST wedge fixtures — a skipped test guards nothing). Snapshot: `goldenFrames.test.ts:1193` 160-row battery — KEEP, name the contract (the per-client frame shape and content for fixed worlds is byte-stable; a change is a deliberate re-record with a diff note, as every cycle has done). KEEP and name: `perception.test.ts` (SIX exceptions, independent oracle, 20-world fuzz with non-vacuity counters), `frames.test.ts`, `damageGate.test.ts:~830-850` (source scan: the ONE hull-hp decrement + the hp-increase whitelist), `bots.test.ts:333/344/357` (ai/ never reaches `world.js`; the port surface), `server/src/__tests__/boons.test.ts:230`, the registry-iterating perception tests (architecture: a signal cannot exist without coverage), `colyseus018.test.ts`'s join-gate BEHAVIOR (N admitted, N−1 refused). NOT offenders: `batchSim.test.ts:194-543`'s CONFIG reads assert that a CLI override was applied — that is the contract.
- [x] **Task 4 — client (AC: 1, 4).** 134 files + 3 audio. Copy-string pins are the client's debt: `home.test.ts` (`'SOLO'`/`'SOLO VS AI'` ~12×, `'CHANGE CLASS'`, `'HULLCRACKER'`, `SERVER: …` states, `'CONNECTING…'`, `'LINK REFUSED'`, `'QUEUED 2 CAPTAINS · DEPLOY IN 1:05'`, `'PLAYERS ONLINE: 23'`), `results.test.ts` (`'SPECTATE'`, `'RETURN TO PORT'`, `'LOADOUT'`), `classSelect.test.ts` (`'COLOR PREFERENCE:'`, `'SPECIAL'`/`'DECK GUN'`, `'SELECTED ✓'`, three card names), `page.test.ts` (`'PRIVACY POLICY'`, `'Last updated today'`, `'BACK TO PORT'`), `lobbyModal.test.ts:413-427`, `queueModal.test.ts:190-226`, `upgradeMenu.test.ts:493/598/701/720`, `slotTooltip.test.ts` (card names), `settings.test.ts:507`, plus `killFeed`, `refitTooltipFit`, `cardStatRows`, `howToPlay`, `privateRow`, `privateLobby`, `connection` for lighter cases. Wall-clock: `fogField.test.ts:130-146` (< 50 ms). Literal pins: `keyboard.test.ts` (7), `wake`/`slotTooltip`/`radarFalloff`/`prediction`/`hudBar` (3 each), `ordnanceMasksAreServerOnly.test.ts:149` (PV literal). NOT offenders: `sinkSettle.test.ts:190-216`, `ships.test.ts:195-248` (`performance.now()` as an INPUT to a pure function, not a perf claim). KEEP and name: `prediction.test.ts:229/1385/1557` (client/server sim parity — the architecture's prediction invariant), `ordnanceMasksAreServerOnly` (the anti-cheat half on the client side).
- [x] **Task 5 — hooks (AC: 1, 4).** `.claude/hooks/protect-claude-md.test.sh` (bash; `deny_bash` / `allow_bash` / `check` cases, run twice — with python3 and with PATH starved). Read it; every case guards the tripwire Eric ruled (2026-09-14). Expect to KEEP all; flag only a case that pins the hook's message wording rather than its allow/deny decision. Do not edit `protect-claude-md.sh` itself (production code of the hook, and it protects itself).
- [x] **Task 6 — The audit record (AC: 4).** Write `_bmad-output/implementation-artifacts/test-audit-2026-10-<dd>.md`: (a) per-workspace table before / kept / rewritten / deleted from real runs; (b) deletion list, one line each: `file:line — title — REASON CLASS`; (c) rewrite list, one line each: what it pinned → what contract it now names; (d) KEPT CONTRACTS section naming the invariants in AC 4 with file paths; (e) the known-offender table with dispositions; (f) anything a test exposed that looks like a production bug → `deferred-work.md` entry (this story never fixes it); (g) a GAPS section: exported pure functions (start with `shared/src/sim/*`, then server/client pure helpers) that have no unit test of their own, and compositions with no integration test — one line each, so the fill can be scoped (Question 6); (h) a one-paragraph PYRAMID summary per workspace: roughly how the kept tests split unit / integration / end-to-end. Reason classes: `VOCAB` (copy/label/name string), `CLOCK` (wall-clock ms), `CONST` (restates a CONFIG / geometry literal with no relation behind it), `COINCIDENCE` (two ruled numbers happened to be equal), `TAUTOLOGY` (asserts its own setup or re-derives the function under test), `DUPLICATE` (the same contract pinned elsewhere), `SKIPPED` (`it.skip`/`todo`), `SEED-OUTCOME` (pins a number a bot's choice or a seed produced, not a rule).
- [x] **Task 7 — Record, gate, PR (AC: 5).** `epic-9-context-amendments.md`: ONE appended entry — the audit's rulings of record (what was deleted by class, the counts, the kept invariants, anything Eric ruled in the Questions below), dated. `deferred-work.md`: close the fuzz-count entry; close the map-timing-guard entry (~1536) if that pin is deleted; leave "ESLINT DOES NOT SEE ANY TEST FILE" (~1406) OPEN and point it at 9.16 — un-ignoring tests is its own pass, not this one; also close the two cycle-203 OPEN entries (the blue returns and the fog square) citing Eric 2026-10-22 on development: *"I can no longer reproduce any of the issues … appears fixed"* (auto-memory `project_entire_sweep_cycle202` says the next landed PR closes them). `CHANGELOG.md` entry for 0.18.69 (house style; tests are not player-facing — one short "Changed" line that the suite was audited to contracts, counts in the audit record, not the changelog). Both trackers: `sprint-status.yaml` `9-14-test-purposefulness-audit: review  # <date> cycle 204, 0.18.69, PV 91 unchanged, amendment <n>; test-audit-<date>.md; PR open to development` and its `last_updated` line; `gds-workflow-status.yaml` `last_updated` + `next_expected`. `npm run check` green. Commit and push continuously; ONE non-draft PR to `development` at the end; NEVER merge — the run ends at the open PR.

## Dev Notes

### Scope, in one line

Tests, snapshots, the hook test script, specs, ledger, trackers, changelog, version. Nothing under `shared/src/sim`, `server/src/game`, `client/src` outside `__tests__`. If the only way to make a test honest is to change the code it tests, that is a ledger entry, not a change.

### The rubric — how to decide a test (apply per `it(`)

0. **Place it in the pyramid first.** Before judging a test, name the function or composition it exercises and which layer it belongs to: UNIT (one pure function, inputs → outputs, no world), INTEGRATION (a composition: a `step`, an `observe` → frame, a reducer chain, a DOM mount driven by state), END-TO-END (a socket smoke). A test that cannot be placed is usually testing an incidental (a word, a clock, a number) and is a candidate for deletion; a function with no test at any layer is a GAP row. Prefer, when rewriting, to test the pure function directly rather than the composition around it — that is the shape the complexity cap is for.
1. **Name the contract.** Read the title and the assertions. Ask: "if this fails, what behavior of the function under test is broken?" If the title already states a behavior ("a sinking hull holds the win check open", "ghosts beyond radar range are absent"), it names its contract — most of the suite does and needs NO edit. Do not mass-rename titles or prepend `contract:` to 7,000 tests; a comment is added only where the title is a bare scenario label and the contract is not obvious from the body. The audit is recorded per FILE (counts) and per DELETION/REWRITE (lines), not as a per-test essay.
2. **Copy strings (`VOCAB`).** An equality or `toContain` on UI text, a button label, a card or class NAME, a heading, a status string, a report header, is vocabulary. Delete the string assertion; keep the structural half of the same test if it has one (the element exists / is enabled / is focused / routes the click / renders N rows). A FORMAT is a contract when it is tested on the formatter (`formatCountdown(65_000) === '1:05'`), not on the DOM copy around it. Exceptions that ARE contracts: wire tokens and protocol strings (`'shell'`, `'fh'`, a `reason` code), storage keys, CSS class names the renderer switches on, `data-*` hooks, and a user-visible error's PRESENCE (`protocolVersionError(n)` tells a stale client to refresh — ONE test, not one per historical PV).
3. **Wall-clock (`CLOCK`).** Any `expect(elapsed/ms).toBeLessThan(budget)` over a real clock is deleted — the rule is explicit and the project has already re-based such pins under load four times (map 250 → 500 → 1500 ms; `machineGunFlashCost` red under the 12-shard sim). Record, per deleted pin, the NFR or story it cited (NFR23 500 mines; 9.10's `TICK_BUDGET_MS`; 8.15's flash cost) so the record says WHERE that budget is now checked: the batch-sim harness readouts and staging, never a vitest clock. A test that merely USES `performance.now()` / `Date.now()` as an input to a pure function is not a clock pin. Do not convert a clock pin into a call-count pin unless the count IS the contract ("drones evaluate only hulls inside sight" is a contract; "observe runs ≤ 4,000 segment tests" is geometry wearing a perf costume).
4. **CONFIG and geometry literals (`CONST` / `COINCIDENCE`).** `expect(CONFIG.x).toBe(literal)` with nothing but a number behind it is deleted (amendment 8). KEEP when the assertion states a RELATION that encodes a rule: `coverMin ≤ coverTarget ≤ coverMax`, `reloadMs ≥ durationMs`, rings strictly descend, `detect ≤ sight`, `rungs × 125 = radar`, a ladder is monotone, every catalog line has a tier array of length 5 (ship upgrades cap 5 is a ruled structure, not a number). KEEP a test that exercises the GENERATING function on a synthetic input (zone ladder clamps, NaN, empty ladder → formula fallback — amendment 8's own pattern). A pin that two separately ruled numbers are equal is `COINCIDENCE` — delete. **Ruled exception:** `shipClasses.test.ts`'s ratified class table ("exact Eric-approved values") is a deliberate identity pin by project-context.md Testing Rules ("any change to either table must update that test knowingly") — KEEP it, name it in the KEPT list, and do not extend the exception to other CONFIG blocks.
5. **Duplicates (`DUPLICATE`).** The same contract pinned in several files survives in ONE. `PROTOCOL_VERSION).toBe(91)` is pinned five times (`shared barrel.test.ts:475`, `shared radarRaster.test.ts:187`, `server denials.test.ts:275`, `server colyseus018.test.ts:249`, `client ordnanceMasksAreServerOnly.test.ts:149`), each with a changelog comment. The CONTRACT is the join gate's behavior (`colyseus018.test.ts`: current PV admitted, previous refused, next is the future) — keep that; the literal pins are a changelog that belongs in the `PROTOCOL_VERSION` doc block in `shared/src/index.ts` (it already is). Default: delete the five literals (Question 2 lets Eric keep one). `hullRepair.test.ts:51-82` duplicates `barrel.test.ts:575-587`.
6. **Tautologies (`TAUTOLOGY`).** A test whose expected value is computed by the same code path it tests, or whose non-vacuity is a planted value, is rewritten against an independent oracle or deleted. Independent oracles that LOOK like re-implementations and are KEEP: `perception.test.ts`'s visibility predicates (declared independent, header lines 102-105), `silhouette.test.ts:280+` shoelace / simple-polygon helpers.
7. **Skipped (`SKIPPED`).** `it.skip` / `it.todo` guards nothing. The two 9-13 wedge fixtures (`botReviewFixes.test.ts:700/712`) are deleted; the bot behavior they describe is already a residual risk in `spec-9-13`'s record — make sure a `deferred-work.md` entry carries the two seeds so nothing is lost.
8. **Seed outcomes (`SEED-OUTCOME`).** A pin on a number a seeded bot run produced (`landDamage).toBe(40)`, `levelCurve[1].n).toBe(200000)`, a prose line quoting those numbers) is not a rule of the harness; the contract is the harness's shape (the readout exists, aggregates over bot-matches, is finite, sums its parts). Rewrite to the shape or delete. Scripted-sink `winnerId` pins (matchTelemetry, sinkingWindow, abandon, reconnect, drones) are contracts — the test scripted the sink.
9. **Snapshots.** `goldenFrames.test.ts`'s 160-row battery is the regression lock on the anti-cheat chokepoint's output; KEEP, name the contract in a one-line comment; never re-record it in this story (no production change → it must not change).
10. **When unsure, the test stays** and is listed under "kept, contract named by comment". The failure mode to avoid is deleting a guard whose contract you did not understand; the failure mode Eric named is keeping one that has none.

### Known offenders — status on 2026-10-22 (verify, then record)

| Retro item | Where it was | Status now | What this story does |
|---|---|---|---|
| Word-police test (epic-8 am. 211) | `client/src/__tests__/copyWords.test.ts` | DELETED in 8.22 | Confirm absent; the rubric's VOCAB class is this ruling applied to the rest of the client suite |
| fogSmoke tautology (spec 8-0) | `server/scripts/fogSmoke.mjs` BAND phase | FIXED (commit d02b48f6; comment at `:320-334` — unfiltered window, 60–120 u shell assertion, fail-proven by a 90 u shift) | Record as fixed. fogSmoke is a live socket smoke, not in `npm run check`; its intermittent shell-reveal flake is 9.15's (deferred-work ~343) |
| 160-tick leader pin (am. 161(a)) | `server/src/__tests__/draft.test.ts` | FIXED (1500-tick stern-chase pins, `leaderDrafted` 0, `:151-159`) | Confirm; record |
| Perf pins that test geometry (am. 176, 223(f)) | the 200-puff `observe() × 20` pin in `smokeScreen.test.ts` | GONE — file deleted by 9.3 (commit 3ba8c277, the countermeasure replaced the smoke screen) | Record as gone with the mechanic; the live heirs of the SHAPE are the six CLOCK pins in the rubric |
| Smoke fixtures (am. 224(f)) | `smokeScreen.test.ts` fixtures re-laid with asserted distances | GONE — same deletion | Record |
| Phantom height raster (am. 231(l)) | gunnery rig (`gunnery.test.ts` / `botGunnery.test.ts`) | FIXED (flat raster, open-ocean probe asserts) | Confirm the flat raster is still built; record |
| "2,000 fuzz worlds" (spec 8-16) | `spec-8-16` AC (already corrected to "20 seeded worlds, the shipped size", `:107`); `spec-8-15-…:123` still says 2000 | Shipped size is 20 (`perception.test.ts:4387`) | Correct 8-15; stamp the deferred-work entry RESOLVED; raising the count is Question 4 |

### Suite shape (measured 2026-10-22 on 9c1aa81c — re-measure before quoting)

| Workspace | Runner | Files | Tests (vitest `passed`) |
|---|---|---|---|
| shared | vitest ^2.1 defaults, no config file | 47 (`shared/src/__tests__`) | 1177 |
| server | vitest ^2.1, `server/vitest.config.ts` (node, globals, `@salvo/shared` → `../shared/src/index.ts`) | 94 + 11 batchsim + 1 snapshot dir | 2793 passed + 2 skipped (2795) |
| client | vitest ^4.1 + jsdom ^29, `client/vitest.config.ts` (defines `__APP_VERSION__`, `__HC_PERF__=false`) | 134 + 3 audio | 4170 |
| hooks | bash, `npm run check:hooks` → `.claude/hooks/protect-claude-md.test.sh`, suite runs twice ([py] / [nopy]) | 1 | 266 passed (the tally line) |

- `npm test` runs the three workspaces SEQUENTIALLY (`&&`), not concurrently — the 2026-08-20 ledger note about three suites racing is stale; the clock pins still flake under any other load (the 12-shard sim, a second session).
- Vitest 2.x (shared/server) and 4.x (client) differ in API; do not assume parity when rewriting a test across workspaces.
- `shared/src/__tests__/hooks.test.ts` is game hook kinematics, not the Claude hook.
- ESLint IGNORES `**/__tests__/**` (`eslint.config.js:123`), so "lint complexity unchanged" is trivially true for this story; do NOT un-ignore tests here (deferred-work ~1406 → 9.16).

### How to run it (scale)

~290 files and ~8,000 tests must each be READ, not grepped. Use `/orchestrate`: one reading wave per workspace (Opus/Sonnet subagents, each given this rubric verbatim and a fixed slice of files, returning per-file: kept / rewritten / deleted rows with line numbers and reason classes), then the orchestrator applies the edits, runs the workspace suite, and the Fable hunters + Codex (`-m gpt-5.6-sol`, prompt via stdin) review the DIFF at the gate with one question: "does any deletion remove a guard whose contract was real?" Subagents never `git rm` (plain `rm`). Save every Eric-level question for the end of the run; never a questions file.

### Architecture invariants the audit must leave standing (and name as KEPT)

- Perception: nothing outside sight ∪ this-tick radar paints reaches a client, exactly SIX declared exceptions (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`) + the jamming-buoy fakes carve-out — `server/src/__tests__/perception.test.ts` (independent oracle, 20-world fuzz with non-vacuity counters, registry iteration so a signal cannot exist without coverage), `frames.test.ts`, `goldenFrames.test.ts`.
- `applyDamage` is the only hp write — `damageGate.test.ts` source scan of `world.ts` (the ONE `victim.hp -= dealt` line, the mine/decoy decrements, the hp-increase whitelist). This is a source-scan test and it is a CONTRACT (the fence has four spellings of the same defect — `eslint.config.js:95-100`).
- Bots never import `world.js` — `eslint.config.js:32-62` + `bots.test.ts:333/344/357`.
- Map determinism, zero transcendentals, zero I/O — `map.test.ts` fingerprints, `heightField`/`noise` determinism, the `/Date\.now/`-absent source scans.
- `effectiveStats()` parity and byte-identical folds — `shared stats.test.ts`, `shared/server boons.test.ts`; client/server sim parity — `client prediction.test.ts`.
- The ratified class table identity pin — `shipClasses.test.ts` (project-context.md names it).
- The join gate — `colyseus018.test.ts` (PV behavior, not the literal).
- Inputs enter only through `inputs.ts` (finite-checked, clamped) — `server/src/__tests__/inputs*.test.ts` if present; name it.
- The hook tripwire — `.claude/hooks/protect-claude-md.test.sh`, all cases.

### Previous-story intelligence (9.13, cycle 198, and the cycle 200–203 fixes)

- 9.13's gate report already named this story's debt: *"the one wall-clock pin (`machineGunFlashCost`) failed only under the concurrent 12-shard sim and passes alone"* and left two `it.skip` wedge fixtures "with numbers in their skip notes". Both are rubric rows above.
- Cycle 200's lesson (auto-memory `project_intel_zoom_waypoint`): camera tests must use MOVING ships — a fixture that holds a ship still can pass a contract the game never exercises. When rewriting a client test, keep the fixture realistic rather than minimal.
- Cycles 202–203 (the entire sweep) re-aimed several client scope suites; their titles now state behaviors ("a delivered hull is never softened by the sight boundary"). That is the house style for a title that names its contract.
- Every recent gate re-recorded `goldenFrames` only with a diff note naming the exact rows that moved. This story must not move any.

### Git intelligence (last 6 commits on development)

Cycle 203 (PR #301) and cycle 202 (PR #299) were client-only fixes with docs commits separated from code commits, each docs commit stamping both trackers, CHANGELOG and the amendment in one go. Follow that split: test edits per workspace in their own commits (one per workspace keeps the diff reviewable), then one docs/record commit.

### Project Structure Notes

- Audit record: `_bmad-output/implementation-artifacts/test-audit-2026-10-<dd>.md` (the AC's name; a new file, the only new non-test file).
- Rulings → `epic-9-context-amendments.md` (append-only, next number after the cycle-203 entries); open threads → `deferred-work.md`; per-cycle record → this story file's Dev Agent Record (there is no `spec-9-14` unless dev-auto makes one; if it does, the Verification section carries the before/after table too).
- Trackers are ONE-LINE stamps. Never narrative. Both in the same PR — this has bitten Eric three times.
- `CLAUDE.md` is frozen and hook-enforced; nothing in it changes (its stale `0.17.X` line is already reported, do not touch it).

### Project Context Rules (from `_bmad-output/project-context.md`)

- Testing Rules §: `npm run check` is the gate (lint + tsc ×3 + all tests + `check:hooks`); perception invariant tests are property-style and must stay green; the class table identity pin is deliberate; headless smokes need `HC_DEV_OPTIONS=1`; Vitest 2.x vs 4.x; **a test asserts a CONTRACT (amendment 243)**.
- Critical Don't-Miss: never invent mechanics or numbers; halt on ANY error and surface it; plans are one unit of work, ONE PR; `CLAUDE.md` frozen.
- Platform: branch from `development`, PR to `development`, Render deploys staging from it; never start the dev server in Eric's checkout (not needed here).
- American spelling in every file this story writes (favorite/color/specialize).

### References

- Story text: `_bmad-output/planning-artifacts/epics.md:2448-2462` (Story 9.14); epic intro `:2178-2180`.
- The rule: `_bmad-output/project-context.md:81`; `epic-8-context-amendments.md` 243 (`:556`), 211 (`:486`), 161 (`:373`), 176 (`:407`), 223 (`:512`), 224 (`:514`), 231; `epic-8-retro-2026-10-06.md:41`.
- Inherited rulings: `epic-9-context-amendments.md` 8 (`:27`), 9 (`:29`), 18 (`:51`); auto-memory `feedback_no_word_police_tests`, `feedback_no_ring_size_pins`, `feedback_coincidence_pins`, `feedback_subagent_no_git_rm`, `feedback_review_gate_on_fable`.
- Fuzz count: `server/src/__tests__/perception.test.ts:4387`; `spec-8-16-catalog-v3-shield-chaff-decoy.md:107`; `spec-8-15-the-gun-pick-and-the-class-shifts.md:123`; `deferred-work.md` ~2558.
- Clock-pin history: `deferred-work.md` ~1536 (map timing guard); `spec-9-13-bot-posture-workover.md` § Verification.
- ESLint test ignore: `eslint.config.js:123`; `deferred-work.md` ~1406.
- Scripts: root `package.json:16-19`.

## Questions for Eric (collected; answer before or during dev-story — none blocks reading the suite)

1. **Clock pins.** The rule says never wall-clock timing. Default: delete all six (`map` 1500 ms, `island` broadphase, `machineGunFlashCost`, `fogPerf`, `hitTargets` 500 mines, client `fogField`) and record where each budget is now watched (harness readouts / staging). Confirm, or name any you want kept as a loose order-of-magnitude guard.
2. **`PROTOCOL_VERSION` literal pins.** Five tests assert `PROTOCOL_VERSION === 91`; the join-gate behavior test stays regardless. Default: delete all five literals (the history lives in the `index.ts` doc block). Keep one?
3. **Client copy pins.** Default: every UI string equality goes, the structural half stays. Confirm there is no label whose exact text you want guarded.
4. **Fuzz worlds.** 20 shipped; the 8.15/8.16 specs said 2,000. Correct the record to 20 (default), or raise the count on purpose (cost: the perception suite's runtime scales with it)?
5. **Class table identity pin.** project-context.md keeps it deliberately; amendment 8's spirit would delete it. Default: KEEP (your earlier ruling stands until you change it).
6. **Filling the gaps.** Your brief asks for a SUFFICIENT suite, not only a smaller one. Default in this story: fill a gap only where a deletion created it, and list every other untested pure function / composition in the record's GAPS section. Alternative: fill the `shared/src/sim` gaps here too (pure functions, cheapest to test, highest value) and leave server/client gaps to 9.16. Which?

## Dev Agent Record

### Agent Model Used

Orchestrator: Claude Fable 5.1 (`claude-fable-5-1`). Readers/appliers: 21 Opus slices (3 shared, 9 server incl. batchsim, 9 client incl. audio) + 1 Opus gap-fill + 1 Opus gate-fix agent. Gate: 3 Fable hunters (one per workspace) + Codex `gpt-5.6-sol`.

### Debug Log References

- Baseline (real runs at 081f8f72): shared 1177 · server 2793 + 2 skipped · client 4170 · hooks 266.
- Slice reports and gate reports: the orchestrator's job scratch (`reports/*.md`), folded into `test-audit-2026-10-22.md`.
- Eric's eight answers (2026-10-22, AskUserQuestion): delete all six clock pins; delete all five PV literals; all copy pins go, no label exempt; fuzz stays 20; DELETE the class-table identity pin; fill shared sim gaps here; rename unclear titles, no comments; Opus readers.
- The hook denies edits under `.claude/hooks/` (observed when trying to replace the two "protects itself" wording cases) — recorded, not worked around.
- Codex first launch hung reading stdin (prompt passed as an argument); relaunched with the prompt on stdin.

### Implementation Plan

Per workspace: Opus readers own disjoint file slices, apply the story's rubric per `it(`, edit their own files, run only them; orchestrator runs the workspace suite + tsc, commits per workspace; shared gap-fill after the shared wave; three Fable hunters + Codex review the committed diff with one question; CONFIRMED findings patched (one: settings key reference derived from keyboard.ts); PLAUSIBLE applied where cheap (finite-positive envelopes, waves strictly decreasing, HUD columns fit the row); record + ledger + amendment + trackers; `npm run check`; one PR.

### Completion Notes List

- ✅ AC1 — every test file read in full (289 vitest files + the hook script); 190 whole tests deleted by reason class, ~700 rewritten, ~190 retitled; nothing deleted left a function without a contract test (replacements written where it would have).
- ✅ AC2 — known offenders verified and recorded (test-audit § (e)): copyWords absent; fogSmoke fixed; draft 1500-tick fixed; smokeScreen gone; gunnery flat raster fixed; fuzz = 20.
- ✅ AC3 — spec-8-15:123 corrected to 20; deferred-work fuzz entry RESOLVED; Eric: stay at 20.
- ✅ AC4 — `test-audit-2026-10-22.md` with the per-workspace table, deletion list, rewrite list, KEPT CONTRACTS with paths, known-offender table, GAPS, pyramid summary, gate readings.
- ✅ AC5 — sufficiency: every exported pure function in shared/src has a direct unit test (+37); server/client gaps listed for 9.16; pyramid summary per workspace.
- ✅ AC6 — no production code changed (`git diff 7907597b..HEAD -- . ':!*__tests__*'` = spec wording + docs/version); goldenFrames snapshot byte-identical; `npm run check` green (see File List run); both trackers stamped.
- Gate: shared build-on-it (0 CONFIRMED, P1/P2 applied); server build-on-it (0 CONFIRMED); client build-on-it (1 CONFIRMED patched: settings ↔ keyboard.ts; P1 applied); Codex: see test-audit § gate.
- Surfaced for Eric (not changed here): belt keys 1–6 vs "1 – 4" on settings + How-to-Play (production copy); the hook test's two wording cases; the per-rung ladder value tables; privacyPolicy verbatim pins; NFR6.

### File List

Tests (edited): every file under `shared/src/__tests__/` (47 → 49: + `effects.test.ts`, + `islandShape.test.ts`), `server/src/__tests__/` (94 → 92: − `fogPerf.test.ts`, − `machineGunFlashCost.test.ts`), `server/scripts/batchsim/__tests__/` (4 of 11 edited), `client/src/__tests__/` (134 → 132: − `noFishCopy.test.ts`, − `noDrawPileCounter.test.ts`), `client/src/audio/__tests__/` (3). Unchanged: `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap`, `.claude/hooks/protect-claude-md.test.sh`.
Docs: `_bmad-output/implementation-artifacts/test-audit-2026-10-22.md` (new), `epic-9-context-amendments.md` (213), `deferred-work.md`, `spec-8-15-the-gun-pick-and-the-class-shifts.md`, `sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/project-context.md` (Testing Rules), `CHANGELOG.md`, `VERSION`, `package.json`, `package-lock.json`, this story file.

### Change Log

- 2026-10-22 — Story 9.14 built (cycle 204, 0.18.69, PV 91 unchanged): the suite audited to contracts; counts in `test-audit-2026-10-22.md`.
