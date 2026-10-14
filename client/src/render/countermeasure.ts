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
//
// THE HALO (session 5, Eric 2026-10-12, then on the eighths ladder: "The smoke is visible outside of 5/8
// intel range. Why? … I cannot see the smoke outside of that range, I can only
// infer it from radar returns."): the haze is a smoke effect, seen by eye only
// within the viewer's flash rung (6/12 since Story 9.8) — the wounded-smoke reach. A cloud is still
// DELIVERED to anyone whose radar sweeps it (the radar paints it), so the eye's
// limit is a display-time mask on the `cloud` layer: one Sprite baked by
// textures.ts `bakeHaloMaskTexture` (opaque inside the halo, feathered to 0
// past it — render/hazeHalo.ts), centred on the own hull every frame — the
// radar's in-bubble dim mask pattern exactly. No own pose (a spectator) → no
// mask: a spectator sees everything. `coverAt` and the radar returns read the
// FIELD, never the mask, so neither changes.
//
// THE HALO SEES PAST NO ISLAND (session 6, Eric 2026-10-12: "Yes, if I can't
// see it because of an island or any other sight block, don't render it."):
// wounded smoke reaches a client only with island LOS clear, so the haze obeys
// it too. The halo mask is a LINE-OF-SIGHT mask: render/hazeLos.ts casts
// `losRays` bearings from the own hull to halo + feather against the match's
// islands (`setIslands`, once per map — the `setWakeSources` precedent), and
// the bake fills the same halo gradient through the fan of hit points, so each
// island cuts a hard shadow from its near edge outward. Re-cast only on a move
// of `losRecastMoveU` or a halo / island change (cost — config.ts). No
// islands → the plain disc. A grounded hull fails open (no shadows).

import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { CloudView, Island } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  CLOUD_CELLS,
  advanceField,
  fieldSpent,
  fieldToRgba,
  makeField,
  type CloudField,
} from './cloudPaint.js';
import { BASE_HAZE_HALO_U, haloSpanU } from './hazeHalo.js';
import { HazeLosCaster } from './hazeLos.js';
import { HALO_MASK_TEXTURE_SIZE, bakeHaloMaskTexture } from './textures.js';

