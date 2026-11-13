import { afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container } from 'pixi.js';
import {
  CONFIG,
  DEFAULT_CLASS_ID,
  FLASH_WINDOW_MS,
  effectiveStats,
  mapRadius,
  whiteoutReach,
  type BallisticEvent,
  type TorpedoUpdateEvent,
} from '@salvo/shared';
import {
  MAX_OWN_CLAIMS,
  OWN_LIFETIME_SLACK_MS,
  ownReachFromStats,
  trackExpiresAt,
  Projectiles,
  cullRadiusSq,
  revealReachU,
  trackCullRadiusSq,
  lookForReveal,
  shellCulledBeyondSight,
  shellPosition,
  maxLifetimeMs,
} from '../render/projectiles.js';
import type { OwnZone } from '../render/litZones.js';

describe('shellPosition (dead reckoning)', () => {
  it('extrapolates p0 + v*(now - t0)', () => {
    const p = shellPosition({ x: 0, y: 0 }, { vx: 130, vy: 0 }, 1000, 1500);
    expect(p.x).toBeCloseTo(65, 9); // 130 u/s * 0.5s
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('handles a diagonal velocity', () => {
    const p = shellPosition({ x: 10, y: -5 }, { vx: 20, vy: -40 }, 0, 250);
    expect(p.x).toBeCloseTo(10 + 20 * 0.25, 9);
    expect(p.y).toBeCloseTo(-5 - 40 * 0.25, 9);
  });

  it('clamps a past/negative elapsed to the launch point', () => {
    const p = shellPosition({ x: 3, y: 7 }, { vx: 130, vy: 130 }, 2000, 1000);
    expect(p).toEqual({ x: 3, y: 7 });
  });
});

describe('maxLifetimeMs (velocity-derived backstop)', () => {
  it('is the map-crossing time plus margin, in ms', () => {
    expect(maxLifetimeMs(900, 130)).toBeCloseTo(((2 * 900 + 100) / 130) * 1000, 6);
  });

  it('returns Infinity for a zero/negative speed', () => {
    expect(maxLifetimeMs(900, 0)).toBe(Infinity);
    expect(maxLifetimeMs(900, -5)).toBe(Infinity);
  });

  it('a faster projectile has a shorter lifetime backstop', () => {
    expect(maxLifetimeMs(900, 260)).toBeLessThan(maxLifetimeMs(900, 130));
  });
});

// --- Story 1.7: an own lit zone keeps a beyond-sight reveal from being culled ---

describe('shellCulledBeyondSight — beyond-sight cull with the lit-zone exception', () => {
  const origin = { x: 0, y: 0 };
  const cull2 = 260 * 260; // (sight 220 + margin 40)^2
  const inside = { x: 400, y: 0 }; // well beyond the sight bubble
  const near = { x: 100, y: 0 }; // inside the sight bubble

  it('culls a beyond-sight shell when NO own zone covers it (pre-1.7 behavior)', () => {
    expect(shellCulledBeyondSight(inside, origin, cull2, [])).toBe(true);
  });

  it('KEEPS a beyond-sight shell that lies inside an own active zone', () => {
    const zone: OwnZone = { x: 400, y: 0, r: 110, until: 10_000 };
    expect(shellCulledBeyondSight(inside, origin, cull2, [zone])).toBe(false);
  });

  it('still culls a beyond-sight shell outside the own zone radius', () => {
    const zone: OwnZone = { x: 400, y: 0, r: 110, until: 10_000 };
    expect(shellCulledBeyondSight({ x: 700, y: 0 }, origin, cull2, [zone])).toBe(true);
  });

  it('never culls a shell still inside the sight bubble (zones irrelevant there)', () => {
    expect(shellCulledBeyondSight(near, origin, cull2, [])).toBe(false);
  });
});

describe('Projectiles.render — the lit-zone reveal survives the beyond-sight cull', () => {
  const own = { x: 0, y: 0 };
  /** A shell already sitting on the 6/12 rung (radar × 6/12 — the flash rung,
   *  beyond sight's 4/12 + the cull margin; epic-9 amendment 103), still-forming
   *  its position. */
  const FAR_X = CONFIG.vision.shellSight + 200; // past the enemy shell reach (Story 11.2)
  const farShell: BallisticEvent = { k: 'shell', id: 's1', x: FAR_X, y: 0, vx: 0, vy: 0, t: 0 };

  it('culls a beyond-sight shell with no zone, but keeps it inside an own zone', () => {
    const withZone = new Projectiles(900, new Container());
    withZone.onShell(farShell);
    const zone: OwnZone = { x: FAR_X, y: 0, r: 110, until: 10_000 };
    withZone.render(1, own, [zone]);
    expect(withZone.liveCount).toBe(1); // revealed by our flare — survives

    const noZone = new Projectiles(900, new Container());
    noZone.onShell(farShell);
    noZone.render(1, own, []);
    expect(noZone.liveCount).toBe(0); // no zone → culled exactly as before

    const enemyOnly = new Projectiles(900, new Container());
    enemyOnly.onShell(farShell);
    // ownActiveZones already filters enemy/expired out, so an enemy zone reaches
    // render() as an EMPTY keep list — the shell is culled.
    enemyOnly.render(1, own, []);
    expect(enemyOnly.liveCount).toBe(0);
  });
});

// --- Story 11.2: the cull rings are the NAMED eye reaches ---------------------
//
// The server reveals (and corrects) an ENEMY shell inside `shellSight` and an
// ENEMY torpedo inside the much shorter `torpedoSight` — named hectometer facts
// since Story 11.2 (the `detect` / `detectFactor` rung of the retired ladder
// before). Left sharing one cull, the client would go on dead-reckoning an
// un-corrected fish across the band the server abandoned. An OWN track is never
// culled by eye reach: the server's owner path never consults a range, and the
// firer knows where his own shell goes.

describe('revealReachU / cullRadiusSq — one ring per kind, off the named reaches', () => {
  it('a shell rides the shell reach and a torpedo the torpedo reach, each + the margin', () => {
    expect(revealReachU('shell')).toBe(CONFIG.vision.shellSight);
    expect(revealReachU('torp')).toBe(CONFIG.vision.torpedoSight);
    expect(cullRadiusSq(revealReachU('shell'))).toBe((CONFIG.vision.shellSight + 40) ** 2);
    expect(cullRadiusSq(revealReachU('torp'), 0)).toBe(CONFIG.vision.torpedoSight ** 2);
  });
});

describe('Projectiles.render — the torpedo cull is genuinely separate from the shell cull', () => {
  const own = { x: 0, y: 0 };
  const TORP_CULL = CONFIG.vision.torpedoSight + 40;
  const SHELL_CULL = CONFIG.vision.shellSight + 40;
  const MAP_R = SHELL_CULL * 2; // the lifetime backstop never fires at render time 1

  const torpAt = (x: number): BallisticEvent => ({ k: 'torp', id: 't1', x, y: 0, vx: 0, vy: 0, t: 0 });
  const shellAt = (x: number): BallisticEvent => ({ k: 'shell', id: 's1', x, y: 0, vx: 0, vy: 0, t: 0 });

  const live = (ev: BallisticEvent, zones: OwnZone[] = []): number => {
    const p = new Projectiles(MAP_R, new Container());
    p.onShell(ev);
    p.render(1, own, zones);
    return p.liveCount;
  };

  it('KEEPS an enemy torpedo just inside its ring and CULLS it just outside', () => {
    expect(live(torpAt(TORP_CULL - 1))).toBe(1);
    expect(live(torpAt(TORP_CULL + 1))).toBe(0);
  });

  it('a SHELL culls at ITS ring — and a shell where the fish ring ends is still drawn', () => {
    expect(live(shellAt(SHELL_CULL - 1))).toBe(1);
    expect(live(shellAt(SHELL_CULL + 1))).toBe(0);
    expect(live(shellAt(TORP_CULL + 1))).toBe(1);
  });

  it('leaves the lit-zone exemption applying to torpedoes exactly as it does today', () => {
    const zone: OwnZone = { x: TORP_CULL + 1, y: 0, r: 110, until: 10_000 };
    expect(live(torpAt(TORP_CULL + 1), [zone])).toBe(1);
  });
});

describe('Projectiles.render — an OWN track is never culled by eye reach (Story 11.2)', () => {
  const own = { x: 0, y: 0 };
  const FAR = CONFIG.vision.shellSight * 3; // well past every eye reach
  const at = (k: 'shell' | 'torp', x: number, id = 'p1'): BallisticEvent => ({ k, id, x, y: 0, vx: 0, vy: 0, t: 0 });

  const liveAt = (ev: BallisticEvent, claim: 'gun' | 'heavyTorpedo' | null): number => {
    const p = new Projectiles(FAR * 2, new Container());
    p.onShell(ev, claim, claim);
    p.render(1, own, []);
    return p.liveCount;
  };

  it('keeps an own shell and an own fish far past every eye reach; the same tracks unclaimed are culled', () => {
    expect(liveAt(at('shell', FAR), 'gun')).toBe(1);
    expect(liveAt(at('torp', FAR), 'heavyTorpedo')).toBe(1);
    expect(liveAt(at('shell', FAR), null)).toBe(0);
    expect(liveAt(at('torp', FAR), null)).toBe(0);
  });

  it('a RESURRECTED own fish keeps its ownership — spawnFromUpdate reads the claim tombstone', () => {
    // The homing-update path creates a track for an id we dropped. It cannot
    // know ownership from the `torpU` payload (which carries none, by design),
    // so it reads the claim tombstone the reveal already recorded. Left at
    // `own: null` it would hand our own resurrected fish the ENEMY cull ring.
    // The LIFETIME BACKSTOP retires the track (an own fish is no longer culled
    // by eye reach) and keeps the claim tombstone: a dead own track to resurrect.
    const p = new Projectiles(100, new Container());
    p.onShell({ k: 'torp', id: 't1', x: 0, y: 0, vx: 10, vy: 0, t: 0 }, 'heavyTorpedo', 'heavyTorpedo');
    const past = maxLifetimeMs(100, 10) + 1;
    p.render(past, own, []);
    expect(p.liveCount).toBe(0);
    p.onBallisticUpdate({ k: 'torpU', id: 't1', x: CONFIG.vision.torpedoSight * 4, y: 0, vx: 0, vy: 0, t: past });
    p.render(past + 1, own, []);
    expect(p.liveCount).toBe(1); // ours → kept past the enemy torpedo ring
  });
});

// --- the ENEMY rings follow THE WHITEOUT LAW -----------------------------------
//
// The server's reveal ring for an enemy's ballistics is the named reach under the
// shared whiteout law (`whiteoutReach`) — 0 through ramp + hold, then growing
// linearly back to the full reach. A flashed observer that kept the full ring
// would dead-reckon a track the server had stopped correcting.

const { rampMs: RAMP, holdMs: HOLD, clearMs: CLEAR } = CONFIG.flashShells;
/** A flash that hit at t = 0, read `e` ms in. */
const flashAt = (e: number) => ({ until: FLASH_WINDOW_MS, now: e });
const NONE = { until: 0, now: 0 };
const MID_CLEAR = flashAt(RAMP + HOLD + CLEAR / 2);

describe('trackCullRadiusSq — the enemy ring is the whited-out reach', () => {
  it('undazzled, each enemy kind culls at its reach + the margin', () => {
    expect(trackCullRadiusSq(NONE, 'shell', null)).toBe(cullRadiusSq(revealReachU('shell')));
    expect(trackCullRadiusSq(NONE, 'torp', null)).toBe(cullRadiusSq(revealReachU('torp')));
  });

  it('WHILE A MARK IS PENDING the ring is the whited-out reach EXACTLY — no margin (gate fix F5)', () => {
    for (const d of [flashAt(0), flashAt(RAMP + HOLD), MID_CLEAR]) {
      for (const k of ['shell', 'torp'] as const) {
        expect(trackCullRadiusSq(d, k, null)).toBe(whiteoutReach(revealReachU(k), d.until, d.now) ** 2);
      }
    }
    expect(trackCullRadiusSq(flashAt(RAMP), 'shell', null)).toBe(0);
    expect(trackCullRadiusSq(MID_CLEAR, 'shell', null)).toBeCloseTo((revealReachU('shell') / 2) ** 2, 6);
  });

  it('an own track is never culled by eye reach, flashed or not', () => {
    for (const d of [NONE, flashAt(0), MID_CLEAR]) {
      expect(trackCullRadiusSq(d, 'torp', 'heavyTorpedo')).toBe(Infinity);
      expect(trackCullRadiusSq(d, 'shell', 'gun')).toBe(Infinity);
    }
  });
});

describe('Projectiles.setDazzle — both enemy cull rings follow the clear circle', () => {
  const own = { x: 0, y: 0 };
  const dzShell = whiteoutReach(revealReachU('shell'), MID_CLEAR.until, MID_CLEAR.now);
  const dzTorp = whiteoutReach(revealReachU('torp'), MID_CLEAR.until, MID_CLEAR.now);
  const MAP_R = CONFIG.vision.shellSight * 4;
  const at = (k: 'shell' | 'torp', x: number): BallisticEvent => ({ k, id: 'p1', x, y: 0, vx: 0, vy: 0, t: 0 });

  const live = (ev: BallisticEvent, d: { until: number; now: number }, claim: 'gun' | 'heavyTorpedo' | null = null): number => {
    const p = new Projectiles(MAP_R, new Container());
    p.setDazzle(d.until, d.now);
    p.onShell(ev, claim, claim);
    p.render(1, own, []);
    return p.liveCount;
  };

  it('holds the mark as state (isDazzled while until > now)', () => {
    const p = new Projectiles(900, new Container());
    expect(p.isDazzled).toBe(false);
    p.setDazzle(FLASH_WINDOW_MS, 0);
    expect(p.isDazzled).toBe(true);
    p.setDazzle(FLASH_WINDOW_MS, FLASH_WINDOW_MS);
    expect(p.isDazzled).toBe(false);
  });

  it('shrinks the enemy SHELL ring to the clear circle — the same shell survives unflashed', () => {
    expect(live(at('shell', dzShell - 1), MID_CLEAR)).toBe(1);
    expect(live(at('shell', dzShell + 1), MID_CLEAR)).toBe(0);
    expect(live(at('shell', dzShell + 1), NONE)).toBe(1);
  });

  it('shrinks the enemy TORPEDO ring by the same law', () => {
    expect(live(at('torp', dzTorp - 1), MID_CLEAR)).toBe(1);
    expect(live(at('torp', dzTorp + 1), MID_CLEAR)).toBe(0);
    expect(live(at('torp', dzTorp + 1), NONE)).toBe(1);
  });

  it("KEEPS a flashed captain's OWN shell and fish", () => {
    expect(live(at('shell', dzShell + 1), flashAt(0), 'gun')).toBe(1);
    expect(live(at('torp', dzTorp + 1), flashAt(0), 'heavyTorpedo')).toBe(1);
  });
});

describe('main.updateDazzle — the flash mark actually reaches all three mirrors AND the whiteout', () => {
  // main.ts boots the whole app at module load and is never imported by a test
  // (see foghorn.test.ts's note); this is the same SOURCE-SCAN technique. The
  // bug being pinned is a plumbing omission, not a logic error, so the wiring
  // itself is what has to be asserted.
  const MAIN_TS = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
  const updateDazzle = MAIN_TS.slice(MAIN_TS.indexOf('function updateDazzle('));
  const body = updateDazzle.slice(0, updateDazzle.indexOf('\n}'));

  it('fans the one (until, now) mark out to radar, projectiles, the whiteout and fog', () => {
    expect(body).toContain('g.radar.setDazzle(until, now)');
    expect(body).toContain('g.projectiles.setDazzle(until, now)');
    expect(body).toContain('renderWhiteout(g, until, now, pose)');
    expect(body).toContain('g.fog.setDazzle(until, now)');
  });

  it("sets radar, projectiles and the whiteout BEFORE the fog's changed-flag early-return", () => {
    const fogGate = body.indexOf('g.fog.setDazzle');
    expect(fogGate).toBeGreaterThan(-1);
    expect(body.indexOf('g.radar.setDazzle')).toBeLessThan(fogGate);
    expect(body.indexOf('g.projectiles.setDazzle')).toBeLessThan(fogGate);
    expect(body.indexOf('renderWhiteout(')).toBeLessThan(fogGate);
  });

  it('the whiteout frame is the pure whiteoutModel handed to the overlay', () => {
    const fn = MAIN_TS.slice(MAIN_TS.indexOf('function renderWhiteout('));
    const wb = fn.slice(0, fn.indexOf('\n}'));
    // ...carrying the overlay's last alpha, so a re-flash ramps from the white on screen (gate fix F3).
    expect(wb).toContain('g.whiteout.render(whiteoutModel(until, now, g.ownStats, screen, g.whiteout.carriedAlpha)');
  });

  it('the RESULTS screen is never under white (gate fix F7): presentResults hides the overlay, and renderWhiteout keeps it hidden while the results modal is visible', () => {
    // The results message lands one server message BEFORE the first `finished`
    // spec frame (ArenaRoom broadcasts results inside the step, frames follow),
    // so a render can run between them with `spectating` still false — the
    // spectate hide alone leaves a window.
    const pr = MAIN_TS.slice(MAIN_TS.indexOf('function presentResults('));
    expect(pr.slice(0, pr.indexOf('\n}'))).toContain('g.whiteout.hide()');
    const fn = MAIN_TS.slice(MAIN_TS.indexOf('function renderWhiteout('));
    const wb = fn.slice(0, fn.indexOf('\n}'));
    const gate = wb.indexOf('if (resultsVisible())');
    expect(gate).toBeGreaterThan(-1);
    expect(wb.slice(gate, wb.indexOf('\n', wb.indexOf('\n', gate) + 1))).toContain('g.whiteout.hide()');
    expect(gate).toBeLessThan(wb.indexOf('g.whiteout.render('));
  });

  it('a spectator hides the whiteout', () => {
    const fn = MAIN_TS.slice(MAIN_TS.indexOf('function renderSpectate('));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('g.whiteout.hide()');
  });

  it('runs BEFORE the projectile render, so the cull rings never lag the fog by a frame', () => {
    const render = MAIN_TS.indexOf('g.projectiles.render(now, pose ?? undefined, ownZones)');
    const dazzle = MAIN_TS.indexOf('updateDazzle(g, now, pose);');
    expect(render).toBeGreaterThan(-1);
    expect(dazzle).toBeGreaterThan(-1);
    expect(dazzle).toBeLessThan(render);
  });
});

// --- Story 2.8 review, P2: a DERIVED boom id must not kill a live track --------
//
// A non-terminal ARMOR-PIERCING pierce booms while the shell keeps flying, so
// the server sends those booms under a derived id (`<shellId>#p<order>`) and
// keeps the real id for the terminal event. The client side of that contract:
// an unknown boom id is a harmless impact spark — it must never remove a track.

describe('Projectiles.onBoom — unknown/derived ids are harmless', () => {
  const own = { x: 0, y: 0 };
  const launch: BallisticEvent = { k: 'shell', id: 's7', x: 0, y: 0, vx: 130, vy: 0, t: 0 };

  it('a DERIVED pierce-boom id leaves the still-flying shell tracked; the REAL id retires it', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(launch);
    p.onBoom({ k: 'boom', id: 's7#p0', x: 40, y: 0 }); // pierced hull 1, still flying
    p.onBoom({ k: 'boom', id: 's7#p1', x: 80, y: 0 }); // pierced hull 2, still flying
    expect(p.liveCount).toBe(1);
    p.render(300, own, []);
    expect(p.liveCount).toBe(1);
    p.onBoom({ k: 'boom', id: 's7', x: 120, y: 0 }); // terminal: the real id
    expect(p.liveCount).toBe(0);
  });
});

// --- Story 2.8: ACOUSTIC HOMING re-anchors a live torpedo's track ---------------
//
// A steering fish re-emits a `torpU` (same constant-free shape as its reveal:
// current position + velocity only). The client must re-anchor the dead-reckoned
// track IN PLACE so extrapolation continues from the steer — and must NEVER
// resurrect a track it has already legitimately dropped.

describe('Projectiles.onBallisticUpdate — the homing-torpedo track update', () => {
  const own = { x: 0, y: 0 };
  const launch: BallisticEvent = { k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 0 };
  const steer: TorpedoUpdateEvent = { k: 'torpU', id: 't1', x: 30, y: 0, vx: 0, vy: 60, t: 500 };

  it('re-anchors the live track: dead reckoning continues from the update, not the launch', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(launch);
    p.onBallisticUpdate(steer);
    expect(p.liveCount).toBe(1); // updated, never duplicated
    // 500ms past the update, the TRACK is 30u further along the NEW bearing.
    // The old track would have kept running down +x to x = 60 — the update is
    // what makes the rendered path agree with the server's steer.
    const [pose] = p.torpWakeHulls(1000);
    expect(pose.x).toBeCloseTo(30, 9);
    expect(pose.y).toBeCloseTo(30, 9);
    p.render(1000, own, []);
    expect(p.liveCount).toBe(1); // still well inside the sight bubble
  });

  // Story 2.8 review, P3 (RULING — supersedes the original "never resurrect"
  // rule): the client culls a track the moment it leaves the sight bubble, and
  // the server only emits `torpU` to an observer who can legitimately see the
  // fish right now. Dropping an update for an untracked id therefore hid a
  // RE-SIGHTED homing torpedo permanently — it must CREATE the track instead.
  it('CREATES the track for an id it is not tracking (a re-sighted fish must render)', () => {
    const p = new Projectiles(900, new Container());
    p.onBallisticUpdate(steer); // no reveal held (never arrived / already culled)
    expect(p.liveCount).toBe(1);
    // It renders as a live, correctly-anchored torpedo track: 500ms on it has
    // run 30u down the update's bearing and is still inside the bubble.
    p.render(1000, own, []);
    expect(p.liveCount).toBe(1);
    const [pose] = p.torpWakeHulls(1000);
    expect(pose.x).toBeCloseTo(30, 9);
    expect(pose.y).toBeCloseTo(30, 9);
  });

  it('a post-boom update re-creates the track exactly once (no duplicate, no leak)', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(launch);
    p.onBoom({ k: 'boom', id: 't1', x: 30, y: 0 });
    expect(p.liveCount).toBe(0);
    p.onBallisticUpdate(steer); // a late update racing the boom
    expect(p.liveCount).toBe(1);
    p.onBallisticUpdate({ ...steer, t: 600 });
    expect(p.liveCount).toBe(1); // still ONE track — updated, never duplicated
    // ...and the next boom still terminates it.
    p.onBoom({ k: 'boom', id: 't1', x: 30, y: 30 });
    expect(p.liveCount).toBe(0);
  });

  it('re-derives the lifetime backstop from the UPDATED speed', () => {
    // A steer can change speed as well as bearing; the backstop follows it, so a
    // slowed fish is not retired early (and a fast one is still bounded).
    const p = new Projectiles(900, new Container());
    p.onShell({ ...launch, vx: 260, vy: 0 });
    p.onBallisticUpdate({ ...steer, vx: 20, vy: 0, t: 0 });
    // At the ORIGINAL 260 u/s the backstop would have elapsed by now; at 20 u/s
    // it has not, so the track survives.
    p.render(maxLifetimeMs(900, 260) + 1, own, []);
    expect(p.liveCount).toBe(1);
  });
});

