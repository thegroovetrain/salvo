// THE HUD BAR's geometry spine (Story 8.6; back on the one row in Story 9.11),
// pinned against the ratified mock.
//
// `mockups/hud-composite-3.html` is the source of every number here, read
// literally (epic-8 amendment 31 — the July 1.6x micro lift does NOT apply to
// the bar's surfaces), with the one ruled change that BOTH globes are 104 px
// (amendment 32; the mock draws the HP globe at 96 and the helm at 104). Story
// 9.2's two-row stack is retired (Eric 2026-10-14, epic-9 amendment 151): the
// framed belt is back, holding all SIX consumable squares (keys 1–6).
//
// Three kinds of assertion live here and they are deliberately separate:
//   (a) the CONFIG block keeps the relations its numbers encode;
//   (b) the LAYOUT composes those numbers correctly — the width derivation,
//       the floor anchor, the centring, the two centred columns, the belt frame
//       enclosing its six squares and their chips, and the exactly-two dim
//       groups;
//   (c) the COMPOSITION — `class HudBar`, which owns the layout cache, the one
//       dim, visibility as ONE object, and the two forwards main.ts needs.
//
// (a) and (b) are pure and instantiate no Pixi; (c) builds the real containers
// under jsdom (no renderer is ever created, exactly as the globe/strip suites
// do it).

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, CONSUMABLE_SLOTS, SLOT_COUNT, SLOT_GUN, WEAPON_SLOTS, effectiveStats, isConsumableId, slotsWithCards } from '@salvo/shared';
import type { EquipmentId, WeaponAmmo } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { HUD_BAR_WIDTH, HudBar, hudBarLayout, microScale, type HudBarView } from '../render/hudBar.js';
import { equipmentInfo } from '../render/equipmentInfo.js';
import type { HotbarView } from '../render/hotbar.js';

const B = CLIENT_CONFIG.hudBar;

/** The two viewports the story is specified at: the reference 1366x768 and the
 *  1280x614 logical FLOOR (the shortest the bar must survive). */
const REF_W = 1366;
const REF_H = 768;
const FLOOR_W = 1280;
const FLOOR_H = 614;

/** The main group's slots (gun, Shift, Q, E, R) and the belt's (1–6). */
const WEAPON_ROW: readonly number[] = [SLOT_GUN, 1, ...WEAPON_SLOTS];
const BELT_ROW: readonly number[] = CONSUMABLE_SLOTS;

describe('(a) CLIENT_CONFIG.hudBar — the relations its numbers must keep', () => {
  it('spans the telegraph tick arc end to end in nine detents', () => {
    // Nine detents span the arc exactly, end to end: -arc .. +arc in eight steps.
    expect(-B.tick.arcDeg + 8 * B.tick.stepDeg).toBe(B.tick.arcDeg);
  });
});

