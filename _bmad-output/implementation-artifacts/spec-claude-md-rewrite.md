---
title: 'CLAUDE.md rewrite to current best practices + hook-enforced edit moratorium'
type: 'chore'
created: '2026-09-14'
status: 'in-review'
review_loop_iteration: 0
baseline_revision: 'ad1ed35'
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/project-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** `CLAUDE.md` is 302 lines / 145 KB — 115 KB of it a narrative "Key Decisions" ledger and ~30 KB a file-by-file codebase map. Official Claude Code guidance (code.claude.com/docs/en/memory and /docs/en/best-practices, fetched 2026-09-14) says: target **under 200 lines**; include only build commands, conventions, repo etiquette, environment quirks and gotchas Claude cannot derive from code; exclude file-by-file descriptions, architecture overviews, long explanations and frequently-changing numbers, because "bloated CLAUDE.md files cause Claude to ignore your actual instructions". Eric has ruled repeatedly that the file must stop growing, and the docs are explicit that CLAUDE.md is "context, not enforced configuration" — to block an action regardless of what Claude decides, use a `PreToolUse` hook.

**Approach:** (1) Move every long-form section out VERBATIM into on-demand docs under `docs/` (the BMAD `project_knowledge` folder), so nothing is lost and nothing loads per session. (2) Rewrite `CLAUDE.md` as a <200-line file holding only what the guidance says belongs there, with pointers to the rehomed docs; keep the `## Deploy Configuration` header and field lines in place because gstack's `/setup-deploy` and `/land-and-deploy` parse that section by header. (3) Make the moratorium HARD: a committed `.claude/settings.json` `PreToolUse` hook denies every Edit/Write/MultiEdit/NotebookEdit whose target is a `CLAUDE.md`, and every Bash command that writes to one; only Eric lifts it (launch with `HC_UNLOCK_CLAUDE_MD=1`, or remove the hook). (4) Correct the facts in `_bmad-output/project-context.md` that current code contradicts, since every dev-auto run loads it as a persistent fact. (5) Record the cycle: `VERSION` 0.17.133, one-line stamps in both trackers, a deferred-work entry, and the auto-memory rule updated (memory lives outside the repo — the orchestrator writes it).

### Eric's ask (2026-09-14, verbatim)
"look up the actual current best practices for CLAUDE.md, then redo the entire CLAUDE.md so it reflects that. If there is any info in there that has no other place but needs to come out, either make a memory of it or find some other solution. Then, put an absolute hard moratorium on editing that file any further without my explicit instructions. Use /orchestrate for implementation subagents."

