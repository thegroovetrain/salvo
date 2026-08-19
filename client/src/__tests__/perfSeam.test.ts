// STORY 7.1 — the PERF SEAM's contracts.
//
// The story is a VERDICT (does a fully populated frame fit 16.6 ms, does a cold
// load reach an interactive home inside ~10 s), and every one of these tests
// guards a way the verdict could come out wrong while still looking like a
// number:
//
//   • staging the wrong population — the readability profile is Story 4.8's
//     RATIFIED subject and a silent edit to it would re-take a settled decision
//     while reporting an NFR1 figure;
//   • publishing a frame rate off a source with no vsync, which is exactly the
//     2026-08-11 defect ("17 frames in 6 s (2.8 fps)" beside a 1.1 ms frame);
//   • letting a third-party font CDN spend the load budget it is supposed to be
//     measured inside.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CONFIG } from '@salvo/shared';
import {
  NFR1_PROFILE,
  READABILITY_PROFILE,
  SCENE,
  buildSceneWorld,
  sceneContacts,
  sceneEvents,
  sceneProfile,
} from '../stage/worstCaseScene.js';
import { presentStatsFrom, vsyncPlausible, type FrameStats } from '../stage/worstCase.js';
import { boundedFontWait } from '../render/stage.js';
import { CLIENT_CONFIG } from '../config.js';
import { isDroneHull } from '../render/ships.js';

const MAP_RADIUS = 1500;

