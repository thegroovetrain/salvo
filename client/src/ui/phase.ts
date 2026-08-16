// Match-phase → HUD text mapping — pure (no Pixi/DOM), unit-tested. The
// renderer polls the public schema (matchPhase/countdownEndT/roster size) and
// feeds it through matchUx() every frame; the HUD diffs the strings.

/** What the phase layer of the HUD shows this frame. */
export interface MatchUx {
  /** Top-center status line ('' when the phase needs none). */
  topLine: string;
  /** Small tag under the status line ('ALL STATIONS LOCKED' at the start line,
   *  'WEAPONS SAFE' in the dev/sandbox ready room). */
  tag: string;
  /** Big center countdown text ('' unless counting down). */
  countdown: string;
}

const NONE: MatchUx = { topLine: '', tag: '', countdown: '' };

/**
 * THE HELD START LINE (Story 6.1, epic-6 amendment 8, Eric ruling 2026-08-14):
 * *"drop everyone into their start location on the map, with movement/weapons
 * locked and radar off. Once everyone is loaded, the 10 second countdown
 * begins."*
 *
 * True for every pre-live phase the QUEUE puts a captain through — `waiting`
 * (boarding: seated at spawn, holding for the last loader) and `countdown` — so
 * the client's helm, trigger and scope present the same locks the server is
 * applying, from drop until `active`.
 *
 * `gathering` is deliberately NOT held: amendment 2 retired that phase from
 * production (`joinWindow: 0`) and amendment 8 leaves the sailable weapons-safe
 * ready room standing as *"the dev/sandbox door's behaviour only"* — that door
 * is the one place it is still reachable.
 *
 * The client is a MIRROR here, never an authority: the server owns every lock
 * (match.ts's phase-derived world gates), and this predicate exists so nothing
 * on screen contradicts them — a helm that answered locally would rubber-band
 * against the next frame, and a denied pulse would blame the player for a door
 * the match itself is holding shut.
 */
export function heldAtStartLine(phase: string): boolean {
  return phase === 'waiting' || phase === 'countdown';
}

/** Seconds (ceil, floored at 0) until a server-time deadline. */
export function secondsUntil(deadlineT: number, serverNow: number): number {
  return Math.max(0, Math.ceil((deadlineT - serverNow) / 1000));
}

/**
 * Map the public match plane to HUD strings. `humans` is the roster size;
 * `countdownEndT`/`serverNow` are server ms (same clock as frames).
 */
export function matchUx(
  phase: string,
  humans: number,
  countdownEndT: number,
  serverNow: number,
): MatchUx {
  if (phase === 'waiting') {
    // BOARDING (Story 6.1, amendment 8). The old `AWAITING CAPTAINS n/2` copy
    // described the retired ready room — a lobby filling up while you sailed
    // around it. The queue owns the wait now, so by the time this line is on
    // screen the roster is already formed and every captain is loading into a
    // spawn slot: the honest report is who is aboard, not how many are still
    // needed. NO DENOMINATOR, for the same reason the gathering branch below
    // has none — `expectedCaptains` is the queue's number and never reaches the
    // client, so any denominator here would be a guess.
    //
    // The tag names the LOCKS rather than the damage rule: at the start line
    // the helm, the trigger and the scope are all held (heldAtStartLine), which
    // is strictly more than the `WEAPONS SAFE` the ready room meant.
    return {
      topLine: `CAPTAINS BOARDING — ${humans} ABOARD`,
      tag: 'ALL STATIONS LOCKED',
      countdown: '',
    };
  }
  if (phase === 'gathering') {
    // Join window (draft copy): the room is still open — countdownEndT here is
    // the GATHERING deadline (the phase string disambiguates the shared field).
    // No denominator: fillTo counts drones too, so "n/20" would read as a
    // failed gather right before 20 hulls deploy anyway.
    return {
      topLine: `GATHERING CAPTAINS — ${humans} ABOARD`,
      tag: 'WEAPONS SAFE',
      countdown: String(secondsUntil(countdownEndT, serverNow)),
    };
  }
  if (phase === 'countdown') {
    // MATCH STARTING + the big centre count are unchanged (the shipped
    // countdown presentation). Only the TAG moves, and it has to: the countdown
    // is held exactly as boarding is (heldAtStartLine covers both), so a tag
    // that softened from LOCKED back to WEAPONS SAFE at the 0:10 mark would
    // read as the moment the helm came back — the opposite of what happens.
    return {
      topLine: 'MATCH STARTING',
      tag: 'ALL STATIONS LOCKED',
      countdown: String(secondsUntil(countdownEndT, serverNow)),
    };
  }
  return NONE; // active (normal HUD) and finished (results overlay owns the screen)
}

/**
 * Spectator banner text. `winnerId` comes straight off the public schema
 * (ArenaState.winnerId — set once `finished`); per match.ts, "finished" only
 * happens once alive human hulls <= 1, so a winnerId match is the single
 * reliable "you didn't sink" signal (works for both an outright survivor and
 * the posthumous mutual-destruction winner). Dead-in-active (phase not yet
 * 'finished') always reads as a plain sinking.
 *
 * THE DRAW CASE (Story 6.3, epic-6 amendment 14). A finished match with an
 * EMPTY `winnerId` is a draw — every remaining captain sank on the same tick
 * (Story 5.2, epic-5 amendment 14) — and it shipped reading `MATCH OVER —
 * SPECTATING`, identical to watching somebody else win. It is tested FIRST, for
 * the same reason `results.ts` winnerBanner tests it first: a session id that is
 * somehow also empty (no session, a torn-down room) would otherwise match the
 * empty winner and claim a victory nobody won. The pre-`finished` guard above
 * is what makes the empty read unambiguous here — `winnerId` is `''` for the
 * whole match until the outcome latches.
 */
export function spectateBannerText(phase: string, winnerId: string, sessionId: string): string {
  if (phase !== 'finished') return 'SUNK — SPECTATING';
  if (winnerId === '') return 'DRAW — SPECTATING';
  return winnerId === sessionId ? 'VICTORY — AWAITING RESULTS' : 'MATCH OVER — SPECTATING';
}
