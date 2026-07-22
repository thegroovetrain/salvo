// Client bootstrap. Builds the Pixi stage immediately, shows the pre-join
// MENU (DOM) over the canvas, and connects only on PLAY. In-game: rebuilds the
// server's map from welcome (seed + playerCap), sends one input per 50ms sim
// tick (keys drive, mouse aims + one shot per click), renders own ship (predicted) +
// contacts (interp at -100ms) + dead-reckoned shells + combat feel effects,
// and drives the match-lifecycle UX: waiting/countdown lines, death →
// spectate (follow-killer camera, WASD pan, wheel zoom-out), results overlay,
// return to port (fresh joinOrCreate via reload).

import type { Container } from 'pixi.js';
import type { Room } from '@colyseus/sdk';
import {
  CONFIG,
  HEAL_CHOICE,
  MSG,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  hullSilhouette,
  isOutside,
  loadoutFor,
  SLOT_COUNT,
  zeroUpgrades,
  zoneRadiusAt,
  type EffectiveStats,
  type EquipmentId,
  type GameMap,
  type OwnShip,
  type ShipClassId,
  type WeaponAmmo,
} from '@salvo/shared';
import { CLIENT_CONFIG } from './config.js';
import { createGameState, type GameState } from './state.js';
import { createStage, type Stage } from './render/stage.js';
import { buildMap } from './render/map.js';
import { Camera } from './render/camera.js';
import { ShipView, OWN_STYLE } from './render/ships.js';
import { ContactViews } from './render/contacts.js';
import { Projectiles } from './render/projectiles.js';
import { FiringUX } from './render/firing.js';
import { weaponArcHit, weaponRangeU } from './render/weaponArc.js';
import { Effects } from './render/effects.js';
import { Mines } from './render/mines.js';
import { Decoys } from './render/decoys.js';
import { LitZones, litZoneFade, ownActiveZones, type OwnZone } from './render/litZones.js';
import { Fog, type FogHole } from './render/fog.js';
import { Radar } from './render/radar.js';
import { Zone, type ZoneDisplay } from './render/zone.js';
import { Hud, reloadFraction, type OwnStatus, type ZoneHud } from './render/hud.js';
import { spectatePan, wheelZoom, pickSpectateTarget, shouldEngageFreePan } from './render/spectate.js';
import { ShakeDriver } from './render/shake.js';
import { isClickDenied, DeniedPulse } from './render/deniedFire.js';
import { KeyboardInput, slotHoldsAbility, type UpgradeAction } from './input/keyboard.js';
import { UpgradeMenu, offerView, type OfferView } from './ui/upgradeMenu.js';
import { MouseInput, worldAim, worldAimDist } from './input/mouse.js';
import { abilityPressDenied, shouldConsumePrime } from './sim/inputSampler.js';
import { startLoop, type LoopCallbacks } from './app/loop.js';
import { connect, connectErrorStatus, mapFromWelcome, type Connection } from './net/connection.js';
import { ServerClock } from './net/clock.js';
import { ContactStore, SnapshotBuffer } from './net/snapshots.js';
import { bindRoom } from './net/roomBindings.js';
import { Predictor, type RenderPose } from './sim/prediction.js';
import { InputSampler } from './sim/inputSampler.js';
import { showBanner, hideBanner } from './util/banner.js';
import { showMenu, type MenuHandle } from './ui/menu.js';
import { matchUx, secondsUntil, spectateBannerText, type MatchUx } from './ui/phase.js';
import { showResults } from './ui/results.js';
import { Audio } from './audio/context.js';
import { audioCues, stormEnterEdge, telegraphTone, INITIAL_CUE_STATE, type AudioCueState } from './audio/tones.js';
import { createNullAdapter } from './portal/nullAdapter.js';
import { safeAdapter } from './portal/safeAdapter.js';
import type { PortalAdapter } from './portal/portalAdapter.js';

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
  /** Decoy-buoy markers (render/decoys.ts) — synced from FrameMsg.decoys, the
   *  mines precedent (Story 1.8). */
  decoys: Decoys;
  /** Star-shell lit-zone glow overlay (render/litZones.ts) — synced from
   *  FrameMsg.litZones, faded per render frame by serverNow. */
  litZones: LitZones;
  fog: Fog;
  radar: Radar;
  zone: Zone;
  hud: Hud;
  /** The CTRL spend window (ui/upgradeMenu.ts) — DOM, non-blocking. */
  upgradeMenu: UpgradeMenu;
  /**
   * FINDING A latch: set the instant a spend is sent, cleared once it visibly
   * lands (pts drops) or a fallback timeout elapses (the server silently
   * rejected it — e.g. a heal that raced to full hp — so don't lock the
   * player out forever). Guards against two rapid spends (CTRL+1 then
   * CTRL+2, or two row clicks) within one server-tick+RTT both firing against
   * the SAME (now-stale) front offer — see trySpend()/updateSpendLatch().
   */
  spendInFlight: { pts: number; offerSig: string; at: number } | null;
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
  /**
   * True while the SDK is auto-reconnecting the same room (between onDrop and
   * onReconnect / onRoomLeave). The persistent RECONNECTING banner owns the
   * single banner slot during this window, so transient toasts (M mute, P
   * netcode) suppress their banner rather than displace it and auto-hide to
   * nothing for the rest of a potentially 60s outage. State still toggles.
   */
  reconnecting: boolean;
  /** Decaying screen-shake driver (render/shake.ts), triggered on own damage. */
  shake: ShakeDriver;
  /** Rate-limited denied-fire pulse (render/deniedFire.ts). */
  deniedPulse: DeniedPulse;
  /** This frame's denied-fire pulse state — read by hud.update() for the chip flash. */
  deniedFlash: boolean;
  /** One-shot latch PER LOADOUT SLOT: an ability press on that slot predicted
   *  DENIED (cooling/dead) since the last render frame — consumed into the
   *  matching abilityPulse (Story 1.6, never silence). Per-slot since Story 1.8:
   *  the ML fits TWO ability slots (mine + decoyBuoy), so a denied mine press
   *  must not flash the decoy chip. Indexed by loadout slot (length SLOT_COUNT). */
  abilityDeniedPress: boolean[];
  /** Rate-limited denied pulse PER LOADOUT SLOT — the SAME deniedFire grammar
   *  (80ms flash / 300ms floor), one driver per slot so two ability slots (and
   *  the weapon click) don't share a rate window. Chips-only: an ability press
   *  never drives the weapon-arc/reticle denied visuals (nothing is aimed). */
  abilityPulse: DeniedPulse[];
  /** This frame's ability denied-flash PER LOADOUT SLOT — read by hud.update()
   *  for each ability chip's border (index = loadout slot). */
  abilityFlash: boolean[];
  /** Tone player (audio/context.ts). */
  audio: Audio;
  /**
   * Portal SDK seam (portal/portalAdapter.ts), always safeAdapter-wrapped so
   * every call here is safe to fire and forget. The null adapter today; a real
   * portal adapter at Epic 7. The game never imports a portal SDK directly.
   */
  portal: PortalAdapter;
  /** Latch: portal.matchEnd() fired — results re-delivery must not re-fire it. */
  matchEnded: boolean;
  /** Countdown-tick / match-start edge-detector state (audio/tones.ts). */
  audioCueState: AudioCueState;
  /** Own-ship storm-membership last frame, for the storm-enter warning edge. */
  wasInStorm: boolean;
  /** mouse.clickCount last frame — the denied-click edge (render/deniedFire.ts). */
  prevClickCount: number;
  /** mouse.clickCount at the last SIM TICK — the new-click edge that consumes a
   *  primed skillshot (distinct from prevClickCount, which the render loop owns). */
  lastTickClick: number;
  /** Own ship class — the localStorage guess, corrected by the first server frame. */
  ownClass: ShipClassId;
  /**
   * Cached effectiveStats(ownClass, own upgrade counts) — THE client-side stat
   * source (HUD denominators, predictor kinematics, radar/camera/fog ranges,
   * firing-arc gun range). Starts at the guessed class with zero upgrades;
   * applyOwnStats() swaps it whenever you.cls or you.upg changes.
   */
  ownStats: EffectiveStats;
  /**
   * Slot-aligned equipment ids of the OWN loadout — loadoutFor(you.cls),
   * client-side and read-only (Story 1.6). Drives the slot-2 activate-vs-prime
   * split (slotHoldsAbility), the HUD chip row, and the pre-frame ammo
   * fallback. Recomputed with ownStats on the ownStatsChanged seam.
   */
  ownSlots: readonly (EquipmentId | null)[];
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
  // Suppress the transient toast while reconnecting so it can't displace the
  // persistent RECONNECTING banner (the mode still toggles).
  if (!g.reconnecting) showBanner(`NETCODE: ${g.state.mode.toUpperCase()}`, { autoHideMs: 1500 });
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

