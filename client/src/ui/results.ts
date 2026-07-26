// The results modal — plain DOM (like the menu). Story 2.3 (amendments 22/23)
// re-ruled it from an end-of-match-only screen into the ONE debrief surface:
//
//   • ELIMINATION — the instant your hull sinks in a live match the modal opens
//     with YOUR personal score (upgrades taken, kills incl. drones, the
//     contestant ships you personally sank) and the place you were eliminated
//     in. Buttons: SPECTATE (closes to the spectate view) + RETURN TO PORT. The
//     old silent auto-spectate is gone.
//   • GAME END — the same personal score plus the full placement table, a
//     winner indication when you took it, and RETURN TO PORT (Enter confirms).
//     SPECTATE is not offered: there is nothing left to watch.
//
// ESC on this modal is the topmost-close law and equals pressing SPECTATE — it
// never returns to port. Leaving a match is RETURN TO PORT or settings' ABANDON
// MATCH, never ESC and never a refresh.
//
// sortRows() / fmtDamage() / winnerBanner() / the score lines are pure and
// unit-tested; the rest is a thin DOM adapter.

import type { ResultsMsg, ResultsRow } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { PersonalScore } from '../score.js';
import { cssRgba } from '../util/color.js';
import { registerCss } from './theme.js';

const RESULTS_ID = 'results-overlay';
/** Stable ids for the modal's actions — pinned by results.test.ts, so a future
 *  third button in the panel can't silently repoint those pins. */
const RETURN_BUTTON_ID = 'results-return';
const SPECTATE_BUTTON_ID = 'results-spectate';

/** Pure: rows by placement ascending (winner first); input is not mutated. */
export function sortRows(rows: readonly ResultsRow[]): ResultsRow[] {
  return [...rows].sort((a, b) => a.placement - b.placement);
}

/** Pure: damage readout (whole hp). */
export function fmtDamage(d: number): string {
  return String(Math.round(d));
}

/** Pure: the banner line above the placement table at GAME END. */
export function winnerBanner(msg: ResultsMsg, ownId: string): string {
  if (msg.winnerId === ownId) return 'VICTORY';
  const winner = msg.rows.find((r) => r.id === msg.winnerId);
  return `WINNER: ${winner?.name ?? 'UNKNOWN'}`;
}

/**
 * Pure: the placement / winner line under the headline. A winner gets an
 * explicit indication instead of a number (amendment 23); a player whose
 * placement could not be derived reads a neutral line rather than a wrong one.
 */
export function placementLine(score: PersonalScore): string {
  if (score.winner) return 'LAST HULL FLOATING — YOU WON';
  return score.placement === null ? 'ELIMINATED' : `ELIMINATED — PLACE #${score.placement}`;
}

/** Pure: the personal-score stat rows (label / value pairs), in reading order. */
export function scoreRows(score: PersonalScore): Array<[string, string]> {
  return [
    ['UPGRADES TAKEN', String(score.upgrades)],
    ['KILLS', String(score.kills)],
  ];
}

/**
 * Pure: the "ships you sank" block. Contestant-controlled hulls only — drone
 * kills count in the KILLS tally above but never appear here (the I/O matrix's
 * "2 drones + 1 human ⇒ kills 3, list shows the human"). An empty roll reads as
 * an explicit line, never as a missing section.
 */
export function sunkLines(score: PersonalScore): string[] {
  return score.sunkContestants.length === 0 ? ['— NONE —'] : score.sunkContestants.map((n) => `· ${n}`);
}

/** Everything the modal renders. Built by main.ts at elimination and at game end. */
export interface ResultsView {
  /** Headline copy (ELIMINATED / VICTORY / WINNER: NAME). */
  banner: string;
  /** The headline reads as a win (phosphor rather than amber). */
  victory: boolean;
  score: PersonalScore;
  /** Full placement table — game end only; null at an elimination. */
  rows: readonly ResultsRow[] | null;
  /** Own session id (highlights the own table row). */
  ownId: string;
  /** Offer SPECTATE — only while the match is still live. */
  canSpectate: boolean;
}

