// GOLDEN FRAMES — the byte-identity gate for the perception refactor (Story
// 1.1). A deterministic seeded scenario drives world.step() through every
// signal channel — all 11 GameEvent kinds (blip, shell, torp, torpU, boom,
// burst, dmg, sunk, spawn, pt, bn) plus the contact and mine channels and a spectator
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
  isAfloat,
  CONFIG,
  HEAL_CHOICE,
  coverageHas,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type FrameMsg,
  type GameEvent,
  type HitCallEvent,
  type MatchPhase,
  type WakeBlipEvent,
  type WakeRibbon,
} from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { circleIsland, flatRaster, rasterFrom, ridgeField } from './islandFixture.js';

const TAU = Math.PI * 2;
const DT = CONFIG.tick.simDtMs;
const SIGHT = CONFIG.vision.sight;
// Story 4.9: the mine/torpedo detect rung, re-derived as a literal (the
// perception suite's oracle rule — never CONFIG.vision.detect).
const DETECT = SIGHT * 0.75;
// One tick's radar paint window width (rad) — a target at bearing δ/2 is painted
// by the first post-step window [0, δ).
const SWEEP_DELTA = (TAU * DT * CONFIG.vision.sweepRpm) / 60000;

// The full set of channels the fixture MUST exercise: the 15 GameEvent kinds
// (Story 2.1 deleted 'heal' with the REPAIR spend; Story 2.7 added the
// self-private 'bn' boon-fit event; Story 2.8 stripped 'upg' and added the
// homing-track update 'torpU'; Story 4.3 added the gunnery conversation's
// 'sp'/'hc'/'mz'; the 2026-08-04 DAMAGE CONTROL strip brought 'heal' BACK)
// plus the four contact-like channels (contact/mine/litzone/decoy) and the
// spectator frame. 'wk' is grammar-gated (cycle-69 review gate, P1): it rides
// the RETURN battery only — runBattery drops it from the default (silhouette)
// run's expectation, where the row is inert by rule.
const EXPECTED_CHANNELS = [
  'blip', 'bn', 'boom', 'burst', 'contact', 'decoy', 'denied', 'dmg', 'hc', 'heal', 'litzone',
  'mine', 'mz', 'pt', 'shell', 'sp', 'spawn', 'spec', 'sunk', 'torp', 'torpU', 'wk',
];

// Targeted sub-cases the APPENDED scenarios (island LOS, non-owner + spectator
// ballistic reveals) must each prove. Recorded ONLY when the observed fact holds
// (see prove()), so a regression OR a commented-out scenario drops a tag and
// fails the sub-case coverage assertion — the "found-style boolean per mandatory
// sub-case" the straddle-boom check pioneered, generalized across the additions.
const EXPECTED_SUBCASES = [
  'dazzled-victim-private',
  'decoy-expiry',
  'decoy-owner-truth-view',
  'decoy-thirdparty-swept-blip',
  'decoy-truesight-view',
  'denied-blocked-stern-drop',
  'denied-cooling-weapon',
  'denied-noammo-ability',
  'denied-out-of-arc-owner-only',
  'gunnery-decoy-splash-no-hitcall',
  'gunnery-hitcall-beyond-sight',
  'gunnery-miss-own-splash',
  'heal-event-healer-only',
  'heal-pool-drains-on-the-wire',
  'heal-repairhp-never-off-you',
  'island-allows-radar-blip',
  'island-allows-sight-contact',
  'island-blocks-radar-blip',
  'island-blocks-sight-contact',
  'litzone-beyond-radar-silent',
  'litzone-boom-victim-id',
  'litzone-expiry',
  'litzone-firer-reveal',
  'litzone-sunk-reveal',
  'litzone-thirdparty-radar-circle',
  'mine-burst-detonation',
  'mine-trip-blast-multivictim',
  'muzzle-flash-beyond-halo-silent',
  'muzzle-flash-inside-halo',
  'muzzle-flash-island-blocked',
  'nonowner-hidden-at-launch',
  'nonowner-reveal-current-params',
  'nonowner-reveal-once',
  'shell-reveal-beyond-detect',
  'slowed-victim-private',
  'soft-cover-allows-radar-blip',
  'spectator-ballistic-reveal',
  'spectator-dmg-passthrough',
  'spectator-raw-boom',
  'spectator-reveal-once',
  'torp-reveal-inside-detect',
  'torpedo-launch-no-muzzle',
  'torpu-sighted-update',
  'torpu-unsighted-silent',
];

// Wake sub-cases are GRAMMAR-SPLIT (cycle-69 review gate, P1): the `wk` row
// exists only in the `return` grammar (the client's wake path has no other
// consumer), so the return battery proves the five wake behaviours and the
// default (silhouette) battery proves exactly their ABSENCE. runBattery
// composes the expected set per grammar.
const WAKE_SUBCASES_RETURN = [
  'wake-identity-free',
  'wake-outlives-removal',
  'wake-outlives-ship',
  'wake-sight-bubble-quiet',
  'wake-torpedo-ribbon',
];
const WAKE_SUBCASES_DEFAULT = ['wake-silhouette-inert'];

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
  if (f.litZones !== undefined && f.litZones.length > 0) g.channels.add('litzone');
  if (f.decoys !== undefined && f.decoys.length > 0) g.channels.add('decoy');
  if (f.denied !== undefined && f.denied.length > 0) g.channels.add('denied');
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

/** Grammar-aware blip reference test (cycle 63): a silhouette paint matches on
 *  its exact position; a `return` coverage footprint matches when its mask
 *  lights the cell containing the point — the wire no longer carries a
 *  position or an id (amendment 152), so position-by-cell is the strongest
 *  public reference that exists. */
function blipRefs(e: BlipEvent, x: number, y: number): boolean {
  if ('gx' in e) {
    const cellU = CONFIG.vision.radarCellU;
    return coverageHas(e, Math.floor(x / cellU) - e.gx, Math.floor(y / cellU) - e.gy);
  }
  return e.x === x && e.y === y;
}

/** Does the frame carry a blip referencing world point (x, y)? */
function blipAt(f: FrameMsg, x: number, y: number): boolean {
  return f.events.some((e) => e.k === 'blip' && blipRefs(e, x, y));
}

