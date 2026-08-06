// The `return`-grammar acquire path of render/radar.ts (cycle 52, amendments
// 76-79) — the Pixi adapter around radarHeatmap.ts, exercised through the real
// scene graph. The band/quantization math itself is pinned in
// radarHeatmap.test.ts; this file is about the ADAPTER's contracts.
//
// WHAT IS CONTRACT HERE, not coverage:
//   • A PAINT IS POSED FROM A REAL OBSERVER OR NOT AT ALL. Radar paints arrive
//     on network cadence, not render cadence, so one can land before the first
//     render (join) or in any later gap where the own pose is unknown. Geometry
//     is frozen at resolve and the paint then decays for ~12s, so a guessed
//     observer is not a one-frame cosmetic — it is twelve seconds of a mark
//     attenuated for the wrong range on a bearing the contact does not hold.
//   • ONCE RESOLVED IT STAYS FROZEN. The deferral exists to stop a paint being
//     born wrong, not to make it track the observer: a phosphor paint is a
//     historical snapshot and must not re-pose as the ship moves.
//   • THE SCOPE PAINTS EVERYTHING IN RADAR RANGE (cycle 56, amendments 88-90).
//     The sight exclusion is retired: a coastline or a hull inside truesight
//     paints exactly like one outside it, and `sightHoleU` survives with a new
//     job — it is the SOURCE SEAM, not a suppression boundary.
//   • AND A SIGHTED SHIP'S ECHO IS SYNTHESIZED FROM ITS `Contact` (amendment
//     89), because the server has never sent a blip for a hull it is already
//     sending as a contact. The last three blocks pin that second source: the
//     sweep gates it, the range term is the exact complement of the server's,
//     both sources share ONE per-track cap, and a dazzle moves the seam for both
//     sides at once.
//   • THE PAINT LIST IS THE HISTORY, THE BUFFER IS DERIVED (ruling R1). Nothing
//     decays in place; the buffer is re-rasterized in full every frame from the
//     surviving paints, which is what stops old paints smearing or dragging with
//     the camera.
//   • ISLANDS PAINT AS THE BEAM REACHES THEM (amendments 69 + 78) — one paint
//     per island per revolution, filling in behind the beam.
//   • `silhouette` MODE IS UNTOUCHED (amendment 79). It keeps hull outlines,
//     personal hues, ARPA vectors and the hue-preserving `blipCool` decay, and
//     it allocates no heatmap at all. The last describe block is that guard.

import { describe, it, expect, vi } from 'vitest';
import { Container, Texture, type Graphics } from 'pixi.js';
import {
  BOON_CATALOG,
  CONFIG,
  islandFromPolygon,
  type ReturnBlipEvent,
  type SilhouetteBlipEvent,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ContactStore } from '../net/snapshots.js';
import { Radar } from '../render/radar.js';
import { fogHoleRadiusU } from '../render/fog.js';
import { blipCool, blipLifeMs } from '../render/phosphor.js';

// jsdom has no 2d canvas, so the baked sweep wedge can't rasterize here; the
// heatmap buffer (what this file is about) needs no canvas at all.
vi.mock('../render/textures.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../render/textures.js')>();
  return { ...actual, bakeSweepTexture: (): Texture => Texture.EMPTY };
});

const EXT = 100; // aspect-projected extent on the wire (u)
const OWN = { x: 0, y: 0 };
const LIFE = blipLifeMs(60_000 / CONFIG.vision.sweepRpm);

function makeRadar(): { radar: Radar; layer: Container } {
  const layer = new Container();
  const radar = new Radar(layer, new Container(), () => null, 'return');
  radar.onSweepSample(0, 0);
  return { radar, layer };
}

/** A rectangular ridge island — its bounding circle holds a lot of open water,
 *  which is the whole reason the polygon has to be the authority. */
function ridge(cx: number, cy: number, hw: number, hh: number) {
  return islandFromPolygon([
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ]);
}

/** A paint 500u due +y of the origin: bearing π/2, so a correctly posed kernel
 *  is WIDER than it is tall (`ext` is measured across the bearing) — and one
 *  posed from a null observer, at bearing 0, is exactly the reverse. */
