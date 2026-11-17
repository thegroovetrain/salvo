// THE RADIO BEACONS ON THE CHART AND ON THE WATER (Story 10.8, Eric rulings
// R1–R13, epic-10 amendment 14). Fed every frame from sim/beaconView.ts's views
// — public facts plus the SHARED lifecycle; this file derives nothing about a
// beacon's life on its own.
//
// WHAT IT IS (Eric 2026-11-07: "The buoy itself is the target, its hitbox
// should contain that icon … What does this radio beacon look like? Make
// that."): a LARGE NAVIGATION BUOY — the LANBY / discus "superbuoy" that
// carried the offshore radio beacons — seen from directly above: a round
// steel float with a fender rim, a railed deck, solar panels set radially
// around a square lattice tower, and the light/antenna at the masthead in the
// dead centre. The hull is the shared `beaconPolygon` octagon VERBATIM, so the
// drawn edge is the edge the server's ordnance and hulls collide against —
// what you see is what you shoot and what you bump into.
//
// TWO LAYERS, THE MINES' SPLIT (render/mines.ts):
//   • WATER (`beaconWorld`, under the fog composite, like a hull) — the buoy
//     at TRUE size in world units, from surfacing; settling (the ship wreck
//     look, `hullLook`) and fading across the sink minute: the sinking hull IS
//     the timer. A decorative broadcast ring pulses out from its edge.
//   • CHART (`beaconChart`, fog-immune) — on every captain's chart from the
//     cycle's 0:00: the SAME buoy from above as a constant-size icon, plus the
//     500 u range ring (`CONFIG.beacons.rangeU`). DASHED outline, no fills,
//     while only charted (nothing in the water yet); the painted buoy once it
//     is afloat; settling and fading through the sink — an EARLY sink fades
//     early for every captain (R9). HANDOVER: once the real buoy would draw
//     larger than the icon, the icon hides, so an icon never sits on top of
//     the buoy it stands for (`beaconIconShown`). The range ring stays at
//     every zoom.
//
// NO TEXT. No label, number, timer, health bar or tooltip — HP is not on the
// wire (R11): damage shows as the anonymous smoke/fire rows render/smoke.ts and
// render/fire.ts already draw.
//
// MOTION IS DECORATION ONLY (the house rule quoted in render/fire.ts's header):
// presence, phase, the dash style, the settle and the fade are motion-blind;
// only the broadcast pulse scales with the motion intensity and is absent at
// `off`.
//
// This file copies fire.ts's SHAPE: a PURE core (no Pixi needed, unit-tested in
// __tests__/beacons.test.ts) — the art's geometry, presence, settle, handover
// and pulse as functions of the view and the zoom — and a thin adapter that
// pools one sprite set per wire slot, re-strokes only on a style, size or zoom
// change, and per frame touches position, alpha, tint, scale and the pulse.

import { Container, Graphics } from 'pixi.js';
import { CONFIG, beaconPolygon, type BeaconPhase } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01, dashArcs, strokeWorldWidth } from '../util/math.js';
import type { BeaconView } from '../sim/beaconView.js';
import { hullLook } from './ships.js';

const B = CLIENT_CONFIG.beacons;
const C = CLIENT_CONFIG.colors;

/** The one linework color of a beacon (DESIGN.md `silver`). */
export const BEACON_COLOR = C.silver;

/** Pure: is this phase drawn DASHED (charted — a signal, nothing in the water)? */
export function beaconDashed(phase: BeaconPhase): boolean {
  return phase === 'charted';
}

/** Pure: is the buoy in the water (afloat or sinking)? */
function inWater(phase: BeaconPhase): boolean {
  return phase === 'afloat' || phase === 'sinking';
}

/** Pure: the presence multiplier of everything a beacon draws — 1 charted
 *  and afloat, falling linearly to 0 across the sink (`sink01`), 0 gone.
 *  Motion-blind: this is information. */
export function beaconFade(v: Pick<BeaconView, 'phase' | 'sink01'>): number {
  if (v.phase === 'gone') return 0;
  if (v.phase === 'sinking') return 1 - clamp01(v.sink01);
  return 1;
}

/** Pure: the icon's linework alpha for a phase (charted dimmer than live). */
export function markerAlpha(phase: BeaconPhase): number {
  return beaconDashed(phase) ? B.markerChartedAlpha : B.markerLiveAlpha;
}

