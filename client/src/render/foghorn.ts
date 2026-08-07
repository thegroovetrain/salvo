// THE FOGHORN CHEVRON (Story 4.5, amendments 51-58) — the client half of the
// game's SIXTH declared perception exception, and the bearing surface amendment
// 4 said this story had to grow when the listening ring was deferred.
//
// The server emits `fh` per observer: a fogged listener gets BEARING + VOLUME
// BAND and nothing else (no position, no id, no correlation handle of any
// kind), the honker gets `self`, a spectator gets `x`/`y`. This module owns the
// fogged/spectator surface: a chevron pinned near the viewport edge, pointing
// down the bearing, weighted by band, fading over ~1.2s. The honker's own honk
// gets an own-hull bloom instead (render/effects.ts `horn`) — a bearing to
// yourself is meaningless.
//
// THE BAND IS AN EIGHTH OF THE LISTENER'S INTEL RANGE (Story 4.9, amendment
// 122), resolved SERVER-side and already muffled for islands. Nothing in this
// module recomputes a band, a distance or a range — it looks the band up in a
// table and draws. That was true of the old three-value tier and it stays true
// of the eight-value band; only the resolution changed.
//
// It follows render/smoke.ts's split, and for the same reasons:
//   • a PURE core (no Pixi import, unit-tested in __tests__/foghorn.test.ts) —
//     the bearing→screen point, the band→weight table, the TTL→alpha ramp and
//     the pop-in scale;
//   • a thin `Foghorn` adapter that pools Graphics, draws each chevron's
//     geometry ONCE at acquire, and per frame touches nothing but position,
//     rotation, alpha and scale.
//
// DECAY IS TIMESTAMP MATH AGAINST SERVER TIME (`serverNow - t`), never an
// accumulated dt — smoke.ts:18-21 and radar.ts:279-303 are the precedent, and
// the reason is the backgrounded tab, where the render loop that would do the
// accumulating is throttled or paused while the honks keep arriving.
//
// TWO CONSTRAINTS THAT ARE NOT STYLE:
//
//   1. THE CHEVRON IS INFORMATION, NOT JUICE (UX-DR36, amendment 55; the
//      ratified house rule at effects.ts:44-53). `motion: 'off'` removes
//      MOTION, never INFORMATION — so PRESENCE, DIRECTION and BAND WEIGHT are
//      motion-blind here, and the ONLY motion-scaled knob is the pop-in scale,
//      which bottoms out at a chevron simply appearing at its true size in its
//      true place. The TTL fade is not "motion": it is how long the fact stays
//      true. Do not add a motion test to the spawn path.
//
//   2. THE MARK OUTLIVES THE SOUND. `Audio.playHorn` silently drops a honk at
//      its 3-horn concurrency cap (amendment 56), and the visual twin must
//      survive a crowded room even when the mix cannot. The caller therefore
//      pushes the chevron UNCONDITIONALLY, never inside an audio branch.
//
// There is no per-source cap and none can exist: the wire carries no
// correlation handle at all (amendment 51 applies amendment 45's rule
// verbatim), so marks cannot be grouped by the hull that honked. `capOldest`
// alone bounds the pool.
//
// WORLD BEARING → SCREEN DIRECTION. The camera has NO rotation and NO y-flip
// (camera.ts `worldToScreen` is a pure scale-and-translate; render/ships.ts:17
// records the same fact as "world heading == sprite rotation"), so a world
// bearing `b` points along `(cos b, sin b)` in SCREEN pixels too — screen +y is
// down and world +y is down. Bearing 0 is therefore screen RIGHT, π/2 is screen
// DOWN, π is LEFT and 3π/2 is UP. `chevronPoint` and the adapter's
// `gfx.rotation = bearing` both rest on that one fact, and foghorn.test.ts pins
// all four cardinals against it.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { wrapPositive } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import { Pool, capOldest } from '../util/pool.js';
import { clamp01 } from '../util/math.js';

const F = CLIENT_CONFIG.foghorn;
const CH = F.chevron;

/**
 * The eight volume BANDS as they arrive on the wire (`FoghornEvent.v`) — which
 * eighth of the LISTENER's own intel range the honker sits in, 1 = innermost,
 * 8 = the radar edge (Story 4.9, amendment 122). The client looks it up and
 * never re-derives a distance from it.
 *
 * THE SERVER EMITS 4..8 ONLY (review fix — see FoghornEvent.v): bands 1-4 share
 * one gain and one chevron weight, so a finer value would be range resolution
 * with no honest consumer. The tables here stay COMPLETE for 1..8 all the same
 * — the floor is a bound on the sender, not a narrowing of the vocabulary, and
 * a band-1..3 value must still resolve correctly if one ever arrives.
 */
