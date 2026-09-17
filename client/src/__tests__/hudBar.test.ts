// THE HUD BAR's geometry spine (Story 8.6), pinned against the ratified mock.
//
// `mockups/hud-composite-3.html` is the source of every number here, read
// literally (epic-8 amendment 31 — the July 1.6x micro lift does NOT apply to
// the bar's surfaces), with the one ruled change that BOTH globes are 104 px
// (amendment 32; the mock draws the HP globe at 96 and the helm at 104).
//
// Three kinds of assertion live here and they are deliberately separate:
//   (a) the CONFIG block IS the mock — one literal per key, so a retune has to
//       be a decision rather than a drift;
//   (b) the LAYOUT composes those numbers correctly — the 768 px derivation,
//       the floor anchor, the centring, the two centred columns, the belt frame
//       enclosing its chips, and the exactly-two dim groups;
//   (c) the COMPOSITION — `class HudBar`, which owns the layout cache, the one
//       dim, visibility as ONE object, and the two forwards main.ts needs.
//
// (a) and (b) are pure and instantiate no Pixi; (c) builds the real containers
// under jsdom (no renderer is ever created, exactly as the globe/strip suites
// do it).

import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { CONFIG, SLOT_COUNT, SLOT_GUN, SPAWN_SEED, effectiveStats, slotsWithCards } from '@salvo/shared';
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

describe('(a) CLIENT_CONFIG.hudBar IS the mock — every number, one literal each', () => {
  it('pins the frame, the globes and the one horizontal gap', () => {
    expect(B.floor).toBe(18); // .B-hud { bottom: 18px }
    expect(B.globe).toBe(104); // amendment 32 — BOTH globes, not the mock's 96
    expect(B.globeGap).toBe(16); // .B-main { gap: 16px }
  });

  it('pins the slot squares, the belt squares and the belt frame padding', () => {
    expect(B.slot).toBe(54); // .slot — NOT hotbar.slot's lifted 62
    expect(B.slotGap).toBe(8); // .B-slots { gap: 8px }
    expect(B.beltSlot).toBe(44); // .belt .slot
    expect(B.beltGap).toBe(6); // .belt { gap: 6px }
    expect(B.beltPad).toEqual({ top: 8, side: 8, bottom: 6 }); // .belt { padding: 8px 8px 6px }
  });

  it('pins the key chip, the icons and the ammo badges', () => {
    expect(B.chipH).toBe(16); // .kc { height: 16px }
    expect(B.chipMinW).toBe(16); // .kc { min-width: 16px }
    expect(B.chipPadX).toBe(3); // .kc { padding: 0 3px }
    expect(B.chipGap).toBe(5); // .sw { gap: 5px }
    expect(B.icon).toBe(28); // .slot > svg
    expect(B.beltIcon).toBe(22); // .belt .slot > svg
    expect(B.badge).toBe(16); // .badge
    expect(B.badgeOverhang).toBe(7); // .badge { top: -7px; right: -7px }
    expect(B.beltBadgeOverhang).toBe(6); // .belt .badge { top: -6px; right: -6px }
  });

  it('pins the XP strip row', () => {
    expect(B.stripGap).toBe(8); // .B-xp { margin-top: 8px }
    expect(B.strip).toBe(4); // .B-xp .hbar.xp { height: 4px }
    expect(B.stripRowH).toBe(24);
    expect(B.stripItemGap).toBe(10); // .B-xp { gap: 10px }
    expect(B.bankChip).toBe(24); // .B-bank .bank { width: 24px }
    expect(B.cueGap).toBe(8); // .B-bank { gap: 8px }
  });

  it('pins the dim alpha, the hairline, the globe bed and the waterline', () => {
    expect(B.dimAlpha).toBe(0.38); // .B-hud.dim .B-slots, .belt { opacity: .38 }
    expect(B.lineW).toBe(1);
    expect(B.globeBedAlpha).toBe(0.7);
    expect(B.waterline).toBe(1.5);
  });

  it('pins the bar type sizes — 9px micro included, NOT on the lifted ramp', () => {
    expect(B.type).toEqual({
      chip: 9,
      tier: 9,
      badge: 10, // .badge — a count, a px above the chips (wave 3 close-out)
      lv: 11,
      wipe: 18,
      hull: 18,
      hullMax: 10,
      hullLabel: 9,
      hdg: 15,
      hdgLabel: 9,
      kts: 9,
      helmKey: 9,
      cue: 9,
    });
    // The ramp keeps its lift (tokens.test.ts pins hudMicro at 14): the bar's
    // micro tier lives HERE precisely so the two can differ without either one
    // breaking the other.
    expect(CLIENT_CONFIG.type.registers.hudMicro.size).toBe(14);
  });

  it('pins the telegraph tick arc and the rudder track', () => {
    expect(B.tick).toEqual({ arcDeg: 70, stepDeg: 17.5, len: 6, stopLen: 9, rungW: 7, rungH: 10, needleW: 2 });
    // Nine detents span the arc exactly, end to end: -70 .. +70 in 17.5 steps.
    expect(-B.tick.arcDeg + 8 * B.tick.stepDeg).toBe(B.tick.arcDeg);
    expect(B.rudder).toEqual({ track: 48, tickW: 2, tickH: 8 });
  });

  it('pins the tier numeral\u2019s corner inset (.tier { right: 4px; bottom: 2px })', () => {
    expect(B.tierInset).toEqual({ right: 4, bottom: 2 });
  });

  it('pins the cooldown wipe skin', () => {
    expect(B.wipe.scrimAlpha).toBe(0.55); // .slot.cool background
    expect(B.wipe.darkAlpha).toBe(0.86); // .cd conic-gradient
    expect(B.wipe.iconAlpha).toBe(0.4); // .slot.cool > svg
    expect(B.wipe.sampleDeg).toBe(5);
    expect(B.wipe.shadowBlur).toBe(6); // .cd text-shadow blur
    expect(B.wipe.tenthsBelowMs).toBe(2000);
  });
});

