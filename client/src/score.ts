// The OWN personal score (Story 2.3, amendments 22/23) — what the elimination /
// results modal reports back to the player: how many upgrades you took, how many
// kills you got, which contestant-controlled ships you personally sank, and what
// place you were eliminated in (or that you won).
//
// CLIENT-DERIVED, no wire change. Everything here is assembled from data the
// client already legitimately holds:
//   • upgrades  — OwnShip.upg (self-private, already on every frame)
//   • kills     — the public roster's PlayerMeta.kills for the own session
//   • sunk list — the `sunk` events the kill feed already renders, filtered to
//                 kills credited to the own session and to non-drone victims
//   • placement — the public roster's alive count at the moment you went down
//                 (k contestants still floating ⇒ you placed k+1)
//
// BEST-EFFORT BY CONSTRUCTION (documented, not a defect): `sunk` events are
// LOS-gated by perception.ts, so a kill you never SAW (a mine, a torpedo run
// beyond your sight bubble) contributes to the authoritative roster tally but
// cannot contribute a NAME to the list. The tally is therefore the truth and the
// list is "the ones you watched go down" — closing that gap would need a wire
// change, which this story explicitly forbids.
//
// Pure functions over a plain state object; main.ts owns the single instance and
// resets it at every hard boundary (match start, return to port, reconnect).

/** One observed sinking, already resolved to display data by the caller. */
export interface SunkObservation {
  victimId: string;
  /** The victim's roster CALLSIGN, resolved at observation time, or null when
   *  the roster entry is already gone / not yet synced. Never a session id: a
   *  nameless victim is left OUT of the list (the tally still counts them)
   *  rather than shown as a raw id. */
  victimName: string | null;
  /** The credited killer's id, or null (storm / unattributed). */
  killerId: string | null;
  /** The victim is a drone (roster hue sentinel) — counts in the tally, never
   *  in the contestant list. */
  victimIsDrone: boolean;
}

/** The accumulator's state. */
export interface ScoreState {
  /** Display names of the CONTESTANT (non-drone) ships the player sank, in the
   *  order they went down. De-duplicated by victim id — a respawning drone-era
   *  victim can be sunk twice, and the list is a roll of hulls, not of events. */
  readonly sunkContestants: readonly string[];
  /** Victim ids already listed (the de-dup key for the above). */
  readonly sunkIds: readonly string[];
  /** Elimination placement (1 = best), or null while still in the fight. */
  readonly placement: number | null;
  /** True once the own hull has been eliminated in a live match. */
  readonly eliminated: boolean;
  /** True once the placement is FINAL — the roster has caught up with our own
   *  sinking, so the alive count it reports is server truth rather than a
   *  patch-lagged snapshot. Until then `refinePlacement` keeps converging. */
  readonly placementSettled: boolean;
}

export const FRESH_SCORE: ScoreState = {
  sunkContestants: [],
  sunkIds: [],
  placement: null,
  eliminated: false,
  placementSettled: false,
};

/** A fresh accumulator — used at match start, return to port, and reconnect. */
export function freshScore(): ScoreState {
  return FRESH_SCORE;
}

/**
 * Pure: fold one observed sinking into the score. Only a kill CREDITED to the
 * own session and landed on a non-drone hull adds a name; everything else
 * (someone else's kill, a storm death, a drone you sank, a hull already listed)
 * leaves the state untouched — returning the SAME object, so callers can use
 * identity to skip re-renders.
 */
export function recordSunk(state: ScoreState, obs: SunkObservation, ownId: string): ScoreState {
  if (obs.killerId !== ownId || obs.victimId === ownId) return state;
  if (obs.victimIsDrone || state.sunkIds.includes(obs.victimId)) return state;
  // A victim whose roster entry has already gone (they left the room between
  // the sinking and the event landing) has no CALLSIGN to show. The kill still
  // counts — the tally is the authoritative roster figure — but the LIST is a
  // roll of names, and a raw session id is never a name.
  if (obs.victimName === null) return state;
  return {
    ...state,
    sunkContestants: [...state.sunkContestants, obs.victimName],
    sunkIds: [...state.sunkIds, obs.victimId],
  };
}

/** The roster fields the placement scan reads (structural — the real one is a
 *  Colyseus PlayerMeta). */
export interface RosterEntry {
  id?: string;
  alive?: boolean;
  /** Regatta hue index, or the drone sentinel. */
  color?: number;
}

/**
 * Pure: does this roster entry count as a live RIVAL for placement? Drones do
 * NOT: they exist to fill empty slots so a solo captain still gets a battle
 * royale, the win check is human-gated, and the results table lists humans
 * only — a placement that counted them reported a number matching nothing else
 * the player is ever shown.
 */
export function isLiveRival(meta: RosterEntry, ownId: string, droneHue: number): boolean {
  return meta.alive === true && meta.id !== ownId && meta.color !== droneHue;
}

/**
 * Pure: may an own-sinking OPEN the elimination modal?
 *   • only in a live match — a ready-room sinking is a respawn, not an
 *     elimination;
 *   • never once the GAME-END results are up (`resultsFinal`). When the winner's
 *     own shot kills the last rival, the server broadcasts `results` BEFORE the
 *     frame carrying that player's own `sunk` — and the schema still reads
 *     'active' at that moment — so an ungated own-sunk tore the final placement
 *     table down and replaced it with a live elimination modal offering SPECTATE
 *     into a match that had already ended;
 *   • never twice — the elimination latch is one-way, so a duplicate/replayed
 *     `sunk` can't re-open a modal the player already dismissed.
 */