export type HornBand = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** One band's chevron presentation — see `CLIENT_CONFIG.foghorn.chevron.bands`. */
export interface ChevronWeight {
  /** Half-width of the chevron's arms, px. */
  readonly size: number;
  /** Stroke width, px. */
  readonly thickness: number;
  /** Peak opacity (before the TTL fade). */
  readonly alpha: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Pure: the AUDIO gain for a wire BAND — flat at 100% through band 4 (truesight
 * at base stats), then one step down per band to 50% at band 8 (the radar
 * edge): 1 / 1 / 1 / 1 / 0.875 / 0.75 / 0.625 / 0.5 (amendment 122). The band
 * itself is resolved SERVER-side against the listener's own intel range; this
 * only says how loud each band plays.
 *
 * AN ABSENT BAND IS FULL GAIN; AN OUT-OF-DOMAIN ONE IS THE QUIETEST BAND. The
 * two are different facts and get different answers (review fix). `undefined` is
 * the honest `self` and spectator shape — neither carries a `v` because neither
 * observer is IN a band, and silence would be the one wrong answer there. A
 * NUMBER outside 1..8 is instead the least trustworthy input this row can carry,
 * so it degrades to band 8's gain: still audible (a honk that arrived is a fact
 * worth playing) but never the loudest answer for the worst-known input. The
 * server fails closed on its own side too (`hornBandFor` emits nothing unless
 * the band is a finite integer in range), so this is unreachable from an honest
 * server; the two guards are deliberately INDEPENDENT.
 */
export function bandGain(v: HornBand | undefined): number {
  if (v === undefined) return 1;
  const gains: Record<number, number | undefined> = F.bandGain;
  return gains[v] ?? F.bandGain[8];
}

/**
 * Pure: a band's chevron weight. The bands differ in SIZE, STROKE and ALPHA at
 * once so the volume reads at a glance and survives a colorblind read — hue is
 * identical across all eight (the wounded-smoke tier rule). An absent band (the
 * spectator shape, which carries a position instead) draws at full weight: a
 * spectator is omniscient, so there is no band to under-draw.
 *
 * FAILS CLOSED ON AN OUT-OF-DOMAIN VALUE — TO THE FAINTEST BAND (review fix,
 * the same split `bandGain` makes). Any `v` outside 1..8 — a NaN, a 0, a 9 —
 * used to return `undefined` here, and `drawChevron` then threw on `w.size`: one
 * malformed field taking down the render loop. It now degrades to band 8's
 * weight rather than throwing, because a honk that arrived is a fact worth
 * drawing — but never at band 1's maximum salience, which is the loudest mark on
 * screen answering the least trustworthy input the row can carry. The server
 * fails closed on its own side too (`hornBandFor` emits nothing unless the band
 * is a finite integer in range), so this is unreachable from an honest server;
 * the two guards are deliberately INDEPENDENT.
 *
 * The table stays complete for 1..8 even though the server now floors the wire
 * at 4 (see FoghornEvent.v): a lower band must still resolve correctly if one
 * ever legitimately arrives — the floor is a disclosure bound on the sender,
 * not a narrowing of the vocabulary.
 */
export function chevronWeight(v: HornBand | undefined): ChevronWeight {
  if (v === undefined) return CH.bands[1]; // the spectator/self shape: full weight
  const bands: Record<number, ChevronWeight | undefined> = CH.bands;
  return bands[v] ?? CH.bands[8];
}

/**
 * Pure: where a bearing's chevron sits on screen — the point where a ray cast
 * from `(originX, originY)` along `(cos b, sin b)` meets a rectangle inset by
 * `inset` px from every edge. See the file header for why the world bearing IS
 * the screen direction (no camera rotation, no y-flip).
 *
 * THE ORIGIN IS NOT THE VIEWPORT CENTRE (Story 4.5 review fix). It is the
 * screen point the bearing was actually measured FROM: the caller's own hull
 * (`camera.worldToScreen`) while alive, or the camera centre while spectating
 * — see `renderFoghorn` in main.ts. Alive, the camera's forward lead (up to
 * 110u, camera.ts `leadOffset`) pushes the hull off screen centre, so anchoring
 * the ray at the viewport centre would disagree with the exact bearing the
 * chevron's own rotation draws.
 *
 * The origin can land anywhere on screen, including well outside the inset
 * rectangle (an off-screen hull at extreme zoom): the ray-rectangle
 * intersection below is general, not the old centre-only "half-extent along
 * each axis" shortcut, so it still finds the first rectangle edge the ray
 * reaches from wherever it starts. A viewport too small to hold the inset, or
 * a ray that (from an off-rectangle origin) never reaches the rectangle at
 * all, collapses to the viewport CENTRE rather than inverting or going
 * unplaced — the mark stacks in the middle, which is ugly and honest, where a
 * negative half-extent (or an unbounded ray) would fling it off screen or
 * produce NaN.
 */