const PAINT: ReturnBlipEvent = { k: 'blip', id: 'trk-1', x: 0, y: 500, ext: EXT, t: 1000 };

/** Extent of the lit region along one world axis through the paint centre. */
function litSpan(radar: Radar, axis: 'x' | 'y', cross: number, at: number): number {
  const step = CLIENT_CONFIG.blip.heatmap.cellU;
  let span = 0;
  for (let d = -400; d <= 400; d += step) {
    const x = axis === 'x' ? cross + d : at;
    const y = axis === 'x' ? at : cross + d;
    if (radar.bandAt(x, y) >= 0) span += step;
  }
  return span;
}

describe('`return` paints are posed from a real observer or not at all', () => {
  it('holds a paint that arrives before the first render, painting nothing', () => {
    const { radar } = makeRadar();
    radar.onBlip(PAINT);
    expect(radar.livePaints).toBe(0); // parked, not posed
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });

  it('poses it on the FIRST frame with an own pose — bearing and attenuation '
    + 'both from the real observer', () => {
    const { radar } = makeRadar();
    radar.onBlip(PAINT); // arrives with no pose available
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(1);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBeGreaterThanOrEqual(0);
    // Posed at bearing π/2: the extent axis runs across the observer's line of
    // sight, the range smear along it. A bearing-0 fallback is this transposed.
    const across = litSpan(radar, 'x', 0, 500);
    const along = litSpan(radar, 'y', 500, 0);
    expect(across).toBeGreaterThan(along);
    // And attenuated for a 500u range rather than drawn at point-blank size.
    const o = CLIENT_CONFIG.blip.heatmap.ship;
    const atten = o.attenFloor + (1 - o.attenFloor) / (1 + 500 / (o.attenHalfRange * 660));
    expect(across).toBeLessThan(EXT);
    expect(across).toBeGreaterThan(EXT * atten * 0.6);
  });

  it('poses immediately when a pose is already known — deferral is the '
    + 'exception, not the cadence', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900); // pose established first
    radar.onBlip(PAINT);
    expect(radar.livePaints).toBe(1);
  });

  it('freezes the geometry once resolved — a paint is a historical snapshot', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    radar.render(OWN, 950);
    const before = litSpan(radar, 'x', 0, 500);
    radar.render({ x: 400, y: 400 }, 1100); // observer moves; the paint must not
    expect(litSpan(radar, 'x', 0, 500)).toBe(before);
  });
});

describe('the paint list is the history and the buffer is derived (ruling R1)', () => {
  it('keeps at most `paintsPerContact` live paints of one track', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    for (let i = 0; i < 8; i++) radar.onBlip({ ...PAINT, t: i * 100, y: 300 + i * 10 });
    expect(radar.livePaints).toBe(CLIENT_CONFIG.blip.paintsPerContact);
  });

  it('re-rasterizes from scratch: a paint that ages out leaves NOTHING behind', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    radar.render(OWN, 1000);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBeGreaterThanOrEqual(0);
    radar.render(OWN, PAINT.t + LIFE + 1);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });

  it('clearBlips drops every paint (entering spectate)', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 900);
    radar.onBlip(PAINT);
    radar.clearBlips();
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(PAINT.x, PAINT.y)).toBe(-1);
  });
});

