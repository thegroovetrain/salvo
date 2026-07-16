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

## 2026-07-16 — Core Gameplay Loop + Win/Loss (decided)

- Loop confirmed as: sail/sense → deduce/position → strike → survive the reply → grow, with the storm as clock. All steps map to pillars.
- **Strike wording corrected by Eric:** must not say "guns, torpedoes, or mines" — universal weapons are dead (forge). The slot grammar is universal; contents come from the loadout promise + growth.
- **Replayability rationale (Eric):** "You run it again because it's fun — a quick-to-play battle royale with a decent amount of depth." The three mined fantasies (Needle-Threader, Narrow Escape, The Dance) are *potential fun moments*, NOT canonical loop payoffs or tuning targets. Do not elevate them.
- **Truesight-convergence framing rejected by Eric:** fights converging to close range at the end is normal BR behavior ("you spend the whole match hunting, then you're all forced to a final showdown"), not a loop defect. The GDD must not describe it as a "collapse" or the 0.17 Information-Texture package as a "repair." The package enriches mid-match information texture; it is not fixing a broken loop.
- Win/loss written from the prototype's settled behavior: last human hull afloat, human-gated win check, omniscient death reveal, cheap death / fast re-queue.

## 2026-07-16 — Class identity + slot grammar (partially decided; Eric's corrections)

- **Prototype CONFIG values are handwaves, not commitments.** GDD numbers are design targets; current values cited only as reference. Eric: "I am not married to anything in the current version whatsoever."
- **Lobby pick = ship class, and class = the Hades weapon pick** — a full playstyle + power fantasy (e.g. "Torpedo Boat," "Mine Layer," "Battleship"), not a hull-size/durability variant. The current three classes were playtest scaffolding.
- **Slot grammar direction (open):** each class ships with a loadout of ~2–3 weapons / intel abilities / etc., perhaps plus empty slots for additional weapons/equipment/consumables gathered through upgrades or other mechanics. Specifics undecided.
- **Beta target:** three ship classes, each capturing "I have a unique playstyle and a specific power fantasy," NOT identical loadouts on different hulls.
- **The brief's MVP "assignments" (e.g. Cruiser-variant experiment) were Fable assumptions, not Eric's decisions.** Treated as examples only; do not build on them without confirmation.

## 2026-07-16 — Five classes + slot grammar v1 (decided)

- **Beta ships FIVE classes** (upgraded from "start with three"): Torpedo Boat, Battleship, Mine Layer, Gunship (Eric's rename of "gun duelist"), and a hunter/intel class (working name "Hunter" — real name TBD, open item).
- **Slot grammar v1 (Eric):** every ship = basic weapon + special weapon + "other" ability (intel, extra weapon, etc. — class-fantasy dependent). Pickup weapon slot + ~4 consumable slots are **backburnered, not cut** — grammar reserves them; beta doesn't implement them.
- Game Mechanics section written: class table, slot grammar, movement model, two-tier sensors, upgrade economy, storm (12:00 phased design target vs prototype's 3:45 single shrink), controls.
- Standing note added to gdd.md: all numbers are design targets / tunable reference values, never inherited commitments.

## 2026-07-16 — Upgrade economy correction (decided)

- **XP-based upgrade system replaces kill-only banking** (Eric): slow passive XP tick (~1 level/min) PLUS kill bonuses. Levels bank points; points carry pre-rolled offers as before. Passive tick = anti-snowball floor. Kill-bonus sizing stays open (prices the rat).

## 2026-07-16 — Universal listening ring (decided)

- **Everyone has hull microphones** for passive audio detection (the listening ring) — universal baseline equipment, not slot content. Sensor suite is three-tier on every hull: truesight + radar sweep + passive audio.

## 2026-07-16 — No self-heal as ship feature (decided); class fantasy sharpening

- **Design law (Eric): self-heal must NOT be a ship/class feature** — survivability makes any class holding it far too powerful. Healing, if it exists, is handled through consumables, or possibly a universal cooldown self-heal (Eric unsure he likes that). Open tension: does the current economy's spend-a-point-to-heal option survive this law?
- **Battleship reframed:** fantasy is "beefy boy with guns" (tank), NOT haymaker damage. Basic = Deck Guns; special = possibly star shells; other = possibly a damage-reduction cooldown. Tentative on special/other.
- **Gunship reframed:** the DPS pick — damage is its fantasy, contrasting the Battleship's durability.
- **Hunter:** torpedo as special now uncertain (Eric: "maybe shouldn't. Idk").

## 2026-07-16 — Gunboat rename, Battleship refantasy, Hunter backburnered, Hades-style upgrades (decided)

- **"Gunship" → "Gunboat"** (Eric: gunship = aircraft colloquially). Fantasy: small, fast, lightly armored — "speedy boy with some guns." Its "other" ability = another gun.
- **Battleship refantasy:** massive, heavily armored, long-range artillery dominating the open ocean. Loadout to be adjusted to fit (special likely long-range main battery artillery; exact row pending Eric's confirmation).
- **Hunter class backburnered** — beta ships FOUR classes: Torpedo Boat, Battleship, Mine Layer, Gunboat.
- **Heal dropped from the upgrade economy** (consequence of the no-self-heal law).
- **Upgrade catalog: 100% replacement.** All 14 existing stat-multiplier upgrades will be stripped and redesigned as Hades-like upgrades — qualitative, build-defining boons. New catalog is future design work; the GDD documents the model, not the old contents.

### Open items carried in from brief/forge (to resolve during facilitation)

1. Ring-phase split: 3 groups × 4 min vs 4 groups × 3 min (12:00 total closure).
2. Kill-bonus ratio — "the one number that prices the rat."
3. XP-tick retune implied by 12:00 closure (~12 passive upgrades vs forge's ~10).
4. Slot taxonomy + launch class list (Mine Layer candidate; Carrier requires counterplay design first).
5. Eclipse dial (off-class builds priced by deck weighting) + deck-merge mechanism.
6. "The Unwitnessed Build" — making ~10 upgrade picks *felt* (audio/visual/on-water behavior).
7. Exact positioning slogan; stat simplification (#87); minutes-1–3 "Quiet Dread" pacing call.
8. Constraint from forge: Conservation Law (#42) is a *tendency*, not a law — anti-snowball outranks it; GDD must not silently re-promote it.
