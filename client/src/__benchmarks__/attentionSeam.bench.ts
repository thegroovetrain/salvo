// STORY 4.8's COST EVIDENCE — targeted benchmarks, deliberately NOT a browser
// frame-rate reading (Eric ruling 2026-08-11).
//
// The first attempt at this evidence reported "17 frames in 6s (2.8 fps)" beside
// a 1.1 ms frame time from a headless capture. Those two numbers contradict each
// other — headless Chromium throttles `requestAnimationFrame`, so the frame
// COUNT measures the throttle and not the game — and Eric added that the Vite
// dev build runs poorly on his machine anyway, which makes a dev-server frame
// rate an invalid basis for an NFR1 verdict in either direction. His ruling:
// cost the paths THIS STORY ADDED, with targeted benchmarks, under adversarial
// load, and report absolute numbers with the load they were taken at — the
// posture cycles 68-72 used ("the server gate is CHEAPER than the segment test
// it replaces, 0.55-0.74x; adversarial 278 µs/tick").
//
// WHAT IS AND IS NOT MEASURED HERE. Measured: the flash budget's two stages, the
// per-frame tier resolution, the region-key projection + window pruning against
// a saturated key map, and the degraded vs animated one-shot DRAW path. NOT
// measured, and not implied anywhere: whole-frame FPS. That number stays
// UNOBTAINED this cycle and the capture script no longer emits one.
//
// NOTHING HERE IS TUNED TOWARD A TARGET. These benches assert nothing; they
// report. Run:
//
//   client/node_modules/.bin/vitest bench --run --root client
//   client/node_modules/.bin/vitest bench --run --root client --outputJson <file>

import { bench, describe } from 'vitest';
import { Container } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  FLASH_ELEMENTS,
  createFlashBudget,
  hotbarSlotKey,
  regionKey,
  type FlashBudget,
  type FlashVerdict,
} from '../render/flashBudget.js';
import {
  amberPulseWinner,
  freezeAtDimKeyframe,
  holdAtLitKeyframe,
  tier1Active,
  tier2Active,
} from '../render/attention.js';
import { Effects, WorldFlashGate } from '../render/effects.js';
import { SCENE, SCENE_TICK_MS } from '../stage/worstCaseScene.js';

const FB = CLIENT_CONFIG.flashBudget;

/** The capture's viewport, so a region here is the region the PNGs show. */
const VIEW = { w: 1600, h: 900 };

/**
 * THE LOAD, taken from the staged worst-case scene rather than invented: every
 * budgeted one-shot family the scene emits, per 50 ms tick, all inside one
 * cluster narrower than a viewport region.
 *
 * 14 onsets/tick = 280 onsets/s into ONE region against a 3/s ceiling — ~93x
 * the ratified budget, sustained, which is the "worst-case rate the staged
 * scene produces" this benchmark was asked for.
 */
const PER_TICK =
  SCENE.muzzlePerTick + SCENE.splashPerTick + SCENE.hitCallPerTick + SCENE.hullHitsPerTick + SCENE.burstsPerTick;

/** Every region key the viewport can mint, plus every element key — the "many
 *  keys live" half of the load. A real match reaches this within seconds. */
function saturate(budget: FlashBudget, t0: number): void {
  for (let col = 0; col < FB.regionCols; col++) {
    for (let row = 0; row < FB.regionRows; row++) {
      const x = ((col + 0.5) / FB.regionCols) * VIEW.w;
      const y = ((row + 0.5) / FB.regionRows) * VIEW.h;
      for (let i = 0; i < FB.maxPerSecond; i++) budget.claim(regionKey(x, y, VIEW.w, VIEW.h), t0 + i);
    }
  }
  const elements = [...Object.values(FLASH_ELEMENTS), hotbarSlotKey(0), hotbarSlotKey(1), hotbarSlotKey(2)];
  for (const key of elements) for (let i = 0; i < FB.maxPerSecond; i++) budget.claim(key, t0 + i);
}

/** One staged tick's arbitration: coalesce then claim, `PER_TICK` times, on the
 *  hot region — the exact order render/effects.ts's `arbitrate` runs. */
function arbitrateTick(budget: FlashBudget, now: number, tick: number): number {
  let degraded = 0;
  for (let i = 0; i < PER_TICK; i++) {
    // The scene co-locates `muzzleColocated` of the muzzles EXACTLY (one point,
    // one fact) and scatters the rest inside `clusterRadiusU`.
    const x = i < SCENE.muzzleColocated ? 0 : (i * 7.3) % SCENE.clusterRadiusU;
    const y = i < SCENE.muzzleColocated ? 0 : (i * 3.1) % SCENE.clusterRadiusU;
    if (!budget.coalesce(i < SCENE.muzzlePerTick ? 'muzzle' : 'splash', x, y, tick)) continue;
    const sx = VIEW.w * 0.58 + x;
    const sy = VIEW.h * 0.42 + y;
    if (budget.claim(regionKey(sx, sy, VIEW.w, VIEW.h), now) === 'degrade') degraded++;
  }
  return degraded;
}

