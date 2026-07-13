// Telegraph HUD — screen-space instrument readout (hudRoot). Throttle/rudder
// gauges + heading/speed, an HP bar (green→amber→crimson), two gun cooldown
// bars, and a centered respawn overlay while sunk. Geist Mono per DESIGN.md.
// Text strings are diffed before assignment (Pixi re-rasterizes on `.text`).

import { Container, Graphics, Text } from 'pixi.js';
import type { ShipState, WeaponId } from '@salvo/shared';
import { CONFIG, WEAPON, wrapPositive } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';
import type { MatchUx } from '../ui/phase.js';
import { bearingGunMount } from './weaponArc.js';

const GREEN = 0x00ff88;
const AMBER = 0xffb800;
const CRIMSON = 0x8b0000;
const DIM = 0x5a6478;
const DENIED_RED = 0xff3b3b; // DESIGN.md invalid-placement red — denied-fire chip flash
// Storm = dimensional purple (DESIGN.md #7B2FBE). Text accents use a brightened
// member of the family so the warning stays alarming on black (bump brightness,
// not saturation — see DESIGN.md storm color note).
const STORM_PURPLE = 0xb06ee8;
// HUD scaled ~1.6× after the 2026-07-13 owner play test ("everything tiny").
// DESIGN.md type floor is Small = 14px; readouts/labels sit at/above it.
const PANEL_W = 240;
const PANEL_H = 96;
const MARGIN = 24;
const BAR_W = 240;
const BAR_H = 16;

// --- engine-order telegraph ladder ------------------------------------------
const SPINE_X = PANEL_W; // ladder spine at the panel's right edge
const RUNG_GAP = 13; // vertical px between the nine detents
const LADDER_BOTTOM = 84; // y of the full-astern rung (index 0)
const LADDER_TOP = LADDER_BOTTOM - 8 * RUNG_GAP; // full-ahead rung (index 8)
const RUNG_LEN = 10; // half-tick length for a normal detent
const RUNG_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 12,
  fill: DIM,
  letterSpacing: 0.5,
} as const;
const CAP_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 13,
  fill: DIM,
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
export function speedLadderFraction(speed: number): number {
  const denom = speed >= 0 ? CONFIG.ship.maxSpeed : CONFIG.ship.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

/** Weapon selector chip labels + reload durations, indexed by WeaponId. */
const WEAPON_LABELS = ['1 GUNS', '2 TORP', '3 MINE'] as const;
const WEAPON_RELOADS = [CONFIG.gun.reload, CONFIG.torpedo.reload, CONFIG.mine.dropCooldown];
const CHIP_GAP = 6;
const CHIP_H = 20;
const SUBBAR_GAP = 2; // px between the port/starboard gun sub-bars
const CHIP_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 14,
  fill: DIM,
  letterSpacing: 1,
} as const;
/** Tiny P/S markers on the two gun sub-bars. */
const SUBBAR_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 10,
  fill: DIM,
  letterSpacing: 0.5,
} as const;

const LABEL_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 14,
  fill: DIM,
  letterSpacing: 1.5,
} as const;

const DATA_STYLE = { fontFamily: 'Geist Mono, monospace', fontSize: 28, fill: GREEN } as const;
const OVERLAY_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 38,
  fill: AMBER,
  letterSpacing: 2,
} as const;

