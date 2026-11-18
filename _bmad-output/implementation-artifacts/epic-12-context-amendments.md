# Epic 12 Context — Ratified Amendments (durable)

This file is the DURABLE home for every ratified correction to Epic 12's context: Eric rulings, review patches, adjudicated contradictions. `epic-12-context.md` (when generated) is regenerable and anything living only there is erased on recompile; on any conflict between an entry here and planning-artifact text, the entry here wins until the planning artifact carries its dated supersession stamp.

Epic 12 is **The Ledger** — inserted 2026-10-25 by `sprint-change-proposal-2026-10-25.md` (as Epic 11), shifted to Epic 12 with its text whole by `sprint-change-proposal-2026-11-08.md`. On 2026-11-18 it gained two player-visible stories, 12.3 and 12.4 (amendment 1).

Format: numbered, dated, source-attributed. "Supersedes" names the exact planning-artifact clause it overrides.

---

## Correct-course 2026-11-18 — Story 12.3 The In-Game UI Pass (side story) and Story 12.4 Airdrops and Radio Beacons (no build cycle; `sprint-change-proposal-2026-11-18.md`)

1. **EPIC 12 GAINS TWO STORIES: 12.3 THE IN-GAME UI PASS (SIDE STORY) AND 12.4 AIRDROPS AND RADIO BEACONS.** Eric 2026-11-18 (`/gds-correct-course` + AskUserQuestion).
   - (a) **The list, verbatim:** *"Minor tweaks to the radar, ship visuals, and zoom/panning. Redesign of in-game HUD (again, as I am unhappy with it even though its getting close). Also a change to airdrops and radio beacons."* Nothing more is ruled: every specific tweak is `[unruled]` until a design sitting with Eric BEFORE each story's create-story. Never invent one.
   - (b) **Structure:** *"UI story inside the Ledger"* — the Ledger stays Epic 12, 12.1 / 12.2 text and numbers whole. Rejected: a new Epic 12 UI pass with the Ledger / Front Door / Account shifted right; the UI pass replacing the Ledger. **Split:** *"12.4 for the airdrop/radio beacon changes, as those are more than just visual."* 12.3 = radar, ship visuals, zoom / panning, HUD; 12.4 = airdrops and radio beacons.
   - (c) **The HUD is redesigned, not adjusted.** Supersedes, for Story 12.3, the standing "loved look: adjust, never restyle" treatment of the merged 10.10 HUD (PR #329 / #331, epic-10 amendments 16–17 + 19). Still holds: candidates rendered to an artifact from the real HUD code, Eric picks, nothing committed before his yes; readable values ≥ 13 px at 1080p; no in-game copy unasked. DESIGN.md is updated to the picked look in the same PR.
   - (d) **Build order 12.3 → 12.4 → 12.1 → 12.2.** 12.3 first: Eric's approval. 12.4 straight after 12.3: the agent's assumption, not yet ruled — if Eric places it elsewhere, restamp here, the sprint-status comment and the story heading.
   - (e) **Deferred Epic 11 radar stories stay deferred.** 11.4 (the operated set, ghosts) and 11.10 (the weather arms) are not revived by "minor tweaks to the radar" unless Eric says so at the 12.3 sitting.
   - (f) **12.4 is gameplay.** Sim in `shared` + `CONFIG`; PROTOCOL_VERSION bumps on a wire or client-read CONFIG change; any new spatial event goes through `perception.observe()` with its invariant line (no seventh exception); bots stay functional on what it touches; the GDD is stamped with only what Eric rules. If it adds a recordable field, 12.1's create-story picks it up for the `MatchRecord`.
