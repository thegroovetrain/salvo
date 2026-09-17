// SCREEN-SPACE HUD CHROME — everything the match draws on the glass that is NOT
// the bottom-centre HUD bar.
//
// Story 8.6 emptied this module of the bottom-right own-vitals cluster it was
// built around: the HP rail, the HDG/KTS readouts, the telegraph ladder, the
// rudder gauge and the helm key chips all moved into the two globes at the ends
// of the new bar (render/hpGlobe.ts, render/helmGlobe.ts), and `vitalsLayout`
// went with them. The cluster is DELETED, not flagged off.
//
// What lives here is the chrome that was never part of the cluster and still
// outlives — or overlays — the hull:
//
//   • THE BR CHROME BAR (Story 3.3) — `n AFLOAT · n KILLS · T+mm:ss · <ring>`,
//     composed in ui/chromeBar.ts, drawn from BOTH update paths because it is a
//     member of the ratified reveal-HUD SURVIVOR set;
//   • the match-phase lines and the big countdown numeral;
//   • the `IN STORM` warning and the victim tells (SLOWED / DAZZLED), which as
//     of 8.6 are CENTRED above the bar rather than stacked over a corner;
//   • the centre-screen SUNK — RESPAWNING overlay and the spectate banner.
//
// THE ATTENTION SEAM. This module still owns ONE amber channel — the chrome
// bar's ring segment — so the amber corollary is resolved HERE for it, with the
// seam's own ranked resolver. The HP channel's half of the corollary moved with
// the globe (`hpGlobeHoldsLit` in render/hpGlobe.ts); both call the SAME
// `amberPulseWinner`, so the two can never disagree about which amber wins.

import { Container, Text } from 'pixi.js';
import type { EffectiveStats, EquipmentId, ShipClassId, WeaponAmmo } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
// The Tier-1 hold easing is the storm vignette's, imported rather than
// re-derived: amendment 16's hold is ONE behavior with one time constant shape.
import { easeHold } from './zone.js';
import { amberPulseWinner, holdAtLitKeyframe } from './attention.js';
import { railAmberChannel, railFraction } from './hpGlobe.js';
import {
  CHROME_BAR_SEGMENTS,
  RING_PULSE_AMP,
  advanceRingPhase,
  chromeBarLayout,
  chromeBarSegments,
  ringSegmentAlpha,
  type ChromeBarView,
  type ChromeSegment,
} from '../ui/chromeBar.js';
import type { MatchUx } from '../ui/phase.js';

const C = CLIENT_CONFIG.colors;
const V = CLIENT_CONFIG.vitals;
const CB = CLIENT_CONFIG.chromeBar;
const GREEN = C.phosphor;
const AMBER = C.amber;
// Storm readout accent: the `storm` fill is below the graphic-contrast
// threshold, so text/readout uses `storm-readout` (brighter, not more saturated —
// DESIGN.md storm color note).
const STORM_PURPLE = C.stormReadout;
// Geist Mono per DESIGN.md — the single mono stack.
const MONO = CLIENT_CONFIG.type.mono;
const MARGIN = V.margin;

const OVERLAY_STYLE = { fontFamily: MONO, fontSize: 38, fill: AMBER, letterSpacing: 2 } as const;

