// RAIN-SIGHT BENCH (Story 11.6 pre-spec, throwaway). Three synced panels show
// the same scene — the storm rain field, real hulls on curving courses — each
// drawing the partly-hidden enemy hulls in one look: A+D (the pick, large),
// with A and D alongside for reference. A fourth mode, Storm, shows the WHOLE
// map: the live zone ring, the rain spinning about it (the eye of the
// hurricane, PLAN.md §7), the next ring once revealed and the match clock. The
// visibility model is page-only math (PLAN.md §3): V(P) = exp(−k·τ(P)), τ the
// optical depth from the observer to P, evaluated on a per-hull grid.
// PLAN.md §8: the rain is now the REAL shared field (shared/src/sim/fog.ts,
// driven by a page cfg object the Storm sliders mutate); SMOKE SCREEN clouds
// add optical depth (smokeDepth.ts) on the same cutoff; a Radar view shows the
// scope with the rain clutter (client/src/render/rainClutter.ts).
// The default view, GAME, is one full-size panel with everything layered the
// way client/src/render/stage.ts stacks the chart (CHART_LAYER_ORDER): zone
// ring → rain (`fog`) → contact hulls (`ship`, the A+D look under rain + smoke
// τ) → smoke clouds (`cloud`) → radar paints + rain clutter (`blip`, dim-masked
// inside the eye's sight like render/radar.ts) → own hull (`ownShip`) → sweep.
// Every view zooms (wheel, about the cursor) and pans (drag) — camera.ts.

import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  fogDepthReachFan,
  fogMaxDepth,
  fogRingStepAt,
  fogVisibility,
  makeFogField,
  mapRadius,
  mulberry32,
  rollZoneRings,
  zoneClosedAtMs,
  zoneStateAt,
  type FogFieldConfig,
  type FogFrame,
  type ShipClassId,
  type ZoneRing,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../../../client/src/config.js';
import { hullTopSpeed } from '../../../client/src/sim/hullKinematics.js';
import { packDensityRgba } from '../../../client/src/render/fogField.js';
import { PUFF_TILE_SEED, bakePuffTile, puffTileRgba } from '../../../client/src/render/fogPuffTile.js';
import { RainField, stormFrame, stormRing, type Storm } from './field.js';
import { bakeHull, buildHullArt, fillNoise, type HullBake } from './hull.js';
import { LookHull, VIS_COLS_MAX, VIS_ROWS_MAX, makeVisTexture, type LookId } from './look.js';
import { RadarDraw, RadarModel, RadarScope, type ViewRect } from './radarView.js';
import { CamControl, FOLLOW_OWN, FREE, ppuOf, screenToWorld, type Cam, type Viewport } from './camera.js';
import { smokeDepthAlong } from './smokeDepth.js';
import { SmokeClouds } from './smokeView.js';

const C = CLIENT_CONFIG.colors;
const FF = CLIENT_CONFIG.fogField;
const MAP_R = mapRadius(CONFIG.map.playerCap); // u — the real ocean (5,000 u at the shipped 16 / 16)
const CLOSED_MS = zoneClosedAtMs(CONFIG.zone); // 16:00 on the shipped timeline
const CLOCK_MAX_MS = CLOSED_MS + 60_000;
const LOOK_HALF_U = 3800; // u — half-side of the ship-look raster around the observer
const LOOK_CELL_U = 24;
const STORM_CELL_U = 40; // u — the whole-map raster's cell
const OBSERVER_RHO = 0.55; // where the observer is seated in the live ring (ρ) when placed
const GAME_SPAN_U = CLIENT_CONFIG.zoom.defaultSpanU; // 1320 u — the game's default framing
const MIN_SPAN_U = 150; // close enough to see the dissolve grain on a hull
const MAX_SPAN_U = 2 * MAP_R * 1.04; // the whole map
const WHOLE_STEP_SPAN_U = 3000; // ship views keep the whole-map raster warm from this span out
const REACH_RAYS = Math.max(0, Math.floor(CLIENT_CONFIG.blip.heatmap.dim.reachRays));
const DIM_RECAST_MS = 400; // real ms between eye-reach fan casts (the game: fog cadence / 20 u move)

// --- dials -----------------------------------------------------------------

const P = {
  k: CONFIG.fog.extinctionPerU as number,
  timeSpeed: 10, // match clock × real time
  grainU: 2,
  cols: 6,
  rows: 2,
  cutoff: CONFIG.fog.sightCutoffV as number,
  smokeThick: 3, // × the heaviest rain (density 1)
  smokeSoft: 0.3, // soft rim, fraction of r
  smokeArmed: false, // next click on a look panel drops a cloud
  blurU: 6,
  dStr: 0.4, // D strength inside A+D
  rainOnTop: true,
  shipsFollowSpeed: false,
  showNext: true,
  showEye: false,
  paused: false,
  view: 'game' as View,
  solo: -1 as -1 | LookId,
  seed: 20261114,
};

type View = 'game' | 'look' | 'storm' | 'radar';

/** The cameras: the ship views (Game, Compare, Solo) share one; Radar and Storm have their own. */
const CAMS: Record<'ship' | 'radar' | 'storm', Cam> = {
  ship: { x: 0, y: 0, span: GAME_SPAN_U, target: GAME_SPAN_U, follow: FOLLOW_OWN },
  radar: { x: 0, y: 0, span: 7000, target: 7000, follow: FOLLOW_OWN },
  storm: { x: 0, y: 0, span: MAX_SPAN_U, target: MAX_SPAN_U, follow: FREE },
};
const camOf = (v: View): Cam => (v === 'storm' ? CAMS.storm : v === 'radar' ? CAMS.radar : CAMS.ship);
const isShipView = (v: View): boolean => v === 'game' || v === 'look';

/** The REAL rain field's dials: a copy of CONFIG.fog the Storm sliders mutate (makeFogField holds it by reference). */
const EYE_BY_RING: number[] = [...CONFIG.fog.eyeRadiusFracByRing];
const EDGE_BY_RING: number[] = [...CONFIG.fog.edgeCoverageByRing];
const SF: FogFieldConfig = { ...CONFIG.fog, eyeRadiusFracByRing: EYE_BY_RING, edgeCoverageByRing: EDGE_BY_RING };

// panel index = order here (A+D first, the big compare panel); id = shader mode
const LOOKS: { id: LookId; name: string; sub: string }[] = [
  { id: 2, name: 'A+D', sub: 'dissolve + fade/blur' },
  { id: 0, name: 'A', sub: 'fine dissolve' },
  { id: 1, name: 'D', sub: 'fade + blur' },
];

