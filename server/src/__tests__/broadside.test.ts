// BROADSIDE BARRAGE matrix suite (Story 7-5 wave 2, R2.1–R2.5) — the
// Battleship's slot-1 weapon, REPLACING the cannon suite this file grew out of
// (`cannon.test.ts`, retired with the weapon). Everything the cannon suite
// pinned that still has a subject is carried over — CONFIG-true shell params,
// the range clamp, burst damage, both interceptor outcomes, the
// reload/cooling/dead/forged-slot denials, the D1 fireT passthrough and
// cross-hull parity — re-pointed at the broadside. What is NEW is what the
// broadside is: the TWIN-SECTOR arc, the constant-radius FAN, and PER-SHELL
// signals.
//
// The cannon's own three moded-fire blocks (PLUNGING FIRE's arcing overflight
// and ARMOR-PIERCING's direction shot / pierce falloff) are RETIRED rather than
// adapted: the doctrines, the modes and the shared pierce machinery are all
// deleted, so there is nothing left for them to assert about.

import { describe, it, expect } from 'vitest';
import { CONFIG, angleDiff, type InputMsg } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { broadsideTargets } from '../game/equipment/index.js';

const DT = CONFIG.tick.simDtMs;
/** Battleship slot indices under the wave-2 fit [gun, broadside, starShells, empty]. */
const SLOT_BROADSIDE = 1;
const SLOT_EMPTY = 3;
/** The 5/8 rung — the broadside's base reach (412.5u), derived, never a literal. */
const RUNG_5_8 = CONFIG.vision.radar * CONFIG.vision.muzzleFlashFactor;
/** A bearing squarely inside the port beam sector (heading 0 + 90°). */
const ABEAM = Math.PI / 2;

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 7): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship of `hull` and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, hull: 'battleship' | 'torpedoBoat' | 'mineLayer', x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 => no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...patch };
}

/** Every live shell's (bearing, range) from `from`. */
function polar(w: World, from: { x: number; y: number }): { bearing: number; range: number }[] {
  return [...w.shells.values()].map((s) => ({
    bearing: Math.atan2(s.targetY! - from.y, s.targetX! - from.x),
    range: Math.hypot(s.targetX! - from.x, s.targetY! - from.y),
  }));
}

describe('broadside — server loadout + barrage construction', () => {
  it('a Battleship spawns fitted [gun, broadside, starShells, empty] with full idle pools', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    expect(bb.loadout.map((s) => s.equipmentId)).toEqual(['gun', 'broadside', 'starShells', null]);
    expect(bb.loadout[SLOT_BROADSIDE].state).toEqual({ n: CONFIG.broadside.maxAmmo, reloadMsLeft: 0 });
  });

  it('firing spawns `turrets` CONFIG.broadside shells: speed 500, damage 20, burst 15, no lit tag', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    expect(w.shells.size).toBe(CONFIG.broadside.turrets); // 3 base — ONE click, N shells
    for (const shell of w.shells.values()) {
      expect(Math.hypot(shell.vx, shell.vy)).toBeCloseTo(CONFIG.broadside.shellSpeed, 9);
      expect(shell.damage).toBe(CONFIG.broadside.damage);
      expect(shell.burstRadius).toBe(CONFIG.broadside.burstRadius);
      expect(shell.hitRadius).toBe(CONFIG.broadside.shellRadius);
      expect(shell.kind).toBe('shell'); // the gun-family wire kind
      expect(shell.lit).toBeUndefined(); // only star shells spawn zones
    }
    // Single-barrage pool spent for the WHOLE salvo, 30s reload started.
    expect(bb.loadout[SLOT_BROADSIDE].state).toEqual({ n: 0, reloadMsLeft: CONFIG.broadside.reloadMs });
  });

  it('RANGE IS THE 5/8 RUNG: a click beyond reach clamps to 412.5u, NOT the 660u radar horizon', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    expect(bb.stats.broadside.rangeU).toBeCloseTo(RUNG_5_8, 9);
    expect(bb.stats.broadside.rangeU).toBeLessThan(bb.stats.gun.rangeU); // the FIRST short-reach weapon
    setInput(bb, { aim: ABEAM, aimDist: 1200, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    for (const p of polar(w, { x: 0, y: 0 })) expect(p.range).toBeCloseTo(RUNG_5_8, 6);
  });

  it('intelRange grows the broadside rangeU too — it rides the ladder, at 5/8 of the grown radar range', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.applyBoon(bb, 'intelRange');
    const grown = bb.stats.radarRange;
    expect(grown).toBeGreaterThan(CONFIG.vision.radar);
    expect(bb.stats.broadside.rangeU).toBeCloseTo(grown * CONFIG.vision.muzzleFlashFactor, 9);
    // And it is REAL at the equipment seam: a click past the old rung clamps
    // to the GROWN rung.
    setInput(bb, { aim: ABEAM, aimDist: 1200, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    for (const p of polar(w, { x: 0, y: 0 })) expect(p.range).toBeGreaterThan(RUNG_5_8);
  });

  it('D1: the validated fire time becomes EVERY shell of the barrage bornAt', () => {
    const w = bareWorld();
    for (let i = 0; i < 40; i++) w.step(); // give the clock room to back-date into
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    const fireT = w.now - 100;
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE, fireT)).toEqual({ ok: true });
    for (const shell of w.shells.values()) expect(shell.bornAt).toBe(fireT);
  });
});

