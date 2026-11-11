// THE PER-FRAME SHIP AUDIO (Story 10.13, wave B): the own engine, other
// ships' engines close alongside, the own sinking fade, and the per-frame
// edge cues that have no wire event (boost surge, beacon set surfacing, a
// torpedo coming close). main.ts builds one `EngineFrame` per render frame
// from state it already holds and calls `update` once; every decision is a
// pure function below, and the class only keeps voices alive and released.
//
// THE GATES, AS BUILT:
//   • nothing is built before the AudioContext exists, or while the game is
//     silenced (mute / ad-break duck): `Audio.engineBus()` is null and every
//     engine voice is RELEASED (no orphan graph runs muted); the next live
//     frame rebuilds.
//   • OWN ENGINE: sounds whenever main.ts hands an `own` (a hull we are
//     conning: alive or sinking, including the start line and the countdown;
//     not spectating, not after the match). Released on null; rebuilt on a
//     hull change. Non-finite inputs hold the last good targets (EngineVoice).
//   • OTHER SHIPS (Eric "make it realistic", 2026-11-11 — your own machinery
//     drowns them out): only hulls in the contact store (the true-sight gate,
//     never radar blips), heard only close alongside (`closeAlongside01` over
//     the real sight radius), the nearest `remoteEngineVoices` of them.
//   • SINK FADE: the own sinking window's progress drives the bus insert;
//     after the hull founders it holds fully closed until we spectate, live
//     again (respawn) or the match ends, then unplugs.

