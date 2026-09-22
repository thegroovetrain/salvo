// COMBAT-BOT TACTICS — wave-3 coverage (Story 6.4): what a bot DOES.
//
// Two harnesses, deliberately:
//
//   * THE FAKE PORT. Most of these are single-decision assertions, and a bot's
//     decision is a pure function of (its own ShipRecord, its mind, the port).
//     A hand-built `BotWorldPort` lets a test put the storm ring where it
//     wants it, freeze the clock, and hand the brain a contact plot with
//     exactly the grammar under test — none of which is reachable by stepping
//     a real World. The ShipRecord itself is REAL (built through World.addShip)
//     so hull envelopes, effective stats and loadout pools are the shipped
//     ones, never a stub that could drift.
//
//   * A REAL WORLD, END TO END. The last block steps a genuine World full of
//     bots for half a match-minute and measures what happened on the water.
//     It is the first proof the whole stack works together — wave 1's cadence,
//     wave 2's scoring and wave 3's hands — and it is the test that would
//     catch a bot that decides beautifully and sails into a rock.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  angleDiff,
  inArc,
  isAfloat,
  islandDistance,
  mulberry32,
  nearestCoastPoint,
  sectorArcFor,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  stepShip,
  transitionLifecycle,
  wrapAngle,
  type HullId,
  type Island,
  type ShipClassId,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { COMBAT_BRAIN, approachPoint, readyShotReaches } from '../game/ai/tactics.js';
import { engagementBand, profileOf } from '../game/ai/profiles.js';
import { pullBand } from '../game/ai/utility.js';
import type {
  BotDecision,
  BotMind,
  BotProfileId,
  BotWorldPort,
  RememberedContact,
} from '../game/ai/types.js';

const BOW_SECTOR = sectorArcFor('heavyTorpedo');
const REAR_SECTOR = sectorArcFor('navalMines');

/** A mutable stand-in for the narrow world port: the clock and the live ring
 *  are what a steering test needs to control, and neither is settable on a
 *  real World. Everything spatial still comes from a REAL generated map. */
interface FakePort extends BotWorldPort {
  now: number;
  zoneLiveRing: { cx: number; cy: number; r: number };
}

function fakePort(w: World, ring?: { cx: number; cy: number; r: number }): FakePort {
  return {
    now: 100000,
    map: w.map,
    // Default: a ring so large nothing is ever outside it, so a test that is
    // not about the storm never accidentally gets ring-escape steering.
    zoneLiveRing: ring ?? { cx: 0, cy: 0, r: w.map.radius * 4 },
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
  };
}

