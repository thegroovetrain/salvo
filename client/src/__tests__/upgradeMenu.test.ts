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
    weapon: 0, ammo: [], sweep: 0, cls: 'cruiser', upg: [], pts: 1, offer: [0, 1, 2],
    ...over,
  };
}

describe('offerView — pure spend-view derivation', () => {
  it('is null with no own ship, while spectating, or with an empty bank', () => {
    expect(offerView(null, MAX_HP, false)).toBeNull();
    expect(offerView(ownShip(), MAX_HP, true)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), MAX_HP, false)).toBeNull();
  });

  it('maps the front offer indices to ids, skipping any out-of-range index', () => {
    const view = offerView(ownShip({ offer: [0, 999, 2] }), MAX_HP, false);
    expect(view?.options).toEqual([UPGRADE_IDS[0], UPGRADE_IDS[2]]);
    expect(view?.pts).toBe(1);
    expect(view?.healHp).toBe(CONFIG.upgradePoints.healHp);
  });

  it('canHeal is true only when alive AND below max hp', () => {
    expect(offerView(ownShip({ hp: 80 }), MAX_HP, false)?.canHeal).toBe(true);
    expect(offerView(ownShip({ hp: MAX_HP }), MAX_HP, false)?.canHeal).toBe(false); // full hp
    expect(offerView(ownShip({ alive: false, hp: 0 }), MAX_HP, false)?.canHeal).toBe(false); // dead
  });
});

describe('UpgradeMenu — DOM adapter', () => {
  beforeEach(() => document.body.replaceChildren());

  const view = (over: Partial<OfferView> = {}): OfferView => ({
    pts: 1, options: [UPGRADE_IDS[0], UPGRADE_IDS[1], UPGRADE_IDS[2]], canHeal: true, healHp: 25, ...over,
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
});
