# Epic 1 Context: The Armory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the class pick matter: any of the three beta classes — Torpedo Boat, Battleship, Mine Layer — must feel genuinely different at 0:00, through distinct hull envelopes (size, speed, toughness, turning), distinct silhouettes, a personal combatant color, a fitted class loadout, and a real class-select experience. This epic replaces the prototype classes with the beta three (gunboat cut 2026-07-19; its speed boost migrated to the Torpedo Boat), unifies all fitted systems under one Equipment interface with the universal slot grammar, lands fire-time latency compensation, and installs the signal-registry perception foundation every later epic's fog-of-war features build on. Class identity and the loadout spine come first because everything after (economy, texture, modes) touches them.

## Stories

- Story 1.1: Signal Registry Foundation
- Story 1.2: Equipment Interface & Loadout Slots
- Story 1.3: Three Hull Envelopes
- Story 1.4: Universal Standard Gun (carries the precision-bonus decision)
- Story 1.5: Firing Under Latency (D1) + Latency Harness
- Story 1.6: Torpedo Boat Loadout (carries the boost × torpedo ruling)
- Story 1.7: Battleship Loadout
- Story 1.8: Mine Layer Loadout (carries the signature-ability + mine-mechanics decisions)
- Story 1.9: REMOVED — gunboat cut 2026-07-19; number retired, not reused
- Story 1.10: Firing Arcs for the Class Era
- Story 1.11: Design Tokens & Typography
- Story 1.12: The Regatta Hoist
- Story 1.13: Class Silhouettes on the Water
- Story 1.14: Home & Class-Select Chrome

## Requirements & Constraints

**Classes & loadouts.** Three classes at beta, each a distinct hull envelope with a fitted loadout (Submarine → Carrier bench deferred post-playtest). Universal slot grammar: slot 1 = universal standard gun (byte-identical on every class — differentiation never lives in the gun), slots 2–3 = two class specials (at least one a weapon), slot 4 = extra slot filled mid-match by the upgrade economy (empty-capable plumbing only in this epic). Loadouts: Torpedo Boat = torpedo tubes + activated speed boost (several seconds of raised speed); Battleship = long-range cannon + star shells; Mine Layer = proximity mines + a signature ability that is OPEN (decoy buoy under rethink; mine mechanics themselves flagged unsettled — both resolved with Eric before 1.8 implementation). The smoke screen belongs to the equipment/boon pool, not any class.

**Combat model.** Projectiles only, never hitscan: no dispersion, no damage falloff, flat single-pool damage — no sectional damage, no crits, no torpedo variety, no damage-control parties (hard scope vetoes). Shells fly with travel time to the clicked point or first obstacle. Torpedo laws: outrun every hull at base speed, real bow clearance + brief owner-only grace (self-hit at base speed must be impossible, by test), run until impact, never painted by radar. Mines arm after a delay, trigger by proximity, per-player live cap (oldest evicted) plus a global cap. Counter-intel law: any deception entity is a real server-side entity whose emitted signals are wire-indistinguishable from a genuine ship's — payload AND timing (same RNG/jitter stream) — regardless of which deception feature ships.

**Controls & feedback.** Movement stays telegraph-and-helm (9-detent orders + rudder) with per-class acceleration/braking; rudder authority reduces below steerage speed. Mouse aim constrained to the selected weapon's real arc; denied fire or activation (out of arc, no ammo, cooling, empty slot) always gives explicit feedback, never silence. The full Q/E/R/F input scheme is Epic 2 — this epic keeps current bindings, extended minimally.

**Cross-cutting gates.** All numbers are design targets in CONFIG, explicitly tunable — acceptance criteria cite them as targets, not contracts. Anti-cheat: nothing spatial leaves the server outside the perception boundary; counter-intel lies live server-side. Determinism: seeded RNG streams only, no Math.random()/Date.now() in sim. Frame budget: sim ≤ 3 ms + render ≤ 10 ms at 4× CPU throttle. Latency: gun feel is gated by measurable proxies (hit-registration agreement %, prediction-error bounds) on a simulated ~150 ms harness — never localhost feel. `npm run check` green ships every story; complexity ≤ 10.

## Technical Decisions

