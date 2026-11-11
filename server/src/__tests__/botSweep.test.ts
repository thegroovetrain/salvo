// THE MINE SWEEP, THE NEXT-TICK POSE AND THE AIM STEAL (Story 10.12).
//
//   * THE SWEEP (ai/battery.ts): the secondaries are the one captain weapon
//     that hurts a mine, and only where a round lands. The pick is unit-tested
//     as a pure function; the brain cases run COMBAT_BRAIN.decide on the fake
//     port.
//   * THE NEXT-TICK POSE: the server steps the hull before its turrets, so
//     the on-target check reads the pose the brain predicted for this tick.
//   * THE AIM STEAL: one input carries one aim, so a non-battery shot (a mine
//     drop aimed astern, a sweep) drags the turrets off the target for the
//     ticks it lasts. Measured here against the shared turret stepper, not
//     re-plumbed (a second aim channel would be a wire change).
//
// Every distance is read off the hull's stats or CONFIG; no ruled number,
// copy or seed-produced value is pinned.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  SLOT_GUN,
  angleDiff,
  bearing,
  copyTurrets,
  desiredTurretAngle,
  stepLaunchers,
  stepShip,
  stepTurrets,
  turretMounts,
  type ShipClassId,
  type TurretState,
  type Vec2,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { fitClassWeapons } from './classWeapons.js';
import { COMBAT_BRAIN, situationOf } from '../game/ai/tactics.js';
import { readyOnTarget, sweepPick, sweepingNow, turretPoseOf, type BatteryAim, type SweepMine } from '../game/ai/battery.js';
import { avoidMines, minePressing } from '../game/ai/navigate.js';
import { ownReachU } from '../game/ai/utility.js';
import type { BotDecision, BotMind } from '../game/ai/types.js';
import type { ShipRecord } from '../game/world.js';
import { DT_S, fakePort, holdTarget, mkBot, mkMind, ocean, sightMines, track, trainOn, type FakePort } from './botHelmFixture.js';

const DT_MS = CONFIG.tick.simDtMs;
const RAD = Math.PI / 180;

interface Rig {
  rec: ShipRecord;
  port: FakePort;
  mind: BotMind;
}

/** A hull at the origin, bow due east, in open water (or behind `isles`). */
function rigFor(hullId: ShipClassId, seed: number, isles: Parameters<typeof ocean>[1] = []): Rig {
  const w = ocean(seed, isles);
  return { rec: mkBot(w, hullId, 0, 0, 0), port: fakePort(w), mind: mkMind('raider') };
}

const hostile = (x: number, y: number): SweepMine => ({ x, y, own: false });
const own = (x: number, y: number): SweepMine => ({ x, y, own: true });

/** u — a distance the helm's mine term reads (well inside its lookahead). */
const NEAR_U = CONFIG.mine.triggerRadius * 2;
/** A mine the helm is steering round: ahead of the beam, off the bow. */
const PRESSING = hostile(NEAR_U * Math.cos(0.7), NEAR_U * Math.sin(0.7));
/** The same distance dead astern: sighted, in reach, not in the helm's way. */
const ASTERN = hostile(-NEAR_U, 0);

/** Is the decision's aim on this point (bearing and distance from the hull centre)? */
function aimedAt(rec: ShipRecord, d: BotDecision, p: Vec2): boolean {
  const dist = Math.hypot(p.x - rec.state.x, p.y - rec.state.y);
  return Math.abs(angleDiff(bearing(rec.state, p), d.aim)) < 1e-9 && Math.abs(d.aimDist - dist) < 1e-9;
}

