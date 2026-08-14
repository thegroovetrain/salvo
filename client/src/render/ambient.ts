// THE HOME SCENE — Pixi wiring shell (cycle 82, rebuilding Story 1.14 / UX-DR25).
//
// The pre-join canvas is never blank (EXPERIENCE.md: *"home renders over a live
// ambient CIC canvas"*), and since this cycle what it renders is A REAL SLICE OF
// THE GAME rather than a picture of one. Every system below is the SHIPPED one,
// called through its public API and composed directly:
//
//   • the ocean and its islands   — `generateMap` + `render/map.ts` (the ratified
//     hypsometric terrain ramp; no ellipse stand-ins, no viewport fractions);
//   • the scope                    — the real `Radar` in `return` grammar, with the
//     height raster wired (so terrain SHADOWS the returns) and the client's own
//     wake sources wired (so tracks paint);
//   • the hulls                    — real `ShipView` silhouettes on real `stepShip`
//     kinematics, laying real wake through `WakeSources`/`Effects`;
//   • the fog and the camera       — the game's own `Fog` composite and `Camera`.
//
// Nothing here re-implements a radar, terrain, wake or kinematics rule: that is
// precisely what the Eric ruling of 2026-07-24 forbids ("the ambient must not be
// its own thing with its own rules"), and it is the whole point of the rebuild.
//
// THIS FILE IS THE PIXI HALF and is deliberately NOT unit-tested (the repo
// pattern — see `stage/worstCase.ts`, its model). All of the scene's COMPOSITION
// — the seeded world, the helm, the beam-crossing paint decision, the motion
// setting, the off-centre camera — lives in the PURE `render/ambientScene.ts`
// beside its tests. What is left here is wiring, layout and teardown.
//
// WHY NOT `buildGame` + a stub room (the proven `stage/worstCase.ts` mechanism):
// it boots the WHOLE game over the menu — HUD, hotbar, BR chrome bar, kill feed,
// nameplates. A backdrop needs the water and the scope, not the chrome.
// Composing the renderers directly is lighter AND is what makes "no combat, no
// storm, no HUD on the menu" true by construction rather than by suppression.
//
// TWO SILENT NO-PAINT TRAPS, both real, neither of which throws: `Radar.render`
// draws nothing unless `onSweepSample` has been anchored at least once, and
// nothing unless `own !== null`. Both are satisfied every frame below.
//
// TEARDOWN IS TOTAL, and "total" is meant literally. The scene owns `worldRoot`,
// `chartRoot` and the fog sprite pre-join, and `stopAmbient()` is the ONLY path
// that runs before the real game claims those same roots — so `destroy()` sweeps
// EVERY stage layer (not a curated list), frees texture SOURCES and not just
// textures, hands the blip layer's mask back to Radar, restores every alpha it
// set, drops the resize listener, and is a safe no-op the second time.

import { Container, FillGradient, Graphics, Texture, type Sprite } from 'pixi.js';
import { CONFIG, generateMap, paintCoverage, type GameMap } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { motionIntensity, settings } from '../settings/store.js';
import { ContactStore } from '../net/snapshots.js';
import { Camera } from './camera.js';
import { CONTACT_STALE_MS } from './contacts.js';
import { Effects } from './effects.js';
import { Fog } from './fog.js';
import { buildMap, type MapChart } from './map.js';
import { Radar } from './radar.js';
import { ShipView, contactStyle, hueRevision, type ShipStyle } from './ships.js';
import { applyCamera, type Stage, type StageLayers } from './stage.js';
import type { WakeHull } from './wake.js';
import {
  advanceAmbient,
  ambientCameraTarget,
  ambientContacts,
  ambientPaints,
  buildAmbientWorld,
  type AmbientHull,
  type AmbientTick,
  type AmbientWorld,
} from './ambientScene.js';

/** The four fields a hull is drawn (and wakes) from — the common shape of a live
 *  `ShipState` and an interpolated `Snapshot`. */
interface DrawPose {
  x: number;
  y: number;
  heading: number;
  speed: number;
}

const A = CLIENT_CONFIG.home.ambient;
const C = CLIENT_CONFIG.colors;

