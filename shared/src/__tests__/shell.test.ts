import { describe, it, expect } from 'vitest';
import {
  burstVictims,
  stepShell,
  type ShellState,
  type HullTarget,
  type ShellContext,
} from '../sim/shell.js';
import { hullSilhouette, transformPolygon } from '../sim/silhouette.js';
import { CONFIG, type HullId } from '../constants.js';

const DT = CONFIG.tick.simDtMs / 1000;

// Base gun range is DERIVED from radar range (Eric ruling 2026-07-21).
const GUN_RANGE = CONFIG.vision.radar;

// Large map so existing edge-agnostic cases are never terminated by the edge.
const BIG_R = 100000;

/** Build a ShellContext, defaulting to an empty, effectively-boundless world. */
function ctx(o: Partial<ShellContext> = {}): ShellContext {
  return { islands: [], hulls: [] as HullTarget[], now: 1000, dt: DT, mapRadius: BIG_R, ...o };
}

/** A silhouette-polygon hull target at a world pose. droneMedium (100×30
 *  chevron) by default: at heading π/2 its flat starboard side is the vertical
 *  segment x = poseX − 15 spanning y ∈ [poseY − 45, poseY + 15] — a clean
 *  broadside across a +x shell path. */
function hullAt(x: number, y: number, heading: number, id = 'victim', hullId: HullId = 'droneMedium'): HullTarget {
  return { id, poly: transformPolygon(hullSilhouette(hullId), x, y, heading) };
}

/**
 * A CONTACT-ONLY shell (no target point, burstRadius 0): the legacy first-
 * contact behavior, still exactly what point-less projectiles (torpedoes) use.
 */
function shell(overrides: Partial<ShellState> = {}): ShellState {
  return {
    id: 's1',
    ownerId: 'owner',
    x: 0,
    y: 0,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: GUN_RANGE,
    bornAt: 0,
    kind: 'shell',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: CONFIG.gun.damage,
    ...overrides,
  };
}

/** A gun shell with the universal-standard-gun hit rule: flies +x to (tx, 0) and bursts. */
function gunShell(tx: number, overrides: Partial<ShellState> = {}): ShellState {
  return shell({
    targetX: tx,
    targetY: 0,
    distLeft: GUN_RANGE,
    burstRadius: CONFIG.gun.burstRadius,
    contactDamage: CONFIG.gun.contactDamage,
    ...overrides,
  });
}

/** Step a shell until it resolves (non-travel), with a tick safety cap. */
function stepToOutcome(s: ShellState, c: ShellContext, cap = 500): ReturnType<typeof stepShell> {
  let out = stepShell(s, c);
  let ticks = 1;
  while (out.kind === 'travel' && ticks < cap) {
    out = stepShell(s, c);
    ticks++;
  }
  return out;
}

describe('stepShell — travel + range', () => {
  it('advances along its velocity and consumes range', () => {
    const s = shell();
    const out = stepShell(s, ctx());
    expect(out.kind).toBe('travel');
    expect(s.x).toBeCloseTo(CONFIG.gun.shellSpeed * DT, 9);
    expect(s.distLeft).toBeCloseTo(GUN_RANGE - CONFIG.gun.shellSpeed * DT, 6);
  });

  it('expires (splash) when it runs out of range', () => {
    const s = shell({ distLeft: 2 }); // less than one tick of travel
    const out = stepShell(s, ctx());
    expect(out.kind).toBe('expired');
    if (out.kind === 'expired') expect(out.x).toBeCloseTo(2, 6); // splashed at range end
    expect(s.distLeft).toBeLessThanOrEqual(0);
  });
});

