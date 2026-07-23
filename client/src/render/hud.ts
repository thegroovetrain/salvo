// Telegraph HUD — screen-space instrument readout (hudRoot). Throttle/rudder
// gauges + heading/speed, an HP bar (green→amber→crimson), the LOADOUT-driven
// chip row (labels/grammar from the own loadout — 1-charge equipment reads as
// a pure cooldown, pooled weapons as segments + a reload line; PRIMED /
// boost-active outlined), and a centered respawn overlay while sunk. Geist
// Mono per DESIGN.md. Text strings are diffed before assignment (Pixi
// re-rasterizes on `.text`). Epic 2 rebuilds the hotbar — this stays minimal.

import { Container, Graphics, Text } from 'pixi.js';
import type { EffectiveStats, ShipState, EquipmentId, ShipClassId, WeaponAmmo } from '@salvo/shared';
import {
  EQUIPMENT_IS_WEAPON,
  SLOT_COUNT,
  boostedKinematics,
  equipmentMaxAmmo,
  equipmentReloadMs,
  wrapPositive,
} from '@salvo/shared';

/** Kinematics subset the speed ladder needs (ahead/astern denominators). */
interface LadderKin {
  maxSpeed: number;
  reverseSpeed: number;
}
import type { Axes } from '../input/keyboard.js';
import type { MatchUx } from '../ui/phase.js';

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
export function speedLadderFraction(speed: number, kin: LadderKin): number {
  const denom = speed >= 0 ? kin.maxSpeed : kin.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

/** Chip label text per equipment id (Story 1.6: the row is LOADOUT-driven —
 *  labels come from the own loadout, not a hardcoded gun/torpedo/mine trio). */
const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  gun: 'GUNS',
  torpedo: 'TORP',
  mine: 'MINE',
  speedBoost: 'BOOST',
  cannon: 'CANNON', // Story 1.7: the Battleship's long-range burst skillshot
  starShells: 'FLARE', // Story 1.7: the Battleship's lit-zone star shell
  decoyBuoy: 'DECOY', // Story 1.8: the Mine Layer's radar-double buoy ability
};

/** Pure: one chip's label — "1 GUNS", "3 BOOST", … (key hint = slot index + 1). */
export function chipLabel(slot: number, id: EquipmentId): string {
  return `${slot + 1} ${EQUIPMENT_LABEL[id]}`;
}

/**
 * Pure: does this equipment's chip use the cooldown-sweep grammar (vs the
 * segmented ammo pool)? Keyed on EQUIPMENT IDENTITY, never on pool size and NOT
 * on the weapon/ability flag: the gun's single shot, the cannon and star shells
 * (1-round long-cooldown gun-style skillshots, Story 1.7 — no ammo grant grows
 * them), and the pure-cooldown abilities (speedBoost, and Story 1.8's decoyBuoy)
 * all read as cooldowns, while the GROWABLE pools — torpedo AND mine — keep the
 * segmented-pool + reload-line grammar even at maxAmmo 1. A 1-fish tube (and a
 * 1-mine pool) is still a pool, and it grows mid-match on an ammo grant
 * (torpedoAmmo / mineAmmo) without the chip flipping vocabulary. Note mine is now
 * an instant ability (Story 1.8) yet KEEPS segmented grammar — the grammar can't
 * follow EQUIPMENT_IS_WEAPON, so it is a bare id list.
 */
export function chipUsesCooldownGrammar(id: EquipmentId): boolean {
  return id !== 'torpedo' && id !== 'mine';
}
const CHIP_GAP = 6;
const CHIP_H = 20;
const SEG_GAP = 1; // px between ammo segments within a chip
const CHIP_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 14,
  fill: DIM,
  letterSpacing: 1,
} as const;

const LABEL_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 14,
  fill: DIM,
  letterSpacing: 1.5,
} as const;

