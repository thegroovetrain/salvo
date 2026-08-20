// BROADSIDE BARRAGE matrix suite (Story 7-5 wave 2, R2.1–R2.5) — the
// Battleship's slot-1 weapon, REPLACING the cannon suite this file grew out of
// (`cannon.test.ts`, retired with the weapon). Everything the cannon suite
// pinned that still has a subject is carried over — CONFIG-true shell params,
// the range clamp, burst damage, both interceptor outcomes, the
// reload/cooling/dead/forged-slot denials, the D1 fireT passthrough and
// cross-hull parity — re-pointed at the broadside. What is NEW is what the
// broadside is: the TWIN-SECTOR arc, PER-TURRET FIRING ARCS (Eric's
// 2026-08-20 ruling — each gun fires as close to the click as its own arc
// allows; the designed fan is deleted), and PER-SHELL signals.
//
// The cannon's own three moded-fire blocks (PLUNGING FIRE's arcing overflight
// and ARMOR-PIERCING's direction shot / pierce falloff) are RETIRED rather than
// adapted: the doctrines, the modes and the shared pierce machinery are all
// deleted, so there is nothing left for them to assert about.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  angleDiff,
  burstPointAlong,
  turretMuzzles,
  type InputMsg,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { broadsideAim } from '../game/equipment/index.js';

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

describe('broadside — per-turret arcs: each gun fires as close to the click as it can (Eric 2026-08-20)', () => {
  it('every turret that BEARS fires EXACTLY at the click — a lined-up salvo fully converges', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    // Near max reach, dead abeam: the parallax between muzzle bearings is small
    // enough that every turret's own arc contains the click. 410u rather than
    // 400u since Eric's 2026-08-20 retune pushed the base convergence threshold
    // ~303u → ~386u — the point of that ruling was to make this shot rarer, so
    // the test has to stand further out to find it.
    setInput(bb, { aim: ABEAM, aimDist: 410, slot: SLOT_BROADSIDE });
    const click = burstPointAlong(bb.state, 410, w.map.radius, bb.stats.broadside.rangeU, ABEAM);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const targets = [...w.shells.values()].map((s) => ({ x: s.targetX!, y: s.targetY! }));
    expect(targets).toHaveLength(CONFIG.broadside.turrets);
    for (const t of targets) {
      expect(t.x).toBeCloseTo(click.x, 9);
      expect(t.y).toBeCloseTo(click.y, 9);
    }
  });

  it('a turret that CANNOT bear fires at its arc LIMIT, still at the click\'s range from its muzzle', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    // Close abeam: parallax swings the outer turrets' muzzle→click bearings
    // outside their own arcs, so only the midship gun is on the click.
    setInput(bb, { aim: ABEAM, aimDist: 150, slot: SLOT_BROADSIDE });
    const click = burstPointAlong(bb.state, 150, w.map.radius, bb.stats.broadside.rangeU, ABEAM);
    const aim = broadsideAim(bb, 1, w.map.radius);
    expect(aim.filter((t) => t.onClick)).toHaveLength(1);
    expect(aim[1].onClick).toBe(true); // the midship gun
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const fired = [...w.shells.values()];
    expect(fired).toHaveLength(aim.length);
    fired.forEach((s, i) => {
      const { muzzle, target, onClick } = aim[i];
      expect(s.targetX!).toBeCloseTo(target.x, 9); // the fired target IS the shared answer
      expect(s.targetY!).toBeCloseTo(target.y, 9);
      // A limit shot keeps the click's RANGE from its own muzzle (an arc at
      // constant radius, not a cone)…
      const dist = Math.hypot(target.x - muzzle.x, target.y - muzzle.y);
      expect(dist).toBeCloseTo(Math.hypot(click.x - muzzle.x, click.y - muzzle.y), 9);
      // …but lands visibly OFF the click — the miss is the emergent spread.
      if (!onClick) expect(Math.hypot(target.x - click.x, target.y - click.y)).toBeGreaterThan(1);
    });
  });

  it('CONVERGENCE IS RARE AT BASE: all guns near max range, the midship gun alone at mid range', () => {
    const onClick = (aimDist: number): number => {
      const w = bareWorld();
      const bb = place(w, 'a', 'battleship', 0, 0);
      setInput(bb, { aim: ABEAM, aimDist, slot: SLOT_BROADSIDE });
      return broadsideAim(bb, 1, w.map.radius).filter((t) => t.onClick).length;
    };
    // RETUNED on Eric's playtest 2026-08-20 (*"the convergence is slightly too
    // high at level 1"*): the base threshold moved ~303u → ~386u, so a lined-up
    // salvo now converges only in the outermost ~6% of the weapon's 412.5u
    // reach rather than its outer quarter. 400u still converges; 350u — which
    // DID under the old tuning — no longer does, and that case is pinned so a
    // retune back cannot pass silently.
    expect(onClick(410)).toBe(CONFIG.broadside.turrets); // the lined-up long shot
    expect(onClick(350)).toBe(1); // was convergence before the retune; now it is not
    expect(onClick(250)).toBe(1); // mid range: parallax defeats the outer arcs
    expect(onClick(100)).toBe(1); // close: worse still — never MORE convergence up close
  });

  it('BROADSIDE SPREAD widens every turret\'s arc: MORE guns land ON the same click', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    const baseTraverse = bb.stats.broadside.traverseRad;
    setInput(bb, { aim: ABEAM, aimDist: 150, slot: SLOT_BROADSIDE });
    expect(broadsideAim(bb, 1, w.map.radius).filter((t) => t.onClick)).toHaveLength(1);
    for (let i = 0; i < 4; i += 1) w.applyBoon(bb, 'broadsideSpread');
    expect(bb.stats.broadside.traverseRad).toBeGreaterThan(baseTraverse); // the card WIDENS
    // The same click is now inside every turret's widened arc.
    expect(broadsideAim(bb, 1, w.map.radius).filter((t) => t.onClick)).toHaveLength(CONFIG.broadside.turrets);
    // …and the fired shells all land exactly there.
    const click = burstPointAlong(bb.state, 150, w.map.radius, bb.stats.broadside.rangeU, ABEAM);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    for (const s of w.shells.values()) {
      expect(s.targetX!).toBeCloseTo(click.x, 9);
      expect(s.targetY!).toBeCloseTo(click.y, 9);
    }
  });

  it('BROADSIDE TURRETS raises the shell count to the ×2 cap of 5 — five guns, five arcs', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.applyBoon(bb, 'broadsideTurrets');
    w.applyBoon(bb, 'broadsideTurrets');
    expect(bb.stats.broadside.turrets).toBe(5);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    const aim = broadsideAim(bb, 1, w.map.radius);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    expect(w.shells.size).toBe(5);
    // Denser mounts on the SAME covered sector: more guns bear on this click
    // than the base battery's one (the whole point of an extra turret).
    expect(aim.filter((t) => t.onClick).length).toBeGreaterThan(1);
  });

  it('the fire path and broadsideAim agree exactly — ONE geometry, not two', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 40, -25, 1.1);
    setInput(bb, { aim: 1.1 + Math.PI / 2, aimDist: 220, slot: SLOT_BROADSIDE });
    const predicted = broadsideAim(bb, 1, w.map.radius);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const fired = [...w.shells.values()];
    expect(fired.map((s) => ({ x: s.targetX!, y: s.targetY! }))).toEqual(predicted.map((t) => t.target));
    expect(fired.map((s) => ({ x: s.x, y: s.y }))).toEqual(predicted.map((t) => t.muzzle));
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

