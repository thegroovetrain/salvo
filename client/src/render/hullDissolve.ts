// THE A+D HULL LOOK (Story 11.6; Eric 2026-11-14, Story 11.6 bench page, look
// "A+D", mode 2 of the page's `look.ts`: "that looks goddamn fucking perfect").
// The Pixi half of render/rainSight.ts: one Filter on a hull view's container
// that dissolves and softens the hull by the rain's per-part visibility V.
//
// THE SHADER, ported from the bench page's mode 2 (branch
// worktree-rain-sight-bench, bench/rain-sight/src/look.ts):
// - V at a pixel is the hull's V grid (6 × 2, rainSight.ts) interpolated
//   bilinearly in HULL-LOCAL space between the grid's cell centers (clamped at
//   the outer ones).
// - A: a hull pixel survives where the dissolve noise < V, at a soft threshold
//   edge (0.05 + fwidth(noise)). The noise is ONE texture in hull-local u, so
//   the pattern moves and turns with the hull and is never re-rolled per frame.
// - D on the survivors, scaled by s = `dStrength`: alpha × mix(1, V, s), and a
//   blur of radius (1 − V) × `blurU` × s (u), its 24 taps laid in hull space.
// - THE FAR FALLBACK: when a grain covers under `farFromPx`..`farToPx` screen
//   pixels, A blends to D's plain fade (a sub-pixel grain cannot read and
//   would alias). Pixels per u come from the fragment's own derivative.
// - Below the vanish cutoff (`CONFIG.fog.sightCutoffV`) a part is gone.
//
// HOW THE FILTER KNOWS THE HULL: Pixi renders the container into a screen-space
// texture and the filter reads `vTextureCoord` in it. `apply` asks the filter
// system for the matrix from that coordinate to the hull container's LOCAL
// space (`calculateSpriteMatrix` — the mask filter's own recipe — on a proxy
// that is the container with a 1 × 1 frame), so the vertex shader hands the
// fragment its hull-local point. Turrets rotate inside the container: they are
// filtered with the deck, so a pre-baked hull texture is never needed.
//
// WHEN IT RUNS: the filter is ATTACHED only while some grid point reads below
// clear water (rainSight.ts `rainLookMode`); a clear-water hull draws exactly
// as it always has, with no filter pass. It is built on first need and kept
// for the view's life (detached, never destroyed).
//
// THE GPU BUDGET (epic-11 amendment 6): the pass is Pixi's measure of the hull
// container (its screen bounds), fitted to the viewport (`clipToViewport`),
// plus a padding of the blur's spill capped at `maxPadPx` — never larger than
// the screen plus that margin. No antialias (no MSAA renderbuffer).
//
// THE TEXTURE RULE (amendment 7): the dissolve noise is ONE BufferImageSource,
// created once per page on first need and never destroyed or replaced — every
// filter that ever bound it keeps it alive. The V grid travels as uniforms, so
// no per-hull texture exists at all.
//
// NO WEBGL: the GL program is the only one, so a renderer that is not WebGL
// (`setHullDissolveSupport`, set by stage.ts after init) gets the plain fade by
// the grid's mean V instead (rainSight.ts 'fade').

