// THE SHIFTS (Story 8.15, Eric rulings 2026-09-21/28, epic-8 amendments
// 89(c) and 97–102; Story 10.4 made the Shift the SEAT's pick, epic-10
// amendment 9) — slot 1 holds SPEED BOOST (boost.test.ts), INSTANT RELOAD or
// HUNKER (was DAMAGE CUT until Story 9.9), whichever the captain picked. This
// file pins:
//   * slot 1 = the seat's Shift on every hull, on every life boundary;
//   * INSTANT RELOAD: finishes exactly ONE reload per running weapon slot
//     (torpedo / mines) and EVERY main-battery turret (Story 10.4), vents the
//     secondaries (heat 0, unlocked — Story 10.5, R10), leaves the HULL
//     REPAIR / SMOKE cooldowns and the Shift itself untouched, its cooldown,
//     `cooling` on a second press;
//   * HUNKER: its window on its cooldown, `hunkerUntil` on the own frame only —
//     never a contact or spectator field;
//   * every hull × every Shift mounts the MAIN BATTERY in slot 0 and the
//     seat's Shift in slot 1.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_SHIFT,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  WEAPON_SLOTS,
  damageMultiplierFor,
  type InputMsg,
  type ShiftId,
  type ShipClassId,
  abilityCode,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const SLOT_GUN = 0;

function bareWorld(seed = 17): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, hull: ShipClassId, shift: ShiftId = DEFAULT_SHIFT, x = 0, y = 0, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, shift);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function makeInput(patch: Partial<InputMsg>): InputMsg {
  return { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...patch };
}

/** Press the Shift (actSeq edge on slot 1) and step once. */
function pressShift(w: World, id: string, seq: number): void {
  w.submitInput(id, makeInput({ seq, actSeq: seq, act: 0 }));
  w.step();
}

// ---------- slot 1 per hull ---------------------------------------------------

describe('slot 1 is the SEAT\'s Shift (Story 10.4)', () => {
  it.each(SHIFT_IDS.map((sh) => [sh] as const))(
    '%s fits slot 1 with a full single charge on every hull, and keeps it across redeploy and respawn',
    (shift) => {
      for (const hull of SHIP_CLASS_IDS) {
        const w = bareWorld();
        const a = place(w, 'a', hull, shift);
        expect(a.shift).toBe(shift);
        expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
        expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 1, reloadMsLeft: 0 });
        w.resetForMatchStart();
        expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
        w.sinkShip('a', undefined);
        for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2; i++) w.step();
        expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      }
    },
  );

  it('a FLEET drone fits no Shift at all', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined);
    expect(d.loadout[SLOT_BOOST]).toEqual({ equipmentId: null, state: null });
  });

  it('RELOAD leaves the Shift cooldowns alone (Story 10.5, R10); HUNKER\'s window is not a reload either', () => {
    const w = bareWorld();
    const ml = place(w, 'ml', 'warspite', 'instantReload');
    const bs = place(w, 'bs', 'yamato', 'hunker');
    for (let i = 0; i < 5; i++) {
      w.applyCard(ml, 'reload');
      w.applyCard(bs, 'reload');
    }
    expect(ml.stats.cooldownScale).toBeLessThan(1);
    expect(ml.stats.equipment.instantReload.reloadMs).toBe(CONFIG.instantReload.reloadMs);
    expect(bs.stats.equipment.hunker.reloadMs).toBe(CONFIG.hunker.reloadMs);
    expect(bs.stats.equipment.hunker.durationMs).toBe(CONFIG.hunker.durationMs); // the window is not a reload (epic-9 amendments 86–88 / 110–117, Story 9.7)
  });
});

// ---------- INSTANT RELOAD ----------------------------------------------------

