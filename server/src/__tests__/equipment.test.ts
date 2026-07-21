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
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  SLOT_COUNT,
  SLOT_EXTRA,
  SLOT_GUN,
  equipmentMaxAmmo,
  type InputMsg,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { EQUIPMENT, slotAmmo, type Equipment } from '../game/equipment/index.js';

const DT = CONFIG.tick.simDtMs;
/** Slot index -> equipment id under today's universal fit (slot 0/1/2). */
const WEAPON_IDS = ['gun', 'torpedo', 'mine'] as const;
/** Torpedo / mine slot indices under the universal fit. */
const SLOT_TORPEDO = 1;
const SLOT_MINE = 2;

// ---------- construction helpers ---------------------------------------------

/** World whose islands are cleared, for exact-geometry arc cases. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and pin it to the origin at a known heading (speed 0). Battleship
 *  because this suite exercises the UNIVERSAL weapon fit [gun, torpedo, mine,
 *  empty] — which, post Story 1.6, lives on every hull EXCEPT the Torpedo Boat
 *  (it fits speedBoost in slot 2). WEAPON_IDS / SLOT_MINE below assume it. */
function place(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, 'battleship');
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, ...patch };
}

/** Assert a ship carries the fresh universal loadout (matches loadoutFor for a
 *  non-Torpedo-Boat hull: [gun, torpedo, mine, empty]). */
function expectFreshLoadout(ship: ShipRecord): void {
  expect(ship.loadout).toHaveLength(SLOT_COUNT);
  for (let i = 0; i < SLOT_EXTRA; i++) {
    expect(ship.loadout[i].equipmentId).toBe(WEAPON_IDS[i]);
    expect(ship.loadout[i].state).toEqual({ n: equipmentMaxAmmo(ship.stats, WEAPON_IDS[i]), reloadMsLeft: 0 });
  }
  expect(ship.loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
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

  it('holds exactly gun / torpedo / mine / speedBoost', () => {
    expect(Object.keys(EQUIPMENT).sort()).toEqual(['gun', 'mine', 'speedBoost', 'torpedo']);
  });

  // Content-level, NOT conformance: the weapon/ability split rides the shared
  // EQUIPMENT_IS_WEAPON map (single source) — the three weapons are weapons,
  // Story 1.6's speedBoost is the first non-weapon (isWeapon:false) ability row.
  it('each row mirrors the shared EQUIPMENT_IS_WEAPON split', () => {
    for (const [id, row] of Object.entries(EQUIPMENT)) {
      expect(row.isWeapon).toBe(EQUIPMENT_IS_WEAPON[id as keyof typeof EQUIPMENT_IS_WEAPON]);
    }
    expect(EQUIPMENT.gun.isWeapon).toBe(true);
    expect(EQUIPMENT.torpedo.isWeapon).toBe(true);
    expect(EQUIPMENT.mine.isWeapon).toBe(true);
    expect(EQUIPMENT.speedBoost.isWeapon).toBe(false);
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
  it('the gun is NEVER out-of-arc (360°): a dead-ahead activation fires and spends the round', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: 0, aimDist: 300, slot: SLOT_GUN }); // dead ahead — the old mounts refused this
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: true });
    expect(ship.loadout[SLOT_GUN].state!.n).toBe(0); // single-shot pool spent
  });

  it('gun empty pool denies no-ammo (the shot cooldown — its ONLY denial)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, aimDist: 300, slot: SLOT_GUN });
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: false, reason: 'no-ammo' });
  });

  it('torpedo out-of-arc denies and keeps the fish', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: Math.PI / 2, slot: SLOT_TORPEDO }); // abeam — outside the bow arc
    const res = w.sinkingActivationGate(ship, SLOT_TORPEDO);
    expect(res).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: CONFIG.torpedo.maxAmmo, reloadMsLeft: 0 });
  });

  it('torpedo empty pool denies no-ammo', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { aim: 0, slot: SLOT_TORPEDO }); // over the bow — in arc, but empty
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_TORPEDO)).toEqual({
      ok: false,
      reason: 'no-ammo',
    });
  });

  it('mine empty pool denies no-ammo (mines have no arc)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { slot: SLOT_MINE });
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'no-ammo' });
  });
});

