// THE FOG FIELD view (Story 9.10 re-plan "THE FIELD", Eric 2026-10-15: "no
// discs — realistic rolling fog", "make it performant"; the look is his pick B
// "Wisps"). The fog is a continuous density field over the whole ocean
// (shared sim/fog.ts), derived HERE from the same inputs the server uses: the
// welcome's `fogSeed` (`setSeed`), the match clock (`serverNow`), `CONFIG.fog`
// and the schema's match-wide `fogCut` (`setCut`). Nothing per-ship about fog
// rides the wire; this view never decides visibility (the server already
// withheld every contact the eye cannot see through the haze) — it only paints.
//
// THE LAYER: chartRoot's `fog` layer, directly above `litZone` and below
// `smoke`, every marker, every hull and nameplate (render/stage.ts — amendment
// 171(b): a hull delivered from inside fog stays visible above the haze).
//
// THE COMPOSITION (density mask × scrolling wisps tile):
// - THE DENSITY RASTER: ONE world-anchored Float32 grid of `cellU` cells over
//   the viewer's halo square (side 2 × (halo span + recenterU)), filled with
//   `fogDensityAt(field, x, y, serverNow, easedCut)` every `refreshMs` of frame
//   time — or at once when the raster's centre is more than `recenterU` from
//   the own hull (the origin then snaps to the cell grid around the hull, so a
//   re-centre never makes the image swim). It is uploaded into ONE
//   BufferImageSource (rgb white, alpha = density, LINEAR filtering) on ONE
//   sprite placed at the raster origin in world units, scale = cellU. Between
//   refreshes nothing moves: the fog's own motion is inside the field (its
//   wind and spin terms), so the next refresh carries it.
// - THE WISPS: a TilingSprite of the pre-baked puff tile (render/fogPuffTile.ts,
//   2 u per texel), alpha `maxAlpha`, world-anchored through `tilePosition`
//   and scrolled with the field's wind (u/ms) — motion off → it holds still.
// - The density sprite is the tiling sprite's MASK on the ALPHA channel
//   (`setMask({ channel: 'alpha' })`), so per screen pixel the drawn alpha is
//   density(cell, linearly filtered) × puff(uv) × maxAlpha. Chosen because it
//   is the cheapest correct multiply Pixi offers without a custom shader: no
//   per-frame CPU work, one sprite-mask filter pass. That pass is sized by the
//   tiling sprite's bounds, so the tiling sprite is re-sized every frame to
//   (raster rect ∩ screen rect) — never larger than the screen.
//
// THE HALO + ISLAND LINE OF SIGHT (amendment 60's mask, reused exactly as the
// disc view did): fog is seen by eye only inside the viewer's flash-rung halo
// and never behind an island — render/hazeHalo.ts, render/hazeLos.ts and
// textures.ts `bakeHaloMaskTexture` build this layer's own mask sprite (one
// sprite cannot mask two layers), centred on the own hull; the body's
// `boundsArea` is pinned to the screen while masked (the countermeasure's
// Story 9.8 perf fix). No own pose (a spectator) → no halo mask and a raster
// that covers the screen around its centre (cell grown so the raster stays
// ≤ SPECTATOR_CELLS² cells): a spectator sees the whole field.
//
// NO FOG, NO WORK: with no field or a no-fog eased cut the body is hidden, the
// layer unmasked, the bitmap zeroed once, and nothing is evaluated.
// PER FRAME: ease the cut, advance the tile scroll, test the refresh timer and
// the re-centre distance, place the tile. No per-frame allocation.

