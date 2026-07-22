// Keyboard driving + skillshot priming input. Tracks the set of held
// `event.code`s on the window, clears on blur (fixes the classic stuck-key
// bug when focus is lost), and tracks the PRIMED loadout slot from the
// number-row keys 1/2/3. The class is a thin DOM adapter; the pure pieces
// (`rudderFrom`, `panAxesFrom`, `primeSlotFromKey`, `nextPrimedSlot`, and the
// telegraph module) are unit-tested.
//
// Prime model (Eric ruling 2026-07-21): the gun (slot 0) is the permanently
// selected default. 2/3 PRIME the slot's WEAPON skillshot (a torpedo bow-arc
// shot, a Battleship cannon/star shell) — the next shot fires that instead, then
// the gun is the weapon again. Pressing the same key again CANCELS the prime; 1
// explicitly reverts to gun; there is no timeout. If a slot holds an instant
// ABILITY instead (the TB's speedBoost, or — Story 1.8 — the Mine Layer's mine +
// decoyBuoy), 2/3 ACTIVATE it immediately (actSeq) and never prime. Priming is
// pure client UX — the wire slot per click is the truth, and main.ts consumes the
// prime (back to gun) only on a predicted-fireable click (primeFireable).
//
// Throttle is NO LONGER a held axis: W/S (and Up/Down arrows) TAP the engine
// telegraph (input/telegraph.ts) one detent per keydown edge — a persistent
// stepped setting the sampler reads each tick. The held-key set still records
// W/S so spectator free-pan can read all four WASD directions (panAxesFrom);
// driving reads throttle from the telegraph + rudder from the held set.

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

/**
 * Number-key → the loadout slot it addresses (top row + numpad). 1 = gun
 * (slot 0, the default), 2 = torpedo (slot 1), 3 = mine (slot 2). The slot-index
 * == interregnum-equipment coupling (dies in Epic 2) lives here and in
 * render/weaponArc.ts; both read the same slot numbers.
 */
const PRIME_KEYS: Record<string, number> = {
  Digit1: SLOT_GUN,
  Numpad1: SLOT_GUN,
  Digit2: 1,
  Numpad2: 1,
  Digit3: 2,
  Numpad3: 2,
};

/**
 * A CTRL-window upgrade intent decoded off the keyboard: bare CTRL toggles the
 * informational spend window; CTRL+1/2/3 commit one of the front offer's three
 * slots; CTRL+E spends a point on a hull heal. Pure — the KeyboardInput adapter
 * turns these into onUpgradeKey callbacks; main.ts routes them to the menu/net.
 *
 * NOTE: `toggle` is never produced by `upgradeActionFromKey` (see below) — it
 * is emitted by the KeyboardInput adapter on Control **keyUp**, suppressed
 * when any chord fired during the hold. The variant stays here because it's
 * still the thing main.ts's onUpgradeKey callback receives and routes.
 */
export type UpgradeAction = { kind: 'toggle' } | { kind: 'choose'; slot: 0 | 1 | 2 } | { kind: 'heal' };

/** CTRL+digit (top row + numpad) → offer slot 0/1/2. */
const SLOT_KEYS: Record<string, 0 | 1 | 2> = {
  Digit1: 0, Numpad1: 0,
  Digit2: 1, Numpad2: 1,
  Digit3: 2, Numpad3: 2,
};

/**
 * Pure: the CHORD upgrade action a key code (with CTRL held) maps to, or null.
 * Deliberately does NOT classify the Control keys themselves — the bare-CTRL
 * toggle is Control-keyUp adapter logic (edge-triggered, chord-suppressed; see
 * KeyboardInput), not a chord decodable from a single (code, ctrl) pair. CTRL
 * is required for every chord here; plain digits still latch weapons, so an
 * unmodified digit yields null.
 */
export function upgradeActionFromKey(code: string, ctrl: boolean): UpgradeAction | null {
  if (!ctrl) return null;
  if (code === 'KeyE') return { kind: 'heal' };
  if (code in SLOT_KEYS) return { kind: 'choose', slot: SLOT_KEYS[code] };
  return null;
}

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

/** Pure: the loadout slot a number key addresses, or null if it isn't one. */
export function primeSlotFromKey(code: string): number | null {
  return code in PRIME_KEYS ? PRIME_KEYS[code] : null;
}

/**
 * Pure: does `slot` of the own loadout hold instant-activation ABILITY
 * equipment (`EQUIPMENT_IS_WEAPON[id] === false`)? Those are the TB's
 * speedBoost and — Story 1.8 — the Mine Layer's BOTH specials (mine + decoyBuoy,
 * so an ML answers true for slots 1 AND 2). Weapons and empty/out-of-range slots
 * return false (they prime / do nothing, exactly as today). The single
 * weapon/ability split source is the shared map; main.ts closes this over the
 * own loadout (loadoutFor(you.cls)) for the KeyboardInput predicate — Story 1.6's
 * minimal control extension (Epic 2 owns the Q/E/R/F rebinding).
 */
