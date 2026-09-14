# Epic 8 Context: The Deck

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Replace the shipped boon/upgrade system with a deck-driven one: a captain picks a hull, sails its 40-card authored deck, spawns with only the deck gun and a universal `Shift` boost, is offered a card during the countdown (with one free redraw), and draws catalog v3's weapons into three generic `Q`/`E`/`R` slots and consumables into four `1`–`4` belt slots. Under it sit the card/catalog engine, deck legality, the hidden 10-card per-match consumable pool, a single damage gate, a single ordnance target collector, smoke as a real sight occluder, wake drafting, uncapped mines, chaff/decoy/shield, a re-cut HUD, bots that sail authored decks, and a re-cut How-to-Play. Epic 8 is self-contained: every path runs with no account module (default decks, a null match-record writer), so signing in later changes what a player KEEPS, never what they can DO. It opens with a floor story — the Colyseus 0.18 upgrade — which ships alone before any deck code.

## Stories

- Story 8.0: Colyseus 0.18 Upgrade (floor story)
- Story 8.1: The Card Model and Catalog Engine
- Story 8.2: Legal Decks, Default Decks, and the Door
- Story 8.3: The Draw
- Story 8.4: The Damage Gate and the Ordnance Collector
- Story 8.5: Nine Slots
- Story 8.6: The HUD Bar
- Story 8.7: Consumable Slots and the Refit Card v3
- Story 8.8: Heal Is a Card
- Story 8.9: The Shift Boost, Universal
- Story 8.10: The Opening
- Story 8.11: The Match Consumable Pool
- Story 8.12: Catalog v3 — Ladders and the Deck Gun
- Story 8.13: Catalog v3 — Torpedoes and Mines
- Story 8.14: Catalog v3 — The Gun Family and the Missile
- Story 8.15: Catalog v3 — Shield, Chaff, Decoy
- Story 8.16: Smoke Screen as a Sight Occluder
- Story 8.17: Wake Drafting
- Story 8.18: Bots Sail Decks
- Story 8.19: Results LOADOUT and the Match Record
- Story 8.20: How-to-Play and Copy Re-cut

## Requirements & Constraints

**Standing on every story.** The `Tab` refit offer's shape is untouched (four ids, `1`–`4` to pick). The passive XP tick stays the anti-snowball floor. The master perception invariant keeps EXACTLY SIX declared exceptions — chaff fakes are a second source of the existing jamming carve-out, not a seventh. **No friendly fire, ever**: own ordnance never damages the own hull; the single pinned exception is that your own shells may detonate your own mines. Never invent a card, a number or a consumable — the catalog is Eric's authored document; every `[DRAFT]` value is his to set and the balance harness tunes but never re-designs. `PROTOCOL_VERSION` bumps once per wire-changing story and never for harness or bot work. `npm run check` green gates every landing.

**Deck rules.** A deck is exactly 40 cards belonging to one hull as a LABEL, not a lock (the catalog is hull-agnostic; nothing is class-locked). Legality is exactly two composition rules — the 40-card count, and no more than three lines whose copy 1 fits an equipment slot — plus two ownership bounds (line owned; copies ≤ its catalog cap). Nothing else: a pure-gunboat deck and a zero-heal deck are both legal. The server checks legality once, at the door, and freezes the deck in the seat reservation.

**Anti-cheat.** Deck state is a server-private multiset never on the wire; only an offer's four drawn line ids ride to a client. The match pool's composition never leaves the server (not in frames, not in the welcome, count-only in logs). A client never supplies deck contents — the option sanitizer rejects a `deck` key at both doors and accepts only a `deckId`; dev overrides live behind the existing dev-options env gate.

**Draw economy.** Each banked level pre-draws four DIFFERENT lines weighted only by copies remaining — no rarity, no class weight, no pity. A line already at its cap is never offered. A card leaves the deck when taken. Reopening the refit window never rerolls; the countdown redraw is the one asserted exception. Deck exhaustion silently banks the level and logs once.

**Performance and determinism pins owed.** Perception at 20 observers × 200 live smoke puffs inside the 50 ms tick; mine triggers + the target collector at 500 live mines; the machine-gun stream's per-shell muzzle flash measured before its cadence is trusted. All new sim math (drafting, puff radius, fractional-step floor, reload composition) lives in `shared/` and runs identically on both sides; the stat fold is permutation-invariant over any legal pick order.

## Technical Decisions

