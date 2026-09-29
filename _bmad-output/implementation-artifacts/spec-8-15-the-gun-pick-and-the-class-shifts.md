---
title: 'Story 8.15: The Gun Pick and the Class Shifts'
type: 'feature'
created: '2026-09-28'
status: 'done'
baseline_revision: '2cbe92b'
final_revision: 'f00c816'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Every seat still mounts the one deck-gun module whatever gun the captain picked (`MOUNTED_GUN` maps all three to `'gun'`), every hull carries the same universal boost in slot 1, and the catalog still lists three cut lines (missile, monitor, heat seeking) plus two stubbed guns. Hull identity was ruled to be envelope + a FIXED class `Shift`, and the gun a real pick (amendment 89).

**Approach:** Build the machine gun (a held-fire magazine stream driven by a new boolean `InputMsg.held` level) and the flak gun (one shell air-bursting at the click) as full equipment modules mounted from the seat's `gun`; give each gun its own ladder line offered only while mounted; add two Shift modules (INSTANT RELOAD, DAMAGE CUT) beside the boost and fit slot 1 from `CONFIG.shipClasses.<id>.shift`; delete missile/monitor/heatSeeking end to end; rename the plain gun CANNON in match; add the minimal gun pick + SPECIAL row to today's class-select cards; add a gun-family field `w` to shell reveals as the one declared disclosure widening; `PROTOCOL_VERSION` 57 → 58 once. All numbers are Eric's rulings of 2026-09-28 (amendments 97–110).

## Boundaries & Constraints