describe('island landmasses (amendments 69 + 78)', () => {
  // BEYOND TRUESIGHT, BUT NO LONGER FOR POLICY REASONS. This fixture sat at
  // x = 300 until cycle 54 gated the bubble, moved out to 600 to keep these
  // landmass-grammar tests clear of that gate, and stays there now that cycle 56
  // has retired it — a landmass 600u off is simply the plainest case for the
  // FILL grammar these tests are about. The inside-truesight case is a first-
  // class citizen again and is pinned by the reversal block near the end of this
  // file (and in radarHeatmap.test.ts section 6).
  const ISLE = ridge(600, 0, 120, 90);

  it('paints the landmass the beam swept, and paints it SOLID', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0); // arms lastRotation
    radar.render(OWN, 900); // beam advances ~1.4 rad across bearing 0
    expect(radar.liveIslandPaints).toBe(1);
    // A point deep inside the near face reads as land, not as a rim sample.
    expect(radar.bandAt(520, 0)).toBeGreaterThanOrEqual(0);
    expect(radar.bandAt(540, 0)).toBeGreaterThanOrEqual(0);
  });

  it('opens ONE paint per island per revolution, not one per frame', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    for (let t = 100; t <= 900; t += 100) radar.render(OWN, t);
    expect(radar.liveIslandPaints).toBe(1);
  });

  it('paints nothing inside the bounding circle that is not inside the POLYGON', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    // 600 ± 140 in y is inside the bounding circle (r = 150) and outside the
    // 120 × 90 rectangle — and comfortably beyond the sight bubble, so the
    // sight gate is not what is answering here. The retired code painted coast
    // samples exactly there.
    expect(Math.hypot(600, 140)).toBeGreaterThan(CONFIG.vision.sight);
    expect(radar.bandAt(600, 140)).toBe(-1);
    expect(radar.bandAt(600, -140)).toBe(-1);
  });

  it('a landmass never evicts a contact paint from the scope', () => {
    const { radar } = makeRadar();
    radar.setIslands([ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.onBlip({ ...PAINT, t: 0 });
    radar.render(OWN, 900);
    expect(radar.liveIslandPaints).toBe(1);
    expect(radar.livePaints - radar.liveIslandPaints).toBe(1);
  });
});

// --- NO CLIPPING, NO EXCEPTIONS (cycle 57, amendments 92-94) ---------------------
//
// Eric, on the cycle-56 build: *"there's basically a 'box' around my radar ring,
// and anything not in that 'box' will be unpainted immediately once it leaves,
// and then re-render if it comes back into that 'box.' … If it gets painted, it
// STAYS painted until it decays, NO EXCEPTIONS."*
//
// The box was the heatmap buffer: allocated at half-extent exactly `radarRange`
// and re-anchored on the observer every frame, so a rim paint fell out of it the
// moment the observer sailed outward. The headline test below is the symptom
// itself and FAILS against that allocation; the rest pin the two things the fix
// must not cost — a paint's world PLACEMENT under a rect that now moves and
// resizes, and the per-frame work, which must follow the paints rather than the
// (several times larger) allocation.