import { BufferImageSource, Filter, GlProgram, Matrix, UniformGroup, type Container, type FilterSystem, type Sprite, type Texture } from 'pixi.js';
import { CONFIG, SHIP_CLASS_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { RAIN_GRID_COLS, RAIN_GRID_N, RAIN_GRID_ROWS, meanVisibility, rainLookMode } from './rainSight.js';

const L = CLIENT_CONFIG.rainLook;

/** The most grid points the shader carries (four vec4 uniforms). */
export const DISSOLVE_MAX_POINTS = 16;
/** Dissolve-noise texels per u (the bench page's NOISE_TEXELS_PER_U). */
export const NOISE_TEXELS_PER_U = 2;

/** V — the width of the shader's vanish edge above the cutoff (alpha × smoothstep(cutoff, cutoff + this, V)). */
export const VANISH_EDGE_V = 0.004;

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLocal;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uUvToLocal;

void main(void)
{
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
  vLocal = (uUvToLocal * vec3(vTextureCoord, 1.0)).xy;
}
`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vTextureCoord;
in vec2 vLocal;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uNoise;
uniform vec4 uInputClamp;
uniform mat3 uLocalToUv;
uniform vec4 uVis0;
uniform vec4 uVis1;
uniform vec4 uVis2;
uniform vec4 uVis3;
uniform vec4 uGrid;   // cols, rows, hull length u, hull beam u
uniform vec4 uLook;   // grain u, blur u at V 0, D strength, vanish cutoff V
uniform vec4 uNoiseMap; // noise extent w u, h u, far-fallback from px, to px

const vec2 TAPS[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

float visN(int i) {
  int q = i / 4;
  int r = i - q * 4;
  vec4 v = q == 0 ? uVis0 : (q == 1 ? uVis1 : (q == 2 ? uVis2 : uVis3));
  return r == 0 ? v.x : (r == 1 ? v.y : (r == 2 ? v.z : v.w));
}

// V between the grid's cell centers (point (c, r) at u = ((c + 0.5) / cols - 0.5) * length).
float visAt(vec2 p) {
  float cols = uGrid.x;
  float rows = uGrid.y;
  float fc = clamp((p.x / uGrid.z + 0.5) * cols - 0.5, 0.0, cols - 1.0);
  float fr = clamp((p.y / uGrid.w + 0.5) * rows - 0.5, 0.0, rows - 1.0);
  float c0 = floor(fc);
  float r0 = floor(fr);
  int ic0 = int(c0);
  int ic1 = int(min(c0 + 1.0, cols - 1.0));
  int ir0 = int(r0) * int(cols);
  int ir1 = int(min(r0 + 1.0, rows - 1.0)) * int(cols);
  float a = mix(visN(ir0 + ic0), visN(ir0 + ic1), fc - c0);
  float b = mix(visN(ir1 + ic0), visN(ir1 + ic1), fc - c0);
  return mix(a, b, fr - r0);
}

vec4 hullAt(vec2 uv) {
  return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void)
{
  float V = visAt(vLocal);
  float s = uLook.z;
  // the derivatives first, in uniform control flow
  float n = texture(uNoise, vLocal / uNoiseMap.xy + 0.5).r;
  float w = 0.05 + fwidth(n);
  float pxPerU = 1.0 / max(length(dFdx(vLocal)), 1e-6);
  vec4 c = hullAt(vTextureCoord);
  // D's blur grows as V drops — taps in hull space, a fixed pattern (no per-frame jitter)
  float r = (1.0 - V) * uLook.y * s;
  if (r > 0.0) {
    for (int i = 0; i < 12; i++) {
      vec2 d = (uLocalToUv * vec3(TAPS[i] * r, 0.0)).xy;
      c += hullAt(vTextureCoord + d);
      c += hullAt(vTextureCoord + d * 0.5);
    }
    c /= 25.0;
  }
  // A: a hull pixel survives where noise < V, with a soft threshold edge
  float t = mix(-w, 1.0 + w, V);
  float keep = 1.0 - smoothstep(t - w, t + w, n);
  // a grain under ~1-2.5 screen px cannot read (and would alias): fall back to the fade
  float far = smoothstep(uNoiseMap.z, uNoiseMap.w, uLook.x * pxPerU);
  float a = mix(V, keep, far);
  // A+D: the survivors also fade by D, scaled by s
  a *= mix(1.0, V, s);
  a *= smoothstep(uLook.w, uLook.w + ${VANISH_EDGE_V.toFixed(4)}, V);
  finalColor = c * a;
}
`;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Pure: THE SHADER'S ALPHA, mirrored line for line from the fragment above —
 * the multiplier a hull pixel at visibility `V` is drawn with, given its
 * dissolve survival `keep` ∈ [0, 1] (1 − smoothstep of noise past the
 * threshold) and the far-fallback blend `far` ∈ [0, 1] (0 = the plain fade).
 * The test seam that holds the sent-hull floor clear of the vanish edge.
 */
export function dissolveAlpha(V: number, keep: number, far: number): number {
  const s = L.dStrength;
  let a = V + (keep - V) * far;
  a *= 1 + (V - 1) * s;
  return a * smoothstep(CONFIG.fog.sightCutoffV, CONFIG.fog.sightCutoffV + VANISH_EDGE_V, V);
}

// --- support ------------------------------------------------------------------

let supported = false;

/** stage.ts, once after init: can the A+D filter run on this renderer (WebGL)? */
export function setHullDissolveSupport(webgl: boolean): void {
  supported = webgl;
}

/** Can the A+D filter run here? (false until stage.ts says so — the fade fallback). */
export function hullDissolveSupported(): boolean {
  return supported;
}

// --- the dissolve noise (deterministic, hull-local, histogram-equalized) -------

/** u — the noise texture's extent: the largest class hull plus the pad, both ways. */
export function noiseExtentU(): { w: number; h: number } {
  let len = 0;
  let beam = 0;
  for (const id of SHIP_CLASS_IDS) {
    const h = CONFIG.shipClasses[id].hull;
    len = Math.max(len, h.length);
    beam = Math.max(beam, h.beam);
  }
  return { w: len + 2 * L.noisePadU, h: beam + 2 * L.noisePadU };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 668265261) ^ Math.imul(iy, 374761393) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
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

/** The page's fine grain: 2 octaves of value noise, lacunarity 2.03. */
function grain(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed) + 0.5 * valueNoise(x * 2.03, y * 2.03, seed + 1013);
}

