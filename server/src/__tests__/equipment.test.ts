// Structural + behavioral suite pinning the Story 1.2 equipment/loadout surface.
// Complements weapons.test.ts (per-weapon ballistics) by exercising the NEW
// generic seam: the Equipment interface + frozen registry, the ActivationResult
// denial vocabulary derived without changing internal effects, empty-slot
// safety, FR5 (a deselected slot still reloads every tick), the single dispatch
// path (the sinking-activation gate is the ONLY caller of Equipment.activate),
// and loadout init/respawn/redeploy parity with the shared defaultLoadout.
//
// Denials are driven through World.sinkingActivationGate — the public gate that
// returns the ActivationResult (never a wire event), mirroring how the World is
// the one production caller.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  CONFIG,
  SLOT_COUNT,
  SLOT_EXTRA,
  WEAPON,
  weaponMaxAmmo,
  type InputMsg,
  type WeaponId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { EQUIPMENT, weaponAmmo, type Equipment } from '../game/equipment/index.js';

const DT = CONFIG.tick.simDtMs;
/** Slot index -> equipment id under today's universal fit (slot 0/1/2). */
const WEAPON_IDS = ['gun', 'torpedo', 'mine'] as const;

// ---------- construction helpers ---------------------------------------------

/** World whose islands are cleared, for exact-geometry arc cases. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and pin it to the origin at a known heading (speed 0). */
function place(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, weapon: 0, ...patch };
}

/** Assert a ship carries the fresh universal loadout (matches defaultLoadout). */
function expectFreshLoadout(ship: ShipRecord): void {
  expect(ship.loadout).toHaveLength(SLOT_COUNT);
  for (let i = 0; i < SLOT_EXTRA; i++) {
    expect(ship.loadout[i].equipmentId).toBe(WEAPON_IDS[i]);
    expect(ship.loadout[i].state).toEqual({ n: weaponMaxAmmo(ship.stats, i as WeaponId), reloadMsLeft: 0 });
  }
  expect(ship.loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
}

// ---------- 1. registry / interface conformance ------------------------------

describe('EQUIPMENT registry — interface conformance', () => {
  it('every row exposes the Equipment interface with a key-matching id', () => {
    for (const [key, row] of Object.entries(EQUIPMENT)) {
      expect(row.id).toBe(key);
      expect(typeof row.isWeapon).toBe('boolean');
      expect(row.isWeapon).toBe(true); // all three current systems launch ordnance
      expect(typeof row.tick).toBe('function');
      expect(typeof row.activate).toBe('function');
    }
  });

  it('holds exactly gun / torpedo / mine', () => {
    expect(Object.keys(EQUIPMENT).sort()).toEqual(['gun', 'mine', 'torpedo']);
  });

  it('the registry itself is frozen — rows cannot be added', () => {
    expect(Object.isFrozen(EQUIPMENT)).toBe(true);
    expect(() => {
      (EQUIPMENT as unknown as Record<string, Equipment>).boost = EQUIPMENT.gun;
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

// ---------- 2. denial reasons, derived without effect changes -----------------

describe('denial reasons — derived through the gate without changing effects', () => {
  it('gun arc-miss denies out-of-arc and does NOT drain the pool', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: 0, weapon: WEAPON.gun }); // dead ahead — outside both beam arcs
    const before = { ...ship.loadout[WEAPON.gun].state! };
    const res = w.sinkingActivationGate(ship, ship.loadout[WEAPON.gun]);
    expect(res).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ship.loadout[WEAPON.gun].state).toEqual(before); // arc-miss keeps the round
  });

  it('gun empty pool denies no-ammo', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, weapon: WEAPON.gun }); // port beam — in arc
    ship.loadout[WEAPON.gun].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
    expect(w.sinkingActivationGate(ship, ship.loadout[WEAPON.gun])).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('torpedo out-of-arc denies and keeps the fish', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, weapon: WEAPON.torpedo }); // abeam — outside the bow arc
    const res = w.sinkingActivationGate(ship, ship.loadout[WEAPON.torpedo]);
    expect(res).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ship.loadout[WEAPON.torpedo].state).toEqual({ n: CONFIG.torpedo.maxAmmo, reloadMsLeft: 0 });
  });

  it('torpedo empty pool denies no-ammo', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: 0, weapon: WEAPON.torpedo }); // over the bow — in arc, but empty
    ship.loadout[WEAPON.torpedo].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    expect(w.sinkingActivationGate(ship, ship.loadout[WEAPON.torpedo])).toEqual({
      ok: false,
      reason: 'no-ammo',
    });
  });

  it('mine empty pool denies no-ammo (mines have no arc)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { weapon: WEAPON.mine });
    ship.loadout[WEAPON.mine].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    expect(w.sinkingActivationGate(ship, ship.loadout[WEAPON.mine])).toEqual({ ok: false, reason: 'no-ammo' });
  });
});