describe('(b) hudBarLayout — the 768px bar, derived and anchored', () => {
  it('derives 768 from the parts, and never from a literal', () => {
    const slots = 5 * B.slot + 4 * B.slotGap; // 302
    const belt = B.beltPad.side * 2 + 4 * B.beltSlot + 3 * B.beltGap; // 210
    expect(slots).toBe(302);
    expect(belt).toBe(210);
    expect(HUD_BAR_WIDTH).toBe(B.globe + B.globeGap + slots + B.globeGap + belt + B.globeGap + B.globe);
    expect(HUD_BAR_WIDTH).toBe(768);
    expect(hudBarLayout(REF_W, REF_H).bar.w).toBe(768);
  });

  it('hangs from the FLOOR: the bar bottom sits 18px above the viewport floor', () => {
    expect(hudBarLayout(REF_W, REF_H).bar.y + hudBarLayout(REF_W, REF_H).bar.h).toBe(REF_H - B.floor);
    const floor = hudBarLayout(FLOOR_W, FLOOR_H);
    expect(floor.bar.y + floor.bar.h).toBe(FLOOR_H - B.floor);
  });

  it('is 136 tall — the 104 main row, 8px, the 24px strip row', () => {
    const { bar } = hudBarLayout(REF_W, REF_H);
    expect(bar.h).toBe(B.globe + B.stripGap + B.stripRowH);
    expect(bar.h).toBe(136);
  });

  it('CENTRES on an integer x at 1366 and at 1280', () => {
    expect(hudBarLayout(REF_W, REF_H).bar.x).toBe(299);
    expect(hudBarLayout(FLOOR_W, FLOOR_H).bar.x).toBe(256);
    for (const w of [1280, 1366, 1440, 1600, 1920, 1281]) {
      const { bar } = hudBarLayout(w, REF_H);
      expect(Number.isInteger(bar.x), `x at ${w}`).toBe(true);
      expect(bar.x).toBe(Math.round((w - 768) / 2));
    }
  });

  it('FITS the 1280x614 logical floor — the main row tops out at 460', () => {
    // 614 - 18 (floor) - 136 (bar) = 460, which clears the chrome bar at y 24
    // with the whole ocean in between. This is the pin behind ruling 1's "the
    // bar fits the floor viewport": the nine-row stack it replaces could not.
    const { bar } = hudBarLayout(FLOOR_W, FLOOR_H);
    expect(bar.y).toBe(460);
    expect(bar.y).toBeGreaterThan(24);
  });

  it('seats both globes at r 52, flush with the bar ends', () => {
    const { bar, hpGlobe, helmGlobe } = hudBarLayout(REF_W, REF_H);
    expect(hpGlobe.r).toBe(52);
    expect(helmGlobe.r).toBe(52);
    expect(hpGlobe.cx - hpGlobe.r).toBe(bar.x);
    expect(helmGlobe.cx + helmGlobe.r).toBe(bar.x + bar.w);
    // Both are centred on the 104px MAIN row, not on the whole bar.
    expect(hpGlobe.cy).toBe(bar.y + B.globe / 2);
    expect(helmGlobe.cy).toBe(hpGlobe.cy);
  });
});

