// STORY 11.2 REVIEW GATE — the server-side contracts of the anti-cheat fixes
// (the orchestrator's rulings F1, F3, F4). Each case names the leak it closes
// and fails with its fix removed.
//
//   F1  A radar paint's fuzz is salted from a room-private key, so the mask
//       of a hull an observer holds only as a PLAIN contact (exact pose, no
//       class) cannot be replayed for each hull id to read the class — and
//       likewise a wake's glint for the source's beam.
//   F3  A plain-hull handle never survives a gap in the observer's passes
//       (a disconnect): `World.forgetPlainVisits`.
//   F4  A torpedo that merely runs out of run is seen ending only where a
//       torpedo is seen (plus its owner), never at the splash reach.
//
// No mask, handle or reach value is pinned: every expectation is a relation
// between what the wire carried and what a keyless client could compute, or
// between two reaches read from CONFIG.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  mulberry32,
  paintCoverage,
  paintSegmentCoverage,
  wrapPositive,
  type BlipEvent,
  type BoomEvent,
  type FrameMsg,
  type HullCoverage,
  type HullId,
  type ShellState,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { SIGNAL_REGISTRY, type FoggedSignalContext, type WakeSubject } from '../game/signals.js';
import { flatRaster } from './islandFixture.js';
import { wirePaint, wireWakePaint } from './paintFixture.js';

const CELL = CONFIG.vision.radarCellU;
const V = CONFIG.vision;
/** The middle of the PLAIN band: seen by eye as a hull, class withheld. */
const PLAIN_D = (V.sight + V.hullSight) / 2;

function bareWorld(seed: number, opts: WorldOptions = {}): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, heading = 0, hull: HullId = SHIP_CLASS_IDS[0]): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  Object.assign(rec.state, { x, y, heading, speed: 0 });
  return rec;
}

/** Put the observer's beam across `target` this tick. */
function sweepOnto(me: ShipRecord, target: { x: number; y: number }): void {
  const brg = Math.atan2(target.y - me.state.y, target.x - me.state.x);
  me.prevSweepAngle = wrapPositive(brg - 0.02);
  me.sweepAngle = wrapPositive(brg + 0.02);
}

const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');
const boomsOf = (f: FrameMsg): BoomEvent[] => f.events.filter((e): e is BoomEvent => e.k === 'boom');
const maskOf = (e: { gx: number; gy: number; w: number; h: number; bits: number[] }): HullCoverage => ({ gx: e.gx, gy: e.gy, w: e.w, h: e.h, bits: e.bits });
const same = (a: HullCoverage, b: HullCoverage): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A spread of exact (fractional) poses in the plain band around the origin. */
function plainPoses(n: number, seed: number): { x: number; y: number; heading: number; cls: HullId }[] {
  const g = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => {
    const ang = g.float(0, 2 * Math.PI);
    const d = g.float(V.sight * 1.1, V.hullSight * 0.9);
    return { x: Math.cos(ang) * d, y: Math.sin(ang) * d, heading: g.float(0, 2 * Math.PI), cls: SHIP_CLASS_IDS[i % SHIP_CLASS_IDS.length] };
  });
}

/** The observer `paintOne` paints for — `a` at the origin, whose own position a
 *  modified client knows exactly (Story 11.3: the replay smears about it). */
const ORIGIN = { x: 0, y: 0 };

/** One plain-band hull painted for observer `a` at the origin: the frame's
 *  plain contact (what the eye gives) and blip (what the radar gives). */
function paintOne(w: World, pose: { x: number; y: number; heading: number; cls: HullId }): { pc: NonNullable<FrameMsg['pc']>[number]; blip: BlipEvent } {
  const a = w.ships.get('a') ?? place(w, 'a', 0, 0);
  w.removeShip('t');
  const t = place(w, 't', pose.x, pose.y, pose.heading, pose.cls);
  sweepOnto(a, t.state);
  const f = buildFrame(w, 'a');
  expect(f.contacts).toHaveLength(0); // premise: the class is NOT disclosed by eye
  expect(f.pc).toHaveLength(1);
  const blips = blipsOf(f);
  expect(blips).toHaveLength(1);
  return { pc: f.pc![0], blip: blips[0] };
}