describe('(b) hudBarLayout — the bar, derived and anchored', () => {
  it('derives the bar width from the parts, and never from a literal', () => {
    const slots = 5 * B.slot + 4 * B.slotGap;
    const belt = B.beltPad.side * 2 + BELT_ROW.length * B.beltSlot + (BELT_ROW.length - 1) * B.beltGap;
    expect(HUD_BAR_WIDTH).toBe(B.globe + B.globeGap + slots + B.globeGap + belt + B.globeGap + B.globe);
    expect(hudBarLayout(REF_W, REF_H).bar.w).toBe(HUD_BAR_WIDTH);
  });

  it('hangs from the FLOOR: the bar bottom sits 18px above the viewport floor', () => {
    expect(hudBarLayout(REF_W, REF_H).bar.y + hudBarLayout(REF_W, REF_H).bar.h).toBe(REF_H - B.floor);
    const floor = hudBarLayout(FLOOR_W, FLOOR_H);
    expect(floor.bar.y + floor.bar.h).toBe(FLOOR_H - B.floor);
  });

  it('is as tall as the main row, the strip gap and the strip row together', () => {
    const { bar } = hudBarLayout(REF_W, REF_H);
    expect(bar.h).toBe(B.globe + B.stripGap + B.stripRowH);
  });

  it('CENTRES on an integer x at 1366 and at 1280', () => {
    for (const w of [1280, 1366, 1440, 1600, 1920, 1281]) {
      const { bar } = hudBarLayout(w, REF_H);
      expect(Number.isInteger(bar.x), `x at ${w}`).toBe(true);
      expect(bar.x).toBe(Math.round((w - HUD_BAR_WIDTH) / 2));
    }
  });

  it('FITS the 1280x614 logical floor — under the chrome bar row and inside both edges', () => {
    const { bar } = hudBarLayout(FLOOR_W, FLOOR_H);
    expect(bar.y).toBeGreaterThan(CLIENT_CONFIG.chromeBar.y);
    expect(bar.x).toBeGreaterThan(0);
    expect(bar.x + bar.w).toBeLessThan(FLOOR_W);
  });

  it('seats both globes at half the globe size, flush with the bar ends', () => {
    const { bar, hpGlobe, helmGlobe } = hudBarLayout(REF_W, REF_H);
    expect(hpGlobe.r).toBe(B.globe / 2);
    expect(helmGlobe.r).toBe(B.globe / 2);
    expect(hpGlobe.cx - hpGlobe.r).toBe(bar.x);
    expect(helmGlobe.cx + helmGlobe.r).toBe(bar.x + bar.w);
    // Both are centred on the 104px MAIN row, not on the whole bar.
    expect(hpGlobe.cy).toBe(bar.y + B.globe / 2);
    expect(helmGlobe.cy).toBe(hpGlobe.cy);
  });

  it('carries the belt frame as its one grouping rect', () => {
    const L = hudBarLayout(REF_W, REF_H);
    expect(Object.keys(L).sort()).toEqual(['bar', 'belt', 'chips', 'dimGroups', 'helmGlobe', 'hpGlobe', 'squares', 'strip']);
  });
});

describe('(b) the squares — five weapons, six belt', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('indexes by LOADOUT SLOT: the main group at the slot size, the belt (1–6) at the smaller belt size', () => {
    expect(L.squares).toHaveLength(SLOT_COUNT);
    expect(WEAPON_ROW.length + BELT_ROW.length).toBe(SLOT_COUNT);
    for (const i of WEAPON_ROW) {
      expect(L.squares[i].w, `slot ${i}`).toBe(B.slot);
      expect(L.squares[i].h, `slot ${i}`).toBe(B.slot);
    }
    for (const i of BELT_ROW) {
      expect(L.squares[i].w, `slot ${i}`).toBe(B.beltSlot);
      expect(L.squares[i].h, `slot ${i}`).toBe(B.beltSlot);
    }
    expect(B.beltSlot).toBeLessThan(B.slot);
  });

  it('runs the weapons left to right at an 8px gap, starting one gap past the HP globe', () => {
    expect(L.squares[WEAPON_ROW[0]].x).toBe(L.bar.x + B.globe + B.globeGap);
    for (let k = 1; k < WEAPON_ROW.length; k++) {
      const [a, b] = [L.squares[WEAPON_ROW[k - 1]], L.squares[WEAPON_ROW[k]]];
      expect(b.x - a.x, `gap ${k}`).toBe(B.slot + B.slotGap);
      expect(b.y).toBe(a.y);
    }
  });

  it('runs the belt in key order at a 6px gap, one 16px gap after the weapons and before the helm globe', () => {
    for (let k = 1; k < BELT_ROW.length; k++) {
      const [a, b] = [L.squares[BELT_ROW[k - 1]], L.squares[BELT_ROW[k]]];
      expect(b.x - a.x, `belt gap ${k}`).toBe(B.beltSlot + B.beltGap);
      expect(b.y).toBe(a.y);
    }
    const lastWeapon = L.squares[WEAPON_ROW[WEAPON_ROW.length - 1]];
    expect(L.belt.x).toBe(lastWeapon.x + lastWeapon.w + B.globeGap);
    expect(L.belt.x + L.belt.w + B.globeGap).toBe(L.helmGlobe.cx - L.helmGlobe.r);
  });

  it('CENTRES each column on the main row — the weapon column and the belt frame alike', () => {
    const colH = B.slot + B.chipGap + B.chipH;
    const beltH = B.beltPad.top + B.beltSlot + B.chipGap + B.chipH + B.beltPad.bottom;
    const rowTop = L.bar.y;
    // Both columns FIT the main row — a slot retune can never overflow the globe height (9.14 gate P1).
    expect(colH).toBeLessThanOrEqual(B.globe);
    expect(beltH).toBeLessThanOrEqual(B.globe);
    expect(L.squares[SLOT_GUN].y).toBe(rowTop + (B.globe - colH) / 2);
    expect(L.belt.y).toBe(rowTop + (B.globe - beltH) / 2);
    expect(L.belt.h).toBe(beltH);
    // Centred means centred: the space above the column equals the space below.
    expect(L.squares[SLOT_GUN].y - rowTop).toBe(rowTop + B.globe - (L.chips[SLOT_GUN].y + B.chipH));
  });
});

