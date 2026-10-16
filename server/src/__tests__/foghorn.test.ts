// THE FOGHORN (Story 4.5, amendments 51-58; Story 4.9, amendment 122) —
// World.consumeHonk's press grammar, cooldown, eligibility gates, and
// life-boundary resets (EMISSION tests, the smoke.test.ts pattern), plus the
// `fh` registry row's per-observer delivery: the honker's self copy, the
// TWELVE volume bands resolved as twelfths of the LISTENER'S own INTEL range
// (stats.radarRange — the one ruler, never sight-scaled; Story 9.8, ruling
// 129 — eight bands before it), the one-step island muffle (max(5, band + 3)),
// and the spectator position payload. The
// perception invariant suite re-verifies delivery with its own independently
// reimplemented oracle (the header rule).

import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, DEFAULT_HORN_ID, type FoghornEvent, type GameEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { neutralInput } from '../game/inputs.js';
import { buildFrame } from '../game/frames.js';
import { signalFor, type FoggedSignalContext, type SpectatorSignalContext } from '../game/signals.js';
import { circleIsland } from './islandFixture.js';

// The twelfths ruler (Story 9.8, amendment 103; ruling 129): every anchor is
// derived from CONFIG, never a literal.
const SIGHT = CONFIG.vision.sight; // band 4's outer edge at base stats (full volume through here)
const RADAR = CONFIG.vision.radar; // the intel range: band 12's outer edge at base stats
const BAND = RADAR / 12; // one twelfth of base intel range — one rung
const COOLDOWN = CONFIG.foghorn.cooldownMs;
const DT = CONFIG.tick.simDtMs;

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), undefined, undefined, undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

/** Submit one input whose only intent is a horn press (hornSeq advance). */
function honk(w: World, id: string, seq: number, hornSeq: number): void {
  w.submitInput(id, { ...neutralInput(), seq, hornSeq });
}

function honks(events: readonly GameEvent[]): FoghornEvent[] {
  return events.filter((e): e is FoghornEvent => e.k === 'fh');
}

// The world-emitted SUBJECT carries the honker's true x/y/id (server-private —
// the row consumes them and never forwards them; see signals.ts).
const subject = (x: number, y: number, id: string): FoghornEvent =>
  ({ k: 'fh', h: 'standard', x, y, id }) as FoghornEvent;

/** The context rows the foghorn row never reads — the SignalContext type
 *  carries them for every row, so these tests pass the World's own values
 *  through rather than hardcoding anything. */
const radarCtx = (w: World) => ({
  pseudonymOf: (id: string) => w.pseudonymFor(id),
  // Story 8.16: the decoy channel's subjects; the fh row reads none.
  decoys: w.decoys,
  // Story 9.3: the live countermeasure clouds (the context field; the fh
  // row's muffle never reads them — a cloud hides nothing, session 2).
  clouds: w.cloudRecords,
  fogToll: (ax: number, ay: number, bx: number, by: number) => w.fogTollAlong(ax, ay, bx, by), // Story 9.10: the fog toll thunk (the fh row never calls it — the horn is fog-blind)
  // Story 4.12: the wake subject list rides every context; the fh row reads
  // none of it, so the World's own live list passes through.
  wakes: w.wakeRibbons,
  // Story 5.6: the aggro mark's input; the fh row reads none of it either.
  aggroAt: (fleetShipId: string, observerId: string) => w.drones.isTargeting(fleetShipId, observerId),
  // Story 9.8: the radar dropout roll's inputs; the fh row reads neither.
  dropoutSeed: w.dropoutSeed,
  wakeKeyOf: (r: Parameters<World['wakeKeyOf']>[0]) => w.wakeKeyOf(r),
});

/** A fogged SignalContext for `me` (the signals.test.ts helper, verbatim). */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return { mode: 'fogged', observerId: me.id, now, islands: w.map.islands, heightRaster: w.map.heightRaster, ships: w.ships, litZones: w.litZones, burnZones: w.burnZones, foulZones: w.foulZones, me, ...radarCtx(w) };
}

