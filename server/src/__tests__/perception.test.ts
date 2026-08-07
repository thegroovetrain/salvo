// THE ANTI-CHEAT INVARIANT (the plan's marquee test), property-style, plus
// directed boundary/LOS/paint-window cases. The property: for every observer,
// in every frame, every contact and every event references ONLY what that
// observer's sight bubble ∪ this-tick radar paints ∪ lit zones the observer
// OWNS (Story 1.7 — plus the self-directed events: own dmg/sunk/spawn, own
// shells; the lit-zone CIRCLE itself is owner-always / radar-gated; Story
// 4.3's three DECLARED gunnery exceptions: shooter-private sp/hc at any
// range, and the mz flash inside the constant SIGHT*1.25 halo (Story 4.9
// moved it from 1.5) with island LOS; PV 23's 4th declared exception, the
// PUBLIC REGISTER `sunk` row:
// a human captain's sinking is identity-only public, a drone's reaches only
// a witness or its killer, and the per-observer `seen` flag may be present
// only when the witness predicate holds — see verifySunk; plus DAMAGE
// CONTROL's healer-private `heal` and the owner-only `repairHp` pool,
// neither of which may ever reach another observer; Story 4.4's FIFTH
// declared exception, the anonymous `sm` wounded-smoke pulse inside the same
// constant SIGHT*1.25 halo with island LOS — identity-free for EVERY
// observer, see the sm verifier; and Story 4.5's SIXTH declared exception,
// the bearing-only `fh` foghorn — bearing + a 4..8 volume BAND resolved as
// eighths of the LISTENER'S own intel range (Story 4.9, amendment 122) and
// floored at 4 on the wire, since bands 1-4 are one indistinguishable 100%
// plateau for every honest client (review fix), islands muffling the FLOORED
// band to max(5, floored + 2), never a position or id for any
// fogged observer, see the fh verifier). Story 4.9 also TIGHTENS three rows
// WITHIN the invariant: mines, torpedoes, and torpU updates now reveal at
// the DETECT range — 0.75 × the observer's effective sight, a strict subset
// of the sight bubble — so their oracles below bind them to the narrower
// gate (see `detected`); shells, decoys, booms, bursts, sunk-witness and
// spawns stay on truesight. The checks below
// are a deliberate test-local reimplementation of the
// visibility predicates so a refactor of perception.ts cannot silently agree
// with its own bug.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  HEAL_CHOICE,
  HORN_IDS,
  bearing,
  effectiveStats,
  hullSilhouette,
  mulberry32,
  resolveBoons,
  segPolygonHit,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type HullId,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
  type BoomEvent,
  type BoonFitEvent,
  type BurstEvent,
  type Island,
  type DamageEvent,
  type GameEvent,
  type FrameMsg,
  type HealEvent,
  type HitCallEvent,
  type PointEvent,
  type SpawnEvent,
  type SplashEvent,
  type SunkEvent,
  type TorpedoUpdateEvent,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
// Registry symbols are imported ONLY to ENUMERATE keys/rows for the completeness
// block below — never as a behavior oracle. Every visibility predicate in this
// file stays independently reimplemented (see the header), so a perception
// refactor cannot silently agree with its own bug via a row's own visible().
import { SIGNAL_REGISTRY } from '../game/signals.js';
import { circleIsland } from './islandFixture.js';

const TAU = Math.PI * 2;
const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DT = CONFIG.tick.simDtMs;
const SWEEP_PERIOD = 60000 / CONFIG.vision.sweepRpm; // ms per base revolution
const SWEEP_DELTA = (TAU * DT) / SWEEP_PERIOD;
const TICKS_PER_REV = Math.round(SWEEP_PERIOD / DT);

// ---------- test-local visibility reimplementation --------------------------

/** THE anti-cheat oracle for island LOS, INDEPENDENTLY REIMPLEMENTED: the raw
 *  concave-safe polygon test with NONE of islandBlocksSegment's broadphase or
 *  `core` early-outs. If either optimization ever changed an answer, this
 *  oracle would disagree and the invariant suite would fail. */
function clearLos(a: { x: number; y: number }, b: { x: number; y: number }, islands: readonly Island[]): boolean {
  return islands.every((isle) => segPolygonHit(a, b, isle.poly, 0) === null);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Per-observer EFFECTIVE ranges, recomputed here from the raw fitted-boon id
// list (deliberately NOT via me.stats / effectiveStats — the reimplementation
// rule). The ladder factors are the CATALOG's authored steps written out as
// literals (intelTruesight ×1.12/card, intelRadar ×1.15/card); the DAZZLE
// factor (Story 2.8) scales the OBSERVER's own sight while its dazzledUntil
// mark is live — mirrored independently from signals.sightOf.
function stacksOf(me: ShipRecord, boonId: string): number {
  let n = 0;
  for (const b of me.boons) if (b === boonId) n += 1;
  return n;
}

function effSight(me: ShipRecord, now: number): number {
  const base = SIGHT * 1.12 ** stacksOf(me, 'intelTruesight');
  return now < me.dazzledUntil ? base * CONFIG.starShells.dazzleSightFactor : base;
}

function effRadar(me: ShipRecord): number {
  return RADAR * 1.15 ** stacksOf(me, 'intelRadar');
}

function sighted(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return dist(me.state, p) <= effSight(me, w.now) && clearLos(me.state, p, w.map.islands);
}

// The Story 4.9 DETECT oracle (amendments 119/121), INDEPENDENTLY RE-DERIVED:
// 0.75 × the observer's effective sight (the 3/8 rung written out as a
// LITERAL — deliberately NOT CONFIG.vision.detectFactor and NEVER the
// production pointDetected), dazzle-scaled and boon-widened through effSight
// exactly as the ruling scales it, island LOS applied unchanged. Binds mines,
// torpedoes, and torpU updates; NON-VACUOUS by the directed cases below (a
// mine/torpedo at 300u — inside sight, outside detect — must be excluded).
function detected(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  return dist(me.state, p) <= 0.75 * effSight(me, w.now) && clearLos(me.state, p, w.map.islands);
}

// The Story 1.7 owned-zone reveal source, reimplemented test-locally (NEVER
// the production ownZoneCovers): a lit zone OWNED by the observer covers `p`
// iff dist(p, center) ≤ r — deliberately NO island-LOS term ("lit from above")
// and NEVER anyone else's zone.
function zoneCovers(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  for (const zone of w.litZones.values()) {
    if (zone.ownerId === me.id && dist(zone, p) <= zone.r) return true;
  }
  return false;
}

function inPaintWindow(me: ShipRecord, brg: number): boolean {
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  return wrapPositive(brg - me.prevSweepAngle) < window;
}

// ---------- world construction helpers ---------------------------------------

/** World whose islands are cleared for exact-geometry directed cases. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Open the observer's paint window around a bearing (without stepping). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

function injectShell(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  dir: number,
  distLeft: number,
  targeted = false,
  kind: 'shell' | 'torp' = 'shell',
): void {
  w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: Math.cos(dir) * CONFIG.gun.shellSpeed,
    vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
    distLeft,
    bornAt: w.now,
    kind,
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    // `targeted` mirrors the real gun: a burst point distLeft along the
    // bearing, so the invariant worlds exercise burst events too. Untargeted
    // is the contact-only legacy shape.
    targetX: targeted ? x + Math.cos(dir) * distLeft : null,
    targetY: targeted ? y + Math.sin(dir) * distLeft : null,
    burstRadius: targeted ? CONFIG.gun.burstRadius : 0,
    contactDamage: targeted ? CONFIG.gun.contactDamage : CONFIG.gun.damage,
  });
}

/** Drop a mine directly into world state (armed by default). */
function injectMine(w: World, id: string, ownerId: string, x: number, y: number, armedAt = 0): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt });
}

/** Drop a lit zone directly into world state (Story 1.7; far-future expiry). */
function injectZone(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  r = CONFIG.starShells.litRadius,
  until = 999_999,
  mode: 'standard' | 'incendiary' | 'dazzle' = 'standard',
): void {
  w.litZones.set(id, { id, ownerId, x, y, r, until, mode });
}

/** Drop a decoy buoy directly into world state (Story 1.8; far-future expiry).
 *  Mirrors spawnDecoy's drop-time snapshot (Story 4.2): the owner's hull id
 *  and heading frozen onto the record — mineLayer/0 when the owner has no
 *  ship in the world (a buoy legitimately outlives its owner). */
function injectDecoy(w: World, id: string, ownerId: string, x: number, y: number, until = 999_999): void {
  const owner = w.ships.get(ownerId);
  w.decoys.set(id, { id, ownerId, x, y, hullId: owner?.hullId ?? 'mineLayer', heading: owner?.state.heading ?? 0, until });
}

/** Push a raw world-emitted event onto the world's tick-event list — the exact
 *  buffer perception.forwardedEvents() dispatches, reached the same way the
 *  world's own step does (the field is private only to production callers). */
function emitWorldEvent(w: World, e: GameEvent): void {
  (w as unknown as { events: GameEvent[] }).events.push(e);
}

const blipsOf = (f: FrameMsg) => f.events.filter((e): e is BlipEvent => e.k === 'blip');
const shellsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'shell');
const boomsOf = (f: FrameMsg) => f.events.filter((e): e is BoomEvent => e.k === 'boom');

/**
 * Structural anti-cheat guard: a ballistic event may carry ONLY these keys. Any
 * extra field (a returning `ttl`/`distLeft`, or a launch position tag) is
 * range-derivable and would let a modified client solve back to the fogged
 * muzzle — so its mere PRESENCE fails the test. See BallisticEvent's note.
 */
const BALLISTIC_KEYS = ['id', 'k', 't', 'vx', 'vy', 'x', 'y'];
function assertBallisticShape(e: BallisticEvent): void {
  expect(Object.keys(e).sort()).toEqual(BALLISTIC_KEYS);
}

// ---------- directed cases: sight tier ---------------------------------------

describe('perception — sight tier boundaries (exact)', () => {
  it('a ship at exactly sight range is a contact (boundary inclusive)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT, 0, 1.5);
    const f = buildFrame(w, 'a');
    expect(f.contacts).toEqual([
      { id: 'b', x: b.state.x, y: b.state.y, heading: 1.5, speed: 0, cls: 'torpedoBoat' },
    ]);
  });

  it('a ship just outside sight range is invisible', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', SIGHT + 0.01, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
  });

  it('a ship inside sight but behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(75, 0, 30));
    place(w, 'a', 0, 0);
    place(w, 'b', 150, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    // ...and stepping aside restores the contact.
    w.ships.get('b')!.state.y = 120;
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('dead ships are never contacts; a viewer with no ship sees nothing', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.sinkShip('b');
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    const watcher = buildFrame(w, 'watcher');
    expect(watcher.contacts).toEqual([]);
    expect(watcher.events).toEqual([]);
  });
});

// ---------- directed cases: radar tier ---------------------------------------

