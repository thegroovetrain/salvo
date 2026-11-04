// Story 10.4 — the own battery's predict-and-correct (contract section 4): the
// client steps its turrets and secondaries heat with the SAME shared steppers
// the server runs, overwrites them from every own frame, and re-seeds on a
// hull change. Plus the R4 click verdict: a click fires whenever any turret is
// ready and is never out of arc.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  SHIP_CLASS_IDS,
  aimPointOf,
  initialSecondaries,
  initialTurrets,
  pickTurret,
  stepSecondaries,
  stepTurrets,
  turretMounts,
  type AimPose,
} from '@salvo/shared';
import { OwnBattery } from '../sim/ownBattery.js';
import { batteryClickPrediction, predictBatteryClick, stepOwnBattery } from '../sim/ownBatteryTick.js';

const DT = CONFIG.tick.simDtMs;
const POSE: AimPose = { x: 0, y: 0, heading: 0 };
/** A beam bearing — inside every turret's train on every hull. */
const AIM = Math.PI / 2;
const AIM_DIST = 400;

describe('OwnBattery — seeded at rest, loaded, cold', () => {
  it('matches the shared spawn state for every hull', () => {
    for (const id of SHIP_CLASS_IDS) {
      const b = new OwnBattery(id);
      expect(b.turrets).toEqual(initialTurrets(id));
      expect(b.sec).toEqual(initialSecondaries());
      expect(b.anyReady()).toBe(true);
      expect(b.angles()).toEqual(initialTurrets(id).map((t) => t.a));
    }
  });
});

describe('OwnBattery.step — the shared steppers, same inputs', () => {
  it('produces exactly what stepTurrets / stepSecondaries produce', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const ref = initialTurrets(DEFAULT_CLASS_ID);
    const refSec = initialSecondaries();
    let rounds = 0;
    let refRounds = 0;
    for (let i = 0; i < 40; i++) {
      const sec = i % 7 !== 0;
      rounds += b.step(POSE, AIM, AIM_DIST, sec, DT);
      stepTurrets(ref, DEFAULT_CLASS_ID, POSE, aimPointOf(POSE, AIM, AIM_DIST), DT);
      refRounds += stepSecondaries(refSec, sec, DT);
    }
    expect(b.turrets).toEqual(ref);
    expect(b.sec).toEqual(refSec);
    expect(rounds).toBe(refRounds);
    expect(rounds).toBeGreaterThan(0);
  });

  it('stepOwnBattery holds every angle for a hull that is not afloat', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const before = [...b.angles()];
    const rounds = stepOwnBattery(b, POSE, { aim: AIM, aimDist: AIM_DIST, sec: true }, false);
    expect(b.angles()).toEqual(before);
    expect(rounds).toBe(0);
  });

  it('stepOwnBattery moves the turrets toward the aim when afloat', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const before = [...b.angles()];
    stepOwnBattery(b, POSE, { aim: AIM, aimDist: AIM_DIST, sec: false }, true);
    expect(b.angles()).not.toEqual(before);
  });
});

describe('OwnBattery.correct — a frame overwrites the prediction', () => {
  it('copies the turrets and the heat + lock, keeping the local round phase', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    for (let i = 0; i < 5; i++) b.step(POSE, AIM, AIM_DIST, true, DT);
    const phase = b.sec.untilRoundMs;
    const server = initialTurrets(DEFAULT_CLASS_ID).map((t, i) => ({ a: t.a, reloadMsLeft: 1000 * (i + 1) }));
    b.correct({ cls: DEFAULT_CLASS_ID, turrets: server, sec: { heat: 0.75, locked: true } });
    expect(b.turrets).toEqual(server);
    expect(b.turrets).not.toBe(server); // copied, never aliased
    expect(b.heat).toBe(0.75);
    expect(b.locked).toBe(true);
    expect(b.sec.untilRoundMs).toBe(phase);
  });

  it('a frame for another hull re-seeds to that hull first', () => {
    const b = new OwnBattery(SHIP_CLASS_IDS[0]);
    const other = SHIP_CLASS_IDS.find((id) => turretMounts(id).length !== turretMounts(SHIP_CLASS_IDS[0]).length);
    expect(other).toBeDefined();
    if (other === undefined) return;
    b.correct({ cls: other, turrets: initialTurrets(other), sec: { heat: 0, locked: false } });
    expect(b.hullId).toBe(other);
    expect(b.turrets.length).toBe(turretMounts(other).length);
  });
});

describe('OwnBattery.reset — class change / respawn / new match', () => {
  it('returns to the new hull at rest, loaded and cold', () => {
    const b = new OwnBattery(SHIP_CLASS_IDS[0]);
    for (let i = 0; i < 10; i++) b.step(POSE, AIM, AIM_DIST, true, DT);
    b.fire(0, 5000);
    const next = SHIP_CLASS_IDS[SHIP_CLASS_IDS.length - 1];
    b.reset(next);
    expect(b.hullId).toBe(next);
    expect(b.turrets).toEqual(initialTurrets(next));
    expect(b.sec).toEqual(initialSecondaries());
  });
});

describe('the main-battery click (R4)', () => {
  it('fires while any turret is ready and is never out of arc', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    expect(batteryClickPrediction(b, true)).toEqual({ alive: true, loaded: true, inArc: true });
  });

  it('is denied (cooling) only when nothing is ready', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    for (let i = 0; i < b.turrets.length; i++) b.fire(i, 5000);
    const p = batteryClickPrediction(b, true);
    expect(p.loaded).toBe(false);
    expect(p.inArc).toBe(true);
    expect(predictBatteryClick(b, POSE, AIM, AIM_DIST, 5000)).toBeNull();
  });

  it('a predicted shot fires the shared pick and starts exactly that turret reloading', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const expected = pickTurret(b.turrets, DEFAULT_CLASS_ID, POSE, aimPointOf(POSE, AIM, AIM_DIST));
    expect(expected).not.toBeNull();
    const reloadMs = 1234;
    const fired = predictBatteryClick(b, POSE, AIM, AIM_DIST, reloadMs);
    expect(fired).toBe(expected?.index);
    b.turrets.forEach((t, i) => expect(t.reloadMsLeft).toBe(i === fired ? reloadMs : 0));
    expect(b.summary().n).toBe(b.turrets.length - 1);
  });
});
