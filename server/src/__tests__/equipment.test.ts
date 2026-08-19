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
// THE FIXTURE MOVED TO REAL SHIP CLASSES (Story 5.6, epic-5 amendment 34).
// This suite was built on `droneMedium` because the drone hulls were the last
// carriers of the universal [gun, torpedo, mine, empty] fit; PvE fleet hulls
// now fit [gun, empty, empty, empty], so that fit no longer exists anywhere
// and the suite runs on the two hulls that actually carry these weapons:
//   MINE LAYER   [gun, mine, radarBuoy, empty]  — the gun/mine/empty-slot cases
//   TORPEDO BOAT [gun, torpedo, speedBoost, empty] — the torpedo cases
// Every slot index below is named per hull rather than assumed universal.
/** Mine Layer fit, by slot. */
const ML_IDS = ['gun', 'mine', 'radarBuoy'] as const;
/** Torpedo Boat fit, by slot. */
const TB_IDS = ['gun', 'torpedo', 'speedBoost'] as const;
/** Mine Layer slot indices. */
const SLOT_MINE = 1;
const SLOT_BUOY = 2;
/** Torpedo Boat slot index. */
const SLOT_TORPEDO = 1;

// ---------- construction helpers ---------------------------------------------

/** World whose islands are cleared, for exact-geometry arc cases. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a MINE LAYER and pin it to the origin at a known heading (speed 0) —
 *  the suite's default fixture: [gun, mine, radarBuoy, empty] covers a 360°
 *  weapon, an aimed weapon with a rear placement sector, an ability, and the
 *  empty extra slot in one hull. The role stays 'captain' so the
 *  FleetController never overwrites the scripted inputs. */
function place(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'mineLayer');
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** The TORPEDO BOAT sibling: [gun, torpedo, speedBoost, empty] — the only fit
 *  that carries a torpedo, so every bow-arc case runs on this hull. */
function placeTb(w: World, id: string, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat');
  rec.state = { x: 0, y: 0, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...patch };
}

/** Assert a ship carries its fresh per-hull fit: the three named ids at full
 *  pool and an idle timer, with the extra slot empty. `ids` is passed rather
 *  than assumed, so a hull's fit is pinned HERE and not inherited. */
function expectFreshLoadout(ship: ShipRecord, ids: readonly ['gun', ...string[]]): void {
  expect(ship.loadout).toHaveLength(SLOT_COUNT);
  for (let i = 0; i < SLOT_EXTRA; i++) {
    expect(ship.loadout[i].equipmentId).toBe(ids[i]);
    const id = ids[i] as Parameters<typeof equipmentMaxAmmo>[1];
    expect(ship.loadout[i].state).toEqual({ n: equipmentMaxAmmo(ship.stats, id), reloadMsLeft: 0 });
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

  it('holds exactly gun / torpedo / mine / speedBoost / broadside / starShells / radarBuoy', () => {
    expect(Object.keys(EQUIPMENT).sort()).toEqual([
      'broadside',
      'gun',
      'mine',
      'radarBuoy',
      'speedBoost',
      'starShells',
      'torpedo',
    ]);
  });

  // Content-level, NOT conformance: the weapon/ability split rides the shared
  // EQUIPMENT_IS_WEAPON map (single source) — gun/torpedo/broadside/starShells
  // AND (as of Story 2.8, amendment 45) the mine are aimed-click weapons, and
  // since Story 7-5 wave 2 so is the RADAR BUOY (click-placed in the mine's
  // rear sector, R2.7 — where the decoy buoy it replaced was an un-aimed
  // stern-drop ability). speedBoost (1.6) is the ONLY non-weapon left.
  it('each row mirrors the shared EQUIPMENT_IS_WEAPON split', () => {
    for (const [id, row] of Object.entries(EQUIPMENT)) {
      expect(row.isWeapon).toBe(EQUIPMENT_IS_WEAPON[id as keyof typeof EQUIPMENT_IS_WEAPON]);
    }
    expect(EQUIPMENT.gun.isWeapon).toBe(true);
    expect(EQUIPMENT.torpedo.isWeapon).toBe(true);
    // Story 2.8 (amendment 45) DELIBERATELY FLIPS the 1.8 ability pin: the mine
    // is a click-aimed weapon again (rear placement arc + placeRange).
    expect(EQUIPMENT.mine.isWeapon).toBe(true);
    expect(EQUIPMENT.speedBoost.isWeapon).toBe(false);
    expect(EQUIPMENT.broadside.isWeapon).toBe(true); // Story 7-5 wave 2
    expect(EQUIPMENT.starShells.isWeapon).toBe(true); // Story 1.7
    expect(EQUIPMENT.radarBuoy.isWeapon).toBe(true); // Story 7-5 wave 2 (R2.7): click-placed
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
    const ship = placeTb(w, 'a');
    setInput(ship, { aim: Math.PI / 2, slot: SLOT_TORPEDO }); // abeam — outside the bow arc
    const res = w.sinkingActivationGate(ship, SLOT_TORPEDO);
    expect(res).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: CONFIG.torpedo.maxAmmo, reloadMsLeft: 0 });
  });

  it('torpedo empty pool denies no-ammo', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { aim: 0, slot: SLOT_TORPEDO }); // over the bow — in arc, but empty
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_TORPEDO)).toEqual({
      ok: false,
      reason: 'no-ammo',
    });
  });

  it('mine empty pool denies no-ammo (in-arc, in-range aim — Story 2.8 aimed placement)', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    // Heading 0 ⇒ the rear placement sector centers on π; aim astern, in range.
    setInput(ship, { aim: Math.PI, aimDist: CONFIG.mine.placeRange / 2, slot: SLOT_MINE });
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    expect(w.sinkingActivationGate(ship, SLOT_MINE)).toEqual({ ok: false, reason: 'no-ammo' });
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
    expect(ship.loadout[SLOT_MINE].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 });
    expect(w.mines.size).toBe(0);
  });

  // RETIRED (Story 7-5 wave 2): "decoy empty pool denies no-ammo". The decoy
  // buoy is deleted; the RADAR BUOY in that slot is an UNIMPLEMENTED
  // PLACEHOLDER row this cycle (its behaviour is a later agent's), so it has
  // no denial matrix to pin yet — see the placeholder case below.
  it('the radarBuoy PLACEHOLDER refuses every activation with blocked, consuming nothing', () => {
    const w = bareWorld();
    const ml = place(w, 'ml');
    expect(ml.loadout[SLOT_BUOY].equipmentId).toBe('radarBuoy');
    expect(w.sinkingActivationGate(ml, SLOT_BUOY)).toEqual({ ok: false, reason: 'blocked' });
    // 'blocked' is the one denial documented to spend NOTHING: charge and
    // reload are both untouched.
    expect(ml.loadout[SLOT_BUOY].state).toEqual({ n: CONFIG.radarBuoy.maxAmmo, reloadMsLeft: 0 });
  });
});

