// MULTI-SPECTRAL COUNTERMEASURE cloud geometry (Story 9.3; Eric rulings
// 2026-10-11, epic-9 amendments 40–47) — THE one pixel function for a cloud,
// run by BOTH sides. A cloud is `CONFIG.countermeasure.pixels` pixels whose
// birth offsets and death ages are a pure seeded function of the cloud's id;
// their positions at any age are those offsets scaled outward (bearing kept).
// The server's predicates evaluate it at the tick's `now`; the client
// evaluates it from the wire `t0` (CloudView) and its server-clock estimate.
// Because the function is shared and deterministic, ONLY {id,x,y,t0} rides
// the wire — never pixels, a count, a radius, an owner or an expiry.
//
// NO TRANSCENDENTALS in this file (the map-gen posture): the unit disc is
// rejection-sampled from the integer `mulberry32` stream, so every JS engine
// produces bit-identical pixels. Callers memo `cloudBase(id)` per cloud.
//
// Not wounded smoke: `CONFIG.smoke` (the damage-band plume) is a different
// thing entirely; this module reads only `CONFIG.countermeasure`. Pure, zero
// I/O, plain objects.

import { CONFIG } from '../constants.js';
import { segCircleHit } from '../math/geom.js';
import { mulberry32 } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import { hashSeedText } from './seedText.js';

/**
 * One countermeasure cloud — the SERVER store record (ids `cl${n}`).
 * Stationary for its whole life: made at the hull's centre at `bornAt`,
 * deleted at `until` (= bornAt + CONFIG.countermeasure.lifeMs). It outlives
 * its owner. Never sent as-is: the wire shape is `CloudView` (types.ts).
 */
export interface CloudRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly x: number; // u — cloud centre
  readonly y: number; // u
  readonly bornAt: number; // ms — server time the cloud was made
  readonly until: number; // ms — server time the cloud is removed
}

/**
 * A cloud's per-pixel constants — `pixels` entries each. `ox`/`oy` is the
 * pixel's birth offset from the centre (inside `r0`), `dieAt` its death AGE
 * in ms (in [dieMinMs, dieMaxMs)).
 */
export interface CloudBase {
  readonly ox: Float64Array;
  readonly oy: Float64Array;
  readonly dieAt: Float64Array;
}

/** The minimal cloud shape the predicates read (a CloudRecord fits). */
export interface CloudPlace {
  readonly x: number;
  readonly y: number;
  readonly bornAt: number;
}

/** A deterministic uint32 seed from a cloud id (FNV-1a, integer only). */
export function cloudSeed(id: string): number {
  return hashSeedText(id);
}

/**
 * The cloud's pixel constants — a pure function of `id`. Draw order is fixed
 * per pixel: the offset's rejection samples first, then its death age, so the
 * stream is reproducible on every engine.
 */
export function cloudBase(id: string): CloudBase {
  const { pixels, r0, dieMinMs, dieMaxMs } = CONFIG.countermeasure;
  const rng = mulberry32(cloudSeed(id));
  const ox = new Float64Array(pixels);
  const oy = new Float64Array(pixels);
  const dieAt = new Float64Array(pixels);
  for (let i = 0; i < pixels; i++) {
    let dx = 0;
    let dy = 0;
    do {
      dx = rng.next() * 2 - 1;
      dy = rng.next() * 2 - 1;
    } while (dx * dx + dy * dy > 1);
    ox[i] = dx * r0;
    oy[i] = dy * r0;
    dieAt[i] = dieMinMs + rng.next() * (dieMaxMs - dieMinMs);
  }
  return { ox, oy, dieAt };
}

/** The outward scale at `ageMs`: 1 at birth, r1/r0 at `lifeMs`, clamped. */
export function cloudScale(ageMs: number): number {
  const { r0, r1, lifeMs } = CONFIG.countermeasure;
  const f = Math.min(1, Math.max(0, ageMs / lifeMs));
  return 1 + (r1 / r0 - 1) * f;
}

/** u — the cloud's outline (envelope circle) radius at `ageMs`. */
export function cloudOutlineRadius(ageMs: number): number {
  return CONFIG.countermeasure.r0 * cloudScale(ageMs);
}

/** True iff pixel `i` is still alive at `ageMs`. */
export function pixelAlive(base: CloudBase, i: number, ageMs: number): boolean {
  return ageMs < base.dieAt[i];
}

/** How many pixels are alive at `ageMs`. */
export function livingPixelCount(base: CloudBase, ageMs: number): number {
  let n = 0;
  for (let i = 0; i < base.dieAt.length; i++) if (ageMs < base.dieAt[i]) n++;
  return n;
}

/**
 * Calls `fn(x, y, i)` for every pixel alive at `ageMs`, at its world position
 * (centre + birth offset × `cloudScale(ageMs)`). Allocates nothing.
 */
export function forEachLivingPixel(
  base: CloudBase,
  cx: number,
  cy: number,
  ageMs: number,
  fn: (x: number, y: number, i: number) => void,
): void {
  const s = cloudScale(ageMs);
  const { ox, oy, dieAt } = base;
  for (let i = 0; i < dieAt.length; i++) {
    if (ageMs < dieAt[i]) fn(cx + ox[i] * s, cy + oy[i] * s, i);
  }
}

/** True iff `p` lies inside (or on) the cloud's outline at server time `now`. */
export function pointInCloud(p: Vec2, cloud: CloudPlace, now: number): boolean {
  const r = cloudOutlineRadius(now - cloud.bornAt);
  const dx = p.x - cloud.x;
  const dy = p.y - cloud.y;
  return dx * dx + dy * dy <= r * r;
}

/** Scratch point reused by `cloudBlocks` (no allocation per pixel). */
const scratch = { x: 0, y: 0 };

/**
 * True iff the segment a→b crosses the footprint (`footprintU`) of any pixel
 * of `cloud` alive at server time `now`. A dead cloud (age ≥ lifeMs) blocks
 * nothing; a segment missing the outline + footprint is rejected before any
 * pixel is tested.
 */
export function cloudBlocks(a: Vec2, b: Vec2, cloud: CloudPlace, base: CloudBase, now: number): boolean {
  const { lifeMs, footprintU } = CONFIG.countermeasure;
  const age = now - cloud.bornAt;
  if (age >= lifeMs) return false;
  if (segCircleHit(a, b, cloud, cloudOutlineRadius(age) + footprintU) === null) return false;
  const s = cloudScale(age);
  const { ox, oy, dieAt } = base;
  for (let i = 0; i < dieAt.length; i++) {
    if (age >= dieAt[i]) continue;
    scratch.x = cloud.x + ox[i] * s;
    scratch.y = cloud.y + oy[i] * s;
    if (segCircleHit(a, b, scratch, footprintU) !== null) return true;
  }
  return false;
}
