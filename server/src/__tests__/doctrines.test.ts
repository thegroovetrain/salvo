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
import { isAfloat, transitionLifecycle, CATALOG, CONFIG, CONSUMABLE_SLOTS, effectiveStats, DEFAULT_HORN_ID, HULL_IDS, droneHullOf, hullEnvelope, captiveTriggerRadius, type GameEvent, type InputMsg, type MineKind, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import { sightOf } from '../game/signals.js';
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
const hpLost = (s: { hp: number; stats: { maxHp: number } }): number => s.stats.maxHp - s.hp;
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
  w.mines.set(id, { id, ownerId, x, y, armedAt, kind, hp: 10 });
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
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
  ship.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
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
        // The LOCK is pinned at launch (cycle-148 review gate, P6): this fish
        // is the tripping hull's and nobody else's, for its whole run.
        expect(fish.homing).toEqual({
          turnRate: expected,
          acquireRange: CONFIG.torpedo.homingAcquireRange,
          targetId: 'b',
          locked: true,
        });
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
    const d = w.addShip('d', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: 0, y: 40 });
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

  // CYCLE-148 REVIEW GATE, P6 — THE GATE MUST SURVIVE THE FLIGHT.
  //
  // R2.13 is a WORLD read (is this drone hunting me right now?) and `steerHoming`
  // is pure shared sim, so a fish that re-acquired mid-run could only re-acquire
  // BLIND — and would happily take a neutral drone that drifted nearer, springing
  // the trap on the exact hull the gate had refused. The lock is pinned at launch
  // instead: the fish steers at its victim and at nobody else.
  it('a tier-II fish keeps steering at the HOSTILE captain past a nearer neutral drone', () => {
    const w = bareWorld(51);
    const o = place(w, 'o', 900, 900, 0, 'mineLayer');
    fitTier(w, o, 'captiveMines', 2); // tier II: the first rung that steers
    // The HOSTILE captain trips the mine from −y...
    const cap = place(w, 'cap', 0, -60);
    // ...and a NEUTRAL drone sits NEARER the launch point, on the far side of
    // the fish's course and well inside the family's 120 u acquire range. An
    // unlocked fish takes the drone — it is the nearest thing in the water.
    const drone = w.addShip('d', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: 45, y: 25 });
    drone.state = { x: 45, y: 25, heading: 0, speed: 0 };
    w.drones.add('d', 'medium', 1, { x: 45, y: 25 }); // stationed where it stands
    lay(w, 'm1', 'o', 0, 0, 'captive');
    w.step();

    const fish = [...w.shells.values()][0];
    expect(fish.homing?.targetId).toBe('cap'); // the gate's answer, pinned
    expect(fish.vy).toBeLessThan(0); // running at the captain, not the drone
    // ...and it STAYS pinned with the drone sitting right there: the lock never
    // widens, and the fish's course never turns back toward +y.
    for (let i = 0; i < 40 && w.shells.size > 0; i += 1) {
      w.step();
      const live = [...w.shells.values()][0];
      if (live === undefined) break;
      expect(live.homing?.targetId).toBe('cap');
      expect(live.vy).toBeLessThan(0);
    }
    expect(cap.hp).toBeLessThan(cap.stats.maxHp); // it connected with the captain
  });

  it('THE GATE IS CAPTIVE-ONLY: a NAVAL and a FOULING mine both still trip on a neutral drone', () => {
    for (const kind of ['naval', 'fouling'] as const) {
      const w = bareWorld(kind === 'naval' ? 3 : 5);
      const o = place(w, 'o', 600, 600, 0, 'mineLayer');
      if (kind === 'fouling') w.applyCard(o, 'foulingMines');
      w.addShip('d', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: 0, y: 20 });
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

  it('a gun click ON a same-owner cluster pops each mine once (landing test ∩ cascade, amendment 200)', () => {
    const w = bareWorld();
    const o = place(w, 'o', 0, 0, 0, 'mineLayer');
    // Three mines clustered so the LANDING TEST (m1 and m2 are 5u off the
    // click, inside the 10u disc) AND the chain (m3, 15u off) both reach them:
    // m1's pop chains m2 and m3, and the landing loop then finds m2 gone.
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

  // FAIL-FIRST REGRESSION (Story 8.13, amendment 88 — Eric 2026-09-19 "keep
  // the strongest slow"): a victim already deep-fouled by a tier-V rack and
  // then caught by a tier-I one KEEPS the deeper factor (0.55) — not the
  // later 0.75, not the product (0.55 × 0.75) — while the CLOCK refreshes to
  // the later hit. The reverse (a deeper mine after a shallow one) deepens.
  it('a LATER WEAKER fouling keeps the STRONGEST factor and refreshes the clock — never multiplies, never lifts', () => {
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
    expect(b.slowFactor).toBeCloseTo(0.55, 9); // the STRONGEST stands
    expect(b.slowedUntil).toBe(w.now + CONFIG.foulingMines.slowDurationMs); // clock refreshed
  });

  it('a LATER DEEPER fouling deepens the factor; a fouling after the window lapsed lands as-is', () => {
    const w = bareWorld(53); // seed moved (Story 9.1, 2026-10-07): the old one is a map-generation throw on the 5500 u / 10 % ocean
    const deep = place(w, 'deep', 600, 600, 0, 'mineLayer');
    fitTier(w, deep, 'foulingMines', 5);
    const shallow = place(w, 'shallow', -600, 600, 0, 'mineLayer');
    fitTier(w, shallow, 'foulingMines', 1);
    const b = place(w, 'b', 0, 10);
    lay(w, 'm-shallow', 'shallow', 0, 0, 'fouling');
    w.step();
    expect(b.slowFactor).toBeCloseTo(0.75, 9);
    lay(w, 'm-deep', 'deep', b.state.x, b.state.y - 10, 'fouling');
    w.step();
    expect(b.slowFactor).toBeCloseTo(0.55, 9); // deeper later fouling deepens
    // Let the window lapse, then a shallow one lands at its own factor.
    b.slowedUntil = w.now - 1;
    lay(w, 'm-shallow-2', 'shallow', b.state.x, b.state.y - 10, 'fouling');
    w.step();
    expect(b.slowFactor).toBeCloseTo(0.75, 9);
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
    const w = bareWorld(53); // seed moved (Story 9.1, 2026-10-07): the old one is a map-generation throw on the 5500 u / 10 % ocean
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

  // THE DEPTH RIDES WITH THE WINDOW (Story 8.13, epic-8 amendment 86) — and on
  // exactly the same terms. FAIL-FIRST: before the field, a tier-V victim's
  // own frame said only "you are slowed", and the client could not tell 0.55
  // from 0.75. KEY TESTS, not value tests: a present-but-undefined key on an
  // observer's payload would still be a structural tell.
  it('slowFactor rides `you` on the FOULED victim alone — the LAYER\'s tiered number, never a contact', () => {
    const w = bareWorld(53);
    const o = place(w, 'o', 600, 600, 0, 'mineLayer');
    fitTier(w, o, 'foulingMines', 5); // tier V: ×0.55
    const b = place(w, 'b', 0, 10);
    // Well outside the tier-V blast (72 × 1.1^4 ≈ 105 u) but inside sight of
    // `b`, so the watcher is a genuine observer and never a victim.
    const c = place(w, 'c', 0, 300);
    lay(w, 'm1', 'o', 0, 0, 'fouling');
    w.step();

    const fb = buildFrame(w, 'b');
    expect(fb.you!.slowFactor).toBeCloseTo(0.55, 9);
    expect(fb.you!.slowFactor).toBe(b.slowFactor);
    expect(fb.you!.slowFactor).toBe(o.stats.equipment.foulingMines.slowFactor);

    // NOBODY ELSE, on any channel: not the watcher's own ship, not its contact
    // for the victim, not the LAYER's frame, and not any event it carries.
    const fc = buildFrame(w, 'c');
    const contact = fc.contacts.find((ct) => ct.id === 'b')!;
    expect(contact).toBeDefined();
    expect('slowFactor' in contact).toBe(false);
    expect('slowFactor' in fc.you!).toBe(false);
    expect(c.slowFactor).toBe(1);
    const fo = buildFrame(w, 'o');
    expect('slowFactor' in fo.you!).toBe(false);
    expect(JSON.stringify(fc.events)).not.toContain('slowFactor');
  });

  it('the key is OMITTED, never 1 and never undefined, on an un-fouled hull and once the window closes', () => {
    const { w, b } = foulBoard();
    // Before the blast: nothing slowed, so nothing on the wire.
    expect('slowFactor' in buildFrame(w, 'b').you!).toBe(false);
    w.step(); // the fouling lands
    expect(buildFrame(w, 'b').you!.slowFactor).toBeCloseTo(0.75, 9);
    // Run the window out: the clock and the depth leave together.
    for (let i = 0; i < Math.ceil(CONFIG.foulingMines.slowDurationMs / DT) + 2; i++) w.step();
    const f = buildFrame(w, 'b');
    expect('slowedUntil' in f.you!).toBe(false);
    expect('slowFactor' in f.you!).toBe(false);
    expect(b.slowFactor).toBeCloseTo(0.75, 9); // the RECORD keeps it; the WIRE does not
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
// STORY 8.17 (Eric rulings 2026-09-29, epic-8 amendments 130–135): the
// STAR SHELL is a tiered DAMAGE weapon, PHOSPHOR SHELLS is its own weapon
// with a BURNING ZONE, and FLASH SHELLS (`dazzleShells`) is a belt consumable
// that sets a one-time dazzle mark. The star-shell PHOSPHOR / DAZZLE verbs
// and the lit zone's verb flags are DELETED — the suites that pinned them
// (INCENDIARY COMPOUND, DAZZLE BURST, "PHOSPHOR + DAZZLE stack") are
// re-cut below onto the three rows that replaced them.
// ---------------------------------------------------------------------------

/** The slot a fitted PHOSPHOR SHELLS row landed in (the Battleship's free
 *  weapon slot after its two class weapons). */
function slotOf(rec: ShipRecord, id: string): number {
  const i = rec.loadout.findIndex((s) => s.equipmentId === id);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

/** Fire `slot` at (aim, aimDist) and step until the shell BURSTS or is
 *  INTERCEPTED; return every event kind seen and the resolution tick's clock. */
function fireUntilStop(w: World, firer: ShipRecord, slot: number, aim: number, aimDist: number, maxTicks = 120): { seen: GameEvent[]; at: number } {
  setInput(firer, { aim, aimDist, slot, fireSeq: 1, seq: 2 });
  const seen: GameEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    w.step();
    seen.push(...w.tickEvents);
    if (seen.some((e) => e.k === 'burst' || e.k === 'boom')) return { seen, at: w.now };
  }
  return { seen, at: w.now };
}

const kinds = (events: readonly GameEvent[]): string[] => events.map((e) => e.k);

describe('STAR SHELLS — a tiered damage weapon: the burst hurts everything inside the WHOLE lit circle (amendment 130)', () => {
  /** A Battleship at the origin firing at (400, 0); hull `inside` is inside the
   *  base 165 u circle, hull `outside` is well clear of it (silhouettes
   *  considered — a TB is 100 u long, so both sit beam-on to the burst). */
  function board(extraCopies = 0): { w: World; a: ShipRecord; inside: ShipRecord; outside: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    fitTier(w, a, 'starShells', extraCopies);
    const inside = place(w, 'inside', 460, 0, Math.PI / 2); // 60 u from the burst point
    const outside = place(w, 'outside', 400, 300, 0); // nearest hull point 295.5 u away — clear even of the tier-V 241.6 u circle
    return { w, a, inside, outside };
  }

  it('tier I: 20 damage to the hull inside, nothing to the hull outside, `hc` to the firer, the zone lit (r165, 10 s)', () => {
    const { w, a, inside, outside } = board();
    expect(a.stats.equipment.starShells.damage).toBe(CONFIG.starShells.damage);
    const { seen, at } = fireUntilStop(w, a, SLOT_SEED_2, 0, 400);
    expect(kinds(seen)).toContain('burst');
    expect(inside.hp).toBe(inside.stats.maxHp - 20);
    expect(outside.hp).toBe(outside.stats.maxHp);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(dmgFor(seen, 'inside').map((e) => (e as { amount: number }).amount)).toEqual([20]);
    expect(dmgFor(seen, 'outside')).toEqual([]);
    // amendment 135(a): a burst that resolved a hull is a Hit Call, not a splash.
    expect(kinds(seen)).toContain('hc');
    expect(kinds(seen)).not.toContain('sp');
    expect(w.litZones.size).toBe(1);
    const zone = [...w.litZones.values()][0];
    expect(zone).toEqual({ id: zone.id, ownerId: 'a', x: 400, y: 0, r: CONFIG.starShells.litRadius, until: at + CONFIG.starShells.litDurationMs });
    expect(w.burnZones.size).toBe(0); // a flare never burns
  });

  it('tier III deals 25 and tier V deals 30 — the ladder’s whole numbers, floored through the gate', () => {
    for (const [copies, dmg] of [[2, 25], [4, 30]] as const) {
      const { w, a, inside } = board(copies);
      expect(a.stats.equipment.starShells.damage).toBe(dmg);
      fireUntilStop(w, a, SLOT_SEED_2, 0, 400);
      expect(inside.hp).toBe(inside.stats.maxHp - dmg);
    }
  });

  it('the OWNER inside its own lit circle is immune (permanent owner immunity)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 300, 0, 0, 'battleship'); // 100 u short of the burst point: inside r165
    const b = place(w, 'b', 460, 0, Math.PI / 2);
    fireUntilStop(w, a, SLOT_SEED_2, 0, 100);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(b.hp).toBe(b.stats.maxHp - 20);
  });

  it('a flare over empty water splashes (`sp`), lights its zone and hurts nobody', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    const { seen } = fireUntilStop(w, a, SLOT_SEED_2, 0, 400);
    expect(kinds(seen)).toContain('sp');
    expect(kinds(seen)).not.toContain('hc');
    expect(kinds(seen)).not.toContain('dmg');
    expect(w.litZones.size).toBe(1);
  });

  it('a SHIELD BLOCK absorbs the flare: shield 100 → 80, hull untouched, `dmg` amount 0, still `hc`', () => {
    const { w, a, inside } = board();
    inside.shield = { hpLeft: 100, until: w.now + 60_000 };
    const { seen } = fireUntilStop(w, a, SLOT_SEED_2, 0, 400);
    expect(inside.hp).toBe(inside.stats.maxHp);
    expect(inside.shield!.hpLeft).toBe(80);
    expect(dmgFor(seen, 'inside').map((e) => (e as { amount: number }).amount)).toEqual([0]);
    expect(kinds(seen)).toContain('hc');
  });

  it('an early interceptor takes the tier damage as CONTACT damage, and the flare STILL lights at the stop point', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    const mid = place(w, 'mid', 300, 0, 0); // bodyblocks a 650 u click
    const { seen } = fireUntilStop(w, a, SLOT_SEED_2, 0, 650);
    expect(kinds(seen)).toContain('boom');
    expect(kinds(seen)).not.toContain('burst');
    expect(mid.hp).toBe(mid.stats.maxHp - 20);
    expect(w.litZones.size).toBe(1);
    expect(Math.hypot([...w.litZones.values()][0].x, [...w.litZones.values()][0].y)).toBeLessThan(400);
  });

  it('a lit zone carries NO verbs and burns/blinds nobody — it only lights (amendment 134)', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 400, y: 0, r: 165, until: 999_999 });
    for (let i = 0; i < 20; i++) w.step();
    expect(b.hp).toBe(b.stats.maxHp);
    expect(b.dazzledUntil).toBe(0);
    expect('phosphor' in w.litZones.get('z1')!).toBe(false);
    expect('dazzle' in w.litZones.get('z1')!).toBe(false);
  });
});

describe('PHOSPHOR SHELLS — its own weapon: burst damage over the zone, then a BURNING ZONE that reveals nothing (amendment 131)', () => {
  /** A Battleship at the origin with PHOSPHOR SHELLS fitted (tier `copies`),
   *  firing at (400, 0): `A` 60 u and `B` 90 u from the burst point (inside
   *  the tier-I r100 zone), `C` clear of it (nearest hull point 165.5 u). */
  function board(copies = 1): { w: World; a: ShipRecord; slot: number; A: ShipRecord; B: ShipRecord; C: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    fitTier(w, a, 'phosphorShells', copies);
    const slot = slotOf(a, 'phosphorShells');
    const A = place(w, 'A', 460, 0, Math.PI / 2);
    const B = place(w, 'B', 400, -90, 0);
    const C = place(w, 'C', 400, 170, 0);
    return { w, a, slot, A, B, C };
  }

  it('tier I: A and B take 10, C nothing, `hc`, and a r100 / 8 s / 5 hp/s zone spawns at the burst point (no lit zone)', () => {
    const { w, a, slot, A, B, C } = board();
    const row = a.stats.equipment.phosphorShells;
    expect([row.damage, row.zoneRadius, row.zoneDurationMs, row.dps, row.rangeU]).toEqual([10, 100, 8000, 5, CONFIG.vision.radar]);
    const hp = { A: A.hp, B: B.hp, C: C.hp };
    const { seen, at } = fireUntilStop(w, a, slot, 0, 400);
    expect(kinds(seen)).toContain('burst');
    expect(kinds(seen)).toContain('hc');
    // The burst's 10 landed on A and B at once (the burn's first bite is a
    // fraction on top; the exact burst amount is the first `dmg` each got).
    expect(dmgFor(seen, 'A')[0]).toMatchObject({ amount: 10 });
    expect(dmgFor(seen, 'B')[0]).toMatchObject({ amount: 10 });
    expect(hp.A - A.hp).toBeGreaterThanOrEqual(10);
    expect(hp.B - B.hp).toBeGreaterThanOrEqual(10);
    expect(C.hp).toBe(hp.C);
    expect(w.litZones.size).toBe(0);
    expect(w.burnZones.size).toBe(1);
    const zone = [...w.burnZones.values()][0];
    expect(zone).toEqual({ id: zone.id, ownerId: 'a', x: 400, y: 0, r: 100, until: at + 8000, dps: 5 });
  });

  it('the burst NEVER touches a mine — not inside the zone, not dead under the burst point (amendment 200, superseding 135(c)) — and a flare never does either', () => {
    const { w, a, slot } = board();
    lay(w, 'm1', 'a', 340, 40, 'naval'); // 72 u from the burst point, clear of every hull's blast reach
    lay(w, 'm0', 'a', 400, 0, 'naval'); // exactly where the phosphor shell lands
    fireUntilStop(w, a, slot, 0, 400);
    expect(w.mines.has('m1')).toBe(true);
    expect(w.mines.has('m0')).toBe(true); // only a DECK GUN damages a mine
    expect(w.mines.get('m0')!.hp).toBe(CONFIG.mine.hp);
    // THE CONTROL: the same mine under a STAR SHELL burst stands (HITS_HULL_DECOY).
    const w2 = bareWorld();
    const a2 = place(w2, 'a', 0, 0, 0, 'battleship');
    lay(w2, 'm1', 'a', 340, 40, 'naval');
    fireUntilStop(w2, a2, SLOT_SEED_2, 0, 400);
    expect(w2.mines.has('m1')).toBe(true);
  });

  it('tier V: burst 20, zone r146.41 / 10 s / 10 hp/s — stamped on the zone from the row at launch (amendment 135(e))', () => {
    const { w, a, slot, A } = board(5);
    const row = a.stats.equipment.phosphorShells;
    expect(row.damage).toBe(20);
    expect(row.zoneRadius).toBeCloseTo(146.41, 6);
    expect(row.zoneDurationMs).toBe(10_000);
    expect(row.dps).toBe(10);
    const hp0 = A.hp;
    const { seen, at } = fireUntilStop(w, a, slot, 0, 400);
    expect(dmgFor(seen, 'A')[0]).toMatchObject({ amount: 20 });
    expect(hp0 - A.hp).toBeGreaterThanOrEqual(20);
    const zone = [...w.burnZones.values()][0];
    expect(zone.r).toBeCloseTo(146.41, 6);
    expect(zone.until).toBe(at + 10_000);
    expect(zone.dps).toBe(10);
  });

  it('a live zone keeps the numbers it was stamped with — a tier card fitted later never changes it', () => {
    const { w, a, slot } = board();
    fireUntilStop(w, a, slot, 0, 400);
    const zone = [...w.burnZones.values()][0];
    fitTier(w, a, 'phosphorShells', 4); // to tier V, after the zone lit
    w.step();
    expect(w.burnZones.get(zone.id)).toEqual(zone); // r100 / 5 hp/s, untouched
  });

  it('non-owner hulls inside burn at the zone’s dps through the `burn` seat (victim-private dmg, kill credit); the owner never burns', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0, 0, 'battleship'); // owner INSIDE its own zone
    const b = place(w, 'b', 420, 30); // enemy inside
    const c = place(w, 'c', 900, 900); // far outside
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 400, y: 0, r: 100, until: 999_999, dps: CONFIG.phosphorShells.dps });
    for (let i = 0; i < 20; i++) w.step(); // one second
    expect(b.hp).toBeCloseTo(b.stats.maxHp - CONFIG.phosphorShells.dps, 4); // 1 s of DoT, un-floored (the burn seat)
    expect(a.hp).toBe(a.stats.maxHp); // owner immune
    expect(c.hp).toBe(c.stats.maxHp);
    const toB: number[] = [];
    const toA: number[] = [];
    for (let i = 0; i < 12; i++) {
      w.step();
      toB.push(...dmgFor(buildFrame(w, 'b').events, 'b').map(() => 1));
      toA.push(...dmgFor(buildFrame(w, 'a').events, 'b').map(() => 1));
    }
    expect(toB.length).toBeGreaterThan(0);
    expect(toA).toEqual([]);
    b.hp = 0.01;
    for (let i = 0; i < 3 && isAfloat(b.lifecycle); i++) w.step();
    expect(isAfloat(b.lifecycle)).toBe(false);
    expect(a.kills).toBe(1);
  });

  it('the dmg EVENT is AGGREGATED into 500 ms windows while hp bleeds every tick; a leaving/expiring pair flushes at once', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 400, y: 0, r: 100, until: 999_999, dps: CONFIG.phosphorShells.dps });
    const hp0 = b.hp;
    const seen: { amount: number }[] = [];
    for (let i = 0; i < 40; i++) {
      w.step(); // 2 seconds
      seen.push(...(dmgFor(w.tickEvents, 'b') as { amount: number }[]));
    }
    expect(hp0 - b.hp).toBeCloseTo(CONFIG.phosphorShells.dps * 2, 6);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThanOrEqual(4);
    w.burnZones.clear();
    w.step();
    seen.push(...(dmgFor(w.tickEvents, 'b') as { amount: number }[]));
    expect(seen.length).toBeLessThanOrEqual(5);
    expect(seen.reduce((s, e) => s + e.amount, 0)).toBeCloseTo(hp0 - b.hp, 6);
  });

  it('resetForMatchStart drops open burn buckets — no phantom dmg against a redeployed hull (Story 8.17 review)', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 400, y: 0, r: 100, until: 999_999, dps: CONFIG.phosphorShells.dps });
    w.step();
    w.step(); // a bucket is open (window not yet run)
    expect(hpLost(b)).toBeGreaterThan(0);
    w.resetForMatchStart();
    const seen: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      w.step();
      seen.push(...dmgFor(w.tickEvents, 'b'));
    }
    expect(seen).toEqual([]);
  });

  it('a lethal bite flushes the bucket BEFORE the sink — a killing burn is never unreported', () => {
    const w = bareWorld();
    const a = place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 400, y: 0, r: 100, until: 999_999, dps: CONFIG.phosphorShells.dps });
    b.hp = 0.2;
    const seen: { amount: number }[] = [];
    for (let i = 0; i < 5 && isAfloat(b.lifecycle); i++) {
      w.step();
      seen.push(...(dmgFor(w.tickEvents, 'b') as { amount: number }[]));
    }
    expect(isAfloat(b.lifecycle)).toBe(false);
    expect(a.kills).toBe(1);
    const bite = CONFIG.phosphorShells.dps * (DT / 1000);
    const reported = seen.reduce((s, e) => s + e.amount, 0);
    expect(seen.length).toBeGreaterThan(0);
    expect(reported).toBeGreaterThanOrEqual(0.2);
    expect(reported).toBeLessThanOrEqual(0.2 + bite);
  });

  it('two overlapping zones of ONE owner bite once per tick (the stronger); zones of two owners each bite', () => {
    const w = bareWorld();
    place(w, 'a', 900, 900, 0, 'battleship');
    place(w, 'o', -900, -900, 0, 'battleship');
    const b = place(w, 'b', 0, 0);
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 0, y: 0, r: 100, until: 999_999, dps: 5 });
    w.burnZones.set('bz2', { id: 'bz2', ownerId: 'a', x: 10, y: 0, r: 100, until: 999_999, dps: 8 });
    w.burnZones.set('bz3', { id: 'bz3', ownerId: 'o', x: 0, y: 10, r: 100, until: 999_999, dps: 6 });
    const hp0 = b.hp;
    for (let i = 0; i < 20; i++) w.step(); // one second
    expect(hp0 - b.hp).toBeCloseTo(8 + 6, 4);
  });

  it('the zone expires naturally, the burn stops, and the frame channel goes byte-free', () => {
    const { w, a, slot, A } = board();
    const { at } = fireUntilStop(w, a, slot, 0, 400);
    expect(buildFrame(w, 'a').burnZones?.length).toBe(1);
    const steps = Math.ceil(8000 / DT) + 1;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.now).toBeGreaterThanOrEqual(at + 8000);
    expect(w.burnZones.size).toBe(0);
    expect('burnZones' in buildFrame(w, 'a')).toBe(false);
    const hp = A.hp;
    for (let i = 0; i < 10; i++) w.step();
    expect(A.hp).toBe(hp); // no further burn
  });

  it('an early interceptor takes the tier damage as CONTACT damage and the zone BURNS where the shell stopped', () => {
    const { w, a, slot } = board();
    const mid = place(w, 'mid', 250, 0, 0); // bodyblocks a 650 u click
    const { seen } = fireUntilStop(w, a, slot, 0, 650);
    expect(kinds(seen)).toContain('boom');
    expect(kinds(seen)).not.toContain('burst');
    expect(mid.hp).toBeLessThanOrEqual(mid.stats.maxHp - 10);
    expect(w.burnZones.size).toBe(1);
    const zone = [...w.burnZones.values()][0];
    expect(Math.hypot(zone.x, zone.y)).toBeLessThan(400); // short of the click
    expect(zone.dps).toBe(5);
  });

  it('the zone REVEALS NOTHING: a hull inside the firer’s burn zone but outside its sight is not a contact (amendment 135(e))', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    a.prevSweepAngle = Math.PI; // park the firer's own radar beam away from the target bearing
    a.sweepAngle = Math.PI + 0.0001;
    fitTier(w, a, 'phosphorShells', 1);
    const hidden = place(w, 'hidden', 520, 40, Math.PI / 2); // inside the zone, 520 u from the firer (sight 330)
    fireUntilStop(w, a, slotOf(a, 'phosphorShells'), 0, 500);
    expect(w.burnZones.size).toBe(1);
    expect(hidden.hp).toBeLessThan(hidden.stats.maxHp); // it WAS hit — the zone covers it
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id)).not.toContain('hidden');
    expect(f.burnZones?.map((z) => z.by)).toEqual(['a']); // ...but the firer sees only the circle
  });

  it('the ready room never burns: a zone on the water with damage suppressed bites nobody', () => {
    const w = bareWorld();
    place(w, 'a', 400, 0, 0, 'battleship');
    const b = place(w, 'b', 420, 30);
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 400, y: 0, r: 100, until: 999_999, dps: 5 });
    w.damageEnabled = false;
    for (let i = 0; i < 20; i++) w.step();
    expect(b.hp).toBe(b.stats.maxHp);
  });

  it('resetForMatchStart clears practice-field burn zones (the lit-zone / mines precedent)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'battleship');
    w.burnZones.set('bz1', { id: 'bz1', ownerId: 'a', x: 400, y: 0, r: 100, until: 999_999, dps: 5 });
    w.resetForMatchStart();
    expect(w.burnZones.size).toBe(0);
  });
});

