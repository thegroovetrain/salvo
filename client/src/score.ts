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
  victimName: string;
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
}

export const FRESH_SCORE: ScoreState = {
  sunkContestants: [],
  sunkIds: [],
  placement: null,
  eliminated: false,
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
  return {
    ...state,
    sunkContestants: [...state.sunkContestants, obs.victimName],
    sunkIds: [...state.sunkIds, obs.victimId],
  };
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
