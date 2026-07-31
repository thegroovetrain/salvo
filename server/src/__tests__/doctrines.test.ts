// THE FOUR EXCLUSIVE DOCTRINE PAIRS on the water (Story 2.8, amendments 38/44
// — the ratified behavior contracts), end-to-end through the REAL fire/step
// seams against the production BOON_CATALOG: PLUNGING FIRE ⚔ ARMOR-PIERCING
// (cannon), ACOUSTIC HOMING ⚔ COMMAND DETONATION (torpedo, incl. the 'torpU'
// wire rules), SELF-PROPELLED ⚔ PROP-FOULING (mines, incl. the pinned
// boost→slow→hooks composition), INCENDIARY ⚔ DAZZLE (star shells, incl. the
// dazzled observer's shrunken sight) — plus the vacated-owner CONFIG fallback.

import { describe, it, expect } from 'vitest';
import { CONFIG, type GameEvent, type InputMsg, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 ⇒ no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, ...patch };
}

const dmgFor = (events: readonly GameEvent[], id: string) =>
  events.filter((e) => e.k === 'dmg' && e.id === id);

// ---------------------------------------------------------------------------
// CANNON: PLUNGING FIRE (arcing) ⚔ ARMOR-PIERCING (ap)
// ---------------------------------------------------------------------------

describe('PLUNGING FIRE (cannonArcing) — overflight, always bursts at the click', () => {
  it('overflies an island AND a bodyblocking hull and bursts exactly at the clicked point (spec matrix row)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyBoon(a, 'cannonArcing');
    expect(a.stats.cannon.mode).toBe('arcing');
    w.map.islands.push({ x: 150, y: 0, r: 30 }); // a rock on the flight path
    const blocker = place(w, 'blocker', 250, 0); // a hull on the flight path
    const victim = place(w, 'victim', 400, 20); // inside the 30u burst at the click
    setInput(a, { aim: 0, aimDist: 400, slot: 1, fireSeq: 1, seq: 2 });
    const seen: GameEvent[] = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      seen.push(...w.tickEvents);
      if (seen.some((e) => e.k === 'burst')) break;
    }
    const burst = seen.find((e) => e.k === 'burst')!;
    expect(burst).toBeDefined();
    expect((burst as { x: number }).x).toBeCloseTo(400, 6); // exactly the click — un-interceptable
    expect(blocker.hp).toBe(blocker.stats.maxHp); // overflown, never contact-hit
    expect(victim.hp).toBe(victim.stats.maxHp - a.stats.cannon.damage); // full burst damage
  });
});

