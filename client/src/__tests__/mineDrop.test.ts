// The own mine drop as the client predicts it (sim/mineDrop.ts): the ONE read
// the click prediction (main.ts `slotHasRound`) and the aim preview's blocked
// tell share. Contract: the spot is the shared `mineDropPoint` for this hull,
// and `blocked` is exactly the server's refusal — on a rock, or off the water.

import { describe, expect, it } from 'vitest';
import { DEFAULT_CLASS_ID, hullEnvelope, islandFromPolygon, mineDropPoint, type Island } from '@salvo/shared';
import { mineDropSpot } from '../sim/mineDrop.js';

const SHIP = { x: 0, y: 0, heading: 0.7, cls: DEFAULT_CLASS_ID };
const MAP_R = 30000;

function squareIsland(cx: number, cy: number, half: number): Island {
  return islandFromPolygon([
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ]);
}

describe('mineDropSpot', () => {
  const drop = mineDropPoint(SHIP, hullEnvelope(SHIP.cls).hull.length);

  it('is the shared stern drop point; open water is fireable', () => {
    const s = mineDropSpot(SHIP, [], MAP_R);
    expect(s.x).toBeCloseTo(drop.x, 9);
    expect(s.y).toBeCloseTo(drop.y, 9);
    expect(s.blocked).toBe(false);
  });

  it('a drop point on a rock is denied', () => {
    expect(mineDropSpot(SHIP, [squareIsland(drop.x, drop.y, 20)], MAP_R).blocked).toBe(true);
  });

  it('a drop point off the map edge is denied', () => {
    // Bow inward at the rim: the stern hangs over the edge.
    expect(mineDropSpot({ ...SHIP, x: MAP_R - 10, y: 0, heading: Math.PI }, [], MAP_R).blocked).toBe(true);
  });
});
