// Wires incoming frames to the client's net machinery: clock samples, the
// server mirror in state, own-ship snapshot buffer + predictor reconcile,
// contact snapshot buffers, and per-tick events (shell/boom/dmg/sunk/spawn, the
// Story 4.3 gunnery rows mz/sp/hc, and radar blips/sweep -> radar module). Spec
// frames (dead-in-active / match
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
  type DeniedView,
  type FoghornEvent,
  type FrameMsg,
  type GameEvent,
  type HealEvent,
  type HitCallEvent,
  type LitZoneView,
  type MuzzleEvent,
  type OwnShip,
  type PointEvent,
  type ResultsMsg,
  type ShipClassId,
  type SpawnEvent,
  type SplashEvent,
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
import type { Smoke } from '../render/smoke.js';
import { bearingTo, bandGain, type Foghorn } from '../render/foghorn.js';
import type { Mines, OwnMineRings } from '../render/mines.js';
import type { LitZones } from '../render/litZones.js';
import type { Decoys } from '../render/decoys.js';
import type { ShakeDriver } from '../render/shake.js';
import { bountyKillLine } from '../ui/bounty.js';
import { killLine, pushKillLine, UNKNOWN_VESSEL } from '../ui/killFeed.js';
import { pointToastLine, pushUpgradeToast } from '../ui/upgradeToast.js';
import { boonFitToastLine } from '../ui/boonCopy.js';
import { fireTone, fitDetune, fitTone, worldCue, type ToneId, type WorldCue } from '../audio/tones.js';
import { pierceOrder, type OwnFire } from '../render/projectiles.js';
import { ImpactDedup, ToneFloor, hitCallToneFloor } from '../render/gunneryFeed.js';

/**
 * "Close enough to be OUR hull": the squared threshold (one full hull length,
 * the longest class's, since mounts sit inside the hull footprint) behind
 * `nearOwnShip`. It is what makes a ballistic reveal on our own bow readable as
 * OUR shot — the own-fire correlation's first gate (see the `ownFireWeapon` dep
 * note), which picks the own cannon's heavy flash and plays the own-fire cue.
 *
 * STORY 4.3 RETIRED ITS OTHER USE. Until now the same threshold also drove a
 * `nearVisibleShip` test that decided whether to draw a muzzle flash at all: a
 * shell revealing near ANY hull we could see was assumed to be a launch, and a
 * shell surfacing in open water at our fog boundary a mid-flight reveal. That
 * was a client-side GUESS standing in for information the server would not send,
 * and it is superseded by the `mz` row — the server now states, authoritatively
 * and neutrally, where and when a gun-family weapon fired, at the TRUE muzzle
 * rather than at a reveal point (which is the leak the Story 1.5 review closed).
 * The heuristic answers only the own-side question it can actually answer.
 */
const MAX_HULL_LEN = Math.max(...HULL_IDS.map((id) => hullEnvelope(id).hull.length));
const OWN_NEAR2 = MAX_HULL_LEN * MAX_HULL_LEN;

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
  /** Wounded-smoke plumes (render/smoke.ts) — accumulated from the anonymous
   *  `sm` pulses, exactly as radar blips are accumulated from `blip`. */
  smoke: Smoke;
  /** FOGHORN bearing chevrons (render/foghorn.ts, Story 4.5) — the honk's
   *  visual twin, accumulated from `fh` exactly as plumes are from `sm`. */
  foghorn: Foghorn;
  /**
   * The camera's CURRENT world-space centre — the SPECTATOR foghorn path's only
   * consumer (a spectator's honk arrives as a position, not a bearing, because
   * the free camera has no server-known position for the server to take one
   * from). A function, not a value: the camera moves every frame, and the
   * bearing must be taken at the instant the honk arrives.
   */
  cameraCenter: () => { x: number; y: number };
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
   *  optional `detune` (cents) carries the fit cue's per-category transposition;
   *  `pan`/`gain` are THE SOUND MAP's two knobs (Story 4.7), always computed by
   *  the pure `worldCue()` helper and never assembled by hand at a call site. */
  audio: {
    play: (id: ToneId, opts?: { detune?: number; pan?: number; gain?: number }) => void;
    /** Story 4.5: the foghorn's own play path (audio/context.ts). `hornId` is
     *  typed `string`, NOT `HornId`, on purpose — an id from a newer server
     *  must fall back to the default voice at runtime rather than fail a
     *  compile here (amendment 52's unknown-id rule). `gain` is the observer's
     *  tier multiplier, 0..1. The call can silently drop the honk at the mix's
     *  concurrency cap, which is why the chevron never rides on its result. */
    playHorn: (hornId: string, gain: number) => void;
  };
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
  /**
   * The burst-ring radius for an own-correlated burst, or undefined to keep the
   * CONFIG default (render/aimPreview.ownBurstRadius over the live own stats).
   * A function, not a value: effective stats are swapped wholesale whenever a
   * boon lands, and a captured snapshot would ring yesterday's blast.
   */
  ownBurstRadius: (own: OwnFire) => number | undefined;
  /**
   * The OWNER's live mine radii for the own-mine rings, stamped with the FRAME
   * time `t` the caller hands in (the arming window is server-side, so it is
   * measured against server timestamps, never a local receive time). Undefined
   * before own stats exist. A function, same reason as ownBurstRadius.
   */
  ownMineRings: (t: number) => OwnMineRings | undefined;
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
  /**
   * Reset the client's local foghorn cooldown gate (`Game.nextHonkAt`) to 0 —
   * ready. Called on own spawn ONLY (review fix), mirroring the server, which
   * clears `nextHonkAt` on both respawn and redeploy (world.ts). Deliberately
   * NOT called on reconnect (unlike resetPrime): a reconnect resumes an
   * in-progress life, and a mid-life cooldown the server still enforces must
   * keep holding, or the client would show a false-ready foghorn the very next
   * press would silently eat. Without this, dying and respawning inside the
   * old cooldown window leaves the client eating an otherwise-accepted press
   * with zero feedback (a denied honk is now silent by design — see
   * handleFoghornPress in main.ts — so a stale local gate would be invisible).
   */
  resetHonkCooldown: () => void;
  /** Roster name lookup (public schema) for the kill feed: the synced callsign,
   *  or null on a roster miss (a victim/killer who already left the room).
   *  NEVER a raw session id — handleSunk substitutes the neutral
   *  UNKNOWN_VESSEL label for a null, mirroring the score card's
   *  rosterNameOrNull rule (main.ts handleSunkObserved). */
  names: (id: string) => string | null;
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
 * Per-binding state that outlives a single frame — the frame-to-frame memory
 * the handlers need and the one cross-callback resume flag.
 *
 * The resume flag first: a reconnect resumes mid-flight, and the ship's
 * authoritative pose does not ride the onReconnect signal — it arrives on the
 * NEXT frame's `you`. So we arm a one-shot camera snap there and consume it in
 * handleFrame, completing the handleSpawn mirror (clear → forceSnap → snap).
 */
