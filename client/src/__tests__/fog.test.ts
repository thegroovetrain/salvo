// THE FOG SIGHT HOLE (render/fog.ts) — the DAZZLE honesty rule (Story 2.8; the
// mark is set by a FLASH SHELLS burst since Story 8.17, epic-8 amendment 132).
// While the own hull is dazzled the SERVER has already cut its perceived sight
// to the SHARED `effectiveSight` — radarRange × CONFIG.flashShells.sightFraction
// (1/8 of intel range, 82.5 u at base) — so the baked hole must be exactly that
// number: an un-shrunk hole would draw clear water where the server reveals
// nothing — the fog circle would LIE.
//
// The rebake itself is a Pixi/canvas operation (untestable in jsdom); what is
// pinned here is the pure radius rule and the staleness edge that decides WHEN
// a rebake is owed — the two pieces the honesty depends on.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, effectiveSight } from '@salvo/shared';
import { Fog, fogHoleRadiusU } from '../render/fog.js';

const BASE = { sightRange: CONFIG.vision.sight, radarRange: CONFIG.vision.radar };

describe('fogHoleRadiusU — the dazzle-honest hole radius', () => {
  it('is the plain effective sight range while NOT dazzled', () => {
    expect(fogHoleRadiusU(BASE, false)).toBe(CONFIG.vision.sight);
    expect(fogHoleRadiusU({ sightRange: 400, radarRange: 660 }, false)).toBe(400);
  });

  it('is ONE EIGHTH OF THE INTEL RANGE while dazzled — 82.5 u at base (was 165)', () => {
    expect(fogHoleRadiusU(BASE, true)).toBe(82.5);
    expect(fogHoleRadiusU(BASE, true)).toBe(CONFIG.vision.radar * CONFIG.flashShells.sightFraction);
    expect(fogHoleRadiusU(BASE, true)).toBeLessThan(CONFIG.vision.sight);
  });

  it('follows the RADAR range, not the sight range, while dazzled', () => {
    // A wider bubble buys nothing while flashed; a longer radar does.
    expect(fogHoleRadiusU({ ...BASE, sightRange: BASE.sightRange * 1.5 }, true)).toBe(82.5);
    expect(fogHoleRadiusU({ ...BASE, radarRange: 800 }, true)).toBe(100);
  });

  it('IS the shared effectiveSight — the function the server\'s sightOf calls', () => {
    for (const r of [BASE, { sightRange: 400, radarRange: 800 }]) {
      for (const d of [false, true]) expect(fogHoleRadiusU(r, d)).toBe(effectiveSight(r, d));
    }
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

// IN SMOKE (Story 8.18, Eric ruling 2026-09-29, amendment 149): the server
// stamps the self-private `you.inSmoke` while the own hull's centre is in any
// live puff and perceives it at the smoke tier of the SAME `effectiveSight` —
// so the hole takes the same third argument and the same staleness edge.
describe('IN SMOKE — the hole shrinks through the shared effectiveSight', () => {
  it('is 1/8 of the intel range in smoke, the plain sight out of it', () => {
    expect(fogHoleRadiusU(BASE, false, false)).toBe(CONFIG.vision.sight);
    expect(fogHoleRadiusU(BASE, false, true)).toBe(CONFIG.vision.radar * CONFIG.smokeScreen.inSmokeSightFraction);
    expect(fogHoleRadiusU({ ...BASE, radarRange: 800 }, false, true)).toBe(800 * CONFIG.smokeScreen.inSmokeSightFraction);
    for (const d of [false, true]) {
      for (const m of [false, true]) expect(fogHoleRadiusU(BASE, d, m)).toBe(effectiveSight(BASE, d, m));
    }
  });

  it('Fog.setInSmoke reports a rebake only on a real flip, independent of dazzle', () => {
    const fog = new Fog(new Container());
    expect(fog.isInSmoke).toBe(false);
    expect(fog.setInSmoke(false)).toBe(false);
    expect(fog.setInSmoke(true)).toBe(true);
    expect(fog.isInSmoke).toBe(true);
    expect(fog.setInSmoke(true)).toBe(false);
    // A dazzle flip neither consumes nor resets the smoke state.
    expect(fog.setDazzled(true)).toBe(true);
    expect(fog.isInSmoke).toBe(true);
    expect(fog.setInSmoke(false)).toBe(true);
    expect(fog.isDazzled).toBe(true);
  });
});

// THE OMNISCIENT REVEAL (Story 5.3) IS BUILT ON setVisible, NOT A FADE. main.ts's
// enterSpectateVisuals calls `g.fog.setVisible(false)` — never touches alpha or
// rebakes toward transparent — and the reason is stated in that call's own doc
// comment (amendment 24's `Never` clause): the reveal's whole job is to take the
// fog OFF, and a half-transparent composite would leave a uniform grey wash over
// the ocean the results modal is read against. Only a hide takes the whole
// composite off screen in one step.
//
// THE ASYMMETRY ARGUMENT THAT USED TO STAND HERE IS RETIRED (cycle 123): the roots
// mounted worldRoot, plateRoot, fogSprite, chartRoot, hudRoot, so `plateRoot`
// (nameplates) sat BELOW the fog while `ship` sat above it — and a fade would have
// dimmed every callsign while leaving the hulls they label at full brightness.
// The nameplate container is now the `plate` CHART LAYER, seated between `ship`
// and `aim` on Eric's ruling that a name is *"never obscured by terrain"* while
// the reticle still reads over it — so plates and hulls are both above the fog
// and the asymmetry is gone. The conclusion did not move; its premise did.
//
// AND THE ROOT-MOUNT ORDER IS NO LONGER UNASSERTABLE. It used to be an inline
// `app.stage.addChild(...)` argument list inside `createStage`, which needs a live
// Pixi Application (WebGL/canvas) jsdom cannot provide — so it was pinned by
// inspection only, and `deferred-work.md` carried that gap as an open entry.
// `createStage` now BUILDS the roots by iterating the exported `STAGE_ROOT_ORDER`,
// which is pinned (with the plate lift itself) in `nameplatesAboveTerrain.test.ts`
// alongside a `EVERY_ROOT_PLACED` compile-time completeness check. What is pinned
// BELOW is still the one thing setVisible itself promises: the sprite goes fully
// off and fully back on, never partially.
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
