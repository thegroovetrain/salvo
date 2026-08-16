// THE XP economy (Story 2.6) — the earn side of the point/offer contract that
// upgrades.test.ts owns the spend side of. Covers the whole I/O & edge-case
// matrix: the exact 1200-tick passive level, kill credit for human and drone
// victims (the ratified ¼/⅓/½ tiers), fraction carry across a bank, multiple
// crossings in one grant, the three gates (match-active / alive / not-a-drone),
// the unattributed-sink cases, the lifecycle (redeploy wipes, respawn
// preserves), the step-order position, and the wire's self-private lvl/xp.
//
// Integer-ms discipline is the through-line: xpMs is milliseconds, never a
// float fraction, so "1200 × 50ms is exactly one level" is an equality, not an
// approximation.

import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, type GameEvent, type HullId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const DT = CONFIG.tick.simDtMs;
const XP = CONFIG.xp;
/** Ticks of the fixed 50ms step in exactly one level of passive accrual. */
const TICKS_PER_LEVEL = XP.levelMs / DT;

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull: HullId = 'torpedoBoat', drone = false): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), drone ? 'fleet' : 'captain', hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.speed = 0;
  return rec;
}

const ptsOf = (events: readonly GameEvent[]) => events.filter((e) => e.k === 'pt');

// ---------- passive accrual ----------------------------------------------------

describe('passive XP tick — the anti-snowball floor', () => {
  it('accrues exactly dtMs per tick and banks ONE level at tick 1200, not 1199', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < TICKS_PER_LEVEL - 1; i++) w.step();
    expect(a.xpMs).toBe(XP.levelMs - DT);
    expect(a.level).toBe(0);
    expect(a.bankedLevels).toBe(0);
    w.step(); // the 1200th tick
    expect(a.level).toBe(1);
    expect(a.xpMs).toBe(0); // exact — integer ms, no float drift
    expect(a.bankedLevels).toBe(1);
    expect(ptsOf(w.tickEvents)).toEqual([{ k: 'pt', id: 'a' }]);
  });

  it('keeps banking, one level per levelMs, with the offer queue tracking it', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < TICKS_PER_LEVEL * 3; i++) w.step();
    expect(a.level).toBe(3);
    expect(a.bankedLevels).toBe(3); // pts === offers.length, untouched
    expect(a.xpMs).toBe(0);
  });

  it('a DEAD hull accrues nothing while it waits (the alive gate)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.respawnEnabled = false; // stay sunk for the whole window
    w.sinkShip('a');
    for (let i = 0; i < 100; i++) w.step();
    expect(a.xpMs).toBe(0);
    expect(a.level).toBe(0);
  });

  it('a DRONE never accrues XP or offers, however long it survives (the ratified bugfix)', () => {
    const w = bareWorld();
    const d = place(w, 'd', 300, 0, 'droneMedium', true);
    const a = place(w, 'a');
    for (let i = 0; i < TICKS_PER_LEVEL + 5; i++) w.step();
    expect(d.xpMs).toBe(0);
    expect(d.level).toBe(0);
    expect(d.bankedLevels).toBe(0);
    expect(a.level).toBe(1); // ...while the human beside it leveled normally
  });

  it('the tick runs at the END of the step: a level banked this tick rides THIS tick frame', () => {
    const w = bareWorld();
    place(w, 'a');
    for (let i = 0; i < TICKS_PER_LEVEL - 1; i++) w.step();
    const before = buildFrame(w, 'a');
    expect(ptsOf(before.events)).toEqual([]);
    w.step();
    const f = buildFrame(w, 'a');
    expect(ptsOf(f.events)).toEqual([{ k: 'pt', id: 'a' }]); // not deferred a tick
    expect(f.you!.pts).toBe(1);
    expect(f.you!.lvl).toBe(1);
  });

  it('is deterministic: two identical worlds bank at the same tick with the same offers', () => {
    const run = (): { tick: number; offer: string[] } => {
      const w = bareWorld(4242);
      const a = place(w, 'a');
      for (let i = 0; i < TICKS_PER_LEVEL; i++) w.step();
      return { tick: w.tick, offer: [...a.offer!] };
    };
    expect(run()).toEqual(run());
  });
});

// ---------- the xpEnabled gate --------------------------------------------------

