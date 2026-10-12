// MULTI-SPECTRAL COUNTERMEASURE clouds on the client (Story 9.3; "smoke is
// paint", Eric 2026-10-12): the server hides nothing behind a cloud, and the
// client paints each held cloud as a spraypaint bitmap — render/cloudPaint.ts
// (the pure field) under render/countermeasure.ts (one Sprite per cloud on the
// `cloud` chart layer). Contracts only: no literal alpha, no pixel pins.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container } from 'pixi.js';
import { CONFIG, cloudOutlineRadius, mulberry32, type CloudView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { Countermeasure } from '../render/countermeasure.js';
import {
  CLOUD_CELLS,
  FADED_ALPHA,
  cellOffsetU,
  decayField,
  makeField,
  stepField,
  type CloudField,
} from '../render/cloudPaint.js';
import { CHART_LAYER_ORDER } from '../render/stage.js';

const LIFE = CONFIG.countermeasure.lifeMs;
const K = CLIENT_CONFIG.countermeasure;
const cloud = (id: string, t0 = 0, x = 0, y = 0): CloudView => ({ id, x, y, t0 });

/** A seeded RNG so a test's spray is reproducible. */
const seeded = (seed = 1): (() => number) => mulberry32(seed).next;

const total = (f: CloudField): number => f.alpha.reduce((s, v) => s + v, 0);

/** Run `ms` of frames at `frameMs` against a renderer, from `from`. */
function play(cm: Countermeasure, from: number, ms: number, frameMs = 16): number {
  let t = from;
  for (; t < from + ms; t += frameMs) cm.render(t);
  return t;
}

describe('one bitmap per held cloud, on the `cloud` layer', () => {
  it('a held cloud gets one Sprite with a square CLOUD_CELLS texture, one texel per cellU, at the cloud centre', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, new Container(), seeded());
    cm.sync([cloud('c1', 0, 300, -120)]);
    const s = cm.spriteOf('c1')!;
    expect(layer.children).toEqual([s]);
    expect(s.texture.source.width).toBe(CLOUD_CELLS);
    expect(s.texture.source.height).toBe(CLOUD_CELLS);
    expect(CLOUD_CELLS * K.cellU).toBeGreaterThanOrEqual(2 * CONFIG.countermeasure.r1);
    expect(s.scale.x).toBe(K.cellU);
    expect([s.x, s.y]).toEqual([300, -120]);
    expect(cm.fieldOf('c1')!.alpha).toHaveLength(CLOUD_CELLS * CLOUD_CELLS);
  });

  it('sync only ADDS: a held id is never respawned and an id absent from the next list is still held', () => {
    const cm = new Countermeasure(new Container(), new Container(), seeded());
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
    expect(main).toContain('new Countermeasure(stage.layers.cloud, radar.cloudPaintLayer)');
    expect(main).toContain('stage.layers.ownShip.addChild(ownView.gfx)');
  });
});