/**
 * Empty a container and destroy what came out.
 *
 * `textureSource: true` IS DELIBERATELY NOT PASSED, AND THAT IS A MEASURED
 * RESULT, NOT AN OVERSIGHT. The cycle-82 review correctly observed that Pixi v8
 * frees the `Texture` on `texture: true` but leaves the `TextureSource` (the GPU
 * allocation) alive, and that the rest of this codebase passes both
 * (`radar.ts:599-600`, `fog.ts:154`). Adding it here KILLED THE NEXT MATCH: the
 * join renders the map and then throws
 * `TypeError: Cannot read properties of null` out of `BindGroup.getResource`
 * under `AlphaMaskPipe.execute` — a live match with terrain drawn, no HUD, no
 * hull and a stopped loop. Reproduced on every join, and gone the moment the
 * flag came off.
 *
 * The reason is ownership: those sources are NOT all this scene's to free. The
 * layers it borrows are the same containers the real game builds into moments
 * later, and a mask resource released here is looked up by the renderer after
 * the new `Radar` has re-attached its own — the crash is in the MASK bind group,
 * which is why it reads as a Pixi internal rather than as anything in this file.
 * The `Texture.EMPTY` guard below is kept for the same class of reason
 * (`radar.ts:1234` carries the identical warning): that texture is shared by
 * every consumer in the process, and `Fog`'s sprite carries it until its first
 * `rebake`.
 *
 * So the four full-size surfaces the scene bakes — fog composite, dim mask,
 * heatmap buffer, sweep wedge — are released as `Texture`s and their sources are
 * left to the GC. That is a real, ledgered cost, and it is strictly better than
 * a menu that breaks the game it is advertising. Anyone re-attempting this must
 * free each surface through ITS OWNER's teardown seam (as `radar.clearBlips()`
 * already does for the heatmap) rather than by flag-sweeping borrowed layers —
 * and must smoke a real join, because no unit test in this repo catches it.
 *
 * Pixi's `destroy` early-returns on an already-destroyed node, so this is
 * re-entrant.
 */
function clearLayer(c: Container): void {
  for (const child of c.removeChildren()) {
    const tex = (child as unknown as Partial<Sprite>).texture;
    const owned = tex !== undefined && tex !== Texture.EMPTY;
    child.destroy({ children: true, texture: owned, textureSource: false });
  }
}

/**
 * Empty EVERY stage layer plus the fog sprite — the teardown sweep, exported so
 * the guarantee is testable without a WebGL context (the shell itself is
 * visual-QA only, per the repo pattern).
 *
 * UNCONDITIONAL, never a curated "layers we touched" list. The list this
 * replaces happened to be correct, but it was a hand-maintained duplicate of a
 * fact only the renderers know: the scene composes `Radar`, `Effects`, `Fog`,
 * `MapChart` and `ShipView`, and the day one of them starts writing an eighth
 * layer the leftovers survive into the live match — the exact corruption this
 * teardown exists to prevent, arriving silently. Emptying a container the scene
 * never wrote costs one array length check. It takes `StageLayers` rather than a
 * loose record precisely so "every layer" is the TYPE's answer, not this file's.
 */
export function clearAmbientLayers(layers: StageLayers, fogSprite: Container): void {
  for (const layer of Object.values(layers)) clearLayer(layer);
  clearLayer(fogSprite);
}

export class AmbientScene {
  private readonly map: GameMap;
  private readonly world: AmbientWorld;
  private readonly camera: Camera;
  private readonly chart: MapChart;
  private readonly radar: Radar;
  private readonly effects: Effects;
  private readonly fog: Fog;
  /** The truesight source of hull returns — a real store, fed real frames and
   *  sampled `interpDelayMs` in the past, exactly as the live client does. */
  private readonly contacts = new ContactStore();
  private readonly views = new Map<string, ShipView>();
  /** Each hull's resolved style, held so the silhouette and its wake are drawn
   *  from ONE value per frame (see `syncStyles`). */
  private readonly styles = new Map<string, ShipStyle>();
  /** The hue-table revision these styles were resolved at (`ships.ts`). */
  private styleRev = hueRevision();
  /** The ids inside truesight THIS FRAME — the visibility authority for the
   *  drawn hulls (see `drawHulls`), refreshed by `feedContacts`. */
  private readonly sightedIds = new Set<string>();
  private readonly scrim = new Graphics();
  /** This frame's wake sources — reused, never reallocated (render-loop rule). */
  private readonly wakes: WakeHull[] = [];
  private destroyed = false;
  private readonly onResize = (): void => this.layout();

