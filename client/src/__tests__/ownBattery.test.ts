// Story 10.4 — the own battery's predict-and-correct (contract section 4): the
// client steps its turrets and secondaries heat with the SAME shared steppers
// the server runs, overwrites them from every own frame, and re-seeds on a
// hull change. Plus the click verdict (arc-only fire, epic-10 amendment 10): a
// click fires exactly when the shared pick names a ready turret whose arc holds
// the aim, and the weapon is never out of arc.

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
  turretAngle,
  turretBears,
  stepTurrets,
  turretMounts,
  ventSecondaries,
  type AimPose,
} from '@salvo/shared';
import { OwnBattery } from '../sim/ownBattery.js';
import { PENDING_CAPACITY } from '../sim/prediction.js';
import { batteryClickPrediction, batteryWouldFire, predictBatteryClick, stepOwnBattery } from '../sim/ownBatteryTick.js';

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
      expect(b.summary().n).toBe(initialTurrets(id).length);
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

  it('stepOwnBattery holds every angle for a wreck (not afloat, weapons dead)', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const before = [...b.angles()];
    const rounds = stepOwnBattery(b, POSE, { aim: AIM, aimDist: AIM_DIST, sec: true }, { afloat: false, weaponsLive: false });
    expect(b.angles()).toEqual(before);
    expect(rounds).toBe(0);
  });

  it('SNAPS: one tick sets every turret to the shared turretAngle for the aim (no traverse, R16)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const b = new OwnBattery(id);
      for (const aim of [AIM, -AIM, 0, Math.PI, Math.PI / 5]) {
        b.step(POSE, aim, AIM_DIST, false, DT);
        const point = aimPointOf(POSE, aim, AIM_DIST);
        b.angles().forEach((a, i) => expect(a, `${id} aim ${aim} turret ${i}`).toBe(turretAngle(id, i, POSE, point)));
      }
    }
  });

  it('stepOwnBattery points the turrets at the aim when afloat', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const before = [...b.angles()];
    stepOwnBattery(b, POSE, { aim: AIM, aimDist: AIM_DIST, sec: false }, { afloat: true, weaponsLive: true });
    expect(b.angles()).not.toEqual(before);
  });
});

