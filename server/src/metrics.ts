// Story 0.3 — process-local operability metrics + the `/metrics` HTTP surface.
//
// This is adapter/ops code, NOT sim code. Time comes from a MONOTONIC source
// (`performance.now()`-derived) so an NTP step backwards can never stall the
// rate window; the source is swappable via `__setNowSource()` for deterministic
// tests (the same test-only convention as `resetMetrics()`). The sim purity rule
// that bans wall-clock reads applies to `shared/` and `game/`, not this
// Colyseus-side registry.
//
// Rooms feed the registry through a per-room handle (tick durations from the
// room's `update()`, inbound message counts from its `onMessage` handlers) and
// unregister on dispose. The `/metrics` endpoint reports:
//   - rooms/players from `matchMaker.stats.local` (process-local room/CCU),
//     degrading to registered-room count when matchMaker is unavailable.
//   - tick-duration p50/p95/max (ms) across ALL registered rooms' samples,
//     nearest-rank, plus a `samples` count so a zero is interpretable.
//   - inbound message ratePerSec = (sum of counts in the 60s window) / (window
//     seconds actually covered: min(60, seconds since the module first recorded
//     anything, floor >= 1)), so a lone burst in an idle minute reports its true
//     per-second average, not the burst size. `total` is since process start and
//     survives room unregistration (retired rooms' counts are folded forward).
//
// No third-party libs, no Prometheus format, no auth — JSON body only.

import { matchMaker, createEndpoint, createRouter } from 'colyseus';

/** Per-room tick-duration ring: last ~60s at 20Hz. */
const TICK_RING_CAPACITY = 1200;
/** One-second message buckets per room, covering a 60s window. */
const MESSAGE_BUCKET_COUNT = 60;

/** Handle a room uses to feed its own metrics; opaque to callers. */
export interface RoomMetricsHandle {
  recordTick(durationMs: number): void;
  recordMessage(): void;
  unregister(): void;
}

/** Shape returned by `metricsPayload()` / served at `/metrics`. */
export interface MetricsPayload {
  rooms: number;
  players: number;
  tick: { p50: number; p95: number; max: number; samples: number };
  messages: { ratePerSec: number; total: number };
}

interface MessageBucket {
  second: number;
  count: number;
}

interface RoomMetrics {
  ticks: number[];
  tickWrite: number;
  buckets: MessageBucket[];
  messageTotal: number;
}

// --- pure math helpers (exported for direct unit testing) ---------------------

/** Round to 2 decimal places. */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Nearest-rank percentile over an ascending-sorted array.
 * `p` is 0..100; returns 0 for an empty array.
 */
export function nearestRank(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const rank = Math.ceil((p / 100) * n);
  const idx = Math.min(Math.max(rank, 1), n) - 1;
  return sorted[idx];
}

/**
 * p50/p95/max (rounded ms) over combined tick samples, plus the sample count.
 * All zeros when there are no samples.
 */
export function computeTickPercentiles(samples: number[]): MetricsPayload['tick'] {
  const n = samples.length;
  if (n === 0) return { p50: 0, p95: 0, max: 0, samples: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: round2(nearestRank(sorted, 50)),
    p95: round2(nearestRank(sorted, 95)),
    max: round2(sorted[n - 1]),
    samples: n,
  };
}

// --- registry ----------------------------------------------------------------

const registry = new Map<string, RoomMetrics>();

/** Messages from rooms that have since unregistered, kept in the since-start total. */
let retiredMessageTotal = 0;
/** Monotonic second the module first recorded anything; null until first record. */
let firstRecordSec: number | null = null;

/** Monotonic clock source (ms); swappable for deterministic tests. */
let nowMs: () => number = () => performance.now();

/** Test-only: override the monotonic clock source (mirrors `resetMetrics`). */
export function __setNowSource(fn: () => number): void {
  nowMs = fn;
}

function nowSeconds(): number {
  return Math.floor(nowMs() / 1000);
}

/** Stamp the module's first-record second once, so the rate window can be covered. */
function markFirstRecord(): void {
  if (firstRecordSec === null) firstRecordSec = nowSeconds();
}

function makeRoomMetrics(): RoomMetrics {
  const buckets: MessageBucket[] = [];
  for (let i = 0; i < MESSAGE_BUCKET_COUNT; i++) buckets.push({ second: -1, count: 0 });
  return { ticks: [], tickWrite: 0, buckets, messageTotal: 0 };
}

