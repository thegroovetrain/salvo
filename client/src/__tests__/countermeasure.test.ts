// MULTI-SPECTRAL COUNTERMEASURE clouds on the client (Story 9.3, Eric rulings
// 2026-10-11, epic-9 amendments 40–47). Two halves:
//   • render/countermeasure.ts — the id-keyed cloud reconcile off
//     FrameMsg.clouds, drawing one square per LIVING pixel of the SHARED pixel
//     function (never a client re-derivation), each fading over its own last
//     `fadeMs`, on the fog-immune `smoke` chart layer.
//   • render/wake.ts — the in-bubble wake synthesis owes the server's cloud
//     sight term, so a segment behind living pixels is not revealed, and one
//     well clear of the cloud is.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, type Graphics } from 'pixi.js';
import {
  CONFIG,
  cloudBase,
  eachWakeSegment,
  forEachLivingPixel,
  livingPixelCount,
  type CloudView,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { hasCloudBase } from '../render/cloudBases.js';
import { Countermeasure, pixelFade } from '../render/countermeasure.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';
import {
  CLOUD_AGE_BUCKET_MS,
  WakeSources,
  buildTruesightWakeStamp,
  cloudSetKey,
  type WakeHull,
} from '../render/wake.js';

const K = CONFIG.countermeasure;
const cloud = (id: string, t0 = 0, x = 0, y = 0): CloudView => ({ id, x, y, t0 });

/** Every filled square a Graphics holds: [x, y, w, h] and its fill alpha. */
function squares(g: Graphics): { rect: number[]; alpha: number }[] {
  const raw = g.context.instructions as {
    action: string;
    data: { style?: { alpha?: number }; path?: { instructions: { action: string; data: unknown[] }[] } };
  }[];
  const out: { rect: number[]; alpha: number }[] = [];
  for (const ins of raw) {
    if (ins.action !== 'fill') continue;
    for (const q of ins.data.path?.instructions ?? []) {
      if (q.action === 'rect') out.push({ rect: (q.data as number[]).slice(0, 4), alpha: ins.data.style?.alpha ?? -1 });
    }
  }
  return out;
}

describe('Countermeasure.sync — the id-keyed cloud reconcile', () => {
  it('adds one Graphics per cloud, keeps held ids, destroys ids that left, and drops their memoized base', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer);
    cm.sync([cloud('cl1'), cloud('cl2', 0, 100, 0)]);
    expect(cm.size).toBe(2);
    expect(layer.children).toHaveLength(2);
    expect(hasCloudBase('cl1')).toBe(true);
    const first = layer.children[0];
    const base1 = cm.baseOf('cl1');
    cm.sync([cloud('cl1'), cloud('cl2', 0, 100, 0), cloud('cl3', 500, 200, 0)]);
    expect(cm.size).toBe(3);
    expect(layer.children[0]).toBe(first); // a held cloud is never respawned
    expect(cm.baseOf('cl1')).toBe(base1); // ...nor its base recomputed
    cm.sync([cloud('cl3', 500, 200, 0)]);
    expect(cm.size).toBe(1);
    expect(first.destroyed).toBe(true);
    expect(hasCloudBase('cl1')).toBe(false);
    expect(hasCloudBase('cl2')).toBe(false);
    cm.sync([]); // the frame omitted the key
    expect(cm.size).toBe(0);
    expect(layer.children).toHaveLength(0);
    expect(hasCloudBase('cl3')).toBe(false);
  });

  it('memoizes the shared cloudBase(id) — the very constants the server derives', () => {
    const cm = new Countermeasure(new Container());
    cm.sync([cloud('cl7')]);
    const base = cm.baseOf('cl7')!;
    const fresh = cloudBase('cl7');
    expect([...base.ox]).toEqual([...fresh.ox]);
    expect([...base.dieAt]).toEqual([...fresh.dieAt]);
  });
});