function spectatorCtx(w: World, observerId: string): SpectatorSignalContext {
  return { mode: 'spectator', observerId, now: w.now, islands: w.map.islands, heightRaster: w.map.heightRaster, ships: w.ships, litZones: w.litZones, burnZones: w.burnZones, foulZones: w.foulZones, me: w.ships.get(observerId), ...radarCtx(w) };
}

const row = signalFor('fh')!;

// ---------- world emission (consumeHonk) --------------------------------------

describe('world — foghorn emission (hornSeq grammar, the actSeq consumption pattern)', () => {
  it('a fresh press emits ONE {k,h,x,y,id} subject at the ship\'s true position and arms the cooldown', () => {
    const w = bareWorld();
    const a = place(w, 'a', 123, -456);
    honk(w, 'a', 1, 1);
    w.step();
    const fh = honks(w.tickEvents);
    expect(fh).toHaveLength(1);
    expect(fh[0]).toEqual({ k: 'fh', h: 'standard', x: 123, y: -456, id: 'a' });
    // KEY ORDER at the emission site (msgpack never sees the subject, but the
    // shape pin catches a stray field riding in).
    expect(Object.keys(fh[0])).toEqual(['k', 'h', 'x', 'y', 'id']);
    expect(a.nextHonkAt).toBe(w.now + COOLDOWN);
  });

  it('two presses coalesced into one tick: both consumed, exactly ONE honk', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    honk(w, 'a', 1, 1);
    honk(w, 'a', 2, 2); // second press, same tick (tickIntents holds both)
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1);
    expect(a.lastHornSeq).toBe(2); // both presses consumed
  });

  it('a press inside cooldownMs is consumed and silently dropped; a fresh press after expiry honks', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    honk(w, 'a', 1, 1);
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1);
    honk(w, 'a', 2, 2); // inside the 1500ms window
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(0); // dropped, no denial, no event
    expect(a.lastHornSeq).toBe(2); // ...but CONSUMED
    while (w.now < a.nextHonkAt) w.step(); // wait out the cooldown
    honk(w, 'a', 3, 3);
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1);
  });

  it('a stale or replayed hornSeq is a no-press, even off cooldown (max() consumption)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    honk(w, 'a', 1, 5);
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1);
    for (let i = 0; i < COOLDOWN / DT + 1; i++) w.step(); // cooldown fully elapsed
    honk(w, 'a', 2, 5); // replayed counter
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(0);
    honk(w, 'a', 3, 4); // stale (lower) counter
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(0);
    honk(w, 'a', 4, 6); // genuinely new press
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1);
    expect(a.lastHornSeq).toBe(6);
  });

  it('a spoofed counter jump (hornSeq += 1000) buys exactly one gated honk', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    honk(w, 'a', 1, 1000);
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1);
    honk(w, 'a', 2, 1000);
    for (let i = 0; i < COOLDOWN / DT + 1; i++) w.step();
    expect(honks(w.tickEvents)).toHaveLength(0); // replay reads stale forever
  });

  it('a drone never honks — the press is consumed and dropped', () => {
    const w = bareWorld();
    const d = w.addShip('d1', 'DRONE-01', 'fleet', 'droneSmall', undefined, undefined);
    // Out-run the drone controller's own per-tick submit (mind.seq counts up
    // from 1): a seq-10 forged press wins latest, the controller's input reads
    // stale — this is exactly the shape a hijacked drone channel would take.
    honk(w, 'd1', 10, 1);
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(0);
    expect(d.lastHornSeq).toBe(1); // consumed, exactly like malformed input
  });

  it('a dead captain cannot honk; the press is consumed', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Story 5.2 (amendment 10 — "And foghorn."): a SINKING captain still
    // honks; only a foundered one is silent. Cross the window first.
    w.step(CONFIG.ship.sinkingWindowMs);
    honk(w, 'a', 1, 1);
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(0);
    expect(a.lastHornSeq).toBe(1);
  });

  it('respawn resets the cooldown: a fresh life never owes the old window (lastHornSeq survives — no phantom honk)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    honk(w, 'a', 1, 1);
    w.step(); // honk — nextHonkAt armed far ahead
    expect(honks(w.tickEvents)).toHaveLength(1);
    w.sinkShip('a');
    a.respawnAt = w.now + DT;
    // Story 5.2: the revive waits on the founder edge (processRespawns only
    // touches the SUNK), so cross the whole window in one step — founder and
    // respawn land on the same tick.
    w.step(CONFIG.ship.sinkingWindowMs);
    expect(isAfloat(a.lifecycle)).toBe(true);
    expect(a.nextHonkAt).toBe(0); // stale cooldown wiped
    expect(a.lastHornSeq).toBe(1); // counter NOT reset (phantom-honk guard)
    expect(honks(w.tickEvents)).toHaveLength(0); // and no phantom honk fired
    honk(w, 'a', 2, 2); // fresh press, still inside the OLD window
    w.step();
    expect(honks(w.tickEvents)).toHaveLength(1); // honks immediately
  });

  it('the match-start redeploy resets the cooldown too (and keeps the counter)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    honk(w, 'a', 1, 1);
    w.step();
    expect(a.nextHonkAt).toBeGreaterThan(0);
    w.resetForMatchStart();
    expect(a.nextHonkAt).toBe(0);
    expect(a.lastHornSeq).toBe(1);
  });

  it('addShip defaults the horn to the shared DEFAULT_HORN_ID and stamps a passed variant onto the record', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    expect(a.horn).toBe(DEFAULT_HORN_ID);
    const b = w.addShip('b', 'B', 'captain', 'torpedoBoat', 'standard', undefined);
    expect(b.horn).toBe('standard');
  });
});

