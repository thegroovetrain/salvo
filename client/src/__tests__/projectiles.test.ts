import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import type { BallisticEvent } from '@salvo/shared';
import { Projectiles, shellCulledBeyondSight, shellPosition, maxLifetimeMs } from '../render/projectiles.js';
import type { OwnZone } from '../render/litZones.js';

describe('shellPosition (dead reckoning)', () => {
  it('extrapolates p0 + v*(now - t0)', () => {
    const p = shellPosition({ x: 0, y: 0 }, { vx: 130, vy: 0 }, 1000, 1500);
    expect(p.x).toBeCloseTo(65, 9); // 130 u/s * 0.5s
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('handles a diagonal velocity', () => {
    const p = shellPosition({ x: 10, y: -5 }, { vx: 20, vy: -40 }, 0, 250);
    expect(p.x).toBeCloseTo(10 + 20 * 0.25, 9);
    expect(p.y).toBeCloseTo(-5 - 40 * 0.25, 9);
  });

  it('clamps a past/negative elapsed to the launch point', () => {
    const p = shellPosition({ x: 3, y: 7 }, { vx: 130, vy: 130 }, 2000, 1000);
    expect(p).toEqual({ x: 3, y: 7 });
  });
});

describe('maxLifetimeMs (velocity-derived backstop)', () => {
  it('is the map-crossing time plus margin, in ms', () => {
    expect(maxLifetimeMs(900, 130)).toBeCloseTo(((2 * 900 + 100) / 130) * 1000, 6);
  });

  it('returns Infinity for a zero/negative speed', () => {
    expect(maxLifetimeMs(900, 0)).toBe(Infinity);
    expect(maxLifetimeMs(900, -5)).toBe(Infinity);
  });

  it('a faster projectile has a shorter lifetime backstop', () => {
    expect(maxLifetimeMs(900, 260)).toBeLessThan(maxLifetimeMs(900, 130));
  });
});

// --- Story 1.7: an own lit zone keeps a beyond-sight reveal from being culled ---

describe('shellCulledBeyondSight — beyond-sight cull with the lit-zone exception', () => {
  const origin = { x: 0, y: 0 };
  const cull2 = 260 * 260; // (sight 220 + margin 40)^2
  const inside = { x: 400, y: 0 }; // well beyond the sight bubble
  const near = { x: 100, y: 0 }; // inside the sight bubble

  it('culls a beyond-sight shell when NO own zone covers it (pre-1.7 behavior)', () => {
    expect(shellCulledBeyondSight(inside, origin, cull2, [])).toBe(true);
  });

  it('KEEPS a beyond-sight shell that lies inside an own active zone', () => {
    const zone: OwnZone = { x: 400, y: 0, r: 110, until: 10_000 };
    expect(shellCulledBeyondSight(inside, origin, cull2, [zone])).toBe(false);
  });

  it('still culls a beyond-sight shell outside the own zone radius', () => {
    const zone: OwnZone = { x: 400, y: 0, r: 110, until: 10_000 };
    expect(shellCulledBeyondSight({ x: 700, y: 0 }, origin, cull2, [zone])).toBe(true);
  });

  it('never culls a shell still inside the sight bubble (zones irrelevant there)', () => {
    expect(shellCulledBeyondSight(near, origin, cull2, [])).toBe(false);
  });
});

describe('Projectiles.render — the lit-zone reveal survives the beyond-sight cull', () => {
  const own = { x: 0, y: 0 };
  /** A shell already sitting 400u out (beyond sight), still-forming its position. */
  const farShell: BallisticEvent = { k: 'shell', id: 's1', x: 400, y: 0, vx: 0, vy: 0, t: 0 };

  it('culls a beyond-sight shell with no zone, but keeps it inside an own zone', () => {
    const withZone = new Projectiles(900, new Container());
    withZone.onShell(farShell);
    const zone: OwnZone = { x: 400, y: 0, r: 110, until: 10_000 };
    withZone.render(1, own, [zone]);
    expect(withZone.liveCount).toBe(1); // revealed by our flare — survives

    const noZone = new Projectiles(900, new Container());
    noZone.onShell(farShell);
    noZone.render(1, own, []);
    expect(noZone.liveCount).toBe(0); // no zone → culled exactly as before

    const enemyOnly = new Projectiles(900, new Container());
    enemyOnly.onShell(farShell);
    // ownActiveZones already filters enemy/expired out, so an enemy zone reaches
    // render() as an EMPTY keep list — the shell is culled.
    enemyOnly.render(1, own, []);
    expect(enemyOnly.liveCount).toBe(0);
  });
});