describe('Countermeasure.render — one square per living pixel of the shared function', () => {
  it('draws exactly livingPixelCount squares at age 0 and none at or past lifeMs', () => {
    const cm = new Countermeasure(new Container());
    cm.sync([cloud('cl1', 1000)]);
    const base = cm.baseOf('cl1')!;
    cm.render(1000);
    expect(cm.squaresOf('cl1')).toBe(livingPixelCount(base, 0));
    expect(cm.squaresOf('cl1')).toBe(K.pixels);
    expect(squares(cm.graphicsOf('cl1')!)).toHaveLength(K.pixels);
    cm.render(1000 + K.lifeMs);
    expect(cm.squaresOf('cl1')).toBe(0);
    expect(squares(cm.graphicsOf('cl1')!)).toHaveLength(0);
  });

  it('a clock estimate before t0 renders the newborn cloud (age clamps to 0)', () => {
    const cm = new Countermeasure(new Container());
    cm.sync([cloud('cl1', 1000)]);
    cm.render(900);
    expect(cm.squaresOf('cl1')).toBe(K.pixels);
  });

  it('centers each square on the shared forEachLivingPixel position, at the drawSizeU side', () => {
    const cm = new Countermeasure(new Container());
    const c = cloud('cl2', 0, 300, -120);
    cm.sync([c]);
    const age = 7000;
    cm.render(age);
    const g = cm.graphicsOf('cl2')!;
    expect([g.x, g.y]).toEqual([300, -120]);
    const side = CLIENT_CONFIG.countermeasure.drawSizeU;
    const want: number[][] = [];
    forEachLivingPixel(cm.baseOf('cl2')!, c.x, c.y, age, (x, y) => want.push([x, y]));
    const got = squares(g).map(({ rect: [x, y, w, h] }) => {
      expect([w, h]).toEqual([side, side]);
      return [g.x + x + w / 2, g.y + y + h / 2];
    });
    expect(got).toHaveLength(want.length);
    got.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(want[i][0], 9);
      expect(y).toBeCloseTo(want[i][1], 9);
    });
  });

  it('a pixel inside its own fade window draws at reduced alpha; one outside it at full', () => {
    const cm = new Countermeasure(new Container());
    cm.sync([cloud('cl3')]);
    const base = cm.baseOf('cl3')!;
    const full = CLIENT_CONFIG.countermeasure.fillAlpha;
    const fadeMs = CLIENT_CONFIG.countermeasure.fadeMs;
    // Pick the pixel that dies first and sit halfway into its fade.
    let first = 0;
    for (let i = 1; i < base.dieAt.length; i++) if (base.dieAt[i] < base.dieAt[first]) first = i;
    const age = base.dieAt[first] - fadeMs / 2;
    cm.render(age);
    const alphas = squares(cm.graphicsOf('cl3')!).map((s) => s.alpha);
    expect(Math.min(...alphas)).toBeCloseTo(full * 0.5, 9);
    expect(Math.max(...alphas)).toBeCloseTo(full, 9);
    expect(pixelFade(base.dieAt[first], age)).toBeCloseTo(0.5, 9);
    expect(pixelFade(10_000, 0)).toBe(1);
  });
});

describe('the renderer sits on the fog-immune `smoke` chart layer', () => {
  // main.ts boots the whole app at module load and is never imported by a test
  // (foghorn.test.ts's note) — the construction site is asserted by source scan.
  it('main.ts constructs it on stage.layers.smoke, and that layer sits below blip', () => {
    const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
    expect(main).toContain('new Countermeasure(stage.layers.smoke)');
    expect(CHART_LAYER_ORDER.indexOf('smoke')).toBeLessThan(CHART_LAYER_ORDER.indexOf('blip'));
  });

  it('each cloud is a child of the layer it was constructed on', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer);
    cm.sync([cloud('cl9')]);
    expect(cm.graphicsOf('cl9')!.parent).toBe(layer);
  });
});

// --- the wake sight mirror ------------------------------------------------------

describe('the in-bubble wake stamp owes the cloud sight term', () => {
  const STEP_U = CONFIG.vision.wakeSampleU;
  const MODEL = CLIENT_CONFIG.blip.heatmap.model;
  const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
  const own = { x: 0, y: 0 };
  const NOW = 100;

  function oneSegment(): { sources: WakeSources; mx: number; my: number } {
    const sources = new WakeSources();
    const h: WakeHull = { id: 'a', x: 120, y: 30, heading: 0, speed: 30, cls: 'battleship', color: 0xffffff, maxSpeedU: 60 };
    sources.observe(h, 0);
    h.x = 120 + STEP_U + 1;
    sources.observe(h, NOW);
    let mx = 0;
    let my = 0;
    eachWakeSegment(sources.get('a')!.ribbon, NOW, (s) => {
      mx = s.mx;
      my = s.my;
    });
    return { sources, mx, my };
  }

  const stamp = (sources: WakeSources, clouds: CloudView[]) =>
    buildTruesightWakeStamp(sources, own, CONFIG.vision.sight, NOW, CELL, MODEL, [], 0, clouds);

  it('a segment whose sight line ends inside a fresh cloud pixel is not revealed', () => {
    const { sources, mx, my } = oneSegment();
    expect(stamp(sources, []).size).toBeGreaterThan(0);
    // Center the cloud so its pixel 0 (alive at birth) sits exactly on the
    // segment midpoint: the observer→midpoint line ends in its footprint.
    const base = cloudBase('clW');
    const c = cloud('clW', NOW, mx - base.ox[0], my - base.oy[0]);
    expect(stamp(sources, [c]).size).toBe(0);
  });

  it('a segment well outside the cloud outline is revealed as if no cloud existed', () => {
    const { sources } = oneSegment();
    const far = cloud('clF', NOW, -3000, -3000);
    expect([...stamp(sources, [far]).keys()]).toEqual([...stamp(sources, []).keys()]);
  });

  it('the stamp cache key moves with membership and the age bucket, and is empty for no clouds', () => {
    const cs = [cloud('cl1'), cloud('cl2')];
    expect(cloudSetKey([], 12_345)).toBe('');
    expect(cloudSetKey(cs, 0)).toBe(cloudSetKey(cs, CLOUD_AGE_BUCKET_MS - 1));
    expect(cloudSetKey(cs, 0)).not.toBe(cloudSetKey(cs, CLOUD_AGE_BUCKET_MS));
    expect(cloudSetKey(cs, 0)).not.toBe(cloudSetKey([cloud('cl1'), cloud('cl3')], 0));
    expect(cloudSetKey([cloud('ab'), cloud('c')], 0)).not.toBe(cloudSetKey([cloud('a'), cloud('bc')], 0));
  });
});