/** Slot-aligned equipment ids of a hull's loadout — the client-side, read-only
 *  view of loadoutFor (Story 1.6): TB [gun, torpedo, speedBoost, null], every
 *  other hull the universal [gun, torpedo, mine, null]. */
function slotIdsFor(cls: ShipClassId, stats: EffectiveStats): (EquipmentId | null)[] {
  return loadoutFor(cls, stats).map((s) => s.equipmentId);
}

/**
 * Slot-aligned own ammo (OwnShip.ammo): length SLOT_COUNT, null for an empty
 * slot. Full pools until the first frame arrives (effective sizes ≙ CONFIG at
 * zero upgrades — g.ownStats starts as the un-upgraded guessed class), built
 * from the own loadout's slot ids (empty slots stay null).
 */
function ownAmmo(
  you: OwnShip | null,
  stats: EffectiveStats,
  slots: readonly (EquipmentId | null)[],
): (WeaponAmmo | null)[] {
  return (
    you?.ammo ?? slots.map((id) => (id === null ? null : { n: equipmentMaxAmmo(stats, id), reloadMsLeft: 0 }))
  );
}

/** Ms until respawn (0 when alive / eta unknown). */
function respawnMs(eta: number | null, now: number): number {
  return eta != null ? Math.max(0, eta - now) : 0;
}

/**
 * ms — the own boost window's current end estimate: the predictor's
 * (optimistic-aware) value in predict mode, the raw server echo in interp/
 * debug mode or before prediction initializes. 0 = inactive.
 */
function boostUntilNow(g: Game): number {
  if (g.state.mode === 'predict' && g.predictor.isInitialized) return g.predictor.boostUntilEstimate;
  return g.state.net.you?.boostUntil ?? 0;
}

