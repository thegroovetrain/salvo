// FOG BANK rendering from FrameMsg.fog (Story 9.10, epic-9 amendments 162–169).
// Contact-like per-observer rows `{id, x, y, r, d}`, recomputed by the server
// every tick: `r` is the bank's CURRENT radius (u), `d` its density 0..1. A row
// simply stops arriving when the bank leaves the viewer's 750 u halo, dies, or
// falls behind an island — the client holds no fog state beyond what it draws,
// reads no fog dial from CONFIG, and NEVER decides visibility (the server
// already withheld every contact the eye cannot see through the haze).
//
// THE LAYER: chartRoot's `fog` layer, directly above `litZone` and below
// `smoke`, every marker, every hull and nameplate, the countermeasure cloud,
// the radar paints and the own hull (render/stage.ts — amendment 169: a hull
// delivered from inside a bank stays visible above the haze).
//
// THE LOOK: Eric's pick B, "Wisps" (2026-10-15, on the rendered candidates
// page): soft overlapping puffs of several pale greys (`colors.fogBank` ×
// a per-puff shade), centre-biased so the body is dense and the rim ragged.
// One Graphics per bank; each puff is three concentric circles whose alphas
// stack into a soft centre-to-rim falloff (the wounded-smoke puff idiom,
// render/smoke.ts). The layout is SEEDED from the bank id (mulberry32 over
// hashSeedText) so every viewer sees the same wisps. The bank's group alpha is
// `d × maxAlpha` (a young bank is thin); its puff count scales with area (a
// young bank is sparse).
//
// NO PER-FRAME DRAWING: the puffs are stamped at a radius and the Graphics is
// SCALED to the live radius; they are re-stamped only when `r` has moved more
// than `restampFracR` of itself (the layout is append-only in the seeded
// sequence, so a re-stamp at a larger radius keeps every existing puff and
// adds the new ones). Per frame only position, scale and alpha are written.
//
// DRIFT: the whole bank drifts `driftU` on an INTEGRATED phase at `driftHz`
// (the foul-zone weed idiom), each bank offset by a seeded phase so banks do
// not move in lockstep. Motion off → the phase holds and the offset is 0.
//
// FADE-OUT: a row that stops arriving fades its alpha to 0 over `fadeOutMs`
// (frame time) and is then dropped; a row that returns mid-fade snaps back.
//
// THE HALO + ISLAND LINE OF SIGHT (amendment 60's mask, reused): the haze is
// seen by eye only within the viewer's flash rung and never behind an island.
// The same pieces the countermeasure's `cloud` layer is masked with —
// render/hazeHalo.ts (the rung + feather), render/hazeLos.ts `HazeLosCaster`
// (the island fan) and textures.ts `bakeHaloMaskTexture` — build this layer's
// own mask sprite (one Pixi sprite cannot mask two layers), centred on the own
// hull. No own pose (a spectator) → no mask: a spectator sees every bank.
// The mask is baked lazily, only while a bank is held and a pose exists.

import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { hashSeedText, mulberry32, type FogBankView, type Island } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { ScreenWorldRect } from './camera.js';
import { BASE_HAZE_HALO_U, haloSpanU } from './hazeHalo.js';
import { HazeLosCaster } from './hazeLos.js';
import { HALO_MASK_TEXTURE_SIZE, bakeHaloMaskTexture } from './textures.js';

const F = CLIENT_CONFIG.fogBank;
/** The halo's own knobs (feather, ray count, re-cast step) — shared with the
 *  countermeasure's mask so the two hazes end at the same edge. */
const H = CLIENT_CONFIG.countermeasure;
const COLOR = CLIENT_CONFIG.colors.fogBank;
const TAU = Math.PI * 2;
/** Largest frame gap (ms) the drift integrator advances across (a
 *  backgrounded tab must not jump the drift — the foul-zone precedent). */
const MAX_DRIFT_DT_MS = 500;
/** One puff's three stacked circles: radius fractions; each carries a third
 *  of the puff's strength, so the centre reads ≈ strength and the rim ≈ 0. */
const PUFF_RINGS = [1, 0.66, 0.33] as const;

/** Scene-graph label of the fog layer's halo mask (test seam). */
export const FOG_HALO_MASK_LABEL = 'fogHaloMask';

