// WEAPON BEHAVIOUR on the water, end-to-end through the REAL fire/step seams
// against the production catalog: TORPEDO HOMING (incl. the 'torpU' wire
// rules), CAPTIVE MINES, FOULING MINES (incl. the pinned boost→slow→hooks
// composition), PHOSPHOR + DAZZLE (star shells, incl. the dazzled observer's
// shrunken sight) — plus the vacated-owner CONFIG fallback.
//
// STORY 8.13 TOOK THE LAST OF THE "DOCTRINE" MODEL OUT OF THE MINES AND
// TORPEDOES, and this file is where that shows most (Eric rulings 2026-09-19,
// epic-8 amendments 76/80/81/82):
//
//   * HOMING IS A TIER STAT. ACOUSTIC HOMING is deleted; `homingTurnRate`
//     rides the torpedo row and steps 0 → 0.5 rad/s across the five rungs, so
//     the cases below buy TIERS instead of a card. Tier I is the straight
//     runner every "a standard fish" control used to be.
//   * THE MINE KIND RIDES THE MINE. `captive` and `propFouling` were flags on
//     the NAVAL row that converted a field already on the water; CAPTIVE MINES
//     and FOULING MINES are now their own lines and a mine's kind is STAMPED
//     AT DROP. Nothing here forges a flag onto an owner any more; a captive
//     mine is laid by asking for one.
//   * FOULING IS ITS OWN WEAPON, and a naval mine NEVER fouls. Its damage is a
//     fixed 10, its blast is wide, and its slow DEPTH (not its duration) is
//     what the tiers buy.
//
// The cannon's PLUNGING FIRE / ARMOR-PIERCING pair, SELF-PROPELLED mines and
// COMMAND DETONATION were all retired with their mechanics in earlier stories;
// their notes survive below where the suites used to sit.

import { describe, it, expect } from 'vitest';
import { isAfloat, transitionLifecycle, CATALOG, CONFIG, effectiveStats, DEFAULT_HORN_ID, HULL_IDS, droneHullOf, hullEnvelope, captiveTriggerRadius, type GameEvent, type InputMsg, type MineKind, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import { circleIsland } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;

// NINE FIXED-ROLE SLOTS (Story 8.5): every captain spawns [gun, boost,
// <spawn-seed weapons>, ...]. The seed lands its lines in the WEAPON row
// (2, 3, 4) in seed order, so a hull's FIRST class weapon (TB heavyTorpedo,
// ML navalMines, BS broadside) is slot 2 and the Battleship's SECOND
// (starShells) is slot 3.
/** The first weapon slot (Q): the TB's torpedo, the ML's mine rack. */
const SLOT_SEED_1 = 2;
/** The second weapon slot (E): the Battleship's star shells. */
const SLOT_SEED_2 = 3;

// THE INJECTED `mineBlast` LADDER IS DELETED (Story 8.13). It existed for one
// cycle because `equipment.navalMines.blastRadius` was a live whitelisted stat
// with no CARD behind it — the naval line's tiers II–V were empty and
// inventing them in a fixture was exactly what Story 8.12 forbade. Catalog v3
// now authors them for real (×1.1 blast per rung), so the vacated-owner pin
// buys real copies of the real line and this file runs on the PRODUCTION
// catalog with nothing injected.
function bareWorld(seed = 3, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, opts);
  w.map.islands.length = 0;
  return w;
}

/**
 * FIT A LINE TO `copies` (tier `copies`), through the same `applyCard` path a
 * real pick takes. Story 8.13's ladders are what these suites buy now: a
 * torpedo's homing, a captive fish's homing and a fouling mine's slow depth
 * are all TIER STATS, so a case that wants one asks for the rung.
 */
function fitTier(w: World, rec: ShipRecord, line: string, copies: number): void {
  for (let i = 0; i < copies; i += 1) w.applyCard(rec, line);
}

/** Lay one mine of `kind` straight into world state, armed. The KIND is the
 *  mine's own since Story 8.13 (amendment 76) — never a flag on its layer. */
