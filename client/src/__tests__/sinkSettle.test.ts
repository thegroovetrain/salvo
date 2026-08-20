// THE SINKING BEAT (Story 5.2 fix, Eric ruling 2026-08-13) — the kill flash at
// sink-entry and the progressive settle across the window, tested where this
// suite tests everything: as PURE functions of (elapsed, window), never through
// Pixi.
//
// The properties that matter, and why each is here rather than left to the eye:
//   • t=0 IS NOT THE WRECK STATE. Epic-5 amendment 18 moved the wreck look off
//     sink-entry precisely because a hull that is still turning and shooting
//     must not render dead. The settle may not quietly undo that.
//   • FOUNDER IS THE WRECK STATE EXACTLY. The deferred crimson plume lands on
//     the founder tick; if the ramp's terminal value were even a rounding step
//     off `markSunk`'s, the handover would pop on every kill in the game.
//   • MONOTONIC. A hull that brightened back up mid-window would read as a
//     revival, which nothing in the sim can produce.
//   • FAILS CLOSED. A corrupt timestamp renders the terminal truth (the hull IS
//     gone), never a live-looking hull that is actually sunk.
//   • MOTION-OFF DEGRADES TO A STILL, LEGIBLE STATE. The flash is suppressed
//     whole (the shipped rule); the settle — a monotonic five-second ramp, not
//     a pulse — keeps carrying the information at every tier.

import { afterEach, describe, it, expect } from 'vitest';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { ownSettle, settleProgress, settleToDeadline, spectateSettle } from '../render/sinkSettle.js';
import { FALLBACK_STYLE, ShipView, hullLook, setHullFlashGate } from '../render/ships.js';
import { WorldFlashGate } from '../render/effects.js';
import { createFlashBudget } from '../render/flashBudget.js';
import { motionIntensity, settings } from '../settings/store.js';

const SHIP = CLIENT_CONFIG.ship;
const FB = CLIENT_CONFIG.flashBudget;
const WINDOW = CONFIG.ship.sinkingWindowMs;
const SINCE = 10_000;
const FOUNDER = SINCE + WINDOW;

afterEach(() => {
  setHullFlashGate(null); // module-level shared state — always unwire
  settings.set({ motion: 'full' });
});

