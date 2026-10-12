// MULTI-SPECTRAL COUNTERMEASURE cloud rendering from FrameMsg.clouds (Story
// 9.3). SMOKE IS PAINT (Eric 2026-10-12): "rather than fucking with whether I
// can see something, just draw it on top of ships" — the server hides nothing
// behind a cloud any more; the cloud is purely a visual overlay painted from
// the wire's {id,x,y,t0}.
//
// THE LAYER: chartRoot's `cloud` layer, above enemy hulls and nameplates and
// below radar paints and the own hull (Eric: "If I'm the user, I should be on
// top so I can see where I am. If I am not the user then it should render
// above everything except radar paints." — render/stage.ts).
//
// THE LOOK: one spraypaint bitmap per cloud (render/cloudPaint.ts holds the
// pure field) uploaded the way the radar heat raster is — a Uint8Array rgba
// buffer in a BufferImageSource, NEAREST-scaled, on one Sprite whose texel is
// one `CLIENT_CONFIG.countermeasure.cellU` cell, centred on the cloud, color
// `colors.woundedSmoke` with the alpha channel carrying the field.
//
// HELD, NOT RECONCILED (epic-9 amendment 51): a cloud once seen is held — the
// caller passes the held list (net/roomBindings.ts holdClouds), `sync` only
// ADDS, and a cloud leaves only when `render` finds its spray over (age ≥
// lifeMs) AND its field faded out, or at `clear` (the match-start edge).
//
// THE PHOSPHOR COPY (Eric 2026-10-12: "THIS IS NOT JUST SMOKE. THIS IS A
// MULTISPECTRAL COUNTERMEASURE. THIS SMOKE ALSO PAINTS RADAR RETURNS. RADAR
// DOES NOT BEAT IT, IT LETS YOU GET THE FUCK AWAY."): each held cloud has a
// SECOND Sprite on the SAME texture — one buffer, one upload per frame — tinted
// `colors.phosphor`, in the Radar's `cloudPaintLayer` (inside `layers.blip`,
// above the paints, under the same in-bubble dim mask). The buffer's rgb is
// white so each Sprite's tint IS its color. Its alpha is SWEEP-DRIVEN: when the
// beam's last-frame arc crosses the cloud's bearing span (centre ± asin(r/d),
// r = `cloudOutlineRadius(age)`; any arc when the viewer is inside the disc)
// the cloud is painted at that instant, and the copy decays on the radar's own
// phosphor life (`blipAlpha`) from `radarAlpha`. Never painted = invisible.
//
// COVER (`coverAt`): the field alpha under a world point — contacts.ts hides a
// NAMEPLATE under thick paint ("I don't want someone's nameplate sticking out
// from behind the smoke"). Never a hull: partials show through the overlay.
//
// MOTION-BLIND: a cloud's presence and extent are information — the motion
// setting never hides or shrinks one.

import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, cloudOutlineRadius, wrapPositive, type CloudView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { blipAlpha, blipLifeMs } from './phosphor.js';
import type { BeamWindow } from './radar.js';
import {
  CLOUD_CELLS,
  advanceField,
  fieldSpent,
  fieldToRgba,
  makeField,
  type CloudField,
} from './cloudPaint.js';

const K = CLIENT_CONFIG.countermeasure;
const COLOR = CLIENT_CONFIG.colors.woundedSmoke;
const PHOSPHOR = CLIENT_CONFIG.colors.phosphor;
/** The centre cell index — cell i's centre sits at (i − MID)·cellU. */
const MID = (CLOUD_CELLS - 1) / 2;

interface CloudSprite {
  sprite: Sprite;
  /** The phosphor copy: same texture, radar paint layer, sweep-driven alpha. */
  radar: Sprite;
  source: BufferImageSource;
  rgba: Uint8Array;
  field: CloudField;
  x: number;
  y: number;
  t0: number; // server-clock birth stamp — drives the field's age
  /** Server ms the beam last crossed this cloud; -Infinity = never. */
  paintedAt: number;
}

export class Countermeasure {
  private readonly clouds = new Map<string, CloudSprite>();
  /** The radar paint life the copies decay on — the last beam's, else base. */
  private lifeMs = blipLifeMs(60000 / CONFIG.vision.sweepRpm);

  /** `layer` = chartRoot's `cloud` layer. `radarLayer` = the Radar's
   *  `cloudPaintLayer` (the phosphor copies). `rng` = the one spray RNG (purely
   *  visual, never shared with the server; a test passes a seeded one). */
  constructor(
    private readonly layer: Container,
    private readonly radarLayer: Container,
    private readonly rng: () => number = Math.random,
  ) {}

  /** ADD every cloud on the held list not already held; an id ABSENT from
   *  the list is never removed here (render / clear do that). */
  sync(clouds: readonly CloudView[]): void {
    for (const c of clouds) if (!this.clouds.has(c.id)) this.spawn(c);
  }

