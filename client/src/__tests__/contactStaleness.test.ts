// A LAGGING SERVER MUST NEVER MAKE THE CLIENT DROP A CONTACT IT IS STILL
// DELIVERING (2026-10-14, Eric on staging: an enemy in plain sight vanished
// mid-firefight while it could still ram him).
//
// The cause: when the server falls behind 20 Hz its sim time dilates — every
// frame still advances `t` by 50 ms, but over MORE than 50 ms of wall.
// `ServerClock.serverNow()` rides the rolling-MIN offset, so it keeps running at
// wall rate and drifts ahead of the frames; the contact prune measured staleness
// against it and dropped hulls that were in EVERY frame. The prune now reads
// `ServerClock.frameNow()` — server time as the frames say it is.
//
// The probe below is the reproduction: 50 ms sim frames at 60 ms and 100 ms of
// wall, a 60 Hz render, 60 s, the contact in every frame.

import { describe, it, expect, vi } from 'vitest';
import type { Contact } from '@salvo/shared';

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class StubText {
    text: string;
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    anchor = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    constructor(opts: { text: string; style: Record<string, unknown> }) {
      this.text = opts.text;
      this.style = { ...opts.style };
    }
    destroy(): void {}
  }
  return { ...actual, Text: StubText };
});

const { ContactViews, CONTACT_STALE_MS } = await import('../render/contacts.js');
const { NameplateLayer } = await import('../render/nameplates.js');
const { ContactStore } = await import('../net/snapshots.js');
const { ServerClock } = await import('../net/clock.js');
const { cloudReturns } = await import('../render/cloudReturnGate.js');
const { Container: PixiContainer } = await import('pixi.js');
const { CONFIG } = await import('@salvo/shared');
type Container = import('pixi.js').Container;
type Clock = InstanceType<typeof ServerClock>;

const SIM_DT = CONFIG.tick.simDtMs; // 50
const RENDER_MS = 1000 / 60;
const TRANSIT_MS = 30;
const PROBE_MS = 60_000;

const camera = { worldToScreen: (p: { x: number; y: number }) => p, zoom: 1 };
const plates = { nameOf: (): string | null => null, camera, pad: 8 };
const rosterIndex = (): number | null => null;
const plateSink = (): Container => ({ addChild() {}, removeChild() {} }) as unknown as Container;

const enemy = (t: number): Contact => ({ id: 'e1', x: t / 100, y: 0, heading: 0, speed: 10, cls: 'torpedoBoat' });

interface ProbeResult {
  removed: number;
  firstRemovedAtMs: number | null;
  /** Render frames, after the first fade-in completed, where the hull was not
   *  at full lifecycle alpha (it had begun to hide). */
  hiddenFrames: number;
}

interface ProbeOpts {
  /** Wall ms the server spends per 50 ms sim tick. */
  wallPerTickMs: number;
  /** The staleness clock the render's prune reads. */
  staleClock: (clock: Clock, wall: number) => number;
  /** Does the frame at sim time `t` carry the contact? */
  inFrame?: (t: number) => boolean;
  durationMs?: number;
  /** No frame arrives after this wall time (a dead socket). */
  framesUntilMs?: number;
}

type HullViews = { views: Map<string, { fader: { alpha: number } }> };

/** Wrap the store's prune to record what it removes, and when. */
function countPrunes(store: InstanceType<typeof ContactStore>, wallNow: () => number, out: ProbeResult): void {
  const prune = store.prune.bind(store);
  store.prune = (now: number, ttl: number): string[] => {
    const r = prune(now, ttl);
    if (r.length > 0 && out.firstRemovedAtMs === null) out.firstRemovedAtMs = wallNow();
    out.removed += r.length;
    return r;
  };
}

/** Drive the dilated server + a 60 Hz render through ServerClock, ContactStore
 *  and ContactViews exactly as main.ts / roomBindings.ts wire them. */
function probe(o: ProbeOpts): ProbeResult {
  const inFrame = o.inFrame ?? ((): boolean => true);
  const durationMs = o.durationMs ?? PROBE_MS;
  const framesUntilMs = o.framesUntilMs ?? Infinity;
  let wall = 0;
  const clock = new ServerClock(() => wall);
  const store = new ContactStore();
  const views = new ContactViews(new PixiContainer(), new NameplateLayer(plateSink()), () => {});
  const out: ProbeResult = { removed: 0, firstRemovedAtMs: null, hiddenFrames: 0 };
  countPrunes(store, () => wall, out);
  let tick = 0;
  let nextArrival = TRANSIT_MS;
  let faded = false;
  for (wall = 0; wall <= durationMs; wall += RENDER_MS) {
    while (nextArrival <= wall && nextArrival <= framesUntilMs) {
      const t = tick * SIM_DT;
      clock.addSample(t, nextArrival);
      store.pushFrame(t, inFrame(t) ? [enemy(t)] : []);
      tick += 1;
      nextArrival = TRANSIT_MS + tick * o.wallPerTickMs;
    }
    if (!clock.ready) continue;
    const now = clock.serverNow(wall);
    views.render(store, now - CONFIG.tick.interpDelayMs, o.staleClock(clock, wall), RENDER_MS, rosterIndex, plates);
    const a = (views as unknown as HullViews).views.get('e1')?.fader.alpha ?? 0;
    if (a === 1) faded = true;
    else if (faded) out.hiddenFrames += 1;
  }
  return out;
}