describe('(b) the key chips hang under their square', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('centres every chip on its square and drops it one chip gap under it', () => {
    expect(L.chips).toHaveLength(SLOT_COUNT);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = L.squares[i];
      expect(L.chips[i].cx, `chip ${i} cx`).toBe(s.x + s.w / 2);
      expect(L.chips[i].y, `chip ${i} y`).toBe(s.y + s.h + B.chipGap);
    }
  });
});

describe('(b) the belt FRAME encloses its six squares AND their chips', () => {
  const L = hudBarLayout(REF_W, REF_H);
  const first = BELT_ROW[0];
  const last = BELT_ROW[BELT_ROW.length - 1];

  it('pads 8 side / 8 top / 6 bottom, with the bottom measured under the CHIPS', () => {
    // The mock's `.belt` wraps the whole `.sw` column (square + gap + chip), so
    // the frame's floor is 6px under the key chips and NOT under the squares —
    // a frame drawn round the squares alone would cut the chips in half.
    expect(L.belt.x).toBe(L.squares[first].x - B.beltPad.side);
    expect(L.belt.x + L.belt.w).toBe(L.squares[last].x + L.squares[last].w + B.beltPad.side);
    expect(L.belt.y).toBe(L.squares[first].y - B.beltPad.top);
    expect(L.belt.y + L.belt.h).toBe(L.chips[first].y + B.chipH + B.beltPad.bottom);
  });

  it('really does contain all SIX belt squares and all six belt chips — and nothing else', () => {
    expect(BELT_ROW).toHaveLength(6);
    for (const i of BELT_ROW) {
      const s = L.squares[i];
      expect(s.x, `sq ${i} left`).toBeGreaterThanOrEqual(L.belt.x);
      expect(s.x + s.w, `sq ${i} right`).toBeLessThanOrEqual(L.belt.x + L.belt.w);
      expect(s.y, `sq ${i} top`).toBeGreaterThanOrEqual(L.belt.y);
      expect(L.chips[i].y + B.chipH, `chip ${i} foot`).toBeLessThanOrEqual(L.belt.y + L.belt.h);
    }
    for (const i of WEAPON_ROW) {
      expect(L.squares[i].x + L.squares[i].w, `weapon ${i} outside`).toBeLessThan(L.belt.x);
    }
  });
});

describe('(b) the XP strip row', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('sits 8px under the main row, 24 tall, and closes the bar', () => {
    expect(L.strip.rowY).toBe(L.bar.y + B.globe + B.stripGap + B.stripRowH / 2);
    expect(L.strip.rowY + B.stripRowH / 2).toBe(L.bar.y + L.bar.h);
  });

  it('gives the track the full bar width at 4px, centred on the row', () => {
    expect(L.strip.track.x).toBe(L.bar.x);
    expect(L.strip.track.w).toBe(L.bar.w);
    expect(L.strip.track.h).toBe(B.strip);
    expect(L.strip.track.y + L.strip.track.h / 2).toBe(L.strip.rowY);
    expect(L.strip.lvX).toBe(L.bar.x);
  });

  it('right-anchors the tail group to the bar', () => {
    expect(L.strip.cueX).toBe(L.bar.x + L.bar.w);
    expect(L.strip.chip.x + L.strip.chip.w).toBe(L.bar.x + L.bar.w);
    expect(L.strip.chip.w).toBe(B.bankChip);
    expect(L.strip.chip.h).toBe(B.bankChip);
    expect(L.strip.chip.y + L.strip.chip.h / 2).toBe(L.strip.rowY);
  });
});

