// THE HORN CATALOG (Story 4.5, amendments 52 + 57) — the monetization seam and
// the pure, testable half of the foghorn's audio engine. audio/context.ts is the
// thin AudioContext adapter that renders these voices; everything here is plain
// data plus one injectable cache, so it unit-tests in node with no WebAudio.
//
// WHY THIS FILE EXISTS AT ALL. The audio engine has been oscillator-and-noise
// only since Epic 1, with every cue capped at MAX_TONE_S (150ms; `sink` is the
// lone 450ms exemption). A ship's horn is ~1.8s and multi-layered, so it gets
// its OWN play path rather than an exemption to that ceiling — which keeps the
// ceiling meaningful for the 24 short cues it was written for (amendment 57).
//
// THE SEAM. `HornVoice` is a discriminated union: a `synth` voice is rendered
// from oscillators, a `sample` voice from a decoded recording. A licensed horn
// later is a file plus ONE catalog line — no code, wire, or protocol change. The
// sample arm is fully implemented and exercised by tests, but NO SHIPPED CATALOG
// ENTRY USES IT: no licensed or CC0 recording exists in this repo and none may
// be sourced unattended (amendment 57, recorded as a constraint, not a caveat).
//
// EXACTLY ONE HORN SHIPS. `HORNS` has a single entry, and it is total over the
// shared `HornId` catalog, so a new horn is a shared-catalog line plus a row
// here. **Adding a second horn is CONTENT and needs an Eric ruling** (amendment
// 52) — no cycle may invent horn variants.

import { DEFAULT_HORN_ID, type HornId } from '@salvo/shared';

/** One oscillator in a synthesized horn: a partial with its own body + weight. */
export interface HornSynthLayer {
  /** Hz. */
  freq: number;
  type: OscillatorType;
  /** Relative weight within the voice (the layer gains sum to ~1). */
  gain: number;
  /** Web Audio CENTS (100 = one semitone) — the slight mistuning that beats. */
  detuneCents?: number;
}

/** A horn rendered from oscillators (the shipped default). */
export interface HornSynthVoice {
  kind: 'synth';
  layers: HornSynthLayer[];
  /** Total sounding length, seconds. */
  durationS: number;
  /** Slow swell in, seconds. */
  attackS: number;
  /** Long tail out, seconds (measured back from `durationS`). */
  releaseS: number;
  /** 0..1 peak gain before the caller's tier multiplier. */
  volume: number;
}

/** A horn rendered from a decoded recording (the seam; unused by the catalog). */
export interface HornSampleVoice {
  kind: 'sample';
  url: string;
  /** 0..1 peak gain before the caller's tier multiplier. */
  volume: number;
}

export type HornVoice = HornSynthVoice | HornSampleVoice;

/** At most this many horns sound at once; a honk arriving at the cap is DROPPED
 *  from the mix (never queued, never voice-stolen). The cap protects the mix in
 *  a crowded room — and it drops HORNS, never CHEVRONS, so the visual twin
 *  survives even when the audio cannot (amendment 56). */
export const HORN_MAX_CONCURRENT = 3;

/** Sanity ceiling on a horn's length, seconds. Not the tone ceiling
 *  (`MAX_TONE_S`, which stays 150ms and is deliberately untouched) — this is the
 *  horn path's own bound, pinned by __tests__/horns.test.ts so a catalog entry
 *  can never park an oscillator on the bus for a quarter of a match. */
export const MAX_HORN_S = 3;

/**
 * THE STANDARD HORN — the recipe, so a future tuner can read it (amendment 57).
 *
 * A ship's horn is NOT a beep. It is a small number of LOW partials, slightly
 * mistuned against each other, with a slow swell and a long tail:
 *
 *   • 118 Hz sawtooth — the fundamental. Low enough to read as a hull-sized
 *     object, sawtooth for the dense harmonic stack a real air horn throws.
 *   • 118 Hz sawtooth, +14 cents — THE DETUNED TWIN, and the character of the
 *     whole cue. Two near-identical partials beat against each other at
 *     118·(2^(14/1200) − 1) ≈ 0.95 Hz, so the blast wavers about once a second
 *     exactly the way a two-trumpet horn does. Remove this layer and you have a
 *     synth pad; it is the single most important number in the file.
 *   • 177 Hz triangle — a fifth above (3:2). Triangle, not sawtooth: the upper
 *     partials want body, not more buzz.
 *   • 236 Hz triangle — the octave, at low weight. This is the part that
 *     survives small laptop speakers, which roll off everything under ~150 Hz.
 *
 * Envelope: 0.28s attack (air building in the pipe), a held middle, 0.85s
 * release (the tail rolling away over water), 1.8s total — the length Eric
 * named. Layer weights sum to 1.0 so `volume` alone sets the level.
 */
