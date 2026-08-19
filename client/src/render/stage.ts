// Pixi 8 application + scene-graph construction. Thin Pixi adapter (not unit
// tested). Builds the layer tree in the exact z-order the plan specifies, and
// the order is DECLARED (the three `*_LAYER_ORDER` arrays below) rather than
// implied by the order of an object literal, so a test can assert it without a
// GPU and a future refactor cannot quietly re-stack the scene:
//
//   worldRoot   (camera-transformed): ocean, wake, projectile, mines, decoys
//   plateRoot   (screen space)        — truesight nameplates (render/nameplates.ts)
//   fogSprite   (screen space)        — fog overlay + sight hole (render/fog.ts)
//   chartRoot   (camera-transformed): map, smoke, blip, SHIP, aim, burstFx, sweep  (fog-immune: above fog)
//   hudRoot     (screen space)        — telegraph HUD, then foghorn chevrons
//
// HULLS SIT ABOVE THE RADAR PAINT (this cycle, Eric: *"Lets make hulls in general
// more visible over radar blips when they are visible."*). `ship` used to be the
// top layer of worldRoot, which put it under `fogSprite` and therefore under
// EVERY chart layer — including `blip`, so the radar echo the client synthesizes
// for a hull you can already see (amendments 88/141) was drawn on top of the very
// silhouette it represents. It now sits in chartRoot immediately ABOVE `blip` and
// immediately BELOW `aim`: above the returns, below the reticle and the burst
// rings, which are the marks you aim and read damage with and must never be
// occluded by a hull.
//
// THE COST OF THAT LIFT, AND WHERE IT IS PAID. Being under the fog gave hulls the
// composite's feathered sight hole for free — a contact softened as it neared the
// edge of the bubble instead of vanishing at full strength. That softening now
// rides the hull's own alpha (`fog.ts hullSightSoftness`, the same feather
// constants the texture bakes, applied per contact in render/contacts.ts). It
// discloses nothing new: the server only ever sends a `Contact` for a hull inside
// effective truesight + LOS or inside an owned star-shell zone (server
// signals.ts `contactSignal`), so every hull the client holds is one it has
// legitimately seen — the fog was selling the reveal, never enforcing it.
//
// worldRoot and chartRoot share the same camera transform; plateRoot, fogSprite,
// and hudRoot stay in screen space. plateRoot sits BELOW the fog composite so the
// plates dim/occlude with the fog (DESIGN: nameplates fade with truesight
// resolution) — deliberately NOT lifted with the hulls, since a plate is a label
// and the fog is the only thing that resolves it away. `aim` (crosshair + bearing
// line) lives in chartRoot because gun range exceeds sight range: aiming at a
// radar blip would otherwise place the reticle under the fog. Fonts are preloaded
// before any Text is created.

import { Application, Container } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import type { Camera } from './camera.js';

/**
 * Push the camera's world transform onto the world + chart containers — THE one
 * place that transform is written.
 *
 * It lived in main.ts until cycle 82, when the pre-join home scene needed it
 * too. main.ts runs its own bootstrap at import time, so nothing may import it;
 * the alternative to moving the function was a second copy of the transform,
 * which is exactly the two-derivations desync class this project refuses
 * everywhere else (`effectiveStats`, the shared sim). It belongs here anyway:
 * `worldRoot`/`chartRoot` are this module's containers, and the rule that they
 * SHARE one transform (while plateRoot/fogSprite/hudRoot stay in screen space)
 * is this module's contract.
 */
export function applyCamera(camera: Camera, world: Container, chart: Container): void {
  const c = camera.screenCenter;
  const px = c.x - camera.center.x * camera.zoom + camera.shake.x;
  const py = c.y - camera.center.y * camera.zoom + camera.shake.y;
  world.scale.set(camera.zoom);
  world.position.set(px, py);
  chart.scale.set(camera.zoom);
  chart.position.set(px, py);
}