/** Build one observer's frame (wire semantics: once per observer per tick). */
function cap(g: Golden, w: World, id: string, phase?: MatchPhase): FrameMsg {
  return record(g, buildFrame(w, id, phase));
}

// ---------- world construction helpers (mirror perception.test) ---------------

/**
 * The radar-mode options every scenario world is built with (R6 — the
 * golden-frames battery runs once per GRAMMAR). Module-scoped so the scenario
 * functions stay signature-stable; set by each `it` before running the
 * battery and restored to the default after. Identity stays 'roster' in both
 * runs: several scenarios pin blip ids against roster ids ('a'), which is the
 * shipped default — pseudonym identity is covered by the invariant fuzz and
 * the directed radarModes/decoy suites.
 */
let WORLD_OPTS: WorldOptions = {};

/** World with a fixed seed and no islands (fog stays out of the geometry).
 *  The height raster is flattened too (Story 4.11): the real generated
 *  terrain must not radar-shadow a scenario built on empty water — scenarios
 *  that WANT terrain occlusion set an explicit raster (scnIslandLos). */
function bareWorld(seed: number): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone, WORLD_OPTS);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** Add a ship and teleport it to an exact pose (speed 0). `hull` defaults to
 *  the torpedoBoat every pre-1.7 scenario was built on; scnStarShell places a
 *  battleship (the star-shell carrier); the 1.8 scenarios place a mineLayer. */
function place(w: World, id: string, x: number, y: number, heading = 0, hull: 'torpedoBoat' | 'battleship' | 'mineLayer' = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, hull);
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

/** pt + bn — both self-private, delivered only to the acting ship. ('heal'
 *  left the wire with the REPAIR spend — Story 2.1, PV 12; the legacy 'upg'
 *  event died with the 2.8 strip, so this scenario no longer drives one. The
 *  banked offer is OVERRIDDEN with a fixed non-heal hand so the fixture stays
 *  content-stable — and the "a spend never heals" pin holds for every non-
 *  healOnGrant card: only shipHull heals, by exactly its granted delta.) */
function scnPtBn(g: Golden): void {
  const w = bareWorld(1003);
  const a = place(w, 'a', 0, 0);
  place(w, 'b', 400, 0); // far (out of a's sight); sunk to bank a a level
  w.sinkShip('b', 'a'); // sunk(b) + pt(a) — the sunk now reaches a UNSEEN (PV 23: credited killer)
  a.hp -= 30; // damaged — a non-heal spend may not restore this
  a.offers[0] = ['gunDamage', 'shipCooldown', 'intelSweep', 'torpedoSpeed']; // fixed non-heal hand
  const hpBefore = a.hp;
  expect(w.spendPoint('a', 3)).toBe(true); // the fourth card — bn(a)
  expect(a.hp).toBe(hpBefore); // a non-heal spend never heals
  w.step();
  cap(g, w, 'a'); // spawn(a) + pt + bn + the unseen sunk(b) (b's spawn stays out of sight)
}

/** mine channel: own mine always, enemy mine at the DETECT boundary (Story
 *  4.9 — mines re-aimed from the truesight gate to the 3/8 rung), enemy mine
 *  inside sight but beyond detect hidden, enemy mine in deep fog hidden. */
