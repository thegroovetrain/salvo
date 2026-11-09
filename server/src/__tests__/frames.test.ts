import { describe, it, expect } from 'vitest';
import { isAfloat, CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, FLASH_WINDOW_MS, SLOT_COUNT, abilityReadyAt, encodeTurretAngles } from '@salvo/shared';

import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const input = (seq: number, extra = {}) => ({
  seq,
  throttle: 1,
  rudder: 0,
  aim: 0,
  fireSeq: 0,
  aimDist: 0,
  slot: 0,
  fireT: 0,
  actSeq: 0,
  act: 0, hornSeq: 0, held: false, sec: false,
  ...extra,
});

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', DEFAULT_CLASS_ID, undefined, undefined);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

/** Two ships well inside each other's sight, no islands (fog stays out of the way). */
function makeWorld(): World {
  const w = new World(42);
  w.map.islands.length = 0;
  place(w, 'a', 0, 0);
  place(w, 'b', 0, -150); // abeam, clear of a's hull (Story 10.4: the battleships are ~115 u long)
  return w;
}

describe('buildFrame — shape and clock', () => {
  it('carries the world clock and tick', () => {
    const w = makeWorld();
    w.step();
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.t).toBe(w.now);
    expect(f.tick).toBe(2);
  });

  it('you is the full own-ship view with full ammo pools and sweep', () => {
    const w = makeWorld();
    w.submitInput('a', input(1, { slot: 2 }));
    w.step();
    const f = buildFrame(w, 'a');
    const ship = w.ships.get('a')!;
    expect(f.you).toEqual({
      id: 'a',
      x: ship.state.x,
      y: ship.state.y,
      heading: ship.state.heading,
      speed: ship.state.speed,
      hp: CONFIG.shipClasses[DEFAULT_CLASS_ID].hp,
      alive: true,
      // Slot-aligned ammo: length SLOT_COUNT (five since Story 10.5: gun,
      // Shift, torpedo, mine, special shell), null for every empty slot.
      // The MAIN BATTERY's derived pair in 0 (Story 10.4: n = turrets ready —
      // all of them, fresh), the default Shift in 1, and every other slot
      // empty since Story 8.10 deleted the spawn seed.
      ammo: [
        { n: ship.stats.equipment.mainBattery.maxAmmo, reloadMsLeft: 0 },
        { n: CONFIG.boost.maxAmmo, reloadMsLeft: 0 },
        ...Array.from({ length: SLOT_COUNT - 2 }, () => null),
      ],
      sweep: ship.sweepAngle,
      cls: DEFAULT_CLASS_ID,
      // THE SEAT'S SHIFT (Story 10.4 — the seat gun's successor) —
      // self-private beside `cls`, the default unless picked at the door.
      shift: DEFAULT_SHIFT,
      // THE TURRETS (Story 10.4) — angle + remaining reload per turret, the
      // record's own (one step of traverse toward the input's aim has landed).
      turrets: ship.turrets.map((t) => ({ a: t.a, reloadMsLeft: t.reloadMsLeft })),
      // THE SECONDARIES' HEAT — `{heat, locked}` only; cold and unlocked.
      sec: { heat: 0, locked: false },
      // (upg died with the legacy upgrade economy — Story 2.8 strip; slowedUntil
      // / fouledUntil are OMITTED, not 0, while inactive.)
      pts: 0, // no points banked
      offer: [], // no offer while pts is 0
      rd: false, // the countdown REDRAW is unused (Story 10.7, R4)
      ib: {}, // no exhausted-hull bonus points (Story 10.7, R5)
      boostUntil: 0, // owner-only speed-boost window end; inactive
      // DAMAGE CONTROL (2026-08-04): the remaining regen pool in hp, owner-only
      // on the boostUntil terms. REQUIRED (never omitted), so a pool-less hull
      // still carries an explicit 0 rather than a missing key.
      repairHp: 0,
      // Fitted card LINE ids — self-private (Story 8.1). EMPTY at spawn since
      // Story 8.10: nothing is held until the captain takes a card.
      cards: [],
      // Story 2.6, self-private too: levels completed + progress toward the
      // next as a 0..1 fraction of CONFIG.xp.levelMs. One 50ms step of passive
      // accrual has already landed (the world defaults to the active policy).
      lvl: 0,
      xp: CONFIG.tick.simDtMs / CONFIG.xp.levelMs,
    });
    expect(f.spec).toBeUndefined();
    // THE FIELD ORDER (contract §7): cls, shift, turrets, sec — adjacent (the
    // seat's `kit` that followed them left with Story 10.5).
    const keys = Object.keys(f.you!);
    const at = keys.indexOf('cls');
    expect(keys.slice(at, at + 4)).toEqual(['cls', 'shift', 'turrets', 'sec']);
    expect(keys).not.toContain('kit');
    expect(f.you!.turrets).toHaveLength(ship.stats.equipment.mainBattery.maxAmmo);
    expect(f.you!.turrets).not.toBe(ship.turrets); // a copy, never the live array
  });

  it('`ammo` holds exactly one entry per slot — FIVE since Story 10.5 — and no kit / shield / buoy key rides `you`', () => {
    const w = new World(1);
    w.addShip('k', 'K', 'captain', DEFAULT_CLASS_ID, undefined, undefined);
    const you = buildFrame(w, 'k').you!;
    expect(you.ammo).toHaveLength(SLOT_COUNT);
    for (const k of ['kit', 'shield', 'buoyShield', 'speedBuoyAt']) expect(k in you, k).toBe(false);
    expect('decoys' in buildFrame(w, 'k')).toBe(false);
  });

  it('omits you for an unknown viewer, who sees nothing (fail-closed)', () => {
    const w = makeWorld();
    w.step();
    const f = buildFrame(w, 'watcher');
    expect(f.you).toBeUndefined();
    expect(f.contacts).toEqual([]);
    expect(f.events).toEqual([]);
  });
});

