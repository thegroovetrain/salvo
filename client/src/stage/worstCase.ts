// THE STAGED WORST-CASE SCENE — wiring shell (Story 4.8, amendment 242;
// extended for the NFR1 measurement by Story 7.1).
//
// UNREACHABLE IN THE SHIPPED BUILD BY CONSTRUCTION. The only reference to this
// module anywhere is a dynamic `import()` inside a `(import.meta.env.DEV ||
// __HC_PERF__)` branch in main.ts. Vite substitutes `false` for BOTH terms in
// the shipped build before Rollup runs, so the branch is dead code, the dynamic
// import is eliminated with it, and this module is never emitted into the
// bundle. `STAGE_MARKER` exists so that claim is CHECKED rather than asserted —
// grep the built assets for it (client/scripts/readabilityCapture.mjs --verify-bundle).
//
// `__HC_PERF__` is the PERF BUILD's door (`vite build --mode perf` → `dist-perf`):
// production-identical output that keeps the instrument, so NFR1's frame-budget
// verdict is taken on a real bundle instead of a Vite dev server.
//
// It stages the scene by feeding synthetic frames into the REAL client pipeline:
// the same `buildGame()` the live game uses, against a stub room whose `state` is
// the ordinary polled public plane and whose frame sink is driven from here.
// Nothing downstream of `bindRoom` is mocked — the arbitration under test
// (render/attention.ts, render/flashBudget.ts) runs exactly as it ships, which is
// the difference between an artifact and an assertion.
//
// THE HARNESS SURFACE lives on `window.__hcStage` and is what the headless
// capture script drives: set the zoom, read the frame-cost samples, know when the
// scene has warmed up.

