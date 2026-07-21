// GOLDEN FRAMES — the byte-identity gate for the perception refactor (Story
// 1.1). A deterministic seeded scenario drives world.step() through every
// signal channel — all 11 GameEvent kinds (blip, shell, torp, boom, burst,
// dmg, sunk, spawn, upg, pt, heal) plus the contact and mine channels and a spectator
// frame — and JSON.stringify's each frame buildFrame() produces (JSON key
// insertion order == msgpack key order, which is load-bearing on the wire).
// The serialized array is committed as a Vitest snapshot: the later refactor of
// perception.ts must replay it byte-for-byte identically. NO Date.now() /
// Math.random() anywhere — every number here is a fixed seed or scripted input.
//
// FIDELITY LIMITS (this gate is a PROXY, honest about its blind spots): frames
// are pinned via JSON.stringify, not the msgpack encoder the wire actually uses,
// so two shapes of bug slip past a byte-identical JSON string — (1) a key whose
// VALUE is `undefined` is DROPPED by JSON.stringify but WOULD be encoded by
// msgpack, and (2) `-0` serializes as `0`. Both are key/negative-zero PRESENCE
// bugs; they are caught instead by the explicit key-order guards in
// signals.test.ts (Object.keys equality + `'hit' in wire` presence checks),
// which assert the materialized object shape directly rather than its JSON text.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HEAL_CHOICE,
  wrapPositive,
  type BallisticEvent,
  type FrameMsg,
  type GameEvent,
  type MatchPhase,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const TAU = Math.PI * 2;
const DT = CONFIG.tick.simDtMs;
const SIGHT = CONFIG.vision.sight;
// One tick's radar paint window width (rad) — a target at bearing δ/2 is painted
// by the first post-step window [0, δ).
const SWEEP_DELTA = (TAU * DT) / CONFIG.vision.sweepPeriod;

// The full set of channels the fixture MUST exercise: the 11 GameEvent kinds
// plus the two contact-like channels (contact/mine) and the spectator frame.
const EXPECTED_CHANNELS = [
  'blip', 'boom', 'burst', 'contact', 'dmg', 'heal', 'mine',
  'pt', 'shell', 'spawn', 'spec', 'sunk', 'torp', 'upg',
];

// Targeted sub-cases the APPENDED scenarios (island LOS, non-owner + spectator
// ballistic reveals) must each prove. Recorded ONLY when the observed fact holds
// (see prove()), so a regression OR a commented-out scenario drops a tag and
// fails the sub-case coverage assertion — the "found-style boolean per mandatory
// sub-case" the straddle-boom check pioneered, generalized across the additions.
const EXPECTED_SUBCASES = [
  'island-allows-radar-blip',
  'island-allows-sight-contact',
  'island-blocks-radar-blip',
  'island-blocks-sight-contact',
  'nonowner-hidden-at-launch',
  'nonowner-reveal-current-params',
  'nonowner-reveal-once',
  'spectator-ballistic-reveal',
  'spectator-dmg-passthrough',
  'spectator-raw-boom',
  'spectator-reveal-once',
];

// ---------- collector ---------------------------------------------------------

/** The growing golden fixture plus the self-validating coverage sets. */
interface Golden {
  frames: string[];
  channels: Set<string>;
  subcases: Set<string>;
}

/** Serialize one frame into the fixture and note which channels it exercised. */
function record(g: Golden, f: FrameMsg): FrameMsg {
  for (const e of f.events) g.channels.add(e.k);
  if (f.contacts.length > 0) g.channels.add('contact');
  if (f.mines.length > 0) g.channels.add('mine');
  if (f.spec) g.channels.add('spec');
  g.frames.push(JSON.stringify(f));
  return f;
}

/** Record a proven sub-case iff its observed condition held — the strengthened
 *  coverage gate (a missing tag fails the final sub-case assertion). */
function prove(g: Golden, tag: string, held: boolean): void {
  if (held) g.subcases.add(tag);
}

/** A ballistic reveal event (shell or torp) — the two kinds that ride the
 *  per-observer first-sight reveal. */
const isBallistic = (e: GameEvent): boolean => e.k === 'shell' || e.k === 'torp';

/** Build one observer's frame (wire semantics: once per observer per tick). */
function cap(g: Golden, w: World, id: string, phase?: MatchPhase): FrameMsg {
  return record(g, buildFrame(w, id, phase));
}

// ---------- world construction helpers (mirror perception.test) ---------------

/** World with a fixed seed and no islands (fog stays out of the geometry). */
function bareWorld(seed: number): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). */
function place(w: World, id: string, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  return rec;
}

