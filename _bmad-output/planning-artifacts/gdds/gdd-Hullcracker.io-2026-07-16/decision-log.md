# Decision Log — Hullcracker.io GDD

## 2026-07-16 — Session start (Create intent)

- **Intent:** Create — no prior GDD exists. Workspace bound to `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/`.
- **Inputs:** game brief + addendum (2026-07-15), identity-fork forge report, brainstorming session (2026-07-15), running prototype v0.16.0 (649 tests).
- **Game type:** Shooter (confirmed by Eric). Catalog has no battle-royale/naval category; BR structure and sensor-deduction layer are documented in pillars, core loop, and the Shooter Specific Design section.
- **Working mode:** Facilitative (confirmed by Eric) — walk pillars, core loop, mechanics, and shooter-specific sections conversationally before drafting.
- **Workflow:** Artifacts authored on branch `worktree-gds-gdd-hullcracker`, committed per-section and pushed immediately so no work is ever stranded. PR opened only at the END of the task, once the GDD is finalized (Eric's explicit call — no early/draft PRs).
- **Skeleton pre-populated from brief:** Executive Summary (core fantasy, pitch, emotional contract), Target Audience, USPs, Goals and Context, provisional Out of Scope list.

## 2026-07-16 — Game Pillars (decided)

Eric confirmed all four candidate pillars, as worded from his own source documents ("Keep"):

1. **Hunting with Imperfect Senses** — sensor deduction as the core resource.
2. **Frantic to Play, Light to Hold** — gunnery feel, zero meta-weight, <15-min match.
3. **Promise + Growth** — lobby pick is a real promise; kill-banked upgrades grow it.
4. **The Ocean Keeps Getting Smaller** — legible storm phases + Endgame Guarantee force a conclusion.

Facilitator flagged that #4 could be read as a mechanism serving #1/#2 rather than a standalone pillar; Eric kept it as a pillar. Recorded as intentional: "the match always ends in a forced confrontation" is load-bearing on its own.

### Open items carried in from brief/forge (to resolve during facilitation)

1. Ring-phase split: 3 groups × 4 min vs 4 groups × 3 min (12:00 total closure).
2. Kill-bonus ratio — "the one number that prices the rat."
3. XP-tick retune implied by 12:00 closure (~12 passive upgrades vs forge's ~10).
4. Slot taxonomy + launch class list (Mine Layer candidate; Carrier requires counterplay design first).
5. Eclipse dial (off-class builds priced by deck weighting) + deck-merge mechanism.
6. "The Unwitnessed Build" — making ~10 upgrade picks *felt* (audio/visual/on-water behavior).
7. Exact positioning slogan; stat simplification (#87); minutes-1–3 "Quiet Dread" pacing call.
8. Constraint from forge: Conservation Law (#42) is a *tendency*, not a law — anti-snowball outranks it; GDD must not silently re-promote it.