function lay(w: World, id: string, ownerId: string, x: number, y: number, kind: MineKind, armedAt = 0): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt, kind });
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined, []);
  // THE CLASS WEAPON IS A CARD NOW (Story 8.10, amendment 62): the interim
  // spawn seed is deleted and a hull comes up with gun + Shift and an EMPTY
  // weapon row, so this fixture fits it explicitly through the same applyCard
  // path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
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
// TORPEDO HOMING — a TIER STAT since Story 8.13 (epic-8 amendment 80)
// ---------------------------------------------------------------------------
// ACOUSTIC HOMING the CARD is deleted. `homingTurnRate` now rides the torpedo
// row: 0 rad/s at tier I (a straight runner — no steering, no `torpU`, no
// die-distance) stepping +0.125 to 0.5 rad/s at tier V, on BOTH torpedo lines.
// So these cases buy RUNGS instead of a card, and the "a standard fish" control
// every one of them carried is simply a tier-I fish.

/** The COPIES that take a torpedo line to its top rung — where its turn rate
 *  is the 0.5 rad/s the shipped ACOUSTIC HOMING doctrine used to grant, so the
 *  geometry every case below was written against is unchanged. */
const TORPEDO_CAP = CATALOG.heavyTorpedo.cap;

describe('TORPEDO HOMING (the tier stat) — steering + the torpU wire rules', () => {
  /** TB firing a TOP-RUNG fish along +x with an off-axis enemy inside acquire
   *  range of the flight path; extra observers per test. */
  function homingBoard(): { w: World; a: ShipRecord; b: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    fitTier(w, a, 'heavyTorpedo', TORPEDO_CAP - 1); // copy 1 came from the class fit
    expect(a.stats.equipment.heavyTorpedo.homingTurnRate).toBeCloseTo(CONFIG.torpedo.homingTurnRate, 9);
    const b = place(w, 'b', 320, 80); // off the track; within 120u of it mid-flight
    setInput(a, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
    return { w, a, b };
  }

  // FAIL-FIRST REGRESSION (Story 8.13): the rung where steering STARTS. At
  // tier I the fish must carry NO `homing` tag at all — that structural zero
  // is what keeps sim/shell.ts from steering it and perception from emitting a
  // `torpU` for it — and at tier II it must carry the ROW's rate, not the
  // family's tier-V reference value.
  it('tier I carries NO homing tag and no die-distance; tier II carries the ROW\'s rate and the family budget', () => {
    const w = bareWorld();
    const one = place(w, 'a', 0, 0); // the class fit alone = tier I
    expect(one.stats.equipment.heavyTorpedo.homingTurnRate).toBe(0);
    setInput(one, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
    w.step();
    const straight = [...w.shells.values()][0];
    expect(straight.homing).toBeUndefined();
    expect(straight.distLeft).toBe(Number.POSITIVE_INFINITY);

    const w2 = bareWorld(4);
    const two = place(w2, 'a', 0, 0);
    fitTier(w2, two, 'heavyTorpedo', 1); // tier II
    const rate = two.stats.equipment.heavyTorpedo.homingTurnRate;
    expect(rate).toBeCloseTo(0.125, 9);
    expect(rate).toBeLessThan(CONFIG.torpedo.homingTurnRate); // NOT the tier-V reference
    setInput(two, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
    w2.step();
    const homer = [...w2.shells.values()][0];
    expect(homer.homing).toEqual({ turnRate: rate, acquireRange: CONFIG.torpedo.homingAcquireRange });
    expect(homer.distLeft).toBeLessThanOrEqual(CONFIG.torpedo.homingMaxRangeU);
  });

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
    setInput(ca, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
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
    fitTier(w, a, 'heavyTorpedo', TORPEDO_CAP - 1);
    const prey = place(w, 'b', 300, 110); // acquired, but inside the fish's turn radius
    prey.hp = 1e9; // survive any glancing contact — this is about the FISH dying
    setInput(a, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });

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
    const perTick = a.stats.equipment.heavyTorpedo.speed * (DT / 1000);
    expect(travelled).toBeGreaterThan(CONFIG.torpedo.homingMaxRangeU - 2 * perTick);
    expect(travelled).toBeLessThanOrEqual(CONFIG.torpedo.homingMaxRangeU);
  });

  it('a STRAIGHT-RUNNING fish keeps its unbounded range — the budget rides the turn rate alone', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    fitTier(w, a, 'heavyTorpedo', TORPEDO_CAP - 1);
    setInput(a, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
    w.step();
    expect([...w.shells.values()][0].distLeft).toBeLessThanOrEqual(CONFIG.torpedo.homingMaxRangeU);

    const control = bareWorld();
    const ca = place(control, 'a', 0, 0); // tier I — a straight runner
    setInput(ca, { aim: 0, aimDist: 0, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
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
    for (const extraCopies of [0, TORPEDO_CAP - 1]) {
      const w = bareWorld();
      const a = place(w, 'a', 0, 0);
      fitTier(w, a, 'heavyTorpedo', extraCopies);
      setInput(a, { aim: 0, aimDist: 400, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
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
    setInput(a, { aim: 0, aimDist: 200, slot: SLOT_SEED_1, fireSeq: 1, seq: 2 });
    const seen: GameEvent[] = [];
    for (let i = 0; i < 200 && blocker.hp === blocker.stats.maxHp; i++) {
      w.step();
      seen.push(...w.tickEvents);
    }
    expect(seen.some((e) => e.k === 'burst')).toBe(false); // no point-detonation, ever
    expect(bystander.hp).toBe(bystander.stats.maxHp);
    expect(blocker.hp).toBe(blocker.stats.maxHp - a.stats.equipment.heavyTorpedo.damage);
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
// mines entirely (their cases are the suites below). A mine sits where it was
// dropped again.

// ---------------------------------------------------------------------------
// CAPTIVE MINES (mineCaptive) — Story 7-5 wave 2, R2.12-R2.14
// ---------------------------------------------------------------------------
describe('CAPTIVE MINES — the mine never detonates; its torpedo is the attack', () => {
  /** A captive layer far away, its CAPTIVE mine at the origin, and a hull
   *  sitting INSIDE the fish's 32u burst so an ordinary contact detonation
   *  would be plainly visible — the discriminating geometry. `extra` fits more
   *  lines on the layer (the kind of the mine never follows from them). */
  function captiveBoard(extra: readonly string[] = []): { w: World; o: ShipRecord; b: ShipRecord } {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    w.applyCard(o, 'captiveMines');
    for (const id of extra) w.applyCard(o, id);
    const b = place(w, 'b', 0, 25); // silhouette ~15u out: inside the 32u burst
    lay(w, 'm1', 'o', 0, 0, 'captive');
    return { w, o, b };
  }

  it('a hull ON the mine does NOT detonate it — the mine is expended LAUNCHING instead', () => {
    const { w, b } = captiveBoard();
    w.step();
    expect(w.mines.size).toBe(0); // expended
    // NOT a detonation: no boom at the mine, and the hull standing inside the
    // blast radius takes nothing this tick. A contact mine would do both.
    expect(w.tickEvents.filter((e) => e.k === 'boom')).toHaveLength(0);
    expect(w.tickEvents.filter((e) => e.k === 'dmg')).toHaveLength(0);
    expect(b.hp).toBe(b.stats.maxHp);
    // What it did instead: ONE torpedo, in the water, launched from the mine.
    const fish = [...w.shells.values()];
    expect(fish).toHaveLength(1);
    expect(fish[0].kind).toBe('torp');
    expect(fish[0].ownerId).toBe('o');
  });

  it('the fish runs at the FAMILY speed and deals the CAPTIVE row\'s damage at its fixed 32u burst', () => {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    // The layer's own TUBES are maxed: a torpedo tier the LAYER holds must not
    // reach the mine's fish, because the fish belongs to the MINE (R2.12).
    // The heavy line's tiers now move speed for real, so this is no longer a
    // forced divergence — it is a real build.
    fitTier(w, o, 'heavyTorpedo', CATALOG.heavyTorpedo.cap);
    fitTier(w, o, 'captiveMines', 2); // tier II: +5 fish damage, homing on
    expect(o.stats.equipment.heavyTorpedo.speed).toBeGreaterThan(CONFIG.torpedo.speed);
    const row = o.stats.equipment.captiveMines;
    const b = place(w, 'b', 0, 40);
    lay(w, 'm1', 'o', 0, 0, 'captive');
    w.step();
    const fish = [...w.shells.values()][0];
    expect(Math.hypot(fish.vx, fish.vy)).toBeCloseTo(CONFIG.torpedo.speed, 6); // FAMILY speed
    expect(fish.hitRadius).toBe(CONFIG.torpedo.hitRadius);
    expect(fish.damage).toBe(row.damage); // the CAPTIVE row's warhead...
    expect(fish.burstRadius).toBe(CONFIG.captiveMines.blastRadius); // ...at the FIXED 32u burst
    expect(fish.burstRadius).toBe(32);
    // The NAVAL rack the layer also carries contributes nothing at all.
    expect(fish.damage).not.toBe(o.stats.equipment.navalMines.damage);
    // It runs home and detonates for the captive row's damage.
    for (let i = 0; i < 40 && w.shells.size > 0; i++) w.step();
    expect(b.hp).toBeCloseTo(b.stats.maxHp - row.damage, 6);
  });

  // FAIL-FIRST REGRESSION (epic-8 amendment 82): the captive fish's homing is
  // a TIER STAT of its own line, capped at 0.3 rad/s — not the torpedo
  // family's 0.5, and not a card.
  it('the fish is a straight-runner at tier I and HOMES from tier II, at the captive row\'s own rate', () => {
    for (const [copies, expected] of [[1, 0], [2, 0.075], [5, 0.3]] as const) {
      const w = bareWorld(40 + copies);
      const o = place(w, 'o', 600, 600, 0, 'mineLayer');
      fitTier(w, o, 'captiveMines', copies);
      expect(o.stats.equipment.captiveMines.homingTurnRate).toBeCloseTo(expected, 9);
      place(w, 'b', 0, 40);
      lay(w, 'm1', 'o', 0, 0, 'captive');
      w.step();
      const fish = [...w.shells.values()][0];
      if (expected === 0) {
        expect(fish.homing).toBeUndefined();
        expect(fish.distLeft).toBe(Number.POSITIVE_INFINITY);
      } else {
        expect(fish.homing).toEqual({ turnRate: expected, acquireRange: CONFIG.torpedo.homingAcquireRange });
        expect(fish.distLeft).toBe(CONFIG.torpedo.homingMaxRangeU);
      }
    }
  });

  // FAIL-FIRST REGRESSION (amendment 84d): the TRIP RING steps ×1.1 per rung
  // and is DERIVED from the tier inside the stat clamp — while the 32u burst
  // is fixed, so the line grows the reach of the trap and never the bang.
  it('the trip ring at tier V is 210.8u (144 × 1.1⁴) and the burst is still 32u', () => {
    const w = bareWorld(46);
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    fitTier(w, o, 'captiveMines', 5);
    const row = o.stats.equipment.captiveMines;
    expect(row.tier).toBe(5);
    expect(row.triggerRadius).toBeCloseTo(210.8, 1);
    expect(row.triggerRadius).toBeCloseTo(captiveTriggerRadius(5), 9);
    expect(row.blastRadius).toBe(32);
    // And it TRIPS out there: a hull 200u away is inside the tier-V ring and
    // was outside the tier-I one (144u).
    place(w, 'b', 0, 200);
    lay(w, 'm1', 'o', 0, 0, 'captive');
    w.step();
    expect(w.mines.size).toBe(0);
    expect(w.shells.size).toBe(1);
    expect([...w.shells.values()][0].burstRadius).toBe(32);
  });

  it('leads a MOVING target: the fish is aimed ahead of the hull, not at it', () => {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    w.applyCard(o, 'captiveMines');
    // A hull crossing the trip ring to port at speed, 120u up the y axis.
    const b = place(w, 'b', 0, 120, Math.PI); // bow -x
    b.state.speed = b.stats.kinematics.maxSpeed;
    lay(w, 'm1', 'o', 0, 0, 'captive');
    w.step();
    const fish = [...w.shells.values()][0];
    // Straight AT the hull would be +y (bearing π/2). A led shot is deflected
    // toward where the hull is going (−x), so the bearing is past π/2.
    expect(Math.atan2(fish.vy, fish.vx)).toBeGreaterThan(Math.PI / 2 + 1e-6);
  });

  // FLIPPED, NOT DELETED (Story 8.13, epic-8 amendment 81). The old pin said a
  // captive fish CARRIES THE FOUL when the layer also holds PROP FOULING —
  // true when both were doctrine verbs on ONE rack whose numbers the fish read.
  // They are two separate WEAPON LINES now, each with its own rack and its own
  // mines, so a captive fish fouls NOTHING even in the hands of a captain who
  // also carries a full fouling line.
  it('a CAPTIVE fish never fouls — not even when the layer also carries FOULING MINES', () => {
    const { w, o, b } = captiveBoard(['foulingMines']);
    expect(o.stats.equipment.foulingMines.slowFactor).toBeLessThan(1); // the rack IS aboard
    expect(o.stats.equipment.captiveMines.slowFactor).toBe(1); // the captive row's inert identity
    w.step(); // the mine trips and LAUNCHES
    for (let i = 0; i < 40 && w.shells.size > 0; i++) w.step();
    expect(b.hp).toBeCloseTo(b.stats.maxHp - o.stats.equipment.captiveMines.damage, 6); // it connected...
    expect(b.slowedUntil).toBe(0); // ...and slowed nothing
    expect(b.slowFactor).toBe(1);
  });

  // FLIPPED, NOT DELETED (Story 8.13, amendment 76). The old pin said a vacated
  // owner REVERTS its mine to an ordinary contact mine — true when `captive`
  // was a flag on the LAYER's live stats, which a departing layer took with it.
  // The kind is the MINE's own property now, stamped at drop, so a captive mine
  // stays captive: it launches at the line's CONFIG base numbers. What the
  // vacated owner still takes with it is the TIER.
  it('a VACATED owner keeps the KIND and loses only the TIER — the orphan still launches, at CONFIG base', () => {
    const w = bareWorld(47);
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    fitTier(w, o, 'captiveMines', 5); // tier V: 75 dmg, a homing fish
    expect(o.stats.equipment.captiveMines.damage).toBeGreaterThan(CONFIG.captiveMines.damage);
    const b = place(w, 'b', 0, 25);
    lay(w, 'm1', 'o', 0, 0, 'captive');
    w.removeShip('o');
    w.step();
    expect(w.mines.size).toBe(0); // expended LAUNCHING, not detonating
    expect(w.tickEvents.some((e) => e.k === 'boom')).toBe(false);
    const fish = [...w.shells.values()][0];
    expect(fish.damage).toBe(CONFIG.captiveMines.damage); // the BASE warhead
    expect(fish.burstRadius).toBe(CONFIG.captiveMines.blastRadius);
    expect(fish.homing).toBeUndefined(); // ...and the base rate is zero
    for (let i = 0; i < 40 && w.shells.size > 0; i++) w.step();
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.captiveMines.damage, 6);
  });
});

describe('CAPTIVE MINES — "HOSTILE" (R2.13): drones only count while they are hunting you', () => {
  function droneBoard(): { w: World; o: ShipRecord; d: ShipRecord } {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    w.applyCard(o, 'captiveMines');
    const d = w.addShip('d', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: 0, y: 40 }, []);
    w.drones.add('d', 'medium', 1, { x: 0, y: 0 });
    lay(w, 'm1', 'o', 0, 0, 'captive');
    return { w, o, d };
  }

  it('a NEUTRAL fleet drone sails straight over a captive mine — no launch, no detonation', () => {
    const { w } = droneBoard();
    expect(w.drones.targetOf('d')).toBeNull();
    w.step();
    expect(w.mines.size).toBe(1); // untouched
    expect(w.shells.size).toBe(0);
    expect(w.tickEvents.some((e) => e.k === 'boom')).toBe(false);
  });

  it('the SAME drone, once it has acquired the layer, is hostile and takes the fish', () => {
    const { w } = droneBoard();
    w.drones.onDamaged('d', 'o', false); // it now hunts the mine's owner
    expect(w.drones.targetOf('d')).toBe('o');
    w.step();
    expect(w.mines.size).toBe(0);
    expect(w.shells.size).toBe(1);
  });

  it('a neutral drone sitting on the mine does not MASK the enemy captain behind it', () => {
    const { w } = droneBoard(); // the drone is registered FIRST, so it is scanned first
    const cap = place(w, 'cap', 0, -40); // an enemy captain, also inside the trip ring
    w.step();
    expect(w.mines.size).toBe(0);
    const fish = [...w.shells.values()];
    expect(fish).toHaveLength(1);
    // Aimed at the CAPTAIN (−y), not at the neutral drone (+y).
    expect(fish[0].vy).toBeLessThan(0);
    expect(cap.state.y).toBeLessThan(0); // sanity: the captain is the −y one
  });

  it('THE GATE IS CAPTIVE-ONLY: a NAVAL and a FOULING mine both still trip on a neutral drone', () => {
    for (const kind of ['naval', 'fouling'] as const) {
      const w = bareWorld(kind === 'naval' ? 3 : 5);
      const o = place(w, 'o', 600, 600, 0, 'mineLayer');
      if (kind === 'fouling') w.applyCard(o, 'foulingMines');
      w.addShip('d', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: 0, y: 20 }, []);
      w.drones.add('d', 'medium', 1, { x: 0, y: 0 });
      lay(w, 'm1', 'o', 0, 0, kind);
      w.step();
      expect(w.mines.size, kind).toBe(0);
      expect(w.tickEvents.some((e) => e.k === 'boom'), kind).toBe(true); // a real detonation
      expect(w.shells.size, kind).toBe(0);
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
    lay(w, 'm1', 'o', 20, 0, 'naval');
    lay(w, 'm2', 'o', -20, 0, 'naval');
    w.step();
    expect(w.mines.size).toBe(0);
    const booms = w.tickEvents.filter((e) => e.k === 'boom') as { id: string }[];
    expect(booms.map((b) => b.id).sort()).toEqual(['m1', 'm2']); // ONE boom per mine
    const dmgs = w.tickEvents.filter((e) => e.k === 'dmg' && e.id === 'v');
    expect(dmgs).toHaveLength(2); // one application per mine — never four
    expect(victim.hp).toBeCloseTo(victim.stats.maxHp - 2 * o.stats.equipment.navalMines.damage, 6);
  });

  it('a gun burst over a same-owner cluster detonates each mine once (snapshot ∩ cascade)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0, 0, 'mineLayer');
    // Three mines clustered so the burst snapshot AND the chain both reach them.
    lay(w, 'm1', 'o', 200, 0, 'naval');
    lay(w, 'm2', 'o', 210, 0, 'naval');
    lay(w, 'm3', 'o', 220, 0, 'naval');
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

describe('FOULING MINES — its own tiered line: 10 damage, a wide blast, a tiered slow (amendment 81)', () => {
  /** A fouling layer far away, `copies` deep in the line, with its FOULING
   *  mine at the origin and a hull sitting on it. */
  function foulBoard(copies = 1): { w: World; o: ShipRecord; b: ShipRecord } {
    const w = bareWorld();
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    fitTier(w, o, 'foulingMines', copies);
    const b = place(w, 'b', 0, 10); // trips the mine below on the first step
    lay(w, 'm1', 'o', 0, 0, 'fouling');
    return { w, o, b };
  }

  // THE LINE PAYS FOR ITS SLOW IN DAMAGE, BY DESIGN (amendment 81: *"deals
  // minimal damage with a larger trigger/blast radius and slows the enemy"*).
  // 10 hp is FIXED at every tier and so is the 5 s window; what the rungs buy
  // is blast, pool and the DEPTH of the slow.
  it('the blast deals the line\'s fixed 10 damage and stamps BOTH the clock and the factor (refresh, never stack)', () => {
    const { w, o, b } = foulBoard();
    w.step();
    const row = o.stats.equipment.foulingMines;
    expect(row.damage).toBe(CONFIG.foulingMines.damage);
    expect(row.damage).toBe(10);
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.foulingMines.damage, 6);
    expect(b.slowedUntil).toBe(w.now + CONFIG.foulingMines.slowDurationMs);
    expect(b.slowFactor).toBe(row.slowFactor);
    const firstUntil = b.slowedUntil;
    // A second fouling blast REFRESHES the window (plain re-stamp, no stacking).
    for (let i = 0; i < 10; i++) w.step();
    lay(w, 'm2', 'o', b.state.x, b.state.y - 10, 'fouling');
    w.step();
    expect(b.slowedUntil).toBe(w.now + CONFIG.foulingMines.slowDurationMs);
    expect(b.slowedUntil).toBeGreaterThan(firstUntil);
    expect(b.slowFactor).toBe(row.slowFactor); // and the factor is re-stamped, never multiplied
  });

  // FAIL-FIRST REGRESSION (Story 8.13): REFRESH-NOT-STACK on the FACTOR, which
  // is the half a clock-only pin cannot see. A victim already deep-fouled by a
  // tier-V rack and then caught by a tier-I one must end up at the LATER
  // mine's factor — 0.75 — not at the product (0.55 × 0.75) and not at the
  // better of the two.
  it('a LATER fouling OVERWRITES the factor, even when it is weaker — never multiplies, never keeps the best', () => {
    const w = bareWorld(51);
    const deep = place(w, 'deep', 600, 600, 0, 'mineLayer');
    fitTier(w, deep, 'foulingMines', 5); // tier V: ×0.55
    const shallow = place(w, 'shallow', -600, 600, 0, 'mineLayer');
    fitTier(w, shallow, 'foulingMines', 1); // tier I: ×0.75
    expect(deep.stats.equipment.foulingMines.slowFactor).toBeCloseTo(0.55, 9);
    expect(shallow.stats.equipment.foulingMines.slowFactor).toBeCloseTo(0.75, 9);

    const b = place(w, 'b', 0, 10);
    lay(w, 'm-deep', 'deep', 0, 0, 'fouling');
    w.step();
    expect(b.slowFactor).toBeCloseTo(0.55, 9);

    lay(w, 'm-shallow', 'shallow', b.state.x, b.state.y - 10, 'fouling');
    w.step();
    expect(b.slowFactor).toBeCloseTo(0.75, 9); // the LATER one wins outright
    expect(b.slowedUntil).toBe(w.now + CONFIG.foulingMines.slowDurationMs);
  });

  it('the slow DEEPENS with the tier and the duration never moves (−0.05 a rung: 0.75 → 0.55)', () => {
    for (const [copies, factor] of [[1, 0.75], [2, 0.7], [5, 0.55]] as const) {
      const { w, o, b } = foulBoard(copies);
      expect(o.stats.equipment.foulingMines.slowFactor).toBeCloseTo(factor, 9);
      w.step();
      expect(b.slowFactor).toBeCloseTo(factor, 9);
      expect(b.slowedUntil).toBe(w.now + CONFIG.foulingMines.slowDurationMs); // FIXED 5 s
    }
  });

  // A NAVAL MINE NO LONGER FOULS ANYTHING (amendment 81). The verb left the
  // rack with the add-on card; this is the pin that keeps it gone.
  it('a NAVAL mine never fouls — full naval damage, no clock, no factor', () => {
    const w = bareWorld(52);
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    fitTier(w, o, 'foulingMines', 5); // the fouling rack IS aboard, deep
    const b = place(w, 'b', 0, 10);
    lay(w, 'm1', 'o', 0, 0, 'naval'); // ...but THIS mine came off the naval rack
    w.step();
    expect(b.hp).toBeCloseTo(b.stats.maxHp - o.stats.equipment.navalMines.damage, 6);
    expect(b.slowedUntil).toBe(0);
    expect(b.slowFactor).toBe(1);
  });

  it('a fouled hull is capped at the VICTIM\'s slowFactor × maxSpeed until the window closes (boost→slow→hooks order)', () => {
    const { w, o, b } = foulBoard();
    const factor = o.stats.equipment.foulingMines.slowFactor;
    w.step(); // the blast lands; b is fouled
    setInput(b, { throttle: 1 });
    b.input.throttle = 1;
    for (let i = 0; i < 60; i++) w.step(); // 3s at full throttle, well inside the window
    expect(b.state.speed).toBeLessThanOrEqual(b.stats.kinematics.maxSpeed * factor + 1e-9);
    expect(b.state.speed).toBeCloseTo(b.stats.kinematics.maxSpeed * factor, 1);
    // The window expires; the hull works back up to its full cap.
    for (let i = 0; i < Math.ceil(CONFIG.foulingMines.slowDurationMs / DT) + 100; i++) w.step();
    expect(b.state.speed).toBeCloseTo(b.stats.kinematics.maxSpeed, 1);
  });

  it('an active BOOST composes boosted→slowed: the fouled cap is (max × 1.25) × slowFactor', () => {
    const { w, o, b } = foulBoard();
    const factor = o.stats.equipment.foulingMines.slowFactor;
    w.step();
    b.boostUntil = Number.MAX_SAFE_INTEGER; // hold the boost window open
    b.slowedUntil = Number.MAX_SAFE_INTEGER; // hold the slow too — isolate the composition
    b.input.throttle = 1;
    for (let i = 0; i < 100; i++) w.step();
    // Amendment 55: the boost bonus is CONFIG.boost.factor x the POST-FOLD max
    // (the one shared boostedKinematics hook), NOT a flat per-row speedBonus.
    const boostedMax = b.stats.kinematics.maxSpeed + b.stats.kinematics.maxSpeed * CONFIG.boost.factor;
    expect(b.state.speed).toBeCloseTo(boostedMax * factor, 1);
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
    // FOUR MORE COPIES OF THE REAL LINE (Story 8.13 authored its tiers): the
    // class fit is copy 1, so this is tier V — 48 → 48 × 1.1^4 ≈ 70.3u.
    fitTier(w, o, 'navalMines', 4);
    expect(o.stats.equipment.navalMines.blastRadius).toBeGreaterThan(CONFIG.mine.blastRadius);
    lay(w, 'm1', 'o', 0, 0, 'naval');
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
    w.applyCard(a, 'phosphorShells');
    setInput(a, { aim: 0, aimDist: 400, slot: SLOT_SEED_2, fireSeq: 1, seq: 2 });
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
    for (const id of order) w.applyCard(a, id);
    return { w, a };
  }

  it('holding both cards sets both flags — and pick ORDER cannot erase either', () => {
    for (const order of [['phosphorShells', 'dazzleShells'], ['dazzleShells', 'phosphorShells']]) {
      const { a } = bothStars(order);
      expect(a.stats.equipment.starShells.phosphor).toBe(true);
      expect(a.stats.equipment.starShells.dazzle).toBe(true);
    }
  });

  it('the fired flare stamps BOTH verbs on its zone, at the phosphor-shrunk radius', () => {
    const { w, a } = bothStars(['phosphorShells', 'dazzleShells']);
    setInput(a, { aim: 0, aimDist: 400, slot: SLOT_SEED_2, fireSeq: 1, seq: 2 });
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