describe('stepShell — map-edge terminator', () => {
  it('a projectile already outside the disk splashes immediately (rim ship firing outward)', () => {
    // A rim-clamped ship firing outward spawns hull-clear PAST the edge; with
    // Infinity range (torpedo) nothing else could ever terminate it.
    const r = 100;
    const s = shell({ x: r + 22, y: 0, distLeft: Number.POSITIVE_INFINITY });
    const out = stepShell(s, ctx({ mapRadius: r }));
    expect(out.kind).toBe('expired');
    if (out.kind === 'expired') expect(out.x).toBeCloseTo(r + 22, 6); // splashes where it stands
  });

  it('a shell splashes (expired) exactly where it crosses the water disk', () => {
    const r = 100;
    const s = shell({ x: r - 1, y: 0 }); // one unit inside the edge, heading +x
    const out = stepShell(s, ctx({ mapRadius: r }));
    expect(out.kind).toBe('expired');
    if (out.kind === 'expired') expect(Math.hypot(out.x, out.y)).toBeCloseTo(r, 4);
  });

  it('an island just inside the boundary beats the edge', () => {
    const r = 100;
    // Island centered inside the disk on the path; its entry frac < edge frac.
    const island = { x: r - 20, y: 0, r: 10 };
    const s = shell({ x: 0, y: 0 });
    let out = stepShell(s, ctx({ islands: [island], mapRadius: r }));
    while (out.kind === 'travel') out = stepShell(s, ctx({ islands: [island], mapRadius: r }));
    expect(out.kind).toBe('hitIsland');
    if (out.kind === 'hitIsland') expect(Math.hypot(out.x, out.y)).toBeLessThan(r);
  });
});

describe('stepShell — swept island collision (no tunnel at max speed)', () => {
  it('detects the thinnest island straight ahead even at max shell speed', () => {
    const island = { x: 5, y: 0, r: 25 }; // thin island
    const s = shell();
    let out = stepShell(s, ctx({ islands: [island] }));
    // Within a couple ticks it must register a hit (never sail through).
    let ticks = 1;
    while (out.kind === 'travel' && ticks < 20) {
      out = stepShell(s, ctx({ islands: [island] }));
      ticks++;
    }
    expect(out.kind).toBe('hitIsland');
  });

  it('a fast shell cannot skip a thin island in a single tick', () => {
    // Position the island one tick's travel ahead; a swept test catches it.
    const travel = CONFIG.gun.shellSpeed * DT;
    const island = { x: travel * 0.5, y: 0, r: 25 };
    const s = shell();
    const out = stepShell(s, ctx({ islands: [island] }));
    expect(out.kind).toBe('hitIsland');
  });
});

