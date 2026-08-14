// The results modal — plain DOM (like the menu). Story 2.3 (amendments 22/23)
// re-ruled it from an end-of-match-only screen into the ONE debrief surface:
//
//   • ELIMINATION — the instant your hull founders in a live match the modal
//     opens with YOUR personal score (kills, placement, time afloat, the match
//     log, the contestant ships you personally sank) and the place you were
//     eliminated in. Buttons: SPECTATE (closes to the spectate view) + RETURN TO
//     PORT. The old silent auto-spectate is gone.
//   • GAME END — the same personal card plus the full placement table, a winner
//     indication when you took it, and RETURN TO PORT (Enter confirms).
//     SPECTATE is not offered: there is nothing left to watch.
//
// ESC on this modal is the topmost-close law and equals pressing SPECTATE — it
// never returns to port. Leaving a match is RETURN TO PORT or settings' ABANDON
// MATCH, never ESC and never a refresh.
//
// STORY 5.3 (amendments 23/24/28/29/30) — THE COMPOSITION MOVES, THE VERBS DO
// NOT. This module was restyled to mockup F3 (`death-reveal-results-1.html`
// lines 963-1131), the ratified visual contract:
//
//   • THE DIM IS THE FEATURE (amendment 24). The reveal is the BACKDROP, not a
//     beat of its own — the modal opens over the whole-ocean pull-back, so the
//     fullscreen dim drops from a near-opaque black to `fogBase` at
//     `CLIENT_CONFIG.results.dimAlpha` (0.62, mockup F3). At 0.88 the player
//     would see none of the feature. It is not a styling detail and must not be
//     "tidied" back.
//   • THE BANNER READS `SUNK`, with `9TH OF 14` under it and the identity line
//     `<CALLSIGN> · <CLASS>` under that (amendment 29) — the death register
//     verbatim from EXPERIENCE.md's voice spine. Victory and draw banners keep
//     their existing copy and the phosphor/amber split is unchanged.
//   • THE MATCH LOG (amendment 28) — *"I'd like to know at what game time I got
//     the kills I got."* Eric's own composition, his death line included.
//   • NO INSTANT RE-QUEUE, EVER (amendment 30, stated in the strongest terms
//     the ledger has recorded). The modal renders EXACTLY two possible actions,
//     SPECTATE and RETURN TO PORT; there is no code path from here into a new
//     match. `results.test.ts` pins the rendered action set so it cannot drift.
//     The mockup's `SET SAIL IS ONE PRESS AWAY` button sub-line is DELETED by
//     the same ruling — Eric took the subtraction.
//   • `SHIPS YOU SANK` STAYS (epic-2 amendment 23 ratified that roll by name;
//     the mockup predates it). The MATCH LOG is additive, not a replacement.
//
// sortRows() / fmtDamage() / winnerBanner() / bannerText() / placementLine() /
// statTiles() / matchLogRow() and the section copy are pure and unit-tested; the
// rest is a thin DOM adapter.

