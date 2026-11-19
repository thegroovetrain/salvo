// THE BAR'S ABILITY TILES AND SHIP ROWS (Story 12.3 Part B, AC 31 / 32 / 36).
//
//   ABILITIES  one tile each — HULL REPAIR (C), SMOKE (V), the fitted Shift:
//              NAME · READY or the seconds · key chip, and a thin progress
//              line along the bottom while cooling. The ACTIVE (Shift window)
//              outline breathes as today. A hovered HULL REPAIR / SMOKE card
//              prints its incoming cooldown amber in place of the word.
//   SHIP       one row per index — ARMOR · POWER · RELOAD · ENGINES · INTEL:
//              the name, the 100-point index value BETWEEN the name and the
//              five pips, the tier ladder. A hovered ship-stat card turns the
//              value amber `new▲` and outlines the new pip amber — no box.

import { BlurFilter, Container, Graphics, type Text } from 'pixi.js';
import { INDEX_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import type { MotionLevel } from '../../settings/store.js';
import { indexWord } from '../../ui/boonCopy.js';
import { drawBox, drawChip, monoText, place, setFill } from './barDraw.js';
import { HOVER_WASH, abilitySkin, indexValueText, markedValue } from './skins.js';
import type { AbilityTileRect, Rect, ShipRowRect } from './layout.js';
import { READOUT_KEY, type AbilityModel, type PreviewMarks, type Readout } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const B = K.bar;
const T = K.type;

/** An empty pip's outline alpha (the bench's .7). */
const PIP_EDGE = 0.7;
/** The amber preview pip's glow alpha. */
const PIP_GLOW = 0.6;

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
  state: Text;
  chip: Text;
}

/** Pure: an ability tile's state text and colour — READY, the seconds, or
 *  under a hovered C / V card its incoming cooldown (amber). */
export function abilityStateText(ab: AbilityModel, preview: PreviewMarks | null): { text: string; color: number } {
  const mark = ab.kind === 'shift' ? undefined : preview?.get(READOUT_KEY.cooldown(ab.kind));
  const word = markedValue(ab.stateWord === '' ? ab.numeral : ab.stateWord, mark);
  if (word.amber) return { text: word.text, color: C.amber };
  return { text: word.text, color: ab.state === 'ready' ? C.phosphor : C.textPrimary };
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
        state: monoText(T.state, '600', C.phosphor, 1),
        chip: monoText(T.keyChip, '600', C.phosphor, 0.5),
      };
      this.root.addChild(at.name, at.state, at.chip);
      this.texts.push(at);
    }
    return this.texts[i];
  }

  private drawTile(ab: AbilityModel, r: AbilityTileRect, i: number, v: AbilityTilesView): void {
    const at = this.textsAt(i);
    const denied = v.denied[i] === true;
    const skin = abilitySkin(ab.state, denied, v.motion, v.breath, v.previewAbility === ab.kind);
    drawBox(this.gfx, this.glow, r, skin, v.hoverAbility === ab.kind ? HOVER_WASH : 0);
    const l = r.line1;
    const cy = l.y + l.h / 2;
    place(at.name, ab.name, l.x, cy, v.uiScale);
    const chipX = drawChip(this.gfx, at.chip, ab.keyGlyph, l.x + l.w, cy, { armed: false, denied, uiScale: v.uiScale });
    const state = abilityStateText(ab, v.preview);
    setFill(at.state, state.color);
    place(at.state, state.text, chipX - B.tierGap, cy, v.uiScale);
    this.drawProgress(ab, r.progress);
  }

  /** The thin progress line along the tile's bottom while cooling. */
  private drawProgress(ab: AbilityModel, p: Rect): void {
    if (ab.state !== 'cooling') return;
    this.gfx.rect(p.x, p.y, p.w, p.h).fill({ color: C.hairline, alpha: 1 });
    const f = Math.min(1, Math.max(0, ab.progress));
    if (f > 0) this.gfx.rect(p.x, p.y, p.w * f, p.h).fill({ color: C.phosphor, alpha: 1 });
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

/** Pure: one pip's look — held (filled), preview (the amber outline a hovered
 *  card would fill), or empty. */
export function pipState(k: number, held: number, next: number): 'held' | 'preview' | 'empty' {
  if (k < held) return 'held';
  return k < next ? 'preview' : 'empty';
}

export class ShipRows {
  readonly root = new Container();
  private readonly gfx = new Graphics();
  private readonly labels: Text[];
  private readonly values: Text[];

  constructor() {
    this.labels = INDEX_IDS.map(() => monoText(T.statLabel, '400', C.textSecondary));
    INDEX_IDS.forEach((id, i) => {
      this.labels[i].text = indexWord(id);
    });
    this.values = INDEX_IDS.map(() => monoText(T.indexValue, '600', C.phosphor));
    this.root.addChild(this.gfx, ...this.labels, ...this.values);
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
      const next = preview?.get(HELD_KEYS[i])?.raw ?? held;
      row.bars.forEach((b, k) => this.drawPip(b, pipState(k, held, next)));
    });
  }

  private drawPip(b: Rect, state: 'held' | 'preview' | 'empty'): void {
    const g = this.gfx;
    if (state === 'held') {
      g.rect(b.x, b.y, b.w, b.h).fill({ color: C.phosphor, alpha: 1 });
      return;
    }
    if (state === 'preview') g.rect(b.x - 2, b.y - 2, b.w + 4, b.h + 4).fill({ color: C.amber, alpha: PIP_GLOW * 0.25 });
    const color = state === 'preview' ? C.amber : C.silver;
    g.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1).stroke({ width: K.lineW, color, alpha: state === 'preview' ? 1 : PIP_EDGE });
  }

  /** The value text a row prints (test seam). */
  valueText(i: number): string {
    return this.values[i].text;
  }

  valueColor(i: number): number {
    return this.values[i].style.fill as number;
  }
}
