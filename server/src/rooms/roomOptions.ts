// Room-create option types + the sanitizer that gates dev-only overrides.
// Pulled out of ArenaRoom so the gating logic is a pure, unit-testable
// function with zero Colyseus dependency (SECURITY: options.matchOverride /
// options.zoneOverride arrive verbatim from client-supplied joinOrCreate
// options — see sanitizeRoomOptions for why they must never reach a
// production room ungated).

import { CONFIG, PROTOCOL_VERSION, REGATTA_HUES, type ZoneTimeline } from '@salvo/shared';

/**
 * Callsign cap, in CODE POINTS. Mirrors the client's display/entry cap
 * (`client/src/util/text.ts` NAME_MAX) — the server can't import the client
 * workspace, and this is a presentation bound rather than a sim tunable, so it
 * is deliberately NOT promoted into shared CONFIG. Both sides cap at 14; the
 * server's cap is the authoritative one (a hand-rolled client can't beat it).
 */
export const NAME_MAX = 14;

export interface JoinOptions {
  name?: string;
  /**
   * Client-chosen ship class ('torpedoBoat' | 'battleship' | 'mineLayer'). A
   * plain join option (NOT gated by HC_DEV_OPTIONS): onJoin runs it through
   * sanitizeClassId, so any garbage/absent/legacy value falls back to
   * 'torpedoBoat'.
   */
  cls?: string;
  /**
   * Regatta Hoist personal-hue PREFERENCE (Story 1.12): an integer hue index
   * 0..19 into the shared REGATTA_HUES wheel. A plain join option (NOT gated by
   * HC_DEV_OPTIONS, like `cls`): onJoin runs it through sanitizeColorPref, so any
   * out-of-range / non-integer / absent value falls back to undefined (the
   * no-preference path — a seeded-random free hue). This story only PLUMBS the
   * option (connection.ts forwards a persisted value); no UI writes it yet (1.14).
   */
  colorPref?: number;
  /**
   * Client-chosen foghorn variant (Story 4.5, amendment 52) — the cosmetic
   * seam for a future purchased horn. A plain join option (NOT gated by
   * HC_DEV_OPTIONS, like `cls`): onJoin runs it through the shared
   * sanitizeHornId, so any garbage/absent/unknown value falls back to
   * DEFAULT_HORN_ID ('standard'). Deliberately NO PlayerMeta/roster schema
   * field — a horn is only ever public at the moment it sounds (it rides the
   * `fh` event's `h`, nothing else).
   */
  horn?: string;
  /**
   * Client bundle's PROTOCOL_VERSION. Validated by ArenaRoom's static onAuth
   * (via protocolVersionError below) BEFORE any room lookup or seat
   * reservation — a stale bundle is rejected at matchmake time with a
   * human-readable "refresh" message instead of failing at schema decode.
   * Reconnects (matchMaker.reconnect) bypass onAuth by design, so a mid-match
   * resume is never re-gated.
   */
  pv?: number;
  /**
   * SOLO VS AI (Story 6.5): the client asks for a private match against AI
   * captains. It arrives on `client.create('arena', { solo: true, ... })` —
   * `create()` always mints a FRESH room, so a solo asker gets a private,
   * immediately-locked room of its own and can never inject bots into anyone
   * else's match. That is the whole security argument for letting a
   * client-supplied flag through ungated: the only thing it can do is spawn the
   * asker's own 20-hull room, which is exactly what a legitimate solo player
   * costs. NOT dev-gated (like `cls`/`colorPref`), but coerced STRICTLY: see
   * sanitizeSolo — only the boolean `true` counts.
   */
  solo?: boolean;
  /**
   * WHICH of the captain's decks to sail (Story 8.2, the Epic 9 port). A plain
   * join option (NOT dev-gated): sanitizeDeckOptions trims it and caps it at
   * 64 code points, else drops it. ACCEPTED BUT UNREAD today — with no account
   * module `loadDeckFor` ignores it and every captain sails the hull's default
   * deck. The shipped client does NOT send it (a field with no consumer may
   * not ride — the Story 4.9 rule); the server accepting it is what lets Epic 9
   * add the client half without a wire change at the door.
   */
  deckId?: string;
  /**
   * DEV TOOL for tests/smokes only — the real client NEVER sets it. A full
   * 40-id list that REPLACES `loadDeckFor`'s answer and still goes through
   * `checkDeck` at the door (which is how the refusal path is reached end to
   * end). Honoured ONLY under HC_DEV_OPTIONS=1 (the matchOverride precedent);
   * otherwise dropped, reported in `rejectedKeys` and logged once
   * (`deck.devOptionsRejected`). SHAPE-sanitized even when honoured — an
   * array of at most DECK_OVERRIDE_MAX strings, each at most 64 code points,
   * else the whole override is dropped and reported — but the IDS THEMSELVES
   * are not filtered: an unknown id rides through to `checkDeck` and is
   * refused as `unowned`, rather than being quietly replaced by the default.
   */
  deckOverride?: readonly string[];
  /**
   * DEV SMOKE ARM for tests/smokes only (Story 8.10, epic-8 amendment 65) —
   * the real client NEVER sets it, and production never sees it. A list of
   * card LINE ids the World pre-fits at the CAPTAIN's spawn, each consuming
   * one copy from the hull's own deck exactly as a pick does. It exists
   * because FR48 deleted the interim spawn seed: a hull now spawns holding
   * NOTHING, which left the two weapon smokes (matchSmoke, weaponsSmoke)
   * clicking an empty Q slot. Honoured ONLY under HC_DEV_OPTIONS=1 (the
   * deckOverride precedent); otherwise dropped, reported in `rejectedKeys`
   * and logged once (`deck.devOptionsRejected`). SHAPE-sanitized when
   * honoured (the same bounds deckOverride uses) but the IDS are NOT
   * filtered here: the World drops an id its deck cannot pay for.
   */
  fitOverride?: readonly string[];
  /**
   * NEVER ACCEPTED. A client may not supply deck CONTENTS (epic-8 Anti-cheat:
   * "the option sanitizer rejects a `deck` key at both doors"): the presence of
   * the key — any value, even `undefined` — makes the door REFUSE the join
   * with `deck.illegal { rule: 'clientSupplied' }`. Typed so the sanitizer can
   * name it; it never reaches a room.
   */
  deck?: unknown;
}