import {
  BOON_CATALOG,
  CONFIG,
  boonStackCount,
  effectiveStats,
  resolveBoons,
  type EffectiveStats,
  type ResultsMsg,
  type ResultsRow,
  type ShipClassId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { applyViewportCap } from './fit.js';
import type { MatchLogEntry, PersonalScore } from '../score.js';
import { cssHex, cssRgba, textSafe } from '../util/color.js';
import { boonEffectLine, boonName, boonCategoryLabel } from './boonCopy.js';
import { CLASS_DISPLAY_NAMES } from './classSelect.js';
import { fmtBarClock, fmtElapsedClock } from './chromeBar.js';

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

/** The DRAW reading — every remaining captain sank on the same tick, so the
 *  match has no winner at all (Story 5.2, amendment 14). */
export const DRAW_BANNER = 'DRAW';

/** THE DEATH REGISTER (amendment 29, EXPERIENCE.md:52 — *"dry-naval: 'SUNK —
 *  9TH OF 14'. Grim facts, no mockery, no exclamation points"*). Retires the
 *  shipped `ELIMINATED` banner. */
export const DEATH_BANNER = 'SUNK';

/**
 * Pure: the banner line above the placement table at GAME END.
 *
 * THE EMPTY WINNER IS A DRAW, NOT AN UNKNOWN ONE (amendment 14, Eric: *"if all
 * remaining players die at the same time... a draw is acceptable"*). Story 5.2
 * makes `winnerId: ''` genuinely reachable — a fixed-length sinking window is a
 * constant delay, so two hulls entering the window on one tick found on one
 * tick and exact ties are PRESERVED rather than scattered — and the shipped
 * fallthrough rendered that as `WINNER: UNKNOWN`, which reads as a lookup
 * failure rather than a result.
 *
 * Tested FIRST, ahead of the victory compare: an own id that is somehow also
 * empty (no session, a torn-down room) must read the match's outcome, never
 * claim a victory nobody won.
 */
export function winnerBanner(msg: ResultsMsg, ownId: string): string {
  if (msg.winnerId === '') return DRAW_BANNER;
  if (msg.winnerId === ownId) return 'VICTORY';
  const winner = msg.rows.find((r) => r.id === msg.winnerId);
  return `WINNER: ${winner?.name ?? 'UNKNOWN'}`;
}

/**
 * Pure: is this the GAME-END view rather than a mid-match elimination?
 *
 * `rows` IS the discriminator and both call sites are exact: the elimination
 * modal passes `rows: null`, game end always passes the results message's rows.
 * Written once, here, because two things read it and they must never disagree —
 * the headline (below) and the `⏎` key chip (Enter only returns to port at game
 * end; see makeActions).
 */
export function isMatchEnd(view: ResultsView): boolean {
  return view.rows !== null;
}

/**
 * Pure: the modal's HEADLINE. The death register is owned HERE (amendment 29):
 * an elimination always reads `SUNK`, whatever copy the caller carried. A
 * game-end view keeps its own headline (VICTORY / WINNER: NAME / DRAW), which
 * amendment 29 leaves untouched — *"the victory and draw banners keep their
 * existing copy and the phosphor/amber split is unchanged."*
 */
export function bannerText(view: ResultsView): string {
  return isMatchEnd(view) ? view.banner : DEATH_BANNER;
}

/** Pure: `1` → `1ST`, `9` → `9TH`, `11` → `11TH`, `22` → `22ND`. The teens are
 *  the whole reason this isn't a one-liner (11/12/13 all take TH). */
export function ordinalPlace(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const teen = abs % 100;
  if (teen >= 11 && teen <= 13) return `${abs}TH`;
  const suffix = ['TH', 'ST', 'ND', 'RD'][abs % 10] ?? 'TH';
  return `${abs}${suffix}`;
}

/**
 * Pure: the register UNDER the banner — mockup F3's `9TH OF 14` (amendment 29,
 * which retires the shipped `ELIMINATED — PLACE #n` prose line).
 *
 * `fieldSize` is the captain count the placement was scored against; absent (or
 * smaller than the placement itself, which can only be a roster still settling)
 * the line degrades to the bare ordinal rather than printing an `OF n` it cannot
 * stand behind. A placement we could not derive at all yields NO line — the
 * banner has already said SUNK, and a neutral filler under it says nothing.
 *
 * A winner is INDICATED rather than numbered (amendment 23, unchanged copy).
 */
export function placementLine(score: PersonalScore, fieldSize: number | null = null): string {
  if (score.winner) return 'LAST HULL FLOATING — YOU WON';
  if (score.placement === null) return '';
  const place = ordinalPlace(score.placement);
  return fieldSize !== null && fieldSize >= score.placement ? `${place} OF ${fieldSize}` : place;
}

/** One stat tile of the centered three-up row (mockup F3 `.res-stat`). */
export interface StatTile {
  /** The key under the value (rendered uppercase, muted). */
  key: string;
  /** The value itself. */
  value: string;
  /** A MUTED continuation of the value — the `/14` of `9/14`. */
  tail?: string;
  /** Draw the value in phosphor rather than text-primary (KILLS only). */
  phosphor?: boolean;
}

/**
 * Pure: the three stat tiles — KILLS / PLACEMENT / TIME AFLOAT, the set UX-DR27
 * ratified and mockup F3 draws (amendment 28 declined dropping the third in
 * favour of the MATCH LOG: *"TIME AFLOAT STAYS"*).
 *
 * TWO TILES ARE OMITTABLE, and both omissions are the same rule: there is no
 * in-band number that means "unknown", so an underivable stat leaves the row
 * rather than printing a lie.
 *   • TIME AFLOAT — `afloatMs: null` means the match clock was never anchored
 *     (spec 5.3 I/O matrix). 0 is a legitimate value, so it cannot double as
 *     the sentinel.
 *   • PLACEMENT — a placement we could not derive. A winner is the one case
 *     where the number is known WITHOUT being recorded: they placed first.
 */
export function statTiles(score: PersonalScore, fieldSize: number | null = null): StatTile[] {
  const tiles: StatTile[] = [{ key: 'KILLS', value: String(score.kills), phosphor: true }];
  const place = score.winner ? 1 : score.placement;
  if (place !== null) {
    const tail = fieldSize !== null && fieldSize >= place ? `/${fieldSize}` : undefined;
    tiles.push({ key: 'PLACEMENT', value: String(place), tail });
  }
  // fmtElapsedClock, NOT fmtRingClock: the ring clock has the right SHAPE
  // (unpadded `6:27`) and the wrong DIRECTION (it ceils, because it counts
  // down). TIME AFLOAT is elapsed and latches at the same millisecond as the
  // MATCH LOG's `SUNK BY` stamp below it, so ceiling here made the two disagree
  // by a second on every non-boundary death (review finding).
  if (score.afloatMs !== null) tiles.push({ key: 'TIME AFLOAT', value: fmtElapsedClock(score.afloatMs) });
  return tiles;
}

/**
 * Pure: one MATCH LOG line, split into its two columns (amendment 28 — Eric's
 * chosen composition verbatim):
 *
 *     T+02:41   SANK SALT SHAKER
 *     T+06:27   SUNK BY KRAKEN'S BANE
 *
 * The stamp reuses the BR chrome bar's `fmtBarClock` — zero-padded `mm:ss`, the
 * same `serverNow − zoneStartT` derivation the bar has run since Story 3.3, so
 * a log line and the bar can never disagree about what T+ said.
 */
export function matchLogRow(entry: MatchLogEntry): { stamp: string; text: string } {
  return {
    stamp: `T+${fmtBarClock(entry.tMs)}`,
    text: `${entry.kind === 'sank' ? 'SANK' : 'SUNK BY'} ${entry.name}`,
  };
}

/** Pure: the LAST OFFER section head — `LAST OFFER — 1 LEVEL UNSPENT`. The
 *  plural is the only moving part; the mockup's own head prints the count. */
export function offerHeading(pts: number): string {
  return `LAST OFFER — ${pts} LEVEL${pts === 1 ? '' : 'S'} UNSPENT`;
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

/**
 * The own hull's identity + build, for the blocks the personal score does not
 * carry. Optional on the view: absent, every block that needs it is simply not
 * drawn (the modal degrades to the score card, which is complete on its own).
 * Everything here is already in hand when the modal opens — `net.you` is never
 * cleared on death (`roomBindings.ts:799-800`), so this costs ZERO wire
 * (amendment 28).
 */
export interface ResultsOwn {
  /** Own callsign, as the roster carries it. */
  name: string;
  /** Own ship class — rendered through CLASS_DISPLAY_NAMES. */
  cls: ShipClassId;
  /** RAW personal hue; lifted through `textSafe()` here exactly as the kill feed
   *  and the chrome bar lift it (the mockup's own legend: *"darker hues would
   *  use their text-safe variants"*). */
  hue: number;
  /** Fitted boon ids, REPEATS INTACT (`OwnShip.boons`). */
  boons: readonly string[];
  /** The FRONT queued offer's boon ids (`OwnShip.offer`), `[]` when nothing is
   *  banked. Death is the only thing that expires an offer, which is why the
   *  modal is where it gets reviewed. */
  offer: readonly string[];
  /** Banked levels still unspent (`OwnShip.pts`). */
  pts: number;
}

/** Everything the modal renders. Built by main.ts at elimination and at game end. */
export interface ResultsView {
  /** GAME-END headline copy (VICTORY / WINNER: NAME / DRAW). An elimination's
   *  headline is owned by this module — see bannerText. */
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
  /** Own identity + build (amendment 29's identity line, plus the boons/offer
   *  blocks). Omitted ⇒ those blocks are not drawn. */
  own?: ResultsOwn | null;
  /** Captains in the match — the `OF 14` of `9TH OF 14`. Null ⇒ the bare
   *  ordinal (see placementLine); the game-end table supplies it for free. */
  fieldSize?: number | null;
}

export interface ResultsHandlers {
  /** SPECTATE (and the ESC topmost-close, which is identical to it). */
  onSpectate: () => void;
  /** RETURN TO PORT — the one path home. */
  onReturn: () => void;
}

const R = CLIENT_CONFIG.results;

// THE FULLSCREEN DIM IS THE FEATURE, NOT A STYLING DETAIL (amendment 24): the
// omniscient reveal is the BACKDROP this modal sits on, so the dim has to be
// thin enough to see the whole ocean through. Mockup F3's dim — `fogBase` at
// `results.dimAlpha` — replaces the shipped near-opaque black.
const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'padding:24px',
  'background:' + cssRgba(CLIENT_CONFIG.colors.fogBase, R.dimAlpha),
  'z-index:1000',
].join(';');

// AMENDMENT 47 (the container-fit law): `box-sizing:border-box` is LOAD-BEARING
// next to `max-height:100%`. Under the default content-box, that max caps the
// CONTENT height, so the panel's border box came out at `overlayHeight + 66px`
// (padding + border) at EVERY viewport — 33px of the results modal was clipped
// off the top and bottom edges, viewport-independent, and the top clip took the
// banner with it.
//
// {components.modal} (DESIGN.md:112/245) + mockup F3 `.results`: panel bed, 1px
// HAIRLINE border (the shipped phosphor border is retired — port chrome is soft
// and quiet; the tactical register's hard edges stay on the water), {rounded.lg}
// 12px, fixed 620px column.
const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  'align-items:stretch',
  `width:${R.panelWidth}px`,
  'max-width:100%',
  `padding:${R.panelPad}`,
  'box-sizing:border-box',
  'max-height:100%',
  'overflow-y:auto',
  'background:var(--hc-panel)',
  'border:1px solid var(--hc-hairline)',
  `border-radius:${R.panelRadius}px`,
  'font-family:var(--hc-font-mono)',
].join(';');

