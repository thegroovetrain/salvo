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
// THE DAMAGE CONTROL RAIL (cycle 46) hangs one seam BELOW the row: the
// always-available heal spend, addressed by the reserved negative wire sentinel
// HEAL_CHOICE (-1) and picked with [5] or a click. It is deliberately NOT a
// fifth card — a five-card row is 1160px, which leaves 60px of margin at the
// 1280×614 logical floor and would supersede the ratified UX-DR14 geometry — and
// it is never drawn, never exhausted, and never in `OwnShip.offer`. The cards,
// the gaps, the 924px row and `CONFIG.offer.size` are untouched by it.
//
// z-index sits at 1000 — below the pre-join menu (1100) and settings (1050) and
// above the toast stacks (900). Nothing rides on that last relation visually:
// toasts stack TOP-CENTER and the band sits BELOW-CENTER, so the two never
// overlap and neither can hide the other. The 1000 simply keeps the band on the
// same DOM-chrome scale as everything else (modals above it, feed chrome below).

import {
  CATALOG,
  CONFIG,
  HEAL_CHOICE,
  boonStackCount,
  canStock,
  effectiveStats,
  isConsumableId,
  resolveCards,
  type CatalogLine,
  type OwnShip,
  type SlotItemId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { motionIntensity, settings } from '../settings/store.js';
import { FLASH_ELEMENTS, type FlashBudget } from '../render/flashBudget.js';
import { hudBarLayout } from '../render/hudBar.js';
import { UI_SCALE_VAR } from './theme.js';
import {
  FOOT_BOX_PAD,
  FOOT_BOX_GROWTH,
  MICRO_VAR,
  REFIT_TYPE,
  cardNameSize,
  cardNameTracking,
  domMicroScale,
} from './refitCardFit.js';
import { equipmentGlyphSvg } from '../render/equipmentIcons.js';
import {
  REFIT_TIP,
  refitTooltipLeft,
  refitTooltipMaxPanelH,
  refitTooltipMetrics,
  refitTooltipModel,
  type RefitTooltipModel,
} from './refitTooltip.js';
import {
  TIER_ARROW,
  boonKindLabel,
  boonName,
  boonTooltipText,
  cardStatRows,
  cardTierLabel,
  cardTierSteps,
  type CardStatRow,
  type CardTierStep,
} from './boonCopy.js';

const PANEL_ID = 'upgrade-menu';
/** The DAMAGE CONTROL rail's element id — a stable handle for the band's one
 *  permanent control (the cards are rebuilt per offer; this never is). */
const STRIP_ID = 'refit-damage-control';
/** The hover tooltip's element id (R2.17) — the band's other permanent, never
 *  rebuilt child, so tests and future callers have a stable handle. */
const TIP_ID = 'refit-card-tooltip';
/** The rail's key hint. Digit 5 sits immediately after the four card digits,
 *  and input/keyboard.ts maps BOTH Digit5 and Numpad5 to HEAL_CHOICE. */
const STRIP_KEY_GLYPH = '5';
const R = CLIENT_CONFIG.refit;
/** The card's text metrics — letter-spacings, line-heights and the row gap. The
 *  CSS below INTERPOLATES these, and ui/refitCardFit.ts measures with the very
 *  same numbers, so the container-fit model can never drift from the render
 *  (amendment 47). Every card text row declares an EXPLICIT line-height for the
 *  same reason: `normal` is a font metric no pure model could know. */
const T = REFIT_TYPE;
// Story 2.3 (amendment 17): the card's resting state is bright white content,
// not grey — armed (hover/focus) flips it to amber.
const REST = 'var(--hc-text-primary)';
const AMBER = 'var(--hc-amber)';
const PHOSPHOR = 'var(--hc-phosphor)';
const DENIED = 'var(--hc-denied)';
const HAIRLINE = 'var(--hc-hairline)';
/** The mock's `--t3` (muted text): the in-row arrow, the tier arrow, and the
 *  greyed key chip's dashed edge. */
const MUTED = 'var(--hc-text-muted)';
/** The greyed foot's word — `silver` at FULL alpha, so the reason still reads
 *  through the card's own dim (mock `.rc.grey .foot`). */
const SILVER = 'var(--hc-silver)';
/**
 * THE META ROW IS NEUTRAL (Eric ruling 2026-09-15, amendment 8). The v2 RARE /
 * EXCLUSIVE tag colours are DELETED with the rarity axis itself: catalog v3 has
 * no tier to colour, and the interim meta row carries the line's KIND word and
 * its copy count, both in the shipped secondary-text token. Stories 8.6/8.7 own
 * the real card faces — nothing here anticipates them with a colour ramp.
 */
const META = 'var(--hc-text-secondary)';
/** The slot tooltip's ratified surface, reused verbatim for the refit card's
 *  hover panel (DESIGN.md `components.slot-tooltip`): the `panel` bed at .97 and
 *  a `silver` edge at .4. Composed from the TOKENS through `cssRgba` rather than
 *  written as literals — a raw color literal outside config.ts fails the
 *  token guard scan, and the alpha is the only part DESIGN.md states inline. */
const TIP_BED = cssRgba(CLIENT_CONFIG.colors.panel, 0.97);
const TIP_EDGE = cssRgba(CLIENT_CONFIG.colors.silver, 0.4);

/**
 * THE LADDER-POSITION RAMP (Eric ruling 2026-08-19: *"The cards with many copies
 * can use a colour to designate which number in the sequence it is, if you want…
 * I'm pretty flexible here, I just want it to be easy to read."*).
 *
 * The rung a card sits at rides the LINEAGE handrail's phosphor INTENSITY —
 * dimmest at the ladder's first rung, full phosphor at its last — which is
 * DESIGN.md's own ratified intensity grammar (Listening Ring: *"pure intensity
 * grammar: more/closer = brighter"*) applied to the one mark on the card whose
 * whole job is saying where in a line this card sits.
 *
 * WHY NOT A HUE RAMP. DESIGN.md's palette leaves no free ordinal hue: amber is
 * the armed state, denied red is the refusal pulse, `info` is already the RARE
 * tag, `storm-readout` the EXCLUSIVE tag and purple is storm-only forever, the
 * blip decay ramp is explicitly *"Never: anything else"*, and the standing rule
 * is *"keep all HUD chrome phosphor-functional"*. So the compliant colour
 * channel for five ordered steps is phosphor's own brightness, and inventing a
 * token would be exactly the deviation the project forbids.
 *
 * DUAL-CODED, per the Do's and Don'ts. The Roman numeral the ramp tints ("III/V")
 * states the same fact in TEXT, and the ladder name states it a third time
 * ("MINES III") — so the colour is a fast read, never the only read.
 *
 * THE RAMP IS THE LOOT-TIER CONVENTION (Eric ruling 2026-08-19), superseding an
 * earlier intensity ramp: *"These are cards and the meaning of colors can be
 * different from colors on the map. Don't a lot of games use colors like...
 * Green -> Blue -> Purple -> Red -> Gold for tier/rarity and such?"* They do,
 * and a player decodes it with no legend.
 *
 * The earlier ramp declined hue because DESIGN.md reserves every tactical hue —
 * but those reservations govern THE WATER, where misreading amber-as-armed or
 * red-as-denied gets you sunk. A refit card is chrome in a modal, a different
 * surface with its own vocabulary. Nothing is invented: the five rungs ARE the
 * ratified palette, which already happens to be exactly that ladder — phosphor
 * (green), info (blue), storm-readout (purple), denied (red), amber (gold).
 * Values live in DESIGN.md; naming them here would trip the token guard, which
 * scans comments too — deliberately, so a literal cannot hide in prose.
 *
 * ABSOLUTE, not normalised: rung II is blue on a 2-copy line and on a 5-copy
 * one. A short ladder simply never reaches gold, which is honest — it has no
 * capstone rung to reach. (Normalising so every line's last copy is gold was
 * the alternative; it would make the colour mean "progress" rather than "tier",
 * and the numeral already carries progress as "II/V".)
 *
 * KNOWN OVERLAP, flagged rather than hidden: `denied` and `amber` also carry
 * refusal and armed state ON THIS SAME SURFACE. The numeral is a small mono
 * glyph and the card's own state rides its border and glow, so they do not
 * compete for the same pixels — but if rung IV ever reads as "this card is
 * refused", that is the thing to change.
 */
export const LINEAGE_TIERS: readonly string[] = [
  'var(--hc-phosphor)', // I   — green
  'var(--hc-info)', // II  — blue
  'var(--hc-storm-readout)', // III — purple
  'var(--hc-denied)', // IV  — red
  'var(--hc-amber)', // V   — gold
];

export function lineageTint(stack: number, copies: number): string {
  if (copies <= 1) return LINEAGE_TIERS[0];
  const pos = Math.min(copies, Math.max(1, Math.trunc(stack) + 1));
  return LINEAGE_TIERS[Math.min(LINEAGE_TIERS.length, pos) - 1];
}

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
  /**
   * THE DAMAGE CONTROL RAIL (cycle 46): the always-present heal spend, one
   * `stripGap` seam BELOW the row and exactly as wide as it. It is NOT a card
   * — `cards` and `row` are byte-identical with or without it, which is the
   * property the geometry suite pins.
   */
  strip: RefitBox;
  /** The whole band (pips + row + rail). Its BOTTOM edge is the anchored one:
   *  `barGap` above the HUD bar's top (epic-8 amendment 36). */
  band: RefitBox;
}

