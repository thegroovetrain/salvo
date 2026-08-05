// Colyseus connection: joinOrCreate('arena'), welcome handshake, and the
// deterministic map rebuild from welcome.mapSeed (islands never travel on the
// wire). Frames are routed through a mutable sink so roomBindings can attach
// after the welcome resolves without re-registering message handlers.

import { Client, type Room } from '@colyseus/sdk';
import {
  generateMap,
  MSG,
  PROTOCOL_VERSION,
  REGATTA_HUES,
  type FrameMsg,
  type GameMap,
  type PingMsg,
  type RadarGrammar,
  type RadarIdentity,
  type WelcomeMsg,
} from '@salvo/shared';

const WELCOME_TIMEOUT_MS = 5000;

/** localStorage key for the persisted Regatta color preference — same
 *  `hullcracker.*` family the home uses for name/class (home.ts). Exported so the
 *  Color Hoist writer (classSelect.ts) and this reader share ONE literal. */
export const COLOR_PREF_KEY = 'hullcracker.color';

/**
 * The persisted Regatta hue PREFERENCE (0..19) if a valid one is stored, else
 * undefined (the no-preference path). Story 1.12 only PLUMBS this join option —
 * no UI writes the key yet (the Color Hoist picker is Story 1.14). The server
 * re-sanitizes the value (sanitizeColorPref) regardless.
 */
