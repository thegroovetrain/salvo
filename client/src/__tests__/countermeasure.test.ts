// MULTI-SPECTRAL COUNTERMEASURE clouds on the client (Story 9.3; "smoke is
// paint", Eric 2026-10-12): the server hides nothing behind a cloud, and the
// client paints each held cloud as a smoke-brush bitmap — render/cloudPaint.ts
// (the pure field: soft overlapping puffs of many sizes and greys) under
// render/countermeasure.ts (one Sprite per cloud on the `cloud` chart layer;
// the radar reads its haze as a return source — radarCloudReturns.test.ts).
// Contracts only: no literal alpha, no pixel pins.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container } from 'pixi.js';
import { CONFIG, cloudOutlineRadius, mulberry32, wrapPositive, type CloudView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Countermeasure } from '../render/countermeasure.js';
import {
  CLOUD_CELLS,
  FADED_ALPHA,
  RNG_PER_PUFF,
  advanceField,
  cellOffsetU,
  decayField,
  fieldToRgba,
  makeField,
  samplePuff,
  stampPuff,
  stepField,
  type CloudField,
} from '../render/cloudPaint.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';

const LIFE = CONFIG.countermeasure.lifeMs;
const K = CLIENT_CONFIG.countermeasure;
const MAX = Math.fround(K.maxAlpha); // float32 storage
const cloud = (id: string, t0 = 0, x = 0, y = 0): CloudView => ({ id, x, y, t0 });

/** A seeded RNG so a test's brush is reproducible. */
const seeded = (seed = 1): (() => number) => mulberry32(seed).next;

const total = (f: CloudField): number => f.alpha.reduce((s, v) => s + v, 0);

/** Run `ms` of frames at `frameMs` against a renderer, from `from`. */
function play(cm: Countermeasure, from: number, ms: number, frameMs = 16): number {
  let t = from;
  for (; t < from + ms; t += frameMs) cm.render(t);
  return t;
}

/** Mean alpha of the cells whose centre lies in the annulus [r0, r1) u. */
function annulusMean(f: CloudField, r0: number, r1: number): number {
  let sum = 0;
  let n = 0;
  for (let j = 0; j < CLOUD_CELLS; j++) {
    for (let i = 0; i < CLOUD_CELLS; i++) {
      const d = Math.hypot(cellOffsetU(i), cellOffsetU(j));
      if (d < r0 || d >= r1) continue;
      sum += f.alpha[j * CLOUD_CELLS + i];
      n++;
    }
  }
  return sum / n;
}

describe('one bitmap per held cloud, on the `cloud` layer', () => {
  it('a held cloud gets one LINEAR-scaled Sprite with a square CLOUD_CELLS texture, one texel per cellU, at the cloud centre', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, seeded());
    cm.sync([cloud('c1', 0, 300, -120)]);
    const s = cm.spriteOf('c1')!;
    expect(layer.children).toEqual([s]);
    expect(s.texture.source.width).toBe(CLOUD_CELLS);
    expect(s.texture.source.height).toBe(CLOUD_CELLS);
    expect(s.texture.source.scaleMode).toBe('linear');
    expect(CLOUD_CELLS * K.cellU).toBeGreaterThanOrEqual(2 * (CONFIG.countermeasure.r1 + K.puffMaxU));
    expect(s.scale.x).toBe(K.cellU);
    expect(s.tint).toBe(CLIENT_CONFIG.colors.countermeasureSmoke);
    expect([s.x, s.y]).toEqual([300, -120]);
    expect(cm.fieldOf('c1')!.alpha).toHaveLength(CLOUD_CELLS * CLOUD_CELLS);
  });

  it('sync only ADDS: a held id is never respawned and an id absent from the next list is still held', () => {
    const cm = new Countermeasure(new Container(), seeded());
    cm.sync([cloud('a'), cloud('b')]);
    const first = cm.spriteOf('a');
    cm.sync([cloud('a'), cloud('b'), cloud('c')]);
    expect(cm.spriteOf('a')).toBe(first);
    cm.sync([]);
    expect(cm.size).toBe(3);
  });

  it('main.ts constructs it on stage.layers.cloud and puts the own hull on ownShip', () => {
    // main.ts boots the app at module load, so the construction site is a source scan.
    const main = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
    expect(main).toContain('new Countermeasure(stage.layers.cloud)');
    expect(main, 'the radar reads the clouds as a return source').toContain('radar.setCloudSource(countermeasure)');
    expect(main).toContain('stage.layers.ownShip.addChild(ownView.gfx)');
  });
});