/** Deck-shaped join options after sanitizeDeckOptions. */
export interface DeckOptions {
  /** Trimmed, ≤ 64 code points; absent when missing or malformed. */
  deckId?: string;
  /** A dev override, shape-sanitized but NOT id-filtered (the door's
   *  `checkDeck` judges the ids); present ONLY when devEnabled honoured it. */
  deckOverride?: readonly string[];
  /** A dev SPAWN FIT list (amendment 65), shape-sanitized but NOT id-filtered
   *  (the World judges the ids against the hull's own deck); present ONLY
   *  when devEnabled honoured it. */
  fitOverride?: readonly string[];
  /** The `deck` key was present — the door must refuse (clientSupplied). */
  clientDeck: boolean;
  /** Keys DROPPED — the dev gate was closed, or the shape was malformed:
   *  any of `['deckOverride', 'fitOverride']`, in that order, or empty. The
   *  door logs them once. */
  rejectedKeys: string[];
}

/** Callsign-style cap for a deck id, in CODE POINTS (Epic 9 names decks; a
 *  64-point id is a generous bound for an opaque store key). */
export const DECK_ID_MAX = 64;

/** A trimmed, bounded deck id, or undefined for anything malformed/empty. */
function sanitizeDeckId(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed === '' || Array.from(trimmed).length > DECK_ID_MAX) return undefined;
  return trimmed;
}

