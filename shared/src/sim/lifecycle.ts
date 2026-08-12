// Ship lifecycle — THE one representation of a hull's life and death (Story
// 5.1). `ShipRecord.alive: boolean` is REPLACED by this union, not shadowed
// (amendment 2): a derived `alive` mirror would be two representations of one
// truth, the exact desync class effectiveStats() exists to prevent, and a
// "temporary" compatibility accessor is never deleted.
//
// A boolean can express "afloat / not afloat" and nothing else. The states a
// hull actually passes through carry TIME — when the water started winning
// (`sinking.since`, Story 5.2's five-second window) and when it stopped
// (`sunk.at`) — and the legal moves between them are a small fixed table, not
// an assignment any caller may make. Both live here: the union, and the ONE
// function that validates a move across it.
//
// `sinking` was DECLARED-ONLY in Story 5.1 (amendment 1); Story 5.2 makes it
// REACHABLE — a flat CONFIG.ship.sinkingWindowMs (5000 ms) beat between 0 HP
// and the bottom, all bookkeeping unmoved at sink-entry (amendment 11). The
// window's decel cap and founder-deadline math live in sim/sinking.ts; the
// three seams it re-opens are enumerated on isSinking() below.
//
// Pure and I/O-free like every shared/ sim module: no clock, no RNG. Every
// timestamp arrives as a parameter, from the server's single World clock
// (world.ts `this.now`) — so a lifecycle is a plain, structurally-comparable
// object that serializes, snapshots and diffs identically on both sides.
//
// ON the wire since Story 5.2 (amendment 16, PV 34) — but only for YOURSELF:
// `OwnShip.alive` and `PlayerMeta.alive` stay booleans projected from
// isAfloat() (so `alive` goes false the instant the hull starts sinking —
// correct for AFLOAT and the register), and the optional self-private
// `OwnShip.sinkingUntil` deadline is the sole disclosure of the window. It
// rides `you` and NOTHING else — no enemy-facing sinking channel exists.

/**
 * A hull's life state. Discriminated on `kind` — exhaustive, so a future state
 * is a compile error at every consumer that switches on it rather than a
 * silently-false boolean.
 *
 * - `alive`   — afloat and fighting. Payload-free, so it is a shared frozen
 *               singleton (LIFECYCLE_ALIVE) rather than an allocation per hull.
 * - `sinking` — going down, `since` the server-ms the sink began (Story 5.2's
 *               window start). UNREACHABLE from the sim in Story 5.1.
 * - `sunk`    — on the bottom, `at` the server-ms it foundered.
 */
export type ShipLifecycle =
  | { readonly kind: 'alive' }
  | { readonly kind: 'sinking'; readonly since: number }
  | { readonly kind: 'sunk'; readonly at: number };

/** The discriminant's value set — `ShipLifecycle['kind']`, named for tables. */
export type LifecycleKind = ShipLifecycle['kind'];

/**
 * The named edges of the state machine. Every life/death mutation in the sim
 * names one of these; there is no untyped assignment path.
 *
 * - `sink`        — `alive -> sinking`. Story 5.2's entry into the window.
 * - `founder`     — `sinking -> sunk`. The window's expiry.
 * - `sinkInstant` — `alive -> sunk` DIRECTLY, skipping `sinking`. This edge
 *                   exists because amendment 1 keeps sinking instantaneous in
 *                   Story 5.1: world.ts sinkShip() takes it, and its guard
 *                   (`if (!ship || !isAfloat(...)) return;`) is the SOLE
 *                   idempotency lock preventing a duplicate `sunk` event.
 *                   Splitting that one transition into sink+founder is
 *                   precisely how the event gets emitted twice (double kill
 *                   credit, double bounty recompute, double recordSink on the
 *                   client) or not at all. Exactly one `sunk` emission at
 *                   exactly one transition — so the direct edge is named, kept
 *                   and tested rather than faked as two.
 * - `heal`        — `sinking -> alive`. RESERVED (amendment 3): legal today,
 *                   performed by nothing in the sim until Story 5.2+ ships
 *                   damage control's save. Covered by a transition test.
 * - `redeploy`    — `any -> alive`. The three edges that actually put a hull
 *                   back in the water today: creation (world.ts addShip),
 *                   match-start reset (redeployShip, production-reachable on
 *                   EVERY match at the countdown->active boundary) and respawn
 *                   (processRespawns, ready-room only).
 *
 * `heal` and `redeploy` are deliberately NOT collapsed into one generic
 * "anything may return to alive" edge (amendment 3). Under a single edge the
 * statement "`sinking -> alive` is reserved for a future heal" stops describing
 * anything: a heal is a hull SAVED mid-sink keeping its build, hp and position,
 * and a redeploy is a hull rebuilt on the spawn ring. Same destination, nothing
 * else in common.
 */