const frameClock = (c: Clock, wall: number): number => c.frameNow(wall);
const serverClock = (c: Clock, wall: number): number => c.serverNow(wall);

describe('contact staleness under a lagging server (2026-10-14)', () => {
  it.each([60, 100])('a contact in EVERY frame is never pruned or hidden: 50 ms sim per %i ms wall, 60 s', (wallPerTickMs) => {
    const r = probe({ wallPerTickMs, staleClock: frameClock });
    expect(r.removed).toBe(0);
    expect(r.hiddenFrames).toBe(0);
  });

  it('the probe is real: measured against serverNow() the same contact IS pruned (the bug)', () => {
    const r = probe({ wallPerTickMs: 60, staleClock: serverClock });
    expect(r.removed).toBeGreaterThan(0);
    expect(r.hiddenFrames).toBeGreaterThan(0);
  });

  it('an on-time server never prunes a delivered contact either', () => {
    const r = probe({ wallPerTickMs: SIM_DT, staleClock: frameClock });
    expect(r.removed).toBe(0);
    expect(r.hiddenFrames).toBe(0);
  });

  it.each([SIM_DT, 60, 100])(
    'a contact that LEAVES the frames still goes after CONTACT_STALE_MS of frame time (%i ms wall per tick)',
    (wallPerTickMs) => {
      const leaveT = 2000; // sim ms: the first frame WITHOUT it
      const r = probe({ wallPerTickMs, staleClock: frameClock, inFrame: (t) => t < leaveT, durationMs: 6000 });
      expect(r.removed).toBe(1);
      // Last frame carrying it: t = leaveT − SIM_DT. It goes once the frame
      // clock passes that by CONTACT_STALE_MS — so around the arrival of the
      // frame that much SIM later, never a whole tick sooner.
      const lastT = leaveT - SIM_DT;
      const dueWall = TRANSIT_MS + ((lastT + CONTACT_STALE_MS) / SIM_DT) * wallPerTickMs;
      expect(r.firstRemovedAtMs).not.toBeNull();
      expect(r.firstRemovedAtMs!).toBeGreaterThanOrEqual(dueWall - wallPerTickMs);
      expect(r.firstRemovedAtMs!).toBeLessThanOrEqual(dueWall + wallPerTickMs + RENDER_MS);
    },
  );

  it('frames that stop entirely (dead socket) still age the contact out on wall time', () => {
    const framesUntilMs = 3000;
    const r = probe({ wallPerTickMs: SIM_DT, staleClock: frameClock, durationMs: 6000, framesUntilMs });
    expect(r.removed).toBe(1);
    expect(r.firstRemovedAtMs!).toBeGreaterThan(framesUntilMs);
    expect(r.firstRemovedAtMs!).toBeLessThanOrEqual(framesUntilMs + CONTACT_STALE_MS + SIM_DT + RENDER_MS);
  });
});

describe('ServerClock.frameNow', () => {
  it('is 0 before any sample, like serverNow', () => {
    const c = new ServerClock(() => 0);
    expect(c.frameNow()).toBe(0);
  });

  it('equals serverNow on an on-time server with steady transit', () => {
    let wall = 0;
    const c = new ServerClock(() => wall);
    for (let i = 0; i < 200; i++) c.addSample(i * SIM_DT, 30 + i * SIM_DT);
    for (wall = 30 + 199 * SIM_DT; wall < 30 + 200 * SIM_DT; wall += 5) {
      expect(c.frameNow(wall)).toBeCloseTo(c.serverNow(wall), 9);
    }
  });

  it('never runs past serverNow, and trails it by the drift under dilation', () => {
    let wall = 0;
    const c = new ServerClock(() => wall);
    for (let i = 0; i < 100; i++) c.addSample(i * SIM_DT, 30 + i * 100);
    wall = 30 + 99 * 100 + 10;
    const s = c.serverNow(wall);
    const f = c.frameNow(wall);
    expect(f).toBe(99 * SIM_DT + 10);
    expect(f).toBeLessThan(s);
  });
});

describe('the far-cloud radar hold ages by the same staleness clock', () => {
  const cloud = { x: 5000, y: 0, t0: 0, deliveredAt: 10_000 };
  const gate = { own: { x: 0, y: 0 }, sightU: 500, sweepPeriodMs: 4000, holdRevs: 1.5 };

  it('without staleNow the hold reads serverNow (unchanged on an on-time server)', () => {
    expect(cloudReturns(cloud, { ...gate, serverNow: 15_999 })).toBe(true);
    expect(cloudReturns(cloud, { ...gate, serverNow: 16_000 })).toBe(false);
  });

  it('a serverNow drifted ahead of the frames cannot expire a cloud the frames say is fresh', () => {
    expect(cloudReturns(cloud, { ...gate, serverNow: 18_000, staleNow: 15_000 })).toBe(true);
    expect(cloudReturns(cloud, { ...gate, serverNow: 18_000, staleNow: 16_000 })).toBe(false);
  });
});
