// Story 10.6 — the own torpedo launchers' predict-and-correct (the battery's
// contract, sim/ownBattery.ts): the client steps its launchers with the SAME
// shared stepper the server runs toward the same aim point, overwrites them
// from every own frame (`you.launchers`), keeps an un-acked predicted fire
// through a stale frame, and reads the click verdict off the shared R16 pick:
// out-of-arc / cooling / fire, one click one torpedo.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  initialLaunchers,
  launcherAimPoint,
  pickTube,
  stepLaunchers,
  type AimPose,
  type LauncherState,
} from '@salvo/shared';
import { OwnLaunchers } from '../sim/ownLaunchers.js';
import { PENDING_CAPACITY } from '../sim/prediction.js';
import { predictTorpedoClick, stepOwnLaunchers, torpedoClickPrediction } from '../sim/ownLaunchersTick.js';

const DT = CONFIG.tick.simDtMs;
const HULL = DEFAULT_CLASS_ID;
const POSE: AimPose = { x: 0, y: 0, heading: 0 };
const AIM_DIST = 600;
/** Dead ahead, the starboard beam, dead astern (world bearings at heading 0). */
const AHEAD = 0;
const BEAM = Math.PI / 2;
const ASTERN = Math.PI;
const FORE_ONLY = { torpedoLaunchers: 1, tubesPerLauncher: 1 };
const BOTH_TWO = { torpedoLaunchers: 2, tubesPerLauncher: 2 };

/** A model corrected onto the wire launchers of `counts`. */
function seeded(counts = FORE_ONLY, ack = 0): OwnLaunchers {
  const l = new OwnLaunchers(HULL);
  l.correct({ cls: HULL, launchers: initialLaunchers(HULL, counts) }, ack);
  return l;
}

/** Step until the launchers have settled on the aim (they traverse at 90°/s). */
function settle(l: OwnLaunchers, aim: number): void {
  for (let i = 0; i < 80; i++) l.step(POSE, aim, AIM_DIST, DT);
}

describe('OwnLaunchers — the wire defines what is held', () => {
  it('starts empty: no torpedo, no launchers, every click out of arc', () => {
    const l = new OwnLaunchers(HULL);
    expect(l.states).toEqual([]);
    expect(l.pick(POSE, AHEAD, AIM_DIST).verdict).toBe('out-of-arc');
  });

  it('a frame with `launchers` seeds them; a frame without empties them', () => {
    const l = seeded(BOTH_TWO);
    expect(l.states).toEqual(initialLaunchers(HULL, BOTH_TWO));
    l.correct({ cls: HULL }, 1);
    expect(l.states).toEqual([]);
  });
});

describe('OwnLaunchers.step — the shared stepper, same aim point', () => {
  it('produces exactly what stepLaunchers produces toward launcherAimPoint', () => {
    const l = seeded(BOTH_TWO);
    const ref = initialLaunchers(HULL, BOTH_TWO);
    for (let i = 0; i < 30; i++) {
      const aim = i < 15 ? BEAM : -BEAM / 2;
      l.step(POSE, aim, AIM_DIST, DT);
      stepLaunchers(ref, HULL, POSE, launcherAimPoint(POSE, HULL, aim, AIM_DIST), DT);
    }
    expect(l.states).toEqual(ref);
    expect(l.angles()).toEqual(ref.map((s) => s.a));
  });

  it('hold() keeps every angle and still runs the tube clocks', () => {
    const l = seeded();
    settle(l, BEAM);
    const a = l.states[0].a;
    l.fire(0, 0, 1000, 5);
    l.hold(DT);
    expect(l.states[0].a).toBe(a);
    expect(l.states[0].tubes[0]).toBe(1000 - DT);
  });

  it('stepOwnLaunchers holds while not afloat or with no pose', () => {
    const l = seeded();
    stepOwnLaunchers(l, POSE, { aim: BEAM, aimDist: AIM_DIST }, false);
    stepOwnLaunchers(l, null, { aim: BEAM, aimDist: AIM_DIST }, true);
    expect(l.states[0].a).toBe(initialLaunchers(HULL, FORE_ONLY)[0].a);
    stepOwnLaunchers(l, POSE, { aim: BEAM, aimDist: AIM_DIST }, true);
    expect(l.states[0].a).not.toBe(initialLaunchers(HULL, FORE_ONLY)[0].a);
  });
});