export function slotHoldsAbility(slotIds: readonly (EquipmentId | null)[], slot: number): boolean {
  const id = slotIds[slot] ?? null;
  return id !== null && !EQUIPMENT_IS_WEAPON[id];
}

/**
 * Pure: the primed slot after a number key addressing `keySlot` is pressed,
 * given the `current` primed slot. Pressing 1 (gun) or the SAME key that is
 * already primed reverts to the gun (slot 0); any other slot key primes that
 * slot. No timeout — priming is a set-and-hold state.
 */
export function nextPrimedSlot(current: number, keySlot: number): number {
  if (keySlot === SLOT_GUN) return SLOT_GUN;
  if (keySlot === current) return SLOT_GUN; // same key again cancels
  return keySlot;
}

export class KeyboardInput {
  readonly keys = new Set<string>();
  readonly telegraph = new Telegraph();
  /** The primed skillshot slot (0 = gun/unprimed). Pure client UX; survives
   *  clearKeys like the old weapon latch did. main.ts reverts it to gun on a
   *  predicted-fireable click (revertToGun). */
  private primed = SLOT_GUN;
  /**
   * FIFO queue of accepted ability-activation slots awaiting consumption onto
   * the wire. The server activates AT MOST ONE ability per tick
   * (World.activationControl: `actSeq > lastActSeq` fires once on actSlot), so
   * multiple presses inside one 50ms sample window MUST be spread across
   * successive inputs — consumeActivation() drains exactly one per built input.
   * Without this, two different-slot presses in one window collapse (actSeq
   * jumps by 2, the server fires only the last slot once, the first press is
   * lost silently — the Mine Layer is the first hull with two ability slots).
   * Capped at SLOT_COUNT to bound mashing; cleared on the hard state boundaries
   * (death / respawn / spectate / reconnect) so a queued press never fires into
   * the next life. */
  private readonly pendingActs: number[] = [];
  /** Cumulative CONSUMED ability-activation count (InputMsg.actSeq): 0 = never
   *  consumed. Monotonic and NEVER reset (mirrors the server's lastActSeq, which
   *  also survives death) — advanced by exactly 1 per consumeActivation() that
   *  drains a queued press, mirroring mouse.clickCount for fireSeq. */
  private actCount = 0;
  /** Loadout slot of the most recently CONSUMED activation (InputMsg.actSlot; 0 sentinel). */
  private lastActSlot = 0;
  /** Control is currently physically held (set on non-repeat keydown, cleared on keyup/blur). */
  private ctrlHeld = false;
  /**
   * Set on ANY other keydown observed while Control is held — whether or not
   * it decodes as one of our chords. Suppresses the bare-CTRL toggle on
   * Control keyUp: this is what stops CTRL+1 (open, then the chord fires) and
   * CTRL+C/CTRL+T (an unrelated browser chord) from ever toggling the window.
   */
  private chordUsed = false;

  /**
   * @param onDetent Called on each throttle keydown edge with the step
   *   direction and whether the detent actually changed (false at an end stop)
   *   — main.ts wires this to the telegraph-click tone.
   * @param onUpgradeKey Called for each upgrade-window action: CTRL+1/2/3/E
   *   fire on their keydown edge (chord, via upgradeActionFromKey); the bare
   *   `toggle` fires on Control's keyUp, and only if no chord fired during
   *   that hold — see handleControlUp(). main.ts routes it to the upgrade
   *   menu + spend.
   * @param isAbilitySlot Predicate: does this loadout slot hold ability
   *   (non-weapon) equipment on the OWN ship? main.ts closes it over the own
   *   loadout (slotHoldsAbility). When true, the slot's number key ACTIVATES
   *   instead of priming (Story 1.6).
   * @param onAbility Called on each genuine ability-activation press edge (at
   *   PRESS time — the press is queued, not yet consumed) with the slot and the
   *   actSeq value that press WILL ride once consumed (consumedCount + its queue
   *   depth). main.ts predicts the verdict for feedback (denied pulse / optimistic
   *   boost window keyed on that ride-actSeq).
   */
  constructor(
    private readonly onDetent?: (dir: Step, changed: boolean) => void,
    private readonly onUpgradeKey?: (a: UpgradeAction) => void,
    private readonly isAbilitySlot?: (slot: number) => boolean,
    private readonly onAbility?: (slot: number, actSeq: number) => void,
  ) {}

