// One enemy hull drawn in one LOOK (A fine dissolve, B coarse dissolve, C fade,
// D fade + blur): a Mesh quad over the baked hull rectangle in HULL-LOCAL u,
// positioned / rotated like any ShipView, with a custom shader. Every lookup —
// the hull bake, the dissolve noise, the per-part visibility grid — is in hull
// uv, so the pattern is locked to the hull: it translates and turns with it
// and never changes frame to frame unless V itself changes.

import { BufferImageSource, Mesh, MeshGeometry, Shader, type UniformGroup } from 'pixi.js';
import type { HullBake } from './hull.js';

export const VIS_COLS_MAX = 16;
export const VIS_ROWS_MAX = 4;

export type LookId = 0 | 1 | 2 | 3;

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vLocal;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vLocal = aPosition;
}
`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vLocal;
out vec4 finalColor;
uniform sampler2D uHull;
uniform sampler2D uVis;
uniform sampler2D uNoise;
uniform vec4 uColor;
uniform float uMode;
uniform float uCols;
uniform float uRows;
uniform float uLen;
uniform float uBeam;
uniform float uCutoff;
uniform float uPxPerU;
uniform float uGrainU;
uniform float uBlurU;
uniform vec2 uSizeU;

const vec2 TAPS[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

float visAt(vec2 p) {
  float fx = clamp(p.x / uLen + 0.5, 0.0, 1.0);
  float fy = clamp(p.y / uBeam + 0.5, 0.0, 1.0);
  vec2 tc = vec2((fx * (uCols - 1.0) + 0.5) / ${VIS_COLS_MAX}.0, (fy * (uRows - 1.0) + 0.5) / ${VIS_ROWS_MAX}.0);
  return texture(uVis, tc).r;
}

void main() {
  float V = visAt(vLocal);
  vec4 c = texture(uHull, vUV);
  if (uMode > 2.5) {
    // D: blur grows as V drops — taps in hull space, a fixed pattern (no per-frame jitter)
    vec2 r = ((1.0 - V) * uBlurU) / uSizeU;
    if (r.x > 0.0) {
      for (int i = 0; i < 12; i++) c += texture(uHull, vUV + TAPS[i] * r);
      for (int i = 0; i < 12; i++) c += texture(uHull, vUV + TAPS[i] * r * 0.5);
      c /= 25.0;
    }
  }
  float a = V;
  if (uMode < 1.5) {
    // A / B: a hull pixel survives where noise < V, with a soft threshold edge
    vec4 nz = texture(uNoise, vUV);
    float n = uMode < 0.5 ? nz.r : nz.g;
    float w = 0.05 + fwidth(n);
    float t = mix(-w, 1.0 + w, V);
    float keep = 1.0 - smoothstep(t - w, t + w, n);
    // when a grain shrinks under ~1-2.5 screen px it cannot read (and would alias): fall back to the fade
    float far = smoothstep(1.0, 2.5, uGrainU * uPxPerU);
    a = mix(V, keep, far);
  }
  a *= smoothstep(uCutoff, uCutoff + 0.004, V);
  finalColor = c * a * uColor.a;
}
`;

let shared: { gl: { vertex: string; fragment: string } } | null = null;

export class LookHull {
  readonly mesh: Mesh;
  private readonly u: UniformGroup;

  constructor(bake: HullBake, vis: BufferImageSource, mode: LookId) {
    shared ??= { gl: { vertex, fragment } };
    const hw = bake.wU / 2;
    const hh = bake.hU / 2;
    const geometry = new MeshGeometry({
      positions: new Float32Array([-hw, -hh, hw, -hh, hw, hh, -hw, hh]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = Shader.from({
      gl: shared.gl,
      resources: {
        uHull: bake.rt.source,
        uVis: vis,
        uNoise: bake.noise,
        lookUniforms: {
          uMode: { value: mode, type: 'f32' },
          uCols: { value: 6, type: 'f32' },
          uRows: { value: 2, type: 'f32' },
          uLen: { value: bake.len, type: 'f32' },
          uBeam: { value: bake.beam, type: 'f32' },
          uCutoff: { value: 0.05, type: 'f32' },
          uPxPerU: { value: 1, type: 'f32' },
          uGrainU: { value: 2, type: 'f32' },
          uBlurU: { value: 5, type: 'f32' },
          uSizeU: { value: new Float32Array([bake.wU, bake.hU]), type: 'vec2<f32>' },
        },
      },
    });
    this.u = shader.resources.lookUniforms as UniformGroup;
    this.mesh = new Mesh({ geometry, shader });
  }

  set(p: { cols: number; rows: number; cutoff: number; pxPerU: number; grainU: number; blurU: number }): void {
    const u = this.u.uniforms;
    u.uCols = p.cols;
    u.uRows = p.rows;
    u.uCutoff = p.cutoff;
    u.uPxPerU = p.pxPerU;
    u.uGrainU = u.uMode < 0.5 ? p.grainU : p.grainU * 5;
    u.uBlurU = p.blurU;
    this.u.update();
  }
}

/** A ship's per-part visibility grid as a tiny LINEAR texture (bilinear interpolation across the hull for free). */
export function makeVisTexture(): { source: BufferImageSource; data: Uint8Array } {
  const data = new Uint8Array(VIS_COLS_MAX * VIS_ROWS_MAX * 4).fill(255);
  const source = new BufferImageSource({
    resource: data,
    width: VIS_COLS_MAX,
    height: VIS_ROWS_MAX,
    scaleMode: 'linear',
    alphaMode: 'no-premultiply-alpha',
  });
  return { source, data };
}
