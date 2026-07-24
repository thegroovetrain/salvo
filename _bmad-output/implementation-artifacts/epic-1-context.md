# Epic 1 Context: The Armory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 delivers the game's identity spine: pick any of three classes and the ship feels genuinely different at 0:00 — distinct hull envelope, silhouette, personal color, and fitted loadout — chosen through a real class-select experience. It also stands up the foundations every later epic builds on: the declarative perception signal registry, the unified equipment/loadout grammar, and the fire-time latency-compensation model. Foundations land first (signal registry, equipment interface, hull envelopes), then the universal gun, latency handling, the three class loadouts, redesigned firing arcs, and the ratified visual identity + home/class-select chrome. During Epic 1 the legacy 14-upgrade economy is deliberately left running on the new class stat blocks (the ratified "interregnum") — it is deleted in Epic 2, not here.

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

- **Three classes, three envelopes:** Torpedo Boat (knife hull ~9:1), Battleship (broadest/stepped), Mine Layer (widened aft, transom notch). Only hull dims, HP, and kinematics (speed/accel/braking/turn) vary; rudder authority drops below steerage speed. Movement is telegraph-and-helm (9-detent set-and-forget + rudder).
- **Universal slot grammar:** slot 1 = universal standard gun; slots 2–3 = two class specials (at least one a weapon); slot 4 = an extra slot filled later via the upgrade economy (empty-capable plumbing this epic). The gun is byte-identical on every class — class identity never lives in the gun.
- **Class loadouts:** TB = torpedo tubes + activated speed boost; BB = long-range cannon + star shells (fog-illuminating); ML = activateable blast mines + the Decoy Buoy (a stationary radar-double) — the signature ability + mine mechanics were RESOLVED with Eric 2026-07-22 and shipped in Story 1.8.
- **Equipment law:** every fitted system implements one Equipment interface with its own ammo pool and reload/cooldown that ticks every tick regardless of which slot is selected — switching is tempo, not penalty. Denied fire/activation (out of arc, no ammo, cooling, empty) always gives explicit feedback, never silence.
- **Projectile combat model:** projectiles, never hitscan; no dispersion (shots go exactly where aimed), no damage falloff, flat single-pool damage (no sections, crits, or weak points). Gun shells fly with travel time to the clicked point or first obstacle. The precision-bonus idea is an open decision resolved during Story 1.4.
- **Torpedo laws (FR7):** outrun every hull at base speed, spawn with real bow clearance + brief owner-only grace (self-hit at base speed impossible), run until they hit something, never painted by radar.
- **Mine laws (FR8):** arm after a delay, trigger by proximity, capped per-player (oldest evicted) and globally.
- **Firing arcs (RATIFIED — Story 1.10, Eric 2026-07-23):** the class-era geometry is the de facto geometry, declared in CONFIG and served by ONE shared descriptor (`arcFor`, shared/src/sim/arcs.ts) that both the server checks and the client arc rendering consume — gun family (gun/cannon/starShells) 360°, torpedo bow sector ±30°, mine + decoy on the shared stern rack, boost aimless. Aim is deny-gated (the cursor is never clamped into an arc); denied fire is never silent: a SELF-PRIVATE server denial channel (FrameMsg.denied {slot, reason, seq} — out-of-arc / no-ammo / cooling / blocked) plus a client denial tone, deduped to exactly ONE feedback per press by (slot, seq); island/boundary-blocked stern drops are refused without spending the charge.
- **Counter-intel law (FR10):** any deception entity is a real server-side entity whose emitted signals are wire-indistinguishable (payload AND timing) from a genuine ship's — lies live on the server.
- **Scope guard:** the smoke screen belongs to the equipment/boon pool (Epic 2), not to any class loadout.
- **Cross-cutting NFRs (bind every story):** anti-cheat (nothing outside sight ∪ this-tick radar reaches a client), determinism (seeded RNG only; no Math.random/Date.now in sim), prediction parity at 50 ms dt, frame budget (sim ≤ 3 ms + render ≤ 10 ms at 4× CPU throttle), photosensitivity floor on all new feedback (one-shot pulses 80 ms, 300 ms same-source floor), complexity ≤ 10.
- **Success gate:** `npm run check` green (lint + type-check + all tests) is the ship gate; sim stays deterministic and pure. Latency feel is judged by harness metrics, never localhost feel.

## Technical Decisions