function mkMind(profile: BotProfileId, seed = 7): BotMind {
  return {
    rng: mulberry32(seed),
    spendRng: mulberry32(seed + 1),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile,
    phase: 0,
    view: null,
    viewAt: -1,
    contacts: new Map(),
    targetKey: null,
    posture: 'reposition',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

/** A bot hull placed exactly where the test wants it, pointed where it wants.
 *  Islands are cleared so placement is never fought by the spawn lattice or
 *  the collision push-out (the island-specific tests clear nothing). */
function mkBot(w: World, hullId: ShipClassId, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', hullId, undefined, { x, y });
  // THE CLASS WEAPON IS A CARD (Story 8.10, amendment 62): a hull spawns with
  // gun + Shift and an EMPTY weapon row, so this fixture fits the tube / the
  // barrage / the rack explicitly — every weapon-policy case below is about
  // what the brain DOES with the weapon, not about how it arrived.
  fitClassWeapons(w, rec);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = rec.stats.kinematics.maxSpeed * 0.5;
  // THE RADAR BUOY, HAND-FITTED ON THE MINE LAYER (Story 8.5, epic-8
  // amendment 22). It used to arrive with the Mine Layer's per-hull fit;
  // NOTHING fits the buoy any more — no card names it. The MODULE and the brain's buoy policy are untouched, and the
  // policy is what this suite pins — so the fixture writes the slot directly,
  // exactly as `applySlotEffect` would have, and every buoy case below keeps
  // its subject. When Story 8.15 deletes the buoy, these cases go with it.
  if (hullId === 'mineLayer') {
    rec.loadout[3] = {
      equipmentId: 'radarBuoy',
      state: { n: rec.stats.equipment.radarBuoy.maxAmmo, reloadMsLeft: 0 },
    };
  }
  return rec;
}

/** A plotted track, defaulted to something the reaction gate will pass. */
function track(now: number, over: Partial<RememberedContact> = {}): RememberedContact {
  return {
    id: 'tgt',
    x: 0,
    y: 0,
    heading: 0,
    speed: 0,
    seenAt: now,
    live: true,
    cls: 'torpedoBoat' as HullId,
    fleet: false,
    firstSeenAt: now - CONFIG.bots.reactionMs * 4,
    hits: 0,
    ...over,
  };
}

function plot(mind: BotMind, t: RememberedContact): void {
  mind.contacts.set(t.id ?? `a:${t.x}:${t.y}`, t);
}

/**
 * Hand the mind a perception view whose only content is `n` of the bot's OWN
 * live mines — the board count the cycle-111 lay bounds read (ownLiveMines).
 * `viewAt` stays -1 on purpose: ingest() must NOT fold this view (folding
 * would drop `live` on planted tracks), and ownLiveMines reads `mind.view`
 * directly exactly as avoidMines does. The mines sit far from every fixture
 * so no steering term ever sees them (own mines are skipped there anyway).
 */
function viewWithOwnMines(mind: BotMind, n: number): void {
  mind.view = {
    contacts: [],
    events: [],
    mines: Array.from({ length: n }, (_, i) => ({
      id: `own-${i}`, x: -2000 - i * 30, y: 2000, own: true, by: 'self',
    })),
    litZones: [],
    buoys: [],
  };
}

/** The loadout slot fitting an equipment id (the tests name weapons, not
 *  indices — a refit that moved a slot must not silently pass). */
function slotOf(rec: ShipRecord, id: string): number {
  return rec.loadout.findIndex((s) => s.equipmentId === id);
}

/** The first point on a coarse polar lattice with `clearance` of open water
 *  around it — the end-to-end test's staging area, found rather than assumed
 *  so a mapgen retune cannot quietly move land into the arena. */
function stagingPoint(w: World, clearance: number): { x: number; y: number } {
  for (let r = 0; r < w.map.radius * 0.6; r += 150) {
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      if (w.map.islands.every((isle) => islandDistance(p, isle) > clearance)) return p;
    }
  }
  throw new Error('no open staging area on this map — the test cannot run honestly');
}

/**
 * A berth just seaward of the OUTWARD face of the map's biggest island, with a
 * heading pointing straight into it (which is also straight back toward the
 * map centre — see the un-beach regression test for why that matters). Found
 * by walking the outward ray for the coastline rather than assumed, so a
 * mapgen retune moves the berth instead of quietly ungrounding the test.
 */
function seawardBerth(w: World): { x: number; y: number; heading: number } {
  const isle = [...w.map.islands].sort((a, b) => b.r - a.r)[0];
  const out = Math.atan2(isle.y, isle.x); // away from the map centre
  const dx = Math.cos(out);
  const dy = Math.sin(out);
  for (let t = 0; t <= isle.r * 1.5; t += 2) {
    const p = { x: isle.x + dx * t, y: isle.y + dy * t };
    if (islandDistance(p, isle) > 0) {
      // 40u clear of the coast, bow pointed at it.
      return { x: p.x + dx * 40, y: p.y + dy * 40, heading: wrapAngle(out + Math.PI) };
    }
  }
  throw new Error('no seaward coast found — the test cannot ground anything honestly');
}

/**
 * A live bot OF A NAMED CLASS. `World.addBot()` rolls its hull off the
 * controller's own stream and there is no seam to force one (deliberately —
 * enrollment is the controller's business), so the drill enrolls until the
 * roll lands and then discharges the rejects through the real removeShip path.
 * A class-blind drill cannot test the hull the defect actually lived on.
 */
function botOfClass(w: World, cls: ShipClassId): ShipRecord {
  const rejects: string[] = [];
  for (let i = 0; i < 200; i += 1) {
    const rec = w.addBot(undefined, undefined);
    if (rec.hullId === cls) {
      for (const id of rejects) w.removeShip(id);
      return rec;
    }
    rejects.push(rec.id);
  }
  throw new Error(`no ${cls} enrolled in 200 rolls — the test cannot run honestly`);
}

/** A world whose ocean is empty water — placement, steering and firing tests
 *  are about the bot, not about mapgen. */
function openWorld(seed: number, cap = 8): World {
  const w = new World(seed, cap);
  w.map.islands.length = 0;
  return w;
}

/**
 * An otherwise-empty ocean with ONE coastline exactly where the test wants it.
 *
 * THE FIRE TESTS ABOVE ALL RUN ON `openWorld`, and that is why the terrain
 * defect could ship: every one of them deleted the islands before asking what
 * the bot shoots at, so "does a coastline deny this shot" was a question the
 * suite structurally could not ask. The island-free harnesses are KEPT — they
 * are the right tool for arcs, pools, ranges and abilities — and these run
 * alongside them.
 */
function islandWorld(seed: number, isle: Island): World {
  const w = openWorld(seed);
  w.map.islands.push(isle);
  return w;
}

describe('steering — the priority order is the policy', () => {
  it('RING ESCAPE outranks target pursuit: outside the ring, the helm turns for its centre', () => {
    const w = openWorld(101);
    // The ring sits to the WEST; the target sits to the EAST. A bot pointed
    // north must choose one of two opposite rudders, so the assertion cannot
    // be satisfied by accident.
    const port = fakePort(w, { cx: -600, cy: 0, r: 200 });
    const rec = mkBot(w, 'battleship', 0, 0, Math.PI / 2); // bow due north
    const mind = mkMind('bulwark');
    plot(mind, track(port.now, { x: 400, y: 0 }));
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.throttle).toBe(1); // full ahead: the storm does not miss
    // Port rudder (positive = counter-clockwise) swings a north-facing bow to
    // the west; the target would have demanded the opposite.
    expect(d.rudder).toBeGreaterThan(0);
    // And the same bot INSIDE a ring that contains it turns the other way.
    const inside = fakePort(w);
    const d2 = COMBAT_BRAIN.decide(rec, mind, inside);
    expect(d2.rudder).toBeLessThan(0);
  });

  it('with nothing in sight a bot patrols toward the live ring centre', () => {
    const w = openWorld(102);
    const port = fakePort(w, { cx: 0, cy: -500, r: 4000 }); // centre due south
    const rec = mkBot(w, 'mineLayer', 0, 0, Math.PI / 2); // bow due north
    const d = COMBAT_BRAIN.decide(rec, mkMind('forager'), port);
    expect(d.throttle).toBeGreaterThan(0);
    expect(Math.abs(d.rudder)).toBe(1); // hard over: 180 degrees to turn
    // DELIBERATE PIN UPDATE (doctrine pass): an empty scope is exactly when a
    // Mine Layer sites its recon buoy, so the placement rides this tick; no
    // TRACK-targeted shot exists (the target guard still holds).
    expect(d.fireSlot).toBe(slotOf(rec, 'radarBuoy'));
  });

  // THE TRIP IS THE SIMULATION'S CONTACT BIT, NOT A SPEED GUESS. The shipped
  // form of this test hand-set `rec.state.speed = 0` under the comment "the
  // grounding damp caps a beached hull low". It caps it HIGH: grounding is a
  // directional speed CAP (cycle 59), so a dead-on grounded hull still holds
  // islandSpeedMult x maxSpeed — 8.75 u/s for a battleship — against a 3 u/s
  // trip. The test proved the manoeuvre WORKS when armed; it could never prove
  // the manoeuvre can ARM, and it did not: the whole un-beach path was
  // unreachable. The setup below therefore drives the record's real
  // `landContact` flag, and the end-to-end block grounds a hull FOR REAL.
  it('UN-BEACHING: sustained LAND CONTACT arms astern within stuckMs, and lets go once clear', () => {
    const w = openWorld(103);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    // Aground and pressing — and STILL MAKING WAY at the grounding cap, which
    // is exactly the state the old speed trip could not see.
    rec.landContact = true;
    rec.state.speed = rec.stats.kinematics.maxSpeed * CONFIG.ship.islandSpeedMult;
    expect(rec.state.speed).toBeGreaterThan(3); // the retired STUCK_SPEED trip
    let armedAtMs: number | null = null;
    for (let i = 0; i < 200 && armedAtMs === null; i += 1) {
      const d = COMBAT_BRAIN.decide(rec, mind, port);
      if (d.throttle < 0) armedAtMs = i * CONFIG.tick.simDtMs;
      port.now += CONFIG.tick.simDtMs;
    }
    expect(armedAtMs).not.toBeNull();
    expect(armedAtMs!).toBeLessThanOrEqual(CONFIG.bots.stuckMs);
    // It holds astern for the manoeuvre rather than chattering tick to tick.
    expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeLessThan(0);
    // Clear of the rock -> the trip resets and the helm goes ahead again.
    rec.landContact = false;
    rec.state.x = CONFIG.bots.unbeachClearU * 2; // and it made real sternway
    port.now = mind.unbeachUntil + 1;
    expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeGreaterThan(0);
    expect(mind.stuckMs).toBe(0);
  });

  // STAGE 2 IS A CONDITION, NOT A TIMER — and the condition is why the first
  // grounding fix left the Battleship where it found it. `stuckMs` used to be
  // both the arming dwell AND the burst length: 1500ms of full astern from the
  // grounding cap is 0.97s of a heavy hull still travelling FORWARD (kill the
  // way at `decel`) plus 0.53s of building sternway at `accel`, i.e. +3.21u of
  // measured NET DISPLACEMENT — deeper into the rock than it started. The
  // burst now ends on "clear of land AND unbeachClearU of ground made", with
  // the duration as a ceiling, so the hull that needs longer gets longer.
  it('THE BURST ENDS ON ITS CONDITION: clear water alone does not end it, sternway does', () => {
    const w = openWorld(106);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    rec.landContact = true;
    for (let i = 0; i <= CONFIG.bots.stuckMs / CONFIG.tick.simDtMs; i += 1) {
      COMBAT_BRAIN.decide(rec, mind, port);
      port.now += CONFIG.tick.simDtMs;
    }
    expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeLessThan(0);

    // The resolver lets go, but the hull has barely moved: STILL BACKING. This
    // is the exact tick the old fixed-timer form would have handed back to the
    // helm with the bow still against the coast.
    rec.landContact = false;
    rec.state.x = CONFIG.bots.unbeachClearU - 1;
    port.now += CONFIG.tick.simDtMs;
    expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeLessThan(0);

    // One more unit of sternway clears the condition and the burst releases.
    rec.state.x = CONFIG.bots.unbeachClearU + 1;
    port.now += CONFIG.tick.simDtMs;
    expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeGreaterThan(0);

    // ...and the CEILING is the backstop: a hull the water will not release
    // stops backing when unbeachAsternMaxMs is up, whatever the condition says.
    const stuck = mkMind('bulwark');
    rec.landContact = true;
    rec.state.x = 0;
    let asternMs = 0; // the FIRST unbroken burst: a hull this pinned re-arms
    for (let i = 0; i < 400; i += 1) {
      const backing = COMBAT_BRAIN.decide(rec, stuck, port).throttle < 0;
      port.now += CONFIG.tick.simDtMs;
      if (backing) asternMs += CONFIG.tick.simDtMs;
      else if (asternMs > 0) break;
    }
    expect(asternMs).toBeGreaterThan(CONFIG.bots.stuckMs); // longer than the old burst
    expect(asternMs).toBeLessThanOrEqual(CONFIG.bots.unbeachAsternMaxMs);
  });

  // STAGE 3 — THE METRONOME CURE. Without it a bot backs off cleanly, re-seeks
  // a bearing that still runs through the same island and drives straight back
  // in; land-contact EPISODES per bot-match roughly DOUBLED (~2 -> ~5) when the
  // arming half was fixed on its own. The hold is the fleet pilot's third
  // stage, ported: commit to the heading the burst left on, target-seek
  // suppressed, for CONFIG.bots.unbeachHoldMs.
  it('THE EXIT-HEADING GRACE HOLD suppresses target-seek, then hands the helm back', () => {
    const w = openWorld(107);
    // Ring centre due WEST, so patrol-seek would demand a hard turn the moment
    // the hold lets go — the assertion cannot pass by the bot simply idling.
    const port = fakePort(w, { cx: -4000, cy: 0, r: 9000 });
    const rec = mkBot(w, 'mineLayer', 0, 0, 0); // bow due east
    const mind = mkMind('forager');
    rec.landContact = true;
    for (let i = 0; i <= CONFIG.bots.stuckMs / CONFIG.tick.simDtMs; i += 1) {
      COMBAT_BRAIN.decide(rec, mind, port);
      port.now += CONFIG.tick.simDtMs;
    }
    expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeLessThan(0); // backing

    // Off the rock with real sternway: the burst releases into the hold, and
    // the exit heading is whatever the hull is pointing at right now.
    rec.landContact = false;
    rec.state.x = CONFIG.bots.unbeachClearU * 2;
    rec.state.heading = Math.PI / 2; // bow due north
    port.now += CONFIG.tick.simDtMs;
    const held = COMBAT_BRAIN.decide(rec, mind, port);
    expect(held.throttle).toBeGreaterThan(0);
    // Dead on the committed heading -> no rudder. Patrol-seek would have
    // demanded hard over for the ring centre astern-to-port.
    expect(Math.abs(held.rudder)).toBeLessThan(0.01);
    const holdUntil = mind.unbeach!.holdUntil;
    expect(holdUntil - port.now).toBeCloseTo(CONFIG.bots.unbeachHoldMs, 0);

    // Still committed one tick before the hold expires...
    port.now = holdUntil - CONFIG.tick.simDtMs;
    expect(Math.abs(COMBAT_BRAIN.decide(rec, mind, port).rudder)).toBeLessThan(0.01);
    // ...and seeking again the moment it does.
    port.now = holdUntil;
    expect(Math.abs(COMBAT_BRAIN.decide(rec, mind, port).rudder)).toBe(1);
    expect(mind.unbeach).toBeNull();
  });

  // THE POCKET. A hull still touching land when its burst ceilings has no exit
  // heading worth committing to — holding one spends unbeachHoldMs driving
  // AHEAD into the rock it just failed to leave — and repeating the same exit
  // direction repeats the same failure. This is the case that survived the
  // first campaign of this cycle: ONE battleship pinned for 218s, which was
  // 12% of all land contact measured across 1000 bot-matches. It is also the
  // fleet pilot's own disclosed KNOWN RESIDUAL ("a second blocker astern can
  // zero the burst's progress and re-arm with the SAME geometry"), answered
  // here rather than inherited.
  it('A BURST THAT ENDS STILL AGROUND skips the hold and swings the other way', () => {
    const w = openWorld(110);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    rec.landContact = true; // wedged: nothing the manoeuvre does will clear it

    const rudders: number[] = [];
    const gaps: number[] = [];
    let lastAsternAt = 0;
    let wasAstern = false;
    for (let i = 0; i < 400; i += 1) {
      const astern = COMBAT_BRAIN.decide(rec, mind, port).throttle < 0;
      if (astern && !wasAstern) {
        rudders.push(mind.unbeach!.rudder);
        if (lastAsternAt > 0) gaps.push(port.now - lastAsternAt);
      }
      if (astern) lastAsternAt = port.now;
      // NEVER a hold while aground — the hold exists to commit an exit line in
      // clear water, and there is no clear water here.
      expect(mind.unbeach?.holdUntil ?? 0).toBe(0);
      wasAstern = astern;
      port.now += CONFIG.tick.simDtMs;
    }

    expect(rudders.length).toBeGreaterThanOrEqual(3); // it keeps trying
    for (let i = 1; i < rudders.length; i += 1) expect(rudders[i]).toBe(-rudders[i - 1]);
    // ...and the gap between attempts is ONE arming dwell, not a dwell plus a
    // pointless hold: the wedge costs 1.5s of ahead per try, never 4.5s.
    for (const gap of gaps) expect(gap).toBeLessThanOrEqual(CONFIG.bots.stuckMs + CONFIG.tick.simDtMs);
  });

  // ...but ONLY a failed exit alternates. A hull that got clear and grounded
  // again somewhere else deserves a freshly probed coast, not the inverse of a
  // rudder that WORKED. (Written because the first draft keyed the retry on
  // "there is previous state" rather than on "the previous burst failed", and
  // therefore flipped after every success too.)
  it('a SUCCESSFUL exit does not flip the next attempt', () => {
    const w = openWorld(111); // no islands: the astern rudder is the fallback
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    const arm = (): number => {
      rec.landContact = true;
      for (let i = 0; i < 200; i += 1) {
        const d = COMBAT_BRAIN.decide(rec, mind, port);
        port.now += CONFIG.tick.simDtMs;
        if (d.throttle < 0) return mind.unbeach!.rudder;
      }
      throw new Error('never armed');
    };
    const first = arm();
    // Clear it properly: off the rock, real sternway -> the burst releases
    // into a hold, which is what marks the attempt as having WORKED.
    rec.landContact = false;
    rec.state.x = CONFIG.bots.unbeachClearU * 2;
    port.now += CONFIG.tick.simDtMs;
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.unbeach!.holdUntil).toBeGreaterThan(0);
    // Aground again while the hold is still running.
    expect(arm()).toBe(first);
  });

  // THE STORM STILL OUTRANKS EVERYTHING, hold included — the header's priority
  // order is the policy, and a committed exit heading must not sail a hull to
  // its death in the ring.
  it('RING ESCAPE outranks the exit-heading hold', () => {
    const w = openWorld(108);
    const port = fakePort(w, { cx: -4000, cy: 0, r: 200 }); // far outside it
    const rec = mkBot(w, 'battleship', 0, 0, 0); // bow due east, ring due west
    const mind = mkMind('bulwark');
    mind.unbeach = { rudder: 1, fromX: 0, fromY: 0, holdUntil: port.now + 10000, holdHeading: 0 };
    expect(Math.abs(COMBAT_BRAIN.decide(rec, mind, port).rudder)).toBe(1);
  });

  // A hull with plenty of way on but NO land under it must never reverse: the
  // guard against replacing the broken speed trip with a differently broken
  // one (a raised STUCK_SPEED would fire on every slow turn in open water).
  it('a slow bot in OPEN WATER never arms the manoeuvre, however long it dawdles', () => {
    const w = openWorld(105);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    rec.state.speed = 0.5; // barely moving, and not touching a thing
    rec.landContact = false;
    for (let i = 0; i < 400; i += 1) {
      expect(COMBAT_BRAIN.decide(rec, mind, port).throttle).toBeGreaterThan(0);
      port.now += CONFIG.tick.simDtMs;
    }
  });

  it('a coastline dead ahead biases the rudder away from the NEAREST COAST POINT', () => {
    const w = new World(104, 8); // islands intact: this test is about them
    const isle = w.map.islands[0];
    expect(isle).toBeDefined();
    // Stand 60u off the island's real COASTLINE (not its bounding circle —
    // that is the whole point of the ported bias) and point straight at it.
    const probe = { x: isle.x - isle.r - 200, y: isle.y };
    const coast = nearestCoastPoint(probe, isle);
    const brg = Math.atan2(coast.y - probe.y, coast.x - probe.x);
    const x = coast.x - Math.cos(brg) * 60;
    const y = coast.y - Math.sin(brg) * 60;
    const rec = mkBot(w, 'torpedoBoat', x, y, brg);
    // The ring centre is placed dead ahead too, so the posture bearing
    // contributes exactly zero rudder and the coastline probe is the only
    // thing that can move it.
    const port = fakePort(w, { cx: x + Math.cos(brg) * 2000, cy: y + Math.sin(brg) * 2000, r: 6000 });
    const d = COMBAT_BRAIN.decide(rec, mkMind('raider'), port);
    expect(Math.abs(d.rudder)).toBeGreaterThan(0);
  });

  // AVOIDANCE MUST BE ABLE TO WIN. The shipped composition was a plain sum
  // over a track term that SATURATES at ±1, so a bearing running through a
  // coastline netted +1 − 0.8 = +0.2: a turn TOWARD the rock the probe had
  // just found. The geometry below is built so the two terms are in open
  // opposition and the old arithmetic is the wrong answer by SIGN, not by
  // degree — the strongest form this assertion can take.
  it('a wanted bearing that runs THROUGH a coastline never nets a turn toward it', () => {
    const w = new World(109, 8); // islands intact
    const isle = [...w.map.islands].sort((a, b) => b.r - a.r)[0];
    const probe = { x: isle.x - isle.r - 200, y: isle.y };
    const coast = nearestCoastPoint(probe, isle);
    const toCoast = Math.atan2(coast.y - probe.y, coast.x - probe.x);
    // Stand 60u off the coast and point 0.6 rad to STARBOARD of it, so the
    // land lies to port and steering onto the wanted bearing means turning
    // into it. RUDDER_GAIN (2) saturates the track term at that error.
    const x = coast.x - Math.cos(toCoast) * 60;
    const y = coast.y - Math.sin(toCoast) * 60;
    const rec = mkBot(w, 'torpedoBoat', x, y, wrapAngle(toCoast - 0.6));
    // Ring centre straight through the island: patrol-seek wants `toCoast`.
    const port = fakePort(w, {
      cx: x + Math.cos(toCoast) * 3000,
      cy: y + Math.sin(toCoast) * 3000,
      r: 9000,
    });
    const d = COMBAT_BRAIN.decide(rec, mkMind('raider'), port);
    // Land to port -> the helm must go STARBOARD. The plain sum answered
    // +0.2 (port, into the rock); the weighted composition answers ~-0.6.
    expect(d.rudder).toBeLessThan(-0.4);
  });

  it('THE REAR-QUARTER DOGFIGHT (C1): a duelist steers behind a peer, but never behind a Mine Layer', () => {
    const now = 100000;
    const duelist = profileOf('duelist');
    // A peer running due east: its rear quarter is WEST of it.
    const peer = track(now, { x: 300, y: 0, heading: 0, speed: 45, cls: 'torpedoBoat' as HullId });
    const behind = approachPoint(duelist, peer);
    expect(behind.x).toBeLessThan(peer.x);
    expect(Math.hypot(behind.x - peer.x, behind.y - peer.y)).toBeGreaterThan(0);
    // A MINE LAYER is the exception — tailing one sails up its astern mine
    // sector, so the duelist goes for the hull itself.
    const layer = track(now, { x: 300, y: 0, heading: 0, speed: 30, cls: 'mineLayer' as HullId });
    expect(approachPoint(duelist, layer)).toEqual({ x: layer.x, y: layer.y });
    // And an identity-free plot has no course to get behind.
    const anon = track(now, { id: null, x: 300, y: 0, heading: null, speed: null, cls: null });
    expect(approachPoint(duelist, anon)).toEqual({ x: anon.x, y: anon.y });
    // No other profile takes the rear quarter at all.
    expect(approachPoint(profileOf('raider'), peer)).toEqual({ x: peer.x, y: peer.y });
  });

  it('a visible ENEMY mine ahead biases the rudder; the bot\'s own never does', () => {
    const w = openWorld(105);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 0); // bow due east
    const mind = mkMind('trapper');
    // Ring centre dead ahead so the posture bearing contributes nothing.
    port.zoneLiveRing = { cx: 1000, cy: 0, r: 4000 };
    const ahead = { id: 'm1', x: 60, y: 20, by: 'enemy' };
    mind.view = { contacts: [], events: [], mines: [{ ...ahead, own: false }], litZones: [], buoys: [] };
    mind.viewAt = -1; // not fresh: nothing is folded, only the mine probe reads it
    const dodged = COMBAT_BRAIN.decide(rec, mind, port);
    expect(dodged.rudder).toBeLessThan(0); // mine to port -> steer starboard
    mind.view = { contacts: [], events: [], mines: [{ ...ahead, own: true }], litZones: [], buoys: [] };
    const own = COMBAT_BRAIN.decide(rec, mind, port);
    expect(own.rudder).toBe(0); // an owner never trips its own rack
  });
});

