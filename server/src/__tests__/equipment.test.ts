// Structural + behavioral suite pinning the Story 1.2 equipment/loadout surface.
// Complements weapons.test.ts (per-weapon ballistics) by exercising the NEW
// generic seam: the Equipment interface + frozen registry, the ActivationResult
// denial vocabulary derived without changing internal effects, empty-slot
// safety, FR5 (a deselected slot still reloads every tick), the single dispatch
// path (the sinking-activation gate is the ONLY caller of Equipment.activate),
// and loadout init/respawn/redeploy parity with the shared loadoutFor.
//
// Denials are driven through World.sinkingActivationGate — the public gate that
// returns the ActivationResult (never a wire event), mirroring how the World is
// the one production caller.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  isAfloat,
  CONFIG,
  CATALOG,
  EQUIPMENT_IS_WEAPON,
  LINE_IDS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  WEAPON_SLOTS,
  familySlotFor,
  equipmentMaxAmmo,
  isStubLine,
  tierTargetOf,
  EQUIPMENT_IDS,
  SHIP_CLASS_IDS,
  SHIFT_IDS,
  type InputMsg,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import {
  EQUIPMENT,
  slotAmmo,
  slotRow,
  type Equipment,
} from '../game/equipment/index.js';

const DT = CONFIG.tick.simDtMs;
// THE FIXTURE IS SLOT_COUNT FIXED-ROLE SLOTS (Story 8.5's nine, eleven since Story 9.2). There is no per-hull fit
// left to name: EVERY captain spawns [gun, boost, <seed weapons>, ...] and
// the rest are empty. What still differs per hull is the SPAWN
// SEED (sim/catalog.ts), which lands its weapons in the weapon row (2, 3, 4)
// first-empty-first:
//   MINE LAYER   [gun, boost, navalMines,   empty ...]
//   TORPEDO BOAT [gun, boost, heavyTorpedo, empty ...]
// THE RADAR BUOY IS DELETED (Story 8.16). The cases that hand-fitted it into
// a free weapon slot to have a SECOND reloading weapon aboard now hand-fit a
// LIGHT TORPEDO there instead (fitSecond below) — the tick behaviour they pin
// is about "a fitted slot reloads", not about which weapon it is.
/** Mine Layer fit, in slot order (the rest are empty). Slot 1 is
 *  the hull's CLASS SHIFT since Story 8.15 (amendment 89(c)): INSTANT RELOAD
 *  on the Mine Layer. */
const ML_IDS = ['mainBattery', 'boost', null, 'navalMines'] as const; // the rack in the MINE family slot (Story 10.5)
/** Torpedo Boat fit, in slot order. */
const TB_IDS = ['mainBattery', 'boost', 'heavyTorpedo'] as const;
/** Each hull's single fixture weapon lands in its FAMILY slot (Story 10.5):
 *  the rack in the mine slot (E), the tube in the torpedo slot (Q). */
const SLOT_MINE = familySlotFor('navalMines')!;
const SLOT_TORPEDO = familySlotFor('heavyTorpedo')!;
/** The TORPEDO slot (Q) — free on the Mine Layer fixture, so it is where the
 *  tests hand-fit a second weapon (fitSecond — Mine Layer only). */
const SLOT_SECOND = familySlotFor('lightTorpedo')!;
/** The special-SHELL slot (R) — empty on every fixture hull: the empty-slot
 *  subject. */
const SLOT_EMPTY_WEAPON = familySlotFor('starShells')!;

// ---------- construction helpers ---------------------------------------------

/** World whose islands are cleared, for exact-geometry arc cases. `opts` is
 *  the injection seam the Story 8.7 belt cases use (a test consumable
 *  registry — production's is EMPTY, amendment 41). */
function bareWorld(seed = 7, opts?: WorldOptions): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

