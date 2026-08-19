// THE DOCTRINE VERBS on the water (Story 2.8 amendments 38/44 — the ratified
// behavior contracts — as retooled by Story 7-5 wave 1), end-to-end through the
// REAL fire/step seams against the production BOON_CATALOG: PLUNGING FIRE ⚔
// ARMOR-PIERCING (cannon — THE LAST EXCLUSIVE PAIR), ACOUSTIC HOMING (torpedo,
// incl. the 'torpU' wire rules), SELF-PROPELLED + PROP-FOULING (mines, incl.
// the pinned boost→slow→hooks composition), PHOSPHOR + DAZZLE (star shells,
// incl. the dazzled observer's shrunken sight) — plus the vacated-owner CONFIG
// fallback.
//
// WAVE 1 CHANGED THE SHAPE OF THIS FILE'S SUBJECT: outside the cannon, doctrine
// stopped being an either/or `mode` and became INDEPENDENT BOOLEAN VERBS, so
// the pairs are no longer pairs and BOTH verbs of a weapon may be held at once.
// COMMAND DETONATION is deleted outright. See the both-verbs stacking suites
// below, which the old enum model could not have expressed.

import { describe, it, expect } from 'vitest';
import { isAfloat, transitionLifecycle, CONFIG, HULL_IDS, hullEnvelope, type GameEvent, type InputMsg, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { circleIsland } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Set a full, valid InputMsg on a ship (fireSeq 0 ⇒ no click by default). */
function setInput(ship: ShipRecord, patch: Partial<InputMsg>): void {
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, ...patch };
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
    w.map.islands.push(circleIsland(150, 0, 30)); // a rock on the flight path
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
    if (withIsland) w.map.islands.push(circleIsland(150, 0, 20));
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
    // Base cannon 65 (RETUNED 50 -> 65, Eric ruling 2026-08-04) at 100% / 50%.
    expect(targets[0].hp).toBeCloseTo(targets[0].stats.maxHp - 65, 6);
    expect(targets[1].hp).toBeCloseTo(targets[1].stats.maxHp - 32.5, 6);
    expect(w.shells.size).toBe(0); // ran out its full range
  });

  // Story 2.8 review, P2: the client removes a dead-reckoned track when a boom
  // carrying ITS id arrives. A non-terminal pierce boom reusing the live
  // projectile id therefore made a still-flying AP shell VANISH for everyone.
  // RULING: non-terminal pierce booms carry a DERIVED id; the terminal event
  // keeps the real one.
  it('non-terminal pierce booms carry DERIVED ids; the TERMINAL event keeps the real projectile id', () => {
    const { w, targets } = line(4);
    const seen = run(w);
    const booms = seen.filter((e) => e.k === 'boom') as { id: string; hit?: string }[];
    expect(booms.map((b) => b.hit)).toEqual(['t0', 't1', 't2']); // three pierces, one boom each
    // The shell was SPENT on the third hull: only that last boom may carry the
    // real id (the client's track dies exactly once, at the true end of flight).
    const realId = booms[2].id;
    expect(realId).not.toContain('#');
    expect(booms[0].id).toBe(`${realId}#p0`);
    expect(booms[1].id).toBe(`${realId}#p1`);
    expect(new Set(booms.map((b) => b.id)).size).toBe(3); // every boom id distinct
    expect(targets[3].hp).toBe(targets[3].stats.maxHp);
  });

  it('a shell that pierces and FLIES ON emits only derived ids until its real terminal boom', () => {
    const { w } = line(2); // two hulls, then the shell runs out its range
    const seen = run(w);
    const booms = seen.filter((e) => e.k === 'boom') as { id: string; hit?: string }[];
    expect(booms).toHaveLength(3); // two pierces + the range-end splash
    const realId = booms[2].id;
    expect(booms[2].hit).toBeUndefined(); // the splash names no victim
    expect(booms.map((b) => b.id)).toEqual([`${realId}#p0`, `${realId}#p1`, realId]);
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
    expect(a.stats.torpedo.homing).toBe(true);
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

  // Story 2.8 review, P8: a homing fish's turn radius at base speed
  // (speed/turnRate = 120u) is about its acquire range, so a target it cannot
  // turn tightly enough to reach holds it in a long orbit — it re-emits torpU
  // the whole time and its range was UNBOUNDED (a standard fish runs until
  // impact or the map edge; an orbiting one meets neither for a very long
  // time — this geometry ran 1521u, ~25s, before finally drifting to the rim).
  // RULING: homing fish carry a finite total-travel budget.
  it('an ORBITING homing fish expires after its travel budget instead of circling forever', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'torpedoHoming');
    const prey = place(w, 'b', 300, 110); // acquired, but inside the fish's turn radius
    prey.hp = 1e9; // survive any glancing contact — this is about the FISH dying
    setInput(a, { aim: 0, aimDist: 0, slot: 1, fireSeq: 1, seq: 2 });

    let travelled = 0;
    let prev: { x: number; y: number } | null = null;
    let maxR = 0;
    let ticks = 0;
    for (; ticks < 2000; ticks++) {
      w.step();
      const fish = [...w.shells.values()][0];
      if (!fish) break;
      if (prev) travelled += Math.hypot(fish.x - prev.x, fish.y - prev.y);
      prev = { x: fish.x, y: fish.y };
      maxR = Math.max(maxR, Math.hypot(fish.x, fish.y));
    }
    expect(ticks).toBeLessThan(2000); // it DIED — the whole point
    expect(maxR).toBeLessThan(w.map.radius); // ...and never by reaching the map edge
    expect(prey.hp).toBe(1e9); // ...and never by hitting anything: a true orbit
    // It ran out its budget (one tick's travel of slack — the fish is removed
    // on the step that exhausts distLeft).
    const perTick = a.stats.torpedo.speed * (DT / 1000);
    expect(travelled).toBeGreaterThan(CONFIG.torpedo.homingMaxRangeU - 2 * perTick);
    expect(travelled).toBeLessThanOrEqual(CONFIG.torpedo.homingMaxRangeU);
  });

  it('a STANDARD fish keeps its unbounded range — the budget rides the homing doctrine alone', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'torpedoHoming');
    setInput(a, { aim: 0, aimDist: 0, slot: 1, fireSeq: 1, seq: 2 });
    w.step();
    expect([...w.shells.values()][0].distLeft).toBeLessThanOrEqual(CONFIG.torpedo.homingMaxRangeU);

    const control = bareWorld();
    const ca = place(control, 'a', 0, 0); // no doctrine
    setInput(ca, { aim: 0, aimDist: 0, slot: 1, fireSeq: 1, seq: 2 });
    control.step();
    expect([...control.shells.values()][0].distLeft).toBe(Number.POSITIVE_INFINITY);
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
    w.sinkShip('c'); // dead-in-active ⇒ spectator frames...
    // ...once FOUNDERED (Story 5.2). Stepping the real 5000ms window would
    // burn the homing fish's whole flight before the loop starts, so drive
    // the founder edge directly through the validated transition table.
    c.lifecycle = transitionLifecycle(c.lifecycle, 'founder', w.now);
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

