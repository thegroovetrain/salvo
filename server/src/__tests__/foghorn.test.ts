// THE FOGHORN (Story 4.5, amendments 51-58) — World.consumeHonk's press
// grammar, cooldown, eligibility gates, and life-boundary resets (EMISSION
// tests, the smoke.test.ts pattern), plus the `fh` registry row's per-observer
// delivery: the honker's self copy, the three listener volume tiers resolved
// from the LISTENER'S own effective ranges, the one-step island muffle, and
// the spectator position payload. The perception invariant suite re-verifies
// delivery with its own independently reimplemented oracle (the header rule).

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_HORN_ID, type FoghornEvent, type GameEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { neutralInput } from '../game/inputs.js';
import { buildFrame } from '../game/frames.js';
import { signalFor, type FoggedSignalContext, type SpectatorSignalContext } from '../game/signals.js';

const SIGHT = CONFIG.vision.sight; // 330 — the tier-1 bound at base stats
const MID = CONFIG.vision.muzzleFlash; // 495 — the tier-2 clamp floor
const RADAR = CONFIG.vision.radar; // 660 — the tier-3 bound at base stats
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

/** A fogged SignalContext for `me` (the signals.test.ts helper, verbatim). */
function foggedCtx(w: World, me: ShipRecord, now = w.now): FoggedSignalContext {
  return { mode: 'fogged', observerId: me.id, now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me };
}

function spectatorCtx(w: World, observerId: string): SpectatorSignalContext {
  return { mode: 'spectator', observerId, now: w.now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me: w.ships.get(observerId) };
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
    w.map.islands.push({ x: 100, y: 0, r: 40 });
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

describe('SIGNAL_REGISTRY — fh row: the three volume tiers (the LISTENER\'S own effective ranges, boundaries inclusive)', () => {
  it('base stats: 330/495/660 — each bound inclusive, a hair beyond each demotes or silences', () => {
    const w = bareWorld();
    const e = subject(0, 0, 'honker');
    const cases: Array<[number, number | null]> = [
      [100, 1],
      [SIGHT, 1], // exactly at sight — inclusive
      [SIGHT + 0.01, 2],
      [MID, 2], // exactly at max(1.5×sight, muzzleFlash) = 495
      [MID + 0.01, 3],
      [RADAR, 3], // exactly at radar = 660
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

  it('star-shell dazzle shrinks the 100% band but never DEAFENS (the muzzleFlash clamp — amendment 53)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    l.dazzledUntil = w.now + 10_000; // sight collapses to 330 × dazzleSightFactor
    const ctx = foggedCtx(w, l);
    // Inside old truesight but outside dazzled sight: tier 2 now, not silence.
    expect((row.materialize(ctx, subject(200, 0, 'h1')) as FoghornEvent).v).toBe(2);
    // The outer bands hold at 495/660 regardless of dazzle.
    expect((row.materialize(ctx, subject(400, 0, 'h2')) as FoghornEvent).v).toBe(2);
    expect((row.materialize(ctx, subject(600, 0, 'h3')) as FoghornEvent).v).toBe(3);
    expect(row.visible(ctx, subject(RADAR + 1, 0, 'h4'))).toBe(false);
  });

  it('boon-widened ranges widen the bands (the listener\'s OWN effective stats, never constants)', () => {
    const w = bareWorld();
    const l = place(w, 'l', 0, 0);
    // Widened truesight: tier 1 reaches 600, tier 2 reaches max(900, 495) = 900.
    l.stats = { ...l.stats, sightRange: 600 };
    const ctx = foggedCtx(w, l);
    expect((row.materialize(ctx, subject(500, 0, 'h1')) as FoghornEvent).v).toBe(1);
    expect((row.materialize(ctx, subject(850, 0, 'h2')) as FoghornEvent).v).toBe(2);
    // Widened radar: tier 3 reaches max(radarRange, tier-2 bound).
    l.stats = { ...l.stats, radarRange: 1200 };
    expect((row.materialize(foggedCtx(w, l), subject(1100, 0, 'h3')) as FoghornEvent).v).toBe(3);
    expect(row.visible(foggedCtx(w, l), subject(1201, 0, 'h4'))).toBe(false);
  });
});

describe('SIGNAL_REGISTRY — fh row: islands MUFFLE by exactly one tier (amendment 54)', () => {
  const blockedWorld = (listenerX: number): { w: World; l: ShipRecord } => {
    const w = bareWorld();
    const l = place(w, 'l', listenerX, 0);
    w.map.islands.push({ x: 150, y: 0, r: 40 }); // squarely on the segment honker→listener
    return { w, l };
  };
  const e = subject(0, 0, 'honker');

  it('tier-1 distance behind a rock demotes to tier 2', () => {
    const { w, l } = blockedWorld(300); // ≤ 330 → tier 1 by distance
    expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(2);
  });

  it('tier-2 distance behind a rock demotes to tier 3', () => {
    const { w, l } = blockedWorld(400); // ≤ 495 → tier 2 by distance
    expect((row.materialize(foggedCtx(w, l), e) as FoghornEvent).v).toBe(3);
  });

  it('tier-3 distance behind a rock demotes out of earshot — no event at all', () => {
    const { w, l } = blockedWorld(600); // ≤ 660 → tier 3 by distance
    expect(row.visible(foggedCtx(w, l), e)).toBe(false);
  });
});

describe('SIGNAL_REGISTRY — fh row: spectators', () => {
  it('a record-less spectator (me undefined) receives {k,h,x,y} — the short-circuit before any me math', () => {
    const w = bareWorld();
    const e = subject(9_000, 9_000, 'honker'); // absurdly far from everything
    const ctx: SpectatorSignalContext = { mode: 'spectator', observerId: 'ghost', now: w.now, islands: w.map.islands, ships: w.ships, litZones: w.litZones, decoys: w.decoys, me: undefined };
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
  it('honker gets self, a mid listener gets bearing+tier only, a far captain hears nothing, a dead spectator gets x/y', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // the honker
    place(w, 'b', 400, 0); // tier-2 listener (330 < 400 ≤ 495)
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
    expect(heard[0].v).toBe(2);
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
