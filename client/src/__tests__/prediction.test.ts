import { describe, it, expect } from 'vitest';
import { CONFIG, stepShip, type InputMsg, type ShipConfig, type ShipState } from '@salvo/shared';
import {
  Predictor,
  PENDING_CAPACITY,
  HARD_SNAP_U,
  ERROR_DECAY_RATE,
} from '../sim/prediction.js';

const DT = CONFIG.tick.simDtMs / 1000;
const MAP_R = 900;
const CRUISER = CONFIG.shipClasses.cruiser;

function input(seq: number, throttle = 1, rudder = 0): InputMsg {
  return { seq, throttle, rudder, aim: 0, fireSeq: 0, aimDist: 0, weapon: 0 };
}

function kin(s: ShipState) {
  return { x: s.x, y: s.y, heading: s.heading, speed: s.speed };
}

/** Reference "server": shared stepShip with the given class + boundary clamp. */
function serverStep(s: ShipState, inp: InputMsg, cfg: ShipConfig = CRUISER.kinematics): void {
  stepShip(s, inp, cfg, DT);
  const d = Math.hypot(s.x, s.y);
  if (d > MAP_R) {
    const k = MAP_R / d;
    s.x *= k;
    s.y *= k;
    s.speed *= CONFIG.ship.islandSpeedMult;
  }
}

function makeInitialized(spawn: ShipState): Predictor {
  const p = new Predictor({ radius: MAP_R, islands: [] });
  p.onServerState(kin(spawn), 0);
  return p;
}

describe('Predictor replay convergence', () => {
  it('matches a lock-step server exactly (zero error, zero visualError)', () => {
    const spawn: ShipState = { x: 720, y: 0, heading: Math.PI, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = makeInitialized(spawn);

    for (let seq = 1; seq <= 60; seq++) {
      const inp = input(seq, 1, seq % 20 < 10 ? 0.5 : -0.5);
      p.localTick(inp);
      serverStep(server, inp); // server applies the same input this tick
      if (seq % 3 === 0) {
        p.onServerState(kin(server), seq); // reconcile every 3 ticks
        expect(p.visualErrorMagnitude).toBeLessThan(1e-9);
      }
    }
    const pose = p.renderPose(1);
    expect(pose.x).toBeCloseTo(server.x, 9);
    expect(pose.y).toBeCloseTo(server.y, 9);
    expect(pose.heading).toBeCloseTo(server.heading, 9);
  });

  it('converges when the server acks lag several ticks behind', () => {
    const spawn: ShipState = { x: 100, y: 50, heading: 0.3, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = makeInitialized(spawn);
    const script: InputMsg[] = [];

    for (let seq = 1; seq <= 40; seq++) {
      const inp = input(seq, 0.8, 0.2);
      script.push(inp);
      p.localTick(inp);
    }
    // Server has only applied the first 30 inputs so far.
    for (let i = 0; i < 30; i++) serverStep(server, script[i]);
    p.onServerState(kin(server), 30);
    expect(p.pendingCount).toBe(10);
    expect(p.visualErrorMagnitude).toBeLessThan(1e-9);

    // Server catches up; predicted state must equal the full server run.
    for (let i = 30; i < 40; i++) serverStep(server, script[i]);
    p.onServerState(kin(server), 40);
    expect(p.pendingCount).toBe(0);
    expect(p.predicted.x).toBeCloseTo(server.x, 9);
    expect(p.predicted.y).toBeCloseTo(server.y, 9);
  });
});

describe('Predictor ack pruning + ring capacity', () => {
  it('drops inputs at or below ackSeq', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    for (let seq = 1; seq <= 10; seq++) p.localTick(input(seq));
    expect(p.pendingCount).toBe(10);
    p.onServerState(kin(p.predicted), 6);
    expect(p.pendingCount).toBe(4);
  });

  it('caps pending inputs at the ring capacity', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    for (let seq = 1; seq <= PENDING_CAPACITY + 40; seq++) p.localTick(input(seq, 0.1));
    expect(p.pendingCount).toBe(PENDING_CAPACITY);
  });
});