describe('(b) dimGroups — EXACTLY two, and the globes/strip are in neither', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('is the five-square weapon run and the belt frame, and nothing else', () => {
    // The 2026-09-11 ruling: only the slot groups dim while the refit window is
    // open or the start line is held. A third group here would be a globe or the
    // strip going dim, which is exactly what the ruling forbids.
    expect(L.dimGroups).toHaveLength(2);
    expect(L.dimGroups[0]).toEqual({
      x: L.squares[SLOT_GUN].x,
      y: L.squares[SLOT_GUN].y,
      w: 5 * B.slot + 4 * B.slotGap,
      h: B.slot + B.chipGap + B.chipH,
    });
    expect(L.dimGroups[1]).toEqual(L.belt);
  });

  it('covers every square with its chip, and excludes both globes and the XP strip', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const g = L.dimGroups[BELT_ROW.includes(i) ? 1 : 0];
      expect(L.squares[i].x, `sq ${i}`).toBeGreaterThanOrEqual(g.x);
      expect(L.squares[i].x + L.squares[i].w, `sq ${i}`).toBeLessThanOrEqual(g.x + g.w);
      expect(L.chips[i].y + B.chipH, `chip ${i}`).toBeLessThanOrEqual(g.y + g.h);
    }
    for (const group of L.dimGroups) {
      expect(group.x).toBeGreaterThan(L.hpGlobe.cx + L.hpGlobe.r - 1);
      expect(group.x + group.w).toBeLessThan(L.helmGlobe.cx - L.helmGlobe.r + 1);
      expect(group.y + group.h).toBeLessThan(L.strip.track.y);
    }
  });
});

describe('microScale — the 9px floor at 90% UI scale', () => {
  it('counter-scales below 1 and is EXACTLY 1 at and above it', () => {
    expect(microScale(0.9)).toBeCloseTo(1.1111, 4);
    expect(microScale(1)).toBe(1);
    expect(microScale(1.25)).toBe(1);
  });

  it('lands a 9px glyph back on 9px rendered at 90%', () => {
    const rendered = B.type.chip * microScale(0.9) * 0.9;
    expect(rendered).toBeCloseTo(B.type.chip, 10);
    expect(rendered).toBeGreaterThanOrEqual(9);
  });

  it('holds EVERY 9px register on the bar at 9px rendered at 90%', () => {
    for (const size of [B.type.chip, B.type.tier, B.type.hullLabel, B.type.hdgLabel, B.type.kts, B.type.helmKey, B.type.cue]) {
      expect(size * microScale(0.9) * 0.9).toBeGreaterThanOrEqual(9 - 1e-9);
    }
  });

  it('keeps the counter-scaled glyph inside its scaled 14.4px chip box', () => {
    // Container-fit law (epic-2 amendment 47): the box scales with the geometry
    // (16 x 0.9 = 14.4) while the glyph is held at 9px rendered. 9 < 14.4, so
    // the chip still contains its letter — the counter-scale buys legibility
    // without overflowing anything.
    expect(B.type.chip * microScale(0.9) * 0.9).toBeLessThan(B.chipH * 0.9);
  });

  it('is total — a nonsense scale falls back to 1 rather than to Infinity', () => {
    expect(microScale(0)).toBe(1);
    expect(microScale(-1)).toBe(1);
    expect(microScale(Number.NaN)).toBe(1);
  });
});