export type LifecycleEdge = 'sink' | 'founder' | 'sinkInstant' | 'heal' | 'redeploy';

/**
 * The one `alive` value. Frozen and shared: the state is payload-free, so
 * every afloat hull may point at the same object (the NO_BOONS idiom) and
 * `lc === LIFECYCLE_ALIVE` is a legal fast path — though consumers should
 * still read `kind`/isAfloat(), never identity, since a decoded/cloned
 * lifecycle is structurally equal but not the same reference.
 */
export const LIFECYCLE_ALIVE: ShipLifecycle = Object.freeze({ kind: 'alive' as const });

/** A hull going down since `since` (server-clock ms). Story 5.2's window. */
export function sinkingSince(since: number): ShipLifecycle {
  return Object.freeze({ kind: 'sinking' as const, since });
}

/** A hull on the bottom as of `at` (server-clock ms). */
export function sunkAt(at: number): ShipLifecycle {
  return Object.freeze({ kind: 'sunk' as const, at });
}

/**
 * Does this hull COUNT AS AFLOAT — a live combatant the sim damages, steers,
 * arms and counts toward the win?
 *
 * `alive` only — RULED PERMANENT by Story 5.2 (amendment 15). The pre-answer
 * plan was to widen this to include `sinking` and subtract exceptions; Eric's
 * rulings removed its foundation. The kill lands immediately (amendment 11),
 * damage on a sinking hull is a no-op (amendment 12) and the outcome is
 * decided at sink-entry (amendment 14) — so the win check, damage, roster/
 * AFLOAT, XP, repairs, refit and respawn ALL want this shipped answer: a
 * sinking hull is dead for every bookkeeping purpose. Widening would have made
 * "sinking counts as alive" the silent default inherited by every FUTURE call
 * site added to the sim — the wrong default for a hull that is, in every sense
 * the bookkeeping cares about, dead. The window re-opens exactly three named
 * seams via isSinking() below instead; NOT ONE call site of this predicate
 * moved when 5.2 landed, and that is a load-bearing invariant, not an
 * incidental (it is pinned by test).
 */
export function isAfloat(lc: ShipLifecycle): boolean {
  return lc.kind === 'alive';
}

/**
 * Is this hull IN THE SINKING WINDOW — going down, not yet on the bottom?
 *
 * This predicate exists FOR the three seams Story 5.2 re-opens (amendment 15),
 * and nothing else. A sinking hull is dead to every bookkeeping question (see
 * isAfloat above), and exactly three things come back to life for the window,
 * each by an explicit isSinking()-aware check at a named seam:
 *
 *   1. MOTION — it still steers (helm accepted, speed decaying through the
 *      sim/sinking.ts cap), still pushes out of islands, still lays wake.
 *   2. WEAPONS / EQUIPMENT / HORN — all seven registry rows and the foghorn
 *      stay live (amendment 10's fitment criterion: "it is in a ship equipment
 *      slot so it meets criteria for usability"). The REFIT — upgrade menu,
 *      picks, heal — is what closes, on its own code path ("once sinking,
 *      you're done").
 *   3. PERCEIVABILITY — still a contact and still a blip under the normal
 *      sight/radar rules: still a participant, still a target.
 *
 * Deliberately NOT expressed as `!isAfloat(lc) && !isSunk(lc)` at call sites:
 * each re-opened seam must read as a positive, greppable question ("is it
 * sinking?") so the re-openings stay additive and enumerable — and a future
 * fourth lifecycle state would silently satisfy the compound negation while
 * never satisfying this.
 */
export function isSinking(lc: ShipLifecycle): boolean {
  return lc.kind === 'sinking';
}