describe('broadside — the TWIN-SECTOR arc (R2.1/R2.2)', () => {
  it('a click DEAD AHEAD is denied out-of-arc and consumes NOTHING', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 300, slot: SLOT_BROADSIDE }); // bow dead zone
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(w.shells.size).toBe(0);
    expect(bb.loadout[SLOT_BROADSIDE].state).toEqual({ n: CONFIG.broadside.maxAmmo, reloadMsLeft: 0 });
  });

  it('a click DEAD ASTERN is denied too — both dead zones, 60° wide each', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: Math.PI, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: false, reason: 'out-of-arc' });
    expect(w.shells.size).toBe(0);
  });

  it('BOTH beams fire — port (+90°) and starboard (−90°) are mirrored and equally legal', () => {
    for (const sign of [1, -1]) {
      const w = bareWorld();
      const bb = place(w, 'a', 'battleship', 0, 0);
      setInput(bb, { aim: sign * ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
      expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
      expect(w.shells.size).toBe(CONFIG.broadside.turrets);
    }
  });

  it('the sector EDGES are exactly heading ± (offset ± halfArc): 30° in, 29° out', () => {
    const deg = (d: number): number => (d * Math.PI) / 180;
    for (const [bearingDeg, ok] of [[31, true], [149, true], [29, false], [151, false]] as const) {
      const w = bareWorld();
      const bb = place(w, 'a', 'battleship', 0, 0);
      setInput(bb, { aim: deg(bearingDeg), aimDist: 300, slot: SLOT_BROADSIDE });
      const res = w.sinkingActivationGate(bb, SLOT_BROADSIDE);
      expect(res.ok, `${bearingDeg}deg`).toBe(ok);
    }
  });

  it('the arc is tested against the HULL HEADING, not world north', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0, ABEAM); // bow points +y
    // World-north is now DEAD AHEAD for this hull: denied.
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: false, reason: 'out-of-arc' });
    // Its own beam (heading + 90°) fires.
    setInput(bb, { aim: ABEAM * 2, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
  });
});

