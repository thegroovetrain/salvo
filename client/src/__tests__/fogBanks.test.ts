// FOG BANK rendering (render/fogBanks.ts, Story 9.10 — epic-9 amendments
// 162–169; Eric's pick B "Wisps", 2026-10-15). The contract: one node per
// delivered row, a row that stops arriving fades out over `fadeOutMs` and is
// dropped (a row returning mid-fade is kept), the seeded puff layout is the
// same for every viewer of a bank, the group alpha follows density under the
// `maxAlpha` cap, the drift holds still at motion off, and the layer sits
// between `litZone` and `smoke` (under every hull and mark).

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, TextureSource } from 'pixi.js';
import type { FogBankView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { FogBanks, fogBankAlpha, fogPuffCount, fogPuffs } from '../render/fogBanks.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';

// jsdom has no 2d canvas: the halo bake is stubbed with the real reuse
// contract (a live texture is handed back; only a bare call mints), the
// countermeasure suite's stub.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeHaloMaskTexture: (_haloU: number, into?: Texture | null): Texture => {
      const size = actual.HALO_MASK_TEXTURE_SIZE;
      return into ?? new Texture({ source: new TextureSource({ width: size, height: size }) });
    },
  };
});

const F = CLIENT_CONFIG.fogBank;
const bank = (id: string, r = 250, d = 1, x = 0, y = 0): FogBankView => ({ id, x, y, r, d });

describe('FogBanks.sync — one node per row, fade-out on absence', () => {
  it('creates one node per row', () => {
    const layer = new Container();
    const fog = new FogBanks(layer);
    fog.sync([bank('a'), bank('b', 150, 0.5, 400, 0)], 0);
    expect(fog.size).toBe(2);
    expect(fog.nodeOf('a')).not.toBeNull();
    expect(fog.nodeOf('b')).not.toBeNull();
  });

  it('fades a row that stops arriving and drops it after fadeOutMs', () => {
    const fog = new FogBanks(new Container());
    fog.sync([bank('a'), bank('b')], 0);
    fog.update(16, false);
    const before = fog.nodeOf('a')!.alpha;
    fog.sync([bank('b')], 50); // `a` left the halo
    fog.update(F.fadeOutMs / 2, false);
    expect(fog.size).toBe(2); // still fading
    expect(fog.nodeOf('a')!.alpha).toBeLessThan(before);
    expect(fog.nodeOf('a')!.alpha).toBeGreaterThan(0);
    fog.update(F.fadeOutMs / 2 + 1, false);
    expect(fog.nodeOf('a')).toBeNull();
    expect(fog.size).toBe(1);
  });

  it('keeps a row that returns mid-fade, snapping back to full alpha', () => {
    const fog = new FogBanks(new Container());
    fog.sync([bank('a')], 0);
    fog.update(16, false);
    const node = fog.nodeOf('a');
    const full = node!.alpha;
    fog.sync([], 50);
    fog.update(F.fadeOutMs / 2, false);
    fog.sync([bank('a')], 100); // back before the fade ended
    fog.update(F.fadeOutMs, false);
    expect(fog.nodeOf('a')).toBe(node);
    expect(fog.nodeOf('a')!.alpha).toBeCloseTo(full, 9);
  });

  it('clear drops every bank (the match-start edge)', () => {
    const fog = new FogBanks(new Container());
    fog.sync([bank('a'), bank('b')], 0);
    fog.clear();
    expect(fog.size).toBe(0);
  });
});