// ---------- the fh registry row (per-observer delivery) -----------------------

describe('SIGNAL_REGISTRY — fh row: the honker\'s own copy', () => {
  it('bypasses every distance and LOS test and materializes exactly {k,h,self:true} — a FRESH object, no id', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.map.islands.push(circleIsland(100, 0, 40));
    const e = subject(5000, 5000, 'a'); // absurdly far AND LOS-blocked — self doesn't care
    const ctx = foggedCtx(w, a);
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as FoghornEvent;
    expect(wire).not.toBe(e); // fresh object — never the subject forwarded
    expect(Object.keys(wire)).toEqual(['k', 'h', 'self']);
    expect(wire).toEqual({ k: 'fh', h: 'standard', self: true });
    for (const forbidden of ['id', 'x', 'y', 'b', 'v']) {
      expect(Object.hasOwn(wire, forbidden)).toBe(false);
    }
  });

  it('the honker check comes FIRST: a spectating honker still gets the self shape, not x/y', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    const e = subject(0, 0, 'a');
    const ctx = spectatorCtx(w, 'a');
    expect(row.visible(ctx, e)).toBe(true);
    expect(Object.keys(row.materialize(ctx, e) as object)).toEqual(['k', 'h', 'self']);
  });
});

describe('SIGNAL_REGISTRY — fh row: the twelve volume bands (twelfths of the LISTENER\'S own intel range, boundaries inclusive — Story 9.8, ruling 129)', () => {
  it('the ladder anchors: sight is the band-4 edge and radar the band-12 edge (amendment 103 — sight = radar / 3)', () => {
    expect(SIGHT).toBe(4 * BAND);
    expect(RADAR).toBe(12 * BAND);
  });

  it('base stats: all twelve bands — each outer edge inclusive, a hair beyond each steps down; past band 12, silence', () => {
    const w = bareWorld();
    const e = subject(0, 0, 'honker');
    // BANDS 1-3 ARE NOT ON THE WIRE (review fix): they are indistinguishable
    // from band 4 in every honest surface, so the emitted value is floored to 4
    // across the whole 100% plateau (see the plateau-floor describe below).
    const cases: Array<[number, number | null]> = [
      [BAND / 3, 4], // deep inside the plateau (raw band 1)
      [BAND, 4], // exactly one rung — inclusive (raw band 1)
      [BAND + 0.01, 4], // raw band 2
      [2 * BAND, 4], // raw band 2
      [3 * BAND, 4], // raw band 3
      [SIGHT, 4], // ANCHOR: band 4 ends exactly at truesight — full volume through here
      [SIGHT + 0.01, 5], // ...and the first band that is genuinely quieter IS transmitted
    ];
    for (let b = 5; b <= 12; b++) cases.push([b * BAND, b]); // each outer edge, inclusive
    for (let b = 5; b < 12; b++) cases.push([b * BAND + 0.01, b + 1]); // a hair beyond steps down
    cases.push([RADAR + 0.01, null]); // out of earshot — no event at all
    for (const [d, want] of cases) {
      const l = place(w, `l${d}`, d, 0);
      const ctx = foggedCtx(w, l);
      if (want === null) {
        expect(row.visible(ctx, e), `d=${d}`).toBe(false);
      } else {
        expect(row.visible(ctx, e), `d=${d}`).toBe(true);
        expect((row.materialize(ctx, e) as FoghornEvent).v, `d=${d}`).toBe(want);
      }
    }
  });

  it('a honk at distance ZERO (co-located) resolves to a legal FULL-VOLUME band, never NaN or 0', () => {
    const w = bareWorld();
    const l = place(w, 'l', 123, -45);
    const ctx = foggedCtx(w, l);
    const e = subject(123, -45, 'honker'); // exactly on top of the listener
    expect(row.visible(ctx, e)).toBe(true);
    // The distance math still resolves d === 0 to raw band 1; the wire carries
    // the plateau floor (review fix), which is the same 100% gain either way.
    expect((row.materialize(ctx, e) as FoghornEvent).v).toBe(4);
  });

  it('the fogged payload is exactly {k,h,b,v} — a FRESH object; no id, x, or y for ANY fogged listener', () => {
    const w = bareWorld();
    const l = place(w, 'l', 400, 0);
    const e = subject(0, 0, 'honker');
    const ctx = foggedCtx(w, l);
    const wire = row.materialize(ctx, e) as FoghornEvent;
    expect(wire).not.toBe(e);
    expect(Object.keys(wire)).toEqual(['k', 'h', 'b', 'v']);
    for (const forbidden of ['id', 'x', 'y', 'self']) {
      expect(Object.hasOwn(wire, forbidden)).toBe(false);
    }
  });

  it('bearing is FROM the listener TO the honker, wrapPositive [0, 2π)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    const ctx = foggedCtx(w, l);
    expect((row.materialize(ctx, subject(400, 0, 'h1')) as FoghornEvent).b).toBe(0); // due +x
    expect((row.materialize(ctx, subject(0, 400, 'h2')) as FoghornEvent).b).toBe(Math.PI / 2);
    expect((row.materialize(ctx, subject(-400, 0, 'h3')) as FoghornEvent).b).toBe(Math.PI);
    expect((row.materialize(ctx, subject(0, -400, 'h4')) as FoghornEvent).b).toBe((3 * Math.PI) / 2); // wrapped, never negative
  });

  it('A SIGHT REDUCTION CANNOT DEAFEN — BY CONSTRUCTION: a listener whose sight is one rung of its intel range bands identically to one at full sight, at every distance (amendment 122 retires amendment 53\'s clamps)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    // One probe per band (mid-band), plus the outer silence — resolved at FULL
    // sight. The first four sit on the wire's plateau floor of 4.
    const probes: Array<[number, number | null]> = [];
    for (let b = 1; b <= 12; b++) probes.push([(b - 0.5) * BAND, Math.max(b, 4)]);
    probes.push([RADAR + 1, null]);
    for (const [d, want] of probes) {
      const un = row.visible(foggedCtx(w, l), subject(d, 0, `u${d}`));
      const unBand = un ? (row.materialize(foggedCtx(w, l), subject(d, 0, `u${d}`)) as FoghornEvent).v : null;
      expect(unBand ?? null).toBe(want);
    }
    // ...then with SIGHT SHRUNK to one rung (radar / 12 — the FLASH SHELLS
    // dazzle's old collapse, written straight onto the record's stats): bands
    // ride intel range, which no sight reduction touches, so every answer
    // must be byte-identical.
    l.stats = { ...l.stats, sightRange: l.stats.radarRange / 12 };
    for (const [d, want] of probes) {
      const ctx = foggedCtx(w, l);
      const e = subject(d, 0, `d${d}`);
      if (want === null) {
        expect(row.visible(ctx, e)).toBe(false);
      } else {
        expect(row.visible(ctx, e)).toBe(true);
        expect((row.materialize(ctx, e) as FoghornEvent).v).toBe(want);
      }
    }
  });

  it('a listener with a widened intel range hears farther — the bands stretch with stats.radarRange, never the CONFIG constant (driven by poking stats directly: no card writes radarRange since the 2026-08-20 INTEL RANGE deletion, and the row must still read the field)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    const wide = 2 * RADAR;
    const wBand = wide / 12; // the band width stretches with the field
    l.stats = { ...l.stats, radarRange: wide };
    const ctx = foggedCtx(w, l);
    expect((row.materialize(ctx, subject(4 * wBand, 0, 'h1')) as FoghornEvent).v).toBe(4);
    expect((row.materialize(ctx, subject(11.5 * wBand, 0, 'h2')) as FoghornEvent).v).toBe(12);
    expect((row.materialize(ctx, subject(wide, 0, 'h3')) as FoghornEvent).v).toBe(12); // inclusive
    expect(row.visible(ctx, subject(wide + 0.01, 0, 'h4'))).toBe(false);
  });

  it('a 1200u intel-range poke resolves by the formula: a sight-distance honker lands in band ceil(12 × sight / 1200)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    l.stats = { ...l.stats, radarRange: 1200 };
    const want = Math.max(4, Math.ceil((12 * SIGHT) / 1200));
    expect((row.materialize(foggedCtx(w, l), subject(SIGHT, 0, 'h1')) as FoghornEvent).v).toBe(want);
  });

  it('poking sightRange directly does NOT move the bands — the horn reads stats.radarRange, of which sight is merely the 4/12 rung (amendment 122 trade retired)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    l.stats = { ...l.stats, sightRange: 2 * SIGHT }; // widened truesight — irrelevant to the horn
    const ctx = foggedCtx(w, l);
    const d = 1.5 * SIGHT;
    expect((row.materialize(ctx, subject(d, 0, 'h1')) as FoghornEvent).v).toBe(Math.ceil((12 * d) / RADAR)); // NOT band 4
    expect(row.visible(ctx, subject(RADAR + 0.01, 0, 'h2'))).toBe(false); // still deaf past radar
  });
});

