# Epic 1 Context: The Armory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 makes the class choice matter the instant a captain sails: three genuinely distinct hulls (Torpedo Boat, Battleship, Mine Layer), each with its own size/speed/toughness/turning envelope, a fitted loadout, a ratified silhouette, a personal combatant color, and the home + class-select experience that lets a player pick and SET SAIL in one press. It also lays foundations every later epic builds on — the declarative signal (perception) registry, the unified Equipment interface + slot grammar, fire-time latency compensation, and the ratified design-token/typography system. The gunboat was cut in the 2026-07-19 re-scope; beta roster is exactly these three classes.

## Stories

- Story 1.1: Signal Registry Foundation
- Story 1.2: Equipment Interface & Loadout Slots
- Story 1.3: Three Hull Envelopes
- Story 1.4: Universal Standard Gun (carries the precision-bonus decision)
- Story 1.5: Firing Under Latency (D1) + Latency Harness
- Story 1.6: Torpedo Boat Loadout (torpedo tubes + speed boost)
- Story 1.7: Battleship Loadout (long-range cannon + star shells)
- Story 1.8: Mine Layer Loadout (mines + OPEN signature ability)
- Story 1.9: REMOVED — gunboat cut (number retired, not reused)
- Story 1.10: Firing Arcs for the Class Era
- Story 1.11: Design Tokens & Typography
- Story 1.12: The Regatta Hoist (personal combatant colors)
- Story 1.13: Class Silhouettes on the Water
- Story 1.14: Home & Class-Select Chrome

## Requirements & Constraints

- Three playable classes at beta, each a distinct hull envelope carrying a fitted loadout. Universal slot grammar on every ship: slot 1 = universal standard gun, slots 2–3 = two class specials (at least one a weapon), slot 4 = extra slot filled mid-match by the economy (Epic 1 only plumbs the empty extra slot).
- The standard gun is byte-identical on every class (short cooldown, basic damage); class differentiation never lives in the gun. Loadouts: Torpedo Boat = torpedo tubes + speed boost (activated, several seconds of raised speed); Battleship = long-range cannon + star shells; Mine Layer = proximity mines + a signature ability that is OPEN (decoy buoy under rethink — resolve WITH ERIC before Story 1.8).
- Projectile combat model: no hitscan, no dispersion (shots go exactly where aimed), no damage falloff, flat single-pool damage (no sectional damage, no crits, no weak points). Compass vetoes: one torpedo design per fit, no damage-control parties, no sectional damage. The precision-bonus idea (bonus damage at the exact clicked spot) is an open decision resolved with Eric during the gun story.
- Torpedo laws (FR7): outrun every hull at base speed, spawn with real bow clearance + brief owner-only grace (self-hit at base speed impossible, test-covered), run until they hit something, never painted by radar. Mines arm after a delay, trigger by proximity, capped per-player (oldest evicted) and globally.
- All weapons fire within real firing arcs; mouse aim constrained to the selected weapon's arc; per-weapon arc geometry is redesigned for the class era (arc values are Eric design decisions). Denied fire/activation (out of arc, no ammo, cooling, empty slot) always gives explicit feedback, never silence.
- Any deception entity (e.g. decoy buoy) is a real server-side entity whose emitted signals are wire-indistinguishable from a genuine ship's — payload AND timing (same RNG/jitter stream). Counter-intel lies live on the server.
- Numbers throughout are design targets / prototype reference values, explicitly tunable — acceptance criteria cite them as targets, not contracts. Cross-cutting NFRs bind every story: anti-cheat (nothing outside sight ∪ this-tick radar reaches a client), determinism (seeded RNG only, no Math.random/Date.now in sim), prediction parity at 50 ms dt, complexity ≤ 10, `npm run check` green as the ship gate.
- Fix the island-stuck collision bug (playtest finding #64) with a regression test, landed in the hull-envelopes story.

## Technical Decisions

- **Signal registry (AR5 foundation, lands early in Epic 1):** stand up `server/src/game/signals.ts` with declarative `SignalSpec` rows (`eventType`, `visible()`, `materialize()`, `counterIntel?`); `observe()` becomes the only caller iterating the registry; `frames.ts` stays the sole spatial exit. Perception invariant tests iterate the registry so a signal cannot exist without a passing case. The port is a pure refactor — byte-identical wire output. Later epics only add rows.
- **Equipment unification (AR7):** `weapons/` becomes `equipment/` behind one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason) plus one registry (guns, torpedoes, mines, and future smoke/star shells/decoy/speed boost). One-structure law: a ship's loadout IS its equipment runtime (`{ equipmentId, state }` per slot in `shared/src/sim/loadout.ts`) — no parallel loadout structure. Every timer ticks every tick regardless of selection. Sinking-state activation routes through a single gate point (passthrough until Epic 5; policy TBD).
- **effectiveStats() is the desync firewall:** (ship class + upgrade counts) → every derived stat via one pure shared function both sides call. New class stat blocks feed it. Speed boost applies through effectiveStats()/shared hooks so prediction survives the speed change.
- **Shared silhouette geometry IS the hitbox:** hull geometry lives in `shared/` so server collision and client render derive from the same source and can never disagree. Kinematics stay shared-sim pure.
- **D1 firing under latency (AR3):** fire commands carry a client timestamp clamped to `min(claimed, measured RTT + jitter allowance)` via `room.ping()`, never earlier than the previous input, hard ceiling 150 ms. Projectiles spawn back-dated along their trajectory; hits always resolve against live server state — no victim rewind ever. Torpedoes/mines follow the same spawn rule. Tick stays 20 Hz. A new simulated-latency harness (`server/scripts/latencyHarness.mjs`, ~150 ms + jitter + loss) reports hit-registration agreement % and prediction-error bounds — those metrics, not localhost feel, are the acceptance gate.
- **Interregnum (ratified):** between Epic 1 and Epic 2 the legacy 14-upgrade economy limps along on the new classes — new stat blocks feed effectiveStats(), legacy upgrades keep multiplying them. Ugly but functional; spend stays enabled; deleted in Epic 2. Do not strip legacy upgrades in this epic.
- CONFIG (`shared/src/constants.ts`) is the single source of truth for every gameplay tunable; client-only feel knobs live in `client/src/config.ts`.

