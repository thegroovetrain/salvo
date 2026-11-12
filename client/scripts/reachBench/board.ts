// Section 1, "The board": the real map with every switched-on reach as a ring
// around the own ship. The ship drags anywhere on the board.

import { formatHm, hmToU as hmU, type GameMap, type Vec2 } from '@salvo/shared';
import { fit, toWorld, type View } from '../dispersionBench/canvas.js';
import { boardView, drawIslands, drawOwnShip, drawRim, drawRing, drawScaleRings, fillBackground } from './chart.js';
import { DIALS, TORPS, ringU, tierRunHm, type BenchState } from './model.js';

export function drawBoard(canvas: HTMLCanvasElement, s: BenchState, map: GameMap, spawns: readonly Vec2[]): View {
  const { ctx, w, h } = fit(canvas, 1, 820);
  const v = boardView(ctx, w, h, map);
  fillBackground(v);
  drawRim(v, map);
  drawIslands(v, map);
  drawScaleRings(v, map, spawns);
  for (const d of DIALS) {
    if (!s.on[d.key]) continue;
    const r = ringU(s, d.key);
    drawRing(v, s.ship, r, d.color, `${formatHm(r)} hm`);
  }
  for (const t of TORPS) {
    const run = s.torps[t.kind];
    if (!run.on) continue;
    drawRing(v, s.ship, hmU(tierRunHm(run, 0)), t.color, '', true);
    drawRing(v, s.ship, hmU(tierRunHm(run, 4)), t.color, `${t.label} V: ${Math.round(run.tierV)} hm`);
  }
  drawOwnShip(v, s.hull, s.ship, s.heading);
  return v;
}

/** Drag the ship; keep it inside the board disc. */
export function wireShipDrag(canvas: HTMLCanvasElement, getView: () => View | null, s: BenchState, getMap: () => GameMap, onMove: () => void): void {
  let dragging = false;
  const place = (e: PointerEvent): void => {
    const v = getView();
    if (!v) return;
    const p = toWorld(v, e.offsetX, e.offsetY);
    const radius = getMap().radius;
    const d = Math.hypot(p.x, p.y);
    const k = d > radius ? radius / d : 1;
    s.ship = { x: p.x * k, y: p.y * k };
    onMove();
  };
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    place(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) place(e);
  });
  const end = (): void => {
    dragging = false;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
