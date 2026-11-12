// THE DISPERSION BENCH (Story 11.1, Phase A, ruling R1) — entry. Bundled by
// client/scripts/dispersionBench.mjs with the REAL shared module (`@salvo/shared`
// aliased to shared/src) into one self-contained HTML file, so every landing it
// draws is the function the server will fire with. Seeds come from a visible
// salvo counter; nothing here uses Math.random.

import { CONFIG, SHIP_CLASS_IDS, type HullId } from '@salvo/shared';
import { byId, button, pct, slider } from './controls.js';
import { toWorld, type View } from './canvas.js';
import { BLAST_U, readouts, type BenchState } from './model.js';
import { drawPattern } from './pattern.js';
import { aim, aimRecordLine, buildAimCard, candidateCanvasIds, renderAimCard } from './aimCard.js';
import { trueOvalPx } from './markers.js';
import { BACKDROPS } from './scene.js';

declare const __BENCH_BUILD__: string;

declare global {
  interface Window {
    __benchSelfTest?: () => { canvases: Array<{ id: string; inked: number }>; readouts: ReturnType<typeof readouts> & { aimOvalLongPx: number } };
  }
}

const TODAY_REACH_U = CONFIG.mainBattery.rangeU;
const PRESETS: Array<{ label: string; rangeU: number }> = [
  { label: `Today's reach ${TODAY_REACH_U.toLocaleString('en-US')} u`, rangeU: TODAY_REACH_U },
  { label: `Half reach ${TODAY_REACH_U * CONFIG.secondaries.rangeFrac} u (secondaries)`, rangeU: TODAY_REACH_U * CONFIG.secondaries.rangeFrac },
  { label: 'Big ocean 8,700 u', rangeU: 8700 },
  { label: 'Point blank 50 u', rangeU: 50 },
];

const state: BenchState = {
  cfg: { ...CONFIG.dispersion },
  rangeU: TODAY_REACH_U,
  shells: 3,
  hull: SHIP_CLASS_IDS[0],
  hullX: 0,
  hullY: 0,
  hullAngleDeg: 90,
  counter: 0,
  accumulate: false,
};

let patternView: View | null = null;

function renderReadouts(): void {
  const r = readouts(state);
  const rows: Array<[string, string]> = [
    ['Oval length along the shot', `${r.fullLengthU.toFixed(1)} u`],
    ['Oval width across', `${r.fullWidthU.toFixed(1)} u`],
    ['Hit share — blast reaches the hull (2,000 shells)', pct(r.hitShare)],
    ['Shells landing in the middle half', pct(r.innerShare)],
  ];
  byId('readouts').replaceChildren(
    ...rows.map(([k, v]) => {
      const d = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      d.append(dt, dd);
      return d;
    }),
  );
}

function renderRecord(): void {
  const c = state.cfg;
  byId('record').textContent =
    `CONFIG.dispersion = { alongFrac: ${c.alongFrac.toFixed(3)}, acrossFrac: ${c.acrossFrac.toFixed(3)}, floorU: ${c.floorU}, sigmas: ${c.sigmas.toFixed(1)} }\n` +
    `In words: length along the shot ${(c.alongFrac * 100).toFixed(1)} % of range; width across ${c.acrossFrac.toFixed(2)} of that; smallest size ${c.floorU} u; bunching ${c.sigmas.toFixed(1)}.\n` +
    aimRecordLine();
}

function render(): void {
  patternView = drawPattern(byId<HTMLCanvasElement>('pattern'), state);
  renderAimCard(state);
  byId('seed').textContent = state.accumulate
    ? `Salvos #${state.counter}–#${state.counter + 199} (seeds come from these numbers)`
    : `Salvo #${state.counter} (its seeds come from this number)`;
  renderReadouts();
  renderRecord();
}

function buildDials(): Array<(v: number) => void> {
  const dials = byId('dials');
  const c = state.cfg;
  slider(dials, { label: 'Length along the shot (% of range)', min: 0, max: 5, step: 0.1, value: c.alongFrac * 100, fmt: (v) => `${v.toFixed(1)} %`, onInput: (v) => ((c.alongFrac = v / 100), render()) });
  slider(dials, { label: 'Width across (fraction of the length)', min: 0.1, max: 1, step: 0.01, value: c.acrossFrac, fmt: (v) => v.toFixed(2), onInput: (v) => ((c.acrossFrac = v), render()) });
  slider(dials, { label: 'Smallest size, each direction (u)', min: 0, max: 20, step: 0.5, value: c.floorU, fmt: (v) => `${v} u`, onInput: (v) => ((c.floorU = v), render()) });
  slider(dials, { label: 'How tightly bunched toward the middle', min: 0.5, max: 4, step: 0.1, value: c.sigmas, fmt: (v) => v.toFixed(1), onInput: (v) => ((c.sigmas = v), render()) });
  const range = slider(dials, { label: 'Range (u)', min: 0, max: 9000, step: 10, value: state.rangeU, fmt: (v) => `${v.toLocaleString('en-US')} u`, onInput: (v) => ((state.rangeU = v), render()) });
  return [(v) => range.set(v)];
}

