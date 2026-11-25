// Pre-join HOME chrome (Story 1.14) — replaces the prototype menu. Plain DOM
// over the live ambient CIC Pixi scene (render/ambient.ts), styled per DESIGN.md
// and the ratified mock (home-class-picker-1.html): wordmark, callsign, a
// slim current-class Class Chip that OPENS the class-select layer
// (ui/classSelect.ts), a MODE ROW carrying the dominant amber OUTLINE+GLOW SOLO
// button (DUO/TRIO join it in-line later) with the UNLIT phosphor SOLO VS AI
// door centered on the row below (Story 6.5 — the port's two doors; Eric ruling
// 2026-08-17 relabelled PLAY → SOLO and deleted both sub-lines), a How-to-Play
// link (REAL as of Story 7.3 — it used to paint a stub, and there is a page
// behind it now) + server status line, and the settings gear — which as of
// Story 2.3 opens the REAL settings overlay (ui/settings.ts), as does ESC with
// the class bay closed.
//
// THE FRAME IS ui/homeBars.ts (Eric ruling 2026-11-25, "A3 · Banded Bars"): a
// three-row grid — a top bar (server status · PLAYERS ONLINE / LIVE GAMES ·
// gear), the console row (`<main>`: wordmark, tagline, then one 540px column of
// callsign, chip and doors) and a bottom bar (© year + version · HOW TO PLAY ·
// PRIVACY · social icons). Nothing in it is absolutely positioned.
//
// STORY 6.6 gave the port its first knowledge of the world outside it: a
// PLAYERS ONLINE / LIVE GAMES register (top bar, center), fed by `setLiveness()` from
// net/liveness.ts and simply not rendered when that read is unavailable. The
// module also owns `hullcracker.mode` (`saveMode`/`loadSavedMode`), beside the
// callsign and class it already persisted.
//
// THE MODE BUTTONS CARRY NO SUB-LINE AT ALL (Eric ruling 2026-08-19, cycle 105).
// 6.6 had put two back — `N/20 QUEUED` on SOLO and the constant STARTS INSTANTLY
// on SOLO VS AI — and Eric struck both: *"Just get rid of that text entirely
// instead of fixing it, i changed my mind, it doesn't need to be there."* The
// buttons are the bare mono uppercase labels of epic-6 amendment 31 again, and
// the whole reserved-slot machinery that carried an asynchronously-arriving line
// (`SOLO_AI_SUBLINE`, `queueButtonSubline`, `makeModeSubline`,
// `paintModeSubline`, `sublineOf`) is DELETED rather than hidden — no dead knob
// survives a deletion ruling.
//
// THE DELETION IS ALSO THE BUGFIX, AND THIS IS THE PART A FUTURE AGENT MUST NOT
// UNDO. `paintModeSubline()` wrote `el.style.visibility = 'visible'` on those two
// spans. `visibility` is an INHERITED property, so a descendant that asserts
// `visible` OVERRIDES an ancestor's `hidden` — and the home yields to the
// settings overlay by setting `visibility:hidden` on its ROOT (`homeYieldStyle`,
// applied in `setYielded`), with home at z 1100 above settings at 1050. Those two
// spans were therefore the ONLY descendants of the home tree that survived the
// yield, and they floated on top of the open settings panel. With them gone the
// home subtree contains ZERO inline `visibility` writers, so the root's `hidden`
// governs every pixel of it. RESTORING A SUB-LINE HERE RE-OPENS THAT ESCAPE
// unless it is painted without ever writing `visibility` on a descendant; there
// is a structural pin in home.test.ts asserting exactly that.
//
// THE QUEUE'S OWN WAIT IS NOT HERE EITHER (Eric rulings 2026-08-18). It has
// its own surface — ui/queueModal.ts, opened and closed by `setCancel()` — and
// the status line beside HOW TO PLAY is the SERVER PROBE's alone again (*"Get
// rid of this information message that pops up next to 'HOW TO PLAY' and
// replaces the server status"*). The modal keeps its own `N/20 QUEUED` line
// (epic-6 amendment 42); that surface is untouched by the ruling above.
//
// THE COMMUNITY LINKS (Eric rulings 2026-08-28 and 2026-11-25) are icon-only
// anchors wearing each service's brand icon at the right of the bottom bar.
// Their URLs are BUILT, never literal: the templates live in
// ui/communityLinks.ts and the identity arrives as `VITE_DISCORD_INVITE` /
// `VITE_SUBREDDIT`, so an unset (or malformed) var simply renders no anchor at
// all — the GA4/AdSense absence gating, applied to navigation.
//
// The settings overlay is TRANSPARENT so the ambient scene breathes behind it;
// the ambient's scrim keeps this text legible.
//
// The Color Hoist is gone (Story 10.4, Eric's ruling R6). The home's OWN TINT —
// the chip's border/glow/name and the callsign field's border + focus ring —
// is the own relation color (ui/ownAccent.ts), painted at mount by
// `repaintAccent`. Amber stays the ACTION register (the SOLO primary only) and
// phosphor stays the system/status register.
//
// First-run (no stored class): the chip shows a SELECT CLASS prompt and either
// deploy button (or Enter) OPENS the layer instead of connecting — no default
// class is ever pushed. A returning player (stored class) deploys straight from
// the button they press. The callsign
// persists in localStorage; sanitizeName/load-save helpers are pure + tested.
// All colors/typography via CLIENT_CONFIG tokens (var(--hc-*) + registerCss;
// cssHex for the own accent, which has no --hc-* var).

import {
  DEFAULT_CLASS_ID,
  sanitizeClassId,
  sanitizeShiftId,
  type HornId,
  type ShiftId,
  type LivenessPayload,
  type QueueStatusMsg,
  type ShipClassId,
} from '@salvo/shared';
import {
  hideQueueModal,
  queueModalVisible,
  showQueueModal,
  updateQueueModal,
} from './queueModal.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  HOME_ID,
  ensureHomeStyle,
  makeConsoleColumn,
  makeConsoleRow,
  makeFooter,
  makeGear,
  makeHeader,
  makeLiveness,
  makeOverlay,
  makeStatusEl,
  type LivenessEls,
} from './homeBars.js';
import { textFieldElement } from '../input/keyboard.js';
import { cssRgba } from '../util/color.js';
import { registerCss } from './theme.js';
import { makePrivateRow, type PrivateRow } from './privateRow.js';
import { hullArtSvg, sharedFitPxPerU } from '../render/hullArt/svgArt.js';
import { pickTagline } from './taglines.js';
import { servedHome, type ServedHome } from './homeStatic.js';
import { OWN_ACCENT, type OwnAccent } from './ownAccent.js';
import {
  openClassSelect,
  CLASS_DISPLAY_NAMES,
  type ClassSelectHandle,
} from './classSelect.js';
// Entry cap = the shared display cap (Story 1.13). Re-exported so existing
// consumers/tests keep importing NAME_MAX from the home module.
import { NAME_MAX } from '../util/text.js';
import { loadHornPref, saveHornPref } from '../net/connection.js';