/** Own-ship status the HUD renders beyond raw kinematics. */
export interface OwnStatus {
  hp: number;
  /** hp — DAMAGE CONTROL's still-draining regen pool (`OwnShip.repairHp`, cycle
   *  44); 0 = nothing incoming. Self-private and read verbatim off the server
   *  frame, never predicted. Drives the HP GLOBE's pending-heal band (epic-8
   *  amendment 35) and nothing else — the authoritative hull number is still
   *  `hp`, which the pool pays into every server tick. */
  repairHp: number;
  // Slot-aligned pool count + reload timer (OwnShip.ammo): length SLOT_COUNT
  // (NINE since Story 8.5), null for an empty slot — which at 0:00 is seven of
  // the nine: the three weapon slots and the whole consumable belt.
  ammo: (WeaponAmmo | null)[];
  primedSlot: number; // primed loadout slot (0 = gun) — client-local, immediate
  alive: boolean;
  /**
   * THE THIRD STATE (Story 5.2, amendment 16): the hull is inside its five-
   * second sinking window — `alive` is already false (the kill landed at
   * sink-entry, amendment 11) but the captain is still conning: helm, hotbar,
   * firing arc and foghorn all live, refit inert. Derived from the self-private
   * `you.sinkingUntil` against the server clock (sim/sinkingWindow.ts), and
   * NEVER from `alive`'s `?? true` default — a missing `you` reads false here.
   * `alive` and `sinking` are disjoint by construction.
   */
  sinking: boolean;
  respawnInMs: number; // 0 when alive / unknown
  cls: ShipClassId; // own class — drives hull-length lookups (firing UX)
  /** Cached effectiveStats(cls, boons) — ALL HUD denominators (max hp, speed
   *  ladder, ammo pool sizes, reload durations, damage) read from here (Stage
   *  D; boons are the whole stat input as of Story 2.8). */
  stats: EffectiveStats;
  /** Slot-aligned equipment ids of the OWN loadout (main.ts's slotIdsFor — the
   *  hull-free `loadoutFor(stats)` with the fitted cards replayed over it since
   *  Story 8.5); null = an unfitted slot. Read by the firing UX and passed
   *  through to the HOTBAR (render/hotbar.ts owns the loadout surface). Ammo
   *  VALUES still come from the server via `ammo`. */
  loadout: readonly (EquipmentId | null)[];
  /** The own speed boost is currently active (serverNow < boostUntil estimate):
   *  drives the boosted speed-needle cap on the helm globe's telegraph arc. */
  boostActive: boolean;
  /** ms remaining on the PROP-FOULING slow window (`you.slowedUntil` vs the
   *  server clock; 0 = not fouled) — Story 2.9's victim tell. */
  slowedMsLeft: number;
  /** ms remaining on the DAZZLE window (`you.dazzledUntil`; 0 = not dazzled). */
  dazzledMsLeft: number;
}

/**
 * Pure: is the player CONNING A HULL this frame — alive, OR inside the sinking
 * window (Story 5.2's third state)? THE gate every teardown that used to read
 * `!status.alive` should consult instead, so "the controls are live" is decided
 * in one place rather than re-spelled at each seam. Deliberately NOT the same
 * question as `alive`: the economy surfaces key on `alive` and correctly close
 * at sink-entry.
 */
export function conning(status: Pick<OwnStatus, 'alive' | 'sinking'>): boolean {
  return status.alive || status.sinking;
}

/** The two victim tells, top-down in the order they stack above the bar. */
const TELL_LABELS = ['SLOWED', 'DAZZLED'] as const;

/**
 * Pure: WHOLE remaining seconds of a victim window, floored at 1 so a live
 * window never reads "0s" (the hotbar's fmtWindow rule, restated here rather
 * than reached for across the render boundary).
 */
export function tellSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Pure: the tell line for a window — `SLOWED 2s`, or '' when nothing is running.
 *
 * DUAL-CODED by construction: the STATE is a word and the SEVERITY is a live
 * countdown, so neither the color nor the mere presence of a mark carries it
 * alone. The tone (audio/tones.ts slowed/dazzled) is the flourish; THIS is the
 * information, and it renders identically at every motion level.
 */
export function tellLine(label: string, msLeft: number): string {
  return msLeft > 0 ? `${label} ${tellSeconds(msLeft)}s` : '';
}

/** The longest a tell line can ever get — the fit pin's input. Windows are
 *  short (a few seconds), but the pin measures a deliberately absurd one so a
 *  future duration boon cannot quietly push the line out of its column. */
export const TELL_FIT_MAX_MS = 99_000;

const STORM_STYLE = { fontFamily: MONO, fontSize: 19, fill: STORM_PURPLE, letterSpacing: 2 } as const;
/** The BR chrome bar's row style (Story 3.3). Per-segment FILL and ALPHA are
 *  set from the composed segments — this carries the family/size/tracking only. */
const BAR_STYLE = { fontFamily: MONO, fontSize: CB.fontSize, letterSpacing: CB.letterSpacing } as const;
const MATCH_LINE_STYLE = { fontFamily: MONO, fontSize: 22, fill: GREEN, letterSpacing: 3 } as const;
const MATCH_TAG_STYLE = { fontFamily: MONO, fontSize: 18, fill: GREEN, letterSpacing: 3 } as const;
const COUNTDOWN_STYLE = { fontFamily: MONO, fontSize: 112, fill: GREEN, letterSpacing: 4 } as const;
const SPECTATE_STYLE = { fontFamily: MONO, fontSize: 28, fill: AMBER, letterSpacing: 3 } as const;
/** Victim tells (Story 2.9) — phosphor data caps in the one mono stack, never
 *  grey and never a color-only mark. */
