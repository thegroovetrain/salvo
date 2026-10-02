---
title: 'Lobby on fixed geometry (two columns of ten slots, labeled option rows, green/red ready circle) and START NOW arms the countdown'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_revision: 'ab718f8d'
final_revision: 'TBD-STAMP'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-private-lobby-join-code.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Cycle 167 shipped private lobbies; the lobby modal resized as captains joined, left or BOT-FILL toggled, and START NOW formed the match at once. Eric (2026-10-02, staging verdict, verbatim, expletives omitted): *"That lobby is far too janky. The modal changes size when people join or leave or when you turn on bot fill. Poor attention to detail. I want two columns of 10 slots each. Start filling Left to Right, Top to Bottom as people join. A little circle next to their name is Green if ready and Red otherwise. Room options are under the code but above this list. Options are CLEARLY LABELED, meaning there is a label and then there is an input. As a non host player I can see the label and the status. Bot fill needs to be a yes/no selection. The host's option to Start Now triggers the countdown, not an instant teleport into game."*

**Approach:** One new client file, `ui/lobbyLayout.ts`, owns every fixed pixel size; `lobbyModal.ts` mounts every region once and only changes content. On the server, START NOW becomes `forceStart(id, now)`, arming the 10 s lobby countdown as a forced one.

### Orchestrator readings (Eric may veto any)

1. A forced countdown ignores late joins and leaves while eligibility holds (it keeps running, it is not restarted); it is cancelled only by lost eligibility.
2. The seed placeholder is `OPTIONAL` under the `SEED` label (was `SEED (OPTIONAL)`).
3. PROTOCOL_VERSION stays 71: only the lobby-room schema fields `forced` and `slot` and lobby channels change (a reviewer noted the project rule says any wire change bumps it; recorded as a reading for Eric to veto).

### Eric rulings (review gate, 2026-10-02, AskUserQuestion, verbatim labels)

4. *"Shrink the design to fit 650 px — tighten rows and gaps so the whole fixed panel is about 600×620 px and never scrolls on a 768-tall laptop. Still one fixed size that never changes with state."* (built: 600 x 598)
5. *"Leave the slot empty; next joiner fills the first empty slot — names never move once seated. Slot order is the earliest empty slot, left to right, top to bottom."*
6. *"Yes, START NOW locks it — same end time, now 'regardless of ready status'. START NOW stays lit during an all-ready countdown and goes dim once forced."*

## Boundaries & Constraints

**Always:** nothing is unmounted or `display:none`d for state; every region reserves its space; DESIGN.md tokens as in cycle 167; lint complexity at most 10; no new in-game copy beyond the placeholder reading.

**Never:** change the arena, the all-ready countdown rules (236), the eligibility rule (2 captains or bot-fill), or any wire id.

</intent-contract>

## Code Map

