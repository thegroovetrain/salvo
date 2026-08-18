// Pre-join HOME chrome (Story 1.14) — replaces the prototype menu. Plain DOM
// over the live ambient CIC Pixi scene (render/ambient.ts), styled per DESIGN.md
// and the ratified mock (home-class-picker-1.html): wordmark, callsign, a
// slim current-class Class Chip that OPENS the class-select layer
// (ui/classSelect.ts), a MODE ROW carrying the dominant amber OUTLINE+GLOW SOLO
// button (DUO/TRIO join it in-line later) with the UNLIT phosphor SOLO VS AI
// door centered on the row below (Story 6.5 — the port's two doors; Eric ruling
// 2026-08-17 relabelled PLAY → SOLO and deleted both sub-lines), an inert
// How-to-Play link + server status line, and the settings gear — which as of
// Story 2.3 opens the REAL settings overlay (ui/settings.ts), as does ESC with
// the class bay closed.
//
// STORY 6.6 gave the port its first knowledge of the world outside it: a
// top-left PLAYERS ONLINE / LIVE GAMES register (the gear's mirror) and live
// sub-lines back on the mode buttons — the Standard queue's count + countdown
// on SOLO, and the constant STARTS INSTANTLY on SOLO VS AI, which is the
// dead-queue steer. All of it is fed by `setLiveness()` from net/liveness.ts
// and ALL of it simply does not render when that read is unavailable. The
// module also owns `hullcracker.mode` (`saveMode`/`loadSavedMode`), beside the
// callsign and class it already persisted.
//
// The settings overlay is TRANSPARENT so the ambient scene breathes behind it;
// the ambient's scrim keeps this text legible.
//
// The color picker lives ONLY in the class bay's footer now (Eric ruling — the
// duplicate home hoist is retired). The shared ColorHoist still lives here, as
// the state the home's PERSONAL TINT follows: the chip's border/glow/name and
// the callsign field's border + focus ring all take the player's Regatta hue
// (via `repaintAccent`, subscribed ONCE at mount to the hoist's onChange — not
// resubscribed per pick — so a hue chosen in the bay repaints the port behind
// it; the subscription is released by hide()'s disposers). Amber stays the
// ACTION register (the SOLO primary only) and phosphor stays the system/status
// register — neither is ever personalized.
//
// First-run (no stored class): the chip shows a SELECT CLASS prompt and either
// deploy button (or Enter) OPENS the layer instead of connecting — no default
// class is ever pushed. A returning player (stored class) deploys straight from
// the button they press. The callsign
// persists in localStorage; sanitizeName/load-save helpers are pure + tested.
// All colors/typography via CLIENT_CONFIG tokens (var(--hc-*) + registerCss;
// cssHex for the personal hues, which have no --hc-* var).

