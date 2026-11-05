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
// suites drive come from CARDS, exactly as main.ts's slotIdsFor derives them.
// STORY 8.10 DELETED the interim spawn seed (every hull spawns with the gun and
// Shift alone now), so the per-hull weapon lists are THIS SUITE'S OWN fixture —
// written out rather than imported from a table that no longer ships.
//
// STORY 9.2 RETIRED THE BELT (epic-9 amendments 21/22/31): eleven squares — the
// weapon row plus six FIXED consumable squares in CONSUMABLE_KEY_ORDER, keys
// 1–6 — and a NEW state, ZERO-STOCK, on a consumable square whose kind is at
// zero copies (dashed, the kind's own glyph faint, no badge, deniable).
// STORY 10.1 (epic-10 amendment 3) cut the row to the ship's KIT: four lines
// the captain picks, `kit[i]` at slot `5 + i`, keys `1`…`KIT_SIZE`. This suite
// sails a NON-DEFAULT kit (`KIT`) so nothing rides DEFAULT_KIT silently.
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
  DEFAULT_CLASS_ID,
  SHIFT_IDS,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  WEAPON_SLOTS,
  abilityCooldownMs,
  effectiveStats,
  slotsWithCards,
  type EffectiveStats,
  type EquipmentId,
  type ShipClassId,
  type WeaponAmmo,
} from '@salvo/shared';
import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import {
  ACTIVE_PULSE_AMP,
  ACTIVE_PULSE_HZ,
  TIER_COLORS,
  Hotbar,
  activeBreath,
  advanceBreathPhase,
  badgeRect,
  badgeText,
  badgeWidth,
  abilityCooldownView,
  breathedSkin,
  chipRect,
  chipWidth,
  coolFraction,
  degradedSkin,
  fitFrameAlpha,
  FIT_FRAME_ALPHA,
  FIT_PULSE_PX,
  isCooling,
  wipeShown,
  slotAtPoint,
  tipCacheHit,
  slotDegraded,
  slotFlags,
  slotNumeral,
  slotSkin,
  slotState,
  slotViewModels,
  tierColor,
  tierNumeral,
  type HotbarView,
  type TooltipCache,
} from '../render/hotbar.js';
// THE TOOLTIP CORE MOVED in Story 8.7 (ruling 13): `render/slotTooltip.ts` owns
// the hover dwell, the stat-line model, the container-fit model and the
// placement. The pins that measure them moved with it
// (__tests__/slotTooltip.test.ts); this file keeps the memo-key pins.
import { tooltipModel } from '../render/slotTooltip.js';
import { hudBarLayout, microScale } from '../render/hudBar.js';
import { equipmentGlyphSvg, glyphPaths } from '../render/equipmentIcons.js';
import { ABILITY_KEY_GLYPHS, ABILITY_SQUARES, HOTBAR_SQUARE_COUNT, abilitySquare } from '../render/hotbarSquares.js';
import { wipeLabel } from '../render/cooldownWipe.js';
import {
  EQUIPMENT_NAME,
  cardEquipmentIds,
  equipmentInfo,
  interactionLine,
  lineTier,
  slotForCard,
  slotTier,
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
 * THE FIXTURE (Story 8.10): the class weapons this suite fits, per hull. Until
 * 8.10 these came from the interim spawn seed, which is deleted (no drawn card
 * is aboard at spawn any more), so the suite states them itself —
 * what is pinned below is the ROW's behaviour with a weapon in Q (and, for the
 * gunnery hull, in Q and E), not who put it there.
 */
const TORPEDO_HULL: ShipClassId = DEFAULT_CLASS_ID;
/** Two more hulls (any, not the default) for the two other fits. Story 10.4:
 *  the hull no longer decides the fit, so which hull wears which is the
 *  suite's own choice. */
const [GUNNERY_HULL, MINE_HULL] = SHIP_CLASS_IDS.filter((c) => c !== DEFAULT_CLASS_ID) as [ShipClassId, ShipClassId];
const FITTED: Record<ShipClassId, readonly string[]> = Object.fromEntries(
  SHIP_CLASS_IDS.map((c) => [
    c,
    c === GUNNERY_HULL ? ['lightTorpedo', 'navalMines', 'starShells'] : c === MINE_HULL ? ['navalMines'] : ['heavyTorpedo'],
  ]),
) as unknown as Record<ShipClassId, readonly string[]>;

/**
 * The slot ids a hull sails with once those cards are aboard — main.ts's
 * slotIdsFor, verbatim. Story 8.5: the base fit is hull-free (gun + boost +
 * empties) and weapons arrive as CARDS; since Story 10.5 each lands in its
 * FAMILY's slot (Q torpedo, E mine, R special shell). So the torpedo hull's
 * torpedo is in Q, the mine hull's mine in E, and the third hull fills all
 * three.
 */
function idsFor(cls: ShipClassId, stats: EffectiveStats): (EquipmentId | null)[] {
  return slotsWithCards(stats, FITTED[cls]).map((s) => s.equipmentId);
}

/** A full-length per-SQUARE array of `v` — the shape every HotbarView latch
 *  takes (the loadout slots, then `C` / `V` — render/hotbarSquares.ts). */
