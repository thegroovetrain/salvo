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
import { dimRadii, dimScaleAt } from './radarDim.js';

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

/**
 * Opacity of the fogged-ocean overlay (DESIGN.md fog-base token @ 0.85) — i.e.
 * how much of the world under it the fog swallows at full strength.
 *
 * EXPORTED BECAUSE THE HULL LAYER NOW HAS TO MIRROR IT (this cycle). Hulls moved
 * ABOVE the fog composite so radar paint can no longer sit on top of them, which
 * also lifted them out of the feathered sight hole that used to soften a contact
 * as it approached the bubble's edge. `render/fog.ts`'s `hullSightSoftness`
 * reproduces that softening as a per-hull alpha, and it reads THESE constants —
 * one feather, two consumers, so the drawn fog and the hull ramp cannot drift.
 */
export const FOG_FILL_ALPHA = 0.85;
/** Hole feather: fully clear to 0.75×sight, fading to full fog at 1.0×sight.
 *  Exported for the same reason as `FOG_FILL_ALPHA` above. */
export const HOLE_FEATHER_START = 0.75;
const FOG_FILL = cssRgba(C.fogBase, FOG_FILL_ALPHA);

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

// --- near-range radar dimming mask -------------------------------------------

/**
 * Baked at this square size; scaled so the texture's half-width covers
 * `CLIENT_CONFIG.blip.heatmap.dim.spanU` world units.
 *
 * THE RAMP IS EXACTLY LINEAR IN RADIUS, which is what makes a coarse bake
 * honest rather than merely cheap: bilinear filtering reproduces a linear ramp
 * exactly, so the only places resolution shows are the two kinks (at `innerU`
 * and `outerU`), and there it costs a few screen pixels of rounding on a
 * gradient nobody can locate by eye anyway. At the shipped span one texel is
 * ~5.2u, i.e. ~4 screen px at max zoom.
 */
export const DIM_MASK_TEXTURE_SIZE = 1024;

/**
 * Bake the near-range dim mask (Story 4.11, amendment 181): a radial ramp from
 * `minScale` at the centre out to the observer's effective sight radius, rising
 * LINEARLY to full at the 5/8 rung, flat at full everywhere beyond.
 *
 * IT TAKES THE OBSERVER'S EFFECTIVE TRUESIGHT, not a constant, because the ramp
 * is anchored to the sight bubble and the bubble moves (a dazzle burst shrinks
 * it; no boon widens radar range any more). Both stops come from
 * render/radarDim.ts — the same pure curve the tests pin — so the drawn ramp and
 * the stated rule cannot drift. Re-baked only when that radius actually changes,
 * exactly as the fog hole is (render/radar.ts `syncDimMask`).
 *
 * IT IS DRAWN IN THE RED CHANNEL AT FULL ALPHA, and that is a Pixi contract
 * rather than a style choice. A sprite mask samples the RED channel by default
 * (`MaskFilter`'s `uChannel`), and its alpha term is folded in as
 * `masky.a × masky.r` — so an alpha-only gradient on a premultiplied upload
 * would square the ramp. An opaque greyscale ramp makes the mask exactly the
 * grey level, whatever the upload's alpha mode does.
 *
 * Follows `bakeFogTexture`'s `createRadialGradient` precedent. UNLIKE every other
 * bake here it does NOT happen once: cycle 92 anchored the ramp to the observer's
 * effective truesight, so it re-bakes whenever that radius moves (a boon, a dazzle
 * flip). Pass the live texture back as `into` to redraw it IN PLACE — see
 * `bakeDimMaskTexture` below for why swapping-and-destroying is forbidden.
 */
function drawDimMask(ctx: BakeCtx, sightU: number): void {
  // THE CANVAS IS REUSED NOW, so the context arrives carrying whatever state the
  // previous draw left rather than the virgin state a fresh canvas used to give us.
  // Resetting the channels a draw can depend on makes reuse structurally equivalent
  // to a mint: without it, the first future edit that adds a clip, a composite mode
  // or a transform would corrupt only the SECOND bake onward — i.e. only after a
  // boon or a dazzle, which is exactly the path hardest to reproduce.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const { spanU } = CLIENT_CONFIG.blip.heatmap.dim;
  const { innerU, outerU } = dimRadii(sightU);
  const size = DIM_MASK_TEXTURE_SIZE;
  const c = size / 2;
  const px = c / spanU; // world units -> texture px
  // Full opacity everywhere first: the flat region past `outerU` reaches the
  // corners, which is the whole point of the sprite being span-sized.
  ctx.fillStyle = cssRgba(C.white, 1);
  ctx.fillRect(0, 0, size, size);
  const r0 = Math.max(0, innerU * px);
  const r1 = Math.max(r0 + 1, outerU * px);
  const grad = ctx.createRadialGradient(c, c, r0, c, c, r1);
  // Both stops are READ OFF the curve rather than re-stated here: the inner one
  // is the floor the whole bubble holds, the outer one is full strength.
  const floor = Math.round(255 * Math.max(0, Math.min(1, dimScaleAt(innerU, sightU))));
  grad.addColorStop(0, cssRgba((floor << 16) | (floor << 8) | floor, 1));
  grad.addColorStop(1, cssRgba(C.white, 1));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, r1, 0, Math.PI * 2);
  ctx.fill();
}

