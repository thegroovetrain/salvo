// THE UNIT PIPS (Story 10.6, Eric 2026-11-05, R6 / R7, epic-10 amendment 12) —
// the per-tube and per-rack state on the `Q` / `E` squares, pure.
//
// A torpedo now leaves one of up to FOUR tubes (two launchers × two tubes),
// each on its own reload clock (R6: "Each tube has its own cooldown"), and a
// mine one of up to TWO racks, each holding its own mines on ONE clock (R7).
// The square's one wipe + numeral is the SLOT's summary (the soonest reload,
// shown only when nothing is ready — amendment 34's cooling read); the pips
// are the per-unit truth the summary cannot carry:
//   - `Q`: one pip per TUBE, one column per LAUNCHER (fore first). A loaded
//     tube's pip is full; a reloading tube's pip fills from its floor with
//     its own clock's progress.
//   - `E`: one pip per mine SEAT, one column per RACK. The first `n` pips are
//     full (mines held); while the rack's clock runs, the next pip fills with
//     its progress; the rest are empty.
//   - the MAIN BATTERY (Eric 2026-11-05: "can you give the main gun the same
//     treatment?"): one pip per TURRET in ONE column, bottom-up in turret
//     order, each on its own reload clock (the predicted own battery).
// No words, no new color: the full pip is the ready-weapon phosphor, the empty
// one a muted hairline (render/hotbar.ts paints them). Pips draw only when the
// slot holds MORE THAN ONE unit (the badge's own threshold, which they
// replace): a lone tube is the single-round square it always was.
//
// The geometry is `pipRects` — columns along the square's left inside edge,
// bottom-up, clear of the centred glyph and the bottom-right tier numeral.

import type { LauncherState, RackState, TurretState } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { Rect } from './hudBar.js';

const P = CLIENT_CONFIG.hudBar.pips;

/** One pip: its column (launcher / rack index) and how full it is — 1 ready,
 *  (0, 1) a running clock's progress, 0 empty. */
export interface UnitPip {
  group: number;
  fill: number;
}

/** 0..1 — a clock's progress with `msLeft` of `reloadMs` to run (0 when unknown). */
function progress(msLeft: number, reloadMs: number): number {
  if (!(reloadMs > 0) || !(msLeft > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - msLeft / reloadMs));
}

/** Pure: one pip per tube, a column per launcher; `reloadMs` = the held
 *  torpedo's FOLDED reload (`equipmentReloadMs`). */
export function tubePips(launchers: readonly LauncherState[], reloadMs: number): UnitPip[] {
  return launchers.flatMap((l, group) => l.tubes.map((t) => ({ group, fill: t <= 0 ? 1 : progress(t, reloadMs) })));
}

/** Pure: one pip per main-battery turret, all in ONE column, turret order;
 *  `reloadMs` = the battery's FOLDED reload. */
export function turretPips(turrets: readonly TurretState[], reloadMs: number): UnitPip[] {
  return turrets.map((t) => ({ group: 0, fill: t.reloadMsLeft <= 0 ? 1 : progress(t.reloadMsLeft, reloadMs) }));
}

/** Pure: one pip per seat of `capacity`, a column per rack; `reloadMs` = the
 *  held mine's FOLDED reload. */
export function rackPips(racks: readonly RackState[], capacity: number, reloadMs: number): UnitPip[] {
  const out: UnitPip[] = [];
  racks.forEach((r, group) => {
    for (let k = 0; k < capacity; k++) {
      const fill = k < r.n ? 1 : k === r.n ? progress(r.reloadMsLeft, reloadMs) : 0;
      out.push({ group, fill });
    }
  });
  return out;
}

/** Pure: the pips to draw — null when there is one unit or fewer (the
 *  single-round square needs none). */
export function shownPips(pips: readonly UnitPip[]): UnitPip[] | null {
  return pips.length > 1 ? [...pips] : null;
}

/** Pure: each pip's rect in a square, in `pips` order — one column per group
 *  from the left inside edge, each column filled bottom-up. */
export function pipRects(square: Rect, pips: readonly UnitPip[]): Rect[] {
  const row = new Map<number, number>();
  return pips.map((p) => {
    const k = row.get(p.group) ?? 0;
    row.set(p.group, k + 1);
    return {
      x: square.x + P.inset + p.group * (P.w + P.colGap),
      y: square.y + square.h - P.inset - (k + 1) * P.h - k * P.gap,
      w: P.w,
      h: P.h,
    };
  });
}