/** Derive HUD/combat status from the latest server own-ship + respawn ETA. */
function ownStatus(g: Game): OwnStatus {
  const you = g.state.net.you;
  const stats = g.ownStats;
  return {
    hp: you?.hp ?? stats.maxHp,
    ammo: ownAmmo(you, stats, g.ownSlots),
    cls: you?.cls ?? g.ownClass,
    stats,
    pts: you?.pts ?? 0,
    // Client-primed slot (immediate), not a server echo — the server keeps no
    // priming state. Keeps the HUD chip highlight in lockstep with the arcs/
    // denied-flash, which read g.keyboard.primedSlot directly. Ammo VALUES still
    // come from the server-authoritative ammo[] above.
    primedSlot: g.keyboard.primedSlot,
    alive: you?.alive ?? true,
    respawnInMs: respawnMs(g.state.respawnEta, g.clock.serverNow()),
    loadout: g.ownSlots,
    boostActive: g.clock.serverNow() < boostUntilNow(g),
  };
}

/** How long the spend latch (below) holds before falling back open, in case the
 *  server silently rejected the spend (e.g. a heal that raced to full hp) —
 *  well past any real server-tick+RTT round trip, so it never masks a stuck UI. */
const SPEND_LATCH_TIMEOUT_MS = 1500;

/**
 * FINDING A: the single entry point for BOTH spend paths (keyboard choose/heal
 * via handleUpgradeAction, and the UpgradeMenu row-click callback). Ignores a
 * second spend while one is already in flight — otherwise two rapid spends
 * within one server-tick+RTT (CTRL+1 then CTRL+2, or two row clicks) both read
 * the SAME client-side front offer, and the second lands after the server's
 * FIFO shift and applies an upgrade the client never displayed. Latched by
 * banked points at send time; cleared by updateSpendLatch() once the bank
 * visibly shrinks or the fallback timeout elapses.
 */
function trySpend(g: Game, choice: number): void {
  if (g.spendInFlight) return;
  const you = g.state.net.you;
  g.room.send(MSG.spend, { choice });
  g.spendInFlight = { pts: you?.pts ?? 0, offerSig: offerSignature(you), at: performance.now() };
}

/** Snapshot of the front offer used to detect that the server queue moved. */
function offerSignature(you: { pts: number; offer: number[] } | null | undefined): string {
  return you ? `${you.pts}:${you.offer.join(',')}` : '';
}

/**
 * Clear the spend latch once the spend visibly landed — the pts/offer snapshot
 * changed in ANY way (a pure pts-drop check misses a kill landing mid-flight,
 * which cancels the drop and would leave the menu locked until the timeout) —
 * or the fallback timeout elapsed (silently rejected — e.g. heal-at-full-hp —
 * so the player isn't locked out of spending forever). Called once per render
 * frame, same clock (`performance.now()`) the render loop already uses for the
 * denied-fire pulse — no new timer.
 */
function updateSpendLatch(g: Game): void {
  const inFlight = g.spendInFlight;
  if (!inFlight) return;
  const landed = offerSignature(g.state.net.you) !== inFlight.offerSig;
  const expired = performance.now() - inFlight.at > SPEND_LATCH_TIMEOUT_MS;
  if (landed || expired) g.spendInFlight = null;
}

/** The spend view for THIS frame (null = nothing to show → menu auto-hides). */
function currentOfferView(g: Game): OfferView | null {
  return offerView(g.state.net.you, g.ownStats.maxHp, g.state.spectating, g.spendInFlight !== null);
}

/**
 * Route a decoded CTRL-window action: bare CTRL toggles the window; CTRL+1/2/3
 * spends an offer slot; CTRL+E heals (gated client-side by canHeal — the server
 * re-validates). Inert when there is nothing to spend (no view). Shortcuts work
 * with the window closed: the offer is stable from earn time, so you commit
 * without reading. Spends route through trySpend() (FIFO room.send + latch).
 */
function handleUpgradeAction(g: Game, a: UpgradeAction): void {
  const view = currentOfferView(g);
  if (!view) {
    g.upgradeMenu.hide();
    return;
  }
  if (a.kind === 'toggle') {
    g.upgradeMenu.toggle(view);
    return;
  }
  if (a.kind === 'heal') {
    if (view.canHeal) trySpend(g, HEAL_CHOICE);
    return;
  }
  trySpend(g, a.slot);
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
  if (result.matchStart) {
    g.audio.play('matchStart');
    g.portal.matchStart(); // same once-per-match live edge as the audio cue
  }
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
  // Give the portal an ad-break moment before teardown. g.portal is
  // safeAdapter-wrapped, so this always settles (timeout-capped) and never
  // throws; the extra catch keeps a misbehaving room.leave() from surfacing
  // an unhandled rejection. Reload runs no matter what.
  void g.portal
    .requestAdBreak()
    .then(() => g.room.leave())
    .catch(() => undefined)
    .finally(() => location.reload());
}

