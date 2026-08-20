// THE AUDIO↔VISUAL TWIN TABLE (Story 2.9) — EXPERIENCE.md's sound-map
// requirement, satisfied IN CODE rather than in a document that can drift.
//
// THE LAW IT ENCODES: every cue the client can play has a VISUAL twin carrying
// the same information, so a muted player (or one who simply missed the sound)
// loses nothing but the flourish. That law is only worth as much as its
// enforcement, so this table is exhaustive over `ToneId` at the TYPE level and
// pinned non-empty by __tests__/twinMap.test.ts: adding a tone without naming
// its twin fails the type-check, and naming a twin that says nothing fails the
// suite.
//
// Each row names the SURFACE the twin actually renders on (module in
// parentheses), not an adjective — the point is that a reviewer can go look at
// it. Rows are prose, deliberately: this is a map for humans, and nothing reads
// it at runtime.

import type { ToneId } from './tones.js';

/**
 * Every cue the client can SOUND, whichever engine path plays it (Story 4.5).
 *
 * The table's key widened from `ToneId` to this the moment the foghorn shipped
 * on its own play path (`Audio.playHorn`, outside the `TONES` table): the
 * accessibility floor is a property of AUDIBLE CUES, not of one code path, so a
 * cue that dodges `ToneSpec` must not thereby dodge its visual twin. The name
 * `TONE_TWINS` is kept deliberately — the law is unchanged and no call site
 * should have to move for a type widening.
 */
export type AudioCueId = ToneId | 'foghorn';