const CELL_CSS = 'padding:5px 16px;font:400 16px var(--hc-font-mono);letter-spacing:1px';

/** Mockup F3 `.res-sec-h` — the section-head register every block below the
 *  stat row wears (MATCH LOG / SHIPS YOU SANK / BOONS ACCRUED / LAST OFFER). */
const SECTION_HEAD_CSS =
  'font:400 10px var(--hc-font-mono);letter-spacing:.24em;text-transform:uppercase;' +
  'color:var(--hc-text-muted);margin:20px 0 10px';

/** Mockup F3 `.res-boons` — the body register the boon rows, the match log and
 *  the sunk roll share (one list voice for the whole lower half). */
const LIST_CSS = 'font:400 12px var(--hc-font-mono);letter-spacing:.06em;color:var(--hc-text-secondary);line-height:2';

let handlers: ResultsHandlers | null = null;

/** The live score block of the open modal, so later roster patches can refresh
 *  it IN PLACE instead of leaving a stale snapshot on screen (see
 *  updateResultsScore). Null whenever no modal is up. */
let mounted: { placement: HTMLElement; card: HTMLElement; fieldSize: number | null; signature: string } | null = null;

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
 *
 * The MATCH LOG and TIME AFLOAT are IN the signature (Story 5.3): both are
 * rendered inside the refreshable card, and a fold that lands after the modal
 * opens — a kill scored during our own five-second sinking window (amendment 11:
 * you go down SHOOTING) is exactly that — has to reach the screen.
 */
