// THE in-match keyboard chokepoint (Story 2.1 — the fixed v1 scheme). One
// window keydown listener owns every sim key: a declarative binding table
// (code → handler) evaluated in one dispatcher with full browser hygiene —
// every bound key preventDefault-ed (TAB focus-cycle and Space page-scroll
// included), modifier chords (CTRL/META/ALT) left native, and a focused text
// input or DOM button suppressing ALL sim keys while the sim keeps running.
// Story 2.3 adds the FOCUSED-OVERLAY rule: while the settings overlay or the
// results modal is up, every bound key but ESC/Enter is swallowed — helm
// included, unlike the refit modal's partial lockout.
// Pre-join surfaces (ui/home.ts, ui/classSelect.ts) keep their own scoped,
// guarded handlers — this class is attached post-join only.
//
// The fixed v1 bindings (Eric rulings 2026-07-24, epic-2-context-amendments
// entries 1–9):
//   W/S (+arrows)  telegraph ±1 detent, edge-only (input/telegraph.ts)
//   A/D (+arrows)  held rudder
//   Q / E / R      the three WEAPON slots 2 / 3 / 4 (Story 8.5's nine-slot
//                  spine — shared WEAPON_SLOTS): weapons switch-to (prime
//                  toggle); a key on an EMPTY weapon slot is DENIED on the
//                  client (onEmptySlotDenied — epic-8 amendment 26: a pulse and
//                  a tone, nothing on the wire); ALL suspended while the refit
//                  modal is open
//   SHIFT (L/R)    slot 1, the BOOST — a TAP (keydown edge only, so a held
//                  Shift is ONE press) that activates through the same ability
//                  FIFO Q/E/R's abilities use. Suspended by the refit modal and
//                  the combat lock exactly as Q/E/R are (UX-DR42). SHIFT+TAB is
//                  still the browser's reverse focus-cycle and is evaluated
//                  FIRST, so Tab keeps its own (prevented-inert) treatment.
//   F              FOGHORN (Story 4.5, amendment 56 — the reservation closed):
//                  one honk per physical press (edge-gated, so OS auto-repeat
//                  cannot machine-gun it), suspended with Q/E/R while the refit
//                  modal is open and swallowed by a focused overlay
//   TAB            toggles the refit modal (main.ts owns open/close policy)
//   1–4            TWO MEANINGS, decided at the keydown itself (Story 8.7,
//                  ruling 7 — this retires epic-8 amendments 27 and 30, which
//                  held only while the belt could not be stocked): with the
//                  refit window OPEN they pick a card; with it CLOSED they are
//                  the four BELT slots' keys (shared CONSUMABLE_SLOTS), acting
//                  through the very same slotAction the weapon keys use. In
//                  between sits the CLOSE GRACE (ruling 8): for a few hundred
//                  ms after the window closes by ANY path a digit is swallowed,
//                  so the key that spent the last banked level cannot fall
//                  through onto the belt
//   5              spend on DAMAGE CONTROL (the always-available heal rail —
//                  HEAL_CHOICE), under the exact same modal-only rule — the
//                  belt has four squares, so 5 stays bound-inert when closed
//   ESC            closes the TOPMOST open surface (results modal / refit modal
//                  / settings overlay) and, with nothing open, toggles settings
//                  — the uniform law (Story 2.3, amendment 23). Never leaves the
//                  match.
//   ENTER          confirms the topmost surface — the game-end results screen's
//                  RETURN TO PORT; inert in-match
//   X / Z          camera zoom in / out (alive-only — main.ts gates)
//   M / P          mute / prediction-debug toggle
//   Space / CTRL   unbound; Space keydown still prevented (page scroll)
//
// Prime model (Eric rulings 2026-07-21 + 2026-07-24): the gun (slot 0) is the
// permanently selected default with NO key of its own. A weapon slot key
// switches to (primes) that slot; the same key again reverts to the gun;
// firing auto-reverts (main.ts consumePrimeOnFire — a predicted-denied click
// keeps the prime). Ability slots activate instantly through the actSeq FIFO
// queue and never prime. Weapon-vs-ability comes ONLY from `isWeaponItem` (the
// isAbilitySlot hook) — the ONE shared predicate over either kind of slot
// content, equipment or consumable — never a slot literal or hull id.

import {
  CONSUMABLE_SLOTS,
  HEAL_CHOICE,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  WEAPON_SLOTS,
  isWeaponItem,
  type SlotItemId,
} from '@salvo/shared';
import {
  Telegraph,
  stepFromKey,
  THROTTLE_AHEAD,
  THROTTLE_ASTERN,
  type Step,
} from './telegraph.js';

/** Driving axes: throttle from the telegraph setting, rudder from held A/D. Both [-1, 1]. */
export interface Axes {
  /** -1 full astern .. +1 full ahead (telegraph order for driving; held W/S for pan). */
  throttle: number;
  /** -1 full left (A) .. +1 full right (D). */
  rudder: number;
}

const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

/**
 * The LABELED helm keys — the ones the on-screen chips actually teach (W/S at
 * the ladder, A/D at the rudder track). The arrows steer identically and always
 * will, but they are an unlabeled alias: a player who only ever uses the arrows
 * has learned nothing the chips are there to teach, so arrow input must NOT
 * count toward the glyph fade (Story 2.4). Tone/steering are unaffected.
 */
const LABELED_THROTTLE = new Set(['KeyW', 'KeyS']);
const LABELED_RUDDER = new Set(['KeyA', 'KeyD']);

/**
 * Weapon key → the loadout slot it addresses. Story 8.5 re-cut the loadout into
 * NINE fixed-role slots, so Q/E/R are now the three GENERIC weapon slots
 * (shared `WEAPON_SLOTS` = [2, 3, 4]) rather than "the two class specials plus
 * the pickup": every one of them starts EMPTY and is filled by a card.
 *
 * Read from the shared tuple rather than re-typed as literals — the slot
 * grammar has exactly one home, and a future re-cut moves the keys with it.
 * The gun (slot 0) still has NO key (it is the always-selected default) and the
 * BOOST (slot 1) is Shift, which is bound separately because it is a modifier
 * with its own Shift+Tab hygiene.
 */
