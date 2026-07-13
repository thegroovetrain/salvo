// Client bootstrap. Builds the Pixi stage immediately, shows the pre-join
// MENU (DOM) over the canvas, and connects only on PLAY. In-game: rebuilds the
// server's map from welcome (seed + playerCap), sends one input per 50ms sim
// tick (keys drive, mouse aims + hold-to-fire), renders own ship (predicted) +
// contacts (interp at -100ms) + dead-reckoned shells + combat feel effects,
// and drives the match-lifecycle UX: waiting/countdown lines, death →
// spectate (follow-killer camera, WASD pan, wheel zoom-out), results overlay,
// return to port (fresh joinOrCreate via reload).

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
import { weaponArcHit } from './render/weaponArc.js';
import { Effects } from './render/effects.js';
import { Mines } from './render/mines.js';
import { Fog } from './render/fog.js';
import { Radar } from './render/radar.js';
import { Zone, type ZoneDisplay } from './render/zone.js';
import { Hud, cooldownReadyFraction, type OwnStatus, type ZoneHud } from './render/hud.js';
import { spectatePan, wheelZoom, pickSpectateTarget, shouldEngageFreePan } from './render/spectate.js';
import { ShakeDriver } from './render/shake.js';
import { isFireDenied, isPressEdgeNotReady, DeniedPulse } from './render/deniedFire.js';
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
import { showMenu, type MenuHandle } from './ui/menu.js';
import { matchUx, secondsUntil, isWeaponsSafe, spectateBannerText, type MatchUx } from './ui/phase.js';
import { showResults } from './ui/results.js';
import { Audio } from './audio/context.js';
import { audioCues, stormEnterEdge, telegraphTone, INITIAL_CUE_STATE, type AudioCueState } from './audio/tones.js';

/** How long the DISCONNECTED banner shows before surfacing the menu again. */
const DISCONNECT_MENU_DELAY_MS = 3000;

/** Everything the loop closures share, assembled once at join. */
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
  /** Colyseus room — polled each frame for the public zone/match plane. */
  room: Room;
  /** Full map radius (u) — the zone's derived-radius baseline. */
  mapRadius: number;
  cameraSnapped: boolean;
  lastOwn: { x: number; y: number };
  /** Spectate-mode render state (death → spectate, active phase). */
  spectate: { freePan: boolean; visualsSet: boolean };
  /** A reload back to the menu is already scheduled/underway. */
  returning: boolean;
  /** Decaying screen-shake driver (render/shake.ts), triggered on own damage. */
  shake: ShakeDriver;
  /** Rate-limited denied-fire pulse (render/deniedFire.ts). */
  deniedPulse: DeniedPulse;
  /** This frame's denied-fire pulse state — read by hud.update() for the chip flash. */
  deniedFlash: boolean;
  /** Tone player (audio/context.ts). */
  audio: Audio;
  /** Countdown-tick / match-start edge-detector state (audio/tones.ts). */
  audioCueState: AudioCueState;
  /** Own-ship storm-membership last frame, for the storm-enter warning edge. */
  wasInStorm: boolean;
  /** Fire-held last frame, for the denied-fire press-edge blip (render/deniedFire.ts). */
  prevFireHeld: boolean;
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
    // Client-selected weapon (immediate), not the server echo — keeps the HUD
    // chip highlight in lockstep with the arcs/denied-flash, which already
    // read g.keyboard.weapon directly. Cooldown VALUES still come from the
    // server-authoritative cooldowns[] above.
    weapon: g.keyboard.weapon,
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

/** The public plane fields this client polls off the room schema. */
interface PublicState {
  zoneState?: string;
  zoneStartT?: number;
  matchPhase?: string;
  countdownEndT?: number;
  winnerId?: string;
  players?: { size: number; get(id: string): { name?: string } | undefined };
}

function publicState(g: Game): PublicState {
  return (g.room.state ?? {}) as PublicState;
}

