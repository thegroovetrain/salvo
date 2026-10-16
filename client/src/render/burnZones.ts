// PHOSPHOR SHELLS burning-zone rendering from FrameMsg.burnZones (Story 8.17,
// Eric ruling 2026-09-29, epic-8 amendment 131). Contact-like per-observer
// state, not events — recomputed per frame exactly like the lit zones
// (render/litZones.ts), and drawn in the same fog-immune chartRoot layer.
//
// A HAZARD ONLY. A burning zone reveals nothing, extends no gun's reach and is
// not a lit zone, so nothing here feeds the fog holes, the projectile
// cull-keep or the flare reach (those read `litZones` alone). The zone is
// drawn for every observer who can see it so they can steer clear — the
// counterplay-over-concealment ruling (amendment 50).
//
// STORY 9.11 — WHITE FIRE ON THE WATER (Eric 2026-10-14, epic-9 amendment 154:
// "I'd like to give them a white flame effect on the water, similarly to how
// the ship on fire effect looks. This instead of the red circle"). The crimson
// ember disc of epic-8 amendment 135(i) is DELETED with its config. The body
// is a field of flame tongues built from render/fire.ts's pure teardrop
// (`flameTongue`), WHITE for everyone, scattered over the WHOLE disc and
// denser toward the middle (ruling (e)), SEEDED from the zone id
// (`mulberry32(hashSeedText(id))`, the foulZones `weedStrokes` precedent) so
// every observer draws the same fire. OWNERSHIP READS ON THE ZONE GLOW — the
// family's soft fill + ring (litZones `drawZoneGlow`), white (own) or the shared
// alert blend (another's, render/alertBlend.ts). As first built the burn zone
// wore the ring ALONE; Eric on the rendered page (2026-10-16, amendment 181):
// "I want the inside of the zone to be colored, too, not just the ring. Looks
// weird compared to the others."
//
// INFORMATION, NOT JUICE (epic-4 amendment 49, fire.ts's header): the tongues'
// presence, positions, count and size are motion-blind; only the flicker (a
// sin wobble on each tongue's alpha and width — never an on/off) and the
// ring's color blend move, and at `motion: 'off'` both hold still.
//
// Display list per zone: root Container (carries the expiry fade,
// `litZoneFade`, whole) → [glow Graphics (fill + ring, the tint), fire Container → N tongue
// Graphics (alpha/scale per frame)]. The flicker rides each CHILD's alpha, the
// fade the root's, so a dying zone fades out whole and never flares back up.

