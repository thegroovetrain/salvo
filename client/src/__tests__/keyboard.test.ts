import { describe, it, expect, afterEach } from 'vitest';
import { WEAPON } from '@salvo/shared';
import {
  rudderFrom,
  panAxesFrom,
  weaponFromKey,
  upgradeActionFromKey,
  KeyboardInput,
  type UpgradeAction,
} from '../input/keyboard.js';

describe('rudderFrom (held A/D)', () => {
  it('is zero with no keys', () => {
    expect(rudderFrom(new Set())).toBe(0);
  });

  it('D = right (+1), A = left (-1), with arrow aliases', () => {
    expect(rudderFrom(new Set(['KeyD']))).toBe(1);
    expect(rudderFrom(new Set(['KeyA']))).toBe(-1);
    expect(rudderFrom(new Set(['ArrowRight']))).toBe(1);
    expect(rudderFrom(new Set(['ArrowLeft']))).toBe(-1);
  });

  it('opposing keys cancel; W/S and unrelated keys are ignored', () => {
    expect(rudderFrom(new Set(['KeyA', 'KeyD']))).toBe(0);
    expect(rudderFrom(new Set(['KeyW', 'KeyS', 'Space']))).toBe(0);
  });
});

describe('panAxesFrom (spectator held-WASD, both axes)', () => {
  it('reads held W/S as throttle and A/D as rudder', () => {
    expect(panAxesFrom(new Set(['KeyW', 'KeyD']))).toEqual({ throttle: 1, rudder: 1 });
    expect(panAxesFrom(new Set(['KeyS', 'KeyA']))).toEqual({ throttle: -1, rudder: -1 });
    expect(panAxesFrom(new Set(['ArrowUp', 'ArrowLeft']))).toEqual({ throttle: 1, rudder: -1 });
  });

  it('opposing keys cancel on both axes', () => {
    expect(panAxesFrom(new Set(['KeyW', 'KeyS']))).toEqual({ throttle: 0, rudder: 0 });
    expect(panAxesFrom(new Set(['KeyA', 'KeyD']))).toEqual({ throttle: 0, rudder: 0 });
  });
});

describe('weaponFromKey', () => {
  it('maps 1/2/3 (top row + numpad) to gun/torpedo/mine', () => {
    expect(weaponFromKey('Digit1')).toBe(WEAPON.gun);
    expect(weaponFromKey('Digit2')).toBe(WEAPON.torpedo);
    expect(weaponFromKey('Digit3')).toBe(WEAPON.mine);
    expect(weaponFromKey('Numpad1')).toBe(WEAPON.gun);
    expect(weaponFromKey('Numpad2')).toBe(WEAPON.torpedo);
    expect(weaponFromKey('Numpad3')).toBe(WEAPON.mine);
  });

  it('returns null for non-weapon keys (so selection is left unchanged)', () => {
    expect(weaponFromKey('KeyW')).toBeNull();
    expect(weaponFromKey('Digit4')).toBeNull();
    expect(weaponFromKey('Space')).toBeNull();
  });
});

describe('upgradeActionFromKey', () => {
  it('maps bare Control (either side) to the window toggle', () => {
    expect(upgradeActionFromKey('ControlLeft', true)).toEqual({ kind: 'toggle' });
    expect(upgradeActionFromKey('ControlRight', true)).toEqual({ kind: 'toggle' });
  });

  it('maps CTRL+digit (top row + numpad) to offer slots 0/1/2', () => {
    expect(upgradeActionFromKey('Digit1', true)).toEqual({ kind: 'choose', slot: 0 });
    expect(upgradeActionFromKey('Digit2', true)).toEqual({ kind: 'choose', slot: 1 });
    expect(upgradeActionFromKey('Digit3', true)).toEqual({ kind: 'choose', slot: 2 });
    expect(upgradeActionFromKey('Numpad1', true)).toEqual({ kind: 'choose', slot: 0 });
    expect(upgradeActionFromKey('Numpad3', true)).toEqual({ kind: 'choose', slot: 2 });
  });

  it('maps CTRL+E to heal', () => {
    expect(upgradeActionFromKey('KeyE', true)).toEqual({ kind: 'heal' });
  });

  it('requires CTRL for digits/E (a plain digit stays a weapon key → null here)', () => {
    expect(upgradeActionFromKey('Digit1', false)).toBeNull();
    expect(upgradeActionFromKey('KeyE', false)).toBeNull();
  });

  it('is null for CTRL+non-window keys (Digit4, KeyW, Space)', () => {
    expect(upgradeActionFromKey('Digit4', true)).toBeNull();
    expect(upgradeActionFromKey('KeyW', true)).toBeNull();
    expect(upgradeActionFromKey('Space', true)).toBeNull();
  });
});

// --- KeyboardInput adapter: real keydown/keyup edges via window events -------

function press(code: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
}

