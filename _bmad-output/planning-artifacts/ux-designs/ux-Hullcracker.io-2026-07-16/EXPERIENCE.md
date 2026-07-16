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
  - validation-report.md (reviewer gate, applied 2026-07-16)
---

# EXPERIENCE.md — Hullcracker.io

How the game works, surface by surface. Peer contract: [DESIGN.md](./DESIGN.md) (visual identity — every `{curly.path}` reference below resolves there). Distilled from `.decision-log.md`; **spines win on conflict with any mock, wireframe, or import.** Reviewer-gate findings ([validation-report.md](./validation-report.md)) applied 2026-07-16.

## Foundation

- **Platform:** desktop browser (current Chrome, Edge, Firefox, Safari), keyboard + mouse only. Mobile/touch out of scope for beta.
- **Render split:** PixiJS 8 canvas for everything tactical; DOM only for chrome (home, results, settings, How-to-Play, kill feed, toasts).
- **Performance floor (UX constraints):** 60 FPS sustained on a low-end school Chromebook in a full 20-ship match; playable from portal click in under ~10 s; feel intact up to ~150 ms latency.
- **Input fantasy:** "hands describe the fantasy" — left hand helms the ship, right hand fights it.
- **Visual identity:** DESIGN.md is the reference for every token, component visual, and hard rule cited here.

## Information Architecture

Journey spine: **home → class select → waiting (weapons-safe) → live → death reveal + results modal → re-queue.** Nothing is deeper than one layer from the water. Launch modes: **Solo** and **Solo vs AI** — home offers both minimally; mode chrome grows only when more modes exist. (Naming: GDD says "Solo vs Bots" — the rename to "Solo vs AI" is part of the GDD-correction flag, Open Questions.)

