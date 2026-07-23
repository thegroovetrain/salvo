// The three pre-baked fog/radar textures (per plan: near-zero per-frame cost,
// no shaders/filters/render-targets — everything is a canvas baked once):
//   1. Fog + sight hole — dark overlay with a feathered radial hole at its
//      center; re-baked ONLY on resize/zoom, positioned per frame (fog.ts).
//   2. Sweep wedge — conic-gradient tail + bright leading edge, rotated per
//      frame; baked once at a fixed resolution and scaled to world size.
//   3. Blip soft-dot — white radial dot, tinted/faded per blip (radar.ts).
// Thin Pixi adapter (not unit tested).

import { Texture } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';

const C = CLIENT_CONFIG.colors;

type BakeCanvas = OffscreenCanvas | HTMLCanvasElement;
type BakeCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { canvas: BakeCanvas; ctx: BakeCtx } {
  const canvas: BakeCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as BakeCtx | null;
  if (!ctx) throw new Error('2d canvas context unavailable');
  return { canvas, ctx };
}

// --- 1. fog + sight hole -----------------------------------------------------

/** DESIGN.md fogged-ocean overlay color (fog-base token @ 0.85). */
const FOG_FILL = cssRgba(C.fogBase, 0.85);
/** Hole feather: fully clear to 0.75×sight, fading to full fog at 1.0×sight. */
const HOLE_FEATHER_START = 0.75;

/**
 * Bake the fog overlay: viewport + 2×margin on each axis, with the feathered
 * sight hole at the exact center. `marginPx` must cover the worst-case offset
 * of the own ship from screen center (camera lead + shake), so the fog never
 * exposes a screen edge. Re-bake only on resize/zoom.
 */
export function bakeFogTexture(viewW: number, viewH: number, sightPx: number, marginPx: number): Texture {
  const w = Math.ceil(viewW + 2 * marginPx);
  const h = Math.ceil(viewH + 2 * marginPx);
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = FOG_FILL;
  ctx.fillRect(0, 0, w, h);
  // Punch the feathered sight hole out of the fill.
  ctx.globalCompositeOperation = 'destination-out';
  const cx = w / 2;
  const cy = h / 2;
  const hole = ctx.createRadialGradient(cx, cy, sightPx * HOLE_FEATHER_START, cx, cy, sightPx);
  hole.addColorStop(0, cssRgba(C.black, 1));
  hole.addColorStop(1, cssRgba(C.black, 0));
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(cx, cy, sightPx, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(canvas);
}

// --- 2. sweep wedge ----------------------------------------------------------

/** Radius (px) the wedge is baked at; scaled to radarRange world units. */
export const SWEEP_TEXTURE_RADIUS = 512;
/** Angular width (rad) of the trailing fade behind the leading edge. */
const TAIL_RAD = (40 * Math.PI) / 180;
const TAU = Math.PI * 2;

function paintWedgeTail(ctx: BakeCtx, c: number, r: number): void {
  // Conic gradient runs clockwise from the tail start (−40°) up to the
  // leading edge at 0 rad (+x): transparent → phosphor wedge, then cut off.
  const grad = ctx.createConicGradient(-TAIL_RAD, c, c);
  const edge = TAIL_RAD / TAU;
  grad.addColorStop(0, cssRgba(C.phosphor, 0));
  grad.addColorStop(edge, cssRgba(C.phosphor, 0.26));
  grad.addColorStop(Math.min(1, edge + 0.002), cssRgba(C.phosphor, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.arc(c, c, r, -TAIL_RAD, 0);
  ctx.closePath();
  ctx.fill();
}

function paintLeadingEdge(ctx: BakeCtx, c: number, r: number): void {
  // Cheap glow: three layered strokes along +x, wide/dim to thin/bright.
  const layers: Array<[number, number]> = [
    [7, 0.1],
    [3.5, 0.25],
    [1.5, 0.9],
  ];
  ctx.lineCap = 'round';
  for (const [width, alpha] of layers) {
    ctx.strokeStyle = cssRgba(C.phosphor, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + r, c);
    ctx.stroke();
  }
}

/**
 * Bake the sweep wedge once: leading edge along +x (so sprite rotation ==
 * server sweep angle), ~40° tail fading behind it. Rendered additive.
 */
export function bakeSweepTexture(): Texture {
  const size = SWEEP_TEXTURE_RADIUS * 2;
  const { canvas, ctx } = makeCanvas(size, size);
  const c = SWEEP_TEXTURE_RADIUS;
  const r = SWEEP_TEXTURE_RADIUS - 2;
  paintWedgeTail(ctx, c, r);
  paintLeadingEdge(ctx, c, r);
  return Texture.from(canvas);
}

// --- storm vignette ----------------------------------------------------------

/** Baked at this square size, then stretched to the viewport (ellipse edge). */
export const VIGNETTE_TEXTURE_SIZE = 512;
/** Clear out to this fraction of the radius; storm purple ramps in beyond it. */
const VIGNETTE_CLEAR = 0.55;

/**
 * Bake the out-of-zone vignette: a radial gradient, fully transparent through
 * the center and ramping to dimensional purple at the edges. Screen-space
 * overlay (stretched to the viewport, so the circle reads as an edge-hugging
 * ellipse). Alpha is pulsed at draw time (render/zone.ts) — the texture itself
 * is static. Purple reads calmer than red, so the edge alpha runs a touch hotter
 * (1.0) to hold its alarm legibility (DESIGN.md storm color note).
 */
export function bakeVignetteTexture(): Texture {
  const size = VIGNETTE_TEXTURE_SIZE;
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, c * VIGNETTE_CLEAR, c, c, c);
  grad.addColorStop(0, cssRgba(C.storm, 0)); // storm fill/vignette (DESIGN.md)
  grad.addColorStop(1, cssRgba(C.storm, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

// --- 3. blip soft-dot --------------------------------------------------------

/** Blip texture size (px); scaled down to world units and tinted per blip. */
export const BLIP_TEXTURE_SIZE = 64;

/** Bake the soft phosphor dot: white radial falloff (tint supplies the color). */
export function bakeBlipTexture(): Texture {
  const size = BLIP_TEXTURE_SIZE;
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, cssRgba(C.white, 1)); // tint supplies the blip color
  grad.addColorStop(0.3, cssRgba(C.white, 0.85));
  grad.addColorStop(1, cssRgba(C.white, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(canvas);
}