export interface StageLayers {
  // worldRoot children
  ocean: Container;
  wake: Container;
  projectile: Container;
  /** Enemy mines (render/mines.ts) — fogged; they only arrive when sighted. */
  mineWorld: Container;
  /** Truesighted enemy decoy buoys (render/decoys.ts) — fogged; they only
   *  arrive when the observer legitimately sees them (mineWorld precedent). */
  decoyWorld: Container;
  // chartRoot children
  map: Container;
  /** Storm circle (render/zone.ts) — charted, fog-immune; above the base map. */
  zone: Container;
  /** Star-shell lit zones (render/litZones.ts) — a fog-immune additive glow,
   *  beneath the tactical markers so blips/mines/reticle stay readable on top. */
  litZone: Container;
  /** WOUNDED SMOKE plumes (render/smoke.ts) — fog-immune for the same reason
   *  the burst ring and the reticle are: a hurt hull is disclosed out to 412.5u,
   *  past the 330u sight bubble, so a plume drawn UNDER the fog would be
   *  invisible in exactly the 330-412.5u annulus where the whole signal lives.
   *  Placed directly above `litZone` and BENEATH the tactical marks for
   *  litZone's own stated reason — blips, mines and the reticle must stay
   *  readable on top of it, and a plume is soft ambient texture, not a mark. */
  smoke: Container;
  /** Own mines (render/mines.ts) — fog-immune so your field is always readable. */
  mineChart: Container;
  /** OWN decoy buoys (render/decoys.ts) — fog-immune chart markers so your own
   *  buoy is always readable; a truesighted enemy buoy goes to decoyWorld. */
  decoyChart: Container;
  blip: Container;
  /**
   * HULL SILHOUETTES — own ship (main.ts), every contact (render/contacts.ts)
   * and the own firing-arc sectors (render/firing.ts).
   *
   * CHARTED AND ABOVE `blip` since this cycle, where it was the top of worldRoot
   * (fogged, and therefore under every return). A hull you can see must read over
   * the radar echo of itself; the sight-boundary softening the fog used to supply
   * is applied per hull instead — see this file's header.
   */
  ship: Container;
  /** Crosshair + bearing line (render/firing.ts) — fog-immune, above hulls. */
  aim: Container;
  /** Gun-shell burst rings (render/effects.ts) — fog-immune so a burst at radar
   *  range (the story's headline capability) is not ~85% eaten by the fog, the
   *  same reason the reticle lives above the fog. Only `burst`-kind effects
   *  route here; muzzle/spark/splash/sink/wake stay in the fogged world. */
  burstFx: Container;
  sweep: Container;
  // screen-space
  /** Out-of-zone STORM vignette (render/zone.ts) — dimensional purple since the
   *  storm palette landed, not the old red; behind the HUD readouts. */
  vignette: Container;
  hud: Container;
  /**
   * FOGHORN bearing chevrons (render/foghorn.ts, Story 4.5) — screen-space,
   * ABOVE `hud`. A bearing mark that a HUD readout could occlude is a bearing
   * mark you can miss, and the chevron lives at the viewport edge precisely
   * where the chrome bar, the vitals cluster and the hotbar all sit.
   *
   * Deliberately NOT inside `hud` and therefore NOT UI-scaled (main.ts's
   * applyUiScale scales `layers.hud` alone): the chevron is anchored to the
   * real viewport edge by an absolute px inset, exactly like `vignette`'s
   * full-viewport wash, and scaling it would walk the mark inward off its edge.
   */
  foghorn: Container;
}

/** Every layer name — the keys of `StageLayers`, as a value-level union. */
export type LayerName = keyof StageLayers;

// THE DECLARED Z-ORDER. Each array is added to its root IN THIS ORDER, and in
// Pixi order added == z-order, so these three lists ARE the scene's stacking.
// They exist as data rather than as the shape of a literal for one reason: the
// stack is a contract (hulls over returns, reticle over hulls, chevrons over the
// HUD) and a contract wants an assertion, but `createStage` needs a WebGL context
// no unit test has. Reading the order off the declaration keeps the pin honest.

/** worldRoot, bottom → top: everything the fog composite dims. */
export const WORLD_LAYER_ORDER = ['ocean', 'wake', 'projectile', 'mineWorld', 'decoyWorld'] as const;
/** chartRoot, bottom → top: everything above the fog. `ship` sits between `blip`
 *  and `aim` — over the returns, under the reticle and the burst rings. */
