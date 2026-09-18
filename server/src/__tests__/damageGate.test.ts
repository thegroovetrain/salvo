// THE DAMAGE GATE (Story 8.4, AR47 / D28 / placement rule 12).
//
// Hull hp has ONE door: `World.applyDamage(victim, amount, src, byId)`. Before
// Story 8.4 there were three writers — `applyStorm`, `hitShip`, `burnShip` —
// each with its own inner order, which is why the shield (8.15), the decoy
// (8.15) and "no friendly fire" would have needed three copies of one rule.
//
// This file pins the gate from two directions:
//   * BEHAVIOUR — the fixed inner order, the friendly-fire refusal for every
//     source, the shield read, and what each source emits;
//   * TEXT — world.ts is read as a string and asserted to contain exactly one
//     `victim.hp -=`, with none in the three old writers. That half is
//     complementary to the ESLint `no-restricted-syntax` rule in
//     eslint.config.js, which covers every OTHER server file but cannot be
//     scoped inside one.
//
// Also here: the hp-INCREASE whitelist (AR47's "payRepair is the only regen
// path", read as a pinned list of the legitimate `hp =` sites — since Story
// 8.8 that list is payRepair, tickRegen and applyRepair plus the life-boundary
// resets), and `tickRepairs`' weapons-safe-room decision
// (`deferred-work.md:564`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG, type DamageEvent, type GameEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const WORLD_SRC = readFileSync(fileURLToPath(new URL('../game/world.ts', import.meta.url)), 'utf8');

/** Every DamageSource the union declares — the AR47 list, in AR47's order. */
const SOURCES = ['shell', 'burst', 'torpedo', 'missile', 'mine', 'burn', 'storm', 'contact'] as const;
type Src = (typeof SOURCES)[number];

/** The gate, reached directly. It is private by design (the only callers are
 *  inside world.ts); a test drives it by name, the world.test.ts idiom. */
interface Gate {
  applyDamage(victim: ShipRecord, amount: number, src: Src, byId: string | undefined): void;
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x = 0, y = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined, []);
  rec.state = { x, y, heading: 0, speed: 0 };
  return rec;
}

const gate = (w: World): Gate => w as unknown as Gate;
/** The events queued so far THIS tick. The gate is driven directly here (no
 *  `step()`), so `tickEvents` — last completed tick — would always be empty. */
const pend = (w: World): GameEvent[] => (w as unknown as { pending: GameEvent[] }).pending;
/** Drop the join-time `spawn` rows `addShip` queues, so a board's own setup
 *  does not read as damage output. */
const combatEvents = (w: World): GameEvent[] => pend(w).filter((e) => e.k !== 'spawn');
const dmgEvents = (w: World): DamageEvent[] =>
  pend(w).filter((e: GameEvent): e is DamageEvent => e.k === 'dmg');

// ---------------------------------------------------------------------------
// (a) NO FRIENDLY FIRE — structural, for every source
// ---------------------------------------------------------------------------

describe('applyDamage — (a) the friendly-fire refusal', () => {
  it('refuses every DamageSource whose attacker IS the victim: no hp, no ledger, no event', () => {
    for (const src of SOURCES) {
      const w = bareWorld();
      const a = place(w, 'a');
      const hp0 = a.hp;
      const dealt0 = a.damageDealt;
      gate(w).applyDamage(a, 40, src, 'a');
      expect(a.hp, src).toBe(hp0);
      expect(a.damageDealt, src).toBe(dealt0);
      expect(combatEvents(w).length, src).toBe(0);
      expect(a.lifecycle.kind, src).toBe('alive');
    }
  });

  it('a lethal self-hit cannot sink the owner — the refusal is BEFORE the sink check', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    gate(w).applyDamage(a, a.hp * 10, 'burst', 'a');
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.lifecycle.kind).toBe('alive');
  });

  it('an attacker who is NOT the victim is let through (the refusal is identity, not a blanket)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    gate(w).applyDamage(b, 10, 'shell', a.id);
    expect(b.hp).toBe(b.stats.maxHp - 10);
  });
});

