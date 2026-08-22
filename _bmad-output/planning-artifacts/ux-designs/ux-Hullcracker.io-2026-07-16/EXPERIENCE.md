---
title: EXPERIENCE.md — Hullcracker.io experience spine
status: final
project: Hullcracker.io
created: 2026-07-16
updated: 2026-08-21
design_reference: ./DESIGN.md
sources:
  - _bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/ (GDD + epics)
  - _bmad-output/planning-artifacts/briefs/brief-Hullcracker.io-2026-07-15/ (brief + addendum)
  - _bmad-output/brainstorming-session-2026-07-15.md
  - imports/DESIGN-v0.16-root.md (via ./reconcile-design-v016.md)
  - .decision-log.md (canonical decisions, this run)
  - validation-report.md (reviewer gate, applied 2026-07-16)
  - epic-1..7 context amendments (reconciliation pass, Story 7-6, 2026-08-21)
---

# EXPERIENCE.md — Hullcracker.io

How the game works, surface by surface. Peer contract: [DESIGN.md](./DESIGN.md) (visual identity — every `{curly.path}` reference below resolves there). Distilled from `.decision-log.md`; **spines win on conflict with any mock, wireframe, or import.** Reviewer-gate findings ([validation-report.md](./validation-report.md)) applied 2026-07-16.

**Reconciliation stamp (Story 7-6, 2026-08-21).** Every statement below about shipped behaviour was re-checked against `client/`, `server/` and `shared/`, or against a ratified amendment. Where a 2026-07-16 ratification was superseded by a later Eric ruling, the later ruling governs and is cited inline. The aesthetic and interaction spine — the accessibility floor, the helm rows, the HUD zone anatomy, the photosensitivity caps, the anti-patterns — carries forward unchanged. Anything still unbuilt is marked as deferred rather than described as if it shipped.

## Foundation

- **Platform:** desktop browser (current Chrome, Edge, Firefox, Safari), keyboard + mouse only. Mobile/touch out of scope for beta.
- **Render split:** PixiJS 8 canvas for everything tactical; DOM only for chrome (home, class-select layer, queue modal, results, settings, How-to-Play, privacy policy, kill feed, toasts).
- **Performance floor (UX constraints):** 60 FPS sustained in a full 20-ship match on the ratified reference device — MacBook Pro 16,1 (2019), i7-9750H, Radeon Pro 5300M, `devicePixelRatio` 2 (epic-7 amendment 1, read off the machine at run time) — where *"60 FPS sustains"* is a dropped-frame test, not a p95 threshold: median at the refresh period (≤18 ms) and dropped frames ≤0.5% of presents (epic-7 amendment 13). Playable from a cold load of the direct URL in under 10 s; feel intact up to ~150 ms latency. **The old "low-end school Chromebook" framing is struck** (Eric ruling 2026-08-21: *"Idgaf about the chromebook"*); the **1366×768 floor viewport survives independently** (NFR7, UX-DR39 — see Responsive & Platform) and every open review finding grounded on that viewport keeps its severity.
- **Input fantasy:** "hands describe the fantasy" — left hand helms the ship, right hand fights it.
- **Visual identity:** DESIGN.md is the reference for every token, component visual, and hard rule cited here.

## Information Architecture

Journey spine: **home → class select → queue (Solo) *or* instant create (Solo vs AI) → boarding at a frozen start line → countdown → live → death reveal + results modal → return to port → re-queue from home.** Nothing is deeper than one layer from the water. Launch modes: **Solo** and **Solo vs AI**, presented as a MODE ROW; mode chrome grows only when more modes exist (the row is built to take DUO/TRIO as in-line siblings, which are not scoped and carry no reservation here — Eric ruling 2026-08-21, *"those come after beta launch. K.I.S.S."*). The GDD's "Solo vs Bots" naming was corrected to "Solo vs AI" GDD-side; that flag is closed.

| Surface | Medium | Delivers | Notes |
|---|---|---|---|
| Home (at rest) | DOM over live ambient CIC canvas | First 5 seconds must feel **"cool"** — the acquisition hook | Wordmark, callsign field (14-char cap), Class Chip (one glance = what you'll sail, opens the class bay), **MODE ROW** — the dominant amber outline+glow `SOLO` button with the unlit phosphor `SOLO VS AI` door centered on the row below (Story 6.5) — How-to-Play link, server-status line, settings gear, bottom-left liveness register, version register. **The mode buttons carry NO sub-line at all** (epic-6 amendment 50, Eric 2026-08-19 — the deletion is also a bugfix: an inline `visibility:visible` on a descendant defeated the home's yield to the settings overlay). `SET SAIL` no longer exists anywhere in the client. The Color Hoist lives ONLY in the class bay footer now — the duplicate home hoist is retired — but the player's hue still tints the chip and the callsign field |
| Class-Select Layer | DOM layer over home | "The Hades weapon pick" — a complete playstyle promise | Class Cards side by side on a horizontal scroll rail; ghost card clipped at frame edge = scales past 4; Color Hoist in the layer footer; layout register per [home-class-picker-1.html](./mockups/home-class-picker-1.html) — mock content SUPERSEDED 2026-07-24, shipped 1.14 chrome + DESIGN.md Components are authoritative. Keys: 1–3 / arrows highlight, Enter picks, ESC closes without change |
| Queue modal (Solo) | DOM modal over home | The wait, honestly | Opens exactly while being pooled is meaningful; closes on the seat, on an error, or on CANCEL. It says **three things and invents nothing** (epic-6 amendments 41/42): `N/20 QUEUED` (both numbers off the payload, never a literal cap), a `STARTS IN m:ss` countdown that exists ONLY while the pool is genuinely armed — an unarmed slot holds its line but stays EMPTY rather than showing a clock that cannot fire — and `CANCEL`. ESC cancels (amendment 45). No title sentence, no reassurance prose, no lobby-collapse register. The status line beside HOW TO PLAY speaks for the SERVER and nothing else |
| Liveness register | DOM, bottom-left of home | The port's only knowledge of the world outside it | `PLAYERS ONLINE: n` over `LIVE GAMES: n`, global totals rather than per-mode (epic-6 amendments 33-35, 40, 43). A genuine zero RENDERS — see Surface cold states |
| Solo vs AI door | DOM button on the mode row | One human + 19 AI captains, no wait | A `create`, never a queue (epic-6 amendment 29): the door mints a fresh locked room, so it starts instantly and can never pool. Game logic never forks — roster composition is a parameter, and an AI captain may legitimately win |
| How-to-Play page | DOM, standard page chrome, its own entry at `/how-to-play` | Onboarding surface (coach marks were pared to this) | Static page, ESC/back returns to the port (never `history.back()`). Sections as shipped: THE OBJECTIVE · STEERING · SHOOTING · EQUIPMENT · UPGRADING, with **keys rendered as keycaps** in the in-game refit-card chip so the scheme reads as one system (Eric ruling 2026-08-19). Closes with a link onward to the privacy policy. No Pixi, no socket, no analytics — a reader never downloads the renderer to read the manual. Solo vs AI is the live tutorial |
| Privacy policy page | DOM, the same standard page chrome, its own entry at `/privacy` | The disclosure surface | Every sentence is a claim about shipped behaviour, and it speaks as **Hullcracker.io** in the third person — no operator name, no entity type, no country of residence (epic-7 amendment 19, Eric 2026-08-19) |
| Settings overlay | DOM | Accessibility + audio + bindings reference | Gear entry on home **and** non-pausing ESC overlay in match — opening mid-fight is the player's own risk (same philosophy as the refit window). Doubles as the in-match binding reference (view-only — bindings are fixed for v1; remapping deferred post-beta). Not reachable while spectating: ESC there reopens the score screen instead (epic-7 amendment 17, a consequence taken deliberately) |
| Boarding — the held start line | Pixi HUD text | Lobby honesty, and the gate is real | `CAPTAINS BOARDING — n ABOARD` + `ALL STATIONS LOCKED`. **The sailable weapons-safe ready room is GONE in production** (epic-6 amendments 1 and 8, Eric 2026-08-14): everyone drops onto their real start location with **movement locked, weapons locked and radar off**, and the room holds until the last captain has loaded. Your spawn position is therefore disclosed to you before the gun — a ruled change, not a leak. No denominator: `expectedCaptains` is the queue's number and never reaches the client. The sailable grammar survives ONLY behind the dev/sandbox door, where the tag still reads `WEAPONS SAFE` |
| Countdown | Pixi | Match start | `MATCH STARTING` + big center count, 0:10. The tag stays `ALL STATIONS LOCKED` — the countdown is held exactly as boarding is, so softening the tag would read as the moment the helm came back |
| Live HUD | Pixi + DOM feed/toasts | The hunt | Full anatomy in HUD & Diegetic UI below |
| Refit window | DOM overlay, **TAB** toggles | Spend banked levels | Non-blocking, game runs behind; see Component Patterns |
| Death: sinking → reveal | Pixi | "Losing into learning" | ~5 s ritardando (guns live) → omniscient reveal: fog drops, camera pulls back to the whole ocean, nameplates on every hull. **The reveal is the BACKDROP, not a beat of its own** (epic-5 amendment 24) — the results modal opens over it at founder, and the fullscreen dim is thin enough (`fogBase` at `results.dimAlpha`) to see the ocean through |
| Results modal | DOM Modal | Close the loop fast | The `SUNK` death-register banner with `9TH OF 14` under it, the `<CALLSIGN> · <CLASS>` identity line in your own hue, three stat tiles (**KILLS · PLACEMENT · TIME AFLOAT**), a **MATCH LOG** stamping every kill and your own death at `T+mm:ss`, `SHIPS YOU SANK`, and the `BOONS ACCRUED` / `LAST OFFER` blocks. **Two actions: SPECTATE + RETURN TO PORT** (epic-2 amendments 22/23) — SPECTATE is offered only while the match is still live. **ESC means SPECTATE**, never return to port. **No re-queue from the modal, ever** (epic-5 amendment 30, Eric: *"You MUST return to the home screen to requeue"*) — pinned by a test on the rendered action set. A responsive display ad sits in the right gutter while the score screen is up, and only once Google reports the slot filled; the panel and the ad centre as one group (epic-7 amendment 18) |
| Return to port | — | "Frantic to Play, Light to Hold" | Ends in a real page load back at the port; the next match is seconds, not menus; no account, no grind |