describe('ai/battery.ts — sweepPick (unit)', () => {
  it('a HOSTILE mine inside the secondaries\' reach is picked; the bot\'s own never is', () => {
    const { rec, port, mind } = rigFor('bismarck', 1301);
    const sit = situationOf(rec, mind, port);
    const m = hostile(0, sit.stats.secondaryRangeU / 2);
    expect(sweepPick(rec, sit, [m], false)).toBe(m);
    expect(sweepPick(rec, sit, [own(m.x, m.y)], false)).toBeNull();
    expect(sweepPick(rec, sit, [], false)).toBeNull();
  });

  it('REACH is the secondaries\', measured centre to centre: just inside is picked, just outside is not', () => {
    for (const hullId of SHIP_CLASS_IDS) {
      const { rec, port, mind } = rigFor(hullId, 1302);
      const sit = situationOf(rec, mind, port);
      const r = sit.stats.secondaryRangeU;
      expect(r).toBeGreaterThan(0);
      expect(sweepPick(rec, sit, [hostile(0, r * 0.99)], false)).not.toBeNull();
      expect(sweepPick(rec, sit, [hostile(0, r * 1.01)], false)).toBeNull();
    }
  });

  it('the NEAREST candidate wins', () => {
    const { rec, port, mind } = rigFor('iowa', 1303);
    const sit = situationOf(rec, mind, port);
    const r = sit.stats.secondaryRangeU;
    const far = hostile(r * 0.8, 0);
    const near = hostile(0, -r * 0.3);
    expect(sweepPick(rec, sit, [far, near], false)).toBe(near);
    expect(sweepPick(rec, sit, [near, far], false)).toBe(near);
    expect(sweepPick(rec, sit, [far, own(0, r * 0.1)], false)).toBe(far); // an own mine nearer still does not count
  });

  it('LAND on the line refuses the mine; the same mine over open water is picked', () => {
    const open = rigFor('yamato', 1304);
    const r = situationOf(open.rec, open.mind, open.port).stats.secondaryRangeU;
    const m = hostile(r * 0.9, 0);
    const blocked = rigFor('yamato', 1304, [circleIsland(r * 0.5, 0, r * 0.1)]);
    expect(sweepPick(open.rec, situationOf(open.rec, open.mind, open.port), [m], false)).toBe(m);
    expect(sweepPick(blocked.rec, situationOf(blocked.rec, blocked.mind, blocked.port), [m], false)).toBeNull();
  });

  it('WITH A TARGET IN BATTERY REACH only a mine the helm is steering round is picked — the same predicate the mine term sums', () => {
    const { rec, port, mind } = rigFor('warspite', 1305);
    const sit = situationOf(rec, mind, port);
    let pressing = 0;
    let quiet = 0;
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2 + 0.1;
      const m = hostile(Math.cos(a) * NEAR_U, Math.sin(a) * NEAR_U);
      const helmSteersRound = minePressing(rec.state, m);
      sightMines(mind, [m]);
      expect(avoidMines(rec, mind) !== 0).toBe(helmSteersRound); // one predicate, two readers
      expect(sweepPick(rec, sit, [m], true) !== null).toBe(helmSteersRound);
      expect(sweepPick(rec, sit, [m], false)).toBe(m); // with no target in reach every one of them is swept
      if (helmSteersRound) pressing += 1;
      else quiet += 1;
    }
    expect(pressing).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(0);
  });

  it('with a target in reach a nearer mine astern does not hide the one in the way', () => {
    const { rec, port, mind } = rigFor('bismarck', 1306);
    const sit = situationOf(rec, mind, port);
    const nearAstern = hostile(-NEAR_U / 2, 0);
    expect(sweepPick(rec, sit, [nearAstern, PRESSING], true)).toBe(PRESSING);
    expect(sweepPick(rec, sit, [nearAstern, PRESSING], false)).toBe(nearAstern);
    expect(sweepPick(rec, sit, [nearAstern], true)).toBeNull();
  });
});

