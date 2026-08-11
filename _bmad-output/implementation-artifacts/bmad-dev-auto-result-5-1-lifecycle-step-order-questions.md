---
status: blocked
---

# BMad Dev Auto Result — Story 5.1 Lifecycle State Machine & STEP_ORDER Registry: QUESTION GATE

Status: blocked (pre-implementation question gate; Eric rulings required before a spec exists)
Blocking condition: seven rulings — whether `sinking` is reachable in 5.1, whether `ShipRecord.alive`
is replaced outright, the legal transition table (AR9 is incomplete against the shipped code), whether
the win predicate's behavior is frozen, how far STEP_ORDER extends, how the implicit ordering
couplings are protected once order is data, and whether the wire moves.

## Intent (invocation, 2026-08-11)

> `/bmad-dev-auto 5-1. surface questions prior to implementation. use /orchestrate to choose a model
> for subagents based on task complexity.`

Latest main pulled (`8544af7`, the Epic 4 retro merge — already up to date). No code, CONFIG, wire, or
test change has been made. Everything below is investigation.

---

## What 5.1 actually is

The least glamorous story in Epic 5 and the load-bearing one. Three jobs, all pure refactor:

1. **`shared/src/sim/lifecycle.ts`** — ship life/death becomes the discriminated union
   `alive | sinking(since) | sunk(at)`, transitions validated in one place (AR9).
2. **`world.step()` iterates a named `STEP_ORDER` array** — steps become data, so inserting one is a
   one-line reviewable edit (AR8).
3. **The win predicate in `match.ts` collapses to one predicate over lifecycle states.**

The AC closes with *"all existing sim behavior is unchanged (pure refactor; tests green)."*

`deferred-work.md:848` already flags this: the refactor is **bigger than when it was written** —
`world.step()` gained wake rasterization, radar-shadow-gated blips and the per-segment wake gate during
Epic 4, so "pure refactor, tests green" is a much larger claim against **3836 tests** than against the
2614 it was written for.

## What I found in the code

**There is exactly one lifecycle field today: `ShipRecord.alive: boolean`** (`world.ts:416`), sitting
beside `hp`, `respawnAt` (`:532`, "0 = not pending") and `deaths`. No lifecycle type exists in `shared/`.

| | Count |
|---|---|
| `.alive` sites in `server/` + `shared/`, non-test | **44** (29 of them in `world.ts` alone) |
| `.alive` sites in `client/`, non-test | **31** (18 in `main.ts`; all read the wire boolean) |
| Test files touching `.alive` | **22** |
| Writers of `alive` | **4** — `addShip:981`, `redeployShip:1102`, `sinkShip:1161`, `respawn:3010` |
| Statements in `world.step()` | **~20** (`world.ts:1552-1648`) |

Three paths sink a hull, all routing through `sinkShip`: `applyStorm:1867` (no killer),
`hitShip:2195`, `burnShip:2479` (the incendiary DoT).

---

## The rulings I need

### Q1 — Is `sinking` reachable in 5.1, or declared-only?

The AC says the state machine lands here but the sinking window is Story 5.2, and it also says
*"`sinking -> alive` a reserved legal transition (future heal — **never dead code**, covered by a
transition test)."*

- **(a) Declared-only** — the union and its validated transitions land; the sim keeps `alive → sunk`
  instantaneous; `sinking` is entered only by the transition tests. **← recommended**
- **(b) Reachable for one tick** — sinking is entered and exited within the same tick so the live path
  exercises it from day one.

**Recommend (a).** It is what "pure refactor, tests green" requires, and the AC's "never dead code"
clause is satisfied by the transition test it names in the same breath. (b) risks the one thing that
must not break: `sinkShip`'s idempotency guard (`world.ts:1153`) is the *sole* lock preventing a
duplicate `sunk` event, and splitting one transition into two is exactly how you emit it twice (double
kill credit, double bounty recompute, double `recordSink`) or zero times.

---