## UX & Interaction Patterns

- **Design tokens & type (Stories 1.11):** implement the ratified token set as the single styling source — surface/functional/combat-effect colors, drone greys, the 20 Regatta player hues; consolidate both legacy reds into `denied` (#FF3B3B); retire the v0.16 #111111/#232937 surfaces (no hex outside the token source). Typography: Geist + Geist Mono, uppercase letter-spaced labels, `tabular-nums` digits, documented ramp, no mono below 9 px. Shape register: tactical HUD is 0-radius "Afterimage" floating 1px outlines (no filled panels); port chrome uses 8/12 px radii; activated abilities marked by a chamfered top-right corner. Elevation via glow, not drop shadows.
- **Regatta Hoist (Story 1.12):** server assigns each human a unique hue from the 20-hue wheel, match-consistent (color index rides the roster); preference granted unless contended (contention = fair random draw, losers to nearest free hue; UI must never imply claim/lock). Hulls: bright personal hue on outline, ~45%-value interior fill; drones always greyscale; HUD chrome stays phosphor-functional. Amber / red family / storm violet / phosphor-green bands are never combatant hues; personal-color-as-text uses a lightened text-safe variant at ≥ 4.5:1. Kill feed restyles to spec (mono 14px uppercase top-right, max 5 lines / 6 s TTL).
- **Silhouettes (Story 1.13):** three distinct top-down silhouettes (TB knife ~9:1 ~100 u; Battleship broadest/stepped 124 u; Mine Layer widened aft + transom notch 88 u); PvE drones keep the legacy chevron (a fourth silhouette no player wears). Same geometry everywhere a hull appears (water, class card, results). Nameplates on every truesight combatant hull (callsign in hud-micro, text-safe hue, drones tagged "DRONE"); never on blips/radar; fade with truesight resolution.
- **Home & class-select (Story 1.14, mock `home-class-picker-1.html`):** home over a live ambient CIC canvas — wordmark (`.io` phosphor-bright), callsign field (14-char cap), Class Chip, Color Hoist (20 swatches + preference caption), amber Primary Button ("SET SAIL" + mode/class sub-line), How-to-Play link, server status, settings gear. Class-select: three Class Cards on a horizontal rail with SPEED/TOUGHNESS/TURNING pips derived from real Story 1.3 CONFIG values (not placeholders), loadout slots, plus a dashed "MORE CLASSES IN DEVELOPMENT" ghost card; keys 1–3/arrows highlight, Enter picks, ESC closes without change. First-run pushes no default — forced meaningful choice, Torpedo Boat card pre-focused for keyboard flow. Connection failure reports on the status line, never a dead screen.

## Cross-Story Dependencies

- 1.1 (signal registry) and 1.2 (equipment/loadout) are foundations; the Mine Layer decoy story (1.8) builds on the registry's `counterIntel` rows.
- 1.3 (hull envelopes) precedes 1.4 (gun) and 1.10 (arcs), and its CONFIG stat values feed the class-card pips in 1.14.
- 1.4–1.8 all register systems into the equipment registry from 1.2; 1.10 tunes arcs across all systems from 1.4–1.8.
- 1.5 (latency harness) is depended on by the gun/D1 acceptance gate and reused by later epics.
- 1.11 (tokens) precedes 1.12 (Regatta) and 1.13 (silhouettes); 1.3's shared silhouette geometry precedes 1.13's rendering.
- Open decisions to resolve WITH ERIC inside their stories: precision-bonus (1.4), boost × torpedo self-hit rule (1.6), Mine Layer signature ability + mine mechanics (1.8), per-weapon arc values (1.10).
- Deferred to later epics: full Q/E/R/F + Space-hold input scheme and settings overlay (Epic 2); boon economy that fills the extra slot and replaces the legacy upgrades (Epic 2); muzzle-flash masking and blip class-legibility (Epic 4); omniscient-reveal nameplate scope (Epic 5); class-select mode-pick queue liveness (Epic 6).