export const SLOT_KEY_CODES: Record<string, number> = {
  KeyQ: WEAPON_SLOTS[0],
  KeyE: WEAPON_SLOTS[1],
  KeyR: WEAPON_SLOTS[2],
};

/** The two physical SHIFT keys — slot 1's (the boost's) activation key, bound
 *  as a TAP. Both codes act identically: a captain boosts with either hand. */
export const BOOST_KEY_CODES: readonly string[] = ['ShiftLeft', 'ShiftRight'];

/**
 * Digit key → the refit choice it sends (top row + numpad). 1–4 are card
 * indices 0..3; 5 is the DAMAGE CONTROL rail, which rides the reserved NEGATIVE
 * wire sentinel `HEAL_CHOICE` (-1) rather than an index — a positive sentinel
 * would collide with a real card the moment `CONFIG.offer.size` moved.
 *
 * This is the OPEN-WINDOW meaning of the digits, and the only meaning `5` has
 * ever had: it is bound (and therefore preventDefault-ed) at all times, and
 * acts at none but the modal. `1`-`4` gained their second, CLOSED-window
 * meaning in Story 8.7 — see BELT_KEY_CODES.
 */
export const REFIT_DIGIT_CODES: Record<string, number> = {
  Digit1: 0, Numpad1: 0,
  Digit2: 1, Numpad2: 1,
  Digit3: 2, Numpad3: 2,
  Digit4: 3, Numpad4: 3,
  Digit5: HEAL_CHOICE, Numpad5: HEAL_CHOICE,
};

/**
 * THE SECOND MEANING (Story 8.7, ruling 7): digit key → the BELT slot it fires
 * while the refit window is CLOSED. Four keys for four squares, read out of the
 * shared `CONSUMABLE_SLOTS` tuple rather than re-typed as literals — the same
 * rule SLOT_KEY_CODES follows, so a re-cut of the slot grammar moves the keys
 * with it. `5` is deliberately absent: the belt has four squares, and the fifth
 * key belongs to the DAMAGE CONTROL rail alone.
 *
 * Epic-8 amendments 27 ("1-4 stay refit-only") and 30 ("a belt press is
 * silent") are RETIRED by this table: both were true only while nothing could
 * enter the belt.
 */
export const BELT_KEY_CODES: Record<string, number> = {
  Digit1: CONSUMABLE_SLOTS[0], Numpad1: CONSUMABLE_SLOTS[0],
  Digit2: CONSUMABLE_SLOTS[1], Numpad2: CONSUMABLE_SLOTS[1],
  Digit3: CONSUMABLE_SLOTS[2], Numpad3: CONSUMABLE_SLOTS[2],
  Digit4: CONSUMABLE_SLOTS[3], Numpad4: CONSUMABLE_SLOTS[3],
};

/**
 * The slots whose EMPTY press DENIES on the client — the two rows a card fills:
 * the weapon row (Story 8.5, epic-8 amendment 26) and, since Story 8.7, the
 * BELT. The gun is never empty and slot 1 is empty only on a PvE drone
 * (amendment 24), which no keyboard is attached to, so a denial on either could
 * only ever be a construction-gap artefact.
 */
const DENIABLE_SLOTS: ReadonlySet<number> = new Set<number>([...WEAPON_SLOTS, ...CONSUMABLE_SLOTS]);

/**
 * The only keys that still act while a focused overlay is up (Story 2.3): the
 * two that dismiss/confirm the topmost surface, plus M. M is an AUDIO
 * META-ACTION, not sim input — the overlay itself advertises "MUTE (M)" in its
 * own control list and mirrors the toggle live through the store subscription,
 * so swallowing it would make the overlay lie about its own binding.
 * Everything else is swallowed.
 */
const OVERLAY_KEYS = new Set(['Escape', 'Enter', 'NumpadEnter', 'KeyM']);

function anyHeld(keys: Set<string>, codes: string[]): boolean {
  return codes.some((c) => keys.has(c));
}

/** Pure: rudder axis from held keys (A/D or arrows). -1 left .. +1 right. */
export function rudderFrom(keys: Set<string>): number {
  let rudder = 0;
  if (anyHeld(keys, RIGHT)) rudder += 1;
  if (anyHeld(keys, LEFT)) rudder -= 1;
  return rudder;
}

/**
 * Pure: held-key WASD axes for SPECTATOR free-pan only — throttle here is the
 * live held W/S state (up/down pan), NOT the telegraph order. Driving must use
 * KeyboardInput.axes() instead (telegraph throttle + held rudder).
 */
export function panAxesFrom(keys: Set<string>): Axes {
  let throttle = 0;
  if (anyHeld(keys, THROTTLE_AHEAD)) throttle += 1;
  if (anyHeld(keys, THROTTLE_ASTERN)) throttle -= 1;
  return { throttle, rudder: rudderFrom(keys) };
}

/**
 * Pure: does `slot` of the own loadout hold instant-activation ABILITY
 * content (`isWeaponItem(id) === false`)? The `speedBoost` — which
 * Story 8.5 seated in SLOT_BOOST on EVERY captain hull (epic-8 amendment 23) —
 * is the ONLY one left that answers true. Weapons and empty/out-of-range slots return
 * false (they prime / do nothing) — as of Story 2.8 (amendment 45) the MINE is
 * one of them, and as of Story 7-5 wave 2 (R2.7) so is the RADAR BUOY that
 * replaced the decoy rack: both place on a click inside the rear arc, exactly
 * like the torpedo launches inside its bow arc. The single weapon/ability split
 * source is the shared `isWeaponItem`; main.ts closes this over the own loadout
 * (slotsWithBoons) for the isAbilitySlot hook.
 *
 * SINCE STORY 8.7 A SLOT MAY HOLD A CONSUMABLE (`SlotItemId` — the belt's
 * content), and the same one predicate answers for both id spaces: a stack that
 * is not `isWeapon` ACTIVATES off the `1`-`4` rail, while the decoy shape (the
 * one aimed consumable) PRIMES, exactly as the mine and the buoy do. No cast
 * and no second table — that is what `isWeaponItem` exists for.
 */