/** Add a MINE LAYER, FIT ITS RACK AS A CARD, and pin it to the origin at a
 *  known heading (speed 0) — the suite's default fixture: [gun, boost,
 *  navalMines, empty x6] covers a 360-degree weapon, an aimed weapon with a
 *  rear placement sector, an ability, and six empty slots in one hull. The
 *  role stays 'captain' so the FleetController never overwrites the scripted
 *  inputs.
 *
 *  THE RACK IS A CARD NOW (Story 8.10, amendment 62): the interim spawn seed
 *  is deleted, so the fixture fits it explicitly through the same applyCard
 *  path a real pick takes. Every dispatch, arc, pool and reload case below
 *  keeps its subject; only how the weapon got aboard changed. */
function place(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'warspite', undefined, undefined);
  fitClassWeapons(w, rec);
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** The TORPEDO BOAT sibling: [gun, boost, heavyTorpedo, empty x6], its tube
 *  fitted as a card for the same reason — every bow-arc case runs on it. */
function placeTb(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, undefined);
  fitClassWeapons(w, rec);
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...patch };
}

/** HAND-FIT A LIGHT TORPEDO into the second weapon slot (E) — written
 *  directly, with NO card behind it (so a rebuild from the cards drops it).
 *  Replaces the deleted radar buoy's `fitBuoy` (Story 8.16). */
function fitSecond(ship: ShipRecord): void {
  ship.loadout[SLOT_SECOND] = {
    equipmentId: 'lightTorpedo',
    state: { n: equipmentMaxAmmo(ship.stats, 'lightTorpedo'), reloadMsLeft: 0 },
  };
}

/** The hand-fitted second weapon's effective reload (ms). */
function secondReloadMs(ship: ShipRecord): number {
  return ship.stats.equipment.lightTorpedo.reloadMs;
}

/** Assert a ship carries its fresh SLOT_COUNT-slot fit: the named ids at full pool
 *  and an idle timer, with EVERY remaining slot empty. `ids` is passed rather
 *  than assumed, so a hull's fit is pinned HERE and not inherited. */
function expectFreshLoadout(ship: ShipRecord, ids: readonly ['mainBattery', ...(string | null)[]]): void {
  expect(ship.loadout).toHaveLength(SLOT_COUNT);
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === null) {
      expect(ship.loadout[i]).toEqual({ equipmentId: null, state: null });
      continue;
    }
    expect(ship.loadout[i].equipmentId).toBe(ids[i]);
    const id = ids[i] as Parameters<typeof equipmentMaxAmmo>[1];
    expect(ship.loadout[i].state).toEqual({ n: equipmentMaxAmmo(ship.stats, id), reloadMsLeft: 0 });
  }
  for (let i = ids.length; i < SLOT_COUNT; i++) {
    expect(ship.loadout[i]).toEqual({ equipmentId: null, state: null });
  }
}

// ---------- 1. registry / interface conformance ------------------------------

