// Story 10.6 (R6 / I2 / I7) — the deck torpedo launchers on a hull view: one
// child per launcher at its SHARED station (fore, and aft when held), rotated
// by its angle, seated under the bold outline; the own hull draws its tubes,
// a sighted enemy one generic housing (its tube count is not on the wire);
// the contact store decodes `Contact.lu` exactly as it decodes `tu`.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  decodeLauncherAngle,
  encodeLauncherAngles,
  launcherRest,
  launcherStation,
  type Contact,
} from '@salvo/shared';
import { launcherArt } from '../render/hullArt/shapes.js';
import { launcherContext } from '../render/hullArt/pixiArt.js';
import { ShipView } from '../render/ships.js';
import { relationStyle } from '../render/relationColor.js';
import { ContactStore } from '../net/snapshots.js';

describe('launcherArt — tubes for the own hull, one housing for an observed one', () => {
  it('draws the pivot plus one barrel-skinned tube per tube (1 or 2), side by side', () => {
    for (const n of [1, 2]) {
      const prims = launcherArt(n);
      const tubes = prims.filter((p) => p.fill === 'barrel');
      expect(tubes, `tubes ${n}`).toHaveLength(n);
      expect(prims.filter((p) => p.kind === 'ellipse')).toHaveLength(1); // the pivot disc
    }
    const [a, b] = launcherArt(2).filter((p) => p.kind === 'poly') as Extract<ReturnType<typeof launcherArt>[number], { kind: 'poly' }>[];
    expect(Math.sign(a.pts[0].y + a.pts[2].y)).toBe(-Math.sign(b.pts[0].y + b.pts[2].y)); // mirrored about the bearing
  });

  it('the observed form is ONE housing and no tube detail', () => {
    const prims = launcherArt(null);
    expect(prims.filter((p) => p.fill === 'barrel')).toEqual([]);
    expect(prims.filter((p) => p.kind === 'poly')).toHaveLength(1);
  });

  it('every launcher line is an inner relation line — never the bold hull line', () => {
    for (const t of [1, 2, null]) for (const p of launcherArt(t)) expect(p.line).toBe('inner');
  });

  it('caches one shared context per (hull, tubes, line)', () => {
    expect(launcherContext('iowa', 2, 0x00ffff)).toBe(launcherContext('iowa', 2, 0x00ffff));
    expect(launcherContext('iowa', null, 0x00ffff)).not.toBe(launcherContext('iowa', 2, 0x00ffff));
  });
});

describe('ShipView.setLaunchers — one child per launcher at its shared station', () => {
  it('a hull change re-seats the launchers still UNDER the new hull\'s turrets', () => {
    const v = new ShipView(relationStyle('own'), 'yamato');
    v.setLaunchers([0, Math.PI], 1);
    v.setHullId('iowa');
    v.setLaunchers([0, Math.PI], 1);
    const kids = v.gfx.children;
    const firstTurret = Math.min(...Array.from({ length: v.turretCount }, (_, t) => kids.indexOf(v.turretView(t)!)));
    for (let i = 0; i < 2; i++) expect(kids.indexOf(v.launcherView(i)!)).toBeLessThan(firstTurret);
  });

  it('seats FORE then AFT at their stations, under the outline, rotated by their angles', () => {
    for (const id of SHIP_CLASS_IDS) {
      const v = new ShipView(relationStyle('own'), id);
      v.setLaunchers([0.4, Math.PI - 0.2], 2);
      expect(v.launcherCount).toBe(2);
      for (let i = 0; i < 2; i++) {
        const g = v.launcherView(i)!;
        expect([g.x, g.y], `${id} ${i}`).toEqual([launcherStation(id, i).x, launcherStation(id, i).y]);
      }
      expect(v.launcherView(0)!.rotation).toBeCloseTo(0.4);
      expect(v.launcherView(1)!.rotation).toBeCloseTo(Math.PI - 0.2);
      // UNDER the turrets (Eric 2026-11-05: "under the gun barrels, not over"), over the deck.
      const kids = v.gfx.children;
      for (let i = 0; i < 2; i++) {
        const at = kids.indexOf(v.launcherView(i)!);
        expect(at).toBeGreaterThan(kids.indexOf(v.hull));
        for (let t = 0; t < v.turretCount; t++) expect(at, `${id} launcher ${i} vs turret ${t}`).toBeLessThan(kids.indexOf(v.turretView(t)!));
      }
    }
  });

  it('an angle move is a rotation write only; a new tube count or launcher count rebuilds', () => {
    const v = new ShipView(relationStyle('own'), 'yamato');
    v.setLaunchers([0], 1);
    const first = v.launcherView(0)!;
    v.setLaunchers([0.5], 1);
    expect(v.launcherView(0)).toBe(first);
    v.setLaunchers([0.5], 2);
    expect(v.launcherView(0)).not.toBe(first);
    expect(v.launcherView(0)!.context).toBe(launcherContext('yamato', 2, relationStyle('own').stroke));
    v.setLaunchers([], 2);
    expect(v.launcherCount).toBe(0);
  });

  it('an observed hull wears the generic housing in the enemy line', () => {
    const v = new ShipView(relationStyle('enemy'), 'bismarck');
    v.setLaunchers([0], null);
    expect(v.launcherView(0)!.context).toBe(launcherContext('bismarck', null, relationStyle('enemy').stroke));
  });

  it('a drone mounts none', () => {
    const v = new ShipView(relationStyle('enemy'), 'droneSmall');
    v.setLaunchers([0, Math.PI], null);
    expect(v.launcherCount).toBe(0);
  });
});

describe('ContactStore — `Contact.lu` decoded like `tu`, snapped, dropped with the key', () => {
  const base: Contact = { id: 'e1', cls: 'warspite', x: 0, y: 0, heading: 0, speed: 0 } as Contact;

  it('decodes each whole-degree entry off its launcher\'s rest', () => {
    const store = new ContactStore();
    const lu = encodeLauncherAngles([{ a: 0.5, tubes: [] }, { a: launcherRest(1) - 0.3, tubes: [] }]);
    store.pushFrame(100, [{ ...base, lu }]);
    expect(store.launcherAnglesOf('e1')).toEqual(lu.map((q, i) => decodeLauncherAngle(i, q)));
    expect(store.launcherAnglesOf('e1')![0]).toBeCloseTo(0.5, 1);
  });

  it('a frame without `lu` (no torpedo held) clears the entry, and prune drops it', () => {
    const store = new ContactStore();
    store.pushFrame(100, [{ ...base, lu: [0] }]);
    store.pushFrame(150, [base]);
    expect(store.launcherAnglesOf('e1')).toBeUndefined();
    store.pushFrame(200, [{ ...base, lu: [0] }]);
    store.prune(200 + CONFIG.tick.interpDelayMs * 100, 1);
    expect(store.launcherAnglesOf('e1')).toBeUndefined();
  });
});
