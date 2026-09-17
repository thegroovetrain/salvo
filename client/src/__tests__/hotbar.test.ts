// The slot row's PURE CORE (Story 2.2's hotbar, RE-CUT onto the HUD bar in
// Story 8.6) — the whole ratified contract, most of it tested without
// instantiating Pixi (the class is a thin shell over these functions):
// slot order Gun–Shift–Q–E–R–1–2–3–4, the state grammar and its precedence, the
// >1-pool ammo badge, the ONE centred seconds numeral, the tier numeral on its
// absolute ramp, the widening key chip, the hit-test that both hover and the
// click gate consult (amendment 11), the tooltip model (keyless gun line) and
// its above-the-bar placement.
//
// STORY 2.9 grew it into the surface where a boon becomes VISIBLE (amendment
// 51): the eighth ACTIVE state (amendment 48) with its breathing outline and
// countdown, the fit flash and the tooltip's accrued list. The container-fit
// half of that lives in __tests__/tooltipFit.test.ts.
//
// STORY 8.5 grew the row to NINE on the shared nine-slot spine — gun, the boost,
// three GENERIC weapon slots and the four-slot consumable belt — and retired the
// empty slot's words: UX-DR41's empty state is a dashed outline and a centred
// `—` glyph, NOTHING else ("the empty IS the state"). What a hull carries is no
// longer a fact about the hull: the per-hull fit is gone, and the fits these
// suites drive come from the interim SPAWN_SEED applied as CARDS (epic-8
// amendment 21), exactly as main.ts's slotIdsFor derives them.
//
// STORY 8.6 MOVED THE WHOLE THING onto the bottom-centre bar. What changed here:
//   • the geometry block is gone — `hudBarLayout` (render/hudBar.ts) owns every
//     rect now and is pinned in hudBar.test.ts; what this file pins is that the
//     row DRAWS and HIT-TESTS the rects it is handed;
//   • the LABEL COLUMN is deleted, so the quick-info / name-fit suites went with
//     it (deferred-work ledger :1966) — the tooltip is now the only place a
//     slot's name is read, and its fit pin is untouched;
//   • the perimeter cool track is the WIPE, and the ACTIVE window's countdown is
//     the SAME centred numeral with no overlay (epic-8 amendment 34);
//   • the boost's chip spells `Shift` (amendment 33) and the gun's is a GHOST.
// The state grammar, the skins, the breath, the flash budget and the tooltip
// core are byte-identical: only their geometry moved.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG,
  CONFIG,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  SPAWN_SEED,
  WEAPON_SLOTS,
  effectiveStats,
  slotsWithCards,
  type EffectiveStats,
  type EquipmentId,
  type ShipClassId,
  type WeaponAmmo,
} from '@salvo/shared';
import { Container, Graphics, Text } from 'pixi.js';
import {
  ACTIVE_PULSE_AMP,
  ACTIVE_PULSE_HZ,
  NO_HOVER,
  SHIP_DIVIDER_ROW,
  TIER_COLORS,
  TIP_TYPE,
  TOOLTIP_MAX_PANEL_H,
  Hotbar,
  activeBreath,
  advanceBreathPhase,
  badgeRect,
  badgeText,
  beltBadgeText,
  boonRows,
  breathedSkin,
  chipRect,
  chipWidth,
  coolFraction,
  degradedSkin,
  fitFrameAlpha,
  FIT_FRAME_ALPHA,
  FIT_PULSE_PX,
  hoverReady,
  isBeltSlot,
  isCooling,
  nextHover,
  shouldShowTooltip,
  slotAtPoint,
  slotBoonIds,
  slotDegraded,
  slotFlags,
  slotNumeral,
  slotSkin,
  slotState,
  slotViewModels,
  tierColor,
  tierNumeral,
  tooltipModel,
  tooltipPlacement,
  tooltipRenderGeom,
  trimmedBoonRows,
  type HotbarView,
  type TooltipBoonRow,
} from '../render/hotbar.js';
import { hudBarLayout, microScale } from '../render/hudBar.js';
import { wipeLabel } from '../render/cooldownWipe.js';
import {
  EQUIPMENT_NAME,
  cardEquipmentIds,
  equipmentInfo,
  interactionLine,
  lineTier,
  slotForCard,
  SLOT_KEY_GLYPHS,
} from '../render/equipmentInfo.js';
import { FLASH_ELEMENTS, createFlashBudget, hotbarSlotKey } from '../render/flashBudget.js';
import { CLIENT_CONFIG } from '../config.js';

const H = CLIENT_CONFIG.hotbar;
const B = CLIENT_CONFIG.hudBar;
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
  return effectiveStats(CONFIG.shipClasses[cls], ids);
}

/** The three weapon slots by their keys — Q, E, R (slots 2, 3, 4). */
const [Q, E, R] = WEAPON_SLOTS;

/**
 * The slot ids a hull sails with at 0:00 — main.ts's slotIdsFor, verbatim.
 * Story 8.5: the base fit is hull-free (gun + boost + seven empties) and the
 * class weapons arrive as the interim SPAWN_SEED cards, landing in the first
 * empty WEAPON slot. So a Torpedo Boat's torpedo is in Q, and a Battleship's
 * broadside and star shells are in Q and E.
 */
function idsFor(cls: ShipClassId, stats: EffectiveStats): (EquipmentId | null)[] {
  return slotsWithCards(stats, SPAWN_SEED[cls] ?? []).map((s) => s.equipmentId);
}

/** A full-length per-slot array of `v` — the shape every HotbarView field takes. */
function nine<T>(v: T): T[] {
  return Array.from({ length: SLOT_COUNT }, () => v);
}

/** `nine(v)` with named slots overridden — keeps the suites readable now that
 *  seven of the nine entries are the same "nothing here" value. */
function at<T>(v: T, over: Record<number, T>): T[] {
  const out = nine(v);
  for (const [slot, value] of Object.entries(over)) out[Number(slot)] = value;
  return out;
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
    primedSlot: SLOT_GUN,
    denied: nine(false),
    activated: nine(false),
    dim: false,
    ...over,
  };
}