describe('a paint stays painted until it decays, however far the observer sails', () => {
  const RADAR = CONFIG.vision.radar;
  const CELL = CLIENT_CONFIG.blip.heatmap.cellU;
  /** A paint born at the very edge of radar range, dead ahead of the observer. */
  const RIM: ReturnBlipEvent = { k: 'blip', id: 'rim', x: 0, y: RADAR, ext: EXT, t: 0 };

  /**
   * The farthest the observer can sail inside one paint's life — re-derived here
   * from CONFIG and the boon catalog rather than imported, so this test states
   * the worst case in its own terms. Fastest pickable hull, `shipSpeed` at full
   * multiplicative stack, plus a fully-stacked boost bonus.
   */
  function maxSail(): number {
    const hull = Math.max(
      ...Object.values(CONFIG.shipClasses).map((c) => c.kinematics.maxSpeed),
    );
    const spd = BOON_CATALOG.shipSpeed;
    const bst = BOON_CATALOG.boostMax;
    const mult = spd.effects.reduce(
      (m, e) => (e.kind === 'stat' && e.path === 'kinematics.maxSpeed' ? m * (e.mult ?? 1) : m),
      1,
    );
    const add = bst.effects.reduce(
      (a, e) => (e.kind === 'stat' && e.path === 'boost.speedBonus' ? a + (e.add ?? 0) : a),
      0,
    );
    const speed =
      hull * mult ** spd.copies + CONFIG.speedBoost.speedBonus + add * bst.copies;
    return (speed * LIFE) / 1000;
  }

  /** The bands painted across a window centred on the rim paint — the "is this
   *  cell lit" set, sampled by WORLD position so it is independent of wherever
   *  the active rect happens to sit. */
  function window(radar: Radar): number[] {
    const out: number[] = [];
    for (let dy = -120; dy <= 120; dy += CELL) {
      for (let dx = -120; dx <= 120; dx += CELL) out.push(radar.bandAt(dx, RADAR + dy));
    }
    return out;
  }

  it('HEADLINE: a rim paint is still fully rendered after the observer has '
    + 'sailed the farthest it possibly could inside that paint\'s life', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    radar.onBlip(RIM);
    radar.render(OWN, 1);
    const born = window(radar);
    expect(born.some((b) => b >= 0)).toBe(true);

    // All-ahead-flank away from it, for all but the last millisecond of the
    // paint's life. The paint is still alive, so it must still be on the scope —
    // whole, not a clipped remnant.
    const age = LIFE - 1;
    const sailed = { x: 0, y: -maxSail() * (age / LIFE) };
    radar.render(sailed, age);
    expect(radar.livePaints, 'still live, so still painted').toBe(1);
    expect(window(radar)).toEqual(born);
  });

  it('THE BOX SYMPTOM: sailing out, back, and out again never un-paints or '
    + 're-paints a cell — only alpha moves', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    radar.onBlip(RIM);
    radar.render(OWN, 1);
    const base = window(radar);
    const sail = maxSail();
    // Out past the old buffer edge, back to the start, out again, part way back.
    for (const [i, y] of [-sail * 0.9, 0, -sail * 0.7, -sail * 0.3].entries()) {
      radar.render({ x: 0, y }, 100 + i * 100);
      expect(window(radar), `at own y=${Math.round(y)}`).toEqual(base);
    }
  });

  it('allocates the DERIVED bound, not the radar range', () => {
    const { radar } = makeRadar();
    const half = (radar.heatCapCols * CELL) / 2;
    expect(half).toBeGreaterThanOrEqual(RADAR + maxSail());
  });

  it('places an echo at the same WORLD point whatever the active rect is doing', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    radar.onBlip(RIM);
    radar.render(OWN, 1);
    const band = radar.bandAt(RIM.x, RIM.y);
    expect(band).toBeGreaterThanOrEqual(0);
    const color = CLIENT_CONFIG.blip.heatmap.bands[band].color;
    const rgb = (t: readonly number[]): number => (t[0] << 16) | (t[1] << 8) | t[2];

    // The uploaded texel under that world point carries the band's own color,
    // resolved through sprite position + scale + texture stride…
    const at = radar.texelAt(RIM.x, RIM.y);
    expect(at).not.toBeNull();
    expect(rgb(at as readonly number[])).toBe(color);
    expect((at as readonly number[])[3]).toBeGreaterThan(0);

    // …and it still does after a second paint far away has changed the rect's
    // size AND its origin. A rect-relative bug shifts every echo here.
    const before = { cols: radar.heatRectCells, x: radar.texelAt(RIM.x, RIM.y) };
    radar.onBlip({ k: 'blip', id: 'far', x: -520, y: -300, ext: EXT, t: 1 });
    radar.render(OWN, 2);
    expect(radar.heatRectCells).not.toBe(before.cols); // the rect really moved
    const after = radar.texelAt(RIM.x, RIM.y);
    expect(after).not.toBeNull();
    expect(rgb(after as readonly number[])).toBe(color);
    // And the far echo lands on ITS own water, not on the rim echo's.
    expect(radar.bandAt(-520, -300)).toBeGreaterThanOrEqual(0);
    expect(rgb(radar.texelAt(-520, -300) as readonly number[])).toBe(
      CLIENT_CONFIG.blip.heatmap.bands[radar.bandAt(-520, -300)].color,
    );
  });

  it('per-frame cost follows the PAINTS, not the allocation', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    for (let i = 0; i < 3; i++) {
      radar.onBlip({ k: 'blip', id: `n${i}`, x: i * 40, y: 120, ext: EXT, t: 0 });
    }
    radar.render(OWN, 1);
    const allocation = radar.heatCapCols ** 2;
    expect(radar.heatRectCells).toBeGreaterThan(0);
    // A cluster of nearby contacts must cost a small box — not the worst-case
    // square, and not more than the radar-range square that used to ship.
    expect(radar.heatRectCells).toBeLessThan(allocation / 10);
    expect(radar.heatRectCells).toBeLessThan((2 * RADAR / CELL) ** 2);
  });

  it('costs nothing at all when nothing is live', () => {
    const { radar } = makeRadar();
    radar.render(OWN, 0);
    radar.onBlip(RIM);
    radar.render(OWN, 1);
    expect(radar.heatRectCells).toBeGreaterThan(0);
    radar.render(OWN, LIFE + 1); // everything has decayed
    expect(radar.livePaints).toBe(0);
    expect(radar.heatRectCells).toBe(0);
    expect(radar.bandAt(RIM.x, RIM.y)).toBe(-1);
    expect(radar.texelAt(RIM.x, RIM.y)).toBeNull();
  });
});

