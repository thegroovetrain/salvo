// THE FOG WISPS TILE (Story 9.10 re-plan "THE FIELD"; Eric's pick B "Wisps",
// 2026-10-15): soft overlapping puffs of several pale greys, baked ONCE into a
// square tile that repeats seamlessly. render/fogField.ts draws the fog as
// this tile seen through the shared density field, so the field decides WHERE
// fog is and the tile decides what it LOOKS like.
//
// Pure and Pixi-free on purpose: the tile can be re-rendered outside the game
// (a candidates page, a test) from `bakePuffTile(seed)` alone — the alpha and
// shade planes are plain Float32Arrays, `puffTileRgba` turns them into the
// rgba bytes the game uploads.
//
// THE BAKE: `puffsPerTile` puffs land UNIFORMLY on the tile (a tile has no
// centre to bias toward), each a radius in [puffMinU, puffMaxU] at
// `puffPxPerU` px per u, a centre opacity in [puffMinAlpha, puffMaxAlpha] and
// a grey shade in [shadeMin, shadeMax]. A puff's opacity falls off as
// (1 − (d/r)²)² to 0 at its rim. Overlaps composite like stacked translucent
// sheets — alpha = 1 − Π(1 − aᵢ) — and the shade is the opacity-weighted mean
// of the puffs covering the texel. Every stamp WRAPS at the tile edges, so the
// tile is a torus and repeats without a seam.

import { hashSeedText, mulberry32 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** The fixed seed of the one wisps tile (purely visual; every client bakes the same tile). */
export const PUFF_TILE_SEED = hashSeedText('fog-wisps');

/** The slice of `CLIENT_CONFIG.fogField` the bake reads. */
export interface PuffTileConfig {
  puffTilePx: number;
  puffPxPerU: number;
  puffsPerTile: number;
  puffMinU: number;
  puffMaxU: number;
  puffMinAlpha: number;
  puffMaxAlpha: number;
  shadeMin: number;
  shadeMax: number;
}

/** A baked tile: `size`² texels, row-major (index = y × size + x). */
export interface PuffTile {
  readonly size: number;
  /** Composited puff opacity per texel, 0..1. */
  readonly alpha: Float32Array;
  /** Grey multiplier of `colors.fogBank` per texel (1 where no puff lands). */
  readonly shade: Float32Array;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  a: number;
  shade: number;
}

/** Working planes of the bake: Π(1 − aᵢ), Σ wᵢ, Σ wᵢ·shadeᵢ. */
interface Planes {
  keep: Float32Array;
  w: Float32Array;
  ws: Float32Array;
}

const lerp = (lo: number, hi: number, u: number): number => lo + (hi - lo) * u;

function drawPuff(next: () => number, cfg: PuffTileConfig, size: number): Puff {
  return {
    x: next() * size,
    y: next() * size,
    r: lerp(cfg.puffMinU, cfg.puffMaxU, next()) * cfg.puffPxPerU,
    a: lerp(cfg.puffMinAlpha, cfg.puffMaxAlpha, next()),
    shade: lerp(cfg.shadeMin, cfg.shadeMax, next()),
  };
}

/** Stamp one puff into the planes, wrapping every texel onto the torus. */
function stamp(p: Puff, size: number, planes: Planes): void {
  const r2 = p.r * p.r;
  const x0 = Math.floor(p.x - p.r);
  const y0 = Math.floor(p.y - p.r);
  const x1 = Math.ceil(p.x + p.r);
  const y1 = Math.ceil(p.y + p.r);
  for (let ty = y0; ty <= y1; ty++) {
    const dy = ty + 0.5 - p.y;
    const row = (((ty % size) + size) % size) * size;
    for (let tx = x0; tx <= x1; tx++) {
      const dx = tx + 0.5 - p.x;
      const q = (dx * dx + dy * dy) / r2;
      if (q >= 1) continue;
      const f = (1 - q) * (1 - q) * p.a;
      const i = row + (((tx % size) + size) % size);
      planes.keep[i] *= 1 - f;
      planes.w[i] += f;
      planes.ws[i] += f * p.shade;
    }
  }
}

/**
 * Pure: bake the wisps tile for `seed`. Deterministic — same seed + cfg →
 * identical planes. ~400 puffs over 512² texels: a few ms, once per page.
 */
export function bakePuffTile(seed: number = PUFF_TILE_SEED, cfg: PuffTileConfig = CLIENT_CONFIG.fogField): PuffTile {
  const size = Math.max(1, Math.round(cfg.puffTilePx));
  const n = size * size;
  const planes: Planes = { keep: new Float32Array(n).fill(1), w: new Float32Array(n), ws: new Float32Array(n) };
  const rng = mulberry32(seed >>> 0);
  for (let k = 0; k < cfg.puffsPerTile; k++) stamp(drawPuff(rng.next, cfg, size), size, planes);
  const alpha = new Float32Array(n);
  const shade = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    alpha[i] = 1 - planes.keep[i];
    shade[i] = planes.w[i] > 0 ? planes.ws[i] / planes.w[i] : 1;
  }
  return { size, alpha, shade };
}

/** `color` with every channel multiplied by `shade`, clamped to a byte. */
function shadeChannel(color: number, shift: number, shade: number): number {
  return Math.min(255, Math.max(0, Math.round(((color >> shift) & 0xff) * shade)));
}

/** Pure: the tile as straight (un-premultiplied) rgba bytes — rgb = `color` ×
 *  the texel's shade, a = its opacity. `out` is reused when given. */
export function puffTileRgba(tile: PuffTile, color: number, out?: Uint8Array): Uint8Array {
  const n = tile.size * tile.size;
  const rgba = out ?? new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = tile.shade[i];
    rgba[i * 4] = shadeChannel(color, 16, s);
    rgba[i * 4 + 1] = shadeChannel(color, 8, s);
    rgba[i * 4 + 2] = shadeChannel(color, 0, s);
    rgba[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, tile.alpha[i])) * 255);
  }
  return rgba;
}