describe('INSTANT RELOAD (amendments 97–98; every turret since Story 10.4)', () => {
  /** An INSTANT RELOAD seat with every turret reloading, torpedo reloading
   *  (0), mines 1/2 reloading, the secondaries OVERHEATED and locked, and
   *  both cooldown abilities (C / V) cooling. */
  function loaded(w: World): ShipRecord {
    const a = place(w, 'a', 'warspite', 'instantReload');
    w.applyCard(a, 'heavyTorpedo');
    w.applyCard(a, 'navalMines');
    w.applyCard(a, 'navalMines'); // tier II: a 2-round rack
    a.sec = { heat: 1, locked: true, untilRoundMs: 0 };
    a.repairReadyAt = w.now + 40000;
    a.smokeReadyAt = w.now + 30000;
    a.turrets.forEach((t, i) => (t.reloadMsLeft = 2100 + i * 1000));
    a.loadout[WEAPON_SLOTS[0]].state = { n: 0, reloadMsLeft: 12000 };
    const rackMax = a.stats.equipment.navalMines.maxAmmo;
    expect(rackMax).toBeGreaterThanOrEqual(2);
    a.loadout[WEAPON_SLOTS[1]].state = { n: rackMax - 1, reloadMsLeft: 4000 }; // one round short, reloading
    expect(a.loadout[WEAPON_SLOTS[1]].equipmentId).toBe('navalMines');
    return a;
  }

  it('finishes EVERY turret (angles untouched) and exactly ONE reload per running Q/E/R slot, VENTS the secondaries, leaves C / V alone; the Shift spent for its full cooldown', () => {
    const w = bareWorld();
    const a = loaded(w);
    const repairReadyAt = a.repairReadyAt;
    const smokeReadyAt = a.smokeReadyAt;
    pressShift(w, 'a', 1);
    expect(a.turrets.every((t) => t.reloadMsLeft === 0)).toBe(true);
    // R10: heat zero and the overheat lock cleared, even from a locked gun.
    expect(a.sec.heat).toBe(0);
    expect(a.sec.locked).toBe(false);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.stats.equipment.mainBattery.maxAmmo, reloadMsLeft: 0 });
    expect(a.loadout[WEAPON_SLOTS[0]].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(a.loadout[WEAPON_SLOTS[1]].state).toEqual({ n: a.stats.equipment.navalMines.maxAmmo, reloadMsLeft: 0 });
    // R10: HULL REPAIR and SMOKE are not reloads — both stamps untouched.
    expect(a.repairReadyAt).toBe(repairReadyAt);
    expect(a.smokeReadyAt).toBe(smokeReadyAt);
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: CONFIG.instantReload.reloadMs });
    // ...and the own frame carries the vented heat through (the client corrects from it).
    expect(buildFrame(w, 'a').you!.sec).toEqual({ heat: 0, locked: false });
  });

  it('a vented gun that is still held fires on the very next step', () => {
    const w = bareWorld();
    const a = loaded(w);
    pressShift(w, 'a', 1);
    expect(a.sec.locked).toBe(false);
    w.submitInput('a', makeInput({ seq: 2, actSeq: 1, sec: true }));
    w.step();
    expect(a.sec.heat).toBeGreaterThan(0); // a round fired: its heat landed
  });

  it('a weapon that is NOT reloading is untouched, and a deep deficit tops up by ONE round only (never a refill)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'warspite', 'instantReload');
    w.applyCard(a, 'heavyTorpedo');
    w.applyCard(a, 'navalMines');
    for (let i = 0; i < 3; i++) w.applyCard(a, 'navalMines'); // tier IV: a deeper rack
    expect(a.stats.equipment.navalMines.maxAmmo).toBeGreaterThanOrEqual(3);
    a.loadout[WEAPON_SLOTS[1]].state = { n: 0, reloadMsLeft: 3000 }; // the whole rack short
    const idleTorp = { ...a.loadout[WEAPON_SLOTS[0]].state! };
    pressShift(w, 'a', 1);
    expect(a.loadout[WEAPON_SLOTS[0]].state).toEqual(idleTorp); // full and idle: untouched
    expect(a.loadout[WEAPON_SLOTS[1]].state!.n).toBe(1); // +1, never the whole rack
    // The rounds still short reload on the ORDINARY clock: the timer restarts
    // at the full reloadMs (a zero timer on a short pool would hand out a
    // second free round next tick).
    expect(a.loadout[WEAPON_SLOTS[1]].state!.reloadMsLeft).toBe(a.stats.equipment.navalMines.reloadMs);
    w.step();
    expect(a.loadout[WEAPON_SLOTS[1]].state!.n).toBe(1); // still 1 a tick later
  });

  it('a second press inside the 60 s is refused no-ammo -> `cooling` on the wire, and touches nothing', () => {
    const w = bareWorld();
    const a = loaded(w);
    pressShift(w, 'a', 1);
    a.turrets.forEach((t) => (t.reloadMsLeft = 2000)); // the battery fires again meanwhile
    pressShift(w, 'a', 2);
    expect(w.denialsFor('a')).toEqual([{ slot: SLOT_BOOST, reason: 'no-ammo', seq: 2, act: abilityCode('shift') }]);
    expect(a.turrets.every((t) => t.reloadMsLeft > 0)).toBe(true); // nothing finished
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
    expect(w.sinkingActivationGate(a, SLOT_BOOST)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('never touches ITSELF, and a click (fireSeq) on slot 1 is inert', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'warspite', 'instantReload');
    a.loadout[SLOT_BOOST].state = { n: 0, reloadMsLeft: 20000 };
    w.submitInput('a', makeInput({ seq: 1, fireSeq: 1, slot: SLOT_BOOST }));
    w.step();
    expect(a.loadout[SLOT_BOOST].state!.n).toBe(0);
    expect(a.loadout[SLOT_BOOST].state!.reloadMsLeft).toBeCloseTo(20000 - DT, 6); // only the ordinary tick moved it
  });
});