describe('F1 — the radar paint of a plain hull does not give up its class to a replay', () => {
  const SAMPLES = 48;

  it('THE REPLAY ATTACK FAILS: from a plain contact\'s exact pose and the blip\'s own `t`, the public (unsalted) pipeline run for every hull id reproduces the wire mask for almost no paint — while the server\'s own salted pipeline reproduces every one', () => {
    const w = bareWorld(71);
    let replayed = 0;
    for (const pose of plainPoses(SAMPLES, 0xa11)) {
      const { pc, blip } = paintOne(w, pose);
      // Everything a modified client holds: pc.x / pc.y / pc.heading, blip.t, the lattice, the four hulls.
      const guesses = SHIP_CLASS_IDS.filter((cls) => same(paintCoverage(cls, pc.x, pc.y, pc.heading, CELL, blip.t, 0, ORIGIN.x, ORIGIN.y), maskOf(blip)));
      if (guesses.length > 0) replayed += 1;
      // The wiring: the wire mask IS the shared pipeline under this room's salt.
      expect(maskOf(blip)).toEqual(wirePaint(w, ORIGIN, pose.cls, pose.x, pose.y, pose.heading));
    }
    expect(replayed).toBeLessThan(SAMPLES / 4);
  });

  it('the salt is ROOM-PRIVATE and reproducible: two rooms with different keys paint the same hull at the same pose and tick differently (for most poses); the same key repaints it identically', () => {
    const keyed = (byte: number): World => bareWorld(72, { dispersionKey: new Uint8Array(32).fill(byte) });
    const [w1, w2, w1again] = [keyed(1), keyed(2), keyed(1)];
    let differ = 0;
    for (const pose of plainPoses(SAMPLES, 0xb22)) {
      const m1 = maskOf(paintOne(w1, pose).blip);
      const m2 = maskOf(paintOne(w2, pose).blip); // interleaved: the mask memo must not leak across rooms
      expect(maskOf(paintOne(w1again, pose).blip)).toEqual(m1);
      if (!same(m1, m2)) differ += 1;
    }
    expect(differ).toBeGreaterThan(SAMPLES / 2);
  });

  it('WAKES: a `wk` mask is glinted under the room\'s salt too — the public pipeline replayed over the segment\'s exact endpoints at every candidate width reproduces it for few segments', () => {
    const w = bareWorld(73);
    const a = place(w, 'a', 0, 0);
    const ctx = { mode: 'fogged', me: a, observerId: 'a', now: w.now, paintSaltOf: w.paintSaltFor } as unknown as FoggedSignalContext;
    const g = mulberry32(0xc33);
    // Candidate widths: every hull's own beam (what a class lookup would try).
    const widths = SHIP_CLASS_IDS.map((cls) => CONFIG.shipClasses[cls].hull.beam);
    let replayed = 0;
    let glinted = 0;
    for (let k = 0; k < SAMPLES; k++) {
      const ax = g.float(-900, 900);
      const ay = g.float(-900, 900);
      const ang = g.float(0, 2 * Math.PI);
      const len = g.float(40, 90); // long enough to carry flank cells to glint
      const widthU = widths[k % widths.length];
      const seg: WakeSubject = { x: ax + (Math.cos(ang) * len) / 2, y: ay + (Math.sin(ang) * len) / 2, ax, ay, bx: ax + Math.cos(ang) * len, by: ay + Math.sin(ang) * len, bucket: 0, widthU };
      const wire = maskOf(SIGNAL_REGISTRY.wk.materialize(ctx, seg));
      expect(wire).toEqual(wireWakePaint(w, a.state, seg.ax, seg.ay, seg.bx, seg.by, widthU));
      const publicMask = paintSegmentCoverage(seg.ax, seg.ay, seg.bx, seg.by, widthU, CELL, w.now, 0, a.state.x, a.state.y);
      // Only a segment whose glint actually differs under another seed can tell the two apart.
      if (!same(publicMask, paintSegmentCoverage(seg.ax, seg.ay, seg.bx, seg.by, widthU, CELL, w.now + CONFIG.tick.simDtMs, 0, a.state.x, a.state.y))) glinted += 1;
      if (widths.some((cand) => same(paintSegmentCoverage(seg.ax, seg.ay, seg.bx, seg.by, cand, CELL, w.now, 0, a.state.x, a.state.y), wire))) replayed += 1;
    }
    expect(glinted).toBeGreaterThan(SAMPLES / 2); // premise: these segments DO scintillate
    expect(replayed).toBeLessThan(glinted / 2);
  });
});