/** Drop a live ballistic (shell or torpedo) directly into world state. */
function injectShell(
  w: World,
  id: string,
  ownerId: string,
  x: number,
  y: number,
  dir: number,
  distLeft: number,
  kind: 'shell' | 'torp' = 'shell',
): void {
  w.shells.set(id, {
    id,
    ownerId,
    x,
    y,
    vx: Math.cos(dir) * CONFIG.gun.shellSpeed,
    vy: Math.sin(dir) * CONFIG.gun.shellSpeed,
    distLeft,
    bornAt: w.now,
    kind,
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    // Contact-only injection (legacy hit rule): full damage on interception,
    // no burst point — keeps the pre-1.4 scenario events byte-stable. The
    // burst channel is exercised by scnBurst through the REAL gun.
    targetX: null,
    targetY: null,
    burstRadius: 0,
    contactDamage: CONFIG.gun.damage,
  });
}

/** Drop a mine directly into world state (armed by default). */
function injectMine(w: World, id: string, ownerId: string, x: number, y: number): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt: 0 });
}

// ---------- scenarios ---------------------------------------------------------

/** contacts + spawn + a radar-only blip (target visible ONLY as a blip). */
function scnSightSpawnBlip(g: Golden): void {
  const w = bareWorld(1001);
  place(w, 'a', 0, 0);
  place(w, 'b', 100, 0, 1.5); // inside sight -> live contact
  const brg = SWEEP_DELTA / 2; // painted by the first post-step window [0, δ)
  place(w, 'c', 400 * Math.cos(brg), 400 * Math.sin(brg)); // annulus -> blip only
  w.step(); // sweep advances 0 -> δ, publishing the join spawns
  cap(g, w, 'a'); // spawn(a,b) + contact b + blip c (c is never a contact)
  cap(g, w, 'b');
}

/** shell + torp reveals, then boom + dmg + sunk + pt from a killing hit. */
function scnCombat(g: Golden): void {
  const w = bareWorld(1002);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', 150, 0);
  b.hp = 15; // the next hit sinks it
  injectShell(w, 'tp', 'a', 0, 300, Math.PI / 2, 400, 'torp'); // owner-visible torp, flies clear
  injectShell(w, 'sg', 'a', 130, 0, 0, 100, 'shell'); // point-blank on b
  cap(g, w, 'a'); // shell + torp reveals (owner always), contact b
  w.step(); // shell strikes b
  cap(g, w, 'a'); // boom + sunk + pt (dmg is victim-private)
  cap(g, w, 'b'); // boom + dmg + sunk (victim)
}

/** upg + pt + heal — all self-private, delivered only to the acting ship. */
function scnUpgHealPt(g: Golden): void {
  const w = bareWorld(1003);
  const a = place(w, 'a', 0, 0);
  place(w, 'b', 400, 0); // far (out of a's sight); sunk to bank a a point
  w.sinkShip('b', 'a'); // sunk(b) + pt(a)
  a.hp -= 30; // leave room for a heal
  w.applyUpgrade(a, 'radarRange'); // upg(a)
  expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true); // heal(a)
  w.step();
  cap(g, w, 'a'); // spawn(a) + pt + upg + heal (b's spawn/sunk are out of sight)
}

/** mine channel: own mine always, enemy mine in sight, enemy mine in fog hidden. */
function scnMines(g: Golden): void {
  const w = bareWorld(1004);
  place(w, 'a', 0, 0);
  injectMine(w, 'own', 'a', 900, 900); // owner sees own mines everywhere
  injectMine(w, 'seen', 'b', SIGHT, 0); // enemy mine at the sight boundary
  injectMine(w, 'fog', 'b', 900, -900); // enemy mine beyond sight -> excluded
  cap(g, w, 'a');
}

/** spectator frames: a dead-in-active observer and a finished-phase observer. */
function scnSpectator(g: Golden): void {
  const w = bareWorld(1005);
  place(w, 'a', 0, 0);
  place(w, 'b', 2 * SIGHT, 0); // far beyond a fogged bubble
  place(w, 'c', -600, 400, 1.2);
  injectMine(w, 'sm', 'a', 800, 800);
  w.respawnEnabled = false; // active-phase policy: the dead stay dead
  w.sinkShip('a', 'b'); // a dies in the active phase -> spectates
  w.step();
  cap(g, w, 'a', 'active'); // spec: unfogged contacts b,c + own mine
  cap(g, w, 'b', 'finished'); // finished: everyone spectates
}

/**
 * A straddling hull: b's center sits just outside a's sight, its hull reaches
 * inside, so a's shell strikes at a point a can see. a gets the boom (impact
 * sighted) but never b's id (center fogged) — the hit-stripped boom path. b, as
 * the victim, sees its own hit. Captures every tick until the boom lands.
 */
