// Pixi 8 application + scene-graph construction. Thin Pixi adapter (not unit
// tested). Builds the layer tree in the exact z-order the plan specifies, and
// the order is DECLARED — `STAGE_ROOT_ORDER` for the four stage roots, the three
// `*_LAYER_ORDER` arrays for their children — rather than implied by the order of
// an `addChild` argument list or an object literal, so a test can assert it
// without a GPU and a future refactor cannot quietly re-stack the scene:
//
//   worldRoot   (camera-transformed): ocean, wake, projectile, mines, buoys
//   fogSprite   (screen space)        — fog overlay + sight hole (render/fog.ts)
//   chartRoot   (camera-transformed): map, smoke, blip, SHIP, PLATE, aim, burstFx,
//                                     sweep  (fog-immune: above fog)
//   hudRoot     (screen space)        — telegraph HUD, then foghorn chevrons
//
// A NAME IS NEVER OBSCURED BY TERRAIN (this cycle, Eric: *"in game, names need to
// appear above all players and in front of islands, not behind. they should never
// be obscured by terrain."* — and, on seeing the first draft of the stack,
// *"i think i should be able to see aiming reticles over it. Just not terrain."*).
// The nameplate container used to be `plateRoot`, the SECOND root mounted, so it
// sat under every single chart layer — including `map`, whose island bodies and
// contour bands are filled at `alpha: 1` (render/map.ts), and `ship`. A callsign
// was therefore painted over by any island it crossed and by every hull
// silhouette on the water, which is the exact opposite of what a label is for.
//
// SO THE PLATE IS NOW A CHART LAYER, `plate`, SEATED DIRECTLY BETWEEN `ship` AND
// `aim` — the same seat `ship` itself won last cycle, one rung up. That single
// position expresses BOTH halves of Eric's ruling in the one declared array:
// above `map` and above `ship` (never obscured by terrain, above all players),
// and below `aim`, `burstFx` and `sweep` (the reticle, the aim preview, the burst
// rings and the sweep read OVER a name). The hull lift's own rule — *"the marks
// you aim and read damage with must never be occluded"* — is therefore extended
// to labels rather than broken by them, and `CHART_LAYER_ORDER` now reads as the
// whole stacking contract top to bottom.
//
// IT IS A SCREEN-SPACE LAYER INSIDE A CAMERA-TRANSFORMED ROOT, WHICH IS THE ONE
// UNUSUAL THING IN THIS FILE. Plates are positioned by `camera.worldToScreen` and
// hold a constant 14px at any zoom precisely so the text never scales or tilts
// (render/nameplates.ts), so they cannot simply inherit `chartRoot`'s transform.
// `applyCamera` therefore writes the EXACT INVERSE of that transform onto this
// one layer, so its children land in raw screen pixels while its z-position stays
// in the chart stack. The alternative was splitting `chartRoot` into two
// camera-transformed roots to thread a screen-space root between them — a fourth
// root, a fourth declared array, a wider `applyCamera` and a split of a ratified
// order array, all to express a stacking one array index already says. The
// inverse is written in `applyCamera` and nowhere else, for the same reason the
// forward transform is: one site, impossible to forget.
//
// THE COST OF THE LIFT IS THE SAME BILL THE HULLS PAID, AND IT IS PAID THE SAME
// WAY. Being under the fog gave a plate the composite's feathered sight hole for
// free — a callsign dimmed as its hull neared the edge of the bubble, which is
// what DESIGN.md's Nameplate row means by *"they fade in/out with truesight
// resolution"*. `chartRoot` is above `fogSprite`, so that dimming is gone and the
// plate's alpha now carries the feather itself: `fader × hullSightSoftness(...)`,
// the SAME per-frame `HullSoftness` value the hull and the aggro mark already
// multiply in (one softness per hull per frame — render/contacts.ts). The
// own-ship plate stays at alpha 1: the observer is at distance 0, so its softness
// is 1 by construction.
//
// THE FEATHER IS SAMPLED AT THE HULL, NOT AT THE PLATE, AND THAT IS A CHOICE
// RATHER THAN A REPRODUCTION. A plate is drawn above its hull's bounding circle
// — up to ~73u in world terms for a battleship at typical zoom, against a
// feather band only 82.5u wide — so the fog composite, being a screen-space
// texture, used to fade a plate by the plate's OWN position. Matching that
// exactly would mean a callsign north of you reading at full strength over a
// hull the fog is already eating, and the same pair south of you reading the
// other way round: a 4x brightness split between two contacts at equal range,
// with no in-fiction cause. Sampling at the hull instead makes the label fade
// WITH the thing it labels, which is what `render/contacts.ts`'s HullSoftness
// contract says and what the eye expects of a label. So this is NOT a
// byte-identical restoration of the old composite, and nothing here should
// claim it is — the curve, the radii and the endpoint are the fog's own; the
// sample POINT is deliberately the hull's.
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
// worldRoot and chartRoot share the same camera transform; fogSprite and hudRoot
// stay in screen space, and the `plate` layer is put BACK into screen space by an
// inverse transform (above). `aim` (crosshair + bearing line) lives in chartRoot
// because gun range exceeds sight range: aiming at a radar blip would otherwise
// place the reticle under the fog. Fonts are preloaded before any Text is
// created.

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
 * SHARE one transform (while fogSprite/hudRoot stay in screen space) is this
 * module's contract.
 *
 * ...AND THE `plate` LAYER IS PUT BACK INTO SCREEN SPACE HERE. It is a CHILD of
 * `chart` — seated between `ship` and `aim` so a callsign reads over terrain and
 * hulls but under the reticle (see this file's header) — while its contents are
 * positioned in raw screen pixels by `camera.worldToScreen`. Writing the exact
 * inverse of the transform just applied to its parent cancels the parent out:
 * Pixi composes `parent ∘ child`, so a child point `p` lands at
 * `(px + zoom·(−px/zoom + p/zoom)) = p`. The inverse belongs in THIS function
 * rather than at the call sites for exactly the reason the forward transform
 * does — one site, written once per frame, impossible for a future caller to
 * forget and leave the plates drifting against the camera.
 */
export function applyCamera(camera: Camera, world: Container, chart: Container, plate: Container): void {
  // ONE READ OF THE ZOOM, AND THE WHOLE FRAME IS REJECTED OR NONE OF IT IS.
  //
  // `Camera.zoom` is a RECOMPUTING GETTER (`baseZoom × zoomFactor × userZoom`),
  // so reading it five times invites a guard that tests a different number from
  // the one it divides. Hoisted to a const, then checked BEFORE anything is
  // written.
  //
  // The check has to be first, and that is a correction of this cycle's own
  // first attempt (found at the review gate): it originally wrote the forward
  // transform, THEN reset the plate to identity on a bad zoom. That bought
  // nothing at all — `plate` is a CHILD of `chart`, so a NaN already committed
  // to `chart.scale` composes straight through an identity child and the plates
  // land at NaN anyway (at `zoom = 0` they collapse onto a single point). The
  // only reset that means anything is to write NOTHING and leave the entire
  // camera at its last good state, which is also strictly less code.
  //
  // Both ends of the range are rejected, and both are load-bearing: a subnormal
  // like 5e-324 is finite and positive while `1/it` overflows to Infinity, and
  // `zoom = Infinity` has a perfectly finite reciprocal of 0 — testing either
  // one alone lets the other through. The camera's own clamp keeps zoom well
  // above 0, so this is belt-and-braces rather than a live branch.
  const z = camera.zoom;
  const inv = 1 / z;
  if (!(z > 0) || !Number.isFinite(z) || !Number.isFinite(inv)) return;
  const c = camera.screenCenter;
  const px = c.x - camera.center.x * z + camera.shake.x;
  const py = c.y - camera.center.y * z + camera.shake.y;
  world.scale.set(z);
  world.position.set(px, py);
  chart.scale.set(z);
  chart.position.set(px, py);
  plate.scale.set(inv);
  plate.position.set(-px * inv, -py * inv);
}

export interface StageLayers {
  // worldRoot children
  ocean: Container;
  wake: Container;
  projectile: Container;
  /** Enemy mines (render/mines.ts) — fogged; they only arrive when sighted. */
  mineWorld: Container;
  /** Truesighted enemy radar buoys (render/buoys.ts) — fogged; they only
   *  arrive when the observer legitimately sees them (mineWorld precedent). */
  buoyWorld: Container;
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
  /** OWN radar buoys (render/buoys.ts) — fog-immune chart markers so your own
   *  buoy is always readable; a truesighted enemy buoy goes to buoyWorld. */
  buoyChart: Container;
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
  /**
   * TRUESIGHT NAMEPLATES (render/nameplates.ts) — the callsign floated above
   * every truesight combatant hull.
   *
   * A CHART LAYER SINCE THIS CYCLE, and seated here on purpose: directly above
   * `ship` so a name reads over terrain and over every hull (Eric: names *"should
   * never be obscured by terrain"*), and directly below `aim` so the reticle, the
   * aim preview, the burst rings and the sweep all read over a name (Eric: *"i
   * think i should be able to see aiming reticles over it"*). It was the
   * `plateRoot` stage root — mounted second, under the whole chart — until then.
   *
   * ITS CONTENTS ARE SCREEN-SPACE despite the camera-transformed parent:
   * `applyCamera` writes the inverse of the chart transform onto this container
   * every frame, so a plate holds a constant 14px and never tilts with the hull.
   * See this file's header for why that beat splitting `chartRoot` in two.
   */
  plate: Container;
  /** Crosshair + bearing line (render/firing.ts) — fog-immune, above hulls and
   *  above nameplates. */
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
// stack is a contract (hulls over returns, names over hulls, reticle over names,
// chevrons over the HUD) and a contract wants an assertion, but `createStage`
// needs a WebGL context no unit test has. Reading the order off the declaration
// keeps the pin honest.

/** worldRoot, bottom → top: everything the fog composite dims. */
export const WORLD_LAYER_ORDER = ['ocean', 'wake', 'projectile', 'mineWorld', 'buoyWorld'] as const;
/** chartRoot, bottom → top: everything above the fog. The four rungs in the
 *  middle are the whole legibility contract, read upward: `blip` (radar paint),
 *  `ship` (the hull that outranks its own echo), `plate` (the name that outranks
 *  terrain and hulls), then `aim`/`burstFx`/`sweep` (the marks you aim and read
 *  damage with, which outrank everything below them). */
export const CHART_LAYER_ORDER = [
  'map',
  'zone',
  'litZone',
  'smoke',
  'mineChart',
  'buoyChart',
  'blip',
  'ship',
  'plate',
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
  /** Screen-space HUD. */
  hudRoot: Container;
  layers: StageLayers;
}

/** Every stage-root name — the keys of `Stage` that ARE roots. `app` is the Pixi
 *  application and `layers` is the child record; the rest are the containers
 *  mounted directly on `app.stage`. */
export type StageRootName = Exclude<keyof Stage, 'app' | 'layers'>;

/**
 * THE DECLARED ROOT ORDER, bottom → top. Same law as the three `*_LAYER_ORDER`
 * arrays above and for the same reason, one level up: `createStage` ITERATES
 * this array to build and mount the roots, so the array IS the stacking rather
 * than a comment about it.
 *
 * It was an inline `app.stage.addChild(...)` argument list until this cycle,
 * which made it the one part of the scene's stacking no test could see — and
 * `deferred-work.md` named that gap by name, noting it *"leaves the reveal's
 * 'hide, never fade' rule unpinned"*. This cycle retires the `plateRoot` root
 * (the nameplate container became the `plate` CHART LAYER), which is exactly the
 * kind of root-order change that gap left unguarded, so the array is declared
 * rather than the call merely edited.
 */
export const STAGE_ROOT_ORDER = ['worldRoot', 'fogSprite', 'chartRoot', 'hudRoot'] as const;

/** BUILD-FAILING EXHAUSTIVENESS, the root-level sibling of `EVERY_LAYER_PLACED`:
 *  a fifth root added to `Stage` but forgotten in `STAGE_ROOT_ORDER` would be
 *  `undefined` in the returned stage and blow up at its first `addChild`. This
 *  resolves to `false` the moment that happens, and stops compiling. */
export const EVERY_ROOT_PLACED: Exclude<StageRootName, (typeof STAGE_ROOT_ORDER)[number]> extends never
  ? true
  : false = true;

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

  // Order added == z-order, and the order IS `STAGE_ROOT_ORDER` — mounted by
  // iterating it rather than by an argument list, so the pin cannot drift from
  // the scene. The cast is safe because EVERY_ROOT_PLACED makes "a root missing
  // from the array" a compile error.
  const roots = {} as Record<StageRootName, Container>;
  for (const name of STAGE_ROOT_ORDER) {
    const c = new Container();
    app.stage.addChild(c);
    roots[name] = c;
  }

  // Built from the declared order arrays — the cast is safe because
  // EVERY_LAYER_PLACED makes "a key in no array" a compile error.
  const layers = {} as StageLayers;
  addLayers(roots.worldRoot, WORLD_LAYER_ORDER, layers);
  addLayers(roots.chartRoot, CHART_LAYER_ORDER, layers);
  addLayers(roots.hudRoot, HUD_LAYER_ORDER, layers);

  return { app, ...roots, layers };
}