// --- STORY 2.9: ORDNANCE IDENTITY ON THE WATER ---------------------------------
//
// The information split this suite exists to hold:
//   • OWN ordnance is styled from own (self-private) stats at launch;
//   • an ENEMY's is styled only from behavior the observer can already see —
//     a fish that visibly steers, a boom whose derived id says the shell kept
//     flying — and NEVER from anything the wire would have to start carrying.
// A regression that styles an enemy's stock shell as a broadside (or an unfired
// doctrine as anything at all) is an information leak, not a cosmetic slip.
//
// STORY 7-5 WAVE 2 RETIRED the `pierceOrder` suite and the cannon-doctrine look
// pins (R2.6): the derived `#p<n>` boom id was ARMOR-PIERCING's alone, and the
// weapon that emitted it is deleted. The BROADSIDE BARRAGE takes ONE look
// because it has no doctrine cards at all.

describe('lookForReveal — who gets which identity, on what evidence', () => {
  // HOMING IS A TIER STAT PER LINE since Story 8.13 (epic-8 amendment 80): the
  // modes are one flag per torpedo LINE, folded from `homingTurnRate > 0`.
  const stock = { lightTorpedo: false, heavyTorpedo: false } as const;

  it('gives every OBSERVER the plain wire-kind look, whatever WE have fitted', () => {
    const armed = { lightTorpedo: true, heavyTorpedo: true } as const;
    // `own: null` is "not our shot" — an enemy's shell/fish. Our own doctrine
    // must not paint their ordnance: that would leak OUR build to nobody's
    // benefit and, worse, make the two indistinguishable on screen.
    expect(lookForReveal('shell', null, armed)).toBe('shell');
    expect(lookForReveal('torp', null, armed)).toBe('torp');
  });

  it('styles OWN broadside fire heavy — and own GUN / STAR fire never', () => {
    expect(lookForReveal('shell', 'broadside', stock)).toBe('broadside');
    // The gun is not the broadside, and a star shell is just a shell until it
    // bursts: both keep the ordinary dot.
    expect(lookForReveal('shell', 'gun', stock)).toBe('shell');
    expect(lookForReveal('shell', 'starShells', stock)).toBe('shell');
  });

  it('styles an OWN homing fish from LAUNCH, and a stock own fish not at all', () => {
    const armed = { lightTorpedo: true, heavyTorpedo: true } as const;
    expect(lookForReveal('torp', 'heavyTorpedo', armed)).toBe('torpHoming');
    expect(lookForReveal('torp', 'heavyTorpedo', stock)).toBe('torp');
  });

  // STORY 8.13: the two lines climb their OWN ladders, so one captain's light
  // torpedo may steer while their heavy one does not. A single `torpedoHoming`
  // flag could not say that — it dressed both fish off whichever line happened
  // to be tiered.
  it('reads the LINE that fired, not "the torpedo" — the two ladders are separate', () => {
    const lightOnly = { lightTorpedo: true, heavyTorpedo: false } as const;
    expect(lookForReveal('torp', 'lightTorpedo', lightOnly)).toBe('torpHoming');
    expect(lookForReveal('torp', 'heavyTorpedo', lightOnly)).toBe('torp');
  });

  // The SUPERCAV TORPEDO is a consumable with no tiers and never homes
  // (amendment 74) — there is no mode for it to read, at any build.
  it('never styles the SUPERCAV fish as homing, whatever the torpedo ladders say', () => {
    const armed = { lightTorpedo: true, heavyTorpedo: true } as const;
    expect(lookForReveal('torp', 'supercavTorpedo', armed)).toBe('torp');
  });
});

