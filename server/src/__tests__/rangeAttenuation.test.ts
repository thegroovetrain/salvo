// DECK-GUN RANGE ATTENUATION AT THE WORLD'S BLOW SITES (Story 9.12, Eric
// 2026-10-16, epic-9 amendments 184–185 — full damage out to ~50 % of the
// gun's range, then linear to `CONFIG.gunAttenuation.minFactor` at max range;
// the floor moved 80 % → 50 % on 2026-10-17, amendment 187).
//
// The pure curve is pinned in shared attenuation.test.ts; this file guards the
// SERVER'S use of it through the real fire paths:
//   * every deck-gun blow is `settleBlow(D × rim(flak only) × atten(flown))`,
//     flown = the shell's launch point → impact, against the firing row's
//     `rangeU` at fire time (ruling 184(b)), never the lit-zone-lifted reach;
//   * the cannon / flak bodyblock `contactDamage` is NOT attenuated (184(c));
//   * a positive blow lands at least 1 (the 1 hp drone shell);
//   * a shell with no reference (an injected shell) is unattenuated;
//   * a decoy takes exactly what a hull would (reading r6);
//   * THE LIT EXEMPTION (Eric 2026-10-17, amendment 187): a shot aimed into
//     the shooter's OWN live lit zone carries no reference and deals the full
//     blow, even past range; another captain's light exempts nothing;
//   * the launch point and the reference are SERVER-PRIVATE — no frame row
//     carries either (the projectile wire row's field pick is unchanged).
// Every expected number is DERIVED from CONFIG and the shared functions.