// ---------- the plateau floor: no wire resolution without a honest consumer ---
//
// REVIEW FIX (anti-cheat). Bands 1-4 are INDISTINGUISHABLE in every honest
// surface (the same client gain and chevron weight). Transmitting WHICH of
// bands 1-4 a honker sits in therefore hands a MODIFIED client extra range
// resolution inside the plateau with no honest consumer whatsoever — exactly
// the disclosure amendment 51 exists to bound (BEARING AND VOLUME TIER ONLY).
// The fogged path therefore emits `max(band, 4)`.

describe('SIGNAL_REGISTRY — fh row: the wire carries no band resolution an honest client cannot consume (review fix)', () => {
  const e = subject(0, 0, 'honker');

  it('FLOORS the whole 100% plateau to band 4 — every clear-LOS honker inside truesight is one indistinguishable region', () => {
    const w = bareWorld();
    for (const d of [0.5, BAND / 3, BAND, BAND + 0.01, 1.5 * BAND, 2 * BAND, 2.5 * BAND, 3 * BAND, 3.5 * BAND, SIGHT]) {
      const l = place(w, `l${d}`, d, 0);
      const ctx = foggedCtx(w, l);
      expect(row.visible(ctx, e)).toBe(true);
      expect((row.materialize(ctx, e) as FoghornEvent).v).toBe(4);
    }
  });

  it('a co-located honk resolves to band 4 as well — the floor is on the WIRE value, not on the distance math', () => {
    const w = bareWorld();
    const l = place(w, 'l', 123, -45);
    const ctx = foggedCtx(w, l);
    expect((row.materialize(ctx, subject(123, -45, 'honker')) as FoghornEvent).v).toBe(4);
  });

  it('leaves bands 5-12 at FULL resolution — those eight genuinely differ in gain and in chevron weight', () => {
    const w = bareWorld();
    const cases: Array<[number, number]> = [[SIGHT + 0.01, 5]];
    for (let b = 5; b <= 12; b++) cases.push([b * BAND, b]);
    for (const [d, want] of cases) {
      const l = place(w, `l${d}`, d, 0);
      expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(want);
    }
  });

  it('a listener with SHRUNKEN sight cannot resolve a plateau honker any finer either — the surplus is gone for every observer', () => {
    const w = bareWorld();
    const l = place(w, 'l', 1.5 * BAND, 0); // raw band 2 by distance
    l.stats = { ...l.stats, sightRange: l.stats.radarRange / 12 };
    expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(4);
  });

  it('a listener with a widened intel range cannot either — a doubled intel range still floors its first four bands', () => {
    const w = bareWorld();
    const wide = 2 * RADAR;
    const l = place(w, 'l', 4 * (wide / 12), 0); // raw band 4 of the wide ruler...
    l.stats = { ...l.stats, radarRange: wide };
    expect((row.materialize(foggedCtx(w, l), subject(0, 0, 'h1')) as FoghornEvent).v).toBe(4);
    const near = place(w, 'l2', wide / 24, 0); // ...and a raw band 1 lands on the same floor
    near.stats = { ...near.stats, radarRange: wide };
    expect((row.materialize(foggedCtx(w, near), subject(0, 0, 'h2')) as FoghornEvent).v).toBe(4);
  });

  it('emits NO band below 4 at ANY distance, clear or blocked — the exhaustive statement of the bound', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(0, 400, 60)); // off the +x axis probes; used by the blocked sweep below
    for (let d = 1; d <= RADAR; d += 7) {
      const l = place(w, `s${d}`, d, 0);
      const ctx = foggedCtx(w, l);
      if (!row.visible(ctx, e)) continue;
      expect((row.materialize(ctx, e) as FoghornEvent).v).toBeGreaterThanOrEqual(4);
    }
  });
});