const DATA_STYLE = { fontFamily: 'Geist Mono, monospace', fontSize: 28, fill: GREEN } as const;
// Banked-points prompt — amber (an action is available), above the chip cluster.
const PTS_STYLE = {
  fontFamily: 'Geist Mono, monospace',
  fontSize: 16,
  fill: AMBER,
  letterSpacing: 2,
} as const;
const OVERLAY_STYLE = {
  fontFamily: 'Geist Mono, monospace',
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
  pts: number; // banked upgrade points (drives the "PTS ×N — CTRL" prompt)
  /** Cached effectiveStats(cls, upg) — ALL HUD denominators (max hp, speed
   *  ladder, ammo pool sizes, reload durations) read from here (Stage D). */
  stats: EffectiveStats;
  /** Slot-aligned equipment ids of the OWN loadout (loadoutFor(you.cls) —
   *  Story 1.6): drives chip labels + per-chip grammar; null = empty slot
   *  (no chip drawn). Ammo VALUES still come from the server via `ammo`. */
  loadout: readonly (EquipmentId | null)[];
  /** The own speed boost is currently active (serverNow < boostUntil estimate):
   *  drives the boost chip's active outline and the boosted speed-needle cap. */
  boostActive: boolean;
}

/** Pure: the banked-points prompt above the weapon chips ('' hides it at 0). */
export function pointsLine(n: number): string {
  return n <= 0 ? '' : `PTS ×${n} — CTRL`;
}

/** View model for one ammo chip: pool count, pool size, reload progress [0,1]. */
export interface AmmoChipView {
  n: number;
  max: number;
  reloadFrac: number;
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

/** Weapon-chip border color + alpha: dim/idle, amber/primed, red/denied-flash. */
function chipTint(primed: boolean, flash: boolean): { border: number; alpha: number } {
  if (flash) return { border: DENIED_RED, alpha: 1 };
  if (primed) return { border: AMBER, alpha: 0.9 };
  return { border: DIM, alpha: 0.4 };
}

export class Hud {
  private readonly root = new Container();
  private readonly gauges = new Graphics();
  private readonly bars = new Graphics();
  private readonly headingLabel: Text;
  private readonly speedLabel: Text;
  private readonly overlay: Text;
  private readonly ptsLabel: Text;
  private readonly chipLabels: Text[];
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
  /** Per-slot chip label text guard (Pixi re-rasterizes on `.text`). */
  private readonly lastChipLabels: string[] = [];

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
    // One label per loadout slot (SLOT_COUNT); the text is LOADOUT-driven and
    // assigned (diffed) in drawWeaponChips — unfitted slots stay hidden.
    this.chipLabels = Array.from({ length: SLOT_COUNT }, () => {
      const label = new Text({ text: '', style: CHIP_STYLE });
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
    if (!visible) this.ptsLabel.visible = false; // spectate: no prompt (update() re-shows it when alive)
  }

  /** Amber "PTS ×N — CTRL" prompt above the bottom-right chip cluster (hidden at 0). */
  private updatePoints(status: OwnStatus, screenW: number, screenH: number): void {
    const line = pointsLine(status.pts);
    if (line !== this.lastPtsLine) {
      this.ptsLabel.text = line;
      this.lastPtsLine = line;
    }
    this.ptsLabel.visible = line !== '';
    const x = screenW - BAR_W - MARGIN;
    const baseY = screenH - MARGIN - PANEL_H;
    this.ptsLabel.position.set(x, baseY - 24);
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
        this.rungLabels[i].style.fill = i === index ? GREEN : DIM;
      }
      this.lastDetent = index;
    }
    const sig = `${index}|${axes.rudder}|${speed.toFixed(1)}|${kin.maxSpeed}|${kin.reverseSpeed}`;
    if (sig === this.lastGaugeSig) return;
    this.lastGaugeSig = sig;
    this.drawTelegraph(index, axes.rudder, speed, kin);
  }

  /** HP bar + the loadout chip row, anchored bottom-right (screen space). */
  private drawBars(status: OwnStatus, screenW: number, screenH: number, deniedFlash: boolean, abilityFlash: readonly boolean[]): void {
    const g = this.bars;
    g.clear();
    const x = screenW - BAR_W - MARGIN;
    const baseY = screenH - MARGIN - PANEL_H;
    this.drawHp(g, x, baseY, status.hp, status.stats.maxHp);
    this.drawWeaponChips(g, status, x, baseY + BAR_H + 12, deniedFlash, abilityFlash);
  }