function scnStraddleBoom(g: Golden): void {
  const w = bareWorld(1006);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', SIGHT + 12, 0, 0); // center at 232u, hull along +x
  b.hp = 100; // survives, so it straddles as a live but unsighted hull
  injectShell(w, 'st', 'a', 205, 0, 0, 40); // closing on b's near hull edge
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    w.step();
    cap(g, w, 'a'); // at impact: boom with `hit` stripped
    const fb = cap(g, w, 'b'); // at impact: boom carrying hit === 'b'
    found = fb.events.some((e) => e.k === 'boom' && e.id === 'st');
  }
  expect(found).toBe(true); // the hit-stripped straddle boom actually occurred
}

/**
 * Island LOS — the fog GEOMETRY bareWorld() deliberately zeroes. One island
 * circle sits on the +x axis between observer `a` and two HIDDEN ships: `b`
 * (inside sight, LOS-blocked -> never a contact) and `r` (in the radar annulus,
 * LOS-blocked -> never a blip). Positive controls in the SAME frame prove the
 * island BLOCKS rather than the ocean being empty: `c` (inside sight, LOS-clear)
 * is a live contact and `p` (in the annulus, LOS-clear, bearing swept) paints a
 * blip. A wide manual paint window (windowAround-style — set, don't step) exposes
 * bearings 0 and pi/2 at once, so both radar targets reach the blip row in one
 * frame; sight wins inside its radius, so b/c never touch the blip row.
 */
function scnIslandLos(g: Golden): void {
  const w = bareWorld(1007);
  w.map.islands.push({ x: 75, y: 0, r: 30 }); // blocks the +x axis out past sight
  place(w, 'a', 0, 0);
  place(w, 'b', 150, 0, 1.5); // inside sight, behind the island -> no contact
  place(w, 'c', 100, 100); // inside sight, LOS-clear -> contact (sight control)
  place(w, 'r', 400, 0); // radar annulus, behind the island -> no blip
  place(w, 'p', 0, 400); // radar annulus, LOS-clear, swept -> blip (radar control)
  const a = w.ships.get('a')!;
  a.prevSweepAngle = wrapPositive(-0.05); // window spans bearings 0..pi/2 inclusive
  a.sweepAngle = Math.PI / 2 + 0.05;
  const f = cap(g, w, 'a');
  const contactIds = f.contacts.map((c) => c.id);
  const blipIds = f.events.filter((e) => e.k === 'blip').map((e) => e.id);
  prove(g, 'island-blocks-sight-contact', !contactIds.includes('b'));
  prove(g, 'island-allows-sight-contact', contactIds.includes('c'));
  prove(g, 'island-blocks-radar-blip', !blipIds.includes('r'));
  prove(g, 'island-allows-radar-blip', blipIds.includes('p'));
}

/**
 * Non-owner ballistic reveal — a shell AND a torpedo fired by phantom owner `a`
 * OUTSIDE observer `b`'s sight, each closing on b's bubble. At LAUNCH (pre-step)
 * b's frame carries neither: the reveal is FIRST-SIGHT, never launch-state. The
 * tick each crosses the sight boundary, b's frame reveals it with CURRENT
 * pos/velocity and t = reveal tick (ctx.now), not the hidden launch point or
 * bornAt (=0). The next tick — still in flight — b's frame is empty again:
 * exactly-once per observer (seenBallistics). Three consecutive b frames pin all
 * three states (hidden -> revealed -> silent).
 */
function scnBallisticReveal(g: Golden): void {
  const w = bareWorld(1008);
  place(w, 'b', 0, 0); // the lone observer; `a` is a phantom owner (no ship needed)
  injectShell(w, 'sh', 'a', SIGHT + 6, 0, Math.PI, 500, 'shell'); // just outside, closing -x
  injectShell(w, 'tp', 'a', 0, SIGHT + 6, -Math.PI / 2, 500, 'torp'); // just outside, closing -y
  const pre = cap(g, w, 'b'); // launch tick: neither revealed (both outside sight)
  prove(g, 'nonowner-hidden-at-launch', !pre.events.some(isBallistic));
  w.step(); // both cross into b's sight this tick
  const reveal = cap(g, w, 'b');
  const sh = reveal.events.find((e) => e.k === 'shell') as BallisticEvent | undefined;
  const tp = reveal.events.find((e) => e.k === 'torp') as BallisticEvent | undefined;
  const live = w.shells.get('sh')!;
  prove(
    g,
    'nonowner-reveal-current-params',
    !!sh && !!tp && sh.x === live.x && sh.t === w.now && sh.t !== 0,
  );
  w.step(); // still airborne, but already seen
  const after = cap(g, w, 'b');
  prove(g, 'nonowner-reveal-once', !after.events.some(isBallistic));
}

