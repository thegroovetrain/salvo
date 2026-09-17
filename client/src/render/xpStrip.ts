// THE XP STRIP (Story 8.6, orchestrator ruling 8) — the full-width row under
// the HUD bar's main row, and the direct successor to the bottom-left XP RAIL
// (render/xpRail.ts, Story 2.6, deleted with this story).
//
//   LV 3  ├────────────────────────────────────┤  [1]  TAB TO REFIT
//   ^ tag            ^ the 4px track, left→right   ^ bank chip  ^ the cue
//
// WHAT CHANGED AND WHAT DID NOT. The rail was a 3px VERTICAL column filling
// bottom-up inside the hotbar's reserved gutter, with the tag / chip / cue
// stacked above it. The strip is the same information laid out HORIZONTALLY
// along the bar it now belongs to — so everything that was geometry moved
// (`xpRailLayout` is gone; the bar's pure spine `hudBarLayout().strip` supplies
// the row), and everything that was BEHAVIOUR came over untouched: the fill is
// still the server's `xp` read verbatim, the chip still runs the arm →
// decay-to-static → re-arm state machine on the same 2.4s breath under the same
// photosensitivity cap, and Tier 3 still freezes it at its dim keyframe.
//
// THE ONE COPY CHANGE (ruling 8): the cue reads `TAB TO REFIT`, not
// `LEVEL UP — TAB TO REFIT`. The strip sits an inch under the bank chip and the
// level tag — the "LEVEL UP" half was the rail's way of saying what the chip
// already says, and at 9px on a 768px bar it was the half that could not fit.
// The TOAST twin (ui/upgradeToast.ts) keeps the full line: it fires once, away
// from the strip, with no chip beside it. `refitable` still withholds the whole
// instruction when TAB would open nothing (epic-2 amendment 73).
//
// RENDER-ONLY, by construction: nothing here routes a click. The strip's row is
// below the slot squares, outside every footprint `slotAtPoint` knows about, so
// a press over it falls through and fires exactly as it did before.
//
// Server-authoritative: `lvl` / `xp` / `pts` are rendered VERBATIM off `you`.
// There is no client-side XP accrual, prediction or interpolation to drift.
//
// Shape: a PURE CORE (copy, fractions, the chip's breathing state machine) with
// a thin Pixi shell under it, so the whole contract is unit-testable without
// instantiating Pixi.

import { Container, Graphics, Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { monoCharWidth, monoTextWidth } from '../ui/refitCardFit.js';
import { microScale, type Rect, type StripLayout } from './hudBar.js';
// The Tier-3 freeze eases with the SAME first-order approach the storm
// vignette's Tier-2 hold uses — one behavior, one implementation.
import { easeHold } from './zone.js';

const C = CLIENT_CONFIG.colors;
const B = CLIENT_CONFIG.hudBar;
/** The chip's BREATH — rate, decay window, base alpha, amplitude. Unchanged
 *  from the rail (the motion is ratified; only the geometry moved), so the
 *  values still live in the `xpRail` config block. */
const X = CLIENT_CONFIG.xpRail;
const MONO = CLIENT_CONFIG.type.mono;

/**
 * Tracking (em) on the strip's two lettered registers — the mock's `.B-xp .lv`
 * and `.cue` both declare `letter-spacing: .14em`.
 */
const TRACKING_EM = 0.14;
const LV_TRACKING = B.type.lv * TRACKING_EM;
const CUE_TRACKING = B.type.cue * TRACKING_EM;

/**
 * The strip's alphas, read literally off the mock's `.hbar.xp`, `.B-bank .bank`
 * and `.cue` rules (epic-8 amendment 31: the bar is the mock's numbers). They
 * are alphas ON EXISTING TOKENS — no colour is minted here (ruling 11).
 *
 * `fillGlow` is the mock's `box-shadow: 0 0 6px` on the progress fill, rebuilt
 * as a 1px outline at the shadow's own alpha: no Pixi filter may run on the HUD
 * layer, and a hairline at the glow's alpha carries the same "this edge is lit"
 * read at 4px tall.
 */
const A = {
  trackFill: 0.06,
  trackBorder: 0.25,
  fillGlow: 0.45,
  chipBorder: 0.65,
  chipBed: 0.6,
} as const;

const LV_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.lv,
  fontWeight: '600',
  fill: C.phosphor,
  letterSpacing: LV_TRACKING,
} as const;

/** The bank chip's count — same 11px/600 mono as the tag, no tracking (the
 *  mock's `.bank` declares none; a centred one- or two-glyph label wants none). */
const COUNT_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.lv,
  fontWeight: '600',
  fill: C.phosphor,
  letterSpacing: 0,
} as const;

/** The cue: the mock wraps the words in a `<span>`, which takes the SECONDARY
 *  text token — the instruction is quieter than the chip it follows. */
