// The OWN personal score (Story 2.3, amendments 22/23) — what the elimination /
// results modal reports back to the player: how many BOONS you fitted, how many
// kills you got, which contestant-controlled ships you personally sank, and what
// place you were eliminated in (or that you won).
//
// CLIENT-DERIVED, no wire change. Everything here is assembled from data the
// client already legitimately holds:
//   • boons     — OwnShip.boons.length (self-private, already on every frame).
//                 Story 2.8: the legacy `upg` counts died with the 14 upgrades;
//                 the number the player experienced as PICKS is the fitted-boon
//                 count, so score continuity holds (spec 2.8 Design Notes).
//   • kills     — the public roster's PlayerMeta.kills for the own session
//                 (captains only since Story 5.6 — the server stopped counting
//                 PvE sinkings there, amendment 38, so the client filters
//                 nothing)
//   • sunk list — the `sunk` events the kill feed already renders, filtered to
//                 kills credited to the own session and to non-drone victims
//   • placement — the public roster's alive count at the moment you went down
//                 (k contestants still floating ⇒ you placed k+1)
//
// COMPLETE WHILE CONNECTED (the public register, PV 23): `sunk` delivery was
// historically LOS-gated, so a kill you never SAW was missing a NAME here. The
// sunk row now always delivers YOUR OWN kills (the credited-killer clause,
// amendment 17's principle) and every human captain's sinking besides, so a
// mine trip or a torpedo run beyond your sight bubble reaches recordSunk like
// any other kill. Two deliberate exceptions keep the NAME roll narrower than
// the authoritative roster tally: a RECONNECT wipes the roll
// (scoreAfterReconnect — the outage may have swallowed `sunk` events, and a
// clean list beats a wrong one), and a victim whose roster entry is already
// gone has no callsign and is left OFF the list (recordSunk). In both cases
// the kill COUNT stays the roster's authoritative figure.
//
// THE MATCH LOG (Story 5.3, amendment 28) — *"I'd like to know at what game time
// I got the kills I got."* A second, chronological view of the same fold: every
// kill of ours that we can NAME, plus our own death, each stamped with the match
// clock. Eric chose a separate block over stamping the roll above, and his
// chosen composition includes his own death line, so the log is the player's
// whole match rather than only their kills. Still zero wire (PROTOCOL_VERSION
// stays 34): T+ is `serverNow − zoneStartT`, the exact derivation the BR chrome
// bar has used since Story 3.3, and the client already learns the moment each of
// its own kills and its own death landed.
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
  /**
   * The victim is a PvE fleet hull.
   *
   * RESOLVED FROM `Contact.cls` (via render/ships.ts `isDroneHull`), NOT from a
   * roster hue: Story 5.6 took fleet ships off the roster entirely (amendment
   * 39), which deleted the `REGATTA_NO_HUE` sentinel as a drone channel and left
   * the hull id as the only one. See main.ts `isDroneId`.
   *
   * It now excludes the victim from EVERY record — the roll below and the MATCH
   * LOG alike (amendment 38: *"i dont want PvE kills to show up as 'kills' in a
   * player's killcount or as events in their records"*). It used to exclude them
   * from the roll only.
   */
  victimIsDrone: boolean;
  /** MATCH TIME (T+, ms) at which this sinking was observed — `matchTimeMs()`
   *  of the caller's clock, so a timeline that is not anchored yet reads null
   *  (see matchTimeMs). A sinking with no stamp earns no MATCH LOG line: the
   *  log's whole content is WHEN something happened, and a line that cannot say
   *  when is not a line. */
  tMs: number | null;
  /** The credited killer's roster CALLSIGN, or null (storm death, or a killer
   *  whose roster entry is already gone). Only ever read for OUR OWN death line
   *  — see killerLabel for the two null cases, which are NOT the same thing. */
  killerName: string | null;
}

/** The MATCH LOG's stand-in for a sinking with NO credited killer — the storm,
 *  or any unattributed loss. The kill feed spells this case *"LOST WITH ALL
 *  HANDS"*; the log's line grammar is `SUNK BY <name>`, so the spec ratifies
 *  `SUNK BY THE STORM` here instead (spec 5.3 I/O matrix). */
export const STORM_KILLER = 'THE STORM';

