// THE GUNNERY FEED (Story 4.3) — the two pure rate/identity rules the three new
// gunnery signals need on arrival, in the deniedFire house shape (pure logic, no
// Pixi import, unit tested). net/roomBindings.ts owns the dispatch; this owns the
// rules the dispatch obeys.
//
// THE RULE IT ENCODES — ONE EVENT, ONE MARK. Story 4.3 put the shooter's own
// gunnery on the wire twice over, deliberately: the shipped PUBLIC rows (`boom`,
// which everyone in sight of an impact receives) and the new SELF-PRIVATE rows
// (`hc` Hit Call / `sp` fall of shot, which reach the shooter through any fog).
// A shooter who can SEE their own impact therefore receives BOTH, in the SAME
// frame, at the SAME point — the server derives them from one resolution and
// pushes byte-identical coordinates. Rendered naively that is two sparks stacked
// on one pixel: a double-bright flash that reads as "two hits" for exactly the
// shots you can already see, and a single one for the fogged shots the story
// exists to report. So arrival claims the impact POINT rather than the event:
// whichever row lands first draws the mark and the other is suppressed. The
// claim is order-INDEPENDENT by construction — it knows nothing about which row
// it is serving — because the emission order is a server implementation detail
// (`world.resolveShell` happens to push `boom` before `hc`/`sp` today) and this
// must not quietly depend on it.
//
// THE SECOND RULE — THE SAME-SOURCE TONE FLOOR. There is no rate limiting in the
// audio layer: every call site does its own (the `DenialDedup` precedent), and a
// 3-shell salvo landing inside 200ms would otherwise fire three Hit Call tones
// on top of each other. All three blooms still draw — they are three separate
// facts about three separate points — but the CUE lands once, on the ratified
// 300ms same-source floor (the deniedFire grammar, reused verbatim).

import { CLIENT_CONFIG } from '../config.js';

/**
 * Quantization (world units) of an impact-position key. Deliberately fine: the
 * two rows carry the SAME float, copied from one resolution point, so this is an
 * EXACT identity test and not a proximity heuristic — the quantum only exists so
 * the key is a stable string. Two genuinely different impacts 0.1u apart are one
 * ten-thousandth of a hull length apart and could not be told apart on screen
 * anyway.
 */
export const IMPACT_KEY_U = 0.1;

/** Pure: the dedupe key for an impact at (x, y). */
export function impactKey(x: number, y: number): string {
  return `${Math.round(x / IMPACT_KEY_U)}:${Math.round(y / IMPACT_KEY_U)}`;
}

/**
 * Per-frame impact-mark claim. `beginFrame()` at the top of a frame's event
 * batch, then `claim(x, y)` once per mark that wants to draw at that point:
 * the first claimant in the frame gets `true`, every later one `false`.
 *
 * Scoped to ONE frame on purpose. The pairing it dedupes is same-frame by
 * construction (one server resolution, one pending queue, one frame), and a
 * memory that outlived the frame would start eating legitimately repeated
 * marks — a second salvo walked back onto the same water, or a minefield
 * chain-detonating at a fixed point.
 */
export class ImpactDedup {
  private readonly claimed = new Set<string>();

  /** Drop the previous frame's claims. Call once per frame, before the batch. */
  beginFrame(): void {
    this.claimed.clear();
  }

  /** True iff nothing has claimed this point yet THIS frame (and claims it). */
  claim(x: number, y: number): boolean {
    const key = impactKey(x, y);
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}

/**
 * A minimum gap between plays of ONE cue, in the caller's own clock (Hit Call
 * feeds it the FRAME's server time `t`, so the floor measures server-side
 * spacing and cannot chatter on local clock jitter). The first request always
 * passes; a request inside the floor is refused WITHOUT extending the window,
 * so a continuous stream still lands at a steady 1-per-floor rather than going
 * permanently silent.
 */
export class ToneFloor {
  private lastAt = -Infinity;

  constructor(private readonly floorMs: number) {}

  /** True iff the cue may play at `nowMs` (and records that it did). */
  request(nowMs: number): boolean {
    if (nowMs - this.lastAt < this.floorMs) return false;
    this.lastAt = nowMs;
    return true;
  }
}

/** The Hit Call's tone floor, on the ratified 300ms same-source grammar. */
export function hitCallToneFloor(): ToneFloor {
  return new ToneFloor(CLIENT_CONFIG.gunnery.hitCallToneFloorMs);
}