export const CHART_LAYER_ORDER = [
  'map',
  'zone',
  'litZone',
  'smoke',
  'mineChart',
  'decoyChart',
  'blip',
  'ship',
  'aim',
  'burstFx',
  'sweep',
] as const;
/** hudRoot, bottom → top: the vignette wash, the HUD, then the foghorn chevrons
 *  (added last == drawn above the HUD readouts). */
export const HUD_LAYER_ORDER = ['vignette', 'hud', 'foghorn'] as const;

type PlacedLayer =
  | (typeof WORLD_LAYER_ORDER)[number]
  | (typeof CHART_LAYER_ORDER)[number]
  | (typeof HUD_LAYER_ORDER)[number];

/** BUILD-FAILING EXHAUSTIVENESS: `createStage` builds its layer record from the
 *  three arrays, so a `StageLayers` key missing from all of them would be
 *  `undefined` at runtime and blow up on the first `addChild`. This resolves to
 *  `false` the moment that happens, and the initializer stops compiling. */
export const EVERY_LAYER_PLACED: Exclude<LayerName, PlacedLayer> extends never ? true : false = true;

export interface Stage {
  app: Application;
  /** Camera-transformed world content. */
  worldRoot: Container;
  /** Camera-transformed charted content (islands, boundary, blips, sweep). */
  chartRoot: Container;
  /** Screen-space fog overlay (render/fog.ts adds its baked sprite here). */
  fogSprite: Container;
  /** Screen-space truesight nameplate container (render/nameplates.ts) — above
   *  the world, below fog, so a plate resolves away with the fog exactly as
   *  DESIGN.md asks. It deliberately did NOT follow the hulls above the fog this
   *  cycle: a label is not a mark, and the fog is the only thing that fades it. */
  plateRoot: Container;
  /** Screen-space HUD. */
  hudRoot: Container;
  layers: StageLayers;
}

/**
 * Resolve after `ms`, and never reject. The losing half of the font race.
 *
 * The timer is CLEARED when the caller is done with it (see `boundedFontWait`),
 * because an un-cleared timeout keeps the event loop alive and, in a test
 * environment with fake timers, keeps a pending handle around long after the
 * assertion it existed for.
 */
function afterMs(ms: number): { promise: Promise<void>; cancel: () => void } {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<void>((resolve) => {
    handle = setTimeout(resolve, ms);
  });
  return { promise, cancel: () => clearTimeout(handle) };
}

/**
 * THE FONT WAIT IS BOUNDED (Story 7.1, NFR2) — `preloadFonts()` raced against a
 * timeout, so `createStage()` can never be held hostage by a third-party CDN.
 *
 * FIRST PAINT MUST NOT BE SOMEONE ELSE'S TO SPEND. `document.fonts.ready`
 * settles only once every pending font has resolved, and it does NOT reject on a
 * network stall — a Google Fonts host that is slow, throttled or blocked simply
 * never settles it, and the whole boot (canvas, loader, menu) waited behind it
 * indefinitely. The existing catch only ever covered a THROW, which is not the
 * failure mode that costs the load budget.
 *
 * Losing the race is not an error: Pixi falls back to a system mono face exactly
 * as the catch below already documents, and the real faces swap in the moment
 * they arrive. The bound is `CLIENT_CONFIG.boot.fontWaitMs`.
 *
 * EXPORTED so a test can prove the bound rather than trust it: the failure it
 * guards against is a promise that NEVER settles, which no assertion about
 * `createStage()` could observe without a WebGL context.
 */
export async function boundedFontWait(): Promise<void> {
  const timeout = afterMs(CLIENT_CONFIG.boot.fontWaitMs);
  try {
    await Promise.race([preloadFonts(), timeout.promise]);
  } finally {
    timeout.cancel();
  }
}

