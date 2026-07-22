import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  boostedKinematics,
  hullSilhouette,
  resolveShipPose,
  stepShip,
  transformPolygon,
  type InputMsg,
  type Pose,
  type ShipConfig,
  type ShipState,
} from '@salvo/shared';
import {
  Predictor,
  PENDING_CAPACITY,
  HARD_SNAP_U,
  ERROR_DECAY_RATE,
} from '../sim/prediction.js';

const DT = CONFIG.tick.simDtMs / 1000;
const MAP_R = 900;
// The default class the Predictor seeds (torpedoBoat) — reference server steps
// must use the same kinematics + silhouette to stay lock-step.
const TB = CONFIG.shipClasses.torpedoBoat;
const TB_POLY = hullSilhouette('torpedoBoat');

function input(seq: number, throttle = 1, rudder = 0, actSeq = 0): InputMsg {
  return { seq, throttle, rudder, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq, actSlot: actSeq > 0 ? 2 : 0 };
}

function kin(s: ShipState) {
  return { x: s.x, y: s.y, heading: s.heading, speed: s.speed };
}

/** Reference "server": shared stepShip with the given class + boundary clamp. */
function serverStep(s: ShipState, inp: InputMsg, cfg: ShipConfig = TB.kinematics): void {
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
      p.localTick(inp, 0);
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
      p.localTick(inp, 0);
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
    for (let seq = 1; seq <= 10; seq++) p.localTick(input(seq), 0);
    expect(p.pendingCount).toBe(10);
    p.onServerState(kin(p.predicted), 6);
    expect(p.pendingCount).toBe(4);
  });

  it('caps pending inputs at the ring capacity', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    for (let seq = 1; seq <= PENDING_CAPACITY + 40; seq++) p.localTick(input(seq, 0.1), 0);
    expect(p.pendingCount).toBe(PENDING_CAPACITY);
  });
});

describe('Predictor error absorption', () => {
  it('folds small corrections into visualError so the render pose is continuous', () => {
    const spawn: ShipState = { x: 0, y: 0, heading: 0, speed: 0 };
    const p = makeInitialized(spawn);
    for (let seq = 1; seq <= 5; seq++) p.localTick(input(seq), 0);
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
    p.localTick(input(1), 0);
    p.onServerState({ x: p.predicted.x + 3, y: p.predicted.y, heading: 0, speed: p.predicted.speed }, 1);
    const e0 = p.visualErrorMagnitude;
    p.decayError(0.1);
    expect(p.visualErrorMagnitude).toBeCloseTo(e0 * Math.exp(-ERROR_DECAY_RATE * 0.1), 9);
    p.decayError(0.5);
    expect(p.visualErrorMagnitude).toBeLessThan(0.01);
  });

  it('ignores sub-epsilon corrections (no visual churn)', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    p.localTick(input(1), 0);
    const s = p.predicted;
    p.onServerState({ x: s.x + 0.005, y: s.y, heading: s.heading, speed: s.speed }, 1);
    expect(p.visualErrorMagnitude).toBe(0);
  });

  it('hard-snaps beyond 3 ship lengths with no smoothing', () => {
    const p = makeInitialized({ x: 0, y: 0, heading: 0, speed: 0 });
    p.localTick(input(1), 0);
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
    const spawn: ShipState = { x: MAP_R - 10, y: 0, heading: 0, speed: TB.kinematics.maxSpeed };
    const p = makeInitialized(spawn);
    for (let seq = 1; seq <= 40; seq++) p.localTick(input(seq, 1, 0), 0);
    const d = Math.hypot(p.predicted.x, p.predicted.y);
    expect(d).toBeLessThanOrEqual(MAP_R + 1e-9);
    expect(Math.abs(p.predicted.speed)).toBeLessThan(TB.kinematics.maxSpeed);
  });
});

/** Min distance from a posed hull polygon to an island center (negative when
 *  a vertex is inside the circle) — proves the resolved hull is overlap-free. */
function hullClearance(s: ShipState, poly: readonly { x: number; y: number }[], isle: { x: number; y: number; r: number }): number {
  const world = transformPolygon(poly, s.x, s.y, s.heading);
  let min = Infinity;
  for (const v of world) min = Math.min(min, Math.hypot(v.x - isle.x, v.y - isle.y) - isle.r);
  return min;
}