function scnMines(g: Golden): void {
  const w = bareWorld(1004);
  place(w, 'a', 0, 0);
  injectMine(w, 'own', 'a', 900, 900); // owner sees own mines everywhere
  injectMine(w, 'seen', 'b', DETECT, 0); // enemy mine at the detect boundary (inclusive)
  injectMine(w, 'nearFog', 'b', 300, 0); // inside sight (330) but beyond detect -> excluded (the 4.9 tightening)
  injectMine(w, 'fog', 'b', 900, -900); // enemy mine in deep fog -> excluded
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
  const b = place(w, 'b', SIGHT + 12, 0, 0); // center at SIGHT+12u, hull along +x
  b.hp = 100; // survives, so it straddles as a live but unsighted hull
  injectShell(w, 'st', 'a', SIGHT - 15, 0, 0, 40); // striking b's near hull, just inside sight
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
 * Island LOS + the Story 4.11 radar shadow — the fog GEOMETRY bareWorld()
 * deliberately zeroes. SIGHT occlusion still comes from the island POLYGON:
 * one circle sits on the +x axis between observer `a` and `b` (inside sight,
 * LOS-blocked -> never a contact), with `c` (inside sight, LOS-clear) the
 * positive control. RADAR occlusion now comes from the HEIGHT RASTER
 * (amendment 179): a hard (q255 ≥ mast) ridge is stamped under the island, so
 * `r` (in the radar annulus behind it) still never paints — while a LOW (q16)
 * ridge on the −x axis leaves `s` (annulus, behind it) PARTIALLY illuminated,
 * which DISCLOSES: the genuine widening the ruling accepts, pinned here on
 * the wire. `p` (annulus, open water, bearing swept) is the clear-water
 * control. A wide manual paint window (windowAround-style — set, don't step)
 * exposes bearings 0, pi/2 and pi at once, so all three radar targets reach
 * the blip row in one frame; sight wins inside its radius, so b/c never touch
 * the blip row.
 */
function scnIslandLos(g: Golden): void {
  const w = bareWorld(1007);
  w.map.islands.push(circleIsland(75, 0, 30)); // blocks SIGHT on the +x axis
  // The raster: hard cover under the island (+x), soft cover far out on -x.
  w.map.heightRaster = rasterFrom(700, (x, y) => {
    if (Math.abs(x - 75) <= 30 && Math.abs(y) <= 30) return 255; // hard: dark to the rim
    if (Math.abs(x + 200) <= 40 && Math.abs(y) <= 40) return 16; // low: partial illumination
    return 0;
  });
  place(w, 'a', 0, 0);
  place(w, 'b', 150, 0, 1.5); // inside sight, behind the island -> no contact
  place(w, 'c', 100, 100); // inside sight, LOS-clear -> contact (sight control)
  place(w, 'r', 400, 0); // radar annulus, behind hard cover -> no blip
  place(w, 'p', 0, 400); // radar annulus, open water, swept -> blip (clear control)
  place(w, 's', -400, 0); // radar annulus, behind LOW cover -> blip (the 4.11 disclosure)
  const a = w.ships.get('a')!;
  a.prevSweepAngle = wrapPositive(-0.05); // window spans bearings 0..pi inclusive
  a.sweepAngle = Math.PI + 0.05;
  const f = cap(g, w, 'a');
  const contactIds = f.contacts.map((c) => c.id);
  prove(g, 'island-blocks-sight-contact', !contactIds.includes('b'));
  prove(g, 'island-allows-sight-contact', contactIds.includes('c'));
  prove(g, 'island-blocks-radar-blip', !blipAt(f, 400, 0));
  prove(g, 'island-allows-radar-blip', blipAt(f, 0, 400));
  prove(g, 'soft-cover-allows-radar-blip', blipAt(f, -400, 0));
}

/**
 * Non-owner ballistic reveal — a shell AND a torpedo fired by phantom owner
 * `a` OUTSIDE observer `b`'s reveal gate, each closing on b. The gates FORK
 * as of Story 4.9: the shell rides FIRST-SIGHT (just outside 330u — SHELLS DO
 * NOT MOVE) while the torpedo rides FIRST-DETECT (just outside 247.5u, the
 * 3/8 rung). At LAUNCH (pre-step) b's frame carries neither. The next tick
 * each crosses ITS OWN boundary, and b's frame reveals both with CURRENT
 * pos/velocity and t = reveal tick (ctx.now), not the hidden launch point or
 * bornAt (=0) — the shell revealing BEYOND detect (proving shells were not
 * narrowed) and the torpedo inside it. The next tick — still in flight — b's
 * frame is empty again: exactly-once per observer (seenBallistics). Three
 * consecutive b frames pin all three states (hidden -> revealed -> silent).
 */
function scnBallisticReveal(g: Golden): void {
  const w = bareWorld(1008);
  place(w, 'b', 0, 0); // the lone observer; `a` is a phantom owner (no ship needed)
  injectShell(w, 'sh', 'a', SIGHT + 6, 0, Math.PI, 500, 'shell'); // just outside SIGHT, closing -x
  injectShell(w, 'tp', 'a', 0, DETECT + 6, -Math.PI / 2, 500, 'torp'); // just outside DETECT, closing -y
  const pre = cap(g, w, 'b'); // launch tick: neither revealed (each outside its gate)
  prove(g, 'nonowner-hidden-at-launch', !pre.events.some(isBallistic));
  w.step(); // each crosses its own boundary this tick
  const reveal = cap(g, w, 'b');
  const sh = reveal.events.find((e) => e.k === 'shell') as BallisticEvent | undefined;
  const tp = reveal.events.find((e) => e.k === 'torp') as BallisticEvent | undefined;
  const live = w.shells.get('sh')!;
  prove(
    g,
    'nonowner-reveal-current-params',
    !!sh && !!tp && sh.x === live.x && sh.t === w.now && sh.t !== 0,
  );
  // The Story 4.9 fork, proven on the same frame: the shell's reveal point is
  // BEYOND the detect rung (a detect-gated shell would still be hidden here),
  // the torpedo's is inside it.
  prove(g, 'shell-reveal-beyond-detect', !!sh && Math.hypot(sh.x, sh.y) > DETECT && Math.hypot(sh.x, sh.y) <= SIGHT);
  prove(g, 'torp-reveal-inside-detect', !!tp && Math.hypot(tp.x, tp.y) <= DETECT);
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
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 120, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  let burst = false;
  for (let i = 0; i < 30 && !burst; i++) {
    w.step();
    const fa = cap(g, w, 'a');
    cap(g, w, 'b');
    burst = fa.events.some((e) => e.k === 'burst');
  }
  expect(burst).toBe(true); // the burst actually landed in the fixture
}

/**
 * Star-shell lit zone (Story 1.7) — a REAL battleship flare fired via the
 * input channel: the shell flies to the clicked point (SIGHT+80 out —
 * comfortably beyond the firer's sight bubble) and bursts, spawning the
 * (SIGHT/2)u/10s zone. Captures pin all four zone views in one deterministic
 * pass: the FIRER's frame (zone circle + the hidden hull `h` revealed as a
 * full contact by owned-zone truesight parity), a third party `c` sitting
 * EXACTLY at radar range of the zone center (the tagged {id,x,y,r,until,by}
 * circle — boundary-inclusive — and NO contact for `h`), a beyond-radar
 * observer `d` whose frame stays byte-free of the zone, and the FIRER again
 * after natural expiry (zone gone, `h` fogged once more). Intermediate flight
 * ticks are stepped without frame builds — the fixture pins the launch tick,
 * the burst tick, and expiry.
 */
function scnStarShell(g: Golden): void {
  const w = bareWorld(1011);
  const flareDist = SIGHT + 80; // clicked burst point, comfortably beyond a's sight bubble
  place(w, 'a', 0, 0, 0, 'battleship'); // the firer
  place(w, 'h', flareDist, 40, 1.1); // inside the future zone, beyond a's sight
  place(w, 'c', flareDist, -CONFIG.vision.radar); // dist to zone center = radar exactly — at radar range
  place(w, 'd', -400, 0); // dist to zone center (flareDist,0) = 810 — beyond radar
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: flareDist, slot: 2, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  w.step(); // consumes the click; the flare spawns and starts flying
  cap(g, w, 'a'); // launch tick: own shell reveal, no zone yet
  let zoneUp = false;
  for (let i = 0; i < 80 && !zoneUp; i++) {
    w.step();
    zoneUp = w.litZones.size > 0;
  }
  expect(zoneUp).toBe(true); // the flare actually burst in the fixture
  const fa = cap(g, w, 'a'); // burst tick: burst event + zone + h revealed
  prove(
    g,
    'litzone-firer-reveal',
    fa.contacts.some((x) => x.id === 'h') && (fa.litZones ?? []).some((z) => z.by === 'a'),
  );
  const fc = cap(g, w, 'c'); // radar-range third party: circle only
  prove(
    g,
    'litzone-thirdparty-radar-circle',
    (fc.litZones ?? []).some((z) => z.by === 'a') && !fc.contacts.some((x) => x.id === 'h'),
  );
  const fd = cap(g, w, 'd'); // beyond radar: byte-free of the zone
  prove(g, 'litzone-beyond-radar-silent', !('litZones' in fd));
  // Natural expiry: run out the 10s lifetime, then the firer is fogged again.
  const steps = Math.ceil(CONFIG.starShells.litDurationMs / DT) + 1;
  for (let i = 0; i < steps; i++) w.step();
  const after = cap(g, w, 'a');
  prove(
    g,
    'litzone-expiry',
    w.litZones.size === 0 && !('litZones' in after) && !after.contacts.some((x) => x.id === 'h'),
  );
}

/**
 * A kill INSIDE an owned lit zone (Story 1.7 zone event parity) — the zone and
 * the killing shell are injected directly (mines precedent; the real flare
 * flow is scnStarShell's job). Observer `a` owns a zone far beyond its sight;
 * its shell strikes `b` inside the zone. Pre-parity, a's frame carried NO boom
 * (owner hit-confirmation suppression) and NO sunk; under the owned zone the
 * boom arrives WITH the victim id (center zone-covered) and the sunk arrives
 * too — while dmg stays victim-private even here.
 */
function scnZoneKill(g: Golden): void {
  const w = bareWorld(1012);
  place(w, 'a', 0, 0);
  const b = place(w, 'b', 500, 0);
  b.hp = 15; // the next hit sinks it
  w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 500, y: 0, r: CONFIG.starShells.litRadius, until: 999_999, mode: 'standard' });
  injectShell(w, 'ks', 'a', 480, 0, 0, 100); // a's shell, point-blank on b, far outside a's sight
  w.step(); // strikes b -> boom + dmg (victim-private) + sunk + pt
  const fa = cap(g, w, 'a');
  prove(g, 'litzone-boom-victim-id', fa.events.some((e) => e.k === 'boom' && e.hit === 'b'));
  prove(
    g,
    'litzone-sunk-reveal',
    fa.events.some((e) => e.k === 'sunk' && e.id === 'b') && !fa.events.some((e) => e.k === 'dmg'),
  );
}

