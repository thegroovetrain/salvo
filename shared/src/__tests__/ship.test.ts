import { describe, it, expect } from 'vitest';
import { stepShip, approach, type ShipState, type ShipInput } from '../sim/ship.js';
import { CONFIG } from '../constants.js';

const cfg = CONFIG.shipClasses.cruiser.kinematics;
const DT = CONFIG.tick.simDtMs / 1000; // 0.05s

function fresh(over: Partial<ShipState> = {}): ShipState {
  return { x: 0, y: 0, heading: 0, speed: 0, ...over };
}

const AHEAD: ShipInput = { throttle: 1, rudder: 0 };
const NEUTRAL: ShipInput = { throttle: 0, rudder: 0 };

describe('approach', () => {
  it('uses accel when growing speed and decel when braking', () => {
    // 0 -> +10 with accel 2: one 1s step advances by 2
    expect(approach(0, 10, 2, 8, 1)).toBeCloseTo(2);
    // 10 -> 0 with decel 8: one 1s step brakes by 8
    expect(approach(10, 0, 2, 8, 1)).toBeCloseTo(2);
  });

  it('snaps to the target when within one step', () => {
    expect(approach(9.5, 10, 2, 8, 1)).toBe(10);
  });
});

describe('stepShip', () => {
  it('accelerates toward max speed and clamps there', () => {
    const s = fresh();
    for (let i = 0; i < 400; i++) {
      stepShip(s, AHEAD, cfg, DT);
      expect(s.speed).toBeLessThanOrEqual(cfg.maxSpeed + 1e-9);
    }
    expect(s.speed).toBeCloseTo(cfg.maxSpeed);
  });

  it('does not turn at a standstill', () => {
    const s = fresh();
    stepShip(s, { throttle: 0, rudder: 1 }, cfg, DT);
    expect(s.heading).toBeCloseTo(0);
    expect(s.speed).toBeCloseTo(0);
  });

  it('applies full rudder authority above steerage speed', () => {
    const s = fresh({ speed: cfg.maxSpeed }); // well above steerageSpeed
    stepShip(s, { throttle: 1, rudder: 1 }, cfg, DT);
    expect(s.heading).toBeCloseTo(cfg.turnRate * DT); // authority == 1
  });

  it('reverses steering sign when moving astern', () => {
    const fwd = fresh({ speed: cfg.maxSpeed });
    stepShip(fwd, { throttle: 1, rudder: 1 }, cfg, DT);
    const rev = fresh({ speed: -cfg.reverseSpeed });
    stepShip(rev, { throttle: -1, rudder: 1 }, cfg, DT);
    expect(fwd.heading).toBeGreaterThan(0);
    expect(rev.heading).toBeLessThan(0);
  });

  it('keeps heading wrapped in [-pi, pi)', () => {
    const s = fresh({ speed: cfg.maxSpeed });
    for (let i = 0; i < 400; i++) {
      stepShip(s, { throttle: 1, rudder: 1 }, cfg, DT);
      expect(s.heading).toBeGreaterThanOrEqual(-Math.PI);
      expect(s.heading).toBeLessThan(Math.PI);
    }
  });

  it('is deterministic across identical runs', () => {
    const inputs: ShipInput[] = [
      { throttle: 1, rudder: 0.5 },
      { throttle: 0.3, rudder: -1 },
      { throttle: -1, rudder: 0.2 },
      NEUTRAL,
    ];
    const run = (): ShipState => {
      const s = fresh();
      for (let i = 0; i < 100; i++) stepShip(s, inputs[i % inputs.length], cfg, DT);
      return s;
    };
    expect(run()).toEqual(run());
  });

  it('decelerates faster than it accelerates (decel > accel)', () => {
    const up = fresh();
    stepShip(up, AHEAD, cfg, DT);
    const down = fresh({ speed: cfg.maxSpeed });
    stepShip(down, NEUTRAL, cfg, DT);
    const gained = up.speed - 0;
    const lost = cfg.maxSpeed - down.speed;
    expect(lost).toBeGreaterThan(gained);
  });
});
