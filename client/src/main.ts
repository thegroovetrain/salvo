// Client bootstrap. Connects to the arena, rebuilds the server's map from
// welcome (seed + playerCap), sends one input per 50ms sim tick (keys drive,
// mouse aims + hold-to-fire), and renders own ship (predicted, default) +
// contacts (interp at -100ms) + dead-reckoned shells + combat feel effects.

import type { Container } from 'pixi.js';
import type { Room } from 'colyseus.js';
import { CONFIG, isOutside, zoneRadiusAt, type GameMap } from '@salvo/shared';
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
import { Mines } from './render/mines.js';
import { Fog } from './render/fog.js';
import { Radar } from './render/radar.js';
import { Zone, type ZoneDisplay } from './render/zone.js';
import { Hud, cooldownReadyFraction, type OwnStatus, type ZoneHud } from './render/hud.js';
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
  mines: Mines;
  fog: Fog;
  radar: Radar;
  zone: Zone;
  hud: Hud;
  /** Colyseus room — polled each frame for the public zone plane (slow state). */
  room: Room;
  /** Full map radius (u) — the zone's derived-radius baseline. */
  mapRadius: number;
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
    weapon: you?.weapon ?? 0,
    alive: you?.alive ?? true,
    respawnInMs: eta != null ? Math.max(0, eta - g.clock.serverNow()) : 0,
  };
}

/** Live safe radius + state, derived locally from the schema's zone plane. */
interface ZoneView {
  state: ZoneDisplay;
  radius: number; // u
  startT: number; // server ms the timeline was anchored at
}

/** Read the public zone plane off the polled room schema (fail-safe to idle). */
function zoneView(g: Game, now: number): ZoneView {
  const s = g.room.state as { zoneState?: string; zoneStartT?: number } | undefined;
  const state = (s?.zoneState ?? 'idle') as ZoneDisplay;
  const startT = s?.zoneStartT ?? 0;
  // Derive the radius locally from CONFIG for a smooth ring (see ArenaState
  // JSDoc). Real clients never see a zoneOverride, so CONFIG matches the server.
  const radius = state === 'idle' ? g.mapRadius : zoneRadiusAt(now, startT, g.mapRadius, CONFIG.zone);
  return { state, radius, startT };
}

/** M:SS clock for the grace countdown. */
function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Compact top-center storm readout for the current zone view. */
function zoneHud(zv: ZoneView, now: number, inStorm: boolean): ZoneHud {
  let line = '';
  if (zv.state === 'grace') {
    const sec = Math.max(0, Math.ceil((CONFIG.zone.grace - (now - zv.startT)) / 1000));
    line = `STORM ${fmtClock(sec)}`;
  } else if (zv.state === 'shrinking') {
    line = 'STORM CLOSING';
  } else if (zv.state === 'closed') {
    line = 'STORM CLOSED';
  }
  return { line, inStorm };
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

  // Effects is built before Projectiles so the torpedo-wake trail can feed the
  // shared effects pool via a closure.
  const effects = new Effects(stage.layers.wake, stage.layers.projectile);

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
    projectiles: new Projectiles(stage.layers.projectile, (x, y) => effects.spawnEffect('torpwake', x, y)),
    firing: new FiringUX(stage.layers.ship, stage.layers.aim),
    effects,
    mines: new Mines(stage.layers.mineChart, stage.layers.mineWorld),
    fog: new Fog(stage.fogSprite),
    radar: new Radar(stage.layers.blip, stage.layers.sweep),
    zone: new Zone(stage.layers.zone, stage.layers.vignette, map.radius, CONFIG.zone.endRadiusFraction),
    hud: new Hud(stage.layers.hud),
    room: conn.room,
    mapRadius: map.radius,
    cameraSnapped: false,
    lastOwn: { x: 0, y: 0 },
  };
  g.clock.addSample(welcome.t);
  g.fog.rebake(stage.app.screen.width, stage.app.screen.height, camera.zoom);
  bindRoom(conn, { ...g, onOwnSpawn: (x, y) => camera.snapTo({ x, y }) });
  return g;
}

function renderOwn(g: Game, pose: RenderPose, status: OwnStatus, zone: ZoneHud, frameDt: number): void {
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
  g.hud.update(pose, g.keyboard.axes(), status, zone, g.stage.app.screen.width, g.stage.app.screen.height);
}

/** Reload duration (ms) per weapon, indexed by WeaponId (for the ready fraction). */
const WEAPON_RELOADS = [CONFIG.gun.reload, CONFIG.torpedo.reload, CONFIG.mine.dropCooldown];

