// Wires incoming frames to the client's net machinery: clock samples, the
// server mirror in state, own-ship snapshot buffer + predictor reconcile,
// contact snapshot buffers, and per-tick events (shell/boom/dmg/sunk/spawn +
// radar blips/sweep -> radar module). Spec frames (dead-in-active / match
// finished) flip state.spectating and ride the SAME contact pipeline. This is
// the only place server messages mutate client state (Colyseus messages are
// the only push in the one-way flow; everything else pulls).

import {
  BOON_CATALOG,
  CONFIG,
  HULL_IDS,
  MSG,
  boonStackCount,
  hullEnvelope,
  type BallisticEvent,
  type BoomEvent,
  type BoonFitEvent,
  type BurstEvent,
  type DamageEvent,
  type DeniedView,
  type FrameMsg,
  type GameEvent,
  type LitZoneView,
  type OwnShip,
  type PointEvent,
  type ResultsMsg,
  type ShipClassId,
  type SpawnEvent,
  type SunkEvent,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
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
import { pointToastLine, pushUpgradeToast } from '../ui/upgradeToast.js';
import { boonFitToastLine } from '../ui/boonCopy.js';
import { fireTone, fitDetune, fitTone, type ToneId } from '../audio/tones.js';
import { pierceOrder, type OwnFire } from '../render/projectiles.js';

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
  /** Tone player (audio/context.ts) — a minimal play-only surface here. The
   *  optional `detune` (cents) carries the fit cue's per-category transposition. */
  audio: { play: (id: ToneId, opts?: { detune?: number }) => void };
  /**
   * THE OWN-FIRE CORRELATION (Story 2.9). CLAIMS the click-time own-fire latch
   * (sim/ownFire.ts): which weapon the local captain fired a moment ago —
   * 'gun' | 'cannon' | 'torpedo' | 'starShells' — or null if we did not just
   * shoot. main.ts latches it at CLICK time (the primed slot's equipment id, on
   * a click its own prediction says will fire) and expires it after a short
   * window, so an own reveal materializing on our own bow can be attributed to
   * the weapon that actually made it.
   *
   * The claim is ONE-SHOT and this is a MUTATING call: one click is one round,
   * so the first reveal to claim it consumes it and every later reveal in the
   * same window reads generic. Call it exactly once per reveal, and ONLY for a
   * reveal that already looks like ours (`nearOwnShip`) — an unconditional call
   * would burn the latch on somebody else's shell.
   *
   * This exists because the ballistic wire shape is deliberately constant-free:
   * a `shell` event says nothing about which barrel it left, and MUST NOT — the
   * moment it did, an onlooker could read a build off a shot. So the client
   * pairs a self-private click with an own-looking reveal. It is a heuristic,
   * exactly like the muzzle-flash/own-fire-tone `nearOwnShip` test it composes
   * with, and it fails SAFE in both directions: a miss renders the ordinary
   * shell look and plays the gun crack (pre-2.9 behavior), and it can never
   * misattribute another ship's shell, because a reveal that is not on our own
   * hull never consults it.
   */
  ownFireWeapon: () => OwnFire;
  /** Called when the own ship (re)spawns — snap the camera, etc. */
  onOwnSpawn: (x: number, y: number) => void;
  /**
   * Fired when the authoritative own class OR boon list first arrive (or ever
   * change) on `you` — the client trusts the server, not the localStorage
   * guess. The handler resolves the boon ids (fail-closed), recomputes
   * effectiveStats(cls, boons), and swaps the predictor kinematics + behavior
   * hooks, own-hull visuals, HUD denominators, radar rings/sweep period,
   * camera zoom, and fog hole to match (main.applyOwnStats — the Stage D
   * onOwnClass seam, grown the boons leg in Story 2.5; the legacy upgrade-
   * counts leg died with the wholesale strip in Story 2.8).
   */
  onOwnStats: (cls: ShipClassId, boons: readonly string[]) => void;
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
   * Also called on RECONNECT: a resume is the same kind of hard boundary, and a
   * prime left standing from before the outage would fire the wrong weapon on
   * the player's first click back (they expect the default gun).
   */
  resetPrime: () => void;
  /** Roster name lookup (public schema) for the kill feed. */
  names: (id: string) => string;
  /**
   * Kill-feed name color (Story 1.12): a vessel id → the CSS-ready personal hue
   * for its feed span (bright hue for a human, drone-outline for a drone), or null
   * for a roster miss (the name inherits text-secondary). The feed text-safes it.
   */
  colors: (id: string) => number | null;
  /**
   * Ordnance-marker tint (Story 1.12): a mine/decoy/lit-zone firer id (`by`) →
   * that pilot's BRIGHT personal hue (the SAME hue for every observer), or null
   * while the roster hasn't synced the firer (or the firer left). The renderer
   * paints the amber fallback for a null and retries per frame until it resolves.
   */
  ordnanceHue: (by: string) => number | null;
  /**
   * A SELF-PRIVATE server denial arrived on the frame (Story 1.10 —
   * FrameMsg.denied, one call per entry). main.ts routes it through the
   * (slot, seq) exactly-one-feedback dedup: a client-predicted denial already
   * fed back suppresses the echo; an unpredicted one (the stale-ammo races)
   * triggers the full pulse + chip flash + denial tone late-but-explicit.
   */
  onDenied: (d: DeniedView) => void;
  /**
   * EVERY observed sinking (Story 2.3): the victim id + the credited killer id
   * (null for a storm / unattributed death). main.ts folds it into the personal
   * score accumulator and, when the victim is US in a live match, opens the
   * elimination results modal. Fired for our own sinking too, so the accumulator
   * and the modal share one edge.
   */
  onSunkObserved: (victimId: string, killerId: string | null) => void;
  /**
   * The self-private `bn` (boon fitted) event for the local captain arrived —
   * the server's RECEIPT for a spend (Story 2.7). main.ts marks the spend latch
   * acked, which releases it as a 'success' no matter what `pts`/the front offer
   * look like: a passive bank landing in the same frame as a coincidentally
   * identical re-roll can hide both of those signals, and the latch would then
   * time out and fire the denied pulse on a spend that demonstrably LANDED (the
   * ◆ FITTED toast this same event pushes). Net calls a callback; it never
   * reaches into main (one-way data flow).
   */
  onSpendAck: () => void;
  /**
   * A boon just landed, with the CATEGORY it landed on (Story 2.9): main.ts
   * latches the fit flash on the slot that category belongs to — or, for a
   * shipwide INTEL/SHIP line that no slot owns, on the whole hotbar frame
   * (amendment 51: the visible change is slot-side, never the hull). The tone
   * is played here (it is a cue, and cues live with their events); the flash is
   * a render latch, so net calls a callback rather than reaching into main.
   */
  onBoonFitted: (category: string) => void;
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
  /** Was the PROP-FOULING slow window running on the previous frame? The tell's
   *  cue fires on the RISING edge only: a refresh extends the window (the server
   *  takes the later expiry), and re-announcing it every tick would turn a
   *  status change into a machine-gun. The falling edge is silent — the line
   *  simply disappears, which is the whole visual twin doing its job. */
  slowed: boolean;
  /** ...and the same for the DAZZLE window. */
  dazzled: boolean;
  /**
   * Server time (ms) of the last frame on which the own hull stood inside SOME
   * enemy incendiary zone — the burn classifier's memory (see readsAsBurn).
   * `-Infinity` until we have ever been in one, so a hull that has never been
   * on fire can never read a hit as fire.
   */
  burningAt: number;
}