describe('flash budget — the staged worst-case rate', () => {
  let budget = createFlashBudget();
  let now = 1_000_000;
  let tick = 0;
  saturate(budget, now);

  bench(
    `claim+coalesce, one 50ms tick (${PER_TICK} onsets, one hot region, ${FB.regionCols * FB.regionRows} regions + 9 element keys live)`,
    () => {
      now += SCENE_TICK_MS;
      tick += 1;
      arbitrateTick(budget, now, tick);
      // A long match never resets, but a bench that ran for minutes would drift
      // the clock far past any real window; re-seat on a coarse boundary so the
      // measured state stays the steady state (a saturated map, a hot key).
      if (tick % 20_000 === 0) {
        budget = createFlashBudget();
        saturate(budget, now);
      }
    },
  );

  bench(`regionKey projection alone (${PER_TICK} flashes/tick)`, () => {
    for (let i = 0; i < PER_TICK; i++) regionKey(VIEW.w * 0.58 + i, VIEW.h * 0.42 + i, VIEW.w, VIEW.h);
  });

  // The prune's worst case, isolated: a saturated map where EVERY key is at the
  // ceiling, and a claim whose clock sits inside the window — so `withinWindow`
  // keeps every onset it walks (nothing falls out, the list is rebuilt whole)
  // and the claim degrades, which is the state a heavy stack actually holds.
  const full = createFlashBudget();
  const fullAt = 2_000_000;
  saturate(full, fullAt);
  let k = 0;

  bench('one claim against a FULL key map (worst prune: every key at the ceiling)', () => {
    k += 1;
    const col = k % FB.regionCols;
    const row = k % FB.regionRows;
    const x = ((col + 0.5) / FB.regionCols) * VIEW.w;
    const y = ((row + 0.5) / FB.regionRows) * VIEW.h;
    full.claim(regionKey(x, y, VIEW.w, VIEW.h), fullAt + FB.windowMs / 2);
  });
});

describe('attention seam — per-frame tier resolution', () => {
  let f = 0;

  bench('tier1Active + tier2Active + holds + amber corollary (one frame)', () => {
    f += 1;
    const hpFrac = SCENE.ownHpFrac;
    const t1 = tier1Active({ hpFrac, deniedLive: f % 90 === 0 });
    const t2 = tier2Active({ inStorm: true, ringUrgent: true });
    holdAtLitKeyframe(t1);
    freezeAtDimKeyframe(t1, t2);
    amberPulseWinner({ ring: true, hpRail: hpFrac < 0.5 });
  });
});

/** A budget stub that always answers the same way — this isolates the DRAW
 *  path from the arbitration measured above, which is the comparison asked for
 *  ("degrading is not MORE expensive than animating"). */
function fixedBudget(verdict: FlashVerdict): FlashBudget {
  return { claim: () => verdict, coalesce: () => true, reset: () => undefined };
}

/** An Effects layer wired to a fixed verdict, in the same shape main.ts wires. */
function fixedEffects(verdict: FlashVerdict): Effects {
  const root = new Container();
  const fx = new Effects(root, root, root);
  const projector = {
    worldToScreen: (p: { x: number; y: number }) => p,
    screenCenter: { x: VIEW.w / 2, y: VIEW.h / 2 },
  };
  fx.setFlashGate(new WorldFlashGate(fixedBudget(verdict), projector, () => 0));
  return fx;
}

/** One frame of the staged flash stack: spawn a tick's worth, then age+redraw
 *  every live mark (`update` is what calls `drawShot`). */
function drawFrame(fx: Effects, frame: number): void {
  const c = (frame % 17) * 3;
  for (let i = 0; i < SCENE.muzzlePerTick; i++) fx.spawnEffect('muzzle', c + i, c - i);
  for (let i = 0; i < SCENE.splashPerTick; i++) fx.spawnEffect('splash', c + i * 2, c);
  for (let i = 0; i < SCENE.hitCallPerTick; i++) fx.spawnEffect('spark', c, c + i * 2);
  for (let i = 0; i < SCENE.burstsPerTick; i++) fx.spawnEffect('burst', c - i * 3, c + i, 1, 40);
  fx.update(1 / 60, frame * 16.67);
}

/** One draw-path bench. RUN TWICE IN ALTERNATION (below): the two variants do
 *  structurally identical work — same spawns, same lives, same `clear/circle/
 *  fill`, differing only in `oneShotAlpha`'s expression — so any consistent gap
 *  would be an ORDER artifact of a shared heap, and alternating exposes it. */
function drawBench(label: string, verdict: FlashVerdict): void {
  const fx = fixedEffects(verdict);
  let n = 0;
  bench(`${label}: spawn a staged tick + age/redraw every live mark`, () => {
    n += 1;
    drawFrame(fx, n);
  });
}

describe('one-shot draw path — degraded vs animated, same population', () => {
  drawBench('ANIMATED (1st)', 'animate');
  drawBench('DEGRADED (1st)', 'degrade');
  drawBench('ANIMATED (2nd)', 'animate');
  drawBench('DEGRADED (2nd)', 'degrade');
});
