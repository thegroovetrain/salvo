// Card 3 — "Aim marker ideas": the candidates as small multiples on the same
// stage set of the game's battle view, at one screen zoom, plus the controls
// and live readouts that make the two facts visible (how small the oval is on
// screen, and whether neighboring shells' ovals overlap).

import { CONFIG, mapRadius } from '@salvo/shared';
import { byId, button, slider, type SliderHandle } from './controls.js';
import { fit, type View } from './canvas.js';
import type { BenchState } from './model.js';
import { CANDIDATES, candidate, candidateColor, drawReticle, ovals, overlapFacts, trueOvalPx, drawnSemiAxes, type AimState, type Letter } from './markers.js';
import { SWATCHES } from './palette.js';
import { BACKDROPS, drawBackdrop, type BackdropId } from './scene.js';

/**
 * The game's camera, as screen px per u, for a window whose SHORT side is
 * 1,080 px: every framing is a world span across the short side
 * (client/src/render/camera.ts:787 baseZoom = min(w, h) / defaultSpanU).
 *   close  = config.ts:1473 `zoom.closeSpanU` 880 u
 *   default= config.ts:1477 `zoom.defaultSpanU` 1,320 u
 *   whole map = 2 × mapRadius × config.ts:1521 `reveal.mapFitMargin` 1.05 (camera.ts:105, 200)
 */
const SHORT_SIDE_PX = 1080;
const MAP_SPAN_U = 2 * mapRadius(CONFIG.map.playerCap) * 1.05;
export const ZOOM_PRESETS = [
  { label: 'Zoomed all the way in', pxPerU: SHORT_SIDE_PX / 880 },
  { label: 'Default view', pxPerU: SHORT_SIDE_PX / 1320 },
  { label: 'Zoomed all the way out (whole map)', pxPerU: SHORT_SIDE_PX / MAP_SPAN_U },
];

