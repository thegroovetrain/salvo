// SPLASH PEGS (Story 11.8, Eric 2026-11-15, the markers bench's "cross"). One
// peg wherever an OWN shell ended: every own fall of shot (`sp`) is a MISS peg
// in the shipped `splash` near-white, every own hit call (`hc`) a HIT peg in
// `hitBloom` amber — all weapons, torpedo and mine hits and the utility
// shells included. An X 7 px across, 1.5 px line, over a thin dark halo,
// SCREEN size at every zoom; alpha falls linearly 1 → 0 over 15 s, then the
// peg is gone (`pegAlpha`).
//
// OWN ONLY. `sp` and `hc` are both spectator-public on the wire (the `dmg`
// precedent, server/src/game/signals.ts `shooterPrivateSignal`), so a
// spectator's frame carries every captain's — `pegKindFor` keeps only the
// rows whose shooter is this session. Never another captain's.
//
// POOLED: one Graphics per live peg borrowing one of two shared contexts
// (miss / hit), capped at `pegCap` — past it the oldest is recycled. Misses
// sit under hits (two sub-layers), so a hit is never buried by a near miss.

import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { screenScale } from './chartMarks.js';

const M = CLIENT_CONFIG.chartMarks;
const C = CLIENT_CONFIG.colors;

export type PegKind = 'miss' | 'hit';

/** Pure: the peg an event leaves for `ownId` — a MISS for an own `sp`, a HIT
 *  for an own `hc`, nothing for any other row or any other shooter. */
export function pegKindFor(e: { k: string; id: string }, ownId: string): PegKind | null {
  if (ownId === '' || e.id !== ownId) return null;
  if (e.k === 'sp') return 'miss';
  if (e.k === 'hc') return 'hit';
  return null;
}

/** Pure: a peg's alpha `ageMs` after it landed — 1 at landing, falling
 *  linearly to 0 at `fadeMs`, 0 after (and for a non-finite age). A clock
 *  that steps backward reads as "just landed". */
export function pegAlpha(ageMs: number, fadeMs: number = M.pegFadeMs): number {
  if (!Number.isFinite(ageMs) || !(fadeMs > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - Math.max(0, ageMs) / fadeMs));
}

/** Draw the X (with its halo) in px units, centered, onto a context. */
function pegContext(color: number): GraphicsContext {
  const r = M.pegPx / 2;
  const ctx = new GraphicsContext();
  const x = (): void => {
    ctx.moveTo(-r, -r).lineTo(r, r).moveTo(r, -r).lineTo(-r, r);
  };
  x();
  ctx.stroke({ width: M.pegHaloPx, color: M.pegHaloColor, alpha: M.pegHaloAlpha, cap: 'round' });
  x();
  ctx.stroke({ width: M.pegLinePx, color, alpha: 1, cap: 'round' });
  return ctx;
}

interface Peg {
  g: Graphics;
  kind: PegKind;
  /** Server-clock ms it landed. */
  at: number;
}

export class SplashPegs {
  private readonly missLayer = new Container();
  private readonly hitLayer = new Container();
  private ctx: Record<PegKind, GraphicsContext> | null = null;
  /** Live pegs, oldest first. */
  private readonly live: Peg[] = [];
  /** Retired Graphics, ready for reuse. */
  private readonly spare: Graphics[] = [];

  constructor(layer: Container) {
    layer.addChild(this.missLayer, this.hitLayer);
  }

  /** How many pegs are live (tests/debug). */
  get count(): number {
    return this.live.length;
  }

  /** The kinds of the live pegs, oldest first (tests/debug). */
  kinds(): PegKind[] {
    return this.live.map((p) => p.kind);
  }

  /** A peg of `kind` at world (x, y), landed at server-clock `atMs`. */
  add(kind: PegKind, x: number, y: number, atMs: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (this.live.length >= M.pegCap) this.retire(0);
    const ctx = this.contexts()[kind];
    const g = this.spare.pop() ?? new Graphics();
    g.context = ctx;
    g.position.set(x, y);
    g.visible = false; // until the first render sizes it
    (kind === 'hit' ? this.hitLayer : this.missLayer).addChild(g);
    this.live.push({ g, kind, at: atMs });
  }

  /** Per render frame: age every peg to `nowMs` (the server clock `add` was
   *  stamped on), drop the faded, size the rest for `zoom` px per u. */
  render(nowMs: number, zoom: number): void {
    const scale = screenScale(zoom);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      const a = pegAlpha(nowMs - p.at);
      if (!(a > 0)) {
        this.retire(i);
        continue;
      }
      p.g.visible = true;
      p.g.alpha = a;
      p.g.scale.set(scale);
    }
  }

  private retire(i: number): void {
    const [p] = this.live.splice(i, 1);
    p.g.removeFromParent();
    this.spare.push(p.g);
  }

  private contexts(): Record<PegKind, GraphicsContext> {
    this.ctx ??= { miss: pegContext(C.splash), hit: pegContext(C.hitBloom) };
    return this.ctx;
  }
}