- `client/src/ui/lobbyLayout.ts` (new): panel 600 x 598 (re-budgeted at the review gate, ruling 4); line heights heading 22 / notice 18 / code 26 / options 80 / aboard 18 / grid 236 / countdown 20 / buttons 40 / reason 18, eight 10 px gaps, padding 20 / 28; option rows 36 px (140 px right-aligned muted label, 300 px value box); YES | NO chips 96 x 36; slot grid 2 x 260 px columns with a 24 px gutter, 10 x 20 px rows with 4 px gaps; slot = 10 px circle + 240 px ellipsized callsign box; button row of three 160 x 40 cells; `fixPanel` sets max-width / max-height none and overflow hidden.
- `client/src/ui/lobbyModal.ts`: rebuilt on the layout; slot i at row floor(i / 2) + 1, column (i % 2) + 1 where i is the sticky `LobbyPlayer.slot` (ruling 5); circle phosphor when ready, denied red otherwise, transparent hairline when empty; non-host sees label + status; START NOW lit with no countdown and during an all-ready countdown, dim once forced and while ineligible, reason line in its reserved slot.
- `client/src/net/lobby.ts`: mirrors `forced`.
- `server/src/rooms/lobby.ts`: `forceStart(id, now)`; countdown evaluation keeps a forced count alive while eligible.
- `server/src/rooms/LobbyRoom.ts`, `server/src/rooms/schema/LobbyState.ts`: `lobbyStart` handler calls `forceStart`; `forced` field, reset on cancel and at form.
- `server/scripts/lobbySmoke.mjs`: scenario B asserts the forced countdown and the seat about 10 s later.
- Tests: `client/src/__tests__/lobbyModal.test.ts` (+ lobby / privateLobby touch-ups), `server/src/__tests__/lobby.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `lobbyLayout.ts` with every fixed size in one place
- [x] `lobbyModal.ts` rebuilt: fixed regions, 2 x 10 grid, ready circles, labeled SEED / BOT-FILL rows (YES | NO), non-host label + status, blank third button cell
- [x] `forceStart`, `LobbyState.forced`, `LobbyRoom` handler, client mirror
- [x] Tests and `lobbySmoke.mjs` scenario B updated
- [x] Docs: version 0.18.33, CHANGELOG, amendments 240-242, trackers

**Acceptance Criteria:**
- Given any roster size 1..20 and any BOT-FILL / countdown / host state, when the modal renders, then its outer size is 600 x 598 and no region moves.
- Given captains joining, then slot i is at row floor(i / 2) + 1, column (i % 2) + 1, i being the lowest free slot at join; a vacated slot stays empty and the next joiner takes the earliest empty one.
- Given a captain ready, then their circle is phosphor; not ready, denied red; empty slot, a transparent hairline.
- Given a non-host, then the SEED and BOT-FILL rows show the label and the current value / YES or NO status, with no controls.
- Given the host presses START NOW while eligible and no countdown runs, then a 10 s forced countdown starts (`forced` true) and no match forms until it ends.
- Given a running all-ready countdown, START NOW is lit; when it is pressed, then it converts to forced with the same end time; a second press is a no-op.
- Given a forced countdown, when a captain un-readies, a late captain joins, or a captain leaves with eligibility kept, then it keeps running; when eligibility is lost it is cancelled and `forced` resets.
- Given 1 human and BOT-FILL off, then START NOW is disabled and `2 CAPTAINS OR BOT-FILL REQUIRED` shows in its reserved line.
- PROTOCOL_VERSION remains 71.

## Spec Change Log

(empty)

## Review Triage Log

### 2026-10-02 — Review pass (Opus 5.5 at Eric's call + Codex `gpt-5.6-sol`; both FIX-FIRST)
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 2, medium 3, low 1)
- defer: 0
- reject: 1: (low 1)
- addressed_findings:
  - `[high]` `[patch]` The shell clamped / scrolled the 700 px panel on a 768-tall laptop → panel re-budgeted to 600 x 598, `fixPanel` forces max-width / max-height none and overflow hidden (Eric ruling 4).
  - `[high]` `[patch]` Forced conversion of an all-ready countdown was unreachable (START NOW dim during a count) → lit during an all-ready countdown, dim once forced (Eric ruling 6).
  - `[medium]` `[patch]` Live-looking controls between form and seat → phase `started` freezes START NOW / READY / YES-NO; the countdown line keeps its last text.
  - `[medium]` `[patch]` Late-joiner countdown anchor showed a full 10 s → true remainder clamped to [0, 10 s].
  - `[medium]` `[patch]` Names shifted when someone left (insertion order) → sticky `LobbyPlayer.slot`, lowest free slot at join (Eric ruling 5).
  - `[low]` `[patch]` Reason line and START NOW lagged the host's pending YES / NO click → both follow the pending click.
  - rejected: a seed edit inside the 400 ms debounce at the form tick (the seed is probed once at form time; ruling 12 of cycle 167 stands).

## Auto Run Result

**Summary.** The lobby modal now sits on one fixed 600 x 598 geometry (two columns of ten slots, labeled SEED / BOT-FILL rows with YES | NO, green / red ready circle, nothing resizes), fits a 768-tall laptop without clamping or scrolling, and START NOW arms a forced 10 s countdown that ignores ready status. After the review gate: slots are sticky (`LobbyPlayer.slot`, a vacated slot stays empty), and START NOW is lit during an all-ready countdown and converts it to forced with the same end time.

**Files.** client: `ui/lobbyLayout.ts` (new), `ui/lobbyModal.ts`, `net/lobby.ts`, tests (`lobbyModal`, lobby / privateLobby). server: `rooms/lobby.ts`, `rooms/LobbyRoom.ts`, `rooms/schema/LobbyState.ts` (`forced`, `LobbyPlayer.slot`), `scripts/lobbySmoke.mjs`, `lobby.test.ts`. docs: `VERSION` / `package.json` 0.18.33, `CHANGELOG.md`, epic-8 amendments 240-242, `epic-8-context.md` pointers, both trackers.

**Review.** 6 patches applied (high 2, medium 3, low 1), 0 deferred, 1 rejected (see the triage log). Three Eric rulings taken through AskUserQuestion at the gate (panel size, sticky slots, START NOW lock).

**Follow-up review recommended:** false.

**Verification.** Gate green after the patches: shared 1034, server 2504, client 3929, lint 0 errors.

**Residual risks.** Not browser-tested this run; staging QA is the gate (including the 768-tall fit). For Eric: the PV reading, PROTOCOL_VERSION stays 71 although the lobby-room schema gained `forced` and `slot` (a reviewer noted the project rule says any wire change bumps it); veto it and the bump is one line.

## Verification

```
npm run check
npm test -w shared      # 1034 (unchanged)
npm test -w server      # 2486 -> 2504
npm test -w client      # 3906 -> 3929
npm run lint            # 0 errors
node server/scripts/lobbySmoke.mjs   # scenario B: forced countdown, seat ~10 s later
```
