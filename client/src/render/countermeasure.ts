// MULTI-SPECTRAL COUNTERMEASURE cloud rendering from FrameMsg.clouds (Story
// 9.3, Eric rulings 2026-10-11, epic-9 amendments 40–47). Contact-like
// per-observer state, not events, drawn in the fog-immune `smoke` chart
// layer, which sits BELOW `blip` so a radar return is never beneath the cloud
// (amendment 224(b)).
//
// HELD, NOT RECONCILED (epic-9 amendment 51): a cloud once seen is held until
// it dies — delivery is per-sweep (Eric 2026-10-12: "If it's detected by my
// radar, I want my radar to paint it"); nothing new is disclosed by holding
// what was already sent. `sync` only ADDS (a frame without a held id never
// removes it); a cloud is removed by `render` once its server-clock age
// reaches `CONFIG.countermeasure.lifeMs`, or by `clear`, and the shared base
// memo is pruned at that removal, never per frame.
//
// THE PIXELS ARE THE SHARED FUNCTION. The wire carries only {id,x,y,t0}; every
// pixel's position and death age come from shared sim/cloud.ts
// (`forEachLivingPixel` over the memoized `cloudBase(id)`, render/cloudBases.ts)
// — the very function the server's sight and radar predicates evaluate. Each
// living pixel is drawn as a filled square of side
// `CLIENT_CONFIG.countermeasure.drawSizeU`, centered on the exact point the
// server's footprint test uses. The square is drawn LARGER than the blocking
// footprint (`CONFIG.countermeasure.footprintU`, untouched) so the cloud reads
// dense on screen (Eric 2026-10-11). No disc, no rim, no outline.
//
// NOT WOUNDED SMOKE (render/smoke.ts, CLIENT_CONFIG.smoke, the `sm` event).
// The two share `colors.woundedSmoke` and are told apart by SHAPE: a cloud is a
// field of hard-edged squares; a wounded plume is small soft blobs trailing a
// hull.
//
// MOTION-BLIND: a cloud's presence and extent are information — the motion
// setting never hides or shrinks one. Only each pixel's own end-of-life fade
// (timestamp math off the wire `t0`; the client keeps no timers) moves alpha.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, forEachLivingPixel, type CloudBase, type CloudView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01 } from '../util/math.js';
import { cloudBaseFor, retainCloudBases } from './cloudBases.js';

const K = CLIENT_CONFIG.countermeasure;
const COLOR = CLIENT_CONFIG.colors.woundedSmoke;
/** u — a pixel square's drawn side (a feel knob, larger than the footprint). */
const SIDE = K.drawSizeU;
const HALF = SIDE / 2;

/**
 * Pure: the alpha multiplier of a pixel that dies at age `dieAtMs`, at age
 * `ageMs` — 1 until its own last `fadeMs`, then linear to 0 at its death.
 */
export function pixelFade(dieAtMs: number, ageMs: number): number {
  return clamp01((dieAtMs - ageMs) / K.fadeMs);
}

interface CloudSprite {
  g: Graphics; // positioned at the cloud center; squares drawn center-relative
  base: CloudBase; // the shared memo's entry for this id
  t0: number; // server-clock birth stamp — drives the pixel age
  drawn: number; // squares drawn on the last render (test seam)
}

export class Countermeasure {
  private readonly sprites = new Map<string, CloudSprite>();
  // The draw callback's per-cloud inputs, set before each `forEachLivingPixel`
  // pass so the callback is ONE bound function, never a per-frame closure.
  private cur: CloudSprite | null = null;
  private curAge = 0;
  private readonly drawPixel = (x: number, y: number, i: number): void => {
    const s = this.cur!;
    const alpha = K.fillAlpha * pixelFade(s.base.dieAt[i], this.curAge);
    s.g.rect(x - HALF, y - HALF, SIDE, SIDE).fill({ color: COLOR, alpha });
    s.drawn++;
  };

  /** `layer` = chartRoot's `smoke` layer (fog-immune, beneath `blip`). */
  constructor(private readonly layer: Container) {}

  /**
   * ADD every cloud on the list not already held (the caller passes the held
   * list — net/roomBindings.ts holdClouds). Clouds never move, so a held id is
   * left alone, and an id ABSENT from the list is NOT removed: the channel is
   * per-sweep, and a cloud once seen is held until it dies (render / clear).
   */
  sync(clouds: readonly CloudView[]): void {
    for (const c of clouds) if (!this.sprites.has(c.id)) this.spawn(c);
  }

  /** Per render frame: redraw every living pixel of every cloud at its age,
   *  and REMOVE every cloud whose age has reached its life (then prune the
   *  shared base memo to the clouds still held). `serverNow` is the
   *  server-clock estimate (ms). */
  render(serverNow: number): void {
    let expired = false;
    for (const [id, s] of this.sprites) {
      const age = Math.max(0, serverNow - s.t0);
      if (age >= CONFIG.countermeasure.lifeMs) {
        this.despawn(id);
        expired = true;
        continue;
      }
      s.g.clear();
      s.drawn = 0;
      this.cur = s;
      this.curAge = age;
      forEachLivingPixel(s.base, 0, 0, age, this.drawPixel);
    }
    this.cur = null;
    if (expired) this.pruneBases();
  }

  /** Drop every held cloud and its memoized base (a match-boundary reset). */
  clear(): void {
    for (const id of [...this.sprites.keys()]) this.despawn(id);
    this.pruneBases();
  }

  /** The memoized pixel constants of a held cloud (test seam). */
  baseOf(id: string): CloudBase | null {
    return this.sprites.get(id)?.base ?? null;
  }

  /** Squares drawn for a held cloud on the last render (test seam). */
  squaresOf(id: string): number | null {
    return this.sprites.get(id)?.drawn ?? null;
  }

  /** The Graphics of a held cloud (test seam). */
  graphicsOf(id: string): Graphics | null {
    return this.sprites.get(id)?.g ?? null;
  }

  /** How many clouds are held (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private spawn(c: CloudView): void {
    const g = new Graphics();
    g.position.set(c.x, c.y);
    this.layer.addChild(g);
    this.sprites.set(c.id, { g, base: cloudBaseFor(c.id), t0: c.t0, drawn: 0 });
  }

  private pruneBases(): void {
    retainCloudBases(new Set(this.sprites.keys()));
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }
}
