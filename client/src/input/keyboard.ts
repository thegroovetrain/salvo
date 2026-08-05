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
//   Q / E / R      loadout slots 1 / 2 / 3 — weapons switch-to (prime toggle),
//                  abilities activate immediately; R inert while slot 3 is
//                  empty; ALL suspended while the refit modal is open
//   F              reserved for the Foghorn — fully inert, still prevented
//   TAB            toggles the refit modal (main.ts owns open/close policy)
//   1–4            pick a refit card ONLY while the modal is open
//                  (refit-or-nothing; meaning evaluated at its own keydown)
//   5              spend on DAMAGE CONTROL (the always-available heal rail —
//                  HEAL_CHOICE), under the exact same modal-only rule
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
// queue and never prime. Weapon-vs-ability comes ONLY from EQUIPMENT_IS_WEAPON
// (the isAbilitySlot hook), never a slot literal or hull id.

import { EQUIPMENT_IS_WEAPON, HEAL_CHOICE, SLOT_COUNT, SLOT_GUN, type EquipmentId } from '@salvo/shared';
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

/** Slot key → the loadout slot it addresses (the ratified Q/E/R scheme):
 *  Q/E = the two class-special slots, R = the pickup/extra slot. The gun
 *  (slot 0) has NO key — it is the always-selected default. */
export const SLOT_KEY_CODES: Record<string, number> = {
  KeyQ: 1,
  KeyE: 2,
  KeyR: 3,
};

/**
 * Digit key → the refit choice it sends (top row + numpad). 1–4 are card
 * indices 0..3; 5 is the DAMAGE CONTROL rail, which rides the reserved NEGATIVE
 * wire sentinel `HEAL_CHOICE` (-1) rather than an index — a positive sentinel
 * would collide with a real card the moment `CONFIG.offer.size` moved.
 *
 * Every one of them means a refit pick ONLY while the refit modal is open;
 * refit-or-nothing otherwise (amendment 3). Digit 5 joins that rule verbatim:
 * it is bound (and therefore preventDefault-ed) at all times, and acts at none
 * but the modal.
 */
export const REFIT_DIGIT_CODES: Record<string, number> = {
  Digit1: 0, Numpad1: 0,
  Digit2: 1, Numpad2: 1,
  Digit3: 2, Numpad3: 2,
  Digit4: 3, Numpad4: 3,
  Digit5: HEAL_CHOICE, Numpad5: HEAL_CHOICE,
};

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
 * equipment (`EQUIPMENT_IS_WEAPON[id] === false`)? The TB's speedBoost and the
 * Mine Layer's decoyBuoy answer true. Weapons and empty/out-of-range slots
 * return false (they prime / do nothing) — as of Story 2.8 (amendment 45) the
 * MINE is one of them: it primes on its slot key and places on a click inside
 * its rear arc, exactly like the torpedo. The single weapon/ability split
 * source is the shared map; main.ts closes this over the own loadout
 * (slotsWithBoons) for the isAbilitySlot hook.
 */
export function slotHoldsAbility(slotIds: readonly (EquipmentId | null)[], slot: number): boolean {
  const id = slotIds[slot] ?? null;
  return id !== null && !EQUIPMENT_IS_WEAPON[id];
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
  /** Is this loadout slot fitted at all? An unfitted slot's key (R while
   *  slot 3 is empty) is inert — no prime, no queue, no feedback. FAILS CLOSED:
   *  with the hook absent NO slot beyond the gun counts as fitted, so a
   *  construction site that forgets to wire it gets inert slot keys rather than
   *  resurrecting the ruled-away "R primes an empty slot" behavior. */
  isSlotFitted?: (slot: number) => boolean;
  /** A genuine ability-activation press edge was QUEUED (not yet consumed),
   *  with the actSeq it WILL ride once drained — main.ts predicts the verdict
   *  for feedback. */
  onAbility?: (slot: number, actSeq: number) => void;
  /** A press hit the full FIFO (pendingActs at SLOT_COUNT): the press is
   *  dropped and this fires INSTEAD — denied feedback, never silence. */
  onAbilityCapped?: (slot: number) => void;
  /** Is the refit modal open? While true: Q/E/R/F are suspended and digits
   *  pick cards; helm/zoom/M/P stay live. */
  isModalOpen?: () => boolean;
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
   * SLOT_COUNT; a press against a full queue fires onAbilityCapped (denied
   * feedback — Story 2.1 closes the silent-drop debt). Cleared on the hard
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
    bind(Object.keys(REFIT_DIGIT_CODES), this.handleDigitKey);
    // F (Foghorn-reserved) and Space are BOUND-INERT: prevented, no action.
    bind(['KeyF', 'Space'], () => undefined);
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
    bind(['KeyP'], this.edge(() => this.hooks.onNetDebug?.()));
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
   * Q/E/R: the slot keys. Suspended (prevented-inert) while the refit modal is
   * open — full combat lockout. An unfitted slot is inert (no feedback — the
   * ruled R-while-empty behavior), and the fitted check FAILS CLOSED: no hook
   * means no fitted slots. Ability slots ACTIVATE through the FIFO; weapon
   * slots toggle the prime (switch-to / same-key-reverts).
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
    if (this.hooks.isModalOpen?.() === true) return;
    if (this.hooks.isSlotFitted?.(slot) !== true) return;
    if (this.hooks.isAbilitySlot?.(slot) === true) {
      this.activateAbility(slot);
      return;
    }
    this.primed = nextPrimedSlot(this.primed, slot);
  }

  /** Digits 1–5: a refit pick while the modal is open — a card (1–4) or the
   *  DAMAGE CONTROL rail (5 → HEAL_CHOICE); refit-or-nothing otherwise (the old
   *  digit slot-priming and closed-window spend are dead — amendment 3).
   *  Meaning is evaluated against modal state at THIS keydown. */
  private readonly handleDigitKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (this.hooks.isModalOpen?.() !== true) return;
    this.hooks.onRefitPick?.(REFIT_DIGIT_CODES[e.code]);
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
   * Revert the prime to the gun (slot 0). main.ts calls this on a
   * predicted-fireable skillshot click — the special fires once, then the gun
   * is the weapon again (Eric ruling 2026-07-21, re-ratified 2026-07-24). A
   * predicted-DENIED click keeps the prime instead (the caller simply doesn't
   * call this).
   */
  revertToGun(): void {
    this.primed = SLOT_GUN;
  }
}
