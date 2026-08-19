// ORDNANCE AIM PREVIEW (render/aimPreview.ts) — pure geometry.
//
// The whole point of the feature is that the preview is not an approximation:
// it is the SHOT's geometry, computed with the same shared helpers the server
// fires with (sim/aim.ts + sim/spread.ts). So these tests check parity against
// those helpers directly, and the rules that cannot be read off a single number:
// BARREL's parallel tracks, the BROADSIDE BARRAGE's constant-radius fan, island
// clipping, the torpedo's real tube exit, the homing acquisition band, and the
// mine's placement rings.
//
// STORY 7-5 WAVE 2 RETIRED three whole suites with the cannon (R2.6): PLUNGING
// FIRE's island exemption, ARMOR-PIERCING's blast-less direction shot, and the
// cannon's own clip/rim pins. Nothing overflies terrain any more and nothing
// pierces, so those are not adapted — the weapon they described is gone.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  burstPointAlong,
  effectiveStats,
  fanTargets,
  hullEnvelope,
  islandFromPolygon,
  parallelOffsets,
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
    expect(computeAimPreview(input({ id: 'radarBuoy' })).lines).toEqual([]);
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

  // PIN FLIPPED (Story 7-5 wave 2, R2.16): BARREL's extra shells fly on PARALLEL
  // tracks now, not a spreading fan. The old pin only asserted "off the axis,
  // opposite ways", which a parallel volley also satisfies — so what is asserted
  // here is the property that DISCRIMINATES the two shapes, and it is asserted
  // against the shared helper the server offsets with.
  it('draws one line AND one circle per barrel, on PARALLEL tracks (BARREL)', () => {
    const inp = input({ stats: stats('gunBarrel', 'gunBarrel') });
    expect(inp.stats.gun.barrels).toBe(3);
    const m = computeAimPreview(inp);
    expect(m.lines).toHaveLength(3);
    expect(m.bursts).toHaveLength(3);
    const offs = parallelOffsets(0, 3, CONFIG.gun.barrelSpacingU);
    const truth = burstPointAlong(SHIP, 300, MAP_R, inp.stats.gun.rangeU, 0);
    m.bursts.forEach((b, i) => {
      expect(b.x, `burst ${i} x`).toBeCloseTo(truth.x + offs[i].x, 9);
      expect(b.y, `burst ${i} y`).toBeCloseTo(truth.y + offs[i].y, 9);
    });
    // PARALLEL, not fanned: every track sits at the SAME lateral offset at the
    // muzzle as at the burst, so the volley's width does not grow with range.
    m.lines.forEach((l, i) => {
      expect(l.y2 - l.y1, `line ${i} stays parallel`).toBeCloseTo(0, 9);
    });
    // ...and the straddle law is visible: an ODD count puts one shell on the
    // click, with the other two symmetric about it.
    expect(m.bursts[1].y).toBeCloseTo(truth.y, 9);
    expect(m.bursts[0].y + m.bursts[2].y).toBeCloseTo(2 * truth.y, 9);
  });

  // The OTHER half of the straddle law (R2.16), and the half a fan and a
  // parallel volley agree on: an EVEN count leaves the crosshair EMPTY. Asserted
  // separately from the odd case because "one shell is on the click" and "no
  // shell is on the click" are different promises to the player, and only one of
  // them can be true at a time.
  it('EVEN barrel count: the shells STRADDLE the click, none on it', () => {
    const inp = input({ stats: stats('gunBarrel') });
    expect(inp.stats.gun.barrels).toBe(2);
    const m = computeAimPreview(inp);
    expect(m.bursts).toHaveLength(2);
    const truth = burstPointAlong(SHIP, 300, MAP_R, inp.stats.gun.rangeU, 0);
    for (const b of m.bursts) expect(b.y).not.toBeCloseTo(truth.y, 6);
    // Symmetric about the click, exactly one spacing apart.
    expect(m.bursts[0].y + m.bursts[1].y).toBeCloseTo(2 * truth.y, 9);
    expect(Math.abs(m.bursts[1].y - m.bursts[0].y)).toBeCloseTo(CONFIG.gun.barrelSpacingU, 9);
  });

  // THE PROPERTY THAT DISCRIMINATES PARALLEL FROM FANNED, stated as a
  // measurement rather than as a shape: a fan's lateral separation GROWS with
  // range, a parallel volley's does not. Measured at two ranges and off-axis, so
  // an implementation that happened to look parallel along +x cannot pass.
  it('lateral separation is CONSTANT with range (parallel, never a cone)', () => {
    const s = stats('gunBarrel', 'gunBarrel');
    const bearing = 0.7; // off-axis on purpose
    const sep = (aimDist: number): number => {
      const m = computeAimPreview(input({ stats: s, aim: bearing, aimDist }));
      const [a, , c] = m.bursts;
      return Math.hypot(c.x - a.x, c.y - a.y);
    };
    expect(sep(500)).toBeCloseTo(sep(120), 9);
    expect(sep(500)).toBeCloseTo(2 * CONFIG.gun.barrelSpacingU, 9);
    // ...and each track keeps its offset from muzzle to burst (that IS parallel).
    const m = computeAimPreview(input({ stats: s, aim: bearing, aimDist: 400 }));
    const nx = -Math.sin(bearing);
    const ny = Math.cos(bearing);
    m.lines.forEach((l, i) => {
      const at0 = l.x1 * nx + l.y1 * ny;
      const at1 = l.x2 * nx + l.y2 * ny;
      expect(at1 - at0, `line ${i} lateral drift`).toBeCloseTo(0, 6);
    });
  });
});