describe('COMBAT_BRAIN — the mine sweep', () => {
  /** A parked target dead ahead inside battery reach, beyond the
   *  secondaries' — with the forward turrets already on it, so the battery
   *  WOULD click this tick. */
  function withTarget(rig: Rig): Vec2 {
    const { rec, port, mind } = rig;
    const sit = situationOf(rec, mind, port);
    const target = { x: (sit.stats.secondaryRangeU + ownReachU(sit)) / 2, y: 0 };
    holdTarget(mind, track(port.now, target), 'engage');
    trainOn(rec, target.x, target.y);
    return target;
  }

  it('IDLE MINE: no target, a hostile mine in reach → the aim is its marker, the secondaries are held, nothing clicks', () => {
    const { rec, port, mind } = rigFor('iowa', 1310);
    const m = hostile(0, rec.stats.secondaryRangeU / 2);
    sightMines(mind, [m]);
    const d = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(aimedAt(rec, d, m)).toBe(true);
    expect(d.sec).toBe(true);
    expect([d.fireSlot, d.held]).toEqual([null, false]);
    expect(mind.lastTactic).toBe('sweep');
    expect(sweepingNow(mind, port.now)).toBe(true);
  });

  it('MINE IN THE WAY: with a target in battery reach the sweep takes the aim and the battery holds its click; the mine gone, the battery resumes', () => {
    const rig = rigFor('bismarck', 1311);
    const { rec, port, mind } = rig;
    const target = withTarget(rig);
    // The control: no mine sighted — the battery clicks on its target.
    const clear = COMBAT_BRAIN.decide(rec, mkMindLike(mind), port, false);
    expect(clear.fireSlot).toBe(SLOT_GUN);
    // The mine in the helm's way: the aim is the mine's, the secondaries fire, no click.
    sightMines(mind, [PRESSING]);
    const sweeping = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(aimedAt(rec, sweeping, PRESSING)).toBe(true);
    expect(sweeping.sec).toBe(true);
    expect(sweeping.fireSlot).toBeNull();
    expect(mind.lastTactic).toBe('sweep');
    // Swept: the next decision is the battery's again.
    sightMines(mind, []);
    const after = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(sweepingNow(mind, port.now)).toBe(false);
    expect(after.fireSlot).toBe(SLOT_GUN);
    expect(Math.abs(angleDiff(bearing(rec.state, target), after.aim))).toBeLessThan(0.1);
  });

  it('a mine NOT in the helm\'s way does not take the aim from a battery with a target in reach', () => {
    const rig = rigFor('bismarck', 1312);
    const { rec, port, mind } = rig;
    const target = withTarget(rig);
    sightMines(mind, [ASTERN]);
    const d = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(d.fireSlot).toBe(SLOT_GUN);
    expect(Math.abs(angleDiff(bearing(rec.state, target), d.aim))).toBeLessThan(0.1);
    expect(sweepingNow(mind, port.now)).toBe(false);
  });

  it('NO SWEEP of an own mine, a mine behind land, or with the secondaries overheated — the battery keeps the aim', () => {
    const cases: readonly { name: string; prep: (rig: Rig) => void; isles?: Parameters<typeof ocean>[1] }[] = [
      { name: 'own', prep: (rig) => sightMines(rig.mind, [own(PRESSING.x, PRESSING.y)]) },
      {
        name: 'overheated',
        prep: (rig) => {
          sightMines(rig.mind, [PRESSING]);
          rig.rec.sec.heat = (CONFIG.bots.secReleaseHeat + 1) / 2;
        },
      },
      {
        name: 'locked',
        prep: (rig) => {
          sightMines(rig.mind, [PRESSING]);
          rig.rec.sec.locked = true;
        },
      },
    ];
    for (const c of cases) {
      const rig = rigFor('bismarck', 1313);
      const target = withTarget(rig);
      c.prep(rig);
      const d = COMBAT_BRAIN.decide(rig.rec, rig.mind, rig.port, false);
      expect(d.sec ?? false, c.name).toBe(false);
      expect(d.fireSlot, c.name).toBe(SLOT_GUN);
      expect(Math.abs(angleDiff(bearing(rig.rec.state, target), d.aim)), c.name).toBeLessThan(0.1);
      expect(sweepingNow(rig.mind, rig.port.now), c.name).toBe(false);
    }
    // Behind land (no target: the idle clause would otherwise sweep it).
    const r = rigFor('bismarck', 1313).rec.stats.secondaryRangeU;
    const blocked = rigFor('bismarck', 1313, [circleIsland(0, r * 0.5, r * 0.1)]);
    sightMines(blocked.mind, [hostile(0, r * 0.9)]);
    const d = COMBAT_BRAIN.decide(blocked.rec, blocked.mind, blocked.port, false);
    expect(d.sec ?? false).toBe(false);
    expect(sweepingNow(blocked.mind, blocked.port.now)).toBe(false);
  });

  it('THE HEAT DISCIPLINE IS THE HULL-TARGET ONE: the sweep rests past the release line and waits for the re-press line', () => {
    const { rec, port, mind } = rigFor('yamato', 1314);
    const m = hostile(0, rec.stats.secondaryRangeU / 2);
    sightMines(mind, [m]);
    const mid = (CONFIG.bots.secReleaseHeat + CONFIG.bots.secRepressHeat) / 2;
    const decide = (): BotDecision => COMBAT_BRAIN.decide(rec, mind, port, false);
    rec.sec.heat = mid;
    expect(decide().sec).toBe(true); // firing, below the release line
    rec.sec.heat = (CONFIG.bots.secReleaseHeat + 1) / 2;
    expect(decide().sec ?? false).toBe(false); // released
    expect(mind.secResting).toBe(true);
    rec.sec.heat = mid;
    const resting = decide();
    expect(resting.sec ?? false).toBe(false); // cooling, still above the re-press line
    expect(aimedAt(rec, resting, m)).toBe(false); // ... and the aim is not held on the mine meanwhile
    rec.sec.heat = CONFIG.bots.secRepressHeat / 2;
    const again = decide();
    expect(again.sec).toBe(true);
    expect(aimedAt(rec, again, m)).toBe(true);
  });

  it('the secondaries on a HULL in their reach are unchanged when there is nothing to sweep', () => {
    const { rec, port, mind } = rigFor('iowa', 1315);
    const target = { x: 0, y: rec.stats.secondaryRangeU * 0.8 };
    holdTarget(mind, track(port.now, target), 'engage');
    sightMines(mind, [ASTERN]); // sighted, not in the way, and a target in battery reach
    const d = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(d.sec).toBe(true);
    expect(Math.abs(angleDiff(bearing(rec.state, target), d.aim))).toBeLessThan(0.1);
    expect(mind.lastTactic).not.toBe('sweep');
  });

  it('A NON-BATTERY SHOT WINS THE TICK: a torpedo on target is launched on its own aim; the same tick with no tube loaded is the sweep\'s', () => {
    const w = ocean(1316);
    const port = fakePort(w);
    const rec = mkBot(w, 'bismarck', 0, 0, 0);
    fitClassWeapons(w, rec); // the heavy torpedo
    rec.state.speed = 0;
    const slot = rec.loadout.findIndex((s) => s.equipmentId === 'heavyTorpedo');
    expect(slot).toBeGreaterThan(0);
    const target = { x: 0, y: 180 }; // abeam at knife range, creeping (a course to lead)
    const mind = mkMind('raider');
    holdTarget(mind, track(port.now, { ...target, heading: 0, speed: 1 }), 'engage');
    sightMines(mind, [PRESSING]);
    for (let i = 0; i < 200; i += 1) stepLaunchers(rec.launchers, rec.hullId, rec.state, target, DT_MS);
    const shot = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(shot.fireSlot).toBe(slot);
    expect(aimedAt(rec, shot, PRESSING)).toBe(false);
    // No tube loaded: nothing else wants the tick, so the sweep has it.
    for (const l of rec.launchers) l.tubes.fill(rec.stats.equipment.heavyTorpedo.reloadMs);
    rec.loadout[slot].state = { n: 0, reloadMsLeft: rec.stats.equipment.heavyTorpedo.reloadMs };
    const swept = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(swept.fireSlot).toBeNull();
    expect(aimedAt(rec, swept, PRESSING)).toBe(true);
    expect(swept.sec).toBe(true);
  });

  it('a HELD bot never sweeps (decideHeld fires nothing)', () => {
    const { rec, port, mind } = rigFor('iowa', 1317);
    sightMines(mind, [hostile(0, rec.stats.secondaryRangeU / 2)]);
    const d = COMBAT_BRAIN.decideHeld(rec, mind, port, false);
    expect(d.sec ?? false).toBe(false);
    expect(d.aimDist).toBe(0);
  });
});