  private drawHp(g: Graphics, x: number, y: number, hp: number, maxHp: number): void {
    const frac = Math.max(0, Math.min(1, hp / maxHp));
    g.rect(x, y, BAR_W, BAR_H).fill({ color: 0x111111, alpha: 0.8 });
    g.rect(x, y, BAR_W * frac, BAR_H).fill({ color: hpColor(frac), alpha: 0.95 });
    g.rect(x, y, BAR_W, BAR_H).stroke({ width: 1, color: DIM, alpha: 0.5 });
  }

  /**
   * The LOADOUT-driven chip row (Story 1.6): one chip per fitted slot of the
   * own loadout (TB: [1 GUNS / 2 TORP / 3 BOOST], BB/ML: [1 GUNS / 2 TORP /
   * 3 MINE]). The gun and abilities (boost) render the pure cooldown-sweep
   * grammar; WEAPON pools (torpedo/mine) render segmented ammo + a reload
   * line — keyed on equipment identity, never on pool size (a 1-fish tube is
   * still a segmented pool). The PRIMED slot is outlined amber
   * (gun when nothing is primed); an ABILITY chip borrows that SAME
   * primed-amber outline while its window is active — interim vocabulary, the
   * full hotbar grammar is Epic 2 Story 2.2. `deniedFlash` briefly reddens the
   * primed chip (denied fire click); `abilityFlash` is PER-SLOT (an ML now fits
   * TWO ability slots — mine + decoyBuoy — so a denied mine press must not flash
   * the decoy chip) and reddens exactly the denied slot's chip: a
   * predicted-denied ability press, or — Story 1.10 — an unmatched SERVER
   * denial on ANY slot (weapon chips included). Denominators are the EFFECTIVE pool
   * sizes/reloads from status.stats via equipmentMaxAmmo/equipmentReloadMs.
   */
  private drawWeaponChips(g: Graphics, status: OwnStatus, x: number, y: number, deniedFlash: boolean, abilityFlash: readonly boolean[]): void {
    const fitted: number[] = [];
    for (let i = 0; i < status.loadout.length; i++) {
      if (status.loadout[i] !== null) fitted.push(i);
    }
    const cw = (BAR_W - (fitted.length - 1) * CHIP_GAP) / fitted.length;
    for (let k = 0; k < fitted.length; k++) {
      this.drawOneChip(g, status, fitted[k], k, x + k * (cw + CHIP_GAP), y, cw, deniedFlash, abilityFlash);
    }
    for (let k = fitted.length; k < this.chipLabels.length; k++) this.chipLabels[k].visible = false;
  }

  /** One fitted slot's chip: fill grammar + tinted border + (diffed) label. */
  private drawOneChip(g: Graphics, status: OwnStatus, slot: number, k: number, cx: number, y: number, cw: number, deniedFlash: boolean, abilityFlash: readonly boolean[]): void {
    const id = status.loadout[slot] as EquipmentId; // caller iterates fitted slots only
    const isAbility = !EQUIPMENT_IS_WEAPON[id];
    const a = status.ammo[slot] ?? { n: 0, reloadMsLeft: 0 };
    const reloadFrac = reloadFraction(a.reloadMsLeft, equipmentReloadMs(status.stats, id));
    g.rect(cx, y, cw, CHIP_H).fill({ color: 0x111111, alpha: 0.8 });
    // Grammar keyed on equipment IDENTITY (gun/ability = cooldown sweep,
    // weapon pools = segments) — never on pool size (see chipUsesCooldownGrammar).
    if (chipUsesCooldownGrammar(id)) this.drawCooldownChip(g, a.n > 0, reloadFrac, cx, y, cw);
    else this.drawAmmoChip(g, { n: a.n, max: equipmentMaxAmmo(status.stats, id), reloadFrac }, cx, y, cw);
    const primed = slot === status.primedSlot;
    // Active-window "on" indicator = the primed-amber outline (interim — Epic 2
    // Story 2.2 owns the real hotbar active grammar).
    const outlined = primed || (isAbility && status.boostActive);
    // Per-slot denial flash applies to ANY slot (Story 1.10: an unmatched
    // SERVER denial flashes the exact denied slot's chip, weapon or ability);
    // the predicted weapon-click flash keeps riding the primed chip.
    const flash = (abilityFlash[slot] ?? false) || (!isAbility && primed && deniedFlash);
    const label = this.chipLabels[k];
    const text = chipLabel(slot, id);
    if (this.lastChipLabels[k] !== text) {
      label.text = text;
      this.lastChipLabels[k] = text;
    }
    label.visible = true;
    this.drawChip(g, label, cx, y, cw, outlined, flash);
  }

