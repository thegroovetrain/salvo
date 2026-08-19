// THE RESULTS-SCREEN DISPLAY UNIT — the one display ad on the whole site.
//
// Eric ruling 2026-08-19 (superseding amendment 16's R2, "INTERSTITIAL ONLY, NO
// DISPLAY UNITS ANYWHERE"): *"I would like some normal display ad space on the
// results screen… I don't want it in the results modal. but off to the side or
// something, only visible while the end game screen is up. If you spectate, it
// goes away. If you hit esc to get back to score screen, there it is."* He then
// chose a RESPONSIVE unit in the RIGHT gutter.
//
// ONE IMPRESSION PER MATCH, NEVER ONE PER TOGGLE — the whole shape of this file.
// Pushing a slot to `adsbygoogle` is what REQUESTS an ad, and since amendment 17
// ESC from spectate REOPENS the score screen, so the modal genuinely opens and
// closes many times in one match. A player flipping ESC would mint a fresh
// impression per keypress: that is an auto-refreshing placement, the pattern
// Google names when it says publishers *"should refrain from inserting ads in
// auto-refreshing placements"* and that it suspends accounts over. So the
// element is created and pushed EXACTLY ONCE (`pushed`), and every later toggle
// is CSS on the same element — never a re-push, never a remount, never a
// remove-and-recreate. `destroyResultsAd()` is the only reset, and it is wired
// to return-to-port, which is the end of the match.
//
// NOTHING IS SHOWN UNTIL GOOGLE REPORTS THE SLOT FILLED. The host is mounted
// `visibility:hidden` and only ever revealed when the `<ins>` carries
// `data-ad-status="filled"`. Two cases fall out of that for free and both are
// the desired behaviour: an ad-BLOCKED client never receives the attribute at
// all (the push into our array-shaped stub is inert), and an UNFILLED slot is
// stamped `unfilled` — in both the player sees NOTHING, with no empty box, no
// bed and no hole where something should be.
//
// WHY `visibility` FOR THE FILL GATE AND `display` FOR THE TOGGLE, which looks
// like two mechanisms doing one job and is not. A responsive unit measures its
// container's width at push time, so the pre-fill state has to keep a real
// layout box (`display:none` would push into a zero-width slot and be answered
// `unfilled` every time); `visibility:hidden` hides the bed, the border and the
// frame while keeping that box. The modal toggle, by contrast, wants the element
// gone from hit-testing entirely, and by then the ad has already been measured.
//
// IT LIVES OUTSIDE THE MODAL and touches none of its DOM: the results panel is a
// fixed `CLIENT_CONFIG.results.panelWidth` centred column, so this is a separate
// fixed-position element positioned FROM THE CENTRE, beside it. The modal's
// action set and the NO-INSTANT-RE-QUEUE pin are untouched.
//
// THE PANEL AND THE COLUMN ARE CENTRED AS ONE GROUP (Eric ruling 2026-08-19:
// *"you can move the results screen over to make room for the ad unit to the
// right if needed. idgaf."*). Squeezing the column into the right GUTTER of a
// dead-centred panel demanded `(W − panelWidth)/2 >= gap + column`, i.e. a
// 1352px viewport — which hid the unit on every 1024- and 1280-wide laptop and
// earned nothing there. Centring `panelWidth + gap + column` instead needs only
// that group plus its edge margins: 1002px. Same composition, ~350px cheaper.
//
// AND THE PANEL MOVES ONLY WHEN THE AD HAS ACTUALLY FILLED — the whole safety
// rule of the shift. A blocked client, an unfilled slot, a missing slot id, an
// unconfigured build and a viewport too narrow for the group ALL leave the score
// screen exactly where it has always been, because an off-centre results panel
// sitting beside empty space is worse than either outcome. The trigger is the
// SAME `data-ad-status="filled"` signal that reveals the unit (there is no
// second signal), the offset is a TRANSFORM on the panel — so the modal's own
// width, bed, scroll cap and `max-width:100%` narrow fallback are untouched —
// and it is reverted on hide, on teardown and on a resize below the breakpoint.
//
// AND IT IS DORMANT UNTIL THE SLOT EXISTS. A display unit needs a slot id minted
// in the AdSense dashboard, so the slot has its OWN build-time switch beside the
// publisher client's (both are read in `ads/adsense.ts`, the one module allowed
// to name them), and with either missing or malformed NOTHING is created — no
// element, no push, no observer.