export { NAME_MAX };

const NAME_KEY = 'hullcracker.name';
const CLASS_KEY = 'hullcracker.class';
/** THE SHIFT PICK (Story 10.4 — it replaced the retired `hullcracker.gun`
 *  pick), stored beside the class. */
export const SHIFT_KEY = 'hullcracker.shift';
// (`hullcracker.kit` — the consumable kit — is never read since Story 10.5,
// 2026-11-05, epic-10 amendment 11: a saved value is simply ignored.)
const MODE_KEY = 'hullcracker.mode';

const NOTE_CONNECTING = 'CONNECTING…'; // re-asserted when PLAY is pressed mid-connect

// --- pure name / class persistence (tested) ----------------------------------

/**
 * Unicode category C — control / format (zero-width joiners, bidi overrides) /
 * surrogate / private-use / unassigned. Stripped so what you TYPE is what the
 * server keeps: the server's `sanitizeName` strips exactly this set, and a
 * client that let them through would show the player a callsign (blank, or
 * reversed by a bidi override) that no one else ever sees.
 */
const CONTROL_OR_FORMAT = /\p{C}/gu;

/** Strip control/format code points, then trim + cap a callsign to NAME_MAX
 *  CODE POINTS ('' = server assigns). Mirrors server roomOptions.sanitizeName. */
export function sanitizeName(raw: string): string {
  return [...raw.replace(CONTROL_OR_FORMAT, '').trim()].slice(0, NAME_MAX).join('');
}

export function loadSavedName(): string {
  try {
    return sanitizeName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage unavailable — the name just won't persist
  }
}

/**
 * The saved ship class, or NULL when nothing is stored (the first-run signal —
 * no default is ever pushed). A stored-but-legacy id ('cruiser') is a RETURNING
 * player and sanitizes to a real class, never null.
 */
export function loadSavedClassOrNull(): ShipClassId | null {
  try {
    const raw = localStorage.getItem(CLASS_KEY);
    return raw === null ? null : sanitizeClassId(raw);
  } catch {
    return null;
  }
}

/** Defaulting variant (DEFAULT_CLASS_ID — R7 — when unset) for in-game consumers. */
export function loadSavedClass(): ShipClassId {
  return loadSavedClassOrNull() ?? DEFAULT_CLASS_ID;
}

/** True when no class is stored yet (drives first-run PLAY→layer routing). */
export function isFirstRun(): boolean {
  return loadSavedClassOrNull() === null;
}

function saveClass(cls: ShipClassId): void {
  try {
    localStorage.setItem(CLASS_KEY, cls);
  } catch {
    // storage unavailable — the class just won't persist
  }
}

/**
 * The saved Shift pick (Story 10.4) — `DEFAULT_SHIFT` (R7: SPEED BOOST) when
 * nothing is stored, the value is unknown, or storage is unavailable
 * (`sanitizeShiftId` fails open). No first-run signal: it is simply preselected.
 */
export function loadSavedShift(): ShiftId {
  try {
    return sanitizeShiftId(localStorage.getItem(SHIFT_KEY));
  } catch {
    return sanitizeShiftId(undefined);
  }
}

export function saveShift(shift: ShiftId): void {
  try {
    localStorage.setItem(SHIFT_KEY, shift);
  } catch {
    // storage unavailable — the Shift just won't persist
  }
}

/**
 * The MODE a deploy goes out through. `standard` is the queue; `soloVsAi` is
 * the queue-free `create('arena', {solo:true})` door (Story 6.5). It is an
 * IDENTIFIER rather than a boolean so DUO/TRIO slot in beside it without
 * reshaping anything that holds one (Eric: the mode row is built for those).
 *
 * It lives HERE rather than in main.ts because `hullcracker.mode` is persisted
 * alongside `hullcracker.name`/`hullcracker.class`, and main.ts imports this
 * module (the reverse would be a cycle).
 */
export type DeployMode = 'standard' | 'soloVsAi';

/** A deploy door's callback: the callsign, the hull and the Shift pick (Story
 *  10.4 threads it through `startGame` → `connect` → `joinOptions`). */
export type DeployFn = (name: string, cls: ShipClassId, shift: ShiftId) => void;

/** The private-lobby doors (cycle 167): CREATE and JOIN. Not `DeployMode`s —
 *  neither is ever persisted as `hullcracker.mode`. */
export interface PrivateDoors {
  onCreate: DeployFn;
  onJoin: DeployFn;
}

const DEPLOY_MODES: readonly DeployMode[] = ['standard', 'soloVsAi'];

/**
 * The saved deploy mode, or NULL when nothing valid is stored (Story 6.6).
 * Mirrors `loadSavedClassOrNull` deliberately — per-file try/catch, fail-open,
 * no shared storage helper — and IGNORES anything outside the union, so a
 * stale/corrupt/hand-edited value can never route a deploy through a door that
 * does not exist.
 *
 * The only consumer is main.ts's auto-requeue fallback: the mode is SESSION
 * state during a page's life (`lastDeploy`), and this is what survives a
 * reload.
 */
export function loadSavedMode(): DeployMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return DEPLOY_MODES.find((m) => m === raw) ?? null;
  } catch {
    return null;
  }
}

export function saveMode(mode: DeployMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // storage unavailable — the mode just won't persist
  }
}

// --- pure copy + status reducers (tested) ------------------------------------