/** Attach frame/results/error/leave handling to a completed connection. */
export function bindRoom(conn: Connection, deps: RoomBindingDeps): void {
  const resume: ResumeState = { pendingSnap: false, slowed: false, dazzled: false, burningAt: -Infinity };
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
    // The prime is client-only UX and does NOT survive the gap: revert to the
    // gun exactly as the sunk path does, so the first click back never fires a
    // stale torpedo/mine the player forgot they had primed.
    deps.resetPrime();
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
    // Trust the server's class + fitted boons over any local guess: on the
    // first frame (or any change to either) recompute the effective stats and
    // swap every consumer (predictor/HUD/radar/camera/fog) to match.
    if (ownStatsChanged(f.you, net.you)) deps.onOwnStats(f.you.cls, f.you.boons);
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
  // Contact-like reconciles. Story 1.12: the marker tint is the FIRER's personal
  // hue (MineView/DecoyView/LitZoneView `by` → deps.ordnanceHue), the same hue for
  // every observer; the own/enemy discriminator (`own`) now only drives the fog
  // layer + brightness inside each renderer.
  deps.mines.sync(f.mines, deps.ordnanceHue); // reconcile the mine field every tick
  // Star-shell lit zones, same reconcile. Frames OMIT the key when the observer
  // sees no zones, so treat a missing key as an empty list.
  const litZones = f.litZones ?? [];
  deps.litZones.sync(litZones, deps.ordnanceHue);
  // Decoy buoys, same reconcile. Frames OMIT the key when the observer sees no
  // buoys, so treat a missing key as an empty list.
  deps.decoys.sync(f.decoys ?? [], deps.ordnanceHue);
  // Mirror the raw list into state (net → state → render): the render loop
  // derives the own ACTIVE zones from it to keep beyond-sight shells alive
  // (projectiles) and clear the own fog over them (fog).
  net.litZones = litZones;
  routeVictimTells(f, deps, resume);
  trackBurning(f, deps, resume);
  routeDenials(f, deps);
  handleEvents(f, deps, resume);
}

