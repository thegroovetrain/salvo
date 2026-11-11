// The OUTPUT LEVEL METER (Story 10.13): reads the level tap after the volume
// and draws it as a small bar, only while sound is on. If the bar moves and
// nothing is heard, the problem is the tab or the computer being muted. With
// reduced motion the bar stays still and a text readout updates twice a second.

import type { Rig } from './rig.js';

/** The bar spans this many dB below full scale. */
const FLOOR_DB = 60;
const READOUT_MS = 500;

/** Peak of the latest block from the tap, 0..1. */
function peakOf(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  return peak;
}

/** 0..1 bar fill for a 0..1 peak, on a decibel scale. */
function fillOf(peak: number): number {
  if (!(peak > 0)) return 0;
  return Math.max(0, Math.min(1, 1 + (20 * Math.log10(peak)) / FLOOR_DB));
}

export class Meter {
  private buf: Float32Array<ArrayBuffer> | null = null;
  private frame = 0;
  private timer = 0;
  private readonly reduced: boolean;

  constructor(
    private readonly rig: Rig,
    private readonly canvas: HTMLCanvasElement,
    private readonly readout: HTMLElement,
  ) {
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    rig.onState(() => this.sync());
    this.draw(0);
  }

  /** Run while sound is on; stop (and empty) otherwise. */
  private sync(): void {
    const on = this.rig.running && this.rig.analyser !== null;
    if (on && !this.frame && !this.timer) this.begin();
    if (!on) this.end();
  }

  private begin(): void {
    if (this.reduced) this.timer = window.setInterval(() => this.text(), READOUT_MS);
    else this.frame = requestAnimationFrame(() => this.tick());
  }

  private end(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.timer) clearInterval(this.timer);
    this.frame = 0;
    this.timer = 0;
    this.draw(0);
  }

  private level(): number {
    const a = this.rig.analyser;
    if (!a) return 0;
    if (!this.buf || this.buf.length !== a.fftSize) this.buf = new Float32Array(a.fftSize);
    return peakOf(a, this.buf);
  }

  private tick(): void {
    this.draw(fillOf(this.level()));
    this.frame = requestAnimationFrame(() => this.tick());
  }

  private text(): void {
    const peak = this.level();
    this.readout.textContent = peak > 0 ? `Output level: ${(20 * Math.log10(peak)).toFixed(0)} dB` : 'Output level: silent';
  }

  private draw(fill: number): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const { width, height } = this.canvas;
    const css = getComputedStyle(this.canvas);
    g.fillStyle = css.getPropertyValue('--meter-bed').trim() || '#070b0a';
    g.fillRect(0, 0, width, height);
    g.fillStyle = css.getPropertyValue('--meter-fill').trim() || '#00ff88';
    g.fillRect(0, 0, Math.round(width * fill), height);
  }
}
