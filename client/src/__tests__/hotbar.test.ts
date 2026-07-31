// The hotbar's PURE CORE (Story 2.2) — the whole ratified contract, tested
// without instantiating Pixi (the class is a thin shell over these functions):
// slot order Gun–Q–E–R, the seven-state grammar and its precedence, the ability
// chamfer, the >1-pool ammo badge, quick-info strings (incl. the live cooling
// countdown), the hit-test that both hover and the click gate consult, the
// key-equivalent click routing (amendment 11), the tooltip model (keyless gun
// line, boons rendered as ABSENCE) and its viewport-safe placement.

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
  EMPTY_SLOT_LABEL,
  NO_HOVER,
  badgeText,
  coolFraction,
  fmtRemaining,
  fmtSeconds,
  hotbarLayout,
  hoverReady,
  isCooling,
  nextHover,
  quickInfoLine,
  shouldShowTooltip,
  slotAtPoint,
  slotSkin,
  slotState,
  slotViewModels,
  tooltipModel,
  tooltipPlacement,
  type HotbarView,
} from '../render/hotbar.js';
import { equipmentInfo, interactionLine, SLOT_KEY_GLYPHS } from '../render/equipmentInfo.js';
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
