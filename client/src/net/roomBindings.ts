// Wires incoming frames to the client's net machinery: clock samples, the
// server mirror in state, own-ship snapshot buffer + predictor reconcile,
// contact snapshot buffers, and the per-tick event queue. This is the only
// place server messages mutate client state (Colyseus messages are the only
// push in the one-way flow; everything else pulls).

import type { FrameMsg, GameEvent, SpawnEvent } from '@salvo/shared';
import type { GameState } from '../state.js';
import type { Predictor } from '../sim/prediction.js';
import type { Connection } from './connection.js';
import type { ServerClock } from './clock.js';
import { ContactStore, SnapshotBuffer } from './snapshots.js';
import { showBanner } from '../util/banner.js';

export interface RoomBindingDeps {
  state: GameState;
  clock: ServerClock;
  /** Own-ship snapshot history (drives the -50ms interp render mode). */
  ownBuffer: SnapshotBuffer;
  contacts: ContactStore;
  predictor: Predictor;
  /** Called when the own ship (re)spawns — snap the camera, etc. */
  onOwnSpawn: (x: number, y: number) => void;
}

/** Attach frame/error/leave handling to a completed connection. */
export function bindRoom(conn: Connection, deps: RoomBindingDeps): void {
  conn.sink.handler = (f) => handleFrame(f, deps);
  conn.room.onError((code, message) => {
    console.error('[net] room error', code, message);
    showBanner(`ROOM ERROR ${code}`, { error: true });
  });
  conn.room.onLeave((code) => {
    console.warn('[net] left room', code);
    showBanner('DISCONNECTED', { error: true });
  });
}

function handleFrame(f: FrameMsg, deps: RoomBindingDeps): void {
  deps.clock.addSample(f.t);
  const net = deps.state.net;
  net.tick = f.tick;
  net.ackSeq = f.ackSeq;
  if (f.you) {
    net.you = f.you;
    deps.state.phase = 'active';
    deps.ownBuffer.push({ t: f.t, x: f.you.x, y: f.you.y, heading: f.you.heading, speed: f.you.speed });
    if (deps.state.mode === 'predict') deps.predictor.onServerState(f.you, f.ackSeq);
  }
  deps.contacts.pushFrame(f.t, f.contacts);
  handleEvents(f.events, deps);
}

/**
 * Minimal event handling for steps 5-6: spawn snaps (no cross-map interp),
 * sunk logs. Combat/fog steps (8-10) consume shell/boom/dmg/blip from here —
 * this switch is the seam they extend.
 */
function handleEvents(events: readonly GameEvent[], deps: RoomBindingDeps): void {
  for (const e of events) {
    if (e.k === 'spawn') handleSpawn(e, deps);
    else if (e.k === 'sunk') console.log(`[net] sunk: ${e.id}${e.by ? ` by ${e.by}` : ''}`);
  }
}

function handleSpawn(e: SpawnEvent, deps: RoomBindingDeps): void {
  if (e.id === deps.state.net.sessionId) {
    console.log(`[net] own ship spawned at (${e.x.toFixed(0)}, ${e.y.toFixed(0)})`);
    deps.ownBuffer.clear(); // teleport: snap, don't interpolate across the map
    deps.predictor.forceSnap(); // re-init prediction from the next frame
    deps.onOwnSpawn(e.x, e.y);
  } else {
    deps.contacts.clear(e.id); // same snap rule for a respawning contact
  }
}
