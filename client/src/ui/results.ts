// End-of-match results overlay — plain DOM (like the menu), fed by the one
// 'results' broadcast. Winner banner, placement table (placement / captain /
// kills / dmg), own row highlighted, RETURN TO PORT action. sortRows() and
// fmtDamage() are pure and unit-tested; the rest is a thin DOM adapter.

import type { ResultsMsg, ResultsRow } from '@salvo/shared';

const RESULTS_ID = 'results-overlay';

/** Pure: rows by placement ascending (winner first); input is not mutated. */
export function sortRows(rows: readonly ResultsRow[]): ResultsRow[] {
  return [...rows].sort((a, b) => a.placement - b.placement);
}

/** Pure: damage readout (whole hp). */
export function fmtDamage(d: number): string {
  return String(Math.round(d));
}

/** Pure: the banner line above the table. */
export function winnerBanner(msg: ResultsMsg, ownId: string): string {
  if (msg.winnerId === ownId) return 'VICTORY';
  const winner = msg.rows.find((r) => r.id === msg.winnerId);
  return `WINNER: ${winner?.name ?? 'UNKNOWN'}`;
}

const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'background:rgba(0,0,0,0.88)',
  'z-index:1000',
].join(';');

const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'gap:20px',
  'padding:32px 40px',
  'background:#111111',
  'border:1px solid #00FF88',
  'font-family:"Geist Mono", monospace',
].join(';');

const CELL_CSS = 'padding:4px 14px;font:400 14px "Geist Mono", monospace;letter-spacing:1px';

function makeBanner(text: string, isVictory: boolean): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `font:700 32px Geist, "Geist Mono", monospace;letter-spacing:5px;color:${
    isVictory ? '#00FF88' : '#FFB800'
  }`;
  return el;
}

function makeHeaderRow(): HTMLTableRowElement {
  const tr = document.createElement('tr');
  for (const h of ['#', 'CAPTAIN', 'KILLS', 'DMG']) {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.cssText = `${CELL_CSS};color:#5A6478;font-size:11px;letter-spacing:2px;text-align:left`;
    tr.appendChild(th);
  }
  return tr;
}

function makeRow(r: ResultsRow, own: boolean): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const color = own ? '#00FF88' : '#E2E8F0';
  if (own) tr.style.background = 'rgba(0,255,136,0.1)';
  for (const cell of [String(r.placement), r.name, String(r.kills), fmtDamage(r.damageDealt)]) {
    const td = document.createElement('td');
    td.textContent = cell;
    td.style.cssText = `${CELL_CSS};color:${color}`;
    tr.appendChild(td);
  }
  return tr;
}

function makeReturnButton(onReturn: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = 'RETURN TO PORT';
  btn.style.cssText = [
    'padding:10px 28px',
    'background:#111111',
    'border:1px solid #FFB800',
    'color:#FFB800',
    'font:600 14px "Geist Mono", monospace',
    'letter-spacing:3px',
    'cursor:pointer',
  ].join(';');
  btn.addEventListener('click', onReturn);
  return btn;
}

/** Show the results overlay (replaces any previous one). */
export function showResults(msg: ResultsMsg, ownId: string, onReturn: () => void): void {
  document.getElementById(RESULTS_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = RESULTS_ID;
  overlay.style.cssText = OVERLAY_CSS;

  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;
  panel.appendChild(makeBanner(winnerBanner(msg, ownId), msg.winnerId === ownId));

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse';
  table.appendChild(makeHeaderRow());
  for (const r of sortRows(msg.rows)) table.appendChild(makeRow(r, r.id === ownId));
  panel.appendChild(table);

  panel.appendChild(makeReturnButton(onReturn));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
