// Story 1.14 — the DOM card/chip silhouette helper traces the ONE shared hull
// polygon (no second geometry source) and the pip-scale mapping pins Eric's
// ruled fills. Both are pure; no Pixi/DOM involved.

import { describe, it, expect } from 'vitest';
import { HULL_IDS, hullSilhouette, polygonMaxRadius } from '@salvo/shared';
import { silhouetteSvg } from '../util/silhouetteSvg.js';

/** Pull the `points="..."` coord pairs out of the emitted SVG. */
function parsePoints(svg: string): [number, number][] {
  const m = svg.match(/points="([^"]*)"/);
  if (!m) throw new Error('no points attr');
  return m[1]
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return [x, y] as [number, number];
    });
}

/** Pull the four `viewBox` numbers out of the emitted SVG. */
function parseViewBox(svg: string): { x: number; y: number; w: number; h: number } {
  const m = svg.match(/viewBox="([^"]*)"/);
  if (!m) throw new Error('no viewBox attr');
  const [x, y, w, h] = m[1].trim().split(/\s+/).map(Number);
  return { x, y, w, h };
}

describe('silhouetteSvg — traces the shared hull polygon', () => {
  it('emits exactly one polygon point per shared vert, for every hull id', () => {
    for (const id of HULL_IDS) {
      const svg = silhouetteSvg(id, { stroke: 'currentColor' });
      expect(parsePoints(svg), id).toHaveLength(hullSilhouette(id).length);
    }
  });

  it('viewBox encloses every polygon point (with the margin), for every hull id', () => {
    for (const id of HULL_IDS) {
      const svg = silhouetteSvg(id, { stroke: 'currentColor' });
      const vb = parseViewBox(svg);
      expect(vb.w, id).toBeGreaterThan(0);
      expect(vb.h, id).toBeGreaterThan(0);
      const eps = 1e-6;
      for (const [x, y] of parsePoints(svg)) {
        expect(x, `${id} x`).toBeGreaterThanOrEqual(vb.x - eps);
        expect(x, `${id} x`).toBeLessThanOrEqual(vb.x + vb.w + eps);
        expect(y, `${id} y`).toBeGreaterThanOrEqual(vb.y - eps);
        expect(y, `${id} y`).toBeLessThanOrEqual(vb.y + vb.h + eps);
      }
    }
  });

  it('margin scales with the hull bounding radius (polygonMaxRadius)', () => {
    const id = 'torpedoBoat';
    const tight = parseViewBox(silhouetteSvg(id, { stroke: 'c', marginFrac: 0 }));
    const padded = parseViewBox(silhouetteSvg(id, { stroke: 'c', marginFrac: 0.2 }));
    const maxR = polygonMaxRadius(hullSilhouette(id));
    // padded viewBox grows by 2*margin on each dimension; margin = maxR*0.2.
    expect(padded.w - tight.w).toBeCloseTo(maxR * 0.2 * 2, 3);
  });

  it('is color-agnostic — passes stroke/fill strings straight through', () => {
    const svg = silhouetteSvg('battleship', { stroke: '#00d0ff', fill: '#005e73' });
    expect(svg).toContain('stroke="#00d0ff"');
    expect(svg).toContain('fill="#005e73"');
    expect(silhouetteSvg('mineLayer', { stroke: 'x' })).toContain('fill="none"');
  });
});