describe('the spray and the fade', () => {
  it('spraying raises the field; with no spray it decays monotonically toward 0', () => {
    const f = makeField();
    const rng = seeded(7);
    stepField(f, 0, rng);
    expect(total(f)).toBe(0);
    for (let t = 0; t < 1000; t += 16) stepField(f, 16, rng);
    const sprayed = total(f);
    expect(sprayed).toBeGreaterThan(0);
    let prev = sprayed;
    for (let i = 0; i < 20; i++) {
      decayField(f, K.fadeMs / 20);
      const now = total(f);
      expect(now).toBeLessThanOrEqual(prev);
      prev = now;
    }
    expect(prev).toBe(0); // a full fadeMs of decay takes any cell to 0
  });

  it('paints land only inside the current disc (plus one dot radius)', () => {
    const rng = seeded(3);
    for (const age of [500, 5000, LIFE]) {
      const f = makeField();
      const startAge = Math.max(0, age - 200);
      f.age = startAge;
      for (let t = startAge; t < age; t += 20) stepField(f, 20, rng);
      const reach = cloudOutlineRadius(age) + K.dotCells * K.cellU;
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
    for (let t = 0; t < 4000; t += 16) stepField(f, 16, rng);
    expect(f.peak).toBeLessThanOrEqual(K.maxAlpha);
    expect(Math.max(...f.alpha)).toBeLessThanOrEqual(Math.fround(K.maxAlpha)); // float32 storage
  });

  it('the same spray lands at a low frame rate as at a high one (the fractional carry)', () => {
    const count = (frameMs: number): number => {
      const f = makeField();
      let paints = 0;
      const rng = (): number => {
        paints++;
        return 0.5; // the disc centre: every rejection sample accepts first try
      };
      for (let t = 0; t < 1000; t += frameMs) stepField(f, frameMs, rng);
      return paints / 2;
    };
    expect(count(7)).toBe(count(50));
    expect(Math.abs(count(50) - K.paintsPerSec)).toBeLessThanOrEqual(1);
  });
});

describe('a cloud leaves only after its spray is over AND its paint has faded', () => {
  it('survives past lifeMs while paint remains, then despawns and frees its sprite', () => {
    const layer = new Container();
    const scope = new Container();
    const cm = new Countermeasure(layer, scope, seeded());
    cm.sync([cloud('old', 0)]);
    const s = cm.spriteOf('old')!;
    const copy = cm.radarSpriteOf('old')!;
    let t = play(cm, 0, LIFE + 32);
    expect(cm.size, 'still painted just after its life').toBe(1);
    expect(cm.fieldOf('old')!.peak).toBeGreaterThanOrEqual(FADED_ALPHA);
    t = play(cm, t, K.fadeMs + 100);
    expect(cm.size).toBe(0);
    expect(cm.spriteOf('old')).toBeNull();
    expect(s.destroyed).toBe(true);
    expect(copy.destroyed).toBe(true);
    expect(layer.children).toHaveLength(0);
    expect(scope.children).toHaveLength(0);
  });

  it('clear() empties every held cloud (the match-start edge)', () => {
    const layer = new Container();
    const cm = new Countermeasure(layer, new Container(), seeded());
    cm.sync([cloud('c1'), cloud('c2')]);
    cm.render(1000);
    cm.clear();
    expect(cm.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });
});

describe('pre-roll: a cloud first seen mid-life looks mid-life', () => {
  it('its first render yields a non-empty field already spread past the birth disc', () => {
    const cm = new Countermeasure(new Container(), new Container(), seeded(5));
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
    expect(farthest).toBeGreaterThan(CONFIG.countermeasure.r0 + K.dotCells * K.cellU);
  });

  it('a cloud first seen long after its paint would have faded despawns on its first render', () => {
    const cm = new Countermeasure(new Container(), new Container(), seeded());
    cm.sync([cloud('gone', 0)]);
    cm.render(LIFE + K.fadeMs + 1000);
    expect(cm.size).toBe(0);
  });

  it('a clock estimate behind t0 renders an empty newborn without throwing', () => {
    const cm = new Countermeasure(new Container(), new Container(), seeded());
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

describe('the phosphor copy: the cloud paints radar returns (Eric 2026-10-12)', () => {
  const LIFE_MS = 12000;
  const CX = 1000;
  /** A beam window swept from (x, y) — the cloud sits on bearing 0 from the origin. */
  const beam = (prev: number, cur: number, x = 0, y = 0) => ({ prev, cur, x, y, lifeMs: LIFE_MS });
  const held = () => {
    const chart = new Container();
    const scope = new Container();
    const cm = new Countermeasure(chart, scope, seeded());
    cm.sync([cloud('c', 0, CX, 0)]);
    return { cm, chart, scope };
  };

  it('every held cloud has a second Sprite on the SAME texture source, in the radar paint container', () => {
    const { cm, chart, scope } = held();
    const grey = cm.spriteOf('c')!;
    const copy = cm.radarSpriteOf('c')!;
    expect(copy).not.toBe(grey);
    expect(copy.texture.source).toBe(grey.texture.source);
    expect(copy.parent).toBe(scope);
    expect(grey.parent).toBe(chart);
    expect(copy.tint).toBe(CLIENT_CONFIG.colors.phosphor);
    expect([copy.x, copy.y]).toEqual([grey.x, grey.y]);
  });

  it('is dark before any beam crossing, and a window that misses the span leaves it dark', () => {
    const { cm } = held();
    cm.render(1000);
    expect(cm.radarSpriteOf('c')!.alpha).toBe(0);
    cm.render(1016, beam(Math.PI / 2, Math.PI / 2 + 0.1));
    expect(cm.radarSpriteOf('c')!.alpha).toBe(0);
  });

  it('lights to radarAlpha on a crossing of its bearing span, then decays monotonically to 0 over the life', () => {
    const { cm } = held();
    cm.render(1000, beam(-0.05, 0.05));
    const copy = cm.radarSpriteOf('c')!;
    expect(copy.alpha).toBeCloseTo(K.radarAlpha, 9);
    let prev = copy.alpha;
    for (let t = 1500; t <= 1000 + LIFE_MS; t += 500) {
      cm.render(t);
      expect(copy.alpha).toBeLessThan(prev);
      prev = copy.alpha;
    }
    expect(prev).toBe(0);
  });

  it('the span is centre ± asin(r/d): a window inside the edge lights it, one past the edge does not', () => {
    const half = Math.asin(cloudOutlineRadius(1000) / CX);
    const a = held();
    a.cm.render(1000, beam(half * 0.9, half * 0.95));
    expect(a.cm.radarSpriteOf('c')!.alpha).toBeGreaterThan(0);
    const b = held();
    b.cm.render(1000, beam(half * 1.1, half * 1.2));
    expect(b.cm.radarSpriteOf('c')!.alpha).toBe(0);
  });

  it('a window wrapping through bearing 0 crosses a cloud on bearing 0', () => {
    const { cm } = held();
    cm.render(1000, beam(2 * Math.PI - 0.05, 0.02));
    expect(cm.radarSpriteOf('c')!.alpha).toBeCloseTo(K.radarAlpha, 9);
  });

  it('lights on ANY window when the viewer is inside the disc', () => {
    const { cm } = held();
    cm.render(1000, beam(Math.PI, Math.PI + 0.001, CX + 5, 3));
    expect(cm.radarSpriteOf('c')!.alpha).toBeCloseTo(K.radarAlpha, 9);
  });

  it('clear() empties the radar container too', () => {
    const { cm, scope } = held();
    cm.clear();
    expect(scope.children).toHaveLength(0);
  });
});

describe('coverAt: the cloud paint under a world point', () => {
  it('is 0 with no clouds, > 0 at the centre of a sprayed cloud, 0 well outside its grid', () => {
    const cm = new Countermeasure(new Container(), new Container(), seeded(9));
    expect(cm.coverAt(0, 0)).toBe(0);
    cm.sync([cloud('c', 0, 500, 500)]);
    cm.render(3000);
    expect(cm.coverAt(500, 500)).toBeGreaterThan(0);
    expect(cm.coverAt(500, 500)).toBeLessThanOrEqual(Math.fround(K.maxAlpha));
    const far = CLOUD_CELLS * K.cellU;
    expect(cm.coverAt(500 + far, 500)).toBe(0);
    expect(cm.coverAt(500, 500 - far)).toBe(0);
  });
});