// --- `silhouette` mode is UNTOUCHED (amendment 79) -------------------------------

describe('`silhouette` mode is byte-identical to the shipped Story 4.2 grammar', () => {
  const HUE = CLIENT_CONFIG.colors.players.cyan;
  const POSE: SilhouetteBlipEvent = {
    k: 'blip', id: 'trk-s', x: 0, y: 500, t: 1000, cls: 'battleship', heading: 0, speed: 20,
  };

  /** The color a Graphics was actually stroked with (Pixi keeps the draw
   *  instructions on the context; `tint` is a separate multiplier). */
  function strokeColor(g: Graphics): number {
    const { instructions } = g.context as unknown as {
      instructions: { action: string; data: { style?: { color?: number } } }[];
    };
    return instructions.find((i) => i.action === 'stroke')?.data.style?.color ?? -1;
  }

  function hue(color: number): number {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
    const max = Math.max(r, g, b);
    const c = max - Math.min(r, g, b);
    if (c === 0) return -1;
    const h = max === r ? (g - b) / c : max === g ? 2 + (b - r) / c : 4 + (r - g) / c;
    return (h * 60 + 360) % 360;
  }

  function makeSilhouette(): { radar: Radar; layer: Container } {
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => HUE, 'silhouette');
    radar.onSweepSample(0, 0);
    return { radar, layer };
  }

  it('still draws a hull outline in the owner\'s personal hue', () => {
    const { radar, layer } = makeSilhouette();
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    const g = layer.children[0] as Graphics;
    expect(radar.liveBlips).toBe(1);
    expect(hue(strokeColor(g))).toBeCloseTo(hue(HUE), 0);
    // True-scale silhouette + ARPA vector, drawn once at acquire.
    expect(g.getLocalBounds().width).toBeGreaterThan(0);
  });

  it('still cools on the same hue-preserving grey ramp, at the same floor', () => {
    const { radar, layer } = makeSilhouette();
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    const g = layer.children[0] as Graphics;
    const stroked = strokeColor(g);
    for (const now of [1000, 2000, 4000, 8000, 12_000]) {
      radar.render(OWN, now);
      expect(g.tint, `age ${now - POSE.t}`).toBe(
        blipCool(now - POSE.t, LIFE, CLIENT_CONFIG.blip.coolFloor),
      );
      expect(strokeColor(g)).toBe(stroked); // the owner's hue, untouched
    }
  });

  it('allocates NO heatmap and paints no bitmap cell, ever', () => {
    const { radar } = makeSilhouette();
    radar.setIslands([ridge(300, 0, 120, 90)]);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    radar.onBlip(POSE);
    radar.render(OWN, 1000);
    expect(radar.livePaints).toBe(0);
    expect(radar.liveIslandPaints).toBe(0);
    expect(radar.bandAt(0, 500)).toBe(-1);
    expect(radar.bandAt(300, 0)).toBe(-1);
    // NO BUFFER MEANS NO EXTENT AND NO ACTIVE RECT (amendment 94): cycle 57
    // grew the allocation and split a per-frame sub-rect out of it, and neither
    // may reach a mode that allocates nothing at all.
    expect(radar.heatCapCols).toBe(0);
    expect(radar.heatRectCells).toBe(0);
    expect(radar.texelAt(0, 500)).toBeNull();
  });

  it('THE SIGHT GATE NEVER REACHES IT: a paint deep inside truesight still '
    + 'draws its full outline, dazzled or not (amendment 82)', () => {
    // `silhouette` has no coverage grid and never had the bug, so the gate must
    // be structurally invisible to it. A hull 120u out — well inside the bubble,
    // and inside even the DAZZLED bubble — still draws exactly as it always did.
    const close: SilhouetteBlipEvent = { ...POSE, y: 120 };
    const { radar, layer } = makeSilhouette();
    radar.render(OWN, 900);
    radar.onBlip(close);
    const g = layer.children[0] as Graphics;
    const stroked = strokeColor(g);
    const bounds = g.getLocalBounds().width;
    expect(radar.liveBlips).toBe(1);
    expect(bounds).toBeGreaterThan(0);

    radar.setDazzled(true);
    radar.render(OWN, 1000);
    expect(radar.liveBlips).toBe(1);
    expect(g.visible).toBe(true);
    expect(strokeColor(g)).toBe(stroked);
    expect(g.getLocalBounds().width).toBe(bounds);
    // ...and still no buffer exists to gate.
    expect(radar.bandAt(close.x, close.y)).toBe(-1);
  });
});