// --- STORY 8.13: THE RE-REVEAL (Eric ruling 2026-09-19, epic-8 amendment 78) --
//
// The server's exactly-once ballistic memory stopped being permanent: an
// observer's mark is CLEARED the first tick a still-live projectile is outside
// their reveal gate, so a straight-runner that leaves the gate and comes back is
// revealed AGAIN with current position and velocity. That fixes a cycle-60 bug
// (a fish revealed once at the detect ring was never spoken of again, so a
// client that culled it had no way to get it back) — but only if THIS side
// treats a reveal for an id it already knows as a RE-ANCHOR rather than as a
// duplicate or as noise to drop.
describe('a reveal for a KNOWN id re-anchors the track (amendment 78)', () => {
  const fish = (over: Partial<BallisticEvent> = {}): BallisticEvent =>
    ({ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 0, ...over });

  it('re-anchors a track that is still LIVE, instead of ignoring the reveal', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(fish());
    // One second of dead reckoning puts it at x=60 on the launch bearing...
    expect(p.torpWakeHulls(1000)[0].x).toBeCloseTo(60, 9);
    // ...and then the server re-reveals it, from somewhere else entirely.
    p.onShell(fish({ x: 200, y: 50, vx: 0, vy: 60, t: 1000 }));
    expect(p.liveCount).toBe(1); // never a second sprite for one fish
    const [pose] = p.torpWakeHulls(1000);
    expect(pose.x).toBeCloseTo(200, 9);
    expect(pose.y).toBeCloseTo(50, 9);
    // The NEW velocity governs from here, not the launch bearing.
    expect(p.torpWakeHulls(2000)[0].y).toBeCloseTo(110, 9);
  });

  it('re-creates a track the client already DROPPED, and keeps it ours', () => {
    // Story 11.2: an own fish is never culled by eye reach, so the track dies by
    // the lifetime backstop here — which keeps the claim tombstone.
    const p = new Projectiles(900, new Container());
    p.onShell(fish(), 'heavyTorpedo', 'heavyTorpedo'); // our own fish, claimed at launch
    const past = maxLifetimeMs(900, 60) + 1;
    p.render(past, { x: 0, y: 0 }, []);
    expect(p.liveCount).toBe(0);
    // The server re-reveals it. `own` is null on this path — the reveal is
    // nowhere near our hull, so roomBindings cannot claim it a second time —
    // and the CLAIM TOMBSTONE is what keeps it ours.
    const far = CONFIG.vision.torpedoSight * 4; // well outside the ENEMY torpedo ring
    p.onShell(fish({ x: far, y: 0, t: past }));
    expect(p.liveCount).toBe(1);
    // An ENEMY fish at that distance would be culled on the next frame; ours is
    // not, because the server is still correcting it.
    p.render(past, { x: 0, y: 0 }, []);
    expect(p.liveCount).toBe(1);
  });

  // CYCLE-148 REVIEW GATE, P1 — the re-anchor classifies like a `torpU` does.
  // A homing fish that does its turning OUTSIDE the reveal gate comes back on a
  // new bearing: the reveal's velocity is the same observable steer evidence
  // `onBallisticUpdate` styles on, so it must earn the same look.
  it('re-styles a re-revealed fish as HOMING when its heading has turned', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(fish()); // an enemy straight-runner, due east
    expect(p.lookOf('t1')).toBe('torp');
    const turn = (30 * Math.PI) / 180;
    p.onShell(fish({ x: 300, y: 0, vx: 60 * Math.cos(turn), vy: 60 * Math.sin(turn), t: 4000 }));
    expect(p.lookOf('t1')).toBe('torpHoming');
  });

  it('leaves a re-revealed straight-runner alone (same heading, still `torp`)', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(fish());
    p.onShell(fish({ x: 300, y: 0, t: 4000 })); // same bearing, new anchor
    expect(p.lookOf('t1')).toBe('torp');
  });

  // It only ever UPGRADES: an own fish styled homing at launch, or an enemy
  // that already steered, never falls back to the straight-runner look.
  it('never downgrades a HOMING track back to `torp` on a straight re-reveal', () => {
    const p = new Projectiles(900, new Container());
    p.setOwnModes({ lightTorpedo: false, heavyTorpedo: true });
    p.onShell(fish(), 'heavyTorpedo', 'heavyTorpedo');
    expect(p.lookOf('t1')).toBe('torpHoming');
    p.onShell(fish({ x: 300, y: 0, t: 4000 }));
    expect(p.lookOf('t1')).toBe('torpHoming');
  });

  it('...and a fish we never claimed stays an ENEMY track on re-reveal', () => {
    const p = new Projectiles(900, new Container());
    const near = Math.sqrt(cullRadiusSq(revealReachU('torp'))) + 20;
    p.onShell(fish({ id: 'enemy', x: near, y: 0, t: 5000 }));
    p.render(5000, { x: 0, y: 0 }, []);
    expect(p.liveCount).toBe(0); // outside the enemy ring: dropped, as before
  });
});

