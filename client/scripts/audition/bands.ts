// BAND ENERGY for the audition self-test (engine retune): how much of a render
// sits below 200 Hz (felt, the rumble and throb), 200 Hz – 1 kHz (the body) and
// above 1 kHz (hiss and whine — the "vacuum cleaner"). A Hann-windowed FFT
// averaged over the render's steady part; the three RMS values add up (in
// power) to the RMS of that part.

export interface Bands {
  /** RMS below BAND_EDGES_HZ[0]. */
  low: number;
  /** RMS from BAND_EDGES_HZ[0] to BAND_EDGES_HZ[1]. */
  mid: number;
  /** RMS above BAND_EDGES_HZ[1]. */
  high: number;
}

export const BAND_EDGES_HZ = [200, 1000] as const;
const FRAME = 4096;

/** In-place iterative radix-2 FFT (re, im of length FRAME). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) butterflies(re, im, len);
}

function butterflies(re: Float64Array, im: Float64Array, len: number): void {
  const ang = (-2 * Math.PI) / len;
  const half = len >> 1;
  for (let i = 0; i < re.length; i += len) {
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k);
      const wi = Math.sin(ang * k);
      const a = i + k;
      const b = a + half;
      const tr = re[b] * wr - im[b] * wi;
      const ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr;
      im[b] = im[a] - ti;
      re[a] += tr;
      im[a] += ti;
    }
  }
}

function mono(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i] / buf.numberOfChannels;
  }
  return out;
}

const HANN = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME));
const HANN_POWER = HANN.reduce((s, w) => s + w * w, 0);

/** Which band FFT bin `k` falls in (0 low, 1 mid, 2 high). */
function bandOf(k: number, sampleRate: number): number {
  const hz = (k * sampleRate) / FRAME;
  if (hz < BAND_EDGES_HZ[0]) return 0;
  return hz < BAND_EDGES_HZ[1] ? 1 : 2;
}

/** Add one frame's power, per band, into `acc`. */
function accumulate(x: Float32Array, at: number, sampleRate: number, acc: number[]): void {
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) re[i] = x[at + i] * HANN[i];
  fft(re, im);
  for (let k = 0; k <= FRAME / 2; k++) {
    const twoSided = k === 0 || k === FRAME / 2 ? 1 : 2;
    acc[bandOf(k, sampleRate)] += (twoSided * (re[k] * re[k] + im[k] * im[k])) / (FRAME * HANN_POWER);
  }
}

/** Band RMS of `buf` from `fromS` to the end (frames hop by half a frame). */
export function bandRms(buf: AudioBuffer, fromS: number): Bands {
  const x = mono(buf);
  const acc = [0, 0, 0];
  let frames = 0;
  for (let at = Math.floor(fromS * buf.sampleRate); at + FRAME <= x.length; at += FRAME / 2) {
    accumulate(x, at, buf.sampleRate, acc);
    frames++;
  }
  const [low, mid, high] = acc.map((p) => Math.sqrt(p / Math.max(1, frames)));
  return { low, mid, high };
}
