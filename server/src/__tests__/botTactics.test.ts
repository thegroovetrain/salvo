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
  wrapAngle,
  type HullId,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { COMBAT_BRAIN, approachPoint } from '../game/ai/tactics.js';
import { profileOf } from '../game/ai/profiles.js';
import type { BotMind, BotProfileId, BotWorldPort, RememberedContact } from '../game/ai/types.js';

const BOW_SECTOR = sectorArcFor('torpedo');
const REAR_SECTOR = sectorArcFor('mine');

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
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
  };
}

function mkMind(profile: BotProfileId, seed = 7): BotMind {
  return {
    rng: mulberry32(seed),
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
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = rec.stats.kinematics.maxSpeed * 0.5;
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
    const rec = w.addBot();
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
    expect(d.fireSlot).toBeNull();
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
    mind.view = { contacts: [], events: [], mines: [{ ...ahead, own: false }], litZones: [], decoys: [] };
    mind.viewAt = -1; // not fresh: nothing is folded, only the mine probe reads it
    const dodged = COMBAT_BRAIN.decide(rec, mind, port);
    expect(dodged.rudder).toBeLessThan(0); // mine to port -> steer starboard
    mind.view = { contacts: [], events: [], mines: [{ ...ahead, own: true }], litZones: [], decoys: [] };
    const own = COMBAT_BRAIN.decide(rec, mind, port);
    expect(own.rudder).toBe(0); // an owner never trips its own rack
  });
});

describe('weapons — every shot is a LEGAL shot', () => {
  it('THE TORPEDO ARC IS TESTED FIRST: a target astern never advances the tube', () => {
    const w = openWorld(201);
    const port = fakePort(w);
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0); // bow due east
    const tube = slotOf(rec, 'torpedo');
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
    const rack = slotOf(rec, 'mine');
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
    // And `bulwark` never fires them at all (usesStarShells: false).
    const bulwark = mkMind('bulwark');
    plot(bulwark, track(port.now, { x: 500, y: 0, live: false, seenAt: port.now - 3000 }));
    expect(COMBAT_BRAIN.decide(rec, bulwark, port).fireSlot).not.toBe(flares);
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
    // A 45-second cannon reload is not spent on a plot that cannot be led.
    expect(blind.fireSlot).toBe(slotOf(rec, 'gun'));
    expect(COMBAT_BRAIN.decide(rec, led, port).fireSlot).toBe(slotOf(rec, 'cannon'));
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
    // Inside the scoring horizon (1.25R) but outside gun/cannon range (R).
    plot(mind, track(port.now, { x: rec.stats.gun.rangeU + 100, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBeNull();
  });

  it('abilities ride the act channel: a raider boosts out, a trapper drops a decoy', () => {
    const w = openWorld(208);
    const port = fakePort(w);
    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0);
    tb.hp = tb.stats.maxHp * 0.1; // below raider's 0.5 -> disengage
    const raider = mkMind('raider');
    plot(raider, track(port.now, { x: 200, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(tb, raider, port).actSlot).toBe(slotOf(tb, 'speedBoost'));
    const ml = mkBot(w, 'mineLayer', 0, 0, 0);
    ml.hp = ml.stats.maxHp * 0.1;
    const trapper = mkMind('trapper');
    plot(trapper, track(port.now, { x: 200, y: 0, speed: 0 }));
    expect(COMBAT_BRAIN.decide(ml, trapper, port).actSlot).toBe(slotOf(ml, 'decoyBuoy'));
    // Healthy: no ability spent.
    const healthy = mkBot(w, 'torpedoBoat', 0, 0, 0);
    expect(COMBAT_BRAIN.decide(healthy, raider, port).actSlot).toBeNull();
  });

  it('the frozen boarding room is not the brain\'s business — but a bot with no view still sails', () => {
    const w = openWorld(209);
    const port = fakePort(w);
    const rec = mkBot(w, 'mineLayer', 0, 0, 0);
    const mind = mkMind('forager'); // view null, contacts empty
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(d.fireSlot).toBeNull();
    expect(d.actSlot).toBeNull();
    expect(d.spendChoice).toBeNull();
    expect(Number.isFinite(d.aim)).toBe(true);
    expect(d.throttle).toBeGreaterThan(0);
  });
});

describe('END TO END — a real World full of bots, stepped for half a match-minute', () => {
  it('they move, acquire, fire, take damage, and do not beach', () => {
    const w = new World(3101, 8); // ISLANDS INTACT: beaching is the point
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) ids.push(w.addBot().id);
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

    // MOVED: every hull is somewhere else, and under way.
    ids.forEach((id, i) => {
      const rec = w.ships.get(id)!;
      expect(Math.hypot(rec.state.x - start[i].x, rec.state.y - start[i].y)).toBeGreaterThan(100);
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
    const rec = w.ships.get(w.addBot().id)!;
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
      for (let i = 0; i < 3; i += 1) ids.push(w.addBot().id);
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
