---
title: EXPERIENCE.md — Hullcracker.io experience spine
status: draft
project: Hullcracker.io
created: 2026-07-16
updated: 2026-07-16
design_reference: ./DESIGN.md
sources:
  - _bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/ (GDD + epics)
  - briefs/brief-Hullcracker.io-2026-07-15/ (brief + addendum)
  - _bmad-output/brainstorming-session-2026-07-15.md
  - imports/DESIGN-v0.16-root.md (via ./reconcile-design-v016.md)
  - .decision-log.md (canonical decisions, this run)
---

# EXPERIENCE.md — Hullcracker.io

How the game works, surface by surface. Peer contract: [DESIGN.md](./DESIGN.md) (visual identity — every `{curly.path}` reference below resolves there). Distilled from `.decision-log.md`; **spines win on conflict with any mock, wireframe, or import.**

## Foundation

- **Platform:** desktop browser (current Chrome, Edge, Firefox, Safari), keyboard + mouse only. Mobile/touch out of scope for beta.
- **Render split:** PixiJS 8 canvas for everything tactical; DOM only for chrome (home, results, settings, How-to-Play, kill feed, toasts).
- **Performance floor (UX constraints):** 60 FPS sustained on a low-end school Chromebook in a full 20-ship match; playable from portal click in under ~10 s; feel intact up to ~150 ms latency.
- **Input fantasy:** "hands describe the fantasy" — left hand helms the ship, right hand fights it.
- **Visual identity:** DESIGN.md is the reference for every token, component visual, and hard rule cited here.

## Information Architecture

Journey spine: **home → class select → waiting (weapons-safe) → live → death reveal + results modal → re-queue.** Nothing is deeper than one layer from the water. Launch modes: **Solo** and **Solo vs AI** — home offers both minimally; mode chrome grows only when more modes exist.