// --- THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15) ----------------------
//
// The preview must AGREE EXACTLY with the server's legality gate: the guarantee
// is that the previewed circle IS where the shell bursts, so a preview that
// draws a burst the server would refuse (or clamps one it would allow) is a
// defect. `gunReachU` is that agreement made structural — main.ts resolves the
// reach ONCE through weaponArc.weaponReachU and hands the SAME number to the
// range-clamp marker and to this preview.
describe('the gun reaches into its own flare — the preview agrees with the gate', () => {
  const RANGE = stats().gun.rangeU;

  it('bursts AT the click when the reach was lifted, instead of clamping short', () => {
    const d = RANGE + 200;
    const [b] = computeAimPreview(input({ aimDist: d, gunReachU: d })).bursts;
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(d, 6);
    // ...which is exactly the shared burst point at the lifted reach.
    const truth = burstPointAlong(SHIP, d, MAP_R, d, 0);
    expect(b.x).toBeCloseTo(truth.x, 9);
  });

  it('clamps at the base range when the reach was NOT lifted', () => {
    const d = RANGE + 200;
    const [b] = computeAimPreview(input({ aimDist: d, gunReachU: RANGE })).bursts;
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(RANGE, 6);
    // Omitting the field is that same clamp — the pre-wave-2 geometry.
    const [plain] = computeAimPreview(input({ aimDist: d })).bursts;
    expect(plain.x).toBeCloseTo(b.x, 9);
  });

  it('a lifted reach never leaks into another weapon', () => {
    const d = RANGE + 200;
    const b = computeAimPreview(
      input({ id: 'broadside', aim: Math.PI / 2, aimDist: d, gunReachU: d }),
    ).bursts;
    for (const shot of b) {
      expect(Math.hypot(shot.x, shot.y)).toBeCloseTo(stats().broadside.rangeU, 6);
    }
    const star = computeAimPreview(input({ id: 'starShells', aimDist: d, gunReachU: d })).bursts;
    expect(Math.hypot(star[0].x, star[0].y)).toBeCloseTo(stats().starShells.rangeU, 6);
  });
});

