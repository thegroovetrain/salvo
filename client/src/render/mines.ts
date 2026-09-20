// Mine field rendering from FrameMsg.mines (contact-like per-observer state, not
// events). Own mines are drawn in chartRoot (fog-immune) so you can always read
// your own field even when it lies under fog beyond sight range; enemy mines are
// drawn in worldRoot and only ever arrive while sighted, so fog over them is a
// non-issue. A mine dropping out of the frame list simply despawns its sprite —
// the client cannot tell whether it was triggered or just fell out of sight, and
// that ambiguity is the design.
//
// Story 1.12 (Regatta Hoist): the marker COLOR is the DROPPER's personal hue
// (MineView.by → hueFor), the SAME hue for every observer — the old own-green /
// enemy-amber color split is gone (amber survives only as the roster-miss
// fallback inside hueFor). The own/enemy LAYER + brightness split stays: own
// mines dim on the fog-immune chart, enemy mines brighter in the fogged world.
//
// STORY 7-5 WAVE 2 — MINES DO NOT MOVE, AND CANNOT. Story 2.9 taught this
// renderer to walk a sprite, because the SELF-PROPELLED doctrine (Story 2.8)
// had put mines under power and a creeping mine sat frozen at its drop point
// while the real, lethal one walked away. That doctrine left the game with its
// card: CAPTIVE MINES replaced it, and a captive mine is MOORED — it attacks by
// launching a torpedo, never by moving. So the whole creep apparatus is gone —
// the MOVE list, the sprite walk, the heading tick, the wake dots and their
// CLIENT_CONFIG.ordnance.creep* knobs — and reconcile() is back to the pure
// add/remove lifecycle diff (unit-tested) that render/litZones.ts also uses.
// Nothing may re-add a move path without a mine that can move.

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG, type EffectiveMine, type MineKind, type MineView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { dashArcs } from '../util/math.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';

export type { HueFor };

const R = CLIENT_CONFIG.mineRings;
const P = CLIENT_CONFIG.aimPreview;
const RING_R = 10; // u (Eric 2026-07-22: the mine graphic read a bit small)
const DOT_R = 3.5; // u

/**
 * THE OWNER'S LIVE MINE NUMBERS, fed in every sync — the three mine ROWS
 * themselves plus the frame clock. They are `effectiveStats` values, so a card
 * fitted this second moves the rings this second, and the server reads these
 * SAME owner rows when one of our mines trips or blasts: the rings ARE the
 * mine's ground truth, not a decoration of it.
 *
 * IT CARRIES ALL THREE ROWS, NOT ONE RADIUS PAIR (Story 8.13, epic-8
 * amendments 76/81). One hull may now lay naval, captive and fouling mines at
 * once, so "the owner's blast radius" is not a number any more — it is a
 * question about WHICH mine. Each sprite answers it from the kind on its own
 * wire view (`MineView.c`, emitted for own mines only) and reads THAT kind's
 * row; nothing here may read `navalMines` for a captive.
 *
 * THE `captive` FLAG IS GONE with the verb it named: CAPTIVE MINES is its own
 * LINE now, so the distinction is the kind, and the kind is on the mine.
 *
 * THE `acquire` CHANNEL IS STILL DELETED. It carried the SELF-PROPELLED
 * doctrine's hunting reach, and that verb left the game with its card (R2.6).
 * It was NOT repurposed for the captive trip ring: that ring IS the captive
 * row's own `triggerRadius`, so a second field carrying the same number would
 * be two names for one radius — exactly the drift a single derivation exists to
 * prevent. What the channel's GRAMMAR is inherited by is the line STYLE: dotted
 * has always meant "the water this mine hunts", which is precisely what a
 * captive mine's trip ring is.
 *
 * `now` is THE FRAME'S OWN TIMESTAMP (`FrameMsg.t`), not a local clock reading,
 * and that distinction is the whole accuracy of the arming dim: `armedAt` is
 * not on the wire and does not need to be — these are OUR mines and we watched
 * them appear — but only if both ends of the comparison come from the same
 * authoritative clock. Dating first-seen by local receive time instead charges
 * the mine for the transport delay and holds the dim systematically late.
 */
export interface OwnMineRings {
  /** The owner's effective row per mine kind — `stats.equipment.navalMines`,
   *  `.captiveMines` and `.foulingMines`, assembled once per frame. */
  rows: Readonly<Record<MineKind, EffectiveMine>>;
  now: number;
}