/** The band's card count — the ratified four (UX-DR14), DERIVED from the wire
 *  contract (`CONFIG.offer.size`) rather than re-stated as a literal, so the
 *  laid-out slot count and the server's offer size can never drift apart.
 *  Layout is fixed at this width regardless of how many cards a given offer
 *  actually carries. */
const CARD_SLOTS = CONFIG.offer.size;

/**
 * Pure: the band laid out for a LOGICAL viewport — the same units the HUD bar
 * is laid out in (`hudBarLayout`), i.e. screen px ÷ the UI-scale factor.
 *
 * EPIC-8 AMENDMENT 36 (Eric, 2026-09-17) replaced the old viewport-fraction
 * anchor (`bandTopFrac`) with UX-DR53's placement rule: the band's LOWEST edge
 * — the DAMAGE CONTROL strip's bottom while that strip exists, the card row's
 * bottom after Story 8.8 removes it — sits `barGap` (8px) above the HUD bar's
 * top edge. The below-centre own-hull keep-out is WAIVED by the same ruling, so
 * the band's top may now climb above the screen centre. Laying out in the bar's
 * own units is what retires the physical-anchor / CSS-scale mismatch the
 * cycle-47 review ledgered: see `place()`.
 *
 * The row is a FIXED 924px (four 216s + three 20s) and is horizontally CENTERED,
 * deliberately independent of the offer's actual length: slot k always occupies
 * the same box, so a short offer (a small catalog) leaves a gap rather than
 * re-centering the digits under the player. It NEVER wraps and never re-flows —
 * at a viewport too narrow to hold 924 the row would clip, which is why the
 * layout tests pin both ratified floors (1366×768 at 100%, and the 1280×614
 * logical floor of the ≥1600px-gated 125% tier).
 */
export function refitBandLayout(screenW: number, screenH: number, cards = CARD_SLOTS): RefitBandLayout {
  const rowW = cards * R.card + (cards - 1) * R.gap;
  const x = Math.round((screenW - rowW) / 2);
  // Top-down: pips, card row, seam, DAMAGE CONTROL strip — and the whole stack
  // hangs from its BOTTOM, `barGap` clear of the bar.
  const bandH = R.pipsAbove + R.cardHeight + R.stripGap + R.stripHeight;
  const bandY = hudBarLayout(screenW, screenH).bar.y - R.barGap - bandH;
  const y = bandY + R.pipsAbove;
  const row = { x, y, w: rowW, h: R.cardHeight };
  const pips = { x, y: bandY, w: rowW, h: R.pip };
  const strip = { x, y: row.y + row.h + R.stripGap, w: rowW, h: R.stripHeight };
  return {
    row,
    cards: Array.from({ length: cards }, (_, i) => ({
      x: x + i * (R.card + R.gap),
      y,
      w: R.card,
      h: R.cardHeight,
    })),
    pips,
    strip,
    band: { x, y: bandY, w: rowW, h: bandH },
  };
}

/**
 * The live UI-scale FACTOR, read back from the custom property `ui/theme.ts`
 * writes (`setUiScaleVar(scaleFactor(effectiveScale(...)))`). Read rather than
 * recomputed on purpose: the tier logic — including the width gate that can
 * demote a stored 125% — lives in ONE place (`settings/store.ts`), and the var
 * is what the panel's own `scale()` actually uses, so the anchor and the
 * contents cannot disagree. Absent or malformed (a test DOM, an early frame)
 * reads as 1, which is exactly what the CSS fallback renders at.
 */