/** Bounds on a dev override: entries, and code points per entry. Generous —
 *  they exist to keep a hostile payload from reaching the rules engine at all,
 *  not to express any deck rule (a 40-card deck is CONFIG.deck.size). */
export const DECK_OVERRIDE_MAX = 256;
const OVERRIDE_ID_MAX = DECK_ID_MAX;

/**
 * A bounded array of PLAIN STRINGS, or undefined when the value is not an
 * array, carries more than DECK_OVERRIDE_MAX entries, or holds a non-string /
 * over-long entry — in which case the caller DROPS the override and reports
 * it, so a malformed dev payload is never silent.
 *
 * DELIBERATELY NOT FILTERED AGAINST THE CATALOG (orchestrator ruling, review
 * of Story 8.2): an unknown id used to drop the whole override, and the door
 * then sailed the DEFAULT — a silent substitution on the dev path, and it made
 * `checkDeck`'s `unowned` rule unreachable from either door. Ids are passed
 * through verbatim and `checkDeck` judges them, so an unknown id is REFUSED as
 * `unowned` end to end. The list is copied, so nothing downstream aliases the
 * raw join options.
 *
 * SHARED BY BOTH DEV ID LISTS since Story 8.10: `fitOverride` (amendment 65)
 * wants exactly this shape check and exactly this "the ids are somebody
 * else's problem" posture — the World drops a fit id its deck cannot pay for.
 */
function sanitizeDeckOverride(v: unknown): readonly string[] | undefined {
  if (!Array.isArray(v) || v.length > DECK_OVERRIDE_MAX) return undefined;
  for (const id of v) {
    if (typeof id !== 'string' || Array.from(id).length > OVERRIDE_ID_MAX) return undefined;
  }
  return [...(v as string[])];
}

/**
 * Sanitize the deck-shaped join options (Story 8.2), used by BOTH doors.
 * `devEnabled` must come from `process.env.HC_DEV_OPTIONS === '1'` (checked by
 * the caller, like sanitizeRoomOptions). Pure, zero Colyseus.
 *
 *   - `deck` present (any value) → `clientDeck: true`; the door refuses.
 *   - `deckId` → trimmed string ≤ DECK_ID_MAX code points, else dropped.
 *   - `deckOverride` → honoured (shape-sanitized, ids NOT filtered) only under
 *     devEnabled; dropped and pushed to `rejectedKeys` for the door to log
 *     once when the gate is closed OR the shape is malformed.
 *   - `fitOverride` (Story 8.10, amendment 65) → the SAME treatment, the same
 *     shape, the same bounds; reported after `deckOverride` when both drop.
 */
export function sanitizeDeckOptions(options: JoinOptions, devEnabled: boolean): DeckOptions {
  const out: DeckOptions = { clientDeck: Object.hasOwn(options, 'deck'), rejectedKeys: [] };
  const deckId = sanitizeDeckId(options.deckId);
  if (deckId !== undefined) out.deckId = deckId;
  const deckOverride = admitDevIdList(options.deckOverride, devEnabled, 'deckOverride', out.rejectedKeys);
  if (deckOverride !== undefined) out.deckOverride = deckOverride;
  const fitOverride = admitDevIdList(options.fitOverride, devEnabled, 'fitOverride', out.rejectedKeys);
  if (fitOverride !== undefined) out.fitOverride = fitOverride;
  return out;
}

/**
 * ONE dev id-list option, gated and reported: absent → nothing at all (no
 * rejection noise); present but the gate is closed OR the shape is malformed →
 * `undefined` and the key pushed onto `rejectedKeys` for the door to log once.
 * A DROP IS ALWAYS REPORTED — the silent half of this used to be the malformed
 * case, which then sailed the default with nothing in the log to say the
 * override had been thrown away.
 */
