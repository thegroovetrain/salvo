// The per-IP solo-create throttle POLICY (Story 7-8, Eric ruling 2026-08-27,
// epic-7 amendment 45) — pure functions over plain data, ZERO Colyseus
// imports, exactly like queue.ts / game/match.ts. ArenaRoom's static onAuth is
// the thin adapter: it derives the caller's address, reads the env knob, and
// asks this module for a verdict BEFORE any room is minted.
//
// WHY THIS EXISTS. `client.create('arena', { solo: true })` deliberately lets
// an unauthenticated `POST /matchmake/create/arena` mint a fresh 20-hull
// simulating room (Story 6.5 — that IS the solo door, and the room is locked
// at birth so it can never be anyone else's match). The ledgered cost: each
// create burns a ~15s seat reservation of full-room simulation, so ~10 req/s
// sustains ~150 concurrent arenas from one host. This throttle closes that
// flood while never touching the queue door (socket-gated, cohort-formed) or a
// mid-match reconnect (matchMaker.reconnect() never calls onAuth — the resume
// token is the auth, the same posture as the PV and staging gates).
//
// WHY THE DEFAULT LIMIT (6/min) IS GENEROUS FOR A LEGITIMATE PLAYER. A real
// solo player creates exactly ONE room per match, and reaching the next create
// takes at minimum: the 10s countdown, some amount of play, death or victory,
// the results window, and a full page reload back through the home screen
// (app/returnToPort.ts — the only path to another SOLO VS AI press). Even a
// player who joins and instantly quits six times in a row stays under this
// bound; sustaining it for minutes is not a human on the home screen, it is a
// script hammering the matchmake route.
//
// MEMORY IS BOUNDED BY CONSTRUCTION: every admit() call sweeps the WHOLE
// ledger, dropping every stamp older than the window and every key left empty.
// So the ledger only ever holds addresses with at least one ADMITTED create in
// the last windowMs — and an admitted create already minted a room, which is a
// far larger allocation than a map entry. An attacker spraying distinct
// addresses therefore cannot grow the map past (admits in the last window),
// and refusals allocate nothing at all. Pinned by test.

/** Rolling window the per-IP count is measured over. */
export const SOLO_CREATE_WINDOW_MS = 60_000;
/** Admitted solo creates one address may make per window (env-overridable —
 *  see resolveSoloCreateLimit). */
export const SOLO_CREATE_DEFAULT_LIMIT = 6;
/** Refusal message for a throttled create — the protocolVersionError /
 *  GATE_JOIN_ERROR register: human-readable, tells the player what to do. */
export const SOLO_CREATE_THROTTLE_ERROR =
  'too many matches started from your address — wait a minute and try again';

export interface SoloThrottleConfig {
  /** Max ADMITTED creates per address per window. 0 = throttle disabled. */
  limit: number;
  /** Rolling window length in ms. */
  windowMs: number;
}

/** address -> admit timestamps (ms, caller's clock) inside the last window. */
export type SoloCreateLedger = Map<string, number[]>;

/**
 * Resolve HC_SOLO_CREATE_LIMIT (the adapter reads process.env and passes the
 * raw string — env never gets read here, the queue.ts purity posture). A
 * non-negative integer is honored; `'0'` DISABLES the throttle entirely, which
 * the load-test harness's self-boot needs (its whole job is to spike solo
 * creates from one address). Absent, empty, or invalid falls back to the
 * default 6 — fail CLOSED to the throttle, never open, because a typo in an
 * env var must not silently remove the flood guard.
 */
export function resolveSoloCreateLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return SOLO_CREATE_DEFAULT_LIMIT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : SOLO_CREATE_DEFAULT_LIMIT;
}

/**
 * The address a throttle bucket is keyed on, derived from the raw
 * `x-forwarded-for` header value — the RIGHTMOST non-empty entry.
 *
 * TRUST MODEL. XFF is append-only: each proxy adds the address it actually
 * accepted the connection from. The LEFTMOST entries are client-forgeable (a
 * client can send any XFF header it likes and every hop preserves it), so
 * keying on them would let an attacker rotate a fake address per request and
 * never share a bucket. The RIGHTMOST entry was appended by the LAST proxy —
 * on Render that is exactly one trusted edge proxy in front of this process,
 * so the rightmost entry is the true peer address the edge saw, and nothing
 * the client typed can displace it (a forged header only ever grows to its
 * LEFT). On a bare local run there is no proxy and usually no header at all:
 * this returns null and the adapter FAILS OPEN with a logged warning, which is
 * correct for dev and moot in production (Render's edge always sets the
 * header). Note the socket remote address is NOT reachable from static onAuth
 * in @colyseus/core 0.17.44 — the matchmake route hands onAuth a WHATWG
 * Request built fresh from the node req (better-call getRequest), with no
 * socket on it; headers are all there is.
 */
export function clientIpFrom(forwardedFor: string | null | undefined): string | null {
  if (!forwardedFor) return null;
  const parts = forwardedFor.split(',');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const entry = parts[i].trim();
    if (entry !== '') return entry;
  }
  return null;
}

/**
 * Count of comma-separated entries in a raw `x-forwarded-for` header value
 * (0 for absent/empty). Observability only — this and `clientIpFrom`'s
 * derived rightmost entry are what an operator needs to verify the trust
 * model above against a real Render log, WITHOUT ever recording the raw
 * header value itself (which could carry a chain of real addresses).
 */
export function xffEntryCount(forwardedFor: string | null | undefined): number {
  if (!forwardedFor) return 0;
  return forwardedFor.split(',').length;
}

/**
 * One create attempt from `ip` at `nowMs` (injectable clock — the caller owns
 * time, tests drive it as a plain number). Returns true and RECORDS the admit,
 * or false and records NOTHING: refusals never consume quota, because a
 * refused request minted no room and cost the server nothing worth metering —
 * and metering refusals would let the flood itself keep a victim address (a
 * shared NAT) locked out forever.
 *
 * Every call first sweeps the whole ledger (see the module header's memory
 * bound): stamps older than the window are dropped and empty keys deleted, so
 * the map can never outlive the traffic that filled it. The sweep is O(live
 * addresses), and live addresses are bounded by admits-in-window — trivially
 * small next to the rooms those admits created.
 */
export function admitSoloCreate(
  ledger: SoloCreateLedger,
  ip: string,
  nowMs: number,
  cfg: SoloThrottleConfig,
): boolean {
  const cutoff = nowMs - cfg.windowMs;
  for (const [key, stamps] of ledger) {
    const live = stamps.filter((t) => t > cutoff);
    if (live.length === 0) ledger.delete(key);
    else if (live.length !== stamps.length) ledger.set(key, live);
  }
  const mine = ledger.get(ip) ?? [];
  if (mine.length >= cfg.limit) return false;
  mine.push(nowMs);
  ledger.set(ip, mine);
  return true;
}