// THE MODE BUTTONS CARRY NO SUB-LINE (Eric rulings 2026-08-17 and 2026-08-19,
// epic-6 amendments 31 and 50). The history is worth keeping because it has been
// reversed once already and the reasons are not the same.
//
// Amendment 31 struck `deploySubline()` ("DEPLOY AS <CLASS> · SOLO") because it
// RESTATED the Class Chip sitting directly above it: *"I want the current 'PLAY'
// button to say 'SOLO' and nothing else."* Story 6.6 then put a DIFFERENT
// sub-line back — a live `N/20 QUEUED` count plus the constant STARTS INSTANTLY
// steer on SOLO VS AI — on the reasoning that a queue count is information
// available nowhere else on the page.
//
// That reasoning is now moot and the copy is RULED OUT (Eric 2026-08-19): the
// queue modal carries the count for anyone actually in the pool (amendment 42)
// and the liveness register carries the population (amendment 43), so the
// buttons are bare labels again — *"Just get rid of that text entirely instead of
// fixing it, i changed my mind, it doesn't need to be there."* `SOLO_AI_SUBLINE`
// and `queueButtonSubline()` are DELETED, not hidden, and their pins are RETIRED
// rather than bent onto new copy.
//
// A future agent restoring a sub-line here must read the module header first: the
// slot machinery those two lines needed is what let the home escape the settings
// yield (a descendant `visibility:visible` beats the root's `hidden`).

export type ProbeState = 'probing' | 'ready' | 'unreachable';
export type StatusTone = 'info' | 'denied' | 'tertiary';
export interface StatusLine {
  text: string;
  tone: StatusTone;
}

/** Server status line copy + tone from the probe outcome (Eric ruling — client
 *  probe, no server endpoint). READY/CHECKING are quiet; UNREACHABLE is denied. */
export function serverStatusLine(state: ProbeState): StatusLine {
  if (state === 'ready') return { text: 'SERVER: READY', tone: 'tertiary' };
  if (state === 'unreachable') return { text: 'SERVER: UNREACHABLE', tone: 'denied' };
  return { text: 'SERVER: CHECKING…', tone: 'tertiary' };
}

// RETIRED (Eric ruling 2026-08-18): `queueStatusLine()` and
// `requeueStatusLine()`. Both painted `h.statusEl` — the line beside HOW TO PLAY
// that the SERVER PROBE owns — and Eric struck the whole practice, not just the
// wording: *"anything that doesn't involve CHANGING THE TEXT ON THE PAGE THAT
// SERVES ANOTHER PURPOSE."* The queue's count and countdown moved to
// ui/queueModal.ts, which is a surface of its own; the collapse register
// (`LOBBY DISBANDED — SEARCHING FOR A NEW MATCH`) is DELETED with no replacement
// copy anywhere, because an auto-requeue now simply shows the same `N/20 QUEUED`
// as any other queue join. Nothing about the queue may write to `h.statusEl`
// again — it carries the probe, plus the connect flow's own CONNECTING… /
// failure register, and nothing else.
//
// `countdownMmSs` went with them: it lives in ui/queueModal.ts now, next to the
// only countdown left in the port.

/** The liveness register's two readouts (Story 6.6). */
export interface LivenessLines {
  players: string;
  games: string;
}

/**
 * The GLOBAL population register (Story 6.6 for the copy; Eric ruling
 * 2026-11-25 for the placement — one line, centered in the top bar).
 *
 * `null` in → `null` out: liveness is UNAVAILABLE (an outage, a timeout, a
 * malformed payload) and the block does not render at all. That is the only
 * absence — a genuine population of ZERO renders `0`, deliberately. Eric ruled
 * the honest zero IS the point: "nobody is here yet" is a fact a player at beta
 * population needs, and hiding it is what makes an empty server read as a
 * broken one. (EXPERIENCE.md:108's "absence, not placeholders" is scoped to
 * DECORATIVE empties; this is load-bearing.)
 */
export function livenessLines(p: LivenessPayload | null): LivenessLines | null {
  if (!p) return null;
  return { players: `PLAYERS ONLINE: ${p.playersOnline}`, games: `LIVE GAMES: ${p.liveGames}` };
}

function toneColor(tone: StatusTone): string {
  if (tone === 'info') return 'var(--hc-info)';
  if (tone === 'denied') return 'var(--hc-denied)';
  // Story 2.3 (amendment 17): the quiet tone is a SYSTEM line, not decoration —
  // it reads phosphor now, never the retired grey.
  return 'var(--hc-phosphor)';
}

// --- handle ------------------------------------------------------------------

export interface HomeHandle {
  /** Generic status-line setter (connect flow: CONNECTING / failure copy). */
  setStatus(text: string, tone?: StatusTone): void;
  /** Server-probe status line (probing → ready / unreachable). */
  setServerProbe(state: ProbeState): void;
  /** Disable/enable BOTH deploy doors (PLAY + SOLO VS AI) while a join is in flight. */
  setBusy(busy: boolean): void;
  /**
   * OPEN or CLOSE the queue modal (Story 6.1's canceller, Eric's 2026-08-18
   * modal). Passed a canceller while the player is POOLED in the queue, `null`
   * the moment that stops being meaningful.
   *
   * The plumbing is unchanged — `ConnectHooks.onQueued` still drives this, and
   * its `finally` fires on ALL THREE exits (the seat, an error, the player's
   * CANCEL) — so "the modal is up exactly while cancelling is meaningful" is
   * structural rather than something four call sites have to remember. The
   * canceller is still the only exit from a pooled wait that is not a page
   * reload, and a queue wait is legitimately minutes long.
   *
   * The retired underplay CANCEL span went with the move: it lived in the
   * HOW TO PLAY row, which the modal now covers, so it could never have been
   * seen or clicked while it was meaningful.
   */
  setCancel(onCancel: (() => void) | null): void;
  /**
   * Fold one live `MSG.queueStatus` push into the open queue modal. A no-op when
   * no modal is up.
   *
   * This is the AUTHORITATIVE queue read: once you are in the pool the room
   * pushes on every change, where `setLiveness` is a 10s poll for players still
   * standing in port (and main.ts stands it down at the deploy door). It writes
   * ONLY to the modal — never to the status line, which is the server probe's.
   */
  setQueue(status: QueueStatusMsg): void;
  /**
   * Publish the latest `/liveness` read (Story 6.6) — the top bar's global
   * register — and, since Eric's 2026-08-19 ruling deleted the mode-button
   * sub-lines, NOTHING ELSE. `null` means UNAVAILABLE (outage, timeout, bad
   * shape): the register disappears and the doors stay fully usable. Parallel to
   * `setCancel`: main.ts drives it, the home only paints.
   *
   * NO CLOCK AND NO COUNT RIDE ON THIS (Eric rulings 2026-08-18 / 08-19): neither
   * `queue.deadlineAt` nor `queue.pooled` is read here, and the home runs no
   * timer. The only queue readout in the port lives in the queue modal.
   */
  setLiveness(payload: LivenessPayload | null): void;
  /** YIELD the whole home surface while the settings overlay is open (see
   *  `homeYieldStyle`). Idempotent; restored with `false`. */
  setYielded(yielded: boolean): void;
  hide(): void;
}

