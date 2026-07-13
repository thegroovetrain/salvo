// Match-phase → HUD text mapping — pure (no Pixi/DOM), unit-tested. The
// renderer polls the public schema (matchPhase/countdownEndT/roster size) and
// feeds it through matchUx() every frame; the HUD diffs the strings.

import { CONFIG } from '@salvo/shared';

/** What the phase layer of the HUD shows this frame. */
export interface MatchUx {
  /** Top-center status line ('' when the phase needs none). */
  topLine: string;
  /** Small tag under the status line ('WEAPONS SAFE' in the ready room). */
  tag: string;
  /** Big center countdown text ('' unless counting down). */
  countdown: string;
}

const NONE: MatchUx = { topLine: '', tag: '', countdown: '' };

/** Seconds (ceil, floored at 0) until a server-time deadline. */
export function secondsUntil(deadlineT: number, serverNow: number): number {
  return Math.max(0, Math.ceil((deadlineT - serverNow) / 1000));
}

/**
 * Map the public match plane to HUD strings. `humans` is the roster size;
 * `countdownEndT`/`serverNow` are server ms (same clock as frames).
 */
export function matchUx(
  phase: string,
  humans: number,
  countdownEndT: number,
  serverNow: number,
): MatchUx {
  if (phase === 'waiting') {
    return {
      topLine: `AWAITING CAPTAINS ${humans}/${CONFIG.match.minHumans}`,
      tag: 'WEAPONS SAFE',
      countdown: '',
    };
  }
  if (phase === 'countdown') {
    return {
      topLine: 'MATCH STARTING',
      tag: 'WEAPONS SAFE',
      countdown: String(secondsUntil(countdownEndT, serverNow)),
    };
  }
  return NONE; // active (normal HUD) and finished (results overlay owns the screen)
}

/**
 * Spectator banner text. `winnerId` comes straight off the public schema
 * (ArenaState.winnerId — set once `finished`); per match.ts, "finished" only
 * happens once alive human hulls <= 1, so a winnerId match is the single
 * reliable "you didn't sink" signal (works for both an outright survivor and
 * the posthumous mutual-destruction winner). Dead-in-active (phase not yet
 * 'finished') always reads as a plain sinking.
 */
export function spectateBannerText(phase: string, winnerId: string, sessionId: string): string {
  if (phase !== 'finished') return 'SUNK — SPECTATING';
  return winnerId === sessionId ? 'VICTORY — AWAITING RESULTS' : 'MATCH OVER — SPECTATING';
}