/** The kind an own mine's rings are drawn at when the wire view carries none.
 *  A frame built by this server ALWAYS stamps `c` on an own mine (amendment
 *  76), so this is the defensive branch only — an old/foreign frame draws the
 *  naval pair rather than nothing, which is the pre-8.13 behaviour. */
const DEFAULT_MINE_KIND: MineKind = 'naval';

/** Pure: the kind a mine view declares, or the naval default (see above). */
export function mineKindOfView(m: Pick<MineView, 'c'>): MineKind {
  return m.c ?? DEFAULT_MINE_KIND;
}

/** One own-mine radius ring. STYLE, not hue, is what separates them (all three
 *  render in the dropper's personal color — DESIGN.md dual-coding). */
export interface MineRing {
  r: number;
  style: 'solid' | 'dashed' | 'dotted';
  alpha: number;
}

/**
 * Pure: the rings an OWN mine OF THIS KIND draws. `armed` false dims every ring
 * by `armingScale`: a mine that cannot trip yet must not draw a live trip ring.
 *
 * A CONTACT MINE — naval or fouling — draws two: solid blast (the killing area
 * it detonates in) and dashed trigger (what sets it off). The FOULING mine is a
 * contact mine with a wider, weaker burst, so it draws the same pair; its slow
 * is a card row, not a circle on the water.
 *
 * A CAPTIVE MINE draws exactly ONE, and the difference is a statement of fact
 * rather than a style choice (R2.12): a captive mine NEVER detonates on
 * contact, so a solid ring around the casing would promise a contact blast that
 * cannot happen — the one affordance this verb has to stop. Its `blastRadius`
 * is the radius the LAUNCHED TORPEDO bursts in, wherever that torpedo
 * eventually connects, so it is not a circle centred on the mine at all and is
 * not drawn as one. What IS true of the water around the mine is the trip ring,
 * and it is drawn DOTTED — the acquisition grammar the retired SELF-PROPELLED
 * ring used — because that is what this ring now means: the water the mine
 * hunts, and the line the first hostile crosses to eat a torpedo.
 *
 * THE ROW IS PICKED BY THE MINE'S OWN KIND (Story 8.13), which rides its own
 * wire view: a captain carrying naval AND captive racks sees each field at its
 * true radii, because each sprite asks its own row.
 */
export function ownMineRings(p: OwnMineRings, kind: MineKind, armed: boolean): MineRing[] {
  const scale = armed ? 1 : R.armingScale;
  const row = p.rows[kind];
  if (kind === 'captive') return [{ r: row.triggerRadius, style: 'dotted', alpha: R.triggerAlpha * scale }];
  return [
    { r: row.blastRadius, style: 'solid', alpha: R.blastAlpha * scale },
    { r: row.triggerRadius, style: 'dashed', alpha: R.triggerAlpha * scale },
  ];
}

/** Pure: has a mine we first saw at `seenAt` finished arming by `now`? Both are
 *  FRAME timestamps, so the window is measured on the server's own clock. A
 *  `seenAt` of -Infinity means "already armed when we first laid eyes on it" —
 *  the rebuild/rejoin case (see Mines.sync's first-frame rule). */
export function mineArmed(seenAt: number, now: number): boolean {
  return now - seenAt >= CONFIG.mine.armDelay;
}

/** Pure: a redraw key for a ring set — the sprite redraws only when this
 *  changes (a boon lands, or the mine finishes arming), never per frame. */
export function ringsKey(rings: readonly MineRing[]): string {
  return rings.map((r) => `${r.style}:${r.r}:${r.alpha.toFixed(3)}`).join('|');
}

/** What changed between the sprites we hold and the incoming mine list.
 *  ADD/REMOVE ONLY — the `move` list (and `MinePos`/`mineMoved` with it) is
 *  RETIRED with the creep, see header: a mine's position is set once at spawn
 *  and cannot change. */
export interface MineDiff {
  add: MineView[];
  remove: string[];
}

/**
 * Pure: given the sprite ids we currently hold and the new frame's mine list,
 * return which mines to add and which sprite ids to remove. A mine present in
 * both is left completely untouched — the render/litZones.ts reconcile shape,
 * which this returned to once mines stopped being able to move.
 */
