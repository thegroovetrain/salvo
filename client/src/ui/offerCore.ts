// THE OFFER'S PURE CORE (moved out of ui/upgradeMenu.ts by Story 10.10 — the
// Tab refit band retires; the corner OFFER GROUP, ui/offerGroup.ts, renders the
// same view). Everything here is a pure function of the own row (`you`) and
// the caller's facts — no DOM, no Pixi, no clock but the one passed in:
//
//   • `offerView` — the spendable state: the banked count, the four resolved
//     cards (name, the tier the card GRANTS, the tier step, the stat rows, the
//     greyed refusal and its foot word), the spend latch's `locked`, and the
//     REDRAW state (phase is the caller's fact — `redrawState`);
//   • `pickableChoice` — the one gate a click AND a Tab+digit pick both pass;
//   • the FINDING A spend latch: `SpendLatch`, `frontOfferSignature`,
//     `canLatchSpend`, `spendLatchReleased`, `spendOutcome`.
//
// MOVED, NOT REWRITTEN: every function and its doc comment are the band's,
// verbatim (ui/upgradeMenu.ts itself was deleted in the same story).

import {
  CATALOG,
  CONFIG,
  MULLIGAN_CHOICE,
  boonStackCount,
  pickRefusal,
  resolveCards,
  type CatalogLine,
  type OwnShip,
  type EquipmentId,
} from '@salvo/shared';
import {
  boonName,
  cardHoverRows,
  cardColorTier,
  cardStatRows,
  cardTierLabel,
  cardTierSteps,
  type CardStatRow,
  type CardTierStep,
} from './boonCopy.js';

// --- pure core: the spend view -------------------------------------------------

/**
 * One resolved card, as the RATIFIED FACE renders it (Story 8.7, ruling 11 —
 * `hud-composite-3.html` `.rc`): an icon box, the line's name, the cap-rung
 * ladder with its `cur → next` numerals, the KIND word, up to six stat rows
 * and a foot. NO description span, NO lineage handrail, NO copy count — those
 * three fields went with the interim face they belonged to.
 */
export interface OfferCard {
  id: string;
  /** The tier this card GRANTS (`cardColorTier`, 1..5; gold for a one-off) —
   *  what colours its resting edge (Eric 2026-11-05). */
  tone: number;
  /** The line's name, uppercase (the face's one display-face mark). */
  name: string;
  /** The `cur → next` tier numerals, or null for a line with no ladder (a
   *  consumable or an add-on), whose ladder row renders EMPTY but still 16px
   *  tall so every card in the row keeps one baseline. */
  tier: string | null;
  /** The same step as NUMBERS, so each numeral can be tinted on the absolute
   *  ladder ramp without re-parsing "III → IV" back apart. Null with `tier`. */
  tierStep: CardTierStep | null;
  /** Up to six live stat rows (ruling 12). Fewer is normal; an add-on has
   *  none at all and its six rows render blank. */
  rows: readonly CardStatRow[];
  /** The HOVER-ONLY stat list (R2.17; amendment 187) — the full table of what
   *  the card touches, valued after the card. Never rendered on the face; an
   *  empty list means no hover panel. */
  hover: readonly CardStatRow[];
  /**
   * THE REFUSAL (Story 8.7, ruling 10; widened by the 8.14 review F1). A card
   * this hull cannot take — a consumable with a full belt, a line already at
   * its `cap`, or a bare weapon with Q/E/R full — is greyed BEFORE the press:
   * `SLOTS FULL` in the foot, a dashed key chip, the face at `greyedAlpha`, and
   * its digit and its click both send nothing. The predicate is the SHARED
   * `pickRefusal`, over the same replayed slot ids and held cards the server
   * folds, so the client cannot grey a card the server would have taken (or
   * take one the server would refuse).
   */
  greyed: boolean;
  /** The foot's reason word: `SLOTS FULL` on an equipment card refused for want
   *  of a free Q/E/R slot, '' on every other card — a consumable at its cap is
   *  greyed with an EMPTY foot (epic-9 amendment 32: no cap copy). */
  foot: string;
  /** How many of this line the player already holds, and how many the line has
   *  in total — the ladder's rung count and its filled prefix. */
  stack: number;
  cap: number;
}

