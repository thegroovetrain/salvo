// Procedural ship hull view, now driven by the SHARED silhouette polygon
// (sim/silhouette.ts — the silhouette IS the hitbox). One code path keyed by
// hull id: every pickable class renders its battleship art.
//
// Story 10.4 (Eric's ruling R6): the personal hue wheel is gone. Every captain
// hull — own AND contact — draws in its RELATION color (render/relationColor.ts:
// own cyan, everyone else red) as one stroke over that color's dark interior.
// The style is per-view and swappable (setColors).
//
// THE BATTLESHIP ART (Story 10.4 wave 2c — render/hullArt/*): a captain hull
// is three layers in the view's container — the DECK Graphics (skin fill,
// superstructure tiers, tower rings, funnels, secondaries, casemates, rails,
// cranes, barbette rings), one Graphics per main turret of its shared
// `battery` at `turretStation(hullId, i)` rotated by its hull-relative angle
// (`setTurretAngles`), and the OUTLINE Graphics on top (the one bold relation
// line). Fills are the hull's skin, every line the relation color (epic-10
// amendment 7(m)). The geometry lives in shared Pixi `GraphicsContext`s built
// once per (hull, line color) and borrowed by every view — per frame only
// rotations and the container's pose / tint / alpha / scale are written.
// Children inherit the hull's pose, settle, sight fade and hit-flash tint for
// free.
//
// THE DECK TORPEDO LAUNCHERS (Story 10.6 — render/launcherViews.ts) sit
// on the deck UNDER the turrets (Eric 2026-11-05: "It needs to render under
// the gun barrels, not over"): one Graphics per launcher
// at its shared station, rotated by its angle (`setLaunchers`); the own hull
// draws its tubes, a sighted enemy one generic housing (its tube count is not
// on the wire).
//
// The render polygon is the shared local-frame silhouette VERBATIM (bow at +x,
// origin-centered, world units) — no independent geometry, so what you see is
// the collision/hit-test hull. The view is added to a camera-transformed layer,
// so world heading == sprite rotation (no y-flip — see camera.ts).