function uiScaleFactor(root: HTMLElement = document.documentElement): number {
  const raw = Number.parseFloat(root.style.getPropertyValue(UI_SCALE_VAR));
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Where the hover tooltip opens, and the cap it opens under. */
export interface RefitTipPlacement {
  /** true = the ratified placement, bottom edge `gap` above the band's top.
   *  false = opening DOWNWARD from the band's top edge, over the card row. */
  above: boolean;
  /** The panel's rendered height (px) — independent of which way it opens. */
  height: number;
  /** The CSS `max-height` cap (px) at this placement. */
  maxH: number;
}

/**
 * Pure: which way the hover tooltip opens (EPIC-8 AMENDMENT 37, Eric
 * 2026-09-17).
 *
 * Amendment 36 hung the band off the HUD bar, which at short viewports leaves
 * far less clear water above it than the tallest catalog explanation needs —
 * 130px against 261px at the 1280×614 logical floor. Rather than clip the copy
 * (information lost) or pull Story 8.7's 236px re-cut forward, the panel FLIPS:
 * it opens above the band whenever it fits there, exactly as before, and
 * otherwise opens from the band's TOP EDGE downward, covering part of the card
 * row it describes.
 *
 * The downward cap is the band's OWN height, which is what keeps the ruling's
 * other half — never over the bar. The band's bottom edge is `barGap` above the
 * bar by construction, so a panel that cannot outgrow the band cannot reach it.
 * Nothing in the shipped catalog comes close (261 of 300), so `overflow:hidden`
 * stays what it has always been: belt and braces, never the fix.
 */
export function refitTooltipPlacement(model: RefitTooltipModel, band: RefitBox): RefitTipPlacement {
  const water = refitTooltipMaxPanelH(band.y);
  const height = refitTooltipMetrics(model, water).height;
  return height <= water
    ? { above: true, height, maxH: water }
    : { above: false, height, maxH: band.h };
}

// --- pure core: the spend view -------------------------------------------------

/**
 * One resolved card, as the RATIFIED FACE renders it (Story 8.7, ruling 11 —
 * `hud-composite-3.html` `.rc`): an icon box, the line's name, the cap-rung
 * ladder with its `cur → next` numerals, the KIND word, up to five stat rows
 * and a foot. NO description span, NO lineage handrail, NO copy count — those
 * three fields went with the interim face they belonged to.
 */
export interface OfferCard {
  id: string;
  /** The KIND word (WEAPON / UPGRADE / ADD-ON / CONSUMABLE) — the mock's `.ck`,
   *  and the a11y channel that carries what colour no longer does. */
  kind: string;
  /** The line's name, uppercase (the face's one display-face mark). */
  name: string;
  /** The `cur → next` tier numerals, or null for a line with no ladder (a
   *  consumable or an add-on), whose ladder row renders EMPTY but still 16px
   *  tall so every card in the row keeps one baseline. */
  tier: string | null;
  /** The same step as NUMBERS, so each numeral can be tinted on the absolute
   *  ladder ramp without re-parsing "III → IV" back apart. Null with `tier`. */
  tierStep: CardTierStep | null;
  /** Up to five live stat rows (ruling 12). Fewer is normal; an add-on has
   *  none at all and its five rows render blank. */
  rows: readonly CardStatRow[];
  /** The HOVER-ONLY explanation (R2.17) — what the card actually does, in plain
   *  terms. Never rendered on the face; the band's hover panel shows it. */
  tooltip: string;
  /**
   * THE REFUSAL (Story 8.7, ruling 10). A consumable the belt cannot take —
   * four distinct lines already stocked and this is a fifth — is greyed BEFORE
   * the press: `SLOTS FULL` in the foot, a dashed key chip, the face at
   * `greyedAlpha`, and its digit and its click both send nothing. The predicate
   * is the SHARED `canStock`, over the same replayed slot ids the server folds,
   * so the client cannot grey a card the server would have taken (or take one
   * the server would refuse).
   */
  greyed: boolean;
  /** How many of this line the player already holds, and how many the line has
   *  in total — the ladder's rung count and its filled prefix. */
  stack: number;
  cap: number;
}

/** The foot's one word today: the belt is full and this consumable has nowhere
 *  to go. Ratified copy (UX-DR52) — the card's non-colour refusal channel. */
export const SLOTS_FULL = 'SLOTS FULL';

// --- pure core: the DAMAGE CONTROL rail ----------------------------------------

/**
 * The rail's two states, DUAL-CODED so nothing rides on hue (DESIGN.md · Do's
 * and Don'ts):
 *   • 'armed' — a damaged, living hull: live edge, hoverable/focusable,
 *     amber-on-armed exactly like a card, and NO status word;
 *   • 'inert' — the server would reject this pick (full hp, or a sunk hull) or
 *     a spend is already in flight: the rail dims to `lockedAlpha`, goes
 *     genuinely `disabled` (keyboard and AT see it, not just the eye), and — for
 *     the two REJECTION cases — prints the reason as a word. The word is the
 *     non-color channel; the dim alone would be hue/lightness only.
 */
export type HealArm = 'armed' | 'inert';

export interface HealView {
  state: HealArm;
  /** The dual-coding reason word; '' while armed (the absence IS the state). */
  status: string;
  /** 'DAMAGE CONTROL' — deliberately NOT "repair/patch HULL": `hull` is the
   *  +maxHp `shipHull` ladder's vocabulary and must not be echoed here. */
  label: string;
  /** The amounts, printed from CONFIG.damageControl — never hardcoded, so a
   *  retune of the ruling moves the rail's own copy with it. */
  readout: string;
}

export const HEAL_LABEL = 'DAMAGE CONTROL';
/** Rejection reasons — the two fail-closed guards the server itself applies. */
export const HEAL_STATUS_FULL = 'AT FULL HP';
export const HEAL_STATUS_SUNK = 'SUNK';

/** Pure: the rail's amounts line, straight off the shared config. Cycle 47 moved
 *  the voice from a bare stat line (`+25 HP NOW · +25 HP OVER 5S`) to a sentence
 *  at Eric's direction — *"Restores 25 HP now and 25 HP/5s or something"* — the
 *  same instinct as the rail's resize: say plainly what pressing it does. The
 *  numbers are still composed from CONFIG.damageControl and never hardcoded, so
 *  a retune of the ruling keeps moving the copy with it. */
export function healReadout(): string {
  const dc = CONFIG.damageControl;
  const secs = dc.regenMs / 1000;
  const s = Number.isInteger(secs) ? `${secs}` : secs.toFixed(1);
  return `RESTORES ${dc.instantHp} HP NOW AND ${dc.regenHp} HP OVER ${s}S`;
}

/**
 * Pure: the own hull's max HP, through the ONE derivation path — the shared
 * `effectiveStats()` desync firewall, fed by (class + fitted boons), exactly
 * as the HUD's HP rail and the cards' preview diffs already do it. Nothing here
 * re-derives, hardcodes, or reads a class table ad hoc.
 */
function ownMaxHp(you: Pick<OwnShip, 'cls' | 'cards'>): number | null {
  // FAIL-OPEN on the class table (cycle 91), null = "cannot judge". An
  // unresolvable `cls` would hand `effectiveStats` an undefined spec and throw
  // on `cls.kinematics`, from a render path, which until this cycle meant a
  // permanent freeze. Null rather than a number because the ONE caller asks
  // "is the hull already full?" — and answering a fabricated "yes" would deny a
  // player a heal they need, which is strictly worse than offering a redundant
  // one. So an unknown hull leaves the rail armed.
  if (!Object.hasOwn(CONFIG.shipClasses, you.cls)) return null;
  return effectiveStats(CONFIG.shipClasses[you.cls], you.cards).maxHp;
}

/**
 * Pure: the rail's state for this frame. The two INERT cases mirror the
 * server's fail-closed heal guard exactly (dead hull, or `hp >= maxHp`), which
 * is what makes the affordance honest rather than decorative — a rail the
 * player can press is a rail the server will honor. `locked` (a spend already
 * in flight) inerts it too, for the same reason the cards dim: a second pick
 * inside one server-tick+RTT would reference an offer the FIFO has moved on
 * from. It carries no reason word, being transient rather than a refusal.
 */
export function healView(you: OwnShip | null | undefined, locked: boolean): HealView {
  const copy = { label: HEAL_LABEL, readout: healReadout() };
  if (!you || !you.alive) return { ...copy, state: 'inert', status: HEAL_STATUS_SUNK };
  const maxHp = ownMaxHp(you); // null = unresolvable hull; never claim FULL on a guess
  if (maxHp !== null && you.hp >= maxHp) return { ...copy, state: 'inert', status: HEAL_STATUS_FULL };
  if (locked) return { ...copy, state: 'inert', status: '' };
  return { ...copy, state: 'armed', status: '' };
}

/** The rail's render memo key — every mark it actually paints. */
function healSignature(heal: HealView): string {
  return `${heal.state}|${heal.status}|${heal.label}|${heal.readout}`;
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
  /** The DAMAGE CONTROL rail's state (cycle 46) — a SIBLING of `options`,
   *  never a member of it: the rail is never drawn, never exhausted, and never
   *  appears in `OwnShip.offer`. */
  heal: HealView;
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
export function offerView(
  you: OwnShip | null,
  spectating: boolean,
  locked: boolean,
  sinking: boolean,
  ownSlots: readonly (SlotItemId | null)[] = [],
): OfferView | null {
  // ONCE SINKING, YOU'RE DONE (Story 5.2, amendment 10). A sinking hull keeps
  // every weapon, every ability and the foghorn — what it loses is the ECONOMY:
  // the refit window, the picks and the DAMAGE CONTROL heal.
  //
  // IT MUST BE ITS OWN FLAG, and neither of the two nearby shortcuts works:
  // `!you.alive` would also close the band for a WRECK AWAITING RESPAWN in the
  // waiting phase, which is deliberately open (builds persist across respawns,
  // and `spectates()` keeps that observer fogged and non-spectating precisely
  // so it stays open); and `spectating` is false for the whole window by
  // design. So the third state arrives here the same way it arrives everywhere
  // else — as an explicit caller-supplied fact, exactly like `spectating`
  // beside it. With the whole view null the band auto-hides, TAB opens nothing
  // and every digit pick falls through main.ts's own guard; `healView` below
  // separately inerts the DAMAGE CONTROL rail on its own `!alive` clause.
  if (!you || spectating || sinking || you.pts === 0 || you.offer.length === 0) return null;
  const lines = resolveCards(you.offer, CATALOG);
  if (lines.length !== you.offer.length) return null; // fail-closed: row k == server slot k
  return {
    pts: you.pts,
    options: lines.map((line) => toCard(line, you, ownSlots)),
    locked,
    heal: healView(you, locked),
  };
}

/**
 * Pure: is this offered line REFUSED by the belt (ruling 10)? Only a consumable
 * can be — every other kind lands on the hull or on a weapon slot, neither of
 * which can be full — and the answer comes from the SHARED `canStock` over the
 * replayed slot ids, which is byte-for-byte what `world.spendCard` evaluates
 * before it mutates anything. Two evaluations of one function, so the greyed
 * face and the server's refusal can never disagree.
 */
export function cardGreyed(line: CatalogLine, ownSlots: readonly (SlotItemId | null)[]): boolean {
  if (line.kind !== 'consumable' || !isConsumableId(line.id)) return false;
  return !canStock(ownSlots, line.id);
}

/**
 * One catalog def + the copy the card face carries, resolved against the
 * PLAYER'S OWN STATE (Story 2.8): the ladder name and the lineage marker depend
 * on how many of that line they already hold, the doctrine-swap line on whether
 * they hold the rival, and the rules text on their whole fitted build (a live
 * effectiveStats preview diff). Everything here is pure — `you` is read, never
 * touched.
 */
function toCard(line: CatalogLine, you: OwnShip, ownSlots: readonly (SlotItemId | null)[]): OfferCard {
  const stack = boonStackCount(you.cards, line.id);
  return {
    id: line.id,
    kind: boonKindLabel(line.kind),
    name: boonName(line.id, stack),
    tier: cardTierLabel(line, stack),
    tierStep: cardTierSteps(line, stack),
    rows: cardStatRows(line, stack, you),
    tooltip: boonTooltipText(line.id),
    greyed: cardGreyed(line, ownSlots),
    stack,
    cap: line.cap,
  };
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

// The panel carries NO flex `gap`: the pips sit `pipsAbove` over the row and
// the DAMAGE CONTROL rail sits `stripGap` under it — two different seams, so
// each child owns its own margin and the DOM matches refitBandLayout() exactly.
const PANEL_CSS = [
  'position:fixed',
  'left:50%',
  'display:none', // toggled to 'flex' when shown
  'flex-direction:column',
  'align-items:flex-start',
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
const PIPS_CSS = [
  'display:flex',
  'flex-direction:row',
  `gap:${R.pipGap}px`,
  'align-items:center',
  `margin-bottom:${R.pipsAbove - R.pip}px`,
].join(';');

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

/**
 * One card — the mock's `.rc` VERBATIM (epic-8 amendment 31): a fixed 216×226
 * box, square corners, a silver hairline edge over the panel bed, asymmetric
 * `10px 12px 8px` padding, and a CENTRED column. The card keeps `overflow`
 * visible because the digit key chip deliberately overhangs its top-left
 * corner; the clip lives one level in, on the body (below).
 *
 * TEXT IS CENTRED NOW, not left-aligned: every mark on the ratified face is a
 * single `nowrap` line whose width is data-driven, and a centred column is what
 * makes four cards of different name lengths read as one row.
 */
const CARD_CSS = [
  'position:relative',
  `width:${R.card}px`,
  `height:${R.cardHeight}px`,
  `padding:${R.pad.top}px ${R.pad.side}px ${R.pad.bottom}px`,
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0', // square corners (DESIGN.md CIC chrome)
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'text-align:center',
  'cursor:pointer',
  'pointer-events:auto',
  'flex:none',
].join(';');

/**
 * The card BODY — every mark below the key chip, clipped to the card's inner box.
 *
 * `overflow:hidden` here is the amendment-47 BELT AND BRACES, not the fix: the
 * fix is the type/width budget that ui/refitCardFit.ts models and
 * __tests__/refitCardFit.test.ts pins, so no card ever WANTS to paint outside
 * this box. The clip is what guarantees an unforeseen state (a future catalog
 * line, a font fallback wider than the model's 0.605em advance, a browser that
 * rounds line boxes up) still cannot lay text over the neighbouring card or the
 * dimmed corner clusters the band renders above (amendment 40).
 *
 * NO FLEX `gap`: the ratified face declares a DIFFERENT `margin-top` per block
 * (the mock's 4 / 4 / 2 / 6 / 2), so each child owns its own seam and the DOM
 * matches `refitCardMetrics` exactly.
 *
 * `min-height:0` is load-bearing: a flex item's default `min-height:auto` is its
 * CONTENT height, which would let an over-long body stretch the card instead of
 * being clipped by it — the exact failure this guard exists to stop.
 */
const CARD_BODY_CSS = [
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'align-self:stretch',
  'flex:1 1 auto',
  'min-height:0',
  'overflow:hidden',
].join(';');

/** Locked (a spend is in flight): dimmed and inert — no hover, no click. */
const CARD_LOCKED_CSS = `${CARD_CSS};opacity:${R.lockedAlpha};cursor:default`;

// --- THE HOVER TOOLTIP (Story 7-5 wave 2, R2.17) --------------------------------
//
// One panel, built once with the band and re-filled per hover — never one per
// card, so the pointer moving along the row cannot leave a trail of panels.
//
// It hangs off the PANEL rather than the row: the panel's own box starts at the
// queue pips, so `bottom: calc(100% + gap)` pins the tooltip's BOTTOM edge `gap`
// above the band's top edge without anybody having to know the tooltip's height,
// and it grows upward from there into the clear water ui/refitTooltip.ts models.
//
// SINCE AMENDMENT 37 that is one of TWO placements: a panel too tall for the
// water opens DOWNWARD from the same edge (`top: 0`) over the card row instead.
// `showTip` sets whichever applies, so neither edge is declared here.
//
// `pointer-events:none` is load-bearing: the panel overhangs the cards' hover
// targets, and a panel that took the pointer would make its own card's
// `mouseleave` fire and flicker it out from under the cursor.
const TIP_CSS = [
  'position:absolute',
  `width:${REFIT_TIP.width}px`,
  `padding:${REFIT_TIP.pad}px`,
  'box-sizing:border-box',
  `border-width:${REFIT_TIP.border}px`,
  'border-style:solid',
  'border-radius:0', // square corners (DESIGN.md CIC chrome)
  'display:none', // toggled to 'flex' on hover
  'flex-direction:column',
  'align-items:flex-start',
  `gap:${REFIT_TIP.rowGap}px`,
  'text-align:left',
  'pointer-events:none',
  'overflow:hidden', // amendment-47 belt and braces; the fit model is the fix
  'z-index:1',
].join(';');

/** The panel's heading: the ladder name at the hovered card's rung, in the
 *  card's own resting text color (this is the card's name repeated, not a new
 *  register). */
const TIP_NAME_CSS = [
  `font:600 ${REFIT_TIP.nameSize}px var(--hc-font-mono)`,
  `letter-spacing:${REFIT_TIP.nameLetterSpacing}px`,
  `line-height:${REFIT_TIP.nameLineHeight}`,
  `color:${REST}`,
  'overflow-wrap:anywhere',
].join(';');

/** The CONSUMABLE shape line (Story 8.7, ruling 13) — the same grammar the belt's
 *  slot tooltip prints, in the AMBER interaction register that panel uses, so a
 *  player meets one vocabulary for "how does this fire" and not two. */
const TIP_INTERACTION_CSS = [
  `font:400 ${REFIT_TIP.nameSize}px var(--hc-font-mono)`,
  `letter-spacing:${REFIT_TIP.nameLetterSpacing}px`,
  `line-height:${REFIT_TIP.nameLineHeight}`,
  `color:${AMBER}`,
  'overflow-wrap:anywhere',
].join(';');

/** The explanation paragraph — data, so phosphor rather than grey (amendment
 *  16), at the card description's own opacity so the two read as one voice. */
const TIP_BODY_CSS = [
  `font:400 ${REFIT_TIP.bodySize}px var(--hc-font-mono)`,
  `letter-spacing:${REFIT_TIP.bodyLetterSpacing}px`,
  `line-height:${REFIT_TIP.bodyLineHeight}`,
  `color:${PHOSPHOR}`,
  'opacity:0.85',
  'overflow-wrap:anywhere',
].join(';');

/**
 * The mono key-chip glyph — the mock's `.rc .kc.big`: a 22px bordered digit
 * sitting PROUD of the card's top-left corner by 8px (not centred on it, as the
 * interim face had it), on the `void` bed so the card's own edge does not read
 * through it, in 11px mono at the secondary-text token with a silver hairline.
 *
 * It rides its OWN colours rather than `currentColor` because the ratified chip
 * is deliberately quieter than the name beside it; `paintCard` flips the whole
 * chip to amber on arm, exactly as the mock's `.rc.armed .kc.big` does.
 */
const KEY_CHIP_CSS = [
  'position:absolute',
  `left:-${R.keyChipOffset}px`,
  `top:-${R.keyChipOffset}px`,
  `width:${R.keyChip}px`,
  `height:${R.keyChip}px`,
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'border-width:1px',
  'border-style:solid',
  `font:400 ${R.keyChipSize}px var(--hc-font-mono)`,
  'letter-spacing:0',
  'flex:none',
].join(';');

// --- THE DAMAGE CONTROL RAIL (cycle 46) ----------------------------------------
//
// A one-line rail under the row, in the card's own grammar (square corners,
// hairline edge, panel bed, amber-on-armed, 80ms denied edge pulse) — at FULL
// scale since cycle 47, not at "rail scale". It is a real <button>:
// pointer-events live on it, it is keyboard- and AT-reachable, and it goes
// genuinely `disabled` when the server would refuse the pick. Focus hygiene is
// the card's, verbatim (mousedown preventDefault + post-click blur), so a strip
// click can never fire the gun (MouseInput only counts canvas-target clicks)
// and can never retain focus.
const STRIP_CSS = [
  'position:relative',
  `height:${R.stripHeight}px`,
  'align-self:stretch', // the rail is exactly as wide as the ratified row
  `padding:${R.stripPadY}px ${R.stripPad}px`,
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0', // square corners (DESIGN.md CIC chrome)
  'display:flex',
  'flex-direction:row',
  'align-items:center',
  `gap:${R.stripColGap}px`,
  'text-align:left',
  'cursor:pointer',
  'pointer-events:auto',
  'flex:none',
  `margin-top:${R.stripGap}px`,
  'overflow:hidden', // amendment-47 belt and braces; the fit model is the fix
].join(';');

/** The rail's key chip: the ONE mono key-chip family at FAMILY size since cycle
 *  47 — the 40px rail has the room the 16px one did not, so the "proportional
 *  below" carve-out is retired. Rides currentColor, so the rail's rest/armed
 *  state cascades into it. Unlike the card's chip this one sits INSIDE the box
 *  (no corner overhang): the rail is a single flex row, and an overhanging chip
 *  would collide with the card row's bottom edge one `stripGap` above it. */
const STRIP_CHIP_CSS = [
  `width:${R.stripKeyChip}px`,
  `height:${R.stripKeyChip}px`,
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'border:1px solid currentColor',
  `font:400 ${R.stripFontSize}px var(--hc-font-mono)`,
  'flex:none',
].join(';');

/** One rail text column. `white-space:nowrap` is the horizontal half of the
 *  container-fit law here: the rail is ONE line high by construction, so a wrap
 *  would paint outside it rather than growing it. */
const STRIP_TEXT_CSS = [
  `font:400 ${R.stripFontSize}px var(--hc-font-mono)`,
  `letter-spacing:${T.categoryLetterSpacing}px`,
  `line-height:${T.lineHeight}`,
  'text-transform:uppercase',
  'white-space:nowrap',
  'flex:none',
].join(';');

/** The amounts column — data, so phosphor (amendment 16: never grey). */
const STRIP_READOUT_CSS = `${STRIP_TEXT_CSS};color:${PHOSPHOR};opacity:0.85`;

/** The reason word, hard right — the rail's non-color state channel. */
const STRIP_STATUS_CSS = `${STRIP_TEXT_CSS};margin-left:auto;color:${PHOSPHOR};opacity:0.7`;

// --- THE RATIFIED CARD FACE (Story 8.7, ruling 11) -----------------------------
//
// Every declaration below is the mock's `.rc` block read literally
// (`hud-composite-3.html`:160-191, epic-8 amendment 31), with two translations
// and no third:
//
//   • the mock's `em` trackings are resolved to px in REFIT_TYPE, so the fit
//     model and the DOM measure the same numbers;
//   • every colour is a `var(--hc-*)` token, and every ALPHA on a token is
//     composed through `cssRgba` from the numeric token in config.ts — the
//     module's existing pattern (see TIP_BED / TIP_EDGE). `color-mix` is not
//     available to us and a raw literal fails the token guard, which scans
//     comments too.

/** The icon box's edge — the mock's `silver` hairline at .28 — and the same
 *  silver at .4 for the key chip's. */
const ICON_EDGE = cssRgba(CLIENT_CONFIG.colors.silver, 0.28);
const CHIP_EDGE = cssRgba(CLIENT_CONFIG.colors.silver, 0.4);
/** The armed icon box's edge — mock `.rc.armed .ci`, the `amber` token at .6. */
const ICON_EDGE_ARMED = cssRgba(CLIENT_CONFIG.colors.amber, 0.6);
/** A row's bottom hairline — the EXISTING `hairline` token, which IS the colour
 *  the mock writes there, at full weight. No new token (ruling 11). */
const ROW_RULE = cssRgba(CLIENT_CONFIG.colors.hairline, 0.95);
/** The greyed foot's box — `1px` `textSecondary` at .5 (mock `.rc.grey .foot`). */
const FOOT_BOX_EDGE = cssRgba(CLIENT_CONFIG.colors.textSecondary, 0.5);
/** An unreached rung — mock `.ladder i.off { opacity:.35 }`. */
const RUNG_OFF_ALPHA = 0.35;
/** The NEXT rung's glow radius (px) — mock `box-shadow: 0 0 8px`. */
const RUNG_GLOW_PX = 8;

/** The icon box — mock `.ci`: a 40px square with a silver hairline, holding a
 *  24px glyph in phosphor. EMPTY for every line with no linework (ruling 11). */
const ICON_BOX_CSS = [
  `width:${R.iconBox}px`,
  `height:${R.iconBox}px`,
  'flex:none',
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  `color:${PHOSPHOR}`,
].join(';');

/**
 * The line NAME — mock `.cn { font: 600 15px/1.15 var(--sans) }`, uppercase,
 * `.02em`, and `nowrap`.
 *
 * SANS, NOT MONO: this is the one display-face mark on the card, and it is the
 * mark the eye lands on first. The SIZE is decided per name by
 * `refitCardFit.cardNameSize` (the mock's own `.cn.long` 12.5px step), so the
 * declaration below carries everything except the size and its tracking.
 */
const NAME_CSS = [
  `color:${REST}`,
  `line-height:${T.nameLineHeight}`,
  'text-transform:uppercase',
  'white-space:nowrap',
  `margin-top:${T.nameGap}px`,
].join(';');

/** The KIND word — mock `.ck { font: 10px var(--mono); letter-spacing:.2em }`. */
const KIND_CSS = [
  `font:400 ${R.kindSize}px var(--hc-font-mono)`,
  `letter-spacing:${T.kindLetterSpacing}px`,
  `line-height:${T.lineHeight}`,
  'text-transform:uppercase',
  `color:${META}`,
  'white-space:nowrap',
  `margin-top:${T.kindGap}px`,
].join(';');

/** The LADDER row — mock `.ladder`: a fixed 16px row of `cap` rungs with the
 *  `cur → next` numerals beside them. Rendered EMPTY (but still 16px) for a
 *  consumable or an add-on, so every card in the row keeps one baseline. */
const LADDER_CSS = [
  `height:${R.ladderH}px`,
  `margin-top:${T.ladderGap}px`,
  'display:flex',
  `gap:${R.ladderGap}px`,
  'align-items:center',
  'justify-content:center',
  'flex:none',
].join(';');

/** One rung — mock `.ladder i { width:14px; height:7px; border:1px solid }`,
 *  coloured by its ABSOLUTE position on the loot-tier ramp. */
const RUNG_CSS = [
  `width:${R.rungW}px`,
  `height:${R.rungH}px`,
  'box-sizing:border-box',
  'border-width:1px',
  'border-style:solid',
  'border-radius:0',
  'display:block',
  'flex:none',
].join(';');

/** The `cur → next` numerals — mock `.tl { font: 600 12px mono; .14em }`. */
const TIER_LABEL_CSS = [
  `font:600 ${R.tierSize}px var(--hc-font-mono)`,
  `letter-spacing:${T.tierLetterSpacing}px`,
  `margin-left:${T.tierGap}px`,
  'white-space:nowrap',
].join(';');

/** The arrow between the numerals — mock `.rc .arr { color: var(--t3) }`. */
const TIER_ARROW_CSS = [`color:${MUTED}`, 'font-weight:400', `margin:0 ${T.arrowMargin - 1}px`].join(';');

/** The five-row grid — mock `.rows { display:grid; grid-template-rows: repeat(5,17px) }`. */
const ROWS_CSS = [
  'width:100%',
  `margin-top:${T.rowsGap}px`,
  'display:grid',
  `grid-template-rows:repeat(${R.rowCount}, ${R.rowH}px)`,
  'flex:none',
].join(';');

/** One row — mock `.rw`: label hard left, value hard right, a hairline under. */
const ROW_CSS_LINE = [
  'display:flex',
  'justify-content:space-between',
  'align-items:baseline',
  'border-bottom-width:1px',
  'border-bottom-style:solid',
  `padding:0 ${T.rowPadX}px`,
  'overflow:hidden',
].join(';');

// THE TWO FLOOR-SEATED REGISTERS (epic-8 amendment 43, Eric 2026-09-17: "Text
// *MUST* be readable"). The band scales as ONE block, so a 9px mark drew at
// 8.1px at the 90% tier. Both marks below divide their size AND their tracking
// by `--hc-micro` — the DOM twin of the bar's Pixi counter-scale, published on
// the band's root by `place()` — so the rendered glyph never goes under the
// floor. LONGHANDS, not the `font:` shorthand, for the same reason as the
// borders above — a `var()` inside a shorthand is a whole-declaration gamble on
// the parser — and because the shorthand would reset `line-height` to `normal`,
// which is a font metric no pure model can know: the explicit 1.2 is what makes
// refitCardFit's box arithmetic the render rather than a guess.
// Nothing else on the card references the property: every other register is
// already above the floor and rides the geometry (amendment 31's mock literal).
const MICRO_SIZE = (px: number): string => `calc(${px}px * var(${MICRO_VAR}, 1))`;

/** A row's LABEL — mock `.rw .l { font: 9px mono; .14em }`, counter-scaled. */
const ROW_LABEL_CSS = [
  'font-weight:400',
  `font-size:${MICRO_SIZE(R.labelSize)}`,
  'font-family:var(--hc-font-mono)',
  `line-height:${T.lineHeight}`,
  `letter-spacing:${MICRO_SIZE(T.labelLetterSpacing)}`,
  'text-transform:uppercase',
  `color:${META}`,
  'white-space:nowrap',
].join(';');

/** A row's VALUE — mock `.rw .v { font: 11px mono; .04em; tabular }`. */
const ROW_VALUE_CSS = [
  `font:400 ${R.valueSize}px var(--hc-font-mono)`,
  `letter-spacing:${T.valueLetterSpacing}px`,
  `color:${REST}`,
  'font-variant-numeric:tabular-nums',
  'white-space:nowrap',
].join(';');

/** The NEXT value inside that cell — mock `.rw .v .nx { color: var(--ph) }`. */
const ROW_NEXT_CSS = `color:${PHOSPHOR}`;
/** The in-row arrow — mock `.rw .v .ar { color: var(--t3); margin: 0 4px }`. */
const ROW_ARROW_CSS = `color:${MUTED};margin:0 ${T.arrowMargin}px`;

/** The FOOT — mock `.foot`: 14px tall, 9px mono at `.24em`, blank unless the
 *  card is refused. */
const FOOT_CSS = [
  'box-sizing:border-box', // the declared height IS the box (refitCardFit measures it)
  `height:${R.footH}px`,
  `margin-top:${T.footGap}px`,
  'font-weight:600',
  `font-size:${MICRO_SIZE(R.footSize)}`,
  'font-family:var(--hc-font-mono)',
  `line-height:${T.lineHeight}`,
  `letter-spacing:${MICRO_SIZE(T.footLetterSpacing)}`,
  'text-transform:uppercase',
  `color:${META}`,
  'white-space:nowrap',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'flex:none',
].join(';');

/**
 * The armed (hover/focus) treatment — mock `.rc.armed`: amber edge + glow, amber
 * key chip on the void bed, amber name and amber icon box. The KIND word, the
 * rows and the ladder stay put through the arm: they are facts about the card,
 * not states of the pointer.
 */
function paintCard(card: RefitCardEls, armed: boolean): void {
  const c = armed ? AMBER : REST;
  card.root.style.borderColor = armed ? AMBER : HAIRLINE;
  card.root.style.boxShadow = armed ? `0 0 8px ${AMBER}` : 'none';
  card.name.style.color = c;
  card.icon.style.color = c;
  card.icon.style.borderColor = armed ? ICON_EDGE_ARMED : ICON_EDGE;
  card.chip.style.borderColor = armed ? AMBER : card.greyed ? MUTED : CHIP_EDGE;
  card.chip.style.color = armed ? AMBER : card.greyed ? MUTED : META;
  card.kind.style.color = META;
}

/** One plain text line at a prepared style. */
function lineEl(css: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.cssText = css;
  el.textContent = text;
  return el;
}

/** The 40px icon box, holding the line's glyph when one exists. An unbuilt
 *  weapon, a ladder, an add-on and every consumable leave it EMPTY — no
 *  placeholder, no word, no invented art (ruling 11). */
function iconBoxEl(id: string): HTMLDivElement {
  const box = document.createElement('div');
  box.style.cssText = ICON_BOX_CSS;
  box.style.borderColor = ICON_EDGE;
  const svg = equipmentGlyphSvg(id, R.iconGlyph);
  if (svg !== null) box.appendChild(svg);
  return box;
}

/** The line NAME at the size `refitCardFit` picked for it (15px, or the mock's
 *  `.cn.long` 12.5px step for the one name too wide for the 192px inner box). */
function nameEl(name: string): HTMLSpanElement {
  const el = lineEl(NAME_CSS, name);
  el.style.font = `600 ${cardNameSize(name)}px var(--hc-font-display)`;
  el.style.letterSpacing = `${cardNameTracking(name)}px`;
  return el;
}

/**
 * The LADDER row: one rung per copy the line carries, filled up to the copies
 * held, with the NEXT rung filled AND glowing in its own colour and the rest at
 * `.35`. Beside them, the `cur → next` numerals on the same absolute ramp.
 *
 * A line with no ladder (a consumable, an add-on) gets the row and nothing in
 * it — 16px of deliberate emptiness, so the KIND word, the five rows and the
 * foot sit on one baseline across all four cards.
 */
function ladderEl(card: OfferCard): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText = LADDER_CSS;
  if (card.tierStep === null) return row;
  for (let i = 0; i < card.cap; i += 1) row.appendChild(rungEl(i, card.stack));
  row.appendChild(tierLabelEl(card.tierStep));
  return row;
}

/** One rung, tinted by its ABSOLUTE position on the loot-tier ramp. */
function rungEl(index: number, held: number): HTMLElement {
  const rung = document.createElement('i');
  rung.style.cssText = RUNG_CSS;
  const tint = LINEAGE_TIERS[Math.min(index, LINEAGE_TIERS.length - 1)];
  rung.style.borderColor = tint;
  if (index < held) rung.style.backgroundColor = tint;
  else if (index === held) {
    rung.style.backgroundColor = tint;
    rung.style.boxShadow = `0 0 ${RUNG_GLOW_PX}px ${tint}`;
  } else rung.style.opacity = String(RUNG_OFF_ALPHA);
  return rung;
}

/** The `cur → next` numerals, each tinted by the tier it names. */
function tierLabelEl(step: CardTierStep): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.cssText = TIER_LABEL_CSS;
  el.appendChild(numeralEl(step.cur));
  if (step.next === null) return el;
  el.appendChild(lineEl(TIER_ARROW_CSS, TIER_ARROW));
  el.appendChild(numeralEl(step.next));
  return el;
}

/** One Roman numeral at its tier's colour on the absolute ramp. */
function numeralEl(tier: number): HTMLSpanElement {
  const el = lineEl('', ROMAN_TIERS[Math.min(Math.max(tier, 1), ROMAN_TIERS.length) - 1] ?? String(tier));
  el.style.color = LINEAGE_TIERS[Math.min(Math.max(tier, 1), LINEAGE_TIERS.length) - 1];
  return el;
}

/** The Roman numerals the ladder prints. Longer than any catalog cap, so the
 *  clamp above is belt and braces rather than the rule. */
const ROMAN_TIERS: readonly string[] = ['I', 'II', 'III', 'IV', 'V'];

/** The five-row grid: one row per stat the card moves, blank rows after. */
function rowsEl(rows: readonly CardStatRow[]): HTMLDivElement {
  const grid = document.createElement('div');
  grid.style.cssText = ROWS_CSS;
  for (let i = 0; i < R.rowCount; i += 1) grid.appendChild(statRowEl(rows[i]));
  return grid;
}

/** One row — label left, value right — or an EMPTY ruled row past the end of
 *  the card's stats (the mock's own `<div class="rw"></div>`). */
function statRowEl(row: CardStatRow | undefined): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = ROW_CSS_LINE;
  el.style.borderBottomColor = ROW_RULE;
  if (row === undefined) return el;
  el.appendChild(lineEl(ROW_LABEL_CSS, row.label));
  el.appendChild(valueEl(row));
  return el;
}

/** A row's value cell: `next` alone on an absolute row, `cur → next` on a diff
 *  row with the NEXT value in phosphor (the mock's `.nx`). */
function valueEl(row: CardStatRow): HTMLSpanElement {
  const cell = document.createElement('span');
  cell.style.cssText = ROW_VALUE_CSS;
  if (row.cur !== null) {
    cell.appendChild(lineEl('', row.cur));
    cell.appendChild(lineEl(ROW_ARROW_CSS, TIER_ARROW));
  }
  cell.appendChild(lineEl(ROW_NEXT_CSS, row.next));
  return cell;
}

/**
 * The foot: blank on every card but a REFUSED one, where it carries the boxed
 * `SLOTS FULL` reason word (mock `.rc.grey .foot`) in `silver` at FULL alpha, so
 * it still reads through the card's own `greyedAlpha` dim. The dim is never the
 * refusal's only channel — that is the whole point of the word and the box.
 */
function footEl(greyed: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = FOOT_CSS;
  if (!greyed) return el;
  el.textContent = SLOTS_FULL;
  el.style.color = SILVER;
  el.style.borderWidth = '1px';
  el.style.borderStyle = 'solid';
  el.style.borderColor = FOOT_BOX_EDGE;
  el.style.padding = `0 ${FOOT_BOX_PAD}px`;
  el.style.height = `${R.footH + FOOT_BOX_GROWTH}px`; // 16px boxed where the bare word is 14
  return el;
}

/** The render memo's per-card component: every mark the face actually shows, so
 *  a copy change with an unchanged id still repaints (see render()). This
 *  SUBSUMES stack changes — a line fitted to a new rung moves its ladder, its
 *  numerals and its current→next numbers, all of which are in here. */
function cardSignature(card: OfferCard): string {
  const rows = card.rows.map((r) => `${r.label}=${r.cur ?? ''}>${r.next}`).join('|');
  return [card.id, card.kind, card.name, card.tier ?? '', card.stack, card.cap, rows, card.tooltip, card.greyed ? 'g' : ''].join('~');
}

/** The DOM handles of one built card — the marks `paintCard` repaints on arm. */
interface RefitCardEls {
  root: HTMLButtonElement;
  chip: HTMLSpanElement;
  icon: HTMLDivElement;
  kind: HTMLSpanElement;
  name: HTMLSpanElement;
  /** Carried so the arm/rest repaint can restore a GREYED chip's own colours
   *  rather than the resting ones (the refusal outlives a hover). */
  greyed: boolean;
}

/** The DOM handles of the hover tooltip (built once with the panel). */
interface RefitTipEls {
  root: HTMLDivElement;
  name: HTMLSpanElement;
  /** The CONSUMABLE shape line (Story 8.7, ruling 13) — hidden on every other
   *  kind, so it spends no vertical rhythm where there is nothing to say. */
  interaction: HTMLSpanElement;
  body: HTMLSpanElement;
}

/** Pure: the hover panel's model for one card — the name over its explanation,
 *  plus the CONSUMABLE shape line (ruling 13) where the catalog resolves. An
 *  unresolvable id still gets a panel, which is the fail-open this surface has
 *  always had. The card's OWN stack feeds the shape line's `×n` (review patch
 *  P7), so the hover and the belt square can never print different counts. */
function tipModelFor(copy: OfferCard): RefitTooltipModel {
  const line = Object.hasOwn(CATALOG, copy.id) ? CATALOG[copy.id] : undefined;
  return line === undefined
    ? { name: copy.name, body: copy.tooltip }
    : refitTooltipModel(line, copy.name, copy.tooltip, copy.stack);
}

/** Fill the one hover panel from a model. The SHAPE row is REMOVED rather than
 *  left blank on the kinds that have none, so it spends no vertical rhythm on
 *  information that is not there. */
function fillTip(tip: RefitTipEls, model: RefitTooltipModel, body: string): void {
  tip.name.textContent = model.name;
  tip.interaction.textContent = model.interaction ?? '';
  tip.interaction.style.display = model.interaction ? 'block' : 'none';
  tip.body.textContent = body;
}

/** The DOM handles of the DAMAGE CONTROL rail (built once, never rebuilt — it
 *  is the one element in the band that no offer can take away). */
interface RefitStripEls {
  root: HTMLButtonElement;
  chip: HTMLSpanElement;
  label: HTMLSpanElement;
  readout: HTMLSpanElement;
  status: HTMLSpanElement;
}

/** The rail's armed (hover/focus) treatment — the card's `paintCard`, one line
 *  high: amber edge + glow and amber chip/label, or the resting hairline. The
 *  READOUT keeps its phosphor through the arm (the amounts are a fact about the
 *  spend, not a state of the pointer), exactly as a card's rarity tag does. */
function paintStrip(strip: RefitStripEls, armed: boolean): void {
  strip.root.style.borderColor = armed ? AMBER : HAIRLINE;
  strip.root.style.boxShadow = armed ? `0 0 8px ${AMBER}` : 'none';
  strip.root.style.color = armed ? AMBER : REST; // the key chip rides currentColor
  strip.label.style.color = armed ? AMBER : REST;
}

/**
 * The refit band. TAB toggle()s it (main.ts gates open on a banked level);
 * digits 1–4 pick via main.ts's onRefitPick while it is open; a card click
 * picks too. A pick does NOT close (amendment 36) — the window rides the queue.
 * Cards re-render only when the view signature changes (pts + option ids +
 * locked) so live per-frame update()s stay cheap.
 *
 * `budget` (Story 4.8 wave 2c) is the OPTIONAL aggregate flash-budget instance
 * — main.ts's single per-client `FlashBudget` (`render/flashBudget.ts`), layered
 * on TOP of the 300ms same-source floor and the motion=off suppression in
 * `pulseDenied`, never replacing either. It claims `FLASH_ELEMENTS.refitDenied`
 * once per accepted denial (cards and the DAMAGE CONTROL rail share ONE
 * element, since a denial is a denial regardless of which control it lands
 * on); a `'degrade'` verdict still marks the target — the border still snaps
 * to the denied color for the pulse's full life — it only drops the box-shadow
 * glow to its flat rest value, the same "no shadow at rest" vocabulary
 * `paintCard`/`paintStrip` already use elsewhere. Undefined (no budget wired
 * yet, or any caller that never passes one — every existing test constructs a
 * bare `UpgradeMenu`) behaves byte-identical to before this wave: every claim
 * reads as `'animate'`.
 */
export class UpgradeMenu {
  private panel: HTMLDivElement | null = null;
  private pipsEl: HTMLDivElement | null = null;
  private rowEl: HTMLDivElement | null = null;
  private ghostEl: HTMLDivElement | null = null;
  private cards: RefitCardEls[] = [];
  private strip: RefitStripEls | null = null;
  /** The ONE hover tooltip (R2.17), built with the panel and re-filled per
   *  hover — never one per card, so a pointer running along the row cannot
   *  leave a trail of panels behind it. */
  private tip: RefitTipEls | null = null;
  /** The copy the OPEN tip is showing, or null when no tip is up. Kept so the
   *  per-frame `place()` can re-run the amendment-37 above/below decision after
   *  a viewport change — the decision is a function of the band's geometry, and
   *  the band moves under a stationary pointer (review gate, cycle 141). */
  private tipModel: RefitTooltipModel | null = null;
  /** The last rendered view — the tooltip's copy source. Kept as state rather
   *  than stamped onto the DOM: the panel shows ONE card's explanation at a
   *  time, and re-reading it from the view keeps the cards free of copy. */
  private view: OfferView | null = null;
  private shown = false;
  private sig = '';
  private stripSig = '';
  /** Denied-pulse bookkeeping: the CHOICE flashing (a card index, or
   *  HEAL_CHOICE for the rail — hence `null`, not -1, as the nothing-lit
   *  sentinel: -1 is now a real target), when it ends, and the last trigger
   *  time (the 300ms same-source floor — deniedFire's grammar). */
  private deniedChoice: number | null = null;
  private deniedUntil = -Infinity;
  private deniedLastAt = -Infinity;

  constructor(
    private readonly onSpend: (choice: number) => void,
    private readonly budget?: FlashBudget,
  ) {}

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
    this.strip = this.makeStrip();
    this.tip = this.makeTip();
    // The tooltip is the panel's LAST child so it paints over the cards, and it
    // is a sibling of the row rather than a member of it: `render()` rebuilds
    // the row's children wholesale, and a tooltip inside it would be destroyed
    // on every offer swap.
    panel.append(pips, row, this.strip.root, this.tip.root);
    document.body.appendChild(panel);
    this.panel = panel;
    this.pipsEl = pips;
    this.rowEl = row;
    this.ghostEl = ghost;
    return panel;
  }

  /**
   * The DAMAGE CONTROL rail, built ONCE with the panel: chip · label · amounts
   * · reason word. It is deliberately outside the card row's render memo — the
   * rail is never drawn and never exhausted, so nothing about an offer may
   * rebuild it (and a rebuild would strand a lit denied edge on a dead node).
   * The click routes the SAME path a digit does, through `onSpend(HEAL_CHOICE)`.
   */
  private makeStrip(): RefitStripEls {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = STRIP_ID;
    btn.style.cssText = STRIP_CSS;
    btn.style.backgroundColor = 'var(--hc-panel)';
    const chip = document.createElement('span');
    chip.style.cssText = STRIP_CHIP_CSS;
    chip.textContent = STRIP_KEY_GLYPH;
    const label = document.createElement('span');
    label.style.cssText = STRIP_TEXT_CSS;
    const readout = document.createElement('span');
    readout.style.cssText = STRIP_READOUT_CSS;
    const status = document.createElement('span');
    status.style.cssText = STRIP_STATUS_CSS;
    btn.append(chip, label, readout, status);
    const els: RefitStripEls = { root: btn, chip, label, readout, status };
    paintStrip(els, false);
    // Focus hygiene, the card's verbatim: never acquire focus on click, so a
    // later Space/Enter cannot re-trigger the spend and a focused button cannot
    // trip the keyboard chokepoint's text-entry guard mid-battle.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('mouseenter', () => this.armStrip(true));
    btn.addEventListener('mouseleave', () => this.armStrip(false));
    btn.addEventListener('focus', () => this.armStrip(true));
    btn.addEventListener('blur', () => this.armStrip(false));
    btn.addEventListener('click', () => {
      btn.blur();
      this.onSpend(HEAL_CHOICE);
    });
    return els;
  }

  /**
   * The hover tooltip's panel (R2.17), built ONCE with the band: heading row
   * over explanation paragraph. It takes no pointer events and registers no
   * listeners of its own — every appearance is driven by a card's mouseenter.
   */
  private makeTip(): RefitTipEls {
    const root = document.createElement('div');
    root.id = TIP_ID;
    root.style.cssText = TIP_CSS;
    root.style.backgroundColor = TIP_BED;
    root.style.borderColor = TIP_EDGE;
    const name = document.createElement('span');
    name.style.cssText = TIP_NAME_CSS;
    const interaction = document.createElement('span');
    interaction.style.cssText = TIP_INTERACTION_CSS;
    interaction.style.display = 'none';
    const body = document.createElement('span');
    body.style.cssText = TIP_BODY_CSS;
    root.append(name, interaction, body);
    return { root, name, interaction, body };
  }

  /**
   * Show the explanation for the card in slot `index`, or hide the panel.
   *
   * HOVER ONLY, BY RULING (R2.17). The single caller is a card's `mouseenter` /
   * `mouseleave`; nothing on the keyboard path reaches here, because Tab/1–4/5
   * exist precisely so an experienced player can skip the reading.
   *
   * A card with NO explanation written (fail-open on an unwritten id) shows no
   * panel at all rather than an empty box — the totality pin in
   * __tests__/refitTooltipFit.test.ts is what makes that unreachable for any
   * shipped catalog line.
   */
  private showTip(index: number | null): void {
    const tip = this.tip;
    if (!tip) return;
    const card = index === null ? null : this.cards[index];
    const copy = index === null ? null : this.view?.options[index] ?? null;
    if (!card || !copy || copy.tooltip === '') {
      tip.root.style.display = 'none';
      this.tipModel = null;
      return;
    }
    const model = tipModelFor(copy);
    fillTip(tip, model, copy.tooltip);
    tip.root.style.left = `${refitTooltipLeft(index!, this.rowWidth())}px`;
    this.tipModel = model;
    this.placeTip(tip.root, model);
    tip.root.style.display = 'flex';
  }

  /**
   * The panel's VERTICAL placement (epic-8 amendment 37): above the band while
   * it fits in the water there, otherwise downward from the band's top edge over
   * the card row. `bottom: calc(100% + gap)` is the above placement — the
   * panel's own box starts at the queue pips, so that one declaration pins the
   * tooltip `gap` above the band — and `top: 0` is the downward one. Exactly one
   * of the two is ever set; the other is explicitly cleared, because the panel
   * is re-filled rather than rebuilt and would otherwise keep the last hover's.
   */
  private placeTip(root: HTMLElement, model: RefitTooltipModel): void {
    const p = refitTooltipPlacement(model, this.bandLayout().band);
    root.style.bottom = p.above ? `calc(100% + ${REFIT_TIP.gap}px)` : 'auto';
    root.style.top = p.above ? 'auto' : '0px';
    root.style.maxHeight = `${p.maxH}px`;
  }

  /** The laid-out card row's width — the ONE place the tooltip's horizontal
   *  clamp reads it from, derived exactly as `refitBandLayout` derives it. */
  private rowWidth(): number {
    return this.bandLayout().row.w;
  }

  /** Hover/focus arm — suppressed while the denied edge is lit on the rail, so
   *  a pointer sitting on the strip cannot paint the refusal away mid-pulse. */
  private armStrip(armed: boolean): void {
    if (this.strip && this.deniedChoice !== HEAL_CHOICE) paintStrip(this.strip, armed);
  }

  /**
   * Repaint the rail from its state. Memoized on its own signature (NOT the
   * card row's): hp crossing maxHp must not rebuild four cards, and a fresh
   * offer must not disturb the rail.
   */
  private renderStrip(heal: HealView): void {
    const strip = this.strip!;
    const sig = healSignature(heal);
    if (sig === this.stripSig) return;
    this.stripSig = sig;
    strip.label.textContent = heal.label;
    strip.readout.textContent = heal.readout;
    strip.status.textContent = heal.status;
    const armed = heal.state === 'armed';
    strip.root.disabled = !armed; // real disabled state — keyboard/AT see it too
    strip.root.style.opacity = armed ? '1' : String(R.lockedAlpha);
    strip.root.style.cursor = armed ? 'pointer' : 'default';
    if (this.deniedChoice !== HEAL_CHOICE) paintStrip(strip, false);
  }

  /**
   * One card, top-down: the overhanging digit chip (PINNED as the card's FIRST
   * span — the digit-to-slot mapping is read off it), the KIND + copy-count
   * meta row, the line name, the lineage handrail, and the rules text. The
   * lineage span stays CONDITIONAL (a single-copy line has no rung to print, and
   * an empty element would eat vertical rhythm for information that isn't
   * there); the meta row is now UNCONDITIONAL — every line has a kind and a
   * count. The doctrine-swap line is GONE with the exclusivity mechanism
   * (Story 7-5 wave 2, R2.6).
   */
  private makeCard(card: OfferCard, choice: number, enabled: boolean): RefitCardEls {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = enabled ? CARD_CSS : CARD_LOCKED_CSS;
    btn.style.backgroundColor = 'var(--hc-panel)';
    const chip = document.createElement('span');
    chip.style.cssText = KEY_CHIP_CSS;
    // The mock's `.rc .kc.big { background: var(--void) }` — opaque under the
    // overhang, and deliberately the VOID rather than the panel bed, so the
    // chip reads as sitting proud of the card rather than cut out of it.
    chip.style.backgroundColor = 'var(--hc-void)';
    chip.textContent = `${choice + 1}`;
    btn.appendChild(chip); // FIRST child, always — pinned DOM order
    const icon = iconBoxEl(card.id);
    const name = nameEl(card.name);
    const kind = lineEl(KIND_CSS, card.kind);
    // Every mark hangs off the CLIPPED body, never off the button itself: the
    // button has to keep `overflow` visible for the overhanging key chip, so
    // the amendment-47 clip lives exactly one level in (CARD_BODY_CSS). The
    // chip stays the button's FIRST child — the pinned digit-to-slot mapping.
    const body = document.createElement('div');
    body.style.cssText = CARD_BODY_CSS;
    body.append(icon, name, ladderEl(card), kind, rowsEl(card.rows), footEl(card.greyed));
    btn.appendChild(body);
    const els: RefitCardEls = { root: btn, chip, icon, kind, name, greyed: card.greyed };
    if (card.greyed) {
      // The DASHED chip is the refusal's glyph channel and rides through
      // everything. The DIM is only applied while the card is otherwise live:
      // the spend-latch dim is ROW-WIDE and darker (`lockedAlpha`), and a
      // greyed card inside a locked row must read as locked like its
      // neighbours rather than as the brightest thing on screen.
      chip.style.borderStyle = 'dashed';
      if (enabled) btn.style.opacity = String(R.greyedAlpha);
    }
    paintCard(els, false);
    // Focus hygiene (full-lockout modal): never acquire focus on click —
    // a focus-retaining card would (a) let Space/Enter re-trigger the spend
    // and (b) trip the keyboard chokepoint's text-entry guard mid-battle.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    if (!enabled) {
      btn.disabled = true; // real disabled state, not just opacity — keyboard/AT see it too
      return els;
    }
    this.wireCard(els, choice, card.greyed);
    return els;
  }

  /**
   * A live card's listeners. HOVER carries the tooltip; FOCUS deliberately does
   * NOT (R2.17 — Eric ruled the explanation hover-only, because the Tab / 1–4
   * keyboard path exists precisely so an experienced player can skip the
   * reading). The two pairs stay asymmetric on purpose, and a pin asserts it.
   */
  private wireCard(els: RefitCardEls, choice: number, greyed: boolean): void {
    const btn = els.root;
    btn.addEventListener('mouseenter', () => {
      paintCard(els, true);
      this.showTip(choice);
    });
    btn.addEventListener('mouseleave', () => {
      paintCard(els, false);
      this.showTip(null);
    });
    btn.addEventListener('focus', () => paintCard(els, true));
    btn.addEventListener('blur', () => paintCard(els, false));
    btn.addEventListener('click', () => {
      btn.blur(); // belt-and-braces with the mousedown preventDefault above
      // A GREYED card sends NOTHING (ruling 10, UX-DR52): no spend, no latch,
      // no denied pulse. The refusal was already stated — the card is dim, its
      // chip is dashed and its foot reads SLOTS FULL — so a pulse would be the
      // game shouting a fact the player is looking at. The hover panel still
      // works, because reading a card you cannot take is legitimate.
      if (greyed) return;
      this.onSpend(choice);
    });
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
    this.view = view;
    // The rail first, on its OWN memo: it outlives every offer, so it must be
    // repainted even on the frames the card row memo skips (a hull crossing
    // maxHp mid-window moves nothing about the cards).
    this.renderStrip(view.heal);
    const sig = `${view.pts}|${view.options.map(cardSignature).join(',')}|${view.locked ? 1 : 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    // A rebuilt row destroys the buttons the pointer was over, so no mouseleave
    // can ever arrive for them: drop the tooltip with them or it strands, still
    // showing the offer that just left.
    this.showTip(null);
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
    // A fresh ROW never inherits the last row's pulse. A lit RAIL is untouched:
    // the rail's node survives the rebuild, so its pulse is still on screen and
    // still owns the same-source floor it consumed.
    if (this.deniedChoice !== null && this.deniedChoice >= 0) this.deniedChoice = null;
  }

  /**
   * Position the band from the pure layout (never from CSS guesses), and hand
   * the hover tooltip the container the same layout leaves above the band.
   *
   * SCALE-AWARE SINCE STORY 8.6 (epic-8 amendment 36), which closes the
   * physical-anchor / CSS-scale mismatch the cycle-47 review ledgered BY
   * CONSTRUCTION. The band is laid out in LOGICAL units (screen px ÷ the UI
   * scale — the same units `hudBarLayout` uses), and only the finished anchor
   * is converted back to CSS px. `PANEL_CSS` scales the panel by
   * `--hc-ui-scale` about `transform-origin: top center`, so writing
   * `band.y × s` to `top` puts the panel's rendered bottom at
   * `(band.y + band.h) × s` = `(bar.y − barGap) × s` — exactly `barGap` scaled
   * pixels above the bar, which is itself drawn from the same logical layout
   * scaled by the same factor. The two can no longer drift at any tier.
   */
  private place(): void {
    const s = uiScaleFactor();
    const panel = this.ensurePanel();
    // AMENDMENT 43, published once per placement: the band's floor-seated
    // registers (the row labels, the reason-word foot) read this property and
    // divide their size by it, so a 9px mark still renders at 9px when the
    // whole band is drawn at 90%. Above 1 it is exactly 1 and nothing moves.
    panel.style.setProperty(MICRO_VAR, String(domMicroScale(s)));
    panel.style.top = `${this.bandLayout().band.y * s}px`;
    // WHICH WAY AN OPEN TIP OPENS IS RE-DECIDED HERE TOO (review gate, cycle
    // 141). The above/below choice depends on the hovered card's copy AND on the
    // water above the band, and the band moves whenever the viewport does —
    // under a pointer that never left the card, so no hover ever fires to fix
    // it. Deciding it only in `showTip` left the panel opening upward into water
    // that was no longer there. The copy still comes from the hover.
    if (this.tipModel && this.tip) this.placeTip(this.tip.root, this.tipModel);
  }

  /** The band as the panel's own (LOGICAL) coordinate space sees it — the ONE
   *  place the DOM converts the viewport into the units `refitBandLayout` and
   *  `hudBarLayout` both work in. */
  private bandLayout(): RefitBandLayout {
    const s = uiScaleFactor();
    return refitBandLayout(window.innerWidth / s, window.innerHeight / s);
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
   *
   * STORY 4.8 WAVE 2C: an accepted denial (past every gate above) claims the
   * aggregate flash budget's `FLASH_ELEMENTS.refitDenied` element. A
   * `'degrade'` verdict NEVER skips the mark — the border still snaps to the
   * denied color for the pulse's full life, so the card/rail still reads as
   * refused — it only drops the box-shadow glow to its flat rest value
   * (`'none'`, same as `paintCard`/`paintStrip`'s resting state), since the
   * glow is the one purely-decorative flourish here and the border alone
   * already carries the information.
   */
  pulseDenied(choice: number, nowMs = performance.now()): void {
    if (!this.shown) return;
    if (motionIntensity(settings.current.motion) <= 0) return;
    if (nowMs - this.deniedLastAt < R.deniedFloorMs) return;
    const el = this.deniedTarget(choice);
    if (!el) return;
    const verdict = this.budget?.claim(FLASH_ELEMENTS.refitDenied, nowMs) ?? 'animate';
    this.deniedLastAt = nowMs;
    this.deniedChoice = choice;
    this.deniedUntil = nowMs + R.deniedPulseMs;
    el.style.borderColor = DENIED;
    el.style.boxShadow = verdict === 'degrade' ? 'none' : `0 0 8px ${DENIED}`;
    setTimeout(() => this.clearDenied(choice), R.deniedPulseMs);
  }

  /** The element a pick's denied pulse paints: a card, or the DAMAGE CONTROL
   *  rail for HEAL_CHOICE (the one negative choice on the wire). */
  private deniedTarget(choice: number): HTMLElement | null {
    if (choice === HEAL_CHOICE) return this.strip?.root ?? null;
    return this.cards[choice]?.root ?? null;
  }

  /** Drop the denied edge back to rest, unless a newer pulse took it over. */
  private clearDenied(choice: number): void {
    if (this.deniedChoice !== choice) return;
    this.deniedChoice = null;
    this.deniedUntil = -Infinity;
    if (choice === HEAL_CHOICE) {
      if (this.strip) paintStrip(this.strip, false);
      return;
    }
    const card = this.cards[choice];
    if (card) paintCard(card, false);
  }

  /** True while the denied pulse is lit (test/observation seam). */
  deniedActive(nowMs = performance.now()): boolean {
    return this.deniedChoice !== null && nowMs < this.deniedUntil;
  }

  /** Close the band and DROP the whole denied register with it: a reopened band
   *  must never inherit a lit edge, a pending clear, or a consumed same-source
   *  floor from the window the player just closed. */
  hide(): void {
    if (this.panel) this.panel.style.display = 'none';
    this.shown = false;
    // A closed band leaves no hover behind it: the pointer never gets a
    // mouseleave off a hidden button, so a reopened band would inherit a lit
    // tooltip for a card it may no longer even be offering.
    this.showTip(null);
    // Repaint (not just forget) any lit edge: the cards outlive the close (a
    // reopen with an unchanged view signature reuses the very same buttons), so
    // dropping the bookkeeping alone would strand a denied border lit forever —
    // the in-flight clearDenied timeout no-ops once the register is cleared.
    if (this.deniedChoice !== null) this.clearDenied(this.deniedChoice);
    this.deniedLastAt = -Infinity; // the floor dies with the window
  }
}