describe('the scene PROFILE selector', () => {
  it('stages Story 4.8s readability scene for an ABSENT profile — the gate URL is untouched', () => {
    // `/?stage=worstcase` with no `profile` is the readability gate's own URL and
    // client/scripts/readabilityCapture.mjs drives exactly it. If this ever
    // resolved to anything else, that ratified capture would silently start
    // photographing a different scene.
    expect(sceneProfile(null)).toBe(READABILITY_PROFILE);
    expect(sceneProfile(undefined)).toBe(READABILITY_PROFILE);
    expect(sceneProfile('')).toBe(READABILITY_PROFILE);
  });

  it('stages the NFR1 population for `nfr1`', () => {
    expect(sceneProfile('nfr1')).toBe(NFR1_PROFILE);
    expect(sceneProfile('nfr1').id).toBe('nfr1');
  });

  it('falls back to the readability profile on an UNKNOWN string, and says so', () => {
    // A measurement door: a typo in a capture script must degrade to the
    // ratified scene (which is at least a scene) rather than a blank page
    // nobody can diagnose — but it must never do so silently.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(sceneProfile('nfr-one')).toBe(READABILITY_PROFILE);
    expect(sceneProfile('__proto__')).toBe(READABILITY_PROFILE); // never a prototype key
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('the READABILITY profile is FROZEN (Story 4.8s ratified subject)', () => {
  it('pins every staged constant, so an edit to SCENE trips here first', () => {
    // These values are load-bearing for a RATIFIED gate: `SCENE`s counts are
    // reasoned against the ATTENTION ceiling (~100x the ratified onset budget
    // inside one viewport region), not against total population. Story 7.1 adds
    // a second profile precisely so this object never has to move — this pin is
    // what makes "never has to move" checkable.
    expect(SCENE).toEqual({
      ownHpFrac: 0.2,
      nearContacts: 12,
      farContacts: 7,
      torpedoes: 5,
      muzzlePerTick: 4,
      muzzleColocated: 2,
      splashPerTick: 3,
      hitCallPerTick: 2,
      hullHitsPerTick: 3,
      burstsPerTick: 2,
      smokePerTick: 3,
      sunkEveryTicks: 40,
      pointEveryTicks: 120,
      ownDamageEveryTicks: 60,
      deniedEveryTicks: 90,
      foghornEveryTicks: 200,
      zoneElapsedMs: 175_000,
      clusterRadiusU: 26,
      clusterOffsetU: 130,
    });
  });

  it('stages the arena cap worth of hulls and paints every far hull every tick', () => {
    expect(READABILITY_PROFILE.contacts).toBe(CONFIG.map.playerCap - 1);
    expect(READABILITY_PROFILE.contacts).toBe(SCENE.nearContacts + SCENE.farContacts);
    // stride 1 = the pre-7.1 behaviour, byte for byte.
    expect(READABILITY_PROFILE.blipStrideTicks).toBe(1);
    const world = buildSceneWorld(MAP_RADIUS);
    expect(world.profile).toBe(READABILITY_PROFILE);
    expect(sceneContacts(world, 0)).toHaveLength(SCENE.nearContacts);
    expect(sceneEvents(world, 0, 0).filter((e) => e.k === 'blip')).toHaveLength(SCENE.farContacts);
  });
});

describe('the NFR1 profile — the reference scenario the frame budget is judged against', () => {
  const world = buildSceneWorld(MAP_RADIUS, undefined, NFR1_PROFILE);

  it('stages 20 CONTESTANTS plus the PEAK concurrent PvE fleet', () => {
    // 20 contestants = the arena cap. The peak fleet is the LARGEST SINGLE WAVE
    // (8 groups x 6 hulls = 48 at T+1:00), not the sum of the schedule: the
    // waves are minutes apart precisely so the field is thinned between them.
    const perGroup =
      CONFIG.fleet.composition.large + CONFIG.fleet.composition.medium + CONFIG.fleet.composition.small;
    const peakFleet = perGroup * Math.max(...CONFIG.fleet.waves.map((w) => w.fleets));
    expect(peakFleet).toBe(48);
    expect(world.hulls).toHaveLength(CONFIG.map.playerCap - 1 + peakFleet);
    expect(world.hulls.length + 1).toBe(68);
    // Captains hold roster rows; fleet hulls hold none (amendment 39), so the
    // roster IS the contestant count.
    expect(world.roster).toHaveLength(CONFIG.map.playerCap);
    expect(world.hulls.filter((h) => isDroneHull(h.cls))).toHaveLength(peakFleet);
  });

  it('INTERLEAVES the two sensor bands, so fleet hulls are not all shoved into the annulus', () => {
    // A bare `i <= nearContacts` split would have put every fleet hull outside
    // the truesight bubble — no drone silhouette, no aggro bracket, no hull-hit
    // flash — and the cheap half of the picture would have been measured as if
    // it were the whole one.
    const near = world.hulls.filter((h) => !h.far);
    expect(near.some((h) => isDroneHull(h.cls))).toBe(true);
    expect(near.some((h) => !isDroneHull(h.cls))).toBe(true);
    // One quarter near: the bubble is (sight/radar)^2 = 1/4 of the scope's disc.
    expect(near.length / world.hulls.length).toBeCloseTo(0.25, 1);
  });

  it('paints the far band on a REAL sweep cadence, not once per hull per tick', () => {
    // 50 far hulls painting every tick would lay ~80x the phosphor a real sweep
    // can produce and report a frame cost no player could ever provoke. A hull
    // paints when the beam crosses its bearing: once per revolution.
    const revolutionTicks = Math.round(60_000 / CONFIG.vision.sweepRpm / CONFIG.tick.simDtMs);
    expect(NFR1_PROFILE.blipStrideTicks).toBe(revolutionTicks);
    const far = world.hulls.filter((h) => h.far).length;
    let painted = 0;
    for (let t = 0; t < revolutionTicks; t += 1) {
      painted += sceneEvents(world, t, 0).filter((e) => e.k === 'blip').length;
    }
    // Exactly one paint per far hull across one full revolution.
    expect(painted).toBe(far);
  });

  it('shares the readability profiles flash stack rather than re-inflating it', () => {
    // Re-inflating would make the frame-budget number a lie in the PESSIMISTIC
    // direction — a breach nobody could provoke is the one failure mode that
    // would make this whole story worthless.
    expect(NFR1_PROFILE.scene).toBe(SCENE);
  });

  it('leaves the readability world byte-identical — the two profiles never cross', () => {
    const a = buildSceneWorld(MAP_RADIUS);
    const b = buildSceneWorld(MAP_RADIUS, undefined, READABILITY_PROFILE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('PRESENT CADENCE — a frame rate that declares when it is a lie', () => {
  it('trusts a ~16.7 ms interval: a real 60 Hz display', () => {
    const s = presentStatsFrom(new Array<number>(60).fill(1000 / 60));
    expect(s?.vsyncTrusted).toBe(true);
    expect(s?.intervalMs.p50).toBeCloseTo(16.667, 2);
    expect(s?.frames).toBe(61); // n intervals span n+1 presents
    expect(s?.longFrames).toBe(0);
  });

  it('REFUSES a headless-throttled cadence — the 2026-08-11 defect, caught', () => {
    // That run reported "17 frames in 6 s (2.8 fps)" beside a 1.1 ms frame time.
    // Two numbers that cannot both be true: the frame COUNT was measuring
    // headless Chromiums rAF throttle, not the renderer.
    const throttled = presentStatsFrom(new Array<number>(17).fill(6000 / 17));
    expect(throttled?.vsyncTrusted).toBe(false);
    expect(throttled?.longFrames).toBe(17); // every one of them a dropped frame
  });

  it('REFUSES a vsync-free cadence too — implausibly FAST is equally fake', () => {
    // `--disable-gpu-vsync` / an offscreen surface runs rAF free of any display.
    expect(presentStatsFrom(new Array<number>(60).fill(1))?.vsyncTrusted).toBe(false);
  });

  it('TRUSTS a real display that is genuinely dropping to 30 FPS, and reports it', () => {
    // THE FAIL-OPEN DEFECT THIS FIX EXISTS FOR (Story 7.1). Keying `vsyncTrusted`
    // off the MEDIAN conflated "no real vsync source" with "a real source, and
    // the game is missing every other deadline": a true 30 FPS run has a median
    // of ~33 ms, so the instrument answered a measured 30 FPS with a REFUSAL —
    // which reads in the audit record exactly like a clean run. It hid the bad
    // news, in the one direction that matters.
    //
    // The floor is what says a display is there; the median is what says how
    // badly it is being missed. A 60 Hz panel alternating hit/miss keeps its
    // 16.7 ms floor throughout.
    const alternating = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 1000 / 60 : 1000 / 30));
    const s = presentStatsFrom(alternating);
    expect(s?.vsyncTrusted).toBe(true); // the panel is real...
    expect(s?.intervalMs.p95).toBeGreaterThan(30); // ...and the news is bad
    expect(s?.longFrames).toBeGreaterThan(90);
  });

  it('does not let one freak fast interval vouch for a throttled source', () => {
    // The floor is the 5th percentile, never the outright minimum: a single
    // coalesced present must not certify a source that never presented fast
    // again.
    const throttledWithOneBlip = [16.7, ...new Array<number>(199).fill(350)];
    expect(presentStatsFrom(throttledWithOneBlip)?.vsyncTrusted).toBe(false);
  });

  it('holds the plausibility band at the boundaries, and rejects degenerate input', () => {
    expect(vsyncPlausible(4)).toBe(true); // 250 Hz — above any display we measure
    expect(vsyncPlausible(20)).toBe(true); // 50 Hz panel
    expect(vsyncPlausible(3.9)).toBe(false);
    expect(vsyncPlausible(20.1)).toBe(false);
    expect(vsyncPlausible(0)).toBe(false);
    expect(vsyncPlausible(Number.NaN)).toBe(false);
    expect(vsyncPlausible(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('returns null under two intervals rather than inventing a cadence', () => {
    expect(presentStatsFrom([])).toBeNull();
    expect(presentStatsFrom([16.7])).toBeNull();
  });
});

describe('FrameStats carries NO `fps` field, and must never grow one', () => {
  it('has exactly the four cost keys', () => {
    // The prohibition is the 2026-08-11 ruling (see the struct's own comment):
    // `FrameStats` measures WORK inside our callbacks, and a frame rate cannot
    // be derived from it. Cadence lives in `PresentStats`, which carries its own
    // validity flag. A TYPE-LEVEL pin, because the struct has no runtime value
    // to inspect — this stops compiling the moment an `fps` key is added.
    const noFps: 'fps' extends keyof FrameStats ? never : true = true;
    expect(noFps).toBe(true);
    const keys: Array<keyof FrameStats> = ['frames', 'total', 'sim', 'render'];
    expect(keys).toHaveLength(4);
  });
});

describe('the BOUNDED FONT WAIT (NFR2) — first paint is never a CDNs to spend', () => {
  const realFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

  afterEach(() => {
    vi.useRealTimers();
    if (realFonts) Object.defineProperty(document, 'fonts', realFonts);
    else Reflect.deleteProperty(document as unknown as Record<string, unknown>, 'fonts');
  });

  /** A FontFaceSet whose every promise NEVER settles — the exact shape of a
   *  blocked or throttled Google Fonts host. It does not REJECT, which is why
   *  the pre-existing try/catch never covered this case. */
  function stallForever(): void {
    const never = new Promise<never>(() => undefined);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: () => never, ready: never },
    });
  }

  it('resolves on the timeout even though `document.fonts.ready` never settles', async () => {
    vi.useFakeTimers();
    stallForever();
    let settled = false;
    const wait = boundedFontWait().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(CLIENT_CONFIG.boot.fontWaitMs - 1);
    expect(settled).toBe(false); // it really is waiting, not short-circuiting
    await vi.advanceTimersByTimeAsync(2);
    await wait;
    expect(settled).toBe(true);
  });

  it('resolves immediately when the faces are already there — no timeout tax', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: () => Promise.resolve(), ready: Promise.resolve() },
    });
    let settled = false;
    const wait = boundedFontWait().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await wait;
    expect(settled).toBe(true);
  });

  it('bounds the wait at a value short enough to be a pause, not a dead page', () => {
    expect(CLIENT_CONFIG.boot.fontWaitMs).toBeGreaterThan(0);
    expect(CLIENT_CONFIG.boot.fontWaitMs).toBeLessThanOrEqual(2000);
  });
});