// ---------------------------------------------------------------------------
// (b) the phase and sinking guards
// ---------------------------------------------------------------------------

describe('applyDamage — (b) the phase and sinking guards', () => {
  it('a weapons-safe room loses no hp, from any source', () => {
    for (const src of SOURCES) {
      const w = bareWorld();
      w.damageEnabled = false;
      const a = place(w, 'a');
      gate(w).applyDamage(a, 25, src, 'b');
      expect(a.hp, src).toBe(a.stats.maxHp);
      expect(combatEvents(w).length, src).toBe(0);
    }
  });

  it('a hull inside the sinking window cannot be finished off (amendment 12)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.sinkShip('a', 'b');
    expect(a.lifecycle.kind).toBe('sinking');
    const before = pend(w).length;
    gate(w).applyDamage(a, 999, 'burst', 'b');
    expect(a.hp).toBe(0);
    expect(pend(w).length).toBe(before); // no dmg, no second sunk
  });
});

// ---------------------------------------------------------------------------
// (c) the shield step
// ---------------------------------------------------------------------------

describe('applyDamage — (c) the shield (Story 8.15 arms it; the gate READS it)', () => {
  it('is null on a fresh hull and nothing in the sim ever sets it', () => {
    const w = bareWorld();
    expect(place(w, 'a').shield).toBeNull();
    // The whole point of the field landing in 8.4: the gate is the one reader,
    // so a grant path added later cannot end up with a second absorber. EVERY
    // write in world.ts assigns `null` — two expiries inside absorbShield plus
    // the three LIFE BOUNDARIES (sinkShip, redeployShip, respawn) that P5
    // added, so a fresh life can never inherit an open block. Nothing GRANTS
    // one until Story 8.15.
    const writes = WORLD_SRC.match(/\.shield = .*/g) ?? [];
    expect(writes).toHaveLength(5);
    for (const w2 of writes) expect(w2).toBe('.shield = null;');
  });

  it('DIES AT EVERY LIFE BOUNDARY: sinkShip, redeployShip and respawn all null it (P5)', () => {
    // An absorbing pool is economy, and a fresh life inherits no economy. The
    // reset is written while nothing GRANTS a shield precisely because the
    // boundary becomes invisible once Story 8.15 arms it.
    const inner = (w: World): {
      redeployShip(ship: ShipRecord, placed: { x: number; y: number }[], hold?: boolean): void;
      respawn(ship: ShipRecord): void;
    } => w as never;

    const sunk = bareWorld();
    const s = place(sunk, 'a');
    s.shield = { hpLeft: 40, until: sunk.now + 5000 };
    sunk.sinkShip('a', 'b');
    expect(s.shield).toBeNull();

    const red = bareWorld();
    const r = place(red, 'a');
    r.shield = { hpLeft: 40, until: red.now + 5000 };
    inner(red).redeployShip(r, [{ x: 0, y: 0 }]);
    expect(r.shield).toBeNull();

    const res = bareWorld();
    const p = place(res, 'a');
    res.sinkShip('a', 'b');
    p.shield = { hpLeft: 40, until: res.now + 5000 }; // granted mid-death window
    inner(res).respawn(p);
    expect(p.shield).toBeNull();
  });

  it('absorbs first, and a partly-absorbed hit puts only the REMAINDER on the hull', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.shield = { hpLeft: 20, until: w.now + 5000 };
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toBeNull(); // spent
    expect(a.hp).toBe(a.stats.maxHp - 10);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([10]); // the event reports the remainder
  });

  it('a FULLY absorbed hit still runs the gate to the end (AR47): shield drops, hp untouched, dmg 0', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.shield = { hpLeft: 50, until: w.now + 5000 };
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toEqual({ hpLeft: 20, until: w.now + 5000 });
    expect(a.hp).toBe(a.stats.maxHp);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([0]);
  });

  it('expires at `until` and absorbs nothing after it', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.shield = { hpLeft: 50, until: w.now - 1 };
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toBeNull();
    expect(a.hp).toBe(a.stats.maxHp - 30);
  });

  it('absorbs from EVERY source, storm and burn included (Eric)', () => {
    for (const src of ['storm', 'burn', 'mine', 'torpedo'] as const) {
      const w = bareWorld();
      const a = place(w, 'a');
      a.shield = { hpLeft: 100, until: w.now + 5000 };
      gate(w).applyDamage(a, 30, src, src === 'storm' ? undefined : 'b');
      expect(a.hp, src).toBe(a.stats.maxHp);
      expect(a.shield?.hpLeft, src).toBe(70);
    }
  });
});