import type { Container } from 'pixi.js';
import type { Room } from '@colyseus/sdk';
import { CONFIG, generateMap, type GameMap, type ShipClassId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import type { Connection, FrameSink } from '../net/connection.js';
import type { Stage } from '../render/stage.js';
import type { LoopCallbacks } from '../app/loop.js';
import {
  OWN_CLASS,
  SCENE_EPOCH_MS,
  SCENE_TICK_MS,
  STAGE_MAP_SEED,
  STAGE_MARKER,
  STAGE_SEED,
  buildSceneWorld,
  clusterCentre,
  sceneProfile,
  scenePublicPlane,
  sceneFrame,
  sceneWelcome,
  type SceneProfile,
  type SceneRosterRow,
  type SceneWorld,
} from './worstCaseScene.js';

/**
 * Scene ticks that must have run before the harness reports `ready`, so a
 * capture shows a battle in progress — phosphor laid, wake ribbons drawn, plumes
 * drifting, the flash windows already saturated — rather than an empty ocean one
 * tick old.
 *
 * WARMED IN REAL TIME, NOT PUMPED SYNCHRONOUSLY. An earlier draft primed these
 * ticks in one blocking burst before the first frame; that spawns ~30 one-shot
 * effects per tick with no `Effects.update()` between them to age any of them
 * out, so the pool fills with thousands of live sprites that all age from the
 * same instant. The scene it warms up to is not the scene the capture is of.
 */
const WARMUP_TICKS = 120; // 6 s of scene time

/** How many recent frame-cost samples the harness keeps per measurement run. */
const SAMPLE_CAP = 600;

/** Spiral-of-death clamp, the same one app/loop.ts applies (s). */
const MAX_FRAME_DT = 0.25;

/**
 * PLAUSIBLE MEDIAN PRESENT INTERVALS for a real display (ms). Outside this band
 * `PresentStats.vsyncTrusted` goes false and the cadence leg of the verdict must
 * be refused rather than reported.
 *
 * The upper bound catches the failure this exists for: headless Chromium paces
 * rAF off a timer, not a display, and lands far above any real refresh rate —
 * the 2026-08-11 run measured ~350 ms/present and reported it as 2.8 fps beside
 * a 1.1 ms frame time. 20 ms sits just above a 50 Hz panel's 20.0 ms while
 * excluding anything slower than ~50 Hz, and a machine genuinely presenting
 * below 50 Hz has no business issuing a 60 fps verdict either way.
 *
 * The lower bound catches the opposite fake: a browser running rAF FREE of
 * vsync (`--disable-gpu-vsync`, an offscreen surface) reports intervals well
 * under any panel's period. 4 ms excludes everything faster than 250 Hz, which
 * is above every display this project will ever be measured on.
 */
const VSYNC_MIN_MS = 4;
const VSYNC_MAX_MS = 20;

/**
 * A present interval past this counts as a DROPPED frame rather than jitter
 * (ms). 25 ms is one and a half 60 Hz periods: a single missed vsync registers,
 * ordinary scheduling noise around 16.7 ms does not.
 */
const LONG_PRESENT_MS = 25;

/**
 * The motion scale handed to `Camera.tickZoom` by `setReveal()`. Zero means
 * ARRIVE — the camera's own `motion: off` path (epic-5 amendment 26 scales the
 * DURATION, never the destination), so the framing this lands on is exactly the
 * framing a player with `motion: full` eventually reaches. A measurement window
 * opened while the zoom was still travelling would average frames drawn at
 * several different terrain loads, which is the one thing the reveal leg exists
 * to measure.
 */
const REVEAL_ARRIVE_NOW = 0;

const SIM_DT = CONFIG.tick.simDtMs / 1000; // s

/** One frame's measured cost (ms), split the way the loop already splits work. */
export interface FrameSample {
  /** Total time inside the loop callbacks for this frame (sim + render). */
  total: number;
  /** Time inside `simTick` this frame (0..N fixed steps). */
  sim: number;
  /** Time inside `render`. */
  render: number;
}

export interface SeriesStats {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

/**
 * Cost samples over one measurement window — A DEV SEAM ONLY, deliberately NOT
 * the story's cost evidence (Eric ruling 2026-08-11).
 *
 * THERE IS NO `fps` FIELD AND THERE MUST NOT BE ONE. The first run of this gate
 * reported "17 frames in 6 s (2.8 fps)" beside a 1.1 ms frame time — two numbers
 * that cannot both be true, because headless Chromium throttles
 * `requestAnimationFrame` and the frame COUNT was measuring the throttle. Eric
 * also rules a Vite DEV build an invalid basis for an NFR1 verdict at all ("the
 * dev build runs poorly on my machine"). The per-callback times below are real
 * measurements of real work and are useful when a human drives the scene by
 * hand; they are not a frame-rate verdict, and the capture script no longer
 * reports them. The story's cost evidence is
 * `client/src/__benchmarks__/attentionSeam.bench.ts`.
 */
export interface FrameStats {
  frames: number;
  total: SeriesStats;
  sim: SeriesStats;
  render: SeriesStats;
}

/**
 * PRESENT CADENCE over one measurement window (Story 7.1) — a SEPARATE struct
 * from `FrameStats`, and separate on purpose.
 *
 * `FrameStats` measures WORK (time inside our own callbacks) and its comment
 * above records why it must never grow an `fps` field. This one measures
 * PRESENTS — the interval between consecutive `requestAnimationFrame`
 * timestamps, which is the only place a real frame rate can come from. The two
 * cannot be merged, because they have different validity conditions and the
 * whole 2026-08-11 defect was reporting one as if it were the other.
 *
 * IT IS TRUSTWORTHY ONLY UNDER A REAL VSYNC SOURCE, and it says so rather than
 * leaving the reader to guess. Headless Chromium throttles rAF (the run that
 * produced "17 frames in 6 s" was measuring the throttle, not the renderer), and
 * a browser with no display attached has no vsync to pace against at all. So
 * `vsyncTrusted` is the struct's own verdict on whether its numbers mean
 * anything, and a capture that finds it false must REFUSE the cadence leg rather
 * than publish a number.
 */
export interface PresentStats {
  /** Presents observed since the last `resetSamples()`. */
  frames: number;
  /** Interval between consecutive presents (ms). */
  intervalMs: SeriesStats;
  /** Presents that overran `LONG_PRESENT_MS` — i.e. a dropped frame, not jitter. */
  longFrames: number;
  /**
   * False when the median interval is implausible for a real display, which is
   * the headless-throttle signature. See `vsyncPlausible`.
   */
  vsyncTrusted: boolean;
}

/**
 * Entity and sprite population at the instant it is asked for (Story 7.1). The
 * frame-time split alone cannot say WHY a frame cost what it cost; the AC wants
 * counts alongside it.
 *
 * The scene-graph numbers are read off the live Pixi containers rather than
 * inferred from the staged world, because those are the objects the renderer
 * actually walks — a hull the client has not drawn yet costs nothing.
 */
export interface SceneCounts {
  /** Staged hulls, including the local captain. */
  hulls: number;
  /** Hulls the client holds as live truesight contacts (the near band). */
  contacts: number;
  /** Nodes on the radar-paint layer. */
  blips: number;
  /** Nodes on the projectile layer (shells + torpedo tracks). */
  projectiles: number;
  /** Live one-shot effects — the flash budget's own population. */
  effects: number;
  /** Every node in the Pixi scene graph, the whole tree under the stage root. */
  sprites: number;
}

/** The window surface the headless capture script drives. */
export interface StageHarness {
  marker: string;
  seed: number;
  /** Resolves once the scene has warmed up and drawn its first frames. */
  ready: Promise<void>;
  /** The same answer as `ready`, pollable — a headless driver wants a predicate
   *  it can put a timeout on rather than a promise that could never settle. */
  warmedUp(): boolean;
  /** Scene ticks pumped so far. */
  tick(): number;
  /** Set the alive user-zoom factor (clamped [0.5, 1.5] by the camera) and
   *  re-bake the fog for it, exactly as the live zoom path does. */
  setZoom(z: number): void;
  zoom(): number;
  /**
   * The hot flash cluster's CURRENT screen position (px), for the degrade
   * close-up. The cluster rides a fixed offset off the own bow and the own hull
   * orbits, so its screen position is only knowable by projecting it through
   * the live camera — a fixed crop rectangle would drift off it within seconds.
   */
  clusterScreen(): { x: number; y: number };
  /**
   * Every live one-shot's LATCHED budget verdict and current alpha — the ground
   * truth behind the degrade close-up. Without it the close-up is a picture of
   * some rings and nobody can say which of them the budget degraded, which is
   * the one question `degradeAlphaFactor` has to be ruled on.
   */
  shots(): LiveShot[];
  /** Drop every sample and start a fresh measurement window — cost samples AND
   *  present intervals, so one reset opens one window over both. */
  resetSamples(): void;
  /** The samples collected since the last reset. */
  samples(): FrameSample[];
  /** Summary statistics over the current samples (null under 2 frames). */
  stats(): FrameStats | null;
  /** Present cadence over the same window (null under 2 intervals). */
  presentStats(): PresentStats | null;
  /** Entity + sprite population right now. */
  counts(): SceneCounts;
  /**
   * Drive the OMNISCIENT REVEAL framing (Story 5.3's whole-ocean pull-back) on
   * or off — the known-worst and never-measured case, because it draws every
   * island coastline and every contour band on the disc at once.
   *
   * It ARRIVES rather than eases (see the implementation): a measurement window
   * opened mid-travel would average a moving zoom, and the zoom is exactly what
   * decides how much terrain is on screen.
   */
  setReveal(on: boolean): void;
  /** Which staged population is live — `readability` or `nfr1`. */
  profile(): string;
}

/**
 * The staged game, as this shell sees it. STRUCTURAL on purpose: the shell must
 * not import main.ts (which runs its own bootstrap at import time), and it needs
 * nothing from `Game` beyond the loop callbacks, the camera and the fog.
 */
export interface StagedGameHandle {
  callbacks: LoopCallbacks;
  camera: {
    setUserZoom(f: number): void;
    readonly userZoom: number;
    readonly zoom: number;
    snapTo(p: { x: number; y: number }): void;
    worldToScreen(p: { x: number; y: number }): { x: number; y: number };
    /** Story 5.3's reveal framing, driven here by `setReveal()`. The camera
     *  computes the factor from its OWN live radarRange, so this shell never
     *  re-derives a framing number. */
    beginReveal(mapRadius: number, margin: number, rate: number): void;
    /** Advances the reveal easing; a motionScale of 0 ARRIVES on the spot,
     *  which is the only cadence a measurement window can use. */
    tickZoom(dtMs: number, motionScale: number): void;
    /** Leaves the reveal framing and returns the factor to 1. */
    resetZoomFactor(): void;
  };
  fog: { rebake(w: number, h: number, zoom: number): void };
  /** The one-shot layer, for its budget seam (`liveShots`) — see `shots()`. */
  effects: { readonly liveShots: readonly LiveShot[] };
}

/** One live one-shot's budget state, as `Effects.liveShots` reports it. */
export interface LiveShot {
  kind: string;
  degraded: boolean;
  alpha: number;
}

/** Everything the shell needs from main.ts, injected rather than imported. */
export interface StageDeps {
  /** The raw `?profile=` query value, resolved by `sceneProfile()`. `null` (the
   *  Story 4.8 URL) stages the ratified readability population. */
  profile?: string | null;
  stage: Stage;
  /** Build the real Game against the stub connection and hand back its loop
   *  callbacks + the two surfaces the zoom path touches. */
  start: (conn: Connection, map: GameMap, cls: ShipClassId) => StagedGameHandle;
}

/** Percentile over an already-sorted ascending array. */
function pct(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

/** Mean/p50/p95/max over one series. */
function series(values: readonly number[]): SeriesStats {
  if (values.length === 0) return { mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, v) => acc + v, 0);
  return { mean: sum / values.length, p50: pct(sorted, 50), p95: pct(sorted, 95), max: sorted[sorted.length - 1] };
}

/** A roster row as the schema's `players` map surface exposes it. */
type RosterMeta = { id?: string; name?: string; color?: number; kills?: number; alive?: boolean };

/**
 * The stub roster — the exact surface `publicState()` reads: `size`, `get(id)`
 * and `forEach`. A bare `Map` would satisfy `get`/`size`, but its `forEach` hands
 * (value, key) and the roster scans read `meta.id`, so rows carry their own id
 * and iteration yields values only.
 */
class SceneRoster {
  private readonly rows = new Map<string, RosterMeta>();

  constructor(rows: readonly SceneRosterRow[]) {
    for (const r of rows) this.rows.set(r.id, { ...r });
  }

  get size(): number {
    return this.rows.size;
  }

  get(id: string): RosterMeta | undefined {
    return this.rows.get(id);
  }

  forEach(fn: (meta: RosterMeta) => void): void {
    this.rows.forEach((meta) => fn(meta));
  }
}

/**
 * The stub room. `state` is a plain object because that is exactly what
 * `publicState()` treats it as; every listener the client registers is accepted
 * and never fired (the staged scene never leaves, errors, drops or reconnects).
 */
function makeRoom(world: SceneWorld, serverT: number): { room: Room; state: Record<string, unknown> } {
  const state: Record<string, unknown> = {
    // Seeded at the staged server time, never at 0: the plane anchors the zone
    // timeline at `serverNow − 175s`, so a zero here would publish a NEGATIVE
    // anchor on the very first polled frame and `barVisible()` would (rightly)
    // refuse to draw the chrome bar against it.
    ...scenePublicPlane(world, serverT),
    players: new SceneRoster(world.roster),
  };
  const noop = (): void => undefined;
  const room = {
    state,
    send: noop,
    leave: () => Promise.resolve(0),
    onMessage: noop,
    onError: noop,
    onLeave: noop,
    onDrop: noop,
    onReconnect: noop,
    onStateChange: noop,
    reconnection: { enabled: false, maxRetries: 0 },
  };
  return { room: room as unknown as Room, state };
}

/**
 * Pumps staged frames into the real frame sink on the sim cadence.
 *
 * TWO CLOCKS, DELIBERATELY SEPARATE. `startedAt` is the CLIENT clock
 * (`performance.now()`) and paces the pump; `serverBase` is the staged SERVER
 * clock (`startedAt + SCENE_EPOCH_MS`) and stamps everything that leaves it.
 * Stamping frames with the client clock is what hid the chrome bar for a whole
 * capture — see SCENE_EPOCH_MS.
 */
class ScenePump {
  private ticks = 0;
  private readonly serverBase: number;

  constructor(
    private readonly world: SceneWorld,
    private readonly sink: FrameSink,
    private readonly state: Record<string, unknown>,
    private readonly startedAt: number,
  ) {
    this.serverBase = startedAt + SCENE_EPOCH_MS;
  }

  get tick(): number {
    return this.ticks;
  }

  /** Advance the scene to `nowMs` (client clock). Bounded per call so a long
   *  hitch cannot spend a whole frame catching up a backlog. */
  advance(nowMs: number): void {
    const due = Math.floor((nowMs - this.startedAt) / SCENE_TICK_MS);
    const limit = Math.min(due, this.ticks + 4);
    while (this.ticks < limit) this.advanceOne();
  }

  private advanceOne(): void {
    this.ticks += 1;
    this.emit();
  }

  /** Emit exactly ONE tick, before the loop starts. The live client renders
   *  frames before its first `you` arrives and every reader is null-safe, but
   *  there is no reason for the staged scene's first drawn frame to be the
   *  degenerate one — this puts an own ship, a roster and a stat set in place
   *  before the first render rather than one frame after it. */
  primeFirst(): void {
    if (this.ticks === 0) this.advanceOne();
  }

  /**
   * Emit tick `n` stamped at `startedAt + n × 50ms` — NOT at `performance.now()`.
   * Several ticks can be emitted inside one animation frame (the catch-up
   * branch), and stamping them all with the same instant would push duplicate
   * timestamps into the snapshot buffers that contact interpolation divides
   * against. A tick-derived stamp is monotonic, evenly spaced, and tracks real
   * time to within one tick, which is what the server clock's offset estimate
   * and everything downstream of it want.
   */
  private emit(): void {
    const serverT = this.serverBase + this.ticks * SCENE_TICK_MS;
    Object.assign(this.state, scenePublicPlane(this.world, serverT));
    this.sink.handler(sceneFrame(this.world, this.ticks, serverT));
  }
}

/**
 * Is this present cadence coming from a real display? PURE, and exported so a
 * test can pin the refusal without a browser — the whole value of
 * `vsyncTrusted` is that it fails closed, and a flag nothing exercises is a flag
 * that quietly stops failing.
 *
 * IT IS ASKED OF THE FASTEST INTERVALS, NEVER THE MEDIAN, AND THAT DISTINCTION
 * IS THE WHOLE POINT (Story 7.1). The first draft tested the MEDIAN, which
 * conflates two completely different facts: "there is no real vsync source
 * here" and "there is one, and the game is missing half its deadlines." A run
 * genuinely presenting at 30 FPS has a median of ~33 ms and was therefore
 * reported as UNTRUSTWORTHY — so the instrument answered a measured 30 FPS with
 * a refusal, hiding the bad news behind a flag that reads like a clean run. It
 * failed OPEN, in the one direction that matters.
 *
 * The fastest intervals measure what the display is CAPABLE of, which is the
 * question actually being asked. A 60 Hz panel keeps a floor near 16.7 ms even
 * while it drops frames; headless Chromium's throttle has no fast intervals at
 * all (the 2026-08-11 run measured ~350 ms per present, floor included). So the
 * floor separates the two cases cleanly and the median is free to report the
 * bad news it was always supposed to report.
 */
export function vsyncPlausible(fastestIntervalMs: number): boolean {
  if (!Number.isFinite(fastestIntervalMs) || fastestIntervalMs <= 0) return false;
  return fastestIntervalMs >= VSYNC_MIN_MS && fastestIntervalMs <= VSYNC_MAX_MS;
}

/**
 * The 5th-percentile interval — the cadence floor. Nearest-rank, and NOT the
 * outright minimum: one anomalously short interval (a coalesced present, a
 * timer hiccup) would otherwise vouch for a source that never presented fast
 * again.
 */
function cadenceFloorMs(intervals: readonly number[]): number {
  const s = [...intervals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(0.05 * s.length) - 1))];
}

