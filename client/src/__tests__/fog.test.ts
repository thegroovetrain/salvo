// THE FOG SIGHT HOLE (render/fog.ts) — the honesty rule: the baked hole is the
// SHARED `effectiveSight` — the very function the server's `sightOf` calls —
// so the fog circle can never draw clear water the server reveals nothing in.
// The FLASH SHELLS WHITEOUT (Eric 2026-10-29, epic-10 amendment 5): while the
// own hull holds a flash mark the server perceives it through the CLEAR
// CIRCLE — `effectiveSight(stats, dazzledUntil, now)`: 0 through ramp + hold,
// then growing linearly back to full sight — so the baked hole follows that
// curve, floored onto `sightSteps` steps of the sight range so the rebake
// cost stays bounded (never wider than the server's sight).
//
// The rebake itself is a Pixi/canvas operation (untestable in jsdom); what is
// pinned here is the pure radius rule and the staleness edge that decides WHEN
// a rebake is owed — the two pieces the honesty depends on.

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, FLASH_WINDOW_MS, effectiveSight } from '@salvo/shared';
import { Fog, fogFrameRects, fogHoleRadiusU, fogZoomStale, quantizeSightU } from '../render/fog.js';
import { CLIENT_CONFIG } from '../config.js';

const BASE = { sightRange: CONFIG.vision.sight, radarRange: CONFIG.vision.radar };
const { rampMs, holdMs, clearMs } = CONFIG.flashShells;
/** The flash clock `elapsedMs` into a whiteout that hit at t = 0. */
const at = (elapsedMs: number) => ({ until: FLASH_WINDOW_MS, now: elapsedMs });
const STEP = BASE.sightRange / CLIENT_CONFIG.flashWhiteout.sightSteps;

describe('fogHoleRadiusU — the flash-honest hole radius', () => {
  it('is the effective sight range with no flash mark — base and boon-widened alike', () => {
    expect(fogHoleRadiusU(BASE)).toBe(CONFIG.vision.sight);
    expect(fogHoleRadiusU({ sightRange: 400, radarRange: 660 }, { until: 0, now: 5000 })).toBe(400);
  });

  it('is 0 through the ramp and the hold — the whiteout leaves no hole', () => {
    for (const e of [0, rampMs, rampMs + holdMs - 1]) expect(fogHoleRadiusU(BASE, at(e))).toBe(0);
  });

  it('the hole grows back with the shared curve: half the sight at mid-clear, full at the end', () => {
    expect(fogHoleRadiusU(BASE, at(rampMs + holdMs + clearMs / 2))).toBeCloseTo(BASE.sightRange / 2, 6);
    expect(fogHoleRadiusU(BASE, at(FLASH_WINDOW_MS))).toBe(BASE.sightRange);
  });

  it('follows the SIGHT range, never the radar range, flashed or not', () => {
    for (const d of [at(0), at(rampMs + holdMs + clearMs / 2), at(FLASH_WINDOW_MS)]) {
      expect(fogHoleRadiusU({ ...BASE, radarRange: BASE.radarRange * 2 }, d)).toBe(fogHoleRadiusU(BASE, d));
    }
  });

  it("IS the shared effectiveSight — the function the server's sightOf calls — floored to one step", () => {
    for (let e = 0; e <= FLASH_WINDOW_MS; e += 137) {
      const exact = effectiveSight(BASE, FLASH_WINDOW_MS, e);
      const hole = fogHoleRadiusU(BASE, at(e));
      expect(hole).toBeLessThanOrEqual(exact + 1e-9); // never wider than the server's sight
      expect(exact - hole).toBeLessThan(STEP); // and never more than one step narrower
    }
    expect(fogHoleRadiusU(BASE)).toBe(effectiveSight(BASE));
  });
});

describe('quantizeSightU — the rebake quantum', () => {
  it('passes a full radius through and floors a partial one onto the step lattice', () => {
    expect(quantizeSightU(BASE.sightRange, BASE.sightRange)).toBe(BASE.sightRange);
    expect(quantizeSightU(STEP * 3.5, BASE.sightRange)).toBeCloseTo(STEP * 3, 9);
    expect(quantizeSightU(0, BASE.sightRange)).toBe(0);
  });
});

