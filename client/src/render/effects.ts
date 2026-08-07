// Feel effects, funneled through one spawnEffect() entry + a shared sprite pool.
//   - wake:   continuous speed feedback behind the own hull (world-space dots)
//   - muzzle: brief flash where a gun-family weapon fired (bright dot) — since
//             Story 4.3 driven by the server's neutral `mz` row, not a guess
//   - spark:  bright hit bloom at an impact (additive) — the public `boom` for
//             onlookers, the self-private `hc` Hit Call for the shooter
//   - splash: expanding ring at a shell splash (miss / island / range-out)
//   - sink:   larger expanding crimson ring where a hull went down
// One-shots share a redraw-per-frame Graphics pool; wake keeps its own aged
// pool. All spawn through spawnEffect(kind, x, y).

import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { ShipState, HullId } from '@salvo/shared';
import { CONFIG, hullEnvelope } from '@salvo/shared';
import { Pool } from '../util/pool.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';

/** Effect kinds routed through spawnEffect(). */
export type EffectKind =
  | 'wake'
  | 'muzzle'
  | 'muzzleHeavy'
  | 'spark'
  | 'pierce'
  | 'splash'
  | 'sink'
  | 'torpwake'
  | 'burst'
  | 'horn';

/**
 * Pure: is this one-shot pure JUICE (a decorative flash) rather than a marker
 * that carries information? Exactly ONE kind is, now: `muzzleHeavy`, the own
 * cannon's extra weight — it only ever draws on our own hull, on top of the
 * universal flash, and says nothing the universal flash did not already say.
 * Everything else is a marker: splash / sink / burst rings say WHERE something
 * happened, the torpedo wake says where a fish ran, and the `pierce` ring says a
 * shell PUNCHED THROUGH a hull and is still flying (Story 2.9: the
 * ARMOR-PIERCING read, the only thing on screen distinguishing a pierce from a
 * terminal hit). The juice kinds' peak alpha is scaled by the accessibility
 * motion level (Story 2.3): halved at `reduced`, suppressed at `off`.
 *
 * STORY 4.3 PROMOTED `muzzle` AND `spark` OUT OF JUICE. They were juice while
 * they were client-side GUESSES about things you could already see: a flash
 * drawn only when a shell happened to reveal on a visible hull, and a spark
 * drawn only at impacts inside your own bubble. The server now states both
 * outright — `mz` says a gun went off HERE (a shooter you may not be able to
 * see), and `hc` says something you fired CONNECTED (at a point you may have no
 * other way to learn about). FR16 makes them load-bearing information, and the
 * ratified motion rule is that `off` removes MOTION, never INFORMATION. Do not
 * put them back: gating them on the motion setting would delete the two answers
 * this story exists to give from the screen of anyone who turned animation down.
 *
 * STORY 4.5's `horn` IS NOT JUICE EITHER, and the reason is sharper than the
 * two above: it is the ONLY visual your own honk ever produces. A honker gets
 * no chevron (a bearing to yourself is meaningless — amendment 55), so if the
 * bloom were juice, `spawnOneShot`'s `peakAlpha <= 0` early-out at `motion:
 * 'off'` would delete the entire visual twin of the one cue the player
 * deliberately triggered, leaving a 1.8s horn with nothing on screen at all.
 * UX-DR36 requires every honk to have a twin; this is that twin.
 */
export function isJuiceEffect(kind: EffectKind): boolean {
  return kind === 'muzzleHeavy';
}

/** Pure: the peak alpha a one-shot renders at, after the motion gate. */
export function effectPeakAlpha(kind: EffectKind, baseAlpha: number, intensity: number): number {
  return isJuiceEffect(kind) ? baseAlpha * intensity : baseAlpha;
}