function nine<T>(v: T): T[] {
  return Array.from({ length: HOTBAR_SQUARE_COUNT }, () => v);
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

describe('square order — Gun (keyless) / Shift / Q / E / R / C / V', () => {
  it('is one square per loadout slot then one per cooldown ability, the gun first and keyless', () => {
    expect(HOTBAR_SQUARE_COUNT).toBe(SLOT_COUNT + ABILITY_SQUARES.length);
    expect(SLOT_KEY_GLYPHS).toHaveLength(HOTBAR_SQUARE_COUNT);
    const rows = slotViewModels(viewFor(TORPEDO_HULL));
    expect(rows).toHaveLength(HOTBAR_SQUARE_COUNT);
    expect(rows.map((r) => r.keyGlyph)).toEqual(SLOT_KEY_GLYPHS);
    expect(rows.map((r) => r.slot)).toEqual(Array.from({ length: HOTBAR_SQUARE_COUNT }, (_, i) => i));
  });

  it('keys the boost square, and the GUN alone stays keyless (amendment 33)', () => {
    expect(SLOT_KEY_GLYPHS[SLOT_BOOST]).not.toBe('');
    expect(SLOT_KEY_GLYPHS[SLOT_GUN]).toBe(''); // the ghost chip keeps the baseline
    expect(SLOT_KEY_GLYPHS.filter((g) => g === '')).toHaveLength(1);
  });

  it('EVERY captain hull carries the same shape: main battery, boost, family slots, then C and V', () => {
    // Story 10.5: each weapon lands in its FAMILY's slot — Q torpedo, E mine,
    // R special shell — and an unfilled family slot is plain EMPTY.
    expect(slotViewModels(viewFor(TORPEDO_HULL)).map((r) => r.id)).toEqual(
      ['mainBattery', 'boost', 'heavyTorpedo', null, null, ...ABILITY_SQUARES],
    );
    expect(slotViewModels(viewFor(GUNNERY_HULL)).map((r) => r.id)).toEqual(
      ['mainBattery', 'boost', 'lightTorpedo', 'navalMines', 'starShells', ...ABILITY_SQUARES],
    );
    expect(slotViewModels(viewFor(MINE_HULL)).map((r) => r.id)).toEqual(
      ['mainBattery', 'boost', null, 'navalMines', null, ...ABILITY_SQUARES],
    );
  });

  it('gives NO SQUARE any words at all — fitted or empty (UX-DR41 / Story 8.6)', () => {
    // PIN WIDENED. Story 8.5 retired the empty row's "— awaiting refit —" label;
    // Story 8.6 deleted the label column outright, so the view model carries no
    // name or info string for ANY slot. The equipment's name is the tooltip's.
    const model = slotViewModels(viewFor(GUNNERY_HULL))[0] as unknown as Record<string, unknown>;
    expect(model.name).toBeUndefined();
    expect(model.quickInfo).toBeUndefined();
    const empties = slotViewModels(viewFor(TORPEDO_HULL)).filter((r) => r.state === 'empty');
    expect(empties).toHaveLength(2); // E and R, unfilled
    for (const row of empties) {
      expect(row.badge).toBeNull();
      expect(row.tier).toBe(0);
      expect(slotNumeral(row)).toBe('');
      expect(row.keyGlyph).not.toBe(''); // …but the KEY is still labelled
    }
  });

  it('an empty WEAPON square short-circuits a denied latch (nothing to flash)', () => {
    expect(slotViewModels(viewFor(TORPEDO_HULL, { denied: at(false, { [R]: true }) }))[R].state).toBe('empty');
  });
});

describe('the seven-state grammar + its precedence', () => {
  const NONE = { denied: false, activated: false };

  it('maps every state', () => {
    expect(slotState(null, NONE, false, false, false)).toBe('empty');
    expect(slotState('heavyTorpedo', { ...NONE, denied: true }, false, false, true)).toBe('denied');
    expect(slotState('boost', { ...NONE, activated: true }, false, false, false)).toBe('activated');
    expect(slotState('heavyTorpedo', NONE, true, false, true)).toBe('cooling');
    expect(slotState('gun', NONE, false, true, true)).toBe('selected');
    expect(slotState('heavyTorpedo', NONE, false, false, true)).toBe('readyWeapon');
    expect(slotState('boost', NONE, false, false, false)).toBe('readyAbility');
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
      viewFor(TORPEDO_HULL, { primedSlot: SLOT_GUN, ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }) }),
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
    const stats = twoTubes(TORPEDO_HULL);
    const rows = slotViewModels({
      ...viewFor(TORPEDO_HULL),
      stats,
      loadout: idsFor(TORPEDO_HULL, stats),
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
    expect(slotSkin('cooling').scrim).toBe(true);
    expect(slotSkin('cooling').border).toBe(C.silver); // the DESIGN idle recipe
    expect(slotSkin('empty').dashed).toBe(true);
  });

  it('has ONE skin per state — eight states, eight recipes', () => {
    const states = ['empty', 'denied', 'activated', 'active', 'cooling', 'selected', 'readyWeapon', 'readyAbility'] as const;
    for (const st of states) expect(slotSkin(st), st).toBeDefined();
    expect(new Set(states.map((st) => JSON.stringify(slotSkin(st)))).size).toBe(states.length);
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
  it('shows nothing at base but the main battery\'s turrets (boost 1, torpedo 1)', () => {
    // Story 10.4: slot 0's pool is the hull's TURRET COUNT (always > 1), so the
    // battery square carries the ready-turret badge; every one-round pool none.
    const turrets = equipmentInfo(statsFor(TORPEDO_HULL), 'mainBattery').maxAmmo;
    expect(turrets).toBeGreaterThan(1);
    expect(slotViewModels(viewFor(TORPEDO_HULL)).map((r) => r.badge)).toEqual(at(null, { [SLOT_GUN]: String(turrets) }));
  });

  it('appears once the tube pool grows, and counts the LIVE pool', () => {
    const stats = twoTubes(TORPEDO_HULL);
    const loadout = idsFor(TORPEDO_HULL, stats);
    const view: HotbarView = {
      ...viewFor(TORPEDO_HULL),
      stats,
      loadout,
      ammo: at(null, {
        [SLOT_GUN]: { n: 1, reloadMsLeft: 0 },
        [SLOT_BOOST]: { n: 1, reloadMsLeft: 0 },
        [Q]: { n: 2, reloadMsLeft: 0 },
      }),
    };
    expect(equipmentInfo(stats, 'heavyTorpedo').maxAmmo).toBe(2); // the upgrade landed
    // (slot 0 is the battery summary — one turret ready here — and badges too.)
    expect(slotViewModels(view).map((r) => r.badge)).toEqual(at(null, { [SLOT_GUN]: '1', [Q]: '2' }));
    const fired = slotViewModels({
      ...view,
      ammo: view.ammo.map((a, i) => (i === Q ? { n: 1, reloadMsLeft: 4000 } : a)),
    });
    expect(fired[Q].badge).toBe('1'); // counts down on fire, back up on reload completion
  });

  it('renders NO badge when the ammo entry is missing (never a fabricated "0")', () => {
    const stats = twoTubes(TORPEDO_HULL);
    expect(badgeText(equipmentInfo(stats, 'heavyTorpedo'), null)).toBeNull();
    expect(badgeText(equipmentInfo(stats, 'heavyTorpedo'), { n: 0, reloadMsLeft: 1 })).toBe('0'); // a REAL empty pool does read 0
    const rows = slotViewModels({ ...viewFor(TORPEDO_HULL), stats, loadout: idsFor(TORPEDO_HULL, stats), ammo: nine(null) });
    expect(rows.map((r) => r.badge)).toEqual(nine(null));
  });
});

describe('the ONE centred numeral — the reload clock and the ACTIVE window', () => {
  it('reads the RELOAD while cooling, in the wipe\'s own grammar', () => {
    const rows = slotViewModels(
      viewFor(TORPEDO_HULL, { ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }) }),
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
    const view = viewFor(TORPEDO_HULL, {
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
    for (const m of slotViewModels(viewFor(TORPEDO_HULL))) {
      expect(slotNumeral(m), String(m.slot)).toBe('');
      expect(m.reloadMsLeft, String(m.slot)).toBe(0);
    }
  });

  it('clamps the wipe fraction, so a mid-reload reload UPGRADE cannot invert it', () => {
    expect(coolFraction(5000, 3000)).toBe(0); // reloadMsLeft >= the (new, shorter) reloadMs
    expect(coolFraction(0, 3000)).toBe(0);
    expect(coolFraction(1500, 3000)).toBeCloseTo(0.5, 9);
    // A timer longer than the battery's (now shorter) reload.
    const over = equipmentInfo(statsFor(TORPEDO_HULL), 'mainBattery').reloadMs + 1000;
    const rows = slotViewModels(
      viewFor(TORPEDO_HULL, { ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: over } }) }),
    );
    expect(rows[SLOT_GUN].state).toBe('cooling'); // ...still cooling, so the wipe still covers it
    expect(rows[SLOT_GUN].coolFrac).toBe(0);
  });

  it('ticks on EVERY slot regardless of which one is selected', () => {
    const rows = slotViewModels(
      viewFor(TORPEDO_HULL, {
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

// THE MAIN BATTERY'S SUMMARY (Story 10.4): `ammo[0]` is turrets ready + the
// soonest reload. A battery with a turret still ready while another reloads is
// FIREABLE — the ordinary pool grammar: no wipe, no numeral. (The machine gun's
// partial-swap wipe, amendment 112, left with the seat gun pick.)
describe('the main battery with a turret ready and a reload running', () => {
  it('is unchanged by the timer: no wipe, no numeral', () => {
    const base = viewFor(TORPEDO_HULL);
    const m = slotViewModels({ ...base, ammo: [{ n: 1, reloadMsLeft: 4000 }, ...base.ammo.slice(1)] })[SLOT_GUN];
    expect(base.loadout[SLOT_GUN]).toBe('mainBattery');
    expect(m.state).toBe('selected');
    expect(m.swapWipe).toBe(false);
    expect(wipeShown(m)).toBe(false);
    expect(m.coolFrac).toBe(0);
    expect(slotNumeral(m)).toBe('');
  });
});

describe('the bar\'s rects — what the row draws on, and what it swallows', () => {
  const layout = hudBarLayout(1366, 768);

  it('takes one square per hotbar square from the bar, all one size (Story 10.5: no belt)', () => {
    // The GEOMETRY is hudBarLayout's and is pinned there (hudBar.test.ts); what
    // this file pins is that the row reads the rects it is handed, in order.
    expect(layout.squares).toHaveLength(HOTBAR_SQUARE_COUNT);
    for (const [sq, r] of layout.squares.entries()) expect(r.w, String(sq)).toBe(B.slot);
  });

  it('hits the SQUARE, its KEY CHIP and its AMMO BADGE — the whole control (amendment 11)', () => {
    for (let slot = 0; slot < HOTBAR_SQUARE_COUNT; slot += 1) {
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
      // A point on the badge's OVERHANG beside the square, over the gap.
      expect(slotAtPoint({ x: sq.x + sq.w + 1, y: sq.y + 1 }, layout), String(slot)).toBe(slot);
      expect(slotAtPoint({ x: badge.x + badge.w - 1, y: badge.y + 1 }, layout), String(slot)).toBe(slot);
    }
    // ONE badge box on every square, at the one overhang.
    for (let slot = 0; slot < HOTBAR_SQUARE_COUNT; slot += 1) {
      expect(layout.squares[slot].y - badgeRect(layout, slot).y, String(slot)).toBe(B.badgeOverhang);
    }
  });

  // --- REVIEW GATE, CYCLE 141 -------------------------------------------------

  it('is CONTIGUOUS from the square down to the chip — the 5px seam is not water', () => {
    // The square, the `chipGap` seam under it and the key chip are ONE control.
    // The seam used to fall through: a click 3px under a square went past the
    // hit-test and FIRED the gun at the water behind the bar, which is the one
    // thing the amendment-11 footprint exists to prevent.
    for (let slot = 0; slot < HOTBAR_SQUARE_COUNT; slot += 1) {
      const sq = layout.squares[slot];
      const chip = layout.chips[slot];
      expect(chip.y - (sq.y + sq.h), String(slot)).toBe(B.chipGap); // the seam is real
      for (let dy = 1; dy <= B.chipGap; dy += 1) {
        expect(slotAtPoint({ x: chip.cx, y: sq.y + sq.h + dy }, layout), `${slot} +${dy}`).toBe(slot);
      }
      // ...and the whole column, square top to chip bottom, still answers.
      expect(slotAtPoint({ x: sq.x + 1, y: chip.y + B.chipH - 1 }, layout), String(slot)).toBe(slot);
      // Below the chip is water again — the XP strip's row routes no clicks.
      expect(slotAtPoint({ x: chip.cx, y: chip.y + B.chipH + 1 }, layout), String(slot)).toBeNull();
    }
  });

  it('leaves the gaps and open water as WATER', () => {
    const a = layout.squares[0];
    const b = layout.squares[1];
    expect(slotAtPoint({ x: a.x - 2, y: a.y + 10 }, layout)).toBeNull(); // left of the row
    expect(slotAtPoint({ x: a.x + 10, y: a.y - 2 }, layout)).toBeNull(); // above the row
    // the gap between the two ability squares (no badge overhangs it unseen)
    const c = layout.squares[HOTBAR_SQUARE_COUNT - 2];
    const v = layout.squares[HOTBAR_SQUARE_COUNT - 1];
    expect(slotAtPoint({ x: (c.x + c.w + v.x) / 2, y: c.y + c.h - 2 }, layout)).toBeNull();
    expect(b.x).toBeGreaterThan(a.x + a.w); // the run really has gaps
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
    const stats = effectiveStats(CONFIG.shipClasses[TORPEDO_HULL], MAXED);
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
    const base = viewFor(TORPEDO_HULL); // SLOT_BOOST = boost
    const running = slotViewModels({ ...base, activeMsLeft: at(0, { [SLOT_BOOST]: 3000 }) });
    expect(running[SLOT_BOOST].state).toBe('active');
    const ended = slotViewModels({ ...base, activeMsLeft: nine(0) });
    expect(ended[SLOT_BOOST].state).toBe('readyAbility');
  });

  it('the Shift BOOST square wears the ability grammar on EVERY hull (amendment 23)', () => {
    // readyAbility → activated → active → cooling, the same four skins on every
    // hull, because slot 1 holds the same module (the default Shift) on all of them.
    for (const cls of SHIP_CLASS_IDS) {
      const base = viewFor(cls);
      expect(slotViewModels(base)[SLOT_BOOST].id, cls).toBe('boost');
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

  it('outranks COOLING — a HUNKER window runs while its reload does — but not denied/activated', () => {
    // RETARGETED in Story 8.16: this pin was written against the radar buoy
    // (deleted). HUNKER (was DAMAGE CUT until Story 9.9) is the live id with a
    // window that coexists with its reload; the coexistence is a property of
    // the STATE machine, so the row is built by hand.
    expect(slotState('hunker', NONE, true, false, false, true)).toBe('active');
    expect(slotState('hunker', NONE, true, true, false, true)).toBe('active');
    expect(slotState('hunker', { ...NONE, denied: true }, true, false, false, true)).toBe('denied');
    expect(slotState('hunker', { ...NONE, activated: true }, true, false, false, true)).toBe('activated');
    // ...and the WIPE's fraction is still computed, so nothing is lost.
    const base = viewFor(GUNNERY_HULL);
    const view: HotbarView = {
      ...base,
      loadout: base.loadout.map((id, i) => (i === SLOT_BOOST ? 'hunker' : id)),
      ammo: at(null, { [SLOT_BOOST]: { n: 0, reloadMsLeft: 5000 } }),
      activeMsLeft: at(0, { [SLOT_BOOST]: 8_000 }),
    };
    const cut = slotViewModels(view)[SLOT_BOOST];
    expect(cut.state).toBe('active');
    expect(cut.coolFrac).toBeGreaterThan(0);
  });

  it('prints the window\'s seconds as the centred numeral, dual-coding the outline', () => {
    // PIN MOVED (amendment 34). The countdown used to be an `ACTIVE 4s · ` prefix
    // on the label column's quick-info line; with the column deleted it is the
    // square's own centred numeral, in the wipe's grammar and at the wipe's size.
    const running = (ms: number) =>
      slotViewModels(viewFor(TORPEDO_HULL, { activeMsLeft: at(0, { [SLOT_BOOST]: ms }) }))[SLOT_BOOST];
    expect(slotNumeral(running(3200))).toBe('4'); // whole seconds, rounded UP
    expect(slotNumeral(running(1400))).toBe('1.4'); // ...and tenths in the last two
    expect(slotNumeral(running(0))).toBe(''); // a window that ended shows nothing
    expect(running(0).state).toBe('readyAbility');
  });

  it('keeps the countdown at EVERY motion level — only the breathing stops', () => {
    // The numeral is motion-independent by construction (slotNumeral takes no
    // motion input at all): the outline may stop moving for accessibility, but
    // the seconds are information.
    const view = viewFor(TORPEDO_HULL, { activeMsLeft: at(0, { [SLOT_BOOST]: 2000 }), motion: 'off' });
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
    const rows = slotViewModels(viewFor(TORPEDO_HULL, { fit: at(false, { [Q]: true }) }));
    expect(rows.map((r) => r.fitFlash)).toEqual(at(false, { [Q]: true }));
  });

  it('is suppressed at motion=off (the toast + tooltip row carry it statically)', () => {
    const fit = at(false, { [SLOT_GUN]: true });
    const on = slotViewModels(viewFor(TORPEDO_HULL, { fit, motion: 'reduced' }));
    const off = slotViewModels(viewFor(TORPEDO_HULL, { fit, motion: 'off' }));
    expect(on[SLOT_GUN].fitFlash).toBe(true);
    expect(off[SLOT_GUN].fitFlash).toBe(false);
  });

  it('routes a fitted CARD to its slot, and a shipwide ladder to no slot at all', () => {
    const loadout = idsFor(MINE_HULL, statsFor(MINE_HULL)); // main battery / boost / mine / empties
    // Story 10.4: the CANNON ladder fits the `gun` row (the drones'), which no
    // captain mounts — the main battery hosts no ladder — so it owns no slot.
    expect(slotForCard(loadout, 'deckGun')).toBeNull();
    expect(slotForCard(loadout, 'navalMines')).toBe(E); // the mine family's slot (Story 10.5)
    // FOULING MINES IS ITS OWN LINE since Story 8.13 (epic-8 amendment 81), so
    // it fits its OWN weapon and routes to the slot carrying THAT — not to the
    // naval rack, which it used to bolt a verb onto. A hull with no fouling
    // rack fitted therefore gets the rank-wide pulse, like any other card for
    // kit it does not carry.
    expect(slotForCard(loadout, 'foulingMines')).toBeNull();
    expect(slotForCard(loadout, 'intel')).toBeNull();
    expect(slotForCard(loadout, 'armor')).toBeNull();
    // A card for kit this hull does not carry owns no slot either (rank-wide).
    expect(slotForCard(loadout, 'heavyTorpedo')).toBeNull();
  });
});

describe('a square shows the build as its TIER numeral, never a tally (amendment 8)', () => {
  it('prints the rung a slot\'s line stands on', () => {
    const cards = ['heavyTorpedo', 'heavyTorpedo'];
    // The stats are FOLDED from the same cards (the tier the square prints is
    // read off them), so the fixture is a build the firewall could produce.
    const stats = statsFor(TORPEDO_HULL, { heavyTorpedo: 2 });
    const rows = slotViewModels(viewFor(TORPEDO_HULL, { cards, stats }));
    expect(rows[Q].tier).toBe(2); // the torpedo's line is at copy 2
  });

  it('spends no glyphs on a count — a deep build prints its RUNG, never a tally', () => {
    const rows = slotViewModels(viewFor(TORPEDO_HULL, {
      cards: Array<string>(12).fill('heavyTorpedo'),
      stats: statsFor(TORPEDO_HULL, { heavyTorpedo: 12 }),
    }));
    // ...and the square still shows ONE number: the rung. An over-stack past
    // the line's cap prints the capped rung — never a 12.
    expect(rows[Q].tier).toBe(Math.min(12, CATALOG.heavyTorpedo.cap));
    expect(rows[Q].tier).toBeLessThanOrEqual(TIER_COLORS.length);
    expect(slotNumeral(rows[Q])).toBe('');
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
    const view = viewFor(TORPEDO_HULL, {
      denied: at(false, { [Q]: true }),
      deniedDegraded: nine(true),
    });
    expect(slotViewModels(view).map((m) => m.degraded)).toEqual(at(false, { [Q]: true }));
    expect(slotViewModels(view).map((m) => m.state === 'denied')).toEqual(at(false, { [Q]: true }));
  });

  it('a denied slot with no verdict animates, exactly as it always has', () => {
    const view = viewFor(TORPEDO_HULL, { denied: at(false, { [SLOT_GUN]: true }) });
    expect(slotFlags(view, SLOT_GUN)).toEqual({ denied: true, activated: false }); // untouched
    expect(slotDegraded(view, SLOT_GUN, true)).toBe(false);
    expect(slotViewModels(view)[SLOT_GUN].degraded).toBe(false);
    expect(slotViewModels(view)[SLOT_GUN].state).toBe('denied'); // and it is still DENIED
  });

  it('a verdict can never change WHICH STATE a row is in', () => {
    // The budget degrades a mark; it never re-classifies one. A degraded denial
    // is still `denied` — same border, same icon, same precedence.
    const view = viewFor(TORPEDO_HULL, {
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
    expect(layout.squares).toHaveLength(HOTBAR_SQUARE_COUNT);
    expect(layout.dimGroups).toHaveLength(1); // the one run of squares (the belt left with Story 10.5)
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

  it('prints NOTHING at tier 0 — every empty', () => {
    expect(tierNumeral(0)).toBe('');
    expect(tierNumeral(9)).toBe('');
    const rows = slotViewModels(viewFor(TORPEDO_HULL, { cards: ['heavyTorpedo', 'heavyTorpedo'] }));
    expect(rows[Q].tier).toBe(2); // the torpedo has climbed two rungs
    expect(rows[R].tier).toBe(0); // ...and an unfitted slot has none to climb
  });

  // REVIEW GATE, CYCLE 147: `effectiveStats` already caps DECK GUN copies at
  // `CATALOG.deckGun.cap`, so the fold itself can never hand `slotTier` a gun
  // tier past 5. This pins `slotTier`'s OWN `Math.min(..., TIER_WORDS.length)`,
  // the second, fail-closed stop, directly: a HAND-BUILT stats object with an impossible
  // `equipment.gun.tier` of 9 — a shape the fold would never produce, but which
  // `slotTier` must still refuse on its own.
  it('clamps slotTier\'s OWN read of an impossible gun tier, independent of the fold', () => {
    const stats = structuredClone(effectiveStats(CONFIG.shipClasses[TORPEDO_HULL], []));
    stats.equipment.gun.tier = 9;
    expect(slotTier(stats, [], 'gun')).toBe(5);
  });

  it('never prints one on the BELT — stock is not a ladder', () => {
    const base = viewFor(TORPEDO_HULL);
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
  holes: number[][];
  polys: number[][];
}

function opsOf(g: Graphics): PaintOp[] {
  const raw = g.context.instructions as {
    action: string;
    data: {
      style?: { color?: number; alpha?: number };
      path?: { instructions: { action: string; data: unknown[] }[] };
      /** A `cut()` hole lands on the preceding fill as its own path. */
      hole?: { instructions: { action: string; data: unknown[] }[] };
    };
  }[];
  return raw.map((ins) => {
    const path = ins.data.path?.instructions ?? [];
    const hole = ins.data.hole?.instructions ?? [];
    return {
      action: ins.action,
      color: ins.data.style?.color ?? -1,
      alpha: ins.data.style?.alpha ?? -1,
      rects: path.filter((q) => q.action === 'rect').map((q) => (q.data as number[]).slice(0, 4)),
      holes: hole.filter((q) => q.action === 'rect').map((q) => (q.data as number[]).slice(0, 4)),
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
  // Child 0 is the blurred GLOW layer (amendment 39), child 1 the squares.
  const glowGfx = root.children[0] as Graphics;
  const ops = opsOf(root.children[1] as Graphics);
  const glowOps = opsOf(glowGfx);
  const texts = root.children.filter((c): c is Text => c instanceof Text);
  return { row, layout, ops, glowOps, glowGfx, texts, words: texts.filter((t) => t.visible).map((t) => t.text) };
}

const sameRect = (r: number[], box: { x: number; y: number; w: number; h: number }): boolean =>
  r[0] === box.x && r[1] === box.y && r[2] === box.w && r[3] === box.h;

// THE TOOLTIP MEMO (review patch P5's key, minus the consumable stock it
// printed — Story 10.5): a cached model is the answer only while the target,
// the id, the stats and the fitted list are all unchanged.
describe('the tooltip memo keys on target, id, stats and cards', () => {
  const stats = statsFor(TORPEDO_HULL);
  const cards = ['heavyTorpedo', 'heavyTorpedo'];
  const cached: TooltipCache = {
    target: Q, id: 'heavyTorpedo', stats, boons: cards,
    model: tooltipModel(Q, 'heavyTorpedo', stats, cards),
  };

  it('hits on unchanged inputs and misses on every changed one', () => {
    expect(tipCacheHit(cached, Q, 'heavyTorpedo', stats, cards)).toBe(true);
    expect(tipCacheHit(null, Q, 'heavyTorpedo', stats, cards)).toBe(false);
    expect(tipCacheHit(cached, E, 'heavyTorpedo', stats, cards)).toBe(false);
    expect(tipCacheHit(cached, Q, 'lightTorpedo', stats, cards)).toBe(false);
    expect(tipCacheHit(cached, Q, 'heavyTorpedo', statsFor(MINE_HULL), cards)).toBe(false);
    expect(tipCacheHit(cached, Q, 'heavyTorpedo', stats, ['heavyTorpedo'])).toBe(false);
  });

  it('is the ONE key the hover memo reads (source pin: no second comparison)', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../render/hotbar.ts'), 'utf8');
    const body = src.slice(src.indexOf('private cachedModel('));
    expect(body.slice(0, 700)).toContain('tipCacheHit(');
  });
});

// --- Story 10.5: the C / V cooldown-ability squares ---------------------------

describe('the C / V squares — two cooldown abilities in the Shift square\'s family', () => {
  const [REPAIR_SQ, SMOKE_SQ] = ABILITY_SQUARES.map(abilitySquare);
  /** A clock far enough past the epoch for any stamp in either direction. */
  const NOW = 10 * abilityCooldownMs('repair');

  it('sit right after R, keyed C and V, carrying their ability as the square\'s id', () => {
    expect(ABILITY_SQUARES.map(abilitySquare)).toEqual([SLOT_COUNT, SLOT_COUNT + 1]);
    expect(SLOT_KEY_GLYPHS.slice(SLOT_COUNT)).toEqual(ABILITY_SQUARES.map((id) => ABILITY_KEY_GLYPHS[id]));
    const rows = slotViewModels(viewFor(TORPEDO_HULL));
    expect(rows[REPAIR_SQ].id).toBe('repair');
    expect(rows[SMOKE_SQ].id).toBe('smoke');
  });

  it('read READY-ABILITY (the Shift skin) when never pressed, with no badge, tier or numeral', () => {
    const rows = slotViewModels(viewFor(TORPEDO_HULL, { serverNowMs: NOW }));
    for (const sq of [REPAIR_SQ, SMOKE_SQ]) {
      expect(rows[sq].state, String(sq)).toBe('readyAbility');
      expect(rows[sq].state).toBe(rows[SLOT_BOOST].state); // the Shift square's own family
      expect([rows[sq].badge, rows[sq].tier, slotNumeral(rows[sq])]).toEqual([null, 0, '']);
    }
  });

  it('COOL off the own block\'s stamps: the shared fraction drives the wipe, the ms left the numeral', () => {
    const left = abilityCooldownMs('repair') / 4;
    const view = viewFor(TORPEDO_HULL, { serverNowMs: NOW, abilityReadyAt: { repair: NOW + left } });
    const rows = slotViewModels(view);
    const repair = rows[REPAIR_SQ];
    expect(repair.state).toBe('cooling');
    expect(repair.reloadMsLeft).toBe(left);
    expect(repair.coolFrac).toBeCloseTo(1 - left / abilityCooldownMs('repair'));
    expect(slotNumeral(repair)).toBe(wipeLabel(left));
    expect(rows[SMOKE_SQ].state).toBe('readyAbility'); // the other square keeps its own clock
  });

  it('abilityCooldownView: ready at and past the stamp, ready with no clock or no stamp', () => {
    expect(abilityCooldownView('smoke', NOW, NOW)).toEqual({ coolFrac: 0, msLeft: 0 });
    expect(abilityCooldownView('smoke', NOW, NOW - 1)).toEqual({ coolFrac: 0, msLeft: 0 });
    expect(abilityCooldownView('smoke', undefined, NOW + 1)).toEqual({ coolFrac: 0, msLeft: 0 });
    expect(abilityCooldownView('smoke', NOW, undefined)).toEqual({ coolFrac: 0, msLeft: 0 });
    const full = abilityCooldownView('smoke', NOW, NOW + abilityCooldownMs('smoke'));
    expect(full.coolFrac).toBe(0); // the press instant: nothing has elapsed yet…
    expect(full.msLeft).toBe(abilityCooldownMs('smoke')); // …and the whole cooldown is left
  });

  it('take the denied and activated one-shots like every square', () => {
    const view = viewFor(TORPEDO_HULL, { denied: at(false, { [REPAIR_SQ]: true }), activated: at(false, { [SMOKE_SQ]: true }) });
    const rows = slotViewModels(view);
    expect(rows[REPAIR_SQ].state).toBe('denied');
    expect(rows[SMOKE_SQ].state).toBe('activated');
  });

  it('are never SELECTED — an ability never primes', () => {
    const rows = slotViewModels(viewFor(TORPEDO_HULL, { primedSlot: REPAIR_SQ }));
    expect(rows[REPAIR_SQ].selected).toBe(false);
  });

  it('open the ability\'s own tooltip — its name and rows, no tier word', () => {
    const stats = statsFor(TORPEDO_HULL);
    for (const sq of [REPAIR_SQ, SMOKE_SQ]) {
      const model = tooltipModel(sq, ABILITY_SQUARES[sq - SLOT_COUNT], stats);
      expect(model?.name, String(sq)).not.toBe('');
      expect(model?.interaction).toBe('');
      expect(model?.stats.length).toBeGreaterThan(0);
    }
  });
});

describe('the cooldown WIPE on the square (ruling 3 / amendment 34)', () => {
  const cooling = viewFor(TORPEDO_HULL, { ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }) });

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
    const stats = twoTubes(TORPEDO_HULL);
    const view: HotbarView = {
      ...viewFor(TORPEDO_HULL),
      stats,
      loadout: idsFor(TORPEDO_HULL, stats),
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
    const kids = root === null || root === undefined ? [] : root.children;
    const lastGfx = kids.map((c) => c instanceof Graphics).lastIndexOf(true);
    const firstText = kids.findIndex((c) => c instanceof Text);
    expect(lastGfx).toBe(1); // the glow layer, then the squares…
    expect(firstText).toBeGreaterThan(lastGfx); // …and every Text sits above both
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
    const active = viewFor(TORPEDO_HULL, {
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
    const { ops, layout } = paint(viewFor(TORPEDO_HULL, { primedSlot: R }));
    const boxOf = (slot: number) => chipRect(layout, slot);
    for (const slot of [1, 2, 3, ...ABILITY_SQUARES.map(abilitySquare)]) {
      const drawn = ops.filter((o) => o.rects.some((r) => sameRect(r, boxOf(slot))));
      expect(drawn.length, String(slot)).toBe(1);
      expect(drawn[0].color, String(slot)).toBe(C.textMuted);
    }
    // THE GHOST: the gun's chip box is laid out (so the row keeps one baseline)
    // and never painted.
    expect(ops.some((o) => o.rects.some((r) => sameRect(r, boxOf(SLOT_GUN))))).toBe(false);
    expect(boxOf(SLOT_GUN).w).toBe(B.chipMinW);
  });

  it('FILLS the selected square\'s chip amber and knocks its glyph out in void', () => {
    const { ops, layout, texts } = paint(viewFor(TORPEDO_HULL, { primedSlot: Q }));
    const filled = ops.filter((o) => o.action === 'fill' && o.rects.some((r) => sameRect(r, chipRect(layout, Q))));
    expect(filled).toHaveLength(1);
    expect(filled[0].color).toBe(C.amber);
    const glyph = texts.find((t) => t.visible && t.text === 'Q');
    expect(glyph?.style.fill).toBe(C.void);
    expect(glyph?.style.fontWeight).toBe('600');
  });

  it('counter-scales the 9px registers at the 90% UI setting, and nothing else', () => {
    const at100 = paint(viewFor(TORPEDO_HULL), 1);
    const at90 = paint(viewFor(TORPEDO_HULL), 0.9);
    const shiftAt = (r: ReturnType<typeof paint>) => r.texts.find((t) => t.visible && t.text === 'Shift');
    expect(shiftAt(at100)?.scale.x).toBeCloseTo(1, 9);
    expect(shiftAt(at90)?.scale.x).toBeCloseTo(microScale(0.9), 9);
  });
});

describe('NO WORDS render on a square (UX-DR40/41)', () => {
  it('shows the key glyphs and nothing else on a live, unfitted bar', () => {
    const view = viewFor(TORPEDO_HULL);
    const { words } = paint(view);
    // The one numeral is the main battery's ready-turret BADGE (Story 10.4: its
    // pool is the turret count), not a word.
    const keys = SLOT_KEY_GLYPHS.filter((g) => g !== '');
    const battery = badgeText(equipmentInfo(view.stats, 'mainBattery'), view.ammo[SLOT_GUN]);
    expect(battery).not.toBeNull();
    expect([...words].sort()).toEqual([...keys, battery].sort());
  });

  it('adds only NUMERALS as the state asks for them — never a name', () => {
    const view = viewFor(TORPEDO_HULL, {
      cards: ['heavyTorpedo'],
      ammo: at(null, { [SLOT_GUN]: { n: 0, reloadMsLeft: 1200 } }),
    });
    const { words } = paint(view);
    // Two numerals ride the battery square here and they never collide: the
    // centred `1.2` is its cooling clock, the badge its ready turrets (none).
    // The `I` beside Q is the torpedo's first copy.
    const keys = SLOT_KEY_GLYPHS.filter((g) => g !== '');
    const battery = badgeText(equipmentInfo(view.stats, 'mainBattery'), view.ammo[SLOT_GUN]);
    expect([...words].sort()).toEqual([...keys, wipeLabel(1200), battery, tierNumeral(1)].sort());
    for (const name of Object.values(EQUIPMENT_NAME)) expect(words).not.toContain(name);
  });
});

// --- THE STOCKED BELT SQUARE (Story 8.7, ruling 15) ----------------------------
//
// The belt is EMPTY in production all through 8.7 (amendment 41 — every
// consumable stub stays set), so these run a consumable id through the view
// model directly. That is the point: the square's whole grammar is pinned now
// so Story 8.8 flips one flag and finds it drawing.
//
// A STACK IS NOT A MAGAZINE. Its `reloadMsLeft` is 0 forever — every copy is one
// use and the only way to get another is another card — so the square can never
// enter the cooling state, which means no wipe, no seconds numeral and no
// dimmed icon. What it shows is READY, the `×n` stock badge, and the denied /
// activated one-shots every square has.

describe('the glyphs the bar draws', () => {
  it('draws a ROD OF ASCLEPIUS for HULL REPAIR (`C`), NO glyph for the STUB line, and invents none', () => {
    // Cycle 162 (Eric 2026-10-01: "a rod of asclepius or a caduceus or
    // something, not a cross"): one upright staff, one serpent winding across
    // it, a small head — replacing Story 8.21's bare plus. Since Story 10.5 it
    // is the `C` ability square's glyph.
    const rod = glyphPaths('repair');
    expect(rod).not.toBeNull();
    const staff = rod!.find((p) => p.kind === 'path' && p.pts.length === 2 && p.pts[0][0] === 0 && p.pts[1][0] === 0);
    expect(staff, 'a vertical staff').toBeDefined();
    expect(rod!.some((p) => p.kind === 'circle'), 'the serpent head').toBe(true);
    const serpent = rod!.find((p) => p.kind === 'path' && p.pts.length > 2);
    expect(serpent, 'a sinuous serpent').toBeDefined();
    // The serpent crosses the staff at least twice — it winds, it is not a line.
    const xs = serpent!.kind === 'path' ? serpent!.pts.map(([x]) => x) : [];
    const crossings = xs.slice(1).filter((x, i) => Math.sign(x) !== Math.sign(xs[i]) && x !== 0).length;
    expect(crossings).toBeGreaterThanOrEqual(2);
    // ...and it is no longer the plus: no horizontal bar through the centre.
    expect(rod!.some((p) => p.kind === 'path' && p.pts.length === 2 && p.pts[0][1] === 0 && p.pts[1][1] === 0)).toBe(false);
    expect(equipmentGlyphSvg('repair', 24)?.tagName.toLowerCase()).toBe('svg');
    // DEPTH CHARGE is a STUB (Story 8.13, epic-8 amendment 83): no mechanism,
    // so no linework — the same blank every other stub consumable renders. No
    // crash, no word, no placeholder — the square is its outline and badge.
    expect(glyphPaths('depthCharge')).toBeNull();
    expect(equipmentGlyphSvg('depthCharge', 24)).toBeNull();
    // ...while a built weapon still has its linework, from the SAME source.
    expect(glyphPaths('heavyTorpedo')).not.toBeNull();
    expect(equipmentGlyphSvg('heavyTorpedo', 24)?.tagName.toLowerCase()).toBe('svg');
  });

  // CYCLE 162 — THE ICON PASS (Eric 2026-10-01): the family glyphs are no
  // longer shared. Each torpedo line and each mine line draws its OWN glyph,
  // all inside the unit box.
  it('gives every torpedo line and every mine line its OWN glyph', () => {
    for (const family of [
      ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'],
      ['navalMines', 'captiveMines', 'foulingMines'],
    ]) {
      const drawn = family.map((id) => glyphPaths(id));
      for (const [i, parts] of drawn.entries()) {
        expect(parts, family[i]).not.toBeNull();
        for (const p of parts!) {
          for (const [x, y] of p.kind === 'path' ? p.pts : [p.c]) {
            expect(Math.abs(x), family[i]).toBeLessThanOrEqual(1 + 1e-9);
            expect(Math.abs(y), family[i]).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
      expect(new Set(drawn.map((d) => JSON.stringify(d))).size, family.join()).toBe(3);
    }
    // ...and the two families are still drawn differently from each other.
    expect(glyphPaths('navalMines')).not.toEqual(glyphPaths('heavyTorpedo'));
    expect(equipmentGlyphSvg('supercavTorpedo', 24)?.tagName.toLowerCase()).toBe('svg');
  });

  // STORY 10.5: FLASH SHELLS and the FOULING SHELL are slot weapons again —
  // each keeps its own drawing, inside the unit box and distinct.
  it('draws FLASH SHELLS and the FOULING SHELL, each distinct, inside the unit box', () => {
    const ids = ['dazzleShells', 'foulingShell'] as const;
    for (const id of ids) {
      const parts = glyphPaths(id);
      expect(parts, id).not.toBeNull();
      for (const part of parts!) {
        const pts = part.kind === 'path' ? part.pts : [part.c];
        for (const [x, y] of pts) expect(Math.max(Math.abs(x), Math.abs(y)), id).toBeLessThanOrEqual(1);
      }
      expect(equipmentGlyphSvg(id, 24)?.tagName.toLowerCase(), id).toBe('svg');
    }
    expect(glyphPaths('dazzleShells')).not.toEqual(glyphPaths('foulingShell'));
    // the retired lines draw nothing (Story 10.5 deleted them)
    for (const gone of ['shieldBlock', 'radarBuoy', 'chaff']) expect(glyphPaths(gone), gone).toBeNull();
  });

  // STORY 9.3 — the MULTI-SPECTRAL COUNTERMEASURE glyph (Eric's pick 2026-10-11).
  // Stricter than the 8.16 check: every circle's WHOLE extent stays in the box.
  it('draws SMOKE (`V`) inside the unit box, distinct from every other glyph', () => {
    const parts = glyphPaths('smoke');
    expect(parts).not.toBeNull();
    for (const part of parts!) {
      if (part.kind === 'circle') {
        const [cx, cy] = part.c;
        expect(Math.max(Math.abs(cx) + part.r, Math.abs(cy) + part.r)).toBeLessThanOrEqual(1);
      } else {
        for (const [x, y] of part.pts) expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(1);
      }
    }
    for (const other of ['repair', 'foulingShell', 'navalMines', 'starShells']) {
      expect(parts, other).not.toEqual(glyphPaths(other));
    }
    expect(equipmentGlyphSvg('smoke', 24)?.tagName.toLowerCase()).toBe('svg');
  });
});

describe('the ammo badge WIDENS to its content (mock `.badge`, ledger :2141)', () => {
  it('keeps the 16px minimum for a single digit and for no badge at all', () => {
    expect(badgeWidth(null)).toBe(CLIENT_CONFIG.hudBar.badge);
    expect(badgeWidth('2')).toBe(CLIENT_CONFIG.hudBar.badge);
  });

  it('grows for a two-digit count', () => {
    expect(badgeWidth('12')).toBeGreaterThan(CLIENT_CONFIG.hudBar.badge);
    // ...and the box the drawer paints grows with it, anchored on the square's
    // right edge exactly as the fixed one was.
    const layout = hudBarLayout(1366, 768);
    const wide = badgeRect(layout, Q, '12');
    const narrow = badgeRect(layout, Q);
    expect(wide.w).toBe(badgeWidth('12'));
    expect(wide.x + wide.w).toBe(narrow.x + narrow.w); // same right edge
  });

  it('leaves the HIT-TEST on the layout, not on the count (the click gate is a '
    + 'function of geometry)', () => {
    const layout = hudBarLayout(1366, 768);
    expect(badgeRect(layout, Q).w).toBe(CLIENT_CONFIG.hudBar.badge);
    expect(badgeRect(layout, E).w).toBe(CLIENT_CONFIG.hudBar.badge);
  });
});

describe('slotForCard — a fit flash lands on its weapon slot', () => {
  it('routes a fit flash to the WEAPON slot, and a shipwide ladder to none', () => {
    const loadout: (EquipmentId | null)[] = ['gun', 'boost', 'heavyTorpedo', null, null];
    expect(slotForCard(loadout, 'heavyTorpedo')).toBe(Q);
    expect(slotForCard(loadout, 'armor')).toBeNull();
  });
});

// SLOT 0 IS THE MAIN BATTERY, SLOT 1 THE SEAT'S SHIFT (Story 10.4). The seat
// gun pick (Story 8.14/8.15) is gone: every captain mounts the hull's main
// battery in slot 0, and the Shift is the captain's PICK, frozen at queue and
// carried on `OwnShip.shift`. main.ts's `slotIdsFor` hands it to the shared
// `slotsWithCards(…, shift)` — the ONE derivation the server fits and re-fits
// from — so the square this row paints is the module it mounted.
describe("slot 0 is the main battery and slot 1 the SEAT'S Shift, replayed as main.ts derives it", () => {
  /** main.ts's `slotIdsFor`, verbatim (the Shift leg included). */
  function slotIdsFor(stats: EffectiveStats, cards: readonly string[], shift: EquipmentId): (EquipmentId | null)[] {
    return slotsWithCards(stats, cards, CATALOG, false, shift as never).map((s) => s.equipmentId);
  }

  it('every hull mounts the main battery in slot 0 and the picked Shift in slot 1, moving no other slot', () => {
    for (const cls of SHIP_CLASS_IDS) {
      for (const shift of SHIFT_IDS) {
        const stats = statsFor(cls);
        const ids = slotIdsFor(stats, FITTED[cls], shift);
        expect(ids[SLOT_GUN], `${cls}/${shift}`).toBe('mainBattery');
        expect(ids[SLOT_BOOST], `${cls}/${shift}`).toBe(shift);
        // ...and the pick addresses slot 1 alone: the rest is the plain card replay.
        const plain = slotsWithCards(stats, FITTED[cls]).map((s) => s.equipmentId);
        expect(ids.slice(2), `${cls}/${shift}`).toEqual(plain.slice(2));
        expect(ids).toHaveLength(SLOT_COUNT);
      }
    }
  });

  it('main.ts really pins the slot from the loadout, not from a literal', () => {
    // The helper above is a copy; this is the pin that keeps the copy honest.
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../main.ts'), 'utf8');
    expect(src).toMatch(/slotsWithCards\(stats, cards, CATALOG, false, shift\)/);
  });
});

describe('the GLOW is a real bloom, not stacked rings (Eric 2026-10-11, epic-9 amendment 39)', () => {
  it('draws every lit square\'s halo as ONE filled ring on the blurred glow layer, in the skin\'s color at its glowAlpha', () => {
    const { glowOps, glowGfx, ops, layout } = paint(viewFor(TORPEDO_HULL));
    expect(glowGfx.filters).toHaveLength(1);
    expect(glowGfx.filters?.[0]).toBeInstanceOf(BlurFilter);
    const skin = slotSkin('readyWeapon');
    const q = layout.squares[Q];
    const pad = skin.glowPx / 2;
    const inflated = { x: q.x - pad, y: q.y - pad, w: q.w + pad * 2, h: q.h + pad * 2 };
    const halo = glowOps.find((o) => o.action === 'fill' && o.color === skin.border && o.alpha === skin.glowAlpha
      && o.rects.some((r) => sameRect(r, inflated)));
    expect(halo).toBeDefined(); // the inflated box, filled once…
    expect(halo?.holes.some((r) => sameRect(r, q))).toBe(true); // …with the square cut out as a hole
    // and NO outline rings around the square on the square layer any more
    const rings = ops.filter((o) => o.action === 'stroke' && o.polys.some((poly) => poly.length === 8 && poly[0] < q.x && poly[1] < q.y && poly[2] > q.x + q.w));
    expect(rings).toHaveLength(0);
  });

  it('an EMPTY square gets no halo at all', () => {
    const { glowOps, layout } = paint(viewFor(TORPEDO_HULL));
    for (const slot of [E, R]) {
      const sq = layout.squares[slot];
      const touching = glowOps.filter((o) => o.rects.some((r) => r[0] <= sq.x && r[1] <= sq.y && r[0] + r[2] >= sq.x + sq.w && r[1] + r[3] >= sq.y + sq.h));
      expect(touching, String(slot)).toHaveLength(0);
    }
  });
});
