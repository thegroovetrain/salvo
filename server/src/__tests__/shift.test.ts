// THE CLASS SHIFTS (Story 8.15, Eric rulings 2026-09-21/28, epic-8 amendments
// 89(c) and 97–102) — slot 1 is a FIXED ability per hull: SPEED BOOST on the
// Torpedo Boat (boost.test.ts), INSTANT RELOAD on the Mine Layer, DAMAGE CUT on
// the Battleship. This file pins:
//   * slot 1 per hull, from `classShift`, on every life boundary;
//   * INSTANT RELOAD: finishes exactly ONE reload per running weapon slot
//     (cannon / torpedo / mines; the MG magazine fills), the belt and the
//     Shift itself untouched, a 60 s cooldown (Eric 2026-10-02, amendment
//     232; was 45 s), `cooling` on a second press;
//   * DAMAGE CUT: an 8 s window on a 30 s cooldown, `damageCutUntil` on the
//     own frame only — never a contact or spectator field;
//   * THE NINE-COMBO PIN: every hull × every gun in a World mounts the gun's
//     module in slot 0, lands ONE hit for the CONFIG damage (5 direct / 12
//     burst / 15 burst), reveals with the matching `w`, and holds its Shift.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  GUN_IDS,
  MOUNTED_GUN,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  WEAPON_SLOTS,
  classShift,
  type GameEvent,
  type GunId,
  type InputMsg,
  type ShipClassId,
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

function place(w: World, id: string, hull: ShipClassId, gun: GunId = 'deckGun', x = 0, y = 0, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, gun);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function makeInput(patch: Partial<InputMsg>): InputMsg {
  return { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Press the Shift (actSeq edge on slot 1) and step once. */
function pressShift(w: World, id: string, seq: number): void {
  w.submitInput(id, makeInput({ seq, actSeq: seq, actSlot: SLOT_BOOST }));
  w.step();
}

// ---------- slot 1 per hull ---------------------------------------------------

describe('slot 1 is the hull\'s CLASS SHIFT (amendment 89(c))', () => {
  it.each([['torpedoBoat', 'boost'], ['mineLayer', 'instantReload'], ['battleship', 'damageCut']] as const)(
    '%s fits %s in slot 1 with a full single charge, and keeps it across redeploy and respawn',
    (hull, shift) => {
      const w = bareWorld();
      const a = place(w, 'a', hull);
      expect(classShift(hull)).toBe(shift);
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 1, reloadMsLeft: 0 });
      w.resetForMatchStart();
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      w.sinkShip('a', undefined);
      for (let i = 0; i < Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2; i++) w.step();
      expect(a.loadout[SLOT_BOOST].equipmentId).toBe(shift);
    },
  );

  it('a FLEET drone fits no Shift at all', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined);
    expect(d.loadout[SLOT_BOOST]).toEqual({ equipmentId: null, state: null });
  });

  it('the two new Shifts take the RELOAD ladder\'s cooldownScale like every row (60 s -> 45 s, 30 s -> 22.5 s)', () => {
    const w = bareWorld();
    const ml = place(w, 'ml', 'mineLayer');
    const bs = place(w, 'bs', 'battleship');
    for (let i = 0; i < 5; i++) {
      w.applyCard(ml, 'reload');
      w.applyCard(bs, 'reload');
    }
    expect(ml.stats.equipment.instantReload.reloadMs).toBe(45000); // 60000 × 0.75
    expect(bs.stats.equipment.damageCut.reloadMs).toBe(22500);
    expect(bs.stats.equipment.damageCut.durationMs).toBe(8000); // the window is not a reload
  });
});

// ---------- INSTANT RELOAD ----------------------------------------------------