/** A fresh mind carrying the same held target and posture (a control arm). */
function mkMindLike(from: BotMind): BotMind {
  const mind = mkMind('raider');
  for (const [k, t] of from.contacts) mind.contacts.set(k, { ...t });
  mind.targetKey = from.targetKey;
  mind.posture = from.posture;
  return mind;
}

describe('THE NEXT-TICK POSE — the on-target check reads the pose the server steps turrets against', () => {
  it('decide stamps the shared stepShip prediction of this decision\'s own helm', () => {
    for (const hullId of SHIP_CLASS_IDS) {
      const { rec, port, mind } = rigFor(hullId, 1320, []);
      rec.state.heading = 0.4;
      holdTarget(mind, track(port.now, { x: 0, y: ownReachU(situationOf(rec, mind, port)) * 0.6 }), 'pursue');
      const d = COMBAT_BRAIN.decide(rec, mind, port, false);
      expect(d.rudder).not.toBe(0); // a turning helm: the prediction is not the current pose
      const want = stepShip({ ...rec.state }, d, rec.stats.kinematics, DT_S);
      expect(mind.nextPose).toEqual({ ...want, at: port.now });
      expect(want.heading).not.toBe(rec.state.heading);
    }
  });

  it('turretPoseOf: this tick\'s prediction, else the current pose (a stale or absent seat is ignored)', () => {
    const { rec, port, mind } = rigFor('iowa', 1321);
    expect(turretPoseOf(rec, mind, port.now)).toBe(rec.state);
    mind.nextPose = { x: 5, y: 6, heading: 0.2, speed: 3, at: port.now };
    expect(turretPoseOf(rec, mind, port.now)).toBe(mind.nextPose);
    expect(turretPoseOf(rec, mind, port.now + DT_MS)).toBe(rec.state);
    mind.nextPose = null;
    expect(turretPoseOf(rec, mind, port.now)).toBe(rec.state);
  });

  it('a turret one traverse step short of the aim AS THE POST-MOVE POSE SEES IT is on target there, and is not from the pre-move pose', () => {
    const step = (CONFIG.mainBattery.traverseDegPerS * RAD * DT_MS) / 1000;
    for (const hullId of SHIP_CLASS_IDS) {
      const { rec } = rigFor(hullId, 1322);
      const reach = rec.stats.equipment.mainBattery.rangeU;
      // The hull under full rudder at speed: one tick swings the heading by
      // more than the on-target tolerance.
      rec.state.speed = rec.stats.kinematics.maxSpeed;
      const next = stepShip({ ...rec.state }, { throttle: 1, rudder: 1 }, rec.stats.kinematics, DT_S);
      const swing = Math.abs(angleDiff(rec.state.heading, next.heading));
      expect(swing).toBeGreaterThan(CONFIG.mainBattery.onTargetDeg * RAD * 2);
      const aim: BatteryAim = { aim: Math.PI / 2, aimDist: reach * 0.6, point: { x: 0, y: reach * 0.6 } }; // abeam: every turret bears
      // What the server will chase: the aim resolved off the POST-MOVE centre.
      const served = { x: next.x + Math.cos(aim.aim) * aim.aimDist, y: next.y + Math.sin(aim.aim) * aim.aimDist };
      // Every turret exactly one traverse step short of it, on the side the
      // hull's swing is carrying the bearing AWAY from (so from the pre-move
      // pose it is a step and a swing short).
      rec.turrets.forEach((t, i) => (t.a = desiredTurretAngle(rec.hullId, i, next, served) - step));
      expect(readyOnTarget(rec, aim, next)).toBe(true);
      expect(readyOnTarget(rec, aim)).toBe(false);
    }
  });
});

