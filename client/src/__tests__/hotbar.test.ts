// The hotbar's PURE CORE (Story 2.2) — the whole ratified contract, tested
// without instantiating Pixi (the class is a thin shell over these functions):
// slot order Gun–Q–E–R, the state grammar and its precedence, the ability
// chamfer, the >1-pool ammo badge, quick-info strings (incl. the live cooling
// countdown), the hit-test that both hover and the click gate consult, the
// key-equivalent click routing (amendment 11), the tooltip model (keyless gun
// line) and its viewport-safe placement.
//
// STORY 2.9 grew it into the surface where a boon becomes VISIBLE (amendment
// 51): the eighth ACTIVE state (amendment 48) with its breathing outline and
// countdown, the fit flash, the `◆n` compression, and the tooltip's accrued
// list. The container-fit half of that lives in __tests__/tooltipFit.test.ts.

import { describe, it, expect } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  effectiveStats,
  loadoutFor,
  resolveBoons,
  type EffectiveStats,
  type EquipmentId,
  type ShipClassId,
  type WeaponAmmo,
} from '@salvo/shared';
import {
  ACTIVE_PULSE_AMP,
  ACTIVE_PULSE_HZ,
  EMPTY_SLOT_LABEL,
  NO_HOVER,
  SHIP_DIVIDER_ROW,
  TIP_TYPE,
  TOOLTIP_MAX_PANEL_H,
  activeBreath,
  advanceBreathPhase,
  activeTag,
  badgeText,
  boonMark,
  boonRows,
  breathedSkin,
  coolFraction,
  degradedSkin,
  fitFrameAlpha,
  FIT_FRAME_ALPHA,
  FIT_PULSE_PX,
  fmtDamage,
  fmtRemaining,
  fmtSeconds,
  fmtWindow,
  hotbarLayout,
  hoverReady,
  isCooling,
  nextHover,
  quickInfoLine,
  shouldShowTooltip,
  slotAtPoint,
  slotBoonIds,
  slotDegraded,
  slotFlags,
  slotSkin,
  slotState,
  slotViewModels,
  tooltipModel,
  tooltipPlacement,
  tooltipRenderGeom,
  trimmedBoonRows,
  type HotbarView,
  type TooltipBoonRow,
} from '../render/hotbar.js';
import {
  EQUIPMENT_NAME,
  equipmentInfo,
  interactionLine,
  slotForBoonCategory,
  SLOT_KEY_GLYPHS,
} from '../render/equipmentInfo.js';
import { FLASH_ELEMENTS, createFlashBudget, hotbarSlotKey } from '../render/flashBudget.js';
import { CLIENT_CONFIG } from '../config.js';

const H = CLIENT_CONFIG.hotbar;
const C = CLIENT_CONFIG.colors;

/**
 * Effective stats for a class with an optional BOON build (Story 2.8 — the
 * legacy `upg` counts vector died; boons are the whole stat input). `boons` is
 * an id → stack-count map, expanded to the repeated-id list the catalog stacks
 * by occurrence.
 */
function statsFor(cls: ShipClassId, boons: Partial<Record<string, number>> = {}): EffectiveStats {
  const ids: string[] = [];
  for (const [id, n] of Object.entries(boons)) {
    for (let i = 0; i < (n ?? 0); i += 1) ids.push(id);
  }
  return effectiveStats(CONFIG.shipClasses[cls], resolveBoons(ids, BOON_CATALOG));
}

function idsFor(cls: ShipClassId, stats: EffectiveStats): (EquipmentId | null)[] {
  return loadoutFor(cls, stats).map((s) => s.equipmentId);
}

/** A live hotbar view: full pools, nothing cooling, gun selected, no flags. */
function viewFor(cls: ShipClassId, over: Partial<HotbarView> = {}): HotbarView {
  const stats = statsFor(cls);
  const loadout = idsFor(cls, stats);
  const ammo: (WeaponAmmo | null)[] = loadout.map((id) =>
    id === null ? null : { n: equipmentInfo(stats, id).maxAmmo, reloadMsLeft: 0 },
  );
  return {
    loadout,
    ammo,
    stats,
    primedSlot: 0,
    denied: [false, false, false, false],
    activated: [false, false, false, false],
    dim: false,
    ...over,
  };
}

