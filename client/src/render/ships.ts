// Procedural ship hull view, now driven by the SHARED silhouette polygon
// (sim/silhouette.ts — the silhouette IS the hitbox). One code path keyed by
// hull id: the three pickable classes render their ratified board silhouettes;
// drone hull ids render the legacy chevron (exactly what hullSilhouette returns
// for a drone id) plus their TIER's rank ticks (Story 7.6 — see RANK_TICKS).
//
// Story 10.4 (Eric's ruling R6): the personal hue wheel is gone. Every captain
// hull — own AND contact — draws in its RELATION color (render/relationColor.ts:
// own cyan, everyone else red) as one stroke over that color's dark interior.
// Drones wear the drone greys. The style is per-view and swappable (setColors).
//
// TURRETS (Story 10.4): a captain hull carries one plain turret Graphics per
// mount of its shared `battery` — a gunhouse box plus one line per barrel — as a
// CHILD of the view's container at `turretStation(hullId, i)`, rotated by the
// turret's hull-relative angle (`setTurretAngles`). Children inherit the hull's
// pose, settle, sight fade and hit-flash tint for free. Drones have no battery
// and draw none.
//
// THE ART SEAM (for the hull-art wave): `drawHull(g, hullId, style)` and
// `drawTurret(g, hullId, i, style)` are the ONLY two functions that put pixels
// down; `ShipView` builds its Graphics once through them and per frame only
// writes rotations. Swap those two (or the Graphics they fill) and no caller
// changes.
//
// The render polygon is the shared local-frame silhouette VERBATIM (bow at +x,
// origin-centered, world units) — no independent geometry, so what you see is
// the collision/hit-test hull. The view is added to a camera-transformed layer,
// so world heading == sprite rotation (no y-flip — see camera.ts).

import { Container, Graphics } from 'pixi.js';
import {
  DEFAULT_CLASS_ID,
  DRONE_HULL_IDS,
  DRONE_SIZE_IDS,
  droneSizeOf,
  hullSilhouette,
  turretMounts,
  turretRest,
  turretStation,
  type HullId,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import type { WorldFlashGate } from './effects.js';
import { relationStyle, type Relation, type ShipStyle } from './relationColor.js';

export type { ShipStyle } from './relationColor.js';

const C = CLIENT_CONFIG.colors;
const FB = CLIENT_CONFIG.flashBudget;

/** Roster-miss / pre-roster fallback: amber hollow outline. */
export const FALLBACK_STYLE: ShipStyle = { stroke: C.amber, fill: null };
/** Drone hull style (roster sentinel 255): grey outline + solid grey interior. */
export const DRONE_STYLE: ShipStyle = { stroke: C.droneOutline, fill: C.droneFill };

/** Style for a contact, given its hull id and its relation to the viewer. A
 *  drone hull id wins (greys); every captain hull wears its relation color. */
export function contactStyle(hullId: HullId, relation: Relation): ShipStyle {
  return isDroneHull(hullId) ? DRONE_STYLE : relationStyle(relation);
}

/**
 * True for the three drone hull ids (which never carry a personal hue).
 *
 * WHY THIS IS HULL-ID-BASED, AND NOT A FLAG (Story 6.3, epic-6 amendment 13).
 * The server's answer is a field — `ShipRecord.isDrone` / the ship-role seam —
 * and that field is NOT on the wire: there are zero occurrences of it in
 * `shared/`, by design (an explicit "this one is a bot" bit would be a
 * perception widening the frame chokepoint has never granted). What the client
 * holds is `Contact.cls`, a `HullId`, so the hull id IS the client's only
 * evidence and this predicate is the client's SECOND, independent
 * non-combatant test. `deferred-work.md` has carried the warning since Story
 * 5.6: two predicates exist by necessity and must be kept in step.
 *
 * THE INVARIANT THAT KEEPS THEM ALIGNED: a hull id is a drone hull id **iff**
 * it is in shared's `DRONE_HULL_IDS`. PvE fleet hulls spawn on those three ids
 * and nothing else does — a captain, human or AI, carries a real class hull id
 * (`yamato` / `bismarck` / `warspite` / `iowa`), which is precisely why Story
 * 6.4's bot captains do not move this function: a bot is a participant that is
 * not a fleet hull, and it will render in its relation color like any captain.
 *
 * This predicate answers "is this a PvE FLEET HULL" — presentation and economy
 * (greyscale style, nameplate, kill-feed suppression). It is NOT the
 * participant test; the client never runs one, because the match outcome is
 * decided server-side and arrives as `ResultsMsg`.
 *
 * `ships.test.ts` PINS the set against `DRONE_HULL_IDS` / `HULL_IDS` so a hull
 * id added server-side fails a test rather than silently mis-classifying a ship
 * (a new drone hull would render in a relation color and count as a contestant;
 * a new class listed as a drone would turn grey).
 */
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

// --- DRONE RANK TICKS (Story 7.6, Eric ruling 2026-08-21) ----------------------
//
// *"We actually do need better distinction, size isn't enough."* … *"just use
// the rank ticks on the silhouette, which is way better."*
//
// 1 / 2 / 3 transverse bars across a fleet hull's afterdeck for small / medium /
// large. THE TICK COUNT IS THE TIER, and it is the only channel that could be:
// drones are locked greyscale (DESIGN.md:157), so colour was never available,
// and Eric has ruled the 85 → 100 → 115u length ladder insufficient on its own.
// The tier matters because the tier IS the payout — 1/4, 1/2, 3/4 of a level
// (`CONFIG.xp.droneTierLevels`).
//
// SCOPE: the RENDERED HULL ONLY. Radar returns cannot carry this. Since cycle
// 105's ONE-RADAR ruling every blip is an identity-free coverage footprint
// rasterised onto the phosphor lattice (render/radar.ts: *"the retired
// `silhouette` grammar went with cycle 105's ONE-RADAR ruling"*) — there is no
// outline out there to tick, and adding one would be a perception widening
// besides. A drone's tier is legible exactly where its hull is: inside truesight.
//
// GEOMETRY IS DERIVED FROM THE SILHOUETTE, NEVER FROM CONFIG.drones DIMS. The
// polygon is what actually gets drawn, so measuring the marks against its own
// bounding box is what keeps them on the deck if a hull is ever reshaped. Every
// fraction lives in `CLIENT_CONFIG.droneRank`.

/**
 * One rank tick in the hull's LOCAL frame (bow at +x, origin-centred, world
 * units): a transverse segment on the keel at `x`, spanning ±`halfLenU` in y.
 */
export interface RankTick {
  readonly x: number;
  readonly halfLenU: number;
}

const NO_TICKS: readonly RankTick[] = [];

/** Bounding-box extent of a local-frame silhouette: bow-to-stern span (length)
 *  and port-to-starboard span (beam). */
function hullExtent(poly: readonly Vec2[]): { lengthU: number; beamU: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxAbsY = 0;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (Math.abs(p.y) > maxAbsY) maxAbsY = Math.abs(p.y);
  }
  return { lengthU: maxX - minX, beamU: maxAbsY * 2 };
}

