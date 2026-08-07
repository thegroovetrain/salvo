// Client bootstrap. Builds the Pixi stage immediately, shows the pre-join
// MENU (DOM) over the canvas, and connects only on PLAY. In-game: rebuilds the
// server's map from welcome (seed + playerCap), sends one input per 50ms sim
// tick (keys drive, mouse aims + one shot per click), renders own ship (predicted) +
// contacts (interp at -100ms) + dead-reckoned shells + combat feel effects,
// and drives the match-lifecycle UX: waiting/countdown lines, death →
// spectate (follow-killer camera, WASD pan, wheel zoom-out), results overlay,
// return to port (fresh joinOrCreate via reload).

import type { Container, Ticker } from 'pixi.js';
import type { Room } from '@colyseus/sdk';
import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  HEAL_CHOICE,
  MSG,
  NO_BOONS,
  boonBehaviors,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  hullSilhouette,
  isOutside,
  resolveBoons,
  slotsWithBoons,
  REGATTA_NO_HUE,
  SLOT_COUNT,
  type BoonDef,
  type Island,
  type DecoyView,
  type DeniedView,
  type EffectiveStats,
  type EquipmentId,
  type GameMap,
  type OwnShip,
  type ResultsMsg,
  type ShipClassId,
  type WeaponAmmo,
} from '@salvo/shared';
import { CLIENT_CONFIG } from './config.js';
import { createGameState, type GameState } from './state.js';
import { createStage, type Stage } from './render/stage.js';
import { buildMap, type MapChart } from './render/map.js';
import { Camera, canUserZoom } from './render/camera.js';
import { ShipView, FALLBACK_STYLE, PLAYER_HUES, hullStyle, hueRevision, setColorblindAssist } from './render/ships.js';
import { ContactViews, type PlateFrame } from './render/contacts.js';
import { NameplateLayer, latchPlate, plateScreenY } from './render/nameplates.js';
import { Projectiles, type OwnFire } from './render/projectiles.js';
import { FiringUX } from './render/firing.js';
import { AimPreview, computeAimPreview, ownBurstRadius, previewTint } from './render/aimPreview.js';
import { weaponArcHit, weaponRangeHit, weaponRangeU } from './render/weaponArc.js';
import { Effects } from './render/effects.js';
import { Mines, type OwnMineRings } from './render/mines.js';
import { Decoys } from './render/decoys.js';
import { LitZones, litZoneFade, ownActiveZones, type OwnZone } from './render/litZones.js';
import { Smoke } from './render/smoke.js';
import { Foghorn } from './render/foghorn.js';
import { Fog, type FogHole } from './render/fog.js';
import { Radar } from './render/radar.js';
import { Zone } from './render/zone.js';
import { tier1Active } from './render/attention.js';
import { Hud, reloadFraction, type OwnStatus } from './render/hud.js';
import { helmInputCounts, recordHelmInput } from './render/helmGlyphs.js';
import { Hotbar, type HotbarView } from './render/hotbar.js';
import { slotForBoonCategory } from './render/equipmentInfo.js';
import { XpRail, type XpView } from './render/xpRail.js';
import { spectatePan, wheelZoom, pickSpectateTarget, shouldEngageFreePan } from './render/spectate.js';
import { ShakeDriver } from './render/shake.js';
import { isClickDenied, DeniedPulse, DenialDedup } from './render/deniedFire.js';
import { KeyboardInput, slotHoldsAbility, type KeyboardHooks } from './input/keyboard.js';
import {
  UpgradeMenu,
  canLatchSpend,
  frontOfferSignature,
  offerView,
  spendOutcome,
  type OfferView,
  type SpendLatch,
} from './ui/upgradeMenu.js';
import { MouseInput, worldAim, worldAimDist, type ScreenPoint } from './input/mouse.js';
import { abilityPressDenied, hornPressVerdict, shouldConsumePrime } from './sim/inputSampler.js';
import { zoneViewFrom, type ZoneView } from './sim/zoneView.js';
import { OwnFireLatch } from './sim/ownFire.js';
import { startLoop, type LoopCallbacks } from './app/loop.js';
import { makeReturnToPort } from './app/returnToPort.js';
import { connect, connectErrorStatus, mapFromWelcome, probeServer, radarModes, type Connection } from './net/connection.js';
import { ServerClock } from './net/clock.js';
import { ContactStore, SnapshotBuffer } from './net/snapshots.js';
import { bindRoom } from './net/roomBindings.js';
import { Predictor, type RenderPose } from './sim/prediction.js';
import { InputSampler } from './sim/inputSampler.js';
import { showBanner, hideBanner } from './util/banner.js';
import { showHome, type HomeHandle } from './ui/home.js';
import { AmbientScene } from './render/ambient.js';
import { injectTheme } from './ui/theme.js';
import { matchUx, secondsUntil, spectateBannerText, type MatchUx } from './ui/phase.js';
import { barVisible, ringReadout, type ChromeBarView } from './ui/chromeBar.js';
import {
  closeResultsAsSpectate,
  hideResults,
  resultsVisible,
  showResults,
  updateResultsScore,
  winnerBanner,
  type ResultsView,
} from './ui/results.js';
import { SettingsOverlay, canAbandon, canOpenSurface, escapeAction } from './ui/settings.js';
import { effectiveScale, scaleFactor, settings } from './settings/store.js';
import { setUiScaleVar } from './ui/theme.js';
import {
  afloatCount,
  canOpenElimination,
  freshScore,
  isLiveRival,
  personalScore,
  personalScoreFromResults,
  recordElimination,
  recordSunk,
  refinePlacement,
  scoreAfterReconnect,
  type PersonalScore,
  type ScoreState,
} from './score.js';
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
  /** Screen-space truesight nameplates (render/nameplates.ts) — own hull + every
   *  contact. Contacts drive theirs through contactViews; the own plate is driven
   *  in renderOwn (keyed by sessionId). */
  nameplates: NameplateLayer;
  projectiles: Projectiles;
  firing: FiringUX;
  /** ORDNANCE AIM PREVIEW (render/aimPreview.ts): blast circles at the true
   *  burst point, travel lines for every projectile weapon, the homing
   *  acquisition band, and the mine's placement rings. Owner-private, drawn
   *  from own stats + the local map — nothing new crosses the wire. */
  aimPreview: AimPreview;
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
  /** WOUNDED SMOKE plumes (render/smoke.ts, Story 4.4) — accumulated from
   *  the anonymous `sm` pulses on the fog-immune chart, since a hurt hull is
   *  disclosed out to 495u and the plume must read past the sight bubble. */
  smoke: Smoke;
  /** FOGHORN bearing chevrons (render/foghorn.ts, Story 4.5) — the honk's
   *  visual twin, screen-space and above every HUD readout. */
  foghorn: Foghorn;
  /**
   * Server-clock estimate (ms) the local foghorn cooldown next opens at; 0 =
   * ready. Armed at SEND time by handleFoghornPress — see there for why the
   * client mirrors a server-authoritative gate at all.
   */
  nextHonkAt: number;
  zone: Zone;
  hud: Hud;
  /** The bottom-left hotbar (render/hotbar.ts, Story 2.2) — the loadout surface:
   *  four slots (Gun / Q / E / R), the full state grammar, hover tooltip, and
   *  key-equivalent slot clicks. Rendered only while alive in-match. */
  hotbar: Hotbar;
  /** The bottom-left ECONOMY SATELLITES (render/xpRail.ts, Story 2.6): the XP
   *  rail + LV tag in the hotbar's reserved gutter, the banked-level chip, and
   *  the "LEVEL UP — TAB TO REFIT" cue line. Render-only (it routes no click)
   *  and, like the hotbar, shown only while conning a live ship. */
  xpRail: XpRail;
  /** The TAB-toggled refit modal (ui/upgradeMenu.ts) — DOM; while open the
   *  game is under full combat lockout (Story 2.1) but the sim never pauses. */
  upgradeMenu: UpgradeMenu;
  /** The ESC-toggled settings overlay (ui/settings.ts, Story 2.3). A FOCUSED
   *  overlay: while it is open every sim key and canvas click is suppressed —
   *  and the simulation still never pauses. */
  settingsOverlay: SettingsOverlay;
  /** The own personal-score accumulator (score.ts) — reset at every hard
   *  boundary (match start, return to port, reconnect). */
  score: ScoreState;
  /** The match phase the accumulator's epoch was last synced to (see
   *  updateScoreEpoch — the ready room's sinkings are not match score). */
  scorePhase: string;
  /** render/ships.ts hue-table revision last applied to the own hull, so a live
   *  colorblind-assist toggle forces the latched own color to re-resolve. */
  hueRev: number;
  /** The UI-scale FACTOR currently applied to the Pixi HUD root + the DOM var. */
  uiScale: number;
  /**
   * FINDING A latch: set the instant a spend is sent, cleared once it visibly
   * lands (the bank shrinks or the offer queue shifts) or a fallback timeout
   * elapses (the server silently rejected it — so don't lock the player out
   * forever). Guards against two rapid spends (digit 1 then digit 2, or two
   * card clicks) within one server-tick+RTT both firing against the SAME
   * (now-stale) front offer — see trySpend()/updateSpendLatch() and the
   * spendLatchReleased() predicate they share.
   */
  spendInFlight: SpendLatch | null;
  /** Trailing-edge debounce handle for the fog re-bake after a user-zoom
   *  change (X/Z/wheel) — the zoom sibling of bindResize's local timer. */
  fogZoomTimer: ReturnType<typeof setTimeout> | null;
  /** Colyseus room — polled each frame for the public zone/match plane. */
  room: Room;
  /** Full map radius (u) — the zone's derived-radius baseline. */
  mapRadius: number;
  /** The island circles, rebuilt locally from the welcome map seed. Retained on
   *  the game because the aim preview clips its travel lines against them (the
   *  renderer's map layer had been the only holder). */
  islands: readonly Island[];
  /** The charted map layer (boundary, rings, hypsometric terrain). Still built
   *  once at join; retained only so the render loop can feed it the camera zoom
   *  — its contour strokes are screen-locked (cycle 59). */
  mapChart: MapChart;
  cameraSnapped: boolean;
  lastOwn: { x: number; y: number };
  /** Spectate-mode render state (death → spectate, active phase). */
  spectate: { freePan: boolean; visualsSet: boolean };
  /** A reload back to the menu is already scheduled/underway. */
  returning: boolean;
  /** THE return-to-port chain (app/returnToPort.ts), latched + always settling
   *  to a reload. Shared by the results button and results-phase Enter/ESC. */
  returnToPort: () => void;
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
  /** Exactly-one-feedback dedup for denied presses, keyed (slot, seq) —
   *  Story 1.10: predicted denials mark their key; a matching server denial
   *  is suppressed; an unmatched one fires the feedback late-but-explicit. */
  denialDedup: DenialDedup;
  /** One-shot latch: an UNMATCHED server denial landed on a WEAPON slot since
   *  the last render frame — consumed by renderFiring into the full denied
   *  pulse (arc/reticle red), the same visual a predicted denied click drives. */
  serverDeniedClick: boolean;
  /** One-shot latch PER LOADOUT SLOT: a denial landed on that slot since the
   *  last render frame — an ability press predicted DENIED (cooling/dead,
   *  Story 1.6) or, as of Story 1.10, an UNMATCHED server denial on ANY slot
   *  (weapon chips flash per-slot too) — consumed into the matching
   *  abilityPulse (never silence). Per-slot since Story 1.8: the ML fits TWO
   *  special slots (mine + decoyBuoy), so a denied press must not flash
   *  the decoy chip. Indexed by loadout slot (length SLOT_COUNT). */
  abilityDeniedPress: boolean[];
  /** Rate-limited denied pulse PER LOADOUT SLOT — the SAME deniedFire grammar
   *  (80ms flash / 300ms floor), one driver per slot so two ability slots (and
   *  the weapon click) don't share a rate window. Chips-only: an ability press
   *  never drives the weapon-arc/reticle denied visuals (nothing is aimed). */
  abilityPulse: DeniedPulse[];
  /** This frame's denied-flash PER LOADOUT SLOT — read by hud.update() for each
   *  chip's border (index = loadout slot). Covers ANY slot as of Story 1.10:
   *  predicted ability-press denials AND unmatched server denials on weapon or
   *  ability slots alike (the name predates the weapon-slot extension). */
  abilityFlash: boolean[];
  /** One-shot latch PER LOADOUT SLOT: an ability press was predicted READY on
   *  the optimistic press edge (the boost-prediction precedent) — consumed into
   *  the matching activatedPulse for the hotbar's ≤80ms ACTIVATED pop. */
  abilityActivatedPress: boolean[];
  /** Rate-limited ACTIVATED pop per loadout slot — the same 80ms/300ms register
   *  as the denied pulse (DESIGN.md specs the flash in ms, not frames). */
  activatedPulse: DeniedPulse[];
  /** This frame's activated-pop state per loadout slot (read by the hotbar). */
  activatedFlash: boolean[];
  /** One-shot latch PER LOADOUT SLOT: a boon landed on that slot's category
   *  (Story 2.9, amendment 51) — consumed into the matching fitPulse. */
  fitPress: boolean[];
  /** Rate-limited FIT pulse per loadout slot — the SAME 80ms/300ms register as
   *  the denied and activated pulses (one DeniedPulse driver per slot, so two
   *  fits in one refit window can't share a rate floor). */
  fitPulse: DeniedPulse[];
  /** This frame's fit-flash state per loadout slot (read by the hotbar). */
  fitFlash: boolean[];
  /** The RANK-WIDE fit channel: a shipwide INTEL/SHIP boon belongs to no single
   *  slot, so the whole stack flashes once on the same 80ms/300ms register. */
  fitFramePress: boolean;
  fitFramePulse: DeniedPulse;
  fitFrameFlash: boolean;
  /**
   * ms (server clock) — the latest OWN decoy buoy's expiry, the decoy slot's
   * ACTIVE window (amendment 48). Latched from the Decoys reconcile's own-spawn
   * hook, which is the only "you just placed one" signal the client gets; a
   * replacement buoy simply supersedes it (latest `until` wins).
   */
  ownDecoyUntil: number;
  /**
   * THE OWN-FIRE LATCH (Story 2.9, sim/ownFire.ts): the weapon behind the click
   * we just made. The `shell`/`torp` wire shape is deliberately constant-free —
   * it cannot say which barrel a shell left, and must not, or an onlooker could
   * read a build off a shot — so the OWN client pairs its own click intent with
   * the reveal that lands on its own bow (roomBindings' ownFireWeapon dep). The
   * claim is one-shot: one click is one round, and one reveal may wear it.
   */
  ownFire: OwnFireLatch;
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
  /**
   * True once the GAME-END results have been presented. From that moment the
   * debrief is final: a late own-`sunk` (the winner's own killing blow race)
   * must not replace the placement table with a live elimination modal, and the
   * modal's numbers stop being re-derived from the roster.
   */
  resultsFinal: boolean;
  /** performance.now() when the results overlay was shown (Infinity until it
   *  is). Results-phase ESC/Enter arm only after CLIENT_CONFIG.results.keyGraceMs
   *  has elapsed, so a key aimed at the refit modal can't instantly return. */
  resultsShownAt: number;
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
  /** Own personal-hue INDEX last applied to the hull/wake (Story 1.12): null until
   *  the roster syncs (the amber-hollow fallback the hull boots on). updateOwnColor
   *  recolors when this changes. */
  ownHueIndex: number | null;
  /** Story 1.13: true once the OWN nameplate's text/color have resolved + been
   *  set (latched, mirroring ownHueIndex) — the plate persists thereafter and is
   *  only positioned/alpha'd per frame. */
  ownPlated: boolean;
  /**
   * Cached effectiveStats(ownClass, own fitted boons) — THE client-side stat
   * source (HUD denominators, predictor kinematics, radar/camera/fog ranges,
   * firing-arc gun range). Starts at the guessed class with zero boons;
   * applyOwnStats() swaps it whenever you.cls or you.boons changes.
   */
  ownStats: EffectiveStats;
  /**
   * Slot-aligned equipment ids of the OWN loadout — slotsWithBoons(you.cls,
   * ownStats, resolved boons): the hull's base loadoutFor fit with every
   * applied boon's slot effects replayed over it (Story 2.5), client-side and
   * read-only (Story 1.6). Drives the slot-2 activate-vs-prime
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
 *  view of the shared derivation (Story 1.6, grown boons in 2.5): the class
 *  fit (TB [gun, torpedo, speedBoost, null], etc.) with every applied boon's
 *  slot effects replayed over it (slotsWithBoons — the SAME per-effect
 *  function the server applies incrementally, so slot ids agree by
 *  construction). Zero boons ≙ plain loadoutFor. */
