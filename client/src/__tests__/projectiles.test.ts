import { afterEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Container } from 'pixi.js';
import { CONFIG, type BallisticEvent, type TorpedoUpdateEvent } from '@salvo/shared';
import {
  MAX_OWN_CLAIMS,
  Projectiles,
  arcSwellScale,
  cullRadiusSq,
  lookForReveal,
  pierceOrder,
  shellCulledBeyondSight,
  shellPosition,
  maxLifetimeMs,
} from '../render/projectiles.js';
import type { OwnZone } from '../render/litZones.js';
import { settings } from '../settings/store.js';

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
  /** A shell already sitting 400u out (beyond sight), still-forming its position. */
  const farShell: BallisticEvent = { k: 'shell', id: 's1', x: 400, y: 0, vx: 0, vy: 0, t: 0 };

  it('culls a beyond-sight shell with no zone, but keeps it inside an own zone', () => {
    const withZone = new Projectiles(900, new Container());
    withZone.onShell(farShell);
    const zone: OwnZone = { x: 400, y: 0, r: 110, until: 10_000 };
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

// --- Story 4.9 (THE EIGHTHS LADDER): torpedoes cull at DETECT, shells at SIGHT --
//
// The server now stops revealing — and stops sending `torpU` corrections for —
// an ENEMY torpedo at the DETECT rung (3/8 of intel range = `detectFactor` ×
// the observer's own dazzle-scaled, boon-widened sight), which is SHORTER than
// the truesight ring shells still ride. Left sharing one cull, the client would
// go on dead-reckoning an un-corrected fish across the gap the server
// abandoned: the client inventing information it does not have. Shells DO NOT
// MOVE — and neither does our OWN fish, whose owner path the server never stops
// correcting at all (see the ownership describe further down).

describe('cullRadiusSq — two rings from ONE plumbed sight range', () => {
  const SIGHT = CONFIG.vision.sight;

  it('gives a shell the truesight ring (+ margin), byte-identical to before', () => {
    expect(cullRadiusSq(SIGHT, 'shell')).toBe((SIGHT + 40) ** 2);
  });

  it('gives a torpedo the DETECT ring (+ the same margin)', () => {
    expect(cullRadiusSq(SIGHT, 'torp')).toBeCloseTo((CONFIG.vision.detect + 40) ** 2, 6);
    // ...and it is derived from `detectFactor` × the plumbed sight, never from
    // a second copy of the rung (the shared pin `detect === sight * factor`).
    expect(cullRadiusSq(SIGHT, 'torp')).toBe((SIGHT * CONFIG.vision.detectFactor + 40) ** 2);
  });

  it('keeps the torpedo ring strictly INSIDE the shell ring', () => {
    expect(cullRadiusSq(SIGHT, 'torp')).toBeLessThan(cullRadiusSq(SIGHT, 'shell'));
  });

  it('scales BOTH rings with the observer — a dazzle shrinks them together', () => {
    const dazzled = SIGHT / 2;
    expect(cullRadiusSq(dazzled, 'shell')).toBe((dazzled + 40) ** 2);
    expect(cullRadiusSq(dazzled, 'torp')).toBe((dazzled * CONFIG.vision.detectFactor + 40) ** 2);
    expect(cullRadiusSq(dazzled, 'torp')).toBeLessThan(cullRadiusSq(SIGHT, 'torp'));
  });
});

describe('Projectiles.render — the torpedo cull is genuinely separate from the shell cull', () => {
  const own = { x: 0, y: 0 };
  // The detect ring + margin at BASE stats: 247.5 + 40 = 287.5u.
  const DETECT_CULL = CONFIG.vision.detect + 40;
  const justInside = DETECT_CULL - 1;
  const justOutside = DETECT_CULL + 1;

  const torpAt = (x: number): BallisticEvent => ({ k: 'torp', id: 't1', x, y: 0, vx: 0, vy: 0, t: 0 });
  const shellAt = (x: number): BallisticEvent => ({ k: 'shell', id: 's1', x, y: 0, vx: 0, vy: 0, t: 0 });

  const live = (ev: BallisticEvent, zones: OwnZone[] = []): number => {
    const p = new Projectiles(900, new Container());
    p.onShell(ev);
    p.render(1, own, zones);
    return p.liveCount;
  };

  it('KEEPS a torpedo just inside the detect-derived radius', () => {
    expect(live(torpAt(justInside))).toBe(1);
  });

  it('CULLS a torpedo just outside it', () => {
    expect(live(torpAt(justOutside))).toBe(0);
  });

  it('KEEPS a SHELL at the very same distance — the two culls are separate', () => {
    // The proof the fork is real: one distance, two outcomes. A shell out here
    // is still inside its own truesight ring (330 + 40 = 370u).
    expect(live(shellAt(justOutside))).toBe(1);
    expect(live(shellAt(CONFIG.vision.sight + 40 - 1))).toBe(1);
    expect(live(shellAt(CONFIG.vision.sight + 40 + 1))).toBe(0); // ...and still culls at ITS ring
  });

  it('leaves the lit-zone exemption applying to torpedoes exactly as it does today', () => {
    const zone: OwnZone = { x: justOutside, y: 0, r: 110, until: 10_000 };
    expect(live(torpAt(justOutside), [zone])).toBe(1);
  });

  it('follows the ONE plumbed sight range — setSightRange moves both rings', () => {
    const p = new Projectiles(900, new Container());
    p.setSightRange(CONFIG.vision.sight * 2); // a boon-widened bubble
    p.onShell(torpAt(justOutside));
    p.render(1, own, []);
    expect(p.liveCount).toBe(1); // now well inside the widened detect ring
  });
});

// --- REVIEW FIX: the detect cull is for ENEMY fish ONLY ------------------------
//
// The server's owner path SHORT-CIRCUITS BEFORE the detect gate (signals.ts:
// `shell.ownerId === me.id` in both ballisticSignal and torpedoUpdateSignal),
// so the server never stops revealing OR correcting an owner's own torpedo at
// any range. The cull's stated rationale — "the server stopped correcting it" —
// is therefore FALSE on the owner path, and applying the detect ring to our own
// fish silently cut the owner's own-fish render window from 370u to 287.5u. No
// amendment rules on the owner's view of their own ordnance, so it stays where
// it was before this story: the truesight ring.
//
// `own === 'torpedo'` is a GENUINE claim on this path and never a heuristic —
// roomBindings.handleTorp only sets it against a live click-time torpedo latch
// (the shell path's ratified 'gun' fallback has no torpedo analogue), which is
// also why the same field already authorizes the burst ring.

describe('Projectiles.render — the detect cull applies to ENEMY fish only (review fix)', () => {
  const own = { x: 0, y: 0 };
  const DETECT_CULL = CONFIG.vision.detect + 40; // 287.5u at base stats
  const SIGHT_CULL = CONFIG.vision.sight + 40; // 370u at base stats
  const torpAt = (x: number, id = 't1'): BallisticEvent => ({ k: 'torp', id, x, y: 0, vx: 0, vy: 0, t: 0 });

  const liveTorp = (x: number, mine: boolean): number => {
    const p = new Projectiles(900, new Container());
    p.onShell(torpAt(x), mine ? 'torpedo' : null, mine ? 'torpedo' : null);
    p.render(1, own, []);
    return p.liveCount;
  };

  it('KEEPS an OWN torpedo out past the detect ring — the server never stopped correcting it', () => {
    expect(liveTorp(DETECT_CULL + 1, true)).toBe(1);
    expect(liveTorp(SIGHT_CULL - 1, true)).toBe(1);
  });

  it('...and still culls the own fish at ITS ring — truesight, exactly as before this story', () => {
    expect(liveTorp(SIGHT_CULL + 1, true)).toBe(0);
  });

  it('CULLS an ENEMY torpedo at the very same distance — the fork is on OWNERSHIP', () => {
    expect(liveTorp(DETECT_CULL + 1, false)).toBe(0);
  });

  it('leaves SHELLS on truesight for everyone — an own claim changes nothing there', () => {
    const shellAt = (x: number): BallisticEvent => ({ k: 'shell', id: 's1', x, y: 0, vx: 0, vy: 0, t: 0 });
    for (const claim of ['gun', null] as const) {
      const p = new Projectiles(900, new Container());
      p.onShell(shellAt(SIGHT_CULL + 1), claim, claim);
      p.render(1, own, []);
      expect(p.liveCount).toBe(0);
    }
  });

  it('a RESURRECTED own fish keeps its ownership — spawnFromUpdate reads the claim tombstone', () => {
    // The homing-update path creates a track for an id we dropped. It cannot
    // know ownership from the `torpU` payload (which carries none, by design),
    // so it reads the claim tombstone the reveal already recorded — the same
    // map the burst ring consults, and for the same reason: the track dies long
    // before the fact about it stops mattering. Left at `own: null` it would
    // hand our own resurrected fish the ENEMY cull ring.
    const p = new Projectiles(900, new Container());
    p.onShell(torpAt(0), 'torpedo', 'torpedo');
    p.render(1, { x: -100_000, y: 0 }, []); // observer teleport → the track is culled
    expect(p.liveCount).toBe(0);
    p.onBallisticUpdate({ k: 'torpU', id: 't1', x: DETECT_CULL + 1, y: 0, vx: 0, vy: 0, t: 0 });
    p.render(1, own, []);
    expect(p.liveCount).toBe(1); // ours → the truesight ring, not the detect ring
  });
});

// --- REVIEW FIX: DAZZLE is plumbed into the cull rings ------------------------
//
// The server's reveal ring for ballistics is `sightOf(me, now)`, which IS
// dazzle-scaled; the client's cull rings were derived from the UN-dazzled
// `stats.sightRange`, because main.updateDazzle told `radar` and `fog` about
// the dazzle and never `projectiles`. A dazzled observer therefore kept dead-
// reckoning a track the server had stopped correcting — the client inventing
// information it does not have. This is the amendment-81 bug class exactly (a
// dazzled observer with a shrunken fog hole and an unshrunken companion
// circle), and it closes on BOTH rings: the pre-existing shell-side gap goes
// with the new torpedo one.

describe('Projectiles.setDazzled — both cull rings shrink with the observer (review fix)', () => {
  const own = { x: 0, y: 0 };
  const DZ = CONFIG.starShells.dazzleSightFactor;
  const dazzledSightCull = CONFIG.vision.sight * DZ + 40;
  const dazzledDetectCull = CONFIG.vision.sight * DZ * CONFIG.vision.detectFactor + 40;
  const at = (k: 'shell' | 'torp', x: number): BallisticEvent => ({ k, id: 'p1', x, y: 0, vx: 0, vy: 0, t: 0 });

  const live = (ev: BallisticEvent, dazzled: boolean): number => {
    const p = new Projectiles(900, new Container());
    p.setSightRange(CONFIG.vision.sight);
    p.setDazzled(dazzled);
    p.onShell(ev);
    p.render(1, own, []);
    return p.liveCount;
  };

  it('mirrors the Fog/Radar changed-flag contract', () => {
    const p = new Projectiles(900, new Container());
    expect(p.setDazzled(true)).toBe(true); // flipped
    expect(p.setDazzled(true)).toBe(false); // idempotent
    expect(p.setDazzled(false)).toBe(true);
    expect(p.isDazzled).toBe(false);
  });

  it('shrinks the SHELL ring by the ratified dazzle factor — the pre-existing gap, closed', () => {
    expect(live(at('shell', dazzledSightCull - 1), true)).toBe(1);
    expect(live(at('shell', dazzledSightCull + 1), true)).toBe(0);
    // ...and the SAME shell survives undazzled, which is the proof the ring moved.
    expect(live(at('shell', dazzledSightCull + 1), false)).toBe(1);
  });

  it('shrinks the TORPEDO ring by the same factor, compounding with detectFactor', () => {
    expect(live(at('torp', dazzledDetectCull - 1), true)).toBe(1);
    expect(live(at('torp', dazzledDetectCull + 1), true)).toBe(0);
    expect(live(at('torp', dazzledDetectCull + 1), false)).toBe(1);
  });

  it('uses the shared CONFIG dazzle factor, never a second copy of 0.5', () => {
    // The same constant sightOf() applies server-side. If it is ever retuned,
    // both sides must move together — so this reads it rather than a literal.
    expect(DZ).toBe(CONFIG.starShells.dazzleSightFactor);
    expect(cullRadiusSq(CONFIG.vision.sight * DZ, 'shell')).toBe((dazzledSightCull) ** 2);
  });

  it('restores both rings the moment the dazzle lifts', () => {
    const p = new Projectiles(900, new Container());
    p.setSightRange(CONFIG.vision.sight);
    p.setDazzled(true);
    p.setDazzled(false);
    p.onShell(at('shell', CONFIG.vision.sight + 39));
    p.render(1, own, []);
    expect(p.liveCount).toBe(1);
  });

  it('a sight-stat change while dazzled keeps the dazzle applied — the flag is retained state', () => {
    const p = new Projectiles(900, new Container());
    p.setDazzled(true);
    p.setSightRange(CONFIG.vision.sight * 2); // a boon lands mid-dazzle
    p.onShell(at('shell', CONFIG.vision.sight * 2 * DZ + 40 + 1));
    p.render(1, own, []);
    expect(p.liveCount).toBe(0); // still halved — not silently reset by the boon
  });
});

// --- REVIEW FIX: DAZZLE must not shrink the ring for OWNER-fired ordnance -----
//
// The server's ballistic rows short-circuit on `shell.ownerId === me.id` BEFORE
// any range test at all (signals.ts `ballisticSignal` and `torpedoUpdateSignal`),
// so the server NEVER stops revealing or correcting our OWN shell or fish —
// dazzled or not. Shrinking the own ring under a dazzle is therefore a cull with
// no server basis: a dazzled captain's own tracer would vanish at 205u instead
// of 370u, the same class of error as applying the DETECT ring to an own fish.
// A track the client believes is its own rides the UN-dazzled, sight-derived
// ring — exactly its pre-Story-4.9 behavior; everything else rides the
// dazzle-scaled ring, detect-derived for torpedoes.

describe('Projectiles — an OWN track keeps the un-dazzled ring (review fix)', () => {
  const origin = { x: 0, y: 0 };
  const DZ = CONFIG.starShells.dazzleSightFactor;
  const OWN_CULL = CONFIG.vision.sight + 40; // 370u — un-dazzled truesight + margin
  const dazzledSightCull = CONFIG.vision.sight * DZ + 40; // 205u at base stats
  const at = (k: 'shell' | 'torp', x: number): BallisticEvent => ({ k, id: 'p1', x, y: 0, vx: 0, vy: 0, t: 0 });

  const live = (ev: BallisticEvent, own: 'gun' | 'torpedo' | null): number => {
    const p = new Projectiles(900, new Container());
    p.setSightRange(CONFIG.vision.sight);
    p.setDazzled(true);
    p.onShell(ev, own, own);
    p.render(1, origin, []);
    return p.liveCount;
  };

  it('KEEPS a DAZZLED captain\'s OWN shell past the dazzled ring — the server never stopped revealing it', () => {
    expect(live(at('shell', dazzledSightCull + 1), 'gun')).toBe(1);
    expect(live(at('shell', OWN_CULL - 1), 'gun')).toBe(1);
  });

  it('KEEPS a DAZZLED captain\'s OWN fish out to the same truesight ring (never the detect ring either)', () => {
    expect(live(at('torp', dazzledSightCull + 1), 'torpedo')).toBe(1);
    expect(live(at('torp', OWN_CULL - 1), 'torpedo')).toBe(1);
  });

  it('...and still culls an own track at ITS ring — un-dazzled truesight, exactly as before this story', () => {
    expect(live(at('shell', OWN_CULL + 1), 'gun')).toBe(0);
    expect(live(at('torp', OWN_CULL + 1), 'torpedo')).toBe(0);
  });

  it('leaves the ENEMY rings dazzle-scaled — the fork is on OWNERSHIP, not on the dazzle', () => {
    expect(live(at('shell', dazzledSightCull + 1), null)).toBe(0);
    expect(live(at('torp', CONFIG.vision.sight * DZ * CONFIG.vision.detectFactor + 40 + 1), null)).toBe(0);
  });
});

describe('main.updateDazzle — the dazzle actually reaches the projectile renderer (review fix)', () => {
  // main.ts boots the whole app at module load and is never imported by a test
  // (see foghorn.test.ts's note); this is the same SOURCE-SCAN technique. The
  // bug being pinned is a plumbing omission, not a logic error, so the wiring
  // itself is what has to be asserted: without this line every Projectiles
  // instance in the real client stays permanently undazzled and the class-level
  // tests above pass while the shipped game keeps the bug.
  const MAIN_TS = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');
  const updateDazzle = MAIN_TS.slice(MAIN_TS.indexOf('function updateDazzle('));

  it('fans the dazzle out to projectiles alongside radar and fog', () => {
    const body = updateDazzle.slice(0, updateDazzle.indexOf('\n}'));
    expect(body).toContain('g.radar.setDazzled(dazzled)');
    expect(body).toContain('g.projectiles.setDazzled(dazzled)');
    expect(body).toContain('g.fog.setDazzled(dazzled)');
  });

  it('sets it BEFORE the fog\'s changed-flag early-return, exactly as the radar is', () => {
    const body = updateDazzle.slice(0, updateDazzle.indexOf('\n}'));
    expect(body.indexOf('g.projectiles.setDazzled')).toBeLessThan(body.indexOf('if (!g.fog.setDazzled'));
  });

  it('runs BEFORE the projectile render, so the cull rings never lag the fog by a frame (review fix)', () => {
    // The alive render path called `g.projectiles.render(...)` first and adopted
    // the frame's dazzle state only afterwards, so on the frame a dazzle flips
    // the projectiles culled against the PREVIOUS frame's rings while the fog
    // and the radar had already moved. Same rule the neighbouring comment block
    // ratifies for the radar: updateDazzle precedes its consumers.
    const render = MAIN_TS.indexOf('g.projectiles.render(now, pose ?? undefined, ownZones)');
    const dazzle = MAIN_TS.indexOf('updateDazzle(g, now);');
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
    // 500ms past the update, the fish is 30u further along the NEW bearing.
    expect(shellPosition({ x: steer.x, y: steer.y }, steer, steer.t, 1000)).toEqual({ x: 30, y: 30 });
    // The old track would have kept running down +x to x = 60 — the update is
    // what makes the rendered path agree with the server's steer.
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
    expect(shellPosition({ x: steer.x, y: steer.y }, steer, steer.t, 1000)).toEqual({ x: 30, y: 30 });
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
// A regression that styles an enemy's stock shell as a cannon (or an unfired
// doctrine as anything at all) is an information leak, not a cosmetic slip.

describe('pierceOrder — the derived AP boom id', () => {
  it('reads the pierce order out of a derived id', () => {
    expect(pierceOrder('s7#p0')).toBe(0);
    expect(pierceOrder('s7#p2')).toBe(2);
    expect(pierceOrder('shell-12#p11')).toBe(11);
  });

  it('is null for an ordinary boom id, and for anything malformed', () => {
    expect(pierceOrder('s7')).toBeNull();
    expect(pierceOrder('')).toBeNull();
    expect(pierceOrder('s7#p')).toBeNull(); // no order at all
    expect(pierceOrder('s7#pX')).toBeNull(); // not a number
    expect(pierceOrder('s7#p1x')).toBeNull(); // trailing junk
    expect(pierceOrder('s7#p2-late')).toBeNull(); // suffix not at the end
  });
});

describe('lookForReveal — who gets which identity, on what evidence', () => {
  const stock = { cannon: 'standard', torpedo: 'standard' } as const;

  it('gives every OBSERVER the plain wire-kind look, whatever WE have fitted', () => {
    const armed = { cannon: 'ap', torpedo: 'homing' } as const;
    // `own: null` is "not our shot" — an enemy's shell/fish. Our own doctrine
    // must not paint their ordnance: that would leak OUR build to nobody's
    // benefit and, worse, make the two indistinguishable on screen.
    expect(lookForReveal('shell', null, armed)).toBe('shell');
    expect(lookForReveal('torp', null, armed)).toBe('torp');
  });

  it('styles OWN cannon fire per the fitted doctrine — and own GUN fire never', () => {
    expect(lookForReveal('shell', 'cannon', stock)).toBe('cannon');
    expect(lookForReveal('shell', 'cannon', { ...stock, cannon: 'arcing' })).toBe('cannonArcing');
    expect(lookForReveal('shell', 'cannon', { ...stock, cannon: 'ap' })).toBe('cannonAp');
    // The gun is not the cannon: an own gun shell stays the ordinary dot even
    // with a cannon doctrine fitted.
    expect(lookForReveal('shell', 'gun', { ...stock, cannon: 'ap' })).toBe('shell');
  });

  it('styles an OWN homing fish from LAUNCH, and a stock own fish not at all', () => {
    expect(lookForReveal('torp', 'torpedo', { ...stock, torpedo: 'homing' })).toBe('torpHoming');
    expect(lookForReveal('torp', 'torpedo', stock)).toBe('torp');
    // COMMAND DETONATION is the other torpedo exclusive: it changes when the
    // fish detonates, not how it runs, so it inherits the straight-runner look.
    expect(lookForReveal('torp', 'torpedo', { ...stock, torpedo: 'command' })).toBe('torp');
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
    p.setOwnModes({ cannon: 'ap', torpedo: 'homing' });
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'cannon');
    p.onShell({ k: 'shell', id: 's2', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'gun');
    p.onShell({ k: 'torp', id: 't1', x: 0, y: 0, vx: 60, vy: 0, t: 0 }, 'torpedo');
    expect(p.lookOf('s1')).toBe('cannonAp');
    expect(p.lookOf('s2')).toBe('shell');
    expect(p.lookOf('t1')).toBe('torpHoming'); // styled at launch, before any steer
  });

  it('a doctrine swap never restyles ordnance already in the water', () => {
    const p = new Projectiles(900, new Container());
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'cannon');
    p.setOwnModes({ cannon: 'ap', torpedo: 'standard' });
    expect(p.lookOf('s1')).toBe('cannon'); // the shell that left the barrel stock
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

  it('a retired sprite hands on no scale or rotation to the next track', () => {
    const p = new Projectiles(900, new Container());
    p.setOwnModes({ cannon: 'arcing', torpedo: 'standard' });
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'cannon');
    p.render(400, own, []);
    expect(p.scaleOf('s1')).toBeGreaterThan(1); // mid-arc: swollen
    p.onBoom({ k: 'boom', id: 's1', x: 50, y: 0 });
    p.onShell({ k: 'shell', id: 's2', x: 0, y: 0, vx: 130, vy: 0, t: 0 }); // pooled gfx
    p.render(400, own, []);
    expect(p.scaleOf('s2')).toBe(1);
  });
});

describe('arcSwellScale — PLUNGING FIRE reads as height', () => {
  it('rises to its peak mid-arc and settles back to 1', () => {
    expect(arcSwellScale(0, 0.4, 1000)).toBe(1);
    expect(arcSwellScale(500, 0.4, 1000)).toBeCloseTo(1.4, 9);
    expect(arcSwellScale(1000, 0.4, 1000)).toBe(1);
    expect(arcSwellScale(5000, 0.4, 1000)).toBe(1); // long after: flat
  });

  it('is exactly 1 with no amplitude — the motion=off contract', () => {
    for (const t of [0, 250, 500, 900]) expect(arcSwellScale(t, 0, 1000)).toBe(1);
  });
});

describe('the arc swell is MOTION, the position is INFORMATION', () => {
  afterEach(() => settings.reset());

  it('holds an arcing shell at scale 1 with motion off — and still moves it', () => {
    settings.set({ motion: 'off' });
    const p = new Projectiles(900, new Container());
    p.setOwnModes({ cannon: 'arcing', torpedo: 'standard' });
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'cannon');
    p.render(400, { x: 0, y: 0 }, []);
    expect(p.scaleOf('s1')).toBe(1); // no swell at all
    expect(p.liveCount).toBe(1); // ...and the shell is still tracked + placed
  });

  it('halves the swell at reduced motion (never removes the shell)', () => {
    settings.set({ motion: 'reduced' });
    const p = new Projectiles(900, new Container());
    p.setOwnModes({ cannon: 'arcing', torpedo: 'standard' });
    p.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'cannon');
    p.render(450, { x: 0, y: 0 }, []);
    const reduced = p.scaleOf('s1');
    settings.set({ motion: 'full' });
    const q = new Projectiles(900, new Container());
    q.setOwnModes({ cannon: 'arcing', torpedo: 'standard' });
    q.onShell({ k: 'shell', id: 's1', x: 0, y: 0, vx: 130, vy: 0, t: 0 }, 'cannon');
    q.render(450, { x: 0, y: 0 }, []);
    expect(reduced).toBeGreaterThan(1);
    expect(reduced - 1).toBeCloseTo((q.scaleOf('s1') - 1) / 2, 9);
  });
});

// --- OWN-SHOT CLAIM TOMBSTONES ----------------------------------------------
//
// The burst ring wants to know "was that OUR shell?" long after the track that
// could answer is gone: the sight-bubble cull (~370u) and the lifetime backstop
// both retire a shell well before a boosted gun/cannon reaches its 660u+ burst
// point — i.e. the claim evaporated for exactly the long-range upgraded blasts
// the effective-radius ring exists to draw. The claim therefore outlives the
// sprite, bounded by count so it can never grow without limit.
describe('Projectiles — own-shot claims outlive their sprites', () => {
  const shell = (id: string, x = 0): BallisticEvent => ({
    k: 'shell', id, x, y: 0, vx: 130, vy: 0, t: 0,
  });

  it('answers ownFireOf for a track the SIGHT CULL has already retired', () => {
    const p = new Projectiles(900, new Container());
    p.onShell(shell('s1'), 'cannon', 'cannon');
    p.render(10_000, { x: 5_000, y: 5_000 }); // far outside the bubble → culled
    expect(p.liveCount).toBe(0);
    expect(p.ownFireOf('s1')).toBe('cannon'); // ...the claim survives it
  });

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
    p.onShell(shell('oldest'), 'cannon', 'cannon');
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