describe('FLASH SHELLS (`dazzleShells`) — a belt consumable whose one-time burst dazzles every hull inside r150 for 10 s (amendment 132)', () => {
  const BELT = CONSUMABLE_SLOTS[0];

  /** A Battleship at the origin holding ONE FLASH SHELLS copy, clicking
   *  (400, 0): `A` 100 u from the burst point (inside r150), `B` 160 u from
   *  it (outside — beam-on, so its silhouette is irrelevant: the flash tests
   *  CENTRES), a `watcher` who sees A as a contact. */
  function board(): { w: World; a: ShipRecord; A: ShipRecord; B: ShipRecord; watcher: ShipRecord } {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyCard(a, 'dazzleShells');
    expect(a.loadout[BELT]).toEqual({ equipmentId: 'dazzleShells', state: { n: 1, reloadMsLeft: 0 } });
    const A = place(w, 'A', 500, 0, Math.PI / 2);
    const B = place(w, 'B', 400, 160, 0);
    const watcher = place(w, 'watcher', 560, 60);
    return { w, a, A, B, watcher };
  }

  it('the burst marks A (inside r150) with dazzledUntil = now + 10 s, leaves B and the owner alone, spends the copy, emits `sp`, no damage, no zone', () => {
    const { w, a, A, B } = board();
    const { seen, at } = fireUntilStop(w, a, BELT, 0, 400);
    expect(kinds(seen)).toContain('burst');
    expect(kinds(seen)).toContain('sp'); // damage 0 resolves no victim (135(d))
    expect(kinds(seen)).not.toContain('hc');
    expect(kinds(seen)).not.toContain('dmg');
    expect(A.dazzledUntil).toBe(at + CONFIG.flashShells.durationMs);
    expect(B.dazzledUntil).toBe(0);
    expect(a.dazzledUntil).toBe(0);
    expect(A.hp).toBe(A.stats.maxHp);
    expect(w.litZones.size).toBe(0);
    expect(w.burnZones.size).toBe(0);
    // ONE SPEND: the copy left the belt and the card left the build.
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null });
    expect(a.cards).not.toContain('dazzleShells');
  });

  it('a click is clamped at the star shell’s reach (radarRange) — never an arc denial', () => {
    const { w, a } = board();
    setInput(a, { aim: Math.PI, aimDist: 5000, slot: BELT, fireSeq: 1, seq: 2 });
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    const shell = [...w.shells.values()][0];
    expect(shell.targetX).toBeCloseTo(-a.stats.radarRange, 6);
    expect(shell.flash).toEqual({ radius: 150, durationMs: 10_000 });
    expect(shell.damage).toBe(0);
    expect(shell.contactDamage).toBe(0);
    expect(shell.burstRadius).toBe(150);
    expect(shell.hits).toEqual(CONFIG.flashShells.hits);
    expect(shell.family).toBe('cannon');
  });

  it('an empty belt slot refuses the click and spends nothing', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    setInput(a, { aim: 0, aimDist: 400, slot: BELT, fireSeq: 1, seq: 2 });
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'empty-slot' });
    expect(w.shells.size).toBe(0);
  });

  it('a second flash on an already-dazzled hull sets the LATER expiry — never stacks, never shortens', () => {
    const { w, a, A } = board();
    A.dazzledUntil = w.now + 4000; // 4 s left
    const { at } = fireUntilStop(w, a, BELT, 0, 400);
    expect(A.dazzledUntil).toBe(at + 10_000); // extended to the flash's 10 s
    // ...and a mark already LONGER than a fresh flash is left alone.
    const { w: w2, a: a2, A: A2 } = board();
    const longer = w2.now + 60_000;
    A2.dazzledUntil = longer;
    fireUntilStop(w2, a2, BELT, 0, 400);
    expect(A2.dazzledUntil).toBe(longer); // unchanged — never shortened
  });

  it('with damage suppressed (the ready room) the shell still flies and bursts but blinds NOBODY — one flag, one policy', () => {
    const { w, a, A } = board();
    w.damageEnabled = false;
    const { seen } = fireUntilStop(w, a, BELT, 0, 400);
    expect(kinds(seen)).toContain('burst');
    expect(A.dazzledUntil).toBe(0);
  });

  it('an interception en route flashes at the STOP POINT, exactly as a flare lights there; the interceptor takes 0', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 0, 'battleship');
    w.applyCard(a, 'dazzleShells');
    const mid = place(w, 'mid', 300, 0, 0); // bodyblocks; its centre is within 150 u of the stop point
    const far = place(w, 'far', 650, 0, Math.PI / 2); // the clicked point — never reached
    const { seen, at } = fireUntilStop(w, a, BELT, 0, 650);
    expect(kinds(seen)).toContain('boom');
    expect(mid.hp).toBe(mid.stats.maxHp);
    expect(mid.dazzledUntil).toBe(at + 10_000);
    expect(far.dazzledUntil).toBe(0);
  });

  it('the dazzled hull’s OWN sight collapses to radarRange / 8 = 82.5 u (sightOf → the shared effectiveSight); radar range is untouched', () => {
    const { w, a, A } = board();
    place(w, 't', 500, 200, 0); // 200 u from A: inside base sight (330), outside dazzled sight (82.5)
    expect(buildFrame(w, 'A').contacts.map((c) => c.id)).toContain('t');
    fireUntilStop(w, a, BELT, 0, 400);
    expect(sightOf(A, w.now)).toBeCloseTo(A.stats.radarRange * CONFIG.flashShells.sightFraction, 9);
    expect(sightOf(A, w.now)).toBeCloseTo(82.5, 9);
    expect(A.stats.radarRange).toBe(CONFIG.vision.radar);
    expect(buildFrame(w, 'A').contacts.map((c) => c.id)).not.toContain('t');
    // Expiry: the mark lapses and full sight returns.
    for (let i = 0; i < Math.ceil(10_000 / DT) + 2; i++) w.step();
    expect(w.now).toBeGreaterThan(A.dazzledUntil);
    expect(sightOf(A, w.now)).toBe(A.stats.sightRange);
    expect(buildFrame(w, 'A').contacts.map((c) => c.id)).toContain('t');
  });

  it('dazzledUntil rides ONLY the victim’s own frame (`you`) — a watcher’s contact for the victim never carries it', () => {
    const { w, a, A, watcher } = board();
    fireUntilStop(w, a, BELT, 0, 400);
    w.step();
    expect(buildFrame(w, 'A').you!.dazzledUntil).toBe(A.dazzledUntil);
    const contact = buildFrame(w, 'watcher').contacts.find((c) => c.id === 'A')!;
    expect(contact).toBeDefined();
    expect('dazzledUntil' in contact).toBe(false);
    expect('dazzledUntil' in buildFrame(w, 'watcher').you!).toBe(false); // the watcher itself (160+ u away) is not dazzled
    void watcher;
  });
});

// RETIRED (Story 7-5 wave 2): "PROP-FOULING + SELF-PROPELLED stack on one
// mine". Both cases assert about the deleted `mineSelfPropelled` verb. The
// PROPERTY they were written for — independent verb flags STACK on one
// weapon, and pick ORDER cannot erase either — is re-established by R2.14
// (CAPTIVE stacks with PROP FOULING, and the captive torpedo's hit carries
// the foul), which the agent building captive mines pins here in their place.