interface BindState {
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
  /** THE GUNNERY FEED (Story 4.3, render/gunneryFeed.ts). `impacts` is the
   *  per-frame one-mark-per-point claim that keeps a shooter who can SEE their
   *  own impact from drawing the public `boom` mark and the self-private
   *  `hc`/`sp` mark on top of each other; `hitCallTone` is the Hit Call cue's
   *  300ms same-source floor (nothing in the audio layer rate-limits). */
  impacts: ImpactDedup;
  hitCallTone: ToneFloor;
  /** THE SOUND MAP (Story 4.7): one 300ms same-source floor PER SOURCE FAMILY.
   *  Separate instances, not one shared floor — the floor is a statement about
   *  how often ONE source may speak, so a burst must never silence a report
   *  (they are different facts about different points, exactly as the Hit Call's
   *  three blooms are three facts about three points). */
  worldTones: Record<WorldFloorId, ToneFloor>;
  /**
   * THE SPLASH CUE's point claim (review gate) — the SECOND `ImpactDedup`, and
   * it exists because the two splash rows no longer share a floor.
   *
   * A shooter who can see their own miss receives the PUBLIC `boom` and the
   * SELF-PRIVATE `sp` in the same frame at byte-identical coordinates (the
   * server derives both from one resolution — render/gunneryFeed.ts). While the
   * two shared a floor that pair collapsed to one cue as a side effect; now that
   * `sp` has its own floor it would sound twice, so the collapse moves onto the
   * mechanism that actually performs it — POINT IDENTITY, order-independent,
   * exactly as the MARK claim does one line away.
   *
   * Deliberately a separate instance from `impacts`: that one is spent by the
   * first row to draw a mark, and reusing it would tie the cue to whether the
   * mark drew — the coupling both handlers' comments explicitly reject.
   */
  splashCues: ImpactDedup;
}

/**
 * The cues that are placed OUT IN THE WORLD (Story 4.7) — the only tones this
 * module ever plays with a pan/gain.
 */
type WorldToneId = 'gunReport' | 'impact' | 'splash' | 'sunkWitness';

/**
 * The FLOOR families — which is not the same list as the tone ids, in both
 * directions, and each difference is a ruling:
 *
 *   • `fallOfShot` is the self-private `sp` splash. Same TONE as the public
 *     one, its OWN floor: `sp` is the row Story 4.3 added so a shooter's misses
 *     render through fog and bracket-and-walk works (FR16), so it is the one
 *     splash carrying information the client cannot otherwise obtain. Letting an
 *     enemy's splash 200u away eat it would drop the informative cue for one the
 *     player can already see (review gate).
 *   • `sunkWitness` is ABSENT, and that asymmetry is deliberate: a hull sinks
 *     exactly once and a sinking is terminal, so it has no salvo to limit. The
 *     floor answers "how often may ONE SOURCE make a noise", and two hulls going
 *     down in a ring-closure scrum are two sources — the feed prints both lines
 *     and both must be heard. Do not "restore consistency" by floor-ing it.
 *
 * Adding a fifth world cue is a `tsc` error until it has decided which of those
 * two it is.
 */
type WorldFloorId = 'gunReport' | 'impact' | 'splash' | 'fallOfShot';

/**
 * The per-family tone floors, all on the RATIFIED 300ms same-source value
 * (`CLIENT_CONFIG.gunnery.hitCallToneFloorMs`, read — never restated as a
 * literal). Amendment 37 forbids inventing a second floor constant when one
 * already exists, and this is the same question that one answers: how often may
 * a single source make a noise.
 */
function worldToneFloors(): Record<WorldFloorId, ToneFloor> {
  const floorMs = CLIENT_CONFIG.gunnery.hitCallToneFloorMs;
  return {
    gunReport: new ToneFloor(floorMs),
    impact: new ToneFloor(floorMs),
    splash: new ToneFloor(floorMs),
    fallOfShot: new ToneFloor(floorMs),
  };
}

/** Attach frame/results/error/leave handling to a completed connection. */
export function bindRoom(conn: Connection, deps: RoomBindingDeps): void {
  const s: BindState = {
    pendingSnap: false,
    slowed: false,
    dazzled: false,
    burningAt: -Infinity,
    impacts: new ImpactDedup(),
    hitCallTone: hitCallToneFloor(),
    worldTones: worldToneFloors(),
    splashCues: new ImpactDedup(),
  };
  conn.sink.handler = (f) => handleFrame(f, deps, s);
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
    s.pendingSnap = true;
    // The prime is client-only UX and does NOT survive the gap: revert to the
    // gun exactly as the sunk path does, so the first click back never fires a
    // stale torpedo/mine the player forgot they had primed.
    deps.resetPrime();
    deps.onReconnect();
  });
}