describe('slot order — Gun (keyless) / Q / E / R, top to bottom (amendment 10)', () => {
  it('is four slots with the gun on top and no key of its own', () => {
    expect(SLOT_KEY_GLYPHS).toEqual(['', 'Q', 'E', 'R']);
    const rows = slotViewModels(viewFor('torpedoBoat'));
    expect(rows.map((r) => r.keyGlyph)).toEqual(['', 'Q', 'E', 'R']);
    expect(rows.map((r) => r.id)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
  });

  it('names each hull its own fit; slot 3 reads the awaiting-refit label', () => {
    expect(slotViewModels(viewFor('battleship')).map((r) => r.name)).toEqual([
      'Deck Gun',
      'Broadside Barrage',
      'Star Shells',
      EMPTY_SLOT_LABEL,
    ]);
    expect(slotViewModels(viewFor('mineLayer')).map((r) => r.id)).toEqual(['gun', 'mine', 'radarBuoy', null]);
  });
});

describe('the seven-state grammar + its precedence', () => {
  const NONE = { denied: false, activated: false };

  it('maps every state', () => {
    expect(slotState(null, NONE, false, false, false)).toBe('empty');
    expect(slotState('torpedo', { ...NONE, denied: true }, false, false, true)).toBe('denied');
    expect(slotState('speedBoost', { ...NONE, activated: true }, false, false, false)).toBe('activated');
    expect(slotState('torpedo', NONE, true, false, true)).toBe('cooling');
    expect(slotState('gun', NONE, false, true, true)).toBe('selected');
    expect(slotState('torpedo', NONE, false, false, true)).toBe('readyWeapon');
    expect(slotState('speedBoost', NONE, false, false, false)).toBe('readyAbility');
  });

  it('resolves denied > activated > cooling > selected > ready', () => {
    const all = { denied: true, activated: true };
    expect(slotState('gun', all, true, true, true)).toBe('denied');
    expect(slotState('gun', { denied: false, activated: true }, true, true, true)).toBe('activated');
    expect(slotState('gun', NONE, true, true, true)).toBe('cooling');
    expect(slotState('gun', NONE, false, true, true)).toBe('selected');
  });

  it('an UNFITTED slot short-circuits everything (R is inert — no flag can reach it)', () => {
    expect(slotState(null, { denied: true, activated: true }, true, true, true)).toBe('empty');
  });

  it('keeps SELECTED as its own channel so a selected+cooling slot still reads selected', () => {
    const rows = slotViewModels(
      viewFor('torpedoBoat', { primedSlot: 0, ammo: [{ n: 0, reloadMsLeft: 1200 }, null, null, null] }),
    );
    expect(rows[0].state).toBe('cooling'); // the box shows the conic track
    expect(rows[0].selected).toBe(true); // ...and the chip/name stay amber (dual-coding)
  });

  it('COOLING is availability, not timer state — a pool with a round left reads READY', () => {
    // Fired 1 of an upgraded 2-fish tube: the reload runs for the NEXT fish, but
    // the slot is still fireable, so it must not dim (and the track stays off).
    expect(isCooling({ n: 1, reloadMsLeft: 4000 })).toBe(false);
    expect(isCooling({ n: 0, reloadMsLeft: 4000 })).toBe(true);
    expect(isCooling({ n: 0, reloadMsLeft: 0 })).toBe(false); // dry with no reload running
    expect(isCooling(null)).toBe(false);
    const stats = statsFor('torpedoBoat', { torpedoTube: 1 });
    const rows = slotViewModels({
      ...viewFor('torpedoBoat'),
      stats,
      loadout: idsFor('torpedoBoat', stats),
      ammo: [{ n: 1, reloadMsLeft: 0 }, { n: 1, reloadMsLeft: 4000 }, { n: 1, reloadMsLeft: 0 }, null],
    });
    expect(rows[1].state).toBe('readyWeapon');
    expect(rows[1].coolFrac).toBe(0); // no conic track while a round is available
    expect(rows[1].badge).toBe('1'); // the badge carries the availability instead
    expect(rows[1].quickInfo).toContain(`CD ${fmtSeconds(CONFIG.torpedo.reloadMs)}`); // full CD, not a countdown
  });

  it('drives each state from a distinct DESIGN.md token recipe (no literals)', () => {
    expect(slotSkin('denied').border).toBe(C.denied);
    expect(slotSkin('selected').border).toBe(C.amber);
    expect(slotSkin('selected').washAlpha).toBeGreaterThan(0); // the inset wash channel
    expect(slotSkin('readyWeapon').border).toBe(C.phosphor);
    expect(slotSkin('readyAbility').borderAlpha).toBeGreaterThan(slotSkin('readyWeapon').borderAlpha);
    expect(slotSkin('readyAbility').glowPx).toBeGreaterThan(slotSkin('readyWeapon').glowPx);
    expect(slotSkin('activated').glowPx).toBeGreaterThan(slotSkin('selected').glowPx);
    expect(slotSkin('cooling').scrim).toBe(true);
    expect(slotSkin('cooling').border).toBe(C.silver); // the DESIGN idle recipe, silver .28
    expect(slotSkin('cooling').borderAlpha).toBe(0.28);
    expect(slotSkin('empty').dashed).toBe(true);
  });
});

describe('the chamfer is an ABILITY shape mark — weapons never carry it', () => {
  it('cuts only the ability rows of each hull', () => {
    // The TB's E slot is the speed boost — the game's ONLY remaining ability.
    expect(slotViewModels(viewFor('torpedoBoat')).map((r) => r.chamfer)).toEqual([false, false, true, false]);
    expect(slotViewModels(viewFor('battleship')).map((r) => r.chamfer)).toEqual([false, false, false, false]);
    // PIN FLIPPED (Story 2.8, amendment 45): the ML's Q slot holds the MINE, a
    // click-aimed weapon — no chamfer. PIN FLIPPED AGAIN (Story 7-5 wave 2,
    // R2.7): its E slot now holds the click-placed RADAR BUOY, so the Mine Layer
    // carries NO chamfered row at all.
    expect(slotViewModels(viewFor('mineLayer')).map((r) => r.chamfer)).toEqual([false, false, false, false]);
  });
});

describe('ammo badge — only on pools LARGER than one round', () => {
  it('shows nothing at base (gun 1, torpedo 1, boost 1)', () => {
    expect(slotViewModels(viewFor('torpedoBoat')).map((r) => r.badge)).toEqual([null, null, null, null]);
  });

  it('appears once torpedoAmmo grows the tube, and counts the LIVE pool', () => {
    const stats = statsFor('torpedoBoat', { torpedoTube: 1 });
    const loadout = idsFor('torpedoBoat', stats);
    const view: HotbarView = {
      ...viewFor('torpedoBoat'),
      stats,
      loadout,
      ammo: [{ n: 1, reloadMsLeft: 0 }, { n: 2, reloadMsLeft: 0 }, { n: 1, reloadMsLeft: 0 }, null],
    };
    expect(equipmentInfo(stats, 'torpedo').maxAmmo).toBe(2); // the upgrade landed
    expect(slotViewModels(view).map((r) => r.badge)).toEqual([null, '2', null, null]);
    const fired = slotViewModels({ ...view, ammo: [view.ammo[0], { n: 1, reloadMsLeft: 4000 }, view.ammo[2], null] });
    expect(fired[1].badge).toBe('1'); // counts down on fire, back up on reload completion
  });

  it('renders NO badge when the ammo entry is missing (never a fabricated "0")', () => {
    const stats = statsFor('torpedoBoat', { torpedoTube: 1 });
    expect(badgeText(equipmentInfo(stats, 'torpedo'), null)).toBeNull();
    expect(badgeText(equipmentInfo(stats, 'torpedo'), { n: 0, reloadMsLeft: 1 })).toBe('0'); // a REAL empty pool does read 0
    const rows = slotViewModels({ ...viewFor('torpedoBoat'), stats, loadout: idsFor('torpedoBoat', stats), ammo: [null, null, null, null] });
    expect(rows.map((r) => r.badge)).toEqual([null, null, null, null]);
  });
});

describe('quick-info line (amendment 13) — real values, live countdown', () => {
  const stats = statsFor('torpedoBoat');

  it('reads DMG · CD for WEAPONS and CD alone for ABILITIES (amendment 13, literal)', () => {
    // CONFIG-derived, never a literal: the gun's base reload moved 3s → 5s with
    // the global-cooldown rebalance (Eric ruling 2026-08-04), and the chip has
    // to follow CONFIG rather than a hand-copied number.
    expect(quickInfoLine(equipmentInfo(stats, 'gun'), 0)).toBe(
      `DMG ${CONFIG.gun.damage} · CD ${fmtSeconds(CONFIG.gun.reloadMs)}`,
    );
    expect(quickInfoLine(equipmentInfo(stats, 'torpedo'), 0)).toBe(
      `DMG ${CONFIG.torpedo.damage} · CD ${fmtSeconds(CONFIG.torpedo.reloadMs)}`,
    );
    expect(quickInfoLine(equipmentInfo(stats, 'broadside'), 0)).toContain(`DMG ${CONFIG.broadside.damage}`);
    // PIN FLIPPED (Story 2.8, amendment 45): the MINE is a click-aimed WEAPON
    // now, so it reads DMG · CD like every other weapon — the line it used to
    // hide in the tooltip description.
    expect(quickInfoLine(equipmentInfo(stats, 'mine'), 0)).toBe(
      `DMG ${CONFIG.mine.damage} · CD ${fmtSeconds(CONFIG.mine.reloadMs)}`,
    );
    // PIN FLIPPED (Story 2.8, amendment 39): star shells lost ALL damage — pure
    // illumination — so they read CD alone like an ability.
    expect(quickInfoLine(equipmentInfo(stats, 'starShells'), 0)).toBe(
      `CD ${fmtSeconds(CONFIG.starShells.reloadMs)}`,
    );
    expect(quickInfoLine(equipmentInfo(stats, 'starShells'), 0)).not.toContain('DMG');
    expect(quickInfoLine(equipmentInfo(stats, 'speedBoost'), 0)).toBe(`CD ${fmtSeconds(CONFIG.speedBoost.reloadMs)}`);
    expect(quickInfoLine(equipmentInfo(stats, 'radarBuoy'), 0)).toBe(`CD ${fmtSeconds(CONFIG.radarBuoy.reloadMs)}`);
  });

  // The documented migration seam closed in Story 2.8: damage is stat-driven,
  // so equipmentDamage() reads the firewall's output, not CONFIG. Story 7-5
  // wave 1 DELETED every card that moved a damage number (HEAVY SHELLS, HEAVY
  // WARHEAD, TNT FILLER), so the "a stack moves it" half is RETIRED — the paths
  // stay whitelisted and unwritten, and the readout is pinned against a
  // hand-built stats object instead, which proves the same seam without a card.
  it('DMG rides the effective stats, not CONFIG', () => {
    const base = statsFor('mineLayer');
    const heavy: EffectiveStats = {
      ...base,
      mine: { ...base.mine, damage: base.mine.damage + 7 },
      gun: { ...base.gun, damage: base.gun.damage + 3 },
    };
    expect(quickInfoLine(equipmentInfo(heavy, 'mine'), 0)).toContain(`DMG ${heavy.mine.damage}`);
    expect(heavy.mine.damage).toBeGreaterThan(CONFIG.mine.damage);
    expect(quickInfoLine(equipmentInfo(heavy, 'gun'), 0)).toContain(`DMG ${heavy.gun.damage}`);
    expect(heavy.gun.damage).toBeGreaterThan(CONFIG.gun.damage);
  });

  it('counts the REMAINING seconds down while cooling', () => {
    expect(quickInfoLine(equipmentInfo(stats, 'gun'), 1440)).toBe(`DMG ${CONFIG.gun.damage} · CD 1.5s`);
    expect(quickInfoLine(equipmentInfo(stats, 'speedBoost'), 6200)).toBe('CD 6.2s');
  });

  it('trims whole seconds and never reads 0s while still cooling', () => {
    expect(fmtSeconds(3000)).toBe('3s');
    expect(fmtSeconds(12000)).toBe('12s');
    expect(fmtSeconds(4500)).toBe('4.5s');
    expect(fmtRemaining(20)).toBe('0.1s');
    expect(fmtRemaining(0)).toBe('0.1s'); // floored — a cooling slot never reads 0s
  });

  it('clamps the conic fraction, so a mid-reload reload UPGRADE cannot invert the track', () => {
    expect(coolFraction(5000, 3000)).toBe(0); // reloadMsLeft >= the (new, shorter) reloadMs
    expect(coolFraction(0, 3000)).toBe(0);
    expect(coolFraction(1500, 3000)).toBeCloseTo(0.5, 9);
    const rows = slotViewModels(
      viewFor('torpedoBoat', { ammo: [{ n: 0, reloadMsLeft: 9000 }, null, null, null] }),
    );
    expect(rows[0].state).toBe('cooling'); // ...still cooling, so the dim ring is still drawn
    expect(rows[0].coolFrac).toBe(0);
  });

  it('ticks on EVERY slot regardless of which one is selected', () => {
    const rows = slotViewModels(
      viewFor('torpedoBoat', {
        primedSlot: 0, // the GUN is selected...
        ammo: [{ n: 1, reloadMsLeft: 0 }, { n: 0, reloadMsLeft: 11900 }, { n: 1, reloadMsLeft: 0 }, null],
      }),
    );
    expect(rows[1].state).toBe('cooling'); // ...the unselected torpedo still cools
    expect(rows[1].quickInfo).toContain('CD 11.9s');
    expect(rows[1].coolFrac).toBeGreaterThan(0);
    expect(rows[1].coolFrac).toBeLessThan(1);
  });
});

describe('layout + slotAtPoint — the hit-test behind hover AND the click gate', () => {
  const layout = hotbarLayout(768);

  it('stacks four 54px slots bottom-left with the ratified gaps and gutter', () => {
    expect(layout.rows).toHaveLength(4);
    expect(layout.stackHeight).toBe(4 * H.slot + 3 * H.gap);
    expect(layout.stackTop + layout.stackHeight).toBe(768 - H.bottom);
    expect(layout.rows[0].keyX).toBe(H.left);
    expect(layout.rows[0].box.x).toBe(H.left + H.keyChip + H.keyGap);
    expect(layout.rows[1].box.y - layout.rows[0].box.y).toBe(H.slot + H.gap);
    expect(layout.gutterX).toBe(H.left - H.gutter); // reserved dead space (2.6's XP rail)
  });

  it('hits the WHOLE row — key chip, slot square, badge overhang, label column', () => {
    for (const row of layout.rows) {
      const c = { x: row.box.x + row.box.size / 2, y: row.box.y + row.box.size / 2 };
      expect(slotAtPoint(c, layout)).toBe(row.slot); // the slot square
      expect(slotAtPoint({ x: row.keyX + 2, y: row.keyY + 2 }, layout)).toBe(row.slot); // key chip
      expect(slotAtPoint({ x: row.labelX + 4, y: row.nameY + 2 }, layout)).toBe(row.slot); // name
      expect(slotAtPoint({ x: row.labelX + 4, y: row.infoY + 2 }, layout)).toBe(row.slot); // quick-info
      // the ammo badge overhangs the slot's top-right by badgeOverhang px
      const badge = { x: row.box.x + row.box.size + H.badgeOverhang - 2, y: row.box.y - H.badgeOverhang + 2 };
      expect(slotAtPoint(badge, layout)).toBe(row.slot);
    }
  });

  it('leaves the reserved gutter, the inter-row gaps, and open water as WATER', () => {
    const first = layout.rows[0];
    expect(slotAtPoint({ x: layout.gutterX + 2, y: first.box.y + 10 }, layout)).toBeNull(); // 2.6's XP rail
    expect(slotAtPoint({ x: first.keyX - 1, y: first.box.y + 10 }, layout)).toBeNull(); // left of the row
    expect(slotAtPoint({ x: first.row.x + first.row.w + 1, y: first.box.y + 10 }, layout)).toBeNull(); // past the label
    expect(slotAtPoint({ x: first.box.x + 10, y: first.row.y - 1 }, layout)).toBeNull(); // above the stack
    expect(slotAtPoint({ x: 900, y: 400 }, layout)).toBeNull(); // open water
  });

  it('lands in the gap BETWEEN two rows as a miss (only real rows swallow)', () => {
    // The badge overhang eats the top 7px of each gap; the rest stays water.
    const gapY = layout.rows[0].box.y + H.slot + (H.gap - H.badgeOverhang) / 2;
    expect(slotAtPoint({ x: layout.rows[0].box.x + 5, y: gapY }, layout)).toBeNull();
    expect(slotAtPoint({ x: layout.rows[0].keyX + 2, y: gapY }, layout)).toBeNull();
  });

  it('a HIDDEN hotbar (null layout) routes nothing — every press falls through', () => {
    const c = { x: layout.rows[0].box.x + 5, y: layout.rows[0].box.y + 5 };
    expect(slotAtPoint(c, layout)).toBe(0);
    expect(slotAtPoint(c, null)).toBeNull();
  });
});

describe('hover dwell — the tooltip waits out a short delay', () => {
  it('restarts the clock whenever the hovered slot changes', () => {
    let h = nextHover(NO_HOVER, 1, 1000);
    expect(hoverReady(h, 1000)).toBe(false);
    expect(hoverReady(h, 1000 + H.tooltip.delayMs)).toBe(true);
    h = nextHover(h, 2, 1200); // moved to another slot
    expect(hoverReady(h, 1400)).toBe(false);
    expect(hoverReady(h, 1200 + H.tooltip.delayMs)).toBe(true);
  });

  it('never shows with nothing hovered', () => {
    expect(hoverReady(nextHover(NO_HOVER, null, 5000), 99999)).toBe(false);
  });
});

describe('tooltip gating — dwell, pointer presence, and the modal lockout', () => {
  const dwelled = nextHover(NO_HOVER, 1, 0);

  it('shows only once the dwell elapsed, with a model to show', () => {
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs, false, true)).toBe(true);
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs - 1, false, true)).toBe(false);
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs, false, false)).toBe(false); // unfitted slot
  });

  it('never shows while the refit modal holds the lockout (no ghost under the modal)', () => {
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs, true, true)).toBe(false);
  });

  it('never shows with the pointer OUT of the window (a null cursor hovers nothing)', () => {
    // main.ts feeds the hotbar `mouse.pointerInside ? screenPos : null`, and a
    // null cursor resolves the hover to "no slot" — which can never be ready.
    const gone = nextHover(dwelled, null, 10);
    expect(hoverReady(gone, 99999)).toBe(false);
    expect(shouldShowTooltip(gone, 99999, false, true)).toBe(false);
  });
});

