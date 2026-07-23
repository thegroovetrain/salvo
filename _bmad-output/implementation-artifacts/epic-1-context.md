# Epic 1 Context: The Armory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make class choice matter at 0:00. After Epic 1, picking any of the three beta classes — Torpedo Boat, Battleship, Mine Layer — produces a genuinely different ship: a distinct hull envelope (size, speed, toughness, turning), a distinct top-down silhouette that is also the hitbox, a personal combatant color, and a fitted loadout built on one unified Equipment interface (universal standard gun in slot 1, two class specials, plus an economy-filled extra slot). This epic also lays two load-bearing foundations every later epic builds on — the declarative perception signal registry and the equipment/loadout slot grammar — and delivers the ratified visual identity (design tokens, typography, Regatta color hoist, silhouettes) and the home/class-select chrome. It runs on an interregnum: the legacy 14-upgrade economy keeps functioning against the new class stat blocks until Epic 2 deletes it.

## Stories

- Story 1.1: Signal Registry Foundation
- Story 1.2: Equipment Interface & Loadout Slots
- Story 1.3: Three Hull Envelopes
- Story 1.4: Universal Standard Gun (carries the precision-bonus decision)
- Story 1.5: Firing Under Latency (D1) + Latency Harness
- Story 1.6: Torpedo Boat Loadout (carries the boost × torpedo ruling)
- Story 1.7: Battleship Loadout
- Story 1.8: Mine Layer Loadout (carries the signature-ability + mine-mechanics decisions)
- Story 1.9: Gunboat Loadout — REMOVED (2026-07-19 re-scope; number retired, not reused)
- Story 1.10: Firing Arcs for the Class Era
- Story 1.11: Design Tokens & Typography
- Story 1.12: The Regatta Hoist
- Story 1.13: Class Silhouettes on the Water
- Story 1.14: Home & Class-Select Chrome

## Requirements & Constraints

- **Three classes, universal gun.** Beta roster is Torpedo Boat / Battleship / Mine Layer only (gunboat cut). Every class carries the byte-identical standard gun — class identity never lives in the gun, only in the specials. Slot grammar is universal: slot 1 = standard gun, slots 2–3 = two class specials (at least one a weapon), slot 4 = extra slot filled later via the economy (empty-capable now).
- **Class loadouts.** TB = torpedo tubes + activated speed boost (several seconds of raised speed, inherited from the cut gunboat). BB = long-range cannon + star shells (fog illumination). ML = proximity mines + an OPEN signature ability (decoy-buoy candidate) — both the signature ability and mine mechanics must be resolved with Eric before Story 1.8 implementation.
- **Projectile combat model.** Projectiles never hitscan; no dispersion (shots land exactly where aimed), no damage falloff, flat single-pool damage — no sections, crits, or weak points. Gun shells fly to the clicked point or first obstacle. Precision-bonus is an open idea to adopt-or-drop with Eric during the gun story.
- **Torpedo laws (FR7).** Outrun every hull at base speed, spawn with real bow clearance plus a brief owner-only grace (self-hit at base speed impossible, test-covered), run until they hit something, and are never painted by radar.
- **Mine laws (FR8).** Arm after a delay, trigger by proximity, capped per-player (oldest live mine evicted) and globally.
- **Movement.** Telegraph-and-helm: 9-detent set-and-forget engine orders plus rudder; per-class acceleration/braking/turn rates; rudder authority falls below steerage speed.
- **Denied feedback (FR12).** Any denied fire or activation (out of arc, no ammo, cooling, empty slot) always gives explicit feedback, never silence. Full new input scheme is Epic 2 — this epic keeps existing bindings.
- **Firing arcs.** All weapons fire within real arcs; mouse aim is constrained to the selected weapon's arc; per-weapon arc geometry is a design decision set with Eric in CONFIG.
- **Compass vetoes (AR16).** No torpedo variety (one torpedo design per fit), no damage-control parties, no sectional damage.
- **Cross-cutting gates.** Every story is bound by: anti-cheat perception boundary (nothing spatial leaves except through frames sourced from observe()), determinism (seeded RNG only, no Math.random/Date.now in sim), sim purity + zero-Colyseus in World/Match, cyclomatic complexity ≤ 10, and `npm run check` green. Latency feel (D1/Story 1.5) is gated by the simulated-latency harness and measurable proxies (hit-registration agreement %, prediction-error bounds), never localhost feel.

## Technical Decisions