describe('EQUIPMENT registry — interface conformance', () => {
  it('every row exposes the Equipment interface with a key-matching id', () => {
    for (const [key, row] of Object.entries(EQUIPMENT)) {
      expect(row.id).toBe(key);
      expect(typeof row.isWeapon).toBe('boolean'); // structural only — content pinned separately
      expect(typeof row.tick).toBe('function');
      expect(typeof row.activate).toBe('function');
    }
  });

  it('holds exactly one row per EquipmentId — no more, no fewer — and the retired ids are absent', () => {
    // The registry is a bijection with the shared id list: a row for every
    // EquipmentId, and no row the id space does not name.
    expect(Object.keys(EQUIPMENT).sort()).toEqual([...EQUIPMENT_IDS].sort());
    expect(EQUIPMENT.phosphorShells!.isWeapon).toBe(true); // Story 8.17: a 360° damage weapon
    expect(Object.hasOwn(EQUIPMENT, 'radarBuoy')).toBe(false); // deleted end to end (Story 8.16)
    // Total in CONTENT since Story 8.15 (missile and monitor were CUT rather
    // than built — amendment 89e — so no EquipmentId is left without a row),
    // while the registry's TYPE stays Partial on purpose (see index.ts).
    for (const id of EQUIPMENT_IDS) expect(Object.hasOwn(EQUIPMENT, id), id).toBe(true);
    for (const id of ['missile', 'monitor', 'heatSeeking', 'radarBuoy']) expect(Object.hasOwn(EQUIPMENT, id), id).toBe(false);
  });

  // THE REGISTRY/CATALOG PIN (Story 8.1). The registry is PARTIAL over the
  // widened EquipmentId, and this is the invariant that makes that safe:
  // every NON-STUB catalog line's `slotFill` target has a module, and every
  // STUB line's target has none. When Stories 8.13–8.16 build a weapon they
  // flip its `stub` flag and this pin tightens automatically — it is what
  // stops an authored-but-unbuilt id from ever reaching a slot.
  it('every NON-STUB slotFill target has a module; every STUB target has none', () => {
    let nonStubTargets = 0;
    for (const id of LINE_IDS) {
      const target = tierTargetOf(CATALOG[id]);
      if (target === undefined || CATALOG[id].kind !== 'equipment') continue;
      const built = Object.hasOwn(EQUIPMENT, target);
      expect(built, `${id} -> ${target}`).toBe(!isStubLine(id));
      if (!isStubLine(id)) nonStubTargets += 1;
    }
    expect(nonStubTargets).toBeGreaterThan(0); // non-vacuity: the loop checked real lines
    // EVERY GUN LADDER'S HOST HAS A ROW (Story 8.15): `deckGun` -> gun,
    // `machineGun` -> machineGun, `flak` -> flak — the three mountable guns.
    let ladderHosts = 0;
    for (const id of LINE_IDS) {
      if (CATALOG[id].kind !== 'ladder') continue;
      const host = tierTargetOf(CATALOG[id]);
      if (host === undefined) continue;
      expect(Object.hasOwn(EQUIPMENT, host), `${id} -> ${host}`).toBe(true);
      expect(isStubLine(id), id).toBe(false);
      ladderHosts += 1;
    }
    expect(ladderHosts).toBeGreaterThan(0); // non-vacuity: the loop checked real ladders
    // The gun and the three class Shifts are slotless/base fits — no line
    // fills them, and they are exactly the registry rows no `slotFill` target
    // names.
    expect(Object.hasOwn(EQUIPMENT, 'gun')).toBe(true);
    for (const id of SHIFT_IDS) expect(Object.hasOwn(EQUIPMENT, id), id).toBe(true);
    // NO STUB EQUIPMENT OR LADDER LINE IS LEFT (STUB_ROWS drained, Story
    // 8.15); the one stub left is the depth-charge ADD-ON (Story 10.5).
    expect(LINE_IDS.filter((id) => isStubLine(id) && CATALOG[id].kind !== 'addon')).toEqual([]);
  });

  // Content-level, NOT conformance: the weapon/ability split rides the shared
  // EQUIPMENT_IS_WEAPON map (single source) — gun/torpedo/broadside/starShells
  // AND (as of Story 2.8, amendment 45) the mine are aimed-click weapons, and
  // the RADAR BUOY (click-placed since Story 7-5 wave 2) was deleted in Story
  // 8.16. boost (1.6)
  // and the class Shifts are the non-weapons.
  it('each row mirrors the shared EQUIPMENT_IS_WEAPON split', () => {
    for (const [id, row] of Object.entries(EQUIPMENT)) {
      expect(row!.isWeapon).toBe(EQUIPMENT_IS_WEAPON[id as keyof typeof EQUIPMENT_IS_WEAPON]);
    }
    expect(EQUIPMENT.gun!.isWeapon).toBe(true);
    expect(EQUIPMENT.heavyTorpedo!.isWeapon).toBe(true);
    expect(EQUIPMENT.lightTorpedo!.isWeapon).toBe(true); // Story 8.13
    expect(EQUIPMENT.captiveMines!.isWeapon).toBe(true); // Story 8.13
    expect(EQUIPMENT.foulingMines!.isWeapon).toBe(true); // Story 8.13 (amendment 81)
    // Story 2.8 (amendment 45) DELIBERATELY FLIPS the 1.8 ability pin: the mine
    // is a click-aimed weapon again (rear placement arc + placeRange).
    expect(EQUIPMENT.navalMines!.isWeapon).toBe(true);
    expect(EQUIPMENT.boost!.isWeapon).toBe(false);
    expect(EQUIPMENT.broadside!.isWeapon).toBe(true); // Story 7-5 wave 2
    expect(EQUIPMENT.starShells!.isWeapon).toBe(true); // Story 1.7
    // Story 10.5: the three lines that left the belt are slot WEAPONS.
    expect(EQUIPMENT.supercavTorpedo!.isWeapon).toBe(true);
    expect(EQUIPMENT.dazzleShells!.isWeapon).toBe(true);
    expect(EQUIPMENT.foulingShell!.isWeapon).toBe(true);
  });

  it('the registry itself is frozen — rows cannot be added', () => {
    expect(Object.isFrozen(EQUIPMENT)).toBe(true);
    expect(() => {
      (EQUIPMENT as unknown as Record<string, Equipment>).boost = EQUIPMENT.gun!;
    }).toThrow();
  });

  it('each row is frozen — fields cannot be mutated', () => {
    for (const row of Object.values(EQUIPMENT)) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(() => {
        (row as unknown as { isWeapon: boolean }).isWeapon = false;
      }).toThrow();
    }
  });
});