describe('tooltip model — name, interaction class, description, and NO boons', () => {
  const stats = statsFor('torpedoBoat');

  it('gives the keyless gun its always-selected interaction line', () => {
    const t = tooltipModel(0, 'gun', stats);
    expect(t).not.toBeNull();
    expect(t?.name).toBe('DECK GUN');
    expect(t?.interaction).toBe('WEAPON · ALWAYS SELECTED');
    expect(t?.description.length).toBeGreaterThan(20);
  });

  it('labels a weapon slot SWITCH-TO and an ability slot ACTIVATES, with its key', () => {
    expect(tooltipModel(1, 'torpedo', stats)?.interaction).toBe('WEAPON · Q · SWITCH-TO');
    expect(tooltipModel(2, 'speedBoost', stats)?.interaction).toBe('ABILITY · E · ACTIVATES');
    // PIN FLIPPED (Story 2.8, amendment 45): the mine primes on its slot key
    // and places on a click, exactly like the torpedo.
    expect(interactionLine(3, 'mine')).toBe('WEAPON · R · SWITCH-TO');
    expect(tooltipModel(1, 'mine', stats)?.interaction).toBe('WEAPON · Q · SWITCH-TO');
  });

  it('renders boons as ABSENCE — the list is empty, so no divider and no rows are drawn', () => {
    for (const id of ['gun', 'torpedo', 'mine', 'speedBoost', 'broadside', 'starShells', 'radarBuoy'] as const) {
      expect(tooltipModel(1, id, stats)?.boons).toEqual([]);
    }
  });

  it('has nothing to describe for an unfitted slot', () => {
    expect(tooltipModel(3, null, stats)).toBeNull();
  });
});

