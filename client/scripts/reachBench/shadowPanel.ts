// Section 2's three panels and their controls: the RULED shadows (K frozen at
// today's value — R13), the rejected "K follows radar" comparison, and a K
// dial from a quarter of today's K up to the follows-radar value.

import { formatHm, type GameMap, type HullId, type Vec2 } from '@salvo/shared';
import { byId } from '../dispersionBench/controls.js';
import { TODAY_K, computeShadow, drawShadow, type ShadowResult } from './shadow.js';

export interface ShadowArgs {
  map: GameMap;
  ship: Vec2;
  heading: number;
  hull: HullId;
  radarU: number;
}

const SLIDER_STEPS = 1000;
/** The K dial as a multiple of today's K (1 = today). */
let kMult = 1;
let results: { ruled: ShadowResult; follow: ShadowResult; dial: ShadowResult } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const followK = (radarU: number): number => (radarU * radarU) / 4;
const minMult = 0.25;
const maxMult = (radarU: number): number => Math.max(minMult * 1.01, followK(radarU) / TODAY_K);

/** Slider position (0..SLIDER_STEPS) ↔ K multiple, on a log scale. */
function multAt(pos: number, radarU: number): number {
  const lo = Math.log(minMult);
  const hi = Math.log(maxMult(radarU));
  return Math.exp(lo + ((hi - lo) * pos) / SLIDER_STEPS);
}
function posOf(mult: number, radarU: number): number {
  const lo = Math.log(minMult);
  const hi = Math.log(maxMult(radarU));
  return Math.round(((Math.log(mult) - lo) / (hi - lo)) * SLIDER_STEPS);
}

let lastRadarU = 0;

export function buildShadowControls(onChange: () => void): void {
  const input = byId<HTMLInputElement>('kDial');
  input.min = '0';
  input.max = String(SLIDER_STEPS);
  input.step = '1';
  input.addEventListener('input', () => {
    kMult = multAt(Number(input.value), lastRadarU);
    onChange();
  });
}

function syncDial(radarU: number): void {
  lastRadarU = radarU;
  kMult = Math.min(Math.max(kMult, minMult), maxMult(radarU));
  byId<HTMLInputElement>('kDial').value = String(posOf(kMult, radarU));
  byId('kValue').textContent = `${kMult.toFixed(2)} × today’s`;
}

export function computeShadows(a: ShadowArgs): void {
  syncDial(a.radarU);
  results = {
    ruled: computeShadow(a.map, a.ship, a.radarU, TODAY_K),
    follow: computeShadow(a.map, a.ship, a.radarU, followK(a.radarU)),
    dial: computeShadow(a.map, a.ship, a.radarU, TODAY_K * kMult),
  };
}

const pctText = (share: number): string => `${(share * 100).toFixed(1)} %`;

export function drawShadows(a: ShadowArgs): void {
  if (!results) return;
  const panels: Array<[string, ShadowResult]> = [['shadowRuled', results.ruled], ['shadowFollow', results.follow], ['shadowDial', results.dial]];
  for (const [id, res] of panels) {
    drawShadow(byId<HTMLCanvasElement>(id), a.map, a.ship, a.heading, a.hull, a.radarU, res);
    byId(`${id}Share`).textContent = `${pctText(res.share)} of the sea inside ${formatHm(a.radarU)} hm is in shadow`;
  }
  byId('followK').textContent = `K here is ${(followK(a.radarU) / TODAY_K).toFixed(1)} × today’s.`;
}

/** Recompute after the dials settle (the walk is the real one, so it is not free). */
export function scheduleShadows(a: ShadowArgs, delayMs = 200): void {
  if (timer !== null) clearTimeout(timer);
  byId('shadowStatus').textContent = 'Working out the shadows…';
  timer = setTimeout(() => {
    timer = null;
    computeShadows(a);
    drawShadows(a);
    byId('shadowStatus').textContent = '';
  }, delayMs);
}

export function shadowReadouts(): { ruled: number; follow: number; dial: number; picks: { kTimesToday: number } } {
  return {
    ruled: results?.ruled.share ?? Number.NaN,
    follow: results?.follow.share ?? Number.NaN,
    dial: results?.dial.share ?? Number.NaN,
    picks: { kTimesToday: Number(kMult.toFixed(3)) },
  };
}