/** Weapon arc/marker + crosshair while alive; hidden once sunk. */
function renderFiring(g: Game, pose: RenderPose, status: OwnStatus): void {
  if (!status.alive) {
    g.firing.hide();
    return;
  }
  const cursor = g.camera.screenToWorld(g.mouse.screenPos);
  const aim = worldAim(pose.x, pose.y, cursor);
  // Drive the firing UX from the client-selected weapon (immediate), reading its
  // cooldown from the server-authoritative cooldowns[] for that same slot.
  const weapon = g.keyboard.weapon;
  const ready = cooldownReadyFraction(status.cooldowns[weapon] ?? 0, WEAPON_RELOADS[weapon]);
  g.firing.update(pose, aim, weapon, ready, cursor);
}

function makeCallbacks(g: Game): LoopCallbacks {
  return {
    simTick: () => {
      const cursor = g.camera.screenToWorld(g.mouse.screenPos);
      const aim = worldAim(g.lastOwn.x, g.lastOwn.y, cursor);
      const input = g.sampler.sample(g.keyboard.axes(), { aim, fire: g.mouse.fire, weapon: g.keyboard.weapon });
      if (g.state.mode === 'predict') g.predictor.localTick(input);
    },
    render: (alpha, frameDt) => {
      const pose = ownPose(g, alpha, frameDt);
      const status = ownStatus(g);
      const now = g.clock.serverNow();
      const zv = zoneView(g, now);
      const inStorm = !!pose && zv.state !== 'idle' && isOutside(pose, zv.radius);
      if (pose) renderOwn(g, pose, status, zoneHud(zv, now, inStorm), frameDt);
      const w = g.stage.app.screen.width;
      const h = g.stage.app.screen.height;
      g.zone.update(zv.radius, zv.state, inStorm, now / 1000, w, h);
      // Own pose feeds the shell sight-bubble cull (shells outside fog vanish).
      g.projectiles.render(now, pose ?? undefined);
      g.contactViews.render(g.contacts, now - CLIENT_CONFIG.net.interpDelayMs, now, frameDt * 1000);
      g.radar.render(pose, now);
      // The fog hole tracks the own ship's screen position (post camera update).
      const hole = pose ? g.camera.worldToScreen(pose) : g.camera.screenCenter;
      g.fog.update(hole.x, hole.y);
      applyCamera(g.camera, g.stage.worldRoot, g.stage.chartRoot);
    },
  };
}

/** Trailing-edge debounce (ms) for the fog re-bake during drag-resizing. */
const FOG_REBAKE_DEBOUNCE_MS = 150;

/**
 * Track viewport + fog across resizes. Hooks the renderer's own 'resize'
 * event rather than window 'resize': Pixi 8's ResizePlugin defers the actual
 * renderer.resize() to the next rAF, so a raw window listener reads
 * stage.app.screen.width/height BEFORE that resize lands and stays one event
 * behind. The renderer's 'resize' event fires synchronously once the GPU
 * resize has actually happened (with the fresh width/height as arguments),
 * so camera.setViewport always sees current dimensions.
 *
 * The camera viewport update is cheap and applies immediately; the fog
 * re-bake is a full-canvas OffscreenCanvas draw, so it's debounced to the
 * trailing edge of a resize burst (~150ms of quiet) to avoid hitching while
 * the user drags the window edge.
 */
function bindResize(stage: Stage, game: Game): void {
  let fogRebakeTimer: ReturnType<typeof setTimeout> | null = null;
  stage.app.renderer.on('resize', (width: number, height: number) => {
    game.camera.setViewport(width, height);
    if (fogRebakeTimer !== null) clearTimeout(fogRebakeTimer);
    fogRebakeTimer = setTimeout(() => {
      fogRebakeTimer = null;
      // Zoom derives from the viewport, so resize covers the fog's rebake-on-zoom too.
      game.fog.rebake(width, height, game.camera.zoom);
    }, FOG_REBAKE_DEBOUNCE_MS);
  });
}

/**
 * Immediately send + locally apply an all-stop, no-fire input. Wired to
 * document visibility + window blur so a backgrounded tab can't leave the
 * last real input (throttle + fire held) running server-side for the whole
 * time it's hidden — the server keeps applying the latest input it has every
 * tick. Routes through the sampler so seq stays monotonic with the regular
 * tick cadence, and through the predictor so the pending-input ring (used to
 * replay on reconcile) stays consistent with what was actually sent.
 */
function sendNeutralInput(g: Game): void {
  const msg = g.sampler.sendNeutralNow();
  if (g.state.mode === 'predict') g.predictor.localTick(msg);
}

/** Neutralize input the moment the tab is hidden or the window loses focus. */
function bindVisibility(game: Game): void {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sendNeutralInput(game);
  });
  window.addEventListener('blur', () => sendNeutralInput(game));
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
  bindResize(stage, game);
  bindVisibility(game);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') toggleMode(game);
  });

  startLoop(stage.app, makeCallbacks(game));
}

main().catch((err) => {
  console.error('client boot failed', err);
});