// --- (c) the COMPOSITION: `class HudBar`, the bar as ONE object -----------------
//
// Ruling 9: one Container owning the HP globe, the slot row, the helm globe and
// the XP strip. What is pinned here is exactly what the class DECIDES — the
// layout cache, the one dim it applies, visibility as a whole, and the two
// forwards it publishes (`slotAt`, which main.ts's click gate depends on, and
// `barTop`, the bar's own top edge). Everything each member DRAWS is its own
// suite's business.

const CLS = 'torpedoBoat' as const;
const STATS = effectiveStats(CONFIG.shipClasses[CLS]);
// THE FITTED CARD (Story 8.10): the Torpedo Boat's torpedo, stated here rather
// than read off the interim spawn seed, which is deleted — a hull spawns with
// the gun and Shift alone. What this suite pins is the BAR's composition with a
// weapon in the row, not where the weapon came from.
const FITTED: readonly string[] = ['heavyTorpedo'];
const LOADOUT: (EquipmentId | null)[] = slotsWithCards(STATS, FITTED).map((s) =>
  s.equipmentId === null || isConsumableId(s.equipmentId) ? null : s.equipmentId,
);
const AMMO: (WeaponAmmo | null)[] = LOADOUT.map((id) =>
  id === null ? null : { n: equipmentInfo(STATS, id).maxAmmo, reloadMsLeft: 0 },
);

function nine<T>(v: T): T[] {
  return Array.from({ length: SLOT_COUNT }, () => v);
}

function slotsView(): HotbarView {
  return {
    loadout: LOADOUT,
    ammo: AMMO,
    stats: STATS,
    primedSlot: SLOT_GUN,
    denied: nine(false),
    activated: nine(false),
    dim: false, // deliberately false: the HudBar is what must overwrite it
  };
}

function barView(over: Partial<HudBarView> = {}): HudBarView {
  return {
    slots: slotsView(),
    hp: { hp: 212, maxHp: 250, repairHp: 0, shield: 0, alive: true, sinking: false },
    hpHold: false,
    helm: {
      headingRad: 0,
      speed: 4,
      orderedDetent: 6,
      rudder: 0,
      kin: STATS.kinematics,
      boostFactor: CONFIG.boost.factor,
      boostActive: false,
    },
    xp: { lvl: 3, xp: 0.62, pts: 1, refitable: true },
    freeze: false,
    dim: false,
    ...over,
  };
}

/** The bar, plus the four member roots in the order they were parented — HP
 *  globe, helm globe, XP strip, slot row (the Hotbar goes on LAST so its
 *  tooltip paints over the globes it reaches across). */
function build(): { bar: HudBar; root: Container; members: Container[] } {
  const layer = new Container();
  const bar = new HudBar(layer);
  const root = layer.children[0] as Container;
  return { bar, root, members: root.children as Container[] };
}