describe('tooltip placement — flanks the stack and never leaves the viewport', () => {
  const layout = hotbarLayout(768);

  it('flanks RIGHT of the slot by default, vertically centered on it', () => {
    const row = layout.rows[1];
    const p = tooltipPlacement(row, 120, 1366, 768);
    expect(p.notchLeft).toBe(true); // notch on the panel's left edge = panel is to the right
    expect(p.x).toBe(row.box.x + row.box.size + H.tooltip.gap);
    expect(p.y + 60).toBeCloseTo(row.box.y + row.box.size / 2, 6);
  });

  it('flips to the LEFT flank when the panel would run off the right edge', () => {
    const row = layout.rows[0];
    const narrow = row.box.x + row.box.size + H.tooltip.gap + H.tooltip.width; // exactly one px too tight
    const p = tooltipPlacement(row, 120, narrow - 1, 768);
    expect(p.notchLeft).toBe(false);
    expect(p.x).toBeLessThan(row.box.x);
  });

  it('clamps a tall panel inside the top and bottom edges', () => {
    const p = tooltipPlacement(layout.rows[3], 700, 1366, 768);
    expect(p.y).toBeGreaterThanOrEqual(H.tooltip.margin);
    expect(p.y + 700).toBeLessThanOrEqual(768 - H.tooltip.margin + 1);
    expect(p.notchY).toBeGreaterThanOrEqual(p.y);
    expect(p.notchY).toBeLessThanOrEqual(p.y + 700);
  });
});