/** The MATCH LOG's stand-in for a killer who HAD an id but whose roster entry is
 *  already gone (they left the room between the sinking and the event landing).
 *  Deliberately NOT `STORM_KILLER`: something sank us and saying otherwise is a
 *  lie about our own death. The copy mirrors the kill feed's `UNKNOWN_VESSEL`
 *  for the identical case; it is duplicated rather than imported because this
 *  module is a pure leaf and killFeed.ts is a DOM adapter. */
export const UNKNOWN_KILLER = 'UNKNOWN VESSEL';

/** One MATCH LOG line: when it happened, which side of the exchange we were on,
 *  and the other hull's name. Never a session id (see `name`). */
export interface MatchLogEntry {
  /** Match time in ms (T+), floored to whole seconds only at RENDER time — the
   *  data keeps full resolution so a future finer readout costs no re-derivation. */
  readonly tMs: number;
  /** `sank` — we sank them; `sunkBy` — they (or the storm) sank us. */
  readonly kind: 'sank' | 'sunkBy';
  /** The other hull's display name. For `sank` this is always a resolved roster
   *  callsign (an unnameable kill contributes NO line at all — see
   *  matchLogLine); for `sunkBy` it may be one of the two stand-ins above. */
  readonly name: string;
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
  /** THE MATCH LOG (amendment 28), in CHRONOLOGICAL order — which is simply
   *  arrival order: every entry is stamped with the match clock at the moment
   *  its event was observed, and that clock only runs forward, so appending is
   *  sorting. (The one case worth naming: a kill scored during our own
   *  five-second sinking window (Story 5.2, amendment 11 — you go down
   *  SHOOTING) lands AFTER our own death line, and that is the truth of what
   *  happened rather than a mis-ordering.) */
  readonly matchLog: readonly MatchLogEntry[];
  /** Victim ids already LOGGED — the log's own de-dup key, deliberately
   *  separate from `sunkIds` above because the two lists still admit different
   *  events (the log takes our own death; the roll takes neither that nor a
   *  drone, and since amendment 38 the log takes no drone either).
   *  A hull sinks at most once per live match — respawns are ready-room-only
   *  (`respawnArmedIn`) and the accumulator is reset on the → active edge — so
   *  this can only ever swallow a DUPLICATE/replayed `sunk`, never a second
   *  genuine sinking. */
  readonly loggedIds: readonly string[];
  /** Match time (T+, ms) at which OUR OWN hull was sunk, or null while we are
   *  still afloat. Latched first-wins like the elimination itself, so a replayed
   *  `sunk` can never move TIME AFLOAT. This is SINK-ENTRY, not founder — see
   *  afloatMsFor. */
  readonly sunkAtMs: number | null;
}

export const FRESH_SCORE: ScoreState = {
  sunkContestants: [],
  sunkIds: [],
  placement: null,
  eliminated: false,
  placementSettled: false,
  matchLog: [],
  loggedIds: [],
  sunkAtMs: null,
};

/** A fresh accumulator — used at match start, return to port, and reconnect. */
export function freshScore(): ScoreState {
  return FRESH_SCORE;
}

/**
 * Pure: MATCH TIME (T+, ms) from the server clock, or null when the timeline is
 * NOT ANCHORED. `zoneStartT` is 0 until the match goes active (main.ts's
 * `barVisible` gate leans on exactly this), and `serverNow − 0` is the server's
 * whole uptime rather than a match clock — so the unanchored case is reported as
 * ABSENT rather than as a wrong number, and every consumer here (`SunkObservation.tMs`,
 * TIME AFLOAT) is null-typed so it has to decide what to do about it.
 *
 * Clamped at 0: a frame sampled a millisecond before the anchor lands must not
 * produce a negative match clock.
 */
export function matchTimeMs(serverNow: number, zoneStartT: number): number | null {
  if (!Number.isFinite(serverNow) || !Number.isFinite(zoneStartT) || zoneStartT <= 0) return null;
  return Math.max(0, serverNow - zoneStartT);
}

/** The name our own death line credits. The TWO null cases are different facts
 *  and get different copy: no killer id at all is the storm/unattributed loss,
 *  while an id we cannot resolve to a callsign is a departed captain. */