// ---------- HUNKER --------------------------------------------------------

describe('HUNKER (amendments 99–102)', () => {
  // Re-based by Story 9.7 (epic-9 amendments 86–88 / 110–117): the window is 10 s and the cut is +5
  // temporary Armor — at Tier 0 that is Armor 5 → ×0.5 (Story 9.9: +100 at K 100 → E 100,
  // still ×0.5, epic-9 amendment 144), so 15 → 7 still holds.
  it('opens the window at server apply time on its cooldown; inside it the next blow takes the armorBonus multiply, after it full damage (amendment 144)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'yamato', 'hunker');
    const hk = a.stats.equipment.hunker;
    pressShift(w, 'a', 1);
    expect(a.hunkerUntil).toBe(w.now + hk.durationMs);
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: hk.reloadMs });
    const gate = w as unknown as { applyDamage(v: ShipRecord, n: number, s: 'shell', by: string): void };
    // 'b' is no ship here: a missing attacker reads the AVERAGE POWER (Story 10.3).
    const cut = Math.max(1, Math.floor(15 * damageMultiplierFor(a.stats.armor + hk.armorBonus - CONFIG.index.base)));
    expect(cut).toBeLessThan(15);
    gate.applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - cut);
    // A second press inside the cooldown: no-ammo, the window not extended.
    pressShift(w, 'a', 2);
    expect(w.denialsFor('a')).toEqual([{ slot: SLOT_BOOST, reason: 'no-ammo', seq: 2, act: abilityCode('shift') }]);
    expect(a.hunkerUntil).toBe(w.now - DT + hk.durationMs);
    // After the window: full damage.
    for (let i = 0; i < hk.durationMs / DT; i++) w.step();
    expect(w.now).toBeGreaterThanOrEqual(a.hunkerUntil);
    // Full damage = the hull's OWN Armor curve with no bonus (the four hulls
    // do not sit at the index base, Story 10.4).
    const full = Math.max(1, Math.floor(15 * damageMultiplierFor(a.stats.armor - CONFIG.index.base)));
    expect(full).toBeGreaterThan(cut);
    gate.applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - cut - full);
  });

  it('`hunkerUntil` rides the OWN frame only — never a contact, an event, or an enemy\'s frame; omitted until a cut is opened', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'yamato', 'hunker');
    const b = place(w, 'b', 'bismarck', DEFAULT_SHIFT, 100, 0); // inside a's sight
    expect('hunkerUntil' in buildFrame(w, 'a').you!).toBe(false); // nothing opened yet
    pressShift(w, 'a', 1);
    const own = buildFrame(w, 'a');
    expect(own.you!.hunkerUntil).toBe(a.hunkerUntil);
    const enemy = buildFrame(w, 'b');
    expect(enemy.contacts.some((c) => c.id === 'a')).toBe(true);
    expect(JSON.stringify({ ...enemy, you: undefined })).not.toContain('hunkerUntil');
    expect('hunkerUntil' in enemy.you!).toBe(false); // b never opened one
    expect(JSON.stringify(buildFrame(w, 'b', 'finished'))).not.toContain('hunkerUntil'); // spectator view
    expect(b.hunkerUntil).toBe(0);
  });
});

// ---------- every hull × every Shift ------------------------------------------

describe('every hull × every Shift (Story 10.4)', () => {
  for (const hull of SHIP_CLASS_IDS) {
    for (const shift of SHIFT_IDS) {
      it(`${hull} × ${shift}: slot 0 mounts the main battery (one pool entry per turret), slot 1 the seat's Shift`, () => {
        const w = bareWorld();
        const a = place(w, 'a', hull, shift);
        expect(a.loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
        expect(a.loadout[SLOT_GUN].state).toEqual({ n: a.turrets.length, reloadMsLeft: 0 });
        expect(a.turrets.length).toBe(a.stats.equipment.mainBattery.maxAmmo);
        expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      });
    }
  }
});