import { describe, it, expect, vi } from 'vitest';
import {
  CONFIG,
  flakRimFactor,
  rangeAttenuation,
  settleBlow,
  type BoomEvent,
  type DamageEvent,
  type GameEvent,
  type InputMsg,
  type ShellState,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { addDecoy } from '../game/decoys.js';
import { flatRaster } from './islandFixture.js';

const HALF_PI = Math.PI / 2;
/** The battleship's half length — its stern tip sits this far behind centre
 *  (broadside-on, heading +y, the stern tip points at −y). */
const BS_HALF = 62;

function bareWorld(seed = 912): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function ship(
  w: World,
  id: string,
  x: number,
  y: number,
  opts: { heading?: number; hull?: 'torpedoBoat' | 'battleship'; gun?: 'machineGun' | 'flak'; role?: 'captain' | 'fleet' } = {},
): ShipRecord {
  const role = opts.role ?? 'captain';
  const hullId = role === 'fleet' ? 'droneSmall' : (opts.hull ?? 'torpedoBoat');
  const rec = w.addShip(id, id.toUpperCase(), role, hullId, undefined, { x, y }, opts.gun);
  rec.state = { x, y, heading: opts.heading ?? 0, speed: 0 };
  return rec;
}

function input(patch: Partial<InputMsg>): InputMsg {
  return { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

interface Shot {
  log: GameEvent[];
  /** every shell the shooter launched, as first seen (launch point + reference). */
  shells: ShellState[];
}

/** Fire `id`'s slot-0 gun at (aim, dist) — a click, or a held stream for the
 *  machine gun until one shell is out — and step until every shell resolves. */
function fire(w: World, id: string, dist: number, aim = 0): Shot {
  const stream = w.ships.get(id)!.loadout[0].equipmentId === 'machineGun';
  w.submitInput(id, input({ fireSeq: 2, aimDist: dist, aim, held: stream }));
  const log: GameEvent[] = [];
  const seen = new Map<string, ShellState>();
  for (let i = 0; i < 120; i += 1) {
    w.step();
    log.push(...w.tickEvents);
    for (const s of w.shells.values()) if (s.ownerId === id && !seen.has(s.id)) seen.set(s.id, { ...s });
    if (stream && seen.size > 0) w.submitInput(id, input({ seq: 3, fireSeq: 2, aimDist: dist, aim, held: false }));
    if (seen.size > 0 && ![...w.shells.values()].some((s) => s.ownerId === id)) return { log, shells: [...seen.values()] };
  }
  throw new Error('the shot never resolved');
}

/** The attenuation factor for a shell that flew from its launch point to `at`. */
function attenAt(shell: ShellState, at: { x: number; y: number }): number {
  return rangeAttenuation(Math.hypot(at.x - shell.originX!, at.y - shell.originY!), shell.attenRangeU!, CONFIG.gunAttenuation);
}

/** A burst shell's factor: it flew to its own target point. */
const burstAtten = (shell: ShellState): number => attenAt(shell, { x: shell.targetX!, y: shell.targetY! });

const dmgTo = (log: readonly GameEvent[], id: string): DamageEvent[] =>
  log.filter((e): e is DamageEvent => e.k === 'dmg' && e.id === id);

describe('the CANNON — near is full, far is attenuated, beyond range is clamped', () => {
  it('a click well inside half range lands the full damage on every caught hull', () => {
    const w = bareWorld();
    const a = ship(w, 'a', 0, 0);
    ship(w, 'b', 300, BS_HALF + 10, { hull: 'battleship', heading: HALF_PI }); // stern tip 10 u off the click
    const { log, shells } = fire(w, 'a', 300);
    expect(shells).toHaveLength(a.stats.equipment.gun.barrels);
    for (const s of shells) {
      expect(s.attenRangeU).toBe(a.stats.equipment.gun.rangeU); // the row's reach at fire time
      expect(burstAtten(s)).toBe(1); // flown < fullFrac × range
    }
    const hits = dmgTo(log, 'b');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.amount).toBe(CONFIG.gun.damage);
  });

  it('a click at ~90 % of range lands settleBlow(D × the linear factor), strictly between D × minFactor and D', () => {
    const w = bareWorld();
    const a = ship(w, 'a', 0, 0);
    const R = a.stats.equipment.gun.rangeU;
    ship(w, 'b', 0.9 * R, BS_HALF + 10, { hull: 'battleship', heading: HALF_PI });
    const { log, shells } = fire(w, 'a', 0.9 * R);
    const f = burstAtten(shells[0]);
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(CONFIG.gunAttenuation.minFactor);
    const expected = settleBlow(CONFIG.gun.damage * f);
    expect(expected).toBeLessThan(CONFIG.gun.damage);
    const hits = dmgTo(log, 'b');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.amount).toBe(expected);
  });

  it('the BODYBLOCK is never attenuated: an interceptor far down range takes exactly contactDamage from each shell', () => {
    const w = bareWorld();
    const a = ship(w, 'a', 0, 0);
    const R = a.stats.equipment.gun.rangeU;
    ship(w, 'b', 0.8 * R, 0, { hull: 'battleship', heading: HALF_PI }); // broadside ACROSS both tracks, far short of the click
    const { log, shells } = fire(w, 'a', 0.95 * R);
    // Non-vacuous: where it struck, a direct-style blow WOULD be attenuated.
    const boom = log.find((e): e is BoomEvent => e.k === 'boom' && e.hit === 'b')!;
    expect(attenAt(shells[0], boom)).toBeLessThan(1);
    const hits = dmgTo(log, 'b');
    expect(hits).toHaveLength(shells.length);
    for (const h of hits) expect(h.amount).toBe(CONFIG.gun.contactDamage);
  });
});

describe('the MACHINE GUN — its contact hit IS its damage, attenuated where it struck', () => {
  it('a hit inside half range deals the full damage', () => {
    const w = bareWorld();
    ship(w, 'a', 0, 0, { gun: 'machineGun' });
    ship(w, 'b', 250, 0, { hull: 'battleship', heading: HALF_PI });
    const { log, shells } = fire(w, 'a', 400);
    expect(shells).toHaveLength(1);
    const boom = log.find((e): e is BoomEvent => e.k === 'boom' && e.hit === 'b')!;
    expect(attenAt(shells[0], boom)).toBe(1);
    expect(dmgTo(log, 'b').map((h) => h.amount)).toEqual([CONFIG.machineGun.damage]);
  });

  it('a hit at ~90 % of range deals settleBlow(D × the factor at the STOP point)', () => {
    const w = bareWorld();
    const a = ship(w, 'a', 0, 0, { gun: 'machineGun' });
    const R = a.stats.equipment.machineGun.rangeU;
    ship(w, 'b', 0.92 * R, 0, { hull: 'battleship', heading: HALF_PI });
    const { log, shells } = fire(w, 'a', R);
    const boom = log.find((e): e is BoomEvent => e.k === 'boom' && e.hit === 'b')!;
    const f = attenAt(shells[0], boom);
    expect(f).toBeLessThan(1);
    const expected = settleBlow(CONFIG.machineGun.damage * f);
    expect(expected).toBeLessThan(CONFIG.machineGun.damage);
    expect(dmgTo(log, 'b').map((h) => h.amount)).toEqual([expected]);
  });
});

describe('the FLAK GUN — the half rim × the attenuation, settled once', () => {
  for (const [label, frac] of [['near', 0.45], ['far', 0.9]] as const) {
    it(`${label}: a hull whose nearest point is 30 u off the burst takes settleBlow(D × rim(30) × atten)`, () => {
      const w = bareWorld();
      const a = ship(w, 'a', 0, 0, { gun: 'flak' });
      const X = frac * a.stats.equipment.flak.rangeU;
      ship(w, 'b', X, BS_HALF + 30, { hull: 'battleship', heading: HALF_PI }); // stern tip 30 u off the burst
      const { log, shells } = fire(w, 'a', X);
      expect(shells).toHaveLength(1);
      const rim = flakRimFactor(30, CONFIG.flak.burstRadius, CONFIG.flak.rimFactor);
      const f = burstAtten(shells[0]);
      if (label === 'near') expect(f).toBe(1);
      else expect(f).toBeLessThan(1);
      const hits = dmgTo(log, 'b');
      expect(hits).toHaveLength(1);
      expect(hits[0].amount).toBeCloseTo(settleBlow(CONFIG.flak.damage * rim * f), 9);
    });
  }
});

describe('the floor of one, and the fail-open reference', () => {
  it('a PvE drone\'s 1 hp shell at max range still lands 1 (floor of one on a positive blow)', () => {
    const w = bareWorld();
    const d = ship(w, 'd', 0, 0, { role: 'fleet' });
    const gun = d.stats.equipment.gun;
    expect(gun.damage).toBe(CONFIG.drones.small.gun.damage);
    ship(w, 'b', gun.rangeU, BS_HALF + 10, { hull: 'battleship', heading: HALF_PI });
    const { log, shells } = fire(w, 'd', gun.rangeU);
    expect(burstAtten(shells[0])).toBeLessThan(1); // attenuated...
    const hits = dmgTo(log, 'b');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.amount).toBe(1); // ...and still one
  });

  it('a shell with NO reference (an injected shell) is unattenuated however far its launch point; the same shell WITH one is not', () => {
    for (const withRef of [false, true]) {
      const w = bareWorld();
      ship(w, 'o', -2000, 0);
      const b = ship(w, 'b', 0, BS_HALF + 10, { hull: 'battleship', heading: HALF_PI });
      const inner = w as unknown as {
        resolveShell(shell: unknown, outcome: unknown, hulls: readonly unknown[]): void;
        hitTargets(mask: readonly string[]): readonly unknown[];
      };
      const shell: ShellState = {
        id: 's1', ownerId: 'o', x: 0, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: w.now, kind: 'shell', family: 'cannon',
        damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius, targetX: 0, targetY: 0,
        burstRadius: CONFIG.gun.burstRadius, contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
      };
      if (withRef) Object.assign(shell, { originX: -2000, originY: 0, attenRangeU: CONFIG.gun.rangeU });
      inner.resolveShell(shell, { kind: 'burst', x: 0, y: 0 }, inner.hitTargets(CONFIG.gun.hits));
      const expected = withRef ? settleBlow(CONFIG.gun.damage * CONFIG.gunAttenuation.minFactor) : CONFIG.gun.damage;
      expect(b.stats.maxHp - b.hp).toBe(expected);
    }
  });
});

