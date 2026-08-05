import { describe, it, expect } from 'vitest';
import { MSG, type InputMsg } from '@salvo/shared';
import {
  InputSampler,
  abilityPressDenied,
  buildInput,
  hornPressVerdict,
  primeFireable,
  shouldConsumePrime,
  type Aiming,
} from '../sim/inputSampler.js';
import { KeyboardInput } from '../input/keyboard.js';

const AIM: Aiming = { aim: 0.5, fireSeq: 4, aimDist: 260, slot: 0, fireT: 1234, actSeq: 0, actSlot: 0 };

describe('buildInput', () => {
  it('carries aim/fireSeq/aimDist/slot/fireT from the mouse + prime sample', () => {
    const msg = buildInput(3, { throttle: 1, rudder: -1 }, AIM);
    expect(msg).toEqual({ seq: 3, throttle: 1, rudder: -1, aim: 0.5, fireSeq: 4, aimDist: 260, slot: 0, fireT: 1234, actSeq: 0, actSlot: 0, hornSeq: 0 });
  });

  it('carries a primed slot (the click resolves the skillshot on the wire)', () => {
    const msg = buildInput(3, { throttle: 0, rudder: 0 }, { ...AIM, slot: 1 });
    expect(msg.slot).toBe(1);
  });

  it('carries the honest fire timestamp (D1 fire-time compensation)', () => {
    expect(buildInput(3, { throttle: 0, rudder: 0 }, { ...AIM, fireT: 99 }).fireT).toBe(99);
    expect(buildInput(3, { throttle: 0, rudder: 0 }, { ...AIM, fireT: 0 }).fireT).toBe(0); // no-claim sentinel
  });

  it('carries the ability-activation counters (Story 1.6: actSeq/actSlot, 0-sentinel default)', () => {
    const on = buildInput(3, { throttle: 0, rudder: 0 }, { ...AIM, actSeq: 2, actSlot: 2 });
    expect(on.actSeq).toBe(2);
    expect(on.actSlot).toBe(2);
    const off = buildInput(4, { throttle: 0, rudder: 0 }, AIM);
    expect(off.actSeq).toBe(0); // never pressed -> the explicit sentinel
    expect(off.actSlot).toBe(0);
  });

  it('clamps axes to [-1, 1]', () => {
    const msg = buildInput(1, { throttle: 5, rudder: -7 }, { aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
    expect(msg.throttle).toBe(1);
    expect(msg.rudder).toBe(-1);
  });
});

describe('primeFireable — client-predicted prime consumption', () => {
  it('is false for the gun (slot 0) — nothing to consume, gun is the default', () => {
    expect(primeFireable(0, true, true)).toBe(false);
  });

  it('is true for a primed skillshot that is loaded AND in arc (consumes → gun)', () => {
    expect(primeFireable(1, true, true)).toBe(true);
    expect(primeFireable(2, true, true)).toBe(true);
  });

  it('keeps the prime when reloading (not loaded) or out of arc', () => {
    expect(primeFireable(1, false, true)).toBe(false); // reloading
    expect(primeFireable(1, true, false)).toBe(false); // out of bow arc
    expect(primeFireable(1, false, false)).toBe(false);
  });

  it('consumes the Battleship cannon (slot 1) + star shells (slot 2) primes (Story 1.7)', () => {
    // The gun is universally slot 0, so the slot-0 gun exemption holds on every
    // hull; the BB's two skillshots live at slots 1 & 2 and consume when fired.
    // Their in-arc gate is 360° (fed by weaponArcHit(id) at the call site), so a
    // loaded fire always reads fireable regardless of bearing.
    expect(primeFireable(0, true, true)).toBe(false); // BB gun — never a prime
    expect(primeFireable(1, true, true)).toBe(true); // cannon fires → revert to gun
    expect(primeFireable(2, true, true)).toBe(true); // star shells fire → revert to gun
  });
});

describe('shouldConsumePrime — a dead own ship never consumes the prime', () => {
  it('consumes only when ALIVE and the click predicts fireable', () => {
    expect(shouldConsumePrime(true, 1, true, true)).toBe(true); // alive + fireable
  });

  it('never consumes while not alive, even on an otherwise-fireable click', () => {
    expect(shouldConsumePrime(false, 1, true, true)).toBe(false); // dead / not spawned
    expect(shouldConsumePrime(false, 2, true, true)).toBe(false);
  });

  it('never consumes a non-fireable click regardless of alive (death resets the prime instead)', () => {
    expect(shouldConsumePrime(true, 0, true, true)).toBe(false); // gun is never a prime
    expect(shouldConsumePrime(true, 1, false, true)).toBe(false); // reloading
    expect(shouldConsumePrime(true, 1, true, false)).toBe(false); // out of arc
  });
});

describe('InputSampler', () => {
  it('sends exactly one strictly-monotonic-seq input per sample', () => {
    const sent: { type: string; msg: InputMsg }[] = [];
    const sampler = new InputSampler((type, msg) => sent.push({ type, msg }));
    expect(sampler.lastSeq).toBe(0);
    for (let i = 0; i < 20; i++) sampler.sample({ throttle: 0.5, rudder: 0 }, AIM);
    expect(sent).toHaveLength(20);
    expect(sent.every((s) => s.type === MSG.input)).toBe(true);
    for (let i = 0; i < sent.length; i++) {
      expect(sent[i].msg.seq).toBe(i + 1);
    }
    expect(sampler.lastSeq).toBe(20);
  });

  it('returns the sent message for local prediction', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sample({ throttle: -0.25, rudder: 1 }, AIM);
    expect(msg.seq).toBe(1);
    expect(msg.throttle).toBe(-0.25);
    expect(msg.rudder).toBe(1);
    expect(msg.fireSeq).toBe(AIM.fireSeq);
  });

  it('threads the sampled fireT onto the wire input (D1)', () => {
    const sampler = new InputSampler(() => undefined);
    expect(sampler.sample({ throttle: 0, rudder: 0 }, { ...AIM, fireT: 5000 }).fireT).toBe(5000);
  });

  it('threads the sampled actSeq/actSlot onto the wire input (Story 1.6)', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sample({ throttle: 0, rudder: 0 }, { ...AIM, actSeq: 3, actSlot: 2 });
    expect(msg.actSeq).toBe(3);
    expect(msg.actSlot).toBe(2);
  });
});

