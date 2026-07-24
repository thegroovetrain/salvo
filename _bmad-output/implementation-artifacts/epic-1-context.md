# Epic 1 Context: The Armory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The Armory makes the lobby pick a real promise: choosing a class and the game feels genuinely different the moment you sail — a distinct hull envelope (size, speed, toughness, turning), a shape-legible silhouette, a personal combatant color, a fitted loadout, and the home/class-select experience that sells all of it in one glance. It also stands up the structural spine every later epic builds on: the declarative perception signal registry and the unified Equipment/loadout model. Beta roster is exactly three classes — Torpedo Boat, Battleship, Mine Layer (the gunboat was cut 2026-07-19; Submarine → Carrier are bench-deferred).

## Stories

- Story 1.1: Signal Registry Foundation
- Story 1.2: Equipment Interface & Loadout Slots
- Story 1.3: Three Hull Envelopes
- Story 1.4: Universal Standard Gun (carries the precision-bonus decision)
- Story 1.5: Firing Under Latency (D1) + Latency Harness
- Story 1.6: Torpedo Boat Loadout (torpedo tubes + speed boost)
- Story 1.7: Battleship Loadout (long-range cannon + star shells)
- Story 1.8: Mine Layer Loadout (proximity mines + decoy buoy)
- Story 1.9: REMOVED (gunboat cut 2026-07-19; number retired, not reused)
- Story 1.10: Firing Arcs for the Class Era
- Story 1.11: Design Tokens & Typography
- Story 1.12: The Regatta Hoist (personal colors)
- Story 1.13: Class Silhouettes on the Water
- Story 1.14: Home & Class-Select Chrome

## Requirements & Constraints

- Three playable classes, each a distinct hull envelope carrying a fitted loadout; the class is the whole "promise." Loadouts (all resolved): **Torpedo Boat** = torpedo tubes + speed boost (several seconds of raised speed); **Battleship** = long-range cannon + star shells (illuminate a fog region to truesight); **Mine Layer** = proximity-fused mines + decoy buoy (stationary radar-double, one live per owner, ~30 s life, resolved 2026-07-22).
- Universal slot grammar: slot 1 = the standard gun (byte-identical on every class — class identity NEVER lives in the gun), slots 2–3 = two class specials (≥1 a weapon), slot 4 = an extra slot filled mid-match via the upgrade economy (empty-capable plumbing in Epic 1).
- Every fitted system implements one Equipment interface with its own ammo pool + reload/cooldown that ticks every tick regardless of which slot is selected — switching is tempo, never penalty.
- Projectile combat model: no hitscan, no dispersion (shots go exactly where aimed), no damage falloff, flat single-pool damage (no sections/crits/weak points). Gun shells fly to the clicked point or first obstacle. Precision-bonus (bonus damage at the exact clicked spot) is an open idea resolved during Story 1.4.
- Torpedo laws: outrun every hull at base speed, real bow clearance + brief owner-only grace (self-hit at base speed impossible), run until they hit, never painted by radar.
- Mines arm after a delay, trigger by proximity, per-player live cap (oldest evicted) + global cap.
- Any deception entity (decoy buoy) is a real server-side entity whose emitted signals are wire-indistinguishable from a genuine ship's — counter-intel law: lies live on the server (payload AND timing, same RNG/jitter stream).
- Movement is telegraph-and-helm: 9-detent set-and-forget engine orders + rudder; per-class accel/braking; rudder authority drops below steerage speed. Denied fire/activation always gives explicit feedback, never silence.
- Cross-cutting non-functionals bind every story: authoritative 20 Hz fixed tick with client-side prediction (reconcile-and-replay at the same 50 ms dt) and ~100 ms snapshot-interpolated contacts; everything spatial leaves the server only through the perception boundary (nothing outside sight ∪ this-tick radar paints); seeded RNG only (no `Math.random`/`Date.now` in sim); shared sim stays pure and side-free; World/Match keep zero Colyseus imports; cyclomatic complexity ≤ 10; `npm run check` green is the ship gate. Frame budget on the reference device: 16.6 ms = sim ≤ 3 ms + render ≤ 10 ms + headroom ≥ 3.6 ms. Photosensitivity floor on all new feedback: one-shot pulses ≤ 80 ms with a 300 ms same-source floor.
- Numbers throughout are design targets / tunable CONFIG values, not contracts.

## Technical Decisions

- **Signal registry (AR5-foundation, Story 1.1):** `server/src/game/signals.ts` holds `SignalSpec` rows (`eventType`, `visible()`, `materialize()`, `counterIntel?`); `observe()` iterates `SIGNAL_REGISTRY` as the sole caller of visible/materialize; `frames.ts` stays the only spatial exit. Invariant tests iterate the registry so a signal cannot exist without coverage. Story 1.1 is a pure refactor — byte-identical wire output.
- **Equipment unification (AR7, Story 1.2):** `server` `weapons/` becomes `equipment/` with one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason). One-structure law: a ship's loadout IS its equipment runtime (`{ equipmentId, state }` per slot in `shared/src/sim/loadout.ts`) — no parallel loadout structure. Sinking-state activation routes through a single gate point (passthrough until Epic 5).
- **effectiveStats() firewall:** (ship class + upgrade counts) → every derived stat via one pure shared function both sides call; new class stat blocks feed it. Silhouette geometry lives in shared/ so server collision and client render can never disagree — "the silhouette IS the hitbox" holds by construction.
- **Interregnum (ratified 2026-07-17):** between Epic 1 and Epic 2 the legacy 14-upgrade economy keeps functioning against the new class stat blocks; spend stays enabled; deleted in Epic 2.
- **D1 fire-time compensation (AR3, Story 1.5):** fire commands carry a client timestamp clamped to `min(claimed, measured RTT + jitter)`, hard ceiling 150 ms, never earlier than prior input; projectiles spawn back-dated along trajectory; hits always resolve against live server state — no victim rewind ever. Gated by the new simulated-latency harness (hit-registration agreement %, prediction-error bounds — never localhost feel).
- **Firing arcs — RATIFIED (Eric, 2026-07-23, Story 1.10):** gun family (standard gun / long-range cannon / star shells) fires 360° (no arc); torpedoes launch in a bow sector ±30°; the Mine Layer stern rack (mines + decoy buoy) drops dead astern regardless of aim; speed boost aims nothing. Denial is server-authoritative and self-private (out-of-arc / no-ammo / cooling / blocked stern drop) — never silent, and a blocked stern drop is refused without spending the charge.
- **Scope vetoes (AR16):** no torpedo variety, no damage-control parties, no sectional damage.

