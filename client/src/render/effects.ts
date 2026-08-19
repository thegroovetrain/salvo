// Feel effects, funneled through one spawnEffect() entry + a shared sprite pool.
//   - wake:   the ON-WATER rendering of the one wake (Story 4.12) — foam dots
//             laid on the shared ribbon's cadence behind EVERY visible hull,
//             plus the Kelvin envelope of displaced water around each track
//   - muzzle: brief flash where a gun-family weapon fired (bright dot) — since
//             Story 4.3 driven by the server's neutral `mz` row, not a guess
//   - spark:  bright hit bloom at an impact (additive) — the public `boom` for
//             onlookers, the self-private `hc` Hit Call for the shooter
//   - splash: expanding ring at a shell splash (miss / island / range-out)
//   - sink:   larger expanding crimson ring where a hull went down
// One-shots share a redraw-per-frame Graphics pool; wake keeps its own aged
// pool. All spawn through spawnEffect(kind, x, y).

import { Container, Graphics } from 'pixi.js';
import { CONFIG, WAKE_AGE_BUCKETS, eachWakeSegment, hullEnvelope } from '@salvo/shared';
import { Pool, capOldest } from '../util/pool.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionIntensity, settings } from '../settings/store.js';
import { CHOP_HEAD_MULTIPLE } from './radarSources.js';
import { regionKey, type FlashBudget, type FlashVerdict } from './flashBudget.js';
import { WakeSources, type WakeHull, type WakeSource } from './wake.js';

/** Effect kinds routed through spawnEffect(). */
export type EffectKind =
  | 'wake'
  | 'muzzle'
  | 'muzzleHeavy'
  | 'spark'
  | 'splash'
  | 'sink'
  | 'torpwake'
  | 'burst'
  | 'horn';

/**
 * Pure: is this one-shot pure JUICE (a decorative flash) rather than a marker
 * that carries information? Exactly ONE kind is, now: `muzzleHeavy`, the own
 * broadside's extra weight — it only ever draws on our own hull, on top of the
 * universal flash, and says nothing the universal flash did not already say.
 * Everything else is a marker: splash / sink / burst rings say WHERE something
 * happened, and the torpedo wake says where a fish ran. The juice kinds' peak
 * alpha is scaled by the accessibility motion level (Story 2.3): halved at
 * `reduced`, suppressed at `off`.
 *
 * THE `pierce` RING IS RETIRED (Story 7-5 wave 2, R2.6): ARMOR-PIERCING was its
 * only source, and with the cannon deleted no shell punches through a hull any
 * more. Removed end to end — kind, spec and its one spawn site — rather than
 * left as a spec nothing can reach.
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

// --- THE AGGREGATE FLASH BUDGET, WORLD SIDE (Story 4.8, amendment 240) ---------
//
// Every one-shot FLASH claims against the client's one `FlashBudget` before it
// spawns. Over-budget flashes DEGRADE — flat alpha, true position, the effect's
// normal life — and are NEVER skipped: Story 4.3 deliberately promoted `muzzle`
// and `spark` OUT of `isJuiceEffect` because they are sanctioned SENSOR
// READINGS, so dropping one under load would delete information under exactly
// the stack the photosensitivity floor was written for, violating the standing
// law that the motion setting *"removes MOTION, never INFORMATION."*
//
// THE VERDICT IS LATCHED AT SPAWN AND NEVER RE-EVALUATED (amendment 83, applied
// to effects: *"everything about a paint is decided ONCE at creation and only
// alpha changes afterward"*). Re-deciding per frame would let a flash flicker
// between degraded and animated as the window slid out from under it — a strobe
// manufactured by the anti-strobe mechanism.
//
// THE BUDGET IS A SECOND, INDEPENDENT FILTER ON TOP OF THE MOTION GATE, never a
// replacement for it: arbitration runs AFTER `effectPeakAlpha`'s `<= 0`
// early-out, so a juice flash the motion setting already suppressed neither
// draws nor spends budget, and the budget can never render anything MORE
// visible than it is today.

/**
 * Pure: does this kind claim against the flash budget? Every one-shot does
 * EXCEPT the two wake materials.
 *
 * `wake` is not a one-shot at all, and `torpwake` — the creeping MINE's trail
 * bubble (render/mines.ts) — is its sibling: a dim dot laid on a cadence along a
 * track, at 0.4 alpha, non-additive. A stream of trail dots is not a flash, and
 * budgeting it would do the one thing the floor exists to prevent — a mine
 * crawling through a region would spend that region's three onsets on its own
 * track and degrade the muzzle flashes and Hit Calls that land there next.
 */