/** Read the public zone plane off the polled room schema (fail-safe to idle). */
function zoneView(g: Game, now: number): ZoneView {
  const s = publicState(g);
  const state = (s.zoneState ?? 'idle') as ZoneDisplay;
  const startT = s.zoneStartT ?? 0;
  // Derive the radius locally from CONFIG for a smooth ring (see ArenaState
  // JSDoc). Real clients never see a zoneOverride, so CONFIG matches the server.
  const radius = state === 'idle' ? g.mapRadius : zoneRadiusAt(now, startT, g.mapRadius, CONFIG.zone);
  return { state, radius, startT };
}

/** Read the public match plane and map it to HUD strings. */
function matchUxFromRoom(g: Game, now: number): MatchUx {
  const s = publicState(g);
  return matchUx(s.matchPhase ?? 'waiting', s.players?.size ?? 1, s.countdownEndT ?? 0, now);
}

/** Roster name lookup for the kill feed / results (falls back to the raw id). */
function rosterName(g: Game, id: string): string {
  return publicState(g).players?.get(id)?.name ?? id;
}

/** Countdown-tick (last 5s) + match-start audio cues, edge-detected off the
 *  public match plane (audio/tones.ts's pure audioCues()). */
function updateMatchAudioCues(g: Game, now: number): void {
  const s = publicState(g);
  const phase = s.matchPhase ?? 'waiting';
  const sec = secondsUntil(s.countdownEndT ?? 0, now);
  const result = audioCues(g.audioCueState, phase, sec);
  g.audioCueState = result.state;
  if (result.tick) g.audio.play('tick');
  if (result.matchStart) g.audio.play('matchStart');
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

// --- return to port / disconnect ---------------------------------------------

/**
 * Back to the menu via a full reload: bulletproof teardown of the Pixi scene,
 * loop, listeners, and net state in one stroke; the next PLAY is a fresh
 * joinOrCreate. The saved callsign persists in localStorage.
 */
function returnToPort(g: Game): void {
  if (g.returning) return;
  g.returning = true;
  void g.room
    .leave()
    .catch(() => undefined)
    .finally(() => location.reload());
}

/** The room connection ended (server disposal, network death, or own leave). */
function handleRoomLeave(g: Game): void {
  if (g.returning) return; // we initiated it; reload is already on its way
  g.returning = true;
  if (g.state.matchOver) {
    // Expected: the server disconnects resultsSeconds after the finish.
    location.reload();
    return;
  }
  showBanner('DISCONNECTED', { error: true });
  setTimeout(() => location.reload(), DISCONNECT_MENU_DELAY_MS);
}

// --- game assembly -------------------------------------------------------------

/** Camera + input + own-hull-view/effects setup, factored out of buildGame() to keep it lean. */
function setupViewport(stage: Stage, audio: Audio, bellAudible: () => boolean): {
  camera: Camera;
  keyboard: KeyboardInput;
  mouse: MouseInput;
  ownView: ShipView;
  effects: Effects;
} {
  const camera = new Camera({
    radarRange: CONFIG.vision.radar,
    followRate: CLIENT_CONFIG.camera.followRate,
    leadSeconds: CLIENT_CONFIG.camera.leadSeconds,
    leadMax: CLIENT_CONFIG.camera.leadMax,
  });
  camera.setViewport(stage.app.screen.width, stage.app.screen.height);

  // Each throttle detent step clicks the telegraph — pitch distinguishes ringing
  // the engine order up (ahead) from down (astern); an end-stop tap is silent.
  // Silent while spectating (W/S pans the camera) or dead-awaiting-respawn:
  // those taps never reach a live engine room, so they get no confirmation bell.
  const keyboard = new KeyboardInput((dir, changed) => {
    if (changed && bellAudible()) audio.play(telegraphTone(dir));
  });
  keyboard.attach();
  const mouse = new MouseInput();
  mouse.attach();

  const ownView = new ShipView(OWN_STYLE);
  ownView.gfx.visible = false;
  stage.layers.ship.addChild(ownView.gfx);

  // Effects is built before Projectiles so the torpedo-wake trail can feed the
  // shared effects pool via a closure.
  const effects = new Effects(stage.layers.wake, stage.layers.projectile);

  return { camera, keyboard, mouse, ownView, effects };
}

function buildGame(stage: Stage, conn: Connection, map: GameMap, audio: Audio): Game {
  const { welcome } = conn;
  // Late-bound: the bell predicate needs game state that is assembled just below.
  let gRef: Game | null = null;
  const { camera, keyboard, mouse, ownView, effects } = setupViewport(stage, audio, () => {
    const s = gRef?.state;
    return !s?.spectating && s?.net.you?.alive !== false;
  });

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
    mines: new Mines(stage.layers.mineChart, stage.layers.mineWorld, () => audio.play('fireMine')),
    fog: new Fog(stage.fogSprite),
    radar: new Radar(stage.layers.blip, stage.layers.sweep),
    zone: new Zone(stage.layers.zone, stage.layers.vignette, map.radius, CONFIG.zone.endRadiusFraction),
    hud: new Hud(stage.layers.hud),
    room: conn.room,
    mapRadius: map.radius,
    cameraSnapped: false,
    lastOwn: { x: 0, y: 0 },
    spectate: { freePan: false, visualsSet: false },
    returning: false,
    shake: new ShakeDriver(),
    deniedPulse: new DeniedPulse(),
    deniedFlash: false,
    audio,
    audioCueState: INITIAL_CUE_STATE,
    wasInStorm: false,
    prevFireHeld: false,
  };
  gRef = g;
  g.clock.addSample(welcome.t);
  g.fog.rebake(stage.app.screen.width, stage.app.screen.height, camera.zoom);
  bindGameRoom(g, conn);
  return g;
}

