// THE REFIT BAND (Story 2.7, UX-DR14 geometry) — the TAB-toggled offer window,
// rebuilt from the interregnum 420px text column into the ratified four-card
// row: four 216px cards, 20px gaps (a 924px row), horizontally centered, top
// edge in the below-center band, NEVER wrapping, with queue pips and a dashed
// ghost edge behind the row for the offers still waiting.
//
// Plain DOM over the Pixi canvas (canvas is tactical, DOM is chrome), styled per
// DESIGN.md (phosphor surface, Geist Mono, amber-on-armed). It NEVER pauses or
// blocks the simulation: pointer-events live only on the cards, so the ocean
// keeps running behind it — but while it is OPEN the game is under FULL COMBAT
// LOCKOUT (mouse fire suppressed by MouseInput's lockout predicate + canvas-
// target filter; Q/E/R/F suspended at the keyboard chokepoint; helm stays live).
//
// STAY-OPEN THROUGH THE QUEUE (amendment 36 — supersedes amendment 2's "spending
// closes the modal"): a pick LATCHES (cards dim, inert), and
//   • success (the queue visibly shifted): the next offer renders IN PLACE and
//     the window stays open — spending the LAST level empties `pts`, which makes
//     currentOfferView() null and force-hides through the existing update(null);
//   • failure (timeout — the server rejected it): the picked card fires the 80ms
//     denied edge pulse, the level stays banked, and the window stays open.
// TAB/ESC still close anytime. A card click never fires the gun (MouseInput only
// counts canvas-target clicks) and never retains focus (mousedown preventDefault
// + post-click blur), so a later Space/Enter can't re-trigger the button and a
// focused button can't trip the chokepoint's text-entry guard.
//
// z-index sits at 1000 — below the pre-join menu (1100) and settings (1050) and
// above the toast stacks (900). Nothing rides on that last relation visually:
// toasts stack TOP-CENTER and the band sits BELOW-CENTER, so the two never
// overlap and neither can hide the other. The 1000 simply keeps the band on the
// same DOM-chrome scale as everything else (modals above it, feed chrome below).