/** The match's rings from the page seed (one uint32 per rolled ring, like the World's private stream). */
function rollRings(seed: number): ZoneRing[] {
  const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0);
  const seeds = Array.from({ length: 8 }, () => (rng.next() * 0x100000000) >>> 0);
  return rollZoneRings(MAP_R, CONFIG.zone, seeds);
}

const buildStorm = (seed: number): Storm => ({ fog: makeFogField(seed, SF, MAP_R), rings: rollRings(seed) });

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// --- the scene ---------------------------------------------------------------

interface Ship {
  cls: ShipClassId;
  bake: HullBake;
  dist: number; // loop centre distance from the observer
  cx: number;
  cy: number;
  r: number;
  dir: 1 | -1;
  speed: number;
  phase: number;
  x: number;
  y: number;
  heading: number;
  vis: BufferImageSource;
  visData: Uint8Array;
  vMin: number;
  vMax: number;
}

const SHIP_PLAN: { cls: ShipClassId; dist: number; r: number }[] = [
  { cls: 'warspite', dist: 330, r: 160 },
  { cls: 'iowa', dist: 480, r: 200 },
  { cls: 'bismarck', dist: 620, r: 180 },
  { cls: 'yamato', dist: 900, r: 260 },
  { cls: 'iowa', dist: 1500, r: 320 },
  { cls: 'yamato', dist: 2600, r: 380 },
];

const OWN = { cls: 'bismarck' as ShipClassId, x: 0, y: 0, heading: -Math.PI / 2 };

/** Seat the observer inside the live ring at `tMs`: ρ = OBSERVER_RHO out from the eye, bearing from the seed. */
function placeObserver(storm: Storm, tMs: number, seed: number): void {
  const ring = stormRing(storm, tMs);
  const th = mulberry32((seed ^ 0x1b873593) >>> 0).next() * Math.PI * 2;
  const d = OBSERVER_RHO * Math.max(ring.r, 300);
  OWN.x = ring.cx + Math.cos(th) * d;
  OWN.y = ring.cy + Math.sin(th) * d;
}

