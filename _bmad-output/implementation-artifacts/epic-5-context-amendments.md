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

## Amendment 8 — Never-sunk hulls place ABOVE the sunk, BELOW the winner (orchestrator ruling 2026-08-11 — **Eric has veto, this was not his call**)

Amendment 4 made a new state reachable: a match can now finish with hulls still afloat. Nothing had
ever produced that before, because drones gated the win until every one of them sank.

**The defect it exposed:** `computePlacements()` only placed the winner and the `sinkOrder`, and
`resultsMsg()` defaulted everyone else to `placement: 0`. Rows sort placement-ASCENDING, and
`client/src/ui/results.ts` renders the number verbatim — so every surviving drone sorted **above the
winner**. A real match observed **18 of 20 rows at placement 0, ahead of the winner.**

**Ruled:** placement is three tiers — (1) the winner, (2) every other still-afloat hull, in activation
roster order, (3) the sunk in reverse sink order (the existing rule, untouched). `placement: 0` is now
unreachable for any participant, and the defensive fallback in `resultsMsg()` sorts LAST rather than
first, so this defect's shape cannot recur even if the invariant is broken later.

**Why this reading and not another:** it is the least-inventive extension of the shipped rule
(*"Winner = 1; everyone else by reverse sink order (later sink places higher)"*) — a hull that never
sank outlasted every hull that did — and it restores the property that held before amendment 4, when
every drone was necessarily in the sink order. Two alternatives were available and NOT taken: placing
survivors last (which would rank a hull that survived below one that sank), and dropping surviving
drones from the results rows entirely (which would change which hulls appear at all).

**This is a presentation ruling made by the orchestrator, not by Eric.** It was taken rather than
asked because a "0" row sorting above the winner is indefensible under every reading, so the choice
was between three defensible orderings and one broken one. The ordering above is Eric's to overrule.

Story 5-3 (Omniscient Reveal & Results) owns this screen and inherits one related open item: the
client's PROVISIONAL placement counts human rivals only, so an eliminated captain's number still snaps
when the real results land — pre-existing, but wider now (see `deferred-work.md`).

## Amendment 9 — DRONES ARE NOT RANKED AND DO NOT APPEAR IN THE RESULTS (Eric ruling 2026-08-11) — SUPERSEDES amendment 8

> *"just don't show the drones in the match results. problem solved."*
> *"ffs just stop counting drones. they exist to test features. they are disposable and should not be ranked."*

