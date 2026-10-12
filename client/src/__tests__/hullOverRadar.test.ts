// HULLS READ OVER RADAR PAINT (this cycle). Eric: *"Lets make hulls in general
// more visible over radar blips when they are visible."* Two halves, both
// required, and this file pins all three of the pure surfaces they added:
//
//   A. THE SCOPE IS QUIET ACROSS THE WHOLE SIGHT BUBBLE. Amendment 181's display
//      mask was anchored to 1/8 → 5/8 of INTEL range, so it stood at 80%
//      opacity at the edge of the bubble — over exactly the water Eric described
//      when he asked for it (*"less prominent in the near sight range where i am
//      going to aim based on LOS rather than radar ghosts"*). It now floors
//      across the bubble and climbs only outside it, and because the bubble is
//      not the base constant (a sight boon moves it) the ramp is
//      OBSERVER-SCALED off `Radar.sightHoleU` — `fogHoleRadiusU`, the same number
//      the fog hole is baked at and the server gates contacts with.
//
//   B. THE HULL LAYER MOVED ABOVE THE BLIP LAYER. `ship` was the top of worldRoot
//      (under the fog, therefore under every chart layer), so the radar echo the
//      client synthesizes for a hull you can already see was drawn ON TOP of that
//      hull's silhouette. It now sits in chartRoot between `blip` and `aim`.
//
//   C. ...WHICH COST THE FOG'S FEATHER, SO THE HULL CARRIES IT ITSELF. Being
//      under the fog softened a contact as it approached the edge of the bubble.
//      `hullSightSoftness` reproduces that curve from the fog texture's OWN two
//      constants, applied per contact as an alpha multiplier.
//
// The 0.2 floor is untouched throughout — Eric's ratified number (amendment 181),
// and re-anchoring the radii is the whole of the change.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { hullSightSoftness } from '../render/fog.js';
import { Radar } from '../render/radar.js';
import { BASE_DIM_RADII, dimRadii, dimScaleAt } from '../render/radarDim.js';
import {
  CHART_LAYER_ORDER,
  EVERY_LAYER_PLACED,
  HUD_LAYER_ORDER,
  WORLD_LAYER_ORDER,
} from '../render/stage.js';
import { FOG_FILL_ALPHA, HOLE_FEATHER_START } from '../render/textures.js';

// jsdom has no 2d canvas, so the two textures the radar bakes at construction
// cannot rasterize here. The dim mask's stub RECORDS the radius it was asked for
// — which is the whole point of the observer-scaling suite below: what matters is
// not what the ramp looks like but which bubble it was baked against.
const baked = vi.hoisted(() => ({ calls: [] as number[] }));
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return {
    ...actual,
    bakeSweepTexture: (): Texture => Texture.EMPTY,
    bakeDimMaskTexture: (sightU: number): Texture => {
      baked.calls.push(sightU);
      return Texture.EMPTY;
    },
  };
});

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
// A SYNTHETIC narrower observer bubble. The pure ramp and feather functions take
// any radius; nothing in the game shrinks sight at runtime since Story 9.4
// retired the FLASH SHELLS dazzle, but the observer-scaling contract still has
// to hold in both directions.
const NARROW = SIGHT * 0.375;
const FLOOR = CLIENT_CONFIG.blip.heatmap.dim.minScale;