import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { hashSeedText, mulberry32, type BurnZoneView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import { flameTongue } from './fire.js';
import { drawZoneGlow, litZoneFade, reconcileLitZones, zoneAlertTint } from './litZones.js';
import { OWN_TINT } from './alertBlend.js';

const Z = CLIENT_CONFIG.burnZone;
const TAU = Math.PI * 2;
const FLAME_COLOR = CLIENT_CONFIG.colors.white;

/** One tongue of a zone's fire, zone-local: where it stands, its size (a
 *  multiplier on `flameR`) and its flicker phase (radians). */
export interface BurnFlame {
  x: number;
  y: number;
  scale: number;
  phase: number;
}

/** Pure: how many tongues a zone of radius `r` burns with — by AREA,
 *  `round(density · π r² / 1000)`, clamped to [flameMin, flameMax]. */
export function flameCountFor(r: number): number {
  const area = Number.isFinite(r) && r > 0 ? Math.PI * r * r : 0;
  const n = Math.round((Z.flameDensityPer1000U2 * area) / 1000);
  return Math.min(Z.flameMax, Math.max(Z.flameMin, n));
}

/**
 * Pure: the zone's fire layout, SEEDED from the zone id so every observer
 * draws the same tongues at the same places. Each tongue stands at distance
 * `r · √u` with `u = rng^flameCenterBias` (the weedStrokes √u scatter on a
 * biased draw): bias 1 would be uniform over the area, the shipped 2 is
 * `r · rng` — an area density ∝ 1/ρ, visibly thicker toward the middle and
 * still reaching the ring. Angle uniform; scale uniform in
 * [flameScaleMin, flameScaleMax]; flicker phase uniform in [0, 2π).
 */
export function burnFlames(id: string, r: number): BurnFlame[] {
  const rng = mulberry32(hashSeedText(id));
  const reach = Number.isFinite(r) && r > 0 ? r : 0;
  const out: BurnFlame[] = [];
  const n = flameCountFor(r);
  for (let i = 0; i < n; i++) {
    const rad = reach * Math.sqrt(rng.next() ** Z.flameCenterBias);
    const ang = rng.next() * TAU;
    const scale = Z.flameScaleMin + rng.next() * (Z.flameScaleMax - Z.flameScaleMin);
    out.push({ x: rad * Math.cos(ang), y: rad * Math.sin(ang), scale, phase: rng.next() * TAU });
  }
  return out;
}

/**
 * Pure: a tongue's flicker MULTIPLIER on its alpha and width at `ms` — the
 * render/fire.ts `flameFlicker` shape on this zone's own knobs
 * (`burnZone.flickerHz` / `flickerAmp`). `intensity` is the motion multiplier
 * (1 / 0.5 / 0); at 0 this is exactly 1 — a still tongue at full strength.
 * `ms` is the SERVER clock (`serverNow`): a sine needs no wrap, and every
 * observer's fire flickers on the same time base.
 */
export function burnFlicker(ms: number, intensity: number, phase: number): number {
  if (!(intensity > 0) || !Number.isFinite(ms)) return 1;
  return 1 + Z.flickerAmp * intensity * Math.sin(TAU * Z.flickerHz * (ms / 1000) + phase);
}

/** The one tongue geometry every tongue shares: a white halo teardrop with a
 *  hotter white core, drawn ONCE (lazily — after Pixi is loaded) and shared
 *  by every tongue Graphics; it is never owned, so a despawn never frees it. */
let tongueContext: GraphicsContext | null = null;
function sharedTongue(): GraphicsContext {
  tongueContext ??= new GraphicsContext()
    .poly(flameTongue(Z.flameR), true)
    .fill({ color: FLAME_COLOR, alpha: Z.flameHaloAlpha })
    .poly(flameTongue(Z.flameR * 0.55), true)
    .fill({ color: FLAME_COLOR, alpha: Z.flameCoreAlpha });
  return tongueContext;
}

interface Tongue {
  g: Graphics;
  scale: number;
  phase: number;
}

interface BurnSprite {
  /** The zone root: its alpha carries the expiry fade, whole. */
  root: Container;
  /** The ownership glow — fill + ring (white geometry; own white / another's
   *  alert tint). */
  glow: Graphics;
  tongues: Tongue[];
  until: number; // server-clock expiry — drives the render() fade
  own: boolean;
}

export class BurnZones {
  private readonly sprites = new Map<string, BurnSprite>();

  /** `layer` = chartRoot's litZone layer (fog-immune, above the base map) —
   *  the same layer the lit zones draw in. */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile sprites against this observer's burning-zone list for the tick.
   * `ownId` = this observer's session id (undefined for a spectator: nobody's
   * zone is ours). The caller passes `f.burnZones ?? []` (frames omit the key
   * when the observer sees none).
   */
  sync(zones: readonly BurnZoneView[], ownId: string | undefined): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), zones);
    for (const id of remove) this.despawn(id);
    for (const z of add) this.spawn(z, ownId);
  }

  /**
   * Per render frame: fade each zone by its timestamp (until − serverNow),
   * tint its glow (own white / another's by the shared alert clock at
   * `nowSec`, seconds — omitted, the clock holds) and flicker its tongues on
   * `serverNow` (motion-scaled; still at motion off).
   */
  render(serverNow: number, nowSec?: number): void {
    const tint = zoneAlertTint(nowSec);
    const intensity = motionIntensity(settings.current.motion);
    for (const s of this.sprites.values()) {
      s.root.alpha = litZoneFade(s.until - serverNow);
      s.glow.tint = s.own ? OWN_TINT : tint;
      for (const t of s.tongues) {
        const f = burnFlicker(serverNow, intensity, t.phase);
        t.g.alpha = Math.min(1, f);
        t.g.scale.set(t.scale * f, t.scale);
      }
    }
  }

  /** How many tongues a held burning zone burns with (test seam). Null for
   *  an id we hold no sprite for. */
  flameCountOf(id: string): number | null {
    return this.sprites.get(id)?.tongues.length ?? null;
  }

  /** How many burning zones are held (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private spawn(z: BurnZoneView, ownId: string | undefined): void {
    const root = new Container();
    root.position.set(z.x, z.y);
    const glow = new Graphics();
    drawZoneGlow(glow, z.r);
    const own = ownId !== undefined && z.by === ownId;
    glow.tint = own ? OWN_TINT : zoneAlertTint(undefined); // right from the first draw
    const fire = new Container();
    const tongues: Tongue[] = [];
    for (const fl of burnFlames(z.id, z.r)) {
      const g = new Graphics(sharedTongue());
      g.blendMode = 'add'; // glows over the water, like the hull fire
      g.position.set(fl.x, fl.y);
      g.scale.set(fl.scale);
      fire.addChild(g);
      tongues.push({ g, scale: fl.scale, phase: fl.phase });
    }
    root.addChild(glow, fire);
    this.layer.addChild(root);
    this.sprites.set(z.id, { root, glow, tongues, until: z.until, own });
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.root.destroy({ children: true }); // the shared tongue context is not owned — it survives
    this.sprites.delete(id);
  }
}
