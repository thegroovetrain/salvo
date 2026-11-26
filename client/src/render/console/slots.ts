// THE BAR'S COOLDOWN ICONS (Story 12.3 Part B, AC 29 / 30; epic-12 amendment
// 3) — pure geometry and pure per-slot state, no Pixi.
//
// "None of the cooldown icons should EVER shift in position for ANY reason"
// (Eric 2026-11-19). So every slot position here is a function of the tile's
// body rect and the things fixed for a match — the hull's turret count, the
// fitted torpedo KIND and the fitted mine KIND — and of nothing else: never a
// current count, an unlock, a tier, a reload or a held mine. A slot that is
// not unlocked yet is LOCKED (drawn dashed gray, in place), never removed.
//
//   MAIN BATTERY  one shell per turret of the hull (3 or 4)
//   TORPEDO       always two launcher groups, fore then aft, each EXACTLY the
//                 held kind's tubes per launcher (Eric 2026-11-25, layout B
//                 "slots match the torpedo"), packed left
//   MINES         always two racks, each a wedge ring + its fixed slots
//                 (4 per rack naval / fouling, 2 captive — the most a rack can
//                 ever hold, EXPANDED MINE RACKS included)
//
// The icon outlines are the bench's SVG paths as polygons in their own boxes
// (shell 26 × 44, torpedo 24 × 48, mine 22 × 22), scaled into a slot; a
// countdown fills one FROM THE BOTTOM (`clipBelow`, a convex clip).

import {
  CATALOG,
  CONFIG,
  DEFAULT_CLASS_ID,
  effectiveStats,
  familyMembers,
  isMineEquipment,
  lineForEquipment,
  rackCapacity,
  type EquipmentId,
  type MineEquipmentId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import type { Rect } from './layout.js';
import type { MountClock, PreviewMarks, RackPips, Readout } from './readouts.js';

const B = CLIENT_CONFIG.console.bar;

export type IconKind = 'shell' | 'torp' | 'mine' | 'ring';

/** One fixed icon slot: its box, what it draws, its group (pair / rack) and
 *  its index inside the group. */
export interface IconSlot extends Rect {
  kind: IconKind;
  group: number;
  index: number;
}

// --- positions ------------------------------------------------------------------

/** The bottom-aligned y of an icon `h` tall in a body. */
function bottomY(body: Rect, h: number): number {
  return body.y + body.h - h;
}

/** Pure: MAIN BATTERY — one shell per turret, `itemGap` apart, left to right. */
export function shellSlots(body: Rect, turrets: number): IconSlot[] {
  const n = Math.max(0, Math.floor(Number.isFinite(turrets) ? turrets : 0));
  const S = B.shell;
  return Array.from({ length: n }, (_, i) => ({ kind: 'shell', group: 0, index: i, x: body.x + i * (S.w + B.itemGap), y: bottomY(body, S.h), w: S.w, h: S.h }));
}

/** The span between two groups: the row's item gaps around the spacer. */
export const GROUP_SPACER = 2 * B.itemGap + B.groupGap;

/** A per-group slot count, sanitised to a whole number of at least 1. */
function perGroup(n: number): number {
  return Math.max(1, Math.floor(Number.isFinite(n) ? n : 1));
}

/** Pure: TORPEDO — always `launchers` groups (fore, aft) of `perLauncher`
 *  tubes each, the held kind's (`slotsPerLauncher`), the aft group one
 *  `GROUP_SPACER` after the fore group's last tube (AC 29). */
export function tubeSlots(body: Rect, perLauncher: number): IconSlot[] {
  const T = B.torp;
  const n = perGroup(perLauncher);
  const groupW = n * T.w + (n - 1) * B.iconGap;
  const out: IconSlot[] = [];
  for (let g = 0; g < B.launchers; g++) {
    const gx = body.x + g * (groupW + GROUP_SPACER);
    for (let t = 0; t < n; t++) {
      out.push({ kind: 'torp', group: g, index: t, x: gx + t * (T.w + B.iconGap), y: bottomY(body, T.h), w: T.w, h: T.h });
    }
  }
  return out;
}

/** Pure: MINES — always `racks` racks, each its wedge ring then `perRack` slots. */
export function rackSlots(body: Rect, perRack: number): { rings: IconSlot[]; slots: IconSlot[] } {
  const M = B.mine;
  const n = perGroup(perRack);
  const groupW = B.rack + n * (B.iconGap + M.w);
  const rings: IconSlot[] = [];
  const slots: IconSlot[] = [];
  for (let r = 0; r < B.racks; r++) {
    const gx = body.x + r * (groupW + GROUP_SPACER);
    rings.push({ kind: 'ring', group: r, index: 0, x: gx, y: bottomY(body, B.rack), w: B.rack, h: B.rack });
    for (let j = 0; j < n; j++) {
      slots.push({ kind: 'mine', group: r, index: j, x: gx + B.rack + B.iconGap + j * (M.w + B.iconGap), y: bottomY(body, M.h), w: M.w, h: M.h });
    }
  }
  return { rings, slots };
}

/** The torpedo kind an EMPTY torpedo tile lays out for (no torpedo fitted
 *  yet): the base `CONFIG.torpedo` row. */
const DEFAULT_TORPEDO: EquipmentId = 'heavyTorpedo';

const TORPEDO_KINDS: readonly EquipmentId[] = familyMembers('torpedo');

const PER_LAUNCHER = new Map<EquipmentId, number>();

/**
 * Pure (memoised per kind): the tubes on each launcher of this torpedo KIND —
 * the folded `tubesPerLauncher` of a hull holding that kind's card (Eric
 * 2026-11-25: `CONFIG.<kind>.tubesPerLauncher`). A property of the kind alone,
 * never of the player's build. An empty torpedo slot lays out as the heavy.
 */
export function slotsPerLauncher(id: EquipmentId | null): number {
  const kind = id !== null && TORPEDO_KINDS.includes(id) ? id : DEFAULT_TORPEDO;
  const hit = PER_LAUNCHER.get(kind);
  if (hit !== undefined) return hit;
  const line = lineForEquipment(kind, CATALOG);
  const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], line === undefined ? [] : [line.id], CATALOG);
  PER_LAUNCHER.set(kind, stats.tubesPerLauncher);
  return stats.tubesPerLauncher;
}