/**
 * Pure: the `count` ticks for a hull, centred as a group `aftOffsetLengthFrac`
 * of the hull's length abaft amidships and spaced along the keel. Index 0 is
 * the FORWARD-most tick; a single tick sits exactly on the group centre.
 */
function buildRankTicks(hullId: HullId, count: number): readonly RankTick[] {
  const cfg = CLIENT_CONFIG.droneRank;
  const { lengthU, beamU } = hullExtent(hullSilhouette(hullId));
  const spacing = lengthU * cfg.spacingLengthFrac;
  const centerX = -lengthU * cfg.aftOffsetLengthFrac;
  const halfLenU = (beamU * cfg.tickBeamFrac) / 2;
  const out: RankTick[] = [];
  for (let i = 0; i < count; i++) out.push({ x: centerX + (i - (count - 1) / 2) * spacing, halfLenU });
  return out;
}

/**
 * The rank ticks per drone hull id, built ONCE at module load — `draw()` runs on
 * every hull construction and on every recolor, and this is fixed geometry.
 *
 * THE COUNT IS THE SHARED SIZE LADDER'S OWN ORDER (`DRONE_SIZE_IDS`), not a
 * second table: a fourth fleet tier added server-side gets its rank for free and
 * in the right place, the same reason `fleetSizeName` derives from `droneSizeOf`
 * instead of listing the three sizes again.
 */
const RANK_TICKS: Readonly<Record<string, readonly RankTick[]>> = Object.fromEntries(
  DRONE_HULL_IDS.map((id) => [id, buildRankTicks(id, DRONE_SIZE_IDS.indexOf(droneSizeOf(id) ?? 'small') + 1)]),
);

/** The rank ticks a hull wears: 1 / 2 / 3 for the small / medium / large fleet
 *  hulls, and NONE for every captain hull (a captain's class is already carried
 *  by a distinct silhouette). */
export function droneRankTicks(hullId: HullId): readonly RankTick[] {
  return RANK_TICKS[hullId] ?? NO_TICKS;
}

/** Trace the shared silhouette polygon (local frame, bow at +x, closed). */
function tracePolygon(g: Graphics, poly: readonly Vec2[]): void {
  g.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
  g.closePath();
}

/**
 * THE HULL ART SEAM (Story 10.4): draw `hullId` in `style` onto `g` (cleared
 * first) — the shared silhouette as a solid relation-dark interior under ONE
 * relation stroke (a null fill leaves a hollow outline), plus a fleet hull's
 * rank ticks. The hull-art wave replaces this body.
 */
