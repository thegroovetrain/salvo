// WEAPON SELECT (Eric 2026-11-23): the PRIME | TOGGLE revert rule over the
// PREDICTED stock (sim/toggleSelect.ts). Behavioural: a small client harness
// plays clicks, server acks and the per-tick backstop through the module's own
// functions, the way main.ts wires them, and asserts when the release revert
// is armed.

import { describe, expect, it } from 'vitest';
import type { WeaponSelectMode } from '../settings/store.js';
import { predictedStock, recordShot, toggleBackstop, TOGGLE_IDLE, type ToggleState } from '../sim/toggleSelect.js';

const SLOT = 2;
const OTHER = 3;

/** The client side of one session: the server's stock per slot, the frame's
 *  ackSeq, the mouse's click / release counters and the input seq. */
class Harness {
  st: ToggleState = TOGGLE_IDLE;
  server = new Map<number, number>();
  ackSeq = 0;
  seq = 0;
  clickCount = 0;
  released = 0;
  primed = SLOT;
  /** Every click seq an arm was issued for, in order. */
  armed: number[] = [];

  constructor(public mode: WeaponSelectMode, stock: number) {
    this.server.set(SLOT, stock);
  }

  /** A new click on the primed slot, riding the next input seq. */
  click(fireable = true): void {
    this.seq += 1;
    this.clickCount += 1;
    const r = recordShot(this.st, {
      fireable,
      mode: this.mode,
      slot: this.primed,
      seq: this.seq,
      clickSeq: this.clickCount,
      serverN: this.server.get(this.primed) ?? 0,
      ackSeq: this.ackSeq,
    });
    this.st = r.state;
    if (r.arm) this.armed.push(this.clickCount);
  }

  release(): void {
    this.released = this.clickCount;
  }

  /** A frame acking every input sent so far, with the server's count for `slot`. */
  ack(slot: number, n: number): void {
    this.ackSeq = this.seq;
    this.server.set(slot, n);
  }

  tick(): void {
    const r = toggleBackstop(this.st, {
      mode: this.mode,
      primedSlot: this.primed,
      serverStock: (s) => this.server.get(s) ?? 0,
      ackSeq: this.ackSeq,
      clickCount: this.clickCount,
      releasedClickSeq: this.released,
    });
    this.st = r.state;
    if (r.armSeq !== null) this.armed.push(r.armSeq);
  }

  stock(): number {
    return predictedStock(this.st, this.primed, this.server.get(this.primed) ?? 0, this.ackSeq);
  }
}

describe('TOGGLE: a pool of N keeps the slot until the shot that empties it', () => {
  const N = 3;

  it('all N clicks inside one round trip (no ack advances): shots 1..N-1 keep the slot, shot N arms', () => {
    const h = new Harness('TOGGLE', N);
    for (let i = 1; i < N; i += 1) {
      h.click();
      h.release();
      h.tick();
      expect(h.armed).toEqual([]);
    }
    h.click();
    expect(h.armed).toEqual([h.clickCount]);
  });

  it('with an ack between every click: the same answer', () => {
    const h = new Harness('TOGGLE', N);
    for (let i = 1; i < N; i += 1) {
      h.click();
      h.release();
      h.ack(SLOT, N - i);
      h.tick();
      expect(h.armed).toEqual([]);
    }
    h.click();
    expect(h.armed).toEqual([h.clickCount]);
  });

  it('a single-round weapon arms on its one shot, exactly like PRIME', () => {
    const h = new Harness('TOGGLE', 1);
    h.click();
    expect(h.armed).toEqual([1]);
  });
});

describe('PRIME', () => {
  it('arms on every fireable click, whatever the stock', () => {
    const h = new Harness('PRIME', 3);
    h.click();
    h.release();
    h.click();
    expect(h.armed).toEqual([1, 2]);
  });
});

describe('a denied click', () => {
  it('records nothing and arms nothing, in both modes', () => {
    for (const mode of ['PRIME', 'TOGGLE'] as const) {
      const h = new Harness(mode, 2);
      const before = h.st;
      h.click(false);
      expect(h.st).toBe(before);
      expect(h.stock()).toBe(2);
      expect(h.armed).toEqual([]);
    }
  });
});

describe('the backstop', () => {
  it('drops the watch when another slot is selected', () => {
    const h = new Harness('TOGGLE', 3);
    h.click();
    h.release();
    h.primed = OTHER;
    h.tick();
    expect(h.st.watch).toBeNull();
    // ...so the server's count reaching 0 afterwards arms nothing.
    h.primed = SLOT;
    h.ack(SLOT, 0);
    h.tick();
    expect(h.armed).toEqual([]);
  });

  it('drops the watch when the mode leaves TOGGLE', () => {
    const h = new Harness('TOGGLE', 3);
    h.click();
    h.mode = 'PRIME';
    h.tick();
    expect(h.st.watch).toBeNull();
  });

  it('arms when the server stock later reads 0 after a stale-high click', () => {
    const h = new Harness('TOGGLE', 3); // the client believes 3 are loaded...
    h.click();
    expect(h.armed).toEqual([]);
    h.ack(SLOT, 0); // ...but the acking frame says that shot was the last
    h.tick();
    expect(h.armed).toEqual([1]); // the emptying click, still held, owes the revert
  });

  it('once the emptying click is released, the revert is owed by the latest click', () => {
    const h = new Harness('TOGGLE', 3);
    h.click();
    h.release();
    h.ack(SLOT, 0);
    h.tick();
    expect(h.armed).toEqual([h.released]); // released already: the arm pays at once
  });
});

describe('predictedStock', () => {
  it('subtracts the slot\'s unacked shots from the server count and prunes acked ones', () => {
    const h = new Harness('TOGGLE', 3);
    h.click();
    h.click();
    expect(h.stock()).toBe(1);
    h.ack(SLOT, 1); // the server has both now
    h.tick();
    expect(h.st.shots).toEqual([]);
    expect(h.stock()).toBe(1);
  });

  it('never reads below 0', () => {
    const h = new Harness('TOGGLE', 1);
    h.click();
    h.click();
    expect(h.stock()).toBe(0);
  });
});
