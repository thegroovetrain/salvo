// THE FOG SIGHT HOLE (render/fog.ts) — the DAZZLE BURST honesty rule (Story
// 2.8). While an enemy dazzle zone holds the own hull, the SERVER has already
// cut this ship's perceived sight by CONFIG.starShells.dazzleSightFactor, so the
// baked hole must shrink by exactly the same factor: an un-shrunk hole would
// draw clear water where the server reveals nothing — the fog circle would LIE.
//
// The rebake itself is a Pixi/canvas operation (untestable in jsdom); what is
// pinned here is the pure radius rule and the staleness edge that decides WHEN
// a rebake is owed — the two pieces the honesty depends on.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { Fog, fogHoleRadiusU } from '../render/fog.js';

describe('fogHoleRadiusU — the dazzle-honest hole radius', () => {
  it('is the plain effective sight range while NOT dazzled', () => {
    expect(fogHoleRadiusU(CONFIG.vision.sight, false)).toBe(CONFIG.vision.sight);
    expect(fogHoleRadiusU(400, false)).toBe(400);
  });

  it('is the sight range CUT by the ratified dazzle factor while dazzled', () => {
    expect(fogHoleRadiusU(CONFIG.vision.sight, true)).toBe(
      CONFIG.vision.sight * CONFIG.starShells.dazzleSightFactor,
    );
    expect(fogHoleRadiusU(CONFIG.vision.sight, true)).toBeLessThan(CONFIG.vision.sight);
  });

  it('composes with a boosted sight range (an intel stack is cut, not ignored)', () => {
    const boosted = CONFIG.vision.sight * 1.5;
    expect(fogHoleRadiusU(boosted, true)).toBe(boosted * CONFIG.starShells.dazzleSightFactor);
    // Being dazzled with more optics still leaves you better off than the base
    // hull dazzled — the factor scales, it does not clamp to a constant.
    expect(fogHoleRadiusU(boosted, true)).toBeGreaterThan(fogHoleRadiusU(CONFIG.vision.sight, true));
  });

  it('reads the SAME factor the server perceives a dazzled observer with', () => {
    // One source (CONFIG.starShells.dazzleSightFactor) — never a client copy.
    expect(CONFIG.starShells.dazzleSightFactor).toBeGreaterThan(0);
    expect(CONFIG.starShells.dazzleSightFactor).toBeLessThan(1);
  });
});

describe('Fog.setDazzled — the rebake staleness edge', () => {
  it('starts un-dazzled and reports a rebake ONLY on a real state flip', () => {
    const fog = new Fog(new Container());
    expect(fog.isDazzled).toBe(false);
    expect(fog.setDazzled(false)).toBe(false); // no change, no rebake owed
    expect(fog.setDazzled(true)).toBe(true); // entered the dazzle: hole is stale
    expect(fog.isDazzled).toBe(true);
    expect(fog.setDazzled(true)).toBe(false); // still dazzled, every later frame
    expect(fog.setDazzled(false)).toBe(true); // left it: stale again
    expect(fog.isDazzled).toBe(false);
  });

  it('costs at most two rebakes per dazzle event, however long it lasts', () => {
    const fog = new Fog(new Container());
    let rebakes = 0;
    // 120 frames inside one dazzle window, then 120 outside it.
    for (let i = 0; i < 120; i += 1) if (fog.setDazzled(true)) rebakes += 1;
    for (let i = 0; i < 120; i += 1) if (fog.setDazzled(false)) rebakes += 1;
    expect(rebakes).toBe(2);
  });
});
