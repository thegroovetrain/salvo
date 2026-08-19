// ORDNANCE AIM PREVIEW (render/aimPreview.ts) — pure geometry.
//
// The whole point of the feature is that the preview is not an approximation:
// it is the SHOT's geometry, computed with the same shared helpers the server
// fires with (sim/aim.ts). So these tests check parity against those helpers
// directly, and the rules that cannot be read off a single number: the barrel
// fan, island clipping (and PLUNGING FIRE's exemption from it), the AP shot
// that ignores click distance and has no blast at all, the torpedo's real tube
// exit, the homing acquisition band, and the mine's placement rings.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  burstPointAlong,
  effectiveStats,
  hullEnvelope,
  islandFromPolygon,
  resolveBoons,
  torpedoSpawn,
  type EffectiveStats,
  type Island,
} from '@salvo/shared';
import {
  clipAtIslands,
  computeAimPreview,
  effectiveLitRadius,
  ownBurstRadius,
  previewTint,
  type AimPreviewInput,
} from '../render/aimPreview.js';

const SHIP = { x: 0, y: 0, heading: 0, cls: 'battleship' as const };
const MAP_R = 2400;

/** A test "rock" fixture built as a real Island polygon: an axis-aligned
 *  square of half-width `half` centered at (cx, cy). Every clipping test
 *  below fires along y = cy from the west, so the square's LEFT EDGE sits at
 *  exactly `cx - half` — reproducing the pre-fractal circle fixtures' clip
 *  coordinates bit-for-bit; only the broadphase bounding circle grows (a
 *  square's corner-to-centre distance exceeds its half-width). */
function squareIsland(cx: number, cy: number, half: number): Island {
  return islandFromPolygon([
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ]);
}

function stats(...boons: string[]): EffectiveStats {
  return effectiveStats(CONFIG.shipClasses.battleship, resolveBoons(boons));
}

function input(over: Partial<AimPreviewInput> = {}): AimPreviewInput {
  return {
    id: 'gun',
    ship: SHIP,
    aim: 0,
    aimDist: 300,
    stats: stats(),
    mapRadius: MAP_R,
    islands: [],
    legal: true,
    ...over,
  };
}

describe('computeAimPreview — nothing is previewed that cannot be fired', () => {
  it('an ILLEGAL aim (out of arc / out of reach) previews nothing at all', () => {
    const m = computeAimPreview(input({ id: 'mine', legal: false }));
    expect(m).toEqual({ lines: [], bursts: [], place: null, band: null });
  });

  it('an ABILITY slot (and an empty slot) previews nothing', () => {
    expect(computeAimPreview(input({ id: 'speedBoost' })).lines).toEqual([]);
    expect(computeAimPreview(input({ id: 'decoyBuoy' })).lines).toEqual([]);
    expect(computeAimPreview(input({ id: null })).lines).toEqual([]);
  });
});

describe('the gun — burst circle at the SERVER-TRUTH burst point', () => {
  it('puts the circle exactly where shared burstPointAlong puts the burst', () => {
    const inp = input({ aimDist: 300 });
    const [b] = computeAimPreview(inp).bursts;
    const truth = burstPointAlong(SHIP, 300, MAP_R, inp.stats.gun.rangeU, 0);
    expect(b.x).toBeCloseTo(truth.x, 9);
    expect(b.y).toBeCloseTo(truth.y, 9);
    expect(b.r).toBe(inp.stats.gun.burstRadius);
    expect(b.blocked).toBe(false);
  });

  it('clamps a beyond-range click to the effective range (the shell stops there)', () => {
    const inp = input({ aimDist: 5000 });
    const [b] = computeAimPreview(inp).bursts;
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(inp.stats.gun.rangeU, 6);
  });

  it('starts the travel line at the MUZZLE, not the ship centre', () => {
    const [l] = computeAimPreview(input()).lines;
    expect(l.x1).toBeCloseTo(hullEnvelope('battleship').hull.length / 2 + CONFIG.gun.shellRadius, 3);
    expect(l.y1).toBeCloseTo(0, 6);
  });

  it('draws one line AND one circle per barrel, fanned (TWIN/TRIPLE MOUNT)', () => {
    const inp = input({ stats: stats('gunBarrel', 'gunBarrel') });
    expect(inp.stats.gun.barrels).toBe(3);
    const m = computeAimPreview(inp);
    expect(m.lines).toHaveLength(3);
    expect(m.bursts).toHaveLength(3);
    // The fan really fans: the outer barrels sit off the aim axis, opposite ways.
    expect(m.bursts[0].y).toBeLessThan(0);
    expect(m.bursts[1].y).toBeCloseTo(0, 6);
    expect(m.bursts[2].y).toBeGreaterThan(0);
  });
});