// --- THE SCOPE PAINTS EVERYTHING IN RANGE, through the adapter (cycle 56) -------

describe('the scope paints INSIDE truesight now (amendment 88 — the reversal)', () => {
  /** A coastline whose near face runs from x = 180 to x = 420 — all of it under
   *  the 330u bubble at the moment the beam sweeps it. Under cycles 54-55 this
   *  island painted NOTHING; it is the fixture the reversal is measured on. */
  const CLOSE_ISLE = ridge(300, 0, 120, 90);
  /** A probe on that near face, 220u out: inside truesight, and land. */
  const PROBE = { x: 220, y: 0 };

  it('THE REVERSAL: an island swept from INSIDE truesight paints — cycles '
    + '54-55 left it dark', () => {
    const { radar } = makeRadar();
    radar.setIslands([CLOSE_ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0); // arms lastRotation
    radar.render(OWN, 900); // beam crosses bearing 0 and bakes the island paint
    expect(radar.liveIslandPaints, 'the beam opened a paint').toBe(1);
    expect(Math.hypot(PROBE.x, PROBE.y), 'and the probe is inside truesight')
      .toBeLessThan(CONFIG.vision.sight);
    expect(radar.bandAt(PROBE.x, PROBE.y), 'swept inside truesight: PAINTED')
      .toBeGreaterThanOrEqual(0);
  });

  it('and the SWEEP is still the only thing that paints it — nothing appears '
    + 'before the beam arrives (amendment 83)', () => {
    const { radar } = makeRadar();
    radar.setIslands([CLOSE_ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    // The beam has entered the island's bearing span (a 240u-wide ridge 300u
    // off subtends ±0.52 rad) but has not yet reached the probe's own bearing,
    // so the landmass is filling in BEHIND the beam and the probe is still dark.
    radar.render(OWN, 200);
    expect(radar.bandAt(PROBE.x, PROBE.y), 'the beam has not reached it').toBe(-1);
    radar.render(OWN, 900);
    expect(radar.bandAt(PROBE.x, PROBE.y)).toBeGreaterThanOrEqual(0);
  });

  it('and the paint is a record: withdrawing does not change one cell of it '
    + '(amendment 83)', () => {
    const { radar } = makeRadar();
    radar.setIslands([CLOSE_ISLE]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    const band = radar.bandAt(PROBE.x, PROBE.y);
    expect(band).toBeGreaterThanOrEqual(0);
    for (const x of [-100, -200, -300]) {
      radar.render({ x, y: 0 }, 950);
      expect(radar.liveIslandPaints, `at x=${x}`).toBe(1);
      expect(radar.bandAt(PROBE.x, PROBE.y), `withdrawn to x=${x}: same band`).toBe(band);
    }
  });

  it('and TIME is the only thing that takes it away', () => {
    const isle = ridge(600, 0, 120, 90);
    const { radar } = makeRadar();
    radar.setIslands([isle]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    expect(radar.bandAt(520, 0)).toBeGreaterThanOrEqual(0);
    radar.render(OWN, 900 + LIFE + 1);
    expect(radar.liveIslandPaints).toBe(0);
    expect(radar.bandAt(520, 0)).toBe(-1);
  });

  it('a ghost the ship has closed on keeps decaying in place (amendment 86, '
    + 'now the ordinary case)', () => {
    const isle = ridge(600, 0, 120, 90);
    const { radar } = makeRadar();
    radar.setIslands([isle]);
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0);
    radar.render(OWN, 900);
    expect(radar.bandAt(520, 0), 'baked from 520u out: painted').toBeGreaterThanOrEqual(0);
    radar.render({ x: 400, y: 0 }, 1000); // now 120u away — deep inside truesight
    expect(radar.liveIslandPaints).toBe(1);
    expect(radar.bandAt(520, 0), 'the ghost decays in place').toBeGreaterThanOrEqual(0);
  });
});

// --- the SECOND source: sighted ships, from their Contact (amendment 89) --------

/** A static sighted contact at `x` on bearing 0 from the origin. */
function sightedStore(x: number, id = 'ship-7', heading = 0): ContactStore {
  const store = new ContactStore();
  store.pushFrame(0, [{ id, x, y: 0, heading, speed: 0, cls: 'battleship' }]);
  return store;
}

describe('a sighted ship paints from its Contact when the beam crosses it', () => {
  it('THE REVERSAL: a hull inside truesight now paints an echo — the server '
    + 'has never sent a blip for one', () => {
    const store = sightedStore(200);
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store); // arms lastRotation
    radar.render(OWN, 900, store); // beam crosses bearing 0
    expect(radar.livePaints, 'one synthesized echo').toBe(1);
    expect(radar.bandAt(200, 0)).toBeGreaterThanOrEqual(0);
  });

  it('and NOT before the beam reaches it — the sweep gate holds for this '
    + 'source too', () => {
    const store = sightedStore(200);
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 200, store); // beam still short of bearing 0
    expect(radar.livePaints, 'a contact is not a paint trigger').toBe(0);
    expect(radar.bandAt(200, 0)).toBe(-1);
  });

  it('one echo per revolution, not one per frame', () => {
    const store = sightedStore(200);
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    for (let t = 100; t <= 900; t += 100) radar.render(OWN, t, store);
    expect(radar.livePaints).toBe(1);
  });

  it('a contact BEYOND truesight is left to the wire — the client never '
    + 'synthesizes in the annulus the server blips', () => {
    const store = sightedStore(500); // > 330u: the server's territory
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 900, store);
    expect(radar.livePaints).toBe(0);
    expect(radar.bandAt(500, 0)).toBe(-1);
  });

  it('an island between us and the hull blocks the echo (islands block every '
    + 'sensor)', () => {
    const store = sightedStore(200);
    const { radar } = makeRadar();
    radar.setIslands([ridge(120, 0, 30, 40)]); // athwart the bearing, inside the range
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 900, store);
    expect(radar.livePaints - radar.liveIslandPaints, 'no hull echo').toBe(0);
  });

  it('and nothing at all is synthesized in `silhouette` mode', () => {
    const store = sightedStore(200);
    const layer = new Container();
    const radar = new Radar(layer, new Container(), () => null, 'silhouette');
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 900, store);
    expect(radar.livePaints).toBe(0);
    expect(radar.liveBlips).toBe(0);
  });
});