/**
 * Spectator ballistic reveal — the unfogged spectator variants reviewers found
 * untested. Projectile `fly` is launched while `c` is alive but never sights it;
 * c then dies in the active phase and spectates. c's spectator frame reveals
 * `fly` MID-FLIGHT with current params (the sight gate is skipped, but the
 * exactly-once seenBallistics memory still holds — the next spectator frame omits
 * it). The SAME frame also carries a `dmg` for `e` (spectatorPublic passthrough:
 * a dead player may watch a live fight's hp) and a RAW `boom` (spectators get the
 * unstripped event). upg/pt/heal would stay self-private even here; this scenario
 * pins the two self-private exceptions that DO pass to a spectator.
 */
function scnSpectatorBallistic(g: Golden): void {
  const w = bareWorld(1009);
  place(w, 'c', 0, 0); // the soon-to-be spectator
  const e = place(w, 'e', 150, 0); // a live fight c will watch from the afterlife
  e.hp = 100; // survives the hit -> a clean dmg (no sunk)
  injectShell(w, 'hit', 'd', 130, 0, 0, 100, 'shell'); // point-blank on e -> boom + dmg
  injectShell(w, 'fly', 'd', 300, 300, Math.PI / 4, 500, 'shell'); // stays airborne (reveal subject)
  w.respawnEnabled = false; // active-phase policy: the dead stay dead
  w.sinkShip('c', 'b'); // c dies -> spectates (phantom killer 'b')
  w.step(); // shell strikes e; fly flies on
  const spec = cap(g, w, 'c', 'active'); // spectator: fly reveal + dmg(e) + raw boom
  prove(g, 'spectator-ballistic-reveal', spec.events.some((ev) => ev.k === 'shell' && ev.id === 'fly'));
  prove(g, 'spectator-dmg-passthrough', spec.events.some((ev) => ev.k === 'dmg' && ev.id === 'e'));
  prove(g, 'spectator-raw-boom', spec.events.some((ev) => ev.k === 'boom' && ev.id === 'hit') && spec.spec === true);
  w.step(); // fly still airborne but already revealed
  const again = cap(g, w, 'c', 'active');
  prove(g, 'spectator-reveal-once', !again.events.some((ev) => ev.k === 'shell' && ev.id === 'fly'));
}

/**
 * burst channel (Story 1.4) — a REAL gun click: the shell spawns at a's hull
 * silhouette edge, flies to the clicked point (b's position, 120u out), and
 * bursts there via the proximity rule (b's hull contains the target point).
 * b takes the full burst damage as a victim-private dmg; both observers see
 * the burst event as the bare {k,id,x,y} shape.
 */
function scnBurst(g: Golden): void {
  const w = bareWorld(1010);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', 120, 0);
  b.hp = 100; // survives the 25 burst — a clean dmg, no sunk
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 120, slot: 0, fireT: 0 });
  let burst = false;
  for (let i = 0; i < 30 && !burst; i++) {
    w.step();
    const fa = cap(g, w, 'a');
    cap(g, w, 'b');
    burst = fa.events.some((e) => e.k === 'burst');
  }
  expect(burst).toBe(true); // the burst actually landed in the fixture
}

// ---------- the fixture -------------------------------------------------------

describe('golden frames — byte-identity gate for the perception refactor', () => {
  it('serializes every signal channel across observers and ticks, deterministically', () => {
    const g: Golden = { frames: [], channels: new Set(), subcases: new Set() };
    scnSightSpawnBlip(g);
    scnCombat(g);
    scnUpgHealPt(g);
    scnMines(g);
    scnSpectator(g);
    scnStraddleBoom(g);
    // Appended scenarios (must not disturb the six above or their snapshot rows).
    scnIslandLos(g);
    scnBallisticReveal(g);
    scnSpectatorBallistic(g);
    scnBurst(g);

    // Self-validating coverage: the fixture can never silently lose a channel.
    expect([...g.channels].sort()).toEqual(EXPECTED_CHANNELS);
    // Strengthened coverage: every appended scenario's mandatory sub-cases were
    // actually OBSERVED (each tag is recorded only when its fact held), so a
    // regression or a removed scenario fails here.
    expect([...g.subcases].sort()).toEqual(EXPECTED_SUBCASES);
    // The byte-identity gate itself: the committed snapshot pins every frame's
    // serialized form (JSON key order => msgpack key order on the wire).
    expect(g.frames).toMatchSnapshot();
  });
});
