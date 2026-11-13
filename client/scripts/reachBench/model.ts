// THE REACH BENCH (Story 11.2, Phase A) — the model: every dial, its default
// and the plain-number readouts. Pure over the page state; no DOM.
//
// DEFAULTS. The tidy hectometer figures are Eric's rulings R1–R5 (the spec);
// everything "today's" is read from the live CONFIG, and a shell reach that
// has no ruling yet is today's reach scaled by 380 hm ÷ today's main-battery
// reach (one ratio, computed here — never a literal).

import { CONFIG, SHIP_CLASS_IDS, effectiveStats, hmToU, uToHm, type HullId, type Vec2 } from '@salvo/shared';

export type ReachKey =
  | 'radar' | 'main' | 'hullSight' | 'classSight' | 'secondaries' | 'starShells' | 'phosphor' | 'fouling' | 'flash'
  | 'muzzle' | 'shellsSeen' | 'splashSeen' | 'torpSeen' | 'mineSeen' | 'crateKind' | 'foghorn' | 'litRadius';

export type TorpKind = 'heavy' | 'light' | 'supercav';

export interface ReachDial {
  key: ReachKey;
  label: string;
  /** A short plain-words note under the dial (optional). */
  note?: string;
  color: string;
  /** Default in hm. */
  hm: number;
  max: number;
  /** Ring on by default. */
  on: boolean;
  group: 'Sensors and guns' | 'Shells' | 'Seen by eye' | 'Other';
}

const TODAY_MAIN_U = CONFIG.mainBattery.rangeU;
const RULED_MAIN_HM = 380;
/** Today's reach → the 380 hm world (one ratio for every unruled shell). */
const SHELL_SCALE = hmToU(RULED_MAIN_HM) / TODAY_MAIN_U;
const scaledHm = (todayU: number): number => Math.round(uToHm(todayU * SHELL_SCALE));

const HULL_SIGHT_HM = 350;
const CLASS_SIGHT_HM = 200;
const RADAR_HM = 400;

export const DIALS: ReachDial[] = [
  { key: 'radar', label: 'Radar', color: '#c0c0c0', hm: RADAR_HM, max: 480, on: true, group: 'Sensors and guns' },
  { key: 'main', label: 'Main battery (base, before the hull)', color: '#ffb800', hm: RULED_MAIN_HM, max: 480, on: true, group: 'Sensors and guns', note: 'The ring is drawn at the picked hull’s reach.' },
  { key: 'secondaries', label: 'Secondaries', color: '#f59e0b', hm: Math.round(RULED_MAIN_HM * CONFIG.secondaries.rangeFrac), max: 480, on: true, group: 'Sensors and guns', note: `Default: half the main battery, today’s rule (${CONFIG.secondaries.rangeFrac}).` },
  { key: 'hullSight', label: 'Sight: whole hull (no class, no name)', color: '#00ff88', hm: HULL_SIGHT_HM, max: 400, on: true, group: 'Sensors and guns' },
  { key: 'classSight', label: 'Sight: class and name', color: '#7fffc4', hm: CLASS_SIGHT_HM, max: 400, on: true, group: 'Sensors and guns' },
  { key: 'starShells', label: 'Star shells', color: '#ffffff', hm: scaledHm(CONFIG.starShells.rangeU), max: 600, on: false, group: 'Shells', note: 'Default: today’s tier I reach scaled to the 380 hm main battery.' },
  { key: 'phosphor', label: 'Phosphor shells', color: '#fb923c', hm: scaledHm(CONFIG.phosphorShells.rangeU), max: 600, on: false, group: 'Shells', note: 'Default: today’s tier I reach scaled to the 380 hm main battery.' },
  { key: 'fouling', label: 'Fouling shell', color: '#a3e635', hm: scaledHm(CONFIG.foulingShell.rangeU), max: 600, on: false, group: 'Shells', note: 'Default: today’s reach scaled to the 380 hm main battery.' },
  { key: 'flash', label: 'Flash shells', color: '#e9d5ff', hm: scaledHm(CONFIG.foulingShell.rangeU), max: 600, on: false, group: 'Shells', note: 'Today flash shells take the fouling shell’s reach; scaled the same way.' },
  { key: 'muzzle', label: 'Muzzle flash and wounded smoke seen from', color: '#ff6666', hm: HULL_SIGHT_HM, max: 480, on: false, group: 'Seen by eye', note: `Ruled at ${Math.round(uToHm(CONFIG.vision.muzzleFlash))} hm (R18); the default here equals whole-hull sight.` },
  { key: 'shellsSeen', label: 'Shells in flight seen from', color: '#38bdf8', hm: CLASS_SIGHT_HM, max: 400, on: false, group: 'Seen by eye', note: 'Default: class-and-name sight.' },
  { key: 'splashSeen', label: 'Splashes, bursts and sinkings seen from', color: '#66ffaa', hm: HULL_SIGHT_HM, max: 400, on: false, group: 'Seen by eye', note: 'Default: whole-hull sight.' },
  { key: 'torpSeen', label: 'Torpedoes seen from', color: '#fff04d', hm: 15, max: 100, on: false, group: 'Seen by eye' },
  { key: 'mineSeen', label: 'Mines seen from', color: '#ff4fa3', hm: 3, max: 50, on: false, group: 'Seen by eye' },
  { key: 'crateKind', label: 'Airdrop crate: which kind it is, seen from', color: '#d9b8ff', hm: 15, max: 100, on: false, group: 'Seen by eye' },
  { key: 'foghorn', label: 'Foghorn heard from', color: '#b06ee8', hm: RADAR_HM, max: 480, on: false, group: 'Other', note: 'Default: radar reach, today’s rule.' },
  { key: 'litRadius', label: 'Star shell: lit circle radius', color: '#ffffff', hm: Math.round(uToHm(CONFIG.starShells.litRadius)), max: 100, on: false, group: 'Other', note: 'Default: today’s lit radius in hm. Drawn around the ship to show its size.' },
];

