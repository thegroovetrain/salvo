// The home screen's LIVENESS POLL (Story 6.6) — the client half of the public
// `GET /liveness` route. It answers the only question the port could not answer
// before: is anyone here, and is a Standard match about to start?
//
// THIS IS A REAL FETCH, NOT THE `probeServer` NO-CORS PING. `probeServer`
// (net/connection.ts) deliberately uses `mode:'no-cors'` because it only needs
// to know whether the origin answered AT ALL — an opaque response is enough for
// a health light and reads no body. This one needs the JSON, so it is a normal
// CORS request; the server side is free because Colyseus prepends
// `Access-Control-Allow-Origin: *` to every router response.
//
// EVERYTHING HERE FAILS SAFE. A network error, a non-2xx, a timeout, a body
// that is not JSON, or a payload whose shape does not hold ALL resolve to
// `null` — "unavailable" — and nothing in this module ever throws into the home
// screen. The home renders no liveness block and no button sub-line in that
// case, and the deploy doors stay fully usable: the port must never be blocked,
// delayed or error-toasted by a decorative-until-it-arrives number.
//
// THE COUNTDOWN'S CLOCK. The payload carries an ABSOLUTE `queue.deadlineAt` (so
// the client can tick a smooth countdown between 10s polls) plus `serverNow`
// (so a wrong client clock cannot corrupt it). `localizeDeadline()` folds the
// two together ONCE, at the boundary, rewriting `deadlineAt` into the CLIENT's
// own epoch — which is why `ui/home.ts` may subtract a plain `Date.now()` and
// stay clock-free. Doing the correction here rather than in the UI keeps the
// skew explicit and keeps exactly one place that knows about it.

import type { LivenessPayload } from '@salvo/shared';
import { wsEndpoint } from './connection.js';

/** Poll cadence. Slow on purpose: the countdown ticks LOCALLY between polls, so
 *  a faster poll would buy nothing and cost a driver query per visitor. */
const DEFAULT_POLL_MS = 10_000;

/** Abort bound. Matches `probeServer`'s 4s — an unanswered port must not leave
 *  a request (and its `AbortController`) alive across the whole home session. */
const DEFAULT_TIMEOUT_MS = 4000;

/** The route's URL, off the SAME origin logic `connect()`/`probeServer()` use
 *  (`wsEndpoint()`, ws→http / wss→https). A trailing slash on a `VITE_WS_URL`
 *  override is trimmed so the path never doubles up. */
export function livenessUrl(): string {
  const origin = wsEndpoint().replace(/^ws/, 'http').replace(/\/+$/, '');
  return `${origin}/liveness`;
}

// --- the shape guard (pure, tested) ------------------------------------------

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** `deadlineAt` is nullable BY CONTRACT (null = unarmed), so null passes here
 *  while `undefined`/NaN/'123' do not. */
function finiteOrNull(v: unknown): boolean {
  return v === null || finite(v);
}

function isModeCount(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return false;
  const m = v as { players?: unknown; games?: unknown };
  return finite(m.players) && finite(m.games);
}

/** `queue: null` is the NORMAL empty state (the room auto-disposes), so it is
 *  valid; a queue object with a missing or non-numeric field is not. */
function isQueue(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const q = v as { pooled?: unknown; min?: unknown; cap?: unknown; deadlineAt?: unknown };
  return finite(q.pooled) && finite(q.min) && finite(q.cap) && finiteOrNull(q.deadlineAt);
}

function isModes(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return false;
  const m = v as { standard?: unknown; soloVsAi?: unknown };
  return isModeCount(m.standard) && isModeCount(m.soloVsAi);
}

/**
 * STRICT shape guard: a payload is either wholly trustworthy or it is
 * `null` (unavailable). There is no partial render — a home screen showing
 * `PLAYERS ONLINE: NaN` is worse than one showing nothing, and a
 * non-conforming server (an old deploy, a proxy's error page, a captive
 * portal's HTML) must resolve to the same silent absence as an outage.
 */
export function parseLiveness(raw: unknown): LivenessPayload | null {
  if (raw === null || typeof raw !== 'object') return null;
  const p = raw as { playersOnline?: unknown; liveGames?: unknown; serverNow?: unknown; queue?: unknown; modes?: unknown };
  if (!finite(p.playersOnline) || !finite(p.liveGames) || !finite(p.serverNow)) return null;
  if (!isQueue(p.queue) || !isModes(p.modes)) return null;
  return raw as LivenessPayload;
}

// --- clock skew (pure, tested) -----------------------------------------------

/** How far AHEAD of this client's clock the server's clock runs, in ms, at the
 *  instant the payload was received. Negative when the client is ahead. */
