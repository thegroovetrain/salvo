# Sprint Change Proposal — 2026-11-18: Epic 12 gains Story 12.3 The In-Game UI Pass (side story) and Story 12.4 Airdrops and Radio Beacons

**Status:** APPROVED by Eric 2026-11-18 with one revision (gds-correct-course, batch mode; three structural rulings by AskUserQuestion this session; every design clause in the new story is Eric's words from this session — a clause with no ruling behind it is marked `[unruled]`)
**Trigger:** Eric, 2026-11-18: `/gds-correct-course some updates to epic 12... I want to do a focused pass at some in-game UI tweaks. Add one side story in there.`
**Author:** Developer agent with Eric
**Predecessors:** `sprint-change-proposal-2026-10-25.md` (the Ledger inserted), `sprint-change-proposal-2026-11-08.md` (the Ledger shifted to Epic 12, text whole); `epic-11-retro-2026-11-16.md` (Epic 11 closed); RELEASE 0.20.0 (PR #361)

---

## 1. Issue Summary

**Problem statement.** Epic 11 is closed and released (0.20.0). The next epic in the roadmap, Epic 12 The Ledger, is a floor epic with no player-visible change (12.1 The Match Ledger, 12.2 Reading the Ledger, both backlog). Eric wants a focused pass on in-game UI tweaks, added to Epic 12 as **one side story**. His list, verbatim (AskUserQuestion, 2026-11-18):

> *"Minor tweaks to the radar, ship visuals, and zoom/panning. Redesign of in-game HUD (again, as I am unhappy with it even though its getting close). Also a change to airdrops and radio beacons."*

**Structural ruling (Eric, AskUserQuestion, 2026-11-18):** *"UI story inside the Ledger"* — the Ledger stays Epic 12 with its text whole; the UI pass is one story inside it. Rejected: the UI pass as a new Epic 12 with the Ledger / Front Door / Account shifted right; the UI pass replacing the Ledger.

**Split ruling (Eric, AskUserQuestion approval, 2026-11-18):** *"12.4 for the airdrop/radio beacon changes, as those are more than just visual. Otherwise yes."* — the airdrop and radio beacon change is its own Story 12.4; 12.3 holds the radar, ship visuals, zoom / panning and HUD items.

**Issue type.** New requirement from the stakeholder after play — a polish pass on surfaces Epics 10–11 built (the 10.10 battle UI, the 11.2 radar display, the 11.8 free camera, the 10.4 hull sprites, the 10.8 radio beacons, the 10.9 airdrops). Not a technical limitation, not a failed approach.

**Evidence (the surfaces as built, from the record).**
- HUD: Story 10.10 The Battle UI (PR #329 + follow-up #331, epic-10 amendments 16–17 + 19) — consoles left / right, rows are buttons, Tab + 1..4, the amber ▲ preview. Memory of record: *"Loved look: adjust, never restyle"* (Eric loved the merged 10.10 HUD) — **Eric now asks for a redesign**; see amendment 1(c).
- Radar display: Story 11.2 The Hectometer Ruler (PR #339, epic-11 amendment 4; fixed radar display), 11.6 Rain First (rain clutter), cycle 202 the entire sweep (radar paints at every distance).
- Zoom / pan: Story 11.8 The Free Camera (PR #352, epic-11 amendment 14 — strategic zoom, middle-drag / arrow pan, Space home, corner brackets 24 px, 10 px icons, X pegs 15 s).
- Ship visuals: Story 10.4 The Four Battleships (PR #320 — true-scale top-down hulls, epic-10 amendment 7(a)–(n), 9).
- Radio beacons: Story 10.8 (PR #325, epic-10 amendment 14) + 11.7 random placement (PR #350, epic-11 amendment 15). Airdrops: Story 10.9 (PR #330, epic-10 amendment 18).

## 2. Impact Analysis

### Epic impact

| Epic | Impact |
|---|---|
| **Epic 12 The Ledger** | **Gains Story 12.3 The In-Game UI Pass (side story) and Story 12.4 Airdrops and Radio Beacons.** 12.1 and 12.2 keep their text and numbers whole. The epic's title and goal are unchanged; its summary gains one sentence naming the two. 12.3 and 12.4 are the only player-visible stories in the epic. |
| Epic 13 The Front Door, Epic 14 The Account | None. |
| Epics 10 / 11 (closed) | None reopened. 12.3 adjusts what they built; the deferred 11.4 (the operated set) and 11.10 (the weather arms) stay deferred — "minor tweaks to the radar" does not revive them unless Eric says so at the sitting. |

**Build order:** 12.3 → 12.4 → 12.1 → 12.2. 12.3 first is Eric's approval (2026-11-18); **12.4 straight after 12.3 is the agent's assumption** — if Eric wants it elsewhere, only the sprint-status comment, the story heading and this line change.

### Story impact

- **New:** Story 12.3 and Story 12.4 (below).
- **12.1 / 12.2:** text whole. The standing 12.1 create-story action item (refresh the `MatchRecord` wording) stands; if 12.4's airdrop / beacon change adds a recordable field, 12.1's create-story picks it up.

### Artifact conflicts

- **GDD** (`gdd.md`): none at this proposal. The airdrop / beacon change, once Eric rules it at the sitting, is a mechanics change — 12.4's spec writes its GDD stamp (minimal-edit rule: only what he rules).
- **UX** (`ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` + `EXPERIENCE.md`): the HUD redesign will change the design source of truth. 12.3 updates DESIGN.md to the look Eric picks, in the same PR.
- **Architecture:** none expected. Client render modules (`client/src/render/`, `client/src/ui/`), `client/src/render/camera.ts`, `CLIENT_CONFIG`. If the airdrop / beacon change is gameplay, it is `shared` sim + `CONFIG` + server, with a `PROTOCOL_VERSION` bump if the wire or a client-read `CONFIG` block changes; any new spatial event goes through `frames.ts` / `perception.observe()` with its invariant line (no seventh exception).
- **Narrative:** none.

### Technical impact

Client-only for the radar / ship visuals / zoom-pan / HUD items unless a ruling says otherwise. The airdrop / beacon change (12.4) is `[unruled]` and may touch sim, server, bots and the wire. Any change that scales a mask / filter / texture with reach runs `glBudget.mjs`; any change to sight / reach / shell counts runs `tickCost.mjs` old vs new in the PR.

## 3. Recommended Approach

**Direct Adjustment** — add two stories inside the existing epic. No rollback, no MVP change.

- **Effort:** two stories, likely several build cycles (12.3: four areas, the HUD redesign the largest; 12.4: gameplay). Design sitting first for each.
- **Risk:** low-to-medium. The HUD is a loved-then-unloved surface — candidates are rendered to an artifact for Eric's yes BEFORE anything is committed. The airdrop / beacon change is the only item that can touch gameplay balance.
- **Timeline:** delays 12.1 by the length of 12.3 + 12.4. Epic 12's release posture is unchanged.

## 4. Detailed Change Proposals

### 4.1 Epics (`_bmad-output/planning-artifacts/epics.md`)

**Epic list summary — Epic 12 (line ~664), append to the description paragraph:**

```
NEW (appended):
*(2026-11-18 — `sprint-change-proposal-2026-11-18.md`: two stories added — Story 12.3 The In-Game UI Pass, a side story (minor tweaks to the radar, ship visuals and zoom / panning; the in-game HUD redesigned), and Story 12.4 Airdrops and Radio Beacons (a change to both, more than visual); build order 12.3 → 12.4 → 12.1 → 12.2.)*
```

**Epic 12 section — two new stories appended after Story 12.2:**

```
### Story 12.3: The In-Game UI Pass *(side story — inserted 2026-11-18, `sprint-change-proposal-2026-11-18.md`, epic-12 amendment 1; built FIRST, before 12.1; DESIGN SITTING FIRST)*

As a captain,
I want the radar, the ships, the camera and the HUD to look and feel right,
So that the battle reads cleanly.

Eric, 2026-11-18, verbatim: *"Minor tweaks to the radar, ship visuals, and zoom/panning. Redesign of in-game HUD (again, as I am unhappy with it even though its getting close). Also a change to airdrops and radio beacons."*

**Before this story is created, a sitting with Eric lists each tweak** — what changes on the radar, the ship visuals, zoom / panning and the HUD. The airdrop / radio beacon half of his list is Story 12.4. Every item below is `[unruled]` until he names it. Visual candidates are rendered to an artifact for his yes before any is committed; the HUD redesign is rendered as options from the real HUD code, he picks.

**Acceptance Criteria:**

**Given** Eric's sitting list
**When** the story lands
**Then** each radar tweak he lists is built as he rules it `[unruled]`
**And** each ship-visual tweak he lists is built as he rules it `[unruled]`
**And** each zoom / panning tweak he lists is built as he rules it `[unruled]`
**And** the in-game HUD is redesigned to the candidate he picks `[unruled]`, and DESIGN.md is updated to it in the same PR
**And** no in-game copy is added unasked; readable values stay ≥ 13 px at 1080p.

### Story 12.4: Airdrops and Radio Beacons *(inserted 2026-11-18, `sprint-change-proposal-2026-11-18.md`, epic-12 amendment 1; split from 12.3 by Eric — "more than just visual"; built after 12.3, before 12.1; DESIGN SITTING FIRST)*

As a captain,
I want the airdrops and the radio beacons to work the way Eric means them to,
So that they play the way he intends.

Eric, 2026-11-18, verbatim: *"Also a change to airdrops and radio beacons."* / *"12.4 for the airdrop/radio beacon changes, as those are more than just visual."*

**Before this story is created, a sitting with Eric names the change** — to the airdrops (Story 10.9, epic-10 amendment 18) and to the radio beacons (Story 10.8, epic-10 amendment 14; 11.7 placement, epic-11 amendment 15). Every item below is `[unruled]` until he names it; every number is his. Any visual part is rendered for his yes before it is committed.

**Acceptance Criteria:**

**Given** Eric's sitting ruling
**When** the story lands
**Then** the airdrop change is built as he rules it `[unruled]`
**And** the radio beacon change is built as he rules it `[unruled]`
**And** the sim change lives in `shared` and `CONFIG`; a wire or client-read CONFIG change bumps PROTOCOL_VERSION; any new spatial event goes through perception with its invariant line (no seventh exception)
**And** bots stay functional on what the change touches
**And** the GDD is stamped with only what he ruled; How-to-Play copy is Eric's
**And** no in-game copy is added unasked.
```

### 4.2 Sprint status (`_bmad-output/implementation-artifacts/sprint-status.yaml`)

```
OLD:
  12-2-reading-the-ledger: backlog  # ledgerReport.mjs in the harness's report shapes
  epic-12-retrospective: optional

NEW:
  12-2-reading-the-ledger: backlog  # ledgerReport.mjs in the harness's report shapes
  12-3-the-in-game-ui-pass: backlog  # 2026-11-18 correct-course (sprint-change-proposal-2026-11-18.md, epic-12 amendment 1): SIDE STORY, built first; design sitting first
  12-4-airdrops-and-radio-beacons: backlog  # 2026-11-18 correct-course (epic-12 amendment 1): split from 12.3 by Eric; built second; design sitting first
  epic-12-retrospective: optional
```

Plus a one-line stamp on `last_updated` and on the `epic-12` comment.

### 4.3 GDS workflow status (`_bmad-output/gds-workflow-status.yaml`)

One-line stamps on `last_updated`, `correct-course` and `next_expected` (next: 12-3 design sitting, then gds-create-story 12-3).

### 4.4 Amendments (`_bmad-output/implementation-artifacts/epic-12-context-amendments.md` — NEW file)

Amendment 1 — this correct-course: (a) the side story and its verbatim list; (b) the structure ruling (UI story inside the Ledger; rejected alternatives) and the split ruling (airdrops / radio beacons → 12.4); (c) **the HUD redesign supersedes the "adjust, never restyle" stance of the 10.10 HUD for this story** — Eric 2026-11-18 asks for a redesign; the rule "render options, he picks" still holds; (d) build order 12.3 → 12.4 → 12.1 → 12.2 (12.3 first approved by Eric; 12.4's slot is the agent's assumption); (e) 11.4 / 11.10 stay deferred unless Eric revives them at the sitting.

## 5. Implementation Handoff

**Scope: Minor** — two stories added to an existing epic; no re-plan.

- **Next:** the 12.3 design sitting with Eric (his list of tweaks, item by item), then `gds-create-story 12-3`, then `gds-dev-story`; 12.4 follows the same path.
- **Success criteria:** every tweak Eric lists at the sitting is built as he rules it; the HUD redesign is the candidate he picked; DESIGN.md matches the shipped HUD; 12.4's airdrop / beacon change is built as ruled with bots still functional; `npm run check` green.
