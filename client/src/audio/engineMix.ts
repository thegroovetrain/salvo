// THE PER-FRAME SHIP AUDIO (Story 10.13, wave B): the own engine, other
// ships' engines close alongside, the storm bed, the klaxon, the own sinking
// fade, and the per-frame edge cues that have no wire event (boost surge,
// beacon set surfacing, a torpedo coming close). main.ts builds one
// `EngineFrame` per render frame from state it already holds and calls
// `update` once; every decision is a pure function, and the class only keeps
// voices alive and released.
//
// THE GATES, AS BUILT:
//   • nothing is built before the AudioContext exists, while it is not
//     running, or while the game is silenced (mute / ad-break duck):
//     `Audio.engineBus()` is null and every engine voice is RELEASED (no orphan
//     graph runs muted); the next live frame rebuilds.
//   • HALT (review P1 / P4 / P5): a session teardown, a hidden tab or a
//     dropped connection calls `halt()` — every voice released, the klaxon
//     stopped, the sink insert unplugged at once — and nothing is rebuilt
//     until `resume()`, which also re-seeds every edge detector so the first
//     frame back only seeds.
//   • OWN ENGINE: sounds whenever main.ts hands an `own` (a hull we are
//     conning: alive or sinking, including the start line and the countdown;
//     not spectating, not after the match). Released on null; rebuilt on a
//     hull change. Non-finite inputs hold the last good targets (EngineVoice).
//   • OTHER SHIPS: audio/remoteEngines.ts (the true-sight gate, close
//     alongside only, nearest N, with hysteresis).
//   • STORM BED (Eric: a continuous bed instead of the one-shot warning):
//     built the first frame the conned hull is inside the storm; intensity 1
//     inside, 0 outside — the voice's own slow glide is the fade. Same gates as
//     the own engine.
//   • THE KLAXON (Eric's pick, audio/klaxon.ts): the hull band edges arrive
//     through `klaxonEdge`, the own `sunk` event through `klaxonSinkStart`; the
//     own sinking window repeats the blast, each capped to the window's time
//     left; every held blast is stopped the frame the hull is gone.
//   • SINK FADE: the own sinking window's progress drives the bus insert,
//     written only when it moved (review P8). After the hull founders it holds
//     fully closed — only in a live match with no respawn coming (P9) — until
//     we spectate, live again or the match ends, then opens and unplugs.

