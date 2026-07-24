// Inline-SVG hull silhouettes (Story 1.14) — the DOM cards/chips trace the SAME
// shared hull polygon the sim + Pixi renderer use (UX-DR9: one geometry source,
// no second hand-drawn outline). Pure string builder: it reads `hullSilhouette`
// + `polygonMaxRadius` from the shared barrel (like the rest of client code) and
// emits a viewBox-fit `<svg>`. It is deliberately COLOR-AGNOSTIC — stroke/fill
// arrive as already-resolved CSS color strings from the caller (which owns the
// token → cssHex/cssRgba projection), so the tokens guard has nothing to scan.
//
// Orientation: the shared polygon is bow-along-+x (heading frame). For a CARD we
// want the bow pointing UP, so each local (x, y) maps to SVG (y, -x): the bow tip
// (max +x) lands at the top (most-negative SVG y), lateral spread runs left↔right.

import { hullSilhouette, polygonMaxRadius, type HullId } from '@salvo/shared';

export interface SilhouetteOpts {
  /** Resolved CSS stroke color string (a hex or rgba value the caller already
   *  projected from a token via cssHex/cssRgba, or 'currentColor'). */
  stroke: string;
  /** Resolved CSS fill color, or 'none' (default) for an unfilled outline. */
  fill?: string;
  /** Stroke width in viewBox units. */
  strokeWidth?: number;
  /** Empty border around the hull, as a fraction of the hull bounding radius. */
  marginFrac?: number;
}

/** One local (bow-+x) vert → card SVG space (bow up): (x, y) → (y, -x). */
function toCardPoint(p: { x: number; y: number }): [number, number] {
  return [p.y, -p.x];
}

/**
 * Inline `<svg>` string tracing hull `id`'s shared silhouette, bow up, viewBox-fit
 * with a small margin. The `<polygon>` carries exactly one point per shared vert
 * (no resampling — same count as `hullSilhouette(id)`). Sized purely by its
 * viewBox; the caller sets the rendered width/height via CSS.
 */
export function silhouetteSvg(id: HullId, opts: SilhouetteOpts): string {
  const poly = hullSilhouette(id);
  const pts = poly.map(toCardPoint);
  const margin = polygonMaxRadius(poly) * (opts.marginFrac ?? 0.1);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const vbX = minX - margin;
  const vbY = minY - margin;
  const vbW = maxX - minX + margin * 2;
  const vbH = maxY - minY + margin * 2;

  const points = pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
  const fill = opts.fill ?? 'none';
  const sw = opts.strokeWidth ?? 2;
  return (
    `<svg viewBox="${round(vbX)} ${round(vbY)} ${round(vbW)} ${round(vbH)}" ` +
    `xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">` +
    `<polygon points="${points}" fill="${fill}" stroke="${opts.stroke}" ` +
    `stroke-width="${sw}" stroke-linejoin="round"/></svg>`
  );
}

/** Trim float noise so the emitted markup stays compact + stable. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