describe('slot order — Gun (keyless) / Shift / Q / E / R / 1-4, left to right', () => {
  it('is NINE squares with the gun first and no key of its own', () => {
    expect(SLOT_KEY_GLYPHS).toEqual(['', 'Shift', 'Q', 'E', 'R', '1', '2', '3', '4']);
    expect(SLOT_KEY_GLYPHS).toHaveLength(SLOT_COUNT);
    const rows = slotViewModels(viewFor('torpedoBoat'));
    expect(rows).toHaveLength(SLOT_COUNT);
    expect(rows.map((r) => r.keyGlyph)).toEqual(['', 'Shift', 'Q', 'E', 'R', '1', '2', '3', '4']);
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('SPELLS the boost key, and the GUN alone stays keyless (amendment 33)', () => {
    // PIN FLIPPED (Story 8.6). Amendment 29 put the ⇧ arrow here because 8.5's
    // chip was a fixed 22px square holding exactly one glyph. The bar's chip
    // WIDENS to its content, so the key gets its name back — and the arrow, which
    // reads as "up" at least as often as "shift", leaves the surface entirely.
    expect(SLOT_KEY_GLYPHS[SLOT_BOOST]).toBe('Shift');
    expect(SLOT_KEY_GLYPHS.includes('\u21e7')).toBe(false);
    expect(SLOT_KEY_GLYPHS[SLOT_GUN]).toBe(''); // the ghost chip keeps the baseline
    expect(SLOT_KEY_GLYPHS.filter((g) => g === '')).toHaveLength(1);
  });

  it('EVERY captain hull carries the same shape: gun, boost, seed weapons, empties', () => {
    // The per-hull fit is gone (Story 8.5). What differs between hulls is what
    // their CARDS put in the weapon row — here, the interim spawn seed.
    expect(slotViewModels(viewFor('torpedoBoat')).map((r) => r.id)).toEqual(
      ['gun', 'speedBoost', 'heavyTorpedo', null, null, null, null, null, null],
    );
    expect(slotViewModels(viewFor('battleship')).map((r) => r.id)).toEqual(
      ['gun', 'speedBoost', 'broadside', 'starShells', null, null, null, null, null],
    );
    // AMENDMENT 22: the Mine Layer lost the radar buoy — no card and no seed
    // reaches it, so E stays empty until Story 8.15 deletes the module.
    expect(slotViewModels(viewFor('mineLayer')).map((r) => r.id)).toEqual(
      ['gun', 'speedBoost', 'navalMines', null, null, null, null, null, null],
    );
  });

  it('gives NO SQUARE any words at all — fitted or empty (UX-DR41 / Story 8.6)', () => {
    // PIN WIDENED. Story 8.5 retired the empty row's "— awaiting refit —" label;
    // Story 8.6 deleted the label column outright, so the view model carries no
    // name or info string for ANY slot. The equipment's name is the tooltip's.
    const model = slotViewModels(viewFor('battleship'))[0] as unknown as Record<string, unknown>;
    expect(model.name).toBeUndefined();
    expect(model.quickInfo).toBeUndefined();
    const empties = slotViewModels(viewFor('battleship')).filter((r) => r.id === null);
    expect(empties).toHaveLength(5);
    for (const row of empties) {
      expect(row.state).toBe('empty');
      expect(row.badge).toBeNull();
      expect(row.tier).toBe(0);
      expect(slotNumeral(row)).toBe('');
      expect(row.keyGlyph).not.toBe(''); // …but the KEY is still labelled
    }
  });

  it('the BELT squares (5-8) are the SAME dashed-empty state, inside the frame', () => {
    const rows = slotViewModels(viewFor('torpedoBoat'));
    for (const slot of [5, 6, 7, 8]) {
      expect(rows[slot].state, String(slot)).toBe('empty');
      expect(rows[slot].id, String(slot)).toBeNull();
      expect(rows[slot].tier, String(slot)).toBe(0); // the belt never shows a tier
      expect(isBeltSlot(slot), String(slot)).toBe(true);
    }
    expect(slotSkin('empty').dashed).toBe(true);
    // Belt STOCK reads `×n` rather than a bare count — the path exists, the rack
    // is Story 8.7's, and nothing renders it today.
    expect(beltBadgeText({ n: 2, reloadMsLeft: 0 })).toBe('×2');
    expect(beltBadgeText({ n: 0, reloadMsLeft: 0 })).toBeNull();
    expect(beltBadgeText(null)).toBeNull();
  });

  it('the retired label is GONE FROM THE MODULE, not merely unused', () => {
    // A grep pin, because an unused export is exactly how a retired string comes
    // back: someone finds it and wires it up again.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../render/hotbar.ts'),
      'utf8',
    );
    expect(src).not.toContain('awaiting refit');
    expect(src).not.toContain('EMPTY_SLOT_LABEL');
    expect(src).not.toContain('\u21e7'); // the boost chip spells the word now (amendment 33)
  });
});

describe('the seven-state grammar + its precedence', () => {
  const NONE = { denied: false, activated: false };

  it('maps every state', () => {
    expect(slotState(null, NONE, false, false, false)).toBe('empty');
    expect(slotState('heavyTorpedo', { ...NONE, denied: true }, false, false, true)).toBe('denied');
    expect(slotState('speedBoost', { ...NONE, activated: true }, false, false, false)).toBe('activated');
    expect(slotState('heavyTorpedo', NONE, true, false, true)).toBe('cooling');
    expect(slotState('gun', NONE, false, true, true)).toBe('selected');
    expect(slotState('heavyTorpedo', NONE, false, false, true)).toBe('readyWeapon');
    expect(slotState('speedBoost', NONE, false, false, false)).toBe('readyAbility');
  });

  it('resolves denied > activated > cooling > selected > ready', () => {
    const all = { denied: true, activated: true };
    expect(slotState('gun', all, true, true, true)).toBe('denied');
    expect(slotState('gun', { denied: false, activated: true }, true, true, true)).toBe('activated');
    expect(slotState('gun', NONE, true, true, true)).toBe('cooling');
    expect(slotState('gun', NONE, false, true, true)).toBe('selected');
  });

  it('an UNFITTED slot short-circuits everything (it holds nothing to deny or cool)', () => {
    expect(slotState(null, { denied: true, activated: true }, true, true, true)).toBe('empty');
  });

  it('keeps SELECTED as its own channel so a selected+cooling slot still reads selected', () => {
    const rows = slotViewModels(
      viewFor('torpedoBoat', { primedSlot: SLOT_GUN, ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }) }),
    );
    expect(rows[SLOT_GUN].state).toBe('cooling'); // the box shows the conic track
    expect(rows[SLOT_GUN].selected).toBe(true); // ...and the chip/name stay amber (dual-coding)
  });

  it('COOLING is availability, not timer state — a pool with a round left reads READY', () => {
    // Fired 1 of an upgraded 2-fish tube: the reload runs for the NEXT fish, but
    // the slot is still fireable, so it must not dim (and the track stays off).
    expect(isCooling({ n: 1, reloadMsLeft: 4000 })).toBe(false);
    expect(isCooling({ n: 0, reloadMsLeft: 4000 })).toBe(true);
    expect(isCooling({ n: 0, reloadMsLeft: 0 })).toBe(false); // dry with no reload running
    expect(isCooling(null)).toBe(false);
    const stats = twoTubes('torpedoBoat');
    const rows = slotViewModels({
      ...viewFor('torpedoBoat'),
      stats,
      loadout: idsFor('torpedoBoat', stats),
      ammo: at(null, {
        [SLOT_GUN]: { n: 1, reloadMsLeft: 0 },
        [SLOT_BOOST]: { n: 1, reloadMsLeft: 0 },
        [Q]: { n: 1, reloadMsLeft: 4000 },
      }),
    });
    expect(rows[Q].state).toBe('readyWeapon');
    expect(rows[Q].coolFrac).toBe(0); // no wipe while a round is available
    expect(rows[Q].badge).toBe('1'); // the badge carries the availability instead
    expect(rows[Q].reloadMsLeft).toBe(0); // ...and no numeral: the timer is the NEXT fish's
    expect(slotNumeral(rows[Q])).toBe('');
  });

  it('drives each state from a distinct DESIGN.md token recipe (no literals)', () => {
    expect(slotSkin('denied').border).toBe(C.denied);
    expect(slotSkin('selected').border).toBe(C.amber);
    expect(slotSkin('selected').washAlpha).toBeGreaterThan(0); // the inset wash channel
    expect(slotSkin('readyWeapon').border).toBe(C.phosphor);
    expect(slotSkin('readyAbility').borderAlpha).toBeGreaterThan(slotSkin('readyWeapon').borderAlpha);
    expect(slotSkin('readyAbility').glowPx).toBeGreaterThan(slotSkin('readyWeapon').glowPx);
    expect(slotSkin('activated').glowPx).toBeGreaterThan(slotSkin('selected').glowPx);
    // THE MOCK IS THE REGISTER OF RECORD for the bar's surfaces (epic-8
    // amendment 31), so Story 8.6 re-literalled the two glow alphas the
    // bottom-left stack had drifted on: `.slot.ability.ready` is
    // `0 0 14px rgba(0,255,136,.2)` and `.slot.sel` is
    // `0 0 16px rgba(255,184,0,.4)`.
    expect(slotSkin('readyWeapon').glowAlpha).toBe(0.15);
    expect(slotSkin('readyAbility').glowAlpha).toBe(0.2);
    expect(slotSkin('selected').glowAlpha).toBe(0.4);
    expect(slotSkin('cooling').scrim).toBe(true);
    expect(slotSkin('cooling').border).toBe(C.silver); // the DESIGN idle recipe, silver .28
    expect(slotSkin('cooling').borderAlpha).toBe(0.28);
    expect(slotSkin('empty').dashed).toBe(true);
  });
});

