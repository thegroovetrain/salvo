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
// CANNON DOCTRINES — RETIRED (Story 7-5 wave 2, R2.6)
// ---------------------------------------------------------------------------
// PLUNGING FIRE (overflight of islands AND hulls, always bursting at the
// click) and ARMOR-PIERCING (the direction shot, 100/50/25 falloff across up
// to three hulls, derived non-terminal boom ids, the island hard stop) were
// pinned here across six cases. ALL SIX ARE RETIRED WITH THEIR SUBJECT: the
// CANNON is deleted, both doctrine cards left the catalog, and the shared
// machinery that made them possible — ShellState.arcing, ShellState.pierce,
// the 'pierced' outcome and PIERCE_FALLOFF — is gone from `shared/`. Nothing
// in the game overflies terrain or pierces a second hull any more.
//
// The BROADSIDE BARRAGE that replaced the cannon has NO doctrine cards at
// all (its two lines are throughput and spread), so nothing lands here in
// their place; the weapon itself is pinned end-to-end in broadside.test.ts.

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
// MINES: PROP-FOULING (slow debuff) — SELF-PROPELLED is RETIRED
// ---------------------------------------------------------------------------
// SELF-PROPELLED MINES (armed creep toward the nearest enemy silhouette) was
// pinned here across ten cases: the creep itself, bow-on acquisition past the
// old centre ring, closing-before-tripping, the boon-stacked trigger ring, the
// island-rim stop, the two-island pinch rejection and the water-disk clamp.
// ALL TEN ARE RETIRED WITH THEIR SUBJECT (Story 7-5 wave 2): the
// `mineSelfPropelled` card and the `mine.selfPropelled` verb are deleted, the
// World's creep step is deleted with them, and CAPTIVE MINES replace tracking
// mines entirely (a later agent builds the captive verb and brings its own
// cases). A mine sits where it was dropped again.

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

// RETIRED (Story 7-5 wave 2): "PROP-FOULING + SELF-PROPELLED stack on one
// mine". Both cases assert about the deleted `mineSelfPropelled` verb. The
// PROPERTY they were written for — independent verb flags STACK on one
// weapon, and pick ORDER cannot erase either — is re-established by R2.14
// (CAPTIVE stacks with PROP FOULING, and the captive torpedo's hit carries
// the foul), which the agent building captive mines pins here in their place.