describe('island clipping — and the PLUNGING FIRE exemption', () => {
  const rock: Island[] = [squareIsland(150, 0, 30)];

  it('clips the line at the rock and DIMS the burst circle (the blocked tell)', () => {
    const m = computeAimPreview(input({ islands: rock, aimDist: 400 }));
    expect(m.lines[0].x2).toBeCloseTo(120, 3); // the rock's near rim
    expect(m.bursts[0].x).toBeCloseTo(400, 6); // the circle stays at the CLICK
    expect(m.bursts[0].blocked).toBe(true); // ...but flagged as unreachable
  });

  it('a standard CANNON shell clips the same way', () => {
    const m = computeAimPreview(input({ id: 'cannon', islands: rock, aimDist: 400 }));
    expect(m.bursts[0].blocked).toBe(true);
    expect(m.bursts[0].r).toBe(stats().cannon.burstRadius);
  });

  it('PLUNGING FIRE overflies the rock: full-length line, un-dimmed circle', () => {
    const m = computeAimPreview(
      input({ id: 'cannon', islands: rock, aimDist: 400, stats: stats('cannonArcing') }),
    );
    expect(m.lines[0].x2).toBeCloseTo(400, 6); // no clip — it arcs over
    expect(m.bursts[0].blocked).toBe(false);
  });

  // No CARD moves a cannon burst radius any more — FRAGMENTATION CASING was
  // deleted (Eric ruling 2026-08-16) because it was a total no-op under AP. The
  // claim under test was never about that card though: it is that the preview
  // reads the EFFECTIVE stats it is handed rather than reaching for CONFIG. So
  // hand it a stats object whose burst differs from CONFIG and assert it follows
  // — which tests the claim more directly than routing through a boon did.
  it('burst radii come from EFFECTIVE stats, never raw CONFIG', () => {
    const base = stats();
    const boosted = { ...base, cannon: { ...base.cannon, burstRadius: base.cannon.burstRadius * 2 } };
    expect(boosted.cannon.burstRadius).toBeGreaterThan(CONFIG.cannon.burstRadius);
    const m = computeAimPreview(input({ id: 'cannon', stats: boosted }));
    expect(m.bursts[0].r).toBe(boosted.cannon.burstRadius);
    expect(m.bursts[0].r).not.toBe(CONFIG.cannon.burstRadius);
  });

  it('clipAtIslands reports a clean path untouched', () => {
    const clip = clipAtIslands({ x: 0, y: 0 }, { x: 100, y: 0 }, [squareIsland(0, 500, 40)]);
    expect(clip).toEqual({ point: { x: 100, y: 0 }, clipped: false });
  });
});

describe('ARMOR-PIERCING — a direction shot with no blast', () => {
  const ap = () => input({ id: 'cannon', stats: stats('cannonAp'), aimDist: 50 });

  it('previews NO circle (there is nothing to burst)', () => {
    expect(computeAimPreview(ap()).bursts).toEqual([]);
  });

  it('ignores the clicked distance and runs the full effective range', () => {
    const inp = ap();
    const [l] = computeAimPreview(inp).lines;
    expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1)).toBeCloseTo(inp.stats.cannon.rangeU, 3);
  });

  it('is still stopped dead by an island', () => {
    const [l] = computeAimPreview({ ...ap(), islands: [squareIsland(300, 0, 40)] }).lines;
    expect(l.x2).toBeCloseTo(260, 3);
  });
});