/**
 * A hull whose torpedo pool holds TWO — built by hand off real effective stats.
 * Catalog v3 (Story 8.1) spends an equipment line's copy 1 on the weapon itself
 * and leaves tiers II–V unauthored until Stories 8.12–8.16, so there is no card
 * that grows the tube today. The claim under test is the SEAM (the badge and the
 * pool read `effectiveStats`, never CONFIG), and that is unchanged.
 */
function twoTubes(cls: ShipClassId): EffectiveStats {
  const base = statsFor(cls);
  return {
    ...base,
    equipment: { ...base.equipment, heavyTorpedo: { ...base.equipment.heavyTorpedo, maxAmmo: 2 } },
  };
}

describe('ammo badge — only on pools LARGER than one round', () => {
  it('shows nothing at base (gun 1, boost 1, torpedo 1)', () => {
    expect(slotViewModels(viewFor('torpedoBoat')).map((r) => r.badge)).toEqual(nine(null));
  });

  it('appears once the tube pool grows, and counts the LIVE pool', () => {
    const stats = twoTubes('torpedoBoat');
    const loadout = idsFor('torpedoBoat', stats);
    const view: HotbarView = {
      ...viewFor('torpedoBoat'),
      stats,
      loadout,
      ammo: at(null, {
        [SLOT_GUN]: { n: 1, reloadMsLeft: 0 },
        [SLOT_BOOST]: { n: 1, reloadMsLeft: 0 },
        [Q]: { n: 2, reloadMsLeft: 0 },
      }),
    };
    expect(equipmentInfo(stats, 'heavyTorpedo').maxAmmo).toBe(2); // the upgrade landed
    expect(slotViewModels(view).map((r) => r.badge)).toEqual(at(null, { [Q]: '2' }));
    const fired = slotViewModels({
      ...view,
      ammo: view.ammo.map((a, i) => (i === Q ? { n: 1, reloadMsLeft: 4000 } : a)),
    });
    expect(fired[Q].badge).toBe('1'); // counts down on fire, back up on reload completion
  });

  it('renders NO badge when the ammo entry is missing (never a fabricated "0")', () => {
    const stats = twoTubes('torpedoBoat');
    expect(badgeText(equipmentInfo(stats, 'heavyTorpedo'), null)).toBeNull();
    expect(badgeText(equipmentInfo(stats, 'heavyTorpedo'), { n: 0, reloadMsLeft: 1 })).toBe('0'); // a REAL empty pool does read 0
    const rows = slotViewModels({ ...viewFor('torpedoBoat'), stats, loadout: idsFor('torpedoBoat', stats), ammo: nine(null) });
    expect(rows.map((r) => r.badge)).toEqual(nine(null));
  });
});

describe('the ONE centred numeral — the reload clock and the ACTIVE window', () => {
  it('reads the RELOAD while cooling, in the wipe\'s own grammar', () => {
    const rows = slotViewModels(
      viewFor('torpedoBoat', { ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }) }),
    );
    expect(rows[SLOT_GUN].state).toBe('cooling');
    expect(rows[SLOT_GUN].reloadMsLeft).toBe(1200);
    expect(slotNumeral(rows[SLOT_GUN])).toBe(wipeLabel(1200));
    expect(slotNumeral(rows[SLOT_GUN])).toBe('1.2'); // tenths under two seconds
  });

  it('reads the WINDOW while ACTIVE, and never both clocks at once (amendment 34)', () => {
    // The boost's cooldown starts the instant the throttle opens, so the two
    // timers really do coexist. `slotState` ranks ACTIVE above cooling, which is
    // what lets ONE numeral register carry both meanings without ambiguity.
    const view = viewFor('torpedoBoat', {
      activeMsLeft: at(0, { [SLOT_BOOST]: 4300 }),
      ammo: at(null, { [SLOT_BOOST]: { n: 0, reloadMsLeft: 9000 } }),
    });
    const m = slotViewModels(view)[SLOT_BOOST];
    expect(m.state).toBe('active');
    expect(m.activeMsLeft).toBe(4300);
    expect(slotNumeral(m)).toBe(wipeLabel(4300));
    expect(slotNumeral(m)).toBe('5'); // whole seconds, rounded UP, above two
  });

  it('shows NOTHING on a ready, selected or empty square', () => {
    for (const m of slotViewModels(viewFor('torpedoBoat'))) {
      expect(slotNumeral(m), String(m.slot)).toBe('');
      expect(m.reloadMsLeft, String(m.slot)).toBe(0);
    }
  });

  it('clamps the wipe fraction, so a mid-reload reload UPGRADE cannot invert it', () => {
    expect(coolFraction(5000, 3000)).toBe(0); // reloadMsLeft >= the (new, shorter) reloadMs
    expect(coolFraction(0, 3000)).toBe(0);
    expect(coolFraction(1500, 3000)).toBeCloseTo(0.5, 9);
    const rows = slotViewModels(
      viewFor('torpedoBoat', { ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 9000 } }) }),
    );
    expect(rows[SLOT_GUN].state).toBe('cooling'); // ...still cooling, so the wipe still covers it
    expect(rows[SLOT_GUN].coolFrac).toBe(0);
  });

  it('ticks on EVERY slot regardless of which one is selected', () => {
    const rows = slotViewModels(
      viewFor('torpedoBoat', {
        primedSlot: SLOT_GUN, // the GUN is selected...
        ammo: at(null, {
          [SLOT_GUN]: { n: 1, reloadMsLeft: 0 },
          [SLOT_BOOST]: { n: 1, reloadMsLeft: 0 },
          [Q]: { n: 0, reloadMsLeft: 11900 },
        }),
      }),
    );
    expect(rows[Q].state).toBe('cooling'); // ...the unselected torpedo still cools
    expect(slotNumeral(rows[Q])).toBe('12');
    expect(rows[Q].coolFrac).toBeGreaterThan(0);
    expect(rows[Q].coolFrac).toBeLessThan(1);
  });
});