describe('a DECOY takes exactly what a hull would (reading r6)', () => {
  it('a far cannon click on a decoy: each burst lands settleBlow(D × atten)', () => {
    const w = bareWorld();
    const a = ship(w, 'a', 0, 0);
    ship(w, 'o', 0, -1500);
    const X = 0.9 * a.stats.equipment.gun.rangeU;
    const decoy = addDecoy(w.decoys, 'o', X, 0, 'd1');
    const before = decoy.hp;
    const { shells } = fire(w, 'a', X);
    const expected = settleBlow(CONFIG.gun.damage * burstAtten(shells[0]));
    expect(expected).toBeLessThan(CONFIG.gun.damage);
    expect(before - w.decoys.get('d1')!.hp).toBe(shells.length * expected); // both bursts cover its centre
  });

  it('a far machine-gun hit on a decoy lands settleBlow(D × the factor at the stop point)', () => {
    const w = bareWorld();
    const a = ship(w, 'a', 0, 0, { gun: 'machineGun' });
    ship(w, 'o', 0, -1500);
    const R = a.stats.equipment.machineGun.rangeU;
    const decoy = addDecoy(w.decoys, 'o', 0.92 * R, 0, 'd1');
    const before = decoy.hp;
    const { log, shells } = fire(w, 'a', R);
    const boom = log.find((e): e is BoomEvent => e.k === 'boom' && e.hit === 'd1')!;
    const f = attenAt(shells[0], boom);
    expect(f).toBeLessThan(1);
    expect(before - w.decoys.get('d1')!.hp).toBe(settleBlow(CONFIG.machineGun.damage * f));
  });
});

