// Own-vitals HUD — screen-space instrument readout (hudRoot). Throttle/rudder
// gauges + heading/speed, an HP bar (green→amber→crimson), the banked-points
// prompt, the storm readouts, and a centered respawn overlay while sunk. Geist
// Mono per DESIGN.md. Text strings are diffed before assignment (Pixi
// re-rasterizes on `.text`).
//
// Story 2.2: the interim loadout CHIP ROW is gone — render/hotbar.ts owns the
// loadout surface now (the ratified bottom-left hotbar), and the whole vitals
// cluster (telegraph ladder, rudder gauge, HDG/KTS, IN STORM) moved from
// bottom-LEFT to bottom-RIGHT to free that corner (amendment 12). This is a
// RELOCATION only, in the current visual style; Story 2.4 restyles the cluster
// in place. Vertical order in the corner, bottom-up: HP bar, telegraph
// cluster, PTS prompt, IN STORM.

import { Container, Graphics, Text } from 'pixi.js';
import type { EffectiveStats, ShipState, EquipmentId, ShipClassId, WeaponAmmo } from '@salvo/shared';
import { boostedKinematics, wrapPositive } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** Kinematics subset the speed ladder needs (ahead/astern denominators). */
interface LadderKin {
  maxSpeed: number;
  reverseSpeed: number;
}
import type { Axes } from '../input/keyboard.js';
import type { MatchUx } from '../ui/phase.js';

const C = CLIENT_CONFIG.colors;
const GREEN = C.phosphor;
const AMBER = C.amber;
const CRIMSON = C.damage; // HP-rail third band keeps `damage` (HP-rail redesign is a later story)
const DIM = C.textMuted;
// Storm readout accent: the `storm` fill is below the graphic-contrast
// threshold, so text/readout uses `storm-readout` (brighter, not more saturated —
// DESIGN.md storm color note).
const STORM_PURPLE = C.stormReadout;
const PANEL = C.panel; // HP bar backing
// Story 2.3 (amendment 17): load-bearing HUD TEXT is de-greyed to CIC phosphor —
// `DIM` survives only as decorative LINEWORK (ladder spine, rungs, HP-bar edge).
// An un-selected ladder rung dims the phosphor via the Text's alpha instead of
// switching color, so the highlight grammar reads without any grey text.
const TEXT_DIM_ALPHA = 0.55;
// Geist Mono per DESIGN.md — the single mono stack (sizes unchanged: they already
// embed the post-playtest ~1.6× register).
const MONO = CLIENT_CONFIG.type.mono;
// HUD scaled ~1.6× after the 2026-07-13 owner play test ("everything tiny").
// DESIGN.md type floor is Small = 14px; readouts/labels sit at/above it.
const PANEL_W = 240;
const MARGIN = 24;
const BAR_W = 240;
const BAR_H = 16;

// --- engine-order telegraph ladder ------------------------------------------
const SPINE_X = PANEL_W; // ladder spine at the panel's right edge
const RUNG_GAP = 20; // vertical px between the nine detents (grown for the Story 2.3 type lift)
const LADDER_BOTTOM = 118; // y of the full-astern rung (index 0)
const LADDER_TOP = LADDER_BOTTOM - 8 * RUNG_GAP; // full-ahead rung (index 8)
const RUNG_LEN = 10; // half-tick length for a normal detent
const RUNG_STYLE = {
  fontFamily: MONO,
  fontSize: 18,
  fill: GREEN,
  letterSpacing: 0.5,
} as const;
const CAP_STYLE = {
  fontFamily: MONO,
  fontSize: 20,
  fill: GREEN,
  letterSpacing: 1,
} as const;

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
 * Pure: the ship's ACTUAL speed mapped onto the telegraph's [-1,1] axis for the
 * needle — ahead scales on maxSpeed, astern on reverseSpeed. The gap between
 * this needle and the highlighted order rung is the ship converging on the
 * ordered speed (the naval feel: the setting is instant, the hull is not).
 */