/** Is this a canvas we can draw into? Structural, because the bake mints either
 *  an `OffscreenCanvas` or an `HTMLCanvasElement` depending on the host. */
function isBakeCanvas(v: unknown): v is BakeCanvas {
  return typeof (v as BakeCanvas | null | undefined)?.getContext === 'function';
}

/**
 * The 2d context of `into`'s backing canvas, or null when there is nothing of
 * ours to redraw into — a destroyed texture or source, or one whose resource is
 * not a canvas at all (`Texture.EMPTY`, which every headless/jsdom caller holds
 * and which must never be drawn into, resized or updated).
 */
function redrawableCtx(into: Texture): BakeCtx | null {
  if (into === Texture.EMPTY || into.destroyed) return null;
  const source = into.source;
  if (!source || source.destroyed) return null;
  const canvas: unknown = source.resource;
  if (!isBakeCanvas(canvas)) return null;
  // SIZE IS PART OF OWNERSHIP, not a sanity check. Every other bake in this file is
  // canvas-backed too and would sail through `isBakeCanvas`, so without this a
  // texture that is not ours could be overwritten with 1024-space coordinates. It
  // also PINS the invariant the re-upload depends on — a same-size canvas is what
  // makes `source.update()` emit an update rather than take Pixi's resize path.
  if (canvas.width !== DIM_MASK_TEXTURE_SIZE || canvas.height !== DIM_MASK_TEXTURE_SIZE) return null;
  return canvas.getContext('2d') as BakeCtx | null;
}

/**
 * Bake the near-range dim mask, or REDRAW an existing one in place.
 *
 * THE `into` PARAMETER IS A CRASH FIX, NOT AN OPTIMIZATION. `render/radar.ts`
 * hangs this texture on a Sprite and uses that Sprite as `blipLayer`'s mask, and
 * Pixi binds a SPRITE mask's own `TextureSource` straight into the `MaskFilter` of
 * the `AlphaMaskEffect` it keeps in `BigPool` (a `Graphics` mask would get a pooled
 * scratch texture instead). The rule is about the texture's JOB, not its layer:
 * never destroy a `TextureSource` hanging on a Sprite that is currently someone's
 * mask. `Fog.rebake`'s identical destroy is safe because the texture it destroys is
 * the fog overlay's own CONTENT — it sits on the sprite being MASKED, so it is never
 * bound as `uMaskTexture` whatever its mask happens to be. Destroying a bound
 * source emits `change` with
 * `destroyed`, and Pixi's `BindGroup` answers that by destroying ITSELF and nulling
 * its resources permanently; the next alpha-mask push anywhere in the app then
 * throws inside `renderer.render()` and kills the ticker, freezing the client on
 * its last frame while the socket and sim carry on.
 *
 * So the caller hands the live texture back and gets the SAME object returned: one
 * canvas and one source for the Radar's life, redrawn and re-uploaded in place. The
 * re-upload is a plain `source.update()` because the canvas never changes size
 * (`DIM_MASK_TEXTURE_SIZE` is a constant, so Pixi's resize path is a no-op and the
 * update event reaches the texture system). No clear is needed first: the draw
 * opens with an opaque full-canvas `fillRect`.
 *
 * With no `into` — first bake, or a caller holding `Texture.EMPTY` — it mints, as
 * it always did.
 */
export function bakeDimMaskTexture(sightU: number, into?: Texture | null): Texture {
  if (into != null) {
    const reuseCtx = redrawableCtx(into);
    if (reuseCtx !== null) {
      drawDimMask(reuseCtx, sightU);
      into.source.update();
      return into;
    }
  }
  const { canvas, ctx } = makeCanvas(DIM_MASK_TEXTURE_SIZE, DIM_MASK_TEXTURE_SIZE);
  drawDimMask(ctx, sightU);
  // `skipCache` DELIBERATELY. `Texture.from` otherwise does `Cache.set(canvas, tex)`
  // and only releases it from the texture's own `destroy` event — which is the one
  // thing this function may never do. Nothing ever looks this texture up by its
  // canvas, so skipping the cache costs nothing and means that if the reuse guard
  // ever rejects a held texture and we mint a replacement, the abandoned one is
  // plain garbage rather than pinned for the life of the page. Destroying it
  // instead — the obvious-looking alternative — is precisely the crash above.
  return Texture.from(canvas, true);
}

// --- 3. blip soft-dot --------------------------------------------------------

/** Blip texture size (px); scaled down to world units and tinted per blip. */
export const BLIP_TEXTURE_SIZE = 64;

/**
 * Bake the soft phosphor dot: white radial falloff (tint supplies the color).
 *
 * ONLY the pre-join ambient scope (render/ambient.ts) paints this now. Story 4.2
 * replaced the in-game blip with a true-scale hull silhouette (render/radar.ts),
 * and with it the Story 2.3 `outline` variant — a hard-edged assist ring that
 * existed to give a soft blob a SHAPE edge. Every in-game blip is a hard outline
 * already, so the ring has nothing left to add; the assist now boosts the
 * hairline in the channels it actually has (alpha + luminance floor).
 */
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