describe('Fog.setDazzle — the rebake staleness edge', () => {
  it('starts un-flashed and reports a rebake ONLY when the quantized radius moves', () => {
    const fog = new Fog(new Container());
    expect(fog.isDazzled).toBe(false);
    expect(fog.setDazzle(0, 1000)).toBe(false); // no mark, no rebake owed
    expect(fog.setDazzle(FLASH_WINDOW_MS, 0)).toBe(true); // flashed: the hole collapses
    expect(fog.isDazzled).toBe(true);
    expect(fog.setDazzle(FLASH_WINDOW_MS, rampMs)).toBe(false); // still 0 through the hold
    expect(fog.setDazzle(FLASH_WINDOW_MS, rampMs + holdMs + clearMs / 2)).toBe(true); // grew
    expect(fog.setDazzle(FLASH_WINDOW_MS, FLASH_WINDOW_MS)).toBe(true); // lapsed: full sight
    expect(fog.isDazzled).toBe(false);
  });

  it('a whole whiteout at 60 fps costs at most sightSteps + 1 rebakes, never one per frame', () => {
    const fog = new Fog(new Container());
    let rebakes = 0;
    let frames = 0;
    for (let t = 0; t <= FLASH_WINDOW_MS + 500; t += 1000 / 60) {
      frames += 1;
      if (fog.setDazzle(FLASH_WINDOW_MS, t)) rebakes += 1;
    }
    expect(rebakes).toBeLessThanOrEqual(CLIENT_CONFIG.flashWhiteout.sightSteps + 1);
    expect(rebakes).toBeLessThan(frames / 5);
  });

  it('a re-flash (a later mark) collapses the hole again — the timeline restarts', () => {
    const fog = new Fog(new Container());
    fog.setDazzle(FLASH_WINDOW_MS, rampMs + holdMs + clearMs / 2);
    const reflashAt = rampMs + holdMs + clearMs / 2;
    expect(fog.setDazzle(reflashAt + FLASH_WINDOW_MS, reflashAt)).toBe(true);
    expect(fogHoleRadiusU(BASE, { until: reflashAt + FLASH_WINDOW_MS, now: reflashAt })).toBe(0);
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
    // The Fog constructor adds its overlay group (the baked sprite plus the
    // Story 9.8 slide strips) before its hole mask (Graphics), so the group is
    // always the layer's first child — no private-field reach-in.
    const sprite = layer.children[0];
    expect(sprite.visible).toBe(true); // boots visible, same as every other Pixi node

    fog.setVisible(false);
    expect(sprite.visible).toBe(false); // OFF outright — not a partial alpha
    expect(sprite.alpha).toBe(1); // and setVisible never touches alpha either

    fog.setVisible(true);
    expect(sprite.visible).toBe(true); // restored, same object — no rebake needed
  });
});

// THE RING-FIT ZOOM LIMIT MOVES EVERY TICK while the storm closes (Story 9.8,
// ruling 127), so the full-canvas fog bake runs on HYSTERESIS: only past
// `redrawZoomFrac` of the zoom it was last baked at — the terrain and storm
// layers' 2 % sub-pixel precedent.
describe('fogZoomStale — the rebake hysteresis (Story 9.8)', () => {
  const FRAC = CLIENT_CONFIG.terrain.redrawZoomFrac;

  it('holds inside the band and trips past it, in both directions', () => {
    expect(fogZoomStale(0.5, 0.5 * (1 + FRAC / 2), FRAC)).toBe(false);
    expect(fogZoomStale(0.5, 0.5 * (1 - FRAC / 2), FRAC)).toBe(false);
    expect(fogZoomStale(0.5, 0.5 * (1 + FRAC * 2), FRAC)).toBe(true);
    expect(fogZoomStale(0.5, 0.5 * (1 - FRAC * 2), FRAC)).toBe(true);
  });

  it('a ring closing by a hair per tick never rebakes until the drift adds up', () => {
    let baked = 0.1;
    let bakes = 0;
    for (let z = 0.1; z < 0.2; z *= 1.001) {
      if (fogZoomStale(baked, z, FRAC)) {
        baked = z;
        bakes++;
      }
    }
    // ~693 ticks of 0.1 % each: a bake per ~2 %, never one per tick.
    expect(bakes).toBeGreaterThan(20);
    expect(bakes).toBeLessThan(40);
  });

  it('is always stale before the first bake, and never on a junk zoom', () => {
    expect(fogZoomStale(NaN, 0.5, FRAC)).toBe(true);
    expect(fogZoomStale(0, 0.5, FRAC)).toBe(true);
    expect(fogZoomStale(0.5, NaN, FRAC)).toBe(false);
  });
});

// THE CENTRE SLIDE (ruling 128) can carry the own hull — and the fog sprite
// baked around it — far off screen centre, past any affordable bake margin.
describe('fogFrameRects — the strips that keep the fog over the whole screen (Story 9.8)', () => {
  const area = (rs: { w: number; h: number }[]): number => rs.reduce((a, r) => a + r.w * r.h, 0);

  it('is EMPTY when the sprite covers the screen (every frame at the default framing)', () => {
    expect(fogFrameRects(-100, -80, 1800, 1060, 1600, 900)).toEqual([]);
  });

  it('covers exactly the uncovered remainder when the sprite slides off a corner', () => {
    // Sprite 1000×600 at (900, 500) on a 1600×900 screen: covers [900,1600]×[500,900].
    const rs = fogFrameRects(900, 500, 1000, 600, 1600, 900);
    expect(area(rs)).toBe(1600 * 900 - 700 * 400);
    for (const r of rs) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });

  it('covers the whole screen when the sprite is entirely off it', () => {
    expect(area(fogFrameRects(5000, 5000, 100, 100, 1600, 900))).toBe(1600 * 900);
    expect(area(fogFrameRects(-5000, -5000, 100, 100, 1600, 900))).toBe(1600 * 900);
  });
});