const CUE_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.cue,
  fill: C.textSecondary,
  letterSpacing: CUE_TRACKING,
} as const;

/** The own-ship economy fields the strip renders (all self-private, off `you`).
 *  `xp` is the server's 0..1 progress toward the next level. */
export interface XpView {
  lvl: number;
  xp: number;
  pts: number;
  /**
   * Whether the banked level can ACTUALLY be refitted right now — i.e. a front
   * offer is materialized (`you.offer.length > 0`), the same predicate
   * `offerView` uses to decide the band may open, AND the hull is not inside its
   * sinking window (the refit is inert from sink-entry, and the SERVER does not
   * clear `you.offer` there — the offer is still on the wire all the way down).
   * Since the lazy-draw bugfix a level always banks, so `pts > 0` with an EMPTY
   * offer is a legitimate state (a degenerate exhausted deck), and the cue must
   * not promise a TAB that opens nothing. The CHIP still shows the bank — the
   * level is genuinely earned — but the instruction is withheld until it is
   * actionable.
   */
  refitable: boolean;
}

/** The own-ship economy fields the view is derived FROM, exactly as the wire
 *  delivers them on `you` (shared `OwnShip`). */
export interface XpOwn {
  lvl: number;
  xp: number;
  pts: number;
  /** The FRONT offer's card line ids — empty when nothing was drawn. */
  offer: readonly string[];
}

/**
 * Pure: the strip's whole frame, off the server's own-ship fields VERBATIM —
 * `lvl`/`xp`/`pts` are self-private and authoritative, and nothing here predicts
 * or interpolates them. A missing `you` (the pre-first-frame gap) reads as an
 * empty economy rather than hiding a member of the bar.
 */
export function xpStripView(you: XpOwn | null, sinking: boolean): XpView {
  if (!you) return { lvl: 0, xp: 0, pts: 0, refitable: false };
  return { lvl: you.lvl, xp: you.xp, pts: you.pts, refitable: you.offer.length > 0 && !sinking };
}

/** Pure: the track's fill fraction — the server's `xp`, clamped defensively. */
export function xpFillFraction(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return xp > 1 ? 1 : xp;
}

/** Pure: the LV tag's text. Levels are integers; a defensive floor keeps a
 *  malformed frame from rendering `LV 3.0000001`. `LV 0` is a real state — the
 *  held start line renders it (I/O matrix) rather than an empty head. */
export function levelTag(lvl: number): string {
  const n = Number.isFinite(lvl) ? Math.max(0, Math.floor(lvl)) : 0;
  return `LV ${n}`;
}

/** THE label budget: how many glyphs fit the bank chip at the count's register
 *  — the 24px square over the 11px/600 mono advance. */
export const CHIP_LABEL_MAX_GLYPHS = Math.floor(B.bankChip / monoCharWidth(B.type.lv, COUNT_STYLE.letterSpacing));

/** Pure: the banked-level chip's label ('' hides the chip at zero).
 *
 *  THE BARE COUNT — `1`, `2` — with no ▲ glyph (orchestrator ruling on Story
 *  8.6 wave 2c: the mock is the register of record, amendment 31, and it draws a
 *  bare digit inside the 24px chip). The rail's glyph was its SHAPE channel
 *  against colour; on the bar the CHIP ITSELF is that channel — a lit 24px box
 *  that only exists while something is banked — and the digit inside it is the
 *  count, not a decoration hanging off one.
 *
 *  The count is still CLAMPED: past 9 the label becomes the bare overflow mark
 *  `+`. Beyond 9 the exact number is not the information — "more than you can
 *  spend in one sitting" is, and the cue says the rest. The clamp survives the
 *  glyph because the INFORMATION argument is what carried it (amendment 47's
 *  container-fit arithmetic no longer binds: two digits would fit the 24px box
 *  at the 11px count, which holds CHIP_LABEL_MAX_GLYPHS). */
export function chipLabel(pts: number): string {
  if (pts <= 0) return '';
  return pts > 9 ? '+' : `${pts}`;
}

/**
 * Pure: the cue at the strip's tail ('' when nothing is banked, OR when the
 * bank cannot be acted on — see XpView.refitable; an instruction to press TAB
 * must never outlive TAB's ability to open the band).
 *
 * `TAB TO REFIT` — ruling 8 drops the rail's `LEVEL UP — ` prefix here and here
 * only: the chip beside it already reports the bank, and the tag at the other
 * end of the same row already reports the level. The toast twin
 * (ui/upgradeToast.ts) keeps the full line. The vocabulary — REFIT, TAB — is
 * epic-2 amendment 33's and is untouched.
 */
export function cueLine(pts: number, refitable: boolean): string {
  return pts > 0 && refitable ? 'TAB TO REFIT' : '';
}