/**
 * Mine Layer trip blast — a REAL aimed placement through the fire channel
 * (Story 2.8, amendment 45): ML `a` clicks a mine 76u astern; enemies `b` (the
 * tripper) and `c` sit so the armed mine's 48u BLAST covers both hulls while
 * `a`'s own hull is inside the radius too (owner-excluded by rule). At the
 * trip: ONE boom at the mine with `hit` = the tripper, full damage to b AND c
 * (each victim-private), none to a. Captures pin the post-placement own-mine
 * frame and the blast tick for both the owner and the tripping victim.
 */
function scnMineBlast(g: Golden): void {
  const w = bareWorld(1013);
  const a = place(w, 'a', 0, 0, 0, 'mineLayer');
  const b = place(w, 'b', -76, 10); // hull over the future clicked point — trips it
  const c = place(w, 'c', -76, -40); // second victim: hull within the 48u blast
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 76, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  w.step(); // the click places the mine at the clicked point (weapon channel)
  expect(w.mines.size).toBe(1);
  cap(g, w, 'a'); // own mine view + spawns/contacts
  let boom = false;
  for (let i = 0; i < 80 && !boom; i++) {
    w.step(); // arm delay runs out, then the pass-over trips the blast
    boom = w.tickEvents.some((e) => e.k === 'boom');
  }
  expect(boom).toBe(true);
  cap(g, w, 'a'); // blast tick, owner's view: boom with hit (victim sighted)
  cap(g, w, 'b'); // blast tick, tripper's view: boom + its own dmg
  const full = CONFIG.shipClasses.torpedoBoat.hp;
  prove(
    g,
    'mine-trip-blast-multivictim',
    w.mines.size === 0 &&
      b.hp === full - CONFIG.mine.damage &&
      c.hp === full - CONFIG.mine.damage &&
      a.hp === a.stats.maxHp,
  );
}

/**
 * Owner gun-burst mine detonation (Story 1.8) — ML `a` clicks its own ARMED
 * mine (injected, mines precedent): the burst detonates it as a plain blast at
 * the MINE's position whose boom carries NO victim id (no tripping ship).
 */
function scnMineBurstDetonation(g: Golden): void {
  const w = bareWorld(1014);
  const a = place(w, 'a', 0, 0, 0, 'mineLayer');
  injectMine(w, 'om', 'a', 300, 0); // a's own armed mine, up-range
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  let detonated = false;
  for (let i = 0; i < 60 && !detonated; i++) {
    w.step();
    detonated = w.tickEvents.some((e) => e.k === 'boom' && e.id === 'om');
    cap(g, w, 'a'); // flight frames (shell reveal + own mine view), then the detonation tick
  }
  const boom = w.tickEvents.find((e) => e.k === 'boom' && e.id === 'om');
  prove(
    g,
    'mine-burst-detonation',
    detonated && w.mines.size === 0 && boom !== undefined && !('hit' in boom) && a.hp === a.stats.maxHp,
  );
}

/**
 * Decoy buoy lifecycle (Story 1.8) — a REAL placement through the actSeq
 * channel: ML `a` drops the buoy astern; the OWNER's frame carries the truth
 * (decoys channel); a swept third party `c` receives the counterIntel blip
 * (id = a's ship id at the BUOY's position — a itself is outside c's beam
 * window); a truesighted enemy `e` receives the DecoyView; after the 30s
 * expiry the owner's frame is byte-free of the channel again.
 */