// COMMAND DETONATION is DELETED (Story 7-5 wave 1). Its four behaviour pins
// (bursts at the click, radar-capped reach, the point-blank floor, and the
// ordinary contact hit en route) are RETIRED with the mechanic — there is no
// point-detonating torpedo to assert about. What survives is the STRUCTURAL
// consequence, which the old suite never had to state because a `mode` enum
// made it conditional: every fish is now contact-only, whatever the build.
describe('COMMAND DETONATION is gone — every torpedo is contact-only', () => {
  it('a fish carries no target point and no burst radius, homing or not', () => {
    for (const boons of [[], ['torpedoHoming'] as const]) {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      for (const id of boons) w.applyBoon(a, id);
      setInput(a, { aim: 0, aimDist: 400, slot: 1, fireSeq: 1, seq: 2 });
      w.step();
      const [torp] = [...w.shells.values()];
      expect(torp.kind).toBe('torp');
      expect(torp.targetX).toBeNull();
      expect(torp.targetY).toBeNull();
      expect(torp.burstRadius).toBe(0);
    }
  });

  it('a clicked point far short of a hull never detonates early — the fish runs on to contact', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const bystander = place(w, 'by', 200, 50); // would have been inside the old 60u command blast
    const blocker = place(w, 'blocker', 500, 0); // dead on the track, past the click
    setInput(a, { aim: 0, aimDist: 200, slot: 1, fireSeq: 1, seq: 2 });
    const seen: GameEvent[] = [];
    for (let i = 0; i < 200 && blocker.hp === blocker.stats.maxHp; i++) {
      w.step();
      seen.push(...w.tickEvents);
    }
    expect(seen.some((e) => e.k === 'burst')).toBe(false); // no point-detonation, ever
    expect(bystander.hp).toBe(bystander.stats.maxHp);
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
    expect(o.stats.mine.selfPropelled).toBe(true);
    return { w, o };
  }

  it('an ARMED mine creeps at creepSpeed toward an enemy hull inside acquireRange; unarmed and doctrine-less mines sit still', () => {
    const { w } = creepBoard();
    // Beam-on prey: silhouette ~48u off the mine — well inside the 150u acquire
    // reach, well outside the 32u trigger ring. It attracts, it does not trip.
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

  // THE TRACKING FIX (Eric ruling 2026-08-02). PRE-FIX this test FAILS: with
  // acquisition measured mine→ship CENTRE at 60u, a battleship whose bow is 78u
  // off the mine (centre 140u) is invisible to the doctrine — and by the time
  // its centre reaches 60u the hull is 62u long, so its silhouette crossed the
  // 32u trip ring at centre ≈94u and the mine already detonated. Every hull in
  // the game is 88–124u long, so the old acquire ring lived strictly INSIDE the
  // trip ring: self-propelled mines could never acquire anything, ever.
  it('acquires a BOW-ON hull whose CENTRE is far outside the old 60u ring (the tracking fix)', () => {
    const { w } = creepBoard();
    // Battleship bearing down bow-first: centre 140u out (>60), silhouette 78u
    // (<150), trip ring 32u — acquisition must precede the trip by design.
    place(w, 'prey', 140, 0, Math.PI, 'battleship');
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.step();
    const m = w.mines.get('m')!;
    expect(m.x).toBeCloseTo(CONFIG.mine.creepSpeed * (DT / 1000), 6); // under way toward the bow
    expect(m.y).toBeCloseTo(0, 6);
  });

  it('on a real approach the mine is CLOSING before the hull ever trips it', () => {
    const { w } = creepBoard();
    // A battleship steaming at the minefield from 400u out, full ahead.
    const prey = place(w, 'prey', 400, 0, Math.PI, 'battleship');
    setInput(prey, { throttle: 1, aim: Math.PI, seq: 2 });
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    let travelled = 0;
    for (let i = 0; i < 400 && w.mines.has('m'); i++) {
      w.step();
      const m = w.mines.get('m');
      if (m) travelled = m.x;
    }
    expect(w.mines.has('m')).toBe(false); // it tripped (the hull reached it)
    // ...and it did REAL closing work first — several seconds of creep, not the
    // zero units the pre-fix acquisition managed on every approach.
    expect(travelled).toBeGreaterThan(20);
  });

  it('a BOON-STACKED trigger ring still cannot pre-empt acquisition', () => {
    const { w, o } = creepBoard();
    // BLAST CASING now grows the trip ring too (the fuze line merged into it,
    // Eric ruling 2026-08-16). The widest reachable ring is unchanged: it was
    // 32 x 1.1^5 = 51.54u, and is now (48 x 1.1^5) x 2/3 = 51.54u.
    for (let i = 0; i < 5; i++) w.applyBoon(o, 'mineBlast'); // max stack
    const trigger = o.stats.mine.triggerRadius;
    expect(trigger).toBeGreaterThan(CONFIG.mine.triggerRadius); // the ring really grew
    // The invariant the fix has to hold: acquisition reach outranges the widest
    // trip ring plus the LONGEST hull's half-length, so no approach on any
    // aspect can trip before it is acquired. Computed over every hull in the
    // game (drone envelopes included) rather than pinned to today's battleship,
    // so a longer hull shipping later fails this instead of silently reopening
    // the bug.
    const longestHull = Math.max(...HULL_IDS.map((id) => hullEnvelope(id).hull.length));
    expect(CONFIG.mine.creepAcquireRange).toBeGreaterThan(trigger + longestHull / 2);
    // And on the water: a battleship bow-on at 140u centre is acquired even
    // with the widened ring standing.
    place(w, 'prey', 140, 0, Math.PI, 'battleship');
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.step();
    expect(w.mines.get('m')!.x).toBeCloseTo(CONFIG.mine.creepSpeed * (DT / 1000), 6);
  });

  it('no enemy inside acquireRange ⇒ the mine holds position', () => {
    const { w } = creepBoard();
    // Beam-on at 400u: silhouette ~384u off the mine, far outside the 150u reach.
    place(w, 'far', 400, 0, Math.PI / 2);
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    for (let i = 0; i < 10; i++) w.step();
    expect(w.mines.get('m')!.x).toBe(0);
  });

  it('acquisition uses the SILHOUETTE metric — the nearest HULL wins, not the nearest centre', () => {
    const { w } = creepBoard();
    // A battleship END-ON up the +y axis: centre 150u, silhouette ~88u (its
    // 124u hull lies along the bearing).
    place(w, 'broad', 0, 150, Math.PI / 2, 'battleship');
    // A torpedo boat up the +x axis, BEAM-ON: centre 140u — CLOSER by centre —
    // but only its 9u beam faces the mine, so its silhouette is ~135u out.
    // Under the old centre metric the mine would have chased this one.
    place(w, 'thin', 140, 0, Math.PI / 2, 'torpedoBoat');
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.step();
    const m = w.mines.get('m')!;
    expect(m.y).toBeGreaterThan(0); // heading for the broadside battleship
    expect(m.x).toBeCloseTo(0, 6);
  });

  it('a creeping mine STOPS at an island rim — mines float, they never climb rocks', () => {
    const { w } = creepBoard();
    place(w, 'prey', 55, 0, Math.PI / 2); // beam-on: attracts without tripping
    w.map.islands.push(circleIsland(8, 0, 5)); // a rock between mine and prey (rim at x=3)
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    for (let i = 0; i < 40; i++) w.step();
    const m = w.mines.get('m')!;
    expect(m.x).toBeCloseTo(3, 6); // parked exactly at the rim
    expect(m.y).toBeCloseTo(0, 6);
  });

  // Story 2.8 review, P10: the clamp is a SINGLE pass — one rim clamp, then one
  // push-out per island in map order. A push-out can land inside ANOTHER island
  // (or, near the rim, back outside the water disk), and the pass is over: the
  // mine RESTS somewhere the clamp itself calls illegal. RULING: reject the
  // step — the mine holds its previous position for the tick.
  //
  // The reachable setup is a mine CLICKED onto a rock (placement has no island
  // check): from there the push-out is a real, repeated operation.
  it('a two-island PINCH rejects the step instead of shoving the mine to an illegal rest point', () => {
    const { w } = creepBoard();
    place(w, 'prey', 55, 0, Math.PI / 2); // pulls the mine toward +x
    w.map.islands.push(circleIsland(-5, 0, 8)); // A — the rock the mine sits on
    w.map.islands.push(circleIsland(6, 0, 4)); // B — shoves A's exit point back INTO A
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    for (let i = 0; i < 10; i++) {
      w.step();
      const m = w.mines.get('m')!;
      // Held, every tick: the single pass would have parked it at (2, 0) —
      // still inside island A, and a visible sideways jump.
      expect([m.x, m.y], `tick ${i}`).toEqual([0, 0]);
    }
  });

  it('a rim-straddling rock never pushes a mine OUT of the water disk', () => {
    const { w } = creepBoard();
    const r = w.map.radius;
    // A rock hard against the rim, the mine sitting on it: the push-out ray
    // points straight out of the map.
    w.map.islands.push(circleIsland(r - 20, 0, 25));
    // Inside acquire range, outside the trigger ring, so it pulls the mine
    // about without tripping it. Pinned at r − 50 explicitly: pre-cycle-59 this
    // read `r − 30` and relied on the boundary clamp yanking the hull 20u
    // inward (the heading-independent `radius − polygonMaxRadius` wall). The
    // clamp is heading-aware now — a hull lying parallel to the rim is barely
    // held off at all — so the fixture states the geometry it always meant.
    place(w, 'prey', r - 50, 40, Math.PI / 2);
    w.mines.set('m', { id: 'm', ownerId: 'o', x: r - 10, y: 0, armedAt: 0 });
    for (let i = 0; i < 20; i++) {
      w.step();
      const m = w.mines.get('m')!;
      expect(Math.hypot(m.x, m.y), `tick ${i}`).toBeLessThanOrEqual(r + 1e-6);
    }
  });
});

// Story 2.8 review, P6: two mines within each other's blast can BOTH trip in
// one tick. The trigger loop snapshots its trips up front, so a mine an earlier
// cascade already consumed was handed to detonateMine a second time — two
// booms, double damage, from one trip. RULING: consume the mine FIRST and
// re-check existence on every path.
describe('same-tick mine cascade — every mine detonates exactly ONCE', () => {
  it('two same-owner mines that trip together each boom once and damage once', () => {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer'); // owner far away, immune anyway
    const victim = place(w, 'v', 0, 0, 0, 'battleship'); // fat enough to survive both blasts
    // Both mines are armed, both inside the OTHER's blast radius (48u), and the
    // victim's silhouette trips BOTH in the same tick.
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 20, y: 0, armedAt: 0 });
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: -20, y: 0, armedAt: 0 });
    w.step();
    expect(w.mines.size).toBe(0);
    const booms = w.tickEvents.filter((e) => e.k === 'boom') as { id: string }[];
    expect(booms.map((b) => b.id).sort()).toEqual(['m1', 'm2']); // ONE boom per mine
    const dmgs = w.tickEvents.filter((e) => e.k === 'dmg' && e.id === 'v');
    expect(dmgs).toHaveLength(2); // one application per mine — never four
    expect(victim.hp).toBeCloseTo(victim.stats.maxHp - 2 * o.stats.mine.damage, 6);
  });

  it('a gun burst over a same-owner cluster detonates each mine once (snapshot ∩ cascade)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0, 0, 'mineLayer');
    // Three mines clustered so the burst snapshot AND the chain both reach them.
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 200, y: 0, armedAt: 0 });
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: 210, y: 0, armedAt: 0 });
    w.mines.set('m3', { id: 'm3', ownerId: 'o', x: 220, y: 0, armedAt: 0 });
    setInput(o, { aim: 0, aimDist: 205, slot: 0, fireSeq: 1, seq: 2 }); // gun click on the cluster
    const seen: GameEvent[] = [];
    for (let i = 0; i < 60 && w.mines.size > 0; i++) {
      w.step();
      seen.push(...w.tickEvents);
    }
    expect(w.mines.size).toBe(0);
    const mineBooms = (seen.filter((e) => e.k === 'boom') as { id: string }[]).filter((b) => b.id.startsWith('m'));
    expect(mineBooms.map((b) => b.id).sort()).toEqual(['m1', 'm2', 'm3']); // exactly one each
  });
});

