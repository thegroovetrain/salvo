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
// THE PHOSPHOR COPY (Eric 2026-10-12: "THIS SMOKE ALSO PAINTS RADAR RETURNS"
// … "RADAR HAS RULES. PAINT IT LIKE THE FUCKING RADAR WORKS. IF THE BEAM
// PASSES, IT PAINTS THOSE PIXELS AND THOSE PIXELS ONLY."): each held cloud has
// a SECOND Sprite on its OWN rgba buffer (white rgb, tint `colors.phosphor`)
// in the Radar's `cloudPaintLayer` (inside `layers.blip`, above the paints,
// under the same in-bubble dim mask). It is painted PER CELL: every frame, each
// cell whose haze is at least `radarPaintMin`, within the beam's `rangeU` of
// the viewer and on a bearing inside the beam's last-frame arc [prev, cur), is
// stamped `radarAt = serverNow` with its haze at that instant. Its copy alpha
// is radarAlpha × h × blipAlpha(age, radar life), h = the haze frozen at the
// sweep (like every radar paint) and ratcheted DOWN whenever the smoke under
// it thins — so a paint only ever fades between sweeps, on the radar's own
// phosphor decay, and is never brighter than the smoke actually there. A cell
// never swept stays dark.
// The whole-cloud bearing span (`beamCrosses`) survives only as a PRE-TEST
// that skips a cloud the arc misses. No terrain shadowing on the copy: the
// radar's march records the cells it returned from, not a per-bearing reach a
// cell could look up, so the copy is clipped by range and bearing only.
//
// COVER (`coverAt`): the haze alpha under a world point — contacts.ts hides a
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
  cellOffsetU,
  fieldSpent,
  fieldToRgba,
  makeField,
  type CloudField,
} from './cloudPaint.js';

const K = CLIENT_CONFIG.countermeasure;
const COLOR = CLIENT_CONFIG.colors.countermeasureSmoke;
const PHOSPHOR = CLIENT_CONFIG.colors.phosphor;
/** The centre cell index — cell i's centre sits at (i − MID)·cellU. */
const MID = (CLOUD_CELLS - 1) / 2;
const CELLS = CLOUD_CELLS * CLOUD_CELLS;

interface CloudSprite {
  sprite: Sprite;
  source: BufferImageSource;
  rgba: Uint8Array;
  /** The phosphor copy: its own buffer, the radar paint layer, per-cell paint. */
  radar: Sprite;
  radarSource: BufferImageSource;
  radarRgba: Uint8Array;
  /** Server ms the beam last swept each cell (Float64: server ms are epoch-
   *  sized, past float32's integer range); -Infinity = never. */
  radarAt: Float64Array;
  /** The haze each cell had when the beam last swept it, ratcheted down to
   *  the live haze each frame (never up until the next sweep). */
  radarHaze: Float32Array;
  /** Server ms of the newest cell paint; -Infinity = never. */
  lastPaint: number;
  /** The copy's buffer is all-zero alpha and uploaded (nothing to redraw). */
  copyDark: boolean;
  field: CloudField;
  x: number;
  y: number;
  t0: number; // server-clock birth stamp — drives the field's age
}

export class Countermeasure {
  private readonly clouds = new Map<string, CloudSprite>();
  /** The radar paint life the copies decay on — the last beam's, else base. */
  private lifeMs = blipLifeMs(60000 / CONFIG.vision.sweepRpm);

  /** `layer` = chartRoot's `cloud` layer. `radarLayer` = the Radar's
   *  `cloudPaintLayer` (the phosphor copies). `rng` = the one brush RNG (purely
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
   *  render of a mid-life cloud pre-rolls it), upload it, paint the cells the
   *  beam just swept onto the phosphor copy and redraw its decay, and drop
   *  every cloud whose spray is over and whose paint has faded. `serverNow` in
   *  ms. `beam` = the Radar's `beamWindow()` this frame (null: nothing swept —
   *  the copy only decays). */
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
      if (beam !== null) paintSwept(s, beam, serverNow, cloudOutlineRadius(age) + K.puffMaxU);
      this.drawCopy(s, serverNow);
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

  /** The phosphor (radar) copy of a held cloud (test seam). */
  radarSpriteOf(id: string): Sprite | null {
    return this.clouds.get(id)?.radar ?? null;
  }

  /** The per-cell beam stamps of a held cloud (test seam). */
  radarAtOf(id: string): Float64Array | null {
    return this.clouds.get(id)?.radarAt ?? null;
  }

  /** The phosphor copy's rgba buffer of a held cloud (test seam). */
  radarRgbaOf(id: string): Uint8Array | null {
    return this.clouds.get(id)?.radarRgba ?? null;
  }

  /** How many clouds are held (test seam). */
  get size(): number {
    return this.clouds.size;
  }

