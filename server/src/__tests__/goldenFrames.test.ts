// GOLDEN FRAMES — the byte-identity gate for the perception refactor (Story
// 1.1). A deterministic seeded scenario drives world.step() through every
// signal channel — all 10 GameEvent kinds (blip, shell, torp, boom, dmg, sunk,
// spawn, upg, pt, heal) plus the contact and mine channels and a spectator
// frame — and JSON.stringify's each frame buildFrame() produces (JSON key
// insertion order == msgpack key order, which is load-bearing on the wire).
// The serialized array is committed as a Vitest snapshot: the later refactor of
// perception.ts must replay it byte-for-byte identically. NO Date.now() /
// Math.random() anywhere — every number here is a fixed seed or scripted input.

import { describe, it, expect } from 'vitest';
import { CONFIG, HEAL_CHOICE, type FrameMsg, type MatchPhase } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const TAU = Math.PI * 2;
const DT = CONFIG.tick.simDtMs;
const SIGHT = CONFIG.vision.sight;
// One tick's radar paint window width (rad) — a target at bearing δ/2 is painted
// by the first post-step window [0, δ).
const SWEEP_DELTA = (TAU * DT) / CONFIG.vision.sweepPeriod;

// The full set of channels the fixture MUST exercise: the 10 GameEvent kinds
// plus the two contact-like channels (contact/mine) and the spectator frame.
const EXPECTED_CHANNELS = [
  'blip', 'boom', 'contact', 'dmg', 'heal', 'mine',
  'pt', 'shell', 'spawn', 'spec', 'sunk', 'torp', 'upg',
];

// ---------- collector ---------------------------------------------------------

/** The growing golden fixture plus the self-validating channel-coverage set. */
interface Golden {
  frames: string[];
  channels: Set<string>;
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
    graceMs: CONFIG.gun.selfHitGrace,
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

// ---------- the fixture -------------------------------------------------------

describe('golden frames — byte-identity gate for the perception refactor', () => {
  it('serializes every signal channel across observers and ticks, deterministically', () => {
    const g: Golden = { frames: [], channels: new Set() };
    scnSightSpawnBlip(g);
    scnCombat(g);
    scnUpgHealPt(g);
    scnMines(g);
    scnSpectator(g);
    scnStraddleBoom(g);

    // Self-validating coverage: the fixture can never silently lose a channel.
    expect([...g.channels].sort()).toEqual(EXPECTED_CHANNELS);
    // The byte-identity gate itself: the committed snapshot pins every frame's
    // serialized form (JSON key order => msgpack key order on the wire).
    expect(g.frames).toMatchSnapshot();
  });
});
