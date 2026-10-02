// Star-shell lit-zone render logic (render/litZones.ts) — the pure reconcile
// diff (mines precedent), the firer-hue tint (Story 1.12), and the timestamp
// fade. The Pixi wiring (LitZones class) is a thin adapter around these.

import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { LitZoneView } from '@salvo/shared';
import {
  insideAnyZone,
  litZoneFade,
  ownActiveZones,
  reconcileLitZones,
  LitZones,
  LIT_FADE_MS,
} from '../render/litZones.js';

const zone = (id: string, by = 'enemy', until = 10_000): LitZoneView => ({
  id,
  x: 0,
  y: 0,
  r: 110,
  until,
  by,
});

describe('reconcileLitZones — zone list → sprite lifecycle diff', () => {
  it('adds every zone when starting from nothing', () => {
    const { add, remove } = reconcileLitZones(new Set(), [zone('z1'), zone('z2', 'me')]);
    expect(add.map((z) => z.id)).toEqual(['z1', 'z2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose zone dropped out of the list (expired or out of radar)', () => {
    const { add, remove } = reconcileLitZones(new Set(['z1', 'z2']), [zone('z1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['z2']);
  });

  it('leaves zones present in both untouched (static center — nothing to update)', () => {
    const { add, remove } = reconcileLitZones(new Set(['z1']), [zone('z1'), zone('z3')]);
    expect(add.map((z) => z.id)).toEqual(['z3']);
    expect(remove).toEqual([]);
  });

  it('a missing frame key syncs as an empty list — clears everything', () => {
    // roomBindings passes `f.litZones ?? []`; an empty incoming means every held
    // zone is now gone (out of radar or expired) and its sprite must despawn.
    const { add, remove } = reconcileLitZones(new Set(['a', 'b']), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });
});

describe('LitZones.sync — firer-hue tint (Story 1.12)', () => {
  it('resolves each new zone’s tint from its firer id (`by`) via hueFor', () => {
    const layer = new Container();
    const litZones = new LitZones(layer);
    const hueFor = vi.fn((_by: string) => 0x123456 as number | null);
    litZones.sync([zone('z1', 'alice'), zone('z2', 'bob')], hueFor);
    expect(hueFor.mock.calls.map((c) => c[0]).sort()).toEqual(['alice', 'bob']);
    expect(layer.children).toHaveLength(2);
  });

  it('recolors a glow that booted on the amber fallback once its firer hue later resolves, then latches', () => {
    const litZones = new LitZones(new Container());
    const hueFor = vi.fn((_by: string) => null as number | null);
    litZones.sync([zone('z1', 'late')], hueFor);
    expect(hueFor).toHaveBeenCalled(); // unresolved at spawn → amber fallback
    hueFor.mockReturnValue(0x00ff00);
    litZones.sync([zone('z1', 'late')], hueFor); // retry resolves + redraws
    const afterResolve = hueFor.mock.calls.length;
    litZones.sync([zone('z1', 'late')], hueFor); // latched — no more probes
    expect(hueFor.mock.calls.length).toBe(afterResolve);
  });
});

describe('litZoneFade — timestamp glow fade (until - serverNow)', () => {
  it('is full (1) while more than the fade window remains', () => {
    expect(litZoneFade(LIT_FADE_MS)).toBe(1); // exactly at the fade start
    expect(litZoneFade(LIT_FADE_MS + 5000)).toBe(1); // early in the zone life
  });

  it('ramps linearly to 0 across the last fade window', () => {
    expect(litZoneFade(LIT_FADE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(litZoneFade(LIT_FADE_MS * 0.1)).toBeCloseTo(0.1, 9);
  });

  it('is 0 at and past expiry (no negative alpha)', () => {
    expect(litZoneFade(0)).toBe(0);
    expect(litZoneFade(-500)).toBe(0); // clock ran past `until`
  });

  it('honors a custom fade window', () => {
    expect(litZoneFade(500, 1000)).toBeCloseTo(0.5, 9);
    expect(litZoneFade(1000, 1000)).toBe(1);
  });
});

describe('ownActiveZones — the fog-hole / cull-keep participation decision', () => {
  // The ONLY zones that grant the local player anything beyond the amber marker:
  // their own, still-active zones. Enemy zones and expired zones must NOT clear
  // fog or keep beyond-sight shells (P1/P2 review findings).
  const zones = (): LitZoneView[] => [
    { id: 'own-live', x: 100, y: 0, r: 110, until: 10_000, by: 'me' },
    { id: 'own-dead', x: 200, y: 0, r: 110, until: 4_000, by: 'me' },
    { id: 'enemy-live', x: 300, y: 0, r: 110, until: 10_000, by: 'foe' },
  ];

  it('keeps only the OWN, still-active zones (enemy + expired dropped)', () => {
    const active = ownActiveZones(zones(), 'me', 5_000);
    expect(active.map((z) => z.x)).toEqual([100]); // own-live only
    expect(active[0]).toEqual({ x: 100, y: 0, r: 110, until: 10_000 });
  });

  it('drops an own zone the instant it expires (until <= serverNow)', () => {
    expect(ownActiveZones(zones(), 'me', 10_000)).toEqual([]); // own-live now expired
  });

  it('with no own id (spectator / pre-session) participates in nothing', () => {
    expect(ownActiveZones(zones(), undefined, 5_000)).toEqual([]);
  });
});

describe('insideAnyZone — point-in-zone-circle test', () => {
  const zones = [{ x: 0, y: 0, r: 110, until: 0 }];

  it('is true inside the circle (incl. exactly on the edge) and false outside', () => {
    expect(insideAnyZone({ x: 0, y: 0 }, zones)).toBe(true); // center
    expect(insideAnyZone({ x: 110, y: 0 }, zones)).toBe(true); // on the edge
    expect(insideAnyZone({ x: 111, y: 0 }, zones)).toBe(false); // just outside
  });

  it('is false against an empty zone list (hull fired no flare)', () => {
    expect(insideAnyZone({ x: 0, y: 0 }, [])).toBe(false);
  });

  it('matches ANY of several zones', () => {
    const many = [
      { x: 0, y: 0, r: 50, until: 0 },
      { x: 500, y: 0, r: 60, until: 0 },
    ];
    expect(insideAnyZone({ x: 500, y: 40 }, many)).toBe(true); // inside the second
    expect(insideAnyZone({ x: 250, y: 0 }, many)).toBe(false); // between both
  });
});

// --- STORY 8.17 (amendment 134): a lit zone only ever LIGHTS -----------------
//
// The star shell's PHOSPHOR and DAZZLE verbs are deleted, and with them the
// `phos`/`daz` wire flags this renderer painted as an ember disc and a glare
// (the Story 2.9 / 7-5 per-verb pins that lived here). The burning treatment
// MOVED to render/burnZones.ts (its pins are in burnZones.test.ts); the glare
// went with the verb, since FLASH SHELLS leaves nothing on the water. What
// remains is the plain flare, drawn exactly as before: one fill and one ring.

describe('LitZones.sync — a lit zone is only ever the plain flare', () => {
  it('draws the fill + ring and nothing else — no ember child, no glare', () => {
    const layer = new Container();
    const litZones = new LitZones(layer);
    litZones.sync([zone('z')], () => 0x00ff00);
    const g = layer.children[0] as Graphics;
    expect(g.context.instructions).toHaveLength(2); // fill + stroke: the plain flare
    expect(g.children).toHaveLength(0); // no ember layer on a lit zone, ever
    expect(g.blendMode).toBe('add');
  });

  it('paints an enemy zone the same plain way (a flare says whose, not what)', () => {
    const layer = new Container();
    const litZones = new LitZones(layer);
    litZones.sync([zone('mine', 'me'), zone('theirs', 'foe')], () => 0x00ff00);
    const [a, b] = layer.children as Graphics[];
    expect(a.context.instructions.length).toBe(b.context.instructions.length);
  });

  it('fades the glow by its timestamp (until - serverNow)', () => {
    const layer = new Container();
    const litZones = new LitZones(layer);
    litZones.sync([zone('z', 'me', 1000)], () => 0x00ff00);
    litZones.render(1000 - LIT_FADE_MS / 2);
    expect(layer.children[0].alpha).toBeCloseTo(0.5, 9);
    litZones.render(1000);
    expect(layer.children[0].alpha).toBe(0);
  });
});

