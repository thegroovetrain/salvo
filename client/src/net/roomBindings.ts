// Wires incoming frames to the client's net machinery: clock samples, the
// server mirror in state, own-ship snapshot buffer + predictor reconcile,
// contact snapshot buffers, and per-tick events (shell/boom/dmg/sunk/spawn +
// radar blips/sweep -> radar module). Spec frames (dead-in-active / match
// finished) flip state.spectating and ride the SAME contact pipeline. This is
// the only place server messages mutate client state (Colyseus messages are
// the only push in the one-way flow; everything else pulls).

import {
  CONFIG,
  HULL_IDS,
  MSG,
  hullEnvelope,
  type BallisticEvent,
  type BoomEvent,
  type BurstEvent,
  type DamageEvent,
  type FrameMsg,
  type GameEvent,
  type HealEvent,
  type OwnShip,
  type PointEvent,
  type ResultsMsg,
  type ShipClassId,
  type SpawnEvent,
  type SunkEvent,
  type UpgradeEvent,
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
import type { Mines } from '../render/mines.js';
import type { LitZones } from '../render/litZones.js';
import type { Decoys } from '../render/decoys.js';
import type { ShakeDriver } from '../render/shake.js';
import { killLine, pushKillLine } from '../ui/killFeed.js';
import { healToastLine, pointToastLine, pushUpgradeToast, upgradeLabel } from '../ui/upgradeToast.js';
import { fireTone, type ToneId } from '../audio/tones.js';

/**
 * A `shell` event fires a muzzle flash only when it reveals AT a ship we can
 * see — the shell wire shape no longer distinguishes a launch from a mid-flight
 * first-sight reveal (that distinction leaked the muzzle position; see
 * BallisticEvent's anti-cheat note). A genuine muzzle sits on a hull: our own
 * ship, or a sighted contact. A shell materializing in open water at our fog
 * boundary is a mid-flight reveal — no flash. `² of one hull length` as the
 * "on a ship" threshold (mounts sit within the hull footprint).
 */
const MAX_HULL_LEN = Math.max(...HULL_IDS.map((id) => hullEnvelope(id).hull.length));
const MUZZLE_NEAR2 = MAX_HULL_LEN * MAX_HULL_LEN;

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
  mines: Mines;
  /** Star-shell lit-zone glow overlay (render/litZones.ts) — synced contact-like
   *  from FrameMsg.litZones every tick, exactly like mines. */
  litZones: LitZones;
  /** Decoy-buoy markers (render/decoys.ts) — synced contact-like from
   *  FrameMsg.decoys every tick, exactly like mines/litZones (Story 1.8). */
  decoys: Decoys;
  /** Screen-shake driver (render/shake.ts) — triggered on own-ship damage. */
  shake: ShakeDriver;
  /** Tone player (audio/context.ts) — a minimal play-only surface here. */
  audio: { play: (id: ToneId) => void };
  /** Called when the own ship (re)spawns — snap the camera, etc. */
  onOwnSpawn: (x: number, y: number) => void;
  /**
   * Fired when the authoritative own class OR upgrade counts first arrive (or
   * ever change) on `you` — the client trusts the server, not the localStorage
   * guess. The handler recomputes effectiveStats(cls, upg) and swaps the
   * predictor kinematics, own-hull visuals, HUD denominators, radar rings/
   * sweep period, camera zoom, and fog hole to match (main.applyOwnStats —
   * the Stage D extension of the old onOwnClass seam).
   */
  onOwnStats: (cls: ShipClassId, upg: readonly number[]) => void;
  /**
   * Reset the throttle order to neutral. Called on own spawn (respawn + the
   * match-activation teleport) and own sunk, so a set engine order never
   * carries across a hard state boundary — the captain re-rings the telegraph.
   */
  resetThrottle: () => void;
  /**
   * Revert the primed skillshot back to the gun (slot 0). Called on own sunk so
   * a torpedo/mine prime never survives death into the next life — state-reset
   * symmetry with the engine order (resetThrottle) and the server-side pools.
   */
  resetPrime: () => void;
  /** Roster name lookup (public schema) for the kill feed. */
  names: (id: string) => string;
  /** Fired ONCE when the first spec frame arrives (enter spectate mode). */
  onSpectate: () => void;
  /** The one end-of-match results broadcast. */
  onResults: (msg: ResultsMsg) => void;
  /** The room connection ended (any reason). */
  onRoomLeave: (code: number) => void;
  /**
   * A non-consented socket drop while the SDK auto-reconnects the same room
   * (RECONNECTING banner). Two routes end at onRoomLeave: a fast-fail when the
   * seat is already gone (first retry refused, ~200ms), or retry exhaustion
   * against an unreachable server across the grace span.
   */
  onDrop: () => void;
  /** The SDK re-established the same room within grace (clear the banner). */
  onReconnect: () => void;
}

