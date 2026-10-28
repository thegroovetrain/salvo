// STORY 9.13 WAVE 1b — THE GUN DOCTRINE, FLARE TO SHOOT AND THE SPECIAL /
// CONSUMABLE TRIGGER EXTENSIONS (epic-9 amendments 187, 194, 198, 199).
//
// Contracts, never literals: every band is read off CONFIG.bots.gunBand and
// the folded gun row, every reach off the stats, every range off CONFIG. The
// ShipRecords are REAL (World.addShip) so hull stats and pools are shipped
// ones; the port is a hand-built fake so the clock and the view are the
// test's own.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  inArc,
  mulberry32,
  sectorArcFor,
  wrapAngle,
  type HullId,
  type LitZoneView,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { circleIsland } from './islandFixture.js';
import { fitClassWeapons } from './classWeapons.js';
import { COMBAT_BRAIN, situationOf } from '../game/ai/tactics.js';
import { CONSUMABLE_TACTICS, EQUIPMENT_TACTICS, SHIFT_TACTICS } from '../game/ai/tacticRegistry.js';
import { FLARE_TO_SHOOT } from '../game/ai/equipment.js';
import { profileOf, type BotProfile } from '../game/ai/profiles.js';
import { effectiveReach, gunBand, mountedGun, ownLitZones } from '../game/ai/doctrine.js';
import { hunkerCues, type TacticContext } from '../game/ai/tacticKit.js';
import type { BotMind, BotPosture, BotProfileId, BotWorldPort, RememberedContact } from '../game/ai/types.js';
import type { PerceptionView } from '../game/perception.js';

const REAR_SECTOR = sectorArcFor('navalMines'); // the mine's astern sector — where the ring solver tries first

function fakePort(w: World): BotWorldPort & { now: number } {
  return {
    now: 100000,
    map: w.map,
    zoneLiveRing: { cx: 0, cy: 0, r: w.map.radius * 4 },
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
    zoneNextRing: () => null,
    zonePhase: () => ({ phase: 'idle', closesInMs: null }),
    zoneSafeDisc() {
      return this.zoneLiveRing;
    },
  };
}

