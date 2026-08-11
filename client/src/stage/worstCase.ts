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
import { CONFIG, generateMap, type GameMap, type ShipClassId, type WelcomeMsg } from '@salvo/shared';
import type { Connection, FrameSink } from '../net/connection.js';
import type { Stage } from '../render/stage.js';
import type { LoopCallbacks } from '../app/loop.js';
import {
  OWN_CLASS,
  SCENE_TICK_MS,
  STAGE_MARKER,
  STAGE_SEED,
  buildSceneWorld,
  scenePublicPlane,
  sceneFrame,
  type SceneRosterRow,
  type SceneWorld,
} from './worstCaseScene.js';

/** The map seed the staged ocean is generated from (deterministic, like a room's). */
const STAGE_MAP_SEED = 20260811;

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

export interface FrameStats {
  frames: number;
  fps: number;
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
  };
  fog: { rebake(w: number, h: number, zoom: number): void };
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
function makeRoom(world: SceneWorld): { room: Room; state: Record<string, unknown> } {
  const state: Record<string, unknown> = {
    ...scenePublicPlane(world, 0),
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

/** The staged welcome. `t` is the client clock, so the ServerClock's offset is
 *  ~0 and `serverNow()` tracks `performance.now()` — one clock, no skew to model. */
function makeWelcome(map: GameMap, now: number): WelcomeMsg {
  return {
    sessionId: 'hc00',
    mapSeed: STAGE_MAP_SEED,
    mapRadius: map.radius,
    playerCap: CONFIG.map.playerCap,
    t: now,
    config: CONFIG,
    radarGrammar: 'silhouette',
    radarIdentity: 'roster',
  };
}

/** Pumps staged frames into the real frame sink on the sim cadence. */
class ScenePump {
  private ticks = 0;

  constructor(
    private readonly world: SceneWorld,
    private readonly sink: FrameSink,
    private readonly state: Record<string, unknown>,
    private readonly startedAt: number,
  ) {}

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
    const serverT = this.startedAt + this.ticks * SCENE_TICK_MS;
    Object.assign(this.state, scenePublicPlane(this.world, serverT));
    this.sink.handler(sceneFrame(this.world, this.ticks, serverT));
  }
}

/** Sample collector with a bounded ring. */
class SampleStore {
  private items: FrameSample[] = [];
  private firstAt = 0;
  private lastAt = 0;

  push(s: FrameSample): void {
    const now = performance.now();
    if (this.items.length === 0) this.firstAt = now;
    this.lastAt = now;
    this.items.push(s);
    if (this.items.length > SAMPLE_CAP) this.items.shift();
  }

  reset(): void {
    this.items = [];
    this.firstAt = 0;
    this.lastAt = 0;
  }

  all(): FrameSample[] {
    return [...this.items];
  }

  stats(): FrameStats | null {
    if (this.items.length < 2) return null;
    const span = Math.max(1, this.lastAt - this.firstAt);
    return {
      frames: this.items.length,
      fps: ((this.items.length - 1) * 1000) / span,
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
  const { room, state } = makeRoom(world);
  const now = performance.now();
  const sink: FrameSink = { handler: () => undefined };
  const conn: Connection = { room, welcome: makeWelcome(map, now), sink };

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
    resetSamples: () => store.reset(),
    samples: () => store.all(),
    stats: () => store.stats(),
  };
  (window as unknown as Record<string, unknown>).__hcStage = harness;
  return harness;
}
