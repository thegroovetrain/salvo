// THE STAGED WORST-CASE SCENE — wiring shell (Story 4.8, amendment 242).
//
// DEV-ONLY, AND UNREACHABLE IN PRODUCTION BY CONSTRUCTION. The only reference to
// this module anywhere is a dynamic `import()` inside an `import.meta.env.DEV`
// branch in main.ts. Vite substitutes `false` for that expression in a
// production build before Rollup runs, so the branch is dead code, the dynamic
// import is eliminated with it, and this module is never emitted into the
// bundle. `STAGE_MARKER` exists so that claim is CHECKED rather than asserted —
// grep the built assets for it (client/scripts/readabilityCapture.mjs --verify-bundle).
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

import type { Room } from '@colyseus/sdk';
import { CONFIG, generateMap, type GameMap, type ShipClassId } from '@salvo/shared';
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
  scenePublicPlane,
  sceneFrame,
  sceneWelcome,
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
  /** Drop every sample and start a fresh measurement window. */
  resetSamples(): void;
  /** The samples collected since the last reset. */
  samples(): FrameSample[];
  /** Summary statistics over the current samples (null under 2 frames). */
  stats(): FrameStats | null;
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
 * Build and start the staged worst-case scene. Returns the harness the headless
 * capture script drives; it is also published on `window.__hcStage`.
 */
export function runWorstCaseScene(deps: StageDeps): StageHarness {
  const map = generateMap(STAGE_MAP_SEED, CONFIG.map.playerCap);
  const world = buildSceneWorld(map.radius, STAGE_SEED);
  const now = performance.now();
  const serverT = now + SCENE_EPOCH_MS;
  const { room, state } = makeRoom(world, serverT);
  const sink: FrameSink = { handler: () => undefined };
  const conn: Connection = { room, welcome: sceneWelcome(map.radius, serverT), sink };

  const game = deps.start(conn, map, OWN_CLASS);
  game.camera.snapTo(world.ownStart);

  const pump = new ScenePump(world, sink, state, now);
  pump.primeFirst();
  const store = new SampleStore();
  let acc = 0;
  deps.stage.app.ticker.add((ticker) => {
    pump.advance(performance.now());
    acc = driveFrame(game.callbacks, acc, ticker.deltaMS / 1000, store);
  });

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
      game.fog.rebake(deps.stage.app.screen.width, deps.stage.app.screen.height, game.camera.zoom);
    },
    zoom: () => game.camera.userZoom,
    clusterScreen: () => game.camera.worldToScreen(clusterCentre(world, pump.tick)),
    shots: () => game.effects.liveShots.map((s) => ({ kind: s.kind, degraded: s.degraded, alpha: s.alpha })),
    resetSamples: () => store.reset(),
    samples: () => store.all(),
    stats: () => store.stats(),
  };
  (window as unknown as Record<string, unknown>).__hcStage = harness;
  return harness;
}
