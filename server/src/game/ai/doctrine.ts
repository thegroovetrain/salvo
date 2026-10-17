// THE GUN DOCTRINE (Story 9.13, epic-9 amendment 198) — the band the MOUNTED
// GUN owns, and the reach every deck-gun solve honours.
//
// Eric 2026-10-17: the gun owns its band on the FULL-DAMAGE radius and the
// profile only nudges it; the 9.8 stopgap profile fractions retire.
//   cannon      — stand off CONFIG.bots.gunBand.cannon of its range, lead;
//   machine gun — HOLD FIRE and close until inside the band's max, then stream;
//   flak        — close to inside the band's max, aim at the predicted centre.
// Every edge is a fraction of the gun's own folded `rangeU` (so a RANGE card
// moves the band for free), shifted by the profile's signed `bandNudge`.
//
// THE LIT LIFT (amendments 187 and 198): a deck-gun shot whose map-clamped aim
// point lies inside one of the bot's OWN live star-shell lit zones is legal
// past `rangeU` and deals full damage. `effectiveReach` mirrors the server's
// one rule (shared `gunReachU` / `pointInLitZone`, server guns.ts
// `attenRangeFor`) so a bot never solves a shot its own gun refuses — and an
// enemy's flare lifts nothing.
//
// Pure: no rng, no writes. Own-flare identity is the `by` the lit-zone row
// carries (the firer's ship id — a human client knows its own id).

import {
  CONFIG,
  clampInsideMap,
  pointInLitZone,
  type EffectiveStats,
  type LitZoneView,
  type SlotItemId,
  type Vec2,
} from '@salvo/shared';
import type { BotSelf } from './types.js';
import type { BotProfile } from './profiles.js';
import type { TacticContext } from './tacticKit.js';

/** The three deck guns (slot 0) — the only weapons the lit lift serves. */
export type DeckGun = 'gun' | 'machineGun' | 'flak';

/** The gun mounted in slot 0 (Story 8.15): the machine gun and flak by their
 *  own ids, anything else (the cannon, an empty or unknown slot) the cannon. */
export function mountedGun(gunId: SlotItemId | null | undefined): DeckGun {
  return gunId === 'machineGun' || gunId === 'flak' ? gunId : 'gun';
}

/** The CONFIG.bots.gunBand key for a deck gun (the cannon's row is `cannon`). */
function bandKey(gun: DeckGun): keyof typeof CONFIG.bots.gunBand {
  return gun === 'gun' ? 'cannon' : gun;
}

/** u — a deck gun's folded reach. */
export function gunRangeU(stats: EffectiveStats, gun: DeckGun): number {
  return stats.equipment[gun].rangeU;
}

/** The profile's signed in/out nudge, a fraction of range (amendment 198).
 *  Read structurally so a profile row without the field reads 0. */