/** Pure: the range ring's stroke alpha for a phase. */
export function ringAlpha(phase: BeaconPhase): number {
  return beaconDashed(phase) ? B.ringChartedAlpha : B.ringLiveAlpha;
}

/** Pure: the range ring's radius (u) — the shared paying range, exactly. */
export function beaconRingRadiusU(): number {
  return CONFIG.beacons.rangeU;
}

// --- THE ART: a large navigation buoy from above ------------------------------
//
// Every proportion is a fraction of the body's circumradius R, so the one
// geometry draws the true-size buoy on the water (R = bodyRadiusU, world u)
// and the chart icon (R = half the icon, in world u at the current zoom).

/** A point in the beacon's local frame (centre (0,0), y down). */
type Pt = { x: number; y: number };

/** The skin slot a primitive is filled with (`CLIENT_CONFIG.beacons.skin`). */
export type ArtFill = keyof typeof B.skin;
/** The weight class a primitive is stroked at. */
export type ArtLine = 'rim' | 'inner' | 'rail';

/** What a primitive depicts. */
export type ArtPart = 'hull' | 'deck' | 'rail' | 'hatch' | 'panel' | 'tower' | 'glow' | 'lamp';

/** One primitive of the art: a polygon/polyline or a circle. `fillAlpha`
 *  (default 1) lets the light's glow be a soft wash. */
export type ArtPrim = (
  | { kind: 'poly'; pts: readonly Pt[]; closed: boolean }
  | { kind: 'circle'; c: Pt; r: number }
) & { part: ArtPart; fill: ArtFill | null; fillAlpha?: number; line: ArtLine | null };

/** The deck's and rail's radii (fractions of R). */
const DECK_R = 0.84;
const RAIL_R = 0.75;
/** The lattice tower's half-side. The solar panels skirt it as a pyramid —
 *  one per face, tilted out and mitred at the corners — so from above they
 *  make a square frame round the tower: four trapezoids out to `PANEL_OUT`. */
const TOWER_HALF = 0.14;
const PANEL_OUT = 0.4;
/** Two deck hatches fore and aft of the frame, and the light with its glow. */
const HATCH_DIST = 0.58;
const HATCH_R = 0.075;
const LAMP_R = 0.085;
const GLOW_R = 0.26;
const GLOW_ALPHA = 0.25;

/** Pure: the shared octagon at circumradius `r` (local frame). */
function octagon(r: number): Pt[] {
  return beaconPolygon(0, 0, { ...CONFIG.beacons, bodyRadiusU: r });
}

/** Pure: the solar panel on the tower face whose outward axis is `(ax, ay)`
 *  — a mitred trapezoid from the face out to the frame's outer edge. */
function panel(R: number, ax: number, ay: number): Pt[] {
  const [px, py] = [-ay, ax];
  const at = (d: number, w: number): Pt => ({ x: (ax * d + px * w) * R, y: (ay * d + py * w) * R });
  return [at(TOWER_HALF, -TOWER_HALF), at(PANEL_OUT, -PANEL_OUT), at(PANEL_OUT, PANEL_OUT), at(TOWER_HALF, TOWER_HALF)];
}

/** The four tower faces' outward axes (on the octagon's vertex axes). */
const AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * Pure: the buoy from above at circumradius `R`, bottom → top. The first
 * primitive is the HULL — the shared `beaconPolygon` octagon itself, the hit
 * edge — then the deck, the rail, two deck hatches, the four solar panels on
 * the tower's faces, the lattice tower (an X-braced square) and the light at
 * the masthead with its glow. `minLampR` floors the light's radius (the
 * chart icon keeps its light a readable dot at a few px across).
 */