export const TELL_STYLE = { fontFamily: MONO, fontSize: V.tellSize, fill: GREEN, letterSpacing: V.tellSpacing } as const;

/**
 * The BR chrome bar row's BOTTOM edge, in logical px. The row's segments are
 * TOP-anchored (`anchor.set(0, 0)`) and positioned at `chromeBar.y` by
 * `layoutChromeBar`, so the row ends one line of its own type below that. The
 * satellite column hangs off this number.
 */
const CHROME_BAR_BOTTOM = CB.y + CB.fontSize;

/**
 * Pure: where the `IN STORM` warning's TOP edge sits — centred on the screen,
 * `vitals.stormAbove` BELOW the chrome bar's bottom edge.
 *
 * EPIC-8 AMENDMENT 38. Story 8.6's first cut hung the satellite column off the
 * HUD bar's top edge; the review gate found that space is exactly where a slot
 * tooltip opens on every hover, and where the open refit band's DAMAGE CONTROL
 * strip sits. The column moved under the top-centre chrome bar, which nothing
 * else reaches. `stormAbove` survives verbatim — only what it is measured FROM
 * changed, and the direction with it.
 */
export function stormWarnAnchor(screenW: number): { x: number; y: number } {
  return { x: screenW / 2, y: CHROME_BAR_BOTTOM + V.stormAbove };
}

/**
 * Pure: the TOP tell slot — the top edge of the first victim tell, one satellite
 * line BELOW `IN STORM` (amendment 38 flipped the stack downward). Further tells
 * stack DOWNWARD from here at `vitals.tellGap`, so a single running window
 * always sits in this slot and the column never shows a hole where the other
 * tell would have been.
 */
export function tellAnchor(screenW: number): { x: number; y: number } {
  return { x: screenW / 2, y: stormWarnAnchor(screenW).y + STORM_STYLE.fontSize + V.tellGap };
}

/**
 * Reload progress in [0,1] for a weapon with `reloadMsLeft` remaining of a
 * `reloadMs` cycle: 0 when idle (no reload running) or just started, → 1 as the
 * next round nears. THE one source for the cooldown wipe (render/cooldownWipe.ts)
 * and the firing arc's sweep-back.
 */