describe('ARMOR-PIERCING (cannonAp) — pierce order, 100/50/25 falloff, island stop', () => {
  /** BS at the origin with `n` torpedo boats parked in a firing line on +x. */
  function line(n: number, withIsland = false): { w: World; a: ShipRecord; targets: ShipRecord[] } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyBoon(a, 'cannonAp');
    expect(a.stats.cannon.mode).toBe('ap');
    if (withIsland) w.map.islands.push({ x: 150, y: 0, r: 20 });
    const targets: ShipRecord[] = [];
    for (let i = 0; i < n; i++) targets.push(place(w, `t${i}`, 220 + i * 120, 0));
    setInput(a, { aim: 0, aimDist: 100, slot: 1, fireSeq: 1, seq: 2 }); // aimDist deliberately ignored by AP
    return { w, a, targets };
  }

  function run(w: World, ticks = 80): GameEvent[] {
    const seen: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      w.step();
      seen.push(...w.tickEvents);
    }
    return seen;
  }

  it('pierces up to 3 hulls in hit order at 100/50/25% of effective damage; the 4th is untouched; no burst ever', () => {
    const { w, a, targets } = line(4);
    const seen = run(w);
    const dmg = a.stats.cannon.damage;
    expect(targets[0].hp).toBeCloseTo(targets[0].stats.maxHp - dmg, 6); // 100%
    expect(targets[1].hp).toBeCloseTo(targets[1].stats.maxHp - dmg * 0.5, 6); // 50%
    expect(targets[2].hp).toBeCloseTo(targets[2].stats.maxHp - dmg * 0.25, 6); // 25%
    expect(targets[3].hp).toBe(targets[3].stats.maxHp); // max 3 hulls — spent
    expect(seen.some((e) => e.k === 'burst')).toBe(false); // AP never bursts
    // One boom per pierce, each naming its hull (world-side; per-observer
    // stripping stays with the boom row).
    const booms = seen.filter((e) => e.k === 'boom');
    expect(booms.map((e) => (e as { hit?: string }).hit)).toEqual(['t0', 't1', 't2']);
    expect(w.shells.size).toBe(0); // spent on the third hull
  });

  it('a pierced hull is never re-hit, and the shell KEEPS FLYING between pierces (not spent early)', () => {
    const { w, targets } = line(2);
    run(w);
    // Two pierces only — each hull hit exactly once despite the shell crossing
    // its whole silhouette; the shell then flew on to range end.
    expect(targets[0].hp).toBeCloseTo(targets[0].stats.maxHp - 50, 6);
    expect(targets[1].hp).toBeCloseTo(targets[1].stats.maxHp - 25, 6);
    expect(w.shells.size).toBe(0); // ran out its full range
  });

  it('an island stops an AP shell DEAD (no pierce beyond it)', () => {
    const { w, targets } = line(2, true); // rock at x=150, first hull at 220
    const seen = run(w);
    expect(targets[0].hp).toBe(targets[0].stats.maxHp); // shielded by the rock
    expect(targets[1].hp).toBe(targets[1].stats.maxHp);
    expect(seen.some((e) => e.k === 'boom')).toBe(true); // the island stop splash
    expect(w.shells.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TORPEDO: ACOUSTIC HOMING (homing + torpU) ⚔ COMMAND DETONATION (command)
// ---------------------------------------------------------------------------

describe('ACOUSTIC HOMING (torpedoHoming) — steering + the torpU wire rules', () => {
  /** TB firing a fish along +x with an off-axis enemy inside acquire range of
   *  the flight path; extra observers per test. */
  function homingBoard(): { w: World; a: ShipRecord; b: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'torpedoHoming');
    expect(a.stats.torpedo.mode).toBe('homing');
    const b = place(w, 'b', 320, 80); // off the track; within 120u of it mid-flight
    setInput(a, { aim: 0, aimDist: 0, slot: 1, fireSeq: 1, seq: 2 });
    return { w, a, b };
  }

  it('the fish steers off its launch bearing toward the nearest enemy hull; a standard fish never does', () => {
    const { w } = homingBoard();
    let maxVy = 0;
    for (let i = 0; i < 200 && w.shells.size >= 0; i++) {
      w.step();
      for (const sh of w.shells.values()) maxVy = Math.max(maxVy, Math.abs(sh.vy));
      if (i > 2 && w.shells.size === 0) break;
    }
    expect(maxVy).toBeGreaterThan(1); // it turned

    const control = bareWorld();
    const ca = place(control, 'a', 0, 0); // NO doctrine
    place(control, 'b', 320, 80);
    setInput(ca, { aim: 0, aimDist: 0, slot: 1, fireSeq: 1, seq: 2 });
    let controlVy = 0;
    for (let i = 0; i < 200; i++) {
      control.step();
      for (const sh of control.shells.values()) controlVy = Math.max(controlVy, Math.abs(sh.vy));
      if (i > 2 && control.shells.size === 0) break;
    }
    expect(controlVy).toBe(0); // a standard fish flies straight
  });

  it("torpU updates go to a SIGHTED observer who already holds the track — and NEVER to an unsighted one", () => {
    const { w } = homingBoard();
    const c = place(w, 'c', 250, -60); // sight covers the turning stretch of the track
    const d = place(w, 'd', -900, 0); // far beyond sight of everything
    // Park sweeps away so no radar noise complicates the frames.
    for (const s of [c, d]) {
      s.prevSweepAngle = Math.PI;
      s.sweepAngle = Math.PI + 1e-4;
    }
    let cReveals = 0;
    let cUpdates = 0;
    let dEvents = 0;
    for (let i = 0; i < 200; i++) {
      w.step();
      const fc = buildFrame(w, 'c');
      cReveals += fc.events.filter((e) => e.k === 'torp').length;
      cUpdates += fc.events.filter((e) => e.k === 'torpU').length;
      const fd = buildFrame(w, 'd');
      dEvents += fd.events.filter((e) => e.k === 'torp' || e.k === 'torpU').length;
      if (i > 2 && w.shells.size === 0) break;
    }
    expect(cReveals).toBe(1); // the reveal stays exactly-once...
    expect(cUpdates).toBeGreaterThanOrEqual(1); // ...updates re-key the same id (relaxed for torpU alone)
    expect(dEvents).toBe(0); // nothing ever reaches the unsighted observer
  });

  it('the OWNER receives torpU updates for its own steering fish (launch-revealed)', () => {
    const { w } = homingBoard();
    let updates = 0;
    for (let i = 0; i < 200; i++) {
      w.step();
      updates += buildFrame(w, 'a').events.filter((e) => e.k === 'torpU').length;
      if (i > 2 && w.shells.size === 0) break;
    }
    expect(updates).toBeGreaterThanOrEqual(1);
  });

  it('a SPECTATOR with a record gets torpU updates too (the ballistic-reveal spectator rule)', () => {
    const { w } = homingBoard();
    const c = place(w, 'c', -600, 0);
    w.respawnEnabled = false;
    w.sinkShip('c'); // dead-in-active ⇒ spectator frames
    let reveals = 0;
    let updates = 0;
    for (let i = 0; i < 200; i++) {
      w.step();
      const f = buildFrame(w, 'c', 'active');
      expect(f.spec).toBe(true);
      reveals += f.events.filter((e) => e.k === 'torp').length;
      updates += f.events.filter((e) => e.k === 'torpU').length;
      if (i > 2 && w.shells.size === 0) break;
    }
    expect(reveals).toBe(1);
    expect(updates).toBeGreaterThanOrEqual(1);
  });
});

describe('COMMAND DETONATION (torpedoCommand) — point-detonation at the click, radar-capped reach', () => {
  it('bursts at the clicked point with the big command blast; a bystander outside it is untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'torpedoCommand');
    expect(a.stats.torpedo.mode).toBe('command');
    const inBlast = place(w, 'in', 200, 50); // within 60u of the click
    const outBlast = place(w, 'out', 200, 200);
    setInput(a, { aim: 0, aimDist: 200, slot: 1, fireSeq: 1, seq: 2 });
    const seen: GameEvent[] = [];
    for (let i = 0; i < 120; i++) {
      w.step();
      seen.push(...w.tickEvents);
      if (seen.some((e) => e.k === 'burst')) break;
    }
    const burst = seen.find((e) => e.k === 'burst')! as { x: number; y: number };
    expect(burst).toBeDefined();
    expect(burst.x).toBeCloseTo(200, 4);
    expect(inBlast.hp).toBe(inBlast.stats.maxHp - a.stats.torpedo.damage);
    expect(outBlast.hp).toBe(outBlast.stats.maxHp);
  });

  it('the commanded point is capped by the OWNER’s effective radar range along the aim ray', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'torpedoCommand');
    setInput(a, { aim: 0, aimDist: 5000, slot: 1, fireSeq: 1, seq: 2 });
    w.step();
    const [torp] = [...w.shells.values()];
    expect(torp.targetX).toBeCloseTo(a.stats.radarRange, 6);
    expect(torp.targetY).toBeCloseTo(0, 6);
    expect(torp.burstRadius).toBe(CONFIG.torpedo.commandBurstRadius);
  });

  it('a contact hit en route stays an ORDINARY full-damage torpedo hit', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'torpedoCommand');
    const blocker = place(w, 'blocker', 200, 0); // dead on the track, far short of the click
    setInput(a, { aim: 0, aimDist: 600, slot: 1, fireSeq: 1, seq: 2 });
    for (let i = 0; i < 120 && blocker.hp === blocker.stats.maxHp; i++) w.step();
    expect(blocker.hp).toBe(blocker.stats.maxHp - a.stats.torpedo.damage);
  });
});