describe('INSTANT RELOAD — the Mine Layer\'s Shift (amendments 97–98)', () => {
  /** A Mine Layer with cannon reloading (0, 2.1 s left), torpedo reloading
   *  (0), mines 1/2 reloading, and two HULL REPAIR copies in the belt. */
  function loaded(w: World): ShipRecord {
    const a = place(w, 'a', 'mineLayer');
    w.applyCard(a, 'heavyTorpedo');
    w.applyCard(a, 'navalMines');
    w.applyCard(a, 'navalMines'); // tier II: a 2-round rack
    w.applyCard(a, 'hullRepair');
    w.applyCard(a, 'hullRepair');
    a.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: 2100 };
    a.loadout[WEAPON_SLOTS[0]].state = { n: 0, reloadMsLeft: 12000 };
    const rackMax = a.stats.equipment.navalMines.maxAmmo;
    expect(rackMax).toBeGreaterThanOrEqual(2);
    a.loadout[WEAPON_SLOTS[1]].state = { n: rackMax - 1, reloadMsLeft: 4000 }; // one round short, reloading
    expect(a.loadout[WEAPON_SLOTS[1]].equipmentId).toBe('navalMines');
    return a;
  }

  it('finishes exactly ONE reload per running slot: cannon 1/0, torp 1/0, mines 2/0; the belt untouched; the Shift spent for 60 s', () => {
    const w = bareWorld();
    const a = loaded(w);
    const belt = a.loadout.slice(5).map((s) => ({ ...s, state: s.state === null ? null : { ...s.state } }));
    pressShift(w, 'a', 1);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(a.loadout[WEAPON_SLOTS[0]].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(a.loadout[WEAPON_SLOTS[1]].state).toEqual({ n: a.stats.equipment.navalMines.maxAmmo, reloadMsLeft: 0 });
    expect(a.loadout.slice(5)).toEqual(belt); // HULL REPAIR ×2, byte-identical
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: CONFIG.instantReload.reloadMs });
    expect(CONFIG.instantReload.reloadMs).toBe(60000);
  });

  it('a weapon that is NOT reloading is untouched, and a deep deficit tops up by ONE round only (never a refill)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'mineLayer');
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

  it('the MACHINE GUN magazine FILLS (5/12 mid partial swap -> 12, timer 0); an idle full magazine is untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'mineLayer', 'machineGun');
    a.loadout[SLOT_GUN].state = { n: 5, reloadMsLeft: 9000 };
    pressShift(w, 'a', 1);
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 12, reloadMsLeft: 0 });
    const w2 = bareWorld();
    const b = place(w2, 'b', 'mineLayer', 'machineGun');
    pressShift(w2, 'b', 1);
    expect(b.loadout[SLOT_GUN].state).toEqual({ n: 12, reloadMsLeft: 0 });
  });

  it('a second press inside the 60 s is refused no-ammo -> `cooling` on the wire, and touches nothing', () => {
    const w = bareWorld();
    const a = loaded(w);
    pressShift(w, 'a', 1);
    a.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: 2000 }; // the cannon fires again meanwhile
    pressShift(w, 'a', 2);
    expect(w.denialsFor('a')).toEqual([{ slot: SLOT_BOOST, reason: 'no-ammo', seq: 2 }]);
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0); // nothing finished
    expect(w.sinkingActivationGate(a, SLOT_BOOST)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('never touches ITSELF, and a click (fireSeq) on slot 1 is inert', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'mineLayer');
    a.loadout[SLOT_BOOST].state = { n: 0, reloadMsLeft: 20000 };
    w.submitInput('a', makeInput({ seq: 1, fireSeq: 1, slot: SLOT_BOOST }));
    w.step();
    expect(a.loadout[SLOT_BOOST].state!.n).toBe(0);
    expect(a.loadout[SLOT_BOOST].state!.reloadMsLeft).toBeCloseTo(20000 - DT, 6); // only the ordinary tick moved it
  });
});

// ---------- DAMAGE CUT --------------------------------------------------------

