// The CTRL spend window (ui/upgradeMenu.ts): the pure offerView() truth table
// and the DOM adapter (row rendering, click → onSpend slot, inert heal row,
// live re-label + auto-hide). jsdom.

import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG, HEAL_CHOICE, UPGRADE_IDS, type OwnShip } from '@salvo/shared';
import { offerView, UpgradeMenu, type OfferView } from '../ui/upgradeMenu.js';

const MAX_HP = 100;

function ownShip(over: Partial<OwnShip> = {}): OwnShip {
  return {
    id: 'me', x: 0, y: 0, heading: 0, speed: 0, hp: 80, alive: true,
    ammo: [], sweep: 0, cls: 'torpedoBoat', upg: [], pts: 1, offer: [0, 1, 2],
    boostUntil: 0,
    ...over,
  };
}

describe('offerView — pure spend-view derivation', () => {
  it('is null with no own ship, while spectating, or with an empty bank', () => {
    expect(offerView(null, MAX_HP, false, false)).toBeNull();
    expect(offerView(ownShip(), MAX_HP, true, false)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), MAX_HP, false, false)).toBeNull();
  });

  it('maps the front offer indices to ids when all are in range', () => {
    const view = offerView(ownShip({ offer: [0, 1, 2] }), MAX_HP, false, false);
    expect(view?.options).toEqual([UPGRADE_IDS[0], UPGRADE_IDS[1], UPGRADE_IDS[2]]);
    expect(view?.pts).toBe(1);
    expect(view?.healHp).toBe(CONFIG.upgradePoints.healHp);
  });

  // FINDING B (version-skew): an out-of-range offer index (a stale tab that
  // hasn't reloaded since a 15th upgrade shipped) used to be dropped from the
  // options array, which COMPACTS it and breaks row->slot alignment — row 1
  // would end up sending the server's slot 2 choice. The fix drops the WHOLE
  // view instead (shortcuts go inert too, since currentOfferView also returns
  // null), so "row k == server slot k" can never be violated.
  it('returns null (drops the whole view) when ANY offer index is out of range', () => {
    expect(offerView(ownShip({ offer: [0, 999, 2] }), MAX_HP, false, false)).toBeNull();
    expect(offerView(ownShip({ offer: [999, 0, 1] }), MAX_HP, false, false)).toBeNull();
  });

  it('canHeal is true only when alive AND below max hp', () => {
    expect(offerView(ownShip({ hp: 80 }), MAX_HP, false, false)?.canHeal).toBe(true);
    expect(offerView(ownShip({ hp: MAX_HP }), MAX_HP, false, false)?.canHeal).toBe(false); // full hp
    expect(offerView(ownShip({ alive: false, hp: 0 }), MAX_HP, false, false)?.canHeal).toBe(false); // dead
  });

  // FINDING A (spend latch): `locked` is threaded straight through from the
  // caller (main.ts's spendInFlight) — offerView stays pure, it just carries
  // the flag into the view so the DOM adapter can dim/inert the rows.
  it('carries the caller-supplied `locked` flag straight through', () => {
    expect(offerView(ownShip(), MAX_HP, false, true)?.locked).toBe(true);
    expect(offerView(ownShip(), MAX_HP, false, false)?.locked).toBe(false);
  });
});

describe('UpgradeMenu — DOM adapter', () => {
  beforeEach(() => document.body.replaceChildren());

  const view = (over: Partial<OfferView> = {}): OfferView => ({
    pts: 1, options: [UPGRADE_IDS[0], UPGRADE_IDS[1], UPGRADE_IDS[2]], canHeal: true, healHp: 25, locked: false, ...over,
  });

  function rows(): HTMLButtonElement[] {
    return [...document.querySelectorAll('#upgrade-menu button')] as HTMLButtonElement[];
  }

  it('renders three offer rows + a heal row, and routes clicks to the right choice', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view());
    const btns = rows();
    expect(btns).toHaveLength(4);
    btns[0].click();
    btns[2].click();
    btns[3].click(); // heal
    expect(spends).toEqual([0, 2, HEAL_CHOICE]);
  });

  it('leaves the heal row inert (no onSpend) when canHeal is false', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ canHeal: false }));
    const heal = rows()[3];
    heal.click();
    expect(spends).toEqual([]); // click did nothing
  });

  it('toggle twice hides the panel', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    expect(menu.visible).toBe(true);
    menu.toggle(view());
    expect(menu.visible).toBe(false);
  });

  it('update() re-labels an open window to a fresh offer', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view({ options: [UPGRADE_IDS[0], UPGRADE_IDS[1], UPGRADE_IDS[2]] }));
    const first = rows()[0].textContent;
    menu.update(view({ options: [UPGRADE_IDS[3], UPGRADE_IDS[4], UPGRADE_IDS[5]] }));
    expect(rows()[0].textContent).not.toBe(first);
  });

  it('update(null) force-hides the window', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.update(null);
    expect(menu.visible).toBe(false);
  });

  it('update() never OPENS a closed window (only bare CTRL / toggle does)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.update(view());
    expect(menu.visible).toBe(false);
  });

  // FINDING A (spend latch): while main.ts's spendInFlight latch is set,
  // offerView carries locked:true — every row (including a healable heal row)
  // must render inert, same treatment as the existing !canHeal row, so a
  // second click can't fire against the stale offer this frame is showing.
  it('locked:true dims/inerts every row, including a normally-clickable heal row', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ locked: true, canHeal: true }));
    for (const btn of rows()) btn.click();
    expect(spends).toEqual([]); // nothing fires while locked
  });

  it('update() re-renders rows live when only `locked` flips (latch clears)', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ locked: true }));
    menu.update(view({ locked: false }));
    rows()[0].click();
    expect(spends).toEqual([0]); // unlocked again — the row is live
  });
});