describe('perception — radar paint window (exact)', () => {
  it('paints a ship in the annulus when the beam crosses its bearing — carrying its LIVE pose (Story 4.2)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0, 0.7);
    b.state.speed = 12; // the raw signed scalar rides the wire
    windowAround(a, 0);
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips).toEqual([
      { k: 'blip', id: 'b', x: b.state.x, y: b.state.y, t: w.now, cls: 'torpedoBoat', heading: 0.7, speed: 12 },
    ]);
  });

  it('does not paint outside the beam window', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0); // bearing 0
    windowAround(a, Math.PI); // beam on the far side
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('radar boundary is exact: paints at dist == radar, not just beyond', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', RADAR, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a')).map((e) => (e as SilhouetteBlipEvent).id)).toEqual(['b']);
    w.ships.get('b')!.state.x = RADAR + 0.01;
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('inside sight there is no paint (sighted, not blipped) — even when swept', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', SIGHT, 0); // exactly at sight => sighted
    windowAround(a, 0);
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    expect(blipsOf(f)).toEqual([]);
  });

  it('an island blocks radar exactly like sight', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(200, 0, 40));
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0);
    windowAround(a, 0);
    expect(blipsOf(buildFrame(w, 'a'))).toEqual([]);
  });
});

describe('perception — exactly once per revolution (incl. 2π wrap)', () => {
  it('each target paints exactly once per revolution, wrap tick included', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    // Mid-window bearings (δ/2 margin from window seams) so FP accumulation
    // over 160 wrapPositive additions cannot shift a paint across a seam.
    const firstBrg = SWEEP_DELTA / 2; // painted by the first window [0, δ)
    place(w, 'b', 400 * Math.cos(firstBrg), 400 * Math.sin(firstBrg));
    const wrapBrg = -SWEEP_DELTA / 2; // painted by the wrap window [2π−δ, 2π)
    place(w, 'c', 400 * Math.cos(wrapBrg), 400 * Math.sin(wrapBrg));

    const paints = new Map<string, number[]>([['b', []], ['c', []]]);
    let expectedSweep = 0;
    for (let tick = 1; tick <= 2 * TICKS_PER_REV; tick++) {
      w.step();
      expectedSweep = wrapPositive(expectedSweep + SWEEP_DELTA);
      const f = buildFrame(w, 'a');
      // OwnShip.sweep is the post-advance angle == this tick's window end
      // (identical accumulation => exact equality expected).
      expect(f.you!.sweep).toBe(expectedSweep);
      for (const e of blipsOf(f)) paints.get((e as SilhouetteBlipEvent).id)!.push(tick);
    }
    expect(paints.get('b')).toEqual([1, 1 + TICKS_PER_REV]);
    expect(paints.get('c')).toEqual([TICKS_PER_REV, 2 * TICKS_PER_REV]);
  });
});

// ---------- directed cases: event visibility ---------------------------------

describe('perception — shell events (per-observer, exactly once)', () => {
  it('the owner always gets its shell event, even far away; others do not', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    injectShell(w, 's1', 'a', 600, 600, 0, 300);
    const fa = buildFrame(w, 'a');
    expect(shellsOf(fa).map((e) => e.id)).toEqual(['s1']);
    expect(shellsOf(buildFrame(w, 'b'))).toEqual([]);
    // exactly once: the owner is not re-sent the same shell.
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell first entering sight arrives with CURRENT params, once', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 600, 0);
    injectShell(w, 's1', 'b', 500, 0, Math.PI, 480); // flying toward a, out of sight
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
    // Advance the sim until the shell crosses into a's sight bubble.
    let ev = null;
    for (let i = 0; i < 100 && !ev; i++) {
      w.step();
      ev = shellsOf(buildFrame(w, 'a'))[0] ?? null;
    }
    expect(ev).not.toBeNull();
    const sh = w.shells.get('s1')!;
    expect(ev!.x).toBe(sh.x); // current position, NOT the hidden launch point
    expect(Math.hypot(ev!.x, ev!.y)).toBeLessThanOrEqual(SIGHT);
    expect(ev!.t).toBe(w.now);
    assertBallisticShape(ev!); // no range-derivable field (no ttl) leaks the muzzle
    w.step();
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // never re-sent
  });

  it('a shell behind an island is not visible', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(100, 0, 40));
    place(w, 'a', 0, 0);
    place(w, 'b', 600, 0);
    injectShell(w, 's1', 'b', 200, 0, Math.PI / 2, 10); // in range but behind the rock
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('a shell event carries ONLY {k,id,x,y,vx,vy,t} — no range-derivable field', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'a', 10, 0, 0, 300);
    const ev = shellsOf(buildFrame(w, 'a'))[0];
    expect(ev).toBeDefined();
    assertBallisticShape(ev); // fails if `ttl`/`distLeft`/anything extra returns
  });
});

// ---------- fail-closed shape guards (Wave B) --------------------------------

describe('perception — world-emitted ballistics never forward (fail-closed)', () => {
  // A ballistic reveal is re-issued PER OBSERVER by the scan over live
  // world.shells (records that carry ownerId). A raw BallisticEvent riding the
  // tickEvents forwarding path has the WIRE shape (no ownerId), so the ballistic
  // row's shape guard (`'ownerId' in shell`) must drop it — otherwise a client
  // could be fed a projectile the scan never legitimately revealed to it.
  for (const kind of ['shell', 'torp'] as const) {
    it(`a world-emitted ${kind} GameEvent (no ownerId) reaches no frame — fogged or spectator`, () => {
      const w = bareWorld();
      place(w, 'a', 0, 0); // observer sitting ON the event's location (max exposure)
      emitWorldEvent(w, { k: kind, id: 'ghost', x: 0, y: 0, vx: 1, vy: 0, t: w.now });
      // Fogged path: dropped even point-blank on the observer.
      expect(buildFrame(w, 'a').events.filter((e) => e.k === kind)).toEqual([]);
      // Unfogged spectator path (finished phase): also dropped — the shape guard
      // fires before the mode check, so fog relaxation cannot resurrect it.
      expect(buildFrame(w, 'a', 'finished').events.filter((e) => e.k === kind)).toEqual([]);
    });
  }
});

describe('perception — boom / dmg / sunk / spawn visibility', () => {
  it('an out-of-sight boom is hidden from everyone but the struck ship', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0);
    b.hp = 15; // next hit sinks
    // a's shell, one tick from striking b — b is far outside a's sight.
    injectShell(w, 's1', 'a', 380, 0, 0, 100);
    w.step();
    const fa = buildFrame(w, 'a');
    const fb = buildFrame(w, 'b');
    // b (victim) sees the boom, its dmg, and its own sinking (seen: own hull).
    expect(fb.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fb.events.filter((e) => e.k === 'dmg')).toEqual([
      { k: 'dmg', id: 'b', amount: CONFIG.gun.damage, hp: 0 },
    ]);
    expect(fb.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // a (owner, out of sight) gets no boom / dmg — no impact-location leak —
    // but the sinking itself arrives (PV 23: credited killer + public
    // register), WITHOUT the spatial license: no `seen`.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('a boom within sight is visible; a witnessed sinking carries seen: true', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 150, 0);
    b.hp = 15;
    place(w, 'c', 0, 800); // far-away third party
    injectShell(w, 's1', 'a', 130, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'boom')).toHaveLength(1);
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // dmg stays victim-private even when the boom is visible.
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
    const fc = buildFrame(w, 'c');
    // The fog-kill THIRD PARTY (PV 23): no boom, but the public register
    // delivers the human sinking — identity only, no `seen`.
    expect(fc.events.filter((e) => e.k === 'boom')).toEqual([]);
    expect(fc.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('the public register: a drone fog kill reaches its killer but NOT a bystander', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the killer
    place(w, 'c', 0, 800); // an uninvolved, out-of-sight bystander
    const d = w.addShip('d1', 'DRONE-01', true, 'droneSmall');
    d.state.x = 500; // far outside everyone's sight
    d.state.y = 0;
    w.sinkShip('d1', 'a');
    w.step();
    // The killer learns its trap/round connected — no `seen` (never witnessed).
    expect(buildFrame(w, 'a').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'd1', by: 'a' },
    ]);
    // The bystander receives NOTHING: drones are not on the public register.
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([]);
  });

  it('a WITNESSED drone sinking arrives with seen: true (today\'s rule, unchanged)', () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // a witness who did not fire the shot
    const d = w.addShip('d1', 'DRONE-01', true, 'droneSmall');
    d.state.x = 100; // inside c's sight bubble
    d.state.y = 0;
    w.sinkShip('d1', 'a');
    w.step();
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'd1', by: 'a', seen: true },
    ]);
  });

  it('an unattributed human sinking (storm) is public with `by` OMITTED, never undefined', () => {
    const w = bareWorld();
    place(w, 'c', 0, 800); // far away — unwitnessed
    place(w, 'b', 0, 0);
    w.sinkShip('b'); // by = undefined (the storm has no killer)
    w.step();
    const sunk = buildFrame(w, 'c').events.filter((e) => e.k === 'sunk');
    expect(sunk).toEqual([{ k: 'sunk', id: 'b' }]);
    expect('by' in sunk[0]).toBe(false); // msgpack would encode an undefined value
    expect('seen' in sunk[0]).toBe(false);
  });

  it('a boom whose victim center is out of sight arrives WITHOUT hit (straddle)', () => {
    // b's center sits just OUTSIDE a's sight; its hull reaches INSIDE, so a's
    // shell strikes at a point a can see. a must get the boom (impact sighted)
    // but never the victim's id (center fogged) — reviewer finding 2.
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', SIGHT + 12, 0, 0); // center SIGHT+12u, hull axis along x
    b.hp = 100; // survives, so it straddles as a live (but unsighted) hull
    injectShell(w, 's1', 'a', SIGHT - 15, 0, 0, 40); // a's shell striking b's near hull, just inside a's sight
    let boomB: BoomEvent | undefined;
    for (let i = 0; i < 20 && !boomB; i++) {
      w.step();
      boomB = boomsOf(buildFrame(w, 'b')).find((e) => e.id === 's1');
    }
    // The straddle actually happened: impact point inside a's sight, center outside.
    expect(boomB).toBeDefined();
    expect(dist({ x: 0, y: 0 }, boomB!)).toBeLessThanOrEqual(SIGHT);
    expect(dist({ x: 0, y: 0 }, b.state)).toBeGreaterThan(SIGHT);
    // Victim sees its own hit; the far owner sees the impact but NOT the id.
    expect(boomB!.hit).toBe('b');
    const boomA = boomsOf(buildFrame(w, 'a')).find((e) => e.id === 's1');
    expect(boomA).toBeDefined();
    expect(boomA!.hit).toBeUndefined();
    expect('hit' in boomA!).toBe(false); // stripped, not just undefined
    // a is not otherwise leaking b: b never appears as a contact.
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).not.toContain('b');
  });

  it('spawns are visible to the spawner and to observers who can see the point', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.step(); // flush a's own join spawn
    const c = w.addShip('c', 'CHARLIE'); // ring spawn, far from a
    w.step();
    const fa = buildFrame(w, 'a');
    expect(fa.events.filter((e) => e.k === 'spawn')).toEqual([]);
    const fc = buildFrame(w, 'c');
    expect(fc.events.filter((e) => e.k === 'spawn')).toEqual([
      { k: 'spawn', id: 'c', x: c.state.x, y: c.state.y },
    ]);
  });
});

