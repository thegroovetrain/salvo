// THE MASKED PASS'S BOUNDS (Story 11.2 follow-up, ruling G1).
//
// Pixi 8 draws a sprite-masked container through a filter pass whose render
// target is sized to the container's measured bounds ∩ the mask sprite's bounds,
// and its `MaskFilter` opts OUT of viewport clipping (`clipToViewport: false`).
// So whatever the container measures is what the GPU allocates — rounded up to a
// power of two, with the canvas's MSAA. Story 11.2's radar reach put the radar
// dim mask at ~22,700 u across: the first frame a mask was attached with an
// unclipped child (the lobby's ambient scene, which had no screen rect) asked
// for a 16,384² / 32,768² target, past the GPU limit on a Retina screen.
//
// THE FIX IS TO NEVER LET PIXI MEASURE ANYTHING. A container with a
// `boundsArea` reports exactly that rect and skips its children AND its mask
// (`_getGlobalBoundsRecursive` takes the `boundsArea` branch before either), so
// the masked layer's own `boundsArea` set to (screen ∩ mask frame) — before or
// in the same frame the mask is attached — fixes the pass size on every frame,
// the first included, whatever the layer holds. Nothing outside the screen is
// visible and nothing outside the mask frame is drawn (a sprite mask clips to
// its frame), so no on-screen pixel changes.
//
// Pure: plain numbers in, a rect out, no Pixi.

import type { ScreenWorldRect } from './camera.js';

/** A world-unit rectangle (Pixi's `Rectangle` satisfies it). */
export interface PassRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Is `r` a usable screen rect: every field finite, a positive area. */
export function usableScreen(r: ScreenWorldRect | null | undefined): r is ScreenWorldRect {
  return r !== null && r !== undefined && Number.isFinite(r.x + r.y + r.w + r.h) && r.w > 0 && r.h > 0;
}

/**
 * The world rect a sprite-masked layer's filter pass must be limited to: the
 * screen's world rect ∩ the mask's square frame (centre `cx, cy`, half side
 * `halfU`), written into `out` and returned.
 *
 * NULL when it cannot be bounded — no usable screen rect, or a non-finite mask
 * frame. A caller must then NOT attach the mask: an unbounded masked pass is
 * exactly the defect this exists to prevent, and an undimmed layer is the
 * degradation the radar already chose for a non-finite pose.
 *
 * An empty intersection (the mask frame wholly off screen) is a zero-area rect,
 * not null: Pixi skips a pass with no positive area, and with the frame off
 * screen the masked layer has nothing on screen to draw.
 */
export function maskPassRect(
  screen: ScreenWorldRect | null | undefined,
  cx: number,
  cy: number,
  halfU: number,
  out: PassRect,
): PassRect | null {
  if (!usableScreen(screen) || !Number.isFinite(cx + cy + halfU) || !(halfU >= 0)) return null;
  const x0 = Math.max(screen.x, cx - halfU);
  const y0 = Math.max(screen.y, cy - halfU);
  const x1 = Math.min(screen.x + screen.w, cx + halfU);
  const y1 = Math.min(screen.y + screen.h, cy + halfU);
  out.x = x0;
  out.y = y0;
  out.width = Math.max(0, x1 - x0);
  out.height = Math.max(0, y1 - y0);
  return out;
}

/**
 * The world rect a camera without shake shows, as a screen rect — the fallback
 * for a caller that has the camera's `worldView` (centre + half extents) but no
 * `screenWorldRect`. Null for a missing or non-finite view.
 */
export function viewAsScreen(
  view: { x: number; y: number; halfW: number; halfH: number } | null | undefined,
): ScreenWorldRect | null {
  if (view === null || view === undefined) return null;
  const r = { x: view.x - view.halfW, y: view.y - view.halfH, w: 2 * view.halfW, h: 2 * view.halfH };
  return usableScreen(r) ? r : null;
}