  constructor(private readonly stage: Stage) {
    this.map = generateMap(A.mapSeed, CONFIG.map.playerCap);
    this.world = buildAmbientWorld(this.map);
    const stats = this.world.stats;
    // Lead is deliberately zero: the in-match camera throws itself ahead of the
    // bow, which is right when you are steering and wrong for a backdrop that
    // must hold a composed picture behind a column of text.
    this.camera = new Camera({ radarRange: stats.radarRange, followRate: A.followRate, leadSeconds: 0, leadMax: 0 });
    this.camera.setViewport(this.viewW, this.viewH);
    this.camera.snapTo(ambientCameraTarget(this.world));
    this.chart = buildMap(this.map, stage.layers, this.camera.zoom);
    // `return` grammar, and no hue resolver: under `return` the scope carries no
    // identity at all (amendments 65/67), so there is nothing for one to answer.
    this.radar = new Radar(stage.layers.blip, stage.layers.sweep, () => null, 'return');
    this.radar.setRanges(stats.sightRange, stats.radarRange, stats.sweepPeriodMs);
    this.radar.setHeightRaster(this.map.heightRaster);
    // One layer for all three of Effects' sinks: the scene spawns wake and
    // NOTHING else, so the one-shot and burst layers are never reached. That is
    // the "no combat on the menu" rule expressed as wiring rather than as a
    // check somebody has to remember.
    this.effects = new Effects(stage.layers.wake);
    this.radar.setWakeSources(this.effects.wakeSources, this.map.islands);
    this.fog = new Fog(stage.fogSprite);
    this.fog.setSightRange(stats.sightRange);
    for (const h of this.world.hulls) {
      const style = contactStyle(h.cls, h.hue);
      this.styles.set(h.id, style);
      const view = new ShipView(style, h.cls);
      stage.layers.ship.addChild(view.gfx);
      this.views.set(h.id, view);
    }
    stage.layers.vignette.addChild(this.scrim);
    // The three darkening layers, all knobs (Design Note: tuned by eye, not by
    // argument): the master dimmer over the picture, the game's own fog held
    // back, and the radial legibility scrim drawn in `layout`.
    stage.worldRoot.alpha = A.sceneAlpha;
    stage.chartRoot.alpha = A.sceneAlpha;
    stage.fogSprite.alpha = A.fogAlpha;
    this.layout();
    // THE RENDERER'S resize, NOT the window's. Pixi's `ResizePlugin` defers the
    // real canvas/`app.screen` resize to a `requestAnimationFrame`, so a window
    // listener fires while `app.screen` still reports the PREVIOUS size — the
    // camera would be re-fitted and the fog re-baked one resize stale, and
    // nothing would ever re-run at the new size. `bindResize` (main.ts) has
    // always used the renderer event for exactly this reason.
    stage.app.renderer.on('resize', this.onResize);
  }

  /**
   * Advance and draw one frame. `dtMs` arrives as raw `Ticker.deltaMS` with no
   * clamp of its own — the composer clamps it (see `MAX_FRAME_MS`).
   *
   * A ZERO / DEGENERATE dt SKIPS THE INTEGRATION AND NOTHING ELSE. An early
   * return on `tick.dtMs === 0` also skipped `applyCamera`, so that frame drew
   * world-unit content at the IDENTITY transform — a ~2400u map radius rendered
   * 1:1 from the origin, i.e. the whole scene flung off-screen for a frame. The
   * composer already declines to integrate a zero step (`clampFrameMs`), so the
   * shell has nothing left to guard: the camera transform and the draw must
   * happen on every frame the ticker delivers.
   */
  update(dtMs: number): void {
    if (this.destroyed) return;
    // The motion level is resolved HERE, not in the composer: `settings/store`
    // touches localStorage at module scope and the composer is pure (see its
    // header). `tick.travelSec` carries the scaled step back out.
    const tick = advanceAmbient(this.world, this.map, dtMs, motionIntensity(settings.current.motion));
    const now = tick.nowMs;
    this.feedContacts(now);
    // The beam anchor. Without at least one of these the march never runs and
    // the scope stays black — silently.
    this.radar.onSweepSample(tick.sweep, now);
    this.paintReturns(tick, now);
    // The camera eases on the MOTION-SCALED step, so `motion: off` stops the
    // drift as well as the fleet (an unscaled dt kept gliding toward a target
    // that never moved again — motion that outlived the setting that forbade it).
    this.camera.update(tick.travelSec, ambientCameraTarget(this.world));
    applyCamera(this.camera, this.stage.worldRoot, this.stage.chartRoot);
    this.chart.update(this.camera.zoom);
    this.drawHulls(tick);
    this.effects.update(tick.dtSec, now, this.wakes);
    this.radar.render(this.world.observer.state, now, this.contacts, this.camera.worldView);
    const hole = this.camera.worldToScreen(this.world.observer.state);
    this.fog.update(hole.x, hole.y);
  }

