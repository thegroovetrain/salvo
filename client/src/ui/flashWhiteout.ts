// THE FLASH SHELLS WHITEOUT (Eric 2026-10-29, epic-10 amendment 5(a)–(e)).
//
// A hull struck by an enemy FLASH SHELLS burst goes white: the WHOLE screen —
// world, Pixi HUD and DOM chrome alike ("Everything, HUD included") — ramps to
// pure white over `rampMs`, holds for `holdMs`, then a CLEAR CIRCLE grows from
// the own ship (its radius is the shared sight law's, `effectiveSight`) while
// the white outside it fades, both over `clearMs`. A re-flash restarts the
// timeline (the later `dazzledUntil` wins), which falls out of reading the
// elapsed time off the one mark — and its ramp starts from the white already
// on screen (the overlay carries its last alpha; gate fix F3).
//
// ONE DOM ELEMENT at the top of the DOM z-scale (CLIENT_CONFIG.flashWhiteout.
// zIndex) — the only way to cover DOM chrome — `pointer-events: none`, pure
// white, `position: fixed; inset: 0`, its hole a CSS radial mask. It is a
// SCREEN EFFECT driven per frame by the render loop (net → sim → render: it
// reads the wire mark and the camera's projection, and drives nothing back).
//
// The math is the pure `whiteoutModel` below; the class is a thin DOM sink.

import { CONFIG, effectiveSight, flashClearFraction, flashElapsedMs, type EffectiveStats } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex } from '../util/color.js';

/** The mask's opaque stop. A mask reads only ALPHA, so the hue is moot; the
 *  palette white is simply an opaque token. */
const OPAQUE = cssHex(CLIENT_CONFIG.colors.white);

/** Where the own ship is on screen this frame, and the projection's scale. */
export interface WhiteoutScreen {
  x: number; // px — the own hull's screen position
  y: number; // px
  pxPerU: number; // px per world unit (the camera's composed zoom)
}

/** One frame of the overlay: `hidden` takes it off entirely; else the white's
 *  opacity outside the clear circle and that circle's radius (px). */
export interface WhiteoutFrame {
  hidden: boolean;
  alpha: number;
  holeR: number;
}

const HIDDEN: WhiteoutFrame = Object.freeze({ hidden: true, alpha: 0, holeR: 0 });

/**
 * Pure: the white's opacity OUTSIDE the clear circle at `elapsedMs` into the
 * whiteout — 0 → 1 linearly across `rampMs`, 1 through the hold, then
 * `1 − flashClearFraction` (the shared curve the clear circle grows on), so it
 * reaches 0 exactly as the mark lapses. Clamped to [0, 1].
 *
 * A RE-FLASH RAMPS FROM WHERE THE WHITE IS (gate fix F3, amendment 5e):
 * `prevAlpha` is the alpha the overlay last drew (0 when it was hidden).
 * Through the ramp the alpha is `max(prevAlpha, ramp)` — a second hit while
 * the first whiteout is clearing never dips the white to 0 and climbs again;
 * it rises from its current value. Past the ramp the normal curve rules. A
 * first hit carries 0, so its ramp is unchanged.
 */
export function whiteoutAlpha(elapsedMs: number, prevAlpha = 0): number {
  const { rampMs } = CONFIG.flashShells;
  if (!(elapsedMs > 0)) return clamp01(prevAlpha); // also NaN — the hit frame keeps the white it has
  if (elapsedMs < rampMs) return Math.max(clamp01(prevAlpha), elapsedMs / rampMs);
  return 1 - flashClearFraction(elapsedMs);
}

/** [0, 1], NaN → 0. */
function clamp01(v: number): number {
  return v > 0 ? Math.min(1, v) : 0;
}

/**
 * Pure: the overlay's frame. Hidden with no own ship on screen (`screen` null —
 * spectating, results, the pre-first-frame gap), with no mark, or once the mark
 * has lapsed (`until <= now`). Otherwise the alpha above and the clear circle's
 * radius in px: `effectiveSight(ownStats, until, now) × pxPerU` — the very
 * radius the server perceives this hull with, so what the white hides and what
 * the server withholds agree. `prevAlpha` is the overlay's carried alpha
 * (`FlashWhiteout.carriedAlpha`) — see whiteoutAlpha's re-flash rule.
 */