describe('the two ship-paint sources share ONE per-track cap (no second ghost '
  + 'train)', () => {
  it('a hull crossing the truesight seam keeps `paintsPerContact` marks in '
    + 'total, not that many from each source', () => {
    const ID = 'ship-7';
    const store = sightedStore(200, ID);
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    // Beyond-truesight history first: three wire paints under this id, spaced
    // far enough apart that no kernel overlaps its neighbour's cell.
    const trail = [400, 500, 600];
    trail.forEach((x, i) => radar.onBlip({ k: 'blip', id: ID, x, y: 0, ext: 100, t: 100 + i * 10 }));
    radar.render(OWN, 200, store);
    expect(radar.livePaints).toBe(CLIENT_CONFIG.blip.paintsPerContact);
    for (const x of trail) expect(radar.bandAt(x, 0), `wire ghost at ${x}`).toBeGreaterThanOrEqual(0);
    // Now the hull closes inside truesight and the beam crosses it: the
    // synthesized echo joins the SAME track and evicts the oldest wire paint.
    radar.render(OWN, 900, store);
    expect(radar.livePaints, 'still one train').toBe(CLIENT_CONFIG.blip.paintsPerContact);
    expect(radar.bandAt(200, 0), 'and the new echo is on the scope')
      .toBeGreaterThanOrEqual(0);
    expect(radar.bandAt(400, 0), 'while the oldest wire ghost was evicted').toBe(-1);
    expect(radar.bandAt(600, 0), 'and the newer ones survive').toBeGreaterThanOrEqual(0);
  });
});

