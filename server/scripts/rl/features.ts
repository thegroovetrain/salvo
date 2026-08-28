// OBSERVATION FEATURIZATION for the RL environment (scaffold, 2026-08-24).
//
// Everything an agent sees flows through the SAME fogged perception boundary
// a human client is served (`perception.observe`), so the policy is honest by
// construction — it cannot learn from anything the anti-cheat chokepoint
// would not disclose. Own-ship fields come off the agent's own ShipRecord,
// exactly the self-knowledge OwnShip carries on the wire.
//
// LAYOUT IS A CONTRACT: the Python side indexes by FEATURE_DIM and the layout
// constants below. Change the layout only together with rl/README.md and bump
// FEATURE_VERSION so a stale learner fails loudly instead of training on
// scrambled inputs.

import { BOON_CATALOG, CONFIG, HEAL_CHOICE, type GameEvent } from '@salvo/shared';
import type { ShipRecord, World } from '../../src/game/world.js';
import type { PerceptionView } from '../../src/game/perception.js';

export const FEATURE_VERSION = 1;

/** Stable card index: catalog literal insertion order (deterministic). */
export const CARD_IDS: readonly string[] = Object.freeze(Object.keys(BOON_CATALOG));

export const K_CONTACTS = 8;
export const K_BLIPS = 6;
export const K_MINES = 4;
export const K_BUOYS = 2;

const OWN_DIMS = 15;
const ZONE_DIMS = 8;
const CONTACT_DIMS = 8;
const BLIP_DIMS = 4;
const MINE_DIMS = 4;
const BUOY_DIMS = 4;

export const FEATURE_DIM =
  OWN_DIMS +
  ZONE_DIMS +
  K_CONTACTS * CONTACT_DIMS +
  K_BLIPS * BLIP_DIMS +
  K_MINES * MINE_DIMS +
  K_BUOYS * BUOY_DIMS +
  CARD_IDS.length * 4 + // offer one-hot per hand slot
  CARD_IDS.length; // build (copies held / 5)

/** A remembered radar paint (rect centroid; the phosphor clock ages it out). */
export interface BlipMark {
  x: number;
  y: number;
  t: number; // server ms painted
}

/** Blip memory horizon — the client phosphor clock (wake/paint life). */
export const BLIP_MEMORY_MS = 12000;

/** Fold this tick's blip events into a rolling memory (newest kept). */
export function foldBlips(marks: BlipMark[], events: readonly GameEvent[], now: number): void {
  const cell = CONFIG.vision.radarCellU;
  for (const e of events) {
    if (e.k !== 'blip') continue;
    marks.push({ x: (e.gx + e.w / 2) * cell, y: (e.gy + e.h / 2) * cell, t: e.t });
  }
  let keep = 0;
  for (const m of marks) if (now - m.t <= BLIP_MEMORY_MS) marks[keep++] = m;
  marks.length = keep;
}

const clip = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Hull class code — a scalar the net can separate (players 0.4/0.7/1.0,
 *  fleet tiers small). */
function clsCode(cls: string): number {
  switch (cls) {
    case 'torpedoBoat': return 0.4;
    case 'battleship': return 1.0;
    case 'mineLayer': return 0.7;
    case 'droneSmall': return 0.1;
    case 'droneMedium': return 0.15;
    default: return 0.2;
  }
}

function writeOwn(out: Float32Array, at: number, me: ShipRecord, R: number): number {
  const s = me.state;
  out[at + 0] = s.x / R;
  out[at + 1] = s.y / R;
  out[at + 2] = Math.sin(s.heading);
  out[at + 3] = Math.cos(s.heading);
  out[at + 4] = s.speed / 50;
  out[at + 5] = me.stats.maxHp > 0 ? me.hp / me.stats.maxHp : 0;
  out[at + 6] = clip(me.bankedLevels / 5, 0, 1);
  out[at + 7] = clip(me.level / 20, 0, 1);
  out[at + 8] = clip(me.boons.length / 12, 0, 1);
  out[at + 9] = me.offer !== null ? 1 : 0;
  for (let i = 0; i < 4; i += 1) {
    const slot = me.loadout[i];
    const st = slot?.state ?? null;
    // Reload fraction: 0 = ready now; missing equipment reads 1 (never ready).
    out[at + 10 + i] = st === null ? 1 : clip(st.reloadMsLeft / 30000, 0, 1);
  }
  out[at + 14] = clip(me.kills / 10, 0, 1);
  return at + OWN_DIMS;
}

interface RingLike {
  cx: number;
  cy: number;
  r: number;
}

