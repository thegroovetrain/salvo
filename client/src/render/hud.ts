// Own-vitals HUD — screen-space instrument readout (hudRoot). Story 2.4 restyles
// the bottom-right cluster into the Eric-confirmed v2-composite anatomy
// (mockups/hud-composite-2.html, as amended 24–27):
//
//   HULL n/n                              ← mono header, dim-phosphor caption
//   ┌ helm block ───────────────┐ ┃       ← ┃ = the vertical HP rail on the
//   │ HDG 025    AHEAD  [W]     │ ┃         body's RIGHT edge (6px, dim
//   │ 14.2 KTS   ═ FULL         │ ┃         phosphor track, bottom-up fill,
//   │ RUDDER     ▭ ¾   ← hollow │ ┃         phosphor/amber/damageMarker bands,
//   │ [A]──┼──[D]  ▶ ½  ← solid │ ┃         breathing below 50%)
//   │            ASTERN [S]     │ ┃
//   └───────────────────────────┘ ┃
//
// Register: AFTERIMAGE — floating linework only. The old HP bar's filled `panel`
// backing is gone with the bar itself; nothing in the cluster sits on a filled
// rectangle, and every corner is 0-radius. Ordered-vs-actual on the telegraph is
// SHAPE-coded (hollow phosphor rung outline vs solid amber needle), never color
// alone. Micro labels are DIM PHOSPHOR (amendment 25) — grey text is gone.
//
// Text strings are diffed before assignment (Pixi re-rasterizes on `.text`), the
// telegraph Graphics redraws only on a state change, and the HP pulse rides an
// ALPHA on its own Graphics so the breathing never forces a redraw.

import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import type { EffectiveStats, ShipState, EquipmentId, ShipClassId, WeaponAmmo } from '@salvo/shared';
import { boostedKinematics, wrapPositive } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionAllowed, motionScaled, settings } from '../settings/store.js';
import { KEY_CHIP_SIZE, KEY_CHIP_STYLE, drawKeyChipBox } from './keyChip.js';
import { glyphFadeAlpha, helmGlyphs, type HelmGlyphStore, type HelmPair } from './helmGlyphs.js';

/** Kinematics subset the speed ladder needs (ahead/astern denominators). */
interface LadderKin {
  maxSpeed: number;
  reverseSpeed: number;
}
import type { Axes } from '../input/keyboard.js';
import type { MatchUx } from '../ui/phase.js';

const C = CLIENT_CONFIG.colors;
const V = CLIENT_CONFIG.vitals;
const GREEN = C.phosphor;
const AMBER = C.amber;
const DIM = C.textMuted;
// Storm readout accent: the `storm` fill is below the graphic-contrast
// threshold, so text/readout uses `storm-readout` (brighter, not more saturated —
// DESIGN.md storm color note).
const STORM_PURPLE = C.stormReadout;
// Story 2.3 (amendment 17): load-bearing HUD TEXT is de-greyed to CIC phosphor —
// `DIM` survives only as decorative LINEWORK (ladder spine, rungs, rudder track).
// An un-selected ladder rung dims the phosphor via the Text's alpha instead of
// switching color, so the highlight grammar reads without any grey text.
const TEXT_DIM_ALPHA = 0.55;
// Geist Mono per DESIGN.md — the single mono stack (sizes carry the ratified
// ~1.6x legibility lift; nothing here renders below the 14px micro floor).
const MONO = CLIENT_CONFIG.type.mono;
const MARGIN = V.margin;

// --- cluster local frame -------------------------------------------------------
// EVERY offset below is root-local, with the origin at the cluster's TOP-LEFT
// corner (vitalsLayout resolves that corner in screen space). The UI-scale seam
// composes for free: the hud layer is scaled, and vitalsLayout receives the
// pre-divided LOGICAL viewport.
const HEADER_Y = 12; // header row's vertical center
const READ_RIGHT = 150; // right edge of the readout column (HDG/KTS/rudder)
const HDG_Y = 42; // HDG row center
const KTS_Y = 74; // KTS row center
const RUD_LABEL_Y = 106; // RUDDER micro label center
const RUD_Y = 124; // rudder track center
const RUD_X = READ_RIGHT - V.rudderTrack; // 40 — track's left end
const TG_X = 200; // telegraph rung bars start here
const RUNG_W = 28; // rung tick length
const RUNG_GAP = 20; // vertical px between the nine detents
const LADDER_TOP = 58; // y of the full-ahead rung (index 8)
const LADDER_BOTTOM = LADDER_TOP + 8 * RUNG_GAP; // full astern (index 0)
const LABEL_X = TG_X + RUNG_W + 8; // rung labels sit right of the ticks
const CAP_GAP = 12; // AHEAD/ASTERN captions' clearance from the end rungs
// W/S key chips sit in the channel between the readout column and the ladder,
// level with the two end rungs (clear of the needle, which starts at TG_X-15).
const CHIP_X = TG_X - 45;
const RAIL_TOP = V.headerH; // the rail climbs the BODY, not the header

