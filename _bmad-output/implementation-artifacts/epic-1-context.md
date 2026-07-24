# Epic 1 Context: The Armory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make class choice matter from the first second. Picking any of the three beta classes — Torpedo Boat, Battleship, Mine Layer — should make the game feel genuinely different at 0:00 through a distinct hull envelope, a recognizable top-down silhouette, a personal player color, and a fitted loadout. This epic lays the structural spine the rest of the project builds on: a declarative perception signal registry, a unified equipment/loadout grammar, the three hull stat blocks, the universal gun, latency-fair firing, per-class specials and abilities, redesigned firing arcs, and the ratified visual identity (design tokens, personal colors, silhouettes) plus the home and class-select chrome. It matters because class identity and the equipment/signal foundations are what every later epic (economy, storm, information texture, world, modes) touches.

## Stories

- Story 1.1: Signal Registry Foundation
- Story 1.2: Equipment Interface & Loadout Slots
- Story 1.3: Three Hull Envelopes
- Story 1.4: Universal Standard Gun (carries the precision-bonus decision)
- Story 1.5: Firing Under Latency (D1) + Latency Harness
- Story 1.6: Torpedo Boat Loadout (carries the boost x torpedo ruling)
- Story 1.7: Battleship Loadout
- Story 1.8: Mine Layer Loadout (carries the signature-ability + mine-mechanics decisions)
- Story 1.9: Gunboat Loadout — REMOVED (2026-07-19 re-scope; number retired, not reused)
- Story 1.10: Firing Arcs for the Class Era
- Story 1.11: Design Tokens & Typography
- Story 1.12: The Regatta Hoist
- Story 1.13: Class Silhouettes on the Water
- Story 1.14: Home & Class-Select Chrome

## Requirements & Constraints

- **Three classes at beta**, each a distinct hull envelope (size, speed, toughness, turning) carrying a fitted loadout. The gunboat is cut; Submarine → Carrier are bench-deferred. Loadouts: Torpedo Boat = torpedo tubes + speed boost; Battleship = long-range cannon + star shells; Mine Layer = proximity mines + an OPEN signature ability (resolve with Eric before Story 1.8). The smoke screen is no longer any class's ability — it becomes boon/equipment-pool content.
- **Universal slot grammar** on every ship: slot 1 = universal standard gun (byte-identical across all classes — class identity never lives in the gun), slots 2–3 = two class specials (at least one a weapon), slot 4 = an extra slot filled mid-match by the economy (empty-capable now).
- **One Equipment interface** for every fitted system (weapon or not), each with its own ammo pool and reload/cooldown timer that ticks every tick regardless of which slot is selected — switching is tempo, never penalty.
- **Projectile combat model** (never hitscan): no dispersion (shots go exactly where aimed), no damage falloff, flat single-pool damage — no sectional damage, no crits, no weak points. Gun shells fly to the clicked point or first obstacle. The precision-bonus idea is a decision to make with Eric during Story 1.4.
- **Torpedo laws**: outrun every hull at base speed, spawn with real bow clearance + brief owner-only grace (self-hit at base speed impossible, test-covered), run until they hit something, and are never painted by radar.
- **Mine laws**: arm after a delay, trigger by proximity, respect a per-player live-mine cap (oldest evicted) and a global cap.
- **Firing arcs**: all weapons fire within real arcs; mouse aim is constrained to the selected weapon's arc; arcs are redesigned per class role (arc values are Eric decisions). Denied fire/activation (out of arc, no ammo, cooling, empty slot) always gives explicit feedback, never silence.
- **Firing under latency (D1)**: fire commands carry a client timestamp clamped to min(claimed, measured RTT + jitter allowance), hard ceiling 150 ms, never earlier than the previous input; projectiles spawn back-dated along their trajectory; hits always resolve against live server state — no victim rewind, ever. Tick stays 20 Hz. The simulated-latency harness (hit-registration agreement %, prediction-error bounds), not localhost feel, is the acceptance gate.
- **Counter-intel law**: any deception entity (e.g. a decoy buoy, if the ML ability resolves to it) is a real server-side entity whose emitted signals are wire-indistinguishable from a genuine ship's — payload AND timing (same RNG/jitter stream). Lies live on the server.
- **Cross-cutting NFRs bind acceptance**: 60 FPS frame budget, anti-cheat perception boundary (nothing outside sight ∪ this-tick radar paints reaches a client), determinism (seeded RNG only, no Math.random/Date.now in sim), sim purity / zero-Colyseus World/Match, complexity ≤ 10, `npm run check` green. Numbers throughout are tunable design targets, not contracts.
- **Interregnum rule**: the legacy 14-upgrade economy keeps running against the new class stat blocks through Epic 1 (ugly but functional; spend stays enabled). It is deleted in Epic 2, not here.

## Technical Decisions

