// Deterministic map generation. From a seed + player cap, produces the map
// radius, a spawn ring, and island clusters (circles). The client regenerates
// the identical map from `mapSeed` so islands need not travel on the wire.
//
// Ship-island collision resolution lives in a later step; this only builds the
// obstacle field and guarantees it respects the spawn ring + spacing rules.

import { mapRadius, CONFIG } from '../constants.js';
import { mulberry32, type Rng } from '../math/rng.js';
import type { Circle } from '../types.js';

const TAU = Math.PI * 2;

const MIN_CLUSTERS = 4;
const MAX_CLUSTERS = 7;
const MIN_CIRCLES = 2;
const MAX_CIRCLES = 4;
const MIN_R = 25; // u — smallest island circle
const MAX_R = 70; // u — largest island circle
const SEPARATION = 15; // u — min gap between island circles
const SPAWN_MARGIN = 40; // u — min clearance from the spawn ring
const INNER_FRACTION = 0.15; // no islands within this fraction of center
const OUTER_FRACTION = 0.9; // islands stay inside this fraction of radius
const CLUSTER_SPREAD = 60; // u — jitter of circles around a cluster anchor
const MAX_ATTEMPTS = 12; // placement retries per circle

/** A generated map: radius, spawn ring radius, and island obstacle circles. */
export interface GameMap {
  radius: number; // u
  spawnRing: number; // u — radius of the ship spawn ring
  islands: Circle[];
}

function distToCenter(x: number, y: number): number {
  return Math.hypot(x, y);
}

function fitsInMap(c: Circle, radius: number): boolean {
  return distToCenter(c.x, c.y) + c.r <= radius * OUTER_FRACTION;
}

function clearsCenter(c: Circle, radius: number): boolean {
  return distToCenter(c.x, c.y) - c.r >= radius * INNER_FRACTION;
}

function clearsSpawnRing(c: Circle, spawnRing: number): boolean {
  return Math.abs(distToCenter(c.x, c.y) - spawnRing) >= c.r + SPAWN_MARGIN;
}

function clearsOthers(c: Circle, placed: readonly Circle[]): boolean {
  return placed.every(
    (p) => Math.hypot(c.x - p.x, c.y - p.y) >= c.r + p.r + SEPARATION,
  );
}

function isValid(c: Circle, placed: readonly Circle[], radius: number, spawnRing: number): boolean {
  return (
    fitsInMap(c, radius) &&
    clearsCenter(c, radius) &&
    clearsSpawnRing(c, spawnRing) &&
    clearsOthers(c, placed)
  );
}

/** Attempt to place one circle near (ax, ay); pushes to `islands` on success. */
function tryPlaceNear(
  rng: Rng,
  islands: Circle[],
  ax: number,
  ay: number,
  radius: number,
  spawnRing: number,
): void {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const c: Circle = {
      x: ax + rng.float(-CLUSTER_SPREAD, CLUSTER_SPREAD),
      y: ay + rng.float(-CLUSTER_SPREAD, CLUSTER_SPREAD),
      r: rng.float(MIN_R, MAX_R),
    };
    if (isValid(c, islands, radius, spawnRing)) {
      islands.push(c);
      return;
    }
  }
}

/** Place one cluster of 2-4 circles around a seeded anchor point. */
function placeCluster(rng: Rng, islands: Circle[], radius: number, spawnRing: number): void {
  const count = rng.int(MIN_CIRCLES, MAX_CIRCLES);
  const angle = rng.float(0, TAU);
  const anchorDist = rng.float(radius * INNER_FRACTION + MAX_R, radius * OUTER_FRACTION - MAX_R);
  const ax = Math.cos(angle) * anchorDist;
  const ay = Math.sin(angle) * anchorDist;
  for (let j = 0; j < count; j++) {
    tryPlaceNear(rng, islands, ax, ay, radius, spawnRing);
  }
}

/**
 * Generate the map for `seed` and `playerCap`. Deterministic: identical seed +
 * cap always yields a deep-equal map. Every island fits inside the map, avoids
 * the center exclusion zone, clears the spawn ring, and is spaced from others.
 */
export function generateMap(seed: number, playerCap: number = CONFIG.map.playerCap): GameMap {
  const radius = mapRadius(playerCap);
  const spawnRing = radius * CONFIG.map.spawnFraction;
  const rng = mulberry32(seed);
  const islands: Circle[] = [];
  const clusters = rng.int(MIN_CLUSTERS, MAX_CLUSTERS);
  for (let i = 0; i < clusters; i++) {
    placeCluster(rng, islands, radius, spawnRing);
  }
  return { radius, spawnRing, islands };
}

/** Constants describing island placement constraints (exposed for tests). */
export const MAP_RULES = {
  INNER_FRACTION,
  OUTER_FRACTION,
  SEPARATION,
  SPAWN_MARGIN,
  MIN_R,
  MAX_R,
} as const;