function killerLabel(obs: SunkObservation): string {
  if (obs.killerId === null) return STORM_KILLER;
  return obs.killerName ?? UNKNOWN_KILLER;
}

/**
 * Pure: the MATCH LOG line an observed sinking earns the LOCAL player, or null
 * when it earns none (someone else's kill, an unstamped ready-room sinking, or
 * a kill we cannot name).
 *
 * OUR OWN DEATH WINS OVER EVERYTHING — the victim test runs first, so a hull we
 * somehow sank ourselves reads as the death it was, not as a kill.
 *
 * DRONES ARE OUT — and this REVERSES the rule this function shipped with.
 * Story 5.3 admitted drone kills to the log on the argument that the adjacent
 * KILLS tile was the roster's drone-INCLUSIVE tally, so dropping them would show
 * one line beside a tile reading 3. Story 5.6's amendment 38 removed the other
 * half of that pair: a PvE sinking no longer increments `kills` anywhere, so the
 * two now AGREE BY EXCLUSION rather than by inclusion, and the disagreement the
 * old rule was avoiding cannot arise. Eric: *"i dont want PvE kills to show up
 * as 'kills' in a player's killcount or as events in their records."* The feed
 * line, the kill flash, the settle and the XP all survive (amendment 21 exists
 * precisely because drones dying silently read as a bug); what empties is the
 * persistent record, which is what he means by *records*.
 *
 * OUR OWN DEATH IS NEVER DROPPED BY THIS CLAUSE — the victim test above runs
 * first, so a captain sunk BY a fleet ship still gets their `SUNK BY` line.
 *
 * An unnameable kill contributes NO line rather than a blank or an id (the
 * shipped roll's rule, inherited verbatim — deferred-work.md:211-212 tracks the
 * underlying LOS limitation and it is NOT fixed here).
 */
export function matchLogLine(obs: SunkObservation, ownId: string): MatchLogEntry | null {
  if (obs.tMs === null) return null;
  if (obs.victimId === ownId) return { tMs: obs.tMs, kind: 'sunkBy', name: killerLabel(obs) };
  if (obs.killerId !== ownId || obs.victimIsDrone || obs.victimName === null) return null;
  return { tMs: obs.tMs, kind: 'sank', name: obs.victimName };
}

/** Pure: fold one observed sinking into the MATCH LOG (and latch our own sink
 *  time with it). Same identity discipline as the roll — an event that earns no
 *  line returns the SAME object. */
function recordMatchLog(state: ScoreState, obs: SunkObservation, ownId: string): ScoreState {
  if (state.loggedIds.includes(obs.victimId)) return state;
  const entry = matchLogLine(obs, ownId);
  if (entry === null) return state;
  return {
    ...state,
    matchLog: [...state.matchLog, entry],
    loggedIds: [...state.loggedIds, obs.victimId],
    // First-wins, exactly as recordElimination latches the placement: the
    // outcome is decided the instant the hull hits 0 (amendment 14).
    sunkAtMs: obs.victimId === ownId && state.sunkAtMs === null ? entry.tMs : state.sunkAtMs,
  };
}

/**
 * Pure: fold one observed sinking into the score. Only a kill CREDITED to the
 * own session and landed on a non-drone hull adds a name; everything else
 * (someone else's kill, a storm death, a drone you sank, a hull already listed)
 * leaves the state untouched — returning the SAME object, so callers can use
 * identity to skip re-renders.
 *
 * The MATCH LOG folds FIRST and on a slightly wider admission (amendment 28): it
 * takes our own death, which the roll drops. It NO LONGER takes drone kills —
 * amendment 38 emptied every persistent record of them — so the two folds now
 * differ on exactly one event class instead of two. They share this one call
 * site so main.ts keeps a single entry point per observed sinking and the two
 * lists can never disagree about which events arrived.
 */
