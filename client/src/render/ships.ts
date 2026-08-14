// Procedural ship hull view, now driven by the SHARED silhouette polygon
// (sim/silhouette.ts — the silhouette IS the hitbox). One code path keyed by
// hull id: the three pickable classes render their ratified board silhouettes;
// drone hull ids render the legacy chevron (exactly what hullSilhouette returns
// for a drone id).
//
// Story 1.12 (Regatta Hoist): every combatant hull — own AND contact — draws as
// a 1.5px stroke in the pilot's BRIGHT personal hue over a SOLID interior in that
// hue's darker ~45%-value fill. Drones (roster sentinel 255) wear the drone greys.
// A roster-miss / pre-roster hull falls back to an amber hollow outline (the old
// contact look). The style is per-view and swappable (setColors) so the own hull
// can boot on the fallback and recolor the instant its roster hue is known.
//
// The render polygon is the shared local-frame silhouette VERBATIM (bow at +x,
// origin-centered, world units) — no independent geometry, so what you see is
// the collision/hit-test hull. The view is added to a camera-transformed layer,
// so world heading == sprite rotation (no y-flip — see camera.ts).

import { Graphics } from 'pixi.js';
import { REGATTA_HUES, hullSilhouette, type HullId, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import type { WorldFlashGate } from './effects.js';

const C = CLIENT_CONFIG.colors;
const FB = CLIENT_CONFIG.flashBudget;

/** The full 20-hue Regatta wheel (bright outline / darker fill), wheel order. */
const REGATTA_OUTLINES: readonly number[] = REGATTA_HUES.map((n) => C.players[n]);
const REGATTA_FILLS: readonly number[] = REGATTA_HUES.map((n) => C.playerFills[n]);

/** The eight colorblind-assist families (config key order IS family order). */
const CVD_OUTLINES: readonly number[] = Object.values(C.cvd);
const CVD_FILLS: readonly number[] = Object.values(C.cvdFills);

/**
 * Pure: the assist FAMILY index a Regatta wheel index collapses onto
 * (amendment 18). Modulo keeps the 20 wheel indices evenly spread over the 8
 * families — adjacent wheel entries (which are adjacent HUES, the pairs the
 * assist exists to separate) always land on different families.
 */
export function cvdFamilyIndex(wheelIndex: number, families = CVD_OUTLINES.length): number {
  return ((wheelIndex % families) + families) % families;
}

/**
 * Bright outline hue by Regatta wheel index. LIVE binding: `setColorblindAssist`
 * swaps the whole table at this ONE chokepoint, and every consumer (hulls,
 * nameplates, wake, kill feed, ordnance tint) reads through it, so the assist
 * needs no per-consumer wiring. ESM live bindings mean importers see the swap.
 */
export let PLAYER_HUES: readonly number[] = REGATTA_OUTLINES;
/** Darker interior fill by Regatta wheel index — swapped with PLAYER_HUES. */
export let PLAYER_FILLS: readonly number[] = REGATTA_FILLS;

/** Bumped every time the hue tables are swapped, so latched consumers (own hull
 *  color, contact styles, nameplates) know to re-resolve. */
let revision = 0;
let assistOn = false;

/** The current hue-table revision (see `revision` above). */
export function hueRevision(): number {
  return revision;
}

/** Is the colorblind-assist remap currently applied? */
export function colorblindAssist(): boolean {
  return assistOn;
}

/**
 * THE colorblind-assist chokepoint: project the 20-hue wheel onto the eight
 * separated families (on) or restore the ratified Regatta wheel (off). Cheap
 * and idempotent — a no-op call leaves the revision untouched.
 */
export function setColorblindAssist(on: boolean): void {
  if (on === assistOn) return;
  assistOn = on;
  PLAYER_HUES = on ? REGATTA_OUTLINES.map((_, i) => CVD_OUTLINES[cvdFamilyIndex(i)]) : REGATTA_OUTLINES;
  PLAYER_FILLS = on ? REGATTA_FILLS.map((_, i) => CVD_FILLS[cvdFamilyIndex(i)]) : REGATTA_FILLS;
  revision += 1;
}

export interface ShipStyle {
  /** Hull outline (stroke) color. */
  stroke: number;
  /** Solid interior fill color, or null for a hollow outline (the fallback). */
  fill: number | null;
}

/** Roster-miss / pre-roster fallback: amber hollow outline. */
export const FALLBACK_STYLE: ShipStyle = { stroke: C.amber, fill: null };
/** Drone hull style (roster sentinel 255): grey outline + solid grey interior. */
export const DRONE_STYLE: ShipStyle = { stroke: C.droneOutline, fill: C.droneFill };

/**
 * Personal-hue style for a Regatta wheel index — bright stroke + darker fill —
 * or the amber-hollow fallback when the index is null (roster miss / not yet
 * assigned) or out of range. Drones never route here (they use DRONE_STYLE via
 * their hull id).
 */
export function hullStyle(index: number | null): ShipStyle {
  if (index === null || index < 0 || index >= PLAYER_HUES.length) return FALLBACK_STYLE;
  return { stroke: PLAYER_HUES[index], fill: PLAYER_FILLS[index] };
}

/** Style for a contact, given its hull id and resolved roster hue index. A drone
 *  hull id wins (greys); otherwise the personal-hue style (or fallback). */
export function contactStyle(hullId: HullId, index: number | null): ShipStyle {
  return isDroneHull(hullId) ? DRONE_STYLE : hullStyle(index);
}

/** True for the three drone hull ids (which never carry a personal hue). */
export function isDroneHull(hullId: HullId): boolean {
  return hullId === 'droneSmall' || hullId === 'droneMedium' || hullId === 'droneLarge';
}

/** Pure: per-channel linear blend of two packed 0xRRGGBB colors (t=0 → a, 1 → b). */
function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number): number =>
    Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t) << shift;
  return ch(16) | ch(8) | ch(0);
}

