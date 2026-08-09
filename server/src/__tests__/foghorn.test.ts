// THE FOGHORN (Story 4.5, amendments 51-58; Story 4.9, amendment 122) —
// World.consumeHonk's press grammar, cooldown, eligibility gates, and
// life-boundary resets (EMISSION tests, the smoke.test.ts pattern), plus the
// `fh` registry row's per-observer delivery: the honker's self copy, the
// EIGHT volume bands resolved as eighths of the LISTENER'S own INTEL range
// (stats.radarRange — boon-widened, never dazzle-scaled), the one-step
// island muffle (max(5, band + 2)), and the spectator position payload. The
// perception invariant suite re-verifies delivery with its own independently
// reimplemented oracle (the header rule).

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_HORN_ID, type FoghornEvent, type GameEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { neutralInput } from '../game/inputs.js';
import { buildFrame } from '../game/frames.js';
import { signalFor, type FoggedSignalContext, type SpectatorSignalContext } from '../game/signals.js';
import { circleIsland } from './islandFixture.js';

const SIGHT = CONFIG.vision.sight; // 330 — band 4's outer edge at base stats (full volume through here)
const RADAR = CONFIG.vision.radar; // 660 — the intel range: band 8's outer edge at base stats
const BAND = RADAR / 8; // 82.5 — one eighth of base intel range
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
  const rec = w.addShip(id, id.toUpperCase());
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

/** The radar-mode half of a SignalContext (cycle 51). The foghorn row reads
 *  none of it — `fh` has no wire shape that varies by radar grammar — but the
 *  context type carries it for every row, so these tests pass the World's own
 *  values through rather than hardcoding a grammar. */
const radarCtx = (w: World) => ({
  radarGrammar: w.radarGrammar,
  radarIdentity: w.radarIdentity,
  pseudonymOf: (id: string) => w.pseudonymFor(id),
  // Story 4.12: the wake subject list rides every context; the fh row reads
  // none of it, so the World's own live list passes through.
  wakes: w.wakeRibbons,
});

/** A fogged SignalContext for `me` (the signals.test.ts helper, verbatim). */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return { mode: 'fogged', observerId: me.id, now, islands: w.map.islands, heightRaster: w.map.heightRaster, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me, ...radarCtx(w) };
}