describe('Projectiles — the identity a live track paints with', () => {
  const own = { x: 0, y: 0 };

  it('an enemy fish becomes a HOMING track the moment it visibly steers', () => {
    const p = new Projectiles(900, new Container());
    p.onShell({ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 0 }); // no `own`
    expect(p.lookOf('t1')).toBe('torp');
    p.onBallisticUpdate({ k: 'torpU', id: 't1', x: 30, y: 0, vx: 0, vy: 60, t: 500 });
    expect(p.lookOf('t1')).toBe('torpHoming'); // observable behavior, not wire data
  });

  it('a track re-created from a torpU alone (a re-sighted fish) is a homing track', () => {
    const p = new Projectiles(900, new Container());
    p.onBallisticUpdate({ k: 'torpU', id: 't9', x: 0, y: 0, vx: 60, vy: 0, t: 0 });
    expect(p.lookOf('t9')).toBe('torpHoming');
  });

  it('styles OWN ordnance off the modes fanned in from applyOwnStats', () => {
    const p = new Projectiles(900, new Container());
    p.setOwnModes({ lightTorpedo: false, heavyTorpedo: true });
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'broadside');
    p.onShell({ k: 'shell', id: 's2', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'gun');
    p.onShell({ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 0 }, 'heavyTorpedo');
    expect(p.lookOf('s1')).toBe('broadside');
    expect(p.lookOf('s2')).toBe('shell');
    expect(p.lookOf('t1')).toBe('torpHoming'); // styled at launch, before any steer
  });

  it('a doctrine swap never restyles ordnance already in the water', () => {
    const p = new Projectiles(900, new Container());
    p.onShell({ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 0 }, 'heavyTorpedo');
    expect(p.lookOf('t1')).toBe('torp'); // launched under the stock (tier-I) ladders
    p.setOwnModes({ lightTorpedo: true, heavyTorpedo: true });
    expect(p.lookOf('t1')).toBe('torp'); // the fish that left the tube straight
  });

  // AMENDMENT 204 — ONE WAKE, ONE LENGTH (cycle-69 review gate, P10). This
  // module used to lay the fish's on-water trail itself, as `torpwake` one-shots
  // at a per-look spacing with a 0.7s life, while the SAME fish's radar ribbon
  // ran 6s: two objects, two lifetimes, ~8× apart. Eric struck that fork by name
  // on the ship side (*"I didn't say shit about the lengths being different
  // here"*). The trail machinery is GONE — the deleted `trailSpacing` /
  // `trailAt` / `homingTrailSpacing` are what the compiler now defends — and
  // this module only REPORTS pose, for the one shared tracker to lay.
  it('reports every live fish as a wake source and lays no trail of its own', () => {
    const p = new Projectiles(900, new Container());
    p.onShell({ k: 'torp', id: 't1', x: 10, y: 0, vx: 60, vy: 0, t: 0 });
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 });
    // Only the fish is a source — a shell is in the air, not on the water.
    const at = 500;
    const srcs = p.torpWakeHulls(at);
    expect(srcs.map((h) => h.id)).toEqual(['t1']);
    expect(srcs[0].cls).toBe('torp');
    // The reported pose is the SAME dead reckoning render() draws, from the same
    // anchor — pulled, not pushed, so the emitter's frame ordering owns it.
    expect(srcs[0].x).toBeCloseTo(10 + 60 * 0.5, 6);
    expect(srcs[0].speed).toBeCloseTo(60, 6);
    expect(srcs[0].heading).toBeCloseTo(0, 6);
  });

  it('reports no look for an id it holds no track for', () => {
    expect(new Projectiles(900, new Container()).lookOf('nope')).toBeNull();
  });

  // RETIRED with PLUNGING FIRE and ARMOR-PIERCING (Story 7-5 wave 2, R2.6): the
  // sprite `scale`/`rotation` channels those two doctrines drove — and with them
  // `arcSwellScale`, the `swell`/`stretch` look fields and the `scaleOf` test
  // seam — are DELETED, so there is no per-look sprite state left to hand on.
  // Every shipped look is now a plain dot at scale 1.
  it('retires a track and reuses its pooled sprite for the next one', () => {
    const p = new Projectiles(900, new Container());
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'broadside');
    p.render(400, own, []);
    expect(p.liveCount).toBe(1);
    p.onBoom({ k: 'boom', id: 's1', x: 50, y: 0 });
    expect(p.liveCount).toBe(0);
    p.onShell({ k: 'shell', id: 's2', x: 0, y: 0, vx: 130, vy: 0, t: 0 }); // pooled gfx
    p.render(400, own, []);
    expect(p.lookOf('s2')).toBe('shell');
    expect(p.liveCount).toBe(1);
  });
});