/** Wire the room's messages into the game (frames, results, disconnects). */
function bindGameRoom(g: Game, conn: Connection): void {
  bindRoom(conn, {
    ...g,
    onOwnSpawn: (x, y) => g.camera.snapTo({ x, y }),
    resetThrottle: () => g.keyboard.resetThrottle(),
    names: (id) => rosterName(g, id),
    onSpectate: () => enterSpectateVisuals(g),
    onResults: (msg) => showResults(msg, g.state.net.sessionId, () => returnToPort(g)),
    onRoomLeave: () => handleRoomLeave(g),
  });
}

// --- alive rendering -----------------------------------------------------------

function renderOwn(
  g: Game,
  pose: RenderPose,
  status: OwnStatus,
  zone: ZoneHud,
  match: MatchUx,
  frameDt: number,
  weaponsSafe: boolean,
): void {
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
  renderFiring(g, pose, status, weaponsSafe);
  g.hud.update(
    pose,
    g.keyboard.axes(),
    status,
    zone,
    match,
    g.stage.app.screen.width,
    g.stage.app.screen.height,
    g.deniedFlash,
  );
}

/** Reload duration (ms) per weapon, indexed by WeaponId (for the ready fraction). */
const WEAPON_RELOADS = [CONFIG.gun.reload, CONFIG.torpedo.reload, CONFIG.mine.dropCooldown];

/**
 * Weapon arc/marker + crosshair while alive; hidden once sunk. Also derives
 * the denied-fire predicate (fire held but weapons-safe / out-of-arc blocks
 * it — a bare cooldown does NOT, see isFireDenied) plus the one-shot
 * press-edge "not ready yet" blip, and feeds their OR into the rate-limited
 * pulse — g.deniedFlash carries this frame's result to hud.update() for the
 * chip flash.
 */
function renderFiring(g: Game, pose: RenderPose, status: OwnStatus, weaponsSafe: boolean): void {
  if (!status.alive) {
    g.firing.hide();
    g.deniedFlash = false;
    g.prevFireHeld = g.mouse.fire;
    return;
  }
  const cursor = g.camera.screenToWorld(g.mouse.screenPos);
  const aim = worldAim(pose.x, pose.y, cursor);
  // Drive the firing UX from the client-selected weapon (immediate), reading its
  // cooldown from the server-authoritative cooldowns[] for that same slot.
  const weapon = g.keyboard.weapon;
  const ready = cooldownReadyFraction(status.cooldowns[weapon] ?? 0, WEAPON_RELOADS[weapon]);
  const inArc = weaponArcHit(pose.heading, aim, weapon);
  const params = { fireHeld: g.mouse.fire, weaponsSafe, ready, inArc };
  const denied = isFireDenied(params) || isPressEdgeNotReady(params, g.prevFireHeld);
  g.deniedFlash = g.deniedPulse.update(denied, performance.now());
  g.prevFireHeld = g.mouse.fire;
  g.firing.update(pose, aim, weapon, ready, cursor, g.deniedFlash);
}