// ---------- 1b. slotRow — the one lookup for a slot's content -----------------

describe('slotRow — the one lookup for a slot\'s content (one registry since Story 10.5)', () => {
  it('resolves every EquipmentId to its EQUIPMENT row, and fails closed on null / an unknown id', () => {
    for (const id of EQUIPMENT_IDS) expect(slotRow(id), id).toBe(EQUIPMENT[id]);
    expect(slotRow(null)).toBeUndefined();
    expect(slotRow('hullRepair' as never)).toBeUndefined(); // a deleted consumable id: no row
  });
});

describe('denial reasons — derived through the gate without changing effects', () => {
  it('the gun is NEVER out-of-arc (360°): a dead-ahead activation fires and spends the round', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: 0, aimDist: 300, slot: SLOT_GUN }); // dead ahead — the old mounts refused this
    const full = ship.loadout[SLOT_GUN].state!.n;
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: true });
    expect(ship.loadout[SLOT_GUN].state!.n).toBe(full - 1); // one round spent
  });

  it('main battery with EVERY turret reloading denies no-ammo (its ONLY denial — `cooling` on the wire)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, aimDist: 300, slot: SLOT_GUN });
    for (const t of ship.turrets) t.reloadMsLeft = ship.stats.equipment.mainBattery.reloadMs; // the turrets are the truth
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('torpedo out-of-arc denies and keeps the tube (Story 10.6: astern of a FORE-only hull)', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { aim: Math.PI, aimDist: 300, slot: SLOT_TORPEDO }); // dead astern — outside the fore launcher's arc
    const res = w.sinkingActivationGate(ship, SLOT_TORPEDO);
    expect(res).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ship.launchers.flatMap((l) => l.tubes)).toEqual([0]);
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: 1, reloadMsLeft: 0 });
  });

  it('torpedo with every tube reloading denies no-ammo (`cooling` on the wire)', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    for (const l of ship.launchers) l.a = Math.PI / 2; // trained on the beam
    setInput(ship, { aim: ship.state.heading + Math.PI / 2, aimDist: 300, slot: SLOT_TORPEDO }); // abeam — in the band, but no tube loaded
    for (const l of ship.launchers) l.tubes.fill(ship.stats.equipment.heavyTorpedo.reloadMs); // the tubes are the truth
    expect(w.sinkingActivationGate(ship, SLOT_TORPEDO)).toEqual({
      ok: false,
      reason: 'no-ammo',
    });
  });

  it('mine with every rack empty denies no-ammo (in-arc, in-range aim — Story 2.8 aimed placement)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    // Heading 0 ⇒ the rear placement sector centers on π; aim astern, in range.
    setInput(ship, { aim: Math.PI, aimDist: CONFIG.mine.placeRange / 2, slot: SLOT_MINE });
    for (const r of ship.racks.racks) Object.assign(r, { n: 0, reloadMsLeft: ship.stats.equipment.navalMines.reloadMs }); // the racks are the truth
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(w.mines.size).toBe(0);
  });

  it('mine out-of-arc (bow click) and out-of-RANGE both deny out-of-arc, keeping the drop (Story 2.8)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    // Bow click: outside the rear sector entirely.
    setInput(ship, { aim: 0, aimDist: 20, slot: SLOT_MINE });
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'out-of-arc' });
    // Astern but past placeRange: the rack cannot reach — same aim-denial
    // channel (amendment 45 ruling).
    setInput(ship, { aim: Math.PI, aimDist: CONFIG.mine.placeRange + 1, slot: SLOT_MINE });
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'out-of-arc' });
    // Nothing consumed either way.
    expect(ship.loadout[SLOT_MINE].state).toEqual({ n: ship.stats.equipment.navalMines.maxAmmo, reloadMsLeft: 0 });
    expect(w.mines.size).toBe(0);
  });

});