/**
 * Pure: the dissolve noise, `w × h` texels at NOISE_TEXELS_PER_U over the
 * hull-local rectangle, grain `grainU` — rank-equalized to a uniform [0, 1]
 * spread so "noise < V" keeps exactly a V share of the hull (the page's
 * `fillNoise` R channel). Returns the equalized values, row-major.
 */
export function dissolveNoise(w: number, h: number, grainU: number, seed: number): Float32Array {
  const vals = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) / NOISE_TEXELS_PER_U;
    for (let i = 0; i < w; i++) vals[j * w + i] = grain(((i + 0.5) / NOISE_TEXELS_PER_U) / grainU, y / grainU, seed);
  }
  const idx = new Uint32Array(vals.length);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  idx.sort((p, q) => vals[p] - vals[q]);
  const out = new Float32Array(vals.length);
  const d = Math.max(1, vals.length - 1);
  for (let r = 0; r < idx.length; r++) out[idx[r]] = r / d;
  return out;
}

/** The page's noise seed. */
const NOISE_SEED = 2654435769; // the page's seed (golden-ratio constant), written in decimal: the color-literal guard reads 8-digit hex as a color

let noiseSource: BufferImageSource | null = null;

/** THE dissolve noise source: built once per page, never destroyed or replaced (amendment 7). */
function dissolveNoiseSource(): BufferImageSource {
  if (noiseSource !== null) return noiseSource;
  const ext = noiseExtentU();
  const w = Math.ceil(ext.w * NOISE_TEXELS_PER_U);
  const h = Math.ceil(ext.h * NOISE_TEXELS_PER_U);
  const vals = dissolveNoise(w, h, L.grainU, NOISE_SEED);
  const rgba = new Uint8Array(w * h * 4);
  for (let k = 0; k < vals.length; k++) {
    const b = Math.round(vals[k] * 255);
    rgba[k * 4] = b;
    rgba[k * 4 + 1] = b;
    rgba[k * 4 + 2] = b;
    rgba[k * 4 + 3] = 255;
  }
  noiseSource = new BufferImageSource({
    resource: rgba,
    width: w,
    height: h,
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
    alphaMode: 'no-premultiply-alpha',
  });
  return noiseSource;
}

// --- the filter -----------------------------------------------------------------

let program: GlProgram | null = null;

/** The hull container seen as calculateSpriteMatrix's sprite: its transform, a 1 × 1 frame at its origin. */
class LocalFrame {
  readonly texture = { orig: { width: 1, height: 1 } };
  readonly anchor = { x: 0, y: 0 };
  constructor(private readonly target: Container) {}
  get worldTransform(): Matrix {
    return this.target.worldTransform;
  }
  get renderGroup(): Container['renderGroup'] {
    return this.target.renderGroup;
  }
  get parentRenderGroup(): Container['parentRenderGroup'] {
    return this.target.parentRenderGroup;
  }
}

type RenderSurface = Parameters<Filter['apply']>[2];

/** The A+D filter for one hull container. */
export class HullDissolveFilter extends Filter {
  private readonly frame: LocalFrame;
  private readonly u: UniformGroup;