export function isBudgetedFlash(kind: EffectKind): boolean {
  return kind !== 'wake' && kind !== 'torpwake';
}

/**
 * Pure: may this kind be COALESCED — collapsed into a co-located same-kind mark
 * already spawned this frame? Every kind may EXCEPT `burst`.
 *
 * The coalescer's principle is that two same-kind marks on the same point in one
 * frame are ONE FACT, and that holds only while their specs are interchangeable.
 * A `burst` ring is the one kind spawned with a PER-SPAWN RADIUS — the real
 * blast extent, resolved per detonation (`spawnEffect`'s `radius` override, from
 * roomBindings.handleBurst) — so two different-radius bursts inside the 0.1u
 * coalescing quantum are NOT one fact: collapsing them keeps whichever arrived
 * first, and when that is the smaller one the larger blast extent — real spatial
 * information about a danger zone — never draws at all. Amendment 37's parent
 * grammar SUMS magnitude rather than dropping it; a max-radius merge is not
 * worth building here, and excluding a kind whose instances are not
 * interchangeable is the simpler and more honest statement of the same law.
 *
 * THIS IS THE COALESCER ONLY. A burst still CLAIMS the budget and still degrades
 * normally, so a burst stack is bounded exactly like every other flash — it just
 * cannot silently delete a bigger blast on its way there.
 */
export function isCoalescableFlash(kind: EffectKind): boolean {
  return kind !== 'burst';
}

/**
 * Pure: a one-shot's alpha at life fraction `k`, given its latched verdict.
 * Degraded = the flat `motion: 'off'` keyframe — `degradeAlphaFactor` of the
 * peak, held for the whole life, no ramp. The luminance CHANGE is what a flash
 * is; spending it while keeping presence, position and weight is precisely why
 * the budget can bind on declared information without deleting any.
 */
export function oneShotAlpha(peakAlpha: number, k: number, degraded: boolean): number {
  return degraded ? peakAlpha * FB.degradeAlphaFactor : peakAlpha * (1 - k);
}

/**
 * The camera surface the budget needs: a world→screen projection and the
 * viewport extent to bucket it against. `render/camera.ts`'s `Camera` satisfies
 * this structurally, so the flash is bucketed by the SAME transform the renderer
 * draws with rather than a second copy of it that can drift.
 */
export interface FlashProjector {
  worldToScreen(p: { x: number; y: number }): { x: number; y: number };
  readonly screenCenter: { x: number; y: number };
}

/**
 * THE WORLD FLASH GATE — the seam between world one-shots (this module, plus the
 * hull hit flash in render/ships.ts) and the shared budget. ONE instance per
 * client, constructed in main.ts over the ONE `FlashBudget` every chrome surface
 * also claims against: the ratified floor is per "element OR SCREEN REGION", so
 * a second budget instance would silently double a region's ceiling.
 *
 * REGION KEYS ARE SCREEN-SPACE AND EFFECTS SPAWN IN WORLD SPACE, so the
 * projection happens HERE, at the claim — a camera pan must be able to re-bucket
 * a flash, which is what a screen-region floor means. The COALESCER stays in
 * WORLD units: its quantum is `coalesceQuantumU`, the gunneryFeed impact-key
 * convention, and two shells landing on one point are one fact wherever the
 * camera happens to be.
 *
 * The clock is INJECTED (the deniedFire / gunneryFeed house shape) and defaults
 * to `performance.now()` — the monotonic clock every other flash site in the
 * client already claims on, NOT the server estimate. One budget fed from two
 * clocks would count a window that never existed.
 */