describe('buildFrame — ackSeq', () => {
  it('echoes the highest accepted input seq, 0 before any input', () => {
    const w = makeWorld();
    expect(buildFrame(w, 'a').ackSeq).toBe(0);
    w.submitInput('a', input(5));
    w.submitInput('a', input(9));
    w.submitInput('a', input(3)); // stale — ignored
    w.step();
    expect(buildFrame(w, 'a').ackSeq).toBe(9);
    expect(buildFrame(w, 'b').ackSeq).toBe(0); // per-client
  });
});

describe('buildFrame — contacts (fogged via perception)', () => {
  it('excludes self and includes other living ships inside sight', () => {
    const w = makeWorld();
    place(w, 'c', 0, 150);
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.contacts.map((c) => c.id).sort()).toEqual(['b', 'c']);
    const b = w.ships.get('b')!;
    expect(f.contacts.find((c) => c.id === 'b')).toEqual({
      id: 'b',
      x: b.state.x,
      y: b.state.y,
      heading: b.state.heading,
      speed: b.state.speed,
      cls: DEFAULT_CLASS_ID,
      tu: encodeTurretAngles(b.turrets, b.hullId), // Story 10.4: angles, last
    });
  });

  it('excludes ships beyond sight range (fog)', () => {
    const w = makeWorld();
    place(w, 'far', CONFIG.vision.sight + 50, 0);
    w.step();
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });

  it('excludes dead ships; a respawned ship reappears once back in sight', () => {
    const w = makeWorld();
    w.sinkShip('b');
    // Story 5.2: b stays a legitimate SINKING contact for the window — the
    // exclusion this test pins starts at founder, and the respawn now lands
    // on the founder tick too (window 5000ms > respawn delay 3000ms).
    w.step(CONFIG.ship.sinkingWindowMs - CONFIG.tick.simDtMs);
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']); // still sinking
    for (let i = 0; i < 2; i++) w.step();
    const b = w.ships.get('b')!;
    expect(isAfloat(b.lifecycle)).toBe(true); // respawned on the ring, far outside a's sight
    expect(buildFrame(w, 'a').contacts).toEqual([]);
    b.state.x = 100; // steam back into a's bubble
    b.state.y = 0;
    expect(buildFrame(w, 'a').contacts.map((c) => c.id)).toEqual(['b']);
  });
});

