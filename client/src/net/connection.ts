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
  type WelcomeMsg,
} from '@salvo/shared';

const WELCOME_TIMEOUT_MS = 5000;

/** localStorage key for the persisted Regatta color preference — same
 *  `hullcracker.*` family the menu uses for name/class (menu.ts). */
const COLOR_PREF_KEY = 'hullcracker.color';

/**
 * The persisted Regatta hue PREFERENCE (0..19) if a valid one is stored, else
 * undefined (the no-preference path). Story 1.12 only PLUMBS this join option —
 * no UI writes the key yet (the Color Hoist picker is Story 1.14). The server
 * re-sanitizes the value (sanitizeColorPref) regardless.
 */
function loadColorPref(): number | undefined {
  try {
    const raw = localStorage.getItem(COLOR_PREF_KEY);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < REGATTA_HUES.length ? n : undefined;
  } catch {
    return undefined;
  }
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
  // Story 1.12: forward a persisted color preference when one exists (no UI writes
  // it yet — the picker is 1.14); the server assigns FCFS and re-sanitizes.
  const colorPref = loadColorPref();
  if (colorPref !== undefined) opts.colorPref = colorPref;
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
