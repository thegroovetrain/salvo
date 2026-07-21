// Keyboard driving + skillshot priming input. Tracks the set of held
// `event.code`s on the window, clears on blur (fixes the classic stuck-key
// bug when focus is lost), and tracks the PRIMED loadout slot from the
// number-row keys 1/2/3. The class is a thin DOM adapter; the pure pieces
// (`rudderFrom`, `panAxesFrom`, `primeSlotFromKey`, `nextPrimedSlot`, and the
// telegraph module) are unit-tested.
//
// Prime model (Eric ruling 2026-07-21): the gun (slot 0) is the permanently
// selected default. 2/3 PRIME the torpedo (slot 1) / mine (slot 2) skillshot —
// the next shot fires that instead, then the gun is the weapon again. Pressing
// the same key again CANCELS the prime; 1 explicitly reverts to gun; there is
// no timeout. Priming is pure client UX — the wire slot per click is the truth,
// and main.ts consumes the prime (back to gun) only on a predicted-fireable
// click (sim/inputSampler.primeFireable).
//
// Throttle is NO LONGER a held axis: W/S (and Up/Down arrows) TAP the engine
// telegraph (input/telegraph.ts) one detent per keydown edge — a persistent
// stepped setting the sampler reads each tick. The held-key set still records
// W/S so spectator free-pan can read all four WASD directions (panAxesFrom);
// driving reads throttle from the telegraph + rudder from the held set.

import { SLOT_GUN } from '@salvo/shared';
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
   */
  constructor(
    private readonly onDetent?: (dir: Step, changed: boolean) => void,
    private readonly onUpgradeKey?: (a: UpgradeAction) => void,
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
    const slot = primeSlotFromKey(e.code);
    if (slot !== null) this.primed = nextPrimedSlot(this.primed, slot);
  };
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
   * Revert the prime to the gun (slot 0). main.ts calls this on a
   * predicted-fireable skillshot click — the special fires once, then the gun
   * is the weapon again (Eric ruling 2026-07-21). A predicted-DENIED click
   * keeps the prime instead (the caller simply doesn't call this).
   */
  revertToGun(): void {
    this.primed = SLOT_GUN;
  }
}
