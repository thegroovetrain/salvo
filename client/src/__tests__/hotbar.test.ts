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
  activeBreath,
  activeTag,
  badgeText,
  boonMark,
  boonRows,
  breathedSkin,
  coolFraction,
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
  slotSkin,
  slotState,
  slotViewModels,
  tooltipModel,
  tooltipPlacement,
  type HotbarView,
} from '../render/hotbar.js';
import {
  EQUIPMENT_NAME,
  equipmentInfo,
  interactionLine,
  slotForBoonCategory,
  SLOT_KEY_GLYPHS,
} from '../render/equipmentInfo.js';
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
      'Heavy Cannon',
      'Star Shells',
      EMPTY_SLOT_LABEL,
    ]);
    expect(slotViewModels(viewFor('mineLayer')).map((r) => r.id)).toEqual(['gun', 'mine', 'decoyBuoy', null]);
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
    expect(slotViewModels(viewFor('torpedoBoat')).map((r) => r.chamfer)).toEqual([false, false, true, false]);
    expect(slotViewModels(viewFor('battleship')).map((r) => r.chamfer)).toEqual([false, false, false, false]);
    // Mine Layer fits TWO abilities (mine + decoy).
    // PIN FLIPPED (Story 2.8, amendment 45): the ML's Q slot holds the MINE,
    // now a click-aimed weapon — no chamfer. Only the decoy rack (E) keeps the
    // ability shape mark.
    expect(slotViewModels(viewFor('mineLayer')).map((r) => r.chamfer)).toEqual([false, false, true, false]);
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
    expect(quickInfoLine(equipmentInfo(stats, 'gun'), 0)).toBe(`DMG ${CONFIG.gun.damage} · CD 3s`);
    expect(quickInfoLine(equipmentInfo(stats, 'torpedo'), 0)).toBe(
      `DMG ${CONFIG.torpedo.damage} · CD ${fmtSeconds(CONFIG.torpedo.reloadMs)}`,
    );
    expect(quickInfoLine(equipmentInfo(stats, 'cannon'), 0)).toContain(`DMG ${CONFIG.cannon.damage}`);
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
    expect(quickInfoLine(equipmentInfo(stats, 'decoyBuoy'), 0)).toBe(`CD ${fmtSeconds(CONFIG.decoyBuoy.reloadMs)}`);
  });

  it('DMG rides the effective stats — a filler/shell stack moves the printed number', () => {
    // The documented migration seam closed in Story 2.8: damage is stat-driven,
    // so equipmentDamage() reads the firewall's output, not CONFIG.
    const heavy = statsFor('mineLayer', { mineDamage: 3, gunDamage: 2 });
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
    for (const id of ['gun', 'torpedo', 'mine', 'speedBoost', 'cannon', 'starShells', 'decoyBuoy'] as const) {
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
    expect(slotState('decoyBuoy', NONE, true, false, false, true)).toBe('active');
    expect(slotState('decoyBuoy', NONE, true, true, false, true)).toBe('active');
    expect(slotState('decoyBuoy', { ...NONE, denied: true }, true, false, false, true)).toBe('denied');
    expect(slotState('decoyBuoy', { ...NONE, activated: true }, true, false, false, true)).toBe('activated');
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
    const loadout = idsFor('mineLayer', statsFor('mineLayer')); // gun / mine / decoyBuoy / null
    expect(slotForBoonCategory(loadout, 'guns')).toBe(0);
    expect(slotForBoonCategory(loadout, 'mines')).toBe(1);
    expect(slotForBoonCategory(loadout, 'decoyBuoy')).toBe(2);
    expect(slotForBoonCategory(loadout, 'intel')).toBeNull();
    expect(slotForBoonCategory(loadout, 'ship')).toBeNull();
    // A category this hull does not carry owns no slot either (rank-wide flash).
    expect(slotForBoonCategory(loadout, 'torpedoes')).toBeNull();
  });
});

describe('the ◆n accrued mark compresses the build into the row', () => {
  it('counts the slot family only, and shows nothing on an unboonded slot', () => {
    const boons = ['gunDamage', 'gunDamage', 'torpedoSpeed'];
    const rows = slotViewModels(viewFor('torpedoBoat', { boons }));
    expect(rows[0].boonCount).toBe(2); // gun
    expect(rows[1].boonCount).toBe(1); // torpedo
    expect(rows[2].boonCount).toBe(0); // boost
    expect(rows[0].quickInfo.endsWith(' ◆2')).toBe(true);
    expect(rows[2].quickInfo).not.toContain('◆');
  });

  it('folds the shipwide lines into the GUN slot only (the ship card)', () => {
    const boons = ['intelRadar', 'shipHull', 'gunReload'];
    const rows = slotViewModels(viewFor('torpedoBoat', { boons }));
    expect(rows[0].boonCount).toBe(3);
    expect(rows[1].boonCount).toBe(0);
    expect(slotBoonIds('torpedo', boons)).toEqual([]);
  });

  it('ignores a junk id on the wire rather than counting it', () => {
    expect(slotBoonIds('gun', ['gunDamage', 'notARealBoon', 'constructor'])).toEqual(['gunDamage']);
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
    const t = tooltipModel(1, 'torpedo', stats, ['torpedoDamage', 'torpedoTube'])!;
    expect(t.boons.map((r) => r.label)).toEqual(['◆ HEAVY WARHEAD Mk I', '◆ SECOND TUBE']);
    expect(t.boons[0].effect).toMatch(/^Torpedo damage: \d/);
    expect(t.boons[1].effect).toMatch(/^Torpedoes loaded: \d/);
  });

  it('COLLAPSES a stack into one row at its current rung, marked ×n', () => {
    const held = ['gunDamage', 'gunDamage', 'gunDamage'];
    const rows = boonRows('gun', held, statsFor('torpedoBoat', { gunDamage: 3 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('◆ HEAVY SHELLS Mk III ×3');
  });

  it('prints a doctrine row with its behavior text, not a number', () => {
    const t = tooltipModel(1, 'mine', stats, ['mineSelfPropelled'])!;
    expect(t.boons[0].label).toBe('◆ SELF-PROPELLED MINES');
    expect(t.boons[0].effect).toContain('creep');
  });

  it('hosts INTEL/SHIP lines under the — SHIP — divider, in the gun tooltip only', () => {
    const held = ['gunReload', 'intelSweep', 'shipSpeed'];
    const gun = tooltipModel(0, 'gun', stats, held)!;
    expect(gun.boons.map((r) => r.label)).toEqual([
      '◆ LOADING DRILLS',
      SHIP_DIVIDER_ROW,
      '◆ UPRATED SWEEP MOTOR Mk I',
      '◆ HULL SCRAPING',
    ]);
    expect(gun.boons[1].divider).toBe(true);
    expect(gun.boons[1].effect).toBe('');
    expect(tooltipModel(1, 'torpedo', stats, held)!.boons).toEqual([]);
  });

  it('still renders ABSENCE for a slot with nothing fitted', () => {
    expect(tooltipModel(1, 'torpedo', stats, ['gunDamage'])!.boons).toEqual([]);
    expect(tooltipModel(1, 'torpedo', stats)!.boons).toEqual([]);
  });

  it('reports the LIVE value, so the row moves with the stack', () => {
    const one = tooltipModel(0, 'gun', statsFor('torpedoBoat', { gunDamage: 1 }), ['gunDamage'])!;
    const four = tooltipModel(0, 'gun', statsFor('torpedoBoat', { gunDamage: 4 }), Array(4).fill('gunDamage'))!;
    expect(one.boons[0].effect).not.toBe(four.boons[0].effect);
  });
});