describe('the bar\'s rects — what the row draws on, and what it swallows', () => {
  const layout = hudBarLayout(1366, 768);

  it('takes NINE squares from the bar: five weapon squares and a framed belt', () => {
    // The GEOMETRY is hudBarLayout's and is pinned there (hudBar.test.ts); what
    // this file pins is that the row reads the rects it is handed, in slot order.
    expect(layout.squares).toHaveLength(SLOT_COUNT);
    for (const slot of [0, 1, 2, 3, 4]) {
      expect(layout.squares[slot].w, String(slot)).toBe(B.slot);
      expect(isBeltSlot(slot), String(slot)).toBe(false);
    }
    for (const slot of [5, 6, 7, 8]) {
      expect(layout.squares[slot].w, String(slot)).toBe(B.beltSlot);
      expect(isBeltSlot(slot), String(slot)).toBe(true);
    }
  });

  it('hits the SQUARE, its KEY CHIP and its AMMO BADGE — the whole control (amendment 11)', () => {
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const sq = layout.squares[slot];
      expect(slotAtPoint({ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 }, layout), String(slot)).toBe(slot);
      expect(slotAtPoint({ x: sq.x + 1, y: sq.y + 1 }, layout), String(slot)).toBe(slot);
      const chip = chipRect(layout, slot);
      expect(slotAtPoint({ x: chip.x + chip.w / 2, y: chip.y + chip.h / 2 }, layout), String(slot)).toBe(slot);
      // The badge OVERHANGS the top-right corner, so part of it is outside the
      // square — and a press on the ammo count must still be that slot's press,
      // never a shot at the water behind it (the old row footprint's rule).
      const badge = badgeRect(layout, slot);
      expect(badge.y, String(slot)).toBeLessThan(sq.y);
      expect(badge.x + badge.w, String(slot)).toBeGreaterThan(sq.x + sq.w);
      expect(slotAtPoint({ x: badge.x + badge.w - 1, y: badge.y + 1 }, layout), String(slot)).toBe(slot);
    }
    // The belt's badge rides 1px tighter, exactly as the mock's `.belt .badge` does.
    expect(layout.squares[5].x + B.beltSlot - badgeRect(layout, 5).x).toBe(B.badge - B.beltBadgeOverhang);
    expect(layout.squares[0].y - badgeRect(layout, 0).y).toBe(B.badgeOverhang);
  });

  it('leaves the gaps, the belt\'s padding and open water as WATER', () => {
    const a = layout.squares[0];
    const b = layout.squares[1];
    expect(slotAtPoint({ x: (a.x + a.w + b.x) / 2, y: a.y + 10 }, layout)).toBeNull(); // the 8px gap
    expect(slotAtPoint({ x: a.x - 2, y: a.y + 10 }, layout)).toBeNull(); // left of the row
    expect(slotAtPoint({ x: a.x + 10, y: a.y - 2 }, layout)).toBeNull(); // above the row
    expect(slotAtPoint({ x: layout.belt.x + 2, y: layout.belt.y + 2 }, layout)).toBeNull(); // frame padding
    expect(slotAtPoint({ x: 900, y: 200 }, layout)).toBeNull(); // open water
  });

  it('a HIDDEN bar (null layout) routes nothing — every press falls through', () => {
    const c = { x: layout.squares[0].x + 5, y: layout.squares[0].y + 5 };
    expect(slotAtPoint(c, layout)).toBe(SLOT_GUN);
    expect(slotAtPoint(c, null)).toBeNull();
  });

  it('does NOT export the retired bottom-left stack, or any word for a square', async () => {
    // A grep pin, because an unused export is exactly how deleted machinery comes
    // back: someone finds it and wires it up again. `hotbarLayout` was the stack's
    // geometry; `quickInfoLine` and its formatters were the label column's words.
    const mod = (await import('../render/hotbar.js')) as Record<string, unknown>;
    for (const gone of ['hotbarLayout', 'quickInfoLine', 'fmtSeconds', 'fmtRemaining', 'fmtWindow', 'fmtDamage', 'activeTag']) {
      expect(mod[gone], gone).toBeUndefined();
    }
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../render/hotbar.ts'), 'utf8');
    expect(src).not.toContain('labelWidth');
    expect(src).not.toContain('tracePerimeter');
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
    expect(tooltipModel(Q, 'heavyTorpedo', stats)?.interaction).toBe('WEAPON · Q · SWITCH-TO');
    expect(tooltipModel(E, 'starShells', stats)?.interaction).toBe('WEAPON · E · SWITCH-TO');
    // The boost's key is spelled `Shift` (amendment 33), and the line reads it
    // out of SLOT_KEY_GLYPHS — interactionLine knows nothing about a boost.
    expect(tooltipModel(SLOT_BOOST, 'speedBoost', stats)?.interaction).toBe('ABILITY · Shift · ACTIVATES');
    // PIN FLIPPED (Story 2.8, amendment 45): the mine primes on its slot key
    // and places on a click, exactly like the torpedo.
    expect(interactionLine(R, 'navalMines')).toBe('WEAPON · R · SWITCH-TO');
    expect(tooltipModel(Q, 'navalMines', stats)?.interaction).toBe('WEAPON · Q · SWITCH-TO');
  });

  it('renders boons as ABSENCE — the list is empty, so no divider and no rows are drawn', () => {
    for (const id of ['gun', 'heavyTorpedo', 'navalMines', 'speedBoost', 'broadside', 'starShells', 'radarBuoy'] as const) {
      expect(tooltipModel(Q, id, stats)?.boons).toEqual([]);
    }
  });

  it('has nothing to describe for an unfitted slot — weapon row or belt', () => {
    expect(tooltipModel(R, null, stats)).toBeNull();
    expect(tooltipModel(8, null, stats)).toBeNull(); // a belt slot, empty all story
  });
});

describe('tooltip placement — ABOVE the hovered square, never off the screen', () => {
  const layout = hudBarLayout(1366, 768);

  it('hangs directly over the square, centred on it', () => {
    // ABOVE, not flanking (Story 8.6). The old stack lived at the screen's left
    // edge, so a panel could flank it over open water; the bar is CENTRED at the
    // foot, where a flanking panel would cover the globes or the belt — the HUD
    // hiding the HUD. The space over the bar is empty by construction.
    const sq = layout.squares[2];
    const p = tooltipPlacement(sq, 200, 1366, 768);
    expect(p.y + 200).toBe(sq.y - H.tooltip.gap);
    expect(p.x + H.tooltip.width / 2).toBeCloseTo(sq.x + sq.w / 2, 6);
    expect(p.notchX).toBeCloseTo(sq.x + sq.w / 2, 6);
  });

  it('never covers the square it describes, on any slot', () => {
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const sq = layout.squares[slot];
      const p = tooltipPlacement(sq, 220, 1366, 768);
      expect(p.y + 220, String(slot)).toBeLessThanOrEqual(sq.y);
    }
  });

  it('clamps a tall panel inside the top edge, keeping the notch on the panel', () => {
    const p = tooltipPlacement(layout.squares[0], 700, 1366, 768);
    expect(p.y).toBeGreaterThanOrEqual(H.tooltip.margin);
    expect(p.notchX).toBeGreaterThanOrEqual(p.x);
    expect(p.notchX).toBeLessThanOrEqual(p.x + H.tooltip.width);
  });

  it('clamps sideways rather than running off a narrow screen', () => {
    const p = tooltipPlacement(layout.squares[8], 120, 700, 768);
    expect(p.x).toBeGreaterThanOrEqual(H.tooltip.margin);
    expect(p.x + H.tooltip.width).toBeLessThanOrEqual(700 - H.tooltip.margin);
    expect(p.notchX).toBeLessThanOrEqual(p.x + H.tooltip.width);
  });
});

