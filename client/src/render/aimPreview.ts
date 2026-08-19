// ORDNANCE AIM PREVIEW — where this shot actually goes, and what it actually
// covers, BEFORE the click.
//
// Until now the only aim-time truth on screen was the crosshair (and a range-
// clamp tick when the cursor overran max range): a captain could not see that a
// gun shell bursts in a 15u circle, where a BARREL volley's parallel tracks
// actually run, where a BROADSIDE BARRAGE's shells fan out to, or where a mine's
// trigger ring will actually sit. This module draws
// all of it, and draws it from the SAME shared helpers the server fires with
// (shared sim/aim.ts — burstPointAlong / muzzleOrTarget / torpedoSpawn /
// blockedWater, promoted out of the server equipment rows for exactly this
// reason). The preview is therefore not an approximation of the shot: it is the
// shot's own geometry, evaluated one frame early.
//
// SELF-PRIVATE BY CONSTRUCTION. Everything here is computed from own CONFIG +
// own effectiveStats() + the locally-rebuilt map. Nothing new crosses the wire,
// and no enemy learns anything: an onlooker sees exactly what they saw before.
//
// SPLIT: computeAimPreview() is pure geometry (unit-tested); AimPreview is a
// thin Pixi adapter that strokes the model onto the fog-immune `aim` layer —
// the same layer the reticle uses, because a burst point can legitimately sit
// far beyond the sight bubble and must not be swallowed by fog.

