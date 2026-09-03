# Decision Log — Hullcracker.io GDD

## 2026-07-16 — FINALIZED (v1.0)

All Finalize steps complete: decision-log audit, input reconciliation (brief/brainstorm/forge subagents), validation pass (one blocker + all warnings resolved or explicitly accepted), open-items triage (no phase blockers remain; open notes are indexed in Assumptions and Dependencies), guardrails ratified. The GDD is ready for `gds-game-architecture`.

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

## 2026-07-16 — Class loadouts locked (decided)

Slot role definitions (Eric): **basic** = short cooldown, basic damage, available most of the time; **special** = what makes the class feel unique; **other** = equipment complementing the class fantasy. No editorial flavor attached to cells.

Final beta loadout table (Eric's rows):
- **Torpedo Boat:** light quick-firing gun / torpedo tubes / smoke screen.
- **Battleship:** deck guns / long-range cannon (the artillery) / star shells. Damage-reduction cooldown NOT taken; tank fantasy lives in the hull envelope.
- **Mine Layer:** modest gun / proximity-fused mines / decoy buoy.
- **Gunboat:** quick-firing gun battery / armor-piercing gun (form OPEN: separate higher-cooldown gun vs activatable damage/RoF buff) / speed boost (tentative).
- Focus-not-exclusivity (forge lock) recorded in the section: loadouts are fitted defaults from a shared armory.
- Gunnery-feel trio (#19 Hit Call, #21 fall-of-shot, #34 muzzle flash carries) written in as weapon-feel design intent from the #90 bundle.
- Process correction (Eric): facilitator was proposing from a thin digest instead of the actual brainstorm/forge contents — deep extraction pulled; future proposals must be grounded in the source items (#NN references).

## 2026-07-16 — Universal basic gun (decided)

- **Everyone has the same basic gun, working the same way** (Eric). Class differentiation = special weapon + "other" equipment + hull stats. Loadout table's basic column collapsed to "Standard gun."

## 2026-07-16 — Aiming and combat rules (decided)

- **No dispersion** (Eric: "Shots go where they are aimed. There is travel time to get there.")
- **No damage falloff.** Flight rules: torpedoes run until impact; shells fly to the click or first hit en route.
- **Precision bonus — GUNS ONLY, status open (Eric's correction):** idea originated in the universal-guns era (guns barely dealt damage); shell hitting the target at the exact clicked spot = bonus damage; en-route collisions or dodged-click grazes = base damage. Torpedoes never qualify (no range maximum). Its survival is tied to the gun redesign — documented as an open idea, not a settled rule.
- **Arcs retained but geometry reopened:** with per-class weapons, arcs should allow use in more situations while rewarding skill (vs. arcs-as-positional-aiming under universal weapons). Exact per-weapon arcs TBD.
- Flat damage model reaffirmed (no sectional/crits/weak points — compass veto).

## 2026-07-16 — Bots, modes, and PvE fleets (decided)

- **No bot-fill in standard lobbies** (Eric, emphatic). Standard BR = humans only, min 2, fill-or-timer, map scales from actual roster.
- **NEW MODE — "Solo vs Bots":** fills the lobby with actual AI combatant bots to fight against. Beta scope.
- **Roving PvE drone fleets IN for beta, in ALL BR modes** (standard + solo-vs-bots): small ships, basic gun on longer cooldown, self-defense only, huntable for XP. "The mechanism is already there" (drone pipeline). Supersedes the forge's narrower "map-marked XP pockets" framing — these rove.
- **Win check counts match participants only, in every mode** (Eric's clarification): PvE fleets are not participants — never need to be destroyed to win, can never win. Participants = human captains (standard) / human + AI combatant bots (Solo vs Bots).

## 2026-07-16 — Arena + Multiplayer (decided)

- **Fog banks IN** (#43-r, the Trade). **Rare whirlpools IN** — mechanic defined by Eric: ocean is secretly northern/southern hemisphere (never revealed); spin = CCW north / CW south; crossing ships are carried along the circular current (with-current = faster, against = slower) and their heading rotates with the spin; exit any side, no suction. **Supply drops backburnered.**
- **Sinking window / Go Down Shooting merged and IN (Eric):** at 0 HP, ~5 s sinking window — hull gradually decelerates to a stop ("like a musical ritard"), guns stay live, chance to kill your attacker. Not a map feature; a death mechanic. Written into Win/Loss Conditions.
- **Lobby: min 2 humans to start, cap 20 for now.**
- **Pure quick play** at beta; modes = Solo and Solo vs Bots. No skill matchmaking, no parties, no ranked.

## 2026-07-16 — Endgame Guarantee redefined (decided)

- **Final ring diameter = 2 standard truesight diameters** (Eric), replacing the forge's "final circle smaller than truesight." Rationale: close enough to force combat; far enough that radar is still needed; no clear advantage for close-range ships over long-range ships. Updated in Pillar 4, Primary Mechanics (storm), Arena, and Difficulty Curve.

## 2026-07-16 — Progression numbers (decided)

- **Ring split: 3 groups × 4 minutes** with per-ring minute rhythm (Eric): min 1 clear seas; min 2 supply drops spawn (backburnered — reserved slot); min 3 next ring revealed; min 4 ring closes. Total ~12:00.
- **Passive tick stays ~1 level/min** — ~12 passive levels accepted ("Upgrades are fun, I want players to have them"). No retune.
- **Kill bonus: kill-only, no damage XP** (resolves #67's hybrid question). Handwave values (shape committed, fractions tunable): opponent kill = 1 level; PvE common small = 1/4; uncommon medium = 1/3; rare large = 1/2.
- PvE fleets gain three tiers (common/uncommon/rare, rising HP) — Enemy Design section updated.

## 2026-07-16 — Technical Specifications (decided)

- Eric approved the proposed targets ("Good numbers"): 60 FPS on low-end Chromebook in a full 20-ship match; <~10 s portal-click-to-playable; 20 Hz authoritative sim + prediction, good feel to ~150 ms; structural anti-cheat (sight ∪ sweep chokepoint, server-side lies); desktop browsers (Chrome/Edge/Firefox/Safari), portal compliance as hard constraint; procedural rendering + tone-only audio (no asset pipeline).
- Art/Audio tone resolved in favor of the newer brief ("Silly Is Sanctioned" wrapper) over DESIGN.md's hex-era "not playful — focused"; DESIGN.md flagged for an RT-era update pass.

## 2026-07-16 — Development Epics (decided)

- Seven-epic structure approved by Eric ("Looks fine to me"): E1 Armory, E2 New Economy, E3 Ring, E4 Living Ocean, E5 Honest Lobbies & Modes, E6 Information Texture, E7 Portal Launch Readiness. Sequence E1→E2→E3→E6→E4→E5→E7.
- **Keyboard-controls rework added to E2** (Eric's suggestion to merge rather than a separate epic); slot-selection keys coordinate with E1.
- Detailed breakdown written to epics.md; summary table in gdd.md.

## 2026-07-16 — Slot grammar v2 + off-class offers; metrics; out of scope (decided)

- **Slot grammar restated (Eric):** everyone gets the (universal) gun; everyone has TWO special abilities, at least one a weapon; plus one extra slot.
- **The extra slot fills through the upgrade economy (Eric's idea):** ALL class-specific abilities can appear in boon offers — this is how anyone gets torpedoes/mines/smoke. Un-backburners the pickup slot; realizes focus-not-exclusivity through the economy. Off-class offer weighting = open tuning (subsumes the Eclipse-dial question: off-class access is decided, pricing isn't).
- Consumable slots remain backburnered.
- Success Metrics written (Eric approved the proposal): tech targets as pass/fail; gameplay = <15:00 matches, immediate re-queue as fun proxy, real pick rates across all four classes, one playtest question per pillar.
- Out of Scope finalized in three intent tiers: backburnered (Hunter, consumables, supply drops, sonar/ping), post-beta (teams, ranked, accounts, cosmetics, unlockables), design-first (Carrier, subs, mobile).

## 2026-07-16 — Finalize: reconciliation + validation autofixes applied

Four subagents ran (brief, brainstorm, forge reconciliation; checklist validation). Mechanical fixes applied without changing any design decision: duplicate Multiplayer stub removed; "Five classes" → four; ring-split wording closed (3×4 decided); stale "kill-banked" wording in USP 4 / Pillar 3 / loop step 5 corrected to XP economy; E2 title aligned; #NN citation note added; compass vetoes (torpedo variety, damage-control parties) recorded as armory guardrails in Weapon Systems + E1; island-stuck bug #64 landed in E1; drone-lobby batch-simulation method restored (Progression + E2); leak-law property-test QA note added to E2; minutes-1–3 pacing open note added to Assumptions; "unlocks never power" law + Service Record/Pennants added to Out of Scope; Pixi wording de-implementation-ized.

Findings requiring Eric's ruling (presented in-conversation): Bounty #47; 10-Minute Covenant #55 vs 15-min contract; custom/private lobbies (forge lock 5); radar fidelity direction (forge lock 7); "Kinetics as Hero" guardrail lines; Rare Pull #84 status; "Sensors First, Fork Later" motto vs epic order; weapon-feel numbers deferral; aim reconciliation under latency (proposed: architecture-phase open question).

## 2026-07-16 — Finalize rulings (Eric)

1. **Bounty #47 IN** (E6 + Progression balance laws).
2. **10-Minute Covenant #55 formally retired**: at 12:00 the ring is fully closed; the game continues until there is a winner, ~15:00.
3. **Custom/private lobbies: post-beta.**
4. **Radar fidelity IN** (E6), with Eric's design rationale: real radar = distance/speed/size; AIS justifies identification — blips show ship outline + speed/heading so direction of travel is readable.
5. Kinetics-as-Hero guardrails — **RESOLVED**: rules 2 and 3 kept as pillar guardrails ("info noise must never bury the hunt"; "fix deduction on the sensing side, not with stats") + E6 warning label. "The helm is the star" rejected — a facilitator invention, not Eric's ("Yes, it's a boat. It drives like a boat.").
6. **Rare Pull #84 backburnered("-ish")**: boon catalog v1 is basics-first; anything springing from it comes later.
7. **"Sensors First, Fork Later" motto retired** (fork resolved; epic order runs classes first).
8. **Weapon-feel numbers deferred to E1**; balance will be adjusted for sure — no table now.
9. **Aim reconciliation under latency delegated to the architecture phase**; design requirement stays "feel intact at ~150 ms."

### Open items carried in from brief/forge — final triage (2026-07-16)

1. Ring-phase split — **RESOLVED**: 3 groups × 4 min with per-ring minute rhythm.
2. Kill-bonus ratio — **RESOLVED**: kill-only; opponent = 1 level; PvE ¼/⅓/½ by tier (fractions declared tunable handwaves).
3. XP-tick retune — **RESOLVED**: ~1 level/min stands; ~12 passive levels accepted deliberately.
4. Slot taxonomy + launch class list — **RESOLVED**: universal gun + two specials (≥1 weapon) + offer-filled extra slot; four classes (Torpedo Boat, Battleship, Mine Layer, Gunboat); Hunter backburnered.
5. Eclipse dial + deck-merge — **PARTIALLY RESOLVED**: off-class access now exists via boon offers; weighting/pricing = open tuning (E2).
6. The Unwitnessed Build — **ADDRESSED as a standing requirement**: "the build must be felt" written into the economy section and E2.
7. Positioning slogan — **OPEN, non-blocking** (marketing). Stat simplification #87 — **SUPERSEDED** by wholesale Hades-style boon replacement. Quiet Dread minutes 1–3 — **PARTIALLY ADDRESSED** by the ring rhythm (minute-1 "clear seas" is now by design); final call remains a playtest question.
8. Conservation Law demotion — **RESPECTED**: written into Progression as a tendency; anti-snowball outranks it.
9. Population cold start (brief: "needs a real launch-day answer before public beta") — **OPEN**, tracked under Assumptions and Dependencies; launch work, not GDD-blocking.

---

## Correction pass — 2026-07-17 (post-UX-phase, gds-gdd Update mode)

- **Offer size: 3 → 4.** Ratified by Eric during the gds-ux run (2026-07-16): offers present 4 upgrade choices at a time (keys 1–4 in the refit window). "3 upgrades from 3 distinct categories" superseded throughout gdd.md + epics.md; distinct-categories rule preserved, category total per offer left unpinned.
- **Heal design law → open question.** Eric (2026-07-17): "genuinely unsure on how to handle heals in this game right now." The flat "no heal option in the economy — a design law" is softened: current build ships no heal; the law (self-heal never a ship feature) is under reconsideration; candidate routes are heal-as-upgrade-card or consumables. Boon-catalog work must not assume either way.
- **Mode rename: "Solo vs Bots" → "Solo vs AI."** Ratified during the gds-ux run; renamed in gdd.md (5 sites incl. E5 epic row + AI assumption) and epics.md (2 sites). Mechanics unchanged.

---

## Update pass — 2026-07-19 (supplemental brainstorm + party-mode rulings, gds-gdd Update mode)

Change signal: `_bmad-output/brainstorming-session-2026-07-19.md` (focused session: gunboat replacement, ship classes, weapons, upgrades) plus its same-day party-mode Addendum, whose final rulings supersede the session's roster sections.

**Reversals / re-scopes applied:**

- **Beta roster: four classes → THREE (Torpedo Boat, Battleship, Mine Layer).** The gunboat is cut — reverses the 2026-07-16 "four classes" resolution. Rationale (party-mode ruling): prove the concept in front of players first, then expand.
- **Torpedo Boat signature ability: smoke screen → speed boost** (inherited from the cut gunboat — fits the "zip around firing torps" fantasy). **Smoke screen orphaned to the equipment/boon pool** as content.
- **Mine Layer signature ability: decoy buoy → OPEN.** The buoy is under rethink, and **mine mechanics themselves are flagged unsettled** — upstream design work before the ML loadout is specced. Candidate resolutions banked (mine+buoy shared radar signature #34, sonobuoy #42).
- Gunboat AP-gun open note deleted with the class.

**Additions:**

- **Roster formula ratified:** class = hull envelope + one signature ability (on cooldown) + (sometimes) one signature weapon, on the shared kit. Counterplay lives in abilities-on-cooldown and universal tools — never in classes.
- **Hades-hammer upgrade model (Eric's model):** 4 choices ~one per slot; slot 4 = equipment (new-from-pool when empty, upgrade-to-owned when filled); some upgrades mutate a weapon into one of 2–3 variants; **variants are upgrades, never starting kit; class identity never depends on them**. Party-mode validated the model against the ratified 4-boon offer structure (FR19/AR4; slotReplace = variants' natural home). Flagged tension (open note): "boons, not stat multipliers" (07-16) vs "most upgrades are stat increases" (07-19) — resolve during boon-catalog design.
- **First-run class select:** three cards, forced meaningful choice, no pushed default; TB pre-focused for keyboard flow.
- **Session design laws folded in:** arcade prime directive (pillar guardrail 3); universal counterplay only + no death pings / free information (balance laws); hydrophones are core kit on every hull (sensor suite); six-great-classes quality bar (roster).
- **Deferred/expansion blueprint recorded in Out of Scope:** Submarine (bench 1, most developed — timed submerge), Carrier (bench 2 — aircraft mechanics TBD), Decoy Ship (banked — flavor TBD); banked weapon-variant / equipment / mechanic ideas listed with a pointer to the session doc. Former Hunter concept linked to the session's tabled Radar Picket (same design space). Torpedo-variety compass veto ruled compatible with variant mutations (they replace the slot's design, never add a second).

**Files touched:** gdd.md (frontmatter → updated 2026-07-19; Background, Ship classes, Slot grammar, Kinematics note, Sensor suite, Upgrade economy, Weapon Systems table + vetoes, Pillar guardrails, Balance laws, E1 summary row, Success Metrics, Out of Scope, Assumptions & open notes), epics.md (E1 re-scoped to three loadouts + class-select story replacing the gunboat story; E2 aligned to the Hades-hammer structure).

**Correction (Eric, 2026-07-19, during this update pass):** the boost-lays-smoke-trail combo is **REJECTED, not banked** — Eric: "a shitty idea. This is an arcade style game, not World of Warships." Removed from the GDD's banked-content list; falls under the arcade-prime-directive law.

**Correction (Eric, 2026-07-19, during this update pass):** the shell-selector concept (AP/HE shell variants) is **REJECTED, not banked** — Eric: "this is not how I want it to work, that's too complicated for this kind of game." It was a facilitator idea, never his; the session doc's "raised, undeveloped" line overstates its status. Removed from the GDD's banked-content list; it does not appear anywhere in the document set.

**Correction (Eric, 2026-07-19, during this update pass):** the extra-slot mechanism is **unchanged** — every class-specific ability in the game can still appear in boon offers to fill the extra slot (the 2026-07-16 resolution stands). The update's initial rewording of that slot as equipment-pool-only, plus a NOTE questioning whether live class abilities remain offerable, was wrong and has been reverted in gdd.md and epics.md. The Hades-hammer slot-4 equipment behavior is captured in the upgrade-economy model alongside — it does not replace off-class ability offers.

**Propagation note:** production-epic/story fallout (1.9 Gunboat Loadout obsolete; 1.3 = three hull envelopes; 1.6 TB = torps + boost; 1.14 = three cards / no default; 2.8 boon catalog = three kits; 4.2 = three silhouettes) is `gds-correct-course` work against `_bmad-output/planning-artifacts/epics.md`, not this document set.

---

## Update pass — 2026-09-03 (deck model v3 forge, gds-gdd Update mode)

Change signal: `_bmad-output/forge/deck-model-v3/forged-idea.md` (2026-09-02, "The Deck Model v3 — HARDENED"), the forge of `_bmad-output/brainstorming-session-2026-09-01.md` (82 ideas, diffed against the 2026-08-27 equipment-rework session). Run as a background job with no live Eric prompt: the forged idea's **Locked** items were taken as decided (Eric's rulings during the forge run are quoted in its memlog), its **[DRAFT]** numbers stay tagged as drafts, its **Open** items became indexed open notes, and every facilitator call made here is named as such below.

**Pillar edits (surfaced, not silent):**

- **Pillar 2** — "no install, no account, no grind" → "no install, no account required, nothing to grind for power." Accounts enter the game, but only to KEEP things; the anonymous player sails the same starter decks under the same rules. Steers gains the account posture.
- **Pillar 3** — the promise is re-anchored from "a different loadout at 0:00" to "a hull, and a deck you built — and something to DO at 0:00." Accepted consequence of gun-only spawns, recorded by the forge in Eric's words. Steers now names starter-deck tilt, the draw rule, and copies-as-stack-caps.

**Reversals / supersessions applied:**

- **The 2026-07-30 personal-deck model** (universal lines + subdeck per carried equipment + acquisition cards; soft pity; rarity as a draw weight) → **THE DECK MODEL v3**: a 40-card authored, hull-labelled deck; card model (A) — weapon ladders whose copy 1 IS the weapon, plus one-copy add-ons; copies = tier ceiling; equal per-card draw weight, no pity; legal-deck rules, frozen at queue. The acquisition card is retired.
- **Slot grammar** — "gun + two specials fitted at 0:00 + one extra slot" → slotless deck gun + three generic weapon slots empty at 0:00 + four consumable slots. Carried from the equipment forge: one fixed arc per weapon, replace-which for a fourth weapon, swap cheese is a NEVER, the slot keeps its clock. The roster formula survives as the SHAPE of each starter deck; the catalog is hull-agnostic and nothing is class-locked.
- **Heal** — the `5` key / DAMAGE CONTROL rail → a stockable consumable card (effect unchanged at 100 hp; 4–5 starter copies [DRAFT]; scarcer, never renewable). The "heals during the collapse" open question closes by construction. The 2026-07-16 law (self-heal never a ship feature) still holds.
- **Controls** — `5` is gone; `1`–`4` fire consumables with `Tab` closed (`Z`–`V` tested).
- **Accounts** — moved out of post-beta into scope before the traffic push (Eric declined a match-side-only release: "go big or go home"). Two states, no guest tier, OAuth only with minimal scopes.
- **Consumable slots** — off the backburner and into the design (four slots).

**Additions:** the opening (level zero at countdown start, countdown-only mulligan as the single never-reroll exception, weighted first draw default, pinned card as a CONFIG-gated experiment); consumables (leave the deck on pick, full-slot server refusal, two activation shapes, Eric's categories); account progression (account level → unlock token → whole line, flat [DRAFT]; placement-scaled XP, Solo vs AI discounted; the OPEN intent number as a [DRAFT] 40–60 CONFIG dial; ~100 cards' worth per hull [DRAFT]); match history (own deck to the player, every deck to Eric's metrics; enemy decks to no one); bots on authored decks with a total consumable-tactic table and two harness arms; the pinned harness bars as Success Metrics; the draw-pile HUD counter (Eric: "Yes"); several decks per hull; the Rejected / Parked lists in Out of Scope; Technical Specifications gains the account posture and the architecture flag.

**Development epics:** **E8 — The Deck** and **E9 — The Account** added to `gdd.md` (summary rows, sequence E1 → … → E7 → E8 → E9) and `epics.md` (full entries, 9 + 7 high-level stories). **Facilitator call:** the E8/E9 seam — on-the-water rework that plays anonymously on starter decks vs. what an account keeps — is a build seam, not a release seam; both ship as one unit. Eric may collapse it (GDD open note 15).

**Open items indexed (GDD Assumptions and Dependencies 8–16):** deck-size band 25–40 test; `1`–`4` vs `Z`–`V`; heal copies 4 vs 5; the matches-to-catalog number; consumable content and tier-bundle contents (Eric's catalog document); the "replace which?" player-facing flow (neither session specified it); the fate of the shipped 2026-08-23 free per-level auto-heal (the forge parks "a passive per-level heal" without naming the shipped one — flagged, not decided); the E8/E9 seam; the account store's architecture (`gds-game-architecture`; must not pre-empt Story 7-7).

**Not carried, deliberately:** the 2026-08-27 session's serial per-charge cooldowns, the single 30 s combat clock, and "storm damage breaks out-of-combat regen" — the 09-01 session lists them as untouched and the forge does not carry them as constraints; the 14 facilitator-proposed consumable cards and their numbers; the deckbuilder's "collection left, deck right" layout (Eric said only "probably a deckbuilder").

**Files touched:** `gdd.md` (frontmatter → updated 2026-09-03; Executive Summary, USPs 3–4, Background, Pillars 2–3, Core Loop steps 3/5, Win/Loss results line, Ship classes, Roster formula, Slot grammar, Upgrade economy → The Deck Model v3 + Hades-hammer + Consumables + Healing, Controls, Fitted loadouts + table header, vetoes parenthetical, Enemy Design and AI, Multiplayer Considerations, Spending + The opening + Account progression, Match length, Economy and Resources, Technical Specifications, Development Epics, Success Metrics, Out of Scope, Assumptions and Dependencies); `epics.md` (E8, E9, sequence header); `_bmad-output/gds-workflow-status.yaml` (gdd stamp).

**Finalize passes (same day):** an input-reconciliation subagent (forged idea vs. gdd.md/epics.md) and a validator subagent (checklist) ran; their findings were applied in a second commit. Corrections of record: "actively usable" means a consumable or ANY equipment's Tier I (not only a weapon's); the one-copy appearance figures are forge-MEASURED (66/82/90/97% at 8/12/15/20 picks against a 14-line deck), not drafts; only the flat unlock PRICE is [DRAFT], "any order" is not; add-on family targeting is a DIRECTION, not a lock; the Rejected/Parked lists now attribute each item to the forge or to the 2026-09-01 session, and deck codes (#64) are recorded as an unruled proposal; E1/E2/E5/E7 lines that v3 supersedes are marked in place in epics.md. **Two new open notes surfaced by validation, both Eric's to rule:** (17) v3's "light and heavy torpedoes" family example presupposes two torpedo designs against the standing no-torpedo-variety veto; (18) the legal-deck rule states no copy cap for a consumable line. Open-item density is high (notes 8–18) for an epic pair ruled to ship as one unit — E8 cannot be broken into stories until the catalog v3 document exists; flagged, not absorbed.

**Propagation note:** production epics/stories for E8–E9 are `gds-create-epics-and-stories` work; the account store is `gds-game-architecture` work; the catalog v3 contents are Eric's authored document. None of the three is produced here.