import { CLIENT_CONFIG } from '../config.js';
import {
  AD_INS_CLASS,
  AD_STATUS_ATTR,
  adsClientId,
  adsSlotResults,
  isValidAdSlotId,
  pushDisplaySlot,
} from './adsense.js';
import { isValidAdsClientId } from './adsHead.js';
// THE ONE HOOK INTO THE MODAL, and it points this way round on purpose: the ad
// layer may read the panel's id, but no game module may import the ad layer
// (`ads.test.ts` pins that main.ts is the only importer), so the dependency has
// to hang here. It is an id string and nothing else — no DOM the modal owns is
// written except a transform this file also removes.
import { RESULTS_PANEL_ID } from '../ui/results.js';

/** The host element's id — exported so tests can assert on the real DOM rather
 *  than on an accessor written for them. */
export const RESULTS_AD_ID = 'results-ad';

/** px — the slot's own width. 300 is the classic responsive display column and
 *  is what the gutter has room for at the ratified 1366-wide floor. */
const AD_SLOT_WIDTH = 300;

/** px — the bed's padding, and its 1px hairline. Both count toward the column's
 *  outer width, which is what the fit test has to reason about. */
const AD_PAD = 12;
const AD_BORDER = 1;

/** px — clear water between the results panel's edge and the ad column. */
const AD_GAP = 24;

/** px — clear water between the GROUP (panel + gap + column) and each viewport
 *  edge. Below this the unit is hidden outright — and the panel stays dead
 *  centre — rather than the pair being crowded against the frame. */
const AD_EDGE = 16;

/** Above the results overlay's own 1000 (`ui/results.ts`), below settings (1050)
 *  and the pre-join home (1100) — it must read over the modal's dim, and must
 *  never sit over a surface that has taken the screen. */
const AD_Z_INDEX = 1010;

/** The column's OUTER width: the slot plus the bed that frames it. */
export function resultsAdColumnWidth(): number {
  return AD_SLOT_WIDTH + 2 * AD_PAD + 2 * AD_BORDER;
}

/** THE GROUP: the panel, the gap and the column read as one composition, and it
 *  is the group — not the panel — that is centred whenever the unit is up. */
export function resultsAdGroupWidth(): number {
  return CLIENT_CONFIG.results.panelWidth + AD_GAP + resultsAdColumnWidth();
}

/**
 * The narrowest viewport this unit may appear at — DERIVED, never a magic
 * number, so a change to the results panel's width moves it for free.
 *
 * It is simply the group plus an edge margin on each side. At today's 620px
 * panel that is 620 + 24 + 326 + 2 × 16 = 1002, which takes in every 1024-wide
 * laptop as well as the ratified 1366×768 floor (UX-DR39). The superseded
 * gutter rule — panel dead centre, column squeezed into what was left —
 * demanded 2 × (310 + 24 + 326 + 16) = 1352 and hid the unit on everything
 * below a 1366-wide screen.
 */
export function resultsAdMinViewportWidth(): number {
  return resultsAdGroupWidth() + 2 * AD_EDGE;
}

/** Whether the viewport can hold the panel and the column side by side. */
export function resultsAdFits(viewportWidth: number): boolean {
  return viewportWidth >= resultsAdMinViewportWidth();
}

/**
 * px — how far LEFT of dead centre the results panel sits while the unit is up.
 *
 * The group's centre is the viewport's centre, so the panel's own centre lands
 * half the group's width from its left edge: `panelWidth/2 − group/2`, which is
 * `−(gap + column)/2`. A CONSTANT, deliberately — it depends on nothing that
 * changes with the viewport, so the pair never slides about as the window is
 * resized above the breakpoint.
 */
export function resultsPanelOffsetX(): number {
  return -(AD_GAP + resultsAdColumnWidth()) / 2;
}

/**
 * px — the column's left edge, measured from dead centre: the shifted panel's
 * right edge (its offset CENTRE plus half its width) plus the gap. Derived from
 * the SAME group arithmetic the panel offset is, so the two can never drift
 * apart into an uneven gap.
 */
export function resultsAdOffsetX(): number {
  return resultsPanelOffsetX() + CLIENT_CONFIG.results.panelWidth / 2 + AD_GAP;
}

