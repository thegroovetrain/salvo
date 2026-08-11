// The attention seam (render/attention.ts, Story 3.2 / amendment 16, generalized
// by Story 4.8): the consumer of EXPERIENCE.md's attention-priority table.
// Tier 1 (threat) owns the eye; Tier 2 (ring pulse, in-storm vignette) holds at
// its lit keyframe while it does; Tier 3 (the bank chip) freezes at its dim
// keyframe under ANY higher tier. Pure logic only — the predicates come from
// their owning modules, and the composition is what these tests pin.

import { describe, it, expect } from 'vitest';
import {
  amberPulseWinner,
  freezeAtDimKeyframe,
  holdAtLitKeyframe,
  tier1Active,
  tier2Active,
} from '../render/attention.js';
import { railCritical, railPulsing } from '../render/hud.js';
import { DeniedPulse, PULSE_DURATION_MS, pulseLiveAt } from '../render/deniedFire.js';
import { easeHold, vignetteAlpha, vignetteHeld } from '../render/zone.js';
import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;
const Z = CLIENT_CONFIG.zone;

describe('tier1Active — the threat channels (amendments 16, 239)', () => {
  it('is false on a healthy hull with no denial in flight', () => {
    expect(tier1Active({ hpFrac: 1, deniedLive: false })).toBe(false);
    expect(tier1Active({ hpFrac: V.amberBelow, deniedLive: false })).toBe(false);
  });

  it('is true in the CRIMSON band, and only there (the rail exports the gate)', () => {
    // Deliberately no second threshold in attention.ts: the rail's own
    // `railCritical` IS the condition, so the two can never drift apart.
    for (const frac of [0.24, 0.1, 0]) {
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(railCritical(frac));
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(true);
    }
  });

  it('AMBER is a warning, not a threat — and the rail still breathes there', () => {
    // The proof amendment 239's change did not move the rail's display grammar:
    // at 40% hull the rail is breathing exactly as it always has, and Tier 1 is
    // nonetheless inactive.
    expect(railPulsing(0.4)).toBe(true);
    expect(tier1Active({ hpFrac: 0.4, deniedLive: false })).toBe(false);
    for (const frac of [0.49, 0.4, 0.3, 0.26]) {
      expect(railPulsing(frac)).toBe(true);
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(false);
    }
  });

  it('holds both band edges EXCLUSIVE, matching hpColor', () => {
    // Exactly 25% is amber (not critical); exactly 50% is phosphor (not pulsing).
    expect(railCritical(V.criticalBelow)).toBe(false);
    expect(tier1Active({ hpFrac: V.criticalBelow, deniedLive: false })).toBe(false);
    expect(tier1Active({ hpFrac: V.criticalBelow - 1e-9, deniedLive: false })).toBe(true);
    expect(railPulsing(V.amberBelow)).toBe(false);
    expect(railPulsing(V.amberBelow - 1e-9)).toBe(true);
  });

  it('is true while a denied-fire pulse is live, at any hull fraction', () => {
    expect(tier1Active({ hpFrac: 1, deniedLive: true })).toBe(true);
    expect(tier1Active({ hpFrac: null, deniedLive: true })).toBe(true);
  });

  it('treats a MISSING hull as no threat (null is not zero)', () => {
    // Spectating / the respawn gap: there is no hull to be critical, and a
    // null-reads-as-0 bug would pin the vignette lit for the rest of the match.
    expect(tier1Active({ hpFrac: null, deniedLive: false })).toBe(false);
    expect(tier1Active({ hpFrac: NaN, deniedLive: false })).toBe(false);
  });

  it('tracks a real DeniedPulse over its 80ms life', () => {
    const pulse = new DeniedPulse();
    const t0 = 1_000;
    expect(pulse.update(true, t0)).toBe(true);
    expect(tier1Active({ hpFrac: 1, deniedLive: pulse.liveAt(t0 + 10) })).toBe(true);
    expect(tier1Active({ hpFrac: 1, deniedLive: pulse.liveAt(t0 + PULSE_DURATION_MS) })).toBe(false);
  });

  it('liveAt is a READ — asking never triggers or extends the pulse', () => {
    const pulse = new DeniedPulse();
    expect(pulse.liveAt(0)).toBe(false);
    expect(pulse.liveAt(1_000_000)).toBe(false); // no update() = no pulse, ever
    pulse.update(true, 0);
    for (let t = 0; t < PULSE_DURATION_MS; t += 5) expect(pulse.liveAt(t)).toBe(true);
    expect(pulse.liveAt(PULSE_DURATION_MS + 1)).toBe(false);
    expect(pulseLiveAt(PULSE_DURATION_MS, PULSE_DURATION_MS)).toBe(false); // half-open window
  });
});