function handleFrame(f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
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
    if (s.pendingSnap) {
      s.pendingSnap = false;
      deps.onOwnSpawn(f.you.x, f.you.y);
    }
  }
  deps.contacts.pushFrame(f.t, f.contacts);
  // Contact-like reconciles. Story 1.12: the marker tint is the FIRER's personal
  // hue (MineView/DecoyView/LitZoneView `by` → deps.ordnanceHue), the same hue for
  // every observer; the own/enemy discriminator (`own`) now only drives the fog
  // layer + brightness inside each renderer.
  // Own mines carry their owner-private radius rings (always-on, our stats,
  // THE FRAME's clock); enemy mines get exactly the marker they always got.
  // f.t — not a local clock reading: the arming dim measures a server-side
  // window, so both ends of it have to come off the server's own timestamps.
  deps.mines.sync(f.mines, deps.ordnanceHue, deps.ownMineRings(f.t));
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
  routeVictimTells(f, deps, s);
  trackBurning(f, deps, s);
  routeDenials(f, deps);
  handleEvents(f, deps, s);
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
function trackBurning(f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
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
function routeVictimTells(f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
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

/**
 * Fan every per-tick event out to the right subsystem.
 *
 * The batch opens by dropping the previous frame's impact claims (Story 4.3):
 * the public `boom` mark and the self-private `hc`/`sp` mark for one impact are
 * same-frame by construction, so the claim set lives exactly one frame — see
 * render/gunneryFeed.ts for why a longer memory would start eating legitimate
 * repeat marks.
 *
 * The own-damage aggregate is resolved FIRST, in a pre-pass, not at the end
 * (Eric ruling 2026-08-05): every `dmg` for this hull in this frame is one felt
 * hit at the summed magnitude, because a multi-barrel click can now land three
 * of them at once (see flushDamage). The pre-pass placement is load-bearing —
 * the server pushes `dmg` BEFORE the `sunk` it caused, so flushing after the
 * fan-out would play the sink cue ahead of the thud that earned it, inverting
 * the order the events were generated in. Damage is felt, then the hull goes.
 */
function handleEvents(f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
  s.impacts.beginFrame();
  s.splashCues.beginFrame(); // ...and the splash CUE's own same-frame point claim
  flushDamage(f, deps, s);
  for (const e of f.events) handleEvent(e, f, deps, s);
}

/** World/combat events (position + fire + hit); the accumulated sensor pulses,
 *  gunnery, and self-private rewards split out (one switch per group keeps each
 *  under the complexity ceiling). */
function handleEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
  switch (e.k) {
    case 'spawn': handleSpawn(e, deps); return;
    case 'sunk': handleSunk(e, f.t, deps); return;
    case 'shell': handleShell(e, deps); return;
    case 'torp': handleTorp(e, deps); return;
    case 'torpU': deps.projectiles.onBallisticUpdate(e); return;
    case 'boom': handleBoom(e, f.t, deps, s); return;
    case 'burst': handleBurst(e, f.t, deps, s); return;
    case 'dmg': return; // own damage is felt once, in handleEvents' pre-pass (flushDamage)
  }
  handlePulseEvent(e, f, deps, s);
}

/**
 * THE ACCUMULATED PULSES — the three rows where THE SERVER KEEPS NO
 * HISTORY AT ALL and the client synthesizes the persistence itself. All are
 * anonymous-by-construction in the sense that matters to the renderer: nothing
 * downstream may correlate one pulse to the next except through the row's own
 * declared key (a `blip` carries a contact id; `sm` carries NOTHING, by
 * amendment 45, and therefore cannot be grouped at all).
 *   • `blip` RADAR PAINT — the beam crossed a contact's bearing this tick.
 *     Accumulated into decaying phosphor (render/radar.ts + phosphor.ts).
 *   • `wk` WAKE (Story 4.12) — the beam crossed a stretch of DISTURBED WATER
 *     this tick. Same lattice and same park as a `return` echo, and the same
 *     three gate clauses behind it, but the subject is water rather than a ship:
 *     the row carries a coverage mask plus a quantized water-age bucket and NO
 *     identity of any kind (amendment 194), so it can be grouped no more than
 *     `sm` can. Course and recency are the player's inference off the ribbon's
 *     shape and the age gradient along it.
 *   • `sm` WOUNDED SMOKE (Story 4.4) — a hull is hurt HERE, this hurt, inside
 *     the 412.5u halo with LOS clear. Position and severity band, and nothing
 *     else: no id, no hue, no class, no hp, no fraction, for ANY observer
 *     including the smoking captain and spectators. Accumulated into a drifting
 *     plume (render/smoke.ts), which is deliberately the BLIP's arrangement and
 *     not a contact's. `f.t` is the pulse's timestamp — the row carries no time
 *     of its own and the decay is server-clock math, never accumulated dt.
 *   • `fh` THE FOGHORN (Story 4.5) — a captain SPENT a bearing. The first row
 *     whose payload varies by observer in substance (amendment 51): `self` for
 *     the honker, `b`+`v` for a fogged listener, `x`+`y` for a spectator.
 *     Accumulated into fading screen-edge chevrons (render/foghorn.ts) on the
 *     same server-clock timestamp math.
 */
function handlePulseEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
  switch (e.k) {
    case 'blip': deps.radar.onBlip(e); return;
    case 'wk': deps.radar.onWakeBlip(e); return;
    case 'sm': deps.smoke.onSmoke(e, f.t); return;
    case 'fh': handleFoghorn(e, f, deps); return;
  }
  handleGunneryEvent(e, f, deps, s);
}

/**
 * A honk arrived. THREE SHAPES, and the branch order is the contract:
 *
 *   • `self` — the honker's own copy. Play at 100% and bloom the own hull. NO
 *     CHEVRON: a bearing to yourself is meaningless (amendment 55). This is
 *     also the ONLY time the local captain hears their own horn — own honks are
 *     never client-predicted (amendment 58), so exactly one code path serves
 *     every listener and no dedup machinery exists or is needed.
 *   • `x`/`y` — the omniscient SPECTATOR path. The free camera has no
 *     server-known position, so the bearing is derived here from the camera
 *     centre and FIXED AT RECEIPT (see bearingTo): a bearing re-derived per
 *     frame would swing as the spectator panned.
 *   • `b`/`v` — a fogged listener. Bearing and volume BAND (which eighth of our
 *     own intel range the honker sits in, server-resolved — amendment 122), and
 *     nothing else on the whole row (no x, no y, no id, no correlation handle
 *     of any kind).
 *
 * THE CHEVRON IS PUSHED BEFORE THE AUDIO, AND UNCONDITIONALLY OF IT. `playHorn`
 * silently drops the honk at its 3-horn concurrency cap, and amendment 56 is
 * explicit that the cap drops HORNS, never CHEVRONS — the visual twin has to
 * survive exactly the crowded room that makes bearings worth having. Ordering
 * the two this way makes that structural rather than a comment.
 *
 * A row carrying neither a position nor a bearing (a malformed or future shape)
 * still SOUNDS and simply draws no mark: a chevron at a defaulted bearing of 0
 * would point confidently at the wrong horizon, which is worse than none.
 */
function handleFoghorn(e: FoghornEvent, f: FrameMsg, deps: RoomBindingDeps): void {
  if (e.self === true) {
    const you = deps.state.net.you;
    if (you) deps.effects.spawnEffect('horn', you.x, you.y);
    deps.audio.playHorn(e.h, 1);
    return;
  }
  const bearing = honkBearing(e, deps);
  if (bearing !== null) deps.foghorn.onHonk(bearing, e.v, f.t);
  deps.audio.playHorn(e.h, bandGain(e.v));
}

/** The bearing to draw for a non-self honk: derived from the camera for the
 *  spectator's position payload, taken verbatim from the wire otherwise. */
function honkBearing(e: FoghornEvent, deps: RoomBindingDeps): number | null {
  if (e.x !== undefined && e.y !== undefined) {
    const c = deps.cameraCenter();
    return bearingTo(c.x, c.y, e.x, e.y);
  }
  return e.b ?? null;
}