// --- THE CONTAINER-FIT LAW (amendment 47) -------------------------------------
//
// THE LABEL COLUMN IS GONE (Story 8.6). The fixed 268px name / quick-info box —
// and with it the `DMG 31.799999999999997 · CD 8s` overflow amendment 47 was
// written against, and the SUPERCAVITATING TORPEDO name exemption that rode
// beside it — was deleted with the bottom-left stack: no word renders on a
// square any more, and the tooltip (whose own fit pin is untouched, in
// __tests__/tooltipFit.test.ts) is where a slot's name is read. The retirement
// is recorded in the deferred-work ledger at :1966.
//
// What the squares still carry is SMALL TYPE, and the law binds on it exactly
// the same way: the ammo badge digit and the key chip each have a box the mock
// fixed at 16px, and the 90% UI setting counter-scales the glyph inside it.
describe('the squares\' small type fits its boxes (amendment 47)', () => {
  const MONO_ADVANCE = 0.605; // Geist Mono 0.6em, Menlo 0.6021em — the whole declared stack
  const monoW = (s: string, px: number, ls = 0): number => [...s].length * (px * MONO_ADVANCE + ls);
  /** Every LADDER line at full copies: the largest pools reachable. */
  const MAXED = Object.values(CATALOG)
    .filter((d) => d.kind === 'ladder')
    .flatMap((d) => Array<string>(d.cap).fill(d.id));

  it('NO ammo badge digit is wider than the badge square', () => {
    const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, MAXED);
    for (const id of Object.keys(EQUIPMENT_NAME) as EquipmentId[]) {
      for (const n of [0, 1, 2, 9]) {
        const t = badgeText(equipmentInfo(stats, id), { n, reloadMsLeft: 0 });
        if (t !== null) expect(monoW(t, B.type.badge), `${id}/${n}`).toBeLessThanOrEqual(B.badge);
      }
    }
  });

  it('every key chip clears the 16px minimum and stays inside its square', () => {
    const layout = hudBarLayout(1366, 768);
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const box = chipRect(layout, slot);
      expect(box.w, String(slot)).toBeGreaterThanOrEqual(B.chipMinW);
      expect(box.w, String(slot)).toBeLessThanOrEqual(layout.squares[slot].w);
      expect(box.h, String(slot)).toBe(B.chipH);
    }
  });

  it('WIDENS to its glyph — which is what lets the boost chip spell `Shift`', () => {
    expect(chipWidth('Q')).toBe(B.chipMinW); // a single glyph rides the minimum
    expect(chipWidth('Shift')).toBeCloseTo(monoW('Shift', B.type.chip) + 2 * B.chipPadX, 6);
    expect(chipWidth('Shift')).toBeGreaterThan(chipWidth('Q'));
    expect(chipWidth('')).toBe(B.chipMinW); // ...and the gun's GHOST still holds a box
  });

  it('the 90% UI setting counter-scales the glyph AND its box, so it still fits', () => {
    // Ruling 2: the HUD scales as ONE container, so a 9px glyph would render at
    // 8.1px — under the ratified mono floor. `microScale` counter-scales it back,
    // and a glyph that grew relative to its box would run straight out of it, so
    // the box takes the same factor on its text term.
    const micro = microScale(0.9);
    expect(micro).toBeCloseTo(1 / 0.9, 9);
    expect(microScale(1)).toBe(1);
    expect(microScale(1.25)).toBe(1);
    const renderedBox = chipWidth('Shift', micro) * 0.9;
    const renderedGlyph = monoW('Shift', B.type.chip);
    expect(renderedBox).toBeGreaterThanOrEqual(renderedGlyph);
    expect(B.chipH * 0.9).toBeGreaterThanOrEqual(B.type.chip); // the 14.4px box holds 9px
  });
});

// --- Story 2.9: the build, felt on the slot ------------------------------------

describe('the EIGHTH state: ACTIVE while an ability window runs (amendment 48)', () => {
  const NONE = { denied: false, activated: false };

  it('enters ACTIVE from a running window, and leaves it when the window ends', () => {
    const base = viewFor('torpedoBoat'); // SLOT_BOOST = speedBoost
    const running = slotViewModels({ ...base, activeMsLeft: at(0, { [SLOT_BOOST]: 3000 }) });
    expect(running[SLOT_BOOST].state).toBe('active');
    const ended = slotViewModels({ ...base, activeMsLeft: nine(0) });
    expect(ended[SLOT_BOOST].state).toBe('readyAbility');
  });

  it('the Shift BOOST square wears the ability grammar on EVERY hull (amendment 23)', () => {
    // readyAbility → activated → active → cooling, the same four skins the
    // Torpedo Boat's boost has always worn — now on the Battleship and the Mine
    // Layer too, because slot 1 holds the same module on all of them.
    for (const cls of ['torpedoBoat', 'battleship', 'mineLayer'] as const) {
      const base = viewFor(cls);
      expect(slotViewModels(base)[SLOT_BOOST].id, cls).toBe('speedBoost');
      expect(slotViewModels(base)[SLOT_BOOST].state, cls).toBe('readyAbility');
      const popped = slotViewModels({ ...base, activated: at(false, { [SLOT_BOOST]: true }) });
      expect(popped[SLOT_BOOST].state, cls).toBe('activated');
      const running = slotViewModels({ ...base, activeMsLeft: at(0, { [SLOT_BOOST]: 4000 }) });
      expect(running[SLOT_BOOST].state, cls).toBe('active');
      expect(slotNumeral(running[SLOT_BOOST]), cls).toBe(wipeLabel(4000));
      const cooling = slotViewModels({
        ...base,
        ammo: at(null, { [SLOT_BOOST]: { n: 0, reloadMsLeft: 9000 } }),
      });
      expect(cooling[SLOT_BOOST].state, cls).toBe('cooling');
    }
  });

  it('outranks COOLING — a decoy floats while its rack reloads — but not denied/activated', () => {
    expect(slotState('radarBuoy', NONE, true, false, false, true)).toBe('active');
    expect(slotState('radarBuoy', NONE, true, true, false, true)).toBe('active');
    expect(slotState('radarBuoy', { ...NONE, denied: true }, true, false, false, true)).toBe('denied');
    expect(slotState('radarBuoy', { ...NONE, activated: true }, true, false, false, true)).toBe('activated');
    // ...and the WIPE's fraction is still computed, so nothing is lost. The
    // buoy is DARK since Story 8.5 (amendment 22) — no card or seed fits it —
    // so the row is built by hand here rather than read off a hull's fit; the
    // coexistence this pins is a property of the STATE machine, not of the fit.
    const base = viewFor('mineLayer');
    const view: HotbarView = {
      ...base,
      loadout: base.loadout.map((id, i) => (i === E ? 'radarBuoy' : id)),
      ammo: at(null, { [E]: { n: 0, reloadMsLeft: 5000 } }),
      activeMsLeft: at(0, { [E]: 20_000 }),
    };
    const decoy = slotViewModels(view)[E];
    expect(decoy.state).toBe('active');
    expect(decoy.coolFrac).toBeGreaterThan(0);
  });

  it('prints the window\'s seconds as the centred numeral, dual-coding the outline', () => {
    // PIN MOVED (amendment 34). The countdown used to be an `ACTIVE 4s · ` prefix
    // on the label column's quick-info line; with the column deleted it is the
    // square's own centred numeral, in the wipe's grammar and at the wipe's size.
    const running = (ms: number) =>
      slotViewModels(viewFor('torpedoBoat', { activeMsLeft: at(0, { [SLOT_BOOST]: ms }) }))[SLOT_BOOST];
    expect(slotNumeral(running(3200))).toBe('4'); // whole seconds, rounded UP
    expect(slotNumeral(running(1400))).toBe('1.4'); // ...and tenths in the last two
    expect(slotNumeral(running(0))).toBe(''); // a window that ended shows nothing
    expect(running(0).state).toBe('readyAbility');
  });

  it('keeps the countdown at EVERY motion level — only the breathing stops', () => {
    // The numeral is motion-independent by construction (slotNumeral takes no
    // motion input at all): the outline may stop moving for accessibility, but
    // the seconds are information.
    const view = viewFor('torpedoBoat', { activeMsLeft: at(0, { [SLOT_BOOST]: 2000 }), motion: 'off' });
    expect(slotNumeral(slotViewModels(view)[SLOT_BOOST])).toBe('2');
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
    const rows = slotViewModels(viewFor('torpedoBoat', { fit: at(false, { [Q]: true }) }));
    expect(rows.map((r) => r.fitFlash)).toEqual(at(false, { [Q]: true }));
  });

  it('is suppressed at motion=off (the toast + tooltip row carry it statically)', () => {
    const fit = at(false, { [SLOT_GUN]: true });
    const on = slotViewModels(viewFor('torpedoBoat', { fit, motion: 'reduced' }));
    const off = slotViewModels(viewFor('torpedoBoat', { fit, motion: 'off' }));
    expect(on[SLOT_GUN].fitFlash).toBe(true);
    expect(off[SLOT_GUN].fitFlash).toBe(false);
  });

  it('routes a fitted CARD to its slot, and a shipwide ladder to no slot at all', () => {
    const loadout = idsFor('mineLayer', statsFor('mineLayer')); // gun / boost / mine / empties
    expect(slotForCard(loadout, 'deckGunBarrel')).toBe(SLOT_GUN);
    expect(slotForCard(loadout, 'navalMines')).toBe(Q);
    expect(slotForCard(loadout, 'foulingMines')).toBe(Q);
    expect(slotForCard(loadout, 'radarSweep')).toBeNull();
    expect(slotForCard(loadout, 'armor')).toBeNull();
    // A card for kit this hull does not carry owns no slot either (rank-wide).
    expect(slotForCard(loadout, 'heavyTorpedo')).toBeNull();
  });
});