/**
 * Cross-callback resume state. A reconnect resumes mid-flight: the ship's
 * authoritative pose does not ride the onReconnect signal — it arrives on the
 * NEXT frame's `you`. So we arm a one-shot camera snap here and consume it in
 * handleFrame, completing the handleSpawn mirror (clear → forceSnap → snap).
 */
interface ResumeState {
  pendingSnap: boolean;
}

/** Attach frame/results/error/leave handling to a completed connection. */
export function bindRoom(conn: Connection, deps: RoomBindingDeps): void {
  const resume: ResumeState = { pendingSnap: false };
  conn.sink.handler = (f) => handleFrame(f, deps, resume);
  conn.room.onMessage(MSG.results, (msg: ResultsMsg) => {
    deps.state.matchOver = true;
    deps.onResults(msg);
  });
  conn.room.onError((code, message) => {
    console.error('[net] room error', code, message);
  });
  conn.room.onLeave((code) => {
    console.warn('[net] left room', code);
    deps.onRoomLeave(code);
  });
  // Story 0.2: same-Room auto-reconnect signals. onDrop fires on an abnormal
  // close while the SDK retries the same room (token-authenticated, listeners
  // intact); onReconnect fires when a retry re-establishes the room.
  conn.room.onDrop(() => {
    console.warn('[net] connection dropped — auto-reconnecting');
    // ACCEPTED LIMITATION (0.2): prediction keeps sampling + applying local
    // input through the outage. The SDK buffers only the last 10 sends and the
    // server holds the LAST RECEIVED input, so the on-screen ship diverges under
    // un-acked steering until the resume forceSnap corrects it. The richer
    // freeze/flag UX (visibly park the hull, disable controls) is Epic 6.7.
    deps.onDrop();
  });
  conn.room.onReconnect(() => {
    console.info('[net] reconnected — resuming ship');
    // We missed frames during the gap and the ship kept sailing server-side.
    // Mirror handleSpawn FULLY: drop the stale own-ship interp history, re-init
    // prediction (forceSnap clears the pending-input ring), and arm the camera
    // snap for the first resumed frame — after up to 60s pilotless the hull can
    // be far from where local prediction left it, so without the snap the player
    // gets a cross-map camera chase. onOwnSpawn fires in handleFrame once the
    // authoritative pose (you.x/you.y) actually arrives.
    deps.ownBuffer.clear();
    deps.predictor.forceSnap();
    resume.pendingSnap = true;
    deps.onReconnect();
  });
}