/**
 * Pure layer-routing predicate: which one-shot kinds render into the FOG-IMMUNE
 * chart layer instead of the fogged world. The gun-shell `burst` was the first —
 * a burst at radar range (well beyond the sight bubble) must read as a detonation
 * flash above the fog, mirroring the reticle's fog-immunity (render/firing.ts).
 *
 * STORY 4.3 ADDS THE THREE GUNNERY MARKS. Each is now a server signal with its
 * own declared fog exception, so each must be able to draw where the fog is:
 * `splash` is your own fall of shot at its true impact point (bracket-and-walk
 * fire is the whole point — a miss you cannot see is the one you most need to
 * see), `spark` is the Hit Call bloom confirming a connection at a hull the fog
 * is hiding, and `muzzle` is a shooter inside the 412.5u flash halo but outside
 * your 330u bubble. Drawing any of the three UNDER the fog would render them
 * exactly where they are already useless.
 *
 * `muzzleHeavy` stays fogged, and correctly: it is own-side only and only ever
 * draws on our own hull, which IS the hole in the fog. Sink and torpwake stay
 * fogged too (both only occur where you can already see). No Pixi involved.
 *
 * STORY 4.5 ADDS `horn`, the own-hull bloom. It rings out to roughly the sight
 * hole's inner feather, where the fog composite has already begun to darken,
 * and it is the honker's ONLY visual confirmation that their horn sounded — a
 * confirmation the fog may not be allowed to eat, however partially. The same
 * argument the burst ring made first.
 */
export function isFogImmuneEffect(kind: EffectKind): boolean {
  return kind === 'burst' || kind === 'splash' || kind === 'spark' || kind === 'muzzle' || kind === 'horn';
}

interface OneShotSpec {
  type: 'dot' | 'ring';
  life: number; // s
  color: number;
  r0: number; // u — start radius
  r1: number; // u — end radius
  width: number; // ring stroke width (u)
  alpha: number; // peak alpha
  additive: boolean;
}

const C = CLIENT_CONFIG.colors;

const SPECS: Record<Exclude<EffectKind, 'wake'>, OneShotSpec> = {
  muzzle: { type: 'dot', life: 0.12, color: C.muzzle, r0: 5, r1: 1, width: 0, alpha: 0.9, additive: true },
  // Story 2.9 — the OWN cannon's muzzle: the same flash with real weight behind
  // it (bigger, and it hangs a beat longer). Own-side only, because the wire's
  // ballistic shape deliberately cannot say "cannon" to an onlooker.
  muzzleHeavy: { type: 'dot', life: 0.18, color: C.muzzle, r0: 9, r1: 1.5, width: 0, alpha: 1, additive: true },
  // spark = the hit flash at a shell-vs-ship impact → Hit Call bloom.
  spark: { type: 'dot', life: 0.2, color: C.hitBloom, r0: 7, r1: 1, width: 0, alpha: 1, additive: true },
  // Story 2.9 — ARMOR-PIERCING punch-through: a ring that CONTRACTS onto the
  // hull it just went through. Every other ring in the game expands (splash,
  // burst, sink), so collapsing inward is unmistakably a different event at a
  // glance — a shell that did NOT stop here. Damage-marker crimson (the
  // existing damage register; no new reds), and NOT juice: it is the whole
  // enemy-side AP tell, so it holds at motion=off.
  pierce: { type: 'ring', life: 0.28, color: C.damageMarker, r0: 20, r1: 3, width: 2, alpha: 0.9, additive: true },
  // Miss splash ring (replaces the retired blip-green double-duty — see DESIGN.md).
  splash: { type: 'ring', life: 0.5, color: C.splash, r0: 3, r1: 22, width: 2, alpha: 0.7, additive: false },
  // Gun-shell burst at the clicked point: a bright amber ring expanding to the
  // burst radius (the area every enemy hull in it takes full damage) — the
  // gun's own action detonation, additive so it reads as a flash. The radius
  // never travels on the wire (see BurstEvent), so this CONFIG base is what an
  // uncorrelated burst rings at. An OWN burst (the click-time latch correlated
  // it to our own shell) is spawned with an explicit EFFECTIVE radius instead,
  // so our own upgraded blast stops under-drawing itself while enemy builds
  // stay unreadable — see roomBindings.handleBurst.
  burst: { type: 'ring', life: 0.35, color: C.amber, r0: 4, r1: CONFIG.gun.burstRadius, width: 3, alpha: 0.95, additive: true },
  // Sink ring where a hull went down → damage-marker (DESIGN.md Combat Effects).
  sink: { type: 'ring', life: 0.9, color: C.damageMarker, r0: 6, r1: 40, width: 3, alpha: 0.9, additive: false },
  // Story 4.5 — YOUR OWN HONK (amendment 55): a slow wide ring leaving your
  // own hull, the sound going out. Drawn in HUD phosphor rather than a combat
  // color because a foghorn is an EMOTE, not ordnance, and it is deliberately
  // the SLOWEST one-shot in the table — a horn is ~1.8s and a 0.35s flash would
  // read as a hit. Non-additive: this must not look like a detonation.
  horn: { type: 'ring', life: 1, color: C.phosphor, r0: 12, r1: 110, width: 2, alpha: 0.5, additive: false },
  // Torpedo wake: a small dim bubble dropped along the fish's run; fades fast so
  // the trail reads as a fresh streak, not a persistent line (legacy torp tone).
  torpwake: { type: 'dot', life: 0.7, color: C.legacy.torpWake, r0: 2, r1: 3.5, width: 0, alpha: 0.4, additive: false },
};