function admitDevIdList(
  raw: readonly string[] | undefined,
  devEnabled: boolean,
  key: 'deckOverride' | 'fitOverride',
  rejectedKeys: string[],
): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  const list = devEnabled ? sanitizeDeckOverride(raw) : undefined;
  if (list === undefined) rejectedKeys.push(key);
  return list;
}

/**
 * PROTOCOL_VERSION join gate (story 0.2). Returns null when the client's `pv`
 * matches, else the human-readable rejection message the menu status line
 * renders. A MISSING pv is rejected too — a stale-but-wire-compatible bundle
 * predates the gate and still needs a refresh (conservative by design). Pure
 * (zero Colyseus imports) so the accept/reject matrix is unit-testable.
 */
export function protocolVersionError(pv: unknown): string | null {
  return pv === PROTOCOL_VERSION
    ? null
    : `version mismatch — please refresh the page (server expects v${PROTOCOL_VERSION})`;
}

/**
 * DEV TOOL for smokes/tests only — matchmaking / the real client NEVER set it.
 * `countdownMs`/`resultsMs` shrink the lifecycle timers so a full match loop is
 * observable in seconds. `sandbox: true` disables the match lifecycle entirely
 * (no Match constructed): the World keeps its permissive defaults (damage on,
 * respawn on, mines on), frames stay fogged for everyone, and the storm starts
 * when the 2nd ship joins — the pre-step-14 behavior the older standalone
 * smoke scripts (combat/fog/weapons/zone) were written against.
 *
 * Gated by sanitizeRoomOptions: only honored when HC_DEV_OPTIONS=1 is set in
 * the server process's environment. Without it, a client can otherwise trap
 * honest joiners in a lifecycle-less sandbox room (matchOverride.sandbox),
 * DoS the room via absurd minHumans/countdownMs/resultsMs, or (via
 * zoneOverride) desync the server's storm from what every client renders.
 */
export interface MatchOverride {
  countdownMs?: number;
  resultsMs?: number;
  /** DEV: unlocked gathering window (ms) at minHumans before the countdown
   *  arms; <= 0 = legacy immediate countdown + lock (the smokes' fast path). */
  joinWindowMs?: number;
  /** DEV: humans needed to start the countdown (e.g. 1 for a solo drone smoke). */
  minHumans?: number;
  /**
   * DEV SMOKE ARM (Story 8.10): the room performs the level-zero MULLIGAN for
   * every captain on the first tick after the countdown arms, so a headless
   * smoke can watch offer A become offer B without racing its own socket. It
   * rides into the Match as `MatchTimings.autoMulligan`. Dev-gated like every
   * other field here — the whole matchOverride is stripped without
   * HC_DEV_OPTIONS=1, so production can never reach it.
   */
  mulligan?: boolean;
  sandbox?: boolean;
}

/**
 * Room-create options. `zoneOverride` is a DEV TOOL for smokes/tests only — it
 * reshapes the phased storm timeline (beatMs / ringSteps / offsetCap /
 * terminalSightFactor / suddenDeath — the ZoneTimeline structural subset;
 * stormDps is
 * deliberately NOT part of the shape: damage is never overridable) so closes
 * are observable in seconds. Matchmaking / the real client NEVER set it (the
 * client derives its ring phases from CONFIG.zone, so an override desyncs the
 * client's derived timeline — and since cycle 82 note that omitting
 * `suddenDeath` forks the GROUP COUNT rather than only the magnitudes, so the
 * two sides disagree about how many groups exist, not merely how long they
 * last; a headless smoke that asserts client-side phases must set the flag). Gated by sanitizeRoomOptions same as
 * matchOverride.
 */
