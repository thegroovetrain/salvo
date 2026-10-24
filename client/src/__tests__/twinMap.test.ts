// THE AUDIO↔VISUAL TWIN TABLE (audio/twinMap.ts) — EXPERIENCE.md's sound-map
// requirement pinned in code. The law: no cue is audio-only, so a muted player
// (or one who missed the sound) loses the flourish and nothing else.
//
// The TYPE system already forces a row per ToneId; what a type cannot force is
// that the row SAYS anything, or that it names a surface someone can go look
// at. That is this suite.

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { TONE_TWINS, toneTwin, type AudioCueId } from '../audio/twinMap.js';
import { TONES, type ToneId } from '../audio/tones.js';

/** Every cue that can SOUND — the tone table plus the cues on their own engine
 *  paths. The horn is the first of the latter (Story 4.5): it is not a ToneSpec,
 *  and the whole point of widening the key was that dodging `TONES` must not let
 *  a cue dodge its twin. */
const OFF_TABLE: AudioCueId[] = ['foghorn'];
const IDS = [...(Object.keys(TONES) as ToneId[]), ...OFF_TABLE];
const SRC = join(process.cwd(), 'src');

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

  it('every module a twin names in its parens exists — no row points a reviewer at a deleted surface', () => {
    // "render/effects, projectiles" → render/effects + render/projectiles: a bare
    // name inherits the directory of the path before it.
    const missing: string[] = [];
    let named = 0;
    for (const id of IDS) {
      for (const group of toneTwin(id).match(/\(([^)]*)\)/g) ?? []) {
        let dir = '';
        for (const part of group.slice(1, -1).split(',')) {
          const token = part.trim().split(/\s+/)[0];
          const m = /^(?:([a-z]+)\/)?([a-zA-Z]+)$/.exec(token);
          if (!m) continue;
          if (m[1]) dir = m[1];
          if (!dir) continue;
          named++;
          if (!existsSync(join(SRC, dir, `${m[2]}.ts`))) missing.push(`${id}: ${dir}/${m[2]}`);
        }
      }
    }
    expect(named).toBeGreaterThan(IDS.length); // non-vacuous: the parse found the pointers
    expect(missing).toEqual([]);
  });

  it('points each multi-surface cue at every surface that carries its twin', () => {
    // FIT: the toast + the slot (Story 4.x); BOUNTY: the moment + the state that
    // outlives it (Story 4.6); HP bands: the globe + the own plume (amendment 49);
    // FOGHORN: the bearing chevron + the own-honk bloom (amendment 55).
    const surfaces: [AudioCueId, RegExp[]][] = [
      ['fitCommon', [/ui\/upgradeToast/, /render\/hotbar/]],
      ['fitRare', [/ui\/upgradeToast/, /render\/hotbar/]],
      ['fitExclusive', [/ui\/upgradeToast/, /render\/hotbar/]],
      ['bounty', [/ui\/upgradeToast/, /ui\/chromeBar/]],
      ['hpHurt', [/render\/hpGlobe/, /render\/smoke/]],
      ['hpCritical', [/render\/hpGlobe/, /render\/smoke/]],
      ['foghorn', [/render\/foghorn/, /render\/effects/]],
    ];
    for (const [id, patterns] of surfaces) for (const re of patterns) expect(toneTwin(id), id).toMatch(re);
  });

  it('points the world cues at render/ and the ECONOMY and VITALS rows at the HUD bar\'s own surfaces (ruling 12)', () => {
    for (const id of ['gunReport', 'impact', 'splash', 'sunkWitness'] as const) {
      expect(toneTwin(id), id).toMatch(/render\/effects/);
    }
    expect(toneTwin('point')).toMatch(/render\/xpStrip/);
    expect(toneTwin('heal')).toMatch(/render\/hpGlobe/);
    for (const id of ['damage', 'burn'] as const) expect(toneTwin(id), id).toMatch(/hpGlobe\)/);
    for (const id of ['telegraphUp', 'telegraphDown'] as const) {
      expect(toneTwin(id), id).toMatch(/render\/helmGlobe/);
    }
    expect(toneTwin('denied')).toMatch(/hotbar/);
  });
});