// ---------- 3. empty-slot safety ---------------------------------------------

describe('empty-slot safety — the gate answers before any dereference', () => {
  it('slot 3 (empty extra) denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(ship.loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
    expect(w.sinkingActivationGate(ship, ship.loadout[SLOT_EXTRA])).toEqual({
      ok: false,
      reason: 'empty-slot',
    });
  });

  it('an out-of-range / undefined slot denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(w.sinkingActivationGate(ship, ship.loadout[99])).toEqual({ ok: false, reason: 'empty-slot' });
  });
});

// ---------- 4. FR5: deselected slots still reload every tick -------------------

describe('FR5 — a deselected slot still reloads every tick', () => {
  it('with the gun selected, reloading torpedo AND mine slots advance', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { weapon: WEAPON.gun }); // gun selected; fireSeq 0 => no activation
    ship.loadout[WEAPON.torpedo].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    ship.loadout[WEAPON.mine].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    w.step();
    expect(ship.loadout[WEAPON.torpedo].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs - DT);
    expect(ship.loadout[WEAPON.mine].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - DT);
  });
});

// ---------- 5. the gate is the sole dispatch path -----------------------------

describe('the sinking-activation gate is the sole dispatch path to activate()', () => {
  const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
  // A row dispatch is always `EQUIPMENT[<id>].activate(` — fresh regex per use.
  const dispatchRe = (): RegExp => /EQUIPMENT\[[^\]]*\]\.activate\(/g;

  function gameSourceFiles(): string[] {
    return readdirSync(gameDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'))
      .map((f) => join(gameDir, f));
  }

  it('exactly one EQUIPMENT-row activate() call exists across all game sources', () => {
    let count = 0;
    for (const file of gameSourceFiles()) {
      count += (readFileSync(file, 'utf8').match(dispatchRe()) ?? []).length;
    }
    expect(count).toBe(1);
  });

  it('that single dispatch lives inside World.sinkingActivationGate', () => {
    const src = readFileSync(resolve(gameDir, 'world.ts'), 'utf8');
    const gateDef = src.indexOf('sinkingActivationGate(ship: ShipRecord'); // method def, not the call site
    const nextMethod = src.indexOf('activationContext(ship: ShipRecord', gateDef); // method that follows the gate
    const dispatch = src.search(dispatchRe());
    expect(gateDef).toBeGreaterThan(-1);
    expect(nextMethod).toBeGreaterThan(gateDef);
    expect(dispatch).toBeGreaterThan(gateDef);
    expect(dispatch).toBeLessThan(nextMethod);
  });
});

// ---------- 6. loadout init / respawn / redeploy parity -----------------------

describe('loadout init parity — addShip / respawn / redeploy', () => {
  it('addShip produces a full idle loadout matching weaponMaxAmmo, slot 3 empty', () => {
    const w = bareWorld();
    expectFreshLoadout(place(w, 'a'));
  });

  it('respawn (waiting-phase) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[WEAPON.gun].state = { n: 0, reloadMsLeft: 999 }; // dirty it, prove the rebuild
    w.sinkShip('a');
    const steps = Math.ceil(CONFIG.ship.respawnDelay / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(ship.alive).toBe(true);
    expectFreshLoadout(ship);
  });

  it('redeploy (resetForMatchStart) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[WEAPON.torpedo].state = { n: 0, reloadMsLeft: 500 }; // dirty it, prove the rebuild
    w.resetForMatchStart();
    expectFreshLoadout(ship);
  });
});

describe('weaponAmmo — fresh wire copies, not live pool references', () => {
  it('returns 3 fresh {n, reloadMsLeft} objects decoupled from slot state', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    const wire = weaponAmmo(ship);
    expect(wire).toHaveLength(SLOT_EXTRA); // slots 0..2 only
    for (let i = 0; i < SLOT_EXTRA; i++) {
      expect(wire[i]).not.toBe(ship.loadout[i].state); // a fresh copy, not the live pool object
      expect(Object.keys(wire[i])).toEqual(['n', 'reloadMsLeft']); // key order pinned for the wire
      expect(wire[i]).toEqual(ship.loadout[i].state); // same values
    }
  });
});