/** The two style properties the home root takes to yield / come back. */
export interface YieldStyle {
  visibility: 'hidden' | 'visible';
  pointerEvents: 'none' | 'auto';
}

/**
 * Pure: how the HOME chrome must behave while the settings overlay is open.
 *
 * The z register is RATIFIED — settings sits at 1050, between the refit modal
 * (1000) and this home (1100) — so the overlay legitimately renders UNDER a
 * fullscreen home that hit-tests every pixel. Re-cutting the register to fix
 * that would break the ruled ordering; instead the home YIELDS: it stops
 * painting and stops hit-testing for as long as settings is up, and comes back
 * unchanged when it closes.
 *
 * Reverse stacking falls out of the same rule rather than needing its own
 * guard: a yielded home cannot be clicked, so PLAY and the class chip are both
 * unreachable while the overlay is open — which is exactly the "never stack, in
 * either direction" law the in-match surfaces obey.
 */
export function homeYieldStyle(settingsOpen: boolean): YieldStyle {
  return settingsOpen
    ? { visibility: 'hidden', pointerEvents: 'none' }
    : { visibility: 'visible', pointerEvents: 'auto' };
}

// --- DOM builders ------------------------------------------------------------

// AMENDMENT 47 (the container-fit law) now lives in the frame (ui/homeBars.ts):
// the console row is the grid's `minmax(0, 1fr)` middle and scrolls internally
// (safe-centered, ui/fit.ts) when a window is shorter than the console, while
// both bars hold their height.

/**
 * The wordmark block: the SERVED `<h1>` (with its `.IO` span; Story 13.1,
 * adopted by `ui/homeStatic.ts`) and the random tagline built here beneath it.
 * The version line moved to the bottom bar (Eric 2026-11-25). `margin:0`
 * cancels the h1's UA margin; the `text-indent` matches the letter-spacing so
 * the spaced line is optically centered. The mark scales with the window (both
 * axes) between 28 and 104px.
 */
function makeWordmark(served: ServedHome): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:var(--hc-home-brand-gap)';
  const mark = served.wordmark;
  mark.style.cssText =
    'font-family:var(--hc-font-display);font-weight:700;letter-spacing:0.14em;text-indent:0.14em;' +
    'color:var(--hc-text-primary);line-height:1;text-align:center;white-space:nowrap;margin:0';
  mark.style.fontSize = 'clamp(28px, min(6.6vw, var(--hc-home-mark-vh)), 104px)';
  const io = mark.firstElementChild;
  if (io instanceof HTMLElement) io.style.color = 'var(--hc-phosphor-bright)';
  const tagline = document.createElement('div');
  tagline.textContent = pickTagline();
  tagline.style.cssText =
    `${registerCss('label')};color:var(--hc-phosphor);letter-spacing:0.44em;text-indent:0.44em;white-space:nowrap`;
  wrap.append(mark, tagline);
  return wrap;
}

function makeNameField(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = NAME_MAX;
  input.placeholder = 'CALLSIGN';
  input.value = loadSavedName();
  input.autocomplete = 'off';
  input.spellcheck = false;
  // The border color is a PLACEHOLDER: `paintCallsign` overwrites it (and the
  // focus glow) with the own accent on mount.
  input.style.cssText =
    'flex:1;min-width:0;height:var(--hc-home-input);box-sizing:border-box;background-color:var(--hc-panel-deep);' +
    'border-width:1px;border-style:solid;border-color:var(--hc-hairline);border-radius:6px;padding:0 18px;color:var(--hc-text-primary);' +
    'font:500 20px var(--hc-font-mono);letter-spacing:0.12em;text-transform:uppercase;outline:none';
  return input;
}

function makeCallsignRow(input: HTMLInputElement): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:14px';
  const label = document.createElement('label');
  label.textContent = 'CALLSIGN';
  label.style.cssText = `${registerCss('label')};color:var(--hc-text-primary);letter-spacing:0.22em;flex:none`;
  row.append(label, input);
  return row;
}

interface ChipEls {
  root: HTMLElement;
  sil: HTMLElement;
  role: HTMLElement;
  name: HTMLElement;
}

/**
 * The Class Chip — SLIM (Eric ruling): silhouette, role tag, class name and the
 * CHANGE CLASS affordance, nothing else. The loadout sub-line is gone (it was
 * the widest thing in the chip and the class bay already sells the loadout), so
 * the box hugs what's left: tighter gaps/padding and a `max-width` + border-box
 * so it can never outgrow the 1366×768 floor viewport (amendment 47).
 */
function makeChip(onOpen: () => void): ChipEls {
  const root = document.createElement('div');
  root.style.cssText =
    'display:flex;align-items:center;gap:14px;background-color:var(--hc-panel-deep);' +
    'border-width:1px;border-style:solid;border-color:var(--hc-hairline);' +
    'border-radius:8px;padding:0 16px 0 12px;cursor:pointer;height:var(--hc-home-chip);' +
    'min-width:0;box-sizing:border-box';
  root.setAttribute('role', 'button');
  root.setAttribute('title', 'Open the class-select layer');
  root.tabIndex = 0;
  const sil = document.createElement('span');
  sil.style.cssText =
    `display:flex;align-items:center;justify-content:center;width:${CLIENT_CONFIG.home.chipArtW}px;min-height:44px`;
  const meta = document.createElement('span');
  meta.style.cssText = 'display:flex;flex-direction:column;min-width:0;flex:1';
  const role = document.createElement('span');
  role.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.24em`;
  const name = document.createElement('div');
  name.style.cssText =
    'font:700 24px var(--hc-font-display);letter-spacing:0.06em;white-space:nowrap;' +
    'overflow:hidden;text-overflow:ellipsis;min-width:0';
  meta.append(role, name);
  const change = document.createElement('span');
  change.innerHTML = '<b style="color:var(--hc-phosphor);font-weight:600">▸</b>&nbsp; CHANGE CLASS';
  change.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.18em;` +
    'border-left:1px solid var(--hc-hairline);padding-left:14px;white-space:nowrap;' +
    'overflow:hidden;text-overflow:ellipsis;min-width:0';
  root.append(sil, meta, change);
  root.addEventListener('click', onOpen);
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation(); // don't let the Enter reach the layer's window listener (insta-pick)
    onOpen();
  });
  return { root, sil, role, name };
}

