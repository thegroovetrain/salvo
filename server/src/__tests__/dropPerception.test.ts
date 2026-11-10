// THE AIRDROPS AND THE ANTI-CHEAT CHOKEPOINT (Story 10.9, Eric 2026-11-08,
// epic-10 amendment 18, ruling R3: "stat glyph at SIGHT ONLY; on radar an
// anonymous small blip").
//
// A crate is NOT a ship and NOT public: nothing about it rides the schema, so
// the ONLY ways a drop may reach a client are the two perception arms
// (`spec-10-9-airdrops.md` I/O rows "Perception, sighted" / "Perception,
// radar"), and nobody but the collector gets the pickup ("Sail-over"). The
// perception.test.ts invariant pins each arm by oracle over random worlds;
// this file pins the whole, as properties over real frames:
//
//   1. THE TWO-WORLD DIFFERENTIAL. Two worlds on the same seeds, differing
//      only in one crate on the water, stationary hulls, nobody shooting:
//      for an observer who can neither see nor paint the crate, every frame
//      is BYTE-IDENTICAL; for one who can, the frames differ ONLY by the
//      `drops` channel (sight) and/or ONE blip carrying the crate's fuzzed
//      disc rect (radar) — nothing else moves. A spectator gets the `drops`
//      row and never a blip.
//
//   2. THE POSITION RIDES NOWHERE ELSE. Across every frame of every observer,
//      the crate's exact float coordinates and its id appear ONLY inside
//      `drops[]` — never in a contact, an event, a zone, a `you`, or a blip
//      (the blip's rect is cell-space and fuzzed, not a position).
//
//   3. THE PICKUP TELL IS THE COLLECTOR'S ALONE. A real sail-over emits one
//      `dp` {k,id,t,g} to the collector; a watcher in plain sight of the hull
//      gets no event of any kind about it (the crate simply leaves its
//      `drops[]`), and a spectator never receives `dp`.