function mkMind(profile: BotProfileId, seed = 7): BotMind {
  return {
    rng: mulberry32(seed),
    spendRng: mulberry32(seed + 1),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile,
    phase: 0,
    view: null,
    viewAt: -1,
    contacts: new Map(),
    wakeCells: [],
    lastSweep: -1,
    targetKey: null,
    posture: 'reposition',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

/** An island-free world (the doctrine is about the bot, not mapgen). */
function openWorld(seed: number): World {
  const w = new World(seed, 8);
  w.map.islands.length = 0;
  return w;
}

function mkBot(w: World, hullId: ShipClassId, x = 0, y = 0, heading = 0): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', hullId, undefined, { x, y });
  fitClassWeapons(w, rec);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Mount `gun` in slot 0 (full pool) and empty the weapon row and the belt, so
 *  the gun is the only shot the brain can choose. */
function mountGun(rec: ShipRecord, id: 'gun' | 'machineGun' | 'flak'): void {
  rec.loadout[0] = { equipmentId: id, state: { n: rec.stats.equipment[id].maxAmmo, reloadMsLeft: 0 } };
  for (let i = 2; i < rec.loadout.length; i += 1) rec.loadout[i] = { equipmentId: null, state: null };
}

function track(now: number, over: Partial<RememberedContact> = {}): RememberedContact {
  return {
    id: 'tgt',
    x: 0,
    y: 0,
    heading: null,
    speed: null,
    seenAt: now,
    live: true,
    sunk: false,
    cls: 'torpedoBoat' as HullId,
    fleet: false,
    firstSeenAt: now - CONFIG.bots.reactionMs * 4,
    hits: 0,
    vx: null,
    vy: null,
    vAt: -1,
    vSrc: null,
    paintX: 0,
    paintY: 0,
    paintAt: -1,
    missSweptAt: -1,
    ...over,
  };
}

function plot(mind: BotMind, t: RememberedContact): RememberedContact {
  mind.contacts.set(t.id ?? `a:${t.x}:${t.y}`, t);
  return t;
}

/** A view (never folded: viewAt stays -1) carrying only the given rows. */
function setView(mind: BotMind, over: Partial<PerceptionView>): void {
  mind.view = { contacts: [], events: [], mines: [], litZones: [], burnZones: [], foulZones: [], decoys: [], clouds: [], ...over };
}

function litZone(by: string, x: number, y: number, until: number): LitZoneView {
  return { id: `z-${by}`, x, y, r: CONFIG.starShells.litRadius, until, by };
}

function ctxOf(
  rec: ShipRecord,
  mind: BotMind,
  port: BotWorldPort,
  posture: BotPosture,
  target: RememberedContact | null,
  slot = 0,
): TacticContext {
  return { self: rec, mind, sit: situationOf(rec, mind, port), port, target, posture, slot };
}

const withNudge = (p: BotProfile, bandNudge: number): BotProfile => ({ ...p, bandNudge }) as BotProfile;

// ---------------------------------------------------------------------------

describe('the doctrine band (amendment 198)', () => {
  it('the cannon band is CONFIG.bots.gunBand.cannon × rangeU, both edges shifted by the profile nudge', () => {
    const w = openWorld(9131);
    const rec = mkBot(w, 'battleship');
    const R = rec.stats.equipment.gun.rangeU;
    const [lo, hi] = CONFIG.bots.gunBand.cannon;
    for (const n of [0, 0.1, -0.05]) {
      const band = gunBand(withNudge(profileOf('bulwark'), n), rec.stats, 'gun');
      expect(band.min).toBeCloseTo((lo + n) * R, 9);
      expect(band.max).toBeCloseTo((hi + n) * R, 9);
      expect(band.holdFireAboveU).toBe(Infinity); // the cannon never holds fire
    }
  });

  it('the machine gun and flak close (min 0) and their far edge is the hold-fire line', () => {
    const w = openWorld(9132);
    const rec = mkBot(w, 'torpedoBoat');
    for (const gun of ['machineGun', 'flak'] as const) {
      const R = rec.stats.equipment[gun].rangeU;
      const band = gunBand(withNudge(profileOf('bulwark'), 0.05), rec.stats, gun);
      expect(band.min).toBe(0);
      expect(band.max).toBeCloseTo((CONFIG.bots.gunBand[gun][1] + 0.05) * R, 9);
      expect(band.holdFireAboveU).toBe(band.max);
    }
  });

  it('mountedGun: the two pickable guns by id, anything else the cannon; the full radius is the attenuation fraction', () => {
    expect(mountedGun('machineGun')).toBe('machineGun');
    expect(mountedGun('flak')).toBe('flak');
    expect(mountedGun('gun')).toBe('gun');
    expect(mountedGun(null)).toBe('gun');
    const w = openWorld(9133);
    const rec = mkBot(w, 'battleship');
    const reach = effectiveReach({ stats: rec.stats, ownLitZones: [], origin: { x: 0, y: 0 } }, 'gun');
    expect(reach.maxU).toBe(rec.stats.equipment.gun.rangeU);
    expect(reach.fullU).toBeCloseTo(CONFIG.gunAttenuation.fullFrac * reach.maxU, 9);
  });

  it('ownLitZones keeps only this hull\'s LIVE zones', () => {
    const zones = [litZone('me', 0, 0, 2000), litZone('them', 0, 0, 2000), { ...litZone('me', 5, 5, 999), id: 'old' }];
    expect(ownLitZones(zones, 'me', 1000).map((z) => z.id)).toEqual(['z-me']);
    expect(ownLitZones(zones, null, 1000)).toEqual([]);
  });
});

describe('the MG / flak hold and the lit lift (amendments 187, 198)', () => {
  it('MACHINE GUN: past the hold line it holds fire; inside it it streams', () => {
    const w = openWorld(9134);
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat');
    mountGun(rec, 'machineGun');
    const R = rec.stats.equipment.machineGun.rangeU;
    const hold = gunBand(profileOf('bulwark'), rec.stats, 'machineGun').holdFireAboveU;
    expect(hold).toBeLessThan(0.8 * R);
    const far = mkMind('bulwark');
    plot(far, track(port.now, { x: 0.8 * R }));
    expect(COMBAT_BRAIN.decide(rec, far, port).held).toBe(false);
    const near = mkMind('bulwark');
    plot(near, track(port.now, { x: 0.9 * hold }));
    expect(COMBAT_BRAIN.decide(rec, near, port).held).toBe(true);
    expect(near.lastTactic).toBe('machineGun');
  });

  it('FLAK: bursts only inside the hold line', () => {
    const w = openWorld(9135);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship');
    mountGun(rec, 'flak');
    const R = rec.stats.equipment.flak.rangeU;
    const hold = gunBand(profileOf('bulwark'), rec.stats, 'flak').holdFireAboveU;
    const far = mkMind('bulwark');
    plot(far, track(port.now, { x: (hold + R) / 2 }));
    expect(COMBAT_BRAIN.decide(rec, far, port).fireSlot).toBeNull();
    const near = mkMind('bulwark');
    plot(near, track(port.now, { x: 0.9 * hold }));
    expect(COMBAT_BRAIN.decide(rec, near, port).fireSlot).toBe(0);
  });

  it('KITE LIFTS THE HOLD (Eric 2026-10-17, amendment 205): MG / flak at 0.8 × range hold in engage / pursue and fire while shadowing; the cannon is unchanged', () => {
    const w = new World(91318, 32);
    w.map.islands.length = 0;
    const port = fakePort(w);
    const solveAt = (hull: ShipClassId, gun: 'gun' | 'machineGun' | 'flak', posture: BotPosture): ReturnType<typeof EQUIPMENT_TACTICS.gun.solve> => {
      const rec = mkBot(w, hull);
      mountGun(rec, gun);
      const mind = mkMind('bulwark');
      const t = plot(mind, track(port.now, { x: rec.state.x + 0.8 * rec.stats.equipment[gun].rangeU, y: rec.state.y }));
      return EQUIPMENT_TACTICS[gun].solve(ctxOf(rec, mind, port, posture, t));
    };
    for (const [hull, gun] of [['torpedoBoat', 'machineGun'], ['battleship', 'flak']] as const) {
      expect(gunBand(profileOf('bulwark'), mkBot(w, hull).stats, gun).holdFireAboveU).toBeLessThan(
        0.8 * mkBot(w, hull).stats.equipment[gun].rangeU,
      );
      expect(solveAt(hull, gun, 'engage'), `${gun} engage`).toBeNull();
      expect(solveAt(hull, gun, 'pursue'), `${gun} pursue`).toBeNull();
      expect(solveAt(hull, gun, 'kite'), `${gun} kite`).not.toBeNull();
    }
    // The cannon never held: it fires at 0.8 × range in every posture.
    for (const posture of ['engage', 'pursue', 'kite'] as const) expect(solveAt('battleship', 'gun', posture), posture).not.toBeNull();
    // The band read itself: shadowing lifts the MG / flak line to the full rangeU.
    const tb = mkBot(w, 'torpedoBoat');
    expect(gunBand(profileOf('bulwark'), tb.stats, 'machineGun', true).holdFireAboveU).toBe(tb.stats.equipment.machineGun.rangeU);
    expect(gunBand(profileOf('bulwark'), tb.stats, 'gun', true).holdFireAboveU).toBe(Infinity);
  });

  it('a shot beyond range into an OWN live lit zone is solved; into another\'s, or an expired own one, refused', () => {
    const w = openWorld(9136);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship');
    mountGun(rec, 'gun');
    const x = rec.stats.equipment.gun.rangeU + 150;
    const solveWith = (zones: LitZoneView[]): ReturnType<typeof EQUIPMENT_TACTICS.gun.solve> => {
      const mind = mkMind('bulwark');
      const t = plot(mind, track(port.now, { x }));
      setView(mind, { litZones: zones });
      return EQUIPMENT_TACTICS.gun.solve(ctxOf(rec, mind, port, 'pursue', t));
    };
    const own = solveWith([litZone(rec.id, x, 0, port.now + 4000)]);
    expect(own).not.toBeNull();
    expect(own!.aimDist).toBeGreaterThan(rec.stats.equipment.gun.rangeU);
    expect(solveWith([litZone('other', x, 0, port.now + 4000)])).toBeNull();
    expect(solveWith([litZone(rec.id, x, 0, port.now)])).toBeNull();
  });

  it('the MG hold is waived inside own light: past the hold line, and past reach, a lit plot streams', () => {
    const w = openWorld(9137);
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat');
    mountGun(rec, 'machineGun');
    const x = rec.stats.equipment.machineGun.rangeU + 100;
    const mind = mkMind('bulwark');
    plot(mind, track(port.now, { x }));
    setView(mind, { litZones: [litZone(rec.id, x, 0, port.now + 4000)] });
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.held).toBe(true);
    expect(d.aimDist).toBeGreaterThan(rec.stats.equipment.machineGun.rangeU);
  });
});

describe('flare to shoot (amendment 198)', () => {
  /** A siege Battleship (cannon + star shells) and a FRESH radar plot past the
   *  cannon's reach, inside flare reach. */
  function setup(seed: number): { port: BotWorldPort & { now: number }; rec: ShipRecord; mind: BotMind; t: RememberedContact; flares: number } {
    const w = openWorld(seed);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship');
    const flares = rec.loadout.findIndex((s) => s.equipmentId === 'starShells');
    expect(flares).toBeGreaterThanOrEqual(0);
    const gunR = rec.stats.equipment.gun.rangeU;
    const flareR = rec.stats.equipment.starShells.rangeU;
    expect(flareR).toBeGreaterThan(gunR);
    const mind = mkMind('siege');
    const t = plot(mind, track(port.now, { x: (gunR + flareR) / 2, live: false, cls: null }));
    return { port, rec, mind, t, flares };
  }

  it('fires at a radar plot beyond gun reach inside flare reach — and not while breaking off', () => {
    const { port, rec, mind, t, flares } = setup(9138);
    const ctx = ctxOf(rec, mind, port, 'pursue', t, flares);
    expect(FLARE_TO_SHOOT.want(ctx)).toBe(true);
    const shot = EQUIPMENT_TACTICS.starShells.solve(ctx);
    expect(shot).not.toBeNull();
    expect(shot!.aimDist).toBeGreaterThan(rec.stats.equipment.gun.rangeU);
    expect(mind.lastTactic).toBe('flareToShoot');
    for (const posture of ['disengage', 'hide', 'ringRun'] as const) {
      expect(FLARE_TO_SHOOT.want(ctxOf(rec, mind, port, posture, t, flares)), posture).toBe(false);
    }
  });

  it('a target inside gun reach, a live target, or one already in own light: no flare to shoot', () => {
    const { port, rec, mind, t, flares } = setup(9139);
    const inReach = { ...t, x: rec.stats.equipment.gun.rangeU * 0.9 };
    expect(FLARE_TO_SHOOT.want(ctxOf(rec, mind, port, 'pursue', inReach, flares))).toBe(false);
    expect(FLARE_TO_SHOOT.want(ctxOf(rec, mind, port, 'pursue', { ...t, live: true }, flares))).toBe(false);
    setView(mind, { litZones: [litZone(rec.id, t.x, 0, port.now + 4000)] });
    expect(FLARE_TO_SHOOT.want(ctxOf(rec, mind, port, 'pursue', t, flares))).toBe(false);
  });

  it('both star-shell rows want the one reload: the shoot use wins', () => {
    const { port, rec, mind, t, flares } = setup(9140);
    // A LOST plot the sensor flare would light (stale, past sight, inside flare
    // reach) on another bearing, nearer than the target.
    plot(mind, track(port.now, { id: 'lost', x: 0, y: CONFIG.vision.sight + 200, live: false, seenAt: port.now - 5000 }));
    const shot = EQUIPMENT_TACTICS.starShells.solve(ctxOf(rec, mind, port, 'pursue', t, flares));
    expect(shot).not.toBeNull();
    expect(mind.lastTactic).toBe('flareToShoot');
    expect(Math.abs(wrapAngle(shot!.aim))).toBeLessThan(Math.PI / 4); // toward the target (east), not the lost plot (north)
    // Breaking off, the same tick's flare is the sensor use.
    const off = EQUIPMENT_TACTICS.starShells.solve(ctxOf(rec, mind, port, 'disengage', t, flares));
    expect(off).not.toBeNull();
    expect(mind.lastTactic).toBe('starShells');
  });

  it('END TO END through the brain: the siege bot flares the far plot', () => {
    const { port, rec, mind, flares } = setup(9141);
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBe(flares);
  });
});

describe('special / consumable triggers (amendment 199)', () => {
  it('HUNKER and SHIELD BLOCK: pressed in pursue / kite / disengage / hide with a hostile in weapon reach — not without', () => {
    const w = openWorld(9142);
    const port = fakePort(w);
    const bs = mkBot(w, 'battleship');
    const R = bs.stats.equipment.gun.rangeU;
    const hunker = SHIFT_TACTICS.battleship;
    const shield = CONSUMABLE_TACTICS.shieldBlock;
    for (const posture of ['pursue', 'kite', 'disengage', 'hide'] as const) {
      const near = mkMind('bulwark');
      const t = plot(near, track(port.now, { x: 0.9 * R }));
      expect(hunker.want(ctxOf(bs, near, port, posture, t)), posture).toBe(true);
      expect(shield.want(ctxOf(bs, near, port, posture, t)), posture).toBe(true);
      const far = mkMind('bulwark');
      const u = plot(far, track(port.now, { x: R + 100 }));
      expect(hunker.want(ctxOf(bs, far, port, posture, u)), posture).toBe(false);
    }
    // A neutral PvE fleet hull in reach is no hostile; a reposition posture presses nothing.
    const fleet = mkMind('bulwark');
    const f = plot(fleet, track(port.now, { x: 0.5 * R, cls: 'droneSmall' as HullId, fleet: true }));
    expect(hunkerCues(ctxOf(bs, fleet, port, 'pursue', f))).toBe(false);
    const idle = mkMind('bulwark');
    const i = plot(idle, track(port.now, { x: 0.5 * R }));
    expect(hunkerCues(ctxOf(bs, idle, port, 'reposition', i))).toBe(false);
  });

  it('HUNKER in the last seconds before a ram: the ram posture with the target inside ramReachU', () => {
    const w = openWorld(9143);
    const port = fakePort(w);
    const bs = mkBot(w, 'battleship');
    const mind = mkMind('raider');
    const t = plot(mind, track(port.now, { x: CONFIG.bots.ramReachU * 0.9 }));
    expect(hunkerCues(ctxOf(bs, mind, port, 'ram', t))).toBe(true);
    // The same posture with the target (somehow) past the ram reach and no
    // other hostile: the ram clause does not fire, and ram is not a reach posture.
    const far = mkMind('raider');
    const u = plot(far, track(port.now, { x: bs.stats.equipment.gun.rangeU + 100 }));
    expect(hunkerCues(ctxOf(bs, far, port, 'ram', u))).toBe(false);
  });

  it('COUNTERMEASURE on a declined fight: a healthy bot kiting / hiding / repositioning with a hostile on radar presses once — never over its own cloud', () => {
    const w = openWorld(9144);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat');
    const cm = CONSUMABLE_TACTICS.countermeasure;
    const plotX = (CONFIG.vision.sight + tb.stats.radarRange) / 2;
    for (const posture of ['kite', 'hide', 'reposition'] as const) {
      const mind = mkMind('duelist');
      const t = plot(mind, track(port.now, { x: plotX, live: false, cls: null }));
      expect(cm.want(ctxOf(tb, mind, port, posture, t)), posture).toBe(true);
      mind.cloudUntil = port.now + 1000; // its own cloud is up
      expect(cm.want(ctxOf(tb, mind, port, posture, t)), posture).toBe(false);
    }
    // Nothing on the scope: no press; a healthy bot in pursue: no press.
    const empty = mkMind('duelist');
    expect(cm.want(ctxOf(tb, empty, port, 'kite', null))).toBe(false);
    const fight = mkMind('duelist');
    const t = plot(fight, track(port.now, { x: plotX, live: false, cls: null }));
    expect(cm.want(ctxOf(tb, fight, port, 'pursue', t))).toBe(false);
    // A HURT bot kiting is not declining a healthy fight; hiding from a radar
    // chaser still presses.
    tb.hp = tb.stats.maxHp * 0.05;
    const hurt = mkMind('duelist');
    const h = plot(hurt, track(port.now, { x: plotX, live: false, cls: null }));
    expect(cm.want(ctxOf(tb, hurt, port, 'kite', h))).toBe(false);
    expect(cm.want(ctxOf(tb, hurt, port, 'hide', h))).toBe(true);
  });

  it('RADAR BUOY (the DECOY BUOY\'s radar-decoy want, Story 10.9): dropped astern when breaking off from a radar chaser — not with an own RADAR buoy already out, not for a sighted contact', () => {
    const w = openWorld(9145);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat');
    w.applyCard(tb, 'radarBuoy');
    const slot = tb.loadout.findIndex((s) => s.equipmentId === 'radarBuoy');
    const decoy = CONSUMABLE_TACTICS.radarBuoy;
    const plotX = (CONFIG.vision.sight + tb.stats.radarRange) / 2;
    for (const posture of ['disengage', 'hide'] as const) {
      const mind = mkMind('duelist');
      const t = plot(mind, track(port.now, { x: -plotX, live: false, cls: null }));
      setView(mind, {});
      const ctx = ctxOf(tb, mind, port, posture, t, slot);
      expect(decoy.want(ctx), posture).toBe(true);
      const shot = decoy.solve(ctx);
      expect(shot).not.toBeNull();
      expect(inArc(shot!.aim, wrapAngle(tb.state.heading + REAR_SECTOR.offset), REAR_SECTOR.halfArc)).toBe(true);
      // An own buoy of ANOTHER kind does not block it (a kind counts once — ruling 5) ...
      setView(mind, { decoys: [{ id: 'd1', x: -50, y: 0, own: true, by: tb.id, kind: 'healing' }] });
      expect(decoy.want(ctxOf(tb, mind, port, posture, t, slot)), posture).toBe(true);
      // ... an own RADAR buoy already out does.
      setView(mind, { decoys: [{ id: 'd1', x: -50, y: 0, own: true, by: tb.id, kind: 'radar' }] });
      expect(decoy.want(ctxOf(tb, mind, port, posture, t, slot)), posture).toBe(false);
    }
    const sighted = mkMind('duelist');
    const s = plot(sighted, track(port.now, { x: -200, live: true }));
    setView(sighted, {});
    expect(decoy.want(ctxOf(tb, sighted, port, 'disengage', s, slot))).toBe(false);
    const pursuing = mkMind('duelist');
    const p = plot(pursuing, track(port.now, { x: -plotX, live: false, cls: null }));
    setView(pursuing, {});
    expect(decoy.want(ctxOf(tb, pursuing, port, 'pursue', p, slot))).toBe(false);
  });

  it('THE FOUR BUOYS (Story 10.9, ruling 7): HEALING when hurt (HULL REPAIR\'s read), SHIELD when engaged, SPEED when disengaging — never with an own buoy of that kind live', () => {
    const w = openWorld(9147);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat');
    const want = (id: 'healingBuoy' | 'shieldBuoy' | 'speedBuoy', posture: BotPosture, mind = mkMind('duelist')): boolean => {
      if (mind.view === null) setView(mind, {});
      return CONSUMABLE_TACTICS[id].want(ctxOf(tb, mind, port, posture, null));
    };
    // HEALING — the same hurt line as HULL REPAIR (the profile's healHpFrac), no new dial.
    const frac = profileOf('duelist').healHpFrac;
    tb.hp = tb.stats.maxHp * frac * 0.5;
    expect(want('healingBuoy', 'reposition')).toBe(CONSUMABLE_TACTICS.hullRepair.want(ctxOf(tb, mkMind('duelist'), port, 'reposition', null)));
    expect(want('healingBuoy', 'reposition')).toBe(true);
    const healingOut = mkMind('duelist');
    setView(healingOut, { decoys: [{ id: 'd1', x: 0, y: 0, own: true, by: tb.id, kind: 'healing' }] });
    expect(want('healingBuoy', 'reposition', healingOut)).toBe(false); // a kind counts once (ruling 5)
    tb.hp = tb.stats.maxHp;
    expect(want('healingBuoy', 'reposition')).toBe(false);
    // SHIELD — engaged only.
    expect(want('shieldBuoy', 'engage')).toBe(true);
    expect(want('shieldBuoy', 'reposition')).toBe(false);
    const shieldOut = mkMind('duelist');
    setView(shieldOut, { decoys: [{ id: 'd1', x: 0, y: 0, own: true, by: tb.id, kind: 'shield' }] });
    expect(want('shieldBuoy', 'engage', shieldOut)).toBe(false);
    // An ENEMY shield buoy is not ours: it never holds the drop back.
    const enemyOut = mkMind('duelist');
    setView(enemyOut, { decoys: [{ id: 'd1', x: 0, y: 0, own: false, by: 'x', kind: 'shield' }] });
    expect(want('shieldBuoy', 'engage', enemyOut)).toBe(true);
    // SPEED — disengaging only.
    expect(want('speedBuoy', 'disengage')).toBe(true);
    expect(want('speedBuoy', 'engage')).toBe(false);
    // A sinking hull wants none of them.
    tb.lifecycle = { kind: 'sinking', since: port.now };
    expect(want('speedBuoy', 'disengage')).toBe(false);
  });

  it('THE BUOY RING SOLVER (ruling 9): dead astern on open water; round the circle when astern is ashore; null when every bearing is', () => {
    const w = openWorld(9148);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0); // bow +x: astern is −x
    w.applyCard(tb, 'shieldBuoy');
    const slot = tb.loadout.findIndex((s) => s.equipmentId === 'shieldBuoy');
    const row = CONSUMABLE_TACTICS.shieldBuoy;
    const solve = (): ReturnType<typeof row.solve> => {
      const mind = mkMind('duelist');
      setView(mind, {});
      return row.solve(ctxOf(tb, mind, port, 'engage', null, slot));
    };
    const open = solve()!;
    expect(inArc(open.aim, wrapAngle(Math.PI), 1e-9)).toBe(true);
    expect(open.aimDist).toBe(CONFIG.mine.placeRange);
    // An island sitting on the astern drop point: the solver turns to another bearing, same range.
    const R = CONFIG.mine.placeRange;
    w.map.islands.push(circleIsland(-R, 0, 40));
    const turned = solve()!;
    expect(inArc(turned.aim, wrapAngle(Math.PI), 0.1)).toBe(false);
    expect(turned.aimDist).toBe(R);
    // Ring every candidate in rock: no drop.
    w.map.islands.length = 0;
    w.map.islands.push(circleIsland(0, 0, R + 50));
    expect(solve()).toBeNull();
  });

  it('FOULING SHELL in pursue: at the nearest live contact in sight that is moving AWAY — not one closing', () => {
    const w = openWorld(9146);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat');
    w.applyCard(tb, 'foulingShell');
    const slot = tb.loadout.findIndex((s) => s.equipmentId === 'foulingShell');
    const foul = CONSUMABLE_TACTICS.foulingShell;
    const x = Math.min(CONFIG.vision.sight, CONFIG.foulingShell.rangeU) * 0.6;
    const away = mkMind('duelist');
    const a = plot(away, track(port.now, { x, heading: 0, speed: 30 }));
    expect(foul.want(ctxOf(tb, away, port, 'pursue', a, slot))).toBe(true);
    expect(foul.solve(ctxOf(tb, away, port, 'pursue', a, slot))).not.toBeNull();
    const closing = mkMind('duelist');
    const c = plot(closing, track(port.now, { x, heading: Math.PI, speed: 30 }));
    expect(foul.want(ctxOf(tb, closing, port, 'pursue', c, slot))).toBe(false);
    const stopped = mkMind('duelist');
    const z = plot(stopped, track(port.now, { x, heading: 0, speed: 0 }));
    expect(foul.want(ctxOf(tb, stopped, port, 'pursue', z, slot))).toBe(false);
  });

  it('SUPERCAV: its credible range reads CONFIG.bots.supercavCredibleU', () => {
    const w = openWorld(9147);
    const tb = mkBot(w, 'torpedoBoat');
    expect(CONSUMABLE_TACTICS.supercavTorpedo.reachU(tb.stats)).toBe(CONFIG.bots.supercavCredibleU);
  });

  it('SPEED BOOST is never spent closing in kite, hold or hide-as-approach; pursue past the band boosts, hide always boosts', () => {
    const w = openWorld(9148);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat');
    const boost = SHIFT_TACTICS.torpedoBoat;
    const far = gunBand(profileOf('raider'), tb.stats).max + 50;
    const at = (posture: BotPosture): boolean => {
      const mind = mkMind('raider');
      const t = plot(mind, track(port.now, { x: far }));
      return boost.want(ctxOf(tb, mind, port, posture, t, 1));
    };
    expect(at('kite')).toBe(false);
    expect(at('hold')).toBe(false);
    expect(at('engage')).toBe(false);
    expect(at('pursue')).toBe(true);
    expect(at('hide')).toBe(true);
    expect(at('disengage')).toBe(true);
  });
});