Amendment 8 (the orchestrator's survivors-placement tier) is **superseded and its code deleted**. It
solved the wrong problem: it found a defensible ORDER for drones in the results table when drones
should not have been in the table at all.

**Ruled:** `ResultsMsg.rows` contains **captains only**, and placements are **captain-relative** —
winner is 1, then the remaining captains by reverse sink order (later sink places higher), which is
the ORIGINAL shipped rule restricted to captains. Both filters are load-bearing: the row filter
removes the rows, and the placement filter is what stops a 2-captain match rendering "1st" and "20th".

**This is a RECONCILIATION, not a new asymmetry.** The project already described *"humans-only
placement/results"* as the intended counterpart to the AFLOAT count, and the Public Register
(epic-4 amendments 29-34) already ruled *"drones are NOT combatants"*. The shipped code simply never
matched either statement. It does now.

**Amendment 8's survivors tier is deleted rather than kept as defensive code, because it is
unreachable once drones are excluded**: `checkWin()` only finishes when at most one captain is afloat,
and that captain IS the winner, so no non-winner captain can be afloat at finish — and every
non-afloat captain is in `sinkOrder`, since `sinkShip` is the sole `alive → sunk` edge and always
pushes its event, `consumeSinks()` runs before `checkWin()` in the same `update()`, `onPlayerLeave`
records the leave-as-sink before its own check, and `activate()` redeploys every hull to `alive`.
`resultsMsg()`'s defensive fallback is KEPT but is now unreachable — it sorts LAST rather than 0, so
the amendment-8 defect's shape (a row above the winner) cannot recur.

**What did NOT move:** telemetry still counts every hull (`rosterSize`, `rosterByClass`,
`killsByClass`, `stormDeaths` are the operator's data, not presentation, and are now pinned by a
test); `ShipRecord.kills` still counts drone kills for the roster/results KILLS column, and
`captainKills` still drives the bounty throne alone (Story 4.6's split, untouched); the roster schema
is untouched, and a drone's `PlayerMeta.placement` simply stays 0, which has no client consumer —
re-verified that the only client roster reads anywhere are `id`, `alive` and `color`.

**A pre-existing defect closes for free.** The client's PROVISIONAL placement (`score.ts`) has always
counted human rivals only, so it disagreed with a drone-inclusive final placement — in the
2-captain/18-drone shape the loser read #2 provisionally and #20 finally. Captain-relative placement
makes the two agree by construction, with no client change. The `deferred-work.md` entry filed for it
this cycle is closed on arrival.

## Amendment 10 — THE SINKING-ACTIVATION POLICY: everything in a slot, plus the foghorn; the REFIT is what's blocked (Eric ruling 2026-08-12) — closes the AR7 TBD

> *"Weapons and equipment only. And foghorn. Speedboost and torpedo boat are about to get major
> changes, for right now it is in a ship equipment slot so it meets criteria for usability. However
> opening the upgrade menu and choosing upgrades (or the heal) is blocked entirely (once sinking,
> you're done)."*

The TBD that `world.ts:2860-2875` has carried since Epic 1 closes as **NO RESTRICTION AT THE GATE**.
All seven registry rows (`gun, torpedo, mine, cannon, starShells, speedBoost, decoyBuoy`) may
activate while sinking, and the foghorn (`hornControl`) stays live with them. **The stated criterion
is fitment, not category:** *"it is in a ship equipment slot so it meets criteria for usability"* —
so speedBoost and decoyBuoy are in on the same grounds as the guns, and a future row is in by
default rather than needing a ruling.

**The policy is real, it just lands somewhere else than the gate.** What a sinking captain loses is
the **economy**: the upgrade menu, the upgrade picks, and the `HEAL_CHOICE` spend are blocked
entirely. That is a separate code path (`world.ts:1423`/`:1560`, `ui/upgradeMenu.ts`) which never
routed through `sinkingActivationGate` at all, so anyone implementing this off the gate's docstring
alone will implement nothing. *"Once sinking, you're done"* is the governing sentence: you keep every
weapon you brought, and you may not go shopping on the way down.

**Consequence worth naming:** `speedBoost` on a hull whose defining behaviour is decelerating to a
stop was put to Eric as a mechanical contradiction and he took it anyway, on the fitment criterion.
So the sinking decel and a live boost must COMPOSE rather than one winning — the decel is a cap the
boost pushes against, not a state that refuses it. Torpedo Boat and speedBoost are both flagged for
major changes, so this is deliberately the low-commitment answer.

## Amendment 11 — THE KILL LANDS IMMEDIATELY; the window is the KILLEE's beat, not the killer's wait (Eric ruling 2026-08-12)

> *"Immediately. Killer is granted kill immediately, killee gets a 'GOING DOWN WITH THE SHIP!'
> notification and gets 5 seconds of sinking."*

Everything `sinkShip` does today at one instant — kill credit, XP, bounty recompute, `deaths++`, the
public `sunk` event and its kill-feed line, the roster `alive` flip and therefore the AFLOAT count —
**keeps firing at sink-entry, unmoved.** The question gate offered deferring them to founder and it
was rejected. The five seconds belong to the dying captain alone.

**This is the ruling that makes the cycle small.** With no bookkeeping moving, `sinkShip`'s single
`sunk` emission stays exactly where it is and amendment 1's idempotency property is preserved by
construction rather than by careful re-engineering.

**Accepted consequence, named:** for five seconds the AFLOAT count and the kill feed disagree with
what is visibly on the water — the register says a hull is gone while it is still moving and still
shooting. That is the intended reading (*the kill is real the moment it lands*), not a defect.

**New client surface:** a `GOING DOWN WITH THE SHIP!` notification to the dying captain, on the
existing `showBanner` slot.

## Amendment 12 — A SINKING HULL CANNOT BE FINISHED OFF (Eric ruling 2026-08-12)

> *"No, it can't be finished off early."*

The window always runs its full length. Damage landing on a sinking hull is a **no-op**: no hp, no
re-sink, no shortening. The revenge shot is guaranteed, and the counterplay to a sinking enemy is to
leave, not to shoot.

This is also load-bearing for correctness, not only feel: `hitShip` must early-return on a sinking
victim, or the second hit attempts an illegal `sink`-from-`sinking` edge and
`transitionLifecycle()` **throws** (`lifecycle.ts:205`).

## Amendment 13 — THE WINDOW IS A FLAT 5000 ms (Eric ruling 2026-08-12)

> *"5s is fine all around."*

One `CONFIG` constant, all three classes. Per-class windows (a Battleship going down slower than a
Torpedo Boat) were offered and declined for now; that stays available as a balance pass after live
play, and it is a table-for-a-constant swap when it comes.

Note the interaction this fixes in place: mine `armDelay` is 3000 ms against a 5000 ms window, so a
mine laid in the first two seconds arms before its layer founders and one laid later arms after.

## Amendment 14 — SINKING DOES NOT AFFECT THE OUTCOME, AND A SAME-TICK WIPE IS A DRAW (Eric ruling 2026-08-12) — amends D4

> *"The only way a draw could happen is if all remaining players die at the same time, and if that
> happens, a draw is acceptable. Otherwise, sinking windows do not affect the game outcome."*

**D4 is amended.** The epic's ratified D4 read *"sinking ships stay win-eligible until fully sunk;
if all remaining participants are sinking, the later sinker wins."* Under this ruling a sinking ship
is **not** win-eligible: the outcome is decided at **sink-entry**, exactly as it is today, and the
window changes nothing about who won. D4's "later sinker wins" clause is therefore **dead** — with a
fixed window length, sink-entry order and founder order are the same order, so the clause could never
distinguish anything anyway.

**The draw becomes real and needs building.** Today `Match.finish()` resolves a zero-survivor finish
to `latestSunkHuman()` (`match.ts:375`), so somebody always wins; `winnerId: ''` is a documented but
in-practice-unreachable shape (`types.ts:1052`) and `winnerBanner()` renders it **`WINNER: UNKNOWN`**
(`client/src/ui/results.ts:45-47`) — which is the defect a draw would ship as. A same-tick wipe of
every remaining captain must produce `winnerId: ''` deliberately and read as a **DRAW**.

**One intuition to correct, because it is natural and wrong:** you might expect the window to make
true same-tick destruction rare. It does not. A fixed window is a constant delay, so two hulls that
enter `sinking` on the same tick found on the same tick — exact ties are preserved exactly, not
scattered.

## Amendment 15 — THE DERIVATION FLIPS: `isAfloat` DOES NOT MOVE, and sinking RE-OPENS EXACTLY THREE THINGS (orchestrator ruling 2026-08-12, forced by amendments 11/12/14)

The question gate's pre-answer ruling R1 (*"`isAfloat(sinking) = true` with two named exceptions"*)
is **SUPERSEDED and must not be built.** It was derived from D4 and from "remains fully perceivable",
and amendments 11/12/14 removed its foundation: with the kill landing immediately, damage a no-op,
and the outcome decided at sink-entry, the majority of `isAfloat`'s ~30 call sites now want the
**shipped** answer.

**Ruled:** `isAfloat(lc)` stays byte-identical (`kind === 'alive'`). **Not one of its call sites
moves.** A sinking hull is dead for every bookkeeping purpose — win check, damage, roster/AFLOAT,
XP, repairs, refit, respawn — and the window re-opens exactly three things by explicit
`isSinking()`-aware predicate at named seams:

1. **Motion** — `stepShips` (`world.ts:1841`), `resolveCollisions` (`:1887`), `sampleWakes` (`:1920`).
   A sinking hull still steers (decayed), still pushes out of islands, still lays wake.
2. **Weapons, equipment and horn** — `consumeClick` (`:2733`), `consumePress` (`:2811`),
   `hornControl` (`:2855`), and the `'dead'` refusal inside `sinkingActivationGate` (`:2881`).
3. **Perceivability** — `contactSignal.visible` (`signals.ts:424`) and `blipSignal.visible` (`:575`).
   It is still a contact and still a target.

Plus the two seams Story 5.1 pre-marked: `spectates()` (`frames.ts:112`) becomes `isSunk`-based so a
sinking captain stays **fogged and keeps `you`** (amendment 7 discharged), and `hitShip` early-returns
on a sinking victim (amendment 12).

**Why this is the better architecture and not merely the smaller one:** the flip-`isAfloat` shape
would have re-pointed a 30-site predicate and then subtracted exceptions from it, so every future
call site added anywhere in the sim would silently inherit "sinking counts as alive" — the wrong
default for a hull that is, in every sense the bookkeeping cares about, dead. This shape makes the
re-openings **additive and enumerable**: three seams, each a deliberate edit, each testable. It is
also by far the lower-risk change against the suite, since the shipped meaning of every untouched
call site is preserved by construction.

## Amendment 16 — THE WIRE: `alive` GOES FALSE IMMEDIATELY, and a new self-private `sinking` key keeps the controls live (orchestrator ruling 2026-08-12) — PV 33 → 34

Amendment 11 requires the roster `alive` flip at sink-entry, and amendment 15 keeps
`OwnShip.alive = isAfloat(...)`, so **`alive` goes false the instant the hull starts sinking** — which
is correct for AFLOAT and the register, and catastrophic for the client, whose `!alive` path tears
down the hotbar, the firing arc and the aim preview (`main.ts:2163`, `:2281`) that amendment 10 just
ruled must stay live.

**Ruled:** one **optional, self-private** `OwnShip` key carrying the founder deadline, appended last
and omitted when absent — the `slowedUntil`/`dazzledUntil` precedent (`types.ts:319-326`, spread-
conditional at `frames.ts:92-93`). It rides `you`, never a `Contact` and never a spectator payload,
so it needs **no new perception exception and no oracle case: the master invariant stays at exactly
SIX.** `PROTOCOL_VERSION` 33 → 34.

The client gains a **third state**, not a second: `alive` (full HUD) / `sinking` (hull, helm, hotbar,
firing arc and horn all live; refit inert; the going-down banner) / dead (spectate). The trap to
avoid is `main.ts:548`'s `alive: you?.alive ?? true`, which reads a missing `you` as alive.

**No enemy-facing sinking channel.** A sighted enemy already sees the hull decelerate through
`Contact.speed`, and wounded smoke already covers the wounded case. Nothing new is disclosed about
another player's lifecycle, so the smallest-new-channel house rule holds.

## Amendment 17 — THE MATCH IS NOT HELD OPEN FOR A SINKING HULL (orchestrator ruling 2026-08-12 — **Eric has veto, this was not his call**)

Amendment 14 decides the outcome at sink-entry, so `checkWin()` fires there and the match can
**finish while a hull is still sinking** — in which case the results flow supersedes that hull's
remaining window. The last captain to die in a match therefore gets a **truncated** window, and only
they.

Deferring `finish()` until every sinking hull founders was considered and **rejected**: it would
invent a `finishing` sub-state in the match machine that Story 5-3 (which owns the reveal and results
flow) would then have to work around, it makes the winner wait on the loser, and it collides with
`spectates()` granting every observer the unfogged view at `phase === 'finished'` — a third seam
needing a sinking special-case. Against that, the beat being truncated is replaced by the omniscient
reveal, which is its own climax and a better payoff than five seconds of shooting at a winner whose
victory is already locked.

Recorded as an orchestrator ruling because the question gate signalled the opposite lean before the
architecture was built out. It is Eric's to overrule; doing so costs the `finishing` sub-state above.

## Amendment 18 — IDENTITY AT SINK-ENTRY, LOCATION AT FOUNDER (orchestrator ruling 2026-08-12, forced by a review finding)

Both adversarial review passes caught the same user-visible defect, and it went to the heart of the
story: the client's enemy-side death presentation fired at **sink-entry**, because that is when the
`sunk` event arrives. So a hull that was still turning, boosting and putting a torpedo into you
rendered in the faded `sunkTint` (alpha 0.4 — *"already dead"*) for the whole window, with its
crimson death plume left up to **110 u astern** of where it actually went down (the integral of the
linear decel ramp: 45 u/s × 5 s ÷ 2). The visual grammar said "wreck" during precisely the five
seconds the hull is a guaranteed revenge threat.

**Ruled — split the presentation exactly the way the Public Register already splits DISCLOSURE**
(epic-4 amendments 29-34: *"sinking is public knowledge, its LOCATION is not"*):

- **Identity, at sink-entry, unmoved:** the kill-feed line, the roster/AFLOAT drop, the death cue.
  The kill is real the moment it lands (amendment 11).
- **Location, at founder:** the crimson `sink` plume and the `setDowned` wreck tint — a hull marks
  the water where it actually goes down, not where it was mortally hit.

**The client cannot read an enemy's deadline and must not be given one.** `sinkingUntil` is
self-private by construction (amendment 16), so the enemy path derives founder locally: the `sunk`
event arrives at sink-entry and `CONFIG.ship.sinkingWindowMs` is shared, so the spatial half is
scheduled at `eventTime + window` and its position is **re-resolved at founder** rather than
remembered from entry. The `seen` gate moves with it byte-identical — an unwitnessed sinking still
never draws a plume — and a contact that is gone or aged out by founder draws nothing, exactly as
today. **This adds no wire field and no perception exception.**

**Ledgered, not fixed:** the death GROAN still sounds at sink-entry at the sink-entry position, so
the cue and its plume are now ~5 s and up to 110 u apart. That is defensible — the groan marks the
killing blow, the plume marks the sinking — but it has never been seen on the water. If it reads
badly, **the cue is the thing to move, not the plume.**

## Amendment 19 — THE WINDOW IS DERIVABLE BY COMPOSITION, AND THAT IS ACCEPTED (orchestrator ruling 2026-08-12) — corrects Story 5.2's own AC

Story 5.2's acceptance criterion says *"no field anywhere discloses that it is sinking."* **Read
strictly that is true and read practically it is false, so it is corrected here rather than left to
be rediscovered as a leak.**

No single field discloses the window: `Contact` carries `{id, x, y, heading, speed, cls}` and nothing
else (now pinned by an exact key-set assertion in `spectator.test.ts`), and `sinkingUntil` rides
`you` alone. But `PlayerMeta.alive` is mirrored **unfogged to every client every tick** and now goes
false at sink-entry while the hull is still a live `Contact` — so any client can compose the two
public channels and compute, for any sighted enemy, *"sinking since the roster flip, founders at
flip + 5000."*

**Accepted, with no seventh exception, on the Bounty precedent** (epic-4 amendments 216-221:
publishing what a client *"could already compute anyway"* reconciles the server's answer with
information already free, rather than widening disclosure). Both halves were already public before
this story; only their conjunction is new, and it discloses a five-second timer on a hull the
observer can already see decelerating.

**A second disclosure-by-omission was found and deliberately left alone:** `tickSmoke` stays
`isAfloat`-gated, so a wounded hull's smoke **stops** at sink-entry while it sails on — itself a
clean read on "that hull is in its window." Widening `tickSmoke` would make a **fourth** seam out of
amendment 15's three and would change an enemy-facing channel, which is Eric's call, not the
implementer's. Recorded for his ruling; the information it reveals is in any case already free by
the composition above.

## Amendment 20 — THE MATCH IS HELD OPEN FOR A SINKING CAPTAIN (Eric veto 2026-08-12) — REVERSES amendment 17

> *"I just tested against myself in a 1v1. No sinking window, the game just immediately ends."*

**Amendment 17 is reversed by the owner on first contact with the water, and its reasoning was
wrong.** It was weighed for a twenty-player lobby — *"the last kill is ONE death out of 19, and the
beat it truncates is replaced by the omniscient reveal"* — and that arithmetic is right and
irrelevant. **In a 1v1 every death is the match-ending death**, so the truncation was not an edge
case at all: it was 100% of duels, and 100% of the way the game is actually tested by one person
with two tabs. A feature invisible in the most common way it is exercised is not shipped.

Diagnosed before changing anything, and there was **no second defect** — the window mechanism itself
was sound:

- 3 captains, one sinks → phase stays `active`, hull is `sinking`. Works.
- 2 captains, one sinks → phase is `finished` **one tick** after the sink. The results flow ate the
  window.

**Ruled — LATCH THE OUTCOME, DEFER ONLY THE TRANSITION.** The first `checkWin` to find ≤1 afloat
captain resolves and records the winner **at that instant** (afloat survivor, else the
mutual-destruction resolution, else `''` for the draw) and never re-derives it. The phase then stays
`active` while any **non-drone** hull is `isSinking`, and `finish()` consumes the latch verbatim once
the water is clear.

**This does not touch amendment 14, it is what makes it true.** *"Sinking does not affect the game
outcome"* is now enforced by construction rather than by timing: the sink order can grow during the
hold — a revenge kill, a late-consumed leave — and the result cannot move, because the answer was
computed before the hold began. The winner of record may therefore be a hull that is itself sinking,
or sunk, by the time the results broadcast. **You can take your killer with you; you still cannot
take the win with you.**

**Only captains hold the match open** (drones are not combatants — epic-4 amendments 29-34, epic-5
amendment 4), a sinking captain who disconnects stops holding the instant `removeShip` takes the
hull, and a **safety net** fires the finish at `latch + window + 1000 ms` regardless of lifecycle
state — commented as a net, not a mechanism, because a match that can never finish is catastrophic
and the hold's correctness now depends on a lifecycle edge rather than on a clock.

**The cost amendment 17 was avoiding is real and was paid:** the winner of a duel now watches the
loser go down for five seconds before the results land. That is the beat, not dead time.

**Proven over real sockets, which the shipping cycle did not do:** `matchSmoke` now traces the full
window → founder → results flow (*"B got 5 spec frames; A spec'd only after the finish"*), and
`metricsSmoke` confirms the leave-driven finish is unaffected. The smoke's step-4 frame budget had to
widen, because a loser's spectator frames now legitimately begin five seconds after their sunk event.

## Amendment 21 — YOU MUST SEE THEM GO DOWN: the enemy-facing sinking treatment (Eric ruling 2026-08-13) — supersedes amendment 16's presentation stance, amends 18

> *"Killing drones though? It tells you you killed them, and then there is no indication onscreen
> they are down and sinking at all. To me as the killing player, it looks as though nothing happened
> and its a delayed death bug. I want to SEE that I have scored a kill on the enemy ship and that
> their captain is going down with the ship!"*

**Two of my rulings combined into this defect and both are corrected here.** Amendment 16 ruled *"no
enemy-facing sinking channel"* on the smallest-new-channel principle. Amendment 18 then moved the
wreck tint AND the crimson plume from sink-entry to founder — correctly, because a hull rendering
"already dead" while it is still turning and shooting is the exact misread the window exists to
prevent. Together they left the five seconds between the two beats with **no enemy-side feedback of
any kind**: you sank a hull, the feed said so, and it sailed on looking perfectly healthy until it
snapped to a wreck. The most legible reading of that is a bug, which is exactly how it read.

**Ruled — PROGRESSIVE SETTLE + KILL FLASH,** chosen by Eric from four options:

- **At sink-entry, a kill flash on the hull** — an unmistakable "you scored" beat.
- **Across the window, a continuous settle** — the hull interpolates from its live look to the wreck
  look, arriving at the wreck EXACTLY at founder, on the beat the deferred plume already lands.
- **The plume stays at founder.** Amendment 18's location/identity split is untouched — this is not
  a reversal of it, it is the missing middle it never supplied.

**AMENDMENT 16'S WIRE STANCE IS UNCHANGED AND THIS COSTS NOTHING.** No wire field, no server change,
no seventh perception exception, no new disclosure of any kind — because the client ALREADY holds
both facts: the `sunk` event arrives at sink-entry (public for captains via the Public Register;
killer-and-witness for a drone) and `CONFIG.ship.sinkingWindowMs` is a shared constant. This is
**amendment 19's composition rendered**, not a new channel. What amendment 16 actually got wrong was
narrower than it looked: it reasoned about what may be DISCLOSED and silently also decided what may
be DRAWN, and those are different questions.

**The `seen` gate is absolute and now narrower:** an unwitnessed sinking draws nothing — no flash, no
settle, no plume — enforced at a single early return that owns all three. Location stays protected.

**Design decisions, all grounded rather than invented:** the flash REUSES the shipped hull hit-flash
channel at its ratified 300 ms same-source floor (EXPERIENCE.md's accessibility floor) rather than
inventing a second grammar, so it claims the same `WorldFlashGate` budget and degrades identically;
it is **untiered**, per `render/attention.ts`'s own rule that world effects are diegetic information
rather than chrome. The settle is **linear**, borrowing `sim/sinking.ts`'s own "linear, not eased"
argument verbatim so **the hull's look decays on the same shape as its speed cap — one ritardando,
not two.** `setDowned(true)` is now literally `setSink(1)`, so the founder handover cannot pop by
construction rather than by test. Motion-off removes the flash entirely and keeps the settle, which
is a monotonic state ramp and cannot strobe.

**A live legibility defect was found and fixed in passing, and it is worth knowing about:** the own
hull SNAPPED to the full wreck look the instant `alive` went false. `sunkTint` (`#8B0000`) has zero
green and blue and a Pixi tint MULTIPLIES — so a cyan, lime or spring captain spent their last five
fighting seconds steering a **literally black silhouette at 0.4 alpha across a black ocean**, in the
window the whole story exists to make playable. The own hull now settles only part way
(`ownSettleMax`), holding ≥0.8 alpha and readable colour, and holds at the cap past founder rather
than completing — otherwise it pops to full wreck for the ~½ RTT before the `spec` frame hides it.
The ratified mockup (`death-reveal-results-1.html` frame F1) draws the own hull at FULL personal hue
with a full-strength glow during the window, so the cap may shrink toward that mockup, never grow.