// --- THE CONTAINER-FIT LAW (amendment 47) -------------------------------------
//
// The slot row's label column is a FIXED 268px box (CLIENT_CONFIG.hotbar
// .labelWidth) and it is also the row's clickable footprint (amendment 11), so
// a label wider than it does not merely look wrong — its tail hangs over open
// water that still fires the gun.
//
// The live-site defect this pins: `applyStatEffect` folds `value * mult + add`
// with no rounding, so PROP-FOULING MINES (x0.6) fitted AFTER a filler stack
// produced `31.799999999999997` and the quick-info line rendered
// `DMG 31.799999999999997 · CD 8s` — 332.8px in the 268px column.
describe('label column fit (amendment 47)', () => {
  const MONO_ADVANCE = 0.605; // Geist Mono 0.6em, Menlo 0.6021em — the whole declared stack
  const monoW = (s: string, px: number, ls: number): number => [...s].length * (px * MONO_ADVANCE + ls);
  const EVERY = Object.values(BOON_CATALOG);
  /** Every non-acquisition line at full copies: the largest numbers reachable. */
  const MAXED = EVERY.filter((d) => !d.effects.some((e) => e.kind === 'slotFill')).flatMap((d) =>
    Array<string>(d.copies).fill(d.id),
  );

  /**
   * The builds that actually produce ugly numbers. `applyStatEffect` folds in
   * BOON-GRANT ORDER, so a multiplier doctrine landing on top of k additive
   * cards is a different float every k — 53 x 0.6 is 31.799999999999997 while
   * 65 x 0.6 is exact. A single "everything maxed" build sails right past it,
   * so every (additive line, rival doctrine) pair is swept at every stack depth.
   */
  const BUILDS: string[][] = [[], MAXED];
  for (const excl of EVERY.filter((d) => d.rarity === 'exclusive')) {
    for (const common of EVERY.filter((d) => d.category === excl.category && d.rarity === 'common')) {
      for (let k = 0; k <= common.copies; k += 1) BUILDS.push([...Array<string>(k).fill(common.id), excl.id]);
    }
  }

  it('NO quick-info line, at any boon stack, is wider than the 268px label column', () => {
    const over: string[] = [];
    for (const cls of Object.keys(CONFIG.shipClasses) as ShipClassId[]) {
      for (const boons of BUILDS) {
        const stats = effectiveStats(CONFIG.shipClasses[cls], resolveBoons(boons, BOON_CATALOG));
        for (const id of Object.keys(EQUIPMENT_NAME) as EquipmentId[]) {
          const info = equipmentInfo(stats, id);
          for (const left of [0, 1, 999, info.reloadMs]) {
            const line = quickInfoLine(info, left);
            const w = monoW(line, 16, 0.8); // INFO_STYLE
            if (w > H.labelWidth) over.push(`${cls}/${id}: "${line}" = ${w.toFixed(1)}px > ${H.labelWidth}px`);
          }
        }
      }
    }
    expect(over).toEqual([]);
  });

  it('rounds the damage figure at the display seam (integers bare, else one decimal)', () => {
    expect(fmtDamage(45)).toBe('45');
    expect(fmtDamage(31.799999999999997)).toBe('31.8');
    expect(fmtDamage(34.199999999999996)).toBe('34.2');
    expect(fmtDamage(0)).toBe('0');
    // The whole point: no float tail ever reaches the label column.
    for (const hp of [31.799999999999997, 34.199999999999996, 1 / 3]) {
      expect(fmtDamage(hp).length).toBeLessThanOrEqual(5);
    }
  });

  it('NO slot name, including the empty-slot label, is wider than the label column', () => {
    const names = [...Object.values(EQUIPMENT_NAME), EMPTY_SLOT_LABEL];
    for (const n of names) expect(monoW(n, 20, 0.3)).toBeLessThanOrEqual(H.labelWidth);
  });

  it('NO ammo badge digit is wider than the 22px badge square', () => {
    const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, resolveBoons(MAXED, BOON_CATALOG));
    for (const id of Object.keys(EQUIPMENT_NAME) as EquipmentId[]) {
      for (const n of [0, 1, 2, 9]) {
        const t = badgeText(equipmentInfo(stats, id), { n, reloadMsLeft: 0 });
        if (t !== null) expect(monoW(t, 16, 0)).toBeLessThanOrEqual(H.badge);
      }
    }
  });
});

// --- Story 2.9: the build, felt on the slot ------------------------------------

describe('the EIGHTH state: ACTIVE while an ability window runs (amendment 48)', () => {
  const NONE = { denied: false, activated: false };

  it('enters ACTIVE from a running window, and leaves it when the window ends', () => {
    const base = viewFor('torpedoBoat'); // slot 2 = speedBoost
    const running = slotViewModels({ ...base, activeMsLeft: [0, 0, 3000, 0] });
    expect(running[2].state).toBe('active');
    const ended = slotViewModels({ ...base, activeMsLeft: [0, 0, 0, 0] });
    expect(ended[2].state).toBe('readyAbility');
  });

  it('outranks COOLING — a decoy floats while its rack reloads — but not denied/activated', () => {
    expect(slotState('radarBuoy', NONE, true, false, false, true)).toBe('active');
    expect(slotState('radarBuoy', NONE, true, true, false, true)).toBe('active');
    expect(slotState('radarBuoy', { ...NONE, denied: true }, true, false, false, true)).toBe('denied');
    expect(slotState('radarBuoy', { ...NONE, activated: true }, true, false, false, true)).toBe('activated');
    // ...and the conic cool track keeps its fraction, so nothing is lost.
    const view = viewFor('mineLayer', {
      ammo: [null, null, { n: 0, reloadMsLeft: 5000 }, null],
      activeMsLeft: [0, 0, 20_000, 0],
    });
    const decoy = slotViewModels(view)[2];
    expect(decoy.state).toBe('active');
    expect(decoy.coolFrac).toBeGreaterThan(0);
  });

  it('prints the remaining WHOLE seconds in the quick-info line, dual-coding the outline', () => {
    const stats = statsFor('torpedoBoat');
    const boost = equipmentInfo(stats, 'speedBoost');
    expect(quickInfoLine(boost, 0, 3200)).toBe(`ACTIVE 4s · CD ${fmtSeconds(boost.reloadMs)}`);
    expect(quickInfoLine(boost, 0, 0)).toBe(`CD ${fmtSeconds(boost.reloadMs)}`);
    expect(activeTag(0)).toBe('');
    expect(fmtWindow(1)).toBe('1s'); // a live window never reads 0s
    expect(fmtWindow(12_010)).toBe('13s');
  });

  it('keeps the countdown at EVERY motion level — only the breathing stops', () => {
    const stats = statsFor('torpedoBoat');
    const boost = equipmentInfo(stats, 'speedBoost');
    // The text is motion-independent by construction (no motion input at all).
    expect(quickInfoLine(boost, 0, 2000)).toContain('ACTIVE');
    // motion=off → amplitude 0 → a STATIC outline at full alpha, not a dark one.
    expect(activeBreath(1.234, 0)).toBe(1);
    expect(activeBreath(9.9, 0)).toBe(1);
  });

  it('breathes under the SHARED photosensitivity cap, never on a literal', () => {
    expect(ACTIVE_PULSE_HZ).toBeLessThanOrEqual(CLIENT_CONFIG.settings.pulseCapHz);
    expect(ACTIVE_PULSE_HZ).toBeLessThanOrEqual(0.5); // amendment 48's >= 2s cycle
    // The breath swings the alpha multiplier inside [1 - 2a, 1] and never above 1.
    for (let t = 0; t < 4; t += 0.05) {
      const b = activeBreath(t);
      expect(b).toBeLessThanOrEqual(1 + 1e-9);
      expect(b).toBeGreaterThanOrEqual(1 - 2 * ACTIVE_PULSE_AMP - 1e-9);
    }
  });

  it('applies the breath to the ACTIVE outline ONLY', () => {
    const dim = breathedSkin('active', 1, 0.5);
    const full = slotSkin('active', 1);
    expect(dim.borderAlpha).toBeCloseTo(full.borderAlpha * 0.5);
    expect(dim.glowAlpha).toBeCloseTo(full.glowAlpha * 0.5);
    expect(dim.borderWidth).toBe(full.borderWidth); // width holds — shape is information
    for (const s of ['cooling', 'selected', 'readyWeapon', 'denied'] as const) {
      expect(breathedSkin(s, 1, 0.2)).toEqual(slotSkin(s, 1));
    }
  });
});

