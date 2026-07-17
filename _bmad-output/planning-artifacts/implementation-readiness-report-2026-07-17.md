---
project_name: 'Hullcracker.io'
user_name: 'Eric'
date: '2026-07-17'
stepsCompleted:
  [
    'step-01-document-discovery',
    'step-02-gdd-analysis',
    'step-03-epic-coverage-validation',
    'step-04-ux-alignment',
    'step-05-epic-quality-review',
    'step-06-final-assessment',
  ]
status: 'complete'
result: 'READY'
documentsIncluded:
  gdd: '_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md'
  architecture: '_bmad-output/game-architecture.md'
  epics: '_bmad-output/planning-artifacts/epics.md'
  ux_design: '_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
  ux_experience: '_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/EXPERIENCE.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-17
**Project:** Hullcracker.io

## Document Inventory

| Type | Document | Notes |
| --- | --- | --- |
| GDD | `planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` | With `decision-log.md` and GDD-phase `epics.md` alongside |
| Architecture | `_bmad-output/game-architecture.md` | Validated PASS 2026-07-17; lives at `_bmad-output/` root per workflow status |
| Epics & Stories | `planning-artifacts/epics.md` | **Authoritative** — 8 epics / 59 stories, validated PASS 2026-07-17 |
| UX Design | `ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` | Design source of truth |
| UX Experience | `ux-designs/ux-Hullcracker.io-2026-07-16/EXPERIENCE.md` | Peer interaction contract |

**Resolutions:**

- Two `epics.md` files exist. `planning-artifacts/epics.md` (Phase 3, 8 epics / 59 stories) is authoritative per `gds-workflow-status.yaml`; the GDD-folder `epics.md` is the GDD's own high-level epic list and is used only as a traceability cross-reference. Confirmed by Eric 2026-07-17.
- No missing documents; no whole-vs-sharded duplicates.

## GDD Analysis

The GDD has no numbered FR/NFR sections; requirements below are extracted systematically from every section (Core Gameplay, Game Mechanics, Shooter Specific Design, Progression and Balance, Level Design, Art/Audio, Technical Specifications, Success Metrics), preserving the GDD's own language.

### Functional Requirements

**Win/Loss & Death Flow**
- FR1: Win = last match participant afloat; the win check counts participants only in every mode — PvE ships are never participants, can never win, and never need to be destroyed to claim the win.
- FR2: Loss = hull reaches zero; damage sources are enemy weapons and the storm.
- FR3: Sinking window ("go down shooting"): reaching 0 HP starts a ~5 s (tunable) window where the hull gradually slows to a stop and guns stay live.
- FR4: After sinking: omniscient reveal (dying means finally seeing everything), then spectate or instant re-queue; next match is seconds away.

**Classes & Slot Grammar**
- FR5: Four classes at beta — Torpedo Boat, Battleship, Mine Layer, Gunboat — each a hull envelope (size, speed, toughness, turning) carrying a fitted loadout.
- FR6: Universal slot grammar: (1) the same standard gun on every class (short cooldown, basic damage, available most of the time); (2) two class-defining special abilities, at least one a weapon; (3) one extra slot filled mid-match through the upgrade economy.
- FR7: Beta loadouts — Torpedo Boat: torpedo tubes + smoke screen; Battleship: long-range cannon + star shells; Mine Layer: proximity-fused mines + decoy buoy; Gunboat: armor-piercing gun (form open) + speed boost.
- FR8: Class differentiation lives in the two specials and hull envelope — never in the gun.

**Movement & Controls**
- FR9: Set-and-forget 9-detent telegraph engine orders plus rudder; separate acceleration and braking rates; rudder authority reduces below steerage speed; kinematics are per-class envelope values.
- FR10: Keyboard: telegraph detents + rudder, weapon-slot selection (basic/special/other), in-match spend window for offers. Current bindings are provisional; new keyboard controls are planned (E2).
- FR11: Mouse: aim constrained to the selected weapon's real firing arc; click to fire; denied fire (out of arc, no ammo, reloading) gives explicit feedback, never silence.

**Sensors (Pillar 1)**
- FR12: Universal sensor suite on every hull: truesight bubble (live, LOS-clear contacts), rotating radar sweep painting decaying phosphor blips, and hull microphones — a passive listening ring giving bearing-grade audio detection (engines, torpedoes in the water).
- FR13: Radar blips are class-legible: they carry the ship's outline (size), speed, and heading.
- FR14: One LOS rule everywhere: observer→point segment must clear all island circles. Only ships paint on radar; projectiles materialize at the sight boundary with no range-derivable fields.
- FR15: Counter-intel law: lies must live on the server — deceptions indistinguishable on the wire.