  /**
   * CTRL-chord keys take priority and consume the event: on a match we
   * preventDefault (suppresses the browser's ctrl+digit tab-switch where it
   * can) and return true so ctrl+Digit1 never also latches a weapon and
   * ctrl+W/E never taps the telegraph. Repeats are skipped so a held chord
   * key doesn't re-fire the action every OS auto-repeat tick.
   */
  private tryUpgradeKey(e: KeyboardEvent): boolean {
    if (e.repeat) return false;
    const action = upgradeActionFromKey(e.code, e.ctrlKey);
    if (action === null) return false;
    e.preventDefault();
    this.onUpgradeKey?.(action);
    return true;
  }

  /** Non-repeat Control keydown starts a fresh hold: mark held, clear the chord flag. */
  private handleControlDown(e: KeyboardEvent): void {
    if (e.repeat) return; // held Control auto-repeats; only the initial edge starts a hold
    this.ctrlHeld = true;
    this.chordUsed = false;
  }

  /** Control keyUp: the toggle fires here (not on keyDown), and only if the hold was chord-free. */
  private handleControlUp(): void {
    if (this.ctrlHeld && !this.chordUsed) this.onUpgradeKey?.({ kind: 'toggle' });
    this.ctrlHeld = false;
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      this.handleControlDown(e);
      return;
    }
    if (this.ctrlHeld) this.chordUsed = true;
    if (this.tryUpgradeKey(e)) return;
    if (e.ctrlKey) return; // CTRL is the upgrade modifier — it never drives/selects
    const step = stepFromKey(e.code, e.repeat);
    if (step !== null) {
      // Edge-only: OS auto-repeat is filtered by stepFromKey (repeat -> null),
      // so holding W taps exactly one detent. Still record the held state so
      // spectator pan (panAxesFrom) can read W/S; keyup clears it.
      this.keys.add(e.code);
      const changed = this.telegraph.step(step);
      this.onDetent?.(step, changed);
      return;
    }
    this.keys.add(e.code);
    this.handleSlotKey(e);
  };

  /** A number key addressing a loadout slot: ability slots ACTIVATE (Story 1.6),
   *  weapon slots prime exactly as before. */
  private handleSlotKey(e: KeyboardEvent): void {
    const slot = primeSlotFromKey(e.code);
    if (slot === null) return;
    if (this.isAbilitySlot?.(slot) === true) {
      // ABILITY slot: instant activation, NEVER a prime — the return here is
      // what keeps priming/arc code structurally unreachable for ability slots
      // (nextPrimedSlot below can never see this slot).
      this.activateAbility(e, slot);
      return;
    }
    this.primed = nextPrimedSlot(this.primed, slot);
  }

  /**
   * One ability-activation keypress (Story 1.6 control extension; Story 1.8's
   * two-ability Mine Layer made the queue load-bearing): QUEUE the slot rather
   * than bumping the wire counter directly, so the sampler can drain exactly one
   * press per input (the server fires one ability per tick). The SERVER decides —
   * a press while cooling or dead still queues and still rides an input; the
   * onAbility callback only predicts the verdict for feedback. OS auto-repeat is
   * filtered like every other edge-triggered key (one activation, not a stream),
   * and the queue is capped at SLOT_COUNT so pathological mashing (>4 presses in
   * one 50ms window) drops silently instead of growing unbounded.
   */
  private activateAbility(e: KeyboardEvent, slot: number): void {
    if (e.repeat) return;
    if (this.pendingActs.length >= SLOT_COUNT) return; // bound mashing
    this.pendingActs.push(slot);
    // Pass the actSeq this press WILL ride once consumed: consumedCount + its
    // queue depth (it is last in line, so it drains after all currently pending).
    // The boost optimistic-window predictor keys its clear-on-ack on this value,
    // so it stays correct even when other presses queue ahead of it.
    this.onAbility?.(slot, this.actCount + this.pendingActs.length);
  }

  /**
   * Drain EXACTLY ONE queued activation onto the wire counters, if any: advance
   * the cumulative consumed count (InputMsg.actSeq) by one and record its slot
   * (InputMsg.actSlot). main.ts calls this once per BUILT INPUT (the sample +
   * neutral-send sites) so multiple presses in one 50ms window ride successive
   * inputs and the server (one ability per tick) fires each in turn. A no-op
   * when the queue is empty — the counters simply repeat, the honest "no new
   * press" signal every non-pressing tick sends.
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
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.handleControlUp();
  };
  private readonly onBlur = (): void => {
    this.clearKeys();
    // A backgrounded tab may never deliver the matching Control keyUp — drop
    // the hold state so a stray/late keyup can't retroactively toggle the window.
    this.ctrlHeld = false;
    this.chordUsed = false;
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
   * Set by the last 2/3 prime (or 1/same-key cancel); survives clearKeys.
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
   * is the weapon again (Eric ruling 2026-07-21). A predicted-DENIED click
   * keeps the prime instead (the caller simply doesn't call this).
   */
  revertToGun(): void {
    this.primed = SLOT_GUN;
  }
}
