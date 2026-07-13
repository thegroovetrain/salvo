// Client bootstrap for the offline-drive step. No server: the own ship is
// driven purely by local `stepShip` at the shared fixed dt, the camera follows
// with lead, wake gives speed feedback, and the telegraph HUD reads out state.
// This is the "does driving feel like a ship" harness — tune feel here.

import type { Container } from 'pixi.js';
import { CONFIG, generateMap, stepShip, type ShipState } from '@salvo/shared';
import { CLIENT_CONFIG } from './config.js';
import { createGameState } from './state.js';
import { createStage } from './render/stage.js';
import { buildMap } from './render/map.js';
import { Camera } from './render/camera.js';
import { ShipView, OWN_STYLE } from './render/ships.js';
import { Effects } from './render/effects.js';
import { Hud } from './render/hud.js';
import { KeyboardInput } from './input/keyboard.js';
import { startLoop } from './app/loop.js';
import { lerp, lerpAngle } from './util/math.js';

const HULL_HALF_LEN = 20; // u — keep the hull inside the boundary (placeholder)

function cloneShip(s: ShipState): ShipState {
  return { x: s.x, y: s.y, heading: s.heading, speed: s.speed };
}

/** Push the camera's world transform onto the world + chart containers. */
function applyCamera(camera: Camera, world: Container, chart: Container): void {
  const c = camera.screenCenter;
  const px = c.x - camera.center.x * camera.zoom + camera.shake.x;
  const py = c.y - camera.center.y * camera.zoom + camera.shake.y;
  world.scale.set(camera.zoom);
  world.position.set(px, py);
  chart.scale.set(camera.zoom);
  chart.position.set(px, py);
}

/**
 * Placeholder client-only boundary keep-in so the offline harness stays on the
 * ocean. Real shared ship-boundary collision arrives in build-order step 7;
 * this is intentionally trivial (clamp + damp) and lives only on the client.
 */
function keepInBounds(s: ShipState, mapRadius: number): void {
  const maxD = mapRadius - HULL_HALF_LEN;
  const d = Math.hypot(s.x, s.y);
  if (d <= maxD) return;
  s.x = (s.x / d) * maxD;
  s.y = (s.y / d) * maxD;
  if (s.speed > 0) s.speed *= 0.5;
}

async function main(): Promise<void> {
  const stage = await createStage();
  const host = document.getElementById('app');
  host?.replaceChildren(stage.app.canvas);

  const map = generateMap(CLIENT_CONFIG.mapSeed);
  buildMap(map, stage.layers);

  // Spawn on the +x spawn ring, facing map center.
  const spawn: ShipState = { x: map.spawnRing, y: 0, heading: Math.PI, speed: 0 };
  const state = createGameState(spawn);

  const camera = new Camera({
    radarRange: CONFIG.vision.radar,
    followRate: CLIENT_CONFIG.camera.followRate,
    leadSeconds: CLIENT_CONFIG.camera.leadSeconds,
    leadMax: CLIENT_CONFIG.camera.leadMax,
  });
  camera.setViewport(stage.app.screen.width, stage.app.screen.height);
  camera.snapTo(spawn);

  const keyboard = new KeyboardInput();
  keyboard.attach();

  const ownView = new ShipView(OWN_STYLE);
  stage.layers.ship.addChild(ownView.gfx);
  const effects = new Effects(stage.layers.wake);
  const hud = new Hud(stage.layers.hud);

  window.addEventListener('resize', () => {
    camera.setViewport(stage.app.screen.width, stage.app.screen.height);
  });

  const simTick = (dt: number): void => {
    state.ownShip.prev = cloneShip(state.ownShip.curr);
    const axes = keyboard.axes();
    stepShip(state.ownShip.curr, axes, CONFIG.ship, dt);
    keepInBounds(state.ownShip.curr, map.radius);
    effects.update(dt, state.ownShip.curr);
  };

  const render = (alpha: number, frameDt: number): void => {
    const { prev, curr } = state.ownShip;
    const ix = lerp(prev.x, curr.x, alpha);
    const iy = lerp(prev.y, curr.y, alpha);
    const ih = lerpAngle(prev.heading, curr.heading, alpha);
    const isp = lerp(prev.speed, curr.speed, alpha);
    ownView.update(ix, iy, ih);
    camera.update(frameDt, { x: ix, y: iy, heading: ih, speed: isp });
    applyCamera(camera, stage.worldRoot, stage.chartRoot);
    hud.update(curr, keyboard.axes(), stage.app.screen.width, stage.app.screen.height);
  };

  startLoop(stage.app, { simTick, render });
}

main().catch((err) => {
  console.error('client boot failed', err);
});