/**
 * The BURN classifier's memory (Story 2.9): stamp this frame's server time
 * whenever the own hull is standing in SOME other captain's incendiary zone.
 * handleDamage reads it through a grace window rather than re-testing the
 * geometry, because fire's damage arrives AFTER the fact: the server aggregates
 * incendiary ticks into 500ms windows with a death flush (Story 2.8 review), so
 * the last flush routinely lands on a frame where we have already sailed clear
 * — or where the zone itself has expired off the list — and reading that as an
 * ordinary slam misnames the thing that killed you.
 *
 * Zone geometry is only ever tested against a `you` on THIS frame: a spectator
 * frame carries no hull, and the last one is a lie by then.
 */
function trackBurning(f: FrameMsg, deps: RoomBindingDeps, s: ResumeState): void {
  if (!f.you) return;
  if (inEnemyBurningZone(deps.state.net.litZones, f.you, deps.state.net.sessionId)) s.burningAt = f.t;
}

/**
 * Pure: is a victim window (`slowedUntil` / `dazzledUntil`) running at server
 * time `t`? An absent field is a window that never started. Measured against
 * the FRAME's own `t` — exact server time, not the local clock estimate — so
 * the edge cannot chatter on clock jitter around the expiry instant.
 */
export function windowRunning(until: number | undefined, t: number): boolean {
  return (until ?? 0) > t;
}

/**
 * The victim tells (Story 2.9): SLOWED and DAZZLED each fire their cue on the
 * RISING edge of their window and nothing on the falling one. The visual twin
 * is the HUD status line the same fields drive (render/hud.ts drawTells) —
 * plus, for dazzle, the sight hole already shrinking (render/fog.ts) — so the
 * information is on screen whether or not the sound is.
 *
 * Both fields are victim-private on `you`: nobody else's affliction ever
 * reaches this client, and a spectator frame (no `you`) simply clears both.
 */
function routeVictimTells(f: FrameMsg, deps: RoomBindingDeps, s: ResumeState): void {
  const slowed = windowRunning(f.you?.slowedUntil, f.t);
  const dazzled = windowRunning(f.you?.dazzledUntil, f.t);
  if (slowed && !s.slowed) deps.audio.play('slowed');
  if (dazzled && !s.dazzled) deps.audio.play('dazzled');
  s.slowed = slowed;
  s.dazzled = dazzled;
}