// ---------- 2b. mine dispatch channel (Story 2.8: aimed weapon, fire control) --

describe('mine dispatch — the fire (fireSeq) channel, never activation (Story 2.8 flip of the 1.8 pin)', () => {
  it('a fireSeq CLICK astern places a mine at the clicked point; an actSeq press on the slot is inert', () => {
    const w = bareWorld();
    const ship = place(w, 'a'); // ML fit: mine at weapon slot 2; heading 0 => astern = pi
    // CLICK (weapon channel): places at the clicked point.
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 50, slot: SLOT_MINE, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    w.step();
    expect(w.mines.size).toBe(1);
    const [mine] = [...w.mines.values()];
    expect(mine.x).toBeCloseTo(ship.state.x - 50, 0); // AT the click (astern 50u; hull barely moved)
    // PRESS (ability channel) with a reloaded rack: a press names an ABILITY
    // (Story 10.5 — `act`), never a slot, so it can never reach the rack.
    // A FULL rack with an idle clock (Story 10.6: the racks are the truth) —
    // so the only thing that could move it is the press.
    const full = ship.stats.equipment.navalMines.maxAmmo;
    Object.assign(ship.racks.racks[0], { n: full, reloadMsLeft: 0 });
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 50, slot: SLOT_MINE, fireT: 0, actSeq: 1, act: 0, hornSeq: 0, held: false, sec: false });
    w.step();
    expect(w.mines.size).toBe(1); // no second mine — presses never reach a weapon
    expect(ship.loadout[SLOT_MINE].state).toEqual({ n: full, reloadMsLeft: 0 }); // charges intact
  });
});

// ---------- 3. empty-slot safety ---------------------------------------------

describe('empty-slot safety — the gate answers before any dereference', () => {
  it('an empty WEAPON slot (R) denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a'); // the tube fills only the torpedo slot
    expect(ship.loadout[SLOT_EMPTY_WEAPON]).toEqual({ equipmentId: null, state: null });
    expect(w.sinkingActivationGate(ship, SLOT_EMPTY_WEAPON)).toEqual({
      ok: false,
      reason: 'empty-slot',
    });
  });

  it('the index one past the last slot (SLOT_COUNT) denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(w.sinkingActivationGate(ship, SLOT_COUNT)).toEqual({ ok: false, reason: 'empty-slot' });
  });

  it('an out-of-range slot index denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(w.sinkingActivationGate(ship, 99)).toEqual({ ok: false, reason: 'empty-slot' });
  });

  it('a dead ship is refused first (dead), before any slot resolution', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, aimDist: 300, slot: SLOT_GUN }); // would fire if alive
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10): a SINKING hull still fires — only a foundered
    // one is refused. Cross the window before asserting.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(ship.lifecycle)).toBe(false);
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: false, reason: 'dead' });
  });
});

// ---------- 4. FR5: deselected slots still reload every tick -------------------

