// Pixi 8 application + scene-graph construction. Thin Pixi adapter (not unit
// tested). Builds the layer tree in the exact z-order the plan specifies:
//
//   worldRoot   (camera-transformed): ocean, wake, projectile, ship
//   plateRoot   (screen space)        — truesight nameplates (render/nameplates.ts)
//   fogSprite   (screen space)        — fog overlay + sight hole (render/fog.ts)
//   chartRoot   (camera-transformed): map, smoke, blip, aim, burstFx, sweep   (fog-immune: above fog)
//   hudRoot     (screen space)        — telegraph HUD, then foghorn chevrons
//
// worldRoot and chartRoot share the same camera transform; plateRoot, fogSprite,
// and hudRoot stay in screen space. plateRoot sits BELOW the fog composite so the
// plates dim/occlude with the fog exactly like the hulls they label (DESIGN:
// nameplates fade with truesight resolution). `aim` (crosshair + bearing line) lives in chartRoot rather
// than worldRoot's `ship` layer because gun range exceeds sight range: aiming at a
// radar blip would otherwise place the reticle under the fog. The gun-arc sectors
// stay in `ship` — they're always inside the sight bubble, so fog is plan-correct
// there. Fonts are preloaded before any Text is created.

import { Application, Container } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';

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
  ship: Container;
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
  /** Crosshair + bearing line (render/firing.ts) — fog-immune, above blips. */
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

export interface Stage {
  app: Application;
  /** Camera-transformed world content. */
  worldRoot: Container;
  /** Camera-transformed charted content (islands, boundary, blips, sweep). */
  chartRoot: Container;
  /** Screen-space fog overlay (render/fog.ts adds its baked sprite here). */
  fogSprite: Container;
  /** Screen-space truesight nameplate container (render/nameplates.ts) — above
   *  the world, below fog — plates inherit fog occlusion like the hulls they label. */
  plateRoot: Container;
  /** Screen-space HUD. */
  hudRoot: Container;
  layers: StageLayers;
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

function child(parent: Container): Container {
  const c = new Container();
  parent.addChild(c);
  return c;
}

/** Create the Pixi app and full layer tree. Returns once fonts + GPU are ready. */
export async function createStage(): Promise<Stage> {
  await preloadFonts();

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: CLIENT_CONFIG.colors.void, // black void ocean base (behind the ocean disc)
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });

  const worldRoot = new Container();
  const plateRoot = new Container(); // screen-space nameplates (above world, below fog)
  const fogSprite = new Container(); // fog overlay parent (above world + plates, below chart)
  const chartRoot = new Container();
  const hudRoot = new Container();
  // Order added == z-order.
  app.stage.addChild(worldRoot, plateRoot, fogSprite, chartRoot, hudRoot);

  const layers: StageLayers = {
    ocean: child(worldRoot),
    wake: child(worldRoot),
    projectile: child(worldRoot),
    mineWorld: child(worldRoot),
    decoyWorld: child(worldRoot),
    ship: child(worldRoot),
    map: child(chartRoot),
    zone: child(chartRoot),
    litZone: child(chartRoot),
    smoke: child(chartRoot),
    mineChart: child(chartRoot),
    decoyChart: child(chartRoot),
    blip: child(chartRoot),
    aim: child(chartRoot),
    burstFx: child(chartRoot),
    sweep: child(chartRoot),
    vignette: child(hudRoot),
    hud: child(hudRoot),
    foghorn: child(hudRoot), // added last == drawn above the HUD readouts
  };

  return { app, worldRoot, chartRoot, fogSprite, plateRoot, hudRoot, layers };
}