/** Self-private denied presses (Story 1.10): frames OMIT the key when none,
 *  so a missing key is an empty list. Each entry routes through main.ts's
 *  exactly-one-feedback dedup (predicted-first suppresses the echo). */
function routeDenials(f: FrameMsg, deps: RoomBindingDeps): void {
  for (const d of f.denied ?? []) deps.onDenied(d);
}

/**
 * Pure: did the own class or the fitted-boon list change between frames? Cheap
 * array-equality over the boon ids (Story 2.8: the legacy 14-number `upg`
 * vector died with the strip, so boons are the whole stat input) — this gates
 * the (heavier) effective-stats recompute in deps.onOwnStats, so it runs on
 * change only, not per frame. Two identical lists in fresh arrays (every frame
 * reallocates) must NOT fire it, and REPEATED ids are meaningful (a stack), so
 * the comparison stays element-wise and order-sensitive.
 */
export function ownStatsChanged(next: OwnShip, prev: OwnShip | null | undefined): boolean {
  if (!prev || next.cls !== prev.cls) return true;
  return !sameList(next.boons, prev.boons);
}

/** Element-wise equality of two flat lists (numbers or strings). */
function sameList(a: readonly (number | string)[], b: readonly (number | string)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Fan every per-tick event out to the right subsystem. */
function handleEvents(f: FrameMsg, deps: RoomBindingDeps, s: ResumeState): void {
  for (const e of f.events) handleEvent(e, f, deps, s);
}

/** World/combat events (position + fire + hit); self-private rewards split out. */
function handleEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps, s: ResumeState): void {
  switch (e.k) {
    case 'spawn': handleSpawn(e, deps); return;
    case 'sunk': handleSunk(e, f.t, deps); return;
    case 'shell': handleShell(e, deps); return;
    case 'torp': handleTorp(e, deps); return;
    case 'torpU': deps.projectiles.onBallisticUpdate(e); return;
    case 'blip': deps.radar.onBlip(e); return;
    case 'boom': handleBoom(e, deps); return;
    case 'burst': handleBurst(e, deps); return;
    case 'dmg': handleDamage(e, f, deps, s); return;
  }
  handleRewardEvent(e, f, deps);
}

/** Self-private reward events: the banked level and the fitted boon. (The
 *  'heal' event left the wire with the REPAIR spend — Story 2.1, PV 12; the
 *  killer-private 'upg' grant left with the legacy upgrade strip — Story 2.8,
 *  PV 16.) */
function handleRewardEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps): void {
  switch (e.k) {
    case 'pt': handlePoint(e, f, deps); return;
    case 'bn': handleBoonFit(e, deps); return;
  }
}

/**
 * Pure: is the captain who owns this frame dead or spectating? A SPECTATOR
 * frame (dead-in-active, or the finished phase) omits `you` entirely, and a
 * dead-in-waiting captain's `you` reports `alive: false`. Either way there is no
 * live hull to refit.
 */
export function frameIsDeadOrSpectating(f: FrameMsg): boolean {
  return !f.you || !f.you.alive;
}

/**
 * A level banked: prompt toast + a bright "point" ping. Like `upg`/`dmg`, `pt`
 * is self-private (perception.ts forwards it only to the earner), so the id
 * check is defensive, not load-bearing. The authoritative bank count rides
 * OwnShip.pts — this is UX only, and must NOT touch the effectiveStats/fog
 * recompute path (see ownStatsChanged).
 *
 * AMENDMENT 37: a DEAD/SPECTATING captain gets NO level-up toast. A posthumous
 * kill still banks the level server-side (ratified 2.6 behavior, unchanged), but
 * "LEVEL UP — TAB TO REFIT" is a lie to a corpse: there is no refit surface
 * while spectating. Suppressed entirely — tone included, since every audio cue
 * must have a visual twin.
 */