describe('the smoke brush: one soft puff', () => {
  // A puff centred on a cell centre (cell IC, IC), radius 6.5 cells.
  const IC = 64;
  const R = 6.5 * K.cellU;
  const S = (K.puffMinAlpha + K.puffMaxAlpha) / 2;
  const puffed = (): CloudField => {
    const f = makeField();
    stampPuff(f, cellOffsetU(IC), cellOffsetU(IC), R, S, K.shadeMin);
    return f;
  };
  const along = (f: CloudField, k: number): number => f.alpha[IC * CLOUD_CELLS + IC + k];

  it('falls off smoothly: centre > mid > edge > 0 inside R, and 0 at R and beyond', () => {
    const f = puffed();
    expect(along(f, 0)).toBeGreaterThan(along(f, 3));
    expect(along(f, 3)).toBeGreaterThan(along(f, 6));
    expect(along(f, 6)).toBeGreaterThan(0);
    expect(along(f, 7)).toBe(0);
    expect(along(f, -7)).toBe(0);
  });

  it('has no hard step: the profile only decreases outward and its outermost lit cell is a faint fraction of the centre', () => {
    const f = puffed();
    for (let k = 1; k <= 7; k++) expect(along(f, k)).toBeLessThanOrEqual(along(f, k - 1));
    expect(along(f, 6)).toBeLessThan(0.1 * along(f, 0));
  });

  it('composites "over": repeated puffs raise a cell by ever smaller steps, saturating toward maxAlpha and never past it', () => {
    const f = makeField();
    let prev = 0;
    let prevStep = Infinity;
    for (let n = 0; n < 200; n++) {
      stampPuff(f, cellOffsetU(IC), cellOffsetU(IC), R, K.puffMaxAlpha, K.shadeMax);
      const a = along(f, 0);
      expect(a).toBeLessThanOrEqual(MAX);
      const step = a - prev;
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThanOrEqual(prevStep + 1e-7);
      prev = a;
      prevStep = step;
    }
    expect(prev).toBeCloseTo(MAX, 5);
  });

  it('a puff samples a landing point inside the given disc, a size, a strength and a grey inside their knobs', () => {
    const rng = seeded(21);
    for (let n = 0; n < 500; n++) {
      const p = samplePuff(300, rng);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(300);
      expect(p.r).toBeGreaterThanOrEqual(K.puffMinU);
      expect(p.r).toBeLessThanOrEqual(K.puffMaxU);
      expect(p.s).toBeGreaterThanOrEqual(K.puffMinAlpha);
      expect(p.s).toBeLessThanOrEqual(K.puffMaxAlpha);
      expect(p.shade).toBeGreaterThanOrEqual(K.shadeMin);
      expect(p.shade).toBeLessThanOrEqual(K.shadeMax);
    }
  });
});

describe('the brush over a cloud life, and the fade', () => {
  it('every painted cell carries a grey within [shadeMin, shadeMax], and fieldToRgba writes it as rgb with the alpha in a', () => {
    const f = makeField();
    const rng = seeded(13);
    for (let t = 0; t < 4000; t += 16) stepField(f, 16, rng);
    const rgba = new Uint8Array(f.alpha.length * 4);
    fieldToRgba(f, rgba);
    let painted = 0;
    for (let k = 0; k < f.alpha.length; k++) {
      if (f.alpha[k] === 0) continue;
      painted++;
      expect(f.shade[k]).toBeGreaterThanOrEqual(Math.fround(K.shadeMin) - 1e-6);
      expect(f.shade[k]).toBeLessThanOrEqual(Math.fround(K.shadeMax) + 1e-6);
      expect(rgba[k * 4]).toBe(Math.round(f.shade[k] * 255));
      expect(rgba[k * 4 + 1]).toBe(rgba[k * 4]);
      expect(rgba[k * 4 + 3]).toBe(Math.round(f.alpha[k] * 255));
    }
    expect(painted).toBeGreaterThan(0);
  });

  it('puffs land only inside the current outline (plus one largest puff)', () => {
    const rng = seeded(3);
    for (const age of [500, 5000, LIFE]) {
      const f = makeField();
      const startAge = Math.max(0, age - 400);
      f.age = startAge;
      for (let t = startAge; t < age; t += 20) stepField(f, 20, rng);
      const reach = cloudOutlineRadius(age) + K.puffMaxU;
      let painted = 0;
      for (let j = 0; j < CLOUD_CELLS; j++) {
        for (let i = 0; i < CLOUD_CELLS; i++) {
          if (f.alpha[j * CLOUD_CELLS + i] === 0) continue;
          painted++;
          expect(Math.hypot(cellOffsetU(i), cellOffsetU(j))).toBeLessThanOrEqual(reach);
        }
      }
      expect(painted).toBeGreaterThan(0);
    }
  });

  it('no cell ever exceeds maxAlpha', () => {
    const f = makeField();
    const rng = seeded(11);
    for (let t = 0; t < 6000; t += 16) stepField(f, 16, rng);
    expect(f.peak).toBeLessThanOrEqual(K.maxAlpha);
    expect(Math.max(...f.alpha)).toBeLessThanOrEqual(MAX);
  });

  it('decay is LINEAR: every cell drops by maxAlpha·dt/fadeMs (floored at 0) and a full fadeMs takes any cell to 0', () => {
    const f = makeField();
    const rng = seeded(7);
    for (let t = 0; t < 2000; t += 16) stepField(f, 16, rng);
    const before = Float32Array.from(f.alpha);
    decayField(f, K.fadeMs / 4);
    const drop = K.maxAlpha / 4;
    for (let k = 0; k < before.length; k++) expect(f.alpha[k]).toBeCloseTo(Math.max(0, before[k] - drop), 5);
    decayField(f, (3 * K.fadeMs) / 4);
    expect(total(f)).toBe(0);
  });

  it('the same number of puffs lands at a low frame rate as at a high one (the fractional carry)', () => {
    const count = (frameMs: number): number => {
      const f = makeField();
      let draws = 0;
      const rng = (): number => {
        draws++;
        return 0.5;
      };
      for (let t = 0; t < 1000; t += frameMs) stepField(f, frameMs, rng);
      return draws / RNG_PER_PUFF;
    };
    expect(count(7)).toBe(count(50));
    expect(Math.abs(count(50) - K.puffsPerSec)).toBeLessThanOrEqual(1);
  });

  it('a pre-rolled mid-life cloud has a dense body and a wispy rim (centre thicker than 0.9 R)', () => {
    const f = makeField();
    advanceField(f, 9000, seeded(5));
    const R = cloudOutlineRadius(9000);
    expect(annulusMean(f, 0, 0.2 * R)).toBeGreaterThan(annulusMean(f, 0.85 * R, 0.95 * R));
  });
});