export function canOpenElimination(phase: string, resultsFinal: boolean, alreadyEliminated: boolean): boolean {
  return phase === 'active' && !resultsFinal && !alreadyEliminated;
}

/**
 * Pure: the placement a player who is eliminated RIGHT NOW earns, given how many
 * OTHER contestants are still floating. With k rivals still afloat the best you
 * can finish is behind all of them, so you place k + 1 (everyone alive at your
 * death outlives you). Clamped at 1 — a defensive floor for a roster that has
 * not caught up with the sinking yet.
 */
export function placementFor(othersAlive: number): number {
  return Math.max(1, othersAlive + 1);
}

/** Pure: latch the own elimination (idempotent — the first sinking wins, so a
 *  late duplicate `sunk` can never rewrite a recorded placement). */
export function recordElimination(state: ScoreState, othersAlive: number): ScoreState {
  if (state.eliminated) return state;
  return { ...state, eliminated: true, placement: placementFor(othersAlive) };
}

/**
 * Pure: converge a PROVISIONAL placement onto server truth while the roster is
 * still catching up. Two races make the placement recorded at `sunk` time too
 * HIGH, and both resolve in the very next roster patches:
 *   • multi-death tick — a rival who went down in the same server tick is still
 *     flagged alive in the roster snapshot we read;
 *   • patch lag — the roster hasn't applied our own sinking yet either.
 *
 * `rosterSettled` is exactly "the roster has applied OUR OWN sinking". Until it
 * does we keep re-deriving the placement from the live alive count; the moment
 * it does, this run is the last one and the placement FREEZES — so later
 * eliminations (rivals dying after us) can never keep dragging our number down.
 */
export function refinePlacement(state: ScoreState, othersAlive: number, rosterSettled: boolean): ScoreState {
  if (!state.eliminated || state.placementSettled) return state;
  const placement = placementFor(othersAlive);
  if (placement === state.placement && !rosterSettled) return state;
  return { ...state, placement, placementSettled: rosterSettled };
}

/**
 * Pure: the accumulator to carry across a RECONNECT. The outage may have
 * swallowed `sunk` events, so the observed-kill roll can no longer be trusted
 * and starts clean rather than reporting a wrong list — but the elimination
 * LATCH and the placement it recorded are ours, were derived before the drop,
 * and must survive (losing them re-opened the elimination modal on the next
 * duplicate `sunk` and reset a finished player to "still in the fight").
 */
export function scoreAfterReconnect(state: ScoreState): ScoreState {
  return {
    ...FRESH_SCORE,
    eliminated: state.eliminated,
    placement: state.placement,
    placementSettled: state.placementSettled,
  };
}

/** Everything the results modal renders about the local player. */
export interface PersonalScore {
  /** Total upgrades taken this match (the sum of OwnShip.upg). */
  upgrades: number;
  /** Kills, DRONES INCLUDED (the authoritative public roster tally). */
  kills: number;
  /** Contestant ships personally sunk — drones excluded (see the module note). */
  sunkContestants: readonly string[];
  /** Elimination placement, or null when the player is the winner. */
  placement: number | null;
  /** The player won (never eliminated / placed first). */
  winner: boolean;
}

/** Pure: total upgrades taken, from the per-upgrade counts on OwnShip.upg. */
export function upgradeCount(upg: readonly number[] | undefined): number {
  return (upg ?? []).reduce((n, c) => n + (Number.isFinite(c) ? c : 0), 0);
}

/**
 * Pure: assemble the modal's view of the local player. `winner` wins over any
 * recorded placement — a player who was never eliminated (or who is credited the
 * win after a mutual destruction) gets the winner indication, not a number.
 */
export function personalScore(state: ScoreState, upg: readonly number[] | undefined, kills: number, winner: boolean): PersonalScore {
  return {
    upgrades: upgradeCount(upg),
    kills: Math.max(0, Math.round(kills)),
    sunkContestants: state.sunkContestants,
    placement: winner ? null : state.placement,
    winner,
  };
}

/** The only fields the game-end score needs off a ResultsMsg (structural, so
 *  this module stays free of the wire types). */
export interface ResultsFacts {
  winnerId: string;
  rows: readonly { id: string; placement: number; kills: number }[];
}

/**
 * Pure: the personal score for the GAME-END modal, derived from the RESULTS
 * MESSAGE itself rather than the polled room schema.
 *
 * This is the anti-desync rule for the debrief: the `results` broadcast is the
 * server's final word and it arrives BEFORE the schema patch that sets
 * `winnerId` / flips the roster's alive flags. Reading the schema here made the
 * actual winner read their own row as "ELIMINATED — PLACE #n" under a VICTORY
 * banner for as long as the patch took to land. Winner, placement and kills all
 * come from the message; the roster kill tally is only a fallback for a client
 * that somehow has no row of its own.
 */
export function personalScoreFromResults(
  state: ScoreState,
  upg: readonly number[] | undefined,
  msg: ResultsFacts,
  ownId: string,
  fallbackKills: number,
): PersonalScore {
  const row = msg.rows.find((r) => r.id === ownId);
  const winner = msg.winnerId === ownId;
  return {
    upgrades: upgradeCount(upg),
    kills: Math.max(0, Math.round(row?.kills ?? fallbackKills)),
    sunkContestants: state.sunkContestants,
    placement: winner ? null : row?.placement ?? state.placement,
    winner,
  };
}