// ---------- 2b. mine dispatch channel (Story 2.8: aimed weapon, fire control) --

describe('mine dispatch — the fire (fireSeq) channel, never activation (Story 2.8 flip of the 1.8 pin)', () => {
  it('a fireSeq CLICK astern places a mine at the clicked point; an actSeq press on the slot is inert', () => {
    const w = bareWorld();
    const ship = place(w, 'a'); // ML fit: mine at slot 1; heading 0 ⇒ astern = π
    // CLICK (weapon channel): places at the clicked point.
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 50, slot: SLOT_MINE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    expect(w.mines.size).toBe(1);
    const [mine] = [...w.mines.values()];
    expect(mine.x).toBeCloseTo(ship.state.x - 50, 0); // AT the click (astern 50u; hull barely moved)
    // PRESS (ability channel) with a reloaded pool: refused by the ability wall
    // — actSeq targets non-weapons only, and the mine is a weapon now.
    // A FULL rack (2-deep at base since the 2026-08-04 balance pass) with an
    // idle timer — so the only thing that could move the pool is the press.
    ship.loadout[SLOT_MINE].state = { n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 };
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 50, slot: SLOT_MINE, fireT: 0, actSeq: 1, actSlot: SLOT_MINE, hornSeq: 0 });
    w.step();
    expect(w.mines.size).toBe(1); // no second mine — presses never reach a weapon
    expect(ship.loadout[SLOT_MINE].state).toEqual({ n: 2, reloadMsLeft: 0 }); // charges intact
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
  it('with the gun selected, the reloading MINE and BUOY slots both advance', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { slot: SLOT_GUN }); // gun slot named; fireSeq 0 => no activation
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    ship.loadout[SLOT_BUOY].state = { n: 0, reloadMsLeft: CONFIG.radarBuoy.reloadMs };
    w.step();
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - DT);
    expect(ship.loadout[SLOT_BUOY].state!.reloadMsLeft).toBe(CONFIG.radarBuoy.reloadMs - DT);
  });

  it('the same holds on the OTHER hull: a reloading TORPEDO advances under the gun', () => {
    const w = bareWorld();
    const ship = placeTb(w, 'a');
    setInput(ship, { slot: SLOT_GUN });
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs };
    w.step();
    expect(ship.loadout[SLOT_TORPEDO].state!.reloadMsLeft).toBe(CONFIG.torpedo.reloadMs - DT);
  });
});

// ---------- 4b. the empty extra slot is never ticked --------------------------

describe('the empty extra slot is never ticked', () => {
  it('behavioral: a full-loadout ship steps many ticks with slot 3 empty, world stays healthy while 0–2 reload', () => {
    const w = bareWorld();
    const ship = place(w, 'a');
    setInput(ship, { slot: SLOT_GUN }); // no click (fireSeq 0)
    // Drain the three fitted slots so their reload timers must tick down.
    ship.loadout[SLOT_GUN].state = { n: 0, reloadMsLeft: CONFIG.gun.reloadMs };
    ship.loadout[SLOT_MINE].state = { n: 0, reloadMsLeft: CONFIG.mine.reloadMs };
    ship.loadout[SLOT_BUOY].state = { n: 0, reloadMsLeft: CONFIG.radarBuoy.reloadMs };
    const N = 5;
    expect(() => {
      for (let i = 0; i < N; i++) w.step();
    }).not.toThrow();
    // Empty slot untouched — no state materialized, nothing to have ticked.
    expect(ship.loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
    // The fitted slots DID reload-tick (proves the loop ran, and skips only 3).
    expect(ship.loadout[SLOT_GUN].state!.reloadMsLeft).toBe(CONFIG.gun.reloadMs - N * DT);
    expect(ship.loadout[SLOT_MINE].state!.reloadMsLeft).toBe(CONFIG.mine.reloadMs - N * DT);
    expect(ship.loadout[SLOT_BUOY].state!.reloadMsLeft).toBe(CONFIG.radarBuoy.reloadMs - N * DT);
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
    expectFreshLoadout(place(w, 'a'), ML_IDS);
    expectFreshLoadout(placeTb(w, 'tb'), TB_IDS);
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
    w.resetForMatchStart();
    expectFreshLoadout(ship, ML_IDS);
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
