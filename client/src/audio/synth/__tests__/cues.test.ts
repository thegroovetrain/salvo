// THE SHIPPED CUE TABLE (audio/synth/cues.ts): the picks resolve, the
// voice budget keeps its promise (own cues are never the ones dropped), and
// the admission rule drops far world cues first. Contracts only.

import { describe, it, expect } from 'vitest';
import { SHIP_CLASS_IDS } from '@salvo/shared';
import { CUES, CUE_TIER, ENGINE_PROFILES, LEGACY_FALLBACK, cueAdmitted, ownVoiceCeiling, type CueId } from '../cues.js';
import { CUE_SLOTS } from '../candidates/index.js';
import { TONES } from '../../tones.js';
import { CLIENT_CONFIG } from '../../../config.js';

const IDS = Object.keys(CUES) as CueId[];

describe('the cue table', () => {
  it('every cue plays a candidate take’s own layers (imported, never copied)', () => {
    // The pick record itself lives with the audition page
    // (client/scripts/audition/picked.ts, outside this project's sources); what
    // the game can pin is that no recipe was re-typed: every row's layers ARE
    // one candidate's layers, by reference.
    const takes = new Set(CUE_SLOTS.flatMap((s) => s.candidates.map((c) => c.recipe.layers)));
    for (const id of IDS) expect(takes.has(CUES[id].layers), id).toBe(true);
  });

  it('every cue has a family, a positive cap and a tier', () => {
    for (const id of IDS) {
      expect(CUES[id].family, id).toBeTruthy();
      expect(CUES[id].maxVoices, id).toBeGreaterThan(0);
      expect(['own', 'world'], id).toContain(CUE_TIER[id]);
    }
  });

  it('own and world cues never share a family', () => {
    const fams = (tier: string) => new Set(IDS.filter((id) => CUE_TIER[id] === tier).map((id) => CUES[id].family));
    const own = fams('own');
    for (const f of fams('world')) expect(own.has(f), f).toBe(false);
  });

  it('THE OWN-CUE PROMISE: the global cap leaves room for every own family at its cap at once', () => {
    const a = CLIENT_CONFIG.audio;
    expect(a.cueVoiceCap - a.worldCueVoiceCap).toBeGreaterThanOrEqual(ownVoiceCeiling());
    expect(a.farWorldCueVoiceCap).toBeLessThanOrEqual(a.worldCueVoiceCap);
  });

  it('every legacy fallback names a real tone', () => {
    for (const tone of Object.values(LEGACY_FALLBACK)) expect(TONES[tone as keyof typeof TONES]).toBeDefined();
  });

  it('there is an engine profile for every hull', () => {
    for (const id of SHIP_CLASS_IDS) expect(ENGINE_PROFILES[id], id).toBeDefined();
  });
});

describe('cueAdmitted', () => {
  const b = { cueVoiceCap: 10, worldCueVoiceCap: 6, farWorldCueVoiceCap: 3, farWorldFrom: 0.5 };

  it('own cues are never refused here (only the synth’s global and family caps bound them)', () => {
    expect(cueAdmitted('own', 1, 99, b)).toBe(true);
  });

  it('far world cues drop first, then near ones', () => {
    expect(cueAdmitted('world', 0.9, b.farWorldCueVoiceCap - 1, b)).toBe(true);
    expect(cueAdmitted('world', 0.9, b.farWorldCueVoiceCap, b)).toBe(false);
    expect(cueAdmitted('world', 0.1, b.farWorldCueVoiceCap, b)).toBe(true);
    expect(cueAdmitted('world', 0.1, b.worldCueVoiceCap, b)).toBe(false);
  });

  it('an absent or junk distance reads as near', () => {
    expect(cueAdmitted('world', undefined, b.farWorldCueVoiceCap, b)).toBe(true);
    expect(cueAdmitted('world', NaN, b.farWorldCueVoiceCap, b)).toBe(true);
  });
});