interface WakeParticle {
  gfx: Graphics;
  age: number;
  life: number;
  baseAlpha: number;
}

interface OneShot {
  gfx: Graphics;
  spec: OneShotSpec;
  /** Peak alpha AFTER the motion gate (resolved once, at spawn). */
  peakAlpha: number;
  x: number;
  y: number;
  age: number;
  /** The pool this gfx was acquired from — burst gfx live on the fog-immune
   *  layer (burstPool), everything else on shotPool; retire returns to its own. */
  pool: Pool<Graphics>;
}

export class Effects {
  private readonly wakePool: Pool<Graphics>;
  private readonly shotPool: Pool<Graphics>;
  /** Fog-immune one-shot pool (bursts) — gfx parented to the chart burst layer. */
  private readonly burstPool: Pool<Graphics>;
  private readonly wake: WakeParticle[] = [];
  private readonly shots: OneShot[] = [];
  private accumDist = 0;
  /** Own hull half-length (stern offset) + top speed, per own hull envelope. */
  private ownHalfLen: number = hullEnvelope('torpedoBoat').hull.length / 2;
  private ownMaxSpeed: number = hullEnvelope('torpedoBoat').kinematics.maxSpeed;
  /** Wake tint (Story 1.12): the OWN personal hue, set by setWakeColor once the
   *  own roster color is known; amber is the pre-roster fallback. Wake dots are
   *  drawn white and tinted, so a recolor is a pool-tint swap, not a redraw. */
  private wakeColor: number = CLIENT_CONFIG.colors.amber;

  constructor(
    private readonly wakeLayer: Container,
    private readonly fxLayer: Container = wakeLayer,
    /** Fog-immune layer for burst rings; defaults to fxLayer for headless tests. */
    private readonly burstLayer: Container = fxLayer,
  ) {
    this.wakePool = new Pool<Graphics>(() => this.makeWakeDot());
    this.shotPool = new Pool<Graphics>(() => this.makeShotGfx(this.fxLayer));
    this.burstPool = new Pool<Graphics>(() => this.makeShotGfx(this.burstLayer));
  }

  /** Set the own ship's hull id (drives wake stern offset + intensity scaling).
   *  Accepts any HullId via hullEnvelope so it is drone-safe, though the own
   *  ship is always one of the three pickable classes. */
  setOwnClass(cls: HullId): void {
    this.ownHalfLen = hullEnvelope(cls).hull.length / 2;
    this.ownMaxSpeed = hullEnvelope(cls).kinematics.maxSpeed;
  }

  /** Set the own wake tint to the pilot's personal hue (Story 1.12), applied to
   *  every wake dot spawned from here on (short-lived, so it takes over in ~1s). */
  setWakeColor(color: number): void {
    this.wakeColor = color;
  }

  private makeWakeDot(): Graphics {
    const g = new Graphics();
    // Drawn WHITE + tinted per spawn (setWakeColor), so a personal-hue recolor is
    // a cheap tint swap on the pool rather than a redraw.
    g.circle(0, 0, CLIENT_CONFIG.wake.radius).fill({ color: CLIENT_CONFIG.colors.white, alpha: 1 });
    g.visible = false;
    this.wakeLayer.addChild(g);
    return g;
  }

  private makeShotGfx(layer: Container): Graphics {
    const g = new Graphics();
    g.visible = false;
    layer.addChild(g);
    return g;
  }

  /**
   * Single entry point for one-shot effects. `radius` overrides the spec's END
   * radius for a RING kind — the own-burst path uses it to ring the EFFECTIVE
   * blast radius instead of the CONFIG base (see roomBindings.handleBurst /
   * aimPreview.ownBurstRadius). Omitted everywhere else, which keeps every
   * uncorrelated burst on the constant-free default: the wire cannot say whose
   * shell that was, and an onlooker must not be able to read a blast upgrade
   * off a detonation.
   */
  spawnEffect(kind: EffectKind, x: number, y: number, intensity = 1, radius?: number): void {
    if (kind === 'wake') this.spawnWake(x, y, intensity);
    else this.spawnOneShot(kind, x, y, radius);
  }

