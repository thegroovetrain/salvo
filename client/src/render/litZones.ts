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

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { LitZoneView } from '@salvo/shared';

const PEAK_FILL_ALPHA = 0.12; // soft additive fill at full brightness
const RING_ALPHA = 0.38; // the zone edge, a touch brighter than the fill
const RING_W = 2; // u — edge stroke width
/** Fade the glow out over the last FADE_MS before expiry (a dying flare). */
export const LIT_FADE_MS = 1500;

/** Resolve a firer ship id `by` → the flare's tint (Story 1.12: the firer's bright
 *  personal hue for EVERY observer; amber when the firer left the roster). */
export type HueFor = (by: string) => number;

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

interface ZoneSprite {
  g: Graphics;
  until: number; // server-clock expiry — drives the render() fade
}

export class LitZones {
  private readonly sprites = new Map<string, ZoneSprite>();

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
  }

  /** Per render frame: fade each glow by its timestamp (until - serverNow). */
  render(serverNow: number): void {
    for (const { g, until } of this.sprites.values()) g.alpha = litZoneFade(until - serverNow);
  }

  private spawn(z: LitZoneView, hueFor: HueFor): void {
    const color = hueFor(z.by);
    const g = new Graphics();
    g.blendMode = 'add'; // additive: illuminated water, not an opaque disc
    g.circle(0, 0, z.r).fill({ color, alpha: PEAK_FILL_ALPHA });
    g.circle(0, 0, z.r).stroke({ width: RING_W, color, alpha: RING_ALPHA });
    g.position.set(z.x, z.y);
    this.layer.addChild(g);
    this.sprites.set(z.id, { g, until: z.until });
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }
}