### Orchestrator rulings
- **R1 Size/shape:** new `CLAUDE.md` ≤ 200 lines and ≤ 12 KB. Sections, in order: title + MORATORIUM block; what the project is + stack (≤ 6 lines); commands; layering + the invariants that make a locally-plausible change globally wrong (effectiveStats firewall, frames/perception chokepoint + six declared exceptions, CONFIG single source, PROTOCOL_VERSION bump + join gate, shared determinism at one 50 ms dt / no transcendentals in mapgen, world.ts + match.ts zero Colyseus, complexity ≤ 10 error, one-way client data flow, DOM only for chrome); repo etiquette (branch from `development`, worktree install first, never start the dev server, tracker stamps every landed PR, 0.17.X versioning, no game mechanics invented, halt on errors); where things live (pointers only); Deploy Configuration (compact, gstack-parseable); gstack `/browse` rule + skill routing (compact); directives. No test counts, PV numbers, or cycle narratives — those change and belong in code/trackers.
- **R2 Lossless rehoming, verbatim:** `docs/codebase-map.md` ← the three `#### Shared/Server/Client` per-file sections + `### Code Quality Conventions`; `docs/key-decisions.md` ← the entire `### Key Decisions` section; `docs/deploy.md` ← the "two environments" table, staging password, development flow and blind-spots text. Each file opens with a 4–6 line preamble: snapshot date 2026-09-14 (cycle 133), that it is NOT auto-loaded, that the canonical rulings are `epic-N-context-amendments.md` and the canonical map is the code, and that numbers inside may be stale. Bodies move byte-for-byte (headings may be re-levelled).
- **R3 Hook:** `.claude/settings.json` (new, committed — nothing under `.claude/` is tracked today; `.gitignore` only excludes `worktrees/` and `settings.local.json`) with one `hooks.PreToolUse` entry, `matcher: "Edit|Write|MultiEdit|NotebookEdit|Bash"`, `type: "command"`, `command: "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-claude-md.sh"`, `timeout: 10`. The script (committed, `chmod +x`) parses stdin with `python3` when present and falls back to grepping the raw JSON. Deny = exit 2 with a one-line stderr reason naming the moratorium and the unlock. Rules: file tools → deny when the basename of `tool_input.file_path` (or `notebook_path`) is `CLAUDE.md`, case-insensitive (macOS FS is case-insensitive). Bash → deny when the command mentions `CLAUDE.md` (case-insensitive) AND contains a write indicator (`>`, `tee`, `sed -i` / `--in-place`, `perl -i`, `cp|mv|rm|ln|dd|install|patch|truncate|touch|chmod`, `git checkout|restore|apply|revert|rm|mv`, `python|python3|node|ruby|perl|awk`). Read-only commands (`cat`, `grep`, `sed -n`, `head`, `wc`, `git diff/log/show`) pass. `CLAUDE.local.md` is NOT covered (personal escape hatch). `HC_UNLOCK_CLAUDE_MD=1` in the hook's environment → exit 0. Malformed/empty stdin → exit 0 (fail open; never crash the tool). Also add `CLAUDE.local.md` to `.gitignore`.
- **R4 Hook test:** `.claude/hooks/protect-claude-md.test.sh` feeds fixture JSON through the script and asserts exit codes for every row of the I/O matrix; wired as root `npm run check:hooks` and appended to root `npm run check`.
- **R5 project-context.md:** corrections ONLY where current code contradicts it (grep-verify each before editing): PROTOCOL_VERSION "currently 3" → "currently 49 (`shared/src/index.ts`)"; `rollOffer` → `drawOffer` (`shared/src/sim/deck.ts`) with the `BoonOffer` held server-side; `WeaponSystem` / `weapons/` → `Equipment` / `server/src/game/equipment/`; "Cruiser byte-for-byte" → the PvE-fleet envelope identity test on `shipClasses`; "653 tests" → "all tests (the count changes every cycle)"; "Win checks are human-gated; drones …" → afloat PARTICIPANTS (`role !== 'fleet'`; bots contest the win, fleet hulls are excluded); versioning "0.X.0 = features…" → frozen at 0.17.X (X = landed build cycle) until all epics complete; `date` / "Last Updated" → 2026-09-14; add one rule: "CLAUDE.md is frozen and hook-enforced — new agent rules go HERE or to auto-memory, never to CLAUDE.md"; add a pointer to the three `docs/` files. Nothing else in that file moves.
- **R6 Cycle record:** `VERSION` + root `package.json` → `0.17.133`; `sprint-status.yaml` header `last_updated` prefix + ONE interstitial-index line for cycle 133; `gds-workflow-status.yaml` `last_updated` prefix; `deferred-work.md` gains ONE entry: full `project-context.md` regeneration via `gds-generate-project-context` (only contradicted facts were corrected this cycle). `CHANGELOG.md` is NOT touched (player-facing, stops at 0.17.0). `PROTOCOL_VERSION` unchanged at 49.
- **R7 Not adopted, deliberately:** `.claude/rules/` (the invariants fit in CLAUDE.md; a second mechanism is not needed) and `@imports` (imported files still load at launch, so they do not reduce context).

## Boundaries & Constraints

