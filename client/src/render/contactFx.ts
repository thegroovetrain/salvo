// HULL CONTACT legibility (Story 9.5, epic-9 amendment 79): what the own
// captain sees and hears when the hull hits or scrapes something. RENDER-ONLY:
// it reads the predictor's last live tick (`ownContacts`, `lastLand`) and
// drives nothing back — the damage is the server's, carried by `dmg` with the
// existing shake and `damage` thud (net/roomBindings.ts flushDamage — which
// skips the small windowed bleed `dmg` while `state.contactBleeding` holds,
// stamped by main.ts off the same sim/contactBleed.ts speed this tone reads).
// No new wire event: the client already knows when its own hull touches
// something, because its own resolver reports it (the spec's Design Note).
//
//   STRIKE  — a pair the own hull was NOT touching on the previous update and
//             is now, closing faster than `CONFIG.ram.allowanceU`: a brief
//             spark burst at the contact point, alternating the own hull's
//             color and the other hull's roster color. Once per contact edge,
//             never every frame of a press.
//   LAND    — the own hull's land contact turning on with a strike speed
//             (|speed| × headOn) over the same allowance: the same burst at
//             the bow, own color + the shore stroke.
//   GRIND   — while any contact bleeds faster than `grindMinVt` (a hull row's
//             `vt + vn` — a scrape OR a sustained press, amendment 83 — or the
//             coast's |speed|·√(1 − headOn²); sim/contactBleed.ts), the short
//             `grind` scrape is retriggered every `grindRetriggerMs`, its gain
//             scaled by the bleed speed; it stops `grindReleaseMs` after the
//             last bleeding frame.
//
// Motion: sparks are motion and are suppressed at motion off (the existing
// convention); the sound is not motion and keeps playing. Sparks are plain
// pooled records drawn into ONE Graphics, redrawn per frame (no per-spark Pixi
// object).
//
// The contact point is approximate by design: the own hull's center pushed
// toward the other hull (along the contact normal) by half its beam — no
// polygon intersection math. Good enough for a 450 ms flash.

import { Container, Graphics } from 'pixi.js';
import { CONFIG, type HullContact } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { bleedSpeed, type BleedLand } from '../sim/contactBleed.js';
import { Pool } from '../util/pool.js';

const FX = CLIENT_CONFIG.contactFx;
/** The coast a land strike sparks against: the shore band's stroke. */
const SHORE_COLOR = CLIENT_CONFIG.colors.terrain[0].stroke;
/** Golden angle (rad) — rotates each burst's spray so no two look alike. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** The own hull as the layer needs it this frame. */
export interface ContactFxOwn {
  id: string;
  x: number;
  y: number;
  heading: number;
  color: number;
  /** u — half the own hull's beam (where a side strike sparks). */
  halfBeamU: number;
  /** u — half the own hull's length (where a land strike sparks: the bow). */
  halfLengthU: number;
}

/** The own hull's land contact on the last live tick (Predictor.lastLand). */
export type ContactFxLand = BleedLand;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: number;
}

export class ContactFx {
  private readonly gfx = new Graphics();
  private readonly pool = new Pool<Spark>(() => ({ x: 0, y: 0, vx: 0, vy: 0, born: 0, color: 0 }));
  private readonly sparks: Spark[] = [];
  private prevPairs = new Set<string>();
  private currPairs = new Set<string>();
  private prevLand = false;
  private bursts = 0;
  private lastBleedMs = -Infinity;
  private lastScrapeMs = -Infinity;
  private bleedV = 0;

  constructor(
    layer: Container,
    /** Plays one `grind` scrape at this gain (0..1 of the tone's peak). */
    private readonly playGrind: (gain: number) => void,
  ) {
    layer.addChild(this.gfx);
  }

  /** Live sparks (tests / diagnostics). */
  get sparkCount(): number {
    return this.sparks.length;
  }

  /**
   * One render frame. `own` null = no own hull this frame (spectating, the
   * respawn gap, interp mode): nothing new fires and the edges re-arm, while
   * sparks already thrown finish their life.
   */
  update(
    nowMs: number,
    own: ContactFxOwn | null,
    contacts: readonly HullContact[],
    land: ContactFxLand,
    lookupColor: (id: string) => number,
    motion: boolean,
  ): void {
    if (own === null) this.rearm();
    else {
      this.strikes(nowMs, own, contacts, lookupColor, motion);
      this.landStrike(nowMs, own, land, motion);
      this.grind(nowMs, contacts, land);
    }
    this.draw(nowMs);
  }