/**
 * Summarize a series of present intervals. PURE and exported for the same
 * reason as `vsyncPlausible`: the struct's honesty is the feature.
 */
export function presentStatsFrom(intervals: readonly number[]): PresentStats | null {
  if (intervals.length < 2) return null;
  const intervalMs = series(intervals);
  return {
    frames: intervals.length + 1, // n intervals span n+1 presents
    intervalMs,
    longFrames: intervals.filter((v) => v > LONG_PRESENT_MS).length,
    vsyncTrusted: vsyncPlausible(cadenceFloorMs(intervals)),
  };
}

/**
 * Samples the REAL present cadence off `requestAnimationFrame` timestamps.
 *
 * A SEPARATE rAF CHAIN FROM THE TICKER, deliberately: Pixi's ticker callback is
 * where the frame's WORK happens, and timing the work from inside the work is
 * how the two numbers got conflated in the first place. This chain does nothing
 * but subtract two timestamps, so it observes the presentation rather than
 * participating in it.
 *
 * It uses the timestamp rAF HANDS IN rather than `performance.now()` — that
 * argument is the frame's presentation time, so it is not polluted by however
 * long the browser took to get around to calling us.
 */
class PresentSampler {
  private readonly intervals: number[] = [];
  private last = 0;

  /** Sampling begins on construction — a sampler that has to be switched on is
   *  a sampler that will one day be constructed and not switched on, and the
   *  window it would have missed is exactly the warm-up. */
  constructor() {
    const step = (t: number): void => {
      if (this.last > 0) {
        this.intervals.push(t - this.last);
        if (this.intervals.length > SAMPLE_CAP) this.intervals.shift();
      }
      this.last = t;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Drop the window. `last` is cleared too, so the first interval after a reset
   *  is a real gap between two presents rather than the span across the reset. */
  reset(): void {
    this.intervals.length = 0;
    this.last = 0;
  }

  stats(): PresentStats | null {
    return presentStatsFrom(this.intervals);
  }
}

/** Every node in a container's subtree, the container itself included. */
function nodeCount(root: Container): number {
  let n = 1;
  for (const child of root.children) n += nodeCount(child as Container);
  return n;
}

/** Sample collector with a bounded ring. */
class SampleStore {
  private items: FrameSample[] = [];

  push(s: FrameSample): void {
    this.items.push(s);
    if (this.items.length > SAMPLE_CAP) this.items.shift();
  }

  reset(): void {
    this.items = [];
  }

  all(): FrameSample[] {
    return [...this.items];
  }

  stats(): FrameStats | null {
    if (this.items.length < 2) return null;
    return {
      frames: this.items.length,
      total: series(this.items.map((s) => s.total)),
      sim: series(this.items.map((s) => s.sim)),
      render: series(this.items.map((s) => s.render)),
    };
  }
}

/**
 * The measured driver — app/loop.ts's fixed-step accumulator, reimplemented here
 * only so the sim and render halves can be timed separately. The cadence, the dt
 * clamp and the interpolation alpha are identical to the shipped loop.
 */
function driveFrame(cb: LoopCallbacks, acc: number, frameDt: number, store: SampleStore): number {
  let rest = acc + Math.min(frameDt, MAX_FRAME_DT);
  const t0 = performance.now();
  let sim = 0;
  while (rest >= SIM_DT) {
    const s0 = performance.now();
    cb.simTick(SIM_DT);
    sim += performance.now() - s0;
    rest -= SIM_DT;
  }
  const r0 = performance.now();
  cb.render(rest / SIM_DT, frameDt);
  const r1 = performance.now();
  store.push({ total: r1 - t0, sim, render: r1 - r0 });
  return rest;
}

/** Resolve once `done()` reports true, polled once per presented frame. */
function whenSettled(done: () => boolean): Promise<void> {
  return new Promise<void>((resolve) => {
    const step = (): void => {
      if (done()) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * The live population, half from the staged world and half from the Pixi scene
 * graph. Split out of the harness literal so the recursive walk is named and the
 * literal stays readable.
 *
 * `hulls` and `contacts` come from the WORLD because they are what the scene
 * staged; the rest come from the containers the renderer actually walks, so the
 * two halves answer different questions on purpose. A blip layer holding fewer
 * nodes than there are far hulls is not a discrepancy — the radar heatmap is one
 * sprite over a buffer, not a node per paint.
 */
function sceneCounts(stage: Stage, world: SceneWorld, game: StagedGameHandle): SceneCounts {
  return {
    hulls: world.hulls.length + 1, // + the local captain
    contacts: world.hulls.filter((h) => !h.far).length,
    blips: nodeCount(stage.layers.blip) - 1, // less the layer container itself
    projectiles: nodeCount(stage.layers.projectile) - 1,
    effects: game.effects.liveShots.length,
    sprites: nodeCount(stage.app.stage),
  };
}

/**
 * Enter or leave the OMNISCIENT REVEAL framing (Story 5.3) — the whole-ocean
 * pull-back, and the frame budget's known-worst never-measured case: at ~0.275x
 * every island coastline and every contour band on the disc is on screen at once.
 *
 * Driven through the camera's OWN reveal path rather than a second zoom rule
 * invented here. `beginReveal` derives the factor from the camera's live
 * radarRange and the map radius (epic-5 amendment 25 exempts the mode from the
 * 0.5x spectate clamp, which is what lets it reach that framing at all), and
 * `tickZoom` at motion scale 0 is the shipped `motion: off` branch — so the
 * framing ARRIVES on this call. That is deliberate for measurement: a window
 * opened while the zoom was still travelling would average frames drawn at
 * several different terrain loads, which is the one thing this leg exists to
 * measure. Amendment 26's law still holds, because motion scales the DURATION
 * and never the destination — this lands exactly where a `motion: full` player
 * eventually arrives.
 */
/**
 * The staged `Connection` — a stub room plus a synthesized welcome, in the exact
 * shape `buildGame` reads. Split out of `runWorstCaseScene` so the boot sequence
 * there stays one readable list of steps.
 */
function stageConnection(
  world: SceneWorld,
  mapRadius: number,
  serverT: number,
): { conn: Connection; sink: FrameSink; state: Record<string, unknown> } {
  const { room, state } = makeRoom(world, serverT);
  const sink: FrameSink = { handler: () => undefined };
  const conn: Connection = {
    room,
    welcome: sceneWelcome(mapRadius, serverT), sink,
    // Story 6.7's pre-bind capture: the staged scene has no server to re-send a
    // one-shot, so it starts empty and already bound.
    early: { results: null, bound: true },
  };
  return { conn, sink, state };
}

function applyReveal(game: StagedGameHandle, world: SceneWorld, on: boolean): void {
  if (!on) {
    game.camera.resetZoomFactor();
    return;
  }
  game.camera.beginReveal(world.mapRadius, CLIENT_CONFIG.reveal.mapFitMargin, CLIENT_CONFIG.reveal.zoomRate);
  game.camera.tickZoom(0, REVEAL_ARRIVE_NOW);
}

/**
 * Build and start the staged worst-case scene. Returns the harness the headless
 * capture script drives; it is also published on `window.__hcStage`.
 */
export function runWorstCaseScene(deps: StageDeps): StageHarness {
  const profile: SceneProfile = sceneProfile(deps.profile);
  const map = generateMap(STAGE_MAP_SEED, CONFIG.map.playerCap);
  const world = buildSceneWorld(map.radius, STAGE_SEED, profile);
  const now = performance.now();
  const serverT = now + SCENE_EPOCH_MS;
  const { conn, sink, state } = stageConnection(world, map.radius, serverT);

  const game = deps.start(conn, map, OWN_CLASS);
  game.camera.snapTo(world.ownStart);

  const pump = new ScenePump(world, sink, state, now);
  pump.primeFirst();
  const store = new SampleStore();
  const presents = new PresentSampler();
  let acc = 0;
  deps.stage.app.ticker.add((ticker) => {
    pump.advance(performance.now());
    acc = driveFrame(game.callbacks, acc, ticker.deltaMS / 1000, store);
  });

  /** Re-bake the fog composite for whatever the camera's zoom is NOW — the same
   *  thing the live zoom path does, and required after ANY zoom change, the
   *  reveal's included: the baked sight hole is sized in screen pixels. */
  const rebakeFog = (): void =>
    game.fog.rebake(deps.stage.app.screen.width, deps.stage.app.screen.height, game.camera.zoom);

  const harness: StageHarness = {
    marker: STAGE_MARKER,
    seed: STAGE_SEED,
    // Warmed in real time (see WARMUP_TICKS), so `ready` is the moment the scene
    // is a battle in progress rather than the moment it booted.
    ready: whenSettled(() => pump.tick >= WARMUP_TICKS),
    warmedUp: () => pump.tick >= WARMUP_TICKS,
    tick: () => pump.tick,
    setZoom: (z) => {
      game.camera.setUserZoom(z);
      rebakeFog();
    },
    zoom: () => game.camera.userZoom,
    clusterScreen: () => game.camera.worldToScreen(clusterCentre(world, pump.tick)),
    shots: () => game.effects.liveShots.map((s) => ({ kind: s.kind, degraded: s.degraded, alpha: s.alpha })),
    resetSamples: () => {
      store.reset();
      presents.reset();
    },
    samples: () => store.all(),
    stats: () => store.stats(),
    presentStats: () => presents.stats(),
    counts: () => sceneCounts(deps.stage, world, game),
    // The fog's baked sight hole is sized in SCREEN pixels, so it re-bakes on a
    // reveal exactly as it does on a wheel zoom.
    setReveal: (on) => {
      applyReveal(game, world, on);
      rebakeFog();
    },
    profile: () => profile.id,
  };
  (window as unknown as Record<string, unknown>).__hcStage = harness;
  return harness;
}