## UX & Interaction Patterns

- **Design tokens (Story 1.11):** the ratified token set is the single styling source — surfaces, functional colors, combat-effect colors, drone greys, the 20 Regatta hues (both reds consolidated into `denied` #FF3B3B); deprecated #111111/#232937 surfaces are gone; no hex outside the token source. Typography: Geist (display/body) + Geist Mono for every label/readout/stat — uppercase letter-spaced labels, `tabular-nums` digits, no mono below 9 px post-scale.
- **Regatta Hoist (Story 1.12):** server assigns each human a unique hue at match start (preference granted unless contended; contention = fair random draw, losers to nearest free hue; color index rides the roster so every screen agrees). Hull = bright hue outline + same hue ~45% value interior fill; drones always greyscale; HUD chrome stays phosphor-functional. Amber, the red family, storm violet, and the phosphor-green band are never combatant hues; personal-color-as-text uses a lightened text-safe variant ≥ 4.5:1.
- **Silhouettes (Story 1.13):** three genuinely distinct top-down silhouettes (TB knife ~9:1; BB broadest/stepped; ML widened aft + transom notch) drawn in the shared linework language, consistent everywhere a hull appears (water, class card, results). PvE drones keep the legacy chevron verbatim — a fourth silhouette no player wears. Nameplates on all truesight combatant hulls (callsign in hud-micro register, text-safe hue variant; drones tagged "DRONE" in drone grey); never on blips/radar; fade with truesight.
- **Home chrome (Story 1.14, UX-DR25):** DOM renders over a live ambient CIC canvas (never blank) — wordmark (`.io` in phosphor-bright), callsign field (14-char cap), Class Chip (current pick at a glance), Color Hoist (20 round swatches + preference caption, must never imply claiming/locking), amber Primary Button ("SET SAIL" with a mode/class sub-line, Enter equivalent, defers to the status line while connecting), mode pick (Solo · Solo vs AI), How-to-Play link, server status, settings gear. Connection failure reports plainly on the status line — never a dead screen.
- **Class-select layer (Story 1.14, UX-DR26):** three Class Cards on a horizontal rail (356 px: name+key, fantasy line, silhouette box at identity-board geometry, SPEED/TOUGHNESS/TURNING pip scales, loadout slots, pick button; selected = personal-color border/glow) plus a dashed ghost card ("MORE CLASSES IN DEVELOPMENT") clipped at the edge. Keys 1–3 / arrows highlight, Enter picks, ESC closes without change. **First-run pushes NO default** — three cards, forced meaningful choice, Torpedo Boat pre-focused for keyboard flow (ruled 2026-07-19).
- **Pips are real numbers (Story 1.14):** SPEED/TOUGHNESS/TURNING pip values derive from Story 1.3's CONFIG envelopes — actual balance-facing numbers, not placeholders (Eric wants pips as a balancing aid; resolves UX open question #13). This supersedes DESIGN.md/mock text that still labels them "placeholder values."
- **Stale-doc caution for chrome:** the ratified mocks and DESIGN.md/EXPERIENCE.md predate the gunboat cut — they still show a Primary Button sub-line "DEPLOY AS GUNBOAT," a first-run default of Gunboat, and class-layer keys "1–4." The 2026-07-19 rulings (no default, TB pre-focused, three classes → keys 1–3) win. Use a real beta class in the sub-line.
- **Input scheme note:** the full new Q/E/R/F + Space-hold scheme lands in Epic 2; Epic 1 combat uses the existing bindings with explicit denied feedback. ESC closes the topmost surface (else opens non-pausing settings); a focused DOM overlay/text field suppresses keyboard from the sim while the sim never pauses (typing in the callsign field must not steer).

## Cross-Story Dependencies

- 1.1 (signal registry) and 1.2 (equipment/loadout) are the foundation the loadout stories (1.6–1.8) and the decoy story (1.8) build on; do them first.
- 1.3 (hull envelopes + shared silhouette geometry) precedes 1.4/1.6/1.7/1.8 (loadouts fit onto the classes), 1.13 (renders that geometry), and 1.14 (its pip values come from 1.3's CONFIG).
- 1.4 (gun) precedes 1.5 (D1 applies to gun/torpedo/mine spawn) and 1.10 (arcs cover all seven fitted systems from 1.4–1.8).
- 1.11 (tokens) precedes 1.12 (Regatta Hoist uses the hue set), 1.13, and 1.14 (chrome uses tokens + hues).
- Story 1.14 depends on 1.3 (pip values, silhouettes), 1.11 (tokens/type), 1.12 (Color Hoist hues), and 1.13 (silhouette rendering for the card boxes).
- Epic 0 (Colyseus 0.17) precedes all of Epic 1. The signal registry (1.1) is consumed by Epic 4 (each texture feature = one row + invariant case); the decoy buoy's counter-intel row is the pattern Epic 4 extends.
