---
title: 'Story 2.5: Boon Effect Engine (Two Homes + Hooks)'
type: 'feature'
created: '2026-07-28'
status: 'in-progress'
baseline_revision: '67f5b2f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The coming boon economy (2.6–2.10) needs an effect engine, and today every "effect" is bespoke: 14 legacy stat upgrades hard-wired into `effectiveStats`, one hand-rolled timed ability (`boostUntil` + `boostedKinematics`), and a loadout the client silently re-derives from class alone — so a catalog boon that changes stats, slots, or on-water behavior has no lawful path that survives client prediction.

**Approach:** Build the ratified two-homes-plus-hooks engine (epics.md:632-645, AR4; amendments 28–30): `shared/src/sim/boons.ts` (`BoonDef { id, category, effects[] }`, four `BoonEffect` kinds) and `shared/src/sim/hooks.ts` (`HOOK_REGISTRY`, kinematics attachment only). `stat` effects flow only through `effectiveStats()`; `slotFill`/`slotReplace` mutate the one `LoadoutSlot[]` structure via shared pure helpers; `behavior(hookId, params)` executes registry hooks per-tick in BOTH the server world step and the client predictor. Full dormant plumbing ships (`ShipRecord.boons`, `World.applyBoon`, self-private `you.boons`, PV 12→13); nothing grants boons in production until 2.7. Proven end-to-end by test boons exercising all four effect kinds.

## Boundaries & Constraints

**Always:**