// ---------- THE RIM: arc-limit shots are pulled back to the water, exactly as
// the client previews them (wave-2 review gate, re-derived for per-turret arcs)
//
// A turret that cannot bear fires at its arc LIMIT at the click's range, and
// near the rim that limit point can land off the water disk on a shot whose
// click stayed on it — and a target off the disk is not a long shot: stepShell
// resolves it `expired`, which splashes with NO burst and NO damage. Both sides
// call ONE shared helper (sim/aim.ts turretAimPoints), which clamps every limit
// point exactly as the click itself was clamped; pinned here.

describe('broadside — limit shots are clamped to the water disk (ONE shared answer)', () => {
  /** 60° — the port-beam CENTER for the heading `rimBattleship` sets. */
  const RIM_AIM = Math.PI / 3;

  /** A pose pressed against the rim clicking DEAD ABEAM at the boundary: the
   *  click clamps to the rim ~0.039R out (a range where parallax puts the
   *  outer turrets' bearings outside their arcs), and the bow gun's raw limit
   *  point would land OUTSIDE the disk. Scales with R, so it holds at any
   *  roster-derived map size. */
  function rimBattleship(w: World): ShipRecord {
    const bb = place(w, 'a', 'battleship', w.map.radius * 0.98, 0, RIM_AIM - Math.PI / 2);
    setInput(bb, { aim: RIM_AIM, aimDist: w.map.radius, slot: SLOT_BROADSIDE });
    return bb;
  }

  it('the UNCLAMPED limit would leave the water — the case is real, not hypothetical', () => {
    const w = bareWorld();
    const bb = rimBattleship(w);
    const aim = broadsideAim(bb, 1, w.map.radius);
    const click = burstPointAlong(bb.state, w.map.radius, w.map.radius, bb.stats.broadside.rangeU, RIM_AIM);
    expect(Math.hypot(click.x, click.y)).toBeGreaterThan(w.map.radius - 2); // the click IS pinned at the rim
    let raw = 0;
    for (const t of aim) {
      if (t.onClick) continue;
      // Re-extend the clamped limit shot to the click's own range: where the
      // shell would have flown without the water-disk clamp.
      const dist = Math.hypot(click.x - t.muzzle.x, click.y - t.muzzle.y);
      const b = Math.atan2(t.target.y - t.muzzle.y, t.target.x - t.muzzle.x);
      const un = { x: t.muzzle.x + Math.cos(b) * dist, y: t.muzzle.y + Math.sin(b) * dist };
      if (Math.hypot(un.x, un.y) > w.map.radius) raw += 1;
    }
    expect(aim.some((t) => !t.onClick)).toBe(true);
    expect(raw).toBeGreaterThan(0);
  });

  it('every target the server fires at is ON the water, and IS the previewed point', () => {
    const w = bareWorld();
    const bb = rimBattleship(w);
    const aim = broadsideAim(bb, 1, w.map.radius);
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    const fired = [...w.shells.values()];
    expect(fired).toHaveLength(bb.stats.broadside.turrets);
    fired.forEach((s, i) => {
      expect(Math.hypot(s.targetX!, s.targetY!)).toBeLessThanOrEqual(w.map.radius);
      // Byte-identical to the shared helper the client's broadsidePreview calls
      // with the same arguments — the "previewed circle IS where the shell
      // bursts" guarantee, at the one place it used to break.
      expect(s.targetX!).toBe(aim[i].target.x);
      expect(s.targetY!).toBe(aim[i].target.y);
      // The bearing is derived from the CLAMPED point AND from the shell's OWN
      // TURRET, so the muzzle flash and the burst sit on one line.
      const brg = Math.atan2(s.targetY! - aim[i].muzzle.y, s.targetX! - aim[i].muzzle.x);
      expect(Math.abs(angleDiff(brg, Math.atan2(s.vy, s.vx)))).toBeLessThan(1e-9);
    });
    // Coverage holds even pressed against the boundary: one gun is ON the click.
    expect(aim.some((t) => t.onClick)).toBe(true);
  });
});