describe('settleProgress — the window fraction', () => {
  it('is 0 at sink-entry and exactly 1 at the founder deadline', () => {
    expect(settleProgress(SINCE, SINCE)).toBe(0);
    expect(settleProgress(SINCE, FOUNDER)).toBe(1);
  });

  it('rises monotonically across the window, and 0/1 are the only endpoints', () => {
    let prev = -1;
    for (let t = SINCE; t <= FOUNDER; t += 50) {
      const p = settleProgress(SINCE, t);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
    expect(settleProgress(SINCE, SINCE + WINDOW / 2)).toBeCloseTo(0.5, 9);
  });

  it('clamps in BOTH directions — past founder holds 1, clock skew holds 0', () => {
    expect(settleProgress(SINCE, FOUNDER + 60_000)).toBe(1);
    // `now` before sink-entry: a clock estimate that ran backwards must never
    // produce a negative (which would BRIGHTEN a hull past its alive look).
    expect(settleProgress(SINCE, SINCE - 5_000)).toBe(0);
  });

  it('fails CLOSED on a corrupt timestamp — NaN renders the terminal state', () => {
    // The opposite direction from `sinkingRemaining`'s own NaN rule, and
    // deliberately: nothing asks this module about a hull that has not already
    // been declared sunk, so the safe answer is "fully foundered", never "looks
    // alive". See render/sinkSettle.ts's header.
    expect(settleProgress(NaN, SINCE)).toBe(1);
    expect(settleProgress(SINCE, NaN)).toBe(1);
    expect(settleProgress(NaN, NaN)).toBe(1);
  });

  it('settleToDeadline is the same ramp read off the founder deadline', () => {
    // The enemy path never learns the self-private `sinkingUntil`; it holds the
    // deadline it derived from the event's arrival time instead.
    expect(settleToDeadline(FOUNDER, SINCE)).toBe(0);
    expect(settleToDeadline(FOUNDER, FOUNDER)).toBe(1);
    for (const t of [SINCE + 1_000, SINCE + 2_500, SINCE + 4_999]) {
      expect(settleToDeadline(FOUNDER, t)).toBeCloseTo(settleProgress(SINCE, t), 12);
    }
  });
});

describe('hullLook across the settle — no pop at either end', () => {
  const ALIVE = hullLook(0, 0, 1);
  const WRECK = hullLook(0, 1, 1);

  it('t=0 is the ALIVE look, byte for byte — the amendment-18 rule survives', () => {
    // The defect amendment 18 fixed was a hull rendering "already dead" while it
    // was still turning and shooting. The settle must leave sink-entry looking
    // exactly as it did one tick earlier.
    expect(ALIVE).toEqual({ tint: CLIENT_CONFIG.colors.white, alpha: 1, scale: 1 });
  });

  it('founder is the WRECK look, byte for byte — markSunk latches a match', () => {
    // Since amendment 32 the plume no longer lands here, so this equality is
    // the ONLY thing keeping founder from popping: `markSunk` is `setSink(1)`,
    // which must be exactly where the ramp already arrived.
    expect(WRECK).toEqual({ tint: SHIP.sunkTint, alpha: SHIP.sunkAlpha, scale: SHIP.sunkScale });
  });

  it('every channel is monotonic from alive to wreck', () => {
    const ch = (c: number, shift: number): number => (c >> shift) & 0xff;
    let prev = hullLook(0, 0, 1);
    for (let i = 1; i <= 100; i++) {
      const look = hullLook(0, i / 100, 1);
      expect(look.alpha).toBeLessThanOrEqual(prev.alpha);
      expect(look.scale).toBeLessThanOrEqual(prev.scale);
      for (const shift of [16, 8, 0]) {
        expect(ch(look.tint, shift), `channel ${shift} at ${i}%`).toBeLessThanOrEqual(ch(prev.tint, shift));
      }
      prev = look;
    }
  });

  it('mid-window is neither endpoint — the hull is visibly GOING, not gone', () => {
    const mid = hullLook(0, 0.5, 1);
    expect(mid.alpha).toBeGreaterThan(SHIP.sunkAlpha);
    expect(mid.alpha).toBeLessThan(1);
    expect(mid.scale).toBeGreaterThan(SHIP.sunkScale);
    expect(mid.scale).toBeLessThan(1);
    expect(mid.tint).not.toBe(SHIP.sunkTint);
    expect(mid.tint).not.toBe(CLIENT_CONFIG.colors.white);
  });

  it('clamps a nonsense settle instead of overshooting the wreck', () => {
    expect(hullLook(0, 4, 1)).toEqual(WRECK);
    expect(hullLook(0, -1, 1)).toEqual(ALIVE);
    expect(hullLook(0, NaN, 1)).toEqual(ALIVE); // a NaN CHANNEL is not a NaN clock
  });

  it('the sight fade still multiplies through the settle', () => {
    expect(hullLook(0, 1, 0.5).alpha).toBeCloseTo(SHIP.sunkAlpha * 0.5, 9);
    expect(hullLook(0, 0.5, 0).alpha).toBe(0);
  });
});

describe('ShipView — the founder handover is a continuation, not a step', () => {
  it('setSink(1) and setDowned(true) leave the view in the SAME state', () => {
    // `ContactViews.markSunk` (the founder beat) is `setDowned(true)`, and the
    // ramp arrives at `setSink(1)` on the same tick. If these ever diverge,
    // every kill in the game pops at five seconds.
    const ramped = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    const snapped = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    ramped.update(0, 0, 0);
    snapped.update(0, 0, 0);
    ramped.setSink(1);
    snapped.setDowned(true);
    expect(ramped.gfx.tint).toBe(snapped.gfx.tint);
    expect(ramped.gfx.alpha).toBe(snapped.gfx.alpha);
    expect(ramped.gfx.scale.x).toBe(snapped.gfx.scale.x);
    for (const v of [ramped, snapped]) v.destroy();
  });

  it('a settling hull sits between the two, and a respawn restores it whole', () => {
    const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    v.update(0, 0, 0);
    v.setSink(0.5);
    expect(v.gfx.alpha).toBeLessThan(1);
    expect(v.gfx.alpha).toBeGreaterThan(SHIP.sunkAlpha);
    expect(v.gfx.scale.x).toBeLessThan(1);
    v.setDowned(false); // markSpawn
    expect(v.gfx.alpha).toBe(1);
    expect(v.gfx.scale.x).toBe(1);
    v.destroy();
  });

  it('the settle applies WITHOUT a fresh pose — a dry snapshot buffer cannot freeze it', () => {
    const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    v.update(0, 0, 0);
    const before = v.gfx.alpha;
    v.setSink(0.8); // no update() in between
    expect(v.gfx.alpha).toBeLessThan(before);
    v.destroy();
  });
});

describe('the kill flash — the shipped hit-flash channel, held longer', () => {
  it('lasts sinkFlashMs, which is longer than a hit and is the ratified 300ms floor', () => {
    // 300ms is EXPERIENCE.md's same-source flash floor, so one kill flash fills
    // exactly one floor slot and can never overlap the hit that preceded it.
    expect(SHIP.sinkFlashMs).toBe(CLIENT_CONFIG.gunnery.hitCallToneFloorMs);
    expect(SHIP.sinkFlashMs).toBeGreaterThan(SHIP.flashMs);
    const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    v.update(0, 0, 0);
    // BRACKET the call rather than sampling once. `sinkFlash()` stamps its
    // deadline from its OWN performance.now(), so a single `t0` taken before it
    // is a LOWER bound on that stamp, never the stamp itself — asserting
    // expiry at `t0 + sinkFlashMs + 1` raced the real deadline and failed under
    // full-suite load (it passed in isolation, which is exactly how this class
    // of flake hides). `before <= stamp <= after` holds by construction, so
    // each assertion uses the end of the bracket that makes it conservative.
    const before = performance.now();
    v.sinkFlash();
    const after = performance.now();
    // Still lit past a hit's life: `before` under-estimates the stamp, so this
    // instant is no later than it would be against the true deadline.
    expect(v.flashIntensityAt(before + SHIP.flashMs + 1)).toBe(1);
    // ...and bounded: `after` over-estimates the stamp, so this instant is
    // strictly past the true deadline however long the call took.
    expect(v.flashIntensityAt(after + SHIP.sinkFlashMs + 1)).toBe(0);
    v.destroy();
  });

  it('motion OFF suppresses the flash entirely — and the SETTLE still runs', () => {
    // The degradation contract: no strobe, no bloom, nothing animated — but the
    // information does not vanish, because the settle is a monotonic state ramp
    // rather than a pulse, and is not motion-gated (render/ships.ts hullLook).
    settings.set({ motion: 'off' });
    const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    v.update(0, 0, 0);
    v.sinkFlash();
    expect(v.flashIntensityAt(performance.now())).toBe(0);
    v.setSink(0.5);
    expect(v.gfx.alpha).toBeCloseTo(hullLook(0, 0.5, 1).alpha, 9);
    v.setSink(1);
    expect(v.gfx.tint).toBe(SHIP.sunkTint); // the wreck still arrives, statically
    v.destroy();
  });

  it('motion REDUCED halves the strength and keeps the full duration', () => {
    settings.set({ motion: 'reduced' });
    const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
    v.update(0, 0, 0);
    const t0 = performance.now();
    v.sinkFlash();
    expect(v.flashIntensityAt(t0)).toBeCloseTo(motionIntensity('reduced'), 9);
    expect(v.flashIntensityAt(t0 + SHIP.sinkFlashMs - 1)).toBeCloseTo(motionIntensity('reduced'), 9);
    v.destroy();
  });

  it('claims the SAME aggregate budget as the hit flash, and degrades not deletes', () => {
    const budget = createFlashBudget();
    setHullFlashGate(new WorldFlashGate(budget, {
      worldToScreen: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
      screenCenter: { x: 400, y: 300 },
    }, () => 1_000));
    const hulls = Array.from({ length: FB.maxPerSecond + 2 }, (_, i) => {
      const v = new ShipView(FALLBACK_STYLE, 'torpedoBoat');
      v.update(100 + i, 100, 0); // one region
      return v;
    });
    for (const h of hulls) h.sinkFlash();
    const lit = hulls.map((h) => h.flashIntensityAt(performance.now()));
    expect(lit.filter((v) => v === 1)).toHaveLength(FB.maxPerSecond);
    for (const v of lit.slice(FB.maxPerSecond)) expect(v).toBeCloseTo(FB.degradeAlphaFactor, 10);
    for (const v of lit) expect(v).toBeGreaterThan(0); // a mark, never a deletion
    for (const h of hulls) h.destroy();
  });
});

describe('ownSettle — the hull the player is still fighting from', () => {
  const sinking = (until: number): { alive: boolean; sinkingUntil: number } => ({ alive: false, sinkingUntil: until });
  const CAP = SHIP.ownSettleMax;

  it('is 0 while alive, and 0 at the instant of sink-entry', () => {
    expect(ownSettle({ alive: true }, SINCE)).toBe(0);
    expect(ownSettle(sinking(FOUNDER), SINCE)).toBe(0);
  });

  it('never travels past the cap, at any point in the window or after it', () => {
    for (let t = SINCE; t <= FOUNDER + 10_000; t += 100) {
      expect(ownSettle(sinking(FOUNDER), t)).toBeLessThanOrEqual(CAP);
    }
    expect(ownSettle(sinking(FOUNDER), FOUNDER)).toBeCloseTo(CAP, 12);
  });

  it('holds AT the cap past founder — no pop in the gap before the spec frame', () => {
    // Our founder tick and the `spec` frame that hands the screen to the
    // spectate path are ~½ RTT apart; completing the ramp there would flash the
    // hull to full wreck on the way out. The spectate path picks the ramp back
    // up from this exact value (see `spectateSettle` below) — since Story 5.3
    // the own wreck STAYS drawn, so nothing hides it and this hold is the whole
    // gap, not the whole spectate period (epic-7 amendment 29).
    const at = ownSettle(sinking(FOUNDER), FOUNDER);
    expect(ownSettle(sinking(FOUNDER), FOUNDER + 500)).toBe(at);
    expect(ownSettle({ alive: false }, FOUNDER)).toBe(CAP); // dead with no window
  });

  it('stays clearly legible: the personal hue keeps most of its colour at the cap', () => {
    // `sunkTint` has zero green and blue and a Pixi tint MULTIPLIES, so a fully
    // settled cyan/lime/spring hull renders black — which is what the own hull
    // used to SNAP to for the whole window. The cap is what stops that.
    const look = hullLook(0, CAP, 1);
    for (const shift of [8, 0]) {
      expect((look.tint >> shift) & 0xff, `channel ${shift}`).toBeGreaterThan(0x99);
    }
    expect(look.alpha).toBeGreaterThan(0.8);
    expect(CAP).toBeLessThan(1); // the cap is a cap
  });

  it('a missing own ship settles nothing — an absent hull is not a dying one', () => {
    expect(ownSettle(null, SINCE)).toBe(0);
    expect(ownSettle(undefined, SINCE)).toBe(0);
  });
});

// THE CONTINUATION (Eric ruling 2026-08-20, epic-7 amendment 29) — the own hull
// finishing what `ownSettle`'s cap deliberately stopped short of. Two correct
// rulings collided: epic-5 amendment 21 capped the own ramp and held it there
// past founder on a justification that assumed the view was about to be hidden,
// and epic-5 amendment 31 (correction #1) then made the own wreck STAY on
// screen. Nothing drove `setSink` from the spectate path, so the hull sat at
// exactly 0.3 forever. Eric: *"my ship should be sunk, not visible in
// full-color motionless in the middle of the map."*
//
// The properties that matter here, and why each is pinned:
//   • CONTINUOUS AT THE HANDOVER. The continuation starts AT the cap, so the
//     founder→spectate seam cannot pop however many ½-RTT frames sit in it.
//   • TERMINAL IS THE ONE WRECK LOOK. Exactly 1, byte-for-byte what every enemy
//     wreck wears — `ships.ts`: "There is one wreck look and one function that
//     produces it". A second own-wreck treatment is what this must never mint.
//   • THE DURATION IS DERIVED. `sinkingWindowMs * (1 - cap)` = 3500 ms, i.e. the
//     enemy ramp's own rate, not a feel literal.
//   • FAILS CLOSED TO THE WRECK. Module doctrine: a corrupt clock or a missing
//     window renders the terminal truth, never a live-looking hull.
describe('spectateSettle — the wreck the player is watching from outside', () => {
  const sinking = (until: number): { alive: boolean; sinkingUntil: number } => ({ alive: false, sinkingUntil: until });
  const CAP = SHIP.ownSettleMax;
  const COMPLETION = WINDOW * (1 - CAP); // 3500 ms — derived, never typed in

  it('is 0 while alive — a winner spectating at `finished` draws no wreck', () => {
    expect(spectateSettle({ alive: true }, FOUNDER)).toBe(0);
    expect(spectateSettle({ alive: true, sinkingUntil: FOUNDER }, FOUNDER + 9_999)).toBe(0);
  });

  it('starts at EXACTLY the cap at founder — continuous with ownSettle, no pop', () => {
    expect(spectateSettle(sinking(FOUNDER), FOUNDER)).toBe(CAP);
    expect(spectateSettle(sinking(FOUNDER), FOUNDER)).toBe(ownSettle(sinking(FOUNDER), FOUNDER));
  });

  // REGRESSION (review finding): the first cut clamped a negative elapsed to 0
  // and therefore returned the CAP for every pre-founder instant, on the written
  // rationale that only clock skew could land there and that `ownSettle` "has
  // already reached the cap" anyway. BOTH halves were false. `ownSettle` is a
  // LINEAR ramp, so mid-window it is well below the cap — and spectate genuinely
  // begins mid-window on a reachable ending: `frames.ts` `spectates()` is true
  // for EVERYONE at `phase === 'finished'`, and `match.ts`'s safety-net deadline
  // lands a finish regardless of lifecycle, so a revenge kill in a 1v1 puts the
  // winner into spectate with seconds of window left. Clamping popped the hull
  // UPWARD to the cap and then froze it there — this cycle's own defect, in
  // miniature. The values below are deliberately mid-window, where cap-clamping
  // and the correct answer differ by ~5x.
  it('hands BACK to ownSettle before founder — the handover is continuous in both directions', () => {
    for (const t of [SINCE, SINCE + 1_000, FOUNDER - 2_000, FOUNDER - 500, FOUNDER - 1]) {
      expect(spectateSettle(sinking(FOUNDER), t), `at ${t}`).toBe(ownSettle(sinking(FOUNDER), t));
      expect(spectateSettle(sinking(FOUNDER), t), `at ${t}`).toBeLessThan(CAP);
    }
    // ...and it meets the cap exactly at founder from below, so there is no seam.
    expect(spectateSettle(sinking(FOUNDER), FOUNDER - 1)).toBeLessThan(CAP);
    expect(spectateSettle(sinking(FOUNDER), FOUNDER)).toBe(CAP);
  });

  it('is halfway between cap and wreck at half the derived duration', () => {
    expect(COMPLETION).toBe(3_500);
    expect(spectateSettle(sinking(FOUNDER), FOUNDER + COMPLETION / 2)).toBeCloseTo(CAP + (1 - CAP) * 0.5, 12);
    expect(spectateSettle(sinking(FOUNDER), FOUNDER + 1_750)).toBeCloseTo(0.65, 12);
  });

  // The whole span in one sweep, sink-entry through completion, at the client's
  // own 50 ms tick. WHAT IT DOES NOT CATCH, said plainly so nobody trusts it for
  // more than it proves: the cap-clamping defect above is INVISIBLE here, because
  // a clamped `spectateSettle` is simply FLAT at the cap pre-founder — smooth and
  // monotonic in its own output. The pop was between the two FUNCTIONS (what
  // `renderOwn` last drew vs what the spectate path draws next), which is why the
  // handback test, not this one, is the regression pin. This sweep guards the
  // post-founder ramp's own smoothness and the exact landing on 1.
  it('never jumps: across sink-entry → founder → completion, no 50 ms step exceeds one tick of the faster ramp', () => {
    const STEP = 50;
    const maxTick = (STEP / COMPLETION) * (1 - CAP) * 1.000001; // the post-founder (faster) rate
    let prev = spectateSettle(sinking(FOUNDER), SINCE);
    for (let t = SINCE + STEP; t <= FOUNDER + COMPLETION + 2_000; t += STEP) {
      const v = spectateSettle(sinking(FOUNDER), t);
      expect(v, `at ${t}`).toBeGreaterThanOrEqual(prev);
      expect(v - prev, `step at ${t}`).toBeLessThanOrEqual(maxTick);
      prev = v;
    }
    expect(prev).toBe(1);
  });

  it('rises monotonically from the cap to 1 and never overshoots', () => {
    let prev = -1;
    for (let t = FOUNDER; t <= FOUNDER + COMPLETION + 5_000; t += 50) {
      const v = spectateSettle(sinking(FOUNDER), t);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(CAP);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it('reaches EXACTLY 1 at completion and holds there for the whole results period', () => {
    // Exactness is load-bearing: `0.3 + 0.7 * 1` is 0.9999999999999999 in IEEE
    // doubles, which is NOT the value `hullLook` special-cases as the wreck.
    expect(spectateSettle(sinking(FOUNDER), FOUNDER + COMPLETION)).toBe(1);
    expect(spectateSettle(sinking(FOUNDER), FOUNDER + COMPLETION + 60_000)).toBe(1);
  });

  it('at 1 the own wreck IS the enemy wreck look, byte for byte', () => {
    // One wreck look, one function (`render/ships.ts`). The mockup's unratified
    // 45%-personal-hue PROPOSAL would have minted a second one; amendment 29
    // ledgers it as Eric's to take rather than building it here.
    const own = hullLook(0, spectateSettle(sinking(FOUNDER), FOUNDER + COMPLETION), 1);
    expect(own).toEqual(hullLook(0, 1, 1));
  });

  it('fails CLOSED: no window and a NaN clock both render the wreck, not a live hull', () => {
    expect(spectateSettle({ alive: false }, FOUNDER)).toBe(1); // past founder / never opened
    expect(spectateSettle(sinking(FOUNDER), NaN)).toBe(1);
    expect(spectateSettle(sinking(NaN), FOUNDER)).toBe(1);
    expect(spectateSettle(sinking(FOUNDER), Infinity)).toBe(1);
  });

  it('a missing own ship settles nothing — an absent hull is not a wreck', () => {
    expect(spectateSettle(null, FOUNDER)).toBe(0);
    expect(spectateSettle(undefined, FOUNDER)).toBe(0);
  });
});