describe('(b) the nine squares — five weapons at 54, four belt at 44', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('indexes by LOADOUT SLOT and sizes 0-4 at 54, 5-8 at 44', () => {
    expect(L.squares).toHaveLength(9);
    for (let i = 0; i <= 4; i++) {
      expect(L.squares[i].w, `slot ${i}`).toBe(54);
      expect(L.squares[i].h, `slot ${i}`).toBe(54);
    }
    for (let i = 5; i <= 8; i++) {
      expect(L.squares[i].w, `slot ${i}`).toBe(44);
      expect(L.squares[i].h, `slot ${i}`).toBe(44);
    }
  });

  it('runs the weapons left to right at an 8px gap, starting one gap past the HP globe', () => {
    expect(L.squares[0].x).toBe(L.bar.x + B.globe + B.globeGap);
    for (let i = 1; i <= 4; i++) {
      expect(L.squares[i].x - L.squares[i - 1].x, `gap ${i}`).toBe(B.slot + B.slotGap);
      expect(L.squares[i].y).toBe(L.squares[0].y);
    }
  });

  it('runs the belt at a 6px gap and leaves one 16px gap before the helm globe', () => {
    for (let i = 6; i <= 8; i++) {
      expect(L.squares[i].x - L.squares[i - 1].x, `belt gap ${i}`).toBe(B.beltSlot + B.beltGap);
    }
    expect(L.belt.x + L.belt.w + B.globeGap).toBe(L.helmGlobe.cx - L.helmGlobe.r);
  });

  it('CENTRES each column on the 104px main row — 75 tall for a weapon, 79 for the belt frame', () => {
    const colH = B.slot + B.chipGap + B.chipH;
    const beltH = B.beltPad.top + B.beltSlot + B.chipGap + B.chipH + B.beltPad.bottom;
    expect(colH).toBe(75);
    expect(beltH).toBe(79);
    const rowTop = L.bar.y;
    expect(L.squares[0].y).toBe(rowTop + (B.globe - colH) / 2);
    expect(L.belt.y).toBe(rowTop + (B.globe - beltH) / 2);
    expect(L.belt.h).toBe(beltH);
    // Centred means centred: the space above the column equals the space below.
    expect(L.squares[0].y - rowTop).toBe(rowTop + B.globe - (L.chips[0].y + B.chipH));
  });
});

describe('(b) the key chips hang 5px under their square', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('centres every chip on its square and drops it 5px, 16 tall', () => {
    expect(L.chips).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      const s = L.squares[i];
      expect(L.chips[i].cx, `chip ${i} cx`).toBe(s.x + s.w / 2);
      expect(L.chips[i].y, `chip ${i} y`).toBe(s.y + s.h + B.chipGap);
      expect(L.chips[i].y - (s.y + s.h)).toBe(5);
    }
    expect(B.chipH).toBe(16);
  });
});