describe('the launch point and the reference never reach a frame', () => {
  const PRIVATE = ['originX', 'originY', 'attenRangeU'];
  const SHELL_ROW = new Set(['k', 'id', 'x', 'y', 'vx', 'vy', 't', 'w']);
  const hasKey = (v: unknown): boolean => {
    if (Array.isArray(v)) return v.some(hasKey);
    if (v === null || typeof v !== 'object') return false;
    return Object.entries(v as Record<string, unknown>).some(([k, x]) => PRIVATE.includes(k) || hasKey(x));
  };

  it('for all three deck guns: live shells carry both, no frame (shooter or watcher) carries either, and every shell row keeps its fixed field set', () => {
    for (const gun of [undefined, 'machineGun', 'flak'] as const) {
      const w = bareWorld();
      const a = ship(w, 'a', 0, 0, { gun });
      ship(w, 'b', 300, 120, { hull: 'battleship' }); // a watcher with the flight in sight
      const stream = gun === 'machineGun';
      w.submitInput('a', input({ fireSeq: 2, aimDist: 500, held: stream }));
      let carried = 0;
      let rows = 0;
      for (let i = 0; i < 60; i += 1) {
        w.step();
        for (const s of w.shells.values()) if (s.ownerId === 'a' && s.attenRangeU! > 0 && s.originX !== undefined) carried += 1;
        for (const id of ['a', 'b']) {
          const f = buildFrame(w, id);
          expect(hasKey(f)).toBe(false);
          for (const e of f.events) {
            if (e.k !== 'shell') continue;
            rows += 1;
            for (const k of Object.keys(e)) expect(SHELL_ROW.has(k)).toBe(true);
          }
        }
      }
      expect(a.loadout[0].equipmentId).toBe(gun ?? 'gun');
      expect(carried).toBeGreaterThan(0); // not vacuous: the shells did carry them
      expect(rows).toBeGreaterThan(0); // and their reveals did ride frames
    }
  });
});

// ---------------------------------------------------------------------------
// A SETTLED 0 IS NO BLOW AT THE INTERCEPTION SITE TOO (Story 9.12 review
// gate): under `--tune gunAttenuation.minFactor=0` a machine-gun hit at max
// range settles to 0 — it must take nothing, fire no aggro seam and emit no
// `dmg`, exactly as burstDamage already guards the burst site. The shell is
// injected with flown == its reference, so the factor is minFactor exactly.
// ---------------------------------------------------------------------------

