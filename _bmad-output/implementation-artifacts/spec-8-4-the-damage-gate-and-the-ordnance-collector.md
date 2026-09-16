---
title: 'Story 8.4: The Damage Gate and the Ordnance Collector'
type: 'refactor'
created: '2026-09-15'
status: 'done'
baseline_revision: '21bafd9'
final_revision: 'f8db0a4'
review_loop_iteration: 0
followup_review_recommended: true
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
    '{project-root}/_bmad-output/implementation-artifacts/spec-8-3-the-draw.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Hull hp is decremented at three sites in `world.ts` (`applyStorm`, `hitShip`, `burnShip`) with three different inner orders, and every ordnance step finds its victims by its own route (`aliveHulls()` snapshot + `withBuoyTargets`, `detonateMinesInBurst` and `chainMines` iterating `this.mines`), so the shield (8.15), the decoy (8.15), uncapped mines and "shoot any mine" would each need three copies of the same rule. Three ordnance defects (`deferred-work.md:249, :590, :594`) are open on exactly those seams.

**Approach:** ONE `applyDamage(victim, amount, src, byId)` gate in `world.ts` (the only `victim.hp -=`, lint + grep pinned, structurally no friendly fire, reads a not-yet-armed `ship.shield`) and ONE per-tick-memoized `hitTargets(mask)` collector (`TargetKind = hull | mine | decoy | ordnance`) that every ordnance row consumes through `CONFIG.<ordnance>.hits`. Mines lose every cap; shells and bursts detonate any armed non-captive mine (Eric, amendments 16–18); the three ledger defects are decided (memo invalidation on sink + `hc` on a wreck sunk this tick, amendment 19). No wire change, PV stays 51, damage numbers byte-identical.

## Boundaries & Constraints

**Always:**

