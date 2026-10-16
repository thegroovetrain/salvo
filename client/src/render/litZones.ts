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
//
// A LIT ZONE ONLY EVER LIGHTS (Story 8.17, Eric ruling 2026-09-29, epic-8
// amendment 134). The star shell's PHOSPHOR and DAZZLE verbs — and with them the
// `phos`/`daz` wire flags this module used to paint as an ember disc and a
// glare — are DELETED: PHOSPHOR SHELLS burns through its own channel
// (FrameMsg.burnZones, drawn by render/burnZones.ts — white fire on the water
// since Story 9.11); the FOULING SHELL (Story 9.4) slows through its
// own channel too (FrameMsg.foulZones, render/foulZones.ts).
//
// STORY 9.11 — THE ZONE FAMILY IS AN ALERT (Eric 2026-10-14, epic-9 amendment
// 153). The firer's personal hue has left the ring and fill: the glow is drawn
// once in WHITE, and per frame an OWN zone (`by === ownId`) keeps it white
// while anybody else's is tinted by the shared yellow↔orange alert blend
// (render/alertBlend.ts — one phase for every warning on screen, steady orange
// at motion off). A spectator owns nothing (ownId undefined — the
// `ownActiveZones` precedent), so every zone blends for them.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { LitZoneView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { settings } from '../settings/store.js';
import { alertClock, alertTint, OWN_TINT } from './alertBlend.js';

const PEAK_FILL_ALPHA = 0.12; // soft additive fill at full brightness
const RING_ALPHA = 0.38; // the zone edge, a touch brighter than the fill
const RING_W = 2; // u — edge stroke width
/** The glow's geometry color: WHITE, so the per-frame `tint` IS the color
 *  (own white / another's alert blend) and nothing is ever redrawn to recolor. */
const GLOW_COLOR = CLIENT_CONFIG.colors.white;
/** Fade the glow out over the last FADE_MS before expiry (a dying flare). */
export const LIT_FADE_MS = 1500;

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
 * anything beyond the marker circle — the server reveals enemy
 * ships/mines/ballistics inside them (truesight parity), so the client must (a)
 * NOT cull a beyond-sight projectile that lies inside one (it will never be
 * re-sent — projectiles.ts) and (b) clear its own fog over them (fog.ts).
 * Enemy-owned and expired zones return nothing here (they stay marker-only).
 * A BURNING zone (render/burnZones.ts) never reaches this function: it reveals
 * nothing, so it must never clear fog or keep a track (amendment 131).
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
export interface LitZoneDiff<Z extends { id: string } = LitZoneView> {
  add: Z[];
  remove: string[];
}

/**
 * Pure: given the ids we currently have sprites for and the new frame's zone
 * list, return which zones to add and which sprite ids to remove. Ids present in
 * both are left untouched (a zone is static — its center/radius/expiry are fixed
 * at spawn, so nothing to update; only the per-frame fade and tint change, and
 * that is render()'s job). Generic over the zone shape so the burning-zone and
 * foul-zone renderers (render/burnZones.ts, render/foulZones.ts) reuse the one
 * diff.
 */
export function reconcileLitZones<Z extends { id: string } = LitZoneView>(
  current: ReadonlySet<string>,
  incoming: readonly Z[],
): LitZoneDiff<Z> {
  const seen = new Set<string>();
  const add: Z[] = [];
  for (const z of incoming) {
    seen.add(z.id);
    if (!current.has(z.id)) add.push(z);
  }
  const remove: string[] = [];
  for (const id of current) if (!seen.has(id)) remove.push(id);
  return { add, remove };
}

/**
 * Draw the zone family's glow onto `g` in WHITE (clearing prior geometry; the
 * per-frame fade lives on `g.alpha` and the ownership color on `g.tint`,
 * neither touched here): a soft additive fill and a brighter ring at `r`.
 * Exported because the burning zone (render/burnZones.ts) and the foul zone
 * (render/foulZones.ts) wear the same glow (Story 9.11, amendments 153 and 181).
 */
export function drawZoneGlow(g: Graphics, r: number): void {
  g.clear();
  g.blendMode = 'add'; // additive: illuminated water, not an opaque disc
  g.circle(0, 0, r).fill({ color: GLOW_COLOR, alpha: PEAK_FILL_ALPHA });
  g.circle(0, 0, r).stroke({ width: RING_W, color: GLOW_COLOR, alpha: RING_ALPHA });
}

/**
 * Pure-ish: advance the shared alert clock to `nowSec` (when given) and return
 * this frame's tint for ANOTHER's zone. The same `nowSec` the mines advanced
 * the clock with is a no-op, so every warning reads one phase.
 */
export function zoneAlertTint(nowSec: number | undefined): number {
  if (nowSec !== undefined) alertClock.advance(nowSec);
  return alertTint(alertClock.phase, settings.current.motion);
}

interface ZoneSprite {
  g: Graphics;
  until: number; // server-clock expiry — drives the render() fade
  /** Is this OUR zone (`by === ownId` at spawn)? Own = white, else the blend. */
  own: boolean;
}

export class LitZones {
  private readonly sprites = new Map<string, ZoneSprite>();

  /** `layer` = chartRoot's litZone layer (fog-immune, above the base map). */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile sprites against this observer's zone list for the tick. `ownId`
   * is this observer's session id (undefined for a spectator / pre-session —
   * then nobody's zone is ours). Treats a missing frame key as an empty list —
   * the caller passes `f.litZones ?? []` (frames omit the key when the observer
   * sees no zones).
   */
  sync(zones: readonly LitZoneView[], ownId: string | undefined): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), zones);
    for (const id of remove) this.despawn(id);
    for (const z of add) this.spawn(z, ownId);
  }

  /** Per render frame: fade each glow by its timestamp (until - serverNow) and
   *  tint it — own white, another's by the shared alert clock at `nowSec`
   *  (seconds; omitted = the clock is not advanced, the phase holds). */
  render(serverNow: number, nowSec?: number): void {
    const tint = zoneAlertTint(nowSec);
    for (const { g, until, own } of this.sprites.values()) {
      g.alpha = litZoneFade(until - serverNow);
      g.tint = own ? OWN_TINT : tint;
    }
  }

  private spawn(z: LitZoneView, ownId: string | undefined): void {
    const g = new Graphics();
    drawZoneGlow(g, z.r);
    g.position.set(z.x, z.y);
    this.layer.addChild(g);
    const own = ownId !== undefined && z.by === ownId;
    g.tint = own ? OWN_TINT : zoneAlertTint(undefined); // right from the first draw
    this.sprites.set(z.id, { g, until: z.until, own });
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy({ children: true });
    this.sprites.delete(id);
  }
}