export function scoreSignature(score: PersonalScore): string {
  const log = score.matchLog.map((e) => `${e.tMs}${e.kind}${e.name}`).join('/');
  return [score.boons, score.kills, score.placement, score.winner, score.afloatMs, score.sunkContestants.join(''), log].join('|');
}

/**
 * Refresh the OPEN modal's placement line + score card in place, converging on
 * server truth as roster patches land after an elimination (multi-death ticks
 * and patch lag both inflate the placement derived at the instant of the sunk
 * event, and a mutual kill can credit the last kill a beat later). The actions,
 * the identity line, the build blocks and the placement table are untouched —
 * only the score-derived block re-renders, so nothing under the player's cursor
 * is rebuilt. `replaceWith` keeps the card at its own position in the panel, so
 * a refresh can neither reorder the sections nor duplicate a match-log line.
 * No-op when no modal is up or nothing changed.
 */
export function updateResultsScore(score: PersonalScore): void {
  if (mounted === null) return;
  const sig = scoreSignature(score);
  if (sig === mounted.signature) return;
  mounted.signature = sig;
  mounted.placement.textContent = placementLine(score, mounted.fieldSize);
  const card = makeScoreCard(score, mounted.fieldSize);
  mounted.card.replaceWith(card);
  mounted.card = card;
}

