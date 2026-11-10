// THE RADIO BEACONS AND THE ANTI-CHEAT CHOKEPOINT (Story 10.8, Eric
// 2026-11-06, epic-10 amendment 14).
//
// A beacon is PUBLIC — its cycle, position and early sink time ride the
// Colyseus schema — and it is NOT a ship. So the perception invariant has two
// halves for it, both pinned here as properties over real frames:
//
//   1. NOTHING ABOUT A BEACON RIDES A FRAME. No frame of any observer —
//      fogged or spectator — carries a beacon's id, a contact that is not a
//      ship, or any entity (contact, blip, wake, mine, zone) positioned on a
//      beacon's centre. The one carrier is the existing ANONYMOUS
//      wounded-smoke row `sm` ({k,x,y,tier}, one of the six exceptions,
//      unchanged), which a hurt beacon emits exactly as a hurt ship does
//      (R11) at its already-public position; a shot AIMED at that point ends
//      there like a shot aimed at any water. The exception count stays SIX:
//      the registry-completeness pin in perception.test.ts is untouched.
//
//   2. BEACONS CHANGE NO FRAME BUT THE RECEIVER'S OWN XP. Two worlds on the
//      same seeds, differing only in beacons on / off, with stationary hulls
//      and nobody shooting: every observer's frames are IDENTICAL except the
//      receiving hulls' own self-private XP fields (`xp`, `lvl`, `pts`,
//      `offer`, and the hull's own `pt`). A receiver gets no event, no paint,
//      no tell.
//
// Plus the two existing shooter-side rows a beacon hit reuses: the `hc` hit
// call reaches the shooter alone, and a hurt beacon's `sm` reaches exactly
// the observers the smoke row's own gate admits.

import { describe, it, expect } from 'vitest';
import { CONFIG, mulberry32, type FrameMsg, type GameEvent, type Vec2 } from '@salvo/shared';
import type { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { B, DT, SURFACE_MS, bareWorld, captain, inp, moveTo, openCycle, run, seatBeacons } from './beaconFixture.js';

const TAU = Math.PI * 2;
const SETTLE = Math.ceil(360 / ((CONFIG.mainBattery.traverseDegPerS * DT) / 1000)) + 1;

/** Every object anywhere in `value` that carries a numeric x and y. */
function positioned(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const v of value) positioned(v, out);
  } else if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.x === 'number' && typeof o.y === 'number') out.push(o);
    for (const v of Object.values(o)) positioned(v, out);
  }
  return out;
}

/** Event kinds that mark where a SHOT ended (a point its shooter chose). */
const SHOT_ENDS = new Set(['burst', 'boom', 'hc', 'sp']);

const on = (o: Record<string, unknown>, p: Vec2): boolean =>
  Math.abs((o.x as number) - p.x) < 1e-6 && Math.abs((o.y as number) - p.y) < 1e-6;

/** THE BEACON HALF OF THE INVARIANT, on one frame. Returns how many `sm`
 *  puffs it carried from a beacon (the non-vacuity ledger). */
function verifyNoBeacon(frame: FrameMsg, w: World, tag: string): number {
  const text = JSON.stringify(frame);
  expect(text.includes('bcn-'), `${tag}: a beacon id rode the frame`).toBe(false);
  // Every contact is a SHIP, at that ship's own position.
  for (const c of frame.contacts) {
    const ship = [...w.ships.values()].some((s) => on(c as unknown as Record<string, unknown>, s.state));
    expect(ship, `${tag}: contact ${c.id} is no ship`).toBe(true);
  }
  // Nothing that stands for an ENTITY sits on a beacon's centre — no contact,
  // blip, wake, mine or zone. What may: the anonymous smoke row (bare), and
  // the termination of a shot somebody AIMED at that public point (its
  // burst / boom, the shooter's own hit call or splash).
  let puffs = 0;
  const { you: _own, ...rest } = frame;
  for (const o of positioned(rest)) {
    if (!w.beacons.records.some((b) => on(o, b))) continue;
    expect(SHOT_ENDS.has(o.k as string) || o.k === 'sm', `${tag}: a ${String(o.k)} on a beacon's centre`).toBe(true);
    if (o.k !== 'sm') continue;
    expect(Object.keys(o).sort(), `${tag}: the puff carries more than {k,x,y,tier}`).toEqual(['k', 'tier', 'x', 'y']);
    puffs += 1;
  }
  return puffs;
}