**Upgrade Economy (Pillar 3)**
- FR16: XP leveling: passive tick (~1 level/minute design target) plus kill bonuses; each level banks an upgrade point.
- FR17: Each point carries a pre-rolled offer of 4 boons from distinct categories, rolled at earn-time, never rerolled (4 choices ratified in UX phase, superseding 3).
- FR18: Boon content is Hades-style qualitative, build-defining — not stat multipliers; the prototype's 14 stat-stack upgrades are dead and replaced wholesale; boon catalog v1 is dedicated design work.
- FR19: Offers can include any class-specific ability in the game — the extra-slot fill mechanism; off-class weighting is open tuning.
- FR20: Healing is an OPEN design question: current build ships no heal in the economy; "self-heal is never a ship feature" is under reconsideration; boon-catalog work must not assume either way.
- FR21: Kill bonuses are kill-only (no damage XP): participant kill = 1 full level; PvE common = 1/4, uncommon = 1/3, rare = 1/2 (fractions declared handwaves; shape is committed).
- FR22: The Bounty: the kill leader periodically blooms on everyone's radar and is worth extra XP.
- FR23: The build must be felt — audio, hull visuals, on-water behavior express picks.
- FR24: Rat Covenant: hiding is legal but priced — a hiding player ticks but never accelerates.

**Storm (Pillar 4)**
- FR25: Phased damage-only storm: three ring groups of ~4 minutes with an internal minute rhythm (min 1 clear seas; min 2 reserved for backburnered supply drops; min 3 next ring revealed; min 4 ring closes), ~12:00 total closure; storm never blinds sensors (reference 4 hp/s).
- FR26: Endgame Guarantee: final ring diameter = 2 standard truesight diameters; after full closure the game continues until there is a winner (~15:00 typical).

**Weapons & Combat**
- FR27: All weapons fire within real firing arcs; per-weapon arc geometry is open design work for the class era.
- FR28: Every fitted system has its own ammo pool and reload timer; every reload ticks every tick regardless of selection.
- FR29: Torpedoes outrun every hull at base speed, spawn with real bow clearance plus owner-only grace (never self-hit at base speed), are never painted by radar; hydrophones are the torpedo warning.
- FR30: Mines arm after a delay, trigger by proximity, capped per-player (oldest evicted) and globally.
- FR31: No dispersion — shots go exactly where aimed; projectiles, never hitscan; travel time is the skill counterweight.
- FR32: Flight rules: torpedoes run until they hit something; shells fly to the clicked point or first collision, whichever comes first.
- FR33: No damage falloff; flat damage model — single hull pool, no sectional damage, no crits, no weak points.
- FR34: Precision bonus (OPEN): standard-gun shell striking at the clicked spot deals bonus damage — adopt or drop during tuning; whether gun-type specials qualify is undecided.
- FR35: Weapon feel package: fall-of-shot splash spotting (misses visible in fog), the Hit Call (muffled boom + orange bloom confirms connection without damage detail), muzzle flash carries (firing lights the fog beyond truesight).
- FR36: Compass vetoes (settled): no torpedo variety, no damage-control parties, no sectional damage.

**AI, Modes & Lobbies**
- FR37: No bot-fill in standard lobbies: minimum 2 human captains, fill-or-timer, cap 20; bots never masquerade as players.
- FR38: Solo vs AI mode: lobby filled with real AI combatant bots playing the battle royale; AI sophistication is dedicated design/implementation work.
- FR39: Roving PvE drone fleets in ALL BR modes: three tiers (common small 1/4 level, uncommon medium 1/3, rare large 1/2), basic gun on longer cooldown used only in self-defense (never hunt players), roving so finding them is sensor gameplay.
- FR40: Every non-human ship is driven through the same input pipeline and subject to the same perception rules — no special code paths.
- FR41: Matchmaking is pure quick play — join whatever lobby is filling; no skill matching, parties, or ranked at beta. Modes at beta: Solo and Solo vs AI.

**Arena & World**
- FR42: One large circular ocean per match; islands procedurally generated from a seed, rebuilt deterministically on both sides; the map never travels on the wire.
- FR43: Islands block line of sight, shells, and torpedoes, and impose collision.
- FR44: Map size scales from the actual roster at countdown — no ghost oceans.
- FR45: Participants spawn on an outer ring, maximum mutual distance, island-clear.
- FR46: Fog banks (the Trade): inside one, your truesight shrinks and you vanish from others' truesight; radar may still paint you.
- FR47: Rare whirlpools: each ocean is secretly northern or southern hemisphere (spin CCW/CW respectively); the current carries ships along its circle (with-current faster, against slower) and rotates heading; no suction — exit from any side.

