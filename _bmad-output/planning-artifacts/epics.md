---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md
  - _bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/epics.md
  - _bmad-output/game-architecture.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/EXPERIENCE.md
---

# Hullcracker.io - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Hullcracker.io, decomposing the requirements from the GDD, UX Design (DESIGN.md + EXPERIENCE.md), and Architecture into implementable stories.

Conflict-resolution notes carried from the source docs (latest decision wins):

- Offers present **4 boon choices** (UX ratification 2026-07-16 supersedes the GDD's earlier "3 upgrades from 3 distinct categories").
- The bot mode is named **"Solo vs AI"** (UX naming supersedes GDD's "Solo vs Bots").
- **Heal-as-upgrade is an open design question** — stories must keep the boon mechanism and ship lifecycle heal-compatible (reversible sinking, `behavior` effect path) without committing either way.
- Numbers throughout are **design targets or prototype reference values, explicitly tunable** (GDD law); acceptance criteria cite them as targets, not contracts.
- **Three-class beta re-scope (2026-07-19, party-mode ratified):** the gunboat is cut; beta roster = Torpedo Boat / Battleship / Mine Layer. TB loadout = torpedo tubes + speed boost (inherited from the cut gunboat); the smoke screen is orphaned to the equipment/boon pool; the Mine Layer's signature ability is OPEN (decoy buoy under rethink; mine mechanics flagged unsettled). Deferred bench: Submarine first, then Carrier; decoy ship and the rest stay banked. (Propagated per `sprint-change-proposal-2026-07-19.md`.)

## Requirements Inventory

### Functional Requirements

**Classes & loadouts (the promise)**

FR1: Three playable classes at beta — Torpedo Boat, Battleship, Mine Layer — each a distinct hull envelope (size, speed, toughness, turning) carrying a fitted loadout. (Gunboat cut 2026-07-19; Submarine → Carrier bench deferred post-playtest.)
FR2: Universal slot grammar on every ship: slot 1 = universal standard gun, slots 2–3 = two class specials (at least one a weapon), slot 4 = extra slot filled mid-match through the upgrade economy.
FR3: The standard gun is identical on every class (short cooldown, basic damage, available most of the time); class differentiation never lives in the gun.
FR4: Class loadouts per GDD: Torpedo Boat = torpedo tubes + speed boost (activated: several seconds of raised speed); Battleship = long-range cannon + star shells; Mine Layer = proximity-fused mines + a signature ability that is OPEN (decoy buoy under rethink, 2026-07-19 — resolved with Eric before Story 1.8). The smoke screen is equipment/boon-pool content, no longer any class's ability.
FR5: Every fitted system implements one Equipment interface (weapon or not) with its own ammo pool and reload/cooldown timer; every timer ticks every tick regardless of selection — switching is tempo, not penalty.
FR6: All weapons fire within real firing arcs; mouse aim is constrained to the selected weapon's arc; per-weapon arc geometry is redesigned for the class era (arcs usable in more situations while rewarding skill).
FR7: Torpedoes outrun every hull at base speed, spawn with real bow clearance plus a brief owner-only grace (never self-hit at base speed), run until they hit something, and are never painted by radar — hydrophones are the torpedo warning.
FR8: Mines arm after a delay, trigger by proximity, and are capped per-player (live-mine cap, oldest evicted) and globally.
FR9: Projectiles, never hitscan: no dispersion (shots go exactly where aimed), no damage falloff, flat single-pool damage (no sectional damage, no crits, no weak points). Gun shells fly to the clicked point or the first obstacle. Precision bonus (bonus damage for striking at the clicked spot, standard gun) is an open design idea to adopt or drop during gun tuning.
FR10: Any deception entity (e.g. the decoy buoy, if the Mine Layer's OPEN signature ability resolves to it) is a real server-side entity whose emitted signals are wire-indistinguishable from a genuine ship's (counter-intel law: lies live on the server). The law binds regardless of which deception feature ships.

**Movement & controls**

FR11: Movement is telegraph-and-helm: 9-detent set-and-forget engine orders plus rudder; per-class acceleration and braking rates; rudder authority reduces below steerage speed.
FR12: Desktop keyboard + mouse only: keyboard for telegraph, weapon-slot selection, and the refit window; mouse for aim-within-arc and click-to-fire. Denied fire or activation (out of arc, no ammo, cooling, empty slot) always gives explicit feedback, never silence.

**Sensors & information (Pillar 1)**

FR13: Universal three-tier sensor suite on every hull: truesight bubble (live, LOS-clear contacts; reference 220 u), rotating radar sweep (reference 650 u / 4 s revolution) painting decaying phosphor blips, and hull microphones (listening ring — bearing-grade audio detection of engines, torpedoes, foghorns).
FR14: Radar blips are class-legible: each blip carries the ship's hull outline (a battleship paints bigger) plus speed and heading; only ships paint on radar; one LOS rule everywhere (observer→point segment must clear all island circles).
FR15: Projectiles materialize at the sight boundary with current position/velocity only — no range-derivable fields on the wire.
FR16: Information-texture signals: fall-of-shot (own splashes visible in fog), the Hit Call (muffled boom + bloom confirming connection, not severity), muzzle flash carries (firing lights the fog beyond truesight), wounded smoke (damaged ships trail smoke above the fog), foghorn emote (one-button broadcast honk heard as a bearing on hull mics; no feed line).
FR17: The Bounty: the kill leader periodically blooms on every player's radar at true position (the one sanctioned non-sweep radar paint) and is worth extra XP; the feed announces the active bounty.

**Upgrade economy (Pillar 3)**

FR18: XP leveling: passive tick (~1 level/minute design target) plus kill-only bonuses — opponent kill = 1 level; PvE fleet kills = ¼ / ⅓ / ½ level by tier (common/uncommon/rare). No damage XP.
FR19: Each level banks an upgrade point carrying a pre-rolled offer of 4 boons from distinct categories, rolled at earn-time on a decorrelated RNG stream; offers never reroll and banked offers never expire.
FR20: Boon catalog v1 is Hades-style: qualitative, build-defining boons (not stat multipliers); the 14 legacy stat upgrades are stripped wholesale. Catalog contents are dedicated design work inside E2.
FR21: Any class-specific ability can appear in boon offers (off-class offers fill or replace the extra slot — a Battleship can grow torpedoes); offer weighting for off-class abilities is open tuning.
FR22: The build must be felt: every boon lands with audio, hull visuals, and on-water behavior.
FR23: Spending: hold-SPACE opens the refit window over the running game; keys 1–4 pick from the current offer; spend is server-authoritative (reject/timeout releases the latch, level stays banked).

**The storm (Pillar 4)**

FR24: Phased storm: three ring groups of ~4 minutes with an internal minute rhythm — (1) clear seas, (2) reserved supply-drop slot (no-op at beta), (3) next ring revealed, (4) ring closes — total closure ~12:00; damage-only (reference 4 hp/s); storm never blinds sensors.
FR25: Endgame Guarantee: the final ring diameter = 2 standard truesight diameters, forcing combat while radar still matters.

**World & arena**

FR26: One circular ocean per match, procedurally generated from a seed; both sides rebuild the map deterministically (the map never travels on the wire); islands block LOS, projectiles, and movement.
FR27: Map size scales from the actual roster at countdown; spawns are outer-ring, max-min mutual distance, island-clear.
FR28: Fog banks: inside one, your truesight shrinks and you vanish from others' truesight (radar may still paint you).
FR29: Rare whirlpools: each ocean is secretly northern or southern hemisphere (N = CCW, S = CW spin); a whirlpool's circular current carries hulls (with = faster, against = slower) and rotates heading; exit any side, no suction; the hemisphere is never revealed except through observation.
FR30: Roving PvE drone fleets in every mode, three tiers (common small / uncommon medium / rare large by HP), armed with a basic gun on long cooldown used only in self-defense — they rove, never hunt, and feed XP per FR18.

**Match lifecycle, modes & lobbies**

FR31: Win = last match participant afloat; the win check counts participants only in every mode — PvE ships are never participants, can never win, and never need to die for the win.
FR32: Sinking window: at 0 HP the ship enters a ~5 s reversible sinking state — hull decelerates (ritardando), guns stay live (go down shooting), inputs restricted to fire/aim; lifecycle is alive → sinking → sunk with sinking → alive reserved (future heal). Provisional win semantics: sinking ships stay win-eligible until fully sunk; later sinker wins; same-tick = draw.
FR33: After sinking: omniscient reveal (fog drops, whole map, camera zooms out, nameplates on every ship) → results modal (kills, placement, time afloat, accrued boons + last offer) → RETURN TO PORT; re-queue happens from home.
FR34: Standard BR lobbies: minimum 2 human captains, fill-or-timer, capped at 20, zero bot-fill — bots never masquerade as players.
FR35: Solo vs AI mode: the lobby fills with AI combatant bots that pick classes and genuinely fight the battle royale; both modes contain PvE fleets; pure quick-play join for both.
FR36: Combat bots consume perception.observe() output only (structurally unable to wallhack), decide via utility AI (hunt/position/strike/evade/storm-avoid), act through the same validated input pipeline as humans, at a staggered ~250 ms observe cadence; PvE drones use a cheaper threat-check tier instead of full observe().
FR37: All non-human ships are driven through the same input pipeline and subject to the same perception rules as human ships — no special code paths.
FR38: Disconnection: the ship keeps simulating under its last input and remains a huntable participant; the player resumes the same ship via token-authenticated reconnection while it is alive/sinking; a sunk ship routes to the post-death flow.

### NonFunctional Requirements

NFR1: 60 FPS sustained on a low-end school Chromebook in a fully populated match — 20 contestants plus PvE fleets, in-flight ordnance, and all E6 effects. Per-epic frame budget on the reference device (Chrome at 4× CPU throttle until a real Chromebook is benched): 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms.
NFR2: Portal click → playable in under ~10 s on that hardware; no install, no account.
NFR3: Authoritative 20 Hz (50 ms) fixed-tick server with client-side prediction (reconcile-and-replay) and ~100 ms snapshot-interpolated contacts; feel intact at ~150 ms residential latency, validated by measurable proxies (hit-registration agreement %, prediction-error bounds) on a simulated-latency harness — never by localhost feel.
NFR4: Structural anti-cheat: everything spatial leaving the server passes the perception boundary — nothing outside sight ∪ this-tick radar paints reaches any client; counter-intel lies are wire-indistinguishable; player intent enters only through validated, finite-checked input messages.
NFR5: Determinism: seeded mulberry32 RNG streams only; no Math.random()/Date.now() in sim code; maps rebuild from seed; the World owns the single server clock (scale-out is more Worlds, never a shared one).
NFR6: Matches complete inside ~15:00 start-to-results (ring fully closed at ~12:00).
NFR7: Desktop browser support: current Chrome, Edge, Firefox, Safari; keyboard + mouse; mobile/touch out of scope.
NFR8: Poki/CrazyGames portal compliance: bundle size limits, SDK integration, ad-break seam at death→requeue — a hard launch gate.
NFR9: Assets are procedural vector linework and synthesized WebAudio tones — no texture, model, or sound-file pipeline.
NFR10: Horizontal scale-out as a deploy-time knob: no single-process assumptions; Presence/Driver injectable (memory → Redis as config); never enable Render autoscaling.
NFR11: PROTOCOL_VERSION gates every wire-contract change; Colyseus schema syncs the roster only — all spatial state travels in per-client frames.
NFR12: Sim purity and layering laws: shared/ is pure and side-free; World/Match keep zero Colyseus imports; cyclomatic complexity ≤ 10 (ESLint error); `npm run check` green is the gate for every ship.
NFR13: Accessibility floor (non-negotiable): dual-coding for class/threat/state meaning (one informed waiver: combatant identity is color-first); every audio cue has a visual twin and vice versa; photosensitivity restraint — breathing glows ≥ 2 s cycles, one-shot pulses 80 ms with a 300 ms same-source floor, HP/storm pulses capped at 1.1 Hz, final-10s ring pulse 1 Hz, aggregate ≤ 3 flashes/s per screen region, no full-screen strobes.
NFR14: Persistence is client-side localStorage only (callsign, settings, class/color preference); no accounts, no server player DB at beta; match telemetry is stdout log lines with zero PII.
NFR15: Observability: structured stdout logging with matchId/roomId/tick context (no hot-path logging beyond throttled aggregates); /metrics HTTP route (rooms, players, tick-duration p50/p95/max, message rates); match.end / match.abort telemetry lines instrumenting class pick/win rates and storm deaths; client perf overlay (FPS, frame-time split, RTT, prediction error, entity counts) in dev builds.
NFR16: Error-handling zones: shared sim never throws (validated upstream); server validates-and-drops malformed input silently and contains tick errors at the room boundary (HC_TICK_ERROR_TOLERANCE: 1 dev / 3 public, graceful room disposal on threshold); client loop never dies (banner + auto-reconnect; render errors skip the frame).
NFR17: Nothing debug ships in the portal build: client dev tools exist only under import.meta.env.DEV; server dev behavior only under HC_DEV_OPTIONS=1.

### Additional Requirements

**From Architecture — sequencing and platform**

AR1: Work item #0 (before E1): the Colyseus 0.16 → 0.17 upgrade — epic work builds on the stabilized 0.17 adapter. The Track-2 hosting move (game server → Colyseus Cloud, client/site → static hosting, Redis-backed Presence/Driver) is a separate, trigger-based item: it happens before the first public/stranger link, at Eric's call — NOT as a prerequisite for epic work. Render remains fine for friends-scale playtests throughout (Eric, 2026-07-17: the game stays playable and hostable-as-is during the whole epic sequence). When the move happens, execute it as one motion so only one new deploy pipeline is ever built.
AR2: 0.17 capabilities to adopt: automatic reconnection (with token-authenticated resume per FR38), QueueRoom matchmaking (D6 — modes are queues; arena logic never forks on mode), transport rate limiting (maxMessagesPerSecond), typed HTTP routes (for /metrics), room.ping() RTT measurement (feeds D1).
AR3: D1 firing under latency: fire commands carry a client timestamp clamped to min(claimed, measured RTT + jitter allowance), hard ceiling 150 ms, never earlier than the previous input; projectiles spawn back-dated along their trajectory (masked by muzzle-flash VFX); hits always resolve against live server state — no victim rewind, ever. Tick stays 20 Hz.
AR4: D2 boon effect model: boons are `{ id, category, effects[] }` in shared CONFIG with exactly two homes — `stat` effects consumed only by effectiveStats(); `slotFill`/`slotReplace` mutating loadout state; `behavior(hookId, params)` executing named hooks implemented once in shared/. Hook purity law: hooks are pure/deterministic and cannot register without sim-parity test coverage.
AR5: D3 signal registry: every spatial signal is one declarative row `{ eventType, visible(), materialize(), counterIntel? }` in server signals.ts; observe() is the only caller; perception invariant tests iterate the registry so a signal cannot exist without coverage; counterIntel rows additionally get wire-indistinguishability tests (payload AND timing — decoys draw from the same RNG/jitter stream as the genuine signal).
AR6: The listening ring is a third perception tier emitting bearing-only events (bearing + sound class; no position, no range-derivable fields), computed in observe().
AR7: Equipment unification: server weapons/ becomes equipment/ — one Equipment interface (id, isWeapon, tick(), activate() → ActivationResult with denial reason) and one registry for guns, torpedoes, mines, smoke, star shells, decoy buoy, speed boost. One-structure law: a ship's loadout IS its equipment runtime (`{ equipmentId, state }` per slot) — no parallel loadout structure. Sinking-state activation is filtered through a single gate (policy value TBD, tied to D4).
AR8: STEP_ORDER as data: world.step() iterates a named step array; new sim steps (sinking deceleration, whirlpool force, PvE roving, bot decisions) are one-line reviewable insertions.
AR9: Ship lifecycle is an explicit shared state machine (lifecycle.ts): `alive | sinking(since) | sunk(at)`, transitions validated in one place, sinking → alive reserved for a future heal; the win predicate in match.ts is one predicate over lifecycle states.
AR10: New shared-sim homes: loadout.ts (slot grammar state), boons.ts (catalog + descriptors), hooks.ts (behavior hook registry), lifecycle.ts, whirlpool.ts; zone.ts evolves to phased rings; map.ts evolves to roster-scaled params + fog banks + whirlpools. Server: signals.ts, ai/ (utility.ts, botDriver.ts, pveFleet.ts), log.ts, metrics.ts, StandardQueueRoom.ts, SoloVsAiQueueRoom.ts. Client: portal/ (adapter + null impl), debug/ (perfOverlay, devTools).
AR11: Portal adapter seam installed NOW (not at E7): `PortalAdapter { init, loadingProgress, matchStart, matchEnd, requestAdBreak }` with a null implementation; game code never imports a portal SDK directly; the death→requeue flow routes through requestAdBreak.
AR12: Test harnesses as infrastructure: the drone-lobby batch-sim harness is triple-duty (economy tuning, pre-launch load test, bot-vs-bot AI evaluation scored on kill distributions/match lengths/storm deaths); a simulated-latency harness (~150 ms + jitter + loss) gates feel; sim-parity property tests are mandatory for every new shared-sim feature; perception-invariant extension is per-signal definition of done.
AR13: No event bus anywhere — server systems communicate through the tick's explicit step order and per-tick event arrays; client keeps one-way data flow (net → sim → render); this absence is a decision.
AR14: Dev-only fog-lift (server-side, HC_DEV_OPTIONS-gated) and dev spectate-all camera; the whirlpool hemisphere secret lives in World state, not the map seed.
AR15: Hidden-information placement rules: whirlpool current math lives in shared sim (own-ship prediction needs it); fog-bank truesight modification integrates with perception; the hemisphere is inferable only through observation.

**From GDD — scope guardrails (bind story scope)**

AR16: Compass vetoes for the new armory: no torpedo variety (one torpedo design per fit), no damage-control parties, no sectional damage.
AR17: Backburnered (designed-for, not built): Hunter class, ~4 consumable slots, supply drops (minute-2 rhythm slot reserved as no-op; zero HUD footprint), sonar tier / active ping, medals (GDD "Silly Is Sanctioned" tone item — backburnered per Eric, 2026-07-17 readiness check). Post-beta: teams/pings, ranked, accounts, cosmetics shop, private lobbies, spectate-others, key remapping, premium colors.
AR18: Committed tuning method: batch-simulate XP tick and kill-bonus outcomes with drone lobbies before human playtests.

### UX Design Requirements

**Design tokens & visual identity (DESIGN.md)**

UX-DR1: Implement the ratified token set as the single styling source: surface colors (void/fog-base/panel/panel-deep/card-scrim/hairline), functional colors (phosphor, phosphor-bright, blip-fresh/faded, amber, storm + storm-readout, info, danger, denied, damage/damage-marker), combat-effect colors (splash, muzzle, torpedo, hit-bloom, wounded-smoke), drone greys, and the 20 Regatta player hues — retiring the v0.16 #111111/#232937 surfaces and consolidating the two reds into `denied` (#FF3B3B).
UX-DR2: Typography system: Geist (display/body) + Geist Mono for every label, readout, and stat — uppercase letter-spaced labels, tabular-nums digits everywhere, the documented size ramp; no mono type below 9 px post-scale.
UX-DR3: Shape register: tactical/HUD rectangles are 0-radius sharp ("Afterimage" floating 1px outlines, no filled panels, water shows through); port chrome (DOM) uses 8/12 px radii; activated abilities are marked by a chamfered top-right corner (shape signal, not color).
UX-DR4: Elevation: no drop shadows — glow encodes state (never decoration) and near-opaque dark-glass scrims are the one sanctioned text bed; Z-order world → fog → chart layer (sweep, blips, arcs, listening ring — renders above refit cards) → Pixi HUD → DOM chrome (feed/toasts 900, modals 1000, menu 1100).
UX-DR5: The storm renders in violet exclusively (#7B2FBE fill + #B06EE8 readout text AND on-water edge stroke — the fill alone fails the 3:1 graphics threshold); purple is never used for anything else.

**Regatta Hoist & silhouettes**

UX-DR6: Personal combatant colors: every human gets a unique hue from the 20-hue wheel, server-assigned match-consistently (color index rides the roster); players pick a preference on home (granted unless contended; contention = fair random draw, losers fall to nearest free hue; UI must never imply claiming/locking); a contended-fallback toast + nameplate reveal in the waiting room.
UX-DR7: Hull treatment: bright personal hue on the outline, same hue at ~45% value as interior fill; propagation = own hull, nameplate, own-blip ring, radar blips + kill-feed names (Variant C default; Variant P phosphor-anonymous build flag kept for playtest swap); ALL HUD chrome stays phosphor-functional; drones always greyscale.
UX-DR8: Reserved bands — amber, the red family, storm violet, and the phosphor green band are never combatant hues; wherever a personal color renders as text it uses a lightened text-safe variant meeting ≥ 4.5:1 (per-hue variant table is an open question; the mechanism is not).
UX-DR9: Class silhouette language: three genuinely distinct top-down silhouettes (Torpedo Boat knife ~9:1; Battleship broadest/stepped, 124 u; Mine Layer widened aft + transom notch, 88 u) + the legacy chevron reserved for PvE drones (a fourth silhouette no player wears); the silhouette IS the hitbox (accepted; decoupling is the named fallback); geometry consistent everywhere a hull appears.
UX-DR10: Blip rendering: outline-only 1px non-scaling stroke at true heading with an arrowhead heading vector; class blips never below 11 px (Battleship 14, Mine Layer 12, boats 11 floor-clamped); Mine Layer notch cut ~3× deep in the blip path only; ≤ 3 decay ghosts per contact (TTL-based); per-hue luminance floor so dark hues render a lightened variant at blip/ghost scale.

**HUD components (Pixi)**

UX-DR11: Hotbar: four 54 px slots in a vertical bottom-left stack, keys Q/E/R/F mapped top-to-bottom (Q gun, E/R specials, F offer slot), with the full documented state grammar — ready weapon / ready ability (+chamfer) / selected (amber outline + inset wash + filled key chip — dual-coded) / cooling (conic perimeter track + seconds) / activated flash (≤ 80 ms) / empty ("— awaiting refit —" dashed) / denied (80 ms red edge pulse + icon flash).
UX-DR12: Hotbar satellites: ammo badge (mono count, top-right overhang, only on systems storing > 1 round), XP rail (3px vertical phosphor fill toward next level, LV tag), banked-level chip (30 px, count, 2.4 s breathing glow decaying to static after ~10 s unspent, re-arming on new bank or Space touch; hidden at zero), "HOLD SPACE TO REFIT" cue line.
UX-DR13: Slot tooltip on hover: name, interaction class, description, and the full accrued-boon list (qualitative Hades-style) — the canonical build-inspection surface; slots compress accrued boons to `◆n` in quick-info.
UX-DR14: Refit window: SPACE is hold-not-toggle (absolute); four 216 px cards side by side in the below-center band (never occluding listening ring or own hull; never wrapping — 1–4 keys map spatially); pick with 1–4 while held; queue pips + dashed ghost edge show waiting offers; hotbar dims to 38% and Q/E/R/F suspend while open, helm stays live; spend-in-flight latch; server rejection = denied pulse on the card, level stays banked; release or last-spend dismisses.
UX-DR15: Own-vitals cluster (bottom-right): HP rail on the cluster's right side mirroring the XP rail (phosphor ≥ 50% → amber < 50% → damage-marker < 25%; opacity-breathing pulse accelerating ~0.5 Hz → hard cap 1.1 Hz at ≤ 10%; `HULL n/n` mono header) + HDG/KTS readouts (mono 22 px) + rudder track + 9-detent telegraph ladder with shape-coded ordered-vs-actual (hollow rung marker vs solid needle — never color alone) and W/S–A/D key glyphs that fade permanently after the first few successful inputs.
UX-DR16: BR Chrome Bar (top-center): `n AFLOAT · n KILLS · T+mm:ss · RING CLOSES m:ss` in restrained mono; ring readout pulses amber at 1 Hz in the final 10 s; no supply-drop reservation.
UX-DR17: Kill feed (top-right, DOM): mono 14 px uppercase, max 5 lines, 6 s TTL, newest on top; vessel names 600-weight in text-safe personal variants, drones grey, connective text secondary; 14-char callsign cap at entry, longer legacy names mid-ellipsize; per-line dark-glass scrim is the sanctioned fallback if feed-vs-blip confusion is confirmed.
UX-DR18: Listening ring: dashed 48-pip compass rose around own ship (~half truesight radius visually); segments light toward noise with brightness ∝ loudness/closeness — pure intensity grammar, deliberately source-ambiguous (never encodes what, only where and how loud); sight is the confirmation channel; renders on the fog-immune chart layer above refit cards.
UX-DR19: Bounty bloom visual: an expanding ring (1 px → 3 px, ~2 s decay) in the leader's personal color around their class blip at true position — visually distinct from sweep paints; feed line "BOUNTY: <NAME>" on activation.
UX-DR20: Torpedo/mine on-water rendering: torpedo hull dash + wake astern in {torpedo}; materialization = pale boundary rings at the sighting point so listening-pips → sight reads as one continuous event; mines render in the same register at truesight.
UX-DR21: Combat effect grammar: miss splash {splash} expanding ring, muzzle flash {muzzle}, Hit Call bloom {hit-bloom}, sink ring {damage-marker} expanding crimson, wounded smoke {wounded-smoke} (never reads as a drone cluster); no phosphor-adjacent greens for effects (a phosphor-ish splash is a fake blip).
UX-DR22: Nameplates on ALL hulls: callsign in hud-micro register floated above every truesight combatant hull and every revealed ship at the omniscient reveal, in the hue's text-safe variant; drones tagged "DRONE" in drone grey; never on blips or radar paints; fade with truesight resolution.
UX-DR23: Toasts: top-center phosphor mono 16 px, 3 s TTL, max 3 stacked, self-events only (level banked, boon fitted, hoist fallback) — never enemy information.
UX-DR24: Enemy damage is diegetic only — wounded smoke, no enemy HP bars ever; own damage is HUD-private (HP rail + shake + vignette).

**Port chrome (DOM)**

UX-DR25: Home page over a live ambient CIC canvas (never blank): wordmark (`.io` in phosphor-bright), callsign field (14-char cap), Class Chip (current pick at a glance), Color Hoist (20 swatches + preference caption), amber Primary Button ("SET SAIL" with mode/class sub-line, Enter equivalent, defers to status line while connecting; failures report plainly on the status line), mode pick (Solo · Solo vs AI), How-to-Play link, server status, settings gear.
UX-DR26: Class-select layer: Class Cards (356 px: name+key, fantasy line, silhouette box, SPEED/TOUGHNESS/TURNING pip scales [placeholder values], loadout slots, pick button; selected = personal-color border/glow) on a horizontal rail with a dashed ghost card ("MORE CLASSES IN DEVELOPMENT") clipped at the edge; keys 1–3/arrows highlight, Enter picks, ESC closes without change; first-run class select pushes no default — three cards, forced meaningful choice, Torpedo Boat pre-focused for keyboard flow (ruled 2026-07-19; closes the old "default Gunboat" proposal).
UX-DR27: Results modal: kills, placement, time afloat, accrued boons + last offer reviewable; single action RETURN TO PORT (amber Primary Button; Enter or ESC) — no re-queue from the modal, no dead spectate button; victory banner phosphor / defeat amber; fullscreen dim behind results only.
UX-DR28: Settings overlay: gear on home AND non-pausing ESC overlay in match (opening mid-fight is the player's risk); doubles as the view-only binding reference; modals never stack.
UX-DR29: How-to-Play page: static DOM page (ESC/back returns home), hosts the boon glossary; Solo vs AI is positioned as the live tutorial; coach marks are pared to this surface.
UX-DR30: Match-flow surfaces: waiting room shows the full live HUD with "AWAITING CAPTAINS n/2" + "WEAPONS SAFE" (weapons genuinely fire, damage suppressed — not a denied state); countdown = "MATCH STARTING" + big center count; disconnect mid-match = banner + return home; failed connection surfaces on the home status line, never a dead screen.

**Input scheme (EXPERIENCE.md — supersedes current bindings)**

UX-DR31: Fixed v1 bindings: Q/E/R/F slots (weapons switch-to, abilities activate immediately), SPACE-hold refit, 1–4 refit picks (a number key's meaning is evaluated against Space's state at its own keydown; for ~150–200 ms after Space release, number keys resolve as refit-or-nothing — never as a future consumable; closed-window spend behavior dies), W/S telegraph taps (±1 detent, hold does not repeat), A/D rudder hold, Z/X + mouse wheel camera zoom (provisional; fog stays server-authoritative — zoom is never an information exploit), mouse aim/click fire, ESC (closes topmost surface, else opens non-pausing settings), Enter (contextual confirm), M mute; foghorn emote specced but unbound (open question). Key remapping deferred post-beta.
UX-DR32: Input hygiene: every bound key preventDefault-ed at a single keydown chokepoint (including Space page-scroll), contextmenu suppressed on canvas; DOM overlay or focused text input suppresses keyboard from the sim while the sim never pauses (typing "wasd" in the callsign field must not steer); P prediction toggle is dev-build only.
UX-DR33: All key glyphs (slot keys, card picks, helm W/S/A/D) render in one mono key-chip family so the scheme reads as one system.

**Accessibility & settings (committed v1)**

UX-DR34: Settings with localStorage persistence: motion/shake tiers full/reduced/off (reduced also halves flash intensity; overrides every juice rule), UI scale 90/100/125% (125% gated to viewports ≥ 1600 px; scales Pixi HUD + DOM HUD elements, port chrome follows browser zoom; 90% exempts the micro type tier from shrinking below 9 px), colorblind assist (family-distinct palette regrouping the 20 hues into ~8 separated families + boosted blip outlines + raised minimum decayed-blip opacity; acceptance: families distinguishable under simulated deuteranopia at blip scale), master + effects volume, mono-audio toggle, mute (M).
UX-DR35: Attention-priority arbitration: Tier 1 threat (pip surges, denied pulses, HP pulse < 25%) always animates; Tier 2 match-state (final-10s ring pulse, storm vignette) holds at lit keyframe while Tier 1 is active; Tier 3 economy (chip breathing, toasts, XP wrap) freezes at dim keyframe while any higher tier is active; only the highest-tier active amber channel pulses.
UX-DR36: The audio system's sound-event map (open deliverable) must ship with a two-column audio-event ↔ visual-twin table; no audio event ships without its row; the 13 existing tones are the template; mono-audio users rely on the listening ring as the visual backstop.

**Game feel (carried + added)**

UX-DR37: Carried juice inventory: directional screen shake on own damage (4→16 px by hit size, exponential decay), 130 ms white hull flash on struck contacts (300 ms same-source floor), amber hit spark vs miss splash, crimson sink ring, denied 80 ms pulse, 13-tone WebAudio set — all mute-aware, all governed by the motion setting.
UX-DR38: Death sequence presentation: ~5 s sinking ritardando (helm accepted but decaying, guns live) → omniscient reveal (fog drops, camera zooms out, nameplates on all; only Enter/click proceeds; BR chrome + kill feed persist, hotbar/XP/chip/vitals/ring die with the hull) → results modal. Whether the reveal zoom is exempt from the motion setting is an open question.

**Responsive**

UX-DR39: Floor viewport 1366×768; HUD authored at 1920×1080 with corner-anchored anatomy that never rearranges (muscle memory is the contract); canvas fills the window; fog composite rebakes on resize; DOM chrome centers at 1100 px max.

### FR Coverage Map

FR1: Epic 1 — Three class hull envelopes
FR2: Epic 1 — Universal slot grammar (gun + 2 specials + economy slot)
FR3: Epic 1 — Universal standard gun
FR4: Epic 1 — Class loadouts (specials + abilities per class)
FR5: Epic 1 — Equipment interface, per-system ammo/reload always ticking
FR6: Epic 1 — Real firing arcs, per-weapon arc redesign
FR7: Epic 1 — Torpedo laws (outrun hulls, bow clearance, owner grace, no radar paint)
FR8: Epic 1 — Mine arming, proximity trigger, caps
FR9: Epic 1 — Projectile combat model (no dispersion/falloff, flat damage, precision-bonus decision)
FR10: Epic 1 — Counter-intel wire-indistinguishability (decoy buoy pending the ML signature-ability resolution)
FR11: Epic 1 — Telegraph-and-helm movement per class envelope
FR12: Epic 1 — Keyboard+mouse combat with explicit denied feedback (full new scheme in Epic 2)
FR13: Epic 4 — Three-tier sensor suite (listening ring is the new tier)
FR14: Epic 4 — Class-legible radar blips (outline + speed + heading)
FR15: Epic 4 — Projectile materialization at sight boundary
FR16: Epic 4 — Information-texture signals (fall-of-shot, hit call, muzzle carries, wounded smoke, foghorn)
FR17: Epic 4 — The Bounty (kill-leader bloom + extra XP)
FR18: Epic 2 — XP tick + kill-only bonuses
FR19: Epic 2 — Pre-rolled 4-boon offers, never reroll, never expire
FR20: Epic 2 — Boon catalog v1, legacy upgrades stripped
FR21: Epic 2 — Off-class abilities in offers (extra-slot fill)
FR22: Epic 2 — The build must be felt (audio/visual/behavior per boon)
FR23: Epic 2 — Hold-Space refit window, server-authoritative spend
FR24: Epic 3 — Phased storm (3×4 min ring groups, minute rhythm)
FR25: Epic 3 — Endgame Guarantee ring (2 truesight diameters)
FR26: Epic 5 — Procedural circular ocean, deterministic from seed
FR27: Epic 6 — Roster-scaled map size at countdown; spawn ring rules
FR28: Epic 5 — Fog banks
FR29: Epic 5 — Hemisphered whirlpools
FR30: Epic 5 — Roving PvE drone fleets, three tiers
FR31: Epic 6 — Participants-only win check in every mode
FR32: Epic 5 — Reversible sinking window (ritardando, guns live)
FR33: Epic 5 — Omniscient reveal → results → return to port
FR34: Epic 6 — Standard BR lobby rules (min 2, fill-or-timer, cap 20, no bot-fill)
FR35: Epic 6 — Solo vs AI mode with combat bots
FR36: Epic 6 — Fair combat bots via observe(); PvE threat-check tier
FR37: Epic 6 — All non-human ships through the same input pipeline
FR38: Epic 0 — Token-authenticated reconnection; disconnected ship keeps simulating (UX polish in Epic 6)

Cross-cutting NFRs (NFR1 frame budget, NFR3 latency proxies, NFR4 anti-cheat, NFR5 determinism, NFR11–NFR13, NFR16–NFR17) bind acceptance criteria in every epic; NFR2/NFR8 concentrate in Epic 7; NFR10/NFR14/NFR15 concentrate in Epic 0.

## Epic List

Sequence: **Epic 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7** — the epics are numbered in execution order, which follows the GDD's ratified sequence (GDD E6 "Information Texture" is this document's Epic 4; GDD E4 "Living Ocean" is Epic 5; GDD E5 "Honest Lobbies" is Epic 6). Sequence rationale: identity and economy first (the spine everything touches), match shape third, then texture, world, modes, launch.

### Epic 0: Stable Ground (Colyseus 0.17 Foundation)
Players keep their match through a wifi hiccup, and every later epic builds on the stabilized 0.17 room/queue/rate-limit substrate. Colyseus 0.16→0.17 upgrade (work item #0), token-authenticated reconnection semantics, structured logging + /metrics foundation, portal-adapter null seam. The Track-2 hosting move is explicitly NOT in this epic (trigger-based, Eric's call, per AR1).
**FRs covered:** FR38 · **Also:** AR1, AR2, AR11, NFR10, NFR15, NFR16

### Epic 1: The Armory
Pick any of three classes and the game feels genuinely different at 0:00 — hull envelope, silhouette, personal color, fitted loadout, and the class-select experience.
**FRs covered:** FR1–FR12 · **Also:** AR3 (D1 fire-time compensation — gun behavior lands here, gated by the simulated-latency harness from AR12; muzzle-flash masking is an Epic 4 tie-in), AR5-foundation (signal-registry conversion is an early Epic 1 story: stand up signals.ts, port existing signals as rows, invariant tests iterate the registry from day one — the decoy story builds on it; Epic 4 then only adds rows), AR7, AR16, UX-DR1–UX-DR10, UX-DR25–UX-DR26
**Interregnum note (party-mode ratified 2026-07-17):** between Epic 1 and Epic 2 the legacy 14-upgrade economy limps along on the new classes — new class stat blocks feed effectiveStats(), legacy upgrades keep multiplying them; ugly, functional, deleted in Epic 2. Spend stays enabled.

### Epic 2: The New Economy (+ New Controls)
Level up mid-match and spend on boons that visibly and audibly change your ship, on the new Q/E/R/F + Space-hold control scheme — with the settings overlay and committed accessibility options.
**FRs covered:** FR18–FR23 · **Also:** AR4, AR18, UX-DR11–UX-DR15, UX-DR23, UX-DR31–UX-DR34
**Story-order rule (party-mode ratified 2026-07-17):** controls + settings stories are front-loaded — the input scheme and settings overlay are fully designed (ratified mocks) while the boon catalog is dedicated design work; a catalog stall must never block the ratified control scheme.

### Epic 3: The Ring
A full match has its designed pacing arc: three legible ring groups with a minute rhythm, closing at ~12:00 to the Endgame Guarantee ring.
**FRs covered:** FR24–FR25 · **Also:** UX-DR16

### Epic 4: Information Texture *(GDD E6)*
Fights at radar range are readable, trackable dramas instead of silent HP exchanges: listening ring, hit call, fall-of-shot, muzzle carries, wounded smoke, foghorn, the Bounty, class-legible blips — all through the signal registry.
**FRs covered:** FR13–FR17 · **Also:** AR5 (registry rows — the registry itself lands in Epic 1), AR6, UX-DR18–UX-DR22, UX-DR24, UX-DR35–UX-DR37

### Epic 5: The Living Ocean *(GDD E4)*
The water itself creates stories — fog banks, hemisphered whirlpools, huntable PvE fleets — and dying becomes learning: sinking window, omniscient reveal, results.
**FRs covered:** FR26, FR28–FR30, FR32–FR33 · **Also:** AR8, AR9, AR14, AR15, UX-DR27, UX-DR38

### Epic 6: Honest Lobbies & Modes *(GDD E5)*
Two real modes with honest matches: no bot-fill, min-2 fill-or-timer, cap 20, roster-scaled maps, Solo vs AI with real combat bots, queue-liveness menu, reconnection UX.
**FRs covered:** FR27, FR31, FR34–FR37 · **Also:** AR2 (QueueRooms), UX-DR25 (mode pick + queue liveness)

### Epic 7: Portal Launch Readiness
The beta, live on a portal: Chromebook 60 FPS in a fully populated match, <10 s load, Poki/CrazyGames SDK behind the seam, How-to-Play page, DESIGN.md real-time-era refresh.
**FRs covered:** — (hardens NFR1, NFR2, NFR7, NFR8, NFR9) · **Also:** AR11 (SDK implementations), AR17, UX-DR29, UX-DR39

## Epic 0: Stable Ground (Colyseus 0.17 Foundation)

Players keep their match through a wifi hiccup, and every later epic builds on the stabilized 0.17 room/queue/rate-limit substrate. The Track-2 hosting move is explicitly not in this epic — it is trigger-based ("before the first public/stranger link"), at Eric's call.

### Story 0.1: Colyseus 0.17 Upgrade

As a captain,
I want the game running on Colyseus 0.17 with transport-level input rate limiting,
So that my matches sit on a current, supported networking layer and later features (queues, reconnection) are possible at all.

**Acceptance Criteria:**

**Given** the v0.16 codebase with its thin `ArenaRoom` adapter
**When** server and client are upgraded to Colyseus 0.17.x / colyseus.js 0.17.x
**Then** `npm run check` passes (all workspaces, all tests) and every headless smoke in `server/scripts/` completes over real sockets
**And** `World`/`Match` remain untouched (zero Colyseus imports — the migration is contained to the adapter layer)
**And** `maxMessagesPerSecond` rate limiting is enabled with a CONFIG-declared limit that normal play (including held rudder + rapid fire) never trips
**And** a full local match (join → countdown → live → win) plays end-to-end against the 0.17 server.

### Story 0.2: Reconnect Into Your Own Ship

As a captain on flaky school wifi,
I want a dropped connection to resume into my still-live ship,
So that a hiccup isn't a death sentence and my match survives.

**Acceptance Criteria:**

**Given** a live match in which my client disconnects
**When** the server detects the drop
**Then** my ship keeps being simulated under its last input (telegraph order held — it does not freeze) and remains a visible, huntable participant
**And** the win check still counts it while its lifecycle is alive/sinking (FR38)

**Given** my client reconnects within the grace window
**When** resumption is attempted
**Then** it succeeds only with the 0.17 reconnection token — a guessable or replayable session id can never seize the ship
**And** I resume control of the same ship with state listeners intact

**Given** my ship was sunk while I was away
**When** I reconnect
**Then** I land in the post-death flow (reveal → results), same as any death.

### Story 0.3: Server Operability Baseline

As the operator (Eric),
I want structured logs, a metrics route, and a contained tick-error boundary,
So that when the traffic spike arrives, a dead match is a bug report instead of a shrug.

**Acceptance Criteria:**

**Given** the server is running
**When** any match lifecycle event occurs
**Then** one structured `info` line (`level event {fields}`) with matchId/roomId/tick context goes to stdout — and nothing logs inside per-tick loops except throttled aggregates

**Given** a match ends or aborts
**When** the lifecycle hook fires
**Then** `match.end` carries `{matchId, mode, rosterSize, rosterByClass, durationS, winnerClass, killsByClass, stormDeaths}` and `match.abort` carries `{matchId, reason, tick}` — zero PII

**Given** `World.step()` throws
**When** the room's tick boundary catches it
**Then** the error is logged with context, and at `HC_TICK_ERROR_TOLERANCE` consecutive failures (default 1 dev / 3 public) the room disposes gracefully (players → banner → menu) while the process and other rooms survive

**Given** an operator hits `/metrics`
**Then** it returns room/player counts, tick-duration p50/p95/max, and message rates via a 0.17 typed route.

### Story 0.4: Portal Adapter Seam (Null Implementation)

As the future launch engineer,
I want a `PortalAdapter` interface with a null implementation wired through loading and the death→requeue flow now,
So that portal SDKs land at Epic 7 behind an existing seam instead of a retrofit.

**Acceptance Criteria:**

**Given** the client boots
**When** loading progresses and matches start/end
**Then** all these moments route through the `PortalAdapter` interface (`init`, `loadingProgress`, `matchStart`, `matchEnd`, `requestAdBreak`) backed by `nullAdapter.ts`
**And** the death→requeue flow calls `requestAdBreak()` (a no-op today)
**And** no game code imports any portal SDK directly (there is none to import yet — the seam is the rule).

## Epic 1: The Armory

Pick any of three classes and the game feels genuinely different at 0:00 — hull envelope, silhouette, personal color, fitted loadout, and the class-select experience. Foundations land first: signal registry, equipment interface, hull envelopes, then the gun, D1, three class loadouts, arcs, and visual identity.

### Story 1.1: Signal Registry Foundation

As a captain,
I want every spatial signal I receive to flow through one declarative perception registry,
So that the fog of war can never silently leak — now or in any later epic.

**Acceptance Criteria:**

**Given** the existing perception system (contacts, blips, shell/boom/damage events)
**When** `server/src/game/signals.ts` is introduced with `SignalSpec` rows (`eventType`, `visible()`, `materialize()`, `counterIntel?`) and every existing signal is ported to a row
**Then** `observe()` iterates `SIGNAL_REGISTRY` as the only caller of `visible`/`materialize`, and `frames.ts` remains the sole spatial exit
**And** the perception invariant suite iterates the registry so a signal without a passing invariant case fails CI by construction
**And** all existing perception tests stay green with byte-identical wire output (pure refactor — no behavior change)
**And** adding a future signal requires exactly one registry row plus its test case.

### Story 1.2: Equipment Interface & Loadout Slots

As a captain,
I want my ship's fitted systems unified as slotted equipment,
So that guns, torpedoes, mines, and every future ability share one grammar my loadout is built from.

**Acceptance Criteria:**

**Given** the current `weapons/` systems (gun, torpedo, mine)
**When** they are ported to `equipment/` implementing one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason) and ships gain `loadout` slot state (`{ equipmentId, state }` per slot — the one-structure law, in `shared/src/sim/loadout.ts`)
**Then** all three existing systems fire, reload, and deny exactly as before (existing tests green; `combat.ts` compat re-export retained)
**And** every fitted system's reload/cooldown ticks every tick regardless of selection (FR5)
**And** slot activation routes through a single sinking-activation gate point (a passthrough until Epic 5 introduces the sinking state; policy value stays TBD per D4)
**And** the slot grammar supports 4 slots (gun / special / special / extra) with the extra slot empty-capable (FR2 plumbing — contents arrive in later stories).

### Story 1.3: Three Hull Envelopes

As a captain,
I want three classes with genuinely different hulls — size, speed, toughness, turning,
So that my lobby pick changes how the ship feels the moment I sail.

**Acceptance Criteria:**

**Given** CONFIG's current three prototype classes
**When** Torpedo Boat, Battleship, and Mine Layer envelopes replace them (hull dims per the ratified silhouette board: TB ~9:1 at 100 u, BB 124 u, ML 88 u; per-class speed/accel/braking/turn/HP as design-target values in CONFIG)
**Then** `effectiveStats()` produces a complete stat block for each class and each hull's shared silhouette geometry IS its hitbox (UX-DR9; geometry lives in shared/ so server collision and client render can never disagree)
**And** all three classes are pickable and sailable end-to-end with the existing menu extended minimally (full class-select chrome arrives in Story 1.14)
**And** the legacy 14-upgrade economy keeps functioning against the new class stat blocks (the ratified interregnum — spend stays enabled until Epic 2)
**And** the island-stuck collision bug (GDD playtest finding #64) is fixed and covered by a regression test
**And** kinematics remain shared-sim pure (prediction parity holds at the same 50 ms dt).

### Story 1.4: Universal Standard Gun (carries the precision-bonus decision)

As a captain of any class,
I want the same standard gun on every hull,
So that class identity lives in the specials while I always have a baseline weapon.

**Acceptance Criteria:**

**Given** the three classes of Story 1.3
**When** the universal gun is tuned (short cooldown, basic damage — design-target numbers into CONFIG)
**Then** every class fires the byte-identical gun (FR3) — no per-class gun stats anywhere
**And** shells fly with travel time to the clicked point or first obstacle, with no dispersion and no damage falloff (FR9)
**And** the precision-bonus open idea (bonus damage at the exact clicked spot) is resolved WITH ERIC during this story — adopted with its rule documented in CONFIG, or dropped with the GDD note closed; whether gun-type specials qualify is decided at the same time
**And** damage applies to a single hull pool (flat model — no sections, no crits; AR16).

### Story 1.5: Firing Under Latency (D1) + Latency Harness

As a captain on a 150 ms connection,
I want my shots resolved without an input-delay penalty and without rewind kills,
So that gunnery feels fair at real-world latency and the Narrow Escape is never retroactively undone.

**Acceptance Criteria:**

**Given** a fire command carrying a client timestamp
**When** `inputs.ts` validates it
**Then** the timestamp is clamped to `min(claimed, server-measured RTT + jitter allowance)` via `room.ping()`, never earlier than the previous input, hard ceiling 150 ms — a client claiming more latency than it has gets its measured reality
**And** the projectile spawns back-dated along its trajectory by the validated latency, and hits always resolve against live server state (no victim rewind, ever)
**And** torpedoes/mines follow the same spawn rule

**Given** the new simulated-latency harness (`server/scripts/latencyHarness.mjs`, ~150 ms + jitter + loss)
**When** it drives full matches
**Then** it reports hit-registration agreement % and prediction-error bounds, and those metrics — not localhost feel — are the acceptance gate (NFR3).

### Story 1.6: Torpedo Boat Loadout (carries the boost × torpedo ruling)

As a Torpedo Boat captain,
I want torpedo tubes and a speed boost,
So that I can thread skill-shots through terrain and outrun the answer.

**Acceptance Criteria:**

**Given** the equipment registry
**When** torpedo tubes (special 1) and the speed boost (special 2, activated: several seconds of raised speed — inherited from the cut gunboat, ruled 2026-07-19) are fitted to the Torpedo Boat
**Then** torpedoes obey all FR7 laws (outrun every hull at base speed, real bow clearance, owner-only grace — a self-hit at base speed is impossible, covered by test) and are never painted by radar
**And** the speed boost implements `Equipment` with its own cooldown, applying through `effectiveStats()`/shared hooks so prediction survives the speed change; boost state is visible to the owner (slot cooling state) and produces no wire field revealing it to enemies beyond observed kinematics
**And** the boost × torpedo interaction is resolved WITH ERIC during this story (FR7 guarantees no self-hit at *base* speed only — whether a boosted TB can catch its own fish, and the rule if so, is a design decision), with the ruling covered by test
**And** a solo playtest run confirms the fantasy: tubes + boost + the 9:1 hull play distinctly from every other class.

### Story 1.7: Battleship Loadout

As a Battleship captain,
I want long-range artillery and star shells,
So that I dominate open water from beyond the reply and can light the dark when prey hides.

**Acceptance Criteria:**

**Given** the equipment registry
**When** the long-range cannon (special 1) and star shells (special 2) are fitted to the Battleship
**Then** the cannon out-ranges the standard gun with its own ammo/reload/arc (CONFIG design targets) and shells still obey FR9 flight rules
**And** a star shell fired into fog illuminates a temporary area — ships inside it become visible contacts to the firer's side via a registry row with its own invariant case (never revealing beyond the illuminated zone)
**And** the illumination is time-limited and its area/duration are CONFIG design targets
**And** a solo playtest run confirms the fantasy: long-range artillery + star shells + the fortress hull play distinctly from every other class.

### Story 1.8: Mine Layer Loadout (carries the signature-ability + mine-mechanics decisions)

As a Mine Layer captain,
I want proximity mines and a signature ability worthy of the trapper,
So that I can author traps and lies — and the wire itself can't rat me out.

**Acceptance Criteria:**

**Given** the Mine Layer's signature ability is OPEN (decoy buoy under rethink; candidates banked in the 2026-07-19 session: mine+buoy shared radar signature, sonobuoy) and mine mechanics are themselves flagged unsettled
**When** this story begins
**Then** both are resolved WITH ERIC before implementation, and the GDD notes are closed with the choices

**Given** the equipment registry and the resolved designs
**When** proximity-fused mines (special 1) and the resolved signature ability (special 2) are fitted to the Mine Layer
**Then** mines arm after a delay, trigger by proximity, respect the per-player live cap (oldest evicted) and global cap (FR8), and render at ~truesight per UX-DR20
**And** if the resolution is the decoy buoy: the buoy is a real World entity whose radar paints reuse the genuine blip signal's `materialize` AND draw from the same RNG/jitter stream (temporal indistinguishability); wire-indistinguishability tests prove a serialized decoy blip is identical to a real ship blip field-for-field modulo position (FR10; the registry row is marked `counterIntel`); and shooting a decoy's position produces no Hit Call — interaction is the sanctioned disambiguation oracle (documented as intended counterplay). Any deception alternative binds to the same counter-intel law (FR10)
**And** a solo playtest run confirms the fantasy: mines + the signature ability + the stern-weapon hull play distinctly from every other class.

### Story 1.9: Gunboat Loadout — REMOVED (2026-07-19 re-scope)

The gunboat is cut from the beta roster (party-mode addendum, 2026-07-19, Eric-ratified). Its speed boost migrated to the Torpedo Boat loadout (Story 1.6); the AP-gun form question was deleted with the class. The story number is retired, not reused — later stories keep their numbers so existing cross-references stay valid.

### Story 1.10: Firing Arcs for the Class Era

As a captain,
I want every weapon's firing arc redesigned for its class role,
So that I can use my weapons in more situations while positioning still rewards skill.

**Acceptance Criteria:**

**Given** all seven fitted systems from Stories 1.4–1.8
**When** per-weapon arc geometry is designed (with Eric — arc values are design decisions) and set in CONFIG
**Then** mouse aim is constrained to the selected weapon's real arc, and every arc renders on aim exactly as the weapon fires it
**And** denied fire (out of arc, no ammo, cooling) always produces the explicit denied feedback — never silence (FR12; the full new input scheme lands in Epic 2)
**And** the Mine Layer's stern-facing deployment matches its "the stern is the weapon" silhouette rationale.

### Story 1.11: Design Tokens & Typography

As a captain,
I want the ratified token palette and type system as the single styling source,
So that the game stops wearing prototype colors and every number sits still.

**Acceptance Criteria:**

**Given** DESIGN.md's frontmatter tokens
**When** the token set is implemented as the single styling source (client: CLIENT_CONFIG/CSS custom properties — surfaces, functional colors, combat-effect colors, drone greys, the 20 Regatta hues; both reds consolidated into `denied`)
**Then** no hex value outside the token source remains in client styling code (UX-DR1), and the deprecated #111111/#232937 surfaces are gone
**And** the typography system lands with the tokens: Geist display/body + Geist Mono for every label, readout, and stat — uppercase letter-spaced labels, `tabular-nums` digits, the documented ramp (UX-DR2)
**And** the deliverable is styling-only: no gameplay or wire change rides along (the Regatta system lands next).

### Story 1.12: The Regatta Hoist

As a captain,
I want my personal color flying on my hull and my name colored in the feed,
So that every screen agrees who I am across the whole match.

**Acceptance Criteria:**

**Given** the token set of Story 1.11
**When** the Regatta Hoist system lands
**Then** the server assigns each human a unique hue at match start (preference granted unless contended; contention = fair random draw, losers to nearest free hue), with the color index riding the roster so every screen agrees (UX-DR6)
**And** hulls render personal hue on the outline with ~45%-value interior fill; drones stay greyscale; HUD chrome stays phosphor-functional (UX-DR7)
**And** amber/red/storm-violet/phosphor-green bands are never assigned as combatant hues, and personal-color-as-text renders via the lightened text-safe variant mechanism at 4.5:1 or better (UX-DR8)
**And** the kill feed restyles to the ratified spec: mono 14 px uppercase top-right, max 5 lines / 6 s TTL, vessel names 600-weight in their text-safe personal variants, drones grey, connective text secondary, long legacy names mid-ellipsized (UX-DR17).

### Story 1.13: Class Silhouettes on the Water

As a captain,
I want each class drawn as its ratified silhouette,
So that class reads by shape alone — on my hull, on enemies, and (come Epic 4) on blips.

**Acceptance Criteria:**

**Given** the shared silhouette geometry from Story 1.3
**When** the client renders hulls
**Then** all three classes draw at identity-board geometry in the shared linework language, consistent everywhere a hull appears (water, class card, results)
**And** PvE drones keep the legacy chevron verbatim — a fourth silhouette no player class wears (UX-DR9)
**And** every truesight combatant hull wears its nameplate: callsign in the hud-micro register, personal color as its text-safe variant, drones tagged "DRONE" in drone grey; never on blips or radar paints; fading with truesight resolution (UX-DR22's truesight scope — the reveal scope lands in Story 5.3)
**And** rendered silhouette and server hitbox derive from the same shared geometry (the "silhouette IS the hitbox" contract holds by construction).

### Story 1.14: Home & Class-Select Chrome

As a new player,
I want the home page and class-select layer from the ratified mocks,
So that one glance tells me what I'll sail and SET SAIL is one press away.

**Acceptance Criteria:**

**Given** the ratified home mock (`home-class-picker-1.html`)
**When** the DOM chrome is rebuilt
**Then** home renders over the live ambient CIC canvas with wordmark, callsign field (14-char cap), Class Chip, Color Hoist (20 swatches, preference caption — never implying claim/lock), amber Primary Button with mode/class sub-line, How-to-Play link, server status, settings gear (UX-DR25)
**And** the class-select layer shows the three Class Cards on a horizontal rail (silhouette box, fantasy line, SPEED/TOUGHNESS/TURNING pips with values derived from Story 1.3's CONFIG envelopes — real numbers, not placeholders; Eric wants pips as a balancing aid (resolves UX open question #13), loadout slots) plus the dashed ghost card; keys 1–3/arrows highlight, Enter picks, ESC closes without change (UX-DR26)
**And** first-run class select pushes no default — three cards, forced meaningful choice, with the Torpedo Boat card pre-focused for keyboard flow (ruled 2026-07-19)
**And** connection failure reports plainly on the status line, never a dead screen.

## Epic 2: The New Economy (+ New Controls)

Level up mid-match and spend on boons that visibly and audibly change your ship, on the new Q/E/R/F + Space-hold control scheme — with the settings overlay and committed accessibility options. Story-order rule: controls + settings (2.1–2.4, fully designed) are front-loaded; the design-heavy boon work (2.5–2.10) follows, so a catalog stall can never block the ratified scheme.

### Story 2.1: The New Input Scheme

As a captain,
I want the Q/E/R/F + Space-hold control scheme with clean browser hygiene,
So that my left hand helms, my right hand fights, and no keypress ever betrays me.

**Acceptance Criteria:**

**Given** the current 1/2/3 weapon keys and CTRL spend chord
**When** the fixed v1 bindings replace them
**Then** Q/E/R/F map to the four slots top-to-bottom (weapons switch-to, abilities activate immediately), W/S taps step the telegraph ±1 detent (hold does not repeat), A/D holds the rudder, Z/X + wheel zoom the camera, ESC closes the topmost surface (else opens settings), Enter confirms contextually, M mutes (UX-DR31)
**And** SPACE-hold governs the refit window (hold opens, release dismisses — no toggle option exists); while held, Q/E/R/F are suspended and the helm stays live
**And** a number key's meaning is evaluated against Space's state at its own keydown; for ~150–200 ms after Space release, number keys resolve as refit-or-nothing — the closed-window spend behavior is deleted
**And** every bound key is preventDefault-ed at a single keydown chokepoint (including Space page-scroll), contextmenu is suppressed on the canvas, and a focused DOM overlay or text input suppresses keyboard from the sim while the sim never pauses (typing "wasd" in the callsign field steers nothing) (UX-DR32)
**And** all key glyphs render in the one mono key-chip family (UX-DR33).

### Story 2.2: The Hotbar

As a captain,
I want four hotbar slots that show my whole fit at a glance,
So that ready/selected/cooling/denied state is legible mid-knife-fight.

**Acceptance Criteria:**

**Given** the loadout of Epic 1 and the keys of Story 2.1
**When** the bottom-left hotbar renders
**Then** four 54 px Afterimage slots (1px outline, transparent fill, water shows through) stack vertically with key glyphs, name + quick-info labels — and the full state grammar: ready weapon (soft phosphor), ready ability (brighter + chamfer), selected (amber outline + inset wash + filled key chip — dual-coded), cooling (dimmed icon, conic perimeter track, seconds readout), activated flash (one ≤ 80 ms phosphor pop), empty ("— awaiting refit —" dashed), denied (80 ms red edge pulse + icon flash) (UX-DR11)
**And** the ammo badge appears only on systems storing > 1 round, counting down on fire and up on reload (UX-DR12)
**And** the slot tooltip on hover shows name, interaction class, description, and the full accrued-boon list; slots compress accrued boons to `◆n` in quick-info (UX-DR13)
**And** with zero accrued boons the tooltip renders absence — no divider, no placeholder rows (cold states render as absence, not placeholders)
**And** reload progress ticks on every slot regardless of selection.

### Story 2.3: Settings & Accessibility Options

As any player — including colorblind, motion-sensitive, and hard-of-hearing captains,
I want the committed v1 settings persisted locally,
So that the game meets me where I am without an account.

**Acceptance Criteria:**

**Given** the settings surface (gear on home AND non-pausing ESC overlay in match; modals never stack)
**When** settings are changed
**Then** motion/shake (full/reduced/off — reduced halves flash intensity; overrides every juice rule), UI scale (90/100/125%, 125% gated to viewports ≥ 1600 px, scaling Pixi HUD + DOM HUD while port chrome follows browser zoom, no mono type below 9 px post-scale), colorblind assist (family-distinct palette regrouping the 20 hues into ~8 separated families + boosted blip outlines + raised minimum decayed-blip opacity), master/effects volume, mono-audio, and mute all take effect live and persist in localStorage (UX-DR34)
**And** colorblind-assist acceptance: color families distinguishable under simulated deuteranopia at blip scale
**And** the overlay lists all bindings view-only (the scheme's in-match self-documentation) (UX-DR28)
**And** no accessibility setting is reachable only mid-match.

### Story 2.4: Own-Vitals Cluster & Telegraph Restyle

As a captain,
I want my HP, heading, speed, rudder, and telegraph in the ratified Afterimage register,
So that my own state reads in one glance without a cheap panel in sight.

**Acceptance Criteria:**

**Given** the v2 composite mock
**When** the bottom-right cluster renders
**Then** the HP rail climbs the cluster's right side mirroring the XP rail (phosphor ≥ 50% → amber < 50% → damage-marker < 25%; opacity-breathing pulse accelerating from ~0.5 Hz, hard-capped at 1.1 Hz; `HULL n/n` mono header) (UX-DR15)
**And** HDG/KTS render mono 22 px tabular with muted unit suffixes, the rudder track shows the amber position tick, and the 9-detent telegraph ladder shape-codes ordered-vs-actual (hollow rung marker vs solid needle — never color alone)
**And** W/S and A/D key glyphs sit at the gauge extremes and fade permanently after the first few successful inputs
**And** no filled panel appears behind any of it — floating linework only.

### Story 2.5: Boon Effect Engine (Two Homes + Hooks)

As a captain,
I want boon effects applied through exactly two mechanisms,
So that any future catalog — including a heal — works on both sides without prediction desync.

**Acceptance Criteria:**

**Given** `shared/src/sim/boons.ts` (catalog + `BoonEffect` descriptors) and `hooks.ts` (behavior hook registry)
**When** a boon is applied to a ship
**Then** `stat` effects flow only through `effectiveStats()`, `slotFill`/`slotReplace` effects mutate loadout slot state in the one structure, and `behavior(hookId, params)` effects execute named hooks implemented once in shared/ (AR4)
**And** the sim-parity property suite iterates `HOOK_REGISTRY` — a hook cannot be registered without parity coverage (the hook purity law)
**And** test boons exercising all four effect kinds prove the engine end-to-end (catalog contents arrive in Story 2.7)
**And** applying a boon touches no path outside these two homes.

### Story 2.6: XP Tick & Kill Bonuses

As a captain,
I want to level passively every minute and faster through kills,
So that I always grow — and hunting grows me faster.

**Acceptance Criteria:**

**Given** a live match
**When** time passes and kills land
**Then** passive XP accrues at ~1 level/minute (CONFIG design target), an opponent kill grants 1 full level, and PvE tier fractions (¼/⅓/½) are wired as CONFIG hooks (fleets themselves arrive in Epic 5) — damage grants zero XP (FR18)
**And** each level-up banks a point, wraps the XP rail, increments the banked-level chip (breathing 2.4 s, decaying to static after ~10 s, re-arming on new bank or Space touch, hidden at zero), and fires a toast (UX-DR12, UX-DR23)
**And** XP/level/bank state is self-private on the wire (never rides on contacts)
**And** the "1 LEVEL BANKED / HOLD SPACE TO REFIT" cue line appears with the chip.

### Story 2.7: Offers — Roll, Bank, Spend

As a captain,
I want each banked level to carry a pre-rolled 4-boon offer I spend in the refit window,
So that my build grows mid-fight on my schedule, and the offer never lies to me.

**Acceptance Criteria:**

**Given** a level banking
**When** the offer is rolled
**Then** it contains 4 boons from distinct categories, rolled at earn-time on the decorrelated RNG stream — reopening never rerolls, and banked offers never expire (FR19)
**And** holding SPACE shows the four 216 px refit cards in the below-center band (never occluding listening ring or own hull; never wrapping), with queue pips + dashed ghost edge for waiting offers; the hotbar dims to 38% (UX-DR14)
**And** pressing 1–4 while held spends server-authoritatively: the latch dims cards in flight; on reject/timeout the latch releases with the denied pulse and the level stays banked (FR23)
**And** spending the last banked level closes the window; release always closes it
**And** the whole flow works with test boons before the real catalog lands.

### Story 2.8: Boon Catalog v1 (dedicated design work with Eric)

As a captain,
I want a catalog of qualitative, build-defining boons — including every class ability as an off-class offer,
So that my promise grows into a build that's mine, and the legacy stat-stacks die.

**Acceptance Criteria:**

**Given** the boon engine (2.5) and offer flow (2.7)
**When** catalog v1 is designed WITH ERIC (contents are game-design decisions — categories, names, effects, off-class weighting) and implemented as data in `BOON_CATALOG`
**Then** boons are Hades-style qualitative changes (not stat multipliers), every class-specific ability appears in the offer pool filling/replacing the extra slot (FR21) — including the smoke screen, orphaned from the Torpedo Boat as pool content (2026-07-19) — and off-class weighting is a CONFIG tunable; catalog scope covers the three beta kits and follows the GDD's Hades-hammer model (slot-mapped choices, slot-4 equipment logic, variant mutations as upgrades never starting kit; the GDD's stat-vs-qualitative tension is settled during this story)
**And** the 14 legacy stat upgrades are stripped wholesale — the interregnum ends here (FR20)
**And** the heal question stays open: the catalog neither includes nor forecloses a heal (the `behavior` path and reversible lifecycle already accommodate one)
**And** all boon copy is drafted (placeholder copy from mocks is not canon) and the boon glossary content exists for the How-to-Play page (Epic 7 surfaces it).

### Story 2.9: The Build Must Be Felt

As a captain,
I want every boon to land with audio, hull visuals, and on-water behavior,
So that promise + growth is a ship changing — not a spreadsheet.

**Acceptance Criteria:**

**Given** any boon in catalog v1
**When** it is fitted
**Then** it produces an audible cue (WebAudio, mute-aware), a visible hull/slot change, and its behavioral effect on the water (FR22)
**And** the slot tooltip's accrued-boon list reflects it immediately (`◆ Name` + effect line)
**And** a fit-check pass over the full catalog confirms no boon is presentation-silent
**And** enemy builds stay invisible: nothing about another ship's boons rides the wire beyond observable behavior (upgrade events remain self-private).

### Story 2.10: Economy Batch-Sim Harness

As the designer (Eric),
I want drone-lobby batch simulations of the XP economy,
So that tick and kill-bonus tuning is evidence, not vibes — before any human playtest.

**Acceptance Criteria:**

**Given** `server/scripts/batchSim.mjs` (the triple-duty harness's first duty)
**When** it runs headless drone lobbies over the real sim
**Then** it reports level curves, kill-bonus distributions, and time-to-N-boons across match lengths for tunable CONFIG inputs (AR18)
**And** runs are seeded and reproducible (NFR5)
**And** its output directly informs at least one committed tuning pass of FR18's values before the first human playtest
**And** the harness structure leaves clean seams for its later duties (load test, bot-vs-bot evaluation).

## Epic 3: The Ring

A full match has its designed pacing arc: three legible ring groups with a minute rhythm, closing at ~12:00 to the Endgame Guarantee ring.

### Story 3.1: Phased Zone Timeline

As a captain,
I want the storm to close in three legible ring groups instead of one continuous shrink,
So that every match has the designed rhythm: hunt, plan, run, fight.

**Acceptance Criteria:**

**Given** the current single-shrink zone in `shared/src/sim/zone.ts`
**When** the phased timeline replaces it
**Then** three ring groups of ~4 minutes each run the minute rhythm — (1) clear seas, (2) reserved supply-drop slot (a structural no-op with zero HUD footprint), (3) next ring revealed, (4) ring closes — reaching full closure at ~12:00 (all values CONFIG design targets)
**And** the storm deals damage only (reference 4 hp/s) and never blinds any sensor tier (FR24)
**And** the timeline is pure shared sim (both sides compute identical ring state from match clock; zone tests updated)
**And** the batch-sim harness confirms match lengths land inside ~15:00 start-to-results (NFR6).

### Story 3.2: Ring Reveal & Storm Rendering (resolves the storm-edge open question)

As a captain,
I want to see where the next ring will be the minute it's revealed, and unmistakably know when I'm in the storm,
So that "where you must be" is planning pressure, not a surprise.

**Acceptance Criteria:**

**Given** minute 3 of a ring group
**When** the next ring is revealed
**Then** the upcoming ring renders on the water distinctly from the current ring edge, and both are visible through fog at any camera zoom
**And** the storm renders exclusively in the storm violet family — fill at {storm}, on-water edge stroke and text at {storm-readout} brightness (the fill alone fails 3:1); the edge treatment (candidate: dashed stroke) is resolved WITH ERIC here, closing UX open question #7 (UX-DR5)
**And** being in the storm shows the purple vignette pulse (1.1 Hz cap) + "IN STORM" line, obeying the attention-priority tiers as they exist so far
**And** purple appears nowhere else in the game.

### Story 3.3: BR Chrome Bar

As a captain,
I want one restrained top-center line with the match state,
So that afloat count, my kills, match time, and the ring clock never cost me a glance more than they're worth.

**Acceptance Criteria:**

**Given** a live match
**When** the BR Chrome Bar renders top-center
**Then** it reads `n AFLOAT · n KILLS · T+mm:ss · RING CLOSES m:ss` — numbers phosphor tabular, labels muted, no supply-drop reservation (UX-DR16)
**And** the ring readout counts down each closure and pulses amber at exactly 1 Hz in the final 10 s
**And** during reveal phases the readout reflects the phase ("RING REVEALED" register per the mocks' voice)
**And** the bar persists through the omniscient reveal (the ratified survivor set — wired fully in Epic 5).

### Story 3.4: The Endgame Guarantee

As a captain in the endgame,
I want the final ring locked to two truesight diameters,
So that the last fight is forced but the sensor game survives to the final shot.

**Acceptance Criteria:**

**Given** the phased timeline's final ring
**When** its size is computed
**Then** the final diameter = 2 × the standard truesight diameter, derived from CONFIG's truesight value (never an independent constant — if truesight tunes, the endgame follows) (FR25)
**And** at the final ring, radar range still exceeds the ring (blips remain meaningful) and no hull is auto-visible across it (truesight does not cover the whole ring from the center)
**And** a batch-sim run at the final ring confirms matches conclude (no stalemate loop) with the game continuing past 12:00 until a winner emerges.

## Epic 4: Information Texture (GDD E6)

Fights at radar range are readable, trackable dramas instead of silent HP exchanges: listening ring, hit call, fall-of-shot, muzzle carries, wounded smoke, foghorn, the Bounty, class-legible blips — all through the Epic 1 signal registry (each feature = a row + its invariant case). Epic guardrail: information noise must never bury the hunt — closed by the gate story 4.8.

### Story 4.1: The Listening Ring

As a captain,
I want hull microphones feeding a bearing-only compass rose around my ship,
So that a long torpedo approach is heard before it's seen — if I listen.

**Acceptance Criteria:**

**Given** the perception system
**When** the third sensor tier lands in `observe()`
**Then** listening events carry bearing + sound class ONLY — no position, no range-derivable fields — as a registry row with its invariant case (AR6); engine noise and torpedoes in the water are audible sources
**And** the HUD renders the dashed 48-pip compass rose (~half truesight radius visually) on the fog-immune chart layer, segments lighting toward noise with brightness proportional to loudness/closeness — pure intensity grammar, deliberately source-ambiguous (UX-DR18)
**And** torpedoes are heard from long distance but seen only at truesight, where the materialization treatment (pale boundary rings + wake per UX-DR20) makes pips-to-sight read as one continuous event; radar never paints torpedoes (FR7 holds)
**And** each audible class has its audio twin in the tone system (mute- and mono-aware)
**And** the ring dies with the hull (reveal survivor set).

### Story 4.2: Class-Legible Blips

As a captain,
I want radar blips that carry hull outline, speed, and heading,
So that a paint is a deduction input — what class, going where — not just a dot.

**Acceptance Criteria:**

**Given** the blip signal row
**When** a sweep paints a LOS-clear ship
**Then** the blip carries the ship's class outline, speed, and heading (FR14) — PROTOCOL_VERSION bumped for the wire change
**And** blips render outline-only (1px non-scaling stroke) at true heading with an arrowhead heading vector; class blips never below 11 px (BB 14 / ML 12 / TB 11 floor-clamped); the ML notch cuts ~3x deep in the blip path only (UX-DR10)
**And** decay ghosts cap at 3 or fewer per contact (TTL-based), and per-hue luminance floors lighten dark hues at blip/ghost scale
**And** blips fly personal colors (Variant C) with the Variant P phosphor-anonymous build flag kept; drone blips stay greyscale chevrons
**And** the perception invariants still hold: no blip outside sight or this-tick paints, and the decoy (Story 1.8) automatically carries the new fields indistinguishably.

### Story 4.3: The Gunnery Conversation

As a captain,
I want my fire to speak — splashes where I miss, a boom when I connect, a flash when anyone shoots,
So that every trigger pull makes information for someone.

**Acceptance Criteria:**

**Given** guns firing across the fog
**When** shells land, hit, or leave the muzzle
**Then** fall-of-shot splashes ({splash} expanding rings) render at my misses even in fog — bracket-and-walk fire works (FR16)
**And** the Hit Call (muffled boom + {hit-bloom} bloom) confirms my connection without revealing severity — and shooting a decoy produces none
**And** muzzle flash ({muzzle}) carries beyond truesight — shooting is being seen — masking D1's back-dated projectile spawn (the Epic 1 tie-in)
**And** each lands as its own registry row + invariant case, with projectiles still materializing at the sight boundary with no range-derivable fields (FR15)
**And** all three effects use their token colors — never phosphor-adjacent greens.

### Story 4.4: Wounded Smoke

As a hunter,
I want hurt ships to trail smoke above the fog,
So that damage is trackable prey — while exact HP stays private forever.

**Acceptance Criteria:**

**Given** a damaged ship
**When** its HP falls below the smoke threshold (CONFIG design target)
**Then** it trails {wounded-smoke} smoke visible above the fog as a registry row with its invariant case (FR16)
**And** smoke conveys hurt, never a number — no enemy HP bars exist anywhere (UX-DR24); own damage stays HUD-private
**And** smoke color never reads as a drone cluster (the warmed/darkened token)
**And** smoke respects the motion setting's reduced/off tiers.

### Story 4.5: The Foghorn (binds the key with Eric)

As a captain with feelings,
I want one button that honks,
So that silly is sanctioned — and every honk is a bearing I chose to give away.

**Acceptance Criteria:**

**Given** the unbound foghorn emote (UX open question #20)
**When** this story begins, the key is chosen WITH ERIC and added to the fixed bindings + settings reference
**Then** pressing it broadcasts a honk: every hull in earshot hears it (audio twin) and their listening rings light an arc sweep along the honk's bearing — deliberately loud on the intensity grammar (FR16)
**And** no kill-feed line appears (it's an emote), and no wire field carries more than the listening tier's bearing contract
**And** it is rate-limited so honk-spam can't flood the ring or the audio mix.

### Story 4.6: The Bounty

As the kill leader's next victim,
I want the leader to bloom on everyone's radar and be worth extra XP,
So that the strongest player is the one player who can't hide.

**Acceptance Criteria:**

**Given** a match with a current kill leader
**When** the bounty activates (cadence per CONFIG design target)
**Then** the leader blooms on every player's radar at true position — an expanding ring (1 to 3 px, ~2 s decay) in their personal color around their class blip, visually distinct from sweep paints (FR17, UX-DR19)
**And** it lands as a registry row explicitly marked as the one sanctioned non-sweep radar paint, with its invariant case codifying the exception
**And** killing the bounty holder grants the extra XP (CONFIG design target) through the Epic 2 pipeline
**And** the feed announces "BOUNTY: <NAME>" on activation, and the bloom has its audio twin.

### Story 4.7: The Real-Time Sound Map (design work with Eric)

As a captain playing by ear,
I want the full real-time sound design — with every audio event twinned to a visual,
So that audio is a real sensor and no captain is locked out by hearing.

**Acceptance Criteria:**

**Given** the 13 existing tones and Epic 4's new events
**When** the sound map is designed WITH ERIC (audio is a sensor — this is game design; closes UX open question #8)
**Then** the deliverable carries the two-column audio-event to visual-twin table, and no audio event ships without its row (UX-DR36)
**And** the new events land as tones: listening-ring grammar, hit call boom, foghorn, bounty, low-HP sting, and the deferred denied tone — WebAudio only, mute- and mono-aware, respecting effect volume
**And** every tone passes the twin-walk: cover the speakers and the visual carries it; cover the screen region and the tone carries it.

### Story 4.8: Attention Priority & the Readability Gate

As a captain on a busy screen,
I want the HUD's animated channels arbitrated by threat priority,
So that at the climax, amber still means "look here" and the hunt is never buried.

**Acceptance Criteria:**

**Given** all Epic 4 channels plus the HUD's existing animations
**When** multiple channels are active
**Then** Tier 1 (pip surges, denied pulses, HP pulse < 25%) always animates; Tier 2 (final-10s ring pulse, storm vignette) holds at its lit keyframe while Tier 1 is active; Tier 3 (chip breathing, toasts, XP wrap) freezes at its dim keyframe while any higher tier is active; only the highest-tier active amber channel pulses (UX-DR35)
**And** the aggregate photosensitivity budget holds: no element or region exceeds 3 flashes/s regardless of stacked compliant events; same-source flashes share the 300 ms floor (NFR13)
**And** the epic guardrail is verified: a squint-test on a staged worst-case fight (multiple contacts, torpedoes inbound, storm closing, bounty active) confirms threat channels read first — the documented readability check every E6 feature must pass
**And** all Epic 4 effects have been costed against the render budget on the reference device as they landed (per-epic budget DoD).

## Epic 5: The Living Ocean (GDD E4)

The water itself creates stories — fog banks, hemisphered whirlpools, huntable PvE fleets — and dying becomes learning: sinking window, omniscient reveal, results.

### Story 5.1: Lifecycle State Machine & STEP_ORDER Registry

As a captain,
I want ship life-and-death as an explicit reversible state machine inside a data-declared tick order,
So that sinking, healing, whirlpools, and every future sim step have one legible home.

**Acceptance Criteria:**

**Given** the current boolean-ish alive/dead handling
**When** `shared/src/sim/lifecycle.ts` lands
**Then** ship lifecycle is the discriminated union `alive | sinking(since) | sunk(at)` with transitions validated in one place and `sinking -> alive` a reserved legal transition (future heal — never dead code, covered by a transition test) (AR9)
**And** `world.step()` iterates a named `STEP_ORDER` array — steps are data; inserting one is a one-line reviewable edit (AR8)
**And** the win predicate in `match.ts` becomes one predicate over lifecycle states
**And** all existing sim behavior is unchanged (pure refactor; tests green).

### Story 5.2: The Sinking Window (resolves the sinking-activation policy with Eric)

As a sinking captain,
I want five seconds of ritardando with my guns still live,
So that I go down shooting — and maybe take my killer with me.

**Acceptance Criteria:**

**Given** a ship reaching 0 HP
**When** it enters `sinking`
**Then** the hull decelerates to a stop over ~5 s (CONFIG design target) as a STEP_ORDER step; helm inputs are accepted but decay; fire/aim inputs stay live (FR32)
**And** equipment activation routes through the single sinking gate — the policy (which equipment may fire while sinking) is resolved WITH ERIC here, closing the architecture's one TBD
**And** provisional win semantics hold: sinking ships stay win-eligible until fully sunk; if all remaining participants are sinking, the later sinker wins; same-tick mutual destruction = draw (D4 — revisit stays cheap: one predicate)
**And** the crimson sink ring renders and the sinking ship remains fully perceivable (it's still a participant, still a target)
**And** invariant tests cover perception + input validation during sinking.

### Story 5.3: Omniscient Reveal & Results (resolves the reveal-zoom motion exemption)

As a sunk captain,
I want to finally see everything, then read my results and get back to port in two presses,
So that losing converts into learning and the next match is seconds away.

**Acceptance Criteria:**

**Given** my ship fully sinks
**When** the omniscient reveal plays
**Then** fog drops, the camera zooms out to the whole map, and every revealed ship wears its nameplate — extending the truesight nameplates that have lived since Story 1.13 to every hull on the water (UX-DR22's reveal scope)
**And** the reveal HUD survivor set holds: BR Chrome Bar + Kill Feed persist; hotbar, XP rail, chip, own-vitals, and listening ring die with the hull; only Enter/click proceeds (UX-DR38)
**And** whether the reveal zoom is exempt from the motion setting is decided WITH ERIC (closes UX open question #25)
**And** the results modal shows kills, placement, time afloat, and accrued boons + last offer reviewable, with the single amber RETURN TO PORT action (Enter or ESC) — no re-queue here, no dead spectate button (FR33, UX-DR27)
**And** leaving lands on home with SET SAIL one press away, routing through `requestAdBreak()` (the Story 0.4 seam).

### Story 5.4: Fog Banks

As a hunted captain,
I want fog banks that trade my sight for my visibility,
So that blindness bought with blindness is a real tactical purchase.

**Acceptance Criteria:**

**Given** map generation
**When** fog banks are seeded (frequency/size as CONFIG design targets; deterministic from the map seed — FR26 extension)
**Then** inside one, my truesight radius shrinks (CONFIG target) and I vanish from others' truesight — while radar may still paint me (FR28)
**And** the perception change is a visibility-predicate modification with invariant coverage (never a client-side effect)
**And** fog banks render distinctly from the fog-of-war composite so the trade is legible before I enter
**And** own-ship prediction stays correct across the boundary (shared-sim parity).

### Story 5.5: Whirlpools (feel treatment designed with Eric)

As a captain crossing strange water,
I want whirlpools that carry and turn my hull by hemisphere-honest spin,
So that captaining gets more interesting — and the observant learn a secret.

**Acceptance Criteria:**

**Given** a match World
**When** it initializes
**Then** it secretly rolls northern or southern hemisphere (N = CCW, S = CW) — stored in World state, never in the map seed or on the wire (AR14/AR15); whirlpools are rare (CONFIG target) and placed deterministically
**And** `shared/src/sim/whirlpool.ts` implements the current: crossing hulls are carried along the circular flow (with = faster, against = slower) and their heading rotates with the spin; exit from any side; no suction (FR29) — shared math, so own-ship prediction holds while inside
**And** the current applies as a STEP_ORDER step, and touching a whirlpool reveals the hemisphere only through observed motion
**And** the on-water render/feel treatment is designed WITH ERIC (closes UX open question #23) within the token palette
**And** sim-parity property tests cover the whirlpool math.

### Story 5.6: Roving PvE Fleets

As a captain between fights,
I want huntable drone fleets roving the ocean in three tiers,
So that finding prey is part of the sensor game and my XP has a second faucet.

**Acceptance Criteria:**

**Given** a match in any mode
**When** PvE fleets spawn (counts/composition as CONFIG design targets)
**Then** three tiers exist — common small / uncommon medium / rare large, by HP — each worth its FR18 XP fraction through the Epic 2 hooks (FR30)
**And** fleet ships carry a basic gun on a long cooldown fired only in self-defense (the cheap threat-check tier: react to being hit or truesight proximity — never full `observe()`, never hunting) — driven through the same input pipeline as every ship (FR37)
**And** fleets rove the ocean (waypoint drift as a STEP_ORDER step), render as greyscale legacy chevrons at hull and blip scale, and tier reads by size (richer tier language stays an open question — noted, not blocking)
**And** drones are never participants: the win check ignores them entirely (formal multi-mode coverage lands in Epic 6)
**And** the perf budget holds with full fleets present (they're part of the reference scenario).

## Epic 6: Honest Lobbies & Modes (GDD E5)

Two real modes with honest matches: no bot-fill, min-2 fill-or-timer, cap 20, roster-scaled maps, Solo vs AI with real combat bots, queue-liveness menu, reconnection UX. Architecture stake: Solo vs AI is the launch-day first match for most players — bot quality sits on the retention critical path, never fallback filler.

### Story 6.1: Queue-Based Lobbies

As a captain,
I want honest standard lobbies — minimum two humans, fill-or-timer, never a bot in disguise,
So that a "player" in my match is always a person.

**Acceptance Criteria:**

**Given** the 0.17 substrate
**When** `StandardQueueRoom` lands (D6)
**Then** a match arms at 2 human captains and starts on fill-or-timer (timer as CONFIG design target), capped at 20, with seat reservation into the arena room
**And** zero bot-fill exists in Standard — roving PvE fleets are world content, never roster fill (FR34)
**And** joining is pure quick play: no skill matching, no parties, no ranked
**And** arena logic never forks on mode — the mode is entirely a queue choice
**And** no code path assumes same-process room co-residency (D8 holds through the queue layer).

### Story 6.2: Roster-Scaled Oceans

As a captain in a 4-player match,
I want an ocean sized for 4 — not for the 20 who never came,
So that every match density is honest.

**Acceptance Criteria:**

**Given** a lobby reaching countdown
**When** the map seed and generation parameters are derived
**Then** map size scales from the actual roster at countdown (scaling curve as CONFIG design target) — no ghost oceans (FR27)
**And** spawns remain outer-ring, max-min mutual distance, island-clear at every roster size (property test across sizes 2–20)
**And** both sides still rebuild the identical map deterministically from the seed (islands, fog banks, whirlpool placements)
**And** the phased ring timeline (Epic 3) scales coherently with map radius down to the same Endgame Guarantee diameter.

### Story 6.3: The Participants-Only Win Check

As a captain,
I want the win check to count only match participants — in every mode,
So that I never have to exterminate the wildlife to claim my crown.

**Acceptance Criteria:**

**Given** the lifecycle-based win predicate (Story 5.1)
**When** it is formalized across modes
**Then** participants are: human captains (Standard) / the human + AI combatants (Solo vs AI); PvE fleet ships are never participants, can never win, and never need to be destroyed (FR31)
**And** the last participant afloat (per D4's sinking semantics) wins, with tests covering: last human standing among live drones, all-participants-sinking, and the same-tick draw
**And** win/draw results flow correctly into reveal, results modal, and `match.end` telemetry in both modes.

### Story 6.4: Combat-Bot AI

As a solo player,
I want AI opponents that genuinely play the battle royale — and structurally cannot cheat,
So that my first match against bots is a real hunt, not target practice.

**Acceptance Criteria:**

**Given** `server/src/game/ai/` (utility.ts + botDriver.ts)
**When** a combat bot acts
**Then** its ONLY world knowledge is `perception.observe()` output (the same function client frames use — wallhacking is structurally impossible) and its intent enters through the same validated input pipeline (FR36, FR37; D5)
**And** bots observe at a staggered ~250 ms cadence (round-robin across ticks) — a fairness knob, with worst-case cost at or below a full human lobby
**And** utility scoring drives hunt / position / strike / evade / storm-avoid over contacts + blips, and bots use their class loadouts (fire arcs, specials, refit spending)
**And** the `ai/` import boundary is enforced (lint): perception + inputs only, never World internals
**And** bot quality is measured, not felt: the batch-sim harness's third duty — bot-vs-bot evaluation scored on kill distributions, match lengths, storm deaths (AR12).

### Story 6.5: Solo vs AI Mode

As a solo player at launch population zero,
I want a full battle royale against AI captains one click away,
So that there is always a real game — day one, 3 a.m., empty server.

**Acceptance Criteria:**

**Given** `SoloVsAiQueueRoom`
**When** I queue Solo vs AI
**Then** the lobby fills to cap with AI combatants (1 human + 19 bots) who pick classes and personal colors like players and fight the full BR (FR35)
**And** PvE fleets, the storm, the economy, and the win check all run identically to Standard (the arena never knows the mode)
**And** bots read as combatants everywhere (class silhouettes, personal colors, nameplates, kill feed) — only drones are greyscale
**And** the mode completes end-to-end: queue → countdown → live → win/loss → reveal → results, verified by a headless smoke.

### Story 6.6: Mode Select & Queue Liveness

As a player on the home page,
I want to pick my mode and see honest queue vitality,
So that I never sit in a dead queue wondering if the game is broken.

**Acceptance Criteria:**

**Given** the home page (Story 1.14)
**When** modes render
**Then** Solo and Solo vs AI are both offered minimally (mode chrome grows only when more modes exist), the Primary Button sub-line always states the shown mode + class, and the pick persists in localStorage (UX-DR25)
**And** the menu surfaces queue liveness — player counts / wait honesty — and steers toward Solo vs AI when Standard is empty (the D6 dead-queue mitigation)
**And** the waiting room shows "AWAITING CAPTAINS n/2" truthfully with the full weapons-safe HUD (UX-DR30)
**And** fill-or-timer state is visible (the room never lies about why it's waiting).

### Story 6.7: Reconnection UX

As a captain who just dropped,
I want a clear reconnecting experience on both ends,
So that a wifi blip reads as a blip — not a mystery death.

**Acceptance Criteria:**

**Given** the Story 0.2 reconnection mechanics
**When** the full UX lands
**Then** the dropping client shows a "RECONNECTING" banner (status register) with auto-reconnect attempts, and successful resume returns seamlessly to the live HUD
**And** the grace window and abandon-after-timeout (a never-returning captain's ship fights on until sunk or match end) are CONFIG design targets with their semantics tested
**And** a failed reconnect (match over, ship sunk) routes to results or home with a plain explanation — never a dead screen (UX-DR30)
**And** mid-match disconnect of OTHER captains is invisible beyond their ship's behavior (no wire field advertises a disconnected target).

## Epic 7: Portal Launch Readiness

The beta, live on a portal: Chromebook 60 FPS in a fully populated match, <10 s load, Poki/CrazyGames SDK behind the seam, How-to-Play page, DESIGN.md real-time-era refresh, and the release gate.

### Story 7.1: Chromebook Performance Pass

As Marco on a school Chromebook,
I want 60 FPS in the fullest, ugliest fight the game can produce,
So that low-end hardware is a distribution feature, not an apology.

**Acceptance Criteria:**

**Given** a real low-end Chromebook (acquired/benched here — it replaces the 4x-throttle proxy as the reference device permanently)
**When** the reference scenario runs — 20 contestants + full PvE fleets + in-flight ordnance + all Epic 4 effects
**Then** 60 FPS sustains with the frame budget holding (sim <= 3 ms, render <= 10 ms, headroom >= 3.6 ms) (NFR1)
**And** any budget breach is fixed at the offending system (pooling, batching, decay caps) — never by cutting a ratified feature without Eric's sign-off
**And** the perf overlay evidence (frame-time split, entity counts) is captured as the audit record
**And** prior epics' per-epic budget checks are re-validated on the real device.

### Story 7.2: Ten-Second Load

As a portal player one click deep,
I want to be reading the home page in under ten seconds,
So that "no install, no account" is true in wall-clock time.

**Acceptance Criteria:**

**Given** a portal-shaped network + the reference device
**When** the page is cold-loaded
**Then** click to interactive home lands in under ~10 s (NFR2), with `loadingProgress()` reporting through the portal seam the whole way
**And** the bundle passes portal size limits (procedural assets + tones keep it lean — NFR9 verified: zero texture/model/sound files shipped)
**And** fonts load without blocking first paint (fallback strategy documented)
**And** the load audit (waterfall, bundle breakdown) is captured as the record.

### Story 7.3: Portal SDK Integrations

As the launch engineer,
I want Poki and CrazyGames adapters behind the existing seam,
So that compliance is a config choice, not a code fork.

**Acceptance Criteria:**

**Given** the `PortalAdapter` seam (Story 0.4)
**When** `pokiAdapter.ts` and `crazyAdapter.ts` land
**Then** each implements the full interface (init, loading progress, match start/end, `requestAdBreak` at death-to-requeue — the revenue-and-retention seam) per its SDK docs, selected at build/config time (NFR8)
**And** game code still never imports an SDK directly; the null adapter remains the dev default
**And** each portal's technical checklist (bundle, events, ad rules) is verified and documented
**And** the ad break plays at death-to-requeue without breaking the reveal-results-home flow (audio muted during breaks, state intact after).

### Story 7.4: How-to-Play Page

As a brand-new player,
I want one static page that teaches the game,
So that onboarding exists without coach marks cluttering the HUD.

**Acceptance Criteria:**

**Given** the DOM chrome
**When** the How-to-Play page lands (linked from home; ESC/back returns)
**Then** it covers the controls (the fixed bindings in the key-chip family), the three sensor tiers, the storm rhythm, classes + slot grammar, and the boon economy (UX-DR29)
**And** it hosts the boon glossary (Story 2.8's content)
**And** it positions Solo vs AI as the live tutorial
**And** it renders in standard page chrome at the 1100 px max width, and its copy holds the terse-naval register.

### Story 7.5: DESIGN.md Real-Time Refresh

As the design source of truth's keeper (Eric),
I want DESIGN.md's hex-era passages replaced with the real-time reality,
So that the next design decision starts from a document that describes the shipped game.

**Acceptance Criteria:**

**Given** the ratified DESIGN.md (2026-07-16)
**When** the refresh pass runs (with Eric — it's the design source of truth)
**Then** remaining hex-grid-era content (cell states, planning/resolution choreography) is replaced or struck; the aesthetic direction carries forward unchanged
**And** open questions resolved during Epics 1–6 (storm edge, island colors if settled, text-safe variant table, whirlpool treatment, foghorn key, sound map) are written back as decisions
**And** the GDD's correction flags (4-card offers, "Solo vs AI" naming, the retired spectate option — GDD and architecture still say "spectate" post-death) are reconciled in the GDD, and EXPERIENCE.md's pre-auto-reconnect disconnect wording ("banner + return home") is updated to the Story 0.2/6.7 resume flow
**And** `gds-workflow-status.yaml` and CLAUDE.md pointers stay accurate.

### Story 7.6: The Release Gate

As the operator (Eric),
I want a final hardening sweep before the portal link goes out,
So that launch day is boring.

**Acceptance Criteria:**

**Given** the launch candidate build
**When** the gate runs
**Then** the game verifies on current Chrome, Edge, Firefox, and Safari, and at the 1366x768 floor viewport (corner anatomy intact, no mono type below 9 px) (NFR7, UX-DR39)
**And** nothing debug ships: dev tools stripped by `import.meta.env.DEV`, server dev behavior locked behind `HC_DEV_OPTIONS`, `P` toggle absent from prod (NFR17)
**And** the pre-launch load test (the harness's second duty — `loadTest.mjs`) proves the deployed tier survives a portal-shaped connection spike, with `/metrics` confirming tick health under load (AR12, NFR10)
**And** `npm run check` is green, `PROTOCOL_VERSION` is consistent, and the full pipeline (home to queue to match to death to ad break to requeue) passes a manual run on the production stack.
