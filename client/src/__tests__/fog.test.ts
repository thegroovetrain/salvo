// THE FOG SIGHT HOLE (render/fog.ts) — the honesty rule: the baked hole is the
// SHARED `effectiveSight` — the very function the server's `sightOf` calls —
// so the fog circle can never draw clear water the server reveals nothing in.
// Story 9.4 retired the FLASH SHELLS dazzle (and with it the hole's only
// runtime modifier and the `setDazzled` staleness edge); a sight boon is the
// one input that moves the radius now.
//
// The rebake itself is a Pixi/canvas operation (untestable in jsdom); what is
// pinned here is the pure radius rule the honesty depends on.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, effectiveSight } from '@salvo/shared';
import { Fog, fogHoleRadiusU } from '../render/fog.js';

const BASE = { sightRange: CONFIG.vision.sight, radarRange: CONFIG.vision.radar };

describe('fogHoleRadiusU — the honest hole radius', () => {
  it('is the effective sight range — base and boon-widened alike', () => {
    expect(fogHoleRadiusU(BASE)).toBe(CONFIG.vision.sight);
    expect(fogHoleRadiusU({ sightRange: 400, radarRange: 660 })).toBe(400);
  });

  it('IS the shared effectiveSight — the function the server\'s sightOf calls', () => {
    for (const r of [BASE, { sightRange: 400, radarRange: 800 }]) expect(fogHoleRadiusU(r)).toBe(effectiveSight(r));
  });

  it('does not follow the radar range (sight is a different quantity from intel)', () => {
    expect(fogHoleRadiusU({ ...BASE, radarRange: 800 })).toBe(CONFIG.vision.sight);
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