describe('broadside — the FAN is an arc at constant radius (R2.3)', () => {
  it('EVERY shell ends at the CLICK\'S OWN RANGE — the pattern is an arc, never a cone', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const ranges = polar(w, { x: 0, y: 0 }).map((p) => p.range);
    expect(ranges).toHaveLength(CONFIG.broadside.turrets);
    for (const r of ranges) expect(r).toBeCloseTo(300, 6);
  });

  it('ODD turret count puts exactly ONE shell on the click bearing (it *absolutely* hits)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    expect(bb.stats.broadside.turrets % 2).toBe(1); // base 3 — the odd case
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const onBearing = polar(w, { x: 0, y: 0 }).filter((p) => Math.abs(angleDiff(ABEAM, p.bearing)) < 1e-9);
    expect(onBearing).toHaveLength(1);
    // …and the others straddle it symmetrically at the full fan half-angle.
    const offs = polar(w, { x: 0, y: 0 }).map((p) => angleDiff(ABEAM, p.bearing)).sort((a, b) => a - b);
    expect(offs[0]).toBeCloseTo(-bb.stats.broadside.fanHalfAngleRad, 9);
    expect(offs[2]).toBeCloseTo(bb.stats.broadside.fanHalfAngleRad, 9);
  });

  it('EVEN turret count puts NO shell on the click bearing — the shells straddle it', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    // 4 turrets is unreachable by cards (3 base, BROADSIDE TURRETS is rare ×2
    // → 5), so the even case is set on the cached effective stats directly.
    bb.stats.broadside.turrets = 4;
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    expect(w.shells.size).toBe(4);
    const p = polar(w, { x: 0, y: 0 });
    for (const s of p) expect(Math.abs(angleDiff(ABEAM, s.bearing))).toBeGreaterThan(1e-9);
    for (const s of p) expect(s.range).toBeCloseTo(300, 6); // still one radius
    // Symmetric about the click: the offsets sum to zero.
    expect(p.reduce((acc, s) => acc + angleDiff(ABEAM, s.bearing), 0)).toBeCloseTo(0, 9);
  });

  it('BROADSIDE TURRETS raises the shell count to the ×2 cap of 5, still odd, still on-bearing', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.applyBoon(bb, 'broadsideTurrets');
    w.applyBoon(bb, 'broadsideTurrets');
    expect(bb.stats.broadside.turrets).toBe(5);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    expect(w.shells.size).toBe(5);
    expect(polar(w, { x: 0, y: 0 }).filter((p) => Math.abs(angleDiff(ABEAM, p.bearing)) < 1e-9)).toHaveLength(1);
  });

  it('BROADSIDE SPREAD TIGHTENS the fan (the ladder runs 12° → 3°), moving the shells, never their range', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    const wide = bb.stats.broadside.fanHalfAngleRad;
    w.applyBoon(bb, 'broadsideSpread');
    expect(bb.stats.broadside.fanHalfAngleRad).toBeLessThan(wide);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const p = polar(w, { x: 0, y: 0 });
    for (const s of p) expect(s.range).toBeCloseTo(300, 6);
    const spanned = Math.max(...p.map((s) => angleDiff(ABEAM, s.bearing)));
    expect(spanned).toBeCloseTo(bb.stats.broadside.fanHalfAngleRad, 9);
  });

  it('the fire path and broadsideTargets agree exactly — ONE geometry, not two', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    const predicted = broadsideTargets(bb, w.map.radius);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const fired = [...w.shells.values()].map((s) => ({ x: s.targetX!, y: s.targetY! }));
    expect(fired).toEqual(predicted);
  });
});

describe('broadside — per-shell signals (R2.5, Eric A2)', () => {
  /** Click through the real input channel and return this tick's event kinds. */
  function clickAndStep(w: World, id: string, patch: Partial<InputMsg>): string[] {
    w.submitInput(id, { seq: 1, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 300, slot: SLOT_BROADSIDE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...patch });
    w.step();
    return w.tickEvents.map((e) => e.k);
  }

  it('N turrets emit N muzzle flashes — a barrage lights the whole engaged beam', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const kinds = clickAndStep(w, 'a', {});
    expect(kinds.filter((k) => k === 'mz')).toHaveLength(CONFIG.broadside.turrets);
  });

  it('the count FOLLOWS the turret stat — 5 turrets, 5 flashes (no salvo aggregation)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.applyBoon(bb, 'broadsideTurrets');
    w.applyBoon(bb, 'broadsideTurrets');
    expect(clickAndStep(w, 'a', {}).filter((k) => k === 'mz')).toHaveLength(5);
  });

  it('THE GUN IS UNCHANGED: a multi-barrel gun click still collapses to ONE flash', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.applyBoon(bb, 'gunBarrel'); // a second barrel — two shells, one flash
    expect(bb.stats.gun.barrels).toBeGreaterThan(1);
    const kinds = clickAndStep(w, 'a', { slot: 0, aim: 0 });
    expect(w.shells.size).toBe(bb.stats.gun.barrels);
    expect(kinds.filter((k) => k === 'mz')).toHaveLength(1);
  });

  it('every MISSING shell of a barrage splashes on its own — N fall-of-shot marks, not one', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 300, slot: SLOT_BROADSIDE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    let splashes = 0;
    for (let i = 0; i < 60 && splashes === 0; i++) {
      w.step();
      splashes = w.tickEvents.filter((e) => e.k === 'sp').length;
    }
    expect(splashes).toBe(CONFIG.broadside.turrets);
  });
});