export function chevronPoint(
  bearing: number,
  originX: number,
  originY: number,
  screenW: number,
  screenH: number,
  inset: number = CH.insetPx,
): ScreenPoint {
  const cx = screenW / 2;
  const cy = screenH / 2;
  const centre = { x: cx, y: cy };
  const xMin = inset;
  const xMax = screenW - inset;
  const yMin = inset;
  const yMax = screenH - inset;
  // Viewport too small to hold the inset: hold the centre rather than invert.
  if (xMax <= xMin || yMax <= yMin) return centre;
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return centre;
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) return centre;
  const hit = firstRectHit(originX, originY, dx, dy, xMin, xMax, yMin, yMax);
  return hit ?? centre;
}

/**
 * Pure: the first point (forward along the ray, `t > 0`) where a ray from
 * `(ox, oy)` in direction `(dx, dy)` crosses one of the four edges of
 * `[xMin, xMax] x [yMin, yMax]` — checked against all four regardless of the
 * origin's own position, so this is correct whether the origin sits inside the
 * rectangle (the common alive case) or outside it (an off-screen hull). `null`
 * when no edge is reached going forward (the ray points away from the box
 * entirely), which the caller resolves to the viewport centre.
 */
function firstRectHit(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): ScreenPoint | null {
  const EPS = 1e-9;
  const TOL = 1e-6;
  let bestT = Infinity;
  let best: ScreenPoint | null = null;
  const consider = (t: number, p: ScreenPoint): void => {
    if (t > EPS && t < bestT && p.x >= xMin - TOL && p.x <= xMax + TOL && p.y >= yMin - TOL && p.y <= yMax + TOL) {
      bestT = t;
      best = p;
    }
  };
  if (Math.abs(dx) > EPS) {
    const tR = (xMax - ox) / dx;
    consider(tR, { x: xMax, y: oy + tR * dy });
    const tL = (xMin - ox) / dx;
    consider(tL, { x: xMin, y: oy + tL * dy });
  }
  if (Math.abs(dy) > EPS) {
    const tB = (yMax - oy) / dy;
    consider(tB, { x: ox + tB * dx, y: yMax });
    const tT = (yMin - oy) / dy;
    consider(tT, { x: ox + tT * dx, y: yMin });
  }
  return best;
}

/**
 * Pure: a chevron's opacity at `ageMs` — full weight, then a linear fade to
 * nothing across its life. Dead (0) at a full life and beyond.
 *
 * A NON-POSITIVE age (clock jitter: the observer's `serverNow` estimate briefly
 * reads BEHIND the honk's own frame timestamp) resolves to FULL, matching
 * phosphor.ts's `blipAlpha` rather than smoke.ts's `puffAlpha` — and the
 * difference is principled: a puff has a bloom-in ramp, so "newborn" and "full"
 * are different points on its curve, while a chevron has none and they
 * coincide. There is no discontinuity to protect against.
 *
 * The fade is NOT motion (see the file header): it holds at every motion level.
 */
export function chevronAlpha(ageMs: number, peak: number, ttlMs: number = CH.ttlMs): number {
  if (ageMs >= ttlMs) return 0;
  const age = ageMs > 0 ? ageMs : 0;
  return peak * (1 - clamp01(age / ttlMs));
}

/**
 * Pure: the pop-in scale multiplier at `ageMs` — the chevron's ONE animated
 * flourish, and therefore the one thing here that is motion-scaled. At
 * `intensity` 0 this returns exactly 1 from the first frame: the mark appears
 * at its true size, in its true place, at its true weight. Motion, therefore
 * scalable; the mark itself, therefore never scaled away.
 */
export function chevronPop(ageMs: number, intensity: number): number {
  if (intensity <= 0 || CH.popMs <= 0) return 1;
  const k = clamp01(Math.max(0, ageMs) / CH.popMs);
  return 1 + (CH.popScale - 1) * intensity * (1 - k);
}

/**
 * Pure: the bearing FROM an observation point TO a honk's position, in
 * `wrapPositive` [0, 2π) — the SPECTATOR path only. A fogged listener's bearing
 * is computed server-side and arrives as `b`; a spectator gets `x`/`y` instead
 * (the free camera has no server-known position to take a bearing from), so the
 * client derives one from its own camera centre and FIXES IT AT RECEIPT: a
 * bearing that re-derived every frame would swing as the spectator panned,
 * turning a moment-in-time fact into a live tracker.
 */
