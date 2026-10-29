// @vitest-environment jsdom
// Story 10.1 (epic-10 amendment 3) — the port's CONSUMABLES row and its picker.
// Relations only: the row follows the kit, the picker follows the catalog
// (`dealableConsumables()`), and every pick keeps `isConsumableKit` true.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUOY_LINE_IDS,
  CATALOG,
  CONSUMABLE_SLOTS,
  LINE_IDS,
  isStubLine,
  DEFAULT_KIT,
  KIT_SIZE,
  dealableConsumables,
  isConsumableKit,
  type ConsumableKit,
} from '@salvo/shared';
import {
  kitRowModel,
  makeKitRow,
  openKitPicker,
  pickLine,
  pickerModel,
} from '../ui/kitPicker.js';
import { SLOT_KEY_GLYPHS } from '../render/equipmentInfo.js';

const POOL = dealableConsumables();
const ACCENT = { accent: '#11a5d7', accentValue: 0x11a5d7, accentText: '#11a5d7' };

/** Every kit the tests sweep: the default and each rotation of a pool window. */
function sampleKits(): ConsumableKit[] {
  const kits: ConsumableKit[] = [DEFAULT_KIT];
  for (let start = 0; start < POOL.length; start += 1) {
    kits.push(Array.from({ length: KIT_SIZE }, (_, i) => POOL[(start + i) % POOL.length]));
  }
  return kits.filter((k) => isConsumableKit(k));
}

describe('kitRowModel — the four squares', () => {
  it('has KIT_SIZE squares whose kinds equal the kit, in slot order, keyed as the belt is', () => {
    for (const kit of sampleKits()) {
      const row = kitRowModel(kit);
      expect(row).toHaveLength(KIT_SIZE);
      expect(row.map((s) => s.kind)).toEqual([...kit]);
      expect(row.map((s) => s.key)).toEqual(CONSUMABLE_SLOTS.map((slot) => SLOT_KEY_GLYPHS[slot]));
    }
  });
});

describe('pickerModel — every dealable line, one current, the rest of the kit taken', () => {
  it('lists dealableConsumables() in order with exactly the slot line current and the other slots taken', () => {
    for (const kit of sampleKits()) {
      for (let slot = 0; slot < KIT_SIZE; slot += 1) {
        const cards = pickerModel(kit, slot);
        expect(cards.map((c) => c.id)).toEqual(POOL);
        expect(cards.filter((c) => c.state === 'current').map((c) => c.id)).toEqual([kit[slot]]);
        const taken = cards.filter((c) => c.state === 'taken').map((c) => c.id);
        expect(new Set(taken)).toEqual(new Set(kit.filter((_, i) => i !== slot)));
      }
    }
  });
});

describe('the picker follows the catalog — Story 10.9 lists FLASH SHELLS and the four buoys', () => {
  it('lists every non-stub consumable line, the five new ones included, the retired decoy gone', () => {
    const ids = pickerModel(DEFAULT_KIT, 0).map((c) => c.id);
    const consumables = LINE_IDS.filter((id) => CATALOG[id].kind === 'consumable' && !isStubLine(id));
    expect(new Set(ids)).toEqual(new Set(consumables));
    for (const id of ['dazzleShells', ...BUOY_LINE_IDS]) expect(ids, id).toContain(id);
    expect(ids).not.toContain('decoyBuoy');
  });
});

describe('pickLine — the one mutation', () => {
  it('a lit line replaces only slot i, and the kit stays valid', () => {
    for (const kit of sampleKits()) {
      for (let slot = 0; slot < KIT_SIZE; slot += 1) {
        for (const id of POOL.filter((l) => !kit.includes(l))) {
          const next = pickLine(kit, slot, id);
          expect(next[slot]).toBe(id);
          next.forEach((line, i) => {
            if (i !== slot) expect(line).toBe(kit[i]);
          });
          expect(isConsumableKit(next)).toBe(true);
        }
      }
    }
  });

  it('a taken line, the current line, or a non-dealable id is a no-op', () => {
    const kit = DEFAULT_KIT;
    for (let slot = 0; slot < KIT_SIZE; slot += 1) {
      for (const id of kit) expect(pickLine(kit, slot, id)).toEqual(kit);
      expect(pickLine(kit, slot, 'notALine' as never)).toEqual(kit);
    }
  });
});

describe('the DOM row and the picker', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the row renders KIT_SIZE slot buttons that open the picker for their slot', () => {
    const onSlot = vi.fn();
    const row = makeKitRow(onSlot);
    row.paint(DEFAULT_KIT, null);
    const buttons = row.el.querySelectorAll<HTMLButtonElement>('button[data-slot]');
    expect(buttons).toHaveLength(KIT_SIZE);
    buttons[KIT_SIZE - 1].click();
    expect(onSlot).toHaveBeenCalledWith(KIT_SIZE - 1);
  });

  it('a pick on a lit card hands back the new kit and closes; a taken card is inert', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onPick = vi.fn();
    const onClose = vi.fn();
    const slot = 2;
    openKitPicker({ host, kit: DEFAULT_KIT, slot, accent: ACCENT, onPick, onClose });
    const taken = DEFAULT_KIT.find((_, i) => i !== slot)!;
    host.querySelector<HTMLButtonElement>(`[data-line="${taken}"]`)!.click();
    expect(onPick).not.toHaveBeenCalled();
    const lit = POOL.find((l) => !DEFAULT_KIT.includes(l))!;
    host.querySelector<HTMLButtonElement>(`[data-line="${lit}"]`)!.click();
    expect(onPick).toHaveBeenCalledWith(pickLine(DEFAULT_KIT, slot, lit));
    expect(host.querySelector('[data-kit-picker]')).toBeNull();
  });

  it('ESC (the handle key) and the dim close without a pick; the picker never stacks', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onPick = vi.fn();
    const onClose = vi.fn();
    const first = openKitPicker({ host, kit: DEFAULT_KIT, slot: 0, accent: ACCENT, onPick, onClose });
    openKitPicker({ host, kit: DEFAULT_KIT, slot: 1, accent: ACCENT, onPick, onClose });
    expect(host.querySelectorAll('[data-kit-picker]')).toHaveLength(1);
    expect(first.isOpen()).toBe(false);
    const second = openKitPicker({ host, kit: DEFAULT_KIT, slot: 1, accent: ACCENT, onPick, onClose });
    second.key(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.querySelector('[data-kit-picker]')).toBeNull();
    openKitPicker({ host, kit: DEFAULT_KIT, slot: 3, accent: ACCENT, onPick, onClose });
    host.querySelector<HTMLElement>('[data-kit-dim]')!.click();
    expect(host.querySelector('[data-kit-picker]')).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});