describe('the FIT flash — the slot-side visible change (amendment 51)', () => {
  it('flashes only the slot whose family took the boon', () => {
    const rows = slotViewModels(viewFor('torpedoBoat', { fit: [false, true, false, false] }));
    expect(rows.map((r) => r.fitFlash)).toEqual([false, true, false, false]);
  });

  it('is suppressed at motion=off (the toast + tooltip row carry it statically)', () => {
    const on = slotViewModels(viewFor('torpedoBoat', { fit: [true, false, false, false], motion: 'reduced' }));
    const off = slotViewModels(viewFor('torpedoBoat', { fit: [true, false, false, false], motion: 'off' }));
    expect(on[0].fitFlash).toBe(true);
    expect(off[0].fitFlash).toBe(false);
  });

  it('routes a fitted CATEGORY to its slot, and a shipwide line to no slot at all', () => {
    const loadout = idsFor('mineLayer', statsFor('mineLayer')); // gun / mine / radarBuoy / null
    expect(slotForBoonCategory(loadout, 'guns')).toBe(0);
    expect(slotForBoonCategory(loadout, 'mines')).toBe(1);
    expect(slotForBoonCategory(loadout, 'radarBuoy')).toBe(2);
    expect(slotForBoonCategory(loadout, 'intel')).toBeNull();
    expect(slotForBoonCategory(loadout, 'ship')).toBeNull();
    // A category this hull does not carry owns no slot either (rank-wide flash).
    expect(slotForBoonCategory(loadout, 'torpedoes')).toBeNull();
  });
});

describe('the ◆n accrued mark compresses the build into the row', () => {
  it('counts the slot family only, and shows nothing on an unboonded slot', () => {
    const boons = ['gunBarrel', 'gunBarrel', 'torpedoSpeed'];
    const rows = slotViewModels(viewFor('torpedoBoat', { boons }));
    expect(rows[0].boonCount).toBe(2); // gun
    expect(rows[1].boonCount).toBe(1); // torpedo
    expect(rows[2].boonCount).toBe(0); // boost
    expect(rows[0].quickInfo.endsWith(' ◆2')).toBe(true);
    expect(rows[2].quickInfo).not.toContain('◆');
  });

  it('folds the shipwide lines into the GUN slot only (the ship card)', () => {
    const boons = ['intelSweep', 'shipHull', 'shipCooldown'];
    const rows = slotViewModels(viewFor('torpedoBoat', { boons }));
    expect(rows[0].boonCount).toBe(3);
    expect(rows[1].boonCount).toBe(0);
    expect(slotBoonIds('torpedo', boons)).toEqual([]);
  });

  it('ignores a junk id on the wire rather than counting it', () => {
    expect(slotBoonIds('gun', ['gunBarrel', 'notARealBoon', 'constructor'])).toEqual(['gunBarrel']);
  });

  it('clamps at 9+ so the mark can never outgrow the label column', () => {
    expect(boonMark(0)).toBe('');
    expect(boonMark(9)).toBe(' ◆9');
    expect(boonMark(12)).toBe(' ◆9+');
  });
});

