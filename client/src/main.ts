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
import { Camera, canUserZoom, type Point } from './render/camera.js';
import { ShipView, FALLBACK_STYLE, PLAYER_HUES, contactStyle, hullStyle, hueRevision, setColorblindAssist, setHullFlashGate } from './render/ships.js';
import { ContactViews, NO_SOFTENING, type HullSoftness, type PlateFrame } from './render/contacts.js';
import { ownSettle } from './render/sinkSettle.js';
import { NameplateLayer, latchPlate, plateScreenY } from './render/nameplates.js';
import { Projectiles, type OwnFire } from './render/projectiles.js';
import { FiringUX } from './render/firing.js';
import { AimPreview, computeAimPreview, ownBurstRadius, previewTint } from './render/aimPreview.js';
import { weaponArcHit, weaponRangeHit, weaponRangeU } from './render/weaponArc.js';
import { Effects, WorldFlashGate } from './render/effects.js';
import type { WakeHull } from './render/wake.js';
import { Mines, type OwnMineRings } from './render/mines.js';
import { Decoys } from './render/decoys.js';
import { LitZones, litZoneFade, ownActiveZones, type OwnZone } from './render/litZones.js';
import { Smoke } from './render/smoke.js';
import { Foghorn } from './render/foghorn.js';
import { Fog, hullSightSoftness, type FogHole } from './render/fog.js';
import { Radar } from './render/radar.js';
import { Zone } from './render/zone.js';
import { freezeAtDimKeyframe, tier1Active, tier2Active } from './render/attention.js';
import { createFlashBudget, FLASH_ELEMENTS, hotbarSlotKey, type FlashBudget } from './render/flashBudget.js';
import { Hud, conning, railFraction, reloadFraction, type OwnStatus } from './render/hud.js';
import { helmInputCounts, recordHelmInput } from './render/helmGlyphs.js';
import { Hotbar, type HotbarView } from './render/hotbar.js';
import { slotForBoonCategory } from './render/equipmentInfo.js';
import { XpRail, type XpView } from './render/xpRail.js';
import { spectatePan, wheelZoom, pickSpectateTarget, shouldEngageFreePan } from './render/spectate.js';
import { ShakeDriver } from './render/shake.js';
import { isClickDenied, DeniedPulse, DenialDedup } from './render/deniedFire.js';
import type { ToneFloor } from './render/gunneryFeed.js';
import { deniedFeedbackHasNoTwin, deniedToneFloor } from './audio/deniedCue.js';
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
import { conningFlag, founderDue, isSinkingNow } from './sim/sinkingWindow.js';
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
import { barVisible, ringReadout, type BountyHolder, type ChromeBarView } from './ui/chromeBar.js';
import { bountyClaimLine, bountyToastLine, bountyTransition } from './ui/bounty.js';
import { pushKillLine, UNKNOWN_VESSEL } from './ui/killFeed.js';
import { pushUpgradeToast } from './ui/upgradeToast.js';
import {
  closeResultsAsSpectate,
  hideResults,
  resultsVisible,
  showResults,
  updateResultsScore,
  winnerBanner,
  type ResultsOwn,
  type ResultsView,
} from './ui/results.js';
import { SettingsOverlay, canAbandon, canOpenSurface, escapeAction } from './ui/settings.js';
import { effectiveScale, motionIntensity, scaleFactor, settings } from './settings/store.js';
import { setUiScaleVar } from './ui/theme.js';
import {
  afloatCount,
  canOpenElimination,
  freshScore,
  isLiveRival,
  matchTimeMs,
  personalScore,
  personalScoreFromResults,
  recordElimination,
  recordSunk,
  refinePlacement,
  respawnArmedIn,
  scoreAfterReconnect,
  type PersonalScore,
  type ScoreState,
} from './score.js';
import { Audio } from './audio/context.js';
import {
  audioCues,
  stormEnterEdge,
  telegraphTone,
  INITIAL_CUE_STATE,
  type AudioCueState,
} from './audio/tones.js';
import { ownHpFrac, hpStingCueAt, hpStingFloor } from './audio/hpSting.js';
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
   *  disclosed out to 412.5u and the plume must read past the sight bubble. */
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
  /** The bounty holder id this client has already ANNOUNCED (Story 4.6) — the
   *  fire-once-on-change latch behind the claim register and the self toast,
   *  held here for the same reason `scorePhase` is: the schema is POLLED, so
   *  the edge has to be detected against a previous value we keep ourselves.
   *  '' = vacant (also the pre-join value, so a mid-match join announces the
   *  sitting holder once — which is the register doing its job). */
  bountyPrev: string;
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
  /**
   * THE AGGREGATE FLASH BUDGET (Story 4.8, amendment 240) — one instance per
   * client, the counter behind the ratified *"no element or screen region
   * flashes more than 3x/s regardless of how many compliant events stack"*
   * floor. Every one-shot flash site claims against it; a `'degrade'` verdict
   * means draw the flat `motion: 'off'` mark, NEVER skip.
   *
   * It sits ON TOP of the existing per-source floors (the 300ms PULSE_RATE_MS
   * every DeniedPulse already enforces), never in place of them: the per-source
   * floor stops one channel strobing, the budget stops several compliant
   * channels stacking into a strobe between them.
   */
  flashBudget: FlashBudget;
  /** Rate-limited denied-fire pulse (render/deniedFire.ts). */
  deniedPulse: DeniedPulse;
  /** This frame's denied-fire pulse state — read by hud.update() for the chip flash. */
  deniedFlash: boolean;
  /** This frame's denied-fire pulse is DEGRADED (its onset was over budget). The
   *  on-water arc/marker draws its flat denied red either way — that mark is the
   *  denial's only visual channel and is never motion-gated, so it IS its own
   *  degraded form — and the hotbar chip this pulse also drives drops its bloom
   *  (render/hotbar.ts `degradedSkin`). */
  deniedDegraded: boolean;
  /** THE `denied` CUE'S TONE FLOOR (the twin walk, amendment 60) — ONE shared
   *  floor across every `denied` call site (weapon click, predicted ability
   *  press, FIFO-full press, server-denial echo), keyed on the SAME
   *  PULSE_RATE_MS the visual pulses above already rate-limit on
   *  (audio/deniedCue.ts). Without it the tone plays unbounded while its chip
   *  twin caps at one flash per 300ms. */
  deniedToneFloor: ToneFloor;
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
  /** Per-slot: this frame's denied flash is DEGRADED (its onset was over the
   *  aggregate budget for THAT slot's element key — three slots denying at once
   *  is three separate elements, not one over-budget one). */
  abilityDegraded: boolean[];
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
  /** That rank-wide flash is DEGRADED this frame (over budget on its own
   *  element key) — it still draws, at the flat degraded weight. */
  fitFrameDegraded: boolean;
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
  /**
   * THE DEFERRED ELIMINATION (Story 5.2, amendment 16): our own sinking has
   * been observed and LATCHED (placement recorded, banner shown) but the
   * ELIMINATED modal is being held back until the hull actually founders.
   *
   * It has to be held, not merely delayed: the modal is FOCUSED — presentResults
   * calls keyboard.clearKeys() and overlayFocused() then suppresses every
   * non-overlay key — so a live helm, a live hotbar and a live trigger are all
   * impossible while it is up. The server still emits `sunk` at sink-entry
   * (unmoved, amendment 11), so the client cannot simply wait for a later event;
   * it latches here and fires at founder (tickSinkingWindow).
   *
   * THE DEBRIEF ONLY. Whether a window is running at all is `pendingFounder`
   * below — the two were one flag until the review gate found that fusing them
   * made the banner and the founder-time hygiene unreachable outside a live
   * match (see handleSunkObserved).
   */
  pendingElimination: boolean;
  /**
   * A SINKING WINDOW OF OURS IS RUNNING and its founder-time hygiene (the
   * engine-order reset, the prime revert) has not fired yet — set the instant
   * the going-down banner goes up, in ANY match phase, and cleared at founder.
   *
   * Phase-agnostic on purpose: a window ends a life wherever it happens, and
   * the life-boundary hygiene is owed either way. Only the DEBRIEF is a live-
   * match question.
   */
  pendingFounder: boolean;
  /** Countdown-tick / match-start edge-detector state (audio/tones.ts). */
  audioCueState: AudioCueState;
  /** Own-ship storm-membership last frame, for the storm-enter warning edge. */
  wasInStorm: boolean;
  /**
   * THIS FRAME'S HULL SIGHT-BOUNDARY FEATHER (this cycle) — the spatial alpha
   * multiplier every contact hull wears, built by `hullSoftnessFor`.
   *
   * It is a per-frame field rather than an argument because the two renderers
   * that know the observer (`renderAlive` / `renderSpectate`) run BEFORE the one
   * call site that draws contacts, which sits outside both. Exactly one of the
   * two runs per frame and both always set it, so it can never go stale; it boots
   * at `NO_SOFTENING` for the frames before either has run.
   */
  hullSoftness: HullSoftness;
  /**
   * Own hull fraction last frame, for THE BAND STINGS' downward-crossing edge
   * (Story 4.7, audio/tones.ts `hpBandEdge`) — the `wasInStorm` idiom, one field
   * up.
   *
   * NULL IS NOT ZERO, and the distinction is the whole reason this is nullable:
   * there is no own hull while spectating or across the respawn gap, and a
   * missing hull reading as 0 would fire the critical sting at the moment you
   * die and again on every frame you spent watching. `null` also re-arms the
   * edge for free — the first frame back is silent by construction, because a
   * crossing needs two live frames to exist.
   */
  wasHpFrac: number | null;
  /**
   * ...and THE STINGS' 300ms same-source floor (review gate, audio/hpSting.ts).
   * The edge alone is not a bound: DAMAGE CONTROL regen pays into `hp` every
   * server tick while incoming fire subtracts, so a hull held around 50% crosses
   * the band downward over and over. Deliberately NOT reset on spectate — the
   * floor is a property of the MIX, not of a life, and the world cues' floors
   * are not reset either.
   */
  hpStingFloor: ToneFloor;
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
    // THE THIRD STATE (Story 5.2, amendment 16). Note what is deliberately NOT
    // shared with the line above: `alive` defaults a missing `you` to TRUE (the
    // pre-first-frame gap must not read as death), and the sinking window must
    // never inherit that — isSinkingNow returns false without a `you`, so an
    // absent own ship can never fabricate a window that keeps a torn-down
    // hull's controls live. `alive` and `sinking` are disjoint by construction.
    // The spectating flag is the predicate's third clause (review fix): `you`
    // is never CLEARED, so a stale one whose deadline has not expired would
    // otherwise read as a live window on a hull we no longer have.
    sinking: isSinkingNow(you, g.clock.serverNow(), g.state.spectating),
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