describe('PROP-FOULING MINES (minePropFouling) — the slow debuff, at full damage', () => {
  function foulBoard(): { w: World; o: ShipRecord; b: ShipRecord } {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    w.applyBoon(o, 'minePropFouling');
    expect(o.stats.mine.propFouling).toBe(true);
    const b = place(w, 'b', 0, 10); // trips the mine below on the first step
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    return { w, o, b };
  }

  // THE ×0.6 TRADE IS GONE (Eric ruling 2026-08-16): PROP-FOULING no longer pays
  // damage for the slow, so the blast lands FULL damage and the doctrine is a
  // pure behaviour change. Also retires the pick-order dependency this multiplier
  // created against `mineDamage`'s additive ladder.
  it('the blast deals FULL damage (the ×0.6 trade is retired) and stamps slowedUntil (refresh, never stack)', () => {
    const { w, o, b } = foulBoard();
    w.step();
    expect(o.stats.mine.damage).toBe(CONFIG.mine.damage);
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.mine.damage, 6);
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

// RE-KEYED IN STORY 7-5 WAVE 1. The pin was written against `mineDamage`,
// which is DELETED — and with no card writing `mine.damage` any more, a
// damage-only version of this test would be vacuous (the owner's effective
// damage IS the CONFIG base). BLAST CASING (`mineBlast`) is the surviving mine
// stat ladder, so the fallback is pinned on the ring it grows instead; the
// damage assertion is kept alongside it, now as the free half.
describe('vacated owner — mines fall back to CONFIG bases (pinned)', () => {
  it('a blast-booned owner leaves; the orphan mine uses the CONFIG blast ring and CONFIG damage', () => {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    for (let i = 0; i < 4; i++) w.applyBoon(o, 'mineBlast'); // 48 → 48 × 1.1^4 ≈ 70.3u
    expect(o.stats.mine.blastRadius).toBeGreaterThan(CONFIG.mine.blastRadius);
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.removeShip('o'); // the owner VACATES; the mine survives
    const b = place(w, 'b', 0, 10); // trips it (silhouette ~5u out)
    // Bow-on at x=110: its nearest hull point is 60u from the mine — OUTSIDE
    // the CONFIG 48u blast, INSIDE the booned ~70u one. The orphan must miss it.
    const edge = place(w, 'edge', 110, 0);
    w.step();
    expect(w.mines.size).toBe(0); // still trips
    expect(b.hp).toBe(b.stats.maxHp - CONFIG.mine.damage); // base damage
    expect(edge.hp).toBe(edge.stats.maxHp); // base BLAST RING — the booned reach vacated with the owner
  });
});

// ---------------------------------------------------------------------------
// STAR SHELLS: INCENDIARY (DoT zone) ⚔ DAZZLE (sight reduction)
// ---------------------------------------------------------------------------

describe('INCENDIARY COMPOUND (starIncendiary) — smaller burning zone, DoT to non-owners', () => {
  it('the fired flare lights a zone shrunk by incendiaryRadiusFactor, tagged with the phosphor verb', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyBoon(a, 'starIncendiary');
    setInput(a, { aim: 0, aimDist: 400, slot: 2, fireSeq: 1, seq: 2 });
    for (let i = 0; i < 60 && w.litZones.size === 0; i++) w.step();
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    expect(zone.phosphor).toBe(true);
    expect(zone.dazzle).toBe(false);
    expect(zone.r).toBeCloseTo(CONFIG.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor, 6);
  });

  it('non-owner hulls inside burn at incendiaryDps (victim-private dmg, kill credit); the owner never burns', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0, 0, 'battleship'); // owner INSIDE its own zone
    const b = place(w, 'b', 420, 30); // enemy inside
    const c = place(w, 'c', 900, 900); // far outside
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 130, until: 999_999, phosphor: true, dazzle: false });
    const ticks = 20; // one second
    for (let i = 0; i < ticks; i++) w.step();
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.starShells.incendiaryDps, 4); // 1s of DoT
    expect(a.hp).toBe(a.stats.maxHp); // owner immune
    expect(c.hp).toBe(c.stats.maxHp);
    // The victim-private dmg stream reaches b alone. It is AGGREGATED into
    // ~500ms windows (P4), so collect a full window's worth of frames.
    const toB: number[] = [];
    const toA: number[] = [];
    for (let i = 0; i < 12; i++) {
      w.step();
      toB.push(...dmgFor(buildFrame(w, 'b').events, 'b').map(() => 1));
      toA.push(...dmgFor(buildFrame(w, 'a').events, 'b').map(() => 1));
    }
    expect(toB.length).toBeGreaterThan(0);
    expect(toA).toEqual([]);
    // Kill credit: burn b down — the sink attributes to the zone owner.
    b.hp = 0.01;
    for (let i = 0; i < 3 && isAfloat(b.lifecycle); i++) w.step();
    expect(isAfloat(b.lifecycle)).toBe(false);
    expect(a.kills).toBe(1);
  });

  // Story 2.8 review, P4: the DoT applied hp every tick AND emitted a
  // victim-private dmg event every tick — 20 fractional events/second of wire
  // noise, and a strobing client hit-feedback source. RULING: hp application
  // stays per-tick; the EVENT is aggregated into ~500ms windows per (zone
  // owner, victim), flushed immediately when the pair stops burning or the
  // victim dies, so nothing applied is ever unreported.
  it('the dmg EVENT is AGGREGATED (~2/s), while hp still bleeds every tick and every point is reported', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 130, until: 999_999, phosphor: true, dazzle: false });
    const hp0 = b.hp;
    const seen: { amount: number }[] = [];
    for (let i = 0; i < 40; i++) {
      // 2 seconds
      w.step();
      seen.push(...(dmgFor(w.tickEvents, 'b') as { amount: number }[]));
    }
    // hp application is UNCHANGED — the full per-tick integration landed.
    expect(hp0 - b.hp).toBeCloseTo(CONFIG.starShells.incendiaryDps * 2, 6);
    // ...carried by a handful of events, not 40.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThanOrEqual(4);
    // The zone dies: the pair's remainder flushes at once, and the reported
    // total equals the applied total exactly.
    w.litZones.clear();
    w.step();
    seen.push(...(dmgFor(w.tickEvents, 'b') as { amount: number }[]));
    expect(seen.length).toBeLessThanOrEqual(5);
    expect(seen.reduce((s, e) => s + e.amount, 0)).toBeCloseTo(hp0 - b.hp, 6);
  });

  it('a lethal bite flushes the bucket BEFORE the sink — a killing burn is never unreported', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 130, until: 999_999, phosphor: true, dazzle: false });
    const hp0 = b.hp;
    b.hp = 0.2; // a couple of bites from death, mid-window
    const seen: { amount: number }[] = [];
    for (let i = 0; i < 5 && isAfloat(b.lifecycle); i++) {
      w.step();
      seen.push(...(dmgFor(w.tickEvents, 'b') as { amount: number }[]));
    }
    expect(isAfloat(b.lifecycle)).toBe(false);
    expect(a.kills).toBe(1); // kill credit timing unchanged
    // The dmg arrived on the sinking tick (not stranded in an open bucket),
    // and reports every point applied: all the hp it had, and no more than one
    // extra bite of overkill (hp goes negative before the sink clamps it).
    const bite = CONFIG.starShells.incendiaryDps * (DT / 1000);
    const reported = seen.reduce((s, e) => s + e.amount, 0);
    expect(seen.length).toBeGreaterThan(0);
    expect(reported).toBeGreaterThanOrEqual(0.2);
    expect(reported).toBeLessThanOrEqual(0.2 + bite);
    void hp0;
  });

  it('a STANDARD zone burns nobody (mode gating)', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 165, until: 999_999, phosphor: false, dazzle: false });
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
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, phosphor: false, dazzle: true });
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
    // The dazzleBoard geometry with the zone moved OFF the observer: same
    // observer, same 250u contact, no dazzle — it must keep the contact.
    const w = bareWorld();
    place(w, 'a', 900, 900, 0, 'battleship');
    const b = place(w, 'b', 0, 0);
    place(w, 't', 250, 0);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 600, y: 600, r: 100, until: 999_999, phosphor: false, dazzle: true });
    w.step();
    expect(b.dazzledUntil).toBe(0);
    expect(buildFrame(w, 'b').contacts.map((c) => c.id)).toContain('t');
  });

  // Story 2.8 review, P9: the burn was gated on damageEnabled but the dazzle
  // mark was not, so a flare fired in the weapons-safe ready room still blinded
  // people. RULING: ALL hostile zone effects ride the same policy flag.
  it('with damage suppressed (the ready room) a dazzle zone marks NOBODY — one flag, one policy', () => {
    const { w, b } = dazzleBoard();
    w.damageEnabled = false; // the waiting/countdown ready room
    for (let i = 0; i < 5; i++) w.step();
    expect(b.dazzledUntil).toBe(0); // never marked...
    expect(buildFrame(w, 'b').contacts.map((c) => c.id)).toContain('t'); // ...so sight is full
    // Flip damage on: the very same board dazzles immediately.
    w.damageEnabled = true;
    w.step();
    expect(b.dazzledUntil).toBe(w.now + 250);
  });

  it('the OWNER inside its own dazzle zone is never dazzled', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, phosphor: false, dazzle: true });
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