export function beaconArt(R: number, minLampR = 0): ArtPrim[] {
  const t = TOWER_HALF * R;
  const tower: Pt[] = [
    { x: -t, y: -t },
    { x: t, y: -t },
    { x: t, y: t },
    { x: -t, y: t },
  ];
  const h = HATCH_DIST * R;
  const hatch = (sx: number): ArtPrim => ({ kind: 'circle', part: 'hatch', c: { x: sx * h, y: 0 }, r: HATCH_R * R, fill: 'tower', line: 'inner' });
  return [
    { kind: 'poly', part: 'hull', pts: octagon(R), closed: true, fill: 'fender', line: 'rim' },
    { kind: 'poly', part: 'deck', pts: octagon(DECK_R * R), closed: true, fill: 'deck', line: 'inner' },
    { kind: 'poly', part: 'rail', pts: octagon(RAIL_R * R), closed: true, fill: null, line: 'rail' },
    hatch(1),
    hatch(-1),
    ...AXES.map(([ax, ay]): ArtPrim => ({ kind: 'poly', part: 'panel', pts: panel(R, ax, ay), closed: true, fill: 'panel', line: 'inner' })),
    { kind: 'poly', part: 'tower', pts: tower, closed: true, fill: 'tower', line: 'inner' },
    { kind: 'poly', part: 'tower', pts: [tower[0], tower[2]], closed: false, fill: null, line: 'inner' },
    { kind: 'poly', part: 'tower', pts: [tower[1], tower[3]], closed: false, fill: null, line: 'inner' },
    { kind: 'circle', part: 'glow', c: { x: 0, y: 0 }, r: GLOW_R * R, fill: 'lamp', fillAlpha: GLOW_ALPHA, line: null },
    { kind: 'circle', part: 'lamp', c: { x: 0, y: 0 }, r: Math.max(LAMP_R * R, minLampR), fill: 'lamp', line: null },
  ];
}

/** The parts the charted GHOST keeps. */
const GHOST_PARTS: ReadonlySet<ArtPart> = new Set<ArtPart>(['hull', 'panel', 'tower', 'lamp']);

/** Pure: the GHOST the chart shows while only charted — nothing is in the
 *  water yet, so no paint: the hull rim (dashed by the drawer), the tower and
 *  its panels as outlines, and the unlit light as a dot. */
export function beaconGhostArt(R: number, minLampR = 0): ArtPrim[] {
  return beaconArt(R, minLampR)
    .filter((p) => GHOST_PARTS.has(p.part))
    .map((p): ArtPrim => (p.part === 'lamp' ? p : { ...p, fill: null, line: p.part === 'hull' ? 'rim' : 'inner' }));
}

// --- the handover, the settle, the pulse --------------------------------------

/** Pure: the buoy's true diameter on screen (px) at `zoom` (px per u). */
export function beaconTruePx(zoom: number, bodyRadiusU: number = CONFIG.beacons.bodyRadiusU): number {
  return 2 * bodyRadiusU * (zoom > 0 ? zoom : 0);
}

/**
 * Pure: THE HANDOVER — is the chart icon drawn? While only charted, always
 * (nothing is in the water to show). In the water, only while the real buoy
 * would draw SMALLER than the icon (`iconPx`); at or past that size the icon
 * hides and the true-size buoy on the water is the beacon. Never once gone.
 */
export function beaconIconShown(
  phase: BeaconPhase,
  zoom: number,
  bodyRadiusU: number = CONFIG.beacons.bodyRadiusU,
  iconPx: number = B.iconPx,
): boolean {
  if (phase === 'charted') return true;
  return inWater(phase) && beaconTruePx(zoom, bodyRadiusU) < iconPx;
}

/** Pure: the icon's diameter on screen (px) — `iconPx`, or the true size when
 *  that is larger (the charted ghost then marks the coming hit edge exactly). */
export function beaconIconPx(zoom: number, bodyRadiusU: number = CONFIG.beacons.bodyRadiusU, iconPx: number = B.iconPx): number {
  return Math.max(iconPx, beaconTruePx(zoom, bodyRadiusU));
}

/** The buoy's settle for a frame — shared by the water body and the icon. */
export interface BeaconSettle {
  /** Is the body on the water drawn at all? (afloat or sinking) */
  visible: boolean;
  alpha: number;
  tint: number;
  /** 1 afloat, settling to the ship wreck scale across the sink. */
  scale: number;
}

/** Pure: the buoy settles like a hull (the ship wreck look's tint and scale,
 *  `hullLook`) and fades out with `sink01`; absent charted and gone. */
export function beaconSettle(v: Pick<BeaconView, 'phase' | 'sink01'>): BeaconSettle {
  const s = v.phase === 'sinking' ? clamp01(v.sink01) : 0;
  const wreck = hullLook(0, s, 1);
  return { visible: inWater(v.phase), alpha: inWater(v.phase) ? beaconFade(v) : 0, tint: wreck.tint, scale: wreck.scale };
}