export function skewOffsetMs(p: LivenessPayload, receivedAtMs: number): number {
  return p.serverNow - receivedAtMs;
}

/**
 * Rewrite `queue.deadlineAt` from the SERVER's epoch into THIS CLIENT's, so a
 * countdown taken as `deadlineAt - Date.now()` is correct even on a machine
 * whose clock is minutes off. Returns the payload untouched when there is no
 * deadline to move (no queue room, or an unarmed pool), and never mutates.
 */
export function localizeDeadline(p: LivenessPayload, receivedAtMs: number): LivenessPayload {
  const q = p.queue;
  if (q === null || q.deadlineAt === null) return p;
  return { ...p, queue: { ...q, deadlineAt: q.deadlineAt - skewOffsetMs(p, receivedAtMs) } };
}

// --- the fetch + poll --------------------------------------------------------

/**
 * One best-effort read of `/liveness`. Resolves the RAW (server-clock) payload
 * or `null` for every failure mode — including an abort. Never rejects.
 *
 * `cancel` is the CALLER's abort signal, distinct from the internal timeout: a
 * poll that is torn down (the player pressed SOLO, the home went away) must be
 * able to drop the request it is already waiting on, not merely decline to
 * schedule the next one. See `startLivenessPoll.stop`.
 *
 * `cache: 'no-store'` for the same reason the server sends the header: every
 * figure here is live population, and `queue.deadlineAt` is an ABSOLUTE epoch,
 * so a response replayed out of the HTTP cache would freeze the register and
 * pin the countdown. Belt to the server's braces — an intermediary that ignores
 * one may still honour the other.
 */
export async function fetchLiveness(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cancel?: AbortSignal,
): Promise<LivenessPayload | null> {
  if (cancel?.aborted) return null;
  const ctrl = new AbortController();
  const abort = (): void => ctrl.abort();
  cancel?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const res = await fetch(livenessUrl(), { method: 'GET', cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return null;
    return parseLiveness(await res.json());
  } catch {
    return null; // network error, abort, or a body that is not JSON
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener('abort', abort);
  }
}

export interface LivenessPoll {
  /** Stop polling, ABORT any in-flight request, and suppress its response.
   *  Idempotent. */
  stop(): void;
}

export interface LivenessPollOpts {
  intervalMs?: number;
  timeoutMs?: number;
  /** Injected in tests — resolves the RAW (server-clock) payload, or null. */
  fetchOnce?: () => Promise<LivenessPayload | null>;
  /** Injected in tests — the client clock the skew correction is taken against. */
  now?: () => number;
}

/**
 * Poll `/liveness` on a SELF-CHAINED timer (each cycle schedules the next only
 * after the previous has settled), so a slow or hanging server can never stack
 * requests the way a bare `setInterval` would.
 *
 * The first read fires immediately — the home screen is already on the player's
 * eyes and a 10s blank would read as "broken" rather than "loading".
 */
export function startLivenessPoll(
  onLiveness: (payload: LivenessPayload | null) => void,
  opts: LivenessPollOpts = {},
): LivenessPoll {
  const intervalMs = opts.intervalMs ?? DEFAULT_POLL_MS;
  // ONE controller for the whole poll: `stop()` aborts whatever is in the air.
  // Without it a player who enters the port, deploys, is bounced back, and
  // repeats on a slow server accumulates abandoned requests, each living to its
  // own 4s timeout — the socket is held, and the response is parsed and thrown
  // away. Suppressing the callback (below) was never the same as cancelling.
  const cancel = new AbortController();
  const fetchOnce = opts.fetchOnce
    ?? ((): Promise<LivenessPayload | null> => fetchLiveness(opts.timeoutMs, cancel.signal));
  const now = opts.now ?? ((): number => Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const cycle = async (): Promise<void> => {
    let raw: LivenessPayload | null = null;
    try {
      raw = await fetchOnce();
    } catch {
      raw = null; // an injected fetcher that rejects is still just "unavailable"
    }
    if (stopped) return; // the home went away mid-flight; paint nothing
    try {
      onLiveness(raw === null ? null : localizeDeadline(raw, now()));
    } catch {
      // a throwing consumer must not kill the poll (or reject this promise)
    }
    timer = setTimeout(() => void cycle(), intervalMs);
  };
  void cycle();

  return {
    stop(): void {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      // Safe after the request has already settled (abort on a done fetch is a
      // no-op) and safe to repeat — and the abort surfaces in `fetchLiveness`'s
      // catch, so it resolves to "unavailable" exactly like an outage, which
      // `stopped` then suppresses rather than painting.
      cancel.abort();
    },
  };
}
