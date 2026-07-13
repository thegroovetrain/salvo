// Telegraph HUD — screen-space instrument readout (hudRoot). Shows throttle
// notch, rudder deflection, heading, and speed so the driver can read the
// ship's state at a glance. Geist Mono per DESIGN.md (Label/Data). Text strings
// are diffed before assignment because Pixi re-rasterizes on every `.text` write.

import { Container, Graphics, Text } from 'pixi.js';
import type { ShipState } from '@salvo/shared';
import { wrapPositive } from '@salvo/shared';
import type { Axes } from '../input/keyboard.js';

const GREEN = 0x00ff88;
const DIM = 0x5a6478;
const PANEL_W = 150;
const PANEL_H = 60;
const MARGIN = 20;

const LABEL_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 11,
  fill: DIM,
  letterSpacing: 1.5,
} as const;

const DATA_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 18,
  fill: GREEN,
} as const;

function pad3(n: number): string {
  return Math.round(n).toString().padStart(3, '0');
}

export class Hud {
  private readonly root = new Container();
  private readonly gauges = new Graphics();
  private readonly headingLabel: Text;
  private readonly speedLabel: Text;
  private lastHeading = '';
  private lastSpeed = '';

  constructor(hudLayer: Container) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.gauges);
    this.headingLabel = new Text({ text: '', style: DATA_STYLE });
    this.speedLabel = new Text({ text: '', style: DATA_STYLE });
    const hdgCap = new Text({ text: 'HDG', style: LABEL_STYLE });
    const spdCap = new Text({ text: 'KTS', style: LABEL_STYLE });
    hdgCap.position.set(0, 0);
    this.headingLabel.position.set(0, 14);
    spdCap.position.set(70, 0);
    this.speedLabel.position.set(70, 14);
    this.root.addChild(hdgCap, this.headingLabel, spdCap, this.speedLabel);
  }

  /** Reposition the panel for the current viewport (bottom-left). */
  private layout(screenH: number): void {
    this.root.position.set(MARGIN, screenH - PANEL_H - MARGIN);
  }

  /** Draw the throttle notch (vertical) + rudder deflection (horizontal). */
  private drawGauges(axes: Axes): void {
    const g = this.gauges;
    g.clear();
    // Throttle: vertical track at x=150, notch slides -1..1 (bottom..top).
    const tx = PANEL_W;
    const tTop = 0;
    const tBot = 44;
    const tMid = (tTop + tBot) / 2;
    g.moveTo(tx, tTop).lineTo(tx, tBot).stroke({ width: 2, color: DIM, alpha: 0.6 });
    const notchY = tMid - axes.throttle * (tBot - tMid);
    g.rect(tx - 7, notchY - 1.5, 14, 3).fill({ color: GREEN, alpha: 0.9 });
    // Rudder: horizontal track under the throttle, deflection -1..1.
    const ry = 54;
    const rL = tx - 20;
    const rR = tx + 20;
    const rMid = (rL + rR) / 2;
    g.moveTo(rL, ry).lineTo(rR, ry).stroke({ width: 2, color: DIM, alpha: 0.6 });
    const defX = rMid + axes.rudder * (rR - rMid);
    g.rect(defX - 1.5, ry - 6, 3, 12).fill({ color: GREEN, alpha: 0.9 });
  }

  /** Update all instruments. Call each render frame. */
  update(ship: ShipState, axes: Axes, _screenW: number, screenH: number): void {
    this.layout(screenH);
    this.drawGauges(axes);

    const hdgDeg = (wrapPositive(ship.heading) * 180) / Math.PI;
    const hdg = pad3(hdgDeg);
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
}
