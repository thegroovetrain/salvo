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
// THE ENDGAME FLOOR (Story 11.8 review, orchestrator ruling on Eric's
// overriding rule "the own ship is dead center unless he zooms out past the
// slide start"): h = max(R / 2, F), F = the span the waypoint is floored at
// (`SlideFrame.floorSpanU`). Once R ≤ h (the ring has closed inside F) there
// is no anchor → ring leg: C glides A → the board center over [h, board span].
// Continuous in span in both regimes; `slideAnchor` is the exact inverse in
// each. A change of regime is a ring-feed event, which the camera eases.
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
  /** F — the span the ring waypoint is floored at (alive: the intel waypoint;
   *  spectate: the default framing). The slide never starts inside it, so the
   *  followed ship is dead center at every span up to F however small the
   *  ring has closed (Story 11.8 review, the endgame-centering ruling:
   *  h = max(R / 2, F)). Omitted = 0 (h = R / 2). */
  floorSpanU?: number;
}

/** A span (u) that can frame anything: finite and positive. */
function usable(v: number): boolean {
  return Number.isFinite(v) && v > 0;
}

/** Below this the anchor's weight counts as zero (float residue at a waypoint
 *  must never flip a mode or throw the anchor — Story 11.8 review). */
export const WEIGHT_EPS = 1e-6;

const ORIGIN: SlidePoint = { x: 0, y: 0 };

/**
 * THE LEGS of one frame, resolved once: the anchor's glide runs from `h` to
 * `end` toward `target`; the board glide (ring center → board center) runs from
 * `end` to `board` when `twoLeg`. With R ≤ h there is no anchor → ring leg:
 * the anchor glides straight to the board center over [h, board span].
 */
interface Legs {
  h: number;
  end: number;
  target: SlidePoint;
  twoLeg: boolean;
  board: number;
}

/** R held at the board span (a waypoint past the board would never be reached). */
function heldRingSpan(f: SlideFrame): number {
  return usable(f.boardSpanU) ? Math.min(f.ringSpanU, f.boardSpanU) : f.ringSpanU;
}

/** The ring glide's target: the ring center — the board center with no ring,
 *  or when the waypoint is held at the board span. */
function ringTarget(f: SlideFrame): SlidePoint {
  if (f.ring === null) return ORIGIN;
  if (usable(f.boardSpanU) && f.ringSpanU >= f.boardSpanU) return ORIGIN;
  return f.ring;
}

/** The legs of `f`, or null when nothing slides (no usable R, or neither a
 *  ring nor a board known). */
function legsOf(f: SlideFrame): Legs | null {
  if (!usable(f.ringSpanU) || (f.ring === null && !usable(f.boardSpanU))) return null;
  const r = heldRingSpan(f);
  const floor = usable(f.floorSpanU ?? NaN) ? (f.floorSpanU as number) : 0;
  const h = Math.max(r / 2, floor);
  const board = f.boardSpanU;
  if (r > h) return { h, end: r, target: ringTarget(f), twoLeg: true, board };
  // R ≤ h: anchor → board center directly, or no slide with no board known.
  if (!usable(board)) return null;
  return { h, end: board, target: ORIGIN, twoLeg: false, board };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 0 below `from`, 1 at and past `to`, linear between; a zero-width (or
 *  inverted) leg is a step at `to`. */
function legT(spanU: number, from: number, to: number): number {
  if (!(to > from)) return spanU >= to ? 1 : 0;
  return clamp01((spanU - from) / (to - from));
}

/** The anchor glide's fraction, 0..1: 0 at and inside h, 1 at and past its end
 *  (R, or the board span when R ≤ h). */
export function anchorGlideT(spanU: number, f: SlideFrame): number {
  const l = legsOf(f);
  if (l === null || !Number.isFinite(spanU)) return 0;
  return legT(spanU, l.h, l.end);
}

/** The board glide's fraction, 0..1: ring center → board center, R → board
 *  span. Always 0 when R ≤ h (the anchor glide itself ends on the board). */
export function boardGlideT(spanU: number, f: SlideFrame): number {
  const l = legsOf(f);
  if (l === null || !l.twoLeg || !Number.isFinite(spanU) || !usable(l.board)) return 0;
  return legT(spanU, l.end, l.board);
}

/**
 * The anchor's weight in the drawn center, 0..1 (1 − the anchor glide, 0 once
 * it is complete). A pan of Δ on screen moves the anchor by Δ / this so the
 * view tracks the hand; at (or within WEIGHT_EPS of) 0 the anchor has no say
 * and a pan is a no-op.
 */
export function anchorWeight(spanU: number, f: SlideFrame): number {
  return 1 - anchorGlideT(spanU, f);
}

/** THE DRAWN CENTER: slide(A, span) — written into `out` (default a fresh point). */
export function slideCenter(anchor: SlidePoint, spanU: number, f: SlideFrame, out: SlidePoint = { x: 0, y: 0 }): SlidePoint {
  const l = legsOf(f);
  const t = anchorGlideT(spanU, f);
  const m = boardGlideT(spanU, f);
  const g = l === null ? ORIGIN : l.target;
  const x = anchor.x + (g.x - anchor.x) * t;
  const y = anchor.y + (g.y - anchor.y) * t;
  out.x = x * (1 - m);
  out.y = y * (1 - m);
  return out;
}

/**
 * THE INVERSE: the anchor A with slide(A, span) = `center`, or null where the
 * drawn center does not depend on the anchor (the anchor glide complete, or
 * within WEIGHT_EPS of it). Exact for span ≤ h (A = C) and on the anchor glide
 * (A = (C − t·target) / (1 − t)), in both regimes.
 */
export function slideAnchor(center: SlidePoint, spanU: number, f: SlideFrame): SlidePoint | null {
  const t = anchorGlideT(spanU, f);
  if (t >= 1 - WEIGHT_EPS) return null;
  if (t === 0) return { x: center.x, y: center.y };
  const g = (legsOf(f) as Legs).target;
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
