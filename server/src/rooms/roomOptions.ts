// Room-create option types + the sanitizer that gates dev-only overrides.
// Pulled out of ArenaRoom so the gating logic is a pure, unit-testable
// function with zero Colyseus dependency (SECURITY: options.matchOverride /
// options.zoneOverride arrive verbatim from client-supplied joinOrCreate
// options — see sanitizeRoomOptions for why they must never reach a
// production room ungated).

import type { ZoneTimeline } from '@salvo/shared';

export interface JoinOptions {
  name?: string;
  /**
   * Client-chosen ship class ('destroyer' | 'cruiser' | 'battleship'). A plain
   * join option (NOT gated by HC_DEV_OPTIONS): onJoin runs it through
   * sanitizeClassId, so any garbage/absent value falls back to 'cruiser'.
   */
  cls?: string;
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
 * fast-forwards the storm timeline so a shrink is observable in seconds.
 * Matchmaking / the real client NEVER set it (the client derives its ring from
 * CONFIG.zone, so an override desyncs the client's derived radius). Gated by
 * sanitizeRoomOptions same as matchOverride.
 */
export interface RoomOptions extends JoinOptions {
  zoneOverride?: ZoneTimeline;
  matchOverride?: MatchOverride;
}

export interface SanitizedRoomOptions {
  matchOverride?: MatchOverride;
  zoneOverride?: ZoneTimeline;
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
      sanitized: { matchOverride: options.matchOverride, zoneOverride: options.zoneOverride },
      rejectedKeys: [],
    };
  }
  const rejectedKeys: string[] = [];
  if (options.matchOverride !== undefined) rejectedKeys.push('matchOverride');
  if (options.zoneOverride !== undefined) rejectedKeys.push('zoneOverride');
  return { sanitized: {}, rejectedKeys };
}