- **Signal registry lands first (AR5-foundation)**: introduce `server/src/game/signals.ts` with `SignalSpec` rows (`eventType`, `visible()`, `materialize()`, `counterIntel?`). Port every existing signal to a row; `observe()` becomes the only caller of `visible`/`materialize`; `frames.ts` stays the sole spatial exit. Perception invariant tests iterate the registry so a signal can't exist without coverage. Story 1.1 is a pure refactor: byte-identical wire output. Later epics only add rows.
- **Equipment unification (AR7)**: `weapons/` becomes `equipment/` — one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason) and one registry. One-structure law: a ship's loadout IS its equipment runtime (`{ equipmentId, state }` per slot in `shared/src/sim/loadout.ts`) — no parallel loadout structure. Slot activation routes through a single sinking-activation gate (a passthrough until Epic 5 introduces sinking; policy value TBD).
- **Hull geometry is shared**: per-class hull dims/kinematics live in CONFIG; the silhouette geometry lives in `shared/` so server collision and client render derive the hitbox from the same source — "the silhouette IS the hitbox" holds by construction. `effectiveStats()` produces the full stat block per class; kinematics stay shared-sim pure so prediction parity holds at 50 ms dt.
- **CONFIG is the single source of truth** for every gameplay tunable; `effectiveStats()` is the upgrade desync firewall (both sides call it). Speed boost applies through `effectiveStats()`/shared hooks so prediction survives the speed change.
- **New/evolved homes for this epic**: shared — `loadout.ts`; server — `signals.ts` (+ `equipment/`). Star-shell illumination and any decoy are added as registry rows with their own invariant cases.
- **Silhouette board geometry**: Torpedo Boat = knife ~9:1 (~100 u); Battleship = broadest/stepped (124 u); Mine Layer = widened aft + transom notch (88 u); the legacy chevron is reserved for PvE drones (a fourth silhouette no player wears). Drones always render greyscale.
- **Known bug to fix in scope**: the island-stuck collision bug (playtest finding #64) is fixed in Story 1.3 with a regression test.
- **PROTOCOL_VERSION** is bumped on any wire-contract break (blip class fields are an Epic 4 change, not here).

## UX & Interaction Patterns

- **Design tokens as the single styling source (Story 1.11)**: implement the ratified surface/functional/combat-effect colors, drone greys, and the 20 Regatta player hues; consolidate the two legacy reds into `denied`; retire the v0.16 `#111111`/`#232937` surfaces. No hex outside the token source may remain in client styling. Typography: Geist (display/body) + Geist Mono for every label/readout/stat — uppercase letter-spaced labels, `tabular-nums`, the documented size ramp, no mono below 9 px post-scale. Styling-only: no gameplay/wire change.
- **Regatta Hoist (Story 1.12)**: server assigns each human a unique hue at match start (preference granted unless contended; contention = fair random draw, losers to nearest free hue; UI never implies claiming/locking). Color index rides the roster so every screen agrees. Hulls render personal hue on the outline with ~45%-value interior fill; drones stay greyscale; all HUD chrome stays phosphor-functional. Amber, the red family, storm violet, and phosphor green are never combatant hues; personal-color-as-text uses a lightened text-safe variant meeting ≥ 4.5:1. Kill feed restyles to spec (mono 14 px uppercase, top-right, max 5 lines / 6 s TTL, vessel names 600-weight in text-safe variants, drones grey, long names mid-ellipsized).
- **Silhouettes on the water (Story 1.13)**: three classes draw at identity-board geometry in the shared linework language, consistent everywhere a hull appears (water, class card, results). Nameplates on every truesight combatant hull (callsign in hud-micro, text-safe personal variant; drones tagged "DRONE" in drone grey); never on blips/radar paints; fade with truesight resolution. Reveal-scope nameplates arrive later (Story 5.3).
- **Home & class-select chrome (Story 1.14)**: home over a live ambient CIC canvas with wordmark (`.io` phosphor-bright), 14-char callsign field, Class Chip, Color Hoist (20 swatches + preference caption), amber Primary Button ("SET SAIL") with mode/class sub-line, How-to-Play link, server status, settings gear. Class-select rail: three Class Cards (silhouette box, fantasy line, SPEED/TOUGHNESS/TURNING pips with real values derived from Story 1.3 CONFIG envelopes, loadout slots) plus a dashed "MORE CLASSES IN DEVELOPMENT" ghost card; keys 1–3/arrows highlight, Enter picks, ESC closes without change. First-run pushes no default (forced meaningful choice, Torpedo Boat pre-focused for keyboard flow). Connection failure reports on the status line, never a dead screen.
- **Shape/elevation register**: tactical HUD is 0-radius sharp "Afterimage" 1px outlines (no filled panels, water shows through); activated abilities marked by a chamfered top-right corner (shape, not color); no drop shadows — glow encodes state. (The full Q/E/R/F hotbar + Space-hold refit input scheme is Epic 2; only what the loadout/menu needs lands here.)

## Cross-Story Dependencies

- **Story 1.1 (signal registry) is the foundation** for 1.7's star-shell illumination row and 1.8's decoy counter-intel row — both add registry rows with invariant cases.
- **Story 1.2 (equipment interface)** underpins every loadout story (1.6–1.8) and the arc redesign (1.10, which needs all seven fitted systems from 1.4–1.8).
- **Story 1.3 (hull envelopes)** must precede 1.13 (silhouettes render the shared geometry as the hitbox) and 1.14 (class-card pips read Story 1.3 CONFIG values); it also gates 1.4 (gun tuned against the three classes).
- **Story 1.5 (latency harness)** is the acceptance gate for the gun (1.4) and feeds every ordnance spawn rule; muzzle-flash masking of the back-dated spawn is an Epic 4 tie-in.
- **Story 1.11 (tokens) → 1.12 (Regatta uses the token hues) → 1.13 (silhouettes render personal colors)** is a strict visual-identity chain.
- **Open decisions to resolve with Eric mid-story**: precision bonus (1.4), boost × torpedo interaction (1.6), Mine Layer signature ability + mine mechanics (1.8, before implementation), per-weapon arc values (1.10).
- **Downstream**: the decoy's counter-intel row (1.8) is what Epic 4's class-legible blips (Story 4.2) must automatically carry indistinguishably; the equipment registry and signal registry established here are extended (not rebuilt) by Epics 2, 4, and 5.
