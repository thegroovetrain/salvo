// The MASTER CHAIN (Story 10.13, research §12): a gentle bus compressor that
// glues layered cues together, then a limiter-style compressor that keeps the
// loudest moments (a main-battery salvo landing on a hit) from clipping. The
// audition page plays every candidate through this chain, and the wiring wave
// inserts the same chain on the game's bus, so what Eric hears is what ships.
//
//   input → bus compressor → limiter → output (unity gain)
//
// A browser without DynamicsCompressor gets a single pass-through gain: the
// chain degrades to "no dynamics", never to silence.

/** Bus compressor: research §12 (threshold −18 dB, knee 6, ratio 4, 10 ms / 250 ms). */
export const BUS_COMPRESSOR = { threshold: -18, knee: 6, ratio: 4, attack: 0.01, release: 0.25 } as const;

/** Limiter: research §12 (threshold −3 dB, hard knee, ratio 20, 1 ms / 100 ms). */
export const LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const;

export type CompressorSettings = {
  readonly threshold: number;
  readonly knee: number;
  readonly ratio: number;
  readonly attack: number;
  readonly release: number;
};

export interface MasterChain {
  /** Connect every cue / engine voice here. */
  readonly input: AudioNode;
  /** Connect this to the next stage (volume, destination). */
  readonly output: AudioNode;
}

function compressor(ctx: BaseAudioContext, s: CompressorSettings): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = s.threshold;
  c.knee.value = s.knee;
  c.ratio.value = s.ratio;
  c.attack.value = s.attack;
  c.release.value = s.release;
  return c;
}

/** Build the chain on `ctx`. Never throws for a missing compressor factory. */
export function createMasterChain(ctx: BaseAudioContext): MasterChain {
  const output = ctx.createGain();
  output.gain.value = 1;
  if (typeof ctx.createDynamicsCompressor !== 'function') return { input: output, output };
  const bus = compressor(ctx, BUS_COMPRESSOR);
  const limiter = compressor(ctx, LIMITER);
  bus.connect(limiter).connect(output);
  return { input: bus, output };
}