**Always:**
- Every sentence removed from `CLAUDE.md` exists verbatim in one of the three `docs/` files, or is a stale number/narrative the new file replaces with a pointer; the implementer proves it with a script (every non-blank line of each moved section is found in its destination file).
- The `## Deploy Configuration (configured by /setup-deploy)` header, its `- Key: value` lines and the `### Custom deploy hooks` sub-block stay in `CLAUDE.md` in that shape; `sed -n '/## Deploy Configuration/,/^## /p' CLAUDE.md` still returns them.
- The moratorium block at the top of `CLAUDE.md` names the hook path, the unlock env var, and says `/setup-deploy` is also blocked while frozen.
- `npm run check` passes (lint + type-check + all tests + the hook test).
- Verbatim moves are done by Sonnet-class mechanical agents; the new `CLAUDE.md` body is written by the orchestrator (a doc file, per the orchestrate skill) and adversarially reviewed by a Fable reviewer plus a Codex cross-model pass.

**Block If:**
- The gstack skills parse any CLAUDE.md section OTHER than `## Deploy Configuration` (checked 2026-09-14: only that section is read — `setup-deploy/SKILL.md:554,673`, `land-and-deploy/SKILL.md:717,756,911,1256`).

**Never:**
- Touch gameplay code, `shared/`, `server/src`, `client/src`, DESIGN.md, the GDD, or any `epic-N-context-amendments.md` (append-only ledgers; nothing here is a new ruling).
- Rewrite, condense or "improve" the moved text — it moves byte-for-byte.
- Add an in-band bypass to the hook that an agent could trigger from a Bash command (the unlock is an environment variable Eric sets when launching Claude, or removing the hook himself).
- Edit `README.md`, `CHANGELOG.md`, or the memory directory from a subagent (memory is per-user and outside the repo; the orchestrator writes it).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit tool on root file | `tool_name=Edit`, `file_path=/…/salvo/CLAUDE.md` | exit 2, stderr names moratorium + unlock | Tool call blocked |
| Write tool, nested / worktree path | `tool_name=Write`, `file_path=/…/.claude/worktrees/x/CLAUDE.md` | exit 2 | Blocked |
| Case variant | `file_path=…/claude.md` | exit 2 | Blocked (case-insensitive FS) |
| Bash in-place edit | `command="sed -i '' 's/a/b/' CLAUDE.md"` | exit 2 | Blocked |
| Bash heredoc overwrite | `command="cat > CLAUDE.md <<'EOF' …"` | exit 2 | Blocked |
| Bash read | `sed -n 1,40p CLAUDE.md` / `grep -n foo CLAUDE.md` / `git diff CLAUDE.md` | exit 0 | Allowed |
| Other file | `Edit` on `README.md`; Bash `echo x > notes.md` | exit 0 | Allowed |
| CLAUDE.local.md | `Write` on `CLAUDE.local.md` | exit 0 | Allowed (personal file) |
| Unlock | `HC_UNLOCK_CLAUDE_MD=1` in env, `Edit` on `CLAUDE.md` | exit 0 | Allowed |
| Malformed stdin | empty or non-JSON stdin | exit 0 | Fail open, never crash the tool |

</intent-contract>

## Code Map

- `CLAUDE.md` -- the 302-line source; sections at lines 3 (Project), 9 (Commands), 24–104 (Architecture per-file maps), 105 (Code Quality), 111–169 (Key Decisions, 115 KB), 170 (gstack), 216 (Dev Server), 222 (Design System), 230–280 (Deploy Configuration + envs + flow), 281 (Directives), 285 (Skill routing)
- `_bmad-output/project-context.md` -- BMAD agent rules, dated 2026-07-17, loaded by every dev-auto run; stale facts listed in R5
- `.gitignore` -- add `CLAUDE.local.md`
- `package.json` (root) -- `check` script gains `check:hooks`
- `VERSION`, `package.json` -- 0.17.132 → 0.17.133
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- header `last_updated` + interstitial index (the cycle 132 line near line 145 is the model)
- `_bmad-output/gds-workflow-status.yaml` -- `last_updated` one-line prefix
- `_bmad-output/implementation-artifacts/deferred-work.md` -- one new entry
- `/Users/ericseibt/Code/salvo/.claude/skills/gstack/{setup-deploy,land-and-deploy}/SKILL.md` -- READ ONLY (untracked, main checkout): proves which CLAUDE.md section is parsed