import { Container, Graphics } from 'pixi.js';
import {
  CONFIG,
  blockedWater,
  burstPointAlong,
  clampInsideMap,
  fanTargets,
  hullEnvelope,
  islandSegHit,
  muzzleOrTarget,
  parallelOffsets,
  torpedoSpawn,
  type EffectiveStats,
  type EquipmentId,
  type HullId,
  type Island,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { dashArcs } from '../util/math.js';
import type { OwnFire } from './projectiles.js';

const P = CLIENT_CONFIG.aimPreview;

/** The firing pose the preview is drawn from (the PREDICTED own hull). */
export interface PreviewShip {
  x: number;
  y: number;
  heading: number;
  cls: HullId;
}

/** Everything the preview needs. `legal` is the caller's aim gate (bearing arc
 *  AND, for the mine, placement reach) — an illegal aim previews NOTHING and
 *  keeps the existing denied treatment, because drawing a shot the server would
 *  refuse is worse than drawing none. */
export interface AimPreviewInput {
  id: EquipmentId | null;
  ship: PreviewShip;
  aim: number; // world bearing to the cursor
  aimDist: number; // u — clicked distance from the ship CENTRE
  stats: EffectiveStats;
  mapRadius: number;
  islands: readonly Island[];
  legal: boolean;
  /**
   * THE GUN'S RESOLVED REACH FOR THIS AIM (Story 7-5 wave 2, R2.15) — normally
   * `stats.gun.rangeU`, but LIFTED to the click's own distance when the clicked
   * point lies inside a live lit zone the player owns. Computed ONCE by the
   * caller through weaponArc.weaponReachU and handed to the range-clamp marker
   * (render/firing.ts) and to this preview as the SAME NUMBER, so the marker
   * that says "the shell stops here" and the circle that says "it bursts here"
   * cannot disagree.
   *
   * GUN ONLY: no other branch reads it, because no other system has the
   * extension (R2.15 names the gun and excludes the broadside and the torpedo
   * explicitly). Omitted = `stats.gun.rangeU`, i.e. the pre-wave-2 clamp
   * byte-for-byte, which is what every non-main caller (tests) wants.
   */
  gunReachU?: number;
}

/** One travel line, already island-clipped (except where the shot overflies). */
export interface PreviewLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A circle at the TRUE burst point. `blocked` = an island stops the shot short
 *  of it, so the circle renders dimmed rather than promising anything there.
 *
 *  `effect` marks a circle that is NOT a damage area — today only the star
 *  shell's lit radius. It renders in a quieter register: it is typically many
 *  times a blast circle's size (the flare lights half a truesight bubble), and
 *  at damage-circle weight that much ink would read as a threat and bury the
 *  actual kill circles the same aim UX draws. */
export interface PreviewBurst {
  x: number;
  y: number;
  r: number;
  blocked: boolean;
  effect: boolean;
}

/**
 * The mine's placement preview at the clicked drop point.
 *
 * `captive` is the CAPTIVE MINES verb (R2.12) and it changes WHAT IS DRAWN, not
 * just how: a captive mine never detonates on contact, so its `blast` is the
 * radius the launched TORPEDO bursts in — wherever that torpedo connects — and
 * is NOT a circle around the drop point. Carried on the model anyway (it is the
 * honest number for the verb, and a later tooltip may print it), but the
 * renderer draws only the trip ring for it. Both radii arrive ALREADY
 * transformed off `stats.mine`; nothing here re-derives the swap-and-triple.
 */
export interface PreviewPlacement {
  x: number;
  y: number;
  blast: number;
  trigger: number;
  captive: boolean;
  blocked: boolean; // inside a rock / off the water — the server refuses it
}

/** ACOUSTIC HOMING's acquisition corridor along the initial track. */
export interface PreviewBand {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  halfWidth: number;
}

export interface AimPreviewModel {
  lines: PreviewLine[];
  bursts: PreviewBurst[];
  place: PreviewPlacement | null;
  band: PreviewBand | null;
}

const EMPTY: AimPreviewModel = { lines: [], bursts: [], place: null, band: null };

/** A point-burst system's aim-relevant numbers, off EFFECTIVE stats (never raw
 *  CONFIG for anything a boon scales). PLUNGING FIRE's `arcing` flag is GONE
 *  with the cannon (Story 7-5 wave 2, R2.6): nothing overflies terrain any
 *  more, so every line here is island-clipped. */
interface BurstSpec {
  rangeU: number;
  burstRadius: number;
  shellRadius: number;
  /** Shells per click, each on its OWN parallel track (R2.16). */
  barrels: number;
  /** u — LATERAL spacing between adjacent tracks (CONFIG.gun.barrelSpacingU).
   *  Irrelevant at one barrel; the straddle law handles the rest. */
  spacingU: number;
  /** The circle is an EFFECT radius (the star shell's lit zone), not a damage
   *  area — a quieter draw. Defaults to false: everything else here kills. */
  effect?: boolean;
}

/**
 * Clip a travel segment at the first island it meets. Uses the SAME primitive
 * the sim's flight resolution does (islandSegHit — bounding-circle broadphase
 * then exact coastline test against `isle.poly`), so the drawn stop point is
 * the shell's stop point. Returns the endpoint and whether anything actually
 * got in the way.
 */
export function clipAtIslands(
  from: Vec2,
  to: Vec2,
  islands: readonly Island[],
): { point: Vec2; clipped: boolean } {
  let best: number | null = null;
  for (const isle of islands) {
    const t = islandSegHit(from, to, isle);
    if (t !== null && (best === null || t < best)) best = t;
  }
  if (best === null) return { point: to, clipped: false };
  return {
    point: { x: from.x + (to.x - from.x) * best, y: from.y + (to.y - from.y) * best },
    clipped: true,
  };
}

/** Is a point off the water disk? A shot whose ORIGIN is already outside the
 *  rim is a shot the sim disposes of immediately (a ballistic spawned past the
 *  edge expires without ever meeting an obstacle), so the preview must not draw
 *  it as a live shot. Reachable at the rim: the muzzle/tube exit sits up to a
 *  half hull-length outside a hull the boundary clamp has pinned to the edge. */
function outsideDisk(p: Vec2, mapRadius: number): boolean {
  return Math.hypot(p.x, p.y) > mapRadius;
}

/**
 * One shell's line + burst circle, from an already-placed muzzle/target pair.
 * Shared by BOTH multi-shell shapes so the blocked tell, the outside-the-rim
 * tell and the zero-radius line-only case are written exactly once.
 */
function shellPreview(
  inp: AimPreviewInput,
  origin: Vec2,
  target: Vec2,
  spec: BurstSpec,
  into: AimPreviewModel,
): void {
  const clip = clipAtIslands(origin, target, inp.islands);
  into.lines.push({ x1: origin.x, y1: origin.y, x2: clip.point.x, y2: clip.point.y });
  if (spec.burstRadius <= 0) return;
  // A muzzle already outside the rim is the same promise-breaker an island
  // is — the shell never reaches the point — so it earns the same dim tell
  // rather than a confident circle.
  const blocked = clip.clipped || outsideDisk(origin, inp.mapRadius);
  into.bursts.push({
    x: target.x,
    y: target.y,
    r: spec.burstRadius,
    blocked,
    effect: spec.effect === true,
  });
}

/**
 * The gun/star-shell family: one line + one burst circle PER BARREL. Since
 * Story 7-5 wave 2 (R2.16) BARREL's extra shells fly PARALLEL rather than
 * fanning — every shell is displaced perpendicular to the aim bearing by a
 * multiple of CONFIG.gun.barrelSpacingU and bursts at its OWN point, so the
 * volley covers a constant-width band at every range instead of widening with
 * it. The lateral offset is added to BOTH the muzzle and the target, which is
 * what makes the tracks parallel.
 *
 * The offsets come from the SHARED straddle law (sim/spread.ts parallelOffsets)
 * — the same call the server's volley makes — so an odd barrel count puts one
 * shell exactly on the click and an even count straddles it with none on it,
 * and the preview cannot drift from where the shells land. A single barrel gets
 * the single zero offset, so the one-shell case is byte-identical to the
 * pre-wave-2 geometry.
 */
function parallelVolley(inp: AimPreviewInput, spec: BurstSpec): AimPreviewModel {
  const model: AimPreviewModel = { lines: [], bursts: [], place: null, band: null };
  const dir = inp.aim;
  const target = burstPointAlong(inp.ship, inp.aimDist, inp.mapRadius, spec.rangeU, dir);
  const muzzle = muzzleOrTarget(inp.ship, inp.ship.cls, dir, target, spec.shellRadius);
  for (const off of parallelOffsets(dir, spec.barrels, spec.spacingU)) {
    shellPreview(
      inp,
      { x: muzzle.x + off.x, y: muzzle.y + off.y },
      { x: target.x + off.x, y: target.y + off.y },
      spec,
      model,
    );
  }
  return model;
}

/**
 * THE BROADSIDE BARRAGE (R2.3). Every turret on the firing side sends one shell,
 * and every shell ends its run at the CLICK'S OWN RANGE — so the pattern is an
 * ARC AT CONSTANT RADIUS about the ship, spread angularly about the click
 * bearing, never a cone that widens with distance.
 *
 * The per-shell target points come from the SHARED helper (sim/spread.ts
 * fanTargets), called with the ship position, the range-clamped click point,
 * `stats.broadside.turrets` and `stats.broadside.fanHalfAngleRad` — the exact
 * call the server's barrage makes. Re-deriving the geometry here is forbidden:
 * the project's guarantee is that the previewed circle IS where the shell
 * bursts, and two derivations of one fan is precisely the desync class
 * effectiveStats() exists to prevent. An ODD turret count therefore puts one
 * circle exactly on the crosshair and an EVEN count leaves the crosshair empty
 * — the straddle law, visible.
 *
 * Each shell gets its own muzzle (its own bearing off the hull silhouette) and
 * its own island clip, because each is a real independent shell that bursts at
 * its own point and emits its own signals (R2.5).
 */
function broadsidePreview(inp: AimPreviewInput): AimPreviewModel {
  const b = inp.stats.broadside;
  const spec: BurstSpec = {
    rangeU: b.rangeU,
    burstRadius: b.burstRadius,
    shellRadius: CONFIG.broadside.shellRadius,
    barrels: b.turrets,
    spacingU: 0,
  };
  const model: AimPreviewModel = { lines: [], bursts: [], place: null, band: null };
  const click = burstPointAlong(inp.ship, inp.aimDist, inp.mapRadius, b.rangeU, inp.aim);
  for (const raw of fanTargets(inp.ship, click, b.turrets, b.fanHalfAngleRad)) {
    // A fan extreme can swing past the rim on a shot the CLICK itself kept
    // inside it; pull it back exactly as the click was pulled back.
    const target = clampInsideMap(inp.ship, raw, inp.mapRadius);
    const dir = Math.atan2(target.y - inp.ship.y, target.x - inp.ship.x);
    const origin = muzzleOrTarget(inp.ship, inp.ship.cls, dir, target, spec.shellRadius);
    shellPreview(inp, origin, target, spec, model);
  }
  return model;
}

/**
 * The flare's EFFECTIVE lit radius — the exact number the server hands the
 * shell (`equipment/starShells.ts`): the owner's stats.starShells.litRadius,
 * shrunk by CONFIG.starShells.incendiaryRadiusFactor while the PHOSPHOR verb is
 * held. Both halves matter: the STAR SHELLS ladder moves the stat, and phosphor
 * trades reach for the burn, so a preview built on either the raw CONFIG base or
 * the un-shrunk stat would over-draw the zone the player is trying to place.
 *
 * Reads the PHOSPHOR flag ALONE (Story 7-5 wave 1): DAZZLE is an independent
 * verb that does not touch the radius, so a captain holding both still previews
 * the phosphor-shrunk circle.
 */
export function effectiveLitRadius(stats: EffectiveStats): number {
  const stars = stats.starShells;
  return stars.litRadius * (stars.phosphor ? CONFIG.starShells.incendiaryRadiusFactor : 1);
}

/**
 * STAR SHELLS (Eric ruling R7, post-landing): the flare previews the circle it
 * will LIGHT, at the burst point, so the illumination can be positioned before
 * it is spent — a one-shot 20s-cooldown flare landing 100u off the ship you
 * meant to reveal is the whole cost of guessing.
 *
 * It flies exactly like the gun family (360°, to the clicked point, range- and
 * map-clamped) and it is stopped dead by islands: an island/expiry outcome
 * takes the plain splash-boom path in World.resolveShell, which — unlike an
 * interception — spawns NO lit zone at all. So a blocked flare lights NOTHING,
 * and the standard blocked tell is exactly the right, and rather important,
 * thing to show. The circle is drawn in the quieter EFFECT register (see
 * PreviewBurst.effect): the lit radius is ~7× a gun blast, and at damage weight
 * it would dominate every other circle on the water.
 */
function starShellPreview(inp: AimPreviewInput): AimPreviewModel {
  return parallelVolley(inp, {
    rangeU: inp.stats.starShells.rangeU,
    burstRadius: effectiveLitRadius(inp.stats),
    shellRadius: CONFIG.starShells.shellRadius,
    barrels: 1,
    spacingU: 0,
    effect: true,
  });
}

/**
 * The torpedo family. The line starts at the REAL tube exit (torpedoSpawn — a
 * fish is not launched from the ship's centre) and runs to the first island or
 * the map edge. HOMING additionally carries its finite travel budget and the
 * acquisition BAND: the straight line is only the fish's INITIAL track, and
 * drawing it alone would promise a straight run it will not make — the band is
 * the honest half of that picture (anything inside it can pull the fish over).
 */
function torpedoPreview(inp: AimPreviewInput): AimPreviewModel {
  const dir = inp.aim; // legal ⇒ in the bow arc ⇒ the launch bearing IS the aim
  const hullLength = hullEnvelope(inp.ship.cls).hull.length;
  const origin = torpedoSpawn(inp.ship, hullLength, dir);
  // A tube exit past the rim launches a fish the sim expires on the spot; the
  // map clamp below would fold its whole run into a degenerate point and draw a
  // phantom track out of the ship's nose. Preview nothing instead.
  if (outsideDisk(origin, inp.mapRadius)) return EMPTY;
  const homing = inp.stats.torpedo.homing;
  const run = homing ? CONFIG.torpedo.homingMaxRangeU : inp.mapRadius * 2;
  const far = { x: origin.x + Math.cos(dir) * run, y: origin.y + Math.sin(dir) * run };
  const clip = clipAtIslands(origin, clampInsideMap(origin, far, inp.mapRadius), inp.islands);
  const line = { x1: origin.x, y1: origin.y, x2: clip.point.x, y2: clip.point.y };
  return {
    lines: [line],
    bursts: [],
    place: null,
    band: homing ? { ...line, halfWidth: CONFIG.torpedo.homingAcquireRange } : null,
  };
}

/** Mine placement: the rings at the clicked drop point (the server places the
 *  mine AT the click). Radii are the OWNER's effective ones — the same numbers
 *  the server reads off owner stats when the mine trips — READ, never
 *  re-derived: `effectiveStats` already applied the captive swap-and-triple, so
 *  a captive build arrives here at 144u/32u (210.8u/46.9u at a maxed MINES
 *  ladder) with no arithmetic on this side of the wire. */
function minePreview(inp: AimPreviewInput): AimPreviewModel {
  const dist = Math.max(0, inp.aimDist);
  const p = { x: inp.ship.x + Math.cos(inp.aim) * dist, y: inp.ship.y + Math.sin(inp.aim) * dist };
  return {
    lines: [],
    bursts: [],
    band: null,
    place: {
      x: p.x,
      y: p.y,
      blast: inp.stats.mine.blastRadius,
      trigger: inp.stats.mine.triggerRadius,
      captive: inp.stats.mine.captive,
      blocked: blockedWater(p, inp.islands, inp.mapRadius),
    },
  };
}

/**
 * THE preview model for the currently primed equipment. Pure. An illegal aim,
 * an ability, or an empty slot previews nothing.
 *
 * Gating is by EQUIPMENT ID, never by a range lookup: weaponArc.weaponRangeU
 * returns a meaningless gun-range fallback for the torpedo (documented there),
 * so a range-first branch would draw a torpedo track that stops at radar range.
 */
export function computeAimPreview(inp: AimPreviewInput): AimPreviewModel {
  if (!inp.legal || inp.id === null) return EMPTY;
  if (inp.id === 'gun') {
    const g = inp.stats.gun;
    return parallelVolley(inp, {
      rangeU: inp.gunReachU ?? g.rangeU,
      burstRadius: g.burstRadius,
      shellRadius: CONFIG.gun.shellRadius,
      barrels: g.barrels,
      spacingU: CONFIG.gun.barrelSpacingU,
    });
  }
  if (inp.id === 'broadside') return broadsidePreview(inp);
  if (inp.id === 'starShells') return starShellPreview(inp);
  if (inp.id === 'torpedo') return torpedoPreview(inp);
  if (inp.id === 'mine') return minePreview(inp);
  return EMPTY; // speedBoost / radarBuoy — the buoy's own preview is a later slice
}

/**
 * The burst-ring radius for an own-correlated burst effect (render/effects.ts's
 * `burst` one-shot). The wire cannot say which weapon burst — and MUST NOT, or
 * an onlooker could read a build off a detonation — so the ring keeps its
 * CONFIG default (undefined here) for every burst we cannot honestly claim, and
 * only OUR OWN shells get their EFFECTIVE radius. That asymmetry is the design:
 * enemy builds stay private, our own ring stops lying about our own blast.
 */
export function ownBurstRadius(stats: EffectiveStats, own: OwnFire): number | undefined {
  if (own === 'gun') return stats.gun.burstRadius;
  if (own === 'broadside') return stats.broadside.burstRadius;
  // No torpedo bursts at a POINT any more — COMMAND DETONATION left the game in
  // Story 7-5 wave 1, and a standard/homing fish's contact hit rides the
  // boom/spark path — so the fish keeps the CONFIG default like everything else.
  return undefined; // torpedoes, star shells (lit, not blast), every non-own burst
}

/** The stroke tint for a weapon's preview: the torpedo keeps its cool-green
 *  identity (as its arc and reticle already do), everything else is aim amber.
 *  Color is decoration here — the INFORMATION is the geometry. */
export function previewTint(id: EquipmentId | null): number {
  return id === 'torpedo' ? CLIENT_CONFIG.colors.legacy.torpGlow : CLIENT_CONFIG.colors.amber;
}

/** Thin Pixi adapter: strokes one model per frame onto the fog-immune aim
 *  layer. Every stroke is static — no pulse, no fade cycle — so the preview
 *  reads identically with motion off. */
export class AimPreview {
  private readonly g = new Graphics();

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  /** Clear the preview (own ship sunk, spectating, nothing primed). */
  hide(): void {
    this.g.clear();
  }

  update(model: AimPreviewModel, tint: number): void {
    const g = this.g;
    g.clear();
    for (const l of model.lines) {
      g.moveTo(l.x1, l.y1).lineTo(l.x2, l.y2);
    }
    if (model.lines.length > 0) g.stroke({ width: P.lineWidth, color: tint, alpha: P.lineAlpha });
    if (model.band) this.drawBand(model.band, tint);
    for (const b of model.bursts) this.drawBurst(b, tint);
    if (model.place) this.drawPlacement(model.place, tint);
  }

  /** The blast circle at the burst point: hairline ring + a whisper of fill.
   *  A blocked path drops the whole thing to `blockedAlpha` — the shot does not
   *  get there, and the circle must not claim it will. */
  private drawBurst(b: PreviewBurst, tint: number): void {
    const lit = b.blocked ? P.blockedAlpha : b.effect ? P.effectAlpha : P.burstAlpha;
    const fill = b.blocked ? 0 : b.effect ? P.effectFillAlpha : P.burstFillAlpha;
    this.g.circle(b.x, b.y, b.r).fill({ color: tint, alpha: fill });
    this.g.circle(b.x, b.y, b.r).stroke({ width: P.burstWidth, color: tint, alpha: lit });
  }

  /** The homing acquisition corridor: two rails plus an interior wash, drawn as
   *  one quad along the initial track. */
  private drawBand(b: PreviewBand, tint: number): void {
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return;
    const nx = (-dy / len) * b.halfWidth;
    const ny = (dx / len) * b.halfWidth;
    const g = this.g;
    g.moveTo(b.x1 + nx, b.y1 + ny)
      .lineTo(b.x2 + nx, b.y2 + ny)
      .lineTo(b.x2 - nx, b.y2 - ny)
      .lineTo(b.x1 - nx, b.y1 - ny)
      .closePath()
      .fill({ color: tint, alpha: P.bandAlpha });
    g.moveTo(b.x1 + nx, b.y1 + ny).lineTo(b.x2 + nx, b.y2 + ny);
    g.moveTo(b.x1 - nx, b.y1 - ny).lineTo(b.x2 - nx, b.y2 - ny);
    g.stroke({ width: P.lineWidth, color: tint, alpha: P.bandEdgeAlpha });
  }

  /**
   * Mine placement at the drop point, dual-coded by LINE STYLE and never by hue
   * alone (DESIGN.md).
   *
   * ORDINARY: solid blast ring (what it kills in) + dashed trigger ring (what
   * sets it off).
   *
   * CAPTIVE (R2.12): the DOTTED trip ring alone, matching the own-mine ring set
   * (render/mines.ts ownMineRings) exactly — so the circle a captain places is
   * the circle they then see on the water. No solid ring is drawn, because a
   * captive mine never detonates on contact and a blast circle around the
   * casing would promise a kill it cannot deliver.
   */
  private drawPlacement(p: PreviewPlacement, tint: number): void {
    const alpha = p.blocked ? P.blockedAlpha : P.burstAlpha;
    const g = this.g;
    if (!p.captive) g.circle(p.x, p.y, p.blast).stroke({ width: P.burstWidth, color: tint, alpha });
    const segs = p.captive ? P.dotSegments : P.dashSegments;
    const duty = p.captive ? P.dotDuty : P.dashDuty;
    for (const [a0, a1] of dashArcs(segs, duty)) {
      g.moveTo(p.x + Math.cos(a0) * p.trigger, p.y + Math.sin(a0) * p.trigger);
      g.arc(p.x, p.y, p.trigger, a0, a1);
    }
    g.stroke({ width: P.lineWidth, color: tint, alpha });
  }
}