/** The room connection ended (server disposal, network death, or own leave). */
function handleRoomLeave(g: Game): void {
  if (g.returning) return; // we initiated it; reload is already on its way
  g.returning = true;
  g.reconnecting = false; // the reconnect window closed (retries exhausted / fast-fail)
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
function setupViewport(
  stage: Stage,
  audio: Audio,
  cls: ShipClassId,
  bellAudible: () => boolean,
  onUpgradeKey: (a: UpgradeAction) => void,
  isAbilitySlot: (slot: number) => boolean,
  onAbility: (slot: number) => void,
  nowServer: () => number,
): {
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
  const keyboard = new KeyboardInput(
    (dir, changed) => {
      if (changed && bellAudible()) audio.play(telegraphTone(dir));
    },
    onUpgradeKey,
    isAbilitySlot,
    onAbility,
  );
  keyboard.attach();
  // Inject the server-clock estimate so pointerdown can stamp an honest fire
  // time (D1). Lazy thunk: MouseInput is built before the clock exists, so it
  // resolves gRef.clock at click time, never captures it (serverNow() returns
  // 0 pre-ready → the fireT "no claim" sentinel).
  const mouse = new MouseInput(nowServer);
  mouse.attach();

  // Guessed-class hull until the first frame confirms/corrects it.
  const ownView = new ShipView(OWN_STYLE, cls);
  ownView.gfx.visible = false;
  stage.layers.ship.addChild(ownView.gfx);

  // Effects is built before Projectiles so the torpedo-wake trail can feed the
  // shared effects pool via a closure.
  const effects = new Effects(stage.layers.wake, stage.layers.projectile, stage.layers.burstFx);
  effects.setOwnClass(cls);

  return { camera, keyboard, mouse, ownView, effects };
}

/** Predictor seeded with the guessed class config (first frame confirms/swaps it). */
function makePredictor(map: GameMap, cls: ShipClassId): Predictor {
  const spec = CONFIG.shipClasses[cls];
  return new Predictor({ radius: map.radius, islands: map.islands }, spec.kinematics, hullSilhouette(cls));
}

/**
 * The keyboard callbacks that need game state assembled later in buildGame:
 * the telegraph-bell audibility predicate, the CTRL-window action router, and
 * the Story 1.6 ability pair (the own-loadout slot predicate + the activation
 * press handler). `getG` is the gRef late-binding — null only during the brief
 * construction gap.
 */
function viewportCallbacks(getG: () => Game | null): {
  bellAudible: () => boolean;
  onUpgradeKey: (a: UpgradeAction) => void;
  isAbilitySlot: (slot: number) => boolean;
  onAbility: (slot: number) => void;
} {
  return {
    bellAudible: () => {
      const s = getG()?.state;
      return !s?.spectating && s?.net.you?.alive !== false;
    },
    onUpgradeKey: (a) => {
      const g = getG();
      if (g) handleUpgradeAction(g, a);
    },
    // The slot-2 key consults the OWN loadout: ability equipment activates
    // (never primes); a weapon (BB/ML's mine) primes exactly as today.
    isAbilitySlot: (slot) => {
      const g = getG();
      return g !== null && slotHoldsAbility(g.ownSlots, slot);
    },
    onAbility: (slot) => {
      const g = getG();
      if (g) handleAbilityPress(g, slot);
    },
  };
}

/**
 * An ability-activation keypress landed (the TB's speed boost, or — Story 1.8 —
 * the Mine Layer's mine / decoyBuoy): the keyboard has ALREADY advanced actSeq,
 * and the press rides the next input either way — the server decides. Here the
 * client only predicts the verdict:
 *  - predicted DENIED (slot cooling / own ship dead) → latch the pressed SLOT's
 *    denied pulse (the existing deniedFire grammar, chips-only — never silence,
 *    never the weapon-arc/reticle visuals: nothing is aimed). Per-slot so a
 *    denied mine press never flashes the decoy chip (the ML fits two abilities);
 *  - predicted READY → per equipment: speedBoost opens the predictor's optimistic
 *    boost window at the current server-clock estimate so the speed-up doesn't
 *    wait a round trip (the authoritative you.boostUntil overwrites it once
 *    acked; the predictor ignores a second press while pending, so a stale-ammo
 *    double press within RTT can't extend it); the decoyBuoy plays its placement
 *    cue immediately (the owner's own action — this is the buoy's own-fire cue,
 *    driven from the press rather than a reconcile hook because DecoyView carries
 *    no owner id to gate it, see render/decoys.ts). The mine drop needs no client
 *    prediction — its own cue rides the Mines reconcile own-spawn hook.
 */
function handleAbilityPress(g: Game, slot: number): void {
  const you = g.state.net.you;
  const a = ownAmmo(you, g.ownStats, g.ownSlots)[slot];
  const loaded = !!a && a.n > 0;
  if (abilityPressDenied(you?.alive ?? true, loaded)) {
    g.abilityDeniedPress[slot] = true;
    return;
  }
  const id = g.ownSlots[slot];
  if (id === 'speedBoost') g.predictor.predictBoostActivation(g.clock.serverNow(), g.keyboard.actSeq);
  else if (id === 'decoyBuoy') g.audio.play('placeDecoy');
}

/**
 * The UpgradeMenu's row-click callback: same late-binding as viewportCallbacks
 * (gRef isn't assigned until after the Game object literal below), routed
 * through trySpend() so a row click shares the FINDING A latch with the
 * keyboard spend path.
 */
function onSpendClick(getG: () => Game | null): (choice: number) => void {
  return (choice) => {
    const g = getG();
    if (g) trySpend(g, choice);
  };
}

/** Fresh per-slot ability denied-feedback state (Story 1.6/1.8): one latch +
 *  rate-limited pulse + flash per loadout slot, so two ability slots (the ML's
 *  mine + decoyBuoy) never share a pulse/flash. */
function abilityFeedbackState(): Pick<Game, 'abilityDeniedPress' | 'abilityPulse' | 'abilityFlash'> {
  return {
    abilityDeniedPress: Array.from({ length: SLOT_COUNT }, () => false),
    abilityPulse: Array.from({ length: SLOT_COUNT }, () => new DeniedPulse()),
    abilityFlash: Array.from({ length: SLOT_COUNT }, () => false),
  };
}

function buildGame(stage: Stage, conn: Connection, map: GameMap, audio: Audio, cls: ShipClassId, portal: PortalAdapter): Game {
  const { welcome } = conn;
  // Late-bound: the input callbacks need game state that is assembled just below.
  let gRef: Game | null = null;
  const { bellAudible, onUpgradeKey, isAbilitySlot, onAbility } = viewportCallbacks(() => gRef);
  // Final arg is a lazy server-clock thunk for the mouse's pointerdown fire-time stamp (D1); resolved at click time.
  const { camera, keyboard, mouse, ownView, effects } = setupViewport(stage, audio, cls, bellAudible, onUpgradeKey, isAbilitySlot, onAbility, () => (gRef?.clock ? gRef.clock.serverNow() : 0));
  const stats = effectiveStats(CONFIG.shipClasses[cls], zeroUpgrades());

  const g: Game = {
    stage,
    state: createGameState(welcome.sessionId),
    clock: new ServerClock(),
    ownBuffer: new SnapshotBuffer(),
    contacts: new ContactStore(),
    predictor: makePredictor(map, cls),
    camera,
    keyboard,
    mouse,
    sampler: new InputSampler((type, msg) => conn.room.send(type, msg)),
    ownView,
    contactViews: new ContactViews(stage.layers.ship),
    projectiles: new Projectiles(map.radius, stage.layers.projectile, (x, y) => effects.spawnEffect('torpwake', x, y)),
    firing: new FiringUX(stage.layers.ship, stage.layers.aim),
    effects,
    mines: new Mines(stage.layers.mineChart, stage.layers.mineWorld, () => audio.play('fireMine')),
    decoys: new Decoys(stage.layers.decoyChart),
    litZones: new LitZones(stage.layers.litZone),
    fog: new Fog(stage.fogSprite),
    radar: new Radar(stage.layers.blip, stage.layers.sweep),
    zone: new Zone(stage.layers.zone, stage.layers.vignette, map.radius, CONFIG.zone.endRadiusFraction),
    hud: new Hud(stage.layers.hud),
    upgradeMenu: new UpgradeMenu(onSpendClick(() => gRef)),
    spendInFlight: null,
    room: conn.room, mapRadius: map.radius,
    cameraSnapped: false, lastOwn: { x: 0, y: 0 },
    spectate: { freePan: false, visualsSet: false },
    returning: false, reconnecting: false,
    shake: new ShakeDriver(),
    deniedPulse: new DeniedPulse(), deniedFlash: false,
    ...abilityFeedbackState(),
    audio, portal,
    matchEnded: false, audioCueState: INITIAL_CUE_STATE, wasInStorm: false,
    prevClickCount: 0, lastTickClick: 0,
    ownClass: cls,
    ownStats: stats, ownSlots: slotIdsFor(cls, stats),
  };
  gRef = g;
  g.clock.addSample(welcome.t);
  g.fog.rebake(stage.app.screen.width, stage.app.screen.height, camera.zoom);
  bindGameRoom(g, conn);
  return g;
}

/**
 * Adopt the server-authoritative own class + upgrade counts (first frame or
 * any change to either): recompute the cached effective stats and swap every
 * consumer — the predictor's kinematics (re-inits via forceSnap, absorbed by
 * the next reconcile; collision radius stays CLASS-based, hull size does not
 * upgrade), the own-hull visual + wake stern offset, the radar rings/sweep
 * period, the camera base zoom (radarRange upgrade = "your world grows"), and
 * the fog sight hole (rebaked via the same path as a resize). Guessed
 * localStorage config was used until here; this is the desync firewall.
 */
/** Shallow-compare the six ShipConfig kinematics fields. */
function sameKinematics(a: EffectiveStats['kinematics'], b: EffectiveStats['kinematics']): boolean {
  return (
    a.maxSpeed === b.maxSpeed &&
    a.reverseSpeed === b.reverseSpeed &&
    a.accel === b.accel &&
    a.decel === b.decel &&
    a.turnRate === b.turnRate &&
    a.steerageSpeed === b.steerageSpeed
  );
}

/** True when any fog/radar/zoom-driving stat differs. */
function visionChanged(a: EffectiveStats, b: EffectiveStats): boolean {
  return (
    a.sightRange !== b.sightRange ||
    a.radarRange !== b.radarRange ||
    a.sweepPeriodMs !== b.sweepPeriodMs
  );
}

/**
 * Recompute + apply the own effective stats. Work is scoped to what actually
 * changed: a gunReload grant must not hard-snap the predictor or rebake the
 * fog — those on every kill read as a hitch exactly when the player is
 * maneuvering. The predictor only SNAPS on a real class change (first-frame
 * localStorage correction); an upgrade that touches kinematics swaps the
 * config in place and lets the next reconcile replay pending inputs under it.
 */
function applyOwnStats(g: Game, cls: ShipClassId, upg: readonly number[]): void {
  const classChanged = cls !== g.ownClass;
  const prev = g.ownStats;
  g.ownClass = cls;
  const spec = CONFIG.shipClasses[cls];
  const stats = effectiveStats(spec, upg);
  g.ownStats = stats;
  // Own loadout follows the authoritative class (Story 1.6): the slot-2
  // activate-vs-prime split, HUD chips, and ammo fallback all read from here.
  g.ownSlots = slotIdsFor(cls, stats);
  // Boost numbers ride the same stats swap (CONFIG pass-through today).
  g.predictor.setBoostStats(stats.boost.speedBonus, stats.boost.durationMs);

  if (classChanged || !sameKinematics(prev.kinematics, stats.kinematics)) {
    g.predictor.setClassConfig(stats.kinematics, hullSilhouette(cls), classChanged);
  }
  if (classChanged) {
    g.ownView.setHullId(cls);
    g.effects.setOwnClass(cls);
  }
  if (!classChanged && !visionChanged(prev, stats)) return;
  g.radar.setRanges(stats.sightRange, stats.radarRange, stats.sweepPeriodMs);
  g.camera.setRadarRange(stats.radarRange);
  g.fog.setSightRange(stats.sightRange);
  g.projectiles.setSightRange(stats.sightRange);
  // Zoom and/or hole radius may have moved: rebake the fog against the current
  // viewport at the new zoom (exactly what the resize handler does).
  g.fog.rebake(g.stage.app.screen.width, g.stage.app.screen.height, g.camera.zoom);
}

/** Wire the room's messages into the game (frames, results, disconnects). */
function bindGameRoom(g: Game, conn: Connection): void {
  bindRoom(conn, {
    ...g,
    onOwnSpawn: (x, y) => g.camera.snapTo({ x, y }),
    onOwnStats: (cls, upg) => applyOwnStats(g, cls, upg),
    resetThrottle: () => g.keyboard.resetThrottle(),
    resetPrime: () => g.keyboard.revertToGun(),
    names: (id) => rosterName(g, id),
    onSpectate: () => enterSpectateVisuals(g),
    onResults: (msg) => {
      // Latched: a story-0.2 resume re-delivers the cached results broadcast,
      // and matchEnd() must fire at most once per match.
      if (!g.matchEnded) {
        g.matchEnded = true;
        g.portal.matchEnd();
      }
      showResults(msg, g.state.net.sessionId, () => returnToPort(g));
    },
    onRoomLeave: () => handleRoomLeave(g),
    // Minimal reconnect UX (story 0.2): a persistent RECONNECTING banner while
    // the SDK retries the same room, cleared the moment it resumes. Richer UX
    // (countdown, abandon flow) is Epic 6.7. If retries run out, onRoomLeave
    // fires next and swaps in the DISCONNECTED banner.
    onDrop: () => {
      g.reconnecting = true;
      showBanner('RECONNECTING…');
    },
    onReconnect: () => {
      g.reconnecting = false;
      hideBanner();
    },
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
  const cursor = g.camera.screenToWorld(g.mouse.screenPos);
  const aim = worldAim(pose.x, pose.y, cursor);
  renderFiring(g, pose, status, aim, cursor);
  g.hud.update(
    pose,
    g.keyboard.axes(),
    status,
    zone,
    match,
    g.stage.app.screen.width,
    g.stage.app.screen.height,
    g.deniedFlash,
    g.abilityFlash,
  );
}

/**
 * Weapon arc/marker + crosshair while alive; hidden once sunk. Also derives
 * the denied-click predicate — a fresh click (clickCount advanced since last
 * frame) that is out of arc OR not ready blips red; click-on-cooldown blips
 * too now that firing is click-to-fire (see render/deniedFire.ts) — and feeds
 * it into the rate-limited pulse; g.deniedFlash carries this frame's result
 * to hud.update() for the chip flash. NOT gated on the waiting/countdown
 * "weapons safe" phase: the server fires all weapons there too (only damage
 * is suppressed), so denying fire on that phase alone would red-pulse
 * "denied" while shells visibly leave the tube.
 */
function renderFiring(g: Game, pose: RenderPose, status: OwnStatus, aim: number, cursor: { x: number; y: number }): void {
  const clicked = g.mouse.clickCount !== g.prevClickCount;
  g.prevClickCount = g.mouse.clickCount;
  // Ability denied pulse (Story 1.6): consume each slot's one-shot press latch
  // into its rate-limited pulse (per-slot since Story 1.8 — the ML fits two
  // ability slots). Chips-only feedback — deliberately OUTSIDE the alive gate
  // below (a dead press is denied too and must still pulse) and never fed into
  // the weapon-arc/reticle denied visuals (nothing is aimed).
  const nowMs = performance.now();
  for (let s = 0; s < g.abilityPulse.length; s++) {
    g.abilityFlash[s] = g.abilityPulse[s].update(g.abilityDeniedPress[s], nowMs);
    g.abilityDeniedPress[s] = false;
  }
  if (!status.alive) {
    g.firing.hide();
    g.deniedFlash = false;
    return;
  }
  // Drive the firing UX from the client-primed slot (immediate), reading the
  // pool count + reload from the server-authoritative slot-aligned ammo array.
  // `ready` for the denied-fire gate is "the slot has a round" (ammo.n > 0); the
  // firing behavior keys off the fitted equipment ID (gun-family is 360° so
  // weaponArcHit is always true for it), never on a slot-index literal.
  const slot = g.keyboard.primedSlot;
  const a = status.ammo[slot] ?? null;
  const hasAmmo = !!a && a.n > 0;
  // EFFECTIVE reload duration (per-weapon reload upgrades) from the OWN
  // loadout's slot id — a primed slot always holds a weapon (the ability path
  // never primes), so the null branch is defensive only.
  const primedId = status.loadout[slot] ?? null;
  const reloadFrac = a && primedId !== null ? reloadFraction(a.reloadMsLeft, equipmentReloadMs(status.stats, primedId)) : 0;
  const inArc = weaponArcHit(pose.heading, aim, primedId);
  const denied = isClickDenied({ clicked, ready: hasAmmo, inArc });
  g.deniedFlash = g.deniedPulse.update(denied, performance.now());
  g.firing.update(
    pose,
    aim,
    primedId,
    { hasAmmo, reloadFrac },
    cursor,
    g.deniedFlash,
    weaponRangeU(status.stats, primedId), // per-weapon range-clamp marker (gun stacks; cannon/flare base)
  );
}

/**
 * The heading the fire-arc gate should use: the CLIENT-PREDICTED heading (the
 * same source renderFiring's `pose.heading` derives from — predictor.predicted),
 * NOT the stale server-echo `you.heading`. At click time the predicted hull has
 * already turned; gating a skillshot on the server echo would deny/consume a
 * bow-arc torpedo click the player sees as in-arc. Falls back to the server echo
 * only in raw (non-predict) debug mode or before prediction initializes.
 */
function predictedHeading(g: Game): number {
  if (g.state.mode === 'predict' && g.predictor.isInitialized) return g.predictor.predicted.heading;
  return g.state.net.you?.heading ?? 0;
}

/**
 * Client-predicted prime consumption on a fired click (Eric ruling 2026-07-21):
 * a NEW click this sim tick consumes the primed skillshot (reverts to gun) only
 * when the client predicts it FIREABLE — the slot is loaded (own ammo) AND in
 * the weapon's arc (against the PREDICTED heading). A predicted-denied click
 * (reloading / out of bow arc) KEEPS the prime; the denied pulse (renderFiring)
 * supplies the feedback. A dead / not-yet-spawned own ship never consumes the
 * prime (death resets it to gun anyway — handleSunk). Prime state is pure
 * client UX — the wire slot was already sampled at click time.
 */
function consumePrimeOnFire(g: Game, primedSlot: number, aim: number): void {
  const newClick = g.mouse.clickCount !== g.lastTickClick;
  g.lastTickClick = g.mouse.clickCount;
  if (!newClick) return;
  const you = g.state.net.you;
  const a = you?.ammo[primedSlot] ?? null;
  const loaded = !!a && a.n > 0;
  const inArc = weaponArcHit(predictedHeading(g), aim, g.ownSlots[primedSlot] ?? null);
  if (shouldConsumePrime(you?.alive ?? false, primedSlot, loaded, inArc)) g.keyboard.revertToGun();
}

/** SCREEN-space fog holes for the own ACTIVE lit zones — center via the camera,
 *  radius = world radius × zoom × the zone's fade (a closing hole as it dies).
 *  Only owned zones reach here; enemy zones never clear the own fog. */
function ownZoneFogHoles(g: Game, zones: readonly OwnZone[], now: number): FogHole[] {
  return zones.map((z) => {
    const s = g.camera.worldToScreen({ x: z.x, y: z.y });
    return { sx: s.x, sy: s.y, sr: z.r * g.camera.zoom * litZoneFade(z.until - now) };
  });
}

function renderAlive(g: Game, alpha: number, frameDt: number, now: number, zv: ZoneView, mu: MatchUx): void {
  const pose = ownPose(g, alpha, frameDt);
  const status = ownStatus(g);
  // Own ACTIVE star-shell zones (net → state → render): keep beyond-sight shells
  // revealed by our flare (projectiles) and clear our own fog over them (fog).
  const ownZones = ownActiveZones(g.state.net.litZones, g.state.net.sessionId, now);
  const inStorm = !!pose && zv.state !== 'idle' && isOutside(pose, zv.radius);
  if (stormEnterEdge(g.wasInStorm, inStorm)) g.audio.play('stormWarn');
  g.wasInStorm = inStorm;
  if (pose) renderOwn(g, pose, status, zoneHud(zv, now, inStorm), mu, frameDt);
  else g.ownView.gfx.visible = false; // forceSnap gap (respawn/P-toggle): no stale-pose flicker
  const w = g.stage.app.screen.width;
  const h = g.stage.app.screen.height;
  g.zone.update(zv.radius, zv.state, inStorm, now / 1000, w, h);
  // Own pose feeds the shell sight-bubble cull; own active zones keep a shell
  // revealed by our flare from being culled (exactly-once reveal — Story 1.7).
  g.projectiles.render(now, pose ?? undefined, ownZones);
  g.radar.render(pose, now);
  g.litZones.render(now); // fade each lit-zone glow by its timestamp expiry
  // The fog hole tracks the own ship's screen position (post camera update).
  const hole = pose ? g.camera.worldToScreen(pose) : g.camera.screenCenter;
  g.fog.update(hole.x, hole.y);
  g.fog.updateHoles(ownZoneFogHoles(g, ownZones, now)); // clear fog over owned lit zones
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
  g.upgradeMenu.hide(); // the spend window never lingers into spectate
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
  g.litZones.render(now); // spectators see all zones; fade them by expiry too
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
      const aimDist = worldAimDist(g.lastOwn.x, g.lastOwn.y, cursor);
      // The wire slot is the primed slot AT click time — sample it before any
      // prime consumption below, so a fireable skillshot click still sends its
      // slot even if this same tick reverts the prime back to the gun.
      const primedSlot = g.keyboard.primedSlot;
      const input = g.sampler.sample(g.keyboard.axes(), {
        aim,
        fireSeq: g.mouse.clickCount,
        aimDist,
        slot: primedSlot,
        fireT: g.mouse.lastClickT, // honest fire instant (server-clock estimate at pointerdown)
        actSeq: g.keyboard.actSeq, // ability-activation counter (0-sentinel; the keyboard owns it)
        actSlot: g.keyboard.actSlot,
      });
      consumePrimeOnFire(g, primedSlot, aim);
      // This tick's server-time estimate rides into the pending ring so a later
      // replay re-evaluates the boost gate at the identical per-tick time.
      if (g.state.mode === 'predict') g.predictor.localTick(input, g.clock.serverNow());
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
      // Clear the spend latch once it lands (pts dropped) or times out, THEN
      // read this frame's view — so a just-cleared latch un-dims immediately.
      updateSpendLatch(g);
      // Live-swap the spend window to the next queued offer after a spend, and
      // auto-close it at 0 pts / on spectate (currentOfferView → null).
      g.upgradeMenu.update(currentOfferView(g));
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
 * Immediately send + locally apply a rudder-neutral input that KEEPS the
 * current throttle order. Wired to document visibility + window blur so a
 * backgrounded tab can't leave a stale rudder locked over for the whole time
 * it's hidden (the server keeps applying the latest input it has every tick)
 * — but the throttle is a deliberate engine order, so the ship is meant to
 * keep steaming straight at its set speed while backgrounded. Fire can't
 * stick: fireSeq is a click counter, and the sampler re-sends the last value
 * ("no new clicks"). Routes through the sampler so seq stays monotonic with
 * the regular tick cadence, and through the predictor so the pending-input
 * ring (replayed on reconcile) stays consistent with what was actually sent.
 */
function sendNeutralInput(g: Game): void {
  if (g.state.spectating) return; // spectators send nothing at all
  const msg = g.sampler.sendNeutralNow(
    g.keyboard.throttle,
    g.mouse.clickCount,
    g.mouse.lastClickT,
    g.keyboard.actSeq, // a gap-press activates NOW, not on refocus (mirrors fireSeq)
    g.keyboard.actSlot,
  );
  if (g.state.mode === 'predict') g.predictor.localTick(msg, g.clock.serverNow());
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
  // Suppress the transient toast while reconnecting so it can't displace the
  // persistent RECONNECTING banner (mute still toggles).
  if (!game.reconnecting) showBanner(game.audio.muted ? 'MUTED' : 'UNMUTED', { autoHideMs: 1200 });
}

async function startGame(
  stage: Stage,
  menu: MenuHandle,
  name: string,
  cls: ShipClassId,
  audio: Audio,
  portal: PortalAdapter,
): Promise<void> {
  menu.setBusy(true);
  menu.setStatus('CONNECTING...');
  let conn: Connection;
  try {
    conn = await connect(name || undefined, cls);
  } catch (err) {
    console.error('[net] connection failed', err);
    menu.setStatus(connectErrorStatus(err), true);
    menu.setBusy(false);
    return;
  }
  menu.hide();
  hideBanner();

  // The server's map, regenerated deterministically from the welcome seed + cap.
  const map = mapFromWelcome(conn.welcome);
  buildMap(map, stage.layers);

  const game = buildGame(stage, conn, map, audio, cls, portal);
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
  // Portal seam: a real SDK requires init before any loading/gameplay events, so
  // encode that ordering now (init → loadingProgress(0) → stage load →
  // loadingProgress(1) → menu). The null adapter resolves immediately, so boot
  // timing is unchanged; Epic 7 swaps only the inner adapter here. The
  // safeAdapter wrap guarantees a misbehaving portal can never block boot or
  // any later lifecycle moment.
  const portal = safeAdapter(createNullAdapter());
  await portal.init();
  portal.loadingProgress(0);
  const stage = await createStage();
  portal.loadingProgress(1);
  document.getElementById('app')?.replaceChildren(stage.app.canvas);

  const audio = new Audio();
  const version = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
  const menu = showMenu(version, (name, cls) => {
    audio.resume(); // must happen inside the PLAY click's user-gesture handler
    void startGame(stage, menu, name, cls, audio, portal);
  });
}

main().catch((err) => {
  console.error('client boot failed', err);
});