// ---------- fail-closed on a degenerate intel range --------------------------
//
// REVIEW FIX. `ceil(12 × d / radarRange)` is only a band for a POSITIVE FINITE
// radarRange. A zero/negative/NaN/Infinite one yields Infinity, a negative, NaN
// or 0 — and `NaN > 12` is false, so a lone upper-bound check would let a NaN,
// a negative and a 0 reach the wire. Unreachable from an honest server, which
// is exactly why it must fail CLOSED (no event) rather than emit a non-band.

describe('SIGNAL_REGISTRY — fh row: a degenerate intel range emits NOTHING (review fix, fail closed)', () => {
  const e = subject(0, 0, 'honker');
  const withRadar = (radarRange: number): { w: World; l: ShipRecord } => {
    const w = bareWorld();
    const l = place(w, 'l', 200, 0);
    l.stats = { ...l.stats, radarRange };
    return { w, l };
  };

  it.each([
    ['NaN', NaN],
    ['negative', -RADAR],
    ['zero', 0],
    ['Infinity', Infinity],
  ])('%s radarRange → inaudible, never a non-band on the wire', (_label, radarRange) => {
    const { w, l } = withRadar(radarRange);
    expect(row.visible(foggedCtx(w, l), e)).toBe(false);
  });

  it('a NaN honker position is inaudible too — the domain check catches the distance as well as the range', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    expect(row.visible(foggedCtx(w, l), subject(NaN, 0, 'honker'))).toBe(false);
  });

  // REVIEW FIX: the d === 0 short-circuit must not bypass the domain check —
  // the guard belongs on `radarRange` itself, BEFORE the distance branch.
  it.each([
    ['NaN', NaN],
    ['negative', -RADAR],
    ['zero', 0],
    ['Infinity', Infinity],
  ])('%s radarRange is inaudible even CO-LOCATED — the d === 0 branch cannot bypass the guard', (_label, radarRange) => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    l.stats = { ...l.stats, radarRange };
    expect(row.visible(foggedCtx(w, l), subject(0, 0, 'honker'))).toBe(false);
  });

  it('a healthy intel range is unaffected — the guard is a domain check, not a retune', () => {
    const { w, l } = withRadar(RADAR);
    expect(row.visible(foggedCtx(w, l), e)).toBe(true);
    expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(4);
  });
});

