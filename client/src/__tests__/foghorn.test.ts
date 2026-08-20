// THE FOGHORN CHEVRON (render/foghorn.ts) — the pure core the Pixi adapter
// animates: the band→gain table, the band→weight table, the bearing→screen
// placement, the TTL fade, the motion-scaled pop, and the spectator bearing.
//
// Four things in here are CONTRACT, not coverage:
//   • THE EDGE CONVENTION. The camera has no rotation and no y-flip
//     (camera.ts worldToScreen is a pure scale-and-translate; ships.ts:17 states
//     the same fact), so a world bearing IS the screen direction: 0 = right,
//     π/2 = DOWN, π = left, 3π/2 = UP. Every cardinal is pinned below, because
//     the single most likely way this feature ships broken is a y-flip that
//     points every chevron at the wrong horizon — and nothing else in the game
//     would catch it.
//   • `motion: 'off'` must remove MOTION and never INFORMATION (the ratified
//     house rule, effects.ts:44-53; UX-DR36 via amendment 55). PRESENCE,
//     DIRECTION and BAND WEIGHT survive intact; only the pop-in scale goes.
//   • THE MARK OUTLIVES THE SOUND (amendment 56). The audio mix drops honks at
//     its concurrency cap; the chevron never rides on that.
//   • THE CAP IS GLOBAL ONLY. Amendment 51 applies amendment 45's rule — no
//     correlation handle on the wire — so marks cannot be grouped by source and
//     no per-source cap can exist. There is deliberately no key here to test.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, type FoghornEvent } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  Foghorn,
  bearingTo,
  chevronAlpha,
  chevronPoint,
  chevronPop,
  chevronWeight,
  bandGain,
  type HornBand,
} from '../render/foghorn.js';
import { FLASH_ELEMENTS, createFlashBudget, type FlashBudget, type FlashVerdict } from '../render/flashBudget.js';
import { isFogImmuneEffect, isJuiceEffect, effectPeakAlpha } from '../render/effects.js';
import { bindRoom, type RoomBindingDeps } from '../net/roomBindings.js';
import type { Connection } from '../net/connection.js';
import { motionIntensity, settings } from '../settings/store.js';

const F = CLIENT_CONFIG.foghorn;
const CH = F.chevron;
const TTL = CH.ttlMs;
const W = 1366;
const H = 768;
const TAU = Math.PI * 2;

// main.ts boots the whole app at module load (main().catch(...) at the bottom)
// and is never imported by any test for exactly that reason — importing it
// here would run the real Pixi/DOM boot sequence. `handleFoghornPress` is a
// small, module-private function inside it, so the "denied is silent" review
// fix below is pinned by reading the SOURCE, the same technique tokens.test.ts
// uses for its guard scan. vitest's root is the client workspace dir, so
// process.cwd() === client/.
const MAIN_TS = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

// --- the cooldown is single-sourced from shared CONFIG (amendment 41) --------

describe('the foghorn cooldown is NOT copied client-side', () => {
  it('CLIENT_CONFIG.foghorn carries no cooldown of its own', () => {
    // The `damageBands` precedent: exactly one copy of a gameplay number may
    // exist. main.ts reads CONFIG.foghorn.cooldownMs straight from shared, so a
    // retune moves the client's wire-spam guard with the server's gate. A
    // `cooldownMs` key appearing here is the regression this pins.
    expect(Object.keys(F)).not.toContain('cooldownMs');
    expect(JSON.stringify(F)).not.toContain(String(CONFIG.foghorn.cooldownMs));
  });

  it('leaves the shared cadence byte-identical to its ruled value', () => {
    expect(CONFIG.foghorn.cooldownMs).toBe(1500); // Eric ruling, amendment 56
  });
});

// --- band → gain (THE EIGHTHS LADDER, amendment 122) -------------------------
//
// The wire's `v` is which EIGHTH of the LISTENER's own intel range the honker
// sits in — server-resolved, already muffled for islands. The client looks it
// up and plays; it never recomputes a band, a distance or a range.

/** Every band, in order — the one place the 1..8 domain is written down. */
const BANDS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly HornBand[];