| Surface | Medium | Delivers | Notes |
|---|---|---|---|
| Home (at rest) | DOM over live CIC canvas | First 5 seconds must feel **"cool"** — the acquisition hook | Wordmark, callsign field, Class Chip (one glance = what you'll sail), Color Hoist, Primary Button ("SET SAIL" / mode pick Solo · Solo vs AI), How-to-Play link, server status, settings gear |
| Class-Select Layer | DOM layer over home | "The Hades weapon pick" — a complete playstyle promise | Class Cards side by side on a horizontal scroll rail; ghost card clipped at frame edge = scales past 4; Color Hoist repeated in layer footer; locked as rendered ([home-class-picker-1.html](./.working/home-class-picker-1.html)) |
| How-to-Play page | DOM | Onboarding surface (coach marks were pared to this) | Static page; Solo-vs-AI is the live tutorial |
| Settings overlay | DOM | Accessibility + audio + bindings | Gear entry on home **and** non-pausing ESC overlay in match — opening mid-fight is the player's own risk (same philosophy as the refit window) |
| Waiting / weapons-safe | Pixi HUD text | Lobby honesty | "AWAITING CAPTAINS n/2" + "WEAPONS SAFE" tag; full live HUD already visible; weapons fire, damage suppressed |
| Countdown | Pixi | Match start | "MATCH STARTING" + big center count |
| Live HUD | Pixi + DOM feed/toasts | The hunt | Full anatomy in HUD & Diegetic UI below |
| Refit window | DOM/Pixi overlay, CTRL held | Spend banked levels | Non-blocking, game runs behind; see Component Patterns |
| Death: sinking → reveal | Pixi | "Losing into learning" | ~5 s ritardando (guns live) → omniscient reveal: map revealed, camera zooms out, you finally see everything |
| Results modal | DOM Modal | Close the loop fast | Your kills, your placement, leave option; spectate = future planned option (current follow-killer spectate superseded); death costs one click to re-queue |
| Re-queue | — | "Frantic to Play, Light to Hold" | Next match is seconds away; no account, no grind |

## Voice and Tone

Terse naval-command with a playful wink — "Silly Is Sanctioned": the tension is real, the wrapper never is.

- **Command register** for actions: "DEPLOY AS…", "SET SAIL", "FIT TO HULL", "REFIT", "WEAPONS SAFE".
- **Death register** is dry-naval: "SUNK — 9TH OF 14". Grim facts, no mockery, no exclamation points.
- **Microcopy rules:** uppercase mono for labels and system lines ({typography.label}); sentences only in descriptions and How-to-Play; numbers always tabular; no banned/required word list exists — hold the register the locked mocks speak.
- Kill feed is naval theater: named vessels, personal colors, "X SUNK BY Y" / "X LOST WITH ALL HANDS".

## Component Patterns

Behavior only; visuals in DESIGN.md · Components (same names).

- **Hotbar Slot** — four slots, vertical stack bottom-left, keys Q/E/R/F top-to-bottom mapped one-to-one: Q = universal gun, E/R = class specials, F = offer-filled slot. Two interaction classes: **weapons switch-to** (press = becomes selected; mouse aims/fires it), **abilities activate** (press = triggers immediately, no selection state). The chamfer shape marks abilities. Labels: line 1 = weapon/ability NAME (no slot-role line); quick-info line shows DAMAGE and COOLDOWN minimum; accrued boons compress into quick-info as `◆n` (spine call per log — tooltip carries the full list). Reloads tick on every slot regardless of selection; switching is tempo, not penalty.
- **Ammo Badge** — appears only on slots whose system stores >1 round; counts down on fire, up on reload.
- **Slot Tooltip** — on hover: name, interaction class, description, full accrued-boon list with effects (qualitative, Hades-style — this is where the player checks their build).
- **Banked-Level Chip** — appears at the head of the hotbar stack when ≥1 level is banked; count inside; breathing, never flashing. [ASSUMPTION] Chip is hidden at zero banked levels (log silent).
- **XP Rail** — passive XP (~1 level/min) + kill bonuses fill the rail; on level-up it wraps, the Banked-Level Chip increments, and a Toast fires.
- **Refit Card** — the spend window: **CTRL is HOLD, never toggle** — hold opens, release closes, spending the last banked level also closes. Four cards side by side (offers present **4 upgrade choices** — supersedes GDD's 3; GDD correction flagged in Open Questions); pick with 1/2/3/4 while CTRL is held. Offers are pre-rolled at earn-time and never reroll; queue pips + ghost edge show offers waiting behind the current one. Non-blocking: the battle stays visible in every gap, the hotbar dims to 38% while open.
- **Class Card / Class Chip / Color Hoist** — chip on home shows the current pick and opens the layer; cards carry silhouette, fantasy line, pip scales, loadout; pick returns to home with chip + Primary Button sub-line updated. Hoist sets the color *preference* (granted unless contended; fair random draw on contention, nearest free hue for the rest) — UI must never imply claiming or locking. First-run default class: Gunboat (unobjected proposal — Open Question until confirmed).
- **Primary Button** — SET SAIL queues immediately in the shown mode with the shown class/color preference; Enter is equivalent; sub-line always states what will happen ("DEPLOY AS GUNBOAT · SOLO"). While connecting it defers to the status line; on failure the status line reports plainly ("CONNECTION FAILED — IS THE SERVER RUNNING?" register).
- **Kill Feed** — max 5 lines, 6 s TTL, newest on top; names in personal colors, drones greyscale.
- **Toast** — transient self-events only (level banked, boon fitted); max 3, 3 s TTL; never carries enemy information.
- **Modal** — results only (plus settings overlay). Modals never stack; ESC settings overlay does not pause the game.
- **BR Chrome Bar / Listening Ring / HP Rail / Telegraph Cluster** — see State Patterns and HUD & Diegetic UI.

## State Patterns

**Hotbar Slot states** (visual grammar in DESIGN.md):

| State | Trigger | Signal |
|---|---|---|
| Ready (weapon) | Loaded, unselected | Soft phosphor outline |
| Ready (ability) | Off cooldown | Brighter phosphor + chamfer |
| Selected | Q/E/R/F press on a weapon | Amber outline + glow; key and name flip amber |
| Cooling | Fired / reloading | Icon dims, conic perimeter ring fills, seconds in quick-info |
| Activated flash | Ability triggered | One-frame phosphor pop, decays to idle |
| Empty | Offer slot unfilled | Dashed outline, "— awaiting refit —" |
| Denied | Fire attempt while invalid | 80 ms red edge pulse + icon flash — **never silence** |

**Own HP** — threshold colors + accelerating pulse, blended channels: {colors.phosphor} at ≥50%, {colors.amber} below 50%, {colors.damage-marker} below 25%, pulse rate rising continuously as HP falls. [ASSUMPTION-lite, log-flagged] The blend (both channels rather than either/or) is a facilitator resolution, unobjected-pending.

**Banked levels** — 0: no chip [ASSUMPTION above]; ≥1: breathing chip + count + "HOLD CTRL TO REFIT" cue; while refit open: queue pips show current vs waiting offers; spend latch dims cards while a spend is in flight.

**Ring phases** (legible phases are the pillar's word): three ring groups × internal minute rhythm — clear seas → next ring revealed ("where you must be is now known") → ring closes; fully closed ~12:00; final ring = 2 truesight diameters (Endgame Guarantee). BR Chrome ring readout counts down each closure and pulses amber in the final 10 s. Storm never blinds sensors; it only damages. In-storm: purple vignette pulse + "IN STORM" line.

**Match lifecycle** — waiting (weapons-safe, damage suppressed) → countdown → live → own death (sinking window ~5 s, guns live) → omniscient reveal → results modal → re-queue. Disconnect mid-match: banner + return to home; failed connection surfaces on the home status line, never a dead screen.

**Surface cold states** — home renders over a live ambient CIC canvas (never a blank page); waiting room shows the full HUD so the first match teaches itself; empty kill feed / zero kills render as absence, not placeholders.

## Interaction Primitives

| Input | Action |
|---|---|
| **Q / E / R / F** | The four hotbar slots, top-to-bottom: Q universal gun · E/R class specials · F offer slot. Weapons switch-to; abilities activate |
| **1 / 2 / 3 / 4** | Refit card pick while CTRL is held; consumables when/if that system ships (future flag) |
| **CTRL (hold)** | Refit window — hold-not-toggle; release or last-spend closes |
| **W / S** (tap) | Telegraph engine order ±1 of 9 detents (set-and-forget; hold does not repeat) |
| **A / D** (hold) | Rudder −1…+1; rudder authority reduces below steerage speed |
| **Mouse move** | Aim, constrained to the selected weapon's real firing arc |
| **Left click** | Fire one shot; denied fire always gives explicit feedback |
| **ESC** | Settings overlay (non-pausing) |
| **M** | Master mute (carry-over binding) |
| **Enter** (home) | Same as SET SAIL |

All bindings **remappable** (committed v1; settings overlay). The Q/E/R/F + CTRL-hold scheme supersedes the current 1/2/3 weapon keys and all placeholder keys in the mocks.

## Accessibility Floor

Non-negotiable floor (accepted in full):

- **Dual-coding** — no signal rides color alone; shape (chamfer, silhouettes, pip geometry), position, and text always co-carry.
- **Audio-visual redundancy** — every audio cue has a visual twin (listening-ring pips ARE the visual of the audio layer) and vice versa for combat-critical events; all audio respects mute.
- **Photosensitivity restraint** — breathing glows (≥2 s cycles), one-shot 80 ms pulses rate-limited (≥300 ms apart), no full-screen strobes; storm vignette capped at its 1.1 Hz pulse.

Committed v1 options (all four; settings overlay):

1. **Motion/shake controls** — reduce/disable screen shake and motion effects; overrides every juice rule below.
2. **Key remapping** — every binding, conflict-detected, reset-to-default.
3. **UI scale** — 90 / 100 / 125% class over the whole HUD ramp.
4. **Colorblind assist** — CVD-optimized palette swap and/or boosted blip outlines (exact palette: open design work).

## HUD & Diegetic UI

Full composite ratified "pretty good" — [hud-composite-1.html](./.working/hud-composite-1.html); squint-test steady-state load approved. Mock-scale caveat: blip/hull sizes in that mock are artifact, not decision.

| Zone | Element | Content |
|---|---|---|
| Bottom-left | XP Rail + Banked-Level Chip + Hotbar (4 slots, Composition 2 vertical stack) | Build, economy, weapons |
| Bottom-right | Own-vitals cluster: HP Rail + HDG/KTS readouts + rudder gauge + Telegraph Cluster | [ASSUMPTION] HP as a vertical rail on the cluster's **right side**, mirroring the XP rail — facilitator interpretation of Eric's redline, pending re-render confirm |
| Top-center | BR Chrome Bar | Ships afloat · your kills · up-counting match timer · ring-closing countdown. **No supply-drop reservation** — mechanic wholly parked, zero HUD footprint |
| Top-right | Kill Feed | Personal-color naval theater |
| Around own ship | Listening Ring | Compass rose; segments light toward noise, intensity ∝ loudness/closeness — the primary torpedo warning channel |
| World | Firing arcs | Drawn on aim only (carry-over behavior); deliberately absent from steady-state |

**Sensor presentation (three tiers):** truesight bubble = live hulls (LOS-clear); radar sweep = decaying blips carrying hull **outline** + heading vector (class readable at blip range); listening ring = bearing-grade pips for engines and torpedoes. Blips are personal-colored (**Variant C**, preferred default) with a **Variant P** phosphor-anonymous build flag kept for playtest swap — colored blips make contacts trackable across fog gaps; the grudge/bounty deduction game is embraced.

**Torpedoes:** heard on the ring from long distance; **seen only at truesight** — or a slightly tighter radius, tuned by how easy dodging proves once spotted. Radar never paints torpedoes.

**Enemy damage is diegetic only** — wounded ships trail smoke above the fog; **no enemy HP bars, ever.** Own damage is HUD-private (HP Rail + shake + vignette).

**Fog/world reads:** fall-of-shot splashes visible in fog (misses are information; bracket-and-walk); muzzle flash carries beyond truesight (shooting is being seen); fog banks shrink your truesight while hiding you from others'.

## Game Feel & Juice

Carried inventory (current client, kept): directional screen shake on own damage (4→16 px lerped by hit size, exponential decay); 130 ms white hull flash on struck contacts; amber hit spark vs green miss splash; crimson expanding sink ring; denied-fire 80 ms red pulse on arc + slot, rate-limited; 13-tone WebAudio set (fire ×3, damage thud, kill chime, point ping, upgrade two-note, sink alarm, countdown ticks, match start, storm growl, telegraph bells) — tones only, no sound files, mute-aware.

Added by decision:

- **Hit Call** — muffled boom + orange bloom through fog: you know you connected, not how badly.
- **Fall-of-shot** and **muzzle-flash-carries** — see HUD section; feel features that are also information.
- **Wounded smoke** — hurt ships trail it; hurt = trackable.
- **Low-HP escalation** — HP Rail threshold colors + accelerating pulse (see State Patterns); audio sting pending the RT sound map (Open Question).
- **Denied input is never silence** — every refused fire/action gets its pulse + (future) tone.
- **Death ritardando** — ~5 s sinking window, hull slows to a stop, guns stay live (go down shooting) → **omniscient reveal**: fog drops, map revealed, camera zooms out to everything → Results modal (kills, placement, leave). The reveal converts losing into learning.
- **The build must be felt** — every boon lands with audio + hull visual + on-water behavior, or promise + growth is a spreadsheet.

**Motion/shake settings override everything in this section.**

## Key Flows

Personas are constructed from the brief's audience sketches (no upstream personas exist). Journey A accepted with Beat 6 corrected; Journey B tentatively accepted (no objections). [ASSUMPTION] Beat prose below reconstructs the accepted skeletons from the log's anchors; wording is not Eric-authored.

### Journey A — "Marco" (13, school Chromebook, brand-new)

1. Portal click → home in under 10 s over the live CIC canvas. It looks *cool*. He types a callsign, ignores every option, and hits SET SAIL as the default Gunboat, Solo.
2. Weapons-safe waiting room: the full HUD is already live; he wiggles W/S and A/D and learns the telegraph is set-and-forget before the countdown ends.
3. First minutes: the sweep paints a blip — an outline with a heading vector. He chases it; truesight resolves a greyscale drone.
4. He clicks in-arc, the Hit Call booms, the drone sinks; the XP Rail wraps and the Banked-Level Chip starts breathing: "HOLD CTRL TO REFIT."
5. He holds CTRL — four cards over the still-running battle; he presses 2; the boon lands on its slot with a visible change. Release, back to the hunt.
6. **(corrected beat)** Bright pips have been lighting one bearing of his Listening Ring for a long approach — he ignores them. The torpedo becomes visible only at truesight, wake astern, inbound. Too late to helm out.
7. Sinking ritardando: five seconds, listing, guns live — he fires his last shells at his killer's smoke.
8. **Climax:** the omniscient reveal — fog gone, whole map, every hull. He sees the torpedo boat that stalked him and the pips he ignored suddenly make sense. "SUNK — 9TH OF 14," two kills, one click, re-queued. **The lesson is "listen."**

Failure path *is* the flow: death is the teaching surface, and it costs one click.

### Journey B — "Dee" (WoWS refugee, Mine Layer)

1. Home: she reads the Class Cards — real loadout differences, no grind wall — picks Mine Layer, hoists Rose as her color preference.
2. Early game: radar discipline — she hunts by blip outline, keeps islands between herself and a Battleship's paint, and seeds a mine seam across a channel mouth.
3. A Gunboat finds her; she drops the decoy buoy and runs shallow, watching his lime blip on her own sweep — Variant C colors mean she *knows* it's the same hunter across fog gaps.
4. Ring reveal beat: the next ring is known — the hunt must funnel through her channel. She re-seeds the seam on the funnel line and waits, engines at STOP (quiet on his ring).
5. He takes the bait: pips flare on her ring as he closes; his blip crosses her seam line.
6. **Climax:** proximity fuse — Hit Call boom, kill feed in their two colors: "SALT SHAKER SUNK BY DEE'S KETTLE." The trap she authored paid off — the trapper fantasy delivered.
7. Endgame: final ring two truesight diameters, everything in view; she places 3rd, results modal, re-queues — 12 minutes, zero grind.

Failure path: if the Gunboat spots the seam (mines visible ~truesight), the trap converts to a chase — her smoke/decoy specials are the escape line; being killed routes her through the same reveal-and-requeue as Marco.

*(Third journey — party/friend-group session — remains open, non-blocking.)*

## Inspiration & Anti-patterns

| Reference | Take | Leave |
|---|---|---|
| League of Legends ability hotbar | Icon-in-square slot grammar, cooldown-in-icon | Panel chrome |
| Hades | Boon-on-slot display; the lobby pick as a complete weapon/playstyle promise; "the boon you picked never lies to you" | — |
| colonist.io | Color-preference precedent (pick your hue) | Its paid-color model "feels kinda bad" — premium colors parked |
| World of Warships | Class fantasy, gunnery feel, naval tension | Grind; damage minutiae; carriers/subs (being attacked by something you can't fight back against violates the escape fantasy); class-invalidating spotting |
| Battleship (board game) | Hidden information, calling shots into the dark | Turns, grids |
| Risk of Rain | Stacking upgrades with named, felt thresholds — power you can SEE | — |
| surviv.io / OpenFront.io | Top-down BR structure, browser distribution, clip-able reveal moments | Loot-scavenging spine |
| Maelstrom (2018) | — | **Pacing anti-pattern:** validated the fantasy and died anyway; slow oceans kill retention |

Rejected upstream, do not reintroduce: "The helm is the star" guardrail; hex-era "not playful" mood; per-client random colors (screens would disagree).

## Responsive & Platform

- **Desktop-only scope.** No touch, no gamepad, no Steam intent.
- **Floor viewport:** 1366×768 (the school-Chromebook class [ASSUMPTION — no source names the resolution; derived from the Chromebook floor]). HUD authored at 1920×1080 reference with the ~1.6× post-playtest register; corner anchors hold at every size.
- **UI scale** 90/100/125% multiplies the HUD ramp; corner anatomy never rearranges (muscle memory is the contract).
- **DOM chrome** (home, results, settings, How-to-Play) centers at {spacing.chrome-max-width} (1100px).
- Canvas fills the window; fog composite rebakes on resize.

## Open Questions

1. **Heal-as-upgrade** — GDD-owned. Eric leans "some healing must exist"; conflicts GDD "no heal option in the economy." If kept: heal card appears within the 4-choice offer. Parked for GDD update.
2. **4-choice offer = GDD correction needed** — UX designs for 4 cards (decided, supersedes GDD's "3 upgrades from 3 distinct categories"); GDD needs a correction note.
3. **Supply drops** — mechanic wholly parked; **no HUD reservation** (reserved ghost removed).
4. **Premium cosmetic colors** — parked, ambivalent (colonist.io "feels kinda bad"); monetization = AdSense only for now.
5. **Reference sites** (buddyboardgames / papergames / openfront) — v0.16 carry-over never revisited; new references are LoL/Hades.
6. **Island colors** — `{colors.island-fill}`/`{colors.island-stroke}` carried provisionally; gridless island rendering never ratified.
7. **Storm edge treatment** — ring-edge rendering in RT (fill/stroke/pulse) undecided; only the countdown HUD is decided.
8. **Sound-event map** — RT sound design (listening-ring audio grammar, low-HP sting, hit/miss/sunk set) not yet designed; audio is a sensor, so this is game design too.
9. **Kill-streak spectacle** — center-screen celebration beat (v0.16 idea) never decided; fits "Silly Is Sanctioned."
10. **`--player-color` CSS-var technique** — DOM-chrome implementation detail for personal colors, unowned.
11. **Readiness-pressure indicator** — visible social pressure in the waiting room (v0.16 "X/8 locked in" psychology), undecided.
12. **Third journey** — party/friend-group session protagonist, open, non-blocking.
13. **Class-card pip values** — SPEED/TOUGHNESS/TURNING pips are placeholders on every card.
14. **Boon copy** — all boon names/categories in mocks and this spec are placeholder, not canon.
15. **First-run default class = Gunboat** — unobjected proposal; confirm before ship.
