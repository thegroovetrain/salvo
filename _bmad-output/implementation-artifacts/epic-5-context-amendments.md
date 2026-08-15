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

## Amendment 22 — A HULL YOU CAN SEE OUTRANKS ITS OWN ECHO (Eric ruling 2026-08-13) — completes epic-4 amendment 181

> *"Lets make hulls in general more visible over radar blips when they are visible."*

Two shipped facts stacked against the hull, and Eric chose to fix **both**:

1. **`blip` drew above `ship`.** `createStage` did `addChild(worldRoot, plateRoot, fogSprite,
   chartRoot, hudRoot)` with `ship` in `worldRoot` and `blip` in `chartRoot` — so radar paint was
   literally on top of every hull silhouette.
2. **The client paints a radar echo for a hull it can already see** (epic-4 amendments 88/141: inside
   truesight it stamps the hull into the field from the `Contact` it holds), and epic-4 amendment
   181's display mask was **anchored to the wrong ruler** — 1/8 → 5/8, which left the echo at **80%
   opacity at the edge of the bubble** and 40% halfway out.

**Point 2 is a correction of amendment 181, not a new rule.** Eric's original sentence was *"less
prominent in the near sight range where i am going to aim based on LOS rather than radar ghosts"* —
that describes the **sight bubble**, and the implementation anchored to the eighths ladder instead.
The mask now holds its floor across the WHOLE bubble (4/8) and reaches full strength at 5/8, the next
rung out and the first radius at which radar is the sole sensor — the shortest ramp the ladder can
express without muting returns in water nothing else sees. **The 0.2 floor is untouched**; it is
Eric's ratified number and re-tuning it was not asked for.

**And the mask is now OBSERVER-SCALED, which is a bug fix nobody had noticed.** It was baked ONCE at
construction from static base constants, so a dazzled or `intelTruesight`-boosted captain got a ramp
for a bubble they did not have. It now derives from the same `fogHoleRadiusU` the fog hole is baked
at and the server gates contacts with, and the rebake sits on the per-frame placement path so no
future caller can forget it. The mask still hangs on `blipLayer` and never on `heat.sprite`
(amendment 181's trap), and still reads nothing back (amendment 83).

**The lift's cost was paid, not accepted.** Hulls moved into `chartRoot` directly above `blip` and
below `aim`, and layer placement became **declared data with a build-failing completeness check**.
Lifting them above the fog would have cost the sight boundary's feather, so the fog's own two
constants are now exported and reproduced as a **hull alpha** — numerically the same ramp, same
radii, same endpoint as the composite gave, and now dazzle/boon-scaled where the baked hole already
was. **Nameplates deliberately did NOT follow the hulls** and stay under the fog: a label is not a
mark. A live trap was caught in passing — hulls inside your own star-shell lit zone BEYOND the bubble
are legitimate contacts, and a pure distance feather would have dimmed them to 15%, so owned lit
zones are exempt.

**No disclosure moved, verified rather than assumed:** `perception.ts` builds contacts solely from
`contactSignal.visible`, which is `dist² ≤ sightOf()² && losClear()` or `ownZoneCovers()`. There is no
other producer. **The fog was selling the reveal, never enforcing it**, so raising hulls above it
reveals nothing. Client-only; `PROTOCOL_VERSION` untouched.

**Ledgered consequences of "above `blip`" that Eric should eyeball on the water** — all read as
*hull is more visible*, which is the ask, but he ordered the ordering and not each of these: the
storm-side fill and in-zone wash **no longer tint hulls**, and wounded-smoke plumes, lit-zone glow,
own mine/decoy chart marks and the charted island linework now draw **under** hulls. `DESIGN.md`'s
z-order line was updated, since this ruling is precisely what it rules on.

## Amendment 23 — THE MODAL'S VERBS DO NOT MOVE: epic-2 amendments 22/23 beat Story 5.3's own AC (Eric ruling 2026-08-13)

> *"Yeah, amendment wins out here."*

Story 5.3's acceptance criterion and UX-DR27 (both 2026-07-16) specify *"the single amber RETURN TO
PORT action (Enter or ESC) — no re-queue here, no dead spectate button."* **Eric ruled the opposite
on 2026-07-26** in epic-2 amendments 22/23, and the shipped code implements that later ruling:
the elimination modal carries **SPECTATE + RETURN TO PORT**, **ESC means SPECTATE** and never
returns to port (`client/src/main.ts:806-826`, `ui/results.ts:203`), and **Enter confirms only at
game end** (`main.ts:850-856`).

**Ruled: the later amendment governs, and 5.3 does not touch the modal's verbs.** This story changes
the modal's CONTENTS and its STYLING only. `escapeAction`'s uniform topmost-close law, the
`canSpectate` gate, the 400 ms `resultsKeysArmed` grace and the Enter/`matchOver` predicate all stay
byte-identical.

**The AC's *"no dead spectate button"* clause is DISCHARGED rather than overruled** — it was written
when spectate did not exist and was guarding against a placeholder. Spectate shipped in amendment 22
and the button works, so there is no dead button to remove. The only genuinely superseded clause is
*"Enter or ESC"*.

**One consequence declined for now, recorded so it is not rediscovered:** `deferred-work.md:214-215`
notes that ESC-closing the GAME-END modal strands a player *"on the dead ocean with settings→ABANDON
as the only exit and the placement table gone for good."* A phase-split (ESC returns to port at game
end, where there is nothing left to spectate) was offered and NOT taken. That entry stays open.

## Amendment 24 — THE REVEAL IS THE BACKDROP, NOT A BEAT (Eric ruling 2026-08-13) — deletes mockup frame F2 as a stage

> *"its the backdrop."*

The ratified mockup draws F2 — the omniscient reveal — as its own full screen, held until Enter, with
`SUNK — 9TH OF 14` center-top and an `ENTER · RESULTS` prompt, and its sequence footnote reads
*"F2 → F3 is Enter/click."* **That stage is deleted.** The results modal keeps opening at founder
exactly as amendment 22 requires, and the reveal is what is visible BEHIND and AROUND it — mockup
frame **F3** ("results modal over the dimmed reveal") is the whole delivered composition.

**This makes ONE shipped number load-bearing, and it is the change that makes the feature visible at
all.** The modal currently dims the world with near-opaque black — `rgba(0,0,0,0.88)`
(`ui/results.ts:128`). At 0.88 the client would zoom out to the whole ocean and the player would see
none of it. The mockup's F3 specifies **`rgba(2,6,4,.62)`**, and that value is now the feature rather
than a styling detail.

**What this ruling REMOVES from the story:** no new client UX state, no Enter-to-proceed, no new key
surface, no registration with `escapeAction`/`openSurfaces`, and no auto-advance question. The
question gate's pre-taken rulings R8 (key the reveal on own founder, not on the spectate latch) and
R9 (the reveal owns its own key surface) are **moot** — with no beat there is nothing to key. The
reveal simply happens as the spectate view is entered.

**The `SUNK — 9TH OF 14` register is not lost** — amendment 29 moves that exact copy onto the modal's
banner, which is where the player now reads it.

## Amendment 25 — THE REVEAL GETS ITS OWN FRAMING MODE; the spectate clamp is untouched (Eric ruling 2026-08-13)

> *"Reveal gets its own framing, we might revisit the clamp later."*

The reveal's defining framing is arithmetically illegal under the shipped clamp, and this is a
measured fact rather than a preference. `baseZoom = shortAxis / (2 × radarRange)`
(`render/camera.ts:163-166`) fits **1320u** across the screen; the map is **4800u** across
(`CONFIG.map.baseRadius` 2400). Framing the whole ocean therefore needs a zoom factor of
1320/4800 ≈ **0.275×**, against `SPECTATE_ZOOM_MIN = 0.5` (`camera.ts:34`) — **ratified by epic-2
amendment 8** and pinned by two tests. At the floor the player sees 2640u, **55% of the map.**

**Ruled:** a distinct REVEAL framing computes its own fit-the-map factor and is exempt from the
spectate clamp. `SPECTATE_ZOOM_MIN`/`MAX` keep their values and keep governing the MANUAL wheel zoom,
which is what epic-2 amendment 8 actually ruled on. Lowering the clamp to ~0.27 was offered and NOT
taken, because it would hand every spectator a permanent whole-map view — a different feature.

