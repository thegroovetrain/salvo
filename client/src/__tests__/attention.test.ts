// The attention seam (render/attention.ts, Story 3.2 / amendment 16): the first
// consumer of EXPERIENCE.md's attention-priority table. Tier 1 (threat) owns the
// eye; Tier 2 (the in-storm vignette) holds at its lit keyframe while it does.
// Pure logic only — the predicates come from their owning modules, and the
// composition is what these tests pin.

import { describe, it, expect } from 'vitest';
import { holdAtLitKeyframe, tier1Active } from '../render/attention.js';
import { railPulsing } from '../render/hud.js';
import { DeniedPulse, PULSE_DURATION_MS, pulseLiveAt } from '../render/deniedFire.js';
import { vignetteAlpha } from '../render/zone.js';
import { CLIENT_CONFIG } from '../config.js';

const V = CLIENT_CONFIG.vitals;
const Z = CLIENT_CONFIG.zone;

describe('tier1Active — the threat channels (amendment 16)', () => {
  it('is false on a healthy hull with no denial in flight', () => {
    expect(tier1Active({ hpFrac: 1, deniedLive: false })).toBe(false);
    expect(tier1Active({ hpFrac: V.amberBelow, deniedLive: false })).toBe(false);
  });

  it('is true whenever the HP rail is actually breathing (its OWN threshold)', () => {
    // Deliberately no second threshold in attention.ts: the rail's gate IS the
    // condition, so the two can never drift apart.
    for (const frac of [0.49, 0.3, 0.24, 0.1, 0]) {
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(railPulsing(frac));
      expect(tier1Active({ hpFrac: frac, deniedLive: false })).toBe(true);
    }
    expect(railPulsing(V.amberBelow)).toBe(false); // exactly 50% is not yet a threat
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
});