// ---------------------------------------------------------------------------
// STORY 7-5 WAVE 1: THE VERBS STACK.
//
// Doctrine stopped being an either/or `mode` on torpedoes, mines and star
// shells and became INDEPENDENT BOOLEAN VERBS, so a firer may hold BOTH cards
// of what used to be an exclusive pair. Every suite below is UNEXPRESSIBLE in
// the old model: an enum could only ever hold the last-granted verb, and the
// zone-effect scan was an `if (dazzle) … else if (incendiary) …` chain that
// structurally could not burn and blind the same hull.
// ---------------------------------------------------------------------------

describe('PHOSPHOR + DAZZLE stack on one star shell', () => {
  /** A Battleship holding BOTH star-shell verbs, granted in `order`. */
  function bothStars(order: readonly string[]): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    for (const id of order) w.applyBoon(a, id);
    return { w, a };
  }

  it('holding both cards sets both flags — and pick ORDER cannot erase either', () => {
    for (const order of [['starIncendiary', 'starDazzle'], ['starDazzle', 'starIncendiary']]) {
      const { a } = bothStars(order);
      expect(a.stats.starShells.phosphor).toBe(true);
      expect(a.stats.starShells.dazzle).toBe(true);
    }
  });

  it('the fired flare stamps BOTH verbs on its zone, at the phosphor-shrunk radius', () => {
    const { w, a } = bothStars(['starIncendiary', 'starDazzle']);
    setInput(a, { aim: 0, aimDist: 400, slot: 2, fireSeq: 1, seq: 2 });
    for (let i = 0; i < 60 && w.litZones.size === 0; i++) w.step();
    const zone = [...w.litZones.values()][0];
    expect(zone.phosphor).toBe(true);
    expect(zone.dazzle).toBe(true);
    // Only the phosphor half moves the radius; dazzle never did.
    expect(zone.r).toBeCloseTo(CONFIG.starShells.litRadius * CONFIG.starShells.incendiaryRadiusFactor, 6);
  });

  // THE REGRESSION PIN. Pre-7-5 markZoneEffects ran `if (dazzle) … else if
  // (incendiary) …`, so a both-verb zone dazzled and NEVER burned. This fails
  // outright against that chain.
  it('a both-verb zone BURNS and BLINDS the same hull in the same tick', () => {
    const w = bareWorld();
    const a = place(w, 'a', 900, 900, 0, 'battleship'); // owner, far from its own zone
    const b = place(w, 'b', 0, 0); // the victim, inside
    place(w, 't', 250, 0); // inside base sight (330), outside dazzled sight (165)
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, phosphor: true, dazzle: true });
    for (let i = 0; i < 20; i++) w.step(); // one second
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.starShells.incendiaryDps, 4); // it burned
    expect(b.dazzledUntil).toBe(w.now + 250); // and it is blind
    expect(buildFrame(w, 'b').contacts.map((c) => c.id)).not.toContain('t');
  });

  it('the two flags ride the wire independently, omitted when false', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'battleship');
    w.litZones.set('plain', { id: 'plain', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, phosphor: false, dazzle: false });
    w.litZones.set('burn', { id: 'burn', ownerId: 'a', x: 10, y: 0, r: 100, until: 999_999, phosphor: true, dazzle: false });
    w.litZones.set('blind', { id: 'blind', ownerId: 'a', x: 20, y: 0, r: 100, until: 999_999, phosphor: false, dazzle: true });
    w.litZones.set('both', { id: 'both', ownerId: 'a', x: 30, y: 0, r: 100, until: 999_999, phosphor: true, dazzle: true });
    const wire = new Map(buildFrame(w, 'a').litZones!.map((z) => [z.id, z]));
    expect(wire.get('plain')).toEqual({ id: 'plain', x: 0, y: 0, r: 100, until: 999_999, by: 'a' });
    expect(wire.get('burn')!.phos).toBe(true);
    expect(wire.get('burn')!.daz).toBeUndefined();
    expect(wire.get('blind')!.phos).toBeUndefined();
    expect(wire.get('blind')!.daz).toBe(true);
    expect(wire.get('both')!.phos).toBe(true);
    expect(wire.get('both')!.daz).toBe(true);
  });
});