describe('OwnLaunchers.correct — from the wire, keeping un-acked fires', () => {
  const wire = (tubes: number[], a = 0): LauncherState[] => [{ a, tubes }];

  it('takes the wire angle and clocks verbatim', () => {
    const l = seeded();
    l.correct({ cls: HULL, launchers: wire([1234], 0.5) }, 3);
    expect(l.states).toEqual(wire([1234], 0.5));
  });

  it('a frame older than the fire keeps the local clock; the acking frame takes the server value', () => {
    const l = seeded();
    l.fire(0, 0, 9000, 10);
    l.correct({ cls: HULL, launchers: wire([0], 0.2) }, 9); // stale: built before the click
    expect(l.states[0].tubes[0]).toBe(9000);
    expect(l.states[0].a).toBe(0.2); // the angle is always the frame's
    l.correct({ cls: HULL, launchers: wire([0]) }, 10); // acked: denied on the server
    expect(l.states[0].tubes[0]).toBe(0);
  });

  it('the safety valve gives the clock back to the server after PENDING_CAPACITY frames', () => {
    const l = seeded();
    l.fire(0, 0, 9000, 1_000_000);
    for (let i = 1; i < PENDING_CAPACITY; i++) {
      l.correct({ cls: HULL, launchers: wire([0]) }, 0);
      expect(l.states[0].tubes[0]).toBe(9000);
    }
    l.correct({ cls: HULL, launchers: wire([0]) }, 0);
    expect(l.states[0].tubes[0]).toBe(0);
  });

  it('a frame for another hull re-seeds from it', () => {
    const l = seeded();
    l.correct({ cls: 'iowa', launchers: initialLaunchers('iowa', BOTH_TWO) }, 0);
    expect(l.hullId).toBe('iowa');
    expect(l.states).toEqual(initialLaunchers('iowa', BOTH_TWO));
  });
});

describe('the torpedo fire verdict — the shared R16 pick', () => {
  it('is the shared pickTube over the predicted states', () => {
    const l = seeded(BOTH_TWO);
    settle(l, BEAM);
    expect(l.pick(POSE, BEAM, AIM_DIST)).toEqual(
      pickTube(l.states, HULL, POSE, launcherAimPoint(POSE, HULL, BEAM, AIM_DIST)),
    );
  });

  it('fore only, aim astern: OUT OF ARC — not in arc, not loaded, nothing predicted fired', () => {
    const l = seeded();
    settle(l, ASTERN);
    expect(torpedoClickPrediction(l, true, POSE, ASTERN, AIM_DIST)).toEqual({ alive: true, loaded: false, inArc: false });
    expect(predictTorpedoClick(l, POSE, ASTERN, AIM_DIST, 9000, 1)).toBeNull();
    expect(l.states[0].tubes).toEqual([0]);
  });

  it('in arc with every bearing tube reloading: COOLING — in arc, not loaded', () => {
    const l = seeded();
    settle(l, AHEAD);
    l.fire(0, 0, 9000, 1);
    expect(torpedoClickPrediction(l, true, POSE, AHEAD, AIM_DIST)).toEqual({ alive: true, loaded: false, inArc: true });
  });

  it('in arc and loaded: FIRE — one click starts exactly ONE tube', () => {
    const l = seeded(BOTH_TWO);
    settle(l, BEAM);
    expect(torpedoClickPrediction(l, true, POSE, BEAM, AIM_DIST)).toEqual({ alive: true, loaded: true, inArc: true });
    const pick = predictTorpedoClick(l, POSE, BEAM, AIM_DIST, 9000, 7);
    expect(pick).not.toBeNull();
    const running = l.states.flatMap((s) => s.tubes).filter((t) => t > 0);
    expect(running).toEqual([9000]);
    expect(l.states[pick!.launcher].tubes[pick!.tube]).toBe(9000);
    expect(l.summary().n).toBe(3);
  });

  it('no pose reads out of arc', () => {
    const l = seeded();
    expect(torpedoClickPrediction(l, true, null, AHEAD, AIM_DIST).inArc).toBe(false);
  });
});
