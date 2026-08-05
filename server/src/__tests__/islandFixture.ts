// Test-only island fixtures (cycle 51 — fractal polygon coastlines).
//
// Before cycle 51 every server test that needed terrain wrote a literal
// `{ x, y, r }` circle. Islands are polygons now, so those fixtures are ported
// through THIS helper rather than hand-rolling vertices per test — each test's
// original intent (which segment is blocked, where the rim sits, how much
// clearance a point has) is preserved because the polygon is a regular n-gon
// whose INRADIUS is exactly `r`.
//
// WHY inradius and not circumradius: the phase is chosen so an EDGE MIDPOINT —
// not a vertex — sits on each cardinal axis, and every edge midpoint is at
// exactly `r` from the centre. Virtually every ported fixture reasons along an
// axis ("a rock on the +x flight path", "rim at x=3"), so those comments stay
// literally true to the unit. Off-axis the coastline bulges by at most
// r·(sec(π/SIDES) − 1) ≈ 3e-4·r — far below any assertion tolerance in the
// suite. Segments along an axis through the centre therefore cross edge
// interiors, never a vertex, which keeps the polygon predicates off their
// degenerate case.
//
// A useful consequence: islandFromPolygon derives `core` (largest disc about
// the centre fully inside the polygon) = the inradius = `r`, so
// islandBlocksSegment's `core` early-out reproduces the OLD circle LOS answer
// exactly for any segment that reaches within `r` of the centre.

import { islandFromPolygon, type Island } from '@salvo/shared';

/** Vertex count for a fixture coastline. High enough that the polygon is a
 *  circle to within 3e-4 of its radius, cheap enough for unit tests. */
const SIDES = 128;

/**
 * A near-circular island fixture: centre `(x, y)`, coastline exactly `r` from
 * the centre along every cardinal axis (see the module note). The skeleton is
 * the single centre point, so push-out and `Island.x/y` are exact.
 */
export function circleIsland(x: number, y: number, r: number, sides = SIDES): Island {
  const phase = Math.PI / sides;
  const circum = r / Math.cos(phase);
  const poly = Array.from({ length: sides }, (_, i) => {
    const a = phase + (i * 2 * Math.PI) / sides;
    return { x: x + Math.cos(a) * circum, y: y + Math.sin(a) * circum };
  });
  return islandFromPolygon(poly, [{ x, y }]);
}
