// Effect layer-routing predicate (render/effects.ts). Four one-shots render into
// the fog-immune chart layer: the gun-shell burst (a detonation at radar range
// must read above the fog, mirroring the fog-immune reticle) and — since Story
// 4.3 — the three gunnery marks, each of which is now a server signal with its
// own declared fog exception and would be drawn exactly where it is useless if
// it stayed under the fog. Everything else stays in the fogged world.

import { afterEach, describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import {
  Effects,
  WorldFlashGate,
  effectPeakAlpha,
  isBudgetedFlash,
  isFogImmuneEffect,
  isJuiceEffect,
  oneShotAlpha,
  type EffectKind,
} from '../render/effects.js';
import { createFlashBudget, regionKey } from '../render/flashBudget.js';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';

describe('isFogImmuneEffect — the marks that must read above the fog', () => {
  it('is TRUE for the burst and the three Story 4.3 gunnery marks', () => {
    expect(isFogImmuneEffect('burst')).toBe(true);
    // splash = our own fall of shot at its TRUE impact point (bracket-and-walk
    // fire is the point: the miss you cannot see is the one you need to see).
    expect(isFogImmuneEffect('splash')).toBe(true);
    // spark = the Hit Call bloom, confirming a connection at a fogged hull.
    expect(isFogImmuneEffect('spark')).toBe(true);
    // muzzle = a shooter inside the 412.5u flash halo but outside the 330u bubble.
    expect(isFogImmuneEffect('muzzle')).toBe(true);
  });

  it('is FALSE for every fogged world effect', () => {
    // muzzleHeavy stays fogged and correctly so: it is own-side only and only
    // ever draws on our own hull, which IS the hole in the fog.
    const fogged: EffectKind[] = ['wake', 'muzzleHeavy', 'sink', 'torpwake'];
    for (const kind of fogged) expect(isFogImmuneEffect(kind)).toBe(false);
  });
});

// --- STORY 4.3: the promotion out of juice -------------------------------------

describe('isJuiceEffect — only the own cannon\'s extra weight is decoration', () => {
  it('classes muzzle and spark as INFORMATION, not juice', () => {
    // DO NOT "FIX" THIS BACK. Both were juice while they were client-side
    // GUESSES about things you could already see (a flash inferred from a shell
    // revealing on a visible hull; a spark only at impacts inside your bubble).
    // Story 4.3 made them server signals: `mz` says a gun went off HERE — a
    // shooter you may not be able to see — and `hc` says something you fired
    // CONNECTED, at a point you may have no other way to learn about. FR16 makes
    // both load-bearing, and the ratified motion rule is that `off` removes
    // MOTION, never INFORMATION.
    expect(isJuiceEffect('muzzle')).toBe(false);
    expect(isJuiceEffect('spark')).toBe(false);
    expect(effectPeakAlpha('muzzle', 0.9, 0)).toBe(0.9); // motion=off: still drawn
    expect(effectPeakAlpha('spark', 1, 0)).toBe(1);
  });

  it('is TRUE for muzzleHeavy alone — the whole juice set is one kind', () => {
    const kinds: EffectKind[] = ['wake', 'muzzle', 'muzzleHeavy', 'spark', 'splash', 'sink', 'torpwake', 'burst'];
    expect(kinds.filter(isJuiceEffect)).toEqual(['muzzleHeavy']);
  });
});

// --- STORY 2.9: the two doctrine one-shots -------------------------------------

// The AP PIERCE RING'S PINS ARE RETIRED (Story 7-5 wave 2, R2.6): ARMOR-PIERCING
// was the ring's only source and the cannon is deleted, so `pierce` left
// EffectKind entirely rather than surviving as a spec nothing can spawn.
describe('the Story 2.9 one-shot — the heavy muzzle', () => {
  it('classes the OWN broadside\'s heavier muzzle as juice, like the muzzle it replaces', () => {
    expect(isJuiceEffect('muzzleHeavy')).toBe(true);
    expect(effectPeakAlpha('muzzleHeavy', 1, 0)).toBe(0); // motion=off: no flash
  });
});

// --- STORY 4.8: THE AGGREGATE FLASH BUDGET, WORLD SIDE -------------------------
//
// The ratified photosensitivity floor ("no element or screen region flashes more
// than 3x/s regardless of how many compliant events stack") reaches the water
// through render/flashBudget.ts. These tests pin the properties that matter more
// than the counting itself: an over-budget flash STILL DRAWS (it is declared
// information — Story 4.3 promoted `muzzle` and `spark` out of juice precisely
// so they could not be deleted under load), the verdict is LATCHED at spawn so
// the sliding window can never strobe a mark already on screen, and the motion
// setting's behaviour does not move one bit.

const FB = CLIENT_CONFIG.flashBudget;
/** SPECS.spark.alpha — the Hit Call bloom's peak, at motion `full` (not juice,
 *  so the motion multiplier never touches it). Pinned here rather than exported
 *  from the render module: the table is deliberately private. */
const SPARK_PEAK = 1;
/** A camera stand-in: world units ARE screen px on an 800x600 viewport, so a
 *  world point's region is legible by inspection (a 4x3 grid → 200x200 cells). */
const PROJECTOR = {
  worldToScreen: (p: { x: number; y: number }) => ({ x: p.x, y: p.y }),
  screenCenter: { x: 400, y: 300 },
};

function harness(now: () => number = () => 1_000): { fx: Effects; budget: ReturnType<typeof createFlashBudget> } {
  const layer = new Container();
  const fx = new Effects(layer, layer, layer);
  const budget = createFlashBudget();
  fx.setFlashGate(new WorldFlashGate(budget, PROJECTOR, now));
  return { fx, budget };
}

afterEach(() => {
  settings.set({ motion: 'full' });
});

describe('isBudgetedFlash — every one-shot claims except the two wake materials', () => {
  it('excludes wake and the creeping mine\'s trail bubble, includes every flash', () => {
    // A stream of trail dots is not a flash, and budgeting one would let a mine
    // crawling through a region spend that region's three onsets on its own
    // track — degrading the muzzle flashes and Hit Calls that land there next.
    expect(isBudgetedFlash('wake')).toBe(false);
    expect(isBudgetedFlash('torpwake')).toBe(false);
    const flashes: EffectKind[] = ['muzzle', 'muzzleHeavy', 'spark', 'splash', 'sink', 'burst', 'horn'];
    for (const k of flashes) expect(isBudgetedFlash(k)).toBe(true);
  });
});

describe('oneShotAlpha — a degrade spends the RAMP, never the mark', () => {
  it('holds a flat fraction of the peak for the whole life when degraded', () => {
    for (const k of [0, 0.25, 0.5, 0.99]) {
      expect(oneShotAlpha(1, k, true)).toBeCloseTo(FB.degradeAlphaFactor, 10);
    }
    expect(oneShotAlpha(0.7, 0, true)).toBeCloseTo(0.7 * FB.degradeAlphaFactor, 10);
  });

  it('ramps peak → 0 when animated (the shipped behaviour, unchanged)', () => {
    expect(oneShotAlpha(0.9, 0, false)).toBeCloseTo(0.9, 10);
    expect(oneShotAlpha(0.9, 0.5, false)).toBeCloseTo(0.45, 10);
  });

  it('never renders a degraded mark MORE visible than the animated one at onset', () => {
    expect(oneShotAlpha(1, 0, true)).toBeLessThan(oneShotAlpha(1, 0, false));
  });
});

describe('the budget NEVER deletes a world flash', () => {
  it('spawns and draws every over-budget flash at its true position', () => {
    // THE anti-deletion guarantee, and the single most important assertion here.
    // Twelve Hit Call blooms inside one screen region in one second: three
    // animate, nine degrade, and all twelve are on screen carrying real alpha.
    const { fx } = harness();
    for (let i = 0; i < 12; i++) fx.spawnEffect('spark', 100 + i, 100);
    const shots = fx.liveShots;
    expect(shots).toHaveLength(12);
    expect(shots.filter((s) => !s.degraded)).toHaveLength(FB.maxPerSecond);
    for (const s of shots) expect(s.alpha).toBeGreaterThan(0);
  });

  it('a degraded mark is FLAT across its life while an animated one decays', () => {
    const { fx } = harness();
    for (let i = 0; i < FB.maxPerSecond; i++) fx.spawnEffect('spark', 100 + i, 100); // animate
    fx.spawnEffect('spark', 150, 100); // over budget → degrade
    const animated = (): number => fx.liveShots[0].alpha;
    const degraded = (): number => fx.liveShots[FB.maxPerSecond].alpha;
    const flat = SPARK_PEAK * FB.degradeAlphaFactor;
    expect(fx.liveShots[0].degraded).toBe(false);
    expect(fx.liveShots[FB.maxPerSecond].degraded).toBe(true);
    expect(degraded()).toBeCloseTo(flat, 10);
    fx.update(0.05, 0); // spark life 0.2s → k = 0.25
    expect(animated()).toBeCloseTo(SPARK_PEAK * 0.75, 10);
    expect(degraded()).toBeCloseTo(flat, 10);
    fx.update(0.05, 0);
    expect(animated()).toBeCloseTo(SPARK_PEAK * 0.5, 10);
    expect(degraded()).toBeCloseTo(flat, 10); // no ramp, ever
  });
});

describe('the verdict is LATCHED at creation (amendment 83, applied to effects)', () => {
  it('a mark keeps its verdict as the window fills and empties behind it', () => {
    let t = 1_000;
    const { fx } = harness(() => t);
    fx.spawnEffect('spark', 100, 100); // #0, claimed against an empty window
    for (let i = 0; i < 6; i++) fx.spawnEffect('spark', 110 + i, 100); // fills then overruns it
    expect(fx.liveShots[0].degraded).toBe(false);
    expect(fx.liveShots[6].degraded).toBe(true);
    t += FB.windowMs * 5; // …and the window empties again underneath both of them
    fx.update(0.05, 0);
    expect(fx.liveShots[0].degraded).toBe(false); // no strobe manufactured by the anti-strobe rule
    expect(fx.liveShots[6].degraded).toBe(true); // a degraded mark never "upgrades" mid-life
    expect(fx.liveShots[6].alpha).toBeCloseTo(SPARK_PEAK * FB.degradeAlphaFactor, 10);
  });
});

describe('coalescing — one frame, one cue (amendment 37 extended to visuals)', () => {
  it('collapses same kind + same point in one frame, and nothing else', () => {
    const { fx } = harness();
    fx.spawnEffect('splash', 100, 100);
    fx.spawnEffect('splash', 100, 100); // the same fact, twice
    fx.spawnEffect('splash', 100.02, 100); // sub-quantum jitter is the same mark
    expect(fx.liveShots).toHaveLength(1);
    fx.spawnEffect('spark', 100, 100); // a different KIND is a different fact
    fx.spawnEffect('splash', 140, 100); // a different POSITION is a different fact
    expect(fx.liveShots).toHaveLength(3);
    fx.update(0.01, 0); // a new frame…
    fx.spawnEffect('splash', 100, 100); // …a second salvo walked back onto the same water
    expect(fx.liveShots).toHaveLength(4);
  });

  it('a collapsed duplicate does not claim — only the survivor spends budget', () => {
    const { fx, budget } = harness(() => 1_000);
    for (let i = 0; i < 10; i++) fx.spawnEffect('splash', 100, 100);
    expect(fx.liveShots).toHaveLength(1);
    // Exactly ONE onset was spent, so the region still has maxPerSecond − 1 left.
    for (let i = 1; i < FB.maxPerSecond; i++) {
      expect(budget.claim(regionKey(100, 100, 800, 600), 1_000)).toBe('animate');
    }
    expect(budget.claim(regionKey(100, 100, 800, 600), 1_000)).toBe('degrade');
  });

  it('never collapses a BURST — its instances are not interchangeable', () => {
    // The coalescer's principle is that two co-located same-kind marks are ONE
    // FACT, which holds only while their specs are identical. A `burst` ring is
    // spawned with a PER-SPAWN RADIUS (the real blast extent —
    // roomBindings.handleBurst), so collapsing two different-radius bursts inside
    // the 0.1u quantum would drop the LARGER blast extent whenever the smaller
    // arrived first: real spatial information about a danger zone, deleted. It is
    // therefore excluded from the COALESCER only — it still claims budget and
    // still degrades (next test).
    const { fx } = harness();
    const layer = new Container();
    const solo = new Effects(layer, layer, layer);
    solo.setFlashGate(null);
    fx.spawnEffect('burst', 100, 100, 1, 20);
    fx.spawnEffect('burst', 100, 100, 1, 60); // a much bigger blast, same water
    expect(fx.liveShots).toHaveLength(2);
    // …and the BIGGER extent really draws: the two rings' radii differ.
    solo.spawnEffect('burst', 100, 100, 1, 20);
    solo.spawnEffect('burst', 100, 100, 1, 60);
    solo.update(0.3, 0); // late in the 0.35s life, where the two extents diverge
    const radii = (layer.children.filter((c) => c instanceof Graphics && c.visible) as Graphics[])
      .map((g) => g.getLocalBounds().width / 2)
      .sort((a, b) => a - b);
    expect(radii).toHaveLength(2);
    expect(radii[1]).toBeGreaterThan(radii[0] * 2);
  });

  it('a burst STILL claims budget and degrades past the floor', () => {
    const { fx } = harness();
    for (let i = 0; i < 5; i++) fx.spawnEffect('burst', 100, 100, 1, 20 + i * 10);
    expect(fx.liveShots).toHaveLength(5);
    expect(fx.liveShots.filter((s) => !s.degraded)).toHaveLength(FB.maxPerSecond);
    for (const s of fx.liveShots) expect(s.alpha).toBeGreaterThan(0);
  });

  it('budgets by SCREEN region — a busy region never gags a quiet one', () => {
    const { fx } = harness();
    for (let i = 0; i < 6; i++) fx.spawnEffect('spark', 100 + i, 100); // region r0:0
    fx.spawnEffect('spark', 700, 500); // region r3:2 — its own untouched budget
    expect(fx.liveShots[6].degraded).toBe(false);
  });
});

describe('motion: \'off\' is unchanged by the budget', () => {
  it('spawns exactly the same kinds, and never renders one MORE visible', () => {
    settings.set({ motion: 'off' });
    const kinds: EffectKind[] = ['muzzle', 'muzzleHeavy', 'spark', 'splash', 'sink', 'burst', 'horn', 'torpwake'];
    const plainLayer = new Container();
    const plain = new Effects(plainLayer, plainLayer, plainLayer); // no gate = the pre-4.8 path
    const { fx } = harness();
    kinds.forEach((k, i) => {
      plain.spawnEffect(k, 100 + i * 3, 100);
      fx.spawnEffect(k, 100 + i * 3, 100);
    });
    // muzzleHeavy — the one juice one-shot — still does not spawn at all, and
    // every other kind still does: the budget is a SECOND filter on top of the
    // motion gate, never a replacement for it.
    expect(fx.liveShots.map((s) => s.kind)).toEqual(plain.liveShots.map((s) => s.kind));
    expect(fx.liveShots.map((s) => s.kind)).not.toContain('muzzleHeavy');
    fx.liveShots.forEach((s, i) => expect(s.alpha).toBeLessThanOrEqual(plain.liveShots[i].alpha + 1e-12));
  });
});
