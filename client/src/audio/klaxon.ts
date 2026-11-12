// THE KLAXON (Story 10.13 wave C, Eric 2026-11-11 — `klaxon` take C, "an
// octave down"). One voice for the three hull alarms it replaces:
//   • the hull falls under HALF (the `hpHurt` edge)    → ONE blast
//   • the hull falls under a QUARTER (`hpCritical`)    → THREE blasts
//   • the own SINKING window (`sink`)                  → the blast repeating
//     for the whole window, under the SinkFade insert (audio/engineMix.ts),
//     so it muffles and fades as the ship takes on water and ends in silence.
// The legacy tones stay as the fallbacks of the first blast.
//
// The decisions (how many blasts, when the next sinking blast is due) are
// pure functions; `Klaxon` is the small host that plays them and stops every
// blast it still holds when the hull is gone (founder / spectate / respawn /
// match over). A sinking blast is capped to the window's remaining time, so
// none is ever left sounding past it.

import type { HpBand, ToneId } from './tones.js';
import type { CueRecipe } from './synth/recipe.js';
import { klaxonStepS as candidateStepS } from './synth/candidates/round3.js';

/** Blasts per band edge (Eric 2026-11-11: under half one, under a quarter three). */
export const KLAXON_BLASTS: Readonly<Record<HpBand, number>> = { hurt: 1, critical: 3 };

/** The legacy tone each alarm's FIRST blast falls back to. */
const BAND_FALLBACK: Readonly<Record<HpBand, ToneId>> = { hurt: 'hpHurt', critical: 'hpCritical' };
const SINK_FALLBACK: ToneId = 'sink';

/** Pure: seconds from one blast's start to the next — the audition's own
 *  spacing for this take (candidates `klaxonStepS`), so the game plays the
 *  series Eric heard. */
export function klaxonStepS(recipe: CueRecipe): number {
  return candidateStepS(recipe);
}

/** Pure: the blast onsets (s from now) a band edge schedules — none without
 *  an edge, one for 'hurt', three in a row for 'critical'. */
export function klaxonBlasts(recipe: CueRecipe, band: HpBand | null): number[] {
  if (band === null) return [];
  const step = klaxonStepS(recipe);
  return Array.from({ length: KLAXON_BLASTS[band] }, (_, i) => i * step);
}

/**
 * Pure: is the next blast of the CONTINUOUS sinking alarm due? Due at once in
 * a fresh window (`lastAt` null), then every step; never outside the window.
 */
export function sinkingBlastDue(recipe: CueRecipe, sinking: boolean, lastAt: number | null, nowS: number): boolean {
  if (!sinking || !Number.isFinite(nowS)) return false;
  if (lastAt === null || !Number.isFinite(lastAt)) return true;
  return nowS - lastAt >= klaxonStepS(recipe);
}

/** One blast request: when, how long at most, and its fallback (null = none). */
export interface KlaxonBlast {
  delayS?: number;
  maxS?: number;
  fallback: ToneId | null;
}

/** A blast that can be ended early (synth/render.ts `ShotHandle`). */
export interface StoppableBlast {
  stop(fadeS?: number): void;
  readonly ended: boolean;
}

export class Klaxon {
  private live: StoppableBlast[] = [];
  private lastSinkAt: number | null = null;

  constructor(
    private readonly recipe: CueRecipe,
    private readonly play: (blast: KlaxonBlast) => StoppableBlast | null | void,
    private readonly now: () => number = () => performance.now() / 1000,
  ) {}

  /** A hull band edge (already floored and worse-edge-only by hpStingCueAt). */
  band(band: HpBand | null): void {
    klaxonBlasts(this.recipe, band).forEach((delayS, i) =>
      this.keep(this.play({ delayS, fallback: i === 0 && band ? BAND_FALLBACK[band] : null })),
    );
  }

  /**
   * THE OWN `sunk` EVENT (review P10): sound the first sinking blast from the
   * event itself — it must be heard even when the sinking window is never
   * rendered (the death ends the match, a spectate frame rides with the kill,
   * the tab is hidden). Fire-and-forget (a blast that must outlive the hull's
   * gates), and it seeds the per-frame repeat so the next frame never doubles it.
   */
  sinkStart(): void {
    if (this.lastSinkAt !== null) return;
    this.stopHeld(); // the hull alarms give their seats to the sinking alarm (P13b)
    if (this.play({ fallback: SINK_FALLBACK })) this.lastSinkAt = this.now();
  }

  /**
   * One frame. `sinkingLeftS` = seconds left in the own sinking window, or
   * null when not sinking. `live` = the own hull is still conned (false at
   * founder / spectate / match over — every held blast is stopped).
   */
  frame(live: boolean, sinkingLeftS: number | null): void {
    if (!live) return this.stopAll();
    if (sinkingLeftS === null || !(sinkingLeftS > 0)) {
      this.lastSinkAt = null;
      return;
    }
    const t = this.now();
    if (!sinkingBlastDue(this.recipe, true, this.lastSinkAt, t)) return;
    const first = this.lastSinkAt === null;
    if (first) this.stopHeld(); // P13b: pending hull alarms give way
    const blast = this.play({ maxS: sinkingLeftS, fallback: first ? SINK_FALLBACK : null });
    if (!blast) return; // P13a: not sounded (a cap, a muted bus) — tried again next frame
    this.lastSinkAt = t;
    this.keep(blast);
  }

  /** Stop every blast still held (sounding or scheduled) and re-arm the loop. */
  stopAll(): void {
    this.stopHeld();
    this.lastSinkAt = null;
  }

  private stopHeld(): void {
    for (const b of this.live) if (!b.ended) b.stop();
    this.live = [];
  }

  private keep(b: StoppableBlast | null | void): void {
    this.live = this.live.filter((x) => !x.ended);
    if (b) this.live.push(b);
  }
}