/** One puff in bank-local coordinates (u, at the stamp radius). */
export interface FogPuff {
  x: number;
  y: number;
  /** Puff radius (u). */
  r: number;
  /** Centre strength (alpha before the bank's group alpha). */
  a: number;
  /** Grey multiplier on `colors.fogBank`. */
  shade: number;
}

/** Pure: puffs in a bank of radius `r` — `puffsPer250 × (r/250)²`, clamped. */
export function fogPuffCount(r: number): number {
  if (!(r > 0)) return 0;
  const n = Math.round(F.puffsPer250 * (r / 250) ** 2);
  return Math.min(F.puffMaxCount, Math.max(F.puffMinCount, n));
}

/** Pure: draw one puff off the seeded sequence (Eric's page's `wisps()`:
 *  a √u polar landing pulled in to 0.8, jittered ±0.15 R — centre-biased). */
function drawPuff(next: () => number, R: number): FogPuff {
  const rad = R * Math.sqrt(next()) * 0.95;
  const ang = next() * TAU;
  const x = Math.cos(ang) * rad * 0.8 + (next() - 0.5) * R * 0.3;
  const y = Math.sin(ang) * rad * 0.8 + (next() - 0.5) * R * 0.3;
  const r = R * (F.puffMinFracR + next() * (F.puffMaxFracR - F.puffMinFracR));
  const shade = F.shadeMin + next() * (F.shadeMax - F.shadeMin);
  const a = F.puffMinAlpha + next() * (F.puffMaxAlpha - F.puffMinAlpha);
  return { x, y, r, a, shade };
}

/**
 * Pure: the bank's puff layout, SEEDED from its id so every viewer draws the
 * same wisps. Append-only in the sequence: the first k puffs of a larger
 * stamp are the k puffs of a smaller one, scaled.
 */
export function fogPuffs(id: string, r: number): FogPuff[] {
  const rng = mulberry32(hashSeedText(id));
  const out: FogPuff[] = [];
  const n = fogPuffCount(r);
  for (let i = 0; i < n; i++) out.push(drawPuff(rng.next, r));
  return out;
}

/** Pure: the bank's group alpha — `d × maxAlpha` × the fade-out fraction;
 *  never above `maxAlpha`, never below 0 (a non-finite d reads as 0). */
export function fogBankAlpha(d: number, fade = 1): number {
  const dd = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0;
  const ff = Math.min(1, Math.max(0, fade));
  return dd * F.maxAlpha * ff;
}

/** Pure: advance the shared drift phase (radians) by one frame — INTEGRATED;
 *  held when motion is off. */
export function advanceFogDrift(phase: number, dtMs: number, motionOn: boolean): number {
  if (!motionOn) return phase;
  const step = Math.min(MAX_DRIFT_DT_MS, Math.max(0, dtMs)) / 1000;
  return (phase + F.driftHz * step * TAU) % TAU;
}

/** Pure: `colors.fogBank` with every channel multiplied by `shade`, clamped. */
export function shadeFog(shade: number): number {
  const ch = (v: number): number => Math.min(255, Math.max(0, Math.round(v * shade)));
  return (ch((COLOR >> 16) & 0xff) << 16) | (ch((COLOR >> 8) & 0xff) << 8) | ch(COLOR & 0xff);
}

/** Stamp `puffs` into `g` (clearing what it held). */
function stampPuffs(g: Graphics, puffs: readonly FogPuff[]): void {
  g.clear();
  for (const p of puffs) {
    const color = shadeFog(p.shade);
    for (const k of PUFF_RINGS) g.circle(p.x, p.y, p.r * k).fill({ color, alpha: p.a / PUFF_RINGS.length });
  }
}

interface BankNode {
  g: Graphics;
  x: number;
  y: number;
  r: number;
  d: number;
  /** The radius the puffs were last stamped at (0 = never). */
  stampR: number;
  /** This bank's seeded drift phase offset (radians). */
  phase0: number;
  /** ms of fade left once its row stopped arriving; null = live. */
  fadeLeft: number | null;
  /** The sync generation that last delivered this bank's row. */
  gen: number;
  /** Server time of the last frame that delivered it. */
  seenAt: number;
}