// REVIEW FIX — THE FLOOR IS APPLIED TO THE RAW BAND, THEN THE MUFFLE. Flooring
// the EMITTED value instead would resolve a blocked raw band 1-3 differently
// from a blocked raw band 4, leaking the plateau bit the floor suppresses.
// Flooring first makes the whole plateau resolve to ONE blocked band — 7 on the
// twelfths (max(5, 4 + 3), ruling 129: the proportional re-read of the eighths'
// +2, amendment 54).

describe('SIGNAL_REGISTRY — fh row: islands MUFFLE the FLOORED band — max(5, floor(band) + 3), one step, applied once (amendments 54/122, ruling 129)', () => {
  const blockedWorld = (listenerX: number): { w: World; l: ShipRecord } => {
    const w = bareWorld();
    const l = place(w, 'l', listenerX, 0);
    w.map.islands.push(circleIsland(listenerX / 2, 0, 20)); // squarely on the segment honker→listener
    return { w, l };
  };
  const e = subject(0, 0, 'honker');
  /** A representative distance for raw band `b`: the band's midpoint. */
  const mid = (b: number): number => (b - 0.5) * BAND;

  it('THE WHOLE 100% PLATEAU behind a rock lands at band 7 — one blocked answer for all four raw bands', () => {
    for (const b of [1, 2, 3, 4]) {
      const { w, l } = blockedWorld(mid(b));
      expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(7);
    }
  });

  it('a point-blank blocked honk is no LOUDER than a truesight-edge one — the muffle never weakens with closeness', () => {
    const near = blockedWorld(mid(1));
    const edge = blockedWorld(mid(4));
    const vNear = (row.materialize(foggedCtx(near.w, near.l), e) as FoghornEvent).v as number;
    const vEdge = (row.materialize(foggedCtx(edge.w, edge.l), e) as FoghornEvent).v as number;
    expect(vNear).toBe(vEdge);
  });

  it('bands 5-9 behind a rock step three bands down (band + 3 past the floor)', () => {
    for (let b = 5; b <= 9; b++) {
      const { w, l } = blockedWorld(mid(b));
      expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(b + 3);
    }
  });

  it('the OUTER-BAND SILENCE: bands 10-12 behind a rock exceed 12 — no event at all', () => {
    for (const b of [10, 11, 12]) {
      const { w, l } = blockedWorld(mid(b));
      expect(row.visible(foggedCtx(w, l), e)).toBe(false);
    }
  });

  it('THE WHOLE TRUTH TABLE, raw band → emitted, clear and blocked (the one statement of the row)', () => {
    // raw band → [clear, blocked]: floor first, then max(5, floored + 3), silent past 12.
    const table: Array<[number, number, number | null]> = [
      [1, 4, 7], [2, 4, 7], [3, 4, 7], [4, 4, 7],
      [5, 5, 8], [6, 6, 9], [7, 7, 10], [8, 8, 11], [9, 9, 12],
      [10, 10, null], [11, 11, null], [12, 12, null],
    ];
    for (const [b, clear, blocked] of table) {
      const d = mid(b);
      const open = bareWorld();
      const lo = place(open, 'l', d, 0);
      expect((row.materialize(foggedCtx(open, lo), e) as FoghornEvent).v, `clear raw ${b}`).toBe(clear);

      const { w, l } = blockedWorld(d);
      if (blocked === null) expect(row.visible(foggedCtx(w, l), e), `blocked raw ${b}`).toBe(false);
      else expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v, `blocked raw ${b}`).toBe(blocked);
    }
  });
});

