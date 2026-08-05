// `return`-grammar echo math (render/returnMarks.ts) — the pure core the Pixi
// adapter traces. Cycle 50, amendments 62-70.
//
// Four things in here are CONTRACT, not coverage:
//   • THE SEED IS (track key, paint time) AND BOTH HALVES MATTER. Amendment 70
//     asked for "stable while it decays, different next sweep". Drop the time
//     and every echo of a contact is the same shape forever; drop the key and
//     two contacts painted on the same tick are twins. Both failure modes are
//     pinned below.
//   • RANGE ATTENUATION IS STRICTLY MONOTONE, WITH NO CLAMP. Size is the
//     return-strength channel and nothing else shares it (amendment 64), so two
//     different ranges must never resolve to one drawn size. The floor is an
//     asymptote for exactly that reason.
//   • ONLY THE NEAR ARC PAINTS. Everything behind an island is shadow — the
//     existing rule (islands block every sensor at all ranges), not a new one.
//     The test states it geometrically: every sampled coast point is strictly
//     nearer the observer than the island's own centre.
//   • THE DEFAULT GRAMMAR IS UNCHANGED. `silhouette`/`roster` is what production
//     runs until a server flag flips (amendment 63), so the fallbacks are pinned
//     as hard as the new path is.

import { describe, it, expect } from 'vitest';
import { perpendicularExtent, segCircleHit, type Circle, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { createGameState } from '../state.js';
import { radarModes } from '../net/connection.js';
import {
  blobSeed,
  echoColor,
  echoSize,
  islandReturns,
  nearArcSamples,
  rangeAttenuation,
  returnPolygon,
  returnStrength,
  sweepCrossed,
} from '../render/returnMarks.js';

const O = CLIENT_CONFIG.blip.returns;
const ISL = O.island;
const RADAR = 660; // CONFIG.vision.radar at base stats — the usual observer

const SIZE = { across: 90, along: 40 };

function poly(key: string, t: number, bearing = 0): Vec2[] {
  return returnPolygon(blobSeed(key, t), SIZE, bearing, O);
}

function same(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

// --- AC8: a paint is stable while it decays, and the next one differs --------

describe('blob determinism (amendment 70)', () => {
  it('the SAME (track key, paint time) yields a byte-identical polygon', () => {
    // This is what makes a paint stable across its whole 3-sweep decay: the
    // adapter draws once at acquire, but any redraw must land on the same shape.
    expect(same(poly('ship-a', 12_000), poly('ship-a', 12_000))).toBe(true);
  });

  it('the NEXT paint of the same contact differs — 50ms is enough to re-roll', () => {
    // 50ms is the smallest step the 20Hz server clock can deliver, so if the
    // seed avalanche were weak this is where it would show.
    expect(same(poly('ship-a', 12_000), poly('ship-a', 12_050))).toBe(false);
    expect(same(poly('ship-a', 12_000), poly('ship-a', 16_000))).toBe(false);
  });

  it('two contacts painted on the SAME tick are not twins', () => {
    expect(same(poly('ship-a', 12_000), poly('ship-b', 12_000))).toBe(false);
  });

  it('the seed is a uint32 and is sensitive to both inputs', () => {
    const s = blobSeed('ship-a', 12_000);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
    expect(blobSeed('ship-a', 12_000)).toBe(s);
    expect(blobSeed('ship-b', 12_000)).not.toBe(s);
    expect(blobSeed('ship-a', 12_050)).not.toBe(s);
  });

  it('a huge (epoch-scale) paint time still re-rolls between ticks', () => {
    // Server time is epoch ms, well past 2^31 — the seed truncates to 32 bits,
    // which must not collapse neighbouring ticks onto one shape.
    const t = 1_785_000_000_000;
    expect(blobSeed('ship-a', t)).not.toBe(blobSeed('ship-a', t + 50));
  });
});

// --- the blob states the aspect the wire sent, and no other -----------------

describe('blob geometry carries the aspect extent', () => {
  it('the span PERPENDICULAR to the bearing is the across extent, ± jitter', () => {
    // `ext` is defined perpendicular to the observer→target bearing, so this is
    // the one measurement that ties the drawn blob back to the wire's meaning.
    // Measured with shared's own `perpendicularExtent` — the same primitive the
    // server used to produce the number.
    for (const bearing of [0, 0.7, Math.PI / 2, 2.9, -1.3]) {
      const span = perpendicularExtent(poly('ship-a', 9000, bearing), bearing);
      expect(span).toBeGreaterThanOrEqual(SIZE.across * (1 - O.jitter) - 1e-9);
      expect(span).toBeLessThanOrEqual(SIZE.across * (1 + O.jitter) + 1e-9);
    }
  });

  it('rotating the bearing rotates the SAME blob, it does not reshape it', () => {
    // Same seed + same size at two bearings must be a rigid rotation, or the
    // shimmer would leak a second, bogus channel (which way you are looking).
    const a = poly('ship-a', 9000, 0);
    const b = poly('ship-a', 9000, 1.1);
    const cos = Math.cos(1.1);
    const sin = Math.sin(1.1);
    a.forEach((p, i) => {
      expect(b[i].x).toBeCloseTo(p.x * cos - p.y * sin, 9);
      expect(b[i].y).toBeCloseTo(p.x * sin + p.y * cos, 9);
    });
  });

  it('has the configured vertex count and is irregular, not a clean ellipse', () => {
    const p = poly('ship-a', 9000);
    expect(p).toHaveLength(O.vertices);
    // If the jitter were dropped, opposite vertices would be exact mirrors.
    const half = O.vertices / 2;
    const mirrored = p.every((q, i) => Math.abs(q.x + p[(i + half) % p.length].x) < 1e-9);
    expect(mirrored).toBe(false);
  });
});

// --- AC9: size decreases monotonically with range ---------------------------

describe('range attenuation (ruling R2)', () => {
  it('is exactly 1 at the observer', () => {
    expect(rangeAttenuation(0, RADAR, O)).toBeCloseTo(1, 12);
  });

  it('is STRICTLY decreasing in range, with no clamp flattening it', () => {
    // No two ranges may share a drawn size: size is the return-strength channel
    // and brightness is already spent on age (amendment 64).
    let prev = Infinity;
    for (let d = 0; d <= 4 * RADAR; d += 5) {
      const a = rangeAttenuation(d, RADAR, O);
      expect(a).toBeLessThan(prev);
      prev = a;
    }
  });

  it('approaches the floor from above and never reaches it', () => {
    expect(rangeAttenuation(RADAR * 1000, RADAR, O)).toBeGreaterThan(O.attenFloor);
    expect(rangeAttenuation(RADAR * 1000, RADAR, O)).toBeCloseTo(O.attenFloor, 3);
  });

  it('halves the above-floor part at attenHalfRange × radarRange', () => {
    const a = rangeAttenuation(O.attenHalfRange * RADAR, RADAR, O);
    expect(a - O.attenFloor).toBeCloseTo((1 - O.attenFloor) / 2, 12);
  });

  it('degrades to no attenuation rather than NaN on a zero radar range', () => {
    expect(rangeAttenuation(500, 0, O)).toBe(1);
  });

  it('AC9 — identical aspect at increasing range draws monotonically smaller', () => {
    const ext = 124; // a battleship abeam
    let prev = Infinity;
    for (let d = 0; d <= RADAR; d += 10) {
      const s = echoSize(ext, d, RADAR, O);
      expect(s.across).toBeLessThan(prev);
      prev = s.across;
    }
  });

  it('floors a weak return so it stays drawable, and floors the range depth', () => {
    const s = echoSize(0, RADAR, RADAR, O);
    expect(s.across).toBe(O.minExtent);
    expect(s.along).toBe(Math.max(O.minDepth, O.minExtent * O.depthFrac));
  });
});

// --- the Garmin echo scale (amendment 74) -----------------------------------
//
// Eric, after seeing the monochrome build: *"Lets actually keep the radar sweep
// color green but we'll change the detected entity color to the red/blue/green
// scale like in the garmin radar."* The scale encodes RETURN STRENGTH — the same
// quantity size already carries — so these tests pin two things: that strength
// is that same quantity and no other, and that the ramp walks blue → green →
// yellow → red without doubling back.
//
// Monotonicity is stated on HUE ANGLE, which is what "blue → green → yellow →
// red" actually means: 223° → 152° → 50° → 10°, strictly decreasing. Stating it
// on a channel instead would be wrong — red's blue channel is not below yellow's
// by construction, and a future retune could satisfy a channel test while
// scrambling the perceptual order the ruling names.

/** HSV hue (deg), saturation and value of a packed 0xRRGGBB color. */
function hsv(color: number): { hue: number; sat: number; val: number } {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const c = max - Math.min(r, g, b);
  if (c === 0) return { hue: 0, sat: 0, val: max };
  const h = max === r ? (g - b) / c : max === g ? 2 + (b - r) / c : 4 + (r - g) / c;
  return { hue: (h * 60 + 360) % 360, sat: c / max, val: max };
}

describe('returnStrength — the scale input is the SAME quantity size carries', () => {
  it('is 0 for a zero echo and saturates at strongExtent, point blank', () => {
    expect(returnStrength(0, 0, RADAR, O)).toBe(0);
    expect(returnStrength(O.strongExtent, 0, RADAR, O)).toBeCloseTo(1, 12);
    expect(returnStrength(O.strongExtent * 4, 0, RADAR, O)).toBe(1); // clamped, never > 1
  });

  it('is strictly increasing in aspect extent, up to the clamp', () => {
    let prev = -1;
    for (let ext = 0; ext < O.strongExtent; ext += 1) {
      const s = returnStrength(ext, 300, RADAR, O);
      if (s >= 1) break; // past saturation the clamp is allowed to flatten
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('is strictly decreasing in range — the far half of the same hull is weaker', () => {
    let prev = Infinity;
    for (let d = 0; d <= 4 * RADAR; d += 5) {
      const s = returnStrength(40, d, RADAR, O);
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });

  it('rides EXACTLY the attenuation curve size rides — one quantity, two readings', () => {
    // If this ever diverges, the scope has started saying two different things
    // about one echo. `minExtent` is deliberately NOT applied here: that floor is
    // a drawability clamp, and folding it in would flatten hue as well as size.
    for (const d of [0, 120, 400, RADAR]) {
      expect(returnStrength(50, d, RADAR, O)).toBeCloseTo(
        (50 * rangeAttenuation(d, RADAR, O)) / O.strongExtent,
        12,
      );
    }
  });

  it('degrades to full strength rather than Infinity on a zero strongExtent', () => {
    expect(returnStrength(50, 100, RADAR, { ...O, strongExtent: 0 })).toBe(1);
  });
});

describe('echoColor — blue → green → yellow → red, monotone in hue', () => {
  const RAMP = O.ramp;

  it('returns the ENDPOINT colors at strength 0 and 1', () => {
    expect(echoColor(0, RAMP)).toBe(CLIENT_CONFIG.colors.echoWeak);
    expect(echoColor(1, RAMP)).toBe(CLIENT_CONFIG.colors.echoHot);
  });

  it('clamps outside [0,1] instead of extrapolating off the ends', () => {
    expect(echoColor(-5, RAMP)).toBe(echoColor(0, RAMP));
    expect(echoColor(5, RAMP)).toBe(echoColor(1, RAMP));
    expect(echoColor(Number.NaN, RAMP)).toBe(echoColor(0, RAMP)); // clamp01 folds NaN to 0
  });

  it('lands each stop exactly on its token, green included', () => {
    for (const stop of RAMP) expect(echoColor(stop.at, RAMP)).toBe(stop.color);
    // The middle stop IS the scope's own green — the scale runs through it.
    expect(RAMP.some((s) => s.color === CLIENT_CONFIG.colors.phosphor)).toBe(true);
  });

  it('is a PURE function — same strength, same color, no hidden state', () => {
    for (const s of [0, 0.13, 0.5, 0.77, 1]) {
      expect(echoColor(s, RAMP)).toBe(echoColor(s, RAMP));
    }
  });

  it('walks hue STRICTLY DOWN from blue to red across the whole scale', () => {
    // 223° (blue) → 152° (phosphor green) → 50° (yellow) → 10° (red), with no
    // reversal anywhere between: a doubling-back ramp would make two different
    // strengths paint the same hue, the exact collision size already avoids.
    // 200 samples: the ramp is quantized to 8-bit channels, so a MUCH finer
    // walk (1000+) shows sub-0.15° rounding wiggle that is not a direction
    // change. 200 steps is well clear of that and still ~40 samples per segment.
    let prev = Infinity;
    for (let i = 0; i <= 200; i++) {
      const h = hsv(echoColor(i / 200, RAMP)).hue;
      expect(h).toBeLessThanOrEqual(prev);
      prev = h;
    }
    expect(hsv(echoColor(0, RAMP)).hue).toBeGreaterThan(180); // blue end
    expect(hsv(echoColor(1, RAMP)).hue).toBeLessThan(30); // red end
    expect(hsv(echoColor(0.4, RAMP)).hue).toBeCloseTo(hsv(CLIENT_CONFIG.colors.phosphor).hue, 6);
  });

  it('stays saturated and legible at EVERY strength — no muddy midpoint', () => {
    // A mark that desaturates mid-ramp would read as the near-grey `sp` splash
    // (DESIGN.md:145, "a phosphor-ish splash is a fake blip"), and one that goes
    // dark would spend brightness — which is the AGE channel, not strength.
    for (let i = 0; i <= 200; i++) {
      const { sat, val } = hsv(echoColor(i / 200, RAMP));
      expect(sat).toBeGreaterThan(0.6);
      expect(val).toBeGreaterThan(0.7);
    }
  });

  it('answers on a degenerate ramp: one stop, and stops sharing an `at`', () => {
    const one = [{ at: 0.5, color: CLIENT_CONFIG.colors.phosphor }];
    expect(echoColor(0, one)).toBe(CLIENT_CONFIG.colors.phosphor);
    expect(echoColor(1, one)).toBe(CLIENT_CONFIG.colors.phosphor);
    const tied = [
      { at: 0, color: CLIENT_CONFIG.colors.echoWeak },
      { at: 0, color: CLIENT_CONFIG.colors.echoHot },
    ];
    expect(echoColor(0.5, tied)).toBe(CLIENT_CONFIG.colors.echoHot); // last wins, no NaN lerp
  });

  it('a coast sample lands mid-scale and a broadside battleship at the top', () => {
    // Amendment 74: coast returns take the SAME scale, which is why a real plate
    // is mostly green coastline with red where the shore is closest.
    const coast = returnStrength(ISL.arcStepU * ISL.extFactor, 300, RADAR, O);
    expect(hsv(echoColor(coast, O.ramp)).hue).toBeLessThan(200); // off the blue end
    expect(hsv(echoColor(coast, O.ramp)).hue).toBeGreaterThan(60); // and short of yellow
    expect(returnStrength(124, 200, RADAR, O)).toBe(1); // battleship abeam: hot
  });
});

// --- sweep crossing ---------------------------------------------------------

describe('sweepCrossed', () => {
  it('is half-open in the direction of travel, so a bearing paints once', () => {
    expect(sweepCrossed(1.0, 1.2, 1.2)).toBe(true); // the closing edge paints
    expect(sweepCrossed(1.0, 1.2, 1.0)).toBe(false); // the opening edge already did
    expect(sweepCrossed(1.0, 1.2, 1.1)).toBe(true);
    expect(sweepCrossed(1.0, 1.2, 1.3)).toBe(false);
  });

  it('wraps through 0 without missing a crossing', () => {
    expect(sweepCrossed(6.2, 0.1, 0)).toBe(true);
    expect(sweepCrossed(6.2, 0.1, 6.25)).toBe(true);
    expect(sweepCrossed(6.2, 0.1, 3.0)).toBe(false);
  });

  it('a zero-width advance crosses nothing (a stalled clock cannot stack marks)', () => {
    expect(sweepCrossed(2.0, 2.0, 2.0)).toBe(false);
    expect(sweepCrossed(2.0, 2.0, 1.0)).toBe(false);
  });
});

// --- AC10: island returns paint the near arc only ---------------------------

const ISLAND: Circle = { x: 300, y: 0, r: 80 };
const OBSERVER: Vec2 = { x: 0, y: 0 };

describe('island near-arc sampling (amendment 69, ruling R4)', () => {
  it('AC10 — every sample is strictly nearer the observer than the centre is', () => {
    // The near-arc guarantee, stated geometrically: a point behind the island
    // is by definition farther from the observer than the island's own centre.
    const centreDist = Math.hypot(ISLAND.x, ISLAND.y);
    const marks = nearArcSamples(ISLAND, OBSERVER, ISL);
    expect(marks.length).toBeGreaterThan(1);
    for (const m of marks) {
      expect(Math.hypot(m.x - OBSERVER.x, m.y - OBSERVER.y)).toBeLessThan(centreDist);
      expect(m.dist).toBeLessThan(centreDist);
    }
  });

  it('samples sit on the island circle and inside the tangent horizon', () => {
    const half = Math.acos(ISLAND.r / Math.hypot(ISLAND.x, ISLAND.y));
    for (const m of nearArcSamples(ISLAND, OBSERVER, ISL)) {
      expect(Math.hypot(m.x - ISLAND.x, m.y - ISLAND.y)).toBeCloseTo(ISLAND.r, 9);
      // Angle off the centre→observer direction, which here is exactly π.
      const th = Math.atan2(m.y - ISLAND.y, m.x - ISLAND.x);
      expect(Math.abs(Math.abs(th) - Math.PI)).toBeLessThan(half);
    }
  });

  it('sampling holds from every quarter of the compass', () => {
    const centre = { x: -220, y: 410, r: 65 };
    for (const obs of [
      { x: 0, y: 0 },
      { x: -600, y: 400 },
      { x: -220, y: -100 },
      { x: -220, y: 900 },
    ]) {
      const d = Math.hypot(centre.x - obs.x, centre.y - obs.y);
      for (const m of nearArcSamples(centre, obs, ISL)) {
        expect(Math.hypot(m.x - obs.x, m.y - obs.y)).toBeLessThan(d);
      }
    }
  });

  it('gives every sample its own stable key, so coast marks cap per sample', () => {
    const keys = nearArcSamples(ISLAND, OBSERVER, ISL).map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(nearArcSamples(ISLAND, OBSERVER, ISL).map((m) => m.key)).toEqual(keys);
  });

  it('respects the per-island sample cap', () => {
    const huge: Circle = { x: 400, y: 0, r: 390 };
    expect(nearArcSamples(huge, OBSERVER, ISL).length).toBeLessThanOrEqual(ISL.maxSamples);
  });

  it('paints nothing when the observer is inside the island', () => {
    expect(nearArcSamples({ x: 10, y: 0, r: 80 }, OBSERVER, ISL)).toEqual([]);
  });
});

describe('islandReturns gating', () => {
  /** A beam advance that sweeps the whole island span in one step. */
  const wide = (): [number, number] => [-1.0, 1.0];

  it('emits marks when the beam crosses the island, and only near-arc ones', () => {
    const [from, to] = wide();
    const centreDist = Math.hypot(ISLAND.x, ISLAND.y);
    const marks = islandReturns(ISLAND, [ISLAND], OBSERVER, from, to, RADAR, ISL);
    expect(marks.length).toBeGreaterThan(1);
    for (const m of marks) expect(m.dist).toBeLessThan(centreDist);
  });

  it('emits nothing while the beam is elsewhere', () => {
    expect(islandReturns(ISLAND, [ISLAND], OBSERVER, 2.0, 2.1, RADAR, ISL)).toEqual([]);
  });

  it('emits nothing beyond radar range — the NEAREST point is what counts', () => {
    const far: Circle = { x: RADAR + 200, y: 0, r: 80 };
    const near: Circle = { x: RADAR + 40, y: 0, r: 80 }; // centre out, coast in
    const [from, to] = wide();
    expect(islandReturns(far, [far], OBSERVER, from, to, RADAR, ISL)).toEqual([]);
    expect(islandReturns(near, [near], OBSERVER, from, to, RADAR, ISL).length).toBeGreaterThan(0);
  });

  it('emits nothing when the observer is aground inside the island', () => {
    const [from, to] = wide();
    const aground: Circle = { x: 10, y: 0, r: 80 };
    expect(islandReturns(aground, [aground], OBSERVER, from, to, RADAR, ISL)).toEqual([]);
  });

  // --- ISLANDS SHADOW EACH OTHER (Eric ruling 2026-08-02) -------------------
  // The near-arc horizon only handles an island's shadow of ITSELF. A second
  // island in front is the SAME rule and was unenforced: a coast mark a ship
  // could not blip from (server/src/game/signals.ts:losClear rejects it) must
  // not paint either, or terrain would see through what hulls cannot.

  it('a coast hidden behind another island is SHADOW, not a return', () => {
    const front: Circle = { x: 300, y: 0, r: 80 };
    const behind: Circle = { x: 700, y: 0, r: 60 }; // wholly inside front's shadow
    const [from, to] = wide();
    // Alone, the beam reaches it and it paints — so the field is what decides.
    const alone = islandReturns(behind, [behind], OBSERVER, from, to, RADAR, ISL);
    expect(alone.length).toBeGreaterThan(0);
    // And every one of those sightlines runs straight through `front`.
    for (const m of alone) expect(segCircleHit(OBSERVER, m, front, front.r)).not.toBeNull();
    expect(islandReturns(behind, [front, behind], OBSERVER, from, to, RADAR, ISL)).toEqual([]);
  });

  it('shadows only the samples actually blocked — a partial occluder is partial', () => {
    const front: Circle = { x: 300, y: 0, r: 40 };
    const behind: Circle = { x: 700, y: 0, r: 200 }; // subtends far wider than front
    const [from, to] = wide();
    const alone = islandReturns(behind, [behind], OBSERVER, from, to, RADAR, ISL);
    const shadowed = islandReturns(behind, [front, behind], OBSERVER, from, to, RADAR, ISL);
    expect(shadowed.length).toBeGreaterThan(0); // the flanks are still in the clear
    expect(shadowed.length).toBeLessThan(alone.length); // the middle is not
    for (const m of shadowed) expect(segCircleHit(OBSERVER, m, front, front.r)).toBeNull();
  });

  it('an island never occludes ITSELF — its own near arc IS the return', () => {
    // Every near-arc sample sits exactly ON the island circle, where the LOS
    // primitive reports a touch. Excluding `self` by identity is what keeps the
    // whole feature from cancelling itself out.
    const [from, to] = wide();
    expect(islandReturns(ISLAND, [ISLAND], OBSERVER, from, to, RADAR, ISL).length)
      .toBeGreaterThan(1);
  });

  // --- RANGE IS PER SAMPLE, NOT PER ISLAND ----------------------------------

  it('never paints a mark outside the radar ring, even when the island is inside', () => {
    // The island gate uses the NEAREST point, but the near arc reaches out to
    // the tangents at sqrt(d² − r²) — which here is 692u against a 660u ring.
    // Ship paints are hard-gated to the annulus; terrain leaking past the drawn
    // ring is a visible contradiction.
    const isl: Circle = { x: 700, y: 0, r: 100 };
    const [from, to] = wide();
    expect(isl.r + RADAR).toBeGreaterThan(700); // the island itself is in range
    const overRange = nearArcSamples(isl, OBSERVER, ISL).filter((m) => m.dist > RADAR);
    expect(overRange.length).toBeGreaterThan(0); // the leak is reachable at all
    for (const m of islandReturns(isl, [isl], OBSERVER, from, to, RADAR, ISL)) {
      expect(m.dist).toBeLessThanOrEqual(RADAR);
    }
  });

  it('a narrow advance paints only the slice it crossed, and paints all of it '
    + 'across one revolution', () => {
    // Progressive paint: the coast lights up as the beam walks it, and no
    // sample is skipped or double-counted across a full turn.
    const all = nearArcSamples(ISLAND, OBSERVER, ISL).length;
    const seen = new Set<string>();
    const step = 0.02;
    for (let i = 0; i < Math.ceil((2 * Math.PI) / step); i++) {
      const from = i * step;
      const got = islandReturns(ISLAND, [ISLAND], OBSERVER, from, from + step, RADAR, ISL);
      expect(got.length).toBeLessThan(all); // never the whole island at once
      for (const m of got) {
        expect(seen.has(m.key)).toBe(false);
        seen.add(m.key);
      }
    }
    expect(seen.size).toBe(all);
  });
});

// --- AC11: the default grammar is untouched ---------------------------------

describe('AC11 — `silhouette` stays the default and stays whole', () => {
  it('a fresh game state defaults to the shipped grammar and identity', () => {
    const s = createGameState('sess-1');
    expect(s.radarGrammar).toBe('silhouette');
    expect(s.radarIdentity).toBe('roster');
  });

  it('radarModes reads the welcome, and falls back SAFE on anything else', () => {
    const base = { radarGrammar: 'return', radarIdentity: 'pseudonym' };
    expect(radarModes(base as never)).toEqual({ grammar: 'return', identity: 'pseudonym' });
    // Absent / unrecognized values resolve to today's behavior — fail-safe,
    // never fail-open, the same posture the server takes on its env vars.
    expect(radarModes({} as never)).toEqual({ grammar: 'silhouette', identity: 'roster' });
    expect(radarModes({ radarGrammar: 'blob', radarIdentity: 'anon' } as never)).toEqual({
      grammar: 'silhouette',
      identity: 'roster',
    });
  });

  it('the grey-cooling knobs are still present and unchanged', () => {
    // `blipCool`/`coolFloor` exist because hue is an information channel — the
    // owner's color under `silhouette`, and (amendment 74) the Garmin strength
    // color under `return`. BOTH grammars cool through them now; nothing here
    // may be deleted on the theory that one of them is monochrome.
    expect(CLIENT_CONFIG.blip.coolFloor).toBe(0.55);
    expect(CLIENT_CONFIG.blip.assistCoolFloor).toBe(0.85);
    expect(CLIENT_CONFIG.blip.lumaFloor).toBe(0.3);
    expect(CLIENT_CONFIG.blip.assistLumaFloor).toBe(0.45);
    expect(CLIENT_CONFIG.blip.vector.seconds).toBe(1.5);
  });

  it('persistence is untouched — it IS the course channel in `return` mode', () => {
    // Amendment 72: retuning these is a deliberate post-playtest job, not a
    // guess made in-cycle.
    expect(CLIENT_CONFIG.blip.persistSweeps).toBe(3);
    expect(CLIENT_CONFIG.blip.paintsPerContact).toBe(3);
  });
});
