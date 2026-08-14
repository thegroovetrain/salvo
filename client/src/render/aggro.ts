// THE AGGRO BRACKET (Story 5.6, epic-5 amendment 40) — the angular mark a PvE
// fleet ship wears while it has acquired YOU.
//
// Eric: *"I want it very visually obvious that a PvE ship has aggro'd you, and
// very visually obvious if it de-aggro's you, as well."*
//
// THE CHANNEL IS SHAPE, NOT COLOUR, AND THAT WAS FORCED. Drones are locked
// greyscale (DESIGN.md:157) and DESIGN.md:162 keeps THREAT on the dual-coding
// floor even under the Variant-C identity waiver, so the only channel available
// is presence/absence of a shape. The bracket is drawn in `colors.amber` —
// DESIGN.md:139's ratified warning register, and one of the hue bands RESERVED
// from combatant hues (DESIGN.md:161) — but the amber is the SECOND coding, not
// the first: delete every colour on screen and the lock still reads.
//
// STATIC WHILE HELD. Not animated, deliberately: a pulse would claim a slice of
// the photosensitivity budget and would need Story 4.8 attention-tier
// arbitration, which is exactly the argument epic-4 amendment 220 used to keep
// the kill-leader glow static.
//
// ONE GEOMETRY CHANNEL FOR BOTH TRANSITIONS. `spread` tears each corner's two
// arms apart at the elbow. Acquire runs it DOWN to zero (the bracket closes onto
// the hull with a brightness pop); release runs it UP (*"the bracket visibly
// breaks at the corners and fades"*). One number, opposite directions, so the
// two beats cannot drift apart as separate animations would.
//
// THE MOTION SETTING REMOVES MOTION, NEVER INFORMATION (amendment 40). At
// `motionIntensity() === 0` the bracket SNAPS on at its resting look with no
// flash and SNAPS off with no fade — the state is still fully carried, it just
// stops moving. `reduced` halves the flash's amplitude and keeps its full
// duration, which is Story 2.3's standing rule for every flash in this client.
//
// PURE HALF / VIEW HALF, as ui/chromeBar.ts and render/attention.ts are split:
// everything that decides WHAT to draw is a total function of (phase, elapsed,
// motion) and is unit-tested; the Pixi object below only strokes what it is told.

