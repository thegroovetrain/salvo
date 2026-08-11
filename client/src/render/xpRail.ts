// THE economy satellites (Story 2.6, amendments 27 + 33) — the bottom-left
// counterpart to the own-vitals cluster, living in the strip Story 2.2 reserved
// for it (`hotbarLayout().gutterX`, x ∈ [28,44)):
//
//   [▲2]  LEVEL UP — TAB TO REFIT      ← banked-level chip + cue line
//   LV 3                               ← the LV tag
//   ┃                                  ← the 3px XP rail, bottom-up fill
//   ┃  ░ hotbar slot rows ░
//
// The rail INHERITS the HP rail's idiom (dim phosphor track, bottom-up fill,
// soft glow — CLIENT_CONFIG.vitals tokens) at 3px: "mirrors the XP rail" is an
// idiom, not width parity (amendment 27). The chip is AMBER — an action is
// available — and is dual-coded: a ▲ glyph plus the banked count plus the cue
// line's words, so nothing is carried by hue alone.
//
// RENDER-ONLY, by construction: nothing here routes a click. The gutter stays
// WATER in `slotAtPoint` (hotbar.ts), and the satellites above the stack sit
// outside every row footprint — a press over them falls through and fires
// exactly as it did before this story.
//
// Server-authoritative: `lvl`/`xp` are rendered VERBATIM off `you`. There is no
// client-side XP accrual, prediction, or interpolation to drift out of sync.
//
// Shape: a PURE CORE (layout, strings, the chip's breathing state machine) with
// a thin Pixi shell under it, so the whole contract is unit-testable without
// instantiating Pixi.

