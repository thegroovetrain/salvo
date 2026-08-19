// THE CONSENT CARD (Story 7.2, Eric ruling R2: NON-BLOCKING; re-placed by Eric
// the same day as a bottom-RIGHT corner card — *"it could go in a box in the
// corner couldn't it?"* — see BAR_CSS for why the full-width strip had to go).
//
// IT NEVER STANDS IN THE PLAYER'S WAY, AND THAT IS ONLY COHERENT BECAUSE OF R7.
// Under Consent Mode BASIC nothing third-party loads until an explicit Accept —
// so a player who ignores this bar is ALREADY fully unmeasured, and the bar has
// nothing left to protect by blocking the water. The strictness lives in the
// data, not in the doorway. The accepted cost was stated at the gate and taken
// knowingly (amendment 14, R7): the funnel undercounts by however many players
// never answer. Do NOT "fix" that with an auto-accept, a dismissal timeout, or
// an "essential analytics" carve-out.
//
// Structurally that means: ONE `position:fixed` corner card and NOTHING else.
// There is no scrim, no `inset:0` element, and no focus trap — the home's
// callsign field, class chip, colour hoist and both deploy doors all keep
// working with the card up, because nothing is laid over them.
//
// IT DOES NOT IMPORT THE ANALYTICS LAYER. `onAccept` / `onDecline` arrive as
// callbacks and main.ts wires them, exactly as `portal/portalAdapter.ts` keeps
// a third-party SDK out of the code that calls it. This module can be rendered,
// clicked and torn down in a test with no GA4, no consent store and no network.
//
// THE COPY IS LEGALLY ACCURATE FIRST AND TERSE SECOND. Where the naval register
// and accuracy conflict, accuracy wins — the ratified precedent is DESIGN.md:243's
// Color Hoist caption, which bends the register specifically so it cannot imply
// something untrue ("must not imply claiming/locking"). A consent notice that
// undersells what a cookie does is not a style choice, it is a false statement.
// The NOTICE is therefore a sentence in Geist body — EXPERIENCE.md:53 permits
// prose in descriptions, and this is a description — while the label and both
// actions stay uppercase mono like every other system line in the port.
//
// COLOUR: `--hc-*` tokens only (tokens.test.ts fails the suite on one literal),
// and the notice is `text-primary`, never `text-muted` — DESIGN.md:153 bars
// muted from load-bearing copy and there is no copy on this page more
// load-bearing than this. Purple appears nowhere: purple is the storm and
// nothing else, ever (DESIGN.md:255).
//
// THE TWO ACTIONS ARE THE ONE RATIFIED BUTTON, TWICE. DESIGN.md:111/:244 ships
// exactly one: amber outline + glow, never a filled slab. ACCEPT is that button.
// DECLINE is the SECONDARY treatment ui/results.ts:733-770 established — the
// same shape, unlit, in phosphor — which is what keeps it a real, equal, honest
// choice without being the page's call to action.
//
// CSSOM-blob hazards: the `border:` shorthand with a var and the `background:`
// shorthand are both avoided (separate border properties, `background-color`
// longhand). ui/queueModal.ts documents both at length.

import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { registerCss } from './theme.js';

const C = CLIENT_CONFIG.consent;

export const CONSENT_BAR_ID = 'consent-bar';

/** Uppercase mono, the port's system voice. */
export const CONSENT_LABEL = 'ANALYTICS';

/**
 * THE NOTICE — FROZEN COPY. Every clause is a verified fact about what the
 * shipped code does, and none of it may be trimmed for rhythm:
 *
 *  - "Google Analytics" names the actual processor rather than hiding behind
 *    "our partners".
 *  - "nothing loads until you accept" is R7's Consent Mode BASIC, and is the
 *    single most important thing on the bar — it is what makes ignoring the bar
 *    a safe default rather than a silent opt-in.
 *  - "a cookie that recognises your browser on later visits" is GA4's persisted
 *    `client_id`, accepted by Eric as a values decision at R3. Calling it
 *    "anonymous" would be the false version.
 *  - "never your callsign, and nothing about what happens in a match" is NFR19,
 *    enforced on the wire by the analytics seam, not merely promised here.
 */
export const CONSENT_NOTICE =
  'Hullcracker would like to use Google Analytics to count how the game is used — '
  + 'nothing loads until you accept. It sets a cookie that recognises your browser on '
  + 'later visits. It never receives your callsign, or anything about what happens in a match.';

export const CONSENT_LINK_LABEL = 'PRIVACY POLICY';
export const CONSENT_ACCEPT_LABEL = 'ACCEPT';
export const CONSENT_DECLINE_LABEL = 'DECLINE';

