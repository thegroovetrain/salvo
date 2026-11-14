// RAIN-SIGHT BENCH (Story 11.6 pre-spec, throwaway). Three synced panels show
// the same scene — the storm rain field, real hulls on curving courses — each
// drawing the partly-hidden enemy hulls in one look: A+D (the pick, large),
// with A and D alongside for reference. A fourth mode, Storm, shows the WHOLE
// map: the live zone ring, the rain spinning about it (the eye of the
// hurricane, PLAN.md §7), the next ring once revealed and the match clock. The
// visibility model is page-only math (PLAN.md §3): V(P) = exp(−k·τ(P)), τ the
// optical depth from the observer to P, evaluated on a per-hull grid.

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
  mapRadius,
  mulberry32,
  rollZoneRings,
  zoneClosedAtMs,
  zoneStateAt,
  type ShipClassId,
  type ZoneRing,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../../../client/src/config.js';
import { hullTopSpeed } from '../../../client/src/sim/hullKinematics.js';
import { packDensityRgba } from '../../../client/src/render/fogField.js';
import { PUFF_TILE_SEED, bakePuffTile, puffTileRgba } from '../../../client/src/render/fogPuffTile.js';
import { RainField } from './field.js';
import { bakeHull, buildHullArt, fillNoise, type HullBake } from './hull.js';
import { LookHull, VIS_COLS_MAX, VIS_ROWS_MAX, makeVisTexture, type LookId } from './look.js';
import { makeStormField, stormRingAt, type StormField, type StormFieldConfig } from './stormField.js';

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
  k: 0.006,
  timeSpeed: 10, // match clock × real time
  grainU: 2,
  cols: 6,
  rows: 2,
  cutoff: 0.05,
  spanU: 1320,
  blurU: 6,
  dStr: 0.4, // D strength inside A+D
  rainOnTop: true,
  shipsFollowSpeed: false,
  showNext: true,
  showEye: false,
  paused: false,
  view: 'look' as 'look' | 'storm',
  solo: -1 as -1 | LookId,
  follow: -1, // ship index the camera centres on (-1 = the observer)
  seed: 20261114,
};

/** The storm field's dials (page defaults only — Eric's numbers to set). Noise, edge band and morph start from CONFIG.fog. */
const SF: StormFieldConfig = {
  wavelengthU: CONFIG.fog.wavelengthU,
  octaves: CONFIG.fog.octaves,
  gain: CONFIG.fog.gain,
  edgeBand: CONFIG.fog.edgeBand,
  morphMs: CONFIG.fog.morphMs,
  edgeSpeedU: 10,
  centerTurnFrac: 0.5,
  windRad: 4,
  eyeFrac: 0.3,
  coverageEdge: 0.75,
  coverageOutside: 0.55,
  edgeSoftW: 0.25,
  minRadiusU: 250,
};

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