describe('(c) HudBar — one container, four members', () => {
  it('constructs under jsdom and parents every member to its own root', () => {
    const { root, members } = build();
    expect(root.children.length).toBe(4);
    for (const m of members) expect(m).toBeInstanceOf(Container);
  });

  it('renders a frame and lays the bar out at the viewport it was given', () => {
    const { bar } = build();
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    expect(bar.layout).toEqual(hudBarLayout(REF_W, REF_H));
    expect(bar.layout?.bar.w).toBe(HUD_BAR_WIDTH);
  });

  it('DIMS ONLY THE SLOT ROW: the globes and the strip stay at full (ruling 9)', () => {
    const { bar, members } = build();
    const [hp, helm, strip, slots] = members;
    bar.update(barView({ dim: true }), REF_W, REF_H, null, 10, 10_000, 1);
    expect(slots.alpha).toBe(B.dimAlpha);
    expect(hp.alpha).toBe(1);
    expect(helm.alpha).toBe(1);
    expect(strip.alpha).toBe(1);
    // ...and the dim is the BAR's word, not the slot view's: the view handed in
    // carries `slots.dim === false` and is overwritten either way.
    bar.update(barView({ dim: false }), REF_W, REF_H, null, 11, 11_000, 1);
    expect(slots.alpha).toBe(1);
  });

  it('recomputes the layout ONLY when the viewport moves', () => {
    const { bar } = build();
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    const first = bar.layout;
    bar.update(barView(), REF_W, REF_H, null, 11, 11_000, 1);
    expect(bar.layout).toBe(first); // the SAME object — nothing recomputed
    bar.update(barView(), FLOOR_W, FLOOR_H, null, 12, 12_000, 1);
    expect(bar.layout).not.toBe(first);
    expect(bar.layout).toEqual(hudBarLayout(FLOOR_W, FLOOR_H)); // nothing cached across sizes
  });

  it('hides ALL FOUR members together — the bar is one object (founder)', () => {
    const { bar, root, members } = build();
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    for (const m of members) expect(m.visible).toBe(true);
    bar.hide();
    expect(root.visible).toBe(false);
    for (const m of members) expect(m.visible).toBe(false);
  });

  it('a TRANSIENT hide (the pose gap) takes the whole bar down, and it comes back', () => {
    const { bar, root, members } = build();
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    bar.hideTransient();
    expect(root.visible).toBe(false);
    for (const m of members) expect(m.visible).toBe(false);
    bar.update(barView(), REF_W, REF_H, null, 11, 11_000, 1); // the pose returns
    expect(root.visible).toBe(true);
  });

  it('forwards slotAt to the slot row, and a HIDDEN bar routes no click', () => {
    const { bar } = build();
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    const layout = hudBarLayout(REF_W, REF_H);
    for (const slot of [0, 4, 5, 10]) {
      const sq = layout.squares[slot];
      expect(bar.slotAt({ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 })).toBe(slot);
    }
    expect(bar.slotAt({ x: layout.bar.x - 40, y: layout.bar.y })).toBe(null); // off the bar
    bar.hide();
    expect(bar.slotAt({ x: layout.squares[0].x + 2, y: layout.squares[0].y + 2 })).toBe(null);
  });

  it('forwards press: a slot acts, the HP GLOBE swallows with no action, water falls through, a hidden bar routes nothing', () => {
    const { bar } = build();
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    const layout = hudBarLayout(REF_W, REF_H);
    const acted: number[] = [];
    const act = (slot: number): void => { acted.push(slot); };
    const sq = layout.squares[4];
    expect(bar.press({ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 }, act)).toBe(true);
    expect(bar.press({ x: layout.hpGlobe.cx, y: layout.hpGlobe.cy }, act)).toBe(true);
    expect(acted).toEqual([4]);
    expect(bar.press({ x: layout.bar.x - 40, y: layout.bar.y }, act)).toBe(false);
    bar.hide();
    expect(bar.press({ x: layout.hpGlobe.cx, y: layout.hpGlobe.cy }, act)).toBe(false);
  });

  it('exposes barTop — the bar publishes its own top edge, laid out or hidden', () => {
    const { bar } = build();
    expect(bar.barTop).toBe(0); // nothing laid out yet
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    expect(bar.barTop).toBe(hudBarLayout(REF_W, REF_H).bar.y);
    // It SURVIVES a hide: the edge is pure geometry, so anything seated against
    // the bar keeps its seat on the frame the bar goes away rather than jumping.
    // (The satellite column no longer reads it — epic-8 amendment 38 re-hung
    // IN STORM and the tells under the chrome bar.)
    bar.hide();
    expect(bar.barTop).toBe(hudBarLayout(REF_W, REF_H).bar.y);
  });

  it('re-arms the bank chip through the bar (TAB opens the refit window)', () => {
    const { bar } = build();
    bar.update(barView({ xp: { lvl: 1, xp: 0, pts: 1, refitable: true } }), REF_W, REF_H, null, 0, 0, 1);
    bar.update(barView({ xp: { lvl: 1, xp: 0.5, pts: 1, refitable: true } }), REF_W, REF_H, null, 30, 30_000, 1);
    expect(bar.xpStrip.chipState.armedAt).toBe(0); // decayed, still armed at 0
    bar.rearmBank();
    bar.update(barView({ xp: { lvl: 1, xp: 0.5, pts: 1, refitable: true } }), REF_W, REF_H, null, 30, 30_000, 1);
    expect(bar.xpStrip.chipState.armedAt).toBe(30);
  });
});