describe('torpedoes — gated by ID, never by the gun-range fallback', () => {
  it('runs from the real tube exit to the map edge, far past gun range', () => {
    const inp = input({ id: 'torpedo', aimDist: 100 });
    const [l] = computeAimPreview(inp).lines;
    const tube = torpedoSpawn(SHIP, hullEnvelope('battleship').hull.length, 0);
    expect(l.x1).toBeCloseTo(tube.x, 9);
    // weaponArc.weaponRangeU would have answered stats.gun.rangeU here (a
    // documented meaningless fallback for the torpedo) — the fish runs on.
    expect(l.x2).toBeGreaterThan(inp.stats.gun.rangeU);
    expect(Math.hypot(l.x2, l.y2)).toBeLessThanOrEqual(MAP_R);
    expect(computeAimPreview(inp).bursts).toEqual([]); // contact-only: no blast
  });

  it('stops the track at the first island', () => {
    const [l] = computeAimPreview(input({ id: 'torpedo', islands: [squareIsland(800, 0, 50)] })).lines;
    expect(l.x2).toBeCloseTo(750, 3);
  });

  it('ACOUSTIC HOMING adds the acquisition band along the initial track', () => {
    const m = computeAimPreview(input({ id: 'torpedo', stats: stats('torpedoHoming') }));
    expect(m.band).not.toBeNull();
    expect(m.band!.halfWidth).toBe(CONFIG.torpedo.homingAcquireRange);
    expect(m.band!.x1).toBeCloseTo(m.lines[0].x1, 9);
    // The band tracks the DRAWN line, so it never promises reach the fish's
    // finite travel budget cannot deliver.
    expect(m.band!.x2).toBeCloseTo(m.lines[0].x2, 9);
    expect(m.lines[0].x2 - m.lines[0].x1).toBeCloseTo(CONFIG.torpedo.homingMaxRangeU, 3);
  });

  // RETIRED with COMMAND DETONATION (Story 7-5 wave 1): the three commanded-
  // point pins and the command half of the no-band pin are gone with the weapon
  // behavior — there is no longer a torpedo that bursts at a clicked point.
  it('no band on a straight-runner (only ACOUSTIC HOMING steers)', () => {
    expect(computeAimPreview(input({ id: 'torpedo' })).band).toBeNull();
  });

  it('no torpedo previews a point burst any more — contact only', () => {
    expect(computeAimPreview(input({ id: 'torpedo', stats: stats('torpedoHoming') })).bursts).toEqual([]);
  });
});

describe('mine placement — both rings at the drop point', () => {
  it('previews blast + trigger at the clicked point, off EFFECTIVE stats', () => {
    const s = stats('mineBlast', 'mineBlast');
    const m = computeAimPreview(input({ id: 'mine', stats: s, aim: Math.PI, aimDist: 60 }));
    expect(m.place).not.toBeNull();
    expect(m.place!.x).toBeCloseTo(-60, 6);
    expect(m.place!.blast).toBe(s.mine.blastRadius);
    expect(m.place!.trigger).toBe(s.mine.triggerRadius);
    expect(m.place!.blocked).toBe(false);
    expect(m.lines).toEqual([]); // a mine is placed, not launched
  });

  it('flags a drop point the server would REFUSE (a rock, or off the water)', () => {
    const onRock = computeAimPreview(
      input({ id: 'mine', aimDist: 60, islands: [squareIsland(60, 0, 20)] }),
    );
    expect(onRock.place!.blocked).toBe(true);
    const offMap = computeAimPreview(
      input({ id: 'mine', ship: { ...SHIP, x: MAP_R - 10 }, aimDist: 60 }),
    );
    expect(offMap.place!.blocked).toBe(true);
  });
});

// A hull pinned against the rim can point its guns at open water OUTSIDE the
// disk: the boundary clamp holds the CENTRE inside, but the muzzle (and the
// torpedo tube exit) sits up to a half hull-length past it. The sim disposes of
// a ballistic spawned out there immediately, so the preview must not promise a
// shot — the one thing worse than no preview is a confident wrong one.
// Eric ruling R7 (post-landing): the flare previews what it will LIGHT. A
// one-shot flare on a 20s cooldown that lands 100u off the ship you meant to
// reveal is the entire cost of guessing, and the lit circle is the only thing
// that makes the aim a decision rather than a hope.
describe('star shells — the lit radius is the preview', () => {
  it('draws the lit circle at the burst point, in the quieter EFFECT register', () => {
    const inp = input({ id: 'starShells', aimDist: 300 });
    const m = computeAimPreview(inp);
    expect(m.bursts).toHaveLength(1);
    expect(m.bursts[0].x).toBeCloseTo(300, 6);
    expect(m.bursts[0].r).toBe(inp.stats.starShells.litRadius);
    expect(m.bursts[0].effect).toBe(true); // not a damage area
    expect(m.lines).toHaveLength(1); // ...and it keeps its travel line
  });

  // The WIDE BURST half of this pin is RETIRED: `starRadius` was deleted from
  // the catalog in Story 7-5 wave 1, so no card moves `starShells.litRadius`
  // any more. What survives is the load-bearing half — the preview reads the
  // EFFECTIVE stat rather than the raw CONFIG base.
  it('uses the EFFECTIVE lit radius, never the raw CONFIG base', () => {
    const s = stats();
    const m = computeAimPreview(input({ id: 'starShells', stats: s }));
    expect(m.bursts[0].r).toBe(s.starShells.litRadius);
  });

  it('honors the PHOSPHOR shrink — the verb trades reach for burn', () => {
    const inc = stats('starIncendiary');
    expect(inc.starShells.phosphor).toBe(true);
    const m = computeAimPreview(input({ id: 'starShells', stats: inc }));
    expect(m.bursts[0].r).toBeCloseTo(
      inc.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor,
      9,
    );
    expect(m.bursts[0].r).toBeLessThan(inc.starShells.litRadius);
    expect(effectiveLitRadius(inc)).toBe(m.bursts[0].r);
  });

  // THE VERBS STACK (Story 7-5 wave 1). A captain holding BOTH star-shell cards
  // still previews the phosphor-shrunk circle: DAZZLE is an independent verb
  // that does not touch the radius, and an either/or read would have picked one.
  it('a both-verb flare previews the SAME phosphor-shrunk circle', () => {
    const both = stats('starIncendiary', 'starDazzle');
    expect(both.starShells.phosphor).toBe(true);
    expect(both.starShells.dazzle).toBe(true);
    expect(effectiveLitRadius(both)).toBeCloseTo(
      both.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor,
      9,
    );
    expect(effectiveLitRadius(both)).toBe(effectiveLitRadius(stats('starIncendiary')));
  });

  it('clamps the lit circle to effective range like any gun-family shot', () => {
    const inp = input({ id: 'starShells', aimDist: 99999 });
    const m = computeAimPreview(inp);
    expect(Math.hypot(m.bursts[0].x, m.bursts[0].y)).toBeCloseTo(inp.stats.starShells.rangeU, 6);
  });

  // An island-stopped flare takes World.resolveShell's plain splash-boom path,
  // which — unlike an interception — spawns NO lit zone. A blocked flare lights
  // NOTHING, so the dim tell here is not cosmetic, it is the warning.
  it('DIMS the circle when a rock stops the flare short (a blocked flare lights nothing)', () => {
    const m = computeAimPreview(
      input({ id: 'starShells', aimDist: 400, islands: [squareIsland(150, 0, 30)] }),
    );
    expect(m.bursts[0].blocked).toBe(true);
    expect(m.lines[0].x2).toBeCloseTo(120, 3); // the line still clips at the rock
  });

  it('never overflies a rock — the flare is not plunging fire', () => {
    const clear = computeAimPreview(input({ id: 'starShells', aimDist: 400 }));
    expect(clear.bursts[0].blocked).toBe(false);
  });
});

