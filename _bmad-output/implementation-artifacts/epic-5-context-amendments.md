# Epic 5 Context — Ratified Amendments (durable — survives recompiles)

This file is append/deliberate-edit only. No tooling step may regenerate, prune, or rewrite it.
On any conflict between an amendment here and planning-artifact-derived content in
`epic-5-context.md`, **the amendment wins**.

---

## Amendment 1 — `sinking` is DECLARED-ONLY in Story 5.1 (Eric ruling 2026-08-11)

Story 5.1 lands the `alive | sinking(since) | sunk(at)` union and its validated transitions, but the
simulation keeps `alive → sunk` **instantaneous**. `sinking` is entered only by the transition tests
until Story 5.2 builds the sinking window.

**Why it is not dead code:** the AC's own clause names the mechanism — *"`sinking -> alive` a reserved
legal transition (future heal — never dead code, **covered by a transition test**)"*. The transition
test is the coverage the AC asks for.

**Why not make it reachable for one tick:** `sinkShip`'s guard (`world.ts:1153`,
`if (!ship || !ship.alive) return;`) is the **sole** idempotency lock preventing a duplicate `sunk`
event. Splitting one transition into two is precisely how that event gets emitted twice (double kill
credit, double bounty recompute, double `recordSink` on the client) or not at all. Exactly one `sunk`
emission at exactly one transition.

## Amendment 2 — `ShipRecord.alive` is REPLACED, not shadowed (Eric ruling 2026-08-11)

`ShipRecord.lifecycle` becomes the only representation of life/death. All 44 non-test `.alive` sites in
`server/` + `shared/` (29 of them in `world.ts`) move to a lifecycle predicate. **No compatibility
boolean getter.**

Rationale: a derived `alive` shadow is two representations of one truth — the exact desync class
`effectiveStats()` exists to prevent — and a compatibility accessor added "temporarily" is never
deleted. The cost is accepted and named: this is the largest part of the cycle's diff, and it is why
`deferred-work.md:848(a)` flagged the story as bigger than when it was written (`world.step()` gained
wake rasterization, radar-shadow-gated blips and the per-segment wake gate during Epic 4, so
"pure refactor, tests green" is a claim against **3836** tests, not the 2614 it was written for).

The client's 31 `.alive` sites do **not** move — they read a wire boolean (amendment 7).

## Amendment 3 — The transition table, and the correction of record on AR9 (Eric ruling 2026-08-11)

**AR9 names only `sinking → alive` as a legal return edge. That list is incomplete against the shipped
code, and anyone building the table from AR9 alone will throw.** Three `→ alive` edges exist today:

1. **creation** — `addShip` (`world.ts:981`) constructs straight into `alive`.
2. **match-start redeploy** — `redeployShip` (`:1102`) unconditionally resets every hull at the
   countdown→active boundary. **Production-reachable on every single match.**
3. **respawn** — `sinkShip` arms `respawnAt` (`:1176`) and `processRespawns` (`:2990`) revives.

**Eric's challenge on edge 3 was correct, and the resolution is a distinction worth keeping:**
*"you can't even damage someone to the point of sinking them in the ready room, isn't this moot?"*
In live play, yes. `damageEnabled = phase === 'active'` and
`respawnEnabled = waiting | gathering | countdown` (`match.ts:374-375`) are **mutually exclusive by
construction**, and all three sink paths are damage-gated — storm (`world.ts:1861`), gunfire
(`:2191`), incendiary DoT (`:2447`, *"ready-room flares never burn OR dazzle"*). **No hull can reach
0 hp outside the active phase in a real match, so `sunk → alive` never fires in production.**

**It is nonetheless not dead code.** `World` defaults BOTH flags to `true` (`:638-640`) so that a
standalone World behaves like a live match — and standalone Worlds are what the unit tests use.
`world.test.ts:195` (*"sinkShip kills, schedules respawn, and step revives after the delay"*) and
`:224` (*"emits sunk then spawn events across the sink/respawn transition"*) drive the edge directly;
10+ server test files reference respawn. A table rejecting `sunk → alive` fails those tests.

**Ratified table — two distinct named return edges, not one generic one:**

- `heal`: `sinking → alive` — RESERVED, unreachable until Story 5.2+.
- `redeploy`: `any → alive` — creation, match-start reset, respawn.

Keeping them separate is what preserves meaning: under a single generic "anything may return to
`alive`" edge, the statement *"`sinking → alive` is reserved for a future heal"* stops describing
anything.

`respawnAt` stays its own field rather than folding the deadline into `sunk(at)` — folding it would
change the respawn path, which a pure refactor may not do.

## Amendment 4 — DRONES STOP GATING THE WIN (Eric ruling 2026-08-11) — partially supersedes epic-4 amendment 31