/** The mine kind an EMPTY mines tile lays out for (no mine fitted yet). */
const DEFAULT_MINE: MineEquipmentId = 'navalMines';

const PER_RACK = new Map<MineEquipmentId, number>();

/**
 * Pure (memoised per kind): the most mines one rack of this KIND can ever
 * hold — its per-rack capacity with EXPANDED MINE RACKS fitted, off a real
 * fold of the catalog card (4 naval / fouling, 2 captive today). A property of
 * the mine kind alone, never of the player's build. An empty mine slot lays
 * out as a naval rack. [reading: Story 12.3 Part B — the empty mines tile]
 */
export function slotsPerRack(id: EquipmentId | null): number {
  const kind = isMineEquipment(id) ? id : DEFAULT_MINE;
  const hit = PER_RACK.get(kind);
  if (hit !== undefined) return hit;
  const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID], ['expandedMineRacks'], CATALOG);
  const per = rackCapacity(stats, kind);
  PER_RACK.set(kind, per);
  return per;
}

// --- per-slot state -----------------------------------------------------------------

/** What one icon slot shows this frame. `locked` = dashed gray in place;
 *  `open` = a hovered card would unlock it (amber outline in place, AC 36);
 *  otherwise `clock` drives the fill (null = nothing loading, an empty icon). */
export interface SlotState {
  locked: boolean;
  open: boolean;
  clock: MountClock | null;
}

/** A mine slot: locked / open as above, else held (filled) or empty (muted). */
export interface MineSlotState {
  locked: boolean;
  open: boolean;
  held: boolean;
}

export interface RackState {
  locked: boolean;
  open: boolean;
  clock: MountClock | null;
  slots: MineSlotState[];
}

/** The mount counts a row is built to (now, and under a hovered card). */
export interface MountCounts {
  launchers: number;
  tubes: number;
  racks: number;
  capacity: number;
}