function handlePoint(e: PointEvent, f: FrameMsg, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  if (frameIsDeadOrSpectating(f)) return;
  pushUpgradeToast(pointToastLine());
  deps.audio.play('point');
}

/**
 * A banked level was SPENT and a boon fitted (Story 2.7): the fitted toast on
 * the existing upgrade-toast surface (UX-DR23 — self events only) plus the
 * fit cue. `bn` is self-private (perception forwards it only to
 * the spender), so the id check is defensive, not load-bearing. Deliberately
 * NOT dead-gated: spending while dead is legal (ratified 2.6/2.7), and the
 * confirmation that the spend landed is exactly what the player needs.
 * The authoritative boon list rides OwnShip.boons (onOwnStats); this is UX.
 *
 * It is ALSO the spend latch's ack (deps.onSpendAck — see the dep's note): the
 * one unambiguous "your spend landed" signal on the wire, where every other
 * release clause is an inference off `you` that a same-frame passive bank can
 * mask.
 */
function handleBoonFit(e: BoonFitEvent, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  // Name the rung the card showed: `you` on THIS frame already carries the new
  // boon (handleFrame applies it before the events fan out), so the occurrence
  // count IS the fitted position — 1 for a first fit, 3 for the third HEAVY
  // SHELLS. A defensive 0 (no `you`) floors to the ladder's first name.
  pushUpgradeToast(boonFitToastLine(e.boon, boonStackCount(deps.state.net.you?.boons ?? [], e.boon)));
  // STORY 2.9 — the fit is no longer one generic two-note for all 42 lines: the
  // cue is WEIGHTED BY TIER (fitTone) and the flash lands on the CATEGORY's own
  // slot. Both read off the shared catalog, fail-open (a junk/unknown id still
  // gets the common weight and a rank-wide flash) — FR22 makes silence the
  // defect, so no branch here may end without a cue.
  // The TIER picks the cue's weight; the CATEGORY transposes it (fitDetune, in
  // cents) so two commons fitted back to back on different slots are audibly
  // different events without becoming different cues. Both fail open: an
  // unknown id lands on the common weight at the untransposed root.
  const def = Object.hasOwn(BOON_CATALOG, e.boon) ? BOON_CATALOG[e.boon] : undefined;
  deps.audio.play(fitTone(def?.rarity), { detune: fitDetune(def?.category ?? '') });
  deps.onBoonFitted(def?.category ?? '');
  deps.onSpendAck();
}

/**
 * A gun/cannon shell was revealed. For the SHOOTER, reveal position == launch
 * position == our own hull, so "near own ship" is a reliable (if not airtight)
 * own-shot signal — the same heuristic the muzzle flash already uses. Story 2.9
 * composes it with the click-time weapon latch (deps.ownFireWeapon) so an own
 * CANNON shot lands with the weight it should have had all along: its own heavy
 * report (the `fireCannon` tone, which until now no callsite ever played), a
 * bigger muzzle flash, and a heavier shell in flight, plus the doctrine look
 * for whichever cannon exclusive we hold. An onlooker's side of the event is
 * BYTE-IDENTICAL to before — the wire cannot say "cannon" and must not.
 */
function handleShell(e: BallisticEvent, deps: RoomBindingDeps): void {
  // The latch is claimed ONCE, and only for a reveal already sitting on our own
  // hull — see the ownFireWeapon dep note (a claim consumes).
  const own = nearOwnShip(e.x, e.y, deps) ? ownShellWeapon(deps) : null;
  deps.projectiles.onShell(e, own);
  // Muzzle flash only when the reveal sits on a hull we can see (own ship or a
  // sighted contact) — a mid-flight fog-boundary reveal gets no flash.
  if (nearVisibleShip(e.x, e.y, deps)) {
    deps.effects.spawnEffect(own === 'cannon' ? 'muzzleHeavy' : 'muzzle', e.x, e.y);
  }
  if (own) deps.audio.play(fireTone(shellFireId(own)));
}