function renderAlive(g: Game, alpha: number, frameDt: number, now: number, zv: ZoneView, mu: MatchUx): void {
  const pose = ownPose(g, alpha, frameDt);
  const status = ownStatus(g);
  const inStorm = !!pose && zv.state !== 'idle' && isOutside(pose, zv.radius);
  if (stormEnterEdge(g.wasInStorm, inStorm)) g.audio.play('stormWarn');
  g.wasInStorm = inStorm;
  const weaponsSafe = isWeaponsSafe(publicState(g).matchPhase ?? 'waiting');
  if (pose) renderOwn(g, pose, status, zoneHud(zv, now, inStorm), mu, frameDt, weaponsSafe);
  else g.ownView.gfx.visible = false; // forceSnap gap (respawn/P-toggle): no stale-pose flicker
  const w = g.stage.app.screen.width;
  const h = g.stage.app.screen.height;
  g.zone.update(zv.radius, zv.state, inStorm, now / 1000, w, h);
  // Own pose feeds the shell sight-bubble cull (shells outside fog vanish).
  g.projectiles.render(now, pose ?? undefined);
  g.radar.render(pose, now);
  // The fog hole tracks the own ship's screen position (post camera update).
  const hole = pose ? g.camera.worldToScreen(pose) : g.camera.screenCenter;
  g.fog.update(hole.x, hole.y);
}

// --- spectate rendering ----------------------------------------------------------

/** One-time visual switch into spectate: fog off, sweep/blips gone, hull hidden. */
function enterSpectateVisuals(g: Game): void {
  if (g.spectate.visualsSet) return;
  g.spectate.visualsSet = true;
  g.fog.setVisible(false);
  g.radar.clearBlips();
  g.ownView.gfx.visible = false;
  g.firing.hide();
  // Drop any WASD held at the moment of death so updateSpectateCamera sees a
  // clean edge — otherwise steering into your own death instantly (and
  // permanently) engages free-pan, skipping the follow-your-killer default.
  g.keyboard.clearKeys();
  // Clear the engine order too: entering spectate is a hard boundary, and the
  // order must not survive into the next life (respawn re-rings from STOP).
  g.keyboard.resetThrottle();
}

/** Follow-your-killer by default; any WASD press hands the camera to free pan. */
function updateSpectateCamera(g: Game, frameDt: number, now: number): void {
  // Spectate pan reads the HELD WASD state (panAxes), not the driving axes():
  // its "throttle" is live W/S for up/down panning, not the (reset) telegraph order.
  const axes = g.keyboard.panAxes();
  if (shouldEngageFreePan(axes)) g.spectate.freePan = true;
  if (g.spectate.freePan) {
    const d = spectatePan(axes, frameDt, g.camera.zoomFactor);
    g.camera.pan(d.dx, d.dy);
    return;
  }
  const target = pickSpectateTarget(g.state.killerId, [...g.contacts.ids()]);
  const pose = target ? g.contacts.get(target)?.sampleAt(now - CLIENT_CONFIG.net.interpDelayMs) : null;
  if (pose) g.camera.update(frameDt, pose);
}

function renderSpectate(g: Game, frameDt: number, now: number, zv: ZoneView, mu: MatchUx): void {
  enterSpectateVisuals(g); // idempotent belt-and-braces with onSpectate
  updateSpectateCamera(g, frameDt, now);
  const w = g.stage.app.screen.width;
  const h = g.stage.app.screen.height;
  g.zone.update(zv.radius, zv.state, false, now / 1000, w, h);
  g.projectiles.render(now); // no sight cull: spec frames are unfogged
  g.effects.update(frameDt, null);
  g.radar.render(null, now); // hides the sweep + rings
  const s = publicState(g);
  const banner = spectateBannerText(s.matchPhase ?? 'waiting', s.winnerId ?? '', g.state.net.sessionId);
  g.hud.updateSpectate(zoneHud(zv, now, false), mu, w, h, banner);
}

// --- the loop --------------------------------------------------------------------