// --- THE SOUND MAP (Story 4.7, Eric ruling 2026-08-10) ----------------------
//
// Five call sites, one path. Every world cue rides an event this client has
// ALREADY received through the perception boundary, at a position it has
// ALREADY drawn on screen, so a modified client that deleted the whole family
// would learn nothing it did not have: no new wire field, no new event kind, no
// new perception exception, no server change. The cue points your ear at a mark
// your eye can already find — which is why panning it is free (design note:
// "Why panning is free here, and why it is not a new channel").
//
// THE SEQUENCE IS EXTRACTED RATHER THAN INLINED FIVE TIMES for a mechanical
// reason as well as a tidiness one: `handleBoom` was already at complexity 6 and
// `handleSunk` at 9, and the ceiling is 10 (ESLint error).

/**
 * Placement for a cue whose position could not be resolved: dead centre, at the
 * reach's own floor gain. Never silence — see `worldTone`.
 *
 * A FUNCTION, NOT A SHARED CONSTANT (review gate). The returned object becomes
 * the `opts` argument of a caller's `audio.play()`, and a single hoisted literal
 * would hand every unplaced cue in the session the SAME reference: one consumer
 * that ever normalised its opts in place (clamping a gain, folding a pan under
 * mono) would permanently rewrite the fallback for every cue after it. A fresh
 * literal per call costs nothing at these rates and cannot be corrupted.
 */
function unplacedCue(): WorldCue {
  return { pan: 0, gain: CLIENT_CONFIG.audio.worldFloorGain };
}

/**
 * WHERE THE PLAYER IS LISTENING FROM: the own hull while we have one, the camera
 * centre once we do not. That is the shipped foghorn precedent verbatim
 * (`honkBearing` above — a spectator's honk arrives as a position because the
 * free camera has no server-known position for the server to take a bearing
 * from), and world cues DO keep sounding while spectating: you are watching the
 * water, and every mark they point at is still being drawn.
 *
 * A dead-in-waiting captain (`you.alive === false`) listens from the camera too:
 * the hull on `you` is a wreck the camera has already left behind.
 */
function listenerPos(deps: RoomBindingDeps): { x: number; y: number } {
  const you = deps.state.net.you;
  return hasLiveOwnHull(deps) && you ? { x: you.x, y: you.y } : deps.cameraCenter();
}

/**
 * DO WE HAVE A LIVE OWN HULL RIGHT NOW? — the one question both audio consumers
 * of "where am I" must ask, and it is NOT the same as "is there a pose on hand".
 *
 * `net.you` is assigned whenever a frame carries one and is NEVER cleared
 * (handleFrame), so the wreck's last pose survives the entire spectate period.
 * Asking `you.alive` alone therefore depends on whether the death frame happened
 * to carry a `you` at all, and a stale `alive: true` pose would have every world
 * cue panned from our corpse and every enemy muzzle flash near it silently taken
 * for our own gun. The spectating flag is the authoritative half — it is set the
 * instant the server says `spec` — so both clauses are checked here, once.
 *
 * Deliberately NOT folded into `nearOwnShip`: that predicate's other caller is
 * the torpedo own-fire whoosh, whose behavior predates this and is not ours to
 * retune (see handleTorp). The gate goes at the audio call sites.
 */
function hasLiveOwnHull(deps: RoomBindingDeps): boolean {
  return !deps.state.spectating && !!deps.state.net.you?.alive;
}

/**
 * Play a cue for something that happened at `pos`, attenuated and panned from
 * where the player is listening — subject to that cue family's 300ms floor.
 *
 * `t` is the FRAME's server time, never a local clock reading: the floor
 * measures server-side spacing, exactly as the Hit Call's does, so it cannot
 * chatter on clock jitter (render/gunneryFeed.ts).
 *
 * `floor` is the cue's SOURCE FAMILY floor, or NULL for a cue that has no salvo
 * to limit (the witnessed sinking — see `WorldFloorId`). It is passed in rather
 * than looked up from the tone id because the two lists differ in both
 * directions: the self-private fall of shot plays the public splash TONE on its
 * OWN floor, and the sinking plays with none at all.
 *
 * A NULL POSITION STILL SOUNDS, unpanned at the floor gain. The only caller that
 * can hand one over is the witnessed sinking, whose position comes from a
 * last-known contact that may have aged out of the store — and the sinking was
 * legitimately witnessed, so the FACT is ours even when the BEARING is not
 * available. `worldCue` returning null is the same case (defensive input), and
 * is deliberately not treated as "too far to hear": the server already decided
 * what reaches this client, and re-deciding it here would be a second
 * client-side implementation of a perception rule (audio/tones.ts `worldCue`).
 */
function worldTone(
  id: WorldToneId,
  floor: ToneFloor | null,
  pos: { x: number; y: number } | null,
  t: number,
  deps: RoomBindingDeps,
): void {
  if (floor && !floor.request(t)) return;
  deps.audio.play(id, placeCue(pos, deps));
}

/** The pan/gain for a world position, or the unplaced fallback. */
function placeCue(pos: { x: number; y: number } | null, deps: RoomBindingDeps): WorldCue {
  if (!pos) return unplacedCue();
  const ear = listenerPos(deps);
  // CONFIG.vision.radar — the eighths ladder's 8/8 rung (full intel range) — is
  // the falloff scale for EVERY world cue, read from shared CONFIG rather than
  // mirrored into a client tunable. Per-cue rungs were considered and rejected:
  // they would re-derive the server's own disclosure decision (audio/tones.ts).
  return worldCue(pos.x - ear.x, pos.y - ear.y, CONFIG.vision.radar) ?? unplacedCue();
}

/**
 * THE GUNNERY CONVERSATION (Story 4.3) — the three rows that make firing an
 * exchange of information instead of a private guess:
 *   • `mz` MUZZLE FLASH — someone fired a gun-family weapon HERE, inside the
 *     412.5u halo with LOS clear. For ANYONE, and deliberately anonymous: no id,
 *     no hue, no class, no weapon weight (amendment 19 — the flash must create
 *     a question, never answer one). Nothing to dedupe: the server already caps
 *     it at one per tick per shooter, and a flash is not an impact mark.
 *   • `sp` FALL OF SHOT — YOUR gun-family shell terminated with no victim, at
 *     the true impact point, through any fog. Bracket and walk (FR16).
 *   • `hc` HIT CALL — something YOU fired or laid connected, position only:
 *     no victim, no amount, no kill flag, no hull count. The tone rides the
 *     300ms same-source floor; the bloom never does, because three connections
 *     are three facts (see render/gunneryFeed.ts).
 * Both impact rows claim their point, so a shooter who can SEE the impact draws
 * ONE mark rather than stacking this one on the public `boom`'s.
 */
function handleGunneryEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
  switch (e.k) {
    case 'mz': handleMuzzle(e, f.t, deps, s); return;
    case 'sp': handleFallOfShot(e, f.t, deps, s); return;
    case 'hc': handleHitCall(e, f, deps, s); return;
  }
  handleRewardEvent(e, f, deps);
}

