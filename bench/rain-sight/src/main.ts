// RAIN-SIGHT BENCH (Story 11.6 pre-spec, throwaway). Three synced panels show
// the same scene — real rain field, real hulls on curving courses — each
// drawing the partly-hidden enemy hulls in one look: A+D (the pick, large),
// with A and D alongside for reference. The
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
import { CONFIG, SHIP_CLASS_IDS, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../../client/src/config.js';
import { hullTopSpeed } from '../../../client/src/sim/hullKinematics.js';
import { packDensityRgba } from '../../../client/src/render/fogField.js';
import { PUFF_TILE_SEED, bakePuffTile, puffTileRgba } from '../../../client/src/render/fogPuffTile.js';
import { CELL_U, N, RainField } from './field.js';
import { bakeHull, buildHullArt, fillNoise, type HullBake } from './hull.js';
import { LookHull, VIS_COLS_MAX, VIS_ROWS_MAX, makeVisTexture, type LookId } from './look.js';

const C = CLIENT_CONFIG.colors;
const FF = CLIENT_CONFIG.fogField;

// --- dials -----------------------------------------------------------------

const P = {
  k: 0.006,
  coverage: CONFIG.fog.coverageMax,
  timeSpeed: 1,
  grainU: 2,
  cols: 6,
  rows: 2,
  cutoff: 0.05,
  spanU: 1320,
  blurU: 6,
  dStr: 0.4, // D strength inside A+D
  rainOnTop: true,
  shipsFollowSpeed: false,
  paused: false,
  solo: -1 as -1 | LookId,
  follow: -1, // ship index the camera centres on (-1 = the observer)
  seed: 20261114,
};

// panel index = order here (A+D first, the big compare panel); id = shader mode
const LOOKS: { id: LookId; name: string; sub: string }[] = [
  { id: 2, name: 'A+D', sub: 'dissolve + fade/blur' },
  { id: 0, name: 'A', sub: 'fine dissolve' },
  { id: 1, name: 'D', sub: 'fade + blur' },
];

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

  let rainT = 600_000; // ms on the rain clock
  let shipT = 0; // s on the ship clock
  const rain = new RainField(P.seed, P.coverage, rainT);

  // the rain drawing: the game's composition (density raster as an ALPHA MASK over the real wisps tile)
  const rgba = new Uint8Array(N * N * 4);
  const densitySource = new BufferImageSource({
    resource: rgba,
    width: N,
    height: N,
    scaleMode: 'linear',
    alphaMode: 'premultiply-alpha-on-upload',
  });
  const densityTexture = new Texture({ source: densitySource });
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
  let scrollX = 0;
  let scrollY = 0;
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
        const cx = Math.cos(th) * s.dist;
        const cy = Math.sin(th) * s.dist;
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
  placeShips();

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

  // --- panels ----------------------------------------------------------------

  interface Panel {
    id: LookId;
    root: Container;
    clip: Graphics;
    world: Container;
    rainLayer: Container;
    tile: TilingSprite;
    looks: LookHull[];
    label: HTMLDivElement;
    w: number;
    h: number;
  }

  const panels: Panel[] = LOOKS.map((L) => {
    const root = new Container();
    const clip = new Graphics();
    const world = new Container();
    const bg = new Graphics();
    root.addChild(bg, world, clip);
    root.mask = clip;
    const shipLayer = new Container();
    const own = buildHullArt(OWN.cls, C.relationOwn);
    own.position.set(OWN.x, OWN.y);
    own.rotation = OWN.heading;
    const looks = ships.map((s) => new LookHull(s.bake, s.vis, L.id));
    for (const lk of looks) shipLayer.addChild(lk.mesh);
    shipLayer.addChild(own);
    const rainLayer = new Container();
    const dSprite = new Sprite(densityTexture);
    dSprite.renderable = false;
    dSprite.position.set(rain.ox - CELL_U / 2, rain.oy - CELL_U / 2);
    dSprite.scale.set(CELL_U);
    const tileSprite = new TilingSprite({ texture: puffTexture, width: 1, height: 1 });
    tileSprite.alpha = FF.maxAlpha;
    tileSprite.tileScale.set(1 / FF.puffPxPerU);
    tileSprite.setMask({ mask: dSprite, channel: 'alpha' });
    rainLayer.addChild(dSprite, tileSprite);
    world.addChild(shipLayer, rainLayer);
    app.stage.addChild(root);
    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerHTML = `${L.name} <span>${L.sub}</span>`;
    label.title = 'click: solo / back to compare';
    label.addEventListener('click', () => setSolo(P.solo === L.id ? -1 : L.id));
    stage.appendChild(label);
    (root as unknown as { _bg: Graphics })._bg = bg;
    return { id: L.id, root, clip, world, rainLayer, tile: tileSprite, looks, label, w: 0, h: 0 };
  });

  const layout = (): void => {
    const W = app.screen.width;
    const H = app.screen.height;
    const gap = 4;
    for (const p of panels) {
      let x = 0;
      let y = 0;
      let w = W;
      let h = H;
      const show = P.solo === -1 || P.solo === p.id;
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
      const bg = (p.root as unknown as { _bg: Graphics })._bg;
      bg.clear().rect(0, 0, w, h).fill(C.void);
      p.label.style.left = `${x + 8}px`;
      p.label.style.top = `${y + 8}px`;
    }
  };
  app.renderer.on('resize', layout);

  // --- per frame -------------------------------------------------------------

  const cam = { x: OWN.x, y: OWN.y };
  const placeRain = (p: Panel, ppu: number): void => {
    // visible world rect of this panel ∩ the raster (the game's placeTile)
    const halfW = p.w / 2 / ppu;
    const halfH = p.h / 2 / ppu;
    const x0 = Math.max(rain.ox - CELL_U / 2, cam.x - halfW);
    const y0 = Math.max(rain.oy - CELL_U / 2, cam.y - halfH);
    const x1 = Math.min(rain.ox - CELL_U / 2 + N * CELL_U, cam.x + halfW);
    const y1 = Math.min(rain.oy - CELL_U / 2 + N * CELL_U, cam.y + halfH);
    const t = p.tile;
    t.visible = x1 > x0 && y1 > y0;
    if (!t.visible) return;
    t.position.set(x0, y0);
    t.width = x1 - x0;
    t.height = y1 - y0;
    const wrap = (v: number): number => ((v % period) + period) % period;
    t.tilePosition.set(wrap(scrollX - x0), wrap(scrollY - y0));
  };

  let readoutAcc = 0;
  app.ticker.add((tk) => {
    const dt = Math.min(100, tk.deltaMS);
    if (!P.paused) {
      const rdt = dt * P.timeSpeed;
      rainT += rdt;
      shipT += (P.shipsFollowSpeed ? rdt : dt) / 1000;
      scrollX = (((scrollX + rain.field.windX * rdt) % period) + period) % period;
      scrollY = (((scrollY + rain.field.windY * rdt) % period) + period) % period;
      rain.step(rainT);
      packDensityRgba(rain.view, N, rgba, N);
      densitySource.update();
    }
    poseShips();
    computeVis();
    const f = ships[P.follow];
    cam.x = f ? f.x : OWN.x;
    cam.y = f ? f.y : OWN.y;
    for (const p of panels) {
      if (!p.root.visible) continue;
      const ppu = Math.min(p.w, p.h) / P.spanU;
      p.world.scale.set(ppu);
      p.world.pivot.set(cam.x, cam.y);
      p.world.position.set(p.w / 2, p.h / 2);
      const top = P.rainOnTop ? 1 : 0;
      if (p.world.getChildIndex(p.rainLayer) !== top) p.world.setChildIndex(p.rainLayer, top);
      placeRain(p, ppu);
      ships.forEach((s, i) => {
        const m = p.looks[i].mesh;
        m.position.set(s.x, s.y);
        m.rotation = s.heading;
        p.looks[i].set({ cols: P.cols, rows: P.rows, cutoff: P.cutoff, pxPerU: ppu * app.renderer.resolution, grainU: P.grainU, blurU: P.blurU, dStr: P.dStr });
      });
    }
    readoutAcc += dt;
    if (readoutAcc > 200) {
      readoutAcc = 0;
      renderReadout();
    }
  });

  // --- the side panel ----------------------------------------------------------

  side.innerHTML = `<h1>Rain sight bench</h1>`;
  const btns = document.createElement('div');
  btns.className = 'btns';
  side.appendChild(btns);
  const mkBtn = (text: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', fn);
    btns.appendChild(b);
    return b;
  };
  const soloBtns: HTMLButtonElement[] = [];
  const setSolo = (v: -1 | LookId): void => {
    P.solo = v;
    soloBtns.forEach((b, i) => b.classList.toggle('on', i === 0 ? v === -1 : LOOKS[i - 1].id === v));
    layout();
  };
  soloBtns.push(mkBtn('Compare', () => setSolo(-1)));
  for (const L of LOOKS) soloBtns.push(mkBtn(`Solo ${L.name}`, () => setSolo(L.id)));
  const pauseBtn = mkBtn('Pause', () => {
    P.paused = !P.paused;
    pauseBtn.textContent = P.paused ? 'Play' : 'Pause';
    pauseBtn.classList.toggle('on', P.paused);
  });
  mkBtn('Reseed', () => {
    P.seed = (Math.random() * 0xffffffff) >>> 0;
    rain.reseed(P.seed, rainT);
    placeShips();
  });

  const slider = (
    label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void,
    fmt: (v: number) => string,
  ): void => {
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
    row.append(lab, inp);
    side.appendChild(row);
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

  slider('Rain thickness k', 0, 0.02, 0.0005, () => P.k, (v) => (P.k = v),
    (v) => `${v.toFixed(4)}/u · 100 u → V ${Math.exp(-v * 100).toFixed(2)}`);
  slider('Rain coverage', 0, 0.6, 0.01, () => P.coverage, (v) => {
    P.coverage = v;
    rain.setCoverage(v, rainT);
  }, (v) => `${Math.round(v * 100)} %`);
  slider('Time speed (rain clock)', 1, 60, 1, () => P.timeSpeed, (v) => (P.timeSpeed = v), (v) => `${v}×`);
  check('Time speed moves ships too', () => P.shipsFollowSpeed, (v) => (P.shipsFollowSpeed = v));
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
  hint.style.cssText = 'font-size:13px;color:#8b95a5;margin-top:6px';
  hint.textContent = 'Click a ship row to follow it; click a panel label to solo it.';
  side.appendChild(hint);
  const renderReadout = (): void => {
    const rows = ships
      .map((s, i) => {
        const d = Math.hypot(s.x - OWN.x, s.y - OWN.y);
        const on = P.follow === i ? ' style="color:#00e8ff"' : '';
        return `<tr data-i="${i}"${on}><td>${s.cls}</td><td>${Math.round(d)}</td><td>${s.vMin.toFixed(2)}</td><td>${s.vMax.toFixed(2)}</td></tr>`;
      })
      .join('');
    table.innerHTML = `<tr><th>ship</th><th>dist u</th><th>min V</th><th>max V</th></tr>${rows}`;
  };

  setSolo(-1);
  layout();
  renderReadout();
  // headless verification seam
  (window as unknown as { __bench: unknown }).__bench = { ships, P, rain, panels };
}

boot().catch((e: unknown) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#ff6666;position:fixed;bottom:0;left:0;font-size:14px">${String(e)}</pre>`);
});