import { Graphics, type Container } from 'pixi.js';
import { hullSilhouette, polygonMaxRadius, type HullId, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import type { WorldFlashGate } from './effects.js';

const A = CLIENT_CONFIG.aggro;
const C = CLIENT_CONFIG.colors;

/**
 * The mark's three phases. `lock` and `break` are the two TRANSITIONS (each
 * bounded by its own duration); `held` is the steady state between them and
 * `off` is the absence of the mark entirely.
 */
export type AggroPhase = 'off' | 'lock' | 'held' | 'break';

/** One frame of the bracket, in world units. */
export interface AggroFrame {
  /** Draw anything at all? (`false` once a break has run out.) */
  visible: boolean;
  /** How far each corner's two arms are torn apart at the elbow (world u).
   *  0 = the elbow is closed and the corner reads as one unbroken L. */
  spread: number;
  /** Stroke alpha BEFORE the contact's own sight fade is multiplied in. */
  alpha: number;
}

const HIDDEN: AggroFrame = { visible: false, spread: 0, alpha: 0 };

/** [0,1] clamp; NaN reads as 0 (`!(v > 0)` catches it) — render/ships.ts's. */
function clamp01(v: number): number {
  if (!(v > 0)) return 0;
  return v > 1 ? 1 : v;
}

/**
 * Pure: the bracket's look for a frame.
 *
 * `motion` is `motionIntensity(settings.current.motion)` — 1 full, 0.5 reduced,
 * 0 off. At 0 both transitions collapse to their endpoints (snap on / snap off)
 * rather than disappearing: an accessibility setting may delete MOTION, never
 * the fact that something has you in its sights.
 */
export function aggroFrame(phase: AggroPhase, elapsedMs: number, motion: number): AggroFrame {
  if (phase === 'off') return HIDDEN;
  if (phase === 'held') return { visible: true, spread: 0, alpha: A.holdAlpha };
  if (phase === 'lock') {
    if (motion <= 0) return { visible: true, spread: 0, alpha: A.holdAlpha }; // snap on
    // Strength, never duration (Story 2.3): `reduced` shrinks the pop's
    // amplitude and the distance the corners travel, and both still land on the
    // resting look at exactly `flashMs`.
    const left = 1 - clamp01(elapsedMs / A.flashMs);
    return { visible: true, spread: A.flashSpreadU * left * motion, alpha: A.holdAlpha + (1 - A.holdAlpha) * left * motion };
  }
  if (motion <= 0) return HIDDEN; // snap off
  const p = clamp01(elapsedMs / A.breakMs);
  return { visible: p < 1, spread: A.breakSpreadU * p, alpha: A.holdAlpha * (1 - p) };
}

/** One straight arm of the bracket, as a world-space segment pair. */
export type AggroSegment = readonly [Vec2, Vec2];

/**
 * Pure: the eight arms of a four-corner bracket of half-size `half`, each arm
 * `arm` long, with the two arms of every corner displaced `spread` apart at the
 * elbow (each perpendicular to itself, i.e. straight outward).
 *
 * At `spread === 0` every corner's two arms meet EXACTLY at their elbow, so the
 * mark reads as four unbroken Ls; any positive spread tears that elbow open,
 * which is the whole release beat.
 */
export function bracketArms(half: number, arm: number, spread: number): AggroSegment[] {
  const out: AggroSegment[] = [];
  const a = Math.max(0, Math.min(arm, half * 2));
  const o = half + spread;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      // The arm running along X, pushed outward in Y.
      out.push([{ x: sx * half, y: sy * o }, { x: sx * (half - a), y: sy * o }]);
      // The arm running along Y, pushed outward in X.
      out.push([{ x: sx * o, y: sy * half }, { x: sx * o, y: sy * (half - a) }]);
    }
  }
  return out;
}

/** Per-hull bracket half-size (world u), memoized: the silhouette's bounding
 *  radius scaled clear of the hull plus a flat pad. Same source of truth as the
 *  nameplate offset, so plate and bracket never disagree about how big a hull
 *  is. */
const HALF_SIZE = new Map<HullId, number>();
export function bracketHalfSize(hullId: HullId): number {
  const cached = HALF_SIZE.get(hullId);
  if (cached !== undefined) return cached;
  const half = polygonMaxRadius(hullSilhouette(hullId)) * A.sizeFactor + A.padU;
  HALF_SIZE.set(hullId, half);
  return half;
}

// --- THE ACQUIRE FLASH'S BUDGET CLAIM ----------------------------------------
//
// The acquire pop is an on-water one-shot at a world position, which amendment
// 241 puts OUTSIDE the attention-tier system entirely and answers to
// render/flashBudget.ts instead — exactly as the hull hit flash does. A
// MODULE-LEVEL gate, in the same shape as render/ships.ts's `hullFlashGate`,
// because marks are created lazily per contact deep inside ContactViews and a
// constructor parameter would leave most of them unbudgeted.
//
// Over budget DEGRADES rather than disappears: the bracket still snaps on and
// still holds, it simply does so without the brightness pop. Presence — the
// only thing that carries information here — always survives.

let aggroFlashGate: WorldFlashGate | null = null;

/** Wire (or clear) the acquire pop's budget gate. main.ts owns the instance —
 *  the SAME gate `Effects` and `ShipView` claim against, because the ratified
 *  floor is aggregate per screen region. */
export function setAggroFlashGate(gate: WorldFlashGate | null): void {
  aggroFlashGate = gate;
}

/**
 * The bracket's Pixi object: one Graphics, re-stroked only when the frame it
 * would draw actually changes. Owned by render/contacts.ts (one per contact
 * view that has ever been locked on), never constructed anywhere else.
 */
