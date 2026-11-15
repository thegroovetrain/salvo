// SMOKE SCREEN clouds on the bench (PLAN.md §8): each cloud is stationary,
// grows r0 → r1 over its real `lifeMs` (CONFIG.countermeasure, through the
// shared `cloudOutlineRadius`) and is drawn with the game's REAL spray-paint
// field (client/src/render/cloudPaint.ts: makeField / advanceField /
// fieldToRgba — pure, no Pixi), one LINEAR BufferImageSource per cloud on a
// Sprite whose texel is one 9 u cell, tinted `colors.countermeasureSmoke`, the
// way render/countermeasure.ts mounts it. Not ported: the game's own-ship halo
// mask (the see-through hole around your hull) — Eric's §8 ruling is that your
// own smoke blinds you, so the bench draws the cloud whole.
//
// Sight: `discs` is the list `smokeDepthAlong` reads — one {x, y, r} per cloud
// still inside its life (the occlusion ends at lifeMs; the paint then fades
// out over the game's fadeMs, as the game draws it).

import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { CONFIG, cloudOutlineRadius, mulberry32, type CloudSize } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../../client/src/config.js';
import { CLOUD_CELLS, advanceField, fieldSpent, fieldToRgba, makeField, type CloudField } from '../../../client/src/render/cloudPaint.js';
import type { SmokeDisc } from './smokeDepth.js';

interface Cloud {
  x: number;
  y: number;
  bornMs: number;
  size: CloudSize;
  field: CloudField;
  rgba: Uint8Array;
  source: BufferImageSource;
  sprites: Sprite[];
}

export class SmokeClouds {
  readonly clouds: Cloud[] = [];
  /** The live discs sight reads (rebuilt every `step`). */
  readonly discs: SmokeDisc[] = [];
  private readonly rng: () => number;

  /** `layers`: one container per panel world, drawn ON TOP of the ships. */
  constructor(private readonly layers: Container[], seed = 0x5eed) {
    const r = mulberry32(seed >>> 0);
    this.rng = () => r.next();
  }

  /** Drop a cloud at (x, y), born at `nowMs` on the ship clock. */
  pop(x: number, y: number, nowMs: number): void {
    const K = CONFIG.countermeasure;
    const size: CloudSize = { lifeMs: K.lifeMs, r0: K.r0, r1: K.r1 };
    const rgba = new Uint8Array(CLOUD_CELLS * CLOUD_CELLS * 4);
    const source = new BufferImageSource({
      resource: rgba, width: CLOUD_CELLS, height: CLOUD_CELLS, scaleMode: 'linear', alphaMode: 'premultiply-alpha-on-upload',
    });
    const texture = new Texture({ source });
    const sprites = this.layers.map((layer) => {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.scale.set(CLIENT_CONFIG.countermeasure.cellU);
      s.position.set(x, y);
      s.tint = CLIENT_CONFIG.colors.countermeasureSmoke;
      layer.addChild(s);
      return s;
    });
    this.clouds.push({ x, y, bornMs: nowMs, size, field: makeField(size), rgba, source, sprites });
  }

  /** Advance every cloud to `nowMs`: spray, upload, rebuild the discs, retire spent clouds. */
  step(nowMs: number): void {
    this.discs.length = 0;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      const age = nowMs - c.bornMs;
      advanceField(c.field, age, this.rng);
      if (fieldSpent(c.field)) {
        for (const s of c.sprites) s.destroy();
        c.source.destroy();
        this.clouds.splice(i, 1);
        continue;
      }
      fieldToRgba(c.field, c.rgba);
      c.source.update();
      if (age >= 0 && age < c.size.lifeMs) this.discs.push({ x: c.x, y: c.y, r: cloudOutlineRadius(age, c.size) });
    }
  }

  clear(): void {
    for (const c of this.clouds) {
      for (const s of c.sprites) s.destroy();
      c.source.destroy();
    }
    this.clouds.length = 0;
    this.discs.length = 0;
  }
}
