// THE PER-IP CREATE THROTTLE, ADAPTER HALF (Story 7-8, Eric ruling 2026-08-27,
// epic-7 amendment 45) — moved out of ArenaRoom.ts in cycle 167 so the private
// LobbyRoom can share the SAME bucket without importing the arena (and through
// it world.js / match.js, which the lobby must never import). Eric ruling 8 of
// 2026-10-02: lobby creation shares the per-IP 6/60 s limit with Solo vs AI.
// The policy is soloThrottle.ts (pure); this module is the process-level
// ledger, the env read and the wall clock. ArenaRoom re-exports
// resetSoloCreateThrottle so its existing test seam is unchanged.

import { ErrorCode, ServerError, type AuthContext } from 'colyseus';
import { createLogger } from '../log.js';
import {
  SOLO_CREATE_THROTTLE_ERROR,
  SOLO_CREATE_WINDOW_MS,
  admitSoloCreate,
  clientIpFrom,
  resolveSoloCreateLimit,
  xffEntryCount,
  type SoloCreateLedger,
} from './soloThrottle.js';

/** Telemetry mode tag the throttle's door lines have always carried. */
const MODE = 'arena';

/**
 * PER-IP SOLO-CREATE THROTTLE state (Story 7-8, Eric ruling 2026-08-27,
 * epic-7 amendment 45). Module-level because the door it guards is STATIC
 * onAuth — there is no room instance yet, and there must not be: the whole
 * point is refusing before a room is minted. Policy lives in soloThrottle.ts
 * (pure, injectable clock); this is the adapter's ledger + env read +
 * wall-clock, the I/O trio that stays out of the pure module. Memory is
 * bounded by the sweep inside admitSoloCreate (see that module's header).
 */
const soloCreateLedger: SoloCreateLedger = new Map();
/** One warning per process for the no-derivable-address fail-open (local dev —
 *  see clientIpFrom's trust model); never per-request log spam. */
let warnedSoloThrottleNoIp = false;
/**
 * Logged once per process on the FIRST create the throttle actually admits
 * (reviewer finding, Story 7-8): the rightmost-XFF trust model documented on
 * clientIpFrom is an unverified deployment assumption — nobody has confirmed
 * Render's edge appends exactly one hop. This flag caps the admit line to one
 * per process (the shape doesn't change request to request); every refusal
 * still logs unconditionally, since a refusal is by construction rare enough
 * not to be spam and is exactly the case where seeing the shape matters most.
 */
let loggedFirstSoloThrottleAdmit = false;
/** Static-door logger: no room, no matchId yet. */
const doorLog = createLogger({ mode: MODE });

/** TEST SEAM: clear the throttle's process-level state between tests. */
export function resetSoloCreateThrottle(): void {
  soloCreateLedger.clear();
  warnedSoloThrottleNoIp = false;
  loggedFirstSoloThrottleAdmit = false;
}

/**
 * `room.soloThrottleShape` — the ops observability line (Story 7-8 follow-up).
 * Never logs the raw header, only its entry COUNT and the derived rightmost
 * key, so the real XFF shape on Render can be read off logs without recording
 * anything a raw-header ban would object to. See `loggedFirstSoloThrottleAdmit`
 * for the admit/refusal cadence.
 */
function logSoloThrottleShape(context: AuthContext | undefined, ip: string, admitted: boolean): void {
  if (admitted) {
    if (loggedFirstSoloThrottleAdmit) return;
    loggedFirstSoloThrottleAdmit = true;
  }
  doorLog.info('room.soloThrottleShape', {
    entries: xffEntryCount(context?.headers?.get('x-forwarded-for')),
    rightmost: ip,
    verdict: admitted ? 'admitted' : 'refused',
  });
}

/**
 * The throttle verdict for one solo create — refusal message, or null to
 * admit (the stagingGateError shape). Runs AFTER the PV and staging gates, so
 * only a request that would otherwise mint a room ever consumes quota.
 *
 * Address derivation: the RIGHTMOST x-forwarded-for entry (proxy-appended —
 * client-forgeable only on its LEFT; see clientIpFrom for the full trust
 * model). The socket remote address is unreachable from static onAuth in
 * @colyseus/core 0.18.13 (the matchmake route's AuthContext carries headers
 * and a socketless WHATWG Request — router/default_routes.mjs builds `ip`
 * from the same headers), so with no header at all — a bare local run, where
 * no proxy exists to append one — the throttle FAILS OPEN with one logged
 * warning rather than refusing every local solo player.
 */
function soloCreateGateError(context: AuthContext | undefined): string | null {
  const limit = resolveSoloCreateLimit(process.env.HC_SOLO_CREATE_LIMIT);
  if (limit === 0) return null; // explicitly disabled (load-test self-boot)
  const ip = clientIpFrom(context?.headers?.get('x-forwarded-for'));
  if (ip === null) {
    if (!warnedSoloThrottleNoIp) {
      warnedSoloThrottleNoIp = true;
      doorLog.warn('room.soloThrottleNoIp', { reason: 'no x-forwarded-for; throttle fails open' });
    }
    return null;
  }
  const ok = admitSoloCreate(soloCreateLedger, ip, Date.now(), {
    limit,
    windowMs: SOLO_CREATE_WINDOW_MS,
  });
  logSoloThrottleShape(context, ip, ok);
  return ok ? null : SOLO_CREATE_THROTTLE_ERROR;
}

/** The throwing shape of soloCreateGateError, so static onAuth stays under the
 *  complexity budget: refusal becomes the same ServerError the PV and staging
 *  gates throw, admission returns quietly. */
export function assertSoloCreateAllowed(context: AuthContext | undefined): void {
  const throttled = soloCreateGateError(context);
  if (throttled) throw new ServerError(ErrorCode.AUTH_FAILED, throttled);
}