/**
 * Is this hull on the bottom — the TERMINAL state, the one that arms
 * `respawnAt` and ends a life?
 *
 * Deliberately NOT `!isAfloat(lc)`: today the two are exact complements
 * because `sinking` is unreachable, but they answer different questions and
 * will diverge the moment 5.2 lands. Callers that mean "not fighting" want
 * `!isAfloat`; callers that mean "this life is over" want this.
 */
export function isSunk(lc: ShipLifecycle): boolean {
  return lc.kind === 'sunk';
}

/**
 * THE transition table — the single source of truth for what is legal, read by
 * canTransition() and therefore by transitionLifecycle(). Every edge lists the
 * states it may be taken FROM; the destination is TARGET_KIND below.
 *
 * Pinned by a table-identity test (the shipClasses / STEP_ORDER pattern), so
 * loosening an edge is a deliberate, reviewed edit rather than an incidental
 * one — this table is what stops a hull sinking twice, healing from the
 * bottom, or being redeployed into a state nothing reset.
 */
const LEGAL_FROM: Readonly<Record<LifecycleEdge, readonly LifecycleKind[]>> = Object.freeze({
  sink: ['alive'],
  founder: ['sinking'],
  // The instantaneous path (amendment 1) — alive only, exactly like `sink`,
  // so the idempotency guard is identical whichever one the sim takes.
  sinkInstant: ['alive'],
  // RESERVED: legal, unreachable until Story 5.2+ (amendment 3).
  heal: ['sinking'],
  // `any -> alive`. `sunk -> alive` is the respawn edge: production-unreachable
  // in a live match (damageEnabled and respawnEnabled are mutually exclusive by
  // construction, match.ts:374-375) but driven directly by 10+ server test
  // files against standalone Worlds, which default both flags true. A table
  // rejecting it fails those tests (amendment 3). `alive -> alive` is the
  // match-start redeploy of a hull that never died — the common case.
  redeploy: ['alive', 'sinking', 'sunk'],
});

/** Where each edge lands. Split from LEGAL_FROM so the legality question and
 *  the destination question are each answered in exactly one place. */
const TARGET_KIND: Readonly<Record<LifecycleEdge, LifecycleKind>> = Object.freeze({
  sink: 'sinking',
  founder: 'sunk',
  sinkInstant: 'sunk',
  heal: 'alive',
  redeploy: 'alive',
});

/**
 * Is `edge` legal from `from`? The read-only half of the machine, for callers
 * that must branch rather than commit (and for the transition tests). Shares
 * LEGAL_FROM with transitionLifecycle(), so there is no second rule set that
 * can drift from the enforced one.
 */
export function canTransition(from: ShipLifecycle, edge: LifecycleEdge): boolean {
  return LEGAL_FROM[edge].includes(from.kind);
}

/**
 * Take `edge` from `from`, returning the new lifecycle. `atMs` is the
 * server-clock timestamp stamped onto the destination when it carries one
 * (`sinking.since`, `sunk.at`); the two `-> alive` edges ignore it.
 *
 * THROWS on an illegal transition — the deliberate failure mode. This is a sim
 * INVARIANT, not user input: nothing a client sends reaches this function
 * (inputs.ts is the only path player intent enters the sim, and it silently
 * drops malformed messages there). A silent no-op here would hide exactly the
 * class of bug this module exists to prevent — a second sink on an
 * already-sunk hull returning quietly is indistinguishable from a first one,
 * and the duplicate `sunk` event it implies is the failure amendment 1 is
 * written about. Callers that legitimately expect either answer ask
 * canTransition() first; the sim's guards (sinkShip's `isAfloat` early-return,
 * processRespawns' liveness filter) already do.
 *
 * This is the ONE place a transition is validated. No consumer may construct a
 * destination state directly off a life/death event — the constructors above
 * exist for spawn-time initialization and tests, not for mutation.
 */
export function transitionLifecycle(
  from: ShipLifecycle,
  edge: LifecycleEdge,
  atMs: number,
): ShipLifecycle {
  if (!canTransition(from, edge)) {
    throw new Error(`illegal ship lifecycle transition: ${edge} from ${from.kind}`);
  }
  const to = TARGET_KIND[edge];
  if (to === 'alive') return LIFECYCLE_ALIVE;
  return to === 'sinking' ? sinkingSince(atMs) : sunkAt(atMs);
}
