// Star-shell lit-zone rendering from FrameMsg.litZones (contact-like per-observer
// state, not events — the mines.ts precedent, Story 1.7). Each zone is a soft
// ADDITIVE glow circle drawn in chartRoot's litZone layer (fog-immune, above the
// base map — the blips/sweep precedent, NOT a second fog-texture hole): a flare
// that illuminates a patch of ocean for 10s. Revealed ships/mines/ballistics
// inside the zone arrive through their OWN channels (contacts/mines) and render
// for free — this module only paints the glow.
//
// A zone is static (its center never moves) so a sprite's position is set once on
// spawn, exactly like a mine; reconcile() is the pure list→lifecycle diff. What a
// zone does that a mine doesn't is FADE: render() re-derives each glow's alpha
// every frame from `until - serverNow()` (timestamp math, phosphor decay
// precedent — the client keeps no timers). A zone dropping out of the list means
// expired OR out of radar range — the client cannot tell, and that ambiguity is
// the design (the mines precedent).

// STORY 2.9 (amendment 50) — a zone reads as its DOCTRINE, for every observer.
// A lit zone is observable behavior of a fired shell, and Eric ruled counterplay
// over concealment: `LitZoneView.mode` rides the wire so an INCENDIARY patch of
// burning water is distinguishable from a DAZZLE flash-blind and from an
// ordinary flare — you cannot play around a hazard you cannot see. The firer's
// personal hue keeps the RING (a zone always says whose it is); the doctrine
// layers INSIDE it, so the two channels never fight.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { LitZoneView, StarShellsMode } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

const Z = CLIENT_CONFIG.litZone;
const PEAK_FILL_ALPHA = 0.12; // soft additive fill at full brightness
const RING_ALPHA = 0.38; // the zone edge, a touch brighter than the fill
const RING_W = 2; // u — edge stroke width
/** INCENDIARY ember: the existing damage-marker crimson — burn feedback stays in
 *  the damage register (no new reds), and this is literally water on fire. */
const EMBER_COLOR = CLIENT_CONFIG.colors.damageMarker;
/** DAZZLE glare: the muzzle-flash near-white. A flash-blind is white light; it
 *  borrows no readout register (phosphor/amber/storm all stay meaningful). */
const GLARE_COLOR = CLIENT_CONFIG.colors.muzzle;
/** Fade the glow out over the last FADE_MS before expiry (a dying flare). */
export const LIT_FADE_MS = 1500;

export type { HueFor };

/**
 * Pure: the glow's alpha multiplier in [0,1] at `remainingMs` (= until -
 * serverNow) — full until the last `fadeMs`, then linear down to 0 as it
 * expires, and 0 once expired. Timestamp render math (phosphor decay precedent);
 * the client keeps no timers.
 */
export function litZoneFade(remainingMs: number, fadeMs = LIT_FADE_MS): number {
  if (remainingMs <= 0) return 0;
  if (remainingMs >= fadeMs) return 1;
  return remainingMs / fadeMs;
}

/** World-space geometry of one OWN active lit zone (`until` drives the fog-hole
 *  fade; x/y/r are the truesight-parity circle). Shared by the projectile
 *  beyond-sight cull-keep (P1) and the fog-clearing holes (P2). */
export interface OwnZone {
  x: number;
  y: number;
  r: number;
  until: number; // server-clock expiry
}

/**
 * Pure: the OWN ship's active lit zones (firer id `by === ownId`, not yet
 * expired vs serverNow). These are the ONLY zones that grant the local player
 * anything beyond the amber marker circle — the server reveals enemy
 * ships/mines/ballistics inside them (truesight parity), so the client must (a)
 * NOT cull a beyond-sight projectile that lies inside one (it will never be
 * re-sent — projectiles.ts) and (b) clear its own fog over them (fog.ts).
 * Enemy-owned and expired zones return nothing here (they stay marker-only).
 */
export function ownActiveZones(
  zones: readonly LitZoneView[],
  ownId: string | undefined,
  serverNow: number,
): OwnZone[] {
  const out: OwnZone[] = [];
  for (const z of zones) {
    if (z.by === ownId && z.until > serverNow) out.push({ x: z.x, y: z.y, r: z.r, until: z.until });
  }
  return out;
}

/**
 * Pure: the doctrine a zone view carries. A frame from an older server (or any
 * view built before amendment 50) simply has no `mode`, and reads as an ordinary
 * flare — the fail-open branch, so a missing field can never blank a zone.
 */
export function zoneMode(z: { mode?: StarShellsMode }): StarShellsMode {
  return z.mode ?? 'standard';
}