| Surface | Medium | Delivers | Notes |
|---|---|---|---|
| Home (at rest) | DOM over live CIC canvas | First 5 seconds must feel **"cool"** — the acquisition hook | Wordmark, callsign field (14-char cap), Class Chip (one glance = what you'll sail), Color Hoist, Primary Button ("SET SAIL" / mode pick Solo · Solo vs AI), How-to-Play link, server status, settings gear |
| Class-Select Layer | DOM layer over home | "The Hades weapon pick" — a complete playstyle promise | Class Cards side by side on a horizontal scroll rail; ghost card clipped at frame edge = scales past 4; Color Hoist repeated in layer footer; locked as rendered ([home-class-picker-1.html](./.working/home-class-picker-1.html)). Keys: 1–4 / arrows highlight, Enter picks, ESC closes without change |
| How-to-Play page | DOM | Onboarding surface (coach marks were pared to this) | Static page (standard page chrome; ESC/back returns home); Solo-vs-AI is the live tutorial. Hosts the boon glossary |
| Settings overlay | DOM | Accessibility + audio + bindings reference | Gear entry on home **and** non-pausing ESC overlay in match — opening mid-fight is the player's own risk (same philosophy as the refit window). Doubles as the in-match binding reference (view-only — bindings are fixed for v1; remapping deferred post-beta, Open Questions) |
| Waiting / weapons-safe | Pixi HUD text | Lobby honesty | "AWAITING CAPTAINS n/2" + "WEAPONS SAFE" tag; full live HUD already visible; weapons fire, damage suppressed |
| Countdown | Pixi | Match start | "MATCH STARTING" + big center count |
| Live HUD | Pixi + DOM feed/toasts | The hunt | Full anatomy in HUD & Diegetic UI below |
| Refit window | DOM/Pixi overlay, SPACE held | Spend banked levels | Non-blocking, game runs behind; see Component Patterns |
| Death: sinking → reveal | Pixi | "Losing into learning" | ~5 s ritardando (guns live) → omniscient reveal: map revealed, camera zooms out, you finally see everything |
| Results modal | DOM Modal | Close the loop fast | Your kills, your placement, leave option; accrued boons + last offer reviewable here; spectate = future planned option (current follow-killer spectate superseded); death costs one click (or Enter) to re-queue |
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
- **Banked-Level Chip** — appears at the head of the hotbar stack when ≥1 level is banked; count inside; breathing, never flashing; breathing decays to a static glow after ~10s unspent, re-arming on a new bank or a Space touch. [ASSUMPTION] Chip is hidden at zero banked levels (log silent).
- **XP Rail** — passive XP (~1 level/min) + kill bonuses fill the rail; on level-up it wraps, the Banked-Level Chip increments, and a Toast fires.
- **Refit Card** — the spend window: **SPACE is HOLD, never toggle** (absolute — no toggle option, triage 2026-07-16): hold opens, release dismisses, spending the last banked level also closes. Four cards side by side (offers present **4 upgrade choices** — supersedes GDD's 3; GDD correction flagged in Open Questions); pick with 1/2/3/4 while Space is held. Offers are pre-rolled at earn-time and **never reroll — and banked offers never expire** (explicit guarantee: peek, release, fight, re-open; the time pressure is self-managed). Queue pips + ghost edge show offers waiting behind the current one. Non-blocking: the battle stays visible in every gap and the hotbar dims to 38% while open — but **while Space is held, Q/E/R/F are suspended** ("release Space to get back to the battle"); the helm (W/S/A/D) stays live. Refit trades attention for build progress — deliberate. Row placement never occludes the listening ring or own hull (DESIGN · Refit Card).
- **Class Card / Class Chip / Color Hoist** — chip on home shows the current pick and opens the layer; cards carry silhouette, fantasy line, pip scales, loadout; pick returns to home with chip + Primary Button sub-line updated. Hoist sets the color *preference* (granted unless contended; fair random draw on contention, nearest free hue for the rest) — UI must never imply claiming or locking. First-run default class: Gunboat (unobjected proposal — Open Question until confirmed).
- **Primary Button** — SET SAIL queues immediately in the shown mode with the shown class/color preference; Enter is equivalent; sub-line always states what will happen ("DEPLOY AS GUNBOAT · SOLO"). While connecting it defers to the status line; on failure the status line reports plainly ("CONNECTION FAILED — IS THE SERVER RUNNING?" register).
- **Kill Feed** — max 5 lines, 6 s TTL, newest on top; names in personal colors (text-safe variants), drones greyscale; long names mid-ellipsize.
- **Toast** — transient self-events only (level banked, boon fitted, hoist fallback); max 3, 3 s TTL; never carries enemy information.
- **Modal** — results only (plus settings overlay). Modals never stack; ESC settings overlay does not pause the game. Results keys: Enter = re-queue (primary), ESC = leave to port.
- **Bounty Bloom** — GDD E6 #47: the current kill leader periodically blooms on **every** player's radar at true position (cadence per GDD) — a sanctioned fog-of-war exception, the one radar paint not born of your own sweep. Feed announces the leader ("BOUNTY: <NAME>" register) when the bounty activates; the bloom has an audio twin in the sound map (Open Questions). Visual: DESIGN · Bounty Bloom.
- **BR Chrome Bar / Listening Ring / HP Rail / Telegraph Cluster** — see State Patterns and HUD & Diegetic UI.

## State Patterns

**Hotbar Slot states** (visual grammar in DESIGN.md):

| State | Trigger | Signal |
|---|---|---|
| Ready (weapon) | Loaded, unselected | Soft phosphor outline |
| Ready (ability) | Off cooldown | Brighter phosphor + chamfer |
| Selected | Q/E/R/F press on a weapon | Amber outline + glow; inset wash + filled key chip (hue secondary) |
| Cooling | Fired / reloading | Icon dims, conic perimeter ring fills, seconds in quick-info |
| Activated flash | Ability triggered | ≤80 ms phosphor pop, decays to idle |
| Empty | Offer slot unfilled | Dashed outline, "— awaiting refit —" |
| Denied | Fire **or activation** attempt while invalid (cooling, no ammo, empty slot) | 80 ms red edge pulse + icon flash — **never silence**. (Weapons-safe waiting room is not a denied state: weapons genuinely fire there, damage suppressed) |

**Attention priority** — arbitration across the HUD's animated channels (one hierarchy; photosensitivity caps still bind every tier). Pips obey the intensity ruling: urgency = intensity, never source type.

| Tier | Channels | Rule |
|---|---|---|
| 1 — Threat | Listening-ring pip surges (brightness ∝ loudness/closeness), denied pulses, HP Rail pulse <25% | Always animate (rate-capped by the photosensitivity floor); own the player's eye |
| 2 — Match state | Ring-countdown final-10s amber pulse (1 Hz), in-storm vignette (1.1 Hz) | Animate unless a Tier 1 channel is active, then hold steady at the lit keyframe |
| 3 — Economy | Bank-chip breathing, toasts, XP-rail wrap | Freeze at the dim keyframe while any higher tier is active (a static chip still reads "banked"); chip breathing decays to static after ~10s regardless |

Corollary (amber overload): only the highest-tier active amber channel pulses; every other amber element holds steady — amber keeps meaning "look here" at the climax.

**Own HP** — threshold colors + accelerating pulse, blended channels: {colors.phosphor} at ≥50%, {colors.amber} below 50%, {colors.damage-marker} below 25%; pulse rate rises with damage **and hard-caps at 1.1 Hz** (the storm vignette's ratified exception ceiling; opacity-breathing, never strobing — the cap resolves the acceleration-vs-floor contradiction). [ASSUMPTION-lite, log-flagged] The blend (both channels rather than either/or) is a facilitator resolution, unobjected-pending.

**Banked levels** — 0: no chip [ASSUMPTION above]; ≥1: breathing chip + count + "HOLD SPACE TO REFIT" cue; while refit open: queue pips show current vs waiting offers; spend latch dims cards while a spend is in flight. **Spend failure:** if the server rejects or times out a spend, the latch releases with the denied pulse register on that card; the level stays banked.

**Color grant feedback** — a player whose preference was contended learns it in the waiting room: own nameplate flies the granted hue and a Toast reports the fallback ("HOIST CONTESTED — FLYING SKY" register). [PROPOSAL — surface choice]

**Ring phases** (legible phases are the pillar's word): three ring groups × internal minute rhythm — clear seas → next ring revealed ("where you must be is now known") → ring closes; fully closed ~12:00; final ring = 2 truesight diameters (Endgame Guarantee). BR Chrome ring readout counts down each closure and pulses amber at 1 Hz in the final 10 s. Storm never blinds sensors; it only damages. In-storm: purple vignette pulse + "IN STORM" line.

**Match lifecycle** — waiting (weapons-safe, damage suppressed) → countdown → live → own death (sinking window ~5 s, guns live) → omniscient reveal → results modal → re-queue. **Sinking window inputs:** combat inputs stay live; helm inputs are accepted but decay (the hull slows to a stop regardless). **Omniscient reveal inputs:** none except Enter/click = proceed to results. Disconnect mid-match: banner + return to home (standard page chrome); failed connection surfaces on the home status line, never a dead screen.

**Surface cold states** — home renders over a live ambient CIC canvas (never a blank page); waiting room shows the full HUD so the first match teaches itself; empty kill feed / zero kills render as absence, not placeholders.

## Interaction Primitives

| Input | Action |
|---|---|
| **Q / E / R / F** | The four hotbar slots, top-to-bottom: Q universal gun · E/R class specials · F offer slot. Weapons switch-to; abilities activate. **Suspended while Space is held** — release Space to fight |
| **1 / 2 / 3 / 4** | Refit card pick while SPACE is held; consumables when/if that system ships (future flag). A number key's meaning is evaluated at its own keydown against Space's state at that keydown; for ~150–200 ms after Space release, number keys still resolve as refit-or-**nothing**, never as a consumable (misfiring nothing beats misfiring the wrong spend). Spending with the window closed is a misfire by definition — the current-code closed-window spend behavior dies here |
| **SPACE (hold)** | Refit window — hold-not-toggle (absolute; no toggle option); release or last-spend dismisses. While held: Q/E/R/F suspended, helm stays live |
| **W / S** (tap) | Telegraph engine order ±1 of 9 detents (set-and-forget; hold does not repeat) |
| **A / D** (hold) | Rudder −1…+1; rudder authority reduces below steerage speed |
| **Z / X** | Camera zoom out / in (provisional bindings) |
| **Mouse wheel** | Camera zoom (provisional; zoom range/limits = open tuning, Open Questions). Fog is server-authoritative — zoom can never reveal what sight or sweep hasn't legitimately painted |
| **Mouse move** | Aim, constrained to the selected weapon's real firing arc |
| **Left click** | Fire one shot; denied fire always gives explicit feedback |
| **ESC** | Closes the topmost open surface; if none is open (home or live), opens the settings overlay (non-pausing). The refit window is Space-governed — it closes on Space release regardless of ESC |
| **Enter** | Home: same as SET SAIL. Results modal: re-queue. Class layer: picks the highlighted card. Reveal: proceed to results |
| **M** | Master mute (carry-over binding) |
| **Foghorn emote** | GDD E6 #74 — one-button broadcast honk; **key unbound (Open Questions)**. A honk is a bearing: on every hull in earshot, the listening ring lights an arc sweep along the honk's bearing (intensity grammar — deliberately loud); no feed line (it's an emote) |

**Fixed bindings (v1).** Bindings are fixed for v1 — key remapping is **deferred post-beta** (no accounts yet, so remaps would mean heavy localStorage; Open Questions). No hold/toggle option for the refit modifier either (triage 2026-07-16). The settings overlay lists all bindings as a view-only reference — the scheme's only in-match self-documentation. The Q/E/R/F + Space-hold scheme supersedes the current 1/2/3 weapon keys, the earlier CTRL modifier, and all placeholder keys in the mocks. All key glyphs share one visual family (DESIGN · Components).

**Input capture & browser hygiene.** With CTRL out of the scheme, browser-shortcut interception reduces to standard hygiene: every bound key is `preventDefault`ed at a single keydown chokepoint — **including Space (page scroll)** — and `contextmenu` is suppressed on the canvas (right-click is one misclick from left-click-to-fire). DOM overlay or text input with focus = keyboard suppressed from the sim; the sim never pauses (typing "wasd" in the callsign field must not steer the ship). `P` (prediction debug): dev-build only, stripped from production.

## Accessibility Floor

Non-negotiable floor (post-triage scope, 2026-07-16):

- **Dual-coding for class / threat / state meaning** — shape (chamfer, class silhouettes, drone chevron, pip geometry), position, and text co-carry every such signal. **Informed waiver:** individual combatant *identity* is color-first (Variant C hue) — Eric accepts that trade against the floor; drone-vs-combatant, class, threat, and state still read without color (the drone chevron is a fifth silhouette no player class wears).
- **Audio-visual redundancy** — every audio cue has a visual twin (listening-ring pips ARE the visual of the audio layer) and vice versa for combat-critical events; all audio respects mute. **Binding rule:** the sound-map deliverable (Open Questions) MUST include a two-column audio-event ↔ visual-twin table; no audio event ships without its row. The 13 existing tones all pass the walk and are the template; the deferred denied tone is tracked there.
- **Photosensitivity restraint** — breathing glows (≥2 s cycles), one-shot 80 ms pulses rate-limited (≥300 ms apart), no full-screen strobes; storm vignette capped at its 1.1 Hz pulse; HP pulse capped at 1.1 Hz; final-10s ring pulse at 1 Hz. **Aggregate budget:** no element or screen region flashes more than 3×/s regardless of how many compliant events stack; repeated same-source flashes (e.g. hull hit flashes) share the 300 ms floor; the motion setting's "reduced" tier also halves flash intensity.

Committed v1 options (settings overlay). Key remapping is **not** among them — deferred post-beta (Open Questions); no hold/toggle refit option either — fixed bindings, hold-Space is absolute:

1. **Motion/shake** — tiers full / reduced / off, covering directional screen shake, camera motion effects, and pulse/flash intensity (reduced halves it); overrides every juice rule below. Whether the death-reveal zoom is exempt (it's the climax beat) = Open Questions. Default full.
2. **UI scale** — 90 / 100 / 125%; **125% is gated to viewports ≥1600 px wide** (settings note; prevents chrome/feed collision at the floor). Applies to the Pixi HUD **and** DOM HUD elements (kill feed, toasts, refit cards); port chrome follows browser zoom instead. No mono type below 9 px post-scale. Default 100%.
3. **Colorblind assist** — family-distinct palette adjustment: the 20 Regatta hues regroup into ~8 clearly separated color families so "boat A vs boat B" is distinguishable (identity degrades to family — not Variant P, which was rejected in triage). Also boosts blip outlines and raises the minimum decayed blip opacity. Default off. Acceptance: families distinguishable under simulated deuteranopia at blip scale.
4. **Audio** — master + effects volume sliders and a **mono-audio** toggle (unilateral hearing loss loses the stereo bearing field; the listening ring is the visual backstop). Defaults 100 / stereo.

| Setting | Values | Default | Persistence |
|---|---|---|---|
| Motion/shake | full / reduced / off | full | localStorage |
| UI scale | 90 / 100 / 125% (125% gated ≥1600 px) | 100% | localStorage |
| Colorblind assist | off / on | off | localStorage |
| Master / effects volume | 0–100 each | 100 | localStorage |
| Mono audio | off / on | off | localStorage |
| Mute | off / on (key M) | off | localStorage |

Surfaces: gear on home + non-pausing ESC overlay in match; never make in-match the only path to any accessibility setting. Cognitive floor: **banked offers never expire** (guarantee, see Refit Card); boon glossary lives on How-to-Play; accrued boons + last offer reviewable from the results modal.

## HUD & Diegetic UI

Full composite ratified "pretty good" — [hud-composite-1.html](./.working/hud-composite-1.html); squint-test steady-state load approved. Mock-scale caveat: blip/hull sizes in that mock are artifact, not decision. **The composite now contradicts the spine** (horizontal HP bar, 1/2/E keys, supply ghost, CTRL copy): the pending key-screen re-render — 4 refit cards, vertical HP Rail, Q/E/R/F glyphs, "HOLD SPACE" copy, no supply ghost, centered own ship — is a **blocker for E2/E6 implementation**, not a nice-to-have.

| Zone | Element | Content |
|---|---|---|
| Bottom-left | XP Rail + Banked-Level Chip + Hotbar (4 slots, Composition 2 vertical stack) | Build, economy, weapons |
| Bottom-right | Own-vitals cluster: HP Rail + HDG/KTS readouts + rudder gauge + Telegraph Cluster | [ASSUMPTION] HP as a vertical rail on the cluster's **right side**, mirroring the XP rail — facilitator interpretation of Eric's redline, pending re-render confirm (the composite still shows the superseded horizontal bar) |
| Top-center | BR Chrome Bar | Ships afloat · your kills · up-counting match timer · ring-closing countdown. **No supply-drop reservation** — mechanic wholly parked, zero HUD footprint |
| Top-right | Kill Feed | Personal-color naval theater (text-safe variants) |
| Around own ship | Listening Ring | Compass rose; segments light toward noise, intensity ∝ loudness/closeness — the primary torpedo warning channel; pure intensity grammar, deliberately source-ambiguous |
| World | Firing arcs | Drawn on aim only (carry-over behavior); deliberately absent from steady-state |

**Camera zoom (Z/X + wheel)** makes edge-of-screen radar content player-manageable: zoom out to read the ring and the far radar annulus (radar paints beyond a 16:9 half-height are a real thing at the floor viewport), zoom in for knife fights. Fog stays server-authoritative, so zoom is a viewport choice, never an information exploit. Zoom range/limits = open tuning (Open Questions).

**Sensor presentation (three tiers):** truesight bubble = live hulls (LOS-clear); radar sweep = decaying blips carrying hull **outline** + arrowhead heading vector (class readable at blip range; render levers in DESIGN · blip rule); listening ring = bearing-grade intensity pips. Blips are personal-colored (**Variant C**, preferred default) with a **Variant P** phosphor-anonymous build flag kept for playtest swap — colored blips make contacts trackable across fog gaps; the grudge/bounty deduction game is embraced. **Drones** render the legacy chevron silhouette (+ its sizes) at hull and blip scale — a fifth silhouette no player class wears, so drone-vs-combatant reads without color. **The Bounty** (Component Patterns) is the one sanctioned exception to sweep-only radar paints.

**The listening ring never encodes source type** — informed design intent (triage 2026-07-16): pips are pure noise intensity (more/closer = brighter), and source ambiguity is deliberate. Sight is the confirmation channel: **torpedoes and mines are confirmed visually in truesight** when close.

**Torpedoes:** heard on the ring from long distance; **seen only at truesight** — or a slightly tighter radius, tuned by how easy dodging proves once spotted (if the tighter radius ever ships, a bridge signal in the gap band is required — deferred, Open Questions). Radar never paints torpedoes. The materialization treatment (boundary rings + wake, DESIGN · Torpedo) makes pips→sight read as one continuous event.

**Enemy damage is diegetic only** — wounded ships trail smoke ({colors.wounded-smoke}) above the fog; **no enemy HP bars, ever.** Own damage is HUD-private (HP Rail + shake + vignette).

**Fog/world reads:** fall-of-shot splashes ({colors.splash}) visible in fog (misses are information; bracket-and-walk); muzzle flash ({colors.muzzle}) carries beyond truesight (shooting is being seen); fog banks shrink your truesight while hiding you from others'.

## Game Feel & Juice

Carried inventory (current client, kept): directional screen shake on own damage (4→16 px lerped by hit size, exponential decay); 130 ms white hull flash on struck contacts (same-source flashes share the 300 ms floor — aggregate budget applies); amber hit spark vs miss splash ({colors.splash}); crimson expanding sink ring ({colors.damage-marker}); denied-fire 80 ms red pulse on arc + slot, rate-limited; 13-tone WebAudio set (fire ×3, damage thud, kill chime, point ping, upgrade two-note, sink alarm, countdown ticks, match start, storm growl, telegraph bells) — tones only, no sound files, mute-aware.

Added by decision:

- **Hit Call** — muffled boom + {colors.hit-bloom} bloom through fog: you know you connected, not how badly.
- **Fall-of-shot** and **muzzle-flash-carries** — see HUD section; feel features that are also information.
- **Wounded smoke** — hurt ships trail it; hurt = trackable.
- **Low-HP escalation** — HP Rail threshold colors + accelerating pulse capped at 1.1 Hz (see State Patterns); audio sting pending the RT sound map (Open Question).
- **Denied input is never silence** — every refused fire/activation gets its pulse + (future) tone, tracked in the sound-map contract table.
- **Death ritardando** — ~5 s sinking window, hull slows to a stop, guns stay live (go down shooting) → **omniscient reveal**: fog drops, map revealed, camera zooms out to everything → Results modal (kills, placement, leave). The reveal converts losing into learning.
- **The build must be felt** — every boon lands with audio + hull visual + on-water behavior, or promise + growth is a spreadsheet.

**Motion/shake settings override everything in this section** (reveal-zoom exemption = Open Questions).

## Key Flows

Personas are constructed from the brief's audience sketches (no upstream personas exist). Journey A accepted with Beat 6 corrected; Journey B tentatively accepted (no objections). [ASSUMPTION] Beat prose below reconstructs the accepted skeletons from the log's anchors; wording is not Eric-authored.

### Journey A — "Marco" (13, school Chromebook, brand-new)

1. Portal click → home in under 10 s over the live CIC canvas. It looks *cool*. He types a callsign, ignores every option, and hits SET SAIL as the default Gunboat, Solo.
2. Weapons-safe waiting room: the full HUD is already live; the telegraph ladder wears its W/S glyphs and the rudder its A/D — he wiggles them and learns the telegraph is set-and-forget before the countdown ends.
3. First minutes: the sweep paints a blip — an outline with a heading vector. He chases it; truesight resolves a greyscale chevron drone.
4. He clicks in-arc, the Hit Call booms, the drone sinks; the XP Rail wraps and the Banked-Level Chip starts breathing: "HOLD SPACE TO REFIT."
5. He holds SPACE — four cards over the still-running battle; he presses 2; the boon lands on its slot with a visible change. Release, back to the hunt.
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

*(Third journey — party/friend-group session — remains open, non-blocking. Until it lands, Dee's beats double as the read for the brief's primary 16–35 "design compass" audience.)*

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
- **UI scale** 90/100/125% multiplies the HUD ramp (125% gated to viewports ≥1600 px wide); corner anatomy never rearranges (muscle memory is the contract); refit cards never wrap — the 1–4 keys map spatially; no mono type below 9 px post-scale.
- **DOM chrome** (home, results, settings, How-to-Play) centers at {spacing.chrome-max-width} (1100px).
- Canvas fills the window; fog composite rebakes on resize; camera zoom (Z/X + wheel) is the player's own framing lever.

## Open Questions

1. **Heal-as-upgrade** — GDD-owned. Eric leans "some healing must exist"; conflicts GDD "no heal option in the economy." If kept: heal card appears within the 4-choice offer. Parked for GDD update.
2. **GDD corrections needed** — UX designs for 4-card offers (decided, supersedes GDD's "3 upgrades from 3 distinct categories") and names the mode "Solo vs AI" (GDD: "Solo vs Bots"); both need GDD-side correction notes.
3. **Supply drops** — mechanic wholly parked; **no HUD reservation** (reserved ghost removed).
4. **Premium cosmetic colors** — parked, ambivalent (colonist.io "feels kinda bad"); monetization = AdSense only for now.
5. **Reference sites** (buddyboardgames / papergames / openfront) — v0.16 carry-over never revisited; new references are LoL/Hades.
6. **Island colors** — `{colors.island-fill}`/`{colors.island-stroke}` carried provisionally; gridless island rendering never ratified.
7. **Storm edge treatment** — ring-edge rendering in RT undecided; only the countdown HUD is decided. Candidate on close: **dashed edge stroke at {colors.storm-readout} brightness** (the dashed line is the non-color channel; the `{colors.storm}` fill fails 3:1 as a graphic).
8. **Sound-event map** — RT sound design (listening-ring audio grammar, low-HP sting, hit/miss/sunk set, bounty/foghorn events, denied tone) not yet designed; audio is a sensor, so this is game design too. **Contract:** the deliverable must carry the two-column audio-event ↔ visual-twin table (Accessibility Floor).
9. **Kill-streak spectacle** — center-screen celebration beat (v0.16 idea) never decided; fits "Silly Is Sanctioned."
10. **`--player-color` CSS-var technique** — DOM-chrome implementation detail for personal colors, unowned.
11. **Readiness-pressure indicator** — visible social pressure in the waiting room (v0.16 "X/8 locked in" psychology), undecided.
12. **Third journey** — party/friend-group session protagonist, open, non-blocking.
13. **Class-card pip values** — SPEED/TOUGHNESS/TURNING pips are placeholders on every card.
14. **Boon copy** — all boon names/categories in mocks and this spec are placeholder, not canon.
15. **First-run default class = Gunboat** — unobjected proposal; confirm before ship.
16. **Camera-zoom range/limits** — open tuning (bindings Z/X + wheel are provisional too).
17. **Torpedo bridge signal** — deferred, conditional on the tighter-than-truesight visibility tuning ever shipping; guard if it does: "the pips and the sighting must never disagree about existence, only about precision."
18. **150% UI scale tier** — deferred post-beta (low-vision ceiling vs floor-viewport real estate).
19. **Key remapping** — deferred post-beta: no accounts exist yet, so remaps would mean heavy localStorage; revisit after beta. v1 ships fixed bindings.
20. **Foghorn key binding** — the emote is specced (ring visual, no feed) but unbound.
21. **Per-hue text-safe variant table** — exact lightened hexes for personal colors as text (feed, results, nameplates); mechanism is decided (≥4.5:1, storm→storm-readout pattern).
22. **Nameplate scope** — own-only vs all truesight combatant hulls (the propagation rule names the own nameplate; visual spec exists either way).
23. **Whirlpools (GDD E4)** — no perception/feel treatment yet.
24. **PvE drone tiers** — common/uncommon/rare visual language beyond chevron greyscale + size, unowned.
25. **Reveal-zoom motion exemption** — whether the death-reveal camera zoom is exempt from the motion/shake setting (it's the climax beat).
