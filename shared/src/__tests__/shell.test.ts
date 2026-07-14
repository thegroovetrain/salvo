import { describe, it, expect } from 'vitest';
import { stepShell, hullEndpoints, type ShellState, type HullTarget, type ShellContext } from '../sim/shell.js';
import { CONFIG } from '../constants.js';

const DT = CONFIG.tick.simDtMs / 1000;

// Large map so existing edge-agnostic cases are never terminated by the edge.
const BIG_R = 100000;

/** Build a ShellContext, defaulting to an empty, effectively-boundless world. */
function ctx(o: Partial<ShellContext> = {}): ShellContext {
  return { islands: [], hulls: [] as HullTarget[], now: 1000, dt: DT, mapRadius: BIG_R, ...o };
}

function shell(overrides: Partial<ShellState> = {}): ShellState {
  return {
    id: 's1',
    ownerId: 'owner',
    x: 0,
    y: 0,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: CONFIG.gun.shellRange,
    bornAt: 0,
    kind: 'shell',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    graceMs: CONFIG.gun.selfHitGrace,
    ...overrides,
  };
}

describe('stepShell — travel + range', () => {
  it('advances along its velocity and consumes range', () => {
    const s = shell();
    const out = stepShell(s, ctx());
    expect(out.kind).toBe('travel');
    expect(s.x).toBeCloseTo(CONFIG.gun.shellSpeed * DT, 9);
    expect(s.distLeft).toBeCloseTo(CONFIG.gun.shellRange - CONFIG.gun.shellSpeed * DT, 6);
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

describe('stepShell — swept hull collision', () => {
  const target = (): HullTarget => {
    const h = hullEndpoints(10, 0, Math.PI / 2); // hull broadside across the shell path
    h.id = 'victim';
    return h;
  };

  it('hits a hull the shell sweeps into this tick', () => {
    const s = shell({ x: 6 }); // just short of the hull at x=10
    const out = stepShell(s, ctx({ hulls: [target()] }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('victim');
  });

  it('does not tunnel through a hull at max closing speed', () => {
    // Shell placed so a full max-speed tick would straddle the hull.
    const travel = CONFIG.gun.shellSpeed * DT;
    const s = shell({ x: 10 - travel * 0.5 });
    const out = stepShell(s, ctx({ hulls: [target()] }));
    expect(out.kind).toBe('hitShip');
  });
});

describe('stepShell — owner self-hit grace', () => {
  function ownerHull(): HullTarget {
    const h = hullEndpoints(6, 0, Math.PI / 2);
    h.id = 'owner';
    return h;
  }

  it('cannot hit its firer within the grace window', () => {
    const s = shell({ bornAt: 0 });
    const out = stepShell(s, ctx({ hulls: [ownerHull()], now: CONFIG.gun.selfHitGrace - 1 }));
    expect(out.kind).toBe('travel');
  });

  it('can hit the (former) firer once grace has elapsed', () => {
    const s = shell({ bornAt: 0 });
    const out = stepShell(s, ctx({ hulls: [ownerHull()], now: CONFIG.gun.selfHitGrace + 1 }));
    expect(out.kind).toBe('hitShip');
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
    const h = hullEndpoints(8, 0, Math.PI / 2); // broadside across the run
    h.id = 'victim';
    const out = stepShell(torp({ x: 4 }), ctx({ hulls: [h], dt: TORP_DT }));
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('victim');
  });

  it('respects a custom self-hit grace independent of the gun default', () => {
    const h = hullEndpoints(6, 0, Math.PI / 2);
    h.id = 'owner';
    const graced = torp({ bornAt: 0, graceMs: 500 });
    // Gun grace (100ms) has elapsed at t=200, but this torp's 500ms has not.
    const out = stepShell(graced, ctx({ hulls: [h], now: 200, dt: TORP_DT }));
    expect(out.kind).toBe('travel');
  });

  it('an infinite-range torpedo flies well past the old 700u before hitting a hull', () => {
    const farX = 1200; // beyond the retired 700u torpedo range
    const h = hullEndpoints(farX, 0, Math.PI / 2);
    h.id = 'victim';
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

describe('hullEndpoints — per-class hull dims', () => {
  it('defaults to the cruiser hull (radius = beam/2, axis = length−beam)', () => {
    const cruiser = CONFIG.shipClasses.cruiser.hull;
    const h = hullEndpoints(0, 0, 0);
    expect(h.radius).toBeCloseTo(cruiser.beam / 2, 9);
    expect(Math.hypot(h.bow.x - h.stern.x, h.bow.y - h.stern.y)).toBeCloseTo(
      cruiser.length - cruiser.beam,
      9,
    );
  });

  it('uses a passed hull for radius + axis (proves per-hull threshold)', () => {
    const big = { length: 60, beam: 20 };
    const h = hullEndpoints(0, 0, 0, big);
    expect(h.radius).toBeCloseTo(10, 9); // beam/2
    expect(Math.hypot(h.bow.x - h.stern.x, h.bow.y - h.stern.y)).toBeCloseTo(40, 9); // length−beam

    // A shell grazing at radius+hitRadius still hits the wider hull. The big
    // hull's capsule radius is 10; a cruiser-radius (6) hull would miss here.
    h.id = 'big';
    const graze = 10 + CONFIG.gun.shellRadius - 0.5; // just inside the wide threshold
    const s = shell({ x: -1, y: graze, vx: CONFIG.gun.shellSpeed, vy: 0 });
    const out = stepShell(s, ctx({ hulls: [h] }));
    expect(out.kind).toBe('hitShip');
  });
});

describe('stepShell — earliest hit wins', () => {
  it('an island in front of a hull resolves as the island', () => {
    const island = { x: 4, y: 0, r: 2 };
    const h = hullEndpoints(10, 0, Math.PI / 2);
    h.id = 'victim';
    const s = shell({ x: 0 });
    // Move until something resolves.
    let out = stepShell(s, ctx({ islands: [island], hulls: [h] }));
    while (out.kind === 'travel') out = stepShell(s, ctx({ islands: [island], hulls: [h] }));
    expect(out.kind).toBe('hitIsland');
  });
});