describe('THE AIM STEAL — what a non-battery aim costs the turrets, measured', () => {
  const STEP = (CONFIG.mainBattery.traverseDegPerS * RAD * DT_MS) / 1000;
  const ON = CONFIG.mainBattery.onTargetDeg * RAD;

  /** Is turret `i` within the on-target tolerance of where it wants to be for `p`? */
  function onTarget(rec: ShipRecord, states: readonly TurretState[], i: number, p: Vec2): boolean {
    return Math.abs(states[i].a - desiredTurretAngle(rec.hullId, i, rec.state, p)) <= ON + 1e-9;
  }

  /** Ticks of stepping back onto `p` until EVERY turret is on it again. */
  function recoveryTicks(rec: ShipRecord, states: TurretState[], p: Vec2): number {
    let ticks = 0;
    while (!states.every((_t, i) => onTarget(rec, states, i, p))) {
      stepTurrets(states, rec.hullId, rec.state, p, DT_MS);
      ticks += 1;
      expect(ticks).toBeLessThan(1000);
    }
    return ticks;
  }

  for (const hullId of SHIP_CLASS_IDS) {
    it(`${hullId}: an excursion of k ticks is recovered in no more than k — the traverse back is the traverse out`, () => {
      const { rec } = rigFor(hullId, 1330);
      rec.state.speed = 0;
      const reach = rec.stats.equipment.mainBattery.rangeU;
      const target = { x: 0, y: reach * 0.6 }; // abeam: every turret bears and is trained on it
      const astern = { x: -CONFIG.mine.triggerRadius * 2, y: 0 }; // a mine drop aimed dead astern
      for (const k of [1, 3, 10]) {
        trainOn(rec, target.x, target.y);
        const states = copyTurrets([], rec.turrets);
        expect(recoveryTicks(rec, states, target)).toBe(0); // on target to begin with
        for (let i = 0; i < k; i += 1) stepTurrets(states, rec.hullId, rec.state, astern, DT_MS);
        // The cost is real: some turret was dragged off — by the traverse
        // rate times the ticks, never more.
        const moved = states.map((t, i) => Math.abs(t.a - rec.turrets[i].a));
        const worst = Math.max(...moved);
        expect(worst).toBeGreaterThan(ON);
        expect(worst).toBeLessThanOrEqual(k * STEP + 1e-9);
        // The forward turrets cannot bear dead astern: they HOLD (hold-outside-arc).
        turretMounts(hullId).forEach((m, i) => {
          if (m.facing === 'fwd') expect(moved[i]).toBe(0);
        });
        const back = recoveryTicks(rec, states, target);
        expect(back).toBe(Math.ceil((worst - ON) / STEP - 1e-9));
        expect(back).toBeLessThanOrEqual(k);
      }
    });

    it(`${hullId}: after a ONE-tick excursion the dragged turret clicks again on the very next decision (the check steps a tick ahead)`, () => {
      const { rec } = rigFor(hullId, 1331);
      rec.state.speed = 0;
      const reach = rec.stats.equipment.mainBattery.rangeU;
      const target = { x: 0, y: reach * 0.6 };
      trainOn(rec, target.x, target.y);
      stepTurrets(rec.turrets, rec.hullId, rec.state, { x: -CONFIG.mine.triggerRadius * 2, y: 0 }, DT_MS);
      // Only the turrets that were dragged are ready: the click must be theirs.
      const mounts = turretMounts(hullId);
      rec.turrets.forEach((t, i) => (t.reloadMsLeft = mounts[i].facing === 'fwd' ? rec.stats.equipment.mainBattery.reloadMs : 0));
      expect(rec.turrets.some((t, i) => t.reloadMsLeft === 0 && !onTarget(rec, rec.turrets, i, target))).toBe(true);
      const aim: BatteryAim = { aim: bearing(rec.state, target), aimDist: reach * 0.6, point: target };
      expect(readyOnTarget(rec, aim)).toBe(true);
    });
  }
});