/**
 * A gun-family weapon fired at (x,y) — the universal, identity-free flash, and
 * (Story 4.7) the REPORT that finally goes with it: another ship's gun, heard
 * from where you are. The tone carries exactly what the flash carries — a place
 * — and no identity of any kind, because the row itself has none.
 *
 * OWN FIRE IS SUPPRESSED, on the same `nearOwnShip` idiom the own-fire
 * correlation already uses. Our own gun sounded `fireGun`/`fireCannon` at the
 * instant we fired it (handleShell); layering the distant-report cue on top
 * would double-sound one shot. Hull proximity is the only discriminator
 * available AND the correct one — `mz` deliberately carries no shooter id
 * (amendment 19: the flash must create a question, never answer one) — and it
 * fails safe: an enemy firing from inside our own hull length is a knife fight
 * we are hearing our own guns through anyway.
 *
 * The suppression is gated on having a LIVE hull (review gate): a spectator
 * fires nothing, so `fireGun` never sounded and there is nothing to double. Left
 * ungated it read the never-cleared wreck pose and silenced every enemy gun
 * within a hull length of where we sank, for the whole spectate period.
 */
function handleMuzzle(e: MuzzleEvent, t: number, deps: RoomBindingDeps, s: BindState): void {
  deps.effects.spawnEffect('muzzle', e.x, e.y);
  if (onOwnLiveHull(e.x, e.y, deps)) return;
  worldTone('gunReport', s.worldTones.gunReport, e, t, deps);
}

/** Did this happen ON our own hull — one we actually still have? The audio-side
 *  composition of `nearOwnShip` with `hasLiveOwnHull` (never a change to either). */
function onOwnLiveHull(x: number, y: number, deps: RoomBindingDeps): boolean {
  return hasLiveOwnHull(deps) && nearOwnShip(x, y, deps);
}

/**
 * Our own shell fell HERE and hit nothing (self-private, gun family only) — the
 * splash mark, and the splash it makes.
 *
 * The CUE is deliberately not gated on the MARK's claim, exactly as the Hit
 * Call's is not: when that claim fails the mark is already on screen (the public
 * `boom` drew it) and the sound of the miss is still the answer to our shot.
 *
 * IT RUNS ON ITS OWN FLOOR, NOT THE PUBLIC SPLASH FAMILY'S (review gate). This
 * is the row Story 4.3 added so a shooter's misses render through fog and
 * bracket-and-walk works (FR16) — the one splash carrying information the client
 * cannot obtain any other way — so it outranks world noise the player can
 * already see: an enemy's splash 200u off must never eat it.
 *
 * WHAT STOPS THE SAME MISS SOUNDING TWICE is therefore the CUE's point claim
 * (`splashCues`, see `splashTone`), not the floor. When a shooter can see their
 * own miss, the public `boom` and this row arrive in ONE frame carrying
 * byte-identical coordinates; the claim collapses that pair, exactly as the mark
 * claim does. (An earlier comment here credited the shared FAMILY FLOOR with
 * that collapse "since they carry byte-identical coordinates" — the floor
 * compares TIMESTAMPS only and has never read a coordinate. The mechanism is
 * spelled correctly now, and it survives the two rows having separate floors.)
 */
function handleFallOfShot(e: SplashEvent, t: number, deps: RoomBindingDeps, s: BindState): void {
  if (s.impacts.claim(e.x, e.y)) deps.effects.spawnEffect('splash', e.x, e.y);
  splashTone(e, s.worldTones.fallOfShot, t, deps, s);
}

/**
 * Sound a splash for an impact point: its family floor, THEN the same-frame
 * point claim, THEN the cue.
 *
 * THE ORDER IS LOAD-BEARING. A point is claimed only by a splash that actually
 * SOUNDED, so a row the floor just refused cannot eat the point on the way out.
 * Claiming first would reopen the very starvation the separate floors exist to
 * close: an enemy's splash a moment ago silences the public `boom` for the
 * shooter's own visible miss, that silent row takes the point, and the
 * self-private `sp` behind it — the one carrying information the client cannot
 * otherwise obtain — finds nothing left to claim.
 */
function splashTone(
  e: { x: number; y: number },
  floor: ToneFloor,
  t: number,
  deps: RoomBindingDeps,
  s: BindState,
): void {
  if (!floor.request(t)) return;
  if (!s.splashCues.claim(e.x, e.y)) return;
  worldTone('splash', null, e, t, deps); // the floor is already spent, one line up
}

/**
 * Something we fired or laid CONNECTED at (x,y). The bloom is the shipped hit
 * spark, now fog-immune (render/effects.ts) so a connection beyond our bubble
 * actually shows. The cue is the muffled boom, and it is the ONE thing here
 * that is rate-limited: a salvo landing inside the floor draws every bloom and
 * plays a single tone. It is played independently of the claim — when the claim
 * fails, the mark is already on screen (the `boom` drew it) and the cue is
 * still the shooter's own confirmation.
 *
 * THE MARK IS PUBLIC TO A SPECTATOR, THE CUE IS NOT. `hc` is spectator-public on
 * the wire (the `dmg` precedent — a dead captain may watch the gunnery
 * conversation), so a spectator receives EVERY shooter's Hit Call. The bloom is
 * fine there: it is watching. The tone is not — it means "something YOU fired
 * connected", and ungated it would fire in a dead captain's ears for all 19
 * remaining hulls' hits, up to once per floor, until results. Gated on identity
 * exactly like handleDamage's shake/tone (:822) and the amendment-37 rule that a
 * spectating captain gets no level-up toast and no tone.
 */
function handleHitCall(e: HitCallEvent, f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
  if (s.impacts.claim(e.x, e.y)) deps.effects.spawnEffect('spark', e.x, e.y);
  if (e.id !== deps.state.net.sessionId) return;
  if (s.hitCallTone.request(f.t)) deps.audio.play('hitCall');
}

/** Self-private reward events: the banked level, the fitted boon, and (cycle
 *  44) the DAMAGE CONTROL heal. (The 'heal' row left the wire with the
 *  interregnum REPAIR spend — Story 2.1, PV 12 — and comes back at PV 23 as the
 *  always-available rail's confirmation; the killer-private 'upg' grant left
 *  with the legacy upgrade strip — Story 2.8, PV 16.) */
function handleRewardEvent(e: GameEvent, f: FrameMsg, deps: RoomBindingDeps): void {
  switch (e.k) {
    case 'pt': handlePoint(e, f, deps); return;
    case 'bn': handleBoonFit(e, deps); return;
    case 'heal': handleHeal(e, deps); return;
  }
}