function scnDecoy(g: Golden): void {
  const w = bareWorld(1015);
  const a = place(w, 'a', 0, 0, 0, 'mineLayer');
  const e = place(w, 'e', -76, 60); // truesight enemy: 60u from the drop point
  const c = place(w, 'c', 0, -400); // third party: buoy at ~407u — radar annulus
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: 2, hornSeq: 0 });
  w.step(); // the press drops the buoy astern at (-76, 0)
  expect(w.decoys.size).toBe(1);
  const buoy = [...w.decoys.values()][0];
  const fa = cap(g, w, 'a'); // owner truth view
  prove(g, 'decoy-owner-truth-view', (fa.decoys ?? []).some((d) => d.id === buoy.id));
  // Third party: beam window around the BUOY's bearing only (a's own bearing
  // from c stays outside it, so the only 'a' signal is the lie).
  const brg = Math.atan2(0 - c.state.y, buoy.x - c.state.x);
  c.prevSweepAngle = wrapPositive(brg - 0.02);
  c.sweepAngle = wrapPositive(brg + 0.02);
  const fc = cap(g, w, 'c');
  prove(
    g,
    'decoy-thirdparty-swept-blip',
    blipAt(fc, buoy.x, buoy.y) &&
      fc.events.every((ev) => ev.k !== 'blip' || blipRefs(ev, buoy.x, buoy.y)) &&
      (fc.decoys ?? []).length === 0,
  );
  // Truesight enemy: the buoy view (the lie unmasked), no blip.
  e.prevSweepAngle = Math.PI; // park the beam away from everything relevant
  e.sweepAngle = Math.PI + 0.0001;
  const fe = cap(g, w, 'e');
  prove(
    g,
    'decoy-truesight-view',
    (fe.decoys ?? []).some((d) => d.id === buoy.id) && !blipAt(fe, buoy.x, buoy.y),
  );
  // Natural expiry: run out the 30s lifetime — the owner's channel goes silent.
  const steps = Math.ceil(CONFIG.decoyBuoy.durationMs / DT) + 1;
  for (let i = 0; i < steps; i++) w.step();
  const after = cap(g, w, 'a');
  prove(g, 'decoy-expiry', w.decoys.size === 0 && !('decoys' in after));
}

/**
 * Denial channel (Story 1.10) — every wire reason through the REAL input
 * path, pinned byte-for-byte in the fixture: an astern torpedo click
 * ('out-of-arc'), a gun click mid-cooldown ('cooling'), an ability double
 * press ('no-ammo'), and an island-backed ML DECOY stern drop ('blocked' —
 * the decoy alone keeps the stern rack as of Story 2.8; the mine's own
 * blocked CLICK is pinned in denials.test.ts). Denials are SELF-PRIVATE:
 * sighted observer `b` captures the same tick byte-free of the channel. When
 * a weapon click AND an ability press deny on the same tick, the weapon
 * denial rides first (fireControl runs before activationControl — the step
 * order is the wire order).
 */
function scnDenied(g: Golden): void {
  const w = bareWorld(1016);
  place(w, 'a', 0, 0, 0); // TB: gun / torpedo / speedBoost
  place(w, 'b', 120, 0); // sighted second captain — proves owner-only
  const m = place(w, 'm', 400, 0, 0, 'mineLayer'); // stern rack drops at (324, 0)
  w.map.islands.push(circleIsland(324, 0, 20)); // the rock behind m's stern
  // Story 4.11: give the rock its raster presence (hard cover), so the
  // scenario's fog geometry is unchanged — without it the polygon would still
  // block the drop but m would now PAINT on a's radar through it.
  w.map.heightRaster = rasterFrom(700, ridgeField(324, 0, 20, 20, 255));
  // Tick 1: a clicks the torpedo dead astern; m presses its DECOY into the rock.
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  w.submitInput('m', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: 2, hornSeq: 0 });
  w.step();
  const fa1 = cap(g, w, 'a');
  const fm1 = cap(g, w, 'm');
  const fb1 = cap(g, w, 'b');
  prove(
    g,
    'denied-out-of-arc-owner-only',
    (fa1.denied ?? []).some((d) => d.reason === 'out-of-arc' && d.slot === 1 && d.seq === 1) &&
      !('denied' in fb1),
  );
  prove(g, 'denied-blocked-stern-drop', (fm1.denied ?? []).some((d) => d.reason === 'blocked' && d.slot === 2) && w.decoys.size === 0);
  // Tick 2: a fires the gun (spends the round) + activates the boost (spends the charge).
  w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 2, aimDist: 100, slot: 0, fireT: 0, actSeq: 1, actSlot: 2, hornSeq: 0 });
  w.step();
  cap(g, w, 'a'); // no denial: the shell reveal + a clean frame
  // Tick 3: both channels re-press against their empty pools.
  w.submitInput('a', { seq: 3, throttle: 0, rudder: 0, aim: 0, fireSeq: 3, aimDist: 100, slot: 0, fireT: 0, actSeq: 2, actSlot: 2, hornSeq: 0 });
  w.step();
  const fa3 = cap(g, w, 'a');
  prove(g, 'denied-cooling-weapon', (fa3.denied ?? [])[0]?.reason === 'cooling' && (fa3.denied ?? [])[0]?.seq === 3);
  prove(g, 'denied-noammo-ability', (fa3.denied ?? [])[1]?.reason === 'no-ammo' && (fa3.denied ?? [])[1]?.slot === 2);
}

/**
 * Homing-track updates (Story 2.8, 'torpU'): TB `a` holds ACOUSTIC HOMING and
 * fires past an off-axis enemy; sighted observer `c` gets the exactly-once
 * 'torp' reveal and then ≥1 'torpU' as the fish steers (the exactly-once
 * convention relaxes for updates alone), while far observer `d` never gets a
 * byte of either. Frames are captured every tick for both observers — the
 * update cadence itself (CONFIG.torpedo.homingUpdateAngleDeg over the seeded
 * steering) is pinned by the snapshot.
 */