// --- OWN-SHOT CLAIM TOMBSTONES ----------------------------------------------
//
// The burst ring wants to know "was that OUR shell?" long after the track that
// could answer is gone: the sight-bubble cull (~370u) and the lifetime backstop
// both retire a shell well before a boosted gun reaches its 660u+ burst
// point — i.e. the claim evaporated for exactly the long-range upgraded blasts
// the effective-radius ring exists to draw. The claim therefore outlives the
// sprite, bounded by count so it can never grow without limit.
describe('Projectiles — own-shot claims outlive their sprites', () => {
  const shell = (id: string, x = 0): BallisticEvent => ({
    k: 'shell', id, x, y: 0, vx: 130, vy: 0, t: 0,
  });

  // ("answers ownFireOf for a track the SIGHT CULL has already retired" —
  // DELETED 2026-11-12, Story 11.2: an own track is never culled by eye reach
  // any more, so that retirement path no longer exists; the lifetime backstop
  // below is the one that still drops an own sprite before its burst.)
  it('answers ownFireOf after the LIFETIME backstop retires the track', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(shell('s1'), 'gun', 'gun');
    p.render(10_000_000); // long past expiresAt
    expect(p.liveCount).toBe(0);
    expect(p.ownFireOf('s1')).toBe('gun');
  });

  it('CONSUMES the claim on the burst (and on a boom) that ends the shot', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(shell('s1'), 'gun', 'gun');
    expect(p.ownFireOf('s1')).toBe('gun');
    p.onBurst({ k: 'burst', id: 's1', x: 0, y: 0 });
    expect(p.ownFireOf('s1')).toBeNull();

    p.onShell(shell('s2'), 'gun', 'gun');
    p.onBoom({ k: 'boom', id: 's2', x: 0, y: 0 });
    expect(p.ownFireOf('s2')).toBeNull();
  });

  it('is BOUNDED: the oldest claim is evicted, and that burst falls back to default', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(shell('oldest'), 'broadside', 'broadside');
    for (let i = 0; i < MAX_OWN_CLAIMS; i++) p.onShell(shell(`s${i}`), 'gun', 'gun');
    expect(p.ownFireOf('oldest')).toBeNull(); // aged out → CONFIG-default ring
    expect(p.ownFireOf(`s${MAX_OWN_CLAIMS - 1}`)).toBe('gun'); // the recent ones stand
  });

  it('never remembers an UNCLAIMED reveal, however it was dressed', () => {
    const p = new Projectiles(900, new Container());
    // `own` is the ratified 'gun' look/audio fallback for any shell surfacing
    // near our hull — including an ENEMY's. It must not size a burst ring.
    p.onShell(shell('enemy'), 'gun', null);
    expect(p.ownFireOf('enemy')).toBeNull();
  });
});