## Tasks & Acceptance

**Execution:**
- [ ] `docs/codebase-map.md`, `docs/key-decisions.md`, `docs/deploy.md` -- create by verbatim move per R2 with preambles -- lossless rehoming
- [ ] `.claude/hooks/protect-claude-md.sh`, `.claude/hooks/protect-claude-md.test.sh`, `.claude/settings.json`, `.gitignore`, root `package.json` (`check:hooks`) -- per R3/R4 -- the hard moratorium
- [ ] `_bmad-output/project-context.md` -- per R5, each fact grep-verified -- stop feeding dev-auto wrong facts
- [ ] `VERSION`, root `package.json`, `sprint-status.yaml`, `gds-workflow-status.yaml`, `deferred-work.md` -- per R6 -- cycle record
- [ ] `CLAUDE.md` -- rewrite per R1 (orchestrator) -- the deliverable
- [ ] Memory `feedback_never_edit_claude_md.md` + `MEMORY.md` line -- orchestrator, outside repo -- durable rule with the hook + unlock recorded

**Acceptance Criteria:**
- Given the rewritten repo, when `wc -l CLAUDE.md` and `wc -c CLAUDE.md` run, then lines < 200 and bytes ≤ 12288.
- Given the old `CLAUDE.md` (git `HEAD`), when every non-blank line of its Architecture, Key Decisions and deploy-narrative sections is searched in the corresponding `docs/` file, then every line is found.
- Given the hook installed, when `bash .claude/hooks/protect-claude-md.test.sh` runs, then every row of the I/O matrix passes.
- Given `npm run check`, when it runs in the worktree after `npm install --include=dev` + `npm run build -w shared`, then it exits 0.
- Given the new `CLAUDE.md`, when `sed -n '/## Deploy Configuration/,/^## /p' CLAUDE.md` runs, then the Platform / Production URL / Staging URL / Deploy workflow / Merge method / Post-deploy health check lines and the `### Custom deploy hooks` block are returned.
- Given `_bmad-output/project-context.md`, when grepped for `rollOffer`, `WeaponSystem`, `currently 3)`, `653 tests`, `Cruiser`, then none match.

## Spec Change Log

- **2026-09-14, mid-implementation, Eric ruling (verbatim):** *"You can remove anything related to gstack skills, i am no longer using them for this project in any capacity. That should be with respect to 'setup-deploy' and other deploy process stuff."* Consequences: the `## Deploy Configuration (configured by /setup-deploy)` parse-shape constraint in R1 / "Always" / AC 5 is RETIRED (there is no consumer); `CLAUDE.md` now carries a plain `## Deploy` section (Render, two environments, flow, 401 note, staging blind spots) and a `## Skills` section naming only project-local skills plus an explicit "gstack is not used" line; the gstack routing table and `/browse` rule are deleted, not archived (the skills are self-listing). `docs/deploy.md`'s preamble marks its `/setup-deploy` / `/land-and-deploy` mentions as historical. The intent-contract text is left as written (read-only in step-03); this entry supersedes it. Also retired with the gstack block: the "never use `mcp__claude-in-chrome__*` tools" line, whose rationale was "use gstack `/browse` instead" — no browsing rule ships; flagged to Eric in the run report. KEEP: everything else in R1–R7.
- **2026-09-14, review gate (Fable adversarial + Edge Case Hunter + Codex):** hook hardening rulings recorded in the fixer dispatch — target-scoped redirect/verb tests (a commit message naming CLAUDE.md must pass), `sed -i` in any spelling, quote/backslash normalization, no here-strings (fail-closed guard when a file-tool path is unextractable but the payload names claude.md), project-scoped file-tool arm, extended writer verbs, fallback parser decodes `\n`/`\t` escapes and is scoped to `tool_input`, exact-token match for `claude.md`. Truncated-but-legible JSON naming the file now DENIES in fallback mode (conservative) — the I/O row "malformed stdin → exit 0" is narrowed to "unparsable AND not naming the file". `.claude/settings.json` uses `${CLAUDE_PROJECT_DIR:-.}`. The indirection gap (variables, symlinks, scripts, `git reset --hard`) is ledgered in deferred-work, not closed: the content-based `PostToolUse` auto-revert was REJECTED because it would destroy Eric's own concurrent hand edits.