> *"Drones should stop gating the win, the game cant even fucking start without two or more live
> players right now."*

The premise is verified: `CONFIG.match.minHumans` is **2**, so a match can never go live with a single
human. `Match.checkWin()`'s `aliveDroneCount() > 0` guard is dropped; the win check counts **captains
only**. A lone surviving captain wins immediately regardless of how many drones are still afloat.

**This partially supersedes the epic-4 amendment 31 defer**, which sent the change to Story 6-3 on the
grounds that *"dropping the `aliveDroneCount()` guard outright makes a solo match finish the instant it
activates."* That hazard is real but is **confined to configurations that override `minHumans` to 1**,
which production cannot do (`sanitizeRoomOptions` gates the override behind `HC_DEV_OPTIONS`).

**Accepted cost, folded into this cycle rather than split** (plans are one unit of work): three dev
harnesses run solo-human-plus-drones and each finishes at activation under the new rule, so each is
rewritten here —

- `server/scripts/dronesSmoke.mjs` (`minHumans: 1`; asserts the match stays active after drone fill),
- `server/src/__tests__/drones.test.ts` (`SOLO_TIMINGS`, `minHumans: 1`),
- `server/scripts/metricsSmoke.mjs`, whose finish sequencing is built on *"A leaves → 1 human + drones
  remain → no finish"*.

**Left open and recorded, not solved here:** Story 6-5 (Solo vs AI) owes a termination rule for a
human-versus-drones match, since drones can never win and the human can now never lose to them by
attrition. Story 6-3 retains the rest of its scope (formal multi-mode participants-only coverage).

`ShipRecord.kills` continues to count drones for the roster/results tally, and `captainKills` continues
to drive the bounty throne alone — Story 4.6's split is untouched.

## Amendment 5 — STEP_ORDER covers SIM STEPS ONLY (Eric ruling 2026-08-11: *"whatever makes the most sense architecturally"*)

The named `STEP_ORDER` array holds the real simulation steps. Three statements in `world.step()` stay
**fixed prologue/epilogue outside the array**: the clock advance (`tick += 1`, `now += dtMs`), the
single `const hulls = aliveHulls()` snapshot (`world.ts:1574`), and the end-of-tick event/denial/
muzzle-dedupe swap (`:1640-1647`).

Rationale: those are frame **boundaries**, not insertable positions — and the hull snapshot is
**deliberately stale**. A hull sunk by `stepShells` remains in that array for `creepMines`, `stepMines`
and `applyZoneEffects`, each of which re-checks liveness per victim (`:2148, :2274, :2318, :2357`);
damage semantics live in those re-checks, not in the snapshot. Making the snapshot a row advertises a
slot immediately after it, and any step inserted there silently inherits that trap.

## Amendment 6 — An ORDER-IDENTITY TEST pins the tick order (Eric ruling 2026-08-11)

AR8's benefit and its hazard are the same property: once the order is data, a one-line edit reorders
the tick. At least four steps are correct **only because of where they sit**, and the code says so
itself — most sharply `tickRepairs` (`world.ts:1585-1598`): *"the alive gate reads POST-DAMAGE truth …
damage wins the tie by construction, **with no explicit tie-break code**."* Move it earlier and regen
un-sinks a hull at 0 hp. The others: `sampleWakes` after `resolveCollisions` (`:1563`),
`processRespawns` before `tickXp` (`:1630`), `creepMines` before `stepMines` (`:1576`).

A test pins the exact `STEP_ORDER` array so any reorder is a deliberate, reviewed edit rather than a
silent behavior change — the `shipClasses` identity-test pattern already in the codebase. The existing
rationale comments move onto their rows. A declared `before:`/`after:` constraint engine was
considered and **rejected** as more machinery than a 16-element array warrants.

## Amendment 7 — NO WIRE CHANGE; PROTOCOL_VERSION STAYS 33 (Eric ruling 2026-08-11)

`OwnShip.alive` remains a boolean projected at `frames.ts:37`; `PlayerMeta.alive` remains a boolean
mirrored by `syncRoster()`. Story 5.2 owns the wire change, because that is when `sinking` first
becomes something a client can observe.

**Recorded now so Story 5.2 does not discover it at its review gate:** `frames.ts:102 spectates()`
grants the **unfogged** spectator view on `!ship.alive`. When `sinking` becomes reachable it must
project as *not-afloat but not-spectating*, or a sinking hull receives full-map vision for the whole
five-second window — an anti-cheat widening the master perception invariant explicitly asserts
against. It cannot bite in 5.1 (amendment 1 makes `sinking` unreachable), but the projection must be
chosen deliberately rather than inherited.