/**
 * Whether a display unit can exist at all in this build. BOTH ids are required
 * and both are validated: an `<ins>` naming a slot that does not exist is a
 * request Google answers with silence, which from inside the page is
 * indistinguishable from a legitimately unfilled slot — so a typo would be
 * invisible rather than loud.
 */
export function isResultsAdConfigured(): boolean {
  return isValidAdsClientId(adsClientId()) && isValidAdSlotId(adsSlotResults());
}

interface Mounted {
  host: HTMLElement;
  ins: HTMLElement;
  observer: MutationObserver | null;
}

/** The single live unit, or null before the first eligible show / after
 *  teardown. */
let mounted: Mounted | null = null;

/** THE ONE-IMPRESSION LATCH. True once the slot has been handed to the queue;
 *  cleared only by `destroyResultsAd()`, i.e. at the end of the match. */
let pushed = false;

/** True once Google reported `data-ad-status="filled"`. Never un-set while the
 *  unit lives — a filled slot stays filled across every toggle. */
let filled = false;

/** Whether the results modal is currently on screen. */
let wanted = false;

/** The bound resize handler, held so it can be removed on teardown. */
let onResize: (() => void) | null = null;

/** The results modal opened (or reopened): show the unit if this build has one
 *  and the viewport can hold it. */
export function showResultsAd(): void {
  if (!isResultsAdConfigured()) return;
  wanted = true;
  bindResize();
  sync();
}

/** The results modal closed (SPECTATE, or ESC on the modal): hide the unit
 *  WITHOUT touching the element, the push, or the fill state. */
export function hideResultsAd(): void {
  wanted = false;
  sync();
}

/** End of the match (return to port / session teardown): remove everything. The
 *  latches reset with it, so the next match — a fresh page load — starts clean. */
export function destroyResultsAd(): void {
  wanted = false;
  filled = false;
  pushed = false;
  setPanelShift(false); // the panel usually outlives nothing here — but never leave a shift behind
  unbindResize();
  if (mounted === null) return;
  mounted.observer?.disconnect();
  mounted.host.remove();
  mounted = null;
}

/**
 * Reconcile the DOM with `wanted`, the viewport and Google's verdict. The ONLY
 * writer of the element's visibility, so every path agrees by construction, and
 * the only place `filled` is latched — a fill that lands while the modal is
 * closed is picked up at the next show rather than needing its own path.
 */
function sync(): void {
  if (!isResultsAdConfigured()) return;
  if (!wanted || !resultsAdFits(viewportWidth())) {
    if (mounted !== null) mounted.host.style.display = 'none';
    setPanelShift(false);
    return;
  }
  ensureMounted();
  if (mounted === null) return;
  if (!filled && mounted.ins.getAttribute(AD_STATUS_ATTR) === 'filled') filled = true;
  mounted.host.style.display = 'block';
  mounted.host.style.visibility = filled ? 'visible' : 'hidden';
  // ONLY A REAL AD MOVES THE SCORE SCREEN. Everything else — blocked, unfilled,
  // still waiting on Google — leaves it dead centre, which is also what every
  // early return above this line does.
  setPanelShift(filled);
}

/**
 * Offset the results panel left by half the group, or put it back.
 *
 * A TRANSFORM rather than a margin or a `left`, so the panel's flex layout, its
 * `max-height` scroll cap and its `max-width:100%` narrow fallback all keep
 * behaving exactly as they do with no ad in the build. A no-op when no modal is
 * on screen: the panel is created fresh by every `showResults()` and destroyed
 * by every `hideResults()`, so there is no element left to carry a stale shift
 * — but reverting is still written explicitly, because the resize path clears
 * it on a LIVE panel.
 */
function setPanelShift(on: boolean): void {
  const doc = (globalThis as { document?: Document }).document;
  const panel = doc?.getElementById(RESULTS_PANEL_ID) ?? null;
  if (panel === null) return;
  if (on) panel.style.setProperty('transform', `translateX(${resultsPanelOffsetX()}px)`);
  else panel.style.removeProperty('transform');
}

/**
 * Create the host, the `<ins>` and the fill observer, and push the slot — ONCE.
 *
 * Reached only from `sync()`, and only when the modal is up AND the viewport
 * fits, which is what keeps the push out of a zero-width container and out of
 * live play entirely.
 */
