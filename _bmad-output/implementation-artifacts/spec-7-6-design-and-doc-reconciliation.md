---
title: 'Story 7-6: Design & Doc Reconciliation'
type: 'chore'
created: '2026-08-21'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-7-6-doc-reconciliation-questions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
warnings: ['multiple-goals']
blocking_condition: 'intent gaps — 28 decisions listed in the question gate; the AC itself requires a with-Eric pass'
---

<intent-contract>

## Intent

**Problem:** The design source of truth no longer describes the shipped game. DESIGN.md and
EXPERIENCE.md were ratified 2026-07-16, before the hex→real-time conversion and before six epics of
ratified amendments; the GDD still promises a cannon, a decoy buoy, hydrophones as "design law",
three storm ring groups and instant re-queue; `game-architecture.md` still directs future work at a
retired portal launch; and CLAUDE.md — loaded into every AI session in this repo as ground truth —
states a wrong `PROTOCOL_VERSION`, a deleted offer API, a non-existent file and an architecture
inventory missing fifteen `shared/` modules.

**Approach:** One reconciliation pass over ~17 documentation surfaces, driven by evidence rather
than memory: every change traces to shipped code (`file:line`) or to a ratified amendment. The
aesthetic and interaction *spine* carries forward untouched; only claims contradicted by the shipped
build are struck or replaced. Decisions resolved during Epics 1–6 are written back as decisions.
Historical records (decision logs, retros, dated specs, the rescope proposal) are preserved — the
portal sweep is a reconciliation, not a find-and-delete.

## Boundaries & Constraints

**Always:**
- Every edit cites shipped code or a ratified amendment. No claim is "corrected" from memory.
- The aesthetic direction and interaction grammar carry forward unchanged (DESIGN.md's palette,
  typography, spacing, motion, Do's and Don'ts; EXPERIENCE.md's accessibility floor, helm rows,
  HUD zone anatomy).
- A document that legitimately records superseded history stays as written; supersession is marked
  with a dated stamp, never by editing the body.
- Ratified copy is never re-mixed or re-authored by the implementer (epic-6 amendments 25 and 41).
  Where copy must change, it is Eric's to author.
- `epic-7-context-amendments.md` gets the durable entry for every ruling taken here, in the same
  change that applies it.
- Both trackers (`sprint-status.yaml`, `gds-workflow-status.yaml`) are updated in this same PR.

**Block If:**
- Any of the 28 decisions in the question gate is unanswered AND its Recommended default would
  retire a ratified design law, delete a document, or change shipped code. Specifically: **B1**
  (the reserved-band violation), **D1** (Tab vs SPACE-hold), **D2** (ratifying draft copy), and
  **G6** (deleting the root DESIGN.md/TODOS.md) may not proceed on an implementer default.
- The pass would require inventing game mechanics, balance values, or player-facing copy.

**Never:**
- No gameplay, balance, wire or render change. `PROTOCOL_VERSION` stays **47** and no `CONFIG` value
  moves. The single permitted code touch is documentation-adjacent: stale comments and, if B1 is
  answered option 1, the palette + its missing test.
- Do not retire the 0.17.X versioning scheme or rewrite the Deploy Configuration block — Story 7.7
  owns both, and it has not shipped.
- Do not absorb Story 7.8's work (`loadTest.mjs`, the unauthenticated solo-create cost vector) even
  though the ledger currently misattributes both to 7-6.
- Do not regenerate, prune or rewrite any `epic-N-context-amendments.md`; those are append-only.
- Do not edit the ratified mockup bodies — a dated stamp only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Doc claim contradicted by code | DESIGN.md says "Four launch classes"; `constants.ts:1856` has three | Doc is corrected to the shipped truth, citing the source | If the code is ambiguous, the item becomes an Eric question, not a guess |
| Doc claim contradicted by a ruling | EXPERIENCE.md specs the sailable waiting room; epic-6 amendments 1/8 replaced it | Doc restated to the ruling; amendment cited inline | If two rulings conflict, the later one governs and the conflict is recorded |
| Doc is right, code is wrong | DESIGN.md:168 reserves the phosphor band; cycle-125 hues violate it | HALT to Eric (B1) — never "reconcile" by weakening the doc | — |
| Historical record mentioning a retired plan | The 2026-08-18 rescope proposal; the epic-6 retro | Preserved; superseding stamp where it reads as live guidance | Never edit the body of a dated record |
| Resolved open question | OQ#20 foghorn key = F (epic-4 amendment 56) | Written back as a decision with its source | If no ruling and no code settles it, it stays open (OQ#9/#12/#24) |
| Ledger entry homed at the wrong story | `deferred-work.md:1065-1067` names 7-6 for `loadTest.mjs` | Re-homed to 7.8 | — |

