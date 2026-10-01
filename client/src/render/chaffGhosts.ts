// THE CHAFF OWNER'S GHOSTS (cycle 162, Eric 2026-10-01 — reversing amendment
// 191's "never the fakes"): the owner now sees their OWN fake returns, "at 50 %
// of their normal alpha in greyscale".
//
// THE WIRE: the server puts the coverage rects of THIS hull's own chaff fakes
// that THIS hull's beam painted this tick on the self-private
// `you.chaffGhosts?: GhostPaint[]` — exactly the blip's payload minus `k`/`t`,
// gated by the owner's beam crossing and the height-raster shadow, OMITTED when
// nothing was painted. It rides `you` (the `chaff` / `shield` / `inSmoke`
// precedent), so no other observer ever receives it, and it is never an
// `events` blip: the scope's `Radar` never sees a ghost, and fake-vs-real stays
// indistinguishable for everyone but the owner.
//
// WHY A SEPARATE GRID, NOT A TINT ON THE SCOPE. The scope's blip is deliberately
// identity-free (seven keys, one merged three-color bitmap), so a per-paint
// "this one is fake" tint could not survive the heatmap merge — and the scope's
// three-color contract (amendment 77) admits no fourth appearance. So this file
// runs the SCOPE'S OWN PURE FUNCTIONS — the `validCoverage` gate, the one-hull
// field + `marchSlice` (with the SAME height raster the radar marches, handed
// over by main.ts, never re-baked), `rasterize`, `quantizeInto` — into its OWN
// `HeatGrid` / RGBA buffer / sprite, quantized at the scope's thresholds to the
// three grey tokens (`CLIENT_CONFIG.chaffGhost.bands`) at `bandAlpha × 0.5`,
// with the scope's own age decay (`blipAlpha` over `blipLifeMs`).
//
// A GHOST IS PRICED EXACTLY AS THE SCOPE PRICES THE SAME RECT FOR ANYONE ELSE:
// `Radar.marchEcho`'s recipe verbatim (hull material, one-hull field, echo arc,
// radial slab, reach widened to the footprint), so a ghost's band pattern is the
// one the fake paints on an enemy's scope, only grey and at half alpha.
//
// PLACEMENT MIRRORS `Radar.paintHeat` exactly (amendment 98 — the seam cycle 57
// broke): the buffer follows the camera's world rect, `anchorGrid` snaps it to a
// whole world cell, and the sprite sits at the grid origin scaled one texel per
// cell, so a ghost sits on the water where the fake is at every zoom.
//
// THE LAYER IS `litZone` (beside the chaff ring), NOT `blip`: the `blip` layer
// carries the radar's near-range DIM MASK (amendment 181 — 20 % across the
// whole sight bubble), and the cloud bursts at the owner's own position, i.e.
// always inside that bubble. Under the mask a ghost would draw at 20 % of half
// alpha — invisible — whereas "the alpha it would be otherwise" is the alpha the
// fake paints at on an ENEMY's scope, where the server's annulus gate puts it
// beyond their sight and therefore undimmed.
//
// MOTION: nothing animates. Alpha is a pure function of server time.