describe('DAMAGE CUT — the Battleship\'s Shift (amendments 99–102)', () => {
  it('opens an 8 s window at server apply time on a 30 s cooldown, and halves the next blow', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    pressShift(w, 'a', 1);
    expect(a.damageCutUntil).toBe(w.now + 8000);
    expect(a.loadout[SLOT_BOOST].state).toEqual({ n: 0, reloadMsLeft: 30000 });
    const gate = w as unknown as { applyDamage(v: ShipRecord, n: number, s: 'shell', by: string): void };
    gate.applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 7);
    // A second press inside the cooldown: no-ammo, the window not extended.
    pressShift(w, 'a', 2);
    expect(w.denialsFor('a')).toEqual([{ slot: SLOT_BOOST, reason: 'no-ammo', seq: 2 }]);
    expect(a.damageCutUntil).toBe(w.now - DT + 8000);
    // After the window: full damage.
    for (let i = 0; i < 160; i++) w.step();
    expect(w.now).toBeGreaterThanOrEqual(a.damageCutUntil);
    gate.applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 7 - 15);
  });

  it('`damageCutUntil` rides the OWN frame only — never a contact, an event, or an enemy\'s frame; omitted until a cut is opened', () => {
    const w = bareWorld();
    const a = place(w, 'a', 'battleship');
    const b = place(w, 'b', 'torpedoBoat', 'deckGun', 100, 0); // inside a's sight
    expect('damageCutUntil' in buildFrame(w, 'a').you!).toBe(false); // nothing opened yet
    pressShift(w, 'a', 1);
    const own = buildFrame(w, 'a');
    expect(own.you!.damageCutUntil).toBe(a.damageCutUntil);
    const enemy = buildFrame(w, 'b');
    expect(enemy.contacts.some((c) => c.id === 'a')).toBe(true);
    expect(JSON.stringify({ ...enemy, you: undefined })).not.toContain('damageCutUntil');
    expect('damageCutUntil' in enemy.you!).toBe(false); // b never opened one
    expect(JSON.stringify(buildFrame(w, 'b', 'finished'))).not.toContain('damageCutUntil'); // spectator view
    expect(b.damageCutUntil).toBe(0);
  });
});

// ---------- THE NINE-COMBO PIN ------------------------------------------------

describe('every hull × every gun (the nine-combo pin)', () => {
  const EXPECTED_DAMAGE: Record<GunId, number> = { deckGun: 16, machineGun: 5, flak: 12 };
  const EXPECTED_FAMILY: Record<GunId, string> = { deckGun: 'cannon', machineGun: 'mg', flak: 'flak' };

  for (const hull of SHIP_CLASS_IDS) {
    for (const gun of GUN_IDS) {
      it(`${hull} × ${gun}: slot 0 mounts ${MOUNTED_GUN[gun]}, one hit lands ${EXPECTED_DAMAGE[gun]}, reveals w:'${EXPECTED_FAMILY[gun]}', slot 1 holds ${classShift(hull)}`, () => {
        const w = bareWorld();
        const a = place(w, 'a', hull, gun);
        const target = place(w, 't', 'battleship', 'deckGun', 300, 0, Math.PI / 2); // broadside-on at 300 u
        expect(a.loadout[SLOT_GUN].equipmentId).toBe(MOUNTED_GUN[gun]);
        expect(a.loadout[SLOT_BOOST].equipmentId).toBe(classShift(hull));
        // Cannon and flak: one click at the target. Machine gun: one held sample.
        const held = gun === 'machineGun';
        w.submitInput('a', makeInput({ seq: 1, fireSeq: held ? 0 : 1, aimDist: 300, held }));
        const log: GameEvent[] = [];
        for (let i = 0; i < 40 && target.hp === target.stats.maxHp; i++) {
          if (i > 0) w.submitInput('a', makeInput({ seq: i + 1, fireSeq: held ? 0 : 1, aimDist: 300, held: false }));
          w.step();
          log.push(...w.tickEvents);
        }
        expect(target.hp).toBe(target.stats.maxHp - EXPECTED_DAMAGE[gun]);
        expect(log.filter((e) => e.k === 'shell')).toHaveLength(1);
        for (const e of log) if (e.k === 'shell') expect(e.w).toBe(EXPECTED_FAMILY[gun]);
        expect(log.filter((e) => e.k === 'hc')).toHaveLength(1);
      });
    }
  }
});