import { Container, Graphics, Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { hotbarLayout } from './hotbar.js';
// The Tier-3 freeze eases with the SAME first-order approach the storm
// vignette's Tier-2 hold uses — one behavior, one implementation (the hud's
// ring segment imports it for the same reason).
import { easeHold } from './zone.js';

const C = CLIENT_CONFIG.colors;
const V = CLIENT_CONFIG.vitals; // the shared RAIL IDIOM (track/fill/glow)
const X = CLIENT_CONFIG.xpRail;
const H = CLIENT_CONFIG.hotbar;
const MONO = CLIENT_CONFIG.type.mono;

/** Micro type for the tag / chip / cue — the lifted hud-micro register
 *  (amendment 15: 14px floor), phosphor-or-amber, never grey (amendment 16). */
const MICRO = CLIENT_CONFIG.type.registers.hudMicro.size;

const TAG_STYLE = { fontFamily: MONO, fontSize: MICRO, fill: C.phosphor, letterSpacing: 1.5 } as const;
const CHIP_STYLE = { fontFamily: MONO, fontSize: MICRO, fill: C.amber, letterSpacing: 0.5 } as const;
const CUE_STYLE = { fontFamily: MONO, fontSize: MICRO, fill: C.amber, letterSpacing: 2 } as const;

/** The own-ship economy fields the satellites render (all self-private, off
 *  `you`). `xp` is the server's 0..1 progress toward the next level. */
export interface XpView {
  lvl: number;
  xp: number;
  pts: number;
}

/** A screen-space box (px). */
export interface XpBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole satellite stack, as pure geometry (screen px). */
export interface XpRailLayout {
  /** The 3px rail column — INSIDE the reserved gutter, climbing the hotbar
   *  stack's full height (the HP-rail-abuts-the-cluster idiom). */
  rail: XpBox;
  /** LV tag anchor: left edge + vertical CENTER. */
  tag: { x: number; y: number };
  /** Banked-level chip square (top-left corner + size). */
  chip: { x: number; y: number; size: number };
  /** Cue line anchor: left edge + vertical CENTER (level with the chip). */
  cue: { x: number; y: number };
}

/**
 * Pure: the satellites laid out from the viewport height, off the SAME
 * hotbarLayout the slot rows use — so the rail can never drift from the stack
 * it belongs to. The rail sits inside the reserved gutter; the tag, chip and
 * cue stack ABOVE the stack's top edge, clear of every row footprint.
 */
export function xpRailLayout(screenH: number): XpRailLayout {
  const hb = hotbarLayout(screenH);
  const left = hb.gutterX;
  const railX = left + Math.round((H.gutter - X.railWidth) / 2);
  const tagY = hb.stackTop - X.tagGap;
  return {
    rail: { x: railX, y: hb.stackTop, w: X.railWidth, h: hb.stackHeight },
    tag: { x: left, y: tagY },
    chip: { x: left, y: tagY - X.chipGap - X.chip / 2, size: X.chip },
    cue: { x: left + X.chip + X.cueGap, y: tagY - X.chipGap },
  };
}

/** Pure: the rail's fill fraction — the server's `xp`, clamped defensively. */
export function xpFillFraction(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return xp > 1 ? 1 : xp;
}

/** Pure: the LV tag's text. Levels are integers; a defensive floor keeps a
 *  malformed frame from rendering `LV 3.0000001`. */
export function levelTag(lvl: number): string {
  const n = Number.isFinite(lvl) ? Math.max(0, Math.floor(lvl)) : 0;
  return `LV ${n}`;
}

/** THE label budget: how many glyphs fit the fixed chip square at the micro
 *  register. `size / (fontPx * 0.6 + letterSpacing)` — 22 / (14×0.6 + 0.5) = 2. */
export const CHIP_LABEL_MAX_GLYPHS = Math.floor(X.chip / (MICRO * 0.605 + CHIP_STYLE.letterSpacing));

/** Pure: the banked-level chip's label ('' hides the chip at zero). The ▲ glyph
 *  is the SHAPE channel beside the count — never color alone. The count is
 *  CLAMPED: the chip is a fixed square holding exactly CHIP_LABEL_MAX_GLYPHS
 *  glyphs, so past 9 the label becomes the bare overflow mark `▲+`. Beyond 9 the
 *  exact number is not the information — "more than you can spend in one
 *  sitting" is, and the cue line says the rest.
 *
 *  AMENDMENT 47 (the container-fit law): the old `▲9+` was THREE glyphs (26.7px)
 *  in the 22px square — the chip's own doc-comment already forbade a label wider
 *  than its box, and this is the case it missed. Widening the square was
 *  rejected: 22 is the ONE mono chip family (hotbar key chips, helm glyphs, the
 *  refit digit chips), and the family outranks the plus sign. */
export function chipLabel(pts: number): string {
  if (pts <= 0) return '';
  return pts > 9 ? '▲+' : `▲${pts}`;
}

/** Pure: the cue line beside the chip ('' when nothing is banked). Draft copy
 *  under the standing rule (amendment 13); the vocabulary — LEVEL UP, REFIT,
 *  TAB — is amendment 33's. */
export function cueLine(pts: number): string {
  return pts > 0 ? 'LEVEL UP — TAB TO REFIT' : '';
}

/**
 * The chip's breathing RATE (Hz): one 2.4s cycle, hard-clamped by the SHARED
 * photosensitivity ceiling (settings.pulseCapHz) exactly like the HP rail. The
 * clamp is not decoration — it is the one place a future shorter cycle could
 * otherwise sneak past the accessibility floor.
 */
export const CHIP_PULSE_HZ = Math.min(1 / X.breathSec, CLIENT_CONFIG.settings.pulseCapHz);

/**
 * The chip's breathing state: the bank count it last saw and the clock (s) its
 * current breathing window was armed at (null = not armed / hidden).
 */
export interface XpChipState {
  pts: number;
  armedAt: number | null;
}

export const XP_CHIP_IDLE: XpChipState = { pts: 0, armedAt: null };

/**
 * Pure: advance the chip's state for this frame.
 *
 *   • nothing banked        → hidden, and any armed window is dropped (spending
 *                             to zero must not leave a window that would make
 *                             the NEXT bank inherit a half-elapsed breath);
 *   • a NEW bank            → (re)arm at `nowSec` — the moment is the pulse;
 *   • `rearm` (TAB refit)   → re-arm too (amendment 1's binding: opening the
 *                             refit window is a touch of the economy);
 *   • an unarmed positive   → arm (a reconnect that arrives already banked
 *                             still gets its breath, not a dead chip);
 *   • otherwise             → carry, so the window elapses on its own clock.
 */
export function nextChipState(prev: XpChipState, pts: number, nowSec: number, rearm = false): XpChipState {
  if (pts <= 0) return XP_CHIP_IDLE;
  if (pts > prev.pts || rearm || prev.armedAt === null) return { pts, armedAt: nowSec };
  return { pts, armedAt: prev.armedAt };
}

/** Pure: is the chip still inside its breathing window? (After ~10s unspent it
 *  decays to a STATIC chip — the information stays, the motion stops.) */
export function chipBreathing(state: XpChipState, nowSec: number): boolean {
  if (state.pts <= 0 || state.armedAt === null) return false;
  return nowSec - state.armedAt < X.unspentSec;
}

/**
 * Pure: the chip's alpha this frame. `amp` is the MOTION-SCALED amplitude —
 * halved at `reduced`, zero at `off`, where the chip simply holds its base
 * alpha. The base is INFORMATION (a banked level is legible at every motion
 * level); only the breathing is motion. The phase runs from the arm instant, so
 * every window starts at sin(0) = the base alpha and eases out of it.
 */
export function chipAlpha(state: XpChipState, nowSec: number, amp: number = X.pulseAmp): number {
  if (!chipBreathing(state, nowSec)) return X.chipAlpha;
  const phase = (nowSec - state.armedAt!) * CHIP_PULSE_HZ * Math.PI * 2;
  return X.chipAlpha + amp * Math.sin(phase);
}

/**
 * Pure: the chip's DIM keyframe — the low extreme of its breath, which is where
 * Tier 3 freezes (render/attention.ts's `freezeAtDimKeyframe`). DIM, not off:
 * the chip, its count and its cue line are INFORMATION and stay fully present;
 * what stops is the motion.
 *
 * A chip that has already decayed to static (past `unspentSec`) has no breath
 * left to freeze, so its dim keyframe IS its steady alpha and the freeze is a
 * literal no-op — the ratified 10s decay is untouched by the tier rule, not
 * replaced by it.
 */
export function chipDimKeyframe(state: XpChipState, nowSec: number, amp: number = X.pulseAmp): number {
  return chipBreathing(state, nowSec) ? X.chipAlpha - amp : X.chipAlpha;
}

/** Clamp to [0,1] (a blend factor, or a caller's degenerate input). */
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Pure: the chip's alpha actually drawn — its breathing value and its dim
 * keyframe mixed by an EASED `freeze` blend (0 = breathing, 1 = fully frozen).
 *
 * TIER 3 (Story 4.8, amendment 243). The economy tier freezes under ANY higher
 * tier — Tier 2 alone included, so sailing into the storm on a healthy hull
 * settles the chip. The blend is eased by the caller with the vignette's own
 * `easeHold` rather than switched, for the reason the whole story exists: a hard
 * stop at a keyframe is itself a luminance step.
 *
 * At motion=off (amp 0) both endpoints are `X.chipAlpha`, so the freeze is a
 * literal no-op — it can never introduce, or remove, motion that was not there.
 */
export function chipHeld(state: XpChipState, nowSec: number, amp: number, freeze: number): number {
  const breathing = chipAlpha(state, nowSec, amp);
  const dim = chipDimKeyframe(state, nowSec, amp);
  return breathing + (dim - breathing) * clamp01(freeze);
}

/**
 * The Pixi shell. Lives in the HUD layer (so it scales with the accessibility
 * UI scale like every other HUD surface) and is hidden outright whenever there
 * is no own ship to describe — death, spectate, results.
 */
export class XpRail {
  private readonly root = new Container();
  private readonly railTrack = new Graphics();
  private readonly railFill = new Graphics();
  private readonly chipBox = new Graphics();
  private readonly tagText: Text;
  private readonly chipText: Text;
  private readonly cueText: Text;
  private chip: XpChipState = XP_CHIP_IDLE;
  /** One-shot re-arm signal (TAB opened the refit window), consumed next frame. */
  private rearmPending = false;
  /** The EASED Tier-3 freeze blend (0 = breathing → 1 = held at the dim
   *  keyframe) and the monotonic clock it was last advanced on (-1 = never; the
   *  first frame eases by nothing). Monotonic, not the server estimate: a clock
   *  resync must not stretch or rewind an ease, which is the zone vignette's
   *  ruling for exactly this blend. */
  private freezeBlend = 0;
  private lastFreezeMs = -1;
  private lastFillSig = '';
  private lastTag = '';
  private lastChip = '';
  private lastCue = '';
  private lastChipBox = '';

  constructor(hudLayer: Container) {
    this.tagText = new Text({ text: '', style: TAG_STYLE });
    this.tagText.anchor.set(0, 0.5);
    this.chipText = new Text({ text: '', style: CHIP_STYLE });
    this.chipText.anchor.set(0.5);
    this.cueText = new Text({ text: '', style: CUE_STYLE });
    this.cueText.anchor.set(0, 0.5);
    // The fill's BASE alpha is the shared rail idiom's (vitals.railFillAlpha) —
    // the XP rail does not breathe (only the chip does), so it is set once.
    this.railFill.alpha = V.railFillAlpha;
    this.root.addChild(this.railTrack, this.railFill, this.chipBox, this.tagText, this.chipText, this.cueText);
    this.root.visible = false;
    hudLayer.addChild(this.root);
  }

  /** The refit window opened (TAB): re-arm the chip's breath (amendment 1). */
  rearm(): void {
    this.rearmPending = true;
  }

  /** Hidden whenever `you` is absent — spectating, dead, between lives. The
   *  chip state is dropped with it, so the next life starts cold. */
  hide(): void {
    this.root.visible = false;
    this.chip = XP_CHIP_IDLE;
    this.rearmPending = false;
    // The freeze blend dies with the chip state: a chip that comes back on the
    // next life must start from its own breath, not from a tier hold that was
    // easing when the hull went down. (hideTransient deliberately keeps BOTH —
    // the pose gap is a frame the player never saw.)
    this.freezeBlend = 0;
    this.lastFreezeMs = -1;
  }

  /**
   * Hidden for a TRANSIENT frame gap (the forceSnap/pose gap behind a respawn
   * or the P netcode toggle) — visibility off, chip state KEPT. The reset in
   * hide() is a fourth re-arm trigger by accident: dropping the state makes the
   * very next frame look like a NEW bank to nextChipState, so a chip that had
   * already decayed to static starts breathing again for a fresh window over a
   * gap the player never saw. The three ratified re-arm triggers (a new bank, a
   * TAB refit, an unarmed positive) stay the only ones.
   */
  hideTransient(): void {
    this.root.visible = false;
  }

  /**
   * Render one frame. `nowSec` is the server-clock estimate in SECONDS — the
   * same clock the HP rail's breathing and the storm vignette ride.
   */
  update(
    view: XpView,
    screenH: number,
    nowSec: number,
    /** A higher attention tier is active (attention.ts `freezeAtDimKeyframe`):
     *  the bank chip eases to its DIM keyframe and holds there. */
    freeze = false,
    /** MONOTONIC ms for the freeze ease. Defaults to the server clock so a
     *  caller from before Story 4.8 behaves exactly as it did. */
    nowMs: number = nowSec * 1000,
  ): void {
    this.root.visible = true;
    const L = xpRailLayout(screenH);
    this.chip = nextChipState(this.chip, view.pts, nowSec, this.rearmPending);
    this.rearmPending = false;
    this.advanceFreeze(freeze, nowMs);
    this.drawRail(L, xpFillFraction(view.xp));
    this.updateTag(L, view.lvl);
    this.updateChip(L, view.pts, nowSec);
  }

  /** Ease the Tier-3 freeze blend one frame toward its target (the storm
   *  vignette's `easeHold`, at its own 240ms τ — amendment 37's rule that an
   *  existing floor is reused rather than given a sibling). */
  private advanceFreeze(freeze: boolean, nowMs: number): void {
    const dtMs = this.lastFreezeMs < 0 ? 0 : nowMs - this.lastFreezeMs;
    this.lastFreezeMs = nowMs;
    this.freezeBlend = easeHold(this.freezeBlend, freeze ? 1 : 0, dtMs);
  }

  /** Dim phosphor track + bottom-up fill with the shared soft bloom (the HP
   *  rail's drawRail, at 3px). Redraws only when the geometry actually moves. */
  private drawRail(L: XpRailLayout, frac: number): void {
    const sig = `${L.rail.x}|${L.rail.y}|${L.rail.h}|${frac.toFixed(3)}`;
    if (sig === this.lastFillSig) return;
    this.lastFillSig = sig;
    this.railTrack.clear();
    this.railTrack.rect(L.rail.x, L.rail.y, L.rail.w, L.rail.h).fill({ color: C.phosphor, alpha: V.railTrackAlpha });
    this.railFill.clear();
    const fh = L.rail.h * frac;
    if (fh <= 0) return; // an empty rail shows the track, not a zero-height fill
    const y = L.rail.y + L.rail.h - fh;
    const glow = V.railGlowPx;
    this.railFill
      .rect(L.rail.x - glow, y - glow, L.rail.w + glow * 2, fh + glow * 2)
      .fill({ color: C.phosphor, alpha: V.railGlowAlpha });
    this.railFill.rect(L.rail.x, y, L.rail.w, fh).fill({ color: C.phosphor, alpha: 1 });
  }

  private updateTag(L: XpRailLayout, lvl: number): void {
    const tag = levelTag(lvl);
    if (tag !== this.lastTag) {
      this.tagText.text = tag;
      this.lastTag = tag;
    }
    this.tagText.position.set(L.tag.x, L.tag.y);
  }

  /** The banked-level chip + its cue line: hidden at zero, breathing for the
   *  first ~10s of an unspent level, static after that. */
  private updateChip(L: XpRailLayout, pts: number, nowSec: number): void {
    const label = chipLabel(pts);
    const cue = cueLine(pts);
    if (label !== this.lastChip) {
      this.chipText.text = label;
      this.lastChip = label;
    }
    if (cue !== this.lastCue) {
      this.cueText.text = cue;
      this.lastCue = cue;
    }
    const shown = label !== '';
    this.chipText.visible = shown;
    this.cueText.visible = shown;
    this.chipBox.visible = shown;
    if (!shown) {
      this.chipBox.clear();
      this.lastChipBox = ''; // the next bank redraws the box even at an unchanged layout
      return;
    }
    this.chipText.position.set(L.chip.x + L.chip.size / 2, L.chip.y + L.chip.size / 2);
    this.cueText.position.set(L.cue.x, L.cue.y);
    this.drawChipBox(L);
    const alpha = chipHeld(this.chip, nowSec, motionScaled(X.pulseAmp, settings.current.motion), this.freezeBlend);
    this.chipBox.alpha = alpha;
    this.chipText.alpha = alpha;
    this.cueText.alpha = alpha;
  }

  /** 1px amber chip outline over a faint inset wash — the same "an action is
   *  available" grammar the hotbar's SELECTED chip uses. */
  private drawChipBox(L: XpRailLayout): void {
    const sig = `${L.chip.x}|${L.chip.y}|${L.chip.size}`;
    if (sig === this.lastChipBox) return; // pure geometry — only a re-layout moves it
    this.lastChipBox = sig;
    this.chipBox.clear();
    this.chipBox.rect(L.chip.x, L.chip.y, L.chip.size, L.chip.size).fill({ color: C.amber, alpha: 0.12 });
    this.chipBox.rect(L.chip.x, L.chip.y, L.chip.size, L.chip.size).stroke({ width: 1, color: C.amber, alpha: 1 });
  }

  /** Test/debug seams: the live chip alpha and its breathing state. */
  get chipFillAlpha(): number {
    return this.chipBox.alpha;
  }

  get chipState(): XpChipState {
    return this.chip;
  }

  get visible(): boolean {
    return this.root.visible;
  }
}