import { BufferImageSource, Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import {
  CONFIG,
  FOG_NO_CUT,
  fogDensityAt,
  makeFogField,
  type FogField,
  type Island,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { ScreenWorldRect } from './camera.js';
import { BASE_HAZE_HALO_U, haloSpanU } from './hazeHalo.js';
import { HazeLosCaster } from './hazeLos.js';
import { HALO_MASK_TEXTURE_SIZE, bakeHaloMaskTexture } from './textures.js';
import { PUFF_TILE_SEED, bakePuffTile, puffTileRgba } from './fogPuffTile.js';

const F = CLIENT_CONFIG.fogField;
/** The halo's own knobs — shared with the countermeasure's mask on purpose. */
const H = CLIENT_CONFIG.countermeasure;
/** A spectator's raster side in cells (the cell grows by powers of two past `cellU`). */
export const SPECTATOR_CELLS = 128;
/** Largest frame gap (ms) the scroll advances across (a backgrounded tab must not jump). */
const MAX_SCROLL_DT_MS = 500;

/** Scene-graph label of the fog layer's halo mask (test seam). */
export const FOG_HALO_MASK_LABEL = 'fogHaloMask';

/** Who is looking: the own hull (halo-masked, halo-square raster) or a spectator (unmasked, screen raster). */
export type FogViewMode = 'alive' | 'spectate';

/** The density function the raster samples (sim/fog.ts `fogDensityAt`'s shape; a test may wrap it). */
export type FogDensityFn = typeof fogDensityAt;

/**
 * Pure: one frame's step of the drawn cut toward the schema's. Moves at most
 * `cutEasePerS × dt`; SNAPS when either side is the no-fog cut (fog appearing
 * from none must not take minutes to ease down from 9, and the no-fog target
 * is honoured at once). A non-finite target reads as no fog.
 */
export function easeFogCut(eased: number, target: number, dtMs: number): number {
  const t = Number.isFinite(target) ? target : FOG_NO_CUT;
  if (t >= FOG_NO_CUT || !(eased < FOG_NO_CUT)) return t;
  const max = F.cutEasePerS * (Math.max(0, dtMs) / 1000);
  return eased + Math.min(max, Math.max(-max, t - eased));
}

/**
 * Pure: fill `out` (n × n, row-major) with the density at the cell centres
 * `(ox + i·cellU, oy + j·cellU)` at match time `tMs` under `cut`. Returns
 * whether any cell is above 0.
 */
export function fillFogRaster(
  out: Float32Array, field: FogField, ox: number, oy: number, cellU: number, n: number,
  tMs: number, cut: number, density: FogDensityFn = fogDensityAt,
): boolean {
  let any = false;
  for (let j = 0; j < n; j++) {
    const y = oy + j * cellU;
    const row = j * n;
    for (let i = 0; i < n; i++) {
      const d = density(field, ox + i * cellU, y, tMs, cut);
      out[row + i] = d;
      if (d > 0) any = true;
    }
  }
  return any;
}

/** ((v mod p) + p) mod p — a non-negative remainder. */
const wrap = (v: number, p: number): number => ((v % p) + p) % p;

const finiteRect = (s: ScreenWorldRect | null): s is ScreenWorldRect =>
  s !== null && Number.isFinite(s.x + s.y + s.w + s.h) && s.w > 0 && s.h > 0;

/** The one wisps tile texture, baked lazily once per page. */
let puffTexture: Texture | null = null;
function wispsTexture(): Texture {
  if (puffTexture !== null && !puffTexture.destroyed) return puffTexture;
  const tile = bakePuffTile(PUFF_TILE_SEED, F);
  const source = new BufferImageSource({
    resource: puffTileRgba(tile, CLIENT_CONFIG.colors.fogBank),
    width: tile.size,
    height: tile.size,
    scaleMode: 'linear',
    addressMode: 'repeat',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  puffTexture = new Texture({ source });
  return puffTexture;
}

export class FogFieldView {
  private field: FogField | null = null;
  private seed: number | null = null;
  private oceanRadiusU = -1;
  private target = FOG_NO_CUT;
  private eased = FOG_NO_CUT;
  /** The body: the density mask sprite + the wisps tile (the layer's second child, after the halo). */
  private readonly body = new Container();
  private readonly clip = new Rectangle();
  private readonly tile: TilingSprite;
  private readonly densitySprite: Sprite;
  // --- the raster ---
  private n = 0;
  private cell: number = F.cellU;
  private ox = 0;
  private oy = 0;
  private density = new Float32Array(0);
  private rgba = new Uint8Array(0);
  private source: BufferImageSource | null = null;
  /** The live density texture (null before the first allocation — never Texture.EMPTY, which must not be destroyed). */
  private densityTex: Texture | null = null;
  /** True while any raster cell is above 0 (the bitmap is "lit"). */
  private lit = false;
  private sinceRefresh = Number.POSITIVE_INFINITY;
  private refreshes = 0;
  /** Scratch, mutated in place every frame (no per-frame allocation): the
   *  spectator's raster centre and the wanted raster geometry. */
  private readonly screenCentre = { x: 0, y: 0 };
  private readonly geom = { n: 0, cell: F.cellU as number };
  // --- the wisps scroll (u, world) ---
  private scrollX = 0;
  private scrollY = 0;
  // --- the halo ---
  private halo: Sprite | null = null;
  private haloU = BASE_HAZE_HALO_U;
  private bakedAtU = Number.NaN;
  private islands: readonly Island[] = [];
  private readonly los = new HazeLosCaster(H.losRays);
  private castX = Number.NaN;
  private castY = Number.NaN;
  private shadowed = false;

  /** `layer` = chartRoot's `fog` layer; `densityFn` = the sampler (a test may spy on it). */
  constructor(
    private readonly layer: Container,
    private readonly densityFn: FogDensityFn = fogDensityAt,
  ) {
    this.densitySprite = new Sprite(Texture.EMPTY);
    this.densitySprite.label = 'fogDensity';
    this.densitySprite.renderable = false; // a mask: transformed, never painted itself
    this.tile = new TilingSprite({ texture: wispsTexture(), width: 1, height: 1 });
    this.tile.label = 'fogWisps';
    this.tile.alpha = F.maxAlpha;
    this.tile.tileScale.set(1 / F.puffPxPerU);
    this.tile.setMask({ mask: this.densitySprite, channel: 'alpha' });
    this.body.addChild(this.densitySprite, this.tile);
    this.body.visible = false;
    layer.addChild(this.body);
  }

  /** The welcome's `fogSeed` over the match's ocean radius (the spin's center is the ocean center): (re)build the field only when either changes. */
  setSeed(seed: number, oceanRadiusU: number): void {
    if (!Number.isFinite(seed) || !Number.isFinite(oceanRadiusU)) return;
    const s = seed >>> 0;
    if (s === this.seed && oceanRadiusU === this.oceanRadiusU) return;
    this.seed = s;
    this.oceanRadiusU = oceanRadiusU;
    this.field = makeFogField(s, CONFIG.fog, oceanRadiusU);
    this.sinceRefresh = Number.POSITIVE_INFINITY;
  }

  /** The schema's match-wide `fogCut` (FOG_NO_CUT = no fog); eased per frame in `update`. */
  setCut(cut: number): void {
    this.target = Number.isFinite(cut) ? cut : FOG_NO_CUT;
  }

  /** The viewer's halo radius — `hazeHaloU(radarRange)` beside the countermeasure's. */
  setHaloU(haloU: number): void {
    if (!Number.isFinite(haloU) || haloU <= 0 || haloU === this.haloU) return;
    this.haloU = haloU;
    this.castX = Number.NaN;
  }

  /** The match's islands — the halo's sight blockers (main.ts, once per map). */
  setIslands(islands: readonly Island[]): void {
    this.islands = islands;
    this.castX = Number.NaN;
  }

  /** The match-start edge: the drawn cut back to no fog, the bitmap dark. */
  clear(): void {
    this.target = FOG_NO_CUT;
    this.eased = FOG_NO_CUT;
    this.hide();
  }

  /**
   * Per render frame. `dtMs` = frame time; `serverNow` = the match clock
   * (ServerClock.serverNow()); `own` = the own hull's pose (the halo's and the
   * raster's centre); `screen` = the world rect on screen; `mode` = who is
   * looking. ALIVE with no pose yet (the predictor not seeded on the first
   * alive frames) draws NOTHING — never the spectator's unmasked whole-screen
   * raster, which would flash fog the eye cannot see. SPECTATE ignores `own`
   * and covers the screen unmasked.
   */
  update(
    dtMs: number,
    serverNow: number,
    motionOn: boolean,
    own: { x: number; y: number } | null = null,
    screen: ScreenWorldRect | null = null,
    mode: FogViewMode = 'alive',
  ): void {
    this.eased = easeFogCut(this.eased, this.target, dtMs);
    const spectating = mode === 'spectate';
    const eye = spectating ? null : own;
    const centre = this.centreFor(eye, spectating ? screen : null);
    if (this.field === null || this.eased >= FOG_NO_CUT || centre === null) {
      this.hide();
      return;
    }
    this.advanceScroll(dtMs, motionOn, centre);
    this.maybeRefresh(dtMs, serverNow, centre, spectating ? screen : null);
    this.draw(eye, screen);
  }

  /** Show the lit raster through the wisps (tile, halo, screen clip), or nothing. */
  private draw(eye: { x: number; y: number } | null, screen: ScreenWorldRect | null): void {
    this.body.visible = this.lit;
    if (!this.lit) {
      this.layer.mask = null;
      return;
    }
    this.placeTile(screen);
    this.placeHalo(eye);
    this.clipToScreen(screen);
  }

  // --- test seams ---------------------------------------------------------

  /** The eased cut being drawn. */
  get drawnCut(): number {
    return this.eased;
  }

  /** How many raster refreshes have run. */
  get refreshCount(): number {
    return this.refreshes;
  }

  /** The density raster (n × n, row-major) and its geometry. */
  get raster(): { density: Float32Array; n: number; cellU: number; ox: number; oy: number } {
    return { density: this.density, n: this.n, cellU: this.cell, ox: this.ox, oy: this.oy };
  }

  /** The wisps tile's world scroll (u). */
  get scroll(): { x: number; y: number } {
    return { x: this.scrollX, y: this.scrollY };
  }

  /** Is anything drawn this frame? */
  get drawn(): boolean {
    return this.body.visible;
  }

  /** The wisps TilingSprite. */
  get wisps(): TilingSprite {
    return this.tile;
  }

  /** The density mask sprite. */
  get densityMask(): Sprite {
    return this.densitySprite;
  }

  /** The halo mask sprite, once built. */
  get haloMask(): Sprite | null {
    return this.halo;
  }

  // --- internals ----------------------------------------------------------

  /** Hide, unmask, zero the bitmap once, and force a refresh when fog returns. */
  private hide(): void {
    this.body.visible = false;
    this.layer.mask = null;
    this.sinceRefresh = Number.POSITIVE_INFINITY;
    if (!this.lit) return;
    this.lit = false;
    this.density.fill(0);
    this.rgba.fill(0);
    this.source?.update();
  }

  /** The raster's centre: the own hull, else the screen's centre (spectator,
   *  written into the reused `screenCentre` scratch), else none. */
  private centreFor(own: { x: number; y: number } | null, screen: ScreenWorldRect | null): { x: number; y: number } | null {
    if (own !== null) return Number.isFinite(own.x + own.y) ? own : null;
    if (!finiteRect(screen)) return null;
    this.screenCentre.x = screen.x + screen.w / 2;
    this.screenCentre.y = screen.y + screen.h / 2;
    return this.screenCentre;
  }

  /**
   * Scroll the wisps with the field's LOCAL velocity at the view centre
   * (motion-gated), wrapped to one tile period: the wind plus the spin's
   * tangential speed there (amendment 177 — the pattern turns about the
   * ocean centre, faster toward the middle by the shear; cycle-192 gate: a
   * wind-only scroll made the wisps swim against their own bank at the rim,
   * where the spin moves the banks several times faster than the wind).
   * One tile cannot turn with the whole field; following the centre's
   * velocity keeps the wisps riding the banks the viewer is looking at.
   */
  private advanceScroll(dtMs: number, motionOn: boolean, centre: { x: number; y: number }): void {
    if (!motionOn || this.field === null) return;
    const dt = Math.min(MAX_SCROLL_DT_MS, Math.max(0, dtMs));
    const period = F.puffTilePx / F.puffPxPerU;
    const f = this.field;
    let vx = f.windX;
    let vy = f.windY;
    if (f.cfg.spinPeriodMs > 0) {
      const px = centre.x - f.spinCx;
      const py = centre.y - f.spinCy;
      const r = Math.hypot(px, py);
      const shear = r >= f.spinRadiusU ? 0 : f.cfg.spinShear * (1 - r / f.spinRadiusU);
      const w = (f.spinSign * (2 * Math.PI) * (1 + shear)) / f.cfg.spinPeriodMs; // rad/ms at the centre point
      vx += -py * w;
      vy += px * w;
    }
    this.scrollX = wrap(this.scrollX + vx * dt, period);
    this.scrollY = wrap(this.scrollY + vy * dt, period);
  }

  /** Refresh on the cadence, on a re-centre, or on a raster geometry change. */
  private maybeRefresh(dtMs: number, serverNow: number, c: { x: number; y: number }, spectatorScreen: ScreenWorldRect | null): void {
    this.sinceRefresh += Math.max(0, dtMs);
    const { n, cell } = this.geometryFor(spectatorScreen);
    const half = ((this.n - 1) / 2) * this.cell;
    const moved = Math.hypot(c.x - (this.ox + half), c.y - (this.oy + half)) > F.recenterU;
    if (this.sinceRefresh < F.refreshMs && !moved && n === this.n && cell === this.cell) return;
    this.refresh(serverNow, c, n, cell);
  }

  /** The raster's cell count and cell size: the halo square, or the
   *  spectator's screen — written into the reused `geom` scratch. */
  private geometryFor(spectatorScreen: ScreenWorldRect | null): { n: number; cell: number } {
    const g = this.geom;
    if (!finiteRect(spectatorScreen)) {
      const side = 2 * (haloSpanU(this.haloU) + F.recenterU);
      g.n = Math.ceil(side / F.cellU) + 1;
      g.cell = F.cellU;
      return g;
    }
    const side = Math.max(spectatorScreen.w, spectatorScreen.h) + 2 * F.recenterU;
    let cell: number = F.cellU;
    while (cell * SPECTATOR_CELLS < side) cell *= 2;
    g.n = SPECTATOR_CELLS + 1;
    g.cell = cell;
    return g;
  }

  /** Re-evaluate the raster around `c` and upload it. */
  private refresh(serverNow: number, c: { x: number; y: number }, n: number, cell: number): void {
    if (n !== this.n) this.allocate(n);
    this.cell = cell;
    const lo = Math.floor(n / 2);
    this.ox = (Math.round(c.x / cell) - lo) * cell;
    this.oy = (Math.round(c.y / cell) - lo) * cell;
    this.lit = fillFogRaster(this.density, this.field as FogField, this.ox, this.oy, cell, n, serverNow, this.eased, this.densityFn);
    this.upload();
    this.densitySprite.position.set(this.ox - cell / 2, this.oy - cell / 2);
    this.densitySprite.scale.set(cell);
    this.sinceRefresh = 0;
    this.refreshes++;
  }

  /** (Re)allocate the raster buffers and texture for an n × n grid (a halo change only). */
  private allocate(n: number): void {
    this.n = n;
    this.density = new Float32Array(n * n);
    this.rgba = new Uint8Array(n * n * 4);
    const old = this.source;
    const oldTex = this.densityTex;
    this.source = new BufferImageSource({
      resource: this.rgba,
      width: n,
      height: n,
      scaleMode: 'linear',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    this.densityTex = new Texture({ source: this.source });
    this.densitySprite.texture = this.densityTex;
    oldTex?.destroy(false); // the wrapper; its source goes on the next line
    old?.destroy();
  }

  /** Density → rgba (white, alpha = density) → the GPU. */
  private upload(): void {
    const { density, rgba } = this;
    for (let i = 0; i < density.length; i++) {
      const k = i * 4;
      rgba[k] = 255;
      rgba[k + 1] = 255;
      rgba[k + 2] = 255;
      rgba[k + 3] = Math.round(density[i] * 255);
    }
    this.source?.update();
  }

  /** Size the wisps to (raster rect ∩ screen) and anchor the tile to the world + scroll. */
  private placeTile(screen: ScreenWorldRect | null): void {
    let x0 = this.ox - this.cell / 2;
    let y0 = this.oy - this.cell / 2;
    let x1 = x0 + this.n * this.cell;
    let y1 = y0 + this.n * this.cell;
    if (finiteRect(screen)) {
      x0 = Math.max(x0, screen.x);
      y0 = Math.max(y0, screen.y);
      x1 = Math.min(x1, screen.x + screen.w);
      y1 = Math.min(y1, screen.y + screen.h);
    }
    const t = this.tile;
    t.visible = x1 > x0 && y1 > y0;
    if (!t.visible) return;
    t.position.set(x0, y0);
    if (t.width !== x1 - x0) t.width = x1 - x0;
    if (t.height !== y1 - y0) t.height = y1 - y0;
    const period = F.puffTilePx / F.puffPxPerU;
    t.tilePosition.set(wrap(this.scrollX - x0, period), wrap(this.scrollY - y0, period));
  }

  /** Centre the halo on the own hull, or take the mask off (spectator / bad pose). */
  private placeHalo(own: { x: number; y: number } | null): void {
    if (own === null || !Number.isFinite(own.x + own.y)) {
      this.layer.mask = null;
      return;
    }
    const halo = this.ensureHalo();
    this.refreshLos(halo, own);
    halo.position.set(own.x, own.y);
    if (this.layer.mask !== halo) this.layer.mask = halo;
  }

  /** The mask sprite, built on first need (renderable=false; first child). */
  private ensureHalo(): Sprite {
    if (this.halo !== null) return this.halo;
    const halo = new Sprite(bakeHaloMaskTexture(this.haloU));
    halo.label = FOG_HALO_MASK_LABEL;
    halo.anchor.set(0.5);
    halo.renderable = false;
    this.bakedAtU = this.haloU;
    this.layer.addChildAt(halo, 0);
    this.halo = halo;
    this.scaleHalo(halo);
    return halo;
  }

  /** Re-bake for a halo change; re-cast the island fan on a `losRecastMoveU` move or a halo / island change. */
  private refreshLos(halo: Sprite, own: { x: number; y: number }): void {
    const resized = this.haloU !== this.bakedAtU;
    if (resized) {
      this.bakedAtU = this.haloU;
      this.scaleHalo(halo);
    }
    if (this.islands.length === 0) {
      if (resized || this.shadowed) this.bakeHalo(halo, null);
      return;
    }
    if (Math.hypot(own.x - this.castX, own.y - this.castY) < H.losRecastMoveU) return;
    this.castX = own.x;
    this.castY = own.y;
    this.los.cast(own.x, own.y, this.haloU + H.haloFeatherU, this.islands);
    this.bakeHalo(halo, this.los.rays);
  }

  private bakeHalo(halo: Sprite, rays: Float32Array | null): void {
    halo.texture = bakeHaloMaskTexture(this.haloU, halo.texture, rays);
    this.shadowed = rays !== null;
  }

  /** One texel = `2 × spanU / size` world units. */
  private scaleHalo(halo: Sprite): void {
    halo.scale.set((2 * haloSpanU(this.haloU)) / HALO_MASK_TEXTURE_SIZE);
  }

  /** Pin the body's boundsArea to the screen while halo-masked (countermeasure.ts `clipToScreen`). */
  private clipToScreen(screen: ScreenWorldRect | null): void {
    const masked = this.halo !== null && this.layer.mask === this.halo;
    if (!masked || !finiteRect(screen)) {
      this.body.boundsArea = null as unknown as Rectangle; // see countermeasure.ts
      return;
    }
    this.clip.x = screen.x;
    this.clip.y = screen.y;
    this.clip.width = screen.w;
    this.clip.height = screen.h;
    this.body.boundsArea = this.clip;
  }
}
