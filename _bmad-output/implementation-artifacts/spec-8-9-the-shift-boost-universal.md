---
title: 'Story 8.9: The Shift Boost, Universal'
type: 'feature'
created: '2026-09-18'
status: 'in-review'
baseline_revision: '9390103'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/implementation-artifacts/spec-8-8-heal-is-a-card.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Slot 1 still runs the legacy `speedBoost` equipment (+10 u/s flat, 6 s, 18 s, `CONFIG.speedBoost`) beside an empty v3 `boost` placeholder; the bonus is a flat add the SPEED ladder cannot reach; the `--tune` surface can break `reloadMs >= durationMs`; and the tests still pin FR7's retired "torpedoes outrun every hull" law.

**Approach:** Make the v3 `boost` id the one boost (delete `speedBoost` and `CONFIG.speedBoost`), author `CONFIG.boost` at Eric's numbers (amendment 54: factor 0.25, 10 s, 25 s), scale the bonus off the POST-FOLD max speed inside the one shared `boostedKinematics` hook (amendment 55), enforce the cross-key `--tune` invariant, retire the outrun pins in favour of no-friendly-fire, and bump PV 53 → 54.

## Boundaries & Constraints

**Always:**
- Epic-8 amendments 54–57 are the rulings of record (written first, durable home). Numbers: `CONFIG.boost = { factor: 0.25, durationMs: 10000, maxAmmo: 1, reloadMs: 25000 }`; nothing else moves.
- `bonus = CONFIG.boost.factor × kin.maxSpeed` with `kin` the post-fold `EffectiveStats.kinematics`, forward cap only, computed INSIDE `shared/src/sim/boost.ts boostedKinematics` (one function, both sides, byte-identical); the bonus is never written into `EffectiveStats.kinematics` (bots' `max(rated, actual)` stands).
- `boost.reloadMs` flows through the one `cooldownScale` multiply in `clampStats` like every row (18.75 s at a maxed RELOAD ladder); `boostUntil` keeps its single writer (`server/src/game/equipment/boost.ts`).
- Shift stays a keydown-edge TAP on both codes, auto-repeat dropped, suspended under the refit window and the start-line lock (amendment 56); `Shift+Tab` keeps the shipped preventDefault-and-nothing handling (amendment 57).
- `PROTOCOL_VERSION` 53 → 54 (the client reads `CONFIG.boost`; the equipment id set changes). Version `0.18.9`, cycle 144.
- Perception untouched: `boostUntil` stays owner-only on `you`; no new spatial data, no seventh exception.
- `npm run check` green; complexity ≤ 10; no in-game copy beyond lines that become false (none found: no copy names the old numbers).

**Block If:** any boost number or behaviour is needed that amendments 54–57 do not state; a wire field beyond `boostUntil`/`ammo` looks necessary; the light-torpedo speed question (8.13) would need deciding here.

**Never:** fold the bonus into `kinematics.maxSpeed`; give the boost a card, tier or stat path a card can address; retune bot appetites or thresholds (rename keys only); touch the reverse cap; build or test anything for `Shift+Tab`; mitigate Sticky Keys; edit `CLAUDE.md`, the GDD, catalog-v3 or FR text (amendments are the durable home); re-cut How-to-Play.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap, ready | Shift keydown (`ShiftLeft` or `ShiftRight`), slot 1 charge 1, window closed, not locked | `actSeq` press on `actSlot 1`; server `consume` → `boostUntil = now + 10000`; predictor mirrors one tick later; forward cap = `maxSpeed × 1.25` while active | — |
| Held / repeat | Shift held 3 s, OS auto-repeat events | one press only (`edge()` drops `e.repeat`); no second activation | — |
| Tap while active | Shift again inside the 10 s window | `no-ammo` denial (charge is in the 25 s pool); slot denied pulse; `boostUntil` unchanged | — |
| Reload ladder | 5 RELOAD copies (cooldownScale 0.75) | `stats.equipment.boost.reloadMs === 18750`; duration stays 10000 | — |
| Speed ladder | 4 SPEED copies on a Torpedo Boat, boost active | cap 55 → 68.75 u/s (55 + 55 × 0.25); Mine Layer 62.5; Battleship 56.25; base hulls 56.25 / 50 / 43.75 | — |
| Reverse | boost active, throttle −1 | `reverseSpeed` unchanged | — |
| Refit open | Tab open, Shift tap | nothing sent, nothing predicted (amendment 56) | — |
| Fleet drone | fleet hull | slot 1 empty, never boosts (amendment 24 unchanged) | — |
| `--tune` invariant | `--tune boost.durationMs=60000` or `--set boost.reloadMs=1` | `TunableError` naming `boost.reloadMs >= boost.durationMs` on either surface | throws before any match runs |
| Outrun law | capped TB boosted (68.75) vs heavy torpedo 65 | allowed — retired law; the pin now asserts no-friendly-fire is the safety property | — |
| Wire gate | client on PV 53 joins a PV 54 server | refused at the door | — |
| Bot | BS/ML/TB bot on `disengage` | presses slot 1 via the renamed `boost` tactic at the same appetite (no retune) | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1365-1381` -- DELETE `speedBoost`; ADD `boost { factor 0.25, durationMs 10000, maxAmmo 1, reloadMs 25000 }` with the invariant doc (`reloadMs >= durationMs`, now enforced); bot deck `cat:` keys `:626/:637` `speedBoost` → `boost`; torpedo comment `:1193-1206` re-derived (capped boosted TB 68.75 > 65 — allowed)
- `shared/src/sim/boost.ts:26-29` -- `boostedKinematics(kin, factor, active)`: `maxSpeed: kin.maxSpeed + kin.maxSpeed * factor`; doc: post-fold input, forward only, both sides
- `shared/src/sim/loadout.ts:46-61, 70-94, 234-248` -- drop `'speedBoost'` from `EquipmentId` + `EQUIPMENT_IS_WEAPON`; `loadoutFor` fits `'boost'` in slot 1 (captains only)
- `shared/src/sim/stats.ts:156-165, 202-218, 255-274, 372-380, 455-467` -- `EffectiveBoost` loses `speedBonus`; `EquipmentRows` loses `speedBoost`; `STUB_ROWS.boost` deleted, `boost: boostRow(CONFIG.boost)` in `rows()`
- `shared/src/sim/effects.ts:77, 89` -- `boost: ['durationMs','maxAmmo','reloadMs']`; `speedBoost` entry deleted; `shared/src/sim/arcs.ts:96` drop `'speedBoost'`; `shared/src/sim/catalog.ts:399-400` comment
- `shared/src/index.ts:602` -- PV 54 + changelog entry (CONFIG.boost read by the client; `speedBoost` id gone; boost numbers)
- `shared/src/__tests__/damageGuardrail.test.ts:308-345` -- retire `:319` and `:335` as law; new pins: capped boosted TB 68.75 > heavy torpedo 65 (allowed, amendment 55), base fish still outruns every BASE hull/drone (current fact, not law); `arcs.test.ts:86`, `boost`/`stats`/`loadout`/`nineSlots` tests re-keyed; new `CONFIG.boost` + reload-ladder (18750) + per-class boosted-cap pins
- `server/src/game/equipment/boost.ts` -- `id: 'boost'`, reads `stats.equipment.boost`; `equipment/index.ts:188` registry key `boost`
- `server/src/game/world.ts:3036-3046, 3105` -- pass `CONFIG.boost.factor`; `wakeTopSpeed` = `maxSpeed × (1 + factor)`; comments
- `server/src/game/ai/equipment.ts:144-154, 745-775`, `ai/profiles.ts:153,169,280`, `ai/spending.ts:146` -- rename keys `speedBoost` → `boost` (tactic, appetites); no number moves; `botTactics.test.ts` / `botPolicy.test.ts` re-keyed
- `server/scripts/batchsim/overrides.ts:259-326` -- after ALL overrides apply (`--set` and `--tune`): `boost.reloadMs >= boost.durationMs` else `TunableError`; unit test in `server/src/__tests__/` (or the existing overrides test)
- `server/src/__tests__/boost.test.ts:52-58`, `torpedoSelfHit.test.ts:105-160` -- re-key; the OVERDRIVE comment names the retired law and no-friendly-fire
- `server/scripts/weaponsSmoke.mjs:1-30, 186-215` -- header re-derived for the 8.5 layout (mines = click-fired `navalMines` on Q/slot 2; torpedo damage per `CONFIG.torpedo.damage`); run it against an own server on a scratch port to prove the mine phases are LIVE; `deferred-work.md:92` resolved with the evidence
- `client/src/input/keyboard.ts:116-124, 556, 593-597, 611-622, 755-759` -- no behaviour change; the `BOOST_KEY_CODES` comment becomes the code-side input-capture rule (tap, both codes, auto-repeat dropped, Sticky Keys ACCEPTED per Eric 2026-09-11, suspended under the window per amendment 56, `Shift+Tab` undesigned per amendment 57)
- `client/src/sim/prediction.ts:241-284` -- `setBoostStats(factor, durationMs)`; `tickKin` passes the factor to the shared hook; `client/src/main.ts:750, 2611-2615, 2851, 3090, 3262-3273` -- `boost` key, factor, `maxSpeedU = maxSpeed × (1 + factor)`
- `client/src/render/helmGlobe.ts:205-206, 298` -- `boostFactor` input; `client/src/render/wake.ts:385` -- ring provisioning covers the MAX achievable boosted hull (capped TB 68.75), pinned
- `client/src/render/equipmentInfo.ts:63, 68, 88, 313, 320` -- one `boost` entry (label, prose, null arc); `client/src/ui/boonCopy.ts:579` check
- Docs: `VERSION`/`package.json`+lock 0.18.9, `CHANGELOG.md`, both trackers (one-line stamps), `deferred-work.md` (resolve `:92`, `:1518`, `:1851`; stamp `:2102` with the new numbers), `EXPERIENCE.md:154,158,172` (25 s + amendments 54/57 only), `epic-8-context.md` Ratified 54–57 (done)

## Tasks & Acceptance

**Execution:**
- [x] amendments 54–57 → `epic-8-context-amendments.md` + `epic-8-context.md` -- durable home first
- [ ] `shared/` (constants, boost, loadout, stats, effects, arcs, catalog comment, index, tests) -- `speedBoost` gone, `CONFIG.boost` live, proportional hook, PV 54, outrun pins retired -- `npm test -w shared && npm run build -w shared`
- [ ] `server/` (equipment/boost + index, world, ai renames, batchsim overrides invariant, tests) -- `npm test -w server`; run `weaponsSmoke.mjs` against an own server (`HC_DEV_OPTIONS=1`, scratch port), kill own PID
- [ ] `client/` (keyboard comment, prediction, main, helmGlobe, wake, equipmentInfo, tests) -- `npm test -w client`; `grep -rn speedBoost shared/src server/src client/src server/scripts` returns nothing
- [ ] docs + version + trackers + ledger -- one-line tracker stamps; EXPERIENCE.md minimal
- [ ] `npm run check` green; own server + client boot on scratch ports; PIDs killed

**Acceptance Criteria:**
- Given any captain hull at 0:00, when Shift is tapped, then slot 1 (`boost`) activates for 10 s, the cap rises to `maxSpeed × 1.25` on both sides (prediction matches the server), and the slot shows ACTIVE then a 25 s wipe.
- Given four SPEED cards on a Torpedo Boat, when the boost is active, then the forward cap is 68.75 u/s and reverse is unchanged.
- Given five RELOAD cards, then `stats.equipment.boost.reloadMs` is 18750 and `durationMs` is 10000.
- Given `--tune boost.durationMs=60000` (or `--set boost.reloadMs=1`), when the batch sim starts, then it throws a `TunableError` naming the invariant before any match.
- Given the test suite, then no test asserts a torpedo outruns a boosted hull as a requirement; the pins state no-friendly-fire (8.4) is the safety property and record the current speeds as facts.
- Given a client on PV 53, when it joins, then the gate refuses it.
- Given `weaponsSmoke.mjs` against a booted dev server, then all four phases pass and the mine phases lay and trigger real mines.
- Given `npm run check`, then lint, tsc ×3 and every test pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the factor lives inside `boostedKinematics`:** the two call sites (server `stepShips`, client prediction/replay) plus the helm globe must produce the same double; one function taking `(kin, factor, active)` and computing `kin.maxSpeed + kin.maxSpeed * factor` is the desync firewall for the boost, and it is where "post-fold" is guaranteed because the input IS the folded kinematics.
- **Why `EffectiveBoost` keeps `reloadMs`/`durationMs`/`maxAmmo` but loses `speedBonus`:** the reload must sit in the row so the one `cooldownScale` multiply reaches it (R40); the bonus is proportional and no card can address it, so a flat field would be a lie the whitelist has to carry.
- **Why the outrun pins are retired rather than flipped:** FR7's law is gone as a requirement (Eric 2026-09-11, AR49); the replacement pins state the safety property that holds (own ordnance never damages own hull) and record the current speeds as facts that may move (8.13), so 8.13 does not inherit a false law.
- **Why the `--tune` check is cross-key after all overrides:** `--set` and `--tune` validate leaves independently; the invariant is a relation, so it is checked once on the finished CONFIG, on both surfaces.

## Verification

**Commands:**
- `npm test -w shared` then `npm run build -w shared` -- green; `CONFIG.boost` pins, 18750 reload pin, 68.75/62.5/56.25 cap pins, retired-law pins
- `npm test -w server` -- green; boost row re-keyed, invariant test, bot rename pins
- `npm test -w client` -- green; `grep -rn speedBoost shared/src server/src client/src server/scripts` empty
- `HC_DEV_OPTIONS=1 PORT=<free> npm run dev -w server` + `WS_URL=ws://localhost:<free> node server/scripts/weaponsSmoke.mjs` -- four phases pass; kill own PID
- `npm run lint`; `npm run check` -- exit 0

**Manual checks (if no CLI):**
- Eric on staging: tap Shift on each hull, watch the helm needle cap rise 25 %, the slot breathe 10 s then wipe 25 s; draw SPEED cards and boost again; hold Shift and confirm one press; open Tab and confirm Shift is dead.
