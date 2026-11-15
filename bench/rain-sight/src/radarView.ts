// The bench radar (PLAN.md §8): ONE radar model (the rotating beam, the hull
// paints, the rain clutter — client/src/render/rainClutter.ts) drawn by any
// number of RadarDraw views: the Radar view's scope, and the Game view's
// overlay (blip layer + sweep layer, the way client/src/render/stage.ts seats
// them). Paints are stored on the absolute radar lattice, so every view, at
// any zoom or pan, shows the same world-locked returns.
//
// REAL CODE REUSED (all pure, no live game state):
// • the heat buffer and its whole paint pipeline from render/radarHeatmap.ts —
//   `makeGrid` / `anchorGrid` (world-anchored 9 u lattice, sized to the
//   viewport), `rasterize` (re-stamps every live slice each frame at its
//   phosphor age through `blipAlpha`, max-wins within one beam crossing via
//   `sameCrossingMs`), `quantizeInto` (the three hard color bands at the one
//   `bandAlpha`) — so clutter and hull paints are banded, merged and decayed
//   exactly as the game does it;
// • the paint life `blipLifeMs` (persistSweeps × the sweep period) and the
//   sweep wedge texture `bakeSweepTexture` (render/textures.ts);
// • the sweep rate from CONFIG.vision.sweepRpm (15 rpm at INTEL 100);
// • the Game view's NEAR-RANGE DIM MASK: `bakeDimMaskTexture` (render/
//   textures.ts) with the eye-reach fan from the shared `fogDepthReachFan`,
//   hung on the blip layer as a sprite mask exactly like render/radar.ts —
//   returns inside the eye's sight are DISPLAYED at 20 %, and the ramp slides
//   inward on a rainy bearing (amendments 181 / 210).
// NOT reused: the beam march (render/radarMarch.ts — it needs the full
// radarField of islands / wakes / sea clutter); hull paints here are the
// hull's rotated length × beam rectangle on the lattice at a solid red
// intensity, stamped when the beam crosses the hull's center. Smoke does not
// touch radar (§8).
//
// The sweep runs on REAL time (1×) so the scope reads like the game at any
// match-clock speed; the rain under it is the match clock's.

import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG, type FogFrame } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../../client/src/config.js';
import { anchorGrid, makeGrid, quantizeInto, rasterize, type HeatGrid } from '../../../client/src/render/radarHeatmap.js';
import type { MarchSlice } from '../../../client/src/render/radarMarch.js';
import { blipLifeMs } from '../../../client/src/render/phosphor.js';
import { DIM_MASK_TEXTURE_SIZE, SWEEP_TEXTURE_RADIUS, bakeDimMaskTexture, bakeSweepTexture } from '../../../client/src/render/textures.js';
import { RAIN_CLUTTER_DEFAULTS, rainClutter, type RainClutterOpts } from '../../../client/src/render/rainClutter.js';

const HM = CLIENT_CONFIG.blip.heatmap;
const C = CLIENT_CONFIG.colors;
const TURN = Math.PI * 2;
const HULL_PAINT = 0.9; // solid red band

export interface RadarTarget {
  x: number;
  y: number;
  heading: number;
  len: number;
  beam: number;
}

/** What a draw call frames: the camera center (world u), pixels per u and the viewport size (px). */
export interface ViewRect {
  cx: number;
  cy: number;
  ppu: number;
  w: number;
  h: number;
}

/** The radar's state: beam bearing, real-time clock, the live paint slices. */
export class RadarModel {
  slices: MarchSlice[] = [];
  /** rad — the unwrapped beam bearing (sweep index = floor(angle / 2π)). */
  angle = 0;
  /** ms — the radar's real-time clock (paint ages). */
  t = 0;
  readonly rangeU: number = CONFIG.vision.radar;
  rpm: number = CONFIG.vision.sweepRpm;
  persistSweeps: number = CLIENT_CONFIG.blip.persistSweeps;
  readonly opts: RainClutterOpts = {
    ...RAIN_CLUTTER_DEFAULTS,
    weak: { ...RAIN_CLUTTER_DEFAULTS.weak },
    medium: { ...RAIN_CLUTTER_DEFAULTS.medium },
    heavy: { ...RAIN_CLUTTER_DEFAULTS.heavy },
    cellU: CONFIG.vision.radarCellU,
  };
  clutterOn = true;
  lastClutterCells = 0;

  get periodMs(): number {
    return 60000 / this.rpm;
  }

  get sweepIndex(): number {
    return Math.floor(this.angle / TURN);
  }

  get lifeMs(): number {
    return blipLifeMs(this.periodMs, this.persistSweeps);
  }