function spectatorCtx(w: World, observerId: string): SpectatorSignalContext {
  return { mode: 'spectator', observerId, now: w.now, islands: w.map.islands, heightRaster: w.map.heightRaster, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me: w.ships.get(observerId), ...radarCtx(w) };
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
    const d = w.addShip('d1', 'DRONE-01', true, 'droneSmall');
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
    w.step(); // respawns this tick
    expect(a.alive).toBe(true);
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
    const b = w.addShip('b', 'B', false, 'torpedoBoat', 'standard');
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

describe('SIGNAL_REGISTRY — fh row: the eight volume bands (eighths of the LISTENER\'S own intel range, boundaries inclusive — Story 4.9, amendment 122)', () => {
  it('base stats: all eight 82.5u bands — each outer edge inclusive, a hair beyond each steps down; past band 8, silence', () => {
    const w = bareWorld();
    const e = subject(0, 0, 'honker');
    // BANDS 1-3 ARE NOT ON THE WIRE (review fix): they are indistinguishable
    // from band 4 in every honest surface, so the emitted value is floored to 4
    // across the whole 100% plateau (see the plateau-floor describe below). The
    // DISTANCE bands themselves are unchanged and the gain curve is
    // byte-identical; only the cheat-readable resolution is gone.
    const cases: Array<[number, number | null]> = [
      [40, 4], // deep inside the plateau (raw band 1)
      [BAND, 4], // exactly at 82.5 — inclusive (raw band 1)
      [BAND + 0.01, 4], // raw band 2
      [2 * BAND, 4], // 165 (raw band 2)
      [3 * BAND, 4], // 247.5 (raw band 3)
      [SIGHT, 4], // ANCHOR: band 4 ends exactly at truesight 330 — full volume through here
      [SIGHT + 0.01, 5], // ...and the first band that is genuinely quieter IS transmitted
      [5 * BAND, 5], // 412.5
      [6 * BAND, 6], // 495
      [7 * BAND, 7], // 577.5
      [RADAR, 8], // ANCHOR: band 8 ends exactly at the 660 radar edge (50% gain, client-side)
      [RADAR + 0.01, null], // out of earshot — no event at all
    ];
    for (const [d, want] of cases) {
      const l = place(w, `l${d}`, d, 0);
      const ctx = foggedCtx(w, l);
      if (want === null) {
        expect(row.visible(ctx, e)).toBe(false);
      } else {
        expect(row.visible(ctx, e)).toBe(true);
        expect((row.materialize(ctx, e) as FoghornEvent).v).toBe(want);
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

  it('DAZZLE CANNOT DEAFEN — BY CONSTRUCTION: a dazzled listener\'s band is identical to an undazzled one at every distance (amendment 122 retires amendment 53\'s clamps)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    // One probe per band region plus the outer silence — resolved UNDAZZLED.
    // The first four sit on the wire's plateau floor of 4 (review fix): they
    // are the same 100% gain, so the property under test is untouched.
    const probes: Array<[number, number | null]> = [
      [40, 4], [150, 4], [200, 4], [300, 4], [400, 5], [480, 6], [550, 7], [600, 8], [RADAR + 1, null],
    ];
    for (const [d, want] of probes) {
      const un = row.visible(foggedCtx(w, l), subject(d, 0, `u${d}`));
      const unBand = un ? (row.materialize(foggedCtx(w, l), subject(d, 0, `u${d}`)) as FoghornEvent).v : null;
      expect(unBand ?? null).toBe(want);
    }
    // ...then DAZZLED: bands ride intel range, which dazzle never touches, so
    // every answer must be byte-identical — including the fully-lit band 1
    // (under the old tier model a dazzled listener at 200u dropped to 75%).
    l.dazzledUntil = w.now + 10_000;
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

  it('an intelRadar-widened listener hears farther — the bands stretch with stats.radarRange (the listener\'s OWN intel range, never the constant)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    l.stats = { ...l.stats, radarRange: 1200 }; // band width becomes 150u
    const ctx = foggedCtx(w, l);
    expect((row.materialize(ctx, subject(600, 0, 'h1')) as FoghornEvent).v).toBe(4); // 600 ≤ 4×150
    expect((row.materialize(ctx, subject(1100, 0, 'h2')) as FoghornEvent).v).toBe(8);
    expect((row.materialize(ctx, subject(1200, 0, 'h3')) as FoghornEvent).v).toBe(8); // inclusive
    expect(row.visible(ctx, subject(1200.01, 0, 'h4'))).toBe(false);
  });

  it('a sightRange boon does NOT move the bands — hearing rides intelRadar now, not intelTruesight (the amendment 122 trade, taken knowingly)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    l.stats = { ...l.stats, sightRange: 600 }; // widened truesight — irrelevant to the horn
    const ctx = foggedCtx(w, l);
    expect((row.materialize(ctx, subject(500, 0, 'h1')) as FoghornEvent).v).toBe(7); // ceil(8×500/660), NOT band 1
    expect(row.visible(ctx, subject(RADAR + 0.01, 0, 'h2'))).toBe(false); // still deaf past 660
  });
});

// ---------- the plateau floor: no wire resolution without a honest consumer ---
//
// REVIEW FIX (anti-cheat). Bands 1-4 are INDISTINGUISHABLE in every honest
// surface: gain is 1.0 for all four (CLIENT_CONFIG.foghorn.bandGain) and the
// chevron weight is the identical {22, 3, 0.95} for all four
// (CLIENT_CONFIG.foghorn.chevron.bands). Transmitting WHICH of bands 1-4 a
// honker sits in therefore hands a MODIFIED client two extra bits of range
// resolution — localising the honker to an 82.5u annulus instead of the 330u
// plateau — with no honest consumer whatsoever, and it bites hardest for a
// DAZZLED or intelRadar-boosted listener who can receive a low band for a
// honker they cannot see. That is exactly the disclosure amendment 51 exists
// to bound (BEARING AND VOLUME TIER ONLY). The fogged path therefore emits
// `max(band, 4)`: the COARSEST value that reproduces the ratified gain curve
// EXACTLY, so honest output is byte-identical and only the cheat-readable
// surplus goes away.

describe('SIGNAL_REGISTRY — fh row: the wire carries no band resolution an honest client cannot consume (review fix)', () => {
  const e = subject(0, 0, 'honker');

  it('FLOORS the whole 100% plateau to band 4 — every clear-LOS honker inside truesight is one indistinguishable region', () => {
    const w = bareWorld();
    for (const d of [0.5, 40, BAND, BAND + 0.01, 150, 2 * BAND, 240, 3 * BAND, 300, SIGHT]) {
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

  it('leaves bands 5-8 at FULL resolution — those four genuinely differ in gain and in chevron weight', () => {
    const w = bareWorld();
    for (const [d, want] of [[SIGHT + 0.01, 5], [5 * BAND, 5], [6 * BAND, 6], [7 * BAND, 7], [RADAR, 8]] as const) {
      const l = place(w, `l${d}`, d, 0);
      expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(want);
    }
  });

  it('a DAZZLED listener cannot resolve a plateau honker any finer either — the surplus is gone for every observer', () => {
    const w = bareWorld();
    const l = place(w, 'l', 100, 0); // raw band 2 by distance
    l.dazzledUntil = w.now + 10_000;
    expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(4);
  });

  it('an intelRadar-widened listener cannot either — a 1200u intel range still floors its first four bands', () => {
    const w = bareWorld();
    const l = place(w, 'l', 500, 0); // ceil(8×500/1200) = 4 by distance...
    l.stats = { ...l.stats, radarRange: 1200 };
    expect((row.materialize(foggedCtx(w, l), subject(0, 0, 'h1')) as FoghornEvent).v).toBe(4);
    const near = place(w, 'l2', 100, 0); // ...and a raw band 1 lands on the same floor
    near.stats = { ...near.stats, radarRange: 1200 };
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
// REVIEW FIX. `ceil(8 × d / radarRange)` is only a band for a POSITIVE FINITE
// radarRange. A zero/negative/NaN/Infinite one yields Infinity, a negative, NaN
// or 0 — and `NaN > 8` is false, so the old single upper-bound check let a NaN,
// a negative and a 0 reach the wire, where the client's chevron table has no
// entry for them. Unreachable from an honest current server, which is exactly
// why it must fail CLOSED (no event) rather than emit a non-band.

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
    ['negative', -660],
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

  // REVIEW FIX: the d === 0 short-circuit BYPASSED the domain check. `band = 1`
  // is taken without ever touching radarRange, so a co-located honker plus a
  // NaN/zero/negative intel range still laundered a garbage listener into a
  // legal band — the exact thing the docblock claims can never happen. The
  // guard belongs on `radarRange` itself, BEFORE the distance branch.
  it.each([
    ['NaN', NaN],
    ['negative', -660],
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

// REVIEW FIX — THE FLOOR IS APPLIED TO THE RAW BAND, THEN THE MUFFLE. Applying
// the plateau floor to the EMITTED value (after the muffle) had two wrong
// consequences at once. (1) It LEAKED the plateau resolution the floor exists to
// suppress: a blocked honk resolved raw bands 1-3 to 5 but raw band 4 to 6, so a
// modified client that knows an island intervenes recovered exactly the bit the
// floor removes. (2) It WEAKENED amendment 54: that ruling puts a blocked honk
// at the truesight edge at 75%, and a blocked point-blank honk was landing at
// 87.5% — the muffle was weaker inside truesight than before this story.
// Flooring first makes the whole plateau resolve to 6 (= 0.75) when blocked,
// which restores amendment 54 exactly and makes the blocked path carry no more
// resolution than the clear one.

describe('SIGNAL_REGISTRY — fh row: islands MUFFLE the FLOORED band — max(5, floor(band) + 2), one step, applied once (amendments 54/122)', () => {
  const blockedWorld = (listenerX: number): { w: World; l: ShipRecord } => {
    const w = bareWorld();
    const l = place(w, 'l', listenerX, 0);
    w.map.islands.push(circleIsland(listenerX / 2, 0, 20)); // squarely on the segment honker→listener
    return { w, l };
  };
  const e = subject(0, 0, 'honker');

  it('THE WHOLE 100% PLATEAU behind a rock lands at band 6 — 75%, amendment 54\'s ruling restored exactly', () => {
    // Raw bands 1, 2, 3 and 4 are ONE region on the wire, blocked or clear: the
    // floor runs first, so all four muffle to max(5, 4 + 2) = 6. A blocked honk
    // can therefore no longer be differenced against a clear one to recover
    // which eighth of the plateau the honker sat in.
    for (const d of [80, 150, 240, 300]) { // raw bands 1, 2, 3, 4 by distance
      const { w, l } = blockedWorld(d);
      expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(6);
    }
  });

  it('a point-blank blocked honk is no LOUDER than a truesight-edge one — the muffle never weakens with closeness', () => {
    const near = blockedWorld(80);
    const edge = blockedWorld(300);
    const vNear = (row.materialize(foggedCtx(near.w, near.l), e) as FoghornEvent).v as number;
    const vEdge = (row.materialize(foggedCtx(edge.w, edge.l), e) as FoghornEvent).v as number;
    expect(vNear).toBe(vEdge); // 6 and 6 — one band, one gain (0.75)
  });

  it('bands 5 and 6 behind a rock step to 7 and 8 (band + 2 past the floor)', () => {
    const b5 = blockedWorld(400); // band 5 by distance (≤ 412.5)
    expect((row.materialize(foggedCtx(b5.w, b5.l), e) as FoghornEvent).v).toBe(7);
    const b6 = blockedWorld(480); // band 6 by distance (≤ 495)
    expect((row.materialize(foggedCtx(b6.w, b6.l), e) as FoghornEvent).v).toBe(8);
  });

  it('the OUTER-BAND SILENCE: bands 7 and 8 behind a rock exceed 8 — no event at all', () => {
    for (const d of [550, 650]) { // band 7 (≤577.5) and band 8 (≤660) by distance
      const { w, l } = blockedWorld(d);
      expect(row.visible(foggedCtx(w, l), e)).toBe(false);
    }
  });

  it('THE WHOLE TRUTH TABLE, raw band → emitted, clear and blocked (the one statement of the row)', () => {
    // raw band (by a representative distance) → [clear, blocked]
    const table: Array<[number, number, number | null]> = [
      [80, 4, 6], // raw 1 → floored 4 → max(5, 6) = 6
      [150, 4, 6], // raw 2
      [240, 4, 6], // raw 3
      [300, 4, 6], // raw 4 — amendment 54's anchor: 75% behind rock
      [400, 5, 7], // raw 5
      [480, 6, 8], // raw 6
      [550, 7, null], // raw 7 → 9 > 8 → silent
      [650, 8, null], // raw 8 → 10 > 8 → silent
    ];
    for (const [d, clear, blocked] of table) {
      const open = bareWorld();
      const lo = place(open, 'l', d, 0);
      expect((row.materialize(foggedCtx(open, lo), e) as FoghornEvent).v).toBe(clear);

      const { w, l } = blockedWorld(d);
      if (blocked === null) expect(row.visible(foggedCtx(w, l), e)).toBe(false);
      else expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(blocked);
    }
  });
});

describe('SIGNAL_REGISTRY — fh row: spectators', () => {
  it('a record-less spectator (me undefined) receives {k,h,x,y} — the short-circuit before any me math', () => {
    const w = bareWorld();
    const e = subject(9_000, 9_000, 'honker'); // absurdly far from everything
    const ctx: SpectatorSignalContext = { mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, heightRaster: w.map.heightRaster, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me: undefined, ...radarCtx(w) };
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
    place(w, 'b', 400, 0); // band-5 listener (330 < 400 ≤ 412.5 — ceil(8×400/660) = 5)
    place(w, 'c', 2_000, 0); // far beyond earshot — but a spectator soon
    place(w, 'd', 0, 2_000); // far beyond earshot, alive — receives NOTHING
    w.respawnEnabled = false;
    w.sinkShip('c'); // c spectates in the active phase
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