describe('InputSampler.sendNeutralNow — preserves the throttle order', () => {
  it('sends the given throttle with rudder zeroed and a monotonic seq', () => {
    const sent: { type: string; msg: InputMsg }[] = [];
    const sampler = new InputSampler((type, msg) => sent.push({ type, msg }));
    sampler.sample({ throttle: 0.5, rudder: -1 }, AIM);
    const msg = sampler.sendNeutralNow(0.5);
    expect(msg).toEqual({
      seq: 2,
      throttle: 0.5,
      rudder: 0,
      aim: AIM.aim,
      fireSeq: AIM.fireSeq,
      aimDist: AIM.aimDist,
      slot: AIM.slot,
      fireT: AIM.fireT,
      actSeq: AIM.actSeq,
      actSlot: AIM.actSlot,
      hornSeq: 0,
    });
    expect(sent).toHaveLength(2);
    expect(sent[1].type).toBe(MSG.input);
    expect(sampler.lastSeq).toBe(2);
  });

  it('zeroes the rudder (the dangerous stale input) but keeps the throttle steaming', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 1, rudder: 1 }, { aim: 1.75, fireSeq: 7, aimDist: 300, slot: 2, fireT: 42, actSeq: 0, actSlot: 0 });
    const msg = sampler.sendNeutralNow(1);
    expect(msg.throttle).toBe(1); // deliberate engine order preserved
    expect(msg.rudder).toBe(0);
    expect(msg.aim).toBe(1.75); // last aim + slot retained
    expect(msg.slot).toBe(2);
  });

  it('re-sends the LAST fireSeq — never 0 after clicks — as the honest "no new clicks" signal', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { aim: 0, fireSeq: 9, aimDist: 120, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
    const msg = sampler.sendNeutralNow(0);
    expect(msg.fireSeq).toBe(9); // NOT reset — the counter states "9 clicks so far, none new"
    expect(msg.aimDist).toBe(120); // last aim distance retained too
  });

  it('sends a click landing in the gap since the last sample (live count wins at hide time)', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { aim: 0, fireSeq: 9, aimDist: 120, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
    // Click #10 lands after the sample but before visibilitychange fires:
    const msg = sampler.sendNeutralNow(0, 10);
    expect(msg.fireSeq).toBe(10); // fires NOW at a ≤1-tick-old aim, not minutes later on refocus
    // And the counter never regresses if the live count is somehow behind:
    expect(sampler.sendNeutralNow(0, 3).fireSeq).toBe(10);
  });

  it('carries the passed fireT for a gap-click (D1)', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { aim: 0, fireSeq: 9, aimDist: 120, slot: 0, fireT: 7000, actSeq: 0, actSlot: 0 });
    // Gap-click at hide time carries its own honest fire instant:
    expect(sampler.sendNeutralNow(0, 10, 8000).fireT).toBe(8000);
  });

  it('falls back to the last-sampled fireT when none is passed (no new click)', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { aim: 0, fireSeq: 9, aimDist: 120, slot: 0, fireT: 7000, actSeq: 0, actSlot: 0 });
    expect(sampler.sendNeutralNow(0).fireT).toBe(7000);
  });

  it('clamps the passed throttle into [-1, 1] like any other input', () => {
    const sampler = new InputSampler(() => undefined);
    expect(sampler.sendNeutralNow(5).throttle).toBe(1);
    expect(sampler.sendNeutralNow(-9).throttle).toBe(-1);
  });

  it('keeps seq strictly increasing across interleaved sample() and sendNeutralNow() calls', () => {
    const sampler = new InputSampler(() => undefined);
    const seqs = [
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).seq,
      sampler.sendNeutralNow(0).seq,
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).seq,
    ];
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('works before any sample() call, defaulting aim/fireSeq/aimDist/slot/fireT to zero', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sendNeutralNow(0);
    expect(msg).toEqual({ seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  });
});