function bandNudgeOf(profile: BotProfile): number {
  const n = (profile as { bandNudge?: number }).bandNudge;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** The doctrine band, in world units. `holdFireAboveU` is the MG / flak HOLD
 *  rule (no stream or burst beyond it unless lit-exempt); Infinity for the
 *  cannon, which fires at any range its row allows (attenuated). */
export interface GunBand {
  min: number;
  max: number;
  holdFireAboveU: number;
}

/**
 * THE GUN'S BAND (amendment 198): CONFIG.bots.gunBand[<mounted gun>] × rangeU,
 * both edges shifted by `profile.bandNudge × rangeU` and kept on [0, rangeU];
 * for the machine gun and flak the near edge is 0 (they close, never open)
 * and the far edge is also the hold-fire line — EXCEPT while SHADOWING
 * (`shadowing`: the `kite` posture, Eric 2026-10-17, epic-9 amendment 205),
 * when the hold line is lifted to the gun's full `rangeU`: a shadowing bot
 * does not close, so it may fire attenuated at range. The band edges (where
 * the helm holds station) do not move.
 */
export function gunBand(profile: BotProfile, stats: EffectiveStats, gunId?: SlotItemId | null, shadowing = false): GunBand {
  const gun = mountedGun(gunId);
  const rangeU = gunRangeU(stats, gun);
  const [minFrac, maxFrac] = CONFIG.bots.gunBand[bandKey(gun)];
  const nudge = bandNudgeOf(profile);
  const edge = (f: number): number => Math.min(rangeU, Math.max(0, (f + nudge) * rangeU));
  const max = edge(maxFrac);
  if (gun === 'gun') return { min: Math.min(max, edge(minFrac)), max, holdFireAboveU: Infinity };
  return { min: 0, max, holdFireAboveU: shadowing ? rangeU : max };
}

/** What a deck-gun solve needs to know about reach. */
export interface EffectiveReach {
  /** u — the row's own reach (`rangeU`). */
  maxU: number;
  /** u — the full-damage radius (`CONFIG.gunAttenuation.fullFrac × rangeU`). */
  fullU: number;
  /** Is a shot at `p` exempt from the reach (and from attenuation)? True iff
   *  the map-clamped point lies inside an OWN live lit zone. */
  litExempt(p: Vec2): boolean;
}

/** The inputs of `effectiveReach` — all self-reads or the bot's own view. */
export interface ReachInput {
  stats: EffectiveStats;
  /** The bot's OWN live lit zones (see `ownLitZones`). */
  ownLitZones: readonly LitZoneView[];
  /** The firing hull's centre (the server measures reach from it). */
  origin: Vec2;
  /** The public map radius; omitted = no clamp. */
  mapRadius?: number;
}

/** THE REACH (amendments 187/198) for one deck gun. */
export function effectiveReach(input: ReachInput, weapon: DeckGun): EffectiveReach {
  const maxU = gunRangeU(input.stats, weapon);
  const zones = input.ownLitZones;
  const mapRadius = input.mapRadius;
  return {
    maxU,
    fullU: CONFIG.gunAttenuation.fullFrac * maxU,
    litExempt: (p) => {
      if (zones.length === 0) return false;
      const q = mapRadius === undefined ? p : clampInsideMap(input.origin, p, mapRadius);
      return pointInLitZone(q, zones);
    },
  };
}

/** This hull's own id, read off its self-read record (World hands the
 *  ShipRecord itself; a human client knows its own id). Null when a
 *  hand-built self carries none — then no zone is own. */
export function selfIdOf(self: BotSelf): string | null {
  const id = (self as { readonly id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

/** The OWN live lit zones in a view: `by` is this hull and `until > now`. */
export function ownLitZones(
  zones: readonly LitZoneView[] | undefined,
  selfId: string | null,
  now: number,
): LitZoneView[] {
  if (zones === undefined || selfId === null) return [];
  return zones.filter((z) => z.by === selfId && z.until > now);
}

/** The reach of `weapon` in a tactic context (own zones off the mind's view). */
export function reachOf(ctx: TacticContext, weapon: DeckGun): EffectiveReach {
  return effectiveReach(
    {
      stats: ctx.sit.stats,
      ownLitZones: ownLitZones(ctx.mind.view?.litZones, selfIdOf(ctx.self), ctx.sit.now),
      origin: { x: ctx.sit.x, y: ctx.sit.y },
      mapRadius: ctx.sit.waterR,
    },
    weapon,
  );
}

/** The MOUNTED gun's slot-0 id in a tactic context (the situation's copy,
 *  else the loadout's own). */
function mountedIdOf(ctx: TacticContext): SlotItemId | null | undefined {
  return ctx.sit.gunId !== undefined ? ctx.sit.gunId : ctx.self.loadout[0]?.equipmentId;
}

/** The MOUNTED gun's reach in a tactic context. */
export function mountedReachOf(ctx: TacticContext): EffectiveReach {
  return reachOf(ctx, mountedGun(mountedIdOf(ctx)));
}

/** The MOUNTED gun's doctrine band in a tactic context — the hold line
 *  lifted while the bot is shadowing (`kite`, amendment 205). */
export function mountedBandOf(ctx: TacticContext): GunBand {
  return gunBand(ctx.sit.profile, ctx.sit.stats, mountedIdOf(ctx), ctx.posture === 'kite');
}
