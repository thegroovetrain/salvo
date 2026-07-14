// Plain 2D vector math over `{ x, y }` objects.
// All ops are pure (return a fresh vector) unless noted. Units: world units (u).

/** A 2D point / vector in world space. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Component-wise sum a + b. */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Component-wise difference a - b. */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Scale a vector by a scalar. */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Euclidean length |v|. */
export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** Squared length |v|^2 (cheap; avoids the sqrt). */
export function len2(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

/** Euclidean distance between two points. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Squared distance between two points (cheap; avoids the sqrt). */
export function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Dot product a . b. */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Unit vector in the direction of v. Returns {0,0} for the zero vector (safe). */
export function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l === 0) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

/** Unit vector pointing at `angle` radians (length `mag`, default 1). */
export function fromAngle(angle: number, mag = 1): Vec2 {
  return { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
}
