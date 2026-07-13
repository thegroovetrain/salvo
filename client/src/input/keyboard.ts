// Keyboard driving input. Tracks the set of held `event.code`s on the window,
// clears on blur (fixes the classic stuck-key bug when focus is lost), and
// derives throttle/rudder axes. `axesFrom` is pure and unit-tested; the class
// is a thin DOM adapter.

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

export class KeyboardInput {
  readonly keys = new Set<string>();

  private readonly onDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private readonly onBlur = (): void => {
    this.keys.clear();
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
}