// ---------------------------------------------------------------------------
// MINES: SELF-PROPELLED (creep) ⚔ PROP-FOULING (slow debuff)
// ---------------------------------------------------------------------------

describe('SELF-PROPELLED MINES (mineSelfPropelled) — armed creep toward the nearest enemy', () => {
  function creepBoard(): { w: World; o: ShipRecord } {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer'); // far from the action
    w.applyBoon(o, 'mineSelfPropelled');
    expect(o.stats.mine.mode).toBe('selfPropelled');
    return { w, o };
  }

  it('an ARMED mine creeps at creepSpeed toward an enemy hull inside acquireRange; unarmed and doctrine-less mines sit still', () => {
    const { w } = creepBoard();
    // Beam-on prey: center 55u away (inside the 60u acquire radius) but its
    // silhouette stays clear of the 32u trigger ring — it attracts, not trips.
    place(w, 'prey', 55, 0, Math.PI / 2);
    w.mines.set('armed', { id: 'armed', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.mines.set('cold', { id: 'cold', ownerId: 'o', x: 0, y: 30, armedAt: 999_999 }); // still arming
    w.mines.set('plain', { id: 'plain', ownerId: 'x', x: 0, y: -30, armedAt: 0 }); // ghost owner: no doctrine
    w.step();
    const armed = w.mines.get('armed')!;
    expect(armed.x).toBeCloseTo(CONFIG.mine.creepSpeed * (DT / 1000), 6); // one tick of crawl toward +x
    expect(armed.y).toBeCloseTo(0, 6);
    expect(w.mines.get('cold')!.x).toBe(0); // unarmed mines never move
    expect(w.mines.get('plain')!.x).toBe(0); // a vacated/doctrine-less owner's mines sit still
  });

  it('no enemy inside acquireRange ⇒ the mine holds position', () => {
    const { w } = creepBoard();
    place(w, 'far', 200, 0); // beyond the 60u acquire radius
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    for (let i = 0; i < 10; i++) w.step();
    expect(w.mines.get('m')!.x).toBe(0);
  });

  it('a creeping mine STOPS at an island rim — mines float, they never climb rocks', () => {
    const { w } = creepBoard();
    place(w, 'prey', 55, 0, Math.PI / 2); // beam-on: attracts without tripping
    w.map.islands.push({ x: 8, y: 0, r: 5 }); // a rock between mine and prey (rim at x=3)
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    for (let i = 0; i < 40; i++) w.step();
    const m = w.mines.get('m')!;
    expect(m.x).toBeCloseTo(3, 6); // parked exactly at the rim
    expect(m.y).toBeCloseTo(0, 6);
  });
});

describe('PROP-FOULING MINES (minePropFouling) — reduced damage + the slow debuff', () => {
  function foulBoard(): { w: World; o: ShipRecord; b: ShipRecord } {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    w.applyBoon(o, 'minePropFouling');
    expect(o.stats.mine.mode).toBe('propFouling');
    const b = place(w, 'b', 0, 10); // trips the mine below on the first step
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    return { w, o, b };
  }

  it('the blast deals the REDUCED effective damage (×0.6 catalog trade) and stamps slowedUntil (refresh, never stack)', () => {
    const { w, o, b } = foulBoard();
    w.step();
    expect(o.stats.mine.damage).toBeCloseTo(CONFIG.mine.damage * 0.6, 9);
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.mine.damage * 0.6, 6);
    expect(b.slowedUntil).toBe(w.now + CONFIG.mine.foulDurationMs);
    const firstUntil = b.slowedUntil;
    // A second fouling blast REFRESHES the window (plain re-stamp, no stacking).
    for (let i = 0; i < 10; i++) w.step();
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: b.state.x, y: b.state.y - 10, armedAt: 0 });
    w.step();
    expect(b.slowedUntil).toBe(w.now + CONFIG.mine.foulDurationMs);
    expect(b.slowedUntil).toBeGreaterThan(firstUntil);
  });

  it('a fouled hull is capped at foulFactor × maxSpeed until the window closes (boost→slow→hooks order)', () => {
    const { w, b } = foulBoard();
    w.step(); // the blast lands; b is fouled for 4s
    setInput(b, { throttle: 1 });
    b.input.throttle = 1;
    for (let i = 0; i < 60; i++) w.step(); // 3s at full throttle, well inside the window
    expect(b.state.speed).toBeLessThanOrEqual(b.stats.kinematics.maxSpeed * CONFIG.mine.foulFactor + 1e-9);
    expect(b.state.speed).toBeCloseTo(b.stats.kinematics.maxSpeed * CONFIG.mine.foulFactor, 1);
    // The window expires; the hull works back up to its full cap.
    for (let i = 0; i < Math.ceil(CONFIG.mine.foulDurationMs / DT) + 100; i++) w.step();
    expect(b.state.speed).toBeCloseTo(b.stats.kinematics.maxSpeed, 1);
  });

  it('an active BOOST composes boosted→slowed: the fouled cap is (max + bonus) × factor', () => {
    const { w, b } = foulBoard();
    w.step();
    b.boostUntil = Number.MAX_SAFE_INTEGER; // hold the boost window open
    b.slowedUntil = Number.MAX_SAFE_INTEGER; // hold the slow too — isolate the composition
    b.input.throttle = 1;
    for (let i = 0; i < 100; i++) w.step();
    const expected = (b.stats.kinematics.maxSpeed + b.stats.boost.speedBonus) * CONFIG.mine.foulFactor;
    expect(b.state.speed).toBeCloseTo(expected, 1);
  });

  it('slowedUntil is VICTIM-PRIVATE: on the victim’s own frame, never on a contact', () => {
    const { w, b } = foulBoard();
    place(w, 'c', 100, 60); // sees b as a contact
    w.step();
    const fb = buildFrame(w, 'b');
    expect(fb.you!.slowedUntil).toBe(b.slowedUntil);
    const fc = buildFrame(w, 'c');
    const contact = fc.contacts.find((c) => c.id === 'b')!;
    expect(contact).toBeDefined();
    expect('slowedUntil' in contact).toBe(false);
    expect(fc.you!.slowedUntil).toBeUndefined(); // c itself is not slowed — key omitted
  });
});

