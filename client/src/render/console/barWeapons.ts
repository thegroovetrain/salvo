// THE BAR'S WEAPON TILES (Story 12.3 Part B, AC 29 / 30) — the WEAPONS
// section's five tiles, a thin Pixi painter over the pure model (readouts.ts),
// the spine (layout.ts) and the fixed icon slots (slots.ts):
//
//   MAIN BATTERY               [LMB]  every row: NAME, the TIER MARK (AC 40)
//   ▯ ▯ ▯ ▯                            in ONE column, the key chip in its
//                                      fixed slot; one shell per turret,
//                                      filling from the bottom, seconds inside
//                                      (no ladder climbs it: no mark)
//   SECONDARIES                [RMB]   the rate bar, full when fastest (untiered: no mark)
//   HEAVY TORPEDO     II ●●○○○ [ Q ]   four tubes in two pairs (fore, aft);
//   ▯▯  ▯▯                             locked tubes dashed gray, in place
//   NAVAL MINES        I ●○○○○ [ E ]   two racks: a wedge ring + fixed slots
//   ◔ ✳✳✳✳   ◔ ✳✳✳✳
//   STAR SHELLS      III ●●●○○ [ R ]   one shot: a refill bar with READY /
//   ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭  READY      the seconds at its right end
//
// Each tile wears today's outline (cooling silver, ready phosphor + glow,
// ARMED amber, denied red) and, under a hovered card that changes it, the
// amber preview outline; a slot the card would open draws amber in place.
// Every frame clears and redraws the linework, as Story 10.10's weapons
// console did; Text is written only on change.