describe('SIGNAL_REGISTRY — fh row: spectators', () => {
  it('a record-less spectator (me undefined) receives {k,h,x,y} — the short-circuit before any me math', () => {
    const w = bareWorld();
    const e = subject(9_000, 9_000, 'honker'); // absurdly far from everything
    const ctx: SpectatorSignalContext = { mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, heightRaster: w.map.heightRaster, ships: w.ships, litZones: w.litZones, burnZones: w.burnZones, foulZones: w.foulZones, me: undefined, ...radarCtx(w) };
    expect(row.visible(ctx, e)).toBe(true);
    const wire = row.materialize(ctx, e) as FoghornEvent;
    expect(wire).not.toBe(e);
    expect(Object.keys(wire)).toEqual(['k', 'h', 'x', 'y']);
    expect(wire).toEqual({ k: 'fh', h: 'standard', x: 9_000, y: 9_000 });
    for (const forbidden of ['id', 'b', 'v', 'self']) {
      expect(Object.hasOwn(wire, forbidden)).toBe(false);
    }
  });
});

// ---------- end to end (emission → frames) ------------------------------------

describe('foghorn end to end — one press, every observer mode in one tick', () => {
  it('honker gets self, a mid listener gets bearing+band only, a far captain hears nothing, a dead spectator gets x/y', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the honker
    place(w, 'b', 4.5 * BAND, 0); // band-5 listener (just past sight — ceil(12 × 4.5 rungs / 12 rungs) = 5)
    place(w, 'c', RADAR + 500, 0); // far beyond earshot — but a spectator soon
    place(w, 'd', 0, RADAR + 500); // far beyond earshot, alive — receives NOTHING
    w.respawnEnabled = false;
    w.sinkShip('c'); // c spectates in the active phase...
    w.step(CONFIG.ship.sinkingWindowMs); // ...once foundered (Story 5.2)
    honk(w, 'a', 1, 1);
    w.step();

    const own = honks(buildFrame(w, 'a').events);
    expect(own).toEqual([{ k: 'fh', h: 'standard', self: true }]);

    const heard = honks(buildFrame(w, 'b').events);
    expect(heard).toHaveLength(1);
    expect(Object.keys(heard[0])).toEqual(['k', 'h', 'b', 'v']);
    expect(heard[0].b).toBe(Math.PI); // a is due -x of b
    expect(heard[0].v).toBe(5);
    for (const forbidden of ['id', 'x', 'y']) {
      expect(Object.hasOwn(heard[0], forbidden)).toBe(false);
    }

    expect(honks(buildFrame(w, 'd').events)).toHaveLength(0); // out of earshot

    const spec = buildFrame(w, 'c', 'active');
    expect(spec.spec).toBe(true);
    const seen = honks(spec.events);
    expect(seen).toEqual([{ k: 'fh', h: 'standard', x: 0, y: 0 }]);
    expect(Object.keys(seen[0])).toEqual(['k', 'h', 'x', 'y']);
  });
});