describe('vacated owner — mines fall back to CONFIG bases (pinned)', () => {
  it('a boosted-damage owner leaves; the orphan mine detonates at CONFIG.mine.damage', () => {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    for (let i = 0; i < 5; i++) w.applyBoon(o, 'mineDamage'); // 45 → 65
    expect(o.stats.mine.damage).toBe(CONFIG.mine.damage + 20);
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.removeShip('o'); // the owner VACATES; the mine survives
    const b = place(w, 'b', 0, 10);
    w.step();
    expect(w.mines.size).toBe(0); // still trips
    expect(b.hp).toBe(b.stats.maxHp - CONFIG.mine.damage); // base damage, not the booned 65
  });
});

// ---------------------------------------------------------------------------
// STAR SHELLS: INCENDIARY (DoT zone) ⚔ DAZZLE (sight reduction)
// ---------------------------------------------------------------------------

describe('INCENDIARY COMPOUND (starIncendiary) — smaller burning zone, DoT to non-owners', () => {
  it('the fired flare lights a zone shrunk by incendiaryRadiusFactor, tagged with the mode', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyBoon(a, 'starIncendiary');
    setInput(a, { aim: 0, aimDist: 400, slot: 2, fireSeq: 1, seq: 2 });
    for (let i = 0; i < 60 && w.litZones.size === 0; i++) w.step();
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    expect(zone.mode).toBe('incendiary');
    expect(zone.r).toBeCloseTo(CONFIG.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor, 6);
  });

  it('non-owner hulls inside burn at incendiaryDps (victim-private dmg, kill credit); the owner never burns', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0, 0, 'battleship'); // owner INSIDE its own zone
    const b = place(w, 'b', 420, 30); // enemy inside
    const c = place(w, 'c', 900, 900); // far outside
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 130, until: 999_999, mode: 'incendiary' });
    const ticks = 20; // one second
    for (let i = 0; i < ticks; i++) w.step();
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.starShells.incendiaryDps, 4); // 1s of DoT
    expect(a.hp).toBe(a.stats.maxHp); // owner immune
    expect(c.hp).toBe(c.stats.maxHp);
    // The victim-private dmg stream reaches b alone.
    w.step();
    expect(dmgFor(buildFrame(w, 'b').events, 'b').length).toBeGreaterThan(0);
    expect(dmgFor(buildFrame(w, 'a').events, 'b')).toEqual([]);
    // Kill credit: burn b down — the sink attributes to the zone owner.
    b.hp = 0.01;
    for (let i = 0; i < 3 && b.alive; i++) w.step();
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
  });

  it('a STANDARD zone burns nobody (mode gating)', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 165, until: 999_999, mode: 'standard' });
    for (let i = 0; i < 20; i++) w.step();
    expect(b.hp).toBe(b.stats.maxHp);
  });
});