export function recordSunk(state: ScoreState, obs: SunkObservation, ownId: string): ScoreState {
  const logged = recordMatchLog(state, obs, ownId);
  if (obs.killerId !== ownId || obs.victimId === ownId) return logged;
  if (obs.victimIsDrone || logged.sunkIds.includes(obs.victimId)) return logged;
  // A victim whose roster entry has already gone (they left the room between
  // the sinking and the event landing) has no CALLSIGN to show. The kill still
  // counts — the tally is the authoritative roster figure — but the LIST is a
  // roll of names, and a raw session id is never a name.
  if (obs.victimName === null) return logged;
  return {
    ...logged,
    sunkContestants: [...logged.sunkContestants, obs.victimName],
    sunkIds: [...logged.sunkIds, obs.victimId],
  };
}

/** The roster fields the placement scan reads (structural — the real one is a
 *  Colyseus PlayerMeta). */
export interface RosterEntry {
  id?: string;
  alive?: boolean;
  /** Regatta hue index. No longer ever the `REGATTA_NO_HUE` drone sentinel in
   *  practice — Story 5.6 took fleet hulls off the roster (amendment 39), so 255
   *  survives only as the schema's "hue not assigned yet" default. Neither
   *  predicate below reads it any more. */
  color?: number;
}

/**
 * Pure: does this roster entry count as a live RIVAL for placement?
 *
 * THE ROSTER IS CAPTAINS-ONLY SINCE STORY 5.6 (amendment 39: *"fleet ships are
 * not roster members"*), so this no longer has to filter drones out — there are
 * none in it to filter. What the predicate still asserts is unchanged and is
 * still the whole point: placement ranks the OTHER contestants, so it counts
 * live entries that are not us. The `droneHue` parameter every call site used to
 * pass is GONE rather than ignored, so no caller can keep threading a sentinel
 * that means nothing.
 */
export function isLiveRival(meta: RosterEntry, ownId: string): boolean {
  return meta.alive === true && meta.id !== ownId;
}

/**
 * Pure: does this roster entry count toward `n AFLOAT`? Alive — and that is now
 * the whole test.
 *
 * THE RULE IS UNCHANGED AND ITS IMPLEMENTATION GOT SIMPLER (amendment 39:
 * *"`n AFLOAT` gets simpler rather than harder: the roster becomes
 * captains-only, so the count is the roster"*). DRONES ARE NOT COMBATANTS still
 * holds — a fleet kill pays a fraction of a level where a captain pays a full
 * one, PvE sinkings never reach the public register, and the results table lists
 * participants only — but the exclusion is now STRUCTURAL: fleet hulls have no
 * `PlayerMeta` row to exclude. Story 6-5: "captain" here means PARTICIPANT, not
 * human. An AI captain carries a roster row and is counted, because it contests
 * the match, holds a placement and can win it; only `isHuman` (server-side,
 * gating minHumans) still means a person. The LOCAL PLAYER is still counted, which is the
 * surviving half of the old asymmetry with `isLiveRival`: placement ranks the
 * OTHER contestants, while AFLOAT includes your own hull because you are on the
 * water too.
 *
 * WHY THE HUE TEST IS GONE RATHER THAN KEPT AS BELT-AND-BRACES: `REGATTA_NO_HUE`
 * (255) was always DUAL-PURPOSE — "drone" AND "hue not assigned yet" — and with
 * the first meaning deleted, keeping the test would drop a real captain whose
 * schema patch had not landed yet. The old doctrine note argued at length that
 * an UNDEFINED colour must count as a captain mid-patch; 255 is that same state
 * spelled differently, and it must count for the same reason.
 *
 * NOTE (Eric deferral): the WIN CONDITION still counts drones today —
 * Match.checkWin() is untouched by this cycle and belongs to Story 6-3 ("The
 * Participants-Only Win Check"). Until 6-3 lands, AFLOAT reads as "rivals
 * left" (plus you); when 6-3 lands it becomes literally "hulls left to clear".
 */
export function isAfloatHull(meta: RosterEntry): boolean {
  return meta.alive === true;
}

/** A roster the count can walk (structural — the real one is a Colyseus
 *  MapSchema, and a plain array satisfies it too). */
export interface RosterScan {
  forEach(fn: (meta: RosterEntry) => void): void;
}

/** Pure: captains still afloat — participants (human OR AI), the local player included (see
 *  isAfloatHull's doctrine note). Walks the roster in place — no intermediate
 *  array, because this runs every rendered frame. */