/** The foot's one word: an equipment card with no free Q/E/R slot to land in.
 *  Ratified copy (UX-DR52) — the card's non-colour refusal channel. Since Story
 *  9.2 it is printed for the `noWeaponSlot` refusal ONLY (epic-9 amendment 32). */
export const SLOTS_FULL = 'SLOTS FULL';

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
  /**
   * THE ONE FREE REDRAW (Story 8.10, epic-8 amendment 60) — `hidden` off the
   * start line (the button is not in the DOM at all), `unspent` while the
   * countdown's level-zero offer may still be thrown back, `spent` once the
   * server says it is used (`you.rd`) (the button stays, inert, pip filled:
   * the answer to "can I redraw again?" must be on screen, not absent).
   *
   * PHASE IS THE CALLER'S FACT, not this function's: `offerView()` is a pure
   * projection of `you` and knows nothing about the match plane, so it always
   * returns `hidden` and main.ts's `currentOfferView()` sets the real state
   * through `redrawState()` from the polled `matchPhase` + the own row's `rd`
   * — the same shape `locked` already has.
   */
  redraw: RedrawState;
}

/** The REDRAW button's three states (see OfferView.redraw). */
export type RedrawState = 'hidden' | 'unspent' | 'spent';

/**
 * Pure: the REDRAW button's state this frame (Story 8.10, amendment 60; Story
 * 10.7, R4). Countdown-only — `hidden` in every other phase. Inside the
 * countdown the pip reads the SERVER's flag (`you.rd`, the one redraw is used),
 * never a client guess, so it is right after a reconnect.
 */
export function redrawState(phase: string, you: { rd: boolean } | null | undefined): RedrawState {
  if (phase !== 'countdown') return 'hidden';
  return you?.rd ? 'spent' : 'unspent';
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
  ownSlots: readonly (EquipmentId | null)[] = [],
): OfferView | null {
  // ONCE SINKING, YOU'RE DONE (Story 5.2, amendment 10). A sinking hull keeps
  // every weapon, every ability and the foghorn — what it loses is the ECONOMY:
  // the refit window and the picks.
  //
  // IT MUST BE ITS OWN FLAG, and neither of the two nearby shortcuts works:
  // `!you.alive` would also close the band for a WRECK AWAITING RESPAWN in the
  // waiting phase, which is deliberately open (builds persist across respawns,
  // and `spectates()` keeps that observer fogged and non-spectating precisely
  // so it stays open); and `spectating` is false for the whole window by
  // design. So the third state arrives here the same way it arrives everywhere
  // else — as an explicit caller-supplied fact, exactly like `spectating`
  // beside it. With the whole view null the band auto-hides, TAB opens nothing
  // and every digit pick falls through main.ts's own guard.
  if (!you || spectating || sinking || you.pts === 0 || you.offer.length === 0) return null;
  // Fail closed past the ruled size: the group's grid has `CONFIG.offer.size`
  // cards, and a key past it has no rect (nor a Tab+digit) to land on.
  if (you.offer.length > CONFIG.offer.size) return null;
  const lines = resolveCards(you.offer, CATALOG);
  if (lines.length !== you.offer.length) return null; // fail-closed: row k == server slot k
  return {
    pts: you.pts,
    options: lines.map((line) => toCard(line, you, ownSlots)),
    locked,
    // Phase-agnostic by construction (see OfferView.redraw): the caller owns it.
    redraw: 'hidden',
  };
}

/**
 * Pure: does a refit pick of `choice` address a live, takeable card (main.ts's
 * handleRefitPick gate)? No view (an EMPTY offer never opens a window — Story
 * 10.5: an exhausted hull's point has nothing to buy), a locked row, an index
 * past the offer (a SHORT offer shows fewer cards, so a digit beyond its count
 * does nothing), or a GREYED card all answer false.
 */
export function pickableChoice(view: OfferView | null, choice: number): boolean {
  if (view === null || view.locked) return false;
  if (!Number.isInteger(choice) || choice < 0 || choice >= view.options.length) return false;
  return !view.options[choice].greyed;
}