  /** Forget every edge (no own hull, so no contact can persist across it). */
  private rearm(): void {
    this.prevPairs.clear();
    this.prevLand = false;
  }

  /** A burst for every hull pair newly touching with a closing speed over the allowance. */
  private strikes(
    nowMs: number,
    own: ContactFxOwn,
    contacts: readonly HullContact[],
    lookupColor: (id: string) => number,
    motion: boolean,
  ): void {
    const curr = this.currPairs;
    curr.clear();
    for (const c of contacts) {
      const ownIsA = c.a === own.id;
      const other = ownIsA ? c.b : c.a;
      curr.add(other);
      if (this.prevPairs.has(other) || !(c.vn > CONFIG.ram.allowanceU) || !motion) continue;
      // n points from B toward A: toward the other hull is −n when we are A.
      const s = ownIsA ? -own.halfBeamU : own.halfBeamU;
      this.burst(nowMs, own.x + c.nx * s, own.y + c.ny * s, own.color, lookupColor(other));
    }
    this.currPairs = this.prevPairs;
    this.prevPairs = curr;
  }

  /** A burst at the bow on the land contact's rising edge, over the allowance. */
  private landStrike(nowMs: number, own: ContactFxOwn, land: ContactFxLand, motion: boolean): void {
    const rising = land.contact && !this.prevLand;
    this.prevLand = land.contact;
    if (!rising || !motion || !(land.speed * land.headOn > CONFIG.ram.allowanceU)) return;
    const bx = own.x + Math.cos(own.heading) * own.halfLengthU;
    const by = own.y + Math.sin(own.heading) * own.halfLengthU;
    this.burst(nowMs, bx, by, own.color, SHORE_COLOR);
  }

  /** Retrigger the scrape while anything bleeds; release after the last bleed. */
  private grind(nowMs: number, contacts: readonly HullContact[], land: ContactFxLand): void {
    const v = bleedSpeed(contacts, land);
    if (v > FX.grindMinVt) {
      this.lastBleedMs = nowMs;
      this.bleedV = v;
    }
    if (nowMs - this.lastBleedMs > FX.grindReleaseMs) return;
    if (nowMs - this.lastScrapeMs < FX.grindRetriggerMs) return;
    this.lastScrapeMs = nowMs;
    this.playGrind(Math.min(1, this.bleedV / FX.grindFullVt));
  }

  /** Throw `sparkCount` sparks from (x, y), alternating the two colors. */
  private burst(nowMs: number, x: number, y: number, colorA: number, colorB: number): void {
    const n = FX.sparkCount;
    const turn = this.bursts++ * GOLDEN;
    for (let i = 0; i < n; i++) {
      const sp = this.pool.acquire();
      const ang = turn + (i / n) * Math.PI * 2;
      const jitter = ((i * 0.618034 + this.bursts * 0.31) % 1) * 2 - 1;
      const v = FX.sparkSpeedU * (1 + FX.sparkSpeedSpread * jitter);
      sp.x = x;
      sp.y = y;
      sp.vx = Math.cos(ang) * v;
      sp.vy = Math.sin(ang) * v;
      sp.born = nowMs;
      sp.color = i % 2 === 0 ? colorA : colorB;
      this.sparks.push(sp);
    }
  }

  /** Retire spent sparks and redraw the live ones. */
  private draw(nowMs: number): void {
    const g = this.gfx;
    g.clear();
    let w = 0;
    for (const sp of this.sparks) {
      const age = nowMs - sp.born;
      if (age >= FX.sparkLifeMs || age < 0) {
        this.pool.release(sp);
        continue;
      }
      this.sparks[w++] = sp;
      const t = age / 1000;
      g.circle(sp.x + sp.vx * t, sp.y + sp.vy * t, FX.sparkSizePx).fill({
        color: sp.color,
        alpha: 1 - age / FX.sparkLifeMs,
      });
    }
    this.sparks.length = w;
  }
}