import {
  BOON_CATALOG,
  CONFIG,
  boonStackCount,
  resolveBoons,
  type BoonDef,
  type OwnShip,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import {
  boonCategoryLabel,
  boonDescription,
  boonLineageLine,
  boonName,
  boonRarityLabel,
  boonReplacesLine,
} from './boonCopy.js';

const PANEL_ID = 'upgrade-menu';
const R = CLIENT_CONFIG.refit;
// Story 2.3 (amendment 17): the card's resting state is bright white content,
// not grey — armed (hover/focus) flips it to amber.
const REST = 'var(--hc-text-primary)';
const AMBER = 'var(--hc-amber)';
const PHOSPHOR = 'var(--hc-phosphor)';
const DENIED = 'var(--hc-denied)';
const HAIRLINE = 'var(--hc-hairline)';
/** Rarity tag colors (Story 2.8, implementer-drafted inside the ratified CVD
 *  constraints): INFO blue (~199°) for RARE and the STORM READOUT family
 *  (~277°) for EXCLUSIVE, both clear of the denied (0°) and amber (43°) bands
 *  and distinct from the phosphor (152°) the card's own data text rides. They
 *  are TEXT colors only — the card's border/box-shadow channel belongs to the
 *  denied pulse and the armed edge, and nothing else may claim it. */
const RARE = 'var(--hc-info)';
const EXCLUSIVE = 'var(--hc-storm-readout)';

// --- pure core: band geometry ------------------------------------------------

/** A screen-space box (px) — the hud.ts HudBox/HudRect idiom. */
export interface RefitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole refit band as pure geometry (the vitalsLayout/hotbarLayout idiom:
 *  one pure function the DOM derives from and the tests measure). */
export interface RefitBandLayout {
  /** The card row's bounding box (cards only — pips sit above it). */
  row: RefitBox;
  /** Each card's box, left to right — index k IS server offer slot k, which is
   *  what makes the digit chips 1..4 map spatially (UX-DR14). */
  cards: RefitBox[];
  /** The queue-pip strip, left-aligned with the row, above the cards. */
  pips: RefitBox;
  /** The whole band (pips + row) — what the keep-out checks measure. */
  band: RefitBox;
}

/** The band's card count — the ratified four (UX-DR14), DERIVED from the wire
 *  contract (`CONFIG.offer.size`) rather than re-stated as a literal, so the
 *  laid-out slot count and the server's offer size can never drift apart.
 *  Layout is fixed at this width regardless of how many cards a given offer
 *  actually carries. */
const CARD_SLOTS = CONFIG.offer.size;

/**
 * Pure: the band laid out for a (logical) viewport. The row is a FIXED 924px
 * (four 216s + three 20s) and is horizontally CENTERED; the top edge sits at
 * `bandTopFrac` of the viewport height. Deliberately independent of the offer's
 * actual length: slot k always occupies the same box, so a short offer (a small
 * catalog) leaves a gap rather than re-centering the digits under the player.
 *
 * The row NEVER wraps and never re-flows — at a viewport too narrow to hold 924
 * the row would clip, which is why the layout tests pin both ratified floors
 * (1366×768 at 100%, and the 1280×614 logical floor of the ≥1600px-gated 125%
 * tier).
 */
export function refitBandLayout(screenW: number, screenH: number, cards = CARD_SLOTS): RefitBandLayout {
  const rowW = cards * R.card + (cards - 1) * R.gap;
  const x = Math.round((screenW - rowW) / 2);
  const y = Math.round(screenH * R.bandTopFrac);
  const row = { x, y, w: rowW, h: R.cardHeight };
  const pips = { x, y: y - R.pipsAbove, w: rowW, h: R.pip };
  return {
    row,
    cards: Array.from({ length: cards }, (_, i) => ({
      x: x + i * (R.card + R.gap),
      y,
      w: R.card,
      h: R.cardHeight,
    })),
    pips,
    band: { x, y: pips.y, w: rowW, h: row.y + row.h - pips.y },
  };
}

// --- pure core: the spend view -------------------------------------------------

/** One resolved card: its catalog def plus every line of copy the DOM renders
 *  (Story 2.8's card anatomy — name by stack position, rarity tier, lineage
 *  handrail, doctrine-swap line, and rules text with LIVE values). */
export interface OfferCard {
  id: string;
  /** Uppercase category tag (one of the ratified nine). */
  category: string;
  /** Rarity tag — '' for a plain common (the absence IS the tier). */
  rarity: string;
  /** The ladder name at this card's stack position. */
  name: string;
  /** Lineage handrail for a multi-copy line ("II/V"), null for a single. */
  lineage: string | null;
  /** "REPLACES: <rival>" when the player holds this doctrine's rival, else null. */
  replaces: string | null;
  /** Rules text — the contract, with the player's live current → next values. */
  description: string;
}

/** The spendable state the band renders — derived purely from `you`. */
export interface OfferView {
  /** Banked levels (the queue length): 1 filled pip + (pts-1) hollow pips. */
  pts: number;
  options: OfferCard[];
  /**
   * True while a spend is in flight (main.ts's spend latch — see trySpend()):
   * a second spend within one server-tick+RTT would otherwise reference the
   * OLD front offer and land on whatever the FIFO shifted in behind it. Cards
   * render dimmed/inert until the queue visibly shifts or the latch's fallback
   * timeout clears it; digit picks are gated on the same flag.
   */
  locked: boolean;
}

/**
 * Pure: the current spend view, or null when there is nothing to show — no own
 * ship, spectating, an empty bank (pts 0), an EMPTY front offer, OR any offer id
 * that does not resolve against the shared BOON_CATALOG.
 *
 * The empty-offer case is the same fail-closed reflex as the unresolvable id: a
 * banked level whose offer carries nothing (only reachable through a degenerate
 * catalog — the server rolls `min(size, categoryCount)` ids and never zero for
 * the shipped catalog) would otherwise open the band with queue pips and NO
 * cards, i.e. a window that cannot be acted on and cannot be closed by spending.
 * Better to keep the band shut and leave the level banked.
 *
 * The unresolvable-id case drops the WHOLE view rather
 * than skipping the bad entry: skipping compacts `options` and breaks
 * row->slot alignment (row 1 could end up sending server slot 2's choice). It
 * is unreachable while client and server share a PROTOCOL_VERSION — the join
 * gate is what makes catalog content safe — but a stale tab that somehow got
 * through must go inert (digit picks included, since currentOfferView() also
 * returns null) rather than silently misfire.
 */
export function offerView(you: OwnShip | null, spectating: boolean, locked: boolean): OfferView | null {
  if (!you || spectating || you.pts === 0 || you.offer.length === 0) return null;
  const defs = resolveBoons(you.offer, BOON_CATALOG);
  if (defs.length !== you.offer.length) return null; // fail-closed: row k == server slot k
  return { pts: you.pts, options: defs.map((def) => toCard(def, you)), locked };
}

/**
 * One catalog def + the copy the card face carries, resolved against the
 * PLAYER'S OWN STATE (Story 2.8): the ladder name and the lineage marker depend
 * on how many of that line they already hold, the doctrine-swap line on whether
 * they hold the rival, and the rules text on their whole fitted build (a live
 * effectiveStats preview diff). Everything here is pure — `you` is read, never
 * touched.
 */
function toCard(def: BoonDef, you: OwnShip): OfferCard {
  const stack = boonStackCount(you.boons, def.id);
  return {
    id: def.id,
    category: boonCategoryLabel(def.category),
    rarity: boonRarityLabel(def.rarity),
    name: boonName(def.id, stack),
    lineage: boonLineageLine(def, stack),
    replaces: boonReplacesLine(def, you.boons),
    description: boonDescription(def, you),
  };
}

/**
 * Pure: the STACK SIGNATURE of an offer against the player's build — the held
 * occurrence count of each offered line, joined. It rides the render memo
 * alongside `pts` and the ids because a card's PRESENTATION can change while its
 * id does not: spend a HEAVY SHELLS, and the queued offer that slides in behind
 * it may carry the same line at a new rung (name, lineage, and the current→next
 * numbers all move). Cheap — at most `CONFIG.offer.size` counts per render call.
 */
export function offerStackSignature(you: { boons: readonly string[]; offer: readonly string[] }): string {
  return you.offer.map((id) => boonStackCount(you.boons, id)).join('.');
}

// --- pure core: the spend latch + outcome ---------------------------------------

/** How long the spend latch holds before falling back open, in case the server
 *  silently rejected the spend — well past any real server-tick+RTT round trip,
 *  so it never masks a stuck UI. */
export const SPEND_LATCH_TIMEOUT_MS = 1500;

/** The send-time snapshot behind the FINDING A spend latch (main.ts's
 *  `spendInFlight`): the banked count and the FRONT offer, kept SEPARATE so a
 *  bank arriving mid-flight (which moves `pts` but not the front offer) can be
 *  told apart from the queue actually shifting. `at` is the performance.now()
 *  the spend was sent at — the timeout fallback's epoch. `choice` is the card
 *  the player picked, so a FAILED outcome can pulse exactly that card.
 *
 *  `acked` is the SERVER'S OWN CONFIRMATION: the self-private `bn` (boon fitted)
 *  event for this spend arrived on a frame (net/roomBindings routes it to
 *  main.ts, which sets the flag on the latch in flight). It is the only direct
 *  evidence a spend LANDED — every other release clause infers it from state
 *  that a concurrent passive bank can mask (see spendLatchReleased). */
export interface SpendLatch {
  pts: number;
  offerSig: string;
  at: number;
  choice: number;
  acked: boolean;
}

/** The FRONT offer's boon ids, joined — the "the server queue moved" signal.
 *  Deliberately excludes `pts`: Story 2.6's passive banking ticks the count up
 *  on its own schedule, and that is not a spend landing. */
export function frontOfferSignature(you: { offer: string[] } | null | undefined): string {
  return you ? you.offer.join(',') : '';
}

/**
 * Pure: may the FINDING A spend latch be released this frame? Released when
 *
 *   (a) there is no own ship — death/spectate; the window is hidden anyway and
 *       holding the latch across a life would outlive its purpose;
 *   (a2) the server ACKED the spend (`latch.acked` — the self-private `bn`
 *       fitted event for it arrived): direct evidence, no inference needed;
 *   (b) the bank visibly SHRANK (`pts` below the snapshot) — the spend landed;
 *   (c) the front offer CHANGED — the queue shifted, which covers a spend that
 *       landed in the same frame as a bank that cancelled the numeric drop;
 *   (d) the fallback timeout elapsed — the server silently rejected the spend
 *       (nothing shifted), so the player is never locked out forever.
 *
 * A pts INCREASE with an unchanged front offer HOLDS: passive XP banking
 * (Story 2.6) makes that a routine mid-flight event, and releasing on it would
 * re-open the double-spend-against-a-shifted-FIFO hazard the latch exists to
 * prevent.
 *
 * Clause (a2) is what CLOSES the degenerate corner the (b)/(c) inference cannot
 * see: a spend that lands in the same frame as a passive bank (pts unchanged)
 * whose freshly-rolled offer happens to carry IDENTICAL ids (signature
 * unchanged) leaves no observable trace in `you` at all. Before the ack the
 * latch held to the 1.5s timeout and classified 'failed', firing the denied
 * pulse on a spend that had already toasted "◆ … FITTED". The `bn` event is that
 * spend's receipt, so the latch releases on it as a success.
 *
 * With `acked: false` the predicate is byte-for-byte the Story 2.6 rule (its
 * hold-through-passive-bank pins are load-bearing and stay green untouched);
 * Story 2.7 only ADDS the acked release.
 */
export function spendLatchReleased(
  latch: SpendLatch,
  you: { pts: number; offer: string[] } | null | undefined,
  nowMs: number,
): boolean {
  if (!you) return true;
  if (latch.acked) return true;
  if (nowMs - latch.at > SPEND_LATCH_TIMEOUT_MS) return true;
  if (you.pts < latch.pts) return true;
  return frontOfferSignature(you) !== latch.offerSig;
}

/**
 * Pure: may a pick be SENT and latched this frame (main.ts's trySpend gate)?
 * Two conditions, both fail-closed:
 *   • no spend already in flight — the FINDING A rule (a second pick inside one
 *     server-tick+RTT would reference the front offer the server already
 *     shifted away);
 *   • an own ship actually exists in the server mirror. A click can land in the
 *     gap between the frame that dropped `you` (death → the spectator frame
 *     omits it) and the next rAF that hides the band. Latching there snapshots
 *     `pts: 0` / an empty signature against a `you` that is null on every
 *     following frame, so nothing can ever satisfy the "landed" clauses — the
 *     latch is guaranteed to sit until the 1.5s timeout and classify 'failed'.
 *     There is nothing to spend anyway, so the pick is dropped outright.
 */
export function canLatchSpend(
  inFlight: SpendLatch | null,
  you: { pts: number; offer: string[] } | null | undefined,
): boolean {
  return !inFlight && !!you;
}

/** What a latch is doing this frame: still waiting, landed, or gave up. */
export type SpendOutcome = 'pending' | 'success' | 'failed';

/**
 * Pure: classify the latch for the stay-open state machine (amendment 36).
 * Built ON TOP of spendLatchReleased so the two can never disagree about WHEN
 * the latch clears — only about WHY:
 *   • 'pending' — not released; cards stay dimmed and inert;
 *   • 'success' — released because the SERVER ACKED it (`latch.acked` — the
 *     `bn` fitted event), or because the queue visibly moved (pts dropped or the
 *     front offer shifted): the next offer renders in place, window stays open;
 *   • 'failed'  — released any other way (the 1.5s timeout, or the own ship
 *     vanished): fire the denied pulse on `latch.choice`, the level stays
 *     banked, window stays open. (The no-own-ship case classifies as failed but
 *     renders nothing — update(null) has already force-hidden the window.)
 *
 * The ack outranks every inference, including the vanished own ship: a `bn` for
 * this spend is proof it landed, and a denied pulse would then contradict the
 * fitted toast the player already saw.
 */
export function spendOutcome(
  latch: SpendLatch,
  you: { pts: number; offer: string[] } | null | undefined,
  nowMs: number,
): SpendOutcome {
  if (!spendLatchReleased(latch, you, nowMs)) return 'pending';
  if (latch.acked) return 'success';
  if (!you) return 'failed';
  return you.pts < latch.pts || frontOfferSignature(you) !== latch.offerSig ? 'success' : 'failed';
}

// --- DOM ------------------------------------------------------------------------

const PANEL_CSS = [
  'position:fixed',
  'left:50%',
  'display:none', // toggled to 'flex' when shown
  'flex-direction:column',
  'align-items:flex-start',
  `gap:${R.pipsAbove - R.pip}px`,
  'z-index:1000',
  'pointer-events:none', // only the cards take pointer events
  // HUD-tier DOM chrome scales with the accessibility UI scale (Story 2.3); the
  // centering translate composes with it. Origin is the band's TOP CENTER so a
  // scaled band grows downward from its anchor instead of drifting off it.
  'transform-origin:top center',
  'transform:translateX(-50%) scale(var(--hc-ui-scale, 1))',
].join(';');

/** The queue-pip strip: one filled square for the offer on screen, one hollow
 *  square per offer still queued behind it (dual-coded with the row itself —
 *  never hue alone). */
const PIPS_CSS = ['display:flex', 'flex-direction:row', `gap:${R.pipGap}px`, 'align-items:center'].join(';');

// NOTE ON SHORTHANDS: every `border`/`background` declaration below is written
// as LONGHANDS with the custom-property value assigned separately (element.style
// .borderColor = 'var(--x)'). Browsers accept `border: 1px solid var(--x)` in a
// cssText blob, but the CSSOM parser in the test environment rejects the WHOLE
// blob on it — silently unstyling the element and making every style assertion
// vacuous. Longhands keep the DOM tests honest and render identically.
const PIP_BASE = [`width:${R.pip}px`, `height:${R.pip}px`, 'border-width:1px', 'border-style:solid'].join(';');
const PIP_FILLED = PIP_BASE;
const PIP_HOLLOW = `${PIP_BASE};background-color:transparent;opacity:0.6`;

/** The row: strictly no wrap (UX-DR14) and no shared panel/backdrop behind it. */
const ROW_CSS = ['position:relative', 'display:flex', 'flex-direction:row', 'flex-wrap:nowrap', `gap:${R.gap}px`].join(';');

/** The dashed GHOST EDGE behind the row — the waiting offers, shown only when
 *  more than one level is banked. Purely decorative, never hit-tested. */
const GHOST_CSS = [
  'position:absolute',
  `left:${R.ghostOffset}px`,
  `top:${R.ghostOffset}px`,
  'right:-' + R.ghostOffset + 'px',
  'bottom:-' + R.ghostOffset + 'px',
  'border-width:1px',
  'border-style:dashed',
  'opacity:0.28',
  'pointer-events:none',
  'z-index:-1',
].join(';');

/** One card: square corners, hairline edge, no filled panel bed. */
const CARD_CSS = [
  'position:relative',
  `width:${R.card}px`,
  `height:${R.cardHeight}px`,
  `padding:${R.pad}px`,
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0', // square corners (DESIGN.md CIC chrome)
  'display:flex',
  'flex-direction:column',
  'align-items:flex-start',
  'gap:6px',
  'text-align:left',
  'cursor:pointer',
  'pointer-events:auto',
  'flex:none',
].join(';');

/** Locked (a spend is in flight): dimmed and inert — no hover, no click. */
const CARD_LOCKED_CSS = `${CARD_CSS};opacity:${R.lockedAlpha};cursor:default`;

/** The mono key-chip glyph (the ONE key-chip family — hotbar slots and helm
 *  glyphs render the same treatment): a bordered digit OVERHANGING the card's
 *  top-left corner by half its size, riding currentColor so the card's
 *  rest/armed state cascades into it. */
const KEY_CHIP_CSS = [
  'position:absolute',
  `left:-${R.keyChip / 2}px`,
  `top:-${R.keyChip / 2}px`,
  `width:${R.keyChip}px`,
  `height:${R.keyChip}px`,
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'border:1px solid currentColor',
  `font:400 ${R.categorySize}px var(--hc-font-mono)`,
  'flex:none',
].join(';');

const CATEGORY_CSS = [
  `font:400 ${R.categorySize}px var(--hc-font-mono)`,
  'letter-spacing:2px',
  'text-transform:uppercase',
].join(';');

// The ladder names are AUTHORED in their final case (amendment 42's canon —
// "HEAVY SHELLS Mk III"), so there is deliberately NO text-transform here: an
// uppercase transform would print "MK III" and break the period-authentic mark.
// `--hc-white` is a UTILITY-only token that theme.ts never projects, so the old
// `color:var(--hc-white)` here (and in paintCard) resolved to nothing and the
// name silently inherited the card's currentColor — fixed to the real rest
// token, which is what it was always meant to be.
const NAME_CSS = [
  `font:600 ${R.nameSize}px var(--hc-font-mono)`,
  'letter-spacing:1px',
  `color:${REST}`,
].join(';');

/** The category/rarity line: the category tag at rest, the rarity tag beside it
 *  (commons render no rarity span at all — the absence IS the tier). */
const META_ROW_CSS = [
  'display:flex',
  'flex-direction:row',
  'align-items:baseline',
  `gap:${R.metaGap}px`,
  'align-self:stretch',
].join(';');

const RARITY_CSS = [
  `font:600 ${R.raritySize}px var(--hc-font-mono)`,
  'letter-spacing:2px',
  'text-transform:uppercase',
  'margin-left:auto', // the tier sits at the card's outer edge, opposite the category
].join(';');

/** The lineage handrail ("II/V") — Sally's ratified marker that ARMOR BELT
 *  continues REINFORCED HULL. Dim-not-grey (amendment 16): phosphor at reduced
 *  opacity, never a grey. */
const LINEAGE_CSS = [
  `font:400 ${R.lineageSize}px var(--hc-font-mono)`,
  'letter-spacing:2px',
  `color:${PHOSPHOR}`,
  'opacity:0.7',
].join(';');

/** The doctrine-swap line ("REPLACES: ACOUSTIC HOMING") — same exclusive tier
 *  color as the rarity tag, because it is that tier's consequence. */
const REPLACES_CSS = [
  `font:400 ${R.raritySize}px var(--hc-font-mono)`,
  'letter-spacing:1px',
  `color:${EXCLUSIVE}`,
].join(';');

/** Phosphor, NOT grey (amendment 16): the description is data, and grey text is
 *  retired for load-bearing copy everywhere. */
const DESC_CSS = [
  `font:400 ${R.descSize}px var(--hc-font-mono)`,
  'line-height:1.25',
  `color:${PHOSPHOR}`,
  'opacity:0.85',
].join(';');

/** The armed (hover/focus) treatment: amber edge + glow, amber chip/category/
 *  name — the hotbar's SELECTED grammar, one family. The RARITY tag keeps its
 *  tier color through the arm (the tier is a fact about the card, not a state
 *  of the pointer), and so does the lineage/replaces copy. */
function paintCard(card: RefitCardEls, armed: boolean): void {
  const c = armed ? AMBER : REST;
  card.root.style.borderColor = armed ? AMBER : HAIRLINE;
  card.root.style.boxShadow = armed ? `0 0 8px ${AMBER}` : 'none';
  card.root.style.color = c; // the key chip rides currentColor
  card.category.style.color = armed ? AMBER : PHOSPHOR;
  card.name.style.color = c;
}

/** One rarity tag span (RARE / EXCLUSIVE) in its tier color. */
function rarityEl(rarity: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.cssText = RARITY_CSS;
  el.style.color = rarity === 'EXCLUSIVE' ? EXCLUSIVE : RARE;
  el.textContent = rarity;
  return el;
}

/** One plain text line (lineage / doctrine-swap) at a prepared style. */
function lineEl(css: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.cssText = css;
  el.textContent = text;
  return el;
}

/** The render memo's per-card component: every line the face actually shows,
 *  so a copy change with an unchanged id still repaints (see render()). */
function cardSignature(card: OfferCard): string {
  return [card.id, card.rarity, card.name, card.lineage ?? '', card.replaces ?? '', card.description].join('~');
}

/** The DOM handles of one built card. */
interface RefitCardEls {
  root: HTMLButtonElement;
  category: HTMLSpanElement;
  name: HTMLSpanElement;
}

/**
 * The refit band. TAB toggle()s it (main.ts gates open on a banked level);
 * digits 1–4 pick via main.ts's onRefitPick while it is open; a card click
 * picks too. A pick does NOT close (amendment 36) — the window rides the queue.
 * Cards re-render only when the view signature changes (pts + option ids +
 * locked) so live per-frame update()s stay cheap.
 */
export class UpgradeMenu {
  private panel: HTMLDivElement | null = null;
  private pipsEl: HTMLDivElement | null = null;
  private rowEl: HTMLDivElement | null = null;
  private ghostEl: HTMLDivElement | null = null;
  private cards: RefitCardEls[] = [];
  private shown = false;
  private sig = '';
  /** Denied-pulse bookkeeping: the card index flashing, when it ends, and the
   *  last trigger time (the 300ms same-source floor — deniedFire's grammar). */
  private deniedCard = -1;
  private deniedUntil = -Infinity;
  private deniedLastAt = -Infinity;

  constructor(private readonly onSpend: (choice: number) => void) {}

  get visible(): boolean {
    return this.shown;
  }

  private ensurePanel(): HTMLDivElement {
    if (this.panel) return this.panel;
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = PANEL_CSS;
    const pips = document.createElement('div');
    pips.style.cssText = PIPS_CSS;
    const row = document.createElement('div');
    row.style.cssText = ROW_CSS;
    const ghost = document.createElement('div');
    ghost.style.cssText = GHOST_CSS;
    ghost.style.borderColor = PHOSPHOR;
    ghost.style.display = 'none';
    row.appendChild(ghost);
    panel.append(pips, row);
    document.body.appendChild(panel);
    this.panel = panel;
    this.pipsEl = pips;
    this.rowEl = row;
    this.ghostEl = ghost;
    return panel;
  }

  /**
   * One card, top-down: the overhanging digit chip (PINNED as the card's FIRST
   * span — the digit-to-slot mapping is read off it), the category/rarity meta
   * row, the ladder name, the lineage handrail, the doctrine-swap line, and the
   * rules text. The three Story 2.8 lines are CONDITIONAL: a plain common
   * renders no rarity span, a single-copy line no lineage span, and a card whose
   * rival you do not hold no replaces span — an empty element would eat vertical
   * rhythm for information that isn't there.
   */
  private makeCard(card: OfferCard, choice: number, enabled: boolean): RefitCardEls {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = enabled ? CARD_CSS : CARD_LOCKED_CSS;
    btn.style.backgroundColor = 'var(--hc-panel)';
    const chip = document.createElement('span');
    chip.style.cssText = KEY_CHIP_CSS;
    chip.style.backgroundColor = 'var(--hc-panel)'; // opaque under the overhang
    chip.textContent = `${choice + 1}`;
    btn.appendChild(chip); // FIRST child, always — pinned DOM order
    const category = document.createElement('span');
    category.style.cssText = CATEGORY_CSS;
    category.textContent = card.category;
    const meta = document.createElement('div');
    meta.style.cssText = META_ROW_CSS;
    meta.appendChild(category);
    if (card.rarity) meta.appendChild(rarityEl(card.rarity));
    const name = document.createElement('span');
    name.style.cssText = NAME_CSS;
    name.textContent = card.name;
    const desc = document.createElement('span');
    desc.style.cssText = DESC_CSS;
    desc.textContent = card.description;
    btn.append(meta, name);
    if (card.lineage) btn.appendChild(lineEl(LINEAGE_CSS, card.lineage));
    if (card.replaces) btn.appendChild(lineEl(REPLACES_CSS, card.replaces));
    btn.appendChild(desc);
    const els: RefitCardEls = { root: btn, category, name };
    paintCard(els, false);
    // Focus hygiene (full-lockout modal): never acquire focus on click —
    // a focus-retaining card would (a) let Space/Enter re-trigger the spend
    // and (b) trip the keyboard chokepoint's text-entry guard mid-battle.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    if (!enabled) {
      btn.disabled = true; // real disabled state, not just opacity — keyboard/AT see it too
      return els;
    }
    btn.addEventListener('mouseenter', () => paintCard(els, true));
    btn.addEventListener('mouseleave', () => paintCard(els, false));
    btn.addEventListener('focus', () => paintCard(els, true));
    btn.addEventListener('blur', () => paintCard(els, false));
    btn.addEventListener('click', () => {
      btn.blur(); // belt-and-braces with the mousedown preventDefault above
      this.onSpend(choice);
    });
    return els;
  }

  /** Queue pips: filled = the offer on screen, hollow = each one still waiting. */
  private renderPips(pts: number): void {
    const pips = this.pipsEl!;
    pips.replaceChildren();
    for (let i = 0; i < pts; i += 1) {
      const pip = document.createElement('div');
      pip.style.cssText = i === 0 ? PIP_FILLED : PIP_HOLLOW;
      pip.style.borderColor = PHOSPHOR;
      // Dual-coded: FILL (not hue) says "on screen now"; hollow says "waiting".
      if (i === 0) pip.style.backgroundColor = PHOSPHOR;
      pips.appendChild(pip);
    }
  }

  /**
   * Rebuild pips + cards only when the meaningful view state changed. The
   * signature carries the id list AND every rendered line of copy (Story 2.8):
   * a card's PRESENTATION moves without its id — the same line can arrive at a
   * new rung after a spend (new name, new lineage, new current→next numbers),
   * and a doctrine card gains its REPLACES line the moment the rival is fitted.
   * Comparing the copy itself is both cheapest and impossible to under-specify.
   */
  private render(view: OfferView): void {
    this.ensurePanel();
    const sig = `${view.pts}|${view.options.map(cardSignature).join(',')}|${view.locked ? 1 : 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.renderPips(view.pts);
    // The dashed ghost edge stands behind the row for the offers still queued.
    this.ghostEl!.style.display = view.pts > 1 ? 'block' : 'none';
    const row = this.rowEl!;
    row.replaceChildren(this.ghostEl!);
    // Locked (a spend is in flight — see OfferView.locked) dims/inerts every
    // card so a second click/digit can't fire against the offer this frame is
    // displaying. Digit glyphs 1..N map row-for-row, left to right.
    this.cards = view.options.map((card, i) => this.makeCard(card, i, !view.locked));
    for (const c of this.cards) row.appendChild(c.root);
    this.deniedCard = -1; // a fresh row never inherits the last row's pulse
  }

  /** Position the band from the pure layout (never from CSS guesses). */
  private place(): void {
    const layout = refitBandLayout(window.innerWidth, window.innerHeight);
    this.ensurePanel().style.top = `${layout.band.y}px`;
  }

  /** TAB toggle: open with this view, or close if already open. */
  toggle(view: OfferView): void {
    if (this.shown) {
      this.hide();
      return;
    }
    this.render(view);
    this.place();
    this.ensurePanel().style.display = 'flex';
    this.shown = true;
  }

  /**
   * Per-frame refresh: null force-hides (the last level was spent, or spectate);
   * a fresh view live-swaps the cards to the next queued offer IN PLACE (the
   * stay-open path), but never OPENS a closed window (only the TAB toggle does).
   */
  update(view: OfferView | null): void {
    if (!view) {
      this.hide();
      return;
    }
    if (!this.shown) return;
    this.render(view);
    this.place(); // follow viewport resizes while open
  }

  /**
   * A spend was REJECTED (or timed out): fire the ratified 80ms denied edge
   * pulse on the card the player picked. Rate-limited to one flash per 300ms
   * from this source (the deniedFire grammar) and motion-scaled — at
   * motion=off the pulse is suppressed entirely, and the information still
   * lands through the card re-enabling with the level still banked (the pips
   * never dropped), so nothing is carried by the flash alone.
   *
   * A HIDDEN band never pulses. The latch outlives the window (a TAB close, or
   * the you-gone update(null), can land between the pick and the timeout), and
   * painting a hidden panel would both do nothing visible AND burn the 300ms
   * same-source floor — so the next genuinely visible denial would be swallowed.
   * main.ts guards the call site too; this is the structural half.
   */
  pulseDenied(choice: number, nowMs = performance.now()): void {
    if (!this.shown) return;
    if (motionIntensity(settings.current.motion) <= 0) return;
    if (nowMs - this.deniedLastAt < R.deniedFloorMs) return;
    const card = this.cards[choice];
    if (!card) return;
    this.deniedLastAt = nowMs;
    this.deniedCard = choice;
    this.deniedUntil = nowMs + R.deniedPulseMs;
    card.root.style.borderColor = DENIED;
    card.root.style.boxShadow = `0 0 8px ${DENIED}`;
    setTimeout(() => this.clearDenied(choice), R.deniedPulseMs);
  }

  /** Drop the denied edge back to rest, unless a newer pulse took it over. */
  private clearDenied(choice: number): void {
    if (this.deniedCard !== choice) return;
    this.deniedCard = -1;
    this.deniedUntil = -Infinity;
    const card = this.cards[choice];
    if (card) paintCard(card, false);
  }

  /** True while the denied pulse is lit (test/observation seam). */
  deniedActive(nowMs = performance.now()): boolean {
    return this.deniedCard >= 0 && nowMs < this.deniedUntil;
  }

  /** Close the band and DROP the whole denied register with it: a reopened band
   *  must never inherit a lit edge, a pending clear, or a consumed same-source
   *  floor from the window the player just closed. */
  hide(): void {
    if (this.panel) this.panel.style.display = 'none';
    this.shown = false;
    // Repaint (not just forget) any lit edge: the cards outlive the close (a
    // reopen with an unchanged view signature reuses the very same buttons), so
    // dropping the bookkeeping alone would strand a denied border lit forever —
    // the in-flight clearDenied timeout no-ops once the register is cleared.
    if (this.deniedCard >= 0) this.clearDenied(this.deniedCard);
    this.deniedLastAt = -Infinity; // the floor dies with the window
  }
}
