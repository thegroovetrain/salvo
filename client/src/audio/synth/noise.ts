// Shared raw material for the synthesis path (Story 10.13): looping noise
// buffers and the soft-clip curve. Generated at runtime — no audio asset.
//
// One buffer per (context, color), built on first use and cached for the life
// of that context. Every voice reads the same buffer from a random offset
// (`noiseOffset`), which is what keeps repeated cues from sounding identical
// without allocating a fresh buffer per shot.

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Length of every cached noise buffer, seconds. */
export const NOISE_BUFFER_S = 4;

type Fill = (data: Float32Array, rand: () => number) => void;

const fillWhite: Fill = (data, rand) => {
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
};

/** Paul Kellet's economy pink filter over white noise. */
const fillPink: Fill = (data, rand) => {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
};

/** Leaky integrator over white noise (a -6 dB/octave slope). */
const fillBrown: Fill = (data, rand) => {
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    b = (b + 0.02 * (rand() * 2 - 1)) / 1.02;
    data[i] = Math.max(-1, Math.min(1, b * 3.5));
  }
};

const FILL: Record<NoiseColor, Fill> = { white: fillWhite, pink: fillPink, brown: fillBrown };

const cache = new WeakMap<BaseAudioContext, Partial<Record<NoiseColor, AudioBuffer>>>();

/** The cached mono noise buffer of one color for this context. */
export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor, rand: () => number = Math.random): AudioBuffer {
  let perCtx = cache.get(ctx);
  if (!perCtx) {
    perCtx = {};
    cache.set(ctx, perCtx);
  }
  let buffer = perCtx[color];
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_S)), ctx.sampleRate);
    FILL[color](buffer.getChannelData(0), rand);
    perCtx[color] = buffer;
  }
  return buffer;
}

/** A random start offset (s) into a noise buffer, leaving `needS` of runway
 *  for a one-shot source that does not loop. */
export function noiseOffset(needS: number, rand: () => number = Math.random): number {
  const room = Math.max(0, NOISE_BUFFER_S - Math.max(0, needS));
  return rand() * room;
}

/** WaveShaper curve tanh(k·x)/tanh(k): unity at the rails, harder knee as k
 *  grows. A non-finite or non-positive k degrades to the identity line. */
export function softClipCurve(k: number, samples = 1024): Float32Array {
  const n = Math.max(2, Math.floor(samples));
  const curve = new Float32Array(n);
  const drive = Number.isFinite(k) && k > 0 ? k : 0;
  const norm = drive > 0 ? Math.tanh(drive) : 1;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = drive > 0 ? Math.tanh(drive * x) / norm : x;
  }
  return curve;
}