/**
 * THE STORM RING AS A CONSTRAINT — and why every ring test that shipped before
 * this block was structurally incapable of catching the defect it is about.
 *
 * The shipped coverage is TWO SINGLE-TICK ASSERTIONS with the hull placed deep
 * outside a ring and then deep inside one ('RING ESCAPE outranks target
 * pursuit' above; botPolicy.test.ts's 'OUTSIDE THE LIVE RING, nothing else
 * matters'). Both are correct and both stay. Neither can express the actual
 * failure, which is a MULTI-TICK LIMIT CYCLE within a few metres of the
 * boundary: escape releases the instant `dist <= r`, the outward-pushing
 * posture resumes on the very next tick, and the hull re-crosses — measured at
 * a ~2.2s period and ±3-8u amplitude. A single tick cannot see a cycle, and
 * `fakePort`'s default ring is four map radii wide, so nothing in the suite was
 * ever near a rim at all.
 *
 * So these sail. `sailTick` is the whole harness: the brain's own decision fed
 * straight into the shared `stepShip` at the shared 50ms dt — the same two
 * calls, in the same order, that World's STEP_ORDER makes (inputs -> ships).
 */
describe('the storm ring is a CONSTRAINT, not only an override', () => {
  /** One tick of the real loop: decide, then integrate the hull with the
   *  decision, then advance the clock. Returns what the brain asked for. */
  function sailTick(rec: ShipRecord, mind: BotMind, port: FakePort): BotDecision {
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    stepShip(rec.state, { throttle: d.throttle, rudder: d.rudder }, rec.stats.kinematics, CONFIG.tick.simDtMs / 1000);
    port.now += CONFIG.tick.simDtMs;
    return d;
  }

  it('NO LIMIT CYCLE: a cornered bot flees for 30s at the rim without crossing once', () => {
    const w = openWorld(301);
    const R = 800;
    const port = fakePort(w, { cx: 0, cy: 0, r: R });
    // A Battleship 40u inside the rim, bow tangential, hurt past `bulwark`'s
    // disengage fraction. It is the hull the report named first, and the one
    // that pays most per crossing: 7.9s to reverse against a Torpedo Boat's
    // 3.9s.
    const rec = mkBot(w, 'battleship', R - 40, 0, Math.PI / 2);
    rec.hp = rec.stats.maxHp * 0.1;
    const mind = mkMind('bulwark');
    const threat = track(port.now, { x: 0, y: 0, speed: 0 });
    plot(mind, threat);

    let crossings = 0;
    let outsideTicks = 0;
    let wasOut = false;
    for (let i = 0; i < 600; i += 1) {
      // THE THREAT IS PINNED 300u INWARD OF THE HULL, every tick. That makes
      // the shipped flee heading — the pure reciprocal of the bearing to the
      // target, with no ring term in it at all — point STRAIGHT OUT of the
      // ring on every single tick. It is the exact geometry 8 of the 10
      // measured non-closing exits were taken in.
      const d = Math.hypot(rec.state.x, rec.state.y) || 1;
      threat.x = rec.state.x * (1 - 300 / d);
      threat.y = rec.state.y * (1 - 300 / d);
      threat.seenAt = port.now;
      threat.firstSeenAt = port.now - CONFIG.bots.reactionMs * 4;
      sailTick(rec, mind, port);
      const out = Math.hypot(rec.state.x, rec.state.y) > R;
      if (out) outsideTicks += 1;
      if (out && !wasOut) crossings += 1;
      wasOut = out;
    }
    expect(mind.posture).toBe('disengage'); // it really was running the whole time
    expect(crossings).toBe(0);
    expect(outsideTicks).toBe(0);
    // And it did not solve the problem by parking in the middle either — the
    // flee is TANGENTIAL, so it holds station just inside the rim. The
    // equilibrium is sqrt(r^2 - L^2) by construction (the radius at which the
    // legal cone's edge is exactly tangent), 751u here.
    expect(Math.hypot(rec.state.x, rec.state.y)).toBeGreaterThan(R * 0.7);
  });

  it('THE FLEE IS TANGENTIAL, NOT RADIAL: at the rim the helm turns away from straight-out', () => {
    const w = openWorld(302);
    const R = 800;
    const near = fakePort(w, { cx: 0, cy: 0, r: R });
    const rec = mkBot(w, 'battleship', 780, 0, Math.PI / 2); // bow due north = tangential
    rec.hp = rec.stats.maxHp * 0.1;
    const mind = mkMind('bulwark');
    plot(mind, track(near.now, { x: 480, y: 0, speed: 0 })); // 300u INWARD of the hull
    const d = COMBAT_BRAIN.decide(rec, mind, near);
    expect(mind.posture).toBe('disengage');
    expect(d.throttle).toBe(1);
    // The reciprocal flee is due EAST — straight out — which from a
    // north-facing bow is a STARBOARD (negative) rudder. The legal cone's edge
    // sits PAST north here, so the constrained helm goes the OTHER WAY. The
    // sign is the assertion: it cannot be satisfied by a smaller correction.
    expect(d.rudder).toBeGreaterThan(0);

    // THE PAIRED CONTROL, and it is what proves the ring did it: the same hull,
    // the same threat, the same bearing — but a ring so wide the run cannot
    // reach it — still flees radially, starboard rudder and all.
    const wide = fakePort(w);
    const far = mkMind('bulwark');
    plot(far, track(wide.now, { x: 480, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(rec, far, wide).rudder).toBeLessThan(0);
  });

  it('RING ESCAPE HAS A DEADBAND: it does not release the instant the hull is back inside', () => {
    const w = openWorld(303);
    const R = 900;
    const port = fakePort(w, { cx: 0, cy: 0, r: R });
    const rec = mkBot(w, 'battleship', R, 0, 0); // bow due east, ring centre astern
    const mind = mkMind('bulwark');
    const margin = rec.stats.kinematics.maxSpeed / rec.stats.kinematics.turnRate; // 87.5u
    plot(mind, track(port.now, { x: R + 400, y: 0, speed: 0 })); // a target further OUT still

    // EXACTLY ON THE RIM. `isOutside` is boundary-inclusive, so this reads as
    // INSIDE — the zero-width release that produced the chatter. A hull that
    // was already running keeps running, at full ahead, hard over for the
    // centre.
    mind.posture = 'ringRun';
    const onRim = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('ringRun');
    expect(onRim.throttle).toBe(1);
    expect(Math.abs(onRim.rudder)).toBe(1); // hard over: the centre is 180 astern

    // One unit short of the deadband still holds it...
    rec.state.x = R - margin + 1;
    mind.posture = 'ringRun';
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('ringRun');

    // ...and one unit past it hands the bot back to its own war.
    rec.state.x = R - margin - 1;
    mind.posture = 'ringRun';
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).not.toBe('ringRun');
  });

  it('OPEN WATER IS UNTOUCHED: the constraint engages only within one reversal run of the rim', () => {
    const w = openWorld(304);
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const plotAt = (p: FakePort, m: BotMind): void => {
      plot(m, track(p.now, { x: 200, y: 100, speed: 0 }));
    };
    // A ring whose rim is 600u away against a Torpedo Boat's 176.7u reversal
    // run, and a ring four map radii wide: the same helm, to the bit.
    const tight = fakePort(w, { cx: 0, cy: 0, r: 600 });
    const wide = fakePort(w);
    const m1 = mkMind('duelist');
    const m2 = mkMind('duelist');
    plotAt(tight, m1);
    plotAt(wide, m2);
    const a = COMBAT_BRAIN.decide(rec, m1, tight);
    const b = COMBAT_BRAIN.decide(rec, m2, wide);
    expect(a.throttle).toBe(b.throttle);
    expect(a.rudder).toBe(b.rudder);

    // THE CONTROL IS NOT VACUOUS: slide the same hull out to where the run
    // does reach the rim and the two helms part company.
    rec.state.x = 560;
    const m3 = mkMind('duelist');
    const m4 = mkMind('duelist');
    plot(m3, track(tight.now, { x: 900, y: 0, speed: 0 })); // seaward of the rim
    plot(m4, track(wide.now, { x: 900, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(rec, m3, tight).rudder).not.toBe(COMBAT_BRAIN.decide(rec, m4, wide).rudder);
  });

  it('THE DEADBAND IS BOOST-AWARE TOO: the safe radius grows with the hull\'s real speed', () => {
    // THE SPEED BOOST IS NOT IN `EffectiveStats` — World.stepShips raises the
    // per-tick cap outside the stat block — so BOTH ring lengths must read the
    // hull's live speed. The reversal RUN was made boost-aware first; the
    // DEADBAND was missed, which left a boosted hull steering against a safe
    // radius sized for a ship that turns tighter than it does.
    //
    // The berth is DERIVED, not a literal, so a kinematics retune moves the
    // test instead of breaking it: the constraint engages at `d > S - L`, and
    // the two candidate safe radii (rated deadband vs boosted deadband) put
    // that threshold 17u apart. The hull is berthed exactly between them, so
    // the rated-deadband answer is "no constraint at all" and the boosted one
    // is a real turn.
    const w = openWorld(306);
    const R = 1000;
    const port = fakePort(w, { cx: 0, cy: 0, r: R });
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0); // bow due EAST = straight out
    rec.hp = rec.stats.maxHp * 0.1; // `raider` disengages
    const k = rec.stats.kinematics;
    const boost = k.maxSpeed * 1.3; // roughly what a boosted raider makes
    const runU = (boost * Math.PI) / k.turnRate; // the reversal run, boost-aware
    const engageBoostBand = R - (boost / k.turnRate) - runU;
    const engageRatedBand = R - (k.maxSpeed / k.turnRate) - runU;
    const berth = (engageBoostBand + engageRatedBand) / 2;
    expect(berth).toBeGreaterThan(engageBoostBand); // the boosted band bites here
    expect(berth).toBeLessThan(engageRatedBand); // the rated one does not

    const inward = { x: berth - 300, y: 0 }; // the threat, 300u INWARD
    const boosted = mkMind('raider');
    plot(boosted, track(port.now, { ...inward, speed: 0 }));
    rec.state.x = berth;
    rec.state.speed = boost;
    const fast = COMBAT_BRAIN.decide(rec, boosted, port);
    expect(boosted.posture).toBe('disengage');
    expect(Math.abs(fast.rudder)).toBeGreaterThan(0.25); // turned off the rim

    // THE PAIRED CONTROL: the same hull at the same berth, making its RATED
    // speed, is nowhere near the constraint and asks for nothing.
    const slowMind = mkMind('raider');
    plot(slowMind, track(port.now, { ...inward, speed: 0 }));
    rec.state.speed = k.maxSpeed;
    const slow = COMBAT_BRAIN.decide(rec, slowMind, port);
    expect(slowMind.posture).toBe('disengage');
    expect(Math.abs(slow.rudder)).toBeLessThan(0.05);
  });

  it('STAR SHELLS TAKE THE TERRAIN GATE: no flare is spent bursting inside an island', () => {
    // 71% of the bot's remaining into-terrain ordnance after the first pass.
    const blocked = islandWorld(305, circleIsland(250, 0, 120)); // squarely on the line
    const p1 = fakePort(blocked);
    const rec = mkBot(blocked, 'battleship', 0, 0, 0);
    const m1 = mkMind('siege');
    plot(m1, track(p1.now, { x: 500, y: 0, live: false, seenAt: p1.now - 3000 }));
    expect(COMBAT_BRAIN.decide(rec, m1, p1).fireSlot).not.toBe(slotOf(rec, 'starShells'));

    // THE C2 BEHAVIOUR ITSELF IS UNCHANGED — the same plot, the same profile,
    // the same island moved off the line, and the flare goes up. `flareTarget`
    // was deliberately NOT filtered: the bot still WANTS the nearest lost plot,
    // it just holds the round when the round cannot arrive.
    const clear = islandWorld(305, circleIsland(250, 600, 120));
    const p2 = fakePort(clear);
    const rec2 = mkBot(clear, 'battleship', 0, 0, 0);
    const m2 = mkMind('siege');
    plot(m2, track(p2.now, { x: 500, y: 0, live: false, seenAt: p2.now - 3000 }));
    expect(COMBAT_BRAIN.decide(rec2, m2, p2).fireSlot).toBe(slotOf(rec2, 'starShells'));
  });
});

describe('weapons — every shot is a LEGAL shot', () => {
  it('THE TORPEDO ARC IS TESTED FIRST: a target astern never advances the tube', () => {
    const w = openWorld(201);
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0); // bow due east
    const tube = slotOf(rec, 'heavyTorpedo');
    // Dead ahead, inside credible range: the tube fires.
    const ahead = mkMind('duelist');
    plot(ahead, track(port.now, { x: 150, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(rec, ahead, port).fireSlot).toBe(tube);
    // Dead ASTERN, same range: the bow sector refuses, and the bot falls
    // through to the 360-degree gun rather than burning a click on nothing.
    const astern = mkMind('duelist');
    plot(astern, track(port.now, { x: -150, y: 0, speed: 0 }));
    const d = COMBAT_BRAIN.decide(rec, astern, port);
    expect(d.fireSlot).not.toBe(tube);
    expect(d.fireSlot).toBe(slotOf(rec, 'gun'));
    // Whatever it fired, the commanded bearing is inside that weapon's arc.
    expect(inArc(d.aim, wrapAngle(rec.state.heading + BOW_SECTOR.offset), BOW_SECTOR.halfArc)).toBe(false);
  });

  it('the tube is held beyond credible intercept range', () => {
    const w = openWorld(202);
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const mind = mkMind('raider');
    plot(mind, track(port.now, { x: 600, y: 0, speed: 0 })); // in the bow arc, far
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBe(slotOf(rec, 'gun'));
  });

  it('MINE LEGALITY: dropped inside the astern sector, inside placeRange, and never on blocked water', () => {
    const w = openWorld(203);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 1.1); // an off-axis heading on purpose
    const rack = slotOf(rec, 'navalMines');
    const mind = mkMind('trapper');
    rec.hp = rec.stats.maxHp * 0.1; // hurt -> disengaging -> laying its field
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBe(rack);
    const center = wrapAngle(rec.state.heading + REAR_SECTOR.offset);
    expect(inArc(d.aim, center, REAR_SECTOR.halfArc)).toBe(true);
    expect(d.aimDist).toBeLessThanOrEqual(CONFIG.mine.placeRange);
    expect(d.aimDist).toBeGreaterThan(0);
    // BLOCKED WATER: pushed against the rim with the rack pointed off the map,
    // the drop is refused outright — no click is spent placing a mine in air.
    const rim = mkBot(w, 'mineLayer', -(w.map.radius - 20), 0, Math.PI); // bow west, rack east
    rim.hp = rim.stats.maxHp * 0.1;
    rim.state.x = w.map.radius - 20;
    const blocked = COMBAT_BRAIN.decide(rim, mkMind('trapper'), port);
    expect(blocked.fireSlot).not.toBe(rack);
  });

  it('STAR SHELLS AS A SENSOR (C2): siege lights a stale plot it has lost', () => {
    const w = openWorld(204);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const flares = slotOf(rec, 'starShells');
    const mind = mkMind('siege');
    // Lost 3s ago, out past our own truesight bubble, inside flare reach.
    plot(mind, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 3000 }));
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBe(flares);
    expect(d.aimDist).toBeCloseTo(500, 0); // aimed at the LAST KNOWN position
    // A LIVE contact needs no flare — that one gets shot at instead.
    const live = mkMind('siege');
    plot(live, track(port.now, { x: 500, y: 0, live: true }));
    expect(COMBAT_BRAIN.decide(rec, live, port).fireSlot).not.toBe(flares);
  });

  it('APPETITE IS EAGERNESS, NEVER GEOMETRY: bulwark now fires flares — just later than siege', () => {
    // The retired usesStarShells:false made bulwark carry a native weapon it
    // could never use — the capability-keyed-by-hull defect the equipment
    // axis retires. Bulwark's appetite sits between NEUTRAL and EAGER, so it
    // waits for a plot to go properly cold (2x the eager staleness floor).
    const w = openWorld(214);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const flares = slotOf(rec, 'starShells');

    // Stale 2s: past siege's eager 1.5s floor, short of bulwark's 3s one.
    const siege2s = mkMind('siege');
    plot(siege2s, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 2000 }));
    expect(COMBAT_BRAIN.decide(rec, siege2s, port).fireSlot).toBe(flares);
    const bulwark2s = mkMind('bulwark');
    plot(bulwark2s, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 2000 }));
    expect(COMBAT_BRAIN.decide(rec, bulwark2s, port).fireSlot).not.toBe(flares);

    // Stale 3.5s: BOTH fire, and they fire at the IDENTICAL point — two
    // profiles holding the same equipment place it identically; only their
    // eagerness differs (the ruled two-axis split).
    const siegeLate = mkMind('siege');
    plot(siegeLate, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 3500 }));
    const a = COMBAT_BRAIN.decide(rec, siegeLate, port);
    const bulwarkLate = mkMind('bulwark');
    plot(bulwarkLate, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 3500 }));
    const b = COMBAT_BRAIN.decide(rec, bulwarkLate, port);
    expect(a.fireSlot).toBe(flares);
    expect(b.fireSlot).toBe(flares);
    expect(b.aim).toBeCloseTo(a.aim, 10);
    expect(b.aimDist).toBeCloseTo(a.aimDist, 10);
  });

  it('a `return`-grammar plot is AIMED AT, never led — and no long-reload weapon is spent on it', () => {
    const w = openWorld(205);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const at = { x: 0, y: 250 }; // due north, so a lead solution swings the bearing
    const direct = Math.atan2(at.y, at.x);
    // Identity-free: position only. The aim sits on the true bearing, within
    // the aim scatter alone.
    const anon = mkMind('bulwark');
    plot(anon, track(port.now, { id: null, ...at, heading: null, speed: null, cls: null }));
    const blind = COMBAT_BRAIN.decide(rec, anon, port);
    expect(Math.abs(angleDiff(direct, blind.aim))).toBeLessThan(0.05);
    // The SAME hull with a disclosed course is led — materially off the
    // direct bearing, which is what proves the branch above is real.
    const led = mkMind('bulwark');
    plot(led, track(port.now, { ...at, heading: 0, speed: 45 }));
    expect(Math.abs(angleDiff(direct, COMBAT_BRAIN.decide(rec, led, port).aim))).toBeGreaterThan(0.05);
    // A 30-second BROADSIDE reload is not spent on a plot that cannot be led.
    // (The target is due north of a bow-east hull, so it is ABEAM — inside
    // the barrage's beam sector, which is what makes it a candidate at all.)
    expect(blind.fireSlot).toBe(slotOf(rec, 'gun'));
    expect(COMBAT_BRAIN.decide(rec, led, port).fireSlot).toBe(slotOf(rec, 'broadside'));
    // Nor is a torpedo.
    const tb = mkBot(w, 'torpedoBoat', 0, 0, Math.PI / 2);
    const tbMind = mkMind('duelist');
    plot(tbMind, track(port.now, { id: null, x: 0, y: 150, heading: null, speed: null, cls: null }));
    expect(COMBAT_BRAIN.decide(tb, tbMind, port).fireSlot).toBe(slotOf(tb, 'gun'));
  });

  it('never fires an EMPTY pool — the reloading gun holds fire with a perfect target', () => {
    const w = openWorld(206);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    plot(mind, track(port.now, { x: 200, y: 0, speed: 0, heading: null }));
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBe(slotOf(rec, 'gun'));
    // Drain every pool: nothing is fireable, so nothing is requested.
    for (const slot of rec.loadout) if (slot.state) slot.state = { n: 0, reloadMsLeft: 4000 };
    const dry = COMBAT_BRAIN.decide(rec, mind, port);
    expect(dry.fireSlot).toBeNull();
    expect(dry.aimDist).toBe(0);
    expect(dry.throttle).toBeGreaterThan(0); // it still sails
  });

  it('a target beyond the weapon\'s reach is not shot at', () => {
    const w = openWorld(207);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    // Inside the scoring horizon (1.25R) but outside gun range (R) — and the
    // broadside's 5/8 reach is shorter still.
    plot(mind, track(port.now, { x: rec.stats.equipment.gun.rangeU + 100, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBeNull();
  });

  it('abilities ride the act channel: a raider boosts out', () => {
    // The TRAPPER's decoy-drop half is RETIRED (Story 7-5 wave 2): the decoy
    // buoy is deleted and the RADAR BUOY replacing it is a click-placed WEAPON
    // (R2.7), not an actSeq ability — so the boost is the only ability any
    // profile presses, and `usesDecoy` left BotProfile with its consumer.
    const w = openWorld(208);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0);
    tb.hp = tb.stats.maxHp * 0.1; // below raider's 0.5 -> disengage
    const raider = mkMind('raider');
    plot(raider, track(port.now, { x: 200, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(tb, raider, port).actSlot).toBe(slotOf(tb, 'boost'));
    // A withdrawing MINE LAYER NOW BOOSTS TOO (Story 8.5, epic-8 amendment
    // 23: the boost stopped being a Torpedo Boat privilege and is fitted in
    // slot 1 on every captain hull). Before this story it pressed nothing,
    // because it had no ability fitted at all — the policy never changed, the
    // hardware did.
    const ml = mkBot(w, 'mineLayer', 0, 0, 0);
    ml.hp = ml.stats.maxHp * 0.1;
    const trapper = mkMind('trapper');
    plot(trapper, track(port.now, { x: 200, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(ml, trapper, port).actSlot).toBe(slotOf(ml, 'boost'));
    // Healthy: no ability spent.
    const healthy = mkBot(w, 'torpedoBoat', 0, 0, 0);
    expect(COMBAT_BRAIN.decide(healthy, raider, port).actSlot).toBeNull();
  });

  // THE BELT PRESS (Story 8.8, epic-8 amendment 49). `HEAL_CHOICE` left the
  // spend policy with the wire, so a bot that could draw HULL REPAIR cards and
  // never fire one would simply stop healing. One rule, on the SAME ability
  // channel the boost rides: under the profile's healHpFrac, press the stack.
  it('a hurt bot holding a HULL REPAIR stack presses its belt slot; a full-hull one does not', () => {
    const w = openWorld(212);
    const port = fakePort(w);
    const duelist = mkMind('duelist');

    const hurt = mkBot(w, 'torpedoBoat', 0, 0, 0);
    w.applyCard(hurt, 'hullRepair');
    const belt = slotOf(hurt, 'hullRepair');
    expect(belt).toBeGreaterThanOrEqual(0);
    hurt.hp = hurt.stats.maxHp * (profileOf('duelist').healHpFrac - 0.05);
    expect(COMBAT_BRAIN.decide(hurt, duelist, port).actSlot).toBe(belt);

    // At full hull it holds the copy — and the boost does not fire either,
    // because a healthy hull is not disengaging.
    const full = mkBot(w, 'torpedoBoat', 0, 0, 0);
    w.applyCard(full, 'hullRepair');
    expect(COMBAT_BRAIN.decide(full, mkMind('duelist'), port).actSlot).toBeNull();
  });

  it('does NOT press a second copy while the first one\'s pool is still draining in', () => {
    // THE PAID POOL IS HP ALREADY BOUGHT (`repairHp`, 50 hp landing over 5 s).
    // Reading the bare `hp` is reading the hull mid-payment: a bulwark that
    // fires at 120/350 is at 170 with 50 more coming — 220 of 350, over its
    // own 0.6 threshold — and would otherwise burn its whole stack inside one
    // pool's lifetime, which is exactly the scarcity the card model exists for.
    const w = openWorld(214);
    const port = fakePort(w);
    const bot = mkBot(w, 'battleship', 0, 0, 0);
    for (let i = 0; i < 3; i += 1) w.applyCard(bot, 'hullRepair');
    const belt = slotOf(bot, 'hullRepair');
    expect(belt).toBeGreaterThanOrEqual(0);

    // Mid-payment: the instant 50 has landed, the pooled 50 has not.
    bot.hp = 170;
    bot.repairHp = CONFIG.hullRepair.regenHp;
    expect(bot.hp / bot.stats.maxHp).toBeLessThan(profileOf('bulwark').healHpFrac); // the bare read still says "heal"
    expect(COMBAT_BRAIN.decide(bot, mkMind('bulwark'), port).actSlot).toBeNull();

    // THE CONTROL: the same hull with nothing draining in does press. Only the
    // pool separates the two, so an inverted read cannot pass both.
    bot.repairHp = 0;
    expect(COMBAT_BRAIN.decide(bot, mkMind('bulwark'), port).actSlot).toBe(belt);
  });

  it('a SINKING bot never presses its belt, however low its hull reads', () => {
    // The driver already drops non-afloat bots before they decide, so this is
    // the row's own guard — the same one the server's HULL REPAIR row keeps
    // (amendment 10: no hp comes back to a hull in the window). Without it the
    // tactic's only test is `hp / maxHp`, which a sinking hull passes most of
    // all, and any future caller that reaches a brain without the driver's
    // afloat check would have the bot mashing a key the row always refuses.
    const w = openWorld(215);
    const port = fakePort(w);
    const dying = mkBot(w, 'battleship', 0, 0, 0);
    w.applyCard(dying, 'hullRepair');
    const belt = slotOf(dying, 'hullRepair');
    dying.hp = 0;
    dying.lifecycle = transitionLifecycle(dying.lifecycle, 'sink', port.now);
    expect(isAfloat(dying.lifecycle)).toBe(false);
    expect(belt).toBeGreaterThanOrEqual(0);
    // The BOOST is drained so it cannot answer first and mask the belt: a
    // hull at 0 hp is disengaging, and the boost outranks the belt on slot
    // index. With it dry, the belt slot is the only ability left to press.
    dying.loadout[SLOT_BOOST].state = { n: 0, reloadMsLeft: 4000 };
    expect(COMBAT_BRAIN.decide(dying, mkMind('bulwark'), port).actSlot).toBeNull();
  });

  it('...and a hurt bot with an EMPTY belt reaches for its boost, never a belt slot', () => {
    const w = openWorld(213);
    const port = fakePort(w);
    const bare = mkBot(w, 'battleship', 0, 0, 0);
    bare.hp = bare.stats.maxHp * 0.1; // hurt enough to want a heal it does not hold
    expect(slotOf(bare, 'hullRepair')).toBe(-1);
    // The withdrawal boost is the only ability it can press: a want() with no
    // fitted slot behind it is never even asked (rankedSlots walks the LOADOUT).
    expect(COMBAT_BRAIN.decide(bare, mkMind('bulwark'), port).actSlot).toBe(slotOf(bare, 'boost'));
  });

  it('the BROADSIDE is not spent on a plot that has gone dark (the `live` gate is a real gate)', () => {
    // F2: `live` now means SIGHTED THIS TICK. A plot with a disclosed course
    // that is no longer in the bubble is a gun target, never a 30s reload.
    // The plot sits ABEAM (due north of a bow-east hull) so the beam arc is
    // satisfied and `live` is the only thing under test.
    const w = openWorld(210);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const seen = mkMind('bulwark');
    plot(seen, track(port.now, { x: 0, y: 400, heading: 0, speed: 20, live: true }));
    expect(COMBAT_BRAIN.decide(rec, seen, port).fireSlot).toBe(slotOf(rec, 'broadside'));
    const lost = mkMind('bulwark');
    plot(lost, track(port.now, { x: 0, y: 400, heading: 0, speed: 20, live: false }));
    expect(COMBAT_BRAIN.decide(rec, lost, port).fireSlot).toBe(slotOf(rec, 'gun'));
  });

  it('the BROADSIDE is refused OUT OF ARC: the same plot dead ahead falls through to the gun', () => {
    // R2.1/R2.2: the bot tests the twin-sector arc exactly as the equipment
    // row does, so it never burns a click on a bow/stern dead-zone target.
    const w = openWorld(211);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0); // bow due east
    const ahead = mkMind('bulwark');
    plot(ahead, track(port.now, { x: 300, y: 0, heading: 0, speed: 20, live: true }));
    expect(COMBAT_BRAIN.decide(rec, ahead, port).fireSlot).toBe(slotOf(rec, 'gun'));
  });

  it('the frozen boarding room is not the brain\'s business — but a bot with no view still sails', () => {
    const w = openWorld(209);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 0);
    const mind = mkMind('forager'); // view null, contacts empty
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    // DELIBERATE PIN UPDATE (doctrine pass): with nothing tracked, a Mine
    // Layer now sites its SENSOR BUOY — recon is exactly what an empty scope
    // calls for, and the placement class resolves above the target guard. A
    // TORPEDO BOAT with no placements still requests nothing.
    expect(d.fireSlot).toBe(slotOf(rec, 'radarBuoy'));
    expect(d.actSlot).toBeNull();
    expect(d.spendChoice).toBeNull();
    expect(Number.isFinite(d.aim)).toBe(true);
    expect(d.throttle).toBeGreaterThan(0);
    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const tbd = COMBAT_BRAIN.decide(tb, mkMind('raider'), port);
    expect(tbd.fireSlot).toBeNull();
    expect(tbd.throttle).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// TERRAIN IS A DENIAL — the defect Eric watched ("a minelayer focus-firing on
// drones it cannot possibly hit due to an island being in the way") and the
// structural reason the shipped suite could not see it: EVERY fire test above
// runs on an ocean with the islands deleted. These run with the coastline in.
// ---------------------------------------------------------------------------

describe('weapons — a shot that cannot ARRIVE is not requested', () => {
  it('a COASTLINE BETWEEN gun and target refuses the shot; the same shot over clear water fires', () => {
    // A 60u rock at (200,0), the target at (400,0): every scattered burst
    // point is within ~10u of the plot, so the flight line crosses it.
    const w = islandWorld(301, circleIsland(200, 0, 60));
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    plot(mind, track(port.now, { x: 400, y: 0, speed: 0, heading: null }));
    const denied = COMBAT_BRAIN.decide(rec, mind, port);
    expect(denied.fireSlot).toBeNull();
    expect(denied.aimDist).toBe(0);
    expect(denied.throttle).toBeGreaterThan(0); // it still sails — this denies a SHOT, not a bot

    // THE OVER-BLOCKING CONTROL: identical geometry, rock removed, gun fires.
    const clear = openWorld(301);
    const clearPort = fakePort(clear);
    const rec2 = mkBot(clear, 'battleship', 0, 0, 0);
    const mind2 = mkMind('bulwark');
    plot(mind2, track(clearPort.now, { x: 400, y: 0, speed: 0, heading: null }));
    expect(COMBAT_BRAIN.decide(rec2, mind2, clearPort).fireSlot).toBe(slotOf(rec2, 'gun'));
  });

  it('a coastline BESIDE the flight line denies nothing — only a line THROUGH land does', () => {
    // The same rock moved abeam. A bot that stopped shooting whenever an
    // island was anywhere nearby would be a worse bug than the one being fixed.
    const w = islandWorld(302, circleIsland(200, 200, 60));
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('bulwark');
    plot(mind, track(port.now, { x: 400, y: 0, speed: 0, heading: null }));
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBe(slotOf(rec, 'gun'));
  });

  // RETIRED (Story 7-5 wave 2): "PLUNGING FIRE IS EXEMPT". The doctrine, the
  // cannon and `ShellState.arcing` are all deleted — NO shot in the game
  // overflies terrain any more, so the exemption branch it pinned is gone
  // from `burstShot` too. The general rule it was the exception to (a bot
  // never fires into rock, cycle 99) is pinned by the surrounding cases.

  it('the TUBE is never launched into a rock', () => {
    const w = islandWorld(304, circleIsland(80, 0, 30));
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0); // bow due east
    const mind = mkMind('duelist');
    plot(mind, track(port.now, { x: 160, y: 0, speed: 0 }));
    // Dead ahead, in the bow arc, inside credible range — and behind land.
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBeNull();

    const clear = openWorld(304);
    const clearPort = fakePort(clear);
    const rec2 = mkBot(clear, 'torpedoBoat', 0, 0, 0);
    const mind2 = mkMind('duelist');
    plot(mind2, track(clearPort.now, { x: 160, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(rec2, mind2, clearPort).fireSlot).toBe(slotOf(rec2, 'heavyTorpedo'));
  });

  it('THE STUCK ENGAGEMENT IS BROKEN TOO: a blocked target is pursued, not orbited', () => {
    // F3. Holding fire alone would leave the bot circling the island forever,
    // which is what Eric actually SAW. `pursue` steers at the target at full
    // ahead and the coastline-avoidance term rounds the obstruction.
    const w = islandWorld(305, circleIsland(150, 0, 60));
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 0);
    const mind = mkMind('forager');
    plot(mind, track(port.now, { x: 300, y: 0, speed: 0, cls: 'droneSmall' as HullId, fleet: true }));
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('pursue');
    // The same fleet target on open water is FARMED from the band instead.
    const clear = openWorld(305);
    const clearPort = fakePort(clear);
    const rec2 = mkBot(clear, 'mineLayer', 0, 0, 0);
    const mind2 = mkMind('forager');
    plot(mind2, track(clearPort.now, { x: 300, y: 0, speed: 0, cls: 'droneSmall' as HullId, fleet: true }));
    COMBAT_BRAIN.decide(rec2, mind2, clearPort);
    expect(mind2.posture).toBe('farm');
  });
});

// ---------------------------------------------------------------------------
// THE EQUIPMENT AXIS (Eric ruling 2026-08-20) — capability reads from the
// LOADOUT, doctrine verbs change behaviour inside their equipment's tactic,
// and temperament modulates proactivity only. One test per doctrine verb,
// each built to FAIL if its branch is removed.
// ---------------------------------------------------------------------------

describe('the equipment axis — acquired weapons work, doctrine changes behaviour', () => {
  /** Fit an equipment into the ship's EXTRA slot with a fresh ready pool —
   *  what an equipment line's copy 1 does, minus the card engine (not under
   *  test here). */
  function fitExtra(
    rec: ShipRecord,
    id: 'navalMines' | 'heavyTorpedo' | 'starShells' | 'captiveMines' | 'foulingMines' | 'lightTorpedo',
    slot = 3,
  ): number {
    rec.loadout[slot] = { equipmentId: id, state: { n: 1, reloadMsLeft: 0 } };
    return slot;
  }

  /**
   * SWAP THE HULL'S RACK for another mine line (Story 8.13). `captive` and
   * `propFouling` were DOCTRINE FLAGS on the naval row until this cycle, so
   * every case below used to forge one onto the bot's stats. They are separate
   * EQUIPMENT LINES now (epic-8 amendments 76/81) — a captive layer is a layer
   * whose RACK is the captive line — so the fixture fits the line into the
   * class-weapon slot instead of flipping a flag that no longer exists.
   */
  function swapRack(rec: ShipRecord, id: 'navalMines' | 'captiveMines' | 'foulingMines'): number {
    rec.loadout[2] = { equipmentId: id, state: { n: 1, reloadMsLeft: 0 } };
    return 2;
  }

  it('NON-NATIVE PAIRING: a Battleship that acquired mines lays them (the shared tactic)', () => {
    const w = openWorld(401);
    const port = fakePort(w);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const rack = fitExtra(rec, 'navalMines');
    rec.hp = rec.stats.maxHp * 0.1; // below bulwark's 0.22 -> disengage
    const mind = mkMind('bulwark');
    plot(mind, track(port.now, { x: -200, y: 0 }));
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBe(rack);
    const center = wrapAngle(rec.state.heading + REAR_SECTOR.offset);
    expect(inArc(d.aim, center, REAR_SECTOR.halfArc)).toBe(true);
    expect(d.aimDist).toBeCloseTo(CONFIG.mine.placeRange * 0.5, 6);
  });

  it('NON-NATIVE PAIRING: a Torpedo Boat that acquired star shells fires the sensor flare', () => {
    const w = openWorld(402);
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const flares = fitExtra(rec, 'starShells');
    const mind = mkMind('raider'); // neutral flare appetite: 2x staleness floor
    plot(mind, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 3500 }));
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBe(flares);
  });

  it('TWO PROFILES, ONE MINE: identical placement, different eagerness only', () => {
    const w = openWorld(403);
    const port = fakePort(w);
    // Disengaging, both lay — and the geometry is byte-identical relative to
    // the hull: dead astern at half placeRange. A profile cannot override an
    // equipment tactic's geometry.
    const siegeBs = mkBot(w, 'battleship', 0, 0, 0);
    fitExtra(siegeBs, 'navalMines');
    siegeBs.hp = siegeBs.stats.maxHp * 0.1;
    const siegeMind = mkMind('siege');
    plot(siegeMind, track(port.now, { x: -200, y: 0 }));
    const a = COMBAT_BRAIN.decide(siegeBs, siegeMind, port);
    const trapperMl = mkBot(w, 'mineLayer', 0, 0, 0);
    trapperMl.hp = trapperMl.stats.maxHp * 0.1;
    const trapperMind = mkMind('trapper');
    plot(trapperMind, track(port.now, { x: -200, y: 0 }));
    const b = COMBAT_BRAIN.decide(trapperMl, trapperMind, port);
    expect(a.fireSlot).toBe(slotOf(siegeBs, 'navalMines'));
    expect(b.fireSlot).toBe(slotOf(trapperMl, 'navalMines'));
    expect(a.aim).toBeCloseTo(b.aim, 10); // both dead astern of heading 0
    expect(a.aimDist).toBeCloseTo(b.aimDist, 10);

    // Healthy, a peer astern NOT closing: trapper (EAGER) lays as a standing
    // plan; siege (neutral) holds — it lays only when something is closing.
    const still = { x: -200, y: 0, heading: 0, speed: 0 };
    const siege2 = mkBot(w, 'battleship', 0, 0, 0);
    fitExtra(siege2, 'navalMines');
    const siegeStill = mkMind('siege');
    plot(siegeStill, track(port.now, still));
    expect(COMBAT_BRAIN.decide(siege2, siegeStill, port).fireSlot).not.toBe(slotOf(siege2, 'navalMines'));
    const trapper2 = mkBot(w, 'mineLayer', 0, 0, 0);
    const trapperStill = mkMind('trapper');
    plot(trapperStill, track(port.now, still));
    expect(COMBAT_BRAIN.decide(trapper2, trapperStill, port).fireSlot).toBe(slotOf(trapper2, 'navalMines'));

    // ...and the same closing pursuer flips siege to laying (the reactive
    // branch every profile shares).
    const closing = { x: -200, y: 0, heading: 0, speed: 20 }; // making way toward us
    const siege3 = mkBot(w, 'battleship', 0, 0, 0);
    fitExtra(siege3, 'navalMines');
    const siegeClosing = mkMind('siege');
    plot(siegeClosing, track(port.now, closing));
    expect(COMBAT_BRAIN.decide(siege3, siegeClosing, port).fireSlot).toBe(slotOf(siege3, 'navalMines'));
  });

  it('CAPTIVE MINES: full placeRange, proactive and arcless — and NEVER for a fleet-only target', () => {
    const w = openWorld(404);
    const port = fakePort(w);
    // A hostile AHEAD (outside the rear arc): a contact mine has no play, a
    // captive mine lays anyway (its torpedo does the chasing) at FULL reach.
    const cap = mkBot(w, 'mineLayer', 0, 0, 0);
    const capRack = swapRack(cap, 'captiveMines');
    const capMind = mkMind('trapper');
    plot(capMind, track(port.now, { x: 250, y: 0, speed: 0 }));
    const d = COMBAT_BRAIN.decide(cap, capMind, port);
    expect(d.fireSlot).toBe(capRack);
    expect(d.aimDist).toBeCloseTo(CONFIG.mine.placeRange, 6); // FULL reach — 144u trip ring
    const base = mkBot(w, 'mineLayer', 0, 0, 0);
    const baseMind = mkMind('trapper');
    plot(baseMind, track(port.now, { x: 250, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(base, baseMind, port).fireSlot).not.toBe(slotOf(base, 'navalMines'));

    // THE FLEET GATE: a captive mine's trip is HOSTILE-ONLY — a neutral PvE
    // drone walks over it — so a fleet-only target never justifies one, even
    // on disengage; a contact mine still lays (it trips on any hull).
    const fleet = { x: -150, y: 0, cls: 'droneSmall' as HullId, fleet: true };
    const capFleet = mkBot(w, 'mineLayer', 0, 0, 0);
    const capFleetRack = swapRack(capFleet, 'captiveMines');
    capFleet.hp = capFleet.stats.maxHp * 0.1;
    const capFleetMind = mkMind('trapper');
    plot(capFleetMind, track(port.now, fleet));
    expect(COMBAT_BRAIN.decide(capFleet, capFleetMind, port).fireSlot).not.toBe(capFleetRack);
    const baseFleet = mkBot(w, 'mineLayer', 0, 0, 0);
    baseFleet.hp = baseFleet.stats.maxHp * 0.1;
    const baseFleetMind = mkMind('trapper');
    plot(baseFleetMind, track(port.now, fleet));
    expect(COMBAT_BRAIN.decide(baseFleet, baseFleetMind, port).fireSlot).toBe(slotOf(baseFleet, 'navalMines'));
  });

  it('FOULING MINES: the trap goes down EARLIER against a closing pursuer', () => {
    const w = openWorld(405);
    const port = fakePort(w);
    // A pursuer astern at 450u, closing: outside the base 2x placeRange
    // window, inside the fouling 4x one — the slow only pays if the victim
    // runs THROUGH the field, so the fouling layer seeds the chase earlier.
    // THE WIDENING IS THE LINE'S OWN now (epic-8 amendment 81), not a verb the
    // naval rack could carry.
    const chase = { x: -450, y: 0, heading: 0, speed: 20 };
    const foul = mkBot(w, 'mineLayer', 0, 0, 0);
    const foulRack = swapRack(foul, 'foulingMines');
    const foulMind = mkMind('forager'); // NEUTRAL appetite: the reactive branch
    plot(foulMind, track(port.now, chase));
    expect(COMBAT_BRAIN.decide(foul, foulMind, port).fireSlot).toBe(foulRack);
    const base = mkBot(w, 'mineLayer', 0, 0, 0);
    const baseMind = mkMind('forager');
    plot(baseMind, track(port.now, chase));
    expect(COMBAT_BRAIN.decide(base, baseMind, port).fireSlot).not.toBe(slotOf(base, 'navalMines'));
  });

  it('LIGHT TORPEDO: the heavy\'s tactic, keyed by its own id and its own row (amendment 79)', () => {
    const w = openWorld(421);
    const port = fakePort(w);
    // Abeam at knife range: inside the straight-runner's credible gate AND
    // inside the light torpedo's beam sector (the heavy's bow cone would
    // refuse this bearing outright).
    const beam = { x: 0, y: 180, heading: 0, speed: 0 };
    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const light = fitExtra(tb, 'lightTorpedo', 4);
    const mind = mkMind('raider');
    plot(mind, track(port.now, beam));
    const d = COMBAT_BRAIN.decide(tb, mind, port);
    expect(d.fireSlot).toBe(light); // the HEAVY in slot 2 cannot bear; the light can
    expect(Math.abs(d.aim - Math.PI / 2)).toBeLessThan(Math.PI / 4); // fired abeam
  });

  it('torpedo homingTurnRate: the credible-range gate widens — bounded by budget minus turn room', () => {
    const w = openWorld(406);
    const port = fakePort(w);
    const at600 = { x: 600, y: 0, heading: 0, speed: 0 };
    // A STRAIGHT-RUNNING fish (tier I, rate 0): 600u is fiction (credible
    // 250u) — the gun takes it instead.
    const base = mkBot(w, 'torpedoBoat', 0, 0, 0);
    expect(base.stats.equipment.heavyTorpedo.homingTurnRate).toBe(0);
    const baseMind = mkMind('raider');
    plot(baseMind, track(port.now, at600));
    expect(COMBAT_BRAIN.decide(base, baseMind, port).fireSlot).toBe(slotOf(base, 'gun'));
    // A TOP-RUNG fish (0.5 rad/s): 600u is inside homingMaxRangeU minus a
    // half-turn of correction room (1300 − π·130 ≈ 892u) — the tube fires.
    // The rate is written straight onto the row, exactly where the fold puts
    // it at tier V: the SUBJECT here is the gate, not the ladder.
    const homing = mkBot(w, 'torpedoBoat', 0, 0, 0);
    homing.stats.equipment.heavyTorpedo.homingTurnRate = CONFIG.torpedo.homingTurnRate;
    const homingMind = mkMind('raider');
    plot(homingMind, track(port.now, at600));
    expect(COMBAT_BRAIN.decide(homing, homingMind, port).fireSlot).toBe(slotOf(homing, 'heavyTorpedo'));
    // Still bounded: past the budget-minus-turn-room line the tube holds.
    const far = mkBot(w, 'torpedoBoat', 0, 0, 0);
    far.stats.equipment.heavyTorpedo.homingTurnRate = CONFIG.torpedo.homingTurnRate;
    const farMind = mkMind('raider');
    plot(farMind, track(port.now, { x: 950, y: 0, heading: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(far, farMind, port).fireSlot).not.toBe(slotOf(far, 'heavyTorpedo'));
    // A LOW rung barely widens it at all — a slow turn needs a long run-up, so
    // the same 600u plot is still fiction at tier II (1300 − π·540 < 250).
    const early = mkBot(w, 'torpedoBoat', 0, 0, 0);
    early.stats.equipment.heavyTorpedo.homingTurnRate = 0.125;
    const earlyMind = mkMind('raider');
    plot(earlyMind, track(port.now, at600));
    expect(COMBAT_BRAIN.decide(early, earlyMind, port).fireSlot).toBe(slotOf(early, 'gun'));
  });

  it('starShells.dazzle: the flare turns OFFENSIVE — fired at a LIVE contact inside sight', () => {
    const w = openWorld(407);
    const port = fakePort(w);
    const dazzle = mkBot(w, 'battleship', 0, 0, 0);
    dazzle.stats.equipment.starShells.dazzle = true;
    const dazzleMind = mkMind('siege');
    plot(dazzleMind, track(port.now, { x: 200, y: 0, live: true, speed: 10 }));
    const d = COMBAT_BRAIN.decide(dazzle, dazzleMind, port);
    expect(d.fireSlot).toBe(slotOf(dazzle, 'starShells'));
    expect(d.aimDist).toBeCloseTo(200, 6);
    // Without the verb, a live contact never draws a flare (it gets shot at).
    const base = mkBot(w, 'battleship', 0, 0, 0);
    const baseMind = mkMind('siege');
    plot(baseMind, track(port.now, { x: 200, y: 0, live: true, speed: 10 }));
    expect(COMBAT_BRAIN.decide(base, baseMind, port).fireSlot).not.toBe(slotOf(base, 'starShells'));
  });

  it('starShells.phosphor: prefers the SLOW target; dazzle alone takes the nearest', () => {
    const w = openWorld(408);
    const port = fakePort(w);
    const plots = (m: BotMind): void => {
      plot(m, track(port.now, { id: 'slow', x: 0, y: 300, live: true, speed: 5 }));
      plot(m, track(port.now, { id: 'fast', x: 150, y: 0, live: true, speed: 40 }));
    };
    const phos = mkBot(w, 'battleship', 0, 0, 0);
    phos.stats.equipment.starShells.phosphor = true;
    const phosMind = mkMind('siege');
    plots(phosMind);
    const dp = COMBAT_BRAIN.decide(phos, phosMind, port);
    expect(dp.fireSlot).toBe(slotOf(phos, 'starShells'));
    expect(dp.aimDist).toBeCloseTo(300, 6); // the slow one — a DoT zone needs a hull that stays
    const daz = mkBot(w, 'battleship', 0, 0, 0);
    daz.stats.equipment.starShells.dazzle = true;
    const dazMind = mkMind('siege');
    plots(dazMind);
    expect(COMBAT_BRAIN.decide(daz, dazMind, port).aimDist).toBeCloseTo(150, 6); // the nearest
  });

  it('starShells.phosphor: the x0.8 lit shrink caps how stale a sensor plot is worth', () => {
    const w = openWorld(409);
    const port = fakePort(w);
    // 3.4s of drift outruns the SHRUNKEN lit circle (132u / 45 u/s ≈ 2.93s)
    // but not the full one — so base lights the plot and phosphor holds.
    const stale = { x: 500, y: 0, live: false, seenAt: port.now - 3400 };
    const base = mkBot(w, 'battleship', 0, 0, 0);
    const baseMind = mkMind('siege');
    plot(baseMind, track(port.now, stale));
    expect(COMBAT_BRAIN.decide(base, baseMind, port).fireSlot).toBe(slotOf(base, 'starShells'));
    const phos = mkBot(w, 'battleship', 0, 0, 0);
    phos.stats.equipment.starShells.phosphor = true;
    const phosMind = mkMind('siege');
    plot(phosMind, track(port.now, stale));
    expect(COMBAT_BRAIN.decide(phos, phosMind, port).fireSlot).not.toBe(slotOf(phos, 'starShells'));
  });

  it('starShells.phosphor never CLOSES the sensor window for a reluctant holder', () => {
    // REGRESSION (review gate, cycle 110). A non-eager holder waits 2x
    // (3000ms) before spending a flare, but the phosphor cap refuses anything
    // staler than 132u / 45 u/s = 2933ms — the window was empty by 67ms, so
    // buying PHOSPHOR silently deleted the sensor flare for `bulwark`, a hull
    // that carries star shells natively. Reluctance now degrades to the eager
    // floor instead of to nothing. Without the fix this fires the gun.
    const w = openWorld(414);
    const port = fakePort(w);
    // Inside the cap, past the EAGER floor, short of the reluctant one.
    const stale = { x: 500, y: 0, live: false, seenAt: port.now - 2000 };
    const phos = mkBot(w, 'battleship', 0, 0, 0);
    phos.stats.equipment.starShells.phosphor = true;
    const phosMind = mkMind('bulwark'); // appetite 1.2 — reluctant, not eager
    plot(phosMind, track(port.now, stale));
    expect(COMBAT_BRAIN.decide(phos, phosMind, port).fireSlot).toBe(slotOf(phos, 'starShells'));
  });

  it('CAPTIVE MINES keeps the base mine UNCONDITIONAL withdrawal lay', () => {
    // REGRESSION (review gate, cycle 110). `mineWant` lays astern on
    // `disengage` at any appetite and with NO target; the captive branch ran
    // its fleet/no-target refusal FIRST, so a trapper fleeing an attacker it
    // has lost in fog laid nothing where a contact mine always laid. A captive
    // mine trips hostile-only in a 144u ring, so the blind astern lay is at
    // least as valid. Without the fix fireSlot is not the mine.
    const w = openWorld(415);
    const port = fakePort(w);
    const cap = mkBot(w, 'mineLayer', 0, 0, 0);
    const rack = swapRack(cap, 'captiveMines');
    cap.hp = cap.stats.maxHp * 0.1; // forces `disengage`
    const capMind = mkMind('trapper'); // no target plotted at all
    expect(COMBAT_BRAIN.decide(cap, capMind, port).fireSlot).toBe(rack);
  });

  // RE-CUT, NOT DELETED (Story 8.13, epic-8 amendment 81). Cycle 110's finding
  // was that a layer holding BOTH verbs on ONE rack lost the fouling widening,
  // because `mineWant` handed the whole decision to the captive branch —
  // adding a card made the bot worse. The verbs are separate LINES with
  // separate racks now, so the cross-branch hazard is gone by construction and
  // the widening belongs to the FOULING rack alone. The pin therefore proves
  // the new shape: a layer carrying both racks still lays the FOULING one at
  // 450u closing, and the captive rack is not what fires.
  it('a layer carrying BOTH racks lays the FOULING one in the widened closing window', () => {
    const w = openWorld(416);
    const port = fakePort(w);
    const chase = { x: -450, y: 0, heading: 0, speed: 20 };
    const both = mkBot(w, 'mineLayer', 0, 0, 0);
    const captiveRack = swapRack(both, 'captiveMines');
    const foulRack = fitExtra(both, 'foulingMines', 4);
    const bothMind = mkMind('forager'); // NEUTRAL appetite: the reactive branch
    plot(bothMind, track(port.now, chase));
    const d = COMBAT_BRAIN.decide(both, bothMind, port);
    expect(d.fireSlot).toBe(foulRack);
    expect(d.fireSlot).not.toBe(captiveRack);
  });

  // THE PREPARED LAY + THE FIELD-CHURN BOUND (Eric ruling 2026-08-20, cycle
  // 111): a hull that hangs back seeds its traps BEFORE they are needed, and
  // no lay of any kind may reach addMine's silent oldest-mine eviction.
  it('PREPARED LAY: an EAGER layer seeds a thin field with NO target, from a safe posture', () => {
    const w = openWorld(417);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 1.1); // off-axis heading on purpose
    const mind = mkMind('trapper'); // EAGER mines; no contacts -> reposition
    viewWithOwnMines(mind, 1); // one trap down, reserve (3) not reached
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBe(slotOf(rec, 'navalMines'));
    // The drop is the ordinary astern placement — geometry is the tactic's,
    // never the occasion's.
    const center = wrapAngle(rec.state.heading + REAR_SECTOR.offset);
    expect(inArc(d.aim, center, REAR_SECTOR.halfArc)).toBe(true);
    expect(d.aimDist).toBeCloseTo(CONFIG.mine.placeRange * 0.5, 6);
  });

  it('PREPARED LAY: CAPTIVE opens the occasion at NEUTRAL appetite — a plain rack stays reactive', () => {
    const w = openWorld(418);
    const port = fakePort(w);
    // Forager (mine appetite 1.4: neutral, NOT eager) holding CAPTIVE: a
    // 144u-trip torpedo launcher works with nobody following, so it is
    // seeded while safe — the doctrine ADDS the occasion.
    const cap = mkBot(w, 'mineLayer', 0, 0, 0);
    const capRack = swapRack(cap, 'captiveMines');
    const capMind = mkMind('forager'); // no contacts -> reposition
    viewWithOwnMines(capMind, 0);
    const d = COMBAT_BRAIN.decide(cap, capMind, port);
    expect(d.fireSlot).toBe(capRack);
    expect(d.aimDist).toBeCloseTo(CONFIG.mine.placeRange, 6); // captive: FULL reach
    // The same forager WITHOUT the doctrine does not lay into empty water —
    // a contact mine needs something following you — and sites its recon
    // buoy instead, exactly as before this cycle.
    const plain = mkBot(w, 'mineLayer', 0, 0, 0);
    const plainMind = mkMind('forager');
    viewWithOwnMines(plainMind, 0);
    expect(COMBAT_BRAIN.decide(plain, plainMind, port).fireSlot).toBe(slotOf(plain, 'radarBuoy'));
  });

  it('PREPARED LAY stops at the reserve; the REACTIVE lay still fires there (adds, never removes)', () => {
    const w = openWorld(419);
    const port = fakePort(w);
    // At the reserve, idle: no prepared lay — the reserve is the bot's own
    // restraint on seeding water with nobody in sight.
    const idle = mkBot(w, 'mineLayer', 0, 0, 0);
    const idleMind = mkMind('trapper'); // no contacts -> reposition
    viewWithOwnMines(idleMind, CONFIG.bots.preparedMineReserve);
    expect(COMBAT_BRAIN.decide(idle, idleMind, port).fireSlot).not.toBe(slotOf(idle, 'navalMines'));
    // The SAME board state with a pursuer closing astern: the reactive lay
    // fires — prepared ADDED an occasion and removed none.
    const chased = mkBot(w, 'mineLayer', 0, 0, 0);
    const chasedMind = mkMind('trapper');
    viewWithOwnMines(chasedMind, CONFIG.bots.preparedMineReserve);
    plot(chasedMind, track(port.now, { x: -200, y: 0, heading: 0, speed: 20 }));
    expect(COMBAT_BRAIN.decide(chased, chasedMind, port).fireSlot).toBe(slotOf(chased, 'navalMines'));
    // And the unconditional withdrawal lay holds at the reserve too.
    const fleeing = mkBot(w, 'mineLayer', 0, 0, 0);
    fleeing.hp = fleeing.stats.maxHp * 0.1;
    const fleeingMind = mkMind('trapper');
    viewWithOwnMines(fleeingMind, CONFIG.bots.preparedMineReserve);
    expect(COMBAT_BRAIN.decide(fleeing, fleeingMind, port).fireSlot).toBe(slotOf(fleeing, 'navalMines'));
  });

  // FLIPPED, NOT DELETED (Story 8.4, FR57/AR48). This case used to prove the
  // FIELD-CHURN BOUND: with the board at `maxLive` a bot refused every lay,
  // because `addMine` would have silently evicted the oldest trap of the field
  // it was fleeing toward. Story 8.4 deleted the cap and the eviction, so the
  // refusal has nothing left to protect and `mineFieldFull` is gone. The pin
  // now asserts the new rule — a big board never refuses a lay — so the
  // behaviour stays covered in the direction it actually runs.
  it('NO CAP REFUSAL: a huge own field never blocks a lay — reactive and captive alike', () => {
    const w = openWorld(420);
    const port = fakePort(w);
    const big = 99; // far past every cap the game used to carry
    // Withdrawing — the strongest reactive occasion there is — with a board of
    // 99 own mines: the lay fires.
    const flee = mkBot(w, 'mineLayer', 0, 0, 0);
    flee.hp = flee.stats.maxHp * 0.1;
    const fleeMind = mkMind('trapper');
    viewWithOwnMines(fleeMind, big);
    expect(COMBAT_BRAIN.decide(flee, fleeMind, port).fireSlot).toBe(slotOf(flee, 'navalMines'));
    // Same on the captive branch.
    const capFull = mkBot(w, 'mineLayer', 0, 0, 0);
    const capFullRack = swapRack(capFull, 'captiveMines');
    capFull.hp = capFull.stats.maxHp * 0.1;
    const capFullMind = mkMind('trapper');
    viewWithOwnMines(capFullMind, big);
    expect(COMBAT_BRAIN.decide(capFull, capFullMind, port).fireSlot).toBe(capFullRack);
  });

  // The rung means "how choked is the pattern", not "how wide is a designed
  // fan" — the fan died at cycle 114 and the ladder was re-cut on 2026-08-27
  // (zero overlap at rung 1, convergence at rung 5). The gate's polarity is
  // unchanged and still correct: a wide shotgun tolerates a stale plot, a
  // converging point weapon does not.
  it('broadside.spreadRung: the wide base pattern may take a just-lost plot; a choked one demands live', () => {
    const w = openWorld(410);
    const port = fakePort(w);
    // Abeam, disclosed course, JUST lost — and PERSISTENT (held a full sweep
    // revolution), so the jamming counter is satisfied and the rung alone
    // decides.
    const justLost = {
      x: 0, y: 400, heading: 0, speed: 20, live: false,
      seenAt: port.now, firstSeenAt: port.now - 5000,
    };
    const wide = mkBot(w, 'battleship', 0, 0, 0);
    const wideMind = mkMind('bulwark');
    plot(wideMind, track(port.now, justLost));
    expect(COMBAT_BRAIN.decide(wide, wideMind, port).fireSlot).toBe(slotOf(wide, 'broadside'));
    const tight = mkBot(w, 'battleship', 0, 0, 0);
    tight.stats.equipment.broadside.spreadRung = 3;
    const tightMind = mkMind('bulwark');
    plot(tightMind, track(port.now, justLost));
    expect(COMBAT_BRAIN.decide(tight, tightMind, port).fireSlot).toBe(slotOf(tight, 'gun'));
    // And even the wide base pattern refuses a plot that has drifted too long.
    const old = mkBot(w, 'battleship', 0, 0, 0);
    const oldMind = mkMind('bulwark');
    plot(oldMind, track(port.now, { ...justLost, seenAt: port.now - 2000 }));
    expect(COMBAT_BRAIN.decide(old, oldMind, port).fireSlot).toBe(slotOf(old, 'gun'));
  });

  it('TRACK PERSISTENCE gates the 30s reloads, never the gun (blip shooting is a skill)', () => {
    const w = openWorld(411);
    const port = fakePort(w);
    // Actionable (past reactionMs) but NOT persistent: a young fog plot —
    // exactly what a jamming buoy's fakes look like. The tube holds, the gun
    // does not.
    const young = { x: 150, y: 0, heading: 0, speed: 0, live: false, firstSeenAt: port.now - 1600 };
    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const youngMind = mkMind('duelist');
    plot(youngMind, track(port.now, young));
    expect(COMBAT_BRAIN.decide(tb, youngMind, port).fireSlot).toBe(slotOf(tb, 'gun'));
    // The same plot held past one sweep revolution commits the tube.
    const held = mkBot(w, 'torpedoBoat', 0, 0, 0);
    const heldMind = mkMind('duelist');
    plot(heldMind, track(port.now, { ...young, firstSeenAt: port.now - 5000 }));
    expect(COMBAT_BRAIN.decide(held, heldMind, port).fireSlot).toBe(slotOf(held, 'heavyTorpedo'));
  });

  it('THE RADAR BUOY: recon when nothing is tracked, astern at full placeRange', () => {
    const w = openWorld(412);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 1.1); // off-axis heading on purpose
    const mind = mkMind('trapper'); // no contacts: reposition
    // Field at the prepared reserve (cycle 111): the prepared MINE lay —
    // which an eager trapper would otherwise spend this safe tick on —
    // declines, and the recon buoy gets the tick exactly as before.
    viewWithOwnMines(mind, CONFIG.bots.preparedMineReserve);
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBe(slotOf(rec, 'radarBuoy'));
    const center = wrapAngle(rec.state.heading + REAR_SECTOR.offset);
    expect(inArc(d.aim, center, REAR_SECTOR.halfArc)).toBe(true);
    expect(d.aimDist).toBeCloseTo(CONFIG.mine.placeRange, 6);
    // Engaged, base doctrine: recon is over — no buoy while a target is held.
    const busy = mkBot(w, 'mineLayer', 0, 0, 0);
    const busyMind = mkMind('trapper');
    plot(busyMind, track(port.now, { x: 300, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(busy, busyMind, port).fireSlot).toBe(slotOf(busy, 'gun'));
    // Blocked water: pinned at the rim with the rack pointing off the map,
    // the drop is refused and no click is burned.
    const rim = mkBot(w, 'mineLayer', w.map.radius - 20, 0, Math.PI);
    expect(COMBAT_BRAIN.decide(rim, mkMind('trapper'), port).fireSlot).toBeNull();
  });

  it('radarBuoy.jamming sites as COVER in contact; radarBuoy.gun sites as a PICKET in reach', () => {
    const w = openWorld(413);
    const port = fakePort(w);
    const engaged = { x: 300, y: 0, heading: 0, speed: 0 }; // ahead: no mine play
    // Jamming: dropped exactly when a target is held (fakes over the fight)...
    const jam = mkBot(w, 'mineLayer', 0, 0, 0);
    jam.stats.equipment.radarBuoy.jamming = true;
    const jamMind = mkMind('trapper');
    plot(jamMind, track(port.now, engaged));
    expect(COMBAT_BRAIN.decide(jam, jamMind, port).fireSlot).toBe(slotOf(jam, 'radarBuoy'));
    // ...AND still as idle recon, because both buoy verbs are pure ADDS: a
    // jamming buoy relays to its owner exactly as a plain one does, so the
    // doctrine adds the COVER occasion without taking the RECON one away.
    // Buying a card must never make a buoy worse at the job it already had.
    const jamIdle = mkBot(w, 'mineLayer', 0, 0, 0);
    jamIdle.stats.equipment.radarBuoy.jamming = true;
    const jamIdleMind = mkMind('trapper');
    // Field at the prepared reserve, so the cycle-111 prepared mine lay
    // yields the idle tick to the buoy (the behaviour under test here).
    viewWithOwnMines(jamIdleMind, CONFIG.bots.preparedMineReserve);
    expect(COMBAT_BRAIN.decide(jamIdle, jamIdleMind, port).fireSlot).toBe(
      slotOf(jamIdle, 'radarBuoy'),
    );
    // Gun buoy: a picket — only when the tracked hull is inside the reach its
    // own gun could serve from an astern drop.
    const gunNear = mkBot(w, 'mineLayer', 0, 0, 0);
    gunNear.stats.equipment.radarBuoy.gun = true;
    const gunNearMind = mkMind('trapper');
    plot(gunNearMind, track(port.now, engaged));
    expect(COMBAT_BRAIN.decide(gunNear, gunNearMind, port).fireSlot).toBe(slotOf(gunNear, 'radarBuoy'));
    const gunFar = mkBot(w, 'mineLayer', 0, 0, 0);
    gunFar.stats.equipment.radarBuoy.gun = true;
    const gunFarMind = mkMind('trapper');
    plot(gunFarMind, track(port.now, { x: 600, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(gunFar, gunFarMind, port).fireSlot).toBe(slotOf(gunFar, 'gun'));
  });

  it('BUOY VS MINE, SAME TICK: the mine answers the immediate threat first', () => {
    const w = openWorld(414);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 0);
    rec.stats.equipment.radarBuoy.jamming = true; // the buoy WANTS this tick too
    rec.hp = rec.stats.maxHp * 0.1; // disengage: the mine wants it as well
    const mind = mkMind('trapper');
    plot(mind, track(port.now, { x: -200, y: 0, heading: 0, speed: 20 }));
    // Trapper's appetite ranks mine above buoy, so the trap wins the tick and
    // the buoy waits for the next one.
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBe(slotOf(rec, 'navalMines'));
  });

  it('THE BAND PULL: a loaded short-reach weapon eases the band in, and reverts when it empties', () => {
    const w = openWorld(415);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const tube = fitExtra(rec, 'heavyTorpedo');
    const siege = profileOf('siege');
    const band = engagementBand(siege, rec.stats);
    // Loaded: the torpedo's 250u credible reach sits under siege's near edge,
    // so the pulled edge lands exactly halfway toward it — bounded, so the
    // profile fractions stay the anchor and siege never becomes a duelist.
    const loaded = pullBand(band, readyShotReaches(rec, rec.stats));
    expect(loaded.min).toBeCloseTo((band.min + 250) / 2, 6);
    expect(loaded.max).toBe(band.max);
    // Tube empty: the pull is gone the moment the round is (only-while-loaded).
    rec.loadout[tube].state = { n: 0, reloadMsLeft: 30000 };
    expect(pullBand(band, readyShotReaches(rec, rec.stats))).toEqual(band);
  });

  // CYCLE-148 REVIEW GATE, P3 — THE BELT IS A SHOT SLOT NOW. `readyShotReaches`
  // skipped every consumable on the claim that no consumable line was a 'shot'
  // tactic; Story 8.13 put the SUPERCAV TORPEDO on the belt (epic-8 amendment
  // 74) and made that claim false. A bot that will genuinely fire the stack was
  // steering to a band computed as though it had only its gun.
  it('THE BELT PULLS TOO: a ready SUPERCAV stack contributes its reach', () => {
    const w = openWorld(416);
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    // Strip the hull back to the GUN alone, so the only thing that can move the
    // band is the belt.
    for (let i = 0; i < rec.loadout.length; i += 1) {
      if (rec.loadout[i].equipmentId !== 'gun') rec.loadout[i] = { equipmentId: null, state: null };
    }
    expect(readyShotReaches(rec, rec.stats)).toEqual([rec.stats.equipment.gun.rangeU]);

    w.applyCard(rec, 'supercavTorpedo');
    expect(slotOf(rec, 'supercavTorpedo')).toBeGreaterThanOrEqual(0);
    const reaches = readyShotReaches(rec, rec.stats);
    // 250 u is the straight-runner's credible reach (ai/equipment's
    // TORPEDO_CREDIBLE_U — the supercav never homes, so the gate never widens).
    expect(reaches).toContain(250);

    // ...and it actually moves the band: a siege battleship holding a knife-
    // range fish eases its near edge in, exactly as a fitted tube does.
    const band = engagementBand(profileOf('siege'), rec.stats);
    expect(pullBand(band, reaches).min).toBeCloseTo((band.min + 250) / 2, 6);
  });
});

describe('END TO END — a real World full of bots, stepped for half a match-minute', () => {
  it('they move, acquire, fire, take damage, and do not beach', () => {
    const w = new World(3101, 8); // ISLANDS INTACT: beaching is the point
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) ids.push(w.addBot(undefined, undefined).id);
    // Gather them into open water so they meet inside the 30s window rather
    // than spending it crossing the spawn ring. The staging area is chosen by
    // the SAME island predicate the sim uses, so a mapgen retune moves the
    // arena instead of silently turning this into a beaching test.
    const ring = 300;
    const hub = stagingPoint(w, ring + 80);
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      const rec = w.ships.get(id)!;
      rec.state.x = hub.x + Math.cos(a) * ring;
      rec.state.y = hub.y + Math.sin(a) * ring;
      rec.state.heading = wrapAngle(a + Math.PI); // pointed at each other
      rec.prevPose = { ...rec.state };
    });

    const start = ids.map((id) => ({ ...w.ships.get(id)!.state }));
    let shellsSeen = 0;
    let landTicks = 0;
    let botTicks = 0;
    let hurtSeen = 0;
    const TICKS = 600; // 30 s
    for (let t = 0; t < TICKS; t += 1) {
      w.step();
      shellsSeen = Math.max(shellsSeen, w.shells.size);
      for (const id of ids) {
        const rec = w.ships.get(id);
        if (!rec) continue;
        botTicks += 1;
        // Damage is sampled DURING the run, never read off the final state: a
        // waiting-phase respawn restores hp, so a last-tick reading could show
        // a full hull that has been shot to pieces twice.
        if (rec.hp < rec.stats.maxHp) hurtSeen += 1;
        for (const isle of w.map.islands) {
          if (islandDistance(rec.state, isle) <= 0) {
            landTicks += 1;
            break;
          }
        }
      }
    }

    // MOVED: every hull is somewhere else, and under way. The bar was 100u
    // when this fixture ran under the retired silhouette grammar (the test
    // default before cycle 105 deleted the mode); on the production wire a
    // bot's radar tracks are identity-free centroids, engagements orbit
    // tighter, and the slowest hull of this seed covers ~79u in the 30s
    // window — still unmistakably under way, so the bar moves below that
    // measurement rather than above a fiction.
    ids.forEach((id, i) => {
      const rec = w.ships.get(id)!;
      expect(Math.hypot(rec.state.x - start[i].x, rec.state.y - start[i].y)).toBeGreaterThan(50);
    });
    // ACQUIRED + FIRED: clicks were requested and ordnance reached the water.
    const fired = ids.filter((id) => w.ships.get(id)!.input.fireSeq > 0);
    expect(fired.length).toBeGreaterThan(0);
    expect(shellsSeen).toBeGreaterThan(0);
    // CONNECTED: somebody took damage, which needs aim, lead and range all
    // right at once — this is the assertion a broken lead solve fails.
    expect(hurtSeen).toBeGreaterThan(0);
    // DID NOT BEACH: the spec's own bar is under 1% of bot-ticks in land
    // contact. A permanently beached bot would blow straight past it.
    expect(landTicks / botTicks).toBeLessThan(0.01);
    // AND THE PLUMBING HELD: bots never honk, never back-date a shot.
    for (const id of ids) {
      const rec = w.ships.get(id)!;
      expect(rec.input.hornSeq).toBe(0);
      expect(rec.input.fireT).toBe(0);
    }
  });

  // THE SIGNAL ITSELF, pinned before the behaviour that reads it: the bot
  // brain's un-beach trip is only as honest as ShipRecord.landContact, and
  // that flag means LAND, never "something stopped me" — a map-boundary press
  // is deliberately not contact (cycle 59 grounding ruling), which is exactly
  // the distinction a speed heuristic cannot make.
  it('ShipRecord.landContact is written every tick, and the MAP EDGE is not land', () => {
    const w = new World(3104, 8);
    const rec = w.ships.get(w.addBot(undefined, undefined).id)!;
    const berth = seawardBerth(w);

    // Open water, well clear of everything: no contact, ever.
    const clear = stagingPoint(w, 400);
    rec.state.x = clear.x;
    rec.state.y = clear.y;
    rec.prevPose = { ...rec.state };
    w.step();
    expect(rec.landContact).toBe(false);

    // Driven onto the coast: contact, from the resolver, not from a threshold.
    rec.state.x = berth.x;
    rec.state.y = berth.y;
    rec.state.heading = berth.heading;
    rec.state.speed = 0;
    rec.prevPose = { ...rec.state };
    let grounded = false;
    let fastestAground = 0;
    for (let t = 0; t < 60; t += 1) {
      w.step();
      if (!rec.landContact) continue;
      grounded = true;
      fastestAground = Math.max(fastestAground, Math.abs(rec.state.speed));
    }
    expect(grounded).toBe(true);
    // ...and a hull aground is still MAKING WAY — the grounding damp is a cap
    // (islandSpeedMult x maxSpeed), never a stop, which is the whole reason a
    // speed trip could not see this state and this flag can.
    expect(fastestAground).toBeGreaterThan(3);

    // Hard against the map edge, driving straight out: pinned, but NOT aground.
    const r = w.map.radius;
    rec.state.x = r - 2;
    rec.state.y = 0;
    rec.state.heading = 0;
    rec.state.speed = rec.stats.kinematics.maxSpeed;
    rec.prevPose = { ...rec.state };
    for (let t = 0; t < 20; t += 1) {
      w.step();
      expect(rec.landContact).toBe(false);
    }
  });

  // THE REGRESSION TEST FOR THE UN-BEACH DEFECT. Nothing here is hand-set: the
  // hull is placed in open water pointing at a coastline and driven into it by
  // its own brain, and every gram of the grounding is resolveCollisions'.
  //
  // The seaward face of the island is chosen DELIBERATELY: with nothing in
  // sight the brain patrols for the live ring centre, which sits on the far
  // side of that island, so the helm commands ahead into the rock tick after
  // tick for as long as the bot is left to it. Only the un-beach manoeuvre can
  // break that loop — which is why this test FAILS against the shipped 3 u/s
  // speed trip (the hull grounds and holds the grounding cap, 3-4x above the
  // trip, so the manoeuvre never arms) and passes against the contact bit.
  //
  // IT NOW RUNS PER HULL CLASS, because the hull is what the second half of
  // the defect was about. The first grounding fix (the contact bit) rescued
  // the two light hulls and left the BATTLESHIP where it found it: 1500ms of
  // full astern is less than the 0.97s a heavy hull spends merely killing its
  // forward way, so its "escape" ended +3.21u DEEPER in the rock, and the
  // campaign's worst unbroken run stayed at 272.2s against 10.1s/13.0s for the
  // torpedo boat and the mine layer. A regression test that takes whatever
  // class the enroll roll hands it could not see that, so it asks for each.
  //
  // MEASURED over this 60s drill, per class, across the four map seeds it
  //   runs (ticks in land contact, min-max over the twelve runs):
  //   contact bit only (before this cycle):  5.1-67.8%, mean 41.6%, worst
  //     unbroken run 5.4s (battleship, seed 3103), 3-26 episodes;
  //   + the three-stage manoeuvre:          15.2-36.4%, mean 25.4%, worst
  //     unbroken run 3.9s;
  //   + avoidance taking the helm (shipped): 0.1-29.4%, mean  8.0%, worst
  //     unbroken run 2.9s, and eight of the twelve runs under 10%.
  // The worst-run bar below is the MECHANISM'S OWN CONTRACT rather than a
  // measured number: arm within one dwell of touching, and back off for at
  // most one burst ceiling.
  const beachDrill = (seed: number, cls: ShipClassId) => {
    const w = new World(seed, 8); // ISLANDS INTACT: this test is the beaching
    const rec = botOfClass(w, cls);
    const berth = seawardBerth(w);
    rec.state.x = berth.x;
    rec.state.y = berth.y;
    rec.state.heading = berth.heading;
    rec.state.speed = 0;
    rec.prevPose = { ...rec.state };
    rec.landContact = false;

    const TICKS = 1200; // 60 s — many times over the whole un-beach contract
    let ticks = 0;
    let contactTicks = 0;
    let episodes = 0;
    let run = 0;
    let worstRun = 0;
    for (let t = 0; t < TICKS; t += 1) {
      w.step();
      if (!isAfloat(rec.lifecycle)) break; // sunk by a fleet hull: stop reading
      ticks += 1;
      if (rec.landContact) {
        contactTicks += 1;
        if (run === 0) episodes += 1;
        run += 1;
        worstRun = Math.max(worstRun, run);
      } else {
        run = 0;
      }
    }
    return { ticks, contactTicks, episodes, worstRunMs: worstRun * CONFIG.tick.simDtMs };
  };

  const DRILL_SEEDS = [3103, 3105, 3107, 3109];

  for (const cls of SHIP_CLASS_IDS) {
    it(`a ${cls} driven bow-on into a coastline UN-BEACHES ITSELF, and no run is unbounded`, () => {
      const runs = DRILL_SEEDS.map((seed) => beachDrill(seed, cls));
      let contactTicks = 0;
      let ticks = 0;
      for (const d of runs) {
        // IT REALLY GROUNDED — otherwise the rest of this proves nothing.
        expect(d.contactTicks).toBeGreaterThan(0);
        // AND IT REALLY GOT OFF, EVERY TIME, WITHIN THE MANOEUVRE'S OWN
        // BUDGET: one arming dwell to notice, one astern burst to leave.
        // Against the retired speed trip the hull grounded in the first few
        // seconds and NEVER left — one unbroken 57.8s run over this same 60s
        // window (96.4% of ticks in contact); against the contact bit alone a
        // battleship still held a 5.4s run here (67.8% of ticks).
        expect(d.worstRunMs).toBeLessThanOrEqual(CONFIG.bots.stuckMs + CONFIG.bots.unbeachAsternMaxMs);
        contactTicks += d.contactTicks;
        ticks += d.ticks;
      }
      // ...repeatedly and under its own power on the hardest seed, which is
      // what separates "it un-beaches" from "it happened to drift clear once".
      expect(Math.max(...runs.map((d) => d.episodes))).toBeGreaterThan(3);
      // AND THE METRONOME IS BROKEN — the assertion the exit-heading hold and
      // the avoidance weighting buy, and the one the previous fix explicitly
      // could not make. Measured per class over these four seeds: torpedo boat
      // 5.0%, battleship 13.2%, mine layer 6.2% (worst single run 29.4%,
      // battleship on seed 3107 — this drill is deliberately hostile: the
      // patrol bearing runs THROUGH the island the hull is parked against).
      expect(contactTicks / ticks).toBeLessThan(0.2);
    });
  }

  it('is deterministic per world seed — same seed, same water', () => {
    const run = (): string => {
      const w = new World(3102, 8);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) ids.push(w.addBot(undefined, undefined).id);
      for (let t = 0; t < 200; t += 1) w.step();
      return ids
        .map((id) => {
          const s = w.ships.get(id)!;
          return `${s.state.x.toFixed(4)}:${s.state.y.toFixed(4)}:${s.input.fireSeq}`;
        })
        .join('|');
    };
    expect(run()).toBe(run());
  });
});