- **Two homes + hooks, nothing else (story AC):** applying a boon may (1) change derived stats only via `effectiveStats(cls, counts, boons)` and (2) change slot state only in the one `LoadoutSlot[]` structure via the shared slot-effect helpers; `behavior` effects only execute registered hooks. Property-test this: a stat-only boon leaves the loadout untouched (reference-equal), a slot-only boon leaves stats byte-identical, and application touches no other ship field.
- **Effect vocabulary:** `stat` = `{ kind:'stat', path, mult? | add? }` over a typed whitelist of existing `EffectiveStats` scalars (legacy `CONFIG.upgrades` vocabulary generalized; applied after legacy upgrade stacking, in boon-list order — deterministic). `slotFill` = `{ kind:'slotFill', equipmentId }`, fills `SLOT_EXTRA` only when empty, else no-op. `slotReplace` = `{ kind:'slotReplace', from, to }`, replaces the slot holding `from` with `to` (fresh full-pool `EquipmentState`), no-op if `from` unfitted (mirrors `applyGrantEffects`' fail-closed guard, world.ts:580). `behavior` = `{ kind:'behavior', hookId, params: Readonly<Record<string, number>> }`.
- **Hook law (amendments 29–30):** hooks are pure, deterministic, side-effect-free; exactly ONE attachment point ships — per-tick kinematics `(kin: ShipConfig, params) => ShipConfig`, identity-returning (same reference) when inactive, generalizing `boostedKinematics` (boost.ts:22) without touching it. The hook CONTRACT (discriminated `HookSpec.kind`) stays generic/heal-compatible. `HOOK_REGISTRY` ships EMPTY, deep-frozen (signals.ts:610 `deepFreezeRows` pattern); engine call sites take the registry as a parameter (production passes `HOOK_REGISTRY`; tests inject test registries). Unknown `hookId` at execution = silent no-op (fail-closed).
- **Registry lock (story AC):** the parity suite iterates `HOOK_REGISTRY` with the signals.test.ts:96-115 pattern — literal expected-key list + `toHaveLength` pin + per-row shape/purity/determinism/parity checks — so a hook cannot be registered without coverage, even while the registry is empty.
- **One derivation, both sides:** slot effects apply through ONE shared per-effect function used incrementally by the server (live loadout, untouched slots keep their ammo state) and replayed by the client over `loadoutFor(cls, stats)`; a property test pins that server slot ids == client-derived slot ids after arbitrary boon sequences.
- **Server plumbing (amendment 28):** `ShipRecord.boons: BoonId[]` (init `[]`; `redeployShip` wipes it with upgrades/offers; `respawn` preserves it); `World.applyBoon(ship, boonId)` mirrors `applyUpgrade` (world.ts:533): append → recompute `ship.stats` via `effectiveStats(cls, upgrades, resolvedBoons)` → apply slot effects to `ship.loadout` — no event queued (2.7 owns spend UX). `stepShips` composes per-tick kinematics as `hookKinematics(boostedKinematics(...), boonBehaviors, registry)` — boost first, hooks after, order documented. Resolved boon defs are cached on the record beside `stats` (allocation-free identity fast path at zero boons). World accepts an injectable hook registry (options, default `HOOK_REGISTRY`) so server tests prove real-tick execution.
- **Wire (amendment 28):** `OwnShip.boons: string[]` — self-private, rides `you` and NOTHING else (types.ts:166-173 anti-cheat comment extended); `frames.ts` copies it; PV 12→13 with the index.ts changelog convention. Client resolve is fail-closed: unknown ids dropped, no throw.
- **Client parity:** `ownStatsChanged` (roomBindings.ts:272) also diffs `boons`; `applyOwnStats` resolves defs, recomputes stats and `ownSlots` via the shared derivation, and hands the predictor its boon behaviors; `Predictor.tickKin` (prediction.ts:330) composes the SAME boost-then-hooks order (registry injectable, default `HOOK_REGISTRY`).
- **Zero-boon identity:** with no boons applied, `effectiveStats` output, loadouts, tick kinematics, and prediction are byte-identical to today — pinned by regression tests (existing stats/loadout/prediction suites stay green unmodified except where signatures grow optional params).
- Cross-cutting: complexity ≤ 10; shared stays pure/side-free (seeded RNG only — the engine needs no RNG); World/Match keep zero Colyseus imports; registries UPPER_SNAKE, ids camelCase; barrel exports + barrel.test block; `npm run check` green; no VERSION bump.

**Block If:**
- Any boon state would need to appear on contacts/blips/spectator frames or a new event kind — information discipline says self-private only; anything more is a design question for Eric.
- The engine turns out to require changing the `Equipment` interface, `boostedKinematics` behavior, or a second attachment point to satisfy the ACs (amendments 29–30 forbid all three).

**Never:**
- No catalog content: `BOON_CATALOG` ships empty; test boons/hooks live in tests only, never in production registries (amendment 29). No offer/earn/spend changes (2.6/2.7). No hotbar/tooltip UI change — the "boons rendered as absence" pins (hotbar.test.ts:343,360) stay green (2.9 fills them). No damage-into-`EffectiveStats` migration (equipmentInfo.ts seam untouched until a catalog boon needs it). Legacy 14 upgrades untouched. No boost migration. No design-doc edits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stat boon | boon `{stat: maxSpeed mult 1.1}` on upgraded ship | Applied after legacy stacking; only targeted stat moves (AFFECTED-map style diff) | — |
| slotFill | extra slot empty | Slot 3 = equipmentId, fresh full pool at current stats | — |
| slotFill occupied | extra slot already filled | No-op, existing state untouched | Silent |
| slotReplace | `from` fitted (e.g. torpedo→variant) | That slot's id swaps, fresh full-pool state; other slots keep ammo/reload state | — |
| slotReplace unfitted | `from` not in loadout | No-op | Silent |
| Behavior boon | kinematics hook via injected test registry | Server tick and predictor produce identical positions (9-decimal parity, prediction.test.ts:340 pattern) | — |
| Unknown hookId | behavior effect, id not in registry | Kinematics unchanged (identity), no throw | Silent no-op |
| Unknown boon id | `you.boons` carries junk id | Dropped at resolve; rest applied | Silent |
| Zero boons | ship with `boons: []` | All paths byte-identical to pre-story behavior; identity references (no allocation) | — |
| Order | two stat boons on same path | Applied in list order; deterministic, same result both sides | — |
| Redeploy / respawn | ship with boons dies / redeploys | Respawn preserves boons+stats+loadout; redeploy wipes to `[]` (with upgrades) | — |
| Privacy | observer frames for a booned enemy | `boons` never on Contact/spectator output; rides `you` only | Invariant suite green |

</intent-contract>

## Code Map

- `shared/src/sim/boons.ts` — NEW: `BoonId`/`BoonCategory`/`BoonEffect` (4 kinds) /`BoonDef`; empty `BOON_CATALOG` (deepFrozen); `resolveBoons` (fail-closed); per-effect slot application + `slotsWithBoons` client derivation; stat-effect fold consumed by stats.ts
- `shared/src/sim/hooks.ts` — NEW: `HookSpec` (kind-discriminated, kinematics only), empty `HOOK_REGISTRY` (deepFreezeRows idiom), `hookKinematics(kin, behaviors, registry)` fold
- `shared/src/sim/stats.ts` — `effectiveStats(cls, counts, boons = [])`: boon stat effects after legacy stacking; zero-boon identity
- `shared/src/sim/loadout.ts` — only if the shared helpers need an export seam (keep `loadoutFor` signature)
- `shared/src/types.ts` — `OwnShip.boons` + self-private anti-cheat comment
- `shared/src/index.ts` — barrel exports; `PROTOCOL_VERSION` 12→13 + changelog line
- `server/src/game/world.ts` — `ShipRecord.boons` + cached resolved defs; `applyBoon`; `stepShips` boost-then-hooks composition; redeploy/respawn semantics; injectable registry option
- `server/src/game/frames.ts` — `you.boons`
- `client/src/net/roomBindings.ts` — `ownStatsChanged` diffs boons
- `client/src/main.ts` — `applyOwnStats(g, cls, upg, boons)`: resolve, stats, `ownSlots` via shared derivation, predictor handoff
- `client/src/sim/prediction.ts` — `setBoons(behaviors)`; `tickKin` composes hooks after boost; registry injectable
- Tests: NEW `shared/src/__tests__/boons.test.ts` + `hooks.test.ts` (registry lock, purity, four kinds, two-homes property, matrix edges); `stats.test.ts` (+boon cases, zero-boon identity); `barrel.test.ts` (+2.5 block, PV 13); `server/src/__tests__/boons.test.ts` (real-tick hook via injected registry, applyBoon two-homes, redeploy/respawn, privacy pin), `goldenFrames` snapshot regen; `client/src/__tests__/prediction.test.ts` (+behavior-boon parity vs local server reference), `upgrades.test.ts` (+boons in recompute gate); hotbar pins untouched
- Bookkeeping: `sprint-status.yaml` (2-5 → done at end), `_bmad-output/gds-workflow-status.yaml` (next_expected + last_updated), amendments 28–30 (already recorded)

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/hooks.ts` -- hook contract + empty registry + kinematics fold -- amendments 29–30
- [x] `shared/src/sim/boons.ts` -- effect types, empty catalog, resolve + slot/stat engines -- two homes
- [x] `shared/src/sim/stats.ts` -- optional boons param, post-stacking application -- desync firewall intact
- [x] `shared/src/types.ts` + `shared/src/index.ts` -- wire field, barrel, PV 13 -- amendment 28
- [x] `server/src/game/world.ts` + `frames.ts` -- record field, applyBoon, tick composition, wire copy -- dormant plumbing
- [x] `client/src/net/roomBindings.ts` + `main.ts` + `sim/prediction.ts` -- recompute gate, resolve/derive, predictor hooks -- parity
- [x] Shared/server/client test suites incl. I/O-matrix edges -- registry lock + two-homes property + 9-decimal parity
- [ ] Bookkeeping files -- per-PR protocol
- [x] `npm run check` -- full gate green

**Acceptance Criteria:**
- Given a test boon carrying all four effect kinds, when `World.applyBoon` applies it, then stats change only through `effectiveStats`, slots change only in the one `LoadoutSlot[]` structure, behavior executes only registered hooks, and no other ship field moves.
- Given a behavior test boon and an injected test registry, when the server world ticks and the client predictor replays the same inputs, then positions agree to 9 decimals (boost composed first, hooks after, both sides).
- Given the shipped (empty) `HOOK_REGISTRY`, when the registry suite runs, then the literal key-list + length lock fails for any future entry lacking shape/purity/parity coverage.
- Given a ship with zero boons, when any existing suite runs, then behavior and wire output are byte-identical to pre-story (PV aside) and hotbar boons-as-absence pins stay green.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass with PV = 13.

## Spec Change Log

## Review Triage Log

## Design Notes

- Engine call sites take the registry as a parameter (default `HOOK_REGISTRY`) — that is what lets the production registry ship empty (amendment 29) while tests prove real execution paths with injected registries.
- Server applies slot effects incrementally (live ammo state preserved); the client replays the same per-effect function over `loadoutFor` output — one function, two callers, id-parity property-tested. This is the anti-fork discipline from the prediction pattern applied to loadout.
- `boostUntil` remains bespoke owner-state; composition order (boost first, hooks after) matters only for documentation today since the registry is empty — pin it in a test via injected registry so 2.8 cannot accidentally flip it.
- `stat` effect paths whitelist existing `EffectiveStats` scalars only; damage is deliberately not addressable (not in `EffectiveStats`; equipmentInfo.ts:10 records the future seam).
- Client `slotAmmo` alignment: after a dormant-path slot mutation, `you.ammo` stays slot-aligned automatically (server builds it from the mutated loadout) — the client derivation must produce the same ids so the hotbar would label pools correctly when 2.7 goes live.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all workspace tests green (target: existing 1754 all green + new suites)
- `npm test -w shared` -- expected: boons/hooks suites + extended stats/barrel suites pass
- `npm test -w server` -- expected: real-tick boon suite + regenerated goldenFrames pass
- `npm test -w client` -- expected: behavior-boon prediction parity + recompute-gate cases pass