export interface ConsentBarOptions {
  /** Fired once, AFTER the bar has torn itself down. */
  onAccept: () => void;
  /** Fired once, AFTER the bar has torn itself down. */
  onDecline: () => void;
  /** Policy destination. Defaults to `CLIENT_CONFIG.consent.policyHref`. */
  policyHref?: string;
  /** Where to mount. Defaults to `document.body`. */
  host?: HTMLElement;
}

// A CORNER CARD, NOT A FULL-WIDTH STRIP (Eric, 2026-08-18: *"it could go in a
// box in the corner couldn't it?"*).
//
// It shipped as a `left:0;right:0;bottom:0` strip first, and the strip was the
// problem. Spanning the width put it directly under the CENTRED port column, so
// at the ratified floor viewport (1366x768, UX-DR39) it covered the underplay
// block — HOW TO PLAY, the server register, and PRIVACY, the AC's own required
// policy link — for exactly as long as the consent question was open. Reserving
// its height on the column fixed the covering and bought an overflow instead:
// the wordmark clipped at the head. Every remaining lever was a pixel shave
// against frozen legal copy.
//
// A corner card removes the collision rather than negotiating with it: it is
// ~380px wide against a ~480px centred column, so the two never share horizontal
// space at any ratified width, the column needs no reserved inset at all, and
// nothing on home has to move out of its way.
//
// BOTTOM-RIGHT is the only free corner — bottom-left is the population register
// (`makeLiveness`) and top-right is the settings gear.
//
// R2's non-blocking promise is UNCHANGED and is still expressed structurally: no
// `top`, no `inset`, no backdrop. A `fixed` element hit-tests only the pixels it
// covers, and this one now covers a corner instead of a band.
const BAR_CSS = [
  'position:fixed',
  `right:${C.inset}px`,
  `bottom:${C.inset}px`,
  `width:min(${C.maxWidth}px, calc(100vw - ${C.inset * 2}px))`,
  'display:flex',
  'flex-direction:column',
  'align-items:flex-start',
  `gap:${C.gap}px`,
  `padding:${C.pad}`,
  'box-sizing:border-box',
  'background-color:var(--hc-panel)',
  `border-radius:${C.radius}px`,
  `z-index:${C.zIndex}`,
  'opacity:0', // flipped to 1 after a forced reflow — see `showConsentBar`
  `transition:opacity ${C.fadeMs}ms ease`,
].join(';');

/** The 1px hairline as SEPARATE properties (the CSSOM shorthand hazard). */
function applyHairline(el: HTMLElement, color: string): void {
  el.style.borderWidth = '1px';
  el.style.borderStyle = 'solid';
  el.style.borderColor = color;
}

/**
 * One action. `glow` present ⇒ the PRIMARY register (amber outline + amber
 * bloom, DESIGN.md:111); absent ⇒ the secondary treatment, the same shape unlit
 * (ui/results.ts:733-770).
 *
 * It never keeps focus: a focused `<button>` trips the keyboard chokepoint's
 * text-entry guard and swallows ESC for the whole port, which is why every
 * button in this codebase preventDefaults `mousedown` and blurs on click.
 */
function makeAction(
  id: string,
  label: string,
  accent: string,
  onClick: () => void,
  glow?: number,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.textContent = label;
  btn.style.cssText = [
    'padding:10px 24px',
    'background-color:transparent', // never a filled slab
    `border-radius:${C.controlRadius}px`,
    `color:${accent}`,
    'font:600 13px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'cursor:pointer',
    'white-space:nowrap',
    glow === undefined
      ? ''
      : `box-shadow:0 0 18px ${cssRgba(glow, 0.28)}, inset 0 0 14px ${cssRgba(glow, 0.07)}`,
  ].join(';');
  applyHairline(btn, accent);
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    btn.blur();
    onClick();
  });
  return btn;
}

/** Label + notice, the bar's text column. Takes all the slack so the actions sit
 *  hard right at any width, and wraps under them on a narrow viewport. */
function makeNotice(): HTMLElement {
  const col = document.createElement('div');
  // Stacked label-over-prose. It was briefly laid out inline, to win back a line
  // of height while this was still a full-width strip; the corner card has the
  // vertical room and not the horizontal, so it goes back to the port's ordinary
  // label-then-value grammar.
  col.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;min-width:0';
  const label = document.createElement('div');
  label.textContent = CONSENT_LABEL;
  label.style.cssText = `${registerCss('label')};color:var(--hc-phosphor)`;
  const notice = document.createElement('div');
  notice.textContent = CONSENT_NOTICE;
  // `text-primary`, NOT `text-muted` — DESIGN.md:153. A consent notice is the
  // definition of load-bearing copy.
  notice.style.cssText = `${registerCss('small')};color:var(--hc-text-primary);line-height:1.5`;
  col.append(label, notice);
  return col;
}