describe('Predictor island collision (polygon parity with shared collision)', () => {
  it('matches a server running the SAME resolveShipPose on an island graze', () => {
    // A parity proof: the predictor uses the shared pose-validity rollback. A
    // reference "server" runs the identical shared function with identical
    // arguments (prev pose + poly + map radius) and the same single contact
    // damp; reconciling only every 3 ticks forces the predictor's own localTick
    // collision + replay to agree with the server tick-for-tick, which can only
    // hold if both call the same polygon code.
    const island = { x: 120, y: 6, r: 40 };
    const p = new Predictor({ radius: MAP_R, islands: [island] });
    const server: ShipState = { x: 40, y: 0, heading: 0, speed: 0 };
    p.onServerState(kin(server), 0);
    let grazed = false;
    for (let seq = 1; seq <= 80; seq++) {
      const inp = input(seq, 1, 0.15); // curve past / into the island
      p.localTick(inp, 0);
      const prev: Pose = { x: server.x, y: server.y, heading: server.heading };
      stepShip(server, inp, TB.kinematics, DT);
      const { contact } = resolveShipPose(prev, server, [island], MAP_R, TB_POLY);
      if (contact) server.speed *= CONFIG.ship.islandSpeedMult;
      if (seq % 3 === 0) p.onServerState(kin(server), seq);
      if (hullClearance(server, TB_POLY, island) < 1) grazed = true;
    }
    // Predictor tracks the polygon-collided server exactly (parity by construction).
    expect(p.predicted.x).toBeCloseTo(server.x, 9);
    expect(p.predicted.y).toBeCloseTo(server.y, 9);
    expect(p.predicted.heading).toBeCloseTo(server.heading, 9);
    // The path actually engaged the island (non-trivial test)...
    expect(grazed).toBe(true);
    // ...and the predicted hull ends overlap-free (no vertex inside the circle).
    expect(hullClearance(p.predicted, TB_POLY, island)).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('Predictor with a non-default class config', () => {
  it('replays against a battleship-stepped server exactly', () => {
    const BB = CONFIG.shipClasses.battleship;
    const spawn: ShipState = { x: 0, y: 0, heading: 0.2, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = new Predictor({ radius: MAP_R, islands: [] }, BB.kinematics, hullSilhouette('battleship'));
    p.onServerState(kin(spawn), 0);
    for (let seq = 1; seq <= 40; seq++) {
      const inp = input(seq, 1, seq % 10 < 5 ? 0.6 : -0.6);
      p.localTick(inp, 0);
      serverStep(server, inp, BB.kinematics);
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
      ...TB.kinematics,
      maxSpeed: TB.kinematics.maxSpeed * MULT,
      reverseSpeed: TB.kinematics.reverseSpeed * MULT,
    };
    const spawn: ShipState = { x: 200, y: -100, heading: 0.4, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = makeInitialized(spawn);

    // Cruise 20 ticks at the base config, reconciling along the way.
    for (let seq = 1; seq <= 20; seq++) {
      const inp = input(seq, 1, 0.2);
      p.localTick(inp, 0);
      serverStep(server, inp);
      if (seq % 4 === 0) p.onServerState(kin(server), seq);
    }

    // The grant lands: both sides swap to the upgraded kinematics. Grants do
    // NOT snap — the ring is kept and replayed under the new config.
    p.setClassConfig(upgraded, TB_POLY, false);
    expect(p.isInitialized).toBe(true); // no forceSnap on a grant
    p.onServerState(kin(server), 20);
    expect(p.isInitialized).toBe(true);

    for (let seq = 21; seq <= 160; seq++) {
      const inp = input(seq, 1, seq % 10 < 5 ? 0.4 : -0.4);
      p.localTick(inp, 0);
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
    expect(p.predicted.speed).toBeGreaterThan(TB.kinematics.maxSpeed);
  });

  it('a non-kinematics grant never moves the predicted pose (no kill-frame hop)', () => {
    // Gate-2 regression: every grant used to forceSnap, wiping the pending
    // ring so the next reconcile adopted the raw server pose — a backward hop
    // by the full RTT lead on every kill. A grant that doesn't change the
    // kinematics must leave prediction byte-identical to a control predictor.
    const spawn: ShipState = { x: 200, y: -100, heading: 0.4, speed: 0 };
    const server: ShipState = { ...spawn };
    const p = makeInitialized(spawn);
    const control = makeInitialized(spawn);

    // 20 ticks; ack only up to seq 16 so four inputs stay pending (RTT lead).
    for (let seq = 1; seq <= 20; seq++) {
      const inp = input(seq, 1, 0.2);
      p.localTick(inp, 0);
      control.localTick(inp, 0);
      serverStep(server, inp);
      if (seq === 16) {
        p.onServerState(kin(server), seq);
        control.onServerState(kin(server), seq);
      }
    }
    const ack16 = kin(server); // stale-by-4 server state, as a real frame would be
    expect(p.pendingCount).toBeGreaterThan(0);

    // e.g. a gunReload grant: same kinematics object semantics, snap=false.
    p.setClassConfig({ ...TB.kinematics }, TB_POLY, false);
    expect(p.isInitialized).toBe(true);
    expect(p.pendingCount).toBe(control.pendingCount); // ring survives the grant

    p.onServerState(ack16, 16);
    control.onServerState(ack16, 16);
    expect(p.predicted.x).toBeCloseTo(control.predicted.x, 9); // no hop
    expect(p.predicted.y).toBeCloseTo(control.predicted.y, 9);
    expect(p.visualErrorMagnitude).toBeCloseTo(control.visualErrorMagnitude, 9);
  });
});

describe('Predictor lifecycle', () => {
  it('is uninitialized until the first server state, and after forceSnap', () => {
    const p = new Predictor({ radius: MAP_R, islands: [] });
    expect(p.isInitialized).toBe(false);
    p.localTick(input(1), 0); // ignored pre-init
    expect(p.pendingCount).toBe(0);
    p.onServerState({ x: 1, y: 2, heading: 0, speed: 0 }, 0);
    expect(p.isInitialized).toBe(true);
    p.forceSnap();
    expect(p.isInitialized).toBe(false);
    expect(p.pendingCount).toBe(0);
  });
});

// --- Story 1.6: speed boost — per-tick parity with the server's boostedKinematics gate ---

describe('Predictor speed boost (Story 1.6)', () => {
  const BOOST = CONFIG.speedBoost;
  const T0 = 500_000; // arbitrary server-clock anchor (ms)
  const tickT = (seq: number): number => T0 + seq * CONFIG.tick.simDtMs;

  /** Reference server tick: the IDENTICAL per-tick rule world.stepShips applies —
   *  boostedKinematics(kin, bonus, now < boostUntil), the one shared speed mutator. */
  function serverBoostStep(s: ShipState, inp: InputMsg, t: number, boostUntil: number): void {
    stepShip(s, inp, boostedKinematics(TB.kinematics, BOOST.speedBonus, t < boostUntil), DT);
  }

  it('raises the cap for exactly the in-window ticks; replay across lagged reconciles (incl. expiry mid-replay) matches an uninterrupted sim; expiry decays at class decel', () => {
    // Window opens at T0 (the first frame already carries boostUntil), so every
    // tick with t < boostUntil steps boosted; expiry falls mid-run and the
    // lagged acks force the expiry edge THROUGH replayFrom repeatedly.
    const boostUntil = T0 + BOOST.durationMs;
    const spawn: ShipState = { x: 0, y: 0, heading: 0, speed: TB.kinematics.maxSpeed }; // cruising at base cap
    const server: ShipState = { ...spawn };
    const history: ShipState[] = [{ ...spawn }]; // server state after applying seq i
    const p = new Predictor({ radius: MAP_R, islands: [] });
    p.onServerState({ ...kin(spawn), boostUntil }, 0);

    const expirySeq = BOOST.durationMs / CONFIG.tick.simDtMs; // first tick at t === boostUntil (unboosted)
    let peak = 0;
    const total = expirySeq + 40; // window + 2s of decay
    for (let seq = 1; seq <= total; seq++) {
      const inp = input(seq, 1, 0);
      p.localTick(inp, tickT(seq));
      serverBoostStep(server, inp, tickT(seq), boostUntil);
      history[seq] = { ...server };
      peak = Math.max(peak, server.speed);
      if (seq % 3 === 0 && seq > 4) {
        // Ack lags 4 ticks: replayFrom must re-make the per-tick boost
        // decisions (including the expiry edge) from each tick's OWN time.
        p.onServerState({ ...kin(history[seq - 4]), boostUntil }, seq - 4);
        expect(p.visualErrorMagnitude).toBeLessThan(1e-9);
      }
      if (seq === expirySeq) {
        // The first tick at t === boostUntil is already OUT of the window
        // (strict t < boostUntil): the cap is base again and the hull sheds
        // speed at the CLASS decel (stepShip's own braking — no special decay).
        const expected = TB.kinematics.maxSpeed + BOOST.speedBonus - TB.kinematics.decel * DT;
        expect(p.predicted.speed).toBeCloseTo(expected, 9);
      }
    }
    expect(peak).toBeCloseTo(TB.kinematics.maxSpeed + BOOST.speedBonus, 6); // the boosted cap was reached
    expect(p.predicted.speed).toBeCloseTo(TB.kinematics.maxSpeed, 6); // and decayed back to base
    expect(p.predicted.x).toBeCloseTo(server.x, 9); // full-run positional parity
  });

  it('press tick steps UNBOOSTED; the optimistic window opens one tick later, and the authoritative window takes over seamlessly on ack', () => {
    // Server truth (pinned): activationControl runs AFTER stepShips, so the
    // tick that consumes the actSeq advance moves at the BASE cap and
    // boostUntil lands one sim tick past the client's press estimate.
    const spawn: ShipState = { x: 0, y: 0, heading: 0.3, speed: TB.kinematics.maxSpeed };
    const server: ShipState = { ...spawn };
    const history: ShipState[] = [{ ...spawn }];
    const p = new Predictor({ radius: MAP_R, islands: [] });
    p.onServerState(kin(spawn), 0); // no boostUntil — inactive

    // 10 plain ticks before the press (actSeq 0), cruising at the base cap.
    for (let seq = 1; seq <= 10; seq++) {
      const inp = input(seq, 1, 0.2);
      p.localTick(inp, tickT(seq));
      serverBoostStep(server, inp, tickT(seq), 0);
      history[seq] = { ...server };
    }

    // The press lands between ticks 10 and 11 (predicted-ready). The server
    // consumes the actSeq advance at tick 11: that tick steps UNBOOSTED, then
    // activation opens the window — boostUntil = tick-11 time + duration,
    // exactly the client's press estimate shifted by one sim tick.
    const pressT = tickT(10);
    const boostUntil = tickT(11) + BOOST.durationMs;
    p.predictBoostActivation(pressT, 1);
    expect(p.boostUntilEstimate).toBe(boostUntil); // window shifted one tick past the press

    for (let seq = 11; seq <= 60; seq++) {
      const inp = input(seq, 1, 0.2, 1); // carries actSeq 1 from the press on
      p.localTick(inp, tickT(seq));
      // Server: tick 11 steps BEFORE activation applies (window not yet open).
      serverBoostStep(server, inp, tickT(seq), seq === 11 ? 0 : boostUntil);
      history[seq] = { ...server };
      if (seq === 11) {
        // PIN the press-tick semantics: the press input's tick never boosts —
        // on either side. Both hulls are still capped at base max speed.
        expect(p.predicted.speed).toBeCloseTo(TB.kinematics.maxSpeed, 9);
        expect(server.speed).toBeCloseTo(TB.kinematics.maxSpeed, 9);
      }
      if (seq === 12) expect(p.predicted.speed).toBeGreaterThan(TB.kinematics.maxSpeed); // window open
    }

    // Reconcile with an ack BEFORE the press input: the frame honestly says
    // boostUntil 0, but the optimistic window must reproduce the exact ticks —
    // 10 and the press tick 11 unboosted, 12+ boosted.
    p.onServerState({ ...kin(history[9]), boostUntil: 0 }, 9);
    expect(p.visualErrorMagnitude).toBeLessThan(1e-9);
    expect(p.boostUntilEstimate).toBe(boostUntil); // still the optimistic estimate

    // Ack PAST the press: the optimistic estimate is dropped and the
    // authoritative you.boostUntil governs — replay stays byte-identical.
    p.onServerState({ ...kin(history[20]), boostUntil }, 20);
    expect(p.visualErrorMagnitude).toBeLessThan(1e-9);
    expect(p.boostUntilEstimate).toBe(boostUntil); // now the authoritative value
    expect(p.predicted.x).toBeCloseTo(server.x, 9);
    expect(p.predicted.speed).toBeGreaterThan(TB.kinematics.maxSpeed); // genuinely boosted
  });

  it('a second press while an optimistic window is pending is IGNORED (no over-extension within RTT)', () => {
    const p = new Predictor({ radius: MAP_R, islands: [] });
    p.onServerState({ x: 0, y: 0, heading: 0, speed: 0 }, 0);
    p.predictBoostActivation(tickT(0), 1);
    const first = p.boostUntilEstimate;
    p.predictBoostActivation(tickT(40), 2); // stale-ammo double press within RTT
    expect(p.boostUntilEstimate).toBe(first); // the pending window is never overwritten or extended
  });

  it('a denied press (server never activates) reconciles back to unboosted truth through the normal error path', () => {
    const spawn: ShipState = { x: 0, y: 0, heading: 0, speed: TB.kinematics.maxSpeed };
    const server: ShipState = { ...spawn };
    const p = new Predictor({ radius: MAP_R, islands: [] });
    p.onServerState(kin(spawn), 0);
    p.predictBoostActivation(tickT(0), 1); // optimistic — but the server will deny (e.g. cooling)
    for (let seq = 1; seq <= 20; seq++) {
      const inp = input(seq, 1, 0, 1);
      p.localTick(inp, tickT(seq)); // locally boosted (optimistic)
      serverBoostStep(server, inp, tickT(seq), 0); // server: never activated
    }
    // The ack covers the press: optimistic drops, auth stays 0, and the replay
    // folds the over-predicted speed into the standard reconcile machinery.
    p.onServerState(kin(server), 20);
    expect(p.boostUntilEstimate).toBe(0);
    expect(p.predicted.speed).toBeCloseTo(server.speed, 9); // truth adopted immediately
  });
});