**Always:**
- **Every gun is 360°** (amendment 106): `arc: 'full'` on `gun`, `machineGun`, `flak`; no out-of-arc denial exists for any gun; no wedge is drawn for slot 0.
- **Guns (Eric's numbers):** CANNON as shipped (`CONFIG.gun`). MACHINE GUN `CONFIG.machineGun = { arc:'full', hits: hull|decoy, shellSpeed 500, maxAmmo 16 (the magazine, shells), rateMs 500, reloadMs 15000, idleReloadMs 5000, damage 4, shellRadius 2 }`, range = the radar rung (re-pinned like `gun.rangeU`, 660 u), direct-hit shells with NO burst (a shell reaching its aim point expires with the self-private `sp` splash and no `burst` event; a shell in flight never touches a mine — amendment 20 — and the MG has no burst, so it can never detonate one). FLAK `CONFIG.flak = { arc:'full', hits: hull|mine|decoy|ordnance, shellSpeed 500, maxAmmo 1, reloadMs 6000, damage 12, burstRadius 50, shellRadius 2, contactDamage 4 (Eric's standing 40 % bodyblock ratio, floored) }`, range 660 u, one shell bursting at the click like the cannon's.
- **Magazine (amendment 103):** while `held`, one shell per `rateMs` at `now` (no `fireT`, no back-date, no `preStepShell`); the reload (always the full `reloadMs`) starts when the magazine is EMPTY, or after `idleReloadMs` without a shot while shells remain; a shot during a partial-magazine reload cancels it and restarts the idle clock; a completed reload fills the magazine. The stream stops on release, an empty magazine, Tab opening the refit window, window blur, and the same gates that stop a click (frozen, dead, sinking rules unchanged). Click edges (`fireSeq`) on a mounted machine gun do nothing; the level alone fires.
- **Ladders:** `deckGun` / `deckGunTurret` / `deckGunBarrel` unchanged (8.12), only their display name: `CANNON` (amendment 108). `machineGun` becomes a `ladder` line (cap 4, `appliesTo: ['machineGun']`, per tier `equipment.machineGun.maxAmmo +2`, `.damage +1`, reload −5 % via the tier step). `flak` becomes a `ladder` line (cap 4, `appliesTo: ['flak']`, per tier `equipment.flak.damage +2`, reload −5 %; blast fixed). A gun ladder is offered only while its gun is mounted (`ladderHost` already does this). Both ids keep their locked strings; `stub` flags drop; `STUB_ROWS` drains to zero.
- **Shifts (amendments 97–102):** three non-weapon `EquipmentId`s — `boost` (unchanged), `instantReload` (`CONFIG.instantReload { maxAmmo 1, reloadMs 45000 }`), `damageCut` (`CONFIG.damageCut { factor 0.5, durationMs 8000, maxAmmo 1, reloadMs 30000 }`) — chosen by `CONFIG.shipClasses.<id>.shift` (torpedoBoat `boost`, mineLayer `instantReload`, battleship `damageCut`); `loadoutFor(stats, fleet, gun, shift)` fits slot 1 from it (fleet: none); both sides resolve the shift from the class id. Every Shift row's `reloadMs` takes `cooldownScale` through the one multiply in `clampStats` (already total over `EQUIPMENT_IDS`). INSTANT RELOAD: for slot 0 and each fitted slot 2–4 with `reloadMsLeft > 0`: complete that one reload (per-round pools: `n += 1` capped, timer 0; the MG magazine: full, timer 0); nothing else touched. DAMAGE CUT: `ShipRecord.damageCutUntil`, set on activation; inside `applyDamage` after the sinking/self guards and BEFORE `absorbShield`: if `src !== 'storm'` and the cut is up, `amount = src === 'burn' ? amount / 2 : Math.floor(amount / 2)`; `OwnShip.damageCutUntil?` rides `you` only (the `slowedUntil` conditional-spread precedent), reset at sink/redeploy/respawn/match-reset beside `boostUntil`.
- **Signals:** `sp` for every gun shell that ends in water; exactly one `hc` per shell resolution and only when a HULL was struck (a burst that only kills mines/ordnance emits `sp`, as today's mine-only rule); `mz` per shell for the machine gun (`perShellFlash: true`), the cannon's multi-barrel click still one flash; the flak burst is a burst like any other (chains into armed non-captive mines, own included — amendments 16/18/20). The shell reveal gains exactly ONE optional field `w: 'cannon' | 'mg' | 'flak'` (`'cannon'` for the deck gun, broadside and star shells; never on `torp`, never range-derivable, no identity) — a DECLARED disclosure widening (amendment 89(i), ledgered); `ShellState` carries the family server-side.
- **Flak ordnance (amendment 105 — a side effect, nothing leans on it):** `hitTargets(['ordnance'])` collects live `torp`-kind shells (point polys) EXCLUDING the owner's own; `sweepMask` strips `ordnance` as it strips `mine` (burst-only); a struck fish is removed (`shells.delete` + `forgetBallistic` + `orphanTorpWake`) with no boom and no `hc`; the client's dead-reckoned ghost is ledgered as the presentation gap AR44 named.
- **Input:** `InputMsg.held: boolean` REQUIRED — a non-boolean drops the whole message; `neutralInput().held = false`; read as a LEVEL from `ship.input` (latest), never from the intent queue. Client: `held` = live canvas pointer (`activePointerId !== null`) OR a press latched since the last sample (so a tap shorter than one sample still yields one `held: true` input); forced false by `sendNeutralNow` and cleared by the existing blur / `endHolds()` (refit open) paths.
- **Perception:** the invariant suite iterates the gun rows (the fuzz seats ships with a random `GUN_IDS` gun and drives `held`), `verifyBallistic` accepts `w` from the fixed set on `shell` only, and the exception count stays exactly SIX. Draw state, `damageCutUntil` and the magazine are self-private.
- **Class select (amendment 107):** each card gains a `SPECIAL` row (ability name only: `SPEED BOOST` / `INSTANT RELOAD` / `DAMAGE CUT`) and a `DECK GUN` row of three chips `CANNON · MACHINE GUN · FLAK`, CANNON preselected, stored under `hullcracker.gun` beside the class and passed through `onConfirm → startGame → connect → joinOptions`. Home chip unchanged. Card copy is names only; the 9 px floor and container-fit law hold.
- **HUD:** the Shift square shows slot 1's id (glyph + name); DAMAGE CUT gets the boost's ACTIVE grammar for 8 s (amendment 34) from `damageCutUntil`; INSTANT RELOAD goes straight to the cooldown wipe; the gun square's tier reads the MOUNTED gun's tier; the held-fire drain (UX-DR52): amber outline + the magazine draining along the slot floor while a stream fires. Glyphs: implementer drafts in the existing style (amendment 110). Names: `Cannon`, `Machine Gun`, `Flak`, `Instant Reload`, `Damage Cut`.
- **Bots (amendment 109):** `ArenaRoom.buildBotFleet` seats each bot with a uniform gun from the room's seeded stream; `World.addBot(hull, profile, gun)` already exists; interim tactics as ruled; `BotDecision.held`; appetite/spend tables total over the new id sets; the harness gains `--gun <id>` (forces every bot's gun, needs `--bots`) and `TUNE_FAMILIES` gains `machineGun.`, `flak.`, `instantReload.`, `damageCut.`.
- **Measurement (AC):** an in-process test builds a World with 20 machine-gun bots streaming at each other, counts `mz` per tick and times `world.step()` best-of-5 (the `hitTargets` perf pattern, `HC_PERF_LOG`), asserting under the 50 ms tick; the numbers are written into the spec's Auto Run Result.
- **Wire:** `PROTOCOL_VERSION` 58 with a header entry (held, `w`, catalog content, Shift ids); the five PV pins move.
- `npm run check` green; complexity ≤ 10; no `Math.random` in sim; new sim math in `shared/`; whole-number damage.

**Block If:**
- A number not in amendments 97–110 or `CONFIG` is needed (never invent — HALT).
- The reveal `w` would need to carry anything beyond the three family words, or a seventh perception exception.
- The magazine model cannot be expressed without a second timer on the wire (`WeaponAmmo` stays `{n, reloadMsLeft}`; the idle clock is server-private).

**Never:**
- Build any arc for a gun; build the LOADOUT screen, picker modals or unlocks (9.4/9.6); delete the radar buoy (8.16); build SHIELD BLOCK (8.16); author bot tactic tables beyond the interim rules (8.19); re-author the deck-gun ladders (8.12); add in-game explanatory copy beyond names and the hover stat lines the existing card grammar requires (hover descriptions for the two new ladder lines are written in the existing register and ledgered as drafts).
- Rename the ids `gun`, `deckGun*`, `machineGun`, `flak`; touch `epics.md`, the GDD, `catalog-v3.md`, `DESIGN.md` or `CLAUDE.md`.
- Apply the cut to storm damage; apply INSTANT RELOAD to the belt or to itself; let a click edge fire the machine gun; back-date a stream shell.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Seat mounts the pick | join `gun: 'machineGun'` / `'flak'` | slot 0 holds equipment `machineGun` / `flak` with a full pool; `OwnShip.gun` mirrors; the client replays the same loadout | unknown → `deckGun` as 8.14 |
| Stream | MG mounted, `held: true` for 3 s, target in reach | 6 shells (t = 0, 0.5, 1.0 …) each at `now`, each with its own `mz`, magazine 16 → 10; release → no more shells; idle 5 s → reload starts (15 s) → magazine 16 | a shot at 4.9 s idle cancels the pending start; at 5.2 s a shot cancels a running partial reload |
| Empty magazine | 16 shells fired while held | 17th tick sends nothing, no denial on the wire (the empty state is visible in `ammo`); reload runs 15 s then 16 | none |
| Click on MG | `fireSeq` +1, `held` false | nothing fires, nothing denied | none |
| Tap | pointerdown+up inside one 50 ms sample | exactly one input with `held: true` → one shell | none |
| Blur / Tab | window blur, or refit opens mid-stream | the next input carries `held: false`; the stream stops that tick | none |
| Flak burst | click at 300 u, hull 30 u off the point, enemy fish 20 u off | 12 hp to the hull (`hc`), the fish removed with no boom; own fish inside the blast untouched | none |
| Flak bodyblock | hull crosses the flak shell's path | contact 4 hp, one `hc`, shell consumed (cannon rule) | none |
| Damage cut | BS activates Shift, then takes a 15 hp shell, a 55 hp mine, a burn tick of 0.25 | 7, 27, 0.125 dealt; `lastDamagedAt` stamps; after 8 s full damage | a storm bite lands in full while the cut is up |
| Cut then shield | (8.16) shield 100, cut up, 30 hp torpedo | 15 reaches the shield, shield 85 left, 0 dealt | none |
| Instant reload | ML: cannon reloading (n 0, 2.1 s left), torp reloading (n 0), mines n 1/2 reloading, belt HULL REPAIR ×2 | cannon n 1 timer 0; torp n 1 timer 0; mines n 2 timer 0; belt untouched; Shift slot n 0, 45 s | a second press within 45 s: `no-ammo` → wire `cooling` |
| Instant reload, MG | MG magazine 5/16 mid partial reload (9 s left) | 16, timer 0 | idle MG with 16: untouched |
| Ladder gating | flak mounted | `flak` ladder offered; `machineGun`, `deckGun*` never; TURRET/BARREL never | none |
| Fleet drone | role `fleet` | slot 0 cannon, no Shift, never a `w` other than `cannon` | none |
| Reveal | any gun shell enters an observer's sight | `{k:'shell',id,x,y,vx,vy,t,w}`; torpedo reveals carry no `w` | none |
| Bots | room with 12 bots | each seated with a seeded uniform gun; MG bots stream while a target is in reach; ML bots reload-burst; BS bots cut after damage | `--gun flak` forces all |

</intent-contract>

## Code Map

- `shared/src/types.ts` -- `InputMsg.held`, `BallisticEvent.w?`, `OwnShip.damageCutUntil?`; doc comments amended (the "no field may EVER be added" lines become "one declared family field")
- `shared/src/sim/loadout.ts` -- `EquipmentId` −missile/−monitor +instantReload/+damageCut; `EQUIPMENT_IS_WEAPON`; `ShiftId`; `MOUNTED_GUN` machineGun→`machineGun`, flak→`flak`; `loadoutFor(stats, fleet, gun, shift)`
- `shared/src/sim/boons.ts` -- `slotsWithCards(…, gun, shift)`
- `shared/src/constants.ts` -- `shipClasses.<id>.shift`; `CONFIG.machineGun`, `CONFIG.flak`, `CONFIG.instantReload`, `CONFIG.damageCut`; mask constants; stale PV comment
- `shared/src/sim/catalog.ts` -- delete `missile`/`monitor`/`heatSeeking` rows and ids; `machineGun`/`flak` → ladders; `LINE_IDS` 29 → 26; header counts
- `shared/src/sim/stats.ts` -- `STUB_ROWS` → empty; rows for the two guns (`EffectiveGun`-shaped, MG adds `rateMs`/`idleReloadMs`, no `barrels`/`burstRadius`) and the two Shifts (boost-shaped); `clampStats` re-pins `machineGun.rangeU`/`flak.rangeU` = radar; delete `EffectiveMissile`/`EffectiveOrdnanceGun`
- `shared/src/sim/effects.ts` -- `EQUIPMENT_STAT_FIELDS`/`EQUIPMENT_INT_FIELDS` (maxAmmo, damage whole); `DOCTRINE_MODES` −missile
- `shared/src/sim/arcs.ts` -- `equipmentArc`: `machineGun`/`flak` → `CONFIG[id].arc` (full); `unbuiltArc` narrows to `boost | instantReload | damageCut`
- `shared/src/sim/shell.ts` -- `ShellState.family`, `direct` (no-burst) flag; `classifyHit` arrival with `direct` → expired; `TargetKind` unchanged
- `shared/src/index.ts` -- PV 58 + header entry; barrel exports
- `shared/src/__tests__/` -- `shipClasses.test.ts` (deliberate: `shift` key), `catalog`, `stats`, `arcs`, `shell`, `loadout`, `barrel`, `nineSlots`, `boons`, `draw`, `hooks`, `damageGuardrail` (guardrail restated per shell for the MG), new `shift.test.ts` / `guns.test.ts`
- `server/src/game/equipment/guns.ts` -- `gunEquipment` sets `family: 'cannon'`; NEW `machineGun.ts` (magazine tick + `stream()`), `flak.ts` (burst gun, family `flak`); `ammo.ts` gains `tickMagazine`
- `server/src/game/equipment/index.ts` -- `Equipment.stream?(ctx, slot, held)`; registry rows `machineGun`, `flak`, `instantReload`, `damageCut`; NEW `instantReload.ts`, `damageCut.ts`; `ActivationContext.finishReloads()` capability (World-owned loadout write)
- `server/src/game/inputs.ts` -- `held` validated + returned; `neutralInput`
- `server/src/game/world.ts` -- `ShipRecord.damageCutUntil`, `streamNextAt`, `lastStreamShotAt`; `fireControl` → `streamControl` for slot 0 each tick; `consumeClick` skips a stream row; `applyDamage` cut step; `DamageSource` −missile; `collectOrdnance` + `sweepMask`; `resolveBurst` ordnance removal; `emitMuzzleFlash` per shell for MG; `addBot` gun (exists); resets
- `server/src/game/frames.ts` -- `toOwnShip` `damageCutUntil` conditional spread
- `server/src/game/signals.ts` -- `ballisticSignal(shell)` materializes `w`
- `server/src/rooms/ArenaRoom.ts` -- `buildBotFleet` seeded gun per bot
- `server/src/game/ai/types.ts`, `botDriver.ts`, `equipment.ts`, `spending.ts`, `profiles.ts` -- `BotDecision.held`; `machineGunTactic` (held while target in reach), `flakTactic` (burstSolve widened), `instantReloadTactic`, `damageCutTactic`; `BASE_APPETITE` total; `CATEGORY_LINES.guns` + `machineGun`/`flak`; rename the local `held` in the engage gate
- `server/scripts/batchsim/args.ts`, `runner.ts`, `overrides.ts`, `catalogMetrics.ts` -- `--gun`; `TUNE_FAMILIES`; damage attribution rows for MG/flak
- `server/scripts/rl/features.ts` -- `CARD_IDS` shrinks (note in deferred-work: saved models break)
- `server/src/__tests__/` -- `equipment` (14 rows), `upgrades`, `damageGate` (cut cases), `hitTargets` (ordnance populated), `perception` (gun-row fuzz, `w`, six exceptions), `signals`, `roomOptions`, `botTactics`, `botPolicy`, `denials`/`colyseus018` PV pins, new `machineGunStream.test.ts` (magazine + 20-bot `mz` measurement), `flak.test.ts`, `shift.test.ts`
- `server/scripts/weaponsSmoke.mjs` -- new phase: one captain per gun (`gun` join option) lands a hit with the CONFIG damage; `queueSmoke.mjs` seat proof covers all three
- `client/src/input/mouse.ts`, `sim/inputSampler.ts`, `main.ts` -- `isHeld` getter + press latch, `held` sampled, `sendNeutralNow` forces false
- `client/src/ui/classSelect.ts`, `ui/home.ts`, `net/connection.ts` -- SPECIAL row, gun chips, `hullcracker.gun`, `onConfirm(cls, gun)`, `connect(…, gun)`
- `client/src/render/equipmentIcons.ts`, `equipmentInfo.ts`, `hotbar.ts`, `slotTooltip.ts`, `weaponArc.ts`, `aimPreview.ts`, `projectiles.ts`, `net/roomBindings.ts` -- glyphs, names, gun-family set replacing `GUN_EQUIPMENT_ID`, mounted-gun tier, held-fire drain, `damageCut` ACTIVE window, shell looks by `w` (`mg` tracer / `flak` / `cannon`), own-fire latch per stream shell
- `client/src/ui/boonCopy.ts` -- `CANNON`; MG/flak ladder names + hover stat lines + draft descriptions; −missile/−monitor/−heatSeeking; `FACE_FIELDS`
- `client/src/__tests__/` -- `connection` (gun threaded), `classSelect`, `hotbar`, `boonCopy`, `fitCheck`, `refitCardFit`, `refitTooltipFit`, `cardStatRows`, `tooltipFit`, `inputSampler`, `mouse`, `ordnanceMasksAreServerOnly` PV pin
- `VERSION`, root `package.json` (+ lock) -- 0.18.15 (cycle 150); `CHANGELOG.md`; both trackers (one-line stamps); `deferred-work.md` 8.15 section; `README.md` if it names the boost or deck gun

## Tasks & Acceptance

**Execution:**
- [x] Wave 1 `shared/` -- ids, CONFIG blocks, catalog cuts + ladders, stats rows, arcs, shell family/direct, loadout shift, types, PV 58, tests -- `npm run build -w shared && npm test -w shared`
- [x] Wave 2 `server/src` (sim + rooms + tests) -- input `held`, stream control, magazine, flak + ordnance collector, Shifts, damage cut, `w` on the reveal, frames, perception suite over gun rows, bot random gun seat -- `npm test -w server`
- [x] Wave 3 `client/` (parallel with 2) -- held sampling, class-select pick + SPECIAL, HUD glyphs/names/drain/ACTIVE, shell looks, copy, tests -- `npm test -w client`
- [x] Wave 4 bots + harness + smokes + measurement -- tactics, appetite/spend tables, `--gun`, `TUNE_FAMILIES`, catalog metrics rows, `weaponsSmoke` gun phase, the 20-bot `mz` test -- `npm test -w server`; smokes on a scratch port
- [x] Wave 5 docs -- version 0.18.15, changelog, trackers, deferred-work (ordnance side effect; ghost fish; glyph + copy drafts; RL feature vector; DAMAGE CUT tally reads post-cut `dealt`), stale comments -- `npm run check` exit 0
- [x] Unit-test every row of the I/O matrix

**Acceptance Criteria:**
- Given a join with each of the three guns on each of the three hulls (nine in-process worlds), when the captain fires once at a hull in reach, then slot 0 holds that gun's module, the hit lands for the CONFIG damage (4 direct / 12 burst / 15 burst), the reveal carries the matching `w`, and slot 1 holds the hull's Shift.
- Given `held: true` for 3 s on a machine gun, when the ticks run, then exactly 6 shells spawn 500 ms apart at `now` with 6 `mz`, no `burst` events, an `sp` per shell that reaches water, and the magazine reads 10; released and idle for 5 s the reload starts and completes in 15 s to 16.
- Given a Battleship with the cut up, when a 15 hp shell, a 55 hp mine, a 0.25 burn tick and a storm bite land, then 7, 27, 0.125 and the full bite are dealt, and the own-ship frame carries `damageCutUntil` while no other client's frame does.
- Given 2000 seeded perception fuzz worlds with random guns and random `held`, then nothing outside sight ∪ this-tick paints reaches a client, `w` appears only on `shell` reveals from the three-word set, and the exception count is six.
- Given 20 machine-gun bots streaming in one World, then `world.step()` best-of-5 is under 50 ms and the per-tick `mz` count is recorded in the Auto Run Result.
- Given `npm run check`, then lint, tsc ×3 and every test pass with zero references to `missile`, `monitor`, `heatSeeking`, `STUB_ROWS` content, or the `machineGun`/`flak` stub flags; `PROTOCOL_VERSION` is 58; `LINE_IDS` has 26 entries.

## Spec Change Log

## Review Triage Log

### 2026-09-29 — Review pass (Blind Hunter + Edge Case Hunter on Fable, plus Codex `gpt-5.6-sol` cross-model review on the source diff — verdicts: Codex FIX-FIRST on one medium; agreement: ALL THREE flagged the dropped-seat stream (F1); Codex + Blind flagged the stale ordnance memo point (F3); Blind alone: ordnance in the damage loop (F2), the oracle tolerating a shell without `w` (F4), the drain painting with another slot primed (F9), `flak.burstRadius` addressable (F7), comment drift (F6/F8); Edge alone: the ladder grant during a swap (F5), the cancel-latch (F10), the enemy-tracer own-fire claim (F11); every anti-cheat, input-validation, damage-gate and layering probe came back clean from all three)
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 0, medium 1, low 10)
- defer: 1: (high 0, medium 0, low 1) — a second deferral (cannon-only flare reach) was overturned by Eric the same day and built (amendment 114)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` a machine-gun seat that disconnected mid-hold streamed for the whole reconnect grace (the level lived on the stored input): the room releases `held` on drop before the grace opens; a reconnect with a fresh hold resumes (all three reviewers)
  - `[low]` `[patch]` a burst could remove a fish from a memoized pre-step point: removal re-checks the live position inside the blast; the "never steps again" comment corrected (Codex + Blind)
  - `[low]` `[patch]` an `ordnance` victim reached `burstDamage`/`hitBuoy` by store-membership accident: skipped in the damage loop; a fish-only burst is `sp` (Blind)
  - `[low]` `[patch]` the perception shape oracle tolerated a shell reveal without `w`; the launch event's `w` was unpinned: both pinned, mutation-verified (Blind)
  - `[low]` `[patch]` a MACHINE GUN ladder grant during an idle swap left the swap running on a full magazine: `tickSwap` pins the timer at full (Edge)
  - `[low]` `[patch]` `flak.burstRadius`/`contactDamage` left the stat-field whitelist (amendment 105's fixed blast, compile-enforced) (Blind)
  - `[low]` `[patch]` the held-fire drain painted while another slot was primed: requires the gun selected (Blind; Eric confirmed the gate, amendment 111)
  - `[low]` `[patch]` a cancelled pointer gesture kept the press latch: cleared on the holding pointer's cancel (Edge)
  - `[low]` `[patch]` an enemy `mg` reveal near the own hull was claimed as own `gun` fire: only the stream claim can own a tracer (Edge)
  - `[low]` `[patch]` two stale comments (reconcile timer wording; the flak `contactDamage` ratio claim) (Blind)
- rulings recorded: Eric 2026-09-29 — the stream fires only while the gun is the selected slot (amendment 111); an idle magazine swap shows the normal wipe (amendment 112); orchestrator review-gate rulings (amendment 113).
- deferred (ledgered in `deferred-work.md`): the interim Battleship bot's cut trigger reads the post-shield `dmg` amount (8.19). The lit-zone reach asymmetry was WRONGLY deferred: Eric ruled the same day (amendment 114) that every deck gun fires into the shooter's own lit-up area, and the machine gun and flak now take the R2.15 reach exactly as the cannon, both sides, fail-first pinned (server 2101 / client 3711 tests).

## Auto Run Result

Status: done (cycle 150, 0.18.15; PROTOCOL_VERSION 57 → 58; epic-8 amendments 97–114)

**Summary.** Story 8.15 landed as Eric ruled it on 2026-09-28/29. The gun is a real pick on today's class-select cards (CANNON · MACHINE GUN · FLAK chips plus a SPECIAL row), frozen at queue and mounted from the seat. The MACHINE GUN is a held-fire magazine stream (`InputMsg.held`, a required boolean level; 4 damage per shell, one shell per 0.5 s while the gun is the selected slot, 660 u, a 16-shell magazine, a 15 s swap that starts when empty or after 5 s idle and is cancelled by a shot; per-shell muzzle flash; a dropped seat releases the level). The FLAK GUN is one shell bursting at the click (12 damage in a 50 u blast, 660 u, 6 s; enemy torpedoes inside the blast are removed silently, own torpedoes immune — a side effect Eric may remove). Every gun is 360°. Each gun's ladder is offered only while it is mounted (MG +2 shells / +1 damage / −5 % reload per tier; flak +2 damage / −5 %). Every hull carries a FIXED Shift in slot 1: SPEED BOOST (Torpedo Boat, as shipped), INSTANT RELOAD (Mine Layer, 45 s, finishes the running reload of the gun and every fitted weapon), DAMAGE CUT (Battleship, halves incoming weapon damage rounded down for 8 s on a 30 s cooldown, before the shield, storm excluded). HORIZONTAL MISSILE, MONITOR GUN and HEAT SEEKING are deleted end to end (LINE_IDS 29 → 26). The shell reveal carries one new family word `w` (cannon / mg / flak) as the one declared disclosure widening; the perception invariant still counts six exceptions. Bots are seated with a seeded random gun and carry interim Shift and gun tactics until 8.19; the harness gains `--gun`. The plain gun is CANNON everywhere in match.

**Files.** shared: `types.ts`, `sim/loadout.ts`, `sim/boons.ts`, `constants.ts`, `sim/catalog.ts`, `sim/stats.ts`, `sim/effects.ts`, `sim/arcs.ts`, `sim/shell.ts`, `sim/draw.ts`, `index.ts` (PV 58), tests. server: `game/equipment/{machineGun,flak,instantReload,damageCut}.ts` NEW, `equipment/{index,guns,ammo,ballistics,broadside,starShells,torpedoCore,mines}.ts`, `game/{inputs,world,frames,signals,drones}.ts`, `rooms/ArenaRoom.ts`, `game/ai/{types,botDriver,tactics,equipment,spending}.ts`, `scripts/batchsim/*`, `scripts/rl/*`, every smoke `.mjs`, tests (`machineGunStream`, `flak`, `shift`, `machineGunFlashCost` NEW). client: `input/mouse.ts`, `sim/inputSampler.ts`, `sim/ownFire.ts`, `main.ts`, `ui/{classSelect,home,boonCopy}.ts`, `net/{connection,roomBindings}.ts`, `render/{equipmentIcons,equipmentInfo,hotbar,slotTooltip,weaponArc,aimPreview,projectiles}.ts`, `config.ts`, tests (`gunPickHud` NEW). Docs: `VERSION` / `package.json` / lock 0.18.15; `CHANGELOG.md`; both trackers; `deferred-work.md`; amendments 97–113 in both homes; `epic-8-context.md` recompiled; this spec.

**Measurement (AC).** 20 machine-gun bots streaming in one World, Node v22.19.0: `mz` per tick mean 1.35 / max 6 (exactly one per stream shell, 270 shells in a 200-tick window), shells in flight mean 4.88 / max 19, `world.step()` best-of-5 mean 1.024 ms per tick, worst tick 3.909 ms — far under the 50 ms tick (`machineGunFlashCost.test.ts`).

**Review.** Blind Hunter + Edge Case Hunter (Fable) and Codex `gpt-5.6-sol`: one medium (all three) and ten low patches, all fail-first proven; two deferred; zero rejected. See the Review Triage Log.

**Follow-up review recommended: true** — the patch wave changed the room's drop path (a new `releaseHeld` seam), the burst's ordnance resolution and the client's own-fire attribution; each is pinned, but they were reviewed only by their implementer.

**Verification.** `npm run check` exit 0 after the patch wave: shared 934 / server 2097 / client 3708 tests, hooks green; eslint 0 errors (3 pre-existing max-lines warnings). Headless smokes: weaponsSmoke PASS on attempt 1 with the new three-guns phase (cannon 15 / mg 4 / flak 12, reveals `w` cannon / mg / flak, held ticks sent with fireSeq 0), queueSmoke PASS (seat proof over all three gun ids), openingSmoke PASS; queue + opening re-run PASS after the patches.

**Residual risk / for Eric.** (1) Glyphs, chip layout, drain bar, tracer look and the two ladder hover descriptions are implementer drafts for your eye on staging (amendment 110). (2) The flak's anti-ordnance half is built but ledgered as removable, per your words. (3) The attacker's damage tally reads the post-cut amount; `finishReloads` restarts a short pool's timer at full rather than 0 — both ledgered readings you may overrule. (4) Every deck gun reaches into your own flare's light beyond 660 u (amendment 114, built). (5) `epics.md`, the GDD and `catalog-v3.md` now carry superseded clauses (bow ±90°, R20/R21/R26/R27 numbers, the 20 s boost, "tilt") — 9.11 doc-sync. Staging QA: pick each gun on class select and confirm the chip persists; hold the button with the machine gun and watch the drain bar, the 5 s idle swap and the wipe; flak burst ring at 50 u; Shift on each hull (boost / instant reload with a reloading weapon / damage cut halving a hit); no missile, monitor or heat-seeking card ever appears.


## Design Notes

- **Why three Shift ids instead of one module dispatching on hull:** the registry, the stat rows (so RELOAD's `cooldownScale` applies through the one multiply with no special case), the bot tactic rows, the HUD glyph table and the client's per-id prediction hook all key on `EquipmentId`; a per-hull switch inside one row would need a hull id on every one of those tables instead.
- **Why the stream is a level and never a click:** a click edge is one activation per `fireSeq` increment through `consumeClick`; a stream fires on the server clock while a level is true. Letting both fire would double the first shell and reopen the back-date question the AC closed.
- **Why the magazine keeps `{n, reloadMsLeft}`:** the wire `WeaponAmmo` and the cooldown wipe already read those two; the idle clock is a server-private timestamp on the `ShipRecord`, and the client shows the drain from `n / maxAmmo`.
- **Why `w` is three words:** it is exactly what the client needs to draw a tracer, a flak burst or a cannon shell; it names no shooter, no range and no tier, and torpedoes stay blind.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- green after wave 1
- `npm test -w server`; `npm test -w client` -- green after waves 2–4
- `npm run lint`; `npm run check` -- exit 0
- `HC_DEV_OPTIONS=1 PORT=<scratch> npm run dev -w server` + `WS_URL=ws://localhost:<scratch> node server/scripts/{queueSmoke,weaponsSmoke,openingSmoke}.mjs` -- pass; kill only the booted PID
- `grep -rn "missile\|monitor\b\|heatSeeking" shared/src server/src client/src --include=*.ts | grep -v __tests__` -- zero hits outside comments that record the cut