/**
 * The policy link — a real `<a href>`, not a click handler, so it opens in a new
 * tab on middle-click, is copyable, and works with scripting disabled. It stays
 * in the SAME tab on a plain click: the player is standing in port with no match
 * in flight, and the browser's own back button brings them straight back.
 */
function makePolicyLink(href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.id = `${CONSENT_BAR_ID}-policy`;
  a.href = href;
  a.textContent = CONSENT_LINK_LABEL;
  a.style.cssText =
    `${registerCss('hudMicro')};color:var(--hc-phosphor);letter-spacing:0.14em;`
    + 'text-decoration:underline;text-underline-offset:4px;white-space:nowrap';
  return a;
}

let teardown: (() => void) | null = null;

/** Is the bar on screen? */
export function consentBarVisible(): boolean {
  return teardown !== null;
}

/**
 * Take the bar down. Idempotent, fires no callback, and is the ONE teardown
 * path — the two actions, the returned disposer and a caller that decides the
 * bar should not be up all arrive here.
 */
export function hideConsentBar(): void {
  const fn = teardown;
  teardown = null;
  if (fn !== null) fn();
  // Belt and braces for a bar left behind by an earlier module instance: the id
  // is the only handle a stray element has.
  document.getElementById(CONSENT_BAR_ID)?.remove();
}

/**
 * Show the bar. Returns its disposer, which is the same teardown the two actions
 * run — so a caller that decides the choice is already made (a late-arriving
 * stored record, say) can put the bar away without inventing a second path.
 *
 * NEVER STACKS: an already-open bar is torn down first, in either direction.
 *
 * THE ACTIONS TEAR DOWN BEFORE THEY CALL BACK, matching ui/queueModal.ts's
 * CANCEL — the press must feel instant rather than waiting on whatever the
 * caller does with the answer (injecting a script, writing localStorage).
 *
 * THE ENTRANCE IS AN OPACITY FADE AND NOTHING ELSE. The bar appears before a
 * first-time player has had any chance to set a motion preference, so it may not
 * read that setting — which means the entrance has to be safe unconditionally.
 * An opacity ramp over `fadeMs` is: no slide, no pulse, no flash, nothing near
 * the photosensitivity ceiling. The `offsetHeight` read is a deliberate forced
 * reflow, which is what gives the transition a start value to run from; without
 * it the browser coalesces both opacities into one style computation and the bar
 * simply appears. It is a no-op in jsdom, where the final opacity is what the
 * tests read.
 */
export function showConsentBar(opts: ConsentBarOptions): () => void {
  hideConsentBar();
  const bar = document.createElement('div');
  bar.id = CONSENT_BAR_ID;
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Analytics consent');
  bar.style.cssText = BAR_CSS;
  // A FULL hairline outline now that it is a corner card rather than a strip:
  // it floats on the water instead of being lifted off its edge, which is the
  // settings/results panel grammar (`--hc-panel` bed + 1px hairline + 12px
  // radius). Assigned as separate properties, never the `border:` shorthand —
  // ui/fit.ts documents why a shorthand with a var voids the whole cssText blob.
  applyHairline(bar, 'var(--hc-hairline)');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
  actions.append(
    makeAction(
      `${CONSENT_BAR_ID}-decline`,
      CONSENT_DECLINE_LABEL,
      'var(--hc-phosphor)',
      () => {
        hideConsentBar();
        opts.onDecline();
      },
    ),
    makeAction(
      `${CONSENT_BAR_ID}-accept`,
      CONSENT_ACCEPT_LABEL,
      'var(--hc-amber)',
      () => {
        hideConsentBar();
        opts.onAccept();
      },
      CLIENT_CONFIG.colors.amber,
    ),
  );

  // The card's foot: the policy link and the two actions share one row, with the
  // link pushed left and the actions right, so the card reads notice-then-choice
  // top to bottom instead of as three stacked blocks.
  const foot = document.createElement('div');
  foot.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;width:100%';
  foot.append(makePolicyLink(opts.policyHref ?? C.policyHref), actions);
  bar.append(makeNotice(), foot);
  (opts.host ?? document.body).appendChild(bar);

  void bar.offsetHeight; // forced reflow — gives the fade a start value
  bar.style.opacity = '1';

  teardown = (): void => bar.remove();
  return hideConsentBar;
}