/**
 * The chip's breathing RATE (Hz): one 2.4s cycle, hard-clamped by the SHARED
 * photosensitivity ceiling (settings.pulseCapHz) exactly like the HP globe. The
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
 * the chip, its count and its cue are INFORMATION and stay fully present; what
 * stops is the motion.
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

/** Set a Text only when the string actually changed (a Pixi text assignment
 *  re-measures and re-uploads the glyph run). */
function setText(t: Text, s: string): void {
  if (t.text !== s) t.text = s;
}

/**
 * The Pixi shell. Lives in the HUD bar's container (so it scales with the
 * accessibility UI scale like every other HUD surface) and is hidden outright
 * whenever there is no own ship to describe — the founder reveal, spectate,
 * results. It stays up through the SINKING window with the rest of the bar: the
 * cue is already gated on `refitable`, so no promise is made there.
 */
export class XpStrip {
  private readonly root = new Container();
  private readonly trackG = new Graphics();
  private readonly fillG = new Graphics();
  private readonly chipBox = new Graphics();
  private readonly lvText: Text;
  private readonly countText: Text;
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
  private lastTrackSig = '';
  private lastChipSig = '';
  /** The bands actually drawn this frame — test/debug seams (below). */
  private trackBand: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private chipBand: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(parent: Container) {
    this.lvText = new Text({ text: '', style: LV_STYLE });
    this.lvText.anchor.set(0, 0.5);
    this.countText = new Text({ text: '', style: COUNT_STYLE });
    this.countText.anchor.set(0.5);
    this.cueText = new Text({ text: '', style: CUE_STYLE });
    // RIGHT-flush: the tail group ends at the bar's right edge (the mock's flex
    // row), and the cue's counter-scale at 90% must not walk that edge — an
    // anchor on the right makes the scale pivot the edge itself.
    this.cueText.anchor.set(1, 0.5);
    this.root.addChild(this.trackG, this.fillG, this.chipBox, this.lvText, this.countText, this.cueText);
    this.root.visible = false;
    parent.addChild(this.root);
  }

  /** The refit window opened (TAB): re-arm the chip's breath (amendment 1). */
  rearm(): void {
    this.rearmPending = true;
  }

  /** Hidden whenever `you` is absent — the reveal, spectate, between lives. The
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
   * same clock the HP globe's breathing and the storm vignette ride; `nowMs` is
   * the frame's MONOTONIC clock, for the freeze ease only.
   */
  update(
    view: XpView,
    strip: StripLayout,
    nowSec: number,
    /** A higher attention tier is active (attention.ts `freezeAtDimKeyframe`):
     *  the bank chip eases to its DIM keyframe and holds there. */
    freeze = false,
    nowMs: number = nowSec * 1000,
    /** The accessibility UI scale, for the 9px cue's counter-scale (ruling 2). */
    uiScale = 1,
  ): void {
    this.root.visible = true;
    this.chip = nextChipState(this.chip, view.pts, nowSec, this.rearmPending);
    this.rearmPending = false;
    this.advanceFreeze(freeze, nowMs);
    const lvRight = this.updateTag(strip, view.lvl);
    const tailLeft = this.updateTail(strip, view, nowSec, uiScale);
    this.drawTrack(strip, lvRight, tailLeft, xpFillFraction(view.xp));
  }

  /** Ease the Tier-3 freeze blend one frame toward its target (the storm
   *  vignette's `easeHold`, at its own 240ms τ — amendment 37's rule that an
   *  existing floor is reused rather than given a sibling). */
  private advanceFreeze(freeze: boolean, nowMs: number): void {
    const dtMs = this.lastFreezeMs < 0 ? 0 : nowMs - this.lastFreezeMs;
    this.lastFreezeMs = nowMs;
    this.freezeBlend = easeHold(this.freezeBlend, freeze ? 1 : 0, dtMs);
  }

  /** `LV n` at the strip's head, vertically centred on the row. Returns its
   *  RIGHT edge — the track starts a `stripItemGap` past it, which is the one
   *  place the strip's geometry depends on a measurement rather than the pure
   *  spine (the tag grows a glyph at LV 10). */
  private updateTag(strip: StripLayout, lvl: number): number {
    const tag = levelTag(lvl);
    setText(this.lvText, tag);
    this.lvText.position.set(strip.lvX, strip.rowY);
    return strip.lvX + monoTextWidth(tag, B.type.lv, LV_TRACKING);
  }

