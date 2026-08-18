// THE QUEUE MODAL (Eric ruling 2026-08-18): *"i want the queue to open up as a
// modal or something."*
//
// It replaces the shipped arrangement, in which the whole of the queue's wait
// was one line of copy HIJACKING the home's server-status register beside HOW TO
// PLAY — *"Get rid of this information message that pops up next to 'HOW TO
// PLAY' and replaces the server status."* The wait now has its own surface, and
// `h.statusEl` is the server probe's again.
//
// IT SAYS EXACTLY THREE THINGS AND INVENTS NOTHING. `N/20 QUEUED` (Eric's own
// wording, and the same derivation the SOLO button's sub-line takes), a
// `STARTS IN m:ss` countdown that exists ONLY while the pool is genuinely armed,
// and `CANCEL`. There is no title sentence, no explanatory prose, no
// reassurance, and — deliberately — NOTHING AT ALL about a lobby collapse: an
// auto-requeue arrives at this modal like any other queue join and shows the
// same count (the retired `LOBBY DISBANDED — SEARCHING FOR A NEW MATCH`
// register is gone with the status line it lived on).
//
// THE UNARMED SLOT IS EMPTY, NEVER A ZERO CLOCK (epic-6 amendment 4, ratified):
// a pool below `min` has no deadline, so a countdown there would be a number
// that cannot fire. The slot still holds its line (see `paintSlot`) so the
// CANCEL button below it cannot move out from under a click when the pool arms.
//
// IT IS DRIVEN BY THE LIVE `MSG.queueStatus` PUSH, not by the 10s `/liveness`
// poll: once you are IN the pool the room pushes on every change, and that is
// the authoritative count. `net/liveness.ts` is the pre-commit read for players
// still standing in port — main.ts stands it down the moment a deploy starts.
//
// Z REGISTER. The ratified ladder is refit 1000 < settings 1050 < home 1100 <
// class bay 1200; this takes 1150, the rung between the home it must sit ABOVE
// and the class bay (which is unreachable while a join is in flight — `openLayer`
// refuses while `busy`). Being above the home is also what makes the transparent
// backdrop enough: a `position:fixed;inset:0` element hit-tests every pixel even
// with no paint, so both deploy doors are unclickable for as long as the modal is
// up, with no yield needed. No fullscreen dim, matching ui/settings.ts — DESIGN
// dims behind the results screen only, and the ambient CIC scene keeps breathing.
//
// Styling is 100% inline cssText over `registerCss` + `--hc-*` tokens, as the
// rest of this UI layer is; there are no CSS classes and no colour literals.

import type { QueueStatusMsg } from '@salvo/shared';
import { registerCss } from './theme.js';

const QUEUE_MODAL_ID = 'queue-modal';

// --- pure copy (tested) ------------------------------------------------------

/**
 * `N/20 QUEUED` — Eric ruling 2026-08-18, verbatim: *"Just make it say 'N/20
 * Queued' where N is the number in queue."* Uppercased to match the register
 * every other readout in the port speaks in.
 *
 * The CAP comes off the payload, never a client-side literal: `20` is
 * `CONFIG.map.playerCap` today, and a copy that restated it would start lying
 * the day that is retuned — the same failure `queueButtonSubline` was fixed for
 * when it stopped inventing a `min`.
 *
 * THE ONE STRING BOTH SURFACES USE. The SOLO button's sub-line (ui/home.ts) and
 * this modal are the same sentence about the same pool, so they share one
 * derivation rather than two that can drift; only their INPUT shapes differ
 * (`LivenessPayload['queue']` carries `pooled`, `QueueStatusMsg` carries `n`).
 */
export function queuedCountLine(pooled: number, cap: number): string {
  return `${pooled}/${cap} QUEUED`;
}

/** m:ss with the seconds CEILED — the chrome bar's countdown grammar (Story
 *  3.3). A countdown reads the time REMAINING, so it must not show 0:00 while
 *  there is still a fraction of a second of it left. Clamped at zero, so an
 *  overshot deadline reads `0:00` rather than going negative. */