/** AudioCueId -> the visual channel that carries the SAME information, muted. */
export const TONE_TWINS: Record<AudioCueId, string> = {
  fireGun: 'muzzle flash on the firing hull + the shell leaving under dead reckoning (render/effects, projectiles)',
  fireTorp: 'the fish itself + its wake trail on the water (render/projectiles, effects torpwake)',
  fireMine: 'the armed mine marker appearing on the chart (render/mines)',
  fireBroadside: 'muzzle flash + the heavier broadside shells in flight (render/effects, projectiles)',
  fireStarShells: 'the star shell climbing away + the lit zone it opens (render/projectiles, litZones)',
  placeBuoy: 'the buoy topmark appearing on the chart (render/buoys)',
  denied: '80ms denied-red edge pulse on the weapon arc/reticle and the slot (render/deniedFire, hotbar)',
  damage: 'screen shake + the HP rail dropping in the vitals cluster (render/shake, hud)',
  kill: 'the kill-feed line naming your victim (ui/killFeed)',
  point: 'the banked-level chip + the "LEVEL UP — TAB TO REFIT" cue line (render/xpRail)',
  fitCommon: 'the ◆ FITTED toast + the slot fit flash + the new tooltip row (ui/upgradeToast, render/hotbar)',
  fitRare: 'the ◆ FITTED toast + the slot fit flash + the new tooltip row (ui/upgradeToast, render/hotbar)',
  fitExclusive: 'the ◆ FITTED toast + the slot fit flash + the new tooltip row, plus the doctrine\'s on-water identity (ui/upgradeToast, render/hotbar)',
  heal:
    'the HP rail jumping the instant amount + its dimmed INCOMING band for the pool still draining, and the DAMAGE CONTROL rail going inert at full hp (render/hud, ui/upgradeMenu)',
  burn: 'the burning zone under your hull + the HP rail dropping in the vitals cluster (render/litZones, hud)',
  hitCall:
    'the Hit Call bloom at the impact point, drawn above the fog so a connection you cannot see still shows (render/effects)',
  slowed: 'the SLOWED tell + its countdown above the vitals cluster (render/hud)',
  dazzled: 'the DAZZLED tell + its countdown above the vitals cluster, plus the shrunken sight hole (render/hud, fog)',
  sink: 'the sinking-hull effect + the elimination modal (render/effects, ui/results)',
  // --- THE BOUNTY (Story 4.6, Eric rulings 2026-08-10) ------------------------
  // The cue fires only when the throne lands on YOU, and its twin has to carry
  // the same one fact: you are the marked ship. Two surfaces, both text — the
  // YOU ARE THE KILL LEADER toast (the moment) and the persistent `☠︎ <NAME>`
  // register in the chrome bar naming the holder (the state, which outlives
  // the toast). NOTHING on the water twins this cue, deliberately: the ruling
  // that shipped the bounty deleted every positional cue it was originally
  // drawn with.
  bounty:
    'the YOU ARE THE KILL LEADER toast (ui/upgradeToast) + the persistent kill-leader register naming the holder in the chrome bar (ui/chromeBar, render/hud)',
  // --- THE AGGRO STINGS (Story 5.6, epic-5 amendment 40) ----------------------
  // The easiest twin in the table to name, because the ruling that created the
  // cue created the visual FIRST and the audio second: the bracket is the whole
  // signal, dual-coded by SHAPE precisely so it survives greyscale drones,
  // colourblind assist and a muted player at the same time. The stings only
  // tell you WHEN to look.
  aggroLock:
    'the amber bracket snapping closed around the fleet hull\'s chevron and holding, static, for as long as it has you (render/aggro, contacts)',
  aggroRelease:
    'the same bracket breaking apart at its corners and fading over ~400ms, leaving the chevron bare (render/aggro, contacts)',
  // --- THE SOUND MAP (Story 4.7, Eric ruling 2026-08-10) ----------------------
  // These six are the first cues in the table that are not about YOU, which
  // makes their twins unusually easy to name honestly: every one of them rides
  // an event the client had already received and ALREADY DRAWN. The cue does not
  // reveal the mark — the mark was always there — it points your ear at it. So a
  // muted player is in exactly the position every player was in before this
  // story landed, which is the strongest form of the twin law this table has.
  gunReport:
    'the muzzle flash at the shooter\'s position, drawn above the fog inside the 5/8 halo (render/effects `muzzle`)',
  impact:
    'the spark hit bloom at the connection, the contracting pierce ring on a punch-through, and the amber burst ring at a gun shell\'s blast point (render/effects)',
  splash: 'the expanding splash ring at the fall of shot, drawn above the fog (render/effects `splash`)',
  sunkWitness:
    'the crimson sink ring expanding where the hull went down, plus the kill-feed line naming the loss (render/effects, ui/killFeed)',
  // The band stings are the one place where amendment 49's parked question —
  // "should wounded smoke be voiced?" — answers itself. The smoke tiers and the
  // HP rail bands are the SAME two thresholds (CONFIG.damageBands), so the sting
  // at each downward crossing IS the moment your own plume starts or thickens,
  // and the row can name the plume beside the rail without stretching. Own smoke
  // rides the ordinary `sm` row with no special case (amendment 46), so the
  // smoking captain really does see their own column.
  hpHurt:
    'the HP rail turning amber and starting to breathe in the vitals cluster (render/hud), and your own light wounded-smoke plume beginning (render/smoke)',
  hpCritical:
    'the HP rail turning crimson and its pulse accelerating toward the photosensitivity cap (render/hud), and your own plume thickening to the heavy tier (render/smoke)',
  tick: 'the countdown seconds ticking down in the phase banner (ui/phase)',
  matchStart: 'the phase banner flipping from countdown to the live match (ui/phase)',
  stormWarn: 'the storm vignette closing in + the OUTSIDE tag in the HUD (render/zone, hud)',
  telegraphUp: 'the engine-order detent stepping AHEAD on the helm telegraph (render/hud, input/telegraph)',
  telegraphDown: 'the engine-order detent stepping ASTERN on the helm telegraph (render/hud, input/telegraph)',
  // --- THE FOGHORN (Story 4.5, amendment 55) ---------------------------------
  // A honk is BEARING-ONLY information, so its twin has to carry a bearing and
  // nothing more: a marker pinned to the viewport edge pointing down the honk,
  // its weight set by the volume BAND the listener earned (which eighth of their
  // own intel range the honker sits in — Story 4.9). Presence, direction and
  // band weight are INFORMATION and survive `motion: 'off'` intact (UX-DR36);
  // only the fade is a flourish. Your OWN honk gets the hull bloom instead — a
  // bearing to yourself is meaningless — which is why both surfaces are named.
  foghorn:
    'the screen-edge bearing chevron pointing down the honk, weighted by volume band (render/foghorn), plus the own-hull bloom for your own honk (render/effects)',
};

/** Pure: the visual twin named for a cue (the table is total over AudioCueId). */
export function toneTwin(id: AudioCueId): string {
  return TONE_TWINS[id];
}