**Economy & Resources**
- FR48: XP is the only progression currency — no loot scavenging; nothing on the water outranks playing well; the extra slot fills through offers, not pickups.
- FR49: Committed tuning method: batch-simulate XP tick and kill-bonus outcomes with drone lobbies before human playtests.

**Art, Audio & Tone**
- FR50: Aesthetic "CIC Tactical Display, Evolved" per DESIGN.md (source of truth): black void ocean, silver-white linework, phosphor blips, rotating sweep; restrained one-job-per-color; render clarity is a gameplay feature.
- FR51: Audio: WebAudio synthesized tones only, zero sound files; all audio respects the mute toggle; audio is a sensor (bearing-grade engine noise, torpedoes, foghorns).
- FR52: "Silly Is Sanctioned" wrapper: foghorn emotes, named vessels in the kill feed, medals — tension real, wrapper never.

Total FRs: 52

### Non-Functional Requirements

- NFR1: 60 FPS sustained on a low-end school Chromebook in a full 20-ship match with fog, radar sweep, and effects active.
- NFR2: Playable from portal click in under ~10 seconds on that hardware — no install, no account.
- NFR3: Authoritative 20 Hz server simulation with client prediction; feel intact at typical residential latencies up to ~150 ms.
- NFR4: Structural anti-cheat: nothing outside a client's sight ∪ radar sweep ever reaches that client; counter-intel lies indistinguishable on the wire.
- NFR5: Browser support: current Chrome, Edge, Firefox, Safari; desktop keyboard + mouse (mobile/touch out of scope).
- NFR6: Poki/CrazyGames portal technical compliance (bundle size, SDK integration) — hard launch gate.
- NFR7: Asset discipline: procedural vector rendering (no texture/model pipeline), synthesized audio (no sound files), fonts/static assets within portal bundle limits.
- NFR8: Matches complete without crashes or desyncs (pass/fail success metric).
- NFR9: Match completes start-to-results inside ~15:00 (Pillar 2, measured).
- NFR10: Paint-Not-Power: structural no-pay-to-win guarantee — detection is math; cosmetics (and future unlocks) are structurally incapable of being power.

Total NFRs: 10

### Additional Requirements & Constraints

- Numbers in the GDD are design targets or prototype reference values, explicitly tunable; prototype CONFIG values carry no authority.
- Assumption A1: AI combatant bots driven through the same input pipeline as every ship.
- Open design notes (6): Gunboat AP-gun form; per-weapon arc geometry; precision bonus adopt/drop; DESIGN.md real-time-era update pass; Hunter class name (backburner); minutes-1–3 pacing playtest call.
- Dependencies: boon catalog v1 = dedicated design work (E2); combat-bot AI = dedicated work (E5); portal requirements constrain E7; aim reconciliation under latency delegated to architecture; population cold start → LAUNCH_PLAN.md; positioning slogan open (non-blocking).
- Out of scope: backburnered (Hunter class, consumable slots, supply drops, sonar/active ping); post-beta (teams, custom lobbies, ranked/accounts/cosmetics, Rare Pull offers); not-without-design-first (carrier, submarines, mobile).
- GDD's own epic list (E1–E7, sequence E1→E2→E3→E6→E4→E5→E7) — cross-reference for coverage validation.

### GDD Completeness Assessment

Strong: pillars are explicit and every mechanic traces to one; scope boundaries (backburnered / post-beta / vetoed) are unusually crisp; open questions are tagged inline rather than hidden. Watch-items for coverage validation: (1) healing is deliberately unresolved (FR20) — epics must carry it as a gated decision, not an assumption; (2) boon catalog v1 and combat-bot AI are dedicated-work dependencies that need real stories; (3) several OPEN items (Gunboat AP form, arc geometry, precision bonus) must appear as design-decision gates in stories; (4) the GDD epic list has 7 epics while the authoritative epics.md has 8 — expect an Epic 0 (Colyseus 0.17) addition to reconcile.

## Epic Coverage Validation

