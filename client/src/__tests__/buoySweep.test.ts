// THE RADAR BUOY'S SECOND SWEEP (render/buoySweep.ts, Story 10.9 AC 5) — the
// pure view-model and its thin Pixi adapter. The contract: one wedge per OWN
// RADAR buoy that carries a wire `sweep`, centred on the buoy, scaled to the
// buoy's reach over the baked texture radius, rotated by the SAME law as the
// own beam (`sweepRotation`) at the owner's sweep period — and nothing for a
// non-radar buoy or anybody else's buoy.

import { describe, it, expect } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { BUOY_KINDS, CONFIG, type BuoyKind, type DecoyView } from '@salvo/shared';
import { BuoySweep, buoySweepModels, hasBuoySweep } from '../render/buoySweep.js';
import { sweepRotation } from '../render/phosphor.js';
import { SWEEP_TEXTURE_RADIUS } from '../render/textures.js';

const PERIOD = 60000 / CONFIG.vision.sweepRpm;

const buoy = (id: string, kind: BuoyKind, own: boolean, sweep?: number, x = 100, y = -40): DecoyView => ({
  id,
  x,
  y,
  own,
  by: 'p1',
  kind,
  ...(sweep === undefined ? {} : { sweep }),
});

describe('buoySweepModels — the second beam’s view-model', () => {
  it('centres the wedge on the buoy and scales it to the buoy’s reach over the texture radius', () => {
    const [m] = buoySweepModels([buoy('r1', 'radar', true, 0.5)], 1000, 1000, PERIOD);
    expect(m).toMatchObject({ id: 'r1', x: 100, y: -40 });
    expect(m.scale).toBe(CONFIG.buoy.radiusU / SWEEP_TEXTURE_RADIUS);
  });

  it('rotates by the OWN beam’s law — sweepRotation(sweep, sampleT, serverNow, period)', () => {
    for (const [sampleT, now] of [
      [1000, 1000],
      [1000, 1250],
      [1000, 1000 + PERIOD * 0.75],
      [5000, 4000], // a clock that reads before the sample never runs backward
    ]) {
      const [m] = buoySweepModels([buoy('r1', 'radar', true, 1.2)], sampleT, now, PERIOD);
      expect(m.rotation).toBe(sweepRotation(1.2, sampleT, now, PERIOD));
    }
  });

  it('turns at the period it is handed — the owner’s sweep (a faster ladder turns it faster)', () => {
    const slow = buoySweepModels([buoy('r1', 'radar', true, 0)], 0, 100, PERIOD)[0].rotation;
    const fast = buoySweepModels([buoy('r1', 'radar', true, 0)], 0, 100, PERIOD / 2)[0].rotation;
    expect(fast).toBeCloseTo(2 * slow, 9);
  });

  it('draws NOTHING for a non-radar buoy, an enemy buoy, or an own radar view without `sweep`', () => {
    const list = [
      ...BUOY_KINDS.filter((k) => k !== 'radar').map((k, i) => buoy(`k${i}`, k, true, 0)),
      buoy('enemy', 'radar', false, 0), // defensive: the wire never sends it, and it is never drawn
      buoy('nosweep', 'radar', true),
    ];
    expect(buoySweepModels(list, 0, 0, PERIOD)).toEqual([]);
    for (const d of list) expect(hasBuoySweep(d), d.id).toBe(false);
  });

  it('one wedge per own radar buoy — two buoys, two independent beams', () => {
    const ms = buoySweepModels(
      [buoy('a', 'radar', true, 0, 0, 0), buoy('b', 'radar', true, Math.PI, 500, 500)],
      0,
      0,
      PERIOD,
    );
    expect(ms.map((m) => m.id)).toEqual(['a', 'b']);
    expect(ms[0].rotation).not.toBe(ms[1].rotation);
  });
});

describe('BuoySweep — the Pixi adapter reconciles by id', () => {
  it('adds a sprite per model, places it, and removes it when its buoy leaves the list', () => {
    const layer = new Container();
    const s = new BuoySweep(layer, Texture.EMPTY);
    const models = buoySweepModels([buoy('a', 'radar', true, 0.3)], 0, 0, PERIOD);
    s.render(models);
    expect(s.size).toBe(1);
    expect(layer.children).toHaveLength(1);
    const sprite = layer.children[0];
    expect(sprite.position.x).toBe(100);
    expect(sprite.rotation).toBeCloseTo(models[0].rotation, 6);
    expect(sprite.scale.x).toBeCloseTo(models[0].scale, 9);
    s.render(models); // still there — reused, not re-spawned
    expect(layer.children).toHaveLength(1);
    s.render([]);
    expect(s.size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });

  it('clear() drops every wedge', () => {
    const layer = new Container();
    const s = new BuoySweep(layer, Texture.EMPTY);
    s.render(buoySweepModels([buoy('a', 'radar', true, 0), buoy('b', 'radar', true, 1)], 0, 0, PERIOD));
    s.clear();
    expect(layer.children).toHaveLength(0);
  });
});
