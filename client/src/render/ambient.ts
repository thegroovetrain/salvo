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
// TEARDOWN IS TOTAL. The scene owns `worldRoot`, `chartRoot` and the fog sprite
// pre-join, and `stopAmbient()` is the ONLY path that runs before the real game
// claims those same roots — so `destroy()` empties every layer it touched,
// restores every alpha it set, drops the resize listener, and is a safe no-op the
// second time.

import { Container, FillGradient, Graphics } from 'pixi.js';
import { CONFIG, generateMap, paintCoverage, type GameMap } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { cssRgba } from '../util/color.js';
import { settings } from '../settings/store.js';
import { ContactStore } from '../net/snapshots.js';
import { Camera } from './camera.js';
import { CONTACT_STALE_MS } from './contacts.js';
import { Effects } from './effects.js';
import { Fog } from './fog.js';
import { buildMap, type MapChart } from './map.js';
import { Radar } from './radar.js';
import { ShipView, contactStyle } from './ships.js';
import { applyCamera, type LayerName, type Stage } from './stage.js';
import type { WakeHull } from './wake.js';
import {
  advanceAmbient,
  ambientCameraTarget,
  ambientContacts,
  ambientPaints,
  buildAmbientWorld,
  type AmbientTick,
  type AmbientWorld,
} from './ambientScene.js';

const A = CLIENT_CONFIG.home.ambient;
const C = CLIENT_CONFIG.colors;

/** Every stage layer this scene puts something into — the teardown list, kept as
 *  data so "the scene emptied what it filled" is one loop rather than a habit. */
const TOUCHED_LAYERS: readonly LayerName[] = ['ocean', 'wake', 'map', 'blip', 'ship', 'sweep', 'vignette'];

/** Empty a container and destroy what came out, textures included (every texture
 *  under these layers was baked by this scene: the fog composite, the sweep
 *  wedge, the near-range dim mask, the heatmap buffer). Pixi's own `destroy`
 *  early-returns on an already-destroyed node, so this is re-entrant. */
function clearLayer(c: Container): void {
  for (const child of c.removeChildren()) child.destroy({ children: true, texture: true });
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
      const view = new ShipView(contactStyle(h.cls, h.hue), h.cls);
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
    window.addEventListener('resize', this.onResize);
  }

  /** Advance and draw one frame. `dtMs` arrives as raw `Ticker.deltaMS` with no
   *  clamp of its own — the composer clamps it (see `MAX_FRAME_MS`). */
  update(dtMs: number): void {
    if (this.destroyed) return;
    const tick = advanceAmbient(this.world, this.map, dtMs, settings.current.motion);
    if (tick.dtMs === 0) return;
    const now = tick.nowMs;
    this.feedContacts(now);
    // The beam anchor. Without at least one of these the march never runs and
    // the scope stays black — silently.
    this.radar.onSweepSample(tick.sweep, now);
    this.paintReturns(tick, now);
    this.camera.update(tick.dtSec, ambientCameraTarget(this.world));
    applyCamera(this.camera, this.stage.worldRoot, this.stage.chartRoot);
    this.chart.update(this.camera.zoom);
    this.drawHulls(now);
    this.effects.update(tick.dtSec, now, this.wakes);
    this.radar.render(this.world.observer.state, now, this.contacts, this.camera.worldView);
    const hole = this.camera.worldToScreen(this.world.observer.state);
    this.fog.update(hole.x, hole.y);
  }

  /** Tear the scene down (at PLAY, before the real world claims these roots). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('resize', this.onResize);
    this.radar.setWakeSources(null);
    this.effects.clearWake();
    this.views.clear();
    for (const name of TOUCHED_LAYERS) clearLayer(this.stage.layers[name]);
    clearLayer(this.stage.fogSprite);
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
   */
  private feedContacts(now: number): void {
    const list = ambientContacts(this.world, this.map.islands);
    if (list.length > 0) this.contacts.pushFrame(now, list);
    // A hull that sails out of the bubble (or behind a coast) stops being fed;
    // pruning it is what stops the scope synthesizing an echo from a frozen,
    // extrapolated ghost pose.
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
   * Place every visible hull and collect this frame's wake sources.
   *
   * The observer draws at its LIVE pose (it is the local ship); every other hull
   * draws at its interp-delayed contact sample — the same time the radar's own
   * `shipStamp` and the live client's `wakeHulls` read — so the silhouette, its
   * foam and its echo all agree about where it was. A hull with no sample (out
   * of the bubble, or younger than the interp delay) is hidden: it exists on the
   * scope as a return, and nowhere else.
   */
  private drawHulls(now: number): void {
    this.wakes.length = 0;
    const at = now - CLIENT_CONFIG.net.interpDelayMs;
    for (const h of this.world.hulls) {
      const view = this.views.get(h.id);
      if (view === undefined) continue;
      const pose = h === this.world.observer ? h.state : (this.contacts.get(h.id)?.sampleAt(at) ?? null);
      view.gfx.visible = pose !== null;
      if (pose === null) continue;
      view.update(pose.x, pose.y, pose.heading);
      this.wakes.push({
        id: h.id,
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        speed: pose.speed,
        cls: h.cls,
        color: contactStyle(h.cls, h.hue).stroke,
      });
    }
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