describe('bandGain — the eighths ladder, both of Eric’s anchors intact', () => {
  it('is FLAT AT FULL VOLUME through band 4 (truesight at base stats)', () => {
    // Eric's original foghorn ruling: *"within truesight range at full
    // volume"*. Band 4 IS truesight (330u at base), so the whole plateau plays
    // at 1 — four bands, not one.
    for (const v of [1, 2, 3, 4] as const) expect(bandGain(v)).toBe(1);
  });

  it('steps down one eighth of the 100→50% span per band to the radar edge', () => {
    expect(bandGain(5)).toBe(0.875);
    expect(bandGain(6)).toBe(0.75);
    expect(bandGain(7)).toBe(0.625);
    expect(bandGain(8)).toBe(0.5); // the second anchor: 50% at 660u
  });

  it('covers all eight bands with a finite, audible gain', () => {
    for (const v of BANDS) {
      expect(Number.isFinite(bandGain(v))).toBe(true);
      expect(bandGain(v)).toBeGreaterThan(0); // an audible band is audible
      expect(bandGain(v)).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonically quieter with distance — a farther honk is never louder', () => {
    for (let i = 1; i < BANDS.length; i++) {
      expect(bandGain(BANDS[i])).toBeLessThanOrEqual(bandGain(BANDS[i - 1]));
    }
  });

  it('takes even steps across the falloff half — no band is a cliff', () => {
    const steps = [4, 5, 6, 7].map((b) => bandGain(b as HornBand) - bandGain((b + 1) as HornBand));
    for (const s of steps) expect(s).toBeCloseTo(steps[0], 9);
  });

  it('resolves an ABSENT band to full gain (the self + spectator shapes)', () => {
    // Neither carries a `v`: the honker IS the honk and a spectator is
    // omniscient. Silence would be the one wrong answer.
    expect(bandGain(undefined)).toBe(1);
  });

  it('falls back to the QUIETEST band for an OUT-OF-DOMAIN value, never to full gain (review fix)', () => {
    // `undefined` is the self/spectator path and keeps full gain above. A number
    // OUTSIDE 1..8 is something else entirely: the least trustworthy input the
    // channel can carry, so the fallback must be the least salient answer, not
    // the loudest one. Failing LOUD while the docblock claimed a closed failure
    // is what this pins.
    for (const bad of [0, 9, -1, 99, 1.5, NaN, Infinity] as unknown as HornBand[]) {
      expect(bandGain(bad)).toBe(bandGain(8));
    }
  });

  it('carries no reach knob — who hears what is resolved server-side', () => {
    // Amendment 122: the band is which eighth of the LISTENER's own intel range
    // the honker sits in, resolved server-side and arriving pre-decided as `v`.
    // A distance or radius here would be a second, forkable authority.
    const keys = JSON.stringify(F).toLowerCase();
    expect(keys).not.toContain('range');
    expect(keys).not.toContain('reach');
  });
});

// --- band → chevron weight ---------------------------------------------------

describe('chevronWeight — the visual twin rides the SAME band curve', () => {
  // TODAY'S SHIPPED LOOK, verbatim. These two literals are the anchors the
  // eighths rebase had to preserve: the old tier-1 weight and the old tier-3
  // weight. Written out rather than read from config so a config retune that
  // moved the look would FAIL here instead of quietly agreeing with itself.
  const SHIPPED_LOUD = { size: 22, thickness: 3, alpha: 0.95 };
  const SHIPPED_FAINT = { size: 13, thickness: 1.8, alpha: 0.5 };

  it('keeps bands 1-4 at TODAY’s tier-1 weight, exactly', () => {
    for (const v of [1, 2, 3, 4] as const) expect(chevronWeight(v)).toEqual(SHIPPED_LOUD);
  });

  it('keeps band 8 at TODAY’s tier-3 weight, exactly', () => {
    expect(chevronWeight(8)).toEqual(SHIPPED_FAINT);
  });

  it('interpolates 5/6/7 between the anchors on the gain curve’s own fractions', () => {
    // k = (band - 4) / 4 — the same fractions bandGain steps on, so the mark's
    // weight and the honk's loudness move together.
    for (const v of [5, 6, 7] as const) {
      const k = (v - 4) / 4;
      const w = chevronWeight(v);
      expect(w.size).toBeCloseTo(SHIPPED_LOUD.size + (SHIPPED_FAINT.size - SHIPPED_LOUD.size) * k, 9);
      expect(w.thickness).toBeCloseTo(
        SHIPPED_LOUD.thickness + (SHIPPED_FAINT.thickness - SHIPPED_LOUD.thickness) * k,
        9,
      );
      expect(w.alpha).toBeCloseTo(SHIPPED_LOUD.alpha + (SHIPPED_FAINT.alpha - SHIPPED_LOUD.alpha) * k, 9);
    }
  });

  it('never gets heavier with distance, and separates once the falloff starts', () => {
    for (let i = 1; i < BANDS.length; i++) {
      const near = chevronWeight(BANDS[i - 1]);
      const far = chevronWeight(BANDS[i]);
      expect(far.size).toBeLessThanOrEqual(near.size);
      expect(far.thickness).toBeLessThanOrEqual(near.thickness);
      expect(far.alpha).toBeLessThanOrEqual(near.alpha);
    }
    // Past the plateau every one of the three channels genuinely moves, so the
    // volume survives a colorblind read (the wounded-smoke rule).
    for (const v of [5, 6, 7, 8] as const) {
      expect(chevronWeight(v).size).toBeLessThan(chevronWeight((v - 1) as HornBand).size);
      expect(chevronWeight(v).thickness).toBeLessThan(chevronWeight((v - 1) as HornBand).thickness);
      expect(chevronWeight(v).alpha).toBeLessThan(chevronWeight((v - 1) as HornBand).alpha);
    }
  });

  it('keeps every band visible — the quietest one still draws', () => {
    for (const v of BANDS) {
      expect(chevronWeight(v).alpha).toBeGreaterThan(0);
      expect(chevronWeight(v).size).toBeGreaterThan(0);
      expect(chevronWeight(v).thickness).toBeGreaterThan(0);
    }
  });

  it('draws an absent band (the spectator shape) at full weight', () => {
    expect(chevronWeight(undefined)).toEqual(chevronWeight(1));
  });

  it('carries no identity channel of any kind', () => {
    // Amendment 51: no id, no hue, no class, no correlation handle. The band
    // table decides WEIGHT and nothing else; hue is one constant for all eight.
    for (const v of BANDS) {
      expect(Object.keys(chevronWeight(v)).sort()).toEqual(['alpha', 'size', 'thickness']);
    }
  });

  it('is a THREE-value read no longer — the tier vocabulary is gone', () => {
    // The regression this pins: a client that still keys a 1|2|3 enum would
    // resolve bands 4-8 to `undefined` and draw them all at full weight.
    expect(Object.keys(CH.bands).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(Object.keys(F.bandGain).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(F).not.toHaveProperty('tierGain');
    expect(CH).not.toHaveProperty('tiers');
  });

  // REVIEW FIX — FAIL CLOSED, NEVER `undefined`. `bandGain` has always guarded
  // with `?? 1`; `chevronWeight` did not, so ANY value outside 1..8 came back
  // undefined and `drawChevron` then threw on `w.size` — a render-loop crash
  // triggered by one malformed field. No honest current server can send one
  // (hornBandFor now fails closed on its side too), which is exactly why this
  // side must degrade rather than throw: the two guards are independent.
  it('resolves an OUT-OF-DOMAIN band to a valid weight rather than undefined', () => {
    for (const bad of [0, 9, -1, 99, 1.5, NaN, Infinity] as unknown as HornBand[]) {
      const w = chevronWeight(bad);
      expect(w).toBeDefined();
      expect(Object.keys(w).sort()).toEqual(['alpha', 'size', 'thickness']);
      expect(w.size).toBeGreaterThan(0);
      expect(w.thickness).toBeGreaterThan(0);
      expect(w.alpha).toBeGreaterThan(0);
      // ...and it is the FAINTEST band, not the loudest (review fix): an
      // out-of-domain value is the least trustworthy input the row carries, so
      // it must not be drawn at maximum salience. `undefined` — the honest
      // self/spectator shape — keeps its full weight, tested above.
      expect(w).toEqual(chevronWeight(8));
    }
  });

  it('the ADAPTER survives one too — an out-of-domain band draws a chevron instead of throwing', () => {
    const fh = new Foghorn(new Container());
    expect(() => fh.onHonk(0, 99 as HornBand, 0)).not.toThrow();
    expect(fh.liveMarks).toBe(1); // the mark still lands: information, not juice
  });
});

// --- THE EDGE CONVENTION -----------------------------------------------------

describe('chevronPoint — world bearing IS the screen direction (no y-flip)', () => {
  const inset = CH.insetPx;
  const cx = W / 2;
  const cy = H / 2;
  // This suite pins bearing->direction with the origin AT the viewport centre
  // — the one case where the pre-review-fix centre-anchored code and the
  // current explicit-origin code must agree bit for bit. The off-centre
  // origin behavior (the review fix itself) gets its own suite below.
  const at = (bearing: number, sw = W, sh = H, ins = inset) => chevronPoint(bearing, sw / 2, sh / 2, sw, sh, ins);

  it('puts bearing 0 on the RIGHT edge, vertically centred', () => {
    const p = at(0);
    expect(p.x).toBeCloseTo(W - inset, 6);
    expect(p.y).toBeCloseTo(cy, 6);
  });

  it('puts bearing π/2 on the BOTTOM edge — screen +y is DOWN, and so is world +y', () => {
    const p = at(Math.PI / 2);
    expect(p.x).toBeCloseTo(cx, 6);
    expect(p.y).toBeCloseTo(H - inset, 6);
  });

  it('puts bearing π on the LEFT edge', () => {
    const p = at(Math.PI);
    expect(p.x).toBeCloseTo(inset, 6);
    expect(p.y).toBeCloseTo(cy, 6);
  });

  it('puts bearing 3π/2 on the TOP edge', () => {
    const p = at((3 * Math.PI) / 2);
    expect(p.x).toBeCloseTo(cx, 6);
    expect(p.y).toBeCloseTo(inset, 6);
  });

  it('agrees with the camera transform: a honker due SOUTH-in-world plots DOWN-screen', () => {
    // The independent re-derivation. camera.worldToScreen is
    // (world - center) * zoom + screenCenter with no rotation term, so a honker
    // at +y in world space is at +y on screen. If chevronPoint ever disagreed
    // with that, every bearing in the game would point at the wrong horizon.
    const b = bearingTo(0, 0, 0, 500); // straight "down" in world coords
    const p = at(b);
    expect(p.y).toBeGreaterThan(cy);
    expect(p.x).toBeCloseTo(cx, 6);
  });

  it('never leaves the inset rectangle, for any bearing', () => {
    for (let i = 0; i < 64; i++) {
      const p = at((i / 64) * TAU);
      expect(p.x).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W - inset + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(inset - 1e-6);
      expect(p.y).toBeLessThanOrEqual(H - inset + 1e-6);
    }
  });

  it('touches an edge for every bearing — the mark is PINNED, never floating', () => {
    for (let i = 0; i < 64; i++) {
      const p = at((i / 64) * TAU);
      const onEdge =
        Math.min(Math.abs(p.x - inset), Math.abs(p.x - (W - inset))) < 1e-6 ||
        Math.min(Math.abs(p.y - inset), Math.abs(p.y - (H - inset))) < 1e-6;
      expect(onEdge).toBe(true);
    }
  });

  it('is translational under a viewport change (the mark tracks the real edge)', () => {
    const a = at(0);
    const b = at(0, W * 2, H);
    expect(b.x - a.x).toBeCloseTo(W, 6);
  });

  it('collapses to the centre rather than inverting on a viewport smaller than the inset', () => {
    const p = at(0, 40, 40);
    expect(p.x).toBeCloseTo(20, 6);
    expect(p.y).toBeCloseTo(20, 6);
  });

  it('holds the centre for a non-finite bearing instead of producing NaN coordinates', () => {
    const p = at(Number.NaN);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

// --- THE OBSERVER ORIGIN (review fix) ----------------------------------------
//
// The ray must originate at the point the bearing was actually measured FROM
// — the caller's own hull on screen while alive, since the camera's forward
// lead (up to 110u, camera.ts leadOffset) pushes the hull off screen centre.
// The pre-fix code always cast from the viewport centre regardless, so the
// mark's edge position disagreed with the exact bearing its own rotation drew
// whenever the origin was not the centre.

describe('chevronPoint — the ray originates at an explicit OBSERVER origin (review fix)', () => {
  const inset = CH.insetPx;

  it('a due-EAST bearing from an origin well LEFT of centre lands on the right edge AT THE ORIGIN\'S OWN Y — not viewport mid-height', () => {
    const originX = 200; // well left of W/2 (683)
    const originY = 100; // far from H/2 (384) — the centre-anchored bug would land here instead
    const p = chevronPoint(0, originX, originY, W, H, inset);
    expect(p.x).toBeCloseTo(W - inset, 6);
    expect(p.y).toBeCloseTo(originY, 6);
    expect(p.y).not.toBeCloseTo(H / 2, 1);
  });

  it('a due-SOUTH bearing from an origin inside the rect lands on the bottom edge AT THE ORIGIN\'S OWN X', () => {
    const originX = 300;
    const originY = 100;
    const p = chevronPoint(Math.PI / 2, originX, originY, W, H, inset);
    expect(p.y).toBeCloseTo(H - inset, 6);
    expect(p.x).toBeCloseTo(originX, 6);
  });

  it('an origin OUTSIDE the inset rectangle entirely still lands the mark ON the rectangle — never NaN, never off the viewport', () => {
    // Own hull off-screen at extreme zoom: origin sits left of the whole
    // viewport, bearing due east (back toward the visible screen).
    const originX = -500;
    const originY = H / 2;
    const p = chevronPoint(0, originX, originY, W, H, inset);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(W);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(H);
    // Specifically: the LEFT inset edge is the first boundary the ray crosses
    // moving rightward from off-screen — not the centre, and not the far edge.
    expect(p.x).toBeCloseTo(inset, 6);
    expect(p.y).toBeCloseTo(H / 2, 6);
  });

  it('an off-rectangle origin whose bearing points AWAY from the rect collapses to the viewport centre, never NaN', () => {
    const originX = -500;
    const originY = H / 2;
    const p = chevronPoint(Math.PI, originX, originY, W, H, inset); // due WEST — further off-screen
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeCloseTo(W / 2, 6);
    expect(p.y).toBeCloseTo(H / 2, 6);
  });

  it('a non-finite origin holds the centre instead of poisoning the point with NaN', () => {
    const p = chevronPoint(0, Number.NaN, 100, W, H, inset);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});

// --- bearingTo (the spectator path) -----------------------------------------

describe('bearingTo — the spectator derives what the server would not send', () => {
  it('returns wrapPositive [0, 2π) bearings for the four cardinals', () => {
    expect(bearingTo(0, 0, 10, 0)).toBeCloseTo(0, 9);
    expect(bearingTo(0, 0, 0, 10)).toBeCloseTo(Math.PI / 2, 9);
    expect(bearingTo(0, 0, -10, 0)).toBeCloseTo(Math.PI, 9);
    expect(bearingTo(0, 0, 0, -10)).toBeCloseTo((3 * Math.PI) / 2, 9); // never negative
  });

  it('is taken FROM the observation point, not from the origin', () => {
    expect(bearingTo(100, 100, 200, 100)).toBeCloseTo(0, 9);
    expect(bearingTo(100, 100, 0, 100)).toBeCloseTo(Math.PI, 9);
  });

  it('is range-free — doubling the distance does not move the bearing', () => {
    expect(bearingTo(0, 0, 10, 10)).toBeCloseTo(bearingTo(0, 0, 400, 400), 9);
  });
});

// --- the TTL fade ------------------------------------------------------------

describe('chevronAlpha — a bearing is a fact with an expiry', () => {
  it('is dead at exactly one TTL and beyond', () => {
    expect(chevronAlpha(TTL, 1)).toBe(0);
    expect(chevronAlpha(TTL * 5, 1)).toBe(0);
  });

  it('starts at the band peak and decays monotonically — a honk never re-brightens', () => {
    expect(chevronAlpha(0, 0.9)).toBeCloseTo(0.9, 9);
    let prev = Infinity;
    for (let age = 0; age < TTL; age += TTL / 20) {
      const a = chevronAlpha(age, 0.9);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      prev = a;
    }
  });

  it('scales linearly with the band peak and never exceeds it', () => {
    expect(chevronAlpha(TTL / 2, 1)).toBeCloseTo(0.5, 9);
    expect(chevronAlpha(TTL / 2, 0.5)).toBeCloseTo(0.25, 9);
    for (let age = 0; age <= TTL; age += TTL / 10) {
      expect(chevronAlpha(age, 0.5)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('treats a negative age (clock jitter) as FULL, not as a pop', () => {
    // The phosphor.ts blipAlpha resolution, not smoke.ts's: a chevron has no
    // bloom-in ramp, so "newborn" and "full" coincide and there is no
    // discontinuity at the origin to protect against.
    expect(chevronAlpha(-40, 0.9)).toBeCloseTo(0.9, 9);
  });

  it('lasts the ~1.2s amendment 55 named — long enough to look, short enough to expire', () => {
    expect(TTL).toBeGreaterThanOrEqual(1000);
    expect(TTL).toBeLessThanOrEqual(1600);
    // ...and it must expire well inside the honk cooldown's SECOND honk, or
    // marks from one captain would visibly stack into a track.
    expect(TTL).toBeLessThan(CONFIG.foghorn.cooldownMs * 2);
  });
});

// --- the pop is the only motion channel --------------------------------------

describe('chevronPop — the one animated flourish', () => {
  it('is exactly 1 at motion=off, from the very first frame', () => {
    for (const age of [0, 20, CH.popMs / 2, CH.popMs, TTL]) {
      expect(chevronPop(age, 0)).toBe(1);
    }
  });

  it('starts big and settles to true size at full motion', () => {
    expect(chevronPop(0, 1)).toBeCloseTo(CH.popScale, 9);
    expect(chevronPop(CH.popMs, 1)).toBeCloseTo(1, 9);
    expect(chevronPop(TTL, 1)).toBeCloseTo(1, 9); // clamped, never inverts
  });

  it('halves its amplitude at `reduced`', () => {
    const full = chevronPop(0, motionIntensity('full')) - 1;
    const reduced = chevronPop(0, motionIntensity('reduced')) - 1;
    expect(reduced).toBeCloseTo(full / 2, 9);
  });

  it('never runs backwards for a negative age', () => {
    expect(chevronPop(-100, 1)).toBeCloseTo(CH.popScale, 9);
  });
});

// --- the ratified house rule --------------------------------------------------

describe("motion: 'off' removes MOTION, never INFORMATION (UX-DR36, amendment 55)", () => {
  it('keeps PRESENCE: alpha is identical at off and at full', () => {
    for (const age of [0, 300, 900]) {
      expect(chevronAlpha(age, chevronWeight(2).alpha)).toBe(chevronAlpha(age, chevronWeight(2).alpha));
    }
    // The fade is not motion-parameterised at all — there is no level to pass.
    // (`Function.length` counts required params: ageMs + peak, ttlMs defaulted.)
    expect(chevronAlpha.length).toBe(2);
  });

  it('keeps DIRECTION: the placement takes no motion input whatsoever', () => {
    expect(chevronPoint.length).toBe(5); // bearing, originX, originY, w, h — inset defaulted, no level
    const off = chevronPoint(1.1, W / 2, H / 2, W, H);
    const same = chevronPoint(1.1, W / 2, H / 2, W, H);
    expect(off).toEqual(same);
  });

  it('keeps BAND WEIGHT: every band draws at its true weight at off', () => {
    // `motion: 'off'` must not shrink, thin or fade a single band — the weight
    // IS the volume reading, and the pop is the only channel allowed to go.
    const still = (v: HornBand) => ({
      ...chevronWeight(v),
      drawn: chevronWeight(v).size * chevronPop(0, 0),
    });
    for (const v of BANDS) expect(still(v).drawn).toBe(chevronWeight(v).size);
    // ...and the falloff half is still ordered at off, band by band.
    for (const v of [5, 6, 7, 8] as const) {
      expect(still(v).drawn).toBeLessThan(still((v - 1) as HornBand).drawn);
    }
  });

  it('keeps PRESENCE, DIRECTION and WEIGHT together for a live mark at off', () => {
    // The whole UX-DR36 contract in one assertion, through the real adapter
    // with the store ACTUALLY set to off: a honk spawns a mark, it points down
    // the wire bearing, and it carries the faintest band's true weight — not a
    // defaulted one, and not a scaled-away one.
    settings.set({ motion: 'off' });
    try {
      const f = new Foghorn(new Container());
      f.onHonk(Math.PI, 8, 1000);
      expect(f.liveMarks).toBe(1); // PRESENCE
      f.render(1000, W / 2, H / 2, W, H);
      expect(f.liveMarks).toBe(1);
      expect(chevronPoint(Math.PI, W / 2, H / 2, W, H).x).toBeCloseTo(CH.insetPx, 6); // DIRECTION: π = LEFT
      expect(chevronWeight(8)).toEqual({ size: 13, thickness: 1.8, alpha: 0.5 }); // WEIGHT
      expect(chevronPop(0, motionIntensity('off'))).toBe(1); // ...and only the pop is gone
    } finally {
      settings.reset();
    }
  });

  it('removes exactly ONE channel and nothing else', () => {
    const age = 60;
    expect(chevronPop(age, 0)).toBe(1); // gone
    expect(chevronAlpha(age, 0.9)).toBeGreaterThan(0); // stays
    expect(chevronPoint(2.2, W / 2, H / 2, W, H)).toEqual(chevronPoint(2.2, W / 2, H / 2, W, H)); // stays
  });
});

// --- the own-hull bloom is not juice -----------------------------------------

describe("the own-hull `horn` bloom survives motion: 'off'", () => {
  it('is NOT a juice effect — it is the honker’s only visual', () => {
    // A honker gets no chevron (a bearing to yourself is meaningless), so if
    // `horn` were juice, spawnOneShot's `peakAlpha <= 0` early-out at
    // motion:'off' would delete the entire visual twin of a cue the player
    // deliberately triggered.
    expect(isJuiceEffect('horn')).toBe(false);
    expect(effectPeakAlpha('horn', 0.5, motionIntensity('off'))).toBe(0.5);
    expect(effectPeakAlpha('horn', 0.5, motionIntensity('reduced'))).toBe(0.5);
  });

  it('is fog-immune, like every other mark that must read past the bubble', () => {
    expect(isFogImmuneEffect('horn')).toBe(true);
  });
});

// --- the adapter: TTL, cap, spawn bookkeeping --------------------------------

describe('Foghorn — the pooled chevron list', () => {
  const mk = () => new Foghorn(new Container());

  it('spawns one mark per honk and ages it out at exactly one TTL', () => {
    const f = mk();
    f.onHonk(0, 1, 1000);
    expect(f.liveMarks).toBe(1);
    f.render(1000 + TTL - 1, W / 2, H / 2, W, H);
    expect(f.liveMarks).toBe(1);
    f.render(1000 + TTL, W / 2, H / 2, W, H);
    expect(f.liveMarks).toBe(0);
  });

  it('ages against SERVER time, so a backgrounded tab cannot strand a mark', () => {
    // Timestamp math (serverNow - t), never accumulated dt — the render loop
    // that would do the accumulating is throttled while hidden.
    const f = mk();
    f.onHonk(0, 1, 5000);
    f.render(5000 + TTL * 10, W / 2, H / 2, W, H); // one frame, ten lifetimes later
    expect(f.liveMarks).toBe(0);
  });

  it('caps globally at maxMarks, evicting the OLDEST first', () => {
    const f = mk();
    for (let i = 0; i < CH.maxMarks + 5; i++) f.onHonk(i * 0.1, 1, 1000 + i);
    expect(f.liveMarks).toBe(CH.maxMarks);
  });

  it('has no per-source cap and no key to build one from', () => {
    // Amendment 51 applies amendment 45 verbatim: the wire carries no
    // correlation handle, so marks cannot be grouped by the hull that honked.
    // onHonk's whole signature is (bearing, band, t) — there is nothing to key.
    const f = mk();
    expect(f.onHonk.length).toBe(3);
  });

  it('clear() drops every live mark (return to port)', () => {
    const f = mk();
    f.onHonk(0, 1, 1000);
    f.onHonk(1, 2, 1000);
    f.clear();
    expect(f.liveMarks).toBe(0);
  });

  it('survives a render with no marks and a render after a clear', () => {
    const f = mk();
    expect(() => f.render(1000, W / 2, H / 2, W, H)).not.toThrow();
    f.onHonk(0, 1, 1000);
    f.clear();
    expect(() => f.render(1000, W / 2, H / 2, W, H)).not.toThrow();
  });

  it('skips the spawn entirely while the tab is hidden', () => {
    const f = mk();
    const spy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    f.onHonk(0, 1, 1000);
    expect(f.liveMarks).toBe(0);
    spy.mockRestore();
  });

  it('spawns at motion:off — presence is information (no motion gate on the path)', () => {
    const f = mk();
    f.onHonk(Math.PI, 3, 1000);
    expect(f.liveMarks).toBe(1);
    f.render(1000, W / 2, H / 2, W, H);
    expect(f.liveMarks).toBe(1);
  });
});

// --- the flash budget claim (Story 4.8 wave 2c) ------------------------------
//
// The chevron pop claims `FLASH_ELEMENTS.foghornChevron` on the PAGE-MONOTONIC
// clock — the one every other claimant on the shared budget uses — while the
// honk's SERVER timestamp `t` keeps driving the TTL fade. A 'degrade' verdict
// must never touch presence, direction, band weight or the TTL fade: it is
// scoped to the ONE motion-scaled channel the file header names, the pop-in
// scale. Everything below reads the actual Pixi Graphics the adapter drives
// (via the injected layer's children), not just the `liveMarks` count, so a
// regression that degraded the wrong channel would fail here.

describe('Foghorn — the flash-budget claim (Story 4.8 wave 2c)', () => {
  const fakeBudget = (verdict: FlashVerdict): FlashBudget => ({
    claim: () => verdict,
    coalesce: () => true,
    reset: () => {},
  });

  it('claims FLASH_ELEMENTS.foghornChevron on the PAGE clock, not the honk\'s server time', () => {
    // ONE BUDGET, ONE CLOCK (review gate P1). `f.t` is the server's clock, which
    // starts at 0 at ROOM creation; every other claimant on this budget uses
    // `performance.now()`, which starts at 0 at PAGE load. Claiming at `t` puts
    // two clock domains into one sliding window — see the sweep test below for
    // what that costs. The TTL fade still ages against `t` (asserted below).
    const claims: Array<[string, number]> = [];
    const budget: FlashBudget = {
      claim: (key, nowMs) => {
        claims.push([key, nowMs]);
        return 'animate';
      },
      coalesce: () => true,
      reset: () => {},
    };
    const f = new Foghorn(new Container(), budget, () => 5_000); // page clock
    f.onHonk(0, 1, 3_600_000); // a room that has been up an hour
    expect(claims).toEqual([[FLASH_ELEMENTS.foghornChevron, 5_000]]);
  });

  it('a honk never prunes the region onsets of a budget fed by the page clock', () => {
    // The concrete damage of two clock domains: `SlidingFlashBudget.maybeSweep`
    // fires on every 64th claim and prunes EVERY key against the CLAIMING call's
    // clock. A honk landing on that sweep, stamped an hour ahead in server time,
    // wipes every region's onset history — and the next three flashes per region
    // animate when the ratified 3/s floor says they must degrade. That is the
    // floor failing at exactly the heavy-stack moment it was written for.
    const budget = createFlashBudget();
    const page = 5_000;
    const f = new Foghorn(new Container(), budget, () => page);
    // 60 unrelated claims + the region's 3, leaving the honk as the 64th claim.
    for (let i = 0; i < 60; i++) budget.claim(`k${i}`, page);
    for (let i = 0; i < CLIENT_CONFIG.flashBudget.maxPerSecond; i++) {
      expect(budget.claim('r0:0', page)).toBe('animate');
    }
    f.onHonk(0, 1, 3_600_000); // the sweeping claim
    // The region's window is still full — a fourth flash there degrades.
    expect(budget.claim('r0:0', page)).toBe('degrade');
  });

  it('the TTL fade still ages against the honk\'s SERVER timestamp', () => {
    // The clock fix moves the CLAIM only. `t` is server-clock work and stays.
    const layer = new Container();
    const f = new Foghorn(layer, fakeBudget('animate'), () => 5_000);
    f.onHonk(0, 3, 3_600_000);
    const gfx = layer.children[0] as Graphics;
    f.render(3_600_000 + 100, W / 2, H / 2, W, H);
    expect(gfx.alpha).toBeCloseTo(chevronAlpha(100, chevronWeight(3).alpha), 9);
    f.render(3_600_000 + TTL, W / 2, H / 2, W, H);
    expect(f.liveMarks).toBe(0);
  });

  it('a DEGRADED chevron still renders: present, on the correct bearing, correct band weight, TTL fade intact — only the pop is gone', () => {
    const layer = new Container();
    const f = new Foghorn(layer, fakeBudget('degrade'));
    const bearing = Math.PI / 2;
    f.onHonk(bearing, 3, 1000); // band 3 -> chevronWeight(3)'s loud-side weight
    expect(f.liveMarks).toBe(1); // PRESENCE
    const gfx = layer.children[0] as Graphics;
    expect(gfx.rotation).toBeCloseTo(bearing, 9); // DIRECTION
    f.render(1000 + 100, W / 2, H / 2, W, H); // mid-flight of the pop, at full motion
    // The scale pop is gone: true size (1), never the animated flourish.
    expect(gfx.scale.x).toBeCloseTo(1, 9);
    expect(gfx.scale.y).toBeCloseTo(1, 9);
    // BAND WEIGHT + the TTL fade are untouched: the exact same alpha the pure
    // function predicts for this band's peak, at this age.
    expect(gfx.alpha).toBeCloseTo(chevronAlpha(100, chevronWeight(3).alpha), 9);
    // ...and it still dies at exactly one TTL — the budget never touches TTL.
    f.render(1000 + TTL, W / 2, H / 2, W, H);
    expect(f.liveMarks).toBe(0);
  });

  it('under-budget (animate) behaviour is byte-identical to today: the real pop still fires', () => {
    const layer = new Container();
    const f = new Foghorn(layer, fakeBudget('animate'));
    f.onHonk(0, 1, 1000);
    const gfx = layer.children[0] as Graphics;
    f.render(1000, W / 2, H / 2, W, H); // age 0: the pop is at its peak scale
    const intensity = motionIntensity(settings.current.motion);
    expect(gfx.scale.x).toBeCloseTo(chevronPop(0, intensity), 9);
  });

  it('behaves exactly as today when no budget instance is supplied', () => {
    const layer = new Container();
    const f = new Foghorn(layer); // no budget arg at all
    f.onHonk(0, 1, 1000);
    expect(f.liveMarks).toBe(1);
    const gfx = layer.children[0] as Graphics;
    f.render(1000, W / 2, H / 2, W, H);
    const intensity = motionIntensity(settings.current.motion);
    expect(gfx.scale.x).toBeCloseTo(chevronPop(0, intensity), 9); // the full pop, unblocked
  });
});

// --- the routing shapes (roomBindings `case 'fh'`) ---------------------------

function setupHonk(over: Record<string, unknown> = {}) {
  const sink: { handler: (f: unknown) => void } = { handler: () => undefined };
  const room = {
    onMessage: () => undefined,
    onError: () => undefined,
    onLeave: () => undefined,
    onDrop: () => undefined,
    onReconnect: () => undefined,
  };
  const conn = { room, welcome: {}, sink, early: { results: null, bound: false } } as unknown as Connection;
  const playHorn = vi.fn();
  const spawnEffect = vi.fn();
  const onHonk = vi.fn();
  const deps = {
    state: { net: { you: over.you ?? null, sessionId: 'me', tick: 0, ackSeq: 0 }, spectating: true, phase: '', respawnEta: null, mode: 'interp' },
    clock: { addSample: vi.fn() },
    contacts: { pushFrame: vi.fn() },
    mines: { sync: vi.fn() },
    litZones: { sync: vi.fn() },
    buoys: { sync: vi.fn() },
    radar: { onSweepSample: vi.fn(), setOwnBuoys: vi.fn() },
    ownBurstRadius: () => undefined,
    ownMineRings: () => undefined,
    ownBuoy: () => undefined,
    effects: { spawnEffect },
    audio: { play: vi.fn(), playHorn },
    foghorn: { onHonk },
    cameraCenter: () => (over.camera ?? { x: 0, y: 0 }),
    onSunkObserved: vi.fn(),
    onSpectate: vi.fn(),
    colors: vi.fn(() => null),
    ordnanceHue: vi.fn(() => 0),
  } as unknown as RoomBindingDeps;
  bindRoom(conn, deps);
  return { sink, playHorn, spawnEffect, onHonk };
}

/** A frame carrying exactly one `fh` event, at server time 200. */
function honkFrame(e: FoghornEvent): unknown {
  return { t: 200, tick: 2, ackSeq: 0, spec: true, contacts: [], mines: [], events: [e] };
}

describe("roomBindings case 'fh' — three shapes, three behaviors", () => {
  it('SELF: plays at 100%, blooms the own hull, and draws NO chevron', () => {
    const you = { x: 40, y: -60, heading: 0, speed: 0, cls: 'torpedoBoat', boons: [], alive: true, sweep: 0 };
    const { sink, playHorn, spawnEffect, onHonk } = setupHonk({ you });
    sink.handler(honkFrame({ k: 'fh', h: 'standard', self: true }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    expect(spawnEffect).toHaveBeenCalledWith('horn', 40, -60);
    expect(onHonk).not.toHaveBeenCalled(); // a bearing to yourself is meaningless
  });

  it('SELF with no own ship on the frame still sounds (the bloom is what is skipped)', () => {
    const { sink, playHorn, spawnEffect } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', self: true }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    expect(spawnEffect).not.toHaveBeenCalled();
  });

  it('FOGGED: plays at the band gain and draws a chevron at the WIRE bearing', () => {
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 2.5, v: 6 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 0.75);
    expect(onHonk).toHaveBeenCalledWith(2.5, 6, 200); // bearing, band, FRAME time
  });

  it('FOGGED inside the plateau: a band-2 honk still plays at FULL volume', () => {
    // The eighths rebase's most visible behavior change — the old tier 2 played
    // at 75%, band 2 is inside truesight and plays at 1.
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 1.5, v: 2 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    expect(onHonk).toHaveBeenCalledWith(1.5, 2, 200);
  });

  it('FOGGED band 8: the quietest band still draws its mark', () => {
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 0.25, v: 8 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 0.5);
    expect(onHonk).toHaveBeenCalledWith(0.25, 8, 200);
  });

  it('SPECTATOR: plays at 100% and derives the bearing from the CAMERA centre', () => {
    const { sink, playHorn, onHonk } = setupHonk({ camera: { x: 100, y: 100 } });
    sink.handler(honkFrame({ k: 'fh', h: 'standard', x: 100, y: 600 }));
    expect(playHorn).toHaveBeenCalledWith('standard', 1);
    // Due "south" of the camera in world coords -> π/2, which chevronPoint puts
    // on the BOTTOM edge (the y-down convention above).
    expect(onHonk).toHaveBeenCalledWith(Math.PI / 2, undefined, 200);
  });

  it('SPECTATOR: the bearing is fixed AT RECEIPT, not re-derived as the camera pans', () => {
    let cam = { x: 0, y: 0 };
    const { sink, onHonk } = setupHonk({ camera: cam });
    // A fresh setup per pan would be a different assertion; instead pin that the
    // value handed to the layer is a NUMBER, not a live source the layer could
    // re-read. (The layer stores `bearing` and never consults the camera again.)
    sink.handler(honkFrame({ k: 'fh', h: 'standard', x: 500, y: 0 }));
    cam = { x: 999, y: 999 };
    expect(typeof onHonk.mock.calls[0][0]).toBe('number');
    expect(onHonk.mock.calls[0][0]).toBeCloseTo(0, 9);
  });

  it('THE CHEVRON IS PUSHED BEFORE THE AUDIO — and never rides on it', () => {
    // amendment 56: the mix cap drops HORNS, never CHEVRONS. A playHorn that
    // throws (or silently drops, which it does at its concurrency cap) must not
    // be able to take the visual twin with it.
    const order: string[] = [];
    const { sink } = (() => {
      const s = setupHonk();
      s.playHorn.mockImplementation(() => order.push('audio'));
      s.onHonk.mockImplementation(() => order.push('chevron'));
      return s;
    })();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 1, v: 1 }));
    expect(order).toEqual(['chevron', 'audio']);
  });

  it('an UNKNOWN horn id is forwarded verbatim — the audio layer owns the fallback', () => {
    // The wire type is HornId, but a newer server can send an id this bundle has
    // never heard of. roomBindings must NOT sanitize or drop it: playHorn takes
    // a plain string and falls back to the default voice (amendment 52).
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'brass-leviathan' } as unknown as FoghornEvent));
    expect(playHorn).toHaveBeenCalledWith('brass-leviathan', 1);
    expect(onHonk).not.toHaveBeenCalled(); // no bearing and no position -> no mark
  });

  it('a shape with neither bearing nor position SOUNDS but draws nothing', () => {
    // A chevron at a defaulted bearing of 0 would point confidently at the
    // wrong horizon, which is strictly worse than no mark at all.
    const { sink, playHorn, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard' }));
    expect(playHorn).toHaveBeenCalledTimes(1);
    expect(onHonk).not.toHaveBeenCalled();
  });

  it('never leaks a position into the chevron call — bearing and band only', () => {
    const { sink, onHonk } = setupHonk();
    sink.handler(honkFrame({ k: 'fh', h: 'standard', b: 1.75, v: 1 }));
    expect(onHonk.mock.calls[0]).toHaveLength(3);
    for (const arg of onHonk.mock.calls[0]) {
      expect(typeof arg === 'number' || arg === undefined).toBe(true);
    }
  });
});

// --- A DENIED HONK IS COMPLETELY SILENT (Eric ruling 2026-08-05, review fix) -
//
// The foghorn was the only `denied`-tone site in the client with no visual
// twin of its own — weapons flash the aim arc, abilities flash their hotbar
// chip, the horn has no surface to flash. Rather than invent one, Eric ruled
// the orphan cue out entirely: an early F press is simply ignored, with no
// side effect of any kind. `handleFoghornPress` (main.ts) is module-private
// and untestable by import (see MAIN_TS above), so this pins the source text
// of that one function rather than its runtime behavior.

describe('a denied honk press is COMPLETELY SILENT (Eric ruling 2026-08-05, review fix)', () => {
  it('handleFoghornPress calls audio.play NOWHERE in its body', () => {
    const start = MAIN_TS.indexOf('function handleFoghornPress(g: Game): void {');
    expect(start).toBeGreaterThan(-1); // the function must still exist under this name/signature
    const end = MAIN_TS.indexOf('\n}', start);
    expect(end).toBeGreaterThan(start);
    const body = MAIN_TS.slice(start, end);
    // The old code played the shipped `denied` cue on the denied branch —
    // this is the exact call this ruling deletes. A weapon/ability press
    // legitimately calls audio.play('denied') elsewhere in main.ts; this pins
    // ONLY the foghorn handler's own body.
    expect(body).not.toMatch(/audio\.play\(/);
  });

  it('still advances the wire counter and arms the cooldown on ACCEPT (unchanged)', () => {
    const start = MAIN_TS.indexOf('function handleFoghornPress(g: Game): void {');
    const end = MAIN_TS.indexOf('\n}', start);
    const body = MAIN_TS.slice(start, end);
    // The ACCEPTED path is untouched by this ruling — only the denied branch's
    // side effect was removed.
    expect(body).toContain('g.sampler.honk()');
    expect(body).toContain('g.nextHonkAt = now + CONFIG.foghorn.cooldownMs');
  });
});