describe('FR5 — a deselected slot still reloads every tick', () => {
  it('with the gun selected, the reloading MINE and SECOND-weapon slots both advance', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    w.applyCard(ship, 'lightTorpedo'); // a second reloading weapon (Story 10.6: its tubes are the truth)
    setInput(ship, { slot: SLOT_GUN }); // gun slot named; fireSeq 0 => no activation
    const mineMs = ship.stats.equipment.navalMines.reloadMs;
    Object.assign(ship.racks.racks[0], { n: 0, reloadMsLeft: mineMs });
    ship.launchers[0].tubes[0] = secondReloadMs(ship);
    w.step();
    expect(ship.racks.racks[0].reloadMsLeft).toBe(mineMs - DT);
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(mineMs - DT);
    expect(ship.loadout[SLOT_SECOND].state!.reloadMsLeft).toBe(secondReloadMs(ship) - DT);
  });

  it('the same holds on the OTHER hull: a reloading TORPEDO advances under the gun', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { slot: SLOT_GUN });
    const ms = ship.stats.equipment.heavyTorpedo.reloadMs;
    ship.launchers[0].tubes[0] = ms;
    w.step();
    expect(ship.launchers[0].tubes[0]).toBe(ms - DT);
    expect(ship.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(ms - DT);
  });
});

// ---------- 4b. the empty slots are never ticked ------------------------------