export interface RoomOptions extends JoinOptions {
  zoneOverride?: ZoneTimeline;
  matchOverride?: MatchOverride;
  /**
   * DEV TOOL for smokes/tests only (story 1.5 latency harness): pin the room's
   * map seed so a scripted scenario gets a deterministic map. Gated by
   * sanitizeRoomOptions exactly like matchOverride/zoneOverride (HC_DEV_OPTIONS=1
   * only) AND value-sanitized even when dev is enabled: anything but a
   * non-negative integer is stripped (the room then rolls its normal random
   * seed). Production clients can never pin a map.
   */
  mapSeed?: number;
  /**
   * How many captains the QUEUE reserved seats for when it created this arena
   * (Story 6.1, Eric ruling 2026-08-14). The arena boards the whole group with
   * movement/weapons locked and radar off, and holds the 10 s countdown until
   * every expected captain has actually loaded in — so it must know the size of
   * the group it is waiting for. NOT a dev-gated override (the queue sets it on
   * every production room create) but ALWAYS clamped: see
   * sanitizeExpectedCaptains.
   */
  expectedCaptains?: number;
}

export interface SanitizedRoomOptions {
  matchOverride?: MatchOverride;
  zoneOverride?: ZoneTimeline;
  mapSeed?: number;
  /** Clamped group size from the queue; undefined = no boarding expectation
   *  (a directly-created dev/smoke arena). */
  expectedCaptains?: number;
  /** Solo vs AI (Story 6.5): true, or ABSENT — never false. The room fills the
   *  roster to CONFIG.map.playerCap with bots and runs a 1-captain cohort. */
  solo?: true;
}

export interface SanitizeResult {
  sanitized: SanitizedRoomOptions;
  /** Keys stripped because devEnabled was false — empty when nothing was rejected. */
  rejectedKeys: string[];
}

/**
 * Gate for the client-supplied dev-only room options. `devEnabled` must come
 * from `process.env.HC_DEV_OPTIONS === '1'` (checked by the caller, not here,
 * to keep this function pure/testable). When disabled (the production
 * default — no env means no dev options, full stop), matchOverride and
 * zoneOverride are stripped entirely regardless of their contents; the caller
 * is expected to log the rejected keys once per room so probing is visible in
 * server logs.
 */
export function sanitizeRoomOptions(options: RoomOptions, devEnabled: boolean): SanitizeResult {
  // NOT dev-gated: the queue sets expectedCaptains on every production arena it
  // creates, so stripping it without HC_DEV_OPTIONS would delete the boarding
  // expectation in exactly the deployment that needs it. Safety comes from the
  // clamp instead (sanitizeExpectedCaptains), not from the dev gate.
  const expectedCaptains = sanitizeExpectedCaptains(options.expectedCaptains);
  // NOT dev-gated either (Story 6.5) — a production client sets it on the solo
  // door. Safety is structural rather than environmental: the flag only ever
  // reaches a room the asker just created for itself (see JoinOptions.solo).
  const solo = sanitizeSolo(options.solo);
  if (devEnabled) {
    return {
      sanitized: {
        matchOverride: options.matchOverride,
        zoneOverride: options.zoneOverride,
        mapSeed: sanitizeMapSeed(options.mapSeed),
        expectedCaptains,
        solo,
      },
      rejectedKeys: [],
    };
  }
  const rejectedKeys: string[] = [];
  if (options.matchOverride !== undefined) rejectedKeys.push('matchOverride');
  if (options.zoneOverride !== undefined) rejectedKeys.push('zoneOverride');
  if (options.mapSeed !== undefined) rejectedKeys.push('mapSeed');
  return { sanitized: { expectedCaptains, solo }, rejectedKeys };
}

/**
 * Sanitize the Solo vs AI flag (Story 6.5). STRICT: only the boolean `true`
 * opts a room in — a truthy string, 1, or an object is NOT a request for a bot
 * lobby, it is a malformed or probing client, and it falls to undefined (the
 * ordinary arena). Returning `true | undefined` rather than a boolean keeps the
 * "absent means no" shape every other sanitizer here uses, so no caller can
 * read a `false` as a deliberate opt-out. Pure + unit-testable; never
 * dev-gated (see sanitizeRoomOptions).
 */