  constructor(target: Container) {
    program ??= GlProgram.from({ vertex, fragment, name: 'hull-dissolve-filter' });
    const ext = noiseExtentU();
    const u = new UniformGroup({
      uUvToLocal: { value: new Matrix(), type: 'mat3x3<f32>' },
      uLocalToUv: { value: new Matrix(), type: 'mat3x3<f32>' },
      uVis0: { value: new Float32Array(4).fill(1), type: 'vec4<f32>' },
      uVis1: { value: new Float32Array(4).fill(1), type: 'vec4<f32>' },
      uVis2: { value: new Float32Array(4).fill(1), type: 'vec4<f32>' },
      uVis3: { value: new Float32Array(4).fill(1), type: 'vec4<f32>' },
      uGrid: { value: new Float32Array([RAIN_GRID_COLS, RAIN_GRID_ROWS, 1, 1]), type: 'vec4<f32>' },
      uLook: { value: new Float32Array([L.grainU, L.blurU, L.dStrength, CONFIG.fog.sightCutoffV]), type: 'vec4<f32>' },
      uNoiseMap: { value: new Float32Array([ext.w, ext.h, L.farFromPx, L.farToPx]), type: 'vec4<f32>' },
    });
    // resolution 'inherit': the pass renders at the render target's resolution
    // (devicePixelRatio up to 2), so a hull never softens when the filter attaches
    super({
      glProgram: program, resources: { dissolveUniforms: u, uNoise: dissolveNoiseSource() },
      antialias: 'off', padding: 0, resolution: 'inherit',
    });
    this.frame = new LocalFrame(target);
    this.u = u;
  }

  /** This frame's V grid (RAIN_GRID_N values, layout rainSight.ts) and the hull's size in its local u. */
  setGrid(vis: ArrayLike<number>, lengthU: number, beamU: number): void {
    const un = this.u.uniforms as Record<string, Float32Array>;
    const slots = [un.uVis0, un.uVis1, un.uVis2, un.uVis3];
    for (let i = 0; i < DISSOLVE_MAX_POINTS; i++) slots[i >> 2][i & 3] = i < vis.length ? vis[i] : 1;
    un.uGrid[2] = lengthU;
    un.uGrid[3] = beamU;
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    const un = this.u.uniforms as { uUvToLocal: Matrix; uLocalToUv: Matrix };
    filterManager.calculateSpriteMatrix(un.uUvToLocal, this.frame as unknown as Sprite);
    un.uLocalToUv.copyFrom(un.uUvToLocal).invert();
    filterManager.applyFilter(this, input, output, clearMode);
  }
}

if (RAIN_GRID_N > DISSOLVE_MAX_POINTS) throw new Error(`hull sight grid ${RAIN_GRID_N} points > the shader's ${DISSOLVE_MAX_POINTS}`);

/** Pure: the blur's spill in logical px for a hull drawn at `pxPerU` (logical px per u), capped at `maxPadPx`. */
export function dissolvePaddingPx(pxPerU: number): number {
  const spill = L.blurU * L.dStrength * (Number.isFinite(pxPerU) && pxPerU > 0 ? pxPerU : 0);
  return Math.min(L.maxPadPx, Math.ceil(spill) + 1);
}

/**
 * One hull view's rain look: attaches / detaches its filter, or reports the
 * fade fallback. The view multiplies its own alpha by `apply`'s return.
 */
export class HullDissolve {
  private filter: HullDissolveFilter | null = null;
  private readonly list: Filter[] = [];
  private on = false;

  constructor(private readonly target: Container) {}

  /** Is the filter attached right now? */
  get active(): boolean {
    return this.on;
  }

  /**
   * This frame's look for grid `vis` (null = no observer / no rain) on a hull
   * `lengthU` × `beamU`. Returns the alpha multiplier the view applies: 1, or
   * the mean V under the no-WebGL fade.
   */
  apply(vis: ArrayLike<number> | null, lengthU: number, beamU: number): number {
    const mode = rainLookMode(vis, supported);
    if (mode !== 'filter') {
      this.detach();
      return mode === 'fade' ? meanVisibility(vis as ArrayLike<number>) : 1;
    }
    const f = this.ensure();
    f.setGrid(vis as ArrayLike<number>, lengthU, beamU);
    const wt = this.target.worldTransform;
    f.padding = dissolvePaddingPx(Math.hypot(wt.a, wt.b));
    if (!this.on) {
      this.target.filters = this.list;
      this.on = true;
    }
    return 1;
  }

  /** Take the filter off (it is kept for the next need, never destroyed). */
  detach(): void {
    if (!this.on) return;
    this.target.filters = null;
    this.on = false;
  }

  private ensure(): HullDissolveFilter {
    if (this.filter === null) {
      this.filter = new HullDissolveFilter(this.target);
      this.list.push(this.filter);
    }
    return this.filter;
  }
}
