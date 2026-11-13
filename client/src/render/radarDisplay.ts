// THE RADAR DISPLAY (Story 11.2, Eric 2026-11-12, rulings R10 / R16 / R19 —
// FIXED, no settings): what a real set draws over its picture, around the OWN
// SHIP —
//   • RANGE RINGS, "style A": thin crisp white, spacing FOLLOWING ZOOM in round
//     hectometers (render/rangeRings.ts `viewRingSpacingHm`), each labelled
//     with its range in hm at the four cardinal points N / S / E / W (world
//     north = up on screen, as the chart is drawn); they stop at the radar
//     reach, which is its own DISTINCT ring (phosphor, heavier);
//   • THE COMPASS (bearing) SCALE — ticks every 5°, longer every 10°, numerals
//     every 30° — on the radar-reach ring when that ring is wholly on screen,
//     otherwise inset at the screen edge like a display's bezel scale
//     (`compassPlacement`);
//   • THE HEADING LINE from the own ship along its bow;
//   • THE SWEEP'S CRISP LINE ("style 3"), on the radar's own beam angle — the
//     afterglow behind it is the radar's baked sprite (render/textures.ts).
// The APPROVED reach bench (client/scripts/reachBench/scope.ts) is the
// reference for every color, weight, alpha and label size (CLIENT_CONFIG.
// radarDisplay).
//
// WORLD-ANCHORED, SCREEN-SIZED. The display lives in the camera-transformed
// `sweep` layer, positioned on the own ship each frame; every stroke width,
// tick length and label is written in screen px ÷ zoom, so it reads the same
// at every zoom. THE PER-FRAME PATH ALLOCATES NOTHING: it moves the root and
// rotates two lines. The rings and their labels rebuild only when the zoom,
// the radar reach, the spacing or the ring count changes; the compass only
// when its placement (mode / stepped radius) or the zoom changes. Text
// objects are pooled and only ever re-texted on a rebuild.
//
// HIDDEN WITH THE SWEEP: no own ship (a spectator, the forceSnap gap), the
// start line, or no sweep sample yet → no display (the rings followed the
// radar's anchor before this story; they still do).

import { Container, Graphics, Text } from 'pixi.js';
import { formatHm, hmToU } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import {
  bearingToAngle,
  compassPlacement,
  compassTicks,
  farCornerU,
  ringCount,
  viewRingSpacingHm,
  type CompassPlacement,
} from './rangeRings.js';

const D = CLIENT_CONFIG.radarDisplay;
const CARDINALS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(bearingToAngle);
const TICKS = compassTicks();

/** One frame's inputs. `own` null hides everything. */
export interface RadarDisplayFrame {
  /** The radar's anchor (the own ship's render pose), world u; null = hidden. */
  own: { x: number; y: number; heading: number } | null;
  /** The radar's beam angle this frame (`Radar.beamAngle`); null = hidden. */
  beam: number | null;
  /** The own ship on screen (px). */
  ownScreen: { x: number; y: number };
  /** Camera zoom, px per u. */
  zoom: number;
  viewW: number;
  viewH: number;
  /** The observer's radar reach (u). */
  radarU: number;
}

function labelStyle(fontPx: number): { fontFamily: string; fontSize: number; fontWeight: '600'; fill: number } {
  return { fontFamily: CLIENT_CONFIG.type.mono, fontSize: fontPx, fontWeight: '600', fill: D.ringColor };
}

/** A pool of Text objects in one container: `take` hands out the next one. */
class TextPool {
  private readonly items: Text[] = [];
  private used = 0;

  constructor(
    private readonly parent: Container,
    private readonly fontPx: number,
  ) {}

  begin(): void {
    this.used = 0;
  }

  take(text: string): Text {
    let t = this.items[this.used];
    if (t === undefined) {
      t = new Text({ text, style: labelStyle(this.fontPx) });
      t.anchor.set(0.5);
      this.parent.addChild(t);
      this.items.push(t);
    } else if (t.text !== text) {
      t.text = text;
    }
    t.visible = true;
    this.used += 1;
    return t;
  }

  /** Hide every Text not handed out since `begin`. */
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
}

export class RadarDisplay {
  readonly root = new Container();
  private readonly rings = new Graphics();
  private readonly labelBoxes = new Graphics();
  private readonly labelLayer = new Container();
  private readonly ringLabels = new TextPool(this.labelLayer, D.labelFontPx);
  private readonly compass = new Graphics();
  private readonly compassLayer = new Container();
  private readonly compassLabels = new TextPool(this.compassLayer, D.compassFontPx);
  private readonly heading = new Graphics();
  private readonly beamLine = new Graphics();
  /** Rebuild keys (NaN = never built). */
  private ringKey = { zoom: NaN, radarU: NaN, stepHm: NaN, count: -1 };
  private compassKey = { zoom: NaN, mode: '', radiusPx: NaN };
  private lineZoom = NaN;
  private lineLenU = NaN;
  private lineRadarU = NaN;

  constructor(layer: Container) {
    this.beamLine.blendMode = 'add';
    this.root.addChild(this.rings, this.heading, this.compass, this.labelBoxes, this.labelLayer, this.compassLayer, this.beamLine);
    this.root.visible = false;
    layer.addChild(this.root);
  }

  /** The ring spacing (hm) of the last build (tests / capture). */
  get spacingHm(): number {
    return this.ringKey.stepHm;
  }

  /** The number of range rings of the last build, the reach ring excluded. */
  get ringsDrawn(): number {
    return this.ringKey.count;
  }