**Story 8.0 (the floor story, next to build).** Ruled 0.18 target set (Eric 2026-09-14, amendments 1–3 below): `colyseus` 0.18.5, `@colyseus/core` **0.18.13**, `@colyseus/schema` **5.0.32** (both sides), `@colyseus/tools` 0.18.3, `@colyseus/sdk` 0.18.2, plus `@colyseus/auth` 0.18.2 / `database` 0.18.3 / `admin` 0.18.5 as unmounted `dependencies` and `monitor` 0.18.3 / `playground` 0.18.4 as dev; **`postgres` and `drizzle-kit` are deferred to Story 9.1**; Node stays 22; `@colyseus/database` is pinned exactly because it carries the pre-release `drizzle-orm`. Measured touchpoints: `setSimulationInterval` → `setTimestep` (one call in the arena room; the old name survives as a deprecated forwarder, so the conversion must be made deliberately); `setMetadata` now REPLACES (both rooms already write whole objects); `Client#id` is gone (no uses found); the schema field cap is 63 (arena state 15 fields, player row 8); `createRouter` survives but `__globalEndpoints` does not (one test read it); `static onAuth(token, options, context)` keeps `context.headers`, so the staging and protocol-version gates are untouched. Schema 4 → 5 on both sides is the largest piece; 11 test files plus 15 headless smokes import Colyseus APIs — update them, never delete them. The 0.18 JOIN_ROOM handshake is itself a wire break, so server and client deploy together. **A framework upgrade and a feature never share a PR.** `PROTOCOL_VERSION` bumps because the schema encoder changed, and the join gate must still refuse a mismatched pair. Re-verify the Story 0.1 list (PV gate, joining guard, seat-reservation timing, queued messages, reconnection with a rotated token), run every headless smoke over real sockets, play a full manual match on the dev host, and keep the version on the `0.17.X` cycle scheme.

**Card model.** One catalog module is the single home for every catalog fact: a line is `{ id, kind: equipment | ladder | addon | consumable, cap, tiers[] }` with `tiers.length === cap` pinned, authored through per-kind helpers so the file reads like the source sheet. Copy 1 of an equipment line is a `slotFill` (tier I is the bare weapon); copies in a deck are the tier ceiling reachable that match. Effect kinds are `stat` / `slotFill` / `doctrine` / `behavior` + new `stock`; `slotReplace`, rarity, acquisition cards and the old subdeck walk are deleted; the behavior-hook registry ships empty and pinned empty. Add-ons carry an explicit `appliesTo` equipment list and generate one doctrine effect per entry.

