// THE ARC BENCH (Story 11.3, R5 + R6) — entry. Bundled by
// client/scripts/arcBench.mjs with the REAL shared module (`@salvo/shared`
// aliased to shared/src): the map is the real `generateMap`, every paint the
// real rasterizer → `smearArc` → `fuzzCoverage`. Nothing here is wired into
// the game.

import { CONFIG, generateMap, hmToU, rasterizeHullCoverage, smearArc, type GameMap } from '@salvo/shared';
import { button, byId, slider } from '../dispersionBench/controls.js';
import { SEEDS } from '../reachBench/model.js';
import { drawChart, drawCloseUp, hm } from './draw.js';
import { CANDIDATES, CELL_U, candidatePaints, cellFactor, defaultState, measure, observer, paintAll, type Candidate, type Paint } from './model.js';

declare const __BENCH_BUILD__: string;

declare global {
  interface Window {
    __benchSelfTest?: () => { canvases: Array<{ id: string; inked: number }>; readouts: Record<string, number> };
  }
}

const state = defaultState(SEEDS[0]);
const maps = new Map<number, GameMap>();
let paints: Paint[] = [];

function currentMap(): GameMap {
  let m = maps.get(state.seed);
  if (!m) {
    m = generateMap(state.seed);
    maps.set(state.seed, m);
  }
  return m;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Build the close-up figures once (one canvas per paint). */
function buildCloseUps(): void {
  const grid = byId('closeups');
  for (const p of paintAll(state, currentMap())) {
    const fig = el('figure', 'closeup');
    const canvas = el('canvas', 'canvas');
    canvas.id = `cu-${p.key}`;
    canvas.setAttribute('aria-label', `Close-up of the radar paint: ${p.label}`);
    fig.append(el('figcaption', '', p.label), canvas, el('div', 'mk-lines'));
    fig.lastElementChild!.id = `cu-${p.key}-text`;
    grid.append(fig);
  }
}

function readoutLines(p: Paint): string[] {
  const m = measure(p, observer(currentMap()));
  return [
    `Range ${hm(p.rangeU)}`,
    `Arc width ${Math.round(m.widthU)} u (${(m.widthU / hmToU(1)).toFixed(1)} hm)`,
    `Depth ${Math.round(m.depthU)} u`,
    `${m.cells} cells of 9 u`,
  ];
}

function renderCloseUps(): void {
  const o = observer(currentMap());
  for (const p of paints) {
    drawCloseUp(byId<HTMLCanvasElement>(`cu-${p.key}`), p, o, cellFactor(state.candidate, p.rangeU));
    byId(`cu-${p.key}-text`).replaceChildren(...readoutLines(p).map((t, i) => el('p', i === 1 ? 'mk-line strong' : 'mk-line', t)));
  }
}

/** The far-cell candidates: the Yamato at 400 hm side-on, 400 hm end-on and 200 hm under each. */
function renderCandidates(): void {
  const o = observer(currentMap());
  const picks = candidatePaints(state, currentMap());
  for (const c of CANDIDATES) {
    byId(`cand-${c.id}`).classList.toggle('picked', c.id === state.candidate);
    picks.forEach((p, i) => drawCloseUp(byId<HTMLCanvasElement>(`cand-${c.id}-${i}`), p, o, cellFactor(c.id, p.rangeU), 0.7));
  }
}

function render(): void {
  paints = paintAll(state, currentMap());
  drawChart(byId<HTMLCanvasElement>('chart'), currentMap(), observer(currentMap()), paints, (p) => cellFactor(state.candidate, p.rangeU));
  byId('seedText').textContent = `Map seed ${state.seed}`;
  renderCloseUps();
  renderCandidates();
}

function buildSeeds(): void {
  const row = byId('seeds');
  const step = (d: number): void => {
    const i = SEEDS.indexOf(state.seed);
    state.seed = SEEDS[(i + d + SEEDS.length) % SEEDS.length];
    render();
  };
  button(row, '◀ Previous map', () => step(-1));
  button(row, 'Next map ▶', () => step(1));
}

function buildDials(): void {
  const box = byId('dials');
  slider(box, { label: 'Beam width (full, degrees)', min: 1, max: 8, step: 0.5, value: state.beamDeg, fmt: (v) => `${v}°`, onInput: (v) => ((state.beamDeg = v), render()) });
  slider(box, { label: 'Pulse (extra depth, hm)', min: 0.5, max: 5, step: 0.1, value: state.pulseHm, fmt: (v) => `${v.toFixed(1)} hm (${Math.round(hmToU(v))} u)`, onInput: (v) => ((state.pulseHm = v), render()) });
  const fuzz = byId<HTMLInputElement>('fuzz');
  fuzz.checked = state.fuzz;
  fuzz.addEventListener('change', () => ((state.fuzz = fuzz.checked), render()));
  button(byId('rollRow'), 'Re-roll the paints', () => ((state.roll += 1), render()));
}

const CANDIDATE_CAPTIONS = ['Yamato at 400 hm, side-on', 'Yamato at 400 hm, end-on', 'Yamato at 200 hm, side-on'];

function buildCandidates(): void {
  const row = byId('candidates');
  for (const c of CANDIDATES) {
    const fig = el('figure', 'cand');
    fig.id = `cand-${c.id}`;
    const pick = el('label', 'check');
    const radio = el('input', '');
    radio.type = 'radio';
    radio.name = 'candidate';
    radio.value = c.id;
    radio.checked = c.id === state.candidate;
    radio.addEventListener('change', () => radio.checked && ((state.candidate = c.id as Candidate), render()));
    pick.append(radio, el('span', '', c.title));
    fig.append(el('figcaption', '', ''), el('p', 'mk-line', c.line));
    fig.firstElementChild!.append(pick);
    CANDIDATE_CAPTIONS.forEach((cap, i) => {
      const canvas = el('canvas', 'canvas');
      canvas.id = `cand-${c.id}-${i}`;
      canvas.setAttribute('aria-label', `Candidate ${c.id}: ${cap}`);
      fig.append(el('p', 'mk-line strong', cap), canvas);
    });
    row.append(fig);
  }
}

function inked(id: string): number {
  const c = byId<HTMLCanvasElement>(id);
  const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
  if (!d) return 0;
  let n = 0;
  for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) n++;
  return n;
}

