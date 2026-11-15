// The Radar view (PLAN.md §8): the scope around the observer with the rotating
// sweep, real hull paints and the rain clutter (client/src/render/rainClutter.ts).
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
// • the sweep rate from CONFIG.vision.sweepRpm (15 rpm at INTEL 100).
// NOT reused: the beam march (render/radarMarch.ts — it needs the full
// radarField of islands / wakes / sea clutter); hull paints here are the
// hull's rotated length × beam rectangle on the lattice at a solid red
// intensity, stamped when the beam crosses the hull's center. The in-bubble
// near-range dim mask is not drawn. Smoke does not touch radar (§8).
//
// The sweep runs on REAL time (1×) so the scope reads like the game at any
// match-clock speed; the rain under it is the match clock's.

import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG, type FogFrame } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../../client/src/config.js';
import { anchorGrid, makeGrid, quantizeInto, rasterize, type HeatGrid } from '../../../client/src/render/radarHeatmap.js';
import type { MarchSlice } from '../../../client/src/render/radarMarch.js';
import { blipLifeMs } from '../../../client/src/render/phosphor.js';
import { SWEEP_TEXTURE_RADIUS, bakeSweepTexture } from '../../../client/src/render/textures.js';
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

export class RadarScope {
  readonly root = new Container();
  private readonly bg = new Graphics();
  private readonly world = new Container();
  private readonly scope = new Graphics();
  private readonly overlay = new Graphics();
  private readonly sweepSprite: Sprite;
  private grid: HeatGrid;
  private rgba: Uint8Array;
  private source: BufferImageSource;
  private readonly heat: Sprite;
  slices: MarchSlice[] = [];
  /** rad — the unwrapped beam bearing (sweep index = floor(angle / 2π)). */
  angle = 0;
  /** ms — the radar's real-time clock (paint ages). */
  t = 0;
  readonly rangeU: number = CONFIG.vision.radar;
  rpm: number = CONFIG.vision.sweepRpm;
  persistSweeps: number = CLIENT_CONFIG.blip.persistSweeps;
  spanU = 7000; // u on the short axis of the view
  readonly opts: RainClutterOpts = {
    ...RAIN_CLUTTER_DEFAULTS,
    weak: { ...RAIN_CLUTTER_DEFAULTS.weak },
    medium: { ...RAIN_CLUTTER_DEFAULTS.medium },
    heavy: { ...RAIN_CLUTTER_DEFAULTS.heavy },
    cellU: CONFIG.vision.radarCellU,
  };
  clutterOn = true;
  lastClutterCells = 0;
  private w = 1;
  private h = 1;

  constructor() {
    this.grid = makeGrid(16, 16, HM.cellU);
    this.rgba = new Uint8Array(this.grid.cols * this.grid.rows * 4);
    this.source = this.makeSource();
    this.heat = new Sprite(new Texture({ source: this.source }));
    this.sweepSprite = new Sprite(bakeSweepTexture());
    this.sweepSprite.anchor.set(0.5);
    this.world.addChild(this.scope, this.heat, this.sweepSprite, this.overlay);
    this.root.addChild(this.bg, this.world);
  }

  get periodMs(): number {
    return 60000 / this.rpm;
  }

  get sweepIndex(): number {
    return Math.floor(this.angle / TURN);
  }

  private makeSource(): BufferImageSource {
    return new BufferImageSource({
      resource: this.rgba, width: this.grid.cols, height: this.grid.rows, scaleMode: 'nearest', alphaMode: 'premultiply-alpha-on-upload',
    });
  }

  /** Resize the buffer to cover the viewport at the current zoom (ruling R8: the buffer is a scratch surface). */
  private fitGrid(ppu: number): void {
    const g = makeGrid(this.w / 2 / ppu, this.h / 2 / ppu, HM.cellU);
    if (g.cols === this.grid.cols && g.rows === this.grid.rows) return;
    this.grid = g;
    this.rgba = new Uint8Array(g.cols * g.rows * 4);
    const old = this.source;
    this.source = this.makeSource();
    this.heat.texture = new Texture({ source: this.source });
    old.destroy();
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.bg.clear().rect(0, 0, w, h).fill(C.void);
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
    const life = blipLifeMs(this.periodMs, this.persistSweeps);
    this.slices = this.slices.filter((s) => this.t - s.t < life);
  }

  /** Redraw: anchor the buffer on the view, rasterize every live slice, quantize, upload. */
  draw(ox: number, oy: number, eye: { cx: number; cy: number; r: number }): void {
    const ppu = Math.min(this.w, this.h) / this.spanU;
    this.fitGrid(ppu);
    this.world.scale.set(ppu);
    this.world.pivot.set(ox, oy);
    this.world.position.set(this.w / 2, this.h / 2);
    const life = blipLifeMs(this.periodMs, this.persistSweeps);
    anchorGrid(this.grid, ox, oy);
    rasterize(this.grid, this.slices, { now: this.t, lifeMs: life, alphaFloor: CLIENT_CONFIG.blip.minAlpha, tieTol: HM.sameCrossingMs / life });
    quantizeInto(this.grid, HM.bands, HM.bandAlpha, this.rgba);
    this.source.update();
    this.heat.position.set(this.grid.originX, this.grid.originY);
    this.heat.scale.set(this.grid.cellU);
    this.sweepSprite.position.set(ox, oy);
    this.sweepSprite.scale.set(this.rangeU / SWEEP_TEXTURE_RADIUS);
    this.sweepSprite.rotation = this.angle;
    const px = 1 / ppu;
    this.scope.clear()
      .circle(ox, oy, this.rangeU).fill(0x060c0a)
      .circle(ox, oy, this.rangeU).stroke({ width: 1.5 * px, color: C.hairline });
    for (let r = 1000; r < this.rangeU; r += 1000) this.scope.circle(ox, oy, r).stroke({ width: px, color: C.hairline, alpha: 0.6 });
    this.overlay.clear();
    if (eye.r > 0) this.overlay.circle(eye.cx, eye.cy, eye.r).stroke({ width: 1.5 * px, color: C.stormReadout, alpha: 0.8 });
    this.overlay.moveTo(ox, oy).lineTo(ox + Math.cos(this.angle) * this.rangeU, oy + Math.sin(this.angle) * this.rangeU)
      .stroke({ width: 1.5 * px, color: C.phosphor, alpha: 0.9 });
    this.overlay.circle(ox, oy, 4 * px).fill(C.relationOwn);
  }

  /** Forget every paint (reseed / re-seat). */
  reset(): void {
    this.slices = [];
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