export const aim: AimState = {
  zoom: ZOOM_PRESETS[1].pxPerU,
  minPx: 0,
  converge: false,
  backdrop: 'open',
  colorKey: 'amber',
  pick: 'A',
  reticle: true,
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

export function candidateCanvasIds(): string[] {
  return CANDIDATES.map((c) => `mk${c.letter}`);
}

function drawOne(letter: Letter, s: BenchState, tMs: number): void {
  const c = candidate(letter);
  const canvas = byId<HTMLCanvasElement>(`mk${letter}`);
  const { ctx, w, h } = fit(canvas, 0.75, 300);
  const v: View = { ctx, w, h, scale: aim.zoom, cx: w / 2, cy: h / 2 };
  drawBackdrop(v, aim.backdrop);
  ctx.save();
  c.draw(ctx, ovals(v, s, aim), candidateColor(c, aim).hex, s, tMs, reduceMotion.matches);
  ctx.restore();
  if (aim.reticle) drawReticle(v);
}

function px(n: number): string {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

function readoutRows(s: BenchState): Array<[string, string]> {
  const t = trueOvalPx(s, aim.zoom);
  const d = drawnSemiAxes(s, aim);
  const o = overlapFacts(s);
  const rows: Array<[string, string]> = [['One oval on screen, true size', `${px(t.long)} × ${px(t.wide)} px`]];
  if (2 * d.rx > t.long + 1e-9) rows.push(['Drawn bigger than the truth (smallest-size idea)', `${px(2 * d.rx)} × ${px(2 * d.ry)} px`]);
  rows.push(['Each oval is this wide (across the shot)', `${o.widthU.toFixed(1)} u`]);
  rows.push(['Shell tracks are this far apart', `${o.spacingU} u`]);
  rows.push(['Do neighboring ovals overlap at this range?', o.overlap ? 'Yes' : 'No — separate ovals']);
  if (aim.converge) rows.push(['With shells aiming at one point', 'All ovals stacked into one']);
  return rows;
}

function renderReadouts(s: BenchState): void {
  byId('aimReadouts').replaceChildren(
    ...readoutRows(s).map(([k, v]) => {
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

function renderMeanings(): void {
  for (const c of CANDIDATES) {
    const col = candidateColor(c, aim);
    byId(`mkColor${c.letter}`).textContent = `Color: ${col.name} ${col.hex.toUpperCase()}`;
    byId(`mkMeaning${c.letter}`).textContent = col.meaning;
  }
  document.querySelectorAll<HTMLButtonElement>('#swatches button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === aim.colorKey)));
  document.querySelectorAll<HTMLElement>('#candidates figure').forEach((f) => f.classList.toggle('picked', f.dataset.letter === aim.pick));
}

export function renderAimCard(s: BenchState, tMs = performance.now()): void {
  for (const c of CANDIDATES) drawOne(c.letter, s, tMs);
  renderReadouts(s);
  renderMeanings();
}

/** The one line appended to "Numbers to record". */
export function aimRecordLine(): string {
  const c = candidate(aim.pick);
  const col = candidateColor(c, aim);
  return `Aim marker: idea ${c.letter} (${c.name}) · color ${col.name} ${col.hex.toUpperCase()} · screen zoom ${aim.zoom.toFixed(2)} px per u · smallest size ${aim.minPx} px · ${aim.converge ? 'shells aim at one point (converge)' : 'shells fly side by side (today)'}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function buildFigures(onChange: () => void): void {
  const grid = byId('candidates');
  for (const c of CANDIDATES) {
    const fig = el('figure', 'mk');
    fig.dataset.letter = c.letter;
    const cap = el('figcaption', '');
    const pick = el('label', 'check');
    const radio = el('input', '');
    radio.type = 'radio';
    radio.name = 'mkPick';
    radio.value = c.letter;
    radio.checked = c.letter === aim.pick;
    radio.addEventListener('change', () => ((aim.pick = c.letter), onChange()));
    pick.append(radio, document.createTextNode(` ${c.letter}. ${c.name}`));
    cap.append(pick);
    const canvas = el('canvas', 'canvas');
    canvas.id = `mk${c.letter}`;
    canvas.setAttribute('aria-label', `Idea ${c.letter}: ${c.name}`);
    const how = el('p', 'mk-line', c.how);
    const color = el('p', 'mk-line strong');
    color.id = `mkColor${c.letter}`;
    const meaning = el('p', 'mk-line');
    meaning.id = `mkMeaning${c.letter}`;
    fig.append(cap, canvas, how, color, meaning);
    grid.append(fig);
  }
}

function buildSwatches(onChange: () => void): void {
  const row = byId('swatches');
  for (const sw of SWATCHES) {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.dataset.key = sw.key;
    const chip = el('span', 'chip');
    chip.style.background = sw.hex;
    b.append(chip, document.createTextNode(sw.name));
    b.addEventListener('click', () => ((aim.colorKey = sw.key), onChange()));
    row.append(b);
  }
}

function buildDials(onChange: () => void): SliderHandle {
  const dials = byId('aimDials');
  const zoom = slider(dials, { label: 'Screen zoom (screen pixels per u)', min: 0.05, max: 3, step: 0.01, value: aim.zoom, fmt: (v) => `${v.toFixed(2)} px per u`, onInput: (v) => ((aim.zoom = v), onChange()) });
  slider(dials, { label: 'Smallest size on screen (an idea: above 0, the oval is drawn bigger than where shells can really land)', min: 0, max: 40, step: 1, value: aim.minPx, fmt: (v) => (v === 0 ? 'off' : `${v} px`), onInput: (v) => ((aim.minPx = v), onChange()) });
  return zoom;
}

function buildPresets(zoom: SliderHandle, onChange: () => void): void {
  const row = byId('zoomPresets');
  for (const p of ZOOM_PRESETS) {
    button(row, `${p.label} (${p.pxPerU.toFixed(2)})`, () => {
      aim.zoom = Number(p.pxPerU.toFixed(2));
      zoom.set(aim.zoom);
      onChange();
    });
  }
}

function buildToggles(onChange: () => void): void {
  const sel = byId<HTMLSelectElement>('backdrop');
  for (const b of BACKDROPS) {
    const o = el('option', '', b.label);
    o.value = b.id;
    sel.append(o);
  }
  sel.addEventListener('change', () => ((aim.backdrop = sel.value as BackdropId), onChange()));
  document.querySelectorAll<HTMLInputElement>('input[name="converge"]').forEach((r) =>
    r.addEventListener('change', () => ((aim.converge = r.value === 'one'), onChange())),
  );
  const ret = byId<HTMLInputElement>('showReticle');
  ret.addEventListener('change', () => ((aim.reticle = ret.checked), onChange()));
}

/** Idea H breathes: redraw only its canvas each frame (nothing else moves). */
function animate(getState: () => BenchState): void {
  const tick = (t: number): void => {
    if (!reduceMotion.matches) drawOne('H', getState(), t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function buildAimCard(getState: () => BenchState, onChange: () => void): void {
  byId('zoomFacts').textContent = `Presets are the game's own camera limits for a window 1,080 px tall (a smaller window shows everything smaller in the same ratio).`;
  buildFigures(onChange);
  buildSwatches(onChange);
  buildPresets(buildDials(onChange), onChange);
  buildToggles(onChange);
  reduceMotion.addEventListener('change', onChange);
  animate(getState);
}