/** µs per smearArc call on a far Yamato, in this browser (a curiosity, not a verdict). */
function smearMicros(): number {
  const o = observer(currentMap());
  const d = hmToU(400);
  const sharp = rasterizeHullCoverage('yamato', o.x + d * Math.cos(0.7), o.y + d * Math.sin(0.7), 0.7, CELL_U);
  const beam = (state.beamDeg * Math.PI) / 180;
  const n = 400;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) smearArc(sharp, o.x + i * 1e-3, o.y, CELL_U, beam, hmToU(state.pulseHm));
  return ((performance.now() - t0) * 1000) / n;
}

/** Measures the page exactly as load left it. It never redraws first, so a
 *  canvas that is blank on load fails. */
function selfTest(): ReturnType<NonNullable<Window['__benchSelfTest']>> {
  const ids = ['chart', ...paints.map((p) => `cu-${p.key}`), ...CANDIDATES.flatMap((c) => CANDIDATE_CAPTIONS.map((_, i) => `cand-${c.id}-${i}`))];
  const o = observer(currentMap());
  const readouts: Record<string, number> = { smearMicros: smearMicros() };
  const cands = candidatePaints(state, currentMap()).map((p) => ({ ...p, key: `cand.${p.key}` }));
  for (const p of [...paints, ...cands]) {
    const m = measure(p, o);
    readouts[`${p.key}.widthU`] = m.widthU;
    readouts[`${p.key}.depthU`] = m.depthU;
    readouts[`${p.key}.cells`] = m.cells;
  }
  return { canvases: ids.map((id) => ({ id, inked: inked(id) })), readouts };
}

/**
 * THE BLANK-ON-LOAD FIX. Browsers may drop an accelerated 2D canvas's backing
 * store (a GPU process start or reset, memory pressure on a background tab)
 * and hand it back EMPTY: `contextlost`, then `contextrestored`. A fresh
 * headless Chromium does exactly that to the first page's canvases about half
 * a second after their first draw — the bench drew once at load and never
 * again, so every canvas stayed blank. Redraw on restore; many canvases
 * restore together, so the redraws are coalesced into one.
 */
function redrawOnRestore(): void {
  let pending = false;
  const redraw = (): void => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      render();
    }, 0);
  };
  document.querySelectorAll('canvas').forEach((c) => c.addEventListener('contextrestored', redraw));
}

function showError(msg: string): void {
  const e = byId('error');
  e.hidden = false;
  e.textContent = `Something went wrong on this page: ${msg}`;
}

function main(): void {
  window.addEventListener('error', (e) => showError(String(e.message)));
  byId('beamToday').textContent = `${CONFIG.vision.beamDeg}°`;
  byId('pulseToday').textContent = `${CONFIG.vision.pulseHm} hm`;
  buildSeeds();
  buildDials();
  buildCloseUps();
  buildCandidates();
  redrawOnRestore();
  byId('build').textContent = __BENCH_BUILD__;
  let lastWidth = -1;
  new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w === lastWidth) return;
    lastWidth = w;
    render();
  }).observe(byId('chart'));
  window.__benchSelfTest = selfTest;
  render();
}

main();
