---
title: 'Sprint Change Proposal — Three-Class Beta Re-Scope Propagation'
date: '2026-07-19'
author: 'Eric (facilitated by Developer agent, gds-correct-course)'
mode: 'Batch'
status: 'approved' # Eric, 2026-07-19; Decision Point 1 = defer DESIGN.md/EXPERIENCE.md to Story 7.5 (recommended option)
trigger: 'brainstorming-session-2026-07-19.md Addendum (party-mode rulings, Eric-ratified)'
---

# Sprint Change Proposal — 2026-07-19

## Section 1: Issue Summary

**Problem statement.** The 2026-07-19 supplemental brainstorm and its same-day party-mode review (Eric-ratified) re-scoped the beta roster from four classes to **three: Torpedo Boat, Battleship, Mine Layer — the gunboat is cut**. The GDD was updated the same day (PR #41), but the production epic breakdown (`planning-artifacts/epics.md`), sprint status, and two architecture mentions still describe the four-class roster. Story creation is paused at 1-3 until this propagation lands (sprint-status banner + `gds-workflow-status.yaml` `next_expected` both direct this run).

**Issue type.** Strategic scope decision (deliberate MVP reduction) made upstream in design, requiring downstream artifact propagation. Not a technical failure; nothing implemented so far is invalidated.

**Discovery context & evidence.**

- `_bmad-output/brainstorming-session-2026-07-19.md`, Addendum item 5 names the story-level fallout explicitly: "1.9 Gunboat Loadout obsolete; 1.3 = three hull envelopes; 1.6 TB = torps + boost; 1.14 = three cards / no default; 2.8 boon catalog = three kits; 4.2 = three silhouettes."
- GDD (updated 2026-07-19): three-class table, TB = torpedoes + speed boost, smoke screen orphaned to the equipment/boon pool, **Mine Layer signature ability OPEN** (decoy buoy under rethink; mine mechanics flagged unsettled), Submarine→Carrier deferred bench.
- Sprint status: Epic 0 done; stories 1-1 (signal registry) and 1-2 (equipment interface) done — both roster-agnostic foundations. 1-3+ still backlog. **The re-scope arrives at zero implementation cost.**

## Section 2: Impact Analysis

**Epic impact.**

- **Epic 1 (The Armory):** the only structurally affected epic. Story 1.9 (Gunboat Loadout) is obsolete; 1.3, 1.6, 1.8, 1.10, 1.13, 1.14 need amendments; epic framing text says "four classes" in two places. Epic 1 drops from 14 stories to 13. Completed stories 1.1/1.2 are unaffected (registry + equipment interface are class-count-independent).
- **Epic 2:** Story 2.8 (boon catalog) scope note — three kits, and the orphaned smoke screen becomes pool content.
- **Epic 4:** Story 4.2 (class-legible blips) — three silhouettes, gunboat blip specs dropped.
- **Epics 0, 3, 5, 6, 7:** no changes. No resequencing, no new epics, no priority changes.

**Artifact conflicts.**

| Artifact | State | Action |
|---|---|---|
| GDD + GDD-level epics sketch | Already updated (PR #41) | None — source of truth for this change |
| `planning-artifacts/epics.md` | Stale (four-class) | **19 edits below — the core of this proposal** |
| `game-architecture.md` | Two descriptive mentions ("4 classes" line 80, "four class loadouts" line 955) | Two one-phrase corrections; architecture is otherwise roster-agnostic (addendum item 6 confirmed AR4/AR5 absorb the change) |
| `sprint-status.yaml` | Stale story list + warning banner | Rename 1-3 key, remove 1-9, retire banner (post-approval, checklist 6.4) |
| `gds-workflow-status.yaml` | `next_expected` = this run | Record correct-course completion; `next_expected` → create-story 1-3 (same PR, per standing rule) |
| DESIGN.md / EXPERIENCE.md | 3 + 6 gunboat references (silhouette board, class cards, bindings prose) | **Flagged, not edited** — see Decision Point 1 |
| Readiness report 2026-07-17 | Validated against old roster | No rewrite — historical snapshot; superseded on roster items by this proposal |

**Technical impact.** None yet: no four-class code exists (prototype CONFIG still has its own three legacy classes; new envelopes were to arrive in 1.3). No protocol, schema, or test impact until 1.3 lands — which will now be born three-class.

**Newly identified design gates (not in the addendum's fallout list — surfaced by this analysis):**

1. **Boost × torpedo self-hit:** FR7 guarantees torpedoes outrun every hull *at base speed*. The TB now carries a speed boost that raises speed above base. Whether a boosted TB can catch its own torpedo (and what the rule is) needs an Eric ruling — gated in amended Story 1.6, not resolved here.
2. **Mine Layer signature ability is OPEN** (GDD 2026-07-19) and mine mechanics themselves are flagged unsettled. Story 1.8 currently commits to the decoy buoy — amended to carry a resolve-with-Eric gate, mirroring how old 1.9 carried the AP-gun decision.

## Section 3: Recommended Approach

**Selected path: Direct Adjustment** (modify existing stories within the current epic structure).

- **Rollback: N/A.** Nothing completed touches the roster; 1.1/1.2 are foundations the three-class build sits on unchanged.
- **MVP review: N/A as a *further* action** — this change *is* an already-ruled MVP reduction (prove the concept with three great classes, expand post-playtest). Nothing else needs cutting to absorb it.
- **Effort: Low** (document edits only; no code). **Risk: Low** (change shrinks scope; all decisions already ratified; the two genuinely open items are carried as explicit story gates rather than guessed). **Timeline impact: net positive** — one loadout story removed from the critical path.

**Story numbering:** Story 1.9 is **tombstoned, not renumbered** — stories 1.10–1.14 keep their numbers so every existing cross-reference (sprint-status keys, party-mode reviews, readiness report, retro docs) stays valid. The 1.9 slot carries a one-line removal record.

## Section 4: Detailed Change Proposals

All edits below are to `_bmad-output/planning-artifacts/epics.md` unless marked otherwise. Rationale is uniform — *party-mode addendum rulings 1–6 (2026-07-19), Eric-ratified; GDD updated same day* — and is stated per-edit only where it adds something.

### 4A. Requirements inventory

**Edit 1 — Overview, conflict-resolution notes.** ADD bullet:

> - **Three-class beta re-scope (2026-07-19, party-mode ratified):** the gunboat is cut; beta roster = Torpedo Boat / Battleship / Mine Layer. TB loadout = torpedo tubes + speed boost (inherited from the cut gunboat); the smoke screen is orphaned to the equipment/boon pool; the Mine Layer's signature ability is OPEN (decoy buoy under rethink; mine mechanics flagged unsettled). Deferred bench: Submarine first, then Carrier; decoy ship and the rest stay banked.

**Edit 2 — FR1.**

OLD: `FR1: Four playable classes at beta — Torpedo Boat, Battleship, Mine Layer, Gunboat — each a distinct hull envelope…`
NEW: `FR1: Three playable classes at beta — Torpedo Boat, Battleship, Mine Layer — each a distinct hull envelope (size, speed, toughness, turning) carrying a fitted loadout. (Gunboat cut 2026-07-19; Submarine → Carrier bench deferred post-playtest.)`

**Edit 3 — FR4.**

OLD: `FR4: Class loadouts per GDD: Torpedo Boat = torpedo tubes + smoke screen; Battleship = long-range cannon + star shells; Mine Layer = proximity-fused mines + decoy buoy; Gunboat = armor-piercing gun (form open: separate gun vs activatable buff) + speed boost.`
NEW: `FR4: Class loadouts per GDD: Torpedo Boat = torpedo tubes + speed boost (activated: several seconds of raised speed); Battleship = long-range cannon + star shells; Mine Layer = proximity-fused mines + a signature ability that is OPEN (decoy buoy under rethink, 2026-07-19 — resolved with Eric before Story 1.8). The smoke screen is equipment/boon-pool content, no longer any class's ability.`

**Edit 4 — FR10.** Recast as conditional on the ML resolution:

OLD: `FR10: The decoy buoy is a real server-side entity whose emitted signals are wire-indistinguishable…`
NEW: `FR10: Any deception entity (e.g. the decoy buoy, if the Mine Layer's OPEN signature ability resolves to it) is a real server-side entity whose emitted signals are wire-indistinguishable from a genuine ship's (counter-intel law: lies live on the server). The law binds regardless of which deception feature ships.`

**Edit 5 — UX-DR9.**

OLD: `…four genuinely distinct top-down silhouettes (Torpedo Boat knife ~9:1; Battleship broadest/stepped, 124 u; Mine Layer widened aft + transom notch, 88 u; Gunboat compact flared wedge, 60 u) + the legacy chevron reserved for PvE drones (a fifth silhouette no player wears)…`
NEW: `…three genuinely distinct top-down silhouettes (Torpedo Boat knife ~9:1; Battleship broadest/stepped, 124 u; Mine Layer widened aft + transom notch, 88 u) + the legacy chevron reserved for PvE drones (a fourth silhouette no player wears)…`

**Edit 6 — UX-DR10.** Drop `and Gunboat flare exaggerated` → `Mine Layer notch cut ~3× deep in the blip path only`.

**Edit 7 — UX-DR26.**

OLD: `…keys 1–4/arrows highlight, Enter picks, ESC closes without change; first-run default class Gunboat (unconfirmed proposal).`
NEW: `…keys 1–3/arrows highlight, Enter picks, ESC closes without change; first-run class select pushes no default — three cards, forced meaningful choice, Torpedo Boat pre-focused for keyboard flow (ruled 2026-07-19; closes the old "default Gunboat" proposal).`

**Edit 8 — FR Coverage Map.** `FR1: Epic 1 — Four class hull envelopes` → `Three class hull envelopes`; `FR10: Epic 1 — Decoy buoy as wire-indistinguishable server entity` → `FR10: Epic 1 — Counter-intel wire-indistinguishability (decoy buoy pending the ML signature-ability resolution)`.

### 4B. Epic 1

**Edit 9 — Epic-list blurb and Epic 1 intro (two sites).** `Pick any of four classes` → `Pick any of three classes`; intro tail `…then the gun, D1, four class loadouts, arcs…` → `…then the gun, D1, three class loadouts, arcs…`.

**Edit 10 — Story 1.3 (title, story, ACs).** Title → `Three Hull Envelopes`; `I want four classes` → `I want three classes`;

OLD (When): `Torpedo Boat, Battleship, Mine Layer, and Gunboat envelopes replace them (hull dims per the ratified silhouette board: TB ~9:1 at 100 u, BB 124 u, ML 88 u, GB 60 u; …)`
NEW (When): `Torpedo Boat, Battleship, and Mine Layer envelopes replace them (hull dims per the ratified silhouette board: TB ~9:1 at 100 u, BB 124 u, ML 88 u; …)`

`all four classes are pickable` → `all three classes are pickable`.

**Edit 11 — Story 1.4.** `Given the four classes of Story 1.3` → `Given the three classes of Story 1.3`.

**Edit 12 — Story 1.6 (rewrite: TB = torps + boost).**

> ### Story 1.6: Torpedo Boat Loadout (carries the boost × torpedo ruling)
>
> As a Torpedo Boat captain,
> I want torpedo tubes and a speed boost,
> So that I can thread skill-shots through terrain and outrun the answer.
>
> **Acceptance Criteria:**
>
> **Given** the equipment registry
> **When** torpedo tubes (special 1) and the speed boost (special 2, activated: several seconds of raised speed — inherited from the cut gunboat, ruled 2026-07-19) are fitted to the Torpedo Boat
> **Then** torpedoes obey all FR7 laws (outrun every hull at base speed, real bow clearance, owner-only grace — a self-hit at base speed is impossible, covered by test) and are never painted by radar
> **And** the speed boost implements `Equipment` with its own cooldown, applying through `effectiveStats()`/shared hooks so prediction survives the speed change; boost state is visible to the owner (slot cooling state) and produces no wire field revealing it to enemies beyond observed kinematics
> **And** the boost × torpedo interaction is resolved WITH ERIC during this story (FR7 guarantees no self-hit at *base* speed only — whether a boosted TB can catch its own fish, and the rule if so, is a design decision), with the ruling covered by test
> **And** a solo playtest run confirms the fantasy: tubes + boost + the 9:1 hull play distinctly from every other class.

Rationale beyond the ruling: the boost implementation ACs migrate verbatim-in-spirit from old Story 1.9; the boost × torpedo gate is a newly surfaced interaction this proposal flags rather than resolves. The smoke-screen perception AC is deleted with the ability (its future home: Story 2.8 pool content).

**Edit 13 — Story 1.8 (carry the OPEN gate).** Title → `Mine Layer Loadout (carries the signature-ability + mine-mechanics decisions)`; story line 2 → `I want proximity mines and a signature ability worthy of the trapper,`. ACs: prepend a gate —

> **Given** the Mine Layer's signature ability is OPEN (decoy buoy under rethink; candidates banked in the 2026-07-19 session: mine+buoy shared radar signature, sonobuoy) and mine mechanics are themselves flagged unsettled
> **When** this story begins
> **Then** both are resolved WITH ERIC before implementation, and the GDD notes are closed with the choices

— and make the existing decoy-buoy ACs (server-entity, RNG/jitter stream, wire-indistinguishability tests, no-Hit-Call oracle) explicitly conditional: `If the resolution is the decoy buoy, then: …` (they remain the ratified spec for that outcome; the counter-intel law binds any deception alternative per FR10).

**Edit 14 — Story 1.9 (tombstone).** Replace the full story with:

> ### Story 1.9: Gunboat Loadout — REMOVED (2026-07-19 re-scope)
>
> The gunboat is cut from the beta roster (party-mode addendum, 2026-07-19, Eric-ratified). Its speed boost migrated to the Torpedo Boat loadout (Story 1.6); the AP-gun form question was deleted with the class. The story number is retired, not reused — later stories keep their numbers so existing cross-references stay valid.

**Edit 15 — Story 1.10.** `Given all eight fitted systems from Stories 1.4–1.9` → `Given all seven fitted systems from Stories 1.4–1.8` (gun, torpedo tubes, speed boost, long-range cannon, star shells, mines, ML signature ability).

**Edit 16 — Story 1.13.** `all four classes draw at identity-board geometry` → `all three classes draw…`; `a fifth silhouette no player class wears` → `a fourth silhouette no player class wears`.

**Edit 17 — Story 1.14.** `the four Class Cards` → `the three Class Cards`; `keys 1–4/arrows` → `keys 1–3/arrows`; and

OLD: `**And** first-run default class is Gunboat (flagged: unconfirmed proposal — confirm before ship)`
NEW: `**And** first-run class select pushes no default — three cards, forced meaningful choice, with the Torpedo Boat card pre-focused for keyboard flow (ruled 2026-07-19)`

### 4C. Epics 2 and 4

**Edit 18 — Story 2.8.** In the Then clause, extend: `…every class-specific ability appears in the offer pool filling/replacing the extra slot (FR21) — including the smoke screen, orphaned from the Torpedo Boat as pool content (2026-07-19) — and off-class weighting is a CONFIG tunable; catalog scope covers the three beta kits and follows the GDD's Hades-hammer model (slot-mapped choices, slot-4 equipment logic, variant mutations as upgrades never starting kit; the GDD's stat-vs-qualitative tension is settled during this story).`

**Edit 19 — Story 4.2.** `class blips never below 11 px (BB 14 / ML 12 / TB 11 / GB 11 floor-clamped); the ML notch cuts ~3x deep and the GB flare exaggerates in the blip path only` → `class blips never below 11 px (BB 14 / ML 12 / TB 11 floor-clamped); the ML notch cuts ~3x deep in the blip path only`.

### 4D. Other artifacts (post-approval, same PR)

**Edit 20 — `game-architecture.md`** (two phrase-level corrections): line 80 `(4 classes)` → `(3 classes at beta; re-scoped 2026-07-19)`; line 955 `four class loadouts` → `three class loadouts`.

**Edit 21 — `sprint-status.yaml`:** rename `1-3-four-hull-envelopes` → `1-3-three-hull-envelopes`; delete `1-9-gunboat-loadout`; header comment `(8 epics / 59 stories)` → `(8 epics / 58 stories)`; replace the ⚠ RE-SCOPE banner with a one-line pointer to this proposal (propagation complete).

**Edit 22 — `gds-workflow-status.yaml`:** add `correct-course: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-19.md`; update `next_expected` → `create-story 1-3`; update the story-count comment.

### Decision Point 1 — DESIGN.md / EXPERIENCE.md (Eric's call; default = defer)

DESIGN.md (3 gunboat references — silhouette board, class cards) and EXPERIENCE.md (6) still describe the four-class roster. **Recommended: defer to Story 7.5** (the designated DESIGN.md reconciliation story, which already writes back decisions resolved during Epics 1–6); the GDD + amended epics take precedence meanwhile, and Stories 1.13/1.14 ACs now state the correct roster directly. Alternative if preferred: a minimal dated re-scope banner in DESIGN.md now — but per the standing minimal-design-doc-edits rule, that edit is not made without explicit approval. The readiness report likewise stays untouched as a historical snapshot.

## Section 5: Implementation Handoff

**Scope classification: Moderate** (backlog reorganization — story removal + amendments across two tracking files), executed as **Minor-style direct implementation**: every edit is fully specified above, all design decisions were already made by Eric, and the two genuinely open items are carried as story gates rather than resolved.

- **Executor:** Developer agent (this session) applies Edits 1–22 on branch `worktree-gds-correct-course-2026-07-19` immediately upon approval, in one PR (proposal + epics.md + architecture touch-ups + both YAMLs — per the standing same-PR rule for workflow status).
- **Eric:** approves/amends this proposal; rules on Decision Point 1; the two new design gates (boost × torpedo, ML ability + mine mechanics) wait inside Stories 1.6/1.8 for their stories to begin — nothing to decide today.
- **Success criteria:** epics.md contains zero four-class/gunboat scope statements outside the 1.9 tombstone and dated re-scope notes; sprint-status matches the 13-story Epic 1; `next_expected` = create-story 1-3; story creation can resume immediately.

**Next step after merge:** `gds-create-story` for Story 1.3 (Three Hull Envelopes).