/** ESC on the modal = SPECTATE (amendment 23). No-op when it isn't open. */
export function closeResultsAsSpectate(): void {
  const h = handlers;
  hideResults();
  h?.onSpectate();
}

/** Mockup F3 `.res-banner .b1` — 40px/600/.3em in the outcome's colour with its
 *  own glow. `text-indent` compensates the tracking so a tracked centered line
 *  is actually centered (the home page's PLAY button set that precedent). */
function makeBanner(text: string, isVictory: boolean): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  const hue = isVictory ? CLIENT_CONFIG.colors.phosphor : CLIENT_CONFIG.colors.amber;
  el.style.cssText = [
    'font:600 40px var(--hc-font-mono)',
    'letter-spacing:.3em',
    'text-indent:.3em',
    'text-align:center',
    'text-transform:uppercase',
    `color:${cssHex(hue)}`,
    `text-shadow:0 0 22px ${cssRgba(hue, 0.3)}`,
  ].join(';');
  return el;
}

/** Mockup F3 `.res-banner .b2` — `9TH OF 14`, the register the death line lands
 *  on now that amendment 24 deleted the reveal stage it used to be drawn on. */
function makePlacement(score: PersonalScore, fieldSize: number | null): HTMLElement {
  const el = document.createElement('div');
  el.textContent = placementLine(score, fieldSize);
  el.style.cssText =
    'font:400 15px var(--hc-font-mono);letter-spacing:.26em;text-indent:.26em;text-align:center;' +
    'text-transform:uppercase;color:var(--hc-text-primary);margin-top:10px';
  return el;
}

/** Mockup F3 `.res-you` — `<CALLSIGN> · <CLASS>` with the callsign in the
 *  player's OWN hue at weight 600 (amendment 29). The hue is lifted through
 *  `textSafe()`, the same WCAG lift the kill feed and the chrome bar apply. */
function makeIdentity(own: ResultsOwn): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'font:400 12px var(--hc-font-mono);letter-spacing:.2em;text-align:center;' +
    'text-transform:uppercase;color:var(--hc-text-muted);margin-top:18px';
  const name = document.createElement('span');
  name.textContent = own.name;
  name.style.cssText = `color:${cssHex(textSafe(own.hue))};font-weight:600`;
  el.append(name, document.createTextNode(` · ${CLASS_DISPLAY_NAMES[own.cls]}`));
  return el;
}

/** One stat tile: the big tabular value over its muted key. */
function makeTile(tile: StatTile): HTMLElement {
  const cell = document.createElement('div');
  const v = document.createElement('div');
  v.textContent = tile.value;
  v.style.cssText = `font:600 30px var(--hc-font-mono);color:var(--hc-${tile.phosphor === true ? 'phosphor' : 'text-primary'})`;
  if (tile.tail !== undefined) {
    const tail = document.createElement('span');
    tail.textContent = tile.tail;
    tail.style.color = 'var(--hc-text-muted)';
    v.appendChild(tail);
  }
  const k = document.createElement('div');
  k.textContent = tile.key;
  k.style.cssText =
    'font:400 10px var(--hc-font-mono);letter-spacing:.22em;text-transform:uppercase;color:var(--hc-text-muted);margin-top:5px';
  cell.append(v, k);
  return cell;
}