export function countdownMmSs(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Is this pool genuinely ARMED — i.e. is there a deadline that can actually
 * fire?
 *
 * BOTH clauses are required. `startsInMs` being a number is the server's own
 * answer, and `n >= min` is the independent structural one: `StandardQueueRoom`
 * refuses to publish a deadline below `min`, so the pair can only disagree on a
 * server we did not write — and the honest failure mode there is to say NOTHING
 * rather than count down to a match that will never start.
 */
export function queueArmed(q: QueueStatusMsg): boolean {
  return typeof q.startsInMs === 'number' && q.n >= q.min;
}

/** An ARMED pool's deadline as an ABSOLUTE instant in the caller's epoch, or
 *  `null` while unarmed. Derived once, at the moment the push landed (see
 *  `updateQueueModal`), which is what lets the 1Hz tick run without a second
 *  clock estimate. */
export function queueDeadlineAt(q: QueueStatusMsg, nowMs: number): number | null {
  return queueArmed(q) && typeof q.startsInMs === 'number' ? nowMs + q.startsInMs : null;
}

/** The countdown slot's copy: `STARTS IN m:ss` while armed, and the EMPTY
 *  string otherwise (amendment 4 — never a clock that cannot fire). `nowMs` and
 *  `deadlineAtMs` are both in the CLIENT's epoch: the absolute deadline is
 *  derived once, at the instant the push landed, so it ticks smoothly between
 *  pushes without a second clock estimate. */
export function queueCountdownLine(
  armed: boolean,
  deadlineAtMs: number,
  nowMs: number,
): string {
  return armed ? `STARTS IN ${countdownMmSs(deadlineAtMs - nowMs)}` : '';
}

// --- DOM ---------------------------------------------------------------------

// TWO CSSOM-BLOB HAZARDS ARE AVOIDED HERE BY CONSTRUCTION, and both were
// MEASURED in this repo's test environment rather than assumed. One declaration
// the parser dislikes silently voids the ENTIRE declaration list, so:
//
//   1. The `border:1px solid var(--x)` SHORTHAND is rejected outright — the
//      hazard `makeModeButton` and `makeAction` already document. Border is
//      assigned as separate properties below.
//   2. The `background:` SHORTHAND poisons everything AFTER it in the same blob
//      (`background:transparent;z-index:1150` yields NOTHING, while
//      `z-index:1150;background:transparent` is fine). This is a live latent
//      defect elsewhere: ui/home.ts's own `OVERLAY_CSS` and ui/results.ts's both
//      put `background:` before `z-index:`, so in the test environment those two
//      blobs are entirely void and every geometry pin on them is unassertable.
//      Using the `background-color` LONGHAND sidesteps it, which is why this
//      module's shape is assertable at all.
const OVERLAY_CSS = [
  'position:fixed',
  'inset:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'padding:24px',
  // No fullscreen dim (ui/settings.ts's precedent) — but it still hit-tests
  // every pixel, which is what takes the home's doors out of reach.
  'background-color:transparent',
  'z-index:1150',
].join(';');

// {components.modal} — panel bed, 1px HAIRLINE border, {rounded.lg} 12px, and
// `box-sizing:border-box` beside `max-height:100%` (amendment 47, the
// container-fit law: under the default content-box that max caps the CONTENT
// box, so the padding and border push the panel past the viewport).
const PANEL_CSS = [
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'gap:14px',
  'min-width:320px',
  'max-width:100%',
  'padding:28px 36px',
  'box-sizing:border-box',
  'max-height:100%',
  'background-color:var(--hc-panel)',
  'border-radius:12px',
  'font-family:var(--hc-font-mono)',
].join(';');

/** The 1px hairline outline, as SEPARATE properties (hazard 1 above). */
function applyHairline(el: HTMLElement, color: string): void {
  el.style.borderWidth = '1px';
  el.style.borderStyle = 'solid';
  el.style.borderColor = color;
}

/**
 * Set a slot's copy WITHOUT EVER MOVING WHAT IS BELOW IT — the same rule the
 * mode buttons' sub-line obeys, and for the same reason: the countdown appears
 * the moment the pool arms and goes away again if it un-arms, and the CANCEL
 * button must not jump between a click's mousedown and its mouseup.
 *
 * `visibility:hidden` keeps the box and drops it out of the accessibility tree;
 * the non-breaking space is what gives an otherwise-empty inline box a height at
 * all.
 */
function paintSlot(el: HTMLElement, text: string): void {
  el.textContent = text === '' ? ' ' : text;
  el.style.visibility = text === '' ? 'hidden' : 'visible';
}

/** The count — the modal's one big readout, in the port's SYSTEM register
 *  (phosphor). Never amber: amber is the ACTION register and belongs to the
 *  CANCEL button's neighbourhood, not to a number. */
function makeCount(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    `${registerCss('hudReadout')};color:var(--hc-phosphor);letter-spacing:0.18em;text-transform:uppercase`;
  return el;
}

function makeCountdown(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `${registerCss('hudMicro')};color:var(--hc-phosphor)`;
  return el;
}

/**
 * CANCEL — the modal's only action, and the ONLY way out of the pool that is
 * not a page reload (a queue wait is legitimately minutes long).
 *
 * It wears the DENIED register, which is what the home's retired underplay
 * CANCEL wore and what the act is: leaving. It is a real `<button>`, so Tab
 * reaches it and Enter/Space activate it natively — deliberately NOT autofocused,
 * because Enter is the deploy key and a player who pressed it a beat too late
 * would cancel the wait they just started.
 */
function makeCancelButton(onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = `${QUEUE_MODAL_ID}-cancel`;
  btn.setAttribute('title', 'Leave the queue');
  btn.style.cssText = [
    'padding:12px 28px',
    'background-color:transparent', // never a filled slab
    'border-radius:8px',
    'color:var(--hc-denied)',
    'font:600 13px var(--hc-font-mono)',
    'letter-spacing:.18em',
    'text-transform:uppercase',
    'cursor:pointer',
  ].join(';');
  applyHairline(btn, 'var(--hc-denied)');
  btn.textContent = 'CANCEL';
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    btn.blur();
    onClick();
  });
  return btn;
}