function pushTick(room: RoomMetrics, durationMs: number): void {
  markFirstRecord();
  if (room.ticks.length < TICK_RING_CAPACITY) {
    room.ticks.push(durationMs);
    return;
  }
  room.ticks[room.tickWrite] = durationMs;
  room.tickWrite = (room.tickWrite + 1) % TICK_RING_CAPACITY;
}

function bumpMessage(room: RoomMetrics): void {
  markFirstRecord();
  const sec = nowSeconds();
  const bucket = room.buckets[sec % MESSAGE_BUCKET_COUNT];
  if (bucket.second !== sec) {
    bucket.second = sec;
    bucket.count = 0;
  }
  bucket.count++;
  room.messageTotal++;
}

/**
 * Register a room; returns a handle it feeds and unregisters on dispose.
 * Re-registering the same id resets that room's samples.
 */
export function registerRoom(roomId: string): RoomMetricsHandle {
  const room = makeRoomMetrics();
  registry.set(roomId, room);
  return {
    recordTick: (durationMs: number) => pushTick(room, durationMs),
    recordMessage: () => bumpMessage(room),
    unregister: () => {
      // Only delete if this handle's room is still the registered one. Fold its
      // message count into the retired total so `messages.total` (since process
      // start) never shrinks when a room disposes.
      if (registry.get(roomId) === room) {
        retiredMessageTotal += room.messageTotal;
        registry.delete(roomId);
      }
    },
  };
}

/** Test-only: clear all registered rooms, retired totals, and first-record mark. */
export function resetMetrics(): void {
  registry.clear();
  retiredMessageTotal = 0;
  firstRecordSec = null;
}

function allTickSamples(): number[] {
  const out: number[] = [];
  for (const room of registry.values()) {
    for (const t of room.ticks) out.push(t);
  }
  return out;
}

function inWindow(second: number, now: number): boolean {
  return second > now - MESSAGE_BUCKET_COUNT && second <= now;
}

/** Sum message counts across all rooms within the last-60s window. */
function windowedMessageSum(now: number): number {
  let sum = 0;
  for (const room of registry.values()) {
    for (const bucket of room.buckets) {
      if (bucket.count > 0 && inWindow(bucket.second, now)) sum += bucket.count;
    }
  }
  return sum;
}

/** Seconds the rate window actually covers: min(60, uptime since first record), >= 1. */
function coveredSeconds(now: number): number {
  if (firstRecordSec === null) return 1;
  return Math.max(1, Math.min(MESSAGE_BUCKET_COUNT, now - firstRecordSec));
}

/** Windowed-sum / covered-seconds inbound message rate, rounded to 2dp. */
function ratePerSec(now: number): number {
  return round2(windowedMessageSum(now) / coveredSeconds(now));
}

function totalMessages(): number {
  let total = retiredMessageTotal;
  for (const room of registry.values()) total += room.messageTotal;
  return total;
}

/**
 * rooms/players from `matchMaker.stats.local`. Guards a throwing/unavailable
 * matchMaker (unit tests, pre-listen) by degrading to registered-room count
 * and players = 0 rather than throwing.
 */
function localCounts(): { rooms: number; players: number } {
  try {
    const local = matchMaker.stats.local;
    if (local && typeof local.roomCount === 'number') {
      return { rooms: local.roomCount, players: local.ccu };
    }
  } catch {
    // fall through to degraded counts
  }
  return { rooms: registry.size, players: 0 };
}

/** Assemble the `/metrics` JSON payload from process-local state. */
export function metricsPayload(): MetricsPayload {
  const { rooms, players } = localCounts();
  return {
    rooms,
    players,
    tick: computeTickPercentiles(allTickSamples()),
    messages: {
      ratePerSec: ratePerSec(nowSeconds()),
      total: totalMessages(),
    },
  };
}

// --- HTTP endpoint (Colyseus 0.17 typed route) -------------------------------

/** GET /metrics — process-local operability snapshot as JSON. */
export const metricsEndpoint = createEndpoint(
  '/metrics',
  { method: 'GET' },
  async (ctx) => ctx.json(metricsPayload()),
);

/** Router mounted via the `routes` option in app.config.ts. */
export const metricsRoutes = createRouter({ getMetrics: metricsEndpoint });