/** Scene-graph label of the haze halo mask (test seam). */
export const HALO_MASK_LABEL = 'hazeHaloMask';

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
  /** The halo mask sprite — never drawn, always transformed (radar.ts `dim`). */
  private readonly halo: Sprite;
  /** The halo radius (u) the current mask texture was baked at. */
  private haloBakedAtU = BASE_HAZE_HALO_U;
  /** The match's islands (fixed per map) — the halo's sight blockers. */
  private islands: readonly Island[] = [];
  private readonly los = new HazeLosCaster(K.losRays);
  /** Where the shadows were last cast from; NaN = re-cast on the next pose
   *  (halo or island change). */
  private castX = Number.NaN;
  private castY = Number.NaN;
  /** Does the mask currently carry island shadows (vs the plain disc)? */
  private shadowed = false;

  /** `layer` = chartRoot's `cloud` layer. `rng` = the one brush RNG (purely
   *  visual, never shared with the server; a test passes a seeded one). */
  constructor(
    private readonly layer: Container,
    private readonly rng: () => number = Math.random,
  ) {
    this.halo = new Sprite(bakeHaloMaskTexture(this.haloBakedAtU));
    this.halo.label = HALO_MASK_LABEL;
    this.halo.anchor.set(0.5);
    this.scaleHalo();
    // renderable=false keeps the live world transform without painting a grey
    // square (the radar dim mask's reasoning); first child, so cloud sprites
    // never depend on where it lands.
    this.halo.renderable = false;
    layer.addChildAt(this.halo, 0);
  }

  /**
   * The viewer's halo radius — `hazeHaloU(radarRange)`, fed from the same place
   * `radar.setRanges` is (main.ts), so it follows RADAR SWEEP upgrades.
   * Re-bakes only on a real change, IN PLACE (never destroying the bound mask
   * source — textures.ts `bakeDimMaskTexture`'s crash). A non-finite or
   * non-positive radius holds the last good one. Commits before baking, so a
   * throwing bake costs one call, not every call (radar.ts `syncDimMask`).
   */
  setHaloU(haloU: number): void {
    if (!Number.isFinite(haloU) || haloU <= 0 || haloU === this.haloBakedAtU) return;
    this.haloBakedAtU = haloU;
    this.scaleHalo();
    this.halo.texture = bakeHaloMaskTexture(haloU, this.halo.texture);
    this.shadowed = false;
    this.castX = Number.NaN; // the reach moved: re-cast on the next pose
  }

  /** The match's islands — the halo's sight blockers (main.ts, once per map,
   *  beside `radar.setWakeSources`). An empty set restores the plain disc at
   *  once; otherwise the shadows are cast on the next pose. */
  setIslands(islands: readonly Island[]): void {
    this.islands = islands;
    this.castX = Number.NaN;
    if (islands.length === 0 && this.shadowed) this.bakeHalo(null);
  }

  /** Re-cast the island shadows from `own` when it has moved `losRecastMoveU`
   *  since the last cast, or the halo / island set changed, or the first cloud
   *  was just held — and never while no cloud is held. */
  private refreshLos(own: { x: number; y: number }): void {
    if (this.islands.length === 0) return;
    // NO HAZE, NO WORK: with no cloud held the mask masks nothing, so skip the
    // cast — and forget the last one, so the first cloud held forces a fresh
    // cast that frame whatever the move threshold says.
    if (this.clouds.size === 0) {
      this.castX = Number.NaN;
      return;
    }
    if (Math.hypot(own.x - this.castX, own.y - this.castY) < K.losRecastMoveU) return;
    this.castX = own.x;
    this.castY = own.y;
    this.los.cast(own.x, own.y, this.haloBakedAtU + K.haloFeatherU, this.islands);
    this.bakeHalo(this.los.rays);
  }

  /** Redraw the mask in place: the fan through `rays`, or the plain disc. */
  private bakeHalo(rays: Float32Array | null): void {
    this.halo.texture = bakeHaloMaskTexture(this.haloBakedAtU, this.halo.texture, rays);
    this.shadowed = rays !== null;
  }

  /** The halo radius (u) the mask is baked at (test seam). */
  get haloU(): number {
    return this.haloBakedAtU;
  }

  /** The halo mask sprite (test seam). */
  get haloMask(): Sprite {
    return this.halo;
  }

  /** One texel = `2 × spanU / size` world units. */
  private scaleHalo(): void {
    this.halo.scale.set((2 * haloSpanU(this.haloBakedAtU)) / HALO_MASK_TEXTURE_SIZE);
  }

  /** Centre the halo on own hull, or take it off (spectator / non-finite pose —
   *  the radar dim's rule: a sprite mask at NaN would clip the whole layer). */
  private placeHalo(own: { x: number; y: number } | null): void {
    if (own === null || !Number.isFinite(own.x + own.y)) {
      this.layer.mask = null;
      return;
    }
    this.refreshLos(own);
    this.halo.position.set(own.x, own.y);
    if (this.layer.mask !== this.halo) this.layer.mask = this.halo;
  }

  /** ADD every cloud on the held list not already held; an id ABSENT from
   *  the list is never removed here (render / clear do that). */
  sync(clouds: readonly CloudView[]): void {
    for (const c of clouds) if (!this.clouds.has(c.id)) this.spawn(c);
  }

  /** Per render frame: advance every field to its server-clock age (a first
   *  render of a mid-life cloud pre-rolls it), upload it, and drop every cloud
   *  whose spray is over and whose paint has faded. `serverNow` in ms. `own` =
   *  the own hull's pose (the halo's centre); null for a spectator (no halo). */
  render(serverNow: number, own: { x: number; y: number } | null = null): void {
    this.placeHalo(own);
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