import { BlurFilter, Container, Graphics, type Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../../config.js';
import type { MotionLevel } from '../../settings/store.js';
import { clockText, dashedPoly, drawBox, drawChip, drawRefill, drawTierMark, monoText, place, pooled } from './barDraw.js';
import { HOVER_WASH, rowSkin, tierMarkModel } from './skins.js';
import {
  clipBelow,
  fillLine,
  iconOutline,
  mineGlyph,
  mountCounts,
  previewCounts,
  rackSlots,
  rackStates,
  shellSlots,
  shellStates,
  slotsPerRack,
  torpFins,
  tubeSlots,
  tubeStates,
  type IconSlot,
  type MineSlotState,
  type MountCounts,
  type Pt,
  type RackState,
  type SlotState,
} from './slots.js';
import type { Rect, WeaponTileRect } from './layout.js';
import { ABILITY_READY_WORD, READOUT_KEY, type MountClock, type PreviewMarks, type Readout, type WeaponRowModel } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const T = K.type;

/** Fill alphas: a loading icon / wedge, a full (ready) icon / disc, the heat. */
const LOADING_ALPHA = 0.35;
const FULL_ALPHA = 0.9;
const HEAT_ALPHA = 0.85;
/** A locked outline's alpha (dashed gray); an empty slot's muted outline. */
const LOCKED_ALPHA = 0.6;
const EMPTY_ALPHA = 0.8;
/** An empty tile's name alpha. */
const EMPTY_NAME_ALPHA = 0.5;
/** Where a countdown sits up an icon (the bench's 0.66 of its height). */
const NUMERAL_AT = 0.66;
/** Segments of a circle drawn as a dashed polygon. */
const CIRCLE_STEPS = 20;

export interface WeaponTilesView {
  rows: readonly WeaponRowModel[];
  readouts: readonly Readout[];
  preview: PreviewMarks | null;
  /** The tile a hovered card changes (amber outline), or null. */
  previewRow: WeaponRowModel['kind'] | null;
  /** The tile under the pointer (the hover wash), or null. */
  hoverRow: WeaponRowModel['kind'] | null;
  turrets: number;
  denied: readonly boolean[];
  motion: MotionLevel;
  uiScale: number;
}

interface TileTexts {
  name: Text;
  tier: Text;
  state: Text;
  chip: Text;
  numerals: Text[];
}

interface Frame {
  view: WeaponTilesView;
  now: MountCounts;
  next: MountCounts;
}

function circlePoly(cx: number, cy: number, r: number): Pt[] {
  return Array.from({ length: CIRCLE_STEPS }, (_, k) => {
    const a = (k / CIRCLE_STEPS) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

export class WeaponTiles {
  readonly root = new Container();
  private readonly glow = new Graphics();
  private readonly gfx = new Graphics();
  private readonly texts: TileTexts[] = [];
  private uiScale = 1;
  private numeralN = 0;

  constructor() {
    const blur = new BlurFilter({ strength: K.glowBlurPx, quality: 4 });
    blur.padding = K.glowBlurPx * 2;
    this.glow.filters = [blur];
    this.root.addChild(this.glow, this.gfx);
  }

  update(view: WeaponTilesView, tiles: readonly WeaponTileRect[]): void {
    this.uiScale = view.uiScale;
    this.gfx.clear();
    this.glow.clear();
    const now = mountCounts(view.readouts);
    const frame: Frame = { view, now, next: previewCounts(now, view.preview) };
    tiles.forEach((rect, i) => {
      const row = view.rows[i];
      if (row !== undefined) this.drawTile(row, rect, i, frame);
    });
  }

  private textsAt(i: number): TileTexts {
    while (this.texts.length <= i) {
      const tt: TileTexts = {
        name: monoText(T.name, '600', C.textPrimary),
        tier: monoText(T.tier, '600', C.phosphor, 1),
        state: monoText(T.state, '600', C.phosphor, 1),
        chip: monoText(T.keyChip, '600', C.phosphor, 0.5),
        numerals: [],
      };
      this.root.addChild(tt.name, tt.tier, tt.state, tt.chip);
      this.texts.push(tt);
    }
    return this.texts[i];
  }

  private drawTile(row: WeaponRowModel, rect: WeaponTileRect, i: number, f: Frame): void {
    const v = f.view;
    const tt = this.textsAt(i);
    const denied = v.denied[i] === true;
    drawBox(this.gfx, this.glow, rect, rowSkin(row.state, denied, v.motion, v.previewRow === row.kind), v.hoverRow === row.kind ? HOVER_WASH : 0);
    this.numeralN = 0;
    this.drawLine1(row, rect, tt, denied, v.preview);
    if (row.kind === 'special') this.drawSpecial(row, rect, tt);
    else this.drawBody(row, rect.body, tt, f);
    for (let k = this.numeralN; k < tt.numerals.length; k++) tt.numerals[k].visible = false;
  }

  /** Line 1 (AC 29 / 40): NAME left, the tier mark in its column, the key
   *  chip in its fixed slot. */
  private drawLine1(row: WeaponRowModel, r: WeaponTileRect, tt: TileTexts, denied: boolean, preview: PreviewMarks | null): void {
    const l = r.line1;
    const cy = l.y + l.h / 2;
    place(tt.name, row.name, l.x, cy, this.uiScale);
    tt.name.alpha = row.state === 'empty' ? EMPTY_NAME_ALPHA : 1;
    drawChip(this.gfx, tt.chip, row.keyGlyph, r.chipSlot.x + r.chipSlot.w, cy, { armed: row.readied, denied, uiScale: this.uiScale });
    drawTierMark(this.gfx, tt.tier, r.tierMark, tierMarkModel(row.tier, preview?.get(READOUT_KEY.tier(row.kind)), row.tiered), this.uiScale);
  }

  private drawBody(row: WeaponRowModel, body: Rect, tt: TileTexts, f: Frame): void {
    if (row.kind === 'secondaries') this.drawTrack(body, secondariesFill(row.heat?.heat ?? 0), 1, HEAT_ALPHA);
    else if (row.kind === 'mainBattery') this.drawIcons(shellSlots(body, f.view.turrets), shellStates(row.clocks, f.view.turrets), tt);
    else if (row.kind === 'torpedo') this.drawIcons(tubeSlots(body), tubeStates(row.clocks, f.now, f.next), tt);
    else this.drawRacks(row, body, tt, f);
  }

  /** A track (heat / refill): silver outline, phosphor fill to `frac`. */
  private drawTrack(l: Rect, frac: number, alpha: number, fillAlpha: number, dashed = false): void {
    const g = this.gfx;
    const corners = [{ x: l.x, y: l.y }, { x: l.x + l.w, y: l.y }, { x: l.x + l.w, y: l.y + l.h }, { x: l.x, y: l.y + l.h }];
    if (dashed) dashedPoly(g, corners);
    else g.rect(l.x, l.y, l.w, l.h);
    g.stroke({ width: K.lineW, color: dashed ? C.textMuted : C.silver, alpha: dashed ? LOCKED_ALPHA : alpha });
    const p = frac > 0 ? Math.min(1, frac) : 0;
    if (p > 0) g.rect(l.x, l.y, l.w * p, l.h).fill({ color: C.phosphor, alpha: fillAlpha });
  }

  /** SPECIAL SHELL (AC 29): ONE shot, a refill bar with READY / the seconds
   *  at its right end; dashed with no special fitted. */
  private drawSpecial(row: WeaponRowModel, r: WeaponTileRect, tt: TileTexts): void {
    const c = row.clocks[0];
    const state = specialState(row);
    if (row.state === 'empty' || c === undefined) {
      this.drawTrack(r.refill.track, 0, 1, 0, true);
      tt.state.visible = false;
      return;
    }
    drawRefill(this.gfx, tt.state, r.refill, c.progress, c.ready, state.text, this.uiScale);
  }

  private drawIcons(slots: readonly IconSlot[], states: readonly SlotState[], tt: TileTexts): void {
    slots.forEach((slot, k) => this.drawIcon(slot, states[k] ?? { locked: true, open: false, clock: null }, tt));
  }

  /** One shell / tube: dashed gray when locked, amber when a card would open
   *  it, else filling from the bottom with the seconds inside, solid phosphor
   *  when ready. */
  private drawIcon(slot: IconSlot, s: SlotState, tt: TileTexts): void {
    const torp = slot.kind === 'torp' ? slot : null;
    const poly = iconOutline(torp === null ? 'shell' : 'torp', slot);
    if (s.locked) {
      const look = lockedLook(s.open);
      this.outline(poly, torp, look.color, look.alpha, !s.open);
      return;
    }
    const c = s.clock;
    const ready = c?.ready === true;
    const fill = clipBelow(poly, fillLine(slot, iconProgress(c)));
    if (fill.length >= 3) this.gfx.poly(fill).fill({ color: C.phosphor, alpha: ready ? FULL_ALPHA : LOADING_ALPHA });
    this.outline(poly, torp, ready ? C.phosphor : C.silver, 1, false);
    if (c !== null && !ready) this.numeral(tt, c, slot.x + slot.w / 2, slot.y + slot.h * NUMERAL_AT);
  }

  /** An icon's outline (a torpedo's fins with it), solid or dashed. */
  private outline(poly: Pt[], torp: Rect | null, color: number, alpha: number, dashed: boolean): void {
    const g = this.gfx;
    if (dashed) dashedPoly(g, poly);
    else g.poly(poly);
    if (torp !== null) for (const [a, b] of torpFins(torp)) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    g.stroke({ width: K.lineW, color, alpha });
  }

  private numeral(tt: TileTexts, c: MountClock, x: number, y: number): void {
    const t = pooled(tt.numerals, this.numeralN++, clockText, (n) => this.root.addChild(n));
    place(t, c.numeral, x, y, this.uiScale);
  }

  /** MINES (AC 29): both racks — the wedge ring, then the fixed slots. */
  private drawRacks(row: WeaponRowModel, body: Rect, tt: TileTexts, f: Frame): void {
    const per = slotsPerRack(row.id);
    const { rings, slots } = rackSlots(body, per);
    const states = rackStates(row.racks, row.clocks, per, f.now, f.next);
    rings.forEach((ring, r) => {
      const s = states[r];
      this.drawRing(ring, s, tt);
      s.slots.forEach((m, j) => this.drawMine(slots[r * per + j], m));
    });
  }

  /** A rack's wedge ring: dashed gray when locked (amber when a card adds the
   *  rack), the solid disc when ready, else the elapsed wedge and seconds. */
  private drawRing(r: IconSlot, s: RackState, tt: TileTexts): void {
    const g = this.gfx;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const rad = r.w / 2 - K.lineW;
    if (s.locked) {
      if (s.open) g.circle(cx, cy, rad).stroke({ width: K.lineW, color: C.amber, alpha: 1 });
      else {
        dashedPoly(g, circlePoly(cx, cy, rad));
        g.stroke({ width: K.lineW, color: C.textMuted, alpha: LOCKED_ALPHA });
      }
      return;
    }
    const c = s.clock;
    if (c?.ready === true) {
      g.circle(cx, cy, rad).fill({ color: C.phosphor, alpha: FULL_ALPHA });
      return;
    }
    g.circle(cx, cy, rad).stroke({ width: K.lineW, color: C.silver, alpha: 0.45 });
    if (c === null) return;
    if (c.progress > 0) {
      const a0 = -Math.PI / 2;
      g.moveTo(cx, cy).arc(cx, cy, rad, a0, a0 + Math.PI * 2 * c.progress).closePath().fill({ color: C.phosphor, alpha: LOADING_ALPHA });
    }
    this.numeral(tt, c, cx, cy);
  }

  /** One mine slot: a held mine filled, an empty slot a muted outline, a
   *  locked slot dashed gray (amber where a card would open it). */
  private drawMine(r: IconSlot, s: MineSlotState): void {
    const m = mineGlyph(r);
    const g = this.gfx;
    const { color, alpha } = mineLook(s);
    if (s.locked && !s.open) dashedPoly(g, circlePoly(m.cx, m.cy, m.radius));
    else g.circle(m.cx, m.cy, m.radius);
    for (const [a, b] of m.spikes) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    g.stroke({ width: K.lineW, color, alpha });
    if (s.held) g.circle(m.cx, m.cy, m.radius).fill({ color: C.phosphor, alpha: FULL_ALPHA });
  }
}

/** Pure: the SECONDARIES bar's fill for `heat` (0 cold … 1 hot) — full at the
 *  fastest rate (cold), empty at the slowest (hot), Eric 2026-11-23. The rate
 *  is linear in heat, so `1 − heat` is the rate's place between hot and cold. */
export function secondariesFill(heat: number): number {
  if (!(heat > 0)) return 1; // cold, or a NaN heat (the shared clamp reads NaN as cold)
  return Math.max(0, 1 - Math.min(1, heat));
}

/** Pure: how full an icon draws — empty with no clock, full when ready, else
 *  the reload's elapsed fraction. */
export function iconProgress(c: MountClock | null): number {
  if (c === null) return 0;
  return c.ready ? 1 : c.progress;
}

/** Pure: a locked slot's outline — amber where a hovered card would open it
 *  (AC 36), else the dashed gray. */
export function lockedLook(open: boolean): { color: number; alpha: number } {
  return open ? { color: C.amber, alpha: 1 } : { color: C.textMuted, alpha: LOCKED_ALPHA };
}

/** Pure: a mine slot's outline colour and alpha. */
export function mineLook(s: MineSlotState): { color: number; alpha: number } {
  if (s.open) return { color: C.amber, alpha: 1 };
  if (s.locked) return { color: C.textMuted, alpha: LOCKED_ALPHA };
  return s.held ? { color: C.phosphor, alpha: 1 } : { color: C.textMuted, alpha: EMPTY_ALPHA };
}

/** Pure: the SPECIAL SHELL's name-line state (AC 29) — READY, or the seconds
 *  while it reloads; '' on every other tile and on an empty special. */
export function specialState(row: WeaponRowModel): { text: string; ready: boolean } {
  if (row.kind !== 'special' || row.state === 'empty') return { text: '', ready: false };
  const c = row.clocks[0];
  if (c === undefined) return { text: '', ready: false };
  return c.ready ? { text: ABILITY_READY_WORD, ready: true } : { text: c.numeral, ready: false };
}