describe('radio beacons — no frame carries one (property, seeded worlds)', () => {
  it('fogged and spectator frames alike: no beacon id, no non-ship contact, nothing on a beacon\'s centre but anonymous `sm`', () => {
    const rng = mulberry32(0xbeac0);
    const ledger = { frames: 0, spectator: 0, puffs: 0, hc: 0, booms: 0, earlySinks: 0, levels: 0 };
    for (let world = 0; world < 3; world += 1) {
      const w = bareWorld(7000 + world, { pseudonymSeed: 900 + world });
      const spots: Vec2[] = [{ x: 0, y: 0 }, { x: 650, y: 0 }];
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        // Around one of the two beacons, clear of its body, inside its paying circle.
        const around = spots[i % 2];
        const ang = rng.float(0, TAU);
        const d = rng.float(110, 420);
        const rec = captain(w, `p${i}`, around.x + Math.cos(ang) * d, around.y + Math.sin(ang) * d, rng.float(0, TAU));
        rec.sweepAngle = rng.float(0, TAU);
        rec.xpMs = CONFIG.xp.levelMs - rng.int(200, 4000); // a level lands inside the run
        ids.push(rec.id);
      }
      const dead = captain(w, 'dead', 300, 300); // a spectator (sunk before the run)
      w.respawnEnabled = false;
      w.sinkShip('dead');
      ids.push(dead.id);
      const [hurt, fresh] = seatBeacons(w, SURFACE_MS + DT, spots);
      hurt.hp = B.hp * CONFIG.damageBands.amberBelow - 1; // smoking, and close enough to destroy
      let seq = 1;
      for (let tick = 0; tick < SETTLE + 220; tick += 1) {
        // Everyone trains on a beacon; from SETTLE on they click and hold the secondaries too.
        seq += 1;
        ids.slice(0, 5).forEach((id, i) => {
          const me = w.ships.get(id)!.state;
          const target = i % 2 === 0 ? hurt : fresh;
          const aim = Math.atan2(target.y - me.y, target.x - me.x);
          const firing = tick >= SETTLE;
          w.submitInput(id, inp(seq, { aim, aimDist: Math.hypot(target.x - me.x, target.y - me.y), fireSeq: firing ? seq : 0, sec: firing && tick % 40 < 20 }));
        });
        if (tick === SETTLE + 60) hurt.hp = Math.min(hurt.hp, 1); // the next blow destroys it
        w.step();
        for (const id of ids) {
          const frame = buildFrame(w, id, 'active');
          ledger.frames += 1;
          if (frame.spec) ledger.spectator += 1;
          ledger.puffs += verifyNoBeacon(frame, w, `world ${world} tick ${tick} ${id}`);
          ledger.hc += frame.events.filter((e) => e.k === 'hc').length;
          ledger.booms += frame.events.filter((e) => e.k === 'boom' || e.k === 'burst').length;
          ledger.levels += frame.events.filter((e) => e.k === 'pt').length;
        }
      }
      if (hurt.sinkT > 0) ledger.earlySinks += 1;
    }
    // NON-VACUITY: the oracle saw real beacon traffic of every kind.
    expect(ledger.spectator).toBeGreaterThan(0);
    expect(ledger.puffs).toBeGreaterThan(0);
    expect(ledger.hc).toBeGreaterThan(0);
    expect(ledger.booms).toBeGreaterThan(0);
    expect(ledger.levels).toBeGreaterThan(0);
    expect(ledger.earlySinks).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// THE TWO-WORLD DIFFERENTIAL
// ---------------------------------------------------------------------------

/** A frame with the receiver's OWN XP fields removed — the only fields a
 *  beacon may move. */
function withoutOwnXp(frame: FrameMsg, me: string): unknown {
  const you = frame.you === undefined ? undefined : { ...frame.you, xp: 0, lvl: 0, pts: 0, offer: [] };
  const events = frame.events.filter((e: GameEvent) => !(e.k === 'pt' && e.id === me));
  return { ...frame, you, events };
}

describe('radio beacons — beacons on vs off changes nothing but the receiver\'s own XP', () => {
  it('same seeds, stationary hulls, nobody shooting: every observer\'s frames are identical once the own XP fields are set aside', () => {
    // Scheduled drops OFF in both: this contract is beacons on/off, and drop placement legitimately reads the beacon keep-out.
    const build = (beacons: boolean): World => bareWorld(7100, { pseudonymSeed: 4242, beacons, drops: false });
    const withB = build(true);
    const without = build(false);
    const ids = ['solo', 'pairA', 'pairB', 'far', 'gone'];
    for (const w of [withB, without]) {
      ids.forEach((id, i) => captain(w, id, 4000, -3000 + i * 400)); // parked clear of every keep-out consideration
      w.respawnEnabled = false;
      openCycle(w, SURFACE_MS - 20 * DT);
    }
    // The set the production rule placed; the hulls take station around it in BOTH worlds.
    const chart = withB.beaconChart;
    expect(chart.beacons.length).toBeGreaterThan(1);
    expect(without.beaconChart.beacons).toHaveLength(0);
    const [one, two] = chart.beacons;
    const stations: Record<string, Vec2> = {
      solo: { x: one.x + 200, y: one.y }, // alone in a circle
      pairA: { x: two.x + 150, y: two.y + 100 }, // sharing one
      pairB: { x: two.x - 150, y: two.y - 100 },
      far: { x: one.x, y: one.y + B.rangeU + 300 }, // in sight of a receiver, paid nothing
      gone: { x: two.x, y: two.y + 300 },
    };
    for (const w of [withB, without]) {
      for (const id of ids) {
        const rec = w.ships.get(id)!;
        moveTo(rec, stations[id].x, stations[id].y);
        rec.xpMs = CONFIG.xp.levelMs - 1500; // every hull levels inside the run — sooner where a beacon pays
      }
      w.sinkShip('gone'); // one observer rides out the run sinking, then as a wreck
    }
    let differed = 0;
    let compared = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      withB.step();
      without.step();
      for (const id of ids) {
        const a = buildFrame(withB, id);
        const b = buildFrame(without, id);
        compared += 1;
        if (JSON.stringify(a) !== JSON.stringify(b)) differed += 1;
        expect(withoutOwnXp(a, id), `tick ${tick} ${id}`).toEqual(withoutOwnXp(b, id));
      }
    }
    // NON-VACUITY: the beacons really paid — receivers' frames differed, by their own XP alone.
    expect(differed).toBeGreaterThan(0);
    expect(differed).toBeLessThan(compared);
    const xp = (w: World, id: string): number => w.ships.get(id)!.beaconXpMs;
    expect(xp(withB, 'solo')).toBeGreaterThan(xp(withB, 'pairA'));
    expect(xp(withB, 'pairA')).toBe(xp(withB, 'pairB'));
    expect(xp(withB, 'pairA')).toBeGreaterThan(0);
    expect([xp(withB, 'far'), xp(withB, 'gone')]).toEqual([0, 0]);
    for (const id of ids) expect(xp(without, id)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// THE SHOOTER-SIDE ROWS A BEACON HIT REUSES
// ---------------------------------------------------------------------------

describe('radio beacons — the existing rows a beacon hit reuses', () => {
  /** Step once and return every listed observer's frame. */
  const frames = (w: World, ids: readonly string[]): Record<string, FrameMsg> => {
    w.step();
    return Object.fromEntries(ids.map((id) => [id, buildFrame(w, id)]));
  };

  it('`hc` for a beacon hit reaches the SHOOTER only; a watcher in plain sight sees the impact and no victim id', () => {
    const w = bareWorld(7200);
    const shooter = captain(w, 'a', 0, 0);
    captain(w, 'watch', 150, 300); // in plain sight of the beacon and the shooter
    const [beacon] = seatBeacons(w, SURFACE_MS + DT, [{ x: 0, y: 300 }]);
    const aim = Math.PI / 2;
    w.submitInput('a', inp(1, { aim, aimDist: 300 }));
    run(w, SETTLE);
    w.submitInput('a', inp(2, { aim, aimDist: 300, fireSeq: 1 }));
    const seen = { a: [] as GameEvent[], watch: [] as GameEvent[] };
    for (let i = 0; i < 60; i += 1) {
      const f = frames(w, ['a', 'watch']);
      seen.a.push(...f.a.events);
      seen.watch.push(...f.watch.events);
    }
    expect(beacon.hp).toBeLessThan(B.hp);
    expect(seen.a.filter((e) => e.k === 'hc').length).toBeGreaterThan(0);
    for (const e of seen.a) if (e.k === 'hc') expect(Object.keys(e).sort()).toEqual(['id', 'k', 'x', 'y']);
    expect(seen.watch.filter((e) => e.k === 'hc')).toEqual([]);
    const impacts = seen.watch.filter((e) => e.k === 'boom' || e.k === 'burst');
    expect(impacts.length).toBeGreaterThan(0);
    for (const e of [...seen.a, ...seen.watch]) expect((e as { hit?: string }).hit).toBeUndefined();
    expect(shooter.damageDealt).toBeGreaterThan(0);
  });

  it('a hurt beacon\'s `sm` passes the smoke row\'s own gate: an observer inside the halo gets the bare puff, one beyond it gets nothing', () => {
    const w = bareWorld(7201);
    const near = captain(w, 'near', 250, 0);
    const far = captain(w, 'far', 0, 0);
    const [beacon] = seatBeacons(w, SURFACE_MS + DT, [{ x: 0, y: 0 }]);
    const halo = near.stats.radarRange * CONFIG.vision.muzzleFlashFactor;
    moveTo(far, halo + 100, 0);
    expect(250).toBeLessThan(halo);
    beacon.hp = B.hp * CONFIG.damageBands.criticalBelow - 1;
    const got = { near: [] as GameEvent[], far: [] as GameEvent[] };
    for (let i = 0; i < Math.ceil(CONFIG.smoke.puffIntervalMs / DT) + 2; i += 1) {
      const f = frames(w, ['near', 'far']);
      got.near.push(...f.near.events.filter((e) => e.k === 'sm'));
      got.far.push(...f.far.events.filter((e) => e.k === 'sm'));
    }
    expect(got.near.length).toBeGreaterThan(0);
    for (const e of got.near) expect(e).toEqual({ k: 'sm', x: beacon.x, y: beacon.y, tier: 2 });
    expect(got.far).toEqual([]);
  });
});