/** Pure: the mount counts off the readouts (0 where the row is empty). */
export function mountCounts(readouts: readonly Readout[]): MountCounts {
  const get = (key: string): number => readouts.find((r) => r.key === key)?.raw ?? 0;
  return {
    launchers: get('row.torpedo.launchers'),
    tubes: get('row.torpedo.tubes'),
    racks: get('row.mines.racks'),
    capacity: get('row.mines.capacity'),
  };
}

/** Pure: the counts a hovered card would leave (its marks over `now`); `now`
 *  itself with no card. */
export function previewCounts(now: MountCounts, marks: PreviewMarks | null): MountCounts {
  if (marks === null) return now;
  const at = (key: string, v: number): number => marks.get(key)?.raw ?? v;
  return {
    launchers: at('row.torpedo.launchers', now.launchers),
    tubes: at('row.torpedo.tubes', now.tubes),
    racks: at('row.mines.racks', now.racks),
    capacity: at('row.mines.capacity', now.capacity),
  };
}

/** Pure: is tube `t` of launcher `g` mounted at these counts? (`tubes` is the
 *  total, launchers × tubes per launcher.) */
function tubeMounted(c: MountCounts, g: number, t: number): boolean {
  if (c.launchers <= 0) return false;
  return g < c.launchers && t < Math.round(c.tubes / c.launchers);
}

/** Pure: the per-mount clocks of one group (pair / rack), in order. */
function groupClocks(clocks: readonly MountClock[], g: number): MountClock[] {
  return clocks.filter((c) => c.group === g);
}

/** Pure: MAIN BATTERY — every turret's shell, its turret's clock (or nothing). */
export function shellStates(clocks: readonly MountClock[], turrets: number): SlotState[] {
  return Array.from({ length: Math.max(0, turrets) }, (_, i) => ({ locked: false, open: false, clock: clocks[i] ?? null }));
}

/** Pure: TORPEDO — every tube slot of `tubeSlots(body, perLauncher)`, in its
 *  order: mounted ones carry their tube's clock; unmounted ones are locked,
 *  `open` where the card would mount them. */
export function tubeStates(clocks: readonly MountClock[], perLauncher: number, now: MountCounts, next: MountCounts = now): SlotState[] {
  const n = perGroup(perLauncher);
  const out: SlotState[] = [];
  for (let g = 0; g < B.launchers; g++) {
    const mine = groupClocks(clocks, g);
    for (let t = 0; t < n; t++) {
      const mounted = tubeMounted(now, g, t);
      out.push({ locked: !mounted, open: !mounted && tubeMounted(next, g, t), clock: mounted ? (mine[t] ?? null) : null });
    }
  }
  return out;
}

/** Pure: MINES — both racks; a rack past the mounted count is locked (`open`
 *  where the card adds it), a slot past the capacity locked (`open` where the
 *  card raises it), the held mines filled from the first slot. */
export function rackStates(racks: readonly RackPips[], clocks: readonly MountClock[], perRack: number, now: MountCounts, next: MountCounts = now): RackState[] {
  return Array.from({ length: B.racks }, (_, r) => {
    const mounted = r < now.racks;
    const willMount = r < next.racks;
    const held = mounted ? (racks[r]?.held ?? 0) : 0;
    const slots = Array.from({ length: perRack }, (_, j) => {
      const unlocked = mounted && j < now.capacity;
      const open = !unlocked && willMount && j < next.capacity;
      return { locked: !unlocked, open, held: unlocked && j < held };
    });
    return { locked: !mounted, open: !mounted && willMount, clock: mounted ? (clocks[r] ?? null) : null, slots };
  });
}

// --- icon outlines --------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

/** Sample a quadratic Bézier (exclusive of its start point). */
function quad(a: Pt, c: Pt, b: Pt, n = 6): Pt[] {
  return Array.from({ length: n }, (_, k) => {
    const t = (k + 1) / n;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  });
}

