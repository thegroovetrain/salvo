// THE HUD BAR (Story 12.3 Part B, AC 27–33 / 36; epic-12 amendment 3; the
// approved bench v2) — ONE vertical Pixi surface on the left or right edge,
// replacing Story 10.10's ship and weapons consoles. Top to bottom, each
// section on its own bed:
//
//   WEAPONS    five tiles (barWeapons.ts)
//   ABILITIES  C · V · Shift (barShip.ts)
//   SHIP       the five index rows (barShip.ts)
//   footer     HULL · THROTTLE · LEVEL (barGauges.ts), pinned to the bottom
//
// It lives on `stage.layers.hud` (UI-scaled with every HUD surface), the same
// tech as the consoles it replaced: the canvas draws it, and presses / hovers
// route by the spine's rects (layout.ts `consoleHit` / `barHover`), never Pixi
// interaction. The weapon / ability stats are NOT drawn here — they open in
// the DOM flyout beside the bar on hover (ui/hudFlyout.ts).
//
// Shown while the player cons a hull (the held start line and the sinking
// window included); hidden at FOUNDER, spectate and port. At the held start
// line the weapons and abilities dim (keys AND clicks off), the ship rows and
// gauges do not.

import { Container, Graphics, type Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../../config.js';
import type { MotionLevel } from '../../settings/store.js';
import { AbilityTiles, ShipRows, type AbilityTilesView } from './barShip.js';
import { Gauges, type GaugesView } from './barGauges.js';
import { WeaponTiles, type WeaponTilesView } from './barWeapons.js';
import { monoTextWidth } from '../../util/monoMeasure.js';
import { drawBed, monoText } from './barDraw.js';
import { advanceBreath, breathAt } from './skins.js';
import type { PreviewTarget } from './flyout.js';
import type { BarHover, BarLayout, Rect } from './layout.js';
import type { AbilityModel, PreviewMarks, Readout, WeaponRowModel } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const T = K.type;

/** The three section heads (the approved bench's words). */
const HEADS = ['WEAPONS', 'ABILITIES', 'SHIP'] as const;
/** The head register's tracking (the bench's `.sechead`, .18em). */
const HEAD_TRACKING = T.head * 0.18;
/** The gap between a head's word and its hairline rule (the bench's 8 px). */
const HEAD_RULE_GAP = 8;

/** Everything the bar reads for one frame. */
export interface HudBarView extends GaugesView {
  rows: readonly WeaponRowModel[];
  abilities: readonly AbilityModel[];
  /** This frame's readouts (`consoleReadouts`) — the index values, the held
   *  tiers and the mount counts. Pass the SAME array while nothing changed. */
  readouts: readonly Readout[];
  /** The hovered offer card's marks, or null (AC 36). */
  preview: PreviewMarks | null;
  /** The tile those marks point at (`previewTarget`), or null. */
  previewTarget: PreviewTarget | null;
  /** The tile under the pointer, or null (the hover wash). */
  hover: BarHover | null;
  /** The hull's turret count (MAIN BATTERY's fixed shells). */
  turrets: number;
  denied: { rows: readonly boolean[]; abilities: readonly boolean[] };
  motion: MotionLevel;
  /** The held start line: the weapons and abilities dim. */
  dim: boolean;
}

/** Pure: the weapon tiles' slice of the bar's frame. */
function weaponTilesView(v: HudBarView): WeaponTilesView {
  const t = v.previewTarget;
  return {
    rows: v.rows,
    readouts: v.readouts,
    preview: v.preview,
    previewRow: t?.kind === 'row' ? t.row : null,
    hoverRow: v.hover?.kind === 'weapon' ? v.hover.row : null,
    turrets: v.turrets,
    denied: v.denied.rows,
    motion: v.motion,
    uiScale: v.uiScale,
  };
}

/** Pure: the ability tiles' slice of the bar's frame. */
function abilityTilesView(v: HudBarView, breath: number): AbilityTilesView {
  const t = v.previewTarget;
  return {
    abilities: v.abilities,
    preview: v.preview,
    previewAbility: t?.kind === 'ability' ? t.ability : null,
    hoverAbility: v.hover?.kind === 'ability' ? v.hover.ability : null,
    denied: v.denied.abilities,
    motion: v.motion,
    breath,
    uiScale: v.uiScale,
  };
}

export class HudBar {
  private readonly root = new Container();
  private readonly beds = new Graphics();
  private readonly heads: Text[];
  private readonly headRules = new Graphics();
  private readonly controls = new Container();
  private readonly weapons = new WeaponTiles();
  private readonly abilityTiles = new AbilityTiles();
  private readonly shipRows = new ShipRows();
  private readonly gauges = new Gauges();
  private layout: BarLayout | null = null;
  private breathPhase = 0;
  private lastBreathSec: number | null = null;

  constructor(parent: Container) {
    this.heads = HEADS.map((h) => {
      const t = monoText(T.head, '400', C.textMuted, 0, HEAD_TRACKING);
      t.text = h;
      return t;
    });
    this.controls.addChild(this.weapons.root, this.abilityTiles.root);
    this.root.addChild(this.beds, this.headRules, ...this.heads, this.controls, this.shipRows.root, this.gauges.root);
    this.root.visible = false;
    parent.addChild(this.root);
  }

  /** One frame. `layout` is the spine's bar — pass the SAME object until the
   *  viewport or the side changes. */
  update(v: HudBarView, layout: BarLayout): void {
    this.root.visible = true;
    if (layout !== this.layout) this.relayout(layout);
    this.layout = layout;
    this.controls.alpha = v.dim ? K.dimAlpha : 1;
    this.weapons.update(weaponTilesView(v), layout.weapons.tiles);
    this.abilityTiles.update(abilityTilesView(v, breathAt(this.stepBreath(v.nowSec), v.motion)), layout.abilities.tiles);
    this.shipRows.update(v.readouts, v.preview, layout.ship.rows, v.uiScale);
    this.gauges.update(v, layout.footer);
  }

  /** The beds and the section heads (with the hairline rule after each). */
  private relayout(l: BarLayout): void {
    this.beds.clear();
    for (const r of [l.weapons.bed, l.abilities.bed, l.ship.bed, l.footer.bed]) drawBed(this.beds, r);
    this.headRules.clear();
    [l.weapons.head, l.abilities.head, l.ship.head].forEach((h, i) => this.placeHead(this.heads[i], h));
  }

  private placeHead(t: Text, h: Rect): void {
    const cy = h.y + h.h / 2;
    t.position.set(h.x, cy);
    const x = h.x + monoTextWidth(t.text, T.head, HEAD_TRACKING) + HEAD_RULE_GAP;
    if (x < h.x + h.w) this.headRules.rect(x, cy, h.x + h.w - x, K.lineW).fill({ color: C.hairline, alpha: 1 });
  }

  private stepBreath(nowSec: number): number {
    const dt = this.lastBreathSec === null || !Number.isFinite(nowSec) ? 0 : nowSec - this.lastBreathSec;
    if (Number.isFinite(nowSec)) this.lastBreathSec = nowSec;
    this.breathPhase = advanceBreath(this.breathPhase, dt);
    return this.breathPhase;
  }

  /** Gone (founder, spectate, reveal, port): hidden, the breaths start cold. */
  hide(): void {
    this.root.visible = false;
    this.gauges.reset();
    this.breathPhase = 0;
    this.lastBreathSec = null;
  }

  /** A transient frame gap (the forceSnap pose gap): hidden, every breathing
   *  state kept. */
  hideTransient(): void {
    this.root.visible = false;
  }

  // --- test / debug seams -------------------------------------------------------

  get visible(): boolean {
    return this.root.visible;
  }

  get controlsAlpha(): number {
    return this.controls.alpha;
  }

  get hullText(): string {
    return this.gauges.hullText;
  }

  get hullFillAlpha(): number {
    return this.gauges.hullFillAlpha;
  }

  get throttleWord(): string {
    return this.gauges.throttleWord;
  }

  get chipAlpha(): number {
    return this.gauges.chipAlpha;
  }

  get chipVisible(): boolean {
    return this.gauges.chipVisible;
  }

  indexValueText(i: number): string {
    return this.shipRows.valueText(i);
  }

  indexValueColor(i: number): number {
    return this.shipRows.valueColor(i);
  }

  /** The layout last drawn (null before the first frame). */
  get drawnLayout(): BarLayout | null {
    return this.layout;
  }
}