import {
  sanitizeClassId,
  type LivenessPayload,
  type QueueStatusMsg,
  type ShipClassId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { applySafeCenterScroll } from './fit.js';
import { textFieldElement } from '../input/keyboard.js';
import { cssRgba } from '../util/color.js';
import { registerCss } from './theme.js';
import { silhouetteSvg } from '../util/silhouetteSvg.js';
import { pickTagline } from './taglines.js';
import {
  ColorHoist,
  openClassSelect,
  CLASS_DISPLAY_NAMES,
  type ClassSelectHandle,
} from './classSelect.js';
// Entry cap = the shared display cap (Story 1.13). Re-exported so existing
// consumers/tests keep importing NAME_MAX from the home module.
import { NAME_MAX } from '../util/text.js';

export { NAME_MAX };

const HOME_ID = 'main-menu'; // kept id so index.html / any external hook is stable
const NAME_KEY = 'hullcracker.name';
const CLASS_KEY = 'hullcracker.class';
const MODE_KEY = 'hullcracker.mode';

const NOTE_HOWTO = 'FIELD MANUAL ARRIVES IN A LATER REFIT';
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

/** Defaulting variant (torpedoBoat when unset/garbage) for in-game consumers. */
export function loadSavedClass(): ShipClassId {
  return loadSavedClassOrNull() ?? 'torpedoBoat';
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

// THE DEPLOY BUTTONS CARRY NO *RESTATING* SUB-LINE (Eric ruling 2026-08-17,
// Story 6.5 / epic-6 amendment 31). `deploySubline()` ("DEPLOY AS <CLASS> ·
// SOLO") is DELETED, not reworded: *"I want the current 'PLAY' button to say
// 'SOLO' and nothing else. It doesn't need to say 'Deploy as [ship class]'."*
// The Class Chip sits directly above and already answers which hull you sail,
// so that sub-line was restating its neighbour.
//
// STORY 6.6 REVERSES THE SHAPE WHILE HONOURING THE REASON. Eric has ruled that
// the queue's live counts go ON the mode buttons, so the buttons carry a
// sub-line again — but a DIFFERENT one. `queueButtonSubline()` is a live count
// and a live countdown: information that exists nowhere else on the page and
// cannot be read off the chip, the label, or anything else the player can
// already see. Amendment 31 struck a sub-line that repeated its neighbour; it
// did not strike sub-lines. A future agent must not "restore" the bare buttons
// by citing it.

/** The queue minimum assumed when the payload cannot name one (no queue room
 *  at all). It is 2 today, which is why the unarmed copy can say `NEEDS 2`;
 *  `queue.min` overrides it whenever the server actually reports a pool. */
const DEFAULT_QUEUE_MIN = 2;

/** SOLO VS AI's sub-line is CONSTANT, not data-driven: the door creates its own
 *  room, so there is no pool to count and no deadline to tick. It is the
 *  dead-queue steer — the answer to "nobody is queued, now what?". */
const SOLO_AI_SUBLINE = 'STARTS INSTANTLY';

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

/** m:ss with the seconds CEILED — the chrome bar's countdown grammar (Story 3.3).
 *  A countdown reads the time REMAINING, so it must not show 0:00 while there is
 *  still a fraction of a second of it left. */
function countdownMmSs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Queue liveness copy (Story 6.1) — the ONLY queue surface the home carries.
 *
 * An unarmed pool (below `min`) has NO deadline: `startsInMs` is null and the
 * wait is genuinely open-ended, so the line says so plainly rather than render a
 * countdown that cannot fire. The armed line is the hard deadline the queue set
 * once at arm time and never extends. `min` is 2 today, which is why the unarmed
 * copy can name the second captain concretely.
 *
 * A non-conforming server that omits `startsInMs` entirely resolves to the
 * unarmed line rather than counting down from NaN — fail-safe, never fail-open,
 * the same posture radarModes() takes on the welcome.
 *
 * The mode selector and the richer liveness register are Story 6.6's, not this.
 */
export function queueStatusLine(q: QueueStatusMsg): StatusLine {
  if (typeof q.startsInMs !== 'number') {
    return { text: `QUEUED ${q.n}/${q.min} · AWAITING A SECOND CAPTAIN`, tone: 'info' };
  }
  return { text: `QUEUED ${q.n} CAPTAINS · DEPLOY IN ${countdownMmSs(q.startsInMs)}`, tone: 'info' };
}

/** The top-left liveness register's two lines (Story 6.6). */
export interface LivenessLines {
  players: string;
  games: string;
}

/**
 * The GLOBAL population register, top-left (Story 6.6, Eric ruling: this copy,
 * this placement — the mirror of the settings gear).
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

/**
 * The SOLO button's live sub-line (Story 6.6) — the per-door detail the global
 * register above deliberately does not carry.
 *
 * `queue === null` means the queue room does not exist, which is the NORMAL
 * empty state rather than an error (it `autoDispose`s when the last captain
 * leaves) — so it reads identically to an empty pool: `0 QUEUED`.
 *
 * UNARMED (`deadlineAt === null`) says what is missing instead of counting down
 * a deadline that cannot fire — the same rule `queueStatusLine` obeys, and the
 * threshold is read from `queue.min` rather than hardcoded so a server-side
 * retune cannot make this line lie.
 *
 * ARMED counts down the ABSOLUTE deadline against the caller's clock, so it
 * ticks smoothly between 10s polls. `nowMs` must already be in the CLIENT's
 * epoch — net/liveness.ts's `localizeDeadline()` folds the server-clock skew
 * out at the boundary, which is why this reducer never sees a `serverNow`.
 * `countdownMmSs` clamps at 0:00, so an overshot deadline never goes negative.
 */
export function queueButtonSubline(queue: LivenessPayload['queue'], nowMs: number): string {
  const pooled = queue?.pooled ?? 0;
  const min = queue?.min ?? DEFAULT_QUEUE_MIN;
  const deadlineAt = queue?.deadlineAt ?? null;
  if (deadlineAt === null) return `${pooled} QUEUED · NEEDS ${min} TO START`;
  return `${pooled} QUEUED · STARTS ${countdownMmSs(deadlineAt - nowMs)}`;
}

/**
 * Why the player is suddenly back in port with a queue join already running
 * (Story 6.3, epic-6 amendment 18): the cohort they were about to sail with
 * fell below the minimum during the countdown, and a queue-formed lobby is
 * sealed, so it cannot refill.
 *
 * It reads as the queue's own sibling — same register grammar, same `info`
 * tone, one line — because that is what it is: the reason attached to a wait
 * that has already begun. It states the LOBBY's fate and the client's response
 * and stops there. It does not name the captain who left, does not call it an
 * error, and does not apologise: nobody did anything wrong, and the honest
 * `QUEUED n/2` liveness takes this line over a beat later anyway.
 */
export function requeueStatusLine(): StatusLine {
  return { text: 'LOBBY DISBANDED — SEARCHING FOR A NEW MATCH', tone: 'info' };
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
   * Show/hide the CANCEL affordance (Story 6.1). Passed a canceller while the
   * player is POOLED in the queue, `null` the moment that stops being meaningful.
   * Without it the only exit from a connected state is a page reload, and a
   * queue wait is legitimately minutes long.
   */
  setCancel(onCancel: (() => void) | null): void;
  /**
   * Publish the latest `/liveness` read (Story 6.6) — the top-left global
   * register and the SOLO button's queue sub-line. `null` means UNAVAILABLE
   * (outage, timeout, bad shape): both surfaces disappear and the doors stay
   * fully usable. Parallel to `setCancel`: main.ts drives it, the home only
   * paints.
   *
   * `queue.deadlineAt` must already be in the CLIENT's epoch (net/liveness.ts
   * localizes it) — the home ticks it against a plain `Date.now()`.
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

// AMENDMENT 47 (the container-fit law). The port stack is a rigid column of hard
// px margins — wordmark, callsign field, class chip, PLAY, the HOW TO PLAY /
// SERVER row — measuring ~668px tall, and it does NOT ride the HUD's ui-scale.
// Below a 668px-tall viewport it therefore overflowed `inset:0` in BOTH
// directions: the wordmark clipped off the top and the HOW TO PLAY / SERVER row
// fell past the bottom edge, unreachable (index.html sets `body{overflow:hidden}`
// so there is no page scroll to rescue it).
//
// The guard is applied by applyOverflowGuard() below, deliberately as SEPARATE
// property assignments rather than inside this cssText blob (the CSSOM-blob
// hazard the refit band documents: one declaration the test environment's parser
// dislikes silently voids the WHOLE blob, and this blob is already one of those
// — so anything load-bearing has to be assigned on its own).
const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'gap:0',
  'background:transparent', // the ambient CIC scene breathes behind
  'z-index:1100',
].join(';');

function makeWordmark(version: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
  const mark = document.createElement('div');
  mark.style.cssText =
    'font:700 clamp(48px, 9vw, 104px) var(--hc-font-display);letter-spacing:0.14em;color:var(--hc-text-primary);' +
    'line-height:1;text-align:center';
  mark.append(document.createTextNode('HULLCRACKER'));
  const io = document.createElement('span');
  io.textContent = '.IO';
  io.style.color = 'var(--hc-phosphor-bright)';
  mark.appendChild(io);
  const tagline = document.createElement('div');
  tagline.textContent = pickTagline();
  tagline.style.cssText = `${registerCss('label')};color:var(--hc-phosphor);letter-spacing:0.44em;margin-top:8px`;
  const ver = document.createElement('div');
  ver.textContent = `RT PROTOTYPE // v${version}`;
  ver.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.2em`;
  wrap.append(mark, tagline, ver);
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
  // focus glow) with the player's personal hue on mount and on every hoist pick.
  input.style.cssText =
    'width:340px;max-width:calc(100vw - 48px);height:52px;background:var(--hc-panel-deep);' +
    'border:1px solid var(--hc-hairline);border-radius:6px;padding:0 18px;color:var(--hc-text-primary);' +
    'font:500 20px var(--hc-font-mono);letter-spacing:0.12em;text-transform:uppercase;outline:none';
  return input;
}

function makeCallsignRow(input: HTMLInputElement): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:14px;margin-top:44px';
  const label = document.createElement('label');
  label.textContent = 'CALLSIGN';
  label.style.cssText = `${registerCss('label')};color:var(--hc-text-primary);letter-spacing:0.22em`;
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
    'display:flex;align-items:center;gap:14px;background:var(--hc-panel-deep);border:1px solid var(--hc-hairline);' +
    'border-radius:8px;padding:10px 16px 10px 12px;cursor:pointer;margin-top:22px;' +
    'max-width:calc(100vw - 48px);box-sizing:border-box';
  root.setAttribute('role', 'button');
  root.setAttribute('title', 'Open the class-select layer');
  root.tabIndex = 0;
  const sil = document.createElement('span');
  sil.style.cssText = 'display:flex;align-items:center;justify-content:center;width:44px;min-height:44px';
  const meta = document.createElement('span');
  meta.style.cssText = 'display:flex;flex-direction:column;min-width:0';
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
    `${registerCss('hudMicro')};margin-left:12px;color:var(--hc-phosphor);letter-spacing:0.18em;` +
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
 * pin a height. 6.5 took the shipped 86px fixed box down to a fixed 64px when
 * Eric deleted the restating sub-line; 6.6 puts a DIFFERENT sub-line back (a
 * live queue count), and a fixed height would either clip it or carry dead air
 * when it is absent. Hugging is what satisfies both states from one rule — and
 * it is what keeps the port column inside the 768px floor viewport (amendment
 * 47, the container-fit law). The height budget, against the measured column:
 * 6.5 landed at ~722px with ~46px of headroom, and a 14px hudMicro sub-line
 * plus its 3px lead adds ~17px to each of the two buttons → ~756px. Inside the
 * floor, and `applySafeCenterScroll` still backstops anything shorter.
 *
 * The outline is assigned as SEPARATE properties rather than inside the cssText
 * blob: a `border:1px solid var(--x)` shorthand is rejected by the test
 * environment's CSSOM parser, which silently voids the ENTIRE declaration list
 * (measured, not assumed — that is why the shipped PLAY button's own geometry
 * has never been assertable).
 *
 * The SUB-LINE element is always built, even when it has nothing to say: the
 * SOLO door's copy arrives asynchronously (and can go away again on an
 * outage), so a `display:none` empty span is the one structure that both states
 * can be painted into without rebuilding the button. It reads the hudMicro
 * register in PHOSPHOR — the port's system/status voice, the same one the
 * server-status line takes — never `--hc-text-muted`, which DESIGN.md:153 bars
 * for load-bearing numbers, and never amber, which is the ACTION register and
 * is forbidden as decoration.
 */
function makeModeButton(label: string, accent: string, title: string, subline = ''): HTMLButtonElement {
  const root = document.createElement('button');
  root.type = 'button';
  root.setAttribute('title', title);
  root.style.cssText =
    'width:480px;max-width:calc(100vw - 48px);min-height:64px;padding:8px 0;' +
    'box-sizing:border-box;background:var(--hc-panel-deep);' +
    'border-radius:8px;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;cursor:pointer';
  root.style.borderWidth = '1px';
  root.style.borderStyle = 'solid';
  root.style.borderColor = accent;
  const big = document.createElement('span');
  big.textContent = label;
  big.style.cssText =
    `font:800 34px var(--hc-font-mono);letter-spacing:0.34em;text-indent:0.34em;color:${accent}`;
  root.append(big, makeModeSubline(subline));
  return root;
}

/** The mode button's sub-line span (see `makeModeButton`). Hidden while empty. */
function makeModeSubline(text: string): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor);margin-top:3px`;
  paintModeSubline(el, text);
  return el;
}

/** Set (or clear) a mode button's sub-line. An empty line leaves NO gap — the
 *  span goes out of flow entirely, so the box shrinks back to hugging the label. */
function paintModeSubline(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}

/** A mode button's sub-line span — `makeModeButton` always appends it second. */
function sublineOf(btn: HTMLButtonElement): HTMLElement {
  return btn.children[1] as HTMLElement;
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
    // STATIC, and true whether or not `/liveness` ever answers: this door
    // creates its own room. It is the whole point of the pairing — when the
    // SOLO button reads `0 QUEUED`, this line is the way out of a dead queue.
    SOLO_AI_SUBLINE,
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
    'gap:14px;max-width:100%';
  row.append(...buttons);
  return row;
}

/**
 * The deploy console: ROW 1 (the mode row) over ROW 2 (SOLO VS AI, centered),
 * as one stack — amendment 47, the container-fit law.
 *
 * The port column is a rigid run of hard px margins that does not ride the HUD
 * ui-scale, so a second button is real height. Accounting against the measured
 * ~668px shipped column: the primary's box goes 86px → 64px (−22) and the
 * second row adds 64px on a 12px gap (+76), for a net +54 → **~722px, inside
 * the 768px floor** with ~46px to spare. The 12px gap (rather than the
 * console's 22px) is what buys the last of that headroom, and the overlay's
 * safe-center scroll (ui/fit.ts) still backstops anything shorter.
 *
 * The stack carries the primary's old `margin-top:26px`, so the chip→buttons
 * spacing is unchanged: 22px console gap + 26px = the same 48px as shipped.
 */
function makeDeployStack(modeRow: HTMLElement, soloBtn: HTMLElement): HTMLElement {
  const stack = document.createElement('div');
  stack.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:26px';
  stack.append(modeRow, soloBtn);
  return stack;
}

function makeUnderplay(
  statusEl: HTMLElement,
  cancelEl: HTMLElement,
  onHowTo: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:26px;margin-top:16px';
  const howto = document.createElement('span');
  howto.textContent = 'HOW TO PLAY';
  howto.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.14em;text-decoration:underline;` +
    'text-underline-offset:4px;cursor:pointer';
  howto.addEventListener('click', onHowTo);
  row.append(howto, statusEl, cancelEl);
  return row;
}

/** The queue's CANCEL affordance — HOW TO PLAY's grammar in the DENIED register,
 *  hidden until `setCancel()` hands it a canceller. It sits in the underplay row
 *  rather than beside PLAY so the port's rigid column keeps its measured height
 *  (amendment 47, the container-fit law). */
function makeCancel(onClick: () => void): HTMLElement {
  const el = document.createElement('span');
  el.textContent = 'CANCEL';
  el.setAttribute('role', 'button');
  el.setAttribute('title', 'Leave the queue');
  el.tabIndex = 0;
  el.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-denied);letter-spacing:0.14em;text-decoration:underline;` +
    'text-underline-offset:4px;cursor:pointer;display:none';
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onClick();
  });
  return el;
}

function makeStatusEl(): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = `${registerCss('hudMicro')};letter-spacing:0.14em;color:var(--hc-phosphor)`;
  return el;
}

interface LivenessEls {
  root: HTMLElement;
  players: HTMLElement;
  games: HTMLElement;
}

/**
 * The GLOBAL population register, TOP-LEFT (Story 6.6, Eric's placement and
 * Eric's copy): `PLAYERS ONLINE: n` over `LIVE GAMES: n`.
 *
 * It is the settings gear's MIRROR — the same `top:22px` inset, absolutely
 * positioned out of the port's rigid column so it costs that column zero height
 * (amendment 47, the container-fit law). It never takes pointer events: it is a
 * readout, and nothing about it is clickable.
 *
 * TYPOGRAPHY. `hudMicro` = Geist Mono, uppercase, letter-spaced (DESIGN.md:183,
 * "Geist Mono for every label, readout, and stat"); `tabular-nums` arrives
 * globally from ui/theme.ts's injected stylesheet, so the digits do not jitter
 * as the counts change under a 10s poll.
 *
 * COLOUR: `--hc-phosphor`, NOT `--hc-text-muted`. DESIGN.md:153 bars muted from
 * load-bearing numbers, and these are the most load-bearing numbers on the page
 * — the whole reason the block exists is that a player cannot otherwise tell
 * whether anyone is here. Phosphor is also the register the answer belongs to:
 * it is the port's SYSTEM voice (the one `serverStatusLine` already speaks in),
 * while amber is reserved for the ACTION register and would read as a second
 * call to act.
 *
 * Hidden (`display:none`) until a payload arrives, and hidden again the moment
 * liveness goes unavailable — see `livenessLines`, which owns that rule.
 */
function makeLiveness(): LivenessEls {
  const root = document.createElement('div');
  root.style.cssText =
    'position:absolute;top:22px;left:26px;display:none;flex-direction:column;' +
    'align-items:flex-start;gap:6px;pointer-events:none';
  const line = `${registerCss('hudMicro')};color:var(--hc-phosphor)`;
  const players = document.createElement('div');
  players.style.cssText = line;
  const games = document.createElement('div');
  games.style.cssText = line;
  root.append(players, games);
  return { root, players, games };
}

function makeGear(onClick: () => void): HTMLElement {
  const gear = document.createElement('div');
  gear.textContent = '⚙';
  gear.setAttribute('role', 'button');
  gear.setAttribute('title', 'Settings');
  gear.tabIndex = 0;
  gear.style.cssText =
    'position:absolute;top:22px;right:26px;font-size:32px;line-height:1;color:var(--hc-phosphor);' +
    'cursor:pointer';
  gear.addEventListener('click', onClick);
  gear.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onClick();
  });
  return gear;
}

// --- home controller ---------------------------------------------------------

interface Home {
  overlay: HTMLElement;
  input: HTMLInputElement;
  hoist: ColorHoist;
  statusEl: HTMLElement;
  /** The CANCEL affordance (Story 6.1) — shown only while `cancel` is set. */
  cancelEl: HTMLElement;
  /** Leave the queue, set by setCancel() while the player is pooled. */
  cancel: (() => void) | null;
  chip: ChipEls;
  /** SOLO — the mode row's primary (no sub-line: Eric ruling 2026-08-17). */
  playBtn: HTMLButtonElement;
  /** SOLO VS AI (Story 6.5) — the port's second door, one row below. */
  soloBtn: HTMLButtonElement;
  /** The top-left PLAYERS ONLINE / LIVE GAMES register (Story 6.6). */
  livenessEls: LivenessEls;
  /** The last `/liveness` read, or null while UNAVAILABLE (nothing renders). */
  liveness: LivenessPayload | null;
  /** The ~1Hz local countdown tick — live ONLY while the pool is armed, so an
   *  idle port (the common case) runs no timer at all. */
  livenessTick: ReturnType<typeof setInterval> | null;
  onDeploy: (name: string, cls: ShipClassId) => void;
  /** Deploy into a solo-vs-AI match. Same (name, cls) contract as onDeploy —
   *  the mode is the DOOR, not a field on the identity. */
  onSolo: (name: string, cls: ShipClassId) => void;
  /** Open/toggle the settings overlay (gear + home ESC — Story 2.3). */
  onSettings: () => void;
  currentClass: ShipClassId | null;
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
 * Repaint everything liveness owns: the top-left register and the SOLO door's
 * sub-line. Both come from `h.liveness` alone, so an unavailable read (null)
 * clears them together rather than leaving half a picture — and a stale count
 * is never left painted next to a live one.
 *
 * SOLO VS AI's sub-line is NOT touched here: it is a constant, true with or
 * without a server answer.
 */
function paintLiveness(h: Home): void {
  const lines = livenessLines(h.liveness);
  h.livenessEls.root.style.display = lines ? 'flex' : 'none';
  if (lines) {
    h.livenessEls.players.textContent = lines.players;
    h.livenessEls.games.textContent = lines.games;
  }
  paintModeSubline(
    sublineOf(h.playBtn),
    h.liveness ? queueButtonSubline(h.liveness.queue, Date.now()) : '',
  );
}

/**
 * Start/stop the 1Hz local countdown, which exists ONLY while the pool is
 * armed. An unarmed line ("NEEDS 2 TO START") carries no clock, so ticking it
 * would repaint an unchanging string once a second forever on a port nobody is
 * queued at; the poll's next read is what turns the timer on.
 */
function retickLiveness(h: Home): void {
  const armed = (h.liveness?.queue?.deadlineAt ?? null) !== null;
  if (armed && h.livenessTick === null) {
    h.livenessTick = setInterval(() => paintLiveness(h), 1000);
  } else if (!armed && h.livenessTick !== null) {
    clearInterval(h.livenessTick);
    h.livenessTick = null;
  }
}

function paintStatus(h: Home, text: string, tone: StatusTone): void {
  h.lastStatus = { text, tone };
  h.statusEl.textContent = text;
  h.statusEl.style.color = toneColor(tone);
}

/**
 * Rebuild the chip contents for the current class + personal accent. The border
 * and silhouette take the RAW hue (graphic marks); the class name is TEXT, so it
 * takes the WCAG-lifted `accentText` (textSafe) instead. No loadout sub-line —
 * the chip is slim now (the class bay carries the loadout).
 */
function repaintChip(h: Home): void {
  const accent = h.hoist.accent;
  h.chip.root.style.borderColor = accent;
  h.chip.root.style.boxShadow = `0 0 22px ${cssRgba(h.hoist.accentValue, 0.16)}`;
  h.chip.name.style.color = h.hoist.accentText;
  if (h.currentClass === null) {
    h.chip.sil.innerHTML = '';
    h.chip.role.textContent = 'SELECT CLASS';
    h.chip.name.textContent = 'CHOOSE A HULL';
    return;
  }
  h.chip.sil.innerHTML = silhouetteSvg(h.currentClass, { stroke: accent, fill: h.hoist.accentFill, strokeWidth: 2 });
  const svg = h.chip.sil.firstElementChild as HTMLElement | null;
  if (svg) svg.style.cssText = 'height:40px;width:auto';
  h.chip.role.textContent = 'YOUR SHIP';
  h.chip.name.textContent = CLASS_DISPLAY_NAMES[h.currentClass];
}

/** The callsign field's personal-color chrome: a hue border always, plus a ring
 *  + glow in the same hue while it holds focus (it replaces the native outline,
 *  which is suppressed). Text stays --hc-text-primary; only the chrome tints. */
function paintCallsign(h: Home): void {
  const accent = h.hoist.accent;
  h.input.style.borderColor = accent;
  h.input.style.boxShadow = h.inputFocused
    ? `0 0 0 1px ${accent}, 0 0 18px ${cssRgba(h.hoist.accentValue, 0.28)}`
    : 'none';
}

/** Repaint everything the personal color owns (chip + callsign chrome). Runs at
 *  mount and on every hoist pick, so a hue chosen in the class bay is already
 *  painted on the port the moment the layer closes. */
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
function deploy(h: Home, go: (name: string, cls: ShipClassId) => void): void {
  // Never-silence: a press mid-connect re-asserts the LIVE status line rather
  // than dying. It re-asserts what is ALREADY painted (not a fixed CONNECTING…)
  // because Story 6.1's queue readout only refreshes when the server pushes —
  // stamping CONNECTING… over it would blank the countdown until the next push.
  if (h.busy) return paintStatus(h, ...statusTuple(h.lastStatus ?? { text: NOTE_CONNECTING, tone: 'info' }));
  if (h.currentClass === null) return;
  const name = sanitizeName(h.input.value);
  saveName(name);
  go(name, h.currentClass);
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
    initial: h.currentClass ?? 'torpedoBoat',
    hoist: h.hoist,
    blurTarget: h.overlay,
    // CONFIRM SELECTION (and Enter) saves the class and comes back to port —
    // deliberately NO deploy(h) here: PLAY is the only path to onDeploy.
    onConfirm: (cls) => {
      h.layerOpen = false;
      h.layer = null;
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
  version: string,
): (e: KeyboardEvent) => void {
  const console_ = document.createElement('div');
  console_.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:22px';
  // NO hoist row here: the color picker lives only in the class bay footer now.
  console_.append(
    makeCallsignRow(h.input),
    h.chip.root,
    // ROW 1 (the mode row: SOLO today, DUO/TRIO beside it later) over ROW 2
    // (SOLO VS AI, centered) — Eric ruling 2026-08-17.
    makeDeployStack(makeModeRow(playBtn), soloBtn),
    makeUnderplay(h.statusEl, h.cancelEl, () => paintStatus(h, NOTE_HOWTO, 'tertiary')),
  );
  h.overlay.append(
    makeWordmark(version),
    console_,
    // The two corners: liveness top-LEFT, the gear top-RIGHT (Eric's placement).
    h.livenessEls.root,
    makeGear(() => h.onSettings()),
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
  h.disposers.push(h.hoist.onChange(() => repaintAccent(h)));
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
 */
function bindHomeKeys(h: Home): (e: KeyboardEvent) => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || h.layerOpen) return;
    // The callsign field keeps ESC to itself — but a focused VOLUME SLIDER
    // inside the overlay must NOT (textFieldElement excludes ranges), or ESC
    // dies the moment the player touches a volume from the home gear.
    if (textFieldElement(document.activeElement)) return;
    h.onSettings();
  };
  window.addEventListener('keydown', handler);
  return handler;
}

/**
 * Show the pre-join home. `onDeploy(name, cls)` fires ONLY from PLAY with a
 * chosen class — the class bay never deploys (CONFIRM SELECTION saves and comes
 * back to port). First-run SOLO opens the layer instead of connecting.
 * `onSettings()` is the gear + home-ESC settings toggle (Story 2.3).
 * `onSoloDeploy(name, cls)` is Story 6.5's SOLO VS AI door — same contract,
 * different route (no queue). It defaults to the standard deploy so a caller
 * that predates the second button still behaves.
 * Returns the handle main.ts drives for status/busy/hide.
 */
export function showHome(
  version: string,
  onDeploy: (name: string, cls: ShipClassId) => void,
  onSettings: () => void = () => undefined,
  onSoloDeploy: (name: string, cls: ShipClassId) => void = onDeploy,
): HomeHandle {
  document.getElementById(HOME_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = HOME_ID;
  overlay.style.cssText = OVERLAY_CSS;
  applySafeCenterScroll(overlay); // amendment 47 — see ui/fit.ts

  const input = makeNameField();
  const statusEl = makeStatusEl();
  const cancelEl = makeCancel(() => h.cancel?.());
  const play = makePlayButton(() => onPlay(h));
  const solo = makeSoloButton(() => onSolo(h));
  const chip = makeChip(() => openLayer(h));

  const h: Home = {
    overlay,
    input,
    hoist: new ColorHoist(),
    statusEl,
    cancelEl,
    cancel: null,
    chip,
    playBtn: play,
    soloBtn: solo,
    livenessEls: makeLiveness(),
    liveness: null,
    livenessTick: null,
    onDeploy,
    onSolo: onSoloDeploy,
    onSettings,
    currentClass: loadSavedClassOrNull(),
    layerOpen: false,
    busy: false,
    inputFocused: false,
    layer: null,
    statusLocked: false,
    lastStatus: null,
    disposers: [],
  };

  const keyHandler = mountHome(h, play, solo, version);
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
    },
    setCancel: (onCancel) => {
      h.cancel = onCancel;
      h.cancelEl.style.display = onCancel ? 'inline' : 'none';
    },
    setLiveness: (payload) => {
      h.liveness = payload;
      paintLiveness(h);
      retickLiveness(h);
    },
    setYielded: (yielded) => {
      const style = homeYieldStyle(yielded);
      h.overlay.style.visibility = style.visibility;
      h.overlay.style.pointerEvents = style.pointerEvents;
    },
    hide: () => {
      h.layer?.close(); // never orphan a live layer's window listener into the game
      h.layer = null;
      // The countdown tick must never outlive the screen it counts down on —
      // it closes over `h` and would repaint a detached DOM tree forever.
      if (h.livenessTick !== null) clearInterval(h.livenessTick);
      h.livenessTick = null;
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
