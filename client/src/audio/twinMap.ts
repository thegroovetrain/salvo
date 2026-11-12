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
import type { CueId } from './synth/cues.js';

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
export type AudioCueId = ToneId | 'foghorn' | CueId | 'engine' | 'stormBed';

/** AudioCueId -> the visual channel that carries the SAME information, muted. */
export const TONE_TWINS: Record<AudioCueId, string> = {
  fireGun: 'muzzle flash on the firing hull + the shell leaving under dead reckoning (render/effects, projectiles)',
  fireTorp: 'the torpedo itself + its wake trail on the water (render/projectiles, effects torpwake)',
  fireMine: 'the armed mine marker appearing on the chart (render/mines)',
  fireBroadside: 'muzzle flash + the heavier broadside shells in flight (render/effects, projectiles)',
  fireStarShells: 'the star shell climbing away + the lit zone it opens (render/projectiles, litZones)',
  denied: '80ms denied-red edge pulse on the weapon arc/reticle and on the weapons console\'s row or ability button (render/deniedFire, render/console/weaponsConsole)',
  damage: 'screen shake + the ship console\'s hull percent and bar dropping (render/shake, render/console/shipConsole)',
  kill: 'the kill-feed line naming your victim (ui/killFeed)',
  point: 'the ship console\'s banked-level chip + the offer group\'s cards arriving in their corner (render/console/shipConsole, ui/offerGroup)',
  fitCommon: 'the ◆ FITTED toast + the consoles\' readouts changing to the new values (ui/upgradeToast, render/console/shipConsole, weaponsConsole)',
  fitRare: 'the ◆ FITTED toast + the consoles\' readouts changing to the new values (ui/upgradeToast, render/console/shipConsole, weaponsConsole)',
  fitExclusive: 'the ◆ FITTED toast + the consoles\' readouts changing to the new values, plus the doctrine\'s on-water identity (ui/upgradeToast, render/console/shipConsole, weaponsConsole)',
  heal:
    'the ship console\'s hull percent and bar climbing, the lighter pooled-repair segment draining into it (render/console/shipConsole)',
  burn: 'the burning zone under your hull + the ship console\'s hull bar dropping (render/burnZones, render/console/shipConsole)',
  hitCall:
    'the Hit Call bloom at the impact point, drawn above the fog so a connection you cannot see still shows (render/effects)',
  slowed: 'the SLOWED tell + its countdown under the chrome bar (render/hud)',
  dazzled: 'the DAZZLED tell + its countdown under the chrome bar, plus the shrunken sight hole (render/hud, fog)',
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
  // --- THE SOUND MAP (Story 4.7, Eric ruling 2026-08-10) ----------------------
  // These six are the first cues in the table that are not about YOU, which
  // makes their twins unusually easy to name honestly: every one of them rides
  // an event the client had already received and ALREADY DRAWN. The cue does not
  // reveal the mark — the mark was always there — it points your ear at it. So a
  // muted player is in exactly the position every player was in before this
  // story landed, which is the strongest form of the twin law this table has.
  gunReport:
    'the muzzle flash at the shooter\'s position, drawn above the fog inside the flash-rung halo (render/effects `muzzle`)',
  impact:
    'the spark hit bloom at the connection, the contracting pierce ring on a punch-through, and the amber burst ring at a gun shell\'s blast point (render/effects)',
  splash: 'the expanding splash ring at the fall of shot, drawn above the fog (render/effects `splash`)',
  sunkWitness:
    'the crimson sink ring expanding where the hull went down, plus the kill-feed line naming the loss (render/effects, ui/killFeed)',
  // The band stings are the one place where amendment 49's parked question —
  // "should wounded smoke be voiced?" — answers itself. The smoke tiers and the
  // hull gauge's bands (the HP globe's until Story 10.10) are the SAME two thresholds (CONFIG.damageBands), so the
  // sting at each downward crossing IS the moment your own plume starts or
  // thickens, and the row can name the plume beside the gauge without
  // stretching. Own smoke rides the ordinary `sm` row with no special case
  // (amendment 46), so the smoking captain really does see their own column.
  hpHurt:
    'the ship console\'s hull gauge turning amber and starting to breathe (render/console/shipConsole), and your own light wounded-smoke plume beginning (render/smoke)',
  hpCritical:
    'the ship console\'s hull gauge turning crimson and its pulse accelerating toward the photosensitivity cap (render/console/shipConsole), and your own plume thickening to the heavy tier (render/smoke)',
  tick: 'the countdown seconds ticking down in the phase banner (ui/phase)',
  matchStart: 'the phase banner flipping from countdown to the live match (ui/phase)',
  stormWarn: 'the storm vignette closing in + the OUTSIDE tag in the HUD (render/zone, hud)',
  telegraphUp: 'the ordered detent stepping AHEAD on the ship console\'s helm ladder (render/console/shipConsole, input/telegraph)',
  telegraphDown: 'the ordered detent stepping ASTERN on the ship console\'s helm ladder (render/console/shipConsole, input/telegraph)',
  // --- HULL CONTACT (Story 9.5, amendment 79) ---------------------------------
  // The scrape says "you are pressed against something and sliding" — which the
  // water already shows: the own hull drawn hard against the other hull or the
  // coast, and the strike sparks where it first touched.
  grind:
    'the own hull drawn pressed against the other hull or the coast, plus the strike sparks where it first touched (render/ships, contactFx)',
  // --- THE FOGHORN (Story 4.5, amendment 55) ---------------------------------
  // A honk is BEARING-ONLY information, so its twin has to carry a bearing and
  // nothing more: a marker pinned to the viewport edge pointing down the honk,
  // its weight set by the volume BAND the listener earned (which twelfth of their
  // own intel range the honker sits in — Story 4.9). Presence, direction and
  // band weight are INFORMATION and survive `motion: 'off'` intact (UX-DR36);
  // only the fade is a flourish. Your OWN honk gets the hull bloom instead — a
  // bearing to yourself is meaningless — which is why both surfaces are named.
  foghorn:
    'the screen-edge bearing chevron pointing down the honk, weighted by volume band (render/foghorn), plus the own-hull bloom for your own honk (render/effects)',
  // --- THE SOUND PASS (Story 10.13) -------------------------------------------
  // The layered cues (audio/synth/cues.ts) and the engine. Every one rides a
  // fact the frame already DRAWS; the ids shared with the tone table above
  // (splash, denied, hitCall, matchStart, dazzled) keep their rows.
  mainBattery:
    'the muzzle flash on your hull + your main-battery shells leaving under dead reckoning (render/effects, projectiles)',
  secondaries: 'your secondary rounds streaming out from the hull (render/projectiles)',
  mainBatteryWorld:
    'the muzzle flash at the shooter\'s position, drawn above the fog inside the flash-rung halo (render/effects `muzzle`)',
  secondariesWorld:
    'the muzzle flash at the shooter\'s position plus its secondary rounds in flight beside it (render/effects, projectiles)',
  torpedoLaunch: 'the torpedo itself + its wake trail on the water (render/projectiles, effects)',
  torpedoRun: 'the torpedo running close by + its wake ribbon on the water (render/projectiles, wake)',
  mineDrop: 'the armed mine marker appearing on the chart (render/mines)',
  starShell: 'the star shell climbing away + the lit zone it opens (render/projectiles, litZones)',
  phosphorShell: 'the phosphor shell in flight + the burning zone it lights (render/projectiles, burnZones)',
  foulingShell: 'the fouling shell in flight + the foul zone it lays (render/projectiles, foulZones)',
  flashShell: 'the flash shell in flight + the white flash disc where it bursts (render/projectiles, flashBurst)',
  steelHit:
    'the spark hit bloom at the connection, the contracting pierce ring on a punch-through, and the amber burst ring at a gun shell\'s blast point (render/effects)',
  ownHit:
    'screen shake sized to the blow + the ship console\'s hull percent and bar dropping (render/shake, render/console/shipConsole)',
  burning:
    'the burning zone under your hull + the ship console\'s hull bar dropping (render/burnZones, render/console/shipConsole)',
  repair:
    'the ship console\'s hull percent and bar climbing, the lighter pooled-repair segment draining into it (render/console/shipConsole)',
  smoke: 'the smoke cloud blooming on the water where it was laid (render/countermeasure)',
  beacon: 'the radio beacon markers surfacing on the water and the chart (render/beacons)',
  boostSurge:
    'the ship console\'s boost state lighting + the wake lengthening behind your hull (render/console/shipConsole, render/wake)',
  sinkWitness:
    'the crimson sink ring expanding where the hull went down, plus the kill-feed line naming the loss (render/effects, ui/killFeed)',
  levelUp:
    'the ship console\'s banked-level chip + the offer group\'s cards arriving in their corner (render/console/shipConsole, ui/offerGroup)',
  countdownTick: 'the countdown seconds ticking down in the phase banner (ui/phase)',
  telegraph:
    'the ordered detent stepping ahead or astern on the ship console\'s helm ladder (render/console/shipConsole, input/telegraph)',
  ramGrind:
    'the own hull drawn pressed against the other hull or the coast, plus the strike sparks where it first touched (render/ships, contactFx)',
  propFouled: 'the SLOWED tell + its countdown under the chrome bar (render/hud)',
  // Wave C (Eric's round-3 picks). The kill and the fit replace legacy tones
  // whose rows above (kill, fit*) keep serving their fallbacks.
  airdropChime: 'the airdrop pickup\'s stat toast naming what you hauled aboard (ui/upgradeToast)',
  killSound: 'the kill-feed line naming your victim (ui/killFeed)',
  cardFitted:
    'the ◆ FITTED toast + the consoles\' readouts changing to the new values (ui/upgradeToast, render/console/shipConsole, weaponsConsole)',
  // `bounty` keeps its row above (same id).
  // THE KLAXON replaces the two hp stings and the own sink tone (their rows
  // above stay — they are its fallbacks): one blast / three blasts at the hull
  // gauge's two band edges, and the repeat while the own hull sinks.
  klaxon:
    'the ship console\'s hull gauge turning amber, then crimson, at the band edges (render/console/shipConsole), and while sinking the sinking hull itself and the elimination modal (render/effects, ui/results)',
  // The STORM BED is continuous, like the engine: it says you are inside the storm.
  stormBed:
    'the storm ring closing in and its vignette while you are outside the safe water, plus the storm damage on the ship console\'s hull bar (render/zone, render/console/shipConsole)',
  // The ENGINE is continuous, not a cue: it follows your helm order and your
  // speed, both of which the console and the water already show — and another
  // ship's engine only while that hull is drawn close alongside.
  engine:
    'the ordered detent on the ship console\'s helm ladder and the speed readout, plus the wake behind each hull drawn close alongside (render/console/shipConsole, render/wake, render/contacts)',
};

/** Pure: the visual twin named for a cue (the table is total over AudioCueId). */
export function toneTwin(id: AudioCueId): string {
  return TONE_TWINS[id];
}