- **Signal registry is the anti-cheat spine (AR5 foundation):** `server/src/game/signals.ts` holds one declarative `SignalSpec` row per spatial signal (`eventType`, `visible()`, `materialize()`, optional `counterIntel`). `observe()` is the only caller of visible/materialize; `frames.ts` stays the sole spatial exit. Perception-invariant tests iterate the registry so a signal cannot exist without a passing invariant case; counterIntel rows additionally require wire- and timing-indistinguishability tests. Later epics only add rows.
- **One-structure loadout law (AR7):** systems move from `weapons/` to `equipment/` behind one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason). A ship's loadout IS its equipment runtime — `{ equipmentId, state }` per slot in `shared/src/sim/loadout.ts` — with no parallel loadout structure. Slot activation routes through a single sinking-activation gate (a passthrough until Epic 5 adds the sinking state).
- **effectiveStats() is the desync firewall:** (class + upgrade counts) → every derived stat via one shared pure function both sides call; new class stat blocks feed it. Hull silhouette geometry lives in shared/ and IS the collision hitbox, so server collision and client render can never disagree. Kinematics stay shared-sim pure so prediction reconciles at the same 50 ms dt.
- **D1 fire-time compensation (AR3):** a fire command carries a client timestamp clamped to `min(claimed, measured RTT + jitter allowance)` via `room.ping()`, never earlier than the previous input, hard ceiling 150 ms. Projectiles (gun/torpedo/mine) spawn back-dated along their trajectory; hits ALWAYS resolve against live server state — no victim rewind, ever. Tick stays 20 Hz. A new simulated-latency harness (`server/scripts/latencyHarness.mjs`, ~150 ms + jitter + loss) reports hit-registration agreement % and prediction-error bounds — those metrics are the acceptance gate.
- **CONFIG is the single source of truth:** `shared/src/constants.ts` holds every gameplay-authoritative tunable; client-only feel knobs live in `client/src/config.ts` and never travel on the wire.
- **Conventions:** cyclomatic complexity ≤ 10 (ESLint error); `shared/` pure and side-free; World/Match keep zero Colyseus imports; seeded RNG only; `PROTOCOL_VERSION` gates any wire-contract change.

## UX & Interaction Patterns

- **Design tokens as single styling source (Story 1.11):** implement the ratified surface/functional/combat-effect colors, drone greys, and the 20 Regatta hues; retire the prototype `#111111`/`#232937` surfaces and consolidate both reds into `denied`. No hex outside the token source. Typography: Geist (display/body) + Geist Mono for every label/readout/stat — uppercase letter-spaced labels, tabular-nums digits, no mono below 9 px. Styling-only: no gameplay/wire change.
- **Regatta Hoist (Story 1.12):** server assigns each human a unique hue from the 20-hue wheel, color index riding the roster so every screen agrees; preference granted unless contended (contention = fair random draw, losers to nearest free hue — UI never implies claiming/locking). Hulls render personal hue on the outline + ~45%-value interior fill; drones always greyscale; HUD chrome stays phosphor-functional. Amber, the red family, storm violet, and phosphor green are never combatant hues; personal-color-as-text uses a lightened text-safe variant ≥ 4.5:1.
- **Silhouettes & nameplates (Story 1.13):** three genuinely distinct top-down silhouettes drawn in the shared linework language, consistent everywhere a hull appears (water, class card, results); PvE drones keep the legacy chevron verbatim (a fourth silhouette no player wears). Every truesight combatant hull wears a nameplate (callsign in hud-micro, text-safe hue variant; drones tagged "DRONE" in grey); never on blips/radar; fades with truesight resolution.
- **Home & class-select chrome (Story 1.14):** home renders over a live ambient CIC canvas (never blank) with wordmark, 14-char callsign field, Class Chip, Color Hoist (20 swatches + preference caption), amber SET SAIL primary button (mode/class sub-line), How-to-Play link, server status, settings gear. Class-select shows three Class Cards on a horizontal rail with silhouette box, fantasy line, and SPEED/TOUGHNESS/TURNING pips using REAL values derived from Story 1.3's CONFIG envelopes, plus a dashed "MORE CLASSES IN DEVELOPMENT" ghost card. First run pushes no default — forced meaningful choice, Torpedo Boat pre-focused for keyboard flow. Connection failure reports on the status line, never a dead screen. (The full new Q/E/R/F + Space input scheme is Epic 2; Epic 1 extends the existing menu minimally in Story 1.3 and delivers full chrome in 1.14.)

## Cross-Story Dependencies

- **1.1 (signal registry) → 1.7, 1.8:** the star-shell illumination and the Mine Layer decoy/deception each land as a registry row + its invariant case; the registry must exist first.
- **1.2 (equipment interface + loadout slots) → 1.4, 1.6, 1.7, 1.8, 1.10:** every gun/special/ability and the arc work build on the Equipment interface and slot state.
- **1.3 (hull envelopes + shared geometry) → 1.13, 1.14:** silhouette rendering and the class-card stat pips both derive from Story 1.3's shared geometry and CONFIG envelopes; also fixes the island-stuck collision bug (playtest finding #64) with a regression test.
- **1.4 (gun) + 1.5 (latency/harness) → 1.6–1.8:** D1 spawn rules apply to torpedoes and mines; the latency harness is the feel gate for all weapon stories. Muzzle-flash masking of back-dated spawns is an Epic 4 tie-in, not resolved here.
- **1.11 (tokens/type) → 1.12, 1.13, 1.14:** the token/type system is the styling substrate for the Regatta system, silhouettes, and chrome.
- **Decisions requiring Eric before/within their story:** precision bonus (1.4), boost × torpedo self-hit rule (1.6). RESOLVED and shipped: Mine Layer signature ability + mine mechanics (1.8 — Decoy Buoy + activateable blast mines, Eric 2026-07-22) and per-weapon firing-arc geometry (1.10 — RATIFIED by Eric 2026-07-23; the GDD open item is closed, not "TBD").
- **Cross-epic:** the interregnum keeps the legacy 14-upgrade economy running on new class stat blocks through Epic 1; Epic 2 strips it and delivers the new economy + Q/E/R/F control scheme.