// --- the SOURCE SEAM is the drawn fog hole, dazzle included (amendment 89) ------

describe('the source seam is `fogHoleRadiusU`, so client and server agree', () => {
  const SIGHT = CONFIG.vision.sight;
  const DAZZLE = CONFIG.starShells.dazzleSightFactor;
  /** Between the dazzled hole and the un-dazzled one: the annulus a dazzle hands
   *  from the client's synthesis to the server's blips. */
  const MID = SIGHT * ((1 + DAZZLE) / 2);

  it('the seam radius IS fogHoleRadiusU, at base stats and dazzled', () => {
    const { radar } = makeRadar();
    // Called, not re-derived: it is also, by construction, the server's own
    // dazzle-scaled `sightOf`. If either side ever changes, this equality is the
    // thing that breaks — rather than a hull at the seam painting twice.
    expect(radar.sightHoleU).toBe(fogHoleRadiusU(SIGHT, false));
    expect(radar.setDazzled(true)).toBe(true); // mirrors Fog's changed-flag
    expect(radar.isDazzled).toBe(true);
    expect(radar.sightHoleU).toBe(fogHoleRadiusU(SIGHT, true));
    // And that IS a shrink, by exactly the ratified factor.
    expect(radar.sightHoleU).toBe(SIGHT * DAZZLE);
    expect(radar.setDazzled(true)).toBe(false); // no-op flip reports no change
  });

  it('a DAZZLE hands the annulus over: the client stops synthesizing there, '
    + 'because the server has started blipping it', () => {
    expect(MID).toBeGreaterThan(SIGHT * DAZZLE);
    expect(MID).toBeLessThan(SIGHT);
    const store = sightedStore(MID);

    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 900, store);
    expect(radar.livePaints, 'un-dazzled: ours to synthesize').toBe(1);

    const dazzled = makeRadar().radar;
    dazzled.setDazzled(true);
    dazzled.onSweepSample(-0.6, 0);
    dazzled.render(OWN, 0, store);
    dazzled.render(OWN, 900, store);
    expect(dazzled.livePaints, 'dazzled: the wire covers it').toBe(0);
  });

  it('and a dazzle never reaches back into a paint already on the scope', () => {
    const store = sightedStore(MID);
    const { radar } = makeRadar();
    radar.onSweepSample(-0.6, 0);
    radar.render(OWN, 0, store);
    radar.render(OWN, 900, store);
    const band = radar.bandAt(MID, 0);
    expect(band).toBeGreaterThanOrEqual(0);
    radar.setDazzled(true);
    radar.render(OWN, 950, store);
    expect(radar.bandAt(MID, 0), 'the existing mark is untouched').toBe(band);
  });
});