/** Ember-breath rate (Hz) for a burning zone — well under the shared
 *  photosensitivity ceiling, and nowhere near the ≤3 flashes/s regional cap. */
export const EMBER_HZ = Z.emberHz;

/** Largest frame gap (s) the ember phase integrator advances across (the hud.ts
 *  pulse precedent: a backgrounded tab must not jump the wave). */
const MAX_EMBER_DT = 0.5;

/**
 * Pure: advance the ember breath's PHASE (radians) by one frame. INTEGRATED,
 * never derived from absolute time — the hud.ts advancePulsePhase reasoning
 * verbatim: an integrated phase is continuous through any rate change, so the
 * cap on the rate is also a cap on how fast the alpha can move.
 */
export function advanceEmberPhase(phase: number, dtSec: number): number {
  const step = Math.min(MAX_EMBER_DT, Math.max(0, dtSec));
  return (phase + EMBER_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Pure: the ember layer's alpha at a phase. `amp` is motion-scaled by the caller
 * (halved at `reduced`, 0 at `off`), and the BASE alpha is information: the
 * burning disc — where the fire is and how big it is — renders identically at
 * every motion level, and only the breath stops.
 */
export function emberAlpha(phase: number, amp: number): number {
  return Z.emberAlpha + amp * Math.sin(phase);
}

/**
 * Pure: the DAZZLE glare's two disc radii (u) inside a zone of wire radius `r` —
 * the outer halo and the brighter core.
 *
 * BOTH ARE CONTAINED (`<= r`), and the clamp is structural rather than trusting
 * the config: `r` is the hazard's real extent, the firer-hue ring at `r` is its
 * boundary, and a glare painted outside that ring claims water that is not
 * dazzling — a marker drawn bigger than the thing it marks (amendment 47). A
 * future retune of the draft fractions cannot reintroduce it.
 */
export function dazzleRadii(r: number): { halo: number; core: number } {
  return { halo: r * Math.min(1, Z.haloFrac), core: r * Math.min(1, Z.glareFrac) };
}

/** Pure: is world point `p` inside any of the given zone circles (center/radius)? */
export function insideAnyZone(
  p: { x: number; y: number },
  zones: readonly { x: number; y: number; r: number }[],
): boolean {
  for (const z of zones) {
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    if (dx * dx + dy * dy <= z.r * z.r) return true;
  }
  return false;
}

/** What changed between the sprites we hold and the incoming zone list. */
export interface LitZoneDiff {
  add: LitZoneView[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's zone
 * list, return which zones to add and which sprite ids to remove. Ids present in
 * both are left untouched (a zone is static — its center/radius/expiry are fixed
 * at spawn, so nothing to update; only the per-frame fade changes, and that is
 * render()'s job).
 */
export function reconcileLitZones(
  current: ReadonlySet<string>,
  incoming: readonly LitZoneView[],
): LitZoneDiff {
  const seen = new Set<string>();
  const add: LitZoneView[] = [];
  for (const z of incoming) {
    seen.add(z.id);
    if (!current.has(z.id)) add.push(z);
  }
  const remove: string[] = [];
  for (const id of current) if (!seen.has(id)) remove.push(id);
  return { add, remove };
}

interface ZoneSprite extends HueState {
  g: Graphics;
  until: number; // server-clock expiry — drives the render() fade
  r: number; // zone radius (u) — needed to redraw on a firer-hue recolor
  mode: StarShellsMode; // the doctrine this glow paints (amendment 50)
  /** INCENDIARY only: the breathing ember disc, a CHILD of `g` so its own alpha
   *  can pulse without disturbing the glow's expiry fade (which rides `g.alpha`). */
  ember: Graphics | null;
}

export class LitZones {
  private readonly sprites = new Map<string, ZoneSprite>();
  /** INTEGRATED ember-breath phase + the clock it last advanced at (hud.ts's
   *  pulse precedent — accumulated per frame, never derived from absolute time). */
  private emberPhase = 0;
  private lastEmberSec: number | null = null;

  /** `layer` = chartRoot's litZone layer (fog-immune, above the base map). */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile sprites against this observer's zone list for the tick. `hueFor`
   * resolves each zone's firer id (`by`) to its personal hue (Story 1.12) — the
   * SAME tint for every observer. Treats a missing frame key as an empty list —
   * the caller passes `f.litZones ?? []` (frames omit the key when the observer
   * sees no zones).
   */
  sync(zones: readonly LitZoneView[], hueFor: HueFor): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), zones);
    for (const id of remove) this.despawn(id);
    for (const z of add) this.spawn(z, hueFor);
    // Story 1.12: recolor any glow that booted on the amber fallback (firer hue
    // not yet synced at spawn) once its personal hue lands — the mines precedent.
    for (const s of this.sprites.values()) retryHue(s, hueFor, (color) => this.drawGlow(s.g, s.r, color, s.mode));
  }

  /**
   * Per render frame: fade each glow by its timestamp (until - serverNow), and
   * breathe the burning zones' embers on the shared integrated phase. `nowSec`
   * is the server-clock estimate in SECONDS (the same clock the HP rail's pulse
   * rides); omitting it holds the ember at its base alpha, which is exactly what
   * motion=off does — the breath is the only part that is motion.
   */
  render(serverNow: number, nowSec?: number): void {
    const alpha = this.advanceEmber(nowSec);
    for (const { g, until, ember } of this.sprites.values()) {
      g.alpha = litZoneFade(until - serverNow);
      if (ember) ember.alpha = alpha;
    }
  }

  /** Advance the shared ember phase to `nowSec` and return this frame's ember
   *  alpha (motion-gated amplitude; the base alpha is information). */
  private advanceEmber(nowSec: number | undefined): number {
    if (nowSec !== undefined) {
      const dt = this.lastEmberSec === null ? 0 : nowSec - this.lastEmberSec;
      this.lastEmberSec = nowSec;
      this.emberPhase = advanceEmberPhase(this.emberPhase, dt);
    }
    return emberAlpha(this.emberPhase, motionScaled(Z.emberAmp, settings.current.motion));
  }

  private spawn(z: LitZoneView, hueFor: HueFor): void {
    const { color, colored, rev } = resolveHue(z.by, hueFor);
    const mode = zoneMode(z);
    const g = new Graphics();
    this.drawGlow(g, z.r, color, mode);
    g.position.set(z.x, z.y);
    this.layer.addChild(g);
    this.sprites.set(z.id, { g, until: z.until, r: z.r, by: z.by, colored, rev, mode, ember: this.emberOf(g, z.r, mode) });
  }

  /** The burning zone's ember disc: a child Graphics whose ALPHA breathes, so a
   *  glow's expiry fade (`g.alpha`) and the fire's breath never fight over one
   *  property. Null for every other doctrine. */
  private emberOf(g: Graphics, r: number, mode: StarShellsMode): Graphics | null {
    if (mode !== 'incendiary') return null;
    const ember = new Graphics();
    ember.blendMode = 'add';
    ember.circle(0, 0, r * Z.emberFrac).fill({ color: EMBER_COLOR, alpha: 1 });
    ember.alpha = Z.emberAlpha;
    g.addChild(ember);
    return ember;
  }

  /**
   * Draw the additive glow onto `g` (clearing prior geometry — the recolor path
   * redraws in place; the per-frame fade lives on `g.alpha`, untouched here).
   *
   * Every doctrine keeps the firer-hue ring and fill — that is the zone's
   * IDENTITY channel, and amendment 50 changed what a zone DOES, not whose it
   * is. `dazzle` adds a brighter core and a soft halo, both CONTAINED inside the
   * ring (dazzleRadii — the glare is what the zone is doing, the ring is where
   * it stops) and deliberately STATIC (a flickering flash-blind is the exact
   * hazard the flash budget exists to prevent); `incendiary`'s ember disc is a
   * separate breathing child (emberOf); `standard` paints exactly as before.
   */
  private drawGlow(g: Graphics, r: number, color: number, mode: StarShellsMode): void {
    g.clear();
    g.blendMode = 'add'; // additive: illuminated water, not an opaque disc
    if (mode === 'dazzle') {
      const glare = dazzleRadii(r);
      g.circle(0, 0, glare.halo).fill({ color: GLARE_COLOR, alpha: Z.haloAlpha });
      g.circle(0, 0, glare.core).fill({ color: GLARE_COLOR, alpha: Z.glareAlpha });
    }
    g.circle(0, 0, r).fill({ color, alpha: PEAK_FILL_ALPHA });
    g.circle(0, 0, r).stroke({ width: RING_W, color, alpha: RING_ALPHA });
  }

  /** The doctrine a held zone is painted as (test/debug seam). */
  modeOf(id: string): StarShellsMode | null {
    return this.sprites.get(id)?.mode ?? null;
  }

  /** The live ember alpha of a held burning zone (test seam for the breath);
   *  null for a zone with no ember (every non-incendiary doctrine). */
  emberAlphaOf(id: string): number | null {
    return this.sprites.get(id)?.ember?.alpha ?? null;
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy({ children: true }); // takes the ember child with it
    this.sprites.delete(id);
  }
}