function slotIdsFor(cls: ShipClassId, stats: EffectiveStats, boons: readonly BoonDef[]): (EquipmentId | null)[] {
  return slotsWithBoons(cls, stats, boons).map((s) => s.equipmentId);
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
    // DAMAGE CONTROL's still-draining regen pool (cycle 46). Self-private and
    // server-authoritative — it rides `you` and is read VERBATIM, never
    // predicted: the pool pays out on the server's wall clock and `hp` already
    // self-syncs every frame, so the HUD's only job is to show what is coming.
    repairHp: you?.repairHp ?? 0,
    ammo: ownAmmo(you, stats, g.ownSlots),
    cls: you?.cls ?? g.ownClass,
    stats,
    // Client-primed slot (immediate), not a server echo — the server keeps no
    // priming state. Keeps the HUD chip highlight in lockstep with the arcs/
    // denied-flash, which read g.keyboard.primedSlot directly. Ammo VALUES still
    // come from the server-authoritative ammo[] above.
    primedSlot: g.keyboard.primedSlot,
    alive: you?.alive ?? true,
    respawnInMs: respawnMs(g.state.respawnEta, g.clock.serverNow()),
    loadout: g.ownSlots,
    boostActive: g.clock.serverNow() < boostUntilNow(g),
    ...victimWindows(you, g.clock.serverNow()),
  };
}

/**
 * Story 2.9 — the victim tells' remaining ms. Read VERBATIM off the victim-
 * private windows on `you` against the server clock (the dazzle fog-shrink
 * gate's exact source), never predicted: what an enemy doctrine did to us is
 * the server's word, and a mispredicted tell is a lie about our own hull.
 * Lifted out of ownStatus() as its own function so the status builder stays
 * under the complexity ceiling as `you`-derived fields accumulate.
 */
function victimWindows(you: OwnShip | null | undefined, now: number): Pick<OwnStatus, 'slowedMsLeft' | 'dazzledMsLeft'> {
  return {
    slowedMsLeft: windowLeft(you?.slowedUntil, now),
    dazzledMsLeft: windowLeft(you?.dazzledUntil, now),
  };
}

/** ms remaining on a victim window (0 when absent or already expired). */
function windowLeft(until: number | undefined, now: number): number {
  return Math.max(0, (until ?? 0) - now);
}

/**
 * FINDING A: the single entry point for BOTH spend paths (digit picks via
 * handleRefitPick, and the UpgradeMenu card-click callback). Ignores a
 * second spend while one is already in flight — otherwise two rapid spends
 * within one server-tick+RTT (digit 1 then digit 2, or two card clicks) both
 * read the SAME client-side front offer, and the second lands after the
 * server's FIFO shift and applies an upgrade the client never displayed.
 * Snapshots the banked count AND the front offer at send time (separately —
 * see SpendLatch); cleared by updateSpendLatch() once the spend visibly lands
 * (or is ACKED by the server's `bn` event) or the fallback timeout elapses.
 *
 * Both gates live in the pure `canLatchSpend` — a second spend in flight, and a
 * pick that lands with NO own ship in the mirror (the frame that dropped `you`
 * has arrived but the band's hide is one rAF away): the latter would latch a
 * pts:0 / empty-signature snapshot that no later frame can ever satisfy, so it
 * is guaranteed to time out and fire a spurious denied pulse. Nothing is
 * spendable in that state, so the pick is dropped without even sending.
 */
function trySpend(g: Game, choice: number): void {
  const you = g.state.net.you;
  if (!canLatchSpend(g.spendInFlight, you)) return;
  g.room.send(MSG.spend, { choice });
  // `choice` rides the latch so a FAILED outcome can pulse exactly the card the
  // player picked (amendment 36's denied register). `acked` flips true if the
  // server's self-private `bn` fitted event for this spend arrives first.
  g.spendInFlight = { pts: you?.pts ?? 0, offerSig: frontOfferSignature(you), at: performance.now(), choice, acked: false };
}

/**
 * The server's own receipt for the spend in flight: the self-private `bn` (boon
 * fitted) event arrived on this frame (net/roomBindings → onSpendAck). It is the
 * ONLY direct evidence the spend landed — `pts`/front-offer inference can be
 * masked by a passive bank arriving in the same frame as a coincidentally
 * identical re-roll, which used to classify a SUCCESSFUL spend as 'failed' and
 * fire the denied pulse against the ◆ FITTED toast that had just appeared.
 * Ignored when no latch is in flight (a `bn` from a spend already classified).
 */
function markSpendAcked(g: Game): void {
  if (g.spendInFlight) g.spendInFlight.acked = true;
}

/**
 * Clear the spend latch once spendOutcome() says it is no longer 'pending' —
 * the server ACKED it (markSpendAcked) or the bank shrank / the offer queue
 * shifted ('success'), or the own ship is gone / the fallback timeout elapsed
 * ('failed'). A pts INCREASE with an unchanged
 * front offer HOLDS the latch: Story 2.6's passive banking makes that routine
 * mid-flight, and the old "changed in ANY way" check released on it — re-opening
 * the very double-spend-against-a-shifted-FIFO hazard the latch exists to
 * prevent. Called once per render frame, on the same clock (`performance.now()`)
 * the render loop already uses for the denied-fire pulse — no new timer.
 *
 * Story 2.7 (amendment 36): the window no longer closes on a pick, so the two
 * released outcomes are now VISIBLY different — 'success' lets the next queued
 * offer render in place (or auto-close at 0 levels through update(null)), while
 * 'failed' fires the denied edge pulse on the picked card with the level still
 * banked. The release RULE is untouched; only the classification is new.
 *
 * Returns the card index to PULSE (a failed spend) or null. The pulse itself is
 * deliberately NOT fired here: releasing the latch flips `locked` false, which
 * makes the very next upgradeMenu.update() rebuild the card row — and a pulse
 * painted before that rebuild would be thrown away with the old buttons. The
 * caller pulses AFTER the update (see the render loop).
 */
function updateSpendLatch(g: Game): number | null {
  const inFlight = g.spendInFlight;
  if (!inFlight) return null;
  const outcome = spendOutcome(inFlight, g.state.net.you, performance.now());
  if (outcome === 'pending') return null;
  g.spendInFlight = null;
  return outcome === 'failed' ? inFlight.choice : null;
}

/**
 * Per-frame refit-band sync (called from the render loop). Order is load-bearing:
 *   1. clear the spend latch once it lands or times out — so a just-cleared
 *      latch un-dims the cards immediately, on this frame;
 *   2. live-swap the band to the next queued offer, auto-closing at 0 levels or
 *      on spectate (currentOfferView → null force-hides);
 *   3. only THEN pulse a REJECTED pick — the un-dim in (2) rebuilds the card
 *      row, and a pulse painted before it would be discarded with the old
 *      buttons — and only into a band that is actually ON SCREEN: the latch
 *      outlives the window (a TAB close, or the you-gone force-hide in (2)),
 *      and pulsing a hidden band paints nothing while consuming the 300ms
 *      same-source floor, swallowing the next honest denial.
 */
function syncRefitBand(g: Game): void {
  const deniedCard = updateSpendLatch(g);
  g.upgradeMenu.update(currentOfferView(g));
  if (deniedCard !== null && g.upgradeMenu.visible) g.upgradeMenu.pulseDenied(deniedCard);
}

/** The spend view for THIS frame (null = nothing to show → menu auto-hides). */
function currentOfferView(g: Game): OfferView | null {
  return offerView(g.state.net.you, g.state.spectating, g.spendInFlight !== null);
}

/**
 * TAB — toggle the refit modal (Story 2.1, amendment 1). Opens ONLY when a
 * banked point exists (the existing visibility rule: currentOfferView is null
 * at 0 pts / while spectating — at 0 pts nothing happens); TAB again closes
 * without choosing. Digit picks route through handleRefitPick below.
 */
function handleRefitToggle(g: Game): void {
  // No stacking, either direction (amendment 23): the refit modal never opens
  // over the settings overlay or the results screen. (The chokepoint already
  // swallows TAB under a focused overlay; this is the policy-side guard.)
  if (!g.upgradeMenu.visible && !canOpenSurface('refit', openSurfaces(g))) return;
  const view = currentOfferView(g);
  if (!view) {
    g.upgradeMenu.hide();
    return;
  }
  // Opening the refit window re-arms the banked-level chip's breath (amendment
  // 1's binding replacing the old SPACE touch); closing it deliberately does not.
  if (!g.upgradeMenu.visible) g.xpRail.rearm();
  g.upgradeMenu.toggle(view);
}

/**
 * A digit 1–5 pressed WHILE the modal is open (the chokepoint enforces the
 * refit-or-nothing rule; digit meaning was evaluated against modal state at
 * its own keydown): pick card `choice` and spend. The window STAYS OPEN
 * (amendment 36 — it rides the queue; the last spend closes it by emptying the
 * bank, which makes currentOfferView() null). All four digits are live against
 * the ratified four-card offer; a choice past the offer's actual length (a
 * short offer from a small catalog) falls off the end → nothing. A locked view
 * (spend in flight) is inert, exactly like the cards.
 */
function handleRefitPick(g: Game, choice: number): void {
  if (!g.upgradeMenu.visible) return;
  const view = currentOfferView(g);
  if (!view || view.locked) return;
  // DIGIT 5 — the DAMAGE CONTROL rail. It is addressed by the reserved negative
  // sentinel, so it deliberately skips the card-index bound below. A pick the
  // server WOULD refuse (full hp, sunk hull) is refused HERE too, with the same
  // 80ms denied edge pulse a rejected card gets: the client-side guard is the
  // server's own fail-closed rule mirrored, and without it the refusal would
  // have to come back as a 1.5s latch timeout — an eternity for what will be
  // the most-mashed key in the band (mashing 5 at full hp is routine).
  if (choice === HEAL_CHOICE) {
    if (view.heal.state === 'armed') trySpend(g, choice);
    else g.upgradeMenu.pulseDenied(choice);
    return;
  }
  if (choice >= view.options.length) return;
  trySpend(g, choice);
}

/**
 * True once the results overlay has been up for the arming grace
 * (CLIENT_CONFIG.results.keyGraceMs). Before that, an ESC/Enter the player
 * aimed at the refit modal would land on the just-shown results screen and
 * instantly tear the match down. False while resultsShownAt is Infinity (no
 * results yet), so the keys can never fire early.
 */
function resultsKeysArmed(g: Game): boolean {
  return performance.now() - g.resultsShownAt >= CLIENT_CONFIG.results.keyGraceMs;
}

/** The surfaces the uniform ESC law arbitrates between, topmost-first. */
function openSurfaces(g: Game): { results: boolean; refit: boolean; settings: boolean } {
  return { results: resultsVisible(), refit: g.upgradeMenu.visible, settings: g.settingsOverlay.visible };
}

/**
 * ESC — THE uniform topmost-close law (amendment 23; the decision itself is the
 * pure `escapeAction`). It closes the topmost open surface — results modal
 * (identically to pressing SPECTATE), then the refit modal, then the settings
 * overlay — and only when NOTHING is open does it toggle settings on. ESC never
 * returns to port and settings never stacks over another surface.
 *
 * The results arming grace still binds: inside it an ESC the player aimed at the
 * refit modal must not dismiss the just-shown results screen, so the close is
 * simply skipped (the modal stays up and the next ESC lands honestly).
 */
function handleEscape(g: Game): void {
  const action = escapeAction(openSurfaces(g));
  if (action === 'closeResults') {
    if (resultsKeysArmed(g)) closeResultsAsSpectate();
    return;
  }
  if (action === 'closeRefit') g.upgradeMenu.hide();
  else if (action === 'closeSettings') g.settingsOverlay.close();
  else openSettingsOverlay(g);
}

/**
 * Open the settings overlay from inside a match. Opening it is a FOCUSED-overlay
 * edge, so every held helm key is dropped the way entering spectate drops them:
 * the chokepoint's suppression is keydown-only while `axes()` reads the LATCHED
 * key set, so a rudder key held as the overlay opened would keep steering the
 * (never-paused) ship until a keyup that the suppression swallows. The telegraph
 * order is deliberately untouched — it is a set-and-forget order, not a held key.
 */
function openSettingsOverlay(g: Game): void {
  g.settingsOverlay.open();
  g.keyboard.clearKeys();
}

/**
 * ENTER — confirm the topmost surface. On the GAME-END results screen that is
 * RETURN TO PORT (UX-DR27, kept by amendment 22); on an elimination modal
 * mid-match there is nothing to confirm (leaving is the explicit button). On the
 * settings overlay it fires an ARMED danger action — amendment 19 rules the
 * confirm as "second click OR Enter", and the danger buttons never keep focus,
 * so the key has to arrive through this hook. Inert otherwise, and inside the
 * results arming grace.
 */
function handleConfirm(g: Game): void {
  if (resultsVisible()) {
    if (g.state.matchOver && resultsKeysArmed(g)) returnToPort(g);
    return;
  }
  if (g.settingsOverlay.visible) g.settingsOverlay.confirmArmed();
}