/**
 * Pure: is this offered line REFUSED (ruling 10, widened by the Story 8.14
 * review F1)? The answer comes from the SHARED `pickRefusal` over the replayed
 * slot ids and the held cards, which is byte-for-byte what `world.spendCard`
 * evaluates before it mutates anything. Two evaluations of one function, so the
 * greyed face and the server's refusal can never disagree. (The kit argument
 * and the consumable-at-cap grey left with the kit — Story 10.5, 2026-11-05,
 * epic-10 amendment 11; the draw never offers a refused card, so a grey is
 * only ever the fail-closed twin of the server's guard.)
 */
export function cardGreyed(
  line: CatalogLine,
  ownSlots: readonly (EquipmentId | null)[],
  ownCards: readonly string[],
): boolean {
  return pickRefusal(ownCards, ownSlots, line.id) !== null;
}

/**
 * Pure: the refused card's foot word — `SLOTS FULL` ONLY for `noWeaponSlot`
 * (copy 1 of a weapon whose family slot holds another kind), '' for every
 * other card. Same shared `pickRefusal`, so it can never name a refusal the
 * server would not make.
 */
export function cardFoot(
  line: CatalogLine,
  ownSlots: readonly (EquipmentId | null)[],
  ownCards: readonly string[],
): string {
  return pickRefusal(ownCards, ownSlots, line.id) === 'noWeaponSlot' ? SLOTS_FULL : '';
}

/**
 * One catalog def + the copy the card face carries, resolved against the
 * PLAYER'S OWN STATE (Story 2.8): the ladder name and the lineage marker depend
 * on how many of that line they already hold, the doctrine-swap line on whether
 * they hold the rival, and the rules text on their whole fitted build (a live
 * effectiveStats preview diff). Everything here is pure — `you` is read, never
 * touched.
 */
function toCard(line: CatalogLine, you: OwnShip, ownSlots: readonly (EquipmentId | null)[]): OfferCard {
  const stack = boonStackCount(you.cards, line.id);
  return {
    id: line.id,
    tone: cardColorTier(line, stack),
    name: boonName(line.id, stack),
    tier: cardTierLabel(line, stack),
    tierStep: cardTierSteps(line, stack),
    rows: cardStatRows(line, stack, you),
    hover: cardHoverRows(line, stack, you),
    greyed: cardGreyed(line, ownSlots, you.cards),
    foot: cardFoot(line, ownSlots, you.cards),
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

/** What the latch reads off the own row: the bank, the front offer and the
 *  server's redraw-used flag (`rd`, Story 10.7 R4 — absent reads as false). */
export type LatchYou = { pts: number; offer: string[]; rd?: boolean };

/** Pure: the latch is a REDRAW and the own row says the one redraw is used —
 *  the server's own acknowledgement of it (clause (a3) below). */
function redrawHonored(latch: SpendLatch, you: LatchYou): boolean {
  return latch.choice === MULLIGAN_CHOICE && you.rd === true;
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
 *
 *   (a3) a REDRAW latch (`choice === MULLIGAN_CHOICE`) whose own row reports
 *       `rd === true` (2026-11-06, Story 10.7 review gate): the server's used
 *       flag IS the redraw's receipt. The button can only be pressed while
 *       `rd` is false, so `rd` true proves the server honored it — even when
 *       the fresh draw deals the SAME cards (pts and signature unchanged),
 *       which used to sit to the timeout and pulse "denied" under a pip that
 *       already read spent. A card spend never reads `rd`.
 */
export function spendLatchReleased(
  latch: SpendLatch,
  you: LatchYou | null | undefined,
  nowMs: number,
): boolean {
  if (!you) return true;
  if (latch.acked) return true;
  if (redrawHonored(latch, you)) return true;
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
 * fitted toast the player already saw. A REDRAW latch whose own row reads
 * `rd === true` is likewise a 'success' (clause (a3) of spendLatchReleased —
 * the server's used flag is the redraw's receipt, even for an identical hand).
 */
export function spendOutcome(
  latch: SpendLatch,
  you: LatchYou | null | undefined,
  nowMs: number,
): SpendOutcome {
  if (!spendLatchReleased(latch, you, nowMs)) return 'pending';
  if (latch.acked) return 'success';
  if (!you) return 'failed';
  if (redrawHonored(latch, you)) return 'success';
  return you.pts < latch.pts || frontOfferSignature(you) !== latch.offerSig ? 'success' : 'failed';
}
