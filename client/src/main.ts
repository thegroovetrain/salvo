// Client bootstrap. Connects to the arena, rebuilds the server's map from
// welcome (seed + playerCap), sends one input per 50ms sim tick (keys drive,
// mouse aims + hold-to-fire), and renders own ship (predicted, default) +
// contacts (interp at -100ms) + dead-reckoned shells + combat feel effects.

import type { Container } from 'pixi.js';
import { CONFIG, type GameMap } from '@salvo/shared';
import { CLIENT_CONFIG } from './config.js';
import { createGameState, type GameState } from './state.js';
import { createStage, type Stage } from './render/stage.js';
import { buildMap } from './render/map.js';
import { Camera } from './render/camera.js';
import { ShipView, OWN_STYLE } from './render/ships.js';
import { ContactViews } from './render/contacts.js';
import { Projectiles } from './render/projectiles.js';
import { FiringUX } from './render/firing.js';
import { Effects } from './render/effects.js';
import { Hud, cooldownReadyFraction, type OwnStatus } from './render/hud.js';
import { KeyboardInput } from './input/keyboard.js';
import { MouseInput, worldAim } from './input/mouse.js';
import { startLoop, type LoopCallbacks } from './app/loop.js';
import { connect, mapFromWelcome, type Connection } from './net/connection.js';
import { ServerClock } from './net/clock.js';
import { ContactStore, SnapshotBuffer } from './net/snapshots.js';
import { bindRoom } from './net/roomBindings.js';
import { Predictor, type RenderPose } from './sim/prediction.js';
import { InputSampler } from './sim/inputSampler.js';
import { showBanner, hideBanner } from './util/banner.js';