describe('InputSampler.sendNeutralNow — ability counters (Story 1.6, mirrors fireSeq)', () => {
  it('re-sends the LAST actSeq/actSlot as the honest "no new presses" signal', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { ...AIM, actSeq: 4, actSlot: 2 });
    const msg = sampler.sendNeutralNow(0);
    expect(msg.actSeq).toBe(4); // NOT reset — the counter states "4 presses so far, none new"
    expect(msg.actSlot).toBe(2);
  });

  it('sends a press landing in the gap since the last sample (live counter wins at hide time)', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, { ...AIM, actSeq: 4, actSlot: 2 });
    // Press #5 lands after the sample but before visibilitychange fires:
    const msg = sampler.sendNeutralNow(0, undefined, undefined, 5, 2);
    expect(msg.actSeq).toBe(5); // activates NOW, not minutes later on refocus
    expect(msg.actSlot).toBe(2);
    // And the wire counter never regresses if the live count is somehow behind:
    expect(sampler.sendNeutralNow(0, undefined, undefined, 3, 1).actSeq).toBe(5);
    expect(sampler.sendNeutralNow(0).actSlot).toBe(2); // stale live slot never adopted
  });

  it('defaults both counters to the 0 sentinel before any sample or press', () => {
    const sampler = new InputSampler(() => undefined);
    const msg = sampler.sendNeutralNow(0);
    expect(msg.actSeq).toBe(0);
    expect(msg.actSlot).toBe(0);
  });
});

