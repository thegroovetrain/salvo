// THE in-match keyboard chokepoint (Story 2.1 — the fixed v1 scheme). One
// window keydown listener owns every sim key: a declarative binding table
// (code → handler) evaluated in one dispatcher with full browser hygiene —
// every bound key preventDefault-ed (TAB focus-cycle and Space page-scroll
// included), modifier chords (CTRL/META/ALT) left native, and a focused text
// input or DOM button suppressing ALL sim keys while the sim keeps running.
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
//   ESC            closes the topmost surface (the modal; settings at 2.3)
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

import { EQUIPMENT_IS_WEAPON, SLOT_COUNT, SLOT_GUN, type EquipmentId } from '@salvo/shared';
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

/** Slot key → the loadout slot it addresses (the ratified Q/E/R scheme):
 *  Q/E = the two class-special slots, R = the pickup/extra slot. The gun
 *  (slot 0) has NO key — it is the always-selected default. */
export const SLOT_KEY_CODES: Record<string, number> = {
  KeyQ: 1,
  KeyE: 2,
  KeyR: 3,
};

/** Digit key → refit-card index 0..3 (top row + numpad). Digits mean a card
 *  pick ONLY while the refit modal is open; refit-or-nothing otherwise. */
export const REFIT_DIGIT_CODES: Record<string, number> = {
  Digit1: 0, Numpad1: 0,
  Digit2: 1, Numpad2: 1,
  Digit3: 2, Numpad3: 2,
  Digit4: 3, Numpad4: 3,
};

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
 * Mine Layer's BOTH specials (mine + decoyBuoy) answer true. Weapons and
 * empty/out-of-range slots return false (they prime / do nothing). The single
 * weapon/ability split source is the shared map; main.ts closes this over the
 * own loadout (loadoutFor(you.cls)) for the isAbilitySlot hook.
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
 * Pure: is the currently-focused element a text-entry surface or DOM button?
 * While one owns focus the chokepoint suppresses ALL sim keys (no handling,
 * no preventDefault — typing "wasd" in the callsign field must steer nothing
 * and still type). The sim itself never pauses.
 */
export function textEntryFocused(doc: Document = document): boolean {
  const el = doc.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON';
}

/**
 * The chokepoint's callbacks into the app (main.ts wires them over the late-
 * bound Game). Every hook is optional so pure-driving tests stay terse.
 */
export interface KeyboardHooks {
  /** A throttle keydown edge: step direction + whether the detent changed
   *  (false at an end stop) — wired to the telegraph-click tone. */
  onDetent?: (dir: Step, changed: boolean) => void;
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
  /** TAB — toggle the refit modal (main.ts owns the only-with-a-banked-point
   *  open rule and pick/TAB/ESC close rules). */
  onRefitToggle?: () => void;
  /** Digit 1–4 while the modal is open — pick card `choice` (0-based). */
  onRefitPick?: (choice: number) => void;
  /** ESC — close the topmost surface (in-match: the refit modal). */
  onEscape?: () => void;
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (textEntryFocused()) return;
    if (e.shiftKey && e.code === 'Tab') {
      e.preventDefault();
      return;
    }
    const handler = this.bindings.get(e.code);
    if (handler === undefined) return;
    e.preventDefault();
    handler(e);
  };

  /** W/S (+arrows): record the held state (spectator pan reads it) and step
   *  the telegraph one detent per keydown EDGE (repeat → stepFromKey null). */
  private readonly handleThrottleKey = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    const step = stepFromKey(e.code, e.repeat);
    if (step === null) return;
    const changed = this.telegraph.step(step);
    this.hooks.onDetent?.(step, changed);
  };

  /** A/D (+arrows): held rudder — state only, read by axes()/panAxes(). */
  private readonly handleRudderKey = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
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
    if (this.hooks.isModalOpen?.() === true) return;
    const slot = SLOT_KEY_CODES[e.code];
    if (this.hooks.isSlotFitted?.(slot) !== true) return;
    if (this.hooks.isAbilitySlot?.(slot) === true) {
      this.activateAbility(slot);
      return;
    }
    this.primed = nextPrimedSlot(this.primed, slot);
  };

  /** Digits 1–4: a refit-card pick while the modal is open; refit-or-nothing
   *  otherwise (the old digit slot-priming and closed-window spend are dead —
   *  amendment 3). Meaning is evaluated against modal state at THIS keydown. */
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

  /** Driving axes: telegraph throttle order + held rudder. */
  axes(): Axes {
    return { throttle: this.telegraph.throttle, rudder: rudderFrom(this.keys) };
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