function writeZone(
  out: Float32Array,
  at: number,
  me: ShipRecord,
  cur: RingLike | null,
  next: RingLike | null,
  elapsedMs: number,
  R: number,
): number {
  if (cur !== null) {
    out[at + 0] = cur.cx / R;
    out[at + 1] = cur.cy / R;
    out[at + 2] = cur.r / R;
    const d = Math.hypot(me.state.x - cur.cx, me.state.y - cur.cy);
    out[at + 3] = clip((cur.r - d) / R, -1, 1); // + inside, − in the storm
  }
  if (next !== null) {
    out[at + 4] = next.cx / R;
    out[at + 5] = next.cy / R;
    out[at + 6] = next.r / R;
  }
  out[at + 7] = clip(elapsedMs / 960000, 0, 1);
  return at + ZONE_DIMS;
}

/** Nearest-K writer over positioned rows; each row writes `dims` floats via
 *  `write(row, base)` with slot 0 = presence already stamped. */
function writeNearest<T extends { x: number; y: number }>(
  out: Float32Array,
  at: number,
  rows: readonly T[],
  k: number,
  dims: number,
  me: ShipRecord,
  write: (row: T, base: number) => void,
): number {
  const sorted = [...rows].sort(
    (a, b) =>
      Math.hypot(a.x - me.state.x, a.y - me.state.y) - Math.hypot(b.x - me.state.x, b.y - me.state.y),
  );
  for (let i = 0; i < k; i += 1) {
    const base = at + i * dims;
    const row = sorted[i];
    if (row === undefined) continue; // absent rows stay zero (present = 0)
    out[base] = 1;
    write(row, base);
  }
  return at + k * dims;
}

export interface FeatureContext {
  view: PerceptionView;
  blipMarks: readonly BlipMark[];
  now: number;
  elapsedMs: number;
  cur: RingLike | null;
  next: RingLike | null;
}

/** The full observation vector for one agent. */
export function featurize(world: World, me: ShipRecord, ctx: FeatureContext): Float32Array {
  const R = world.map.radius;
  const out = new Float32Array(FEATURE_DIM);
  let at = writeOwn(out, 0, me, R);
  at = writeZone(out, at, me, ctx.cur, ctx.next, ctx.elapsedMs, R);
  at = writeNearest(out, at, ctx.view.contacts, K_CONTACTS, CONTACT_DIMS, me, (c, base) => {
    const dx = c.x - me.state.x;
    const dy = c.y - me.state.y;
    out[base + 1] = dx / R;
    out[base + 2] = dy / R;
    out[base + 3] = clip(Math.hypot(dx, dy) / R, 0, 2);
    const bearing = Math.atan2(dy, dx) - me.state.heading;
    out[base + 4] = Math.sin(bearing);
    out[base + 5] = Math.cos(bearing);
    out[base + 6] = c.speed / 50;
    out[base + 7] = clsCode(c.cls);
  });
  at = writeNearest(out, at, ctx.blipMarks, K_BLIPS, BLIP_DIMS, me, (b, base) => {
    out[base + 1] = (b.x - me.state.x) / R;
    out[base + 2] = (b.y - me.state.y) / R;
    out[base + 3] = clip((ctx.now - b.t) / BLIP_MEMORY_MS, 0, 1);
  });
  at = writeNearest(out, at, ctx.view.mines, K_MINES, MINE_DIMS, me, (m, base) => {
    out[base + 1] = (m.x - me.state.x) / R;
    out[base + 2] = (m.y - me.state.y) / R;
    out[base + 3] = m.own ? 1 : 0;
  });
  at = writeNearest(out, at, ctx.view.buoys, K_BUOYS, BUOY_DIMS, me, (b, base) => {
    out[base + 1] = (b.x - me.state.x) / R;
    out[base + 2] = (b.y - me.state.y) / R;
    out[base + 3] = b.own ? 1 : 0;
  });
  at = writeOffer(out, at, me);
  writeBuild(out, at, me);
  return out;
}

function writeOffer(out: Float32Array, at: number, me: ShipRecord): number {
  const offer = me.offer ?? [];
  for (let slot = 0; slot < 4; slot += 1) {
    const id = offer[slot];
    if (id === undefined) continue;
    const idx = CARD_IDS.indexOf(id);
    if (idx >= 0) out[at + slot * CARD_IDS.length + idx] = 1;
  }
  return at + CARD_IDS.length * 4;
}

function writeBuild(out: Float32Array, at: number, me: ShipRecord): number {
  for (const id of me.boons) {
    const idx = CARD_IDS.indexOf(id);
    if (idx >= 0) out[at + idx] = clip(out[at + idx] + 0.2, 0, 1); // copies / 5
  }
  return at + CARD_IDS.length;
}

export { HEAL_CHOICE };