describe('F3 — a plain-hull handle does not link a sighting before a gap in the observer\'s passes to one after it', () => {
  it('forgetPlainVisits ends every plain visit of that observer: the same hull, still in the band, comes back under a fresh handle — and another observer\'s handle is untouched', () => {
    const w = bareWorld(74);
    place(w, 'a', 0, 0);
    place(w, 'c', 0, 40);
    place(w, 't', PLAIN_D, 0);
    const handleFor = (id: string): string => {
      const f = buildFrame(w, id);
      expect(f.pc).toHaveLength(1);
      return f.pc![0].h;
    };
    const before = { a: handleFor('a'), c: handleFor('c') };
    expect(handleFor('a')).toBe(before.a); // within a visit the handle holds
    // The captain's socket drops: no frame — so no perception pass — is built for 'a' until it resumes.
    w.forgetPlainVisits('a');
    expect(handleFor('a')).not.toBe(before.a);
    expect(handleFor('c')).toBe(before.c);
    expect(() => w.forgetPlainVisits('nobody')).not.toThrow();
  });
});

describe('F4 — a torpedo that runs out of run is seen ending only where a torpedo is seen', () => {
  /** A torpedo of `owner`'s with one step of run left, heading east from (x, y). */
  function spentTorpedo(w: World, owner: string, x: number, y: number): ShellState {
    const speed = CONFIG.torpedo.speed;
    const shell: ShellState = {
      id: 't1', ownerId: owner, x, y, vx: speed, vy: 0, distLeft: (speed * CONFIG.tick.simDtMs) / 2000, bornAt: w.now,
      kind: 'torp', family: null, damage: CONFIG.torpedo.damage, hitRadius: CONFIG.torpedo.hitRadius,
      targetX: null, targetY: null, burstRadius: 0, contactDamage: CONFIG.torpedo.damage, hits: CONFIG.torpedo.hits,
    };
    w.shells.set(shell.id, shell);
    return shell;
  }

  /** The reaches under test, as relations (never their values). */
  const NEAR = V.torpedoSight / 2; // inside the torpedo eye reach
  const FAR = (V.torpedoSight + V.splashSight) / 2; // past it, inside the splash reach

  function runOut(): { w: World; frames: Record<'owner' | 'near' | 'far', FrameMsg>; at: { x: number; y: number } } {
    const w = bareWorld(75);
    w.damageEnabled = false;
    const at = { x: 0, y: 0 };
    place(w, 'owner', at.x - FAR, at.y); // the launcher: far from where its torpedo dies
    place(w, 'near', at.x, at.y + NEAR);
    place(w, 'far', at.x + FAR, at.y);
    spentTorpedo(w, 'owner', at.x, at.y);
    w.step();
    expect(w.shells.has('t1')).toBe(false); // premise: it ran out this tick
    return { w, at, frames: { owner: buildFrame(w, 'owner'), near: buildFrame(w, 'near'), far: buildFrame(w, 'far') } };
  }

  it('premise: the torpedo eye reach is inside the splash reach (otherwise there is no band to gate)', () => {
    expect(V.torpedoSight).toBeLessThan(V.splashSight);
  });

  it('the run-out boom reaches an observer inside the torpedo eye reach and the OWNER (whose client must retire the track) — and NOT an observer who is inside the splash reach but could never have seen the torpedo', () => {
    const { frames } = runOut();
    expect(boomsOf(frames.near)).toHaveLength(1);
    expect(boomsOf(frames.owner)).toHaveLength(1);
    expect(boomsOf(frames.far)).toHaveLength(0);
  });

  it('the wire boom is the bare {k,id,x,y}: the server-internal owner tag never rides it, for a fogged observer or a spectator', () => {
    const { w, frames } = runOut();
    w.sinkShip('far', 'owner');
    const spectator = SIGNAL_REGISTRY.boom.materialize(
      { mode: 'spectator', me: undefined, observerId: 'ghost', now: w.now } as unknown as Parameters<typeof SIGNAL_REGISTRY.boom.materialize>[0],
      w.tickEvents.find((e) => e.k === 'boom')!,
    );
    for (const boom of [boomsOf(frames.near)[0], boomsOf(frames.owner)[0], spectator]) {
      expect(Object.keys(boom)).toEqual(['k', 'id', 'x', 'y']);
    }
  });

  it('an IMPACT keeps the splash reach: a torpedo that strikes a hull is seen exploding by the far observer', () => {
    const w = bareWorld(76);
    place(w, 'owner', -FAR, 0);
    place(w, 'far', FAR, 0);
    const victim = place(w, 'victim', 0, 0);
    const shell = spentTorpedo(w, 'owner', victim.state.x - CONFIG.shipClasses[victim.hullId].hull.length, 0);
    shell.distLeft = V.splashSight; // plenty of run: it reaches the hull
    let seen = 0;
    for (let i = 0; i < 40 && w.shells.has('t1'); i++) {
      w.step();
      seen += boomsOf(buildFrame(w, 'far')).length;
    }
    expect(w.shells.has('t1')).toBe(false);
    expect(seen).toBe(1);
  });
});
