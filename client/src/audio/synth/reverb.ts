// The generated OPEN-WATER impulse response (Story 10.13, research §12).
// There are no walls at sea, so the response is a handful of sparse early
// reflections (superstructure and sea surface) and then a long, darkening
// noise tail (Moorer: decaying noise makes a good reverb). Pure sample math
// into a Float32Array pair; `reverbBuffer` is the thin AudioBuffer wrapper.

export const IR = {
  lengthS: 3,
  /** Early reflections land in [earlyMinS, earlyMaxS]. */
  earlyMinS: 0.008,
  earlyMaxS: 0.12,
  earlyMin: 6,
  earlyMax: 10,
  /** The diffuse tail starts here and decays by 60 dB over t60S. */
  tailStartS: 0.15,
  t60S: 2.8,
  /** The tail's one-pole lowpass slides from bright to dark across it. */
  tailLowpassStartHz: 4000,
  tailLowpassEndHz: 300,
  /** The first reflection's level; later ones fall linearly toward half that. */
  earlyPeak: 0.8,
} as const;

/** Write 6–10 sparse impulses into the first ~120 ms of one channel. */
function writeEarly(data: Float32Array, sampleRate: number, rand: () => number): void {
  const n = IR.earlyMin + Math.floor(rand() * (IR.earlyMax - IR.earlyMin + 1));
  const span = IR.earlyMaxS - IR.earlyMinS;
  for (let i = 0; i < n; i++) {
    const tS = IR.earlyMinS + rand() * span;
    const idx = Math.min(data.length - 1, Math.floor(tS * sampleRate));
    const fall = 1 - 0.5 * ((tS - IR.earlyMinS) / span);
    const sign = rand() < 0.5 ? -1 : 1;
    data[idx] += sign * IR.earlyPeak * fall;
  }
}

/** One-pole lowpass coefficient for cutoff `hz` (y = (1-a)·x + a·y). */
function onePole(hz: number, sampleRate: number): number {
  return Math.exp((-2 * Math.PI * hz) / sampleRate);
}

/** Exponentially decaying white noise from tailStartS, lowpassed by a pole
 *  whose cutoff glides exponentially from bright to dark along the tail. */
function writeTail(data: Float32Array, sampleRate: number, rand: () => number): void {
  const start = Math.floor(IR.tailStartS * sampleRate);
  const span = Math.max(1, data.length - start);
  const ratio = IR.tailLowpassEndHz / IR.tailLowpassStartHz;
  let y = 0;
  for (let i = start; i < data.length; i++) {
    const frac = (i - start) / span;
    const tS = (i - start) / sampleRate;
    const a = onePole(IR.tailLowpassStartHz * Math.pow(ratio, frac), sampleRate);
    y = (1 - a) * (rand() * 2 - 1) + a * y;
    data[i] += y * Math.pow(10, (-3 * tS) / IR.t60S);
  }
}

/** Fill a stereo IR. Each channel gets its own reflections and its own noise,
 *  which is what makes the tail wide. Deterministic for a given `rand`. */
export function fillOpenWaterIR(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  rand: () => number = Math.random,
): void {
  for (const ch of [left, right]) {
    writeEarly(ch, sampleRate, rand);
    writeTail(ch, sampleRate, rand);
  }
}

/** A fresh stereo open-water IR buffer for this context. */
export function reverbBuffer(ctx: BaseAudioContext, rand: () => number = Math.random): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * IR.lengthS));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  fillOpenWaterIR(buffer.getChannelData(0), buffer.getChannelData(1), ctx.sampleRate, rand);
  return buffer;
}