export function afloatCount(roster: RosterScan): number {
  let n = 0;
  roster.forEach((meta) => {
    if (isAfloatHull(meta)) n += 1;
  });
  return n;
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
 * What a resumed session owes itself about a sinking it never saw (Story 6.7,
 * ruling R7) — the pure half of the missed-death synthesis.
 *
 * A captain whose hull went down during a disconnect had their own `sunk`
 * delivered to nobody, so a fresh-page resume arrives spectating with no
 * ELIMINATED modal and no placement. Everything needed to notice is already in
 * hand: the frame says `spec`, and the PUBLIC roster says our own row is no
 * longer alive. No wire field is authorized for this and none is used.
 *
 * THREE ANSWERS, not two, because the frame and the schema patch arrive
 * INDEPENDENTLY:
 *   • `wait` — nothing has landed that can answer yet (still conning a hull, or
 *     the roster has not patched our row in). Ask again next frame; a check that
 *     fired unconditionally on "the first resumed frame" would read an empty
 *     roster about half the time and conclude, wrongly, that nothing was missed.
 *   • `settled` — answered, and no modal is owed: we resumed ALIVE, or one of
 *     `canOpenElimination`'s existing suppressions applies (not a live match —
 *     which covers a resume into `finished`, whose `lastResults` re-send reaches
 *     the client BEFORE the welcome — or the modal has already been opened once).
 *   • `open` — synthesize it.
 *
 * The never-twice clause is `canOpenElimination`'s own, deliberately re-used
 * rather than restated: once `recordElimination` has latched `eliminated`, a real
 * `sunk` replayed behind this synthesis answers `settled` and cannot re-open the
 * modal — which is the same guard that already protects a duplicate `sunk`.
 */
export function missedEliminationAction(v: {
  /** The frame said `spec` — we are watching, not conning. */
  spectating: boolean;
  /** Our own roster row's `alive`, or undefined when the row has not synced. */
  ownAlive: boolean | undefined;
  phase: string;
  resultsFinal: boolean;
  alreadyEliminated: boolean;
}): 'wait' | 'settled' | 'open' {
  if (!v.spectating || v.ownAlive === undefined) return 'wait';
  if (v.ownAlive) return 'settled';
  return canOpenElimination(v.phase, v.resultsFinal, v.alreadyEliminated) ? 'open' : 'settled';
}

/**
 * Pure: does a sinking in this match phase get a RESPAWN? — the client's mirror
 * of `Match.applyPolicy()`'s `world.respawnEnabled` (server/src/game/match.ts),
 * which is the READY ROOM and nothing else.
 *
 * Written as the server writes it — the three ready-room phases named
 * explicitly, never `phase !== 'active'` — so an unknown or future phase
 * (`finished`, or anything a newer server sends) answers NO. This is a
 * conservative direction on purpose: a missed respawn placard in a phase that
 * does respawn is a cosmetic gap, while a placard promising a respawn nobody
 * armed is a lie about the match the player is in.
 *
 * NOT folded into canOpenElimination above, even though the two are opposites
 * today: they answer different questions (may I show a debrief / did the server
 * arm a respawn), and `finished` is a phase where BOTH are false.
 */