/**
 * The button BOX both deploy doors share — the ratified Primary Button geometry
 * with the accent left to the caller: panel-deep bed, 1px outline (never a
 * filled slab), {rounded.md} 8px, one mono uppercase letter-spaced label.
 *
 * THE BOX HUGS ITS CONTENT (`min-height:64px` + symmetric padding), it does not
 * pin a height — but say plainly what that means TODAY, because a comment that
 * describes a rule which never fires is the same vacuity this file criticises
 * two blocks down. With the sub-line deleted (Eric ruling 2026-08-19) the content
 * is one 34px/800 label: roughly a 41px line box plus 16px padding, ~57px, UNDER
 * the 64px floor. So both buttons currently sit AT the floor and hugging is
 * dormant. It is kept rather than swapped for a fixed height because it is what
 * keeps the port column inside the 768px floor viewport (**epic-2** amendment 47,
 * the container-fit law — NOT epic-6's amendment 47, which is the departure
 * scuttle) if anything is ever added back to these boxes, and
 * `applySafeCenterScroll` still backstops anything shorter. The deletion moved
 * the column in the SAFE direction (~17px off each button), so nothing is
 * re-tuned.
 *
 * The outline is assigned as SEPARATE properties rather than inside the cssText
 * blob: a `border:1px solid var(--x)` shorthand is rejected by the test
 * environment's CSSOM parser, which silently voids the ENTIRE declaration list
 * (measured, not assumed — that is why the shipped PLAY button's own geometry
 * has never been assertable).
 *
 * THE BUTTON HOLDS EXACTLY ONE CHILD — its label. There is no sub-line slot any
 * more, and re-adding one is not a local decision: the reserved-slot machinery
 * that carried the 6.6 lines toggled `visibility` on a DESCENDANT, which is how
 * the home escaped the settings yield (see the module header). Any future
 * sub-line must reach the same "absent" state without ever writing `visibility`
 * below the root.
 */
function makeModeButton(label: string, accent: string, title: string): HTMLButtonElement {
  const root = document.createElement('button');
  root.type = 'button';
  root.setAttribute('title', title);
  root.style.cssText =
    'width:100%;min-width:0;min-height:var(--hc-home-door);padding:0;' +
    'box-sizing:border-box;background-color:var(--hc-panel-deep);' +
    'border-radius:8px;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;cursor:pointer';
  root.style.borderWidth = '1px';
  root.style.borderStyle = 'solid';
  root.style.borderColor = accent;
  const big = document.createElement('span');
  big.textContent = label;
  big.style.cssText =
    'font-family:var(--hc-font-mono);font-weight:800;font-size:var(--hc-home-door-font);line-height:1.2;' +
    `letter-spacing:0.34em;text-indent:0.34em;white-space:nowrap;color:${accent}`;
  root.append(big);
  return root;
}

/**
 * SOLO — the primary, and now a MODE label rather than the generic action
 * (Eric ruling 2026-08-17: *"I want the current 'PLAY' button to say 'SOLO' and
 * nothing else"*). It keeps the ratified Primary Button register: amber outline
 * + glow, never a filled slab ({components.button-primary}, DESIGN.md:244).
 *
 * It lives in the MODE ROW, which is built to hold DUO and TRIO beside it later
 * — Eric: *"The current PLAY button will be in-line with DUO and TRIO modes,
 * once those are out."*
 */
function makePlayButton(onPlay: () => void): HTMLButtonElement {
  const root = makeModeButton('SOLO', 'var(--hc-amber)', 'Deploy alone against other captains');
  root.style.boxShadow = `0 0 44px ${cssRgba(CLIENT_CONFIG.colors.amber, 0.28)}`;
  root.addEventListener('click', onPlay);
  return root;
}

/**
 * SOLO VS AI (Story 6.5) — the port's SECOND action.
 *
 * DESIGN.md defines exactly ONE button ({components.button-primary}, :244:
 * amber outline + glow, *never a filled slab*, mono uppercase letter-spaced
 * label, sub-line for context) and has NO secondary-button spec, no button-pair
 * spacing and no dominance rule for two home actions. So this obeys every rule
 * that IS written — same 8px {rounded.md} control radius, same mono uppercase
 * letter-spaced label at the same size, same panel-deep bed with a 1px outline
 * (never a filled slab) — and takes its NON-DOMINANCE from the only two-action
 * precedent in the repo, the results modal (`ui/results.ts` makeAction): *"the
 * secondary (SPECTATE) is the same shape UNLIT, which is what keeps it the
 * non-dominant action"* — `--hc-phosphor` outline, no glow, against the
 * primary's amber + bloom.
 *
 * That keeps the two registers honest: amber is the ACTION register and DESIGN.md
 * forbids it as a combatant hue and as decoration, so a second amber button would
 * either split the action register or make neither read as the dominant one;
 * phosphor is the system register the whole port already speaks in. It stays the
 * unlit one even now that SOLO reads as a mode rather than as "the action":
 * SOLO is the default door, and the mode row is where the modes live.
 *
 * NO `⏎` CHIP, deliberately: Enter is bound to the callsign field and runs SOLO
 * only (EXPERIENCE.md:124), and `results.ts` makes the chip a TRUTHFULNESS rule —
 * it may appear only where Enter really does that thing. This is a plain
 * <button>, so Tab reaches it and Enter/Space activate it natively once focused;
 * it is inserted AFTER the mode row so tab order matches reading order.
 *
 * THE STYLING OF THIS BUTTON IS A PROPOSAL, NOT A RATIFIED DECISION.
 */
function makeSoloButton(onSolo: () => void): HTMLButtonElement {
  const root = makeModeButton(
    'SOLO VS AI',
    'var(--hc-phosphor)',
    'Deploy alone against a field of AI captains',
  );
  root.addEventListener('click', onSolo);
  return root;
}

/**
 * ROW 1 — the MODE ROW (Eric ruling 2026-08-17): *"The current PLAY button will
 * be in-line with DUO and TRIO modes, once those are out. All three are above
 * SOLO VS AI."*
 *
 * It is a real row TODAY, holding one button, so DUO/TRIO drop in as extra
 * children with no rewrite. It WRAPS rather than overflowing: three 480px
 * buttons cannot sit side by side on the 1366px floor viewport, so when the
 * siblings arrive they will either be narrowed here or fall onto a second line
 * — never past the container edge (amendment 47, the container-fit law).
 */
function makeModeRow(...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:center;' +
    'gap:var(--hc-home-door-gap);width:100%';
  row.append(...buttons);
  return row;
}