import { describe, it, expect } from 'vitest';
import { CONFIG, paintDiscCoverage, type BlipEvent, type DropState, type FrameMsg, type GameEvent } from '@salvo/shared';
import type { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { bareWorld, captain, moveTo } from './beaconFixture.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const DETECT = SIGHT * CONFIG.vision.detectFactor;

/** One crate at a deliberately non-round position (so its coordinates can be
 *  matched exactly and can never coincide with a cell index or a clock). */
const CRATE: DropState = Object.freeze({ id: 'drop-7x', x: Math.fround(1237.25), y: Math.fround(-418.75), kind: 'armor' });

/** Park a hull's beam just short of the bearing to `p`, so the sweep crosses
 *  it within the first ticks of a run (the perception.test.ts posture). */
function parkBeamBefore(w: World, id: string, p: { x: number; y: number }): void {
  const rec = w.ships.get(id)!;
  const brg = Math.atan2(p.y - rec.state.y, p.x - rec.state.x);
  const parked = ((brg - 0.01) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  rec.sweepAngle = parked;
  rec.prevSweepAngle = parked;
}

/** The crate's radar paint, as the production pipeline shapes it this tick —
 *  a DIFFERENTIAL identifier only (which blip is the crate's), never the
 *  oracle of its gate (perception.test.ts re-derives that independently). */
function crateBlipAt(now: number): BlipEvent {
  const c = paintDiscCoverage(CRATE.x, CRATE.y, CONFIG.drops.radiusU, CONFIG.vision.radarCellU, now);
  return { k: 'blip', t: now, gx: c.gx, gy: c.gy, w: c.w, h: c.h, bits: c.bits };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A frame with the two channels a crate MAY move set aside: the `drops` key
 *  and any blip byte-equal to the crate's paint this tick. Returns the
 *  stripped frame and how many crate blips it removed. */
function withoutCrate(frame: FrameMsg): { rest: unknown; crateBlips: number } {
  const paint = crateBlipAt(frame.t);
  let crateBlips = 0;
  const events = frame.events.filter((e) => {
    if (e.k !== 'blip' || !same(e, paint)) return true;
    crateBlips += 1;
    return false;
  });
  const { drops: _drops, ...rest } = frame;
  return { rest: { ...rest, events }, crateBlips };
}

/** Every number and string anywhere in `value`, with the path to each. */
function leaves(value: unknown, path: string[] = [], out: { path: string[]; v: number | string }[] = []): { path: string[]; v: number | string }[] {
  if (Array.isArray(value)) {
    value.forEach((v, i) => leaves(v, [...path, String(i)], out));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) leaves(v, [...path, k], out);
  } else if (typeof value === 'number' || typeof value === 'string') {
    out.push({ path, v: value });
  }
  return out;
}

/** THE POSITION PIN on one frame: the crate's exact coordinates and its id
 *  appear only under `drops[*]`. */
function verifyCrateRidesOnlyInDrops(frame: FrameMsg, tag: string): void {
  for (const leaf of leaves(frame)) {
    const hit = leaf.v === CRATE.x || leaf.v === CRATE.y || (typeof leaf.v === 'string' && leaf.v.includes(CRATE.id));
    if (!hit) continue;
    expect(leaf.path[0], `${tag}: the crate's ${leaf.path.join('.')} = ${String(leaf.v)} rode outside drops[]`).toBe('drops');
  }
}

/** Two worlds on one seed — stationary captains, the shipped schedule OFF in
 *  both (so the ONE difference is the crate seated by hand in `withCrate`). */
function twinWorlds(seed: number): { withCrate: World; without: World; ids: string[] } {
  const build = (): World => bareWorld(seed, { pseudonymSeed: 31337, drops: false });
  const withCrate = build();
  const without = build();
  const ids = ['near', 'radarOnly', 'far'];
  // No hull shares a coordinate with the crate (the position pin below matches
  // the crate's exact floats anywhere in a frame, so a `you.y` or a contact's
  // `x` equal to it by fixture would be a false leak).
  for (const w of [withCrate, without]) {
    // `near`: ~160 u west-south-west of the crate — inside detect (sighted) and inside radar.
    captain(w, 'near', CRATE.x - 156, CRATE.y + 37.5, 0);
    // `radarOnly`: beyond sight, inside radar and the flat dropout band, roughly due south.
    captain(w, 'radarOnly', CRATE.x + 23.25, CRATE.y + SIGHT + 300, 0);
    // `far`: beyond radar range altogether.
    captain(w, 'far', CRATE.x - (RADAR + 600), CRATE.y - 51, 0);
    w.respawnEnabled = false;
    parkBeamBefore(w, 'near', CRATE);
    parkBeamBefore(w, 'radarOnly', CRATE);
  }
  withCrate.drops.set(CRATE.id, CRATE);
  return { withCrate, without, ids };
}

describe('airdrops — the two-world differential (crate on vs off changes only `drops` and one anonymous blip)', () => {
  it('an observer who can neither see nor paint the crate gets byte-identical frames; one who can differs ONLY by `drops` and/or the crate\'s disc blip; a spectator gets `drops` and never a blip', () => {
    expect(Math.hypot(156, 37.5)).toBeLessThan(DETECT);
    expect(SIGHT + 300).toBeLessThanOrEqual(CONFIG.vision.dropout.startU); // the radar roll never misses here
    expect(SIGHT + 300).toBeLessThan(RADAR);
    const { withCrate, without, ids } = twinWorlds(5100);
    const ledger = { nearDrops: 0, nearBlips: 0, radarBlips: 0, radarDrops: 0, farDiffs: 0, specDrops: 0, specBlips: 0, frames: 0 };
    for (let tick = 0; tick < 60; tick += 1) {
      withCrate.step();
      without.step();
      expect(without.drops.size).toBe(0); // the schedule is off — nothing scattered itself
      expect(withCrate.drops.size).toBe(1); // ...and the seated crate is still there (nobody sailed over it)
      for (const id of ids) {
        const a = buildFrame(withCrate, id);
        const b = buildFrame(without, id);
        ledger.frames += 1;
        const sa = withoutCrate(a);
        const sb = withoutCrate(b);
        expect(sb.crateBlips, `${id} tick ${tick}: the crate-less world painted a crate`).toBe(0);
        expect(sa.rest, `${id} tick ${tick}: something besides drops / the crate's blip moved`).toEqual(sb.rest);
        expect('drops' in b, `${id} tick ${tick}: a crate-less frame carries drops`).toBe(false);
        if (id === 'far') {
          if (!same(a, b)) ledger.farDiffs += 1;
          expect(same(a, b), `far tick ${tick}: byte-identical`).toBe(true);
        }
        if (id === 'near') {
          if (a.drops !== undefined) ledger.nearDrops += 1;
          expect(a.drops, `near tick ${tick}: sighted`).toEqual([{ id: CRATE.id, x: CRATE.x, y: CRATE.y, c: CRATE.kind }]);
          ledger.nearBlips += sa.crateBlips;
        }
        if (id === 'radarOnly') {
          if (a.drops !== undefined) ledger.radarDrops += 1;
          ledger.radarBlips += sa.crateBlips;
          expect(sa.crateBlips).toBeLessThanOrEqual(1); // one paint per beam pass, never doubled
        }
      }
      // SPECTATORS (unfogged): the far hull as a finished-phase spectator sees
      // the crate in `drops` and gets no blip of any kind.
      const sa = buildFrame(withCrate, 'far', 'finished');
      const sb = buildFrame(without, 'far', 'finished');
      expect(sa.spec).toBe(true);
      expect(sa.drops).toEqual([{ id: CRATE.id, x: CRATE.x, y: CRATE.y, c: CRATE.kind }]);
      ledger.specDrops += 1;
      ledger.specBlips += sa.events.filter((e) => e.k === 'blip').length;
      const { drops: _d, ...saRest } = sa;
      expect(saRest).toEqual(sb);
    }
    // NON-VACUITY: the sight arm delivered on every tick, the radar arm painted
    // (both for the sighted observer — a crate is a contact AND a blip, the
    // amendment-210 rule — and for the one beyond sight), the beyond-sight
    // observer never got the glyph, the far observer never differed, and the
    // spectator saw the row without a single blip.
    expect(ledger.nearDrops).toBe(60);
    expect(ledger.nearBlips).toBeGreaterThan(0);
    expect(ledger.radarBlips).toBeGreaterThan(0);
    expect(ledger.radarDrops).toBe(0);
    expect(ledger.farDiffs).toBe(0);
    expect(ledger.specDrops).toBe(60);
    expect(ledger.specBlips).toBe(0);
  });
});

describe('airdrops — the crate\'s position and id ride NOWHERE but `drops[]`', () => {
  it('across every observer\'s fogged and spectator frames, the exact coordinates and the id appear only under drops[*]; the blip is cell-space and fuzzed', () => {
    const { withCrate, ids } = twinWorlds(5101);
    let drops = 0;
    let crateBlips = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      withCrate.step();
      for (const id of ids) {
        for (const phase of ['waiting', 'finished'] as const) {
          const f = buildFrame(withCrate, id, phase);
          verifyCrateRidesOnlyInDrops(f, `${id} ${phase} tick ${tick}`);
          drops += f.drops?.length ?? 0;
          crateBlips += withoutCrate(f).crateBlips;
        }
      }
    }
    expect(drops).toBeGreaterThan(0);
    expect(crateBlips).toBeGreaterThan(0);
    // ...and the blip's rect really is not the position: its cells are integers
    // of the shared lattice, and neither coordinate of the crate is an integer.
    const paint = crateBlipAt(withCrate.now);
    for (const v of [paint.gx, paint.gy, paint.w, paint.h]) expect(Number.isInteger(v)).toBe(true);
    expect(Number.isInteger(CRATE.x) || Number.isInteger(CRATE.y)).toBe(false);
  });
});

describe('airdrops — the pickup tell `dp` reaches the collector alone', () => {
  it('a real sail-over: the collector gets exactly one {k,id,t,g}; a watcher in plain sight gets no event about it and only loses the row; a spectator never gets `dp`', () => {
    const w = bareWorld(5102, { pseudonymSeed: 777, drops: false });
    w.respawnEnabled = false;
    const collector = captain(w, 'taker', 0, 0, 0);
    captain(w, 'watch', 0, 200, 0); // 200 u north: sees the taker and the crate
    const crate: DropState = { id: 'crate-1', x: 400, y: 0, kind: 'power' };
    w.drops.set(crate.id, crate);
    w.step();
    const before = { taker: buildFrame(w, 'taker'), watch: buildFrame(w, 'watch') };
    expect(before.taker.drops?.map((d) => d.id)).toEqual([crate.id]);
    expect(before.watch.drops?.map((d) => d.id)).toEqual([crate.id]);
    // Teleport the taker's hull onto the crate (the centre inside the hull —
    // distance 0 — the collect row's touch) and step once.
    moveTo(collector, crate.x, crate.y);
    w.step();
    const taker = buildFrame(w, 'taker');
    const watch = buildFrame(w, 'watch');
    const spec = buildFrame(w, 'watch', 'finished');
    expect(w.drops.size).toBe(0); // collected
    const takerDp = taker.events.filter((e): e is GameEvent & { k: 'dp' } => e.k === 'dp');
    expect(takerDp).toHaveLength(1);
    expect(Object.keys(takerDp[0])).toEqual(['k', 'id', 't', 'g']);
    // The amount is rolled AT PICKUP (Eric 2026-11-08): one roll of the
    // crate's kind, its amount within the dials.
    expect(takerDp[0]).toMatchObject({ k: 'dp', id: 'taker', t: w.now });
    expect(takerDp[0].g).toHaveLength(1);
    expect(takerDp[0].g[0][0]).toBe(crate.kind);
    expect(takerDp[0].g[0][1]).toBeGreaterThanOrEqual(CONFIG.drops.bonusMin);
    expect(takerDp[0].g[0][1]).toBeLessThanOrEqual(CONFIG.drops.bonusMax);
    // The watcher: no `dp`, no event of any kind at the crate's point, and the
    // row simply gone; the taker is still its plain contact.
    expect(watch.events.filter((e) => e.k === 'dp')).toEqual([]);
    expect('drops' in watch).toBe(false);
    expect(watch.contacts.some((c) => c.id === 'taker')).toBe(true);
    expect(JSON.stringify(watch)).not.toContain('crate-1');
    // The spectator: unfogged, and still never the collector's receipt.
    expect(spec.spec).toBe(true);
    expect(spec.events.filter((e) => e.k === 'dp')).toEqual([]);
    expect(JSON.stringify(spec)).not.toContain('crate-1');
    // The receipt is one tick's event, not a state: gone from the next frame.
    w.step();
    expect(buildFrame(w, 'taker').events.filter((e) => e.k === 'dp')).toEqual([]);
  });
});
