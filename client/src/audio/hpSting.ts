// THE BAND STINGS' wiring (Story 4.7, extracted post-landing) — the functions
// main.ts's `playHpSting` composes every frame, pulled out to their
// own module PURELY so a test file can import them. main.ts is the Pixi/DOM
// bootstrap that no test touches, so before this extraction the call site was
// unpinned even though the edge math it calls (`hpBandEdge`, audio/tones.ts)
// was thoroughly covered — the exact shape of amendment 60's lesson, where a
// cue's type-level check passed the whole time while its call site was dead.
//
// Zero Pixi, zero DOM, zero AudioContext, zero import from main.ts: the two
// edge functions are pure data in, data out, and the floor is the one piece of
// state (owned by main.ts, passed in). main.ts keeps the `wasHpFrac` value, the
// floor instance, the `audio.play(...)` call, and the spectate reset — this
// module only decides the questions upstream of those: what fraction is there
// to read, which cue (if any) that fraction's crossing earns, and whether the
// mix will take another one yet.

import { CLIENT_CONFIG } from '../config.js';
import type { OwnStatus } from '../render/hud.js';
import { ToneFloor } from '../render/gunneryFeed.js';
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

/**
 * THE STINGS' SAME-SOURCE FLOOR (review gate) — the RATIFIED 300ms value, read
 * from `CLIENT_CONFIG.gunnery.hitCallToneFloorMs` exactly as every world cue
 * reads it. Amendment 37 forbids inventing a second floor constant when one
 * already answers this question, and this is that question: how often may one
 * source make a noise.
 */
export function hpStingFloor(): ToneFloor {
  return new ToneFloor(CLIENT_CONFIG.gunnery.hitCallToneFloorMs);
}

/**
 * The cue this frame earns, BOUNDED — `hpStingCue` plus the floor above.
 *
 * The stings shipped unbounded on the reasoning that an edge cannot repeat: the
 * band is only re-armed by recovering above it, so crossing it twice takes a
 * heal in between. That is wrong under sustained fire. DAMAGE CONTROL regen pays
 * into `hp` every server tick while incoming rounds subtract from it, so a hull
 * held around 50% crosses the band downward again and again — one sting per
 * crossing, several a second, exactly the machine-gun the floor exists to stop.
 *
 * THE EDGE IS CONSUMED EITHER WAY. The caller stores this frame's fraction
 * regardless of whether the cue was voiced, so a refused sting is silent rather
 * than deferred: a late alarm is a lie about when the band was crossed, which is
 * the horn's drop-don't-queue rule (amendment 56) applied here.
 *
 * A PROPER HYSTERESIS MARGIN IS AN OPEN QUESTION FOR THE OWNER, NOT FOR US. The
 * structurally correct fix for band chatter is a re-arm margin — require the
 * hull to climb some way back ABOVE the threshold before the sting re-arms — but
 * how far is a FEEL number, and feel numbers are Eric's (the draft-copy rule).
 * The floor bounds the pathological case without ruling on it. Do not invent a
 * margin here; ledger it for the listening pass.
 */
export function hpStingCueAt(
  prevFrac: number | null,
  frac: number | null,
  nowMs: number,
  floor: ToneFloor,
): HpCueId | null {
  const cue = hpStingCue(prevFrac, frac);
  if (!cue) return null;
  return floor.request(nowMs) ? cue : null;
}