/**
 * The deploy console: ROW 1 (the mode row) over ROW 2 (SOLO VS AI, centered),
 * as one stack — amendment 47, the container-fit law.
 *
 * Every row fills the console's one 540px column edge (Eric 2026-11-25, A3):
 * SOLO and SOLO VS AI full width, CREATE / JOIN splitting it. The sizes are
 * the frame's custom properties (ui/homeBars.ts), so a short window tightens
 * the doors with the rest of the console, and the console row's safe-center
 * scroll (ui/fit.ts) backstops anything shorter still.
 */
function makeDeployStack(modeRow: HTMLElement, soloBtn: HTMLElement, privateRow: HTMLElement): HTMLElement {
  const stack = document.createElement('div');
  stack.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:var(--hc-home-door-gap);' +
    'margin-top:var(--hc-home-doors-mt);width:100%';
  // ROW 3 (cycle 167, Eric ruling 7): CREATE / JOIN — ui/privateRow.ts.
  stack.append(modeRow, soloBtn, privateRow);
  return stack;
}

// --- home controller ---------------------------------------------------------

interface Home {
  overlay: HTMLElement;
  input: HTMLInputElement;
  /** The own accent the port chrome is tinted with (ui/ownAccent.ts). */
  accent: OwnAccent;
  statusEl: HTMLElement;
  /** Leave the queue, set by setCancel() while the player is pooled. The
   *  AFFORDANCE lives in ui/queueModal.ts now; this is retained as the home's
   *  record of whether a wait is cancellable at all. */
  cancel: (() => void) | null;
  chip: ChipEls;
  /** SOLO — the mode row's primary (no sub-line: Eric ruling 2026-08-17). */
  playBtn: HTMLButtonElement;
  /** SOLO VS AI (Story 6.5) — the port's second door, one row below. */
  soloBtn: HTMLButtonElement;
  /** CREATE / JOIN (cycle 167) — the third line, built by ui/privateRow.ts. */
  privateRow: PrivateRow;
  /** The private doors — same (name, cls, shift) contract, never a saved mode. */
  privateDoors: PrivateDoors;
  /** The top bar's PLAYERS ONLINE / LIVE GAMES register (Story 6.6). */
  livenessEls: LivenessEls;
  /** The last `/liveness` read, or null while UNAVAILABLE (nothing renders). */
  liveness: LivenessPayload | null;
  onDeploy: DeployFn;
  /** Deploy into a solo-vs-AI match. Same (name, cls, shift) contract as
   *  onDeploy — the mode is the DOOR, not a field on the identity. */
  onSolo: DeployFn;
  /** Open/toggle the settings overlay (gear + home ESC — Story 2.3). */
  onSettings: () => void;
  currentClass: ShipClassId | null;
  /** The captain's Shift pick (Story 10.4) — never null, DEFAULT_SHIFT by default. */
  currentShift: ShiftId;
  /** The captain's horn (Story 10.13) — the stored pick, saved on every chip click. */
  currentHorn: HornId;
  /** Play a horn once as the bay's preview (the shell's audio; a user gesture). */
  onHornPreview: (id: HornId) => void;
  layerOpen: boolean;
  busy: boolean;
  /** Drives the callsign field's personal-color focus ring (see paintCallsign). */
  inputFocused: boolean;
  /** The live class-select layer, if open — so hide() can tear it down instead of
   *  orphaning its window listener (which could write hullcracker.class in-game). */
  layer: ClassSelectHandle | null;
  /** True once the connect flow has written the status line (CONNECTING / error):
   *  a late server-probe resolution must NOT overwrite it (status state machine). */
  statusLocked: boolean;
  /** The line currently painted — what a mid-flight PLAY press re-asserts. */
  lastStatus: StatusLine | null;
  /** Teardown for subscriptions/listeners created at mount (run by hide()). */
  disposers: Array<() => void>;
}

/**
 * Repaint the one surface liveness still owns: the top bar's PLAYERS ONLINE /
 * LIVE GAMES register. It comes from `h.liveness` alone, so an unavailable read
 * (null) hides it outright rather than leaving a stale population painted.
 *
 * THE MODE BUTTONS ARE NOT TOUCHED HERE ANY MORE (Eric ruling 2026-08-19). The
 * SOLO door's `N/20 QUEUED` sub-line is deleted with its whole slot, so nothing
 * on the deploy stack is data-driven and `LivenessPayload.queue` has no client
 * reader left at all. The register keeps its honest zero (amendment 39).
 *
 * THE HOME RUNS NO TIMER (Eric ruling 2026-08-18). `retickLiveness` and the 1 Hz
 * `livenessTick` it drove are DELETED with the countdown they existed for, which
 * retired a whole class of leak — the tick closed over `h` and had to be cleared
 * by `hide()`, by `setLiveness(null)`, and on every path in between.
 */
function paintLiveness(h: Home): void {
  const lines = livenessLines(h.liveness);
  h.livenessEls.root.style.display = lines ? 'flex' : 'none';
  if (lines) {
    h.livenessEls.players.textContent = lines.players;
    h.livenessEls.games.textContent = lines.games;
  }
}

function paintStatus(h: Home, text: string, tone: StatusTone): void {
  h.lastStatus = { text, tone };
  h.statusEl.textContent = text;
  h.statusEl.style.color = toneColor(tone);
}

/**
 * The chip's ship (Story 10.4 wave 2c): the hull's battleship art
 * (render/hullArt/svgArt — the canvas art's own shapes), bow right, own
 * relation linework, fitted to the chip's art box (`home.chipArtW` × `chipArtH`)
 * at a lighter hull line than the cards' (the art is a third of their size).
 */
function chipArt(cls: ShipClassId): string {
  const H = CLIENT_CONFIG.home;
  const pxPerU = sharedFitPxPerU([cls], H.chipArtW, H.chipArtH);
  return hullArtSvg(cls, 'own', { pxPerU, hullPx: H.chipArtHullPx });
}

/**
 * Rebuild the chip contents for the current class + own accent. The border
 * and silhouette take the RAW accent (graphic marks); the class name is TEXT, so it
 * takes the WCAG-lifted `accentText` (textSafe) instead. No loadout sub-line —
 * the chip is slim now (the class bay carries the loadout).
 */
function repaintChip(h: Home): void {
  const accent = h.accent.accent;
  h.chip.root.style.borderColor = accent;
  h.chip.root.style.boxShadow = `0 0 22px ${cssRgba(h.accent.accentValue, 0.16)}`;
  h.chip.name.style.color = h.accent.accentText;
  if (h.currentClass === null) {
    h.chip.sil.innerHTML = '';
    h.chip.role.textContent = 'SELECT CLASS';
    h.chip.name.textContent = 'CHOOSE A HULL';
    return;
  }
  h.chip.sil.innerHTML = chipArt(h.currentClass);
  h.chip.role.textContent = 'YOUR SHIP';
  h.chip.name.textContent = CLASS_DISPLAY_NAMES[h.currentClass];
}