</intent-contract>

## Code Map

Documentation surfaces, in descending order of edit volume:

- `_bmad-output/game-architecture.md` (1011 lines) -- 14 live-and-stale portal/Chromebook sites
- `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` (440) -- catalog, storm, sensors, hydrophones, bounty, re-queue, portal
- `_bmad-output/planning-artifacts/ux-designs/.../EXPERIENCE.md` (279) -- ~15 contradictions, 25 OQs, 6 undescribed surfaces
- `_bmad-output/planning-artifacts/ux-designs/.../DESIGN.md` (270) -- 9 contradictions, 6 inline OQ markers, 1 Chromebook rider
- `_bmad-output/planning-artifacts/epics.md` -- NFR6, UX-DR registry (11/12/14/19/27/30/36), Story 0.4's purpose clause
- `CLAUDE.md` -- PV, test count, Architecture inventory, Key Decisions gap (amendments 32-37)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- duplicate stamp, 13,074-char line, currency
- `_bmad-output/gds-workflow-status.yaml` -- `next_expected` stale by 16 cycles, 24,801-char line
- `_bmad-output/implementation-artifacts/deferred-work.md` -- re-homing, stale-open entries
- `_bmad-output/planning-artifacts/gdds/.../epics.md`, `decision-log.md` -- portal residue (log is historical)
- `_bmad-output/planning-artifacts/briefs/.../brief.md` -- monetization/distribution premise (G2)
- `_bmad-output/planning-artifacts/ux-designs/.../review-*.md`, `validation-report.md` -- severity basis (G3)
- `README.md` -- "Real-Time Prototype" title; the "still lives on main" claim
- `/DESIGN.md`, `/TODOS.md` -- deprecated hex-era roots (G6)
- `client/src/portal/*.ts`, `client/src/ads/*.ts` -- comments only, if G1 = yes
- `shared/src/constants.ts:1631` -- stale offer comment; `:1997-1998` reserved-band claim (if B1 = option 2)
- `client/src/__tests__/tokens.test.ts` -- the missing Regatta-vs-band pin (B1, either option)

## Tasks & Acceptance

**Execution:** (ordered; wave 1 cannot start until the gate is answered)

- [ ] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- append the amendment recording every gate answer and every implementer default taken -- durable home; the context file is regenerable
- [ ] `CLAUDE.md` -- PV 41→47 + the missing 46→47 bump; rewrite the Architecture inventory; correct the offer API and the "3 from 3 categories" claim; add Key Decisions for amendments 32-37 incl. balance cycle 122; fix the sudden-death arithmetic; strike "still lives on main"; stamp the true test count (F1) -- it is the ground truth every session loads
- [ ] `_bmad-output/planning-artifacts/ux-designs/.../DESIGN.md` -- the 9 contradictions; close the 6 inline OQ markers per C1/C2; the C3 rider; the C4 component rows -- design source of truth
- [ ] `_bmad-output/planning-artifacts/ux-designs/.../EXPERIENCE.md` -- the ~15 contradictions; write back 22 resolved OQs; D1-D5; describe the 6 shipped surfaces it omits -- peer interaction contract
- [ ] `_bmad-output/planning-artifacts/gdds/.../gdd.md` -- E1-E4; catalog (cannon→broadside, decoy→radar buoy, captive mines, exclusivity gone); storm 3→4 groups; blip payload; bounty bloom; roster/ocean scaling; portal sweep -- gameplay design source of truth
- [ ] `_bmad-output/planning-artifacts/epics.md` -- NFR6 (E5); the UX-DR registry entries superseded by later rulings; Story 0.4's purpose clause; remaining portal residue
- [ ] `_bmad-output/game-architecture.md` -- the 14 live-and-stale sites, incl. the source-tree map's `pokiAdapter.ts`/`crazyAdapter.ts` direction and the G5 rationale note
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- delete the spurious `0.17.120` duplicate and correct amendment 29→32 (F3); currency to cycle 126; F4 if approved
- [ ] `_bmad-output/gds-workflow-status.yaml` -- correct `next_expected` (0.17.109, amendments 20-28); add the 2026-08-18 rescope key; F4 if approved
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- re-home per A2; close the entries this cycle discharges; add any new ledger entries
- [ ] `README.md` -- the prototype title and the "still lives on main" claim
- [ ] `/DESIGN.md`, `/TODOS.md` -- per G6
- [ ] `client/src/__tests__/tokens.test.ts` -- pin the Regatta wheel against the reserved-band predicate, whichever way B1 resolves -- the absence of this pin is why the violation shipped
- [ ] `shared/src/constants.ts` -- the stale offer comment at `:1631`; the reserved-band claim at `:1997-1998` if B1 = option 2
- [ ] `VERSION`, `package.json` -- 0.17.126