describe('stepShell — swept hull collision (silhouette polygon)', () => {
  it('hits a hull the shell sweeps into this tick', () => {
    // Broadside at x = 5; one tick of travel (6.5u) crosses it.
    const s = shell();
    const out = stepShell(s, ctx({ hulls: [hullAt(20, 0, Math.PI / 2)] }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('victim');
  });

  it('does not tunnel through a hull at max closing speed', () => {
    // Shell placed so a full max-speed tick would straddle the hull side.
    const travel = CONFIG.gun.shellSpeed * DT;
    const s = shell({ x: 5 - travel * 0.5 });
    const out = stepShell(s, ctx({ hulls: [hullAt(20, 0, Math.PI / 2)] }));
    expect(out.kind).toBe('hitShip');
  });
});

describe('stepShell — permanent owner immunity (Eric ruling 2026-07-19)', () => {
  // Owner hull surrounding the shell spawn point (shell starts inside it).
  const ownerHull = (): HullTarget => hullAt(6, 0, Math.PI / 2, 'owner');

  it('never hits its firer — not at spawn, not ever (no timed grace)', () => {
    // Same overlap the old grace test used, sampled far past any old grace
    // window: a permanently-immune owner still never registers a hit.
    for (const now of [0, 100, 5000, 1e9]) {
      const s = shell({ bornAt: 0 });
      const out = stepShell(s, ctx({ hulls: [ownerHull()], now }));
      expect(out.kind).toBe('travel');
    }
  });

  it('still hits a NON-owner hull it overlaps', () => {
    const s = shell({ bornAt: 0 });
    const enemyHull = hullAt(6, 0, Math.PI / 2, 'enemy');
    const out = stepShell(s, ctx({ hulls: [enemyHull], now: 5000 }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('enemy');
  });
});

describe('stepShell — parameterized for torpedoes (no tunnel at torp speed)', () => {
  const TORP_DT = CONFIG.tick.simDtMs / 1000;
  function torp(overrides: Partial<ShellState> = {}): ShellState {
    return shell({
      vx: CONFIG.torpedo.speed,
      vy: 0,
      distLeft: Number.POSITIVE_INFINITY, // A3: torpedoes run until impact / edge
      kind: 'torp',
      damage: CONFIG.torpedo.damage,
      hitRadius: CONFIG.torpedo.hitRadius,
      contactDamage: CONFIG.torpedo.damage, // contact-only: contact IS the full hit
      ...overrides,
    });
  }

  it('a torpedo cannot skip a thin island placed one tick ahead', () => {
    const travel = CONFIG.torpedo.speed * TORP_DT;
    const island = { x: travel * 0.5, y: 0, r: 20 };
    const out = stepShell(torp(), ctx({ islands: [island], dt: TORP_DT }));
    expect(out.kind).toBe('hitIsland');
  });

  it('a torpedo hits a hull it sweeps into, honoring its own collision radius', () => {
    // Broadside at x = 7; the torp's tick travel (3.5u from x=4) reaches it.
    const out = stepShell(torp({ x: 4 }), ctx({ hulls: [hullAt(22, 0, Math.PI / 2)], dt: TORP_DT }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('victim');
  });

  it('never hits its own firer regardless of elapsed time (permanent immunity)', () => {
    const own = torp({ bornAt: 0 });
    const out = stepShell(own, ctx({ hulls: [hullAt(6, 0, Math.PI / 2, 'owner')], now: 1e9, dt: TORP_DT }));
    expect(out.kind).toBe('travel');
  });

  it('an infinite-range torpedo flies well past the old 700u before hitting a hull', () => {
    const farX = 1200; // beyond the retired 700u torpedo range
    const h = hullAt(farX, 0, Math.PI / 2);
    const t = torp({ x: 0, y: 0 });
    let out = stepShell(t, ctx({ hulls: [h], dt: TORP_DT }));
    let ticks = 1;
    while (out.kind === 'travel' && ticks < 2000) {
      out = stepShell(t, ctx({ hulls: [h], dt: TORP_DT }));
      ticks++;
    }
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('victim');
    expect(t.x).toBeGreaterThan(700); // proves it traveled past the old cap
  });
});

describe('stepShell — per-hull silhouette thresholds', () => {
  it('a graze that hits the wide battleship misses the narrow torpedoBoat', () => {
    // Both hulls at the origin, heading 0 (+x). The BB's flat side runs at
    // y = ±16 (beam 32); the TB never reaches past y = ±4.5 (beam 9). A shell
    // sweeping parallel at y = 17.5 passes within hitRadius (2) of the BB side
    // but stays > 10u away from the TB everywhere.
    const graze = (hullId: HullId, victim: string) =>
      stepShell(
        shell({ x: -3, y: 17.5 }),
        ctx({ hulls: [{ id: victim, poly: transformPolygon(hullSilhouette(hullId), 0, 0, 0) }] }),
      );
    const wide = graze('battleship', 'bb');
    expect(wide.kind).toBe('hitShip');
    if (wide.kind === 'hitShip') expect(wide.victimId).toBe('bb');
    expect(graze('torpedoBoat', 'tb').kind).toBe('travel');
  });

  it('CONCAVE MISS: a torpedo up the mineLayer transom notch does not hit', () => {
    // ML at origin heading 0: the stern cavity opens at x = −44, walls at
    // y = ±3.5. A torpedo running up the centerline stops between the prongs
    // without coming within hitRadius of any hull edge.
    const h: HullTarget = { id: 'ml', poly: transformPolygon(hullSilhouette('mineLayer'), 0, 0, 0) };
    const t: ShellState = {
      ...shell({ x: -70, y: 0, vx: CONFIG.torpedo.speed, vy: 0 }),
      kind: 'torp',
      damage: CONFIG.torpedo.damage,
      hitRadius: CONFIG.torpedo.hitRadius,
      distLeft: 26, // expires at x = −44, in the cavity mouth
    };
    let out = stepShell(t, ctx({ hulls: [h] }));
    while (out.kind === 'travel') out = stepShell(t, ctx({ hulls: [h] }));
    expect(out.kind).toBe('expired'); // ran out of range INSIDE the notch — no hit
    if (out.kind === 'expired') expect(out.x).toBeCloseTo(-44, 6);
  });
});

describe('stepShell — earliest hit wins', () => {
  it('an island in front of a hull resolves as the island', () => {
    const island = { x: 4, y: 0, r: 2 };
    const h = hullAt(22, 0, Math.PI / 2); // broadside at x = 7, behind the island
    const s = shell({ x: 0 });
    // Move until something resolves.
    let out = stepShell(s, ctx({ islands: [island], hulls: [h] }));
    while (out.kind === 'travel') out = stepShell(s, ctx({ islands: [island], hulls: [h] }));
    expect(out.kind).toBe('hitIsland');
  });
});

// --- Universal standard gun: targeted burst hit rule (Story 1.4) ------------
// droneMedium at heading π/2 (see hullAt): near flat side at x = poseX − 15
// spanning y ∈ [poseY − 45, poseY + 15]; hull body x ∈ [poseX − 15, poseX + 15].

describe('stepShell — targeted shell bursts at the clicked point', () => {
  it('flies to the target and bursts exactly there when nothing intercepts', () => {
    const s = gunShell(300);
    const out = stepToOutcome(s, ctx());
    expect(out).toEqual({ kind: 'burst', x: 300, y: 0 });
    expect(s.x).toBe(300); // snapped to the exact target point
    expect(s.y).toBe(0);
  });

  it('STOPS at the target — never overflies it despite range left', () => {
    const s = gunShell(300); // distLeft = GUN_RANGE (650) >> 300
    let out = stepShell(s, ctx());
    while (out.kind === 'travel') {
      expect(s.x).toBeLessThanOrEqual(300);
      out = stepShell(s, ctx());
    }
    expect(out.kind).toBe('burst');
    expect(s.x).toBe(300);
  });

  it('bursts (not splashes) when distLeft exactly equals the target distance', () => {
    const out = stepToOutcome(gunShell(300, { distLeft: 300 }), ctx());
    expect(out.kind).toBe('burst');
  });

  it('a point-less (contact-only) shell sails PAST that same point and splashes at range', () => {
    const s = shell(); // no target, burstRadius 0 — legacy behavior byte-for-byte
    const out = stepToOutcome(s, ctx(), 200);
    expect(out.kind).toBe('expired');
    if (out.kind === 'expired') expect(out.x).toBeCloseTo(GUN_RANGE, 6);
  });
});

describe('stepShell — bodyblock (early interception) vs proximity exception', () => {
  it('an interceptor FAR from the target takes a contact hit — no burst, shell stops', () => {
    const blocker = hullAt(150, 0, Math.PI / 2, 'blocker'); // near side x = 135, target 300
    const out = stepToOutcome(gunShell(300), ctx({ hulls: [blocker] }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') {
      expect(out.victimId).toBe('blocker');
      expect(out.x).toBeLessThan(140); // stopped at the interception, nowhere near the target
    }
  });

  it('an interceptor already INSIDE the would-be blast = full burst, centered on the TARGET', () => {
    // Hull at (310, 0): its near side (x = 295) intercepts the shell early, and
    // the target (300, 0) lies INSIDE the hull → burst membership → full burst.
    const out = stepToOutcome(gunShell(300), ctx({ hulls: [hullAt(310, 0, Math.PI / 2, 'blocker')] }));
    expect(out).toEqual({ kind: 'burst', x: 300, y: 0 }); // NOT the impact point (~293)
  });

  it('an interceptor whose silhouette is within burstRadius of the target (not containing it) also bursts', () => {
    // droneMedium at (260, 16) heading 0: its flat underside (y = 1, x ∈
    // [215, 275]) grazes the shell path (hitRadius 2) → intercepts near
    // x ≈ 213, far from the target — but its bow edge passes ~10.8u from
    // (300, 0), INSIDE the 15u blast, and the target itself is outside the
    // polygon. Blast membership is about the ENTITY, not the impact point.
    const out = stepToOutcome(gunShell(300), ctx({ hulls: [hullAt(260, 16, 0, 'blocker')] }));
    expect(out).toEqual({ kind: 'burst', x: 300, y: 0 });
  });

  it('the SAME grazing shape shifted outside the blast radius takes the contact hit instead', () => {
    // Same construction at (240, 16): closest silhouette point to the target
    // is the bow shoulder region ~18.9u away — outside the 15u blast.
    const out = stepToOutcome(gunShell(300), ctx({ hulls: [hullAt(240, 16, 0, 'blocker')] }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') {
      expect(out.victimId).toBe('blocker');
      expect(out.x).toBeLessThan(260); // stopped at the graze, no burst
    }
  });

  it('the owner hull never intercepts its own targeted shell (permanent immunity)', () => {
    const out = stepToOutcome(gunShell(300), ctx({ hulls: [hullAt(150, 0, Math.PI / 2, 'owner')] }));
    expect(out).toEqual({ kind: 'burst', x: 300, y: 0 });
  });
});

describe('stepShell — island interception of a targeted shell', () => {
  it('an island far from the target stops the shell dead — no damage, no burst', () => {
    const island = { x: 150, y: 0, r: 20 }; // surface 130u from the target
    const out = stepToOutcome(gunShell(300), ctx({ islands: [island] }));
    expect(out.kind).toBe('hitIsland');
    if (out.kind === 'hitIsland') expect(out.x).toBeLessThan(135);
  });

  it('an island whose surface is within burstRadius of the target bursts anyway', () => {
    const island = { x: 280, y: 0, r: 10 }; // surface 10u from (300,0) — inside the 15u blast
    const out = stepToOutcome(gunShell(300), ctx({ islands: [island] }));
    expect(out).toEqual({ kind: 'burst', x: 300, y: 0 });
  });

  it('a target point ON an island bursts on early island contact (plain radius query, no LOS)', () => {
    const island = { x: 300, y: 0, r: 30 }; // the target sits inside the island circle
    const out = stepToOutcome(gunShell(300), ctx({ islands: [island] }));
    expect(out).toEqual({ kind: 'burst', x: 300, y: 0 });
  });
});

describe('burstVictims — blast membership (silhouette within burstRadius, owner excluded)', () => {
  const R = CONFIG.gun.burstRadius;
  const center = { x: 300, y: 0 };

  it('includes hulls containing or grazing the blast, excludes hulls beyond it', () => {
    const inside = hullAt(310, 0, Math.PI / 2, 'inside'); // center lies inside this hull
    const grazing = hullAt(328, 0, Math.PI / 2, 'grazing'); // silhouette 13u away (< 15)
    const outside = hullAt(400, 0, Math.PI / 2, 'outside'); // far beyond the blast
    expect(burstVictims(center, R, [inside, grazing, outside], 'owner')).toEqual([
      'inside',
      'grazing',
    ]);
  });

  it('NEVER includes the owner, even standing on the burst center (owner immunity)', () => {
    const ownHull = hullAt(300, 0, Math.PI / 2, 'owner');
    const enemy = hullAt(310, 0, Math.PI / 2, 'enemy');
    expect(burstVictims(center, R, [ownHull, enemy], 'owner')).toEqual(['enemy']);
  });

  it('radius 0 catches only hulls the center point is actually inside', () => {
    const containing = hullAt(310, 0, Math.PI / 2, 'containing');
    const nearby = hullAt(328, 0, Math.PI / 2, 'nearby'); // 13u away — misses at radius 0
    expect(burstVictims(center, 0, [containing, nearby], 'owner')).toEqual(['containing']);
  });

  it('returns empty over open water', () => {
    expect(burstVictims(center, R, [], 'owner')).toEqual([]);
  });
});
