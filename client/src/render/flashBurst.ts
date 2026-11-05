// THE FLASH SHELLS BURST (Eric 2026-10-29, epic-10 amendment 5(d)): "when they
// burst, i'd like to see it quickly burst into a black circle that quickly wipes
// to white and then disappears." A disc of the burst radius
// (`CONFIG.flashShells.radius`, world units) at the burst point: BLACK for
// `blackMs`, black → white across `wipeMs`, then white fading out across
// `fadeMs`, then removed (CLIENT_CONFIG.flashBurst).
//
// It replaces the ordinary burst ring ONLY for a FLASH SHELLS round's burst —
// the wire's `f` tag (everyone who sees the detonation sees the disc) or the
// shooter's own claim (roomBindings' `isFlashBurst`); any other burst renders
// as the ordinary ring. Drawn on the fog-immune burst layer (the chart
// root, above the water, under the HUD), like every other burst mark.
//
// The math is the pure `flashBurstModel`; the class is a thin Pixi sink that
// ages each disc off the frame clock (no timers).

import { Graphics, type Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** One frame of a disc: `color01` 0 = black … 1 = white; `alpha` its opacity;
 *  `done` once the fade has run out (remove it). */
export interface FlashBurstFrame {
  color01: number;
  alpha: number;
  done: boolean;
}

/** ms — the disc's whole life: black + wipe + fade (the ONE derived total). */
export function flashBurstLifeMs(): number {
  const { blackMs, wipeMs, fadeMs } = CLIENT_CONFIG.flashBurst;
  return blackMs + wipeMs + fadeMs;
}

/**
 * Pure: the disc at `elapsedMs` since it burst — black and opaque through
 * `blackMs`, wiping linearly to white across `wipeMs`, then white fading
 * linearly to transparent across `fadeMs`; done at the end. A negative or
 * non-finite age reads as the first (black) frame.
 */
export function flashBurstModel(elapsedMs: number): FlashBurstFrame {
  const { blackMs, wipeMs, fadeMs } = CLIENT_CONFIG.flashBurst;
  const e = elapsedMs > 0 ? elapsedMs : 0; // also NaN
  if (e < blackMs) return { color01: 0, alpha: 1, done: false };
  if (e < blackMs + wipeMs) return { color01: (e - blackMs) / wipeMs, alpha: 1, done: false };
  const fade = (e - blackMs - wipeMs) / fadeMs;
  if (fade < 1) return { color01: 1, alpha: 1 - fade, done: false };
  return { color01: 1, alpha: 0, done: true };
}

/** Pure: the grey a `color01` reads as — black (0) to the palette white (1),
 *  per channel. */
export function flashBurstTint(color01: number): number {
  const c = Math.min(1, Math.max(0, color01));
  const w = CLIENT_CONFIG.colors.white;
  const ch = (shift: number): number => Math.round(((w >> shift) & 0xff) * c) << shift;
  return ch(16) | ch(8) | ch(0);
}

interface Disc {
  gfx: Graphics;
  bornMs: number;
}

/**
 * Pure: the disc's radius (world units) for one burst — the server's STAMPED
 * radius off the wire (`BurstEvent.r`, Story 10.5, 2026-11-05, epic-10
 * amendment 11: R7's +25 u a tier, stamped at launch), falling back to the base
 * `CONFIG.flashShells.radius` only when `r` is absent or unusable (a finite
 * positive number is the only thing a disc can be drawn at).
 */
export function flashDiscRadius(r: number | undefined): number {
  return typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : CONFIG.flashShells.radius;
}

/** The live FLASH SHELLS burst discs. */
export class FlashBursts {
  private readonly discs: Disc[] = [];

  constructor(
    private readonly layer: Container,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** A FLASH SHELLS round burst at (x, y) with the wire's stamped radius `r`
   *  (`flashDiscRadius`): start a disc now. */
  spawn(x: number, y: number, r?: number): void {
    const gfx = new Graphics().circle(0, 0, flashDiscRadius(r)).fill({ color: CLIENT_CONFIG.colors.white, alpha: 1 });
    gfx.position.set(x, y);
    gfx.tint = flashBurstTint(0);
    this.layer.addChild(gfx);
    this.discs.push({ gfx, bornMs: this.clock() });
  }

  /** Age every disc to `nowMs` (the frame clock spawn reads); remove the spent. */
  render(nowMs: number): void {
    for (let i = this.discs.length - 1; i >= 0; i -= 1) {
      const d = this.discs[i];
      const f = flashBurstModel(nowMs - d.bornMs);
      if (f.done) {
        d.gfx.destroy();
        this.discs.splice(i, 1);
        continue;
      }
      d.gfx.tint = flashBurstTint(f.color01);
      d.gfx.alpha = f.alpha;
    }
  }

  /** Live disc count — test/observation seam. */
  get liveCount(): number {
    return this.discs.length;
  }

  /** Drop every disc (session teardown). */
  clear(): void {
    for (const d of this.discs) d.gfx.destroy();
    this.discs.length = 0;
  }
}