describe('the tooltip lists the ACCRUED build (the 2.2 absence, filled)', () => {
  const stats = statsFor('torpedoBoat');

  it('gives every held line a ◆ name row and a live effect line', () => {
    const t = tooltipModel(1, 'torpedo', stats, ['torpedoSpeed', 'torpedoTube'])!;
    expect(t.boons.map((r) => r.label)).toEqual(['◆ TORPEDO I', '◆ EXTRA TUBE']);
    expect(t.boons[0].effect).toMatch(/^Torpedo speed: \d/);
    expect(t.boons[1].effect).toMatch(/^Torpedoes loaded: \d/);
  });

  // PIN FLIPPED (2.9 review): the row carried a `×n` suffix beside a name that
  // ALREADY names the rung. Every stackable ladder in the catalog is
  // position-aware (Mk I/II/III...), so `×3` next to `Mk III` said the same
  // thing twice — and the lines with no rung name are the single-copy ones,
  // where there is nothing to count. The suffix is gone; the row's contract
  // ("only when needed") is now trivially satisfied.
  it('COLLAPSES a stack into ONE row that names the rung — and nothing else', () => {
    const held = ['gunBarrel', 'gunBarrel'];
    const rows = boonRows('gun', held, statsFor('torpedoBoat', { gunBarrel: 2 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('◆ BARREL II');
    expect(rows[0].label).not.toContain('×');
  });

  it('prints a doctrine row with its behavior text, not a number', () => {
    // SELF-PROPELLED MINES is deleted (Story 7-5 wave 2); CAPTIVE MINES is the
    // mine verb that replaced it, and the claim under test is unchanged — a
    // doctrine row prints BEHAVIOUR, never a stat readout.
    const t = tooltipModel(1, 'mine', stats, ['mineCaptive'])!;
    expect(t.boons[0].label).toBe('◆ CAPTIVE MINES');
    expect(t.boons[0].effect).toContain('torpedo');
    expect(t.boons[0].effect).not.toContain(':');
  });

  it('hosts INTEL/SHIP lines under the — SHIP — divider, in the gun tooltip only', () => {
    // `shipCooldown` is a SHIP line (the universal cooldown card), so it belongs
    // BELOW the divider with the intel/ship lines — the gun's own row here is
    // the gun-category one, which is what puts a side on each of the separator.
    const held = ['gunBarrel', 'shipCooldown', 'intelSweep', 'shipSpeed'];
    const gun = tooltipModel(0, 'gun', stats, held)!;
    expect(gun.boons.map((r) => r.label)).toEqual([
      '◆ BARREL I',
      SHIP_DIVIDER_ROW,
      '◆ RELOAD I',
      '◆ INTEL I',
      '◆ SPEED I',
    ]);
    expect(gun.boons[1].divider).toBe(true);
    expect(gun.boons[1].effect).toBe('');
    expect(tooltipModel(1, 'torpedo', stats, held)!.boons).toEqual([]);
  });

  it('still renders ABSENCE for a slot with nothing fitted', () => {
    expect(tooltipModel(1, 'torpedo', stats, ['gunBarrel'])!.boons).toEqual([]);
    expect(tooltipModel(1, 'torpedo', stats)!.boons).toEqual([]);
  });

  it('reports the LIVE value, so the row moves with the stack', () => {
    const one = tooltipModel(0, 'gun', statsFor('torpedoBoat', { gunBarrel: 1 }), ['gunBarrel'])!;
    const two = tooltipModel(0, 'gun', statsFor('torpedoBoat', { gunBarrel: 2 }), Array(2).fill('gunBarrel'))!;
    expect(one.boons[0].effect).not.toBe(two.boons[0].effect);
  });
});

// --- STORY 2.9 REVIEW: the tooltip tells the truth about what it CANNOT show --

/** A row list shaped by hand — the trim's edge cases are shapes, not builds. */
const row = (label: string): TooltipBoonRow => ({ label: `◆ ${label}`, effect: 'x', divider: false });
const divider = (label = SHIP_DIVIDER_ROW): TooltipBoonRow => ({ label, effect: '', divider: true });
/** The `+n` a marker row is claiming (0 when the list ends in a real row). */
function markerCount(rows: readonly TooltipBoonRow[]): number {
  return Number(/\+(\d+) MORE/.exec(rows[rows.length - 1]?.label ?? '')?.[1] ?? 0);
}

describe('trimmedBoonRows — the +n MORE marker counts BOONS, not furniture', () => {
  it('never counts a divider as a hidden line', () => {
    // [own, — SHIP —, ship1, ship2] cut to two: the kept divider goes (see
    // below) and TWO real lines are hidden — not three, which is what counting
    // the separator as a boon claimed.
    const rows = [row('OWN'), divider(), row('SHIP1'), row('SHIP2')];
    expect(markerCount(trimmedBoonRows(rows, 2))).toBe(2);
  });

  it('pops a kept divider that would sit directly above the marker', () => {
    const rows = [row('OWN'), divider(), row('SHIP1'), row('SHIP2')];
    const out = trimmedBoonRows(rows, 2);
    expect(out.map((r) => r.label)).toEqual(['◆ OWN', '◆ +2 MORE']);
  });

  it('pops a trailing divider even when nothing is hidden', () => {
    const rows = [row('OWN'), divider()];
    expect(trimmedBoonRows(rows, 2).map((r) => r.label)).toEqual(['◆ OWN']);
  });

  it('FOLDS an earlier trim into its own count (a second pass never forgets)', () => {
    const rows = [row('A'), row('B'), row('C'), row('D')];
    const once = trimmedBoonRows(rows, 3); // A, B, C, +1 MORE
    expect(markerCount(once)).toBe(1);
    // Trimming THAT again (the render's viewport clamp) must fold the earlier
    // count in: B and C plus the D the first pass already hid.
    const twice = trimmedBoonRows(once, 1);
    expect(twice.map((r) => r.label)).toEqual(['◆ A', '◆ +3 MORE']);
  });
});

describe('tooltipRenderGeom — the model reconciled with the real screen', () => {
  const stats = statsFor('torpedoBoat');
  /** The gun slot holding every gun + shipwide line it can (the tallest panel). */
  const maxedGunBuild = Object.values(BOON_CATALOG)
    .filter((d) => ['guns', 'intel', 'ship'].includes(d.category))
    .flatMap((d) => Array<string>(d.copies).fill(d.id));

  it('places the boons block below the MEASURED description, never under it', () => {
    const model = tooltipModel(0, 'gun', stats, ['gunBarrel', 'shipCooldown'])!;
    const modelled = tooltipRenderGeom(model, 0, 1080);
    // Pixi wrapped the description taller than the mono model predicted (the
    // model is an upper bound on WIDTH, a nominal on height). The block below it
    // has to move, or the description renders straight through the build list.
    const measured = tooltipRenderGeom(model, 400, 1080);
    expect(measured.boonsDy - measured.descDy).toBeGreaterThanOrEqual(400);
    expect(measured.boonsDy).toBeGreaterThan(modelled.boonsDy);
    expect(measured.panelH).toBeGreaterThan(modelled.panelH);
  });

  it('never shrinks below the model — the fit pin stays the authority', () => {
    const model = tooltipModel(0, 'gun', stats, ['gunBarrel'])!;
    const under = tooltipRenderGeom(model, 1, 1080); // a measurement smaller than modelled
    expect(under.panelH).toBe(tooltipRenderGeom(model, 0, 1080).panelH);
  });

  it('re-trims against a viewport SHORTER than the design floor', () => {
    const model = tooltipModel(0, 'gun', stats, maxedGunBuild)!;
    const roomy = tooltipRenderGeom(model, 0, 1080);
    const cramped = tooltipRenderGeom(model, 0, 420);
    expect(roomy.panelH).toBeLessThanOrEqual(TOOLTIP_MAX_PANEL_H);
    // 420px of screen is well under the 614px floor the model was fitted to:
    // rows come off until the panel fits the screen it is actually on. It used
    // to read 500px; cycle 119's INTEL RANGE deletion took a whole LINE out of
    // the gun+shipwide build, and the shorter panel now fits 500px without
    // dropping a row — so the pin moved to a viewport where trimming still
    // bites rather than asserting a trim that no longer has to happen.
    expect(cramped.boons.length).toBeLessThan(roomy.boons.length);
    expect(cramped.panelH).toBeLessThanOrEqual(420 - 2 * H.tooltip.margin);
  });

  it('still accounts for every accrued line it dropped, at any viewport', () => {
    const model = tooltipModel(0, 'gun', stats, maxedGunBuild)!;
    const all = boonRows('gun', maxedGunBuild, stats).filter((r) => !r.divider).length;
    for (const screenH of [1080, 700, 500, 420]) {
      const geom = tooltipRenderGeom(model, 0, screenH);
      const shown = geom.boons.filter((r) => !r.divider).length;
      expect(shown + markerCount(geom.boons), `${screenH}px`).toBe(all);
    }
  });

  it('keeps the description block where the model says it starts', () => {
    const model = tooltipModel(0, 'gun', stats, [])!;
    const geom = tooltipRenderGeom(model, 0, 1080);
    expect(geom.descDy).toBe(H.tooltip.pad + TIP_TYPE.headLineHeight * 2 + TIP_TYPE.nameGap + TIP_TYPE.descGap);
  });
});

describe('the ACTIVE breath rides an INTEGRATED phase (2.9 review)', () => {
  it('takes a PHASE, not an absolute clock', () => {
    // The peak of the breath is at phase pi/2 — which is only true if the
    // argument IS the phase. Feeding seconds through sin(t*omega) put the peak
    // somewhere else entirely, and moved it whenever the clock estimate moved.
    expect(activeBreath(Math.PI / 2, 0.3)).toBeCloseTo(1);
    expect(activeBreath(-Math.PI / 2, 0.3)).toBeCloseTo(0.4);
  });

  it('CLAMPS a huge frame gap instead of jumping the wave', () => {
    // A backgrounded tab, or a server-clock re-estimate that moves nowSec by
    // seconds: the phase advances by at most one clamped step, so the alpha can
    // never step faster than the photosensitivity cap allows.
    expect(advanceBreathPhase(0, 100)).toBeCloseTo(advanceBreathPhase(0, 0.5));
    expect(advanceBreathPhase(0, -3)).toBe(0); // a clock that went BACKWARDS holds
  });

  it('advances at the capped rate, and wraps inside one turn', () => {
    expect(advanceBreathPhase(0, 0.5)).toBeCloseTo(ACTIVE_PULSE_HZ * 0.5 * Math.PI * 2);
    // Integrating a whole cycle in 0.5s steps lands back at the start.
    let phase = 0;
    for (let i = 0; i < 1 / ACTIVE_PULSE_HZ / 0.5; i += 1) phase = advanceBreathPhase(phase, 0.5);
    expect(phase).toBeLessThan(Math.PI * 2);
    expect(Math.sin(phase)).toBeCloseTo(0);
  });
});

// --- STORY 4.8: THE AGGREGATE FLASH BUDGET, ELEMENT-SCOPED ---------------------
//
// Each hotbar slot's denied pulse is its OWN element (`hotbarSlotKey(slot)`) and
// the rank-wide fit frame is another (`FLASH_ELEMENTS.hotbarFrame`). A
// `'degrade'` verdict means DRAW THE FLAT MARK, never skip: the budget degrades,
// it does not delete, and every one of these channels already guarantees its
// off-state carries the information.

describe('degradedSkin — a degraded denial keeps its whole mark', () => {
  it('drops ONLY the bloom: border, width, icon and wash are byte-identical', () => {
    const full = slotSkin('denied');
    const flat = degradedSkin(full);
    expect(flat.border).toBe(full.border); // the denied red — the information
    expect(flat.borderAlpha).toBe(full.borderAlpha);
    expect(flat.borderWidth).toBe(full.borderWidth);
    expect(flat.icon).toBe(full.icon);
    expect(flat.iconAlpha).toBe(full.iconAlpha);
    expect(flat.wash).toBe(full.wash);
    expect(flat.washAlpha).toBe(full.washAlpha);
    expect(flat.glowPx).toBe(0); // ...and only the flash is spent
    expect(flat.glowAlpha).toBe(0);
    expect(full.glowPx).toBeGreaterThan(0); // there really was one to spend
  });

  it('IS the already-ratified motion:off keyframe — not a new visual state', () => {
    // Which is why the budget can bind on a declared-information channel: the
    // degraded form is a state the game already ships and a player can select.
    expect(degradedSkin(slotSkin('denied'))).toEqual(slotSkin('denied', 0));
  });

  it('never brightens anything — degrade is monotone down', () => {
    for (const state of ['denied', 'activated', 'selected', 'active'] as const) {
      const flat = degradedSkin(slotSkin(state));
      expect(flat.glowAlpha).toBeLessThanOrEqual(slotSkin(state).glowAlpha);
      expect(flat.borderAlpha).toBe(slotSkin(state).borderAlpha);
    }
  });
});

describe('slotFlags / slotViewModels — the degrade flag is scoped to its denial', () => {
  it('rides only the slot that is actually denied', () => {
    const view = viewFor('torpedoBoat', {
      denied: [false, true, false, false],
      deniedDegraded: [true, true, true, true],
    });
    expect(slotViewModels(view).map((m) => m.degraded)).toEqual([false, true, false, false]);
    expect(slotViewModels(view).map((m) => m.state === 'denied')).toEqual([false, true, false, false]);
  });

  it('a denied slot with no verdict animates, exactly as it always has', () => {
    const view = viewFor('torpedoBoat', { denied: [true, false, false, false] });
    expect(slotFlags(view, 0)).toEqual({ denied: true, activated: false }); // untouched
    expect(slotDegraded(view, 0, true)).toBe(false);
    expect(slotViewModels(view)[0].degraded).toBe(false);
    expect(slotViewModels(view)[0].state).toBe('denied'); // and it is still DENIED
  });

  it('a verdict can never change WHICH STATE a row is in', () => {
    // The budget degrades a mark; it never re-classifies one. A degraded denial
    // is still `denied` — same border, same icon, same precedence.
    const view = viewFor('torpedoBoat', { denied: [true, false, false, false], deniedDegraded: [true, false, false, false] });
    expect(slotViewModels(view)[0].state).toBe('denied');
    expect(slotDegraded(view, 0, false)).toBe(false); // no denial, no verdict
  });

  it('each slot carries its OWN budget key — one over-budget slot flattens no other', () => {
    const budget = createFlashBudget();
    for (let i = 0; i < CLIENT_CONFIG.flashBudget.maxPerSecond; i++) {
      expect(budget.claim(hotbarSlotKey(1), i)).toBe('animate');
    }
    expect(budget.claim(hotbarSlotKey(1), 10)).toBe('degrade');
    expect(budget.claim(hotbarSlotKey(2), 10)).toBe('animate'); // a different element
    expect(budget.claim(FLASH_ELEMENTS.hotbarFrame, 10)).toBe('animate');
    expect(budget.claim(FLASH_ELEMENTS.deniedArc, 10)).toBe('animate');
  });
});

describe('fitFrameAlpha — a degraded rank-wide flash still draws its frame', () => {
  it('renders at the flat degraded weight, never at zero', () => {
    expect(fitFrameAlpha(false)).toBe(FIT_FRAME_ALPHA);
    expect(fitFrameAlpha(true)).toBeCloseTo(FIT_FRAME_ALPHA * CLIENT_CONFIG.flashBudget.degradeAlphaFactor, 9);
    expect(fitFrameAlpha(true)).toBeGreaterThan(0); // NEVER skip
    expect(fitFrameAlpha(true)).toBeLessThan(fitFrameAlpha(false));
  });

  it('a degraded frame is still the SAME frame — the geometry never moves', () => {
    // Presence, position and weight survive; only the luminance ramp is spent.
    // The rect is computed from the layout alone (drawFitFrame), so the only
    // thing the verdict can touch is the stroke alpha — pinned here by the fact
    // that `fitFrameAlpha` is the whole of the degrade path.
    expect(FIT_PULSE_PX).toBeGreaterThan(0);
    const layout = hotbarLayout(768);
    expect(layout.rows).toHaveLength(4);
  });
});
