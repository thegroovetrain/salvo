// ============================================================
// SALVO — Hex Grid SVG Renderer
// Generates SVG hex grids, handles pixel↔hex conversion,
// and provides cell rendering utilities.
// ============================================================

import {
  allHexes, parseHex, hexToPixel, pixelToHex, hexCorners,
  hexToString, hexLinear, isValidHex, hexNeighborsInBounds,
  HEX_DIRECTIONS,
} from '../../shared/src/hex.js';
import type { Hex } from '../../shared/src/hex.js';

// --- Types ---

export interface CellState {
  cssClass: string;
  symbol: string;
  extraHtml?: string;
}

export type CellStateFn = (coord: string) => CellState;

// --- SVG Hex Grid Generation ---

/**
 * Generate an SVG hex grid element.
 * Returns the full <svg> element as an HTML string.
 */
export function renderHexGridSVG(
  rings: number,
  hexSize: number,
  islands: Set<string>,
  getCellState: CellStateFn,
  dataMode: 'placement' | 'battle',
): string {
  const coords = allHexes(rings);

  // Calculate SVG viewBox from hex positions
  const padding = hexSize * 1.5;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const coord of coords) {
    const h = parseHex(coord)!;
    const corners = hexCorners(h.q, h.r, hexSize);
    for (const pt of corners) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }

  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = (maxX - minX) + padding * 2;
  const vbH = (maxY - minY) + padding * 2;

  let svg = `<svg class="hex-grid" viewBox="${vbX.toFixed(1)} ${vbY.toFixed(1)} ${vbW.toFixed(1)} ${vbH.toFixed(1)}" data-hex-size="${hexSize}" data-rings="${rings}">`;

  for (const coord of coords) {
    const h = parseHex(coord)!;
    const corners = hexCorners(h.q, h.r, hexSize);
    const points = corners.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');

    const isIsland = islands.has(coord);

    if (isIsland) {
      svg += `<polygon class="hex-cell hex-island" points="${points}" data-coord="${coord}" data-mode="${dataMode}" />`;
    } else {
      const state = getCellState(coord);
      const cls = `hex-cell ${state.cssClass}`.trim();
      svg += `<g data-coord="${coord}" data-mode="${dataMode}">`;
      svg += `<polygon class="${cls}" points="${points}" />`;
      if (state.symbol) {
        const center = hexToPixel(h.q, h.r, hexSize);
        svg += `<text class="hex-text" x="${center.x.toFixed(2)}" y="${center.y.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${state.symbol}</text>`;
      }
      if (state.extraHtml) {
        svg += state.extraHtml;
      }
      svg += '</g>';
    }
  }

  svg += '</svg>';
  return svg;
}

// --- Click Detection ---

/**
 * Convert a click event on the SVG to an axial hex coordinate string.
 * Returns null if the click is outside the grid bounds.
 */
export function svgClickToHex(
  event: MouseEvent,
  svgElement: SVGSVGElement,
  hexSize: number,
  rings: number,
): string | null {
  const point = svgElement.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  // Transform from screen coordinates to SVG coordinates
  const ctm = svgElement.getScreenCTM();
  if (!ctm) return null;
  const svgPoint = point.matrixTransform(ctm.inverse());

  const hex = pixelToHex(svgPoint.x, svgPoint.y, hexSize);
  if (!isValidHex(hex.q, hex.r, rings)) return null;

  return hexToString(hex.q, hex.r);
}

// --- Ship Placement Helpers ---

/**
 * Get ship cells for placement preview.
 * Returns { cells, valid } where valid is true if all cells are in bounds and not on islands.
 */
export function getShipPreview(
  anchorQ: number,
  anchorR: number,
  dirIndex: number,
  length: number,
  rings: number,
  islands: Set<string>,
  occupiedCells: Set<string>,
): { cells: string[]; valid: boolean } {
  const cells = hexLinear(anchorQ, anchorR, dirIndex, length, rings);
  if (!cells) return { cells: [], valid: false };

  const valid = cells.every(cell => !islands.has(cell) && !occupiedCells.has(cell));
  return { cells, valid };
}

/**
 * Cycle to the next valid placement direction.
 * Returns the next direction index (0-5) after the current one.
 */
export function nextDirection(current: number): number {
  return (current + 1) % 6;
}

// Re-export hex utilities that the client needs
export {
  parseHex, hexToString, hexToPixel, pixelToHex,
  allHexes, isValidHex, hexLinear, hexNeighborsInBounds,
  HEX_DIRECTIONS,
};
export type { Hex };