/**
 * Pure-ish: which own weapon an own-looking SHELL reveal came out of. The
 * latched click intent wins when it agrees with the reveal's KIND — a shell can
 * be the gun, the cannon or a star shell (all three ride the `shell` kind), and
 * a standing TORPEDO claim cannot dress one, so it degrades to the gun.
 *
 * The fallback IS pre-2.9 behavior, and it is where every unclaimed own shell
 * lands: the generic shell look plus the gun crack. Never guesses upward — the
 * cannon's weight (its heavy muzzle, its heavy report, its doctrine look) is
 * spent ONLY against a live claim, so a second shell inside one 400ms window,
 * or an enemy shell revealed on our bow, can never wear it.
 */
function ownShellWeapon(deps: RoomBindingDeps): OwnFire {
  const fired = deps.ownFireWeapon();
  return fired === 'cannon' || fired === 'gun' || fired === 'starShells' ? fired : 'gun';
}

/** Pure: the own-fire cue a claimed shell weapon reports with. The star shell
 *  earns its own launch report (Story 2.9: every fitted line is felt); anything
 *  the claim could not name falls to the gun crack. */
function shellFireId(own: OwnFire): 'gun' | 'cannon' | 'starShells' {
  if (own === 'cannon') return 'cannon';
  return own === 'starShells' ? 'starShells' : 'gun';
}

/** A steering torpedo re-anchored its track (Story 2.8 — ACOUSTIC HOMING).
 *  Pure render bookkeeping: no tone, no flash, no muzzle heuristic — the fish
 *  was already revealed, this only keeps the dead reckoning honest. Handled
 *  inline above (deps.projectiles.onBallisticUpdate).
 */

/**
 * Torpedoes are a "quiet weapon" — no muzzle flash for onlookers (per the plan:
 * a fish you can't see coming is the point) — but the shooter still gets an
 * own-fire whoosh, using the same near-own-ship heuristic as guns.
 *
 * The LOOK and the TONE part company here, deliberately. The whoosh on
 * `nearOwnShip` alone PREDATES Story 2.9 and stays exactly as it was (it is the
 * same heuristic the muzzle flash has always used, and this patch is not the
 * place to retune an old cue). The homing LOOK is new, and misinformation:
 * dressing a fish as OUR steering torpedo because it happened to surface on our
 * bow tells the player their own doctrine is in the water when an ENEMY's fish
 * is. So the look is spent only against a claimed torpedo latch — an enemy fish
 * near our hull renders the generic straight-runner, and earns the homing look
 * the instant it visibly steers (onBallisticUpdate), like every other observer's.
 */