export class FogBanks {
  private readonly banks = new Map<string, BankNode>();
  /** The banks' own container — the layer's second child, after the halo. */
  private readonly body = new Container();
  private readonly clip = new Rectangle();
  /** Shared integrated drift phase (radians). */
  private phase = 0;
  private gen = 0;
  /** The halo mask — built on first need (never drawn, always transformed). */
  private halo: Sprite | null = null;
  private haloU = BASE_HAZE_HALO_U;
  /** The radius the live mask texture was baked at (NaN = needs a bake). */
  private bakedAtU = Number.NaN;
  private islands: readonly Island[] = [];
  private readonly los = new HazeLosCaster(H.losRays);
  private castX = Number.NaN;
  private castY = Number.NaN;
  /** Does the mask currently carry island shadows (vs the plain disc)? */
  private shadowed = false;

  /** `layer` = chartRoot's `fog` layer. */
  constructor(private readonly layer: Container) {
    layer.addChild(this.body);
  }

  /**
   * Reconcile against this frame's rows (`f.fog ?? []`): a new id spawns, a
   * held id takes the row's centre / radius / density (and snaps back from a
   * fade), and every held id ABSENT from the rows starts fading out.
   * `now` = the frame's server time.
   */
  sync(rows: readonly FogBankView[], now: number): void {
    const gen = ++this.gen;
    for (const row of rows) {
      const node = this.banks.get(row.id) ?? this.spawn(row.id);
      node.x = row.x;
      node.y = row.y;
      node.r = row.r;
      node.d = row.d;
      node.fadeLeft = null;
      node.gen = gen;
      node.seenAt = now;
      this.restampIfNeeded(row.id, node);
    }
    for (const node of this.banks.values()) {
      if (node.gen !== gen && node.fadeLeft === null) node.fadeLeft = F.fadeOutMs;
    }
  }

  /**
   * Per render frame: advance the drift (motion-gated), run the fades (frame
   * time, `dtMs`), and place / scale / alpha every bank. `own` = the own
   * hull's pose (the halo's centre), null for a spectator (no mask);
   * `screen` = the world rect on screen (the mask pass is clipped to it).
   */
  update(
    dtMs: number,
    motionOn: boolean,
    own: { x: number; y: number } | null = null,
    screen: ScreenWorldRect | null = null,
  ): void {
    this.phase = advanceFogDrift(this.phase, dtMs, motionOn);
    const amp = motionOn ? F.driftU : 0;
    for (const [id, node] of this.banks) {
      if (node.fadeLeft !== null) {
        node.fadeLeft -= Math.max(0, dtMs);
        if (node.fadeLeft <= 0) {
          this.despawn(id);
          continue;
        }
      }
      this.place(node, amp);
    }
    this.placeHalo(own);
    this.clipToScreen(screen);
  }

  /**
   * The viewer's halo radius — `hazeHaloU(radarRange)`, fed beside the
   * countermeasure's (main.ts). A non-finite or non-positive radius holds the
   * last good one; a change re-bakes (and re-casts) on the next masked frame.
   */
  setHaloU(haloU: number): void {
    if (!Number.isFinite(haloU) || haloU <= 0 || haloU === this.haloU) return;
    this.haloU = haloU;
    this.castX = Number.NaN;
  }

  /** The match's islands — the halo's sight blockers (main.ts, once per map). */
  setIslands(islands: readonly Island[]): void {
    this.islands = islands;
    this.castX = Number.NaN;
  }

  /** Drop every bank (the match-boundary reset). */
  clear(): void {
    for (const id of [...this.banks.keys()]) this.despawn(id);
  }

  /** How many banks are held, fading ones included (test seam). */
  get size(): number {
    return this.banks.size;
  }

  /** The shared drift phase (radians; test seam). */
  get driftPhase(): number {
    return this.phase;
  }

  /** A held bank's Graphics (test seam). */
  nodeOf(id: string): Graphics | null {
    return this.banks.get(id)?.g ?? null;
  }

  /** The halo mask sprite, once built (test seam). */
  get haloMask(): Sprite | null {
    return this.halo;
  }

  private spawn(id: string): BankNode {
    const g = new Graphics();
    g.label = `fog:${id}`;
    this.body.addChild(g);
    const node: BankNode = {
      g,
      x: 0,
      y: 0,
      r: 0,
      d: 0,
      stampR: 0,
      phase0: (hashSeedText(id) / 0x100000000) * TAU,
      fadeLeft: null,
      gen: 0,
      seenAt: 0,
    };
    this.banks.set(id, node);
    return node;
  }

  private despawn(id: string): void {
    const node = this.banks.get(id);
    if (!node) return;
    node.g.destroy();
    this.banks.delete(id);
  }