describe('Predictor error absorption', () => {
  it('folds small corrections into visualError so the render pose is continuous', () => {
    const spawn: ShipState = { x: 0, y: 0, heading: 0, speed: 0 };
    const p = makeInitialized(spawn);
    for (let seq = 1; seq <= 5; seq++) p.localTick(input(seq));
    const before = p.renderPose(1);

    // Server disagrees by 5u laterally (all inputs acked, nothing to replay).
    const serverState = { x: p.predicted.x, y: p.predicted.y + 5, heading: 0, speed: p.predicted.speed };
    p.onServerState(serverState, 5);

    // Authoritative state adopted immediately...
    expect(p.predicted.y).toBeCloseTo(serverState.y, 9);
    // ...but the drawn pose has not jumped.
    const after = p.renderPose(1);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(p.visualErrorMagnitude).toBeCloseTo(5, 6);
  });

  it('decays visualError by exp(-12*dt)', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    p.localTick(input(1));
    p.onServerState({ x: p.predicted.x + 3, y: p.predicted.y, heading: 0, speed: p.predicted.speed }, 1);
    const e0 = p.visualErrorMagnitude;
    p.decayError(0.1);
    expect(p.visualErrorMagnitude).toBeCloseTo(e0 * Math.exp(-ERROR_DECAY_RATE * 0.1), 9);
    p.decayError(0.5);
    expect(p.visualErrorMagnitude).toBeLessThan(0.01);
  });

  it('ignores sub-epsilon corrections (no visual churn)', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    p.localTick(input(1));
    const s = p.predicted;
    p.onServerState({ x: s.x + 0.005, y: s.y, heading: s.heading, speed: s.speed }, 1);
    expect(p.visualErrorMagnitude).toBe(0);
  });

  it('hard-snaps beyond 3 ship lengths with no smoothing', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    p.localTick(input(1));
    const target = { x: p.predicted.x + HARD_SNAP_U + 50, y: 0, heading: 1, speed: 0 };
    p.onServerState(target, 1);
    expect(p.visualErrorMagnitude).toBe(0);
    const pose = p.renderPose(1);
    expect(pose.x).toBeCloseTo(target.x, 9);
    expect(pose.heading).toBeCloseTo(1, 9);
  });
});

describe('Predictor boundary clamp (mirror of server world.ts)', () => {
  it('never predicts past the map edge and damps speed there', () => {
    // Start near the edge, full ahead pointing straight out.
    const spawn: ShipState = { x: MAP_R - 10, y: 0, heading: 0, speed: CRUISER.kinematics.maxSpeed };
    const p = makeInitialized(spawn);
    for (let seq = 1; seq <= 40; seq++) p.localTick(input(seq, 1, 0));
    const d = Math.hypot(p.predicted.x, p.predicted.y);
    expect(d).toBeLessThanOrEqual(MAP_R + 1e-9);
    expect(Math.abs(p.predicted.speed)).toBeLessThan(CRUISER.kinematics.maxSpeed);
  });
});

describe('Predictor island collision (shared with server world.ts)', () => {
  it('never predicts inside an island it is driven into', () => {
    const island = { x: 120, y: 0, r: 40 };
    const p = new Predictor({ radius: MAP_R, islands: [island] });
    // Spawn just left of the island, pointed straight at it, full ahead.
    p.onServerState({ x: 40, y: 0, heading: 0, speed: 0 }, 0);
    for (let seq = 1; seq <= 60; seq++) p.localTick(input(seq, 1, 0));
    const s = p.predicted;
    const gap = Math.hypot(s.x - island.x, s.y - island.y);
    // Hull circle radius = beam/2 = 6; must stay outside r + 6, minus float slack.
    expect(gap).toBeGreaterThanOrEqual(island.r + CRUISER.hull.beam / 2 - 1e-6);
  });
});

