# GDD Extraction — UX-Relevant Digest (Hullcracker.io, 2026-07-16)

Sources: `gdd.md`, `epics.md`, `decision-log.md` in `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/`. All quotes verbatim; section names cited in parentheses.

---

## 1. Design Pillars and Guardrails (verbatim names — downstream must mirror)

Four pillars (Core Gameplay > Game Pillars):

1. **"Hunting with Imperfect Senses"** — "Information is the primary resource." Explicitly steers "HUD/UI" and "sensor and weapon design (everything either feeds or reads the information game)". "A feature that neither produces nor consumes imperfect information must justify itself."
2. **"Frantic to Play, Light to Hold"** — "no install, no account, no grind, one complete match inside fifteen minutes." Steers "onboarding (playable within seconds of page load), low-end hardware performance as a distribution feature."
3. **"Promise + Growth"** — "The lobby pick is a genuine promise: a different loadout at 0:00, not a skin over sameness." XP levels grow it into "a build that is *yours* by the endgame."
4. **"The Ocean Keeps Getting Smaller"** — "The storm closes in legible phases." The "Endgame Guarantee — a final ring two truesight diameters across." "No match ends in mutual avoidance."

Pillar guardrails (verbatim, "carried from the brief"):

1. **"Information noise must never bury the hunt"** — sensor features may not drown the chase-and-shoot game in indicators.
2. **"When deduction stops paying, fix it on the sensing side"** — never with stat band-aids.

Emotional contract (Executive Summary): **"Frantic to Play, Light to Hold"**. North star: "midway between Battleship and World of Warships."

Decision-log note: guardrail "The helm is the star" was REJECTED by Eric ("Yes, it's a boat. It drives like a boat.") — do not reintroduce it.

## 2. Player Journeys / Personas

GDD is silent on named personas or player journeys. Closest material (Target Audience, Executive Summary):
- **Primary:** "browser multiplayer players (the agar.io / openfront.io demographic), 5–15 minute sessions, allergic to installs, accounts, and grind. Design compass is 16–35; the ads-first model means the proven portal audience (10–15, school Chromebooks) is welcome."
- **Secondary:** "World of Warships refugees — players who love the gunnery feel but resent the grind, carriers, submarines, and spotting controversies."
- Core fantasy: "You are a lone captain hunting — and being hunted — with imperfect senses, on an ocean that keeps getting smaller."

No journey names exist to reuse; EXPERIENCE.md must define them fresh (mark as new, not GDD-sourced).

## 3. Platform / Form Factor / Input