  /** Redraw the copy's alpha from each cell's sweep stamp; once every paint
   *  has outlived the radar life the buffer is zeroed once and left alone. */
  private drawCopy(s: CloudSprite, now: number): void {
    const life = this.lifeMs;
    if (!(now - s.lastPaint < life)) {
      if (s.copyDark) return;
      for (let k = 0; k < CELLS; k++) s.radarRgba[k * 4 + 3] = 0;
      s.copyDark = true;
      s.radarSource.update();
      return;
    }
    const haze = s.field.alpha;
    for (let k = 0; k < CELLS; k++) {
      // The frozen haze only RATCHETS DOWN with the smoke: a paint never
      // brightens between sweeps, and never outshines the haze under it.
      const h = Math.min(s.radarHaze[k], haze[k]);
      s.radarHaze[k] = h;
      const v = K.radarAlpha * h * blipAlpha(now - s.radarAt[k], life);
      s.radarRgba[k * 4 + 3] = (v * 255 + 0.5) | 0;
    }
    s.copyDark = false;
    s.radarSource.update();
  }

  private spawn(c: CloudView): void {
    const rgba = new Uint8Array(CELLS * 4);
    const sprite = placed(new Sprite(new Texture({ source: bufferSource(rgba) })), c, COLOR);
    // WHITE rgb, zero alpha: the copy's TINT is its color (phosphor on the scope).
    const radarRgba = new Uint8Array(CELLS * 4).fill(255);
    for (let k = 3; k < radarRgba.length; k += 4) radarRgba[k] = 0;
    const radar = placed(new Sprite(new Texture({ source: bufferSource(radarRgba) })), c, PHOSPHOR);
    this.layer.addChild(sprite);
    this.radarLayer.addChild(radar);
    this.clouds.set(c.id, {
      sprite,
      source: sprite.texture.source as BufferImageSource,
      rgba,
      radar,
      radarSource: radar.texture.source as BufferImageSource,
      radarRgba,
      radarAt: new Float64Array(CELLS).fill(-Infinity),
      radarHaze: new Float32Array(CELLS),
      lastPaint: -Infinity,
      copyDark: true,
      field: makeField(),
      x: c.x,
      y: c.y,
      t0: c.t0,
    });
  }

  private despawn(id: string): void {
    const s = this.clouds.get(id);
    if (!s) return;
    s.radar.destroy({ texture: true, textureSource: true });
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

/** A cloud Sprite: centred, one texel per cell, at the cloud, tinted. */
function placed(sprite: Sprite, c: CloudView, tint: number): Sprite {
  sprite.anchor.set(0.5);
  sprite.scale.set(K.cellU); // one texel = one cell
  sprite.position.set(c.x, c.y);
  sprite.tint = tint;
  return sprite;
}

/**
 * THE RADAR RULE, per cell: stamp `radarAt = now` (and the haze then) on every
 * cell of the cloud whose haze is at least `radarPaintMin`, within
 * `beam.rangeU` of the viewer, on a bearing inside the arc [prev, cur) (mod
 * 2π). `reachU` bounds the cells looked at (the outline plus one largest puff);
 * a cloud whose bearing span the arc misses, or that lies wholly beyond range,
 * is skipped outright.
 */
function paintSwept(s: CloudSprite, beam: Readonly<BeamWindow>, now: number, reachU: number): void {
  if (!beamCrosses(beam, s.x, s.y, reachU)) return;
  if (Math.hypot(s.x - beam.x, s.y - beam.y) - reachU > beam.rangeU) return;
  const span = Math.ceil(reachU / K.cellU);
  const lo = Math.max(0, Math.floor(MID) - span);
  const hi = Math.min(CLOUD_CELLS - 1, Math.ceil(MID) + span);
  const swept = wrapPositive(beam.cur - beam.prev);
  for (let j = lo; j <= hi; j++) {
    const dy = s.y + cellOffsetU(j) - beam.y;
    for (let i = lo; i <= hi; i++) {
      const k = j * CLOUD_CELLS + i;
      const haze = s.field.alpha[k];
      if (haze < K.radarPaintMin) continue;
      if (!inBeam(s.x + cellOffsetU(i) - beam.x, dy, beam, swept)) continue;
      s.radarAt[k] = now;
      s.radarHaze[k] = haze;
      s.lastPaint = now;
    }
  }
}

/** Is the offset (dx, dy) from the viewer within range and inside the arc? */
function inBeam(dx: number, dy: number, beam: Readonly<BeamWindow>, swept: number): boolean {
  if (dx * dx + dy * dy > beam.rangeU * beam.rangeU) return false;
  return wrapPositive(Math.atan2(dy, dx) - beam.prev) < swept;
}

/**
 * THE PRE-TEST ONLY (never the paint): could the beam's arc `prev → cur`
 * (increasing, mod 2π) touch a disc of radius `r` at (x, y) seen from the
 * beam's observer? The span is centre ± asin(min(1, r/d)); an observer inside
 * the disc is crossed by any arc.
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