export class WorldFlashGate {
  constructor(
    private readonly budget: FlashBudget,
    private readonly projector: FlashProjector,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Claim a flash ONSET at a WORLD point. `degrade` = draw the flat mark. */
  claim(x: number, y: number): FlashVerdict {
    const p = this.projector.worldToScreen({ x, y });
    const c = this.projector.screenCenter;
    return this.budget.claim(regionKey(p.x, p.y, c.x * 2, c.y * 2), this.now());
  }

  /** True the FIRST time this (kind, world point) is seen in `frameId`; false
   *  for every co-located duplicate in that same frame. */
  first(kind: string, x: number, y: number, frameId: number): boolean {
    return this.budget.coalesce(kind, x, y, frameId);
  }
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
const FB = CLIENT_CONFIG.flashBudget;

const SPECS: Record<Exclude<EffectKind, 'wake'>, OneShotSpec> = {
  muzzle: { type: 'dot', life: 0.12, color: C.muzzle, r0: 5, r1: 1, width: 0, alpha: 0.9, additive: true },
  // Story 2.9 — the OWN cannon's muzzle: the same flash with real weight behind
  // it (bigger, and it hangs a beat longer). Own-side only, because the wire's
  // ballistic shape deliberately cannot say "cannon" to an onlooker.
  muzzleHeavy: { type: 'dot', life: 0.18, color: C.muzzle, r0: 9, r1: 1.5, width: 0, alpha: 1, additive: true },
  // spark = the hit flash at a shell-vs-ship impact → Hit Call bloom.
  spark: { type: 'dot', life: 0.2, color: C.hitBloom, r0: 7, r1: 1, width: 0, alpha: 1, additive: true },
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
  // A CREEPING MINE's wake bubble (legacy torp tone) — a small dim dot dropped
  // along its crawl at the mine's own spacing (render/mines.ts).
  //
  // THE TORPEDO NO LONGER USES THIS (cycle-69 review gate, P10). A fish's trail
  // was this one-shot at `life: 0.7`s while the same fish's radar ribbon ran
  // 6s — two objects, two lifetimes, ~8× apart, which is precisely the fork
  // amendment 204 struck (*"I didn't say shit about the lengths being different
  // here"*). The fish is now an ordinary `WakeSource` on the shared ribbon. A
  // creeping mine keeps this dot because it has no radar-wake counterpart at
  // all — the server samples ships and torpedoes only (`World.sampleWakes` /
  // `sampleTorpWake`), so there is no second length here to disagree with.
  torpwake: { type: 'dot', life: 0.7, color: C.legacy.torpWake, r0: 2, r1: 3.5, width: 0, alpha: 0.4, additive: false },
};

interface WakeParticle {
  gfx: Graphics;
  age: number;
  life: number;
  baseAlpha: number;
}

// --- HULL-SIDE DISPLACED WATER (Story 4.12, amendments 197/199/205/206) ---------
//
// Eric asked for it in his own words — *"ships displace the water as they move,
// so there is choppy water around it on all sides"* — and amendment 205 handed
// the implementation its constant rather than letting it invent one: the KELVIN
// half-angle, 19.47°, `sin θ = 1/3`, a genuine constant of deep-water ship waves
// and INDEPENDENT OF SPEED. `CHOP_HEAD_MULTIPLE` (= 1/sin θ = 3) is imported
// from `render/radarSources.ts` rather than restated, because the scope draws
// the same envelope and two spellings of one constant is how they drift apart.
//
// THE ENVELOPE IS WIDEST AT THE HEAD AND NARROWS ASTERN, which is amendment
// 206's ratified reading: the head is where the hull is and where water is
// ACTIVELY being displaced, and the wedge converges behind it as the water
// settles. The scope expresses the taper in AGE BUCKETS because the wire
// carries no distance-astern channel (amendment 194 strips every identity and
// linkage from the payload); the water expresses it in the SAME buckets, off the
// same shared ribbon, so both sources agree by construction rather than by two
// tunings that happen to match (amendment 154: two sources, one appearance).
//
// IT IS INFORMATION, NOT JUICE, so it is never motion-gated: `motion: 'off'`
// removes MOTION and never INFORMATION (the standing rule at `isJuiceEffect`).
// The envelope is a static shape recomputed from pose — there is no animation in
// it to remove. It stays FOGGED (`isFogImmuneEffect` excludes `wake`) because
// displaced water is a thing you SEE, and the fog is what you cannot.

/**
 * Pure: the displaced-water envelope's HALF-WIDTH (u) at water of a given age
 * bucket, for a source whose turbulent core is `widthU` across (its own beam —
 * `WakeRibbon.widthU`, derived once in the shared model).
 *
 * `core × (1 + (CHOP_HEAD_MULTIPLE − 1) × taper)`, taper running 1 → 0 across
 * the buckets: three half-beams at the head, one at the tail. That is
 * ALGEBRAICALLY the scope's `chopHaloCells` (`core + (M − 1) × core × taper`)
 * in world units instead of cells — deliberately the same expression, so the
 * water and the scope cannot disagree about how far a hull pushes the sea.
 *
 * Degenerate inputs degrade rather than throw, the shared model's discipline: a
 * non-finite or non-positive width answers 0 (no envelope), a non-finite bucket
 * answers the OLDEST (narrowest — fail toward "about to be gone", the direction
 * `wakeAgeBucket` already fails in), and a single-bucket wire degrades to
 * "always freshest".
 */
export function chopHalfWidthU(widthU: number, bucket: number): number {
  const core = Number.isFinite(widthU) && widthU > 0 ? widthU / 2 : 0;
  if (core === 0) return 0;
  const last = WAKE_AGE_BUCKETS - 1;
  const b = Number.isFinite(bucket) ? Math.min(last, Math.max(0, Math.floor(bucket))) : last;
  const taper = last > 0 ? 1 - b / last : 1;
  return core * (1 + (CHOP_HEAD_MULTIPLE - 1) * taper);
}

/** One vertex of the envelope's centre-line: a point on the track and the
 *  half-width the wedge has there. */
export interface ChopPoint {
  x: number;
  y: number;
  hw: number;
}

/**
 * Pure: turn a centre-line into the envelope's closed outline, as the flat
 * `[x0,y0,x1,y1,…]` list Pixi's `poly()` takes — the left side head-to-tail
 * followed by the right side back again.
 *
 * The normal at each vertex is taken off its NEIGHBOURS rather than off one
 * adjacent segment, so the wedge miters through a turn instead of kinking at
 * every sample. A zero-length step (two coincident samples) falls back to the
 * +x axis rather than dividing by zero.
 */
export function chopOutline(pts: readonly ChopPoint[]): number[] {
  const n = pts.length;
  const poly: number[] = [];
  const back: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i === 0 ? 0 : i - 1];
    const b = pts[i === n - 1 ? n - 1 : i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = len > 0 ? dx / len : 1;
    const uy = len > 0 ? dy / len : 0;
    const p = pts[i];
    poly.push(p.x - uy * p.hw, p.y + ux * p.hw);
    back.push(p.x + uy * p.hw, p.y - ux * p.hw);
  }
  for (let i = back.length - 2; i >= 0; i -= 2) poly.push(back[i], back[i + 1]);
  return poly;
}

interface OneShot {
  gfx: Graphics;
  kind: Exclude<EffectKind, 'wake'>;
  spec: OneShotSpec;
  /** Peak alpha AFTER the motion gate (resolved once, at spawn). */
  peakAlpha: number;
  /** The flash budget's verdict, LATCHED AT SPAWN and never re-evaluated —
   *  re-deciding per frame would strobe a mark as the window slid (amendment 83
   *  applied to effects). */
  degraded: boolean;
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
  /**
   * THE ONE WAKE, as the client holds it (amendment 204): the shared ribbon per
   * visible hull. Both renderings hang off it — this class draws the water,
   * `render/radar.ts` stamps the same segments onto the radar lattice through
   * `WakeStampCache`. Exposed rather than duplicated, because a second ribbon
   * model is a desync surface.
   */
  readonly wakeSources = new WakeSources();
  /** Displaced-water envelopes, one Graphics per tracked source. */
  private readonly chop = new Map<string, Graphics>();
  /** This frame's live poses, by source id — reused, never reallocated. */
  private readonly livePose = new Map<string, WakeHull>();
  /** Sub-layers of the passed wake layer so the envelope always sits UNDER the
   *  foam: a pooled dot and a per-hull envelope would otherwise interleave in
   *  child order by whichever happened to be created first. */
  private readonly chopLayer: Container;
  private readonly foamLayer: Container;
  /** The client's ONE flash gate, or null before main.ts wires it (and in
   *  headless tests) — with no gate every one-shot animates exactly as it did
   *  before Story 4.8, which is the safe default for a budget that must never
   *  make anything less visible than the code it replaced without a verdict. */
  private gate: WorldFlashGate | null = null;
  /** Monotonically-changing frame id for the coalescer, driven by this class's
   *  own per-frame entry point (`update`) rather than an invented clock: one-shot
   *  spawns arrive from message handlers BETWEEN frames, so "the same frame" is
   *  exactly "the same batch of spawns since the last update". A constant id
   *  would collapse every repeated mark forever. */
  private frameId = 0;