describe('the accrued build routes to its slot (the ◆n MARK is deleted — amendment 8)', () => {
  it('counts the cards addressing this slot, and nothing on an unfitted-for slot', () => {
    const cards = ['deckGunBarrel', 'deckGunBarrel', 'heavyTorpedo'];
    const rows = slotViewModels(viewFor('torpedoBoat', { cards }));
    expect(rows[SLOT_GUN].boonCount).toBe(2); // gun
    expect(rows[Q].boonCount).toBe(1); // heavy torpedo
    expect(rows[SLOT_BOOST].boonCount).toBe(0); // boost
    // ...and NONE of it is drawn on the square: the per-slot `◆n` mark rode the
    // v2 categories and left with them (Eric ruling 2026-09-15), and Story 8.6
    // took the words with the label column. What a square shows of the build is
    // the TIER numeral; the list itself lives in the tooltip.
    expect(rows[SLOT_GUN].tier).toBe(0); // the deck gun has no equipment ladder
    expect(rows[Q].tier).toBe(1); // ...but the torpedo's line is at copy 1
  });

  it('folds the shipwide ladders into the GUN slot only (the ship card)', () => {
    const cards = ['radarSweep', 'armor', 'reload'];
    const rows = slotViewModels(viewFor('torpedoBoat', { cards }));
    expect(rows[SLOT_GUN].boonCount).toBe(3);
    expect(rows[Q].boonCount).toBe(0);
    expect(slotBoonIds('heavyTorpedo', cards)).toEqual([]);
  });

  it('ignores a junk id on the wire rather than counting it', () => {
    expect(slotBoonIds('gun', ['deckGunBarrel', 'notARealBoon', 'constructor'])).toEqual(['deckGunBarrel']);
  });

  it('spends no glyphs on a count — a deep gun build still prints no numeral', () => {
    const rows = slotViewModels(viewFor('torpedoBoat', { cards: Array<string>(12).fill('deckGunBarrel') }));
    expect(rows[SLOT_GUN].boonCount).toBe(12); // the tooltip lists every one of them
    expect(rows[SLOT_GUN].tier).toBe(0); // DECK GUN BARREL is not the gun's own line
    expect(slotNumeral(rows[SLOT_GUN])).toBe('');
  });
});