- **Signal registry (lands first).** Every spatial signal becomes one declarative row `{ eventType, visible(), materialize(), counterIntel? }` in server `signals.ts`; `observe()` is the only caller; perception invariant tests iterate the registry so a signal cannot exist without coverage. Story 1.1 is a pure refactor (byte-identical wire output); counterIntel rows additionally get wire-indistinguishability tests. Epic 4 then only adds rows.
- **Equipment unification.** Server `weapons/` becomes `equipment/`: one interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason) and one registry for every fitted system. One-structure law: a ship's loadout IS its equipment runtime (`{ equipmentId, state }` per slot in shared `loadout.ts`) — no parallel loadout structure. Every timer ticks every tick regardless of selection. Slot activation routes through a single sinking-activation gate (passthrough until Epic 5).
- **Fire-time compensation (D1).** Fire commands carry a client timestamp clamped to `min(claimed, measured RTT + jitter allowance)` via room ping, never earlier than the previous input, hard ceiling 150 ms. Projectiles spawn back-dated along their trajectory; hits always resolve against live server state — no victim rewind, ever. Torpedoes/mines follow the same spawn rule. Tick stays 20 Hz. (Muzzle-flash masking of the back-date is an Epic 4 tie-in.)
- **Silhouette IS the hitbox.** Class silhouette geometry lives in shared/ so server collision and client render derive from the same source and can never disagree. Hull dims per the ratified board: TB knife ~9:1 at 100 u, BB broadest/stepped 124 u, ML widened aft + transom notch 88 u. Decoupling render from hitbox is the named fallback, not the plan.
- **The interregnum (ratified).** Between Epic 1 and Epic 2 the legacy 14-upgrade economy limps along on the new classes: new class stat blocks feed `effectiveStats()`, legacy upgrades keep multiplying them. Ugly, functional, deleted in Epic 2. Spend stays enabled — do not strip it here.
- **Ability effects go through shared paths.** The TB speed boost implements `Equipment` with its own cooldown and applies via `effectiveStats()`/shared hooks so client prediction survives the speed change; boost state is owner-visible (slot cooling state) and produces no wire field revealing it to enemies beyond observed kinematics.
- **Star-shell illumination is a registry row** with its own invariant case — ships inside the lit area become visible to the firer's side, never revealing beyond the illuminated zone; area/duration are CONFIG targets.
- **Latency harness is infrastructure.** `server/scripts/latencyHarness.mjs` (~150 ms + jitter + loss) drives full matches and reports the NFR3 metrics; it is the acceptance gate for Story 1.5 and gun tuning.
- **Known bug to fix in 1.3:** the island-stuck collision bug (playtest finding #64), with a regression test.

## UX & Interaction Patterns

- **Tokens & type (1.11).** The ratified token set becomes the single styling source: surfaces, functional colors (phosphor family, amber, storm violet, `denied` consolidating both legacy reds), combat-effect colors, drone greys, 20 Regatta player hues. No hex outside the token source; deprecated prototype surfaces die. Geist display/body + Geist Mono for every label/readout/stat — uppercase letter-spaced labels, tabular-nums digits, no mono below 9 px post-scale. Styling-only story: no gameplay or wire change rides along.
- **Regatta Hoist (1.12).** Server assigns each human a unique hue from the 20-hue wheel; preference granted unless contended (contention = fair random draw, losers to nearest free hue; UI never implies claiming/locking); color index rides the roster. Hulls: bright hue outline + same hue at ~45% value fill. Drones always greyscale; HUD chrome stays phosphor-functional. Amber, the red family, storm violet, and the phosphor-green band are never combatant hues. Personal color as text always uses a lightened text-safe variant at ≥ 4.5:1. Kill feed restyles: mono 14 px uppercase, top-right, max 5 lines, 6 s TTL, names 600-weight in text-safe variants.
- **Silhouettes & nameplates (1.13).** Three genuinely distinct top-down silhouettes, consistent everywhere a hull appears (water, class card, results); the legacy chevron is reserved for PvE drones — a fourth silhouette no player wears. Every truesight combatant hull wears a nameplate (hud-micro register, text-safe hue variant; drones tagged "DRONE"); never on blips or radar paints; fades with truesight resolution.
- **Home & class-select (1.14).** Home renders over a live ambient CIC canvas (never blank): wordmark, callsign field (14-char cap), Class Chip, Color Hoist (20 swatches + preference caption), amber SET SAIL button with mode/class sub-line, How-to-Play link, server status, settings gear. Class-select: three 356 px Class Cards on a horizontal rail (silhouette box, fantasy line, SPEED/TOUGHNESS/TURNING pips derived from the real CONFIG envelopes — not placeholders; pips double as a balancing aid) plus a dashed "MORE CLASSES IN DEVELOPMENT" ghost card; keys 1–3/arrows highlight, Enter picks, ESC closes without change. First-run class select pushes no default — three cards, forced meaningful choice, Torpedo Boat card pre-focused for keyboard flow. Connection failure reports on the status line, never a dead screen.
- **Register rules.** Tactical/HUD = sharp 0-radius "Afterimage" floating 1px outlines, no filled panels; port chrome (DOM) = 8/12 px radii; glow encodes state, never decoration; no drop shadows. Photosensitivity floor binds all new feedback (one-shot pulses 80 ms, 300 ms same-source floor).

## Cross-Story Dependencies

- **1.1 (registry) is the foundation story** — star shells (1.7) and especially any counterIntel row from 1.8's resolved ability build on it. Land it early.
- **1.2 (equipment/loadout) precedes all loadout stories (1.6–1.8)**; 1.3 (envelopes) precedes 1.4 (gun), 1.13 (silhouettes), and 1.14 (class cards derive pip values from its CONFIG).
- **1.5's latency harness gates gun behavior** — 1.4 tuning and D1 are validated by its metrics.
- **1.10 (arcs) needs all seven fitted systems** from 1.4–1.8 (gun, torpedo tubes, speed boost, long-range cannon, star shells, mines, ML signature ability).
- **1.11 (tokens) precedes 1.12 (Hoist)**, which consumes the hue set.
- **Decisions to resolve WITH ERIC, in-story:** precision bonus adopt-or-drop (1.4), boost × torpedo self-hit rule (1.6 — FR7 only guarantees no self-hit at base speed), ML signature ability + mine mechanics (1.8, before implementation), per-weapon arc values (1.10).
- **Epic 2 boundary:** legacy upgrade economy and current bindings survive this epic (the interregnum); the smoke screen's future home is the Epic 2 boon pool; heal stays an open question — keep mechanisms heal-compatible without committing.
- **Epic 4 tie-ins deferred:** muzzle-flash masking of back-dated spawns, class-legible blip rendering (blip geometry rules exist but the blip path lands in Epic 4).
- **Epic 0 substrate is complete and assumed**; the Track-2 hosting move is explicitly not a prerequisite for any Epic 1 work.