  constructor(
    wakeLayer: Container,
    private readonly fxLayer: Container = wakeLayer,
    /** Fog-immune layer for burst rings; defaults to fxLayer for headless tests. */
    private readonly burstLayer: Container = fxLayer,
  ) {
    this.chopLayer = new Container();
    this.foamLayer = new Container();
    wakeLayer.addChild(this.chopLayer, this.foamLayer);
    this.wakePool = new Pool<Graphics>(() => this.makeWakeDot());
    this.shotPool = new Pool<Graphics>(() => this.makeShotGfx(this.fxLayer));
    this.burstPool = new Pool<Graphics>(() => this.makeShotGfx(this.burstLayer));
  }

  /**
   * Drop every ribbon, every foam dot and every envelope — the wake's half of
   * the return-to-port teardown, alongside `Smoke.clear()` and
   * `Foghorn.clear()` and defensive for the same reason: wake is drawn at TRUE
   * world positions, so if a future match-restart path ever skips the reload,
   * the last ocean's water must not render on the next one's coordinates.
   */
  clearWake(): void {
    for (const p of this.wake) this.retire(p.gfx, this.wakePool);
    this.wake.length = 0;
    this.wakeSources.clear();
    this.retireChop();
  }

  /** The visibility regime the tracked water was observed under — see
   *  `setSpectating`. Starts fogged, which is how every life starts. */
  private spectating = false;