interface Mounted {
  overlay: HTMLElement;
  count: HTMLElement;
  countdown: HTMLElement;
  /** The absolute deadline in the CLIENT's epoch, or null while unarmed. */
  deadlineAt: number | null;
  /** The 1Hz local tick — live ONLY while armed, and cleared on every close
   *  path (see `hideQueueModal`). */
  tick: ReturnType<typeof setInterval> | null;
}

let mounted: Mounted | null = null;

/** Is the queue modal on screen? (Read by the home's ESC binding.) */
export function queueModalVisible(): boolean {
  return mounted !== null;
}

/** Repaint the countdown slot off the held absolute deadline. */
function paintCountdown(m: Mounted): void {
  paintSlot(
    m.countdown,
    queueCountdownLine(m.deadlineAt !== null, m.deadlineAt ?? 0, Date.now()),
  );
}

/**
 * Start/stop the 1Hz tick, which exists ONLY while the pool is armed: an unarmed
 * modal has an empty slot, so ticking it would repaint nothing once a second for
 * the whole (open-ended) wait.
 */
function retick(m: Mounted): void {
  const armed = m.deadlineAt !== null;
  if (armed && m.tick === null) {
    m.tick = setInterval(() => paintCountdown(m), 1000);
  } else if (!armed && m.tick !== null) {
    clearInterval(m.tick);
    m.tick = null;
  }
}

/**
 * Open the modal. Idempotent-ish: an already-open modal simply re-binds the new
 * canceller rather than stacking a second overlay (never stack, in either
 * direction — the law every other surface here obeys).
 *
 * CANCEL closes the modal FIRST and then leaves the pool, so the press is
 * instant rather than waiting on the connect flow's rejection to come back
 * around through `setCancel(null)` — which then finds nothing to close and is a
 * no-op.
 */
export function showQueueModal(onCancel: () => void): void {
  hideQueueModal();
  const overlay = document.createElement('div');
  overlay.id = QUEUE_MODAL_ID;
  overlay.style.cssText = OVERLAY_CSS;
  const panel = document.createElement('div');
  panel.style.cssText = PANEL_CSS;
  applyHairline(panel, 'var(--hc-hairline)');
  const count = makeCount();
  const countdown = makeCountdown();
  panel.append(
    count,
    countdown,
    makeCancelButton(() => {
      hideQueueModal();
      onCancel();
    }),
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  mounted = { overlay, count, countdown, deadlineAt: null, tick: null };
  // Nothing is known until the first `MSG.queueStatus` push lands, and the pool
  // is never armed at join time — so both slots open empty, holding their space.
  paintSlot(count, '');
  paintSlot(countdown, '');
}

/**
 * Fold one live `MSG.queueStatus` push into the open modal. A no-op when no
 * modal is up, so a late push after a cancel cannot resurrect one.
 *
 * The relative `startsInMs` is converted to an ABSOLUTE client-epoch deadline
 * HERE, once, at the instant the push landed — that is what lets the 1Hz tick
 * count smoothly between pushes without any clock estimate, and it is the same
 * shape `net/liveness.ts` hands the home (which localizes the server's absolute
 * figure instead, because its payload is not push-timed).
 */
export function updateQueueModal(q: QueueStatusMsg): void {
  const m = mounted;
  if (m === null) return;
  paintSlot(m.count, queuedCountLine(q.n, q.cap));
  m.deadlineAt = queueDeadlineAt(q, Date.now());
  paintCountdown(m);
  retick(m);
}

/**
 * Close the modal and clear its tick. Idempotent, and it is the ONE teardown
 * path — cancel, the seat arriving, a connect failure and `home.hide()` all
 * arrive here, so the interval can never outlive the DOM it repaints (it closes
 * over `mounted` and would otherwise run for the life of the page).
 */
export function hideQueueModal(): void {
  const m = mounted;
  mounted = null;
  if (m === null) return;
  if (m.tick !== null) clearInterval(m.tick);
  m.overlay.remove();
  // Belt and braces for a modal built before this module was reloaded, or one
  // left behind by a torn-down home: the id is the only handle a stray overlay
  // has.
  document.getElementById(QUEUE_MODAL_ID)?.remove();
}
