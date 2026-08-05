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

/** ToneId -> the visual channel that carries the SAME information, muted. */
export const TONE_TWINS: Record<ToneId, string> = {
  fireGun: 'muzzle flash on the firing hull + the shell leaving under dead reckoning (render/effects, projectiles)',
  fireTorp: 'the fish itself + its wake trail on the water (render/projectiles, effects torpwake)',
  fireMine: 'the armed mine marker appearing on the chart (render/mines)',
  fireCannon: 'muzzle flash + the heavier cannon shell in flight (render/effects, projectiles)',
  fireStarShells: 'the star shell climbing away + the lit zone it opens (render/projectiles, litZones)',
  placeDecoy: 'the buoy topmark appearing on the chart (render/decoys)',
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
  tick: 'the countdown seconds ticking down in the phase banner (ui/phase)',
  matchStart: 'the phase banner flipping from countdown to the live match (ui/phase)',
  stormWarn: 'the storm vignette closing in + the OUTSIDE tag in the HUD (render/zone, hud)',
  telegraphUp: 'the engine-order detent stepping AHEAD on the helm telegraph (render/hud, input/telegraph)',
  telegraphDown: 'the engine-order detent stepping ASTERN on the helm telegraph (render/hud, input/telegraph)',
};

/** Pure: the visual twin named for a tone (the table is total over ToneId). */
export function toneTwin(id: ToneId): string {
  return TONE_TWINS[id];
}