  /**
   * ADOPT THE OBSERVER'S VISIBILITY REGIME, dropping every ribbon on a CHANGE
   * (cycle-69 review gate, P11).
   *
   * A SPECTATOR'S FRAMES ARE UNFOGGED: `frames.ts` hands a dead observer every
   * hull on the ocean with no sight bubble and no island LOS, and `wakeHulls`
   * feeds all of them straight into the tracker. Water observed under THAT
   * regime is not water a fogged life earned, so it must not survive the
   * boundary in either direction — carried forward it would let the scope stamp
   * up to a full water life of omniscient track, and carried backward it would
   * leave a fogged life's ribbons attached to sources the spectator sees from a
   * different vantage entirely.
   *
   * BOTH EDGES, not just the leaking one, because the store's own `clear()`
   * already documents spectate ENTRY as a drop point and never got one — and
   * because a one-directional guard is the kind that rots when the other
   * direction becomes reachable. Today `state.spectating` is effectively
   * one-way in a session (`frames.ts spectates()` returns a captain to fogged
   * frames only across a reload), so the spectate→alive edge is the same class
   * of defence the return-to-port teardown already carries in as many words:
   * cheap, and it stops being theoretical the moment a match-restart path lands.
   */
  setSpectating(spectating: boolean): void {
    if (spectating === this.spectating) return;
    this.spectating = spectating;
    this.clearWake();
  }