describe('the seeded puff layout (every viewer sees the same wisps)', () => {
  it('is identical for the same id across two instances', () => {
    expect(fogPuffs('fog-7', 250)).toEqual(fogPuffs('fog-7', 250));
  });

  it('differs across ids', () => {
    const a = fogPuffs('fog-7', 250).map((p) => [p.x, p.y]);
    const b = fogPuffs('fog-8', 250).map((p) => [p.x, p.y]);
    expect(a).not.toEqual(b);
  });

  it('scales its count with area within the clamp (a young bank is sparse)', () => {
    expect(fogPuffCount(250)).toBe(F.puffsPer250);
    expect(fogPuffCount(40)).toBe(F.puffMinCount);
    expect(fogPuffCount(1000)).toBe(F.puffMaxCount);
    expect(fogPuffCount(125)).toBeLessThan(fogPuffCount(250));
  });

  it('is append-only in the seeded sequence (a re-stamp keeps the old puffs, scaled)', () => {
    const small = fogPuffs('fog-3', 200);
    const big = fogPuffs('fog-3', 300);
    expect(big.length).toBeGreaterThan(small.length);
    for (let i = 0; i < small.length; i++) expect(big[i].x).toBeCloseTo(small[i].x * 1.5, 9);
  });
});

describe('alpha follows density under the cap', () => {
  it('scales with d and never exceeds maxAlpha', () => {
    expect(fogBankAlpha(0.25)).toBeLessThan(fogBankAlpha(0.75));
    expect(fogBankAlpha(1)).toBeLessThanOrEqual(F.maxAlpha);
    expect(fogBankAlpha(5)).toBeLessThanOrEqual(F.maxAlpha);
    expect(fogBankAlpha(Number.NaN)).toBe(0);
  });

  it('the drawn node carries it (a thin young bank reads thin)', () => {
    const fog = new FogBanks(new Container());
    fog.sync([bank('thin', 80, 0.2), bank('thick', 300, 1)], 0);
    fog.update(16, false);
    expect(fog.nodeOf('thin')!.alpha).toBeLessThan(fog.nodeOf('thick')!.alpha);
    expect(fog.nodeOf('thick')!.alpha).toBeLessThanOrEqual(F.maxAlpha);
  });
});

describe('drift', () => {
  it('motion off: the phase never advances and the bank sits on its centre', () => {
    const fog = new FogBanks(new Container());
    fog.sync([bank('a', 250, 1, 100, -50)], 0);
    for (let i = 0; i < 60; i++) fog.update(16, false);
    expect(fog.driftPhase).toBe(0);
    const g = fog.nodeOf('a')!;
    expect([g.position.x, g.position.y]).toEqual([100, -50]);
  });

  it('motion on: the phase advances and the bank drifts within driftU', () => {
    const fog = new FogBanks(new Container());
    fog.sync([bank('a', 250, 1, 100, -50)], 0);
    for (let i = 0; i < 60; i++) fog.update(16, true);
    expect(fog.driftPhase).toBeGreaterThan(0);
    const g = fog.nodeOf('a')!;
    expect(Math.hypot(g.position.x - 100, g.position.y + 50)).toBeLessThanOrEqual(F.driftU * Math.SQRT2);
  });
});

describe('the halo mask (reused flash-rung + island LOS pieces)', () => {
  it('masks the layer only with an own pose and a bank held; a spectator is unmasked', () => {
    const layer = new Container();
    const fog = new FogBanks(layer);
    fog.update(16, false, { x: 0, y: 0 });
    expect(layer.mask ?? null).toBeNull(); // nothing held: no mask pass
    fog.sync([bank('a')], 0);
    fog.update(16, false, { x: 10, y: 20 });
    expect(layer.mask).toBe(fog.haloMask);
    expect([fog.haloMask!.position.x, fog.haloMask!.position.y]).toEqual([10, 20]);
    fog.update(16, false, null); // spectator
    expect(layer.mask ?? null).toBeNull();
  });
});

describe('the declared seat', () => {
  const at = (n: string): number => CHART_LAYER_ORDER.indexOf(n as never);
  it('fog sits directly above litZone and directly below smoke, under every hull and mark', () => {
    expect(at('fog')).toBe(at('litZone') + 1);
    expect(at('smoke')).toBe(at('fog') + 1);
    for (const above of ['mineChart', 'ship', 'plate', 'cloud', 'blip', 'ownShip']) {
      expect(at(above)).toBeGreaterThan(at('fog'));
    }
  });
});