describe('OwnBattery.correct — a frame overwrites the prediction', () => {
  it('copies the turrets and the heat, keeping the local round phase', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    for (let i = 0; i < 5; i++) b.step(POSE, AIM, AIM_DIST, true, DT);
    const phase = b.sec.untilRoundMs;
    const server = initialTurrets(DEFAULT_CLASS_ID).map((t, i) => ({ a: t.a, reloadMsLeft: 1000 * (i + 1) }));
    const local = b.turrets.map((t) => t.a);
    b.correct({ cls: DEFAULT_CLASS_ID, turrets: server, sec: { heat: 0.75 } }, 0);
    expect(b.turrets.map((t) => t.reloadMsLeft)).toEqual(server.map((t) => t.reloadMsLeft));
    expect(b.turrets.map((t) => t.a)).toEqual(local); // the angles stay local (F-B)
    expect(b.turrets).not.toBe(server); // copied, never aliased
    expect(b.heat).toBe(0.75);
    expect(b.sec.untilRoundMs).toBe(phase);
  });

  // Review F-B: with no traverse a turret's angle is a pure function of the
  // local pose + aim NOW; the frame's was derived from a latency-old aim, and
  // taking it flicked every turret back for a tick at 20 Hz.
  it('keeps every turret\'s LOCALLY DERIVED angle over the frame\'s, while the reloads are the frame\'s', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    b.step(POSE, AIM, AIM_DIST, false, DT);
    const aimPt = aimPointOf(POSE, AIM, AIM_DIST);
    const derived = b.turrets.map((_, i) => turretAngle(DEFAULT_CLASS_ID, i, POSE, aimPt));
    expect(b.turrets.map((t) => t.a)).toEqual(derived); // the premise
    const server = b.turrets.map((t, i) => ({ a: t.a + 0.2, reloadMsLeft: 500 * (i + 1) }));
    b.correct({ cls: DEFAULT_CLASS_ID, turrets: server, sec: { heat: 0 } }, 0);
    expect(b.turrets.map((t) => t.a)).toEqual(derived);
    expect(b.turrets.map((t) => t.reloadMsLeft)).toEqual(server.map((t) => t.reloadMsLeft));
  });

  it('INSTANT RELOAD (Story 10.5, R10) is not predicted: the vented own frame cools a full-heat local gun, which fires on the next held step', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    while (b.heat < 1) b.step(POSE, AIM, AIM_DIST, true, DT);
    const server = initialTurrets(DEFAULT_CLASS_ID);
    b.correct({ cls: DEFAULT_CLASS_ID, turrets: server, sec: ventSecondaries({ heat: 1 }) }, 0);
    expect(b.heat).toBe(0);
    b.sec.untilRoundMs = 0; // the local round phase is kept by a correction; clear it to isolate the vent
    expect(b.step(POSE, AIM, AIM_DIST, true, DT)).toBeGreaterThan(0);
  });

  it('a frame for another hull re-seeds to that hull first', () => {
    const b = new OwnBattery(SHIP_CLASS_IDS[0]);
    const other = SHIP_CLASS_IDS.find((id) => turretMounts(id).length !== turretMounts(SHIP_CLASS_IDS[0]).length);
    expect(other).toBeDefined();
    if (other === undefined) return;
    b.correct({ cls: other, turrets: initialTurrets(other), sec: { heat: 0 } }, 0);
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

describe('the main-battery click (arc-only fire)', () => {
  it('fires while a ready turret bears and is never out of arc', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    expect(batteryClickPrediction(b, true, POSE, AIM, AIM_DIST)).toEqual({ alive: true, loaded: true, inArc: true });
  });

  it('is denied (cooling) when nothing is ready', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    for (let i = 0; i < b.turrets.length; i++) b.fire(i, 5000);
    const p = batteryClickPrediction(b, true, POSE, AIM, AIM_DIST);
    expect(p.loaded).toBe(false);
    expect(p.inArc).toBe(true);
    expect(predictBatteryClick(b, POSE, AIM, AIM_DIST, 5000, 1)).toBeNull();
  });

  it.each(SHIP_CLASS_IDS)('%s: only NON-BEARING turrets ready (aim dead ahead, the forward turrets spent) — the click is not predicted to fire and no local reload starts', (id) => {
    const b = new OwnBattery(id);
    const AHEAD = 0;
    const point = aimPointOf(POSE, AHEAD, AIM_DIST * 10);
    turretMounts(id).forEach((m, i) => {
      expect(turretBears(id, i, POSE, point), `${i}`).toBe(m.facing === 'fwd'); // the premise
      if (m.facing === 'fwd') b.fire(i, 5000);
    });
    const before = b.turrets.map((t) => t.reloadMsLeft);
    expect(b.summary().n).toBeGreaterThan(0); // the hotbar still counts the loaded aft turrets
    expect(batteryWouldFire(b, POSE, AHEAD, AIM_DIST * 10)).toBe(false);
    expect(batteryClickPrediction(b, true, POSE, AHEAD, AIM_DIST * 10)).toEqual({ alive: true, loaded: false, inArc: true });
    expect(predictBatteryClick(b, POSE, AHEAD, AIM_DIST * 10, 5000, 1)).toBeNull();
    expect(b.turrets.map((t) => t.reloadMsLeft)).toEqual(before);
    // …and swing the aim onto the beam: the loaded aft turrets bear, the click fires.
    expect(batteryClickPrediction(b, true, POSE, AIM, AIM_DIST).loaded).toBe(true);
  });

  it('the verdict agrees with the shared pick everywhere around the compass, and with no pose nothing fires', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    b.fire(0, 5000);
    for (let k = 0; k < 72; k++) {
      const aim = (k * Math.PI) / 36;
      const pick = pickTurret(b.turrets, DEFAULT_CLASS_ID, POSE, aimPointOf(POSE, aim, AIM_DIST));
      expect(batteryWouldFire(b, POSE, aim, AIM_DIST), `${k}`).toBe(pick !== null);
    }
    expect(batteryClickPrediction(b, true, null, AIM, AIM_DIST).loaded).toBe(false);
  });

  it('a predicted shot fires the shared pick and starts exactly that turret reloading', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const expected = pickTurret(b.turrets, DEFAULT_CLASS_ID, POSE, aimPointOf(POSE, AIM, AIM_DIST));
    expect(expected).not.toBeNull();
    const reloadMs = 1234;
    const fired = predictBatteryClick(b, POSE, AIM, AIM_DIST, reloadMs, 1);
    expect(fired).toBe(expected?.index);
    b.turrets.forEach((t, i) => expect(t.reloadMsLeft).toBe(i === fired ? reloadMs : 0));
    expect(b.summary().n).toBe(b.turrets.length - 1);
  });
});

// REVIEW GATE C1 — the turret ANGLES and the secondaries HEAT answer two
// different questions: the angles chase the aim only while AFLOAT; the heat
// runs on the real right-button level whenever the server runs the stream
// (afloat OR sinking, AND weapons enabled), and as released otherwise.
describe('stepOwnBattery — the gate (review C1)', () => {
  const HELD = { aim: AIM, aimDist: AIM_DIST, sec: true };
  const TICKS = 12;

  function run(gate: { afloat: boolean; weaponsLive: boolean }): { b: OwnBattery; rounds: number } {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    let rounds = 0;
    for (let i = 0; i < TICKS; i++) rounds += stepOwnBattery(b, POSE, HELD, gate);
    return { b, rounds };
  }

  function reference(held: boolean): { heat: number; rounds: number } {
    const s = initialSecondaries();
    let rounds = 0;
    for (let i = 0; i < TICKS; i++) rounds += stepSecondaries(s, held, DT);
    return { heat: s.heat, rounds };
  }

  it('SINKING + held: the heat rises exactly as the shared stepper held, the angles hold', () => {
    const before = initialTurrets(DEFAULT_CLASS_ID).map((t) => t.a);
    const { b, rounds } = run({ afloat: false, weaponsLive: true });
    const ref = reference(true);
    expect(ref.heat).toBeGreaterThan(0);
    expect(b.heat).toBe(ref.heat);
    expect(rounds).toBe(ref.rounds);
    expect(b.angles()).toEqual(before);
  });

  it('FROZEN room + held: the heat steps as released (does not rise), nothing fires', () => {
    const { b, rounds } = run({ afloat: true, weaponsLive: false });
    const ref = reference(false);
    expect(b.heat).toBe(ref.heat);
    expect(rounds).toBe(0);
  });

  it('AFLOAT + live: unchanged — heat as held, the turrets point at the aim', () => {
    const before = initialTurrets(DEFAULT_CLASS_ID).map((t) => t.a);
    const { b, rounds } = run({ afloat: true, weaponsLive: true });
    const ref = reference(true);
    expect(b.heat).toBe(ref.heat);
    expect(rounds).toBe(ref.rounds);
    expect(b.angles()).not.toEqual(before);
  });
});

