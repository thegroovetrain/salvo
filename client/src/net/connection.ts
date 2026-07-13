// Colyseus connection: joinOrCreate('arena'), welcome handshake, and the
// deterministic map rebuild from welcome.mapSeed (islands never travel on the
// wire). Frames are routed through a mutable sink so roomBindings can attach
// after the welcome resolves without re-registering message handlers.

import { Client, type Room } from 'colyseus.js';
import { generateMap, MSG, type FrameMsg, type GameMap, type WelcomeMsg } from '@salvo/shared';

const WELCOME_TIMEOUT_MS = 5000;

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
  });
}

/** Join the arena and complete the welcome handshake. Throws on failure. */
export async function connect(name?: string): Promise<Connection> {
  const client = new Client(wsEndpoint());
  const room = await client.joinOrCreate('arena', name ? { name } : {});
  const sink: FrameSink = { handler: () => undefined };
  room.onMessage(MSG.frame, (f: FrameMsg) => sink.handler(f));
  const welcome = await waitForWelcome(room);
  return { room, welcome, sink };
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