export function speedLadderFraction(speed: number, kin: LadderKin): number {
  const denom = speed >= 0 ? kin.maxSpeed : kin.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

const LABEL_STYLE = {
  fontFamily: MONO,
  fontSize: 16,
  fill: GREEN,
  letterSpacing: 1.5,
} as const;

const DATA_STYLE = { fontFamily: MONO, fontSize: 28, fill: GREEN } as const;
// Banked-points prompt — amber (an action is available), above the vitals cluster.
const PTS_STYLE = {
  fontFamily: MONO,
  fontSize: 16,
  fill: AMBER,
  letterSpacing: 2,
} as const;
const OVERLAY_STYLE = {
  fontFamily: MONO,
  fontSize: 38,
  fill: AMBER,
  letterSpacing: 2,
} as const;

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
  pts: number; // banked upgrade points (drives the "PTS ×N — TAB" prompt)
  /** Cached effectiveStats(cls, upg) — ALL HUD denominators (max hp, speed
   *  ladder, ammo pool sizes, reload durations) read from here (Stage D). */
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

/** Pure: the banked-points prompt above the vitals cluster ('' hides it at 0).
 *  TAB is the refit-modal toggle (Story 2.1 — supersedes the CTRL window). */
export function pointsLine(n: number): string {
  return n <= 0 ? '' : `PTS ×${n} — TAB`;
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

const ZONE_STYLE = {
  fontFamily: MONO,
  fontSize: 20,
  fill: STORM_PURPLE, // storm readout accent (DESIGN.md dimensional purple)
  letterSpacing: 2,
} as const;
const STORM_STYLE = {
  fontFamily: MONO,
  fontSize: 19,
  fill: STORM_PURPLE, // "IN STORM" alarm — purple family, brightened for legibility
  letterSpacing: 2,
} as const;
const MATCH_LINE_STYLE = {
  fontFamily: MONO,
  fontSize: 22,
  fill: GREEN,
  letterSpacing: 3,
} as const;
const MATCH_TAG_STYLE = {
  fontFamily: MONO,
  fontSize: 18,
  fill: GREEN,
  letterSpacing: 3,
} as const;
const COUNTDOWN_STYLE = {
  fontFamily: MONO,
  fontSize: 112,
  fill: GREEN,
  letterSpacing: 4,
} as const;
const SPECTATE_STYLE = {
  fontFamily: MONO,
  fontSize: 28,
  fill: AMBER,
  letterSpacing: 3,
} as const;

function pad3(n: number): string {
  return Math.round(n).toString().padStart(3, '0');
}

/** HP bar color by remaining fraction (DESIGN.md green/amber/crimson). */
export function hpColor(frac: number): number {
  if (frac > 0.6) return GREEN;
  if (frac > 0.3) return AMBER;
  return CRIMSON;
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

// --- bottom-right own-vitals stack (amendment 12) ------------------------------
// The corner is laid out BOTTOM-UP from the viewport's bottom-right, so the
// cluster can never collide with the HP bar at the 1366×768 floor:
//   HP bar        h - MARGIN - BAR_H
//   telegraph     the gauge root, CLUSTER_BELOW px of clearance under it
//   PTS prompt    above the cluster's top edge
//   IN STORM      above the PTS prompt
// Local extremes of the gauge root's content: y ∈ [-72, 142] (AHEAD caption to
// ASTERN caption), x ∈ [0, ~260] (HDG readout to the speed needle). Story 2.3
// grew all three so the lifted rung/caption type fits without clipping.
const CLUSTER_TOP = 72; // px of root-local content ABOVE the root origin
const CLUSTER_BOTTOM = 142; // px of root-local content BELOW the root origin
const CLUSTER_W = 260; // px of root-local content RIGHT of the root origin
const CLUSTER_BELOW = 12; // clearance between the cluster's foot and the HP bar
const PTS_ABOVE = 24; // PTS prompt baseline above the cluster's top edge
const STORM_ABOVE = 50; // IN STORM baseline above the cluster's top edge

/** A screen-space box (px). */
interface HudBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole bottom-right own-vitals stack, as pure geometry. */
export interface VitalsLayout {
  hp: HudBox;
  /** Origin of the gauges' local frame (the telegraph/rudder/readout root). */
  root: { x: number; y: number };
  /** The gauge cluster's screen bounding box (root-local content resolved). */
  cluster: HudBox;
  pts: { x: number; y: number };
  storm: { x: number; y: number };
}

/**
 * Pure: the bottom-right vitals stack for a viewport (amendment 12). Laid out
 * bottom-up so the cluster can never collide with the HP bar — pinned by
 * hud.test.ts at the 1366×768 floor.
 */
export function vitalsLayout(screenW: number, screenH: number): VitalsLayout {
  const hp = { x: screenW - BAR_W - MARGIN, y: screenH - MARGIN - BAR_H, w: BAR_W, h: BAR_H };
  const root = { x: screenW - MARGIN - CLUSTER_W, y: hp.y - CLUSTER_BELOW - CLUSTER_BOTTOM };
  const cluster = { x: root.x, y: root.y - CLUSTER_TOP, w: CLUSTER_W, h: CLUSTER_TOP + CLUSTER_BOTTOM };
  return {
    hp,
    root,
    cluster,
    pts: { x: root.x, y: cluster.y - PTS_ABOVE },
    storm: { x: root.x, y: cluster.y - STORM_ABOVE },
  };
}

export class Hud {
  private readonly root = new Container();
  private readonly gauges = new Graphics();
  private readonly bars = new Graphics();
  private readonly headingLabel: Text;
  private readonly speedLabel: Text;
  private readonly overlay: Text;
  private readonly ptsLabel: Text;
  private readonly rungLabels: Text[];
  private readonly zoneLine: Text;
  private readonly stormWarn: Text;
  private readonly matchLine: Text;
  private readonly matchTag: Text;
  private readonly countdownBig: Text;
  private readonly spectateBanner: Text;
  private lastHeading = '';
  private lastSpeed = '';
  /** Cheap-redraw guards for the telegraph ladder Graphics + label highlight. */
  private lastGaugeSig = '';
  private lastDetent = -1;
  private lastOverlay = '';
  private lastZoneLine = '';
  private lastMatchLine = '';
  private lastMatchTag = '';
  private lastCountdown = '';
  private lastSpectateBanner = '';
  private lastPtsLine = '';

  constructor(private readonly hudLayer: Container) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.gauges);
    hudLayer.addChild(this.bars); // screen-space, positioned absolutely
    this.headingLabel = new Text({ text: '', style: DATA_STYLE });
    this.speedLabel = new Text({ text: '', style: DATA_STYLE });
    const hdgCap = new Text({ text: 'HDG', style: LABEL_STYLE });
    const spdCap = new Text({ text: 'KTS', style: LABEL_STYLE });
    this.headingLabel.position.set(0, 20);
    spdCap.position.set(118, 0);
    this.speedLabel.position.set(118, 20);
    this.root.addChild(hdgCap, this.headingLabel, spdCap, this.speedLabel);
    this.overlay = new Text({ text: '', style: OVERLAY_STYLE });
    this.overlay.anchor.set(0.5);
    this.overlay.visible = false;
    hudLayer.addChild(this.overlay);
    this.ptsLabel = new Text({ text: '', style: PTS_STYLE });
    this.ptsLabel.visible = false;
    hudLayer.addChild(this.ptsLabel);
    this.rungLabels = this.buildLadderLabels();
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

  /**
   * Phase layer: waiting shows "AWAITING CAPTAINS n/2" + "WEAPONS SAFE";
   * countdown adds the big center number; active/finished show nothing here.
   * Positioned below the zone line's slot (they never speak simultaneously —
   * the zone is idle until the match activates — but keep separate slots).
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

  /** Hide/show the live-ship instrument cluster (hidden while spectating). */
  private setInstrumentsVisible(visible: boolean): void {
    this.root.visible = visible;
    this.bars.visible = visible;
    if (!visible) this.ptsLabel.visible = false; // spectate: no prompt (update() re-shows it when alive)
  }

  /** Amber "PTS ×N — TAB" prompt, above the bottom-right vitals cluster (hidden at 0). */
  private updatePoints(status: OwnStatus, screenW: number, screenH: number): void {
    const line = pointsLine(status.pts);
    if (line !== this.lastPtsLine) {
      this.ptsLabel.text = line;
      this.lastPtsLine = line;
    }
    this.ptsLabel.visible = line !== '';
    const pts = vitalsLayout(screenW, screenH).pts;
    this.ptsLabel.position.set(pts.x, pts.y);
  }

  /** Top-center storm readout + the "IN STORM" warning, now at the head of the
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

  /** Nine right-aligned rung labels + static AHEAD/ASTERN captions (created once). */
  private buildLadderLabels(): Text[] {
    const labels = DETENT_LABELS.map((t, i) => {
      const label = new Text({ text: t, style: RUNG_STYLE });
      label.alpha = TEXT_DIM_ALPHA; // updateTelegraph brightens the ordered rung
      label.anchor.set(1, 0.5);
      label.position.set(SPINE_X - RUNG_LEN - 6, rungY(i));
      this.root.addChild(label);
      return label;
    });
    const ahead = new Text({ text: 'AHEAD', style: CAP_STYLE });
    ahead.anchor.set(1, 1);
    ahead.position.set(SPINE_X, LADDER_TOP - 3);
    const astern = new Text({ text: 'ASTERN', style: CAP_STYLE });
    astern.anchor.set(1, 0);
    astern.position.set(SPINE_X, LADDER_BOTTOM + 3);
    this.root.addChild(ahead, astern);
    return labels;
  }

  /**
   * Telegraph ladder + rudder gauge. `index` is the ordered detent (highlighted
   * rung), `speed` drives the amber actual-speed needle. Only called when the
   * detent, rudder, or displayed speed changes (see updateTelegraph) — the
   * Graphics is otherwise left untouched so redraws stay cheap.
   */
  private drawTelegraph(index: number, rudder: number, speed: number, kin: LadderKin): void {
    const g = this.gauges;
    g.clear();
    g.moveTo(SPINE_X, LADDER_TOP).lineTo(SPINE_X, LADDER_BOTTOM).stroke({ width: 2, color: DIM, alpha: 0.6 });
    for (let i = 0; i < 9; i++) {
      const y = rungY(i);
      const len = i === 0 || i === 4 || i === 8 ? RUNG_LEN + 3 : RUNG_LEN;
      g.moveTo(SPINE_X - len, y).lineTo(SPINE_X, y).stroke({ width: 1, color: DIM, alpha: 0.5 });
    }
    const oy = rungY(index); // ordered detent — the bright marker
    g.rect(SPINE_X - RUNG_LEN - 4, oy - 1.5, RUNG_LEN + 8, 3).fill({ color: GREEN, alpha: 0.95 });
    const ny = LADDER_BOTTOM - ((speedLadderFraction(speed, kin) + 1) / 2) * (8 * RUNG_GAP);
    g.moveTo(SPINE_X + 8, ny - 3).lineTo(SPINE_X + 2, ny).lineTo(SPINE_X + 8, ny + 3).fill({ color: AMBER, alpha: 0.9 });
    this.drawRudder(rudder);
  }

  private drawRudder(rudder: number): void {
    const g = this.gauges;
    const rMid = 35;
    const rHalf = 30;
    const ry = 52;
    g.moveTo(rMid - rHalf, ry).lineTo(rMid + rHalf, ry).stroke({ width: 2, color: DIM, alpha: 0.6 });
    const defX = rMid + rudder * rHalf;
    g.rect(defX - 1.5, ry - 6, 3, 12).fill({ color: GREEN, alpha: 0.9 });
  }

  /**
   * Redraw the telegraph only when the ordered detent, rudder, or displayed
   * speed (0.1kt buckets, matching the KTS readout) changes; brighten the
   * ordered rung's label on a detent change. Keeps Pixi Graphics/Text churn off
   * the steady-state frame.
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

  /** HP bar — the foot of the bottom-right vitals stack (screen space). */
  private drawBars(status: OwnStatus, screenW: number, screenH: number): void {
    const g = this.bars;
    g.clear();
    const hp = vitalsLayout(screenW, screenH).hp;
    this.drawHp(g, hp.x, hp.y, status.hp, status.stats.maxHp);
  }

  private drawHp(g: Graphics, x: number, y: number, hp: number, maxHp: number): void {
    const frac = Math.max(0, Math.min(1, hp / maxHp));
    g.rect(x, y, BAR_W, BAR_H).fill({ color: PANEL, alpha: 0.8 });
    g.rect(x, y, BAR_W * frac, BAR_H).fill({ color: hpColor(frac), alpha: 0.95 });
    g.rect(x, y, BAR_W, BAR_H).stroke({ width: 1, color: DIM, alpha: 0.5 });
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
   *  Per-slot denied/activated feedback lives on the HOTBAR now
   *  (render/hotbar.ts) — this surface owns the vitals only. */
  update(
    ship: ShipState,
    axes: Axes,
    status: OwnStatus,
    zone: ZoneHud,
    match: MatchUx,
    screenW: number,
    screenH: number,
  ): void {
    this.setInstrumentsVisible(true);
    this.spectateBanner.visible = false;
    this.layout(screenW, screenH);
    // Speed-needle denominator: the BOOSTED cap while the boost window is
    // active — via the one shared speed mutator, never a hand-tweaked maxSpeed.
    const kin = boostedKinematics(status.stats.kinematics, status.stats.boost.speedBonus, status.boostActive);
    this.updateTelegraph(axes, ship.speed, kin);
    this.drawBars(status, screenW, screenH);
    this.updatePoints(status, screenW, screenH);
    this.updateReadouts(ship);
    this.updateOverlay(status, screenW, screenH);
    this.drawZone(zone, screenW, screenH);
    this.drawMatch(match, screenW, screenH);
  }

  /**
   * Spectator frame: instruments hidden, banner + zone/phase lines only.
   * `bannerText` is computed by ui/phase.ts's spectateBannerText() from the
   * match phase + winnerId — "SUNK — SPECTATING" for dead-in-active,
   * "VICTORY — AWAITING RESULTS" / "MATCH OVER — SPECTATING" once finished.
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
