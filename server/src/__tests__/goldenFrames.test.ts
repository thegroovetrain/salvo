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
// plus the four contact-like channels (contact/mine/litzone/decoy) and the
// spectator frame.
const EXPECTED_CHANNELS = [
  'blip', 'boom', 'burst', 'contact', 'decoy', 'denied', 'dmg', 'heal', 'litzone', 'mine',
  'pt', 'shell', 'spawn', 'spec', 'sunk', 'torp', 'upg',
];

// Targeted sub-cases the APPENDED scenarios (island LOS, non-owner + spectator
// ballistic reveals) must each prove. Recorded ONLY when the observed fact holds
// (see prove()), so a regression OR a commented-out scenario drops a tag and
// fails the sub-case coverage assertion — the "found-style boolean per mandatory
// sub-case" the straddle-boom check pioneered, generalized across the additions.
const EXPECTED_SUBCASES = [
  'decoy-expiry',
  'decoy-owner-truth-view',
  'decoy-thirdparty-swept-blip',
  'decoy-truesight-view',
  'denied-blocked-stern-drop',
  'denied-cooling-weapon',
  'denied-noammo-ability',
  'denied-out-of-arc-owner-only',
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
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 120, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
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
 * input channel: the shell flies to the clicked point (300u out — beyond the
 * firer's 220u sight) and bursts, spawning the 110u/10s zone. Captures pin
 * all four zone views in one deterministic pass: the FIRER's frame (zone
 * circle + the hidden hull `h` revealed as a full contact by owned-zone
 * truesight parity), a third party `c` sitting EXACTLY at radar range of the
 * zone center (the tagged {id,x,y,r,until,by} circle — boundary-inclusive —
 * and NO contact for `h`), a beyond-radar observer `d` whose frame stays
 * byte-free of the zone, and the FIRER again after natural expiry (zone gone,
 * `h` fogged once more). Intermediate flight ticks are stepped without frame
 * builds — the fixture pins the launch tick, the burst tick, and expiry.
 */
function scnStarShell(g: Golden): void {
  const w = bareWorld(1011);
  place(w, 'a', 0, 0, 0, 'battleship'); // the firer
  place(w, 'h', 300, 40, 1.1); // inside the future zone, beyond a's sight
  place(w, 'c', -330, -160); // dist to zone center (300,0) = 650 exactly — at radar range
  place(w, 'd', -400, 0); // dist to zone center = 700 — beyond radar
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: 2, fireT: 0, actSeq: 0, actSlot: 0 });
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
  w.litZones.set('z1', { id: 'z1', ownerId: 'a', x: 500, y: 0, r: CONFIG.starShells.litRadius, until: 999_999 });
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
 * Mine Layer trip blast (Story 1.8) — a REAL ability drop through the actSeq
 * channel: ML `a` drops a mine astern; enemies `b` (the tripper) and `c` sit
 * so the armed mine's 48u BLAST covers both hulls while `a`'s own hull is
 * inside the radius too (owner-excluded by rule). At the trip: ONE boom at the
 * mine with `hit` = the tripper, full damage to b AND c (each victim-private),
 * none to a. Captures pin the post-drop own-mine frame and the blast tick for
 * both the owner and the tripping victim.
 */
function scnMineBlast(g: Golden): void {
  const w = bareWorld(1013);
  const a = place(w, 'a', 0, 0, 0, 'mineLayer');
  const b = place(w, 'b', -76, 10); // hull over the future drop point — trips it
  const c = place(w, 'c', -76, -40); // second victim: hull within the 48u blast
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: 1 });
  w.step(); // the press drops the mine astern (ability channel)
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
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 300, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 });
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
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: 2 });
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
    fc.events.some((ev) => ev.k === 'blip' && ev.id === 'a' && ev.x === buoy.x && ev.y === buoy.y) &&
      (fc.decoys ?? []).length === 0,
  );
  // Truesight enemy: the buoy view (the lie unmasked), no blip.
  e.prevSweepAngle = Math.PI; // park the beam away from everything relevant
  e.sweepAngle = Math.PI + 0.0001;
  const fe = cap(g, w, 'e');
  prove(
    g,
    'decoy-truesight-view',
    (fe.decoys ?? []).some((d) => d.id === buoy.id) && !fe.events.some((ev) => ev.k === 'blip' && ev.id === 'a'),
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
 * press ('no-ammo'), and an island-backed ML stern drop ('blocked'). Denials
 * are SELF-PRIVATE: sighted observer `b` captures the same tick byte-free of
 * the channel. When a weapon click AND an ability press deny on the same
 * tick, the weapon denial rides first (fireControl runs before
 * activationControl — the step order is the wire order).
 */
function scnDenied(g: Golden): void {
  const w = bareWorld(1016);
  place(w, 'a', 0, 0, 0); // TB: gun / torpedo / speedBoost
  place(w, 'b', 120, 0); // sighted second captain — proves owner-only
  const m = place(w, 'm', 400, 0, 0, 'mineLayer'); // stern rack drops at (324, 0)
  w.map.islands.push({ x: 324, y: 0, r: 20 }); // the rock behind m's stern
  // Tick 1: a clicks the torpedo dead astern; m presses its mine into the rock.
  w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 0, slot: 1, fireT: 0, actSeq: 0, actSlot: 0 });
  w.submitInput('m', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: 1 });
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
  prove(g, 'denied-blocked-stern-drop', (fm1.denied ?? []).some((d) => d.reason === 'blocked') && w.mines.size === 0);
  // Tick 2: a fires the gun (spends the round) + activates the boost (spends the charge).
  w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 2, aimDist: 100, slot: 0, fireT: 0, actSeq: 1, actSlot: 2 });
  w.step();
  cap(g, w, 'a'); // no denial: the shell reveal + a clean frame
  // Tick 3: both channels re-press against their empty pools.
  w.submitInput('a', { seq: 3, throttle: 0, rudder: 0, aim: 0, fireSeq: 3, aimDist: 100, slot: 0, fireT: 0, actSeq: 2, actSlot: 2 });
  w.step();
  const fa3 = cap(g, w, 'a');
  prove(g, 'denied-cooling-weapon', (fa3.denied ?? [])[0]?.reason === 'cooling' && (fa3.denied ?? [])[0]?.seq === 3);
  prove(g, 'denied-noammo-ability', (fa3.denied ?? [])[1]?.reason === 'no-ammo' && (fa3.denied ?? [])[1]?.slot === 2);
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
    scnStarShell(g);
    scnZoneKill(g);
    scnMineBlast(g);
    scnMineBurstDetonation(g);
    scnDecoy(g);
    scnDenied(g);

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