/** The decorative pulse for a frame: how far past the buoy's edge it has
 *  grown (screen px) and its alpha. */
export interface BeaconPulse {
  px: number;
  alpha: number;
}

const NO_PULSE: BeaconPulse = { px: 0, alpha: 0 };

/**
 * Pure: the broadcast pulse — DECORATION, so it scales with the motion
 * `intensity` and is absent at 0, and absent unless the buoy is in the water
 * (nothing transmits before it surfaces). Grows from the buoy's edge out by
 * `pulseGrowPx` every `pulsePeriodMs`, fading as it grows, under the fade.
 */
export function beaconPulse(nowMs: number, v: Pick<BeaconView, 'phase' | 'sink01'>, intensity: number): BeaconPulse {
  if (!(intensity > 0) || !inWater(v.phase) || !Number.isFinite(nowMs)) return NO_PULSE;
  const period = B.pulsePeriodMs;
  const t = period > 0 ? (((nowMs % period) + period) % period) / period : 0;
  return { px: B.pulseGrowPx * t, alpha: B.pulseAlpha * (1 - t) * Math.min(1, intensity) * beaconFade(v) };
}

/** Pure: the pulse ring's radius (u) — from the edge of whatever is drawn
 *  (the icon while it shows, else the true hull), `p.px` screen px out. */
export function beaconPulseRadiusU(p: BeaconPulse, zoom: number, iconShown: boolean, bodyRadiusU: number = CONFIG.beacons.bodyRadiusU): number {
  const edge = iconShown ? strokeWorldWidth(beaconIconPx(zoom, bodyRadiusU) / 2, zoom) : bodyRadiusU;
  return edge + strokeWorldWidth(p.px, zoom);
}

/** Pure: does a sprite drawn at `drawnZoom` need re-stroking at `zoom`? */
export function beaconNeedsRestroke(drawnZoom: number, zoom: number): boolean {
  if (!(drawnZoom > 0)) return true;
  return Math.abs(zoom - drawnZoom) > drawnZoom * B.redrawZoomFrac;
}

// --- dashing (the charted ghost's rim) ----------------------------------------

type XY = [number, number];

/** The walk state of `dashPolyline`. */
interface DashWalk {
  out: XY[][];
  cur: XY[] | null;
  left: number;
  dash: number;
  gap: number;
}

/** Flip ink at `p`: close the running dash, or open the next one. */
function flipInk(w: DashWalk, p: XY): void {
  if (w.cur !== null) {
    w.cur.push(p);
    w.out.push(w.cur);
    w.cur = null;
    w.left = w.gap;
    return;
  }
  w.cur = [p];
  w.left = w.dash;
}