export function reconcileMines(current: ReadonlySet<string>, incoming: readonly MineView[]): MineDiff {
  const seen = new Set<string>();
  const add: MineView[] = [];
  for (const m of incoming) {
    seen.add(m.id);
    if (!current.has(m.id)) add.push(m);
  }
  const remove: string[] = [];
  for (const id of current) if (!seen.has(id)) remove.push(id);
  return { add, remove };
}

/** A live mine sprite + its firer-hue latch (retryHue recolors it once the
 *  dropper's roster hue syncs). `own` drives only brightness on redraw. No
 *  position and no course: a mine is moored, so the Graphics is placed once at
 *  spawn and never walked. */
interface MineSprite extends HueState {
  g: Graphics;
  own: boolean;
  /** THE KIND THIS MINE WAS LAID AS (Story 8.13) — read once off the wire view
   *  at spawn and never re-derived. It is present only on OUR own mines
   *  (`MineView.c`, epic-8 amendment 76), so an enemy sprite carries the naval
   *  default and never draws a ring anyway. */
  kind: MineKind;
  /** The color the marker is currently painted in (the hue latch's resolved
   *  hue, or the amber fallback) — a recolor/ring redraw needs it without
   *  re-probing. */
  color: number;
  /** Server time (ms) we first saw this mine — the arming-window clock. */
  seenAt: number;
  /** The own-mine radius rings currently painted (empty for an enemy mine),
   *  plus their redraw key, so a per-frame sync is a no-op until something
   *  actually changes. */
  rings: MineRing[];
  ringsKey: string;
}

export class Mines {
  private readonly sprites = new Map<string, MineSprite>();
  /** Has any frame been synced yet? The FIRST one is a rejoin snapshot whose
   *  mines are already on the water (see sync), not a batch of fresh drops. */
  private synced = false;

  /**
   * `ownLayer` = chartRoot (fog-immune); `enemyLayer` = worldRoot.
   * `onOwnMineSpawn` (optional) fires once per own mine newly added this
   * sync — the audio own-fire cue hook (mines have no discrete GameEvent of
   * their own; this reconcile diff is the only "just placed" signal).
   */
  constructor(
    private readonly ownLayer: Container,
    private readonly enemyLayer: Container,
    private readonly onOwnMineSpawn?: (m: MineView) => void,
  ) {}

  /** Reconcile sprites against this observer's mine list for the tick. `hueFor`
   *  resolves each mine's dropper id (`by`) → its personal hue (Story 1.12), or
   *  null while the roster hasn't synced — those markers boot on the amber
   *  fallback and recolor here on a later tick once the hue lands.
   *
   *  `own` carries the OWNER's live mine radii + the server clock: OUR mines
   *  draw their blast/trigger(/acquisition) rings always-on from it. Omitted
   *  (tests, and any caller that has no own stats yet) = markers only, exactly
   *  as before. An enemy's mine NEVER draws a ring — their numbers are theirs. */
  sync(mines: readonly MineView[], hueFor: HueFor, own?: OwnMineRings): void {
    const { add, remove } = reconcileMines(new Set(this.sprites.keys()), mines);
    // THE FIRST SYNCED FRAME is a rejoin, not a drop: every mine already on the
    // water when we arrive has been there for some unknowable time, and most of
    // them are long armed. Stamping them as first-seen NOW would flash the
    // whole field back to the arming dim for 3s after any reconnect or reload —
    // a lie about live ordnance. They come up ARMED; anything laid after this
    // frame is a real drop and dims honestly.
    const seenAt = this.synced ? (own?.now ?? 0) : -Infinity;
    this.synced = true;
    for (const id of remove) this.despawn(id);
    for (const m of add) this.spawn(m, hueFor, own, seenAt);
    for (const s of this.sprites.values()) {
      retryHue(s, hueFor, (color) => {
        s.color = color;
        this.redraw(s);
      });
      this.refreshRings(s, own);
    }
  }

  /** Re-evaluate one own sprite's rings against the current owner stats +
   *  clock, redrawing ONLY when they actually changed (a boon landed, or the
   *  mine just finished arming and snaps from dim to full). */
  private refreshRings(s: MineSprite, own: OwnMineRings | undefined): void {
    if (!s.own || own === undefined) return;
    const rings = ownMineRings(own, s.kind, mineArmed(s.seenAt, own.now));
    const key = ringsKey(rings);
    if (key === s.ringsKey) return;
    s.rings = rings;
    s.ringsKey = key;
    this.redraw(s);
  }

