// Canvas plumbing for the dispersion bench: crisp sizing and a world→screen view.

import type { Vec2 } from '@salvo/shared';

export interface View {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** px per u. */
  scale: number;
  /** Screen position of world (0, 0) — the aim point. */
  cx: number;
  cy: number;
}

/** Size the canvas to its CSS box at device resolution; returns a ready context. */
export function fit(canvas: HTMLCanvasElement, aspect: number, maxH: number): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, Math.min(Math.round(w * aspect), maxH));
  canvas.style.height = `${h}px`;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('dispersion bench: no 2d context');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function sx(v: View, x: number): number {
  return v.cx + x * v.scale;
}

export function sy(v: View, y: number): number {
  return v.cy + y * v.scale;
}

/** Screen → world. */
export function toWorld(v: View, px: number, py: number): Vec2 {
  return { x: (px - v.cx) / v.scale, y: (py - v.cy) / v.scale };
}

/** Trace an axis-aligned ellipse (semi-axes in u) centered on a world point. */
export function ellipsePath(v: View, c: Vec2, a: number, b: number): void {
  v.ctx.beginPath();
  v.ctx.ellipse(sx(v, c.x), sy(v, c.y), Math.max(a * v.scale, 0.5), Math.max(b * v.scale, 0.5), 0, 0, Math.PI * 2);
}

export function circlePath(v: View, c: Vec2, r: number): void {
  v.ctx.beginPath();
  v.ctx.arc(sx(v, c.x), sy(v, c.y), Math.max(r * v.scale, 0.5), 0, Math.PI * 2);
}

export function polyPath(v: View, poly: readonly Vec2[]): void {
  v.ctx.beginPath();
  poly.forEach((p, i) => (i === 0 ? v.ctx.moveTo(sx(v, p.x), sy(v, p.y)) : v.ctx.lineTo(sx(v, p.x), sy(v, p.y))));
  v.ctx.closePath();
}

/** A CSS custom property from :root (theme-aware). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** A "nice" scale-bar length (1, 2, 5 × 10^k u) near `target` u. */
export function niceLength(target: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(target, 1e-6)));
  const m = target / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}