export function slotHoldsAbility(slotIds: readonly (SlotItemId | null)[], slot: number): boolean {
  const id = slotIds[slot] ?? null;
  return id !== null && !isWeaponItem(id);
}

/**
 * Pure: is a digit still inside the refit window's CLOSE GRACE (Story 8.7,
 * ruling 8)? The interval is HALF-OPEN — `[closedAt, closedAt + graceMs)` — so
 * a digit AT the edge fires, mirroring `resultsKeysArmed`'s `>=` on the other
 * side of the same shape. `closedAt = -Infinity` (no window has ever closed)
 * answers false, which is why main.ts seeds it there.
 *
 * The STATE lives in main.ts (it owns the clock and the window); the RULE lives
 * here, beside the keys it governs, and is what the `isRefitGrace` hook returns.
 */
export function refitGraceActive(nowMs: number, closedAt: number, graceMs: number): boolean {
  return nowMs - closedAt < graceMs;
}

/**
 * Pure: the refit window's `closedAt` stamp after a frame that saw `open`,
 * given the previous frame's `prevOpen`. The TRUE→FALSE edge — and only it —
 * stamps: every close path (TAB, ESC, the last spend's update(null), spectate,
 * the you-gone force-hide) goes through the window's own visibility, so one
 * watcher over that boolean covers all of them and no close site has to
 * remember to stamp for itself.
 */
export function refitCloseStamp(prevOpen: boolean, open: boolean, nowMs: number, closedAt: number): number {
  return prevOpen && !open ? nowMs : closedAt;
}

/**
 * Pure: the primed slot after a slot key addressing `keySlot` is pressed,
 * given the `current` primed slot. Pressing the key of the ALREADY-primed slot
 * reverts to the gun (slot 0 — "switch back", amendment 5); any other weapon
 * slot key primes that slot. No timeout — priming is a set-and-hold state.
 * (The keySlot === SLOT_GUN branch is unreachable under Q/E/R — no key maps to
 * the gun — kept so the pure contract stays total.)
 */
export function nextPrimedSlot(current: number, keySlot: number): number {
  if (keySlot === SLOT_GUN) return SLOT_GUN;
  if (keySlot === current) return SLOT_GUN; // same key again reverts to gun
  return keySlot;
}

/**
 * Pure: is this element a RANGE SLIDER (the settings overlay's volume controls)?
 * A range is an `<input>` but NOT a text field: it types nothing, so it must
 * never trip the text-entry suppression that would kill the ESC closing the
 * overlay it lives in. It gets its own, narrower rule — see onDown.
 */
export function rangeElement(el: Element | null): boolean {
  return el !== null && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range';
}

/**
 * Pure: is this element a TEXT-entry field? Used by the pre-join surfaces
 * (ui/home.ts) as well as the chokepoint, so a player mid-callsign isn't yanked
 * into a modal — while a focused volume slider still lets ESC through.
 */