// --- THE BROADSIDE BARRAGE (Story 7-5 wave 2, R2.3) --------------------------
//
// THE LOAD-BEARING PIN OF THIS FEATURE. The project's guarantee is that the
// previewed circle IS where the shell bursts, which holds only because BOTH
// sides call ONE helper. These assert the preview's burst centres are EXACTLY
// `fanTargets(...)` — so a future edit that re-derives the geometry here (a
// hand-rolled loop over bearings, a cone that widens with range, a different
// straddle convention) fails, even if it happens to look plausible on screen.
describe('the broadside — the fan comes from the SHARED helper, not a re-derivation', () => {
  const broadside = (over: Partial<AimPreviewInput> = {}): AimPreviewInput =>
    input({ id: 'broadside', aim: Math.PI / 2, aimDist: 300, ...over });

  it('ODD turret count: every circle is exactly fanTargets(), one dead on the click', () => {
    const inp = broadside();
    const b = inp.stats.broadside;
    expect(b.turrets).toBe(3); // base fit, odd
    const m = computeAimPreview(inp);
    const click = burstPointAlong(SHIP, 300, MAP_R, b.rangeU, Math.PI / 2);
    const truth = fanTargets(SHIP, click, b.turrets, b.fanHalfAngleRad);
    expect(m.bursts).toHaveLength(truth.length);
    truth.forEach((t, i) => {
      expect(m.bursts[i].x, `shell ${i} x`).toBeCloseTo(t.x, 9);
      expect(m.bursts[i].y, `shell ${i} y`).toBeCloseTo(t.y, 9);
    });
    // Eric: "One shell will *absolutely* hit at the target point."
    expect(m.bursts[1].x).toBeCloseTo(click.x, 9);
    expect(m.bursts[1].y).toBeCloseTo(click.y, 9);
  });

  it('EVEN turret count: still exactly fanTargets(), and NO shell on the click', () => {
    const inp = broadside({ stats: stats('broadsideTurrets') });
    const b = inp.stats.broadside;
    expect(b.turrets).toBe(4); // even
    const m = computeAimPreview(inp);
    const click = burstPointAlong(SHIP, 300, MAP_R, b.rangeU, Math.PI / 2);
    const truth = fanTargets(SHIP, click, b.turrets, b.fanHalfAngleRad);
    expect(m.bursts).toHaveLength(4);
    truth.forEach((t, i) => {
      expect(m.bursts[i].x, `shell ${i} x`).toBeCloseTo(t.x, 9);
      expect(m.bursts[i].y, `shell ${i} y`).toBeCloseTo(t.y, 9);
    });
    // Eric: "there is no middle turret that will absolutely hit the target
    // location" — the two centre shells straddle it.
    for (const burst of m.bursts) {
      expect(Math.hypot(burst.x - click.x, burst.y - click.y)).toBeGreaterThan(1);
    }
  });

  it('is an ARC AT CONSTANT RADIUS, never a cone that widens with range', () => {
    const inp = broadside();
    const m = computeAimPreview(inp);
    const r = Math.hypot(m.bursts[1].x, m.bursts[1].y);
    for (const burst of m.bursts) expect(Math.hypot(burst.x, burst.y)).toBeCloseTo(r, 6);
  });

  it('a SPREAD stack tightens the fan (the same helper, a narrower half-angle)', () => {
    const wide = computeAimPreview(broadside());
    const tight = computeAimPreview(broadside({ stats: stats('broadsideSpread', 'broadsideSpread') }));
    const spanOf = (m: ReturnType<typeof computeAimPreview>): number =>
      Math.hypot(m.bursts[0].x - m.bursts[2].x, m.bursts[0].y - m.bursts[2].y);
    expect(spanOf(tight)).toBeLessThan(spanOf(wide));
  });

  it('clamps to the 5/8 RUNG, not the radar horizon (R2.4)', () => {
    const inp = broadside({ aimDist: 99999 });
    const m = computeAimPreview(inp);
    expect(Math.hypot(m.bursts[1].x, m.bursts[1].y)).toBeCloseTo(inp.stats.broadside.rangeU, 6);
    expect(inp.stats.broadside.rangeU).toBeLessThan(inp.stats.gun.rangeU);
  });

  it('every shell bursts at the EFFECTIVE broadside radius and clips on its own', () => {
    // A small rock on the CENTRE shell's bearing only: at 300u the ±12° outer
    // shells are ~62u off-axis, so they clear a 40u-wide rock the middle one
    // runs straight into.
    const inp = broadside({ islands: [squareIsland(0, 280, 20)] });
    const m = computeAimPreview(inp);
    expect(m.bursts[1].r).toBe(inp.stats.broadside.burstRadius);
    // The middle shell runs straight into the rock; the outer two pass it.
    expect(m.bursts[1].blocked).toBe(true);
    expect(m.bursts[0].blocked).toBe(false);
    expect(m.bursts[2].blocked).toBe(false);
  });
});