describe('xpEnabled — the match-phase gate (amendment 34)', () => {
  it('suppresses the PASSIVE tick entirely while false (ready room / finished)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.xpEnabled = false;
    for (let i = 0; i < TICKS_PER_LEVEL + 10; i++) w.step();
    expect(a.xpMs).toBe(0);
    expect(a.level).toBe(0);
    expect(a.bankedLevels).toBe(0);
  });

  it('does NOT gate kill credit — sinkShip credits the killer even with xpEnabled off', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    w.xpEnabled = false;
    w.sinkShip('b', 'a');
    w.step();
    expect(a.level).toBe(1);
    expect(a.bankedLevels).toBe(1);
  });

  // The Match-driven half of this gate (waiting/countdown off, active on,
  // finished off again) is pinned beside the other phase policies in
  // match.test.ts, where the lifecycle harness lives.
});

// ---------- kill credit ----------------------------------------------------------

describe('kill XP — value by victim, fraction always carried', () => {
  it('a HUMAN victim pays a full level: bank now, and the passive fraction survives', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    a.xpMs = Math.round(XP.levelMs * 0.4); // 40% of the way there
    w.sinkShip('b', 'a');
    expect(a.level).toBe(1);
    expect(a.bankedLevels).toBe(1);
    expect(a.xpMs).toBe(Math.round(XP.levelMs * 0.4)); // the 0.4 carried, unscathed
  });

  it('the BOUNTY HOLDER as victim pays killLevels + CONFIG.bounty.killLevels (Story 4.6), fraction still carried', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    place(w, 'v', 200, 0);
    w.sinkShip('v', 'b'); // b takes the throne (1 captain kill, strict unique max)
    a.xpMs = Math.round(XP.levelMs * 0.4); // the carry must survive the stacked grant
    w.sinkShip('b', 'a'); // a sinks the holder — one grant, both levels
    expect(a.level).toBe(XP.killLevels + CONFIG.bounty.killLevels);
    expect(a.bankedLevels).toBe(XP.killLevels + CONFIG.bounty.killLevels);
    expect(a.xpMs).toBe(Math.round(XP.levelMs * 0.4)); // the 0.4 carried, unscathed
  });

  it('a DRONE victim pays its size tier — ¼ / ⅓ / ½ — and only banks on a crossing', () => {
    const cases: [HullId, number][] = [
      ['droneSmall', XP.droneTierLevels.droneSmall],
      ['droneMedium', XP.droneTierLevels.droneMedium],
      ['droneLarge', XP.droneTierLevels.droneLarge],
    ];
    for (const [hull, fraction] of cases) {
      const w = bareWorld();
      const a = place(w, 'a');
      const d = place(w, `d-${hull}`, 200, 0, hull, true);
      w.sinkShip(d.id, 'a');
      expect(a.xpMs).toBe(Math.round(XP.levelMs * fraction));
      expect(a.level).toBe(0); // a single drone is never a whole level
      expect(a.bankedLevels).toBe(0);
    }
  });

  it('three MEDIUM drones (⅓ each) bank exactly one level with nothing left over', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < 3; i++) {
      const d = place(w, `d${i}`, 200 + i, 0, 'droneMedium', true);
      w.sinkShip(d.id, 'a');
    }
    expect(a.level).toBe(1);
    expect(a.bankedLevels).toBe(1);
    expect(a.xpMs).toBe(0); // round(60000/3) × 3 === 60000 exactly
  });

  it('four SMALL drones (¼ each) bank exactly one level', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let i = 0; i < 4; i++) {
      const d = place(w, `d${i}`, 200 + i, 0, 'droneSmall', true);
      w.sinkShip(d.id, 'a');
    }
    expect(a.level).toBe(1);
    expect(a.xpMs).toBe(0);
  });

  it('banks ONE level on a 0.9 + 1.0 crossing and carries the remainder (never two)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    a.xpMs = Math.round(XP.levelMs * 0.9);
    w.sinkShip('b', 'a'); // +1.0 → 1.9 total
    expect(a.level).toBe(1);
    expect(a.bankedLevels).toBe(1);
    expect(a.xpMs).toBe(Math.round(XP.levelMs * 0.9));
  });

  it('banks TWO levels when one grant crosses twice (≥ 2.0 total)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.xpMs = Math.round(XP.levelMs * 0.5);
    w.grantXp(a, 1.6); // 0.5 + 1.6 = 2.1
    expect(a.level).toBe(2);
    expect(a.bankedLevels).toBe(2); // one pre-rolled offer PER level
    expect(a.xpMs).toBe(Math.round(XP.levelMs * 0.5 + XP.levelMs * 1.6) - 2 * XP.levelMs);
  });

  it('a DEAD killer still banks (kill XP is not alive-gated)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    w.sinkShip('a', 'b'); // a dies first — and this crowns b (Story 4.6: 1 captain kill, unique max)
    w.sinkShip('b', 'a'); // ...a's shell still lands, now on the BOUNTY HOLDER
    expect(isAfloat(a.lifecycle)).toBe(false);
    // The mutual destruction's second sink stacks the bounty bonus on the
    // standard captain level (Story 4.6): the dead killer banks BOTH.
    expect(a.level).toBe(XP.killLevels + CONFIG.bounty.killLevels);
    expect(a.bankedLevels).toBe(XP.killLevels + CONFIG.bounty.killLevels);
  });

  it('a DRONE killer banks nothing, however many hulls it sinks', () => {
    const w = bareWorld();
    const d = place(w, 'd', 0, 0, 'droneLarge', true);
    const a = place(w, 'a', 100, 0);
    w.sinkShip('a', 'd');
    expect(d.xpMs).toBe(0);
    expect(d.level).toBe(0);
    expect(d.bankedLevels).toBe(0);
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('storm / self / unattributed sinks pay nothing, silently', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 100, 0);
    w.sinkShip('a'); // storm — no killer
    w.sinkShip('b', 'b'); // self-kill
    w.step();
    expect(a.level).toBe(0);
    expect(a.xpMs).toBe(0);
    expect(b.level).toBe(0);
    expect(b.bankedLevels).toBe(0);
    expect(ptsOf(w.tickEvents)).toEqual([]);
  });

  it('DAMAGE pays no XP — only the sink does', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 100, 0);
    const before = a.xpMs;
    b.hp -= 40; // damage without a sink, through the record itself
    expect(a.xpMs).toBe(before);
    expect(a.level).toBe(0);
  });

  it('grantXp ignores zero/negative values (nothing to pay, nothing to bank)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.grantXp(a, 0);
    w.grantXp(a, -2);
    expect(a.xpMs).toBe(0);
    expect(a.level).toBe(0);
    expect(a.bankedLevels).toBe(0);
  });

  // Fail-closed on non-finite: `<= 0` is FALSE for NaN, so a NaN slipped past
  // the old guard and poisoned xpMs forever (every later comparison false, the
  // rail dead); Infinity spun the bank loop. Both must be inert.
  it('grantXp ignores NaN and Infinity (non-finite can neither poison xpMs nor spin the bank)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.xpMs = 1234; // a real, half-earned level in the bank
    w.grantXp(a, NaN);
    w.grantXp(a, Infinity);
    w.grantXp(a, -Infinity);
    expect(a.xpMs).toBe(1234); // untouched — not NaN, not overflowed
    expect(a.level).toBe(0);
    expect(a.bankedLevels).toBe(0);
    // ...and the ship still accrues normally afterwards (nothing was poisoned).
    w.grantXp(a, 1);
    expect(a.level).toBe(1);
    expect(a.xpMs).toBe(1234);
  });
});

