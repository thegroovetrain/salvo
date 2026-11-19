// THE BAR'S ABILITY TILES AND SHIP ROWS (Story 12.3 Part B, AC 31 / 32 / 36 /
// 40; epic-12 amendments 3 / 4).
//
//   ABILITIES  one tile each — HULL REPAIR (C), SMOKE (V), the fitted Shift:
//              line 1 NAME · the tier mark (HULL REPAIR and SMOKE are five-tier
//              ladders; the Shift has none, its slot stays empty) · the key
//              chip; line 2 a refill bar with READY or the seconds at its right
//              end — ONE fixed bar and readout slot in every state (Eric
//              2026-11-19: the bar NEVER changes size). The ACTIVE (Shift
//              window) outline breathes as today.
//   SHIP       one row per index — ARMOR · POWER · RELOAD · ENGINES · INTEL:
//              the name, the 100-point index value, the tier mark in the same
//              column as every tile's, an EMPTY chip slot. A hovered ship-stat
//              card turns the value amber `new▲`, the numeral amber `IV▲` and
//              outlines the next dot amber — no box.

import { BlurFilter, Container, Graphics, type Text } from 'pixi.js';
import { INDEX_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import type { MotionLevel } from '../../settings/store.js';
import { indexWord } from '../../ui/boonCopy.js';
import { drawBox, drawChip, drawRefill, drawTierMark, monoText, place, setFill } from './barDraw.js';
import { HOVER_WASH, abilitySkin, indexValueText, tierMarkModel } from './skins.js';
import type { AbilityTileRect, ShipRowRect } from './layout.js';
import { READOUT_KEY, type AbilityModel, type PreviewMarks, type Readout } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const T = K.type;

export interface AbilityTilesView {
  abilities: readonly AbilityModel[];
  preview: PreviewMarks | null;
  previewAbility: AbilityModel['kind'] | null;
  hoverAbility: AbilityModel['kind'] | null;
  denied: readonly boolean[];
  motion: MotionLevel;
  breath: number;
  uiScale: number;
}

interface AbilityTexts {
  name: Text;
  tier: Text;
  state: Text;
  chip: Text;
}

/** Pure: an ability tile's state text — READY, or the seconds (cooling, or
 *  the Shift window's time left). Its slot is fixed (layout.ts `refillRect`):
 *  a hovered C / V card's new cooldown shows in the flyout, never here, so
 *  the readout never outgrows its slot. */
export function abilityStateText(ab: AbilityModel): string {
  return ab.stateWord === '' ? ab.numeral : ab.stateWord;
}

/** Pure: the tier mark an ability tile carries (none for the Shift). */
function abilityMark(ab: AbilityModel, preview: PreviewMarks | null): ReturnType<typeof tierMarkModel> {
  if (ab.kind === 'shift') return null;
  return tierMarkModel(ab.tier, preview?.get(READOUT_KEY.abilityTier(ab.kind)));
}

export class AbilityTiles {
  readonly root = new Container();
  private readonly glow = new Graphics();
  private readonly gfx = new Graphics();
  private readonly texts: AbilityTexts[] = [];

  constructor() {
    const blur = new BlurFilter({ strength: K.glowBlurPx, quality: 4 });
    blur.padding = K.glowBlurPx * 2;
    this.glow.filters = [blur];
    this.root.addChild(this.glow, this.gfx);
  }

  update(view: AbilityTilesView, tiles: readonly AbilityTileRect[]): void {
    this.gfx.clear();
    this.glow.clear();
    tiles.forEach((rect, i) => {
      const ab = view.abilities[i];
      if (ab !== undefined) this.drawTile(ab, rect, i, view);
    });
  }

  private textsAt(i: number): AbilityTexts {
    while (this.texts.length <= i) {
      const at: AbilityTexts = {
        name: monoText(T.name, '600', C.textPrimary),
        tier: monoText(T.tier, '600', C.phosphor, 1),
        state: monoText(T.state, '600', C.phosphor, 1),
        chip: monoText(T.keyChip, '600', C.phosphor, 0.5),
      };
      this.root.addChild(at.name, at.tier, at.state, at.chip);
      this.texts.push(at);
    }
    return this.texts[i];
  }

  private drawTile(ab: AbilityModel, r: AbilityTileRect, i: number, v: AbilityTilesView): void {
    const at = this.textsAt(i);
    const denied = v.denied[i] === true;
    const skin = abilitySkin(ab.state, denied, v.motion, v.breath, v.previewAbility === ab.kind);
    drawBox(this.gfx, this.glow, r, skin, v.hoverAbility === ab.kind ? HOVER_WASH : 0);
    const cy = r.line1.y + r.line1.h / 2;
    place(at.name, ab.name, r.line1.x, cy, v.uiScale);
    drawTierMark(this.gfx, at.tier, r.tierMark, abilityMark(ab, v.preview), v.uiScale);
    drawChip(this.gfx, at.chip, ab.keyGlyph, r.chipSlot.x + r.chipSlot.w, cy, { armed: false, denied, uiScale: v.uiScale });
    drawRefill(this.gfx, at.state, r.refill, ab.progress, ab.state !== 'cooling', abilityStateText(ab), v.uiScale);
  }
}

// --- the ship rows -------------------------------------------------------------------

const INDEX_KEYS: readonly string[] = INDEX_IDS.map((id) => READOUT_KEY.index(id));
const HELD_KEYS: readonly string[] = INDEX_IDS.map((id) => READOUT_KEY.held(id));

/** Pure: a ship row's index value and held tier off the readouts. */
export function indexAt(readouts: readonly Readout[], i: number): { value: number; held: number } {
  const value = readouts.find((r) => r.key === INDEX_KEYS[i])?.raw ?? 0;
  const held = readouts.find((r) => r.key === HELD_KEYS[i])?.raw ?? 0;
  return { value, held };
}

export class ShipRows {
  readonly root = new Container();
  private readonly gfx = new Graphics();
  private readonly labels: Text[];
  private readonly values: Text[];
  private readonly tiers: Text[];

  constructor() {
    this.labels = INDEX_IDS.map(() => monoText(T.statLabel, '400', C.textSecondary));
    INDEX_IDS.forEach((id, i) => {
      this.labels[i].text = indexWord(id);
    });
    this.values = INDEX_IDS.map(() => monoText(T.indexValue, '600', C.phosphor));
    this.tiers = INDEX_IDS.map(() => monoText(T.tier, '600', C.phosphor, 1));
    this.root.addChild(this.gfx, ...this.labels, ...this.values, ...this.tiers);
  }

  update(readouts: readonly Readout[], preview: PreviewMarks | null, rows: readonly ShipRowRect[], uiScale: number): void {
    this.gfx.clear();
    rows.forEach((row, i) => {
      const { value, held } = indexAt(readouts, i);
      const cy = row.y + row.h / 2;
      this.labels[i].position.set(row.label.x, cy);
      const mark = preview?.get(INDEX_KEYS[i]);
      setFill(this.values[i], mark === undefined ? C.phosphor : C.amber);
      place(this.values[i], indexValueText(value, mark), row.value.x, cy, uiScale);
      drawTierMark(this.gfx, this.tiers[i], row.tierMark, tierMarkModel(held, preview?.get(HELD_KEYS[i])), uiScale);
    });
  }

  /** The value text a row prints (test seam). */
  valueText(i: number): string {
    return this.values[i].text;
  }

  valueColor(i: number): number {
    return this.values[i].style.fill as number;
  }

  /** The tier numeral a row prints (test seam). */
  tierText(i: number): string {
    return this.tiers[i].visible ? this.tiers[i].text : '';
  }
}