export function respawnArmedIn(phase: string): boolean {
  return phase === 'waiting' || phase === 'gathering' || phase === 'countdown';
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
 *
 * THE MATCH LOG follows the ROLL, and `sunkAtMs` follows the LATCH: the log is
 * an observed-event list with the same hole in it after an outage, so it starts
 * clean, while the moment our own hull went down is a fact we derived before the
 * drop and TIME AFLOAT would otherwise resume counting up for a dead player.
 * (Consequence, accepted: `loggedIds` clears with the log, so a replayed own
 * `sunk` can re-post the death line into the fresh log — a truthful line in a
 * deliberately-restarted list, and `sunkAtMs` stays latched at its first value
 * either way.)
 */
export function scoreAfterReconnect(state: ScoreState): ScoreState {
  return {
    ...FRESH_SCORE,
    eliminated: state.eliminated,
    placement: state.placement,
    placementSettled: state.placementSettled,
    sunkAtMs: state.sunkAtMs,
  };
}

/** Everything the results modal renders about the local player. */
export interface PersonalScore {
  /** Total BOONS fitted this match (OwnShip.boons.length — Story 2.8; the
   *  legacy per-upgrade count sum died with the 14 upgrades). */
  boons: number;
  /** Kills — CAPTAINS ONLY (the authoritative public roster tally). Amendment
   *  37 stopped `ShipRecord.kills` counting PvE sinkings at the source, so this
   *  is drone-free without the client filtering anything. */
  kills: number;
  /** Contestant ships personally sunk — drones excluded (see the module note). */
  sunkContestants: readonly string[];
  /** Elimination placement, or null when the player is the winner. */
  placement: number | null;
  /** The player won (never eliminated / placed first). */
  winner: boolean;
  /** THE MATCH LOG (amendment 28), chronological. Empty is normal and means the
   *  block is omitted entirely — a captain can finish a match having named
   *  nobody. */
  matchLog: readonly MatchLogEntry[];
  /** TIME AFLOAT (ms) — see afloatMsFor. Null when the match clock has no
   *  anchor, which is the tile's OMIT signal (spec 5.3 I/O matrix): there is no
   *  in-band number that means "unknown", and 0 is a legitimate value. */
  afloatMs: number | null;
}

/**
 * Pure: TIME AFLOAT (ms) — the match clock from the anchor to the moment our own
 * hull went down, or to NOW while we are still on the water (the winner's case,
 * and every frame of a live match).
 *
 * THE END OF "AFLOAT" IS SINK-ENTRY, NOT FOUNDER, and the two differ by the
 * whole five-second sinking window (Story 5.2). Two reasons, and they agree:
 * the wire already defines it that way — `alive` goes false the instant the hull
 * is sunk (amendment 16) and the outcome is decided at that instant (amendment
 * 14) — and it is the only choice that keeps the TIME AFLOAT tile agreeing with
 * the `SUNK BY` line in the MATCH LOG sitting directly beneath it. A tile
 * reading five seconds past its own log's last stamp is the kind of small
 * disagreement this card exists to avoid.
 *
 * `nowMs` null (no anchor) propagates to null rather than to 0.
 */
export function afloatMsFor(state: ScoreState, nowMs: number | null): number | null {
  return state.sunkAtMs ?? nowMs;
}

/** Pure: boons fitted this match — the length of OwnShip.boons (Story 2.8).
 *  Repeats are LEGAL and each is a pick the player made, so occurrences count
 *  (never a de-duplicated set). Absent `you` (death frame / pre-first-frame)
 *  reads 0. */
export function boonCount(boons: readonly string[] | undefined): number {
  return boons?.length ?? 0;
}

/**
 * Pure: assemble the modal's view of the local player. `winner` wins over any
 * recorded placement — a player who was never eliminated (or who is credited the
 * win after a mutual destruction) gets the winner indication, not a number.
 *
 * `nowMs` is the CURRENT match time (`matchTimeMs(serverNow, zoneStartT)`) and is
 * only ever read for a player who has not sunk; it is a required argument rather
 * than a defaulted one so no call site can quietly report an unanchored clock.
 */
export function personalScore(state: ScoreState, boons: readonly string[] | undefined, kills: number, winner: boolean, nowMs: number | null): PersonalScore {
  return {
    boons: boonCount(boons),
    kills: Math.max(0, Math.round(kills)),
    sunkContestants: state.sunkContestants,
    placement: winner ? null : state.placement,
    winner,
    matchLog: state.matchLog,
    afloatMs: afloatMsFor(state, nowMs),
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
  boons: readonly string[] | undefined,
  msg: ResultsFacts,
  ownId: string,
  fallbackKills: number,
  nowMs: number | null,
): PersonalScore {
  const row = msg.rows.find((r) => r.id === ownId);
  const winner = msg.winnerId === ownId;
  return {
    boons: boonCount(boons),
    kills: Math.max(0, Math.round(row?.kills ?? fallbackKills)),
    sunkContestants: state.sunkContestants,
    placement: winner ? null : row?.placement ?? state.placement,
    winner,
    // The MATCH LOG and TIME AFLOAT are OBSERVED, not reported: the results
    // message carries neither, and the winner's clock is still running when it
    // arrives — so both come off the local fold in both modal paths.
    matchLog: state.matchLog,
    afloatMs: afloatMsFor(state, nowMs),
  };
}
