// Cannon matrix suite (Story 1.7) — the Battleship's slot-1 long-range burst
// skillshot against the spec's I/O matrix: CONFIG-true shell params, gun-rule
// range clamp (at the UN-stacked radar-derived range), burst damage, the two
// interceptor outcomes (contact bodyblock outside the blast / full burst when
// the interceptor is already inside it), reload/cooling/dead/forged-slot
// denials, and the D1 fireT passthrough. Complements equipment.test.ts (the
// generic seam, exercised on the mineLayer's universal fit) and the shared
// loadout suite (the fit itself).

import { describe, it, expect } from 'vitest';
import { CONFIG, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';

const DT = CONFIG.tick.simDtMs;
/** Battleship slot indices under the 1.7 fit [gun, cannon, starShells, empty]. */
const SLOT_CANNON = 1;
const SLOT_EMPTY = 3;

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship of `hull` and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, hull: 'battleship' | 'torpedoBoat' | 'mineLayer', x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, ...patch };
}

describe('cannon — server loadout + shell construction', () => {
  it('a Battleship spawns fitted [gun, cannon, starShells, empty] with full idle pools', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    expect(bb.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'cannon', 'starShells', null]);
    expect(bb.loadout[SLOT_CANNON].state).toEqual({ n: CONFIG.cannon.maxAmmo, reloadMsLeft: 0 });
  });

  it('firing spawns a CONFIG.cannon shell: speed 200, damage 50, burst 30, contact 20, no lit tag', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_CANNON });
    expect(w.sinkingActivationGate(bb, SLOT_CANNON)).toEqual({ ok: true });
    expect(w.shells.size).toBe(1);
    const shell = [...w.shells.values()][0];
    expect(Math.hypot(shell.vx, shell.vy)).toBeCloseTo(CONFIG.cannon.shellSpeed, 9);
    expect(shell.damage).toBe(CONFIG.cannon.damage);
    expect(shell.contactDamage).toBe(CONFIG.cannon.contactDamage);
    expect(shell.burstRadius).toBe(CONFIG.cannon.burstRadius);
    expect(shell.hitRadius).toBe(CONFIG.cannon.shellRadius);
    expect(shell.kind).toBe('shell'); // rides the existing ballistic wire kind
    expect({ x: shell.targetX, y: shell.targetY }).toEqual({ x: 400, y: 0 }); // the clicked point
    expect(shell.lit).toBeUndefined(); // only star shells spawn zones
    // Single-shot pool spent, 15s reload started.
    expect(bb.loadout[SLOT_CANNON].state).toEqual({ n: 0, reloadMsLeft: CONFIG.cannon.reloadMs });
  });

  it('a click beyond range clamps the burst point to the radar-derived base range (650u)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 1200, slot: SLOT_CANNON });
    expect(w.sinkingActivationGate(bb, SLOT_CANNON)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(bb.stats.cannon.rangeU).toBe(CONFIG.vision.radar); // 650 — gun BASE parity, un-stacked
    expect(shell.targetX).toBeCloseTo(CONFIG.vision.radar, 9);
    expect(shell.targetY).toBeCloseTo(0, 9);
  });

  it('the cannon range never rides gun upgrades: gunRange stacks move the gun clamp only', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.applyUpgrade(bb, 'gunRange');
    w.applyUpgrade(bb, 'gunRange');
    expect(bb.stats.gun.rangeU).toBeGreaterThan(CONFIG.vision.radar);
    expect(bb.stats.cannon.rangeU).toBe(CONFIG.vision.radar); // pinned — the interregnum quirk
  });

  it('D1: the validated fire time becomes the shell bornAt', () => {
    const w = bareWorld();
    for (let i = 0; i < 40; i++) w.step(); // give the clock room to back-date into
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 600, slot: SLOT_CANNON });
    const fireT = w.now - 100;
    expect(w.sinkingActivationGate(bb, SLOT_CANNON, fireT)).toEqual({ ok: true });
    expect([...w.shells.values()][0].bornAt).toBe(fireT);
  });
});

