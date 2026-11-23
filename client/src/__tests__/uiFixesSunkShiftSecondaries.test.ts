// UI fixes (Eric 2026-11-23): a hull known to be sinking keeps its name but
// draws no hull bar (contacts via the seen `sunk` signal, the own hull once it
// is down); the running Shift's tile breathes in amber; the SECONDARIES bar is
// full at the fastest rate and empty at the slowest. Every expectation reads
// the shared functions / CONFIG / the color tokens — no literal values.

import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { Container } from 'pixi.js';
import { CONFIG, DEFAULT_CLASS_ID, hullBlocks, secondariesIntervalMs, type Contact } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { NameplateLayer } from '../render/nameplates.js';
import { ContactViews } from '../render/contacts.js';
import { ContactStore } from '../net/snapshots.js';
import { ownPlateBlocks } from '../render/hullBars.js';
import { abilitySkin } from '../render/console/skins.js';
import { secondariesFill } from '../render/console/barWeapons.js';

// jsdom has no canvas text metrics: swap ONLY Text for a metric-free stub (the
// nameplate suites' pattern).
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class StubText {
    text: string;
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    anchor = { set(): void {} };
    constructor(o: { text: string; style: Record<string, unknown> }) {
      this.text = o.text;
      this.style = { ...o.style };
    }
    destroy(): void {}
  }
  return { ...actual, Text: StubText };
});

const C = CLIENT_CONFIG.colors;
type PlaceSpy = MockInstance<NameplateLayer['place']>;
const stubLayer = (): Container => ({ addChild() {}, removeChild() {} }) as unknown as Container;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a contact known to be sinking: name kept, no hull bar', () => {
  const HB = 2;
  const camera = { worldToScreen: (p: { x: number; y: number }) => p, zoom: 1 };
  const plates = { nameOf: () => 'ADM', camera };
  const row = (): Contact[] => [{ id: 'e1', x: 0, y: 0, heading: 0, speed: 0, cls: DEFAULT_CLASS_ID, hb: HB } as Contact];

  /** Render one frame and return the blocks the plate was placed with. */
  function placedBlocks(views: ContactViews, store: ContactStore, place: PlaceSpy, t: number): number | null {
    place.mockClear();
    store.pushFrame(t, row());
    views.render(store, t, t, 16, () => 'enemy', plates);
    const call = place.mock.calls.find((c) => c[0] === 'e1');
    expect(call).toBeDefined();
    return call![4]!.blocks;
  }

  function rig(): { views: ContactViews; store: ContactStore; place: PlaceSpy } {
    const nameplates = new NameplateLayer(stubLayer());
    const place = vi.spyOn(nameplates, 'place');
    return { views: new ContactViews(stubLayer(), nameplates), store: new ContactStore(), place };
  }

  it('afloat: the plate carries the wire blocks', () => {
    const { views, store, place } = rig();
    expect(placedBlocks(views, store, place, 0)).toBe(HB);
  });

  it('after sinkFlash the plate is placed with no bar; after markSpawn the bar returns', () => {
    const { views, store, place } = rig();
    placedBlocks(views, store, place, 0);
    views.sinkFlash('e1');
    expect(placedBlocks(views, store, place, 50)).toBeNull();
    views.markSpawn('e1');
    expect(placedBlocks(views, store, place, 100)).toBe(HB);
  });

  it('setSink and markSunk hide the bar too', () => {
    for (const sink of [(v: ContactViews) => v.setSink('e1', 0.5), (v: ContactViews) => v.markSunk('e1')]) {
      const { views, store, place } = rig();
      placedBlocks(views, store, place, 0);
      sink(views);
      expect(placedBlocks(views, store, place, 50)).toBeNull();
    }
  });
});

describe('ownPlateBlocks — the own plate bar', () => {
  const MAX = 1000;
  it('is the shared hullBlocks while afloat', () => {
    for (const hp of [1, MAX / 3, MAX / 2, MAX]) expect(ownPlateBlocks({ alive: true, hp }, MAX)).toBe(hullBlocks(hp, MAX));
  });

  it('is null for a down hull: no you, not alive (sinking / sunk / spectating), or hp <= 0', () => {
    expect(ownPlateBlocks(null, MAX)).toBeNull();
    expect(ownPlateBlocks(undefined, MAX)).toBeNull();
    expect(ownPlateBlocks({ alive: false, hp: MAX / 2 }, MAX)).toBeNull();
    expect(ownPlateBlocks({ alive: true, hp: 0 }, MAX)).toBeNull();
    expect(ownPlateBlocks({ alive: false, hp: 0 }, MAX)).toBeNull();
  });
});

describe('the running Shift tile', () => {
  it('wears amber and still breathes its alphas', () => {
    const full = abilitySkin('active', false, 'full', 1);
    const low = abilitySkin('active', false, 'full', 0.7);
    expect(full.border).toBe(C.amber);
    expect(low.border).toBe(C.amber);
    expect(low.borderAlpha).toBeLessThan(full.borderAlpha);
    expect(low.glowAlpha).toBeLessThan(full.glowAlpha);
  });
});

describe('secondariesFill — full at the fastest rate, empty at the slowest', () => {
  const { coldRatePerS: cold, hotRatePerS: hot } = CONFIG.secondaries;
  const rate = (h: number): number => 1000 / secondariesIntervalMs(h);

  it('equals the rate\'s place between hot and cold over a heat sweep', () => {
    for (let i = 0; i <= 20; i++) {
      const h = i / 20;
      expect(secondariesFill(h)).toBeCloseTo((rate(h) - hot) / (cold - hot), 9);
    }
  });

  it('is full cold and empty hot, clamped outside [0, 1]', () => {
    expect(secondariesFill(0)).toBe(1);
    expect(secondariesFill(1)).toBe(0);
    expect(secondariesFill(-1)).toBe(1);
    expect(secondariesFill(2)).toBe(0);
  });
});
