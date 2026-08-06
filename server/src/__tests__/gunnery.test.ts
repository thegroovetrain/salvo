// THE GUNNERY CONVERSATION — emission-site tests (Story 4.3, amendments
// 15-20). These pin WORLD behavior at the source: which resolutions emit
// `sp` (fall of shot — gun family only), `hc` (Hit Call — all ordnance,
// victim RESOLUTION not dmg emission, exactly one per shell life), and `mz`
// (muzzle flash — gun family only, true-muzzle position, one per owner per
// tick). Per-observer delivery rules live in signals.test.ts; the invariant
// oracles in perception.test.ts; wire fixtures in goldenFrames.test.ts.

import { describe, it, expect } from 'vitest';
import { CONFIG, type GameEvent, type HitCallEvent, type MuzzleEvent, type ShellState, type SplashEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { circleIsland } from './islandFixture.js';

/** World whose islands are cleared, for exact-geometry cases. */
function bareWorld(seed = 1): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(
  w: World,
  id: string,
  x: number,
  y: number,
  heading = 0,
  hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat',
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Drop a live ballistic directly into world state (contact-only hit rule
 *  unless target/burst fields are overridden). */
function injectShell(w: World, overrides: Partial<ShellState> & { id: string; ownerId: string }): ShellState {
  const shell: ShellState = {
    x: 0,
    y: 0,
    vx: CONFIG.gun.shellSpeed,
    vy: 0,
    distLeft: 200,
    bornAt: w.now,
    kind: 'shell',
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: CONFIG.gun.damage,
    ...overrides,
  };
  w.shells.set(shell.id, shell);
  return shell;
}

function fire(w: World, id: string, slot: number, aim: number, aimDist: number, seq = 1): void {
  w.submitInput(id, { seq, throttle: 0, rudder: 0, aim, fireSeq: seq, aimDist, slot, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
}

const ofKind = <K extends GameEvent['k']>(events: readonly GameEvent[], k: K) =>
  events.filter((e): e is Extract<GameEvent, { k: K }> => e.k === k);

/** Step until `pred` holds on this tick's events (or the budget runs out),
 *  accumulating every sp/hc/mz seen along the way. */
function stepCollect(
  w: World,
  ticks: number,
  until?: (events: readonly GameEvent[]) => boolean,
): { sp: SplashEvent[]; hc: HitCallEvent[]; mz: MuzzleEvent[] } {
  const acc = { sp: [] as SplashEvent[], hc: [] as HitCallEvent[], mz: [] as MuzzleEvent[] };
  for (let i = 0; i < ticks; i++) {
    w.step();
    acc.sp.push(...ofKind(w.tickEvents, 'sp'));
    acc.hc.push(...ofKind(w.tickEvents, 'hc'));
    acc.mz.push(...ofKind(w.tickEvents, 'mz'));
    if (until !== undefined && until(w.tickEvents)) break;
  }
  return acc;
}

// ---------- mz: the muzzle flash (amendments 15/19/20) ------------------------

describe('gunnery — mz emission (gun family only, true muzzle, one per owner per tick)', () => {
  it('a gun click emits ONE mz at the TRUE muzzle (== the shell spawn point), carrying only {k,x,y}', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    fire(w, 'a', 0, 0, 300);
    w.step();
    const mz = ofKind(w.tickEvents, 'mz');
    expect(mz).toHaveLength(1);
    expect(Object.keys(mz[0])).toEqual(['k', 'x', 'y']); // insertion order IS the wire order
    // No pre-step on a fireT=0 click: the un-stepped shell still sits at its
    // spawn origin, which IS the muzzle the flash must mark.
    const shell = [...w.shells.values()][0];
    expect(mz[0].x).toBe(shell.x);
    expect(mz[0].y).toBe(shell.y);
    // ...and that muzzle is at the HULL (silhouette edge), not out at a reveal
    // or target point.
    expect(Math.hypot(mz[0].x - a.state.x, mz[0].y - a.state.y)).toBeLessThan(80);
  });

  it('a D1 back-dated shot flashes at the muzzle while the shell pre-steps AHEAD (the latency mask)', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    // Aim a long shot (the gate reads the ship's stored input for the clicked
    // point), then fire with a time 200ms in the past: the spawned shell is
    // pre-stepped ~100u along its flight on the spawn tick.
    a.input = { seq: 0, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 600, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
    expect(w.sinkingActivationGate(a, 0, w.now - 200).ok).toBe(true);
    w.step();
    const mz = ofKind(w.tickEvents, 'mz');
    expect(mz).toHaveLength(1);
    expect(Math.hypot(mz[0].x - a.state.x, mz[0].y - a.state.y)).toBeLessThan(80); // the hull it left
    const shell = [...w.shells.values()][0];
    // The flash is NOT the shell's materialization point — the back-date
    // manifests as the shell being well ahead of the flash.
    expect(Math.hypot(shell.x - mz[0].x, shell.y - mz[0].y)).toBeGreaterThan(50);
  });

  it('a multi-barrel salvo (TWIN MOUNT) spawns 2 shells but exactly ONE mz for that ship that tick', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.applyBoon(a, 'gunBarrel'); // barrels 1 -> 2
    fire(w, 'a', 0, 0, 400);
    w.step();
    expect(w.shells.size).toBe(2); // the salvo really is multi-barrel
    expect(ofKind(w.tickEvents, 'mz')).toHaveLength(1); // per-tick per-owner dedupe
  });

  it('two DIFFERENT owners firing the same tick each get their own mz', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 900, 900);
    fire(w, 'a', 0, 0, 300);
    fire(w, 'b', 0, 0, 300);
    w.step();
    expect(ofKind(w.tickEvents, 'mz')).toHaveLength(2); // dedupe is per owner, never global
  });

  it("the cannon (battleship slot 1) flashes too — wire kind 'shell' IS the gun-family predicate", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0, 0, 'battleship');
    fire(w, 'a', 1, 0, 400);
    w.step();
    expect([...w.shells.values()][0]?.kind).toBe('shell'); // the cannon shell
    expect(ofKind(w.tickEvents, 'mz')).toHaveLength(1);
  });

  it('a torpedo launch emits NO mz — the ratified quiet weapon (amendment 20)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    fire(w, 'a', 1, 0, 0); // TB slot 1: the bow torpedo, dead ahead
    w.step();
    expect([...w.shells.values()][0]?.kind).toBe('torp'); // the launch really happened
    expect(ofKind(w.tickEvents, 'mz')).toHaveLength(0);
  });
});