  /**
   * Adopt the client's ONE flash gate (main.ts owns the budget it wraps — the
   * same instance every chrome one-shot claims against, since the floor is
   * aggregate per region). Passing null restores the pre-4.8 unbudgeted path.
   */
  setFlashGate(gate: WorldFlashGate | null): void {
    this.gate = gate;
  }

  /** Live foam dots, across every source — the particle-budget seam. */
  get liveWakeDots(): number {
    return this.wake.length;
  }

  /**
   * The live one-shots' budget state — the flash budget's observable seam (the
   * sibling of `liveWakeDots`): each mark's kind, its LATCHED verdict and the
   * alpha it was last drawn at. A degraded mark reads a flat alpha across its
   * whole life here; an animated one ramps down. Diagnostics and tests only.
   */
  get liveShots(): readonly { kind: EffectKind; degraded: boolean; alpha: number }[] {
    return this.shots.map((s) => ({ kind: s.kind, degraded: s.degraded, alpha: oneShotAlpha(s.peakAlpha, s.age / s.spec.life, s.degraded) }));
  }

  /** Live displaced-water envelopes (one per tracked source). */
  get liveChopEnvelopes(): number {
    return this.chop.size;
  }

  private makeWakeDot(): Graphics {
    const g = new Graphics();
    // Drawn WHITE + tinted per spawn, so a personal-hue recolor is a cheap tint
    // swap on the pool rather than a redraw — and since Story 4.12 the tint is
    // PER SOURCE (every visible hull lays its own wake, amendment 199).
    g.circle(0, 0, CLIENT_CONFIG.wake.radius).fill({ color: CLIENT_CONFIG.colors.white, alpha: 1 });
    g.visible = false;
    this.foamLayer.addChild(g);
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
    if (kind === 'wake') this.spawnWake(x, y, intensity, CLIENT_CONFIG.colors.amber, CONFIG.vision.wakeLifeMs);
    else this.spawnOneShot(kind, x, y, radius);
  }

  /**
   * One foam dot, at the SOURCE'S OWN ribbon life — the SHARED clock, so the
   * water you see and the track that paints run out together (amendment 204:
   * one wake, one length). That is `CONFIG.vision.wakeLifeMs` for a hull and
   * `torpWakeLifeMs()` (half of it) for a fish, both read off the ribbon rather
   * than restated here, because a second spelling of a lifetime is how the two
   * renderings fork.
   *
   * A dot lives ~11× longer than it did before Story 4.12, which is why this
   * path has the `document.hidden` early-out `spawnOneShot` has always had and
   * a `capOldest` ceiling it never had.
   */
  private spawnWake(x: number, y: number, intensity: number, color: number, lifeMs: number): void {
    // Backgrounded tab: the render loop that ages and retires these is
    // throttled, so a spawn here would sit in the pool for as long as the tab
    // stays hidden. Same rule, same reason, as the one-shot path.
    if (typeof document !== 'undefined' && document.hidden) return;
    const g = this.wakePool.acquire();
    g.position.set(x, y);
    g.scale.set(1);
    g.tint = color; // the SOURCE's personal hue (Story 1.12, per hull since 4.12)
    g.visible = true;
    const baseAlpha = CLIENT_CONFIG.wake.alpha * intensity;
    g.alpha = baseAlpha;
    // A non-positive / non-finite life would divide by zero in `ageWake`; the
    // shared model already degrades a bad `lifeMs` to 0, so fail to "gone".
    const life = Number.isFinite(lifeMs) && lifeMs > 0 ? lifeMs / 1000 : 0;
    if (life <= 0) {
      this.retire(g, this.wakePool);
      return;
    }
    this.wake.push({ gfx: g, age: 0, life, baseAlpha });
    // A RUNAWAY BACKSTOP, not a budget (see CLIENT_CONFIG.wake.maxDots): the
    // oldest dots go first, which is the faintest, most nearly expired water.
    for (const p of capOldest(this.wake, CLIENT_CONFIG.wake.maxDots)) {
      this.retire(p.gfx, this.wakePool);
    }
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
    // The budget runs AFTER the motion gate (a suppressed flash must not spend
    // an onset) and BEFORE the pool acquire (a coalesced duplicate never takes a
    // Graphics it will not draw).
    const verdict = this.arbitrate(kind, x, y);
    if (verdict === 'collapsed') return;
    const pool = isFogImmuneEffect(kind) ? this.burstPool : this.shotPool;
    const g = pool.acquire();
    g.clear();
    g.visible = true;
    g.alpha = 1;
    g.scale.set(1);
    g.position.set(x, y);
    this.shots.push({ gfx: g, kind, spec, peakAlpha, degraded: verdict === 'degrade', x, y, age: 0, pool });
  }