  /** Paint the hulls the beam crossed in [a0, a1). */
  private paintHulls(targets: readonly RadarTarget[], ox: number, oy: number, a0: number, a1: number): void {
    for (const s of targets) {
      const dx = s.x - ox;
      const dy = s.y - oy;
      if (dx * dx + dy * dy > this.rangeU * this.rangeU) continue;
      let b = Math.atan2(dy, dx);
      b += Math.ceil((a0 - b) / TURN) * TURN; // the first equivalent bearing ≥ a0
      if (b >= a1) continue;
      this.slices.push(hullSlice(s, this.t, this.opts.cellU));
    }
  }

  private paintClutter(frame: FogFrame, ox: number, oy: number, a0: number, a1: number): void {
    if (!this.clutterOn) return;
    const s = rainClutter({ frame, ox, oy, rangeU: this.rangeU, sweepIndex: Math.floor(a0 / TURN), from: a0, to: a1, t: this.t }, this.opts);
    this.lastClutterCells += s.n;
    if (s.n > 0) this.slices.push(s);
  }

  /** Advance the beam by `dtMs` of real time and paint what it swept. */
  advance(dtMs: number, frame: FogFrame, ox: number, oy: number, targets: readonly RadarTarget[]): void {
    if (!(dtMs > 0)) return;
    this.t += dtMs;
    const from = this.angle;
    const to = from + (TURN * dtMs) / this.periodMs;
    this.angle = to;
    this.lastClutterCells = 0;
    // split at revolution boundaries so each part rolls its own sweep's seed
    let a0 = from;
    while (a0 < to) {
      const a1 = Math.min(to, (Math.floor(a0 / TURN) + 1) * TURN);
      this.paintClutter(frame, ox, oy, a0, a1);
      this.paintHulls(targets, ox, oy, a0, a1);
      a0 = a1;
    }
    const life = this.lifeMs;
    this.slices = this.slices.filter((s) => this.t - s.t < life);
  }

  /** Forget every paint (reseed / re-seat). */
  reset(): void {
    this.slices = [];
  }
}

/**
 * One drawing of the radar model inside a camera-transformed world container:
 * `blip` (the heat buffer — paints + clutter, optionally dim-masked) and
 * `sweep` (the wedge, the beam line, the range ring). The caller seats the two
 * layers in its own stack and applies the camera to their parent.
 */
export class RadarDraw {
  readonly blip = new Container();
  readonly sweep = new Container();
  private readonly heat: Sprite;
  private readonly sweepSprite: Sprite;
  private readonly lines = new Graphics();
  private grid: HeatGrid;
  private rgba: Uint8Array;
  private source: BufferImageSource;
  private dim: Sprite | null = null;

  constructor() {
    this.grid = makeGrid(16, 16, HM.cellU);
    this.rgba = new Uint8Array(this.grid.cols * this.grid.rows * 4);
    this.source = this.makeSource();
    this.heat = new Sprite(new Texture({ source: this.source }));
    this.sweepSprite = new Sprite(bakeSweepTexture());
    this.sweepSprite.anchor.set(0.5);
    this.blip.addChild(this.heat);
    this.sweep.addChild(this.sweepSprite, this.lines);
  }

  private makeSource(): BufferImageSource {
    return new BufferImageSource({
      resource: this.rgba, width: this.grid.cols, height: this.grid.rows, scaleMode: 'nearest', alphaMode: 'premultiply-alpha-on-upload',
    });
  }

  /** Turn on the game's near-range dim mask (render/radar.ts): a baked radial sprite masking the blip layer. */
  enableDim(sightU: number): void {
    const s = new Sprite(bakeDimMaskTexture(sightU));
    s.anchor.set(0.5);
    s.scale.set((2 * HM.dim.spanU) / DIM_MASK_TEXTURE_SIZE);
    this.blip.addChild(s);
    this.blip.mask = s;
    this.dim = s;
  }

  /** Re-bake the dim mask with an eye-reach fan (null = the plain radial mask), in place. */
  rebakeDim(sightU: number, fan: Float32Array | null): void {
    if (this.dim) this.dim.texture = bakeDimMaskTexture(sightU, this.dim.texture, fan);
  }

  /**
   * Fit the buffer to what the view shows of the scope: on each axis the
   * view's half-extent, or the whole scope (centered on the observer) once
   * the view is wider than it. The lattice is absolute, so the paints stay
   * world-locked through any zoom / pan.
   */
  private fitGrid(m: RadarModel, ox: number, oy: number, v: ViewRect): { cx: number; cy: number } {
    const lim = m.rangeU + 4 * HM.cellU;
    const hx = v.w / 2 / v.ppu;
    const hy = v.h / 2 / v.ppu;
    const ax = hx >= lim ? { c: ox, h: lim } : { c: v.cx, h: hx };
    const ay = hy >= lim ? { c: oy, h: lim } : { c: v.cy, h: hy };
    const g = makeGrid(ax.h, ay.h, HM.cellU);
    if (g.cols !== this.grid.cols || g.rows !== this.grid.rows) {
      this.grid = g;
      this.rgba = new Uint8Array(g.cols * g.rows * 4);
      const old = this.source;
      this.source = this.makeSource();
      this.heat.texture = new Texture({ source: this.source });
      old.destroy();
    }
    return { cx: ax.c, cy: ay.c };
  }