  /** Re-stamp the puffs when the radius has drifted past `restampFracR`. */
  private restampIfNeeded(id: string, node: BankNode): void {
    if (!(node.r > 0)) return;
    if (node.stampR > 0 && Math.abs(node.r - node.stampR) <= F.restampFracR * node.r) return;
    node.stampR = node.r;
    stampPuffs(node.g, fogPuffs(id, node.r));
  }

  /** Write one bank's transform and alpha for this frame. */
  private place(node: BankNode, amp: number): void {
    const { g } = node;
    const shown = node.r > 0 && node.stampR > 0;
    g.visible = shown;
    if (!shown) return;
    const fade = node.fadeLeft === null ? 1 : node.fadeLeft / F.fadeOutMs;
    const p = this.phase + node.phase0;
    g.position.set(node.x + amp * Math.sin(p), node.y + amp * 0.5 * Math.sin(2 * p));
    g.scale.set(node.r / node.stampR);
    g.alpha = fogBankAlpha(node.d, fade);
  }

  /** Centre the halo on the own hull, or take the mask off (spectator,
   *  non-finite pose, or nothing held — an empty masked layer would still pay
   *  the mask's filter pass, the countermeasure's perf finding). */
  private placeHalo(own: { x: number; y: number } | null): void {
    if (own === null || !Number.isFinite(own.x + own.y) || this.banks.size === 0) {
      this.layer.mask = null;
      return;
    }
    const halo = this.ensureHalo();
    this.refreshLos(halo, own);
    halo.position.set(own.x, own.y);
    if (this.layer.mask !== halo) this.layer.mask = halo;
  }

  /** The mask sprite, built on first need: renderable=false keeps its world
   *  transform without painting (the countermeasure's reasoning); first
   *  child, so the banks never depend on where it lands. */
  private ensureHalo(): Sprite {
    if (this.halo !== null) return this.halo;
    const halo = new Sprite(bakeHaloMaskTexture(this.haloU));
    halo.label = FOG_HALO_MASK_LABEL;
    halo.anchor.set(0.5);
    halo.renderable = false;
    this.bakedAtU = this.haloU;
    this.layer.addChildAt(halo, 0);
    this.halo = halo;
    this.scaleHalo(halo);
    return halo;
  }

  /** Re-bake for a halo change or a lost island set; re-cast the island fan
   *  when the hull moved `losRecastMoveU` or the halo / islands changed
   *  (castX NaN). */
  private refreshLos(halo: Sprite, own: { x: number; y: number }): void {
    const resized = this.haloU !== this.bakedAtU;
    if (resized) {
      this.bakedAtU = this.haloU;
      this.scaleHalo(halo);
    }
    if (this.islands.length === 0) {
      if (resized || this.shadowed) this.bakeHalo(halo, null);
      return;
    }
    if (Math.hypot(own.x - this.castX, own.y - this.castY) < H.losRecastMoveU) return;
    this.castX = own.x;
    this.castY = own.y;
    this.los.cast(own.x, own.y, this.haloU + H.haloFeatherU, this.islands);
    this.bakeHalo(halo, this.los.rays);
  }

  /** Redraw the mask in place: the fan through `rays`, or the plain disc. */
  private bakeHalo(halo: Sprite, rays: Float32Array | null): void {
    halo.texture = bakeHaloMaskTexture(this.haloU, halo.texture, rays);
    this.shadowed = rays !== null;
  }

  /** One texel = `2 × spanU / size` world units. */
  private scaleHalo(halo: Sprite): void {
    halo.scale.set((2 * haloSpanU(this.haloU)) / HALO_MASK_TEXTURE_SIZE);
  }

  /** Clip the mask pass to the screen (the countermeasure's Story 9.8 perf
   *  fix, same reasoning: pin the BODY's boundsArea to the screen's world
   *  rect while masked, so the filter target is screen ∩ halo). */
  private clipToScreen(screen: ScreenWorldRect | null): void {
    const masked = this.halo !== null && this.layer.mask === this.halo;
    const ok = masked && screen !== null
      && Number.isFinite(screen.x + screen.y + screen.w + screen.h) && screen.w > 0 && screen.h > 0;
    if (!ok) {
      this.body.boundsArea = null as unknown as Rectangle; // see countermeasure.ts
      return;
    }
    this.clip.x = screen.x;
    this.clip.y = screen.y;
    this.clip.width = screen.w;
    this.clip.height = screen.h;
    this.body.boundsArea = this.clip;
  }
}