  /**
   * The two budget stages, in the ratified order: COALESCE first (co-located
   * same-kind flashes inside ONE frame are one fact, so they collapse to one
   * draw and only the survivor claims), then CLAIM. `collapsed` is the only
   * outcome that does not draw, and it is not a deletion: the mark it collapsed
   * into is being drawn at the same point in the same frame — which is true
   * only for the kinds `isCoalescableFlash` admits (the `burst`, alone, carries
   * a per-spawn radius and is therefore never collapsed).
   */
  private arbitrate(kind: Exclude<EffectKind, 'wake'>, x: number, y: number): FlashVerdict | 'collapsed' {
    const gate = this.gate;
    if (gate === null || !isBudgetedFlash(kind)) return 'animate';
    if (isCoalescableFlash(kind) && !gate.first(kind, x, y, this.frameId)) return 'collapsed';
    return gate.claim(x, y);
  }

  /**
   * Advance all effects by `dt` (seconds) and lay this frame's wake.
   *
   * `hulls` IS EVERY HULL THE PLAYER CAN SEE (amendment 199) — own predicted
   * pose, every truesight contact, drones included — not just the own ship.
   * Before Story 4.12 this took a single `ShipState` and enemy hulls glided
   * across the water leaving nothing at all; the wake was a UI element attached
   * to the camera rather than a property of the world, and the thing on the
   * water disagreed with the thing on the scope.
   *
   * `nowMs` is SERVER time, the same clock the ribbon's samples and the radar's
   * age buckets are stamped in — not `performance.now()`. Two clocks here would
   * age the water differently in the two renderings.
   *
   * A decoy needs no mention and gets none (amendment 201): it is frozen at its
   * drop pose, never travels one sample cadence, and therefore lays nothing.
   */
  update(dt: number, nowMs: number, hulls: readonly WakeHull[] = []): void {
    this.frameId++; // the coalescer's frame boundary (see `frameId`)
    this.layWake(nowMs, hulls);
    this.ageWake(dt);
    this.ageShots(dt);
  }

  /** Sample every visible hull onto its ribbon, spawn foam on the cadence, then
   *  redraw the displaced-water envelopes and release spent sources. */
  private layWake(nowMs: number, hulls: readonly WakeHull[]): void {
    this.livePose.clear();
    for (const h of hulls) {
      this.livePose.set(h.id, h);
      // FOAM FOLLOWS THE SEGMENT, NOT THE SAMPLE. The first sample onto an empty
      // ribbon always stores (there is nothing to measure a cadence against), so
      // spawning on `stored` alone would put one dot under a hull that has never
      // moved — a decoy, or a ship at anchor. Water is only disturbed once a
      // hull has actually travelled a cadence, which is exactly `count > 1`, and
      // it is the same predicate the scope uses (one segment, one stamp).
      const stored = this.wakeSources.observe(h, nowMs);
      const src = this.wakeSources.get(h.id);
      if (stored && src !== undefined && src.ribbon.count > 1) this.spawnFoam(h, src);
    }
    this.wakeSources.prune(nowMs);
    this.wakeSources.each((src) => this.drawChop(src, nowMs));
    this.retireChop();
  }

