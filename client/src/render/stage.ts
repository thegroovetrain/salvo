// Pixi 8 application + scene-graph construction. Thin Pixi adapter (not unit
// tested). Builds the layer tree in the exact z-order the plan specifies:
//
//   worldRoot   (camera-transformed): ocean, wake, projectile, ship
//   fogSprite   (screen space)        — fog overlay + sight hole (render/fog.ts)
//   chartRoot   (camera-transformed): map, blip, aim, burstFx, sweep   (fog-immune: above fog)
//   hudRoot     (screen space)        — telegraph HUD
//
// worldRoot and chartRoot share the same camera transform; fogSprite and hudRoot
// stay in screen space. `aim` (crosshair + bearing line) lives in chartRoot rather
// than worldRoot's `ship` layer because gun range exceeds sight range: aiming at a
// radar blip would otherwise place the reticle under the fog. The gun-arc sectors
// stay in `ship` — they're always inside the sight bubble, so fog is plan-correct
// there. Fonts are preloaded before any Text is created.

import { Application, Container } from 'pixi.js';

export interface StageLayers {
  // worldRoot children
  ocean: Container;
  wake: Container;
  projectile: Container;
  /** Enemy mines (render/mines.ts) — fogged; they only arrive when sighted. */
  mineWorld: Container;
  ship: Container;
  // chartRoot children
  map: Container;
  /** Storm circle (render/zone.ts) — charted, fog-immune; above the base map. */
  zone: Container;
  /** Star-shell lit zones (render/litZones.ts) — a fog-immune additive glow,
   *  beneath the tactical markers so blips/mines/reticle stay readable on top. */
  litZone: Container;
  /** Own mines (render/mines.ts) — fog-immune so your field is always readable. */
  mineChart: Container;
  /** Decoy buoys (render/decoys.ts) — fog-immune chart markers (own always, and
   *  any enemy buoy the observer legitimately truesights), above the base map. */
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
  /** Out-of-zone red vignette (render/zone.ts) — behind the HUD readouts. */
  vignette: Container;
  hud: Container;
}

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

/** Preload Geist Mono so the first Pixi Text rasterizes with the right face. */
async function preloadFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('600 16px "Geist Mono"'),
      document.fonts.load('400 12px "Geist Mono"'),
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
    background: 0x000000,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });

  const worldRoot = new Container();
  const fogSprite = new Container(); // fog overlay parent (above world, below chart)
  const chartRoot = new Container();
  const hudRoot = new Container();
  // Order added == z-order.
  app.stage.addChild(worldRoot, fogSprite, chartRoot, hudRoot);

  const layers: StageLayers = {
    ocean: child(worldRoot),
    wake: child(worldRoot),
    projectile: child(worldRoot),
    mineWorld: child(worldRoot),
    ship: child(worldRoot),
    map: child(chartRoot),
    zone: child(chartRoot),
    litZone: child(chartRoot),
    mineChart: child(chartRoot),
    decoyChart: child(chartRoot),
    blip: child(chartRoot),
    aim: child(chartRoot),
    burstFx: child(chartRoot),
    sweep: child(chartRoot),
    vignette: child(hudRoot),
    hud: child(hudRoot),
  };

  return { app, worldRoot, chartRoot, fogSprite, hudRoot, layers };
}
