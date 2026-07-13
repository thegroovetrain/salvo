import { describe, it, expect } from 'vitest';
import { stepShell, hullEndpoints, type ShellState, type HullTarget } from '../sim/shell.js';
import { CONFIG } from '../constants.js';

const DT = CONFIG.tick.simDtMs / 1000;

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
    ...overrides,
  };
}

const NO_WORLD = { islands: [], hulls: [] as HullTarget[], now: 1000, dt: DT };

describe('stepShell — travel + range', () => {
  it('advances along its velocity and consumes range', () => {
    const s = shell();
    const out = stepShell(s, NO_WORLD);
    expect(out.kind).toBe('travel');
    expect(s.x).toBeCloseTo(CONFIG.gun.shellSpeed * DT, 9);
    expect(s.distLeft).toBeCloseTo(CONFIG.gun.shellRange - CONFIG.gun.shellSpeed * DT, 6);
  });

  it('expires (splash) when it runs out of range', () => {
    const s = shell({ distLeft: 2 }); // less than one tick of travel
    const out = stepShell(s, NO_WORLD);
    expect(out.kind).toBe('expired');
    if (out.kind === 'expired') expect(out.x).toBeCloseTo(2, 6); // splashed at range end
    expect(s.distLeft).toBeLessThanOrEqual(0);
  });
});

describe('stepShell — swept island collision (no tunnel at max speed)', () => {
  it('detects the thinnest island straight ahead even at max shell speed', () => {
    const island = { x: 5, y: 0, r: 25 }; // thin island
    const s = shell();
    let out = stepShell(s, { islands: [island], hulls: [], now: 1000, dt: DT });
    // Within a couple ticks it must register a hit (never sail through).
    let ticks = 1;
    while (out.kind === 'travel' && ticks < 20) {
      out = stepShell(s, { islands: [island], hulls: [], now: 1000, dt: DT });
      ticks++;
    }
    expect(out.kind).toBe('hitIsland');
  });

  it('a fast shell cannot skip a thin island in a single tick', () => {
    // Position the island one tick's travel ahead; a swept test catches it.
    const travel = CONFIG.gun.shellSpeed * DT;
    const island = { x: travel * 0.5, y: 0, r: 25 };
    const s = shell();
    const out = stepShell(s, { islands: [island], hulls: [], now: 1000, dt: DT });
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
    const out = stepShell(s, { islands: [], hulls: [target()], now: 1000, dt: DT });
    expect(out.kind).toBe('hitShip');
    if (out.kind === 'hitShip') expect(out.victimId).toBe('victim');
  });

  it('does not tunnel through a hull at max closing speed', () => {
    // Shell placed so a full max-speed tick would straddle the hull.
    const travel = CONFIG.gun.shellSpeed * DT;
    const s = shell({ x: 10 - travel * 0.5 });
    const out = stepShell(s, { islands: [], hulls: [target()], now: 1000, dt: DT });
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
    const out = stepShell(s, { islands: [], hulls: [ownerHull()], now: CONFIG.gun.selfHitGrace - 1, dt: DT });
    expect(out.kind).toBe('travel');
  });

  it('can hit the (former) firer once grace has elapsed', () => {
    const s = shell({ bornAt: 0 });
    const out = stepShell(s, { islands: [], hulls: [ownerHull()], now: CONFIG.gun.selfHitGrace + 1, dt: DT });
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
    let out = stepShell(s, { islands: [island], hulls: [h], now: 1000, dt: DT });
    while (out.kind === 'travel') out = stepShell(s, { islands: [island], hulls: [h], now: 1000, dt: DT });
    expect(out.kind).toBe('hitIsland');
  });
});