// ---------- directed cases: mine visibility (contact-like) -------------------

describe('perception — burst visibility (owner always, else burst point sighted)', () => {
  /** Route an internal burst subject through the real pending-events choke,
   *  the way World.resolveBurst emits it (wire BurstEvent + internal `own`). */
  function emitBurst(w: World, id: string, own: string, x: number, y: number): void {
    interface Pendable { pending: GameEvent[] }
    (w as unknown as Pendable).pending.push({ k: 'burst', id, x, y, own } as GameEvent);
    w.step();
  }

  it('the OWNER gets its burst even far beyond sight (the point is its own click)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    emitBurst(w, 'b1', 'a', 600, 0); // 600u away — far outside a's 330u sight
    const bursts = buildFrame(w, 'a').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: 600, y: 0 }]); // bare shape, no `own`
  });

  it('a non-owner outside sight of the burst point NEVER receives it (fogged)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', -900, 0); // 1500u from the burst point
    emitBurst(w, 'b1', 'a', 600, 0);
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'burst')).toEqual([]);
  });

  it('a non-owner WITH the burst point sighted receives the bare event', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 580, 0); // 20u from the burst point — sighted
    emitBurst(w, 'b1', 'a', 600, 0);
    const bursts = buildFrame(w, 'c').events.filter((e) => e.k === 'burst');
    expect(bursts).toEqual([{ k: 'burst', id: 'b1', x: 600, y: 0 }]);
  });

  it('a non-owner behind an island never receives it (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(100, 0, 40));
    place(w, 'c', 0, 0);
    emitBurst(w, 'b1', 'a', 200, 0); // inside sight range but behind the rock
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'burst')).toEqual([]);
  });

  it('END-TO-END: a real gun burst reaches the fogged owner as {k,id,x,y} only', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 600, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
    let burst: GameEvent | undefined;
    for (let i = 0; i < 120 && !burst; i++) {
      w.step();
      burst = buildFrame(w, 'a').events.find((e) => e.k === 'burst');
    }
    expect(burst).toBeDefined(); // owner-visible at 600u — nearly 3× sight range
    expect(Object.keys(burst!).sort()).toEqual(['id', 'k', 'x', 'y']); // no own/radius/range field
    expect((burst as BurstEvent).x).toBeCloseTo(600, 4); // bursts AT the clicked point
  });
});

describe('perception — mine visibility (owner-always, else DETECT+LOS — Story 4.9, never radar)', () => {
  // The 3/8 detect rung, INDEPENDENTLY RE-DERIVED as a literal (never
  // CONFIG.vision.detect / detectFactor — the oracle rule).
  const DETECT = SIGHT * 0.75;

  it('the owner sees all its own mines everywhere; the enemy never radar-paints them', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 0, 0); // b co-located briefly; we only read its frame's mines
    injectMine(w, 'm1', 'a', 900, 900); // owner's mine, far outside any range
    const fa = buildFrame(w, 'a');
    expect(fa.mines).toEqual([{ id: 'm1', x: 900, y: 900, own: true, by: 'a' }]);
    // b sits at the origin — the mine is 1273u away, far beyond radar(660).
    expect(buildFrame(w, 'b').mines).toEqual([]);
  });

  it('an enemy mine is visible at exactly the detect boundary, invisible just outside it', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', DETECT, 0); // exactly at detect — inclusive
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: DETECT, y: 0, own: false, by: 'b' }]);
    w.mines.clear();
    injectMine(w, 'm2', 'b', DETECT + 0.01, 0); // a hair beyond detect
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('NON-VACUITY of the detect oracle: an enemy mine INSIDE SIGHT but beyond detect is invisible (would have been a contact-tier reveal before Story 4.9)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 300, 0); // 247.5 < 300 ≤ 330 — sighted, NOT detected
    expect(buildFrame(w, 'a').mines).toEqual([]);
    injectMine(w, 'm2', 'b', SIGHT, 0); // the old boundary itself is now fogged
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('detect is OBSERVER-SCALED (amendment 121): dazzle halves it; a sightRange boon widens it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 200, 0); // inside base detect (247.5)
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m1']);
    a.dazzledUntil = w.now + 10_000; // dazzled detect = 0.75 × 165 = 123.75
    expect(buildFrame(w, 'a').mines).toEqual([]);
    a.dazzledUntil = 0;
    a.stats = { ...a.stats, sightRange: 600 }; // boon-widened detect = 450
    injectMine(w, 'm2', 'b', 440, 0);
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('an enemy mine inside an OWNED lit zone stays visible beyond detect (the OR-path is untouched)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 300, 0); // beyond detect — fogged on its own
    expect(buildFrame(w, 'a').mines).toEqual([]);
    injectZone(w, 'z1', 'a', 300, 0);
    expect(buildFrame(w, 'a').mines.map((m) => m.id)).toEqual(['m1']);
  });

  it('an enemy mine behind an island is invisible (LOS rule)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(60, 0, 25));
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 120, 0); // inside detect range but behind the rock
    expect(buildFrame(w, 'a').mines).toEqual([]);
  });

  it('arm state makes no difference to visibility', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'armed', 'b', 100, 0, 0);
    injectMine(w, 'unarmed', 'b', 100, 20, w.now + CONFIG.mine.armDelay);
    expect(buildFrame(w, 'a').mines.map((m) => m.id).sort()).toEqual(['armed', 'unarmed']);
  });
});

describe('perception — torpedo DETECT gate vs shell truesight (Story 4.9: the sibling fork — SHELLS DO NOT MOVE)', () => {
  const DETECT = SIGHT * 0.75; // independently re-derived, never CONFIG.vision.detect
  const torpsOf = (f: FrameMsg) => f.events.filter((e): e is BallisticEvent => e.k === 'torp');

  it('a shell at exactly the truesight boundary reveals; a torpedo at the same point does NOT', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'b', SIGHT, 0, Math.PI, 400, false, 'shell');
    injectShell(w, 't1', 'b', 0, SIGHT, -Math.PI / 2, 400, false, 'torp');
    const f = buildFrame(w, 'a');
    expect(shellsOf(f).map((e) => e.id)).toEqual(['s1']); // shells unchanged at 330
    expect(torpsOf(f)).toEqual([]); // the torpedo is still fogged there
  });

  it('a torpedo reveals at exactly the detect boundary (inclusive), not a hair beyond', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', DETECT, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['t1']);
    const w2 = bareWorld();
    place(w2, 'a', 0, 0);
    injectShell(w2, 't2', 'b', DETECT + 0.01, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w2, 'a'))).toEqual([]);
  });

  it('NON-VACUITY: a torpedo inside sight but beyond detect (300u) stays hidden — the pre-4.9 gate would have revealed it', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 't1', 'b', 300, 0, Math.PI, 400, false, 'torp');
    expect(torpsOf(buildFrame(w, 'a'))).toEqual([]);
  });

  it('the owner-always and owned-zone paths on the torp row are untouched', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 'own', 'a', 900, 900, 0, 400, false, 'torp'); // own fish, anywhere
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['own']);
    injectShell(w, 'zoned', 'b', 500, 0, 0, 400, false, 'torp'); // far beyond detect
    injectZone(w, 'z1', 'a', 500, 0);
    expect(torpsOf(buildFrame(w, 'a')).map((e) => e.id)).toEqual(['zoned']);
  });
});

describe('perception — the mz/sm halo is TIGHT at SIGHT*1.25 (Story 4.9: a case that FAILS if production emitted at the old SIGHT*1.5 halo)', () => {
  it('an observer at 420u — inside the old 495u halo, outside the new 412.5u one — receives neither mz nor sm', () => {
    const w = bareWorld();
    place(w, 'a', 420, 0); // 412.5 < 420 ≤ 495
    emitWorldEvent(w, { k: 'mz', x: 0, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 0, y: 0, tier: 1 });
    const f = buildFrame(w, 'a');
    expect(f.events.filter((e) => e.k === 'mz' || e.k === 'sm')).toEqual([]);
  });

  it('an observer at exactly SIGHT*1.25 receives both (boundary inclusive) — the emission is real, not vacuous', () => {
    const w = bareWorld();
    place(w, 'a', SIGHT * 1.25, 0);
    emitWorldEvent(w, { k: 'mz', x: 0, y: 0 });
    emitWorldEvent(w, { k: 'sm', x: 0, y: 0, tier: 1 });
    const kinds = buildFrame(w, 'a').events.map((e) => e.k).sort();
    expect(kinds).toEqual(['mz', 'sm']);
  });
});

// ---------- directed cases: lit zones (Story 1.7) -----------------------------