describe('PROP-FOULING + SELF-PROPELLED stack on one mine', () => {
  it('holding both cards sets both flags — and pick ORDER cannot erase either', () => {
    for (const order of [['minePropFouling', 'mineSelfPropelled'], ['mineSelfPropelled', 'minePropFouling']]) {
      const w = bareWorld();
      const o = place(w, 'o', 600, 600, 0, 'mineLayer');
      for (const id of order) w.applyBoon(o, id);
      expect(o.stats.mine.propFouling).toBe(true);
      expect(o.stats.mine.selfPropelled).toBe(true);
    }
  });

  it('a both-verb owner lays a mine that CREEPS and, when it blows, FOULS', () => {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    w.applyBoon(o, 'minePropFouling');
    w.applyBoon(o, 'mineSelfPropelled');
    // Beam-on prey well inside acquire reach, well outside the trip ring.
    const prey = place(w, 'prey', 55, 0, Math.PI / 2);
    w.mines.set('m', { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    w.step();
    expect(w.mines.get('m')!.x).toBeCloseTo(CONFIG.mine.creepSpeed * (DT / 1000), 6); // it crept
    // Walk the prey onto it and confirm the blast still carries the slow.
    for (let i = 0; i < 200 && w.mines.size > 0; i++) w.step();
    expect(w.mines.size).toBe(0); // it tripped
    expect(prey.slowedUntil).toBeGreaterThan(0); // and it fouled
  });
});