describe('buildFrame — events (fogged via perception)', () => {
  it('emits your own spawn event on the tick after a join, then goes quiet', () => {
    const w = new World(7);
    w.addShip('a', 'ALPHA', undefined, undefined, undefined, undefined);
    w.step();
    const f = buildFrame(w, 'a');
    expect(f.events).toEqual([expect.objectContaining({ k: 'spawn', id: 'a' })]);
    w.step();
    expect(buildFrame(w, 'a').events).toEqual([]);
  });

  it('emits sunk to every client (PV 23), stamping seen only for witnesses', () => {
    const w = makeWorld();
    place(w, 'c', 2000, 0); // a distant third party, far beyond sight and radar
    w.step(); // flush join spawns
    w.sinkShip('b', 'a');
    w.step();
    const seen = { k: 'sunk', id: 'b', by: 'a', seen: true };
    // The killer's row is the same shape as a witness's (the `vcls` class
    // stamp of Story 5.6 retired with the PvE fleet, Story 10.8); it
    // additionally gets its self-private banked-point pt event.
    const aEvents = buildFrame(w, 'a').events;
    expect(aEvents.filter((e) => e.k === 'sunk')).toEqual([seen]); // wreck 150u away — witnessed
    expect(aEvents.filter((e) => e.k === 'pt')).toEqual([{ k: 'pt', id: 'a' }]);
    expect(buildFrame(w, 'b').events).toEqual([seen]); // victim always told (own hull ⇒ seen), never the killer's point
    // The public register: c never saw the wreck — the feed line's identity
    // arrives, the spatial license does not.
    expect(buildFrame(w, 'c').events.filter((e) => e.k === 'sunk')).toEqual([
      { k: 'sunk', id: 'b', by: 'a' },
    ]);
  });

  it('spawn events carry the spawn position', () => {
    const w = new World(11);
    const rec = w.addShip('a', 'ALPHA', undefined, undefined, undefined, undefined);
    w.step();
    expect(buildFrame(w, 'a').events[0]).toEqual({
      k: 'spawn',
      id: 'a',
      x: rec.state.x,
      y: rec.state.y,
    });
  });
});

describe('buildFrame — the `clouds` channel (Story 9.3)', () => {
  it('is OMITTED (not []) when the observer sees no cloud, and carries {id,x,y,t0,lifeMs,r0,r1} — nothing else — when it does', () => {
    const w = makeWorld();
    w.step();
    const quiet = buildFrame(w, 'a');
    expect('clouds' in quiet).toBe(false); // the litZones / burnZones / decoys rule, applied to clouds
    expect('smoke' in quiet).toBe(false); // 8.18's channel name is gone from the wire
    // A cloud made by `b` (a raw store write — the injectMine posture) 56.6 u
    // off `a` — well inside `a`'s radar range, no island (delivered; this
    // test pins the wire shape, not the gate).
    // Story 10.6 (I6): the cloud carries its STAMPED life and disc.
    const stamp = { lifeMs: 17_000, r0: 150, r1: 300 };
    w.clouds.set('cl1', { id: 'cl1', ownerId: 'b', x: 40, y: 40, bornAt: w.now, until: w.now + stamp.lifeMs, ...stamp });
    const f = buildFrame(w, 'a');
    expect(f.clouds).toEqual([{ id: 'cl1', x: 40, y: 40, t0: w.now, ...stamp }]);
    expect(Object.keys(f.clouds![0])).toEqual(['id', 'x', 'y', 't0', 'lifeMs', 'r0', 'r1']); // key order is the wire order
    expect(JSON.stringify(f)).not.toContain('ownerId');
    expect(JSON.stringify(f)).not.toContain('until'); // no zone in this frame, so the store's `until` may appear nowhere
    // The spectator path carries the same optional channel on the same rule.
    const spec = buildFrame(w, 'a', 'finished');
    expect(spec.spec).toBe(true);
    expect(spec.clouds).toEqual([{ id: 'cl1', x: 40, y: 40, t0: w.now, ...stamp }]);
  });
});