describe('perception — lit zones: firer-only truesight parity ("lit from above")', () => {
  const LIT_R = CONFIG.starShells.litRadius;

  it('the FIRER gains a full contact for a ship inside its zone, far beyond sight and radar', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 0, 2.1); // way outside sight (330) AND radar (660)
    injectZone(w, 'z1', 'a', 900, 0);
    expect(buildFrame(w, 'a').contacts).toEqual([
      { id: 'b', x: 900, y: 0, heading: 2.1, speed: 0, cls: 'torpedoBoat' },
    ]);
    // Zone expiry/removal drops the contact again (revealed only while lit).
    w.litZones.clear();
    expect(buildFrame(w, 'a').contacts).toEqual([]);
  });

  it('a zone-revealed ship in the radar annulus is a contact ONLY — never doubled as a blip', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 400, 0); // radar annulus (sight < 400 ≤ radar)
    injectZone(w, 'z1', 'a', 400, 0);
    windowAround(a, 0); // the beam crosses b's bearing this very tick
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id)).toEqual(['b']);
    expect(blipsOf(f)).toEqual([]); // the blip row itself refuses zone-covered ships
  });

  it('the firer watches a zone-revealed ship die: boom (victim id KEPT) + sunk arrive', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 900, 0); // far outside a's sight — pre-1.7 the owner got NO boom here
    b.hp = 15; // the next hit sinks it
    injectZone(w, 'z1', 'a', 900, 0);
    injectShell(w, 's1', 'a', 880, 0, 0, 100); // a's shell, point-blank on b
    w.step();
    const fa = buildFrame(w, 'a');
    // Boom point zone-covered => visible; victim center zone-covered => hit un-stripped.
    expect(fa.events.filter((e) => e.k === 'boom')).toEqual([
      { k: 'boom', id: 's1', hit: 'b', x: expect.any(Number), y: expect.any(Number) },
    ]);
    // Wreck inside the owned zone => the sunk arrives WITNESSED (seen: true).
    expect(fa.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a', seen: true }]);
    // dmg stays victim-private even under the zone (truesight parity, not omniscience).
    expect(fa.events.filter((e) => e.k === 'dmg')).toEqual([]);
  });

  it("a kill inside someone ELSE's zone: the boom never leaks; the sunk is public but UNSEEN (PV 23)", () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // non-owner observer
    const b = place(w, 'b', 900, 0);
    b.hp = 15;
    injectZone(w, 'z1', 'a', 900, 0); // a's zone — c gains nothing from it
    injectShell(w, 's1', 'a', 880, 0, 0, 100);
    w.step();
    const fc = buildFrame(w, 'c');
    expect(fc.events.filter((e) => e.k === 'boom')).toEqual([]);
    // The human sinking rides the public register — identity only, no `seen`,
    // so someone else's zone still grants c NO spatial knowledge.
    expect(fc.events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'b', by: 'a' }]);
  });

  it('a ship BEHIND AN ISLAND inside the zone is still revealed to the firer (no LOS term)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(400, 0, 60)); // squarely between a and b
    place(w, 'a', 0, 0);
    place(w, 'b', 800, 0);
    injectZone(w, 'z1', 'a', 800, 0);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('a ship outside the zone edge is NEVER revealed by it (boundary exact)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900 + LIT_R, 0); // center exactly ON the edge — inclusive
    injectZone(w, 'z1', 'a', 900, 0);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
    w.ships.get('b')!.state.x = 900 + LIT_R + 0.01; // a hair outside
    expect(buildFrame(w, 'a').contacts).toEqual([]);
  });

  it("a NON-OWNER never gains contacts from someone else's zone — only the radar-gated circle", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the firer (owns the zone)
    place(w, 'b', 500, 0); // hidden inside the zone (beyond c's sight, unswept)
    const c = place(w, 'c', 100, 0); // third party: zone center 400u away — within radar
    c.prevSweepAngle = Math.PI; // beam nowhere near b's bearing — no blip either
    c.sweepAngle = Math.PI + 0.001;
    injectZone(w, 'z1', 'a', 500, 0);
    const fc = buildFrame(w, 'c');
    // b stays hidden from c (a, 100u away, is c's ordinary sight contact).
    expect(fc.contacts.map((x) => x.id)).toEqual(['a']);
    expect(fc.litZones).toEqual([{ id: 'z1', x: 500, y: 0, r: LIT_R, until: 999_999, by: 'a', mode: 'standard' }]);
  });

  it("an enemy mine inside the firer's zone becomes a mine view (mines never radar-paint otherwise)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectMine(w, 'm1', 'b', 890, 0); // inside the zone, far beyond a's sight
    injectMine(w, 'm2', 'b', 900 + LIT_R + 1, 0); // outside the zone edge — stays hidden
    injectZone(w, 'z1', 'a', 900, 0);
    expect(buildFrame(w, 'a').mines).toEqual([{ id: 'm1', x: 890, y: 0, own: false, by: 'b' }]);
  });

  it("an unseen ballistic inside the firer's zone materializes exactly once, with current params", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectShell(w, 's1', 'b', 880, 0, Math.PI / 2, 400); // b's shell, deep inside the zone
    injectZone(w, 'z1', 'a', 900, 0);
    const ev = shellsOf(buildFrame(w, 'a'))[0];
    expect(ev).toBeDefined();
    const sh = w.shells.get('s1')!;
    expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never the launch point
    assertBallisticShape(ev); // constant-free wire shape holds on the zone path too
    expect(shellsOf(buildFrame(w, 'a'))).toEqual([]); // exactly-once memory unchanged
  });

  it("a ballistic inside someone ELSE's zone stays hidden from a non-owner", () => {
    const w = bareWorld();
    place(w, 'c', 0, 0); // non-owner, shell far outside its sight
    injectShell(w, 's1', 'b', 880, 0, Math.PI / 2, 400);
    injectZone(w, 'z1', 'a', 900, 0); // a's zone, not c's
    expect(shellsOf(buildFrame(w, 'c'))).toEqual([]);
  });
});

describe('perception — litZones channel (owner always, else radar-gated; frames omit when empty)', () => {
  it('the owner always receives its zone circle; a frame with no visible zones omits the key', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'far', 5_000, 0); // hypothetical far observer (outside radar of everything)
    injectZone(w, 'z1', 'a', RADAR + 500, 0, CONFIG.starShells.litRadius, 42_000);
    const fa = buildFrame(w, 'a');
    expect(fa.litZones).toEqual([
      { id: 'z1', x: RADAR + 500, y: 0, r: CONFIG.starShells.litRadius, until: 42_000, by: 'a', mode: 'standard' },
    ]);
    // Beyond-radar third party: byte-free — the litZones key is ABSENT, not [].
    const ffar = buildFrame(w, 'far');
    expect('litZones' in ffar).toBe(false);
  });

  it('a third party sees the circle at dist == radar (inclusive), loses it just beyond', () => {
    const w = bareWorld();
    place(w, 'c', 0, 0);
    injectZone(w, 'z1', 'a', RADAR, 0);
    expect(buildFrame(w, 'c').litZones?.map((z) => z.id)).toEqual(['z1']);
    w.litZones.get('z1')!.x = RADAR + 0.01;
    expect('litZones' in buildFrame(w, 'c')).toBe(false);
  });

  it('no LOS and no sweep gate on the circle (a flare in the sky)', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(200, 0, 40)); // blocks sight AND radar paint on the axis
    const c = place(w, 'c', 0, 0);
    c.prevSweepAngle = Math.PI; // beam on the far side — never crossed bearing 0
    c.sweepAngle = Math.PI + 0.001;
    injectZone(w, 'z1', 'a', 400, 0);
    expect(buildFrame(w, 'c').litZones?.map((z) => z.id)).toEqual(['z1']);
  });

  it('spectators see every zone, doctrine mode included', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    injectZone(w, 'z1', 'b', 9_000, 9_000, CONFIG.starShells.litRadius, 999_999, 'incendiary');
    const zones = buildFrame(w, 'a', 'finished').litZones;
    expect(zones?.map((z) => z.id)).toEqual(['z1']);
    expect(zones?.[0].mode).toBe('incendiary');
  });

  it("every legitimate observer of the circle sees its doctrine mode (Story 2.9, amendment 50)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the firer (owner)
    place(w, 'c', 100, 0); // third party: zone center within radar
    injectZone(w, 'zd', 'a', 500, 0, CONFIG.starShells.litRadius, 999_999, 'dazzle');
    // Owner, radar-gated non-owner, and spectator all read the same mode —
    // the zone's nature is observable behavior, never a build leak.
    expect(buildFrame(w, 'a').litZones?.[0].mode).toBe('dazzle');
    expect(buildFrame(w, 'c').litZones?.[0].mode).toBe('dazzle');
    expect(buildFrame(w, 'c', 'finished').litZones?.[0].mode).toBe('dazzle');
  });

  it("a dead firer's zone persists and keeps revealing nothing to others (natural expiry only)", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'c', 100, 0);
    injectZone(w, 'z1', 'a', 500, 0, CONFIG.starShells.litRadius, w.now + CONFIG.starShells.litDurationMs);
    w.respawnEnabled = false; // active-phase policy
    w.sinkShip('a', 'c');
    w.step();
    expect(w.litZones.has('z1')).toBe(true); // owner death never clears it
    // c still sees only the circle (never a's reveal privileges).
    expect(buildFrame(w, 'c').litZones?.map((z) => z.id)).toEqual(['z1']);
    // ...and it dies by natural expiry.
    const steps = Math.ceil(CONFIG.starShells.litDurationMs / DT) + 2;
    for (let i = 0; i < steps; i++) w.step();
    expect(w.litZones.size).toBe(0);
    expect('litZones' in buildFrame(w, 'c')).toBe(false);
  });
});

// ---------- THE INVARIANT (property-style over random worlds) ----------------

/** Assert one frame leaks nothing beyond the observer's vision. */
function verifyFrame(w: World, viewerId: string, f: FrameMsg): void {
  const me = w.ships.get(viewerId)!;
  // Fitted boons ride ONLY on the observer's own ship — never on a contact.
  if (f.you) expect(f.you.boons).toEqual(me.boons);
  // Story 2.6: level + XP progress are self-private on the same terms — the
  // observer's OWN values, and nothing else's.
  if (f.you) {
    expect(f.you.lvl).toBe(me.level);
    expect(f.you.xp).toBeCloseTo(me.xpMs / CONFIG.xp.levelMs, 12);
    // DAMAGE CONTROL (2026-08-04): the regen pool is self-private on the
    // boostUntil terms — the OBSERVER'S OWN value on `you`, and nothing else's.
    expect(f.you.repairHp).toBe(me.repairHp);
  }
  // THE STRUCTURAL PIN: `repairHp` may exist NOWHERE in a frame except `you`,
  // and the string must be absent entirely from any frame that has no `you`
  // (every spectator frame). A whole-frame text scan, so a future channel that
  // starts carrying the pool — a contact field, a heal event payload, a
  // spectator passthrough — fails here even if no verifier knows about it.
  const withoutYou = { ...f, you: undefined };
  expect(JSON.stringify(withoutYou)).not.toContain('repairHp');
  for (const c of f.contacts) {
    const target = w.ships.get(c.id)!;
    expect(target).toBeDefined();
    expect(target.alive).toBe(true);
    expect(c.id).not.toBe(viewerId);
    expect('boons' in c).toBe(false); // enemy builds are hidden (anti-cheat)
    expect('stats' in c).toBe(false);
    expect('lvl' in c).toBe(false); // ...and so is the economy (Story 2.6)
    expect('xp' in c).toBe(false);
    // Sight tier (dist + LOS) OR the ship's CENTER inside a zone the viewer
    // OWNS (Story 1.7 firer-only truesight parity) — nothing else.
    expect(sighted(w, me, target.state) || zoneCovers(w, me, target.state)).toBe(true);
    expect({ x: c.x, y: c.y }).toEqual({ x: target.state.x, y: target.state.y });
  }
  for (const e of f.events) verifyEvent(w, me, e);
  for (const m of f.mines) verifyMine(w, me, m);
  for (const z of f.litZones ?? []) verifyLitZone(w, me, z);
  for (const d of f.decoys ?? []) verifyDecoy(w, me, d);
  for (const d of f.denied ?? []) verifyDenied(me, d);
  verifyBlipOrdering(w, f);
}

/** The Story 1.10 denial oracle: a denial in a frame must be the OBSERVER'S
 *  OWN press this tick — its (slot, seq) identity matches the observer's
 *  stored input on exactly one channel grammar (weapon click ↔ fireSeq on
 *  input.slot; ability press ↔ actSeq on input.actSlot) with a legal wire
 *  reason. Anything else — another ship's denial, a fabricated slot/seq, a
 *  server-internal reason ('dead'/'empty-slot') — fails the invariant:
 *  denials are owner-only by construction. */