export function reloadFraction(reloadMsLeft: number, reloadMs: number): number {
  if (reloadMsLeft <= 0 || reloadMs <= 0) return 0;
  const f = 1 - reloadMsLeft / reloadMs;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

export class Hud {
  private readonly overlay: Text;
  /** THE BR CHROME BAR (Story 3.3): one Text per composed segment, created once
   *  and reused. They parent to `hudLayer` and are a member of the ratified
   *  reveal-HUD SURVIVOR set — they outlive the hull, all the way to return to
   *  port. */
  private readonly barSegs: Text[];
  private readonly stormWarn: Text;
  private readonly matchLine: Text;
  private readonly matchTag: Text;
  private readonly countdownBig: Text;
  private readonly spectateBanner: Text;
  /** The victim tells, index-aligned with TELL_LABELS (SLOWED, DAZZLED). */
  private readonly tells: Text[];
  private readonly lastTells: string[];
  private lastOverlay = '';
  /** Chrome-bar re-layout guard: the composed strings + the viewport width. The
   *  row is only re-measured when one of them moves (the T+ segment ticks once a
   *  second) — per-frame alpha/color are cheap sets that never re-measure. */
  private lastBarSig = '';
  /** Per-segment color diff (a `.style.fill` write re-rasterizes the Text). */
  private readonly lastBarFill: number[];
  /** INTEGRATED ring-pulse phase + the eased Tier-1 hold blend, and the clock
   *  they were last advanced at. The bar draws from BOTH update paths, so this
   *  is its own clock rather than the hull's (which only ticks while alive). */
  private ringPhase = 0;
  private ringHold = 0;
  private lastBarSec: number | null = null;
  private lastMatchLine = '';
  private lastMatchTag = '';
  private lastCountdown = '';
  private lastSpectateBanner = '';

  constructor(private readonly hudLayer: Container) {
    this.overlay = new Text({ text: '', style: OVERLAY_STYLE });
    this.overlay.anchor.set(0.5);
    this.overlay.visible = false;
    hudLayer.addChild(this.overlay);
    this.barSegs = this.buildChromeBar();
    this.lastBarFill = this.barSegs.map(() => GREEN);
    this.stormWarn = new Text({ text: 'IN STORM', style: STORM_STYLE });
    this.stormWarn.anchor.set(0.5, 0); // centred, hanging UNDER the chrome bar
    this.stormWarn.visible = false;
    hudLayer.addChild(this.stormWarn);
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
    this.tells = TELL_LABELS.map(() => {
      const t = new Text({ text: '', style: TELL_STYLE });
      t.anchor.set(0.5, 0); // centred, stacking downward from a top edge
      t.visible = false;
      hudLayer.addChild(t);
      return t;
    });
    this.lastTells = TELL_LABELS.map(() => '');
  }

  /** The chrome bar's fixed Text pool (Story 3.3) — one per composed segment,
   *  created ONCE here and reused forever (nothing in the bar allocates per
   *  frame). */
  private buildChromeBar(): Text[] {
    return Array.from({ length: CHROME_BAR_SEGMENTS }, () => {
      const t = new Text({ text: '', style: { ...BAR_STYLE, fill: GREEN } });
      t.anchor.set(0, 0); // the row lays out left-to-right from a computed x
      t.visible = false;
      this.hudLayer.addChild(t);
      return t;
    });
  }

  /**
   * Phase layer: waiting shows "CAPTAINS BOARDING — n ABOARD" + "ALL STATIONS
   * LOCKED" (Story 6.1's held start line); countdown keeps that tag and adds
   * the big center number; active/finished show nothing here.
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

  /** The "IN STORM" warning, centred UNDER the chrome bar (epic-8 amendment 38
   *  — it moved out of the corner with the vitals, then off the HUD bar's top
   *  edge). Story 3.3 took the top-center storm LINE out of here: the chrome
   *  bar's ring segment carries that now. */
  private drawStormWarn(inStorm: boolean, screenW: number): void {
    this.stormWarn.visible = inStorm;
    const at = stormWarnAnchor(screenW);
    this.stormWarn.position.set(at.x, at.y);
  }

  /**
   * THE BR CHROME BAR (Story 3.3) — `n AFLOAT · n KILLS · T+mm:ss · <ring>` on
   * one centered mono row at the top of the screen.
   *
   * Drawn from BOTH update paths (alive and spectating), so it survives the hull
   * exactly as the ratified reveal-HUD survivor set requires. Composition is
   * ui/chromeBar.ts's; this only assigns, positions and breathes.
   */
  private drawChromeBar(bar: ChromeBarView, screenW: number, nowSec: number, ringPulses: boolean): void {
    const dt = this.lastBarSec === null ? 0 : nowSec - this.lastBarSec;
    this.lastBarSec = nowSec;
    if (!bar.visible) {
      this.hideChromeBar();
      return;
    }
    const segs = chromeBarSegments(bar);
    this.layoutChromeBar(segs, screenW);
    this.breatheRing(bar, segs, dt, ringPulses);
  }

  /** Assign / re-measure the row. Text assignment and the layout both run only
   *  on a real change (the strings tick once a second at most, the viewport on
   *  resize), which is what keeps a permanent top-center row free. */
  private layoutChromeBar(segs: readonly ChromeSegment[], screenW: number): void {
    for (let i = 0; i < this.barSegs.length; i++) {
      const t = this.barSegs[i];
      const seg = segs[i];
      t.visible = seg !== undefined && seg.text !== '';
      if (seg === undefined) continue;
      if (seg.color !== this.lastBarFill[i]) {
        t.style.fill = seg.color;
        this.lastBarFill[i] = seg.color;
      }
    }
    // The change signature joins on a control character written as an ESCAPE,
    // never a literal byte in the source: the segment texts carry spaces (and
    // the separator is literally ' · '), so joining on anything printable could
    // let two different segment lists sign identically and skip a real redraw.
    const sig = `${segs.map((s) => s.text).join(' ')}|${screenW}`;
    if (sig === this.lastBarSig) return;
    this.lastBarSig = sig;
    // The pool is FIXED (CHROME_BAR_SEGMENTS, pinned against the composer by
    // chromeBar.test.ts) — bound both loops by it as well as by the composed
    // list, so a future composer that emitted an extra segment would drop it
    // rather than throw on every frame.
    const n = Math.min(segs.length, this.barSegs.length);
    for (let i = 0; i < n; i++) this.barSegs[i].text = segs[i].text;
    const at = chromeBarLayout(segs, screenW);
    for (let i = 0; i < n; i++) this.barSegs[i].position.set(at.xs[i], CB.y);
  }

  /**
   * The ring segment's amber breath: an integrated 1 Hz phase (gated on the
   * urgency window, so it always starts lit), an eased Tier-1 hold toward the
   * lit keyframe, and a motion-scaled amplitude — at `off` the amplitude is zero
   * and the segment simply holds amber and lit, information intact.
   *
   * `ringPulses` is the AMBER COROLLARY's verdict for this segment, not the raw
   * urgency flag. Under the shipped rank the ring outranks the HP channel, so a
   * ring inside its window ALWAYS wins and the two are the same boolean — which
   * is exactly why there is no eased loser-path here: the ring can never lose,
   * so building one would be dead code with no way to test it. If a future
   * channel ever outranks the ring, THIS is the line that has to grow the HP
   * globe's `hullFillHeld` blend.
   */
  private breatheRing(
    bar: ChromeBarView,
    segs: readonly ChromeSegment[],
    dtSec: number,
    ringPulses: boolean,
  ): void {
    // The amplitude gates the INTEGRATOR as well as the wave: at motion=off the
    // phase holds at 0, so turning motion back on mid-window starts the breath
    // from the lit keyframe instead of wherever a free-running phase had drifted.
    const amp = motionScaled(RING_PULSE_AMP, settings.current.motion);
    this.ringPhase = advanceRingPhase(this.ringPhase, ringPulses, dtSec, amp);
    const hold = holdAtLitKeyframe(bar.tier1) ? 1 : 0;
    this.ringHold = easeHold(this.ringHold, hold, Math.max(0, dtSec) * 1000, CB.holdEaseMs);
    const pulsed = ringSegmentAlpha(this.ringPhase, amp, this.ringHold);
    for (let i = 0; i < segs.length; i++) {
      this.barSegs[i].alpha = segs[i].pulsed && ringPulses ? pulsed : segs[i].alpha;
    }
  }

  /** Drop the bar (pre-live, where the match-phase lines own top-center) and
   *  disarm the pulse, so the next urgency window starts from the lit keyframe. */
  private hideChromeBar(): void {
    for (const t of this.barSegs) t.visible = false;
    this.ringPhase = 0;
    this.ringHold = 0;
  }

  /** The bar's rendered segment strings (test/debug seam) — '' for a hidden
   *  slot, so a hidden bar reads as an empty row rather than stale copy. */
  chromeBarText(): string[] {
    return this.barSegs.map((t) => (t.visible ? t.text : ''));
  }

  /** A bar segment's live alpha (test/debug seam — the ring breath). */
  chromeBarAlpha(index: number): number {
    return this.barSegs[index]?.alpha ?? 0;
  }

  /**
   * The victim tells (Story 2.9): one short status line per running enemy-
   * doctrine window, stacked DOWNWARD from the top tell slot under IN STORM
   * (epic-8 amendment 38 flipped the direction with the column). A window that is
   * not running renders NOTHING (no placeholder, no dimmed ghost) and the
   * remaining line closes up into the bottom slot, so the column never carries a
   * hole. Hidden wholesale on a dead hull — a sunk ship is not fouled.
   *
   * A SINKING hull still shows them (Story 5.2): it is still making way, still
   * steering and still shooting, so a live foul or dazzle is still shaping what
   * the captain can do with their last five seconds.
   */
  private drawTells(status: OwnStatus, screenW: number): void {
    const at = tellAnchor(screenW);
    const windows = [status.slowedMsLeft, status.dazzledMsLeft];
    let slot = 0;
    for (let i = 0; i < this.tells.length; i++) {
      const line = conning(status) ? tellLine(TELL_LABELS[i], windows[i]) : '';
      const t = this.tells[i];
      if (line !== this.lastTells[i]) {
        t.text = line;
        this.lastTells[i] = line;
      }
      t.visible = line !== '';
      if (!t.visible) continue;
      t.position.set(at.x, at.y + slot * V.tellGap);
      slot++;
    }
  }

  /** Drop both tells (spectating / returning to port — no hull to afflict). */
  private hideTells(): void {
    for (const t of this.tells) t.visible = false;
  }

  /**
   * The centre-screen `SUNK — RESPAWNING IN Ns` overlay (the ready room's
   * respawn wait). A SINKING hull must never see it: the ship is still under
   * the player's hand and still shooting, so a "SUNK" placard over the middle
   * of the fight would be both a lie about the controls and a wall across the
   * one view the beat exists for. It returns the instant the window closes.
   */
  private updateOverlay(status: OwnStatus, screenW: number, screenH: number): void {
    if (conning(status)) {
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

  /**
   * Update the screen chrome (conning a live ship). Call each render frame.
   * `nowSec` is the server-clock estimate in SECONDS (main.ts renderAlive's
   * `now / 1000`, the same clock zone.ts's vignette pulse rides). The satellite
   * column (IN STORM + the tells) hangs off the CHROME BAR (amendment 38), which
   * this module lays out itself — no bar edge is passed in any more.
   */
  update(
    status: OwnStatus,
    inStorm: boolean,
    bar: ChromeBarView,
    match: MatchUx,
    screenW: number,
    screenH: number,
    nowSec: number,
  ): void {
    this.spectateBanner.visible = false;
    // THE AMBER COROLLARY for the ring, resolved ONCE for the frame. The HP
    // channel's fraction comes from `railFraction` — the same derivation the
    // seam's Tier-1 read and the globe's own draw take — so the corollary and
    // the tier can never disagree about which band the hull is in. The GLOBE's
    // half of the same verdict is `hpGlobeHoldsLit`, over this same resolver.
    const frac = railFraction(status.hp, status.stats.maxHp);
    const amber = amberPulseWinner({ ring: bar.ring.urgent, hpGlobe: railAmberChannel(frac) });
    this.updateOverlay(status, screenW, screenH);
    this.drawTells(status, screenW);
    this.drawStormWarn(inStorm, screenW);
    this.drawChromeBar(bar, screenW, nowSec, amber === 'ring');
    this.drawMatch(match, screenW, screenH);
  }

  /** A tell's rendered line (test/debug seam) — '' when its window is idle. */
  tellText(index: number): string {
    return this.tells[index]?.visible ? this.tells[index].text : '';
  }

  /** Where a VISIBLE tell is drawn (test/debug seam); null when it is idle. */
  tellPosition(index: number): { x: number; y: number } | null {
    const t = this.tells[index];
    return t?.visible ? { x: t.position.x, y: t.position.y } : null;
  }

  /** Where IN STORM is drawn (test/debug seam); null while out of the storm. */
  stormPosition(): { x: number; y: number } | null {
    const t = this.stormWarn;
    return t.visible ? { x: t.position.x, y: t.position.y } : null;
  }

  /**
   * Spectator frame: banner + the chrome bar + phase lines. `bannerText` is
   * computed by ui/phase.ts's spectateBannerText() from the match phase +
   * winnerId. The HUD BAR (globes, slots, strip) is hidden by its own owner —
   * this path only drops what lives in this module.
   *
   * The CHROME BAR renders here exactly as it does alive — that is the whole
   * survivor-set ruling: the HUD bar and the own vitals die with the hull, and
   * the match readout does not. A spectator owns no Tier-1 channel (no hull to
   * be critical, no fire control to be denied), which the caller expresses by
   * handing over a view with `tier1: false`.
   */
  updateSpectate(
    bar: ChromeBarView,
    match: MatchUx,
    screenW: number,
    screenH: number,
    bannerText: string,
    nowSec: number,
  ): void {
    this.overlay.visible = false;
    this.stormWarn.visible = false;
    this.hideTells(); // the victim tells die with the hull, like the bar
    if (bannerText !== this.lastSpectateBanner) {
      this.spectateBanner.text = bannerText;
      this.lastSpectateBanner = bannerText;
    }
    this.spectateBanner.visible = true;
    this.spectateBanner.position.set(screenW / 2, screenH * 0.16);
    // A spectator owns no HP globe at all, so the amber set holds exactly one
    // member and the ring wins whenever its window is open — the corollary is
    // resolved the same way here rather than by short-circuiting past it, and
    // `hpGlobe: false` is a STATEMENT (there is no hull), not a stale read.
    this.drawChromeBar(bar, screenW, nowSec, amberPulseWinner({ ring: bar.ring.urgent, hpGlobe: false }) === 'ring');
    this.drawMatch(match, screenW, screenH);
  }
}
