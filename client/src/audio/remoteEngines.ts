// OTHER SHIPS' ENGINES (Story 10.13; Eric "make it realistic", 2026-11-11 —
// your own machinery drowns them out): only hulls in the contact store (the
// true-sight gate, never radar blips), heard only close alongside
// (`closeAlongside01` over the real sight radius), the nearest
// `remoteEngineVoices` of them.
//
// HYSTERESIS (review P15): a hull hovering at the close-alongside cutoff, or
// two hulls swapping 3rd / 4th nearest, must not build and release a graph
// every frame. A hull that already HAS a voice keeps it until it is clearly out
// (`KEEP_MARGIN` past the cutoff) and wins a nearest-N tie within
// `SWAP_MARGIN`; and a hull whose voice is still fading out is not given a
// second one until the fade is over.

import { CONFIG, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { hullTopSpeed } from '../sim/hullKinematics.js';
import { CLOSE_ALONGSIDE_CUTOFF, closeAlongside01, type EngineProfile } from './engine.js';
import { RELEASE_S } from './engineGraph.js';
import { ENGINE_PROFILES } from './synth/cues.js';
import { worldCue } from './tones.js';

/** A hull in the contact store, sampled this frame. */
export interface RemoteHull {
  id: string;
  cls: ShipClassId;
  x: number;
  y: number;
  /** u/s (`Contact.speed`). */
  speed: number;
}

/** One audible other ship: who, and how it is heard. */
export interface RemoteMix {
  id: string;
  cls: ShipClassId;
  /** Already through `closeAlongside01` (0 alongside … 1 out of earshot). */
  distance01: number;
  pan: number;
  speed01: number;
}

/** A voice already sounding is kept until this far PAST the cutoff (a share of it). */
export const KEEP_MARGIN = 0.1;
/** A voice already sounding wins the nearest-N cut unless a new hull is this much nearer (a share). */
export const SWAP_MARGIN = 0.1;
/** s past the release fade before an id may be given a fresh voice. */
const FADE_GUARD_S = RELEASE_S + 0.05;

/** Pure: |speed| over a hull class's base top speed; junk → 0. */
export function speedFraction(speed: number, maxSpeed: number): number {
  if (!Number.isFinite(speed) || !(maxSpeed > 0)) return 0;
  return Math.abs(speed) / maxSpeed;
}

const finitePoint = (p: { x: number; y: number }): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * Pure: the other ships whose engines are heard this frame, nearest first, at
 * most `n`. A new hull must be inside the close-alongside cutoff; a hull in
 * `held` (it already has a voice) stays heard up to `KEEP_MARGIN` past it, and
 * ranks as if `SWAP_MARGIN` nearer. Junk positions and a junk listener hear
 * nothing.
 */
export function audibleHulls(
  listener: { x: number; y: number },
  hulls: readonly RemoteHull[],
  sightU: number,
  n: number,
  held: ReadonlySet<string> = new Set(),
): RemoteMix[] {
  if (!finitePoint(listener) || !(sightU > 0) || !(n > 0)) return [];
  const heard: Array<RemoteMix & { rank: number }> = [];
  for (const h of hulls) {
    const one = hearOne(listener, h, sightU, held.has(h.id));
    if (one) heard.push(one);
  }
  heard.sort((a, b) => a.rank - b.rank);
  return heard.slice(0, Math.floor(n)).map(({ rank: _rank, ...mix }) => mix);
}

/** One hull as heard (with its nearest-N rank), or null when out of earshot. */
function hearOne(listener: { x: number; y: number }, h: RemoteHull, sightU: number, kept: boolean): (RemoteMix & { rank: number }) | null {
  const dx = h.x - listener.x;
  const dy = h.y - listener.y;
  const raw = Math.hypot(dx, dy) / sightU;
  const limit = CLOSE_ALONGSIDE_CUTOFF * (kept ? 1 + KEEP_MARGIN : 1);
  if (!Number.isFinite(raw) || raw >= limit) return null;
  const pan = worldCue(dx, dy, sightU)?.pan ?? 0;
  const speed01 = speedFraction(h.speed, hullTopSpeed(h.cls));
  return { id: h.id, cls: h.cls, distance01: closeAlongside01(raw), pan, speed01, rank: raw * (kept ? 1 - SWAP_MARGIN : 1) };
}

type RemoteInput = { speed01: number; distance01: number; pan: number };

/** The voice surface this host drives (RemoteEngineVoice). */
export interface RemoteVoice {
  update(input: RemoteInput, nowS?: number): void;
  release(fadeS?: number): void;
}

export type RemoteMaker = (ctx: BaseAudioContext, sink: AudioNode, profile: EngineProfile) => RemoteVoice;

/** The remote-engine voices: one per heard hull, with the hysteresis above. */
export class RemoteEngines {
  private readonly voices = new Map<string, { voice: RemoteVoice; cls: ShipClassId }>();
  /** id → when its released voice has finished fading (context time, s). */
  private readonly fading = new Map<string, number>();

  constructor(private readonly make: RemoteMaker) {}

  get size(): number {
    return this.voices.size;
  }

  update(bus: { ctx: BaseAudioContext; sink: AudioNode } | null, listener: { x: number; y: number } | null, hulls: readonly RemoteHull[]): void {
    if (!bus || !listener) return this.releaseAll(bus?.ctx.currentTime);
    const now = bus.ctx.currentTime;
    for (const [id, until] of this.fading) if (until <= now) this.fading.delete(id);
    const mix = audibleHulls(listener, hulls, CONFIG.vision.sight, CLIENT_CONFIG.audio.remoteEngineVoices, new Set(this.voices.keys()));
    const keep = new Set(mix.map((m) => `${m.id}|${m.cls}`));
    for (const [id, v] of this.voices) if (!keep.has(`${id}|${v.cls}`)) this.release(id, now);
    for (const m of mix) this.drive(bus, m);
  }

  /** Release every voice (no listener, no bus, match over, teardown). */
  releaseAll(nowS?: number): void {
    for (const id of [...this.voices.keys()]) this.release(id, nowS);
  }

  private drive(bus: { ctx: BaseAudioContext; sink: AudioNode }, m: RemoteMix): void {
    let v = this.voices.get(m.id);
    if (!v) {
      if (this.fading.has(m.id)) return; // its last voice is still fading out
      v = { voice: this.make(bus.ctx, bus.sink, ENGINE_PROFILES[m.cls]), cls: m.cls };
      this.voices.set(m.id, v);
    }
    v.voice.update({ speed01: m.speed01, distance01: m.distance01, pan: m.pan });
  }

  private release(id: string, nowS: number | undefined): void {
    this.voices.get(id)?.voice.release();
    this.voices.delete(id);
    if (nowS !== undefined && Number.isFinite(nowS)) this.fading.set(id, nowS + FADE_GUARD_S);
  }
}