## Review Triage Log

### 2026-09-14 — Review pass (Fable adversarial + Blind Hunter + Edge Case Hunter + Codex gpt-5.5, deduplicated)
- intent_gap: 0
- bad_spec: 0
- patch: 23: (high 8, medium 4, low 11)
- defer: 4: (high 0, medium 1, low 3)
- reject: 4: (high 0, medium 0, low 4)
- addressed_findings:
  - `[high]` `[patch]` Bash redirect/verb tests matched anywhere in the command → any commit/PR message naming CLAUDE.md with the `<noreply@…>` trailer, and heredoc writes to OTHER files, were denied. Fixed: quote-aware tokenizer, redirect denies only when the NEXT word is a protected target, verbs only in COMMAND POSITION of their `|;&` segment (after `VAR=` prefixes and `sudo/env/xargs`-class wrappers). (Fable #1, Blind Hunter #3, Edge Case #4/#5, orchestrator probe F14)
  - `[high]` `[patch]` `sed -i` only caught as first flag with trailing space; `-E -i ''`, `-i.bak`, `-i''`, `-e … -i` passed. Fixed: in-place flag anywhere in sed/gsed/perl argv when sed is the command. (Fable #2, Edge Case #1, Blind Hunter #2)
  - `[high]` `[patch]` Obfuscated spellings (`CLAUDE'.'md`, `C\LAUDE.md`) passed. Fixed: tokens unquoted before every name test; `claude.local.md` blanked after. (Codex, reproduced)
  - `[high]` `[patch]` Python-branch here-string needs a temp file; where that fails the hook exited 0 = fail-open. Fixed: `\x1f`-joined fields split by parameter expansion, no here-strings/heredocs/temp files; fail-CLOSED guard when a file-tool path is unextractable but the payload names a protected file. (Codex, confirmed)
  - `[high]` `[patch]` The hook did not protect itself: Edit/Write on the hook script or `.claude/settings.json`, and an unlock written into `settings.local.json`, all passed. Fixed: `.claude/hooks/**` and `.claude/settings.json` path-denied under project scoping; any tool payload naming `HC_UNLOCK_CLAUDE_MD` denied. (Blind Hunter #1)
  - `[high]` `[patch]` `project-context.md` asserted the fleet envelopes are the prototype kinematics "byte-for-byte" while the same PR's errata said the opposite. Fixed per `shipClasses.test.ts` header. (Blind Hunter #5)
  - `[high]` `[patch]` Fallback (no-python3) parser never decoded `\n`/`\t` escapes and grepped the first `file_path` outside `tool_input`. Fixed. (Edge Case #8/#9)
  - `[high]` `[patch]` Missing writer verbs (`rsync curl wget sponge ex vim ed bun deno npx tsx unzip tar unlink shred`, `find -delete/-exec`, git options before the subcommand, `git stash/reset` with a path). Added, all target-scoped. (Edge Case #2, Blind Hunter #2)
  - `[medium]` `[patch]` `.claude/settings.json` command resolved to `/.claude/…` when `CLAUDE_PROJECT_DIR` is unset → `${CLAUDE_PROJECT_DIR:-.}`. (Edge Case #11)
  - `[medium]` `[patch]` `CLAUDE.md` overclaimed "denies every Bash write" → "denies every direct edit … a tripwire, not a wall". (Fable #3, Blind Hunter #2)
  - `[medium]` `[patch]` Test harness continued after `mktemp`/symlink failure with 62 misleading failures → fails fast. (Codex)
  - `[medium]` `[patch]` File-tool arm froze Eric's user-global `~/.claude/CLAUDE.md` → project-scoped (relative, or under `CLAUDE_PROJECT_DIR`; worktrees stay covered). (Fable #7, Blind Hunter #4)
  - `[low]` `[patch]` `CLAUDE.md` inherited the false "roster is the only synced schema"; `project-context.md` had the same → both now list roster + map seed/radius + zone rings + `matchPhase` + `bountyId`, nothing per-ship spatial. (Fable #5, Blind Hunter #11)
  - `[low]` `[patch]` sprint-status stamp said `302→85 lines`; file is 74 → fixed; auto-memory corrected by the orchestrator. (Fable #4, Blind Hunter #6)
  - `[low]` `[patch]` `project-context.md` carried a per-cycle literal ("0.17.133 at this edit") → rule only. (Fable #6)
  - `[low]` `[patch]` "If a line here is stale, say so and stop" read as abandon-the-task → "do not fix it here". (Blind Hunter #12)
  - `[low]` `[patch]` `CLAUDE.md` "NEVER run the dev server" contradicted Eric's worktree guidance in auto-memory → never in his checkout; your own worktree may, kill it after; never touch a server you didn't start. (Blind Hunter #13)
  - `[low]` `[patch]` `docs/deploy.md` preamble referred to `/setup-deploy` mentions that no longer existed, and the retired field block was dropped → block archived verbatim under "Retired", preamble corrected. (Edge Case #13, Blind Hunter #8)
  - `[low]` `[patch]` `docs/codebase-map.md` carried the fleet-fit error with no errata while `key-decisions.md` did → errata added. (Edge Case #14)
  - `[low]` `[patch]` Spec Verification still listed the retired `## Deploy Configuration` parse check → struck, replacement added. (Edge Case #15)
  - `[low]` `[patch]` Deny message untested → six stderr assertions. (Blind Hunter #10)
  - `[low]` `[patch]` `notclaude.md` denied by Bash but allowed by Edit → exact-token match. (Edge Case #6)
  - `[low]` `[patch]` Writes aimed at `CLAUDE.local.md` were tested against the unstripped text → tests run on the stripped/normalized tokens. (Edge Case #7)
- deferred (entries appended to deferred-work.md): the tripwire-not-a-wall indirection gap with the rejected `PostToolUse` auto-revert (medium); `client/scripts` perf rigs resolving Playwright from gstack's install (low); pre-existing YAML parse defect in `gds-workflow-status.yaml` (low); full `project-context.md` regeneration (low).
- rejected: "docs/ is not BMAD `project_knowledge`" (it is — `_bmad/bmm/config.yaml` sets it); "the errata preamble is unreviewed corrective content" (kept by orchestrator ruling — the body is verbatim, the preamble warns at the point of reading, and every erratum was confirmed against code by two reviewers); "unlock should accept `true`/`yes`" (strict `1` is what every message and doc says); "truncated-but-legible JSON should exit 0" (narrowed by ruling to fail-closed when the payload names the file — the conservative direction).

## Verification

**Commands:**
- `wc -l CLAUDE.md && wc -c CLAUDE.md` -- expected: `<200` lines, `≤12288` bytes
- `bash .claude/hooks/protect-claude-md.test.sh` -- expected: all cases PASS, exit 0
- `npm run check` -- expected: exit 0 (lint, tsc ×3, all tests, hook test)
- ~~`sed -n '/## Deploy Configuration/,/^## /p' CLAUDE.md | grep -c '^- '` -- expected: ≥ 10~~ RETIRED (Spec Change Log 2026-09-14: gstack gone, no parser). Replacement: `sed -n '/^## Deploy/,/^## /p' CLAUDE.md | grep -c '^- '` -- expected: ≥ 5
- verbatim-move proof script (see AC 2) -- expected: prints no `MISSING:` line

## Auto Run Result

**Summary.** `CLAUDE.md` rewritten from 302 lines / 145 KB to 74 lines / 9.2 KB per the official Claude Code guidance (target < 200 lines; commands, conventions, etiquette, invariants and gotchas only; no file-by-file maps, no changing numbers). Every long-form section moved BYTE-FOR-BYTE to `docs/codebase-map.md`, `docs/key-decisions.md` and `docs/deploy.md` (proven by a line-set script and `cmp`), each with a preamble and an errata list for facts the 2026-09-14 audit found stale or wrong. A committed `PreToolUse` hook (`.claude/settings.json` → `.claude/hooks/protect-claude-md.sh`, 266 test assertions across two parser modes, wired into `npm run check` as `check:hooks`) makes the moratorium hard for direct edits and protects itself; only `HC_UNLOCK_CLAUDE_MD=1` at launch (or removing the hook) lifts it. Eric's mid-run ruling retired gstack from the project, so the deploy section is plain and no gstack routing remains. `project-context.md` had seven contradicted facts corrected. `VERSION` 0.17.133; trackers stamped; auto-memory updated (outside the repo).

**Files.** `CLAUDE.md` (rewrite) · `docs/codebase-map.md`, `docs/key-decisions.md`, `docs/deploy.md` (new, verbatim archives) · `.claude/settings.json`, `.claude/hooks/protect-claude-md.sh`, `.claude/hooks/protect-claude-md.test.sh` (new — first tracked files under `.claude/`) · `.gitignore` (+`CLAUDE.local.md`) · `package.json` (`check:hooks`, version) · `package-lock.json`, `VERSION` (0.17.133) · `_bmad-output/project-context.md` (fact corrections + frozen-file rule) · `sprint-status.yaml`, `gds-workflow-status.yaml` (one-line stamps) · `deferred-work.md` (4 entries) · this spec.

**Review.** Four reviewers (Fable adversarial, Blind Hunter, Edge Case Hunter, Codex gpt-5.5): 23 patches applied (8 high), 4 deferred, 4 rejected — see the Review Triage Log. Both model families independently flagged the here-string fail-open and the `sed -i` gap; Codex alone found the quote/backslash obfuscation (confirmed); the Blind Hunter alone found that the hook did not protect itself (confirmed, fixed).

**Verification.** `npm run check` green three times (last run after the final hook change): shared 784, server 1728, client 3260 tests, 266 hook assertions, lint + tsc ×3 clean. 30 orchestrator hand probes (commit with attribution trailer → allowed; obfuscated spellings, self-edit of the hook, unlock written into settings.local.json → denied; unlock env → allowed; bad `TMPDIR` → still denied). `wc -l CLAUDE.md` = 74, `wc -c` = 9192. Verbatim-move proof: 0 missing lines in all three ranges.

**Residual risks.** (1) The hook is a tripwire, not a wall (variables, symlinks, `bash -c '…'`, script contents, pathless `git reset --hard` pass) — ledgered with the rejected `PostToolUse` auto-revert. (2) The hook goes live only in sessions launched from a checkout that has `.claude/settings.json`; Claude Code may ask Eric to approve the project hook once. (3) `docs/` archives carry known-stale narrative by design; their preambles say so. (4) Two client perf scripts still resolve Playwright from gstack's install — ledgered.