function handleFrame(f: FrameMsg, deps: RoomBindingDeps, resume: ResumeState): void {
  deps.clock.addSample(f.t);
  const net = deps.state.net;
  net.tick = f.tick;
  net.ackSeq = f.ackSeq;
  if (f.spec && !deps.state.spectating) {
    deps.state.spectating = true;
    deps.onSpectate();
  }
  if (f.you) {
    // Trust the server's class + upgrade counts over any local guess: on the
    // first frame (or any change to either) recompute the effective stats and
    // swap every consumer (predictor/HUD/radar/camera/fog) to match.
    if (ownStatsChanged(f.you, net.you)) deps.onOwnStats(f.you.cls, f.you.upg);
    net.you = f.you;
    deps.state.phase = 'active';
    if (f.you.alive) deps.state.respawnEta = null;
    deps.ownBuffer.push({ t: f.t, x: f.you.x, y: f.you.y, heading: f.you.heading, speed: f.you.speed });
    if (deps.state.mode === 'predict') deps.predictor.onServerState(f.you, f.ackSeq);
    deps.radar.onSweepSample(f.you.sweep, f.t); // authoritative sweep anchor
    // First authoritative pose after a reconnect: snap the camera to the resumed
    // hull (completes the handleSpawn mirror), consuming the one-shot flag.
    if (resume.pendingSnap) {
      resume.pendingSnap = false;
      deps.onOwnSpawn(f.you.x, f.you.y);
    }
  }
  deps.contacts.pushFrame(f.t, f.contacts);
  deps.mines.sync(f.mines); // contact-like: reconcile the mine field every tick
  // Star-shell lit zones, same contact-like reconcile. Frames OMIT the key when
  // the observer sees no zones, so treat a missing key as an empty list; the
  // own ship id tints own (green) vs enemy (amber) zones (render/litZones.ts).
  const litZones = f.litZones ?? [];
  deps.litZones.sync(litZones, deps.state.net.sessionId);
  // Decoy buoys, same contact-like reconcile. Frames OMIT the key when the
  // observer sees no buoys, so treat a missing key as an empty list. The
  // own/enemy split rides DecoyView.own inside the Decoys renderer (own → chart,
  // enemy → world; render/decoys.ts), so no sessionId is threaded here; no state
  // mirror needed either (buoys are chart markers; nothing derives per-frame).
  deps.decoys.sync(f.decoys ?? []);
  // Mirror the raw list into state (net → state → render): the render loop
  // derives the own ACTIVE zones from it to keep beyond-sight shells alive
  // (projectiles) and clear the own fog over them (fog).
  net.litZones = litZones;
  handleEvents(f, deps);
}

/**
 * Pure: did the own class or upgrade counts change between frames? Cheap
 * array-equality (14 numbers) — this gates the (heavier) effective-stats
 * recompute in deps.onOwnStats, so it runs on change only, not per frame.
 */
export function ownStatsChanged(next: OwnShip, prev: OwnShip | null | undefined): boolean {
  if (!prev || next.cls !== prev.cls) return true;
  if (next.upg.length !== prev.upg.length) return true;
  for (let i = 0; i < next.upg.length; i++) {
    if (next.upg[i] !== prev.upg[i]) return true;
  }
  return false;
}

/** Fan every per-tick event out to the right subsystem. */
function handleEvents(f: FrameMsg, deps: RoomBindingDeps): void {
  for (const e of f.events) handleEvent(e, f, deps);
}

/** World/combat events (position + fire + hit); self-private rewards split out. */
function handleEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps): void {
  switch (e.k) {
    case 'spawn': handleSpawn(e, deps); return;
    case 'sunk': handleSunk(e, f.t, deps); return;
    case 'shell': handleShell(e, deps); return;
    case 'torp': handleTorp(e, deps); return;
    case 'blip': deps.radar.onBlip(e); return;
    case 'boom': handleBoom(e, deps); return;
    case 'burst': handleBurst(e, deps); return;
    case 'dmg': handleDamage(e, deps); return;
  }
  handleRewardEvent(e, deps);
}

/** Killer/self-private reward events: upgrade grant, banked point, heal spend. */
function handleRewardEvent(e: GameEvent, deps: RoomBindingDeps): void {
  switch (e.k) {
    case 'upg': handleUpgrade(e, deps); return;
    case 'pt': handlePoint(e, deps); return;
    case 'heal': handleHeal(e, deps); return;
  }
}

/**
 * A kill banked an upgrade point: prompt toast + a bright "point" ping. Like
 * `upg`/`dmg`, `pt` is self-private (perception.ts forwards it only to the
 * earner), so the id check is defensive, not load-bearing. The authoritative
 * bank count rides OwnShip.pts — this is UX only, and must NOT touch the
 * effectiveStats/fog recompute path (see ownStatsChanged).
 */
function handlePoint(e: PointEvent, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  pushUpgradeToast(pointToastLine());
  deps.audio.play('point');
}

/**
 * A heal spend landed: toast the clamped delta + the "spent" upgrade two-note.
 * Self-private like `pt`; the authoritative hp rides OwnShip.hp.
 */
function handleHeal(e: HealEvent, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  pushUpgradeToast(healToastLine(e.amount));
  deps.audio.play('upgrade');
}

/**
 * Kill-reward upgrade toast + tone. `upg` is only ever emitted to the killer
 * itself (perception.ts's killer-private rule, mirroring dmg), so this always
 * fires for the local player — the id check is defensive, not load-bearing.
 * The authoritative stat change rides OwnShip.upg (onOwnStats); this is UX.
 */