/**
 * A heal LANDED (cycle 46). `heal` is self-private — perception forwards it only
 * to the healer — so the id check is defensive, not load-bearing, exactly like
 * `pt`/`bn`. Deliberately NOT dead-gated and carrying no numbers of its own: the
 * event is a pure confirmation cue, and every authoritative number (the new hp,
 * the remaining pool) self-syncs on `you` every frame. The visual twin is the
 * rail's jump plus its incoming band, so a muted player loses nothing.
 */
function handleHeal(e: HealEvent, deps: RoomBindingDeps): void {
  if (e.id !== deps.state.net.sessionId) return;
  deps.audio.play('heal');
  // ALSO the spend latch's ack, for the same reason `bn` is one (see
  // handleBoonFit): a heal is the OTHER way a spend can land, and every other
  // release clause is an inference off `you` that a same-frame passive bank can
  // mask. Without this, a heal spent with a second level queued behind an
  // identical-signature offer releases as 'failed' at the 1.5s timeout and
  // pulses a DENIAL over a heal the server actually granted.
  deps.onSpendAck();
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
  // STORY 2.9 — the fit is no longer one generic two-note for every line: the
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
 *
 * STORY 4.3 TOOK THE UNIVERSAL FLASH AWAY FROM HERE. The plain `muzzle` is now
 * spawned by the server's `mz` row (handleGunneryEvent), which knows the TRUE
 * muzzle and does not have to infer a launch from a reveal. What stays is the
 * own cannon's `muzzleHeavy` — extra weight the wire deliberately cannot carry
 * (amendment 19 forbids a heavier flash for the cannon, precisely because it
 * would put a class tell on a public row). For our own cannon shot BOTH land on
 * our hull, layered: the universal flash the whole ocean can see, and our own
 * heavier report on top of it. That is intended and is NOT deduped — they are
 * two different statements about the same shot, and correlating `mz` back to a
 * shell is impossible by design (it carries no id at all).
 */
function handleShell(e: BallisticEvent, deps: RoomBindingDeps): void {
  // The latch is claimed ONCE, and only for a reveal already sitting on our own
  // hull — see the ownFireWeapon dep note (a claim consumes).
  const near = nearOwnShip(e.x, e.y, deps);
  const claim = near ? shellClaim(deps) : null;
  const own = near ? ownShellWeapon(claim) : null;
  deps.projectiles.onShell(e, own, claim);
  if (own === 'cannon') deps.effects.spawnEffect('muzzleHeavy', e.x, e.y);
  if (own) deps.audio.play(fireTone(shellFireId(own)));
}

/**
 * Pure-ish: the GENUINE claim behind an own-looking SHELL reveal, or null. The
 * latched click intent counts only when it agrees with the reveal's KIND — a
 * shell can be the gun, the cannon or a star shell (all three ride the `shell`
 * kind), and a standing TORPEDO claim cannot dress one.
 *
 * Never guesses upward — the cannon's weight (its heavy muzzle, its heavy
 * report, its doctrine look) is spent ONLY against a live claim, so a second
 * shell inside one 400ms window, or an enemy shell revealed on our bow, can
 * never wear it.
 */
function shellClaim(deps: RoomBindingDeps): OwnFire {
  const fired = deps.ownFireWeapon();
  return fired === 'cannon' || fired === 'gun' || fired === 'starShells' ? fired : null;
}

/**
 * The LOOK/AUDIO attribution for an own-looking shell reveal: the genuine claim
 * when there is one, else the ratified pre-2.9 'gun' fallback (see above).
 *
 * THE FALLBACK IS NOT EVIDENCE. It fires for any shell surfacing within a hull
 * length of us — including an ENEMY's shell revealed on our bow, and our own
 * second/third barrel in a salvo whose one-shot latch the first shell consumed.
 * That is harmless for a look and a crack, and WRONG for a burst ring: sizing
 * one off our effective blast radius on the strength of a guess would draw
 * somebody else's detonation at our numbers. So the burst path takes `claim`
 * (null here) and never this.
 */
function ownShellWeapon(claim: OwnFire): OwnFire {
  return claim ?? 'gun';
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
  // A torpedo's `own` IS a genuine claim (there is no fallback on this path —
  // an unclaimed fish renders the generic straight-runner), so it doubles as
  // the burst-ring authority for a COMMAND DETONATION fish.
  deps.projectiles.onShell(e, own, own);
  if (near) deps.audio.play(fireTone('torpedo'));
}

/** True iff (x,y) is within one hull length of the own ship specifically. */
function nearOwnShip(x: number, y: number, deps: RoomBindingDeps): boolean {
  const you = deps.state.net.you;
  return !!you && near2(x, y, you.x, you.y);
}

function near2(x: number, y: number, cx: number, cy: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= OWN_NEAR2;
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
 *
 * STORY 4.3 — the spark and the splash now CLAIM their point (gunneryFeed), so
 * the shooter's own self-private `hc`/`sp` for the same impact does not stack a
 * second mark on this one. Whichever row the frame happens to carry first wins;
 * neither handler knows or cares which it is. The PIERCE ring deliberately does
 * NOT claim: it says something the Hit Call bloom does not (the shell went
 * THROUGH and is still flying), so both are wanted — and keeping it out of the
 * claim is also what keeps the pairing order-independent.
 */
function handleBoom(e: BoomEvent, t: number, deps: RoomBindingDeps, s: BindState): void {
  deps.projectiles.onBoom(e);
  if (!e.hit) {
    if (s.impacts.claim(e.x, e.y)) deps.effects.spawnEffect('splash', e.x, e.y);
    // STORY 4.7 — a hit and a miss are the two facts bracket-and-walk is built
    // on, so they are the two cues placed at opposite ends of the catalog: the
    // splash's soft hiss here, the impact's sawtooth punch below.
    //
    // The CUE claim (never the mark claim) is what keeps this from doubling with
    // the shooter's own self-private `sp` for the same impact, now that the two
    // rows run on separate floors — see handleFallOfShot / splashTone.
    splashTone(e, s.worldTones.splash, t, deps, s);
    return;
  }
  if (pierceOrder(e.id ?? '') !== null) deps.effects.spawnEffect('pierce', e.x, e.y);
  else if (s.impacts.claim(e.x, e.y)) deps.effects.spawnEffect('spark', e.x, e.y);
  // Sounded off the MARK, not off the claim — a pierce ring and a spark are both
  // ordnance connecting out there, and a boom whose spark was deduped away
  // against a same-frame Hit Call still happened.
  //
  // BUT NEVER WHEN THE HULL IS OURS (review gate, amendment 37). Our own damage
  // is a PER-FRAME AGGREGATE — "one shake at the summed magnitude, one cue"
  // (flushDamage) — precisely because repeated cues for one occurrence smear.
  // `damage`/`burn` IS that cue, and it is already playing this frame at full
  // gain and dead centre; layering the world `impact` on top would double-sound
  // the most common combat event in the game. The VISUALS above are untouched:
  // only the cue is suppressed. Do not "restore" this.
  if (e.hit !== deps.state.net.sessionId) {
    worldTone('impact', s.worldTones.impact, e, t, deps);
    deps.contactViews.flash(e.hit);
  }
}

/**
 * A gun shell burst at its target point: spawn the burst ring and terminate the
 * dead-reckoned shell render (same removal semantics as a boom). Damage arrives
 * separately as victim-private `dmg` events; an early-intercept detonation
 * stays on the `boom` spark/splash branch (handleBoom above).
 *
 * The ring is sized to the shooter's EFFECTIVE blast radius when the burst is
 * OURS (the track was own-correlated at reveal time) and to the CONFIG base
 * otherwise. That split is deliberate and permanent: our own upgraded blast
 * should look like what it is, and an onlooker must never be able to measure an
 * enemy's FRAGMENTATION ladder off a detonation ring — the wire deliberately
 * carries no radius (see BurstEvent).
 */
function handleBurst(e: BurstEvent, t: number, deps: RoomBindingDeps, s: BindState): void {
  // Ask the track who fired it BEFORE onBurst retires it (Story 2.9's click
  // latch is long expired by burst time; the track carries the answer).
  const radius = deps.ownBurstRadius(deps.projectiles.ownFireOf(e.id));
  deps.projectiles.onBurst(e);
  deps.effects.spawnEffect('burst', e.x, e.y, 1, radius);
  // STORY 4.7 — the second half of report-then-boom: the `mz` crack goes off at
  // the muzzle, and seconds later at range the burst thuds at the clicked point.
  // Both are already on the wire; this is the pair finally being audible. It
  // shares the `impact` family (and its floor) with a connecting boom on
  // purpose — ordnance detonating out there is ONE kind of fact.
  //
  // A burst centred on OUR OWN hull is the boom's case exactly (review gate,
  // amendment 37): it is the same occurrence as the damage we are feeling this
  // frame, whose aggregate `damage`/`burn` cue is the one cue it gets. `burst`
  // carries no victim id — the ring is public and the damage is victim-private —
  // so PROXIMITY is the discriminator, and it must ask for a LIVE hull rather
  // than a stale pose (the muzzle's reason, verbatim).
  //
  // BUT THE BALL IS THE BLAST, NOT THE HULL (second review gate). This first
  // shipped keyed on `nearOwnShip` — one MAX_HULL_LEN, 124u — which is four
  // times the widest base blast in the game, so a detonation 100u off the beam
  // that never touched us, produced no `dmg` and emitted no `boom` was silenced
  // outright: a ring filling the screen and nothing to hear. The RING above
  // still draws in every case. Do not "restore" the hull ball.
  if (!inOwnBlast(e.x, e.y, radius, deps)) worldTone('impact', s.worldTones.impact, e, t, deps);
}

/**
 * Could this burst be the one we are already FEELING? — i.e. is our own live
 * hull inside its blast.
 *
 * The radius is the SAME seam that sized the ring one line above
 * (`deps.ownBurstRadius` over live own stats): the shooter's own effective blast
 * for a burst the click latch claims as ours, and the CONFIG base otherwise —
 * `CONFIG.gun.burstRadius`, which is exactly the radius render/effects.ts draws
 * the uncorrelated ring at, so the silence and the picture always agree. No new
 * constant is introduced, and none may be: the wire deliberately carries no
 * radius, because an onlooker able to measure an enemy's FRAGMENTATION ladder
 * off a detonation is the leak `BurstEvent` was shaped to prevent.
 *
 * IT ERRS TOWARD SOUNDING, on purpose. An enemy with a widened blast can damage
 * us from just outside this base ball, and that frame plays both the damage cue
 * and the thud — a slightly loud detonation. The opposite error is a lie about
 * the water: silence where something visibly went off. Between a smear and a
 * lie, take the smear.
 */
function inOwnBlast(x: number, y: number, radius: number | undefined, deps: RoomBindingDeps): boolean {
  const you = deps.state.net.you;
  if (!hasLiveOwnHull(deps) || !you) return false;
  const r = radius ?? CONFIG.gun.burstRadius;
  const dx = x - you.x;
  const dy = y - you.y;
  return dx * dx + dy * dy <= r * r;
}

/** The feed's name reference for a vessel id: the roster callsign, or the
 *  neutral UNKNOWN_VESSEL label on a roster miss (the vessel already left the
 *  room) — NEVER the raw session id, which a global feed would print into
 *  every client's feed. The segment stays uncolored on a miss: deps.colors
 *  misses the same roster entry and resolves null. */
function feedNameRef(id: string, deps: RoomBindingDeps): { name: string; id: string } {
  return { name: deps.names(id) ?? UNKNOWN_VESSEL, id };
}

// No `BindState` on this path any more: the sinking cue is the one world cue
// with no tone floor (a hull sinks once — see `WorldFloorId`), so there is no
// per-binding memory left for it to read.
function handleSunk(e: SunkEvent, t: number, deps: RoomBindingDeps): void {
  // THE PUBLIC REGISTER (PV 23): a `sunk` may now arrive for a wreck this
  // observer never saw. Everything SPATIAL is gated on the server's
  // per-observer `seen` stamp — a stale last-known contact position must
  // never draw a sink plume for a kill we did not witness. The feed line, the
  // score credit, the `kill` tone, and the own-death branch stay
  // UNCONDITIONAL: identity is public, location is not.
  // RESOLVED ONCE, UP FRONT, and handed to BOTH consumers (review gate): the
  // plume below and the cue at the bottom of this function place the wreck at
  // the same point, and `markSunk` runs between them. Today those two lookups
  // would still agree — `markSunk` tears down a contact VIEW while the position
  // comes from the snapshot store — but a teardown that ever pruned snapshots
  // too would leave the plume drawn at the wreck while the cue silently
  // degraded to unplaced. That is the exact defect class already fixed once on
  // this path; one read cannot drift from itself.
  const pos = sunkPosition(e.id, deps);
  if (e.seen && pos) deps.effects.spawnEffect('sink', pos.x, pos.y);
  // feedNameRef: a roster miss renders the neutral UNKNOWN_VESSEL label,
  // never the raw session id — a global feed puts this line in front of
  // EVERY client.
  const killer = e.by ? feedNameRef(e.by, deps) : null;
  const victim = feedNameRef(e.id, deps);
  // THE KILL LEADER'S MARK (Story 4.6, 2026-08-10 rework): `bty` is the
  // server's PRE-SINK truth — which participant held the throne at the
  // instant of sinking ('v' victim, 'k' killer). It is taken verbatim and
  // never re-derived by comparing against the local `bountyId`: the schema
  // patch and this event ride the SAME frame with no guaranteed ordering, so
  // the throne may already have been recomputed by the time we read it. The
  // skull rides the leader's NAME segment (ui/bounty.ts) — the retired
  // CLAIMED/LIFTED trailing connectives carried a paid/unpaid distinction the
  // grammar no longer has.
  const line = e.bty ? bountyKillLine(victim, killer, e.bty) : killLine(victim, killer);
  pushKillLine(line, deps.colors);
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
  } else if (e.seen) {
    deps.contactViews.markSunk(e.id); // teardown is spatial — witnessed only
  }
  // The cue is resolved LAST and exactly once (see sunkCue) — after the feed
  // line, the score credit and the state resets, so the order the events were
  // generated in survives (handleEvents' pre-pass already felt the damage).
  sunkCue(e, pos, t, deps);
}

/**
 * EXACTLY ONE CUE PER SINKING, and the priority order is strict and mutually
 * exclusive (Story 4.7):
 *
 *   1. YOUR OWN DEATH → `sink`. The one long tone, unchanged since 1.4.
 *   2. YOUR CREDITED KILL → `kill`. The ascending chime, fog or not: identity is
 *      public, and the Public Register's whole point is that you learn a hull
 *      you sank went down at any range (amendments 29-34).
 *   3. OTHERWISE, A WITNESSED SINKING → `sunkWitness`, placed at the wreck.
 *
 * A witnessed kill of your own plays the chime ALONE, never both: the chime is
 * the credit and the groan is the hull, and stacking them would smear one second
 * into two overlapping low tones with nothing gained.
 *
 * THE DISCLOSURE RULE, and the reason clause 3 is gated exactly where the sink
 * plume is: an UNSEEN sinking — the Public Register's fog kill — stays COMPLETELY
 * SILENT. `sunk` carries no position at all, so the only position available is a
 * stale last-known contact, and sounding it (panned OR unpanned, since arriving
 * at all is the tell) would confirm "that death happened near where I last saw
 * them". The feed line already carries the ratified public fact; this cue would
 * carry the PLACE, which is precisely what `seen` protects.
 *
 * NO TONE FLOOR, and that is the one asymmetry in the family (review gate). The
 * 300ms floor answers "how often may ONE SOURCE make a noise" — a salvo question
 * — and a hull sinks exactly once: two hulls going down 200ms apart in a
 * ring-closure scrum are TWO sources, the feed prints both lines, and both must
 * be heard. The other three families keep theirs. Do not add one here for
 * consistency's sake (see `WorldFloorId`).
 *
 * `pos` is resolved by the caller and shared with the sink plume, so the cue and
 * the mark can never disagree about where the wreck was.
 */
function sunkCue(
  e: SunkEvent,
  pos: { x: number; y: number } | null,
  t: number,
  deps: RoomBindingDeps,
): void {
  const sessionId = deps.state.net.sessionId;
  if (e.id === sessionId) {
    deps.audio.play('sink');
    return;
  }
  if (e.by === sessionId) {
    deps.audio.play('kill'); // your victim went down — fog or not
    return;
  }
  if (!e.seen) return; // the fog kill's silence — see above
  // A witnessed wreck whose last-known contact has already aged out of the store
  // still sounds, unpanned at the floor (worldTone): we SAW it go down, so the
  // fact is legitimately ours even when the bearing is unavailable.
  worldTone('sunkWitness', null, pos, t, deps);
}

/**
 * THE FRAME'S OWN DAMAGE, FELT ONCE (Eric ruling 2026-08-05): one shake at the
 * SUMMED magnitude and one cue, resolved in a pre-pass over the frame's events.
 * `dmg` is only ever emitted to the victim itself (perception.ts's
 * worldEventForObserver never forwards another ship's dmg amount to onlookers),
 * so the id filter is defensive, not load-bearing.
 *
 * It sums because a multi-barrel click now lands N separate applications on one
 * hull in one tick, and per-event feedback UNDERSTATES that: shake.ts resolves
 * colliding triggers with Math.max, so three 15hp triggers would report a 15hp
 * hit for 45hp of damage and the MOUNT cards would land invisibly (the Story
 * 2.9 rule: the build must be felt). Three identical thuds in one frame just
 * smear, so they collapse to one — the same grammar the shooter's side already
 * ships for the Hit Call tone (CLIENT_CONFIG.gunnery.hitCallToneFloorMs). No
 * new tunable.
 *
 * STORY 2.9 — BURN IDENTITY, classified PER EVENT and then folded, NOT by
 * testing the sum. A tick taken because we are STANDING IN FIRE is not a slam:
 * it plays the `burn` cue instead of the impact thud and shakes at a fraction
 * of the amplitude (a full-strength shake per DoT tick reads as being shelled,
 * which is a lie about what is happening). The frame reads as fire only when
 * EVERY application in it does. Testing the sum instead would break in both
 * directions: BURN_AMOUNT_CAP's ×4 headroom was derived for ONE event covering
 * overlapping patches, so four distinct enemy burners (~2.75hp each, one bite
 * per owner per tick) already sum past it and pure fire would misreport as an
 * impact — while a genuine shell arriving alongside a flush must read as the
 * slam it was, which the per-event fold gets right for the opposite reason.
 *
 * The zone list is the one the client already holds (net → state, mirrored in
 * handleFrame) — no new wire data, and no way to mistake our OWN flare for a
 * hazard (`by !== self`; you cannot burn yourself).
 */
function flushDamage(f: FrameMsg, deps: RoomBindingDeps, s: BindState): void {
  const selfId = deps.state.net.sessionId;
  const since = f.t - s.burningAt;
  let total = 0;
  let allBurn = true;
  for (const e of f.events) {
    if (e.k !== 'dmg' || e.id !== selfId) continue;
    total += e.amount;
    if (!readsAsBurn(e.amount, since)) allBurn = false;
  }
  if (total <= 0) return; // no own damage this frame (the overwhelmingly common case)
  deps.shake.trigger(allBurn ? total * CLIENT_CONFIG.litZone.burnShakeScale : total);
  deps.audio.play(allBurn ? 'burn' : 'damage');
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
    deps.resetHonkCooldown(); // the server clears nextHonkAt on respawn too (review fix)
    deps.onOwnSpawn(e.x, e.y);
  } else {
    deps.contacts.clear(e.id); // same snap rule for a respawning contact
    deps.contactViews.markSpawn(e.id);
  }
}