// ---------- sp / hc: fall of shot and the Hit Call (amendments 16/17/18) ------

describe('gunnery — sp/hc emission (victim resolution; exactly one per shell)', () => {
  it('a gun burst into empty water: one sp at the burst point to the shooter, no hc', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    fire(w, 'a', 0, 0, 500); // clicked point 500u out — far beyond sight, empty water
    const acc = stepCollect(w, 40, (evs) => ofKind(evs, 'burst').length > 0);
    expect(acc.sp).toHaveLength(1);
    expect(acc.sp[0].id).toBe('a'); // the SHOOTER's id — the self-private gate key
    expect(acc.sp[0].x).toBeCloseTo(500, 4); // the true burst point
    expect(acc.hc).toHaveLength(0);
  });

  it('a gun burst that resolves a hull: one hc at the burst point, no sp — and the hc names NO victim', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 500, 0); // the fogged target under the clicked point
    fire(w, 'a', 0, 0, 500);
    const acc = stepCollect(w, 40, (evs) => ofKind(evs, 'burst').length > 0);
    expect(acc.hc).toHaveLength(1);
    expect(acc.hc[0].id).toBe('a'); // the SHOOTER — never the victim
    expect(Object.keys(acc.hc[0])).toEqual(['k', 'id', 'x', 'y']); // no severity channel exists
    expect(acc.sp).toHaveLength(0); // exactly one of hc/sp, never both
  });

  it('A DAMAGELESS FLARE bursting OVER a hull emits sp and NEVER hc (do not "fix" this — it would mint a detection channel)', () => {
    // Cross-model review (Codex) called this a bug: the burst geometrically
    // contained a hull, so surely it "connected"? No. A star shell damages
    // nothing, so a Hit Call would be a lie — and it would answer "is a hull
    // within burstRadius of this point?" for a flare lobbed blind into fog,
    // bypassing the lit zone + LOS that is the flare's ONE sanctioned way to
    // reveal a ship. The flare reports where it FELL; the zone it lights is
    // what finds people. This test exists so the next reader who spots the
    // `damage > 0` gate in resolveBurst does not helpfully open that hole.
    const w = bareWorld();
    place(w, 'a', 0, -900); // the shooter, nowhere near the burst
    place(w, 'b', 300, 0); // a hull sitting directly under the flare's burst point
    injectShell(w, {
      id: 'flare',
      ownerId: 'a',
      x: 280,
      y: 0,
      damage: 0, // the damageless star shell (amendment 39)
      contactDamage: 0,
      targetX: 300,
      targetY: 0,
      burstRadius: 60, // b is well inside it
    });
    const acc = stepCollect(w, 10, (evs) => ofKind(evs, 'burst').length > 0);
    expect(acc.sp).toHaveLength(1); // fall of shot: where the flare fell
    expect(acc.sp[0].id).toBe('a');
    expect(acc.hc).toHaveLength(0); // it connected with NOTHING
    expect(w.ships.get('b')!.hp).toBe(w.ships.get('b')!.stats.maxHp); // and hurt nothing
  });

  it("an early interception (hitShip) is a victim RESOLUTION: hc at the impact point", () => {
    const w = bareWorld();
    place(w, 'a', 0, -900); // shooter far away; the shell is injected mid-flight
    place(w, 'b', 100, 0); // the interceptor
    injectShell(w, { id: 's1', ownerId: 'a', x: 20, y: 0 }); // contact-rule shell, closing on b
    const acc = stepCollect(w, 10, (evs) => ofKind(evs, 'boom').length > 0);
    expect(acc.hc).toHaveLength(1);
    expect(acc.hc[0].id).toBe('a');
    expect(acc.sp).toHaveLength(0);
  });

  it('an island stop is a miss: sp, no hc', () => {
    const w = bareWorld();
    w.map.islands.push(circleIsland(100, 0, 30));
    place(w, 'a', 0, -900);
    injectShell(w, { id: 's1', ownerId: 'a', x: 20, y: 0 });
    const acc = stepCollect(w, 10, (evs) => ofKind(evs, 'boom').length > 0);
    expect(acc.sp).toHaveLength(1);
    expect(acc.hc).toHaveLength(0);
  });

  it('a range-end expiry is a miss: sp, no hc', () => {
    const w = bareWorld();
    place(w, 'a', 0, -900);
    injectShell(w, { id: 's1', ownerId: 'a', x: 20, y: 0, distLeft: 60 });
    const acc = stepCollect(w, 10, (evs) => ofKind(evs, 'boom').length > 0);
    expect(acc.sp).toHaveLength(1);
    expect(acc.hc).toHaveLength(0);
  });

  it('a torpedo that expires produces NOTHING — no sp for non-gun ordnance (amendment 16)', () => {
    const w = bareWorld();
    place(w, 'a', 0, -900);
    injectShell(w, { id: 't1', ownerId: 'a', kind: 'torp', x: 20, y: 0, distLeft: 60 });
    const acc = stepCollect(w, 10, (evs) => ofKind(evs, 'boom').length > 0);
    expect(acc.sp).toHaveLength(0);
    expect(acc.hc).toHaveLength(0);
  });

  it('a torpedo that CONNECTS produces an hc — the Hit Call is all ordnance (amendment 18)', () => {
    const w = bareWorld();
    place(w, 'a', 0, -900);
    place(w, 'b', 100, 0);
    injectShell(w, { id: 't1', ownerId: 'a', kind: 'torp', x: 20, y: 0 });
    const acc = stepCollect(w, 10, (evs) => ofKind(evs, 'boom').length > 0);
    expect(acc.hc).toHaveLength(1);
    expect(acc.hc[0].id).toBe('a');
    expect(acc.sp).toHaveLength(0);
  });

  it('the weapons-safe ready room still calls hits: damage suppressed, hc NOT (victim resolution, never dmg)', () => {
    const w = bareWorld();
    w.damageEnabled = false; // waiting/countdown target practice
    place(w, 'a', 0, 0);
    const b = place(w, 'b', 500, 0);
    const hpBefore = b.hp;
    fire(w, 'a', 0, 0, 500);
    const acc = stepCollect(w, 40, (evs) => ofKind(evs, 'burst').length > 0);
    expect(acc.hc).toHaveLength(1); // target practice gives feedback
    expect(b.hp).toBe(hpBefore); // ...but no hp moved
  });

  it('an AP shell piercing hulls across MULTIPLE ticks sends exactly ONE hc, at the FIRST pierce point — and no terminal sp', () => {
    const w = bareWorld();
    place(w, 'a', 0, -900);
    place(w, 'b', 150, 0); // first pierced hull
    place(w, 'c', 300, 0); // second pierced hull, a later tick
    injectShell(w, {
      id: 'ap1',
      ownerId: 'a',
      x: 0,
      y: 0,
      distLeft: 400, // pierces both, then expires by range — a would-be splash
      pierce: { remaining: 3, hitIds: [] },
    });
    const acc = stepCollect(w, 20, () => !w.shells.has('ap1') && w.tickEvents.length === 0);
    // Both hulls really were pierced (two victim-private dmg events)...
    expect(w.ships.get('b')!.hp).toBeLessThan(w.ships.get('b')!.stats.maxHp);
    expect(w.ships.get('c')!.hp).toBeLessThan(w.ships.get('c')!.stats.maxHp);
    // ...but the wire carries ONE hc (hull count is severity information),
    // anchored at the FIRST pierce point, and NO fall-of-shot for the
    // range-end stop of a shell that already connected.
    expect(acc.hc).toHaveLength(1);
    expect(acc.hc[0].x).toBeLessThan(150); // b's near hull edge — the first pierce
    expect(acc.sp).toHaveLength(0);
  });

  it('a tripped mine that resolves a victim sends one hc to the mine OWNER at the MINE position (amendment 18)', () => {
    const w = bareWorld();
    place(w, 'o', 900, 900, 0, 'mineLayer'); // the owner, nowhere near the trap
    place(w, 'b', 4, 0); // hull sitting on the mine — trips it on the first scan
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    const acc = stepCollect(w, 5, (evs) => ofKind(evs, 'boom').length > 0);
    expect(acc.hc).toHaveLength(1);
    expect(acc.hc[0]).toEqual({ k: 'hc', id: 'o', x: 0, y: 0 }); // the trap's position, the owner's id
    expect(acc.sp).toHaveLength(0); // mines never splash
  });

  it('a VICTIMLESS mine detonation (own gun burst) sends no hc — while the missing shell still splashes', () => {
    const w = bareWorld();
    place(w, 'o', 900, 900, 0, 'mineLayer'); // owner, alone on the water
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 300, y: 900, armedAt: 0 }); // own armed mine, 600u up-range
    fire(w, 'o', 0, Math.PI, 600); // click the mine's position — the burst detonates it
    const acc = stepCollect(w, 60, () => w.mines.size === 0);
    expect(w.mines.size).toBe(0); // the burst really detonated it
    expect(acc.hc).toHaveLength(0); // neither burst nor blast resolved any victim
    expect(acc.sp).toHaveLength(1); // the SHELL's own miss splashes; the mine adds nothing
  });
});