describe('the tooltip lists the ACCRUED build (the 2.2 absence, filled)', () => {
  const stats = statsFor('torpedoBoat');

  it('gives every held line a ◆ name row, and a live effect line where there is one', () => {
    const t = tooltipModel(0, 'gun', stats, ['deckGunBarrel', 'deckGunTurret'])!;
    expect(t.boons.map((r) => r.label)).toEqual(['◆ DECK GUN BARREL', '◆ DECK GUN TURRET']);
    expect(t.boons[0].effect).toMatch(/^Shells per shot: \d/);
    expect(t.boons[1].effect).toMatch(/^Gun rounds ready: \d/);
  });

  // PIN FLIPPED (2.9 review): the row carried a `×n` suffix beside a name that
  // ALREADY names the rung. Every stackable ladder in the catalog is
  // position-aware (Mk I/II/III...), so `×3` next to `Mk III` said the same
  // thing twice — and the lines with no rung name are the single-copy ones,
  // where there is nothing to count. The suffix is gone; the row's contract
  // ("only when needed") is now trivially satisfied.
  it('COLLAPSES a stack into ONE row that names the LINE — and nothing else', () => {
    const held = ['deckGunBarrel', 'deckGunBarrel'];
    const rows = boonRows('gun', held, statsFor('torpedoBoat', { deckGunBarrel: 2 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('◆ DECK GUN BARREL');
    expect(rows[0].label).not.toContain('×');
  });

  it('prints a doctrine row with its behavior text, not a number', () => {
    // Catalog v3 made CAPTIVE MINES its own equipment line (R25), so the mine
    // slot's surviving verb is FOULING MINES — and the claim under test is
    // unchanged: a doctrine row prints BEHAVIOUR, never a stat readout.
    const t = tooltipModel(1, 'navalMines', stats, ['foulingMines'])!;
    expect(t.boons[0].label).toBe('◆ FOULING MINES');
    expect(t.boons[0].effect).toContain('foul screws');
    expect(t.boons[0].effect).not.toContain('→');
  });

  it('hosts the SHIPWIDE ladders under the — SHIP — divider, in the gun tooltip only', () => {
    // RELOAD, RADAR SWEEP and SPEED address no equipment at all, so they belong
    // BELOW the divider — the gun's own row here is DECK GUN BARREL, which is
    // what puts a side on each of the separator.
    const held = ['deckGunBarrel', 'reload', 'radarSweep', 'speed'];
    const gun = tooltipModel(0, 'gun', stats, held)!;
    expect(gun.boons.map((r) => r.label)).toEqual([
      '◆ DECK GUN BARREL',
      SHIP_DIVIDER_ROW,
      '◆ RELOAD',
      '◆ RADAR SWEEP',
      '◆ SPEED',
    ]);
    expect(gun.boons[1].divider).toBe(true);
    expect(gun.boons[1].effect).toBe('');
    expect(tooltipModel(1, 'heavyTorpedo', stats, held)!.boons).toEqual([]);
  });

  it('still renders ABSENCE for a slot with nothing fitted', () => {
    expect(tooltipModel(1, 'heavyTorpedo', stats, ['deckGunBarrel'])!.boons).toEqual([]);
    expect(tooltipModel(1, 'heavyTorpedo', stats)!.boons).toEqual([]);
  });

  it('reports the LIVE value, so the row moves with the stack', () => {
    const one = tooltipModel(0, 'gun', statsFor('torpedoBoat', { deckGunBarrel: 1 }), ['deckGunBarrel'])!;
    const two = tooltipModel(0, 'gun', statsFor('torpedoBoat', { deckGunBarrel: 2 }), Array(2).fill('deckGunBarrel'))!;
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
  const maxedGunBuild = Object.values(CATALOG)
    .filter((d) => d.kind === 'ladder')
    .flatMap((d) => Array<string>(d.cap).fill(d.id));

  it('places the boons block below the MEASURED description, never under it', () => {
    const model = tooltipModel(0, 'gun', stats, ['deckGunBarrel', 'reload'])!;
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
    const model = tooltipModel(0, 'gun', stats, ['deckGunBarrel'])!;
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
      denied: at(false, { [Q]: true }),
      deniedDegraded: nine(true),
    });
    expect(slotViewModels(view).map((m) => m.degraded)).toEqual(at(false, { [Q]: true }));
    expect(slotViewModels(view).map((m) => m.state === 'denied')).toEqual(at(false, { [Q]: true }));
  });

  it('a denied slot with no verdict animates, exactly as it always has', () => {
    const view = viewFor('torpedoBoat', { denied: at(false, { [SLOT_GUN]: true }) });
    expect(slotFlags(view, SLOT_GUN)).toEqual({ denied: true, activated: false }); // untouched
    expect(slotDegraded(view, SLOT_GUN, true)).toBe(false);
    expect(slotViewModels(view)[SLOT_GUN].degraded).toBe(false);
    expect(slotViewModels(view)[SLOT_GUN].state).toBe('denied'); // and it is still DENIED
  });

  it('a verdict can never change WHICH STATE a row is in', () => {
    // The budget degrades a mark; it never re-classifies one. A degraded denial
    // is still `denied` — same border, same icon, same precedence.
    const view = viewFor('torpedoBoat', {
      denied: at(false, { [SLOT_GUN]: true }),
      deniedDegraded: at(false, { [SLOT_GUN]: true }),
    });
    expect(slotViewModels(view)[SLOT_GUN].state).toBe('denied');
    expect(slotDegraded(view, SLOT_GUN, false)).toBe(false); // no denial, no verdict
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
    const layout = hudBarLayout(1366, 768);
    expect(layout.squares).toHaveLength(SLOT_COUNT);
    expect(layout.dimGroups).toHaveLength(2); // the slot run + the framed belt
  });
});

// --- STORY 8.6: THE TIER NUMERAL ------------------------------------------------
//
// The square's second number, bottom-right: how far up its own ladder the fitted
// weapon has climbed. The ramp is ABSOLUTE — tier III is the same colour on a
// weapon capped at III as on one capped at V — so a player learns one ladder of
// five colours instead of re-reading the ramp per weapon.

describe('the tier numeral and its absolute ramp', () => {
  it('counts the copies of the slot\'s OWN equipment line, capped by the catalog', () => {
    expect(lineTier([], 'heavyTorpedo')).toBe(0);
    expect(lineTier(['heavyTorpedo'], 'heavyTorpedo')).toBe(1);
    expect(lineTier(['heavyTorpedo', 'heavyTorpedo', 'navalMines'], 'heavyTorpedo')).toBe(2);
    // Capped: a duplicate the server should never have granted cannot paint a
    // sixth colour onto a five-rung ramp.
    const cap = CATALOG.heavyTorpedo.cap;
    expect(lineTier(Array<string>(cap + 4).fill('heavyTorpedo'), 'heavyTorpedo')).toBe(cap);
    expect(cap).toBeLessThanOrEqual(TIER_COLORS.length);
    // Fail-closed on an id the catalog does not know.
    expect(lineTier(['notARealLine', 'notARealLine'], 'notARealLine')).toBe(0);
  });

  it('runs I → phosphor, II → info, III → storm, IV → denied, V → amber', () => {
    expect(TIER_COLORS).toEqual([C.phosphor, C.info, C.stormReadout, C.denied, C.amber]);
    expect([1, 2, 3, 4, 5].map(tierNumeral)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect([1, 2, 3, 4, 5].map(tierColor)).toEqual([C.phosphor, C.info, C.stormReadout, C.denied, C.amber]);
  });

  it('prints NOTHING at tier 0 — the permanent deck gun, and every empty', () => {
    expect(tierNumeral(0)).toBe('');
    expect(tierNumeral(9)).toBe('');
    const rows = slotViewModels(viewFor('torpedoBoat', { cards: ['heavyTorpedo', 'heavyTorpedo'] }));
    expect(rows[SLOT_GUN].tier).toBe(0); // the gun climbs no equipment ladder
    expect(rows[Q].tier).toBe(2); // ...the torpedo does
    expect(rows[R].tier).toBe(0); // ...and an unfitted slot has none to climb
  });

  it('never prints one on the BELT — stock is not a ladder', () => {
    const base = viewFor('torpedoBoat');
    const view: HotbarView = {
      ...base,
      // A belt square holding equipment (Story 8.7's shape), with its line fitted
      // twice: it would read tier II anywhere else on the bar.
      loadout: base.loadout.map((id, i) => (i === 5 ? 'heavyTorpedo' : id)),
      cards: ['heavyTorpedo', 'heavyTorpedo'],
    };
    expect(slotViewModels(view)[5].tier).toBe(0);
  });
});

// --- STORY 8.6: WHAT THE ROW ACTUALLY PAINTS -------------------------------------
//
// The thin Pixi shell, read back off the Graphics context it emitted. These pin
// the handful of claims that are genuinely about DRAWING rather than about the
// pure model: the belt's frame, the wipe appearing on cooling and NOT under an
// ACTIVE window, the ghost gun chip, the selected chip's amber fill, and the
// absence of any word on a square.

/** One emitted Graphics instruction, flattened to what a pin needs. */
interface PaintOp {
  action: string;
  color: number;
  alpha: number;
  rects: number[][];
  polys: number[][];
}

function opsOf(g: Graphics): PaintOp[] {
  const raw = g.context.instructions as {
    action: string;
    data: {
      style?: { color?: number; alpha?: number };
      path?: { instructions: { action: string; data: unknown[] }[] };
    };
  }[];
  return raw.map((ins) => {
    const path = ins.data.path?.instructions ?? [];
    return {
      action: ins.action,
      color: ins.data.style?.color ?? -1,
      alpha: ins.data.style?.alpha ?? -1,
      rects: path.filter((q) => q.action === 'rect').map((q) => (q.data as number[]).slice(0, 4)),
      polys: path.filter((q) => q.action === 'poly').map((q) => (q.data as number[][])[0]),
    };
  });
}

/** Render one frame into a detached layer and read back what it painted. */
function paint(view: HotbarView, uiScale = 1) {
  const layer = new Container();
  const row = new Hotbar(layer);
  const layout = hudBarLayout(1366, 768);
  row.update(view, layout, null, 0, uiScale);
  const root = layer.children[0] as Container;
  const ops = opsOf(root.children[0] as Graphics);
  const texts = root.children.filter((c): c is Text => c instanceof Text);
  return { row, layout, ops, texts, words: texts.filter((t) => t.visible).map((t) => t.text) };
}

const sameRect = (r: number[], box: { x: number; y: number; w: number; h: number }): boolean =>
  r[0] === box.x && r[1] === box.y && r[2] === box.w && r[3] === box.h;

describe('the belt FRAME (ruling 5)', () => {
  it('draws ONE silver .2 hairline at exactly the layout\'s belt rect', () => {
    const { ops, layout } = paint(viewFor('torpedoBoat'));
    const frames = ops.filter(
      (o) => o.action === 'stroke' && o.color === C.silver && o.rects.some((r) => sameRect(r, layout.belt)),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0].alpha).toBeCloseTo(0.2, 9);
    // The frame ENCLOSES the chips, which is why it is taller than its squares.
    expect(layout.belt.h).toBeGreaterThan(B.beltSlot + B.chipH);
  });
});

describe('the cooldown WIPE on the square (ruling 3 / amendment 34)', () => {
  const cooling = viewFor('torpedoBoat', { ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }) });

  it('scrims the whole square and lays the dark region over it while COOLING', () => {
    const { ops, layout } = paint(cooling);
    const square = layout.squares[SLOT_GUN];
    const scrim = ops.filter(
      (o) => o.action === 'fill' && o.color === C.cardScrim && o.rects.some((r) => sameRect(r, square)),
    );
    expect(scrim).toHaveLength(1);
    expect(scrim[0].alpha).toBeCloseTo(B.wipe.scrimAlpha, 9);
    expect(ops.some((o) => o.color === C.cardScrim && o.alpha === B.wipe.darkAlpha && o.polys.length > 0)).toBe(true);
  });

  it('stacks scrim → ICON → dark region, so the clock takes the icon down with it', () => {
    // The mock's own order (`background` → `<svg>` → `.cd`): the dark region
    // falls ACROSS the icon rather than sitting behind it, which is what makes
    // the uncovering read as one surface clearing instead of two layers sliding.
    const { ops, layout } = paint(cooling);
    const square = layout.squares[SLOT_GUN];
    const idx = (match: (o: PaintOp) => boolean): number => ops.findIndex(match);
    const scrimAt = idx((o) => o.action === 'fill' && o.color === C.cardScrim && o.rects.some((r) => sameRect(r, square)));
    // The icon is the phosphor linework stroked at the wipe's dimmed alpha.
    const iconAt = idx((o) => o.action === 'stroke' && o.color === C.phosphor && o.alpha === B.wipe.iconAlpha);
    const darkAt = idx((o) => o.color === C.cardScrim && o.alpha === B.wipe.darkAlpha && o.polys.length > 0);
    expect(scrimAt).toBeGreaterThanOrEqual(0);
    expect(iconAt).toBeGreaterThan(scrimAt);
    expect(darkAt).toBeGreaterThan(iconAt);
  });

  it('keeps every NUMBER above the dark region — numeral, tier and badge', () => {
    // Text children all render above the one Graphics child, so the numeral and
    // the tier numeral are over the wipe by construction; the BADGE's box is
    // Graphics, so its painting order is the thing that has to be pinned.
    const stats = twoTubes('torpedoBoat');
    const view: HotbarView = {
      ...viewFor('torpedoBoat'),
      stats,
      loadout: idsFor('torpedoBoat', stats),
      cards: ['heavyTorpedo'],
      ammo: at(null, { [Q]: { n: 0, reloadMsLeft: 1200 } }),
    };
    const { ops, layout, texts, words } = paint(view);
    const darkAt = ops.findIndex((o) => o.color === C.cardScrim && o.alpha === B.wipe.darkAlpha && o.polys.length > 0);
    const badgeAt = ops.findIndex((o) => o.rects.some((r) => sameRect(r, badgeRect(layout, Q))));
    expect(darkAt).toBeGreaterThanOrEqual(0);
    expect(badgeAt).toBeGreaterThan(darkAt);
    expect(words).toContain('1.2'); // the numeral
    expect(words).toContain('I'); // the tier numeral
    const numeral = texts.find((t) => t.visible && t.text === '1.2');
    const root = numeral?.parent;
    const gfxIndex = root === null || root === undefined ? -1 : root.children.findIndex((c) => c instanceof Graphics);
    expect(gfxIndex).toBe(0); // every Text sits above the one Graphics
  });

  it('shows the seconds as the centred numeral, at the wipe\'s own size', () => {
    const { words, texts } = paint(cooling);
    expect(words).toContain(wipeLabel(1200));
    const numeral = texts.find((t) => t.visible && t.text === wipeLabel(1200));
    expect(numeral?.style.fontSize).toBe(B.type.wipe);
  });

  it('draws NO overlay at all while a window is ACTIVE — only the numeral', () => {
    // Amendment 34: ACTIVE keeps the icon at full alpha and puts the window's
    // seconds in the same centred register, with nothing over the square. The
    // reload really is running underneath (the boost's cooldown opens with the
    // throttle), so this is the ordering doing work, not a vacuous case.
    const active = viewFor('torpedoBoat', {
      activeMsLeft: at(0, { [SLOT_BOOST]: 4300 }),
      ammo: at(null, { [SLOT_BOOST]: { n: 0, reloadMsLeft: 9000 } }),
    });
    const { ops, layout, words } = paint(active);
    const square = layout.squares[SLOT_BOOST];
    expect(ops.some((o) => o.color === C.cardScrim && o.rects.some((r) => sameRect(r, square)))).toBe(false);
    expect(ops.some((o) => o.color === C.cardScrim && o.alpha === B.wipe.darkAlpha)).toBe(false);
    expect(words).toContain(wipeLabel(4300));
  });
});

describe('the key chips on the bar', () => {
  it('paints a muted hairline box under every KEYED square, and none under the gun', () => {
    const { ops, layout } = paint(viewFor('torpedoBoat', { primedSlot: R }));
    const boxOf = (slot: number) => chipRect(layout, slot);
    for (const slot of [1, 2, 3, 5, 8]) {
      const drawn = ops.filter((o) => o.rects.some((r) => sameRect(r, boxOf(slot))));
      expect(drawn.length, String(slot)).toBe(1);
      expect(drawn[0].color, String(slot)).toBe(C.textMuted);
      expect(drawn[0].alpha, String(slot)).toBeCloseTo(0.55, 9);
    }
    // THE GHOST: the gun's chip box is laid out (so the row keeps one baseline)
    // and never painted.
    expect(ops.some((o) => o.rects.some((r) => sameRect(r, boxOf(SLOT_GUN))))).toBe(false);
    expect(boxOf(SLOT_GUN).w).toBe(B.chipMinW);
  });

  it('FILLS the selected square\'s chip amber and knocks its glyph out in void', () => {
    const { ops, layout, texts } = paint(viewFor('torpedoBoat', { primedSlot: Q }));
    const filled = ops.filter((o) => o.action === 'fill' && o.rects.some((r) => sameRect(r, chipRect(layout, Q))));
    expect(filled).toHaveLength(1);
    expect(filled[0].color).toBe(C.amber);
    const glyph = texts.find((t) => t.visible && t.text === 'Q');
    expect(glyph?.style.fill).toBe(C.void);
    expect(glyph?.style.fontWeight).toBe('600');
  });

  it('counter-scales the 9px registers at the 90% UI setting, and nothing else', () => {
    const at100 = paint(viewFor('torpedoBoat'), 1);
    const at90 = paint(viewFor('torpedoBoat'), 0.9);
    const shiftAt = (r: ReturnType<typeof paint>) => r.texts.find((t) => t.visible && t.text === 'Shift');
    expect(shiftAt(at100)?.scale.x).toBeCloseTo(1, 9);
    expect(shiftAt(at90)?.scale.x).toBeCloseTo(microScale(0.9), 9);
  });
});

describe('NO WORDS render on a square (UX-DR40/41)', () => {
  it('shows the key glyphs and nothing else on a live, unfitted bar', () => {
    const { words } = paint(viewFor('torpedoBoat'));
    expect([...words].sort()).toEqual(['1', '2', '3', '4', 'E', 'Q', 'R', 'Shift']);
  });

  it('adds only NUMERALS as the state asks for them — never a name', () => {
    const view = viewFor('torpedoBoat', {
      cards: ['heavyTorpedo'],
      ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }),
    });
    const { words } = paint(view);
    expect([...words].sort()).toEqual(['1', '1.2', '2', '3', '4', 'E', 'I', 'Q', 'R', 'Shift']);
    for (const name of Object.values(EQUIPMENT_NAME)) expect(words).not.toContain(name);
  });
});