// STORY 8.15: the reveal's declared gun-family word `w` (amendment 89(i)) picks
// the look — a machine gun shell is a short TRACER for any observer; flak and
// cannon keep the shell dot; a torpedo carries no `w` and is unchanged.
describe('shell looks by the reveal family `w` (Story 8.15)', () => {
  const modes = { lightTorpedo: false, heavyTorpedo: false };

  it('lookForReveal: mg -> tracer; flak / cannon / absent -> shell; own broadside wins', () => {
    expect(lookForReveal('shell', null, modes, 'mg')).toBe('tracer');
    expect(lookForReveal('shell', 'machineGun', modes, 'mg')).toBe('tracer');
    expect(lookForReveal('shell', null, modes, 'flak')).toBe('shell');
    expect(lookForReveal('shell', 'flak', modes, 'flak')).toBe('shell');
    expect(lookForReveal('shell', null, modes, 'cannon')).toBe('shell');
    expect(lookForReveal('shell', null, modes)).toBe('shell');
    expect(lookForReveal('shell', 'broadside', modes, 'cannon')).toBe('broadside');
    expect(lookForReveal('torp', null, modes)).toBe('torp');
  });

  it('the live store paints each reveal with the look its family word names', () => {
    const p = new Projectiles(900, new Container());
    p.onShell({ k: 'shell', id: 'm1', x: 0, y: 0, vx: 0, vy: 500, t: 0, w: 'mg' });
    expect(p.lookOf('m1')).toBe('tracer');
    p.onShell({ k: 'shell', id: 'c1', x: 0, y: 0, vx: 500, vy: 0, t: 0, w: 'cannon' });
    expect(p.lookOf('c1')).toBe('shell');
    p.onShell({ k: 'shell', id: 'f1', x: 0, y: 0, vx: 500, vy: 0, t: 0, w: 'flak' });
    expect(p.lookOf('f1')).toBe('shell');
  });
});

