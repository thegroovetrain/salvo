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
// THE LOOK: one smoke-brush bitmap per cloud (render/cloudPaint.ts holds the
// pure field — soft overlapping puffs of many sizes and greys, Eric
// 2026-10-12) uploaded the way the radar heat raster is — a Uint8Array rgba
// buffer in a BufferImageSource on one Sprite whose texel is one
// `CLIENT_CONFIG.countermeasure.cellU` cell, centred on the cloud. LINEAR
// scaling (session 3): the puffs are soft, and nearest-scaling them read as
// blocks. The buffer's rgb carries the field's per-cell SHADE (a grey
// multiplier) and the Sprite's tint is `colors.countermeasureSmoke` (a light grey — Eric's reference, not the wounded plume brown).
//
// HELD, NOT RECONCILED (epic-9 amendment 51): a cloud once seen is held — the
// caller passes the held list (net/roomBindings.ts holdClouds), `sync` only
// ADDS, and a cloud leaves only when `render` finds its spray over (age ≥
// lifeMs) AND its field faded out, or at `clear` (the match-start edge).
//
// THE RADAR RETURN (session 4, Eric 2026-10-12: "Don't forget to composite it
// onto the radar layer so it can be painted. It should give returns in
// strength based on how thick the smoke is."): this module draws NOTHING on
// the scope. The Radar holds this object as a return source (`setCloudSource`,
// the `setWakeSources` precedent) and its beam march reads `coverAt` per
// sample as one more field material (render/radarSources.ts `cloudSample`:
// coefficient = radarGain × haze). From there the cloud's echo belongs to the
// heat grid — swept, shadowed, frozen, banded, phosphor-decayed and in-bubble
// dimmed by the same rules as every other return. (Session 3's separate
// phosphor-copy sprite is gone with this.)
//
// COVER (`coverAt`): the haze alpha under a world point — the radar's return
// source above, and contacts.ts hides a NAMEPLATE under thick paint ("I don't
// want someone's nameplate sticking out from behind the smoke"). Never a
// hull: partials show through the overlay.
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

const K = CLIENT_CONFIG.countermeasure;
const COLOR = CLIENT_CONFIG.colors.countermeasureSmoke;
/** The centre cell index — cell i's centre sits at (i − MID)·cellU. */
const MID = (CLOUD_CELLS - 1) / 2;
const CELLS = CLOUD_CELLS * CLOUD_CELLS;

interface CloudSprite {
  sprite: Sprite;
  source: BufferImageSource;
  rgba: Uint8Array;
  field: CloudField;
  x: number;
  y: number;
  t0: number; // server-clock birth stamp — drives the field's age
}

export class Countermeasure {
  private readonly clouds = new Map<string, CloudSprite>();

  /** `layer` = chartRoot's `cloud` layer. `rng` = the one brush RNG (purely
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
      const age = Math.max(0, serverNow - s.t0);
      advanceField(s.field, age, this.rng);
      if (fieldSpent(s.field)) {
        this.despawn(id);
        continue;
      }
      fieldToRgba(s.field, s.rgba);
      s.source.update();
    }
  }

  /** The thickest cloud haze (field alpha, 0..maxAlpha) under world (x, y)
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

  /** How many clouds are held (test seam, and the radar's skip-when-empty). */
  get size(): number {
    return this.clouds.size;
  }

  private spawn(c: CloudView): void {
    const rgba = new Uint8Array(CELLS * 4);
    const sprite = new Sprite(new Texture({ source: bufferSource(rgba) }));
    sprite.anchor.set(0.5);
    sprite.scale.set(K.cellU); // one texel = one cell
    sprite.position.set(c.x, c.y);
    sprite.tint = COLOR;
    this.layer.addChild(sprite);
    this.clouds.set(c.id, {
      sprite,
      source: sprite.texture.source as BufferImageSource,
      rgba,
      field: makeField(),
      x: c.x,
      y: c.y,
      t0: c.t0,
    });
  }

  private despawn(id: string): void {
    const s = this.clouds.get(id);
    if (!s) return;
    s.sprite.destroy({ texture: true, textureSource: true });
    this.clouds.delete(id);
  }
}

/** One cloud bitmap: CLOUD_CELLS² rgba, LINEAR-scaled (soft puffs read soft). */
function bufferSource(rgba: Uint8Array): BufferImageSource {
  return new BufferImageSource({
    resource: rgba,
    width: CLOUD_CELLS,
    height: CLOUD_CELLS,
    scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload',
  });
}