describe('buildFrame — the `drops` channel (Story 10.9, R3)', () => {
  it('is OMITTED (not []) when the observer sees no crate, and carries {id,x,y,g} — nothing else — when it does, on BOTH paths, LAST among the optional channels', () => {
    const w = makeWorld();
    w.step();
    const quiet = buildFrame(w, 'a');
    expect('drops' in quiet).toBe(false); // the litZones / burnZones / foulZones / clouds rule, applied to drops
    expect('drops' in buildFrame(w, 'a', 'finished')).toBe(false); // the spectator path too: no crates, no key
    // A crate 60 u off `a` (a raw store write — the injectMine posture): inside
    // a's detect rung, no island (delivered; this test pins the wire shape and
    // the channel order, not the gate — that is perception.test.ts's oracle).
    w.drops.set('d1', { id: 'd1', x: 60, y: 0, rolls: [['armor', 2], ['intel', 1]] });
    const f = buildFrame(w, 'a');
    expect(f.drops).toEqual([{ id: 'd1', x: 60, y: 0, g: [['armor', 2], ['intel', 1]] }]);
    expect(Object.keys(f.drops![0])).toEqual(['id', 'x', 'y', 'g']); // key order is the wire order
    expect(JSON.stringify(f)).not.toContain('rolls'); // the store's spelling never rides
    // The spectator path carries the same optional channel on the same rule.
    const spec = buildFrame(w, 'a', 'finished');
    expect(spec.spec).toBe(true);
    expect(spec.drops).toEqual([{ id: 'd1', x: 60, y: 0, g: [['armor', 2], ['intel', 1]] }]);
    // WIRE ORDER of the optional channels (key insertion): litZones,
    // burnZones, foulZones, clouds, then drops LAST — on both paths.
    w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: 0, r: 100, until: w.now + 5000 });
    w.burnZones.set('b1', { id: 'b1', ownerId: 'a', x: 0, y: 0, r: 60, until: w.now + 5000, dps: 5 });
    w.foulZones.set('f1', { id: 'f1', ownerId: 'a', x: 0, y: 0, r: 60, until: w.now + 5000 });
    w.clouds.set('cl1', { id: 'cl1', ownerId: 'b', x: 40, y: 40, bornAt: w.now, until: w.now + 17_000, lifeMs: 17_000, r0: 150, r1: 300 });
    const order = (frame: Record<string, unknown>): string[] => Object.keys(frame).filter((k) => ['litZones', 'burnZones', 'foulZones', 'clouds', 'drops'].includes(k));
    expect(order(buildFrame(w, 'a') as unknown as Record<string, unknown>)).toEqual(['litZones', 'burnZones', 'foulZones', 'clouds', 'drops']);
    expect(order(buildFrame(w, 'a', 'finished') as unknown as Record<string, unknown>)).toEqual(['litZones', 'burnZones', 'foulZones', 'clouds', 'drops']);
    // Delete the crate: the key is gone again, not [].
    w.drops.delete('d1');
    expect('drops' in buildFrame(w, 'a')).toBe(false);
  });
});

describe('buildFrame — the self-private wake-draft lift (Story 8.19)', () => {
  it('omits `draft` from `you` at 0 (never undefined, never 0) and carries the EXACT double when positive — never on a contact', () => {
    const w = makeWorld();
    const a = w.ships.get('a')!;
    a.draft = 0;
    const off = buildFrame(w, 'a');
    expect('draft' in off.you!).toBe(false);
    const lift = 0.05 * 0.7319281734; // an arbitrary non-round double
    a.draft = lift;
    const on = buildFrame(w, 'a');
    expect(Object.is(on.you!.draft, lift)).toBe(true);
    // b sees a as a contact: the lift rides a's own `you` and NOTHING else.
    const other = buildFrame(w, 'b');
    expect(other.contacts.some((c) => c.id === 'a')).toBe(true);
    expect(JSON.stringify({ ...other, you: undefined })).not.toContain('"draft"');
    expect('draft' in other.you!).toBe(false);
  });
});

describe('buildFrame — the self-private own windows (dazzledUntil; the Story 10.5 cooldowns)', () => {
  it('each is OMITTED while inactive and rides ONLY its own `you` while live — never a contact, never another observer', () => {
    const w = makeWorld();
    const a = w.ships.get('a')!;
    const KEYS = ['dazzledUntil', 'repairReadyAt', 'smokeReadyAt'];
    const idle = buildFrame(w, 'a').you!;
    for (const k of KEYS) expect(k in idle, k).toBe(false); // ready at spawn: no key
    w.now = 100_000;
    a.dazzledUntil = w.now + FLASH_WINDOW_MS;
    a.repairReadyAt = abilityReadyAt(w.now, a.stats, 'repair');
    a.smokeReadyAt = abilityReadyAt(w.now, a.stats, 'smoke');
    const you = buildFrame(w, 'a').you!;
    expect(you.dazzledUntil).toBe(a.dazzledUntil);
    expect(you.repairReadyAt).toBe(a.repairReadyAt);
    expect(you.smokeReadyAt).toBe(a.smokeReadyAt);
    const other = buildFrame(w, 'b');
    expect(other.contacts.some((c) => c.id === 'a')).toBe(true);
    const text = JSON.stringify({ ...other, you: undefined });
    for (const k of KEYS) {
      expect(text).not.toContain(k);
      expect(k in other.you!, k).toBe(false);
    }
    // ...and a SPECTATOR frame carries no `you` at all, so no one's cooldowns.
    const spec = buildFrame(w, 'b', 'finished');
    expect(spec.you).toBeUndefined();
    for (const k of KEYS) expect(JSON.stringify(spec)).not.toContain(k);
    // Lapsed: every window in the past — every key gone.
    w.now = Math.max(a.dazzledUntil, a.repairReadyAt, a.smokeReadyAt);
    const after = buildFrame(w, 'a').you!;
    for (const k of KEYS) expect(k in after, k).toBe(false);
  });
});