  /** Tear the scene down (at PLAY, before the real world claims these roots). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stage.app.renderer.off('resize', this.onResize);
    this.radar.setWakeSources(null);
    this.effects.clearWake();
    // THE MASK COMES OFF BEFORE THE SPRITE IS DESTROYED. `updateDimMask` parks
    // the near-range dim sprite on `layers.blip.mask` every frame (amendment
    // 181); clearing the layer destroys that sprite but would leave the live
    // match rendering the SHARED blip layer masked by a destroyed node. Radar
    // already owns the correct seam — `clearBlips` routes through `hideHeat`,
    // which nulls it — so ask Radar rather than reaching in, then null it again
    // defensively: teardown is the one path that must not depend on internals.
    this.radar.clearBlips();
    this.stage.layers.blip.mask = null;
    this.views.clear();
    this.styles.clear();
    clearAmbientLayers(this.stage.layers, this.stage.fogSprite);
    this.stage.worldRoot.alpha = 1;
    this.stage.chartRoot.alpha = 1;
    this.stage.fogSprite.alpha = 1;
  }

  // --- perception: the two sources of hull returns ----------------------------

  /**
   * Push this frame's TRUESIGHTED hulls into the contact store — the
   * inside-the-bubble source (amendment 89). The radar samples this store at
   * `serverNow − interpDelayMs`, so for the first ~100ms of scene time there is
   * no history to sample and a near hull is simply not stamped yet; that is the
   * live client's own behaviour at join and needs no special case.
   *
   * The id set it records is THIS FRAME's truesight membership, and it is the
   * authority `drawHulls` uses — see there for why the contact store cannot
   * answer that question.
   */
  private feedContacts(now: number): void {
    const list = ambientContacts(this.world, this.map.islands);
    this.sightedIds.clear();
    for (const c of list) this.sightedIds.add(c.id);
    if (list.length > 0) this.contacts.pushFrame(now, list);
    // A hull that sails out of the bubble (or behind a coast) stops being fed;
    // pruning it BOUNDS how long the scope can keep synthesizing an echo from a
    // dead-reckoned pose — it does not prevent it, and the 400ms TTL is the
    // live client's own number. What it is emphatically NOT is a visibility
    // rule: the drawn hulls take theirs from `sightedIds` above, because
    // `sampleAt` keeps answering (frozen) right up to the prune.
    this.contacts.prune(now, CONTACT_STALE_MS);
  }

  /**
   * Wire blips for the hulls the beam just found OUTSIDE truesight — the
   * annulus source. The footprint comes from the SHIPPED shaper
   * (`paintCoverage`, the very function the server's `return`-grammar blip row
   * calls) on the shipped lattice, so a menu echo and a match echo are the same
   * artifact by construction.
   *
   * There is deliberately no `wk` (wake) row here. A far hull's water reaches a
   * real client only because the SERVER rasterizes it per segment; with no
   * server the honest options were to synthesize a disclosure nobody made, or to
   * let a fogged hull lay visible foam on the water. The scene does neither: the
   * wake you see, on the water and on the scope alike, is a truesighted hull's,
   * through `setWakeSources` — the exact half the client owns in a real match.
   */
  private paintReturns(tick: AmbientTick, now: number): void {
    for (const hull of ambientPaints(this.world, tick)) {
      const s = hull.state;
      const cov = paintCoverage(hull.cls, s.x, s.y, s.heading, CONFIG.vision.radarCellU, now);
      this.radar.onBlip({ k: 'blip', t: now, gx: cov.gx, gy: cov.gy, w: cov.w, h: cov.h, bits: cov.bits });
    }
  }

  // --- drawing ----------------------------------------------------------------

  /**
   * Re-resolve every hull's style if the hue tables were swapped under us.
   *
   * The colorblind assist is a TABLE SWAP at the `ships.ts` chokepoint and it
   * bumps a revision precisely so latched consumers can notice; the settings
   * overlay is reachable pre-join through the home gear, so this really does
   * change while the menu is up. The scene latched its styles once at
   * construction and then recomputed only the WAKE's colour per frame, so
   * toggling the assist recoloured a hull's foam and not the hull. One resolve
   * per hull per frame, shared by the silhouette and the wake, makes the two
   * incapable of disagreeing.
   */
  private syncStyles(): void {
    const rev = hueRevision();
    if (rev === this.styleRev) return;
    this.styleRev = rev;
    for (const h of this.world.hulls) {
      const style = contactStyle(h.cls, h.hue);
      this.styles.set(h.id, style);
      this.views.get(h.id)?.setColors(style.stroke, style.fill);
    }
  }

