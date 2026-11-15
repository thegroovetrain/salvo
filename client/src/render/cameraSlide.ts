// THE STRATEGIC ZOOM SLIDE (Story 11.8, Eric 2026-11-15: *"Supreme
// Commander-esque Strategic Zoom"*) — the pure math behind the camera's drawn
// center. Pure functions over plain points, no Pixi, no config: render/camera.ts
// feeds them its anchor, its span and the frame (ring waypoint, board, ring).
//
// THE RULING, literally: with R = the ring-waypoint span and h = R / 2, the
// drawn center C = slide(A, span) is
//   span ≤ h          → C = A (the anchor: the own ship in FOLLOW, or the
//                       panned point);
//   h → R             → C glides A → the live ring center;
//   R → board span    → C glides the ring center → the board center (the
//                       whole board centered at full zoom-out).
// Linear in span. No ring yet → the ring center is the board center. The
// board center is the origin (`sim/map.ts` spans [-radius, +radius]).
//
// DEGENERATE FRAMES collapse cleanly, never NaN: a ring waypoint at or past the
// board span is held at the board span and its first glide aims straight at the
// board center (the first ring IS the board fit and sits on the board center,
// so this is also the honest picture); with neither a ring nor a board known
// (the lobby's ambient scene, a bare test camera) nothing slides at all.

/** A world point. */
export interface SlidePoint {
  x: number;
  y: number;
}

/** What the slide reads besides the anchor and the span. */
export interface SlideFrame {
  /** R — the ring-waypoint span (u across the short axis). */
  ringSpanU: number;
  /** The whole-board fit span (u), NaN before the map radius is known. */
  boardSpanU: number;
  /** The live ring center, or null before any ring feed. */
  ring: SlidePoint | null;
}

/** A span (u) that can frame anything: finite and positive. */
function usable(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

/** Whether the frame slides at all: a ring or a board is known, and R is usable. */
function slides(f: SlideFrame): boolean {
  return usable(f.ringSpanU) && (f.ring !== null || usable(f.boardSpanU));
}

/** R held at the board span (a waypoint past the board would never be reached). */
function heldRingSpan(f: SlideFrame): number {
  return usable(f.boardSpanU) ? Math.min(f.ringSpanU, f.boardSpanU) : f.ringSpanU;
}

/** The first glide's target: the ring center — the board center with no ring,
 *  or when the waypoint is held at the board span. */
function glideTarget(f: SlideFrame): SlidePoint {
  if (f.ring === null) return ORIGIN;
  if (usable(f.boardSpanU) && f.ringSpanU >= f.boardSpanU) return ORIGIN;
  return f.ring;
}

const ORIGIN: SlidePoint = { x: 0, y: 0 };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The first glide's fraction, 0..1: 0 at and inside h, 1 at and past R. */
export function anchorGlideT(spanU: number, f: SlideFrame): number {
  if (!slides(f) || !Number.isFinite(spanU)) return 0;
  const r = heldRingSpan(f);
  const h = r / 2;
  return clamp01((spanU - h) / (r - h));
}

/** The second glide's fraction, 0..1: ring center → board center, R → board span. */
export function boardGlideT(spanU: number, f: SlideFrame): number {
  if (!slides(f) || !Number.isFinite(spanU) || !usable(f.boardSpanU)) return 0;
  const r = heldRingSpan(f);
  if (!(f.boardSpanU > r)) return spanU >= f.boardSpanU ? 1 : 0;
  return clamp01((spanU - r) / (f.boardSpanU - r));
}

/**
 * The anchor's weight in the drawn center, 0..1 (1 − the first glide, 0 once
 * the second has begun). A pan of Δ on screen moves the anchor by Δ / this so
 * the view tracks the hand; at 0 the anchor has no say and a pan is a no-op.
 */
export function anchorWeight(spanU: number, f: SlideFrame): number {
  return 1 - anchorGlideT(spanU, f);
}

/** THE DRAWN CENTER: slide(A, span) — written into `out` (default a fresh point). */
export function slideCenter(anchor: SlidePoint, spanU: number, f: SlideFrame, out: SlidePoint = { x: 0, y: 0 }): SlidePoint {
  const t = anchorGlideT(spanU, f);
  const m = boardGlideT(spanU, f);
  const g = glideTarget(f);
  const x = anchor.x + (g.x - anchor.x) * t;
  const y = anchor.y + (g.y - anchor.y) * t;
  out.x = x * (1 - m);
  out.y = y * (1 - m);
  return out;
}

/**
 * THE INVERSE: the anchor A with slide(A, span) = `center`, or null where the
 * drawn center does not depend on the anchor (the first glide complete, t = 1
 * — the ring → board leg). Exact for span ≤ h (A = C) and on the first glide
 * (A = (C − t·ring) / (1 − t)).
 */
export function slideAnchor(center: SlidePoint, spanU: number, f: SlideFrame): SlidePoint | null {
  const t = anchorGlideT(spanU, f);
  if (t >= 1) return null;
  if (t === 0) return { x: center.x, y: center.y };
  const g = glideTarget(f);
  return { x: (center.x - t * g.x) / (1 - t), y: (center.y - t * g.y) / (1 - t) };
}

/** `p` pulled inside the disc of `radius` about the origin (the board fit);
 *  an unusable radius leaves it alone. Written into `p`. */
export function clampToDisc(p: SlidePoint, radius: number): SlidePoint {
  if (!usable(radius)) return p;
  const d = Math.hypot(p.x, p.y);
  if (d <= radius) return p;
  p.x *= radius / d;
  p.y *= radius / d;
  return p;
}