### Q2 — Does `ShipRecord.alive` get replaced outright, or shadowed by a compatibility boolean?

- **(a) Replace outright** — `ShipRecord.lifecycle` is the only representation; all 44 server/shared
  reads become `isAfloat(ship)`. **← recommended**
- **(b) Keep `alive` as a derived getter** over `lifecycle`, so the 44 call sites don't move.

**Recommend (a).** (b) is a smaller diff but leaves two representations of one truth, which is the
exact desync class `effectiveStats()` exists to prevent — and the compatibility boolean would never be
deleted. The cost is honest: (a) is the largest part of this cycle's diff, and it's why `deferred-work`
flagged the story's size.

Either way the **client's 31 sites do not move** — they read a boolean off the wire (see Q7).

---

### Q3 — What is the legal transition table? *(AR9 is incomplete against the shipped code)*

AR9 names only `sinking → alive` as the reserved edge. **The shipped game already performs
`sunk → alive`,** and AR9 doesn't mention it:

- `Match.applyPolicy()` (`match.ts:375`) sets `respawnEnabled` for `waiting | gathering | countdown` —
  so in the **ready room, death is not terminal**: `sinkShip` arms `respawnAt = now + 3000ms`
  (`world.ts:1176`) and `processRespawns` (`:2990`) brings the hull back.
- `redeployShip` (`:1081`) is a third, unconditional `any → alive` reset at the countdown→active
  boundary, and `addShip` (`:981`) creates straight into `alive`.

So a transition table admitting only `sinking → alive` **throws on the ready-room respawn path.**

- **(a) Three named edges** — `sink` (alive→sinking→sunk), `heal` (sinking→alive, reserved for 5.2+),
  `redeploy` (any→alive: creation, ready-room respawn, match-boundary reset). **← recommended**
- **(b) One generic edge** — anything may return to `alive`.

**Recommend (a).** It keeps the reserved heal edge *meaningful* — under (b) "sinking → alive is
reserved for a future heal" stops being a statement about anything, because everything can go back.

Related, and **not** a question — I'll keep `respawnAt` as its own field rather than folding the
deadline into `sunk(at)`. Folding it changes the respawn path, which a pure refactor may not do.

---

### Q4 — Confirm the win predicate's *behavior* is frozen in 5.1.

Today (`match.ts:404`): more than one alive human → no win; exactly one alive human but any alive drone
→ no win; else finish. Drones still gate the win.

Two things could accidentally ride along here and **neither belongs to 5.1**:

- **Story 6-3** (participants-only win check) — deliberately deferred; amendment 31 records *why*:
  dropping the `aliveDroneCount()` guard outright makes a solo match finish the instant it activates.
- **D4's sinking-era semantics** (sinking stays win-eligible; last sinker wins; same-tick mutual
  destruction = draw) — those belong to Story 5.2, which is where D4 is scoped.

**Recommend: freeze it.** The predicate becomes one predicate over lifecycle states (`isAfloat`), and
the human/drone gating stays byte-identical. Confirming this explicitly because it is the single
easiest place to ship 6-3 by accident.

---

### Q5 — How far does STEP_ORDER extend?

`world.step()` is ~20 statements, and they are not all the same kind of thing.

- **(a) Sim steps only** — the ~16 real steps become named rows; `tick++`/`now +=`, the
  `const hulls = aliveHulls()` snapshot (`:1574`) and the end-of-tick event swap (`:1640`) stay fixed
  prologue/epilogue. **← recommended**
- **(b) Everything becomes a row**, bookkeeping included.

**Recommend (a).** The `hulls` snapshot and the event swap are frame *boundaries*, not insertable
positions. Making them rows advertises a slot between the snapshot and its consumers — and that
snapshot is **deliberately stale**: a hull sunk by `stepShells` is still in the array for `creepMines`,
`stepMines` and `applyZoneEffects`, each of which re-checks `.alive` per victim (`:2148, :2274, :2318,
:2357`). Damage semantics live in those re-checks. A step inserted there would inherit a trap with no
sign on it.