/** Mockup F3 `.res-stats` — the centered three-up row. */
function makeTiles(score: PersonalScore, fieldSize: number | null): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:center;gap:56px;margin-top:26px;text-align:center';
  for (const tile of statTiles(score, fieldSize)) row.appendChild(makeTile(tile));
  return row;
}

/** Mockup F3 `.res-div` — the one hairline rule under the stat row. */
function makeDivider(): HTMLElement {
  const hr = document.createElement('hr');
  hr.style.cssText = 'margin:26px 0 0;border:none;border-top:1px solid var(--hc-hairline);width:100%';
  return hr;
}

/** Mockup F3 `.res-sec-h` — a section head in the one shared register. */
function makeSectionHead(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = SECTION_HEAD_CSS;
  return el;
}

/**
 * THE MATCH LOG (amendment 28) — `T+02:41   SANK SALT SHAKER`, the player's whole
 * match rather than only their kills. Two columns so the stamps line up: mono +
 * the theme's global tabular-nums makes every stamp the same width, and the
 * fixed column keeps the verbs aligned under each other too.
 *
 * OMITTED ENTIRELY when the log is empty (returns null) — a captain can finish a
 * match having named nobody, and an empty block is a heading that says nothing.
 */
function makeMatchLog(score: PersonalScore): HTMLElement | null {
  if (score.matchLog.length === 0) return null;
  const block = document.createElement('div');
  block.appendChild(makeSectionHead('MATCH LOG'));
  const list = document.createElement('div');
  list.style.cssText = LIST_CSS;
  for (const entry of score.matchLog) {
    const { stamp, text } = matchLogRow(entry);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:18px';
    const t = document.createElement('span');
    t.textContent = stamp;
    t.style.cssText = 'color:var(--hc-text-muted);flex:0 0 auto;min-width:8ch';
    const what = document.createElement('span');
    what.textContent = text;
    row.append(t, what);
    list.appendChild(row);
  }
  block.appendChild(list);
  return block;
}

/** `SHIPS YOU SANK` — KEPT (epic-2 amendment 23 ratified this roll by name; the
 *  mockup predates it and the MATCH LOG above is additive, not a replacement). */
function makeSunkRoll(score: PersonalScore): HTMLElement {
  const block = document.createElement('div');
  block.appendChild(makeSectionHead('SHIPS YOU SANK'));
  const list = document.createElement('div');
  list.style.cssText = `${LIST_CSS};color:var(--hc-phosphor)`;
  for (const line of sunkLines(score)) {
    const el = document.createElement('div');
    el.textContent = line;
    list.appendChild(el);
  }
  block.appendChild(list);
  return block;
}

/** The SCORE-DERIVED half of the panel — everything `updateResultsScore` can
 *  re-render in place as the roster converges (tiles, match log, sunk roll). */
function makeScoreCard(score: PersonalScore, fieldSize: number | null): HTMLElement {
  const card = document.createElement('div');
  card.append(makeTiles(score, fieldSize), makeDivider());
  const log = makeMatchLog(score);
  if (log !== null) card.appendChild(log);
  card.appendChild(makeSunkRoll(score));
  return card;
}

// --- THE BUILD BLOCKS — an OPEN OWNER DECISION (amendment 28) -----------------
//
// Eric: *"I don't know if I care about what boons I have selected at this point,
// i'll need to think on that."* Both blocks are ratified in UX-DR27 and drawn in
// mockup F3, and both cost ZERO wire, so they are BUILT to the mockup and are a
// PURE SUBTRACTION to cut on sight (the `deferred-work.md:860` agreement — prefer
// "ship it and look" over choosing from written descriptions).
//
// THAT IS WHY EACH IS ONE SELF-CONTAINED RENDER FUNCTION returning an element or
// null: cutting either is deleting its function and its one `append` line in
// showResults. Nothing else in this module reads them.