function verifyDenied(me: ShipRecord, d: { slot: number; reason: string; seq: number }): void {
  expect(['out-of-arc', 'no-ammo', 'cooling', 'blocked']).toContain(d.reason);
  const weaponPress = d.slot === me.input.slot && d.seq === me.input.fireSeq;
  const abilityPress = d.slot === me.input.actSlot && d.seq === me.input.actSeq;
  expect(weaponPress || abilityPress).toBe(true);
}

/** FR10 anti-tell (Story 1.8): the frame's blip SUBSEQUENCE must be ordered by
 *  PUBLIC payload only — never by source (genuine ship scan vs decoy
 *  counter-intel), or array position would de-anonymize the deception whenever
 *  a hull and its buoy paint the same tick. Reimplemented test-locally,
 *  applied to EVERY verified frame, per grammar: silhouette by (x, y, t, id);
 *  the cycle-63 `return` footprint by (gx, gy, t, w, h) — its entire public
 *  payload short of the mask words, which is total up to byte-identical
 *  payloads (and identical payloads carry no order information to leak). */
function verifyBlipOrdering(w: World, f: FrameMsg): void {
  const blips = f.events.filter((e): e is BlipEvent => e.k === 'blip');
  for (let i = 1; i < blips.length; i++) {
    if (w.radarGrammar === 'return') {
      const a = blips[i - 1] as ReturnBlipEvent;
      const b = blips[i] as ReturnBlipEvent;
      const key = (e: ReturnBlipEvent): number[] => [e.gx, e.gy, e.t, e.w, e.h];
      const ka = key(a);
      const kb = key(b);
      const cmp = ka.map((v, j) => v - kb[j]).find((d) => d !== 0) ?? 0;
      expect(cmp).toBeLessThanOrEqual(0);
      continue;
    }
    const a = blips[i - 1] as SilhouetteBlipEvent;
    const b = blips[i] as SilhouetteBlipEvent;
    const ordered =
      a.x < b.x ||
      (a.x === b.x && (a.y < b.y || (a.y === b.y && (a.t < b.t || (a.t === b.t && a.id <= b.id)))));
    expect(ordered).toBe(true);
  }
}

/** A mine may reach a frame only if the viewer owns it, it is DETECTED
 *  (Story 4.9: the 0.75×sight rung — strictly tighter than sighted), OR it
 *  sits inside a lit zone the viewer OWNS (Story 1.7). */
function verifyMine(w: World, me: ShipRecord, m: { id: string; own: boolean; by: string }): void {
  const mine = w.mines.get(m.id)!;
  expect(mine).toBeDefined();
  const own = mine.ownerId === me.id;
  expect(m.own).toBe(own);
  expect(m.by).toBe(mine.ownerId); // Story 1.12: every visible mine carries its dropper id (personal hue)
  if (!own) expect(detected(w, me, mine) || zoneCovers(w, me, mine)).toBe(true); // never radar, never merely sighted
}

/** The Story 1.8 decoys-channel oracle: a buoy VIEW may reach a fogged frame
 *  ONLY when the viewer owns it, its point is sighted (sight + island LOS), or
 *  it sits inside a lit zone the viewer OWNS — nothing else (radar range alone
 *  NEVER delivers the truth channel; it only ever produces the counterIntel
 *  blip, verified in verifyBlip). Wire shape is exactly {id,x,y,until,own} with
 *  `own` true iff the viewer owns the buoy (mines precedent); the buoy must be
 *  live and unexpired. */
function verifyDecoy(
  w: World,
  me: ShipRecord,
  d: { id: string; x: number; y: number; until: number; own: boolean; by: string },
): void {
  const decoy = w.decoys.get(d.id)!;
  expect(decoy).toBeDefined();
  expect(w.now).toBeLessThan(decoy.until); // expired buoys never materialize
  expect(Object.keys(d).sort()).toEqual(['by', 'id', 'own', 'until', 'x', 'y']);
  expect(d).toEqual({ id: decoy.id, x: decoy.x, y: decoy.y, until: decoy.until, own: decoy.ownerId === me.id, by: decoy.ownerId });
  if (decoy.ownerId !== me.id) {
    expect(sighted(w, me, decoy) || zoneCovers(w, me, decoy)).toBe(true);
  }
}

/** A lit-zone circle may reach a frame only if the viewer OWNS the zone or the
 *  zone CENTER is within the viewer's effective radar range — no LOS term, no
 *  sweep term (Story 1.7). Wire shape is exactly {id,x,y,r,until,by,mode} with
 *  `by` naming the owner and `mode` the zone record's doctrine verbatim (Story
 *  2.9, amendment 50 — every observer of the circle sees its nature); the zone
 *  must be live (in the world map, unexpired). */
function verifyLitZone(
  w: World,
  me: ShipRecord,
  z: { id: string; x: number; y: number; r: number; until: number; by: string; mode?: string },
): void {
  const zone = w.litZones.get(z.id)!;
  expect(zone).toBeDefined();
  expect(w.now).toBeLessThan(zone.until); // expired zones never materialize
  expect(Object.keys(z).sort()).toEqual(['by', 'id', 'mode', 'r', 'until', 'x', 'y']);
  expect(z).toEqual({ id: zone.id, x: zone.x, y: zone.y, r: zone.r, until: zone.until, by: zone.ownerId, mode: zone.mode });
  if (zone.ownerId !== me.id) expect(dist(me.state, zone)).toBeLessThanOrEqual(effRadar(me));
}

// ---------- per-kind event verifiers (the independent oracle) ----------------
//
// One test-local verifier per GameEvent kind — the deliberately reimplemented
// visibility oracle (NEVER a row's own visible()/materialize(), per the header).
// verifyEvent() dispatches through EVENT_VERIFIERS; a kind with no entry throws
// ("unexpected event kind leaked"). The completeness suite below pins this map's
// KEY SET to the registry's event-kind rows, so a future registry row without a
// verifier fails CI by construction (the story's marquee AC).

type EventVerifier = (w: World, me: ShipRecord, e: GameEvent) => void;

/** The ship-blip predicate at a POINT, reimplemented test-locally: annulus
 *  (sight < d ≤ radar), island LOS, this-tick paint window, and never inside a
 *  zone the viewer owns (contact/truth tier there). One function because the
 *  decoy deception is DEFINED as this exact predicate at the buoy's position
 *  (Story 1.8 / FR10). */
function blipPredicate(w: World, me: ShipRecord, p: { x: number; y: number }): boolean {
  const d = dist(me.state, p);
  return (
    d > effSight(me, w.now) &&
    d <= effRadar(me) &&
    clearLos(me.state, p, w.map.islands) &&
    inPaintWindow(me, bearing(me.state, p)) &&
    !zoneCovers(w, me, p)
  );
}

/** Test-local reverse pseudonym resolution (radar realism cycle, R3): the
 *  roster ship id a blip id names under the world's identity mode. In roster
 *  mode the blip id IS the roster id; in pseudonym mode we invert the world's
 *  track map (read-only — never the production pseudonymOf resolver path). */
function rosterIdOf(w: World, blipId: string): string | undefined {
  if (w.radarIdentity === 'roster') return blipId;
  for (const [shipId, track] of w.pseudonyms) {
    if (track === blipId) return shipId;
  }
  return undefined;
}

// --- the cycle-63 `return`-grammar COVERAGE oracle (amendment 155) -----------
//
// Re-DERIVED against the new payload, not adapted from the retired `ext`
// oracle: the wire now carries a world-anchored coverage footprint
// ({k,t,gx,gy,w,h,bits}) rasterized server-side from the true hull polygon,
// and the oracle below reimplements that rasterization from the amendment
// text — the raw silhouette verts rotated/translated by hand, a test-local
// even-odd crossing test (never the production pointInPolygon), the bbox cell
// rect, the centre-in-polygon rule, the centre-cell fail-safe and the
// LSB-first packing — so a refactor of sim/radarRaster.ts cannot silently
// agree with its own bug. Justification is EXACT mask equality (two-sided:
// every wire bit must be earned AND every earned bit must be on the wire), so
// this oracle cannot go vacuous by the channel quietly shrinking.

/** The shared radar grid resolution — the wire-contract lattice parameter. */
const RCELL_U = CONFIG.vision.radarCellU;

/** Test-local even-odd point-in-polygon (ray crossing), reimplemented. */
function inPolyOracle(px: number, py: number, poly: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

interface MaskOracle { gx: number; gy: number; w: number; h: number; bits: number[] }

/** Test-local coverage rasterization of a hull pose onto the shared grid. */
function maskOracle(cls: HullId, x: number, y: number, heading: number): MaskOracle {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const poly = hullSilhouette(cls).map((p) => ({ x: x + c * p.x - s * p.y, y: y + s * p.x + c * p.y }));
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const gx = Math.floor(Math.min(...xs) / RCELL_U);
  const gy = Math.floor(Math.min(...ys) / RCELL_U);
  const w = Math.floor(Math.max(...xs) / RCELL_U) - gx + 1;
  const h = Math.floor(Math.max(...ys) / RCELL_U) - gy + 1;
  const bits = new Array<number>(Math.ceil((w * h) / 32)).fill(0);
  const set = (i: number): void => { bits[i >>> 5] |= 1 << (i & 31); };
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (inPolyOracle((gx + col + 0.5) * RCELL_U, (gy + row + 0.5) * RCELL_U, poly)) set(row * w + col);
    }
  }
  // The centre-cell fail-safe: a return always lights the cell the hull is in.
  set((Math.floor(y / RCELL_U) - gy) * w + (Math.floor(x / RCELL_U) - gx));
  return { gx, gy, w, h, bits };
}

/** EXACT footprint equality — rect and every mask word. */
function maskEquals(a: MaskOracle, ev: ReturnBlipEvent): boolean {
  if (a.gx !== ev.gx || a.gy !== ev.gy || a.w !== ev.w || a.h !== ev.h) return false;
  return a.bits.length === ev.bits.length && a.bits.every((v, i) => v === ev.bits[i]);
}

/** Grammar-branched pose check for one blip against a (cls, heading, speed)
 *  truth source at a position: silhouette mode carries the pose verbatim
 *  (Story 4.2); `return` mode must carry EXACTLY the coverage footprint the
 *  independent oracle rasterizes from that pose (cycle 63, amendment 152 —
 *  never an id, position, extent, or pose field). */
function blipPoseMatches(
  w: World,
  ev: BlipEvent,
  cls: HullId,
  p: { x: number; y: number },
  heading: number,
  speed: number,
): boolean {
  if (w.radarGrammar === 'return') {
    return maskEquals(maskOracle(cls, p.x, p.y, heading), ev as ReturnBlipEvent);
  }
  const sil = ev as SilhouetteBlipEvent;
  return sil.x === p.x && sil.y === p.y && sil.cls === cls && sil.heading === heading && sil.speed === speed;
}