import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import {
  CONFIG,
  HULL_IDS,
  hullSilhouette,
  mapRadius,
  polygonMaxRadius,
  sampleHeight,
  type GhostPaint,
  type HeightRaster,
  type HullCoverage,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { blipAlpha, blipLifeMs } from './phosphor.js';
import {
  anchorGrid,
  bandIndex,
  cellOf,
  clearGrid,
  gridSpan,
  makeGrid,
  quantizeInto,
  rasterize,
  sampleGrid,
  type HeatGrid,
} from './radarHeatmap.js';
import { coverageCentre, hullSample, shipOnlyField, stampCoverage, type ShipStamp } from './radarField.js';
import { echoArc, marchSlice, type MarchSlice } from './radarMarch.js';
import type { ViewRect } from './radar.js';

const G = CLIENT_CONFIG.chaffGhost;

/** The opacity every ghost band is drawn at: the scope's `bandAlpha` × 0.5. */
export const GHOST_BAND_ALPHA = CLIENT_CONFIG.blip.heatmap.bandAlpha * G.alphaScale;

/** Backstop on parked rects and live slices — `CONFIG.chaff.count` fakes per
 *  cloud, one paint per sweep each, three sweeps deep is 30; this is slack. */
const MAX_GHOSTS = 128;

/** The widest legitimate coverage rect, in cells — `radar.ts`'s
 *  `MAX_COVERAGE_SPAN` derivation verbatim (a fake is a hull-sized paint, and
 *  every fake passes that validator on an enemy's scope). */
const MAX_SPAN = ((): number => {
  let diameter = 0;
  for (const id of HULL_IDS) diameter = Math.max(diameter, 2 * polygonMaxRadius(hullSilhouette(id)));
  return 2 * (Math.ceil(diameter / CONFIG.vision.radarCellU) + 1 + 4);
})();

/** The largest legitimate absolute cell index — `radar.ts`'s `MAX_CELL_INDEX`. */
const MAX_CELL = Math.ceil((2 * mapRadius(CONFIG.map.playerCap)) / CONFIG.vision.radarCellU);

/**
 * Pure: the structural gate on one wire ghost rect — `radar.ts`'s
 * `validCoverage` minus the paint-time clause (a ghost carries no `t`; the
 * frame's is checked once by the caller). Integer cell indices inside the
 * map's possible lattice, a sane rect, and a bits array sized exactly to it.
 * Anything else is dropped whole.
 */
export function validGhost(e: GhostPaint): boolean {
  if (e === null || typeof e !== 'object') return false;
  if (![e.gx, e.gy, e.w, e.h].every(Number.isInteger)) return false;
  if (Math.abs(e.gx) > MAX_CELL || Math.abs(e.gy) > MAX_CELL) return false;
  return validGhostRect(e);
}

/** The rect half of `validGhost` (radar.ts's `validRect`): sane spans, bits
 *  sized exactly to them. */
function validGhostRect(e: GhostPaint): boolean {
  if (e.w < 1 || e.h < 1 || e.w > MAX_SPAN || e.h > MAX_SPAN) return false;
  return Array.isArray(e.bits) && e.bits.length === Math.ceil((e.w * e.h) / 32);
}

interface OwnPoint {
  x: number;
  y: number;
}

interface PendingGhost {
  cov: HullCoverage;
  t: number;
}

interface GhostSurface {
  grid: HeatGrid;
  rgba: Uint8Array;
  source: BufferImageSource;
  sprite: Sprite;
}

export class ChaffGhosts {
  private readonly layer: Container;
  private heightRaster: HeightRaster | null = null;
  private radarRange: number = CONFIG.vision.radar;
  private sweepPeriodMs: number = 60000 / CONFIG.vision.sweepRpm;
  /** Rects waiting for a real own pose (the scope's park, same reason: the
   *  intensity model is frozen at resolve against the observer). */
  private readonly pending: PendingGhost[] = [];
  /** Marched ghosts — re-rasterized in full every frame, retired on TIME. */
  private readonly paints: MarchSlice[] = [];
  private heat: GhostSurface | null = null;

  /** `layer` = a fog-immune, UNMASKED chart layer (see the file header). */
  constructor(layer: Container) {
    this.layer = layer;
  }

  /** The client's height raster — the SAME object the `Radar` marches (main.ts
   *  hands both the one `map.heightRaster`), never a second bake. */
  setHeightRaster(raster: HeightRaster | null): void {
    this.heightRaster = raster;
  }

  /** The observer's effective vision stats — the same call `Radar.setRanges`
   *  takes, so ray spacing and phosphor life match the scope's. */
  setRanges(_sightRange: number, radarRange: number, sweepPeriodMs: number): void {
    this.radarRange = radarRange;
    this.sweepPeriodMs = sweepPeriodMs;
  }

  /**
   * This frame's ghost rects (`you.chaffGhosts`) at the frame's server time
   * `t`. Absent / empty adds nothing. Each rect is validated and parked; a
   * malformed one is dropped whole.
   */
  onGhosts(list: readonly GhostPaint[] | null | undefined, t: number): void {
    if (!Array.isArray(list) || !Number.isFinite(t)) return;
    for (const e of list) {
      if (!validGhost(e)) continue;
      this.pending.push({ cov: { gx: e.gx, gy: e.gy, w: e.w, h: e.h, bits: e.bits }, t });
    }
    while (this.pending.length > MAX_GHOSTS) this.pending.shift();
  }

  /** Drop every ghost at once (teardown / entering spectate). */
  clear(): void {
    this.pending.length = 0;
    this.paints.length = 0;
    this.hide();
  }

  /**
   * Per frame: resolve parked rects against the own pose, retire aged ones,
   * re-rasterize and upload. `own` null (start line / spectator) hides the
   * surface. `view` is the camera's world rect — the scope's own window.
   */
  render(own: OwnPoint | null, serverNow: number, view: ViewRect | null = null): void {
    this.resolve(own);
    this.prune(serverNow);
    this.paint(own, serverNow, view);
  }

  private resolve(own: OwnPoint | null): void {
    if (own === null || this.pending.length === 0) return;
    if (!this.aground(own)) {
      for (const e of this.pending) {
        const s = this.march(own, e);
        if (s !== null) this.paints.push(s);
      }
      while (this.paints.length > MAX_GHOSTS) this.paints.shift();
    }
    this.pending.length = 0;
  }

  /** `Radar.marchEcho`'s recipe verbatim — see the file header. */
  private march(own: OwnPoint, e: PendingGhost): MarchSlice | null {
    const cfg = CLIENT_CONFIG.blip.heatmap;
    const stamp: ShipStamp = new Map();
    stampCoverage(stamp, e.cov, hullSample(cfg.model));
    const c = coverageCentre(e.cov, cfg.cellU);
    const arc = echoArc(own, c.x, c.y, Math.hypot(e.cov.w, e.cov.h) * cfg.cellU);
    const pad = arc.reach + 2 * cfg.cellU;
    const reach = Math.max(this.radarRange, arc.dist + pad);
    return marchSlice(
      own,
      arc.centre - arc.half,
      arc.centre + arc.half,
      shipOnlyField(stamp, cfg.cellU, this.heightRaster),
      reach,
      e.t,
      cfg,
      { fromU: arc.dist - pad, toU: arc.dist + pad },
    );
  }

  private get lifeMs(): number {
    return blipLifeMs(this.sweepPeriodMs);
  }

  private prune(serverNow: number): void {
    const life = this.lifeMs;
    for (let i = this.paints.length - 1; i >= 0; i--) {
      if (blipAlpha(serverNow - this.paints[i].t, life) <= 0) this.paints.splice(i, 1);
    }
  }

  /** The scope's `aground` rule: an observer on land makes no paints. */
  private aground(own: OwnPoint): boolean {
    const r = this.heightRaster;
    return r !== null && sampleHeight(r, own.x, own.y) > 0;
  }

  private hide(): void {
    if (this.heat === null) return;
    this.heat.sprite.visible = false;
    clearGrid(this.heat.grid);
    this.heat.rgba.fill(0);
  }

  /** `Radar.fitHeat` — idempotent on the cell span, NEAREST scaling. */
  private fit(halfWU: number, halfHU: number): GhostSurface {
    const cellU = CLIENT_CONFIG.blip.heatmap.cellU;
    const cols = gridSpan(halfWU, cellU);
    const rows = gridSpan(halfHU, cellU);
    if (this.heat !== null && this.heat.grid.cols === cols && this.heat.grid.rows === rows) return this.heat;
    const grid = makeGrid(halfWU, halfHU, cellU);
    this.heat?.sprite.destroy();
    this.heat?.source.destroy();
    const rgba = new Uint8Array(grid.cols * grid.rows * 4);
    const source = new BufferImageSource({
      resource: rgba,
      width: grid.cols,
      height: grid.rows,
      scaleMode: 'nearest',
      alphaMode: 'premultiply-alpha-on-upload',
    });
    const sprite = new Sprite(new Texture({ source }));
    sprite.blendMode = 'add'; // the scope's own blend
    sprite.scale.set(grid.cellU);
    sprite.visible = false;
    this.layer.addChild(sprite);
    this.heat = { grid, rgba, source, sprite };
    return this.heat;
  }

  /** `Radar.paintHeat`'s placement path, onto the grey bands at half alpha. */
  private paint(own: OwnPoint | null, serverNow: number, view: ViewRect | null): void {
    if (own === null || this.paints.length === 0) return this.hide();
    const win = view ?? { x: own.x, y: own.y, halfW: this.radarRange, halfH: this.radarRange };
    const heat = this.fit(win.halfW, win.halfH);
    anchorGrid(heat.grid, win.x, win.y);
    const assist = settings.current.colorblind;
    rasterize(heat.grid, this.paints, {
      now: serverNow,
      lifeMs: this.lifeMs,
      alphaFloor: assist ? CLIENT_CONFIG.blip.assistMinAlpha : CLIENT_CONFIG.blip.minAlpha,
    });
    quantizeInto(heat.grid, G.bands, GHOST_BAND_ALPHA, heat.rgba);
    heat.sprite.position.set(heat.grid.originX, heat.grid.originY);
    heat.sprite.visible = true;
    heat.source.update();
  }

  // --- test / observation seams -------------------------------------------

  /** How many marched ghosts are live. */
  get livePaints(): number {
    return this.paints.length;
  }

  /** Is the ghost sprite showing? */
  get visible(): boolean {
    return this.heat !== null && this.heat.sprite.visible;
  }

  /** The grey band index at a world point, or -1 for transparent. */
  bandAt(x: number, y: number): number {
    return this.heat === null ? -1 : bandIndex(sampleGrid(this.heat.grid, x, y).w, G.bands);
  }

  /** The quantized RGBA bytes (straight alpha) of the cell at a world point,
   *  or null off the buffer. */
  pixelAt(x: number, y: number): { rgb: number; a: number } | null {
    const h = this.heat;
    if (h === null) return null;
    const cx = cellOf(x, h.grid.cellU) - h.grid.baseGx;
    const cy = cellOf(y, h.grid.cellU) - h.grid.baseGy;
    if (cx < 0 || cy < 0 || cx >= h.grid.cols || cy >= h.grid.rows) return null;
    const o = (cy * h.grid.cols + cx) * 4;
    return { rgb: (h.rgba[o] << 16) | (h.rgba[o + 1] << 8) | h.rgba[o + 2], a: h.rgba[o + 3] };
  }

  /** The whole quantized buffer (read-only view for tests). */
  get rgba(): Uint8Array | null {
    return this.heat === null ? null : this.heat.rgba;
  }

  /** The sprite's world placement — the amendment-98 seam. */
  get spritePosition(): { x: number; y: number } | null {
    return this.heat === null ? null : { x: this.heat.sprite.position.x, y: this.heat.sprite.position.y };
  }
}