describe('Predictor with a non-cruiser class config', () => {
  it('replays against a destroyer-stepped server exactly', () => {
    const DD = CONFIG.shipClasses.destroyer;
    const spawn: ShipState = { x: 0, y: 0, heading: 0.2, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = new Predictor({ radius: MAP_R, islands: [] }, DD.kinematics, DD.hull.beam / 2);
    p.onServerState(kin(spawn), 0);
    for (let seq = 1; seq <= 40; seq++) {
      const inp = input(seq, 1, seq % 10 < 5 ? 0.6 : -0.6);
      p.localTick(inp);
      serverStep(server, inp, DD.kinematics);
      if (seq % 4 === 0) p.onServerState(kin(server), seq);
    }
    expect(p.predicted.x).toBeCloseTo(server.x, 6);
    expect(p.predicted.y).toBeCloseTo(server.y, 6);
    expect(p.predicted.heading).toBeCloseTo(server.heading, 6);
  });
});

describe('Predictor stats swap mid-flight (upgrade grant)', () => {
  it('adopts upgraded maxSpeed kinematics and stays bounded against the server', () => {
    // Same pattern as the class-swap seam: an in-match maxSpeed grant calls
    // setClassConfig with the EFFECTIVE kinematics (collision radius stays
    // class-based). forceSnap re-inits from the next server state; from there
    // the replay must track a server stepping the upgraded config exactly.
    const MULT = 1.08 ** 2; // two maxSpeed stacks
    const upgraded: ShipConfig = {
      ...CRUISER.kinematics,
      maxSpeed: CRUISER.kinematics.maxSpeed * MULT,
      reverseSpeed: CRUISER.kinematics.reverseSpeed * MULT,
    };
    const spawn: ShipState = { x: 200, y: -100, heading: 0.4, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = makeInitialized(spawn);

    // Cruise 20 ticks at the base config, reconciling along the way.
    for (let seq = 1; seq <= 20; seq++) {
      const inp = input(seq, 1, 0.2);
      p.localTick(inp);
      serverStep(server, inp);
      if (seq % 4 === 0) p.onServerState(kin(server), seq);
    }

    // The grant lands: both sides swap to the upgraded kinematics.
    p.setClassConfig(upgraded, CRUISER.hull.beam / 2);
    expect(p.isInitialized).toBe(false); // forceSnap: re-init from next frame
    p.onServerState(kin(server), 20);
    expect(p.isInitialized).toBe(true);

    for (let seq = 21; seq <= 160; seq++) {
      const inp = input(seq, 1, seq % 10 < 5 ? 0.4 : -0.4);
      p.localTick(inp);
      serverStep(server, inp, upgraded);
      if (seq % 4 === 0) {
        p.onServerState(kin(server), seq);
        expect(p.visualErrorMagnitude).toBeLessThan(1e-9); // lock-step, no drift
      }
    }
    expect(p.predicted.x).toBeCloseTo(server.x, 9);
    expect(p.predicted.y).toBeCloseTo(server.y, 9);
    // The upgraded top speed was actually reached (the swap took effect).
    expect(p.predicted.speed).toBeCloseTo(upgraded.maxSpeed, 6);
    expect(p.predicted.speed).toBeGreaterThan(CRUISER.kinematics.maxSpeed);
  });
});

describe('Predictor lifecycle', () => {
  it('is uninitialized until the first server state, and after forceSnap', () => {
    const p = new Predictor({ radius: MAP_R, islands: [] });
    expect(p.isInitialized).toBe(false);
    p.localTick(input(1)); // ignored pre-init
    expect(p.pendingCount).toBe(0);
    p.onServerState({ x: 1, y: 2, heading: 0, speed: 0 }, 0);
    expect(p.isInitialized).toBe(true);
    p.forceSnap();
    expect(p.isInitialized).toBe(false);
    expect(p.pendingCount).toBe(0);
  });
});