## Voice and Tone

Terse naval-command with a playful wink — "Silly Is Sanctioned": the tension is real, the wrapper never is.

- **Command register** for actions, as shipped: `SOLO`, `SOLO VS AI`, `CANCEL`, `RETURN TO PORT`, `SPECTATE`, `REFIT`, `ALL STATIONS LOCKED`, `WEAPONS SAFE` (dev door), `DEPLOY AS…` on the class cards.
- **Death register** is dry-naval: `SUNK` over `9TH OF 14`. Grim facts, no mockery, no exclamation points.
- **Microcopy rules:** uppercase mono for labels and system lines ({typography.label}); sentences only in descriptions, How-to-Play and the privacy policy; numbers always tabular; no banned/required word list exists — hold the register the locked mocks speak.
- Kill feed is naval theater: named vessels, personal colors, `X SUNK BY Y` / `X LOST WITH ALL HANDS`.

**THE COPY LAW (epic-6 amendment 41, Eric 2026-08-18 — quoted verbatim, and it binds every implementer):**

> **That was scope Eric never granted, and the process rule is the durable half of this amendment: a ruling to put information somewhere is NOT a licence to author the copy that goes there.** When a state seems to need words that were not ruled, the answer is to leave it empty and ask.

Two consequences already recorded against it. Copy authored in-cycle without a ruling is marked DRAFT and carried until Eric rules: `COULD NOT REJOIN YOUR MATCH — BACK IN PORT` (home status line, tone `info`, after a failed resume) was authored that way and is now **RATIFIED as-is** (Eric, 2026-08-21). And a deletion ruling deletes the machinery, not just the text — the mode-button sub-lines took their whole reserved-slot apparatus with them rather than being hidden.

## Component Patterns

Behavior only; visuals in DESIGN.md · Components (same names).