describe('abilityPressDenied — predicted activation verdict (feedback only)', () => {
  it('is denied while dead or while the slot is cooling (no charge)', () => {
    expect(abilityPressDenied(false, true)).toBe(true); // dead
    expect(abilityPressDenied(true, false)).toBe(true); // cooling (charge consumed)
    expect(abilityPressDenied(false, false)).toBe(true);
  });

  it('is allowed when alive with a ready charge', () => {
    expect(abilityPressDenied(true, true)).toBe(false);
  });

  it('is slot-agnostic — the ML fits two abilities and main.ts applies it PER SLOT', () => {

    // Story 1.8: the predicate has no slot term (alive + this slot's charge only),
    // so both ML specials (mine slot 1, decoyBuoy slot 2) gate identically; the
    // per-slot latch/pulse that keeps a denied mine press from flashing the decoy
    // chip lives in main.ts, keyed by the pressed slot's own loaded state.
    const mineLoaded = true;
    const decoyCooling = false;
    expect(abilityPressDenied(true, mineLoaded)).toBe(false); // mine ready → allowed
    expect(abilityPressDenied(true, decoyCooling)).toBe(true); // decoy cooling → denied
  });
});

// --- FINDING A: keyboard queue → sampler wire stream (dual-ability, no collapse) ---

describe('ability activation reaches the wire one-per-input (KeyboardInput + InputSampler)', () => {
  const press = (code: string): void =>
    void window.dispatchEvent(new KeyboardEvent('keydown', { code }));

  /** One sim-tick: main.ts's order — drain one queued press, THEN sample. */
  function tick(kb: KeyboardInput, sampler: InputSampler): InputMsg {
    kb.consumeActivation();
    return sampler.sample(
      { throttle: 0, rudder: 0 },
      { aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: kb.actSeq, actSlot: kb.actSlot },
    );
  }

  it('two different-slot presses in ONE window ride SUCCESSIVE inputs, neither lost', () => {
    // every slot fitted + an ability (isSlotFitted fails closed — it must be wired)
    const kb = new KeyboardInput({ isSlotFitted: () => true, isAbilitySlot: () => true });
    kb.attach();
    const sampler = new InputSampler(() => undefined);
    press('KeyQ'); // slot 1 (mine)
    press('KeyE'); // slot 2 (decoy) — same 50ms window, before any sample
    const a = tick(kb, sampler);
    const b = tick(kb, sampler);
    const c = tick(kb, sampler);
    expect([a.actSeq, a.actSlot]).toEqual([1, 1]); // first press this input
    expect([b.actSeq, b.actSlot]).toEqual([2, 2]); // second press the next input — NOT collapsed
    expect([c.actSeq, c.actSlot]).toEqual([2, 2]); // nothing new — the counter simply repeats
    kb.detach();
  });

  it('actSeq climbs by AT MOST 1 per input (the wire carries one press per input)', () => {
    const kb = new KeyboardInput({ isSlotFitted: () => true, isAbilitySlot: () => true });
    kb.attach();
    const sampler = new InputSampler(() => undefined);
    press('KeyE');
    press('KeyE');
    press('KeyE'); // three in one window
    const seqs = [tick(kb, sampler).actSeq, tick(kb, sampler).actSeq, tick(kb, sampler).actSeq];
    expect(seqs).toEqual([1, 2, 3]); // strictly +1 each, never a jump
    kb.detach();
  });
});

// --- the FOGHORN counter (Story 4.5, amendments 56/58) ----------------------
//
// A plain counter, deliberately NOT the ability FIFO. The whole justification
// is the 1.5s server cooldown: two ACCEPTED honks can never land inside one
// 50ms tick, so there is nothing to queue.