/** The bench's shell (`M2 44V17Q2 3 13 1Q24 3 24 17V44Z`, a 26 × 44 box). */
const SHELL_BOX = { w: 26, h: 44 };
const SHELL: readonly Pt[] = [
  { x: 2, y: 44 },
  { x: 2, y: 17 },
  ...quad({ x: 2, y: 17 }, { x: 2, y: 3 }, { x: 13, y: 1 }),
  ...quad({ x: 13, y: 1 }, { x: 24, y: 3 }, { x: 24, y: 17 }),
  { x: 24, y: 44 },
];

/** The bench's torpedo body (`M3 46V10Q3 2 12 1Q21 2 21 10V46Z`, 24 × 48) and
 *  its two tail fins. */
const TORP_BOX = { w: 24, h: 48 };
const TORP: readonly Pt[] = [
  { x: 3, y: 46 },
  { x: 3, y: 10 },
  ...quad({ x: 3, y: 10 }, { x: 3, y: 2 }, { x: 12, y: 1 }),
  ...quad({ x: 12, y: 1 }, { x: 21, y: 2 }, { x: 21, y: 10 }),
  { x: 21, y: 46 },
];
const TORP_FINS: readonly (readonly [Pt, Pt])[] = [
  [{ x: 1, y: 47 }, { x: 3, y: 40 }],
  [{ x: 23, y: 47 }, { x: 21, y: 40 }],
];

/** The bench's mine (a 22 × 22 box): a radius-7 ball and eight spikes. */
const MINE_BOX = { w: 22, h: 22 };
const MINE_R = 7;
const MINE_SPIKES: readonly (readonly [Pt, Pt])[] = [
  [{ x: 11, y: 0 }, { x: 11, y: 4 }],
  [{ x: 11, y: 18 }, { x: 11, y: 22 }],
  [{ x: 0, y: 11 }, { x: 4, y: 11 }],
  [{ x: 18, y: 11 }, { x: 22, y: 11 }],
  [{ x: 3, y: 3 }, { x: 6, y: 6 }],
  [{ x: 19, y: 3 }, { x: 16, y: 6 }],
  [{ x: 3, y: 19 }, { x: 6, y: 16 }],
  [{ x: 19, y: 19 }, { x: 16, y: 16 }],
];

function fit(p: Pt, box: { w: number; h: number }, r: Rect): Pt {
  return { x: r.x + (p.x / box.w) * r.w, y: r.y + (p.y / box.h) * r.h };
}

/** Pure: a shell or torpedo icon's body outline, scaled into its slot. */
export function iconOutline(kind: 'shell' | 'torp', r: Rect): Pt[] {
  const [pts, box] = kind === 'shell' ? [SHELL, SHELL_BOX] : [TORP, TORP_BOX];
  return pts.map((p) => fit(p, box, r));
}

/** Pure: a torpedo icon's two fins (line segments), scaled into its slot. */
export function torpFins(r: Rect): [Pt, Pt][] {
  return TORP_FINS.map(([a, b]) => [fit(a, TORP_BOX, r), fit(b, TORP_BOX, r)]);
}

/** Pure: a mine icon's ball (centre + radius) and spikes, scaled into its slot. */
export function mineGlyph(r: Rect): { cx: number; cy: number; radius: number; spikes: [Pt, Pt][] } {
  const c = fit({ x: 11, y: 11 }, MINE_BOX, r);
  return {
    cx: c.x,
    cy: c.y,
    radius: (MINE_R / MINE_BOX.w) * r.w,
    spikes: MINE_SPIKES.map(([a, b]) => [fit(a, MINE_BOX, r), fit(b, MINE_BOX, r)]),
  };
}

/**
 * Pure: the part of a CONVEX polygon at or below `y` (screen y grows down) —
 * one Sutherland–Hodgman pass against the half-plane. Empty when `y` is under
 * the whole shape; the shape itself when `y` is over it.
 */
export function clipBelow(poly: readonly Pt[], y: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = a.y >= y;
    const bIn = b.y >= y;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (y - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y });
    }
  }
  return out;
}

/** Pure: the y a fill `progress` (0..1) reaches up an icon in slot `r`. */
export function fillLine(r: Rect, progress: number): number {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return r.y + r.h * (1 - p);
}