- **Hotbar Slot** — four slots, vertical stack bottom-left. **The gun is slot 0 and has NO key of its own** — it is the permanently-selected default (Eric rulings 2026-07-21 / 2026-07-24). The three keyed slots are **Q** and **E** (the two class specials) and **R** (the pickup/extra slot, inert while empty): Torpedo Boat fits torpedo + speed boost, Battleship fits broadside + star shells, Mine Layer fits mine + radar buoy. Two interaction classes: **weapons switch-to** (press primes that slot; the same key again reverts to the gun; firing auto-reverts), **abilities activate** (press = triggers immediately through the action queue, no selection state). Weapon-vs-ability comes from the equipment table, never a slot literal. The chamfer shape marks abilities. Labels: line 1 = weapon/ability NAME (no slot-role line); quick-info line shows DAMAGE and COOLDOWN at minimum; accrued boons compress into quick-info as `◆n` — tooltip carries the full list. Reloads tick on every slot regardless of selection; switching is tempo, not penalty.
- **Ammo Badge** — appears only on slots whose system stores >1 round; counts down on fire, up on reload.
- **Slot Tooltip** — on hover: name, interaction class, description, full accrued-boon list with effects (qualitative, Hades-style — this is where the player checks their build).
- **Banked-Level Chip** — appears at the head of the hotbar stack when ≥1 level is banked; count inside; breathing, never flashing; breathing decays to a static glow after ~10s unspent, re-arming on a new bank. Hidden at zero banked levels. The cue line beside it reads `LEVEL UP — TAB TO REFIT`.
- **XP Rail** — passive XP + kill bonuses fill the rail; on level-up it wraps, the Banked-Level Chip increments, and a Toast fires.
- **Refit Card** — the spend window: **TAB toggles it open and closed** (Eric ruling ratified 2026-08-21 — see Interaction Primitives; the 2026-07-16 "SPACE is HOLD, never toggle (absolute)" ratification is RETIRED). Four cards side by side (offers present **4 upgrade choices**, `CONFIG.offer.size`); pick with **1/2/3/4**, and **5** spends on the always-available DAMAGE CONTROL rail one seam below the row. Offers are **drawn from the player's own deck — up to 4 DIFFERENT card LINES, weighted by rarity** (epic-2 amendment 38 replaced the old "3 upgrades from 3 distinct categories" roll wholesale); they are materialized once at earn-time and **never reroll — and banked offers never expire** (explicit guarantee: peek, close, fight, re-open; the time pressure is self-managed). Queue pips + ghost edge show offers waiting behind the current one. A pick LATCHES: on success the next offer renders IN PLACE and the window stays open; on a server rejection or timeout the picked card fires the denied pulse and the level stays banked (epic-2 amendment 36 — spending no longer closes the window). Non-blocking: the battle stays visible in every gap and the hotbar dims to 38% while open — but while it is open the game is under full combat lockout (mouse fire suppressed, **Q/E/R/F suspended**); the helm (W/S/A/D) stays live. Refit trades attention for build progress — deliberate. Row placement never occludes the own hull, and never wraps (DESIGN · Refit Card).
- **The card face is MINIMAL, and the explanation is hover-only** (epic-7 amendment 26, Eric 2026-08-19): name, lineage, rarity tag, `current → next`. The prose moved to a hover tooltip precisely because the Tab/1-4/5 shortcut exists to SKIP the reading — wiring the explanation into the shortcut would put it in front of the player who does not want it. The rarity ladder rides the loot-tier colour ramp (green → blue → purple → red → gold), absolute rather than normalised, and still dual-coded by the Roman numeral and the ladder name.
- **Class Card / Class Chip / Color Hoist** — chip on home shows the current pick and opens the layer; cards carry silhouette, pip scales (SPEED / **ARMOR** / TURNING — real values on absolute anchors: TB 4/2/4 · BS 2/4/2 · ML 3/3/3) and two special-slot rows keyed Q/E; pick returns to home with the chip updated. Hoist sets the color *preference* (granted if free; if taken, nearest free hue clockwise — FCFS at join, Eric ruling 2026-07-23) — UI must never imply claiming or locking; it reads as a WHEEL (epic-7 amendment 36). First-run: forced choice — no default class is ever pushed, the chip reads `SELECT CLASS`, and either deploy button opens the layer instead of connecting; Torpedo Boat pre-focused (Eric 2026-07-19 / 2026-07-24).
- **Mode Row** — `SOLO` queues in the shown class/color preference; `SOLO VS AI` creates a fresh 1+19 room instantly. **Enter is bound to the callsign field and runs SOLO only** — the SOLO VS AI button carries no `⏎` chip, because a key chip is a truthfulness claim and may appear only where Enter really does that thing. Neither button carries a sub-line. While a join is in flight both doors disable and the status line reports; on failure it reports plainly (`CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?`), never a dead screen.
- **Kill Feed** — max **6 lines, 8 s TTL**, newest on top; names in personal colors (text-safe variants), PvE fleet hulls greyscale; long names mid-ellipsize. **The feed is GLOBAL** (the Public Register): every captain's sinking reaches every client at any range through any fog, by any cause including the storm, and presentation is identical for a witnessed and a reported kill. The payload is IDENTITY ONLY — no position, class, hue, damage or weapon — so *location* stays exactly as protected as it always was, and an unwitnessed kill draws no sink plume. Drones are not combatants: a fleet sinking reaches only its witness and its killer. A `☠︎` mark rides the kill leader's name wherever it appears in a line, as killer or victim.
- **Toast** — transient self-events only (level banked, boon fitted, `YOU ARE THE KILL LEADER`); max 3, 3 s TTL; never carries enemy information.
- **Modal** — results, settings overlay, queue modal. Modals never stack; the ESC settings overlay does not pause the game. Results keys: **Enter = RETURN TO PORT, ESC = SPECTATE**; while spectating, ESC reopens the score screen (epic-7 amendment 17). No re-queue key exists anywhere in the modal.
- ~~**Bounty Bloom**~~ — **RETIRED 2026-08-10 (Story 4.6, Eric ruling)**: no location disclosure of the kill leader ships, ever. The bounty survives as a held throne over captain-only kills, presented as KILL LEADER (player-facing copy ruling; internal naming stays `bounty`) — a skull mark (`☠︎`) rides the leader's name wherever it appears in the feed, as killer or victim, with a static faint glow on that name; the claim register reads "☠︎ <NAME> IS THE NEW KILL LEADER"; the BR Chrome Bar carries a persistent "☠︎ <NAME>" register; and a self-only "YOU ARE THE KILL LEADER" toast + `bounty` tone fires when the throne lands on you. Visual: DESIGN · BR Chrome Bar / Kill Feed (the Bounty Bloom row there is likewise retired).
- **BR Chrome Bar / Foghorn Chevron / HP Rail / Telegraph Cluster** — see State Patterns and HUD & Diegetic UI.

## State Patterns

**Hotbar Slot states** (visual grammar in DESIGN.md):

| State | Trigger | Signal |
|---|---|---|
| Ready (weapon) | Loaded, unselected | Soft phosphor outline |
| Ready (ability) | Off cooldown | Brighter phosphor + chamfer |
| Selected | Q/E/R press on a weapon (the gun is selected by default and has no key) | Amber outline + glow; inset wash + filled key chip (hue secondary) |
| Cooling | Fired / reloading | Icon dims, conic perimeter ring fills, seconds in quick-info |
| Activated flash | Ability triggered | ≤80 ms phosphor pop, decays to idle |
| Empty | Extra slot unfitted | Dashed outline, "— awaiting refit —" |
| Denied | Fire **or activation** attempt while invalid (cooling, no ammo, empty slot) | 80 ms red edge pulse + icon flash — **never silence**. (The held start line is not a denied state: the helm, trigger and scope are held by the match itself, and the HUD says so with `ALL STATIONS LOCKED` rather than blaming the player. The dev/sandbox ready room is likewise not denied — weapons genuinely fire there, damage suppressed) |

**Attention priority** — arbitration across the HUD's animated channels (one hierarchy; photosensitivity caps still bind every tier). Pips obey the intensity ruling: urgency = intensity, never source type.

| Tier | Channels | Rule |
|---|---|---|
| 1 — Threat | Denied pulses (ALL of them — the on-water arc/marker pulse and the per-slot hotbar pulses), HP Rail pulse in its crimson band (<25%) | Always animate (rate-capped by the photosensitivity floor); own the player's eye |
| 2 — Match state | Ring-countdown final-10s amber pulse (1 Hz), in-storm vignette (1.1 Hz) | Animate unless a Tier 1 channel is active, then hold steady at the lit keyframe. A Tier 2 channel does NOT hold under another Tier 2 |
| 3 — Economy | Bank-chip breathing, toasts, XP-rail wrap | Freeze at the dim keyframe while any higher tier is active — including Tier 2 alone (the asymmetry with the Tier-2 rule is deliberate and implemented literally). Chip breathing decays to static after ~10s regardless. Of the three channels named, only the bank chip actually breathes: toasts fade on a TTL and the XP rail does not animate |

