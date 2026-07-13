// Wires incoming frames to the client's net machinery: clock samples, the
// server mirror in state, own-ship snapshot buffer + predictor reconcile,
// contact snapshot buffers, and per-tick events (shell/boom/dmg/sunk/spawn +
// radar blips/sweep -> radar module). This is the only place server messages
// mutate client state (Colyseus messages are the only push in the one-way
// flow; everything else pulls).

import {
  CONFIG,
  type BallisticEvent,
  type BoomEvent,
  type FrameMsg,
  type SpawnEvent,
  type SunkEvent,
} from '@salvo/shared';
import type { GameState } from '../state.js';
import type { Predictor } from '../sim/prediction.js';
import type { Connection } from './connection.js';
import type { ServerClock } from './clock.js';
import { ContactStore, SnapshotBuffer } from './snapshots.js';
import type { ContactViews } from '../render/contacts.js';
import type { Projectiles } from '../render/projectiles.js';
import type { Effects } from '../render/effects.js';
import type { Radar } from '../render/radar.js';
import { showBanner } from '../util/banner.js';

/**
 * A `shell` event fires a muzzle flash only when it reveals AT a ship we can
 * see — the shell wire shape no longer distinguishes a launch from a mid-flight
 * first-sight reveal (that distinction leaked the muzzle position; see
 * BallisticEvent's anti-cheat note). A genuine muzzle sits on a hull: our own
 * ship, or a sighted contact. A shell materializing in open water at our fog
 * boundary is a mid-flight reveal — no flash. `² of one hull length` as the
 * "on a ship" threshold (mounts sit within the hull footprint).
 */
const MUZZLE_NEAR2 = CONFIG.ship.length * CONFIG.ship.length;

export interface RoomBindingDeps {
  state: GameState;
  clock: ServerClock;
  /** Own-ship snapshot history (drives the -50ms interp render mode). */
  ownBuffer: SnapshotBuffer;
  contacts: ContactStore;
  contactViews: ContactViews;
  predictor: Predictor;
  projectiles: Projectiles;
  effects: Effects;
  radar: Radar;
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
    if (f.you.alive) deps.state.respawnEta = null;
    deps.ownBuffer.push({ t: f.t, x: f.you.x, y: f.you.y, heading: f.you.heading, speed: f.you.speed });
    if (deps.state.mode === 'predict') deps.predictor.onServerState(f.you, f.ackSeq);
    deps.radar.onSweepSample(f.you.sweep, f.t); // authoritative sweep anchor
  }
  deps.contacts.pushFrame(f.t, f.contacts);
  handleEvents(f, deps);
}

/** Fan every per-tick event out to the right subsystem. */
function handleEvents(f: FrameMsg, deps: RoomBindingDeps): void {
  for (const e of f.events) {
    switch (e.k) {
      case 'spawn': handleSpawn(e, deps); break;
      case 'sunk': handleSunk(e, f.t, deps); break;
      case 'shell': handleShell(e, deps); break;
      case 'blip': deps.radar.onBlip(e); break;
      case 'boom': handleBoom(e, deps); break;
      // 'dmg' resolved via the boom's `hit` flash; kept for future HUD hooks.
    }
  }
}

function handleShell(e: BallisticEvent, deps: RoomBindingDeps): void {
  deps.projectiles.onShell(e);
  // Muzzle flash only when the reveal sits on a hull we can see (own ship or a
  // sighted contact) — a mid-flight fog-boundary reveal gets no flash.
  if (nearVisibleShip(e.x, e.y, deps)) deps.effects.spawnEffect('muzzle', e.x, e.y);
}

/** True iff (x,y) is within one hull length of the own ship or any live contact. */
function nearVisibleShip(x: number, y: number, deps: RoomBindingDeps): boolean {
  const you = deps.state.net.you;
  if (you && near2(x, y, you.x, you.y)) return true;
  for (const id of deps.contacts.ids()) {
    const p = deps.contacts.get(id)?.newest;
    if (p && near2(x, y, p.x, p.y)) return true;
  }
  return false;
}

function near2(x: number, y: number, cx: number, cy: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= MUZZLE_NEAR2;
}

function handleBoom(e: BoomEvent, deps: RoomBindingDeps): void {
  deps.projectiles.onBoom(e);
  if (e.hit) {
    deps.effects.spawnEffect('spark', e.x, e.y);
    if (e.hit !== deps.state.net.sessionId) deps.contactViews.flash(e.hit);
  } else {
    deps.effects.spawnEffect('splash', e.x, e.y);
  }
}

function handleSunk(e: SunkEvent, t: number, deps: RoomBindingDeps): void {
  const pos = sunkPosition(e.id, deps);
  if (pos) deps.effects.spawnEffect('sink', pos.x, pos.y);
  if (e.id === deps.state.net.sessionId) {
    deps.state.respawnEta = t + CONFIG.ship.respawnDelay;
  } else {
    deps.contactViews.markSunk(e.id);
  }
}

/** Last known world position of a ship that just sank (own or a contact). */
function sunkPosition(id: string, deps: RoomBindingDeps): { x: number; y: number } | null {
  if (id === deps.state.net.sessionId) {
    const you = deps.state.net.you;
    return you ? { x: you.x, y: you.y } : null;
  }
  return deps.contacts.get(id)?.newest ?? null;
}

function handleSpawn(e: SpawnEvent, deps: RoomBindingDeps): void {
  if (e.id === deps.state.net.sessionId) {
    deps.state.respawnEta = null;
    deps.ownBuffer.clear(); // teleport: snap, don't interpolate across the map
    deps.predictor.forceSnap(); // re-init prediction from the next frame
    deps.onOwnSpawn(e.x, e.y);
  } else {
    deps.contacts.clear(e.id); // same snap rule for a respawning contact
    deps.contactViews.markSpawn(e.id);
  }
}
