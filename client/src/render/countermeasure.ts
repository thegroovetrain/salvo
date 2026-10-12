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
// MOTION-BLIND: a cloud's presence and extent are information — the motion
// setting never hides or shrinks one.

import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { CloudView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  CLOUD_CELLS,
  advanceField,
  fieldSpent,
  fieldToRgba,
  makeField,
  type CloudField,
} from './cloudPaint.js';

const COLOR = CLIENT_CONFIG.colors.woundedSmoke;

interface CloudSprite {
  sprite: Sprite;
  source: BufferImageSource;
  rgba: Uint8Array;
  field: CloudField;
  t0: number; // server-clock birth stamp — drives the field's age
}

export class Countermeasure {
  private readonly clouds = new Map<string, CloudSprite>();

  /** `layer` = chartRoot's `cloud` layer. `rng` = the one spray RNG (purely
   *  visual, never shared with the server; a test passes a seeded one). */
  constructor(
    private readonly layer: Container,
    private readonly rng: () => number = Math.random,
  ) {}

  /** ADD every cloud on the held list not already held; an id ABSENT from
   *  the list is never removed here (render / clear do that). */
  sync(clouds: readonly CloudView[]): void {
    for (const c of clouds) if (!this.clouds.has(c.id)) this.spawn(c);
  }

  /** Per render frame: advance every field to its server-clock age (a first
   *  render of a mid-life cloud pre-rolls it), upload it, and drop every cloud
   *  whose spray is over and whose paint has faded. `serverNow` in ms. */
  render(serverNow: number): void {
    for (const [id, s] of this.clouds) {
      advanceField(s.field, Math.max(0, serverNow - s.t0), this.rng);
      if (fieldSpent(s.field)) {
        this.despawn(id);
        continue;
      }
      fieldToRgba(s.field, s.rgba);
      s.source.update();
    }
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

  /** How many clouds are held (test seam). */
  get size(): number {
    return this.clouds.size;
  }

  private spawn(c: CloudView): void {
    const rgba = new Uint8Array(CLOUD_CELLS * CLOUD_CELLS * 4);
    const r = (COLOR >> 16) & 255;
    const g = (COLOR >> 8) & 255;
    const b = COLOR & 255;
    for (let k = 0; k < rgba.length; k += 4) {
      rgba[k] = r;
      rgba[k + 1] = g;
      rgba[k + 2] = b;
    }
    // NEAREST, like the radar grid: a cell is a cell, no invented blends.
    const source = new BufferImageSource({
      resource: rgba,
      width: CLOUD_CELLS,
      height: CLOUD_CELLS,
      scaleMode: 'nearest',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    const sprite = new Sprite(new Texture({ source }));
    sprite.anchor.set(0.5);
    sprite.scale.set(CLIENT_CONFIG.countermeasure.cellU); // one texel = one cell
    sprite.position.set(c.x, c.y);
    this.layer.addChild(sprite);
    this.clouds.set(c.id, { sprite, source, rgba, field: makeField(), t0: c.t0 });
  }

  private despawn(id: string): void {
    const s = this.clouds.get(id);
    if (!s) return;
    s.sprite.destroy({ texture: true, textureSource: true });
    this.clouds.delete(id);
  }
}