function handleUpgrade(e: UpgradeEvent, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  pushUpgradeToast(upgradeLabel(e.type));
  deps.audio.play('upgrade');
}

function handleShell(e: BallisticEvent, deps: RoomBindingDeps): void {
  deps.projectiles.onShell(e);
  // Muzzle flash only when the reveal sits on a hull we can see (own ship or a
  // sighted contact) — a mid-flight fog-boundary reveal gets no flash.
  if (nearVisibleShip(e.x, e.y, deps)) deps.effects.spawnEffect('muzzle', e.x, e.y);
  // Own-fire tone: for the shooter, reveal position == launch position == the
  // shooter's own hull, so "near own ship" is a reliable (if not airtight)
  // own-shot signal — the same heuristic the muzzle flash above already uses.
  if (nearOwnShip(e.x, e.y, deps)) deps.audio.play(fireTone('gun'));
}

/** Torpedoes are a "quiet weapon" — no muzzle flash for onlookers (per the
 *  plan: a fish you can't see coming is the point) — but the shooter still
 *  gets an own-fire whoosh, using the same near-own-ship heuristic as guns. */
function handleTorp(e: BallisticEvent, deps: RoomBindingDeps): void {
  deps.projectiles.onShell(e);
  if (nearOwnShip(e.x, e.y, deps)) deps.audio.play(fireTone('torpedo'));
}

/** True iff (x,y) is within one hull length of the own ship specifically. */
function nearOwnShip(x: number, y: number, deps: RoomBindingDeps): boolean {
  const you = deps.state.net.you;
  return !!you && near2(x, y, you.x, you.y);
}

/** True iff (x,y) is within one hull length of the own ship or any live contact. */
function nearVisibleShip(x: number, y: number, deps: RoomBindingDeps): boolean {
  if (nearOwnShip(x, y, deps)) return true;
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

/**
 * A gun shell burst at its target point: spawn the burst ring (sized to
 * CONFIG.gun.burstRadius) and terminate the dead-reckoned shell render (same
 * removal semantics as a boom). Damage arrives separately as victim-private
 * `dmg` events; an early-intercept detonation stays on the `boom` spark/splash
 * branch (handleBoom above).
 */
function handleBurst(e: BurstEvent, deps: RoomBindingDeps): void {
  deps.projectiles.onBurst(e);
  deps.effects.spawnEffect('burst', e.x, e.y);
}

function handleSunk(e: SunkEvent, t: number, deps: RoomBindingDeps): void {
  const pos = sunkPosition(e.id, deps);
  if (pos) deps.effects.spawnEffect('sink', pos.x, pos.y);
  pushKillLine(killLine(deps.names(e.id), e.by ? deps.names(e.by) : null));
  const sessionId = deps.state.net.sessionId;
  if (e.id === sessionId) {
    // In active this ETA is never used (the same frame carries spec:true and
    // spectate mode owns the overlay); in waiting the respawn overlay reads it.
    deps.state.respawnEta = t + CONFIG.ship.respawnDelay;
    deps.state.killerId = e.by ?? null; // follow-your-killer default
    deps.resetThrottle(); // a sunk ship's engine order clears — respawn starts at STOP
    deps.resetPrime(); // and the primed skillshot reverts to the gun for the next life
    deps.audio.play('sink');
  } else {
    deps.contactViews.markSunk(e.id);
    if (e.by === sessionId) deps.audio.play('kill'); // your victim went down
  }
}

/**
 * Own-ship damage: shake + a thud. `dmg` is only ever emitted to the victim
 * itself (perception.ts's worldEventForObserver never forwards another ship's
 * dmg amount to onlookers), so this always fires for the local player — the
 * id check is defensive, not load-bearing.
 */
function handleDamage(e: DamageEvent, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  deps.shake.trigger(e.amount);
  deps.audio.play('damage');
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
    deps.resetThrottle(); // spawn/teleport starts stopped — the setting doesn't carry over
    deps.ownBuffer.clear(); // teleport: snap, don't interpolate across the map
    deps.predictor.forceSnap(); // re-init prediction from the next frame
    deps.onOwnSpawn(e.x, e.y);
  } else {
    deps.contacts.clear(e.id); // same snap rule for a respawning contact
    deps.contactViews.markSpawn(e.id);
  }
}