/** A hull's rendered tint + alpha + scale for one frame. */
export interface HullLook {
  tint: number;
  alpha: number;
  /** Hull scale — 1 alive, `CLIENT_CONFIG.ship.sunkScale` fully foundered.
   *  "Settling lower in the water" in the only channel a top-down chart has. */
  scale: number;
}

/** [0,1] clamp; NaN reads as 0 (`!(v > 0)` catches it). */
function clamp01(v: number): number {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}

/**
 * Pure: the hull look for a frame.
 *
 * `flash` is the hit-flash INTENSITY in [0,1], NOT a duration — Story 2.3 /
 * amendment: `reduced` motion halves the flash's STRENGTH while keeping its
 * full duration (a shorter flash is easier to MISS, which is the opposite of an
 * accessibility affordance), and `off` passes 0 so no flash is applied at all.
 * The hp bar, damage markers and kill feed carry the information statically at
 * every level.
 *
 * `sink` is THE SETTLE (Story 5.2 fix): the hull's progress through its sinking
 * window in [0,1], and it was a BOOLEAN until this cycle. Every channel is now
 * a continuous interpolation between the alive look at 0 and the wreck look at
 * 1, so a hull crossing the window darkens toward `sunkTint`, fades toward
 * `sunkAlpha` and settles toward `sunkScale` instead of stepping between the
 * two — the step was invisible mid-window (nothing at all happened for five
 * seconds) and then a snap.
 *
 * `sink === 1` returns the wreck look EXACTLY, byte for byte, which is what
 * makes the founder handover pop-free: `ContactViews.markSunk` at the founder
 * beat is `setSink(1)`, i.e. the same terminal value the ramp has already
 * reached on its own. There is one wreck look and one function that produces
 * it. Since amendment 32 that handover is ALL that founder is — the crimson
 * plume fires at the killing blow instead — so this ramp is the only thing
 * telling an onlooker the hull has finished going down.
 *
 * The settle is deliberately NOT motion-gated. The motion setting covers
 * "directional screen shake, camera motion effects, and pulse/flash intensity"
 * (EXPERIENCE.md · Accessibility Floor) and a monotonic five-second ramp is
 * none of the three: it cannot strobe, it carries state rather than juice, and
 * suppressing it would delete the very information this cycle exists to add.
 * The shipped precedent is render/fade.ts's 150ms sight fade, which is likewise
 * ungated. Only the FLASH answers to the motion setting.
 */
export function hullLook(flash: number, sink: number, fade: number): HullLook {
  const s = clamp01(sink);
  const cfg = CLIENT_CONFIG.ship;
  const baseTint = s <= 0 ? C.white : mixColor(C.white, cfg.sunkTint, s);
  const baseAlpha = 1 + (cfg.sunkAlpha - 1) * s;
  const t = clamp01(flash);
  return {
    tint: t <= 0 ? baseTint : mixColor(baseTint, C.white, t),
    alpha: (baseAlpha + (1 - baseAlpha) * t) * fade,
    scale: 1 + (cfg.sunkScale - 1) * s,
  };
}

