// Room-create option types + the sanitizer that gates dev-only overrides.
// Pulled out of ArenaRoom so the gating logic is a pure, unit-testable
// function with zero Colyseus dependency (SECURITY: options.matchOverride /
// options.zoneOverride arrive verbatim from client-supplied joinOrCreate
// options — see sanitizeRoomOptions for why they must never reach a
// production room ungated).

import { PROTOCOL_VERSION, REGATTA_HUES, type ZoneTimeline } from '@salvo/shared';

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
   * Client bundle's PROTOCOL_VERSION. Validated by ArenaRoom's static onAuth
   * (via protocolVersionError below) BEFORE any room lookup or seat
   * reservation — a stale bundle is rejected at matchmake time with a
   * human-readable "refresh" message instead of failing at schema decode.
   * Reconnects (matchMaker.reconnect) bypass onAuth by design, so a mid-match
   * resume is never re-gated.
   */
  pv?: number;
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
  /** DEV: humans needed to start the countdown (e.g. 1 for a solo drone smoke). */
  minHumans?: number;
  sandbox?: boolean;
}

/**
 * Room-create options. `zoneOverride` is a DEV TOOL for smokes/tests only — it
 * reshapes the phased storm timeline (beatMs / ringSteps / offsetCap /
 * terminalSightFactor — the ZoneTimeline structural subset; stormDps is
 * deliberately NOT part of the shape: damage is never overridable) so closes
 * are observable in seconds. Matchmaking / the real client NEVER set it (the
 * client derives its ring phases from CONFIG.zone, so an override desyncs the
 * client's derived timeline). Gated by sanitizeRoomOptions same as
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
}

export interface SanitizedRoomOptions {
  matchOverride?: MatchOverride;
  zoneOverride?: ZoneTimeline;
  mapSeed?: number;
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
  if (devEnabled) {
    return {
      sanitized: {
        matchOverride: options.matchOverride,
        zoneOverride: options.zoneOverride,
        mapSeed: sanitizeMapSeed(options.mapSeed),
      },
      rejectedKeys: [],
    };
  }
  const rejectedKeys: string[] = [];
  if (options.matchOverride !== undefined) rejectedKeys.push('matchOverride');
  if (options.zoneOverride !== undefined) rejectedKeys.push('zoneOverride');
  if (options.mapSeed !== undefined) rejectedKeys.push('mapSeed');
  return { sanitized: {}, rejectedKeys };
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