function ensureMounted(): void {
  if (mounted !== null) return;
  const doc = (globalThis as { document?: Document }).document;
  if (doc?.body == null) return;
  const host = doc.createElement('div');
  host.id = RESULTS_AD_ID;
  applyStyle(host, hostStyle());
  const ins = doc.createElement('ins');
  ins.className = AD_INS_CLASS;
  applyStyle(ins, [
    ['display', 'block'],
    ['width', '100%'],
  ]);
  ins.setAttribute('data-ad-client', adsClientId());
  ins.setAttribute('data-ad-slot', adsSlotResults());
  ins.setAttribute('data-ad-format', 'auto');
  ins.setAttribute('data-full-width-responsive', 'false');
  host.appendChild(ins);
  doc.body.appendChild(host);
  // ASSIGNED BEFORE the observer is attached: the observer's callback is
  // `sync()`, and a mutation arriving with `mounted` still null would re-enter
  // this function and mount a second element.
  mounted = { host, ins, observer: null };
  mounted.observer = watchFill(ins);
  if (pushed) return;
  pushed = true;
  pushDisplaySlot();
}

/**
 * The bed — the same panel surface the results and settings panels wear
 * (DESIGN.md {components.modal}), so the unit reads as port chrome rather than
 * as something sitting on live ocean. Mounted hidden; `sync()` reveals it.
 *
 * DECLARATION PAIRS RATHER THAN A `cssText` STRING, and that is not a style
 * preference: jsdom's shorthand parser rejects `border: 1px solid var(--…)`
 * outright and DISCARDS THE ENTIRE `cssText` assignment when it does, so an
 * element styled that way carries no style at all under test while looking
 * perfect in a browser. `setProperty` applies each declaration independently, so
 * what the test reads is what the browser gets.
 */
function hostStyle(): [string, string][] {
  const R = CLIENT_CONFIG.results;
  return [
    ['position', 'fixed'],
    ['top', '50%'],
    ['left', `calc(50% + ${resultsAdOffsetX()}px)`],
    ['transform', 'translateY(-50%)'],
    ['width', `${resultsAdColumnWidth()}px`],
    ['box-sizing', 'border-box'],
    ['padding', `${AD_PAD}px`],
    ['background', 'var(--hc-panel)'],
    ['border', `${AD_BORDER}px solid var(--hc-hairline)`],
    ['border-radius', `${R.panelRadius}px`],
    ['z-index', `${AD_Z_INDEX}`],
    ['display', 'block'],
    ['visibility', 'hidden'],
  ];
}

/** Apply declaration pairs one at a time — see `hostStyle` for why. */
function applyStyle(el: HTMLElement, decls: readonly [string, string][]): void {
  for (const [prop, value] of decls) el.style.setProperty(prop, value);
}

/**
 * Watch the slot for Google's verdict and re-`sync()` when it lands.
 *
 * `filled` is the ONE value that reveals the unit. `unfilled`, any other value,
 * and — the blocked case — the attribute NEVER ARRIVING AT ALL are the same
 * answer: nothing is shown, and there is no timer anywhere waiting to decide
 * otherwise.
 */
function watchFill(ins: HTMLElement): MutationObserver | null {
  const Ctor = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  if (Ctor === undefined) return null;
  const observer = new Ctor(() => sync());
  observer.observe(ins, { attributes: true, attributeFilter: [AD_STATUS_ATTR] });
  return observer;
}

/** The viewport width, or 0 where there is no window — which reads as "does not
 *  fit", so a headless environment mounts nothing. */
function viewportWidth(): number {
  const w = (globalThis as { innerWidth?: number }).innerWidth;
  return typeof w === 'number' && Number.isFinite(w) ? w : 0;
}

interface ResizeTarget {
  addEventListener?: (type: string, handler: () => void) => void;
  removeEventListener?: (type: string, handler: () => void) => void;
}

/** Re-evaluate the fit when the window changes size — the breakpoint is a live
 *  rule, not a decision taken once at open time. */
function bindResize(): void {
  if (onResize !== null) return;
  const win = globalThis as ResizeTarget;
  if (typeof win.addEventListener !== 'function') return;
  onResize = () => sync();
  win.addEventListener('resize', onResize);
}

function unbindResize(): void {
  if (onResize === null) return;
  const win = globalThis as ResizeTarget;
  win.removeEventListener?.('resize', onResize);
  onResize = null;
}

/** Test-only teardown. Identical to the real one — the match boundary IS the
 *  reset — and named separately so a test reads as a test. */
export function __resetResultsAdForTests(): void {
  destroyResultsAd();
}