**Acceptance Criteria:**
- Given DESIGN.md and EXPERIENCE.md after the pass, when any statement about shipped behaviour is
  checked against `client/`, `server/` or `shared/`, then it is true or explicitly marked as a
  deferred/unbuilt future feature.
- Given the aesthetic and interaction spine (palette, typography, spacing, motion, accessibility
  floor, helm rows, HUD anatomy), when the diff is reviewed, then those sections are unchanged
  except where an Eric answer in this gate directed otherwise.
- Given a document that records superseded history, when the diff is reviewed, then its body is
  unedited and any supersession is a dated stamp.
- Given CLAUDE.md after the pass, when every checkable claim is verified against the repo, then
  none is false — specifically PV, the test count, the offer API, and every path in the
  Architecture inventory.
- Given `npm run check`, when it runs, then it is green and the new reserved-band pin fails against
  the pre-fix palette (proving it is non-vacuous).
- Given the portal/Chromebook sweep, when it is reviewed, then no live requirement, NFR or
  architecture decision still directs future work at a retired target, and every historical record
  of the retired plan survives.
- Given `_bmad-output/implementation-artifacts/epic-7-context-amendments.md`, when the cycle lands,
  then every gate answer and every implementer default is recorded there with its date and source.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why this halted rather than doing the mechanical half first.** A large share of the work needs no
ruling and is fully staged (listed in the gate document). It is deliberately not started, for two
reasons. The story's own AC makes this a with-Eric pass on the design source of truth — the
document whose authority *is* Eric's ratification. And the answers reshape the mechanical work
rather than sitting beside it: B1 decides whether DESIGN.md's reserved-band law is restated or
retired, D1 decides whether nine EXPERIENCE.md passages are corrected or the code owes a revert, and
A1 decides whether twelve further surfaces are in scope at all. Editing first and asking second
would mean rewriting the same passages twice.

**The one place the usual direction reverses.** Reconciliation normally means "the doc is stale,
the code shipped, fix the doc." B1 is the exception: DESIGN.md's reserved-band law is correct and
the palette that shipped yesterday violates it. Recording the violation as though it were the
decision would launder a defect into a design law, so it goes to Eric instead.

**Why the sweep classifies rather than deletes.** Roughly 60% of portal/Chromebook hits are in
dated records — the rescope proposal itself (the authority for the retirement), decision logs,
retros, shipped specs. Deleting those falsifies the project's own history, and the rescope proposal
would end up not mentioning the thing it retired. Only live requirements, NFRs and architecture
decisions that still direct future work are struck.

## Verification

**Commands:**
- `npm run check` -- expected: green; the new reserved-band pin present and non-vacuous
- `npm run lint` -- expected: clean (only comment-level source edits are in scope)
- `git diff --stat` -- expected: overwhelmingly `_bmad-output/` + `CLAUDE.md` + `README.md`; source
  changes limited to comments, the tokens test, and (only under B1 option 1) the palette

**Manual checks:**
- Grep the four main docs for the retired terms (`Gunboat`, `cannon`, `decoy`, `Poki`, `CrazyGames`,
  `Chromebook`, `hydrophone`, `Listening Ring`, `SPACE to refit`, `instant re-queue`) and confirm
  every survivor is inside a dated historical record.
- Confirm both tracker files parse and that `sprint-status.yaml` no longer contains `0.17.120`.
- Confirm every question in the gate document has either an Eric answer or a recorded default in the
  amendment entry.

## Auto Run Result

Status: **blocked**
Blocking condition: **intent gaps** — Story 7-6's own acceptance criteria require a with-Eric pass
on the design source of truth, and the investigation surfaced 28 decisions that an implementer may
not take alone.

Ran 2026-08-21 against `841d277` (0.17.125, PV 47). Seven read-only audits; no implementation.
Questions: `bmad-dev-auto-result-7-6-doc-reconciliation-questions.md`. PR #192.

Four of the 28 may not proceed on an implementer default under any circumstances — **B1** (the
cycle-125 reserved-band violation, where the doc is right and the code is wrong), **D1** (Tab vs
the ratified SPACE-hold, an undocumented drift that became the played game), **D2** (ratifying two
draft strings, which epic-6 amendment 41 reserves to Eric) and **G6** (deleting the deprecated root
`DESIGN.md`/`TODOS.md`).

Resume by re-invoking with this spec once the gate is answered; record the answers as an epic-7
amendment in the same change that applies them.