function scnHoming(g: Golden): void {
  const w = bareWorld(1017);
  const a = place(w, 'a', 0, 0);
  w.applyBoon(a, 'torpedoHoming');
  place(w, 'b', 320, 80); // the fish steers toward this hull mid-flight
  const c = place(w, 'c', 250, -60); // sight covers the turning stretch
  const d = place(w, 'd', -900, 0); // beyond sight of everything
  for (const s of [c, d]) {
    s.prevSweepAngle = Math.PI; // park the beams away from the action
    s.sweepAngle = Math.PI + 1e-4;
  }
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  let cReveals = 0;
  let cUpdates = 0;
  let dBytes = 0;
  for (let i = 0; i < 60; i++) {
    w.step();
    const fc = cap(g, w, 'c');
    cReveals += fc.events.filter((e) => e.k === 'torp').length;
    cUpdates += fc.events.filter((e) => e.k === 'torpU').length;
    const fd = buildFrame(w, 'd'); // NOT recorded — only proven silent
    dBytes += fd.events.filter((e) => e.k === 'torp' || e.k === 'torpU').length;
    if (i > 2 && w.shells.size === 0) break;
  }
  prove(g, 'torpu-sighted-update', cReveals === 1 && cUpdates >= 1);
  prove(g, 'torpu-unsighted-silent', dBytes === 0);
}

/**
 * Debuff privacy (Story 2.8): a PROP-FOULING blast stamps the victim's
 * slowedUntil and a DAZZLE zone stamps dazzledUntil — each rides `you` on the
 * victim's own frame ONLY (the boostUntil precedent); a sighted watcher's
 * contact for the victim carries neither key.
 */
function scnDebuffs(g: Golden): void {
  const w = bareWorld(1018);
  const o = place(w, 'o', 600, 600, 0, 'mineLayer');
  w.applyBoon(o, 'minePropFouling');
  const b = place(w, 'b', 0, 10); // trips the fouling mine below on the first step
  place(w, 'watcher', 100, 60); // sees b as a contact
  injectMine(w, 'fm', 'o', 0, 0);
  w.litZones.set('dz', { id: 'dz', ownerId: 'o', x: 0, y: 0, r: 100, until: 999_999, mode: 'dazzle' });
  w.step(); // blast + dazzle both land on b
  const fb = cap(g, w, 'b');
  const fw = cap(g, w, 'watcher');
  const contact = fw.contacts.find((ct) => ct.id === 'b');
  prove(
    g,
    'slowed-victim-private',
    fb.you!.slowedUntil === b.slowedUntil && b.slowedUntil > 0 &&
      contact !== undefined && !('slowedUntil' in contact) && fw.you!.slowedUntil === undefined,
  );
  prove(
    g,
    'dazzled-victim-private',
    fb.you!.dazzledUntil === b.dazzledUntil && b.dazzledUntil > 0 &&
      contact !== undefined && !('dazzledUntil' in contact),
  );
}

/**
 * The gunnery conversation (Story 4.3; halo re-aimed to SIGHT*1.25 = 412.5u
 * by Story 4.9) — a REAL gun click driving all three new channels through the
 * wire. Shooter `a` fires into empty water 560u out: on the launch tick the
 * muzzle flash `mz` reaches o1 (≈275u from the muzzle — unambiguously inside
 * the 412.5u halo; the shipped 400u placement would have sat 12.5u under it),
 * never o2 (≈630u — beyond the halo) and never o3 (≈275u but island-blocked:
 * islands block every sensor at all ranges); on the burst tick the shooter
 * alone receives the self-private fall-of-shot `sp` at the true burst point
 * (o1, captured the same tick, gets neither sp nor burst — the point is
 * outside its sight). A torpedo launch next proves the quiet weapon: o1's
 * frame carries NO mz (amendment 20). After the gun reload, a second click
 * centered on fogged hull `b` (500u out — beyond sight, no boom rides a
 * burst outcome) delivers exactly one Hit Call `hc` carrying only {k,id,x,y}
 * with id = the SHOOTER — no victim id, no severity, and no sp for the same
 * shell.
 */