export interface TorpDial {
  kind: TorpKind;
  label: string;
  color: string;
  speedUps: number;
  tierI: number;
  tierV: number;
}

export const TORPS: TorpDial[] = [
  { kind: 'heavy', label: 'Heavy torpedo', color: '#fde047', speedUps: CONFIG.torpedo.speed, tierI: 55, tierV: 140 },
  { kind: 'light', label: 'Light torpedo', color: '#facc15', speedUps: CONFIG.lightTorpedo.speed, tierI: 55, tierV: 140 },
  { kind: 'supercav', label: 'Supercavitating torpedo', color: '#eab308', speedUps: CONFIG.supercavTorpedo.speed, tierI: 55, tierV: 140 },
];

export const TIERS = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Run (hm) at tier index 0..4, linear from tier I to tier V. */
export function tierRunHm(t: { tierI: number; tierV: number }, tier: number): number {
  return t.tierI + ((t.tierV - t.tierI) * tier) / (TIERS.length - 1);
}

/** The hull's main-battery reach ratio — its battery's `reachFrac` (Story 11.2, R2; was the RANGE index over the base index). */
export function hullRatio(id: HullId): number {
  return CONFIG.shipClasses[id].battery.reachFrac;
}

export interface BenchState {
  seed: number;
  ship: Vec2;
  heading: number;
  hull: HullId;
  hm: Record<ReachKey, number>;
  on: Record<ReachKey, boolean>;
  torps: Record<TorpKind, { tierI: number; tierV: number; on: boolean }>;
}

export function defaultState(): BenchState {
  const hm = {} as Record<ReachKey, number>;
  const on = {} as Record<ReachKey, boolean>;
  for (const d of DIALS) {
    hm[d.key] = d.hm;
    on[d.key] = d.on;
  }
  const torps = {} as BenchState['torps'];
  for (const t of TORPS) torps[t.kind] = { tierI: t.tierI, tierV: t.tierV, on: false };
  return { seed: SEEDS[0], ship: { x: 0, y: 0 }, heading: 0, hull: SHIP_CLASS_IDS[0], hm, on, torps };
}

/** A few fixed seeds to page through. */
export const SEEDS = [1, 2, 3, 7, 42, 1234, 2026, 31337];

/** The ring radius in u for one dial (the main battery follows the picked hull). */
export function ringU(s: BenchState, key: ReachKey): number {
  const base = hmToU(s.hm[key]);
  return key === 'main' ? base * hullRatio(s.hull) : base;
}