export function loadColorPref(): number | undefined {
  try {
    const raw = localStorage.getItem(COLOR_PREF_KEY);
    // Reject absent AND empty/whitespace-only BEFORE Number(): Number('') and
    // Number('   ') both coerce to 0, which would silently forward a bogus
    // colorPref: 0 for a never-written key rather than the no-preference path.
    if (raw === null || raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < REGATTA_HUES.length ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Session-lifetime fallback for `ensureColorPref()` when storage cannot persist
 * the roll (blocked/private-mode/quota-exceeded localStorage). Without this, a
 * remount in that environment would reroll a DIFFERENT hue every call —
 * `ensureColorPref()` promised the whole home/bay chrome (and `connect()`'s join
 * options) the SAME hue for the session, which a bare in-memory-only fallback
 * can't keep once the function is called again. A valid STORED value always
 * takes precedence over this cache (see below) so an explicit pick (which
 * writes storage) or a cross-tab edit still wins at read time.
 */
let sessionColorPref: number | undefined;

/**
 * The persisted Regatta hue preference (0..19), NEVER null. If `loadColorPref()`
 * finds a valid stored index, it is returned unchanged — a valid preference is
 * never rerolled — and it refreshes `sessionColorPref` so a later storage
 * failure still falls back to this same value. Otherwise (absent key, or the
 * corrupt/out-of-range/empty cases `loadColorPref` already rejects): if this
 * session already rolled one (persisted or not), reuse it — never reroll
 * within a session. Only when neither exists is a uniform random index rolled;
 * persistence is attempted (best-effort) so home/modal/join all agree on the
 * SAME hue from the very first paint (Story 1.14: unset color no longer falls
 * back to amber), and the roll is cached for the rest of the session even if
 * `localStorage.setItem` throws. Single owner of the no-pref case —
 * classSelect.ts's ColorHoist seeds from this, not from loadColorPref() directly.
 */
export function ensureColorPref(): number {
  const existing = loadColorPref();
  if (existing !== undefined) {
    sessionColorPref = existing;
    return existing;
  }
  if (sessionColorPref !== undefined) return sessionColorPref;
  const idx = Math.floor(Math.random() * REGATTA_HUES.length);
  try {
    localStorage.setItem(COLOR_PREF_KEY, String(idx));
  } catch {
    // storage unavailable — the roll still stands for this session, it just
    // won't persist across reloads (same idiom as classSelect.ts's saveColorPref).
  }
  sessionColorPref = idx;
  return idx;
}

/** Test-only: clear the in-memory session color-preference cache (mirrors the
 *  server's `resetMetrics`/`__setNowSource` test-only convention). Without this,
 *  one test's `ensureColorPref()`/`connect()` call would seed `sessionColorPref`
 *  and leak it into every later test in the same file, since the cache is
 *  module-level state that outlives any single test. */
export function __resetSessionColorPrefForTests(): void {
  sessionColorPref = undefined;
}

/**
 * How many same-Room auto-reconnect attempts the SDK makes before giving up.
 *
 * The server holds a dropped ship for CONFIG.net.reconnectGraceSeconds = 60s
 * (story 0.2). We want the client's retry span to cover that whole window so a
 * captain whose network recovers late in the grace still resumes their hull.
 *
 * The SDK backoff (Room.ts) is `floor(2^attempt * delay)` with delay=100ms,
 * clamped to [minDelay 100ms, maxDelay 5000ms]. Cumulative time to the Nth
 * attempt (seconds): 0.2, 0.6, 1.4, 3.0, 6.2, then +5.0 each →
 *   attempt 15 ≈ 56.2s, 16 ≈ 61.2s, 17 ≈ 66.2s, 18 ≈ 71.2s.
 * Attempts 1–15 all fall inside the 60s grace; 18 keeps trying a bit past it so
 * server-side drop-detection skew can't make us give up while the seat is still
 * held. Attempts after grace expiry are harmless (server rejects → SDK falls
 * through to onLeave). The bounded extra RECONNECTING time is acceptable; richer
 * reconnect UX is Epic 6.7.
 *
 * NOTE: the SDK's minUptime default (5000ms) is left in place — a drop within 5s
 * of joining fires onLeave directly and does NOT auto-resume (accepted
 * limitation; a fresh captain simply reconnects from the menu).
 */
export const RECONNECT_MAX_RETRIES = 18;

export interface FrameSink {
  handler: (f: FrameMsg) => void;
}

export interface Connection {
  room: Room;
  welcome: WelcomeMsg;
  /** Every "f" frame flows through sink.handler — set by bindRoom(). */
  sink: FrameSink;
}

/**
 * Client-only server health probe (Story 1.14) for the home status line — NOT a
 * new server endpoint (Eric ruling: probe the existing HTTP surface). Fires a
 * best-effort request at the server's HTTP origin, derived from the SAME
 * env/origin logic `connect()` uses (`wsEndpoint()`, ws→http / wss→https), with
 * a short abort timeout. Resolves `true` if the origin answered at all (a CORS-
 * opaque `no-cors` response still resolves = reachable), `false` on any network
 * failure or timeout. Never throws — a rejected fetch is caught. Independent of
 * the actual matchmake attempt, which still governs CONNECTING / failure copy.
 */
export async function probeServer(timeoutMs = 4000): Promise<boolean> {
  const url = wsEndpoint().replace(/^ws/, 'http'); // ws→http, wss→https
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, { method: 'GET', mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** WS endpoint: VITE_WS_URL override > dev default :2567 > same origin. */
export function wsEndpoint(): string {
  const env = import.meta.env;
  if (env?.VITE_WS_URL) return env.VITE_WS_URL as string;
  if (env?.DEV) return 'ws://localhost:2567';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}`;
}

function waitForWelcome(room: Room): Promise<WelcomeMsg> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timed out waiting for welcome')),
      WELCOME_TIMEOUT_MS,
    );
    room.onMessage(MSG.welcome, (msg: WelcomeMsg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    room.onError((code, message) => {
      clearTimeout(timer);
      reject(new Error(`room error ${code}: ${message ?? ''}`));
    });
    // A socket close during the handshake would otherwise strand the player
    // on a black screen until the timeout: bindRoom only attaches its onLeave
    // after the welcome resolves. Reject immediately instead. (Harmless once
    // settled — the signal keeps this listener, but the promise is done.)
    room.onLeave((code) => {
      clearTimeout(timer);
      reject(new Error(`connection closed during welcome handshake (code ${code})`));
    });
  });
}

/** Join the arena and complete the welcome handshake. Throws on failure. */
export async function connect(name?: string, cls?: string): Promise<Connection> {
  const client = new Client(wsEndpoint());
  // `pv` is the join-time protocol gate: the server's onAuth rejects a missing
  // or mismatched PROTOCOL_VERSION with a "version mismatch" ServerError that
  // startGame() surfaces on the menu status line. Reconnects bypass onAuth, so
  // they are never re-gated.
  const opts: { pv: number; name?: string; cls?: string; colorPref?: number } = { pv: PROTOCOL_VERSION };
  if (name) opts.name = name;
  if (cls) opts.cls = cls;
  // Story 1.12/1.14: always forward the resolved color preference — `ensureColorPref()`
  // never returns undefined (stored value, session-cached roll, or a fresh roll),
  // so the hue the home/bay chrome tinted with is the exact hue the server assigns,
  // even when localStorage.setItem throws (blocked/private/quota storage). The
  // server assigns FCFS and re-sanitizes regardless.
  opts.colorPref = ensureColorPref();
  const room = await client.joinOrCreate('arena', opts);
  // Story 0.2 re-enables the 0.17 SDK's same-Room auto-reconnect: on an abnormal
  // close the SDK fires onDrop and retries the SAME room with the reconnection
  // token (all onMessage bindings survive), landing on onReconnect. The server
  // now holds the ship for CONFIG.net.reconnectGraceSeconds, so those retries
  // reach a seat that is still reserved. maxRetries is sized to span that grace
  // window (see RECONNECT_MAX_RETRIES). Two failure routes both end at
  // onLeave(FAILED_TO_RECONNECT) → the DISCONNECTED banner, same as a hard drop:
  //   (1) fast-fail — when the seat is already gone (a drop during waiting/
  //       countdown, or a dead spectator whose teardown already ran), the FIRST
  //       retry is refused by the server and the SDK gives up in ~200ms, no loop;
  //   (2) exhaustion — against an unreachable server the retries run out across
  //       the whole grace span before giving up.
  room.reconnection.enabled = true;
  room.reconnection.maxRetries = RECONNECT_MAX_RETRIES;
  const sink: FrameSink = { handler: () => undefined };
  room.onMessage(MSG.frame, (f: FrameMsg) => sink.handler(f));
  // App-level ping echo (D1 RTT measurement): the server pings on an interval;
  // echo the nonce back IMMEDIATELY so its round-trip is a clean RTT sample.
  // Registered here (pre-welcome, alongside the frame handler) so it is live as
  // early as possible after join and — like every onMessage binding — survives
  // the SDK's same-room auto-reconnect for the whole session. Stateless.
  room.onMessage(MSG.ping, (msg: PingMsg) => room.send(MSG.ping, { n: msg.n }));
  try {
    const welcome = await waitForWelcome(room);
    return { room, welcome, sink };
  } catch (err) {
    // Welcome timed out or the room errored — we already joined, so leave to
    // avoid stranding an occupied room slot the client never uses. Best
    // effort: swallow any leave() failure and rethrow the original error.
    void room.leave().catch(() => undefined);
    throw err;
  }
}

/**
 * Map a failed joinOrCreate into a menu status line. The server's join-time
 * `pv` gate rejects a stale bundle with `ServerError(AUTH_FAILED, …)`, which the
 * SDK preserves as a MatchMakeError carrying that exact CODE (525). Discriminate
 * primarily on the code so a clean refresh prompt shows only for a real version
 * rejection; an unrelated failure whose text merely contains "version" (a ws
 * protocol error, a proxy page) must NOT tell the player to refresh futilely.
 * The exact-phrase fallback covers only errors that carry no code (e.g. a
 * welcome timeout is a plain Error). Every other failure keeps the dev-friendly
 * "is the server running" hint rather than leaking a raw socket error.
 */
export function connectErrorStatus(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const isVersionGate = code === 525 || (code == null && /version mismatch/i.test(msg));
  if (isVersionGate) return 'VERSION MISMATCH — PLEASE REFRESH THE PAGE';
  return 'CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?';
}

/** The room's radar modes, as announced ONCE in the welcome handshake. */
export interface RadarModes {
  grammar: RadarGrammar;
  identity: RadarIdentity;
}

/** Today's shipped behavior — the fallback both fields resolve to. */
const DEFAULT_RADAR_MODES: RadarModes = { grammar: 'silhouette', identity: 'roster' };

/**
 * The room's radar grammar + identity, read off the welcome (cycle 50,
 * amendment 52). These are SERVER flags: the room picks one grammar for the
 * whole match and announces it here, which is why `BlipEvent` can be a TAGLESS
 * union — every blip in a given match has the same shape and a per-event
 * discriminator would be dead weight on a 20Hz channel.
 *
 * The client therefore narrows every blip on THIS value and never by probing
 * which fields happen to exist on an event. Field-probing would be a second,
 * silently-diverging source of truth for the same question, and it would happily
 * mis-read a `return` blip that legitimately carried `ext: 0`.
 *
 * Unrecognized or absent values fall back to today's behavior — fail-safe, never
 * fail-open, the same posture the server takes when reading its env vars. The
 * fields are REQUIRED by `WelcomeMsg` and the PV gate gives both sides the same
 * union, so this can only fire against a non-conforming server; when it does, the
 * shipped grammar is the safe landing.
 */
export function radarModes(welcome: WelcomeMsg): RadarModes {
  const w = welcome as Partial<WelcomeMsg>;
  return {
    grammar: w.radarGrammar === 'return' ? 'return' : DEFAULT_RADAR_MODES.grammar,
    identity: w.radarIdentity === 'pseudonym' ? 'pseudonym' : DEFAULT_RADAR_MODES.identity,
  };
}

/**
 * Regenerate the server's map from the welcome. The server sends the exact
 * `playerCap` it sized the map against, so the client feeds it straight into
 * generateMap (no radius-formula inversion) for an identical island field.
 * Sanity-checked against welcome.mapRadius.
 */
export function mapFromWelcome(welcome: WelcomeMsg): GameMap {
  const map = generateMap(welcome.mapSeed, welcome.playerCap);
  if (Math.abs(map.radius - welcome.mapRadius) > 1e-6) {
    console.warn(
      `[net] regenerated map radius ${map.radius} != welcome mapRadius ${welcome.mapRadius}`,
    );
  }
  return map;
}