  /**
   * Place every visible hull and collect this frame's wake sources.
   *
   * The observer draws at its LIVE pose (it is the local ship); every other hull
   * draws at its interp-delayed contact sample — the same time the radar's own
   * `shipStamp` and the live client's `wakeHulls` read — so the silhouette, its
   * foam and its echo all agree about where it was.
   *
   * VISIBILITY IS THIS FRAME'S TRUESIGHT MEMBERSHIP, NOT "did `sampleAt` answer".
   * That was the shipped bug and the mistake is easy to repeat: `sampleAt`
   * returns null ONLY for an EMPTY buffer (net/snapshots.ts) — past the newest
   * sample it dead-reckons for `MAX_EXTRAPOLATION_MS` and then FREEZES, and the
   * store prunes on a 400ms TTL, so a rival sailing out of the bubble kept
   * answering with a frozen pose. It went on drawing OUTSIDE the sight bubble —
   * fully bright, because `ship` lives in `chartRoot`, above the fog — laying
   * foam at a standstill, and popped out without a fade when the TTL finally
   * bit. On the shipped seed rival-1 crosses the 330u boundary on every lap, so
   * this was visible on any real menu dwell. Asking the perception predicate
   * (range + the shipped island LOS) instead makes the silhouette and the fog
   * agree by construction.
   *
   * A hull that IS sighted but has no sample yet (a buffer younger than the
   * interp delay, the first ~100ms of scene time) is still hidden — that is the
   * live client's own join behaviour and it resolves itself in three frames.
   */
  private drawHulls(tick: AmbientTick): void {
    this.syncStyles();
    this.wakes.length = 0;
    const at = tick.nowMs - CLIENT_CONFIG.net.interpDelayMs;
    for (const h of this.world.hulls) {
      const view = this.views.get(h.id);
      if (view === undefined) continue;
      const pose = this.poseFor(h, at);
      view.gfx.visible = pose !== null;
      if (pose === null) continue;
      view.update(pose.x, pose.y, pose.heading);
      this.wakes.push({
        id: h.id,
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        // A frozen fleet makes no foam: at `motion: off` the hulls are never
        // integrated, so `state.speed` keeps reporting the ~19 u/s they were
        // making when travel stopped and the (speed-driven) wake and chop model
        // would draw a stationary ship's bow wave. `travelSec` is the one number
        // that knows the fleet stopped.
        speed: tick.travelSec > 0 ? pose.speed : 0,
        cls: h.cls,
        color: (this.styles.get(h.id) ?? contactStyle(h.cls, h.hue)).stroke,
      });
    }
  }

  /** This hull's draw pose, or null when it must not be drawn at all: the
   *  observer is always at its live pose; anyone else must be inside truesight
   *  THIS frame and have a sample to show. */
  private poseFor(h: AmbientHull, at: number): DrawPose | null {
    if (h === this.world.observer) return this.world.observer.state;
    if (!this.sightedIds.has(h.id)) return null;
    return this.contacts.get(h.id)?.sampleAt(at) ?? null;
  }

  // --- layout (viewport-size aware, re-run on resize) -------------------------

  private get viewW(): number {
    return Math.max(1, this.stage.app.screen.width);
  }

  private get viewH(): number {
    return Math.max(1, this.stage.app.screen.height);
  }

  /** Adopt the live viewport: re-fit the camera, re-bake the fog for the new
   *  zoom, redraw the scrim. Degenerate (0-size) viewports are floored at 1px so
   *  neither the base-zoom division nor the fog bake sees a zero. */
  private layout(): void {
    if (this.destroyed) return;
    const w = this.viewW;
    const h = this.viewH;
    this.camera.setViewport(w, h);
    this.fog.rebake(w, h, this.camera.zoom);
    this.drawScrim(w, h);
  }

  /** The radial legibility scrim: void, lightest under the home column's centre
   *  and heaviest at the edges, so DOM text keeps its contrast over the water. */
  private drawScrim(w: number, h: number): void {
    const cy = A.scrimCenterYFrac;
    const grad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: cy },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: cy },
      outerRadius: 0.75,
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: cssRgba(C.void, A.scrimInnerAlpha) },
        { offset: 0.62, color: cssRgba(C.void, A.scrimMidAlpha) },
        { offset: 1, color: cssRgba(C.void, A.scrimOuterAlpha) },
      ],
    });
    this.scrim.clear();
    this.scrim.rect(0, 0, w, h).fill(grad);
  }
}