**Ledgered discontinuity, deliberately accepted:** the reveal framing is the ENTRY state, and the
first manual wheel/pan hands control back to the clamped path — so a player who wheels once jumps
from 0.275× into [0.5, 1.0]. Eric anticipated exactly this in the same breath (*"we might revisit the
clamp later"*), so the pop is recorded rather than engineered around.

**A perf worry chased down and retired:** a 0.275× framing triples the radar heat buffer's area, which
`radarViewport.test.ts` watches. It does not apply — in spectate the client calls
`radar.render(null, ...)` (`main.ts:3166`) and a null pose makes `paintHeat` hide the buffer outright
(`radar.ts:1438-1440`). No radar surface is sized during the reveal. The map chart (island coastlines
and contour bands across the full disc at once, which nothing has ever drawn) is the real new cost and
wants a measurement, not a redesign.

## Amendment 26 — THE REVEAL ZOOM IS NOT EXEMPT FROM THE MOTION SETTING (Eric ruling 2026-08-13) — CLOSES UX open question #25

> *"That works."* — on: scale the zoom animation by `motionIntensity`, and at `off` SNAP to the
> whole-map framing instead of animating to it.

UX open question #25 (`EXPERIENCE.md:279`, *"whether the death-reveal camera zoom is exempt from the
motion/shake setting (it's the climax beat)"*) closes as **NOT EXEMPT**, and the story's named
design-with-Eric gate is discharged.

**The three facts that decided it:**

1. **Nothing in the game is currently exempt from `motion`.** All ~25 consumers multiply their
   amplitude by `motionIntensity()` → `{full: 1, reduced: 0.5, off: 0}` (`settings/store.ts:97-101`);
   none branches on the tier. The two exemptions that DO exist are exemptions from the *flash budget*
   (`render/flashBudget.ts:30-35`) and from *attention tiering* (`render/attention.ts:32-37`), not
   from `motion`. An exemption here would have been **the first of its kind.**
2. **The setting's own standing law forbids it** (`store.ts:17-18`): *"`off` removes motion, **never
   information**."*
3. **Exempting it buys nothing.** At `motion: off` the snap arrives at the identical whole-map view on
   the frame the animation would have started. Nothing about the reveal is lost; only the travel is.
   There is no version of this where an accessibility setting costs a player the content.

`render/camera.ts` and `render/spectate.ts` contain zero references to `motion` today, so this is the
first camera property the setting reaches — which is precisely why the question existed.

**Per the standing team agreement** (`deferred-work.md:860`, *"prefer 'ship it behind a flag and look'
over 'choose from four written descriptions' for any question about a visual"*, which names this gate
by name): the ruling is taken on the reasoning above, and the snap at `off` still wants one human
look. If it reads badly, THAT is what reopens the exemption — not a paragraph.

## Amendment 27 — `resultsSeconds` 10 → 45 (Eric ruling 2026-08-13)

> *"Yes, raise to 45."*

`CONFIG.match.resultsSeconds` was **10** (`shared/src/constants.ts:930`). Ten seconds after
`finish()` the room disconnects every client (`match.ts:605`) and the client force-reloads to the
menu (`main.ts:1432`).

That ceiling predates there being anything to READ on the results screen. It must now contain the
last sinking captain's window closing (amendment 20 holds the finish open for it), the reveal, and a
modal that this story adds a MATCH LOG to. **Raised to 45 s.**

Nothing else moves: it is one gameplay-authoritative CONFIG value, the room still disposes, and the
dev-only `matchOverride.resultsMs` (used by every smoke at 3000 ms) is untouched.

## Amendment 28 — THE MATCH LOG: kills get a TIME, as their own block (Eric ruling 2026-08-13)

> *"I'd like to know at what game time I got the kills I got."*

Eric chose a **separate MATCH LOG block** over stamping the existing `SHIPS YOU SANK` roll, and his
chosen composition includes **his own death line** — so the log is the player's whole match, not only
their kills:

```
  T+02:41   SANK SALT SHAKER
  T+04:12   SANK IRON KETTLE
  T+06:27   SUNK BY KRAKEN'S BANE
```

**TIME AFLOAT STAYS** — the three stat tiles remain `KILLS / PLACEMENT / TIME AFLOAT` as UX-DR27
ratified and mockup F3 draws. Dropping it in favour of the log was offered and declined.

**Zero wire, PROTOCOL_VERSION stays 34.** T+ is `serverNow − zoneStartT`, the same derivation the BR
chrome bar has used since Story 3.3, and the client already learns the moment each of its own kills
and its own death landed. The log is built from events the client already receives.

**Inherited limitation, unchanged and NOT fixed here** (`deferred-work.md:211-212`): a kill scored
with no line of sight yields no victim NAME, so it can contribute a stamped line but not a named one.
The existing `SHIPS YOU SANK` roll has always had this shape; the log inherits it rather than
introducing it.

**LEFT UNDECIDED BY THE OWNER:** the mockup's `Boons Accrued` list and `Last Offer` cards. Eric:
*"I don't know if I care about what boons I have selected at this point, i'll need to think on that."*
Both are ratified in UX-DR27 and drawn in mockup F3, and both cost **zero wire** (`net.you` is never
cleared on death, so `you.boons` and `you.offer` are still in hand when the modal opens —
`roomBindings.ts:799-800`). They are therefore BUILT to the mockup and are a **pure subtraction** to
cut on sight — which is the `deferred-work.md:860` agreement applied. Recorded as an open owner
decision, not as a shipped ruling.

## Amendment 29 — THE BANNER READS `SUNK`, and the identity line lands (Eric ruling 2026-08-13)

> Chose `SUNK` / `9TH OF 14` over the shipped `ELIMINATED`.

The modal's banner becomes mockup F3's composition: **`SUNK`** with **`9TH OF 14`** beneath it, plus
the identity line **`<CALLSIGN> · <CLASS>`** with the callsign in the player's own hue. This retires
the shipped `ELIMINATED` banner and the `ELIMINATED — PLACE #n` prose line
(`main.ts:1305`, `results.ts:74-77`).

It is also the ratified VOICE rather than a preference — `EXPERIENCE.md:52`: *"**Death register** is
dry-naval: 'SUNK — 9TH OF 14'. Grim facts, no mockery, no exclamation points."* The victory and draw
banners keep their existing copy and the phosphor/amber split is unchanged.

Amendment 24 deleted the reveal stage that this copy was drawn on; this is where it lands instead.

## Amendment 30 — NO INSTANT RE-QUEUE. EVER. (Eric ruling 2026-08-13)

> *"I DO NOT WANT INSTANT REQUE. You MUST return to the home screen to requeue. MUST."*

Stated in the strongest terms the ledger has recorded, in response to a copy question, and recorded
here as a **standing constraint on every future story that touches the results screen or the return
path** — not merely as this cycle's answer.

**It is already structurally guaranteed, and the guarantee is now PINNED BY TEST rather than by
construction alone.** The modal renders exactly two possible actions, SPECTATE and RETURN TO PORT
(`ui/results.ts` `makeActions`); RETURN TO PORT runs `requestAdBreak()` → `room.leave()` →
`location.reload()` (`app/returnToPort.ts:66-84`); and the reload lands on the pre-join home screen,
which connects only on an explicit press. **There is no code path from the results modal into a new
match.** Nothing in Story 5.3 threatens it — the story does not touch the modal's verbs at all
(amendment 23) — but a test now asserts the action set so it cannot drift in later.

**The consequence for this cycle's copy:** the mockup's button sub-line **`SET SAIL IS ONE PRESS
AWAY`** is **DELETED**. Offered with two ways to keep it (rename home's button to `SET SAIL`, which
DESIGN.md:243 already names as the amber register; or reword it to state the rule), and Eric took the
subtraction. RETURN TO PORT ships as a bare button with its `⏎` key chip. **The home screen's `PLAY`
button is therefore NOT renamed** — the divergence from DESIGN.md:243's "SET SAIL" register stays
exactly as shipped, since the only thing that referenced it is now gone.

## Amendment 31 — THE REVEAL FRAMES THE OCEAN, SO THE CENTRE MOVES TOO (orchestrator ruling 2026-08-13, forced by the review gate — **Eric has veto, this was not his call**)

Five defects were found at Story 5.3's adversarial review gate, two of them user-visible on **every
single match**. The one that needed a *decision* rather than a fix is recorded here as a ruling; the
other four are recorded as the corrections they were.

**THE RULING — the reveal centres on the map.** `beginReveal` set a zoom FACTOR and nothing else, so
the camera pulled back *while still trailing your killer*. A killer even a few hundred units
off-centre cropped a slice of the ocean straight off the screen — and a storm death, which has no
killer at all, centred the reveal on an arbitrary surviving ship. **"The whole ocean" is a statement
about the CENTRE as much as the zoom**, and no amendment had said so: amendment 25 ruled on the
framing factor and the clamp exemption, and the centre simply fell between four separately-authored
pieces with nobody owning it. Ruled: while the reveal is live it owns the camera centre and targets
the map origin — which is the disc's centre by construction (`sim/map.ts` spans `[-radius, +radius]`
on both axes). It eases on the same exponential the follow already uses, so the pull-back and the
drift to centre are ONE motion, and it snaps at `motion: off` exactly as the zoom does (amendment 26).

**A trap this created and the shape of its fix, because the obvious ordering is wrong:** free-pan
must be tested BEFORE the reveal takes the camera. Taking the camera by hand is precisely what
releases the reveal, so a WASD press has to reach `camera.pan` — the call that clears the target.
Gating the reveal first makes the mode **unreleasable by keyboard**: the wheel still escapes it (its
own listener calls `setZoomFactor`) but WASD never would.

**The four corrections, each a defect rather than a decision:**

1. **The winner rendered TWO of their own hull for the whole 45-second results period.** Un-hiding
   the own hull at spectate entry was done unconditionally, but **an afloat hull reaches its own
   client as an ordinary spectator CONTACT** (`signals.ts`'s spectator branch precedes the
   self-exclusion), and everyone spectates at `phase === 'finished'` — the winner included. So the
   winner drew a frozen predicted copy *and* a live interpolated one, visibly diverging. **The own
   wreck is now drawn only when the local player genuinely sank**, which is exactly the case that is
   absent from the contact set. Tested `=== false`, never `!alive`, because a missing `you` must read
   as afloat here (main.ts's standing `alive ?? true` trap).
2. **The own wreck's nameplate froze at a stale screen position.** Nameplates are SCREEN-space and
   the own plate is placed only by `updateOwnPlate` inside `renderOwn` — which does not run while
   spectating. The hull is world-space and stayed put on its own, so the plate drifted free of the
   wreck as the reveal zoomed out, leaving a callsign floating over open water. It is now re-projected
   every frame from the retained `net.you` pose, placed after the camera work exactly as `renderOwn`
   orders it.
3. **TIME AFLOAT read one second later than the `SUNK BY` stamp directly beneath it.** The tile
   reached for `fmtRingClock` because its *shape* was right (unpadded `6:27`) and silently bought its
   *direction* — the ring clock CEILS, because it counts down. Both values latch the same
   millisecond, so they disagreed on every death not landing exactly on a second boundary. The module
   had covered elapsed+padded and countdown+unpadded but not elapsed+unpadded; `fmtElapsedClock` is
   that third corner. **The existing test could not see this — it used an exact-second value, where
   ceil and floor agree** — so the regression pin deliberately uses a mid-second one.
4. **Wheel-scrolling the results modal destroyed the reveal behind it.** The wheel listener is on
   `window` with no modal gate, and this story made the modal tall enough that scrolling it is a
   normal action — so every scroll tick also drove the spectate zoom, clearing the reveal target and
   popping the backdrop to the clamp floor. Near-invisible before (an almost-opaque dim, and the zoom
   stayed inside `[0.5, 1]`); against the 0.62 dim it read a scroll as a zoom and threw the framing
   away. A wheel aimed at the modal is now not a camera intent.

**What the review found CLEAN, recorded so it is not re-audited:** amendment 26's motion behaviour
(including the snap at `off` and dt 0), amendment 25's untouched clamps, amendment 23's byte-identical
verbs, amendment 30's action-set pin (real, not a tautology), and the `ownMatchTime` staleness class —
stamps resolve at fold time and `sunkAtMs` latches first-wins, so a per-frame modal refresh cannot
grow TIME AFLOAT. Nothing at CRITICAL severity; the perception boundary is untouched.

## Amendment 32 — THE PLUME MARKS THE KILLING BLOW, NOT THE RESTING PLACE (Eric ruling 2026-08-14) — reverses amendment 18's LOCATION clause for the plume alone

> *"when a ship is destroyed, it changes to sinking status, and then 5s later it is sunk. There is a
> red explosion when the ship sinks all the way. Makes no sense? Lets move that to the moment when the
> ship is brought to 0 HP or less and begins sinking. Slowly fading to black is indication enough that
> it has sunk."*

**Amendment 18 moved two things together and only one of them belonged there.** It ruled IDENTITY at
sink-entry, LOCATION at founder, and moved the `setDowned` wreck tint AND the crimson `sink` plume to
the far end of the window. The tint half was right and stands: a hull rendering "already dead" while
it is still turning and putting a torpedo into you is the exact misread the sinking window exists to
prevent. **But that argument is about the hull's persistent LOOK, and the plume is not a look.** A
0.9 s expanding ring is an EVENT MARK — it says *a hit landed here* — and the event it marks is the
holing, which is true at sink-entry and only approximately true 110 u later. Nothing about a
transient ring makes a still-fighting hull read as a wreck.

**What moved:** `deps.effects.spawnEffect('sink', …)` leaves `presentWreck` (founder) for
`openWreckWindow` (sink-entry). Nothing else.

**What did NOT move, stated explicitly because this is the third ruling on one beat and the next
agent will be reading all three at once:**

- **Amendment 21 survives whole.** The kill flash still opens the beat at sink-entry; the settle
  still walks the hull continuously from its alive look to exactly the wreck look; the own hull's
  settle is still capped at `ownSettleMax`. Nothing about that ruling is reopened.
- **The founder beat keeps the wreck tint.** `markSunk` still latches there, and `setSink(1)` is
  still byte-for-byte `setDowned(true)`, so the handover remains pop-free BY CONSTRUCTION. With the
  plume gone from that instant, this equality is now the ONLY thing standing between founder and a
  visible pop — which is why its test survives with its rationale restated rather than retired.
- **The `seen` gate is untouched and still ONE early return.** The plume spawn was put inside
  `openWreckWindow`, after the gate and after the dedup guard, rather than beside the cue in
  `handleSunk` — so "an unwitnessed sinking draws nothing anywhere" is still one line to read, and a
  replayed `sunk` still cannot detonate twice over a hull already going down.
- **The Public Register's line holds.** Identity is public, location is not. A fog kill still draws
  no mark at a stale position, at ANY beat.
- **No wire field, no server change, no shared change.** `PROTOCOL_VERSION` stays 34 and no
  perception exception was added — the master invariant still has exactly SIX. Client presentation
  only.

**WHAT THIS CLOSES.** Amendment 18 ledgered its own consequence in writing: *"the death GROAN still
sounds at sink-entry at the sink-entry position, so the cue and its plume are now ~5 s and up to
110 u apart... If it reads badly, the cue is the thing to move, not the plume."* It read badly, and
the owner moved the plume instead. They are one beat again — and the implementation resolves BOTH
from a single `sunkPosition` read in `handleSunk`, which restores the property `sunkCue`'s own header
has been claiming untruthfully since the split (*"`pos` is resolved by the caller and shared with the
sink plume, so the cue and the mark can never disagree about where the wreck was"*).

**THE OWN HULL MOVES TOO, and that was ruled rather than assumed.** Eric's sentence names *a ship*,
not *an enemy*. Our own plume now fires where we were holed, on the tick our own death groan sounds,
instead of at the end of a five-second coast. `markSunk` is still never called on ourselves (we are
not one of our own contacts).

**LEDGERED, NOT FIXED — the flash and the plume now share a tick.** Amendment 21's 300 ms kill flash
and the crimson plume land on the same instant, on the same hull, in the same screen region: 2 of the
ratified 3 `WorldFlashGate` onsets per region per second (NFR13 / EXPERIENCE.md:138). They do not
degrade each other on their own, but they leave a region one onset from degrading in a ring-closure
scrum, and the flash's argument for existing (*"the five seconds had no enemy-side feedback"*) is
weaker now that a detonation opens the beat. **Whether the flash is still earned under a co-located
plume is Eric's call, not the implementer's** — it is a ratified channel and was left exactly as
shipped.

**One consequence of the deletion worth knowing:** `presentWreck` no longer resolves a position at
all, so amendment 18's *"the position is re-resolved HERE, never carried from sink-entry"* doctrine is
gone with the code it governed. A tint hangs on the contact view, not on the water. The
"unplaceable hull draws no plume" rule survives, moved to sink-entry, where it is far rarer (a hull is
almost always placeable on the tick it is holed) but not unreachable.

## Amendment 33 — THE FLEET IS A FIXED COMPOSITION AND AN EXACT ECONOMY (Eric rulings 2026-08-14)

Story 5.6's AC left counts and composition as *"CONFIG design targets"* and the invocation's first
pass named wave totals of 15 / 10 / 5 levels. **Both are superseded by a single ruling that makes
the economy exact by construction rather than by search.**

> *"lets make it 9, 6, and 3 XP worth of levels per stage... Each 3 levels worth of XP should be
> broken down into 2 large, 3 medium, 4 small (change from the random fill)."*

**ONE FLEET = 2 large + 3 medium + 4 small = 2(½) + 3(⅓) + 4(¼) = 1 + 1 + 1 = exactly 3.000 levels,
in 9 hulls.** The AC's *"so long as their total XP value is exactly the number"* stops being a
constraint to satisfy and becomes an identity: every wave is a whole number of fleets.

| Wave | Levels | Fleets | Hulls | Cumulative |
|---|---|---|---|---|
| 1:00 | 9 | 3 | 27 | 27 |
| 5:00 | 6 | 2 | 18 | 45 |
| 9:00 | 3 | 1 | 9 | **54** |

This **replaces the round-robin fill** (`ArenaRoom.ts:442`, `DRONE_HULL_IDS[i % 3]`), which was the
only composition rule the codebase had.

**Why the cut from 30 levels to 18 mattered more than it looks.** At 15/10/5 the counts were 30-60
hulls in wave one and 60-120 cumulative, against a 20-hull reference scenario, a measured 1.74 ms /
2.5 ms client radar budget, and a 660 u terminal ring that could not physically hold them. At 18
levels the story becomes buildable, and **the binding constraint turns out to be hulls
*concurrently in sensor range*, not hulls afloat** — because fleets are clustered (amendment 35),
the realistic worst case is one fleet plus contesting captains, ≈9 + 5, at or under today's measured
worst case. The bigger ocean (amendment 42) is doing real work here. Server cost scales on hulls
afloat instead: ship rows go 400 → 1,480 per tick, pro-rating the two shipped adversarial
measurements to ≈2.6 ms/tick against a 50 ms budget. **Comfortable, and it wants a measurement
rather than an argument before ship.**

**The economy is now a third faucet rather than the dominant one.** 18 levels across a match sits
*below* the 19 levels of captain kills available in a full lobby and around 1.5× a survivor's
passive accrual. At 30 it was larger than both combined.

**Totals are FIXED, not roster-scaled** (Eric ruling): the ocean carries the same fleets whether two
captains showed up or twenty. A thin lobby is therefore a target-rich one, which is a deliberate
consolation and the counterpart to deleting the drone fill (amendment 41). Story 6.2 is where
roster-scaling lives if it is ever wanted.

**The two directions of the fight, both computed and both intended:**
- Clearing a whole fleet solo costs 4×4 + 3×5 + 2×6 = **43 gun hits** (60/75/90 hp against a
  15-damage gun) at a 5 s reload ≈ **3.6 minutes** with every shot landing, for 3 levels — against
  3.6 levels of passive accrual in the same time. **Farming roughly doubles your rate**, and costs a
  quarter of the match.
- Aggroing all nine at once is 4×6 + 3×8 + 2×10 = **68 damage per volley**, 13.6 dps: a 125 hp
  Torpedo Boat dies in **9.2 seconds.**

## Amendment 34 — THE FLEET ENVELOPE, AND THE RESCALE STORY 1.6 HAS OWED SINCE 2026-07-21 (Eric rulings 2026-08-14)

|  | small | medium | large |
|---|---|---|---|
| hp | **60** | **75** | **90** *(was 80 / 100 / 120)* |
| gun damage | **6** | **8** | **10** — flat 5 s cooldown, all sizes |
| kill value | ¼ | ⅓ | ½ level — already shipped verbatim |
| maxSpeed | **40** | **35** | **30** *(was 46 / 38 / 30)* |
| reverse / accel / decel | scaled proportionally with maxSpeed | | |
| turnRate / steerageSpeed | **unchanged** | | |

**The speed ruling discharges `epics.md:1090`**, open since Story 1.6 (2026-07-21): *"the pinned
drone envelopes predate the 1.6 hull-speed rescale, leaving droneSmall the fastest hull afloat."*
It was — 46 against the Torpedo Boat's 45. At 40 it sits below every player class, `droneMedium` at
35 ties the Battleship, and the torpedo's `speed: 60` still outruns everything (the
`damageGuardrail` pin holds). `shipClasses.test.ts:121-156`'s identity table updates deliberately,
which is exactly the reviewed-edit mechanism it exists to force.

**turnRate and steerageSpeed deliberately do NOT move**, so agility stays a size property rather
than drifting with a speed retune.

**Fit is GUN ONLY.** Today `loadout.ts:116-121`'s catch-all default fits every drone hull with
`[gun, torpedo, mine, empty]` at full ammo — so every drone afloat right now already carries a
loaded gun, and `fireControl` already ticks its reload. `specialsFor()` gains a fleet branch
returning no specials. **Named cost:** `server/src/__tests__/equipment.test.ts:46-65` built the
entire equipment suite's fixture on `droneMedium` carrying the universal fit; that suite is
re-pointed at a real ship class.

**Per-size gun damage is architecturally free and this is worth knowing before implementing it:**
`ShellState.damage` is captured **at fire time** from `ship.stats.gun` (`guns.ts:141-152`) and read
at hit time **from the shell**, never from CONFIG. No damage-path change is needed at all.

## Amendment 35 — THE WITNESS RULE IS EVALUATED ONCE, AND THE SPREAD IS THE DIFFICULTY DIAL (Eric rulings 2026-08-14)

*"All PvE ships who can see both you and the ship that was attacked and otherwise have no target
will target you"* is evaluated **ONCE, at the instant of the hit.** A fleet ship that rounds an
island two seconds later never joins that engagement.

**Why once and not continuously:** continuous evaluation makes every long fight trend toward full
aggro, which collapses the 68-damage volley onto anyone who takes more than a few seconds to work —
and the positioning skill evaporates with it. One-shot is bounded, cheaper, and makes *hit them
where the rest cannot see you* the core skill of the feature.

**The fleet spawns spread over a ~400 u radius, and that number IS the difficulty.** A hit is
witnessed by any fleet ship with LOS to both attacker and victim within 330 u (amendment 36), so
spread sets how many guns answer:

- **~150 u** — all nine inside each other's sight; touching any one aggros all nine, always. The
  witness rule stops meaning anything because the answer is always "everyone."
- **~400 u (RULED)** — typical neighbour spacing lands near the sight edge, so ~2-4 witness. Full
  aggro becomes a mistake you made rather than the default.
- **~700 u** — 0-1 witness; the composition ruling becomes invisible and "fleet" stops meaning
  anything on the water.

**The fleet TRAVELS TOGETHER** on a shared waypoint stream (per-hull jitter and throttle), holding
roughly its spawn spread for the whole match — so the witness geometry tuned above still holds at
9:00, not only at 1:00. Independent roving (today's `DroneController` behaviour) was offered and
declined: the nine scatter within a minute and the spread dial stops meaning anything.

**THE WITNESS SWEEP IS GLOBAL, NOT PER-FLEET — recorded because a reviewer already "found" the
opposite and the next one will too.** The cross-model review gate flagged as a CONFIRMED defect that
`propagateWitnesses` iterates every fleet hull in the world rather than only the victim's own fleet,
reasoning from the existence of `fleetId` that fleets should be separate aggro networks. **That rule
was never made.** Eric's sentence is *"all PvE ships who can see both you and the ship that was
attacked"* — the gate is LINE OF SIGHT, and nothing else. `fleetId` exists to share a waypoint
stream so the nine travel together; it carries no combat meaning whatsoever. Two fleets drifting
close enough to see each other producing one larger fight is the rule working, not failing. **Do not
"fix" this.**

## Amendment 36 — SELF-DEFENCE: the six behavioural rulings (Eric rulings 2026-08-14)

1. **Sight is `CONFIG.vision.sight` (330 u) for all three sizes.** One number, already the 4/8 rung
   of the eighths ladder, already the radius the sim uses for "can this hull see that hull." A
   per-size ladder was offered and declined — size reads through hp, damage, speed and gunnery
   instead.
2. **A blind victim CLOSES ON THE INCOMING BEARING.** The captain's gun reaches 660 u and a fleet
   ship sees 330, so shelling one from outside its world was risk-free under a strict reading of
   *"defend themselves within LOS range"* — which would have made the guns decorative. An attacked
   ship now steers to the incoming bearing until it has LOS. **Sniping still works; it starts a
   clock instead of being free.**
3. **Mines do NOT aggro.** A shell or torpedo gives a bearing worth closing on; a mine's layer may
   be dead or 2000 u away, and chasing it produces a hull wandering off after a ghost. Mine Layers
   keep their trap play against fleets.
4. **~3 s target memory on LOS break.** Instant forgetting — the literal reading — makes them
   jitter at every island edge as LOS flickers and turns any rock into a perfect off-switch.
5. **They LEAD the target, with a per-size aim scatter** (largest on the small hull). This is a
   design decision, not a detail: the gun bursts at a *point* with a 15 u radius, shell speed 500
   u/s, so at 330 u the flight is 0.66 s in which a Torpedo Boat moves 30 u — **twice the burst
   radius.** No-lead misses nearly everything; perfect lead nearly never misses. Scatter makes
   *kill the large one first* a real decision.
6. **Fleet ships never damage and never aggro each other.** `burstVictims` (`world.ts:2617`)
   excludes only the shooter today; it widens to exclude any fleet hull. Keeps the fleet a single
   opposing force instead of a comedy of drones brawling in the corner.

**A held target is NOT given up for a new attacker** — the invocation already settled this
(*"once you leave their LOS, they stop chasing you and can acquire a new target if attacked by
someone else"*): re-acquisition happens only after the current target is lost. Third-party rescue is
therefore a real play.

## Amendment 37 — MID-MATCH WAVE SPAWNING IS A GENUINELY NEW EDGE (Eric ruling 2026-08-14)

**Nothing in the codebase spawns a ship mid-match today.** `addShip` runs at join, `redeployShip` at
the countdown→active boundary, `respawn` in the waiting phase only (`respawnEnabled` and
`damageEnabled` are mutually exclusive by construction). And **`pickSpawn` has no hard
minimum-distance constraint at all** — `occupied` only affects a max-min *score* (`spawn.ts:124-138`)
— so *"outside all combatants' intel ranges"* is a new hard constraint with no existing
infeasibility branch.

**The arithmetic is against it.** At the new R=2800 the map is 24.6 M u² and one captain's intel disc
is π·660² = 1.37 M u² (up to 1327 u on a stacked `intelRadar` build, `boons.ts:344`). Twenty captains
deny more area than the map contains, and the 9:00 wave is the hardest because the live ring is
smallest.

**Ruled — a fleet gets an ANCHOR and spreads around it:**
1. Sample anchors **inside the live ring**.
2. Keep those outside **every** captain's intel disc.
3. Spread the nine hulls over ~400 u around the anchor (amendment 35).
4. No anchor? **retry next tick, bounded.**
5. Still none? take the farthest-from-anyone point anyway (the existing max-min score) **and log
   it.** The wave always arrives, and degrades visibly rather than silently.

Deferring until a spot opens was offered and declined — a late wave could then never arrive,
silently deleting specced XP. Anchoring in the storm was also declined: hulls would arrive wounded
and incomplete.

**Two things every existing placement path does that this one must also do:** `detachWake(ship)`
(`world.ts:3330` — a teleport that skips it draws a bogus cross-map wake segment) and pushing the
`spawn` event. The `spawn` row's visibility rides `pointSighted`, so a fleet spawning outside
everyone's intel emits an event nobody receives — which is the desired behaviour, but **confirm the
row rather than inherit it.** *(Landed note: a wave hull is a brand-new `ShipRecord` with a fresh
ribbon, so on this path there is genuinely nothing to detach — the teleport hazard is structurally
absent rather than handled. `respawn`/`redeployShip` still detach on theirs.)*

**THE ANCHOR IS NOT ENOUGH, and the obvious fix is the wrong one (orchestrator ruling, forced by the
review gate).** Constraining only the anchor leaves the nine hulls free to scatter `spreadU` (400 u)
toward a captain, so a hull could materialize **660 − 400 = 260 u** away — *inside* the 330 u sight
bubble, a visible pop-in, which is precisely what this amendment exists to prevent.

Inflating the anchor's denied radius to `radarRange + spreadU` was costed and **rejected**: it takes
the denied area per captain from ~1.37 M u² to ~3.53 M u², which at a full roster exceeds the whole
24.6 M u² map — every wave would take the max-min fallback and the rule would stop meaning anything.

**Ruled — constrain PER HULL, not per anchor.** After a hull scatters to `anchor + offset`, a
position inside any captain's intel disc is re-rolled within bounded attempts, falling back to the
anchor itself (clear by construction). **The formation deforms; the wave never fails.** The ring
clamp still applies, so a nudged hull can never land in the storm.

## Amendment 38 — PvE KILLS COUNT NOWHERE (Eric ruling 2026-08-14) — SUPERSEDES epic-4 amendments 29-34 and epic-5 amendment 9 on this point

> *"i dont want PvE kills to show up as 'kills' in a player's killcount or as events in their
> records."*

**This reverses a clause both prior amendments explicitly preserved.** Epic-4 amendments 29-34's
"what did NOT move" list and epic-5 amendment 9's identical clause both state: *"`ShipRecord.kills`
still counts drone kills for the roster/results KILLS column, and `captainKills` still drives the
bounty throne alone."* That is now false.

| | fires? |
|---|---|
| kill flash + progressive settle (amendment 21) | **YES** |
| kill feed line | **YES** |
| XP grant (¼ / ⅓ / ½ level) | **YES** |
| KILLS column (roster + results) | **NO** |
| MATCH LOG line (amendment 28) | **NO** |
| SHIPS YOU SANK roll | **NO** |

**The feed/record split is the whole ruling.** Clearing one fleet is up to 43 gun hits and 3.6
minutes; you need to know each sinking landed, and **amendment 21 exists precisely because Eric
objected to drones dying with no onscreen indication.** Going silent would walk that back. What he
means by *records* is the persistent tally, and that is what empties.

**Consequence the spec must resolve, flagged rather than assumed:** with `kills` no longer counting
drones, `kills` and `captainKills` become **identical by construction**, so Story 4.6's split is
redundant. Retiring `captainKills` in favour of `kills` is the honest simplification, but it touches
a ratified split and should be a deliberate, reviewed edit — not a silent collapse. **Telemetry does
NOT move**: `rosterSize`/`rosterByClass`/`killsByClass` are the operator's data (amendment 9), are
computed from `Match.participants` rather than the schema roster, and are pinned by test.

## Amendment 39 — FLEET SHIPS COME OFF THE ROSTER (Eric ruling 2026-08-14 — taken against the orchestrator's recommendation)

Every drone today carries a `PlayerMeta` row (`ArenaRoom.ts:444-448`) with the `REGATTA_NO_HUE`
(255) sentinel, mirrored to every client each tick. At 54 fleet hulls that is 74 rows in a full
lobby. **Ruled: fleet ships are not roster members**, which is FR34's *"never roster fill"* taken
literally and is the natural consequence of amendment 38 — a hull whose kills count nowhere has
little left to mirror.

**The cost is real and is named, because it was recommended against.** The client detects drones
through **two independent channels** today, and this deletes one of them: `Contact.cls` carrying a
drone hull id, and that 255 sentinel. Six client sites re-point onto `Contact.cls`: `feedColor`,
`rosterColor`, `isDroneId` (`main.ts:1139`), `isLiveRival` / `afloatCount` (`score.ts:117,163`), and
the radar `hueFor` adapter (`main.ts:1941`).

**The kill-feed line survives the roster's deletion** (amendment 38 requires it) but must source its
name and colour from the hull rather than the roster. The precedent already exists and is exact:
`nameplates.ts:67`'s `resolvePlate` returns `{text: 'DRONE', color: droneOutline}` **before** any
name or hue lookup. The feed follows it — a fleet sinking reads `DRONE`, never `DRONE-07`.

`n AFLOAT` gets simpler rather than harder: the roster becomes captains-only, so the count is the
roster.

## Amendment 40 — THE AGGRO BRACKET: threat is dual-coded by SHAPE, and blindness is not warned (Eric rulings 2026-08-14)

> *"I want it very visually obvious that a PvE ship has aggro'd you, and very visually obvious if it
> de-aggro's you, as well."*

**Colour was never available for this.** Drones are locked greyscale (`DESIGN.md:157`,
`drone-outline`/`drone-fill`), and `DESIGN.md:162` puts **threat and state on the dual-coding
floor** even under the Variant-C identity waiver. So the channel has to be shape.

**Ruled — an angular BRACKET around the chevron:**
- **On aggro:** the bracket snaps on with one flash and an audio sting.
- **While held:** static. Deliberately not animated — a pulse would claim a slice of the
  photosensitivity budget and would need Story 4.8 attention-tier arbitration, which is exactly the
  argument epic-4 amendment 220 used to keep the kill-leader glow static.
- **On de-aggro:** the bracket visibly breaks at the corners and fades (~400 ms) with a distinct,
  softer descending cue.

Presence/absence of a shape survives greyscale, colourblind modes and the drone palette
simultaneously.

**No warning for aggro you cannot see (ruled against the orchestrator's recommendation).** Because a
sniped-but-blind fleet ship closes on the bearing (amendment 36), it can aggro from 500 u — beyond
*both* sight ranges — where a hull marker shows nothing. A bearing-less, count-less "ENGAGED" cue
was offered on the Hit Call precedent (it confirms a consequence of your own shot without revealing
a position) and **declined.** The accepted consequence, stated plainly: **sniping quietly spawns
hunters you never see coming**, and the bracket appears only once they close inside 330 u — by which
point they are already in gun range. **Zero new fog-piercing channels, which is the property the
ruling buys.**

**Wire note for the spec:** the client cannot derive aggro state, so this needs a **self-private**
per-contact flag — visible only to the targeted observer, on the `sinkingUntil` precedent
(amendment 16). It discloses nothing spatially new (you already see the hull) and therefore needs
**no seventh perception exception** — but it DOES break `spectator.test.ts`'s exact `Contact`
key-set pin (amendment 19), which must be updated deliberately.

## Amendment 41 — THE MATCH-START DRONE FILL IS DELETED OUTRIGHT (Eric ruling 2026-08-14 — taken against the orchestrator's recommendation)

> *"drones the spawn at the start of the game with players should be removed from the game entirely
> in their present form."*

The fill goes, and **so does everything built on it**: `ArenaRoom.fillToCapacity` (`:434-449`),
`dronesSmoke.mjs` in full, `drones.test.ts`'s fill suite, the batch-sim harness fill
(`batchsim/runner.ts:227-240`) and its `--drones N` flag.

Keeping the fill behind `HC_DEV_OPTIONS` — the gate `matchOverride`/`zoneOverride` already use — was
offered and **declined.** The cost is therefore accepted rather than mitigated, and it is named
here so it is not rediscovered as a surprise: **AR18's committed tuning method loses its
implementation.** AR12 names the drone-lobby batch-sim harness as triple-duty infrastructure
(economy tuning, pre-launch load test, bot-vs-bot AI evaluation) and AR18 commits to
*"batch-simulate XP tick and kill-bonus outcomes with drone lobbies before human playtests."*
**Epic 6's combat bots are where that capability would be rebuilt.** A `deferred-work.md` entry is
owed.

**This is a ratified direction, not a surprise, on the FR34 side:** *"zero bot-fill exists in
Standard — roving PvE fleets are world content, never roster fill."*

**Also ruled (a correctness cleanup, not a behaviour change): `CONFIG.match.fillTo` stops sizing the
map.** `ArenaRoom.ts:253` constructs `new World(seed, CONFIG.match.fillTo, ...)` and
`mapRadius(playerCap) = baseRadius × sqrt(playerCap / capRef)` (`constants.ts:1108-1110`) — so the
constant meaning *"how many drones to fill to"* is currently also the constant meaning *"how big is
the ocean."* With the fill deleted, `CONFIG.map.playerCap` is the honest source. Both are 20 today,
so nothing observable moves.

## Amendment 42 — THE OCEAN GROWS TO 2800, AND THE CLOSING-RATE BAND IS RE-RATIFIED (Eric ruling 2026-08-14)

> *"lets scale the ring up a bit, I feel like the map is a little too small, so each stage doesn't
> force enough movement."*

**That sentence contains two different asks with two different knobs, and the shipped test proves
it.** `zone.test.ts:235-247` pins `worstEscape = (1 + offsetCap) × maxΔr` between **0.75 and 0.85 of
a battleship-minute** (35 u/s × beatMs). Because the terminal radius is derived from truesight and
never moves while R grows, `maxΔr` grows against a denominator that does not — so **`baseRadius` has
about 3% of headroom (~2480) before the test fails**, and it fails outright by R=3000
(fraction 1.13).

**More importantly: that pin holds worst-case forced movement CONSTANT regardless of map size.** A
bigger ocean therefore *cannot by itself* make each stage force more movement — it buys open water,
islands, transit time and lower encounter density. The two halves of the ask are separable, and
three of the four costed packages only delivered one of them.

**Ruled: `CONFIG.map.baseRadius` 2400 → 2800, and nothing else moves.**

| | before | after |
|---|---|---|
| ocean area | — | **+36%** |
| ring radii | 2400 → 1560.8 → 1015.0 → 660 | **2800 → 1729.7 → 1068.3 → 660** |
| max shrink | 839.2 u | **1070.3 u** |
| worst-case escape | 0.799 | **1.019** |
| match length | 12:00 | **12:00 (unchanged)** |
| `beatMs` / `offsetCap` | 60 s / 1.0 | **unchanged** |

**1.019 means a battleship caught at the worst possible position must run the entire close beat at
flank speed and just misses safety** — it takes a bite of storm rather than dying. That is a precise
statement of *"forces movement,"* and **it replaces the ratified 0.75-0.85 band, which is Eric's
re-ratification to make and not the implementer's.** The test is doing its job by refusing the
change; it is updated deliberately, with this amendment as its citation.

**Landed NOW rather than deferred to Story 6.2** (which owns roster-dynamic sizing and names this
exact coupling in its ACs, per `deferred-work.md:313-314`). It is a static-literal change 6.2 would
revisit regardless; 6.2 later replaces the literal with a curve and re-derives the band as a
function of radius.

**Two consequences that must ride with it:**
- **`PROTOCOL_VERSION` bumps** — the same seed now builds a different ocean, exactly the cycle-59
  precedent; the client sanity-checks `welcome.mapRadius` at `connection.ts:333-339`.
- **`heightField.ts:160-221`'s `regionWavelength: 2400` is a fixed world-unit literal currently
  sized to span the disc exactly once.** Past 2400 u the macro land-clustering term begins repeating
  across the map. It should track the radius, and the result wants an eyeball pass — this is the
  tuning panel Eric approves by eye (`heightField.ts:42-43`).

Island count scales with disc area at fixed 2-3% coverage (~18 → ~24), and the height raster grows
O(R²) to ~160 KB. Both fine; both measured rather than assumed.

## Amendment 43 — YOU LEARN WHAT YOU SANK, AT THE MOMENT YOU SINK IT (Eric ruling 2026-08-14) — completes amendment 38, forced by amendment 39

> *"I want to know the kills I get when I get them. Meaning I want to know I killed a Small Drone
> if a Small Drone is killed by my mine. But it doesn't increment my kill count. It just grants XP.
> It doesn't need to show up in my end-game kills record."*

**This is amendment 38's feed/record split holding, plus the one thing it turned out not to
deliver.** 37 ruled the transient feedback stays and the persistent tally empties; Eric has now
confirmed all three of its NO columns unchanged in the same breath (no KILLS increment, no match
log, no end-game record) while naming a case where the YES column silently failed.

**The case, and why it is not a client bug.** With fleet hulls off the roster (amendment 39) the
client's two drone-detection channels collapsed to one, and **you can sink a fleet ship you never
saw**: a mine it sailed over, or a shell at 500 u — the gun reaches 660 u while truesight is 330 u,
which is the same 2:1 asymmetry amendment 36 built the close-on-the-bearing rule around. For such a
hull the client holds no name, no hull id and no roster row, so the kill feed could only say
`UNKNOWN VESSEL`. **The server knows; nobody else can.** A client-side memo of hulls ever seen was
built first and fixes the common Mine-Layer case honestly, but it cannot reach a hull that was never
in the bubble at all.

**Ruled — `SunkEvent.vcls?: HullId`, per-observer, credited killer only.** Stamped by the `sunk`
row's `materialize()` exactly when `by === observerId`; omitted entirely for every other recipient.
The feed names the SIZE — `SMALL DRONE` / `MEDIUM DRONE` / `LARGE DRONE` — **because the size IS the
payout** (¼ / ⅓ / ½ level), which is the information the ruling is actually asking for.

> **CORRECTION OF RECORD (orchestrator, same day, forced by the review gate).** This clause first
> read *"omitted entirely for every other recipient, **witnesses and spectators included**"*, and the
> implementation followed it literally with a second gate, `mode === 'fogged'`. The cross-model
> review split on it — one reviewer called the gate a defect, the other called it faithful to this
> text — and **both were right, because the text was careless.** "Spectators included" was written to
> mean *observers who are not the killer*; read absolutely it excludes a killer who happens to be
> **dead**, and a mine you laid before you sank, tripped by a fleet ship while you spectate, is
> exactly the kill Eric's sentence is about. The gate is now the single condition
> `by === observerId`. A one-gate rule is also strictly harder to drift than a two-gate one, and the
> per-observer `materialize()` still admits exactly one recipient, so nothing widens.

**No seventh perception exception, and the master invariant stays at exactly SIX.** It rides the
existing `sunk` row and is gated STRICTLY NARROWER than the row itself: it reaches one client, who
already earned the XP for that hull and already learned its tier from the amount. This is the
`seen` pattern (per-observer, stamped at materialize) rather than the `bty` pattern
(observer-independent), and the distinction is load-bearing — a `bty`-shaped implementation would
publish the victim's class to every recipient of a public register line, which the register's
identity-only ruling forbids.

**Key order is load-bearing (msgpack): `k,id,by?,seen?,bty?,vcls?`**, appended last, never
`undefined`.

**Orchestrator note, flagged for Eric rather than decided silently:** `vcls` is stamped for EVERY
victim, not only fleet hulls — a captain's class reaching their own killer is the same disclosure
class (that killer sees the wreck and the feed already names them). Fleet-victims-only was the
alternative. Uniformity was chosen; reversing it is a one-line narrowing.

**Nameplates deliberately did NOT follow.** A fleet hull's plate still reads `DRONE` with no size.
The ruling is about the moment of the kill, and widening plates was neither asked for nor put to
Eric — the three sizes are already visually distinct at 85 / 100 / 115 u.

## Amendment 44 — THE RECORD STAYS SHUT, BUT THE DATA STOPS BEING THROWN AWAY (Eric ruling 2026-08-14)

> *"PvE fleet kills DO NOT show up in the match log. I don't care what time I killed each drone. But
> we can keep this data anyway, maybe for server stats? I do want to start tracking every metric i
> can eventually."*

**The first half CONFIRMS amendment 38 rather than changing it** — PvE kills stay out of the KILLS
tally, the MATCH LOG and SHIPS YOU SANK, and the transient feedback (flash, settle, feed line, XP)
stays. Nothing player-facing moves.

**The second half closes a hole amendment 38 opened without noticing.** Because `creditKill` simply
stops incrementing on a drone victim, a PvE sinking left **no trace anywhere** — and
`MatchEndSummary.killsByClass`, which sums `Participant.kills`, therefore silently lost every PvE
kill in the match. Presentation and telemetry are different questions, and amendment 9 already
settled that one: *"telemetry still counts every hull… the operator's data, not presentation."*
The same principle applies here and was simply not carried across.

**Ruled — server-side only, never on the wire:** `ShipRecord` carries a PvE kill tally keyed by the
**victim's drone hull id**, incremented exactly where `kills` is now deliberately skipped and
sharing `kills`' lifecycle (zeroed at `redeployShip`, preserved across a waiting-phase respawn);
`Participant` snapshots it at activation so it survives the ship record's removal; and
`MatchEndSummary` gains `pveKillsByClass`, summed beside the existing `killsByClass`.

**Per-size, not a bare total, and the reason is the economy:** size IS the payout (¼ / ⅓ / ½ level),
so a per-size breakdown alone reconstructs exactly how much XP the PvE faucet paid out in a real
match.

**This partially replaces evidence amendment 41 destroyed.** Deleting the match-start fill took the
drone-lobby batch-sim harness with it, and AR18 had committed to *"batch-simulate XP tick and
kill-bonus outcomes with drone lobbies before human playtests."* Real matches now carry that signal
themselves, from live play rather than from a synthetic lobby — which is better evidence than the
harness produced, and arrives without the harness. The `deferred-work.md` entry filed for AR18 stays
open (the load-test and bot-evaluation duties are not covered), but its economy-tuning leg is.

**Forward-looking, deliberately not built now:** *"I do want to start tracking every metric I can
eventually"* is a direction, not a request for a stats system this cycle. What lands here is the
data being KEPT in the existing telemetry aggregate, not new infrastructure to serve it.

**ONE PvE LINE SURVIVES IN THE PLAYER-FACING LOG, and it is the player's own death** (Eric ruling,
same day, resolving the orchestrator's read-check):

> *"if you actually die to a drone, I DO want to see that in the end-game report given to players
> lol. You SHOULD be embarrassed hahaha. That's the only time though."*

So amendment 28's `SUNK BY` line stays when a fleet ship is the killer — it is the player's own
sinking, never a PvE kill they scored, and it is the ONLY PvE-related entry the match log may carry.
*"That's the only time though"* is the boundary and is quoted here so a later story does not read
this as permission to widen.

**And the fleet hull is named BY SIZE wherever the client can determine it** — `SMALL DRONE` /
`MEDIUM DRONE` / `LARGE DRONE`, falling back to plain `DRONE` when the size is unknowable. The size
is what makes the line land, and a single naming rule applied at one resolver is what stops the kill
feed and the match log disagreeing about the same event — a defect the review gate had just caught
in its cruder form (`DRONE` vs `UNKNOWN VESSEL`), and one that a log-only sizing change would have
quietly reintroduced.

## Amendment 45 — THE FLEET GUN IS ATTRITION, AND THE WAVES ARE A RATIO (Eric rulings 2026-08-14) — retunes amendments 33 and 34

> *"Oops, they are too strong! Rescale to 1, 2, and 3 damage (small, medium, large). Also, lets spawn
> 12 levels worth in the first go, then 6 levels, then 3. One more fleet in the first batch makes an
> average of 5 combatants per fleet. Assuming each ring stage kills off roughly 50% of players, this
> keeps the ~5player/PvEfleet ratio throughout the game."*

**TWO changes, and the second one reframes what the wave numbers ARE.**

### The gun: 6/8/10 → 1/2/3

|  | before | after |
|---|---|---|
| full nine-hull volley | 68 damage | **16** |
| dps under full fleet aggro | 13.6 | **3.2** |
| time to kill a 125 hp Torpedo Boat | 9.2 s | **39 s** |

A fleet is now **attrition, not a threat that resolves a fight on its own.** At the typical 2-4
witnesses the 400 u spread produces (amendment 35), incoming fire is roughly **2-6 damage per
volley** — a bleed you can ignore for a while, not a clock you must respect.

**What this does NOT change:** clearing a whole fleet solo still costs ~43 gun hits ≈ 3.6 minutes,
and aggro accumulates as you work through the hulls, so the integrated damage over a full clear is
still on the order of a hull's health. The farm remains a commitment; what it stops being is
*lethal in the moment*.

### THE REAL ARGUMENT IS ECONOMIC, NOT "TOO STRONG" — Eric's derivation, recorded because it is load-bearing

The headline quote undersells the finding. Eric's arithmetic (verified exactly against the shipped
constants — gun 15, small drone 60 hp, `damageControl` 25 instant + 25 regen for one banked level):

> *"Small drone has 60 HP, which is 4 shots from an unupgraded gun over 20 seconds. In that same 20
> seconds, the small drone can shoot at you 4x… it was set to 6, 8, 10, which in that same span of
> time is 24, 32, or 40 damage. Two small ships could hit for nearly 50 damage before one is killed,
> and even when both are killed, that's only half a level. Not worth it, given that healing costs a
> level and restores only 50."*

**AT 6/8/10 THE PvE FARM WAS XP-NEGATIVE, which is a different and much worse defect than being
hard.** The exchange rate:

| | at 6/8/10 | at 1/2/3 |
|---|---|---|
| damage taken killing two small hulls | ~48 hp | **8 hp** |
| XP earned | ½ level | ½ level |
| levels to repair that damage (50 hp = 1 level) | ~1 | **~0.16** |
| **net** | **≈ −½ level** | **≈ +⅓ level** |

So a captain who farmed correctly and won the fight came out **behind** where a captain who ignored
the fleet entirely would be. The feature's entire premise — *"my XP has a second faucet"* — was
inverted by its own damage numbers, and no amount of skill fixed it, because the loss was in the
exchange rate rather than in the execution.

**This retires the risk this amendment originally flagged.** The first draft recorded an accepted
inverse risk — that at 1 damage the small hull's gun might read as *no threat at all*. Eric answered
it directly and the answer is structural rather than reassuring: *"The fleets stick together as
fleets, they are a danger, and the players fighting over them amplify that."* The threat is
**numbers and contest**, not per-shot damage — nine hulls that travel together (amendment 35), a
witness rule that recruits the ones who saw you, and rival captains drawn to the same prey. A single
small hull was never meant to be the danger, so its shot reading as small is correct rather than
broken.

**The number that must stay in view when this is next retuned is the EXCHANGE RATE, not the dps:**
50 hp of repair costs one banked level, so any PvE damage profile has to be checked against what its
victims pay to undo it. That is the test amendment 33's original balance note failed to apply.

### The waves: 3/2/1 → 4/2/1 fleets, and they are now a RATIO

The level totals move 9/6/3 → **12/6/3**, and the cumulative match goes 54 hulls / 18 levels →
**63 hulls / 21 levels**. But the ruling's reasoning is the durable part, so it is recorded as the
rule rather than the numbers: **one fleet per ~5 captains, held constant as the storm thins the
field** — 20 captains / 4 fleets at 1:00, ~10 / 2 at 5:00, ~5 / 1 at 9:00, on Eric's stated
assumption that each ring stage takes roughly half the roster. **The level totals are the
consequence of that ratio, not the input to it**, which is the opposite of how amendment 33 framed
them, and anyone retuning waves should re-derive from the ratio.

**Two consequences named rather than discovered later:**

1. **PvE is now the largest single XP faucet on paper.** 21 levels exceeds the 19 levels of captain
   kills a full 20-player lobby can produce. Amendment 33 explicitly justified 18 as *"a third
   faucet rather than the dominant one"*, and that sentence no longer holds. It is contested and
   costs ~3.6 min/fleet to collect, so realised income is far below 21 — but the ceiling moved and
   the `pveKillsByClass` telemetry (amendment 44) is exactly what will show whether it matters.
2. **The ~5:1 ratio is tuned for a FULL lobby.** Wave sizes stay FIXED rather than roster-scaled at
   spawn time (amendment 33's ruling, unchanged), so a 6-captain match still gets 4 fleets at 1:00 —
   a ~1.5:1 ratio, deliberately target-rich. If the 50%-per-stage attrition assumption proves wrong
   in real matches, this is the knob that was reasoned from, and `pveKillsByClass` is the evidence.

`PROTOCOL_VERSION` is **unchanged**: both values are server-side simulation constants. The client
never computes a fleet hull's stats (`frames.ts` throws if a drone hull reaches `toOwnShip`) and
never reads `CONFIG.fleet`, so a stale bundle cannot mis-render either number.

## Amendment 46 — THE HOME TAGLINE BECOMES A POOL OF NAUTICAL PUNS (Eric rulings 2026-08-14)

Interstitial cycle 87 (0.17.87). The fixed home-wordmark tagline `LAST HULL FLOATING WINS`
(`client/src/ui/home.ts`) is replaced by a uniform draw from a frozen 20-entry pun pool
(`client/src/ui/taglines.ts`). Client-only DOM chrome on the pre-join menu; no `shared/` or
`server/` change; `PROTOCOL_VERSION` unchanged at 36.

**(a) Register is MIXED.** One pool holds both broad groaners (`SEAS THE DAY`, `PIER PRESSURE`) and
dry naval gallows wit (`THE SEA ALWAYS COLLECTS`, `DAMAGE CONTROL IS A MINDSET`), drawn from as a
single set rather than two separate rotations. Dry-wit-only and groaners-only were both offered and
not taken.

**(b) Cadence is PER RETURN TO PORT.** A new pun is drawn on mount and again on every return from a
match. Because `returnToPort()` is a full `location.reload()` (`client/src/main.ts:1422` →
`app/returnToPort.ts`), a pick made at `makeWordmark()` time satisfies this with no extra machinery
— fresh module state on every load already gives a fresh draw. A rotate-on-a-timer option was
**offered and declined**; this is recorded explicitly so a future contributor does not "improve" the
feature by adding motion to this slot (it would also open a new photosensitivity/attention-tier
question this ruling never authorized).

**(c) The win-condition line is FULLY REPLACED.** `LAST HULL FLOATING WINS` leaves the home page
entirely — it is not kept as a second line and does not join the pun rotation. Both alternatives
(keep-the-rule-add-a-line, and rule-joins-the-pool) were offered and declined. Note `results.ts`'s
win banner `LAST HULL FLOATING — YOU WON` is a different string on a different surface (the results
modal, not the home page) and is untouched by this ruling.

**CORRECTION OF RECORD, same cycle:** the option was put to Eric with the justification *"HOW TO
PLAY carries the rule now"*, and **that premise is FALSE**. The home page's HOW TO PLAY control
paints the stub `FIELD MANUAL ARRIVES IN A LATER REFIT` (`client/src/ui/home.ts`, `NOTE_HOWTO`) —
there is no field manual behind it. The consequence is that the win condition is now stated NOWHERE
a new player can read it: the only surviving statement is the results-modal banner, shown solely to
the player who already won. The ruling STANDS as given — Eric chose full replacement over both
alternatives, and the implementation enacts that faithfully — but it was taken on a false premise
and is worth re-putting on a corrected one. Surfaced by this cycle's Fable review gate, confirmed
against the code by the orchestrator, and ledgered in `deferred-work.md`. Whoever ships the field
manual should close this loop.

**(d) The pool is Eric-approved copy, verbatim.** The 20 strings are the owner's approved words, not
the implementer's, and may not be reworded, reordered, or extended without a new ruling. Two further
candidates were offered and **EXCLUDED** — `WHAT A LOAD OF SHIP` and `LET'S GET SHIPFACED` — named
here so a future contributor does not re-propose them.

**Length pin:** the pool carries a ≤28-character length cap protecting **epic-2** amendment 47's
container-fit law (the rigid ~668px port column) — the longest approved entry is 27 characters
against the old line's 23, so the slot gets slightly wider but not taller. *(The `epic-2` qualifier
was added when epic-5 amendment 47 below was written, so the cross-reference cannot be misread as a
same-file one. Nothing else in this amendment changed.)*

## Amendment 47 — STORIES 5.4 AND 5.5 ARE DEFERRED; THE SYSTEMS LAYER IS DECLARED COMPLETE (Eric ruling 2026-08-14)

> *"epic 5. 5-4 and 5-5 are deferred, i think other things are more important in order to get the
> beta ready. i have enough systems. retro time."*

**Story 5.4 (Fog Banks) and Story 5.5 (Whirlpools) are DEFERRED, not cancelled.** Their numbers stay
reserved and either may be revived by a later explicit ruling, exactly as Story 4.1 (The Listening
Ring) was deferred by epic-4 amendment 1. `sprint-status.yaml` carries both at status `deferred`
citing this amendment. **Epic 5 closes at 4 of 6 stories** (5-1, 5-2, 5-3, 5-6).

**This is a PHASE ruling, not only a scope one.** *"I have enough systems"* ends the mechanics arc
that has run since Epic 1. The work in front of the project is no longer new simulation behaviour;
it is whatever stands between the shipped build and a beta a stranger can play. Anyone proposing a
new mechanic from here needs a fresh ruling, and *"it was in the epic plan"* is no longer sufficient
grounds — this amendment is what that plan is measured against.

**What the two stories were carrying, recorded so a revival starts from the real state rather than
from the epics.md text:**

- **5.4 arrives with a MANDATORY re-derivation still owed.** Epic 4's retrospective raised it as that
  epic's single significant-discovery alert: the AC's *"radar may still paint me"* was written when
  radar was a binary LOS-gated blip, and Epic 4 replaced that with a physical return model (one
  reflectivity × falloff curve, height-aware shadows, server-rasterized hulls, a wake clutter
  corridor, a display-time near-range mask). There is **no fog term** in that model, epic-4
  amendment 108 already ruled that *"fog and rain are their own epic-scale feature"*, and cycle 72 is
  the governing precedent against AREA returns — a 1/d² area material *"would own half the scope
  late-match and bury every contact in it."* **A fog bank is an area material.** Whoever revives 5.4
  must re-derive that question with Eric before specifying it; the constraint survives this deferral
  intact.
- **5.5 arrives with an untested interaction and an open UX question.** UX open question #23 (the
  on-water feel treatment) was never designed. And wake is server-owned world state derived from
  pose, so a hull carried and rotated by a current should lay a curved wake for free — but **torpedo
  wake under a current has never been exercised.**

**What the deferral does NOT release.** Story 6.2 (Roster-Scaled Oceans) has an acceptance criterion
naming fog banks and whirlpool placements among the things both sides must rebuild deterministically
from the seed at any roster size. With neither feature built, that clause is **vacuous rather than
satisfied**, and 6.2 must not be read as having discharged it.

**Epic 5 is marked `done` on this ruling** — four landed stories plus two owner-deferred ones, which
is the same shape epic 4 closed in (11 landed, 4-1 deferred).