export interface ResultsHandlers {
  /** SPECTATE (and the ESC topmost-close, which is identical to it). */
  onSpectate: () => void;
  /** RETURN TO PORT — the one path home. */
  onReturn: () => void;
}

const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'padding:24px',
  'background:' + cssRgba(CLIENT_CONFIG.colors.black, 0.88), // fullscreen dim, behind results only
  'z-index:1000',
].join(';');

const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  'align-items:stretch',
  'gap:18px',
  'padding:32px 40px',
  'max-height:100%',
  'overflow-y:auto',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-phosphor)',
  'font-family:var(--hc-font-mono)',
].join(';');

const CELL_CSS = 'padding:5px 16px;font:400 16px var(--hc-font-mono);letter-spacing:1px';

let handlers: ResultsHandlers | null = null;

/** The live score block of the open modal, so later roster patches can refresh
 *  it IN PLACE instead of leaving a stale snapshot on screen (see
 *  updateResultsScore). Null whenever no modal is up. */
let mounted: { placement: HTMLElement; card: HTMLElement; signature: string } | null = null;

/** Is the results modal currently on screen? (The uniform ESC law reads this.) */
export function resultsVisible(): boolean {
  return document.getElementById(RESULTS_ID) !== null;
}

/** Close the modal WITHOUT firing any action (the caller drives the consequence). */
export function hideResults(): void {
  document.getElementById(RESULTS_ID)?.remove();
  handlers = null;
  mounted = null;
}

/**
 * Pure: a cheap change signature for the personal-score block. The elimination
 * modal is driven off a roster that is still settling (see score.ts
 * refinePlacement), so it is re-derived every frame — this keeps that from
 * touching the DOM unless a number actually moved.
 */
export function scoreSignature(score: PersonalScore): string {
  return [score.upgrades, score.kills, score.placement, score.winner, score.sunkContestants.join('')].join('|');
}

/**
 * Refresh the OPEN modal's placement line + score card in place, converging on
 * server truth as roster patches land after an elimination (multi-death ticks
 * and patch lag both inflate the placement derived at the instant of the sunk
 * event, and a mutual kill can credit the last kill a beat later). The actions
 * and the placement table are untouched — only the personal block re-renders,
 * so nothing under the player's cursor is rebuilt. No-op when no modal is up or
 * nothing changed.
 */
export function updateResultsScore(score: PersonalScore): void {
  if (mounted === null) return;
  const sig = scoreSignature(score);
  if (sig === mounted.signature) return;
  mounted.signature = sig;
  mounted.placement.textContent = placementLine(score);
  const card = makeScoreCard(score);
  mounted.card.replaceWith(card);
  mounted.card = card;
}

/** ESC on the modal = SPECTATE (amendment 23). No-op when it isn't open. */
export function closeResultsAsSpectate(): void {
  const h = handlers;
  hideResults();
  h?.onSpectate();
}

function makeBanner(text: string, isVictory: boolean): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `font:700 32px var(--hc-font-display);letter-spacing:5px;text-align:center;color:${
    isVictory ? 'var(--hc-phosphor)' : 'var(--hc-amber)'
  }`;
  return el;
}

function makePlacement(score: PersonalScore): HTMLElement {
  const el = document.createElement('div');
  el.textContent = placementLine(score);
  el.style.cssText = `${registerCss('label')};text-align:center;color:var(--hc-phosphor)`;
  return el;
}