describe('Tier 1 -> Tier 2: the in-storm vignette holds at its lit keyframe', () => {
  const AMP = Z.vignetteAmp;
  const LIT = Z.vignetteBase + AMP;

  it('holds steady at max alpha for every frame a Tier-1 channel is live', () => {
    const hold = holdAtLitKeyframe(tier1Active({ hpFrac: 0.2, deniedLive: false }));
    expect(hold).toBe(true);
    for (const t of [0, 0.21, 0.45, 1.9, 12.7]) {
      expect(vignetteAlpha(true, t, AMP, hold)).toBeCloseTo(LIT, 9);
    }
  });

  it('resumes breathing the moment the channel clears', () => {
    const clear = holdAtLitKeyframe(tier1Active({ hpFrac: 0.9, deniedLive: false }));
    expect(clear).toBe(false);
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => vignetteAlpha(true, t, AMP, clear));
    expect(new Set(samples.map((a) => a.toFixed(6))).size).toBeGreaterThan(1); // it moves
    expect(Math.max(...samples)).toBeLessThanOrEqual(LIT + 1e-9); // and never past lit
  });

  it('holding is never DIMMER than breathing — a held channel does not vanish', () => {
    for (let t = 0; t < 3; t += 0.05) {
      expect(vignetteAlpha(true, t, AMP, true)).toBeGreaterThanOrEqual(
        vignetteAlpha(true, t, AMP, false) - 1e-9,
      );
    }
  });

  it('never overrides the storm gate: inside the ring there is no vignette', () => {
    expect(vignetteAlpha(false, 1.2, AMP, true)).toBe(0);
  });

  it('CLICK-SPAM in the storm never square-waves the full-screen vignette', () => {
    // The hazard the easing exists for: a player mashing fire while out of the
    // zone lands an ACCEPTED denial every PULSE_RATE_MS (300), each owning
    // Tier 1 for PULSE_DURATION_MS (80). A snapping hold turns that into ~3.3
    // full-amplitude flashes per second on a FULL-SCREEN wash — past the
    // ≤1.1Hz / ≤3-flashes-per-region floor. Driven here through the real
    // DeniedPulse + the real seam, three seconds of spam at 60fps.
    const pulse = new DeniedPulse();
    const FRAME_MS = 16;
    let hold = 0;
    const alphas: number[] = [];
    const breathing: number[] = [];
    const tiers: boolean[] = [];
    for (let i = 0; i * FRAME_MS < 3_000; i++) {
      const nowMs = i * FRAME_MS;
      pulse.update(true, nowMs); // a click every single frame
      const tier1 = tier1Active({ hpFrac: 1, deniedLive: pulse.liveAt(nowMs) });
      tiers.push(tier1);
      hold = easeHold(hold, holdAtLitKeyframe(tier1) ? 1 : 0, FRAME_MS);
      alphas.push(vignetteHeld(true, nowMs / 1000, AMP, hold));
      breathing.push(vignetteAlpha(true, nowMs / 1000, AMP, false));
    }
    // Tier 1 really is cycling on and off (the seam is not dead in this
    // scenario — this is exactly the square wave the vignette must not copy).
    expect(tiers.filter(Boolean).length).toBeGreaterThan(10);
    expect(tiers.filter((t) => !t).length).toBeGreaterThan(10);
    // ...yet in the steady state the wash RIPPLES rather than square-waves:
    // peak-to-peak, it covers well under a third of the breathing→lit delta
    // (a snapping hold covers the whole of it, 300ms in and 300ms out).
    const swing = alphas.map((a, i) => Math.abs(a - breathing[i]) / Math.abs(LIT - breathing[i]));
    const steady = swing.slice(Math.ceil(2_000 / FRAME_MS)); // last ~1s
    expect(Math.max(...steady) - Math.min(...steady)).toBeLessThan(0.35);
  });
});

describe('tier2Active — the match channels', () => {
  it('is the OR of the two Tier-2 channels', () => {
    expect(tier2Active({ inStorm: false, ringUrgent: false })).toBe(false);
    expect(tier2Active({ inStorm: true, ringUrgent: false })).toBe(true);
    expect(tier2Active({ inStorm: false, ringUrgent: true })).toBe(true);
    expect(tier2Active({ inStorm: true, ringUrgent: true })).toBe(true);
  });
});

describe('freezeAtDimKeyframe — Tier 3 under ANY higher tier (amendment 243)', () => {
  it('freezes under Tier 2 ALONE — the ratified table read literally', () => {
    // The asymmetry is deliberate: Tier 2 holds only "unless a Tier 1 channel is
    // active", while Tier 3 freezes under "any higher tier". In the storm on a
    // healthy hull, the bank chip stops breathing.
    const tier1 = tier1Active({ hpFrac: 1, deniedLive: false });
    const tier2 = tier2Active({ inStorm: true, ringUrgent: false });
    expect(tier1).toBe(false);
    expect(freezeAtDimKeyframe(tier1, tier2)).toBe(true);
  });

  it('covers every combination, and breathes only in the clear', () => {
    expect(freezeAtDimKeyframe(false, false)).toBe(false);
    expect(freezeAtDimKeyframe(true, false)).toBe(true);
    expect(freezeAtDimKeyframe(false, true)).toBe(true);
    expect(freezeAtDimKeyframe(true, true)).toBe(true);
  });
});

describe('amberPulseWinner — the amber corollary', () => {
  it('ranks the ring over the amber rail (the storm is what kills you)', () => {
    expect(amberPulseWinner({ ring: true, hpRail: true })).toBe('ring');
    expect(amberPulseWinner({ ring: true, hpRail: false })).toBe('ring');
    expect(amberPulseWinner({ ring: false, hpRail: true })).toBe('hpRail');
    expect(amberPulseWinner({ ring: false, hpRail: false })).toBe(null);
  });

  it('follows the ranked list in config, not a hard-coded order', () => {
    expect(CLIENT_CONFIG.attention.amberRank).toEqual(['ring', 'hpRail']);
  });

  it('below 25% the rail leaves the amber set entirely and BOTH ambers hold lit', () => {
    // At 40% hull with the ring urgent, the ring pulses and the amber rail holds.
    // At 20% the rail is crimson: it is no longer an amber channel at all, it is
    // Tier 1, under which every Tier-2 channel (the ring included) holds lit.
    const amberRail = railPulsing(0.4) && !railCritical(0.4);
    expect(amberPulseWinner({ ring: true, hpRail: amberRail })).toBe('ring');
    const crimson = tier1Active({ hpFrac: 0.2, deniedLive: false });
    expect(crimson).toBe(true);
    expect(holdAtLitKeyframe(crimson)).toBe(true);
    expect(railCritical(0.2)).toBe(true);
  });
});