/** The callsign field's own-accent chrome: an accent border always, plus a ring
 *  + glow in the same color while it holds focus (it replaces the native outline,
 *  which is suppressed). Text stays --hc-text-primary; only the chrome tints. */
function paintCallsign(h: Home): void {
  const accent = h.accent.accent;
  h.input.style.borderColor = accent;
  h.input.style.boxShadow = h.inputFocused
    ? `0 0 0 1px ${accent}, 0 0 18px ${cssRgba(h.accent.accentValue, 0.28)}`
    : 'none';
}

/** Repaint everything the own accent owns (chip + callsign chrome). Runs at
 *  mount. */
function repaintAccent(h: Home): void {
  repaintChip(h);
  paintCallsign(h);
}

/** A class pick repaints the CHIP and nothing else — the deploy buttons carry
 *  bare mode labels now, so there is no second place for the hull to be named
 *  (and no second place for it to go stale). */
function setClass(h: Home, cls: ShipClassId): void {
  h.currentClass = cls;
  saveClass(cls);
  repaintChip(h);
}

/** Commit the typed callsign and hand it to ONE deploy door (`go`). Both home
 *  actions share this body — the class, the callsign and the never-silence rule
 *  are identical; only the door differs. */
function deploy(h: Home, go: DeployFn): void {
  // Never-silence: a press mid-connect re-asserts the LIVE status line rather
  // than dying. It re-asserts what is ALREADY painted (not a fixed CONNECTING…)
  // because Story 6.1's queue readout only refreshes when the server pushes —
  // stamping CONNECTING… over it would blank the countdown until the next push.
  if (h.busy) return paintStatus(h, ...statusTuple(h.lastStatus ?? { text: NOTE_CONNECTING, tone: 'info' }));
  if (h.currentClass === null) return;
  const name = sanitizeName(h.input.value);
  saveName(name);
  go(name, h.currentClass, h.currentShift);
}

function onPlay(h: Home): void {
  if (h.currentClass === null) return openLayer(h);
  deploy(h, h.onDeploy);
}

/** SOLO VS AI takes the SAME first-run routing as PLAY: with no class stored
 *  there is nothing to deploy, so the press opens the class bay rather than
 *  pushing a default hull the player never chose. */
function onSolo(h: Home): void {
  if (h.currentClass === null) return openLayer(h);
  deploy(h, h.onSolo);
}

/** CREATE / JOIN take SOLO VS AI's first-run routing and busy rule verbatim. */
function onPrivate(h: Home, go: DeployFn): void {
  if (h.currentClass === null) return openLayer(h);
  deploy(h, go);
}

/** Refocus the callsign field after any layer exit, so Enter=PLAY lives again —
 *  but only while the home is still on screen. */
function refocusInput(h: Home): void {
  if (document.body.contains(h.overlay)) h.input.focus();
}

/** Open the class bay. Card clicks only highlight inside the layer now — the
 *  layer stays open until CONFIRM SELECTION/Enter (persists) or ESC/backdrop
 *  (discards); only those two paths reach the callbacks below. */
function openLayer(h: Home): void {
  if (h.busy || h.layerOpen) return;
  h.layerOpen = true;
  h.layer = openClassSelect({
    initial: h.currentClass ?? DEFAULT_CLASS_ID,
    initialShift: h.currentShift,
    initialHorn: h.currentHorn,
    // Story 10.13: a HORN chip saves at once (it is the captain's, not part of
    // the CONFIRM pick) and plays the horn once as its preview.
    onHorn: (id) => {
      h.currentHorn = id;
      saveHornPref(id);
      h.onHornPreview(id);
    },
    blurTarget: h.overlay,
    // CONFIRM SELECTION (and Enter) saves the class and comes back to port —
    // deliberately NO deploy(h) here: PLAY is the only path to onDeploy.
    onConfirm: (cls, shift) => {
      h.layerOpen = false;
      h.layer = null;
      // The Shift is saved beside the class (Story 10.4). The home chip stays
      // slim — no `class · Shift` sub-line.
      h.currentShift = shift;
      saveShift(shift);
      setClass(h, cls);
      refocusInput(h);
    },
    onClose: () => {
      h.layerOpen = false;
      h.layer = null;
      refocusInput(h);
    },
  });
}

/** Assemble the overlay children, wire events + initial paint; returns the ESC
 *  handler (so `hide()` can detach it). Split out to keep showHome lean. */
function mountHome(
  h: Home,
  playBtn: HTMLButtonElement,
  soloBtn: HTMLButtonElement,
  served: ServedHome,
): (e: KeyboardEvent) => void {
  // The frame (Eric ruling 2026-11-25, ui/homeBars.ts): top bar, the console
  // row (the page's `<main>`, Story 13.1 AC 8), bottom bar — in that order.
  const column = makeConsoleColumn(
    makeCallsignRow(h.input),
    h.chip.root,
    // ROW 1 (the mode row: SOLO today, DUO/TRIO beside it later) over ROW 2
    // (SOLO VS AI) — Eric ruling 2026-08-17.
    makeDeployStack(makeModeRow(playBtn), soloBtn, h.privateRow.root),
  );
  h.overlay.append(
    makeHeader(h.statusEl, h.livenessEls.root, makeGear(() => h.onSettings())),
    makeConsoleRow(makeWordmark(served), column),
    makeFooter(served),
  );
  h.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // Stop the SAME keystroke from bubbling to the layer's window listener (which
    // the click may attach mid-dispatch → insta-pick). Never deploy behind an open layer.
    e.stopPropagation();
    if (h.layerOpen) return;
    onPlay(h);
  });
  h.input.addEventListener('focus', () => {
    h.inputFocused = true;
    paintCallsign(h);
  });
  h.input.addEventListener('blur', () => {
    h.inputFocused = false;
    paintCallsign(h);
  });
  repaintAccent(h);
  paintStatus(h, ...statusTuple(serverStatusLine('probing')));
  return bindHomeKeys(h);
}

