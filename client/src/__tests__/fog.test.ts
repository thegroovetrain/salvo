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

// THE OMNISCIENT REVEAL (Story 5.3) IS BUILT ON setVisible, NOT A FADE. main.ts's
// enterSpectateVisuals calls `g.fog.setVisible(false)` — never touches alpha or
// rebakes toward transparent — and the reason is structural, ratified in that
// call's own doc comment (amendment 24's `Never` clause, epic-5 amendment 22 "a
// label is not a mark"): render/stage.ts's `createStage` mounts the roots
// worldRoot, plateRoot, fogSprite, chartRoot, hudRoot IN THAT ORDER, so
// `plateRoot` (truesight nameplates) sits BELOW the fog composite while `ship`
// (hulls) sits in `chartRoot`, ABOVE it. A fog *fade* would therefore dim every
// nameplate on the water while leaving the hulls they label at full brightness —
// only a hide takes the whole composite off screen in one step, for both layers
// at once.
//
// That root-mount order lives entirely inside `createStage` (an inline
// `app.stage.addChild(...)` call, not one of the exported *_LAYER_ORDER arrays
// stage.ts declares for its child layers), and `createStage` requires a live
// Pixi Application (WebGL/canvas) that jsdom cannot provide — stage.ts's own
// header calls it "a thin Pixi adapter (not unit tested)". So the root ordering
// itself is asserted only by inspection (see the comment above and
// render/stage.ts's header) rather than by a test here; what IS pinned below is
// the one thing setVisible actually promises: the sprite goes fully off and
// fully back on, never partially.
describe('Fog.setVisible — the reveal is a HIDE, never a fade', () => {
  it('setVisible(false) hides the fog sprite outright; setVisible(true) restores it', () => {
    const layer = new Container();
    const fog = new Fog(layer);
    // The Fog constructor adds its sprite before its hole mask (Graphics), so
    // the sprite is always the layer's first child — no private-field reach-in.
    const sprite = layer.children[0];
    expect(sprite.visible).toBe(true); // boots visible, same as every other Pixi node

    fog.setVisible(false);
    expect(sprite.visible).toBe(false); // OFF outright — not a partial alpha
    expect(sprite.alpha).toBe(1); // and setVisible never touches alpha either

    fog.setVisible(true);
    expect(sprite.visible).toBe(true); // restored, same object — no rebake needed
  });
});