  /** Per render frame: advance every field to its server-clock age (a first
   *  render of a mid-life cloud pre-rolls it), upload it, and drop every cloud
   *  whose spray is over and whose paint has faded. `serverNow` in ms. `beam` =
   *  the Radar's `beamWindow()` this frame (null: nothing swept) — it paints
   *  the phosphor copy of every cloud whose bearing span it crossed. */
  render(serverNow: number, beam: Readonly<BeamWindow> | null = null): void {
    if (beam !== null) this.lifeMs = beam.lifeMs;
    for (const [id, s] of this.clouds) {
      const age = Math.max(0, serverNow - s.t0);
      advanceField(s.field, age, this.rng);
      if (fieldSpent(s.field)) {
        this.despawn(id);
        continue;
      }
      fieldToRgba(s.field, s.rgba);
      s.source.update();
      if (beam !== null && beamCrosses(beam, s.x, s.y, cloudOutlineRadius(age))) s.paintedAt = serverNow;
      s.radar.alpha = K.radarAlpha * blipAlpha(serverNow - s.paintedAt, this.lifeMs);
    }
  }

  /** The thickest cloud paint (field alpha, 0..maxAlpha) under world (x, y)
   *  across every held cloud; 0 outside every cloud's grid. */
  coverAt(x: number, y: number): number {
    let best = 0;
    for (const s of this.clouds.values()) {
      const i = Math.round((x - s.x) / K.cellU + MID);
      const j = Math.round((y - s.y) / K.cellU + MID);
      if (i < 0 || j < 0 || i >= CLOUD_CELLS || j >= CLOUD_CELLS) continue;
      const a = s.field.alpha[j * CLOUD_CELLS + i];
      if (a > best) best = a;
    }
    return best;
  }

  /** Drop every held cloud (the match-boundary reset). */
  clear(): void {
    for (const id of [...this.clouds.keys()]) this.despawn(id);
  }

  /** The alpha field of a held cloud (test seam). */
  fieldOf(id: string): CloudField | null {
    return this.clouds.get(id)?.field ?? null;
  }

  /** The Sprite of a held cloud (test seam). */
  spriteOf(id: string): Sprite | null {
    return this.clouds.get(id)?.sprite ?? null;
  }

  /** The phosphor (radar) copy of a held cloud (test seam). */
  radarSpriteOf(id: string): Sprite | null {
    return this.clouds.get(id)?.radar ?? null;
  }

  /** How many clouds are held (test seam). */
  get size(): number {
    return this.clouds.size;
  }

  private spawn(c: CloudView): void {
    // WHITE rgb: the buffer is shared by two Sprites, so each one's TINT is
    // its color (grey smoke on the chart, phosphor on the scope).
    const rgba = new Uint8Array(CLOUD_CELLS * CLOUD_CELLS * 4);
    for (let k = 0; k < rgba.length; k += 4) {
      rgba[k] = 255;
      rgba[k + 1] = 255;
      rgba[k + 2] = 255;
    }
    // NEAREST, like the radar grid: a cell is a cell, no invented blends.
    const source = new BufferImageSource({
      resource: rgba,
      width: CLOUD_CELLS,
      height: CLOUD_CELLS,
      scaleMode: 'nearest',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    const texture = new Texture({ source });
    const sprite = placed(new Sprite(texture), c, COLOR, 1);
    const radar = placed(new Sprite(texture), c, PHOSPHOR, 0); // dark until the beam crosses it
    this.layer.addChild(sprite);
    this.radarLayer.addChild(radar);
    this.clouds.set(c.id, {
      sprite, radar, source, rgba, field: makeField(), x: c.x, y: c.y, t0: c.t0, paintedAt: -Infinity,
    });
  }

  private despawn(id: string): void {
    const s = this.clouds.get(id);
    if (!s) return;
    s.radar.destroy(); // the shared texture goes with the grey sprite, once
    s.sprite.destroy({ texture: true, textureSource: true });
    this.clouds.delete(id);
  }
}

/** A cloud Sprite: centred, one texel per cell, at the cloud, tinted. */
function placed(sprite: Sprite, c: CloudView, tint: number, alpha: number): Sprite {
  sprite.anchor.set(0.5);
  sprite.scale.set(K.cellU); // one texel = one cell
  sprite.position.set(c.x, c.y);
  sprite.tint = tint;
  sprite.alpha = alpha;
  return sprite;
}

/**
 * Did the beam's arc `prev → cur` (increasing, mod 2π) cross the bearing span
 * of a disc of radius `r` at (x, y) seen from the beam's observer? The span is
 * centre ± asin(min(1, r/d)); an observer inside the disc is crossed by any arc.
 */
export function beamCrosses(beam: Readonly<BeamWindow>, x: number, y: number, r: number): boolean {
  const dx = x - beam.x;
  const dy = y - beam.y;
  const d = Math.hypot(dx, dy);
  if (d <= r) return true;
  const half = Math.asin(Math.min(1, r / d));
  const swept = wrapPositive(beam.cur - beam.prev);
  const start = Math.atan2(dy, dx) - half; // the span is [start, start + 2·half]
  return wrapPositive(start - beam.prev) <= swept || wrapPositive(beam.prev - start) <= 2 * half;
}
