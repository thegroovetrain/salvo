// Helm key-glyph fade (Story 2.4, amendment 26). The W/S chips at the telegraph
// ladder's extremes and the A/D chips at the rudder track's extremes are a coach
// mark, not chrome: each PAIR fades permanently after 3 SUCCESSFUL inputs, and
// the two pairs count independently (a captain who has learned the telegraph but
// never touched the rudder keeps their A/D chips).
//
// "Successful input" is defined by the input pipeline, not by this module:
//   W/S — a Telegraph.step() that CHANGED the detent (the existing changed
//         boolean; a tap into an end stop is a no-op and never counts)
//   A/D — a rudder keydown ACTIVATION that reached the sim (once per physical
//         press, not per held frame)
// A suppressed input (settings overlay / results modal up) never reaches the
// keydown handlers at all, so it can never count.
//
// Progress persists under its OWN standalone `hullcracker.*` key (the ui/home.ts
// idiom: a pure sanitizer, a best-effort load/save shell, corrupt → unfaded).
// It is deliberately NOT part of the settings store: this is learned anatomy,
// not a preference, so RESET SETTINGS must not resurrect the chips.

import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;

/** The two independently-fading helm key pairs. */
export type HelmPair = 'ws' | 'ad';

/** Successful-input counts per pair (each capped at the fade count). */
export interface HelmProgress {
  ws: number;
  ad: number;
}

export const HELM_PAIRS: readonly HelmPair[] = ['ws', 'ad'];

/** A fresh captain: nothing learned, all four chips showing. */
export function zeroHelmProgress(): HelmProgress {
  return { ws: 0, ad: 0 };
}

/** Pure: one stored count → a sane integer in [0, glyphFadeCount]. Anything
 *  non-numeric / non-finite / negative reads as 0 (unfaded — the safe side:
 *  showing a coach mark again is harmless, hiding it wrongly is not). */
function coerceCount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(V.glyphFadeCount, Math.floor(v));
}

/** Pure: a fully-valid HelmProgress from ANY stored payload (garbage, a
 *  truncated write, `null`, a foreign object). Never throws. */
export function sanitizeHelmProgress(raw: unknown): HelmProgress {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Record<HelmPair, unknown>>;
  return { ws: coerceCount(o.ws), ad: coerceCount(o.ad) };
}

/** Pure: has this pair earned its permanent fade? */
export function pairFaded(progress: HelmProgress, pair: HelmPair): boolean {
  return progress[pair] >= V.glyphFadeCount;
}

/** Pure: the progress after ONE successful input on `pair` (capped, so a
 *  long-serving captain never overflows the stored count). */
export function countHelmInput(progress: HelmProgress, pair: HelmPair): HelmProgress {
  return { ...progress, [pair]: Math.min(V.glyphFadeCount, progress[pair] + 1) };
}

/**
 * Pure: a pair's chip alpha.
 *   • not yet faded            → 1 (fully visible)
 *   • faded, no fade start     → 0 (it was ALREADY faded when this session
 *                                   began — a reload must not replay the fade)
 *   • faded, motion off        → 0 (instant; the fade itself is motion)
 *   • faded, mid-fade          → a linear ramp 1 → 0 over `glyphFadeSec`
 */
export function glyphFadeAlpha(
  faded: boolean,
  fadeStartSec: number | null,
  nowSec: number,
  animate: boolean,
): number {
  if (!faded) return 1;
  if (!animate || fadeStartSec === null) return 0;
  const t = (nowSec - fadeStartSec) / V.glyphFadeSec;
  if (t <= 0) return 1;
  return t >= 1 ? 0 : 1 - t;
}

// --- localStorage shell (best-effort; the session still works without it) -----

/** Load the persisted progress; corrupt or unavailable storage → unfaded. */
export function loadHelmProgress(): HelmProgress {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(V.glyphKey);
  } catch {
    return zeroHelmProgress();
  }
  if (raw === null) return zeroHelmProgress();
  try {
    return sanitizeHelmProgress(JSON.parse(raw));
  } catch {
    return zeroHelmProgress(); // truncated / hand-edited write
  }
}

/** Best-effort persist (storage may be unavailable or full). */
export function saveHelmProgress(p: HelmProgress): void {
  try {
    localStorage.setItem(V.glyphKey, JSON.stringify(p));
  } catch {
    // the fade just won't survive this browser's next reload
  }
}

/**
 * The live fade progress. Counts only — the FADE ANIMATION's clock belongs to
 * the renderer (render/hud.ts), which owns the frame time. Writes through to
 * localStorage on every change, so a mid-match reload keeps what was learned.
 */
export class HelmGlyphStore {
  private progress: HelmProgress;

  constructor(initial: HelmProgress = loadHelmProgress()) {
    this.progress = initial;
  }

  get current(): HelmProgress {
    return this.progress;
  }

  faded(pair: HelmPair): boolean {
    return pairFaded(this.progress, pair);
  }

  /** Record ONE successful input for a pair. A no-op once the pair is faded
   *  (the count is capped), so a veteran never re-writes storage every keypress. */
  record(pair: HelmPair): void {
    if (this.faded(pair)) return;
    this.progress = countHelmInput(this.progress, pair);
    saveHelmProgress(this.progress);
  }
}

/** THE process-wide store — the input chokepoint writes it, the HUD reads it. */
export const helmGlyphs = new HelmGlyphStore();