export function whiteoutModel(
  until: number | undefined,
  now: number,
  ownStats: Pick<EffectiveStats, 'sightRange'>,
  screen: WhiteoutScreen | null,
  prevAlpha = 0,
): WhiteoutFrame {
  if (screen === null || until === undefined || !(until > now)) return HIDDEN;
  const alpha = whiteoutAlpha(flashElapsedMs(until, now), prevAlpha);
  const holeR = effectiveSight(ownStats, until, now) * screen.pxPerU;
  return { hidden: false, alpha, holeR: Number.isFinite(holeR) && holeR > 0 ? holeR : 0 };
}

/** Pure: the clear circle's soft edge (px) — `featherFrac` of the radius, never
 *  under `featherMinPx`; none at all with no hole or with feathering off. */
export function whiteoutFeatherPx(holeR: number, feather: boolean): number {
  if (!feather || !(holeR > 0)) return 0;
  const { featherFrac, featherMinPx } = CLIENT_CONFIG.flashWhiteout;
  return Math.max(featherMinPx, holeR * featherFrac);
}

/** Pure: the CSS mask for a hole of `holeR` px (feather `f`) at (x, y) — `none`
 *  (white everywhere) with no hole. Inside the circle the mask is transparent
 *  (the view shows through); outside it is opaque (the white shows). */
export function whiteoutMask(x: number, y: number, holeR: number, f: number): string {
  if (!(holeR > 0)) return 'none';
  const r = holeR.toFixed(1);
  const outer = (holeR + f).toFixed(1);
  return `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, transparent ${r}px, ${OPAQUE} ${outer}px)`;
}

/** The overlay element's fixed style: full viewport, pure white, click-through,
 *  top of the DOM z-scale. Only opacity and the mask move per frame. */
const BASE_STYLE = [
  'position:fixed',
  'inset:0',
  `z-index:${CLIENT_CONFIG.flashWhiteout.zIndex}`,
  'pointer-events:none',
  `background:${cssHex(CLIENT_CONFIG.colors.white)}`,
].join(';');

/**
 * The whiteout's DOM sink. Appended ONCE to `host` (document.body) and hidden
 * until a frame says otherwise; `render` writes only what changed.
 */
export class FlashWhiteout {
  readonly el: HTMLDivElement;
  private lastMask = '';
  private lastAlpha = -1;
  private carried = 0;

  constructor(host: HTMLElement) {
    this.el = host.ownerDocument.createElement('div');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.dataset.flashWhiteout = '';
    this.el.style.cssText = BASE_STYLE;
    this.el.hidden = true;
    host.appendChild(this.el);
  }

  /** The alpha this overlay last DREW (0 while hidden) — the `prevAlpha` the
   *  next frame's model ramps a re-flash from (gate fix F3). */
  get carriedAlpha(): number {
    return this.carried;
  }

  /** Draw one frame (`feather` off drops the soft edge — the motion setting). */
  render(frame: WhiteoutFrame, screen: WhiteoutScreen | null, feather: boolean): void {
    if (frame.hidden || screen === null) {
      this.hide();
      return;
    }
    this.el.hidden = false;
    this.carried = frame.alpha;
    if (frame.alpha !== this.lastAlpha) {
      this.lastAlpha = frame.alpha;
      this.el.style.opacity = String(frame.alpha);
    }
    const mask = whiteoutMask(screen.x, screen.y, frame.holeR, whiteoutFeatherPx(frame.holeR, feather));
    if (mask === this.lastMask) return;
    this.lastMask = mask;
    this.el.style.setProperty('mask-image', mask);
    this.el.style.setProperty('-webkit-mask-image', mask);
  }

  /** Take the overlay off (spectate, results, lapsed). Idempotent. */
  hide(): void {
    this.el.hidden = true;
    this.carried = 0;
  }

  /** Remove the element (session teardown with no page reload behind it). */
  destroy(): void {
    this.el.remove();
  }
}