describe('rim honesty — a shot whose ORIGIN is off the water', () => {
  const rimShip = { ...SHIP, x: MAP_R + 5, y: 0, heading: 0 };

  it('previews NOTHING for a torpedo whose tube exit is past the rim', () => {
    const m = computeAimPreview(input({ id: 'torpedo', ship: rimShip, aimDist: 300 }));
    expect(m).toEqual({ lines: [], bursts: [], place: null, band: null });
  });

  it('still previews a torpedo fired from inside the rim', () => {
    const m = computeAimPreview(input({ id: 'torpedo', ship: { ...SHIP, x: 0 } }));
    expect(m.lines).toHaveLength(1);
  });

  it('marks a gun burst BLOCKED when the muzzle itself is off the water', () => {
    const m = computeAimPreview(input({ ship: rimShip, aimDist: 300 }));
    expect(m.bursts[0].blocked).toBe(true);
  });

  it('...and the same for the cannon, while an in-bounds muzzle stays confident', () => {
    expect(computeAimPreview(input({ id: 'cannon', ship: rimShip })).bursts[0].blocked).toBe(true);
    expect(computeAimPreview(input({ id: 'cannon' })).bursts[0].blocked).toBe(false);
  });
});

describe('ownBurstRadius — our own blast, never anybody else’s', () => {
  it('sizes an own gun/cannon burst off our effective stats', () => {
    const s = stats();
    expect(ownBurstRadius(s, 'gun')).toBe(s.gun.burstRadius);
    expect(ownBurstRadius(s, 'cannon')).toBe(s.cannon.burstRadius);
  });

  it('leaves every other burst on the CONFIG default (enemy builds stay private)', () => {
    const s = stats();
    expect(ownBurstRadius(s, null)).toBeUndefined();
    expect(ownBurstRadius(s, 'torpedo')).toBeUndefined(); // a straight-runner has no point burst
    expect(ownBurstRadius(s, 'starShells')).toBeUndefined();
  });

  // RETIRED with COMMAND DETONATION (Story 7-5 wave 1): no torpedo bursts at a
  // point any more, so there is no fish whose ring beats the CONFIG default.
  it('a HOMING or standard fish has no burst ring of its own', () => {
    expect(ownBurstRadius(stats('torpedoHoming'), 'torpedo')).toBeUndefined();
    expect(ownBurstRadius(stats(), 'torpedo')).toBeUndefined();
  });
});

describe('previewTint', () => {
  it('keeps the torpedo on its own identity and everything else on aim amber', () => {
    expect(previewTint('torpedo')).not.toBe(previewTint('gun'));
    expect(previewTint('mine')).toBe(previewTint('gun'));
  });
});