function handleTorp(e: BallisticEvent, deps: RoomBindingDeps): void {
  const near = nearOwnShip(e.x, e.y, deps);
  const own: OwnFire = near && deps.ownFireWeapon() === 'torpedo' ? 'torpedo' : null;
  deps.projectiles.onShell(e, own);
  if (near) deps.audio.play(fireTone('torpedo'));
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

/**
 * An impact. Story 2.9 reads the boom's ID as well as its position: a DERIVED
 * `<shellId>#p<order>` id is an ARMOR-PIERCING punch-through — the shell went
 * through that hull and is still flying — and gets the collapsing pierce ring
 * instead of the ordinary hit spark. That is the ONLY enemy-side AP tell, and
 * it is legal for the same reason the homing steer is: the derived id is
 * already on the wire (it has to be, so the boom cannot retire the live track),
 * and what it describes — a hit that did not end the shell — is on screen
 * anyway. An unrecognized suffix falls straight through to the generic path.
 */
function handleBoom(e: BoomEvent, deps: RoomBindingDeps): void {
  deps.projectiles.onBoom(e);
  if (e.hit) {
    deps.effects.spawnEffect(pierceOrder(e.id ?? '') === null ? 'spark' : 'pierce', e.x, e.y);
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
  const killer = e.by ? { name: deps.names(e.by), id: e.by } : null;
  pushKillLine(killLine({ name: deps.names(e.id), id: e.id }, killer), deps.colors);
  const sessionId = deps.state.net.sessionId;
  // Story 2.3: the personal-score accumulator + the elimination modal ride the
  // SAME observed sinking the kill feed does — no new wire data.
  deps.onSunkObserved(e.id, e.by ?? null);
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
 *
 * STORY 2.9 — BURN IDENTITY. A tick taken because we are STANDING IN FIRE is not
 * a slam: it plays the `burn` cue instead of the impact thud and shakes at a
 * fraction of the amplitude (the tone plus the burning water under the hull
 * carry it — a full-strength shake per DoT tick reads as being shelled, which is
 * a lie about what is happening). The 300ms same-source floor is respected
 * upstream: the server aggregates incendiary damage into 500ms windows with a
 * death flush (Story 2.8 review), so at most two of these land per second.
 *
 * The zone list is the one the client already holds (net → state, mirrored in
 * handleFrame) — no new wire data, and no way to mistake our OWN flare for a
 * hazard (`by !== self`; you cannot burn yourself).
 */
function handleDamage(e: DamageEvent, f: FrameMsg, deps: RoomBindingDeps, s: ResumeState): void {
  if (e.id !== deps.state.net.sessionId) return;
  const burn = readsAsBurn(e.amount, f.t - s.burningAt);
  deps.shake.trigger(burn ? e.amount * CLIENT_CONFIG.litZone.burnShakeScale : e.amount);
  deps.audio.play(burn ? 'burn' : 'damage');
}

/**
 * How long (ms) after the own hull last stood in enemy fire a damage event may
 * still read as a BURN. Tied to the server's 500ms incendiary aggregation window
 * (Story 2.8 review): the flush for a window we spent burning can arrive a tick
 * or two after we sailed clear — or after the zone expired off the frame list —
 * and 600ms covers that lag with a tick of slack, without stretching so far that
 * a genuine shell landing seconds later inherits the burn read. Draft value
 * (draft-copy rule); the aggregation window is the thing it must track.
 */
const BURN_GRACE_MS = 600;

/**
 * The largest damage amount a single incendiary flush can be (hp), derived so
 * the cap moves when the doctrine is retuned: the DoT rate × the server's 0.5s
 * aggregation window, ×4 headroom for a hull sitting in several overlapping
 * burning patches at once. Anything bigger than that arrived some other way —
 * a torpedo, a shell, a mine — and must read as the slam it was, however much
 * fire happens to be on the water. Draft headroom factor (draft-copy rule).
 */
const BURN_AMOUNT_CAP = CONFIG.starShells.incendiaryDps * 0.5 * 4;

/**
 * Pure: does a damage event read as FIRE rather than as an impact? Both halves
 * have to hold — recency (we were standing in an enemy incendiary zone within
 * the grace window) AND size (it is small enough to be a DoT flush). Each half
 * fixes a real lie the geometry-only test told: a torpedo slamming a hull that
 * happens to be parked in a burning patch read as a gentle crackle, and the last
 * flush of a fire that just went out read as a shell hit.
 */
export function readsAsBurn(amount: number, sinceBurningMs: number): boolean {
  return sinceBurningMs <= BURN_GRACE_MS && amount <= BURN_AMOUNT_CAP;
}

/**
 * Pure: is `p` standing in some OTHER captain's burning (INCENDIARY) zone?
 *
 * Deliberately does NOT re-check the zone's expiry: a zone that is still in the
 * frame's list is still live by construction (the server rebuilds that list per
 * observer per tick, and drops expired zones), and the damage event we are
 * classifying arrived on that same frame.
 */
export function inEnemyBurningZone(
  zones: readonly LitZoneView[],
  p: { x: number; y: number },
  selfId: string,
): boolean {
  for (const z of zones) {
    if (z.mode !== 'incendiary' || z.by === selfId) continue;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    if (dx * dx + dy * dy <= z.r * z.r) return true;
  }
  return false;
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