describe('a cloud leaves only after its spray is over AND its paint has faded', () => {
  it('survives past lifeMs while paint remains, then despawns and frees its sprite', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, seeded());
    cm.sync([cloud('old', 0)]);
    const s = cm.spriteOf('old')!;
    let t = play(cm, 0, LIFE + 32);
    expect(cm.size, 'still painted just after its life').toBe(1);
    expect(cm.fieldOf('old')!.peak).toBeGreaterThanOrEqual(FADED_ALPHA);
    t = play(cm, t, K.fadeMs + 100);
    expect(cm.size).toBe(0);
    expect(cm.spriteOf('old')).toBeNull();
    expect(s.destroyed).toBe(true);
    expect(layer.children).toHaveLength(0);
  });

  it('clear() empties every held cloud (the match-start edge)', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, seeded());
    cm.sync([cloud('c1'), cloud('c2')]);
    cm.render(1000);
    cm.clear();
    expect(cm.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });
});

describe('pre-roll: a cloud first seen mid-life looks mid-life', () => {
  it('its first render yields a non-empty field already spread past the birth disc', () => {
    const cm = new Countermeasure(new Container(), seeded(5));
    cm.sync([cloud('late', 0)]);
    cm.render(9000);
    const f = cm.fieldOf('late')!;
    expect(total(f)).toBeGreaterThan(0);
    let farthest = 0;
    for (let j = 0; j < CLOUD_CELLS; j++) {
      for (let i = 0; i < CLOUD_CELLS; i++) {
        if (f.alpha[j * CLOUD_CELLS + i] > 0) farthest = Math.max(farthest, Math.hypot(cellOffsetU(i), cellOffsetU(j)));
      }
    }
    expect(farthest).toBeGreaterThan(CONFIG.countermeasure.r0 + K.puffMaxU);
  });

  it('a cloud first seen long after its paint would have faded despawns on its first render', () => {
    const cm = new Countermeasure(new Container(), seeded());
    cm.sync([cloud('gone', 0)]);
    cm.render(LIFE + K.fadeMs + 1000);
    expect(cm.size).toBe(0);
  });

  it('a clock estimate behind t0 renders an empty newborn without throwing', () => {
    const cm = new Countermeasure(new Container(), seeded());
    cm.sync([cloud('young', 1000)]);
    cm.render(900);
    expect(total(cm.fieldOf('young')!)).toBe(0);
    expect(cm.size).toBe(1);
  });
});

describe('the declared seat (Eric 2026-10-12: above everything except radar paints; own hull on top)', () => {
  const at = (n: string): number => CHART_LAYER_ORDER.indexOf(n as never);
  it('cloud above contact hulls and names, below radar paints, which sit below the own hull', () => {
    expect(at('cloud')).toBeGreaterThan(at('ship'));
    expect(at('cloud')).toBeGreaterThan(at('plate'));
    expect(at('blip')).toBeGreaterThan(at('cloud'));
    expect(at('ownShip')).toBeGreaterThan(at('blip'));
    expect(at('aim')).toBeGreaterThan(at('ownShip'));
  });
});

describe('coverAt: the cloud haze under a world point', () => {
  it('is 0 with no clouds, > 0 at the centre of a sprayed cloud, 0 well outside its grid', () => {
    const cm = new Countermeasure(new Container(), seeded(9));
    expect(cm.coverAt(0, 0)).toBe(0);
    cm.sync([cloud('c', 0, 500, 500)]);
    cm.render(3000);
    expect(cm.coverAt(500, 500)).toBeGreaterThan(0);
    expect(cm.coverAt(500, 500)).toBeLessThanOrEqual(MAX);
    const far = CLOUD_CELLS * K.cellU;
    expect(cm.coverAt(500 + far, 500)).toBe(0);
    expect(cm.coverAt(500, 500 - far)).toBe(0);
  });
});