const buildStorm = (seed: number): StormField => makeStormField(seed, SF, MAP_R, rollRings(seed), CONFIG.zone);

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
function placeObserver(storm: StormField, tMs: number, seed: number): void {
  const ring = stormRingAt(storm, tMs);
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

  /** The per-part grid: V = exp(−k·τ) at cols × rows hull-local points, into the ship's vis texture. */
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
          const tau = rain.opticalDepth(OWN.x, OWN.y, wx, wy);
          const v = Math.exp(-P.k * tau);
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
    world.addChild(shipLayer, rl.layer);
    app.stage.addChild(root);
    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerHTML = `${L.name} <span>${L.sub}</span>`;
    label.title = 'click: solo / back to compare';
    label.addEventListener('click', () => setMode('look', P.solo === L.id ? -1 : L.id));
    stage.appendChild(label);
    return { id: L.id, root, clip, bg, world, own, rainLayer: rl.layer, dSprite: rl.dSprite, tile: rl.tile, looks, label, w: 0, h: 0 };
  });

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
    stormRoot.visible = !look;
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
      rings.circle(st.current.cx, st.current.cy, SF.eyeFrac * st.current.r).stroke({ width: 1.5 * px, color: C.textSecondary, alpha: 0.8 });
    }
    if (P.showNext && st.next && st.next.r > 0) {
      rings.circle(st.next.cx, st.next.cy, st.next.r).stroke({ width: 1.5 * px, color: C.white, alpha: 0.7 });
    }
    if (st.current.r > 0) rings.circle(st.current.cx, st.current.cy, st.current.r).stroke({ width: 2 * px, color: C.stormReadout });
    rings.circle(st.current.cx, st.current.cy, 4 * px).fill(C.stormReadout);
    if (!observerStale) rings.circle(OWN.x, OWN.y, 5 * px).fill(C.relationOwn);
    clockLbl.innerHTML = `${mmss(matchT)} <span>${st.phase} · ring ${st.groupIndex + 1} · R ${Math.round(st.current.r)} u · spin ${storm.spinSign > 0 ? 'clockwise' : 'counter-clockwise'} on screen</span>`;
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
      pushRain();
    }
    const eye = stormRingAt(storm, matchT);
    if (P.view === 'storm') {
      const W = app.screen.width;
      const H = app.screen.height;
      const ppu = Math.min(W, H) / (2 * MAP_R * 1.04);
      stormWorld.scale.set(ppu);
      stormWorld.pivot.set(0, 0);
      stormWorld.position.set(W / 2, H / 2);
      placeRain(stormRain.dSprite, stormRain.tile, whole, 0, 0, W, H, ppu, eye);
      drawRings(ppu);
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
        const top = P.rainOnTop ? 1 : 0;
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
    if (P.view === 'storm') observerStale = true;
  };
  /** Re-seat the observer inside the live ring and rebuild the ship-look raster around it. */
  let observerStale = false; // the clock was scrubbed in the Storm view: re-seat on the way back to the looks
  const reseatObserver = (): void => {
    observerStale = false;
    placeObserver(storm, matchT, P.seed);
    rain.resetAt(matchT, OWN.x, OWN.y);
    placeShips();
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
  const setMode = (view: 'look' | 'storm', solo: -1 | LookId = P.solo): void => {
    const was = P.view;
    P.view = view;
    P.solo = solo;
    modeBtns.forEach((b, i) => {
      const on = i === 0 ? view === 'storm' : view === 'look' && (i === 1 ? solo === -1 : LOOKS[i - 2].id === solo);
      b.classList.toggle('on', on);
    });
    if (was !== view) activeRain().resetAt(matchT);
    if (view === 'look' && observerStale) reseatObserver();
    layout();
  };
  modeBtns.push(mkBtn('Storm', () => setMode('storm')));
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
    rain.field = storm;
    whole.field = storm;
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
  scrub.addEventListener('change', () => (P.view === 'look' ? reseatObserver() : (observerStale = true)));
  slider('Clock speed', 1, 60, 1, () => P.timeSpeed, (v) => (P.timeSpeed = v), (v) => `${v}×`);
  check('Clock speed moves ships too', () => P.shipsFollowSpeed, (v) => (P.shipsFollowSpeed = v));

  section('Storm');
  slider('Edge speed', 0, 40, 0.5, () => SF.edgeSpeedU, (v) => (SF.edgeSpeedU = v), (v) => `${v.toFixed(1)} u/s`);
  slider('Center turn rate (× edge)', 0, 1, 0.05, () => SF.centerTurnFrac, (v) => (SF.centerTurnFrac = v), (v) => v.toFixed(2));
  slider('Spiral wind at edge', 0, 10, 0.25, () => SF.windRad, (v) => (SF.windRad = v), (v) => `${v.toFixed(2)} rad`);
  slider('Eye radius (× ring)', 0, 0.8, 0.01, () => SF.eyeFrac, (v) => (SF.eyeFrac = v), (v) => v.toFixed(2));
  slider('Coverage at ring edge', 0, 1, 0.01, () => SF.coverageEdge, (v) => (SF.coverageEdge = v), (v) => `${Math.round(v * 100)} %`);
  slider('Coverage outside', 0, 1, 0.01, () => SF.coverageOutside, (v) => (SF.coverageOutside = v), (v) => `${Math.round(v * 100)} %`);
  slider('Edge soft width (× ring)', 0, 1, 0.01, () => SF.edgeSoftW, (v) => (SF.edgeSoftW = v), (v) => v.toFixed(2));
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
    ships, P, SF, rain, whole, panels,
    get storm() { return storm; },
    get frameMs() { return frameMs; },
    get matchT() { return matchT; },
    setClock, setMode, reseatObserver,
  };
}

boot().catch((e: unknown) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#ff6666;position:fixed;bottom:0;left:0;font-size:14px">${String(e)}</pre>`);
});