describe('broadside — burst + interceptor outcomes (end-to-end steps)', () => {
  /** Click for `firer` via the real input channel and step until a burst or
   *  boom lands (or `maxTicks`). Returns the events seen. */
  function fireAndResolve(w: World, firer: string, input: Partial<InputMsg>, maxTicks = 80): string[] {
    w.submitInput(firer, { seq: 1, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 0, slot: SLOT_BROADSIDE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...input });
    const seen: string[] = [];
    for (let i = 0; i < maxTicks; i++) {
      w.step();
      for (const e of w.tickEvents) seen.push(e.k);
      if (seen.includes('burst') || seen.includes('boom')) break;
    }
    return seen;
  }

  it('bursts at each shell point: an enemy hull inside 15u takes the full 20 (owner excluded)', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const e = place(w, 'e', 'battleship', 0, 300); // hull straddles the click point
    const seen = fireAndResolve(w, 'a', { aimDist: 300 });
    expect(seen).toContain('burst');
    expect(e.hp).toBeLessThanOrEqual(e.stats.maxHp - CONFIG.broadside.damage);
  });

  it('an early interceptor stops its shell — the barrage never overflies a hull', () => {
    const w = bareWorld();
    place(w, 'a', 'battleship', 0, 0);
    const mid = place(w, 'mid', 'battleship', 0, 200); // bodyblocks the 400u shot
    const seen = fireAndResolve(w, 'a', { aimDist: 400 });
    expect(seen).toContain('boom');
    expect(mid.hp).toBeLessThan(mid.stats.maxHp);
  });
});

describe('broadside — denials + cross-hull parity', () => {
  it('cooling (empty pool) denies no-ammo and changes nothing', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    bb.loadout[SLOT_BROADSIDE].state = { n: 0, reloadMsLeft: CONFIG.broadside.reloadMs };
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: false, reason: 'no-ammo' });
    expect(w.shells.size).toBe(0);
  });

  it('the ARC is judged BEFORE the pool: a dead-zone click on an empty pool is out-of-arc', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: 0, aimDist: 300, slot: SLOT_BROADSIDE });
    bb.loadout[SLOT_BROADSIDE].state = { n: 0, reloadMsLeft: CONFIG.broadside.reloadMs };
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: false, reason: 'out-of-arc' });
  });

  it('a dead Battleship is refused first (dead)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10): a SINKING Battleship still fires — only a
    // foundered one is dead. Cross the window before asserting the refusal.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: false, reason: 'dead' });
  });

  it('a forged click on the empty extra slot denies empty-slot; the click channel stays inert', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    expect(w.sinkingActivationGate(bb, SLOT_EMPTY)).toEqual({ ok: false, reason: 'empty-slot' });
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 300, slot: SLOT_EMPTY, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    expect(w.shells.size).toBe(0);
  });

  it('the broadside reloads every tick while another slot is in use (FR5 parity)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { slot: 0 }); // gun named, no click
    bb.loadout[SLOT_BROADSIDE].state = { n: 0, reloadMsLeft: CONFIG.broadside.reloadMs };
    w.step();
    expect(bb.loadout[SLOT_BROADSIDE].state!.reloadMsLeft).toBe(CONFIG.broadside.reloadMs - DT);
  });

  it('no other hull carries it: TB slot-1 is the torpedo, ML slot-1 the mine — never a broadside shell', () => {
    const w = bareWorld();
    const tb = place(w, 'tb', 'torpedoBoat', 0, 0);
    expect(tb.loadout[1].equipmentId).toBe('torpedo');
    setInput(tb, { aim: tb.state.heading, slot: 1 }); // over the bow — in arc
    expect(w.sinkingActivationGate(tb, 1)).toEqual({ ok: true });
    expect([...w.shells.values()].map((s) => s.kind)).toEqual(['torp']);
    const ml = place(w, 'ml', 'mineLayer', 0, 300);
    expect(ml.loadout[1].equipmentId).toBe('mine');
    expect(ml.loadout.map((s) => s.equipmentId)).not.toContain('broadside');
  });
});
