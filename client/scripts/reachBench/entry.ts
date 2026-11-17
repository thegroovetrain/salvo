// THE REACH BENCH (Story 11.2, Phase A) — entry. Bundled by
// client/scripts/reachBench.mjs with the REAL shared module (`@salvo/shared`
// aliased to shared/src) into one self-contained HTML file: the map is the
// real `generateMap`, the shadows the real `visibilityTo`, the ruler the real
// `hm.ts`, the hull speeds the real `effectiveStats`. Nothing here is wired
// into the game.

import { CONFIG, formatHm, generateMap, hmToU, type GameMap, type Vec2 } from '@salvo/shared';
import { byId, button } from '../dispersionBench/controls.js';
import type { View } from '../dispersionBench/canvas.js';
import { drawBoard, wireShipDrag } from './board.js';
import { buildHullPicker, buildReachDials, buildTorps, renderHullLine, renderTorps } from './dials.js';
import { REAL_KNOTS, SEEDS, defaultState, fastestHull, numbersJson, readouts, ringU, spawnPoints } from './model.js';
import { buildShadowControls, computeShadows, drawShadows, shadowReadouts, scheduleShadows } from './shadowPanel.js';
import { buildScopeControls, scope, startScope, renderScope } from './scopePanel.js';

declare const __BENCH_BUILD__: string;

declare global {
  interface Window {
    __benchSelfTest?: () => { canvases: Array<{ id: string; inked: number }>; readouts: Record<string, number> };
  }
}

const state = defaultState();
const maps = new Map<number, GameMap>();
let boardView: View | null = null;

function mapFor(seed: number): GameMap {
  let m = maps.get(seed);
  if (!m) {
    m = generateMap(seed);
    maps.set(seed, m);
  }
  return m;
}

const currentMap = (): GameMap => mapFor(state.seed);
const spawns = (): Vec2[] => spawnPoints(currentMap().spawnRing);

/** Put the ship on spawn point 0, bow toward the board center. */
function shipToSpawn(): void {
  const p = spawns()[0];
  state.ship = { ...p };
  state.heading = Math.atan2(-p.y, -p.x);
  const deg = Math.round(((state.heading * 180) / Math.PI + 90 + 360) % 360);
  byId<HTMLInputElement>('headingDeg').value = String(deg);
}

function renderReadouts(): void {
  const r = readouts(state, spawns());
  const fast = fastestHull();
  const rows: Array<[string, string]> = [
    ['Main battery shell: time to its full reach', `${r.mainFlightS.toFixed(1)} s`],
    ['Secondaries round: time to its full reach', `${r.secFlightS.toFixed(1)} s`],
    [`Other spawn points inside radar (of ${r.spawnsOf})`, String(r.spawnsInRadar)],
    [`Other spawn points inside this hull’s gun reach (of ${r.spawnsOf})`, String(r.spawnsInGun)],
    [`Other spawn points inside whole-hull sight (of ${r.spawnsOf})`, String(r.spawnsInSight)],
    [`A real ${REAL_KNOTS}-knot ship on this ruler`, `${r.realUps.toFixed(2)} u/s`],
    [`Fastest hull in the game today (${fast.id}, top speed)`, `${r.gameUps.toFixed(1)} u/s`],
    ['So the game runs about', `${r.compression.toFixed(1)}× real time`],
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

function renderSeed(): void {
  byId('seedText').textContent = `Map seed ${state.seed}`;
  const p = state.ship;
  byId('shipText').textContent = `Ship at ${formatHm(Math.hypot(p.x, p.y))} hm from the center`;
}

function scopeInput() {
  return { map: currentMap(), ship: state.ship, heading: state.heading, hull: state.hull, radarU: ringU(state, 'radar'), sightU: ringU(state, 'hullSight') };
}

function render(): void {
  boardView = drawBoard(byId<HTMLCanvasElement>('board'), state, currentMap(), spawns());
  renderHullLine(state);
  renderTorps(state);
  renderReadouts();
  renderSeed();
  renderScope(scopeInput());
  scheduleShadows(shadowArgs());
}

function shadowArgs() {
  return { map: currentMap(), ship: state.ship, heading: state.heading, hull: state.hull, radarU: ringU(state, 'radar') };
}

function setSeed(seed: number): void {
  state.seed = seed;
  shipToSpawn();
  render();
}

function buildSeeds(): void {
  const row = byId('seeds');
  const step = (d: number): void => {
    const i = SEEDS.indexOf(state.seed);
    setSeed(SEEDS[(i + d + SEEDS.length) % SEEDS.length]);
  };
  button(row, '◀ Previous map', () => step(-1));
  button(row, 'Next map ▶', () => step(1));
  button(row, 'Ship back to a spawn point', () => (shipToSpawn(), render()));
  const heading = byId<HTMLInputElement>('headingDeg');
  heading.addEventListener('input', () => {
    state.heading = ((Number(heading.value) - 90) * Math.PI) / 180;
    render();
  });
}

function buildCopy(): void {
  byId('copy').addEventListener('click', () => {
    const json = numbersJson(state, { display: { ...scope }, shadows: shadowReadouts().picks });
    byId<HTMLTextAreaElement>('numbers').value = json;
    const done = (ok: boolean): void => {
      byId('copied').textContent = ok ? 'Copied. It is also in the box below.' : 'Could not reach the clipboard; select the box below and copy it.';
    };
    try {
      navigator.clipboard.writeText(json).then(() => done(true), () => done(false));
    } catch {
      done(false);
    }
  });
}

function inked(id: string): number {
  const c = byId<HTMLCanvasElement>(id);
  const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
  if (!d) return 0;
  let n = 0;
  for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) n++;
  return n;
}

function selfTest(): ReturnType<NonNullable<Window['__benchSelfTest']>> {
  computeShadows(shadowArgs());
  drawShadows(shadowArgs());
  const r = readouts(state, spawns());
  const sh = shadowReadouts();
  return {
    canvases: ['board', 'shadowRuled', 'shadowFollow', 'shadowDial', 'scope'].map((id) => ({ id, inked: inked(id) })),
    readouts: { ...r, ruledShare: sh.ruled, followShare: sh.follow, dialShare: sh.dial, radarU: hmToU(state.hm.radar) } as unknown as Record<string, number>,
  };
}

function showError(msg: string): void {
  const el = byId('error');
  el.hidden = false;
  el.textContent = `Something went wrong on this page: ${msg}`;
}

function main(): void {
  window.addEventListener('error', (e) => showError(String(e.message)));
  shipToSpawn();
  buildSeeds();
  buildHullPicker(state, render);
  buildReachDials(state, render);
  buildTorps(state, render);
  buildShadowControls(() => scheduleShadows(shadowArgs(), 0));
  buildScopeControls(() => renderScope(scopeInput()));
  buildCopy();
  wireShipDrag(byId<HTMLCanvasElement>('board'), () => boardView, state, currentMap, render);
  byId('build').textContent = __BENCH_BUILD__;
  byId('todayRadar').textContent = `${formatHm(CONFIG.vision.radar)} hm (${CONFIG.vision.radar.toLocaleString('en-US')} u)`;
  let lastWidth = -1;
  new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w === lastWidth) return;
    lastWidth = w;
    render();
  }).observe(byId('board'));
  window.__benchSelfTest = selfTest;
  render();
  startScope(scopeInput);
}

main();