  /** Redraw: anchor the buffer on the view, rasterize every live slice, quantize, upload; place the sweep. */
  draw(m: RadarModel, ox: number, oy: number, v: ViewRect, opts: { rangeRing: boolean }): void {
    const life = m.lifeMs;
    const at = this.fitGrid(m, ox, oy, v);
    anchorGrid(this.grid, at.cx, at.cy);
    rasterize(this.grid, m.slices, { now: m.t, lifeMs: life, alphaFloor: CLIENT_CONFIG.blip.minAlpha, tieTol: HM.sameCrossingMs / life });
    quantizeInto(this.grid, HM.bands, HM.bandAlpha, this.rgba);
    this.source.update();
    this.heat.position.set(this.grid.originX, this.grid.originY);
    this.heat.scale.set(this.grid.cellU);
    if (this.dim) this.dim.position.set(ox, oy);
    this.sweepSprite.position.set(ox, oy);
    this.sweepSprite.scale.set(m.rangeU / SWEEP_TEXTURE_RADIUS);
    this.sweepSprite.rotation = m.angle;
    const px = 1 / v.ppu;
    this.lines.clear();
    if (opts.rangeRing) this.lines.circle(ox, oy, m.rangeU).stroke({ width: 1.5 * px, color: C.hairline });
    this.lines.moveTo(ox, oy).lineTo(ox + Math.cos(m.angle) * m.rangeU, oy + Math.sin(m.angle) * m.rangeU)
      .stroke({ width: 1.5 * px, color: C.phosphor, alpha: 0.9 });
  }
}

/** The Radar view: the scope (dark disc, range rings) under a RadarDraw, the live ring and the observer dot on top. */
export class RadarScope {
  readonly root = new Container();
  /** The camera-transformed world (main.ts applies the camera). */
  readonly world = new Container();
  readonly draw = new RadarDraw();
  private readonly bg = new Graphics();
  private readonly scope = new Graphics();
  private readonly overlay = new Graphics();
  w = 1;
  h = 1;

  constructor() {
    this.world.addChild(this.scope, this.draw.blip, this.draw.sweep, this.overlay);
    this.root.addChild(this.bg, this.world);
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.bg.clear().rect(0, 0, w, h).fill(C.void);
  }

  render(m: RadarModel, ox: number, oy: number, eye: { cx: number; cy: number; r: number }, v: ViewRect): void {
    this.draw.draw(m, ox, oy, v, { rangeRing: false });
    const px = 1 / v.ppu;
    this.scope.clear()
      .circle(ox, oy, m.rangeU).fill(0x060c0a)
      .circle(ox, oy, m.rangeU).stroke({ width: 1.5 * px, color: C.hairline });
    for (let r = 1000; r < m.rangeU; r += 1000) this.scope.circle(ox, oy, r).stroke({ width: px, color: C.hairline, alpha: 0.6 });
    this.overlay.clear();
    if (eye.r > 0) this.overlay.circle(eye.cx, eye.cy, eye.r).stroke({ width: 1.5 * px, color: C.stormReadout, alpha: 0.8 });
    this.overlay.circle(ox, oy, 4 * px).fill(C.relationOwn);
  }
}

/** A hull's paint: the lattice cells whose centers fall in its rotated length × beam rectangle. */
function hullSlice(s: RadarTarget, t: number, cellU: number): MarchSlice {
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  const hl = s.len / 2;
  const hb = s.beam / 2;
  const ext = hl + hb;
  const gx0 = Math.floor((s.x - ext) / cellU);
  const gx1 = Math.floor((s.x + ext) / cellU);
  const gy0 = Math.floor((s.y - ext) / cellU);
  const gy1 = Math.floor((s.y + ext) / cellU);
  const cells: number[] = [];
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const dx = (gx + 0.5) * cellU - s.x;
      const dy = (gy + 0.5) * cellU - s.y;
      const u = dx * c + dy * sn;
      const v = -dx * sn + dy * c;
      if (Math.abs(u) <= hl && Math.abs(v) <= Math.max(hb, cellU / 2)) cells.push(gx, gy);
    }
  }
  const n = cells.length / 2;
  return {
    kind: 'slice', cells: Int32Array.from(cells), w: new Float32Array(n).fill(HULL_PAINT), n, t,
    minX: gx0 * cellU, minY: gy0 * cellU, maxX: (gx1 + 1) * cellU, maxY: (gy1 + 1) * cellU,
  };
}
