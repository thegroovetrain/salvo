// ============================================================
// SALVO — Hex Grid SVG Renderer
// Generates SVG hex grids, handles pixel↔hex conversion,
// and provides cell rendering utilities.
// ============================================================

import {
  allHexes, parseHex, hexToPixel, pixelToHex, hexCorners,
  hexToString, hexLinear, isValidHex, hexNeighborsInBounds,
  HEX_DIRECTIONS,
} from '@salvo/shared/hex';
import type { Hex } from '@salvo/shared/hex';

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
/** Ship data for hull rendering */
export interface ShipHullData {
  cells: string[];    // hex coordinate strings
  sunk: boolean;
  ghost?: boolean;    // placement preview
  ghostValid?: boolean;
  teammate?: boolean; // teammate's ship
}

/**
 * Render a connected ship hull as an SVG path.
 * Draws a rounded capsule shape along the ship's axis.
 */
function renderShipHull(ship: ShipHullData, hexSize: number): string {
  if (ship.cells.length === 0) return '';

  // Parse hex centers
  const centers = ship.cells.map(c => {
    const h = parseHex(c)!;
    return hexToPixel(h.q, h.r, hexSize);
  });

  // Hull width (fraction of hex size)
  const hullWidth = hexSize * 0.55;

  // Determine ship color/style
  let fillColor: string;
  let strokeColor: string;
  let opacity = '1';
  let strokeDash = '';
  if (ship.ghost) {
    fillColor = ship.ghostValid ? 'rgba(0,255,136,0.25)' : 'rgba(255,59,59,0.25)';
    strokeColor = ship.ghostValid ? '#00FF88' : '#FF3B3B';
    strokeDash = 'stroke-dasharray="4 2"';
    opacity = '0.8';
  } else if (ship.teammate) {
    fillColor = 'rgba(0,255,136,0.15)';
    strokeColor = 'rgba(0,255,136,0.60)';
    strokeDash = '';
    opacity = '0.8';
  } else if (ship.sunk) {
    fillColor = '#4A0000';
    strokeColor = '#5A1A1A';
    opacity = '0.9';
  } else {
    fillColor = 'rgba(0,255,136,0.2)';
    strokeColor = '#00FF88';
  }

  if (centers.length === 1) {
    // Single-cell ship (Scout): draw a small horizontal capsule
    const c = centers[0];
    const hw = hullWidth / 2;
    const halfLen = hexSize * 0.3;
    const r = hw;
    const path = [
      `M ${(-halfLen).toFixed(2)} ${(-hw).toFixed(2)}`,
      `L ${(halfLen).toFixed(2)} ${(-hw).toFixed(2)}`,
      `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(halfLen).toFixed(2)} ${(hw).toFixed(2)}`,
      `L ${(-halfLen).toFixed(2)} ${(hw).toFixed(2)}`,
      `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(-halfLen).toFixed(2)} ${(-hw).toFixed(2)}`,
      'Z',
    ].join(' ');
    return `<path d="${path}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" opacity="${opacity}" ${strokeDash} class="ship-hull" pointer-events="none" transform="translate(${c.x.toFixed(2)},${c.y.toFixed(2)})" />`;
  }

  // Multi-cell ship: compute axis direction and draw rounded capsule
  const first = centers[0];
  const last = centers[centers.length - 1];

  // Direction vector along ship axis
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';

  // Unit vectors: along axis and perpendicular
  const ax = dx / len;
  const ay = dy / len;
  const px = -ay; // perpendicular
  const py = ax;

  const hw = hullWidth / 2; // half-width
  const endCap = hexSize * 0.35; // how far past the end centers to extend

  // Extend start/end along axis for rounded ends
  const startX = first.x - ax * endCap;
  const startY = first.y - ay * endCap;
  const endX = last.x + ax * endCap;
  const endY = last.y + ay * endCap;

  // Build hull path: rounded capsule along the axis
  // Top edge → front arc (bulges out) → bottom edge → rear arc (bulges out)
  const r = hw; // radius for end caps — semicircle bulging outward
  const path = [
    `M ${(startX + px * hw).toFixed(2)} ${(startY + py * hw).toFixed(2)}`,
    `L ${(endX + px * hw).toFixed(2)} ${(endY + py * hw).toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${(endX - px * hw).toFixed(2)} ${(endY - py * hw).toFixed(2)}`,
    `L ${(startX - px * hw).toFixed(2)} ${(startY - py * hw).toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${(startX + px * hw).toFixed(2)} ${(startY + py * hw).toFixed(2)}`,
    'Z',
  ].join(' ');

  return `<path d="${path}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" opacity="${opacity}" ${strokeDash} class="ship-hull" pointer-events="none" />`;
}

export function renderHexGridSVG(
  rings: number,
  hexSize: number,
  islands: Set<string>,
  getCellState: CellStateFn,
  dataMode: 'placement' | 'battle',
  ships?: ShipHullData[],
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
      svg += `<g data-coord="${coord}" data-mode="${dataMode}" class="${state.cssClass}">`;
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

  // Ship hull overlay layer
  if (ships && ships.length > 0) {
    svg += '<g class="ship-hulls">';
    for (const ship of ships) {
      svg += renderShipHull(ship, hexSize);
    }
    svg += '</g>';
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
