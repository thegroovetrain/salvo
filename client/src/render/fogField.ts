// THE FOG FIELD view — since Story 11.6 THE RAIN (Eric 2026-11-14: "the eye of
// a closing hurricane"; the look is still his Story 9.10 pick B "Wisps"). The
// rain is a continuous density field over the whole ocean (shared sim/fog.ts,
// the storm-eye field), derived HERE from the same PUBLIC inputs the server
// uses: the welcome's `fogSeed` (`setSeed`), the match clock (`serverNow`),
// `CONFIG.fog`, the schema's `zoneStartT` and the client's own LIVE zone ring
// (`setZone` — sim/zoneView.ts, the shared zoneLiveState). There is no cut any
// more: one `fogFrameAt` per frame is the whole weather. Nothing per-ship about
// rain rides the wire; this view never decides visibility (the server already
// withheld every contact the eye cannot see through the rain) — it only paints,
// and lends its frame to the radar's dim fan and the hulls' A+D look
// (render/rainSight.ts).
//
// THE LAYER: chartRoot's `fog` layer, directly above `litZone` and below
// `smoke`, every marker, every hull and nameplate (render/stage.ts — amendment
// 171(b): a hull delivered from inside fog stays visible above the haze).
//
// THE COMPOSITION (density mask × scrolling wisps tile):
// - THE DENSITY RASTER: ONE world-anchored Float32 grid of `cellU` cells over
//   the viewer's halo square (side 2 × (halo span + recenterU)), filled with
//   `fogDensityAt(frame, x, y)` (the frame at serverNow) every `refreshMs` of frame
//   time — or at once when the raster's centre is more than `recenterU` from
//   the own hull (the origin then snaps to the cell grid around the hull, so a
//   re-centre never makes the image swim). It is uploaded into ONE
//   BufferImageSource (rgb white, alpha = density, LINEAR filtering) on ONE
//   sprite placed at the raster origin in world units, scale = cellU. Between
//   refreshes nothing moves: the rain's own motion is inside the field (its
//   spin about the eye, and the eye riding the live ring), so the next refresh
//   carries it.
// - ONE SOURCE FOR THE VIEW'S LIFE (Story 11.2 follow-up 3, ruling R1). The
//   density sprite is a LIVE alpha mask, and Pixi binds a sprite mask's own
//   TextureSource into the pooled MaskFilter's bind group: destroying or
//   replacing that source under it nulls the bind group and the next mask push
//   throws inside Pixi's render (textures.ts `bakeDimMaskTexture` — "the
//   frozen-client crash"). Story 11.2 sized the alive raster from the screen,
//   so zooming or speeding up crossed a size step in play and re-allocated it.
//   So the source is allocated ONCE at `DENSITY_TEXTURE_CELLS` (the largest n
//   either view can ask for) and an n × n raster is written into its top-left
//   corner (`packDensityRgba`), with the column / row just past it a copy of
//   the raster's last one so LINEAR filtering inside the last cell clamps
//   exactly as the texture edge used to. The sprite keeps the whole texture at
//   scale = cellU, so cell (i, j) maps to the same world square as before;
//   the wisps tile never reaches past the n × n corner, so the rest is unseen.
// - THE WISPS: a TilingSprite of the pre-baked puff tile (render/fogPuffTile.ts,
//   2 u per texel), alpha `maxAlpha`, world-anchored through `tilePosition`
//   and scrolled with the field's local velocity at the view centre (the
//   spin's tangential speed about the eye there, u/ms — `rainFlowAt`) —
//   motion off → it holds still.
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
// NO RAIN, NO WORK: with no field or a frame that cannot rain (a non-finite
// input; since Eric 2026-11-15 the pre-zone ocean RAINS — the ring-0 state)
// the body is hidden, the layer unmasked, the bitmap zeroed
// once, and nothing is evaluated.
// PER FRAME: one `fogFrameAt` into the reused frame (its tables are reused —
// ~0.05 ms), advance the tile scroll, test the refresh timer and the re-centre
// distance, place the tile. No per-frame allocation.