describe('(b) the belt FRAME encloses its squares AND their chips', () => {
  const L = hudBarLayout(REF_W, REF_H);

  it('pads 8 side / 8 top / 6 bottom, with the bottom measured under the CHIPS', () => {
    // The mock's `.belt` wraps the whole `.sw` column (square + gap + chip), so
    // the frame's floor is 6px under the key chips and NOT under the squares —
    // a frame drawn round the squares alone would cut the chips in half.
    expect(L.belt.x).toBe(L.squares[5].x - B.beltPad.side);
    expect(L.belt.x + L.belt.w).toBe(L.squares[8].x + L.squares[8].w + B.beltPad.side);
    expect(L.belt.y).toBe(L.squares[5].y - B.beltPad.top);
    expect(L.belt.y + L.belt.h).toBe(L.chips[5].y + B.chipH + B.beltPad.bottom);
    expect(L.belt.w).toBe(210);
  });

  it('really does contain all four belt squares and all four belt chips', () => {
    for (let i = 5; i <= 8; i++) {
      const s = L.squares[i];
      expect(s.x, `sq ${i} left`).toBeGreaterThanOrEqual(L.belt.x);
      expect(s.x + s.w, `sq ${i} right`).toBeLessThanOrEqual(L.belt.x + L.belt.w);
      expect(s.y, `sq ${i} top`).toBeGreaterThanOrEqual(L.belt.y);
      expect(L.chips[i].y + B.chipH, `chip ${i} foot`).toBeLessThanOrEqual(L.belt.y + L.belt.h);
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
    expect(L.strip.chip.w).toBe(24);
    expect(L.strip.chip.h).toBe(24);
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
      x: L.squares[0].x,
      y: L.squares[0].y,
      w: 5 * B.slot + 4 * B.slotGap,
      h: B.slot + B.chipGap + B.chipH,
    });
    expect(L.dimGroups[1]).toEqual(L.belt);
  });

  it('covers slots 0-4 with their chips, and excludes both globes', () => {
    const g = L.dimGroups[0];
    for (let i = 0; i <= 4; i++) {
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
// forwards main.ts depends on (`slotAt` for the click gate, `barTop` for the
// satellite column). Everything each member DRAWS is its own suite's business.

const CLS = 'torpedoBoat' as const;
const STATS = effectiveStats(CONFIG.shipClasses[CLS]);
const LOADOUT: (EquipmentId | null)[] = slotsWithCards(STATS, SPAWN_SEED[CLS] ?? []).map((s) => s.equipmentId);
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
    hp: { hp: 212, maxHp: 250, repairHp: 0, alive: true, sinking: false },
    hpHold: false,
    helm: {
      headingRad: 0,
      speed: 4,
      orderedDetent: 6,
      rudder: 0,
      kin: STATS.kinematics,
      speedBonus: STATS.equipment.speedBoost.speedBonus,
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
    for (const slot of [0, 4, 5, 8]) {
      const sq = layout.squares[slot];
      expect(bar.slotAt({ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 })).toBe(slot);
    }
    expect(bar.slotAt({ x: layout.bar.x - 40, y: layout.bar.y })).toBe(null); // off the bar
    bar.hide();
    expect(bar.slotAt({ x: layout.squares[0].x + 2, y: layout.squares[0].y + 2 })).toBe(null);
  });

  it('exposes barTop — the satellite column hangs off the bar, not the viewport', () => {
    const { bar } = build();
    expect(bar.barTop).toBe(0); // nothing laid out yet
    bar.update(barView(), REF_W, REF_H, null, 10, 10_000, 1);
    expect(bar.barTop).toBe(hudBarLayout(REF_W, REF_H).bar.y);
    // It SURVIVES a hide: the anchor is pure geometry, and the chrome that hangs
    // off it (IN STORM, the victim tells) must not jump to the top of the screen
    // on the frame the bar goes away.
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