/**
 * The spend view for THIS frame (null = nothing to show → menu auto-hides).
 * The fourth flag is the third state (Story 5.2, amendment 10): the refit goes
 * INERT for the whole sinking window — "once sinking, you're done" — while the
 * weapons, the abilities and the horn stay live. This is the ONE seam that
 * closes it, and it is enough: TAB (handleRefitToggle), every digit and card
 * pick (handleRefitPick) and the per-frame band sync (syncRefitBand) all read
 * the refit's state through here.
 */
function currentOfferView(g: Game): OfferView | null {
  return offerView(
    g.state.net.you,
    g.state.spectating,
    g.spendInFlight !== null,
    isSinkingNow(g.state.net.you, g.clock.serverNow(), g.state.spectating),
  );
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
  /** THE BOUNTY (Story 4.6) — the holder's roster id, '' when the throne is
   *  vacant. IDENTITY ONLY: the server publishes this one scalar and the client
   *  never re-derives the throne rule from it (the two-derivations desync class
   *  effectiveStats() exists to prevent). It discloses nothing new — the roster
   *  has always mirrored every captain's kill count to every client. */
  bountyId?: string;
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

/**
 * THE BOUNTY REGISTER's payload (Story 4.6) — the holder's callsign + raw
 * personal hue, or null.
 *
 * NULL ON A ROSTER MISS, deliberately: the whole segment (separator included)
 * is then omitted rather than printing `☠︎ UNKNOWN VESSEL` as a permanent
 * fixture of the bar. The kill feed's neutral label exists for a ONE-SHOT line
 * about a vessel that already left; a persistent register naming nobody is
 * just noise. The name resolves the frame the roster syncs.
 */
function bountyHolder(g: Game): BountyHolder | null {
  const id = publicState(g).bountyId ?? '';
  if (!id) return null; // vacant throne
  const name = rosterNameOrNull(g, id);
  const hue = feedColor(g, id);
  return name !== null && hue !== null ? { name, hue } : null;
}

/**
 * THE BOUNTY's two edge-driven surfaces (Story 4.6), fired ONCE per change of
 * holder: the public claim register in the kill feed, and — only when the
 * throne lands on the local player — the toast and its cue.
 *
 * The rule itself is the SERVER's (ui/bounty.ts only detects the edge): this
 * reads one authoritative scalar off the polled schema and never recomputes who
 * should hold it. A throne that VACATES changes but does not claim — the
 * sinking that emptied it already printed its own bounty-kill line, and a
 * second register saying nothing would be a duplicate.
 */
function updateBounty(g: Game): void {
  const t = bountyTransition(g.bountyPrev, publicState(g).bountyId ?? '', g.state.net.sessionId);
  if (!t.changed) return;
  g.bountyPrev = t.holder;
  if (t.claimed) {
    const name = rosterNameOrNull(g, t.holder) ?? UNKNOWN_VESSEL; // never a raw session id
    pushKillLine(bountyClaimLine({ name, id: t.holder }), (id) => feedColor(g, id));
  }
  if (t.self) {
    pushUpgradeToast(bountyToastLine());
    g.audio.play('bounty');
  }
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
 * Recolor the own hull the moment the own roster hue is first known (Story
 * 1.12): the roster schema can sync AFTER the first rendered frame, so the hull
 * boots on the amber fallback and swaps to the personal hue here. Cheap
 * idempotent poll — redraws only when the resolved index actually changes.
 *
 * THE WAKE NO LONGER LATCHES HERE. Story 4.12 made wake a property of every
 * visible hull rather than a UI element behind the own one (amendment 199), so
 * its tint is resolved PER SOURCE, per frame, off the same roster this reads —
 * see `wakeHulls`. A latch for one of twenty sources would have been the odd
 * one out.
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
}

/**
 * Own truesight nameplate (Story 1.13): resolve + latch the own callsign plate
 * once the roster syncs the own name + hue (the SAME roster source as the hull
 * color — own callsign comes from the roster, never localStorage), then float it
 * above the own hull at screen space, full alpha. Own is never a drone. The
 * caller (renderOwn) runs this after camera.update so the projection matches the
 * hull; the plate hides whenever the hull hides (spectate / forceSnap gap).
 */
/**
 * THE OWN WRECK'S POSE while spectating, or null when there is no wreck to draw
 * (never sank, or no `you` was ever received). `net.you` is deliberately never
 * cleared on death — "the wreck's last pose survives the entire spectate
 * period" — so the hull's final resting position is simply the last one the
 * server sent. Mirrors `enterSpectateVisuals`'s `=== false` test so the two can
 * never disagree about whether a wreck exists.
 */
function ownWreckPose(g: Game): RenderPose | null {
  const you = g.state.net.you;
  if (!you || you.alive !== false) return null;
  return { x: you.x, y: you.y, heading: you.heading, speed: you.speed };
}

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
    // IDENTITY ONLY (Story 4.6): a callsign and a hue. This text register is
    // the bounty's only appearance on screen outside the feed and the toast —
    // nothing on the water, the scope included, is told the throne exists.
    bounty: bountyHolder(g),
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

/**
 * THE FIELD SIZE — the `OF 14` of `9TH OF 14` (Story 5.3, amendment 29). Every
 * CAPTAIN on the roster, alive or sunk, drones excluded by the same sentinel
 * every other captains-only count uses (epic-4 amendment 32, epic-5 amendment 9).
 *
 * Deliberately the LIVE roster rather than a match-start tally: a captain who
 * quits is removed outright (`Match.onPlayerLeave` → `removeShip`), so a field
 * that shrinks mid-match is what the roster actually knows. The game-end modal
 * does not use this — it derives the field from the results table's own rows,
 * which include departed captains and are the authoritative record.
 */
function captainCount(g: Game): number | null {
  const players = publicState(g).players;
  if (!players) return null;
  let n = 0;
  players.forEach((meta: { color?: number }) => {
    if (typeof meta.color === 'number' && meta.color !== REGATTA_NO_HUE) n += 1;
  });
  return n > 0 ? n : null;
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

/**
 * MATCH TIME (T+) for the results card — `serverNow − zoneStartT`, the exact
 * derivation the BR chrome bar has used since Story 3.3, so the MATCH LOG's
 * stamps and the bar's clock can never disagree. Null until the timeline is
 * anchored (`zoneStartT` is 0 in the ready room), which is what lets the modal
 * drop the TIME AFLOAT tile rather than print a zero (Story 5.3, amendment 28).
 */
function ownMatchTime(g: Game): number | null {
  return matchTimeMs(g.clock.serverNow(), publicState(g).zoneStartT ?? 0);
}

/** Assemble the modal's personal-score block from the accumulator + roster. */
function ownScore(g: Game): PersonalScore {
  return personalScore(g.score, g.state.net.you?.boons, ownKills(g), isWinner(g), ownMatchTime(g));
}

/**
 * The modal's OWN-IDENTITY block (Story 5.3): callsign · class in the personal
 * hue, plus the build it is reviewing. Every field is already in hand — the
 * roster for name/hue, and `net.you` for class/boons/offer, which is NEVER
 * cleared on death (roomBindings: "the wreck's last pose survives the entire
 * spectate period"), so this costs no wire and no PROTOCOL_VERSION bump.
 * Null when either half is unresolved: the modal then simply omits the line.
 */
function ownResultsIdentity(g: Game): ResultsOwn | null {
  const you = g.state.net.you;
  const name = rosterNameOrNull(g, g.state.net.sessionId);
  const idx = rosterColor(g, g.state.net.sessionId);
  if (!you || name === null || idx === null) return null;
  return {
    name,
    cls: you.cls,
    hue: PLAYER_HUES[idx] ?? CLIENT_CONFIG.colors.droneOutline,
    boons: you.boons ?? [],
    offer: you.offer ?? [],
    pts: you.pts ?? 0,
  };
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
    {
      victimId,
      victimName: rosterNameOrNull(g, victimId),
      killerId,
      victimIsDrone: isDroneId(g, victimId),
      // The MATCH LOG's stamp and killer name (Story 5.3, amendment 28). Both
      // are resolved HERE, at fold time, because both are perishable: the T+
      // clock only means anything at the moment the sinking is observed, and a
      // killer who leaves the roster later would no longer resolve to a name.
      tMs: ownMatchTime(g),
      killerName: killerId === null ? null : rosterNameOrNull(g, killerId),
    },
    g.state.net.sessionId,
  );
  if (victimId !== g.state.net.sessionId) return;
  // THE WINDOW IS THE HULL'S BEAT, NOT THE MODAL'S (review fix). This used to
  // sit BELOW the canOpenElimination gate, which made the going-down banner and
  // the founder-time keyboard hygiene reachable only in the ACTIVE phase — so a
  // hull sinking in the ready room got a full five-second window with no banner
  // and never reverted its primed weapon for the next life, the exact opposite
  // of the shipped intent. Production-unreachable (`damageEnabled` is active-
  // only and `respawnEnabled` is ready-room-only, so no hull reaches 0 hp
  // outside a live match) and fixed anyway, because the two latches answer two
  // different questions and only one of them is about a debrief.
  const sinking = openSinkingWindow(g);
  // The three ways an own-sinking is NOT an elimination-modal moment: a
  // ready-room respawn, an own-`sunk` racing in behind the game-end results
  // broadcast, and a duplicate of a sinking already latched. See
  // score.ts canOpenElimination for the full reasoning on each.
  if (!canOpenElimination(publicState(g).matchPhase ?? 'waiting', g.resultsFinal, g.score.eliminated)) return;
  // The PLACEMENT is latched HERE, at sink-entry, even when the modal is held
  // back: the outcome is decided the instant the hull hits 0 (amendment 14), so
  // the number must be read off the roster at that instant, not five seconds
  // later once rivals have died behind us. updateOpenResults' pure refine keeps
  // converging it on server truth through the window (see refinePlacement).
  g.score = recordElimination(g.score, othersAlive(g));
  if (sinking) {
    g.pendingElimination = true; // the modal waits for founder — see below
    return;
  }
  showEliminationResults(g);
}

/**
 * THE GOING-DOWN BEAT (Story 5.2, amendments 11/16). Our own `sunk` has landed;
 * is this a sinking window rather than an immediate death — and if so, open it.
 *
 * The banner is Eric's own words, verbatim: *"killee gets a 'GOING DOWN WITH
 * THE SHIP!' notification and gets 5 seconds of sinking"*. It rides the
 * existing single banner slot on the standing discipline (`if (!g.reconnecting)`
 * — the persistent RECONNECTING banner owns that slot for up to 60s and a
 * transient must never displace it), and auto-hides on the SHARED window
 * constant, so the notification's life is the beat's life by construction
 * rather than by a second feel number.
 *
 * `pendingFounder` — the window latch — is set HERE and is PHASE-AGNOSTIC: it
 * says "a hull of ours is going down", which is true wherever it happens. The
 * modal's own latch (`pendingElimination`) stays gated by canOpenElimination in
 * the caller, so the debrief rules are untouched.
 */
function openSinkingWindow(g: Game): boolean {
  if (!isSinkingNow(g.state.net.you, g.clock.serverNow(), g.state.spectating)) return false;
  // Latched, exactly like the elimination it used to share a flag with: this
  // now runs ABOVE canOpenElimination (which carries the never-twice clause),
  // so a duplicate/replayed `sunk` inside one window must not re-banner.
  if (g.pendingFounder) return true;
  g.pendingFounder = true;
  if (!g.reconnecting) showBanner('GOING DOWN WITH THE SHIP!', { autoHideMs: CONFIG.ship.sinkingWindowMs });
  return true;
}

/**
 * FOUNDER: the deferred beat is over. Called once per sinking window from the
 * render loop, keyed on the window itself rather than on a spectate frame's
 * arrival, so a dropped or late frame can never strand a captain with no
 * debrief.
 *
 * The two keyboard resets moved here WITH the modal (they fire at sink-entry
 * today, in roomBindings.handleSunk): clearing the engine order would stop the
 * hull the window exists to keep sailing, and reverting the prime would steal
 * the primed torpedo a captain went down intending to fire. Both are the
 * shipped hard-boundary hygiene — they just belong at the boundary that is now
 * five seconds later. enterSpectateVisuals repeats resetThrottle when the
 * spectate frame lands; both are idempotent.
 *
 * TWO LATCHES, NOT ONE (review fix). The HYGIENE rides `pendingFounder` — every
 * window ends a life, in any phase — while the DEBRIEF rides
 * `pendingElimination`, which only a live match ever sets. A ready-room sinking
 * therefore resets its orders and its prime and shows no results table, which
 * is what a respawn wants.
 */
function tickSinkingWindow(g: Game): void {
  if (!founderDue(g.pendingFounder, isSinkingNow(g.state.net.you, g.clock.serverNow(), g.state.spectating))) return;
  g.pendingFounder = false;
  resetOwnOrders(g);
  g.keyboard.revertToGun();
  if (!g.pendingElimination) return; // a ready-room founder: hygiene only, no debrief
  g.pendingElimination = false;
  // THE GAME-END TABLE IS NEVER REPLACED: results and your own founder can
  // land on the SAME tick. Since the amendment-17 REVERSAL (Eric veto
  // 2026-08-12) the server holds the match open for every sinking captain's
  // window — the outcome is still decided at sink-entry, only the transition
  // waits — so when YOUR window is the last one (the 1v1 loser, the
  // revenge-sunk winner, the same-tick-wipe draw) `finish()` fires on your
  // founder tick and the final debrief may already be up when this runs. This
  // is the same clause canOpenElimination enforces at sink-entry, restated at
  // the deferred end because the state can change BETWEEN the two moments.
  // The resets above still run: the life is over either way.
  if (g.resultsFinal) return;
  showEliminationResults(g);
}

/**
 * THE HARD-BOUNDARY ORDER RESET — own spawn, own founder, the match-activation
 * teleport. Extracted from the roomBindings `resetThrottle` dep (which is still
 * its only other caller) because Story 5.2 gave it a SECOND call site: the
 * boundary moved off sink-entry and onto founder for a sinking hull, and the
 * two paths must do byte-identical work or a life would end differently
 * depending on whether it ended in a window.
 *
 * Drops any queued-but-unconsumed ability press (FINDING A) so a press queued
 * in one life (or mashed while dead/spectating) never fires into the next;
 * consumed counters stay monotonic (clearActivations leaves them), mirroring
 * the server's un-reset lastActSeq.
 */
function resetOwnOrders(g: Game): void {
  g.keyboard.resetThrottle();
  g.keyboard.clearActivations();
  // Story 2.9: the decoy slot's ACTIVE window dies at the same hard boundary.
  // The latch is fed by the reconcile's own-spawn hook, which only ever fires
  // for a NEW buoy — so a window left standing across death would keep a slot
  // reading ACTIVE for a buoy the next life does not own. Missing juice beats a
  // lying slot.
  g.ownDecoyUntil = 0;
  // Story 2.9: the own-fire latch dies at that same boundary. A claim is a
  // promise about the next reveal on our own bow, and death/respawn breaks it —
  // the shot it describes either splashed unseen or belongs to a hull that no
  // longer exists, so letting it stand would dress the FIRST reveal of the next
  // life (quite possibly somebody else's shell, landing where we just spawned)
  // as our cannon shot. An unclaimed reveal reads generic, the honest fallback.
  g.ownFire.clear();
  // Reset the denial dedup at the SAME boundary (Story 1.10): dropping queued
  // presses without advancing actCount would otherwise let the next press reuse
  // a still-marked (slot, seq), suppressing a genuine later server denial as an
  // echo.
  g.denialDedup.clear();
}

/** The elimination modal: personal score + placement, SPECTATE + RETURN TO PORT. */
function showEliminationResults(g: Game): void {
  presentResults(g, {
    // IGNORED AT AN ELIMINATION and deliberately empty: `bannerText()` owns the
    // death register (amendment 29 — the banner reads SUNK, with the placement
    // on its second line, per mockup F3 and EXPERIENCE.md's dry-naval voice).
    // The field carries GAME-END copy only (VICTORY / WINNER: NAME / DRAW).
    banner: '',
    victory: false,
    score: ownScore(g),
    rows: null,
    ownId: g.state.net.sessionId,
    canSpectate: true,
    own: ownResultsIdentity(g),
    fieldSize: captainCount(g),
  });
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
  const score = personalScoreFromResults(g.score, g.state.net.you?.boons, msg, g.state.net.sessionId, ownKills(g), ownMatchTime(g));
  presentResults(g, {
    banner: winnerBanner(msg, g.state.net.sessionId),
    victory: score.winner,
    score,
    rows: msg.rows,
    ownId: g.state.net.sessionId,
    canSpectate: false, // nothing left to watch
    own: ownResultsIdentity(g),
    // No fieldSize: the results table's own rows ARE the field (captains only,
    // departed captains included), so the module derives it for free.
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
 * Converge the elimination placement on server truth as roster patches land
 * (fixes both the multi-death-tick placement inflation and the mutual-kill
 * tally race). Cheap by construction: the pure refine is a no-op once the
 * roster has applied our own sinking, and updateResultsScore compares a
 * signature before it touches the DOM. The game-end table is never re-derived
 * here — its numbers came from the results message, which is already final.
 *
 * THE REFINE RUNS WHETHER OR NOT THE MODAL IS ON SCREEN (Story 5.2). It used to
 * be gated on `resultsVisible()` because elimination and modal were the same
 * instant; with the modal deferred to founder, that gate would freeze the
 * placement at its provisional sink-entry value for the whole five seconds and
 * then open the modal on a number the roster had already corrected. Only the
 * DOM write stays behind the visibility check — there is nothing on screen to
 * update until founder, and the pure state is what the modal reads when it
 * finally opens.
 */
function updateOpenResults(g: Game): void {
  if (g.resultsFinal || !g.score.eliminated) return;
  g.score = refinePlacement(g.score, othersAlive(g), ownRosterSettled(g));
  if (resultsVisible()) updateResultsScore(ownScore(g));
}

/**
 * The elimination debrief's whole per-frame upkeep, in the ONE order that is
 * correct: converge the placement on roster truth FIRST, then check for founder
 * — so a modal deferred through a sinking window opens on the refined number
 * rather than on the provisional one latched at sink-entry. Both halves are
 * no-ops for a captain who has not been eliminated.
 */
function updateEliminationUx(g: Game): void {
  updateOpenResults(g);
  tickSinkingWindow(g);
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
      // ...and for the wake (Story 4.12), which is the strongest case of the
      // three: it is a whole ribbon of TRUE world positions per hull, and it
      // also feeds the radar's in-truesight stamp, so a survivor would paint
      // the next ocean as well as draw on it.
      g.effects.clearWake();
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
  // A SINKING hull is still being conned (Story 5.2, amendment 16): the helm is
  // live all the way down — decayed by the ritardando, never cut — so the
  // telegraph bell rings and a W/S/A/D input still retires its coach mark.
  return s !== undefined && helmInputCounts(s.spectating, conningNow(g));
}

/**
 * `you.alive` WIDENED through the sinking window — the flag every CONTROL-side
 * gate reads (helm, weapons, abilities, horn, zoom, denied feedback) in place
 * of the raw `you?.alive` it used to. Returns `undefined` with no own ship, so
 * each caller keeps its own deliberate default (`?? true` for the ability
 * press, `?? false` for the horn, `=== true` for the helm/zoom); see
 * sim/sinkingWindow.ts. The ECONOMY gates deliberately do NOT use this — the
 * refit, the heal and the XP rail close at sink-entry (amendment 10).
 */
function conningNow(g: Game | null): boolean | undefined {
  if (!g) return undefined;
  return conningFlag(g.state.net.you, g.clock.serverNow(), g.state.spectating);
}

/**
 * Play the `denied` cue, floored to the SAME PULSE_RATE_MS the visual pulse
 * (render/deniedFire.ts's DeniedPulse) already rate-limits on — ONE shared
 * floor across every `denied` call site (audio/deniedCue.ts), because it is
 * one cue from the player's perspective. Without this the tone plays
 * unbounded while its chip twin caps at one flash per 300ms (the twin walk,
 * amendment 60, epic-4-context-amendments.md): a click-spam burst landing
 * 80-300ms after the last one played the tone with no visual at all.
 */
function playDenied(g: Game): void {
  if (g.deniedToneFloor.request(performance.now())) g.audio.play('denied');
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
      // No live hotbar to flash into (sunk / spectating) — the tone's only
      // twin can't render there, so suppress the whole predicted-denial
      // feedback here, mirroring handleServerDenial's guard below (Story
      // 1.10's server-denial path already has it). The twin walk (amendment
      // 60, epic-4-context-amendments.md) found this FIFO-full path missing
      // it — the keyboard chokepoint deliberately doesn't gate on life
      // itself (onFoghorn's doc: "alive, spectating, cooldown — is main.ts's
      // call"). Story 5.2: a SINKING hull still has its hotbar on screen, so
      // the twin exists and the feedback plays — hence conningNow, not `alive`.
      if (deniedFeedbackHasNoTwin(g.state.spectating, conningNow(g))) return;
      g.abilityDeniedPress[slot] = true;
      playDenied(g);
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
  // Story 5.2 / amendment 10 — NO RESTRICTION AT THE GATE: every fitted slot
  // activates while sinking, speedBoost and decoyBuoy included (the criterion
  // is fitment, not category), so this reads the WIDENED flag. The `?? true`
  // default for a missing own ship is unchanged.
  if (abilityPressDenied(conningNow(g) ?? true, loaded)) {
    // No live hotbar to flash into (sunk / spectating) — the tone's only
    // twin can't render there, so suppress the whole predicted-denial
    // feedback here, mirroring handleServerDenial's guard below (Story
    // 1.10's server-denial path already has it — a matching server denial
    // for this same press is guarded there too, so nothing is lost by not
    // marking denialDedup on this branch). The twin walk (amendment 60,
    // epic-4-context-amendments.md) found this predicted path missing it —
    // the keyboard chokepoint deliberately doesn't gate on life itself
    // (onFoghorn's doc: "alive, spectating, cooldown — is main.ts's call").
    // Story 5.2: widened like the gate above — the sinking hotbar is the twin.
    if (deniedFeedbackHasNoTwin(g.state.spectating, conningNow(g))) return;
    g.abilityDeniedPress[slot] = true;
    // Story 1.10 exactly-one-feedback: this predicted denial IS the feedback
    // (chip flash above + the denial tone) — mark its (slot, actSeq) key so
    // the server's matching denial echo is suppressed, never doubled.
    g.denialDedup.markPredicted(slot, actSeq);
    playDenied(g);
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
  // THE FOGHORN STAYS LIVE WHILE SINKING (Story 5.2 — Eric named it explicitly
  // alongside the weapons: *"Weapons and equipment only. And foghorn."*), so
  // the gate reads the widened flag. The server's hornControl re-opens on the
  // same terms, which is what keeps this from teaching a rule the sim lacks.
  const verdict = hornPressVerdict(conningNow(g) ?? false, g.state.spectating, now, g.nextHonkAt);
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
  | 'abilityDeniedPress' | 'abilityPulse' | 'abilityFlash' | 'abilityDegraded' | 'abilityActivatedPress'
  | 'activatedPulse' | 'activatedFlash' | 'fitPress' | 'fitPulse' | 'fitFlash' | 'fitFramePress'
  | 'fitFramePulse' | 'fitFrameFlash' | 'fitFrameDegraded'
> {
  return {
    abilityDeniedPress: Array.from({ length: SLOT_COUNT }, () => false),
    abilityPulse: Array.from({ length: SLOT_COUNT }, () => new DeniedPulse()),
    abilityFlash: Array.from({ length: SLOT_COUNT }, () => false),
    // Story 4.8: the budget verdict that rides each slot's flash (per-slot, so
    // one over-budget slot never flattens another's mark).
    abilityDegraded: Array.from({ length: SLOT_COUNT }, () => false),
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
    fitFrameDegraded: false,
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

/**
 * Arm the WORLD side of the flash budget (Story 4.8, amendment 241).
 *
 * Tier arbitration stops at HUD chrome, but the BUDGET covers everything
 * including the water — its ratified floor says "element OR SCREEN REGION", and
 * the worst stacking in this game is on the water: 20 hulls flashing, 19
 * shooters' muzzle flashes, and a salvo's Hit Calls and splashes can all land
 * inside one region at once.
 *
 * The gate carries the CAMERA as well as the budget because a region is a
 * SCREEN cell — a world position must be projected before it can be bucketed,
 * or a camera pan would never re-bucket a flash the way the floor intends.
 * Both consumers default to "no gate wired" = pre-4.8 behaviour, so this ARMS
 * them rather than configuring them.
 */
function armWorldFlashBudget(g: Game, camera: Camera, budget: FlashBudget): void {
  const gate = new WorldFlashGate(budget, camera);
  g.effects.setFlashGate(gate);
  setHullFlashGate(gate);
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

  // THE ONE FLASH BUDGET (Story 4.8, amendment 240) — hoisted out of the literal
  // because surfaces built IN it take the budget as a constructor dependency.
  // Exactly one per client: two would each count to three and the ratified
  // per-element/per-region aggregate would silently become six.
  const flashBudget = createFlashBudget();

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
    // NO TRAIL CALLBACK ANY MORE (cycle-69 review gate, P10): a fish's water is
    // the one shared wake ribbon, pulled by `wakeHulls` from
    // `projectiles.torpWakeHulls()` and laid by `effects.update()` on the same
    // model, cadence and life the scope draws.
    projectiles: new Projectiles(map.radius, stage.layers.projectile),
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
    foghorn: new Foghorn(stage.layers.foghorn, flashBudget),
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
    upgradeMenu: new UpgradeMenu(onSpendClick(() => gRef), flashBudget),
    settingsOverlay,
    score: freshScore(),
    scorePhase: 'waiting',
    bountyPrev: '',
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
    flashBudget,
    deniedPulse: new DeniedPulse(), deniedFlash: false, deniedDegraded: false,
    denialDedup: new DenialDedup(), serverDeniedClick: false,
    deniedToneFloor: deniedToneFloor(),
    ...abilityFeedbackState(),
    audio, portal,
    matchEnded: false, resultsFinal: false, resultsShownAt: Infinity, pendingElimination: false, pendingFounder: false, audioCueState: INITIAL_CUE_STATE, wasInStorm: false,
    hullSoftness: NO_SOFTENING,
    wasHpFrac: null, hpStingFloor: hpStingFloor(),
    prevClickCount: 0, lastTickClick: 0, ownFire: new OwnFireLatch(),
    ownClass: cls, ownHueIndex: null, ownPlated: false, // amber/unresolved until the roster syncs (1.12/1.13)
    ownDecoyUntil: 0,
    ownStats: stats, ownSlots: slotIdsFor(cls, stats, NO_BOONS),
  };
  gRef = g;
  armWorldFlashBudget(g, camera, flashBudget);
  // Coast returns (amendment 69) read the HEIGHT RASTER the client already
  // rebuilt from the map seed — pure presentation, never on the wire. It is the
  // beam march's only terrain input (cycle 62): its land/water truth is the
  // shipped coastline's own mask, and its elevation is what makes a steep
  // headland paint red where a low sandy island of the same size paints blue.
  g.radar.setHeightRaster(map.heightRaster);
  // THE IN-TRUESIGHT WAKE SEAM (Story 4.12). One tracker, two renderings: the
  // emitter owns the ribbons and draws the water, the scope stamps the SAME
  // segments onto the radar lattice for the inner half the server does not
  // disclose (per source: `blipGate`'s annulus for a hull, the 3/8 detect rung
  // for a fish). Read-only here — the radar samples ribbons and never appends.
  //
  // THE ISLANDS RIDE ALONG (cycle-69 review gate, P5) because the synthesis is
  // a STAND-IN for a disclosure the server withholds on BINARY-LOS grounds, so
  // it owes the same binary test the server would have applied. They are the
  // deterministic set rebuilt from the map seed — the same array the predictor
  // and the fog already collide against, never a second geometry.
  g.radar.setWakeSources(g.effects.wakeSources, g.islands);
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
    // The wake tracker needs no class hook: a class change respawns the hull,
    // and `WakeSources` re-provisions a source whose class moved (its ring
    // capacity is derived from that class's top speed).
  }
  if (!classChanged && !visionChanged(prev, stats)) return;
  g.radar.setRanges(stats.sightRange, stats.radarRange, stats.sweepPeriodMs);
  g.camera.setRadarRange(stats.radarRange);
  g.fog.setSightRange(stats.sightRange);
  // ONE plumbed value, TWO dead-reckoning cull rings: shells and our OWN fish
  // cull at truesight, an ENEMY torpedo at the shorter DETECT ring the server
  // reveals and corrects it within (Story 4.9). Projectiles derives the second
  // from this same number — adding a `setDetectRange` here would be a second
  // source of truth. The DAZZLE half rides updateDazzle, like fog and radar.
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
    resetThrottle: () => resetOwnOrders(g),
    resetPrime: () => g.keyboard.revertToGun(),
    // Story 5.2 review fix: the client's mirror of World.respawnEnabled, read
    // off the PUBLIC match phase (the roster schema every client already
    // holds), so an own sinking only sets a respawn deadline the server
    // actually armed. Read live — the phase moves under us.
    respawnArmed: () => respawnArmedIn(publicState(g).matchPhase ?? 'waiting'),
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
 * EVERY HULL THE PLAYER CAN SEE, as the wake layer needs it (amendment 199,
 * Story 4.12).
 *
 * Own predicted pose first (or nothing, spectating), then every contact —
 * captains and drones alike, at the SAME interp-delayed time the hull renderer
 * and the radar's `shipStamp` sample them at, so the foam lands on the hull the
 * player can see rather than ~100ms ahead of it.
 *
 * THERE IS NO DECOY BRANCH HERE AND THERE MUST NOT BE (amendment 201, Eric:
 * *"Decoy will get major changes soon so lets not worry about it for now"*). A
 * decoy is frozen at its drop pose, so it never travels one sample cadence and
 * lays nothing BY CONSTRUCTION. The resulting tell is ledgered, not papered
 * over.
 *
 * Each source carries its own tint, resolved off the SAME roster the hull's
 * silhouette reads (`contactStyle` → drone grey for the 255 sentinel, the
 * personal hue otherwise), so a wake is never a different colour from the ship
 * that made it.
 *
 * AND EVERY LIVE TORPEDO IS A SOURCE TOO (cycle-69 review gate, P10). A fish's
 * trail used to be a private one-shot dot chain inside `Projectiles` at 0.7s
 * while the same fish's radar ribbon ran 6s — the length fork amendment 204
 * forbids. It joins the ONE tracker here, so the water and the scope draw the
 * same geometry at the same life, and the client synthesizes its in-detect half
 * exactly as it synthesizes a hull's in-sight half.
 */
function wakeHulls(g: Game, pose: RenderPose | null, now: number): WakeHull[] {
  const out: WakeHull[] = g.projectiles.torpWakeHulls(now);
  if (pose !== null) {
    const own = g.ownStats;
    out.push({
      id: g.state.net.sessionId,
      x: pose.x, y: pose.y, heading: pose.heading, speed: pose.speed,
      cls: g.ownClass,
      color: hullStyle(g.ownHueIndex).stroke,
      // Mirrors the server's `World.wakeTopSpeed` so the two ring buffers are
      // provisioned alike; a boost card lengthens both or neither.
      maxSpeedU: own.kinematics.maxSpeed + own.boost.speedBonus,
    });
  }
  const at = now - CLIENT_CONFIG.net.interpDelayMs;
  for (const id of g.contacts.ids()) {
    const s = g.contacts.get(id)?.sampleAt(at);
    const cls = g.contacts.classOf(id);
    if (s === null || s === undefined || cls === undefined) continue;
    out.push({
      id, x: s.x, y: s.y, heading: s.heading, speed: s.speed, cls,
      color: contactStyle(cls, rosterColor(g, id)).stroke,
    });
  }
  return out;
}

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
  // THE OWN HULL'S SETTLE (Story 5.2 fix, Eric ruling 2026-08-13) — the same
  // ramp every enemy hull now runs, CAPPED (render/sinkSettle.ts `ownSettle`).
  //
  // It used to be `setDowned(!status.alive)`: a SNAP to the full wreck look on
  // the sink-entry tick, argued at the time as "the dying captain's honest read
  // on their last five seconds". Two things are wrong with that, and both are
  // why this line moved. Coherence is the smaller one — every other hull in the
  // game now walks continuously from alive to wreck across the window, and ours
  // was the only one that stepped. The larger one is a straight legibility
  // defect: `sunkTint` (DESIGN.md's dark crimson) has ZERO green and blue in
  // it and a Pixi tint
  // MULTIPLIES, so a cyan, lime or spring captain spent the entire window
  // steering a black silhouette at 0.4 alpha across a black ocean — on the hull
  // they are still aiming, still steering and still shooting with.
  //
  // So the own ramp is capped at `CLIENT_CONFIG.ship.ownSettleMax`: enough to
  // read "this hull is going down" without ever costing the player the ship
  // they are fighting from. DESIGN.md's ratified sinking mock (F1 of
  // mockups/death-reveal-results-1.html) draws the own hull at FULL personal
  // hue during the window and carries the death on the HP rail, the banner and
  // the sink rings, so even the capped ramp is a departure TOWARD the enemy
  // grammar — the cap may shrink, never grow.
  g.ownView.setSink(ownSettle(g.state.net.you, g.clock.serverNow()));
  g.ownView.update(pose.x, pose.y, pose.heading);
  g.camera.update(frameDt, pose);
  updateOwnPlate(g, pose); // own callsign plate above the hull (post camera update)
  // EVERY VISIBLE HULL LAYS A WAKE (amendment 199) — own predicted pose plus
  // every truesight contact, drones included. Before Story 4.12 this passed the
  // own pose alone and enemy hulls glided across the water leaving nothing.
  g.effects.update(frameDt, now, wakeHulls(g, pose, now));
  g.lastOwn = { x: pose.x, y: pose.y };
  const cursor = g.camera.screenToWorld(g.mouse.screenPos);
  const aim = worldAim(pose.x, pose.y, cursor);
  renderFiring(g, pose, status, aim, cursor, nowMs);
  // ONE attention read per frame, taken AFTER renderFiring drove the denied
  // pulses and shared by every consumer (the chrome bar's amber ring segment and
  // the HP rail here, the storm vignette back in renderAlive, the XP bank chip
  // below): two reads — or one taken before the pulses were driven — could
  // disagree inside a single frame.
  const attn = frameAttention(g, status, inStorm, bar.ring.urgent, nowMs);
  bar.tier1 = attn.tier1;
  // `now / 1000` — the server-clock estimate in SECONDS, the same clock the
  // storm vignette's pulse rides (the HP rail breathes on it).
  g.hud.update(pose, g.keyboard.axes(), status, inStorm, bar, match, hudWidth(g), hudHeight(g), now / 1000);
  updateHotbar(g, status, nowMs);
  // TIER 3: the bank chip freezes at its dim keyframe under ANY higher tier —
  // Tier 2 alone included, so a healthy hull sailing in the storm settles it
  // (amendment 243). `nowMs` is the frame's monotonic clock, for the ease.
  //
  // STILL `status.alive`, DELIBERATELY (Story 5.2, amendment 10): the XP rail
  // is an ECONOMY surface — banked levels you could spend — and the economy is
  // exactly what a sinking captain loses ("once sinking, you're done"). It
  // closes with the refit at sink-entry rather than lingering as an affordance
  // that leads nowhere. `alive` is already false through the window, so this
  // line needs no change; it is called out because it looks like an omission.
  updateXpRail(g, status.alive, now / 1000, attn.freeze, nowMs);
  return attn.tier1;
}

/**
 * The economy satellites (Story 2.6): fed VERBATIM from the server's own-ship
 * fields — `lvl`/`xp`/`pts` are self-private and server-authoritative, and
 * nothing here predicts or interpolates them. Shown on exactly the hotbar's
 * terms: alive, in-match, with a live `you` (death / spectate / the forceSnap
 * pose gap hide it, so the satellites never describe a hull that is gone).
 */
function updateXpRail(g: Game, alive: boolean, nowSec: number, freeze: boolean, nowMs: number): void {
  const you = g.state.net.you;
  if (!alive || !you || g.state.spectating) {
    g.xpRail.hide();
    return;
  }
  // `refitable` mirrors offerView's own gate: a banked level whose front offer
  // is empty (degenerate exhausted deck) cannot open the band, so the cue must
  // not tell the player to press TAB (the chip still reports the bank).
  const view: XpView = { lvl: you.lvl, xp: you.xp, pts: you.pts, refitable: you.offer.length > 0 };
  g.xpRail.update(view, hudHeight(g), nowSec, freeze, nowMs);
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
 * The BUDGET VERDICT for each of those denied chips, in the same shape and off
 * the same two sources — so the flag can never describe a different pulse than
 * the flash beside it. A weapon-click denial lights BOTH the on-water arc and
 * the primed slot's chip; the arc's mark is already its own flat, never-motion-
 * gated form, so the chip is where that element's `'degrade'` verdict is
 * actually visible (bloom dropped, border and icon untouched).
 */
function hotbarDeniedDegraded(g: Game, status: OwnStatus): boolean[] {
  return g.abilityDegraded.map((degraded, slot) => {
    const id = status.loadout[slot] ?? null;
    const isWeapon = id !== null && EQUIPMENT_IS_WEAPON[id];
    return degraded || (isWeapon && slot === status.primedSlot && g.deniedDegraded);
  });
}

/**
 * The hotbar renders while the player is CONNING a hull in-match (the
 * weapons-safe waiting room included, and — Story 5.2 — the whole sinking
 * window: amendment 10 keeps every fitted slot activatable all the way down, so
 * the surface those slots live on has to stay on screen). It dies with the hull
 * at FOUNDER (spectate / reveal) and on return to port. Called after
 * renderFiring so this frame's denied pulse is resolved.
 */
function updateHotbar(g: Game, status: OwnStatus, nowMs: number): void {
  if (!conning(status)) {
    g.hotbar.hide();
    return;
  }
  const view: HotbarView = {
    loadout: status.loadout,
    ammo: status.ammo,
    stats: status.stats,
    primedSlot: status.primedSlot,
    denied: hotbarDenied(g, status),
    deniedDegraded: hotbarDeniedDegraded(g, status),
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
    fitFrameDegraded: g.fitFrameDegraded,
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
/**
 * ONE chrome one-shot's claim against the aggregate flash budget (Story 4.8,
 * amendment 240), latched for the flash's whole life.
 *
 * The claim happens at the ONSET and nowhere else — `DeniedPulse.onsetAt` is the
 * read-only report of the frame `update()` accepted a trigger on — because the
 * budget counts onsets: claiming per lit frame would charge one 80ms flash five
 * times over and hold the window permanently full, starving the very animations
 * it exists to protect. The verdict then rides the rest of the flash unchanged,
 * so a mark can never switch form halfway through its own life.
 */
function claimPulseFlash(g: Game, key: string, pulse: DeniedPulse, live: boolean, nowMs: number, was: boolean): boolean {
  if (!live) return false; // no flash on screen, nothing to degrade
  if (!pulse.onsetAt(nowMs)) return was; // mid-life: carry the onset's verdict
  return g.flashBudget.claim(key, nowMs) === 'degrade';
}

/**
 * Drive every per-slot one-shot pulse for this frame, and claim the ones the
 * ratified floor scopes as ELEMENTS (render/flashBudget.ts FLASH_ELEMENTS).
 *
 * Deliberately OUTSIDE renderFiring's alive gate: a dead press is denied too and
 * must still pulse, and a spend is legal while dead (the hotbar is simply hidden
 * there). The ACTIVATED pop and the per-slot FIT pulse are NOT claimed — the
 * story's element list names the denied pulses, the hotbar frame and the zone
 * reveal, and inventing budget membership for a channel is exactly the kind of
 * unratified widening the tier/budget split forbids.
 */
function drivePulses(g: Game, nowMs: number): void {
  for (let s = 0; s < g.abilityPulse.length; s++) {
    // Ability denied pulse (Story 1.6): consume each slot's one-shot press latch
    // into its rate-limited pulse (per-slot since Story 1.8 — the ML fits two
    // ability slots). Chips-only feedback, never fed into the weapon-arc/reticle
    // denied visuals (nothing is aimed).
    g.abilityFlash[s] = g.abilityPulse[s].update(g.abilityDeniedPress[s], nowMs);
    g.abilityDeniedPress[s] = false;
    g.abilityDegraded[s] = claimPulseFlash(g, hotbarSlotKey(s), g.abilityPulse[s], g.abilityFlash[s], nowMs, g.abilityDegraded[s]);
    // The ACTIVATED pop rides the identical register (Story 2.2).
    g.activatedFlash[s] = g.activatedPulse[s].update(g.abilityActivatedPress[s], nowMs);
    g.abilityActivatedPress[s] = false;
    // ...and so does the FIT flash (Story 2.9): the boon landing on this slot's
    // family.
    g.fitFlash[s] = g.fitPulse[s].update(g.fitPress[s], nowMs);
    g.fitPress[s] = false;
  }
  g.fitFrameFlash = g.fitFramePulse.update(g.fitFramePress, nowMs);
  g.fitFramePress = false;
  g.fitFrameDegraded = claimPulseFlash(
    g, FLASH_ELEMENTS.hotbarFrame, g.fitFramePulse, g.fitFrameFlash, nowMs, g.fitFrameDegraded,
  );
}

function renderFiring(g: Game, pose: RenderPose, status: OwnStatus, aim: number, cursor: { x: number; y: number }, nowMs: number): void {
  const clicked = g.mouse.clickCount !== g.prevClickCount;
  g.prevClickCount = g.mouse.clickCount;
  drivePulses(g, nowMs);
  // Story 5.2: the arc, the reticle and the aim preview survive the sinking
  // window — you cannot go down shooting without being able to aim. They tear
  // down at FOUNDER, which is where `conning` goes false.
  if (!conning(status)) {
    g.firing.hide();
    g.aimPreview.hide();
    g.deniedFlash = false;
    g.deniedDegraded = false; // no flash on screen, so no verdict to carry
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
  // The on-water arc/marker is its OWN element (FLASH_ELEMENTS.deniedArc), never
  // pooled with the hotbar slots: one surface flashing is one element's budget.
  g.deniedDegraded = claimPulseFlash(
    g, FLASH_ELEMENTS.deniedArc, g.deniedPulse, g.deniedFlash, nowMs, g.deniedDegraded,
  );
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
    // Story 5.2: WIDENED through the sinking window — a click from a sinking
    // hull genuinely fires (the server's gate re-opens for it), so it must also
    // consume the prime and latch the own-fire correlation, exactly as an alive
    // click does. Left un-widened, a sinking captain's torpedo would fire while
    // the client kept the prime armed and mis-attributed the reveal.
    alive: conningNow(g) ?? false,
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
    playDenied(g);
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
  // serverDeniedClick on a dead frame, so play the whole path only while there
  // is still an arc on screen to pulse (otherwise the tone + chip latch fire
  // with no matching visual). Story 5.2 widens that to the sinking window,
  // where the arc, the reticle and the hotbar are all still rendering — and
  // where a denial (an empty pool, an out-of-arc torpedo) is now routine.
  if (conningNow(g) === false) return;
  if (!g.denialDedup.serverDenied(d.slot, d.seq)) return; // predicted echo — already fed back
  playDenied(g);
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
  // THE PROJECTILE CULL RINGS TAKE IT TOO (review fix). The server reveals and
  // corrects ballistics inside `sightOf(me, now)` — dazzle-scaled — so a client
  // holding the un-dazzled ring would go on dead-reckoning a shell or an enemy
  // fish the server had already stopped correcting. Set UNCONDITIONALLY and
  // before the fog's changed-flag early-return, for the same reason the radar
  // is: that flag guards the expensive rebake and nothing else.
  g.projectiles.setDazzled(dazzled);
  if (!g.fog.setDazzled(dazzled)) return;
  g.fog.rebake(g.stage.app.screen.width, g.stage.app.screen.height, g.camera.zoom);
}

/**
 * THIS FRAME'S HULL FEATHER (this cycle) — the spatial alpha multiplier a
 * contact hull wears, now that hulls render ABOVE the fog composite and no longer
 * inherit its feathered sight hole (render/stage.ts).
 *
 * IT IS THE FOG'S OWN GEOMETRY, READ OFF THE FOG'S OWN NUMBERS. The radius is
 * `radar.sightHoleU` — i.e. `fogHoleRadiusU`, the very radius the hole is baked
 * at and the same one the server's `sightOf` gates contacts with — so a dazzle
 * burst tightens the hull feather on the same frame it tightens the fog. And an
 * owned star-shell zone is EXEMPT for exactly the reason it punches a fog hole
 * (`ownZoneFogHoles`, one line down): the server grants truesight parity inside
 * it, so a hull revealed there is fully seen and must draw fully — feathering it
 * against a bubble it is nowhere near would dim the whole point of the flare.
 * The zone's own dying fade scales its radius, the same closing circle the fog
 * hole uses.
 *
 * With no own pose (the forceSnap gap) there is no observer to feather against,
 * so hulls draw at full strength — the direction every unwired path here fails.
 */
function hullSoftnessFor(g: Game, pose: Point | null, zones: readonly OwnZone[], now: number): HullSoftness {
  if (!pose) return NO_SOFTENING;
  const sightU = g.radar.sightHoleU;
  return (x, y) => {
    for (const z of zones) {
      const r = z.r * litZoneFade(z.until - now);
      if ((x - z.x) ** 2 + (y - z.y) ** 2 <= r * r) return 1;
    }
    return hullSightSoftness(Math.hypot(x - pose.x, y - pose.y), sightU);
  };
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
    // The reveal beat's 80ms one-shot claims FLASH_ELEMENTS.zoneReveal against
    // the aggregate budget (Story 4.8). It fires once per ring identity behind a
    // 300ms floor, so this can never realistically bind — it is the guarantee
    // stated in code, not a filter the channel needs.
    flash: g.flashBudget,
  });
}

/**
 * THE BAND STINGS (Story 4.7): the own hull crossing `CONFIG.damageBands`
 * downward — 50% and 25% — gets a one-shot alarm. The fraction and the cue id
 * are both decided by the pure helpers in audio/hpSting.ts (`ownHpFrac`,
 * `hpStingCue`, themselves built on `hpBandEdge` in audio/tones.ts, which owns
 * the downward-only / re-arming / worse-one-only rules and reads the
 * thresholds straight out of shared CONFIG) — extracted there so the wiring
 * itself is covered by a test, not just the edge math (amendment 60).
 *
 * IT LIVES IN main.ts AND NOWHERE ELSE because this is the only place that holds
 * BOTH numbers: net/roomBindings.ts sees `you.hp` but has no `maxHp` seam —
 * `maxHp` is an effectiveStats() output, swapped wholesale whenever a boon
 * lands. The shape is the `stormEnterEdge` idiom two lines up: previous value on
 * `g`, edge function, cue.
 *
 * NO PAN AND NO GAIN, deliberately (amendment 55, the foghorn's own honk): these
 * are SELF cues, and a bearing to yourself is meaningless. Only the world cues
 * in net/roomBindings.ts are ever placed.
 *
 * The sting is also wounded smoke's voice — the smoke tiers and the rail bands
 * are the SAME two thresholds, so the moment a band is crossed IS the moment
 * your plume starts (spec design note; amendment 49's parked question, answered
 * without inventing a continuous-audio class).
 *
 * IT IS FLOORED like every world cue (review gate): an edge is not a bound while
 * DAMAGE CONTROL regen and incoming fire trade a hull back and forth across a
 * threshold. `nowMs` is the frame's ONE timestamp, the same instant every other
 * cue in this frame is measured against. The remembered fraction is stored
 * whether or not the cue was voiced — a refused sting is silent, never deferred
 * (audio/hpSting.ts spells out why, and what the owner still has to rule on).
 */
function playHpSting(g: Game, status: OwnStatus, nowMs: number): void {
  const frac = ownHpFrac(status);
  const cue = hpStingCueAt(g.wasHpFrac, frac, nowMs, g.hpStingFloor);
  if (cue) g.audio.play(cue);
  g.wasHpFrac = frac;
}

/**
 * ANY denied-fire pulse is live this frame — the on-water arc pulse OR any of
 * the per-slot hotbar pulses.
 *
 * The tier table says *"denied pulses"*, PLURAL, and until Story 4.8 only the
 * on-water one reached the seam: an ability denied on a hotbar slot flashed a
 * threat-register mark while the storm vignette and the ring segment carried on
 * breathing underneath it. The OR happens HERE because `Tier1Input.deniedLive`
 * is one boolean by design — the tier question is "is a threat channel
 * animating", never "which one".
 *
 * Every read is `liveAt`, the READ-ONLY liveness: asking must not be able to
 * trigger or extend a pulse, which is exactly why that method exists.
 */
function anyDeniedLive(g: Game, nowMs: number): boolean {
  if (g.deniedPulse.liveAt(nowMs)) return true;
  return g.abilityPulse.some((p) => p.liveAt(nowMs));
}

/** Tier-1 (THREAT) channels as this story knows them (amendments 16 + 239): the
 *  HP rail's CRIMSON-band pulse and any live denied-fire pulse.
 *  render/attention.ts owns the composition; this only resolves the own-ship
 *  inputs. `nowMs` is the frame's ONE timestamp — the same instant renderFiring
 *  drove the denied pulses with, so the hold can never read a pulse the visible
 *  flash has already ended (or miss one it just started).
 *
 *  NULL IS NOT ZERO: with no hull (no maxHp — spectate, the respawn gap) the HP
 *  input is `null`, never 0, or a missing hull would pin every Tier-2 channel
 *  lit and freeze the Tier-3 chip for the rest of the match. The fraction itself
 *  comes from the rail's own `railFraction`, so the seam and the band the player
 *  sees are the same number. */
function ownTier1(g: Game, status: OwnStatus, nowMs: number): boolean {
  const maxHp = status.stats.maxHp;
  return tier1Active({
    hpFrac: maxHp > 0 ? railFraction(status.hp, maxHp) : null,
    deniedLive: anyDeniedLive(g, nowMs),
  });
}

/** This frame's whole attention state (render/attention.ts's tier table). */
interface AttentionFrame {
  /** A THREAT channel is animating — both Tier-2 channels hold at their lit
   *  keyframe while it is. */
  tier1: boolean;
  /** A MATCH channel is animating (in-storm vignette / final-10s ring). */
  tier2: boolean;
  /** Tier 3 (the XP bank chip) freezes at its DIM keyframe — under Tier 2 ALONE
   *  as well as under Tier 1 (amendment 243's literal reading of the table). */
  freeze: boolean;
}

/**
 * THE frame's tier read, taken ONCE and shared by every consumer.
 *
 * It must be taken AFTER renderFiring has driven the denied pulses (see
 * renderOwn): a read taken before them would miss a pulse born this frame and
 * lie to both Tier-2 channels for a frame. `ringUrgent` comes off the chrome
 * bar's own readout rather than a second countdown derivation, so the segment
 * that pulses and the tier that says a match channel is animating can never
 * disagree.
 */
function frameAttention(g: Game, status: OwnStatus, inStorm: boolean, ringUrgent: boolean, nowMs: number): AttentionFrame {
  const tier1 = ownTier1(g, status, nowMs);
  const tier2 = tier2Active({ inStorm, ringUrgent });
  return { tier1, tier2, freeze: freezeAtDimKeyframe(tier1, tier2) };
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
  // The 50%/25% band alarms (Story 4.7) — same edge idiom. The two HP-driven
  // channels here are deliberately NOT symmetric through the sinking window
  // (Story 5.2), and the difference is not a choice — it falls out of what each
  // one reads:
  //   • THE STING IS SILENT for the whole window, because `ownHpFrac` returns
  //     NULL unless `status.alive`, and `alive` is false from sink-entry
  //     (amendment 11). It cannot even fire on the KILLING BLOW: that frame is
  //     already the first `alive: false` one, so the fraction is null before any
  //     band could be crossed, and `hpBandEdge` reports nothing against a null.
  //     (An earlier version of this comment ledgered a sting alongside the
  //     `sink` tone as an accepted consequence. It cannot happen — corrected at
  //     the review gate.)
  //   • THE TIER-1 LOW-RAIL PULSE DOES run, for the whole five seconds, holding
  //     both Tier-2 channels at their lit keyframe — `ownTier1` reads
  //     `status.hp` against `maxHp` with no `alive` gate at all, so a hull at 0
  //     reads as mortally damaged, which is the honest read and not a bug.
  // Both stop at founder, where renderSpectate resets the edge to null.
  playHpSting(g, status, nowMs);
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
  // AHEAD OF THE RADAR ON PURPOSE (amendment 89): the seam between the radar's
  // two ship-paint sources and the fog hole are one radius, and the radar reads
  // it during render() — so a dazzle flip adopted after this line would leave
  // the scope one frame behind the fog and the server, which is the
  // disagreement that radius exists to prevent. Camera zoom (which the fog
  // rebake reads) was updated in renderOwn.
  updateDazzle(g, now);
  // AND AHEAD OF THE PROJECTILES, for the same reason (review fix): their two
  // ENEMY cull rings are dazzle-scaled, so a render taken before the flip was
  // adopted would cull against the PREVIOUS frame's rings while the fog and the
  // radar had already moved. Own pose feeds the cull; own active zones keep a
  // shell revealed by our flare from being culled (exactly-once — Story 1.7).
  g.projectiles.render(now, pose ?? undefined, ownZones);
  // The contact store is the radar's SECOND source of ship paints (amendment
  // 89): a hull inside truesight is delivered as a `Contact` and never as a
  // blip, so the scope synthesizes its echo from that store when the beam
  // crosses it. Read-only here — the radar samples poses, nothing more.
  // The fourth argument is the camera's world rect (amendment 96): the heatmap
  // buffer is sized and centred on WHAT IS ON SCREEN, so a paint can never be
  // clipped by a ring-sized box around the ship. It reaches the buffer extent
  // and nothing else — no paint is created, retired or culled by it — which is
  // what makes a paint recorded while zoomed in appear when you zoom out.
  // There is no fifth argument any more. It used to be the live zone view, which
  // the radar read to paint the storm's closing wall as a volume return; cycle 72
  // deleted that material on Eric's ruling (*"I don't want the storm ring
  // highlighted by radar anymore"*). The storm is still fully legible on the water
  // — updateZone below draws the solid live edge, the dashed telegraph and the
  // storm-side fill — it simply stops returning an echo.
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
  // ...and the hulls, which now render ABOVE that fog, carry its feather
  // themselves. Built from the SAME pose, the same effective sight radius and the
  // same owned zones the two lines above use, so the two surfaces cannot disagree
  // about where the bubble ends.
  g.hullSoftness = hullSoftnessFor(g, pose, ownZones, now);
}

// --- spectate rendering ----------------------------------------------------------

/**
 * One-time visual switch into spectate — and, since Story 5.3, THE OMNISCIENT
 * REVEAL ITSELF. The fog comes off, the sweep and blips go, the combat surfaces
 * die with the hull, and the camera pulls back to frame the whole ocean.
 *
 * THE FOG IS HIDDEN, NEVER FADED (amendment 24's `Never` clause): `plateRoot`
 * sits BELOW `fogSprite` while hulls sit above it in `chartRoot` (epic-5
 * amendment 22 — "a label is not a mark"), so a fade would dim every nameplate
 * on the water while leaving the hulls they label at full brightness.
 *
 * YOUR OWN WRECK STAYS ON SCREEN — BUT ONLY IF YOU ACTUALLY SANK. It used to be
 * hidden here unconditionally, which was defensible when the reveal was a
 * curtain nobody saw through; mockup F2/F3 draw the wreck marking the water
 * where you went down, with your callsign on it, and under amendment 24 the
 * reveal is the backdrop the results modal sits over. `net.you` is never
 * cleared on death, so the last pose is still in hand, and the wreck's LOOK is
 * already right: amendment 21's settle holds it at `ownSettleMax` with readable
 * colour rather than completing to the black-silhouette wreck tint.
 *
 * THE WINNER IS THE CASE THAT MAKES THIS CONDITIONAL (review finding). Everyone
 * spectates at `phase === 'finished'`, the winner included — and an AFLOAT hull
 * reaches its own client as an ordinary spectator CONTACT (`signals.ts`'s
 * spectator branch precedes the self-exclusion). So a winner who kept `ownView`
 * visible would render TWO copies of their own ship: the frozen predicted one
 * and the live interpolated one, visibly diverging for the whole results
 * period. Only a hull that is genuinely gone is absent from the contact set and
 * therefore needs drawing itself. `=== false` rather than `!alive` on purpose:
 * a missing `you` must read as afloat here, never as a wreck (main.ts's
 * standing `alive ?? true` trap).
 */
function enterSpectateVisuals(g: Game): void {
  if (g.spectate.visualsSet) return;
  g.spectate.visualsSet = true;
  const wrecked = g.state.net.you?.alive === false;
  g.fog.setVisible(false);
  g.radar.clearBlips();
  if (!wrecked) {
    g.ownView.gfx.visible = false;
    g.nameplates.hide(g.state.net.sessionId);
  }
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
  // THE REVEAL FRAMING (Story 5.3, amendment 25). Ordered AFTER resetUserZoom
  // deliberately: that call clears the alive user zoom and must not cancel the
  // reveal target set here. The framing is derived from the live map radius and
  // radar range, never a literal, so Story 6.2's roster-dynamic map sizing moves
  // it automatically. It is exempt from the spectate clamp; the first manual
  // wheel or pan releases it back to the clamped [0.5, 1] path.
  g.camera.beginReveal(g.mapRadius, CLIENT_CONFIG.reveal.mapFitMargin, CLIENT_CONFIG.reveal.zoomRate);
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

/**
 * THE REVEAL FRAMES THE OCEAN, WHICH MEANS THE CENTRE MOVES TOO (review
 * finding). `beginReveal` sets a zoom FACTOR and nothing else, so on its own the
 * camera pulled back while still trailing your killer — and a killer even a few
 * hundred units off-centre cropped a slice of the map straight off the screen,
 * which is not "the whole ocean" by any reading of the AC or mockup F2. The map
 * disc is centred on the origin by construction (`sim/map.ts` spans
 * [-radius, +radius] on both axes), so the reveal's centre target is (0, 0).
 *
 * It EASES on the same exponential the follow uses rather than snapping, so the
 * pull-back and the drift to centre are one motion; at `motion: off` the camera
 * arrives immediately, matching the zoom's own snap (amendment 26 — the setting
 * costs the travel, never the framing). Releasing the reveal (any manual wheel
 * or pan) hands the centre straight back to follow-your-killer.
 */
function updateRevealCamera(g: Game, frameDt: number): void {
  // speed 0 is load-bearing, not filler: the camera's forward LEAD is derived
  // from the followed target's speed, and any lead would push the map disc
  // off-centre — the exact thing this function exists to prevent.
  const center = { x: 0, y: 0, heading: 0, speed: 0 };
  if (motionIntensity(settings.current.motion) <= 0) {
    g.camera.snapTo(center);
    return;
  }
  g.camera.update(frameDt, center);
}

/** Follow-your-killer by default; any WASD press hands the camera to free pan. */
function updateSpectateCamera(g: Game, frameDt: number, now: number): void {
  // Spectate pan reads the HELD WASD state (panAxes), not the driving axes():
  // its "throttle" is live W/S for up/down panning, not the (reset) telegraph order.
  //
  // FREE-PAN IS TESTED BEFORE THE REVEAL, NOT AFTER. Taking the camera by hand
  // is exactly what releases the reveal (amendment 25), so a WASD press has to
  // reach `camera.pan` — which is what clears the target. Gating the reveal
  // first would have made the mode unreleasable by keyboard: the wheel would
  // still escape it (its own listener calls setZoomFactor) but WASD never would.
  const axes = g.keyboard.panAxes();
  if (shouldEngageFreePan(axes)) g.spectate.freePan = true;
  // Otherwise the reveal owns the camera while it is live — centre included.
  if (!g.spectate.freePan && g.camera.revealing) return updateRevealCamera(g, frameDt);
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
  // A spectator has no hull and no bubble, and the fog overlay is off entirely
  // here — so there is no feather to mirror and every hull draws at full
  // strength, exactly as it did before hulls moved above the fog.
  g.hullSoftness = NO_SOFTENING;
  // No hull, so no band edge exists to be crossed (Story 4.7): dropping the
  // remembered fraction to null keeps a death from reading as a crossing into
  // critical, and re-arms both stings for the next life for free.
  g.wasHpFrac = null;
  updateSpectateCamera(g, frameDt, now);
  // THE REVEAL'S PULL-BACK (Story 5.3, amendments 25/26). Driven after the
  // spectate camera so a manual pan in the same frame releases the target
  // before it eases. The motion INTENSITY is passed in rather than read inside
  // camera.ts, which stays pure math: `full` travels, `reduced` halves the
  // duration, `off` arrives on this frame at the identical framing.
  g.camera.tickZoom(frameDt * 1000, motionIntensity(settings.current.motion));
  // THE WRECK'S PLATE MUST BE RE-PROJECTED EVERY FRAME (review finding).
  // Nameplates are SCREEN-space (`plateRoot` is not camera-transformed), and the
  // own plate is placed only by updateOwnPlate inside renderOwn — which does not
  // run here. The wreck's HULL is world-space and stays put on its own, but a
  // plate left unplaced would freeze at the pixels it occupied on the last alive
  // frame and then drift free of the wreck as the reveal zooms out and the
  // camera eases away — a callsign floating over open water. Placed AFTER the
  // camera work, exactly as renderOwn orders it, so the projection matches.
  const wreck = ownWreckPose(g);
  if (wreck) updateOwnPlate(g, wreck);
  // A spectator is never IN the storm and owns no Tier-1 channel (no hull, no
  // fire control) — the plane renders, the vignette does not.
  updateZone(g, zv, false, false, now, nowMs);
  g.projectiles.render(now); // no sight cull: spec frames are unfogged
  // A SPECTATOR HAS NO HULL BUT SEES EVERY OTHER ONE, and spec frames are
  // unfogged — so the water keeps working exactly as it does alive (amendment
  // 199 is about visible hulls, and from here they all are).
  g.effects.update(frameDt, now, wakeHulls(g, null, now));
  // Hides the sweep + rings. The zone view rides along for consistency with the
  // alive path, and paints nothing either way: with no own pose there is no
  // observer to freeze a paint against, so no source opens (Story 4.10).
  g.radar.render(null, now, null, null);
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
      // the keyboard drives the spectator camera instead. KEYED ON
      // `spectating`, WHICH IS WHY THIS LINE NEEDED NO CHANGE FOR STORY 5.2: a
      // sinking captain is emphatically not spectating (frames.ts's
      // `spectates()` is `isSunk`-based, so the window stays fogged and keeps
      // `you`), so helm, aim and trigger keep riding the wire all the way down.
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
      updateBounty(g); // the throne's claim register + the self toast/tone (4.6)
      updateEliminationUx(g); // converge the placement, then open a deferred modal at founder
      updateMatchAudioCues(g, now);
      advanceCameraFrame(g, frameDt);
      updateOwnColor(g); // recolor own hull/wake once the roster hue syncs (Story 1.12)
      // THE WAKE STORE MUST NOT CROSS A VISIBILITY REGIME (Story 4.12,
      // cycle-69 review gate P11): a spectator's frames are UNFOGGED, so every
      // ribbon laid while dead was observed with no sight bubble and no island
      // LOS. Ahead of the dispatch, so the first frame of either regime already
      // has a clean store. See Effects.setSpectating.
      g.effects.setSpectating(g.state.spectating);
      if (g.state.spectating) renderSpectate(g, frameDt, now, nowMs, zv, mu);
      else renderAlive(g, alpha, frameDt, now, nowMs, zv, mu);
      syncRefitBand(g);
      g.contactViews.render(
        g.contacts,
        now - CLIENT_CONFIG.net.interpDelayMs,
        now,
        frameDt * 1000,
        (id) => rosterColor(g, id), // Story 1.12: per-contact personal hue
        // `plateFrame` — Story 1.13: per-contact truesight nameplate (hoisted,
        // reused). `hullSoftness` — this frame's sight-boundary feather, set by
        // whichever of the two renderers above just ran (this cycle: hulls draw
        // ABOVE the fog now, so they carry its feather themselves). Kept on one
        // line so this callback stays inside its line budget.
        plateFrame, g.hullSoftness,
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
 * needs. CONNING-ONLY (canUserZoom): inert while spectating (the spectate wheel
 * path below owns zoom there), while sunk-awaiting-respawn, AND before the
 * first frame ever lands (no `you` yet = not conning). Client-render-only — fog
 * visibility stays server-authoritative, so zoom is never an information
 * exploit (the fog hole scales with the zoom; what is revealed does not).
 *
 * Story 5.2 widens it through the sinking window: framing is part of aiming,
 * and a captain fighting their last five seconds must not have the camera go
 * rigid under them. It costs nothing on the anti-cheat side for the same reason
 * it never did — zoom reveals no water the server has not already sent.
 */
function applyUserZoom(g: Game, next: number): void {
  if (!canUserZoom(g.state.spectating, conningNow(g))) return;
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
      // A WHEEL AIMED AT THE RESULTS MODAL IS NOT A CAMERA INTENT (review
      // finding). The modal is a scrollable panel and Story 5.3 made it taller
      // — match log, boons, last offer — so scrolling it is now an ordinary
      // action. This listener is on `window`, so every one of those ticks also
      // drove the spectate zoom behind it, which CLEARS the reveal target and
      // pops the backdrop from the whole-map framing to the clamp floor. It was
      // near-invisible before (the dim was almost opaque and the zoom stayed
      // inside [0.5, 1]); against the 0.62 dim it destroys the reveal by
      // reading a scroll as a zoom.
      if (resultsVisible()) return;
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

/**
 * Was the dev-only staged worst-case scene asked for (`?stage=worstcase`)?
 *
 * The opt-in is EXPLICIT and the gate is DOUBLE: this predicate only ever runs
 * inside an `import.meta.env.DEV` branch, which Vite folds to `false` in a
 * production build — so the query parameter is not merely ignored in
 * production, the code that reads it is not shipped. Same posture as the
 * server's `HC_DEV_OPTIONS`: a production client cannot reach it at all.
 */
function stagedSceneRequested(): boolean {
  try {
    return new URLSearchParams(location.search).get('stage') === 'worstcase';
  } catch {
    return false; // a hostile/absent location must never break boot
  }
}

/**
 * Boot the dev-only staged worst-case scene (Story 4.8, amendment 242) — the
 * readability gate's capture subject.
 *
 * DEAD-STRIPPED FROM PRODUCTION: the sole call site sits inside an
 * `import.meta.env.DEV` branch, which Vite substitutes with `false` before
 * Rollup runs, so the branch, this function's dynamic import, and the whole
 * `src/stage/*` module graph behind it are eliminated. Verified by grepping the
 * built assets for `STAGE_MARKER` (client/scripts/readabilityCapture.mjs
 * --verify-bundle).
 *
 * The scene runs the REAL game — `buildGame` against a staged connection —
 * because a gate that measured a mock would prove nothing about the shipped
 * arbitration.
 */
async function startStagedScene(
  stage: Stage,
  audio: Audio,
  portal: PortalAdapter,
  settingsOverlay: SettingsOverlay,
): Promise<void> {
  const { runWorstCaseScene } = await import('./stage/worstCase.js');
  runWorstCaseScene({
    stage,
    start: (conn, map, cls) => {
      const g = buildGame(stage, conn, map, audio, cls, portal, settingsOverlay);
      gameRef = g;
      bindResize(stage, g);
      return { callbacks: makeCallbacks(g), camera: g.camera, fog: g.fog, effects: g.effects };
    },
  });
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

  // THE READABILITY GATE's staged worst-case scene (Story 4.8, amendment 242).
  // DEV ONLY, and dead-stripped from a production build (see startStagedScene).
  if (import.meta.env.DEV && stagedSceneRequested()) {
    stopAmbient(); // the staged scene owns worldRoot; the CIC ambient must not fight it
    await startStagedScene(stage, audio, portal, settingsOverlay);
    return; // no home, no connection — the staged scene is the whole page
  }

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