/** The personal-score card: the two tallies, then the sunk-contestant roll. */
function makeScoreCard(score: PersonalScore): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'gap:8px',
    'padding:16px 20px',
    'border:1px solid var(--hc-hairline)',
    'border-radius:8px',
    'background:var(--hc-panel-deep)',
  ].join(';');
  for (const [label, value] of scoreRows(score)) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:24px';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-primary)`;
    const v = document.createElement('span');
    v.textContent = value;
    v.style.cssText = 'font:600 20px var(--hc-font-mono);color:var(--hc-phosphor)';
    row.append(l, v);
    card.appendChild(row);
  }
  const head = document.createElement('div');
  head.textContent = 'SHIPS YOU SANK';
  head.style.cssText = `${registerCss('hudMicro')};color:var(--hc-text-primary);margin-top:6px`;
  card.appendChild(head);
  for (const line of sunkLines(score)) {
    const el = document.createElement('div');
    el.textContent = line;
    el.style.cssText = 'font:500 17px var(--hc-font-mono);color:var(--hc-phosphor)';
    card.appendChild(el);
  }
  return card;
}

function makeHeaderRow(): HTMLTableRowElement {
  const tr = document.createElement('tr');
  for (const h of ['#', 'CAPTAIN', 'KILLS', 'DMG']) {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.cssText = `${CELL_CSS};color:var(--hc-phosphor);letter-spacing:2px;text-align:left`;
    tr.appendChild(th);
  }
  return tr;
}

function makeRow(r: ResultsRow, own: boolean): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const color = own ? 'var(--hc-phosphor)' : 'var(--hc-text-primary)';
  if (own) tr.style.background = cssRgba(CLIENT_CONFIG.colors.phosphor, 0.1);
  for (const cell of [String(r.placement), r.name, String(r.kills), fmtDamage(r.damageDealt)]) {
    const td = document.createElement('td');
    td.textContent = cell;
    td.style.cssText = `${CELL_CSS};color:${color}`;
    tr.appendChild(td);
  }
  return tr;
}

function makeTable(rows: readonly ResultsRow[], ownId: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'overflow-x:auto';
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;margin:0 auto';
  table.appendChild(makeHeaderRow());
  for (const r of sortRows(rows)) table.appendChild(makeRow(r, r.id === ownId));
  wrap.appendChild(table);
  return wrap;
}

/** Panel action button — never keeps focus (a focused BUTTON suppresses the
 *  keyboard chokepoint, which would kill the modal's ESC/Enter). */
function makeAction(id: string, text: string, accent: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.textContent = text;
  btn.style.cssText = [
    'padding:11px 30px',
    'background:var(--hc-panel)',
    `border:1px solid ${accent}`,
    `color:${accent}`,
    'font:600 17px var(--hc-font-mono)',
    'letter-spacing:3px',
    'cursor:pointer',
  ].join(';');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    btn.blur();
    onClick();
  });
  return btn;
}

function makeActions(view: ResultsView, h: ResultsHandlers): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:16px;justify-content:center;flex-wrap:wrap';
  if (view.canSpectate) {
    row.appendChild(
      makeAction(SPECTATE_BUTTON_ID, 'SPECTATE', 'var(--hc-phosphor)', () => {
        hideResults();
        h.onSpectate();
      }),
    );
  }
  row.appendChild(
    makeAction(RETURN_BUTTON_ID, 'RETURN TO PORT', 'var(--hc-amber)', () => {
      h.onReturn();
    }),
  );
  return row;
}

/** Show the results modal (replaces any previous one). */
export function showResults(view: ResultsView, h: ResultsHandlers): void {
  hideResults();
  handlers = h;
  const overlay = document.createElement('div');
  overlay.id = RESULTS_ID;
  overlay.style.cssText = OVERLAY_CSS;

  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;
  const placement = makePlacement(view.score);
  const card = makeScoreCard(view.score);
  panel.append(makeBanner(view.banner, view.victory), placement, card);
  if (view.rows !== null) panel.appendChild(makeTable(view.rows, view.ownId));
  panel.appendChild(makeActions(view, h));

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  mounted = { placement, card, signature: scoreSignature(view.score) };
}
