// COVER (Story 9.13, Eric ruling 2026-10-17, epic-9 amendment 199) —
// ai/cover.ts: where a bot breaking off goes to disappear. Contracts only:
// the fog sample lies AWAY from the threat, the island point is on the far
// side and on water, the island wins inside the detour cap, null when the
// sea offers neither.

import { describe, expect, it } from 'vitest';
import { buildNavGrid, cellOf, isWater, type Vec2 } from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { atCover, findCover, FOG_COVER_DENSITY } from '../game/ai/cover.js';
import { lineBlocked } from '../game/ai/plot.js';

const HULL = 100;
const site = { x: 0, y: 0, hullLength: HULL };
const noMind = {};

describe('ai/cover — solid fog', () => {
  it('chooses a solid-fog point AWAY from the threat, never the half facing it', () => {
    const threat: Vec2 = { x: 800, y: 0 };
    const both = (x: number): number => (Math.abs(x) > 150 ? 1 : 0); // fog on both sides
    const p = findCover(noMind, site, threat, [], both);
    expect(p).not.toBeNull();
    expect(p!.x).toBeLessThan(0); // the away side
    expect(both(p!.x)).toBeGreaterThanOrEqual(FOG_COVER_DENSITY);
    // Fog ONLY toward the threat: no fog cover at all.
    expect(findCover(noMind, site, threat, [], (x) => (x > 150 ? 1 : 0))).toBeNull();
  });

  it('thin fog is not cover; with no threat any bearing is', () => {
    expect(findCover(noMind, site, { x: 800, y: 0 }, [], () => FOG_COVER_DENSITY - 0.01)).toBeNull();
    expect(findCover(noMind, site, null, [], (x) => (x > 150 ? 1 : 0))).not.toBeNull();
  });

  it('the fog thunk defaults to the mind\'s bound fogAt', () => {
    expect(findCover({ fogAt: () => 1 }, site, { x: 800, y: 0 }, [])).not.toBeNull();
    expect(findCover({}, site, { x: 800, y: 0 }, [])).toBeNull();
  });
});

describe('ai/cover — island shadow', () => {
  it('the far side of the nearest island from the threat, preferred over fog within the detour', () => {
    const isle = circleIsland(0, -400, 100);
    const threat: Vec2 = { x: 0, y: -1200 }; // the island lies between threat and bot
    const p = findCover(noMind, site, threat, [isle], () => 1);
    expect(p).not.toBeNull();
    // On the island's far side from the threat, a hull length off its circle.
    expect(Math.hypot(p!.x - isle.x, p!.y - isle.y)).toBeCloseTo(isle.r + HULL, 6);
    expect(Math.hypot(p!.x - threat.x, p!.y - threat.y)).toBeGreaterThan(Math.hypot(isle.x - threat.x, isle.y - threat.y));
    // The island blocks the threat's line to the cover point.
    expect(lineBlocked(threat, p!, [isle])).toBe(true);
  });

  it('an island past the detour cap yields to solid fog; with no fog it is still taken', () => {
    const isle = circleIsland(0, -400, 100);
    const threat: Vec2 = { x: 0, y: 1200 }; // the far side is beyond the island from the bot
    const fogAway = (_x: number, y: number): number => (y < -150 ? 1 : 0);
    const viaIsland = findCover(noMind, site, threat, [isle], fogAway, { detourU: Infinity });
    expect(Math.hypot(viaIsland!.x - isle.x, viaIsland!.y - isle.y)).toBeCloseTo(isle.r + HULL, 6);
    const viaFog = findCover(noMind, site, threat, [isle], fogAway, { detourU: 0 });
    expect(viaFog).not.toBeNull();
    expect(viaFog).not.toEqual(viaIsland);
    expect(fogAway(viaFog!.x, viaFog!.y)).toBeGreaterThanOrEqual(FOG_COVER_DENSITY);
    expect(findCover(noMind, site, threat, [isle], () => 0, { detourU: 0 })).toEqual(viaIsland);
  });

  it('with a nav grid the island point is snapped onto navigable water', () => {
    const isle = circleIsland(0, -400, 100);
    const grid = buildNavGrid({ radius: 2000, islands: [isle] });
    const p = findCover(noMind, { ...site, waterR: 2000 }, { x: 0, y: -1200 }, [isle], () => 0, { grid });
    expect(p).not.toBeNull();
    expect(isWater(grid, cellOf(grid, p!.x, p!.y))).toBe(true);
  });
});

describe('ai/cover — nothing to hide behind', () => {
  it('null with no islands and no solid fog', () => {
    expect(findCover(noMind, site, { x: 800, y: 0 }, [], () => 0)).toBeNull();
    expect(findCover(noMind, site, null, [], undefined)).toBeNull();
  });

  it('atCover: within one own hull length of the point', () => {
    expect(atCover(site, { x: HULL, y: 0 })).toBe(true);
    expect(atCover(site, { x: HULL + 1, y: 0 })).toBe(false);
    expect(atCover(site, null)).toBe(false);
  });
});