// ---------------------------------------------------------------------------
// (d)-(g) the rest of the fixed order
// ---------------------------------------------------------------------------

describe('applyDamage — (d)-(g) hp, ledger, sink and the per-source report', () => {
  it('OVERKILL NEVER PAYS: the assist share is clamped to what the hull could absorb', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    b.hp = 5;
    gate(w).applyDamage(b, 50, 'burst', 'a');
    // The results-screen tally still counts the NOMINAL blow...
    expect(a.damageDealt).toBe(50);
    // ...while the hull floors at 0 rather than dipping negative, and sinks.
    expect(b.hp).toBe(0);
    expect(b.lifecycle.kind).toBe('sinking');
  });

  it("STORM: hp falls, NO dmg event, NO assist credit, and the sink has no killer", () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    a.hp = 2;
    gate(w).applyDamage(a, 10, 'storm', undefined);
    expect(a.hp).toBe(0);
    expect(dmgEvents(w)).toHaveLength(0);
    expect(b.damageDealt).toBe(0);
    const sunk = pend(w).find((e) => e.k === 'sunk');
    expect(sunk).toEqual({ k: 'sunk', id: 'a', by: undefined });
  });

  it('BURN banks into the DoT window instead of emitting per tick, and flushes BEFORE the sink', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 3, 'burn', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 3);
    expect(dmgEvents(w)).toHaveLength(0); // windowed, not per tick
    a.hp = 1;
    gate(w).applyDamage(a, 5, 'burn', 'b');
    const kinds = combatEvents(w).map((e) => e.k);
    expect(kinds.indexOf('dmg')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('dmg')).toBeLessThan(kinds.indexOf('sunk')); // dmg BEFORE sunk
  });

  it('every other source emits the immediate victim-private dmg, then sinks', () => {
    for (const src of ['shell', 'burst', 'torpedo', 'missile', 'mine', 'contact'] as const) {
      const w = bareWorld();
      const a = place(w, 'a');
      place(w, 'b', 400, 0);
      a.hp = 1;
      gate(w).applyDamage(a, 7, src, 'b');
      const kinds = combatEvents(w).map((e) => e.k);
      expect(kinds[0], src).toBe('dmg');
      expect(kinds, src).toContain('sunk');
    }
  });
});

// ---------------------------------------------------------------------------
// THE TEXT PINS
// ---------------------------------------------------------------------------

/** The body of a named private method in world.ts, brace-matched from its
 *  signature — enough to assert "this function contains no hp decrement". */