import { BufferImageSource, Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import {
  CONFIG,
  fogDensityAt,
  fogFrameAt,
  fogMaxDepth,
  makeFogField,
  type FogField,
  type FogFrame,
  type Island,
  type SmokeDisc,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { ScreenWorldRect } from './camera.js';
import { BASE_HAZE_HALO_U, haloSpanU } from './hazeHalo.js';
import { HazeLosCaster } from './hazeLos.js';
import { HALO_MASK_TEXTURE_SIZE, bakeHaloMaskTexture } from './textures.js';
import { PUFF_TILE_SEED, bakePuffTile, puffTileRgba } from './fogPuffTile.js';
import { eyeReachFanInto } from './rainSight.js';

const F = CLIENT_CONFIG.fogField;
/** The halo's own knobs — shared with the countermeasure's mask on purpose. */
const H = CLIENT_CONFIG.countermeasure;
/** A spectator's raster side in cells (the cell grows by powers of two past `cellU`). */
export const SPECTATOR_CELLS = 128;
/** Largest frame gap (ms) the scroll advances across (a backgrounded tab must not jump). */
const MAX_SCROLL_DT_MS = 500;
const NO_SMOKE: readonly SmokeDisc[] = [];

/** Scene-graph label of the fog layer's halo mask (test seam). */
export const FOG_HALO_MASK_LABEL = 'fogHaloMask';

/** The most cells an ALIVE raster carries on a side (Story 11.2). */
export const ALIVE_MAX_CELLS = 256;
/**
 * The density texture's side in texels: the largest raster n either view can
 * ask for (`aliveRasterGeometry` keeps side / cell ≤ ALIVE_MAX_CELLS, so
 * n ≤ ALIVE_MAX_CELLS + 1; a spectator's n is SPECTATOR_CELLS + 1).
 */
export const DENSITY_TEXTURE_CELLS = Math.max(ALIVE_MAX_CELLS, SPECTATOR_CELLS) + 1;
/** u — the alive raster's screen-fit side is rounded UP to a multiple of this,
 *  so a hull moving under a still camera does not re-allocate it every frame. */
const ALIVE_SIDE_QUANTUM_U = 512;

/**
 * u — the farthest screen corner from the raster centre `c` (the own hull).
 */
export function screenReachU(screen: ScreenWorldRect, c: { x: number; y: number }): number {
  const dx = Math.max(Math.abs(screen.x - c.x), Math.abs(screen.x + screen.w - c.x));
  const dy = Math.max(Math.abs(screen.y - c.y), Math.abs(screen.y + screen.h - c.y));
  return Math.hypot(dx, dy);
}

/**
 * Pure: the ALIVE raster's cell count and cell size (Story 11.2). The raster is
 * the halo square — but the halo rides the muzzle-flash reach, 350 hm since
 * Story 11.2, ~16,000 u across, which at the 18 u cell is ~900² samples of
 * fractal noise per refresh. So the side is ALSO capped at what the screen can
 * show from the hull (`reachU`, its farthest screen corner, + the re-centre
 * margin, rounded up to `ALIVE_SIDE_QUANTUM_U`), and the cell doubles past
 * `F.cellU` until the side fits `ALIVE_MAX_CELLS` — the spectator path's rule.
 * At the default framing the cell stays 18 u. A non-finite reach (no screen
 * rect yet) leaves the halo square alone.
 */
export function aliveRasterGeometry(haloSideU: number, reachU: number, out: { n: number; cell: number }): void {
  let side = haloSideU;
  if (Number.isFinite(reachU) && reachU > 0) {
    const fit = Math.ceil((2 * (reachU + F.recenterU)) / ALIVE_SIDE_QUANTUM_U) * ALIVE_SIDE_QUANTUM_U;
    side = Math.min(side, fit);
  }
  let cell: number = F.cellU;
  while (side / cell > ALIVE_MAX_CELLS) cell *= 2;
  out.n = Math.ceil(side / cell) + 1;
  out.cell = cell;
}

/** Who is looking: the own hull (halo-masked, halo-square raster) or a spectator (unmasked, screen raster). */
export type FogViewMode = 'alive' | 'spectate';

/** The density function the raster samples (sim/fog.ts `fogDensityAt`'s shape; a test may wrap it). */
export type FogDensityFn = typeof fogDensityAt;

/**
 * Pure: the rain's local velocity (u/ms) at world (x, y) for `frame` — the
 * spin's tangential speed about the eye (sim/fog.ts's turn rate: `edgeSpeedU`
 * at the ring edge, `centerTurnFrac` of the edge's turn rate at the center,
 * the linear speed held outside the ring; R floored at `spinRadiusFloorU`),
 * in the field's per-match direction. Written into `out`; zero with no rain.
 * Presentation only — the wisps tile's scroll.
 */
export function rainFlowAt(frame: FogFrame, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = 0;
  out.y = 0;
  if (!frame.on) return out;
  const cfg = frame.field.cfg;
  const px = x - frame.cx;
  const py = y - frame.cy;
  const r = Math.hypot(px, py);
  const Rs = Math.max(frame.R, cfg.spinRadiusFloorU);
  const v = cfg.edgeSpeedU / 1000;
  const turn = r < Rs ? (v / Rs) * (cfg.centerTurnFrac + (1 - cfg.centerTurnFrac) * (r / Rs)) : v / r;
  const w = frame.field.spinSign * turn; // rad/ms
  if (!Number.isFinite(w)) return out;
  out.x = -py * w;
  out.y = px * w;
  return out;
}

/**
 * Pure: fill `out` (n × n, row-major) with the rain density of `frame` at the
 * cell centres `(ox + i·cellU, oy + j·cellU)`. Returns whether any cell is
 * above 0.
 */
export function fillFogRaster(
  out: Float32Array, frame: FogFrame, ox: number, oy: number, cellU: number, n: number,
  density: FogDensityFn = fogDensityAt,
): boolean {
  let any = false;
  for (let j = 0; j < n; j++) {
    const y = oy + j * cellU;
    const row = j * n;
    for (let i = 0; i < n; i++) {
      const d = density(frame, ox + i * cellU, y);
      out[row + i] = d;
      if (d > 0) any = true;
    }
  }
  return any;
}

/**
 * Pure: write the n × n `density` raster (row-major) into the top-left corner
 * of the `side` × `side` rgba buffer `out` (white, alpha = density × 255),
 * then — when there is room — copy the raster's last column into column n and
 * its last row (and corner) into row n. The copy is what keeps LINEAR filtering
 * inside the raster's last cell equal to the old clamp-to-edge look: the
 * sampler blends cell n−1 with cell n, which now holds the same value.
 */
export function packDensityRgba(density: Float32Array, n: number, out: Uint8Array, side: number): void {
  for (let j = 0; j < n; j++) {
    const src = j * n;
    const dst = j * side;
    for (let i = 0; i < n; i++) writeTexel(out, (dst + i) * 4, density[src + i]);
    if (n < side) writeTexel(out, (dst + n) * 4, density[src + n - 1]);
  }
  if (n >= side || n === 0) return;
  const last = (n - 1) * side * 4;
  out.copyWithin(n * side * 4, last, last + (n + 1) * 4);
}

function writeTexel(out: Uint8Array, k: number, d: number): void {
  out[k] = 255;
  out[k + 1] = 255;
  out[k + 2] = 255;
  out[k + 3] = Math.round(d * 255);
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
  /** The live zone the eye rides (`setZone`); null start = not started (the ring-0 rain, Eric 2026-11-15). */
  private zoneStartT: number | null = null;
  private zoneCx = 0;
  private zoneCy = 0;
  /** THE frame: one `fogFrameAt` per new instant (`frameAt`), its tables
   *  reused for the view's life. */
  private frame: FogFrame | null = null;
  private frameT = Number.NaN;
  /** The held smoke as sight discs at a server time (`setSmokeSource`); null = none. */
  private smokeSource: ((tMs: number) => readonly SmokeDisc[]) | null = null;
  private readonly flow = { x: 0, y: 0 };
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
  /** Backing store at DENSITY_TEXTURE_CELLS²; `density` is its first n × n. */
  private readonly densityStore = new Float32Array(DENSITY_TEXTURE_CELLS * DENSITY_TEXTURE_CELLS);
  private density = new Float32Array(0);
  /** The texture's pixels, DENSITY_TEXTURE_CELLS² rgba — never re-allocated. */
  private readonly rgba = new Uint8Array(DENSITY_TEXTURE_CELLS * DENSITY_TEXTURE_CELLS * 4);
  /** THE density source: built once in the constructor, never replaced or destroyed (R1). */
  private readonly source: BufferImageSource;
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
    this.source = new BufferImageSource({
      resource: this.rgba,
      width: DENSITY_TEXTURE_CELLS,
      height: DENSITY_TEXTURE_CELLS,
      scaleMode: 'linear',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    this.densitySprite = new Sprite(new Texture({ source: this.source }));
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

  /** The welcome's `fogSeed` over the match's ocean radius (the rain lives inside that disc and its ring ladder is that radius's): (re)build the field only when either changes. */
  setSeed(seed: number, oceanRadiusU: number): void {
    if (!Number.isFinite(seed) || !Number.isFinite(oceanRadiusU)) return;
    const s = seed >>> 0;
    if (s === this.seed && oceanRadiusU === this.oceanRadiusU) return;
    this.seed = s;
    this.oceanRadiusU = oceanRadiusU;
    this.field = makeFogField(s, CONFIG.fog, oceanRadiusU);
    this.frame = null;
    this.frameT = Number.NaN;
    this.sinceRefresh = Number.POSITIVE_INFINITY;
  }

  /**
   * The live zone the eye rides: the schema's `zoneStartT` (null while the zone
   * is idle — the ring-0 rain, already there from the start line) and the LIVE ring's center from the client's own zone
   * view (sim/zoneView.ts `zoneViewFrom`, the shared zoneLiveState at the same
   * serverNow). Called once per frame before anything reads the rain; a change
   * re-derives the frame on the next read.
   */
  setZone(startT: number | null, cx: number, cy: number): void {
    if (startT === this.zoneStartT && cx === this.zoneCx && cy === this.zoneCy) return;
    this.zoneStartT = startT;
    this.zoneCx = cx;
    this.zoneCy = cy;
    this.frameT = Number.NaN;
  }

  /**
   * The rain at match time `tMs` (ONE shared frame, re-derived only for a new
   * instant or zone), or null when nothing can rain — no field yet or a
   * non-finite input (pre-zone it rains: the ring-0 state, Eric 2026-11-15).
   * The raster, the radar's fan and the hulls' A+D look (render/rainSight.ts)
   * all read this one frame.
   */
  frameAt(tMs: number): FogFrame | null {
    if (this.field === null) return null;
    if (this.frame === null || tMs !== this.frameT) {
      this.frame = fogFrameAt(this.field, tMs, this.zoneStartT, this.zoneCx, this.zoneCy, CONFIG.zone, this.frame ?? undefined);
      this.frameT = tMs;
    }
    return this.frame.on ? this.frame : null;
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

  /** The match-start edge: the zone back to not started (the ring-0 rain), the bitmap dark until the next refresh. */
  clear(): void {
    this.setZone(null, 0, 0);
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
    const frame = this.frameAt(serverNow);
    const spectating = mode === 'spectate';
    const eye = spectating ? null : own;
    const centre = this.centreFor(eye, spectating ? screen : null);
    if (frame === null || centre === null) {
      this.hide();
      return;
    }
    this.advanceScroll(frame, dtMs, motionOn, centre);
    this.maybeRefresh(frame, dtMs, centre, spectating ? screen : null, screen);
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

  /** Where the eye-reach fan reads the held SMOKE clouds as sight discs at a
   *  server time (main.ts: the same `smokeDiscsInto` set `rainEyeFor` uses).
   *  None set → no smoke. */
  setSmokeSource(source: ((tMs: number) => readonly SmokeDisc[]) | null): void {
    this.smokeSource = source;
  }

  /**
   * THE EYE-REACH FAN for the radar's near-range dim mask (amendment 210): how
   * far the eye at (ox, oy) with `sightU` of effective truesight reaches through
   * the rain AND the held smoke (Story 11.6: τ = rain + smoke) on each of
   * `out.length` bearings (ray k at k·2π/N, world axes) — where the optical
   * depth from the observer first reaches the sight threshold T
   * (`fogMaxDepth(CONFIG.fog)`), capped at `sightU` (rainSight.ts
   * `eyeReachFanInto`; a ray no cloud lies on is the shared rain reach) —
   * written into `out` and returned. Null when nothing shortens the eye — no
   * rain and no smoke at `tMs`, or a non-finite pose — so the radar falls back
   * to its radial bake. Cast on the radar's re-cast cadence (`refreshMs`),
   * never per frame. Presentation only; the field stays private.
   */
  eyeReachFan(ox: number, oy: number, sightU: number, tMs: number, out: Float32Array): Float32Array | null {
    if (!Number.isFinite(ox + oy + sightU + tMs)) return null;
    const frame = this.frameAt(tMs);
    const smoke = this.smokeSource === null ? NO_SMOKE : this.smokeSource(tMs);
    if (frame === null && smoke.length === 0) return null;
    return eyeReachFanInto(frame, smoke, ox, oy, sightU, fogMaxDepth(CONFIG.fog), out);
  }

  // --- test seams ---------------------------------------------------------

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
    this.source.update();
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
   * Scroll the wisps with the rain's LOCAL velocity at the view centre
   * (motion-gated, `rainFlowAt`), wrapped to one tile period: the spin's
   * tangential speed about the eye there. One tile cannot turn with the whole
   * field; following the centre's velocity keeps the wisps riding the bands
   * the viewer is looking at (the cycle-192 lesson: a tile that ignores the
   * spin swims against its own bands).
   */
  private advanceScroll(frame: FogFrame, dtMs: number, motionOn: boolean, centre: { x: number; y: number }): void {
    if (!motionOn) return;
    const dt = Math.min(MAX_SCROLL_DT_MS, Math.max(0, dtMs));
    const period = F.puffTilePx / F.puffPxPerU;
    const v = rainFlowAt(frame, centre.x, centre.y, this.flow);
    this.scrollX = wrap(this.scrollX + v.x * dt, period);
    this.scrollY = wrap(this.scrollY + v.y * dt, period);
  }

  /** Refresh on the cadence, on a re-centre, or on a raster geometry change. */
  private maybeRefresh(
    frame: FogFrame,
    dtMs: number,
    c: { x: number; y: number },
    spectatorScreen: ScreenWorldRect | null,
    screen: ScreenWorldRect | null,
  ): void {
    this.sinceRefresh += Math.max(0, dtMs);
    const { n, cell } = this.geometryFor(spectatorScreen, screen, c);
    const half = ((this.n - 1) / 2) * this.cell;
    const moved = Math.hypot(c.x - (this.ox + half), c.y - (this.oy + half)) > F.recenterU;
    if (this.sinceRefresh < F.refreshMs && !moved && n === this.n && cell === this.cell) return;
    this.refresh(frame, c, n, cell);
  }

  /** The raster's cell count and cell size: the halo square, or the
   *  spectator's screen — written into the reused `geom` scratch. */
  private geometryFor(
    spectatorScreen: ScreenWorldRect | null,
    screen: ScreenWorldRect | null,
    c: { x: number; y: number },
  ): { n: number; cell: number } {
    const g = this.geom;
    if (!finiteRect(spectatorScreen)) {
      const halo = 2 * (haloSpanU(this.haloU) + F.recenterU);
      const reach = finiteRect(screen) ? screenReachU(screen, c) : NaN;
      aliveRasterGeometry(halo, reach, g);
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
  private refresh(frame: FogFrame, c: { x: number; y: number }, n: number, cell: number): void {
    if (n !== this.n) this.resize(n);
    n = this.n;
    this.cell = cell;
    const lo = Math.floor(n / 2);
    this.ox = (Math.round(c.x / cell) - lo) * cell;
    this.oy = (Math.round(c.y / cell) - lo) * cell;
    this.lit = fillFogRaster(this.density, frame, this.ox, this.oy, cell, n, this.densityFn);
    this.upload();
    this.densitySprite.position.set(this.ox - cell / 2, this.oy - cell / 2);
    this.densitySprite.scale.set(cell);
    this.sinceRefresh = 0;
    this.refreshes++;
  }

  /**
   * Point the raster at an n × n grid inside the one backing store. The
   * texture source is NOT touched — it is a live mask's (R1); only the CPU-side
   * view changes, and the next upload writes the new corner.
   */
  private resize(n: number): void {
    this.n = Math.min(n, DENSITY_TEXTURE_CELLS);
    this.density = this.densityStore.subarray(0, this.n * this.n);
  }

  /** Density → rgba (white, alpha = density) in the texture's corner → the GPU. */
  private upload(): void {
    packDensityRgba(this.density, this.n, this.rgba, DENSITY_TEXTURE_CELLS);
    this.source.update();
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