/** The public plane fields this client polls off the room schema. */
interface PublicState {
  zoneState?: string;
  zoneStartT?: number;
  zoneCurCx?: number;
  zoneCurCy?: number;
  zoneCurR?: number;
  zoneNextCx?: number;
  zoneNextCy?: number;
  zoneNextR?: number;
  matchPhase?: string;
  countdownEndT?: number;
  winnerId?: string;
  players?: {
    size: number;
    get(id: string): { name?: string; color?: number; kills?: number; alive?: boolean } | undefined;
    /** MapSchema iteration (roster scans: live-contestant count for placement).
     *  `color` carries the drone sentinel, so placement can exclude drones. */
    forEach(fn: (meta: { id?: string; alive?: boolean; color?: number }) => void): void;
  };
}

function publicState(g: Game): PublicState {
  return (g.room.state ?? {}) as PublicState;
}

/** Read the public zone plane off the polled room schema (fail-safe to idle) —
 *  the pure derivation (shared zoneLiveState + the stale-boundary guard) lives
 *  in sim/zoneView.ts so it stays unit-testable without Pixi. */
function zoneView(g: Game, now: number): ZoneView {
  return zoneViewFrom(publicState(g), g.mapRadius, now);
}

/** Read the public match plane and map it to HUD strings. */
function matchUxFromRoom(g: Game, now: number): MatchUx {
  const s = publicState(g);
  return matchUx(s.matchPhase ?? 'waiting', s.players?.size ?? 1, s.countdownEndT ?? 0, now);
}

/**
 * Reset the personal-score accumulator on the waiting/countdown → ACTIVE edge.
 * The weapons-safe ready room lets hulls sink and respawn freely; none of that
 * is match score, and a ready-room death is a respawn, never an elimination.
 */
function updateScoreEpoch(g: Game): void {
  const phase = publicState(g).matchPhase ?? 'waiting';
  if (phase === g.scorePhase) return;
  g.scorePhase = phase;
  if (phase === 'active') g.score = freshScore();
}

/** Roster name lookup (Story 1.13): the synced callsign or null — NEVER a
 *  raw-session-id fallback. Every consumer supplies its own null policy: the
 *  nameplates show no plate, the score card drops the name from the roll, and
 *  the kill feed substitutes its neutral UNKNOWN_VESSEL label — a session id
 *  is transport plumbing and must never print anywhere a player reads. */
function rosterNameOrNull(g: Game, id: string): string | null {
  return publicState(g).players?.get(id)?.name ?? null;
}

/**
 * Personal-hue INDEX (0..19) for a roster id (Story 1.12), or null for the drone
 * sentinel (255), a roster miss, or a not-yet-synced entry. The source of truth
 * for own + contact hull colors and the ordnance-marker tint.
 */
function rosterColor(g: Game, id: string): number | null {
  const c = publicState(g).players?.get(id)?.color;
  // The single chokepoint: ANY value outside a real wheel index (0..19) — the 255
  // drone sentinel, a malformed schema byte, a not-yet-synced entry — resolves to
  // null, which keeps every downstream PLAYER_HUES[idx] lookup in range.
  return typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < PLAYER_HUES.length ? c : null;
}

/** Kill-feed name color for a vessel id: the bright personal hue for a human,
 *  drone-outline for a drone (sentinel 255), null for a roster miss (the feed
 *  leaves the name in text-secondary). */
function feedColor(g: Game, id: string): number | null {
  const c = publicState(g).players?.get(id)?.color;
  if (typeof c !== 'number') return null; // roster miss
  if (c === REGATTA_NO_HUE) return CLIENT_CONFIG.colors.droneOutline; // drone grey
  return PLAYER_HUES[c] ?? null; // human personal hue
}

/** Ordnance-marker tint for a firer id (mine/decoy/lit-zone `by`): the pilot's
 *  bright personal hue for every observer, or null while the roster hasn't synced
 *  it (or the firer left) — the renderer paints the amber fallback and retries
 *  per frame until the hue resolves (render/hueLatch.ts). The `?? amber` on the
 *  resolved branch is belt-and-braces: rosterColor already guarantees idx is in
 *  range, so PLAYER_HUES[idx] is never undefined here. */
function ordnanceHue(g: Game, by: string): number | null {
  const idx = rosterColor(g, by);
  return idx === null ? null : PLAYER_HUES[idx] ?? CLIENT_CONFIG.colors.amber;
}

/**
 * Recolor the own hull + wake the moment the own roster hue is first known
 * (Story 1.12): the roster schema can sync AFTER the first rendered frame, so the
 * hull/wake boot on the amber fallback and swap to the personal hue here. Cheap
 * idempotent poll — redraws only when the resolved index actually changes.
 */
function updateOwnColor(g: Game): void {
  const idx = rosterColor(g, g.state.net.sessionId);
  // Story 2.3: a colorblind-assist toggle swaps the whole hue table, so the
  // LATCHED own color has to re-resolve even though the roster index is
  // unchanged — the revision counter is that edge.
  const rev = hueRevision();
  if (idx === g.ownHueIndex && rev === g.hueRev) return;
  // A hue-table swap also invalidates the LATCHED own nameplate (its text color
  // is the personal hue's text-safe variant), so drop the latch and let
  // updateOwnPlate re-resolve it on this same frame.
  if (rev !== g.hueRev) g.ownPlated = false;
  g.ownHueIndex = idx;
  g.hueRev = rev;
  const style = hullStyle(idx);
  g.ownView.setColors(style.stroke, style.fill);
  // `?? amber` guards the array lookup so setWakeColor can never receive undefined
  // (rosterColor already keeps idx in range; this is belt-and-braces).
  g.effects.setWakeColor(idx === null ? CLIENT_CONFIG.colors.amber : PLAYER_HUES[idx] ?? CLIENT_CONFIG.colors.amber);
}

/**
 * Own truesight nameplate (Story 1.13): resolve + latch the own callsign plate
 * once the roster syncs the own name + hue (the SAME roster source as the hull
 * color — own callsign comes from the roster, never localStorage), then float it
 * above the own hull at screen space, full alpha. Own is never a drone. The
 * caller (renderOwn) runs this after camera.update so the projection matches the
 * hull; the plate hides whenever the hull hides (spectate / forceSnap gap).
 */