/** Preload Geist Mono so the first Pixi Text rasterizes with the right face. */
async function preloadFonts(): Promise<void> {
  // FontFaceSet.load wants a concrete family (not a fallback stack), so we take
  // the primary-face token rather than the comma stack. Quote it — the family
  // has a space.
  const mono = `"${CLIENT_CONFIG.type.monoFamily}"`;
  const display = `"${CLIENT_CONFIG.type.displayFamily}"`;
  try {
    await Promise.all([
      document.fonts.load(`600 16px ${mono}`),
      document.fonts.load(`400 12px ${mono}`),
      // Story 2.3 legibility lift (amendment 15): the micro sizes moved
      // 9→14 / 10→16 / 11→17 / 12→18 / 13→20, so the preload list moves with
      // them — nameplates (14), hotbar key chips (14) + quick-info/badge (16) +
      // tooltip head (17), the HUD ladder (18/20), and the display faces used by
      // the slot name (20) and tooltip description (18).
      document.fonts.load(`400 14px ${mono}`),
      document.fonts.load(`400 16px ${mono}`),
      document.fonts.load(`400 17px ${mono}`),
      document.fonts.load(`400 18px ${mono}`),
      document.fonts.load(`400 20px ${mono}`),
      document.fonts.load(`600 20px ${display}`),
      document.fonts.load(`400 18px ${display}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Font loading is best-effort; Pixi falls back to a system mono face.
  }
}

/** Add one empty child container per name, in the declared order, into `out`. */
function addLayers(parent: Container, names: readonly LayerName[], out: StageLayers): void {
  for (const name of names) {
    const c = new Container();
    parent.addChild(c);
    out[name] = c;
  }
}

/** Create the Pixi app and full layer tree. Returns once fonts + GPU are ready. */
export async function createStage(): Promise<Stage> {
  await boundedFontWait();

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: CLIENT_CONFIG.colors.void, // black void ocean base (behind the ocean disc)
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
    /**
     * ASK FOR THE DISCRETE GPU (Story 7.1, measured).
     *
     * Pixi defaults this to `'default'` (GlContextSystem), which on a machine
     * with switchable graphics lets the browser park a WebGL context on the
     * low-power part to save battery. On the reference MacBook — an Intel UHD
     * 630 alongside an AMD Radeon Pro 5300M — that is the difference between
     * the game running and the game not running, and it was invisible until
     * the frame budget was measured against a real display:
     *
     *   home screen, shipped build, 1600x900 at dpr 2
     *     integrated UHD 630 .... 50.8 ms/frame  (~20 FPS)
     *     discrete Radeon 5300M .. 16.7 ms/frame (~60 FPS, 0 long frames)
     *
     * Same bytes, same pixels, same scene — only the adapter differs. The
     * fully populated NFR1 scenario passes the whole frame budget with
     * 11-13.7 ms of headroom on the discrete part and misses 60 FPS outright
     * on the integrated one, so this hint is load-bearing rather than a
     * micro-optimisation.
     *
     * IT IS A HINT, NOT A GUARANTEE, and that is why nothing depends on it:
     * a machine with no discrete GPU simply keeps the one it has, which is the
     * integrated-hardware case beta still has to be honest about. The cost is
     * battery on dual-GPU laptops — the correct trade for a real-time game,
     * and the same one every browser game that asks for this makes.
     */
    powerPreference: 'high-performance',
  });

  const worldRoot = new Container();
  const plateRoot = new Container(); // screen-space nameplates (above world, below fog)
  const fogSprite = new Container(); // fog overlay parent (above world + plates, below chart)
  const chartRoot = new Container();
  const hudRoot = new Container();
  // Order added == z-order.
  app.stage.addChild(worldRoot, plateRoot, fogSprite, chartRoot, hudRoot);

  // Built from the declared order arrays — the cast is safe because
  // EVERY_LAYER_PLACED makes "a key in no array" a compile error.
  const layers = {} as StageLayers;
  addLayers(worldRoot, WORLD_LAYER_ORDER, layers);
  addLayers(chartRoot, CHART_LAYER_ORDER, layers);
  addLayers(hudRoot, HUD_LAYER_ORDER, layers);

  return { app, worldRoot, chartRoot, fogSprite, plateRoot, hudRoot, layers };
}