  /**
   * The gun's single-shot cooldown chip (no ammo segments): when ready the chip
   * fills green; while cooling an amber bar fills left→right at reloadFrac with a
   * bright sweep line at its leading edge — reads as one shot on a 3s cooldown.
   */
  private drawCooldownChip(g: Graphics, ready: boolean, reloadFrac: number, cx: number, y: number, cw: number): void {
    if (ready) {
      g.rect(cx, y, cw, CHIP_H).fill({ color: GREEN, alpha: 0.9 });
      return;
    }
    g.rect(cx, y, cw, CHIP_H).fill({ color: DIM, alpha: 0.28 }); // grey while on cooldown
    g.rect(cx, y, cw * reloadFrac, CHIP_H).fill({ color: AMBER, alpha: 0.45 }); // cooldown fill
    g.rect(cx + cw * reloadFrac - 1, y, 2, CHIP_H).fill({ color: AMBER, alpha: 0.95 }); // bright sweep edge
  }

  /**
   * One weapon's ammo pool inside its chip: `max` equal-width segments (green
   * filled for loaded rounds, dim outlines for empty). At n===0 the whole segment
   * area greys out — the only "dead" signal. While below max a highly visible
   * amber reload line (2px, full height) sweeps left→right at reloadFrac; it
   * stays bright even at zero ammo (the one live signal when empty).
   */
  private drawAmmoChip(g: Graphics, view: AmmoChipView, cx: number, y: number, cw: number): void {
    const segW = (cw - (view.max - 1) * SEG_GAP) / view.max;
    for (let i = 0; i < view.max; i++) {
      const sx = cx + i * (segW + SEG_GAP);
      if (i < view.n) g.rect(sx, y, segW, CHIP_H).fill({ color: GREEN, alpha: 0.9 });
      else g.rect(sx, y, segW, CHIP_H).stroke({ width: 1, color: DIM, alpha: 0.4 });
    }
    if (view.n === 0) g.rect(cx, y, cw, CHIP_H).fill({ color: DIM, alpha: 0.28 }); // grey ONLY when empty
    if (view.n < view.max) {
      const lx = cx + cw * view.reloadFrac;
      g.rect(lx - 1, y, 2, CHIP_H).fill({ color: AMBER, alpha: 0.95 }); // the reload line stays bright
    }
  }

  /** One chip's border + label tint: amber when primed, red while a denied pulse flashes it. */
  private drawChip(g: Graphics, label: Text, cx: number, y: number, cw: number, primed: boolean, flash: boolean): void {
    const { border, alpha } = chipTint(primed, flash);
    g.rect(cx, y, cw, CHIP_H).stroke({ width: primed ? 1.5 : 1, color: border, alpha });
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
   *  is active — briefly reddens the selected weapon chip. `abilityFlash` is
   *  its ability-press sibling (Story 1.6), PER-SLOT since Story 1.8 (the ML
   *  fits two ability slots) — index i reddens the chip for loadout slot i. */
  update(
    ship: ShipState,
    axes: Axes,
    status: OwnStatus,
    zone: ZoneHud,
    match: MatchUx,
    screenW: number,
    screenH: number,
    deniedFlash = false,
    abilityFlash: readonly boolean[] = [],
  ): void {
    this.setInstrumentsVisible(true);
    this.spectateBanner.visible = false;
    this.layout(screenH);
    // Speed-needle denominator: the BOOSTED cap while the boost window is
    // active — via the one shared speed mutator, never a hand-tweaked maxSpeed.
    const kin = boostedKinematics(status.stats.kinematics, status.stats.boost.speedBonus, status.boostActive);
    this.updateTelegraph(axes, ship.speed, kin);
    this.drawBars(status, screenW, screenH, deniedFlash, abilityFlash);
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
