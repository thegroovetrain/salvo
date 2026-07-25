// The TAB-toggled refit modal (ui/upgradeMenu.ts, Story 2.1): the pure
// offerView() truth table (REPAIR/heal deleted end-to-end) and the DOM adapter
// (digit-chip card rows, click → onSpend choice, focus hygiene, live re-label
// + auto-hide). jsdom.

import { describe, it, expect, beforeEach } from 'vitest';
import { UPGRADE_IDS, type OwnShip } from '@salvo/shared';
import { offerView, UpgradeMenu, type OfferView } from '../ui/upgradeMenu.js';

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
    expect(offerView(null, false, false)).toBeNull();
    expect(offerView(ownShip(), true, false)).toBeNull(); // spectating
    expect(offerView(ownShip({ pts: 0, offer: [] }), false, false)).toBeNull();
  });

  it('maps the front offer indices to ids when all are in range — no heal row anywhere', () => {
    const view = offerView(ownShip({ offer: [0, 1, 2] }), false, false);
    expect(view?.options).toEqual([UPGRADE_IDS[0], UPGRADE_IDS[1], UPGRADE_IDS[2]]);
    expect(view?.pts).toBe(1);
    // Story 2.1 ("1-4 cards, no repair"): the view carries ONLY cards — the
    // canHeal/healHp fields left with the REPAIR spend.
    expect(view && 'canHeal' in view).toBe(false);
    expect(view && 'healHp' in view).toBe(false);
  });

  // FINDING B (version-skew): an out-of-range offer index (a stale tab that
  // hasn't reloaded since a 15th upgrade shipped) used to be dropped from the
  // options array, which COMPACTS it and breaks row->slot alignment — row 1
  // would end up sending the server's slot 2 choice. The fix drops the WHOLE
  // view instead (digit picks go inert too, since currentOfferView also
  // returns null), so "row k == server slot k" can never be violated.
  it('returns null (drops the whole view) when ANY offer index is out of range', () => {
    expect(offerView(ownShip({ offer: [0, 999, 2] }), false, false)).toBeNull();
    expect(offerView(ownShip({ offer: [999, 0, 1] }), false, false)).toBeNull();
  });

  it('is available while DEAD in the waiting phase (builds persist across respawns)', () => {
    expect(offerView(ownShip({ alive: false, hp: 0 }), false, false)).not.toBeNull();
  });

  // FINDING A (spend latch): `locked` is threaded straight through from the
  // caller (main.ts's spendInFlight) — offerView stays pure, it just carries
  // the flag into the view so the DOM adapter can dim/inert the rows.
  it('carries the caller-supplied `locked` flag straight through', () => {
    expect(offerView(ownShip(), false, true)?.locked).toBe(true);
    expect(offerView(ownShip(), false, false)?.locked).toBe(false);
  });
});

describe('UpgradeMenu — DOM adapter (TAB modal)', () => {
  beforeEach(() => document.body.replaceChildren());

  const view = (over: Partial<OfferView> = {}): OfferView => ({
    pts: 1, options: [UPGRADE_IDS[0], UPGRADE_IDS[1], UPGRADE_IDS[2]], locked: false, ...over,
  });

  function rows(): HTMLButtonElement[] {
    return [...document.querySelectorAll('#upgrade-menu button')] as HTMLButtonElement[];
  }

  it('renders EXACTLY the card rows (no REPAIR row) and routes clicks to the right choice', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view());
    const btns = rows();
    expect(btns).toHaveLength(3); // 3-card offer → 3 rows, nothing else
    btns[0].click();
    btns[2].click();
    expect(spends).toEqual([0, 2]);
  });

  it('each row leads with its digit key-chip (1-based, matching the pick keys)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const chips = rows().map((b) => b.querySelector('span')?.textContent);
    expect(chips).toEqual(['1', '2', '3']);
  });

  it('card buttons never retain focus: mousedown is prevented and click blurs', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    const btn = rows()[0];
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const notPrevented = btn.dispatchEvent(down);
    expect(notPrevented).toBe(false); // preventDefault — focus never acquired on click
    btn.focus(); // keyboard-path focus (belt-and-braces)
    btn.click();
    expect(document.activeElement).not.toBe(btn); // click blurs — Space/Enter can't re-trigger
  });

  it('toggle twice hides the panel (TAB open / TAB close-without-choosing)', () => {
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

  it('update(null) force-hides the window (spend emptied the bank / spectate)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.toggle(view());
    menu.update(null);
    expect(menu.visible).toBe(false);
  });

  it('update() never OPENS a closed window (only the TAB toggle does)', () => {
    const menu = new UpgradeMenu(() => {});
    menu.update(view());
    expect(menu.visible).toBe(false);
  });

  // FINDING A (spend latch): while main.ts's spendInFlight latch is set,
  // offerView carries locked:true — every row must render inert so a second
  // click can't fire against the stale offer this frame is showing.
  it('locked:true dims/inerts every row', () => {
    const spends: number[] = [];
    const menu = new UpgradeMenu((c) => spends.push(c));
    menu.toggle(view({ locked: true }));
    for (const btn of rows()) {
      expect(btn.disabled).toBe(true);
      btn.click();
    }
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