describe('the dim ramp is anchored to TRUESIGHT, on the eighths ladder', () => {
  it('puts the two radii on the 4/8 and 5/8 rungs for a base hull', () => {
    expect(BASE_DIM_RADII.innerU, 'inner = the sight bubble (4/8)').toBeCloseTo(SIGHT, 12);
    expect(BASE_DIM_RADII.innerU, '...which is 4/8 of intel range').toBeCloseTo(RADAR / 2, 12);
    expect(BASE_DIM_RADII.outerU, 'outer = the next rung out (5/8)').toBeCloseTo((RADAR * 5) / 8, 12);
    expect(BASE_DIM_RADII.outerU, '...which is the muzzle-flash halo')
      .toBeCloseTo(CONFIG.vision.muzzleFlash, 12);
  });

  it('HOLDS THE FLOOR ACROSS THE WHOLE BUBBLE — the shipped 1/8 anchoring did '
    + 'not, and that is the defect', () => {
    for (const d of [0, 1, SIGHT / 8, SIGHT / 2, SIGHT * 0.9, SIGHT]) {
      expect(dimScaleAt(d, SIGHT), `at ${d}u`).toBeCloseTo(FLOOR, 12);
    }
    // The shipped ramp reached full at 5/8 of INTEL range from 1/8 of it, so at
    // the bubble's edge it stood (330 − 82.5) / (412.5 − 82.5) = three quarters
    // of the way up: 80% opacity at the very edge of the water the player aims
    // at by eye, and 40% halfway out.
    const shipped = (d: number): number =>
      FLOOR + (1 - FLOOR) * ((d - RADAR / 8) / ((RADAR * 5) / 8 - RADAR / 8));
    expect(shipped(SIGHT), 'the behaviour this cycle removes').toBeCloseTo(0.8, 12);
    expect(shipped(SIGHT / 2), '...halfway out, too').toBeCloseTo(0.4, 12);
  });

  it('reaches FULL painted opacity at the 5/8 rung and stays there — radar is '
    + 'never muted where it is the only sensor', () => {
    expect(dimScaleAt(BASE_DIM_RADII.outerU, SIGHT)).toBeCloseTo(1, 12);
    for (const d of [CONFIG.vision.farRadar, RADAR, RADAR * 4, 1e9]) {
      expect(dimScaleAt(d, SIGHT), `at ${d}u`).toBe(1);
    }
  });

  it('is MONOTONIC and stays inside [floor, 1] everywhere', () => {
    let prev = -Infinity;
    for (let d = -50; d <= RADAR * 2; d += 3) {
      const v = dimScaleAt(d, SIGHT);
      expect(v, `at ${d}u`).toBeGreaterThanOrEqual(FLOOR);
      expect(v).toBeLessThanOrEqual(1);
      expect(v, `non-decreasing at ${d}u`).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it('CLAMPS IN BOTH DIRECTIONS: a negative distance is the floor, a silly one '
    + 'is full', () => {
    expect(dimScaleAt(-1, SIGHT)).toBe(FLOOR);
    expect(dimScaleAt(-1e9, SIGHT)).toBe(FLOOR);
    expect(dimScaleAt(Number.MAX_VALUE, SIGHT)).toBe(1);
  });

  it('FAILS TOWARD A VISIBLE SCOPE on a NaN — the mask is legibility, the returns '
    + 'are the instrument', () => {
    // The same degradation `Radar.updateDimMask` already takes for a non-finite
    // own pose: it DETACHES the mask rather than dimming wrongly.
    expect(dimScaleAt(Number.NaN, SIGHT)).toBe(1);
    expect(dimScaleAt(Infinity, SIGHT)).toBe(1);
    expect(dimScaleAt(100, Number.NaN)).toBe(1);
    expect(dimScaleAt(100, 0), 'no bubble, nothing to quiet').toBe(1);
    expect(dimScaleAt(100, -SIGHT)).toBe(1);
    expect(dimRadii(Number.NaN)).toEqual({ innerU: 0, outerU: 0 });
  });

  it('TRACKS A NARROWER BUBBLE rather than a fixed radius', () => {
    const narrow = NARROW;
    expect(narrow, 'the fixture really is smaller').toBeLessThan(SIGHT);
    const r = dimRadii(narrow);
    expect(r.innerU).toBeCloseTo(narrow, 12);
    expect(dimScaleAt(narrow, narrow), 'floor still covers the whole bubble')
      .toBeCloseTo(FLOOR, 12);
    // Water the base hull would still be quieting is at FULL strength for the
    // narrower one — which is the point: the eye cannot see it, so the scope owns it.
    expect(dimScaleAt(SIGHT, SIGHT)).toBeCloseTo(FLOOR, 12);
    expect(dimScaleAt(SIGHT, narrow)).toBe(1);
  });

  it('...AND A WIDENED BUBBLE, in the other direction', () => {
    const wide = SIGHT * 1.5;
    expect(dimScaleAt(wide, wide), 'the floor followed the bubble out').toBeCloseTo(FLOOR, 12);
    // ...and water that was at full strength for a base hull is quieted for the
    // hull that can SEE it.
    expect(dimScaleAt(CONFIG.vision.muzzleFlash, SIGHT)).toBeCloseTo(1, 12);
    expect(dimScaleAt(CONFIG.vision.muzzleFlash, wide)).toBeLessThan(1);
  });

  it("KEEPS ERIC'S 0.2 FLOOR — the re-anchoring moved the radii and nothing else", () => {
    expect(FLOOR).toBe(0.2);
    expect(dimScaleAt(0, SIGHT)).toBe(0.2);
  });
});

describe('the dim mask is re-baked when the observer\'s bubble moves', () => {
  const radarFor = (): { radar: Radar; layer: Container } => {
    const layer = new Container();
    baked.calls.length = 0;
    const radar = new Radar(layer, new Container());
    return { radar, layer };
  };

  it('bakes at the BASE bubble on construction', () => {
    radarFor();
    expect(baked.calls).toEqual([SIGHT]);
  });

  it('re-bakes at a NARROWER radius, and at a boon-WIDENED one, and never on a '
    + 'frame where nothing moved', () => {
    const { radar } = radarFor();
    const own = { x: 0, y: 0 };
    radar.onSweepSample(0, 0);
    radar.render(own, 100, null, null);
    expect(baked.calls, 'a steady frame costs one float compare').toEqual([SIGHT]);

    radar.setRanges(NARROW, RADAR, 6000);
    radar.render(own, 200, null, null);
    expect(baked.calls.at(-1), 'the narrower bubble').toBeCloseTo(NARROW, 12);
    expect(baked.calls).toHaveLength(2);

    radar.render(own, 300, null, null);
    expect(baked.calls, 'nothing moved: no second bake').toHaveLength(2);

    // A radar-range change alone does not move the bubble (sight is a different
    // quantity from intel range): no bake owed.
    radar.setRanges(NARROW, RADAR * 1.25, 6000);
    radar.render(own, 400, null, null);
    expect(baked.calls).toHaveLength(2);

    radar.setRanges(SIGHT * 1.5, RADAR, 6000);
    radar.render(own, 500, null, null);
    expect(baked.calls.at(-1), 'the widened bubble').toBeCloseTo(SIGHT * 1.5, 12);
  });

  it('bakes against the SAME radius the fog hole is baked at — one bubble, never '
    + 'two ideas of it', () => {
    const { radar } = radarFor();
    radar.setRanges(NARROW, RADAR, 6000);
    radar.render({ x: 0, y: 0 }, 100, null, null);
    expect(baked.calls.at(-1)).toBe(radar.sightHoleU);
  });
});

describe('the hull sight-boundary feather (what the fog used to do for free)', () => {
  const start = SIGHT * HOLE_FEATHER_START;

  it('is FULLY OPAQUE through the clear part of the hole', () => {
    for (const d of [0, 10, start / 2, start]) {
      expect(hullSightSoftness(d, SIGHT), `at ${d}u`).toBe(1);
    }
  });

  it('reproduces the fog composite exactly at the rim: what the overlay does NOT '
    + 'swallow', () => {
    expect(hullSightSoftness(SIGHT, SIGHT)).toBeCloseTo(1 - FOG_FILL_ALPHA, 12);
    expect(hullSightSoftness(SIGHT * 2, SIGHT), 'and holds past it')
      .toBeCloseTo(1 - FOG_FILL_ALPHA, 12);
  });

  it('NEVER REACHES ZERO — the 150ms sight fade removes a hull, a feather only '
    + 'softens one', () => {
    for (let d = 0; d <= SIGHT * 3; d += 5) {
      expect(hullSightSoftness(d, SIGHT), `at ${d}u`).toBeGreaterThan(0);
    }
  });

  it('is MONOTONIC DOWN across the feather and continuous at both kinks', () => {
    let prev = Infinity;
    for (let d = 0; d <= SIGHT * 1.2; d += 2) {
      const v = hullSightSoftness(d, SIGHT);
      expect(v, `non-increasing at ${d}u`).toBeLessThanOrEqual(prev + 1e-12);
      prev = v;
    }
    expect(hullSightSoftness(start + 0.001, SIGHT), 'no step at the feather start')
      .toBeCloseTo(1, 4);
    expect(hullSightSoftness(SIGHT - 0.001, SIGHT), 'nor at the rim')
      .toBeCloseTo(1 - FOG_FILL_ALPHA, 4);
  });

  it('SCALES WITH THE OBSERVER, like the hole it mirrors: a narrower bubble '
    + 'feathers earlier, a sight boon later', () => {
    const narrow = NARROW;
    expect(hullSightSoftness(narrow, narrow)).toBeCloseTo(1 - FOG_FILL_ALPHA, 12);
    // A hull at 60% of the BASE bubble is untouched for a base observer and deep
    // in the feather for a narrower one.
    const d = SIGHT * 0.6;
    expect(hullSightSoftness(d, SIGHT)).toBe(1);
    expect(hullSightSoftness(d, narrow)).toBeLessThan(1);
    expect(hullSightSoftness(d, SIGHT * 1.5), 'a widened bubble is clear further out').toBe(1);
  });

  it('fails toward the hull being VISIBLE on garbage input', () => {
    expect(hullSightSoftness(Number.NaN, SIGHT)).toBe(1);
    expect(hullSightSoftness(100, Number.NaN)).toBe(1);
    expect(hullSightSoftness(100, 0)).toBe(1);
    expect(hullSightSoftness(100, -1)).toBe(1);
  });
});

// RE-BASED 2026-10-12 (Story 9.3, "smoke is paint"). The lift put `ship`
// directly above `blip`; Eric's countermeasure ruling re-cut that: "If I'm the
// user, I should be on top so I can see where I am. If I am not the user then
// it should render above everything except radar paints." A cloud above
// contact hulls with paints above the cloud means paints above contact hulls,
// so the OWN hull moved to its own `ownShip` layer above `blip`, and contact
// hulls (`ship`) now sit below the returns.
describe('the declared z-order: the own hull over returns, reticle over hulls', () => {
  const at = (name: string): number => CHART_LAYER_ORDER.indexOf(name as never);

  it('puts the own hull (`ownShip`) ABOVE `blip`, and every hull layer is charted', () => {
    expect(at('ownShip')).toBeGreaterThan(at('blip'));
    expect(at('ship'), 'contact hulls are charted').toBeGreaterThanOrEqual(0);
    expect(WORLD_LAYER_ORDER as readonly string[], 'and not fogged')
      .not.toContain('ship');
    expect(WORLD_LAYER_ORDER as readonly string[]).not.toContain('ownShip');
  });

  it('keeps both hull layers BELOW the reticle and the burst rings', () => {
    for (const hull of ['ship', 'ownShip']) {
      expect(at(hull)).toBeLessThan(at('aim'));
      expect(at(hull)).toBeLessThan(at('burstFx'));
      expect(at(hull)).toBeLessThan(at('sweep'));
    }
  });

  it('contact hulls sit below the returns (the 2026-10-12 re-cut)', () => {
    expect(at('ship')).toBeLessThan(at('blip'));
  });

  // `aim` was `ship + 1` when this file was written, asserted as "nothing
  // slipped in on either side". Something deliberately did: the nameplate layer
  // took that seat when it stopped being a stage root (Eric: names are *"never
  // obscured by terrain"*, but *"i should be able to see aiming reticles over
  // it"*), which is the ONE stacking that satisfies both clauses.
  //
  // THIS FILE DELIBERATELY DOES NOT RE-ASSERT THE PLATE'S SEAT.
  // `nameplatesAboveTerrain.test.ts` owns it, and two files asserting one fact
  // is how a pin ends up half-updated. What survives here is only what this file
  // is about — `ship` directly above `blip`, and `ship` below the aim marks —
  // both of which are stated in the cases around this comment and neither of
  // which the plate move touched.

  it('names every layer exactly once across the three roots', () => {
    const all = [...WORLD_LAYER_ORDER, ...CHART_LAYER_ORDER, ...HUD_LAYER_ORDER];
    expect(new Set(all).size, 'no layer is added to two roots').toBe(all.length);
    // ...and the compile-time half: a StageLayers key in NO array would make
    // this `false` and stop the build.
    expect(EVERY_LAYER_PLACED).toBe(true);
  });
});
