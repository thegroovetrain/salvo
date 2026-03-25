import { state } from '../state.js';
import { showError } from '../errors.js';
import { playPlacementSound } from '../audio/index.js';
import { render } from '../rendering/render.js';
import { parseHex, allHexes, hexLinear, getShipPreview } from '../hexGrid.js';
import { SHIP_LENGTHS } from '@salvo/shared';
import { socket } from '../socket.js';
import type { ShipPlacement } from '@salvo/shared';

let placementPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

export function emitPlacementPreview(): void {
  if (placementPreviewTimeout) clearTimeout(placementPreviewTimeout);
  placementPreviewTimeout = setTimeout(() => {
    if (state.game?.teamsEnabled && state.placedShips.length > 0) {
      socket.emit('placement-preview', { ships: state.placedShips });
    }
  }, 300);
}

function tryPlaceShip(
  length: number,
  validHexes: string[],
  rings: number,
  islands: Set<string>,
  occupied: Set<string>,
): string[] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const anchor = validHexes[Math.floor(Math.random() * validHexes.length)];
    const h = parseHex(anchor);
    if (!h) continue;
    const dir = Math.floor(Math.random() * 6);
    const cells = hexLinear(h.q, h.r, dir, length, rings);
    if (!cells) continue;
    if (cells.some(c => occupied.has(c) || islands.has(c))) continue;
    return cells;
  }
  return null;
}

export function randomizePlacement(): void {
  const rings = state.game?.rings ?? 5;
  const islands = new Set(state.game?.islands ?? []);
  const occupied = new Set<string>();
  const ships: ShipPlacement[] = [];
  const lengths = [...SHIP_LENGTHS].sort((a, b) => b - a);
  const validHexes = allHexes(rings).filter(c => !islands.has(c));

  for (const length of lengths) {
    const cells = tryPlaceShip(length, validHexes, rings, islands, occupied);
    if (!cells) {
      state.placedShips = [];
      randomizePlacement();
      return;
    }
    cells.forEach(c => occupied.add(c));
    ships.push({ length, cells });
  }

  state.placedShips = ships;
  state.placingShip = null;
  state.ghostCells = [];
  render();
  emitPlacementPreview();
}

export function handlePlacementClick(coord: string): void {
  // If clicking on an already-placed ship, remove it
  const existingIdx = state.placedShips.findIndex(s => s.cells.includes(coord));
  if (existingIdx !== -1) {
    state.placedShips.splice(existingIdx, 1);
    render();
    emitPlacementPreview();
    return;
  }

  // If placing a ship
  if (!state.placingShip) return;

  const h = parseHex(coord);
  if (!h) return;
  const rings = state.game?.rings ?? 5;
  const islands = new Set(state.game?.islands ?? []);
  const occupied = new Set(state.placedShips.flatMap(s => s.cells));
  const preview = getShipPreview(h.q, h.r, state.placingShip.dirIndex, state.placingShip.length, rings, islands, occupied);
  const cells = preview.cells;
  if (cells.length === 0) return showError('Ship would go out of bounds');
  if (!preview.valid) return showError('Ships overlap or placed on island');

  // Track hull count before render so we can flash only the new one
  const hullCountBefore = document.querySelectorAll('.ship-hull').length;
  state.placedShips.push({ length: state.placingShip.length, cells });
  state.placingShip = null;
  state.ghostCells = [];
  render();
  emitPlacementPreview();
  // Placement confirmation flash + tone — only the newly placed ship's hull
  playPlacementSound();
  const allHulls = document.querySelectorAll<SVGPathElement>('.ship-hull');
  allHulls.forEach((el, i) => {
    if (i < hullCountBefore) return; // skip previously existing hulls
    const origFill = el.getAttribute('fill') || '';
    el.setAttribute('fill', 'rgba(0,255,136,0.8)');
    setTimeout(() => el.setAttribute('fill', origFill), 200);
  });
}
