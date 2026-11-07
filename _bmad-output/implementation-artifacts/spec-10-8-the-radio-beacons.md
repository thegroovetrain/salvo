---
title: 'Story 10.8: The Radio Beacons'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_revision: '75089a23'
final_revision: 'the closing records commit at the PR head on worktree-story-10-8-radio-beacons (code: 69e9fc4e, the review-gate patches)'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized', 'multiple-goals']
---

<intent-contract>

## Intent

**Problem:** The first minute has no objective that pulls captains toward each other. The PvE drone fleet makes the map busy, still has to be hunted, and does not cause player-versus-player conflict (Eric, 2026-11-03).

**Approach:** Retire the drones entirely and add RADIO BEACONS: global world objects placed at each ring cycle's 0:00, on every chart at once through the Colyseus schema, that surface at 1:00 and pay split XP to every hull within 500 u, then sink. A surfaced beacon is a solid, shootable, rammable body.

## Eric's rulings for this story (2026-11-06, three AskUserQuestion rounds before the spec — literal spec, to be recorded as epic-10 amendment 14; the story text and amendment 6(g) stand wherever these do not rule)

- **R1 Base.** Build from `development` now; Story 10.7 (PR #324, open) is merged in when it lands (*"Its fine, when that lands we'll suck it in ezpz."*). Numbers are taken one past 10.7's: cycle 217, 0.19.11, PV 98 → 100, amendment 14.
- **R2 Counts.** 8 / 4 / 2 for the cycles starting 0:00 / 4:00 / 8:00. NONE in the 12:00 sudden-death cycle.
- **R3 Timeline** (supersedes the story's "2 levels/min falling linearly from 1:00 to 3:00"). 0:00 charted (signal only, nothing in the water). 1:00 it SURFACES and FLOATS for one minute paying the FULL rate. Then it SINKS over one minute, the rate scaling down to 0 across that minute; gone at 3:00 on the natural schedule. Reading: the fall across the sink minute is linear.
- **R4 Rate.** **3 levels per minute** while floating (*"lets actually say it transmits 3 levels worth of XP per minute for the first minute, which then scales down to 0 over the minute that it sinks"*). One beacon's natural pot is 4.5 levels.
- **R5 Body.** Solid and shootable: **1000 HP, ARMOR 100** (*"Give it a full 1000 HP and 100 ARMOR and lets see how it goes."*).
- **R6 Destroyed = sinks early.** At 0 HP during the float minute the one-minute sink starts at once (*"Shooting it during that first minute and destroying it would make it start that minute long sink early."*). Readings: damage after the sink has started does nothing; it cannot be hit before it surfaces.
- **R7 Hull contact = the ramming law.** It behaves like an anchored ship; mass = ARMOR. Ship and beacon both take ram damage.
- **R8 Every weapon damages it** through the normal ARMOR gate exactly as a ship with ARMOR 100: main battery, secondaries, torpedoes, mines, special shells (the phosphor burn included).
- **R9 An early sink is PUBLIC.** Every captain's chart shows that beacon fading early.
- **R10 Placement margin.** The whole 500 u circle lies inside the live ring at placement (beacon at least 500 u inside the ring edge).
- **R11 Damage shows as smoke and fire, like a ship** (*"Give it smoke and fire like a ship would have."*). No bar, no number.
- **R12 Small cases.** Solid to hulls while sinking (the wreck law). A mine does NOT trip on a beacon; a mine blast damages it. **Homing torpedoes MAY lock onto a beacon.** **Damage to a beacon counts in the shooter's damage-dealt total.**
- **R13 Destroying it pays 2 levels of XP, divided among participants as a ship kill is** (*"it would be interesting if it was worth, say, 2 levels worth of XP to kill it, which would be divided among participants like ship kills would be."*). Readings: the existing kill-value split (killer share + assist window) over the hulls that damaged the beacon; no kill-feed line, no kill count, no bounty.

## Boundaries & Constraints

**Always:**
- The beacon is its own server object, never a `ShipRecord`: never a perception contact, a radar paint, a wake, a storm victim, a `sunk` row or a bot target.
- Beacon positions and sink times travel ONLY on the schema (flat scalar fields on `ArenaState`; the two-schema-class pin stays). Nothing spatial about a beacon is added to frames. The SIX perception exceptions stay six; beacon smoke/fire reuses the existing anonymous `sm` row at the beacon's already-public position with the ship damage bands applied to its HP fraction.
- One shared pure module (`shared/src/sim/beacons.ts`) is the only source of the lifecycle and rate for server payout, client rendering, client contact prediction and bots. Every number is in `CONFIG.beacons`.
- The pot splits evenly among afloat hulls (captains and bots) whose centre is within range; XP stays integer ms with a carried remainder; an empty circle accrues nothing. A receiving hull gets no paint, event or tell beyond its own self-private XP fields.
- Placement uses the fleet-anchor rule (`pickFleetAnchor`), each pick added to `occupied`, on a PRIVATE seed stream (never the public map seed). No valid disc-clear spot → the rule's max-min fallback, logged.
- `STEP_ORDER` gets explicit rows; bots read beacons only through `BotWorldPort.beacons()` (human parity: the same public facts the schema carries; this spec's rulings are the widening ruling).
- A dev room option `matchOverride.beacons` (honoured only with `HC_DEV_OPTIONS=1`) replaces `fleetWaves`.
- American spelling; complexity ≤ 10; no word-police tests, no tests pinning Eric's numbers (test the mechanism against `CONFIG`).

**Block If:**
- The beacon's body size/shape and its look (chart marker, hull on the water, 500 u ring, sinking) have not been shown to Eric as a RENDERED candidate and approved — required before the client render and the body-size value are committed as final.
- A seventh perception exception, a third schema class, or any per-ship fact on the schema appears necessary.
- Any unruled mechanic or number surfaces (ask Eric interactively).

**Never:**
- No guards, no beacon radar return, no in-game copy, no kill-feed line, no beacon HP on the wire, no airdrops (10.9), no bot contest/exit tuning (10.12), no sound (10.13), no GDD / `game-architecture.md` stamps (10.14), no deck-gun (`CONFIG.gun`) removal (deferred-work), no edit to `CLAUDE.md` (its schema sentence goes stale — report it).
- No merge of any PR. No batch sims.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cycle start | zone clock enters group 0 / 1 / 2 | 8 / 4 / 2 beacons placed; schema `beaconCycle`, `beaconCount`, slot x/y set; sink times 0 | No disc-clear spot → max-min fallback + warn log |
| Sudden death | group 3 (12:00) | set cleared: `beaconCycle = -1`, `beaconCount = 0` | — |
| Charted | cycle 0:00–1:00 | not solid, not hittable, pays nothing | — |
| Floating, alone | one hull within range for a tick | hull gains rate × dt ms XP | — |
| Floating, shared | n hulls within range | each gains floor(pot / n); remainder carried | n = 0 → pot reset to 0 |
| Sinking | sink start → +sinkMs | rate falls linearly to 0; still solid; damage ignored | — |
| Destroyed afloat | HP reaches 0 | `sinkT = now` on the schema; kill value (CONFIG) split as a ship kill among its damagers; later shells that tick pass through | — |
| Hit before surfacing / after sink start | any weapon | no damage, shell does not stop on it | — |
| Ram | hull contacts a solid beacon | ramming law with the beacon immovable, mass = its ARMOR; a hull sunk this way has no killer | — |
| Late joiner | joins mid-cycle | reads the same beacon set and sink times from the schema | — |
| Beacons off | `matchOverride.beacons: false` under `HC_DEV_OPTIONS=1` | none placed, schema cleared | option ignored without the env flag |

</intent-contract>

## Code Map

- `shared/src/sim/zone.ts` -- ring groups and beats (`ZONE_BEATS_PER_GROUP`, `zoneLiveState`); the cycle clock beacons derive from
- `shared/src/sim/shell.ts` -- `TargetKind` (:239), kind skips (:325/447/568; homing pick at :447 must ACCEPT beacons per R12)
- `shared/src/sim/contact.ts` -- `resolveHullContacts`, immovable bodies (:231-237)
- `shared/src/constants.ts` -- `CONFIG.drones` (:411), `CONFIG.fleet` (:522), `xp.droneTierLevels` (:2844), `DRONE_HULL_IDS`/`HULL_IDS` (:3321-3415), `hits:` masks, `CONFIG.zone` (:3018), `CONFIG.xp`, `damageBands`, `smoke`
- `shared/src/index.ts` -- barrel, `PROTOCOL_VERSION` (98)
- `server/src/game/spawn.ts` -- `pickFleetAnchor` (:280), the placement rule
- `server/src/game/world.ts` -- `STEP_ORDER` (:3840), `hitTargets` (:4166), hull-pass bodies (:4664) and `damagePair` (:4746), `resolveInterception` (:6064), `burstDamage` (:6212), `applyMineBlast` (:5525), `applyZoneEffects` (:6504), `armorDamage` (:5758), `addXpMs` (:3264), `payKillValue` (:3112), `zoneRingSeed` (:2134), fleet code (:5068-5250) and ~20 `roleIsFleetHull` guards
- `server/src/game/drones.ts` -- the fleet controller (deleted)
- `server/src/game/participants.ts` -- `ShipRole`, `isFleetHull`, `isParticipant`
- `server/src/game/signals.ts` / `perception.ts` / `frames.ts` -- the `sm` puff emission, `aggroAt`, `vcls`/`kcls`; the chokepoint beacons must not enter
- `server/src/rooms/schema/ArenaState.ts`, `server/src/rooms/ArenaRoom.ts` (`syncZone` :1433), `server/src/rooms/roomOptions.ts` (:281) -- schema and dev option
- `server/src/game/ai/` (`types.ts` port :253, `navigate.ts` :526-594, `posture.ts` :169, `utility.ts`, `profiles.ts`) and `server/src/game/botPort.ts` -- bots
- `server/src/game/match.ts`, `matchRecord.ts` -- `pveKills` → `beaconXpMs`
- `server/scripts/batchsim/*`, `server/scripts/*.mjs` -- harness readouts, smokes
- `client/src/main.ts` (`PublicState` :1170, layers :2853), `client/src/sim/zoneView.ts`, `client/src/sim/contactPass.ts`, `client/src/render/{zone,mines,litZones,ships,nameplates,contacts}.ts`, `client/src/ui/killFeed.ts`, `client/src/score.ts`, `client/src/net/roomBindings.ts`, `client/src/stage/worstCaseScene.ts` -- client seams and drone code
- Pins to amend deliberately: `server/src/__tests__/stepOrder.test.ts`, `damageGate.test.ts` (:696 one `.hp -=`), `eslint.config.*` (:90-105), `barrel.test.ts`

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/beacons.ts` (+ test) -- new pure module: count per cycle, cycle start, sink start, `beaconStateAt` (phase, rate, sink progress), solid/hittable predicates, body polygon, integer pot split -- one source for all three sides
- [x] `shared/src/constants.ts`, `shared/src/sim/shell.ts`, `shared/src/index.ts` -- add `CONFIG.beacons` (counts, rangeU, surfaceMs, floatMs, sinkMs, levelsPerMin, hp, armor, killLevels, edge margin, body size), `TargetKind 'beacon'` in the weapon hit masks; export -- additive wave
- [x] `server/src/game/beacons.ts` (+ test) -- `BeaconField`: store, placement on a private seed stream, per-tick payout with carried remainder, damage ledger for the kill split, `beaconChart` snapshot, harness counters -- keeps `world.ts` to glue
- [x] `server/src/game/world.ts` -- `tickBeacons` row after `tickXp`, `placeBeacons` row last; `collectBeacons` in `hitTargets`; `damageBeacon` door reached from interception, burst, mine blast, burn zones and ramming; `sm` puffs for a hurt beacon; `targetsGen` bump on early sink; `ShipRecord.beaconXpMs` -- R5–R8, R11–R13
- [x] `server/src/rooms/schema/ArenaState.ts`, `ArenaRoom.ts`, `roomOptions.ts` -- flat fields `beaconCycle`, `beaconCount`, `bcn0..7X/Y/SinkT`; `syncBeacons()`; `matchOverride.beacons` -- R9, late joiners
- [x] `server/src/__tests__/` -- beacon lifecycle/payout/split/damage-per-weapon matrix/ram/early-sink tests; perception invariants extended (no beacon id in any frame; two-world differential: frames identical except the receiver's own XP fields; schema observer-independent); amend the step-order, `.hp -=` and schema-field pins
- [x] `client/src/sim/beaconView.ts`, `client/src/render/beacons.ts`, `client/src/main.ts`, `client/src/sim/contactPass.ts` (+ tests) -- read the schema, render chart marker / water hull / 500 u ring / sinking, append immovable contact bodies for solid beacons -- rendered candidate to Eric BEFORE this is final
- [x] `server/src/game/ai/*`, `server/src/game/botPort.ts` (+ tests) -- `BotWorldPort.beacons()`; with no target, sail to a standoff point inside the nearest paying beacon's circle and hold (`farm`), release when gone; never route through the solid centre
- [x] `server/src/game/match.ts`, `matchRecord.ts`, `server/scripts/batchsim/*` -- `beaconXpMs` per participant; harness reports beacon XP per hull and hulls-in-range per beacon per tick
- [x] Drone retirement (server core → fixtures and bots → harness, smokes, client → shared deletions last) -- delete `drones.ts`, `CONFIG.fleet`/`CONFIG.drones`/`droneTierLevels`, drone hull ids, the `'fleet'` role, `fleetWaves`, `pveKills`, `vcls`/`kcls`, client drone rendering; fixtures that meant "another hull" become role `'captain'` with a real class; tests whose subject was fleet behavior are deleted
- [x] `shared/src/index.ts`, `VERSION`, `package.json`, `CHANGELOG.md`, both trackers, `epic-10-context-amendments.md` (14), `epic-10-context.md`, `deferred-work.md`, dated stamp on Story 10.8 in `epics.md` -- closing records; PV 100

**Acceptance Criteria:**
- Given a started match with beacons on, when each of the first three ring cycles begins, then every client's room state shows that cycle's beacon set at once, and no frame of any observer contains a beacon id, contact or paint.
- Given two matches on one seed differing only in beacons on/off with scripted stationary hulls, when frames are compared, then they differ only in receiving hulls' own XP fields.
- Given a floating beacon, when each weapon family and a ram strikes it, then its HP falls by the same gate a 100-ARMOR ship would take, the damage is credited to the shooter's total, and at 0 HP the public sink time is set and the kill value is split among its damagers.
- Given the codebase after the story, when searched, then no drone fleet spawns, no drone hull id, `'fleet'` role, `CONFIG.fleet`, `CONFIG.drones` or `droneTierLevels` remains, and `npm run check` exits 0.
- Given a bot-only match, when it runs, then bots with no target sail to and hold inside a paying beacon's circle without ramming it, and the match record carries each participant's beacon XP.

## Spec Change Log

## Review Triage Log

### 2026-11-07 — Review pass (Fable Blind Hunter + Fable Edge Case Hunter + Codex gpt-5.6-sol; both hunters build-on-it, Codex fix-first)
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 3, low 4)
- defer: 3: (high 0, medium 1, low 2)
- reject: 6
- addressed_findings:
  - `[medium]` `[patch]` Codex: server body built on float64 placement vs float32 schema x/y — placement is now `Math.fround`-exact (both hunters had traced it to ~0.0005 u; patched anyway so the predicted body equals the server body by construction)
  - `[medium]` `[patch]` Edge Case Hunter: a standoff that lands inland stalls a bot circling its shore anchor at full ahead — standoff snapped to water, route end at the anchor counts as on station
  - `[medium]` `[patch]` Edge Case Hunter: a standoff fixed on the far side after a chase routes a bot through the solid body — re-fixed when the bearing from the beacon has swung more than 90°
  - `[low]` `[patch]` both hunters: three copies of the wire slot count — one shared `BEACON_WIRE_SLOTS`, load-time guard, clamp warning
  - `[low]` `[patch]` Blind Hunter: a beacon smoked while sinking, a hull does not — puffs only while afloat (R11 "like a ship"; flagged to Eric to flip)
  - `[low]` `[patch]` Blind Hunter: `WIDEST_BEAM = 35` literal decoupled the nav grid from the hull table — derived with the 35 floor, maps byte-identical
  - `[low]` `[patch]` Blind Hunter: README advertised the PvE fleet; dead `drones.js` eslint entry; stale `.hp -=` comment — rewritten
  - deferred (ledger): bot eligibility judged by the beacon centre not the farming point (Codex); bots have no beacon-body avoidance in combat (Blind Hunter); every pick collapses to the centre on a degenerate `--tune` ring (Edge Case Hunter)
  - rejected: a one-tick jolt for a hull parked on a charted marker at surfacing (same on both sides); carried remainder forfeited at `gone` (ruled n = 0 reset); killer share unpaid with no killer record (the storm precedent, recorded in amendment 14); 25 ms of rate on the destroying tick (midpoint rule pins the exact integral); grind-key collision with a land scrape (victim-private batching only); `damageBeacon` answers true in a weapons-safe room (the hull path's rule)
  - not a code finding, open for Eric: How-to-Play still says "Players are worth more, drones are worth less" (his pen); the beacon placement is a soft position oracle by the ruled rule (amendment 14(p)); `CLAUDE.md`'s schema sentence is stale (reported, not edited)

## Design Notes

- **Why not a ShipRecord.** `isParticipant` is `role !== 'fleet'`, and a ship is a contact, paint, wake, storm victim and `sunk` row by default — a new role fails open at ~30 guards. A separate store fails closed: a missed site means "the beacon did not take that damage", which a per-weapon test catches.
- **Schema.** `beaconCycle: int8` (-1 none), `beaconCount: uint8`, `bcnNX/bcnNY: float32`, `bcnNSinkT: float64` (0 = natural schedule), N = 0..7 → 26 fields, 42 of 63. Cleared = cycle -1 / count 0; stale slots are gated by count. The explicit cycle stops a client pairing old positions with a new cycle's clock.
- **Payout.** Per beacon: `pot += rateMsPerMs × dt`; `share = floor(pot / n)`; each of n hulls gets `share` via `addXpMs`; `pot -= share × n`.
- **Known tell, inherent to the ruled split (report to Eric):** a receiver whose own rate halves learns another hull is within 500 u, even in fog.
- **Known tell 2, inherent to the ruled placement (report to Eric):** at 4:00 / 8:00 the beacon set marks the emptiest water in the ring (max-min from every afloat hull).
- **Look is PROVISIONAL** (amendment 14(q)): Eric has not ruled on the rendered candidate; glyph A, body 8 u, body under fog shipped as dials.
- **Waves (orchestrator):** W1 shared additive (Opus) → W2a server beacons (Fable) ∥ W2b client beacons (Opus) → W3 bots + harness (Opus) → W4 drone retirement: server core (Fable), fixtures/bots (Opus), harness/smokes/client (Sonnet), shared deletions last → review gate (Fable hunters + Codex `gpt-5.6-sol`).

## Verification

**Commands:**
- `npm test -w shared && npm run build -w shared` -- expected: green after W1
- `npm test -w server` / `npm test -w client` -- expected: green after each wave that touches them
- `npm run lint` -- expected: clean (complexity ≤ 10)
- `npm run check` -- expected: EXIT 0 before the PR
- `matchSmoke`, `weaponsSmoke` against a booted worktree server (`HC_DEV_OPTIONS=1`, own PID and its tsx child killed after) -- expected: OK

**Manual checks (if no CLI):**
- Eric's yes on the rendered beacon candidate (artifact page built from the real shared functions and the real render module).
- Staging pass: radar noise without drones is OBSERVED and recorded, not solved.

## Auto Run Result

**Status:** done (review gate passed; PR to `development` open; Eric's visual ruling and the How-to-Play sentence follow as one commit).

**Summary:** Radio beacons built on all three sides and the drone fleet retired. 8 / 4 / 2 beacons per ring cycle (none at sudden death) placed at 0:00 by the fleet-anchor rule on a private seed stream with the whole 500 u circle inside the live ring; on every chart at once through 26 flat schema fields; surface at 1:00, float a minute at 3 levels/min split evenly among afloat hulls in range (integer-ms carry), sink over a minute with the rate falling to zero; solid and shootable (1000 HP, ARMOR 100) by every weapon, the phosphor burn and the ramming law through the one `damageBeacon` door and the same armor gate as a hull; destroyed = sinks early (public) and pays 2 levels through the kill-pot split; smoke and fire via the existing anonymous `sm` puff while afloat; bots farm from a standoff point; harness and match record carry beacon XP. PV 99 → 100, 0.19.10 → 0.19.11, cycle 217.

**Files changed (headline):** `shared/src/sim/beacons.ts` (new, the one lifecycle), `CONFIG.beacons` + `CONFIG.bots.beaconStandoffFrac`, `TargetKind 'beacon'` on every weapon mask (`HITS_TRIP` for mines); `server/src/game/beacons.ts` (new BeaconField), `world.ts` (glue, `damageBeacon`, `tickBeacons` / `placeBeacons`, ramming branch, burn pass), `ArenaState.ts` + `ArenaRoom.syncBeacons`, `roomOptions.matchOverride.beacons`; `server/src/game/ai/beacons.ts` (new) + port widening; `match.ts` / `matchRecord.ts` `beaconXpMs`; batch-sim beacon readouts; `client/src/sim/beaconView.ts`, `client/src/render/beacons.ts` (new), predicted contact bodies, two stage layers; DELETED `server/src/game/drones.ts`, `client/src/render/aggro.ts`, `CONFIG.fleet` / `CONFIG.drones` / `droneTierLevels`, the drone hull ids, the `'fleet'` role, `fleetWaves`, `pveKills`, `vcls` / `kcls` / `aggro`, drone rendering; README, eslint hygiene.

**Review:** 7 patched, 3 deferred, 6 rejected (triage log above); no confirmed defect in the sim, the wire or the chokepoint.

**Verification:** `npm run check` EXIT 0 after every wave and after the patches (final: shared 1436, server 2708, client 4109, hook 266; lint 0 errors, 3 pre-existing warnings); golden frames unchanged by the beacons (re-recorded once for the dropped `vcls` only); matchSmoke, weaponsSmoke and openingSmoke OK on agent-booted servers after the server and shared cuts; a 2-match bot probe showed every class farming with no beacon contact on approach.

**Residual risks:** Eric's look ruling is open (glyph, body size, fog) and the How-to-Play sentence is stale until he writes it; the receiver's rate-halving tell and the placement oracle are inherent to the ruled design; wakes shrink with the hull set (watch on staging); radar noise without drones is to be OBSERVED on the staging pass and recorded (amendment 6(g)); `CLAUDE.md`'s schema sentence is stale (frozen file — reported).