- **Eric rulings 2026-09-15 — epic-8 amendments 16–19 (already written in this worktree; re-applied to `epic-8-context.md`):** (16) a shell or burst detonates ANY ARMED mine, own or enemy; captive mines (owner doctrine `laysCaptiveMines`) are never set off by shells or bursts; a still-arming mine is not set off. (17) A mine is a POINT target for a shell: the shell's path within its own `shellRadius` of the mine centre detonates it; a burst detonates when its radius covers the centre. (18) A blast chains into every armed non-captive mine in blast range regardless of owner; captives neither receive nor propagate. (19) A burst covering a hull that sank THIS tick emits `hc` (no damage); the star shell keeps its geometric-victim exclusion.
- **Orchestrator rulings (Eric's veto list; record them in the Auto Run Result):**
  1. **Gate signature per AR47**: `applyDamage(victim: ShipRecord, amount: number, src: DamageSource, byId: string | undefined): void` in `world.ts`; `export type DamageSource = 'shell' | 'burst' | 'torpedo' | 'missile' | 'mine' | 'burn' | 'storm' | 'contact'` (declared in `world.ts` or a tiny `game/damage.ts` types file — types only, no second hp writer). Fixed inner order: (a) friendly-fire refusal — `byId === victim.id` returns before anything, for EVERY source; (b) phase/sinking guards exactly as today (`damageEnabled`, `isSinking`) — storm keeps its own `zoneStartT` gate at the caller; (c) shield: `ship.shield` (`{ hpLeft: number; until: number } | null`, new `ShipRecord` field, ALWAYS `null` today — nothing sets it; the gate expires it at `until` or `hpLeft === 0`, subtracts absorbed damage from `amount`, and continues with the remainder — a fully absorbed hit still runs the rest with `dealt = 0`); (d) `dealt = clamp(amount, 0, hp)`; the ONE `victim.hp -= dealt`; (e) assist ledger via `creditDamage` — a `src` of `'storm'` skips it (byId is undefined anyway) so "storm never refreshes a counter" stays structural; (f) sink check `hp <= 0 → sinkShip(id, byId)`; (g) `dmg` event by source: `'burn'` goes through the existing DoT bucket (`flushDot` before sink, as today); `'storm'` emits NO `dmg` (parity — today the storm emits none); every other source pushes the immediate `{ k: 'dmg', id, amount: dealt, hp }` as today. Aggro (`drones.onDamaged`) is NOT in the gate: it stays at the caller exactly where it runs today (`hitShip` may survive as a thin wrapper that runs aggro then calls the gate; `fromMine`/`noAggro` keeps its meaning at that wrapper). NOTE the AC lists sink before `dmg`; today `hitShip` pushes `dmg` then sinks and `burnShip` flushes DoT then sinks — keep today's emitted order of events per source byte-identical (golden frames) and document which step is which; the "fixed order" pin is over the steps, the `dmg` push for immediate sources may be recorded before the sink call as today.
  2. **hp INCREASES**: the AC's "`payRepair` is the only hp-increase path" is read as "the only REGEN path". Pinned whitelist of every other `hp =`/`+=` in `world.ts`: `redeployShip`/`respawn` (full reset to `maxHp`), `applyCard` heal-on-grant + clamp, `spendHeal` instant (Story 8.8 owns it), `sinkShip` (`hp = 0`). A grep pin lists them; none moves.
  3. **Collector**: `hitTargets(mask: readonly TargetKind[]): readonly Target[]` on the tick-scoped `StepContext` (`stepContext()`, `world.ts:2664`), memoized per tick per mask key (sorted-joined string); `Target { id, kind, poly }` replaces `HullTarget` in `shared/src/sim/shell.ts` (keep a `HullTarget = Target` alias only if a test imports it; prefer renaming). Kinds today: `hull` = `aliveHulls()` (afloat only, as today); `mine` = every mine as a POINT (a degenerate one-vertex poly at the mine centre; `stepShell`'s segment test then uses the shell radius alone — amendment 17); `decoy` = the RADAR BUOY squares (`buoyTarget`) as the INTERIM occupant until Story 8.15 deletes the buoy and lands the decoy store — outcomes for a buoy stay byte-identical (`hitBuoy`, `buoy.hp` untouched, not routed through the gate: a buoy is not a ship); `ordnance` = empty today (no flak; pinned empty). `sinkShip` INVALIDATES the memo (bumps a generation) so later shells in the same tick no longer collide with the wreck and homing acquire drops it — this DECIDES `:594` and `:249` (fixed). Homing acquire = `hitTargets(['hull','decoy'])` minus the owner's hull if that is what today's acquire set equals (parity — verify against today's `withBuoyTargets` feed; `lead.ts` untouched).
  4. **Masks in CONFIG** (`shared/src/constants.ts`, key `hits: readonly TargetKind[]`, typed via a `TargetKind` type exported from shared): `gun` `['hull','mine','decoy']`; `broadside` `['hull','mine','decoy']`; `radarBuoy` gun uses the gun mask; `torpedo` `['hull','decoy']` (heavy torpedo and the captive's fish); `starShells` `['hull','decoy']` (illumination detonates nothing); `mine` `['hull']` for the trigger. STUB rows (missile, machineGun, flak, monitor, light/supercav) get no row until their story. NO `PROTOCOL_VERSION` bump: the client never reads `hits` (pin `PROTOCOL_VERSION === 51` and a client grep pin that `.hits` is unread in `client/src`).
  5. **Outcomes by kind in world.ts** (never inside `shared/`): `hull` → contact/burst damage through the gate as today; `mine` → `detonateMine(mine, hulls)` at the mine's own position with its own blast, PERCEPTION-BLIND, only if `now >= armedAt` and the owner is not a captive layer (amendment 16); a shell that contacts a mine is CONSUMED (no burst of its own) — the mine's blast is the effect; a burst covers a mine → detonate; chains (`chainMines`) drop the same-owner condition (amendment 18) and keep the two captive exclusions; `decoy` (buoy) → today's `hitBuoy` path unchanged; `ordnance` → nothing today. `detonateMinesInBurst` is folded into the collector path (owner-only + `armed` + non-captive → armed + non-captive, any owner) — its function is deleted or reduced to the mask outcome; NO other enumeration of `this.mines` remains in any ordnance step (`checkMineTriggers`'s own iteration over the mine store is the mine SYSTEM stepping, not an ordnance step finding targets — pin the distinction in a comment).
  6. **Amendment 19 mechanics**: the collector records `sunkThisTick: Target[]` (polys captured at sink time); `resolveBurst` counts a burst covering one of them as a geometric victim for the `hc`/`sp` decision only (no `applyDamage`, no assist), EXCEPT for the zero-damage star shell whose geometric exclusion stands.
  7. **No caps**: delete `CONFIG.mine.maxLive`, `CONFIG.mine.globalCap`, `EffectiveMine.maxLive` (+ seed in `stats.ts`, the two boon-path rows in `effects.ts:72-73`, `maxLive` out of `EQUIPMENT_INT_FIELDS` and its `boons.test.ts` pin), both eviction branches + `ownMineCount`/`oldestOwnMine` + the `maxLive` parameter in `equipment/mines.ts`, the drop-closure reads at `world.ts:4322-4330`, the bot cap refusal at `ai/equipment.ts:443-450` (+`:472`, `ai/utility.ts:391-392` — bots lay when their tactic and reload allow; nothing else in bot policy changes), the `CONFIG.bots.preparedMineReserve` comment sentence. `weaponsSmoke.mjs`'s oldest-despawn assertion is REPLACED by "six laid, six live, none evicted". Tests naming `maxLive`/`globalCap` are updated or retired with a one-line comment, never silently deleted.
  8. **`/metrics`**: `MetricsPayload.world: { minesLivePeak: number }` — process-wide high-water mark of live mines, fed by `recordMinesLive(count)` from `ArenaRoom` after each `world.step()` (`world.mineCount` getter), reset by `resetMetrics()`, survives room dispose. Count only.
  9. **Perf pin**: a server test builds 20 afloat hulls + 500 armed mines and times `checkMineTriggers` + `hitTargets(['hull','mine','decoy'])` + one full `resolveBurst` over the field; asserts the best of 5 runs < 50 ms; the number is recorded in the Auto Run Result.
  10. **`tickRepairs` stays UN-gated on `damageEnabled`** (`:564`): nothing can damage a hull in the weapons-safe phases so there is nothing to heal, and gating would add a phase read to a regen path 8.8 rewrites. Pin with a test and stamp the ledger (correct its stale `!ship.alive` evidence line).
  11. **Lint + grep**: `eslint.config.js` gains a `no-restricted-syntax` block over `server/src/**` EXCEPT `server/src/game/world.ts` forbidding `AssignmentExpression[operator='-='] > MemberExpression.left[property.name='hp']`; a server test reads `world.ts` and asserts exactly ONE `victim.hp -=` (the gate) and that `applyStorm`/`burnShip`/`hitShip` bodies contain none. `hitBuoy`'s `buoy.hp -=` is allowed (not a hull) and pinned as the one non-hull decrement.
  12. **`:496` re-derivation**: under no cap a same-owner co-located stack is bounded only by pools × reloads; the cascade is still per-hit (`damageGuardrail.test` unchanged); record the new bound in the ledger entry.
- Parity: every existing damage NUMBER and event ORDER is byte-identical except where an amendment changes behaviour (16–19, `:594`/`:249` fix). `goldenFrames.test.ts` must pass unchanged unless a scenario contains a mid-tick kill or a shot mine — if the snapshot moves, the implementer explains each moved line against an amendment or HALTS.
- Shared/server split: `Target`/`TargetKind`, the point-target segment test and `burstVictims(center, radius, targets, ownerId)` (skips ONLY the owner's `hull`; own mines are hit; returns `Target[]`) live in `shared/src/sim/shell.ts`; `stepShell`'s exported signature is unchanged (its ctx field widens from hulls to targets). Both sides compile; the client predicts no ordnance so no client sim change.
- Version 0.18.3 → **0.18.4** (cycle 139: `VERSION`, root `package.json`, lock), one-line stamps in BOTH trackers, `CHANGELOG.md` (plain words), `deferred-work.md` stamps on `:249`, `:496`, `:564`, `:590`, `:594` + one new section. `npm run check` green; headless `soloSmoke`, `matchSmoke`, `weaponsSmoke` on a scratch port.
- Process: this worktree only; no dev server in Eric's checkout; kill what you boot; halt on any error; no in-game copy; never touch `CLAUDE.md`.

**Block If:**

- A genuine wire change is needed (any frame/welcome/schema field, or the client must read `hits`).
- The golden snapshot moves on a line no amendment explains.
- The 500-mine perf pin cannot reach < 50 ms without changing a gameplay number.
- Any bot behaviour beyond "no cap refusal" would have to change.

**Never:**

- Arm the shield, build the decoy store, delete the radar buoy, add flak/missile/machine-gun/monitor modules (8.14/8.15), touch slots (8.5), the heal (8.8), smoke (8.16).
- Add a second `hp -=` anywhere, or a `hits` row for a stub line.
- Let shared code know about mines' owners, drones, or the gate (shared stays pure geometry).
- Detonate a captive or still-arming mine by shell/burst/chain, or chain into a captive.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own shell contacts own hull | `byId === victim.id`, any src | gate returns before hp/ledger/event; no `dmg` | none |
| Absorbed hit (test-only shield set) | `shield {hpLeft: 50, until: now+1000}`, amount 30 | `hpLeft` 20, hp unchanged, no assist credit for a 0 deal; the `dmg` step behaves exactly as `hitShip` does today for an amount clamped to 0 (pin whichever it is) | none |
| Storm tick | src `'storm'`, byId undefined | hp falls, no `dmg`, no assist, sink by undefined | none |
| Burn | src `'burn'` | DoT bucket, flush before sink | none |
| Shell path within `shellRadius` of an armed enemy mine | mask has `mine` | mine detonates at its centre with its blast; shell consumed; chains any owner | none |
| Same over a captive-layer's mine, or a mine with `now < armedAt` | — | shell flies on; mine untouched | none |
| Burst covers a hull sunk this tick, non-star shell | amendment 19 | `hc`, no damage | none |
| Second shell of a click after first sank the hull | memo invalidated | passes through the wreck (no `boom`/`hc` on contact) | none |
| 6th mine laid by one owner / 61st in room | no caps | all live; `/metrics world.minesLivePeak` ≥ 61 | none |
| `hitTargets(['ordnance'])` | today | `[]`, memoized | none |

</intent-contract>

## Code Map

- `server/src/game/world.ts` (4720 LOC) -- `applyStorm :2939`, `hitShip :3505`, `burnShip :3884` → the gate; `StepContext :800/:2664` → `hitTargets` memo + `sunkThisTick` + invalidation from `sinkShip :1765`; `stepShells :3214`, `resolveShell :3660`, `resolveBurst :3733`, `detonateMinesInBurst :3803` (fold), `detonateMine :3376`, `chainMines :3465` (any owner), `withBuoyTargets :4509` (→ `decoy` kind), drop-closure `:4322-4330`, `tickRepairs :2971`, new `mineCount` getter, new `shield` field on `ShipRecord`
- `shared/src/sim/shell.ts:127-375` -- `Target`/`TargetKind`, point-target collision, `burstVictims` widening; `shared/src/index.ts` -- export the two types (no PV bump)
- `shared/src/constants.ts` -- `hits` rows (`gun :1099`, `torpedo :1153`, `mine :1228`, `broadside :1367`, `starShells :1498`, `radarBuoy :1562`); delete `mine.maxLive :1283` / `globalCap :1284`
- `shared/src/sim/stats.ts:117,356`, `shared/src/sim/effects.ts:72-73,92` -- delete `maxLive` stat path + int-field entry
- `server/src/game/equipment/mines.ts:102-144` -- delete eviction + helpers + `maxLive` param; `checkMineTriggers :206` unchanged
- `server/src/game/ai/equipment.ts:443-450,472`, `ai/utility.ts:391-392` -- delete cap refusal
- `server/src/metrics.ts:61-66,126,203,211,283` -- `world.minesLivePeak`; `server/src/rooms/ArenaRoom.ts` -- `recordMinesLive` after step
- `eslint.config.js` -- scoped `no-restricted-syntax`
- `server/scripts/weaponsSmoke.mjs:17-18,252-267` -- replace the oldest-despawn assertion
- Tests: `server/src/__tests__/{weapons,combat,perception,assistSplit,zone,equipment,stepOrder,goldenFrames,metrics,botPolicy,botTactics,upgrades,levelHeal}.test.ts`, `shared/src/__tests__/{shell,stats,boons,barrel}.test.ts`; NEW: `server/src/__tests__/damageGate.test.ts` (order, friendly fire per source, shield read, grep pin, hp-increase whitelist, tickRepairs un-gated), `server/src/__tests__/hitTargets.test.ts` (memo, invalidation, kinds, shot mines, chains any owner, captive immunity, amendment 19, 500-mine perf), `client/src/__tests__/` (no `.hits` read)
- Docs: `VERSION`, `package.json`, lock, `CHANGELOG.md`, both trackers, `deferred-work.md`, `epic-8-context.md`, `epic-8-context-amendments.md` (16–19 written), this spec

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/shell.ts` + `shared/src/index.ts` + `shared/src/__tests__/shell.test.ts` -- `Target`/`TargetKind`, point-target hit, `burstVictims` over kinds (owner hull skipped only) -- `npm run build -w shared && npm test -w shared`
- [x] `shared/src/constants.ts` + `stats.ts` + `effects.ts` + shared tests -- `hits` rows; delete `maxLive`/`globalCap` and the stat path -- shared green
- [x] `server/src/game/world.ts` -- `applyDamage` gate + `DamageSource` + `shield` field; three writers routed; aggro stays at callers -- `damageGate.test.ts`
- [x] `server/src/game/world.ts` -- `hitTargets` memo on `StepContext`, invalidation on sink, `sunkThisTick`, buoy as interim `decoy`, shells/bursts/torps read masks, shot-mine outcome, chains any owner, amendment 19 `hc` -- `hitTargets.test.ts`
- [x] `server/src/game/equipment/mines.ts` + `ai/equipment.ts` + `ai/utility.ts` + `world.ts` drop closure -- caps deleted -- weapons/bot tests updated or retired
- [x] `server/src/metrics.ts` + `ArenaRoom.ts` + `metrics.test.ts` -- `world.minesLivePeak` -- counter proven
- [x] `eslint.config.js` + grep pin test -- exactly one `victim.hp -=` -- `npm run lint`
- [x] perf pin test (500 mines) -- < 50 ms best-of-5 -- number recorded
- [x] `server/scripts/weaponsSmoke.mjs` -- no-eviction assertion -- smoke passes
- [x] `VERSION`/`package.json`/lock/`CHANGELOG.md`/both trackers/`deferred-work.md` -- cycle 139, 0.18.4, PV 51, amendments 16–19, ledger stamps `:249 :496 :564 :590 :594` -- tracker discipline
- [x] `npm run check` green; `soloSmoke`, `matchSmoke`, `weaponsSmoke` on a scratch port -- the gate

**Acceptance Criteria:**
- Given `world.ts`, when read as text, then exactly one `victim.hp -=` exists, inside `applyDamage`, and ESLint refuses an `hp -=` in any other server file.
- Given any `DamageSource` with `byId === victim.id`, when applied, then hp, ledger and events are untouched.
- Given a test-set shield, when hit, then it absorbs first, expires at `until`/`0`, and the gate still runs to the end.
- Given an armed enemy mine and a shell path within `shellRadius`, when the tick steps, then the mine detonates at its position, the shell is consumed, and any armed non-captive mine in blast range detonates the same tick; a captive or arming mine is untouched.
- Given a hull sunk by the first shell of a click, when the later shells resolve the same tick, then none contacts the wreck, and a burst covering it emits `hc` with no damage (star shell excepted).
- Given 61 mines laid, when the tick steps, then all live and `/metrics` `world.minesLivePeak` reads the peak; the 500-mine pin runs under 50 ms.
- Given every existing test, when run, then damage numbers are byte-identical; golden frames move only on lines an amendment explains.
- Given `npm run check`, then lint, tsc ×3 and every test pass; PV stays 51.

## Spec Change Log

## Review Triage Log

### 2026-09-16 — Review pass (Blind Hunter + Edge Case Hunter at session model, plus Codex `gpt-5.6-sol` cross-model review — verdicts: Blind Hunter fix-first (narrowly), Edge Case Hunter build-on-it, Codex fix-first; findings applied in this pass)
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 0, medium 3, low 6)
- defer: 5: (high 0, medium 2, low 3)
- reject: 4: (high 0, medium 0, low 4)
- addressed_findings:
  - `[medium]` `[patch]` P1 — a shell consumed by an unseen MINE handed the shooter a self-private `hc` at the mine's position (flagged by BOTH Codex and the Blind Hunter; orchestrator ruling: a mine-consumed shell emits neither `hc` nor `sp`; burst path unchanged) — `resolveShell` reads the kind before emitting; fail-first 1
  - `[medium]` `[patch]` P3 — a destroyed/expired radar buoy stayed in the collector memo for the rest of the tick and could consume a second shell/torpedo of the same click (Edge Case Hunter, CONFIRMED) — one `consumeBuoy` bumps the generation; fail-first 3
  - `[medium]` `[patch]` P4 — memo and `sunkThisTick` were cleared in the tick epilogue, so a between-tick `sinkShip` (leave-scuttle) survived a whole tick as a "sank this tick" wreck (Blind Hunter CONFIRMED comment-vs-code; Edge Case Hunter) — cleared in the prologue, docs corrected; fail-first 1
  - `[low]` `[patch]` P2 — the shell resolver dispatched by store membership, not the target's kind (Codex, Edge Case Hunter) — kind-based dispatch; fail-first 1
  - `[low]` `[patch]` P5 — `ship.shield` never reset at sink/redeploy/respawn (Blind Hunter) — three resets; fail-first 2
  - `[low]` `[patch]` P6 — the lint fence saw only `-=` (Blind Hunter, Edge Case Hunter) — `--`, `= x.hp - n`, `+= -n` selectors added, each proved to fire once
  - `[low]` `[patch]` P7 — `weaponsSmoke` equality assertion would fail on a legitimately tripped mine (both hunters) — `>= 6` only; smoke passed
  - `[low]` `[patch]` P8 — `wrecksInBurst` ignored the fleet friendly filter (both hunters) — filter applied; fail-first 1
  - `[low]` `[patch]` P9 — the perf pin shared one world across its five runs (Codex CONFIRMED; premise measured false by the patch agent, guard kept) — fresh world per run, `expect(mines).toBe(500)`
  - deferred (ledger): kill/assist credit for a shot mine goes to the layer (Blind Hunter D); drones clear minefields + bots lay per reload as ruling consequences (I ii/iii) and the gun buoy's own-field parity (Edge Case Hunter); shield-seat notes for 8.15 (amount-0 `dmg`, nominal tally); the perf pin's narrowness (F); a pre-existing `generateMap` seed throw surfaced by the gate run
  - rejected: `bankDot` with an undefined owner (no caller); `spawnMine` generation bump "for no reason" (harmless, doc now names it); orphaned captive fields becoming shootable (pre-existing trip-rule fallback); two booms per shot mine (already ledgered, entry re-worded)

## Auto Run Result

**Status:** done (2026-09-15, build cycle **139**, version **0.18.4**, PV 51 unchanged).

**Summary:** Two chokepoints replaced eight ad-hoc paths, and four Eric rulings landed on top of them. ONE `applyDamage(victim, amount, src, byId)` in `world.ts` is now the only `victim.hp -=` in the game, with the fixed inner order (a) friendly-fire refusal for EVERY `DamageSource` → (b) `damageEnabled` + `isSinking` → (c) `absorbShield` → (d) overkill clamp + the one hp write → (e) assist ledger (skipped for `'storm'`) → (f)(g) `reportDamage` (burn → the DoT window bucket, storm → nothing, everything else → the immediate `dmg`, then the sink). `applyStorm`/`hitShip`/`burnShip` survive as named seats; aggro stays at `hitShip` where the caller knows `fromMine`. ONE `hitTargets(mask)` is now the only way an ordnance step finds anything: memoized per tick per sorted mask, invalidated by `sinkShip` AND by every mine consumed, over kinds `hull` / `mine` (a POINT target, armed and non-captive only) / `decoy` (the radar buoy, interim) / `ordnance` (empty, pinned). `aliveHulls()`, `withBuoyTargets()` and `detonateMinesInBurst()` are gone; every weapon declares its kinds in `CONFIG.<ordnance>.hits` and carries the mask on `ShellState.hits`. Amendments 16-18: a shell within its own radius of an armed non-captive mine, or a burst covering one, detonates it whoever laid it, the shell is consumed, and the blast chains across owners through the existing visited set; captive and still-arming mines are excluded IN THE COLLECTOR so the shell flies on rather than dying on a mine it cannot set off. Amendment 19: `sunkThisTick` holds each wreck's silhouette (transformed fresh at sink, not copied off the reused scratch) and `wrecksInBurst` counts it for the `hc`/`sp` mark only, inside the `damage > 0` branch so the star shell keeps its exclusion. Every mine cap is deleted — `maxLive`, `globalCap`, the stat path, both eviction branches, `ownMineCount`, `oldestOwnMine` and the bot's `mineFieldFull` refusal — and `/metrics` gains `world.minesLivePeak` to measure what the cap used to bound. No wire change: PV stays 51, pinned by a client grep test that no client source reads `.hits` or names `TargetKind`.

**Orchestrator rulings, as implemented (Eric's veto list):** all twelve taken as written, with three recorded readings. (1) The `dmg` event carries the NOMINAL post-shield amount, not `dealt` — the ruling's `{ amount: dealt }` contradicted its own "as today", and parity won (golden frames). (2) `CONFIG.mine.hits` is the TRIP mask (`['hull']`) as ruled; the mine BLAST's target set is a separate named `MINE_BLAST_HITS = ['hull','decoy']` in `world.ts`, since the ruling gives mines one row and a blast needs a different set from a trip. (3) The collector is owned by the `World` (cleared in the tick prologue, so its first build still lands at `stepShells`) and reached by rows through `StepContext.hitTargets`, which is what makes the memo and its invalidation directly testable. Also of record: `starShells` losing the `mine` bit is a deliberate behaviour change under ruling 4 — a flare used to detonate the firer's own armed mines through the owner-only self-detonation path amendment 16 replaced.

**Files changed:** shared — `sim/shell.ts` (`Target`/`TargetKind`, `ShellState.hits`, point targets, `burstVictims` → `Target[]`), `constants.ts` (six `hits` rows; `mine.maxLive`/`globalCap` deleted), `sim/stats.ts`, `sim/effects.ts`, tests (`shell`, `barrel`, `boons`, `stats`). Server — `game/world.ts` (the gate, `DamageSource`, `ShipRecord.shield`, the collector, `consumeMine`, `detonateShotMine`, `wrecksInBurst`, `resolveInterception`, `mineCount`), `game/equipment/{ballistics,guns,broadside,starShells,torpedoes,mines,radarBuoy}.ts`, `game/ai/{equipment,utility}.ts`, `metrics.ts`, `rooms/ArenaRoom.ts`, `scripts/weaponsSmoke.mjs`, tests (NEW `damageGate.test.ts`, `hitTargets.test.ts`; updated `weapons`, `botPolicy`, `botTactics`, `upgrades`, `metrics` + ten files whose shell literals gained `hits`). Client — NEW `__tests__/ordnanceMasksAreServerOnly.test.ts`. Root — `eslint.config.js`. Docs — `VERSION`/`package.json`/lock (0.18.4), `CHANGELOG.md`, both trackers, `deferred-work.md` (5 stamps + 5 new entries), this spec.

**Verification performed:** `npm run check` exit 0 — lint 0 errors (3 pre-existing `max-lines-per-function` warnings), tsc clean x3, **844 / 1871 / 3269** tests, `check:hooks` 266/0. `goldenFrames.test.ts` passed UNCHANGED (no snapshot line moved, so no amendment had to explain one). The ESLint restriction was proved by planting `x.hp -= 1` in `server/src/game/match.ts` (fired with the gate's message), then removed. Fail-first proved by removing gate steps (a) and (c) — 6 failures — and by removing the sink invalidation plus the amendment-19 count — 3 failures; both reverted. PERF PIN: 20 hulls + 500 armed mines through `stepMines` + `hitTargets(['hull','mine','decoy'])` + one full `resolveBurst`, **best of 5 = 1.922 ms** against the 50 ms budget (Darwin 25.4.0 / Node 22, dev machine, under vitest — ledgered as a dev number, not a production one). Headless smokes on a self-booted scratch server (`PORT=2597`, killed afterwards; 2567 and 5173 never touched): `soloSmoke` PASSED first attempt, and `/metrics` served `world:{minesLivePeak:0}` live. `matchSmoke` took four attempts — two HUNG and one aborted on a port collision left by the first hang, all three under a caller-side timeout shorter than the script's own 240 s "A sinking B" budget; given its full budget it PASSED (winner ALPHA, both captains, clean disposal). Both failure modes are the ledgered pre-existing flake; the lesson worth recording is that this smoke needs more than 300 s of wall clock. `weaponsSmoke` failed its first run on the NEW assertion and the ASSERTION was wrong, not the code: counting "six live at once" through the OBSERVER's eyes measures the drifting layer's spread against the detect ring, not the store. Re-pinned on A's OWN board (a captain always sees its own mines at any range) and it passed: *"A held 6 own mines live at once (6 laid)"* — a number that was impossible under the retired cap of 5.

**Review pass (2026-09-16):** nine patches landed in `2cca7a8` (three medium, six low; every behavioural one with a fail-first test); 5 deferred to the ledger, 4 rejected, 0 intent gaps, 0 bad-spec loopbacks. Final gate after patches on the orchestrator's own rerun: `npm run check` — **844 / 1881 / 3269**, lint 0 errors, golden frames unchanged, PV 51. One independent gate run hit a pre-existing random-seed `generateMap` throw in `liveness.test.ts`, reproduced deterministically for that seed with `sim/map.ts` untouched and ledgered; the file passes on rerun (91/91). Follow-up review recommended: the fog patch changes the `hc`/`sp` grammar for one case and the shell resolver was restructured around target kind.

**Orchestrator rulings added at review (Eric's veto list, continued):** (13) a shell consumed by a mine emits NO `hc` and NO `sp` — a mine is disclosed only inside the detect ring, so a self-private hit mark at an unseen mine would be a detection channel; the mine's own boom stays sight-gated; a burst that covers only a mine still resolves `sp`. (14) Kill and assist credit for a shot mine stay with the LAYER, not the shooter (ledgered for veto). (15) Drones' shells detonate any armed mine and bots lay one mine per reload with no cap — consequences of the rulings, not retuned here.

**Residual risks / Eric's veto list:** (1) the three orchestrator readings above (the `dmg` amount, the separate blast mask, the World-owned memo); (2) a star shell no longer detonates the firer's own mines — ruled, but it is a real change to a shipped behaviour; (3) a shot mine draws two booms at nearly the same point (ledgered as a client-side presentation nit; suppressing either would break an older invariant); (4) bot mine policy was NOT retuned for a capless world — `preparedMineReserve` (3) is now a bare restraint dial, a balance question for a harness cycle; (5) the perf number is a dev-machine measurement and staging cannot produce a better one (starter plan); (6) the `ordnance` kind, the `decoy` store and `ship.shield` are built-but-empty seats for Stories 8.14/8.15, each with AR44/AR47 rules recorded in the ledger that are NOT implemented here.

## Design Notes

- **Why aggro stays outside the gate:** AR47 fixes five steps; aggro's `fromMine`/`noAggro` seat is a drone concern read at two shell call sites; moving it inside would need a ninth `DamageSource` value the AR does not list. Callers run it exactly where they do today.
- **Why storm emits no `dmg`:** parity. A storm `dmg` at 20 Hz per drowning ship would be a wire behaviour change (and a client tell) this no-wire story must not make; the shield still absorbs storm at step (c).
- **Why the buoy is the interim `decoy`:** the collector must be the ONLY finder; the buoy is today's only non-hull collision subject and 8.15 replaces its store with the decoy under the same kind. Outcomes untouched.
- **Point-target math:** a mine's `poly` is `[centre]`; the segment test is "distance from the shell's path segment to the point ≤ shellRadius" (use the existing seg/circle primitive).

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green
- `npm test -w server && npm test -w client` -- expected: green; new gate/collector/perf tests
- `npm run lint` -- expected: 0 errors; the restriction fires on a planted `x.hp -= 1` outside world.ts (prove once, then remove the plant)
- `npm run check` -- expected: exit 0
- `grep -n 'victim.hp -=' server/src/game/world.ts` -- expected: one line
- `HC_DEV_OPTIONS=1 PORT=<free> node server/scripts/{soloSmoke,matchSmoke,weaponsSmoke}.mjs` -- expected: pass