import { CONFIG, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { hullTopSpeed } from '../sim/hullKinematics.js';
import { closeAlongside01 } from './engine.js';
import { EngineVoice, RemoteEngineVoice } from './engineGraph.js';
import { ENGINE_PROFILES, type CueId } from './synth/cues.js';
import type { EngineProfile } from './engine.js';
import { worldCue } from './tones.js';
import {
  beaconSurfaced,
  boostRose,
  freshBeaconCueState,
  freshTorpedoHumState,
  torpedoesClose,
  type DrawnBallistic,
} from './cueEdges.js';

/** A hull in the contact store, sampled this frame. */
export interface RemoteHull {
  id: string;
  cls: ShipClassId;
  x: number;
  y: number;
  /** u/s (`Contact.speed`). */
  speed: number;
}

/** The own engine's input this frame. */
export interface OwnEngine {
  cls: ShipClassId;
  /** The helm order, −1..1 (its magnitude is the load). */
  throttle: number;
  /** |speed| / the hull's max speed. */
  speed01: number;
  boost: boolean;
}

export interface EngineFrame {
  /** null = no own engine (dead, spectating, match over, no hull yet). */
  own: OwnEngine | null;
  /** 0..1 through the own sinking window, or null when not sinking. */
  sinking01: number | null;
  /** True once the sink fade may unplug: spectating, alive again, or match over. */
  sinkCleared: boolean;
  /** Where the player listens from: own hull, else the camera centre. */
  listener: { x: number; y: number } | null;
  hulls: readonly RemoteHull[];
  /** Every ballistic the client draws this frame (any kind). */
  drawn: readonly DrawnBallistic[];
  /** The beacon set's identity and whether any of it is afloat. */
  beaconCycle: number | undefined;
  beaconAfloat: boolean;
  matchOver: boolean;
}

/** The slice of `Audio` this module uses. */
export interface EngineAudio {
  engineBus(): { ctx: BaseAudioContext; sink: AudioNode } | null;
  setSinkFade(progress01: number | null): void;
  playCue(id: CueId, opts?: { pan?: number; distance01?: number }): void;
}

/** The two voices' shared surface (EngineVoice / RemoteEngineVoice). */
interface Voice<I> {
  update(input: I, nowS?: number): void;
  release(fadeS?: number): void;
}

type OwnInput = { throttle: number; speed01: number; boost: boolean };
type RemoteInput = { speed01: number; distance01: number; pan: number };

/** Voice factories — injectable so the graph-free tests can count builds. */
export interface VoiceMakers {
  own(ctx: BaseAudioContext, sink: AudioNode, profile: EngineProfile): Voice<OwnInput>;
  remote(ctx: BaseAudioContext, sink: AudioNode, profile: EngineProfile): Voice<RemoteInput>;
}

const DEFAULT_MAKERS: VoiceMakers = {
  own: (ctx, sink, p) => new EngineVoice(ctx, sink, p),
  remote: (ctx, sink, p) => new RemoteEngineVoice(ctx, sink, p),
};

/** One audible other ship: who, and how it is heard. */
export interface RemoteMix {
  id: string;
  cls: ShipClassId;
  /** Already through `closeAlongside01` (0 alongside … 1 out of earshot). */
  distance01: number;
  pan: number;
  speed01: number;
}

/** Pure: |speed| over a hull class's base top speed; junk → 0. */
export function speedFraction(speed: number, maxSpeed: number): number {
  if (!Number.isFinite(speed) || !(maxSpeed > 0)) return 0;
  return Math.abs(speed) / maxSpeed;
}

/**
 * Pure: the other ships whose engines are heard this frame — every hull in
 * earshot (`closeAlongside01` of distance over `sightU` below 1), nearest
 * first, at most `n`. Junk positions and a junk listener hear nothing.
 */
export function audibleHulls(
  listener: { x: number; y: number },
  hulls: readonly RemoteHull[],
  sightU: number,
  n: number,
): RemoteMix[] {
  if (!Number.isFinite(listener.x) || !Number.isFinite(listener.y) || !(sightU > 0) || !(n > 0)) return [];
  const heard: Array<RemoteMix & { d: number }> = [];
  for (const h of hulls) {
    const dx = h.x - listener.x;
    const dy = h.y - listener.y;
    const d = Math.hypot(dx, dy);
    if (!Number.isFinite(d)) continue;
    const distance01 = closeAlongside01(d / sightU);
    if (distance01 >= 1) continue;
    const pan = worldCue(dx, dy, sightU)?.pan ?? 0;
    heard.push({ id: h.id, cls: h.cls, distance01, pan, speed01: speedFraction(h.speed, hullTopSpeed(h.cls)), d });
  }
  heard.sort((a, b) => a.d - b.d);
  return heard.slice(0, Math.floor(n)).map(({ d: _d, ...mix }) => mix);
}

/**
 * Pure: the sink-fade target this frame and the next latch. Sinking → its
 * progress (latched); after the window, held fully closed (1) until cleared;
 * cleared or never sinking → null (unplugged).
 */
export function sinkFadeTarget(
  latched: boolean,
  sinking01: number | null,
  cleared: boolean,
): { target: number | null; latched: boolean } {
  if (sinking01 !== null) return { target: Number.isFinite(sinking01) ? sinking01 : 0, latched: true };
  if (latched && !cleared) return { target: 1, latched: true };
  return { target: null, latched: false };
}

/** Pure: 0..1 through the sinking window ending at `until`; junk → 0. */
export function sinkingProgress(until: number, now: number, windowMs: number): number {
  if (!Number.isFinite(until) || !Number.isFinite(now) || !(windowMs > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - (until - now) / windowMs));
}

export class EngineMix {
  private own: { voice: Voice<OwnInput>; cls: ShipClassId } | null = null;
  private readonly remotes = new Map<string, { voice: Voice<RemoteInput>; cls: ShipClassId }>();
  private boostPrev: boolean | null = null;
  private sinkLatched = false;
  private sinkOn = false;
  private readonly torps = freshTorpedoHumState();
  private readonly beacons = freshBeaconCueState();

  constructor(
    private readonly audio: EngineAudio,
    private readonly makers: VoiceMakers = DEFAULT_MAKERS,
  ) {}

  /** Live engine voices (own + remote) — a test / debug seam. */
  get voices(): number {
    return (this.own ? 1 : 0) + this.remotes.size;
  }

  update(f: EngineFrame): void {
    const bus = this.audio.engineBus();
    this.updateOwn(bus, f.own);
    this.updateRemotes(bus, f);
    this.updateSink(f);
    this.updateEdges(f);
  }

  /** Release every voice and unplug the fade (teardown). */
  release(): void {
    this.releaseOwn();
    this.releaseRemotes(new Set());
    if (this.sinkOn) this.audio.setSinkFade(null);
    this.sinkOn = false;
    this.sinkLatched = false;
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

  private updateRemotes(bus: ReturnType<EngineAudio['engineBus']>, f: EngineFrame): void {
    if (!bus || f.matchOver || !f.listener) return this.releaseRemotes(new Set());
    const mix = audibleHulls(f.listener, f.hulls, CONFIG.vision.sight, CLIENT_CONFIG.audio.remoteEngineVoices);
    this.releaseRemotes(new Set(mix.map((m) => `${m.id}|${m.cls}`)));
    for (const m of mix) {
      let v = this.remotes.get(m.id);
      if (!v) {
        v = { voice: this.makers.remote(bus.ctx, bus.sink, ENGINE_PROFILES[m.cls]), cls: m.cls };
        this.remotes.set(m.id, v);
      }
      v.voice.update({ speed01: m.speed01, distance01: m.distance01, pan: m.pan });
    }
  }

  /** Release every remote voice whose `id|cls` is not in `keep`. */
  private releaseRemotes(keep: ReadonlySet<string>): void {
    for (const [id, v] of this.remotes) {
      if (keep.has(`${id}|${v.cls}`)) continue;
      v.voice.release();
      this.remotes.delete(id);
    }
  }

  private updateSink(f: EngineFrame): void {
    const next = sinkFadeTarget(this.sinkLatched, f.sinking01, f.sinkCleared);
    this.sinkLatched = next.latched;
    if (next.target === null) {
      if (this.sinkOn) this.audio.setSinkFade(null);
      this.sinkOn = false;
      return;
    }
    this.audio.setSinkFade(next.target);
    this.sinkOn = true;
  }

  private updateEdges(f: EngineFrame): void {
    const boost = f.own ? f.own.boost : null;
    if (boost !== null && boostRose(this.boostPrev, boost)) this.audio.playCue('boostSurge');
    this.boostPrev = boost;
    if (beaconSurfaced(this.beacons, f.beaconCycle, f.beaconAfloat)) this.audio.playCue('beacon');
    if (f.listener) this.humTorpedoes(f.listener, f.drawn);
  }

  /** The torpedo hum, placed over the close radius so it is loudest alongside. */
  private humTorpedoes(listener: { x: number; y: number }, drawn: readonly DrawnBallistic[]): void {
    const r = CLIENT_CONFIG.audio.torpedoHumRadiusU;
    for (const t of torpedoesClose(this.torps, drawn, listener, r)) {
      const dx = t.x - listener.x;
      const dy = t.y - listener.y;
      this.audio.playCue('torpedoRun', { pan: worldCue(dx, dy, r)?.pan ?? 0, distance01: Math.min(1, Math.hypot(dx, dy) / r) });
    }
  }
}