// --- EVERY SHELL LEAVES ITS OWN TURRET (Eric's correction 2026-08-19) --------
//
// *"You currently have every cannon firing from the same point on the side of
// the ship, but this is wrong. It is supposed to be three separate, evenly-
// spaced points on the ship that they fire from."*
//
// The shipped barrage spawned every shell at ONE muzzle (muzzleOrTarget off the
// ship centre). Each pin below fails against that geometry.
describe('broadside - every shell fires from its OWN turret', () => {
  /** A battleship at the origin, heading 0, clicking abeam to port at 300u. */
  function fired(w: World, bb: ShipRecord): { x: number; y: number }[] {
    expect(w.sinkingActivationGate(bb, SLOT_BROADSIDE)).toEqual({ ok: true });
    return [...w.shells.values()].map((s) => ({ x: s.x, y: s.y }));
  }

  it('N shells spawn at N DISTINCT points, not N copies of one muzzle', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    const origins = fired(w, bb);
    expect(origins).toHaveLength(CONFIG.broadside.turrets);
    const keys = new Set(origins.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
    expect(keys.size).toBe(CONFIG.broadside.turrets);
  });

  it('THE ONE-FUNCTION PIN: the spawn points ARE shared turretMuzzles(), index for index', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 40, -25, 1.1);
    setInput(bb, { aim: 1.1 + Math.PI / 2, aimDist: 300, slot: SLOT_BROADSIDE });
    const origins = fired(w, bb);
    // The SAME call the client's broadsidePreview makes (render/aimPreview.ts),
    // with the client's own predicted pose + effectiveStats. Two derivations of
    // one battery is exactly the desync class shared/ exists to prevent.
    const truth = turretMuzzles(bb.state, bb.hullId, bb.stats.broadside.turrets, 1);
    origins.forEach((p, i) => {
      expect(p.x, `turret ${i} x`).toBeCloseTo(truth[i].x, 9);
      expect(p.y, `turret ${i} y`).toBeCloseTo(truth[i].y, 9);
    });
    // The wrapper re-derives nothing: its muzzles ARE the shared answer.
    expect(broadsideAim(bb, 1, w.map.radius).map((t) => t.muzzle)).toEqual(truth);
  });

  it('the muzzles are EVENLY SPACED along the hull, on the ENGAGED beam only', () => {
    for (const [aim, side] of [[ABEAM, 1], [-ABEAM, -1]] as const) {
      const w = bareWorld();
      const bb = place(w, 'a', 'battleship', 0, 0);
      setInput(bb, { aim, aimDist: 300, slot: SLOT_BROADSIDE });
      const origins = fired(w, bb).sort((p, q) => p.x - q.x);
      // Heading 0, so the beam offset is pure +/-y and the spacing is pure x.
      for (const p of origins) {
        expect(p.y).toBeCloseTo((side * CONFIG.shipClasses.battleship.hull.beam) / 2, 9);
      }
      const gaps = origins.slice(1).map((p, i) => p.x - origins[i].x);
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 9);
      expect(gaps[0]).toBeGreaterThan(0);
    }
  });

  it('BROADSIDE TURRETS RE-SPACES the same span: 3 -> 4 -> 5 guns, tighter, never longer', () => {
    const spanAndGap = (boons: number): { span: number; gap: number; n: number } => {
      const w = bareWorld();
      const bb = place(w, 'a', 'battleship', 0, 0);
      for (let i = 0; i < boons; i += 1) w.applyBoon(bb, 'broadsideTurrets');
      setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
      const xs = fired(w, bb).map((p) => p.x).sort((a, b) => a - b);
      return { span: xs[xs.length - 1] - xs[0], gap: xs[1] - xs[0], n: xs.length };
    };
    const three = spanAndGap(0);
    const four = spanAndGap(1);
    const five = spanAndGap(2);
    expect([three.n, four.n, five.n]).toEqual([3, 4, 5]);
    // Same ship: the battery's along-hull span does not move one unit.
    expect(four.span).toBeCloseTo(three.span, 9);
    expect(five.span).toBeCloseTo(three.span, 9);
    // More guns on the same span = tighter spacing.
    expect(four.gap).toBeLessThan(three.gap);
    expect(five.gap).toBeLessThan(four.gap);
  });

  it('EACH TURRET GETS ITS OWN MUZZLE FLASH, at the turret (R2.5, now per POINT)', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 300, slot: SLOT_BROADSIDE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    const flashes = w.tickEvents.filter((e) => e.k === 'mz') as { x: number; y: number }[];
    expect(flashes).toHaveLength(CONFIG.broadside.turrets);
    const key = (p: { x: number; y: number }): string => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
    // The flash rides the shell's PRE-PRE-STEP origin, which is now the turret:
    // a barrage lights the whole battery, gun by gun, not one point N times.
    const truth = turretMuzzles(bb.state, bb.hullId, bb.stats.broadside.turrets, 1);
    expect(new Set(flashes.map(key))).toEqual(new Set(truth.map(key)));
  });

  it('THE BEARING GUN\'S SHOT STILL LANDS EXACTLY ON THE CLICK, from its own turret', () => {
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    setInput(bb, { aim: ABEAM, aimDist: 300, slot: SLOT_BROADSIDE });
    const click = burstPointAlong(bb.state, 300, w.map.radius, bb.stats.broadside.rangeU, ABEAM);
    // At this range and bearing exactly ONE arc bears — the midship gun's —
    // and its target IS the click...
    const aim = broadsideAim(bb, 1, w.map.radius);
    const mid = (aim.length - 1) / 2;
    expect(aim.filter((t) => t.onClick)).toHaveLength(1);
    expect(aim[mid].onClick).toBe(true);
    expect(aim[mid].target.x).toBeCloseTo(click.x, 9);
    expect(aim[mid].target.y).toBeCloseTo(click.y, 9);
    // ...and it leaves the MIDDLE turret (amidships on the engaged beam), NOT
    // the ship centre and NOT a shared muzzle...
    expect(aim[mid].muzzle.x).toBeCloseTo(bb.state.x, 9); // amidships (heading 0)
    expect(aim[mid].muzzle.y).toBeCloseTo(CONFIG.shipClasses.battleship.hull.beam / 2, 9);
    // ...and end to end, a shell's fall of shot lands ON the clicked point.
    // Eric: "One shell will *absolutely* hit at the target point."
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 300, slot: SLOT_BROADSIDE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    const splashes: { x: number; y: number }[] = [];
    for (let i = 0; i < 60 && splashes.length === 0; i += 1) {
      w.step();
      for (const e of w.tickEvents) if (e.k === 'sp') splashes.push({ x: e.x, y: e.y });
    }
    expect(splashes).toHaveLength(CONFIG.broadside.turrets);
    const onClick = splashes.filter((p) => Math.hypot(p.x - click.x, p.y - click.y) < 1e-6);
    expect(onClick).toHaveLength(1);
  });

  it('a bow-most turret firing across the hull never self-hits (owner immunity is permanent)', () => {
    // A point-blank click abeam: every turret is aimed at a target only ~20u
    // off the hull, so the forward gun's line grazes the ship's own silhouette.
    const w = bareWorld();
    const bb = place(w, 'a', 'battleship', 0, 0);
    const before = bb.hp;
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: ABEAM, fireSeq: 1, aimDist: 20, slot: SLOT_BROADSIDE, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    for (let i = 0; i < 40; i += 1) w.step();
    expect(bb.hp).toBe(before);
  });
});