/** BOONS ACCRUED (cut-able — see the block note above). `◆ NAME — effect line`,
 *  the hotbar tooltip's accrued-row grammar verbatim: stacked copies COLLAPSE to
 *  one row named at the rung you hold, and the effect line reports what the
 *  FITTED build actually has (live `effectiveStats`, no preview diff). */
function makeBoons(own: ResultsOwn): HTMLElement | null {
  if (own.boons.length === 0) return null;
  const stats: EffectiveStats = effectiveStats(CONFIG.shipClasses[own.cls], resolveBoons(own.boons));
  const block = document.createElement('div');
  block.appendChild(makeSectionHead('BOONS ACCRUED'));
  const list = document.createElement('div');
  list.style.cssText = LIST_CSS;
  for (const id of [...new Set(own.boons)]) {
    const row = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = `◆ ${boonName(id, boonStackCount(own.boons, id) - 1)}`;
    name.style.cssText = 'color:var(--hc-phosphor);font-weight:600';
    row.append(name, document.createTextNode(` — ${boonEffectLine(id, stats)}`));
    list.appendChild(row);
  }
  block.appendChild(list);
  return block;
}

/** LAST OFFER (cut-able — see the block note above). The dashed cards of the
 *  offer death expired, category over name. Drawn only with a banked level AND
 *  a front offer to show: `pts === offer.length` is the server's own invariant,
 *  but both are checked because either alone would draw an empty row. */
function makeOffer(own: ResultsOwn): HTMLElement | null {
  if (own.pts <= 0 || own.offer.length === 0) return null;
  const block = document.createElement('div');
  block.appendChild(makeSectionHead(offerHeading(own.pts)));
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px';
  for (const id of own.offer) {
    const def = BOON_CATALOG[id];
    if (def === undefined) continue; // fail-open: an unresolvable id drops its card, never the block
    const card = document.createElement('div');
    card.style.cssText = [
      'flex:1',
      'padding:8px 10px',
      `border:1px dashed ${cssRgba(CLIENT_CONFIG.colors.textMuted, 0.45)}`,
      `border-radius:${R.controlRadius}px`,
      'font:400 10px var(--hc-font-mono)',
      'letter-spacing:.1em',
      'text-transform:uppercase',
      'color:var(--hc-text-muted)',
      'text-align:center',
      'line-height:1.7',
    ].join(';');
    const cat = document.createElement('span');
    cat.textContent = boonCategoryLabel(def.category);
    cat.style.cssText = 'color:var(--hc-text-secondary);font-size:9px;letter-spacing:.18em;display:block';
    card.append(cat, document.createTextNode(boonName(id, boonStackCount(own.boons, id))));
    row.appendChild(card);
  }
  block.appendChild(row);
  return block;
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
  // `flex:0 0 auto` is the amendment-47 half of this element. `overflow-x:auto`
  // makes it a scroll container, which gives it an automatic min-size of 0 —
  // so inside the panel's flex column it became the shrink SINK: at a short
  // viewport the whole placement table was crushed from its natural 279px into
  // a ~49px window (a 1.5-row peephole) while the score card kept every pixel.
  // Refusing to shrink puts the overflow back on the PANEL, which already owns
  // the one scroll surface this modal is allowed to have.
  wrap.style.cssText = 'overflow-x:auto;flex:0 0 auto;margin-top:20px';
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;margin:0 auto';
  table.appendChild(makeHeaderRow());
  for (const r of sortRows(rows)) table.appendChild(makeRow(r, r.id === ownId));
  wrap.appendChild(table);
  return wrap;
}

/**
 * Panel action button — never keeps focus (a focused BUTTON suppresses the
 * keyboard chokepoint, which would kill the modal's ESC/Enter).
 *
 * {components.button-primary} (DESIGN.md:111) and mockup F3 `.btn`: *"outline +
 * glow, NEVER a filled slab"* — transparent bed, 1px accent hairline,
 * {rounded.md}. `glow` carries the primary's outer+inset amber bloom; the
 * secondary (SPECTATE) is the same shape unlit, which is what keeps it the
 * non-dominant action the mockup's legend #7 calls for.
 */