// ---------- 3. empty-slot safety ---------------------------------------------

describe('empty-slot safety — the gate answers before any dereference', () => {
  it('slot 3 (empty extra) denies empty-slot without crashing', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    expect(ship.loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
    expect(w.sinkingActivationGate(ship, SLOT_EXTRA)).toEqual({
      ok: false,
      reason: 'empty-slot',
    });
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
    w.sinkShip('a');
    expect(ship.alive).toBe(false);
    expect(w.sinkingActivationGate(ship, SLOT_GUN)).toEqual({ ok: false, reason: 'dead' });
  });
});

// ---------- 4. FR5: deselected slots still reload every tick -------------------

describe('FR5 — a deselected slot still reloads every tick', () => {
  it('with the gun selected, reloading torpedo AND mine slots advance', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { slot: SLOT_GUN }); // gun slot named; fireSeq 0 => no activation
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    w.step();
    expect(ship.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs - DT);
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - DT);
  });
});

// ---------- 4b. the empty extra slot is never ticked --------------------------

describe('the empty extra slot is never ticked', () => {
  it('behavioral: a full-loadout ship steps many ticks with slot 3 empty, world stays healthy while 0–2 reload', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { slot: SLOT_GUN }); // no click (fireSeq 0)
    // Drain the three weapon slots so their reload timers must tick down.
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    const N = 5;
    expect(() => {
      for (let i = 0; i < N; i++) w.step();
    }).not.toThrow();
    // Empty slot untouched — no state materialized, nothing to have ticked.
    expect(ship.loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
    // The fitted slots DID reload-tick (proves the loop ran, and skips only 3).
    expect(ship.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(CONFIG.gun.reloadMs - N * DT);
    expect(ship.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs - N * DT);
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - N * DT);
  });

  it("source: fireControl's per-slot tick loop guards on equipmentId !== null", () => {
    const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
    const src = readFileSync(resolve(gameDir, 'world.ts'), 'utf8');
    const fire = src.indexOf('private fireControl(');
    expect(fire).toBeGreaterThan(-1);
    const loopBody = src.slice(fire, src.indexOf('sinkingActivationGate(ship', fire));
    // The tick dispatch runs only for fitted slots.
    expect(/slot\.equipmentId !== null\)\s*EQUIPMENT\[slot\.equipmentId\]\.tick\(/.test(loopBody)).toBe(true);
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
  it('addShip produces a full idle loadout matching equipmentMaxAmmo, slot 3 empty', () => {
    const w = bareWorld();
    expectFreshLoadout(place(w, 'a'));
  });

  it('respawn (waiting-phase) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: 999 }; // dirty it, prove the rebuild
    w.sinkShip('a');
    const steps = Math.ceil(CONFIG.ship.respawnDelay / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(ship.alive).toBe(true);
    expectFreshLoadout(ship);
  });

  it('redeploy (resetForMatchStart) rebuilds the full loadout from stats', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: 500 }; // dirty it, prove the rebuild
    w.resetForMatchStart();
    expectFreshLoadout(ship);
  });
});

describe('slotAmmo — slot-aligned fresh wire copies, not live pool references', () => {
  it('returns SLOT_COUNT entries: fresh {n, reloadMsLeft} per fitted slot, null for empty', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    const wire = slotAmmo(ship);
    expect(wire).toHaveLength(SLOT_COUNT); // slot-aligned: one entry per loadout slot
    for (let i = 0; i < SLOT_EXTRA; i++) {
      expect(wire[i]).not.toBe(ship.loadout[i].state); // a fresh copy, not the live pool object
      expect(Object.keys(wire[i]!)).toEqual(['n', 'reloadMsLeft']); // key order pinned for the wire
      expect(wire[i]).toEqual(ship.loadout[i].state); // same values
    }
    expect(wire[SLOT_EXTRA]).toBeNull(); // empty slot => null (never a zero pool)
  });
});