  /** Where the compass scale sat on the last build. */
  get compassMode(): string {
    return this.compassKey.mode;
  }

  update(f: RadarDisplayFrame): void {
    const shown = f.own !== null && f.beam !== null && f.zoom > 0 && Number.isFinite(f.zoom + f.radarU);
    this.root.visible = shown;
    if (!shown || f.own === null || f.beam === null) return;
    this.root.position.set(f.own.x, f.own.y);
    this.syncRings(f);
    this.syncCompass(f);
    this.syncLines(f);
    this.heading.rotation = f.own.heading;
    this.beamLine.rotation = f.beam;
  }

  /** Rebuild the rings + their numerals when zoom, reach, spacing or count moved. */
  private syncRings(f: RadarDisplayFrame): void {
    const stepHm = viewRingSpacingHm(f.viewW, f.viewH, f.zoom);
    const far = farCornerU(f.ownScreen.x, f.ownScreen.y, f.viewW, f.viewH, f.zoom);
    const count = ringCount(stepHm, f.radarU, far);
    const k = this.ringKey;
    if (k.zoom === f.zoom && k.radarU === f.radarU && k.stepHm === stepHm && k.count === count) return;
    this.ringKey = { zoom: f.zoom, radarU: f.radarU, stepHm, count };
    this.buildRings(f.zoom, f.radarU, hmToU(stepHm), count);
  }

  private buildRings(zoom: number, radarU: number, stepU: number, count: number): void {
    const px = 1 / zoom;
    const g = this.rings;
    g.clear();
    this.labelBoxes.clear();
    this.ringLabels.begin();
    for (let i = 1; i <= count; i++) {
      g.circle(0, 0, i * stepU).stroke({ width: D.ringWidthPx * px, color: D.ringColor, alpha: D.ringAlpha });
      this.labelRing(i * stepU, zoom, D.ringColor, D.labelAlpha);
    }
    g.circle(0, 0, radarU).stroke({ width: D.reachWidthPx * px, color: D.reachColor, alpha: D.reachAlpha });
    this.labelRing(radarU, zoom, D.reachColor, D.reachLabelAlpha);
    this.ringLabels.end();
  }

  /** The ring's range in hm at N / S / E / W, each on a void box. */
  private labelRing(rU: number, zoom: number, color: number, alpha: number): void {
    const px = 1 / zoom;
    const text = formatHm(rU); // whole hectometers, the bench's numerals
    for (const a of CARDINALS) {
      const x = Math.cos(a) * rU;
      const y = Math.sin(a) * rU;
      const t = this.ringLabels.take(text);
      t.style.fill = color;
      t.alpha = alpha;
      t.scale.set(px);
      t.position.set(x, y);
      const w = (t.width / t.scale.x + D.labelBoxPadPx) * px;
      const h = D.labelBoxHeightPx * px;
      this.labelBoxes.rect(x - w / 2, y - h / 2, w, h).fill({ color: D.labelBoxColor, alpha: D.labelBoxAlpha });
    }
  }

  /** Rebuild the compass scale when its placement or the zoom moved. */
  private syncCompass(f: RadarDisplayFrame): void {
    const place = compassPlacement(f.ownScreen.x, f.ownScreen.y, f.viewW, f.viewH, f.radarU * f.zoom);
    const k = this.compassKey;
    if (k.zoom === f.zoom && k.mode === place.mode && k.radiusPx === place.radiusPx) return;
    this.compassKey = { zoom: f.zoom, mode: place.mode, radiusPx: place.radiusPx };
    this.buildCompass(place, f.zoom);
  }

  private buildCompass(place: CompassPlacement, zoom: number): void {
    const px = 1 / zoom;
    const r = place.radiusPx * px;
    const g = this.compass;
    g.clear();
    this.compassLabels.begin();
    for (const tick of TICKS) {
      const a = bearingToAngle((tick.deg * Math.PI) / 180);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const len = (tick.long ? D.tickLongPx : D.tickShortPx) * px;
      g.moveTo(c * r, s * r).lineTo(c * (r - len), s * (r - len));
      if (tick.label === null) continue;
      const t = this.compassLabels.take(tick.label);
      t.alpha = D.compassLabelAlpha;
      t.scale.set(px);
      const lr = r - D.compassLabelInsetPx * px;
      t.position.set(c * lr, s * lr);
    }
    g.stroke({ width: D.compassWidthPx * px, color: D.ringColor, alpha: D.compassAlpha });
    this.compassLabels.end();
  }

  /** The heading line (to the screen's far corner) and the beam's crisp line
   *  (to the radar reach), redrawn only when the zoom or a length moved. */
  private syncLines(f: RadarDisplayFrame): void {
    const lenU = Math.hypot(f.viewW, f.viewH) / f.zoom;
    if (this.lineZoom === f.zoom && this.lineLenU === lenU && this.lineRadarU === f.radarU) return;
    this.lineZoom = f.zoom;
    this.lineLenU = lenU;
    this.lineRadarU = f.radarU;
    const px = 1 / f.zoom;
    this.heading
      .clear()
      .moveTo(0, 0)
      .lineTo(lenU, 0)
      .stroke({ width: D.headingWidthPx * px, color: D.ringColor, alpha: D.headingAlpha });
    this.beamLine
      .clear()
      .moveTo(0, 0)
      .lineTo(f.radarU, 0)
      .stroke({ width: D.beamWidthPx * px, color: D.reachColor, alpha: D.beamAlpha, cap: 'round' });
  }
}
