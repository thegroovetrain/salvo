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

import { BufferImageSource, Container, Rectangle, Sprite, Texture } from 'pixi.js';
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
import type { ScreenWorldRect } from './camera.js';
import type { CloudReturnInfo } from './cloudReturnGate.js';
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
  /** Server time of the last frame that delivered this cloud's row; absent =
   *  never gated (render/cloudReturnGate.ts). */
  deliveredAt?: number;
}

/** A cloud as `sync` takes it: the wire's view, plus the held set's delivery
 *  stamp when the caller has one (net/roomBindings.ts holdClouds). */
export type SyncCloud = CloudView & { deliveredAt?: number };

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
  /** The cloud sprites' own container — the layer's second child, after the
   *  halo. Its `boundsArea` is the screen's world rect while masked (see
   *  `clipToScreen`); `clip` is that one rectangle, re-filled per frame. */
  private readonly body = new Container();
  private readonly clip = new Rectangle();

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
    layer.addChild(this.body);
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

  /** The cloud sprites' container (test seam). */
  get cloudBody(): Container {
    return this.body;
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
   *  the radar dim's rule: a sprite mask at NaN would clip the whole layer).
   *
   *  NO CLOUD HELD, NO MASK (Story 9.8 perf gate). A mask is not free while
   *  the layer is empty: Pixi runs the masked layer as a FILTER PASS every
   *  frame, into a pooled render target the size of the halo sprite's bounds —
   *  never clipped to the screen, rounded up to a power of two and resolved —
   *  whether or not there is any haze to mask. At the twelfths ladder's 750 u
   *  halo that is a 2264 px pass in a 4096² target at DPR 2, every alive frame,
   *  and it was the default-framing cadence regression. With no cloud held the
   *  layer draws nothing, so masking it changes no pixel. */
  private placeHalo(own: { x: number; y: number } | null): void {
    if (own === null || !Number.isFinite(own.x + own.y)) {
      this.layer.mask = null;
      return;
    }
    this.refreshLos(own); // forgets the last cast while no cloud is held
    if (this.clouds.size === 0) {
      this.layer.mask = null;
      return;
    }
    this.halo.position.set(own.x, own.y);
    if (this.layer.mask !== this.halo) this.layer.mask = this.halo;
  }

  /**
   * CLIP THE MASK PASS TO THE SCREEN (Story 9.8 perf gate). Pixi draws a masked
   * layer through a filter pass whose target is the layer's bounds ∩ the mask
   * sprite's bounds, and its mask filter opts OUT of viewport clipping — so a
   * held cloud under the 750 u halo rendered into a target up to the halo's
   * full size (3396² px at DPR 2 at the close framing, a 4096² pooled target),
   * most of it off screen. Pinning the CLOUD BODY's `boundsArea` to the
   * screen's world rect makes the pass (screen ∩ halo): never larger than the
   * screen at any halo radius or zoom. (On the body, not the masked layer:
   * Pixi 8 adds a masked container's own `boundsArea` OUTSIDE the mask
   * intersection, so there it would union with the halo instead of clipping.)
   * Nothing outside the screen is visible, so no on-screen pixel changes; the
   * line-of-sight fan and the feather live in the mask texture, untouched.
   * Unmasked (no cloud / no pose) or no rect given → the layer measures its
   * children as before.
   */
  private clipToScreen(screen: ScreenWorldRect | null): void {
    const ok = this.layer.mask === this.halo && screen !== null
      && Number.isFinite(screen.x + screen.y + screen.w + screen.h) && screen.w > 0 && screen.h > 0;
    if (!ok) {
      // Pixi tests `if (this.boundsArea)`; its d.ts types the field as a
      // required Rectangle under exactOptionalPropertyTypes, hence the cast.
      this.body.boundsArea = null as unknown as Rectangle;
      return;
    }
    this.clip.x = screen.x;
    this.clip.y = screen.y;
    this.clip.width = screen.w;
    this.clip.height = screen.h;
    this.body.boundsArea = this.clip;
  }

  /** ADD every cloud on the held list not already held, and carry each one's
   *  delivery stamp (the radar return's gate); an id ABSENT from the list is
   *  never removed here (render / clear do that). */
  sync(clouds: readonly SyncCloud[]): void {
    for (const c of clouds) {
      const s = this.clouds.get(c.id);
      if (s === undefined) this.spawn(c);
      else if (c.deliveredAt !== undefined) s.deliveredAt = c.deliveredAt;
    }
  }

  /** Per render frame: advance every field to its server-clock age (a first
   *  render of a mid-life cloud pre-rolls it), upload it, and drop every cloud
   *  whose spray is over and whose paint has faded. `serverNow` in ms. `own` =
   *  the own hull's pose (the halo's centre); null for a spectator (no halo).
   *  `screen` = the world rect on screen this frame (see `clipToScreen`). */
  render(
    serverNow: number,
    own: { x: number; y: number } | null = null,
    screen: ScreenWorldRect | null = null,
  ): void {
    this.placeHalo(own);
    this.clipToScreen(screen);
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
    return maxCover(this.clouds.values(), x, y);
  }

  /**
   * THE RADAR'S GATED HAZE (Story 9.8 review gate, F1): `coverAt` over only
   * the held clouds `live` admits — the radar passes its per-revolution
   * delivery gate (render/cloudReturnGate.ts). Undefined when none is admitted
   * (the field then skips the cloud layer). The grey haze and `coverAt` itself
   * are untouched.
   */
  returnHaze(live: (c: CloudReturnInfo) => boolean): ((x: number, y: number) => number) | undefined {
    const admitted: CloudSprite[] = [];
    for (const s of this.clouds.values()) if (live(s)) admitted.push(s);
    if (admitted.length === 0) return undefined;
    return (x, y) => maxCover(admitted, x, y);
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

  private spawn(c: SyncCloud): void {
    const rgba = new Uint8Array(CELLS * 4);
    const sprite = new Sprite(new Texture({ source: bufferSource(rgba) }));
    sprite.anchor.set(0.5);
    sprite.scale.set(K.cellU); // one texel = one cell
    sprite.position.set(c.x, c.y);
    sprite.tint = COLOR;
    this.body.addChild(sprite);
    this.clouds.set(c.id, {
      sprite,
      source: sprite.texture.source as BufferImageSource,
      rgba,
      field: makeField(),
      x: c.x,
      y: c.y,
      t0: c.t0,
      ...(c.deliveredAt === undefined ? {} : { deliveredAt: c.deliveredAt }),
    });
  }

  private despawn(id: string): void {
    const s = this.clouds.get(id);
    if (!s) return;
    s.sprite.destroy({ texture: true, textureSource: true });
    this.clouds.delete(id);
  }
}

/** The thickest haze (field alpha) under world (x, y) across `clouds`; 0
 *  outside every cloud's grid. */
function maxCover(clouds: Iterable<CloudSprite>, x: number, y: number): number {
  let best = 0;
  for (const s of clouds) {
    const i = Math.round((x - s.x) / K.cellU + MID);
    const j = Math.round((y - s.y) / K.cellU + MID);
    if (i < 0 || j < 0 || i >= CLOUD_CELLS || j >= CLOUD_CELLS) continue;
    const a = s.field.alpha[j * CLOUD_CELLS + i];
    if (a > best) best = a;
  }
  return best;
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