/** True iff `ev` is a legitimate GENUINE ship paint. Silhouette grammar: the
 *  id resolves a live non-self ship at exactly the blip position, carrying its
 *  LIVE pose verbatim (Story 4.2). `return` grammar carries NO id (cycle 63),
 *  so the justification quantifies over the ships: SOME live non-self ship
 *  passing the ship-blip predicate must rasterize to exactly this footprint. */
function blipMatchesShip(w: World, me: ShipRecord, ev: BlipEvent): boolean {
  if (w.radarGrammar === 'return') {
    for (const target of w.ships.values()) {
      if (!target.alive || target.id === me.id) continue;
      if (!blipPredicate(w, me, target.state)) continue;
      if (blipPoseMatches(w, ev, target.hullId, target.state, target.state.heading, target.state.speed)) return true;
    }
    return false;
  }
  const rosterId = rosterIdOf(w, (ev as SilhouetteBlipEvent).id);
  if (rosterId === undefined) return false;
  const target = w.ships.get(rosterId);
  if (!target || !target.alive || target.id === me.id) return false;
  if (!blipPoseMatches(w, ev, target.hullId, target.state, target.state.heading, target.state.speed)) return false;
  return blipPredicate(w, me, target.state);
}

/** True iff the decoy's OWNER is currently contact-visible to `me` — the
 *  test-local reimplementation of the contact tier (alive ∧ not-self ∧
 *  (sighted ∨ own-zone-covered)). While this holds, a decoy blip is FORBIDDEN
 *  (FR10 coexistence guard): contact('a') + blip('a') in one frame is
 *  impossible for genuine ships and would unmask the buoy on the wire. */
function ownerContactVisible(w: World, me: ShipRecord, ownerId: string): boolean {
  const owner = w.ships.get(ownerId);
  if (!owner || !owner.alive || owner.id === me.id) return false;
  return sighted(w, me, owner.state) || zoneCovers(w, me, owner.state);
}

/** True iff `ev` is a legitimate DECOY counter-intel paint (Story 1.8): a live
 *  unexpired buoy sits where the blip claims metal, the observer is NOT the
 *  owner (a buoy never lies to its owner), the OWNER is NOT simultaneously a
 *  contact for the observer (the coexistence guard above), and the ship-blip
 *  predicate holds at the BUOY's position. Silhouette grammar additionally
 *  binds the wire id to the owner and the pose to the record's FROZEN
 *  drop-time snapshot at speed 0 (amendment 11 — a live owner value here
 *  would mean the counterIntel path read ctx.ships.get(ownerId), which it
 *  must never do). In `return` grammar the same frozen-pose law holds through
 *  the footprint: the mask must be EXACTLY the owner hull rasterized at the
 *  buoy position and drop heading. */
function blipMatchesDecoy(w: World, me: ShipRecord, ev: BlipEvent): boolean {
  const rosterId = w.radarGrammar === 'return' ? undefined : rosterIdOf(w, (ev as SilhouetteBlipEvent).id);
  if (w.radarGrammar !== 'return' && rosterId === undefined) return false;
  for (const decoy of w.decoys.values()) {
    if (rosterId !== undefined && decoy.ownerId !== rosterId) continue;
    if (!blipPoseMatches(w, ev, decoy.hullId, decoy, decoy.heading, 0)) continue;
    if (w.now >= decoy.until) continue;
    if (decoy.ownerId === me.id) continue;
    if (ownerContactVisible(w, me, decoy.ownerId)) continue;
    if (blipPredicate(w, me, decoy)) return true;
  }
  return false;
}

/** The exact per-grammar blip key sets. Silhouette: the 4.2 pose shape.
 *  `return` (cycle 63, amendment 152): the coverage footprint and NOTHING
 *  else — pinned as an exact key set, so the deletion of `id`, the position,
 *  `ext` and every pose channel is structural on every blip the fuzz sees. */
const SILHOUETTE_BLIP_KEYS = ['cls', 'heading', 'id', 'k', 'speed', 't', 'x', 'y'];
const RETURN_BLIP_KEYS = ['bits', 'gx', 'gy', 'h', 'k', 't', 'w'];
/** Fields the `return` payload must NEVER grow back — asserted by name as well
 *  as by the exact key set, because each is its own disclosure channel: `id`
 *  the cross-sweep correlation handle, x/y the exact float position, `ext`
 *  the derived aspect scalar, cls/heading/speed the 4.2 pose. */
const RETURN_FORBIDDEN_KEYS = ['id', 'x', 'y', 'ext', 'cls', 'heading', 'speed'];

function verifyBlip(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BlipEvent;
  expect(ev.t).toBe(w.now);
  // Grammar shape gate: exact key sets, both directions.
  expect(Object.keys(ev).sort()).toEqual(w.radarGrammar === 'return' ? RETURN_BLIP_KEYS : SILHOUETTE_BLIP_KEYS);
  if (w.radarGrammar === 'return') {
    for (const forbidden of RETURN_FORBIDDEN_KEYS) expect(Object.hasOwn(ev, forbidden)).toBe(false);
  } else if (w.radarIdentity === 'pseudonym') {
    // Identity gate (R3), silhouette only — the `return` payload has no id at
    // all, so there is nothing to pseudonymize: in pseudonym mode a blip id
    // must NEVER be a roster ship id (the roster link is deliberately not free).
    expect(w.ships.has((ev as SilhouetteBlipEvent).id)).toBe(false);
  }
  // Every blip in a frame must be JUSTIFIED as exactly one of the two legal
  // sources: a genuine ship paint, or a decoy counter-intel paint. Anything
  // else — a fabricated footprint, a wrong rect, a mask that disagrees with
  // the hull's true silhouette in either direction, an unswept bearing, an
  // out-of-annulus point — fails both and the invariant.
  if (blipMatchesShip(w, me, ev)) return;
  expect(blipMatchesDecoy(w, me, ev)).toBe(true);
}

// shell AND torp share one verifier — with the Story 4.9 fork: a shell
// reveals at first-SIGHT, a torpedo at first-DETECT (0.75×sight, the tighter
// oracle above). Both live in world.shells, keyed by projectile id.
function verifyBallistic(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BallisticEvent;
  const sh = w.shells.get(ev.id)!;
  expect(sh).toBeDefined();
  expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y }); // current pos, never launch pos
  assertBallisticShape(ev); // no range-derivable field ever leaks
  // First-sight (shell) / first-detect (torp) OR inside an OWNED lit zone
  // (Story 1.7) — never anyone else's.
  if (sh.ownerId !== me.id) {
    const inRange = sh.kind === 'torp' ? detected(w, me, ev) : sighted(w, me, ev);
    expect(inRange || zoneCovers(w, me, ev)).toBe(true);
  }
}