/** Everything the loop closures share, assembled once at boot. */
interface Game {
  stage: Stage;
  state: GameState;
  clock: ServerClock;
  ownBuffer: SnapshotBuffer;
  contacts: ContactStore;
  predictor: Predictor;
  camera: Camera;
  keyboard: KeyboardInput;
  mouse: MouseInput;
  sampler: InputSampler;
  ownView: ShipView;
  contactViews: ContactViews;
  projectiles: Projectiles;
  firing: FiringUX;
  effects: Effects;
  hud: Hud;
  cameraSnapped: boolean;
  lastOwn: { x: number; y: number };
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

/** Toggle predict <-> interp (A/B comparison per the plan). Key: P. */
function toggleMode(g: Game): void {
  g.state.mode = g.state.mode === 'predict' ? 'interp' : 'predict';
  if (g.state.mode === 'predict') g.predictor.forceSnap(); // re-init from next frame
  console.log('[net] own-ship render mode ->', g.state.mode);
  showBanner(`NETCODE: ${g.state.mode.toUpperCase()}`, { autoHideMs: 1500 });
}

/** Own-ship pose for this render frame, per the active mode. */
function ownPose(g: Game, alpha: number, frameDt: number): RenderPose | null {
  if (g.state.mode === 'predict') {
    if (!g.predictor.isInitialized) return null;
    g.predictor.decayError(frameDt);
    return g.predictor.renderPose(alpha);
  }
  return g.ownBuffer.sampleAt(g.clock.serverNow() - CLIENT_CONFIG.net.ownDelayMs);
}

/** Derive HUD/combat status from the latest server own-ship + respawn ETA. */
function ownStatus(g: Game): OwnStatus {
  const you = g.state.net.you;
  const eta = g.state.respawnEta;
  return {
    hp: you?.hp ?? CONFIG.ship.hp,
    cooldowns: you?.cooldowns ?? [0, 0, 0],
    alive: you?.alive ?? true,
    respawnInMs: eta != null ? Math.max(0, eta - g.clock.serverNow()) : 0,
  };
}

function buildGame(stage: Stage, conn: Connection, map: GameMap): Game {
  const { welcome } = conn;
  const camera = new Camera({
    radarRange: CONFIG.vision.radar,
    followRate: CLIENT_CONFIG.camera.followRate,
    leadSeconds: CLIENT_CONFIG.camera.leadSeconds,
    leadMax: CLIENT_CONFIG.camera.leadMax,
  });
  camera.setViewport(stage.app.screen.width, stage.app.screen.height);

  const keyboard = new KeyboardInput();
  keyboard.attach();
  const mouse = new MouseInput();
  mouse.attach();

  const ownView = new ShipView(OWN_STYLE);
  ownView.gfx.visible = false;
  stage.layers.ship.addChild(ownView.gfx);

  const g: Game = {
    stage,
    state: createGameState(welcome.sessionId),
    clock: new ServerClock(),
    ownBuffer: new SnapshotBuffer(),
    contacts: new ContactStore(),
    predictor: new Predictor({ radius: map.radius, islands: map.islands }),
    camera,
    keyboard,
    mouse,
    sampler: new InputSampler((type, msg) => conn.room.send(type, msg)),
    ownView,
    contactViews: new ContactViews(stage.layers.ship),
    projectiles: new Projectiles(stage.layers.projectile),
    firing: new FiringUX(stage.layers.ship),
    effects: new Effects(stage.layers.wake, stage.layers.projectile),
    hud: new Hud(stage.layers.hud),
    cameraSnapped: false,
    lastOwn: { x: 0, y: 0 },
  };
  g.clock.addSample(welcome.t);
  bindRoom(conn, { ...g, onOwnSpawn: (x, y) => camera.snapTo({ x, y }) });
  return g;
}

function renderOwn(g: Game, pose: RenderPose, status: OwnStatus, frameDt: number): void {
  if (!g.cameraSnapped) {
    g.camera.snapTo(pose);
    g.cameraSnapped = true;
  }
  g.ownView.gfx.visible = true;
  g.ownView.setDowned(!status.alive);
  g.ownView.update(pose.x, pose.y, pose.heading);
  g.camera.update(frameDt, pose);
  g.effects.update(frameDt, pose);
  g.lastOwn = { x: pose.x, y: pose.y };
  renderFiring(g, pose, status);
  g.hud.update(pose, g.keyboard.axes(), status, g.stage.app.screen.width, g.stage.app.screen.height);
}

/** Gun-arc sectors + crosshair while alive; hidden once sunk. */
function renderFiring(g: Game, pose: RenderPose, status: OwnStatus): void {
  if (!status.alive) {
    g.firing.hide();
    return;
  }
  const cursor = g.camera.screenToWorld(g.mouse.screenPos);
  const aim = worldAim(pose.x, pose.y, cursor);
  const ready = cooldownReadyFraction(status.cooldowns[0] ?? 0, CONFIG.gun.reload);
  g.firing.update(pose, aim, ready, cursor);
}

function makeCallbacks(g: Game): LoopCallbacks {
  return {
    simTick: () => {
      const cursor = g.camera.screenToWorld(g.mouse.screenPos);
      const aim = worldAim(g.lastOwn.x, g.lastOwn.y, cursor);
      const input = g.sampler.sample(g.keyboard.axes(), { aim, fire: g.mouse.fire, weapon: 0 });
      if (g.state.mode === 'predict') g.predictor.localTick(input);
    },
    render: (alpha, frameDt) => {
      const pose = ownPose(g, alpha, frameDt);
      const status = ownStatus(g);
      if (pose) renderOwn(g, pose, status, frameDt);
      const now = g.clock.serverNow();
      g.projectiles.render(now);
      g.contactViews.render(g.contacts, now - CLIENT_CONFIG.net.interpDelayMs, now);
      applyCamera(g.camera, g.stage.worldRoot, g.stage.chartRoot);
    },
  };
}

async function connectOrDie(stage: Stage): Promise<Connection | null> {
  showBanner('CONNECTING...');
  try {
    const conn = await connect();
    hideBanner();
    return conn;
  } catch (err) {
    console.error('[net] connection failed', err);
    showBanner('CONNECTION FAILED - IS THE SERVER RUNNING ON :2567?', { error: true });
    stage.app.ticker.stop();
    return null;
  }
}

async function main(): Promise<void> {
  const stage = await createStage();
  document.getElementById('app')?.replaceChildren(stage.app.canvas);

  const conn = await connectOrDie(stage);
  if (!conn) return;

  // The server's map, regenerated deterministically from the welcome seed + cap.
  const map = mapFromWelcome(conn.welcome);
  buildMap(map, stage.layers);

  const game = buildGame(stage, conn, map);
  window.addEventListener('resize', () => {
    game.camera.setViewport(stage.app.screen.width, stage.app.screen.height);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') toggleMode(game);
  });

  startLoop(stage.app, makeCallbacks(game));
}

main().catch((err) => {
  console.error('client boot failed', err);
});