export function drawHull(g: Graphics, hullId: HullId, style: ShipStyle): void {
  g.clear();
  tracePolygon(g, hullSilhouette(hullId));
  if (style.fill !== null) g.fill({ color: style.fill, alpha: 1 });
  g.stroke({ width: CLIENT_CONFIG.ship.hullStrokeU, color: style.stroke, alpha: 1 });
  drawRankTicks(g, hullId, style.stroke);
}

/**
 * The tier mark on a PvE fleet hull (Story 7.6) — a no-op for every captain
 * hull. Drawn AFTER the silhouette so the bars sit over the interior fill,
 * and in the hull's OWN stroke colour so the greyscale rule needs no
 * exception: for a drone that colour is `DRONE_STYLE.stroke`, and a hull
 * recoloured through `setColors` carries its ticks with it.
 */
function drawRankTicks(g: Graphics, hullId: HullId, stroke: number): void {
  const ticks = droneRankTicks(hullId);
  if (ticks.length === 0) return;
  for (const t of ticks) {
    g.moveTo(t.x, -t.halfLenU);
    g.lineTo(t.x, t.halfLenU);
  }
  g.stroke({ width: CLIENT_CONFIG.droneRank.widthU, color: stroke, alpha: 1 });
}

/** Pure: the plain turret's geometry for mount `i` of `hullId`, in the turret's
 *  own frame (barrels along +x, pivot at the origin), sized off the hull beam. */
export interface TurretGeometry {
  /** Gunhouse box: half-length along the barrels and half-width across. */
  houseHalfLen: number;
  houseHalfWid: number;
  /** Barrel tip x (barrels run from the pivot to here). */
  barrelLen: number;
  /** Across-track y of each barrel. */
  barrelYs: readonly number[];
}

export function turretGeometry(hullId: HullId, i: number): TurretGeometry {
  const cfg = CLIENT_CONFIG.ship.turret;
  const { beamU } = hullExtent(hullSilhouette(hullId));
  const guns = turretMounts(hullId)[i]?.guns ?? 0;
  const houseHalfWid = (beamU * cfg.houseBeamFrac) / 2;
  const span = houseHalfWid * cfg.barrelSpreadFrac * 2;
  const barrelYs: number[] = [];
  for (let k = 0; k < guns; k++) barrelYs.push(guns === 1 ? 0 : -span / 2 + (span * k) / (guns - 1));
  return {
    houseHalfLen: (beamU * cfg.houseLenBeamFrac) / 2,
    houseHalfWid,
    barrelLen: beamU * cfg.barrelBeamFrac,
    barrelYs,
  };
}

/**
 * THE TURRET ART SEAM (Story 10.4): draw turret `i` of `hullId` onto `g`
 * (cleared first) in its own frame — a gunhouse box and one line per barrel
 * along +x. The hull-art wave replaces this body.
 */
export function drawTurret(g: Graphics, hullId: HullId, i: number, style: ShipStyle): void {
  const t = turretGeometry(hullId, i);
  const w = CLIENT_CONFIG.ship.turret.strokeU;
  g.clear();
  for (const y of t.barrelYs) {
    g.moveTo(0, y);
    g.lineTo(t.barrelLen, y);
  }
  g.stroke({ width: w, color: style.stroke, alpha: 1 });
  g.rect(-t.houseHalfLen, -t.houseHalfWid, t.houseHalfLen * 2, t.houseHalfWid * 2);
  if (style.fill !== null) g.fill({ color: style.fill, alpha: 1 });
  g.stroke({ width: w, color: style.stroke, alpha: 1 });
}

export class ShipView {
  /** The view's root — position, heading, settle, fade and flash tint live
   *  here and reach the hull and every turret child. */
  readonly gfx: Container;
  /** The hull Graphics (the `drawHull` seam's target). */
  readonly hull: Graphics;
  /** One Graphics per battery mount, bow to stern (empty for a drone). */
  private turrets: Graphics[] = [];
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
    this.gfx.addChild(this.hull);
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
    this.buildTurrets();
  }

  /** Swap the hull colors: stroke = the relation's bright linework, fill = its
   *  dark interior (null = hollow outline). Redraws hull and turrets in place. */
  setColors(stroke: number, fill: number | null): void {
    if (stroke === this.style.stroke && fill === this.style.fill) return;
    this.style = { stroke, fill };
    this.draw();
    for (let i = 0; i < this.turrets.length; i++) drawTurret(this.turrets[i], this.hullId, i, this.style);
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

  private draw(): void {
    drawHull(this.hull, this.hullId, this.style);
  }

  private buildTurrets(): void {
    for (const t of this.turrets) t.destroy();
    this.turrets = [];
    const mounts = turretMounts(this.hullId);
    for (let i = 0; i < mounts.length; i++) {
      const g = new Graphics();
      drawTurret(g, this.hullId, i, this.style);
      const p = turretStation(this.hullId, i);
      g.position.set(p.x, p.y);
      g.rotation = turretRest(mounts[i]);
      this.gfx.addChild(g);
      this.turrets.push(g);
    }
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