describe('the empty slots are never ticked', () => {
  it('behavioral: a ship steps many ticks with an empty slot, world stays healthy while the fitted ones reload', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    w.applyCard(ship, 'lightTorpedo'); // a fitted torpedo slot, so the loop has more than the seed to do
    setInput(ship, { slot: SLOT_GUN }); // no click (fireSeq 0)
    // Drain the fitted slots so their reload timers must tick down.
    // Slot 0's pair is DERIVED from the turrets (Story 10.4): drain them.
    const batteryMs = ship.stats.equipment.mainBattery.reloadMs;
    for (const t of ship.turrets) t.reloadMsLeft = batteryMs;
    const mineMs = ship.stats.equipment.navalMines.reloadMs;
    Object.assign(ship.racks.racks[0], { n: 0, reloadMsLeft: mineMs });
    ship.launchers[0].tubes[0] = secondReloadMs(ship);
    const N = 5;
    expect(() => {
      for (let i = 0; i < N; i++) w.step();
    }).not.toThrow();
    // EVERY empty slot untouched — no state materialized, nothing to tick.
    for (const i of [SLOT_EMPTY_WEAPON]) {
      expect(ship.loadout[i]).toEqual({ equipmentId: null, state: null });
    }
    // The fitted slots DID reload-tick (proves the loop ran, and skips only 3).
    expect(ship.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(batteryMs - N * DT);
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(mineMs - N * DT);
    expect(ship.loadout[SLOT_SECOND].state!.reloadMsLeft).toBe(secondReloadMs(ship) - N * DT);
  });

  it("source: fireControl's per-slot tick loop dispatches through slotRow (which answers undefined for an empty slot)", () => {
    const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
    const src = readFileSync(resolve(gameDir, 'world.ts'), 'utf8');
    const fire = src.indexOf('private fireControl(');
    expect(fire).toBeGreaterThan(-1);
    const loopBody = src.slice(fire, src.indexOf('sinkingActivationGate(ship', fire));
    // The tick dispatch runs only for fitted slots — the `equipmentId !== null`
    // guard MOVED INTO `slotRow` in Story 8.7 (it answers undefined for a null
    // id), which is why the `?.` is now the whole guard. `?.` since Story 8.1:
    // the registry is PARTIAL over its id space, so an id with no built row
    // ticks nothing.
    expect(/slotRow\(slot\.equipmentId\)\?\.tick\(/.test(loopBody)).toBe(true);
    expect(/EQUIPMENT\[slot\.equipmentId\]/.test(loopBody)).toBe(false);
  });
});

// ---------- 5. the gate is the sole dispatch path -----------------------------

describe('the sinking-activation gate is the sole dispatch path to activate()', () => {
  const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');

  function gameSourceFiles(): string[] {
    return readdirSync(gameDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'))
      .map((f) => join(gameDir, f));
  }

  /** Line comments, block-comment bodies, and JSDoc lines are not real code. */
  function isCommentLine(line: string): boolean {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  }

  /** The source line containing byte offset `at`. */
  function lineAt(src: string, at: number): string {
    const start = src.lastIndexOf('\n', at - 1) + 1;
    const end = src.indexOf('\n', at);
    return src.slice(start, end === -1 ? undefined : end);
  }

  /**
   * Every REAL `activate(` call across game sources, excluding: (i) the
   * Equipment interface method declaration (no `.` receiver), (ii) match.ts's
   * unrelated `this.activate()` phase transition, and (iii) comment lines.
   * Returns each survivor as { file, index } (index = byte offset in file).
   */
  function realActivateCalls(): { file: string; index: number }[] {
    const hits: { file: string; index: number }[] = [];
    for (const file of gameSourceFiles()) {
      const src = readFileSync(file, 'utf8');
      const re = /\bactivate\(/g;
      for (let m = re.exec(src); m !== null; m = re.exec(src)) {
        const line = lineAt(src, m.index);
        if (isCommentLine(line)) continue; // (iii)
        if (src[m.index - 1] !== '.') continue; // (i) interface decl: no `.` receiver
        if (/\bthis\.activate\(/.test(line)) continue; // (ii) match.ts phase transition
        hits.push({ file, index: m.index });
      }
    }
    return hits;
  }

  /**
   * Byte bounds [start,end] of the method `name`'s body in `src`, found by
   * locating the definition (the occurrence NOT preceded by `.`, i.e. not a
   * call site) and brace-matching from its opening `{` — never by assuming
   * which method lexically follows it.
   */
  function methodBodyBounds(src: string, name: string): { start: number; end: number } {
    const needle = name + '(';
    let defAt = -1;
    for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + needle.length)) {
      if (src[at - 1] !== '.') { defAt = at; break; } // a def, not `this.<name>(`
    }
    expect(defAt).toBeGreaterThan(-1);
    let depth = 0;
    let start = -1;
    for (let i = defAt; i < src.length; i++) {
      if (src[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (src[i] === '}' && --depth === 0) return { start, end: i };
    }
    throw new Error('unbalanced braces');
  }

  it('exactly one real activate() call survives across all game sources', () => {
    const hits = realActivateCalls();
    expect(hits).toHaveLength(1);
    expect(hits[0].file.endsWith('world.ts')).toBe(true);
  });

  it('that single dispatch sits inside World.sinkingActivationGate (brace-matched body)', () => {
    const worldPath = resolve(gameDir, 'world.ts');
    const src = readFileSync(worldPath, 'utf8');
    const body = methodBodyBounds(src, 'sinkingActivationGate');
    const hit = realActivateCalls().find((h) => h.file === worldPath);
    expect(hit).toBeDefined();
    expect(hit!.index).toBeGreaterThan(body.start);
    expect(hit!.index).toBeLessThan(body.end);
  });
});

// ---------- 6. loadout init / respawn / redeploy parity -----------------------

describe('loadout init parity — addShip / respawn / redeploy', () => {
  it('addShip produces a full idle loadout matching equipmentMaxAmmo, the rest empty', () => {
    const w = bareWorld();
    expectFreshLoadout(place(w, 'a'), ML_IDS);
    expectFreshLoadout(placeTb(w, 'tb'), TB_IDS);
  });

  // THE SHAPE IS UNIVERSAL AND NOW IDENTICAL (Story 8.5 + 8.10): slots 0 and 1
  // hold the same equipment on every captain hull and the weapon row starts
  // EMPTY on all three — the spawn seed that used to differentiate them is
  // deleted (amendment 62), so at spawn only the DECK tells the hulls apart.
  it('every captain hull spawns the same shape: the MAIN BATTERY in 0, the SEAT\'S Shift in 1, an EMPTY weapon row', () => {
    const w = bareWorld();
    for (const [k, hull] of SHIP_CLASS_IDS.entries()) {
      const shift = SHIFT_IDS[k % SHIFT_IDS.length];
      const ship = w.addShip(hull, hull, 'captain', hull, undefined, undefined, shift);
      expect(ship.loadout).toHaveLength(SLOT_COUNT);
      // Story 10.4: slot 0 is the main battery, its pair the turret summary.
      expect(ship.loadout[SLOT_GUN].equipmentId).toBe('mainBattery');
      expect(ship.loadout[SLOT_GUN].state).toEqual({ n: ship.turrets.length, reloadMsLeft: 0 });
      expect(ship.turrets).toHaveLength(ship.stats.equipment.mainBattery.maxAmmo);
      // ...and slot 1 the SEAT's Shift (no longer the class's).
      expect(ship.shift).toBe(shift);
      expect(ship.loadout[SLOT_BOOST].equipmentId).toBe(shift);
      expect(ship.loadout[SLOT_BOOST].state).toEqual({ n: 1, reloadMsLeft: 0 });
      expect(WEAPON_SLOTS.map((i) => ship.loadout[i].equipmentId)).toEqual(
        Array<null>(WEAPON_SLOTS.length).fill(null),
      );
      expect(ship.cards).toEqual([]); // nothing is held at spawn any more
      expect(slotAmmo(ship)).toHaveLength(SLOT_COUNT);
    }
  });

  it('a FLEET hull spawns gun-only: every other slot empty, no boost (amendment 24)', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined);
    expect(d.loadout).toHaveLength(SLOT_COUNT);
    expect(d.loadout[SLOT_GUN].equipmentId).toBe('gun');
    for (let i = 1; i < SLOT_COUNT; i++) {
      expect(d.loadout[i]).toEqual({ equipmentId: null, state: null });
    }
    expect(d.cards).toEqual([]);
  });

  it('respawn (waiting-phase) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: 999 }; // dirty it, prove the rebuild
    w.sinkShip('a');
    // Story 5.2: the revive lands on the founder tick (window > respawn delay).
    const steps = Math.ceil(CONFIG.ship.sinkingWindowMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(isAfloat(ship.lifecycle)).toBe(true);
    expectFreshLoadout(ship, ML_IDS);
  });

  it('redeploy (resetForMatchStart) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: 500 }; // dirty it, prove the rebuild
    fitSecond(ship); // a hand-fitted slot the rebuild must clear — no card backs it
    // THE REDEPLOY PRESERVES THE BUILD ON EVERY PATH (Story 8.10 review, P1 —
    // the old sandbox-only wipe is retired): the rack CARD survives, so the
    // rebuilt fit is the suite's standard loadout straight away, with fresh
    // pools and no reload in flight. The hand-fitted torpedo, which no card
    // backs, is what the rebuild drops — that is the whole point of rebuilding
    // the loadout from the cards rather than keeping the array.
    w.resetForMatchStart();
    expect(ship.cards).toEqual(['navalMines']);
    expectFreshLoadout(ship, ML_IDS);
  });

  it('a FLEET hull keeps its gun-only fit through a redeploy (the fleet flag is load-bearing)', () => {
    const w = bareWorld();
    const d = w.addShip('d', 'D', 'fleet', 'droneSmall', undefined, undefined);
    w.resetForMatchStart();
    expect(d.loadout[SLOT_BOOST]).toEqual({ equipmentId: null, state: null }); // no boost grown
    for (let i = 1; i < SLOT_COUNT; i++) expect(d.loadout[i].equipmentId).toBeNull();
  });
});

describe('slotAmmo — slot-aligned fresh wire copies, not live pool references', () => {
  it('returns SLOT_COUNT entries: fresh {n, reloadMsLeft} per fitted slot, null for empty', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    const wire = slotAmmo(ship);
    expect(wire).toHaveLength(SLOT_COUNT); // slot-aligned: one entry per loadout slot
    for (let i = 0; i < ML_IDS.length; i++) {
      if (ML_IDS[i] === null) {
        expect(wire[i]).toBeNull();
        continue;
      }
      expect(wire[i]).not.toBe(ship.loadout[i].state); // a fresh copy, not the live pool object
      expect(Object.keys(wire[i]!)).toEqual(['n', 'reloadMsLeft']); // key order pinned for the wire
      expect(wire[i]).toEqual(ship.loadout[i].state); // same values
    }
    // Every empty slot => null (never a zero pool).
    for (let i = ML_IDS.length; i < SLOT_COUNT; i++) expect(wire[i]).toBeNull();
  });
});
