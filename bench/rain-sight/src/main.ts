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
import { RadarScope } from './radarView.js';
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
  spanU: 1320,
  blurU: 6,
  dStr: 0.4, // D strength inside A+D
  rainOnTop: true,
  shipsFollowSpeed: false,
  showNext: true,
  showEye: false,
  paused: false,
  view: 'look' as View,
  solo: -1 as -1 | LookId,
  follow: -1, // ship index the camera centres on (-1 = the observer)
  seed: 20261114,
};

type View = 'look' | 'storm' | 'radar';

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

  interface Panel {
    id: LookId;
    root: Container;
    clip: Graphics;
    bg: Graphics;
    world: Container;
    own: Container;
    rainLayer: Container;
    smokeLayer: Container;
    dSprite: Sprite;
    tile: TilingSprite;
    looks: LookHull[];
    label: HTMLDivElement;
    w: number;
    h: number;
  }

  /** A rain layer: the density sprite as the alpha mask of the puff tile. */
  const makeRainLayer = (tex: Texture): { layer: Container; dSprite: Sprite; tile: TilingSprite } => {
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

  const panels: Panel[] = LOOKS.map((L) => {
    const root = new Container();
    const clip = new Graphics();
    const world = new Container();
    const bg = new Graphics();
    root.addChild(bg, world, clip);
    root.mask = clip;
    const shipLayer = new Container();
    const own = buildHullArt(OWN.cls, C.relationOwn);
    own.rotation = OWN.heading;
    const looks = ships.map((s) => new LookHull(s.bake, s.vis, L.id));
    for (const lk of looks) shipLayer.addChild(lk.mesh);
    shipLayer.addChild(own);
    const rl = makeRainLayer(lookTex.texture);
    const smokeLayer = new Container();
    world.addChild(shipLayer, smokeLayer, rl.layer);
    app.stage.addChild(root);
    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerHTML = `${L.name} <span>${L.sub}</span>`;
    label.title = 'click: solo / back to compare';
    label.addEventListener('click', () => setMode('look', P.solo === L.id ? -1 : L.id));
    stage.appendChild(label);
    return { id: L.id, root, clip, bg, world, own, rainLayer: rl.layer, smokeLayer, dSprite: rl.dSprite, tile: rl.tile, looks, label, w: 0, h: 0 };
  });
  const smoke = new SmokeClouds(panels.map((p) => p.smokeLayer));

  // --- the Radar view ------------------------------------------------------------

  const radar = new RadarScope();
  app.stage.addChild(radar.root);

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

  const layout = (): void => {
    const W = app.screen.width;
    const H = app.screen.height;
    const gap = 4;
    const look = P.view === 'look';
    stormRoot.visible = P.view === 'storm';
    radar.root.visible = P.view === 'radar';
    radar.layout(W, H);
    clockLbl.style.left = '8px';
    clockLbl.style.top = '8px';
    for (const p of panels) {
      let x = 0;
      let y = 0;
      let w = W;
      let h = H;
      const show = look && (P.solo === -1 || P.solo === p.id);
      p.root.visible = show;
      p.label.style.display = show ? 'block' : 'none';
      if (P.solo === -1) {
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

  const cam = { x: OWN.x, y: OWN.y };
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
  const pushRain = (): void => {
    const f = activeRain();
    f.step(matchT);
    const tex = f === whole ? stormTex : lookTex;
    packDensityRgba(f.view, f.N, tex.rgba, f.N);
    tex.source.update();
  };
  app.ticker.add((tk) => {
    const dt = Math.min(100, tk.deltaMS);
    frameAcc += tk.deltaMS;
    frameN++;
    if (!P.paused) {
      const mdt = dt * P.timeSpeed;
      matchT = Math.min(CLOCK_MAX_MS, matchT + mdt);
      shipT += (P.shipsFollowSpeed ? mdt : dt) / 1000;
      if (P.view !== 'radar') pushRain();
    }
    const eye = stormRing(storm, matchT);
    smoke.step(shipT * 1000);
    if (P.view === 'storm') {
      const W = app.screen.width;
      const H = app.screen.height;
      const ppu = Math.min(W, H) / (2 * MAP_R * 1.04);
      stormWorld.scale.set(ppu);
      stormWorld.pivot.set(0, 0);
      stormWorld.position.set(W / 2, H / 2);
      placeRain(stormRain.dSprite, stormRain.tile, whole, 0, 0, W, H, ppu, eye);
      drawRings(ppu);
    } else if (P.view === 'radar') {
      poseShips();
      radarFrame = stormFrame(storm, matchT, radarFrame);
      // real wall-clock time (the ticker clamps a slow frame's delta; the sweep must not slow down with it)
      const now = performance.now();
      const rdt = Math.min(1000, now - radarWall);
      radarWall = now;
      if (!P.paused) {
        radar.advance(rdt, radarFrame, OWN.x, OWN.y, ships.map((s) => ({ x: s.x, y: s.y, heading: s.heading, len: s.bake.len, beam: s.bake.beam })));
      }
      radar.draw(OWN.x, OWN.y, eye);
      radarMs = performance.now() - now;
      clockLbl.innerHTML = `${mmss(matchT)} <span>radar · sweep ${radar.sweepIndex} · ${radar.rpm} rpm · range ${Math.round(radar.rangeU)} u · ring R ${Math.round(eye.r)} u · clutter cells this step ${radar.lastClutterCells}</span>`;
    } else {
      poseShips();
      computeVis();
      const f = ships[P.follow];
      cam.x = f ? f.x : OWN.x;
      cam.y = f ? f.y : OWN.y;
      clockLbl.innerHTML = `${mmss(matchT)} <span>${zoneStateAt(matchT, 0, storm.rings, CONFIG.zone).phase} · own ρ ${(Math.hypot(OWN.x - eye.cx, OWN.y - eye.cy) / Math.max(eye.r, 1)).toFixed(2)}</span>`;
      for (const p of panels) {
        if (!p.root.visible) continue;
        const ppu = Math.min(p.w, p.h) / P.spanU;
        p.world.scale.set(ppu);
        p.world.pivot.set(cam.x, cam.y);
        p.world.position.set(p.w / 2, p.h / 2);
        p.own.position.set(OWN.x, OWN.y);
        const top = P.rainOnTop ? 2 : 0;
        if (p.world.getChildIndex(p.rainLayer) !== top) p.world.setChildIndex(p.rainLayer, top);
        placeRain(p.dSprite, p.tile, rain, cam.x, cam.y, p.w, p.h, ppu, eye);
        ships.forEach((s, i) => {
          const m = p.looks[i].mesh;
          m.position.set(s.x, s.y);
          m.rotation = s.heading;
          p.looks[i].set({ cols: P.cols, rows: P.rows, cutoff: P.cutoff, pxPerU: ppu * app.renderer.resolution, grainU: P.grainU, blurU: P.blurU, dStr: P.dStr });
        });
      }
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

  /** Jump the clock (scrub): pure in t, so a synchronous refresh of the active raster lands exactly on it. */
  const setClock = (ms: number): void => {
    matchT = Math.max(0, Math.min(CLOCK_MAX_MS, ms));
    activeRain().resetAt(matchT);
    pushRain();
    if (P.view !== 'look') observerStale = true;
  };
  /** Re-seat the observer inside the live ring and rebuild the ship-look raster around it. */
  let observerStale = false; // the clock was scrubbed in the Storm view: re-seat on the way back to the looks
  const reseatObserver = (): void => {
    observerStale = false;
    placeObserver(storm, matchT, P.seed);
    rain.resetAt(matchT, OWN.x, OWN.y);
    placeShips();
    radar.reset();
  };

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
  const modeBtns: HTMLButtonElement[] = [];
  const setMode = (view: View, solo: -1 | LookId = P.solo): void => {
    const was = P.view;
    P.view = view;
    P.solo = solo;
    modeBtns.forEach((b, i) => {
      const on = i === 0 ? view === 'storm' : i === 1 ? view === 'radar' : view === 'look' && (i === 2 ? solo === -1 : LOOKS[i - 3].id === solo);
      b.classList.toggle('on', on);
    });
    if (was !== view && view !== 'radar') activeRain().resetAt(matchT);
    if (view === 'radar') radarWall = performance.now();
    if (view === 'radar' && observerStale) {
      observerStale = false;
      placeObserver(storm, matchT, P.seed);
      radar.reset();
    }
    if (view === 'look' && observerStale) reseatObserver();
    layout();
  };
  modeBtns.push(mkBtn('Storm', () => setMode('storm')));
  modeBtns.push(mkBtn('Radar', () => setMode('radar')));
  modeBtns.push(mkBtn('Compare', () => setMode('look', -1)));
  for (const L of LOOKS) modeBtns.push(mkBtn(`Solo ${L.name}`, () => setMode('look', L.id)));
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
    if (P.view === 'look') reseatObserver();
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
  slider('Zoom (span, short axis)', 300, 8000, 20, () => P.spanU, (v) => (P.spanU = v),
    (v) => `${Math.round(v)} u${v === CLIENT_CONFIG.zoom.defaultSpanU ? ' (game)' : ''}`);
  check('Rain drawn on top of ships', () => P.rainOnTop, (v) => (P.rainOnTop = v));

  section('Smoke');
  const btns3 = document.createElement('div');
  btns3.className = 'btns';
  side.appendChild(btns3);
  const popOn = (i: number): void => {
    const s = ships[i];
    if (s) smoke.pop(s.x, s.y, shipT * 1000);
  };
  const popAt = (x: number, y: number): void => smoke.pop(x, y, shipT * 1000);
  const armBtn = mkBtn('Pop smoke', () => {
    if (P.follow >= 0) {
      popOn(P.follow);
      return;
    }
    P.smokeArmed = !P.smokeArmed;
    armBtn.classList.toggle('on', P.smokeArmed);
  }, btns3);
  armBtn.title = 'on the followed ship, or (no ship followed) at your next click on the map';
  mkBtn('Smoke on me', () => popAt(OWN.x, OWN.y), btns3);
  mkBtn('Clear smoke', () => smoke.clear(), btns3);
  slider('Smoke thickness (× heaviest rain)', 0, 10, 0.1, () => P.smokeThick, (v) => (P.smokeThick = v),
    (v) => `${v.toFixed(1)}× · 100 u → V ${Math.exp(-P.k * v * 100).toFixed(2)}`);
  slider('Smoke soft edge (× r)', 0, 1, 0.01, () => P.smokeSoft, (v) => (P.smokeSoft = v), (v) => (v === 0 ? 'hard disc' : v.toFixed(2)));
  // a click on a look panel drops a cloud there while armed
  app.canvas.addEventListener('pointerdown', (e) => {
    if (!P.smokeArmed || P.view !== 'look') return;
    const r = app.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const p = panels.find((q) => q.root.visible && sx >= q.root.x && sx < q.root.x + q.w && sy >= q.root.y && sy < q.root.y + q.h);
    if (!p) return;
    const ppu = p.world.scale.x;
    popAt(cam.x + (sx - p.root.x - p.w / 2) / ppu, cam.y + (sy - p.root.y - p.h / 2) / ppu);
    P.smokeArmed = false;
    armBtn.classList.remove('on');
  });

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
  slider('Radar zoom (span, short axis)', 2000, 2 * CONFIG.vision.radar, 100, () => radar.spanU, (v) => (radar.spanU = v), (v) => `${Math.round(v)} u`);

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
    P.follow = P.follow === i ? -1 : i;
    renderReadout();
  });
  side.appendChild(table);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Click a ship row to follow it; click a panel label to solo it.';
  side.appendChild(hint);
  const renderReadout = (): void => {
    if (document.activeElement !== scrub) {
      scrub.value = String(matchT);
      (scrub as unknown as { _val: HTMLElement })._val.textContent = mmss(matchT);
    }
    const f = activeRain();
    perf.textContent = `frame ${frameMs.toFixed(1)} ms · rain ${f.lastStepMs.toFixed(1)} ms/frame · full raster ${f.lastFullMs.toFixed(0)} ms`;
    const rows = ships
      .map((s, i) => {
        const d = Math.hypot(s.x - OWN.x, s.y - OWN.y);
        const on = P.follow === i ? ' style="color:#00e8ff"' : '';
        return `<tr data-i="${i}"${on}><td>${s.cls}</td><td>${Math.round(d)}</td><td>${s.vMin.toFixed(2)}</td><td>${s.vMax.toFixed(2)}</td></tr>`;
      })
      .join('');
    table.innerHTML = `<tr><th>ship</th><th>dist u</th><th>min V</th><th>max V</th></tr>${rows}`;
  };

  placeShips();
  setMode('look', -1);
  layout();
  renderReadout();
  // headless verification seam
  (window as unknown as { __bench: unknown }).__bench = {
    ships, P, SF, rain, whole, panels, smoke, radar, popOn, popAt, OWN,
    get shipT() { return shipT; },
    get storm() { return storm; },
    get frameMs() { return frameMs; },
    get matchT() { return matchT; },
    get radarMs() { return radarMs; },
    setClock, setMode, reseatObserver,
    /** Advance the radar by `ms` in 50 ms beam steps (verification seam; use with P.paused). */
    radarStep(ms: number) {
      poseShips();
      radarFrame = stormFrame(storm, matchT, radarFrame);
      const targets = ships.map((s) => ({ x: s.x, y: s.y, heading: s.heading, len: s.bake.len, beam: s.bake.beam }));
      for (let t = 0; t < ms; t += 50) radar.advance(Math.min(50, ms - t), radarFrame, OWN.x, OWN.y, targets);
      return radar.sweepIndex;
    },
  };
}

boot().catch((e: unknown) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#ff6666;position:fixed;bottom:0;left:0;font-size:14px">${String(e)}</pre>`);
});