  /**
   * The tail group — the bank chip and, when a refit can actually be taken, the
   * cue after it. Right-flushed to the bar's edge: the cue holds `strip.cueX`
   * and the chip shifts LEFT by the cue's width + `cueGap`, so the group grows
   * inward and the bar's right edge never moves.
   *
   * Returns the group's left edge (the track stops short of it), or null when
   * nothing is banked and the track runs the full width.
   */
  private updateTail(strip: StripLayout, view: XpView, nowSec: number, uiScale: number): number | null {
    const label = chipLabel(view.pts);
    const cue = cueLine(view.pts, view.refitable);
    setText(this.countText, label);
    setText(this.cueText, cue);
    const shown = label !== '';
    this.chipBox.visible = shown;
    this.countText.visible = shown;
    this.cueText.visible = shown && cue !== '';
    if (!shown) {
      this.chipBox.clear();
      this.lastChipSig = ''; // the next bank redraws the box even at an unchanged layout
      return null;
    }
    const scale = microScale(uiScale);
    this.cueText.scale.set(scale);
    this.cueText.position.set(strip.cueX, strip.rowY);
    const shift = cue === '' ? 0 : monoTextWidth(cue, B.type.cue, CUE_TRACKING) * scale + B.cueGap;
    const x = strip.chip.x - shift;
    this.drawChipBox(x, strip.chip);
    this.countText.position.set(x + strip.chip.w / 2, strip.chip.y + strip.chip.h / 2);
    this.paintChipAlpha(nowSec);
    return x;
  }

  /** The chip's breathing alpha, applied to its box, its count and its cue. */
  private paintChipAlpha(nowSec: number): void {
    const amp = motionScaled(X.pulseAmp, settings.current.motion);
    const alpha = chipHeld(this.chip, nowSec, amp, this.freezeBlend);
    this.chipBox.alpha = alpha;
    this.countText.alpha = alpha;
    this.cueText.alpha = alpha;
  }

  /** 1px phosphor chip outline over a dark bed — the bar's own chip grammar
   *  (the mock's `.bank`), which the slot key chips share. */
  private drawChipBox(x: number, box: Rect): void {
    this.chipBand = { x, y: box.y, w: box.w, h: box.h };
    const sig = `${x}|${box.y}|${box.w}|${box.h}`;
    if (sig === this.lastChipSig) return; // pure geometry — only a re-layout moves it
    this.lastChipSig = sig;
    this.chipBox.clear();
    this.chipBox.rect(x, box.y, box.w, box.h).fill({ color: C.cardScrim, alpha: A.chipBed });
    this.chipBox.rect(x, box.y, box.w, box.h).stroke({ width: B.lineW, color: C.phosphor, alpha: A.chipBorder });
  }

  /**
   * The 4px track and its left→right progress fill, narrowed to the room left
   * between the tag and the tail group. The fill's "6px glow" is a second
   * hairline at the mock's shadow alpha — no Pixi filter runs on the HUD layer.
   */
  private drawTrack(strip: StripLayout, lvRight: number, tailLeft: number | null, frac: number): void {
    const x = lvRight + B.stripItemGap;
    const right = tailLeft === null ? strip.track.x + strip.track.w : tailLeft - B.stripItemGap;
    const w = Math.max(0, right - x);
    const { y, h } = strip.track;
    this.trackBand = { x, y, w, h };
    const sig = `${x}|${y}|${w}|${frac.toFixed(4)}`;
    if (sig === this.lastTrackSig) return;
    this.lastTrackSig = sig;
    this.trackG.clear();
    this.fillG.clear();
    if (w <= 0) return; // a degenerate viewport: the tail wins, the track yields
    this.trackG.rect(x, y, w, h).fill({ color: C.phosphor, alpha: A.trackFill });
    this.trackG.rect(x, y, w, h).stroke({ width: B.lineW, color: C.phosphor, alpha: A.trackBorder });
    const fw = w * frac;
    if (fw <= 0) return; // an empty level shows the track, not a zero-width fill
    this.fillG.rect(x, y, fw, h).fill({ color: C.phosphor, alpha: 1 });
    this.fillG.rect(x, y, fw, h).stroke({ width: B.lineW, color: C.phosphor, alpha: A.fillGlow });
  }

  /** Test/debug seams: the live chip alpha, its breathing state, and the two
   *  bands whose geometry is measured rather than laid out by the pure spine. */
  get chipFillAlpha(): number {
    return this.chipBox.alpha;
  }

  get chipState(): XpChipState {
    return this.chip;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** The track band actually drawn (narrowed by the tag and the tail). */
  get trackRect(): Rect {
    return this.trackBand;
  }

  /** The bank chip's box as drawn (shifted left by the cue when it renders). */
  get chipRect(): Rect {
    return this.chipBand;
  }

  get chipVisible(): boolean {
    return this.chipBox.visible;
  }

  get cueVisible(): boolean {
    return this.cueText.visible;
  }

  /** The cue's counter-scale this frame (1 at 100%, 1/uiScale below it). */
  get cueScale(): number {
    return this.cueText.scale.x;
  }
}