// --- STORY 11.2 (gate C1): AN OWN TRACK RETIRES ON THE FIRER'S OWN KNOWLEDGE ---
//
// The owner is not always sent his own boom (out of eye reach, behind an
// island, in fog, flash-blinded), and an own track is never culled by eye
// reach — so without its own bound it ghosted for the whole map-crossing
// backstop. Contract: an own track lives exactly as long as its round can
// travel (`reach / speed` from launch, plus `OWN_LIFETIME_SLACK_MS`), off the
// own stats row; it is never culled before that; it stops feeding the wake on
// expiry; a steer never extends it.
describe('own track lifetime (Story 11.2, C1)', () => {
  const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]);
  const reach = ownReachFromStats(stats);
  const MAP = mapRadius(CONFIG.map.playerCap);
  const farOwn = { x: -CONFIG.vision.torpedoSight * 10, y: 0 }; // the firer sailed far away: eye reach never applies

  const ownFish = (): { p: Projectiles; endMs: number } => {
    const p = new Projectiles(MAP, new Container());
    p.setOwnReach(reach);
    const row = stats.equipment.heavyTorpedo;
    p.onShell({ k: 'torp', id: 'f', x: 0, y: 0, vx: row.speed, vy: 0, t: 0 }, 'heavyTorpedo', 'heavyTorpedo');
    return { p, endMs: (row.runU / row.speed) * 1000 };
  };

  it('an own torpedo lives through its run and retires a few ticks after it — not at the map backstop', () => {
    const { p, endMs } = ownFish();
    expect(endMs + OWN_LIFETIME_SLACK_MS).toBeLessThan(maxLifetimeMs(MAP, stats.equipment.heavyTorpedo.speed));
    p.render(endMs, farOwn, []);
    expect(p.liveCount).toBe(1); // never culled for leaving eye reach
    expect(p.torpWakeHulls(endMs)).toHaveLength(1);
    const after = endMs + OWN_LIFETIME_SLACK_MS + 1;
    expect(p.torpWakeHulls(after)).toHaveLength(0); // the wake pull runs BEFORE render: it must already stop
    p.render(after, farOwn, []);
    expect(p.liveCount).toBe(0);
  });

  it('a steer mid-run never extends an own fish past its launch-time run', () => {
    const { p, endMs } = ownFish();
    const mid = endMs / 2;
    const v = stats.equipment.heavyTorpedo.speed;
    p.onBallisticUpdate({ k: 'torpU', id: 'f', x: (v * mid) / 1000, y: 0, vx: 0, vy: v, t: mid });
    p.render(endMs + OWN_LIFETIME_SLACK_MS + 1, farOwn, []);
    expect(p.liveCount).toBe(0);
  });

  it('an own shell lives its own weapon reach / speed, then retires without a boom', () => {
    const p = new Projectiles(MAP, new Container());
    p.setOwnReach(reach);
    const speed = CONFIG.mainBattery.shellSpeed;
    p.onShell({ k: 'shell', id: 's', x: 0, y: 0, vx: speed, vy: 0, t: 0 }, 'mainBattery', 'mainBattery');
    const endMs = (stats.equipment.mainBattery.rangeU / speed) * 1000;
    p.render(endMs, farOwn, []);
    expect(p.liveCount).toBe(1);
    p.render(endMs + OWN_LIFETIME_SLACK_MS + 1, farOwn, []);
    expect(p.liveCount).toBe(0);
  });

  it('an enemy track (and an own one before the first stats) keeps the map backstop', () => {
    const v = stats.equipment.heavyTorpedo.speed;
    expect(trackExpiresAt(0, v, null, reach, MAP)).toBe(maxLifetimeMs(MAP, v));
    expect(trackExpiresAt(0, v, 'heavyTorpedo', {}, MAP)).toBe(maxLifetimeMs(MAP, v));
  });

  it("ownReachFromStats: each torpedo line's run, and the 'gun' fallback reaches at least every shell mount", () => {
    expect(reach.heavyTorpedo).toBe(stats.equipment.heavyTorpedo.runU);
    expect(reach.lightTorpedo).toBe(stats.equipment.lightTorpedo.runU);
    expect(reach.supercavTorpedo).toBe(stats.equipment.supercavTorpedo.runU);
    const shellMounts = ['mainBattery', 'broadside', 'flak', 'machineGun', 'starShells', 'phosphorShells', 'foulingShell', 'dazzleShells'] as const;
    for (const k of shellMounts) expect(reach.gun).toBeGreaterThanOrEqual(reach[k] ?? Infinity);
    expect(reach.gun).toBeGreaterThanOrEqual(stats.secondaryRangeU);
  });
});