// --- THE HULL HIT FLASH'S BUDGET CLAIM (Story 4.8, amendment 240) --------------
//
// The 130 ms hit flash is the worst stacking surface in the game after the
// muzzle flashes: up to 20 hulls can take a hit in the same second, and a burst
// lands on every hull inside its radius at once — a screen region can pick up a
// dozen onsets from ONE detonation. It therefore claims against the client's ONE
// aggregate budget, keyed by the REGION of that hull's screen position, and an
// over-budget flash DEGRADES rather than disappearing: same 130 ms, same hull,
// `degradeAlphaFactor` of the intensity it would have held.
//
// A MODULE-LEVEL GATE, deliberately, in the same shape as this module's live
// hue tables (`setColorblindAssist`): `ShipView`s are constructed in several
// places (own hull in main.ts, every contact in render/contacts.ts), and a
// constructor parameter would leave the CONTACT hulls — the twenty that actually
// stack — unbudgeted while budgeting the one hull that cannot stack with itself.
//
// The flash is ALREADY a flat hold (`applyLook` applies one constant intensity
// for the whole window, never a ramp), so the degrade spends its AMPLITUDE: the
// hull still brightens, faintly, for the full duration. Presence, position and
// duration all survive, which is the same trade every other budgeted channel
// makes. The `reduced`-motion halving (Story 2.3: strength, never duration) is
// untouched and composes multiplicatively with it.

/** The client's one world flash gate, or null (unwired / headless tests → every
 *  hit flash animates exactly as it did before Story 4.8). */
let hullFlashGate: WorldFlashGate | null = null;

/** Wire (or clear) the hull hit flash's budget gate. main.ts owns the instance —
 *  the SAME gate `Effects` and every chrome one-shot claim against, because the
 *  ratified floor is aggregate per screen region. */
export function setHullFlashGate(gate: WorldFlashGate | null): void {
  hullFlashGate = gate;
}

/**
 * Pure: the hit-flash intensity actually applied, from the motion level's
 * multiplier and the budget's LATCHED verdict. Latched at flash time and never
 * re-evaluated — a flash that dimmed mid-window as the budget's window slid
 * would be a strobe manufactured by the anti-strobe mechanism (amendment 83).
 */
export function hullFlashIntensity(amount: number, degraded: boolean): number {
  return degraded ? amount * FB.degradeAlphaFactor : amount;
}

/** Trace the shared silhouette polygon (local frame, bow at +x, closed). */
function tracePolygon(g: Graphics, poly: readonly Vec2[]): void {
  g.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
  g.closePath();
}

export class ShipView {
  readonly gfx: Graphics;
  /** THE SETTLE (Story 5.2 fix): progress through the sinking window, [0,1].
   *  0 alive, 1 the wreck. Was a boolean `downed` — see `hullLook`. */
  private sink = 0;
  private flashUntil = 0;
  /** Hit-flash INTENSITY in [0,1] for the window ending at flashUntil (the
   *  motion level's multiplier — `reduced` = a half-strength flash, full length). */
  private flashAmount = 1;
  private fade = 1; // sight fade multiplier (contacts fade in/out over 150ms)
  /** Has this view ever been given a pose (`update()`)? Until it has, `gfx.position`
   *  is Pixi's default (0,0) — a real map coordinate, and the wrong one. */
  private positioned = false;
  private hullId: HullId;
  private style: ShipStyle;

  constructor(style: ShipStyle, hullId: HullId = 'torpedoBoat') {
    this.gfx = new Graphics();
    this.style = style;
    this.hullId = hullId;
    this.draw();
  }

  /** Re-draw for a new hull id (own ship only; contacts know their hull at
   *  creation). Preserves position/rotation/tint applied by update(). */
  setHullId(hullId: HullId): void {
    this.hullId = hullId;
    this.draw();
  }

  /** Swap the hull colors (Story 1.12): stroke = bright personal hue, fill =
   *  its darker interior (null = hollow fallback). Redraws in place. */
  setColors(stroke: number, fill: number | null): void {
    this.style = { stroke, fill };
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    tracePolygon(g, hullSilhouette(this.hullId));
    // Solid personal-hue interior (the darker ~45%-value fill) under the bright
    // outline; a null fill leaves a hollow outline (the roster-miss fallback).
    if (this.style.fill !== null) g.fill({ color: this.style.fill, alpha: 1 });
    g.stroke({ width: 1.5, color: this.style.stroke, alpha: 1 });
  }