const RUNG_STYLE = { fontFamily: MONO, fontSize: 18, fill: GREEN, letterSpacing: 0.5 } as const;
/** Micro captions — dim PHOSPHOR at `labelAlpha`, never grey (amendment 25). */
const MICRO_STYLE = { fontFamily: MONO, fontSize: 14, fill: GREEN, letterSpacing: 1.5 } as const;
const CAP_STYLE = { fontFamily: MONO, fontSize: 16, fill: GREEN, letterSpacing: 1.5 } as const;
/** HDG/KTS values — 22px tabular mono PHOSPHOR (amendment 24; the mock's white
 *  values are superseded). Geist Mono is monospaced, so figures are tabular. */
const DATA_STYLE = { fontFamily: MONO, fontSize: CLIENT_CONFIG.type.registers.hudReadout.size, fill: GREEN } as const;
const HEAD_STYLE = { fontFamily: MONO, fontSize: 18, fill: GREEN, letterSpacing: 1 } as const;

/** Compact rung labels, index 0 (full astern) → 8 (full ahead). */
export const DETENT_LABELS = ['FULL', '¾', '½', '¼', 'STOP', '¼', '½', '¾', 'FULL'] as const;

/** Pure: detent index [0,8] for a throttle order value in [-1,1] (0.25 steps, STOP=4). */
export function detentIndexOf(throttle: number): number {
  const i = Math.round(throttle * 4) + 4;
  return i < 0 ? 0 : i > 8 ? 8 : i;
}

/** Pure: the compact ladder label for a detent index (clamped). */
export function detentLabel(index: number): string {
  const i = index < 0 ? 0 : index > 8 ? 8 : index;
  return DETENT_LABELS[i];
}

/** Pure: screen y for a detent rung index (0 astern at the bottom, 8 ahead at the top). */
export function rungY(index: number): number {
  return LADDER_BOTTOM - index * RUNG_GAP;
}

/**
 * Pure: the x CENTER of the rudder position tick for a rudder axis in [-1,1],
 * clamped so the tick AND its halo stay inside the track. `inset` is half the
 * tick width plus the halo bleed: at full deflection the raw center sits exactly
 * on the track end, which would hang the glow (and half the tick) off it.
 */
export function rudderTickCenter(rudder: number, trackX: number, trackW: number, inset: number): number {
  const r = rudder < -1 ? -1 : rudder > 1 ? 1 : rudder;
  const raw = trackX + trackW / 2 + (r * trackW) / 2;
  const lo = trackX + inset;
  const hi = trackX + trackW - inset;
  return raw < lo ? lo : raw > hi ? hi : raw;
}

/** Half the rudder tick's painted footprint (core + halo) — the clamp inset. */
const RUD_TICK_INSET = V.rudderTickW / 2 + V.rudderTickHaloPx;

/** The lowest root-local y the cluster PAINTS: the ASTERN caption's line box
 *  under the ladder (its center + ~half a line at CAP_STYLE's size). `V.height`
 *  must contain this — the declared box is what the layout tests measure, so an
 *  under-measured height would prove a no-overlap property about a false edge.
 *  Pinned by hud.test.ts. */
export const CLUSTER_CONTENT_BOTTOM = LADDER_BOTTOM + CAP_GAP + 8 + CAP_STYLE.fontSize * 0.62;

/**
 * Pure: the ship's ACTUAL speed mapped onto the telegraph's [-1,1] axis for the
 * needle — ahead scales on maxSpeed, astern on reverseSpeed. The gap between
 * this needle and the ordered rung is the ship converging on the ordered speed
 * (the naval feel: the setting is instant, the hull is not).
 */