export function textFieldElement(el: Element | null): boolean {
  if (el === null) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (rangeElement(el)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

/**
 * Pure: is the currently-focused element a text-entry surface or DOM button?
 * While one owns focus the chokepoint suppresses ALL sim keys (no handling,
 * no preventDefault — typing "wasd" in the callsign field must steer nothing
 * and still type). The sim itself never pauses.
 *
 * A focused RANGE slider is deliberately NOT one of these: it would otherwise
 * swallow ESC/Enter for as long as a volume slider held focus (which, before
 * the sliders learned to blur, was forever — the overlay became unclosable by
 * keyboard the moment you touched a volume).
 */
export function textEntryFocused(doc: Document = document): boolean {
  const el = doc.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (rangeElement(el)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
}

/**
 * The chokepoint's callbacks into the app (main.ts wires them over the late-
 * bound Game). Every hook is optional so pure-driving tests stay terse.
 */
export interface KeyboardHooks {
  /** A throttle keydown edge: step direction, whether the detent changed (false
   *  at an end stop), and whether the key was a LABELED one (W/S, not an arrow)
   *  — wired to the telegraph-click tone (all keys) AND (Story 2.4) the W/S
   *  helm-glyph fade, which counts only CHANGED steps from LABELED keys. */
  onDetent?: (dir: Step, changed: boolean, labeled: boolean) => void;
  /**
   * A LABELED rudder key (A/D) ACTIVATION edge that reached the sim — one per
   * physical press, never per held frame, and never while a focused overlay is
   * suppressing input (the dispatcher swallows those before the handler). The
   * arrows steer identically but do not fire this: they are an unlabeled alias
   * and the chips teach A/D. Feeds the A/D helm-glyph fade (Story 2.4,
   * amendment 26); it changes no steering behavior — the rudder is still read
   * from the held-key set.
   */
  onRudder?: () => void;
  /** Does this loadout slot hold ability (non-weapon) equipment on the OWN
   *  ship? True → the slot key ACTIVATES instead of priming. */
  isAbilitySlot?: (slot: number) => boolean;
  /** Is this loadout slot fitted at all? An unfitted slot's key primes nothing
   *  and queues nothing. FAILS CLOSED: with the hook absent NO slot beyond the
   *  gun counts as fitted, so a construction site that forgets to wire it gets
   *  inert slot keys rather than resurrecting the ruled-away "R primes an empty
   *  slot" behavior. Since Story 8.5 an unfitted slot is no longer SILENT: a
   *  weapon key or a hotbar click on one fires `onEmptySlotDenied` (the boost
   *  key stays silent — it addresses a slot only a drone lacks). */
  isSlotFitted?: (slot: number) => boolean;
  /**
   * A WEAPON key (Q/E/R) or a hotbar CLICK addressed a slot `isSlotFitted`
   * reports EMPTY, while nothing was suspending it (epic-8 amendment 26 —
   * Eric 2026-09-16). main.ts flashes that slot's DENIED pulse and plays the
   * `denied` tone; NOTHING is sent. The server's own `'empty-slot'` denial
   * stays server-internal — a fair client can no longer reach it, so no wire
   * denial reason was added.
   *
   * THE COMBAT LOCK WINS AND WINS SILENTLY: the lock is checked FIRST (as it
   * always was), so a key against the held start line produces no pulse and no
   * tone. Locked must read as LOCKED, never as DENIED.
   */
  onEmptySlotDenied?: (slot: number) => void;
  /** A genuine ability-activation press edge was QUEUED (not yet consumed),
   *  with the actSeq it WILL ride once drained — main.ts predicts the verdict
   *  for feedback. */
  onAbility?: (slot: number, actSeq: number) => void;
  /** A press hit the full FIFO (pendingActs at SLOT_COUNT — NINE since Story
   *  8.5, and still only reachable by mashing: it is nine presses inside one
   *  50ms sample window): the press is dropped and this fires INSTEAD — denied
   *  feedback, never silence. */
  onAbilityCapped?: (slot: number) => void;
  /**
   * F — a FOGHORN press edge (Story 4.5, amendment 56). Fires once per physical
   * press: never on OS auto-repeat, never while a focused overlay is up, and
   * never while the refit modal is open (F suspends with Q/E/R — a captain
   * picking a card is not conning). Everything else — alive, spectating,
   * cooldown — is main.ts's call, exactly as the slot keys leave the ammo and
   * sinking verdicts to it; the chokepoint only reports the press.
   */
  onFoghorn?: () => void;
  /** Is the refit modal open? While true: Q/E/R/Shift/F are suspended and
   *  digits pick cards; helm/zoom/M/P stay live (UX-DR42). */
  isModalOpen?: () => boolean;
  /**
   * Is a digit still inside the refit window's CLOSE GRACE (Story 8.7, ruling
   * 8)? While true a digit `1`-`4` is INERT: it is still preventDefault-ed (the
   * key is bound either way and focus must never escape the canvas), but it
   * neither picks nor reaches the belt.
   *
   * The reason is the two meanings sharing one key: a captain who spends their
   * last banked level on `1` closes the window with that very press, and is
   * still holding the key a frame later. Without the grace the key-up-less
   * remainder of that press would fall through onto belt slot 5 and fire it.
   *
   * FAILS OPEN, unlike `isSlotFitted`: no hook means "no window has ever closed
   * here", which is the truth in every harness that drives the belt directly.
   * main.ts owns the stamp (one watcher on the window's visibility) and the
   * clock; this only asks.
   */
  isRefitGrace?: () => boolean;
  /**
   * Is a COMBAT LOCKOUT in force that is NOT a modal (Story 6.1, epic-6
   * amendment 8: the held start line)? While true the slot keys — and the
   * hotbar clicks routed through the same entry — are swallowed exactly as the
   * refit modal swallows them: no weapon primes, no ability activates, and
   * nothing rides an input.
   *
   * SEPARATE FROM `isModalOpen` FOR ONE REASON: THE FOGHORN. Eric's ruling
   * names movement, weapons and radar, and the horn is none of the three, so a
   * boarding captain may still sound it — while a captain reading refit cards
   * still may not (that suspension is about not conning, not about a lock).
   * Folding the start line into `isModalOpen` would have silently taken the
   * horn with it.
   */
  isCombatLocked?: () => boolean;
  /**
   * Is a FOCUSED OVERLAY up (Story 2.3: the settings overlay, the results
   * modal)? While true EVERY sim key is suppressed — helm included, unlike the
   * refit modal's partial lockout — and only ESC/Enter still route (they are how
   * the surface is dismissed). Bound keys stay preventDefault-ed so focus can
   * never escape the canvas; the simulation itself never pauses.
   */
  isOverlayFocused?: () => boolean;
  /** TAB — toggle the refit modal (main.ts owns the only-with-a-banked-point
   *  open rule and pick/TAB/ESC close rules). */
  onRefitToggle?: () => void;
  /** Digit 1–5 while the modal is open — pick card `choice` (0-based), or
   *  HEAL_CHOICE (-1) for the DAMAGE CONTROL rail. */
  onRefitPick?: (choice: number) => void;
  /** ESC — close the topmost surface (in-match: the refit modal; on the results
   *  screen main.ts routes it to RETURN TO PORT — UX-DR27). */
  onEscape?: () => void;
  /** ENTER — confirm the topmost surface. Inert in-match; on the results screen
   *  main.ts routes it to RETURN TO PORT (UX-DR27), the same path as ESC. */
  onConfirm?: () => void;
  /** X (+1, in) / Z (-1, out) camera zoom step. OS auto-repeat is deliberately
   *  allowed — holding the key zooms smoothly, mirroring the wheel. */
  onZoom?: (dir: 1 | -1) => void;
  /** M — master mute toggle. */
  onMute?: () => void;
  /** P — prediction ⇄ interpolation netcode debug toggle. */
  onNetDebug?: () => void;
}

export class KeyboardInput {
  readonly keys = new Set<string>();
  readonly telegraph = new Telegraph();
  /** The primed skillshot slot (0 = gun/unprimed). Pure client UX; survives
   *  clearKeys. main.ts reverts it to gun on a predicted-fireable click. */
  private primed = SLOT_GUN;
  /**
   * FIFO queue of accepted ability-activation slots awaiting consumption onto
   * the wire. The server activates each press through its per-input intent
   * evaluation, but the WIRE carries at most one press per input — multiple
   * presses inside one 50ms sample window MUST be spread across successive
   * inputs; consumeActivation() drains exactly one per built input. Capped at
   * SLOT_COUNT (NINE since Story 8.5 — the cap simply follows the slot count,
   * so it is nine presses inside ONE 50ms window); a press against a full queue
   * fires onAbilityCapped (denied feedback — Story 2.1 closes the silent-drop
   * debt, and the drop at the cap stays reachable only by mashing). Cleared on the hard
   * state boundaries (death / respawn / spectate / reconnect) so a queued
   * press never fires into the next life.
   */
  private readonly pendingActs: number[] = [];
  /** Cumulative CONSUMED ability-activation count (InputMsg.actSeq): 0 = never
   *  consumed. Monotonic and NEVER reset (mirrors the server's lastActSeq) —
   *  advanced by exactly 1 per consumeActivation() that drains a queued press. */
  private actCount = 0;
  /** Loadout slot of the most recently CONSUMED activation (InputMsg.actSlot; 0 sentinel). */
  private lastActSlot = 0;
  /**
   * THE RELEASE-REVERT LATCH (Story 8.5, UX-DR42: "firing auto-reverts on
   * RELEASE, never on press"). main.ts arms it at a pointerdown its own
   * prediction says will FIRE, and consumes it on the matching pointerup — so a
   * held trigger keeps its prime for the whole hold (which is what Story 8.14's
   * machine gun needs) instead of dropping to the gun on the first frame.
   *
   * It is kept HERE, beside `primed`, rather than in main.ts, for one reason:
   * "any prime change in between clears it" has to be true of EVERY prime
   * change, and `slotAction` + `revertToGun` are the only two writers of
   * `primed` there are. A latch living anywhere else would have to be told.
   *
   * IT NAMES ITS CLICK (Story 8.5 review fix): the value is the SEQUENCE NUMBER
   * of the click that owes the revert (null = nothing owed), and only that
   * click's own release may pay it. A bare boolean could be paid by any release
   * at all — a second pointer's, or the one belonging to the previous click
   * inside the same 50ms tick — which is how a fast double-click after a
   * torpedo shot fired the torpedo a second time.
   */
  private releaseRevertSeq: number | null = null;
  /** The binding table: code → handler. Built once; onDown dispatches through
   *  it (a hit is preventDefault-ed, a miss is left native). */
  private readonly bindings: ReadonlyMap<string, (e: KeyboardEvent) => void>;

  constructor(private readonly hooks: KeyboardHooks = {}) {
    this.bindings = this.buildBindings();
  }

  /** The declarative binding table — one row per bound key. */
  private buildBindings(): ReadonlyMap<string, (e: KeyboardEvent) => void> {
    const b = new Map<string, (e: KeyboardEvent) => void>();
    const bind = (codes: string[], fn: (e: KeyboardEvent) => void): void => {
      for (const code of codes) b.set(code, fn);
    };
    bind([...THROTTLE_AHEAD, ...THROTTLE_ASTERN], this.handleThrottleKey);
    bind([...LEFT, ...RIGHT], this.handleRudderKey);
    bind(Object.keys(SLOT_KEY_CODES), this.handleSlotKey);
    // SHIFT: the boost TAP (Story 8.5, UX-DR42). `edge()` is the whole
    // "a held Shift is ONE press" rule — an OS auto-repeat carries repeat=true
    // and is dropped, exactly as F and the digits drop theirs. Binding it here
    // also makes Shift a PREVENTED key, which is harmless (a bare Shift has no
    // default action) and keeps the table's one-row-per-bound-key shape.
    // SHIFT+TAB is unaffected: onDown evaluates that special case BEFORE the
    // binding lookup, and the Tab keydown is a different event from this one.
    bind([...BOOST_KEY_CODES], this.edge(() => this.boostAction()));
    bind(Object.keys(REFIT_DIGIT_CODES), this.handleDigitKey);
    // F: the FOGHORN (Story 4.5) — edge-gated so a held key is ONE honk, and
    // suspended by the refit modal exactly as Q/E/R are (handleSlotKey's rule,
    // reused rather than re-derived). Space stays BOUND-INERT: prevented (page
    // scroll), no action.
    bind(['KeyF'], this.edge(() => this.handleFoghorn()));
    bind(['Space'], () => undefined);
    bind(['Tab'], this.edge(() => this.hooks.onRefitToggle?.()));
    bind(['Escape'], this.edge(() => this.hooks.onEscape?.()));
    // ENTER (both keys): confirm the topmost surface — the results screen's
    // RETURN TO PORT (UX-DR27). Bound-inert in-match, and prevented like every
    // other bound key so it can never activate a focus-adjacent DOM control.
    bind(['Enter', 'NumpadEnter'], this.edge(() => this.hooks.onConfirm?.()));
    // Zoom allows OS auto-repeat (hold-to-zoom) — deliberately NOT edge().
    bind(['KeyX'], () => this.hooks.onZoom?.(1));
    bind(['KeyZ'], () => this.hooks.onZoom?.(-1));
    bind(['KeyM'], this.edge(() => this.hooks.onMute?.()));
    // P — THE NETCODE A/B TOGGLE, AND IT IS DEV-ONLY (NFR17, Story 7-8).
    //
    // `import.meta.env.DEV` is a build-time constant, so the shipped artifact
    // folds this to nothing: the key is not merely inert in production, the
    // BINDING DOES NOT EXIST, and `KeyP` falls through as an unbound key
    // (native, never preventDefault-ed) exactly like any other letter. The
    // handler and its `NETCODE:` banner are dead-stripped at the other end of
    // the wire (main.ts's `keyboardHooks`), which is what the build's
    // `--verify-bundle` grep pins.
    //
    // A unit test cannot see this branch — vitest runs with DEV truthy, so the
    // suite below exercises the DEV behaviour and the PROD behaviour is pinned
    // by the bundle grep in the client build, not here.
    if (import.meta.env.DEV) bind(['KeyP'], this.edge(() => this.hooks.onNetDebug?.()));
    return b;
  }

  /** Wrap a handler so OS auto-repeat never re-fires it (one action per
   *  physical press edge). */
  private edge(fn: () => void): (e: KeyboardEvent) => void {
    return (e) => {
      if (!e.repeat) fn();
    };
  }

  /**
   * THE dispatcher. Modifier chords (CTRL/META/ALT) are left entirely native —
   * CTRL is unbound in the v1 scheme and browser shortcuts must keep working.
   * A focused text input / button suppresses everything (and preventDefaults
   * nothing — typing must still type). Every bound key is preventDefault-ed
   * (TAB focus-cycle and Space scroll included); unbound keys stay native.
   *
   * SHIFT is deliberately NOT a native-chord modifier (shifted letters must
   * still steer), with ONE exception: SHIFT+TAB is the browser's REVERSE
   * focus-cycle, not a refit toggle — it is prevented (focus must not escape
   * the canvas) but takes no action.
   */
  private readonly onDown = (e: KeyboardEvent): void => {
    if (this.nativeKey(e)) return;
    if (e.shiftKey && e.code === 'Tab') {
      e.preventDefault();
      return;
    }
    const handler = this.bindings.get(e.code);
    if (handler === undefined) return;
    e.preventDefault();
    if (this.suppressedByOverlay(e.code)) return;
    handler(e);
  };

  /**
   * Leave this keydown ENTIRELY NATIVE — no handling, no preventDefault:
   *  • a modifier chord (CTRL/META/ALT are unbound; browser shortcuts must work);
   *  • a focused text field (typing "wasd" must type, and steer nothing);
   *  • a focused VOLUME SLIDER taking anything but a surface key — the arrows
   *    above all, which must keep nudging the slider instead of being eaten as
   *    rudder input (ESC/Enter/M still route, so the overlay stays closable);
   *  • TAB while a FOCUSED OVERLAY owns the screen — native focus traversal is
   *    the only way a keyboard user reaches the overlay's own controls, and
   *    there is no refit modal to toggle behind it anyway.
   */
  private nativeKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    if (textEntryFocused()) return true;
    if (rangeElement(document.activeElement)) return !OVERLAY_KEYS.has(e.code);
    return e.code === 'Tab' && this.hooks.isOverlayFocused?.() === true;
  }

  /**
   * Focused-overlay rule (Story 2.3): with the settings overlay or the results
   * modal up, every BOUND key is swallowed except the ones that dismiss/confirm
   * the surface (ESC / Enter) or toggle mute (M — an audio meta-action the
   * overlay itself advertises). The key is still preventDefault-ed by the caller, so
   * focus can never escape the canvas — and the sim keeps running behind it:
   * this suppresses INPUT, not time.
   */
  private suppressedByOverlay(code: string): boolean {
    return this.hooks.isOverlayFocused?.() === true && !OVERLAY_KEYS.has(code);
  }

  /** W/S (+arrows): record the held state (spectator pan reads it) and step
   *  the telegraph one detent per keydown EDGE (repeat → stepFromKey null). */
  private readonly handleThrottleKey = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    const step = stepFromKey(e.code, e.repeat);
    if (step === null) return;
    const changed = this.telegraph.step(step);
    this.hooks.onDetent?.(step, changed, LABELED_THROTTLE.has(e.code));
  };

  /**
   * A/D (+arrows): held rudder — state only, read by axes()/panAxes(). A keydown
   * that NEWLY LATCHES the key is an activation edge and reports to onRudder
   * (labeled A/D only) for the helm-glyph fade.
   *
   * The test is `!this.keys.has(e.code)` ALONE — deliberately not "&& !e.repeat".
   * A keydown that latches a key the set did not hold IS a fresh steering
   * activation whatever the repeat flag says: hold A while the settings overlay
   * swallows input, close the overlay, and the very next event to reach here is
   * an auto-REPEAT keydown that re-latches the rudder and starts steering the
   * ship. Excluding it counted that steering as nothing forever. Genuine
   * auto-repeats while already latched still never count — the key is in the set.
   */
  private readonly handleRudderKey = (e: KeyboardEvent): void => {
    const activation = !this.keys.has(e.code);
    this.keys.add(e.code);
    if (activation && LABELED_RUDDER.has(e.code)) this.hooks.onRudder?.();
  };

  /**
   * Q/E/R: the three WEAPON slot keys. Suspended (prevented-inert) while the
   * refit modal is open — full combat lockout. An unfitted slot is DENIED on
   * the client since Story 8.5 (onEmptySlotDenied — amendment 26), and the
   * fitted check FAILS CLOSED: no hook means no fitted slots. Ability slots
   * ACTIVATE through the FIFO; weapon slots toggle the prime (switch-to /
   * same-key-reverts).
   */
  private readonly handleSlotKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.slotAction(SLOT_KEY_CODES[e.code]);
  };

  /**
   * THE slot-action entry point — everything a slot key does, addressable by
   * slot index. Story 2.2 (amendment 11) routes hotbar CLICKS through here so a
   * click is key-EQUIVALENT by construction: the same modal suspension, the
   * same fail-closed fitted check, the same ability FIFO (including the
   * capped-press denied feedback), the same weapon prime toggle. Clicks reach
   * one slot the keys never do — the keyless GUN (slot 0), which nextPrimedSlot
   * resolves to "select the gun" (its total-contract branch, live at last).
   */
  slotAction(slot: number): void {
    if (this.suspended()) return;
    if (this.hooks.isSlotFitted?.(slot) !== true) {
      // Story 8.5 (amendment 26): an EMPTY WEAPON slot is no longer silent — it
      // denies on the client. Reached only AFTER the suspension check, so the
      // lock keeps winning silently.
      //
      // STORY 8.7 COMPLETED THAT GRAMMAR ON THE BELT (ruling 7, retiring
      // amendment 30's silence): the belt squares were mute only because
      // nothing could enter them, and now a card can. An empty square is the
      // same sentence as an empty Q — a pulse and a tone, NOTHING on the wire —
      // and a belt click says it identically, since it is this very entry.
      if (DENIABLE_SLOTS.has(slot)) this.hooks.onEmptySlotDenied?.(slot);
      return;
    }
    if (this.hooks.isAbilitySlot?.(slot) === true) {
      this.activateAbility(slot);
      return;
    }
    this.primed = nextPrimedSlot(this.primed, slot);
    // THE KEY WINS (Story 8.5, ruling 9): a prime change between a fireable
    // pointerdown and its pointerup cancels the owed release-revert, so the
    // slot the captain just chose is the one still primed when they let go.
    this.releaseRevertSeq = null;
  }

  /**
   * SHIFT: slot 1's boost tap. The same two suspensions the slot keys obey
   * (refit modal, combat lock) and the same fail-closed fitted check — but NO
   * empty-slot denial: the only hull with an empty slot 1 is a PvE drone
   * (epic-8 amendment 24), which no keyboard is attached to, so a denial there
   * could only ever be a construction-gap artefact. The activate-vs-prime split
   * still comes from the loadout (isAbilitySlot) and never from the key.
   */
  private boostAction(): void {
    if (this.suspended()) return;
    if (this.hooks.isSlotFitted?.(SLOT_BOOST) !== true) return;
    this.slotAction(SLOT_BOOST);
  }

  /** Is a surface suspending the slot keys and hotbar clicks this instant — the
   *  refit modal / a focused overlay (isModalOpen) or the held start line
   *  (isCombatLocked, Story 6.1)? The lock is deliberately the SECOND read so
   *  the two keep their separate meanings; both are feedback-free. */
  private suspended(): boolean {
    return this.hooks.isModalOpen?.() === true || this.hooks.isCombatLocked?.() === true;
  }

  /**
   * F: one honk per press edge. The refit modal suspends it (prevented-inert)
   * the same way it suspends the slot keys — full combat lockout, and the
   * foghorn is a broadcast made from the conning position, not from the
   * refit window.
   */
  private handleFoghorn(): void {
    if (this.hooks.isModalOpen?.() === true) return;
    this.hooks.onFoghorn?.();
  }

  /**
   * Digits 1–5, and they mean TWO different things (Story 8.7, ruling 7). The
   * meaning is read against the window's state AT THIS KEYDOWN — never at the
   * key-up, never at sample time:
   *   • window OPEN → a refit pick: a card (1–4) or the DAMAGE CONTROL rail
   *     (5 → HEAL_CHOICE). A GREYED card's digit is swallowed downstream by
   *     main.ts's handleRefitPick (ruling 10), not here — the chokepoint does
   *     not know what is on the cards;
   *   • window CLOSED → the BELT: 1–4 are slots 5–8 through the very same
   *     `slotAction` a hotbar click and the weapon keys use, and 5 is
   *     bound-inert (there is no fifth square). Inside the CLOSE GRACE the key
   *     does not act at all — see `isRefitGrace`.
   * The old digit slot-priming of the WEAPON row stays dead (amendment 3): no
   * digit addresses slots 2–4 in either meaning.
   */
  private readonly handleDigitKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (this.hooks.isModalOpen?.() === true) {
      this.hooks.onRefitPick?.(REFIT_DIGIT_CODES[e.code]);
      return;
    }
    const beltSlot = BELT_KEY_CODES[e.code];
    if (beltSlot === undefined) return; // digit 5 with the window closed: inert
    if (this.hooks.isRefitGrace?.() === true) return;
    this.slotAction(beltSlot);
  };

  /**
   * One ability-activation keypress: QUEUE the slot rather than bumping the
   * wire counter directly, so the sampler can drain exactly one press per
   * input. The SERVER decides the verdict — a press while cooling or dead
   * still queues and rides an input; onAbility only predicts for feedback. A
   * press against a FULL queue is dropped WITH feedback (onAbilityCapped →
   * denied pulse/tone — never silence; Story 2.1).
   */
  private activateAbility(slot: number): void {
    if (this.pendingActs.length >= SLOT_COUNT) {
      this.hooks.onAbilityCapped?.(slot);
      return;
    }
    this.pendingActs.push(slot);
    // Pass the actSeq this press WILL ride once consumed: consumedCount + its
    // queue depth (it is last in line, so it drains after all currently
    // pending). The boost optimistic-window predictor keys on this value.
    this.hooks.onAbility?.(slot, this.actCount + this.pendingActs.length);
  }

  /**
   * Drain EXACTLY ONE queued activation onto the wire counters, if any: advance
   * the cumulative consumed count (InputMsg.actSeq) by one and record its slot
   * (InputMsg.actSlot). main.ts calls this once per BUILT INPUT (the sample +
   * neutral-send sites) so multiple presses in one 50ms window ride successive
   * inputs. A no-op when the queue is empty — the counters simply repeat, the
   * honest "no new press" signal every non-pressing tick sends.
   */
  consumeActivation(): void {
    const slot = this.pendingActs.shift();
    if (slot === undefined) return;
    this.actCount += 1;
    this.lastActSlot = slot;
  }

  /**
   * Drop every queued-but-unconsumed activation press. Wired to the hard state
   * boundaries (own sunk / respawn / spectate-enter / reconnect) so a press
   * queued in one life — or mashed while dead/spectating — never fires into the
   * next. Deliberately LEAVES the consumed counters intact: actSeq must stay
   * monotonic (the server's lastActSeq is not reset on death either), or a
   * post-death press would read as stale and silently never activate.
   */
  clearActivations(): void {
    this.pendingActs.length = 0;
  }

  private readonly onUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.clearKeys();
  };

  /** Attach window listeners. Call once on boot. */
  attach(): void {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Detach window listeners. */
  detach(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /**
   * Driving axes: telegraph throttle order + held rudder.
   *
   * While a FOCUSED OVERLAY owns the input the rudder reads DEAD, whatever is
   * still latched in `keys`. The overlay suppression is keydown-only and this
   * reads the latched set, so a rudder key held at the moment the overlay opened
   * would otherwise keep steering the (deliberately never-paused) ship for as
   * long as the player kept holding it — the committed AC's "ALL sim keys
   * suppressed, helm included". main.ts also clears the held set on the open
   * edge; this is the invariant that holds even if a future open site forgets.
   * The THROTTLE is untouched: the telegraph is a set-and-forget ORDER, not a
   * held key, and an engine order must survive a settings visit.
   */
  axes(): Axes {
    const suppressed = this.hooks.isOverlayFocused?.() === true;
    return { throttle: this.telegraph.throttle, rudder: suppressed ? 0 : rudderFrom(this.keys) };
  }

  /** Spectator free-pan axes: held WASD (throttle = live held W/S, not the order). */
  panAxes(): Axes {
    return panAxesFrom(this.keys);
  }

  /** Current throttle order in [-1, 1] (for the neutral-send that preserves it). */
  get throttle(): number {
    return this.telegraph.throttle;
  }

  /** Current throttle detent index [0, 8] (for the HUD ladder highlight). */
  get throttleIndex(): number {
    return this.telegraph.index;
  }

  /**
   * Reset the throttle order to neutral (STOP). Wired to own spawn (respawn +
   * match-activation teleport), own sunk, and entering spectate — a set order
   * would otherwise carry across those hard state boundaries. NOTE: distinct
   * from clearKeys(), which drops held keys but deliberately leaves the order
   * intact (the telegraph is no longer a held key).
   */
  resetThrottle(): void {
    this.telegraph.reset();
  }

  /**
   * Drop all held keys without requiring their keyup events. Used on blur
   * (stuck-key fix) and, from main.ts, on the death -> spectate transition —
   * a WASD key held at the moment of death would otherwise read as nonzero on
   * the first spectate frame and permanently engage free-pan, defeating the
   * follow-your-killer default. Does NOT touch the throttle order (that is not
   * a held key; resetThrottle() owns the order's lifecycle).
   */
  clearKeys(): void {
    this.keys.clear();
  }

  /**
   * The primed loadout slot (0 = gun/unprimed) — the slot the next click fires.
   * Set by the last weapon slot key (or same-key revert); survives clearKeys.
   */
  get primedSlot(): number {
    return this.primed;
  }

  /**
   * Cumulative CONSUMED ability-activation counter for the wire (InputMsg.actSeq).
   * 0 = never consumed (the sentinel every non-ability driver keeps sending).
   * Advances only via consumeActivation() (one per built input), NOT at press
   * time — presses queue first. Sampled by BOTH send paths (inputSampler sample
   * + sendNeutralNow), each of which consumes exactly one queued press first.
   */
  get actSeq(): number {
    return this.actCount;
  }

  /** Loadout slot of the latest CONSUMED ability activation (InputMsg.actSlot; 0 sentinel). */
  get actSlot(): number {
    return this.lastActSlot;
  }

  /** Queued-but-unconsumed activation presses (tests/debug). */
  get pendingActivationCount(): number {
    return this.pendingActs.length;
  }

  /**
   * Revert the prime to the gun (slot 0) — the special fires once, then the gun
   * is the weapon again (Eric ruling 2026-07-21, re-ratified 2026-07-24).
   *
   * SINCE STORY 8.5 THE FIRING PATH DOES NOT CALL THIS DIRECTLY: a
   * predicted-fireable click ARMS the revert (armReleaseRevert) and the matching
   * pointerup performs it (consumeReleaseRevert). The hard boundaries — the
   * sinking window's hygiene and the room's resetPrime — still call it straight,
   * which is right: those end a life, not a trigger pull. A predicted-DENIED
   * click keeps the prime as ever (the caller simply arms nothing).
   */
  revertToGun(): void {
    this.primed = SLOT_GUN;
    this.releaseRevertSeq = null;
  }

  /**
   * A click the client predicts WILL FIRE landed on a primed weapon: the revert
   * is now OWED, and only the release of THIS click (`clickSeq`, the mouse's
   * cumulative click counter at that pointerdown) may pay it. Re-arming with
   * the same seq is idempotent; a later click simply replaces the debt, since
   * an unpaid older one can no longer belong to anything the player is holding.
   * A denied click arms nothing at all (its caller doesn't call this), so the
   * prime survives a denial exactly as it always has.
   */
  armReleaseRevert(clickSeq: number): void {
    this.releaseRevertSeq = clickSeq;
  }

  /**
   * A HOLD ENDED, for the click numbered `releasedClickSeq`: pay the owed
   * revert if that is the very click that owes it. A no-op when nothing was
   * armed (a release with no shot behind it), when a weapon key or a hotbar
   * click cleared the latch in between (the key wins), and — the review fix —
   * when the release belongs to some OTHER click: another pointer's, or the
   * previous click's inside the same tick.
   */
  consumeReleaseRevert(releasedClickSeq: number): void {
    if (this.releaseRevertSeq !== releasedClickSeq) return;
    this.revertToGun();
  }

  /** Is a release-revert still owed? (tests/debug — main.ts never branches on it.) */
  get releaseRevertPending(): boolean {
    return this.releaseRevertSeq !== null;
  }

  /** The click sequence number that owes the revert (null = none) — tests/debug. */
  get releaseRevertClickSeq(): number | null {
    return this.releaseRevertSeq;
  }
}