describe('hornSeq — the sampler carries its own honk counter', () => {
  it('sends the 0 "never honked" sentinel until a honk is accepted', () => {
    const sampler = new InputSampler(() => undefined);
    expect(sampler.hornSeq).toBe(0);
    expect(sampler.sample({ throttle: 0, rudder: 0 }, AIM).hornSeq).toBe(0);
  });

  it('advances by exactly one per accepted honk and rides the NEXT input', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.honk();
    expect(sampler.sample({ throttle: 0, rudder: 0 }, AIM).hornSeq).toBe(1);
    sampler.honk();
    sampler.honk();
    expect(sampler.sample({ throttle: 0, rudder: 0 }, AIM).hornSeq).toBe(3);
  });

  it('re-sends the last value as the honest "no new honk" signal', () => {
    const sampler = new InputSampler(() => undefined);
    sampler.honk();
    const seqs = [
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).hornSeq,
      sampler.sample({ throttle: 0, rudder: 0 }, AIM).hornSeq,
    ];
    expect(seqs).toEqual([1, 1]); // the server consumes with max() — a repeat is not a press
  });

  it('carries a gap-honk out on the tab-hide neutral send, not on refocus', () => {
    // The fireSeq treatment, arrived at for free: the counter lives on the
    // sampler, so a press landing in the <=1-tick gap before the tab hid is
    // already reflected in the neutral input.
    const sampler = new InputSampler(() => undefined);
    sampler.sample({ throttle: 0, rudder: 0 }, AIM);
    sampler.honk();
    expect(sampler.sendNeutralNow(0).hornSeq).toBe(1);
  });

  it('is never reset — a monotonic counter is what keeps the next honk audible', () => {
    // The server consumes hornSeq with max() and deliberately does NOT reset
    // lastHornSeq on respawn (world.ts). A client-side reset would make every
    // post-respawn honk read as stale and silently vanish.
    const sampler = new InputSampler(() => undefined);
    sampler.honk();
    sampler.honk();
    sampler.sendNeutralNow(0);
    sampler.sample({ throttle: 0, rudder: 0 }, AIM);
    expect(sampler.hornSeq).toBe(2);
  });
});

describe('hornPressVerdict — what one F press means', () => {
  it('IGNORES the press while spectating or sunk (the server refuses both)', () => {
    expect(hornPressVerdict(true, true, 10_000, 0)).toBe('ignore'); // spectating
    expect(hornPressVerdict(false, false, 10_000, 0)).toBe('ignore'); // sunk
    expect(hornPressVerdict(false, true, 10_000, 0)).toBe('ignore');
  });

  it('HONKS when alive, conning, and the cooldown has elapsed', () => {
    expect(hornPressVerdict(true, false, 0, 0)).toBe('honk'); // 0 = never honked
    expect(hornPressVerdict(true, false, 1500, 1500)).toBe('honk'); // exactly at the boundary
    expect(hornPressVerdict(true, false, 9999, 1500)).toBe('honk');
  });

  it('DENIES a press inside the cooldown — the predicted `denied` cue, nothing sent', () => {
    expect(hornPressVerdict(true, false, 1499, 1500)).toBe('denied');
    expect(hornPressVerdict(true, false, 0, 1500)).toBe('denied');
  });

  it('answers the dead/spectating case BEFORE the cooldown one', () => {
    // A corpse on cooldown must read `ignore`, not `denied`: there is no horn
    // to be denied, and a denial tone would teach a rule the sim does not have.
    expect(hornPressVerdict(false, false, 0, 1500)).toBe('ignore');
  });

  it('is deliberately blind to match phase (the server honks in the ready room)', () => {
    // world.ts consumeHonk has no phase test — it gates on alive/drone/cooldown
    // only — and render/deniedFire.ts records why a client-only phase gate is a
    // bug: it makes the UI contradict what the sim actually did. There is no
    // phase parameter here, and adding one would be the regression.
    expect(hornPressVerdict.length).toBe(4);
  });
});