- "Target Platform(s): Desktop browser (keyboard + mouse)" (frontmatter + header). Browsers: "current Chrome, Edge, Firefox, Safari" (Platform-Specific Details).
- "Mobile/touch: out of scope for beta"; "Match completes with keyboard + mouse only" (Controls and Input).
- Design intent (Controls and Input): **"hands describe the fantasy" — left hand helms the ship, right hand fights it.**
- Keyboard: "telegraph detents (set-and-forget engine orders) + rudder; weapon-slot selection (basic / special / other); an in-match spend window for upgrade offers and heal." NOTE: "Specific key bindings are provisional — current bindings (e.g. CTRL-chord spend window) are reference only and planned to change." (E2 owns "New keyboard controls" rework; slot-selection keys coordinate with E1's grammar.)
- Mouse: "aim within the selected weapon's real firing arc; click to fire. Denied fire (out of arc, no ammo, reloading) gives explicit feedback rather than silence."
- Performance as UX constraint (Technical Specifications): "60 FPS sustained on a low-end school Chromebook in a full 20-ship match"; "Playable from portal click in under ~10 seconds"; feel intact "up to ~150 ms" latency.

## 4. Mechanics/Systems Needing UI Surfaces (with GDD perception/control statements)

**Sensors — three tiers on every hull (Primary Mechanics; decision log "Universal listening ring"):**
- **Truesight bubble** — "live, LOS-clear contacts; reference 220 u."
- **Rotating radar sweep** — "reference 650 u, 4 s revolution... paints decaying phosphor blips when the beam crosses a LOS-clear ship."
- **Hull microphones / listening ring** — "a passive listening ring that gives bearing-grade audio detection of nearby noise (engines, torpedoes in the water)." E6 specifies a "Listening ring HUD element (hull microphones): directional pips for engine noise, torpedoes in the water."
- **Class-legible radar returns:** "A blip carries the ship's **outline** (a battleship paints bigger — class readable at blip range) and its **speed and heading**, so you can see where it's going, not just where it was."
- LOS rule: "the observer→point segment must clear all island circles." "Only ships paint on radar"; "Torpedoes are never painted by radar; hydrophones (the listening ring) are the torpedo warning."

**Ship classes (Primary Mechanics; Weapon Systems) — four at beta:** Torpedo Boat, Battleship, Mine Layer, Gunboat. Each = "hull envelope" + "fitted loadout." Lobby pick = class ("the Hades weapon pick: a complete playstyle and power fantasy").

**Slot grammar (universal):** 1) "The gun — universal: every class carries the same standard gun"; 2) "Two special abilities... at least one of the two is a weapon"; 3) "One extra slot, filled mid-match through the upgrade economy." Loadout table (Weapon Systems): Torpedo Boat = torpedo tubes + smoke screen (#26); Battleship = long-range cannon + star shells (#12); Mine Layer = proximity-fused mines (#81) + decoy buoy (#69); Gunboat = armor-piercing gun (form open) + speed boost. Weapon-slot selection = "basic / special / other". "Every fitted system has its own ammo pool and reload timer, and every reload ticks every tick... switching weapons is tempo, not penalty" — implies per-weapon ammo/reload HUD.

**Movement/helm:** "Set-and-forget engine orders (9-detent telegraph) plus rudder"; "rudder authority reduces below steerage speed."

**Aiming/firing:** "Top-down mouse aim... constrained to the selected weapon's firing arc; click to fire." "No dispersion... Projectiles, never hitscan — leading the target is the game." "No damage falloff." Precision bonus (guns only, status open): bonus damage for hitting "at the clicked spot." Arcs: "geometry reopened... TBD alongside the new armory's numbers."

**Upgrade economy / XP (Primary Mechanics; Player Progression):** passive tick "~1 level per minute" + kill bonuses (opponent = 1 level; PvE ¼/⅓/½ by tier). "Each level banks an upgrade point carrying a pre-rolled offer of 3 upgrades from 3 distinct categories (rolled at earn-time, never rerolls)." **"There is no heal option in the economy."** Boons are "Hades-style: qualitative, build-defining... not stat multipliers" — old 14 stat upgrades are dead. Standing requirement: **"the build must be felt" — audio, hull visuals, on-water behavior — "or promise + growth is a spreadsheet"** (implies banked-points indicator, offer/spend window UI, felt-build presentation).

**The storm / Ring (Primary Mechanics; Difficulty Curve; E3):** "damage-only zone shrinks the ocean in legible phases — three ring groups of ~4 minutes each with an internal minute rhythm... totaling ~12:00." Minute rhythm: (1) clear seas, (2) supply drops [backburnered — reserved slot], (3) "next ring revealed. Planning pressure: where you must be is now known," (4) ring closes. "Storm never blinds sensors; it only damages (reference 4 hp/s)." Endgame Guarantee: final ring diameter = "2 standard truesight diameters." E3 story: "Ring/zone HUD legibility (phases must be readable — 'legible phases' is the pillar's word)."

**Weapon feel / information texture (Weapon Systems; E6):** "fall-of-shot spotting (#21 — your splashes are visible in fog, so misses become information and you can bracket-and-walk fire)"; "the Hit Call (#19 — a muffled boom and orange bloom confirm you connected without revealing how badly)"; "muzzle flash carries (#34 — firing lights the fog beyond truesight; shooting is being seen)." Also E6: "Wounded smoke (#20): damaged ships trail smoke above the fog"; "Foghorn emote (#74): one button; audible on hull mics — a honk is a bearing"; "The Bounty (#47): kill leader periodically blooms on everyone's radar and is worth extra XP."

**World features (Arena and Level Design; E4):** Fog banks — "inside a fog bank your truesight shrinks, but you vanish from others' truesight (radar may still paint you)." Whirlpools — rare, hidden hemisphere, "carried along its circular current... the spin rotates your heading... exit from any side." Islands — "block line of sight... block shells and torpedoes, and impose collision."

**PvE drone fleets (Enemy Design and AI):** roving, three tiers ("common small / uncommon medium / rare large"), self-defense only, XP source. "Finding them is part of the sensor game." GDD is silent on whether tiers are visually distinguished beyond size/HP.

**Match lifecycle (Win/Loss; Multiplayer Considerations):** lobby min 2 human captains "fill-or-timer," cap 20; "pure quick play." Modes: **Solo** and **Solo vs Bots** — E5 story 4: "Mode selection UX (menu)." Win = "last match participant afloat."

**Death/sinking/spectate (Win/Loss Conditions):** "Sinking — go down shooting. Reaching zero HP doesn't remove you immediately: you get a short sinking window (~5 s, tunable) in which the hull gradually slows to a stop — a ritardando, not a cut — and your guns stay live." Then "the omniscient reveal — dying means finally seeing everything — then spectate or instant re-queue. Death is cheap by design (Pillar 2): the next match is seconds away."

## 5. Explicit UI/UX/HUD/Menu, Art-Direction, Audio Statements

**Art Style (Art and Audio Direction):**
- "**DESIGN.md is the design source of truth**; this section summarizes design *intent*."
- Aesthetic: **"CIC Tactical Display, Evolved" — "black void ocean, silver-white radar-display linework, phosphor blips, a rotating sweep. The screen reads as a combat information center that happens to be the game itself."**
- "**Restrained functional color** — each color has exactly one job (tactical green = yours, amber = action, dimensional purple = storm). Dark is the identity, not a theme option."
- "**Readability is tactical** — everything on the water is information (Pillar 1), so render clarity is a gameplay feature: blip decay, wounded smoke, muzzle flashes must be readable at a glance on low-end displays."
- Rendering: "procedural vector-style linework (hulls and effects drawn in code) — no heavy texture or model pipeline" (Asset Requirements).

**Audio (Audio and Music):**
- "**WebAudio tones only, no sound files** — CIC-authentic synthesized tones (pings, warbles, rumbles), growing toward *mood, not orchestration*. All audio respects the mute toggle."
- "**Audio is a sensor (Pillar 1):** the listening ring is an audio-first mechanic — engine noise, torpedoes in the water, foghorns, and active pings are heard with bearing. Sound design and game design are the same discipline here."
- Tone: "**naval tension with a playful wrapper** — the 'Silly Is Sanctioned' contract: foghorn emotes, named vessels turning the kill feed into naval theater, medals. The tension is real; the wrapper never is." (Decision log: this newer tone SUPERSEDES DESIGN.md's hex-era "not playful — focused".)

**Onboarding:** E7 includes "How-to-Play page (the onboarding surface — coach marks were pared to this)." Pillar 2 requires "playable within seconds of page load."

**Denied-input feedback:** appears twice — denied fire "gives explicit feedback rather than silence" (Controls; Aiming) and E2 story 5 "Keyboard layout rework + denied-input feedback."

**Kill feed:** "named vessels turning the kill feed into naval theater" (Audio and Music tone).

## 6. [NOTE FOR ...] Tags, Assumptions, Open Questions

No tags labeled "[NOTE FOR UX]" exist. All [NOTE FOR DESIGNER] tags (Assumptions and Dependencies index):
1. Gunboat AP-gun form: separate higher-cooldown gun vs. activatable damage/RoF buff. (Weapon Systems)
2. Per-weapon firing-arc geometry TBD alongside the new armory's numbers. (Aiming and Combat)
3. Precision bonus: adopt or drop while tuning the standard gun; whether gun-type specials qualify. (Aiming and Combat)
4. **"DESIGN.md still documents the hex-grid '2.0' era in places (cell states, planning/resolution choreography); it needs an update pass for the real-time game. The aesthetic direction carries forward unchanged."** (Art Style; also E7 story 5 "DESIGN.md refresh") — the most UX-load-bearing note.
5. Hunter class real name — needed only off-backburner.
6. Minutes-1–3 pacing ("Quiet Dread" — protect or fix) is a playtest call.

[ASSUMPTION]: AI combatant bots driven through the same input pipeline as every ship. (Enemy Design and AI)

Other UX-relevant opens: key bindings "provisional... planned to change"; off-class offer weighting = open tuning; aim reconciliation under latency delegated to architecture phase ("feel intact at ~150 ms" is the design requirement); positioning slogan open (marketing).

Standing caveat (Primary Mechanics): "Numbers in this document are design targets or current-prototype reference values, explicitly tunable — the prototype's CONFIG values were playtest handwaves and carry no authority."

## 7. Ship-Class Visual Differentiation

- Hull envelopes differentiate physically: "Each class is a hull envelope (size, speed, toughness, turning)... Hull envelopes differentiate feel; loadouts differentiate playstyle" (Primary Mechanics).
- Radar-range legibility: blips carry "the ship's outline (a battleship paints bigger — class readable at blip range)" plus speed/heading (Primary Mechanics; E6 "Class-legible radar returns").
- Felt-build requirement extends per-boon: "audio, hull visuals, on-water behavior" per boon (Player Progression; E2 story 4).
- Power fantasies to express (class table): Torpedo Boat "fast, fragile, the needle-threader"; Battleship "massive, heavily armored, long-range artillery"; Mine Layer "the trapper"; Gunboat "small, fast, lightly armored — speedy boy with some guns."
- GDD is silent on specific hull silhouettes, colors, or iconography per class beyond size/outline — that design work falls to DESIGN.md/EXPERIENCE.md within the procedural-linework aesthetic.

## 8. Epic List — UI/UX-Heavy Scope

Sequence: **E1 → E2 → E3 → E6 → E4 → E5 → E7.**

| Epic | UX weight | UX-relevant scope |
|---|---|---|
| E1 The Armory | Medium | Lobby class pick (4 classes feel different at 0:00); per-weapon arcs; weapon-slot grammar the HUD must express |
| E2 The New Economy (+ New Controls) | **Heavy** | XP/level display, banked points, offer/spend window (no heal), felt-build presentation, **full keyboard-controls rework + denied-input feedback** |
| E3 The Ring | **Heavy** | "Ring/zone HUD legibility (phases must be readable)"; ring reveal/closure events + HUD |
| E6 Information Texture | **Heavy** | Listening-ring HUD pips, hit call, fall-of-shot, muzzle flash, wounded smoke, foghorn, Bounty radar bloom, class-legible blips. Guardrail: "this epic is where information-overload risk lives... every feature here must pass a readability check on a busy screen" |
| E4 The Living Ocean | Medium | Fog-bank perception rendering; whirlpool feel; sinking window (ritardando → reveal/spectate) |
| E5 Honest Lobbies & Modes | Medium | "Mode selection UX (menu)"; lobby fill-or-timer states |
| E7 Portal Launch Readiness | Medium-Heavy | How-to-Play page; **DESIGN.md refresh for the RT era**; Chromebook 60 FPS + <10 s load as UX constraints |

## Gaps (GDD is silent on)

- Named personas or player-journey names (none defined).
- Specific key bindings (explicitly provisional), HUD layout/anatomy, menu flows beyond "mode selection UX" and "How-to-Play page."
- Accessibility (no colorblind/remapping/subtitle statements — only mute toggle and low-end readability).
- Spectate camera behavior details beyond "omniscient reveal... then spectate or instant re-queue."
- Results-screen content, kill-feed format details (beyond "named vessels... naval theater"), medals specifics.
- PvE fleet tier visual language beyond size/HP.
- Damage/HP presentation to the player (own-HP HUD not specified; "damage is victim-private" is prototype-era CLAUDE.md context, not restated in GDD).