function updateOwnPlate(g: Game, pose: RenderPose): void {
  const id = g.state.net.sessionId;
  if (!g.ownPlated) {
    const r = latchPlate(false, rosterNameOrNull(g, id), rosterColor(g, id), false);
    if (r.plate) g.nameplates.set(id, r.plate.text, r.plate.color);
    g.ownPlated = r.latched;
  }
  const sc = g.camera.worldToScreen(pose);
  g.nameplates.place(id, sc.x, plateScreenY(sc.y, g.ownClass, g.camera.zoom, CLIENT_CONFIG.nameplate.padPx), 1);
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

/**
 * THE BR CHROME BAR's per-frame payload (Story 3.3) — `n AFLOAT · n KILLS ·
 * T+mm:ss · <ring readout>`. Assembled here from data the client already holds
 * and composed in ui/chromeBar.ts; this function stays a wiring point.
 *
 * The visibility gate is the ZONE TIMELINE, not the match phase: the zone
 * anchors at the exact moment the match goes active, `zoneStartT` is public
 * schema, and one gate therefore covers live, finished, spectate and reconnect
 * (and the pre-live ready room — waiting/gathering/countdown — where the timeline
 * is idle and the match-phase lines own top-center) without touching any of the
 * match plumbing.
 *
 * `matchMs` is DERIVED every frame from the server clock against the anchor, so
 * a reconnect mid-match shows the right T+ on its first frame — there is no
 * local accumulator that could have missed the outage.
 */
function chromeBarView(g: Game, zv: ZoneView, now: number, tier1: boolean): ChromeBarView {
  const players = publicState(g).players;
  return {
    // The gate also requires a REAL anchor (barVisible): `zoneStartT` is 0 until
    // the server anchors the timeline, and a non-idle state presented against
    // that sentinel would print `now − 0` as the match clock.
    visible: barVisible(zv.state, zv.startT),
    // The public-register cycle (superseding amendment 19): AFLOAT counts
    // CAPTAINS — drones are not combatants and are excluded via the roster hue
    // sentinel — but the LOCAL PLAYER is still counted, unlike the rival count
    // placement uses (score.ts isAfloatHull has the full doctrine note).
    afloat: players ? afloatCount(players, REGATTA_NO_HUE) : 0,
    kills: ownKills(g),
    matchMs: Math.max(0, now - zv.startT),
    // `closesInMs` is handed over verbatim — its dual meaning (to close START
    // pre-close, to close END while closing) is the composer's contract.
    ring: ringReadout(zv.state, zv.closesInMs),
    tier1,
  };
}

// --- personal score + the results modal (amendments 22/23) ---------------------

/**
 * Live CONTESTANT count excluding the local player — the placement input
 * (k rivals still floating ⇒ you place k+1). Read off the public roster, and
 * DRONES ARE NOT CONTESTANTS: they fill empty slots so a solo captain still
 * gets a battle royale, the win check is human-gated, and the results table
 * lists humans only — so a placement counting them reported a number that
 * matched nothing else the player is shown.
 */
function othersAlive(g: Game): number {
  const players = publicState(g).players;
  if (!players) return 0;
  let n = 0;
  players.forEach((meta: { id?: string; alive?: boolean; color?: number }) => {
    if (isLiveRival(meta, g.state.net.sessionId, REGATTA_NO_HUE)) n += 1;
  });
  return n;
}

/** Has the ROSTER caught up with our own sinking? While it hasn't, the alive
 *  count it reports is a patch-lagged snapshot and the placement derived from
 *  it is provisional (see score.ts refinePlacement). */
function ownRosterSettled(g: Game): boolean {
  return publicState(g).players?.get(g.state.net.sessionId)?.alive === false;
}

/** The own roster kill tally (server-authoritative, public, drones included). */
function ownKills(g: Game): number {
  return publicState(g).players?.get(g.state.net.sessionId)?.kills ?? 0;
}

/** True iff `id` is a DRONE (the roster's 255 hue sentinel). */
function isDroneId(g: Game, id: string): boolean {
  return publicState(g).players?.get(id)?.color === REGATTA_NO_HUE;
}

/** Did the local player win? (Public match plane, once finished.) */
function isWinner(g: Game): boolean {
  return publicState(g).winnerId === g.state.net.sessionId;
}

/** Assemble the modal's personal-score block from the accumulator + roster. */
function ownScore(g: Game): PersonalScore {
  return personalScore(g.score, g.state.net.you?.boons, ownKills(g), isWinner(g));
}

/**
 * EVERY observed sinking (own included) folds into the score accumulator: a kill
 * credited to us adds the victim to the sunk-contestant roll (drones excluded),
 * and OUR OWN sinking during a LIVE match latches the elimination placement and
 * opens the results modal immediately — the ratified replacement for the old
 * silent auto-spectate.
 */
function handleSunkObserved(g: Game, victimId: string, killerId: string | null): void {
  g.score = recordSunk(
    g.score,
    // rosterNameOrNull, never rosterName: a victim who has already LEFT the
    // roster has no callsign, and the id fallback would print a session id into
    // "SHIPS YOU SANK". A nameless kill still counts in the roster tally.
    { victimId, victimName: rosterNameOrNull(g, victimId), killerId, victimIsDrone: isDroneId(g, victimId) },
    g.state.net.sessionId,
  );
  if (victimId !== g.state.net.sessionId) return;
  // The three ways an own-sinking is NOT an elimination-modal moment: a
  // ready-room respawn, an own-`sunk` racing in behind the game-end results
  // broadcast, and a duplicate of a sinking already latched. See
  // score.ts canOpenElimination for the full reasoning on each.
  if (!canOpenElimination(publicState(g).matchPhase ?? 'waiting', g.resultsFinal, g.score.eliminated)) return;
  g.score = recordElimination(g.score, othersAlive(g));
  showEliminationResults(g);
}

/** The elimination modal: personal score + placement, SPECTATE + RETURN TO PORT. */
function showEliminationResults(g: Game): void {
  presentResults(g, { banner: 'ELIMINATED', victory: false, score: ownScore(g), rows: null, ownId: g.state.net.sessionId, canSpectate: true });
}

/**
 * The game-end modal: the same score card plus the full placement table.
 *
 * Winner, placement and kills come from the RESULTS MESSAGE, never from the
 * polled schema: the broadcast lands before the patch that sets `winnerId`, so
 * a schema-derived victory flag made the actual winner read "ELIMINATED —
 * PLACE #n" under a VICTORY banner until the patch caught up.
 */
function showMatchResults(g: Game, msg: ResultsMsg): void {
  const score = personalScoreFromResults(g.score, g.state.net.you?.boons, msg, g.state.net.sessionId, ownKills(g));
  presentResults(g, {
    banner: winnerBanner(msg, g.state.net.sessionId),
    victory: score.winner,
    score,
    rows: msg.rows,
    ownId: g.state.net.sessionId,
    canSpectate: false, // nothing left to watch
  });
}

/**
 * One entry point for both modal moments: the refit modal never stays painted
 * under it (no stacking, either direction), the settings overlay closes for the
 * same reason, held helm keys are dropped (a focused overlay owns the input, and
 * axes() reads LATCHED keys the keydown-only suppression never sees released),
 * and the key-arming grace restarts so a keypress aimed at whatever was on
 * screen a frame ago can't instantly dismiss it.
 */
function presentResults(g: Game, view: ResultsView): void {
  g.upgradeMenu.hide();
  g.settingsOverlay.close();
  g.keyboard.clearKeys();
  g.resultsShownAt = performance.now();
  showResults(view, { onSpectate: () => undefined, onReturn: () => returnToPort(g) });
}

/**
 * Converge the OPEN elimination modal on server truth as roster patches land
 * (fixes both the multi-death-tick placement inflation and the mutual-kill
 * tally race). Cheap by construction: the pure refine is a no-op once the
 * roster has applied our own sinking, and updateResultsScore compares a
 * signature before it touches the DOM. The game-end table is never re-derived
 * here — its numbers came from the results message, which is already final.
 */
function updateOpenResults(g: Game): void {
  if (g.resultsFinal || !g.score.eliminated || !resultsVisible()) return;
  g.score = refinePlacement(g.score, othersAlive(g), ownRosterSettled(g));
  updateResultsScore(ownScore(g));
}

// --- return to port / disconnect ---------------------------------------------

/**
 * The Game's return-to-port action (app/returnToPort.ts owns the chain and the
 * latch): ad break → leave() raced against a timeout → reload, so a socket the
 * server already disposed can never strand the player on the results screen.
 * Late-bound over gRef exactly like onSpendClick — the deps are read at
 * activation time, never captured at construction.
 */
function makeGameReturnToPort(getG: () => Game | null): () => void {
  return makeReturnToPort({
    requestAdBreak: () => getG()?.portal.requestAdBreak() ?? Promise.resolve(),
    leaveRoom: () => getG()?.room.leave() ?? Promise.resolve(),
    reload: () => location.reload(),
    onStart: () => {
      const g = getG();
      if (!g) return;
      g.returning = true; // handleRoomLeave: the reload is already on its way
      cancelZoomFogRebake(g); // no trailing re-bake against a torn-down stage
      // Defensive: today the chain always ends in location.reload(), which
      // wipes every plume for free — but a plume is drawn at a hull's TRUE
      // world position, so if a future match-restart path ever skips the
      // reload, stale smoke must not survive to render at pre-reset
      // coordinates on the next match.
      g.smoke.clear();
      // Same defence for the foghorn chevrons (Story 4.5): a bearing is a fact
      // about one moment on one ocean, and it must not survive into the next.
      g.foghorn.clear();
    },
  });
}

/**
 * Back to the menu via a full reload: bulletproof teardown of the Pixi scene,
 * loop, listeners, and net state in one stroke; the next PLAY is a fresh
 * joinOrCreate. The saved callsign persists in localStorage. Reached from the
 * results button AND from results-phase Enter/ESC (UX-DR27) — one path.
 */
function returnToPort(g: Game): void {
  if (g.returning) return; // handleRoomLeave latched first — its reload is underway
  g.returnToPort();
}

/** The room connection ended (server disposal, network death, or own leave). */
function handleRoomLeave(g: Game): void {
  if (g.returning) return; // we initiated it; reload is already on its way
  g.returning = true;
  g.reconnecting = false; // the reconnect window closed (retries exhausted / fast-fail)
  cancelZoomFogRebake(g); // same teardown hygiene as returnToPort
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
  cls: ShipClassId,
  hooks: KeyboardHooks,
  nowServer: () => number,
  fireLocked: () => boolean,
  onSlotPress: (p: ScreenPoint) => boolean,
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

  // THE in-match keyboard chokepoint (Story 2.1): one keydown listener owns
  // every sim key through the hooks built in keyboardHooks() below.
  const keyboard = new KeyboardInput(hooks);
  keyboard.attach();
  // Inject the server-clock estimate so pointerdown can stamp an honest fire
  // time (D1). Lazy thunk: MouseInput is built before the clock exists, so it
  // resolves gRef.clock at click time, never captures it (serverNow() returns
  // 0 pre-ready → the fireT "no claim" sentinel). `fireLocked` is the refit
  // modal's full combat lockout; attach() takes the game canvas so ONLY
  // canvas-target pointerdowns ever fire (DOM chrome clicks never do) and the
  // canvas contextmenu is suppressed.
  // `onSlotPress` is the hotbar gate (Story 2.2): a canvas press over a slot is
  // that slot's key-equivalent action and is swallowed, never a shot.
  const mouse = new MouseInput(nowServer, fireLocked, onSlotPress);
  mouse.attach(stage.app.canvas);

  // Guessed-class hull until the first frame confirms/corrects it; boots on the
  // amber-hollow fallback and recolors to the own personal hue once the roster
  // syncs (Story 1.12 — see updateOwnColor).
  const ownView = new ShipView(FALLBACK_STYLE, cls);
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
 * THE live-helm predicate: the player is conning a ship right now (own ship
 * present and alive, not spectating). ONE gate, shared by both pieces of helm
 * feedback — the telegraph bell (silent while spectating, where W/S pans the
 * camera, or dead-awaiting-respawn: those taps never reach a live engine room)
 * and the helm-glyph fade counters (a spectate pan or a dead-man's mash must
 * never burn a coach mark). The pure test lives in render/helmGlyphs.ts so it is
 * testable apart from this bootstrap glue.
 */
function conningLive(g: Game | null): boolean {
  const s = g?.state;
  return s !== undefined && helmInputCounts(s.spectating, s.net.you?.alive);
}

/**
 * THE chokepoint's hook table (Story 2.1) — every in-match key action routed
 * over the late-bound Game (`getG` is the gRef late-binding — null only during
 * the brief construction gap). P and M fold in here (the old ad-hoc window
 * listener is gone); TAB/ESC/digits drive the refit modal; X/Z step the alive
 * zoom; Q/E/R consult the own loadout (weapon-vs-ability via
 * EQUIPMENT_IS_WEAPON only) and R stays inert while slot 3 is empty.
 */
function keyboardHooks(getG: () => Game | null, audio: Audio): KeyboardHooks {
  const withG = (fn: (g: Game) => void) => (): void => {
    const g = getG();
    if (g) fn(g);
  };
  return {
    // Each throttle detent step clicks the telegraph — pitch distinguishes
    // ringing up (ahead) from down (astern); an end-stop tap is silent.
    onDetent: (dir, changed, labeled) => {
      if (!changed) return; // an end-stop tap is neither a click nor a learned input
      const live = conningLive(getG());
      // A step that MOVED the order on a LABELED key (W/S — not an arrow) while
      // conning a live ship is a successful W/S input: three of them retire the
      // helm key glyphs for good (Story 2.4, amendment 26).
      if (labeled) recordHelmInput('ws', live);
      if (live) audio.play(telegraphTone(dir));
    },
    // Every labeled rudder press that reaches a LIVE helm counts toward the A/D
    // pair's fade (suppressed presses never arrive here at all).
    onRudder: () => recordHelmInput('ad', conningLive(getG())),
    isAbilitySlot: (slot) => {
      const g = getG();
      return g !== null && slotHoldsAbility(g.ownSlots, slot);
    },
    isSlotFitted: (slot) => (getG()?.ownSlots[slot] ?? null) !== null,
    onAbility: (slot, actSeq) => {
      const g = getG();
      if (g) handleAbilityPress(g, slot, actSeq);
    },
    // A press against the full FIFO is DROPPED WITH FEEDBACK (Story 2.1 closes
    // the silent-drop debt): the pressed slot's denied chip flash + the denial
    // tone — the same grammar as a predicted denial. No dedup marking: the
    // press never rides an input, so no server echo can ever arrive for it.
    onAbilityCapped: (slot) => {
      const g = getG();
      if (!g) return;
      g.abilityDeniedPress[slot] = true;
      g.audio.play('denied');
    },
    // F — the foghorn (Story 4.5). The chokepoint has already edge-gated the
    // press and applied the refit-modal suspension; everything else is here.
    onFoghorn: withG(handleFoghornPress),
    // Slot keys / clicks AND the refit digits suspend under ANY open surface —
    // the refit modal as ever, plus (Story 2.3) the settings overlay and the
    // results modal, which are focused overlays.
    isModalOpen: () => modalOpen(getG()),
    // Focused-overlay rule (amendment 21 + the committed AC): while the settings
    // overlay or the results modal is up EVERY sim key is suppressed — helm
    // included, unlike the refit modal — and only ESC/Enter still route.
    isOverlayFocused: () => overlayFocused(getG()),
    onRefitToggle: withG(handleRefitToggle),
    onRefitPick: (choice) => {
      const g = getG();
      if (g) handleRefitPick(g, choice);
    },
    onEscape: withG(handleEscape),
    onConfirm: withG(handleConfirm),
    onZoom: (dir) => {
      const g = getG();
      if (g) handleZoomStep(g, dir);
    },
    onMute: withG(toggleMute),
    onNetDebug: withG(toggleMode),
  };
}

/** True while ANY surface that suspends slot keys/clicks is open. */
function modalOpen(g: Game | null): boolean {
  return g !== null && (g.upgradeMenu.visible || overlayFocused(g));
}

/** True while a FOCUSED overlay (settings / results) owns the input. */
function overlayFocused(g: Game | null): boolean {
  return g !== null && (g.settingsOverlay.visible || resultsVisible());
}

/**
 * An ability-activation keypress landed (the TB's speed boost, or — Story 1.8 —
 * the Mine Layer's decoyBuoy; the MINE left this path in Story 2.8 when it
 * became a click-aimed weapon, amendment 45): the keyboard has QUEUED the press (it rides
 * a later input, drained one-per-tick so the server's one-ability-per-tick gate
 * fires each in turn) — the server decides. Here the client only predicts the
 * verdict, at PRESS time, keyed on the pressed slot:
 *  - predicted DENIED (slot cooling / own ship dead) → latch the pressed SLOT's
 *    denied pulse (the existing deniedFire grammar, chips-only — never silence,
 *    never the weapon-arc/reticle visuals: nothing is aimed). Per-slot so a
 *    denied decoy press never flashes another slot's chip;
 *  - predicted READY → per equipment: speedBoost opens the predictor's optimistic
 *    boost window at the current server-clock estimate so the speed-up doesn't
 *    wait a round trip (the authoritative you.boostUntil overwrites it once
 *    acked; the predictor ignores a second press while pending, so a stale-ammo
 *    double press within RTT can't extend it). The decoyBuoy drop needs
 *    no press-time cue: its placement tone rides the Decoys reconcile
 *    own-spawn hook (fired on the confirmed OWN buoy, gated by DecoyView `own`
 *    so it never misfires on a truesighted enemy buoy) — the same hook the
 *    mine's placement tone still rides from the Mines reconcile.
 */
function handleAbilityPress(g: Game, slot: number, actSeq: number): void {
  const you = g.state.net.you;
  const a = ownAmmo(you, g.ownStats, g.ownSlots)[slot];
  const loaded = !!a && a.n > 0;
  if (abilityPressDenied(you?.alive ?? true, loaded)) {
    g.abilityDeniedPress[slot] = true;
    // Story 1.10 exactly-one-feedback: this predicted denial IS the feedback
    // (chip flash above + the denial tone) — mark its (slot, actSeq) key so
    // the server's matching denial echo is suppressed, never doubled.
    g.denialDedup.markPredicted(slot, actSeq);
    g.audio.play('denied');
    return;
  }
  // Predicted READY: fire the hotbar's ACTIVATED pop on this optimistic press
  // edge (the boost-prediction precedent — the slot must acknowledge the press
  // now, not a round trip later). It decays straight into the cooling grammar.
  g.abilityActivatedPress[slot] = true;
  const id = g.ownSlots[slot];
  // `actSeq` is the value THIS press will ride once the keyboard drains it onto
  // an input (it may sit behind other queued presses); the optimistic boost
  // window keys its clear-on-ack on exactly that counter, not the live count.
  if (id === 'speedBoost') g.predictor.predictBoostActivation(g.clock.serverNow(), actSeq);
  // decoyBuoy has no press-time cue: its placement tone rides the Decoys
  // reconcile own-spawn hook (the mine precedent), so it fires on the confirmed
  // OWN buoy and never on a truesighted enemy buoy.
}

/**
 * F LANDED — one foghorn press (Story 4.5, amendments 56 + 58).
 *
 * THE HONK IS NOT PREDICTED. Nothing sounds here. The honker hears their own
 * horn from the server's self-addressed `fh` event, exactly once
 * (roomBindings.handleFoghorn), so ONE code path serves every listener and no
 * dedup machinery exists to get wrong. Predicting it locally would double-play
 * the moment that event came back, which is why amendment 58 forbids it
 * outright.
 *
 * All this does is decide whether to advance the wire counter:
 *  - IGNORED while spectating or sunk — the server refuses both (world.ts
 *    consumeHonk gates on `ship.alive`), so feedback here would teach a rule
 *    the sim does not have. Deliberately NOT gated on match phase either; see
 *    hornPressVerdict for why.
 *  - DENIED inside the cooldown → COMPLETELY SILENT (Eric ruling 2026-08-05):
 *    no tone, no visual, nothing on the wire. The foghorn was the only
 *    `denied`-tone site with no visual twin of its own — weapons flash the aim
 *    arc, abilities flash their hotbar chip, and the horn has no surface to
 *    flash. Rather than invent one, Eric dropped the orphan cue: the press has
 *    no gameplay consequence, so nothing is owed to the player. No
 *    `denialDedup` mark is registered either, and that is a real difference
 *    from handleAbilityPress: the dedup exists to suppress a matching SERVER
 *    denial echo, and a honk has none — the server drops an early hornSeq
 *    silently — so a mark would sit unmatched forever.
 *  - ACCEPTED → bump the sampler's honk counter (it rides the next input, tick
 *    or tab-hide neutral alike) and arm the local cooldown.
 *
 * WHOSE CLOCK, AND WHY IT CAN ONLY COST A HONK. The gate is measured in
 * SERVER-CLOCK estimate against `CONFIG.foghorn.cooldownMs` — read straight
 * from shared CONFIG, never restated client-side (the amendment 41
 * `damageBands` rule). The client arms from SEND while the server arms from
 * EMIT, which is strictly later (one-way latency plus tick quantization), so
 * the client's window opens marginally EARLIER in absolute server time: a
 * second press right on the boundary can be dropped by the server. That is the
 * whole cost — because nothing was predicted, a dropped honk leaves no local
 * state to reconcile and no visual to retract. It simply does not sound.
 */
function handleFoghornPress(g: Game): void {
  const now = g.clock.serverNow();
  const verdict = hornPressVerdict(g.state.net.you?.alive ?? false, g.state.spectating, now, g.nextHonkAt);
  // 'ignore' and 'denied' are both a no-op from here: a denied honk (Eric
  // ruling 2026-08-05) gets NO side effect of any kind — no tone, no visual.
  // See the doc comment above for why the tone was cut rather than given a
  // visual twin.
  if (verdict !== 'honk') return;
  g.sampler.honk();
  g.nextHonkAt = now + CONFIG.foghorn.cooldownMs;
}

/**
 * The UpgradeMenu's click callback (cards AND the DAMAGE CONTROL rail): same
 * late-binding as keyboardHooks (gRef isn't assigned until after the Game object
 * literal below), routed through handleRefitPick so a CLICK IS KEY-EQUIVALENT BY
 * CONSTRUCTION — the same FINDING A latch, the same heal guard, the same denied
 * pulse — and, like a digit pick, a click LEAVES THE WINDOW OPEN (amendment 36).
 * The gun can never fire off it: MouseInput only counts canvas-target clicks,
 * and the modal lockout holds besides.
 */
function onSpendClick(getG: () => Game | null): (choice: number) => void {
  return (choice) => {
    const g = getG();
    if (!g) return;
    handleRefitPick(g, choice);
  };
}

/** Fresh per-slot denied-feedback state (Story 1.6/1.8): one latch +
 *  rate-limited pulse + flash per loadout slot, so two special slots (the ML's
 *  mine + decoyBuoy) never share a pulse/flash. Fed by predicted ability-press
 *  denials and — Story 1.10 — by unmatched server denials on any slot (the
 *  `ability` naming predates the weapon-slot extension). */
function abilityFeedbackState(): Pick<
  Game,
  | 'abilityDeniedPress' | 'abilityPulse' | 'abilityFlash' | 'abilityActivatedPress' | 'activatedPulse'
  | 'activatedFlash' | 'fitPress' | 'fitPulse' | 'fitFlash' | 'fitFramePress' | 'fitFramePulse' | 'fitFrameFlash'
> {
  return {
    abilityDeniedPress: Array.from({ length: SLOT_COUNT }, () => false),
    abilityPulse: Array.from({ length: SLOT_COUNT }, () => new DeniedPulse()),
    abilityFlash: Array.from({ length: SLOT_COUNT }, () => false),
    // Story 2.2: the mirror-image ACTIVATED channel (per-slot latch + pulse +
    // this-frame flag), driven off the optimistic ability-press edge.
    abilityActivatedPress: Array.from({ length: SLOT_COUNT }, () => false),
    activatedPulse: Array.from({ length: SLOT_COUNT }, () => new DeniedPulse()),
    activatedFlash: Array.from({ length: SLOT_COUNT }, () => false),
    // Story 2.9: the same three-part shape again for the FIT channel, driven off
    // the server's `bn` receipt (never predicted — a fit is the server's word).
    fitPress: Array.from({ length: SLOT_COUNT }, () => false),
    fitPulse: Array.from({ length: SLOT_COUNT }, () => new DeniedPulse()),
    fitFlash: Array.from({ length: SLOT_COUNT }, () => false),
    fitFramePress: false,
    fitFramePulse: new DeniedPulse(),
    fitFrameFlash: false,
  };
}

/**
 * An OWN decoy buoy just appeared in the reconcile (render/decoys' own-spawn
 * hook): play its placement cue and latch the window the hotbar's ACTIVE state
 * reads. The hook only ever fires for buoys we own, so a truesighted enemy buoy
 * can never light our slot.
 */
function onOwnDecoy(g: Game | null, audio: Audio, d: DecoyView): void {
  audio.play('placeDecoy');
  if (g) g.ownDecoyUntil = Math.max(g.ownDecoyUntil, d.until);
}

/**
 * A boon landed: latch its FIT flash (Story 2.9). The category resolves to the
 * slot carrying that equipment; a shipwide INTEL/SHIP line (or any category no
 * fitted slot owns) falls through to the rank-wide frame pulse, so no fit is
 * ever presentation-silent (FR22).
 */
function latchFitFlash(g: Game, category: string): void {
  const slot = slotForBoonCategory(g.ownSlots, category);
  if (slot === null) g.fitFramePress = true;
  else g.fitPress[slot] = true;
}

/**
 * ms — the REMAINING ability window per loadout slot (0 = none running), the
 * ACTIVE state's only input (amendment 48). The boost reads the same
 * (prediction-aware) `boostUntil` estimate the HUD's boost tag does; the decoy
 * reads the latched own-buoy expiry. Everything else has no window.
 */
function activeWindows(g: Game, status: OwnStatus): number[] {
  const now = g.clock.serverNow();
  const until = { speedBoost: boostUntilNow(g), decoyBuoy: g.ownDecoyUntil };
  return status.loadout.map((id) => (id === 'speedBoost' || id === 'decoyBuoy' ? Math.max(0, until[id] - now) : 0));
}

function buildGame(
  stage: Stage,
  conn: Connection,
  map: GameMap,
  audio: Audio,
  cls: ShipClassId,
  portal: PortalAdapter,
  settingsOverlay: SettingsOverlay,
): Game {
  const { welcome } = conn;
  // The room's radar grammar/identity, announced ONCE in the welcome (cycle 51,
  // amendment 63 — the flags live on the SERVER). Read here at the one-way data
  // flow's head: server mirror → sim state → render views.
  const radar = radarModes(welcome);
  // Late-bound: the input callbacks need game state that is assembled just below.
  let gRef: Game | null = null;
  // setupViewport args: the chokepoint hooks, the lazy server-clock thunk for the mouse's
  // pointerdown fire-time stamp (D1, resolved at click time), and the refit-modal lockout.
  // The mouse's fire lockout covers EVERY suspending surface (Story 2.3): the
  // refit modal as ever, plus the settings overlay and the results modal.
  const { camera, keyboard, mouse, ownView, effects } = setupViewport(stage, cls, keyboardHooks(() => gRef, audio), () => (gRef?.clock ? gRef.clock.serverNow() : 0), () => modalOpen(gRef), (p) => handleHotbarPress(gRef, p));
  const stats = effectiveStats(CONFIG.shipClasses[cls]);
  const nameplates = new NameplateLayer(stage.plateRoot); // screen-space plates: own hull + contacts

  const g: Game = {
    stage,
    state: createGameState(welcome.sessionId, radar),
    clock: new ServerClock(),
    ownBuffer: new SnapshotBuffer(),
    contacts: new ContactStore(),
    predictor: makePredictor(map, cls),
    camera,
    keyboard,
    mouse,
    sampler: new InputSampler((type, msg) => conn.room.send(type, msg)),
    ownView,
    contactViews: new ContactViews(stage.layers.ship, nameplates),
    nameplates,
    projectiles: new Projectiles(map.radius, stage.layers.projectile, (x, y) => effects.spawnEffect('torpwake', x, y)),
    firing: new FiringUX(stage.layers.ship, stage.layers.aim),
    // Same fog-immune chart layer as the reticle: a burst point can sit far
    // beyond the sight bubble, and the preview must not be eaten by fog.
    aimPreview: new AimPreview(stage.layers.aim),
    effects,
    // The creep wake rides the SAME torpedo-wake dot a fish lays (a mine under
    // power is making a wake, and it is the one existing marker that already
    // survives every motion level).
    mines: new Mines(
      stage.layers.mineChart,
      stage.layers.mineWorld,
      () => audio.play('fireMine'),
      (x, y) => effects.spawnEffect('torpwake', x, y),
    ),
    decoys: new Decoys(stage.layers.decoyChart, stage.layers.decoyWorld, (d) => onOwnDecoy(gRef, audio, d)),
    litZones: new LitZones(stage.layers.litZone),
    smoke: new Smoke(stage.layers.smoke),
    foghorn: new Foghorn(stage.layers.foghorn),
    nextHonkAt: 0,
    fog: new Fog(stage.fogSprite),
    // Story 4.2: under the `silhouette` grammar a blip flies its owner's
    // personal hue, so the radar needs the SAME roster resolution the kill feed
    // uses — bright hue for a human, drone grey for the sentinel (255), null on
    // a roster miss so the paint boots amber and repaints when the hue lands
    // (render/hueLatch.ts). Under `return` the hue resolver is never called: an
    // echo carries no identity to color (amendments 65/67).
    radar: new Radar(stage.layers.blip, stage.layers.sweep, (id) => (gRef ? feedColor(gRef, id) : null), radar.grammar),
    zone: new Zone(stage.layers.zone, stage.layers.vignette),
    hud: new Hud(stage.layers.hud),
    hotbar: new Hotbar(stage.layers.hud),
    xpRail: new XpRail(stage.layers.hud),
    upgradeMenu: new UpgradeMenu(onSpendClick(() => gRef)),
    settingsOverlay,
    score: freshScore(),
    scorePhase: 'waiting',
    hueRev: hueRevision(),
    uiScale: 1,
    spendInFlight: null,
    fogZoomTimer: null,
    // The charted map layer is built HERE (not in joinAndPlay) so it can be
    // seeded with the real camera zoom: its strokes are screen-locked, and a
    // first frame drawn at a guessed zoom would flash the wrong line weight.
    room: conn.room, mapRadius: map.radius, islands: map.islands, mapChart: buildMap(map, stage.layers, camera.zoom),
    cameraSnapped: false, lastOwn: { x: 0, y: 0 },
    spectate: { freePan: false, visualsSet: false },
    returning: false, reconnecting: false, returnToPort: makeGameReturnToPort(() => gRef),
    shake: new ShakeDriver(),
    deniedPulse: new DeniedPulse(), deniedFlash: false, denialDedup: new DenialDedup(), serverDeniedClick: false,
    ...abilityFeedbackState(),
    audio, portal,
    matchEnded: false, resultsFinal: false, resultsShownAt: Infinity, audioCueState: INITIAL_CUE_STATE, wasInStorm: false,
    prevClickCount: 0, lastTickClick: 0, ownFire: new OwnFireLatch(),
    ownClass: cls, ownHueIndex: null, ownPlated: false, // amber/unresolved until the roster syncs (1.12/1.13)
    ownDecoyUntil: 0,
    ownStats: stats, ownSlots: slotIdsFor(cls, stats, NO_BOONS),
  };
  gRef = g;
  // Coast returns (amendment 69) read the island field the client already
  // rebuilt from the map seed — pure presentation, never on the wire.
  g.radar.setIslands(map.islands);
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
 * changed: a shipCooldown grant must not hard-snap the predictor or rebake the
 * fog — those on every kill read as a hitch exactly when the player is
 * maneuvering. The predictor only SNAPS on a real class change (first-frame
 * localStorage correction); an upgrade that touches kinematics swaps the
 * config in place and lets the next reconcile replay pending inputs under it.
 */
function applyOwnStats(g: Game, cls: ShipClassId, boons: readonly string[]): void {
  const classChanged = cls !== g.ownClass;
  const prev = g.ownStats;
  g.ownClass = cls;
  const spec = CONFIG.shipClasses[cls];
  // Resolve the authoritative boon ids FAIL-CLOSED (Story 2.5): unknown ids
  // are silently dropped, never a throw — a junk id on the wire must not take
  // the client down. Story 2.8: boons are the ONLY stat modifier (the legacy
  // counts param died with the 14 upgrades) — the same call the server caches.
  const defs = resolveBoons(boons);
  const stats = effectiveStats(spec, defs);
  g.ownStats = stats;
  // Own loadout follows the authoritative class + boons (Story 1.6 / 2.5):
  // the slot activate-vs-prime split, HUD chips, and ammo fallback all read
  // from here — derived via the SAME shared slot-effect replay the server
  // applies incrementally (slotsWithBoons), so slot ids agree by construction.
  g.ownSlots = slotIdsFor(cls, stats, defs);
  // Boost numbers ride the same stats swap (CONFIG pass-through today).
  g.predictor.setBoostStats(stats.boost.speedBonus, stats.boost.durationMs);
  // Behavior-boon hooks ride it too (Story 2.5): the predictor folds these
  // per tick in the SAME boost-then-hooks order the server steps with.
  g.predictor.setBoons(boonBehaviors(defs));
  // Story 2.9 — the OWN doctrine modes fan out to the on-water renderer, which
  // is how our own ordnance gets its identity from LAUNCH (an enemy's has to
  // earn it from observable behavior). Deliberately ABOVE the vision-change
  // early-return below: a doctrine swap moves no vision stat, so gating it on
  // one would leave the water lying about the build we just fitted.
  g.projectiles.setOwnModes({ cannon: stats.cannon.mode, torpedo: stats.torpedo.mode });

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

/**
 * The own-mine ring parameters for the frame timestamped `t`: EFFECTIVE
 * blast/trigger radii (the very numbers the server reads off our stats when one
 * of our mines trips or blasts), stamped with the FRAME's own time so the
 * arming window is measured on the clock that owns it — an estimated local
 * serverNow() charges the mine for the transport delay and holds the dim late.
 * The acquisition ring is present only under the SELF-PROPELLED doctrine, and
 * its radius is raw CONFIG on purpose — no boon scales acquisition today.
 */
function ownMineRingParams(g: Game, t: number): OwnMineRings {
  const mine = g.ownStats.mine;
  return {
    blast: mine.blastRadius,
    trigger: mine.triggerRadius,
    acquire: mine.mode === 'selfPropelled' ? CONFIG.mine.creepAcquireRange : null,
    now: t,
  };
}

/** Wire the room's messages into the game (frames, results, disconnects). */
function bindGameRoom(g: Game, conn: Connection): void {
  bindRoom(conn, {
    ...g,
    onOwnSpawn: (x, y) => g.camera.snapTo({ x, y }),
    // Story 4.5: the SPECTATOR foghorn path's vantage point. A spectator's honk
    // arrives as a position (the free camera has no server-known one to take a
    // bearing from), so the bearing is derived from wherever the camera is at
    // the instant it lands — read live, never captured.
    cameraCenter: () => g.camera.center,
    onOwnStats: (cls, boons) => applyOwnStats(g, cls, boons),
    // Story 1.10: self-private server denials route through the
    // exactly-one-feedback dedup (predicted-first suppresses the echo).
    onDenied: (d) => handleServerDenial(g, d),
    // resetThrottle fires on own spawn AND own sunk — the hard state boundaries.
    // Drop any queued-but-unconsumed ability press there too (FINDING A), so a
    // press queued in one life (or mashed while dead/spectating) never fires
    // into the next. Consumed counters stay monotonic (clearActivations leaves
    // them), mirroring the server's un-reset lastActSeq.
    resetThrottle: () => {
      g.keyboard.resetThrottle();
      g.keyboard.clearActivations();
      // Story 2.9: the decoy slot's ACTIVE window dies at the same hard boundary
      // (own sunk / spawn / the match-activation teleport). The latch is fed by
      // the reconcile's own-spawn hook, which only ever fires for a NEW buoy —
      // so a window left standing across death would keep a slot reading ACTIVE
      // for a buoy the next life does not own. Missing juice beats a lying slot.
      g.ownDecoyUntil = 0;
      // Story 2.9: the own-fire latch dies at that same boundary. A claim is a
      // promise about the next reveal on our own bow, and death/respawn breaks
      // it — the shot it describes either splashed unseen or belongs to a hull
      // that no longer exists, so letting it stand would dress the FIRST reveal
      // of the next life (quite possibly somebody else's shell, landing where we
      // just spawned) as our cannon shot. An unclaimed reveal reads generic,
      // which is the honest fallback.
      g.ownFire.clear();
      // Reset the denial dedup at the SAME boundary (Story 1.10): dropping
      // queued presses without advancing actCount would otherwise let the next
      // press reuse a still-marked (slot, seq), suppressing a genuine later
      // server denial as an echo.
      g.denialDedup.clear();
    },
    resetPrime: () => g.keyboard.revertToGun(),
    // Review fix: the server clears nextHonkAt on respawn/redeploy (world.ts);
    // mirror it here so a captain who honks, dies, and respawns inside the old
    // cooldown window can honk again immediately rather than having the client
    // silently eat an otherwise-accepted press (a denied honk is now silent by
    // design — see handleFoghornPress — so a stale gate would give no feedback
    // at all).
    resetHonkCooldown: () => {
      g.nextHonkAt = 0;
    },
    // The FEED's name lookup is the nullable resolver, NOT rosterName: a
    // departed vessel must render the feed's neutral UNKNOWN_VESSEL label
    // (roomBindings.handleSunk), never the raw-session-id fallback — the same
    // rule the score card already applies (handleSunkObserved below).
    names: (id) => rosterNameOrNull(g, id),
    // Story 1.12 personal-hue resolvers (roster-driven): kill-feed name color +
    // ordnance-marker firer tint.
    colors: (id) => feedColor(g, id),
    ordnanceHue: (by) => ordnanceHue(g, by),
    // Every observed sinking feeds the personal-score accumulator; our own
    // sinking in a live match opens the elimination modal (amendments 22/23).
    onSunkObserved: (victimId, killerId) => handleSunkObserved(g, victimId, killerId),
    // The `bn` fitted event is the spend latch's ack (Story 2.7 review): mark
    // the latch in flight so it releases as a SUCCESS even when a same-frame
    // passive bank + an identical re-roll hide every other landing signal.
    onSpendAck: () => markSpendAcked(g),
    // Story 2.9: the fitted boon's CATEGORY decides which slot flashes (amendment
    // 51 — the visible change is slot-side). A shipwide INTEL/SHIP line owns no
    // slot, so the whole stack takes one rank-wide pulse instead.
    onBoonFitted: (category) => latchFitFlash(g, category),
    // Story 2.9: the click-time own-fire latch (see ownFireWeapon) — the only
    // honest way to tell an own CANNON shell from an own GUN shell, since the
    // ballistic wire shape says neither.
    ownFireWeapon: () => ownFireWeapon(g),
    // The own-burst ring's EFFECTIVE radius (undefined = keep the CONFIG base,
    // which is what every burst we cannot honestly claim as ours renders at).
    ownBurstRadius: (own) => ownBurstRadius(g.ownStats, own),
    // The owner-private mine rings: our live effective radii + our clock. The
    // acquisition ring exists only while we actually hold the doctrine.
    ownMineRings: (t) => ownMineRingParams(g, t),
    onSpectate: () => enterSpectateVisuals(g),
    onResults: (msg) => {
      // Latched: a story-0.2 resume re-delivers the cached results broadcast,
      // and matchEnd() must fire at most once per match.
      if (!g.matchEnded) {
        g.matchEnded = true;
        g.portal.matchEnd();
      }
      // Latch BEFORE presenting: from here the game-end table is the final
      // debrief, and a `sunk` event still in flight behind this broadcast must
      // not replace it (see handleSunkObserved).
      g.resultsFinal = true;
      // Results arrival hygiene lives in presentResults(): any open refit modal
      // or settings overlay is dropped (no stacking) and the results-key arming
      // grace restarts (see CLIENT_CONFIG.results.keyGraceMs).
      showMatchResults(g, msg);
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
      // The outage may have swallowed sunk events, so the observed-kill roll can
      // no longer be trusted: start it clean rather than report a wrong list.
      // The elimination LATCH and its placement survive, though — they were
      // derived before the drop, and dropping them un-eliminated a finished
      // player (letting a duplicate `sunk` re-open the modal).
      g.score = scoreAfterReconnect(g.score);
      g.keyboard.clearActivations(); // drop presses queued during the outage (FINDING A)
      g.denialDedup.clear(); // paired with the queue drop — no reused (slot, seq)
    },
  });
}

// --- alive rendering -----------------------------------------------------------

/**
 * Draws the own-ship frame and RETURNS this frame's Tier-1 (threat) read.
 *
 * The read has to happen HERE, not in the caller: `renderFiring` is what drives
 * the denied-fire pulse, so a tier1 sampled before it would miss a pulse born
 * this frame (a one-frame lie in both Tier-2 consumers). Everything downstream
 * of that call — the bar's payload, the storm vignette via renderAlive — shares
 * this one value.
 */
function renderOwn(
  g: Game,
  pose: RenderPose,
  status: OwnStatus,
  inStorm: boolean,
  bar: ChromeBarView,
  match: MatchUx,
  frameDt: number,
  now: number,
  nowMs: number,
): boolean {
  if (!g.cameraSnapped) {
    g.camera.snapTo(pose);
    g.cameraSnapped = true;
  }
  g.ownView.gfx.visible = true;
  g.ownView.setDowned(!status.alive);
  g.ownView.update(pose.x, pose.y, pose.heading);
  g.camera.update(frameDt, pose);
  updateOwnPlate(g, pose); // own callsign plate above the hull (post camera update)
  g.effects.update(frameDt, pose);
  g.lastOwn = { x: pose.x, y: pose.y };
  const cursor = g.camera.screenToWorld(g.mouse.screenPos);
  const aim = worldAim(pose.x, pose.y, cursor);
  renderFiring(g, pose, status, aim, cursor, nowMs);
  // ONE Tier-1 read per frame, taken AFTER renderFiring drove the denied pulse
  // and shared by both Tier-2 consumers (the chrome bar's amber ring segment
  // here, the storm vignette back in renderAlive): two reads — or one taken
  // before the pulse was driven — could disagree inside a single frame.
  const tier1 = ownTier1(g, status, nowMs);
  bar.tier1 = tier1;
  // `now / 1000` — the server-clock estimate in SECONDS, the same clock the
  // storm vignette's pulse rides (the HP rail breathes on it).
  g.hud.update(pose, g.keyboard.axes(), status, inStorm, bar, match, hudWidth(g), hudHeight(g), now / 1000);
  updateHotbar(g, status, nowMs);
  updateXpRail(g, status.alive, now / 1000);
  return tier1;
}

/**
 * The economy satellites (Story 2.6): fed VERBATIM from the server's own-ship
 * fields — `lvl`/`xp`/`pts` are self-private and server-authoritative, and
 * nothing here predicts or interpolates them. Shown on exactly the hotbar's
 * terms: alive, in-match, with a live `you` (death / spectate / the forceSnap
 * pose gap hide it, so the satellites never describe a hull that is gone).
 */
function updateXpRail(g: Game, alive: boolean, nowSec: number): void {
  const you = g.state.net.you;
  if (!alive || !you || g.state.spectating) {
    g.xpRail.hide();
    return;
  }
  const view: XpView = { lvl: you.lvl, xp: you.xp, pts: you.pts };
  g.xpRail.update(view, hudHeight(g), nowSec);
}

/**
 * Per-slot denied state for the hotbar: the per-slot latch (predicted ability
 * denials + unmatched SERVER denials on any slot — Story 1.10) OR, for the
 * SELECTED weapon, this frame's denied-fire click pulse. Same wiring the
 * retired chip row used, re-pointed at the hotbar's denied grammar.
 */
function hotbarDenied(g: Game, status: OwnStatus): boolean[] {
  return g.abilityFlash.map((flash, slot) => {
    const id = status.loadout[slot] ?? null;
    const isWeapon = id !== null && EQUIPMENT_IS_WEAPON[id];
    return flash || (isWeapon && slot === status.primedSlot && g.deniedFlash);
  });
}

/**
 * The hotbar renders ONLY while alive in-match (the weapons-safe waiting room
 * included) — it dies with the hull (death / spectate / reveal) and on return
 * to port. Called after renderFiring so this frame's denied pulse is resolved.
 */
function updateHotbar(g: Game, status: OwnStatus, nowMs: number): void {
  if (!status.alive) {
    g.hotbar.hide();
    return;
  }
  const view: HotbarView = {
    loadout: status.loadout,
    ammo: status.ammo,
    stats: status.stats,
    primedSlot: status.primedSlot,
    denied: hotbarDenied(g, status),
    activated: g.activatedFlash,
    dim: modalOpen(g), // any suspending surface: dim to 38%, keys AND clicks off
    motion: settings.current.motion, // gates the ACTIVATED/FIT pops + amplitudes
    // Story 2.9 — the build, felt on the slot: the accrued list + `◆n` marks
    // (server-authoritative `you.boons`, rendered verbatim), the ACTIVE ability
    // windows (amendment 48), and this frame's fit flashes. `nowSec` is the
    // shared server-clock estimate the ACTIVE outline breathes on.
    boons: g.state.net.you?.boons ?? [],
    activeMsLeft: activeWindows(g, status),
    fit: g.fitFlash,
    fitFrame: g.fitFrameFlash,
    nowSec: g.clock.serverNow() / 1000,
  };
  // Hover reads the pointer ONLY while it is inside the window (the aim path
  // keeps using the last known position regardless — see MouseInput).
  // Hover + hit-test run in the HUD's own (scaled) coordinate space, so the raw
  // screen cursor is divided by the same factor the root container multiplies by.
  const cursor = g.mouse.pointerInside ? hudPoint(g, g.mouse.screenPos) : null;
  g.hotbar.update(view, hudWidth(g), hudHeight(g), cursor, nowMs); // the frame's ONE timestamp
}

/**
 * A pointerdown landed somewhere on the canvas (input/mouse.ts's injected
 * hotbar gate, amendment 11). If it fell on a hotbar ROW, hand it to the SAME
 * keyboard slot-action entry the slot keys use — ONE decision path: that method
 * already owns the modal suspension, the fail-closed fitted check, the ability
 * FIFO (cap feedback included), and the weapon prime toggle, so a click cannot
 * drift from its key. The press is reported SWALLOWED either way — over the
 * hotbar is never a shot, even when the action turns out inert (unfitted slot,
 * modal open). A press anywhere else returns false and fires as ever.
 */
function handleHotbarPress(g: Game | null, p: ScreenPoint): boolean {
  if (!g) return false;
  const slot = g.hotbar.slotAt(hudPoint(g, p));
  if (slot === null) return false;
  g.keyboard.slotAction(slot);
  return true;
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
function renderFiring(g: Game, pose: RenderPose, status: OwnStatus, aim: number, cursor: { x: number; y: number }, nowMs: number): void {
  const clicked = g.mouse.clickCount !== g.prevClickCount;
  g.prevClickCount = g.mouse.clickCount;
  // Ability denied pulse (Story 1.6): consume each slot's one-shot press latch
  // into its rate-limited pulse (per-slot since Story 1.8 — the ML fits two
  // ability slots). Chips-only feedback — deliberately OUTSIDE the alive gate
  // below (a dead press is denied too and must still pulse) and never fed into
  // the weapon-arc/reticle denied visuals (nothing is aimed).
  for (let s = 0; s < g.abilityPulse.length; s++) {
    g.abilityFlash[s] = g.abilityPulse[s].update(g.abilityDeniedPress[s], nowMs);
    g.abilityDeniedPress[s] = false;
    // The ACTIVATED pop rides the identical register (Story 2.2).
    g.activatedFlash[s] = g.activatedPulse[s].update(g.abilityActivatedPress[s], nowMs);
    g.abilityActivatedPress[s] = false;
    // ...and so does the FIT flash (Story 2.9): the boon landing on this slot's
    // family. Driven OUTSIDE the alive gate below like the denial channel — a
    // spend is legal while dead, and the hotbar is simply hidden there.
    g.fitFlash[s] = g.fitPulse[s].update(g.fitPress[s], nowMs);
    g.fitPress[s] = false;
  }
  g.fitFrameFlash = g.fitFramePulse.update(g.fitFramePress, nowMs);
  g.fitFramePress = false;
  if (!status.alive) {
    g.firing.hide();
    g.aimPreview.hide();
    g.deniedFlash = false;
    g.serverDeniedClick = false; // a denial landing on the death frame has no arc to pulse
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
  // Gate on the PREDICTED heading, the same source clickPrediction/consumePrimeOnFire
  // read — NOT the alpha-interpolated pose.heading. At a sector boundary while
  // turning the two disagree, so a render pulse could fire without the sim-tick
  // dedup marking (→ later server denial double-pulses), or vice versa.
  // Both halves of the aim gate: the bearing arc AND (for the mine alone) the
  // placement reach — the server denies either the same way, so the predicted
  // denial must too or an out-of-range mine click flashes nothing.
  const aimDist = Math.hypot(cursor.x - pose.x, cursor.y - pose.y);
  const inArc = weaponArcHit(predictedHeading(g), aim, primedId) && weaponRangeHit(aimDist, primedId);
  // Predicted denial (a fresh click that can't fire) OR an unmatched SERVER
  // weapon denial (Story 1.10 one-shot latch, consumed here) drives the same
  // rate-limited red pulse — the late server case replaces total silence.
  const denied = isClickDenied({ clicked, ready: hasAmmo, inArc }) || g.serverDeniedClick;
  g.serverDeniedClick = false;
  // The FRAME's timestamp, not a fresh sample: the attention seam (ownTier1)
  // reads this same pulse's liveness later in the same frame, and two
  // performance.now() calls can straddle the envelope's tail — a hold that
  // disagrees with the flash the player actually saw.
  g.deniedFlash = g.deniedPulse.update(denied, nowMs);
  g.firing.update(
    pose,
    aim,
    primedId,
    { hasAmmo, reloadFrac },
    cursor,
    g.deniedFlash,
    weaponRangeU(status.stats, primedId), // gun family: radar-derived clamp ring; mine: its placement reach
  );
  renderAimPreview(g, pose, aim, aimDist, status, primedId, inArc);
}

/**
 * The ordnance aim preview for this frame: the shot's OWN geometry (shared
 * sim/aim.ts, the same helpers the server fires with) one frame early. Drawn
 * off the PREDICTED pose — the same pose the fire gate reads — so the circle
 * sits where the shell will actually burst, not where the last server echo put
 * our hull. An out-of-arc / out-of-reach aim previews nothing: the denied
 * treatment is already the honest answer there.
 */
function renderAimPreview(
  g: Game,
  pose: RenderPose,
  aim: number,
  aimDist: number,
  status: OwnStatus,
  primedId: EquipmentId | null,
  legal: boolean,
): void {
  const model = computeAimPreview({
    id: primedId,
    ship: { x: pose.x, y: pose.y, heading: predictedHeading(g), cls: g.ownClass },
    aim,
    aimDist,
    stats: status.stats,
    mapRadius: g.mapRadius,
    islands: g.islands,
    legal,
  });
  g.aimPreview.update(model, previewTint(primedId));
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
/** Predicted fireability of a click on `primedSlot` this tick — the same
 *  (deliberately stale-frame) reads the denied-pulse predicate uses. */
function clickPrediction(
  g: Game,
  primedSlot: number,
  aim: number,
  aimDist: number,
): { alive: boolean; loaded: boolean; inArc: boolean } {
  const you = g.state.net.you;
  const a = you?.ammo[primedSlot] ?? null;
  const id = g.ownSlots[primedSlot] ?? null;
  return {
    alive: you?.alive ?? false,
    loaded: !!a && a.n > 0,
    // The mine's placement reach is part of its aim gate (Story 2.8): an
    // out-of-range click is refused server-side with nothing consumed, so it
    // must KEEP the prime here rather than revert to the gun.
    inArc: weaponArcHit(predictedHeading(g), aim, id) && weaponRangeHit(aimDist, id),
  };
}

/**
 * Latch which weapon this click fired, for the own-fire correlation
 * (roomBindings.ownFireWeapon → OwnFireLatch.claim). Only a click the client
 * PREDICTS will fire counts: a denied press (reloading, out of arc) produces no
 * shell, so latching it would leave a stale claim for the next reveal to pick
 * up. Ability slots never reach here — the wire click is a weapon click.
 */
function latchOwnFire(g: Game, primedSlot: number, p: { alive: boolean; loaded: boolean; inArc: boolean }): void {
  const id = g.ownSlots[primedSlot] ?? null;
  if (!p.alive || !p.loaded || !p.inArc || id === null) return;
  g.ownFire.latch(id, g.clock.serverNow());
}

/**
 * CLAIM the latch for an own-looking reveal: the weapon behind our most recent
 * shot, or null once it has gone stale, was already claimed, or was never set.
 * Consuming (one click is one round — see sim/ownFire.ts), so this is called
 * exactly once per reveal, and only for a reveal already on our own hull.
 */
function ownFireWeapon(g: Game): OwnFire {
  return g.ownFire.claim(g.clock.serverNow());
}

function consumePrimeOnFire(g: Game, primedSlot: number, aim: number, aimDist: number, fireSeq: number): void {
  const newClick = g.mouse.clickCount !== g.lastTickClick;
  g.lastTickClick = g.mouse.clickCount;
  if (!newClick) return;
  const p = clickPrediction(g, primedSlot, aim, aimDist);
  latchOwnFire(g, primedSlot, p);
  if (shouldConsumePrime(p.alive, primedSlot, p.loaded, p.inArc)) g.keyboard.revertToGun();
  // Story 1.10 exactly-one-feedback (weapon clicks): a click predicted DENIED
  // (reloading / out of the bow arc) fires its feedback NOW — the denial tone
  // here plus renderFiring's existing red pulse — and marks its
  // (slot, fireSeq) key, so the server's matching denial echo is suppressed.
  // `fireSeq` is THIS click's wire counter (the input just sampled), so the
  // key aligns exactly with the DeniedView the server would send. A click
  // predicted FIREABLE marks nothing — if the server still refuses (stale-ammo
  // race), that unmatched denial triggers the feedback late-but-explicit.
  if (p.alive && !(p.loaded && p.inArc)) {
    g.denialDedup.markPredicted(primedSlot, fireSeq);
    g.audio.play('denied');
  }
}

/**
 * A SELF-PRIVATE server denial arrived (Story 1.10 — FrameMsg.denied via
 * roomBindings). Route it through the exactly-one-feedback dedup: a predicted
 * denial already fed back suppresses this echo; an UNMATCHED denial — the
 * previously-silent cases (within-RTT double press, reload-boundary race,
 * blocked stern drop) — fires the full feedback late-but-explicit: the denial
 * tone, the denied slot's chip flash (per-slot, weapon or ability), and — for
 * a weapon slot — the arc/reticle red pulse a predicted denied click drives.
 */
function handleServerDenial(g: Game, d: DeniedView): void {
  if (g.state.spectating) return; // no live conning UI to feed back into
  // A denial for a pre-death press is moot once sunk: renderFiring discards
  // serverDeniedClick on a dead frame, so play the whole path only while alive
  // (otherwise the tone + chip latch fire with no matching arc pulse).
  if (g.state.net.you?.alive === false) return;
  if (!g.denialDedup.serverDenied(d.slot, d.seq)) return; // predicted echo — already fed back
  g.audio.play('denied');
  g.abilityDeniedPress[d.slot] = true; // per-slot chip flash (any slot as of 1.10)
  const id = g.ownSlots[d.slot] ?? null;
  // Only pulse the arc/reticle when the DENIED slot is the one currently primed
  // — renderFiring pulses whatever slot is primed at render time, so a torpedo
  // denial arriving ~RTT late (prime already consumed, reverted to gun) would
  // otherwise flash the GUN's reticle. The per-slot chip flash + tone above are
  // already slot-correct; the arc pulse is the only slot-sensitive piece.
  if (id !== null && EQUIPMENT_IS_WEAPON[id] && d.slot === g.keyboard.primedSlot) g.serverDeniedClick = true;
}

/**
 * Pure-ish: is the own hull inside an enemy DAZZLE BURST right now (Story 2.8)?
 * Read VERBATIM off the victim-private `you.dazzledUntil` against the server-
 * clock estimate — never predicted, never interpolated (the server refreshes
 * the mark every tick the hull sits in a dazzle zone, plus a grace). No own
 * ship (death / spectate / the pre-first-frame gap) is never dazzled.
 */
function dazzleActive(g: Game, now: number): boolean {
  return now < (g.state.net.you?.dazzledUntil ?? 0);
}

/**
 * Keep the fog's sight hole HONEST while dazzled: the server has already
 * shrunk this ship's perceived sight by CONFIG.starShells.dazzleSightFactor, so
 * the hole must shrink with it — otherwise the fog draws clear water the server
 * reveals nothing in. The rebake only runs on the two frames per dazzle event
 * where the state actually flips (Fog.setDazzled reports staleness), the same
 * path a resize / sight-stat change takes.
 *
 * THE RADAR TAKES THE SAME FLAG, from this one place (amendment 89). It uses
 * `fogHoleRadiusU()` — the identical radius, by the identical function — as the
 * SEAM between its two sources of ship paints: inside it the client synthesizes
 * an echo from the hull's `Contact`, outside it the echo arrives as a wire blip
 * the server sent. That radius is also, by construction, the dazzle-scaled
 * truesight the SERVER decides the same question with, so a dazzle state the
 * radar did not hear about would have the client still synthesizing an annulus
 * the server had already started blipping — one hull, two echoes. It is set
 * UNCONDITIONALLY and before the fog's changed-flag early-return, because that
 * flag guards the expensive rebake and nothing else; the radar re-reads the
 * radius when a paint is created and has nothing to rebake, so its own
 * changed-flag is deliberately unused here.
 */
function updateDazzle(g: Game, now: number): void {
  const dazzled = dazzleActive(g, now);
  g.radar.setDazzled(dazzled);
  if (!g.fog.setDazzled(dazzled)) return;
  g.fog.rebake(g.stage.app.screen.width, g.stage.app.screen.height, g.camera.zoom);
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

/**
 * The zone plane's per-frame inputs (Story 3.2). Beyond the derived ring view it
 * carries the CAMERA ZOOM + CENTER (the strokes are screen-locked and the storm
 * fill must cover the screen from the ring's center, so both are part of the
 * drawn geometry), the MAP EXTENT (the fill's floor), and the TIER-1 attention
 * state (the vignette holds at its lit keyframe while a threat channel owns the
 * eye). `nowMs` is deliberately the monotonic clock, not the server estimate: it
 * drives the reveal one-shot's 80ms envelope and the vignette's hold easing,
 * which a clock resync must never stretch or rewind. It is also THE ONE frame
 * timestamp (sampled once in makeCallbacks' render callback) — re-sampling
 * performance.now() here would let the vignette's hold disagree by a frame with
 * the denied pulse that caused it.
 */
function updateZone(
  g: Game,
  zv: ZoneView,
  inStorm: boolean,
  tier1: boolean,
  now: number,
  nowMs: number,
): void {
  g.zone.update({
    cur: zv.cur,
    next: zv.next,
    state: zv.state,
    inStorm,
    tier1,
    nowSec: now / 1000,
    nowMs,
    zoom: g.camera.zoom,
    // The camera's world center: the storm fill is drawn about the RING's
    // center, so the disc's outer radius has to reach whatever the camera has
    // wandered to (spectate free-pan is unclamped).
    camX: g.camera.center.x,
    camY: g.camera.center.y,
    mapRadius: g.mapRadius,
    screenW: g.stage.app.screen.width,
    screenH: g.stage.app.screen.height,
  });
}

/** Tier-1 (THREAT) channels as this story knows them (amendment 16): the HP
 *  rail's low-HP pulse and a live denied-fire pulse. render/attention.ts owns
 *  the composition; this only resolves the own-ship inputs. `nowMs` is the
 *  frame's ONE timestamp — the same instant renderFiring drove the denied pulse
 *  with, so the hold can never read a pulse the visible flash has already ended
 *  (or miss one it just started). */
function ownTier1(g: Game, status: OwnStatus, nowMs: number): boolean {
  const maxHp = status.stats.maxHp;
  return tier1Active({
    hpFrac: maxHp > 0 ? status.hp / maxHp : null,
    deniedLive: g.deniedPulse.liveAt(nowMs),
  });
}

function renderAlive(
  g: Game,
  alpha: number,
  frameDt: number,
  now: number,
  nowMs: number,
  zv: ZoneView,
  mu: MatchUx,
): void {
  const pose = ownPose(g, alpha, frameDt);
  const status = ownStatus(g);
  // Own ACTIVE star-shell zones (net → state → render): keep beyond-sight shells
  // revealed by our flare (projectiles) and clear our own fog over them (fog).
  const ownZones = ownActiveZones(g.state.net.litZones, g.state.net.sessionId, now);
  const inStorm = !!pose && zv.state !== 'idle' && isOutside(pose, zv.cur.cx, zv.cur.cy, zv.cur.r);
  if (stormEnterEdge(g.wasInStorm, inStorm)) g.audio.play('stormWarn');
  g.wasInStorm = inStorm;
  // THE frame's Tier-1 read comes back OUT of renderOwn: it is taken there,
  // after renderFiring has driven the denied pulse, and both Tier-2 consumers
  // (the chrome bar's amber ring segment and the storm vignette below) share
  // that one value. The payload is built with a provisional `false`, which
  // renderOwn overwrites with the real read before the HUD draws it.
  let tier1: boolean;
  if (pose) tier1 = renderOwn(g, pose, status, inStorm, chromeBarView(g, zv, now, false), mu, frameDt, now, nowMs);
  else {
    // No own frame this tick (forceSnap gap): nothing drove the denied pulse, so
    // the vignette reads the Tier-1 state directly.
    tier1 = ownTier1(g, status, nowMs);
    g.ownView.gfx.visible = false; // forceSnap gap (respawn/P-toggle): no stale-pose flicker
    g.nameplates.hide(g.state.net.sessionId); // plate follows the hull's visibility
    g.hotbar.hide(); // no frame renders here — the hotbar must not linger, nor route clicks
    // The economy satellites follow the hotbar's visibility exactly — but this
    // gap is TRANSIENT (the pose returns next frame), so the chip's breathing
    // state survives it: a full hide() would reset it and re-arm a decayed
    // chip's 10s window off a gap the player never saw (see hideTransient).
    g.xpRail.hideTransient();
  }
  updateZone(g, zv, inStorm, tier1, now, nowMs);
  // Own pose feeds the shell sight-bubble cull; own active zones keep a shell
  // revealed by our flare from being culled (exactly-once reveal — Story 1.7).
  g.projectiles.render(now, pose ?? undefined, ownZones);
  // AHEAD OF THE RADAR ON PURPOSE (amendment 89): the seam between the radar's
  // two ship-paint sources and the fog hole are one radius, and the radar reads
  // it during render() — so a dazzle flip adopted after this line would leave
  // the scope one frame behind the fog and the server, which is the
  // disagreement that radius exists to prevent. Camera zoom (which the fog
  // rebake reads) was updated in renderOwn.
  updateDazzle(g, now);
  // The contact store is the radar's SECOND source of ship paints (amendment
  // 89): a hull inside truesight is delivered as a `Contact` and never as a
  // blip, so the scope synthesizes its echo from that store when the beam
  // crosses it. Read-only here — the radar samples poses, nothing more.
  // The fourth argument is the camera's world rect (amendment 96): the heatmap
  // buffer is sized and centred on WHAT IS ON SCREEN, so a paint can never be
  // clipped by a ring-sized box around the ship. It reaches the buffer extent
  // and nothing else — no paint is created, retired or culled by it — which is
  // what makes a paint recorded while zoomed in appear when you zoom out.
  g.radar.render(pose, now, g.contacts, g.camera.worldView);
  // Wounded smoke ages on the SERVER clock, so it is driven here rather than
  // inside renderOwn: a forceSnap gap (respawn / P-toggle) leaves us with no
  // own pose for a frame, and a plume that stopped drifting whenever our own
  // hull blinked would stutter for a reason the player cannot see. Nothing
  // about it depends on the own ship — your own plume rides the same anonymous
  // row as everyone else's (amendment 46).
  g.smoke.render(now);
  // The chevron ray originates at the own hull's screen position — same rule
  // as the fog hole just below, and for the same reason: the camera's forward
  // lead means screen centre is NOT where the hull sits (review fix).
  const foghornOrigin = pose ? g.camera.worldToScreen(pose) : g.camera.screenCenter;
  renderFoghorn(g, now, foghornOrigin);
  // Fade each lit-zone glow by its timestamp expiry, and breathe the burning
  // zones' embers on the shared server-clock seconds (Story 2.9, amendment 50).
  g.litZones.render(now, now / 1000);
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
  g.nameplates.hide(g.state.net.sessionId); // own plate hidden while spectating (hull hidden)
  g.firing.hide();
  g.aimPreview.hide(); // nothing is aimed from a sunk hull
  g.hotbar.hide(); // the loadout surface dies with the hull (Story 2.2)
  g.xpRail.hide(); // ...and so do the economy satellites (Story 2.6)
  g.upgradeMenu.hide(); // the refit modal never lingers into spectate
  // Hand the zoom to the spectate factor: the alive user zoom resets to the
  // base framing so the spectate wheel path behaves exactly as it always has.
  // Any debounced zoom re-bake still in flight dies with it (fog is off here).
  g.camera.resetUserZoom();
  cancelZoomFogRebake(g);
  // Drop any WASD held at the moment of death so updateSpectateCamera sees a
  // clean edge — otherwise steering into your own death instantly (and
  // permanently) engages free-pan, skipping the follow-your-killer default.
  g.keyboard.clearKeys();
  // Clear the engine order too: entering spectate is a hard boundary, and the
  // order must not survive into the next life (respawn re-rings from STOP).
  g.keyboard.resetThrottle();
  // Same for any queued ability press (FINDING A) — dropped so a press mashed at
  // the moment of death can't fire on respawn (respawn's resetThrottle also
  // clears, this is the belt-and-braces at spectate entry).
  g.keyboard.clearActivations();
  // Reset the denial dedup with the queue drop (Story 1.10): a dropped press
  // must not leave a marked (slot, seq) the next life's press can reuse.
  g.denialDedup.clear();
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

function renderSpectate(g: Game, frameDt: number, now: number, nowMs: number, zv: ZoneView, mu: MatchUx): void {
  enterSpectateVisuals(g); // idempotent belt-and-braces with onSpectate
  updateSpectateCamera(g, frameDt, now);
  // A spectator is never IN the storm and owns no Tier-1 channel (no hull, no
  // fire control) — the plane renders, the vignette does not.
  updateZone(g, zv, false, false, now, nowMs);
  g.projectiles.render(now); // no sight cull: spec frames are unfogged
  g.effects.update(frameDt, null);
  g.radar.render(null, now); // hides the sweep + rings
  g.smoke.render(now); // a spectator receives every `sm` pulse — the plumes keep drifting
  // Spectator origin is the camera centre — honkBearing (roomBindings.ts)
  // derives the spectator bearing from the camera centre too, so origin and
  // bearing must agree (review fix).
  renderFoghorn(g, now, g.camera.screenCenter); // ...and every `fh`, on the omniscient position path
  g.litZones.render(now, now / 1000); // spectators see all zones, doctrine and all
  const s = publicState(g);
  const banner = spectateBannerText(s.matchPhase ?? 'waiting', s.winnerId ?? '', g.state.net.sessionId);
  // A spectator owns no Tier-1 channel (no hull, no fire control), so the bar's
  // amber ring segment breathes uninterrupted here — same view, tier1 false.
  g.hud.updateSpectate(chromeBarView(g, zv, now, false), mu, hudWidth(g), hudHeight(g), banner, now / 1000);
}

// --- UI scale (Story 2.3) -----------------------------------------------------

/**
 * THE UI-scale seam. The accessibility scale multiplies the Pixi HUD ROOT
 * (`stage.layers.hud` — the vitals + hotbar container) and divides the layout
 * inputs fed to it, so every screen-space HUD element grows/shrinks together
 * while staying anchored to the real viewport corners. It must NEVER touch
 * `app.stage`: the WORLD is not chrome, and scaling it would change how much
 * ocean a player can see — a fog/vision exploit.
 *
 * The fullscreen out-of-zone vignette (`layers.vignette`) is deliberately its
 * own sibling layer and is left alone: it is a full-viewport wash, not chrome.
 * DOM HUD-tier chrome follows through the `--hc-ui-scale` var (ui/theme.ts).
 */
function applyUiScale(g: Game): void {
  const factor = scaleFactor(effectiveScale(settings.current, g.stage.app.screen.width));
  if (factor === g.uiScale) return;
  g.uiScale = factor;
  g.stage.layers.hud.scale.set(factor);
  setUiScaleVar(factor);
}

/** Viewport width in the (possibly scaled) HUD's own coordinate space. */
function hudWidth(g: Game): number {
  return g.stage.app.screen.width / g.uiScale;
}

/** Viewport height in the (possibly scaled) HUD's own coordinate space. */
function hudHeight(g: Game): number {
  return g.stage.app.screen.height / g.uiScale;
}

/**
 * Age + re-pin the FOGHORN chevrons (Story 4.5) against SERVER time. Driven
 * from BOTH the alive and the spectate paths — a spectator receives every honk
 * on the omniscient position path, and a bearing that froze the moment you
 * sank would be a lie about a live ocean.
 *
 * Fed the RAW screen dimensions, not hudWidth/hudHeight: the chevron layer is a
 * sibling of `layers.hud` and deliberately outside the UI-scale transform (see
 * stage.ts), so its px inset is measured against the real viewport edge.
 *
 * `origin` is the screen point the bearing was actually measured FROM (review
 * fix): the caller's own hull on screen while alive, the camera centre while
 * spectating (honkBearing in roomBindings.ts derives the spectator bearing
 * from the camera centre at receipt, so origin and bearing must agree).
 * renderAlive computes it exactly like the fog hole just below it in that
 * function — own pose if one rendered this frame, camera centre otherwise
 * (a forceSnap gap); renderSpectate passes the camera centre outright.
 */
function renderFoghorn(g: Game, now: number, origin: ScreenPoint): void {
  g.foghorn.render(now, origin.x, origin.y, g.stage.app.screen.width, g.stage.app.screen.height);
}

/** A raw screen point projected into the HUD's coordinate space (hover/hit-test). */
function hudPoint(g: Game, p: ScreenPoint): ScreenPoint {
  return g.uiScale === 1 ? p : { x: p.x / g.uiScale, y: p.y / g.uiScale };
}

// --- the loop --------------------------------------------------------------------

/**
 * Advance the frame's CAMERA-derived state: the decaying screen-shake offset,
 * and the charted terrain layer, which is fed the live zoom because its contour
 * strokes are screen-locked. The terrain call is self-throttled (two float
 * compares unless the zoom has meaningfully moved), so this stays a cheap
 * per-frame step and the map layer stays a build-once graphic.
 */
function advanceCameraFrame(g: Game, frameDt: number): void {
  const shakeOff = g.shake.update(frameDt);
  g.camera.shake.x = shakeOff.x;
  g.camera.shake.y = shakeOff.y;
  g.mapChart.update(g.camera.zoom);
}

function makeCallbacks(g: Game): LoopCallbacks {
  // Story 1.13: hoist the per-contact nameplate frame — camera + pad are stable
  // and nameOf closes over g, so build it ONCE and reuse it every render frame
  // (no per-frame object/closure allocation in the render hot path).
  const plateFrame: PlateFrame = { nameOf: (id) => rosterNameOrNull(g, id), camera: g.camera, pad: CLIENT_CONFIG.nameplate.padPx };
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
      // Drain exactly ONE queued ability press onto this tick's wire counters
      // (FINDING A): the server fires one ability per tick, so multiple presses
      // in one 50ms window must ride successive inputs — consume before reading
      // actSeq/actSlot so this input carries the drained press (if any).
      g.keyboard.consumeActivation();
      const input = g.sampler.sample(g.keyboard.axes(), {
        aim,
        fireSeq: g.mouse.clickCount,
        aimDist,
        slot: primedSlot,
        fireT: g.mouse.lastClickT, // honest fire instant (server-clock estimate at pointerdown)
        actSeq: g.keyboard.actSeq, // cumulative CONSUMED activation count (0-sentinel; keyboard owns it)
        actSlot: g.keyboard.actSlot,
      });
      consumePrimeOnFire(g, primedSlot, aim, aimDist, input.fireSeq);
      // This tick's server-time estimate rides into the pending ring so a later
      // replay re-evaluates the boost gate at the identical per-tick time.
      if (g.state.mode === 'predict') g.predictor.localTick(input, g.clock.serverNow());
    },
    render: (alpha, frameDt) => {
      applyUiScale(g); // no-op unless the stored tier or the viewport gate moved
      // THE frame's monotonic timestamp, sampled EXACTLY once: every one-shot
      // pulse driven this frame and every reader of those pulses (the attention
      // seam → the storm vignette's hold) must see the same instant, or a
      // channel can be "live" for its driver and dead for its reader inside one
      // rendered frame.
      const nowMs = performance.now();
      const now = g.clock.serverNow();
      const zv = zoneView(g, now);
      const mu = matchUxFromRoom(g, now);
      updateScoreEpoch(g); // the ready room's sinkings are not match score
      updateOpenResults(g); // converge an open elimination modal on roster truth
      updateMatchAudioCues(g, now);
      advanceCameraFrame(g, frameDt);
      updateOwnColor(g); // recolor own hull/wake once the roster hue syncs (Story 1.12)
      if (g.state.spectating) renderSpectate(g, frameDt, now, nowMs, zv, mu);
      else renderAlive(g, alpha, frameDt, now, nowMs, zv, mu);
      syncRefitBand(g);
      g.contactViews.render(
        g.contacts,
        now - CLIENT_CONFIG.net.interpDelayMs,
        now,
        frameDt * 1000,
        (id) => rosterColor(g, id), // Story 1.12: per-contact personal hue
        plateFrame, // Story 1.13: per-contact truesight nameplate (hoisted, reused)
      );
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
  // Drain one queued press onto this neutral input too (FINDING A), so a
  // gap-press landing right at tab-hide activates NOW instead of waiting for
  // refocus (mirrors the fireSeq gap-handling).
  g.keyboard.consumeActivation();
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

// --- camera zoom (Story 2.1, Eric ruling 2026-07-24) --------------------------

/**
 * Apply an alive user-zoom target (clamped [0.5, 1.5] over the base radar-fit
 * framing by Camera.setUserZoom) and schedule the fog re-bake the new zoom
 * needs. ALIVE-ONLY (canUserZoom): inert while spectating (the spectate wheel
 * path below owns zoom there), while sunk-awaiting-respawn, AND before the
 * first frame ever lands (no `you` yet = not alive). Client-render-only — fog
 * visibility stays server-authoritative, so zoom is never an information
 * exploit (the fog hole scales with the zoom; what is revealed does not).
 */
function applyUserZoom(g: Game, next: number): void {
  if (!canUserZoom(g.state.spectating, g.state.net.you?.alive)) return;
  const before = g.camera.userZoom;
  g.camera.setUserZoom(next);
  if (g.camera.userZoom === before) return;
  scheduleZoomFogRebake(g);
}

/** X (+1, in) / Z (-1, out) keyboard zoom step (chokepoint onZoom hook). */
function handleZoomStep(g: Game, dir: 1 | -1): void {
  applyUserZoom(g, g.camera.userZoom + dir * CLIENT_CONFIG.zoom.keyStep);
}

/**
 * The fog's sight hole is baked at a pixel radius derived from the zoom, so a
 * zoom change needs a re-bake — a full-canvas OffscreenCanvas draw, debounced
 * to the trailing edge of a zoom burst (wheel spins / held X/Z) exactly like
 * the resize path, so smooth zooming never hitches on per-event bakes.
 */
function scheduleZoomFogRebake(g: Game): void {
  cancelZoomFogRebake(g);
  g.fogZoomTimer = setTimeout(() => {
    g.fogZoomTimer = null;
    g.fog.rebake(g.stage.app.screen.width, g.stage.app.screen.height, g.camera.zoom);
  }, FOG_REBAKE_DEBOUNCE_MS);
}

/**
 * Drop any pending debounced zoom re-bake. Called at every hard boundary that
 * ends the alive zoom's life — spectate entry, return to port, room leave — so
 * a trailing-edge bake can never fire against a torn-down stage.
 */
function cancelZoomFogRebake(g: Game): void {
  if (g.fogZoomTimer === null) return;
  clearTimeout(g.fogZoomTimer);
  g.fogZoomTimer = null;
}

/**
 * The one wheel listener: while SPECTATING it is the untouched spectator
 * zoom-out (wheel-only, clamped [0.5x, 1x] — render/spectate.ts wheelZoom,
 * byte-identical behavior); while ALIVE it drives the smooth user zoom
 * (clamped [0.5x, 1.5x] — Story 2.1).
 */
function bindWheelZoom(game: Game): void {
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (game.state.spectating) {
        game.camera.setZoomFactor(wheelZoom(game.camera.zoomFactor, e.deltaY));
        return;
      }
      applyUserZoom(game, game.camera.userZoom - e.deltaY * CLIENT_CONFIG.zoom.wheelRate);
    },
    { passive: true },
  );
}

// --- bootstrap ---------------------------------------------------------------------

/**
 * The live Game, or null pre-join. The settings overlay is built BEFORE any
 * connection (the home gear opens it), so its `inMatch` / `onAbandon` deps read
 * the game through this late binding rather than capturing it.
 */
let gameRef: Game | null = null;

/** Is the player in a match that can still be ABANDONED? (Gates the overlay's
 *  danger button — see ui/settings.ts canAbandon for the ruled phase set.) */
function inLiveMatch(): boolean {
  const g = gameRef;
  if (g === null) return false;
  return canAbandon(publicState(g).matchPhase ?? 'waiting', g.state.matchOver, g.returning);
}

/**
 * ABANDON MATCH (amendment 19) — confirmed inside the settings overlay. Leaves
 * through the EXISTING return-to-port chain (ad break → leave() raced against a
 * timeout → reload), so the room sees a clean leave, other clients get the
 * roster update, and no reconnect is attempted. Never a page refresh.
 */
function abandonMatch(): void {
  const g = gameRef;
  if (!g) return;
  hideResults(); // an elimination modal must not survive the teardown
  returnToPort(g);
}

/**
 * Push the settings that RENDER code can't read per-frame onto their consumers.
 * Volumes/mute reach audio through its own store subscription; motion and UI
 * scale are read live at their callsites; the colorblind remap is a table swap
 * at the render/ships.ts chokepoint, so it lands here.
 */
function applyRenderSettings(): void {
  setColorblindAssist(settings.current.colorblind);
}

/** Toggle master mute (M key), persisted through the settings store. */
function toggleMute(game: Game): void {
  game.audio.toggleMute();
  // Suppress the transient toast while reconnecting so it can't displace the
  // persistent RECONNECTING banner (mute still toggles).
  if (!game.reconnecting) showBanner(game.audio.muted ? 'MUTED' : 'UNMUTED', { autoHideMs: 1200 });
}

async function startGame(
  stage: Stage,
  home: HomeHandle,
  stopAmbient: () => void,
  name: string,
  cls: ShipClassId,
  audio: Audio,
  portal: PortalAdapter,
  settingsOverlay: SettingsOverlay,
): Promise<void> {
  home.setBusy(true);
  home.setStatus('CONNECTING…', 'info');
  let conn: Connection;
  try {
    conn = await connect(name || undefined, cls);
  } catch (err) {
    console.error('[net] connection failed', err);
    home.setStatus(connectErrorStatus(err), 'denied');
    home.setBusy(false);
    return; // the ambient keeps breathing behind the still-live home
  }
  home.hide();
  stopAmbient(); // tear down the pre-join CIC scene now that we're joining
  hideBanner();

  // The server's map, regenerated deterministically from the welcome seed + cap.
  // The chart layer is built inside buildGame — it needs the camera's zoom.
  const map = mapFromWelcome(conn.welcome);

  const game = buildGame(stage, conn, map, audio, cls, portal, settingsOverlay);
  gameRef = game; // the settings overlay's late-bound view of the live match
  bindResize(stage, game);
  bindVisibility(game);
  // P (netcode debug) and M (mute) ride the keyboard chokepoint now — the old
  // ad-hoc window keydown listener is gone (Story 2.1 single-chokepoint rule).
  bindWheelZoom(game);

  startLoop(stage.app, makeCallbacks(game));
}

async function main(): Promise<void> {
  // Design tokens first: inject the --hc-* CSS custom properties + type registers
  // before any DOM chrome (the menu below) builds, so every overlay resolves its
  // colors/fonts from the single token source (Story 1.11).
  injectTheme();
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

  // The live ambient CIC scene (UX-DR25): the game "breathing" behind the DOM
  // home. It renders into stage.worldRoot (empty + identity-transformed pre-join)
  // and animates off its OWN ticker callback — the game loop (startLoop) only
  // spins up post-connect. Torn down the moment we deploy (see startGame), so the
  // scene never fights the real world for the same worldRoot.
  const ambient = new AmbientScene(stage.app, stage.worldRoot);
  const ambientTick = (t: Ticker): void => ambient.update(t.deltaMS);
  stage.app.ticker.add(ambientTick);
  const stopAmbient = (): void => {
    stage.app.ticker.remove(ambientTick);
    ambient.destroy();
  };

  // The settings overlay outlives the join: the home gear and home ESC open it
  // pre-connect, and the same instance is the in-match ESC surface.
  //
  // `onVisibility` is how the PRE-JOIN entry point works at all: the ratified z
  // register puts this overlay (1050) UNDER the fullscreen home (1100), so the
  // home has to yield — stop painting, stop hit-testing — for as long as the
  // overlay is up, whichever way it was opened or closed (gear, home ESC, the
  // panel's own CLOSE button, a confirmed RESET). See ui/home.ts homeYieldStyle.
  let homeRef: HomeHandle | null = null;
  const settingsOverlay = new SettingsOverlay({
    store: settings,
    inMatch: inLiveMatch,
    onAbandon: abandonMatch,
    viewportWidth: () => stage.app.screen.width,
    onVisibility: (visible) => homeRef?.setYielded(visible),
  });
  // Live effect: every stored setting is applied at boot and re-applied on every
  // change, so a reload restores exactly what the player left (the AC's
  // "takes effect live, persists across reload").
  applyRenderSettings();
  setUiScaleVar(scaleFactor(effectiveScale(settings.current, stage.app.screen.width)));
  settings.subscribe(applyRenderSettings);

  const home = showHome(
    version,
    (name, cls) => {
      audio.resume(); // must happen inside the PLAY click's user-gesture handler
      void startGame(stage, home, stopAmbient, name, cls, audio, portal, settingsOverlay);
    },
    () => settingsOverlay.toggle(),
  );
  homeRef = home;
  // Client-side server-health probe → the status line (probing → ready/unreachable).
  void probeServer().then((ok) => home.setServerProbe(ok ? 'ready' : 'unreachable'));
}

main().catch((err) => {
  console.error('client boot failed', err);
});