export function bearingTo(fromX: number, fromY: number, toX: number, toY: number): number {
  return wrapPositive(Math.atan2(toY - fromY, toX - fromX));
}

/** One live chevron. `t` is the SERVER timestamp of the frame it arrived on. */
interface LiveChevron {
  gfx: Graphics;
  t: number;
  bearing: number;
  weight: ChevronWeight;
}

/**
 * The Pixi adapter. Thin by design (not unit tested beyond its cap/spawn
 * bookkeeping): every number it draws comes from the pure functions above.
 */
export class Foghorn {
  private readonly pool: Pool<Graphics>;
  private readonly marks: LiveChevron[] = [];

  constructor(private readonly layer: Container) {
    this.pool = new Pool<Graphics>(() => this.makeChevronGraphics());
  }

  /** How many chevrons are currently alive (debug/tests). */
  get liveMarks(): number {
    return this.marks.length;
  }

  private makeChevronGraphics(): Graphics {
    const g = new Graphics();
    g.visible = false;
    this.layer.addChild(g);
    return g;
  }

  /**
   * Draw one chevron's geometry, ONCE, at acquire — thereafter it is animated
   * by position / rotation / alpha / scale alone. A ">" opening along +x, so
   * `gfx.rotation = bearing` points it down the bearing with no further math
   * (the header's convention). Drawn in HUD phosphor: a honk is a chart-register
   * fact, not a combat mark, and it carries no identity to tint with.
   */
  private drawChevron(g: Graphics, w: ChevronWeight): void {
    const s = w.size;
    g.clear();
    g.moveTo(-s * 0.55, -s)
      .lineTo(s * 0.55, 0)
      .lineTo(-s * 0.55, s)
      .stroke({ width: w.thickness, color: CLIENT_CONFIG.colors.phosphor, alpha: 1, cap: 'round', join: 'round' });
  }

  /**
   * A honk arrived from `bearing` (rad, world-space) at server time `t`. `band`
   * is the wire's volume band, or undefined for the spectator path.
   *
   * NO MOTION GATE LIVES HERE, and no audio gate either: a chevron that failed
   * to spawn at `motion: 'off'` would delete the information UX-DR36 requires,
   * and one that spawned only when the mix had room would lose exactly the
   * honks a crowded room most needs pointing at (amendment 56).
   */
  onHonk(bearing: number, band: HornBand | undefined, t: number): void {
    // Backgrounded tab: skip the spawn entirely rather than let marks pile into
    // the pool while the render loop that ages and retires them is throttled.
    // `capOldest` below is the second line of defence, not the first.
    if (typeof document !== 'undefined' && document.hidden) return;
    const weight = chevronWeight(band);
    const gfx = this.pool.acquire();
    this.drawChevron(gfx, weight);
    gfx.rotation = bearing;
    gfx.visible = true;
    this.marks.push({ gfx, t, bearing, weight });
    this.retire(capOldest(this.marks, CH.maxMarks));
  }

  /** Hide + pool a batch of retired chevrons. */
  private retire(gone: readonly LiveChevron[]): void {
    for (const m of gone) {
      m.gfx.visible = false;
      this.pool.release(m.gfx);
    }
  }

  /** Drop every live chevron at once (teardown / return to port). */
  clear(): void {
    this.retire(this.marks);
    this.marks.length = 0;
  }

  /**
   * Per-frame: age every chevron against SERVER time, retiring the dead ones,
   * and re-pin the survivors to the current viewport (a resize must not strand
   * a live bearing off screen). `(originX, originY)` is the screen point the
   * bearing was actually measured from — the caller's job (see `chevronPoint`
   * and `renderFoghorn` in main.ts), not this adapter's: it just threads the
   * origin through unchanged every frame.
   */
  render(serverNow: number, originX: number, originY: number, screenW: number, screenH: number): void {
    // Read the motion level straight from the store each frame: the settings
    // panel can change it mid-match, and a cached copy would strand a chevron
    // mid-pop after the player turned motion off (smoke.ts:254-258).
    const intensity = motionIntensity(settings.current.motion);
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      const age = serverNow - m.t;
      // Retire on AGE, not on alpha — the smoke.ts rule: alpha is a derived
      // ramp and can legitimately read 0 for a mark that is merely between
      // frames, while `age >= ttl` is the same condition chevronAlpha itself
      // uses to report "dead".
      if (age >= CH.ttlMs) {
        this.retire([m]);
        this.marks.splice(i, 1);
        continue;
      }
      const p = chevronPoint(m.bearing, originX, originY, screenW, screenH);
      m.gfx.position.set(p.x, p.y);
      m.gfx.alpha = chevronAlpha(age, m.weight.alpha);
      m.gfx.scale.set(chevronPop(age, intensity));
    }
  }
}