- **Signal registry (AR5, lands here).** Introduce `server/src/game/signals.ts` with declarative `SignalSpec` rows (`eventType`, `visible()`, `materialize()`, `counterIntel?`). `observe()` becomes the only caller iterating `SIGNAL_REGISTRY`; `frames.ts` stays the sole spatial exit. Port every existing signal as a row with byte-identical wire output (pure refactor). Perception-invariant tests iterate the registry so a signal without a passing case fails CI by construction; adding a future signal = one row + one test case. The decoy story builds on this; Epic 4 only adds rows.
- **Equipment unification (AR7).** Move `weapons/` → `equipment/` behind one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason) and one registry. One-structure law: a ship's loadout IS its equipment runtime (`{ equipmentId, state }` per slot in `shared/src/sim/loadout.ts`) — no parallel loadout structure. Every system's reload/cooldown ticks every tick regardless of selection (switching is tempo, not penalty). Sinking-state activation routes through a single gate point (passthrough until Epic 5; policy value TBD).
- **D1 fire-time compensation (AR3).** Fire commands carry a client timestamp clamped to `min(claimed, measured RTT + jitter)`, hard ceiling 150 ms, never earlier than the previous input (measured via `room.ping()`). Projectiles spawn back-dated along their trajectory; hits always resolve against live server state — no victim rewind, ever. Tick stays 20 Hz. Torpedoes/mines follow the same spawn rule.
- **Hull geometry is shared.** Per-class hull dims/kinematics live in CONFIG (design-target, tunable) and drive `effectiveStats()`. The shared silhouette geometry IS the hitbox and lives in `shared/` so server collision and client render can never disagree; kinematics stay shared-sim pure (prediction parity at 50 ms dt).
- **CONFIG is the single source of truth** for every gameplay tunable; design numbers are targets, not contracts. Client-only render/feel knobs live in `CLIENT_CONFIG`.
- **Interregnum.** Legacy 14-upgrade economy keeps multiplying the new class stat blocks (ugly but functional); spend stays enabled; deleted in Epic 2. Fix the island-stuck collision bug (playtest finding #64) with a regression test in Story 1.3.
- **Star shell illumination** is a registry row with its own invariant case, revealing ships only inside the time-limited illuminated zone.

## UX & Interaction Patterns

- **Design tokens (UX-DR1) are the single styling source** (Story 1.11, styling-only, no gameplay/wire change): surface colors, functional colors, combat-effect colors, drone greys, and the 20 Regatta player hues. Consolidate the two legacy reds into one `denied` red; retire the deprecated v0.16 `#111111`/`#232937` surfaces. No hex value may remain outside the token source in client styling.
- **Typography (UX-DR2).** Geist display/body + Geist Mono for every label/readout/stat; uppercase letter-spaced labels; `tabular-nums` digits everywhere; documented size ramp; no mono type below 9 px post-scale.
- **Shape/elevation register.** Tactical HUD is "Afterimage": 0-radius sharp, floating 1px outlines, no filled panels, water shows through; glow encodes state (never decoration); no drop shadows. Activated abilities marked by a chamfered top-right corner (shape signal, not color). Port chrome (DOM) uses 8/12 px radii.
- **Regatta Hoist (UX-DR6–8).** Server assigns each human a unique hue from the 20-hue wheel, match-consistent, color index riding the roster so every screen agrees. Home preference granted unless contended; contention = fair random draw, losers to nearest free hue (UI must never imply claiming/locking). Hull = bright personal hue outline + same hue at ~45% value interior fill; drones always greyscale; HUD chrome stays phosphor-functional. Amber, the red family, storm violet, and phosphor green are never combatant hues; personal-color-as-text uses a lightened text-safe variant at ≥ 4.5:1.
- **Silhouettes (UX-DR9).** Three genuinely distinct top-down shapes — TB knife (~9:1), BB broadest/stepped (124 u), ML widened-aft with transom notch (88 u); legacy chevron reserved for PvE drones (a fourth silhouette no player wears). Consistent everywhere a hull appears (water, class card, results). Nameplates float above every truesight combatant hull (callsign in text-safe variant; drones tagged "DRONE" in grey); never on blips/radar paints; fade with truesight resolution.
- **Kill feed restyle (UX-DR17).** Mono 14 px uppercase, top-right, max 5 lines / 6 s TTL, newest on top; vessel names 600-weight in text-safe personal variants, drones grey, connective text secondary; 14-char callsign cap, longer legacy names mid-ellipsized.
- **Home & class-select chrome (UX-DR25–26).** Home renders over a live ambient CIC canvas: wordmark (`.io` phosphor-bright), callsign field (14-char cap), Class Chip, Color Hoist (20 swatches + preference caption), amber Primary Button ("SET SAIL" + mode/class sub-line, Enter equivalent), How-to-Play link, server status, settings gear; connection failure reports on the status line, never a dead screen. Class-select: three Class Cards on a horizontal rail (silhouette box, fantasy line, SPEED/TOUGHNESS/TURNING pips derived from real Story 1.3 CONFIG values, loadout slots) plus a dashed "MORE CLASSES IN DEVELOPMENT" ghost card; keys 1–3/arrows highlight, Enter picks, ESC closes without change; first-run pushes no default (forced meaningful choice, Torpedo Boat pre-focused for keyboard flow).

## Cross-Story Dependencies

- **Foundations first, in order:** 1.1 (signal registry) and 1.2 (equipment/loadout) precede everything; 1.3 (hull envelopes) precedes the class-loadout stories (1.4, 1.6, 1.7, 1.8) and the visual-identity stories.
- **Gun before specials before arcs:** 1.4 (universal gun) → 1.6/1.7/1.8 (class loadouts) → 1.10 (arcs across all seven fitted systems).
- **Latency harness (1.5)** provides the acceptance gate reused by the gun and every later feel-sensitive feature.
- **Visual-identity chain:** 1.11 (tokens/typography) → 1.12 (Regatta hoist, needs the token set) and 1.13 (silhouettes, needs shared geometry from 1.3) → 1.14 (class-select pips need real CONFIG envelope values from 1.3).
- **Decoy-buoy counter-intel (1.8)** depends on the signal registry (1.1) — its row is marked `counterIntel` with wire- and timing-indistinguishability tests.
- **Open decisions requiring Eric before/within their story:** precision-bonus (1.4), boost × torpedo self-hit rule (1.6), Mine Layer signature ability + mine mechanics (1.8), per-weapon arc values (1.10).
- **Forward hooks:** truesight nameplate scope here; the omniscient-reveal scope is Epic 5. Muzzle-flash masking of back-dated spawns is an Epic 4 tie-in. Extra-slot contents arrive via the Epic 2 economy.