export function speedLadderFraction(speed: number, kin: LadderKin): number {
  const denom = speed >= 0 ? kin.maxSpeed : kin.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

const OVERLAY_STYLE = { fontFamily: MONO, fontSize: 38, fill: AMBER, letterSpacing: 2 } as const;

/** Own-ship status the HUD renders beyond raw kinematics. */
export interface OwnStatus {
  hp: number;
  // Slot-aligned pool count + reload timer (OwnShip.ammo): length SLOT_COUNT,
  // null for an empty slot (the extra slot 3 today).
  ammo: (WeaponAmmo | null)[];
  primedSlot: number; // primed loadout slot (0 = gun) — client-local, immediate
  alive: boolean;
  respawnInMs: number; // 0 when alive / unknown
  cls: ShipClassId; // own class — drives hull-length lookups (firing UX)
  /** Cached effectiveStats(cls, boons) — ALL HUD denominators (max hp, speed
   *  ladder, ammo pool sizes, reload durations, damage) read from here (Stage
   *  D; boons are the whole stat input as of Story 2.8). */
  stats: EffectiveStats;
  /** Slot-aligned equipment ids of the OWN loadout (loadoutFor(you.cls) —
   *  Story 1.6); null = an unfitted slot. Read by the firing UX and passed
   *  through to the HOTBAR (render/hotbar.ts owns the loadout surface as of
   *  Story 2.2). Ammo VALUES still come from the server via `ammo`. */
  loadout: readonly (EquipmentId | null)[];
  /** The own speed boost is currently active (serverNow < boostUntil estimate):
   *  drives the boosted speed-needle cap on the telegraph ladder. */
  boostActive: boolean;
}

/**
 * Pure: the HP header's value text — `72/100`, with `HULL` as its own caption.
 *
 * The displayed hp is FLOORED, then floored again at 1 while any hull remains:
 *   • floor, not round, so the number never disagrees with the rail's band —
 *     49.6 hp reads `49` beside an amber rail rather than a phosphor-looking
 *     `50` (the band uses the exact fraction);
 *   • but a LIVE hull never reads `0`: storm damage leaves fractions (0.4 hp is
 *     still afloat), and `HULL 0/100` on a ship that is still fighting is a lie.
 *     Only a genuinely sunk hull (hp ≤ 0) reads zero.
 */
export function hullHeaderValue(hp: number, maxHp: number): string {
  const shown = hp <= 0 ? 0 : Math.max(1, Math.floor(hp));
  return `${shown}/${Math.round(maxHp)}`;
}

/**
 * Storm-circle HUD summary. `line` is the compact top-center readout ("STORM
 * 0:32" during grace, "STORM CLOSING" while shrinking, "" when idle); `inStorm`
 * flags the own ship outside the safe radius (shows an "IN STORM" warning).
 */
export interface ZoneHud {
  line: string;
  inStorm: boolean;
}

const ZONE_STYLE = { fontFamily: MONO, fontSize: 20, fill: STORM_PURPLE, letterSpacing: 2 } as const;
const STORM_STYLE = { fontFamily: MONO, fontSize: 19, fill: STORM_PURPLE, letterSpacing: 2 } as const;
const MATCH_LINE_STYLE = { fontFamily: MONO, fontSize: 22, fill: GREEN, letterSpacing: 3 } as const;
const MATCH_TAG_STYLE = { fontFamily: MONO, fontSize: 18, fill: GREEN, letterSpacing: 3 } as const;
const COUNTDOWN_STYLE = { fontFamily: MONO, fontSize: 112, fill: GREEN, letterSpacing: 4 } as const;
const SPECTATE_STYLE = { fontFamily: MONO, fontSize: 28, fill: AMBER, letterSpacing: 3 } as const;

function pad3(n: number): string {
  return Math.round(n).toString().padStart(3, '0');
}

/**
 * Pure: HP rail fill color by remaining fraction (UX-DR15 + amendment 27's
 * bands). The thresholds are EXCLUSIVE lower bounds for the better color:
 * exactly 50% still reads phosphor, exactly 25% still reads amber. `damage`
 * crimson is retired here — the critical band is the brighter `damageMarker`,
 * which survives against the void at 6px wide.
 */
export function hpColor(frac: number): number {
  if (frac >= V.amberBelow) return GREEN;
  if (frac >= V.criticalBelow) return AMBER;
  return C.damageMarker;
}

/** Pure: does the rail BREATHE at this fraction? (The pulse gate is the exact
 *  fraction — the same test hullFillAlpha applies.) */
export function railPulsing(frac: number): boolean {
  return frac < V.amberBelow;
}

/**
 * Pure: the rail geometry's redraw signature. The fraction is quantized (0.001
 * of the bar — finer than a pixel at this height), but the BAND and the PULSE
 * GATE are carried exactly: quantizing alone would let 0.4996 share a signature
 * with 0.5 and keep drawing a phosphor rail while the (exact-fraction) pulse
 * gate had already started breathing it — a pulsing "healthy" rail. Any color or
 * gate transition forces the redraw.
 */
export function railSig(frac: number): string {
  return `${frac.toFixed(3)}|${hpColor(frac)}|${railPulsing(frac) ? 1 : 0}`;
}

/**
 * Pure: the HP rail's breathing RATE (Hz) at a remaining fraction — a linear
 * ramp from `pulseMinHz` (0.5) at 50% hull to the shared photosensitivity
 * ceiling (`settings.pulseCapHz`, 1.1) at `pulseFloorFrac` (10%) and below.
 * CLAMPED at both ends: no input can produce a rate above the ceiling, which is
 * the accessibility floor's hard promise.
 *
 * This is the rate alone. WHETHER the rail breathes is a separate question
 * (only below 50% — see hullFillAlpha), so the ramp stays a total function.
 */
export function hullPulseHz(frac: number): number {
  const f = Math.min(V.amberBelow, Math.max(V.pulseFloorFrac, frac));
  const t = (V.amberBelow - f) / (V.amberBelow - V.pulseFloorFrac);
  return V.pulseMinHz + t * (CLIENT_CONFIG.settings.pulseCapHz - V.pulseMinHz);
}

/** Largest frame gap (s) the pulse integrator will advance across. A backgrounded
 *  tab or a hitching frame must not jump the phase by a wild amount. */
const MAX_PULSE_DT = 0.5;

/**
 * Pure: advance the breathing pulse's PHASE (radians) by one frame.
 *
 * The phase is INTEGRATED, never computed from absolute time. `sin(t · hz)` looks
 * equivalent only while `hz` is constant: the moment the rate changes (and it
 * changes every time the hull does — storm damage ticks the fraction 20×/s), the
 * phase of an absolute-time formula jumps by `t · Δhz · 2π`, which at a few
 * minutes of match time is effectively a random re-roll every tick. That is a
 * strobe — in exactly the burning-in-the-storm case the 1.1 Hz ceiling exists to
 * prevent. Integrating keeps the wave continuous through any rate change, so the
 * cap on the RATE is also a cap on how fast the alpha can move.
 *
 * `dt` is clamped to [0, MAX_PULSE_DT]; the phase is wrapped to keep float
 * precision from degrading over a long match. Above the band the phase HOLDS AT
 * ZERO (the rail is flat there anyway), so the first breath after a hull drops
 * through 50% starts from sin(0) = the base alpha — the pulse fades in from the
 * steady rail instead of snapping to wherever a free-running phase had drifted.
 */
export function advancePulsePhase(phase: number, frac: number, dt: number): number {
  if (!railPulsing(frac)) return 0;
  const step = Math.min(MAX_PULSE_DT, Math.max(0, dt));
  return (phase + hullPulseHz(frac) * step * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Pure: the HP rail fill's alpha at a given pulse PHASE — the opacity-breathing
 * pulse, in the storm vignette's exact shape (zone.ts vignetteAlpha).
 *
 * MOTION-GATED: `amp` is the motion-scaled amplitude — halved at `reduced`, zero
 * at `off`, where the rail holds its steady BASE alpha. The base is
 * INFORMATION: the fill, its color band, and its height are fully present at
 * every motion level; only the breathing is motion. At or above 50% hull there
 * is no pulse at all (the gate is the exact fraction, not the phase).
 */
export function hullFillAlpha(frac: number, phase: number, amp: number = V.pulseAmp): number {
  if (frac >= V.amberBelow) return V.railFillAlpha;
  return V.railFillAlpha + amp * Math.sin(phase);
}

/**
 * Reload progress in [0,1] for a weapon with `reloadMsLeft` remaining of a
 * `reloadMs` cycle: 0 when idle (no reload running) or just started, → 1 as the
 * next round nears. Shared by the HUD reload line and the firing arc sweep-back.
 */
export function reloadFraction(reloadMsLeft: number, reloadMs: number): number {
  if (reloadMsLeft <= 0 || reloadMs <= 0) return 0;
  const f = 1 - reloadMsLeft / reloadMs;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// --- bottom-right own-vitals stack --------------------------------------------
// The corner is laid out from the viewport's bottom-right corner:
//   cluster   the header + helm body, MARGIN from the right/bottom edges
//   hp rail   a 6px column ABUTTING the cluster body's right edge (the two
//             boxes touch and never overlap — the rail is the body's edge)
//   IN STORM  above the cluster's top edge
//
// Story 2.6 (amendment 33) deleted the amber "PTS ×N — TAB" prompt that used to
// sit between the cluster and IN STORM: the whole economy readout — XP rail, LV
// tag, banked-level chip, cue line — now lives bottom-LEFT in the hotbar's
// reserved gutter (render/xpRail.ts). The warning reflowed into the freed slot.

/** A screen-space box (px). */
interface HudBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole bottom-right own-vitals stack, as pure geometry. */
export interface VitalsLayout {
  /** The vertical HP rail — cluster-local as of Story 2.4 (it abuts
   *  `cluster`'s right edge rather than floating below it as the old bar did). */
  hp: HudBox;
  /** Origin of the cluster's local frame: its TOP-LEFT corner. */
  root: { x: number; y: number };
  /** The cluster body's screen box (header + helm block, rail EXCLUDED). */
  cluster: HudBox;
  storm: { x: number; y: number };
}

/**
 * Pure: the bottom-right vitals stack for a (logical) viewport. Everything the
 * cluster occupies is expressed here — pinned by hud.test.ts at the 1366×768
 * floor: right half only, no overlap, clear of the bottom-left hotbar, and
 * translational under a viewport change.
 */
export function vitalsLayout(screenW: number, screenH: number): VitalsLayout {
  const root = { x: screenW - MARGIN - (V.width + V.railWidth), y: screenH - MARGIN - V.height };
  const cluster = { x: root.x, y: root.y, w: V.width, h: V.height };
  return {
    hp: { x: root.x + V.width, y: root.y + RAIL_TOP, w: V.railWidth, h: V.height - RAIL_TOP },
    root,
    cluster,
    storm: { x: root.x, y: root.y - V.stormAbove },
  };
}

/** One helm key-chip glyph: its pair, its box position, and its glyph. */
interface HelmChip {
  pair: HelmPair;
  x: number;
  y: number;
  glyph: string;
}

/** The four helm chips at the gauge extremes: W/S level with the ladder's end
 *  rungs, A/D at the rudder track's ends (root-local, centered on the feature). */
const HELM_CHIPS: readonly HelmChip[] = [
  { pair: 'ws', x: CHIP_X, y: LADDER_TOP - KEY_CHIP_SIZE / 2, glyph: 'W' },
  { pair: 'ws', x: CHIP_X, y: LADDER_BOTTOM - KEY_CHIP_SIZE / 2, glyph: 'S' },
  { pair: 'ad', x: RUD_X - 8 - KEY_CHIP_SIZE, y: RUD_Y - KEY_CHIP_SIZE / 2, glyph: 'A' },
  { pair: 'ad', x: READ_RIGHT + 8, y: RUD_Y - KEY_CHIP_SIZE / 2, glyph: 'D' },
];

export class Hud {
  private readonly root = new Container();
  private readonly gauges = new Graphics(); // telegraph + rudder linework
  private readonly railTrack = new Graphics(); // dim rail track (static geometry)
  private readonly railFill = new Graphics(); // the fill — its ALPHA breathes
  private readonly helmPairs: Record<HelmPair, Container>;
  private readonly hullValue: Text;
  private readonly headingLabel: Text;
  private readonly speedLabel: Text;
  private readonly overlay: Text;
  private readonly rungLabels: Text[];
  private readonly zoneLine: Text;
  private readonly stormWarn: Text;
  private readonly matchLine: Text;
  private readonly matchTag: Text;
  private readonly countdownBig: Text;
  private readonly spectateBanner: Text;
  private lastHeading = '';
  private lastSpeed = '';
  private lastHull = '';
  /** Cheap-redraw guards for the telegraph ladder Graphics + label highlight. */
  private lastGaugeSig = '';
  private lastDetent = -1;
  private lastRailSig = '';
  private lastOverlay = '';
  private lastZoneLine = '';
  private lastMatchLine = '';
  private lastMatchTag = '';
  private lastCountdown = '';
  private lastSpectateBanner = '';
  /** Per-pair fade clock: the second a pair CROSSES into faded during this
   *  session. Null means "not faded" OR "already faded when we booted" — a
   *  reload must show the chips gone, not replay the fade (glyphFadeAlpha). */
  private readonly fadeStart: Record<HelmPair, number | null> = { ws: null, ad: null };
  private readonly wasFaded: Record<HelmPair, boolean>;
  /** Are the live-ship instruments currently shown? A hidden→visible edge
   *  re-snapshots the fade state (see seedFadedWhileHidden). */
  private instrumentsShown = false;
  /** INTEGRATED pulse phase (radians) + the clock it was last advanced at. The
   *  phase is accumulated per frame rather than derived from absolute time, so a
   *  changing hull fraction can never jump it (see advancePulsePhase). */
  private pulsePhase = 0;
  private lastPulseSec: number | null = null;

  constructor(
    private readonly hudLayer: Container,
    /** The helm-glyph fade progress this HUD reads. Defaults to THE process-wide
     *  store; injectable so tests can drive a fade without touching it. */
    private readonly glyphs: HelmGlyphStore = helmGlyphs,
  ) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.railTrack, this.railFill, this.gauges);
    this.hullValue = this.buildHeader();
    this.headingLabel = new Text({ text: '', style: DATA_STYLE });
    this.speedLabel = new Text({ text: '', style: DATA_STYLE });
    this.buildReadouts();
    this.rungLabels = this.buildLadderLabels();
    this.helmPairs = { ws: new Container(), ad: new Container() };
    this.buildHelmChips();
    this.wasFaded = { ws: this.glyphs.faded('ws'), ad: this.glyphs.faded('ad') };
    this.overlay = new Text({ text: '', style: OVERLAY_STYLE });
    this.overlay.anchor.set(0.5);
    this.overlay.visible = false;
    hudLayer.addChild(this.overlay);
    this.zoneLine = new Text({ text: '', style: ZONE_STYLE });
    this.zoneLine.anchor.set(0.5, 0);
    this.zoneLine.visible = false;
    this.stormWarn = new Text({ text: 'IN STORM', style: STORM_STYLE });
    this.stormWarn.visible = false;
    hudLayer.addChild(this.zoneLine, this.stormWarn);
    this.matchLine = new Text({ text: '', style: MATCH_LINE_STYLE });
    this.matchLine.anchor.set(0.5, 0);
    this.matchLine.visible = false;
    this.matchTag = new Text({ text: '', style: MATCH_TAG_STYLE });
    this.matchTag.anchor.set(0.5, 0);
    this.matchTag.visible = false;
    this.countdownBig = new Text({ text: '', style: COUNTDOWN_STYLE });
    this.countdownBig.anchor.set(0.5);
    this.countdownBig.visible = false;
    this.spectateBanner = new Text({ text: '', style: SPECTATE_STYLE });
    this.spectateBanner.anchor.set(0.5, 0);
    this.spectateBanner.visible = false;
    hudLayer.addChild(this.matchLine, this.matchTag, this.countdownBig, this.spectateBanner);
  }

  /** A dim-phosphor micro caption (never grey — amendment 25). */
  private micro(text: string, x: number, y: number, anchorX: number, style: TextStyleOptions = MICRO_STYLE): Text {
    const t = new Text({ text, style });
    t.anchor.set(anchorX, 0.5);
    t.alpha = V.labelAlpha;
    t.position.set(x, y);
    this.root.addChild(t);
    return t;
  }

  /** `HULL 72/100` — dim caption + phosphor value, right-aligned over the body. */
  private buildHeader(): Text {
    this.micro('HULL', V.width - 130, HEADER_Y, 0);
    const value = new Text({ text: '', style: HEAD_STYLE });
    value.anchor.set(1, 0.5);
    value.position.set(V.width, HEADER_Y);
    this.root.addChild(value);
    return value;
  }

  /** HDG/KTS readouts + the rudder gauge's micro label, right-aligned. */
  private buildReadouts(): void {
    this.micro('HDG', READ_RIGHT - 58, HDG_Y, 1);
    this.headingLabel.anchor.set(1, 0.5);
    this.headingLabel.position.set(READ_RIGHT, HDG_Y);
    this.speedLabel.anchor.set(1, 0.5);
    this.speedLabel.position.set(READ_RIGHT - 42, KTS_Y);
    this.micro('KTS', READ_RIGHT - 36, KTS_Y, 0);
    this.micro('RUDDER', READ_RIGHT, RUD_LABEL_Y, 1);
    this.root.addChild(this.headingLabel, this.speedLabel);
  }

  /** Nine rung labels + the AHEAD/ASTERN captions (created once). */
  private buildLadderLabels(): Text[] {
    const labels = DETENT_LABELS.map((t, i) => {
      const label = new Text({ text: t, style: RUNG_STYLE });
      label.alpha = TEXT_DIM_ALPHA; // updateTelegraph brightens the ordered rung
      label.anchor.set(0, 0.5);
      label.position.set(LABEL_X, rungY(i));
      this.root.addChild(label);
      return label;
    });
    this.micro('AHEAD', TG_X, LADDER_TOP - CAP_GAP - 8, 0, CAP_STYLE);
    this.micro('ASTERN', TG_X, LADDER_BOTTOM + CAP_GAP + 8, 0, CAP_STYLE);
    return labels;
  }

  /** The four helm key glyphs, in the ONE shared chip family (render/keyChip.ts).
   *  Each pair lives in its own container so the pair fades as a unit. */
  private buildHelmChips(): void {
    for (const pair of ['ws', 'ad'] as const) {
      const group = this.helmPairs[pair];
      const gfx = new Graphics();
      group.addChild(gfx);
      for (const chip of HELM_CHIPS.filter((c) => c.pair === pair)) {
        drawKeyChipBox(gfx, chip.x, chip.y, false);
        const glyph = new Text({ text: chip.glyph, style: KEY_CHIP_STYLE });
        glyph.anchor.set(0.5);
        glyph.position.set(chip.x + KEY_CHIP_SIZE / 2, chip.y + KEY_CHIP_SIZE / 2);
        group.addChild(glyph);
      }
      this.root.addChild(group);
    }
  }

  /**
   * Phase layer: waiting shows "AWAITING CAPTAINS n/2" + "WEAPONS SAFE";
   * countdown adds the big center number; active/finished show nothing here.
   */
  private drawMatch(match: MatchUx, screenW: number, screenH: number): void {
    if (match.topLine !== this.lastMatchLine) {
      this.matchLine.text = match.topLine;
      this.lastMatchLine = match.topLine;
    }
    if (match.tag !== this.lastMatchTag) {
      this.matchTag.text = match.tag;
      this.lastMatchTag = match.tag;
    }
    if (match.countdown !== this.lastCountdown) {
      this.countdownBig.text = match.countdown;
      this.lastCountdown = match.countdown;
    }
    this.matchLine.visible = match.topLine !== '';
    this.matchTag.visible = match.tag !== '';
    this.countdownBig.visible = match.countdown !== '';
    this.matchLine.position.set(screenW / 2, MARGIN + 24);
    this.matchTag.position.set(screenW / 2, MARGIN + 46);
    this.countdownBig.position.set(screenW / 2, screenH * 0.35);
  }

  /** Hide/show the live-ship instrument cluster (hidden while spectating). The
   *  HP rail rides inside the cluster root now, so it dies with the hull too.
   *  A hidden→visible edge re-snapshots the glyph fade: the animation only ever
   *  plays for a pair that crossed while it was ON SCREEN. */
  private setInstrumentsVisible(visible: boolean): void {
    if (visible && !this.instrumentsShown) this.seedFadedWhileHidden();
    this.instrumentsShown = visible;
    this.root.visible = visible;
  }

  /**
   * Adopt the store's CURRENT fade state without animating — the same snapshot
   * the constructor takes, re-taken whenever the instruments come back. A pair
   * whose 3rd input landed just before death (or while spectating) has already
   * faded as far as the player is concerned; replaying the fade-out on the next
   * live frame would be a ghost of a chip they already retired.
   */
  private seedFadedWhileHidden(): void {
    for (const pair of ['ws', 'ad'] as const) {
      if (this.glyphs.faded(pair)) this.wasFaded[pair] = true; // fadeStart stays null → instantly gone
    }
  }

  /** Top-center storm readout + the "IN STORM" warning at the head of the
   *  bottom-RIGHT vitals stack (amendment 12 — it moved with the cluster). */
  private drawZone(zone: ZoneHud, screenW: number, screenH: number): void {
    if (zone.line !== this.lastZoneLine) {
      this.zoneLine.text = zone.line;
      this.lastZoneLine = zone.line;
    }
    this.zoneLine.visible = zone.line !== '';
    this.zoneLine.position.set(screenW / 2, MARGIN);
    this.stormWarn.visible = zone.inStorm;
    const storm = vitalsLayout(screenW, screenH).storm;
    this.stormWarn.position.set(storm.x, storm.y);
  }

  private layout(screenW: number, screenH: number): void {
    const root = vitalsLayout(screenW, screenH).root;
    this.root.position.set(root.x, root.y);
  }

  /**
   * Telegraph ladder + rudder gauge. `index` is the ordered detent (the HOLLOW
   * phosphor rung outline — the shape channel), `speed` drives the SOLID amber
   * needle. Only called when the detent, rudder, or displayed speed changes
   * (see updateTelegraph) — the Graphics is otherwise left untouched.
   */
  private drawTelegraph(index: number, rudder: number, speed: number, kin: LadderKin): void {
    const g = this.gauges;
    g.clear();
    for (let i = 0; i < 9; i++) {
      const y = rungY(i);
      const len = i === 0 || i === 4 || i === 8 ? RUNG_W : RUNG_W - 6;
      g.moveTo(TG_X, y).lineTo(TG_X + len, y).stroke({ width: 1, color: DIM, alpha: 0.5 });
    }
    // ORDERED: a hollow 1px phosphor rung outline + a soft bloom ring.
    const oy = rungY(index);
    const ox = TG_X + (RUNG_W - V.orderedW) / 2;
    g.rect(ox, oy - V.orderedH / 2, V.orderedW, V.orderedH).stroke({ width: 1, color: GREEN, alpha: 1 });
    g.rect(ox - 1.5, oy - V.orderedH / 2 - 1.5, V.orderedW + 3, V.orderedH + 3)
      .stroke({ width: 1, color: GREEN, alpha: 0.28 });
    // ACTUAL: a solid amber pointer needle — never color alone.
    const ny = LADDER_BOTTOM - ((speedLadderFraction(speed, kin) + 1) / 2) * (8 * RUNG_GAP);
    g.moveTo(TG_X - 15, ny - 5).lineTo(TG_X - 6, ny).lineTo(TG_X - 15, ny + 5).fill({ color: AMBER, alpha: 0.95 });
    g.rect(TG_X - 8, ny - 1, RUNG_W + 6, 2).fill({ color: AMBER, alpha: 0.95 });
    this.drawRudder(rudder);
  }

  /** 110px hairline track, a center detent mark, and the AMBER position tick
   *  (the old green tick is retired — amber is the "actual" channel). The tick's
   *  center is clamped so its halo never overhangs the track at full deflection. */
  private drawRudder(rudder: number): void {
    const g = this.gauges;
    const halo = V.rudderTickHaloPx;
    const mid = RUD_X + V.rudderTrack / 2;
    g.moveTo(RUD_X, RUD_Y).lineTo(RUD_X + V.rudderTrack, RUD_Y).stroke({ width: 1, color: DIM, alpha: 0.5 });
    g.moveTo(mid, RUD_Y - 3).lineTo(mid, RUD_Y + 3).stroke({ width: 1, color: C.silver, alpha: 0.5 });
    const x = rudderTickCenter(rudder, RUD_X, V.rudderTrack, RUD_TICK_INSET) - V.rudderTickW / 2;
    g.rect(x, RUD_Y - V.rudderTickH / 2, V.rudderTickW, V.rudderTickH).fill({ color: AMBER, alpha: 1 });
    g.rect(x - halo, RUD_Y - V.rudderTickH / 2 - halo, V.rudderTickW + halo * 2, V.rudderTickH + halo * 2)
      .fill({ color: AMBER, alpha: 0.25 });
  }

  /**
   * Redraw the telegraph only when the ordered detent, rudder, or displayed
   * speed (0.1kt buckets, matching the KTS readout) changes; brighten the
   * ordered rung's label on a detent change. The HP pulse deliberately does NOT
   * feed this signature — it rides railFill.alpha instead, so a breathing rail
   * never forces a ladder redraw.
   */
  private updateTelegraph(axes: Axes, speed: number, kin: LadderKin): void {
    const index = detentIndexOf(axes.throttle);
    if (index !== this.lastDetent) {
      for (let i = 0; i < this.rungLabels.length; i++) {
        this.rungLabels[i].alpha = i === index ? 1 : TEXT_DIM_ALPHA;
      }
      this.lastDetent = index;
    }
    const sig = `${index}|${axes.rudder}|${speed.toFixed(1)}|${kin.maxSpeed}|${kin.reverseSpeed}`;
    if (sig === this.lastGaugeSig) return;
    this.lastGaugeSig = sig;
    this.drawTelegraph(index, axes.rudder, speed, kin);
  }

  /**
   * The vertical HP rail on the body's right edge: a dim phosphor track with a
   * bottom-up fill = hp/maxHp in the threshold color. Geometry redraws whenever
   * the rail SIGNATURE changes — the fraction at 0.001 granularity plus the band
   * and the pulse gate (railSig). That guard is NOT "only on a color change":
   * under continuous damage (a storm dot drains ~0.002 of the bar per tick) the
   * fraction moves every tick and the rail redraws every tick; the signature's
   * job is to skip the redraw while the hull is STEADY and, crucially, to never
   * skip one across a band/gate transition. The breathing pulse is a per-frame
   * ALPHA on the fill Graphics
   * (motion-gated — the base alpha is information and holds at `off`), driven by
   * an integrated phase so a changing hull fraction never jumps the wave.
   */
  private updateHpRail(status: OwnStatus, nowSec: number): void {
    const maxHp = status.stats.maxHp;
    const frac = maxHp > 0 ? Math.max(0, Math.min(1, status.hp / maxHp)) : 0;
    const sig = railSig(frac);
    if (sig !== this.lastRailSig) {
      this.lastRailSig = sig;
      this.drawRail(frac);
    }
    const dt = this.lastPulseSec === null ? 0 : nowSec - this.lastPulseSec;
    this.lastPulseSec = nowSec;
    this.pulsePhase = advancePulsePhase(this.pulsePhase, frac, dt);
    this.railFill.alpha = hullFillAlpha(frac, this.pulsePhase, motionScaled(V.pulseAmp, settings.current.motion));
    const hull = hullHeaderValue(status.hp, maxHp);
    if (hull !== this.lastHull) {
      this.hullValue.text = hull;
      this.lastHull = hull;
    }
  }

  private drawRail(frac: number): void {
    const x = V.width;
    const h = V.height - RAIL_TOP;
    this.railTrack.clear();
    this.railTrack.rect(x, RAIL_TOP, V.railWidth, h).fill({ color: GREEN, alpha: V.railTrackAlpha });
    const fh = h * frac;
    const y = RAIL_TOP + h - fh;
    const color = hpColor(frac);
    this.railFill.clear();
    if (fh <= 0) return; // a sunk hull shows the empty track, not a zero-height fill
    // Bloom first, core over it — the fill's own alpha must not be muddied by
    // the halo painted on top of it.
    this.railFill
      .rect(x - V.railGlowPx, y - V.railGlowPx, V.railWidth + V.railGlowPx * 2, fh + V.railGlowPx * 2)
      .fill({ color, alpha: V.railGlowAlpha });
    this.railFill.rect(x, y, V.railWidth, fh).fill({ color, alpha: 1 });
  }

  /**
   * Helm key glyphs: each pair holds full alpha until its 3rd successful input,
   * then fades out ONCE and stays gone (the counts persist). The fade itself is
   * motion — at `off` the chips simply vanish rather than animating. Only a pair
   * that crosses while the instruments are ON SCREEN animates (a crossing during
   * a hidden stretch was already seeded as faded — seedFadedWhileHidden).
   */
  private updateHelmGlyphs(nowSec: number): void {
    const animate = motionAllowed(settings.current.motion);
    for (const pair of ['ws', 'ad'] as const) {
      const faded = this.glyphs.faded(pair);
      if (faded && !this.wasFaded[pair]) {
        this.wasFaded[pair] = true;
        this.fadeStart[pair] = nowSec;
      }
      const group = this.helmPairs[pair];
      const alpha = glyphFadeAlpha(faded, this.fadeStart[pair], nowSec, animate);
      group.alpha = alpha;
      group.visible = alpha > 0;
    }
  }

  /** Render-state seams (tests/debug): the rail fill's live breathing alpha and
   *  a helm pair's current chip alpha, without reaching into the display list. */
  get railFillAlpha(): number {
    return this.railFill.alpha;
  }

  chipAlpha(pair: HelmPair): number {
    return this.helmPairs[pair].alpha;
  }

  private updateReadouts(ship: ShipState): void {
    const hdg = pad3((wrapPositive(ship.heading) * 180) / Math.PI);
    if (hdg !== this.lastHeading) {
      this.headingLabel.text = hdg;
      this.lastHeading = hdg;
    }
    const spd = Math.abs(ship.speed).toFixed(1);
    if (spd !== this.lastSpeed) {
      this.speedLabel.text = spd;
      this.lastSpeed = spd;
    }
  }

  private updateOverlay(status: OwnStatus, screenW: number, screenH: number): void {
    if (status.alive) {
      if (this.overlay.visible) this.overlay.visible = false;
      return;
    }
    const secs = Math.max(0, Math.ceil(status.respawnInMs / 1000));
    const text = `SUNK — RESPAWNING IN ${secs}s`;
    if (text !== this.lastOverlay) {
      this.overlay.text = text;
      this.lastOverlay = text;
    }
    this.overlay.position.set(screenW / 2, screenH / 2);
    this.overlay.visible = true;
  }

  /** Update all instruments (conning a live ship). Call each render frame.
   *  `nowSec` is the server-clock estimate in SECONDS (main.ts renderAlive's
   *  `now / 1000`, the same clock zone.ts's vignette pulse rides). */
  update(
    ship: ShipState,
    axes: Axes,
    status: OwnStatus,
    zone: ZoneHud,
    match: MatchUx,
    screenW: number,
    screenH: number,
    nowSec: number,
  ): void {
    this.setInstrumentsVisible(true);
    this.spectateBanner.visible = false;
    this.layout(screenW, screenH);
    // Speed-needle denominator: the BOOSTED cap while the boost window is
    // active — via the one shared speed mutator, never a hand-tweaked maxSpeed.
    const kin = boostedKinematics(status.stats.kinematics, status.stats.boost.speedBonus, status.boostActive);
    this.updateTelegraph(axes, ship.speed, kin);
    this.updateHpRail(status, nowSec);
    this.updateHelmGlyphs(nowSec);
    this.updateReadouts(ship);
    this.updateOverlay(status, screenW, screenH);
    this.drawZone(zone, screenW, screenH);
    this.drawMatch(match, screenW, screenH);
  }

  /**
   * Spectator frame: instruments hidden, banner + zone/phase lines only.
   * `bannerText` is computed by ui/phase.ts's spectateBannerText() from the
   * match phase + winnerId.
   */
  updateSpectate(zone: ZoneHud, match: MatchUx, screenW: number, screenH: number, bannerText: string): void {
    this.setInstrumentsVisible(false);
    this.overlay.visible = false;
    this.stormWarn.visible = false;
    if (bannerText !== this.lastSpectateBanner) {
      this.spectateBanner.text = bannerText;
      this.lastSpectateBanner = bannerText;
    }
    this.spectateBanner.visible = true;
    this.spectateBanner.position.set(screenW / 2, screenH * 0.16);
    this.drawZone({ line: zone.line, inStorm: false }, screenW, screenH);
    this.drawMatch(match, screenW, screenH);
  }
}