function makeCallbacks(g: Game): LoopCallbacks {
  return {
    simTick: () => {
      // RULING: a dead (or post-match) client stops sending inputs entirely —
      // the keyboard drives the spectator camera instead.
      if (g.state.spectating) return;
      const cursor = g.camera.screenToWorld(g.mouse.screenPos);
      const aim = worldAim(g.lastOwn.x, g.lastOwn.y, cursor);
      const input = g.sampler.sample(g.keyboard.axes(), { aim, fire: g.mouse.fire, weapon: g.keyboard.weapon });
      if (g.state.mode === 'predict') g.predictor.localTick(input);
    },
    render: (alpha, frameDt) => {
      const now = g.clock.serverNow();
      const zv = zoneView(g, now);
      const mu = matchUxFromRoom(g, now);
      updateMatchAudioCues(g, now);
      const shakeOff = g.shake.update(frameDt);
      g.camera.shake.x = shakeOff.x;
      g.camera.shake.y = shakeOff.y;
      if (g.state.spectating) renderSpectate(g, frameDt, now, zv, mu);
      else renderAlive(g, alpha, frameDt, now, zv, mu);
      g.contactViews.render(g.contacts, now - CLIENT_CONFIG.net.interpDelayMs, now, frameDt * 1000);
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
 * Immediately send + locally apply a rudder-neutral, no-fire input that KEEPS
 * the current throttle order. Wired to document visibility + window blur so a
 * backgrounded tab can't leave a stale rudder locked over or the guns firing
 * server-side for the whole time it's hidden (the server keeps applying the
 * latest input it has every tick) — but the throttle is a deliberate engine
 * order, so the ship is meant to keep steaming straight at its set speed while
 * backgrounded. Routes through the sampler so seq stays monotonic with the
 * regular tick cadence, and through the predictor so the pending-input ring
 * (replayed on reconcile) stays consistent with what was actually sent.
 */
function sendNeutralInput(g: Game): void {
  if (g.state.spectating) return; // spectators send nothing at all
  const msg = g.sampler.sendNeutralNow(g.keyboard.throttle);
  if (g.state.mode === 'predict') g.predictor.localTick(msg);
}

/** Neutralize input the moment the tab is hidden or the window loses focus. */
function bindVisibility(game: Game): void {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sendNeutralInput(game);
  });
  window.addEventListener('blur', () => sendNeutralInput(game));
}

/** Mouse-wheel zoom OUT — a spectator-only privilege, clamped [0.5x, 1x]. */
function bindSpectateZoom(game: Game): void {
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (!game.state.spectating) return;
      game.camera.setZoomFactor(wheelZoom(game.camera.zoomFactor, e.deltaY));
    },
    { passive: true },
  );
}

// --- bootstrap ---------------------------------------------------------------------

/** Toggle master mute (M key), persisted to localStorage by audio/context.ts. */
function toggleMute(game: Game): void {
  game.audio.toggleMute();
  showBanner(game.audio.muted ? 'MUTED' : 'UNMUTED', { autoHideMs: 1200 });
}

async function startGame(stage: Stage, menu: MenuHandle, name: string, audio: Audio): Promise<void> {
  menu.setBusy(true);
  menu.setStatus('CONNECTING...');
  let conn: Connection;
  try {
    conn = await connect(name || undefined);
  } catch (err) {
    console.error('[net] connection failed', err);
    menu.setStatus('CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?', true);
    menu.setBusy(false);
    return;
  }
  menu.hide();
  hideBanner();

  // The server's map, regenerated deterministically from the welcome seed + cap.
  const map = mapFromWelcome(conn.welcome);
  buildMap(map, stage.layers);

  const game = buildGame(stage, conn, map, audio);
  bindResize(stage, game);
  bindVisibility(game);
  bindSpectateZoom(game);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') toggleMode(game);
    if (e.code === 'KeyM') toggleMute(game);
  });

  startLoop(stage.app, makeCallbacks(game));
}

async function main(): Promise<void> {
  const stage = await createStage();
  document.getElementById('app')?.replaceChildren(stage.app.canvas);

  const audio = new Audio();
  const version = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
  const menu = showMenu(version, (name) => {
    audio.resume(); // must happen inside the PLAY click's user-gesture handler
    void startGame(stage, menu, name, audio);
  });
}

main().catch((err) => {
  console.error('client boot failed', err);
});