The epics document carries its own numbered requirements inventory (38 FRs, 17 NFRs, 18 ARs, 39 UX-DRs) plus an explicit FR Coverage Map (all 38 epic-FRs mapped to Epics 0–6; Epic 7 hardens NFRs). Validation below traces the 52 GDD-extracted FRs (this report's numbering) against that inventory and the story-level acceptance criteria.

### Coverage Matrix (GDD FR → epics)

| GDD FR (this report) | Requirement (short) | Epics-doc FR | Epic / Story | Status |
| --- | --- | --- | --- | --- |
| FR1 | Participants-only win check | FR31 | E6 / 6.3 | ✓ Covered |
| FR2 | Loss at hull zero; weapon + storm damage | FR24, FR32 | E3 / 3.1, E5 / 5.2 | ✓ Covered |
| FR3 | ~5 s sinking window, guns live | FR32 | E5 / 5.2 | ✓ Covered |
| FR4 | Reveal → spectate or re-queue | FR33 | E5 / 5.3 | ✓ Covered (deviation: spectate dropped — see below) |
| FR5 | Four class hull envelopes | FR1 | E1 / 1.3 | ✓ Covered |
| FR6 | Universal slot grammar | FR2 | E1 / 1.2 | ✓ Covered |
| FR7 | Four class loadouts | FR4 | E1 / 1.6–1.9 | ✓ Covered |
| FR8 | Class identity never in the gun | FR3 | E1 / 1.4 | ✓ Covered |
| FR9 | Telegraph-and-helm movement | FR11 | E1 / 1.3, E2 / 2.4 | ✓ Covered |
| FR10 | Keyboard scheme (provisional → new) | FR12 | E2 / 2.1 | ✓ Covered |
| FR11 | Mouse aim-in-arc, denied feedback | FR6, FR12 | E1 / 1.10, E2 / 2.1 | ✓ Covered |
| FR12 | Three-tier sensor suite | FR13 | E4 / 4.1 (+ existing tiers) | ✓ Covered |
| FR13 | Class-legible blips | FR14 | E4 / 4.2 | ✓ Covered |
| FR14 | One LOS rule; projectile materialization | FR14, FR15 | E1 / 1.1, E4 / 4.3 | ✓ Covered |
| FR15 | Counter-intel: lies live on the server | FR10 + AR5 | E1 / 1.8 | ✓ Covered |
| FR16 | XP tick + banked points | FR18 | E2 / 2.6 | ✓ Covered |
| FR17 | Pre-rolled 4-boon offers, never reroll | FR19 | E2 / 2.7 | ✓ Covered |
| FR18 | Hades-style catalog; legacy stripped | FR20 | E2 / 2.8 | ✓ Covered |
| FR19 | Off-class abilities in offers | FR21 | E2 / 2.8 | ✓ Covered |
| FR20 | Healing OPEN — assume neither way | (conflict note) + AR4/AR9 | E2 / 2.5, 2.8; E5 / 5.1 | ✓ Covered as gated open question |
| FR21 | Kill-only bonuses, tier fractions | FR18 | E2 / 2.6 | ✓ Covered |
| FR22 | The Bounty | FR17 | E4 / 4.6 | ✓ Covered |
| FR23 | The build must be felt | FR22 | E2 / 2.9 | ✓ Covered |
| FR24 | Rat Covenant (tick, never accelerate) | FR18 (structural) | E2 / 2.6 | ✓ Covered structurally |
| FR25 | Phased storm, minute rhythm | FR24 | E3 / 3.1 | ✓ Covered |
| FR26 | Endgame Guarantee ring | FR25 | E3 / 3.4 | ✓ Covered |
| FR27 | Real arcs; class-era redesign | FR6 | E1 / 1.10 | ✓ Covered |
| FR28 | Per-system ammo/reload always ticking | FR5 | E1 / 1.2 | ✓ Covered |
| FR29 | Torpedo laws | FR7 | E1 / 1.6 | ✓ Covered |
| FR30 | Mine arming/caps | FR8 | E1 / 1.8 | ✓ Covered |
| FR31 | No dispersion, projectiles-not-hitscan | FR9 | E1 / 1.4 | ✓ Covered |
| FR32 | Flight rules | FR9, FR7 | E1 / 1.4, 1.6 | ✓ Covered |
| FR33 | No falloff, flat damage | FR9 | E1 / 1.4 | ✓ Covered |
| FR34 | Precision bonus (open) | FR9 | E1 / 1.4 (gate WITH ERIC) | ✓ Covered as decision gate |
| FR35 | Weapon-feel package | FR16 | E4 / 4.3, 4.4 | ✓ Covered |
| FR36 | Compass vetoes | AR16 | E1 scope guardrail | ✓ Covered |
| FR37 | No bot-fill; min-2; cap 20 | FR34 | E6 / 6.1 | ✓ Covered |
| FR38 | Solo vs AI with real combat bots | FR35, FR36 | E6 / 6.4, 6.5 | ✓ Covered |
| FR39 | Roving PvE fleets, 3 tiers | FR30 | E5 / 5.6 | ✓ Covered |
| FR40 | Same input pipeline for all ships | FR37 | E5 / 5.6, E6 / 6.4 | ✓ Covered |
| FR41 | Pure quick play; two modes | FR35 | E6 / 6.1, 6.6 | ✓ Covered |
| FR42 | Deterministic seeded ocean | FR26 | E5 / 5.4, E6 / 6.2 (+ existing) | ✓ Covered |
| FR43 | Islands block LOS/projectiles/movement | FR26 | existing + E5 | ✓ Covered |
| FR44 | Roster-scaled map | FR27 | E6 / 6.2 | ✓ Covered |
| FR45 | Spawn-ring rules | FR27 | E6 / 6.2 | ✓ Covered |
| FR46 | Fog banks | FR28 | E5 / 5.4 | ✓ Covered |
| FR47 | Hemisphered whirlpools | FR29 | E5 / 5.5 | ✓ Covered |
| FR48 | XP only currency; nothing scavenged | FR18–21 scope + AR17 | E2 (structural) | ✓ Covered structurally |
| FR49 | Batch-sim tuning method | AR18 | E2 / 2.10 | ✓ Covered |
| FR50 | CIC aesthetic per DESIGN.md | UX-DR1–5 | E1 / 1.11 | ✓ Covered |
| FR51 | WebAudio-only; audio-as-sensor | NFR9, UX-DR36 | E4 / 4.1, 4.7 | ✓ Covered |
| FR52 | Silly Is Sanctioned: foghorn, named vessels, **medals** | FR16 (foghorn), UX-DR17 (names) | E4 / 4.5, E1 / 1.12; **medals NOT FOUND** | ⚠ PARTIAL |

### Missing / Deviating Requirements

**Partial — FR52 (medals).** The GDD's "Silly Is Sanctioned" contract names three artifacts: foghorn emotes (covered, Story 4.5), named vessels in the kill feed (covered, Story 1.12), and **medals** — which appear in no epic, story, or UX requirement (grep-verified across epics.md, DESIGN.md, EXPERIENCE.md).
- Impact: Low. Medals are a tone-wrapper item, not a mechanic; nothing downstream depends on them. But the trace is silently broken — neither built nor explicitly descoped.
- Recommendation: either add medals to an existing story (natural home: Story 5.3's results modal, or the kill feed) or add them to AR17's backburner list so the omission is a decision, not a leak.

**Documented deviation — FR4 (spectate).** GDD offers "spectate or instant re-queue" after death; the UX phase deliberately resolved this to reveal → results → RETURN TO PORT with **no spectate** ("no dead spectate button", UX-DR27; "spectate-others" is post-beta per AR17). This is a ratified UX decision, not a gap — but Story 7.5's GDD-reconciliation list (4-card offers, "Solo vs AI" naming) does not include the spectate correction. Recommend adding it there so the GDD gets fixed in the same pass.

**Reverse trace (epics-only FRs).** Epics FR23 (hold-Space refit UX), FR38 (disconnection/reconnection), and FR10 (decoy wire-indistinguishability) have no direct GDD text — they derive legitimately from the UX spec, the architecture (Colyseus 0.17 / AR1–AR2), and the counter-intel law respectively. All three are properly sourced; no orphan requirements found.

### Coverage Statistics

- Total GDD FRs extracted: 52
- Fully covered in epics/stories: 50
- Covered with documented deviation: 1 (FR4 — spectate resolved away by UX)
- Partially covered: 1 (FR52 — medals untraced)
- Missing entirely: 0
- Coverage: 51.5 / 52 ≈ **99%**

## UX Alignment Assessment

### UX Document Status

**Found — comprehensive.** `DESIGN.md` (visual identity spine: tokens, typography, components, silhouette language, Regatta Hoist) + `EXPERIENCE.md` (interaction contract: IA, input primitives, state patterns, accessibility floor, key flows), both status `final`, reviewer-gate validated 2026-07-16, with ratified mockups. The epics document translates them into 39 numbered UX-DRs bound to specific stories — an unusually strong UX→story trace.

### Alignment Confirmations (three-way: UX ↔ GDD ↔ Architecture)

- **Conflict-resolution discipline works:** 4-boon offers (UX supersedes GDD's original 3 — GDD already carries the ratification note) and "Solo vs AI" naming are consistently applied in epics.
- **Heal question** is held open identically in all four documents (GDD FR20, UX Open Q1, epics conflict note, architecture D4/D2 "accommodates a future heal") — no document forecloses it.
- **Performance floor** is identical in EXPERIENCE.md and architecture (Chromebook 60 FPS / <10 s / ~150 ms), and the architecture operationalizes it (frame budget, latency proxies) — properly reflected in epics NFR1/NFR3.
- **Silhouette-is-hitbox, hold-Space refit, fog-server-authoritative zoom, nameplates-on-all, reveal survivor set, attention-priority tiers, accessibility floor** — all consistently carried from UX into story acceptance criteria.
- **Architecture's flagged UX constraint (D6 queue liveness)** is honored by Story 6.6 even though the UX docs predate it (see Issue 2).

### Alignment Issues

1. **Stale "spectate" wording in GDD and Architecture (Low).** UX ratified *no spectate in v1* (UX-DR27; "spectate-others" post-beta). GDD ("spectate or instant re-queue") and architecture (D4 detail: "reveal → spectate/re-queue") still carry the old wording. Stories follow UX correctly; recommend adding the spectate correction to Story 7.5's GDD/doc reconciliation list.
2. **Queue-liveness surface is unmocked (Low).** Architecture D6 requires the menu to surface queue vitality and steer players to Solo vs AI when Standard is empty; Story 6.6 implements it — but neither DESIGN.md nor EXPERIENCE.md specs that surface (home mock has only a server-status line). A small UX design decision will have to be made inside Story 6.6; acceptable, but it is design work hiding in an implementation story.
3. **Reconnection UX is post-UX-phase (Low).** EXPERIENCE.md's match-lifecycle row still says "Disconnect mid-match: banner + return home" — written before the architecture's auto-reconnect decision (2026-07-17). Stories 0.2/6.7 spec the newer resume flow correctly; the UX doc should pick up the "RECONNECTING" pattern in the 7.5 refresh.
4. **Listening-ring information asymmetry (Observation).** The wire carries `bearing + sound class` (AR6/Story 4.1) while the ratified visual is deliberately source-ambiguous (pure intensity pips) and the audio twins DO distinguish source by tone. Two consequences worth stating aloud: (a) hearing players get source identification that deaf players structurally can't (accepted via the informed-intent triage, but the asymmetry isn't written down as a waiver the way the color-identity one is); (b) a modified client could render the sound class the legit UI hides. If visual source-ambiguity is a *fairness* rule, the wire shouldn't carry sound class beyond what audio needs; if it's only an *aesthetic* rule, no change needed. Recommend a one-line ruling in Story 4.1.
5. **Class-card pip values have no closing story (Low).** UX Open Q13 (SPEED/TOUGHNESS/TURNING pips are placeholders) is repeated verbatim in Story 1.14's AC — no story ever replaces placeholders with values derived from the Story 1.3 envelopes. Cheap fix: one AC line in 1.14 or 7.6 deriving pips from CONFIG.
6. **Island colors have no owner (Low).** UX Open Q6 (island fill/stroke never re-ratified) is only conditionally mentioned in Story 7.5 ("if settled"). Nothing settles it. Fine to ship provisional colors — but say so explicitly, or attach the decision to Story 3.2 (the other on-water color ruling).
7. **The ad-break moment is undesigned (Low).** Architecture names death→requeue as the revenue seam and Story 7.3 requires the ad to play "without breaking the reveal-results-home flow" — but no UX doc depicts where the ad sits in that ratified sequence. Portal SDKs constrain this anyway; flag it as an explicit E7 design note rather than discovering it during integration.

### Warnings

- None blocking. UX coverage is exceptional for this project stage; all seven issues above are documentation-hygiene or small in-story decisions, not structural misalignments. The genuinely open UX questions that are load-bearing (storm edge, foghorn key, sound map, whirlpool treatment, reveal-zoom exemption, first-run default class) are each carried as explicit WITH-ERIC decision gates in named stories — the correct pattern.

## Epic Quality Review

Scope reviewed: 8 epics (0–7), 59 stories, all acceptance criteria. Standards: player-value epics, epic/story independence, no forward dependencies, just-in-time data creation, testable Given/When/Then ACs, FR traceability.

### Structural Findings

**Epic value framing.** Epics 1–6 are genuinely player-centric ("pick any of four classes and the game feels different at 0:00", "the water itself creates stories"). Epic 0 is a technical epic by the book — but it is the architecture's mandated work-item-#0, its payoff story (0.2 reconnection) is real player value on the target audience's actual network conditions, and it is honestly framed. Epic 7 covers no FRs by design (NFR hardening) — correct for a launch gate. Accepted with justification.

**Epic independence: PASS.** The sequence 0→1→2→3→4→5→6→7 never requires a later epic to function. Spot-checked every cross-epic reference: all are either backward (3.1 uses the 2.10 harness; 4.6 pays XP through the 2.6 pipeline; 5.2 uses the 1.2 activation gate installed as a passthrough), or forward-compatible stubs done right (2.6 wires PvE XP fractions as CONFIG hooks before fleets exist; 1.2 installs the sinking gate before the sinking state; 0.4 installs the portal seam years before SDKs). The ratified interregnum (legacy economy running on new classes between E1 and E2) is a documented, deliberate bridge — exactly how a brownfield transition should be written.

**Forward dependencies: none blocking.** Every "lands later" mention is annotated as a tie-in, not a requirement (1.5's muzzle-flash masking → E4; 1.13's reveal-scope nameplates → 5.3; 3.3's reveal persistence → E5; 5.6's multi-mode win coverage → 6.3).

**Data-creation timing: PASS.** loadout.ts arrives in 1.2, boons.ts/hooks.ts in 2.5, lifecycle.ts in 5.1 — each structure is created by the story that first needs it. The one early creation (signals.ts in 1.1, ahead of E4's signal load) is explicitly justified: the 1.8 decoy story builds on it and E4 then only adds rows.

**AC quality: strong.** Consistent Given/When/Then; ACs cite FR/AR/UX-DR ids (bidirectional traceability); error paths are specified where they matter (spend reject/timeout latch release, reconnect-after-sunk routing, tick-error containment, denied-input feedback). Eleven open design decisions are carried as explicit "resolved WITH ERIC in this story" gates (precision bonus 1.4, AP form 1.9, arcs 1.10, default class 1.14, catalog 2.8, storm edge 3.2, foghorn key 4.5, sound map 4.7, sinking policy 5.2, reveal-zoom 5.3, whirlpool treatment 5.5) — the correct mechanism for a design-decisions-belong-to-Eric project.

**Brownfield checks: PASS.** Migration is contained (0.1 bounded to the adapter layer; compat re-exports retained; interregnum bridges the economy), and pure-refactor stories pin behavior with tests-green / byte-identical-wire criteria.

### Violations & Concerns

🔴 **Critical: none.**

🟠 **Major:**
1. **Story 6.4 (Combat-Bot AI) is epic-sized risk in one story.** The GDD and architecture both call combat-bot AI "dedicated design/implementation work" and place it on the retention critical path (Solo vs AI is most players' first match). One story covers utility scoring, staggered perception, class-loadout usage including refit spending, an import-boundary lint, and a measurement harness duty. Recommendation: at sprint planning, pre-split into (a) bot driver + observe/inputs plumbing, (b) utility behaviors + tuning, (c) bot-vs-bot evaluation — or explicitly budget it as a multi-sprint story. No document change required; a create-story-time split is fine.

🟡 **Minor:**
2. **Enabler stories wear captain-voice thinly** (1.1 signal registry, 1.2 equipment port, 2.5 boon engine, 5.1 lifecycle/STEP_ORDER). No captain wants "a declarative perception registry." Harmless — the scope is honest, each is a pure refactor with pinned behavior, and each is consumed within its own epic — but they are technical stories and should be scheduled as such (no demo value on their own).
3. **Story 1.8 references UX-DR20 rendering that is assigned to Epic 4.** Mines "render at ~truesight per UX-DR20" in E1, while UX-DR20 is E4 scope. The prototype's existing mine render covers the E1 need; suggest the AC say "existing render acceptable until Epic 4" to prevent scope-pull.
4. **Torpedo-warning gap during the interregnum.** From E1 (new torpedo-heavy class) until E4 (listening ring), torpedoes have no long-range warning — the GDD names hydrophones as THE torpedo warning. The ratified sequence already minimizes this (texture epic moved ahead of world/modes), but E1–E3 playtests will over-reward torpedo ambushes; treat playtest balance impressions from that window accordingly.
5. **Story 7.1 embeds a hardware acquisition.** The real Chromebook is acquired inside the story that needs it. Per-epic budgets run on the 4×-throttle proxy until then; acquiring the device around E4 (when effect load actually accumulates) would de-risk the proxy→real transition. Logistics note, not a document defect.
6. **Banked-level chip ownership is ambiguous between 2.2 and 2.6.** UX-DR12's satellites (chip, XP rail, cue line) have behaviors specified in 2.6's ACs while 2.2 builds the hotbar+badge. Any resolution is fine; name the owner at create-story time.

### Best-Practices Checklist (per epic)

| Epic | Player value | Independent | Sizing | No fwd deps | JIT data | Testable ACs | FR trace |
|---|---|---|---|---|---|---|---|
| 0 | ⚠ justified | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (FR38) |
| 1 | ✓ | ✓ | ✓ (14 stories, sequenced) | ✓ | ✓ | ✓ | ✓ |
| 2 | ✓ | ✓ | ✓ (2.8 large, gated) | ✓ | ✓ | ✓ | ✓ |
| 3 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 | ✓ | ✓ | ⚠ 6.4 oversized | ✓ | ✓ | ✓ | ✓ |
| 7 | ✓ (launch) | ✓ | ✓ | ✓ | ✓ | ✓ | — (NFR epic) |

## Summary and Recommendations

### Overall Readiness Status

# ✅ READY

Hullcracker.io's planning artifacts are ready for Phase 4 implementation. Zero critical issues. FR coverage is ~99% with full bidirectional traceability (GDD → epics-doc FRs → story ACs, plus AR and UX-DR ids cited inline). Epic independence holds across all 8 epics; no blocking forward dependencies exist; the eleven open design questions are all carried as explicit WITH-ERIC decision gates inside named stories rather than hidden assumptions. This is an unusually disciplined artifact set.

### Critical Issues Requiring Immediate Action

**None.** No finding blocks starting Epic 0 / Story 0.1.

### Issues Worth Fixing (non-blocking, cheapest fixed before or during early stories)

1. **Medals are untraced (FR52 partial)** — the only broken requirement trace. Decide: add to Story 5.3's results modal / the kill feed, or explicitly backburner in AR17.
2. **Story 6.4 (Combat-Bot AI) is epic-sized** — pre-split at sprint planning (driver/plumbing · behaviors · evaluation); it sits on the retention critical path.
3. **Listening-ring wire vs. visual asymmetry** — one-line ruling needed in Story 4.1: is visual source-ambiguity fairness (then don't send sound class) or aesthetics (then no change)?
4. **Doc-hygiene batch for Story 7.5's reconciliation list** — add: spectate correction (GDD + architecture still say "spectate"), reconnection UX (EXPERIENCE.md predates auto-reconnect), class-card pip values (no closing story), island colors (no owner), ad-break placement note (E7).
5. **Story 1.8 mine-render scope guard** — annotate "existing render acceptable until Epic 4" to prevent UX-DR20 scope-pull into E1.
6. **Chromebook acquisition timing** — consider acquiring the reference device around Epic 4 rather than inside Story 7.1.

### Recommended Next Steps

1. **Proceed to `gds-sprint-planning`** — the epics are implementable as written. Apply issue 2 (6.4 split) during that planning pass.
2. **Sweep issues 1 and 3–5 into the artifacts** (one small PR touching epics.md + a Story 7.5 list extension) — ~30 minutes of edits; none change scope.
3. **Begin Story 0.1 (Colyseus 0.17 upgrade)** once sprint planning lands — the architecture, epics, and this assessment all agree it is the first thing built.

### Final Note

This assessment identified **14 findings across 4 categories** (1 partial FR trace, 1 documented deviation, 7 UX-alignment items, 1 major + 5 minor epic-quality items — several overlapping). None are critical; all are documented above with specific remediation. The artifacts may be improved first or used as-is — the recommended path is the small hygiene PR, then sprint planning.

**Assessor:** Implementation Readiness workflow (gds-check-implementation-readiness), run by Claude as Game Producer / Scrum Master with Eric
**Date:** 2026-07-17
**Documents assessed:** gdd.md (2026-07-16) · game-architecture.md v1.0 (2026-07-17) · epics.md (8 epics / 59 stories, 2026-07-17) · DESIGN.md + EXPERIENCE.md (final, 2026-07-16)

## Post-Assessment Decisions (Eric, 2026-07-17)

1. **Medals (FR52 partial): BACKBURNERED.** Added to epics.md AR17's backburner list in this PR — the trace is now a decision, not a leak.
2. **Story 6.4 sizing: ACCEPTED AS-IS.** No pre-split; implemented as one story.
3. **Listening-ring asymmetry: RESOLVED — NO CHANGE.** Visual source-ambiguity is an aesthetic choice, not a secrecy rule: audio tones already legitimately reveal source type to hearing players, and the client needs the sound-class field to pick the right tone. Wire contract stays as designed (AR6 / Story 4.1). The ring remains fully useful: bearing + loudness visually, source by ear, sight confirms.
4. **Doc-hygiene batch: RESOLVED (Eric, 2026-07-17).** Class-card pips are wanted as a real balancing aid — Story 1.14 now derives pip values from Story 1.3's CONFIG envelopes (closes UX open Q13). Spectate + reconnection wording added to Story 7.5's reconciliation list (island colors were already there). The ad-break placement item is DROPPED: portal release is speculative to Eric ("when/if it matters" — primary distribution is the direct URL, where no ads exist); the Epic 0 adapter seam suffices until portals actually matter.
