// Keyboard driving + weapon selection input. Tracks the set of held
// `event.code`s on the window, clears on blur (fixes the classic stuck-key bug
// when focus is lost), derives throttle/rudder axes, and latches the selected
// weapon from the number-row keys 1/2/3. `axesFrom` + `weaponFromKey` are pure
// and unit-tested; the class is a thin DOM adapter. The keyboard OWNS the
// key→weapon mapping; selection is client state, sent per input and echoed by
// the server in OwnShip.weapon.

import { WEAPON, type WeaponId } from '@salvo/shared';

/** Driving axes derived from held keys. Both in [-1, 1]. */
export interface Axes {
  /** -1 full astern (S) .. +1 full ahead (W). */
  throttle: number;
  /** -1 full left (A) .. +1 full right (D). */
  rudder: number;
}

const AHEAD = ['KeyW', 'ArrowUp'];
const ASTERN = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

/** Number-key → weapon selection (top row + numpad). */
const WEAPON_KEYS: Record<string, WeaponId> = {
  Digit1: WEAPON.gun,
  Numpad1: WEAPON.gun,
  Digit2: WEAPON.torpedo,
  Numpad2: WEAPON.torpedo,
  Digit3: WEAPON.mine,
  Numpad3: WEAPON.mine,
};

function anyHeld(keys: Set<string>, codes: string[]): boolean {
  return codes.some((c) => keys.has(c));
}

/** Pure: map a set of held key codes to throttle/rudder axes. */
export function axesFrom(keys: Set<string>): Axes {
  let throttle = 0;
  let rudder = 0;
  if (anyHeld(keys, AHEAD)) throttle += 1;
  if (anyHeld(keys, ASTERN)) throttle -= 1;
  if (anyHeld(keys, RIGHT)) rudder += 1;
  if (anyHeld(keys, LEFT)) rudder -= 1;
  return { throttle, rudder };
}

/** Pure: the weapon a key code selects, or null if it isn't a weapon key. */
export function weaponFromKey(code: string): WeaponId | null {
  return code in WEAPON_KEYS ? WEAPON_KEYS[code] : null;
}

export class KeyboardInput {
  readonly keys = new Set<string>();
  private selectedWeapon: WeaponId = WEAPON.gun;

  private readonly onDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
    const w = weaponFromKey(e.code);
    if (w !== null) this.selectedWeapon = w;
  };
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

  /** Current driving axes. */
  axes(): Axes {
    return axesFrom(this.keys);
  }

  /**
   * Drop all held keys without requiring their keyup events. Used on blur
   * (stuck-key fix) and, from main.ts, on the death -> spectate transition —
   * a WASD axis held at the moment of death would otherwise read as nonzero
   * on the very first spectate frame and permanently engage free-pan,
   * defeating the follow-your-killer default. Clearing here means a genuinely
   * held key only re-populates the set on its next OS auto-repeat keydown,
   * which reads as a fresh press rather than a carried-over hold.
   */
  clearKeys(): void {
    this.keys.clear();
  }

  /** Currently-selected weapon (latched by the last 1/2/3 press). */
  get weapon(): WeaponId {
    return this.selectedWeapon;
  }
}