  /**
   * Drive the settle: 0 = alive, 1 = fully foundered (the wreck look, exactly).
   * Called every frame for a hull inside its sinking window and once, with 1,
   * at founder. Applies immediately — a settle that waited for the next
   * `update()` would freeze on a hull whose snapshot buffer has run dry.
   */
  setSink(progress: number): void {
    this.sink = clamp01(progress);
    this.applyLook();
  }

  /** Fade + tint the hull as sunk (true) or restore it on (re)spawn (false) —
   *  the two ENDPOINTS of the settle, kept as the terminal/reset seam the
   *  contact lifecycle (markSunk / markSpawn) actually speaks in. */
  setDowned(v: boolean): void {
    this.setSink(v ? 1 : 0);
  }

  /**
   * Brief bright flash (took a hit). MOTION-GATED (Story 2.3): `reduced` halves
   * the flash's INTENSITY — never its duration, which stays the full flashMs so
   * the cue is just as easy to CATCH — and `off` suppresses it entirely. The hp
   * bar, damage markers and kill feed still carry the information statically.
   *
   * BUDGETED (Story 4.8): the onset claims the region of THIS hull's screen
   * position against the client's one flash budget, and an over-budget flash
   * holds a dimmer mark for the same 130 ms rather than vanishing. The claim runs
   * AFTER the motion gate, so a flash the setting already suppressed spends no
   * budget. The hull's world position is its last rendered pose (`update()`);
   * a hull moves well under a region in the frame between the two.
   *
   * A VIEW WITH NO POSE YET NEVER CLAIMS (review gate P5). A ShipView created
   * and damaged inside the same network batch flashes before its first
   * `update()`, when `gfx.position` is still Pixi's default (0,0) — a real map
   * coordinate, and the wrong one, so the claim would charge the map-centre
   * region for a hull that is elsewhere: both a mis-degrade of THIS flash and a
   * stolen onset from the flashes that legitimately land there. Fail toward
   * ANIMATING, the direction every unwired path in this budget already fails.
   */
  flash(): void {
    this.bloom(CLIENT_CONFIG.ship.flashMs);
  }

  /**
   * THE KILL FLASH (Story 5.2 fix): the confirmation beat at SINK-ENTRY, so a
   * killer sees on the tick they scored that they scored. Same white bloom,
   * same motion gate, same budget claim, same degrade rule as the hit flash it
   * reuses — only longer (`sinkFlashMs`, the ratified 300ms same-source floor).
   * It is not mistakable for a hit flash in practice because the hull begins
   * to SETTLE on the same beat and never stops.
   *
   * ONE-SHOT AND BOUNDED, like every other world flash, and UNTIERED: the
   * attention table's amendment 241 puts on-water one-shots (muzzle flashes,
   * sparks, splashes, hull hit flashes) outside the tier system entirely —
   * "hold at your lit keyframe" is a meaningless instruction for a flash at a
   * world position — and answers them to render/flashBudget.ts instead, which
   * this claims against exactly as `flash()` does.
   */
  sinkFlash(): void {
    this.bloom(CLIENT_CONFIG.ship.sinkFlashMs);
  }

  /** The shared onset: motion gate, then budget claim, then latch amount +
   *  deadline. One implementation so a new flash length can never acquire a
   *  different accessibility story than the shipped one. */
  private bloom(durationMs: number): void {
    const amount = motionIntensity(settings.current.motion);
    if (amount <= 0) return;
    const p = this.gfx.position;
    const degraded = this.positioned && hullFlashGate !== null && hullFlashGate.claim(p.x, p.y) === 'degrade';
    this.flashAmount = hullFlashIntensity(amount, degraded);
    this.flashUntil = performance.now() + durationMs;
  }

  /** The hit flash's applied intensity at `nowMs` (0 once the window closes) —
   *  the budget's observable seam for this channel. */
  flashIntensityAt(nowMs: number = performance.now()): number {
    return nowMs < this.flashUntil ? this.flashAmount : 0;
  }

  /** Sight-fade multiplier [0,1] applied on top of tint/alpha state. */
  setFade(alpha: number): void {
    this.fade = alpha;
    this.applyLook();
  }

  /** Position + orient the hull from a world pose, applying tint/alpha state. */
  update(x: number, y: number, heading: number): void {
    this.positioned = true;
    this.gfx.position.set(x, y);
    this.gfx.rotation = heading;
    this.applyLook();
  }

  private applyLook(): void {
    const look = hullLook(this.flashIntensityAt(), this.sink, this.fade);
    this.gfx.tint = look.tint;
    this.gfx.alpha = look.alpha;
    this.gfx.scale.set(look.scale);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