/** Walk one segment a→b, flipping ink every time the running length runs out. */
function walkSegment(w: DashWalk, a: XY, b: XY): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let t = 0;
  while (len - t > w.left) {
    t += w.left;
    const k = t / len;
    flipInk(w, [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  }
  w.left -= len - t;
  w.cur?.push([b[0], b[1]]);
}

/**
 * Pure: a polyline cut into dashes `dash` long with `gap` between them (any
 * one unit), starting inked. A non-positive dash or gap draws it whole.
 */
export function dashPolyline(pts: readonly (readonly [number, number])[], dash: number, gap: number): XY[][] {
  const whole: XY[] = pts.map((p): XY => [p[0], p[1]]);
  if (!(dash > 0) || !(gap > 0) || whole.length < 2) return [whole];
  const w: DashWalk = { out: [], cur: [whole[0]], left: dash, dash, gap };
  for (let i = 1; i < whole.length; i++) walkSegment(w, whole[i - 1], whole[i]);
  if (w.cur !== null && w.cur.length > 1) w.out.push(w.cur);
  return w.out;
}

// --- drawing (Graphics in the sprite's LOCAL frame, centred on the beacon) ---

/** Line widths (u) and alphas for one rendering of the art. */
interface ArtPen {
  rim: number;
  inner: number;
  alpha: number;
  /** u — dash / gap of the rim, or 0 for a solid rim. */
  dash: number;
  gap: number;
}

function tracePrim(g: Graphics, p: ArtPrim): void {
  if (p.kind === 'circle') g.circle(p.c.x, p.c.y, p.r);
  else g.poly(p.pts.flatMap((q) => [q.x, q.y]), p.closed);
}

/** A primitive's line, dashed when the pen asks for it (the rim only). */
function strokePrim(g: Graphics, p: ArtPrim, pen: ArtPen): void {
  if (p.line === null) return;
  const width = p.line === 'rim' ? pen.rim : pen.inner;
  const alpha = p.line === 'rail' ? pen.alpha * B.railAlpha : pen.alpha;
  const stroke = { width, color: BEACON_COLOR, alpha, join: 'round' as const, cap: 'round' as const };
  if (p.line === 'rim' && pen.dash > 0 && p.kind === 'poly') {
    const ring: XY[] = [...p.pts, p.pts[0]].map((q): XY => [q.x, q.y]);
    for (const d of dashPolyline(ring, pen.dash, pen.gap)) d.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
    g.stroke(stroke);
    return;
  }
  tracePrim(g, p);
  // The solid hull rim is laid wholly INSIDE the hit edge (Pixi alignment 1),
  // so the buoy's outermost drawn pixel is the hit edge — not half a line past it.
  g.stroke(p.line === 'rim' ? { ...stroke, alignment: 1 } : stroke);
}

/** Paint the art: each primitive filled with its skin slot, then stroked. */
function paintArt(g: Graphics, prims: readonly ArtPrim[], pen: ArtPen): void {
  for (const p of prims) {
    if (p.fill !== null) {
      tracePrim(g, p);
      g.fill({ color: B.skin[p.fill], alpha: p.fillAlpha ?? 1 });
    }
    strokePrim(g, p, pen);
  }
}

/** THE BUOY ON THE WATER — true size, world-unit linework (zoom-free: drawn
 *  once per body size, like the hull art). */
export function drawBeaconBody(g: Graphics, bodyRadiusU: number = CONFIG.beacons.bodyRadiusU): void {
  g.clear();
  const R = bodyRadiusU;
  paintArt(g, beaconArt(R), { rim: R * B.rimLineFrac, inner: R * B.innerLineFrac, alpha: 1, dash: 0, gap: 0 });
}

/** THE CHART ICON — the same buoy at the icon's screen size: the painted buoy
 *  once it is in the water, the dashed ghost while only charted. */
export function drawBeaconIcon(g: Graphics, phase: BeaconPhase, zoom: number, bodyRadiusU: number = CONFIG.beacons.bodyRadiusU): void {
  g.clear();
  const dashed = beaconDashed(phase);
  const R = strokeWorldWidth(beaconIconPx(zoom, bodyRadiusU) / 2, zoom);
  const pen: ArtPen = {
    rim: strokeWorldWidth(B.iconRimPx, zoom),
    inner: strokeWorldWidth(B.iconInnerPx, zoom),
    alpha: markerAlpha(phase),
    dash: dashed ? strokeWorldWidth(B.iconDashPx, zoom) : 0,
    gap: strokeWorldWidth(B.iconGapPx, zoom),
  };
  const minLampR = strokeWorldWidth(B.iconLampMinPx, zoom);
  paintArt(g, dashed ? beaconGhostArt(R, minLampR) : beaconArt(R, minLampR), pen);
}

/** THE RANGE RING — solid, or dashed while only charted. */
export function drawBeaconRing(g: Graphics, phase: BeaconPhase, zoom: number): void {
  g.clear();
  const r = beaconRingRadiusU();
  const stroke = { width: strokeWorldWidth(B.ringStrokePx, zoom), color: BEACON_COLOR, alpha: ringAlpha(phase) };
  if (!beaconDashed(phase)) {
    g.circle(0, 0, r).stroke(stroke);
    return;
  }
  for (const [a0, a1] of dashArcs(B.ringDashes, B.dashDuty)) {
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    g.arc(0, 0, r, a0, a1);
  }
  g.stroke(stroke);
}

/** One wire slot's pooled sprites. */
interface BeaconSprite {
  /** Chart: the range ring and the icon (fog-immune). */
  ring: Graphics;
  icon: Graphics;
  /** Water: the true-size buoy and its broadcast pulse (fogged). */
  body: Graphics;
  pulse: Graphics;
  /** What the chart marks were stroked for (0 = never). */
  drawnZoom: number;
  drawnDashed: boolean | null;
  /** The body radius the icon and the body were drawn for (0 = never). */
  drawnBodyU: number;
}

export class Beacons {
  private readonly sprites: BeaconSprite[] = [];

  /** `chartLayer` = the fog-free chart; `worldLayer` = the fogged water. */
  constructor(
    private readonly chartLayer: Container,
    private readonly worldLayer: Container,
  ) {}

  /**
   * Per render frame: draw `views` (this frame's live beacons) at camera
   * `zoom` (px per u). `nowMs` drives only the decorative pulse, scaled by the
   * motion `intensity` (0 at motion off). A slot absent from `views` hides.
   */
  render(views: readonly BeaconView[], nowMs: number, zoom: number, intensity: number): void {
    for (const s of this.sprites) {
      s.ring.visible = false;
      s.icon.visible = false;
      s.body.visible = false;
      s.pulse.visible = false;
    }
    for (const v of views) this.show(this.spriteFor(v.slot), v, nowMs, zoom, intensity);
  }

  /** Force a re-stroke on the next frame (the review page's size dial). */
  invalidate(): void {
    for (const s of this.sprites) {
      s.drawnZoom = 0;
      s.drawnBodyU = 0;
    }
  }

  private show(s: BeaconSprite, v: BeaconView, nowMs: number, zoom: number, intensity: number): void {
    this.restroke(s, v.phase, zoom);
    const fade = beaconFade(v);
    const look = beaconSettle(v);
    s.ring.visible = fade > 0;
    s.ring.position.set(v.x, v.y);
    s.ring.alpha = fade;
    const iconShown = beaconIconShown(v.phase, zoom) && fade > 0;
    s.icon.visible = iconShown;
    s.icon.position.set(v.x, v.y);
    s.icon.alpha = fade;
    s.icon.tint = look.tint;
    s.icon.scale.set(look.scale);
    s.body.visible = look.visible && look.alpha > 0;
    s.body.position.set(v.x, v.y);
    s.body.alpha = look.alpha;
    s.body.tint = look.tint;
    s.body.scale.set(look.scale);
    this.drawPulse(s, v, beaconPulse(nowMs, v, intensity), zoom, iconShown);
  }

  /** Re-stroke the chart marks on a style or zoom change, the body on a size
   *  change only (its linework is world units). */
  private restroke(s: BeaconSprite, phase: BeaconPhase, zoom: number): void {
    const bodyU = CONFIG.beacons.bodyRadiusU;
    const dashed = beaconDashed(phase);
    if (s.drawnBodyU !== bodyU) drawBeaconBody(s.body, bodyU);
    if (beaconNeedsRestroke(s.drawnZoom, zoom) || s.drawnDashed !== dashed || s.drawnBodyU !== bodyU) {
      drawBeaconRing(s.ring, phase, zoom);
      drawBeaconIcon(s.icon, phase, zoom, bodyU);
      s.drawnZoom = zoom;
      s.drawnDashed = dashed;
    }
    s.drawnBodyU = bodyU;
  }

  /** The pulse — one ring growing out from the buoy's drawn edge, re-stroked
   *  per frame while it shows. */
  private drawPulse(s: BeaconSprite, v: BeaconView, p: BeaconPulse, zoom: number, iconShown: boolean): void {
    s.pulse.clear();
    if (!(p.alpha > 0)) return;
    s.pulse.visible = true;
    s.pulse.position.set(v.x, v.y);
    s.pulse.circle(0, 0, beaconPulseRadiusU(p, zoom, iconShown));
    s.pulse.stroke({ width: strokeWorldWidth(B.pulseStrokePx, zoom), color: BEACON_COLOR, alpha: p.alpha });
  }

  private spriteFor(slot: number): BeaconSprite {
    let s = this.sprites[slot];
    if (s === undefined) {
      const ring = new Graphics();
      const icon = new Graphics();
      const body = new Graphics();
      const pulse = new Graphics();
      this.chartLayer.addChild(ring, icon);
      this.worldLayer.addChild(body, pulse);
      s = { ring, icon, body, pulse, drawnZoom: 0, drawnDashed: null, drawnBodyU: 0 };
      this.sprites[slot] = s;
    }
    return s;
  }
}