---

### Q6 — Once order is data, how do we protect the couplings that are currently implicit in position?

This is the real risk in AR8, and it's the mirror image of its benefit. At least four steps are correct
*only because of where they sit*, and the code says so in its own comments:

- **`tickRepairs` is last among hp movers** (`:1585-1598`): *"the alive gate reads POST-DAMAGE truth …
  damage wins the tie by construction, **with no explicit tie-break code**."* Move it earlier and
  regen can un-sink a hull at 0 hp.
- **`sampleWakes` after `resolveCollisions`** (`:1563`) — a wake must record the resolved pose, never a
  candidate pose inside land.
- **`processRespawns` before `tickXp`** (`:1630`) — so a hull revived this tick accrues this tick.
- **`creepMines` before `stepMines`** (`:1576`) — a mine that crawls into range this tick trips this tick.

Under AR8 each of those becomes a one-line reorder.

- **(a) Comments only** — carry the existing rationale onto the rows.
- **(b) Declared `after:`/`before:` constraints** on each row, validated when the array is built.
- **(c) An order-identity test** pinning the exact STEP_ORDER array, so any reorder must be deliberate —
  plus the comments. **← recommended**

**Recommend (c).** It's the `shipClasses` identity-test pattern already in the codebase, it costs one
test, and it turns "someone reordered the tick" from a silent behavior change into a failing assertion.
(b) means building a dependency-graph engine for a 16-element array — more machinery than the problem.

---

### Q7 — Does the wire move? Does PV bump?

- **Recommend: no, and no.** `OwnShip.alive` stays a boolean projected at `frames.ts:37`; roster
  `PlayerMeta.alive` stays a boolean synced by `syncRoster()`. **PROTOCOL_VERSION stays 33.** Story 5.2
  owns the wire change, because that's when `sinking` first becomes something a client can observe.

Recording the consequence now so 5.2 doesn't discover it: **`frames.ts:102 spectates()` grants the
unfogged spectator view on `!ship.alive`.** When `sinking` becomes reachable, it must project as
*not-afloat but not-spectating*, or a sinking hull gets full-map vision for five seconds — an anti-cheat
widening the perception invariant explicitly asserts against. It cannot bite in 5.1 (sinking is
unreachable under Q1a), but the projection has to be chosen with eyes open.

---

## What I am NOT asking about (decided by existing rulings, flagged for visibility)

- **Roster `alive` projection for `sinking`** — belongs to 5.2; unreachable here.
- **Sinking + wake** (`deferred-work.md:848b`) — amendment 205's wake-outlives-its-ship rule means a
  hull decelerating over ~5s keeps laying wake past `sunk`. That's a 5.2 spec line, not 5.1.
- **Story 5.4's radar re-derivation** (the epic-4 retro's significant-discovery alert) — unrelated to
  5.1; mitigation is story ordering, not delay.

## Verification plan once ruled

`npm run check` (lint + type-check + 3836 tests) is the gate. The strongest regression evidence for a
step-order refactor specifically is `server/src/__tests__/goldenFrames.test.ts` — a byte-identity
snapshot of frames across all 11 event kinds, which fails on any change to event emission order or
shape. Plus the headless smokes over real sockets (`matchSmoke`, `dronesSmoke`, `combatSmoke`).

## Files that would change (estimate, pending rulings)

`shared/src/sim/lifecycle.ts` (new) · `shared/src/index.ts` (barrel) · `server/src/game/world.ts` (the
bulk: 29 sites + the STEP_ORDER extraction) · `server/src/game/match.ts` (4) ·
`server/src/game/{frames,signals,bounty,drones}.ts` (7) · `server/src/game/equipment/{torpedoes,mines}.ts`
(2) · `server/src/rooms/ArenaRoom.ts` (2) · ~22 test files · `VERSION` + `package.json` + both trackers.

**No client change, no CONFIG change, no wire change** under the recommended answers.