/** The spawn ring's evenly spaced points, one per player slot (phase 0 on this page). */
export function spawnPoints(spawnRing: number): Vec2[] {
  const n = CONFIG.map.playerCap;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: Math.cos(a) * spawnRing, y: Math.sin(a) * spawnRing });
  }
  return out;
}

/** Spawn points other than the one the ship sits on (within 1 u) inside `rU`. */
export function spawnsInside(points: readonly Vec2[], ship: Vec2, rU: number): { inside: number; of: number } {
  const others = points.filter((p) => Math.hypot(p.x - ship.x, p.y - ship.y) > 1);
  return { inside: others.filter((p) => Math.hypot(p.x - ship.x, p.y - ship.y) <= rU).length, of: others.length };
}

const METERS_PER_NAUTICAL_MILE = 1852;
const SECONDS_PER_HOUR = 3600;
const REAL_FAST_KNOTS = 33;

/** A real 33-knot hull on this ruler, in u/s. */
export function realHullUps(): number {
  const hmPerS = (REAL_FAST_KNOTS * METERS_PER_NAUTICAL_MILE) / SECONDS_PER_HOUR / 100;
  return hmToU(hmPerS);
}

/** The fastest hull's real top speed in the game (u/s), from the real stat fold. */
export function fastestHull(): { id: HullId; ups: number } {
  let best = { id: SHIP_CLASS_IDS[0], ups: 0 };
  for (const id of SHIP_CLASS_IDS) {
    const ups = effectiveStats(CONFIG.shipClasses[id]).kinematics.maxSpeed;
    if (ups > best.ups) best = { id, ups };
  }
  return best;
}

export const REAL_KNOTS = REAL_FAST_KNOTS;

export interface Readouts {
  mainFlightS: number;
  secFlightS: number;
  hullReachU: number;
  spawnsInRadar: number;
  spawnsInGun: number;
  spawnsInSight: number;
  spawnsOf: number;
  realUps: number;
  gameUps: number;
  compression: number;
}

export function readouts(s: BenchState, spawns: readonly Vec2[]): Readouts {
  const hullReachU = ringU(s, 'main');
  const fast = fastestHull();
  const radar = spawnsInside(spawns, s.ship, ringU(s, 'radar'));
  const realUps = realHullUps();
  return {
    mainFlightS: hullReachU / CONFIG.mainBattery.shellSpeed,
    secFlightS: ringU(s, 'secondaries') / CONFIG.secondaries.shellSpeed,
    hullReachU,
    spawnsInRadar: radar.inside,
    spawnsInGun: spawnsInside(spawns, s.ship, hullReachU).inside,
    spawnsInSight: spawnsInside(spawns, s.ship, ringU(s, 'hullSight')).inside,
    spawnsOf: radar.of,
    realUps,
    gameUps: fast.ups,
    compression: fast.ups / realUps,
  };
}

/** The "nice" hectometer steps a range-ring spacing may take (data, not logic). */
export const RING_SERIES_HM = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
/** Aim for this many rings on screen (4–6 band). */
const RINGS_TARGET = 5;

/**
 * Range-ring spacing that FOLLOWS ZOOM: the series step that puts the number
 * of rings reaching the screen (out to the far corner) closest to five; a tie
 * takes the wider step.
 */
export function ringSpacingHm(halfLongHm: number): number {
  let best = RING_SERIES_HM[0];
  let bestErr = Infinity;
  for (const step of RING_SERIES_HM) {
    const err = Math.abs(Math.floor(halfLongHm / step) - RINGS_TARGET);
    if (err <= bestErr) {
      best = step;
      bestErr = err;
    }
  }
  return best;
}

/** Every dial as one JSON blob for Eric to paste back. */
export function numbersJson(s: BenchState, extra: Record<string, unknown>): string {
  const torps = Object.fromEntries(
    TORPS.map((t) => [t.kind, { tierI_hm: s.torps[t.kind].tierI, tierV_hm: s.torps[t.kind].tierV }]),
  );
  return JSON.stringify({ seed: s.seed, hull: s.hull, reaches_hm: { ...s.hm }, torpedoRun: torps, ...extra }, null, 2);
}