export class AggroMark {
  readonly gfx: Graphics;
  private phase: AggroPhase = 'off';
  private since = 0;
  /** The flash amplitude latched at ACQUIRE time and never re-evaluated — a pop
   *  that dimmed mid-window as the budget's window slid would be a strobe
   *  manufactured by the anti-strobe mechanism (epic-4 amendment 83). */
  private amount = 1;
  /** The last-drawn (spread, alpha, half) triple — the redraw guard. */
  private drawn = { spread: -1, alpha: -1, half: -1 };

  constructor(
    layer: Container,
    private readonly half: number,
  ) {
    this.gfx = new Graphics();
    this.gfx.visible = false;
    layer.addChild(this.gfx);
  }

  /** Is the mark still doing anything? (`false` once a break has finished, which
   *  is when the owner may drop it.) */
  get active(): boolean {
    return this.phase !== 'off';
  }

  /**
   * Drive the mark from this frame's truth. `locked` is `Contact.aggro === true`
   * for THIS observer; `nowMs` is the frame's single monotonic timestamp.
   * Returns the TRANSITION it just took, so the caller can sound its cue exactly
   * once (this module never touches audio — one-way data flow).
   */
  set(locked: boolean, nowMs: number): 'acquired' | 'released' | null {
    if (locked && this.phase !== 'lock' && this.phase !== 'held') {
      this.arm(nowMs);
      return 'acquired';
    }
    if (!locked && (this.phase === 'lock' || this.phase === 'held')) {
      this.phase = 'break';
      this.since = nowMs;
      // RE-READ, never inherit: `amount` may have been zeroed by the acquire's
      // BUDGET degrade, and the break is not a flash — it is a 400ms fade that
      // claims nothing. Latched here so one release runs at one amplitude even
      // if the setting changes underneath it.
      this.amount = motionIntensity(settings.current.motion);
      return 'released';
    }
    return null;
  }

  /** The acquire onset: motion gate, then budget claim, then latch. The claim
   *  runs AFTER the motion gate, so a pop the setting already suppressed spends
   *  no budget — render/ships.ts `bloom`'s order, for the same reason. */
  private arm(nowMs: number): void {
    const motion = motionIntensity(settings.current.motion);
    const p = this.gfx.position;
    const degraded = motion > 0 && aggroFlashGate !== null && aggroFlashGate.claim(p.x, p.y) === 'degrade';
    this.amount = degraded ? 0 : motion;
    this.phase = 'lock';
    this.since = nowMs;
  }

  /** Position the mark on its hull's world pose (called with the SAME sample the
   *  hull view drew, so the two can never separate). */
  place(x: number, y: number): void {
    this.gfx.position.set(x, y);
  }

  /**
   * Advance + draw one frame. `fade` is the contact view's own alpha (lifecycle
   * fader × sight-boundary feather), multiplied in so the bracket fades with the
   * hull it wraps rather than outliving it.
   */
  render(nowMs: number, fade: number): void {
    const f = aggroFrame(this.phase, nowMs - this.since, this.amount);
    if (this.phase === 'lock' && nowMs - this.since >= CLIENT_CONFIG.aggro.flashMs) this.phase = 'held';
    else if (this.phase === 'break' && !f.visible) this.phase = 'off';
    this.gfx.visible = f.visible && fade > 0;
    if (!this.gfx.visible) return;
    this.gfx.alpha = fade;
    this.redraw(f);
  }

  /** Re-stroke only when the geometry or alpha actually moved: a HELD bracket is
   *  static by ruling, so the steady state costs one visibility check a frame. */
  private redraw(f: AggroFrame): void {
    if (this.drawn.spread === f.spread && this.drawn.alpha === f.alpha && this.drawn.half === this.half) return;
    this.drawn = { spread: f.spread, alpha: f.alpha, half: this.half };
    const g = this.gfx;
    g.clear();
    for (const [p0, p1] of bracketArms(this.half, this.half * A.armFrac, f.spread)) {
      g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y);
    }
    g.stroke({ width: A.widthU, color: C.amber, alpha: f.alpha });
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