function verifyBoom(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BoomEvent;
  // Boom point: sighted OR inside a zone the observer OWNS (Story 1.7 parity).
  if (ev.hit !== me.id) expect(sighted(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
  // `hit` may name a victim only when that victim's CENTER is sighted or
  // zone-covered (or the observer is the victim) — a straddling hull must not
  // leak its id.
  if (ev.hit !== undefined && ev.hit !== me.id) {
    const victim = w.ships.get(ev.hit)!.state;
    expect(sighted(w, me, victim) || zoneCovers(w, me, victim)).toBe(true);
  }
}

// A burst may reach an observer ONLY when it fired the shell (the point is its
// own click) or the burst point is sighted; and the wire shape is exactly
// {k,id,x,y} — the server-internal owner field (and any radius/range field)
// must never ride it. The owner is recovered INDEPENDENTLY from the world's
// internal tick-event buffer (where `own` legitimately lives), never from the
// registry row.
function verifyBurst(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as BurstEvent;
  expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
  const src = w.tickEvents.find((t) => t.k === 'burst' && t.id === ev.id) as
    | (BurstEvent & { own?: string })
    | undefined;
  expect(src).toBeDefined();
  // Burst point: sighted OR inside a zone the observer OWNS (Story 1.7 parity).
  if (src!.own !== me.id) expect(sighted(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
}

// THE PUBLIC REGISTER (PV 23) — `sunk` is the 4th DECLARED exception to the
// master invariant (after sp/hc/mz), reimplemented here independently of its
// registry row: a HUMAN victim's sinking is identity-only PUBLIC (allowed
// unconditionally); a DRONE victim reaches only a witness (sighted or
// owned-zone — Story 1.7) or its credited killer; the victim itself always
// hears of its own sinking; and the per-observer `seen` flag may be PRESENT
// only when the witness predicate genuinely holds — `seen` is the client's
// license to render spatially, so a wrongly-stamped flag IS a location leak.
// INDEPENDENCE SCOPE: the claim above is honest only for the GEOMETRY terms —
// `sighted`/`zoneCovers` are this file's own reimplementations. The drone
// discrimination reads the same production `wreck.isDrone` field the row
// reads, and the credited clause is the same trivial `by === me` equality, so
// a hull mis-flagged at construction (e.g. a future combat bot built through
// the drone path) would put the row and this oracle in agreement on the same
// wrong answer.
function verifySunk(w: World, me: ShipRecord, e: GameEvent): void {
  const ev = e as SunkEvent;
  // THE PAYLOAD PIN: because this event now reaches every fogged client, the
  // wire shape itself is the anti-leak boundary — the keys must be a subset of
  // exactly {k,id,by,seen}. A positional (or any other) field added at the
  // world emission, or a materialize() regression back to pass-through, fails
  // HERE even though every visibility clause still holds.
  for (const key of Object.keys(ev)) expect(['k', 'id', 'by', 'seen']).toContain(key);
  if (ev.id === me.id) return;
  const wreck = w.ships.get(ev.id);
  if (wreck === undefined) {
    // No wreck record this tick. Production visible() still delivers to the
    // CREDITED KILLER (sunkCreditedTo consults no record), and ONLY to them:
    // sunkWitnessed and the public clause both fail-close without a record.
    expect(ev.by).toBe(me.id);
    // The witness predicate fail-closes too, so `seen` must be ABSENT.
    expect(ev.seen).toBeUndefined();
    return;
  }
  const witnessed = sighted(w, me, wreck.state) || zoneCovers(w, me, wreck.state);
  // A drone sinking is NEVER public: witnessed, or this observer's own kill.
  if (wreck.isDrone) expect(witnessed || ev.by === me.id).toBe(true);
  // In EVERY case: `seen` present ⇒ the sight-or-owned-zone condition holds.
  if (ev.seen !== undefined) {
    expect(ev.seen).toBe(true); // never emitted as false
    expect(witnessed).toBe(true);
  }
}

/**
 * The foghorn VOLUME-BAND oracle (Story 4.9, amendment 122 — supersedes
 * amendment 53's three tiers), reimplemented test-locally from the amendment
 * text — NEVER the production hornBandFor. The band is which eighth of the
 * LISTENER'S own INTEL range (this file's effRadar reimplementation —
 * boon-widened, NEVER dazzle-scaled, which is what makes "dazzle cannot
 * deafen" true by construction) the honker sits in: ceil(8 × d / intel), d ==
 * 0 → band 1, boundaries inclusive; beyond band 8 → inaudible. Islands MUFFLE
 * once, post-resolution, to max(5, band + 2) — silent past 8. Amendment 53's
 * max() clamps are RETIRED; nothing here reads effSight or muzzleFlash.
 *
 * THE PLATEAU FLOOR (review fix, anti-cheat): the RAW band is floored to
 * `max(band, 4)` BEFORE the muffle. Bands 1-4 are indistinguishable in every
 * honest client surface (gain 1.0 and the same chevron weight for all four), so
 * transmitting which of them a honker sits in is pure range resolution for a
 * modified client and nothing else — amendment 51 bounds the disclosure to
 * bearing and VOLUME TIER. Re-derived here from that reasoning, not read off
 * production: flooring the EMITTED value instead would leak the very bit the
 * floor removes (a blocked raw 1-3 landing at 5 while a blocked raw 4 lands at
 * 6 differences straight back to the plateau), and would put a blocked
 * point-blank honk at 87.5% when amendment 54 ratifies 75% at the truesight
 * edge. The DOMAIN CHECK is the second half of the same fail-closed discipline:
 * only a POSITIVE FINITE listener range — tested before the `d === 0`
 * short-circuit, which never reads it — and a finite integer in 1..8 is a band
 * at all.
 */
function hornBandOracle(w: World, me: ShipRecord, p: { x: number; y: number }): number | null {
  const intel = effRadar(me);
  if (!Number.isFinite(intel) || intel <= 0) return null;
  const d = dist(me.state, p);
  const band = d === 0 ? 1 : Math.ceil((8 * d) / intel);
  if (!Number.isInteger(band) || band < 1 || band > 8) return null;
  const floored = Math.max(band, 4);
  const emitted = clearLos(me.state, p, w.map.islands) ? floored : Math.max(5, floored + 2);
  return emitted > 8 ? null : emitted;
}

const EVENT_VERIFIERS: Record<string, EventVerifier> = {
  blip: verifyBlip,
  shell: verifyBallistic,
  torp: verifyBallistic,
  boom: verifyBoom,
  burst: verifyBurst,
  sunk: verifySunk,
  // Self-private kinds: each may only ever reach the ship its `id` names.
  dmg: (_w, me, e) => expect((e as DamageEvent).id).toBe(me.id), // victim-private
  pt: (_w, me, e) => expect((e as PointEvent).id).toBe(me.id), // earner-private
  // DAMAGE CONTROL (2026-08-04): healer-private on the pt/bn terms, and the
  // key set IS the severity oracle — a heal may carry NO hp amount, no pool
  // total, no maxHp, nothing another observer could difference against a
  // watched hp bar. Reimplemented here independently of the registry row.
  heal: (_w, me, e) => {
    const ev = e as HealEvent;
    expect(ev.id).toBe(me.id);
    expect(Object.keys(ev).sort()).toEqual(['id', 'k']);
  },
  bn: (_w, me, e) => {
    // Spender-private (Story 2.7), and a valid catalog id: an enemy build can
    // never ride another observer's frame, and a fabricated boon id can never
    // materialize (the server only ever emits what it just applied).
    expect((e as BoonFitEvent).id).toBe(me.id);
    expect(Object.hasOwn(BOON_CATALOG, (e as BoonFitEvent).boon)).toBe(true);
  },
  // Story 4.3 — the gunnery conversation's three DECLARED exceptions, each
  // reimplemented here independently of its registry row (the header rule).
  sp: (_w, me, e) => {
    // FALL OF SHOT (amendment 16): shooter-private — the `id` names the
    // SHOOTER and only that observer may receive it, at ANY range (a declared
    // exception: the point is one the shooter authored). Wire shape carries
    // no victim/severity field — exactly {k,id,x,y}.
    const ev = e as SplashEvent;
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
    expect(ev.id).toBe(me.id);
  },
  hc: (_w, me, e) => {
    // HIT CALL (amendments 17/18): shooter-private, position only. The exact
    // key set IS the severity oracle: no victim id, no amount/hp, no kill
    // flag, no hull count can ride a {k,id,x,y} shape — and `id` must be the
    // OBSERVER (the shooter), never a victim reference.
    const ev = e as HitCallEvent;
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'x', 'y']);
    expect(ev.id).toBe(me.id);
  },
  mz: (w, me, e) => {
    // MUZZLE FLASH (amendments 15/19/20; halo MOVED to 5/8 by Story 4.9,
    // amendment 119): the halo is the CONSTANT SIGHT * 1.25 — independently
    // re-derived here as a literal (a 1.5 here between 412.5u and 495u would
    // make this bound silently non-tight — the exact defect Story 4.9's wave
    // 1 found), deliberately NOT the observer's dazzle-scaled or boon-widened
    // sight and with NO owned-zone term — plus island LOS (islands block
    // every sensor at all ranges). The exact key set is the identity oracle:
    // {k,x,y} carries no shooter id, hue, class, weapon, or heading for ANY
    // observer.
    const ev = e as { k: 'mz'; x: number; y: number };
    expect(Object.keys(ev).sort()).toEqual(['k', 'x', 'y']);
    expect(dist(me.state, ev)).toBeLessThanOrEqual(SIGHT * 1.25);
    expect(clearLos(me.state, ev, w.map.islands)).toBe(true);
  },
  sm: (w, me, e) => {
    // WOUNDED SMOKE (Story 4.4, amendments 40-50; reach MOVED with the
    // muzzle-flash halo to 5/8 by Story 4.9, amendment 119 — the amendment 42
    // one-constant coupling doing its job) — the FIFTH declared exception.
    // The halo is the CONSTANT SIGHT * 1.25, independently re-derived here as
    // a literal (deliberately NOT shared with the mz verifier above, per the
    // header's reimplementation rule) — never the observer's dazzle-scaled or
    // boon-widened sight, and with NO owned-zone term — plus island LOS
    // (islands block every sensor at all ranges). The exact key set IS the
    // identity oracle: {k,x,y,tier} carries no ship id, hue, class, hp, or
    // fraction for ANY observer — the smoking captain and spectators included
    // — and `tier` is the two-value enum, never a number an hp could be
    // recovered from.
    const ev = e as { k: 'sm'; x: number; y: number; tier: number };
    expect(Object.keys(ev).sort()).toEqual(['k', 'tier', 'x', 'y']);
    expect([1, 2]).toContain(ev.tier);
    expect(dist(me.state, ev)).toBeLessThanOrEqual(SIGHT * 1.25);
    expect(clearLos(me.state, ev, w.map.islands)).toBe(true);
  },
  fh: (w, me, e) => {
    // THE FOGHORN (Story 4.5, amendments 51-58; Story 4.9's eight-band
    // rebase, amendment 122) — the SIXTH declared exception, reimplemented
    // here independently of its registry row (see hornBandOracle below —
    // never the production hornBandFor). The payload KEY SET is the anti-leak
    // oracle: {k,h,self} for the honker, {k,h,b,v} for a fogged listener —
    // and NO fogged observer's payload may EVER carry an `id`, `x`, or `y`
    // key (x/y are the spectator path's alone), nor any correlation handle
    // (amendment 45's rule verbatim). Every payload must also be JUSTIFIED by
    // a real honk this tick: a world-internal `fh` subject whose
    // independently-computed band and bearing for THIS observer match the
    // wire exactly.
    const ev = e as { k: 'fh'; h: string; self?: true; b?: number; v?: number };
    expect((HORN_IDS as readonly string[]).includes(ev.h)).toBe(true);
    for (const forbidden of ['id', 'x', 'y']) expect(Object.hasOwn(ev, forbidden)).toBe(false);
    const subjects = w.tickEvents.filter((t) => t.k === 'fh') as Array<{ k: 'fh'; h: string; x: number; y: number; id: string }>;
    if (ev.self === true) {
      expect(Object.keys(ev).sort()).toEqual(['h', 'k', 'self']);
      expect(subjects.some((s) => s.id === me.id && s.h === ev.h)).toBe(true);
      return;
    }
    expect(Object.keys(ev).sort()).toEqual(['b', 'h', 'k', 'v']);
    // 4..8, not 1..8: the plateau floor means bands 1-3 never reach the wire
    // (review fix — they carry no gain or chevron-weight difference, so they
    // were pure range resolution for a modified client).
    expect([4, 5, 6, 7, 8]).toContain(ev.v);
    expect(ev.b).toBeGreaterThanOrEqual(0);
    expect(ev.b).toBeLessThan(2 * Math.PI);
    const justified = subjects.some(
      (s) =>
        s.id !== me.id &&
        s.h === ev.h &&
        hornBandOracle(w, me, s) === ev.v &&
        wrapPositive(bearing(me.state, s)) === ev.b,
    );
    expect(justified).toBe(true);
  },
  torpU: (w, me, e) => {
    // A homing-track UPDATE (Story 2.8): only a LIVE steering torpedo the
    // observer has ALREADY been revealed may re-emit, at its current pos, in
    // the constant-free ballistic shape, and only while the observer can see
    // it (owner / sight+LOS / owned zone — the reveal predicate).
    const ev = e as TorpedoUpdateEvent;
    const sh = w.shells.get(ev.id)!;
    expect(sh).toBeDefined();
    expect(sh.kind).toBe('torp');
    expect(sh.homing).toBeDefined();
    expect(Object.keys(ev).sort()).toEqual(['id', 'k', 't', 'vx', 'vy', 'x', 'y']);
    expect({ x: ev.x, y: ev.y }).toEqual({ x: sh.x, y: sh.y });
    expect(me.seenBallistics.has(ev.id)).toBe(true); // an update only ever follows a reveal
    // Story 4.9: updates ride the DETECT gate, matching the torp reveal —
    // corrections stop exactly where first reveal starts.
    if (sh.ownerId !== me.id) expect(detected(w, me, ev) || zoneCovers(w, me, ev)).toBe(true);
  },
  spawn: (w, me, e) => {
    // Spawn point: sighted OR inside a zone the observer OWNS (Story 1.7).
    const p = e as SpawnEvent;
    if (p.id !== me.id) expect(sighted(w, me, p) || zoneCovers(w, me, p)).toBe(true);
  },
};

function verifyEvent(w: World, me: ShipRecord, e: GameEvent): void {
  // OWN-property lookup: a leaked inherited key like 'constructor' must throw
  // "unexpected event kind leaked", never resolve an inherited Function off the
  // map's prototype. No verifier == no registry row we recognize: fail-closed,
  // exactly as the old `default: throw` did. Two ways this fires as a HARD
  // failure: a kind with no registry row at all, and — because the completeness
  // suite keeps this map and the registry in lockstep — a kind whose row exists
  // but lacks a verifier.
  if (!Object.hasOwn(EVENT_VERIFIERS, e.k)) {
    throw new Error(`unexpected event kind leaked into a frame: ${(e as GameEvent).k}`);
  }
  EVENT_VERIFIERS[e.k](w, me, e);
}

/** Every flag combination the radar realism cycle ships (amendment 63 — the
 *  two modes are orthogonal, so the invariant must hold under all four).
 *  Labels feed it.each; the default combo runs FIRST so a regression in the
 *  shipped behavior reads first in the output. */
const MODE_COMBOS: [string, WorldOptions][] = [
  ['silhouette/roster (default)', {}],
  ['return/roster', { radarGrammar: 'return' }],
  ['silhouette/pseudonym', { radarIdentity: 'pseudonym' }],
  ['return/pseudonym', { radarGrammar: 'return', radarIdentity: 'pseudonym' }],
];

describe('perception — THE INVARIANT (random worlds, seeded)', () => {
  it.each(MODE_COMBOS)('no frame ever references anything outside sight ∪ this-tick paints [%s]', (_label, modeOpts) => {
    const rng = mulberry32(0x5eed_f0f0);
    for (let world = 0; world < 20; world++) {
      const w = new World(rng.int(0, 2 ** 31 - 1), CONFIG.match.fillTo, CONFIG.zone, modeOpts);
      const ids: string[] = [];
      const shipCount = rng.int(3, 6);
      for (let i = 0; i < shipCount; i++) {
        const id = `p${i}`;
        ids.push(id);
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.85);
        const rec = place(w, id, Math.cos(ang) * r, Math.sin(ang) * r, rng.float(0, TAU));
        rec.sweepAngle = rng.float(0, TAU); // decorrelate paint windows
        // Random INTEL boons so the invariant is exercised at WIDENED
        // per-observer radii too (Story 2.8: the boon economy replaced the
        // legacy counts). Ids are stacked directly and the world-side cache
        // recomputed the way World does (effectiveStats over resolved defs);
        // the CHECKS recompute ranges independently from the raw id list
        // (effSight/effRadar).
        const intel: string[] = [];
        for (let n = rng.int(0, 2); n > 0; n--) intel.push('intelTruesight');
        for (let n = rng.int(0, 2); n > 0; n--) intel.push('intelRadar');
        for (let n = rng.int(0, 5); n > 0; n--) intel.push('intelSweep'); // toward the rpm cap
        rec.boons = intel;
        rec.boonDefs = resolveBoons(intel);
        rec.stats = effectiveStats(rec.cls, rec.boonDefs);
      }
      // WOUNDED SMOKE (Story 4.4): guarantee the sm oracle is EXERCISED, not
      // vacuous — two hulls start wounded, one in each band, so every world
      // emits `sm` pulses on the cadence. Delivery is guaranteed at minimum to
      // the smoking captain itself (dist 0 passes the constant halo trivially
      // — amendment 46: own smoke rides the same row), so the verifier always
      // runs against real frames. The random scratches below (the heal-spend
      // block) rarely cross a band on their own.
      w.ships.get(ids[0])!.hp = w.ships.get(ids[0])!.stats.maxHp * 0.4; // tier 1 band
      w.ships.get(ids[1])!.hp = w.ships.get(ids[1])!.stats.maxHp * 0.2; // tier 2 band
      for (let s = 0; s < rng.int(0, 5); s++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectShell(
          w,
          `inj${s}`,
          ids[rng.int(0, ids.length - 1)],
          Math.cos(ang) * r,
          Math.sin(ang) * r,
          rng.float(0, TAU),
          rng.float(20, CONFIG.vision.radar), // gun range base = radar range (shellRange retired)
          rng.float(0, 1) < 0.5, // half the shells are targeted bursters (real gun shape)
        );
      }
      for (let s = 0; s < rng.int(0, 4); s++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectMine(w, `mine${s}`, ids[rng.int(0, ids.length - 1)], Math.cos(ang) * r, Math.sin(ang) * r);
      }
      // Random lit zones (Story 1.7) so the invariant exercises the owned-zone
      // reveal source AND the radar-gated litZones channel in the same frames.
      for (let z = 0; z < rng.int(0, 3); z++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectZone(w, `zone${z}`, ids[rng.int(0, ids.length - 1)], Math.cos(ang) * r, Math.sin(ang) * r);
      }
      // Random decoy buoys (Story 1.8) so the invariant exercises BOTH decoy
      // channels in the same frames: the truth (decoys view — owner/sighted/
      // own-zone only) and the lie (counter-intel blips through the ship-blip
      // predicate with owner-id substitution).
      for (let d = 0; d < rng.int(0, 3); d++) {
        const ang = rng.float(0, TAU);
        const r = rng.float(0, w.map.radius * 0.9);
        injectDecoy(w, `decoy${d}`, ids[rng.int(0, ids.length - 1)], Math.cos(ang) * r, Math.sin(ang) * r);
      }
      for (let tick = 1; tick <= 6; tick++) {
        for (const id of ids) {
          w.submitInput(id, {
            seq: tick,
            throttle: rng.float(-1, 1),
            rudder: rng.float(-1, 1),
            aim: rng.float(-Math.PI, Math.PI),
            fireSeq: rng.float(0, 1) < 0.4 ? tick : 0, // ~40% of ticks land a fresh click
            aimDist: rng.float(0, 900),
            fireT: 0,
            // Half the clicks target the torpedo slot with a RANDOM aim, so the
            // invariant worlds exercise the out-of-arc / cooling / no-ammo
            // denials alongside genuine launches — verifyDenied proves every
            // one is owner-only with a legal reason. NOTE: these worlds place
            // only default-hull torpedo boats (place → addShip), so the 'blocked'
            // reason (mineLayer stern-drop obstruction) is structurally
            // unreachable HERE; its owner-only privacy is pinned by the directed
            // tests in denials.test.ts, not by this fuzz.
            slot: rng.float(0, 1) < 0.5 ? 1 : 0,
            // ~30% of ticks also press the ability slot (TB boost in slot 2):
            // repeated presses drain the 1-charge pool into no-ammo denials.
            actSeq: rng.float(0, 1) < 0.3 ? tick : 0,
            actSlot: 2,
            // THE FOGHORN (Story 4.5): every ship honks on tick 1 (the fh
            // oracle is EXERCISED, never vacuous — the honker's own self
            // payload is guaranteed, and cross-ship deliveries land at random
            // distances/LOS so all three tiers and the island muffle get
            // fuzzed), plus ~30% random later presses (which the 1500ms
            // cooldown consumes and drops inside this 300ms run — the
            // stale/early-press path is fuzzed too).
            hornSeq: tick === 1 || rng.float(0, 1) < 0.3 ? tick : 0,
          });
        }
        // DAMAGE CONTROL (2026-08-04): drive REAL heal spends through the fuzz
        // so the self-private `heal` row and the repairHp pin are exercised
        // rather than vacuous — ~25% of ticks a random hull takes a scratch,
        // banks a level, and converts it. (The spend fails closed on a full or
        // dead hull; either outcome is a legal world state to verify.)
        if (rng.float(0, 1) < 0.25) {
          const patient = w.ships.get(ids[rng.int(0, ids.length - 1)])!;
          patient.hp = Math.max(1, patient.hp - rng.float(10, 60));
          w.grantXp(patient, 1);
          w.spendPoint(patient.id, HEAL_CHOICE);
        }
        w.step();
        // Build each observer's frame exactly once per tick (wire semantics).
        for (const id of ids) verifyFrame(w, id, buildFrame(w, id));
      }
    }
  });
});

// ---------- SIGNAL REGISTRY completeness (CI-by-construction) -----------------
//
// These assertions make "a signal without a passing invariant case fails CI by
// construction" a structural property, not a discipline. SIGNAL_REGISTRY is
// enumerated here ONLY to compare key sets — never called as a visibility
// oracle (the reimplemented predicates above stay the sole oracle). A future
// dev adding a 13th row sees this block fail until they add its verifier.

describe('perception — SIGNAL REGISTRY completeness', () => {
  // The four contact-like pseudo-rows are verified through the contacts/mines/
  // litZones/decoys frame channels (verifyFrame/verifyMine/verifyLitZone/
  // verifyDecoy), not through EVENT_VERIFIERS.
  const CONTACT_LIKE = ['contact', 'mine', 'litzone', 'decoy'];
  // The 17 GameEvent kinds — each MUST have an EVENT_VERIFIERS entry (Story
  // 2.1 deleted 'heal' with the REPAIR spend; Story 2.7 added self-private
  // 'bn'; Story 4.3 added the gunnery rows 'sp'/'hc'/'mz'; 2026-08-04's DAMAGE
  // CONTROL strip brought 'heal' BACK, on stricter no-severity terms; Story
  // 4.4 added the anonymous wounded-smoke row 'sm'; Story 4.5 added the
  // bearing-only foghorn row 'fh').
  const EVENT_KINDS = ['blip', 'shell', 'torp', 'torpU', 'boom', 'burst', 'sunk', 'spawn', 'dmg', 'pt', 'bn', 'sp', 'hc', 'mz', 'heal', 'sm', 'fh'];
  const EXPECTED_KEYS = [...CONTACT_LIKE, ...EVENT_KINDS];

  it('has exactly the 21 expected channel keys (17 event kinds + contact + mine + litzone + decoy)', () => {
    expect(Object.keys(SIGNAL_REGISTRY).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(SIGNAL_REGISTRY)).toHaveLength(21);
  });

  it('every row keys itself: row.eventType === its registry key', () => {
    for (const [key, row] of Object.entries(SIGNAL_REGISTRY)) {
      expect(row.eventType).toBe(key);
    }
  });

  it('the four contact-like pseudo-rows exist (verified via the contacts/mines/litZones/decoys channels)', () => {
    expect(SIGNAL_REGISTRY.contact).toBeDefined();
    expect(SIGNAL_REGISTRY.mine).toBeDefined();
    expect(SIGNAL_REGISTRY.litzone).toBeDefined();
    expect(SIGNAL_REGISTRY.decoy).toBeDefined();
  });

  it('every event-kind row has a test-local verifier — a row without one FAILS HERE', () => {
    const rowEventKinds = Object.keys(SIGNAL_REGISTRY).filter((k) => !CONTACT_LIKE.includes(k));
    // Key-set equality both ways: a registry row lacking a verifier AND a stray
    // verifier with no row are each a hard failure. THIS is the CI-by-construction
    // gate — a new event row turns this red until its verifier lands.
    expect(Object.keys(EVENT_VERIFIERS).sort()).toEqual(rowEventKinds.sort());
  });

  it('the registry AND every row are frozen (rows are added at authoring time only)', () => {
    expect(Object.isFrozen(SIGNAL_REGISTRY)).toBe(true);
    for (const row of Object.values(SIGNAL_REGISTRY)) {
      expect(Object.isFrozen(row)).toBe(true);
    }
  });
});