**The fold.** `effectiveStats(cls, cards)` (the ship's boon list renames to `cards`, one id per copy) stays the desync firewall. Order-independence is a pin: every effect is an add, or a mult on a path no other line adds to, with a catalog validator refusing add + mult on one path and a permutation property test. Two derivations live in the clamp and are never card-writable: the per-equipment reload step composed before the global reload ladder, and the fractional-step floor (integer stats accumulate as floats and floor ONCE at the end). The stat-path whitelist is generated from a total per-equipment record; sight range, the range family and the mine trigger radius stay derived and off it.

**Slots.** One flat nine-slot array with fixed roles (gun, boost, weapon ×3, consumable ×4), one slot-state shape for all nine, identical for every hull at 0:00. A weapon fills the first empty weapon slot and can never overflow, so there is no replace/swap/sell flow; fitting a weapon never touches another slot's timer and a slot keeps its clock. Consumables are stacks that never reload; a full belt makes the server REFUSE the pick as a silent no-op (the offer stays byte-identical) and the client greys the card with the same shared predicate. The wire ammo array is slot-aligned and the client rebuilds slot contents by replaying its own card list — no new wire field for contents.

**Single-chokepoint refactors (prerequisites, no wire change).** ONE `applyDamage(victim, amount, source, byId)` replaces all hull-hp writers with a fixed inner order (shield → hp → assist ledger → sink check → damage event); repairs stay the only hp-increase path; no friendly fire is enforced structurally here; a lint rule plus a grep pin assert exactly one hp decrement. ONE `hitTargets(mask)` collector (hull / mine / decoy / ordnance, memoized per tick per mask) is the only way an ordnance step finds anything, with each ordnance row declaring its mask in config — an ordnance step never enumerates world entities.

**Other sim seams.** Held fire is a validated boolean LEVEL on the input message driving a server-side cadence with no back-date. Smoke is ONE `sightClear()` predicate (island LOS ∧ no puff crossed) swapped in at exactly the sight-tier call sites — radar is untouched by construction — with the puff radius curve shared. Wake drafting is a shared max-lift function over last tick's ribbons folded as the third step of the pinned kinematics order (boosted → slowed → drafted → hooks), asserted byte-identical at both call sites and parity-pinned at zero. Mines lose every cap; a mine exists until triggered or destroyed. The `Shift` boost is a permanent slot on the unchanged equipment interface, scaled off POST-fold max speed so the speed ladder is inside it, and stays outside the stats object.

**Placement rules.** A deck enters a match only through the one shared deck loader; every catalog fact lives in the catalog module; hull damage enters only through the damage gate; ordnance never enumerates world entities; persistence (Epic 9) lives in its own server module and never reaches the sim.

## UX & Interaction Patterns

One bottom-centre HUD cluster replaces both the bottom-left hotbar stack and the bottom-right vitals cluster: HP globe · ghost gun chip · `Shift` · Q E R · framed 1–4 belt · helm globe, with a full-width XP strip beneath; nothing renders bottom-left or on the right edge, and the top-centre chrome bar and kill feed are unchanged. A cooldown WIPE (conic uncovering clockwise, with a large tabular seconds numeral) replaces the perimeter track on every cooling slot — dual-coded. The belt's shared frame plus key chips ARE the weapon/consumable distinction; empty and depleted look the same ("empty is empty"); there is no glyph telling you a card's shape — that lives in the hover tooltip and How-to-Play only. Refit cards are a fixed-size face with an icon, name, tier rungs, a kind word, five plain `STAT current → next` rows and a reason-word foot — NO prose; explanation is hover-only. The tier ramp (I phosphor · II info · III storm-readout · IV denied · V amber) is ABSOLUTE, never normalised, and a sixth rung is forbidden. Digits carry two meanings read at keydown (refit open = pick; closed = fire a belt slot), with a short inert grace on close so a mashed pick cannot spend a consumable. The countdown auto-opens the level-zero offer with one REDRAW button, gone when the water goes live. Results replaces the accrued-boons blocks with one LOADOUT block: the ending slot row at reduced scale plus the five ship-ladder tiers. Keyboard-only access is explicitly out of scope; dual-coding, audio/visual twins and the photosensitivity limits still bind every new surface, and micro type is raised to the 9 px floor rather than excepted.

## Cross-Story Dependencies

- 8.0 lands alone and first; no deck code may share its PR.
- 8.1 (catalog engine) precedes everything; 8.2 (deck rules, default decks, the door) needs it; 8.3 (draw) needs 8.2.
- 8.4 (damage gate + ordnance collector) is a no-wire prerequisite of 8.7, 8.13, 8.14, 8.15 and 8.16 and belongs to none of them.
- 8.5 (nine slots) precedes 8.6 (the bar), which precedes 8.7 (consumables); 8.8 (heal as a card) needs 8.7; 8.10 (the opening) needs 8.3, 8.7 and 8.9.
- Catalog content stories 8.12–8.16 all build on 8.1's stubbed lines plus 8.4/8.5.
- 8.18 (bots) needs every prior story; 8.19 and 8.20 close the epic.
- Epic 8 needs NOTHING from Epic 9: the shared deck-legality function, the door's deck loader and the match record are all built here on the default-deck / null-writer path. Epic 9 then plugs a store into the same ports. Whether the production door admits anonymous players is an open owner question that no story here decides.

## Ratified Amendments (durable — survives recompiles)

Source of truth: `epic-8-context-amendments.md`. On any conflict, the amendment wins.

1. **Story 8.0 installs `@colyseus/core` 0.18.13 and `@colyseus/schema` 5.0.32** (Eric 2026-09-14), superseding the AC's 0.18.12 / 5.0.27; core 0.18.13 is a security fix in the `onAuth` area. Every other package at the AC's version.
2. **`@colyseus/auth` / `database` / `admin` are unmounted `dependencies`** (Eric 2026-09-14) — the install proof for the whole 0.18 set; nothing is mounted, routed or configured until Epic 9.
3. **`postgres` and `drizzle-kit` are deferred to Story 9.1** (Eric 2026-09-14), superseding the "present" clause of the 8.0 AC / AR19 / D10; the AC's `drizzle-kit` 0.31.10 does not match the `drizzle-orm` 1.0.0-rc.2 that `@colyseus/database` pins.
4. **Measured corrections of record**: 11 test files + 15 smokes (not "~26 test files"); `setSimulationInterval` survives as a deprecated forwarder; `__globalEndpoints` is removed; the JOIN_ROOM handshake is a wire break independent of the PV gate.