/** Own-ship status the HUD renders beyond raw kinematics. */
export interface OwnStatus {
  hp: number;
  cooldowns: number[][]; // per weapon: per-mount ms remaining (OwnShip.cooldowns)
  weapon: WeaponId; // currently-selected weapon (client-local, immediate — not the server echo)
  alive: boolean;
  respawnInMs: number; // 0 when alive / unknown
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
  fontFamily: 'Geist Mono, monospace',
  fontSize: 20,
  fill: STORM_PURPLE, // storm readout accent (DESIGN.md dimensional purple)
  letterSpacing: 2,
} as const;
const STORM_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 19,
  fill: STORM_PURPLE, // "IN STORM" alarm — purple family, brightened for legibility
  letterSpacing: 2,
} as const;
const MATCH_LINE_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 22,
  fill: GREEN,
  letterSpacing: 3,
} as const;
const MATCH_TAG_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 16,
  fill: DIM,
  letterSpacing: 3,
} as const;
const COUNTDOWN_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 112,
  fill: GREEN,
  letterSpacing: 4,
} as const;
const SPECTATE_STYLE = {
  fontFamily: 'Geist Mono, monospace',
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

/** Ready fraction (0 = just fired, 1 = ready) for `ms` remaining of `reload`. */
export function cooldownReadyFraction(ms: number, reload: number): number {
  if (reload <= 0) return 1;
  const f = 1 - ms / reload;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/** Weapon-chip border color + alpha: dim/idle, amber/selected, red/denied-flash. */
function chipTint(selected: boolean, flash: boolean): { border: number; alpha: number } {
  if (flash) return { border: DENIED_RED, alpha: 1 };
  if (selected) return { border: AMBER, alpha: 0.9 };
  return { border: DIM, alpha: 0.4 };
}

/**
 * Ready fraction (0..1) for one weapon's AIM-RELEVANT mount, against that
 * weapon's reload (guns 3s / torpedoes 12s / mines 8s). For guns the aim-relevant
 * mount is the one bearing on `aim` (heading-relative); when neither broadside
 * bears (aim over the bow/stern) it falls back to the soonest-ready of the two.
 * Torpedoes/mines are single-mount. Pure — the firing UX and denied-fire gate
 * share this collapse of the per-mount wire array to a single fraction.
 */
export function weaponReadyFraction(
  cooldowns: number[][],
  weapon: WeaponId,
  heading: number,
  aim: number,
): number {
  const mounts = cooldowns[weapon] ?? [];
  const reload = WEAPON_RELOADS[weapon];
  if (weapon === WEAPON.gun) {
    const i = bearingGunMount(heading, aim);
    const ms = i >= 0 ? mounts[i] : (mounts.length ? Math.min(...mounts) : 0);
    return cooldownReadyFraction(ms ?? 0, reload);
  }
  return cooldownReadyFraction(mounts[0] ?? 0, reload);
}

export class Hud {
  private readonly root = new Container();
  private readonly gauges = new Graphics();
  private readonly bars = new Graphics();
  private readonly headingLabel: Text;
  private readonly speedLabel: Text;
  private readonly overlay: Text;
  private readonly chipLabels: Text[];
  /** P/S markers on the two always-visible gun sub-bars. */
  private readonly gunSubLabels: Text[];
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
    this.chipLabels = WEAPON_LABELS.map((t) => {
      const label = new Text({ text: t, style: CHIP_STYLE });
      hudLayer.addChild(label);
      return label;
    });
    this.gunSubLabels = ['P', 'S'].map((t) => {
      const label = new Text({ text: t, style: SUBBAR_STYLE });
      label.anchor.set(0, 0.5);
      hudLayer.addChild(label);
      return label;
    });
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
    for (const chip of this.chipLabels) chip.visible = visible;
    for (const lbl of this.gunSubLabels) lbl.visible = visible;
  }

  /** Top-center storm readout + the "IN STORM" warning above the telegraph. */
  private drawZone(zone: ZoneHud, screenW: number, screenH: number): void {
    if (zone.line !== this.lastZoneLine) {
      this.zoneLine.text = zone.line;
      this.lastZoneLine = zone.line;
    }
    this.zoneLine.visible = zone.line !== '';
    this.zoneLine.position.set(screenW / 2, MARGIN);
    this.stormWarn.visible = zone.inStorm;
    this.stormWarn.position.set(MARGIN, screenH - PANEL_H - MARGIN - 18);
  }

  private layout(screenH: number): void {
    this.root.position.set(MARGIN, screenH - PANEL_H - MARGIN);
  }

  /** Nine right-aligned rung labels + static AHEAD/ASTERN captions (created once). */
  private buildLadderLabels(): Text[] {
    const labels = DETENT_LABELS.map((t, i) => {
      const label = new Text({ text: t, style: RUNG_STYLE });
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
  private drawTelegraph(index: number, rudder: number, speed: number): void {
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
    const ny = LADDER_BOTTOM - ((speedLadderFraction(speed) + 1) / 2) * (8 * RUNG_GAP);
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
  private updateTelegraph(axes: Axes, speed: number): void {
    const index = detentIndexOf(axes.throttle);
    if (index !== this.lastDetent) {
      for (let i = 0; i < this.rungLabels.length; i++) {
        this.rungLabels[i].style.fill = i === index ? GREEN : DIM;
      }
      this.lastDetent = index;
    }
    const sig = `${index}|${axes.rudder}|${speed.toFixed(1)}`;
    if (sig === this.lastGaugeSig) return;
    this.lastGaugeSig = sig;
    this.drawTelegraph(index, axes.rudder, speed);
  }

  /** HP bar + the 3-weapon selector chip row, anchored bottom-right (screen space). */
  private drawBars(
    status: OwnStatus,
    heading: number,
    aim: number,
    screenW: number,
    screenH: number,
    deniedFlash: boolean,
  ): void {
    const g = this.bars;
    g.clear();
    const x = screenW - BAR_W - MARGIN;
    const baseY = screenH - MARGIN - PANEL_H;
    this.drawHp(g, x, baseY, status.hp);
    this.drawWeaponChips(g, status, x, baseY + BAR_H + 12, heading, aim, deniedFlash);
  }

  private drawHp(g: Graphics, x: number, y: number, hp: number): void {
    const frac = Math.max(0, Math.min(1, hp / CONFIG.ship.hp));
    g.rect(x, y, BAR_W, BAR_H).fill({ color: 0x111111, alpha: 0.8 });
    g.rect(x, y, BAR_W * frac, BAR_H).fill({ color: hpColor(frac), alpha: 0.95 });
    g.rect(x, y, BAR_W, BAR_H).stroke({ width: 1, color: DIM, alpha: 0.5 });
  }

  /**
   * Three chips [1 GUNS / 2 TORP / 3 MINE]: the selected one is outlined amber;
   * `deniedFlash` briefly reddens the SELECTED chip's border (the HUD half of the
   * denied-fire feedback — render/deniedFire.ts drives the rate limit). GUNS
   * renders TWO always-visible per-mount sub-bars (P/S); torpedoes/mines a single
   * fill. Each fills green→dim by its own mount cooldown from OwnShip.cooldowns.
   */
  private drawWeaponChips(
    g: Graphics,
    status: OwnStatus,
    x: number,
    y: number,
    heading: number,
    aim: number,
    deniedFlash: boolean,
  ): void {
    const cw = (BAR_W - 2 * CHIP_GAP) / 3;
    for (let i = 0; i < 3; i++) {
      const cx = x + i * (cw + CHIP_GAP);
      const selected = i === status.weapon;
      g.rect(cx, y, cw, CHIP_H).fill({ color: 0x111111, alpha: 0.8 });
      if (i === WEAPON.gun) this.drawGunSubBars(g, status.cooldowns[WEAPON.gun] ?? [], cx, y, cw, heading, aim);
      else this.drawSingleBar(g, (status.cooldowns[i] ?? [])[0] ?? 0, WEAPON_RELOADS[i], cx, y, cw);
      this.drawChip(g, this.chipLabels[i], cx, y, cw, selected, selected && deniedFlash);
    }
  }

  /** One full-width cooldown fill (torpedo/mine chip). */
  private drawSingleBar(g: Graphics, ms: number, reload: number, cx: number, y: number, cw: number): void {
    const ready = cooldownReadyFraction(ms, reload);
    g.rect(cx, y, cw * ready, CHIP_H).fill({ color: ready >= 1 ? GREEN : DIM, alpha: 0.85 });
  }

  /**
   * Two stacked per-mount cooldown sub-bars (port over starboard) inside the gun
   * chip. The mount whose arc bears on the current aim is highlighted (amber
   * outline + bright fill + amber P/S marker); the off-side mount stays dim. When
   * neither bears (aim over bow/stern) neither is highlighted.
   */
  private drawGunSubBars(g: Graphics, mounts: number[], cx: number, y: number, cw: number, heading: number, aim: number): void {
    const bearing = bearingGunMount(heading, aim);
    const subH = (CHIP_H - SUBBAR_GAP) / 2;
    for (let m = 0; m < 2; m++) {
      const sy = y + m * (subH + SUBBAR_GAP);
      const ready = cooldownReadyFraction(mounts[m] ?? 0, CONFIG.gun.reload);
      const bears = m === bearing;
      g.rect(cx, sy, cw * ready, subH).fill({ color: ready >= 1 ? GREEN : DIM, alpha: bears ? 0.95 : 0.45 });
      if (bears) g.rect(cx, sy, cw, subH).stroke({ width: 1, color: AMBER, alpha: 0.9 });
      const lbl = this.gunSubLabels[m];
      lbl.position.set(cx + 3, sy + subH / 2);
      lbl.style.fill = bears ? AMBER : DIM;
    }
  }

  /** One chip's border + label tint: amber when selected, red while a denied pulse flashes it. */
  private drawChip(g: Graphics, label: Text, cx: number, y: number, cw: number, selected: boolean, flash: boolean): void {
    const { border, alpha } = chipTint(selected, flash);
    g.rect(cx, y, cw, CHIP_H).stroke({ width: selected ? 1.5 : 1, color: border, alpha });
    label.position.set(cx + 3, y + CHIP_H + 2);
    label.style.fill = border;
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
   *  `deniedFlash` is true while the denied-fire pulse (render/deniedFire.ts)
   *  is active — briefly reddens the selected weapon chip. */
  update(
    ship: ShipState,
    axes: Axes,
    status: OwnStatus,
    zone: ZoneHud,
    match: MatchUx,
    aim: number,
    screenW: number,
    screenH: number,
    deniedFlash = false,
  ): void {
    this.setInstrumentsVisible(true);
    this.spectateBanner.visible = false;
    this.layout(screenH);
    this.updateTelegraph(axes, ship.speed);
    this.drawBars(status, ship.heading, aim, screenW, screenH, deniedFlash);
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