// ---------- the wire ------------------------------------------------------------

describe('wire — lvl/xp are self-private and ride `you` alone', () => {
  it('reports the level count and the progress FRACTION on the own frame', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.xpMs = XP.levelMs / 2;
    a.level = 3;
    const f = buildFrame(w, 'a');
    expect(f.you!.lvl).toBe(3);
    expect(f.you!.xp).toBeCloseTo(0.5, 12);
    expect(f.you!.xp).toBeGreaterThanOrEqual(0);
    expect(f.you!.xp).toBeLessThan(1); // the accumulator never holds a whole level
  });

  it('never appears on a contact, and a spectator frame carries no `you` at all', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0);
    a.level = 5;
    a.xpMs = 30000;
    w.step();
    const fb = buildFrame(w, 'b');
    for (const c of fb.contacts) {
      expect('lvl' in c).toBe(false);
      expect('xp' in c).toBe(false);
    }
    // Dead-in-active = spectator: unfogged, and `you` (with it, the economy) is
    // omitted outright. Story 5.2: spectate begins at FOUNDER, not sink-entry
    // (a sinking captain stays fogged with `you`), so cross the window first.
    w.respawnEnabled = false;
    w.sinkShip('b', 'a');
    w.step(CONFIG.ship.sinkingWindowMs);
    const spec = buildFrame(w, 'b', 'active');
    expect(spec.spec).toBe(true);
    expect(spec.you).toBeUndefined();
    expect(JSON.stringify(spec)).not.toContain('"lvl"');
    expect(JSON.stringify(spec)).not.toContain('"xp"');
  });
});
