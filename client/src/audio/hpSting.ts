// THE BAND STINGS' wiring (Story 4.7, extracted post-landing) — the two
// functions main.ts's `playHpSting` composes every frame, pulled out to their
// own module PURELY so a test file can import them. main.ts is the Pixi/DOM
// bootstrap that no test touches, so before this extraction the call site was
// unpinned even though the edge math it calls (`hpBandEdge`, audio/tones.ts)
// was thoroughly covered — the exact shape of amendment 60's lesson, where a
// cue's type-level check passed the whole time while its call site was dead.
//
// Zero Pixi, zero DOM, zero AudioContext, zero import from main.ts: both
// functions are pure data in, data out. main.ts keeps the `wasHpFrac` state,
// the `audio.play(...)` call, and the spectate reset — this module only
// decides the two questions upstream of those: what fraction is there to
// read, and which cue (if any) that fraction's crossing earns.

import type { OwnStatus } from '../render/hud.js';
import { hpBandEdge } from './tones.js';

/** Which of the two Story 4.7 band cues fires, or none. */
export type HpCueId = 'hpHurt' | 'hpCritical';

/**
 * The own hull fraction the sting reads, or NULL when there is no live hull to
 * take one from.
 *
 * NULL IS NOT ZERO — the same warning `hpBandEdge` and render/attention.ts
 * carry about their own hp fractions: a dead or unfitted hull that reported 0
 * would read as "just crossed critical", firing the critical sting at the
 * instant you die and again on every spectate frame after. Dead, spectating,
 * and a nonsensical `maxHp` (never divide by a boon mid-swap) all resolve to
 * null instead.
 */
export function ownHpFrac(status: Pick<OwnStatus, 'hp' | 'alive' | 'stats'>): number | null {
  const maxHp = status.stats.maxHp;
  return status.alive && maxHp > 0 ? status.hp / maxHp : null;
}

/**
 * Which cue, if any, this frame's fraction earns — a thin id-mapping wrapper
 * around `hpBandEdge` so the band thresholds (0.5 / 0.25, read from shared
 * CONFIG) and the downward-only / re-arming / worse-one-only rules exist in
 * exactly one place. This function adds no logic of its own; it only turns
 * `hpBandEdge`'s `'hurt' | 'critical' | null` into the tone ids the audio
 * layer plays.
 */
export function hpStingCue(prevFrac: number | null, frac: number | null): HpCueId | null {
  const band = hpBandEdge(prevFrac, frac);
  if (band === 'critical') return 'hpCritical';
  if (band === 'hurt') return 'hpHurt';
  return null;
}
