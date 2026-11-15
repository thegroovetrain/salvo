// The real hull art (client/src/render/hullArt/pixiArt.ts) composed exactly as
// client/src/render/ships.ts composes it — deck, turrets at their shared
// stations in turretDrawOrder, outline on top — plus the bench's per-class
// bakes: the hull rendered once into a hull-local RenderTexture (mipmapped),
// and a hull-local dissolve-noise texture covering the same rectangle (so
// every per-pixel lookup is in hull space and the pattern rides the hull).

import { BufferImageSource, Container, Graphics, RenderTexture, type Renderer } from 'pixi.js';
import { CONFIG, turretMounts, turretRest, turretStation, type ShipClassId } from '@salvo/shared';
import { deckContext, outlineContext, turretContext } from '../../../client/src/render/hullArt/pixiArt.js';
import { turretDrawOrder } from '../../../client/src/render/hullArt/shapes.js';

export const PAD_U = 10; // u of margin around the hull in the bakes (outline width, blur spill)
export const BAKE_PX_PER_U = 8;
export const NOISE_TEXELS_PER_U = 2;

export function hullDims(cls: ShipClassId): { len: number; beam: number } {
  const h = CONFIG.shipClasses[cls].hull;
  return { len: h.length, beam: h.beam };
}

/** The ships.ts composition: deck, turrets (draw order, under the outline), outline. */
export function buildHullArt(cls: ShipClassId, line: number): Container {
  const root = new Container();
  const deck = new Graphics(deckContext(cls, line));
  const outline = new Graphics(outlineContext(cls, line));
  root.addChild(deck, outline);
  const mounts = turretMounts(cls);
  const turrets: Graphics[] = [];
  for (let i = 0; i < mounts.length; i++) {
    const g = new Graphics(turretContext(cls, i, line));
    const p = turretStation(cls, i);
    g.position.set(p.x, p.y);
    g.rotation = turretRest(mounts[i]);
    turrets.push(g);
  }
  for (const i of turretDrawOrder(cls)) root.addChildAt(turrets[i], root.getChildIndex(outline));
  return root;
}

export interface HullBake {
  cls: ShipClassId;
  len: number;
  beam: number;
  /** The baked rectangle in hull-local u: x ∈ [-wU/2, wU/2], y ∈ [-hU/2, hU/2]. */
  wU: number;
  hU: number;
  rt: RenderTexture;
  noise: BufferImageSource;
  noiseW: number;
  noiseH: number;
  noiseRgba: Uint8Array;
}

export function bakeHull(renderer: Renderer, cls: ShipClassId, line: number): HullBake {
  const { len, beam } = hullDims(cls);
  const wU = len + 2 * PAD_U;
  const hU = beam + 2 * PAD_U;
  const rt = RenderTexture.create({
    width: Math.ceil(wU * BAKE_PX_PER_U),
    height: Math.ceil(hU * BAKE_PX_PER_U),
    resolution: 1,
    antialias: true,
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
  });
  rt.source.style.mipmapFilter = 'linear';
  rt.source.style.maxAnisotropy = 8;
  const art = buildHullArt(cls, line);
  const holder = new Container();
  holder.addChild(art);
  art.scale.set(BAKE_PX_PER_U);
  art.position.set((wU / 2) * BAKE_PX_PER_U, (hU / 2) * BAKE_PX_PER_U);
  renderer.render({ container: holder, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
  rt.source.updateMipmaps();
  holder.destroy({ children: true });
  const noiseW = Math.ceil(wU * NOISE_TEXELS_PER_U);
  const noiseH = Math.ceil(hU * NOISE_TEXELS_PER_U);
  const noiseRgba = new Uint8Array(noiseW * noiseH * 4);
  const noise = new BufferImageSource({
    resource: noiseRgba,
    width: noiseW,
    height: noiseH,
    scaleMode: 'linear',
    alphaMode: 'no-premultiply-alpha',
  });
  return { cls, len, beam, wU, hU, rt, noise, noiseW, noiseH, noiseRgba };
}

// --- the dissolve noise (deterministic, hull-local, histogram-equalized) -----

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let s = 0;
  let amp = 1;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    s += valueNoise(x * f, y * f, seed + o * 1013) * amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s;
}

/** Rank-equalize to a uniform [0, 1] spread, so "noise < V" keeps exactly a V share of the hull. */
function equalize(vals: Float32Array): Float32Array {
  const idx = new Uint32Array(vals.length);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  idx.sort((p, q) => vals[p] - vals[q]);
  const out = new Float32Array(vals.length);
  const d = Math.max(1, vals.length - 1);
  for (let r = 0; r < idx.length; r++) out[idx[r]] = r / d;
  return out;
}

/**
 * Fill the bake's noise texture: R = fine grain (grain `grainU`, 2 octaves),
 * G = coarse blotches (5 × grainU, 3 octaves). Hull-local; regenerated only
 * when the grain slider moves — never per frame.
 */
export function fillNoise(b: HullBake, grainU: number, seed: number): void {
  const n = b.noiseW * b.noiseH;
  const fine = new Float32Array(n);
  const coarse = new Float32Array(n);
  const coarseU = grainU * 5;
  for (let j = 0; j < b.noiseH; j++) {
    const y = (j + 0.5) / NOISE_TEXELS_PER_U;
    for (let i = 0; i < b.noiseW; i++) {
      const x = (i + 0.5) / NOISE_TEXELS_PER_U;
      fine[j * b.noiseW + i] = fbm(x / grainU, y / grainU, seed, 2);
      coarse[j * b.noiseW + i] = fbm(x / coarseU, y / coarseU, seed ^ 0x5bd1e995, 3);
    }
  }
  const ef = equalize(fine);
  const ec = equalize(coarse);
  const px = b.noiseRgba;
  for (let k = 0; k < n; k++) {
    px[k * 4] = Math.round(ef[k] * 255);
    px[k * 4 + 1] = Math.round(ec[k] * 255);
    px[k * 4 + 2] = 0;
    px[k * 4 + 3] = 255;
  }
  b.noise.update();
}