import { Container, Graphics } from 'pixi.js';
import {
  DEFAULT_CLASS_ID,
  turretMounts,
  turretRest,
  turretStation,
  type HullId,
  type ShipClassId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import type { WorldFlashGate } from './effects.js';
import type { ShipStyle } from './relationColor.js';
import { deckContext, outlineContext, turretContext } from './hullArt/pixiArt.js';
import { turretDrawOrder } from './hullArt/shapes.js';
import { LauncherMounts } from './launcherViews.js';

export type { ShipStyle } from './relationColor.js';

const C = CLIENT_CONFIG.colors;
const FB = CLIENT_CONFIG.flashBudget;

/** Roster-miss / pre-roster fallback: amber hollow outline. */
export const FALLBACK_STYLE: ShipStyle = { stroke: C.amber, fill: null };
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
// A MODULE-LEVEL GATE, deliberately: `ShipView`s are constructed in several
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

/** The battleship-art class of a hull id — every hull id is a captain class. */
function artClass(hullId: HullId): ShipClassId {
  return hullId as ShipClassId;
}

export class ShipView {
  /** The view's root — position, heading, settle, fade and flash tint live
   *  here and reach the hull and every turret child. */
  readonly gfx: Container;
  /** The hull's DECK Graphics — the battleship art's deck layer (skin fill,
   *  features, barbette rings). Under the turrets. */
  readonly hull: Graphics;
  /** The captain hull's ONE bold relation line (amendment 7(o)), drawn over
   *  the turrets so nothing covers it (the sitting page's order). The view
   *  borrows the shared, cached art contexts (render/hullArt/pixiArt). */
  readonly outline: Graphics;
  /** One Graphics per battery mount, bow to stern. */
  private turrets: Graphics[] = [];
  /** The deck torpedo launchers (Story 10.6), seated on the deck, UNDER the turrets. */
  private readonly launchers: LauncherMounts;
  /** The last launcher angles / tubes handed in — redrawn on a hull or color change. */
  private launcherAngles: readonly number[] = [];
  private launcherTubes: number | null = null;
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

  constructor(style: ShipStyle, hullId: HullId = DEFAULT_CLASS_ID) {
    this.gfx = new Container();
    this.hull = new Graphics();
    this.outline = new Graphics();
    this.gfx.addChild(this.hull, this.outline);
    this.launchers = new LauncherMounts(this.gfx, this.hull);
    this.style = style;
    this.hullId = hullId;
    this.draw();
    this.buildTurrets();
  }

  /** Re-draw for a new hull id (own ship only; contacts know their hull at
   *  creation). Preserves position/rotation/tint applied by update(); the
   *  turrets are rebuilt at their rest bearings. */
  setHullId(hullId: HullId): void {
    if (hullId === this.hullId) return;
    this.hullId = hullId;
    this.draw();
    this.launchers.clear(); // first: the turrets re-seat by index; the next setLaunchers seats the launchers on the new hull's stations
    this.buildTurrets();
  }

  /** Swap the hull colors: stroke = the linework (every line — the relation
   *  color), fill = the style's interior. The hull's fills are its skin, so
   *  only the stroke moves its art. Swaps
   *  contexts in place; nothing is redrawn unless the style changed. */
  setColors(stroke: number, fill: number | null): void {
    if (stroke === this.style.stroke && fill === this.style.fill) return;
    this.style = { stroke, fill };
    this.draw();
    this.skinTurrets();
    this.setLaunchers(this.launcherAngles, this.launcherTubes);
  }

  /** How many turret children this view carries (tests/debug). */
  get turretCount(): number {
    return this.turrets.length;
  }

  /** Turret `i`'s child Graphics (tests/debug), or undefined. */
  turretView(i: number): Graphics | undefined {
    return this.turrets[i];
  }

  /**
   * Point the turrets: `angles[i]` is turret i's HULL-RELATIVE angle (shared
   * sim/turrets.ts convention, 0 = the bow). A missing entry holds the turret
   * at its rest bearing. Rotation writes only — no redraw, no allocation.
   */
  setTurretAngles(angles: readonly number[]): void {
    const mounts = turretMounts(this.hullId);
    for (let i = 0; i < this.turrets.length; i++) {
      const a = angles[i];
      this.turrets[i].rotation = a === undefined ? turretRest(mounts[i]) : a;
    }
  }

  /**
   * The deck torpedo launchers (Story 10.6): one per entry of `angles` (fore
   * first, HULL-RELATIVE — shared sim/launchers.ts convention), each with
   * `tubes` tubes, or the generic housing when `tubes` is null (a sighted
   * enemy — its tube count is not on the wire). An empty list draws none.
   * Rotation writes only, unless the count / tubes / color changed.
   */
  setLaunchers(angles: readonly number[], tubes: number | null): void {
    this.launcherAngles = angles;
    this.launcherTubes = tubes;
    this.launchers.set(artClass(this.hullId), angles, tubes, this.style.stroke);
  }

  /** How many launcher children this view carries (tests/debug). */
  get launcherCount(): number {
    return this.launchers.count;
  }

  /** Launcher `i`'s child Graphics (tests/debug), or undefined. */
  launcherView(i: number): Graphics | undefined {
    return this.launchers.view(i);
  }

  /** Point the deck and outline Graphics at this hull's shared cached art. */
  private draw(): void {
    const cls = artClass(this.hullId);
    this.hull.context = deckContext(cls, this.style.stroke);
    this.outline.context = outlineContext(cls, this.style.stroke);
  }

  /** Re-point every turret at the shared context for the current stroke. */
  private skinTurrets(): void {
    const cls = artClass(this.hullId);
    for (let i = 0; i < this.turrets.length; i++) this.turrets[i].context = turretContext(cls, i, this.style.stroke);
  }

  /** One turret Graphics per mount, borrowing its shared art context, seated
   *  at its shared station between the deck and the outline — stacked in
   *  `turretDrawOrder` (a superfiring turret over the one it fires over; Eric
   *  2026-11-06), each just under the outline, so every launcher (seated on
   *  the deck) stays below them all. `turrets[i]` stays turret `i`. */
  private buildTurrets(): void {
    for (const t of this.turrets) t.destroy();
    this.turrets = [];
    const cls = artClass(this.hullId);
    const mounts = turretMounts(cls);
    for (let i = 0; i < mounts.length; i++) {
      const g = new Graphics(turretContext(cls, i, this.style.stroke));
      const p = turretStation(cls, i);
      g.position.set(p.x, p.y);
      g.rotation = turretRest(mounts[i]);
      this.turrets.push(g);
    }
    for (const i of turretDrawOrder(cls)) this.gfx.addChildAt(this.turrets[i], this.gfx.getChildIndex(this.outline));
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
    this.gfx.destroy({ children: true });
  }
}