  private spawnWake(x: number, y: number, intensity: number): void {
    const g = this.wakePool.acquire();
    g.position.set(x, y);
    g.scale.set(1);
    g.tint = this.wakeColor; // personal-hue wake (Story 1.12); amber pre-roster
    g.visible = true;
    const baseAlpha = CLIENT_CONFIG.wake.alpha * intensity;
    g.alpha = baseAlpha;
    this.wake.push({ gfx: g, age: 0, life: CLIENT_CONFIG.wake.life, baseAlpha });
  }

  private spawnOneShot(kind: Exclude<EffectKind, 'wake'>, x: number, y: number, radius?: number): void {
    // Backgrounded tab: skip one-shot spawns entirely rather than let them pile
    // up in the pool while the render loop that ages/retires them is throttled.
    if (typeof document !== 'undefined' && document.hidden) return;
    const base = SPECS[kind];
    // A ring told its true radius rides a per-spawn copy; every other spawn
    // keeps the shared spec object (no allocation on the common path).
    const spec = radius !== undefined && base.type === 'ring' ? { ...base, r1: radius } : base;
    const peakAlpha = effectPeakAlpha(kind, spec.alpha, motionIntensity(settings.current.motion));
    if (peakAlpha <= 0) return; // motion off: the juice flashes simply don't spawn
    const pool = isFogImmuneEffect(kind) ? this.burstPool : this.shotPool;
    const g = pool.acquire();
    g.clear();
    g.visible = true;
    g.alpha = 1;
    g.scale.set(1);
    g.position.set(x, y);
    this.shots.push({ gfx: g, spec, peakAlpha, x, y, age: 0, pool });
  }

  /** Advance all effects by `dt`; spawn wake behind the own ship first
   *  (null while spectating — no own hull, no wake, effects still age). */
  update(dt: number, ship: ShipState | null): void {
    if (ship) this.spawnTrail(dt, ship);
    this.ageWake(dt);
    this.ageShots(dt);
  }

  private spawnTrail(dt: number, ship: ShipState): void {
    const speed = Math.abs(ship.speed);
    if (speed < CLIENT_CONFIG.wake.minSpeed) {
      this.accumDist = 0;
      return;
    }
    this.accumDist += speed * dt;
    const sternX = ship.x - Math.cos(ship.heading) * this.ownHalfLen;
    const sternY = ship.y - Math.sin(ship.heading) * this.ownHalfLen;
    const intensity = Math.min(speed / this.ownMaxSpeed, 1);
    while (this.accumDist >= CLIENT_CONFIG.wake.spacing) {
      this.accumDist -= CLIENT_CONFIG.wake.spacing;
      this.spawnEffect('wake', sternX, sternY, intensity);
    }
  }

  private ageWake(dt: number): void {
    for (let i = this.wake.length - 1; i >= 0; i--) {
      const p = this.wake[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        this.retire(p.gfx, this.wakePool);
        this.wake.splice(i, 1);
        continue;
      }
      p.gfx.alpha = p.baseAlpha * (1 - k);
      p.gfx.scale.set(1 + k * 0.8);
    }
  }

  private ageShots(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.age += dt;
      const k = s.age / s.spec.life;
      if (k >= 1) {
        this.retire(s.gfx, s.pool);
        this.shots.splice(i, 1);
        continue;
      }
      this.drawShot(s, k);
    }
  }

  private drawShot(s: OneShot, k: number): void {
    const spec = s.spec;
    const r = spec.r0 + (spec.r1 - spec.r0) * k;
    const a = s.peakAlpha * (1 - k);
    const g = s.gfx;
    g.clear();
    if (spec.type === 'dot') g.circle(0, 0, r).fill({ color: spec.color, alpha: a });
    else g.circle(0, 0, r).stroke({ width: spec.width, color: spec.color, alpha: a });
    g.blendMode = spec.additive ? 'add' : 'normal';
  }

  private retire(g: Graphics, pool: Pool<Graphics>): void {
    g.visible = false;
    pool.release(g);
  }
}