  /**
   * One foam dot at the source's STERN — where foam physically is. The RIBBON
   * stores the hull's CENTRE (that is what `World.sampleWakes` appends, and the
   * two must land on the same lattice cells at the truesight seam); the offset
   * lives here, in the rendering, exactly as amendment 204 frames it: one
   * geometry, two renderings of it.
   *
   * A TORPEDO HAS NO STERN AND NO ENVELOPE (cycle-69 review gate, P10): the fish
   * is a point on the water, so its foam lands on the ribbon's own sample and it
   * is either running at its fixed speed or it is gone — there is no speed
   * fraction to scale by. The DOT ITSELF is the same size for every source,
   * because its radius is derived from the shared along-track cadence (half of
   * `wakeSampleU`, so consecutive dots touch); a source's WIDTH is carried by
   * the Kelvin envelope instead, which is width-derived and where the scope
   * carries it too.
   */
  private spawnFoam(h: WakeHull, src: WakeSource): void {
    const life = src.ribbon.lifeMs;
    if (h.cls === 'torp') {
      this.spawnWake(h.x, h.y, 1, h.color, life);
      return;
    }
    const env = hullEnvelope(h.cls);
    const half = env.hull.length / 2;
    const speed = Math.abs(h.speed);
    const intensity = Math.min(speed / env.kinematics.maxSpeed, 1);
    this.spawnWake(h.x - Math.cos(h.heading) * half, h.y - Math.sin(h.heading) * half, intensity, h.color, life);
  }

  /** Scratch centre-line for the envelope: ONE array, truncated and refilled
   *  per source per frame and consumed synchronously (its point objects are
   *  per-frame; the array itself never reallocates). */
  private readonly chopPts: ChopPoint[] = [];

  /**
   * Collect one source's envelope centre-line, oldest water first.
   *
   * The live hull pose is appended LAST, at the freshest bucket, so the wedge
   * stays attached to the hull between sample cadences instead of ending 12u
   * astern and visibly stepping forward every third of a second. A source with
   * no live pose (a hull that sank, or sailed out of truesight — amendment
   * 200's fading track) simply ends at its newest stored water.
   */
  private chopCentreLine(src: WakeSource, nowMs: number): ChopPoint[] {
    const pts = this.chopPts;
    pts.length = 0;
    const w = src.ribbon.widthU;
    let tipX = 0;
    let tipY = 0;
    eachWakeSegment(src.ribbon, nowMs, (s) => {
      pts.push({ x: s.ax, y: s.ay, hw: chopHalfWidthU(w, s.bucket) });
      tipX = s.bx;
      tipY = s.by;
    });
    if (pts.length === 0) return pts;
    pts.push({ x: tipX, y: tipY, hw: chopHalfWidthU(w, 0) });
    const live = this.livePose.get(src.id);
    if (live !== undefined) pts.push({ x: live.x, y: live.y, hw: chopHalfWidthU(w, 0) });
    return pts;
  }

  /** Redraw one source's displaced-water envelope. Never motion-gated: this is
   *  information, and `motion: 'off'` removes motion, never information. */
  private drawChop(src: WakeSource, nowMs: number): void {
    const g = this.chopFor(src.id);
    const pts = this.chopCentreLine(src, nowMs);
    g.clear();
    g.visible = pts.length >= 2;
    if (!g.visible) return;
    g.poly(chopOutline(pts)).fill({ color: src.color, alpha: CLIENT_CONFIG.wake.chopAlpha });
  }

  private chopFor(id: string): Graphics {
    let g = this.chop.get(id);
    if (g === undefined) {
      g = new Graphics();
      this.chopLayer.addChild(g);
      this.chop.set(id, g);
    }
    return g;
  }

  /** Destroy the envelope of any source the tracker has released — bounded by
   *  the tracker's own lifecycle, so there is no second retirement clock. */
  private retireChop(): void {
    for (const [id, g] of this.chop) {
      if (this.wakeSources.get(id) !== undefined) continue;
      g.destroy();
      this.chop.delete(id);
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
    // The RADIUS ramp is untouched by a degrade: a splash ring's expansion is
    // the mark's shape, and it already draws exactly like this at `motion: 'off'`
    // (the non-juice one-shots were never motion-gated). What a degrade spends is
    // the luminance CHANGE — the thing a flash actually is.
    const r = spec.r0 + (spec.r1 - spec.r0) * k;
    const a = oneShotAlpha(s.peakAlpha, k, s.degraded);
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