/** Dispatch a keydown with CTRL held; returns true if the handler preventDefault'd it. */
function pressCtrl(code: string, repeat = false): boolean {
  const e = new KeyboardEvent('keydown', { code, repeat, ctrlKey: true, cancelable: true });
  return !window.dispatchEvent(e); // dispatchEvent → false when preventDefault was called
}
function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('KeyboardInput — telegraph driving', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('taps W/S to step the throttle order one detent per keydown edge', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(kb.axes().throttle).toBe(0);
    press('KeyW');
    expect(kb.axes().throttle).toBe(0.25);
    press('KeyW');
    expect(kb.axes().throttle).toBe(0.5);
    press('KeyS');
    expect(kb.axes().throttle).toBe(0.25);
    expect(kb.throttleIndex).toBe(5);
  });

  it('ignores OS key-repeat so holding W does not run up the scale', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW'); // one real tap
    press('KeyW', true); // auto-repeat while held
    press('KeyW', true);
    expect(kb.throttleIndex).toBe(5); // still one step from neutral (4)
    expect(kb.throttle).toBe(0.25);
  });

  it('fires onDetent with the direction + changed flag (silent at the end stop)', () => {
    const calls: Array<[number, boolean]> = [];
    kb = new KeyboardInput((dir, changed) => calls.push([dir, changed]));
    kb.attach();
    for (let i = 0; i < 5; i++) press('KeyW'); // 4 real steps then the stop
    expect(calls).toEqual([
      [1, true],
      [1, true],
      [1, true],
      [1, true],
      [1, false],
    ]);
  });

  it('drives rudder from held A/D independently of the throttle order', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW'); // order +0.25
    press('KeyD'); // rudder held right
    expect(kb.axes()).toEqual({ throttle: 0.25, rudder: 1 });
    release('KeyD');
    expect(kb.axes()).toEqual({ throttle: 0.25, rudder: 0 });
  });

  it('resetThrottle returns the order to neutral without dropping held keys', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW');
    press('KeyW');
    press('KeyD'); // held rudder
    expect(kb.throttle).toBe(0.5);
    kb.resetThrottle();
    expect(kb.throttle).toBe(0);
    expect(kb.axes().rudder).toBe(1); // rudder still held
  });

  it('clearKeys drops held keys but PRESERVES the throttle order (not a held key)', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW');
    press('KeyW'); // order 0.5
    press('KeyD'); // held rudder
    kb.clearKeys();
    expect(kb.axes().rudder).toBe(0); // held keys gone
    expect(kb.throttle).toBe(0.5); // deliberate order survives
  });

  it('blur clears held keys but keeps the throttle order steaming', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW');
    press('KeyD');
    window.dispatchEvent(new Event('blur'));
    expect(kb.axes().rudder).toBe(0);
    expect(kb.throttle).toBe(0.25);
  });

  it('latches the weapon from 1/2/3 and keeps it across clearKeys', () => {
    kb = new KeyboardInput();
    kb.attach();
    expect(kb.weapon).toBe(WEAPON.gun);
    press('Digit2');
    expect(kb.weapon).toBe(WEAPON.torpedo);
    kb.clearKeys();
    expect(kb.weapon).toBe(WEAPON.torpedo);
  });

  it('held W/S still populate the pan axes (for spectator free-pan)', () => {
    kb = new KeyboardInput();
    kb.attach();
    press('KeyW'); // steps the order AND records the held key
    expect(kb.panAxes()).toEqual({ throttle: 1, rudder: 0 });
    release('KeyW');
    expect(kb.panAxes()).toEqual({ throttle: 0, rudder: 0 });
  });
});

describe('KeyboardInput — CTRL upgrade window', () => {
  let kb: KeyboardInput | undefined;
  afterEach(() => kb?.detach());

  it('CTRL+Digit1 fires the action, preventDefaults, and does NOT latch a weapon', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    const prevented = pressCtrl('Digit1');
    expect(actions).toEqual([{ kind: 'choose', slot: 0 }]);
    expect(prevented).toBe(true);
    expect(kb.weapon).toBe(WEAPON.gun); // unchanged: gun was already selected, torp/mine never latched
  });

  it('a plain Digit2 still selects a weapon (no CTRL → not an upgrade key)', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    press('Digit2');
    expect(actions).toEqual([]);
    expect(kb.weapon).toBe(WEAPON.torpedo);
  });

  it('bare Control toggles; auto-repeat (e.repeat) is ignored (one action per press)', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('ControlLeft');
    pressCtrl('ControlLeft', true); // OS auto-repeat while held
    pressCtrl('ControlLeft', true);
    expect(actions).toEqual([{ kind: 'toggle' }]);
  });

  it('CTRL+KeyW does not tap the telegraph (CTRL is a modifier, never drives)', () => {
    const actions: UpgradeAction[] = [];
    kb = new KeyboardInput(undefined, (a) => actions.push(a));
    kb.attach();
    pressCtrl('KeyW');
    expect(actions).toEqual([]); // KeyW is not a window key
    expect(kb.throttle).toBe(0); // and it did not ring the engine up
  });
});