describe('a machine-gun blow settled to 0 is NO blow (resolveInterception agrees with burstDamage)', () => {
  type Inner = {
    resolveShell(shell: unknown, outcome: unknown, hulls: readonly unknown[]): void;
    hitTargets(mask: readonly string[]): readonly unknown[];
  };

  /** A direct machine-gun shell that flew EXACTLY its reference to (x, 0). */
  function maxRangeMgShell(w: World, x: number): ShellState {
    const R = CONFIG.machineGun.rangeU;
    const D = CONFIG.machineGun.damage;
    return {
      id: 's1', ownerId: 'o', x, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: w.now, kind: 'shell', family: 'mg',
      damage: D, hitRadius: CONFIG.machineGun.shellRadius, targetX: x, targetY: 0, burstRadius: 0,
      contactDamage: D, hits: CONFIG.machineGun.hits, direct: true, originX: x - R, originY: 0, attenRangeU: R,
    };
  }

  function withMinFactorZero(body: () => void): void {
    const saved = CONFIG.gunAttenuation.minFactor;
    (CONFIG.gunAttenuation as { minFactor: number }).minFactor = 0;
    try {
      body();
    } finally {
      (CONFIG.gunAttenuation as { minFactor: number }).minFactor = saved;
    }
  }

  it('on a HULL: no hp lost, no drones.onDamaged, no `dmg`', () => {
    withMinFactorZero(() => {
      const w = bareWorld();
      ship(w, 'o', -3000, 0);
      const b = ship(w, 'b', 0, 0, { hull: 'battleship', heading: HALF_PI });
      const inner = w as unknown as Inner;
      const shell = maxRangeMgShell(w, 0);
      expect(settleBlow(shell.contactDamage * attenAt(shell, { x: 0, y: 0 }))).toBe(0); // the premise
      const aggro = vi.spyOn(w.drones, 'onDamaged');
      inner.resolveShell(shell, { kind: 'hitShip', victimId: 'b', x: 0, y: 0 }, inner.hitTargets(CONFIG.machineGun.hits));
      const log = [...(w as unknown as { pending: GameEvent[] }).pending];
      expect(b.hp).toBe(b.stats.maxHp);
      expect(aggro).not.toHaveBeenCalled();
      expect(dmgTo(log, 'b')).toHaveLength(0);
      expect(log.some((e) => e.k === 'boom')).toBe(true); // the interception itself still resolved
    });
  });

  it('on a DECOY: its hp is untouched and the decoy damage path is never entered', () => {
    withMinFactorZero(() => {
      const w = bareWorld();
      ship(w, 'o', -3000, 0);
      ship(w, 'a', 0, -3000);
      const decoy = addDecoy(w.decoys, 'o', 0, 0, 'd1');
      const before = decoy.hp;
      const inner = w as unknown as Inner;
      const shell = { ...maxRangeMgShell(w, 0), ownerId: 'a' };
      // damageDecoy(…, 0) would be an observational no-op on hp, so the
      // guard is pinned on the call itself.
      const hurt = vi.spyOn(w as unknown as { damageDecoy(id: string, n: number, by: string): boolean }, 'damageDecoy');
      inner.resolveShell(shell, { kind: 'hitShip', victimId: 'd1', x: 0, y: 0 }, inner.hitTargets(CONFIG.machineGun.hits));
      expect(w.decoys.get('d1')!.hp).toBe(before);
      expect(hurt).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// THE LIT EXEMPTION (Eric 2026-10-17, epic-9 amendment 187: "the lit up
// region is counted as within the 100% damage range, even if it otherwise
// wouldn't be"). Decided at FIRE TIME on the clamped aim point against the
// shooter's OWN live lit zones (guns.ts `attenRangeFor`): such a shell
// carries NO reference and deals the full blow wherever it lands.
// ---------------------------------------------------------------------------

type DeckGun = undefined | 'machineGun' | 'flak';
const GUNS: readonly DeckGun[] = [undefined, 'machineGun', 'flak'];
const gunLabel = (g: DeckGun): string => g ?? 'cannon';
function rowOf(rec: ShipRecord, g: DeckGun): { rangeU: number; damage: number } {
  const eq = rec.stats.equipment;
  return g === 'machineGun' ? eq.machineGun : g === 'flak' ? eq.flak : eq.gun;
}
const LIT_UNTIL = 10 * 60 * 1000;

/** A battleship placed so the gun's blow lands on it at an aim point (0, y)
 *  fired up +y: the cannon / flak burst 10 u off its stern tip (broadside
 *  along x, the tip at the click), the machine gun's direct shell striking
 *  its broadside (the hull centred ON the click). Returns the expected FULL blow. */
function targetAt(w: World, g: DeckGun, y: number, damage: number): number {
  if (g === 'machineGun') {
    ship(w, 'b', 0, y, { hull: 'battleship', heading: 0 }); // broadside ACROSS the track, centred on the click
    return damage;
  }
  ship(w, 'b', BS_HALF + 10, y, { hull: 'battleship', heading: 0 }); // stern tip 10 u off the click
  return g === 'flak' ? settleBlow(damage * flakRimFactor(10, CONFIG.flak.burstRadius, CONFIG.flak.rimFactor)) : damage;
}

describe('THE LIT EXEMPTION — a shot into the shooter\'s OWN lit zone is full damage (amendment 187)', () => {
  for (const g of GUNS) {
    it(`${gunLabel(g)}: aimed past rangeU into an OWN live lit zone, the live shell stamps no attenRangeU and the hull takes the FULL, unattenuated blow`, () => {
      const w = bareWorld();
      const a = ship(w, 'a', 0, 0, { gun: g });
      const { rangeU, damage } = rowOf(a, g);
      const far = rangeU + 200;
      w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 0, y: far, r: 120, until: LIT_UNTIL });
      const full = targetAt(w, g, far, damage);
      const { log, shells } = fire(w, 'a', far, HALF_PI);
      expect(shells.length).toBeGreaterThan(0);
      for (const s of shells) {
        expect(s.targetY).toBeCloseTo(far, 6); // the reach lift still applies
        expect('attenRangeU' in s).toBe(false); // no reference on the live shell
        expect('originX' in s).toBe(false);
      }
      // Non-vacuous: without the exemption this blow would be clamped at minFactor.
      expect(settleBlow(damage * CONFIG.gunAttenuation.minFactor)).toBeLessThan(damage);
      const hits = dmgTo(log, 'b');
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) expect(h.amount).toBe(full);
    });

    it(`${gunLabel(g)}: aimed at ~90 % of range into ANOTHER captain's lit zone, the shot IS attenuated (own flares only)`, () => {
      const w = bareWorld();
      const a = ship(w, 'a', 0, 0, { gun: g });
      ship(w, 'o', -2000, 0); // the flare's owner, far away
      const { rangeU, damage } = rowOf(a, g);
      const y = 0.9 * rangeU;
      w.litZones.set('z1', { id: 'z1', ownerId: 'o', x: 0, y, r: 120, until: LIT_UNTIL });
      targetAt(w, g, y, damage);
      const { log, shells } = fire(w, 'a', y, HALF_PI);
      for (const s of shells) expect(s.attenRangeU).toBe(rangeU); // the reference is stamped
      const hits = dmgTo(log, 'b');
      expect(hits.length).toBeGreaterThan(0);
      const boom = log.find((e): e is BoomEvent => e.k === 'boom' && e.hit === 'b');
      const at = g === 'machineGun' ? boom! : { x: shells[0].targetX!, y: shells[0].targetY! };
      const f = attenAt(shells[0], at);
      expect(f).toBeLessThan(1);
      const rim = g === 'flak' ? flakRimFactor(10, CONFIG.flak.burstRadius, CONFIG.flak.rimFactor) : 1;
      for (const h of hits) expect(h.amount).toBe(settleBlow(damage * rim * f));
    });
  }
});
