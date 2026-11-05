// THE RIGHT BUTTON'S TWO MEANINGS (Story 10.5, 2026-11-05, epic-10 amendment
// 11 — orchestrator ruling B). Pure, no DOM.
//
// With a slot WEAPON READIED (Q / E / R primed — the client-local prime model,
// input/keyboard.ts), a right PRESS CANCELS the ready and fires nothing: the
// secondaries level stays false until the button is released and pressed
// again. While a weapon is readied the secondaries are NEVER sent — which also
// covers a right button that was already held when the weapon was readied.
// With nothing readied the right button is the secondaries exactly as Story
// 10.4 built it (the canvas-target, lock and hotbar-swallow gates included).

/** What one right-button press does. */
export type RightPressVerdict = 'ignore' | 'cancelReady' | 'secondaries';

/** The facts a right press is judged against, at the press itself. */
export interface RightPressFacts {
  /** The press landed on the game canvas (DOM chrome never acts). */
  onCanvas: boolean;
  /** The combat lockout (refit window / held start line) is in force. */
  locked: boolean;
  /** The press is over the HUD bar, which swallows it (Story 10.4 gate C3a). */
  overHotbar: boolean;
  /** A slot weapon is readied (the primed slot is not the gun). */
  readied: boolean;
}

/**
 * Pure: the verdict for one right-button PRESS. The Story 10.4 gates keep
 * their order and their silence (off-canvas, locked, over the bar → nothing);
 * past them a readied weapon turns the press into a CANCEL, and only an
 * unreadied press is the secondaries.
 */
export function rightPressVerdict(f: RightPressFacts): RightPressVerdict {
  if (!f.onCanvas || f.locked || f.overHotbar) return 'ignore';
  return f.readied ? 'cancelReady' : 'secondaries';
}

/**
 * Pure: the secondaries LEVEL the wire carries this tick — the raw level
 * (live hold OR a latched tap) masked while a weapon is readied, so a ready
 * blocks every secondary round until it is cancelled or fired.
 */
export function secondariesLevel(raw: boolean, readied: boolean): boolean {
  return raw && !readied;
}
