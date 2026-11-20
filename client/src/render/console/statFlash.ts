// THE LEVEL-UP STAT FLASH (Story 12.4, epic-12 amendments 5(d) and 6(b)).
// Eric 2026-11-19: *"When I gain a level, the increased stat's number in the
// HUD stat display should turn amber for a moment and then fade back to its
// normal color to indicate what has changed."*
//
// WHAT FLASHES: an index stat whose BONUS (`you.ib[stat]`, the self-private
// seat the level roll and the wreck picks both write) ROSE. Only the stats
// that rose; a 0 face changes nothing and flashes nothing; card picks and the
// Shift window move the value but not `ib`, so they never flash. The first
// observation after joining or a redeploy only SEEDS the memory (the HUD
// bar's `hide()` resets it), so a bonus that was already there never flashes.
//
// THE LOOK (APPROVED on the bench): amber (`colors.amber`) held `holdMs`, then
// a smoothstep blend back to the normal color over `fadeMs`
// (`CLIENT_CONFIG.statFlash`). Information, not motion: the motion setting
// never touches it. A hover preview's amber mark wins while it shows (the
// caller's rule, barShip.ts).
//
// ALLOCATION: none per frame — the memory is two fixed arrays, the blend is
// plain number math, and the caller drives the value Text's `tint` (the Text
// is filled WHITE), writing only when the color changes — a tint is a vertex
// color, so the fade never re-rasterizes the glyphs.

import { INDEX_IDS, bonusCount, type IndexBonus } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';

/** The flash's timing (`CLIENT_CONFIG.statFlash`), widened for test dials. */
export interface StatFlashTiming {
  readonly holdMs: number;
  readonly fadeMs: number;
}

/** Pure: the cubic smoothstep of `u`, clamped to [0, 1]. */
export function smoothstep01(u: number): number {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

/**
 * Pure: how amber a flash is `elapsedMs` after its rise — 1 through the hold,
 * then a smoothstep fall to 0 across the fade, 0 after. A flash that has not
 * started (negative or non-finite elapsed: no rise yet) is 0.
 */
export function flashAmount(elapsedMs: number, t: StatFlashTiming = CLIENT_CONFIG.statFlash): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (elapsedMs <= t.holdMs) return 1;
  if (!(t.fadeMs > 0)) return 0;
  return 1 - smoothstep01((elapsedMs - t.holdMs) / t.fadeMs);
}

/** One 8-bit channel of the mix, in place at `shift`. */
function mixChannel(from: number, to: number, k: number, shift: number): number {
  const a = (from >> shift) & 0xff;
  const b = (to >> shift) & 0xff;
  return Math.round(a + (b - a) * k) << shift;
}

/** Pure: the per-channel RGB mix of `from` → `to` at `k` (0 = from, 1 = to). */
export function mixColor(from: number, to: number, k: number): number {
  if (k <= 0) return from;
  if (k >= 1) return to;
  return mixChannel(from, to, k, 16) | mixChannel(from, to, k, 8) | mixChannel(from, to, k, 0);
}

/** Pure: a stat value's color `elapsedMs` after its rise — the smooth blend
 *  amber → `normal`. */
export function flashColor(
  elapsedMs: number,
  normal: number,
  amber: number = CLIENT_CONFIG.colors.amber,
  t: StatFlashTiming = CLIENT_CONFIG.statFlash,
): number {
  return mixColor(normal, amber, flashAmount(elapsedMs, t));
}

/**
 * THE RISE DETECTOR — the per-stat memory of `ib` (in `INDEX_IDS` order) and
 * the time each stat last rose. Pure-ish: `observe` mutates only itself.
 */
export class StatRises {
  private readonly seen: number[] = INDEX_IDS.map(() => 0);
  private readonly rose: number[] = INDEX_IDS.map(() => Number.NEGATIVE_INFINITY);
  private seeded = false;

  /** One frame's `ib` at `nowMs`. The first observation (or the first after
   *  `reset`) only seeds; after it, every stat whose count went UP stamps
   *  `nowMs`. A fall (a redeploy's fresh hull) only re-seeds that stat. */
  observe(ib: IndexBonus, nowMs: number): void {
    for (let i = 0; i < INDEX_IDS.length; i++) {
      const n = bonusCount(ib[INDEX_IDS[i]]);
      if (this.seeded && n > this.seen[i]) this.rose[i] = nowMs;
      this.seen[i] = n;
    }
    this.seeded = true;
  }

  /** ms — when stat `i` (an `INDEX_IDS` index) last rose; -Infinity never. */
  roseAt(i: number): number {
    return this.rose[i] ?? Number.NEGATIVE_INFINITY;
  }

  /** Forget everything: the next observation only seeds (join / redeploy). */
  reset(): void {
    this.seeded = false;
    this.rose.fill(Number.NEGATIVE_INFINITY);
  }
}
