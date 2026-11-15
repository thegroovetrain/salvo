// THE PLAIN HULL VIEW (Story 11.2, Eric 2026-11-12, ruling R3) — how a hull
// seen by eye beyond the class-and-name reach is drawn: "a ship, class
// unknown". ONE generic battleship-like silhouette for every plain contact, at
// ONE fixed length (`PLAIN_HULL_LENGTH_U`, the mean of the four hulls) and the
// mean beam — so neither its shape nor its size hints at a class. No turrets,
// no launchers, no nameplate, no deck detail.
//
// THE CONTACT HULL REGISTER, FLAT: the real hull art is a skin fill under one
// bold relation-color line (render/hullArt — epic-10 amendment 7(m)); this is
// the same pair with nothing between them. The line is the enemy relation
// color at the hull line weight (a plain hull has no roster id, and every
// hull but your own is an enemy). The fill is the per-channel MEAN of the four
// hulls' Default-skin deck fills — computed, never typed — a neutral deck that
// is no one hull's. [reading: Story 11.2 — the plain hull's fill and outline]
//
// One shared GraphicsContext (built once, borrowed by every view); per frame
// only the container's pose and alpha are written.
//
// THE RAIN LOOK (Story 11.6, Eric's A+D — render/rainSight.ts +
// hullDissolve.ts): as a full contact, from the frame's rain eye (`setRain`).
// A plain hull has no class on the client, so its sight grid is laid over its
// own DRAWN size — `PLAIN_HULL_LENGTH_U` × `PLAIN_HULL_BEAM_U`.

import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { SHIP_CLASS_IDS, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { PLAIN_HULL_BEAM_U, PLAIN_HULL_LENGTH_U } from '../net/plainContacts.js';
import { relationStroke } from './relationColor.js';
import { HullRainVis, type RainEye } from './rainSight.js';
import { HullDissolve } from './hullDissolve.js';

/** Pure: per-channel mean of packed 0xRRGGBB colors. */
export function meanColor(colors: readonly number[]): number {
  const ch = (shift: number): number =>
    Math.round(colors.reduce((s, c) => s + ((c >> shift) & 0xff), 0) / colors.length) << shift;
  return ch(16) | ch(8) | ch(0);
}

/** The plain hull's neutral deck fill: the mean of the four Default-skin decks. */
export const PLAIN_HULL_FILL = meanColor(SHIP_CLASS_IDS.map((id) => CLIENT_CONFIG.skins.default[id].deck));

/**
 * Pure: the generic battleship plan form, bow at +x, origin-centered, world
 * units — `lengthU` bow to stern, `beamU` across: a pointed bow run, a
 * parallel mid-body and a squared-off rounded stern. The fractions are the
 * SHAPE of a capital ship's waterline (fine bow, full stern), not a stat.
 */
export function plainHullPolygon(lengthU = PLAIN_HULL_LENGTH_U, beamU = PLAIN_HULL_BEAM_U): Vec2[] {
  const hl = lengthU / 2;
  const hb = beamU / 2;
  const half: Vec2[] = [
    { x: hl, y: 0 },
    { x: hl - lengthU * 0.12, y: hb * 0.62 },
    { x: hl - lengthU * 0.3, y: hb },
    { x: -hl + lengthU * 0.14, y: hb },
    { x: -hl + lengthU * 0.03, y: hb * 0.82 },
    { x: -hl, y: hb * 0.45 },
  ];
  const mirror = half
    .slice(1)
    .reverse()
    .map((p) => ({ x: p.x, y: -p.y }));
  return [...half, ...mirror];
}

let shared: GraphicsContext | null = null;

/** The one shared context every plain hull borrows (never destroyed). */
function plainHullContext(): GraphicsContext {
  if (shared !== null) return shared;
  const pts = plainHullPolygon().flatMap((p) => [p.x, p.y]);
  shared = new GraphicsContext()
    .poly(pts, true)
    .fill({ color: PLAIN_HULL_FILL, alpha: 1 })
    .stroke({ width: CLIENT_CONFIG.ship.art.hullLineU, color: relationStroke('enemy'), alpha: 1, join: 'round' });
  return shared;
}

/** One plain hull on the water: pose + alpha (+ the rain look) only. */
export class PlainHullView {
  readonly gfx = new Container();
  private readonly rainVis = new HullRainVis();
  private readonly dissolve = new HullDissolve(this.gfx);
  private fade = 1;
  private rainAlpha = 1;
  private posed = false;

  constructor() {
    this.gfx.addChild(new Graphics(plainHullContext()));
  }

  /** The rain look (Story 11.6): per frame, after `update`, with this frame's rain eye (null = none). */
  setRain(eye: RainEye | null, dtMs: number): void {
    const p = this.gfx.position;
    const vis = this.posed ? this.rainVis.step(eye, p.x, p.y, this.gfx.rotation, PLAIN_HULL_LENGTH_U, PLAIN_HULL_BEAM_U, dtMs) : null;
    this.rainAlpha = this.dissolve.apply(vis, PLAIN_HULL_LENGTH_U, PLAIN_HULL_BEAM_U);
    this.gfx.alpha = this.fade * this.rainAlpha;
  }

  /** Is the A+D filter on this hull right now? (tests/debug) */
  get rainFiltered(): boolean {
    return this.dissolve.active;
  }

  /** Pose the hull (world units; heading = sprite rotation, as ShipView). */
  update(x: number, y: number, heading: number): void {
    this.posed = true;
    this.gfx.position.set(x, y);
    this.gfx.rotation = heading;
  }

  /** The lifecycle fade (render/fade.ts). */
  setFade(alpha: number): void {
    this.fade = alpha;
    this.gfx.alpha = alpha * this.rainAlpha;
  }

  /** Destroy the view (the shared context is borrowed and survives; so does the filter's noise). */
  destroy(): void {
    this.dissolve.detach();
    this.gfx.destroy({ children: true });
  }
}