describe('island clipping', () => {
  const rock: Island[] = [squareIsland(150, 0, 30)];

  it('clips the line at the rock and DIMS the burst circle (the blocked tell)', () => {
    const m = computeAimPreview(input({ islands: rock, aimDist: 400 }));
    expect(m.lines[0].x2).toBeCloseTo(120, 3); // the rock's near rim
    expect(m.bursts[0].x).toBeCloseTo(400, 6); // the circle stays at the CLICK
    expect(m.bursts[0].blocked).toBe(true); // ...but flagged as unreachable
  });

  // NOTHING OVERFLIES TERRAIN ANY MORE (Story 7-5 wave 2, R2.6): the PLUNGING
  // FIRE exemption pin is RETIRED with the doctrine. What survives is the claim
  // that was never about the cannon — the preview reads the EFFECTIVE stats it
  // is handed rather than reaching for CONFIG.
  it('burst radii come from EFFECTIVE stats, never raw CONFIG', () => {
    const base = stats();
    const boosted = { ...base, gun: { ...base.gun, burstRadius: base.gun.burstRadius * 2 } };
    expect(boosted.gun.burstRadius).toBeGreaterThan(CONFIG.gun.burstRadius);
    const m = computeAimPreview(input({ stats: boosted }));
    expect(m.bursts[0].r).toBe(boosted.gun.burstRadius);
    expect(m.bursts[0].r).not.toBe(CONFIG.gun.burstRadius);
  });

  it('clipAtIslands reports a clean path untouched', () => {
    const clip = clipAtIslands({ x: 0, y: 0 }, { x: 100, y: 0 }, [squareIsland(0, 500, 40)]);
    expect(clip).toEqual({ point: { x: 100, y: 0 }, clipped: false });
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

  // CAPTIVE MINES (Story 7-5 wave 2, R2.12). The rings are DERIVED inside
  // effectiveStats (trigger and blast swap, then trigger triples), so the whole
  // job on this side is to READ them and to draw the honest set: the wide trip
  // ring the mine watches, and NOT a blast circle around the casing — a captive
  // mine never detonates on contact, so a solid ring there would promise a kill
  // it cannot deliver.
  it('CAPTIVE: previews the 144u trip ring, not the 32u contact-blast ring', () => {
    const s = stats('mineCaptive');
    const m = computeAimPreview(input({ id: 'mine', stats: s, aim: 0, aimDist: 60 }));
    expect(m.place!.captive).toBe(true);
    expect(m.place!.trigger).toBeCloseTo(144, 9);
    expect(m.place!.blast).toBeCloseTo(32, 9);
    // The numbers are the firewall's, never re-derived here.
    expect(m.place!.trigger).toBe(s.mine.triggerRadius);
    expect(m.place!.blast).toBe(s.mine.blastRadius);
    // ...and the transform really did invert the ordinary mine's ring pair.
    const plain = computeAimPreview(input({ id: 'mine', aim: 0, aimDist: 60 }));
    expect(plain.place!.captive).toBe(false);
    expect(plain.place!.trigger).toBeLessThan(plain.place!.blast);
    expect(m.place!.trigger).toBeGreaterThan(m.place!.blast);
  });

  it('CAPTIVE: the MINES ladder scales the previewed rings, in any pick order', () => {
    const late = stats('mineBlast', 'mineBlast', 'mineBlast', 'mineBlast', 'mineCaptive');
    const early = stats('mineCaptive', 'mineBlast', 'mineBlast', 'mineBlast', 'mineBlast');
    const m = computeAimPreview(input({ id: 'mine', stats: late, aimDist: 60 }));
    expect(m.place!.trigger).toBeCloseTo(210.8, 1);
    expect(m.place!.blast).toBeCloseTo(46.9, 1);
    expect(computeAimPreview(input({ id: 'mine', stats: early, aimDist: 60 })).place).toEqual(m.place);
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

  it('...and the same for the broadside, while an in-bounds muzzle stays confident', () => {
    const off = computeAimPreview(input({ id: 'broadside', ship: rimShip, aim: Math.PI / 2 }));
    expect(off.bursts.every((b) => b.blocked)).toBe(true);
    const on = computeAimPreview(input({ id: 'broadside', aim: Math.PI / 2 }));
    expect(on.bursts.every((b) => b.blocked)).toBe(false);
  });
});

describe('ownBurstRadius — our own blast, never anybody else’s', () => {
  it('sizes an own gun/broadside burst off our effective stats', () => {
    const s = stats();
    expect(ownBurstRadius(s, 'gun')).toBe(s.gun.burstRadius);
    expect(ownBurstRadius(s, 'broadside')).toBe(s.broadside.burstRadius);
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