const STANDARD_HORN: HornSynthVoice = {
  kind: 'synth',
  layers: [
    { freq: 118, type: 'sawtooth', gain: 0.42 },
    { freq: 118, type: 'sawtooth', gain: 0.3, detuneCents: 14 },
    { freq: 177, type: 'triangle', gain: 0.18 },
    { freq: 236, type: 'triangle', gain: 0.1 },
  ],
  durationS: 1.8,
  attackS: 0.28,
  releaseS: 0.85,
  volume: 0.5,
};

/** The shipped catalog — EXACTLY ONE entry, total over the shared `HornId`. */
export const HORNS: Record<HornId, HornVoice> = {
  standard: STANDARD_HORN,
};

/**
 * Pure: the voice for a horn id, falling back to the default for anything the
 * catalog does not know. Never throws.
 *
 * The fallback is the wire contract's other half: an OLD client hearing a NEW
 * horn degrades to a sound rather than to silence or a throw (amendment 52), and
 * a honk is never allowed to be silent.
 */
export function hornVoice(id: string): HornVoice {
  return Object.hasOwn(HORNS, id) ? HORNS[id as HornId] : HORNS[DEFAULT_HORN_ID];
}

/** Pure: clamp to 0..1, mapping junk (NaN/Infinity/non-number) to 0. */
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Pure: a honk's effective peak gain — the voice's own level times the caller's
 * per-observer tier multiplier (1 / 0.75 / 0.5). Extracted so the ONE piece of
 * arithmetic in the horn path is testable without a WebAudio stack.
 */
export function hornGain(voice: HornVoice, tierGain: number): number {
  return clamp01(voice.volume) * clamp01(tierGain);
}

/**
 * An injectable, pure-logic buffer cache for the sample seam.
 *
 * The fetch+decode step is a constructor dependency so every branch here — cache
 * hit, in-flight dedupe, sticky failure — is exercised in node with no
 * AudioContext. Two rules it exists to enforce:
 *   • ONE in-flight load per url. Three captains honking the same purchased horn
 *     in the same second must not open three fetches.
 *   • FAILURE IS STICKY. A url that fails once is never retried this session, so
 *     a 404 asset cannot turn every honk into a request storm. Failure resolves
 *     `null` and never throws — the caller falls back to the synth default.
 */
export class HornBufferCache {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly inflight = new Map<string, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<string>();

  constructor(private readonly fetchDecode: (url: string) => Promise<AudioBuffer>) {}

  /** Sync peek — the decoded buffer, or undefined if it is not ready. */
  get(url: string): AudioBuffer | undefined {
    return this.buffers.get(url);
  }

  /** True once this url has failed; it is never retried this session. */
  hasFailed(url: string): boolean {
    return this.failed.has(url);
  }

  /** Load (or join the in-flight load of) a url. Resolves null on any failure. */
  load(url: string): Promise<AudioBuffer | null> {
    const ready = this.buffers.get(url);
    if (ready) return Promise.resolve(ready);
    if (this.failed.has(url)) return Promise.resolve(null);
    const pending = this.inflight.get(url);
    if (pending) return pending;
    // The eviction is chained rather than written inside `start`, so a
    // fetchDecode that throws SYNCHRONOUSLY cannot delete the entry before the
    // line below inserts it and strand a dead promise in the map.
    const started = this.start(url).finally(() => this.inflight.delete(url));
    this.inflight.set(url, started);
    return started;
  }

  /** The one real load. A synchronous throw from `fetchDecode` counts as a
   *  failure exactly like a rejection, and a missing buffer counts as one too. */
  private async start(url: string): Promise<AudioBuffer | null> {
    try {
      const buffer = await this.fetchDecode(url);
      if (!buffer) return this.fail(url);
      this.buffers.set(url, buffer);
      return buffer;
    } catch {
      return this.fail(url);
    }
  }

  private fail(url: string): null {
    this.failed.add(url);
    return null;
  }
}
