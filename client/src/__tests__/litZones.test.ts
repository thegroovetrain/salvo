// Star-shell lit-zone render logic (render/litZones.ts) — the pure reconcile
// diff (mines precedent), the firer-hue tint (Story 1.12), and the timestamp
// fade. The Pixi wiring (LitZones class) is a thin adapter around these.

import { afterEach, describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { LitZoneView } from '@salvo/shared';
import {
  EMBER_HZ,
  advanceEmberPhase,
  dazzleRadii,
  emberAlpha,
  insideAnyZone,
  litZoneFade,
  ownActiveZones,
  reconcileLitZones,
  zoneMode,
  LitZones,
  LIT_FADE_MS,
} from '../render/litZones.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

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

// --- STORY 2.9 (amendment 50): a zone reads as its DOCTRINE, for everyone -------
//
// The one deliberate wire change of this story: `LitZoneView.mode`. Eric ruled
// counterplay over concealment — a lit zone IS observable behavior of a fired
// shell, so what that behavior DOES (burn you / blind you / just light the
// water) is part of what an observer legitimately sees. Everything here is
// therefore about legibility, not secrecy: the firer's hue keeps the ring, the
// doctrine layers inside it, and a frame with no mode still paints a flare.

describe('zoneMode — the doctrine a zone view carries', () => {
  it('reads the mode straight off the view', () => {
    expect(zoneMode({ mode: 'incendiary' })).toBe('incendiary');
    expect(zoneMode({ mode: 'dazzle' })).toBe('dazzle');
    expect(zoneMode({ mode: 'standard' })).toBe('standard');
  });

  it('falls back to standard when the field is absent (never blanks a zone)', () => {
    expect(zoneMode({})).toBe('standard');
  });
});

describe('LitZones.sync — per-doctrine glows', () => {
  const modal = (id: string, mode: LitZoneView['mode']): LitZoneView => ({ ...zone(id), mode });

  it('paints each doctrine as itself and keeps a mode-less zone standard', () => {
    const litZones = new LitZones(new Container());
    litZones.sync(
      [modal('burn', 'incendiary'), modal('glare', 'dazzle'), modal('plain', 'standard'), zone('legacy')],
      () => 0x00ff00,
    );
    expect(litZones.modeOf('burn')).toBe('incendiary');
    expect(litZones.modeOf('glare')).toBe('dazzle');
    expect(litZones.modeOf('plain')).toBe('standard');
    expect(litZones.modeOf('legacy')).toBe('standard');
  });

  it('gives ONLY the burning zone an ember layer (dazzle is deliberately static)', () => {
    const litZones = new LitZones(new Container());
    litZones.sync([modal('burn', 'incendiary'), modal('glare', 'dazzle'), zone('plain')], () => 0x00ff00);
    expect(litZones.emberAlphaOf('burn')).toBeGreaterThan(0);
    expect(litZones.emberAlphaOf('glare')).toBeNull();
    expect(litZones.emberAlphaOf('plain')).toBeNull();
  });

  it('renders an enemy zone with its doctrine too (amendment 50 is not own-only)', () => {
    const litZones = new LitZones(new Container());
    litZones.sync([{ ...modal('enemy', 'incendiary'), by: 'foe' }], () => 0x00ff00);
    expect(litZones.modeOf('enemy')).toBe('incendiary');
  });
});

// STORY 2.9 REVIEW — the DAZZLE glare is CONTAINED. The draft halo was drawn at
// 1.28x the zone's wire radius, so the flash-blind advertised itself over a ring
// of water it does not actually affect: a marker bigger than the thing it marks
// (amendment 47), and here it is also a tactical lie, since `r` is exactly the
// circle a player is deciding whether to sail through.
describe('dazzleRadii — the glare lives INSIDE the ring', () => {
  it('never paints past the zone radius', () => {
    const { halo, core } = dazzleRadii(100);
    expect(halo).toBeLessThanOrEqual(100);
    expect(core).toBeLessThanOrEqual(halo);
    expect(core).toBeGreaterThan(0); // ...and it is still a glare, not nothing
  });

  it('pins the draft fractions themselves at <= 1 (the drift catches here first)', () => {
    expect(CLIENT_CONFIG.litZone.haloFrac).toBeLessThanOrEqual(1);
    expect(CLIENT_CONFIG.litZone.glareFrac).toBeLessThanOrEqual(1);
  });

  it('clamps structurally, so a future retune cannot escape the ring', () => {
    // Scale-free: whatever the config says, the drawn radius is capped at r.
    for (const r of [1, 40, 260]) expect(dazzleRadii(r).halo).toBeLessThanOrEqual(r);
  });

  it('keeps the ring as the boundary — the halo stops short of it', () => {
    expect(dazzleRadii(200).halo).toBeLessThan(200);
  });
});

describe('the ember breath — motion, over information that never moves', () => {
  afterEach(() => settings.reset());

  it('breathes the ember alpha over time, under the photosensitivity ceiling', () => {
    const litZones = new LitZones(new Container());
    litZones.sync([{ ...zone('burn'), mode: 'incendiary' }], () => 0x00ff00);
    litZones.render(0, 0);
    const base = litZones.emberAlphaOf('burn') ?? 0;
    litZones.render(0, 0.5); // a quarter-cycle at 0.5Hz
    expect(litZones.emberAlphaOf('burn')).not.toBeCloseTo(base, 6);
    expect(EMBER_HZ).toBeLessThanOrEqual(CLIENT_CONFIG.settings.pulseCapHz);
  });

  it('holds the ember at its BASE alpha with motion off — the fire is still there', () => {
    settings.set({ motion: 'off' });
    const litZones = new LitZones(new Container());
    litZones.sync([{ ...zone('burn'), mode: 'incendiary' }], () => 0x00ff00);
    const seen = new Set<number>();
    for (let t = 0; t < 4; t += 0.25) {
      litZones.render(0, t);
      seen.add(litZones.emberAlphaOf('burn') ?? -1);
    }
    expect([...seen]).toEqual([emberAlpha(0, 0)]); // one value, all frame long
    expect(emberAlpha(0, 0)).toBeGreaterThan(0); // ...and it is VISIBLE, not off
  });

  it('advanceEmberPhase integrates and clamps a wild frame gap (the hud precedent)', () => {
    expect(advanceEmberPhase(0, 0)).toBe(0);
    expect(advanceEmberPhase(0, -5)).toBe(0); // never runs backwards
    // A backgrounded tab returning after a minute advances by the clamp, not 60s.
    expect(advanceEmberPhase(0, 60)).toBeCloseTo(advanceEmberPhase(0, 0.5), 9);
    expect(advanceEmberPhase(0, 0.5)).toBeLessThan(Math.PI * 2); // wrapped
  });

  it('the expiry fade and the ember breath never fight over one alpha', () => {
    // The glow's fade rides the parent's alpha; the ember is a CHILD, so a zone
    // dying mid-breath fades out whole instead of the fire flaring back up.
    const litZones = new LitZones(new Container());
    litZones.sync([{ ...zone('burn', 'me', 1000), mode: 'incendiary' }], () => 0x00ff00);
    litZones.render(1000 - LIT_FADE_MS / 2, 1); // half-faded
    const ember = litZones.emberAlphaOf('burn') ?? 0;
    expect(ember).toBeGreaterThan(0); // the child's own alpha is untouched...
    expect(litZoneFade(LIT_FADE_MS / 2)).toBeCloseTo(0.5, 9); // ...and the parent carries the fade
  });
});