**The Listening Ring is DEFERRED and is deliberately NOT a Tier-1 channel** (epic-4 amendment 1; `render/attention.ts` states it in code). Nothing may list it as an input until it exists. The shipped bearing surface is the **Foghorn Chevron** — see HUD & Diegetic UI.

Corollary (amber overload): only the highest-tier active amber channel pulses; every other amber element holds steady — amber keeps meaning "look here" at the climax.

**Own HP** — threshold colors + accelerating pulse, blended channels: {colors.phosphor} at ≥50%, {colors.amber} below 50%, {colors.damage-marker} below 25%; pulse rate rises with damage **and hard-caps at 1.1 Hz** (the storm vignette's ratified exception ceiling; opacity-breathing, never strobing — the cap resolves the acceleration-vs-floor contradiction). [ASSUMPTION-lite, log-flagged] The blend (both channels rather than either/or) is a facilitator resolution, unobjected-pending.

**Banked levels** — 0: no chip; ≥1: breathing chip + count + the `LEVEL UP — TAB TO REFIT` cue; while refit open: queue pips show current vs waiting offers; spend latch dims cards while a spend is in flight. **Spend failure:** if the server rejects or times out a spend, the latch releases with the denied pulse register on that card, the level stays banked, and the window stays open.

**DAMAGE CONTROL** — the heal is real and is **not a card**: an always-available rail one seam below the refit row, picked with **5** or a click, riding the reserved negative wire sentinel `HEAL_CHOICE` (epic-2 amendments 58-64, 67). It is never drawn into an offer, never exhausted, and never in the offer payload. One spend restores 50 hp instantly and adds 50 hp to a regen pool that pays out at 5 hp/s (`CONFIG.damageControl`; both halves doubled at balance cycle 122 in step with hull HP). Banked levels are uncapped, so hoarded heals — not hull HP — are the real ceiling on how long a sudden-death collapse can be survived.

**Color grant feedback** — REJECTED (Eric ruling 2026-07-23, Story 1.13): no contested-hoist toast. Color is FCFS at join; the granted hue simply flies on the nameplate. Do not build absent a new ruling. There is likewise no `--player-color` CSS variable: personal hues reach DOM chrome as inline hex through `textSafe()` at each site, and no per-hue variant table exists — the lightening is algorithmic against the ≥4.5:1 rule.

**Ring phases** (legible phases are the pillar's word): **four** ring groups × an internal minute rhythm — clear seas → a reserved supply-drop beat that is a structural no-op with zero HUD trace → next ring revealed ("where you must be is now known") → ring closes. The first three groups run to **12:00**, where the **endgame ring** stands at two truesight diameters (`terminalSightFactor × sight` = 660u — the Endgame Guarantee, and the same number radar range reaches by an independent derivation). **A fourth group then runs 12:00 → 16:00 (SUDDEN DEATH, cycle 82, Eric ruling 2026-08-14):** clear 12:00–13:00, supply 13:00–14:00, **reveal at 14:00 — the collapse point is marked with an X** — and from **15:00 to 16:00 the endgame ring collapses CONCENTRICALLY onto its own centre to radius 0.** The map is 100% storm at 16:00, which is what structurally ends a match the geometric bar could not. **No new player-facing copy ships with it:** the readout grammar is generic over group count and simply reaches `RING CLOSED` at 16:00 instead of 12:00. The BR Chrome ring readout counts down each closure and pulses amber at 1 Hz in the final 10 s. Storm never blinds sensors; it only damages (4 hp/s, flat, no ramp — Eric ruled the geometry, not the damage curve). In-storm: purple vignette pulse + "IN STORM" line. **The storm is NOT a radar return** — cycle 72 deleted the radar storm wall by preference; the ring renders on the water exactly as before.

**Match length.** ~15 minutes is the estimated game time; the theoretical ceiling with nothing banked is a little over 17 — closure at 16:00, and the game's toughest hull sinking roughly a minute and a half later at 4 hp/s (Eric, 2026-08-21). Hoarded heals push the outer edge further, but a match always terminates.

**Match lifecycle** — queue (Solo) or instant create (Solo vs AI) → **boarding at the frozen start line** (movement, weapons and radar all locked; spawn location disclosed) → countdown (still held) → live → own death (sinking window ~5 s, guns live) → omniscient reveal as the BACKDROP with the results modal opening over it → SPECTATE or RETURN TO PORT. **Reveal HUD survivor set (ratified):** BR Chrome Bar + Kill Feed persist through the reveal; hotbar, XP Rail, Banked-Level Chip and own-vitals die with the hull. Nameplates appear on ALL revealed ships, and **your own wreck stays on screen with its nameplate** (epic-5 amendment 24 — hiding it was only defensible while the reveal was a curtain nobody saw through). **Sinking window inputs:** combat inputs stay live; helm inputs are accepted but decay (the hull slows to a stop regardless). **Omniscient reveal inputs:** the modal owns the screen; ESC = SPECTATE, Enter = RETURN TO PORT. Disconnect mid-match: a bare `RECONNECTING…` banner while the client auto-retries — no countdown, no attempt count (epic-6 amendment 49) — and a successful resume returns seamlessly to the live HUD; a page REFRESH also resumes, inside the 60 s grace. Leaving is always deliberate — RETURN TO PORT or settings' ABANDON MATCH, never ESC and never a refresh — and a captain who never returns is scuttled at grace expiry, reading as an ordinary sinking. A failed reconnect routes home with `COULD NOT REJOIN YOUR MATCH — BACK IN PORT` on the home status line, never a dead screen. A resuming player simply MISSED the kill-feed lines that passed while they were away: the gap is accepted rather than back-filled, because a roster-delta digest could name who sank but never who sank them.

**Surface cold states** — home renders over a live ambient CIC canvas (never a blank page); the boarding line shows the full HUD so the first match teaches itself; an empty kill feed and zero kills render as **absence, not placeholders**. **That rule is scoped to DECORATIVE empties** (epic-6 amendment 39, Eric 2026-08-17): *"absence is right when the empty state carries no information; the honest number is right when the emptiness IS the information."* So `PLAYERS ONLINE: 0` and `LIVE GAMES: 0` are DRAWN, not suppressed — at beta population the truthful line is zero, and hiding it is what makes an empty server read as a broken one. Genuine UNAVAILABILITY — a failed or malformed fetch — still renders as absence under the original rule: the whole block simply does not appear rather than showing a misleading `0`.

## Interaction Primitives

| Input | Action |
|---|---|
| **Q / E / R** | The three keyed hotbar slots. Q/E are the class specials, R the pickup/extra slot (inert while empty). **The gun is slot 0 and has NO key** — it is the always-selected default; a weapon key primes its slot, the same key reverts to the gun, and firing auto-reverts. Abilities activate instantly. **Suspended while the refit window is open** |
| **F** | **FOGHORN** (Story 4.5, epic-4 amendment 56 — the reservation is closed). One honk per physical press, edge-gated so OS auto-repeat cannot machine-gun it; suspended with Q/E/R while the refit window is open. A honk is a bearing, not a message — see HUD & Diegetic UI. Deliberately live on the frozen start line |
| **TAB** | Toggles the refit window open and closed. It also closes on ESC and on spending the last banked level |
| **1 / 2 / 3 / 4** | In match: refit card pick, **only while the refit window is open** — refit-or-nothing otherwise, evaluated at the key's own keydown, so a stray digit can never misfire a future consumable. Class layer: highlight class card (Enter picks) |
| **5** | Spend a banked level on the **DAMAGE CONTROL** rail (the reserved `HEAL_CHOICE` sentinel), under the exact same window-only rule as 1–4 |
| **SPACE** | **Bound-inert.** Prevented at the chokepoint so it can never scroll the page, and it performs no action |
| **W / S** (tap) | Telegraph engine order ±1 of 9 detents (set-and-forget; hold does not repeat) |
| **A / D** (hold) | Rudder −1…+1; rudder authority reduces below steerage speed |
| **Z / X** | Camera zoom out / in |
| **Mouse wheel** | Camera zoom. Range is **0.5×–1.5×** of the base radar-fit framing while alive and **0.5×–1.0×** while spectating (epic-2 amendment 8). Fog is server-authoritative — zoom can never reveal what sight or sweep hasn't legitimately painted |
| **Mouse move** | Aim, constrained to the selected weapon's real firing arc |
| **Left click** | Fire one shot; denied fire always gives explicit feedback |
| **ESC** | Closes the topmost open surface; if none is open (home or live), opens the settings overlay (non-pausing). On the results modal ESC means **SPECTATE**; while spectating it reopens the score screen. It never leaves the match |
| **Enter** | Home: runs `SOLO` (bound to the callsign field; `SOLO VS AI` has no Enter binding and therefore no `⏎` chip). Results modal: RETURN TO PORT. Class layer: confirms the highlighted card |
| **M** | Master mute (carry-over binding) |
| **P** | Prediction debug — dev build only, stripped from production |

**Fixed bindings (v1).** Bindings are fixed for v1 — key remapping is **deferred post-beta** (no accounts yet, so remaps would mean heavy localStorage; stated in code). The settings overlay lists all bindings as a view-only reference — the scheme's only in-match self-documentation, alongside the How-to-Play page's keycap tables. **The Tab-toggled refit window supersedes the 2026-07-16 SPACE-hold ratification** (Eric ruling 2026-08-21, closing the repo's longest-standing doc-vs-code conflict): `Tab` opens and closes, `1`–`4` pick, `5` heals, and Space is bound-inert. UX-DR14's "SPACE is hold-not-toggle (absolute)" clause and UX-DR12's "HOLD SPACE TO REFIT" cue copy are RETIRED with it. The scheme also supersedes the old 1/2/3 weapon keys, the earlier CTRL modifier, and all placeholder keys in the mocks. All key glyphs share one visual family (DESIGN · Components).

**Input capture & browser hygiene.** With CTRL out of the scheme, browser-shortcut interception reduces to standard hygiene: every bound key is `preventDefault`ed at a single keydown chokepoint — **including Space (page scroll)** and Tab (focus cycle) — and `contextmenu` is suppressed on the canvas (right-click is one misclick from left-click-to-fire). DOM overlay or text input with focus = keyboard suppressed from the sim; the sim never pauses (typing "wasd" in the callsign field must not steer the ship). While the settings overlay or the results modal is up, every bound key but ESC/Enter/M is swallowed — helm included, unlike the refit window's partial lockout. `P` (prediction debug): dev-build only, stripped from production.

## Accessibility Floor

Non-negotiable floor (post-triage scope, 2026-07-16):

- **Dual-coding for class / threat / state meaning** — shape (chamfer, class silhouettes, drone chevron, pip geometry), position, and text co-carry every such signal. **Informed waiver:** individual combatant *identity* is color-first — Eric accepts that trade against the floor; drone-vs-combatant, class, threat, and state still read without color (the drone chevron is a fifth silhouette no player class wears).
- **Audio-visual redundancy** — every audio cue has a visual twin (the foghorn chevron IS the visual of the honk) and vice versa for combat-critical events; all audio respects mute. **Binding rule, and it is now stronger than it was written:** the two-column audio-event ↔ visual-twin table shipped as `TONE_TWINS` in `client/src/audio/twinMap.ts`, a `Record<AudioCueId, string>` — **exhaustive at the TYPE level over all 34 audio cues** (the 33 `ToneId` tones plus the foghorn), so a new cue cannot be added without a visual twin at all. That is a compiler guarantee rather than the review-time discipline UX-DR36 asked for.
- **Photosensitivity restraint** — breathing glows (≥2 s cycles), one-shot 80 ms pulses rate-limited (≥300 ms apart), no full-screen strobes; storm vignette capped at its 1.1 Hz pulse; HP pulse capped at 1.1 Hz; final-10s ring pulse at 1 Hz. **Aggregate budget:** no element or screen region flashes more than 3×/s regardless of how many compliant events stack; repeated same-source flashes (e.g. hull hit flashes) share the 300 ms floor; the motion setting's "reduced" tier also halves flash intensity.

Committed v1 options (settings overlay). Key remapping is **not** among them — deferred post-beta; nor is a hold/toggle refit option — bindings are fixed, and the refit window is Tab-toggled:

1. **Motion/shake** — tiers full / reduced / off, covering directional screen shake, camera motion effects, and pulse/flash intensity (reduced halves it); overrides every juice rule below. **The death-reveal zoom is NOT exempt** (epic-5 amendment 26 — the setting's own law is *"off removes motion, never information"*, and exempting it buys nothing because at `off` the camera SNAPS to the identical framing on frame one). Motion scales the DURATION, never the destination. Default full.
2. **UI scale** — 90 / 100 / 125%; **125% is gated to viewports ≥1600 px wide** (settings note; prevents chrome/feed collision at the floor). Applies to the Pixi HUD **and** DOM HUD elements (kill feed, toasts, refit cards); port chrome follows browser zoom instead. No mono type below 9 px post-scale. A 150% tier is deferred post-beta. Default 100%.
3. **Colorblind assist** — family-distinct palette adjustment: the 20 Regatta hues regroup into ~8 clearly separated color families so "boat A vs boat B" is distinguishable (identity degrades to family). Also boosts blip outlines and raises the minimum decayed blip opacity. Default off. Acceptance: families distinguishable under simulated deuteranopia at blip scale.
4. **Audio** — master + effects volume sliders and a **mono-audio** toggle (unilateral hearing loss loses the stereo bearing field; the foghorn chevron is the visual backstop). Defaults 100 / stereo.

| Setting | Values | Default | Persistence |
|---|---|---|---|
| Motion/shake | full / reduced / off | full | localStorage |
| UI scale | 90 / 100 / 125% (125% gated ≥1600 px) | 100% | localStorage |
| Colorblind assist | off / on | off | localStorage |
| Master / effects volume | 0–100 each | 100 | localStorage |
| Mono audio | off / on | off | localStorage |
| Mute | off / on (key M) | off | localStorage |

Surfaces: gear on home + non-pausing ESC overlay in match; never make in-match the only path to any accessibility setting. **One accepted gap of record:** ESC while spectating reopens the score screen rather than settings (epic-7 amendment 17), so mid-spectate access to volume and motion is lost; nobody is trapped — the score screen's own RETURN TO PORT is a better-signposted exit than settings' ABANDON MATCH — and if it matters it wants its own key, not this one back. Cognitive floor: **banked offers never expire** (guarantee, see Refit Card); the per-card explanation lives in the refit card's hover tooltip and How-to-Play's UPGRADING section explains the mechanism (the 2026-07-16 "boon glossary on How-to-Play" is superseded — that page carries the refit's rules and keycaps, not a catalog listing); accrued boons + last offer are reviewable from the results modal.

## HUD & Diegetic UI

Full composite ratified — [hud-composite-2.html](./mockups/hud-composite-2.html) (squint-test steady-state load approved on v1; v2 corrects v1's superseded HP bar, keys, supply ghost, CTRL copy, and blip scale — v1 is retained in `.working/` as audit trail only). Note that the mock predates the Tab binding, the heatmap return colours and the foghorn chevron.

| Zone | Element | Content |
|---|---|---|
| Bottom-left | XP Rail + Banked-Level Chip + Hotbar (4 slots, Composition 2 vertical stack) | Build, economy, weapons |
| Bottom-right | Own-vitals cluster: HP Rail + HDG/KTS readouts + rudder gauge + Telegraph Cluster | HP as a vertical rail on the cluster's **right side**, mirroring the XP rail — CONFIRMED by Eric on the v2 composite (2026-07-16) |
| Top-center | BR Chrome Bar | `n AFLOAT · n KILLS · T+mm:ss · <ring readout> · ☠︎ <NAME>`. AFLOAT counts **participants** (captains and AI captains, not PvE fleet hulls — epic-6 amendment 30, superseding the epic-4 wording); the ring readout runs the continuous-countdown grammar `RING CLOSES IN m:ss` → `RING CLOSING m:ss` → `RING CLOSED`; the trailing **KILL LEADER register** is the only optional segment and the only per-player HUE the bar has ever carried. **No supply-drop reservation** — that beat is a structural no-op with zero HUD footprint |
| Top-right | Kill Feed | Personal-color naval theater (text-safe variants), global |
| Screen edge | Foghorn Chevron | The bearing surface for a honk heard through fog: a chevron pinned near the viewport edge pointing down the bearing, weighted by an eight-value volume band of the LISTENER's intel range, fading over ~1.2 s. It carries bearing and volume and nothing else — no position, no identity, no correlation handle. The honker gets an own-hull bloom instead, because a bearing to yourself is meaningless |
| World | Firing arcs | Drawn on aim only (carry-over behavior); deliberately absent from steady-state |

**Camera zoom (Z/X + wheel)** makes edge-of-screen radar content player-manageable: zoom out to read the ring and the far radar annulus (radar paints beyond a 16:9 half-height are a real thing at the floor viewport), zoom in for knife fights. Range is 0.5×–1.5× alive, 0.5×–1.0× spectating; the death-reveal pull-back to the whole ocean is exempt from the alive clamp because it is derived from the live map radius and radar range rather than a literal. Fog stays server-authoritative, so zoom is a viewport choice, never an information exploit.

**INTEL RANGE is the one ruler, and every sensor boundary is a named eighth of it** (Story 4.9, the Eighths Ladder): 3/8 `detect` 247.5u, 4/8 `sight` 330u, 5/8 muzzle-flash / wounded-smoke 412.5u, 7/8 `farRadar` 577.5u, 8/8 `radar` 660u. **Since cycle 119 the ladder is FROZEN at those numbers for every player, every match** — the `intelRange` card that scaled it was deleted from the catalog (epic-7 amendment 31), so there is one set of sensor radii for everyone. `radar = sight × 2` and the endgame ring radius are the same number by two independent derivations.

**Sensor presentation (three tiers):**

- **Truesight bubble** — live hulls at `dist ≤ sight`, LOS-clear. **Islands block every sensor** (Eric ruling 2026-08-02) — binary, at any range, for truesight, the detect rung, muzzle flash, wounded smoke and the foghorn's muffle. **Radar is the ONE sensor that is height-aware** rather than binary (Story 4.11) — see below; nothing else moved with it.
- **Radar** — the rotating sweep paints decaying returns onto a phosphor lattice. **Returns take HEATMAP BAND COLOURS by return strength, never a personal hue** (Eric ruling, cycle 64: *"any particular point is either red, blue, green, or none of the above"*): exactly three bands, taken verbatim with no interpolation — red *"this is definitely a thing"*, blue *"probably a thing, but fuzzy"*, green *"honestly not sure, could be something tiny"* — drawn at ONE opacity, with age the only continuous quantity that survives to the screen. **This retires the 2026-07-16 "blips are personal-coloured (Variant C, preferred default)" ratification and the Variant P build flag with it.** Four things ride the same lattice: hull returns; **radar wakes** (server-owned, identity-free, one clock for the water and the ribbon — the fastest playable hull's full-ahead track is exactly the 3/8 detect rung, and older water lays FEWER cells rather than dimmer ones); **height-aware terrain shadows**, where a ray accumulates against the height raster so a low island no longer hides a distant ship, the slope paints up to the peak on the side you are looking at, and a shadow is simply UNPAINTED rather than marked; and **jamming fakes**, server-generated false returns from a jamming-doctrine radar buoy that are wire-indistinguishable from real ones by construction. Returns are DISPLAYED at 20% opacity inside 1/8 of intel range, ramping to 100% at 5/8 — you aim by sight up close, not by ghosts. The storm is not a radar return.
- **Hearing** — the foghorn chevron (above). The **Listening Ring never shipped and is deferred**; `render/attention.ts` says so in code. Every 2026-07-16 passage specifying it as live, as a Tier-1 channel, or as "the primary torpedo warning channel" is superseded by this line.

**PvE fleet hulls** render the legacy chevron silhouette (+ its sizes) at hull and blip scale — a fifth silhouette no player class wears, so drone-vs-combatant reads without color. ~~**The Bounty** (Component Patterns) is the one sanctioned exception to sweep-only radar paints.~~ **RETIRED 2026-08-10 (Story 4.6, Eric ruling)** — the bounty carries no radar presence of any kind; there is no sanctioned exception to sweep-only radar paints.

**Torpedoes:** the fish itself is detected at the 3/8 `detect` rung (247.5u — a real combat buff Eric asked for by name, a sibling of `sight` rather than a narrowing of it) and confirmed visually at truesight. **Radar never paints the torpedo — but it does paint its WAKE** (cycle 70, Eric: *"I have decided that I do, in fact, want it to track torpedo wake"*, reversing the earlier ban). `CONFIG.torpedo`'s "never painted by radar" stays true of the fish and only of the fish; the torpedo's wake factor is held at half a ship's so a fish's tell never runs longer than any hull's. Camouflage is by STRUCTURE, not strength: a wake is the same green pixel at the same opacity as the chop around it, and the eye must pick a coherent LINE out of random dots. The materialization treatment (boundary rings + wake, DESIGN · Torpedo) makes detection → sight read as one continuous event. Mines share the detect rung.

**Enemy damage is diegetic only** — wounded ships trail smoke ({colors.wounded-smoke}) above the fog; **no enemy HP bars, ever.** Own damage is HUD-private (HP Rail + shake + vignette).

**Fog/world reads:** fall-of-shot splashes ({colors.splash}) are self-private and gun-family only, so your own misses render at the true impact point even in fog and bracket-and-walk works; the **Hit Call** covers ALL ordnance including mines and carries NO severity channel of any kind — no amount, no hp, no victim id, no kill flag; muzzle flash ({colors.muzzle}) carries to the 5/8 rung and identifies nobody — no shooter id, no hue, no weapon type — so shooting is being seen without being named; fog banks shrink your truesight while hiding you from others'.

## Game Feel & Juice

Carried inventory (current client, kept): directional screen shake on own damage (4→16 px lerped by hit size, exponential decay); 130 ms white hull flash on struck contacts (same-source flashes share the 300 ms floor — aggregate budget applies); amber hit spark vs miss splash ({colors.splash}); crimson expanding sink ring ({colors.damage-marker}); denied-fire 80 ms red pulse on arc + slot, rate-limited; a **33-tone** WebAudio set — tones only, no sound files, mute-aware — grown from the original thirteen as equipment, economy, gunnery and status cues landed (`client/src/audio/tones.ts`; `ToneId` is the register). With the foghorn — a cue with a visual twin but not a synthesized tone — that is **34 audio cues** in total.

Added by decision:

- **Hit Call** — muffled boom + {colors.hit-bloom} bloom through fog: you know you connected, not how badly. It deliberately reaches the SHOOTER beyond sight — a declared exception to the master perception rule, taken so that fog gunnery is a conversation rather than a void. Victims and bystanders keep their existing rules unchanged: there is no "an unseen shooter hit you" cue for anyone else. (The 2026-08-04 rationale of record cited decoy disambiguation; the decoy role was deleted at Story 7-5, and the exception stands on its own terms.)
- **Fall-of-shot** and **muzzle-flash-carries** — see HUD section; feel features that are also information.
- **Wounded smoke** — hurt ships trail it; hurt = trackable. Its reach shares the 5/8 muzzle rung by ruling.
- **Low-HP escalation** — HP Rail threshold colors + accelerating pulse capped at 1.1 Hz (see State Patterns), with its own audio sting.
- **Denied input is never silence** — every refused fire/activation gets its pulse and its tone.
- **Death ritardando** — ~5 s sinking window, hull slows to a stop, guns stay live (go down shooting) → **omniscient reveal**: fog drops, the camera pulls back to the whole ocean, nameplates on every ship including your own wreck → the results modal opens over it. The reveal is the BACKDROP the modal is read against, never a screen of its own held until Enter. It converts losing into learning. Sequence mock: [death-reveal-results-1.html](./mockups/death-reveal-results-1.html) — its middle stage was deleted by ruling; the final frame is the shipped composition.
- **The build must be felt** — every boon lands with audio + hull visual + on-water behavior, or promise + growth is a spreadsheet.
- **No kill-streak spectacle** (Eric ruling 2026-08-21): sinking several ships quickly produces nothing beyond the kill feed and the KILL LEADER throne. The throne IS the whole recognition surface — no toast, no sting, no centre-screen celebration beat. Do not build one absent a new ruling.

**Motion/shake settings override everything in this section**, the death-reveal zoom included.

## Key Flows

Personas are constructed from the brief's audience sketches (no upstream personas exist). Journey A accepted with Beat 6 corrected; Journey B accepted (no objections through Finalize). [ASSUMPTION] Beat prose below reconstructs the accepted skeletons from the log's anchors; wording is not Eric-authored. Both were re-grounded on the shipped build in the 2026-08-21 reconciliation — the beats' *lessons* are unchanged, the mechanisms carrying them are the ones that exist.

### Journey A — "Marco" (13, brand-new, floor-viewport laptop)

1. Direct link → home in under 10 s over the live CIC canvas. It looks *cool*. He types a callsign; the chip reads `SELECT CLASS`, so pressing `SOLO` opens the class bay instead of connecting — no default is ever pushed at him. He takes the pre-focused Torpedo Boat and presses `SOLO`. The queue modal opens: `N/20 QUEUED`, `CANCEL`.
2. The cohort forms and he **boards**: he is already at his real start location on the ring, the whole HUD is live around him, and the tag reads `ALL STATIONS LOCKED`. Nothing answers yet — helm, trigger and scope are all held — so the first thing he learns is where he is starting from, with the telegraph ladder's W/S glyphs and the rudder's A/D sitting there waiting. `MATCH STARTING`, ten seconds, and the ocean comes to life all at once.
3. First minutes: the sweep leaves a faint green speck out at the rim; he turns toward it and it hardens into a blue core as the range closes. Truesight resolves a greyscale chevron drone.
4. He clicks, the Hit Call booms, the drone sinks; the XP Rail wraps and the Banked-Level Chip starts breathing: `LEVEL UP — TAB TO REFIT`.
5. He presses TAB — four cards over the still-running battle. He does not read the tooltips; he presses 2, the boon lands on its slot with a visible change, and the next offer renders in place. TAB again, back to the hunt.
6. **(corrected beat)** A thin green line has been crawling across his scope for a while, coming from nowhere he can see. He reads it as clutter and keeps hunting. It is a wake. The torpedo itself only registers at the detect rung — close, wake astern, inbound. Too late to helm out.
7. Sinking ritardando: five seconds, listing, guns live — he fires his last shells at his killer's smoke.
8. **Climax:** the omniscient reveal opens behind the score screen — fog gone, the whole ocean, every hull named, his own wreck among them. `SUNK`, `9TH OF 14`, two kills, and a MATCH LOG telling him exactly when each of them happened and when he died. He sees the torpedo boat that stalked him and the line he ignored suddenly makes sense. He returns to port and presses `SOLO` again — seconds, not menus. **The lesson is "read the water."**

Failure path *is* the flow: death is the teaching surface, and it costs two presses, zero menus.

### Journey B — "Dee" (WoWS refugee, Mine Layer)

1. Home: she reads the Class Cards — real loadout differences, no grind wall — picks Mine Layer, hoists Rose as her color preference from the bay's wheel.
2. Early game: radar discipline — she hunts by return strength, keeps islands between herself and a Battleship's sweep, and seeds a mine seam across a channel mouth.
3. A Torpedo Boat finds her; she drops a **radar buoy** on the far side of the headland and runs shallow, reading his track through the buoy's relay — the buoy sees what she cannot, and shoots at what it sees.
4. Ring reveal beat: the next ring is known — the hunt must funnel through her channel. She re-seeds the seam on the funnel line and waits, engines at STOP.
5. He takes the bait: his return crosses her seam line.
6. **Climax:** proximity fuse — Hit Call boom, kill feed in their two colors: `SALT SHAKER SUNK BY DEE'S KETTLE`. The trap she authored paid off — the trapper fantasy delivered. The feed is global, so the whole ocean read it.
7. Endgame: the ring settles at two truesight diameters with everything in view; then the collapse begins at 15:00 and there is nowhere left to stand. She places 3rd, reads her results and her match log, and returns to port — about fifteen minutes, zero grind.

Failure path: if the Torpedo Boat spots the seam (mines are confirmed at the detect rung), the trap converts to a chase — islands, her own mines laid behind her, and a buoy left as a watcher are the escape line; being killed routes her through the same reveal-and-requeue as Marco.

*(There is no third journey. The party/friend-group protagonist reserved in 2026-07-16 is DELETED — Eric ruling 2026-08-21: those modes come after beta launch, and the mode row is built to take them when they are actually ruled in. Until then Dee's beats double as the read for the brief's primary 16–35 "design compass" audience.)*

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

Rejected upstream, do not reintroduce: "The helm is the star" guardrail; hex-era "not playful" mood; per-client random colors (screens would disagree). The v0.16 carry-over reference set (buddyboardgames / papergames / openfront) is retired — this table replaced it.

## Responsive & Platform

- **Desktop-only scope.** No touch, no gamepad, no Steam intent.
- **Floor viewport:** 1366×768. It stands on its own terms — NFR7 and UX-DR39 name that viewport directly — and no longer derives from the retired Chromebook premise (Eric ruling 2026-08-21). HUD authored at 1920×1080 reference with the ~1.6× post-playtest register; corner anchors hold at every size.
- **UI scale** 90/100/125% multiplies the HUD ramp (125% gated to viewports ≥1600 px wide); corner anatomy never rearranges (muscle memory is the contract); refit cards never wrap — the 1–4 keys map spatially; no mono type below 9 px post-scale.
- **DOM chrome** (home, results, settings, How-to-Play, privacy policy) centers at {spacing.chrome-max-width} (1100px).
- **The results-screen ad unit** is responsive and sits in the right gutter, with the panel and the unit centred as one group; below the group's breakpoint, or when the slot is blocked, unfilled or unconfigured, the panel stays exactly where it has always been and nothing is drawn (epic-7 amendment 18).
- Canvas fills the window; fog composite rebakes on resize; camera zoom (Z/X + wheel) is the player's own framing lever.

## Monetization & Disclosure Surfaces

Stated here because they are player-facing surfaces this spine previously did not describe.

- **The game is fully playable with ads blocked**, functionally and visually. Nothing waits on an ad callback, and nothing draws an empty box, a bed or a reserved hole when a slot does not fill.
- **One interstitial**, at return-to-port only — an AdSense H5 ad break named for the moment rather than the screen, because "the end of a match" is what makes it a permitted full-screen placement. There is no ad surface of any kind inside a live match.
- **One display unit**, in the right gutter of the score screen, revealed only when Google reports the slot filled. It is created and pushed **exactly once per match** and merely shown/hidden thereafter — ESC toggling the score screen must never mint a fresh impression.
- **Consent** is Google's certified CMP, delivered by the AdSense loader in the document head; the game's own consent card was deleted at Story 7.4. Our own settings keep only a local analytics override, which persists because every return-to-port is a full page load.
- **Premium cosmetic colours are parked** — no hue is gated; monetization ships as advertising only (the colonist.io model *"feels kinda bad"*).

## Resolved question register

The 2026-07-16 spine carried 25 numbered Open Questions. All 25 are closed. Each decision is stated in the body above; this table is the audit trail from the old number to its answer.

| # | Topic | Decision | Source |
|---|---|---|---|
| 1 | Heal-as-upgrade | Heal exists and is **not a card** — the always-available DAMAGE CONTROL rail, digit 5 | epic-2 amendments 58-64, 67 |
| 2 | GDD corrections | Applied GDD-side (4-card offers; "Solo vs AI") | Story 7-6 |
| 3 | Supply drops | Wholly parked; the beat is a structural no-op with zero HUD trace | `shared/src/sim/zone.ts` |
| 4 | Premium cosmetic colours | No hue is gated; monetization ships as advertising only | Story 7-4 |
| 5 | Reference sites | Overtaken — the Inspiration table replaced the v0.16 carry-over set | this document |
| 6 | Island colours | The four-band hypsometric ramp is ratified; the provisional `island-fill`/`island-stroke` tokens are retired | Eric 2026-08-06 / 2026-08-21; DESIGN.md |
| 7 | Storm edge treatment | Solid live ring, dashed next-ring telegraph, low-alpha storm-side fill | epic-3 amendment 14 |
| 8 | Sound-event map | Shipped as `client/src/audio/twinMap.ts`, exhaustive at type level; the two-column contract holds. Residual: a timbre listening pass | Story 4.x |
| 9 | Kill-streak spectacle | **Nothing.** The KILL LEADER throne is the whole recognition surface | Eric 2026-08-21 |
| 10 | `--player-color` CSS var | Not adopted — inline hex via `textSafe()` at each site | `client/src/util/color.ts` |
| 11 | Readiness-pressure indicator | Overtaken by the queue; boarding reads `CAPTAINS BOARDING — n ABOARD`, no denominator | epic-6 amendment 8 |
| 12 | Third journey | **Deleted.** Party modes come after beta launch | Eric 2026-08-21 |
| 13 | Class-card pip values | Real values on absolute anchors: TB 4/2/4 · BS 2/4/2 · ML 3/3/3; the middle row is **ARMOR** | Eric 2026-07-24; epic-7 amendment 35 |
| 14 | Boon copy | Eric's v2 catalog is canon; minimal card face + hover tooltip | epic-7 amendments 20 / 26 |
| 15 | First-run default class | No default is ever pushed; the chip reads `SELECT CLASS`, Torpedo Boat pre-focused | Eric 2026-07-19 / 2026-07-24 |
| 16 | Camera-zoom range | 0.5×–1.5× alive, 0.5×–1.0× spectating; the reveal pull-back is exempt while live | epic-2 amendment 8; epic-5 amendment 25 |
| 17 | Torpedo bridge signal | Closed — the 3/8 detect rung plus the wake's inner bound cover the old `(detect, sight]` dead band | Story 4.9; cycle 70 |
| 18 | 150% UI scale tier | Deferred post-beta; three tiers ship (90/100/125) | `client/src/settings/store.ts` |
| 19 | Key remapping | Deferred post-beta; v1 bindings are fixed | `client/src/settings` |
| 20 | Foghorn key binding | **F** | epic-4 amendment 56 |
| 21 | Per-hue text-safe variant table | No table — `textSafe()` is algorithmic | epic-7 amendment 37 |
| 22 | Nameplate scope | Nameplates on ALL — every truesight combatant hull and every revealed ship; PvE fleet hulls tagged in drone grey | Eric 2026-07-16; UX-DR22 |
| 23 | Whirlpools | Overtaken — deferred by ruling; the systems layer is declared complete | epic-5 amendment 47 |
| 24 | PvE fleet tier legibility | **Size alone is not enough** — a shape mark (rank ticks on the silhouette) carries the tier, so it survives at blip scale where no nameplate exists. Colour is structurally unavailable (fleet hulls are locked greyscale). *Decided 2026-08-21; the render change is in flight, not described here as shipped.* The nameplate keeps its ratified `DRONE`-in-grey grammar | Eric 2026-08-21 |
| 25 | Reveal-zoom motion exemption | **Not exempt.** Motion scales the duration, never the destination | epic-5 amendment 26 |