describe('DAZZLE BURST (starDazzle) — the victim’s own truesight shrinks', () => {
  function dazzleBoard(): { w: World; a: ShipRecord; b: ShipRecord; t: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 900, 900, 0, 'battleship'); // zone owner, far away
    const b = place(w, 'b', 0, 0); // the dazzled victim
    const t = place(w, 't', 250, 0); // inside base sight (330), OUTSIDE dazzled sight (165)
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, mode: 'dazzle' });
    return { w, a, b, t };
  }

  it('inside a non-owned dazzle zone the victim’s dazzledUntil refreshes every tick and its OWN sight halves', () => {
    const { w, b } = dazzleBoard();
    w.step();
    expect(b.dazzledUntil).toBe(w.now + 250); // the refreshed grace mark
    // The dazzled observer LOSES a contact a base observer holds.
    expect(buildFrame(w, 'b').contacts.map((c) => c.id)).not.toContain('t');
  });

  it('a NON-dazzled observer at the same range is untouched (its invariants never weaken)', () => {
    const { w } = dazzleBoard();
    place(w, 'clear', 0, 500); // outside the zone; 't' is ~254u away — inside base sight... 
    w.step();
    // 'clear' sits 500u from t? place it nearer: use a fresh check instead — the
    // victim's twin OUTSIDE the zone keeps the contact.
    const w2 = bareWorld();
    place(w2, 'a', 900, 900, 0, 'battleship');
    const b2 = place(w2, 'b', 0, 0);
    place(w2, 't', 250, 0);
    w2.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 600, y: 600, r: 100, until: 999_999, mode: 'dazzle' }); // zone elsewhere
    w2.step();
    expect(b2.dazzledUntil).toBe(0);
    expect(buildFrame(w2, 'b').contacts.map((c) => c.id)).toContain('t');
  });

  it('the OWNER inside its own dazzle zone is never dazzled', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, mode: 'dazzle' });
    w.step();
    expect(a.dazzledUntil).toBe(0);
  });

  it('dazzledUntil is VICTIM-PRIVATE on the wire and expires ~250ms after leaving the zone', () => {
    const { w, b, t } = dazzleBoard();
    place(w, 'watcher', 100, 60);
    w.step();
    const fb = buildFrame(w, 'b');
    expect(fb.you!.dazzledUntil).toBe(b.dazzledUntil);
    const fw = buildFrame(w, 'watcher');
    const contact = fw.contacts.find((c) => c.id === 'b')!;
    expect(contact).toBeDefined();
    expect('dazzledUntil' in contact).toBe(false);
    // Leave the zone (delete it): the mark expires after the short grace and
    // the shrunken sight recovers.
    w.litZones.clear();
    for (let i = 0; i < 7; i++) w.step(); // 350ms > the 250ms grace
    expect(w.now).toBeGreaterThan(b.dazzledUntil);
    expect(buildFrame(w, 'b').contacts.map((c) => c.id)).toContain('t');
    void t;
  });
});