// REVIEW GATE C5 — a zero (or non-finite) aim distance is NO AIM
// (`batteryAimPoint` → null): the turrets hold, and a click is not predicted
// to fire (the server denies it).
describe('no aim (review C5)', () => {
  it('stepOwnBattery holds every angle afloat with aimDist 0', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const before = [...b.angles()];
    const gate = { afloat: true, weaponsLive: true };
    for (let i = 0; i < 10; i++) stepOwnBattery(b, POSE, { aim: AIM, aimDist: 0, sec: false }, gate);
    expect(b.angles()).toEqual(before);
  });

  it('a click with aimDist 0 is not predicted to fire and starts no reload', () => {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    expect(batteryClickPrediction(b, true, POSE, AIM, 0).loaded).toBe(false);
    expect(predictBatteryClick(b, POSE, AIM, 0, 5000, 1)).toBeNull();
    expect(b.turrets.every((t) => t.reloadMsLeft === 0)).toBe(true);
    expect(batteryClickPrediction(b, true, POSE, AIM, AIM_DIST).loaded).toBe(true);
  });
});

// REVIEW GATE C2 — a frame the server built BEFORE it processed the click
// must not roll the predicted shot back: a turret whose predicted fire rides
// an input newer than the frame's `ackSeq` keeps its local reload until a frame acks that input — or until the
// safety valve (PENDING_CAPACITY frames) lets the server's value through.
describe('OwnBattery.correct — a stale frame keeps a predicted shot (review C2)', () => {
  const RELOAD = 4000;
  const SEQ = 10;

  function fired(): { b: OwnBattery; idx: number } {
    const b = new OwnBattery(DEFAULT_CLASS_ID);
    const idx = predictBatteryClick(b, POSE, AIM, AIM_DIST, RELOAD, SEQ);
    expect(idx).not.toBeNull();
    return { b, idx: idx ?? -1 };
  }

  function frame(reload: number, angleShift = 0) {
    return {
      cls: DEFAULT_CLASS_ID,
      turrets: initialTurrets(DEFAULT_CLASS_ID).map((t) => ({ a: t.a + angleShift, reloadMsLeft: reload })),
      sec: { heat: 0 },
    };
  }

  it('a frame older than the click: the fired turret still reads reloading, its angle stays local', () => {
    const { b, idx } = fired();
    const local = b.turrets[idx].a;
    const f = frame(0, 0.1);
    b.correct(f, SEQ - 1);
    expect(b.turrets[idx].reloadMsLeft).toBe(RELOAD);
    expect(b.turrets[idx].a).toBe(local);
    b.turrets.forEach((t, i) => {
      if (i !== idx) expect(t.reloadMsLeft).toBe(0);
    });
  });

  it('a frame that acks the click showing READY (the server denied): back to ready', () => {
    const { b, idx } = fired();
    b.correct(frame(0), SEQ - 1);
    b.correct(frame(0), SEQ);
    expect(b.turrets[idx].reloadMsLeft).toBe(0);
  });

  it('a frame that acks the click showing RELOADING: the server value is taken', () => {
    const { b, idx } = fired();
    b.correct(frame(777), SEQ);
    expect(b.turrets[idx].reloadMsLeft).toBe(777);
    b.correct(frame(0), SEQ); // acked: never held again
    expect(b.turrets[idx].reloadMsLeft).toBe(0);
  });

  it('the safety valve: a click never acked cannot strand a turret past PENDING_CAPACITY frames', () => {
    const { b, idx } = fired();
    for (let i = 0; i < PENDING_CAPACITY; i++) b.correct(frame(0), SEQ - 1);
    expect(b.turrets[idx].reloadMsLeft).toBe(0);
  });

  it('a reset drops every pending shot', () => {
    const { b, idx } = fired();
    b.reset(DEFAULT_CLASS_ID);
    b.correct(frame(0), SEQ - 1);
    expect(b.turrets[idx].reloadMsLeft).toBe(0);
  });
});
