// THE FLASH SHELLS BURST DISC (render/flashBurst.ts — Eric 2026-10-29, epic-10
// amendment 5(d)): black → wipe to white → fade out. Every expectation is
// derived from CLIENT_CONFIG.flashBurst; no ms, hex or radius is pinned. The
// "unknown shell → ordinary burst" half lives with the burst routing in
// roomBindings.test.ts ('bindRoom burst events').

import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { CONFIG } from '@salvo/shared';
import { FlashBursts, flashBurstLifeMs, flashBurstModel, flashBurstTint, flashDiscRadius } from '../render/flashBurst.js';

const { blackMs, wipeMs, fadeMs } = CLIENT_CONFIG.flashBurst;

describe('flashBurstModel — black, wipe, fade', () => {
  it('is opaque black through blackMs', () => {
    for (const e of [0, blackMs / 2, blackMs - 1]) {
      const f = flashBurstModel(e);
      expect(f.color01).toBe(0);
      expect(f.alpha).toBe(1);
      expect(f.done).toBe(false);
    }
  });

  it('wipes linearly to white, reaching it at blackMs + wipeMs', () => {
    expect(flashBurstModel(blackMs + wipeMs / 2).color01).toBeCloseTo(0.5, 9);
    const white = flashBurstModel(blackMs + wipeMs);
    expect(white.color01).toBe(1);
    expect(white.alpha).toBe(1);
  });

  it('fades out to alpha 0 and is done at the end of its life', () => {
    expect(flashBurstModel(blackMs + wipeMs + fadeMs / 2).alpha).toBeCloseTo(0.5, 9);
    const end = flashBurstModel(flashBurstLifeMs());
    expect(end.alpha).toBe(0);
    expect(end.done).toBe(true);
  });

  it('a garbage age reads as the first (black) frame', () => {
    expect(flashBurstModel(Number.NaN)).toEqual(flashBurstModel(0));
    expect(flashBurstModel(-10)).toEqual(flashBurstModel(0));
  });
});

describe('flashBurstTint — black to the palette white', () => {
  it('is black at 0 and the palette white at 1', () => {
    expect(flashBurstTint(0)).toBe(0);
    expect(flashBurstTint(1)).toBe(CLIENT_CONFIG.colors.white);
  });
});

describe('FlashBursts — spawned on the layer, aged off the frame clock, removed when done', () => {
  it('a disc lives for its life, then is removed from the layer', () => {
    let now = 1000;
    const layer = new Container();
    const fb = new FlashBursts(layer, () => now);
    fb.spawn(10, 20);
    expect(fb.liveCount).toBe(1);
    expect(layer.children.length).toBe(1);
    fb.render(now + blackMs + wipeMs + fadeMs / 2);
    expect(fb.liveCount).toBe(1);
    expect(layer.children[0].alpha).toBeCloseTo(0.5, 9);
    now += flashBurstLifeMs();
    fb.render(now);
    expect(fb.liveCount).toBe(0);
    expect(layer.children.length).toBe(0);
  });
});

// STORY 10.5 (R7, 2026-11-05): the disc draws the burst's STAMPED radius off the
// wire (`BurstEvent.r` — +25 u a tier), and only falls back to the base radius
// when `r` is absent or unusable.
describe('flashDiscRadius — the wire\'s stamped radius, else the base', () => {
  it('uses `r` when it is a finite positive radius', () => {
    const tiered = CONFIG.flashShells.radius + 2 * CONFIG.flashShells.radiusStepPerTier;
    expect(flashDiscRadius(tiered)).toBe(tiered);
  });

  it('falls back to the base radius when `r` is absent or unusable', () => {
    for (const r of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(flashDiscRadius(r), String(r)).toBe(CONFIG.flashShells.radius);
    }
  });

  it('a spawned disc is drawn at that radius', () => {
    const layer = new Container();
    const fb = new FlashBursts(layer, () => 0);
    const tiered = CONFIG.flashShells.radius + CONFIG.flashShells.radiusStepPerTier;
    fb.spawn(0, 0, tiered);
    fb.spawn(0, 0);
    const [wide, base] = layer.children;
    expect(wide.getLocalBounds().width).toBeCloseTo(2 * tiered, 6);
    expect(base.getLocalBounds().width).toBeCloseTo(2 * CONFIG.flashShells.radius, 6);
  });
});