describe('cannon — burst + interceptor outcomes (end-to-end steps)', () => {
  /** Click for `firer` via the real input channel and step until a burst or
   *  boom lands (or `maxTicks`). Returns the events seen. */
  function fireAndResolve(w: World, firer: string, input: Partial<InputMsg>, maxTicks = 80): string[] {
    w.submitInput(firer, { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_CANNON, fireT: 0, actSeq: 0, actSlot: 0, ...input });
    const seen: string[] = [];
    for (let i = 0; i < maxTicks; i++) {
      w.step();
      for (const e of w.tickEvents) seen.push(e.k);
      if (seen.includes('burst') || seen.includes('boom')) break;
    }
    return seen;
  }

  it('bursts at the clicked point: every enemy hull inside 30u takes the full 50 (owner excluded)', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const e = place(w, 'e', 'battleship', 400, 0); // hull straddles the click point
    const seen = fireAndResolve(w, 'a', { aim: 0, aimDist: 400 });
    expect(seen).toContain('burst');
    expect(e.hp).toBe(e.stats.maxHp - CONFIG.cannon.damage); // 150 - 50
  });

  it('an early interceptor OUTSIDE the blast takes contactDamage 20 and stops the shell (no burst)', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const mid = place(w, 'mid', 'battleship', 300, 0); // bodyblocks the 600u shot
    const seen = fireAndResolve(w, 'a', { aim: 0, aimDist: 600 });
    expect(seen).toContain('boom');
    expect(seen).not.toContain('burst');
    expect(mid.hp).toBe(mid.stats.maxHp - CONFIG.cannon.contactDamage); // 150 - 20
    expect(w.shells.size).toBe(0); // stopped dead
  });

  it('an interceptor already INSIDE the would-be blast triggers the full 50 burst instead', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    // Hull center 20u short of the click point: the silhouette is well inside
    // the 30u blast around the target, so interception upgrades to a burst.
    const e = place(w, 'e', 'battleship', 580, 0);
    const seen = fireAndResolve(w, 'a', { aim: 0, aimDist: 600 });
    expect(seen).toContain('burst');
    expect(e.hp).toBe(e.stats.maxHp - CONFIG.cannon.damage); // full 50, never 20 + 50
  });
});

describe('cannon — denials + cross-hull parity', () => {
  it('cooling (empty pool) denies no-ammo and changes nothing', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_CANNON });
    bb.loadout[SLOT_CANNON].state = { n: 0, reloadMsLeft: CONFIG.cannon.reloadMs };
    expect(w.sinkingActivationGate(bb, SLOT_CANNON)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(w.shells.size).toBe(0);
  });

  it('a dead Battleship is refused first (dead)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 400, slot: SLOT_CANNON });
    w.sinkShip('a');
    expect(w.sinkingActivationGate(bb, SLOT_CANNON)).toEqual({ ok: false, reason: 'dead' });
  });

  it('a forged click on the empty extra slot denies empty-slot; the click channel stays inert', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    expect(w.sinkingActivationGate(bb, SLOT_EMPTY)).toEqual({ ok: false, reason: 'empty-slot' });
    // Through the real click channel: nothing fires, nothing throws.
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 400, slot: SLOT_EMPTY, fireT: 0, actSeq: 0, actSlot: 0 });
    w.step();
    expect(w.shells.size).toBe(0);
  });

  it('the cannon reloads every tick while another slot is in use (FR5 parity)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { slot: 0 }); // gun named, no click
    bb.loadout[SLOT_CANNON].state = { n: 0, reloadMsLeft: CONFIG.cannon.reloadMs };
    w.step();
    expect(bb.loadout[SLOT_CANNON].state!.reloadMsLeft).toBe(CONFIG.cannon.reloadMs - DT);
  });

  it('TB slot-1 clicks keep firing the torpedo; ML slot-1 is now the mine ABILITY (click inert) — no cannon anywhere else', () => {
    const w = bareWorld();
    const tb = place(w, 'tb', 'torpedoBoat', 0, 0);
    expect(tb.loadout[1].equipmentId).toBe('torpedo');
    setInput(tb, { aim: tb.state.heading, slot: 1 }); // over the bow — in arc
    expect(w.sinkingActivationGate(tb, 1)).toEqual({ ok: true });
    const kinds = [...w.shells.values()].map((s) => s.kind);
    expect(kinds).toEqual(['torp']); // byte-identical 1.6 behavior, never a cannon shell
    // ML slot 1 fits the mine (Story 1.8) — an ability: through the REAL click
    // channel the weapon-only wall keeps it inert (no shell, no mine, no drain).
    const ml = place(w, 'ml', 'mineLayer', 0, 300);
    expect(ml.loadout[1].equipmentId).toBe('mine');
    w.submitInput('ml', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0 });
    w.step();
    expect(w.mines.size).toBe(0);
    expect([...w.shells.values()].some((s) => s.kind !== 'torp')).toBe(false); // still never a cannon shell
    expect(ml.loadout[1].state!.n).toBe(CONFIG.mine.maxAmmo); // charge intact
  });
});