/**
 * Home ESC (with the class bay closed) TOGGLES the settings overlay, mirroring
 * the gear and the in-match ESC (Story 2.3 — the inert "settings arrive in a
 * later refit" note is gone). The callsign field keeps ESC to itself so a player
 * mid-edit isn't yanked into a modal. Toggling means a second ESC closes the
 * overlay, exactly as it does in a match.
 *
 * WHILE THE QUEUE MODAL IS OPEN, ESC CANCELS THE QUEUE (Eric ruling 2026-08-18:
 * *"ESC could/should cancel the queue and close the modal. I'm cool with that."*).
 * It does NOT also toggle settings: settings sits at z 1050, UNDER the modal at
 * 1150, and the modal is not part of the home overlay so `setYielded` cannot
 * hide it — an ESC that opened settings here would raise a panel the player
 * could neither see nor click. So the modal takes precedence while it is up, and
 * settings behaves normally the moment it is gone.
 *
 * This IS destructive — it discards a wait that is legitimately minutes long —
 * which is why it was shipped inert first and is only enabled now that its owner
 * has asked for it. It routes through `h.cancel`, the SAME canceller the CANCEL
 * button uses, so there is one exit from a pooled wait rather than two that can
 * drift; the modal's teardown (and its tick) is that path's business, not this
 * handler's.
 */
function bindHomeKeys(h: Home): (e: KeyboardEvent) => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || h.layerOpen) return;
    // The callsign field keeps ESC to itself — but a focused VOLUME SLIDER
    // inside the overlay must NOT (textFieldElement excludes ranges), or ESC
    // dies the moment the player touches a volume from the home gear.
    if (textFieldElement(document.activeElement)) return;
    if (queueModalVisible()) {
      h.cancel?.();
      return;
    }
    h.onSettings();
  };
  window.addEventListener('keydown', handler);
  return handler;
}

/**
 * Show the pre-join home. `onDeploy(name, cls, shift)` fires ONLY from PLAY with a
 * chosen class — the class bay never deploys (CONFIRM SELECTION saves and comes
 * back to port). First-run SOLO opens the layer instead of connecting.
 * `onSettings()` is the gear + home-ESC settings toggle (Story 2.3).
 * `onSoloDeploy(name, cls, shift)` is Story 6.5's SOLO VS AI door — same contract,
 * different route (no queue). It defaults to the standard deploy so a caller
 * that predates the second button still behaves.
 * Returns the handle main.ts drives for status/busy/hide.
 */
export function showHome(
  version: string,
  onDeploy: DeployFn,
  onSettings: () => void = () => undefined,
  onSoloDeploy: DeployFn = onDeploy,
  privateDoors: PrivateDoors = { onCreate: () => undefined, onJoin: () => undefined },
  onHornPreview: (id: HornId) => void = () => undefined,
): HomeHandle {
  document.getElementById(HOME_ID)?.remove();
  ensureHomeStyle();
  const overlay = makeOverlay();

  const input = makeNameField();
  const statusEl = makeStatusEl();
  const play = makePlayButton(() => onPlay(h));
  const solo = makeSoloButton(() => onSolo(h));
  const chip = makeChip(() => openLayer(h));

  const h: Home = {
    overlay,
    input,
    accent: OWN_ACCENT,
    statusEl,
    cancel: null,
    chip,
    playBtn: play,
    soloBtn: solo,
    privateRow: makePrivateRow(() => onPrivate(h, h.privateDoors.onCreate), () => onPrivate(h, h.privateDoors.onJoin)),
    privateDoors,
    livenessEls: makeLiveness(),
    liveness: null,
    onDeploy,
    onSolo: onSoloDeploy,
    onSettings,
    currentClass: loadSavedClassOrNull(),
    currentShift: loadSavedShift(),
    currentHorn: loadHornPref(), onHornPreview, // Story 10.13: the bay's HORN row
    layerOpen: false,
    busy: false,
    inputFocused: false,
    layer: null,
    statusLocked: false,
    lastStatus: null,
    disposers: [],
  };

  const keyHandler = mountHome(h, play, solo, servedHome(version));
  document.body.appendChild(overlay);
  input.focus();
  return makeHandle(h, keyHandler);
}

/** Build the HomeHandle main.ts drives — status state machine, busy dimming, and
 *  a hide() that tears down the layer + all mount-time subscriptions. */
function makeHandle(h: Home, keyHandler: (e: KeyboardEvent) => void): HomeHandle {
  return {
    setStatus: (text, tone = 'tertiary') => {
      h.statusLocked = true; // the connect flow owns the line now; late probes yield
      paintStatus(h, text, tone);
    },
    setServerProbe: (state) => {
      if (h.statusLocked) return; // a connect attempt already claimed the line
      paintStatus(h, ...statusTuple(serverStatusLine(state)));
    },
    setBusy: (busy) => {
      h.busy = busy;
      // BOTH doors dim: a join in flight blocks either deploy (see `deploy`), so
      // leaving SOLO VS AI lit would promise an action the home will refuse.
      for (const btn of [h.playBtn, h.soloBtn]) {
        btn.style.opacity = busy ? '0.4' : '1';
        btn.style.cursor = busy ? 'default' : 'pointer';
      }
      h.privateRow.setBusy(busy);
    },
    // The queue modal's whole lifecycle hangs off this ONE call, which is what
    // makes "the modal is up exactly while cancelling is meaningful" structural:
    // `ConnectHooks.onQueued` fires it with a canceller at the join and with
    // `null` in a `finally` that covers the seat, an error and the player's own
    // CANCEL alike. There is no second place a modal can be opened or leaked.
    setCancel: (onCancel) => {
      h.cancel = onCancel;
      if (onCancel) showQueueModal(onCancel);
      else hideQueueModal();
    },
    setQueue: (status) => updateQueueModal(status),
    setLiveness: (payload) => {
      h.liveness = payload;
      paintLiveness(h);
    },
    setYielded: (yielded) => {
      const style = homeYieldStyle(yielded);
      h.overlay.style.visibility = style.visibility;
      h.overlay.style.pointerEvents = style.pointerEvents;
    },
    hide: () => {
      h.layer?.close(); // never orphan a live layer's window listener into the game
      h.layer = null;
      // The queue modal is a SIBLING of this overlay (its own top-level node), so
      // removing the home would leave it — and its 1 Hz tick — on screen forever.
      // Idempotent, so the normal path (setCancel(null) got there first) is free.
      hideQueueModal();
      h.cancel = null;
      for (const off of h.disposers.splice(0)) off();
      window.removeEventListener('keydown', keyHandler);
      h.overlay.remove();
    },
  };
}

/** Spread a StatusLine into paintStatus's (text, tone) args. */
function statusTuple(s: StatusLine): [string, StatusTone] {
  return [s.text, s.tone];
}