export function sanitizeSolo(v: unknown): true | undefined {
  return v === true ? true : undefined;
}

/**
 * Clamp a caller-supplied boarding group size into [1, CONFIG.map.playerCap] —
 * the band a formed cohort can occupy. Anything non-integer / non-finite /
 * absent becomes undefined (no boarding expectation) rather than a number, so a
 * garbage value can never be read as "wait for 0 captains" or "wait for 10000
 * captains" and stall the countdown forever. Pure + unit-testable like every
 * other sanitizer here.
 *
 * THE FLOOR IS 1, NOT CONFIG.match.minHumans (Story 6.5). It clamped against
 * the CONFIG constant — never against the room's EFFECTIVE minHumans — so a
 * one-captain cohort silently became a two-captain one, and a Solo vs AI room
 * was unconstructible: it would board, burn the boarding grace, and then wait
 * forever for a second human who is never coming. A solo room must be
 * expressible. The ceiling is unchanged, and this widens nothing else: the
 * value is still only a COUNT the boarding gate waits for.
 */
export function sanitizeExpectedCaptains(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isInteger(v)) return undefined;
  return Math.min(Math.max(v, 1), CONFIG.map.playerCap);
}

/** Valid pinned map seed: a non-negative integer; anything else is stripped
 *  (undefined => the room rolls its normal random seed). */
function sanitizeMapSeed(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/**
 * Sanitize a client-supplied Regatta hue PREFERENCE (Story 1.12): a valid pick is
 * an integer in [0, REGATTA_HUES.length) — anything else (out of range, fractional,
 * NaN, non-number, absent) becomes undefined, the no-preference path. Pure +
 * unit-testable; NEVER dev-gated (a plain join option like `cls`). Called from
 * onJoin, not sanitizeRoomOptions — preference is not a privileged dev override.
 */
export function sanitizeColorPref(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < REGATTA_HUES.length ? v : undefined;
}

/**
 * Unicode category C — control (Cc), format (Cf, which includes the zero-width
 * joiner/non-joiner AND the bidi overrides U+202A–202E / U+2066–2069),
 * surrogate (Cs), private-use (Co) and unassigned (Cn) code points. NONE of
 * these are legitimate callsign characters, and every one of them is an
 * identity-spoofing tool: a zero-width-only name renders as a BLANK captain on
 * every plate/feed/results row, and a bidi override mangles the display order
 * of everything painted after it. Stripped outright (see sanitizeName).
 */
const CONTROL_OR_FORMAT = /\p{C}/gu;

/**
 * Sanitize a client-supplied callsign (Story 2.3 — deferred-work 127/130).
 * `options.name` arrives verbatim from joinOrCreate, so it is neither a string
 * nor bounded nor renderable until it passes through here:
 *   • anything that is not a string (a number, an object, absent) → undefined,
 *     which the caller resolves to the `CAPTAIN-n` fallback. The old
 *     `options.name?.trim()` would THROW on a non-string.
 *   • otherwise: every control/format code point is STRIPPED FIRST (see
 *     CONTROL_OR_FORMAT — a zero-width or bidi-override callsign would
 *     otherwise survive trim+cap and spoof a blank or mangled identity), then
 *     trimmed, then capped at NAME_MAX CODE POINTS — the same cap the client's
 *     entry field enforces — using Array.from so a surrogate pair or a
 *     combining sequence is never split mid-character. A name that is empty,
 *     all-whitespace, or all-invisible after the strip falls back too.
 * Pure + unit-tested; NEVER dev-gated (a plain join option like `cls`). Mirrors
 * sanitizeClassId / sanitizeColorPref: fail to the safe default, never throw.
 */
export function sanitizeName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.replace(CONTROL_OR_FORMAT, '').trim();
  if (trimmed === '') return undefined;
  return Array.from(trimmed).slice(0, NAME_MAX).join('');
}