function scnGunnery(g: Golden): void {
  const w = bareWorld(1019);
  w.map.islands.push(circleIsland(200, 0, 40)); // the o3 LOS blocker
  place(w, 'a', 0, 0); // the shooter
  place(w, 'o1', 0, 300); // unambiguously inside the 412.5u muzzle halo
  place(w, 'o2', 0, -600); // beyond the 412.5u halo
  place(w, 'o3', 300, 0); // inside the halo but behind the island
  place(w, 'b', -500, 0); // the fogged victim of the second shot
  // Shot 1 — a miss into empty water at bearing pi/4 (clear of the island).
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI / 4, fireSeq: 1, aimDist: 560, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  w.step(); // the click fires: mz + shell reveal ride this tick
  cap(g, w, 'a'); // shooter: own mz + own shell reveal
  const fo1 = cap(g, w, 'o1');
  const fo2 = cap(g, w, 'o2');
  const fo3 = cap(g, w, 'o3');
  prove(g, 'muzzle-flash-inside-halo', fo1.events.some((e) => e.k === 'mz'));
  prove(g, 'muzzle-flash-beyond-halo-silent', !fo2.events.some((e) => e.k === 'mz'));
  prove(g, 'muzzle-flash-island-blocked', !fo3.events.some((e) => e.k === 'mz'));
  // Flight to the burst (no frame builds), then the burst/splash tick.
  let burst = false;
  for (let i = 0; i < 40 && !burst; i++) {
    w.step();
    burst = w.tickEvents.some((e) => e.k === 'burst');
  }
  expect(burst).toBe(true);
  const faMiss = cap(g, w, 'a');
  const fo1Miss = cap(g, w, 'o1'); // same tick: the splash is SELF-private
  prove(
    g,
    'gunnery-miss-own-splash',
    faMiss.events.some((e) => e.k === 'sp' && e.id === 'a') &&
      !fo1Miss.events.some((e) => e.k === 'sp'),
  );
  // The torpedo launch — the ratified quiet weapon: no mz for anyone.
  w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 2, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  w.step();
  cap(g, w, 'a'); // own torp reveal, no mz
  const fo1Torp = cap(g, w, 'o1');
  prove(g, 'torpedo-launch-no-muzzle', w.shells.size === 1 && !fo1Torp.events.some((e) => e.k === 'mz'));
  // Ride out the gun reload, then shot 2 — centered on the fogged hull b.
  const reloadTicks = Math.ceil(CONFIG.gun.reloadMs / DT) + 1;
  for (let i = 0; i < reloadTicks; i++) w.step();
  w.submitInput('a', { seq: 3, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 3, aimDist: 500, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  let hit = false;
  for (let i = 0; i < 40 && !hit; i++) {
    w.step();
    hit = w.tickEvents.some((e) => e.k === 'hc');
  }
  expect(hit).toBe(true);
  const faHit = cap(g, w, 'a');
  const hc = faHit.events.find((e): e is HitCallEvent => e.k === 'hc');
  prove(
    g,
    'gunnery-hitcall-beyond-sight',
    hc !== undefined &&
      Object.keys(hc).join(',') === 'k,id,x,y' && // NO victim id / severity field anywhere in it
      hc.id === 'a' && // the SHOOTER's id — never the victim's
      !faHit.contacts.some((c) => c.id === 'b') && // b really is fogged
      !faHit.events.some((e) => e.k === 'sp'), // exactly one of hc/sp per shell
  );
}

/**
 * Shooting a decoy buoy (Story 4.3 + the Story 1.8 oracle, on the wire): a
 * burst centered on a buoy structurally resolves no victim (the buoy is not a
 * collision subject), so the shooter's frame carries a fall-of-shot `sp` and
 * NEVER an `hc` — the ratified decoy disambiguation, with zero suppression
 * code anywhere on the path.
 */
function scnGunneryDecoy(g: Golden): void {
  const w = bareWorld(1020);
  place(w, 'a', 0, 0);
  w.decoys.set('d1', { id: 'd1', ownerId: 'z', x: 400, y: 0, hullId: 'mineLayer', heading: 0, until: 999_999 });
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 400, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
  let burst = false;
  for (let i = 0; i < 40 && !burst; i++) {
    w.step();
    burst = w.tickEvents.some((e) => e.k === 'burst');
  }
  expect(burst).toBe(true);
  const fa = cap(g, w, 'a');
  prove(
    g,
    'gunnery-decoy-splash-no-hitcall',
    fa.events.some((e) => e.k === 'sp' && e.id === 'a') &&
      !fa.events.some((e) => e.k === 'hc') &&
      w.decoys.has('d1'),
  );
}

/**
 * DAMAGE CONTROL on the wire (Eric rulings 2026-08-04): `a` banks a level,
 * takes damage, and spends the heal. Its own frame carries the self-private
 * `heal` event and a live `you.repairHp`; `b` — a sighted neighbour hull-to-
 * hull with it — gets NEITHER, and the string `repairHp` appears nowhere in
 * b's serialized frame. A later frame proves the pool visibly drains on the
 * wire without any further event.
 */
function scnHeal(g: Golden): void {
  const w = bareWorld(1021);
  const a = place(w, 'a', 0, 0);
  place(w, 'b', 60, 0); // hull-to-hull: fully sighted, and still told nothing
  place(w, 'z', 900, 900); // far away; sunk to bank `a` a level
  w.sinkShip('z', 'a');
  a.hp -= 60;
  a.offers[0] = ['gunDamage', 'shipCooldown', 'intelSweep', 'torpedoSpeed']; // fixed hand (content-stable)
  expect(w.spendPoint('a', HEAL_CHOICE)).toBe(true);
  w.step();
  const fa = cap(g, w, 'a');
  const fb = cap(g, w, 'b');
  prove(
    g,
    'heal-event-healer-only',
    fa.events.some((e) => e.k === 'heal' && e.id === 'a') && !fb.events.some((e) => e.k === 'heal'),
  );
  prove(
    g,
    'heal-repairhp-never-off-you',
    fa.you!.repairHp > 0 && !JSON.stringify({ ...fb, you: undefined }).includes('repairHp'),
  );
  const poolAfterSpend = fa.you!.repairHp;
  w.step();
  w.step();
  const fa2 = cap(g, w, 'a');
  prove(
    g,
    'heal-pool-drains-on-the-wire',
    fa2.you!.repairHp < poolAfterSpend && !fa2.events.some((e) => e.k === 'heal'),
  );
}

/**
 * RADAR WAKES on the wire (Story 4.12, amendments 194-196/200): a
 * deterministic laid track through a's radar annulus discloses as `wk`
 * events — geometry plus a water-age bucket and NOTHING else — after the
 * hull that laid it SINKS, and still after its record leaves the room
 * entirely (amendment 200: water outlives its ship). A torpedo-laid ribbon
 * on the same wedge paints on the half-life clock while no torp event
 * exists. Water inside a's sight bubble stays off the row (the in-bubble
 * ruling), and no wk payload key carries identity.
 */
function scnWake(g: Golden): void {
  const w = bareWorld(1022);
  const a = place(w, 'a', 0, 0);
  const b = place(w, 'b', 900, 900); // its WATER is under test, not its hull
  // b's laid track along y=0 (raw ring injection — fixed poses, fixed ages):
  // two in-sight samples (200, 212), then an annulus run 400..448, ages
  // spread so multiple quarter-life buckets ride the wire.
  const xs = [200, 212, 400, 412, 424, 436, 448];
  const ages = [11_600, 11_300, 11_000, 8_000, 5_000, 2_000, 0];
  for (let i = 0; i < xs.length; i++) {
    b.wake.xs[i] = xs[i];
    b.wake.ys[i] = 0;
    b.wake.ts[i] = w.now - ages[i];
  }
  b.wake.head = 0;
  b.wake.count = xs.length;
  // A torpedo's water: half-life (6000ms), one-cell (9u) ribbon at y=6.
  const torp: WakeRibbon = { xs: new Float64Array(8), ys: new Float64Array(8), ts: new Float64Array(8), cap: 8, head: 0, count: 0, lifeMs: 6_000, widthU: 9, torp: true };
  for (let i = 0; i < 5; i++) {
    torp.xs[i] = 500 + 12 * i;
    torp.ys[i] = 6;
    torp.ts[i] = w.now - (4 - i) * 1_200;
  }
  torp.count = 5;
  w.torpWakes.set('fish', torp);
  w.respawnEnabled = false; // active-phase policy: the dead stay dead
  w.sinkShip('b');
  w.step();
  // Open a's paint window across both tracks' bearings (0 .. ~0.012 rad).
  a.prevSweepAngle = wrapPositive(-0.005);
  a.sweepAngle = wrapPositive(0.03);
  const covers = (e: WakeBlipEvent, x: number, y: number): boolean =>
    coverageHas(e, Math.floor(x / CONFIG.vision.radarCellU) - e.gx, Math.floor(y / CONFIG.vision.radarCellU) - e.gy);
  const fa = cap(g, w, 'a');
  const wks = fa.events.filter((e): e is WakeBlipEvent => e.k === 'wk');
  prove(g, 'wake-outlives-ship', wks.length > 0 && !isAfloat(w.ships.get('b')!.lifecycle));
  prove(
    g,
    'wake-identity-free',
    wks.length > 0 && wks.every((e) => Object.keys(e).join(',') === 'k,t,a,gx,gy,w,h,bits'),
  );
  prove(g, 'wake-sight-bubble-quiet', wks.length > 0 && !wks.some((e) => covers(e, 206, 0)));
  prove(
    g,
    'wake-torpedo-ribbon',
    wks.some((e) => covers(e, 530, 6)) && !fa.events.some((e) => e.k === 'torp'),
  );
  // The record leaves the room entirely: the orphaned water still paints.
  w.removeShip('b');
  a.prevSweepAngle = wrapPositive(-0.005);
  a.sweepAngle = wrapPositive(0.03);
  const fa2 = cap(g, w, 'a');
  prove(
    g,
    'wake-outlives-removal',
    fa2.events.filter((e) => e.k === 'wk').length > 0 && !w.ships.has('b'),
  );
  // Review-gate P1: outside the `return` grammar the row is INERT — both
  // captures must carry ZERO wk rows (the five behaviour proofs above then
  // simply never record, and runBattery expects this tag instead).
  prove(
    g,
    'wake-silhouette-inert',
    w.radarGrammar !== 'return' && wks.length === 0 && fa2.events.every((e) => e.k !== 'wk'),
  );
}

// ---------- the fixture -------------------------------------------------------

/** The full scenario battery + the self-validating coverage assertions —
 *  shared verbatim by both grammar runs (R6). Returns the serialized frames
 *  for the caller's own snapshot. */
function runBattery(): string[] {
  const g: Golden = { frames: [], channels: new Set(), subcases: new Set() };
  runScenarios(g);
  // Grammar-split wake expectations (cycle-69 review gate, P1): the `wk`
  // channel and its five behaviour tags exist only in the return battery;
  // the default battery must instead prove the row's INERTNESS.
  const inReturn = WORLD_OPTS.radarGrammar === 'return';
  const channels = inReturn ? EXPECTED_CHANNELS : EXPECTED_CHANNELS.filter((c) => c !== 'wk');
  const subcases = [...EXPECTED_SUBCASES, ...(inReturn ? WAKE_SUBCASES_RETURN : WAKE_SUBCASES_DEFAULT)].sort();
  // Self-validating coverage: the fixture can never silently lose a channel.
  expect([...g.channels].sort()).toEqual(channels);
  // Strengthened coverage: every appended scenario's mandatory sub-cases were
  // actually OBSERVED (each tag is recorded only when its fact held), so a
  // regression or a removed scenario fails here.
  expect([...g.subcases].sort()).toEqual(subcases);
  return g.frames;
}

describe('golden frames — byte-identity gate for the perception refactor', () => {
  it('serializes every signal channel across observers and ticks, deterministically', () => {
    // Default grammar (silhouette/roster): this snapshot key predates the
    // radar realism cycle and MUST stay byte-identical (AC4).
    WORLD_OPTS = {};
    expect(runBattery()).toMatchSnapshot();
  });

  it('RETURN grammar (R6): the same battery under HC_RADAR_GRAMMAR=return semantics', () => {
    // Every scenario, prove(), and coverage assertion runs unchanged — only
    // the blip wire shape branches ({k,t,gx,gy,w,h,bits} since cycle 63: a
    // server-rasterized coverage footprint carrying no id at all). Its
    // own snapshot keeps the new path from rotting silently.
    WORLD_OPTS = { radarGrammar: 'return' };
    try {
      expect(runBattery()).toMatchSnapshot();
    } finally {
      WORLD_OPTS = {};
    }
  });
});

/** Every scenario in fixture order (extracted verbatim from the original
 *  single `it` — the ordering comments still govern). */
function runScenarios(g: Golden): void {
  scnSightSpawnBlip(g);
  scnCombat(g);
  scnPtBn(g);
  scnMines(g);
  scnSpectator(g);
  scnStraddleBoom(g);
  // Appended scenarios (must not disturb the six above or their snapshot rows).
  scnIslandLos(g);
  scnBallisticReveal(g);
  scnSpectatorBallistic(g);
  scnBurst(g);
  scnStarShell(g);
  scnZoneKill(g);
  scnMineBlast(g);
  scnMineBurstDetonation(g);
  scnDecoy(g);
  scnDenied(g);
  // Story 2.8 additions (appended KNOWINGLY — the snapshot regenerated with
  // the strip + deck economy; every earlier scenario's rows changed shape
  // through you.upg leaving and you.offer going deck-drawn).
  scnHoming(g);
  scnDebuffs(g);
  // Story 4.3 additions (appended KNOWINGLY — the snapshot regenerated with
  // the gunnery conversation: earlier scenarios' rows gain sp/hc/mz where
  // their existing shots always earned them; every other channel must stay
  // byte-identical).
  scnGunnery(g);
  scnGunneryDecoy(g);
  // PV 23 (the public register — snapshot regenerated KNOWINGLY): witnessed
  // `sunk` rows gain the trailing per-observer `seen: true`, and previously
  // absent sunk rows appear unseen where an observer is the credited killer
  // or the victim is a human captain. Every other channel must stay
  // byte-identical.
  // DAMAGE CONTROL addition (appended KNOWINGLY — the snapshot regenerated
  // with PV 24: every `you` row gains the required `repairHp` key, and this
  // scenario adds the self-private `heal` channel).
  scnHeal(g);
  // Story 4.12 addition (appended KNOWINGLY — the snapshot regenerated with
  // PV 32: this scenario adds the identity-free `wk` wake channel; every
  // earlier scenario's rows must stay byte-identical, since no prior world
  // ever lays wake — every ship in them is placed at speed 0).
  scnWake(g);
}