function methodBody(name: string): string {
  const start = WORLD_SRC.indexOf(`private ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = WORLD_SRC.indexOf('{', start); i < WORLD_SRC.length; i += 1) {
    if (WORLD_SRC[i] === '{') depth += 1;
    else if (WORLD_SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) return WORLD_SRC.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

describe('the grep pin — exactly one hull-hp decrement', () => {
  it('world.ts contains exactly ONE `victim.hp -=`, and it is inside applyDamage', () => {
    // Only the CODE line counts; the doc comment above the gate names it too.
    const code = WORLD_SRC.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    const decrements = code.filter((l) => /victim\.hp\s*-=/.test(l));
    expect(decrements).toHaveLength(1);
    expect(methodBody('applyDamage')).toContain('victim.hp -= dealt');
  });

  it('the three old writers contain NO hp decrement of any kind', () => {
    for (const name of ['applyStorm', 'hitShip', 'burnShip']) {
      expect(methodBody(name), name).not.toMatch(/\.hp\s*-=/);
    }
  });

  it('`buoy.hp -=` is the ONE non-hull decrement, and there is exactly one of it', () => {
    const code = WORLD_SRC.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    expect(code.filter((l) => /\.hp\s*-=/.test(l)).map((l) => l.trim())).toEqual([
      'victim.hp -= dealt; // (d) THE ONE HULL-HP DECREMENT IN THE GAME',
      'buoy.hp -= amount;',
    ]);
  });
});

describe('the hp-INCREASE whitelist (AR47 read as "the only REGEN path")', () => {
  it('every `ship.hp =` / `+=` in world.ts is one of the pinned sites', () => {
    const code = WORLD_SRC.split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('//'))
      .filter((l) => /\b(ship|victim)\.hp\s*(\+?)=[^=]/.test(l));
    expect(code).toEqual([
      // redeployShip — the match boundary resets the hull outright.
      'ship.hp = ship.stats.maxHp;',
      // sinkShip — the wreck is zeroed.
      'ship.hp = 0;',
      // applyCard — heal-on-grant, then the post-fold clamp to the new maxHp.
      'ship.hp = Math.min(ship.hp + delta, ship.stats.maxHp);',
      'ship.hp = Math.min(ship.hp, ship.stats.maxHp);',
      // payRepair — the PAID HULL REPAIR pool's drain.
      'ship.hp = Math.min(ship.hp + paid, ship.stats.maxHp);',
      // tickRegen — the OUT-OF-COMBAT regen (amendment 46): the snap to full
      // on the SHARED full-hull predicate (amendment 53 — under 1 hp missing,
      // the same word the HULL REPAIR row refuses on), then the
      // 1 %-of-missing-per-second trickle.
      'if (hullIsFull(ship.hp, maxHp)) ship.hp = maxHp;',
      'else ship.hp += missing * CONFIG.regen.missingPctPerS * (dtMs / 1000);',
      // applyRepair — HULL REPAIR's instant half, reached ONLY through
      // ActivationContext.applyRepair (Story 8.8).
      'ship.hp = Math.min(ship.hp + instantHp, ship.stats.maxHp);',
      // respawn — the second full reset.
      'ship.hp = ship.stats.maxHp;',
    ]);
  });

  it('payRepair never runs inside the gate', () => {
    expect(methodBody('applyDamage')).not.toContain('payRepair');
  });
});

// ---------------------------------------------------------------------------
// tickRepairs in the weapons-safe room (`deferred-work.md:564`) — DECIDED HERE
// ---------------------------------------------------------------------------

describe('tickRepairs stays UN-gated on damageEnabled (Story 8.4 decision, ledgered)', () => {
  it('a damage-control pool still drains in a weapons-safe room — and there is nothing there to heal FROM', () => {
    const w = bareWorld();
    w.damageEnabled = false;
    const a = place(w, 'a');
    a.hp = a.stats.maxHp - 20;
    a.repairHp = 20;
    w.step(CONFIG.tick.simDtMs);
    // It heals. That is the pinned decision, not an oversight: nothing can
    // damage a hull while damageEnabled is false (the gate's own step (b)), so
    // an open pool in the ready room can only be one a captain paid for
    // BEFORE the phase changed, and gating it would put a phase read on the
    // one repair path. (The OUT-OF-COMBAT regen reaches the same room on the
    // same reasoning — nothing there can have hurt anyone.)
    expect(a.hp).toBeGreaterThan(a.stats.maxHp - 20);
    expect(a.repairHp).toBeLessThan(20);
  });

  it('and the gate really does refuse damage in that same room, so the two can never disagree', () => {
    const w = bareWorld();
    w.damageEnabled = false;
    const a = place(w, 'a');
    gate(w).applyDamage(a, 50, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp);
  });
});