function makeAction(
  id: string,
  text: string,
  accent: string,
  onClick: () => void,
  opts: { glow?: number; chip?: string } = {},
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.style.cssText = [
    'flex:1',
    'padding:14px 10px',
    'background:transparent', // never a filled slab
    `border:1px solid ${accent}`,
    `border-radius:${R.controlRadius}px`,
    `color:${accent}`,
    'font:600 13px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'cursor:pointer',
    opts.glow === undefined
      ? ''
      : `box-shadow:0 0 18px ${cssRgba(opts.glow, 0.28)}, inset 0 0 14px ${cssRgba(opts.glow, 0.07)}`,
  ].join(';');
  if (opts.chip !== undefined) btn.appendChild(makeKeyChip(opts.chip));
  btn.appendChild(document.createTextNode(text));
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    btn.blur();
    onClick();
  });
  return btn;
}

/** Mockup F3 `.res-key` — the boxed key glyph before a button's label. */
function makeKeyChip(glyph: string): HTMLElement {
  const chip = document.createElement('span');
  chip.textContent = glyph;
  chip.style.cssText = 'display:inline-block;padding:0 5px;border:1px solid currentColor;margin-right:7px;font-size:10px';
  return chip;
}

/**
 * THE ACTION SET — SPECTATE (live match only) and RETURN TO PORT. NOTHING ELSE,
 * EVER (amendment 30: *"I DO NOT WANT INSTANT REQUE. You MUST return to the home
 * screen to requeue. MUST."*). There is no code path from this modal into a new
 * match, and `results.test.ts` pins the rendered set so a later story cannot
 * drift one in. The mockup's `SET SAIL IS ONE PRESS AWAY` sub-line is deleted by
 * the same ruling.
 *
 * THE `⏎` CHIP IS GAME-END ONLY, and that is a truthfulness rule rather than a
 * styling one: Enter returns to port only when the match is over
 * (`main.ts` handleConfirm — `g.state.matchOver`), so a chip on the elimination
 * modal would promise a key that does nothing. Amendment 23 froze the key law;
 * the affordance follows it rather than the other way round.
 */
function makeActions(view: ResultsView, h: ResultsHandlers): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:14px;justify-content:center;margin-top:30px';
  if (view.canSpectate) {
    row.appendChild(
      makeAction(SPECTATE_BUTTON_ID, 'SPECTATE', 'var(--hc-phosphor)', () => {
        hideResults();
        h.onSpectate();
      }),
    );
  }
  row.appendChild(
    makeAction(RETURN_BUTTON_ID, 'RETURN TO PORT', 'var(--hc-amber)', () => h.onReturn(), {
      glow: CLIENT_CONFIG.colors.amber,
      chip: isMatchEnd(view) ? '⏎' : undefined,
    }),
  );
  return row;
}

/** The captain count the `OF n` reads. The game-end table IS the field, so it
 *  answers for itself; an elimination takes the caller's roster count. */
function fieldSizeOf(view: ResultsView): number | null {
  return view.rows !== null ? view.rows.length : view.fieldSize ?? null;
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
  applyViewportCap(panel); // amendment 47 — border-box + a real scroll surface (ui/fit.ts)
  const fieldSize = fieldSizeOf(view);
  const placement = makePlacement(view.score, fieldSize);
  const card = makeScoreCard(view.score, fieldSize);
  panel.append(makeBanner(bannerText(view), view.victory), placement);
  if (view.own != null) panel.appendChild(makeIdentity(view.own));
  panel.appendChild(card);
  // The two cut-able build blocks (amendment 28's open owner decision).
  if (view.own != null) {
    const boons = makeBoons(view.own);
    if (boons !== null) panel.appendChild(boons);
    const offer = makeOffer(view.own);
    if (offer !== null) panel.appendChild(offer);
  }
  if (view.rows !== null) panel.appendChild(makeTable(view.rows, view.ownId));
  panel.appendChild(makeActions(view, h));

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  mounted = { placement, card, fieldSize, signature: scoreSignature(view.score) };
}