/** A density raster's GPU side: the RGBA buffer (alpha = density) and its texture. */
function densityTex(n: number): { rgba: Uint8Array; source: BufferImageSource; texture: Texture } {
  const rgba = new Uint8Array(n * n * 4);
  const source = new BufferImageSource({
    resource: rgba,
    width: n,
    height: n,
    scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  return { rgba, source, texture: new Texture({ source }) };
}

async function boot(): Promise<void> {
  const side = document.getElementById('side')!;
  const stage = document.getElementById('stage')!;
  const app = new Application();
  await app.init({
    resizeTo: stage,
    background: C.void,
    antialias: true,
    preference: 'webgl',
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  stage.appendChild(app.canvas);

  // bakes: one per class, enemy relation color
  const bakes = new Map<ShipClassId, HullBake>();
  for (const cls of SHIP_CLASS_IDS) bakes.set(cls, bakeHull(app.renderer, cls, C.relationEnemy));
  const regrain = (): void => {
    let s = 1;
    for (const b of bakes.values()) fillNoise(b, P.grainU, 0x9e3779b9 + s++ * 7919);
  };
  regrain();

  let matchT = 60_000; // ms on the match clock (zone start = 0)
  let shipT = 0; // s on the ship clock
  let storm = buildStorm(P.seed);
  placeObserver(storm, matchT, P.seed);
  const rain = new RainField(storm, LOOK_HALF_U, LOOK_CELL_U, OWN.x, OWN.y, matchT);
  const whole = new RainField(storm, MAP_R + STORM_CELL_U, STORM_CELL_U, 0, 0, matchT);
  const lookTex = densityTex(rain.N);
  const stormTex = densityTex(whole.N);
  const activeRain = (): RainField => (P.view === 'storm' ? whole : rain);
  let radarFrame: FogFrame | undefined;
  let radarWall = performance.now();
  let radarMs = 0;

  // the rain drawing: the game's composition (density raster as an ALPHA MASK over the real wisps tile)
  const tile = bakePuffTile(PUFF_TILE_SEED, FF);
  const puffTexture = new Texture({
    source: new BufferImageSource({
      resource: puffTileRgba(tile, C.fogBank),
      width: tile.size,
      height: tile.size,
      scaleMode: 'linear',
      addressMode: 'repeat',
      alphaMode: 'premultiply-alpha-on-upload',
    }),
  });
  const period = FF.puffTilePx / FF.puffPxPerU;

  // ships
  const ships: Ship[] = SHIP_PLAN.map((p) => {
    const vt = makeVisTexture();
    return {
      cls: p.cls,
      bake: bakes.get(p.cls)!,
      dist: p.dist,
      cx: 0,
      cy: 0,
      r: p.r,
      dir: 1,
      speed: hullTopSpeed(p.cls) * 0.85,
      phase: 0,
      x: 0,
      y: 0,
      heading: 0,
      vis: vt.source,
      visData: vt.data,
      vMin: 1,
      vMax: 1,
    };
  });

  /** Seat each loop where it carries the hull in and out of rain as seen from the observer (V spread across the loop), bearings spread. */
  const placeShips = (): void => {
    const used: number[] = [];
    const vAt = (x: number, y: number): number => Math.exp(-P.k * rain.opticalDepth(OWN.x, OWN.y, x, y));
    ships.forEach((s, k) => {
      let best = 0;
      let bestScore = Infinity;
      for (let a = 0; a < 360; a += 4) {
        const th = (a * Math.PI) / 180;
        if (used.some((u) => Math.abs(Math.atan2(Math.sin(th - u), Math.cos(th - u))) < 0.6)) continue;
        const cx = OWN.x + Math.cos(th) * s.dist;
        const cy = OWN.y + Math.sin(th) * s.dist;
        let lo = 1;
        let hi = 0;
        for (let q = 0; q < 8; q++) {
          const v = vAt(cx + Math.cos((q * Math.PI) / 4) * s.r, cy + Math.sin((q * Math.PI) / 4) * s.r);
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        const score = -(hi - lo) + 0.5 * Math.abs((hi + lo) / 2 - 0.5);
        if (score < bestScore) {
          bestScore = score;
          best = th;
        }
      }
      used.push(best);
      s.cx = OWN.x + Math.cos(best) * s.dist;
      s.cy = OWN.y + Math.sin(best) * s.dist;
      s.dir = k % 2 === 0 ? 1 : -1;
      s.phase = k * 1.7;
    });
  };

  const poseShips = (): void => {
    for (const s of ships) {
      const phi = s.phase + (s.dir * s.speed * shipT) / s.r;
      s.x = s.cx + Math.cos(phi) * s.r;
      s.y = s.cy + Math.sin(phi) * s.r;
      s.heading = phi + (s.dir * Math.PI) / 2;
    }
  };

  const sightCfg = { get extinctionPerU() { return P.k; }, get sightCutoffV() { return P.cutoff; } };
  const smokeCfg = { get thickness() { return P.smokeThick; }, get softFrac() { return P.smokeSoft; } };
  /** The per-part grid: V = exp(−k·τ), τ = rain + smoke, at cols × rows hull-local points, into the ship's vis texture. */
  const computeVis = (): void => {
    for (const s of ships) {
      const { len, beam } = s.bake;
      const c = Math.cos(s.heading);
      const sn = Math.sin(s.heading);
      let lo = 1;
      let hi = 0;
      for (let j = 0; j < P.rows; j++) {
        const ly = P.rows === 1 ? 0 : -beam / 2 + (beam * j) / (P.rows - 1);
        for (let i = 0; i < P.cols; i++) {
          const lx = -len / 2 + (len * i) / (P.cols - 1);
          const wx = s.x + lx * c - ly * sn;
          const wy = s.y + lx * sn + ly * c;
          const tau = rain.opticalDepth(OWN.x, OWN.y, wx, wy) + smokeDepthAlong(smoke.discs, OWN.x, OWN.y, wx, wy, smokeCfg);
          const v = fogVisibility(tau, sightCfg);
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
          const o = (j * VIS_COLS_MAX + i) * 4;
          const b = Math.round(v * 255);
          s.visData[o] = b;
          s.visData[o + 1] = b;
          s.visData[o + 2] = b;
          s.visData[o + 3] = 255;
        }
      }
      s.vMin = lo;
      s.vMax = hi;
      s.vis.update();
    }
  };

  // --- ship-look panels ------------------------------------------------------

  interface RainLayer {
    layer: Container;
    dSprite: Sprite;
    tile: TilingSprite;
  }

  interface Panel {
    id: LookId;
    /** The Game panel: everything layered as client/src/render/stage.ts stacks it. */
    game: boolean;
    root: Container;
    clip: Graphics;
    bg: Graphics;
    world: Container;
    own: Container;
    /** Both rasters' drawings; only the one covering the view is shown. */
    rain: Container;
    rainLook: RainLayer;
    rainWhole: RainLayer;
    smokeLayer: Container;
    looks: LookHull[];
    label: HTMLDivElement;
    zone: Graphics | null;
    radar: RadarDraw | null;
    w: number;
    h: number;
  }

  /** A rain layer: the density sprite as the alpha mask of the puff tile. */
  const makeRainLayer = (tex: Texture): RainLayer => {
    const layer = new Container();
    const dSprite = new Sprite(tex);
    dSprite.renderable = false;
    const tileSprite = new TilingSprite({ texture: puffTexture, width: 1, height: 1 });
    tileSprite.alpha = FF.maxAlpha;
    tileSprite.tileScale.set(1 / FF.puffPxPerU);
    tileSprite.setMask({ mask: dSprite, channel: 'alpha' });
    layer.addChild(dSprite, tileSprite);
    return { layer, dSprite, tile: tileSprite };
  };

  const SIGHT_U = CONFIG.vision.sight; // the dim mask's anchor (render/radar.ts sightHoleU, base hull)
  const makePanel = (id: LookId, name: string, sub: string, game: boolean): Panel => {
    const root = new Container();
    const clip = new Graphics();
    const world = new Container();
    const bg = new Graphics();
    root.addChild(bg, world, clip);
    root.mask = clip;
    const own = buildHullArt(OWN.cls, C.relationOwn);
    own.rotation = OWN.heading;
    const looks = ships.map((s) => new LookHull(s.bake, s.vis, id));
    const contacts = new Container();
    for (const lk of looks) contacts.addChild(lk.mesh);
    const rainLook = makeRainLayer(lookTex.texture);
    const rainWhole = makeRainLayer(stormTex.texture);
    const rainGroup = new Container();
    rainGroup.addChild(rainWhole.layer, rainLook.layer);
    const smokeLayer = new Container();
    let zone: Graphics | null = null;
    let radar: RadarDraw | null = null;
    if (game) {
      // client/src/render/stage.ts CHART_LAYER_ORDER, the layers the bench has:
      // zone → fog (rain) → ship (contacts) → cloud (smoke) → blip (radar paints) → ownShip → sweep
      zone = new Graphics();
      radar = new RadarDraw();
      radar.enableDim(SIGHT_U);
      const ownLayer = new Container();
      ownLayer.addChild(own);
      world.addChild(zone, rainGroup, contacts, smokeLayer, radar.blip, ownLayer, radar.sweep);
    } else {
      contacts.addChild(own);
      world.addChild(contacts, smokeLayer, rainGroup);
    }
    app.stage.addChild(root);
    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerHTML = `${name} <span>${sub}</span>`;
    if (!game) {
      label.title = 'click: solo / back to compare';
      label.addEventListener('click', () => setMode('look', P.solo === id ? -1 : id));
    } else {
      label.style.pointerEvents = 'none';
    }
    stage.appendChild(label);
    return { id, game, root, clip, bg, world, own, rain: rainGroup, rainLook, rainWhole, smokeLayer, looks, label, zone, radar, w: 0, h: 0 };
  };
  const gamePanel = makePanel(2, 'Game', 'A+D · rain · smoke · radar, layered as in the game', true);
  const panels: Panel[] = [gamePanel, ...LOOKS.map((L) => makePanel(L.id, L.name, L.sub, false))];
  const lookPanels = panels.filter((p) => !p.game);
  const smoke = new SmokeClouds(panels.map((p) => p.smokeLayer));

  // --- the radar (one model; the Radar view's scope and the Game view's overlay draw it) -----

  const radar = new RadarModel();
  const scope = new RadarScope();
  app.stage.addChild(scope.root);
  const reachFan = new Float32Array(REACH_RAYS);
  let dimCastWall = -Infinity;

  // --- the Storm view (whole map) ----------------------------------------------

  const stormRoot = new Container();
  const stormBg = new Graphics();
  const stormWorld = new Container();
  const mapDisc = new Graphics();
  const stormRain = makeRainLayer(stormTex.texture);
  const rings = new Graphics();
  stormWorld.addChild(mapDisc, stormRain.layer, rings);
  stormRoot.addChild(stormBg, stormWorld);
  app.stage.addChild(stormRoot);
  const clockLbl = document.createElement('div');
  clockLbl.className = 'lbl clock';
  stage.appendChild(clockLbl);

  /** The panel's visible rect in screen px (for hit tests and the cameras). */
  const vpOf = (p: Panel): Viewport => ({ x: p.root.x, y: p.root.y, w: p.w, h: p.h });
  const fullVp = (): Viewport => ({ x: 0, y: 0, w: app.screen.width, h: app.screen.height });

  const layout = (): void => {
    const W = app.screen.width;
    const H = app.screen.height;
    const gap = 4;
    stormRoot.visible = P.view === 'storm';
    scope.root.visible = P.view === 'radar';
    scope.layout(W, H);
    clockLbl.style.left = '8px';
    clockLbl.style.top = '8px';
    for (const p of panels) {
      let x = 0;
      let y = 0;
      let w = W;
      let h = H;
      const show = p.game ? P.view === 'game' : P.view === 'look' && (P.solo === -1 || P.solo === p.id);
      p.root.visible = show;
      p.label.style.display = show ? 'block' : 'none';
      if (!p.game && P.solo === -1) {
        // A+D large on the left (full height); A and D stacked on the right for reference
        const bigW = Math.round((W - gap) * 0.62);
        if (p.id === 2) {
          w = bigW;
        } else {
          w = W - gap - bigW;
          h = (H - gap) / 2;
          x = bigW + gap;
          y = p.id === 0 ? 0 : h + gap;
        }
      }
      p.root.position.set(x, y);
      p.w = w;
      p.h = h;
      p.clip.clear().rect(0, 0, w, h).fill(0xffffff);
      p.bg.clear().rect(0, 0, w, h).fill(C.void);
      p.label.style.left = `${x + 8}px`;
      p.label.style.top = `${y + (p.id === 2 ? 44 : 8)}px`;
    }
    stormBg.clear().rect(0, 0, W, H).fill(C.void);
    mapDisc.clear().circle(0, 0, MAP_R).fill(0x08110e).circle(0, 0, MAP_R).stroke({ width: 2, color: C.hairline, pixelLine: true });
  };
  app.renderer.on('resize', layout);

  // --- per frame -------------------------------------------------------------

  /** Fit the tiled rain to the visible world rect ∩ the raster (the game's placeTile); the tile moves with the eye. */
  const placeRain = (dSprite: Sprite, t: TilingSprite, f: RainField, cx: number, cy: number, w: number, h: number, ppu: number, eye: ZoneRing): void => {
    dSprite.position.set(f.ox - f.cellU / 2, f.oy - f.cellU / 2);
    dSprite.scale.set(f.cellU);
    const halfW = w / 2 / ppu;
    const halfH = h / 2 / ppu;
    const x0 = Math.max(f.ox - f.cellU / 2, cx - halfW);
    const y0 = Math.max(f.oy - f.cellU / 2, cy - halfH);
    const x1 = Math.min(f.ox - f.cellU / 2 + f.N * f.cellU, cx + halfW);
    const y1 = Math.min(f.oy - f.cellU / 2 + f.N * f.cellU, cy + halfH);
    t.visible = x1 > x0 && y1 > y0;
    if (!t.visible) return;
    t.position.set(x0, y0);
    t.width = x1 - x0;
    t.height = y1 - y0;
    const wrap = (v: number): number => ((v % period) + period) % period;
    t.tilePosition.set(wrap(eye.cx - x0), wrap(eye.cy - y0));
  };

  /** Does the observer-centred raster cover this view rect? (else the panel draws the whole-map raster) */
  const lookCovers = (cx: number, cy: number, halfW: number, halfH: number): boolean => {
    const x0 = rain.ox - rain.cellU / 2;
    const y0 = rain.oy - rain.cellU / 2;
    const ext = rain.N * rain.cellU;
    return cx - halfW >= x0 && cy - halfH >= y0 && cx + halfW <= x0 + ext && cy + halfH <= y0 + ext;
  };

  const drawRings = (ppu: number): void => {
    const st = zoneStateAt(matchT, 0, storm.rings, CONFIG.zone);
    const px = 1 / ppu;
    rings.clear();
    if (P.showEye && st.current.r > 0) {
      rings.circle(st.current.cx, st.current.cy, fogRingStepAt(SF.eyeRadiusFracByRing, matchT, CONFIG.zone) * st.current.r).stroke({ width: 1.5 * px, color: C.textSecondary, alpha: 0.8 });
    }
    if (P.showNext && st.next && st.next.r > 0) {
      rings.circle(st.next.cx, st.next.cy, st.next.r).stroke({ width: 1.5 * px, color: C.white, alpha: 0.7 });
    }
    if (st.current.r > 0) rings.circle(st.current.cx, st.current.cy, st.current.r).stroke({ width: 2 * px, color: C.stormReadout });
    rings.circle(st.current.cx, st.current.cy, 4 * px).fill(C.stormReadout);
    if (!observerStale) rings.circle(OWN.x, OWN.y, 5 * px).fill(C.relationOwn);
    clockLbl.innerHTML = `${mmss(matchT)} <span>${st.phase} · ring ${st.groupIndex + 1} · R ${Math.round(st.current.r)} u · eye ${fogRingStepAt(SF.eyeRadiusFracByRing, matchT, CONFIG.zone).toFixed(2)} · edge ${Math.round(fogRingStepAt(SF.edgeCoverageByRing, matchT, CONFIG.zone) * 100)}% · spin ${storm.fog.spinSign > 0 ? 'clockwise' : 'counter-clockwise'} on screen</span>`;
  };

  let readoutAcc = 0;
  let frameAcc = 0;
  let frameN = 0;
  let frameMs = 0;
  /** Step one raster's progressive refresh and upload its texture. */
  const stepRaster = (f: RainField): void => {
    f.step(matchT);
    const tex = f === whole ? stormTex : lookTex;
    packDensityRgba(f.view, f.N, tex.rgba, f.N);
    tex.source.update();
  };
  /** Synchronous refresh of one raster at the current clock (scrub, view change, a raster coming back into use). */
  const resetRaster = (f: RainField): void => {
    f.resetAt(matchT);
    stepRaster(f);
  };
  let wholeWarm = false; // the whole-map raster was stepped last frame
  /** Ship views: the observer raster always (sight reads it); the whole-map one while zoomed out. */
  const stepShipRasters = (): void => {
    if (!P.paused) stepRaster(rain);
    const wantWhole = CAMS.ship.span >= WHOLE_STEP_SPAN_U;
    if (wantWhole && !wholeWarm) resetRaster(whole);
    else if (wantWhole && !P.paused) stepRaster(whole);
    wholeWarm = wantWhole;
  };

  const targets = (): { x: number; y: number; heading: number; len: number; beam: number }[] =>
    ships.map((s) => ({ x: s.x, y: s.y, heading: s.heading, len: s.bake.len, beam: s.bake.beam }));
  /** Advance the radar on real wall-clock time (the ticker clamps a slow frame's delta; the sweep must not slow down with it). */
  const advanceRadar = (): void => {
    radarFrame = stormFrame(storm, matchT, radarFrame);
    const now = performance.now();
    const rdt = Math.min(1000, now - radarWall);
    radarWall = now;
    if (!P.paused) radar.advance(rdt, radarFrame, OWN.x, OWN.y, targets());
  };
  /** The Game view's dim mask: re-cast the eye-reach fan (rain only, like the game) on a cadence and re-bake. */
  const syncDim = (force = false): void => {
    const now = performance.now();
    if (!force && now - dimCastWall < DIM_RECAST_MS) return;
    dimCastWall = now;
    radarFrame = stormFrame(storm, matchT, radarFrame);
    const maxDepth = fogMaxDepth({ extinctionPerU: P.k, sightCutoffV: P.cutoff });
    const fan = REACH_RAYS > 0 ? fogDepthReachFan(radarFrame, OWN.x, OWN.y, SIGHT_U, maxDepth, reachFan) : null;
    gamePanel.radar!.rebakeDim(SIGHT_U, fan);
  };

  /** Follow: snap the camera onto the followed ship / the observer each frame (free cameras stay put). */
  const trackCam = (c: Cam): void => {
    const f = ships[c.follow];
    if (f) {
      c.x = f.x;
      c.y = f.y;
    } else if (c.follow === FOLLOW_OWN) {
      c.x = OWN.x;
      c.y = OWN.y;
    }
  };

  const drawShipPanel = (p: Panel, eye: ZoneRing): void => {
    const c = CAMS.ship;
    const ppu = ppuOf(c, vpOf(p));
    p.world.scale.set(ppu);
    p.world.pivot.set(c.x, c.y);
    p.world.position.set(p.w / 2, p.h / 2);
    p.own.position.set(OWN.x, OWN.y);
    if (!p.game) {
      // Compare / Solo: the "rain on top" toggle (the Game panel keeps the game's order: rain under the hulls)
      const top = P.rainOnTop ? 2 : 0;
      if (p.world.getChildIndex(p.rain) !== top) p.world.setChildIndex(p.rain, top);
    }
    const halfW = p.w / 2 / ppu;
    const halfH = p.h / 2 / ppu;
    const useLook = lookCovers(c.x, c.y, halfW, halfH) || !wholeWarm;
    p.rainLook.layer.visible = useLook;
    p.rainWhole.layer.visible = !useLook;
    const L = useLook ? p.rainLook : p.rainWhole;
    placeRain(L.dSprite, L.tile, useLook ? rain : whole, c.x, c.y, p.w, p.h, ppu, eye);
    ships.forEach((s, i) => {
      const m = p.looks[i].mesh;
      m.position.set(s.x, s.y);
      m.rotation = s.heading;
      p.looks[i].set({ cols: P.cols, rows: P.rows, cutoff: P.cutoff, pxPerU: ppu * app.renderer.resolution, grainU: P.grainU, blurU: P.blurU, dStr: P.dStr });
    });
    if (p.game) {
      const px = 1 / ppu;
      p.zone!.clear();
      if (eye.r > 0) p.zone!.circle(eye.cx, eye.cy, eye.r).stroke({ width: 2 * px, color: C.stormReadout });
      const v: ViewRect = { cx: c.x, cy: c.y, ppu, w: p.w, h: p.h };
      p.radar!.draw(radar, OWN.x, OWN.y, v, { rangeRing: true });
    }
  };

  let lastSpanShown = -1;
  app.ticker.add((tk) => {
    const dt = Math.min(100, tk.deltaMS);
    frameAcc += tk.deltaMS;
    frameN++;
    if (!P.paused) {
      const mdt = dt * P.timeSpeed;
      matchT = Math.min(CLOCK_MAX_MS, matchT + mdt);
      shipT += (P.shipsFollowSpeed ? mdt : dt) / 1000;
    }
    camCtl.step(tk.deltaMS);
    const eye = stormRing(storm, matchT);
    smoke.step(shipT * 1000);
    const cam = camOf(P.view);
    if (P.view === 'storm') {
      if (!P.paused) stepRaster(whole);
      wholeWarm = false;
      trackCam(cam);
      const W = app.screen.width;
      const H = app.screen.height;
      const ppu = ppuOf(cam, fullVp());
      stormWorld.scale.set(ppu);
      stormWorld.pivot.set(cam.x, cam.y);
      stormWorld.position.set(W / 2, H / 2);
      placeRain(stormRain.dSprite, stormRain.tile, whole, cam.x, cam.y, W, H, ppu, eye);
      drawRings(ppu);
    } else if (P.view === 'radar') {
      wholeWarm = false;
      poseShips();
      advanceRadar();
      trackCam(cam);
      const t0 = performance.now();
      const ppu = ppuOf(cam, fullVp());
      scope.world.scale.set(ppu);
      scope.world.pivot.set(cam.x, cam.y);
      scope.world.position.set(scope.w / 2, scope.h / 2);
      scope.render(radar, OWN.x, OWN.y, eye, { cx: cam.x, cy: cam.y, ppu, w: scope.w, h: scope.h });
      radarMs = performance.now() - t0;
      clockLbl.innerHTML = `${mmss(matchT)} <span>radar · sweep ${radar.sweepIndex} · ${radar.rpm} rpm · range ${Math.round(radar.rangeU)} u · ring R ${Math.round(eye.r)} u · clutter cells this step ${radar.lastClutterCells}</span>`;
    } else {
      stepShipRasters();
      poseShips();
      computeVis();
      trackCam(cam);
      if (P.view === 'game') {
        advanceRadar();
        syncDim();
      }
      const t0 = performance.now();
      for (const p of panels) if (p.root.visible) drawShipPanel(p, eye);
      if (P.view === 'game') radarMs = performance.now() - t0;
      clockLbl.innerHTML = `${mmss(matchT)} <span>${zoneStateAt(matchT, 0, storm.rings, CONFIG.zone).phase} · own ρ ${(Math.hypot(OWN.x - eye.cx, OWN.y - eye.cy) / Math.max(eye.r, 1)).toFixed(2)} · view ${Math.round(cam.span)} u</span>`;
    }
    if (cam.span !== lastSpanShown) {
      lastSpanShown = cam.span;
      syncZoomSlider();
    }
    readoutAcc += dt;
    if (readoutAcc > 250) {
      readoutAcc = 0;
      frameMs = frameAcc / Math.max(1, frameN);
      frameAcc = 0;
      frameN = 0;
      renderReadout();
    }
  });

  /** Jump the clock (scrub): pure in t, so a synchronous refresh of the drawn raster(s) lands exactly on it. */
  const setClock = (ms: number): void => {
    matchT = Math.max(0, Math.min(CLOCK_MAX_MS, ms));
    if (P.view === 'storm') resetRaster(whole);
    else if (isShipView(P.view)) {
      resetRaster(rain);
      if (wholeWarm) resetRaster(whole);
      syncDim(true);
    }
    if (!isShipView(P.view)) observerStale = true;
  };
  /** Re-seat the observer inside the live ring and rebuild the ship-look raster around it. */
  let observerStale = false; // the clock was scrubbed in the Storm view: re-seat on the way back to the looks
  const reseatObserver = (): void => {
    observerStale = false;
    placeObserver(storm, matchT, P.seed);
    rain.resetAt(matchT, OWN.x, OWN.y);
    placeShips();
    radar.reset();
    if (isShipView(P.view)) syncDim(true);
  };

  // --- zoom + pan ----------------------------------------------------------------

  const popAt = (x: number, y: number): void => smoke.pop(x, y, shipT * 1000);
  const panelAt = (sx: number, sy: number): Panel | undefined =>
    panels.find((q) => q.root.visible && sx >= q.root.x && sx < q.root.x + q.w && sy >= q.root.y && sy < q.root.y + q.h);
  const goHome = (): void => {
    const c = camOf(P.view);
    c.follow = FOLLOW_OWN;
    camCtl.setSpan(c, GAME_SPAN_U);
    trackCam(c);
    renderReadout();
  };
  const camCtl = new CamControl(app.canvas, {
    cam: () => camOf(P.view),
    hit: (sx, sy) => {
      if (!isShipView(P.view)) return fullVp();
      const p = panelAt(sx, sy);
      return p ? vpOf(p) : null;
    },
    minSpan: MIN_SPAN_U,
    maxSpan: MAX_SPAN_U,
    // a click that did not drag pops smoke there: while "Pop smoke" is armed, or with Shift held (ship views)
    click: (sx, sy, vp, e) => {
      if (!isShipView(P.view) || !(P.smokeArmed || e.shiftKey)) return;
      const w = screenToWorld(CAMS.ship, vp, sx, sy);
      popAt(w.x, w.y);
      if (P.smokeArmed) {
        P.smokeArmed = false;
        armBtn.classList.remove('on');
      }
    },
    home: goHome,
  });

  // --- the side panel ----------------------------------------------------------

  side.innerHTML = `<h1>Rain sight bench</h1>`;
  const btns = document.createElement('div');
  btns.className = 'btns';
  side.appendChild(btns);
  const mkBtn = (text: string, fn: () => void, parent: HTMLElement = btns): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', fn);
    parent.appendChild(b);
    return b;
  };
  const modeBtns: { b: HTMLButtonElement; on: () => boolean }[] = [];
  const setMode = (view: View, solo: -1 | LookId = P.solo): void => {
    const was = P.view;
    P.view = view;
    P.solo = solo;
    for (const m of modeBtns) m.b.classList.toggle('on', m.on());
    if (was !== view && view === 'storm') resetRaster(whole);
    if (!isShipView(was) && isShipView(view)) resetRaster(rain);
    if ((view === 'radar' || view === 'game') && was !== 'radar' && was !== 'game') radarWall = performance.now();
    if (view === 'radar' && observerStale) {
      observerStale = false;
      placeObserver(storm, matchT, P.seed);
      radar.reset();
    }
    if (isShipView(view) && observerStale) reseatObserver();
    if (view === 'game') syncDim(true);
    lastSpanShown = -1;
    layout();
    renderReadout();
  };
  const modeBtn = (text: string, fn: () => void, on: () => boolean): void => {
    modeBtns.push({ b: mkBtn(text, fn), on });
  };
  modeBtn('Game', () => setMode('game'), () => P.view === 'game');
  modeBtn('Storm', () => setMode('storm'), () => P.view === 'storm');
  modeBtn('Radar', () => setMode('radar'), () => P.view === 'radar');
  modeBtn('Compare', () => setMode('look', -1), () => P.view === 'look' && P.solo === -1);
  for (const L of LOOKS) modeBtn(`Solo ${L.name}`, () => setMode('look', L.id), () => P.view === 'look' && P.solo === L.id);
  const btns2 = document.createElement('div');
  btns2.className = 'btns';
  side.appendChild(btns2);
  const pauseBtn = mkBtn('Pause', () => {
    P.paused = !P.paused;
    pauseBtn.textContent = P.paused ? 'Play' : 'Pause';
    pauseBtn.classList.toggle('on', P.paused);
  }, btns2);
  mkBtn('Reseed', () => {
    P.seed = (Math.random() * 0xffffffff) >>> 0;
    storm = buildStorm(P.seed);
    rain.storm = storm;
    whole.storm = storm;
    smoke.clear();
    radar.reset();
    whole.resetAt(matchT);
    reseatObserver();
  }, btns2);
  mkBtn('Seat observer in ring', reseatObserver, btns2);
  mkBtn('Home', goHome, btns2).title = 'back to your own ship at the game framing (1320 u) — or double-click the view';
  mkBtn('Whole map', () => {
    const c = camOf(P.view);
    c.follow = FREE;
    c.x = 0;
    c.y = 0;
    camCtl.setSpan(c, MAX_SPAN_U);
    renderReadout();
  }, btns2);

  const section = (text: string): void => {
    const h = document.createElement('h2');
    h.textContent = text;
    side.appendChild(h);
  };
  const slider = (
    label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void,
    fmt: (v: number) => string,
  ): HTMLInputElement => {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label');
    const val = document.createElement('b');
    lab.textContent = label;
    lab.appendChild(val);
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(get());
    val.textContent = fmt(get());
    inp.addEventListener('input', () => {
      set(Number(inp.value));
      val.textContent = fmt(get());
    });
    (inp as unknown as { _val: HTMLElement })._val = val;
    row.append(lab, inp);
    side.appendChild(row);
    return inp;
  };
  const check = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
    const l = document.createElement('label');
    l.className = 'check';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = get();
    c.addEventListener('change', () => set(c.checked));
    l.append(c, document.createTextNode(label));
    side.appendChild(l);
  };

  section('Match clock');
  const scrub = slider('Clock', 0, CLOCK_MAX_MS, 1000, () => matchT, setClock, (v) => mmss(v));
  // on release: the observer is re-seated inside the live ring (now in the looks, or on the way back to them)
  scrub.addEventListener('change', () => {
    if (isShipView(P.view)) reseatObserver();
    else if (P.view === 'radar') {
      observerStale = false;
      reseatObserver();
    } else observerStale = true;
  });
  slider('Clock speed', 1, 60, 1, () => P.timeSpeed, (v) => (P.timeSpeed = v), (v) => `${v}×`);
  check('Clock speed moves ships too', () => P.shipsFollowSpeed, (v) => (P.shipsFollowSpeed = v));

  section('Storm');
  slider('Edge speed', 0, 40, 0.5, () => SF.edgeSpeedU, (v) => (SF.edgeSpeedU = v), (v) => `${v.toFixed(1)} u/s`);
  slider('Center turn rate (× edge)', 0, 1, 0.05, () => SF.centerTurnFrac, (v) => (SF.centerTurnFrac = v), (v) => v.toFixed(2));
  slider('Spiral wind at edge', 0, 10, 0.25, () => SF.spiralWindRad, (v) => (SF.spiralWindRad = v), (v) => `${v.toFixed(2)} rad`);
  for (let k = 0; k < EYE_BY_RING.length; k++) {
    slider(`Eye radius ring ${k} (× ring)`, 0, 0.8, 0.01, () => EYE_BY_RING[k], (v) => (EYE_BY_RING[k] = v), (v) => v.toFixed(2));
  }
  for (let k = 0; k < EDGE_BY_RING.length; k++) {
    slider(`Edge coverage ring ${k}`, 0, 1, 0.01, () => EDGE_BY_RING[k], (v) => (EDGE_BY_RING[k] = v), (v) => `${Math.round(v * 100)} %`);
  }
  slider('Coverage outside', 0, 1, 0.01, () => SF.outsideCoverage, (v) => (SF.outsideCoverage = v), (v) => `${Math.round(v * 100)} %`);
  slider('Edge soft width (× ring)', 0, 1, 0.01, () => SF.edgeSoftFrac, (v) => (SF.edgeSoftFrac = v), (v) => v.toFixed(2));
  slider('Morph period', 20, 600, 5, () => SF.morphMs / 1000, (v) => (SF.morphMs = v * 1000), (v) => `${v} s`);
  check('Show next ring (once revealed)', () => P.showNext, (v) => (P.showNext = v));
  check('Show eye radius', () => P.showEye, (v) => (P.showEye = v));

  section('Sight');
  slider('Rain thickness k', 0, 0.02, 0.0005, () => P.k, (v) => (P.k = v),
    (v) => `${v.toFixed(4)}/u · 100 u → V ${Math.exp(-v * 100).toFixed(2)}`);
  slider('Grain (A, A+D)', 0.5, 6, 0.25, () => P.grainU, (v) => {
    P.grainU = v;
    regrain();
  }, (v) => `${v.toFixed(2)} u`);
  slider('Grid along hull', 2, VIS_COLS_MAX, 1, () => P.cols, (v) => (P.cols = v), (v) => `${v}`);
  slider('Grid across hull', 1, VIS_ROWS_MAX, 1, () => P.rows, (v) => (P.rows = v), (v) => `${v}`);
  slider('Vanish cutoff', 0, 0.5, 0.01, () => P.cutoff, (v) => (P.cutoff = v), (v) => `V < ${v.toFixed(2)}`);
  slider('Blur at V = 0 (D)', 0, 15, 0.5, () => P.blurU, (v) => (P.blurU = v), (v) => `${v.toFixed(1)} u`);
  slider('D strength in A+D', 0, 1, 0.05, () => P.dStr, (v) => (P.dStr = v), (v) => v.toFixed(2));
  check('Rain drawn on top of ships (Compare / Solo; Game draws it under, as the game does)', () => P.rainOnTop, (v) => (P.rainOnTop = v));

  section('View');
  // log scale: 0 … 1000 → MIN_SPAN_U … MAX_SPAN_U; the active view's camera (the wheel moves it too)
  const ZL = Math.log(MAX_SPAN_U / MIN_SPAN_U);
  const toSpan = (v: number): number => MIN_SPAN_U * Math.exp((v / 1000) * ZL);
  const fromSpan = (s: number): number => (1000 * Math.log(s / MIN_SPAN_U)) / ZL;
  const spanText = (s: number): string => `${Math.round(s)} u${Math.abs(s - GAME_SPAN_U) < 1 ? ' (game)' : ''}`;
  const zoomSlider = slider('Zoom (span, short axis)', 0, 1000, 1, () => fromSpan(camOf(P.view).span),
    (v) => camCtl.setSpan(camOf(P.view), toSpan(v)), () => spanText(camOf(P.view).span));
  const syncZoomSlider = (): void => {
    if (document.activeElement === zoomSlider) return;
    const s = camOf(P.view).span;
    zoomSlider.value = String(fromSpan(s));
    (zoomSlider as unknown as { _val: HTMLElement })._val.textContent = spanText(s);
  };

  section('Smoke');
  const btns3 = document.createElement('div');
  btns3.className = 'btns';
  side.appendChild(btns3);
  const popOn = (i: number): void => {
    const s = ships[i];
    if (s) smoke.pop(s.x, s.y, shipT * 1000);
  };
  const armBtn = mkBtn('Pop smoke', () => {
    const f = camOf(P.view).follow;
    if (isShipView(P.view) && f >= 0) {
      popOn(f);
      return;
    }
    P.smokeArmed = !P.smokeArmed;
    armBtn.classList.toggle('on', P.smokeArmed);
  }, btns3);
  armBtn.title = 'on the followed ship, or (no ship followed) at your next click on the map; Shift+click always pops one';
  mkBtn('Smoke on me', () => popAt(OWN.x, OWN.y), btns3);
  mkBtn('Clear smoke', () => smoke.clear(), btns3);
  slider('Smoke thickness (× heaviest rain)', 0, 10, 0.1, () => P.smokeThick, (v) => (P.smokeThick = v),
    (v) => `${v.toFixed(1)}× · 100 u → V ${Math.exp(-P.k * v * 100).toFixed(2)}`);
  slider('Smoke soft edge (× r)', 0, 1, 0.01, () => P.smokeSoft, (v) => (P.smokeSoft = v), (v) => (v === 0 ? 'hard disc' : v.toFixed(2)));
  section('Radar clutter');
  check('Rain clutter on', () => radar.clutterOn, (v) => (radar.clutterOn = v));
  const tierSliders = (name: string, t: { amount: number; strength: number }): void => {
    slider(`${name} amount (per cell)`, 0, 1, 0.01, () => t.amount, (v) => (t.amount = v), (v) => `${Math.round(v * 100)} %`);
    slider(`${name} strength`, 0, 1, 0.01, () => t.strength, (v) => (t.strength = v), (v) => v.toFixed(2));
  };
  tierSliders('Weak · band edges', radar.opts.weak);
  tierSliders('Medium · band middles', radar.opts.medium);
  tierSliders('Heavy · outside ring', radar.opts.heavy);
  slider('Edge / middle split (density)', 0.05, 0.95, 0.05, () => radar.opts.midDensity, (v) => (radar.opts.midDensity = v), (v) => v.toFixed(2));
  slider('Grain (±)', 0, 0.6, 0.01, () => radar.opts.grain, (v) => (radar.opts.grain = v), (v) => v.toFixed(2));
  slider('Persistence (sweeps)', 1, 5, 1, () => radar.persistSweeps, (v) => (radar.persistSweeps = v), (v) => `${v}`);

  const perf = document.createElement('div');
  perf.className = 'perf';
  side.appendChild(perf);
  const table = document.createElement('table');
  table.title = 'click a ship: camera follows it (click again: back to own ship)';
  table.style.cursor = 'pointer';
  table.addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest('tr[data-i]');
    if (!tr) return;
    const i = Number(tr.getAttribute('data-i'));
    const c = camOf(P.view);
    c.follow = c.follow === i ? FOLLOW_OWN : i;
    trackCam(c);
    renderReadout();
  });
  side.appendChild(table);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.innerHTML = 'Wheel: zoom (about the cursor; about the followed ship while following). Drag: pan (stops following). Double-click or Home: back to your ship at 1320 u. Shift+click (or Pop smoke, then click): drop smoke. Click a ship row to follow it; click a Compare label to solo it.';
  side.appendChild(hint);
  const renderReadout = (): void => {
    if (document.activeElement !== scrub) {
      scrub.value = String(matchT);
      (scrub as unknown as { _val: HTMLElement })._val.textContent = mmss(matchT);
    }
    const f = activeRain();
    perf.textContent = `frame ${frameMs.toFixed(1)} ms · rain ${f.lastStepMs.toFixed(1)} ms/frame · full raster ${f.lastFullMs.toFixed(0)} ms`;
    const follow = camOf(P.view).follow;
    const rows = ships
      .map((s, i) => {
        const d = Math.hypot(s.x - OWN.x, s.y - OWN.y);
        const on = follow === i ? ' style="color:#00e8ff"' : '';
        return `<tr data-i="${i}"${on}><td>${s.cls}</td><td>${Math.round(d)}</td><td>${s.vMin.toFixed(2)}</td><td>${s.vMax.toFixed(2)}</td></tr>`;
      })
      .join('');
    table.innerHTML = `<tr><th>ship</th><th>dist u</th><th>min V</th><th>max V</th></tr>${rows}`;
  };

  placeShips();
  CAMS.radar.x = CAMS.ship.x = OWN.x;
  CAMS.radar.y = CAMS.ship.y = OWN.y;
  setMode('game', -1);
  layout();
  renderReadout();
  // headless verification seam
  (window as unknown as { __bench: unknown }).__bench = {
    ships, P, SF, rain, whole, panels, smoke, radar, popOn, popAt, OWN, CAMS, reachFan,
    get cam() { return camOf(P.view); },
    /** Test hook: set the active view's camera (x / y in world u, span in u, follow: -1 own, ≥ 0 ship, -2 free). */
    setCam(o: { x?: number; y?: number; span?: number; follow?: number }) {
      const c = camOf(P.view);
      if (o.follow !== undefined) c.follow = o.follow;
      else if (o.x !== undefined || o.y !== undefined) c.follow = FREE;
      if (o.x !== undefined) c.x = o.x;
      if (o.y !== undefined) c.y = o.y;
      if (o.span !== undefined) camCtl.setSpan(c, o.span);
      trackCam(c);
      return { x: c.x, y: c.y, span: c.span, follow: c.follow };
    },
    /** Screen → world through the active camera (full-stage views and the Game panel). */
    toWorld(sx: number, sy: number) { return screenToWorld(camOf(P.view), fullVp(), sx, sy); },
    get shipT() { return shipT; },
    get storm() { return storm; },
    get frameMs() { return frameMs; },
    get matchT() { return matchT; },
    get radarMs() { return radarMs; },
    setClock, setMode, reseatObserver,
    /**
     * Advance EVERYTHING by `ms` of real time in 50 ms steps — ship clock, match clock (× clock speed),
     * ships, radar beam + paints — then re-sync the rain (verification seam; use with P.paused so a slow
     * headless renderer cannot skew ship motion against the wall-clock sweep). With `untilShip` set,
     * keeps stepping past `ms` until the beam is just short (< `lead` rad) of that ship's bearing.
     */
    stepAll(ms: number, untilShip = -1, lead = 0.3) {
      radarFrame = stormFrame(storm, matchT, radarFrame);
      const T = Math.PI * 2;
      const gap = (): number => {
        const s = ships[untilShip];
        const brg = Math.atan2(s.y - OWN.y, s.x - OWN.x);
        return (((brg - radar.angle) % T) + T) % T;
      };
      let t = 0;
      while (t < ms || (ships[untilShip] && !(gap() < lead) && t < ms + 2 * radar.periodMs)) {
        shipT += 0.05;
        matchT = Math.min(CLOCK_MAX_MS, matchT + 50 * P.timeSpeed);
        poseShips();
        if (Math.round(t) % 1000 === 0) radarFrame = stormFrame(storm, matchT, radarFrame);
        radar.advance(50, radarFrame, OWN.x, OWN.y, targets());
        smoke.step(shipT * 1000);
        t += 50;
      }
      resetRaster(rain);
      if (wholeWarm) resetRaster(whole);
      syncDim(true);
      return { steppedMs: t, sweep: radar.sweepIndex };
    },
    /** Advance the radar by `ms` in 50 ms beam steps (verification seam; use with P.paused). */
    radarStep(ms: number) {
      poseShips();
      radarFrame = stormFrame(storm, matchT, radarFrame);
      const tg = targets();
      for (let t = 0; t < ms; t += 50) radar.advance(Math.min(50, ms - t), radarFrame, OWN.x, OWN.y, tg);
      return radar.sweepIndex;
    },
  };
}

boot().catch((e: unknown) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#ff6666;position:fixed;bottom:0;left:0;font-size:14px">${String(e)}</pre>`);
});