function buildPresets(setRange: (v: number) => void): void {
  const row = byId('presets');
  for (const p of PRESETS) {
    button(row, p.label, () => {
      state.rangeU = p.rangeU;
      setRange(p.rangeU);
      render();
    });
  }
}

function buildHull(): void {
  const sel = byId<HTMLSelectElement>('hull');
  for (const id of SHIP_CLASS_IDS) {
    const h = CONFIG.shipClasses[id].hull;
    const o = document.createElement('option');
    o.value = id;
    o.textContent = `${id[0].toUpperCase()}${id.slice(1)} — ${h.length.toFixed(1)} × ${h.beam.toFixed(1)} u`;
    sel.append(o);
  }
  sel.addEventListener('change', () => ((state.hull = sel.value as HullId), render()));
  slider(byId('hullDials'), { label: 'Hull heading vs. the line of fire (0° end-on, 90° side-on)', min: 0, max: 180, step: 5, value: state.hullAngleDeg, fmt: (v) => `${v}°`, onInput: (v) => ((state.hullAngleDeg = v), render()) });
  byId('centerHull').addEventListener('click', () => ((state.hullX = 0), (state.hullY = 0), render()));
}

function wireDrag(): void {
  const canvas = byId<HTMLCanvasElement>('pattern');
  let last: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!patternView) return;
    canvas.setPointerCapture(e.pointerId);
    last = toWorld(patternView, e.offsetX, e.offsetY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last || !patternView) return;
    const p = toWorld(patternView, e.offsetX, e.offsetY);
    state.hullX += p.x - last.x;
    state.hullY += p.y - last.y;
    last = p;
    render();
  });
  const end = (): void => {
    last = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => nudge(e));
}

const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function nudge(e: KeyboardEvent): void {
  const d = NUDGE[e.key];
  if (!d) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  state.hullX += d[0] * step;
  state.hullY += d[1] * step;
  render();
}

function wireFire(): void {
  byId('reroll').addEventListener('click', () => {
    state.counter += state.accumulate ? 200 : 1;
    render();
  });
  const acc = byId<HTMLInputElement>('accumulate');
  acc.addEventListener('change', () => ((state.accumulate = acc.checked), render()));
  document.querySelectorAll<HTMLInputElement>('input[name="shells"]').forEach((r) =>
    r.addEventListener('change', () => ((state.shells = Number(r.value)), render())),
  );
}

function inked(id: string): number {
  const c = byId<HTMLCanvasElement>(id);
  const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
  if (!d) return 0;
  let n = 0;
  for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) n++;
  return n;
}

/** Every backdrop once (each marker idea on it must be non-blank), then back to the viewer's pick. */
function selfTestBackdrops(): Array<{ id: string; inked: number }> {
  const keep = aim.backdrop;
  const out: Array<{ id: string; inked: number }> = [];
  for (const b of BACKDROPS) {
    aim.backdrop = b.id;
    renderAimCard(state);
    for (const id of candidateCanvasIds()) out.push({ id: `${id} on ${b.id}`, inked: inked(id) });
  }
  aim.backdrop = keep;
  render();
  return out;
}

function showError(msg: string): void {
  const el = byId('error');
  el.hidden = false;
  el.textContent = `Something went wrong on this page: ${msg}`;
}

function main(): void {
  window.addEventListener('error', (e) => showError(String(e.message)));
  byId('blastU').textContent = String(BLAST_U);
  const [setRange] = buildDials();
  buildPresets(setRange);
  buildHull();
  wireDrag();
  wireFire();
  buildAimCard(() => state, render);
  byId('build').textContent = __BENCH_BUILD__;
  // Redraw on WIDTH changes only: render() itself sets each canvas' height.
  let lastWidth = -1;
  new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w === lastWidth) return;
    lastWidth = w;
    render();
  }).observe(byId('pattern'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
  window.__benchSelfTest = () => ({
    canvases: [...selfTestBackdrops(), ...['pattern', ...candidateCanvasIds()].map((id) => ({ id, inked: inked(id) }))],
    readouts: { ...readouts(state), aimOvalLongPx: trueOvalPx(state, aim.zoom).long },
  });
  render();
}

main();