  /** The whole sprite: marker + (own) radius rings, in its current hue. */
  private redraw(s: MineSprite): void {
    this.drawMarker(s.g, s.own, s.color);
    for (const ring of s.rings) drawRing(s.g, ring, s.color);
  }

  /** Where a held mine's SPRITE sits — the render-state seam the placement
   *  tests read, without reaching into the display list. Null for an id we hold
   *  no sprite for. Set once at spawn; it never moves (see header). */
  spriteAt(id: string): { x: number; y: number } | null {
    const s = this.sprites.get(id);
    return s ? { x: s.g.position.x, y: s.g.position.y } : null;
  }

  /** The radius rings a held mine currently draws (empty for an enemy mine, or
   *  before owner stats arrive) — the ring tests' render-state seam, without
   *  reaching into the display list. */
  ringsAt(id: string): readonly MineRing[] {
    return this.sprites.get(id)?.rings ?? [];
  }

  /** The KIND a held mine was laid as (Story 8.13) — the ring tests' second
   *  seam, so a pin can assert "this sprite read the wire's kind" without
   *  inferring it back out of the radii. Null for an id we hold no sprite for. */
  kindAt(id: string): MineKind | null {
    return this.sprites.get(id)?.kind ?? null;
  }

  private spawn(m: MineView, hueFor: HueFor, own: OwnMineRings | undefined, seenAt: number): void {
    const g = new Graphics();
    const { color, colored, rev } = resolveHue(m.by, hueFor);
    g.position.set(m.x, m.y);
    (m.own ? this.ownLayer : this.enemyLayer).addChild(g);
    const s: MineSprite = {
      g, by: m.by, own: m.own, colored, rev, color, kind: mineKindOfView(m),
      // A mine appearing after the first synced frame is one we just dropped
      // (own mines never leave our own frame list), so first-seen IS the drop
      // time — dated by the FRAME's clock, the same one `now` reads.
      seenAt, rings: [], ringsKey: '',
    };
    this.sprites.set(m.id, s);
    this.refreshRings(s, own); // draws the rings; redraw() paints the marker too
    if (s.rings.length === 0) this.drawMarker(g, m.own, color);
    if (m.own) this.onOwnMineSpawn?.(m);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    this.sprites.delete(id);
  }

  /**
   * Draw the mine marker onto `g` (clearing any prior geometry — the recolor and
   * ring paths redraw in place). `color` = the dropper's personal hue (same for
   * all observers); `own` drives only the brightness (dim on your own chart,
   * brighter as an enemy warning).
   *
   * THE CREEP TICK IS GONE (Story 7-5 wave 2): the spur out of the ring showed
   * the course a SELF-PROPELLED mine was making good, and no mine has a course
   * any more. A marker is a ring and a dot.
   */
  private drawMarker(g: Graphics, own: boolean, color: number): void {
    const alpha = own ? 0.7 : 0.9;
    g.clear();
    g.circle(0, 0, RING_R).stroke({ width: 1.5, color, alpha });
    g.circle(0, 0, DOT_R).fill({ color, alpha: own ? 0.8 : 1 });
  }
}

/**
 * One own-mine radius ring in the dropper's hue, in the sprite's LOCAL frame
 * (the graphic is positioned at the mine). Style is the channel that separates
 * the radii — solid blast, dashed trigger, sparse-dotted acquisition — so the
 * set reads without color vision and without motion.
 */
function drawRing(g: Graphics, ring: MineRing, color: number): void {
  const stroke = { width: R.width, color, alpha: ring.alpha };
  if (ring.style === 'solid') {
    g.circle(0, 0, ring.r).stroke(stroke);
    return;
  }
  const dashed = ring.style === 'dashed';
  for (const [a0, a1] of dashArcs(
    dashed ? P.dashSegments : P.dotSegments,
    dashed ? P.dashDuty : P.dotDuty,
  )) {
    g.moveTo(Math.cos(a0) * ring.r, Math.sin(a0) * ring.r);
    g.arc(0, 0, ring.r, a0, a1);
  }
  g.stroke(stroke);
}
