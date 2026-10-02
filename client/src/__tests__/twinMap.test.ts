// THE AUDIO↔VISUAL TWIN TABLE (audio/twinMap.ts) — EXPERIENCE.md's sound-map
// requirement pinned in code. The law: no cue is audio-only, so a muted player
// (or one who missed the sound) loses the flourish and nothing else.
//
// The TYPE system already forces a row per ToneId; what a type cannot force is
// that the row SAYS anything, or that it names a surface someone can go look
// at. That is this suite.

import { describe, expect, it } from 'vitest';
import { TONE_TWINS, toneTwin, type AudioCueId } from '../audio/twinMap.js';
import { TONES, type ToneId } from '../audio/tones.js';

/** Every cue that can SOUND — the tone table plus the cues on their own engine
 *  paths. The horn is the first of the latter (Story 4.5): it is not a ToneSpec,
 *  and the whole point of widening the key was that dodging `TONES` must not let
 *  a cue dodge its twin. */
const OFF_TABLE: AudioCueId[] = ['foghorn'];
const IDS = [...(Object.keys(TONES) as ToneId[]), ...OFF_TABLE];

describe('every audio cue has a visual twin', () => {
  it('covers every soundable cue exactly — no missing row, no orphan row', () => {
    expect(Object.keys(TONE_TWINS).sort()).toEqual([...IDS].sort());
  });

  it('names a real, non-empty twin for every cue', () => {
    const empty = IDS.filter((id) => toneTwin(id).trim().length === 0);
    expect(empty).toEqual([]);
  });

  it('points each twin at the SURFACE that renders it (a module in parens)', () => {
    const vague = IDS.filter((id) => !/\([a-z]+\/[a-zA-Z]/.test(toneTwin(id)));
    expect(vague).toEqual([]);
  });

  it('gives the whole FIT family a twin naming the toast, the slot and the row', () => {
    for (const id of ['fitCommon', 'fitRare', 'fitExclusive'] as const) {
      const twin = toneTwin(id);
      expect(twin).toContain('toast');
      expect(twin).toContain('fit flash');
      expect(twin).toContain('tooltip row');
    }
  });

  it('gives the BOUNTY a twin on BOTH its text surfaces — and none on the water', () => {
    // Story 4.6: the cue fires once, when the throne lands on you. Its twin has
    // to carry the same fact twice over — the moment (the toast) and the state
    // that outlives it (the chrome bar's register naming the holder). The
    // 2026-08-10 ruling deleted every positional cue, so no on-water surface
    // may appear here.
    const twin = toneTwin('bounty');
    expect(twin).toMatch(/toast/i);
    expect(twin).toMatch(/chrome bar/i);
    expect(twin).toMatch(/ui\/upgradeToast/);
    expect(twin).toMatch(/ui\/chromeBar/);
    expect(twin).not.toMatch(/radar|blip|bloom|ring|marker|halo/i);
  });

  it('gives every SOUND MAP cue a twin that was already on screen (Story 4.7)', () => {
    // The six world cues ride events the client had already received AND ALREADY
    // DRAWN — the cue points your ear at a mark, it never reveals one. So each
    // row must name the mark, and none of them may claim a surface this story
    // invented (it invented none).
    const surfaces: Record<string, RegExp> = {
      gunReport: /muzzle flash/i,
      impact: /spark|bloom|burst/i,
      splash: /splash ring/i,
      sunkWitness: /sink ring/i,
    };
    for (const [id, pattern] of Object.entries(surfaces)) {
      expect(toneTwin(id as AudioCueId), id).toMatch(pattern);
      expect(toneTwin(id as AudioCueId), id).toMatch(/render\//);
    }
  });

  it('gives the HP band stings BOTH the globe and the smoke plume (amendment 49, answered)', () => {
    // The smoke tiers and the HP globe's bands are the SAME two thresholds
    // (CONFIG.damageBands), so the sting at a downward crossing IS the moment
    // your own plume starts or thickens. Naming only the globe would drop half
    // the twin — and own smoke really does reach its own captain (amendment 46).
    for (const id of ['hpHurt', 'hpCritical'] as const) {
      const twin = toneTwin(id);
      expect(twin, id).toMatch(/HP globe/i);
      expect(twin, id).toMatch(/smoke|plume/i);
      expect(twin, id).toMatch(/render\/hpGlobe/);
      expect(twin, id).toMatch(/render\/smoke/);
    }
  });

  // --- STORY 8.6: THE HUD BAR ---------------------------------------------------
  //
  // The three corners became one bar, and three surfaces this table pointed at
  // ceased to exist: the bottom-left XP RAIL (now the XP strip), the bottom-right
  // HP RAIL (now the HP globe) and the telegraph cluster (now the helm globe's
  // tick arc). A row that still named one would send a reviewer to a deleted
  // module — which is the exact failure the "name the surface" rule exists to
  // prevent, so it is pinned rather than trusted.
  it('points the ECONOMY and VITALS rows at the bar\'s own surfaces (ruling 12)', () => {
    expect(toneTwin('point')).toContain('TAB TO REFIT');
    expect(toneTwin('point')).toMatch(/render\/xpStrip/);
    expect(toneTwin('point')).not.toMatch(/LEVEL UP/); // the prefix is the toast's
    expect(toneTwin('heal')).toMatch(/pending band/i);
    expect(toneTwin('heal')).toMatch(/render\/hpGlobe/);
    for (const id of ['damage', 'burn'] as const) expect(toneTwin(id), id).toMatch(/hpGlobe\)/);
    for (const id of ['telegraphUp', 'telegraphDown'] as const) {
      expect(toneTwin(id), id).toMatch(/render\/helmGlobe/);
    }
    // ...and the DENIED row still names the slot surface, which survived the
    // re-cut under its own name (ruling 12).
    expect(toneTwin('denied')).toMatch(/hotbar/);
  });

  it('names NO retired surface — no rail, no vitals cluster, no xpRail module', () => {
    const stale = IDS.filter((id) => /xpRail|HP rail|XP rail|vitals cluster/i.test(toneTwin(id)));
    expect(stale).toEqual([]);
  });

  it('gives the FOGHORN a twin that carries a BEARING — the only thing the honk says', () => {
    const twin = toneTwin('foghorn');
    expect(twin).toMatch(/bearing/i);
    expect(twin).toMatch(/chevron/i);
    // Your own honk gets a hull bloom instead of a chevron (amendment 55), so
    // the row has to name both surfaces or the muted own-honk has no twin.
    expect(twin).toMatch(/bloom/i);
  });
});