import { CONFIG, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { EngineVoice, RemoteEngineVoice } from './engineGraph.js';
import { CUES, ENGINE_PROFILES, STORM_BED_PROFILE, type CueId } from './synth/cues.js';
import { Klaxon, type StoppableBlast } from './klaxon.js';
import type { CueOptions } from './context.js';
import type { HpBand } from './tones.js';
import { StormBedVoice, type StormBedProfile } from './stormBed.js';
import type { EngineProfile } from './engine.js';
import { worldCue } from './tones.js';
import { RemoteEngines, type RemoteHull, type RemoteMaker } from './remoteEngines.js';
import {
  beaconSurfaced,
  boostRose,
  freshBeaconCueState,
  freshTorpedoHumState,
  markHumHeard,
  torpedoHumCandidates,
  unseedTorpedoHum,
  type BeaconCueState,
  type DrawnBallistic,
  type ListenerKind,
} from './cueEdges.js';

export { audibleHulls, speedFraction, type RemoteHull, type RemoteMix } from './remoteEngines.js';

/** The own engine's input this frame. */
export interface OwnEngine {
  cls: ShipClassId;
  /** The helm order, −1..1 (its magnitude is the load). */
  throttle: number;
  /** |speed| / the hull's max speed. */
  speed01: number;
  /** The PREDICTED boost window (the continuous engine follows the press). */
  boost: boolean;
}

export interface EngineFrame {
  /** null = no own engine (dead, spectating, match over, no hull yet). */
  own: OwnEngine | null;
  /** The SERVER-confirmed boost window (`you.boostUntil`) — the surge's edge (P11). */
  boostConfirmed: boolean;
  /** 0..1 through the own sinking window, or null when not sinking. */
  sinking01: number | null;
  /** True once the sink fade may unplug: spectating, alive again, or match over. */
  sinkCleared: boolean;
  /** A death here may hold the bus closed: a live match, no respawn coming (P9). */
  sinkLatchable: boolean;
  /** Where the player listens from: own hull, else the camera centre. */
  listener: { x: number; y: number } | null;
  /** Which of the two the listener is (the torpedo hum re-seeds on a change). */
  listenerKind: ListenerKind;
  hulls: readonly RemoteHull[];
  /** Every ballistic the client draws this frame (any kind). */
  drawn: readonly DrawnBallistic[];
  /** The beacon set's identity and whether any of it is afloat (null = no data). */
  beaconCycle: number | undefined;
  beaconAfloat: boolean | null;
  /** The conned hull is inside the storm (last rendered frame). */
  inStorm: boolean;
  matchOver: boolean;
}

/** The slice of `Audio` this module uses. */
export interface EngineAudio {
  engineBus(): { ctx: BaseAudioContext; sink: AudioNode } | null;
  setSinkFade(progress01: number | null, opts?: { immediate?: boolean }): void;
  playCue(id: CueId, opts?: CueOptions): StoppableBlast | null | void;
}

/** The own / storm voices' shared surface (EngineVoice / StormBedVoice). */
interface Voice<I> {
  update(input: I, nowS?: number): void;
  release(fadeS?: number): void;
}

type OwnInput = { throttle: number; speed01: number; boost: boolean };

/** Voice factories — injectable so the graph-free tests can count builds. */
export interface VoiceMakers {
  own(ctx: BaseAudioContext, sink: AudioNode, profile: EngineProfile): Voice<OwnInput>;
  remote: RemoteMaker;
  storm(ctx: BaseAudioContext, sink: AudioNode, profile: StormBedProfile): Voice<number>;
}

const DEFAULT_MAKERS: VoiceMakers = {
  own: (ctx, sink, p) => new EngineVoice(ctx, sink, p),
  remote: (ctx, sink, p) => new RemoteEngineVoice(ctx, sink, p),
  storm: (ctx, sink, p) => new StormBedVoice(ctx, sink, p),
};

/** s — the storm bed is re-targeted at least this often (its thunder is
 *  scheduled from updates), and at once when the intensity flips. */
export const STORM_UPDATE_S = 0.5;

/** The sink fade is rewritten only when its target moved at least this much (P8). */
export const SINK_WRITE_STEP = 0.02;

/**
 * Pure: the sink-fade target this frame and the next latch. CLEARED comes
 * first (P9: a match that ends mid-window must not muffle the results); then
 * sinking → its progress (latched only when `latchable` — a live match with no
 * respawn coming); after the window, held fully closed (1) while latched;
 * otherwise null (unplugged).
 */
export function sinkFadeTarget(
  latched: boolean,
  sinking01: number | null,
  cleared: boolean,
  latchable = true,
): { target: number | null; latched: boolean } {
  if (cleared) return { target: null, latched: false };
  if (sinking01 !== null) return { target: Number.isFinite(sinking01) ? sinking01 : 0, latched: latchable };
  if (latched) return { target: 1, latched: true };
  return { target: null, latched: false };
}

/** Pure: seconds left in the own sinking window from its progress, or null. */
export function sinkingLeftS(sinking01: number | null): number | null {
  if (sinking01 === null || !Number.isFinite(sinking01)) return null;
  return Math.max(0, 1 - sinking01) * (CONFIG.ship.sinkingWindowMs / 1000);
}

/** Pure: 0..1 through the sinking window ending at `until`; junk → 0. */
export function sinkingProgress(until: number, now: number, windowMs: number): number {
  if (!Number.isFinite(until) || !Number.isFinite(now) || !(windowMs > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - (until - now) / windowMs));
}

export class EngineMix {
  private own: { voice: Voice<OwnInput>; cls: ShipClassId } | null = null;
  private readonly remotes: RemoteEngines;
  private storm: { voice: Voice<number>; intensity: number; at: number } | null = null;
  private readonly klaxon: Klaxon;
  private halted = false;
  private boostPrev: boolean | null = null;
  private beacons: BeaconCueState = freshBeaconCueState();
  private readonly torps = freshTorpedoHumState();
  private sinkLatched = false;
  /** The sink target last written, or null while unplugged. */
  private sinkWritten: number | null = null;

  constructor(
    private readonly audio: EngineAudio,
    private readonly makers: VoiceMakers = DEFAULT_MAKERS,
    now?: () => number,
  ) {
    this.remotes = new RemoteEngines(makers.remote);
    this.klaxon = new Klaxon(CUES.klaxon, (b) => this.audio.playCue('klaxon', b), now);
  }

  /** A hull band edge (hpStingCueAt's floored, worse-edge-only answer). */
  klaxonEdge(band: HpBand | null): void {
    this.klaxon.band(band);
  }

  /** The own `sunk` event (P10): the first sinking blast, from the event itself. */
  klaxonSinkStart(): void {
    this.klaxon.sinkStart();
  }

  /** Live engine voices (own + remote) — a test / debug seam. */
  get voices(): number {
    return (this.own ? 1 : 0) + this.remotes.size;
  }

  update(f: EngineFrame): void {
    if (this.halted) return;
    const bus = this.audio.engineBus();
    this.updateOwn(bus, f.own);
    this.remotes.update(f.matchOver ? null : bus, f.listener, f.hulls);
    this.updateStorm(bus, f);
    this.updateSink(f);
    this.klaxon.frame(f.own !== null && !f.matchOver, sinkingLeftS(f.sinking01));
    this.updateEdges(f);
  }

  /**
   * STOP EVERYTHING AND HOLD (P1 / P4 / P5): every voice released, the klaxon
   * stopped, the sink insert unplugged at once. Nothing is built again until
   * `resume()`. Safe to call repeatedly.
   */
  halt(): void {
    this.halted = true;
    this.releaseOwn();
    this.remotes.releaseAll();
    this.releaseStorm();
    this.klaxon.stopAll();
    if (this.sinkWritten !== null) this.audio.setSinkFade(null, { immediate: true });
    this.sinkWritten = null;
    this.sinkLatched = false;
  }

  /** Back from a halt: rebuild from the next frame, every edge re-seeded. */
  resume(): void {
    this.halted = false;
    this.reseedEdges();
  }

  /** The next frame only SEEDS every edge detector (boost, beacon, torpedo hum). */
  reseedEdges(): void {
    this.boostPrev = null;
    this.beacons = freshBeaconCueState();
    unseedTorpedoHum(this.torps);
  }

  /** Teardown (kept for callers that never resume). */
  release(): void {
    this.halt();
  }

  private updateOwn(bus: ReturnType<EngineAudio['engineBus']>, own: OwnEngine | null): void {
    if (!bus || !own) return this.releaseOwn();
    if (this.own && this.own.cls !== own.cls) this.releaseOwn();
    this.own ??= { voice: this.makers.own(bus.ctx, bus.sink, ENGINE_PROFILES[own.cls]), cls: own.cls };
    this.own.voice.update({ throttle: own.throttle, speed01: own.speed01, boost: own.boost });
  }

  private releaseOwn(): void {
    this.own?.voice.release();
    this.own = null;
  }

  private updateStorm(bus: ReturnType<EngineAudio['engineBus']>, f: EngineFrame): void {
    if (!bus || !f.own || f.matchOver) return this.releaseStorm();
    if (!this.storm && !f.inStorm) return; // never built until first needed
    const now = bus.ctx.currentTime;
    this.storm ??= { voice: this.makers.storm(bus.ctx, bus.sink, STORM_BED_PROFILE), intensity: -1, at: -Infinity };
    const intensity = f.inStorm ? 1 : 0;
    if (intensity === this.storm.intensity && now - this.storm.at < STORM_UPDATE_S) return;
    this.storm.voice.update(intensity);
    this.storm.intensity = intensity;
    this.storm.at = now;
  }

  private releaseStorm(): void {
    this.storm?.voice.release();
    this.storm = null;
  }

  private updateSink(f: EngineFrame): void {
    const next = sinkFadeTarget(this.sinkLatched, f.sinking01, f.sinkCleared, f.sinkLatchable);
    this.sinkLatched = next.latched;
    if (next.target === null) {
      if (this.sinkWritten !== null) this.audio.setSinkFade(null);
      this.sinkWritten = null;
      return;
    }
    if (this.sinkWritten !== null && Math.abs(next.target - this.sinkWritten) < SINK_WRITE_STEP) return;
    this.audio.setSinkFade(next.target);
    this.sinkWritten = next.target;
  }

  private updateEdges(f: EngineFrame): void {
    const boost = f.own ? f.boostConfirmed : null;
    if (boost !== null && boostRose(this.boostPrev, boost)) this.audio.playCue('boostSurge');
    this.boostPrev = boost;
    if (beaconSurfaced(this.beacons, f.beaconCycle, f.beaconAfloat)) this.audio.playCue('beacon');
    if (f.listener) this.humTorpedoes(f.listener, f.drawn, f.listenerKind);
  }

  /**
   * The torpedo hum, placed over the close radius so it is loudest alongside.
   * An id is marked heard only once its hum PLAYED (P3b); an own torpedo hums
   * on its own family and lower (P3c).
   */
  private humTorpedoes(listener: { x: number; y: number }, drawn: readonly DrawnBallistic[], kind: ListenerKind): void {
    const r = CLIENT_CONFIG.audio.torpedoHumRadiusU;
    for (const t of torpedoHumCandidates(this.torps, drawn, listener, r, kind)) {
      const dx = t.x - listener.x;
      const dy = t.y - listener.y;
      const placed = { pan: worldCue(dx, dy, r)?.pan ?? 0, distance01: Math.min(1, Math.hypot(dx, dy) / r) };
      const own = t.own === true;
      const shot = own
        ? this.audio.playCue('torpedoRunOwn', { ...placed, gain: CLIENT_CONFIG.audio.ownTorpedoHumGain })
        : this.audio.playCue('torpedoRun', placed);
      if (shot) markHumHeard(this.torps, t.id);
    }
  }
}
