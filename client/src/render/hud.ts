// Telegraph HUD — screen-space instrument readout (hudRoot). Throttle/rudder
// gauges + heading/speed, an HP bar (green→amber→crimson), two gun cooldown
// bars, and a centered respawn overlay while sunk. Geist Mono per DESIGN.md.
// Text strings are diffed before assignment (Pixi re-rasterizes on `.text`).

import { Container, Graphics, Text } from 'pixi.js';
import type { ShipState, WeaponId } from '@salvo/shared';
import { CONFIG, wrapPositive } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';

const GREEN = 0x00ff88;
const AMBER = 0xffb800;
const CRIMSON = 0x8b0000;
const DIM = 0x5a6478;
const PANEL_W = 150;
const PANEL_H = 60;
const MARGIN = 20;
const BAR_W = 150;
const BAR_H = 10;

/** Weapon selector chip labels + reload durations, indexed by WeaponId. */
const WEAPON_LABELS = ['1 GUNS', '2 TORP', '3 MINE'] as const;
const WEAPON_RELOADS = [CONFIG.gun.reload, CONFIG.torpedo.reload, CONFIG.mine.dropCooldown];
const CHIP_GAP = 4;
const CHIP_H = 12;
const CHIP_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 9,
  fill: DIM,
  letterSpacing: 1,
} as const;

const LABEL_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 11,
  fill: DIM,
  letterSpacing: 1.5,
} as const;

const DATA_STYLE = { fontFamily: 'Geist Mono, monospace', fontSize: 18, fill: GREEN } as const;
const OVERLAY_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 24,
  fill: AMBER,
  letterSpacing: 2,
} as const;

/** Own-ship status the HUD renders beyond raw kinematics. */
export interface OwnStatus {
  hp: number;
  cooldowns: number[]; // ms remaining, weapon-indexed
  weapon: WeaponId; // currently-selected weapon (server-echoed)
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
  fontSize: 13,
  fill: AMBER,
  letterSpacing: 2,
} as const;
const STORM_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 12,
  fill: CRIMSON,
  letterSpacing: 2,
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

/**
 * Ready fraction for one weapon slot: reads cooldowns[weapon] against THAT
 * weapon's reload (guns 3s / torpedoes 12s / mines 8s). Pure — the chip drawing
 * and any external HUD both share this per-slot mapping.
 */
export function weaponReadyFraction(cooldowns: number[], weapon: WeaponId): number {
  return cooldownReadyFraction(cooldowns[weapon] ?? 0, WEAPON_RELOADS[weapon]);
}

export class Hud {
  private readonly root = new Container();
  private readonly gauges = new Graphics();
  private readonly bars = new Graphics();
  private readonly headingLabel: Text;
  private readonly speedLabel: Text;
  private readonly overlay: Text;
  private readonly chipLabels: Text[];
  private readonly zoneLine: Text;
  private readonly stormWarn: Text;
  private lastHeading = '';
  private lastSpeed = '';
  private lastOverlay = '';
  private lastZoneLine = '';

  constructor(private readonly hudLayer: Container) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.gauges);
    hudLayer.addChild(this.bars); // screen-space, positioned absolutely
    this.headingLabel = new Text({ text: '', style: DATA_STYLE });
    this.speedLabel = new Text({ text: '', style: DATA_STYLE });
    const hdgCap = new Text({ text: 'HDG', style: LABEL_STYLE });
    const spdCap = new Text({ text: 'KTS', style: LABEL_STYLE });
    this.headingLabel.position.set(0, 14);
    spdCap.position.set(70, 0);
    this.speedLabel.position.set(70, 14);
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
    this.zoneLine = new Text({ text: '', style: ZONE_STYLE });
    this.zoneLine.anchor.set(0.5, 0);
    this.zoneLine.visible = false;
    this.stormWarn = new Text({ text: 'IN STORM', style: STORM_STYLE });
    this.stormWarn.visible = false;
    hudLayer.addChild(this.zoneLine, this.stormWarn);
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

  private drawGauges(axes: Axes): void {
    const g = this.gauges;
    g.clear();
    const tx = PANEL_W;
    const tTop = 0;
    const tBot = 44;
    const tMid = (tTop + tBot) / 2;
    g.moveTo(tx, tTop).lineTo(tx, tBot).stroke({ width: 2, color: DIM, alpha: 0.6 });
    const notchY = tMid - axes.throttle * (tBot - tMid);
    g.rect(tx - 7, notchY - 1.5, 14, 3).fill({ color: GREEN, alpha: 0.9 });
    const ry = 54;
    const rL = tx - 20;
    const rR = tx + 20;
    const rMid = (rL + rR) / 2;
    g.moveTo(rL, ry).lineTo(rR, ry).stroke({ width: 2, color: DIM, alpha: 0.6 });
    const defX = rMid + axes.rudder * (rR - rMid);
    g.rect(defX - 1.5, ry - 6, 3, 12).fill({ color: GREEN, alpha: 0.9 });
  }

  /** HP bar + the 3-weapon selector chip row, anchored bottom-right (screen space). */
  private drawBars(status: OwnStatus, screenW: number, screenH: number): void {
    const g = this.bars;
    g.clear();
    const x = screenW - BAR_W - MARGIN;
    const baseY = screenH - MARGIN - PANEL_H;
    this.drawHp(g, x, baseY, status.hp);
    this.drawWeaponChips(g, status, x, baseY + 18);
  }

  private drawHp(g: Graphics, x: number, y: number, hp: number): void {
    const frac = Math.max(0, Math.min(1, hp / CONFIG.ship.hp));
    g.rect(x, y, BAR_W, BAR_H).fill({ color: 0x111111, alpha: 0.8 });
    g.rect(x, y, BAR_W * frac, BAR_H).fill({ color: hpColor(frac), alpha: 0.95 });
    g.rect(x, y, BAR_W, BAR_H).stroke({ width: 1, color: DIM, alpha: 0.5 });
  }

  /**
   * Three chips [1 GUNS / 2 TORP / 3 MINE]: the selected one is outlined amber;
   * each fills green→dim by its own cooldown from OwnShip.cooldowns[weapon].
   */
  private drawWeaponChips(g: Graphics, status: OwnStatus, x: number, y: number): void {
    const cw = (BAR_W - 2 * CHIP_GAP) / 3;
    for (let i = 0; i < 3; i++) {
      const cx = x + i * (cw + CHIP_GAP);
      const ready = weaponReadyFraction(status.cooldowns, i as WeaponId);
      const selected = i === status.weapon;
      g.rect(cx, y, cw, CHIP_H).fill({ color: 0x111111, alpha: 0.8 });
      g.rect(cx, y, cw * ready, CHIP_H).fill({ color: ready >= 1 ? GREEN : DIM, alpha: 0.85 });
      g.rect(cx, y, cw, CHIP_H).stroke({ width: selected ? 1.5 : 1, color: selected ? AMBER : DIM, alpha: selected ? 0.9 : 0.4 });
      const label = this.chipLabels[i];
      label.position.set(cx + 3, y + CHIP_H + 2);
      label.style.fill = selected ? AMBER : DIM;
    }
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

  /** Update all instruments. Call each render frame. */
  update(ship: ShipState, axes: Axes, status: OwnStatus, zone: ZoneHud, screenW: number, screenH: number): void {
    this.layout(screenH);
    this.drawGauges(axes);
    this.drawBars(status, screenW, screenH);
    this.updateReadouts(ship);
    this.updateOverlay(status, screenW, screenH);
    this.drawZone(zone, screenW, screenH);
  }
}
